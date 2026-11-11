/* Registro personal independiente: dinero disponible, ahorro y reservas en centavos. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'finora:personal-budget:v1', MAX_AMOUNT = 1e12;
  const types = { income: 'Ingreso', expense: 'Gasto', saving: 'Ahorro', reserve: 'Reserva' };
  const defaults = {
    income: ['Salario', 'Ingreso adicional', 'Otros ingresos'],
    expense: ['Vivienda', 'Alimentación', 'Transporte', 'Gimnasio', 'Salud', 'Educación', 'Servicios', 'Tiempo libre', 'Otros gastos'],
    saving: ['Ahorro personal'], reserve: ['Imprevistos']
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  let sequence = 0;
  const newId = () => root.crypto?.randomUUID?.() || `personal-${Date.now().toString(36)}-${(sequence++).toString(36)}`;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function text(value, label, max, optional = false) {
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max) throw new Error(`${label}: completa el campo (máximo ${max} caracteres).`);
    return value.trim();
  }
  function cents(value, label, { signed = false, zero = true } = {}) {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`${label}: indica un importe válido.`);
    const input = String(value).trim();
    if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(input)) throw new Error(`${label}: usa un importe ${signed ? '' : 'no negativo '}con hasta dos decimales.`);
    const [integer, fraction = ''] = input.replace('-', '').split('.');
    const result = (Number(integer) * 100 + Number(fraction.padEnd(2, '0'))) * (input.startsWith('-') ? -1 : 1);
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_AMOUNT * 100 || (!zero && result <= 0)) throw new Error(`${label}: el importe debe ser ${zero ? 'entre cero' : 'mayor que cero'} y no superar ${MAX_AMOUNT}.`);
    return result;
  }
  function validPeriod(value) {
    return typeof value === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validPeriod(value.slice(0, 7))) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function blank() {
    return { version: 1, currency: 'C$', selectedPeriod: null, opening: { period: null, available: 0, saving: 0, reserve: 0 },
      categories: Object.fromEntries(Object.keys(types).map(type => [type, []])), movements: [] };
  }
  function movement(input) {
    if (!input || !own(types, input.type)) throw new Error('Selecciona un tipo de movimiento válido.');
    if (!validDate(input.date)) throw new Error('Indica una fecha válida.');
    if (input.type === 'expense' && !['need', 'want'].includes(input.priority)) throw new Error('Selecciona necesidad o deseo para el gasto.');
    return { type: input.type, date: input.date, amount: cents(input.amount, 'Monto', { zero: false }) / 100,
      category: text(input.category, 'Categoría', 60), description: text(input.description, 'Descripción', 120),
      priority: input.type === 'expense' ? input.priority : null, paymentMethod: text(input.paymentMethod ?? '', 'Medio de pago', 60, true) };
  }
  function opening(input) {
    if (!input || (input.period !== null && !validPeriod(input.period))) throw new Error('Indica el mes de inicio de los saldos iniciales.');
    const result = { period: input.period, available: cents(input.available, 'Disponible inicial', { signed: true }) / 100,
      saving: cents(input.saving, 'Ahorro inicial') / 100, reserve: cents(input.reserve, 'Reserva inicial') / 100 };
    if (result.period === null && [result.available, result.saving, result.reserve].some(v => v !== 0)) throw new Error('Los saldos iniciales necesitan un mes de inicio.');
    return result;
  }
  function validate(state) {
    if (!state || state.version !== 1 || state.currency !== 'C$' || !Array.isArray(state.movements) || !state.categories || typeof state.categories !== 'object') throw new Error('Formato personal no compatible; los datos guardados no se reemplazaron.');
    const base = opening(state.opening), ids = new Set();
    if (state.selectedPeriod != null && !validPeriod(state.selectedPeriod)) throw new Error('El período personal guardado no es válido.');
    if (state.goal != null) goal(state.goal);
    if (state.importedRecords !== undefined && (!Array.isArray(state.importedRecords) || state.importedRecords.some(row => !row || typeof row.key !== 'string' || typeof row.id !== 'string' || !validDate(row.date)))) throw new Error('Historial de importación no válido.');
    // Campo opcional: los registros de la Fase 1 se leen sin migrarlos ni reescribirlos.
    if (state.budgets !== undefined) {
      if (!state.budgets || typeof state.budgets !== 'object' || Array.isArray(state.budgets)) throw new Error('Presupuestos personales no válidos.');
      for (const [period, value] of Object.entries(state.budgets)) {
        if (!validPeriod(period)) throw new Error('El mes del presupuesto no es válido.');
        budget(value);
      }
    }
    for (const type of Object.keys(types)) {
      if (!Array.isArray(state.categories[type])) throw new Error('Categorías personales no válidas.');
      state.categories[type].forEach(name => text(name, 'Categoría', 60));
    }
    for (const row of state.movements) {
      const id = text(row?.id, 'Identificador', 100);
      if (ids.has(id)) throw new Error('Hay identificadores de movimientos duplicados.');
      ids.add(id); movement(row);
      if (base.period && row.date.slice(0, 7) < base.period) throw new Error('No puede haber movimientos anteriores al mes de los saldos iniciales.');
    }
    return state;
  }
  function categoriesFor(state, type) {
    if (!own(types, type)) throw new Error('Tipo de movimiento no válido.');
    const values = [...defaults[type], ...(state.categories[type] || [])], seen = new Set();
    return values.filter(value => { const key = value.toLocaleLowerCase('es'); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  function upsert(state, input) {
    validate(state);
    const data = movement(input), copy = clone(state), id = input.id || newId();
    if (copy.opening.period && data.date.slice(0, 7) < copy.opening.period) throw new Error('La fecha es anterior a los saldos iniciales. Revisa el mes de inicio.');
    const index = copy.movements.findIndex(row => row.id === id);
    if (input.id && index < 0) throw new Error('El movimiento ya no existe. Actualiza la lista.');
    const row = { id, ...data }; copy.selectedPeriod = data.date.slice(0, 7);
    if (index < 0) copy.movements.push(row); else copy.movements[index] = row;
    const existing = categoriesFor(copy, row.type).find(name => name.toLocaleLowerCase('es') === row.category.toLocaleLowerCase('es'));
    if (existing) row.category = existing; else copy.categories[row.type].push(row.category);
    // Detecta desbordamientos antes de guardar; no redondea ni pierde centavos.
    summarize(copy, '9999-12');
    return copy;
  }
  function remove(state, id) {
    validate(state);
    if (!state.movements.some(row => row.id === id)) throw new Error('El movimiento ya no existe.');
    const copy = clone(state); copy.movements = copy.movements.filter(row => row.id !== id); summarize(copy, '9999-12'); return copy;
  }
  function setOpening(state, input) {
    validate(state);
    const copy = clone(state); copy.opening = opening(input); validate(copy); summarize(copy, '9999-12'); return copy;
  }
  function add(a, b) {
    const result = a + b;
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_AMOUNT * 100) throw new Error('El total supera el límite de importes personales; revisa los movimientos.');
    return result;
  }
  const availableAfter = (initial, total) => add(add(add(add(initial, total.income), -total.expense), -total.saving), -total.reserve);
  function summarize(state, period, filter = 'all') {
    validate(state);
    if (!validPeriod(period)) throw new Error('Selecciona un período mensual válido.');
    if (filter !== 'all' && !own(types, filter)) throw new Error('Filtro no válido.');
    const beforeOpening = !!state.opening.period && period < state.opening.period;
    let available = beforeOpening ? 0 : cents(state.opening.available, 'Disponible inicial', { signed: true });
    let saving = beforeOpening ? 0 : cents(state.opening.saving, 'Ahorro inicial');
    let reserve = beforeOpening ? 0 : cents(state.opening.reserve, 'Reserva inicial');
    const total = { income: 0, expense: 0, saving: 0, reserve: 0 }, monthly = [];
    for (const row of state.movements) {
      const month = row.date.slice(0, 7), amount = cents(row.amount, 'Monto', { zero: false });
      if (month < period) {
        available = add(available, row.type === 'income' ? amount : -amount);
        if (row.type === 'saving') saving = add(saving, amount);
        if (row.type === 'reserve') reserve = add(reserve, amount);
      } else if (month === period) { total[row.type] = add(total[row.type], amount); monthly.push(clone(row)); }
    }
    const availableEnd = availableAfter(available, total);
    const savingEnd = add(saving, total.saving), reserveEnd = add(reserve, total.reserve);
    return { period, currency: 'C$', beforeOpening, openingAvailable: available / 100, openingSaving: saving / 100, openingReserve: reserve / 100,
      income: total.income / 100, expense: total.expense / 100, saving: total.saving / 100, reserve: total.reserve / 100,
      available: availableEnd / 100, accumulatedSaving: savingEnd / 100, accumulatedReserve: reserveEnd / 100,
      expensePercent: total.income > 0 ? total.expense / total.income * 100 : null,
      savingPercent: total.income > 0 ? total.saving / total.income * 100 : null, count: monthly.length,
      movements: monthly.filter(row => filter === 'all' || row.type === filter).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)) };
  }
  const categoryKey = name => name.trim().toLocaleLowerCase('es');
  function budget(input) {
    if (!input || !Array.isArray(input.categories)) throw new Error('Indica las categorías del presupuesto.');
    const limit = cents(input.limit, 'Límite mensual'), seen = new Set();
    let assigned = 0;
    const categories = input.categories.map(row => {
      const name = text(row?.name, 'Categoría presupuestada', 60), key = categoryKey(name);
      if (seen.has(key)) throw new Error(`La categoría «${name}» está repetida.`);
      seen.add(key); const amount = cents(row.limit, `Presupuesto de ${name}`); assigned = add(assigned, amount);
      return { name, limit: amount / 100 };
    });
    if (assigned > limit) throw new Error('La suma asignada a categorías supera el límite mensual. Ajusta los importes antes de guardar.');
    return { limit: limit / 100, categories };
  }
  function setBudget(state, period, input) {
    validate(state);
    if (!validPeriod(period)) throw new Error('Selecciona el mes del presupuesto.');
    const plan = budget(input), copy = clone(state);
    for (const row of plan.categories) {
      const existing = categoriesFor(copy, 'expense').find(name => categoryKey(name) === categoryKey(row.name));
      if (existing) row.name = existing; else copy.categories.expense.push(row.name);
    }
    copy.budgets ||= {}; copy.budgets[period] = plan; return copy;
  }
  function comparison(limit, actual) {
    if (limit === null) return { limit: null, actual: actual / 100, available: null, percent: null, excess: null, status: 'unbudgeted' };
    const status = actual > limit ? 'exceeded' : limit === 0 ? 'within' : actual === limit ? 'reached' : actual * 5 >= limit * 4 ? 'warning' : 'within';
    return { limit: limit / 100, actual: actual / 100, available: (limit - actual) / 100,
      percent: limit > 0 ? actual / limit * 100 : null, excess: Math.max(0, actual - limit) / 100, status };
  }
  function compareBudget(state, period) {
    const month = summarize(state, period), plan = state.budgets?.[period] ? budget(state.budgets[period]) : null;
    const rows = new Map(); let assigned = 0, unbudgeted = 0;
    for (const row of plan?.categories || []) {
      const limit = cents(row.limit, row.name); assigned = add(assigned, limit);
      rows.set(categoryKey(row.name), { name: row.name, limit, actual: 0 });
    }
    for (const row of month.movements.filter(row => row.type === 'expense')) {
      const key = categoryKey(row.category), entry = rows.get(key) || { name: row.category, limit: null, actual: 0 };
      entry.actual = add(entry.actual, cents(row.amount, 'Gasto')); rows.set(key, entry);
    }
    const categories = Array.from(rows.values(), row => {
      if (row.limit === null) unbudgeted = add(unbudgeted, row.actual);
      return { name: row.name, ...comparison(row.limit, row.actual) };
    });
    const limit = plan ? cents(plan.limit, 'Límite mensual') : null;
    const total = comparison(limit, cents(month.expense, 'Gasto real'));
    const resources = availableAfter(cents(month.openingAvailable, 'Disponible inicial', { signed: true }), {
      income: cents(month.income, 'Ingresos'), expense: 0, saving: cents(month.saving, 'Ahorro'), reserve: cents(month.reserve, 'Reservas')
    });
    const alerts = categories.filter(row => row.status !== 'within' && (row.status !== 'unbudgeted' || row.actual > 0)).map(row => ({ scope: 'category', ...row }));
    if (plan && ['warning', 'reached', 'exceeded'].includes(total.status)) alerts.unshift({ scope: 'total', name: 'Total mensual', ...total });
    return { period, planned: !!plan, total, categories, alerts, assigned: assigned / 100,
      unallocated: limit === null ? null : (limit - assigned) / 100, unbudgetedExpense: unbudgeted / 100,
      resourcesForExpenses: resources / 100, outsideBudget: limit === null ? null : (resources - limit) / 100 };
  }
  function weekly(state, period) {
    const month = summarize(state, period), start = Date.parse(period + '-01T00:00:00Z'), last = new Date(start);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    const end = last.getTime(), day = 86400000, result = [];
    let available = cents(month.openingAvailable, 'Disponible inicial', { signed: true });
    for (let cursor = start; cursor <= end;) {
      const through = Math.min(end, cursor + ((7 - new Date(cursor).getUTCDay()) % 7) * day);
      const from = new Date(cursor).toISOString().slice(0, 10), to = new Date(through).toISOString().slice(0, 10);
      const movements = month.movements.filter(row => row.date >= from && row.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const total = { income: 0, expense: 0, saving: 0, reserve: 0 }, openingAvailable = available / 100;
      for (const row of movements) total[row.type] = add(total[row.type], cents(row.amount, 'Monto'));
      available = availableAfter(available, total);
      result.push({ from, to, openingAvailable, ...Object.fromEntries(Object.entries(total).map(([key, value]) => [key, value / 100])), available: available / 100, movements });
      cursor = through + day;
    }
    return result;
  }
  function createStore(provider = () => root.localStorage) {
    const storage = () => { const target = typeof provider === 'function' ? provider() : provider; if (!target) throw new Error('El almacenamiento local no está disponible.'); return target; };
    function load() {
      let raw;
      try { raw = storage().getItem(STORAGE_KEY); } catch (_) { throw new Error('No se puede leer el almacenamiento personal de este navegador.'); }
      if (raw === null) return blank();
      try { return clone(validate(JSON.parse(raw))); }
      catch (error) { throw new Error('No se pudieron leer los datos personales. No se sobrescribieron. ' + error.message); }
    }
    function write(next) {
      try { storage().setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch (_) { throw new Error('No se pudo guardar. Revisa el espacio o los permisos del navegador; conserva el formulario abierto.'); }
      return clone(next);
    }
    return { load, saveMovement: input => write(upsert(load(), input)), removeMovement: id => write(remove(load(), id)),
      saveOpening: input => write(setOpening(load(), input)),
      saveBudget: (period, input) => write(setBudget(load(), period, input)),
      importData: (data, options) => { const result = prepareImport(load(), data, options); return { ...result, state: write(result.state) }; },
      selectPeriod(period) { if (!validPeriod(period)) throw new Error('Selecciona un período mensual válido.'); const next = load(); next.selectedPeriod = period; return write(next); } };
  }
  function goal(input) {
    const result = { name: text(input.name, 'Meta', 120), amount: cents(input.amount, 'Meta', { zero: false }) / 100 };
    for (const key of ['startDate', 'endDate']) if (input[key]) {
      if (!validDate(input[key])) throw new Error('La fecha de la meta no es válida.');
      result[key] = input[key];
    }
    if (result.startDate && result.endDate && result.endDate < result.startDate) throw new Error('El fin de la meta es anterior al inicio.');
    return result;
  }
  const fingerprint = row => JSON.stringify([row.date, row.type, cents(row.amount, 'Monto'), categoryKey(row.category), row.description.trim(), row.priority, row.paymentMethod.trim()]);
  // Una única escritura: la vista previa y la confirmación usan la misma operación pura.
  function prepareImport(state, data, { mode = 'merge', metadata = 'keep' } = {}) {
    validate(state);
    if (!['merge', 'replace'].includes(mode) || !['keep', 'import'].includes(metadata)) throw new Error('Selecciona cómo combinar los datos.');
    if (!data || !Array.isArray(data.movements) || !data.movements.length || data.movements.length > 5000) throw new Error('Importa entre 1 y 5,000 movimientos válidos.');
    const incoming = data.movements.map(movement), periods = [...new Set(incoming.map(row => row.date.slice(0, 7)))].sort();
    const copy = clone(state); let added = 0, duplicates = 0, replaced = 0;
    if (mode === 'replace') {
      replaced = copy.movements.filter(row => periods.includes(row.date.slice(0, 7))).length;
      copy.movements = copy.movements.filter(row => !periods.includes(row.date.slice(0, 7)));
      copy.importedRecords = (copy.importedRecords || []).filter(row => !periods.includes(row.date.slice(0, 7)));
    }
    if (data.opening && (metadata === 'import' || !copy.opening.period)) copy.opening = opening(data.opening);
    if (data.goal && (metadata === 'import' || !copy.goal)) copy.goal = goal(data.goal);
    copy.importedRecords ||= [];
    const known = new Set(copy.importedRecords.map(row => row.key)), existing = new Map(), seen = new Map();
    for (const row of copy.movements) { const key = fingerprint(row); existing.set(key, (existing.get(key) || 0) + 1); }
    for (const dataRow of incoming) {
      const base = fingerprint(dataRow), occurrence = (seen.get(base) || 0) + 1, key = base + '#' + occurrence;
      seen.set(base, occurrence);
      if (known.has(key) || occurrence <= (existing.get(base) || 0)) { duplicates++; continue; }
      const row = { id: newId(), ...dataRow };
      const category = categoriesFor(copy, row.type).find(name => categoryKey(name) === categoryKey(row.category));
      if (category) row.category = category; else copy.categories[row.type].push(row.category);
      copy.movements.push(row); copy.importedRecords.push({ key, id: row.id, date: row.date }); known.add(key); added++;
    }
    copy.selectedPeriod = periods.at(-1);
    validate(copy); summarize(copy, '9999-12');
    return { state: copy, added, duplicates, replaced, periods };
  }
  function overview(state, period) {
    const month = summarize(state, period), totals = { income: 0, expense: 0, saving: 0, reserve: 0 };
    for (const row of state.movements) if (row.date.slice(0, 7) <= period) totals[row.type] = add(totals[row.type], cents(row.amount, 'Monto'));
    const categories = compareBudget(state, period).categories.filter(row => row.actual > 0).map(row => ({ name: row.name, amount: row.actual,
      expensePercent: month.expense > 0 ? row.actual / month.expense * 100 : null, incomePercent: month.income > 0 ? row.actual / month.income * 100 : null }));
    const periods = [...new Set(state.movements.map(row => row.date.slice(0, 7)).concat(period))].sort();
    return { month, categories, weekly: weekly(state, period), monthly: periods.map(value => summarize(state, value)),
      accumulated: { ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 100])), available: month.available, savingBalance: month.accumulatedSaving, reserveBalance: month.accumulatedReserve },
      goal: state.goal ? { ...goal(state.goal), saved: month.accumulatedSaving, percent: month.accumulatedSaving / state.goal.amount * 100 } : null };
  }
  const money = value => Number.isFinite(value) ? `${value < 0 ? '−' : ''}C$ ${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const api = { STORAGE_KEY, MAX_AMOUNT, types, blank, upsert, remove, setOpening, summarize, categoriesFor, validPeriod, validDate, createStore, money,
    setBudget, compareBudget, weekly, movement, prepareImport, overview };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FinoraPersonal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
