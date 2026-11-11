(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports, A = node ? require('./fixed-assets.js') : root.FinoraAssets;
  const F = node ? require('./file-table.js') : root.FinoraFileTable;
  const norm = value => A.norm(value).replace(/[^a-z0-9]+/g, ' ').trim();
  const columns = { name: ['activo', 'nombre del activo'], area: ['area del hogar', 'area', 'ubicacion'], type: ['tipo', 'categoria'],
    purchaseYear: ['ano compra', 'ano de compra'], cost: ['costo c', 'costo', 'costo nio'], life: ['vida util anos', 'vida util'], residual: ['residual c', 'valor residual', 'residual'],
    replacement: ['reposicion c', 'reposicion', 'costo de reposicion'], situation: ['situacion accion', 'situacion'], recommendation: ['recomendacion'] };
  const mapping = row => Object.fromEntries(Object.entries(columns).map(([key, labels]) => [key, row.findIndex(value => labels.includes(norm(value)))]));
  const header = map => ['name', 'area', 'type', 'purchaseYear', 'cost', 'life', 'residual'].every(key => map[key] >= 0);
  const numeric = value => typeof value === 'number' ? value : String(value ?? '').trim().replace(/^C\$\s*/i, '').replace(/^(\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/, (_, a, b) => a.replace(/,/g, '') + (b || ''));
  function read(bytes, name, X) {
    if (!/\.xlsx$/i.test(name)) throw Error('Selecciona un archivo .xlsx.');
    let w; try { w = F.read(bytes, name, X); } catch (issue) { throw Error('No se pudo leer el Excel. ' + issue.message); }
    const sheets = w.SheetNames.map(name => {
      const data = F.sheetData(w, name, X), at = data.rows.findIndex(row => header(mapping(row)));
      return { name, data, at };
    });
    const candidates = sheets.filter(s => s.at >= 0);
    if (candidates.length !== 1) throw Error(candidates.length ? 'Hay varias hojas de activos. Conserva una sola tabla detallada para evitar duplicados.' : 'No se encontró una tabla con Activo, Área, Tipo, Año compra, Costo, Vida útil y Residual.');
    const source = candidates[0], headings = source.data.rows[source.at], map = mapping(headings), warnings = [], entries = [], totals = [];
    const years = [...new Set(headings.map(v => norm(v).match(/^edad (\d{4})$/)?.[1]).filter(Boolean))];
    const year = years.length === 1 ? Number(years[0]) : null;
    if (!year) warnings.push('No se encontró un año de valoración inequívoco. Indícalo en la vista previa.');
    const calcCols = Object.fromEntries(['annual', 'accumulated', 'book', 'age'].map(key => [key, headings.findIndex(value => {
      const n = norm(value); return key === 'annual' ? /^deprec.* anual/.test(n) : key === 'accumulated' ? /^deprec.* acumulada/.test(n) : key === 'book' ? /^valor contable/.test(n) : /^edad \d{4}$/.test(n);
    })]));
    let ignored = 0;
    for (let r = source.at + 1; r < source.data.rows.length; r++) {
      const row = source.data.rows[r]; if (!row.some(v => v !== null && v !== '')) continue;
      if (header(mapping(row))) { ignored++; continue; }
      if (row.some(v => /^(totales?|subtotales?)$/.test(norm(v)))) { totals.push(row); ignored++; continue; }
      const input = {};
      for (const [key, index] of Object.entries(map)) {
        const raw = index >= 0 ? row[index] : null;
        input[key] = ['purchaseYear', 'cost', 'life', 'residual', 'replacement'].includes(key) ? (key === 'replacement' && (raw === null || raw === '') ? null : numeric(raw)) : String(raw ?? '').trim();
      }
      let issue = source.data.problems.filter(p => p.r === r && Object.values(map).includes(p.c)).map(p => `${p.address}: ${p.message}`).join(' ');
      try {
        const a = A.asset(input); if (year) {
          const calc = A.calculate(a, year);
          for (const [key, c] of Object.entries(calcCols)) if (c >= 0 && typeof row[c] === 'number' && Math.abs(row[c] - calc[key]) > .011) warnings.push(`Fila ${r + 1}: ${headings[c]} difiere del cálculo; se utiliza el costo, residual, vida útil y año de compra.`);
        }
      } catch (error) { issue ||= error.message; }
      entries.push({ row: r + 1, input, issue, excluded: false });
    }
    if (!entries.length) throw Error('La tabla de activos está vacía.');
    if (ignored) warnings.push(`${ignored} filas de totales o encabezados excluidas.`);
    const duplicates = entries.length - new Set(entries.map(e => JSON.stringify(e.input))).size;
    if (duplicates) warnings.push(`${duplicates} filas idénticas. Se conservarán como activos distintos salvo que las excluyas.`);
    for (const sheet of sheets.filter(s => s !== source)) warnings.push(`${sheet.name}: hoja informativa; no genera activos adicionales.`);
    return { name, year, entries, warnings, sheets: sheets.map(s => ({ name: s.name, detailed: s === source })),
      controls: totals.length === 1 ? { cost: totals[0][map.cost], accumulated: totals[0][calcCols.accumulated], book: totals[0][calcCols.book], replacement: totals[0][map.replacement] } : {} };
  }
  function preview(report, state, options) {
    const pending = report.entries.find(e => !e.excluded && e.issue);
    if (pending) throw Error(`Fila ${pending.row}: ${pending.issue} Corrige la fila o exclúyela.`);
    const incoming = { year: options.year, assets: report.entries.filter(e => !e.excluded).map(e => A.asset(e.input)) };
    const own = A.prepareImport(A.blank(options.year), incoming, options), result = A.prepareImport(state, incoming, options), warnings = report.warnings.slice();
    if (Number(options.year) === report.year) for (const [key, value] of Object.entries(report.controls)) if (typeof value === 'number' && own.totals[key] !== null && Math.abs(value - own.totals[key]) > .011) warnings.push(`Total ${key}: Excel ${A.money(value)}; calculado ${A.money(own.totals[key])}. Revisa la selección.`);
    return { ...result, incoming, fileTotals: own.totals, warnings };
  }
  const api = { read, preview }; if (node) module.exports = api; else root.FinoraAssetsImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
