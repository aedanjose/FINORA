/* Casos de empresa compartidos por los módulos empresariales.
   Guarda las cuentas en el navegador y arma el análisis cuenta por cuenta sobre el motor (finance.js).
   Aquí no hay fórmulas financieras propias: los totales, razones y comparaciones salen del motor. */
(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' && module.exports ? require('./finance.js') : root.Finance;
  const SIDES = ['previous', 'current'];
  const STORAGE_KEY = 'finora:casos:v1';

  // ---------- Estructura del balance ----------
  // Cada bloque es una sección y plazo del motor; dentro de un bloque las cuentas se agrupan por «group».
  const BLOCKS = [
    { section: 'asset', term: 'current', group: 'Activos circulantes' },
    { section: 'asset', term: 'noncurrent', group: 'Activos no circulantes' },
    { section: 'liability', term: 'current', group: 'Pasivo de corto plazo' },
    { section: 'liability', term: 'noncurrent', group: 'Pasivo de largo plazo' },
    { section: 'equity', term: null, group: 'Capital' }
  ];
  const SECTIONS = { asset: 'ACTIVOS', liability: 'PASIVO', equity: 'CAPITAL' };
  const blockOf = account => BLOCKS.findIndex(b => b.section === account.section && (b.section === 'equity' || b.term === account.term));
  const defaultGroup = account => (BLOCKS[blockOf(account)] || BLOCKS[0]).group;

  // Categorías del estado de resultados que se capturan y analizan (las de detalle del motor no entran en la tabla).
  const INCOME_BLOCKS = [
    { category: 'sales', label: 'Ventas', total: 'Ventas netas' },
    { category: 'costSales', label: 'Costo de ventas', total: 'Total costo de ventas' },
    { category: 'opex', label: 'Gastos operativos', total: 'Total gastos operativos' },
    { category: 'otherIncome', label: 'Otros ingresos', total: 'Total otros ingresos' },
    { category: 'interest', label: 'Gastos financieros', total: 'Total gastos financieros' },
    { category: 'taxes', label: 'Impuestos', total: 'Total impuestos' }
  ];

  // ---------- Casos de ejemplo (resueltos en clase) ----------
  let seq = 0;
  const uid = prefix => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
  const acc = (name, section, term, role, previous, current, extra = {}) => ({ name, section, term, role, sign: 1, amounts: { previous, current }, ...extra });
  const line = (name, category, previous, current, sign = 1) => ({ name, category, sign, amounts: { previous, current } });
  const withIds = (list, prefix) => list.map((item, index) => ({ id: `${prefix}${index + 1}`, ...item }));

  const SAMPLES = {
    'mundo-moda': () => ({
      id: 'mundo-moda', sample: true, name: 'Mundo Moda S.A.', currency: 'U$', scale: 'miles',
      periods: { previous: '2018', current: '2019' }, statementDate: 'al 31 de diciembre',
      params: {},
      balance: withIds([
        acc('Banco', 'asset', 'current', 'cash', 88342, 260975.2),
        acc('Cliente', 'asset', 'current', 'receivables', 87400, 52472),
        acc('IVA x cobrar', 'asset', 'current', null, 21383, 56007.05),
        acc('Inventario', 'asset', 'current', 'inventory', 98350, 34763),
        acc('Seguro pagado x Ad.', 'asset', 'current', null, 20400, 20400),
        acc('Equipo de transporte', 'asset', 'noncurrent', 'fixed', 420000, 612235),
        acc('Depreciación acumulada Trans.', 'asset', 'noncurrent', 'fixed', 7000, 16750, { sign: -1 }),
        acc('Equipo de oficina', 'asset', 'noncurrent', 'fixed', 84000, 53218),
        acc('Depreciación acum. Equ. de ofi.', 'asset', 'noncurrent', 'fixed', 1400, 1890, { sign: -1 }),
        acc('Franquicias', 'asset', 'noncurrent', null, 60000, 0, { group: 'Otros activos' }),
        acc('Otros activos', 'asset', 'noncurrent', null, 0, 22712, { group: 'Otros activos' }),
        acc('Proveedor', 'liability', 'current', 'payables', 83140, 98535),
        acc('IVA x pagar', 'liability', 'current', null, 41175, 67586.25),
        acc('IR x pagar', 'liability', 'current', null, 25445, 45350.75),
        acc('Acreedor', 'liability', 'current', null, 18900, 23320),
        acc('Préstamos', 'liability', 'noncurrent', 'longDebt', 115000, 95800),
        acc('Capital social', 'equity', null, null, 500000, 600000),
        acc('Utilidades', 'equity', null, null, 87815, 163550.25)
      ], 'mm-b'),
      income: [],
      // Totales tal como vienen en el documento, para las comprobaciones.
      reported: {
        'asset|Activos circulantes': { previous: 315875, current: 424617.25 },
        'asset|Activos no circulantes': { previous: 495600, current: 646813 },
        'asset|Otros activos': { previous: 60000, current: 22712 },
        'liability|Pasivo de corto plazo': { previous: 168660, current: 234792 },
        'liability|Pasivo de largo plazo': { previous: 115000, current: 95800 },
        'equity|Capital': { previous: 587815, current: 763550.25 },
        assets: { previous: 871475, current: 1094142.25 },
        liabilities: { previous: 283660, current: 330592 },
        funding: { previous: 871475, current: 1094142.25 }
      }
    }),
    dayton: () => ({
      id: 'dayton', sample: true, name: 'Dayton Products, Inc.', currency: 'U$', scale: 'miles',
      periods: { previous: '2011', current: '2012' }, statementDate: 'al 31 de diciembre',
      params: { allSalesCredit: true },
      balance: withIds([
        acc('Efectivo y equivalentes', 'asset', 'current', 'cash', 6547, 7229),
        acc('Cuentas por cobrar', 'asset', 'current', 'receivables', 19549, 21163),
        acc('Inventarios', 'asset', 'current', 'inventory', 7904, 8068),
        acc('Otros activos corrientes', 'asset', 'current', null, 1681, 1831),
        acc('Propiedad, planta y equipo brutos', 'asset', 'noncurrent', 'fixed', 187519, 204960),
        acc('Depreciación y agotamientos acumulados', 'asset', 'noncurrent', 'fixed', 97917, 110020, { sign: -1 }),
        acc('Otros activos no corrientes', 'asset', 'noncurrent', null, 17891, 19413),
        acc('Cuentas por pagar', 'liability', 'current', 'payables', 22862, 13792),
        acc('Deuda por pagar a corto plazo', 'liability', 'current', null, 3703, 4093),
        acc('Otros pasivos corrientes', 'liability', 'current', null, 3549, 15290),
        acc('Deuda por pagar a largo plazo', 'liability', 'noncurrent', 'longDebt', 7099, 6655),
        acc('Impuesto sobre la renta diferido', 'liability', 'noncurrent', null, 16359, 16484),
        acc('Otros pasivos no corrientes', 'liability', 'noncurrent', null, 16441, 21733),
        acc('Ganancias retenidas', 'equity', null, null, 73161, 74597)
      ], 'dy-b'),
      income: withIds([
        line('Ventas', 'sales', 187510, 178909),
        line('Costo de bienes vendidos', 'costSales', 111631, 109701),
        line('Gastos de ventas, generales y administración', 'opex', 12900, 12356),
        line('Depreciación y amortización', 'opex', 7944, 12103),
        line('Otros gastos fiscales', 'opex', 33377, 33572),
        line('Otros ingresos', 'otherIncome', 3323, 3147),
        line('Gasto por interés', 'interest', 293, 398),
        line('Tasa de impuestos', 'taxRate', 0.37495, 0.35324)
      ], 'dy-i'),
      reported: {
        assets: { previous: 143174, current: 152644 },
        funding: { previous: 143174, current: 152644 }
      }
    })
  };
  const SAMPLE_IDS = Object.keys(SAMPLES);

  function blankCase(name = 'Nueva empresa') {
    const id = uid('c');
    return {
      id, sample: false, name, currency: 'C$', scale: '', periods: { previous: '2024', current: '2025' }, statementDate: 'al 31 de diciembre', params: {},
      balance: F.defaultAccounts().map(a => ({ id: uid('b'), name: a.name, section: a.section, term: a.term, role: a.role, sign: 1, amounts: { previous: null, current: null } })),
      income: INCOME_BLOCKS.map(b => ({ id: uid('i'), name: b.label, category: b.category, sign: 1, amounts: { previous: null, current: null } })),
      reported: {}
    };
  }

  // ---------- Guardado en el navegador ----------
  const clone = value => JSON.parse(JSON.stringify(value));
  const storage = () => { try { return root.localStorage || null; } catch (_) { return null; } };
  let memory = null; // respaldo cuando el navegador bloquea el almacenamiento

  function readState() {
    if (memory) return memory;
    let state = null;
    try { state = JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null'); } catch (_) { state = null; }
    if (!state || !Array.isArray(state.cases) || !state.cases.length) state = { version: 1, activeId: 'mundo-moda', cases: SAMPLE_IDS.map(id => SAMPLES[id]()) };
    if (!state.cases.some(c => c.id === state.activeId)) state.activeId = state.cases[0].id;
    memory = state;
    return state;
  }
  function writeState(state) {
    memory = state;
    try { storage()?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
  }
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(store.active()));

  const store = {
    list: () => readState().cases.map(c => ({ id: c.id, name: c.name, sample: !!c.sample })),
    active: () => clone(readState().cases.find(c => c.id === readState().activeId)),
    setActive(id) { const s = readState(); if (!s.cases.some(c => c.id === id)) return; s.activeId = id; writeState(s); notify(); },
    save(caseData) {
      const s = readState(); const index = s.cases.findIndex(c => c.id === caseData.id);
      if (index < 0) s.cases.push(clone(caseData)); else s.cases[index] = clone(caseData);
      const saved = writeState(s); notify(); return saved;
    },
    create(name) { const c = blankCase(name); const s = readState(); s.cases.push(c); s.activeId = c.id; writeState(s); notify(); return clone(c); },
    remove(id) {
      const s = readState(); if (s.cases.length <= 1) return false;
      s.cases = s.cases.filter(c => c.id !== id); if (s.activeId === id) s.activeId = s.cases[0].id; writeState(s); notify(); return true;
    },
    resetSample(id) {
      if (!SAMPLES[id]) return false; const s = readState(); const fresh = SAMPLES[id](); const index = s.cases.findIndex(c => c.id === id);
      if (index < 0) s.cases.push(fresh); else s.cases[index] = fresh; s.activeId = id; writeState(s); notify(); return true;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Otra pestaña guardó: se descarta la copia en memoria y se vuelve a leer.
    reload() { memory = null; notify(); },
    newId: uid
  };
  if (root.addEventListener) root.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) store.reload(); });

  // ---------- Utilidades ----------
  const has = v => typeof v === 'number' && Number.isFinite(v);
  const sum = values => values.every(v => v === null) ? null : values.reduce((a, v) => a + (v ?? 0), 0);
  const signedAmount = (a, side) => has(a.amounts?.[side]) ? (a.sign ?? 1) * a.amounts[side] : null;
  const sideHasData = (list, side) => (list || []).some(a => has(a.amounts?.[side]));
  const errorText = error => String(error?.message || error);
  const normalize = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function compare(values, bases) {
    try { return F.compareValues(values.previous, values.current, bases?.previous ?? null, bases?.current ?? null); }
    catch (_) { return { before: values.previous, after: values.current, absolute: null, relative: null, relativeReason: 'Importe inválido', verticalBefore: null, verticalAfter: null }; }
  }

  // Restas de un grupo: cada activo con las contracuentas que tiene justo debajo (pueden ser varias seguidas).
  // Una resta al inicio del grupo, sin activo encima, queda «huérfana».
  function contraRuns(list) {
    const runs = [], orphans = [];
    let run = null;
    list.forEach(a => {
      if ((a.sign ?? 1) === 1) { run = { asset: a, contras: [] }; runs.push(run); }
      else if (run) run.contras.push(a);
      else orphans.push(a);
    });
    return { runs: runs.filter(r => r.contras.length), orphans };
  }

  // ---------- Balance general, cuenta por cuenta ----------
  function analyzeBalance(c) {
    const accounts = c.balance || [];
    const errors = {}, engine = {};
    for (const side of SIDES) {
      if (!sideHasData(accounts, side)) { engine[side] = null; continue; }
      try { engine[side] = F.summarizeBalance({ accounts: F.accountsForPeriod(accounts, side) }); }
      catch (error) { engine[side] = null; errors[side] = errorText(error); }
    }
    // Grupos en orden de bloque y de primera aparición.
    const groups = [];
    accounts.forEach(a => {
      const block = blockOf(a); if (block < 0) return;
      const name = String(a.group || '').trim() || defaultGroup(a);
      let g = groups.find(x => x.block === block && x.name === name);
      if (!g) { g = { block, name, section: BLOCKS[block].section, term: BLOCKS[block].term, key: `${BLOCKS[block].section}|${name}`, accounts: [] }; groups.push(g); }
      g.accounts.push(a);
    });
    groups.sort((x, y) => x.block - y.block);
    const totalOf = list => Object.fromEntries(SIDES.map(side => [side, sum(list.map(a => signedAmount(a, side)))]));
    groups.forEach(g => { g.total = totalOf(g.accounts); });
    const sectionTotal = section => Object.fromEntries(SIDES.map(side => [side, sum(groups.filter(g => g.section === section).map(g => g.total[side]))]));
    const termTotal = (section, term) => Object.fromEntries(SIDES.map(side => [side, sum(groups.filter(g => g.section === section && g.term === term).map(g => g.total[side]))]));
    const totals = { assets: sectionTotal('asset'), liabilities: sectionTotal('liability'), equity: sectionTotal('equity') };
    totals.funding = Object.fromEntries(SIDES.map(side => [side, sum([totals.liabilities[side], totals.equity[side]])]));
    totals.currentAssets = termTotal('asset', 'current');
    totals.currentLiabilities = termTotal('liability', 'current');
    const bases = { asset: totals.assets, funding: totals.funding };

    const rows = [];
    const push = (type, label, values, kind, extra = {}) => rows.push({ type, label, values, kind, ...(values ? compare(values, bases[kind]) : {}), ...extra });
    let section = null;
    groups.forEach(g => {
      const kind = g.section === 'asset' ? 'asset' : 'funding';
      if (g.section !== section) {
        if (section === 'liability') push('total', 'Total pasivo', totals.liabilities, 'funding');
        section = g.section; push('section', SECTIONS[section], null, kind);
      }
      push('group', g.name, null, kind, { key: g.key });
      const { runs } = contraRuns(g.accounts);
      g.accounts.forEach(a => {
        const values = { previous: a.amounts?.previous ?? null, current: a.amounts?.current ?? null };
        push('account', String(a.name || '').trim() || 'Cuenta sin nombre', values, kind, { id: a.id, sign: a.sign ?? 1, role: a.role ?? null, groupKey: g.key });
        // Después de la última contracuenta de un activo se muestra el neto, como en el documento.
        const run = runs.find(r => r.contras[r.contras.length - 1] === a);
        if (run) {
          const net = Object.fromEntries(SIDES.map(side => [side, sum([run.asset, ...run.contras].map(x => signedAmount(x, side)))]));
          push('net', `${String(run.asset.name || '').trim()} neto`, net, kind, { of: run.asset.id, contra: a.id, contras: run.contras.map(x => x.id), role: run.asset.role ?? null, groupKey: g.key });
        }
      });
      push('subtotal', `Total ${g.name.toLowerCase()}`, g.total, kind, { key: g.key });
      const last = groups[groups.length - 1] === g, nextSection = !last && groups[groups.indexOf(g) + 1].section !== g.section;
      if (g.section === 'asset' && (last || nextSection)) push('total', 'Total activos', totals.assets, 'asset', { key: 'assets' });
    });
    if (section === 'liability') push('total', 'Total pasivo', totals.liabilities, 'funding');
    if (groups.some(g => g.section !== 'asset')) {
      // Con un solo grupo de capital su subtotal ya es «Total capital»; no se repite.
      if (groups.filter(g => g.section === 'equity').length > 1) push('total', 'Total capital', totals.equity, 'funding');
      push('total', 'Total pasivo y capital', totals.funding, 'funding', { key: 'funding' });
    }
    const difference = Object.fromEntries(SIDES.map(side => [side, has(totals.assets[side]) && has(totals.funding[side]) ? totals.assets[side] - totals.funding[side] : null]));
    const balanced = Object.fromEntries(SIDES.map(side => [side, difference[side] === null ? null : Math.abs(difference[side]) <= 0.01]));
    // Restas mal planteadas: una contracuenta mayor que su activo, una resta sin cuenta a la cual restar
    // o una depreciación dentro del activo circulante. Se explican en lugar del mensaje genérico del motor.
    const issues = [];
    const label = a => String(a.name || '').trim() || 'Cuenta sin nombre';
    groups.forEach(g => {
      const { runs, orphans } = contraRuns(g.accounts);
      orphans.forEach(a => { if (SIDES.some(side => has(a.amounts?.[side]) && a.amounts[side] !== 0)) issues.push({ type: 'orphan', id: a.id, ids: [a.id], name: label(a), group: g.name, sides: [], text: `«${label(a)}» resta, pero no tiene encima una cuenta a la cual restar. Colócala justo debajo del activo que corrige.` }); });
      runs.forEach(run => {
        const total = side => sum(run.contras.map(x => has(x.amounts?.[side]) ? x.amounts[side] : null));
        const sides = SIDES.filter(side => has(total(side)) && has(run.asset.amounts?.[side]) && total(side) > run.asset.amounts[side]);
        if (!sides.length) return;
        const many = run.contras.length > 1, names = run.contras.map(x => `«${label(x)}»`);
        issues.push({ type: 'exceeds', id: run.contras[run.contras.length - 1].id, ids: run.contras.map(x => x.id), of: run.asset.id, name: run.contras.map(label).join(' y '), ofName: label(run.asset), sides,
          text: `${many ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]} (restas) superan` : `${names[0]} (resta) supera`} a «${label(run.asset)}» en ${sides.map(side => c.periods?.[side] ?? side).join(' y ')}.` });
      });
    });
    accounts.forEach(a => {
      if (a.section === 'asset' && a.term === 'current' && /deprec|amortiz|agotamiento/.test(normalize(a.name))) issues.push({ type: 'misplaced', id: a.id, name: String(a.name).trim(), sides: [], text: `«${String(a.name).trim()}» está en el activo circulante; la depreciación corrige activos fijos y va en el activo no circulante.` });
    });
    // Si el motor falla por una resta mal planteada, se muestra la causa concreta.
    SIDES.forEach(side => { const cause = issues.find(x => x.sides.includes(side) || x.type === 'orphan'); if (errors[side] && cause) errors[side] = cause.text; });
    return { rows, groups, totals, bases, engine, errors, issues, difference, balanced, hasPrevious: sideHasData(accounts, 'previous'), hasCurrent: sideHasData(accounts, 'current') };
  }

  // ---------- Estado de resultados, cuenta por cuenta ----------
  function analyzeIncome(c) {
    const accounts = c.income || [];
    if (!accounts.some(a => SIDES.some(side => has(a.amounts?.[side])))) return { empty: true, rows: [], statements: {}, errors: {} };
    const statements = {}, errors = {};
    for (const side of SIDES) {
      if (!sideHasData(accounts, side)) { statements[side] = null; continue; }
      try { statements[side] = F.summarizeIncome({ accounts: F.incomeAccountsForPeriod(accounts, side) }); }
      catch (error) { statements[side] = null; errors[side] = errorText(error); }
    }
    const base = Object.fromEntries(SIDES.map(side => [side, statements[side]?.sales ?? null]));
    const pick = key => Object.fromEntries(SIDES.map(side => [side, statements[side]?.[key] ?? null]));
    const rows = [];
    const push = (type, label, values, extra = {}) => rows.push({ type, label, values, ...(values ? compare(values, base) : {}), ...extra });
    const block = category => accounts.filter(a => a.category === category);
    const lines = category => block(category).forEach(a => push('account', String(a.name || '').trim() || 'Cuenta sin nombre', { previous: a.amounts?.previous ?? null, current: a.amounts?.current ?? null }, { id: a.id, category, sign: a.sign ?? 1 }));
    const totalOf = category => Object.fromEntries(SIDES.map(side => [side, sum(block(category).map(a => signedAmount(a, side)))]));
    const section = (category, withTotal = true) => {
      const info = INCOME_BLOCKS.find(b => b.category === category);
      if (!block(category).length) return false;
      push('group', info.label, null, { category });
      lines(category);
      if (withTotal && block(category).length > 1) push('subtotal', info.total, totalOf(category), { category });
      return true;
    };
    section('sales'); section('costSales');
    push('result', 'Utilidad bruta', pick('grossProfit'), { key: 'grossProfit' });
    if (section('opex') && block('opex').length === 1) rows[rows.length - 1].type = 'account';
    push('result', 'Utilidad operativa', pick('ebit'), { key: 'ebit' });
    section('otherIncome'); section('interest');
    push('result', 'Utilidad antes de impuestos', pick('ebt'), { key: 'ebt' });
    const rate = Object.fromEntries(SIDES.map(side => [side, statements[side]?.taxRate ?? null]));
    if (block('taxes').some(a => SIDES.some(side => has(a.amounts?.[side])))) section('taxes');
    else if (SIDES.some(side => has(rate[side]))) {
      const pct = side => has(rate[side]) ? `${(rate[side] * 100).toLocaleString('en-US', { maximumFractionDigits: 3 })}%` : '—';
      push('account', `Impuestos (tasa ${pct('previous')} / ${pct('current')})`, pick('taxes'), { category: 'taxes', computed: true });
    }
    push('result', 'Utilidad neta', pick('netProfit'), { key: 'netProfit', final: true });
    // Categorías principales sin ningún importe: los subtotales que dependen de ellas quedan en blanco.
    const missing = ['sales', 'costSales', 'opex', 'interest'].filter(category => !block(category).some(a => SIDES.some(side => has(a.amounts?.[side]))))
      .map(category => INCOME_BLOCKS.find(b => b.category === category).label.toLowerCase());
    if (!block('taxes').some(a => SIDES.some(side => has(a.amounts?.[side]))) && !SIDES.some(side => has(rate[side]))) missing.push('impuestos (monto o tasa)');
    return { empty: false, rows, statements, errors, base, missing };
  }

  // ---------- Indicadores ----------
  function indicators(c, balance = analyzeBalance(c), income = analyzeIncome(c)) {
    const t = balance.totals;
    const ctn = Object.fromEntries(SIDES.map(side => [side, has(t.currentAssets[side]) && has(t.currentLiabilities[side]) ? t.currentAssets[side] - t.currentLiabilities[side] : null]));
    const share = (part, whole) => Object.fromEntries(SIDES.map(side => [side, has(part[side]) && has(whole[side]) && whole[side] > 0 ? part[side] / whole[side] : null]));
    const result = {
      workingCapital: { values: ctn, ...compare(ctn, null) },
      liabilitiesShare: share(t.liabilities, t.funding),
      equityShare: share(t.equity, t.funding),
      composition: balance.groups.filter(g => g.section === 'asset').map(g => ({ name: g.name, values: g.total, share: share(g.total, t.assets) })),
      margins: null
    };
    if (!income.empty) {
      const s = income.statements;
      const margin = key => Object.fromEntries(SIDES.map(side => [side, has(s[side]?.[key]) && has(s[side]?.sales) && s[side].sales > 0 ? s[side][key] / s[side].sales : null]));
      result.margins = { gross: margin('grossProfit'), operating: margin('ebit'), net: margin('netProfit') };
    }
    return result;
  }

  // ---------- Razones financieras por período (motor) ----------
  function ratios(c, balance = analyzeBalance(c), income = analyzeIncome(c)) {
    const out = {};
    for (const side of SIDES) {
      const b = balance.engine[side]; const i = income.empty ? null : income.statements[side];
      const safe = fn => { try { return fn(); } catch (error) { return { error: errorText(error) }; } };
      out[side] = !b ? null : {
        liquidity: safe(() => F.calculateLiquidity(b)),
        debt: safe(() => F.calculateDebt(b, i)),
        activity: i ? safe(() => F.calculateActivity(b, i, null, c.params || {})) : null,
        profitability: i ? safe(() => F.calculateProfitability(b, i, null, { ...(c.params || {}), returnMethod: 'closing' })) : null
      };
    }
    return out;
  }

  // ---------- Formato ----------
  const fmt = {
    number: (v, digits = 2) => has(v) ? (v < 0 ? '(' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (v < 0 ? ')' : '') : '—',
    plain: (v, digits = 2) => has(v) ? Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—',
    money: (v, c) => has(v) ? `${v < 0 ? '−' : ''}${c?.currency || ''} ${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim() : '—',
    pct: (v, digits = 2) => has(v) ? `${(v * 100).toFixed(digits)}%` : '—',
    signedPct: (v, digits = 2) => has(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)}%` : '—',
    pp: (v, digits = 2) => has(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)} p.p.` : '—',
    unit: c => `${c?.currency || ''}${c?.scale ? ` ${c.scale}` : ''}`.trim()
  };

  // ---------- Interpretación por reglas ----------
  const NOTABLE = 0.3; // una cuenta se menciona si cambia 30 % o más, o si aparece o desaparece
  // El verbo concuerda con el nombre: «Banco aumentó», «Utilidades aumentaron».
  const plural = label => /[aeiouáéíóú]s$/.test(String(label).trim().split(/\s+/)[0].toLowerCase());
  const verb = (v, label = '') => plural(label) ? (v > 0 ? 'aumentaron' : v < 0 ? 'disminuyeron' : 'se mantuvieron') : (v > 0 ? 'aumentó' : v < 0 ? 'disminuyó' : 'se mantuvo');
  const grew = label => plural(label) ? 'crecieron' : 'creció';
  // Movimiento de una cuenta como texto: «Banco aumentó 195.41 %».
  const moveText = (item, c) => {
    if (item.before === 0 && item.after > 0) return `surge ${item.label} por ${fmt.money(item.after, c)}`;
    if (item.before > 0 && item.after === 0) return `${item.label} ${plural(item.label) ? 'pasan' : 'pasa'} de ${fmt.money(item.before, c)} a cero`;
    return `${item.label} ${verb(item.absolute, item.label)} ${fmt.plain(Math.abs(item.relative) * 100)} %`;
  };
  // Partidas de un grupo para comentar: los activos con contracuenta se comentan por su neto.
  function groupItems(balance, key) {
    const rows = balance.rows.filter(r => r.groupKey === key);
    const paired = new Set(rows.filter(r => r.type === 'net').flatMap(r => [r.of, ...r.contras]));
    return rows.filter(r => (r.type === 'account' && !paired.has(r.id)) || r.type === 'net')
      .map(r => ({ label: r.label, before: r.before, after: r.after, absolute: r.absolute, relative: r.relative, verticalAfter: r.verticalAfter, verticalBefore: r.verticalBefore, role: r.role, type: r.type, id: r.id }));
  }
  const notable = items => items.filter(i => has(i.absolute) && i.absolute !== 0 && ((has(i.relative) && Math.abs(i.relative) >= NOTABLE) || (i.before === 0 && i.after > 0) || (i.before > 0 && i.after === 0)))
    .sort((a, b) => Math.abs(b.absolute) - Math.abs(a.absolute));
  const joinList = parts => parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join('; ')} y ${parts[parts.length - 1]}`;
  const capital = text => text.charAt(0).toUpperCase() + text.slice(1);

  function interpret(c, balance = analyzeBalance(c), income = analyzeIncome(c)) {
    const out = [], p = c.periods || {};
    const both = balance.hasPrevious && balance.hasCurrent;
    if (both) {
      const t = balance.totals, assets = compare(t.assets, null);
      const risers = balance.groups.filter(g => g.section === 'asset').flatMap(g => groupItems(balance, g.key)).filter(i => i.absolute > 0).sort((a, b) => b.absolute - a.absolute).slice(0, 2).map(i => i.label);
      out.push({ topic: 'Activo total', text: `${verb(assets.absolute) === 'se mantuvo' ? 'Se mantuvo' : capital(verb(assets.absolute))} ${fmt.money(Math.abs(assets.absolute), c)} (${fmt.plain(Math.abs(assets.relative ?? 0) * 100)} %), al pasar de ${fmt.money(t.assets.previous, c)} a ${fmt.money(t.assets.current, c)}.${assets.absolute > 0 && risers.length ? ` El crecimiento se concentra en ${joinList(risers)}.` : ''}` });
      const ind = indicators(c, balance, income);
      balance.groups.forEach(g => {
        const cmp = compare(g.total, g.section === 'asset' ? t.assets : t.funding);
        const moves = notable(groupItems(balance, g.key)).slice(0, 3).map(i => moveText(i, c));
        const weight = has(cmp.verticalBefore) && has(cmp.verticalAfter) ? ` y su peso pasó de ${fmt.pct(cmp.verticalBefore)} a ${fmt.pct(cmp.verticalAfter)}` : '';
        const change = has(cmp.relative) ? `${verb(cmp.absolute)} ${fmt.money(Math.abs(cmp.absolute), c)} (${fmt.plain(Math.abs(cmp.relative) * 100)} %)` : `${verb(cmp.absolute)} ${fmt.money(Math.abs(cmp.absolute ?? 0), c)}`;
        if (g.section === 'liability' && g === balance.groups.find(x => x.section === 'liability')) {
          const l = compare(t.liabilities, t.funding);
          out.push({ topic: 'Pasivo', text: `El pasivo total ${verb(l.absolute)} ${fmt.plain(Math.abs(l.relative ?? 0) * 100)} % y su participación en el financiamiento pasó de ${fmt.pct(ind.liabilitiesShare.previous)} a ${fmt.pct(ind.liabilitiesShare.current)}.` });
        }
        if (g.section === 'equity') {
          const e = compare(t.equity, t.funding);
          out.push({ topic: 'Capital', text: `${capital(verb(e.absolute))} ${fmt.money(Math.abs(e.absolute ?? 0), c)} (${fmt.plain(Math.abs(e.relative ?? 0) * 100)} %) y su participación pasó de ${fmt.pct(ind.equityShare.previous)} a ${fmt.pct(ind.equityShare.current)}.${moves.length ? ` ${capital(joinList(moves))}.` : ''}` });
          return;
        }
        out.push({ topic: g.name, text: `${capital(change)}${weight}.${moves.length ? ` ${capital(joinList(moves))}.` : ''}` });
        if (g.section === 'asset' && g.term === 'current' && g === balance.groups.filter(x => x.section === 'asset' && x.term === 'current').slice(-1)[0]) {
          const w = ind.workingCapital, cl = compare(t.currentLiabilities, null);
          out.push({ topic: 'Capital de trabajo neto', text: `Pasó de ${fmt.money(w.values.previous, c)} a ${fmt.money(w.values.current, c)}; ${verb(w.absolute)} ${fmt.money(Math.abs(w.absolute ?? 0), c)}${has(w.relative) ? `, equivalente al ${fmt.plain(Math.abs(w.relative) * 100)} %` : ''}.${has(cl.relative) ? ` El pasivo de corto plazo ${verb(cl.absolute)} ${fmt.plain(Math.abs(cl.relative) * 100)} %.` : ''}${w.values.current < 0 ? ' El activo circulante no alcanza a cubrir las deudas de corto plazo.' : ''}` });
        }
      });
      out.push({ topic: 'Ecuación contable', text: balance.balanced.previous && balance.balanced.current ? `Activo = Pasivo + Capital en ${p.previous} y ${p.current}: el balance cuadra.` : `El balance no cuadra (diferencia ${p.previous}: ${fmt.money(balance.difference.previous, c)}; ${p.current}: ${fmt.money(balance.difference.current, c)}). Revisa las cuentas antes de interpretar.` });
    }
    if (!income.empty && income.statements.previous && income.statements.current) {
      const s = income.statements, m = indicators(c, balance, income).margins;
      const line = (key, label) => { const cmp = compare({ previous: s.previous[key], current: s.current[key] }, null); return has(cmp.absolute) ? `${label} ${verb(cmp.absolute, label)} ${fmt.plain(Math.abs(cmp.relative ?? 0) * 100)} %` : null; };
      out.push({ topic: 'Ventas y costo de ventas', text: `${capital([line('sales', 'las ventas'), line('costSales', 'el costo de ventas')].filter(Boolean).join(' y '))}; el margen bruto pasó de ${fmt.pct(m.gross.previous)} a ${fmt.pct(m.gross.current)}.` });
      const opexItems = income.rows.filter(r => r.type === 'account' && r.category === 'opex').map(r => ({ label: r.label, before: r.before, after: r.after, absolute: r.absolute, relative: r.relative }));
      const opexMoves = notable(opexItems).slice(0, 2).map(i => moveText(i, c));
      out.push({ topic: 'Gastos y utilidad operativa', text: `${capital([line('operatingExpenses', 'los gastos operativos'), line('ebit', 'la utilidad operativa')].filter(Boolean).join(' y '))}; el margen operativo pasó de ${fmt.pct(m.operating.previous)} a ${fmt.pct(m.operating.current)}.${opexMoves.length ? ` ${capital(joinList(opexMoves))}.` : ''}` });
      const net = compare({ previous: s.previous.netProfit, current: s.current.netProfit }, null);
      if (has(net.absolute)) out.push({ topic: 'Utilidad neta', text: `${capital(verb(net.absolute))} ${fmt.money(Math.abs(net.absolute), c)}${has(net.relative) ? ` (${fmt.plain(Math.abs(net.relative) * 100)} %)` : ''}, al pasar de ${fmt.money(s.previous.netProfit, c)} a ${fmt.money(s.current.netProfit, c)}; el margen neto pasó de ${fmt.pct(m.net.previous)} a ${fmt.pct(m.net.current)}.` });
    }
    return out;
  }

  // ---------- Recomendaciones por reglas ----------
  const TAX = /(^|[^a-z])(iva|ir|isr|impuesto|impuestos|tributari|fiscal)/;
  const RETAINED = /(utilidad|ganancia|resultado)/;
  function recommend(c, balance = analyzeBalance(c), income = analyzeIncome(c)) {
    const out = [];
    if (!(balance.hasPrevious && balance.hasCurrent)) return out;
    const p = c.periods || {}, t = balance.totals, ind = indicators(c, balance, income);
    const all = balance.groups.flatMap(g => groupItems(balance, g.key).map(i => ({ ...i, section: g.section, term: g.term })));
    const pct = v => `${fmt.plain(Math.abs(v) * 100)} %`;
    const add = (priority, area, evidence, recommendation, action, followUp) => out.push({ priority, area, evidence, recommendation, action, followUp });

    const taxes = all.filter(i => i.section === 'liability' && TAX.test(normalize(i.label)) && !/diferid/.test(normalize(i.label)) && has(i.relative) && i.relative > 0.2);
    if (taxes.length) add('Alta', 'Pasivos tributarios', `${capital(joinList(taxes.map(i => `${i.label} ${grew(i.label)} ${pct(i.relative)}`)))}.`, 'Priorizar el pago oportuno de las obligaciones fiscales para evitar recargos, multas y presión acumulada sobre el efectivo.', 'Preparar un calendario tributario y separar los fondos de impuestos antes de comprometerlos en inversiones.', 'Mensual');

    const cashRows = all.filter(i => i.role === 'cash');
    if (cashRows.length) {
      const cash = compare(Object.fromEntries(SIDES.map(side => [side, sum(cashRows.map(i => side === 'previous' ? i.before : i.after))])), t.assets);
      if ((has(cash.relative) && cash.relative > 0.5) || cash.verticalAfter > 0.2)
        add('Alta', 'Reserva de efectivo', `${cashRows.map(i => i.label).join(' y ')} ${verb(cash.absolute, cashRows.length > 1 ? 'xs' : cashRows[0].label)} ${pct(cash.relative ?? 0)} y ${cashRows.length > 1 || plural(cashRows[0].label) ? 'representan' : 'representa'} ${fmt.pct(cash.verticalAfter)} del activo en ${p.current}.`, 'Mantener una reserva suficiente para las obligaciones próximas, pero evitar efectivo permanentemente ocioso.', 'Definir un saldo mínimo de tesorería y destinar los excedentes comprobados a deuda, mantenimiento o inversiones de rápida recuperación.', 'Semanal/mensual');
      else if (has(cash.verticalAfter) && cash.verticalAfter < 0.05)
        add('Alta', 'Liquidez inmediata', `El efectivo representa solo ${fmt.pct(cash.verticalAfter)} del activo en ${p.current}.`, 'Vigilar que el efectivo disponible cubra los pagos de corto plazo sin depender de nuevo endeudamiento.', 'Proyectar el flujo de caja semanal y acelerar la cobranza antes de comprometer nuevos pagos.', 'Semanal');
    }

    all.filter(i => i.role === 'fixed' && i.section === 'asset' && has(i.relative)).forEach(i => {
      if (i.relative > 0.2 && i.verticalAfter >= 0.25) add('Alta', i.label, `${i.label} ${verb(i.absolute, i.label)} ${pct(i.relative)} y ${plural(i.label) ? 'representan' : 'representa'} ${fmt.pct(i.verticalAfter)} del activo.`, 'No ampliar nuevamente esta inversión sin demostrar utilización, productividad y retorno; proteger la inversión existente.', 'Controlar uso, mantenimiento, disponibilidad y costo por unidad producida o transportada.', 'Mensual');
      else if (i.relative < -0.2) add('Media', i.label, `${i.label} ${verb(-1, i.label)} ${pct(i.relative)}.`, 'Evaluar la obsolescencia y reemplazar únicamente los equipos que afecten la productividad, la seguridad o la continuidad.', 'Preparar un inventario técnico con condición, vida útil restante, mantenimiento y costo de reposición.', 'Semestral');
    });

    all.filter(i => i.role === 'inventory' && has(i.relative)).forEach(i => {
      if (i.relative <= -NOTABLE) add('Media', 'Inventario', `${i.label} ${verb(-1, i.label)} ${pct(i.relative)} y su peso cayó de ${fmt.pct(i.verticalBefore)} a ${fmt.pct(i.verticalAfter)}.`, 'Verificar que la reducción responda a mejor rotación y no a faltantes que limiten las ventas o la producción.', 'Establecer niveles mínimo y máximo, punto de reposición y alertas por agotamiento.', 'Semanal/mensual');
      else if (i.relative >= NOTABLE) add('Media', 'Inventario', `${i.label} ${verb(1, i.label)} ${pct(i.relative)} y ${plural(i.label) ? 'representan' : 'representa'} ${fmt.pct(i.verticalAfter)} del activo.`, 'Revisar que el aumento corresponda a ventas esperadas y no a mercadería lenta u obsoleta.', 'Medir la rotación por producto y liquidar las existencias sin movimiento.', 'Mensual');
    });

    all.filter(i => i.role === 'receivables' && has(i.relative)).forEach(i => {
      if (i.relative <= -NOTABLE) add('Media', 'Clientes y cobranza', `${i.label} ${verb(-1, i.label)} ${pct(i.relative)} y su participación bajó de ${fmt.pct(i.verticalBefore)} a ${fmt.pct(i.verticalAfter)}.`, 'Mantener la disciplina de cobro y confirmar que la reducción no provenga de una caída de las ventas a crédito.', 'Revisar la antigüedad de saldos, la política de crédito y la concentración por cliente.', 'Quincenal/mensual');
      else if (i.relative >= NOTABLE) add('Media', 'Clientes y cobranza', `${i.label} ${verb(1, i.label)} ${pct(i.relative)}.`, 'Controlar que el crédito otorgado no inmovilice el efectivo ni eleve la morosidad.', 'Revisar la antigüedad de saldos y reforzar la gestión de cobro de las cuentas vencidas.', 'Quincenal');
    });

    const longTerm = balance.groups.filter(g => g.section === 'liability' && g.term === 'noncurrent');
    if (longTerm.length) {
      const debt = compare(Object.fromEntries(SIDES.map(side => [side, sum(longTerm.map(g => g.total[side]))])), null);
      if (debt.absolute < 0) add('Media', 'Deuda', `El pasivo de largo plazo disminuyó ${pct(debt.relative ?? 0)} y la participación total del pasivo es ${fmt.pct(ind.liabilitiesShare.current)}.`, 'Continuar amortizando de forma selectiva, sin usar los recursos necesarios para impuestos, operaciones y mantenimiento.', 'Priorizar la deuda de mayor costo y comparar el ahorro por prepago con el rendimiento de usos alternativos.', 'Trimestral');
      else if (debt.relative > 0.2) add('Alta', 'Deuda', `El pasivo de largo plazo aumentó ${pct(debt.relative)}.`, 'Confirmar que la nueva deuda financia activos productivos y que el flujo de efectivo cubre sus cuotas.', 'Proyectar el servicio de la deuda frente al flujo de operación de los próximos períodos.', 'Trimestral');
    }
    if (ind.liabilitiesShare.current > 0.6) add('Alta', 'Endeudamiento', `El pasivo financia ${fmt.pct(ind.liabilitiesShare.current)} de los activos.`, 'Reducir la dependencia de terceros antes de asumir nuevos compromisos.', 'Fortalecer el capital con utilidades retenidas y renegociar plazos de la deuda más costosa.', 'Trimestral');
    if (ind.workingCapital.values.current < 0) add('Alta', 'Capital de trabajo', `El capital de trabajo neto es negativo: ${fmt.money(ind.workingCapital.values.current, c)}.`, 'Cubrir las deudas de corto plazo sin comprometer la operación.', 'Reprogramar pagos de corto plazo y convertir inventario y cuentas por cobrar en efectivo.', 'Semanal');

    const retained = all.filter(i => i.section === 'equity' && RETAINED.test(normalize(i.label)) && has(i.relative) && i.relative > 0.2);
    if (retained.length) add('Media', 'Capital y utilidades', `El capital representa ${fmt.pct(ind.equityShare.current)} del financiamiento y ${joinList(retained.map(i => `${i.label.toLowerCase()} ${grew(i.label)} ${pct(i.relative)}`))}.`, 'Distribuir las utilidades entre reservas, reducción selectiva de deuda y reinversión productiva, evitando concentrarlas en un solo activo.', 'Aprobar una política de reserva y reinversión basada en el flujo de efectivo y las prioridades operativas.', 'Trimestral/anual');

    if (!income.empty && income.statements.previous && income.statements.current) {
      const s = income.statements, m = ind.margins;
      const sales = compare({ previous: s.previous.sales, current: s.current.sales }, null), opex = compare({ previous: s.previous.operatingExpenses, current: s.current.operatingExpenses }, null);
      if (sales.relative < 0) add('Alta', 'Ventas', `Las ventas disminuyeron ${pct(sales.relative)} (${fmt.money(s.previous.sales, c)} → ${fmt.money(s.current.sales, c)}).`, 'Identificar las líneas o clientes que explican la caída antes de recortar gastos de forma generalizada.', 'Analizar las ventas por producto, cliente y precio; definir metas comerciales trimestrales.', 'Mensual');
      if (has(m.net.previous) && has(m.net.current) && m.net.current - m.net.previous < -0.01) add('Alta', 'Rentabilidad', `El margen neto pasó de ${fmt.pct(m.net.previous)} a ${fmt.pct(m.net.current)}.`, 'Recuperar margen revisando precios, costo de ventas y gastos que no generan ingresos.', 'Construir un estado de resultados mensual por línea y fijar un margen mínimo aceptable.', 'Mensual');
      if (has(opex.relative) && has(sales.relative) && opex.relative > sales.relative + 0.02) {
        const top = notable(income.rows.filter(r => r.type === 'account' && r.category === 'opex').map(r => ({ label: r.label, before: r.before, after: r.after, absolute: r.absolute, relative: r.relative }))).slice(0, 1);
        add('Media', 'Gastos operativos', `Los gastos operativos ${verb(opex.absolute, 'los gastos')} ${pct(opex.relative)} mientras las ventas ${verb(sales.absolute, 'las ventas')} ${pct(sales.relative)}${top.length ? `; ${top[0].label.toLowerCase()} ${verb(top[0].absolute, top[0].label)} ${pct(top[0].relative)}` : ''}.`, 'Alinear el crecimiento de los gastos con el de las ventas.', 'Presupuestar los gastos por centro de costo y revisar mensualmente las desviaciones.', 'Mensual');
      }
    }
    const order = { Alta: 0, Media: 1, Baja: 2 };
    return out.sort((a, b) => order[a.priority] - order[b.priority]);
  }

  // ---------- Comprobaciones ----------
  function checks(c, balance = analyzeBalance(c), income = analyzeIncome(c)) {
    const out = [], p = c.periods || {};
    const add = (name, side, reported, calculated, note) => {
      const difference = has(reported) && has(calculated) ? reported - calculated : null;
      out.push({ name, period: side ? p[side] : '—', reported, calculated, difference, ok: difference === null ? null : Math.abs(difference) <= 0.01, note });
    };
    const reported = c.reported || {};
    for (const side of SIDES) {
      if (balance.errors[side] && !balance.issues.some(x => x.text === balance.errors[side])) out.push({ name: 'Clasificación de cuentas', period: p[side], reported: null, calculated: null, difference: null, ok: false, note: balance.errors[side] });
    }
    balance.groups.forEach(g => SIDES.forEach(side => { if (has(reported[g.key]?.[side])) add(g.name, side, reported[g.key][side], g.total[side], 'Total del documento vs suma de cuentas'); }));
    [['assets', 'Total activos'], ['liabilities', 'Total pasivo'], ['equity', 'Total capital'], ['funding', 'Total pasivo y capital']].forEach(([key, name]) => SIDES.forEach(side => { if (has(reported[key]?.[side])) add(name, side, reported[key][side], balance.totals[key][side], 'Total del documento vs suma de cuentas'); }));
    // Totales importados de todo un plazo y del estado de resultados.
    const balanceParts = { currentAssets: 'Activos circulantes', nonCurrentAssets: 'Activos no circulantes', currentLiabilities: 'Pasivo de corto plazo', nonCurrentLiabilities: 'Pasivo de largo plazo' };
    Object.entries(balanceParts).forEach(([part, label]) => SIDES.forEach(side => {
      const expected = reported[`balance:${part}`]?.[side];
      if (has(expected)) add(label, side, expected, balance.engine[side]?.[part] ?? null, 'Total del documento vs suma de cuentas');
    }));
    const incomeTotals = { sales: 'Ventas netas', costSales: 'Costo de ventas', grossProfit: 'Utilidad bruta', operatingExpenses: 'Gastos operativos', otherIncome: 'Otros ingresos', interest: 'Gastos financieros', taxes: 'Impuestos', ebit: 'Utilidad operativa', ebt: 'Utilidad antes de impuestos', netProfit: 'Utilidad neta', commonProfit: 'Utilidad disponible para acciones comunes' };
    Object.entries(incomeTotals).forEach(([part, label]) => SIDES.forEach(side => {
      const expected = reported[`income:${part}`]?.[side];
      if (has(expected)) add(label, side, expected, income.statements?.[side]?.[part] ?? null, 'Total del documento vs suma de cuentas');
    }));
    SIDES.forEach(side => { if (has(balance.totals.assets[side]) || has(balance.totals.funding[side])) add('Ecuación contable', side, balance.totals.assets[side], balance.totals.funding[side], 'Activo = Pasivo + Capital'); });
    // Una contracuenta no puede ser mayor que el activo que corrige.
    balance.issues.forEach(x => {
      if (x.type === 'exceeds') x.sides.forEach(side => { const net = balance.rows.find(r => r.type === 'net' && r.contra === x.id); out.push({ name: net ? net.label : x.name, period: p[side], reported: null, calculated: net?.values[side] ?? null, difference: null, ok: false, note: x.text }); });
      else out.push({ name: x.name, period: '—', reported: null, calculated: null, difference: null, ok: false, note: x.text });
    });
    const blanks = (c.balance || []).filter(a => SIDES.some(side => !has(a.amounts?.[side])) && SIDES.some(side => has(a.amounts?.[side])));
    if (blanks.length) out.push({ name: 'Cuentas incompletas', period: '—', reported: null, calculated: null, difference: null, ok: false, note: `Sin importe en un período: ${blanks.map(a => a.name).join(', ')}. Escribe 0 si la cuenta no existía.` });
    if (!income.empty) {
      for (const side of SIDES) if (income.errors[side]) out.push({ name: 'Estado de resultados', period: p[side], reported: null, calculated: null, difference: null, ok: false, note: income.errors[side] });
      if (income.missing.length) out.push({ name: 'Estado de resultados incompleto', period: '—', reported: null, calculated: null, difference: null, ok: false, note: `Falta informar: ${income.missing.join(', ')}. Escribe 0 si la cuenta no existe.` });
    }
    const pending = out.filter(x => x.ok === false).length;
    return { items: out, pending, ok: pending === 0 };
  }

  const api = { contraRuns, SIDES, BLOCKS, SECTIONS, INCOME_BLOCKS, SAMPLE_IDS, samples: Object.fromEntries(SAMPLE_IDS.map(id => [id, () => SAMPLES[id]()])), blankCase, defaultGroup, store, analyzeBalance, analyzeIncome, indicators, ratios, interpret, recommend, checks, fmt, engine: F };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinoraCasos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
