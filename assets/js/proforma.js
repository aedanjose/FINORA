/* Proforma desde estados históricos. Las premisas se guardan aparte del presupuesto.
   El motor compartido resuelve los estados; aquí se proyectan sus entradas. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const C = node ? require('./casos.js') : root.FinoraCasos, F = C.engine;
  const finite = Number.isFinite, clone = value => JSON.parse(JSON.stringify(value));
  const LIMIT = 1e15, DAY = 86400000;
  const incomeFields = { sales: 'Ventas', costSales: 'Costo de ventas', opex: 'Gastos operativos', otherIncome: 'Otros ingresos netos', interest: 'Intereses' };
  const balanceFields = { cash: 'Efectivo mínimo', receivables: 'Cuentas por cobrar', inventory: 'Inventarios',
    otherCurrentAssets: 'Otros activos corrientes', fixed: 'Activos fijos netos', otherNonCurrentAssets: 'Otros activos no corrientes',
    payables: 'Cuentas por pagar', otherCurrentLiabilities: 'Otras obligaciones corrientes (incluye deuda corta)',
    longDebt: 'Deuda a largo plazo', otherNonCurrentLiabilities: 'Otros pasivos no corrientes', equity: 'Patrimonio' };
  const context = c => JSON.stringify([c.id, c.periods, c.currency, c.scale]);
  const calc = (fn, ...values) => { const v = values.every(finite) ? fn(...values) : null; return finite(v) && Math.abs(v) <= LIMIT ? v : null; };
  const sum = values => values.length ? calc((...v) => v.reduce((a, b) => a + b, 0), ...values) : null;
  function number(value, label, issues, min = 0, max = LIMIT) {
    if (!finite(value) || value < min || value > max) { issues.push(`${label}: informa un valor entre ${min} y ${max}; vacío no equivale a cero.`); return null; }
    return value;
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const n = Date.parse(value + 'T00:00:00Z');
    return finite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
  }
  function historicalEnd(label) {
    if (/^\d{4}$/.test(label || '')) return label + '-12-31';
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(label || '')) {
      const first = date(label + '-01');
      const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
      return d.toISOString().slice(0, 10);
    }
    return date(label) === null ? '' : label;
  }
  function newProjection(c) {
    return { version: 1, id: C.store.newId('proforma'), name: 'Proyección histórica', context: context(c),
      historicalPeriod: 'current', historicalEnd: historicalEnd(c.periods?.current), start: '', end: '',
      method: 'sales', salesMode: 'growth', salesValue: null, lines: {},
      taxMode: 'historical', taxRate: null, taxLoss: 'none', dividendMode: 'amount', dividends: null,
      balance: { enabled: false, absentZero: false, cash: null,
        receivablesMode: 'sales', receivables: null, collectionDays: null, salesCreditPercent: null, openingReceivablesRemaining: null,
        inventoryMode: 'sales', inventory: null, capex: null, disposals: null, depreciationMode: 'selected',
        payablesMode: 'sales', payables: null, purchasesMode: 'manual', purchases: null, paymentDays: null,
        purchasesCreditPercent: null, openingPayablesRemaining: null, days: null,
        otherCurrentAssets: null, otherNonCurrentAssets: null, otherCurrentLiabilities: null, longDebt: null,
        otherNonCurrentLiabilities: null, equityChange: null, retainedOpening: null } };
  }
  function settingsFor(c) {
    const saved = c.params?.proforma;
    if (!saved) return newProjection(c);
    const defaults = newProjection(c);
    return { ...defaults, ...clone(saved), lines: clone(saved.lines || {}), balance: { ...defaults.balance, ...clone(saved.balance || {}) } };
  }
  function saveProjection(c, settings) {
    const copy = clone(c), s = clone(settings);
    if (s.context !== context(c)) throw new Error('La moneda, escala o períodos cambiaron. Crea una proyección nueva para este contexto.');
    copy.params ||= {};
    const list = clone(copy.params.proformaProjections || []), index = list.findIndex(p => p.id === s.id);
    if (index < 0) list.push(s); else list[index] = s;
    copy.params.proformaProjections = list; copy.params.proforma = s;
    return copy;
  }
  function history(c, side) {
    const issues = [], rows = (c.income || []).map((a, index) => ({ ...a, key: a.id || `line-${index}`, amount: a.amounts?.[side] }));
    const total = category => {
      const list = rows.filter(a => a.category === category);
      if (!list.length) return category === 'otherIncome' ? 0 : null; // Categoría opcional del formato histórico.
      return sum(list.map(a => finite(a.amount) && Math.abs(a.amount) <= LIMIT && [1, -1].includes(a.sign ?? 1)
        && (a.amount >= 0 || category === 'taxes') ? (a.sign ?? 1) * a.amount : null));
    };
    const values = Object.fromEntries(Object.keys(incomeFields).map(k => [k, total(k)]));
    for (const [k, label] of Object.entries(incomeFields)) if (!finite(values[k])) issues.push(`${label} históricos incompletos en el período seleccionado.`);
    // El adaptador histórico valida las categorías y los signos con el motor existente.
    const report = C.analyzeIncome(c);
    if (report.errors[side]) issues.push(report.errors[side]);
    const ratios = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, values.sales > 0 ? calc((v, base) => v / base, value, values.sales) : null]));
    return { rows, values, ratios, statement: report.statements[side], taxRate: total('taxRate'), taxes: total('taxes'),
      fixedCosts: total('fixedCosts'), fixedCostSales: total('fixedCostSales'), issues };
  }
  function lineSettings(h, s, row) {
    const setting = s.lines[row.key] || {}, list = h.rows.filter(a => a.category === row.category);
    const memo = row.category === 'opex' ? h.fixedCosts : row.category === 'costSales' ? h.fixedCostSales : null;
    let fixedPercent = setting.fixedPercent ?? null;
    if (fixedPercent === null && finite(memo) && finite(h.values[row.category]) && h.values[row.category] >= memo) {
      if (memo === 0) fixedPercent = 0;
      else if (h.values[row.category] === memo) fixedPercent = 100;
      else if (list.length === 1 && row.amount > 0) fixedPercent = memo / row.amount * 100;
    }
    return { fixedPercent, fixedGrowth: 0, amount: null, depreciation: false, ...setting };
  }
  function statement(input, issues) {
    const known = { sales: finite(input.sales), costSales: finite(input.costSales), operatingExpenses: finite(input.operatingExpenses),
      interest: finite(input.interest) && finite(input.otherIncome), taxes: finite(input.taxes), preferredDividends: true };
    try {
      const result = F.summarizeIncome({ ...input, preferredDividends: 0, known });
      if (['grossProfit', 'ebit', 'ebt', 'netProfit'].some(k => finite(result[k]) && Math.abs(result[k]) > LIMIT)) {
        issues.push('El resultado supera el límite de importes; revisa la escala y las premisas.');
        for (const k of ['grossProfit', 'ebit', 'ebt', 'netProfit']) result[k] = null;
      }
      return result;
    }
    catch (error) { issues.push(error.message); return {}; }
  }
  function projectIncome(h, s, sales, method) {
    const issues = [...h.issues], rows = [], totals = {}, fixed = { costSales: [], opex: [] };
    const factor = h.values.sales > 0 ? calc((a, b) => a / b, sales, h.values.sales) : null;
    for (const a of h.rows.filter(a => ['costSales', 'opex', 'interest', 'otherIncome'].includes(a.category))) {
      const label = a.name || incomeFields[a.category], p = lineSettings(h, s, a), sign = a.sign ?? 1;
      const historical = number(a.amount, `${label} histórico`, issues), ratio = h.values.sales > 0 ? calc((v, base) => sign * v / base, historical, h.values.sales) : null;
      let value = null, fixedValue = null, formula = '';
      const cost = a.category === 'costSales' || a.category === 'opex';
      if (method === 'mixed' && cost) {
        const percent = number(p.fixedPercent, `${label}: confirma el porcentaje fijo`, issues, 0, 100);
        const growth = number(p.fixedGrowth, `${label}: ajuste del componente fijo (%)`, issues, -100, LIMIT);
        const fixedHistorical = calc((v, pct) => v * pct / 100, historical, percent);
        fixedValue = calc((v, g) => sign * v * (1 + g / 100), fixedHistorical, growth);
        value = calc((f, v, fh, rate) => f + sign * (v - fh) * rate, fixedValue, historical, fixedHistorical, factor);
        formula = 'Fijo histórico × (1 + ajuste %) + variable histórico × ventas proyectadas / ventas históricas';
        fixed[a.category].push(fixedValue);
      } else {
        value = method === 'sales' ? calc((v, rate) => sign * v * rate, historical, factor) : calc(v => sign * v, historical);
        formula = method === 'sales' ? 'Importe histórico / ventas históricas × ventas proyectadas' : 'Importe histórico constante';
      }
      // El importe explícito reemplaza la cuenta completa, nunca se suma por segunda vez.
      if (p.amount !== null && p.amount !== undefined) {
        value = calc(v => sign * v, number(p.amount, `${label}: importe proyectado`, issues));
        if (method === 'mixed' && cost) {
          // Un importe total no permite deducir qué parte sigue siendo fija.
          fixed[a.category][fixed[a.category].length - 1] = null;
        }
        formula = 'Importe proyectado indicado por el usuario (reemplaza la cuenta)';
      }
      if (!finite(value) && finite(historical)) issues.push(`${label}: cálculo pendiente o fuera del límite de importes.`);
      rows.push({ key: a.key, label, category: a.category, historical: calc(v => sign * v, historical), ratio,
        value, fixedValue, depreciation: cost && p.depreciation === true, formula });
    }
    for (const k of ['costSales', 'opex', 'interest', 'otherIncome']) {
      const list = rows.filter(a => a.category === k);
      totals[k] = list.length ? sum(list.map(a => a.value)) : k === 'otherIncome' ? 0 : null;
    }
    let result = statement({ sales, costSales: totals.costSales, operatingExpenses: totals.opex, interest: totals.interest, otherIncome: totals.otherIncome, taxes: null }, issues);
    let taxRate = null;
    if (s.taxMode === 'historical') {
      taxRate = finite(h.taxRate) ? h.taxRate : h.statement?.ebt > 0 ? calc((t, e) => t / e, h.taxes, h.statement.ebt) : null;
      if (!finite(taxRate) || taxRate < 0 || taxRate >= 1) { issues.push('No se puede obtener una tasa de impuesto histórica válida; indica una tasa explícita.'); taxRate = null; }
    } else if (s.taxMode === 'rate') taxRate = calc(v => v / 100, number(s.taxRate, 'Tasa de impuesto (%)', issues, 0, 99.999999));
    else issues.push('Selecciona el tratamiento de impuestos.');
    const lossValid = ['none', 'credit'].includes(s.taxLoss);
    if (!lossValid) issues.push('Selecciona el tratamiento fiscal de las pérdidas.');
    const taxes = lossValid ? calc((ebt, rate) => (s.taxLoss === 'credit' ? ebt : Math.max(0, ebt)) * rate, result.ebt, taxRate) : null;
    result = statement({ sales, costSales: totals.costSales, operatingExpenses: totals.opex, interest: totals.interest, otherIncome: totals.otherIncome, taxes }, issues);
    let dividends = null;
    if (s.dividendMode === 'amount') dividends = number(s.dividends, 'Dividendos totales del período', issues);
    else if (s.dividendMode === 'percent') dividends = calc((v, p) => Math.max(0, v) * p / 100, result.netProfit, number(s.dividends, 'Dividendos (% de utilidad positiva)', issues, 0, 100));
    else issues.push('Selecciona el tratamiento de dividendos.');
    const retained = calc((n, d) => n - d, result.netProfit, dividends);
    const depreciationRows = rows.filter(a => a.depreciation);
    return { ...result, dividends, retained, taxRate, rows, method, issues: [...new Set(issues)],
      fixedCostSales: method === 'mixed' ? sum(fixed.costSales) : null, fixedCosts: method === 'mixed' ? sum(fixed.opex) : null,
      depreciation: depreciationRows.length ? sum(depreciationRows.map(a => a.value)) : null,
      margin: sales > 0 ? calc((n, v) => n / v, result.netProfit, sales) : null,
      ready: issues.length === 0 && finite(retained) };
  }
  function projectBalance(c, h, s, income, days) {
    const a = s.balance, issues = [], opening = {}, values = {}, calculations = [];
    if (!a.enabled) return { ready: false, issues: ['Balance proforma sin preparar; el Estado de Resultados puede utilizarse por separado.'], opening, values, calculations };
    const report = C.analyzeBalance(c), source = report.engine[s.historicalPeriod], accounts = c.balance || [];
    const empty = !accounts.some(row => finite(row.amounts?.[s.historicalPeriod]));
    if (!source || empty) issues.push('Falta el Balance General histórico del período seleccionado.');
    if (report.errors[s.historicalPeriod]) issues.push(report.errors[s.historicalPeriod]);
    const incomplete = accounts.some(row => !finite(row.amounts?.[s.historicalPeriod]));
    if (incomplete) issues.push('Hay cuentas históricas de balance sin importe; completa sus valores (cero si corresponde).');
    const hasSection = key => accounts.some(row => key === 'equity' ? row.section === 'equity' : row.section === (key.includes('Liabilities') ? 'liability' : 'asset') && row.term === (key.includes('NonCurrent') ? 'noncurrent' : 'current'));
    for (const key of Object.keys(balanceFields)) {
      const provided = source?.provided?.[key];
      const missing = provided === false || (provided === undefined && !hasSection(key));
      opening[key] = !source || incomplete || (missing && !a.absentZero) ? null : source[key];
    }
    if (source && source.balanced !== true) issues.push('El balance histórico no cuadra; revisa su diferencia antes de interpretar el financiamiento requerido.');
    const add = (key, value, formula) => { values[key] = value; calculations.push({ key, label: balanceFields[key] || key, value, formula }); return value; };
    const read = (key, label = balanceFields[key], min = 0, max = LIMIT) => number(a[key], label, issues, min, max);
    add('cash', read('cash'), 'Saldo objetivo mínimo: es un activo, no un gasto ni flujo de caja calculado');
    const basis = a.days === null ? days : read('days', 'Días de la base de ventas/compras', 1, 36600);
    function currentAccount(key, mode, valueKey) {
      if (mode === 'amount') return add(key, read(valueKey), 'Saldo final indicado por el usuario');
      if (mode === 'sales') return add(key, h.values.sales > 0 ? calc((v, base, sales) => v / base * sales, opening[key], h.values.sales, income.sales) : null, 'Saldo histórico / ventas históricas × ventas proyectadas');
      if (mode !== 'days' || key === 'inventory') { issues.push(`Selecciona el método para ${balanceFields[key]}.`); return add(key, null, 'Método pendiente'); }
      const receivable = key === 'receivables';
      const term = read(receivable ? 'collectionDays' : 'paymentDays', receivable ? 'Plazo de cobro (días)' : 'Plazo de pago (días)', 0, 36600);
      const percent = read(receivable ? 'salesCreditPercent' : 'purchasesCreditPercent', 'Operaciones a crédito (%)', 0, 100);
      const pendingKey = receivable ? 'openingReceivablesRemaining' : 'openingPayablesRemaining';
      const remaining = read(pendingKey, 'Saldo inicial que seguirá pendiente al cierre');
      if (finite(remaining) && (!finite(opening[key]) || remaining > opening[key])) issues.push(`${balanceFields[key]}: el remanente no puede superar el saldo histórico.`);
      let operations = income.sales;
      if (!receivable) {
        if (a.purchasesMode === 'manual') operations = read('purchases', 'Compras proyectadas');
        else if (a.purchasesMode === 'inventory') operations = calc((cost, ending, initial) => cost + ending - initial, income.costSales, values.inventory, opening.inventory);
        else operations = null;
        if (!finite(operations) || operations < 0) { issues.push('Compras pendientes o negativas: revisa costo de ventas e inventarios.'); operations = null; }
        add('purchases', operations, a.purchasesMode === 'inventory' ? 'Empresa comercial: costo de ventas + inventario final − inventario inicial' : 'Compras indicadas por el usuario');
      }
      return add(key, basis > 0 ? calc((old, amount, pct, d) => old + amount * pct / 100 * Math.min(d / basis, 1), remaining, operations, percent, term) : null,
        'Remanente inicial + operaciones × % crédito × mínimo(plazo / días base, 1); operaciones uniformes');
    }
    currentAccount('receivables', a.receivablesMode, 'receivables');
    currentAccount('inventory', a.inventoryMode, 'inventory');
    const depreciation = a.depreciationMode === 'none' ? 0 : a.depreciationMode === 'selected' ? income.depreciation : null;
    if (!finite(depreciation)) issues.push('Identifica las cuentas de depreciación en resultados o confirma que no aplica.');
    if (a.depreciationMode === 'none' && income.rows.some(row => row.depreciation)) issues.push('Hay cuentas marcadas como depreciación; utiliza esas cuentas en el balance.');
    const capex = read('capex', 'Inversión en activos fijos'), disposals = read('disposals', 'Valor neto de las bajas de activos');
    add('fixed', calc((initial, investment, dep, sales) => initial + investment - dep - sales, opening.fixed, capex, depreciation, disposals), 'Activo fijo neto inicial + inversión − depreciación incluida en resultados − bajas a valor neto');
    currentAccount('payables', a.payablesMode, 'payables');
    for (const key of ['otherCurrentAssets', 'otherNonCurrentAssets', 'otherCurrentLiabilities', 'longDebt', 'otherNonCurrentLiabilities']) {
      add(key, a[key] === null ? opening[key] : read(key), a[key] === null ? 'Saldo histórico constante (premisa editable)' : 'Saldo final indicado por el usuario');
    }
    const equityChange = read('equityChange', 'Aportes menos retiros de capital (sin dividendos)', -LIMIT);
    add('equity', calc((initial, retained, change) => initial + retained + change, opening.equity, income.retained, equityChange), 'Patrimonio histórico + utilidad neta − dividendos totales + aportes netos');
    const retainedOpening = a.retainedOpening === null ? null : read('retainedOpening', 'Ganancias retenidas históricas (incluidas en patrimonio)', -LIMIT);
    const retainedClosing = calc((initial, change) => initial + change, retainedOpening, income.retained);
    // Este detalle no se suma al patrimonio: ya está incluido en su saldo histórico.
    for (const [key, label] of Object.entries(balanceFields)) if (!finite(values[key])) issues.push(`${label}: faltan datos para proyectar el saldo.`);
    let summary = {};
    if (Object.keys(balanceFields).every(k => finite(values[k]))) {
      try { summary = F.summarizeBalance(values); } catch (error) { issues.push(error.message); }
    }
    if (['assets', 'liabilities', 'funding', 'difference'].some(k => finite(summary[k]) && Math.abs(summary[k]) > LIMIT)) {
      issues.push('Los totales del balance superan el límite de importes; revisa la escala.');
      summary = {};
    }
    const ready = issues.length === 0 && income.ready && finite(summary.difference);
    if (!income.ready) issues.push('Completa el Estado de Resultados y los dividendos para actualizar el patrimonio.');
    return { ...summary, values, opening, calculations, depreciation, retainedClosing, ready, issues: [...new Set(issues)],
      externalRequired: ready ? Math.max(0, summary.difference) : null, surplus: ready ? Math.max(0, -summary.difference) : null };
  }
  function analyze(c, supplied) {
    const defaults = newProjection(c), raw = supplied || settingsFor(c);
    const s = { ...defaults, ...clone(raw), lines: clone(raw.lines || {}), balance: { ...defaults.balance, ...clone(raw.balance || {}) } };
    const issues = [], stale = s.context !== context(c);
    if (stale) issues.push('La moneda, escala o períodos históricos cambiaron; conserva esta proyección y crea una nueva.');
    if (s.version !== 1) issues.push('Versión de proforma no compatible.');
    if (!C.SIDES.includes(s.historicalPeriod)) issues.push('Selecciona un período histórico válido.');
    if (!['sales', 'mixed'].includes(s.method)) issues.push('Selecciona una metodología válida.');
    const start = date(s.start), end = date(s.end), historical = date(s.historicalEnd);
    const recognizedEnd = historicalEnd(c.periods?.[s.historicalPeriod]);
    if (recognizedEnd && s.historicalEnd !== recognizedEnd) issues.push('El cierre histórico debe coincidir con el período seleccionado.');
    if (start === null || end === null || historical === null || end < start || start <= historical) issues.push('Define fechas válidas: la proyección debe iniciar después del cierre histórico y terminar después de su inicio.');
    const days = start !== null && end !== null && end >= start ? (end - start) / DAY + 1 : null;
    const h = history(c, s.historicalPeriod);
    let sales = null;
    if (s.salesMode === 'amount') sales = number(s.salesValue, 'Ventas esperadas', issues);
    else if (s.salesMode === 'growth') sales = calc((base, growth) => base * (1 + growth / 100), h.values.sales, number(s.salesValue, 'Crecimiento de ventas (%)', issues, -100));
    else issues.push('Selecciona importe o crecimiento para las ventas.');
    if (!(h.values.sales > 0)) issues.push('Se requieren ventas históricas positivas para obtener porcentajes y comparar métodos.');
    if (!finite(sales)) issues.push('Ventas proyectadas pendientes o fuera del límite de importes.');
    if (issues.length) sales = null;
    const comparison = { sales: projectIncome(h, s, sales, 'sales'), mixed: projectIncome(h, s, sales, 'mixed') };
    const income = comparison[s.method] || comparison.sales;
    income.ready &&= issues.length === 0;
    const balance = projectBalance(c, h, s, income, days);
    return { source: 'historical-proforma', settings: s, history: h, days, stale, issues,
      comparison, income, balance, ready: income.ready, period: `${s.start || '—'} a ${s.end || '—'}` };
  }
  const api = { newProjection, settingsFor, saveProjection, analyze, context, historicalEnd, lineSettings, incomeFields, balanceFields };
  if (node) module.exports = api; else root.FinoraProforma = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
