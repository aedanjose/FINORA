/* Convierte una hoja mensual revisable; no modifica la empresa ni sus estados financieros. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const B = node ? require('./budget.js') : root.FinoraBudget;
  const P = node ? require('./paste-import.js') : root.FinoraPaste;
  const labels = { month: 'Mes', ...B.fields };
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = { mes: 'month', periodo: 'month', unidades: 'units', ventasunidades: 'units', precio: 'price', costounitario: 'unitCost', gastosoperativos: 'opex', otrosingresos: 'otherIncome', intereses: 'interest', impuestos: 'taxes', inversiones: 'capex', financiamiento: 'financing', dividendos: 'dividends' };
  const lookup = Object.fromEntries(Object.entries(labels).flatMap(([key, label]) => [[norm(label), key], [norm(key), key]]));
  const suggest = header => Object.fromEntries(Object.keys(labels).map(key => [key, header.findIndex(v => (lookup[norm(v)] || aliases[norm(v)]) === key)]));
  function parse(data, mapping, header = 0) {
    if (!Number.isInteger(header) || header < 0 || header >= data.rows.length) throw new Error('Indica la fila de encabezados.');
    const selected = Object.entries(labels).map(([key]) => mapping[key]).filter(v => Number.isInteger(v) && v >= 0);
    if (new Set(selected).size !== selected.length) throw new Error('Cada columna debe corresponder a un solo campo.');
    if (!(mapping.month >= 0) || !(mapping.units >= 0)) throw new Error('Asigna al menos las columnas Mes y Unidades de venta.');
    const problem = (data.problems || []).find(p => p.r > header && selected.includes(p.c));
    if (problem) throw new Error(`${problem.address}: ${problem.message}`);
    const months = [];
    for (let i = header + 1; i < data.rows.length; i++) {
      const raw = data.rows[i];
      if (!selected.some(c => raw[c] !== null && raw[c] !== undefined && String(raw[c]).trim() !== '')) continue;
      const month = String(raw[mapping.month] ?? '').trim().replace(/^(\d{4}-\d{2})-\d{2}$/, '$1');
      if (!B.nextMonth(month)) throw new Error(`Fila ${i + 1}: indica el mes como AAAA-MM (por ejemplo, 2026-10).`);
      if (months.length && month !== B.nextMonth(months.at(-1).month)) throw new Error(`Fila ${i + 1}: los meses deben ser únicos, consecutivos y estar ordenados.`);
      const row = B.blankMonth(month);
      for (const key of Object.keys(B.fields)) {
        if (!(mapping[key] >= 0)) continue;
        const amount = P.parseAmount(raw[mapping[key]]);
        if (amount !== null && (!Number.isFinite(amount) || Math.abs(amount) > 1e15 || amount < 0 && !['financing','taxes','otherIncome'].includes(key))) throw new Error(`Fila ${i + 1}, ${labels[key]}: importe inválido.`);
        row[key] = amount;
      }
      months.push(row);
    }
    if (!months.length || months.length > 24) throw new Error('Selecciona entre 1 y 24 meses.');
    return months;
  }
  const api = { labels, suggest, parse };
  if (node) module.exports = api; else root.FinoraBudgetImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
