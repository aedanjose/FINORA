/* Adaptación local del lector de GestiCode: mantiene celdas vacías y valida la forma de los importes. */
/* Importador de tablas pegadas (Fase 0, sin IA).
   Lee texto de un balance o de un estado de resultados, propone cuentas con el catálogo del motor y
   VERIFICA lo propuesto con el motor: totales del documento, cuadre y utilidades derivadas.
   No calcula indicadores: solo prepara cuentas para que las validaciones de siempre las revisen. */
(function (root) {
  'use strict';
  const F = (typeof module !== 'undefined' && module.exports) ? require('./finance.js') : root.Finance;
  const SLOTS = ['previous', 'current'];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%$()\-.,:;/&+ ñ]/g, ' ').replace(/\s+/g, ' ').trim();
  const CURRENCY = /^(?:[$€£¥]|c\$|us\$|usd|nio|eur)$/i;

  // ── Cifras ────────────────────────────────────────────────────────────────────
  // «(1,234)» y «-1,234» son negativos; «—» es cero (con aviso); 1,234.56 es el formato por defecto, y 1.234,56 se reconoce.
  function parseAmount(token, decimal = 'auto') {
    let t=String(token??'').trim(), negative=false;
    if (/^[-–—−]+$/.test(t)) return {value:0,doubt:'Un guion se leyó como 0.'};
    if (/^\(.*\)$/.test(t)) {negative=true;t=t.slice(1,-1).trim();}
    t=t.replace(/[−–]/g,'-').replace(/^(?:c\$|us\$|u\$|usd|nio|eur)\s*/i,'').replace(/^[$€£¥]\s*/,'').replace(/%$/,'').trim();
    if(t.startsWith('-')){negative=true;t=t.slice(1).trim();}
    if(t.endsWith('-')){negative=true;t=t.slice(0,-1).trim();}
    if(/\s/.test(t)) { if(!/^\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?$/.test(t))return null;t=t.replace(/[ \u00a0]/g,''); }
    if(!/^\d+(?:[.,]\d+)*$/.test(t))return null;
    const dots=(t.match(/\./g)||[]).length,commas=(t.match(/,/g)||[]).length;let value,doubt=null;
    if(dots&&commas){const mark=t.lastIndexOf('.')>t.lastIndexOf(',')?'.':',';const re=mark==='.'?/^\d{1,3}(?:,\d{3})*\.\d+$/:/^\d{1,3}(?:\.\d{3})*,\d+$/;if(!re.test(t))return null;value=Number(mark==='.'?t.replace(/,/g,''):t.replace(/\./g,'').replace(',','.'));}
    else if(commas){if(/^\d{1,3}(?:,\d{3})+$/.test(t)){value=Number(t.replace(/,/g,''));if(commas===1)doubt='La coma de tres cifras se leyó como separador de miles.';}else if(commas===1){value=Number(t.replace(',','.'));}else return null;}
    else if(dots>1){if(!/^\d{1,3}(?:\.\d{3})+$/.test(t))return null;value=Number(t.replace(/\./g,''));}
    else {value=Number(t);if(/^\d{1,3}\.\d{3}$/.test(t))doubt='El punto se leyó como decimal; comprueba si representa miles.';}
    if(!Number.isFinite(value)||Math.abs(value)>1e15)return null;
    return {value:negative?-value:value,doubt};
  }

  // Separa una línea en nombre y cifras. Con tabuladores o «;» conserva las celdas vacías como «sin informar».
  function splitLine(raw) {
    const line = raw.replace(/ /g, ' ').replace(/[.·…_]{3,}/g, ' ');
    if (/[\t;]/.test(line)) {
      const cells = line.split(/[\t;]/).map(c => c.trim());
      // Conservar también el último período vacío.
      let name = cells.shift() ?? '';
      const amounts = [];
      for (const c of cells) {
        if (c === '') { amounts.push({ value: null, doubt: null }); continue; }
        const stripped = c.split(/\s+/).filter(x => !CURRENCY.test(x)).join('');
        const a = parseAmount(stripped);
        if (a) amounts.push(a); else if (/^\d{1,2}\/\d{4}$/.test(c)) name = `${name} ${c}`.trim(); else amounts.push({value:null,doubt:`Importe no válido: ${c}`,invalid:true,raw:c});
      }
      // El punto final se conserva («Seguro pagado x Ad.»); solo se comparan nombres sin él.
      return { name: name.replace(/[:\s]+$/, '').trim(), amounts, delimited: true };
    }
    const tokens = line.trim().split(/\s+/).filter(Boolean), amounts = [];
    let end = tokens.length;
    while (end > 0) {
      const t = tokens[end - 1];
      if (CURRENCY.test(t)) { end--; continue; }
      const a = parseAmount(t);
      if (!a) break;
      amounts.unshift(a); end--;
    }
    return { name: tokens.slice(0, end).join(' ').replace(/[:\s]+$/, '').trim(), amounts, delimited: false };
  }

  // ── Vocabulario ───────────────────────────────────────────────────────────────
  const plain = name => String(name ?? '').replace(/\.+$/, '').trim();
  const stripPrefix = name => { const m = /^\s*(?:\((?:-|\+)\)|(?:menos|m[aá]s|less|plus)\b)\s*[:.-]?\s*/i.exec(name); return m ? { text: name.slice(m[0].length).trim(), minus: /menos|less|\(-\)/i.test(m[0]) } : { text: name.trim(), minus: false }; };
  function balanceHeader(n) {
    if (/^(total|suma|subtotal)\b/.test(n)) return null;
    const has = w => n.includes(w);
    if (/^capital( contable)?$/.test(n)) return { section: 'equity', term: null };
    if (/^otros activos$/.test(n)) return { section: 'asset', term: 'noncurrent' };
    if (has('pasivo') && has('patrimonio')) return { section: 'liability', term: null };
    if (has('activo')) return { section: 'asset', term: has('no corriente') || has('fijo') || has('largo plazo') || has('no circulante') ? 'noncurrent' : has('corriente') || has('circulante') ? 'current' : null };
    if (has('pasivo')) return { section: 'liability', term: has('no corriente') || has('largo plazo') || has('no circulante') ? 'noncurrent' : has('corriente') || has('circulante') || has('corto plazo') ? 'current' : null };
    if (has('patrimonio') || has('capital contable') || has('capital social') || has('accionistas')) return { section: 'equity', term: null };
    return null;
  }
  const incomeHeader = n => /^(total|suma|subtotal)\b/.test(n) ? null : /gastos (operativos|de operacion)/.test(n) ? 'opex' : /gastos financieros|intereses/.test(n) ? 'interest' : /^costo|costos de/.test(n) ? 'costSales' : /^(ingresos|ventas)/.test(n) ? 'sales' : /impuestos/.test(n) ? 'taxes' : /dividendos/.test(n) ? 'preferred' : null;
  function balanceTotalPart(n) {
    n = n.replace(/^(total|suma|subtotal),\s*/, '$1 ');
    const isTotal = /^(total|suma|subtotal)\b/.test(n), rest = n.replace(/^(total de|total|suma de|suma|subtotal de|subtotal)\s+/, '');
    const head = balanceHeader(rest);
    if (/pasivos?(?: y |\s*\+\s*)(patrimonio|capital)/.test(rest)) return isTotal ? 'funding' : null;
    if (!head) return null;
    // sin la palabra «total» solo es un total si la línea es exactamente el nombre de una sección («Activos corrientes», «Patrimonio»…);
    // «Activos fijos netos» y similares son subtotales de un bloque: se verifican con la suma de las cuentas que los preceden
    if (!isTotal && !/^(activos?|pasivos?)( (corrientes?|no corrientes?|circulantes?|no circulantes?))?$|^patrimonio( de los accionistas)?$|^capital contable$/.test(rest)) return null;
    if (head.section === 'asset') return head.term === 'current' ? 'currentAssets' : head.term === 'noncurrent' ? 'nonCurrentAssets' : 'assets';
    if (head.section === 'liability') return head.term === 'current' ? 'currentLiabilities' : head.term === 'noncurrent' ? 'nonCurrentLiabilities' : 'liabilities';
    return 'equity';
  }
  function incomeDerived(n) {
    if (/accionistas comunes|para los comunes|utilidad para comunes/.test(n)) return 'commonProfit';
    if (/utilidad por accion|ganancias? por accion|^upa\b/.test(n)) return 'eps';
    if (/antes de impuestos|^uai\b|\bneta ai\b/.test(n)) return 'ebt';
    if (/utilidad neta|ganancia neta|resultado neto|despues de impuestos|\bneta di\b/.test(n)) return 'netProfit';
    if (/utilidad operativa|utilidad de operacion|^uaii\b|antes de intereses/.test(n)) return 'ebit';
    if (/utilidad bruta|margen bruto|ganancia bruta/.test(n)) return 'grossProfit';
    if (/^total (de )?gastos operativos|^total (de )?gastos de operacion/.test(n)) return 'operatingExpenses';
    if (/^total (de )?costos?/.test(n)) return 'costSales';
    return null;
  }
  // Nombres que cambian de sentido según el lado del balance: el encabezado del documento decide.
  const TWO_SIDED = /^(bancos?|impuestos? (sobre la renta )?diferidos?|acciones( preferentes| comunes)?)$/;
  const MEANINGS = [
    [/^prestamos?\b/, 'préstamo por cobrar (dinero que prestaste)', 'préstamo por pagar (dinero que debes)'],
    [/^anticipos?\b/, 'anticipo entregado', 'anticipo recibido'],
    [/^documentos?\b/, 'documento por cobrar', 'documento por pagar'],
    [/^intereses?\b/, 'intereses por cobrar', 'intereses por pagar'],
    [/^(impuestos?|iva|ir|isr)\b/, 'impuesto a favor (por cobrar)', 'impuesto por pagar'],
    [/^depositos?\b/, 'depósito entregado', 'depósito recibido']
  ];
  const contextMeaning = (n, section) => { const m = MEANINGS.find(([re]) => re.test(n)); return m && section !== 'equity' ? m[section === 'asset' ? 1 : 2] : null; };
  // Rol sugerido por palabras clave cuando el nombre no está en el catálogo (siempre con aviso).
  const roleHints = [[/efectivo|caja|banco/, 'cash'], [/cuentas? (por|a) cobrar|clientes|deudores/, 'receivables'], [/inventario|mercader/, 'inventory'], [/cuentas? (por|a) pagar|proveedores/, 'payables'], [/prestamos?|hipoteca|bonos|deuda|obligaciones financieras/, 'longDebt'], [/terreno|edificio|maquinaria|equipo|mobiliario|vehiculo|planta/, 'fixed']];
  const categoryHints = [[/tasa.*(impuesto|impositiv|fiscal)|tasa de isr/, 'taxRate'], [/ventas? a credito/, 'creditSales'], [/numero de acciones|acciones en circulacion|acciones comunes en circulacion/, 'shares'], [/costos? fijos/, 'fixedCosts'], [/compras? (reales )?a credito/, 'creditPurchases'], [/costo/, 'costSales'], [/gasto.*(venta|admin|general|arrend|deprec|operativ)|deprec|arrend/, 'opex'], [/interes|financier/, 'interest'], [/impuesto/, 'taxes'], [/dividendo/, 'preferred'], [/venta|ingreso/, 'sales']];

  // ── Análisis del texto ────────────────────────────────────────────────────────
  function analyze(text, options = {}) {
    const o = { kind: 'balance', decimal: 'auto', order: 'auto', multiplier: 1, ...options };
    const isBalance = o.kind === 'balance';
    const raw = String(text ?? '');
    const notes = [], items = [];
    let years = [];
    const unitsHint = /\b(?:en|de)\s+miles\b|\(miles|miles de (?:d[oó]lares|pesos|c[oó]rdobas|euros|\$)/i.test(raw) ? 'miles' : /\ben millones\b|millones de/i.test(raw) ? 'millones' : null;

    raw.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim() || /^[\s\-=_*#.·]+$/.test(line)) return;
      const { name, amounts, delimited } = splitLine(line), n = norm(plain(name));
      if (!amounts.length && !name) return;
      const values = amounts.map(a => a.value);
      if (!amounts.length) { const ys = [...name.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m => Number(m[1])); if (ys.length >= 2 && ys[0] !== ys[1]) { years = ys.slice(0, 2); return; } }
      const onlyYears = values.length > 0 && values.every(v => Number.isInteger(v) && v >= 1900 && v <= 2100);
      if (onlyYears && (!n || (!(isBalance ? F.matchAccount(name) : F.matchIncomeAccount(name)) && /^(cuenta|concepto|rubro|periodo|periodos|ano|anos|ejercicio|ejercicios)$/.test(n)))) { years = values; return; }
      items.push({ line: index + 1, name, n, amounts, delimited });
    });

    const dataItems = items.filter(i => i.amounts.some(a => a.value !== null) || (i.delimited && i.amounts.length));
    const counts = dataItems.map(i => i.amounts.length).filter(Boolean);
    const ncols = counts.length ? Number(Object.entries(counts.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0][0]) : 0;
    let columns, orderAssumed = false;
    if (ncols <= 1 && years.length < 2) columns = ['current'];
    else if (o.order === 't1t2') columns = ['previous', 'current'];
    else if (o.order === 't2t1') columns = ['current', 'previous'];
    else if (years.length >= 2) columns = years[0] > years[1] ? ['current', 'previous'] : ['previous', 'current'];
    else { columns = ['previous', 'current']; orderAssumed = true; }
    if (ncols > 2) notes.push(`Hay ${ncols} columnas de cifras; solo se usan las dos primeras.`);
    const yearFor = slot => years.length >= 2 ? (columns.indexOf(slot) === 0 ? years[0] : years[1]) : null;
    const scale = Number(o.multiplier) || 1;
    const toSlots = amounts => { const out = { previous: null, current: null }; amounts.slice(0, columns.length).forEach((a, i) => { out[columns[i]] = a.value === null ? null : a.value * scale; }); return out; };

    const rows = [], docTotals = [];
    let context = isBalance ? { section: null, term: null } : { category: null }, block = [];
    let nextId = 1;
    const addDoubt = (row, level, text) => row.doubts.push({ level, text });

    for (const it of items) {
      const hasData = it.amounts.some(a => a.value !== null) || (it.delimited && it.amounts.length && (isBalance ? F.matchAccount(plain(stripPrefix(it.name).text)) : F.matchIncomeAccount(plain(stripPrefix(it.name).text))));
      const { text: bare, minus } = stripPrefix(it.name), bn = norm(plain(bare));
      if (!hasData) {                                    // encabezado de sección o título
        const h = isBalance ? balanceHeader(it.n) : incomeHeader(it.n);
        if (isBalance && h) { context = h; block = []; }
        else if (!isBalance && h) { context = { category: h }; block = []; }
        continue;
      }
      const slots = toSlots(it.amounts);
      const parseDoubts = it.amounts.map(a => a.doubt).filter(Boolean);
      // ── totales y líneas derivadas del propio documento ──
      const named = isBalance ? balanceTotalPart(it.n) : incomeDerived(it.n);
      if (named && named !== 'eps') { docTotals.push({ line: it.line, name: it.name, part: named, amounts: slots, members: null, doubts: parseDoubts }); block = []; if (!isBalance) context = { category: null }; continue; }
      if (named === 'eps') continue;
      // ── subtotal sin nombre de total (p. ej. «Activos fijos netos»): coincide con la suma del bloque anterior ──
      const signedOf = r => Number(r.sign ?? 1) * 1;
      const hit = isBalance ? F.matchAccount(plain(bare)) : F.matchIncomeAccount(plain(bare));
      let matched = false;
      // el total coincide con la suma de las últimas k líneas del bloque (cuentas o subtotales ya reconocidos); un «Total» suelto admite k = 1
      const asTotalLine = /^(total|suma|subtotal)\b/.test(it.n);
      for (let k = (asTotalLine || /netos?$/.test(it.n)) ? block.length : 0; k >= (asTotalLine ? 1 : Math.max(2, block.length)); k--) {
        const part = block.slice(block.length - k), sums = {};
        for (const s of SLOTS) sums[s] = part.reduce((t, r) => t + signedOf(r) * (r.amounts[s] ?? 0), 0);
        const present = SLOTS.filter(s => slots[s] !== null);
        const matches = present.filter(s => Math.abs(slots[s]) > 0 && Math.abs(slots[s] - sums[s]) <= Math.max(1, Math.abs(slots[s]) * 1e-6));
        if (!present.length || matches.length !== present.length) continue;
        const members = part.flatMap(r => r.members || [r.id]);
        docTotals.push({ line: it.line, name: it.name, part: null, amounts: slots, members, doubts: parseDoubts });
        block = [...block.slice(0, block.length - k), { pseudo: true, sign: 1, amounts: slots, members }];
        matched = true; break;
      }
      if (matched) continue;
      if (asTotalLine && !hit && block.length) {   // parece un total pero no suma: se deja verificar contra el bloque para mostrar la diferencia
        docTotals.push({ line: it.line, name: it.name, part: null, amounts: slots, members: block.flatMap(r => r.members || [r.id]), doubts: parseDoubts });
        block = []; continue;
      }
      // ── cuenta ──
      const row = { id: nextId++, line: it.line, name: bare || it.name, include: true, amounts: slots, doubts: [], memberOf: null };
      parseDoubts.forEach(d => addDoubt(row, 'warn', d));
      if (isBalance) {
        if (hit && context.section && context.section !== hit.section && TWO_SIDED.test(bn)) {
          // Nombre del catálogo que existe en ambos lados («Impuesto sobre la renta diferido», «Bancos»): decide el encabezado.
          Object.assign(row, { section: context.section, term: context.term, role: null, sign: 1, memo: false });
          addDoubt(row, 'warn', `«${bare}» puede ser ${one(hit.section)} o ${one(context.section)}; está bajo un encabezado de ${label(context.section)}, así que se tomó como ${one(context.section)}. Confírmalo.`);
        } else if (hit) {
          Object.assign(row, { section: hit.section, term: hit.term, role: hit.role, sign: hit.sign, memo: hit.memo });
          if (context.section && context.section !== hit.section) addDoubt(row, 'warn', `El nombre sugiere ${label(hit.section)}, pero está bajo un encabezado de ${label(context.section)}. Se usó la del nombre.`);
        } else {
          Object.assign(row, { section: context.section, term: context.term, role: null, sign: 1, memo: false });
          const meaning = context.section && contextMeaning(bn, context.section);
          if (meaning) addDoubt(row, 'warn', `«${bare}» bajo ${label(context.section)}: se tomó como ${meaning}. Confírmalo.`);
          else if (context.section) addDoubt(row, 'warn', `Nombre fuera del catálogo: clasificación tomada del encabezado (${label(context.section)}${context.term ? ', ' + (context.term === 'current' ? 'corriente' : 'no corriente') : ''}). Confírmala.`);
          const hint = roleHints.find(([re]) => re.test(bn));
          if (hint && context.section) {
            const rule = F.accountRoles[hint[1]];
            if (rule && rule.section === row.section && (rule.term === row.term || row.term === null)) { row.role = hint[1]; row.term = rule.term; addDoubt(row, 'warn', `Rol sugerido por el nombre: «${rule.label}». Confírmalo.`); }
          }
          if (/deprec\w*[^,;]*acum|amortizac\w*[^,;]*acum|agotamiento\w*[^,;]*acum/.test(bn)) { row.sign = -1; row.section = 'asset'; row.term = 'noncurrent'; row.role = 'fixed'; addDoubt(row, 'warn', 'Se trató como cuenta que resta de los activos fijos.'); }
        }
        if (minus && row.sign === 1 && row.section === 'asset') { row.sign = -1; addDoubt(row, 'warn', 'Precedida por «Menos:»: se trató como cuenta que resta.'); }
        if (!row.section || (row.section !== 'equity' && !row.term)) addDoubt(row, 'error', row.section ? 'Falta decidir si es corriente o no corriente.' : 'No pude clasificarla: elige activo, pasivo o patrimonio.');
      } else {
        if (hit) {
          Object.assign(row, { category: hit.category, sign: hit.sign });
          if (minus && hit.category === 'sales' && hit.sign === 1) { row.sign = -1; addDoubt(row, 'warn', 'Precedida por «Menos:» dentro de ventas: se trató como deducción.'); }
        } else {
          const hint = categoryHints.find(([re]) => re.test(bn));
          row.category = context.category ?? (hint ? hint[1] : null); row.sign = minus && row.category === 'sales' ? -1 : 1;
          if (row.category) addDoubt(row, 'warn', context.category ? `Nombre fuera del catálogo: categoría tomada del encabezado. Confírmala.` : `Categoría sugerida por el nombre. Confírmala.`);
          else addDoubt(row, 'error', 'No pude clasificarla: elige su categoría.');
        }
      }
      if (!isBalance) {   // la tasa no se escala: 0.35 son 0.35 aunque las cifras estén en miles
        const rawOf = side => { const i = columns.indexOf(side); return i >= 0 && i < it.amounts.length ? it.amounts[i].value : null; };
        const rawSides = SLOTS.filter(side => rawOf(side) !== null);
        if (row.category === 'taxes' && rawSides.length && rawSides.every(side => rawOf(side) > 0 && rawOf(side) < 1)) { row.category = 'taxRate'; addDoubt(row, 'warn', 'Cifras entre 0 y 1 en «Impuestos»: se leyeron como tasa de impuestos (0.35 = 35 %). Confírmalo.'); }
        if (row.category === 'taxRate') {
          for (const side of rawSides) row.amounts[side] = rawOf(side);
          if (rawSides.some(side => rawOf(side) >= 1 && rawOf(side) <= 100)) { for (const side of rawSides) if (rawOf(side) >= 1 && rawOf(side) <= 100) row.amounts[side] = rawOf(side) / 100; addDoubt(row, 'warn', 'La tasa se leyó como porcentaje (35 % = 0.35). Confírmalo.'); }
        }
      }
      // signos: un monto negativo entre paréntesis en activos/pasivos es una cuenta que resta
      const present = SLOTS.filter(s => row.amounts[s] !== null), neg = present.filter(s => row.amounts[s] < 0), pos = present.filter(s => row.amounts[s] > 0);
      if (neg.length && pos.length) addDoubt(row, 'error', 'Los períodos tienen signos distintos: revisa los importes.');
      else if (neg.length) {
        const allowsNegative = isBalance ? row.section === 'equity' : row.category === 'taxes';
        if (row.sign === -1) { for (const s of neg) row.amounts[s] = Math.abs(row.amounts[s]); }
        else if (allowsNegative) addDoubt(row, 'warn', isBalance ? 'Monto negativo en patrimonio (pérdida acumulada).' : 'Monto negativo en impuestos (beneficio fiscal).');
        else { row.sign = -1; for (const s of neg) row.amounts[s] = Math.abs(row.amounts[s]); addDoubt(row, 'warn', 'Monto negativo: se trató como cuenta que resta.'); }
      }
      rows.push(row); block.push(row);
    }
    // totales sin detalle: si ninguna cuenta cae en la parte que resume, el total es el dato (ejercicios que solo dan totales)
    if (isBalance) {
      const partOf = r => !r.section ? null : r.section === 'equity' ? 'equity' : (r.section === 'asset' ? (r.term === 'current' ? 'currentAssets' : 'nonCurrentAssets') : (r.term === 'current' ? 'currentLiabilities' : 'nonCurrentLiabilities'));
      for (const t of docTotals) {
        if (!['currentAssets', 'nonCurrentAssets', 'currentLiabilities', 'nonCurrentLiabilities', 'equity'].includes(t.part)) continue;
        const inPart = rows.filter(r => partOf(r) === t.part);
        if (inPart.length) continue; // El total comprueba los detalles existentes; no los convierte en memo.
        const hit = F.matchAccount(t.name), sect = t.part === 'equity' ? { section: 'equity', term: null } : { section: t.part.includes('Assets') ? 'asset' : 'liability', term: t.part.startsWith('current') ? 'current' : 'noncurrent' };
        const row = { id: nextId++, line: t.line, name: t.name, include: true, amounts: t.amounts, doubts: [{ level: 'warn', text: 'No hay cuentas de detalle: este total se importa como dato. Si luego agregas el detalle, desmárcalo.' }], memberOf: null, section: sect.section, term: sect.term, role: null, sign: 1, memo: false };
        if (hit) Object.assign(row, { section: hit.section, term: hit.term, role: hit.role, sign: hit.sign, memo: hit.memo });
        rows.push(row); t.asAccount = row.id;
      }
    }
    if (!isBalance && rows.length) {
      const have = new Set(rows.filter(r => r.include && r.category).map(r => r.category));
      const missing = [['sales', 'ventas'], ['costSales', 'costo de ventas'], ['opex', 'gastos operativos'], ['interest', 'gastos por intereses'], ['preferred', 'dividendos preferentes']].filter(([c]) => !have.has(c)).map(([, l]) => l);
      if (!have.has('taxes') && !have.has('taxRate')) missing.push('impuestos');
      if (missing.length) notes.push(`No encontré: ${missing.join(', ')}. El estado de resultados pide todas las categorías; agrega una cuenta con 0 si no existen.`);
    }
    if (orderAssumed) notes.push('No encontré años en el encabezado: se asumió que la primera columna es el período anterior (T1). Cámbialo si no es así.');
    if (unitsHint) notes.push(`El texto menciona cifras «en ${unitsHint}». Elige la escala si hace falta.`);
    if (!rows.length && !docTotals.length) notes.push('No encontré cifras. Pega la tabla con una cuenta por línea y sus importes al final.');
    const proposal = { kind: o.kind, columns, years, yearFor: SLOTS.map(yearFor), unitsHint, orderAssumed, notes, rows, docTotals, options: { decimal: o.decimal, order: o.order, multiplier: scale } };
    proposal.check = verify(proposal);
    return proposal;
  }
  const one = section => section === 'asset' ? 'activo' : section === 'liability' ? 'pasivo' : 'capital';
  function label(section) { return section === 'asset' ? 'activos' : section === 'liability' ? 'pasivos' : 'patrimonio'; }

  // ── Verificación con el motor ─────────────────────────────────────────────────
  const unclassified = (kind, r) => kind === 'balance' ? (!r.section || (r.section !== 'equity' && !r.term)) : !r.category;
  function toAccounts(p, side) {
    return p.rows.filter(r => r.include).map(r => p.kind === 'balance'
      ? { name: r.name, section: r.section ?? null, term: r.term ?? null, role: r.role ?? null, sign: r.sign ?? 1, memo: !!r.memo, amount: r.amounts[side] ?? null }
      : { name: r.name, category: r.category ?? null, sign: r.sign ?? 1, amount: r.amounts[side] ?? null });
  }
  function verify(p) {
    const summary = {}, errors = {};
    for (const side of SLOTS) {
      const list = toAccounts(p, side);
      if (!list.some(a => a.amount !== null)) { summary[side] = null; continue; }
      try { summary[side] = p.kind === 'balance' ? F.summarizeBalance({ accounts: list }) : F.summarizeIncome({ accounts: list }); }
      catch (e) { summary[side] = null; errors[side] = e.message; }
    }
    const totals = p.docTotals.filter(t => !t.asAccount).map(t => {
      const result = { name: t.name, line: t.line, part: t.part, doc: t.amounts, expected: { previous: null, current: null }, diff: { previous: null, current: null }, status: 'na' };
      let anyOk = false, anyBad = false;
      for (const side of SLOTS) {
        const doc = t.amounts[side];
        if (doc === null) continue;
        let expected = null;
        if (t.members) {
          const members = p.rows.filter(r => t.members.includes(r.id) && r.include);
          if (members.length && members.every(r => r.amounts[side] !== null)) expected = members.reduce((s, r) => s + (r.sign ?? 1) * r.amounts[side], 0);
        } else if (summary[side]) expected = summary[side][t.part];
        if (typeof expected !== 'number' || !Number.isFinite(expected)) continue;
        result.expected[side] = expected; result.diff[side] = doc - expected;
        if (Math.abs(doc - expected) <= Math.max(1, Math.abs(doc) * 1e-6)) anyOk = true; else anyBad = true;
      }
      result.status = anyBad ? 'diff' : anyOk ? 'ok' : 'na';
      return result;
    });
    const cuadre = {};
    if (p.kind === 'balance') for (const side of SLOTS) {
      const s = summary[side];
      cuadre[side] = !s ? { state: errors[side] ? 'error' : 'nodata', message: errors[side] || null } : s.partial ? { state: 'partial' } : { state: s.balanced ? 'ok' : 'bad', difference: s.difference, assets: s.assets, funding: s.funding };
    }
    const blockers = [];
    for (const r of p.rows) if (r.include && unclassified(p.kind, r) && SLOTS.some(s => r.amounts[s] !== null)) blockers.push(`${r.name || 'Cuenta sin nombre'}: falta la clasificación.`);
    const hasClassification = blockers.length > 0;   // el motor repetiría ese mismo aviso por período: se omite
    for (const [side, message] of Object.entries(errors)) if (!/al menos una cuenta/.test(message) && !(hasClassification && /indica si es activo, pasivo o patrimonio|indica si es corriente|elige la categoría/.test(message))) blockers.push(`${side === 'current' ? 'T2' : 'T1'}: ${message}`);
    if (p.rows.filter(r => r.include).length > 80) blockers.push('Más de 80 cuentas: el caso admite hasta 80.');
    const partsPresent = { currentAssets: false, nonCurrentAssets: false, currentLiabilities: false, nonCurrentLiabilities: false, equity: false };
    if (p.kind === 'balance') for (const r of p.rows) {
      if (!r.include || !r.section || !SLOTS.some(s => r.amounts[s] !== null)) continue;
      const key = r.section === 'equity' ? 'equity' : r.term ? (r.section === 'asset' ? (r.term === 'current' ? 'currentAssets' : 'nonCurrentAssets') : (r.term === 'current' ? 'currentLiabilities' : 'nonCurrentLiabilities')) : null;
      if (key) partsPresent[key] = true;
    }
    const withData = p.rows.some(r => r.include && SLOTS.some(s => r.amounts[s] !== null));
    if (!withData) blockers.push('No hay ninguna cuenta con importe para importar.');
    return { summary, totals, cuadre, blockers, partsPresent, importable: blockers.length === 0 };
  }

  // Cuentas listas para el estado de la aplicación (solo las marcadas y con algún importe).
  function toStateRows(p) {
    return p.rows.filter(r => r.include && SLOTS.some(s => r.amounts[s] !== null)).map(r => p.kind === 'balance'
      ? { name: r.name, section: r.section, term: r.term ?? null, role: r.role ?? null, sign: r.sign ?? 1, memo: !!r.memo, amounts: { previous: r.amounts.previous, current: r.amounts.current } }
      : { name: r.name, category: r.category, sign: r.sign ?? 1, amounts: { previous: r.amounts.previous, current: r.amounts.current } });
  }

  // Rol por palabra clave, solo si corresponde a la sección y el plazo de la cuenta.
  function suggestRole(name, section, term) {
    const hint = roleHints.find(([re]) => re.test(norm(plain(name))));
    const rule = hint && F.accountRoles[hint[1]];
    return rule && rule.section === section && rule.term === term ? hint[1] : null;
  }
  const api = { parseAmount, splitLine, analyze, verify, toStateRows, unclassified, suggestRole };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FinoraTableImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
