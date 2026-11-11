/* Adaptador del libro personal: el registro es la fuente; los resúmenes solo concilian. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const P = node ? require('./personal-budget.js') : root.FinoraPersonal;
  const F = node ? require('./file-table.js') : root.FinoraFileTable;
  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const labels = {
    date: ['fecha', 'fecha de movimiento'], type: ['tipo de movimiento', 'tipo', 'movimiento'],
    category: ['categoria'], description: ['descripcion', 'concepto', 'detalle'], amount: ['monto', 'importe', 'monto c', 'monto nio'],
    priority: ['prioridad'], paymentMethod: ['medio', 'medio de pago', 'forma de pago'], note: ['observacion', 'observaciones'],
    from: ['desde lunes', 'desde'], to: ['hasta domingo', 'hasta']
  };
  const typeNames = { ingreso: 'income', ingresos: 'income', gasto: 'expense', gastos: 'expense', ahorro: 'saving', reserva: 'reserve' };
  function columns(row) {
    const result = {};
    for (const [key, names] of Object.entries(labels)) {
      const at = row.findIndex(value => names.includes(norm(value))); if (at >= 0) result[key] = at;
    }
    return result;
  }
  const isHeader = map => ['date', 'type', 'category', 'description', 'amount'].every(key => map[key] !== undefined);
  function date(value, XLSX, date1904) {
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
      value = parsed ? `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : '';
    }
    let result = clean(value), match = result.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) result = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return result;
  }
  function amount(value) {
    if (typeof value === 'number') return value;
    let result = clean(value).replace(/^(?:C\$|NIO)\s*/i, '').replace(/\s/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(result)) result = result.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(result)) result = result.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{1,2}$/.test(result)) result = result.replace(',', '.');
    return result;
  }
  function role(name) {
    const n = norm(name);
    if (/inicio.*meta/.test(n)) return 'inicio';
    if (/registro.*semanal|movimientos/.test(n)) return 'registro';
    if (/seguimiento/.test(n)) return 'seguimiento';
    if (/presupuesto.*proyectado/.test(n)) return 'proyeccion';
    if (/^listas$/.test(n)) return 'listas';
    return null;
  }
  function read(bytes, name, XLSX) {
    if (!/\.xlsx$/i.test(name)) throw new Error('Selecciona un archivo .xlsx.');
    let workbook;
    try { workbook = F.read(bytes, name, XLSX); }
    catch (error) { throw new Error('No se pudo leer el Excel. ' + error.message); }
    const sheets = workbook.SheetNames.map(name => ({ name, role: role(name) })), warnings = [], entries = [];
    const cache = new Map(), data = name => {
      if (!cache.has(name)) cache.set(name, F.sheetData(workbook, name, XLSX));
      return cache.get(name);
    };
    let sources = sheets.filter(sheet => sheet.role === 'registro');
    if (!sources.length) sources = sheets.filter(sheet => !sheet.role && data(sheet.name).rows.slice(0, 40).some(row => isHeader(columns(row))));
    if (sources.length !== 1) throw new Error(sources.length ? 'Hay varios registros detallados. Conserva una sola hoja de movimientos para evitar duplicarlos.' : 'No se encontró un registro con Fecha, Tipo de movimiento, Categoría, Descripción y Monto.');
    const source = sources[0]; source.role = 'registro';
    const detail = data(source.name), header = detail.rows.findIndex(row => isHeader(columns(row)));
    if (header < 0) throw new Error('El registro no contiene los encabezados necesarios: Fecha, Tipo de movimiento, Categoría, Descripción y Monto.');
    const map = columns(detail.rows[header]), date1904 = !!workbook.Workbook?.WBProps?.date1904;
    for (const row of detail.rows.slice(0, header + 1)) if (row.some(value => /\b(usd|eur|dolares|euros|miles|millones)\b/.test(norm(value)))) throw new Error('El registro indica otra moneda o escala. Convierte los importes a córdobas individuales antes de importar.');
    let ignored = 0, estimates = 0, weekMismatch = 0;
    for (let r = header + 1; r < detail.rows.length; r++) {
      const row = detail.rows[r], get = key => map[key] === undefined ? '' : row[map[key]];
      if (!row.some(value => clean(value))) continue;
      if (isHeader(columns(row))) { ignored++; continue; }
      if (!clean(get('type')) && !P.validDate(date(get('date'), XLSX, date1904)) &&
        (/^(total|subtotal|saldo|resumen)\b/.test(norm(get('description'))) || /^mes \d+/.test(norm(get('date'))))) { ignored++; continue; }
      // Las plantillas suelen tener semanas y fórmulas prellenadas después del último registro.
      if (!['date', 'type', 'category', 'description'].some(key => clean(get(key))) && !Number(get('amount'))) { ignored++; continue; }
      const candidate = { date: date(get('date'), XLSX, date1904), type: typeNames[norm(get('type'))] || clean(get('type')),
        category: clean(get('category')), description: clean(get('description')), amount: amount(get('amount')),
        priority: ({ necesidad: 'need', deseo: 'want' })[norm(get('priority'))] || '', paymentMethod: clean(get('paymentMethod')) };
      const problems = detail.problems.filter(p => p.r === r && ['date', 'type', 'category', 'description', 'amount', 'priority', 'paymentMethod'].some(key => map[key] === p.c));
      let issue = problems.map(p => `${p.address}: ${p.message}`).join(' ');
      try { P.movement(candidate); } catch (error) { issue ||= error.message; }
      entries.push({ row: r + 1, sheet: source.name, movement: candidate, issue, excluded: false });
      const note = norm(get('note'));
      if (/estimad|fecha asignada|segun patron/.test(note)) estimates++;
      const from = date(get('from'), XLSX, date1904), to = date(get('to'), XLSX, date1904);
      if (P.validDate(candidate.date) && P.validDate(from) && P.validDate(to) && (candidate.date < from || candidate.date > to)) weekMismatch++;
    }
    if (!entries.length) throw new Error('La hoja de registro no contiene movimientos.');
    if (ignored) warnings.push(`${ignored} filas de encabezados, subtotales o control excluidas.`);
    if (estimates) warnings.push(`${estimates} movimientos incluyen importes estimados o fechas asignadas en las observaciones del Excel; se conservaron los datos de origen.`);
    if (weekMismatch) warnings.push(`${weekMismatch} movimientos no coinciden con la semana escrita en Excel. Las semanas se recalculan a partir de la fecha del movimiento.`);
    const initial = sheets.find(s => s.role === 'inicio'), projection = sheets.find(s => s.role === 'proyeccion');
    const pairs = initial ? data(initial.name) : { rows: [], problems: [] };
    const lookup = expression => {
      for (let r = 0; r < pairs.rows.length; r++) for (let c = 0; c < pairs.rows[r].length - 1; c++) if (expression.test(norm(pairs.rows[r][c]))) {
        const issue = pairs.problems.find(p => p.r === r && p.c === c + 1);
        if (issue) { warnings.push(`${initial.name} ${issue.address}: ${issue.message}`); return null; }
        return pairs.rows[r][c + 1];
      }
      return null;
    };
    const valid = entries.filter(entry => !entry.issue).map(entry => P.movement(entry.movement)), dates = valid.map(row => row.date).sort();
    const startDate = date(lookup(/^inicio del seguimiento/), XLSX, date1904), endDate = date(lookup(/^corte del seguimiento/), XLSX, date1904);
    const continuation = date(lookup(/^inicio presupuesto/), XLSX, date1904);
    const goalAmount = amount(lookup(/^costo de la meta/)), goalName = clean(lookup(/^meta al final/)) || 'Meta de ahorro';
    let goal = null;
    if (goalAmount !== '' && Number.isFinite(Number(goalAmount)) && Number(goalAmount) > 0) {
      goal = { name: goalName, amount: Number(goalAmount), ...(P.validDate(startDate) ? { startDate } : {}), ...(P.validDate(endDate) ? { endDate } : {}) };
      try { P.prepareImport(P.blank(), { movements: valid.slice(0, 1), goal }); } catch (_) { warnings.push('La meta no es válida y no se importará.'); goal = null; }
    } else if (goalAmount !== '') warnings.push('La meta no tiene un importe positivo válido; no se importará.');
    const availableValue = lookup(/^(saldo inicial del periodo|disponible inicial)$/), savingValue = lookup(/^(ahorro anterior|ahorro inicial)$/), reserveValue = lookup(/^(reserva anterior|reserva inicial)$/);
    const openingValues = { available: amount(availableValue ?? 0), saving: amount(savingValue ?? 0), reserve: amount(reserveValue ?? 0) };
    let opening = null, openingReview = false;
    if ([availableValue, savingValue, reserveValue].some(value => value !== null)) {
      let reconstructed = false;
      if (P.validDate(continuation) && dates[0] < continuation && valid.some(row => row.type === 'income' && row.date < continuation)) {
        const history = P.prepareImport(P.blank(), { movements: valid.filter(row => row.date <= continuation) }).state;
        const balance = P.summarize(history, continuation.slice(0, 7));
        reconstructed = [[availableValue, balance.available], [savingValue, balance.accumulatedSaving], [reserveValue, balance.accumulatedReserve]]
          .every(([value, calculated]) => value === null || Math.round(Number(amount(value)) * 100) === Math.round(calculated * 100));
      }
      if (reconstructed) {
        warnings.push('Los saldos de la continuación son informativos: el registro contiene el historial anterior y el traspaso al ahorro. No se suman otra vez como saldos iniciales.');
      } else {
        opening = { period: (dates[0] || startDate).slice(0, 7), ...openingValues }; openingReview = true;
        warnings.push('Confirma los saldos separados antes del primer movimiento. Si una fila ya refleja ese ahorro o ingreso, corrige o excluye esa fila para evitar duplicarlo.');
      }
    }
    if (projection) {
      const real = data(projection.name).rows.some(row => row.some(value => /^(real actual|monto al corte)$/.test(norm(value))));
      warnings.push(real ? '«Presupuesto proyectado» contiene ejecución real al corte: no se convierte en límites ni en movimientos adicionales.' : 'La hoja de proyección se reconoce como planificación; sus importes no se agregan al registro real. Los límites mensuales se configuran por separado.');
    }
    if (sheets.some(sheet => sheet.role === 'seguimiento')) warnings.push('Seguimiento se reconoce como resumen; sus ingresos, gastos y ahorros no se importan de nuevo.');
    const controls = { income: lookup(/^total de ingresos$/), expense: lookup(/^total de gastos$/), savingBalance: lookup(/^ahorro para la meta$/), reserveBalance: lookup(/^reserva acumulada$/), available: lookup(/^saldo disponible$/) };
    const duplicates = valid.length - new Set(valid.map(row => JSON.stringify(row))).size;
    if (duplicates) warnings.push(`${duplicates} filas detalladas idénticas: se conservan como movimientos separados; revisa y excluye las que sean duplicados.`);
    return { name, sheets, entries, warnings, ignored, goal, opening, openingReview, controls,
      tracking: { startDate, endDate }, periods: [...new Set(dates.map(value => value.slice(0, 7)))].sort() };
  }
  function payload(report) {
    const selected = report.entries.filter(entry => !entry.excluded);
    const pending = selected.find(entry => entry.issue);
    if (pending) throw new Error(`${pending.sheet}, fila ${pending.row}: ${pending.issue} Corrige la fila o exclúyela explícitamente.`);
    if (report.openingReview) throw new Error('Confirma los saldos iniciales antes de importar.');
    return { movements: selected.map(entry => P.movement(entry.movement)), goal: report.goal, opening: report.opening };
  }
  function preview(report, state, options) {
    const data = payload(report), imported = P.prepareImport(P.blank(), data, { metadata: 'import' });
    const totals = P.overview(imported.state, imported.periods.at(-1)).accumulated;
    const warnings = report.warnings.slice();
    for (const [key, value] of Object.entries(report.controls)) if (value !== null) {
      const expected = Number(amount(value));
      if (!Number.isFinite(expected)) warnings.push(`El resumen de Excel (${key}) no contiene un importe válido.`);
      else if (Math.round(expected * 100) !== Math.round(totals[key] * 100)) warnings.push(`Diferencia con el resumen de Excel (${key}): Excel ${P.money(expected)}; registro ${P.money(totals[key])}. Se utiliza el registro detallado.`);
    }
    return { ...P.prepareImport(state, data, options), totals, warnings, data };
  }
  const api = { read, payload, preview };
  if (node) module.exports = api; else root.FinoraPersonalImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
