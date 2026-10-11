/* Lectura y selección de columnas; no guarda datos ni evalúa fórmulas. */
(function (root) {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 5000, MAX_COLS = 100;
  const clean = value => String(value ?? '').replace(/[\t\r\n\u0000]+/g, ' ').trim();
  const filled = value => value !== null && value !== undefined && value !== '';
  function yearOf(value) {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 1900 && value <= 2100 ? value : null;
    const matches = clean(value).match(/(?:19|20)\d{2}|2100/g);
    return matches?.length === 1 && !/\d{5}/.test(clean(value)) ? Number(matches[0]) : null;
  }
  function read(bytes, name, XLSX) {
    if (bytes.byteLength > MAX_BYTES) throw new Error('El archivo supera 10 MB. Guarda solo las hojas del estado que quieres importar.');
    if (!bytes.byteLength) throw new Error('El archivo está vacío.');
    const extension = String(name).split('.').pop().toLowerCase();
    if (!['xlsx', 'csv'].includes(extension)) throw new Error('Elige un archivo .xlsx o .csv.');
    let source = bytes, type = 'array';
    if (extension === 'xlsx' && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) throw new Error('El archivo no es un Excel .xlsx válido. Ábrelo en Excel y guárdalo como Libro de Excel.');
    if (extension === 'csv') {
      try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (_) { source = new TextDecoder('windows-1252').decode(bytes); }
      source = source.replace(/^\uFEFF/, ''); type = 'string';
    }
    const workbook = XLSX.read(source, { type, raw: true, cellDates: true, cellFormula: true, sheetRows: MAX_ROWS + 1, bookVBA: false });
    if (!workbook.SheetNames.length) throw new Error('El archivo no contiene hojas.');
    return workbook;
  }
  function sheets(workbook) {
    return workbook.SheetNames.map(name => ({ name, hidden: !!workbook.Workbook?.Sheets?.find(sheet => sheet.name === name)?.Hidden }));
  }
  function sheetData(workbook, name, XLSX) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error('La hoja seleccionada no existe.');
    if (!sheet['!ref']) return { rows: [], problems: [], name };
    const bounds = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if (bounds.e.r >= MAX_ROWS || bounds.e.c >= MAX_COLS) throw new Error('Esta hoja supera 5,000 filas o 100 columnas. Copia el estado financiero a una hoja más pequeña.');
    const range = { s: { r: 0, c: 0 }, e: bounds.e };
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true, range });
    const problems = [];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c <= bounds.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (cell.t === 'e' || cell.f && (cell.v === undefined || cell.v === null)) problems.push({ r, c, address: XLSX.utils.encode_cell({ r, c }), message: cell.t === 'e' ? 'La celda contiene un error de Excel.' : 'La fórmula no tiene un resultado guardado. Recalcula y guarda el archivo en Excel antes de importarlo.' });
      if (rows[r][c] instanceof Date) rows[r][c] = rows[r][c].toISOString().slice(0, 10);
    }
    return { name, rows, problems };
  }
  function suggest(rows) {
    let header = -1, columns = [];
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const candidate = rows[r].map((v, c) => ({ c, year: yearOf(v) })).filter(x => x.year !== null);
      const labels = rows[r].filter((v, c) => filled(v) && !candidate.some(x => x.c === c)).map(clean);
      if (candidate.length >= 2 && new Set(candidate.map(x => x.year)).size >= 2 && (labels.length === 0 || labels.some(v => /^(cuenta|concepto|rubro|descripci[oó]n|detalle|partida)s?$/i.test(v)))) { header = r; columns = candidate; break; }
    }
    const available = Array.from({ length: Math.max(0, ...rows.map(row => row.length)) }, (_, c) => c).filter(c => rows.some(row => filled(row[c])));
    const account = available.find(c => !columns.some(x => x.c === c) && rows.slice(Math.max(header + 1, 0)).some(row => typeof row[c] === 'string' && /[a-záéíóúñ]/i.test(row[c]))) ?? available[0] ?? 0;
    const sorted = [...columns].sort((a,b) => a.year - b.year);
    const others = available.filter(c => c !== account);
    return { header, account, available, columns, previous: sorted.at(-2)?.c ?? others[0] ?? '', current: sorted.at(-1)?.c ?? others[1] ?? '', previousYear: sorted.at(-2)?.year ?? '', currentYear: sorted.at(-1)?.year ?? '', first: header + 1, last: rows.length - 1 };
  }
  function extract(data, config) {
    const { rows, problems = [] } = data;
    const cols = [config.account, config.previous, config.current];
    if (cols.some(c => !Number.isInteger(c) || c < 0) || new Set(cols).size !== 3) throw new Error('Elige tres columnas distintas: Cuenta, año anterior y año actual.');
    if (!Number.isInteger(config.first) || !Number.isInteger(config.last) || config.first < 0 || config.last >= rows.length || config.first > config.last) throw new Error('Revisa la primera y última fila que quieres importar.');
    const before = Number(config.previousYear), after = Number(config.currentYear);
    if (!/^\d{4}$/.test(String(config.previousYear)) || !/^\d{4}$/.test(String(config.currentYear)) || before < 1900 || after > 2100 || before >= after) throw new Error('Indica los años: el anterior debe ser menor que el actual.');
    if (!config.confirmed && (yearOf(rows[config.header]?.[config.previous]) !== before || yearOf(rows[config.header]?.[config.current]) !== after)) throw new Error('Confirma a qué año pertenece cada columna antes de continuar.');
    const errors = problems.filter(p => p.r >= config.first && p.r <= config.last && cols.includes(p.c));
    if (errors.length) throw new Error(`${errors[0].address}: ${errors[0].message}`);
    const text = [], selected = [];
    // Conserva títulos y unidades; los demás años del documento no se añaden al encabezado seleccionado.
    for (const row of rows.slice(0, Math.max(0, config.header))) {
      const label = row.filter(v => typeof v === 'string' && !/\d/.test(v)).map(clean).filter(Boolean).join(' ');
      if (label) text.push(label);
    }
    text.push(`Cuenta\t${before}\t${after}`);
    const valueText = v => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 }) : clean(v);
    for (let r = config.first; r <= config.last; r++) {
      const row = [rows[r][config.account], rows[r][config.previous], rows[r][config.current]];
      if (!row.some(filled)) continue;
      if (row.some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error(`Fila ${r + 1}: contiene un número inválido.`);
      selected.push(row); text.push(row.map(valueText).join('\t'));
    }
    if (!selected.length) throw new Error('El rango seleccionado está vacío.');
    if (text.join('\n').length > 200000) throw new Error('La selección es demasiado grande. Reduce las filas que quieres importar.');
    return { text: text.join('\n'), selected };
  }
  const api = { read, sheets, sheetData, suggest, extract, yearOf, MAX_BYTES, MAX_ROWS, MAX_COLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinoraFileTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
