/* Presupuesto comercial por producto y período. Entradas explícitas; los vacíos se propagan, nunca son ceros. */
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
  const stages = ['configuration','sales','purchases','costs','expenses','income','cash','balance'];
  const makeStages = () => Object.fromEntries(stages.map(key => [key, { issues: [], warnings: [], ready: false }]));
  const normalizeName = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function periodList(config) {
    const { frequency, start, count } = config || {};
    if (!['monthly','annual'].includes(frequency) || !Number.isInteger(count) || count < 1 || count > 600 || !/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return [];
    const date = new Date(start + 'T00:00:00Z');
    if (!finite(date.getTime()) || date.toISOString().slice(0,10) !== start) return [];
    return Array.from({ length: count }, (_, index) => {
      const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index * (frequency === 'annual' ? 12 : 1), 1));
      const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
      const iso = first.toISOString().slice(0,10);
      return { key: frequency === 'annual' ? iso.slice(0,4) : iso.slice(0,7), label: frequency === 'annual' ? iso.slice(0,4) : iso.slice(0,7), start: iso, months: frequency === 'annual' ? 12 : 1 };
    });
  }
  function newProduct(id = C.store.newId('product'), name = 'Producto 1') {
    return { id, name, sku: '', initialUnits: null, initialValue: null, inventoryMode: 'percent', inventoryPercent: null, nextUnits: null, rounding: 'none', values: {} };
  }
  function newProjection(c) {
    return { version: 2, id: C.store.newId('projection'), name: 'Nueva proyección', context: context(c),
      config: { frequency: 'monthly', start: '', count: 3 }, products: [newProduct()],
      expenses: [], expensesNone: false, historyMonths: 12,
      result: { interestMode: 'none', interest: {}, debt: { principal: null, annualRate: null, termMonths: null, amortization: 'equalPrincipal' },
        taxMode: 'pending', taxRate: null, taxes: {}, taxAdjustments: {}, otherEnabled: false, otherIncome: {}, otherExpenses: {} },
      advanced: { enabled: false, openingSource: 'automatic', opening: {}, collectionPercent: null, paymentPercent: null, confirmed: false, baseSignature: '', useDebtSchedule: false, values: {} } };
  }
  function upgrade(c, original) {
    if (!original) return newProjection(c);
    if (original.version === 2) return structuredClone(original);
    const s = newProjection(c), p = s.products[0], source = original.openingSource === 'manual' ? original.opening || {} : automaticOpening(c).amounts;
    s.id = original.id || 'legacy-budget'; s.name = original.name || 'Presupuesto anterior'; s.context = original.context;
    const rows = original.months || [];
    s.config = { frequency: 'monthly', start: rows[0]?.month ? rows[0].month + '-01' : '', count: rows.length || 1 };
    s.legacyKeys = rows.map(row => row.month);
    Object.assign(p, { initialUnits: original.inventoryUnits, initialValue: source.inventory ?? null,
      inventoryPercent: original.inventoryPercent, nextUnits: original.nextUnits });
    s.expenses = [{ id: 'legacy-opex', label: 'Gastos operativos anteriores', category: 'administration', mode: 'manual', values: {} },
      { id: 'legacy-dep', label: 'Depreciación anterior', category: 'depreciation', mode: 'manual', values: {} }];
    Object.assign(s.result, { interestMode: 'manual', taxMode: 'manual', otherEnabled: true });
    Object.assign(s.advanced, { enabled: true, openingSource: original.openingSource, opening: structuredClone(original.opening || {}),
      collectionPercent: original.collectionPercent, paymentPercent: original.paymentPercent, confirmed: original.confirmed, baseSignature: original.baseSignature });
    rows.forEach(row => {
      p.values[row.month] = { units: row.units, price: row.price, unitCost: row.unitCost, targetUnits: null };
      s.expenses[0].values[row.month] = row.opex; s.expenses[1].values[row.month] = row.depreciation;
      s.result.interest[row.month] = row.interest; s.result.taxes[row.month] = row.taxes;
      s.result.otherIncome[row.month] = row.otherIncome; s.result.otherExpenses[row.month] = 0;
      s.advanced.values[row.month] = { capex: row.capex, financing: row.financing, dividends: row.dividends };
    });
    return s;
  }
  function analyzeProducts(c, raw) {
    const s = upgrade(c, raw), state = makeStages();
    const issue = (stage, text) => { if (!state[stage].issues.includes(text)) state[stage].issues.push(text); };
    const value = (stage, rawValue, label, { signed = false, max = 1e15 } = {}) => {
      if (!finite(rawValue)) { issue(stage, `${label}: falta un número válido; un espacio vacío no equivale a cero.`); return null; }
      if ((!signed && rawValue < 0) || Math.abs(rawValue) > max) { issue(stage, `${label}: importe fuera de rango.`); return null; }
      return rawValue;
    };
    const periods = periodList(s.config);
    if (!periods.length) issue('configuration', 'Indica una fecha válida, periodicidad mensual o anual y entre 1 y 600 períodos.');
    if (s.context !== context(c)) issue('configuration', 'Esta proyección pertenece a otros años, moneda o escala. Crea una copia revisada para el contexto actual.');
    if (s.legacyKeys && JSON.stringify(s.legacyKeys) !== JSON.stringify(periods.map(p => p.key))) issue('configuration', 'El presupuesto anterior contiene meses incompletos, duplicados o no consecutivos. Revisa la configuración.');
    if (!Array.isArray(s.products) || !s.products.length) issue('sales', 'Agrega al menos un producto.');
    const ids = new Set(), products = [];
    for (const product of s.products || []) {
      const name = String(product.name || '').trim() || 'Producto sin nombre';
      if (!String(product.name || '').trim()) issue('sales', 'Asigna un nombre a cada producto.');
      if (!product.id || ids.has(product.id)) issue('sales', 'Cada producto debe tener un identificador diferente.');
      ids.add(product.id);
      if (!['manual','percent'].includes(product.inventoryMode)) issue('purchases', `${name}: elige la política de inventario final.`);
      if (!['none','ceil','nearest','floor'].includes(product.rounding)) issue('purchases', `${name}: elige una política de redondeo válida.`);
      const round = units => product.rounding === 'ceil' ? Math.ceil(units - 1e-10) : product.rounding === 'floor' ? Math.floor(units + 1e-10) : product.rounding === 'nearest' ? Math.round(units) : units;
      let initialUnits = value('purchases', product.initialUnits, `${name} · inventario inicial en unidades`);
      let initialValue = value('costs', product.initialValue, `${name} · valor del inventario inicial`);
      if (initialUnits === 0 && finite(initialValue) && initialValue !== 0) { issue('costs', `${name}: un inventario sin unidades debe tener valor cero.`); initialValue = null; }
      const percent = product.inventoryMode === 'percent' ? value('purchases', product.inventoryPercent, `${name} · porcentaje de inventario`, { max: 10000 }) : null;
      const tail = product.inventoryMode === 'percent' ? value('purchases', product.nextUnits, `${name} · ventas del período posterior`) : null;
      const rows = periods.map((period, index) => {
        const source = product.values?.[period.key] || {}, label = `${name} · ${period.label}`;
        const units = value('sales', source.units, `${label} · unidades de venta`), price = value('sales', source.price, `${label} · precio unitario`);
        if (product.rounding !== 'none' && ((finite(units) && !Number.isInteger(units)) || (finite(initialUnits) && !Number.isInteger(initialUnits)))) issue('purchases', `${label}: las unidades de venta e inventario inicial deben ser enteras para productos indivisibles.`);
        const next = index + 1 < periods.length ? product.values?.[periods[index + 1].key]?.units : tail;
        const desired = product.inventoryMode === 'manual' ? value('purchases', source.targetUnits, `${label} · inventario final deseado`) : calc((u, pct) => u * pct / 100, finite(next) && next >= 0 ? next : null, percent);
        if (desired === null) issue('purchases', `${label}: falta el inventario objetivo o las ventas del siguiente período.`);
        const targetInventory = calc(round, desired);
        const purchaseUnits = calc((sold, target, start) => Math.max(0, sold + target - start), units, targetInventory, initialUnits);
        const unitCost = value('purchases', source.unitCost, `${label} · costo unitario de compra`);
        const purchases = calc((u, cost) => u * cost, purchaseUnits, unitCost);
        const availableUnits = sum([initialUnits, purchaseUnits]), availableValue = sum([initialValue, purchases]);
        const averageCost = calc((amount, available) => available > 0 ? amount / available : amount === 0 ? 0 : null, availableValue, availableUnits);
        const endingUnits = calc((available, sold) => available - sold, availableUnits, units);
        const inventory = calc((u, cost) => u * cost, endingUnits, averageCost);
        const costSales = calc((start, bought, ending) => start + bought - ending, initialValue, purchases, inventory);
        if (finite(endingUnits) && finite(targetInventory) && endingUnits > targetInventory + 1e-8) state.purchases.warnings.push(`${label}: el inventario existente supera el objetivo. Compras cero; sin devoluciones automáticas.`);
        const r = { month: period.key, units, price, sales: calc((u, p) => u * p, units, price), unitCost, openingUnits: initialUnits, openingValue: initialValue,
          targetInventory, purchaseUnits, purchases, availableUnits, availableValue, averageCost, endingUnits, inventory, costSales };
        initialUnits = endingUnits; initialValue = inventory; return r;
      });
      products.push({ id: product.id, name, rows, totals: Object.fromEntries(['units','sales','purchaseUnits','purchases','costSales'].map(k => [k, sum(rows.map(r => r[k]))])) });
    }
    const rows = periods.map((p, index) => ({ ...(products.length === 1 ? products[0].rows[index] : {}), month: p.key, ...Object.fromEntries(['units','sales','purchaseUnits','purchases','openingValue','inventory','costSales','endingUnits'].map(k => [k, sum(products.map(product => product.rows[index][k]))])) }));
    const dependent = { sales: ['configuration'], purchases: ['configuration','sales'], costs: ['configuration','sales','purchases'] };
    state.configuration.ready = !state.configuration.issues.length;
    for (const stage of ['sales','purchases','costs']) state[stage].ready = !state[stage].issues.length && dependent[stage].every(k => state[k].ready);
    return { settings: s, periods, products, rows, stages: state, issue, value };
  }
  function historicalExpenses(c) {
    return (c.income || []).filter(a => a.category === 'opex').map(a => {
      const name = normalizeName(a.name);
      const category = /depreci|amortiz|agotamiento/.test(name) ? 'depreciation' : /venta|publicidad|comercial|mercadeo/.test(name) && !/administr/.test(name) ? 'selling' : /administr/.test(name) && !/venta/.test(name) ? 'administration' : 'unclassified';
      return { id: C.store.newId('expense'), label: a.name, category, mode: 'historical', sourceId: a.id, side: 'current', adjustmentType: 'percent', adjustment: 0, values: {} };
    });
  }
  function analyze(c, draft) {
    const stored = draft || c.params?.budget;
    const stale = !draft && !!stored && stored.context !== context(c);
    const r = analyzeProducts(c, stale ? newProjection(c) : stored), { settings: s, periods, stages: state, issue, value } = r;
    if (stale) issue('configuration', 'La moneda, escala o los años cambiaron. El presupuesto anterior se conserva; selecciona o crea una proyección del contexto actual.');
    const expenseRows = [], sourceIds = new Set();
    if (!s.expenses?.length && !s.expensesNone) issue('expenses', 'Agrega gastos operativos o indica expresamente que el ejercicio no incluye gastos.');
    if (s.expenses?.length && s.expensesNone) issue('expenses', 'Hay gastos registrados: desmarca «Sin gastos operativos» o retira esas filas.');
    for (const expense of s.expenses || []) {
      const label = expense.label || 'Gasto sin nombre';
      if (!String(expense.label || '').trim()) issue('expenses', 'Asigna un nombre a cada gasto.');
      if (!['administration','selling','depreciation'].includes(expense.category)) issue('expenses', `${label}: clasifica el gasto como administrativo, de ventas o depreciación.`);
      if (!['manual','historical','adjusted'].includes(expense.mode)) issue('expenses', `${label}: selecciona un modo de captura válido.`);
      let historical = null, source = null, historyMonths = null, adjustment = 0;
      if (expense.mode !== 'manual') {
        source = (c.income || []).find(a => a.id === expense.sourceId && a.category === 'opex');
        if (!source) issue('expenses', `${label}: la cuenta histórica ya no está disponible.`);
        const sourceKey = `${expense.sourceId}|${expense.side || 'current'}`;
        if (sourceIds.has(sourceKey)) issue('expenses', `${label}: la misma cuenta histórica está importada más de una vez.`);
        sourceIds.add(sourceKey);
        const amount = source?.amounts?.[expense.side || 'current'];
        historical = value('expenses', finite(amount) ? amount * (source.sign ?? 1) : null, `${label} · importe histórico`, { signed: true });
        historyMonths = value('expenses', s.historyMonths, 'Meses que comprende el estado histórico', { max: 600 });
        if (historyMonths === 0) { issue('expenses', 'La duración histórica debe ser mayor que cero.'); historyMonths = null; }
        if (expense.mode === 'adjusted') {
          if (!['percent','amount'].includes(expense.adjustmentType)) issue('expenses', `${label}: elige ajuste porcentual o monetario.`);
          adjustment = value('expenses', expense.adjustment, `${label} · ajuste`, { signed: true });
        }
      }
      const amounts = {}, bases = {};
      for (const p of periods) {
        bases[p.key] = calc((v, months) => v / months * p.months, historical, historyMonths);
        let amount = expense.mode === 'manual' ? value('expenses', expense.values?.[p.key], `${label} · ${p.label}`) : calc((base, adj) => expense.mode === 'adjusted' && expense.adjustmentType === 'percent' ? base * (1 + adj / 100) : base + adj, bases[p.key], adjustment);
        if (finite(amount) && amount < 0 && (historical === null || historical >= 0)) { issue('expenses', `${label} · ${p.label}: el ajuste deja un gasto negativo.`); amount = null; }
        amounts[p.key] = amount;
      }
      expenseRows.push({ ...expense, amounts, bases, historical, sourcePeriod: source ? c.periods[expense.side || 'current'] : null });
    }
    const result = s.result || {}, adv = s.advanced || {};
    const historicalInterest = () => {
      const accounts = (c.income || []).filter(a => a.category === 'interest');
      const amount = sum(accounts.map(a => finite(a.amounts?.current) ? a.amounts.current * (a.sign ?? 1) : null));
      const duration = value('income', s.historyMonths, 'Meses del estado histórico para intereses', { max: 600 });
      if (!duration) issue('income', 'Informa una duración histórica mayor que cero para los intereses.');
      return { amount: value('income', amount, 'Intereses históricos'), duration: duration || null };
    };
    const interestHistory = result.interestMode === 'historical' ? historicalInterest() : null;
    let loan = null, principal = null, rate = null, term = null, elapsed = 0;
    if (result.interestMode === 'debt') {
      loan = result.debt || {};
      principal = value('income', loan.principal, 'Capital de la deuda');
      rate = value('income', loan.annualRate, 'Tasa nominal anual de la deuda', { max: 1000 });
      term = value('income', loan.termMonths, 'Plazo pendiente de la deuda en meses', { max: 1200 });
      if (!Number.isInteger(term) || term < 1) { issue('income', 'El plazo de la deuda debe ser un número entero de meses mayor que cero.'); term = null; }
      if (!['equalPrincipal','interestOnly'].includes(loan.amortization)) issue('income', 'Selecciona amortización de capital constante o al vencimiento.');
    }
    let loanBalance = principal;
    for (let index = 0; index < periods.length; index++) {
      const p = periods[index], row = r.rows[index];
      const categorySum = category => {
        const lines = expenseRows.filter(e => e.category === category);
        return lines.length ? sum(lines.map(e => e.amounts[p.key])) : 0;
      };
      row.administration = categorySum('administration'); row.selling = categorySum('selling'); row.depreciation = categorySum('depreciation');
      const classified = expenseRows.every(e => ['administration','selling','depreciation'].includes(e.category));
      row.opex = s.expensesNone || expenseRows.length && classified ? sum([row.administration, row.selling]) : null;
      row.operatingExpenses = sum([row.opex, row.depreciation]);
      if (finite(row.operatingExpenses) && row.operatingExpenses < 0) { issue('expenses', `${p.label}: los gastos netos no pueden ser negativos.`); row.operatingExpenses = null; }
      row.otherIncome = result.otherEnabled ? value('income', result.otherIncome?.[p.key], `Otros ingresos · ${p.label}`, { signed: true }) : 0;
      row.otherExpenses = result.otherEnabled ? value('income', result.otherExpenses?.[p.key], `Otros gastos · ${p.label}`) : 0;
      row.principalPayment = 0;
      if (result.interestMode === 'none') row.interest = 0;
      else if (result.interestMode === 'manual') row.interest = value('income', result.interest?.[p.key], `Intereses · ${p.label}`);
      else if (result.interestMode === 'historical') row.interest = calc((v, months) => v / months * p.months, interestHistory.amount, interestHistory.duration);
      else if (result.interestMode === 'debt') {
        row.interest = null; row.principalPayment = null;
        if ([principal,rate,term,loanBalance].every(finite)) {
          row.interest = 0; row.principalPayment = 0;
          for (let month = 0; month < p.months; month++, elapsed++) {
            if (elapsed >= term) continue;
            row.interest += loanBalance * rate / 1200;
            const paid = loan.amortization === 'equalPrincipal' ? Math.min(loanBalance, principal / term) : elapsed + 1 === term ? loanBalance : 0;
            loanBalance = Math.max(0, loanBalance - paid); row.principalPayment += paid;
          }
        }
      } else { issue('income', 'Elige cómo calcular los intereses.'); row.interest = null; }
      row.loanBalance = loanBalance;
      const other = calc((a,b) => a-b, row.otherIncome, row.otherExpenses);
      const known = Object.fromEntries(['sales','costSales','operatingExpenses','interest','taxes','preferredDividends'].map(k => [k, k === 'preferredDividends' || finite(row[k])]));
      const input = { sales: row.sales, costSales: row.costSales, operatingExpenses: row.operatingExpenses, interest: row.interest, taxes: null, otherIncome: other, preferredDividends: 0, known };
      let calculated = F.calculateIncome(input);
      row.ebt = finite(other) ? calculated.ebt : null;
      row.taxableBase = null;
      if (result.taxMode === 'none') row.taxes = 0;
      else if (result.taxMode === 'manual') row.taxes = value('income', result.taxes?.[p.key], `ISR informado · ${p.label}`, { signed: true });
      else if (result.taxMode === 'rate') {
        const taxRate = value('income', result.taxRate, 'Tasa de ISR · %', { max: 100 });
        const adjustment = Object.hasOwn(result.taxAdjustments || {}, p.key) ? value('income', result.taxAdjustments[p.key], `Ajuste a la base imponible · ${p.label}`, { signed: true }) : 0;
        row.taxableBase = calc((profit, adj) => Math.max(0, profit + adj), row.ebt, adjustment);
        row.taxes = calc((base, pct) => base * pct / 100, row.taxableBase, taxRate);
      } else { issue('income', 'Configura el ISR: tasa, importe manual o «No aplica».'); row.taxes = null; }
      input.taxes = row.taxes; input.known.taxes = finite(row.taxes); calculated = F.calculateIncome(input);
      row.grossProfit = calculated.grossProfit; row.ebit = calculated.ebit; row.netProfit = finite(other) ? calculated.netProfit : null;
    }
    const automatic = automaticOpening(c), source = adv.openingSource === 'manual' ? adv.opening || {} : automatic.amounts;
    const opening = Object.fromEntries(Object.keys(openingFields).map(k => [k, null]));
    let openingDifference = null;
    let closing = { ...opening, currentAssets: null, nonCurrentAssets: null, assets: null, liabilities: null, funding: null, difference: null };
    if (adv.enabled) {
      for (const [k,label] of Object.entries(openingFields)) opening[k] = value('balance', source[k], `${label} inicial`, { signed: k === 'equity' });
      for (const key of ['cash','receivables','payables']) if (!finite(opening[key])) issue('cash', `Completa ${openingFields[key].toLowerCase()} inicial.`);
      if (adv.openingSource !== 'manual' && (!automatic.balanced || automatic.incomplete)) issue('balance', 'Completa y concilia el balance actual o informa los saldos iniciales manualmente.');
      const initialInventory = sum((s.products || []).map(p => p.initialValue));
      if (finite(initialInventory) && finite(opening.inventory) && Math.abs(initialInventory - opening.inventory) > .01) issue('balance', 'El inventario inicial del balance no coincide con el valor inicial de los productos presupuestados.');
      const assets = sum(['cash','receivables','inventory','otherCurrentAssets','fixed','otherNonCurrentAssets'].map(k => opening[k]));
      const funding = sum(['payables','otherCurrentLiabilities','longDebt','otherNonCurrentLiabilities','equity'].map(k => opening[k]));
      openingDifference = calc((a,b) => a-b, assets, funding);
      if (finite(openingDifference) && Math.abs(openingDifference) > Math.max(.01,Math.abs(assets)*1e-12)) issue('balance', 'Los saldos iniciales no cuadran: activos distintos de pasivos más patrimonio.');
      const collection = value('cash', adv.collectionPercent, 'Porcentaje de cobro en el mismo período', { max: 100 });
      const payment = value('cash', adv.paymentPercent, 'Porcentaje de pago en el mismo período', { max: 100 });
      if (!adv.confirmed || adv.baseSignature !== signature(c)) { issue('cash', 'Revisa y confirma las fechas, los saldos y los supuestos de caja.'); issue('balance', 'Revisa y confirma los supuestos del balance proforma.'); }
      let cash = opening.cash, receivables = opening.receivables, payables = opening.payables, previousSales = opening.receivables, previousPurchases = opening.payables;
      let fixed = opening.fixed, longDebt = opening.longDebt, equity = opening.equity;
      if (adv.useDebtSchedule && result.interestMode !== 'debt') issue('cash', 'Para incorporar amortizaciones selecciona primero intereses calculados desde una deuda.');
      if (adv.useDebtSchedule && finite(principal) && finite(longDebt) && principal > longDebt) issue('balance', 'La deuda del cálculo de intereses supera la deuda de largo plazo inicial.');
      for (const row of r.rows) {
        const movements = adv.values?.[row.month] || {};
        for (const key of ['capex','financing','dividends']) row[key] = value('cash', Object.hasOwn(movements,key) ? movements[key] : 0, `${fields[key]} · ${row.month}`, { signed: key === 'financing' });
        if (adv.useDebtSchedule) row.financing = calc((net,paid) => net-paid, row.financing, row.principalPayment);
        row.collections = calc((sales,pct,old) => sales*pct/100+old,row.sales,collection,previousSales);
        row.payments = calc((buys,pct,old) => buys*pct/100+old,row.purchases,payment,previousPurchases);
        previousSales = calc((sales,pct) => sales*(1-pct/100),row.sales,collection);
        previousPurchases = calc((buys,pct) => buys*(1-pct/100),row.purchases,payment);
        receivables = row.receivables = calc((start,sold,paid)=>start+sold-paid,receivables,row.sales,row.collections);
        payables = row.payables = calc((start,bought,paid)=>start+bought-paid,payables,row.purchases,row.payments);
        row.openingCash = cash;
        row.cashMovement = calc((collected,paid,op,other,extra,int,tax,capex,net,div)=>collected-paid-op+other-extra-int-tax-capex+net-div,
          row.collections,row.payments,row.opex,row.otherIncome,row.otherExpenses,row.interest,row.taxes,row.capex,row.financing,row.dividends);
        cash = row.cash = sum([cash,row.cashMovement]);
        fixed = row.fixed = calc((start,bought,dep)=>start+bought-dep,fixed,row.capex,row.depreciation);
        longDebt = row.longDebt = sum([longDebt,row.financing]);
        equity = row.equity = calc((start,profit,div)=>start+profit-div,equity,row.netProfit,row.dividends);
        if (finite(cash) && cash < -.01) state.cash.warnings.push(`${row.month}: déficit de caja de ${C.fmt.money(-cash,c)}. No se agrega financiamiento automático.`);
        if (finite(fixed) && fixed < -.01) issue('balance', `${row.month}: la depreciación supera los activos fijos disponibles.`);
        if (finite(longDebt) && longDebt < -.01) issue('balance', `${row.month}: la amortización supera la deuda de largo plazo.`);
      }
      closing = { ...opening, cash, receivables, payables, fixed, longDebt, equity, inventory: r.rows.at(-1)?.inventory ?? null };
      closing.currentAssets = sum([cash,receivables,closing.inventory,opening.otherCurrentAssets]);
      closing.nonCurrentAssets = sum([fixed,opening.otherNonCurrentAssets]); closing.assets = sum([closing.currentAssets,closing.nonCurrentAssets]);
      closing.liabilities = sum([payables,opening.otherCurrentLiabilities,longDebt,opening.otherNonCurrentLiabilities]); closing.funding = sum([closing.liabilities,equity]);
      closing.difference = calc((a,b)=>a-b,closing.assets,closing.funding);
      if (finite(closing.difference) && Math.abs(closing.difference)>Math.max(.01,Math.abs(closing.assets)*1e-12)) issue('balance','El balance proyectado presenta una diferencia por revisar.');
    }
    const dependencies = { configuration: [], sales: ['configuration'], purchases: ['sales'], costs: ['purchases'], expenses: ['configuration'], income: ['costs','expenses'], cash: ['income'], balance: ['cash'] };
    for (const key of stages) state[key].ready = (!['cash','balance'].includes(key) || !!adv.enabled) && !state[key].issues.length && dependencies[key].every(dep=>state[dep].ready);
    const totals = Object.fromEntries(['sales','purchases','costSales','administration','selling','opex','depreciation','operatingExpenses','otherIncome','otherExpenses','interest','taxes','grossProfit','ebit','ebt','netProfit','collections','payments','capex','financing','dividends','cashMovement'].map(key=>[key,sum(r.rows.map(row=>row[key]))]));
    const activeStages = adv.enabled ? stages : stages.filter(k=>!['cash','balance'].includes(k));
    const issues = [...new Set(activeStages.flatMap(k=>state[k].issues))], warnings = [...new Set(activeStages.flatMap(k=>state[k].warnings))];
    const ready = adv.enabled ? state.balance.ready : state.income.ready;
    delete r.issue; delete r.value;
    return { ...r, expenseRows, stale, automatic, opening, openingDifference, closing, totals, issues, warnings, ready, status: ready ? warnings.length ? 'review' : 'ready' : 'incomplete' };
  }
  function saveProjection(c, projection) {
    if (projection.context !== context(c)) throw new Error('La proyección corresponde a otro contexto. Crea una copia revisada antes de guardarla.');
    const next = structuredClone(c); next.params ||= {};
    const previous = next.params.budget;
    if (previous && (previous.version !== 2 || previous.context !== projection.context)) { next.params.budgetArchive ||= []; next.params.budgetArchive.push(previous); }
    next.params.budgetProjections ||= [];
    const index = next.params.budgetProjections.findIndex(item=>item.id===projection.id && item.context===projection.context);
    if (index < 0) next.params.budgetProjections.push(structuredClone(projection)); else next.params.budgetProjections[index] = structuredClone(projection);
    next.params.budget = structuredClone(projection); return next;
  }
  const api = { fields, openingFields, context, signature, blank, blankMonth, nextMonth, settingsFor, automaticOpening, analyze,
    periodList, newProduct, newProjection, upgrade, analyzeProducts, historicalExpenses, saveProjection };
  if (node) module.exports = api; else root.FinoraBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
