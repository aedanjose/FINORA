/* Presupuesto comercial mensual. Entradas explícitas; los vacíos se propagan, nunca son ceros. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const C = node ? require('./casos.js') : root.FinoraCasos;
  const F = C.engine;
  const finite = Number.isFinite;
  const fields = {
    units: 'Unidades de venta', price: 'Precio unitario', unitCost: 'Costo de compra unitario',
    opex: 'Gastos operativos pagados', depreciation: 'Depreciación', otherIncome: 'Otros ingresos cobrados',
    interest: 'Intereses pagados', taxes: 'Impuestos pagados', capex: 'Compra de activos fijos',
    financing: 'Préstamos netos', dividends: 'Dividendos pagados'
  };
  const openingFields = {
    cash: 'Efectivo', receivables: 'Cuentas por cobrar', inventory: 'Valor del inventario',
    otherCurrentAssets: 'Otros activos corrientes', fixed: 'Activos fijos netos',
    otherNonCurrentAssets: 'Otros activos no corrientes', payables: 'Cuentas por pagar',
    otherCurrentLiabilities: 'Otros pasivos corrientes', longDebt: 'Deuda a largo plazo',
    otherNonCurrentLiabilities: 'Otros pasivos no corrientes', equity: 'Patrimonio'
  };
  const context = c => JSON.stringify([c.periods, c.currency, c.scale]);
  const signature = c => JSON.stringify([context(c), c.balance]);
  const sum = values => values.length && values.every(finite) ? values.reduce((a, b) => a + b, 0) : null;
  const calc = (fn, ...values) => values.every(finite) ? fn(...values) : null;
  const nextMonth = month => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return '';
    const [y, m] = month.split('-').map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  };
  const blankMonth = month => ({ month, ...Object.fromEntries(Object.keys(fields).map(k => [k, null])) });
  const blank = c => ({ version: 1, context: context(c), openingSource: 'automatic', opening: {},
    inventoryUnits: null, inventoryPercent: null, nextUnits: null, collectionPercent: null,
    paymentPercent: null, confirmed: false, baseSignature: '', months: [blankMonth('')] });
  const settingsFor = c => c.params?.budget?.context === context(c) ? structuredClone(c.params.budget) : blank(c);
  function automaticOpening(c) {
    const b = C.analyzeBalance(c);
    const current = b.engine.current;
    const amounts = {};
    for (const key of Object.keys(openingFields)) {
      const isRole = ['cash', 'receivables', 'inventory', 'fixed', 'payables', 'longDebt'].includes(key);
      amounts[key] = current && (!isRole || current.provided?.[key]) && finite(current[key]) ? current[key] : null;
    }
    return { amounts, balanced: b.balanced.current === true, error: b.errors.current || '',
      incomplete: (c.balance || []).some(a => !finite(a.amounts?.current)) };
  }
  function analyze(c, draft) {
    const saved = c.params?.budget;
    const stale = !draft && !!saved && saved.context !== context(c);
    const s = draft || settingsFor(c), issues = [], warnings = [];
    const issue = text => { if (!issues.includes(text)) issues.push(text); };
    if (stale) issue('La moneda, escala o los años cambiaron. Revisa y guarda un presupuesto para este contexto.');
    const value = (raw, label, signed = false, max = 1e15) => {
      if (!finite(raw)) { issue(`Falta ${label}. Escribe 0 cuando no corresponda.`); return null; }
      if ((!signed && raw < 0) || Math.abs(raw) > max) { issue(`${label}: importe fuera de rango.`); return null; }
      return raw;
    };
    const automatic = automaticOpening(c);
    const source = s.openingSource === 'manual' ? s.opening || {} : automatic.amounts;
    const opening = Object.fromEntries(Object.entries(openingFields).map(([k, label]) => [k, value(source[k], `${label.toLowerCase()} inicial`, k === 'equity')]));
    if (s.openingSource !== 'manual' && (!automatic.balanced || automatic.incomplete)) issue('Completa y concilia el balance actual o informa los saldos iniciales manualmente.');
    const openingAssets = sum(['cash','receivables','inventory','otherCurrentAssets','fixed','otherNonCurrentAssets'].map(k => opening[k]));
    const openingFunding = sum(['payables','otherCurrentLiabilities','longDebt','otherNonCurrentLiabilities','equity'].map(k => opening[k]));
    const openingDifference = calc((a, b) => a - b, openingAssets, openingFunding);
    if (finite(openingDifference) && Math.abs(openingDifference) > Math.max(.01, Math.abs(openingAssets) * 1e-12)) issue('Los saldos iniciales no cuadran: activos distintos de pasivos más patrimonio.');
    let inventoryUnits = value(s.inventoryUnits, 'unidades de inventario inicial');
    if (inventoryUnits === 0 && opening.inventory > 0) issue('El inventario inicial tiene valor, pero no tiene unidades. Revisa ambos datos.');
    const inventoryPercent = value(s.inventoryPercent, 'porcentaje de inventario final', false, 100) / 100;
    const collectionRaw = value(s.collectionPercent, 'porcentaje de cobro en el mes', false, 100);
    const paymentRaw = value(s.paymentPercent, 'porcentaje de pago en el mes', false, 100);
    const collection = finite(collectionRaw) ? collectionRaw / 100 : null;
    const payment = finite(paymentRaw) ? paymentRaw / 100 : null;
    const tailUnits = value(s.nextUnits, 'ventas en unidades del mes posterior');
    const months = Array.isArray(s.months) ? s.months : [];
    if (!months.length || months.length > 24) issue('El presupuesto debe contener entre 1 y 24 meses consecutivos.');
    if (s.confirmed !== true || s.baseSignature !== signature(c)) issue('Revisa y confirma los supuestos y la fecha de los saldos iniciales.');
    let inventory = opening.inventory, cash = opening.cash, receivables = opening.receivables, payables = opening.payables;
    let lastCreditSales = opening.receivables, lastCreditPurchases = opening.payables;
    let fixed = opening.fixed, longDebt = opening.longDebt, equity = opening.equity;
    const rows = [];
    for (let i = 0; i < Math.min(months.length, 24); i++) {
      const row = months[i], label = row.month || `mes ${i + 1}`, r = { month: row.month };
      if (!nextMonth(row.month) || (i && row.month !== nextMonth(months[i - 1].month))) issue('Los meses deben tener formato AAAA-MM, ser únicos y consecutivos.');
      for (const [k, name] of Object.entries(fields)) r[k] = value(row[k], `${name.toLowerCase()} (${label})`, k === 'financing' || k === 'otherIncome' || k === 'taxes');
      r.sales = calc((u, p) => u * p, r.units, r.price);
      const next = i + 1 < months.length ? value(months[i + 1].units, `unidades de venta (${months[i + 1].month})`) : tailUnits;
      r.targetInventory = finite(s.inventoryPercent) && s.inventoryPercent >= 0 && s.inventoryPercent <= 100 ? calc((u, p) => u * p, next, inventoryPercent) : null;
      r.openingUnits = inventoryUnits;
      r.purchaseUnits = calc((sold, target, start) => Math.max(0, sold + target - start), r.units, r.targetInventory, inventoryUnits);
      r.purchases = calc((u, cost) => u * cost, r.purchaseUnits, r.unitCost);
      const availableUnits = sum([inventoryUnits, r.purchaseUnits]), availableValue = sum([inventory, r.purchases]);
      r.averageCost = calc((amount, units) => units > 0 ? amount / units : amount === 0 ? 0 : NaN, availableValue, availableUnits);
      if (!finite(r.averageCost)) r.averageCost = null;
      r.costSales = calc((u, cost) => u * cost, r.units, r.averageCost);
      inventoryUnits = r.endingUnits = calc((available, sold) => available - sold, availableUnits, r.units);
      inventory = r.inventory = calc((amount, cost) => amount - cost, availableValue, r.costSales);
      r.operatingExpenses = sum([r.opex, r.depreciation]);
      const known = Object.fromEntries(['sales','costSales','operatingExpenses','interest','taxes','preferredDividends'].map(k => [k, k === 'preferredDividends' || finite(r[k])]));
      const income = F.calculateIncome({ sales: r.sales, costSales: r.costSales, operatingExpenses: r.operatingExpenses,
        interest: r.interest, taxes: r.taxes, otherIncome: r.otherIncome, preferredDividends: 0, known });
      r.grossProfit = income.grossProfit; r.ebit = income.ebit;
      r.netProfit = finite(r.otherIncome) ? income.netProfit : null;
      r.collections = calc((sales, share, previous) => sales * share + previous, r.sales, collection, lastCreditSales);
      r.payments = calc((purchases, share, previous) => purchases * share + previous, r.purchases, payment, lastCreditPurchases);
      lastCreditSales = calc((sales, share) => sales * (1 - share), r.sales, collection);
      lastCreditPurchases = calc((purchases, share) => purchases * (1 - share), r.purchases, payment);
      receivables = r.receivables = calc((start, sales, paid) => start + sales - paid, receivables, r.sales, r.collections);
      payables = r.payables = calc((start, purchased, paid) => start + purchased - paid, payables, r.purchases, r.payments);
      r.openingCash = cash;
      r.cashMovement = calc((collected, paid, op, other, interest, tax, capex, loans, div) => collected - paid - op + other - interest - tax - capex + loans - div,
        r.collections, r.payments, r.opex, r.otherIncome, r.interest, r.taxes, r.capex, r.financing, r.dividends);
      cash = r.cash = sum([cash, r.cashMovement]);
      fixed = r.fixed = calc((start, bought, dep) => start + bought - dep, fixed, r.capex, r.depreciation);
      longDebt = r.longDebt = sum([longDebt, r.financing]);
      equity = r.equity = calc((start, profit, div) => start + profit - div, equity, r.netProfit, r.dividends);
      if (finite(cash) && cash < -.01) warnings.push(`${label}: faltan fondos de caja. Informa financiamiento o revisa los pagos.`);
      if (finite(fixed) && fixed < -.01) issue(`${label}: la depreciación supera los activos fijos disponibles.`);
      if (finite(longDebt) && longDebt < -.01) issue(`${label}: los pagos de préstamos superan la deuda de largo plazo.`);
      if (finite(r.endingUnits) && finite(r.targetInventory) && r.endingUnits > r.targetInventory + 1e-6) warnings.push(`${label}: el inventario existente supera el objetivo; no se generan compras negativas.`);
      rows.push(r);
    }
    const totals = Object.fromEntries(['sales','purchases','costSales','opex','depreciation','operatingExpenses','otherIncome','interest','taxes','grossProfit','ebit','netProfit','collections','payments','capex','financing','dividends','cashMovement'].map(k => [k, sum(rows.map(r => r[k]))]));
    const closing = { ...opening, cash, receivables, inventory, fixed, payables, longDebt, equity };
    closing.currentAssets = sum([cash, receivables, inventory, opening.otherCurrentAssets]);
    closing.nonCurrentAssets = sum([fixed, opening.otherNonCurrentAssets]);
    closing.assets = sum([closing.currentAssets, closing.nonCurrentAssets]);
    closing.liabilities = sum([payables, opening.otherCurrentLiabilities, longDebt, opening.otherNonCurrentLiabilities]);
    closing.funding = sum([closing.liabilities, equity]);
    closing.difference = calc((a, b) => a - b, closing.assets, closing.funding);
    if (finite(closing.difference) && Math.abs(closing.difference) > Math.max(.01, Math.abs(closing.assets) * 1e-12)) issue('El balance proyectado presenta una diferencia. Revisa los saldos y los movimientos.');
    const ready = !issues.length && rows.length > 0;
    return { settings: s, stale, opening, openingDifference, automatic, rows, totals, closing, issues, warnings,
      ready, status: ready ? warnings.length ? 'review' : 'ready' : 'incomplete' };
  }
  const api = { fields, openingFields, context, signature, blank, blankMonth, nextMonth, settingsFor, automaticOpening, analyze };
  if (node) module.exports = api; else root.FinoraBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
