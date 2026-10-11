/* Adaptador puro de tablas pegadas para los casos de Finora.
   analyze no guarda; buildCase valida y devuelve una copia. La interfaz decide cuándo guardarla. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const F = node ? require('./finance.js') : root.Finance;
  const Reader = node ? require('./table-import.js') : root.FinoraTableImporter;
  const SIDES = ['previous', 'current'];
  const BLOCKS = [
    { section: 'asset', term: 'current', group: 'Activos circulantes' },
    { section: 'asset', term: 'noncurrent', group: 'Activos no circulantes' },
    { section: 'liability', term: 'current', group: 'Pasivo de corto plazo' },
    { section: 'liability', term: 'noncurrent', group: 'Pasivo de largo plazo' },
    { section: 'equity', term: null, group: 'Capital' }
  ];
  const CATEGORIES = ['sales','costSales','opex','otherIncome','interest','taxes','taxRate','preferred','creditSales','fixedCosts','fixedCostSales','creditPurchases','shares'];
  const PARTS = { currentAssets: 0, nonCurrentAssets: 1, currentLiabilities: 2, nonCurrentLiabilities: 3, equity: 4 };
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const stripName = name => String(name ?? '').replace(/^\s*(?:\((?:-|\+)\)|(?:menos|mas|más|less|plus)\b)\s*[:.-]?\s*/i, '').replace(/\.+$/, '').trim();
  const blockFor = row => BLOCKS.find(b => b.section === row.section && (row.section === 'equity' || b.term === row.term));
  const groupFor = row => String(row.group || blockFor(row)?.group || '').trim();
  const hasData = rows => (rows || []).some(row => SIDES.some(side => number(row.amounts?.[side])));
  const completeClass = (kind, row) => kind === 'income' ? CATEGORIES.includes(row.category) : BLOCKS.some(b => b.section === row.section && (row.section === 'equity' || row.term === b.term));

  // Vacío -> null; inválido -> NaN. El parser nunca cambia un texto ilegible por cero.
  function parseAmount(text) {
    if (text === null || text === undefined || String(text).trim() === '') return null;
    if (typeof text === 'number') return Number.isFinite(text) && Math.abs(text) <= 1e15 ? text : NaN;
    const token = String(text).trim().replace(/^([.,])(?=\d)/, '0$1');
    return Reader.parseAmount(token)?.value ?? NaN;
  }

  // Moneda y escala que declara el encabezado («U$ Miles», «en miles de córdobas»). Los importes nunca se multiplican.
  function detectUnits(source, scaleHint) {
    const head = source.split(/\r?\n/).slice(0, 8).join(' ');
    const currency = /(?:^|[^a-z])(?:u\$|us\$|usd|d[oó]lares)/i.test(head) ? 'U$' : /(?:^|[^a-z])(?:c\$|nio|c[oó]rdobas)/i.test(head) ? 'C$' : /€|(?:^|[^a-z])euros?(?![a-z])/i.test(head) ? '€' : null;
    const scale = scaleHint || (/(?:^|[^a-z])miles(?![a-z])/i.test(head) ? 'miles' : /(?:^|[^a-z])millones(?![a-z])/i.test(head) ? 'millones' : null);
    return currency || scale ? { currency, scale } : null;
  }

  function headerContext(name) {
    const n = norm(name).replace(/[:.]+$/, '');
    if (/^(total|suma|subtotal)\b/.test(n)) return null;
    if (/^otros activos$/.test(n)) return { ...BLOCKS[1], group: 'Otros activos' };
    if (/^(capital|capital contable|patrimonio|patrimonio de los accionistas)$/.test(n)) return { ...BLOCKS[4] };
    if (/^(activos?|pasivos?)(?:\s|$)/.test(n)) {
      const section = n.startsWith('activo') ? 'asset' : 'liability';
      const term = /no corriente|no circulante|largo plazo|fijos/.test(n) ? 'noncurrent' : /corriente|circulante|corto plazo/.test(n) ? 'current' : null;
      return term ? { ...BLOCKS.find(b => b.section === section && b.term === term) } : { section, term: null, group: null };
    }
    return null;
  }

  function analyze(text, options = {}) {
    const kind = options.kind === 'income' ? 'income' : 'balance';
    const source = String(text ?? '').replace(/\u0000/g, '');
    const parsed = Reader.analyze(source, { kind });
    const draft = {
      version: 1, kind, mode: options.mode === 'append' ? 'append' : 'replace',
      context: clone(options.context || {}), periods: { previous: String(options.periods?.previous || ''), current: String(options.periods?.current || '') },
      years: parsed.years, columns: parsed.columns, rows: [], totals: [], reported: {},
      notes: [], issues: [], unitsHint: parsed.unitsHint,
      units: detectUnits(source, parsed.unitsHint), applyUnits: false
    };
    const globalIssue = (code, message, severity = 'error') => draft.issues.push({ code, message, severity });
    if (!['balance', 'income', undefined].includes(options.kind)) globalIssue('kind', 'El estado debe ser balance o resultados.');
    if (source.length > 500000) globalIssue('size', 'La tabla supera 500 000 caracteres; pega sólo el estado que deseas importar.');
    if (parsed.years.length > 2) globalIssue('columns', 'La tabla tiene más de dos años. Pega solamente los dos períodos que deseas comparar.');
    if (parsed.yearFor[0] != null) draft.periods.previous = String(parsed.yearFor[0]);
    if (parsed.yearFor[1] != null) draft.periods.current = String(parsed.yearFor[1]);
    if (parsed.years.length === 1) draft.periods.current = String(parsed.years[0]);
    if (parsed.orderAssumed) draft.notes.push('No hay años en la tabla: se usa anterior y luego actual. Revisa los años antes de aplicar.');
    if (draft.mode === 'append') draft.notes.push('Las cuentas se añadirán al estado. Los totales pegados no reemplazan las comprobaciones existentes.');
    const contexts = new Map(), sourceRows = new Map();
    let context = options.context?.block != null ? { ...BLOCKS[options.context.block], ...(options.context.group ? { group: String(options.context.group) } : {}) } : null;
    source.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const record = Reader.splitLine(line); sourceRows.set(index + 1, record);
      const noAmounts = !record.amounts.some(a => a.value !== null);
      const next = noAmounts && !record.amounts.some(a => a.invalid) ? headerContext(record.name) : null;
      if (next) context = next;
      contexts.set(index + 1, context ? { ...context } : null);
      if (record.amounts.length > 2 && !parsed.years.includes(record.amounts[0]?.value)) globalIssue('columns', `Línea ${index + 1}: hay más de dos columnas. Pega Cuenta y los dos años solamente.`);
    });
    const skipped = new Set(parsed.docTotals.map(t => t.line));
    parsed.rows.forEach(input => {
      const record = sourceRows.get(input.line), inherited = contexts.get(input.line);
      const hit = kind === 'balance' ? F.matchAccount(stripName(input.name)) : F.matchIncomeAccount(stripName(input.name));
      const issues = input.doubts.filter(d => !/coma de tres cifras/.test(d.text)).map(d => d.text);
      const row = {
        id: `paste-${kind === 'balance' ? 'b' : 'i'}-${input.id}`, line: input.line,
        name: input.name, include: true, amounts: { ...input.amounts }, sign: input.sign ?? 1,
        needsReview: !hit || issues.length > 0, confirmed: false, issues,
        ...(kind === 'balance' ? { section: input.section ?? null, term: input.term ?? null, role: input.role ?? null, group: '' } : { category: input.category ?? null })
      };
      if (kind === 'balance') {
        if (!row.section && inherited) { row.section = inherited.section; row.term = inherited.term; }
        if (row.section === 'equity') row.term = null;
        row.group = inherited?.section === row.section && (row.section === 'equity' || inherited.term === row.term) && inherited.group ? inherited.group : blockFor(row)?.group || '';
        if (input.memo) { row.needsReview = true; row.issues.push('Este detalle debe revisarse para evitar contar dos veces un total.'); }
      } else if (!row.category && options.context?.category) row.category = options.context.category;
      if (row.needsReview && !row.issues.length) row.issues.push('Nombre fuera del catálogo. Confirma su clasificación o excluye la fila.');
      if (record) parsed.columns.forEach((side, index) => { if (record.amounts[index]?.invalid) row.amounts[side] = record.amounts[index].raw; });
      draft.rows.push(row);
    });
    // Las celdas ilegibles no pueden desaparecer porque el lector no les encontró una cifra.
    sourceRows.forEach((record, line) => {
      if (!record.amounts.some(a => a.invalid) || skipped.has(line) || draft.rows.some(row => row.line === line)) return;
      if (record.name === '' && /\b(?:19|20)\d{2}\b/.test(source.split(/\r?\n/)[line - 1])) return;
      const inherited = contexts.get(line);
      const recognized = headerContext(record.name);
      if (recognized && record.amounts.every(a => a.invalid && /^(dic\.?|diciembre)$/i.test(a.raw))) return;
      const row = { id: `paste-${kind[0]}-invalid-${line}`, line, name: record.name || 'Cuenta sin nombre', include: true, amounts: { previous: null, current: null }, sign: 1, needsReview: true, confirmed: false, issues: ['Hay importes que no se pudieron leer. Corrige cada celda o excluye esta fila.'] };
      parsed.columns.forEach((side, index) => { const cell = record.amounts[index]; row.amounts[side] = cell?.invalid ? cell.raw : cell?.value ?? null; });
      if (kind === 'balance') Object.assign(row, { section: inherited?.section ?? null, term: inherited?.term ?? null, group: inherited?.group ?? '', role: null });
      else row.category = options.context?.category || null;
      draft.rows.push(row);
    });
    draft.rows.sort((a, b) => a.line - b.line);
    parsed.docTotals.forEach((total, index) => {
      const members = total.members?.map(id => `paste-${kind === 'balance' ? 'b' : 'i'}-${id}`) || null;
      let key = null;
      if (kind === 'income') key = total.part ? `income:${total.part}` : null;
      else if (['assets', 'liabilities', 'funding'].includes(total.part)) key = total.part;
      const selected = members ? draft.rows.filter(row => members.includes(row.id)) : Object.hasOwn(PARTS, total.part) ? draft.rows.filter(row => blockFor(row) === BLOCKS[PARTS[total.part]]) : [];
      if (kind === 'income' && members) {
        const selectedIncome = draft.rows.filter(row => members.includes(row.id));
        const categories = new Set(selectedIncome.map(row => row.category));
        if (categories.size === 1 && selectedIncome.length === draft.rows.filter(row => categories.has(row.category)).length) {
          const category = [...categories][0];
          const part = ({ opex: 'operatingExpenses', preferred: 'preferredDividends' })[category] || category;
          key = `income:${part}`;
        }
      }
      if (kind === 'balance' && selected.length && (!total.part || Object.hasOwn(PARTS, total.part))) {
        const groupKeys = new Set(selected.map(row => `${row.section}|${groupFor(row)}`));
        const allGroupRows = draft.rows.filter(row => groupKeys.has(`${row.section}|${groupFor(row)}`));
        if (groupKeys.size === 1 && allGroupRows.length === selected.length) key = [...groupKeys][0];
        else if (total.part) key = total.part === 'equity' ? 'equity' : `balance:${total.part}`;
      }
      if (kind === 'balance' && Object.hasOwn(PARTS, total.part) && !key) key = total.part === 'equity' ? 'equity' : `balance:${total.part}`;
      const entry = { id: `total-${index + 1}`, line: total.line, name: total.name, key, part: total.part, amounts: { ...total.amounts }, members, asAccount: total.asAccount ? `paste-b-${total.asAccount}` : null };
      const record = sourceRows.get(total.line);
      if (record?.amounts.some(a => a.invalid)) globalIssue('total-number', `Línea ${total.line}: el total «${total.name}» contiene un importe ilegible. Corrige la tabla y vuelve a analizar.`);
      draft.totals.push(entry);
      if (key) draft.reported[key] = { ...total.amounts };
    });
    if (!draft.rows.length) globalIssue('empty', 'No se encontraron cuentas. Pega una cuenta por fila y uno o dos períodos.');
    // Los avisos generales del lector explican lo que falta; no sustituyen las validaciones.
    parsed.notes.filter(note => !/No encontré años|en miles|en millones|columnas de cifras|No encontré:/.test(note)).forEach(note => draft.notes.push(note));
    return draft;
  }

  function reportedKey(draft, total, rows) {
    if (draft.kind === 'income' && total.part) return 'income:' + total.part;
    if (draft.kind === 'balance' && ['assets','liabilities','funding'].includes(total.part)) return total.part;
    const selected = total.members ? rows.filter(row => total.members.includes(row.id)) : Object.hasOwn(PARTS, total.part) ? rows.filter(row => blockFor(row) === BLOCKS[PARTS[total.part]]) : [];
    if (draft.kind === 'income' && selected.length) {
      const categories = new Set(selected.map(row => row.category));
      if (categories.size === 1 && selected.length === rows.filter(row => categories.has(row.category)).length) {
        const category = [...categories][0]; return 'income:' + (({opex:'operatingExpenses',preferred:'preferredDividends'})[category] || category);
      }
    }
    if (draft.kind === 'balance' && selected.length) {
      const keys = new Set(selected.map(row => row.section + '|' + groupFor(row)));
      if (keys.size === 1 && selected.length === rows.filter(row => keys.has(row.section + '|' + groupFor(row))).length) return [...keys][0];
    }
    return draft.kind === 'balance' && Object.hasOwn(PARTS,total.part) ? total.part === 'equity' ? 'equity' : 'balance:' + total.part : null;
  }

  function validate(draft, model) {
    const errors = [], warnings = [];
    const add = (code, message, rowId, severity = 'error') => (severity === 'warning' ? warnings : errors).push({ code, message, ...(rowId ? { rowId } : {}) });
    if (!draft || !['balance','income'].includes(draft.kind) || !Array.isArray(draft.rows)) return { valid: false, errors: [{ code: 'draft', message: 'La propuesta de importación no es válida.' }], warnings, totals: [] };
    (draft.issues || []).forEach(issue => add(issue.code, issue.message, issue.rowId, issue.severity));
    const periods = draft.periods || {};
    if (!/^\d{4}$/.test(String(periods.previous)) || !/^\d{4}$/.test(String(periods.current)) || +periods.previous < 1900 || +periods.current > 2100 || +periods.previous >= +periods.current) add('periods', 'Indica dos años válidos: el anterior debe ser menor que el actual.');
    if (model) {
      const other = draft.kind === 'balance' ? 'income' : 'balance';
      if ((hasData(model[other]) || draft.mode === 'append' && hasData(model[draft.kind])) && SIDES.some(side => String(model.periods?.[side]) !== String(periods[side]))) add('period-conflict', 'Los años no coinciden con los datos del caso. Crea otro caso o usa los mismos períodos antes de importar.');
    }
    const active = draft.rows.filter(row => row.include !== false);
    if (!hasData(active)) add('empty', 'Selecciona al menos una cuenta con un importe válido.');
    const ids = new Set();
    active.forEach(row => {
      if (!row.id || ids.has(row.id)) add('row-id', 'Cada fila necesita un identificador único.', row.id); ids.add(row.id);
      if (!String(row.name ?? '').trim()) add('name', 'Escribe el nombre de la cuenta.', row.id);
      if (!completeClass(draft.kind, row)) add('classification', 'Elige la clasificación de esta cuenta.', row.id);
      if (row.needsReview && row.confirmed !== true) add('review', 'Confirma la clasificación e importes de esta fila o exclúyela.', row.id);
      if (![1,-1].includes(row.sign)) add('sign', 'El efecto debe ser suma o resta.', row.id);
      if (draft.kind === 'balance') {
        if (!groupFor(row)) add('group', 'Indica el grupo contable de esta cuenta.', row.id);
        if (row.role != null) { const role = F.accountRoles[row.role]; if (!role || role.section !== row.section || role.term !== row.term) add('role', 'El uso de esta cuenta no corresponde a su sección y plazo.', row.id); }
      }
      for (const side of SIDES) {
        const value = row.amounts?.[side];
        if (value === null) { if (number(row.amounts?.[side === 'previous' ? 'current' : 'previous'])) add('blank', 'Un período está vacío; se conservará sin informar, no como cero.', row.id, 'warning'); continue; }
        if (!number(value) || Math.abs(value) > 1e15) add('amount', `${side === 'previous' ? 'Año anterior' : 'Año actual'}: escribe un importe válido.`, row.id);
        else if (value < 0 && !(draft.kind === 'balance' ? row.section === 'equity' : row.category === 'taxes')) add('negative', 'Usa un importe positivo y el efecto «resta» para esta cuenta.', row.id);
        else if (row.category === 'taxRate' && (value < 0 || value >= 1)) add('tax-rate', 'La tasa debe ser una fracción de 0 a menos de 1 (0.35 equivale a 35 %).', row.id);
      }
    });
    const summary = {};
    if (!errors.some(error => ['classification','amount','role','sign','negative','tax-rate'].includes(error.code))) for (const side of SIDES) {
      if (!active.some(row => number(row.amounts?.[side]))) { summary[side] = null; continue; }
      try {
        const effective = draft.mode === 'append' && model ? [...(model[draft.kind] || []), ...active] : active;
        const accounts = effective.map(row => ({ ...row, amount: row.amounts?.[side] ?? null }));
        summary[side] = draft.kind === 'balance' ? F.summarizeBalance({ accounts }) : F.summarizeIncome({ accounts });
        if (draft.kind === 'balance' && !summary[side].balanced) add('unbalanced', `${periods[side]}: el balance todavía no cuadra. Podrás corregirlo después de importar.`, null, 'warning');
      } catch (error) { add('engine', `${periods[side]}: ${error.message}`); }
    }
    const totals = (draft.totals || []).map(total => {
      const calculated = { previous: null, current: null }, difference = { previous: null, current: null };
      for (const side of SIDES) {
        if (total.members) {
          const members = active.filter(row => total.members.includes(row.id));
          if (members.length && members.every(row => number(row.amounts?.[side]))) calculated[side] = members.reduce((sum, row) => sum + row.sign * row.amounts[side], 0);
        } else if (number(summary[side]?.[total.part])) calculated[side] = summary[side][total.part];
        if (number(total.amounts?.[side]) && number(calculated[side])) difference[side] = total.amounts[side] - calculated[side];
      }
      const diffs = SIDES.map(side => difference[side]).filter(number);
      const status = diffs.some(diff => Math.abs(diff) > .01) ? 'diff' : diffs.length ? 'ok' : 'na';
      if (status === 'diff') add('total-mismatch', `${total.name}: el total pegado no coincide con las cuentas.`, null, 'warning');
      return { ...total, key: reportedKey(draft, total, active), calculated, difference, status };
    });
    return { valid: errors.length === 0, errors, warnings, totals, summary };
  }

  function buildCase(model, draft) {
    const result = validate(draft, model);
    if (!result.valid) { const error = new Error(result.errors.map(issue => issue.message).join('\n')); error.issues = result.errors; throw error; }
    const next = clone(model);
    const used = new Set([...(next.balance || []), ...(next.income || [])].map(row => row.id));
    const rows = draft.rows.filter(row => row.include !== false).map(row => {
      let id = row.id, suffix = 1; while (used.has(id)) id = `${row.id}-${suffix++}`; used.add(id);
      const account = { id, name: String(row.name).trim(), sign: row.sign, amounts: { ...row.amounts } };
      if (draft.kind === 'balance') Object.assign(account, { section: row.section, term: row.section === 'equity' ? null : row.term, group: groupFor(row), role: row.role ?? null });
      else account.category = row.category;
      return account;
    });
    next[draft.kind] = draft.mode === 'append' ? [...(next[draft.kind] || []), ...rows] : rows;
    next.periods = { previous: String(draft.periods.previous), current: String(draft.periods.current) };
    if (draft.applyUnits && draft.units) { if (draft.units.currency) next.currency = draft.units.currency; if (draft.units.scale) next.scale = draft.units.scale; }
    if (draft.mode !== 'append') {
      next.reported = Object.fromEntries(Object.entries(next.reported || {}).filter(([key]) => draft.kind === 'balance' ? key.startsWith('income:') : !key.startsWith('income:')));
      // Totals come from their own reviewed rows; arbitrary changes to draft.reported never add duplicate accounts.
      for (const total of result.totals) if (total.key) next.reported[total.key] = { ...total.amounts };
    }
    return next;
  }
  // ¿Balance o estado de resultados? Cuenta las palabras propias de cada estado en el texto pegado.
  function detectKind(text) {
    const n = norm(text);
    const score = words => words.reduce((t, w) => t + (n.match(new RegExp(`(^|[^a-z])${w}`, 'g')) || []).length, 0);
    const balance = score(['activo', 'pasivo', 'patrimonio', 'capital social', 'balance general', 'circulante', 'corriente']);
    const income = score(['ventas', 'ingresos', 'costo de', 'utilidad', 'gastos', 'estado de resultados', 'impuesto']);
    if (!balance && !income) return null;
    return income > balance ? 'income' : 'balance';
  }
  // Nombre de la empresa: la primera línea sin cifras que no sea el título del estado ni la unidad.
  function detectCompany(text) {
    const skip = /^(balance|estado|estados|cuenta|concepto|cifras|valores|expresado|al \d|del? \d|periodo|ejercicio|activos?|pasivos?|capital|ingresos|ventas)\b|\b(miles|millones)\b|^[a-z]{0,3}\$/;
    for (const raw of String(text ?? '').split(/\r?\n/).slice(0, 6)) {
      const line = raw.replace(/\t+/g, ' ').trim();
      if (!line || /\d/.test(line) || line.length > 80 || skip.test(norm(line)) || /\b(moneda|cordobas|dolares|ejemplo ficticio|instrucciones|comprobaciones)\b/.test(norm(line))) continue;
      return line;
    }
    return null;
  }
  const api = { analyze, validate, buildCase, parseAmount, detectKind, detectCompany, BLOCKS, CATEGORIES };
  if (node) module.exports = api; else root.FinoraPaste = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
