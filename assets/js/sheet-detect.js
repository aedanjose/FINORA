/* Detección automática de estados financieros en un libro de Excel.
   Puntúa cada hoja por estructura y contenido (no solo por su nombre), encuentra columnas, años y filas reales,
   e ignora hojas auxiliares. Es pura: no guarda nada; la revisión y el guardado siguen en paste-import.js. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const T = node ? require('./file-table.js') : root.FinoraFileTable;
  const P = node ? require('./paste-import.js') : root.FinoraPaste;
  const KINDS = ['balance', 'income'];
  const LABEL = { balance: 'balance general', income: 'estado de resultados' };
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const clone = v => JSON.parse(JSON.stringify(v));
  const number = v => typeof v === 'number' && Number.isFinite(v);
  // Nombres que suelen ser hojas de apoyo: restan puntos, pero una hoja con estructura de estado igual puede ganar.
  const AUXILIARY = /(gu[ií]a|instruc|ayuda|clave|cat[aá]logo|codig|nota|presupuesto|complement|clasificar|ejercicio|practica|supuesto|hoja\d*$)/;
  const NAME_KIND = { balance: /balance|situaci[oó]n|posici[oó]n/, income: /resultado|p[eé]rdidas y ganancias|income/ };
  const EXACT = { balance: /^(balance( general)?|estado de situacion( financiera)?)$/, income: /^(estado de )?resultados?$/ };

  const isAmount = v => number(v) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(P.parseAmount(v)));

  // Columnas, años y rango de cuentas sin intervención: del encabezado con dos años a la última fila con importes.
  function locate(rows) {
    const s = T.suggest(rows);
    if (s.columns.length < 2 || !s.previousYear || !s.currentYear || s.previousYear === s.currentYear) return { reason: 'No tiene un encabezado con dos años (por ejemplo, 2024 y 2025).' };
    let last = -1;
    for (let r = rows.length - 1; r > s.header; r--) if (isAmount(rows[r]?.[s.previous]) || isAmount(rows[r]?.[s.current])) { last = r; break; }
    if (last < 0) return { reason: 'Tiene años en el encabezado, pero ninguna fila con importes debajo.' };
    return { config: { account: s.account, previous: s.previous, current: s.current, previousYear: s.previousYear, currentYear: s.currentYear, header: s.header, first: s.header + 1, last, confirmed: true } };
  }

  // Qué tan bien encaja el texto extraído como cada tipo de estado.
  function score(text, kind, name) {
    const draft = P.analyze(text, { kind, mode: 'replace' });
    const rows = draft.rows.filter(r => r.include !== false);
    const n = rows.length;
    if (!n) return { kind, score: 0, draft, rows: 0 };
    const known = rows.filter(r => !r.needsReview).length;
    const classified = rows.filter(r => kind === 'balance' ? r.section && (r.section === 'equity' || r.term) : r.category).length;
    const parts = new Set(rows.map(r => kind === 'balance' ? r.section : r.category));
    const structure = kind === 'balance' ? parts.has('asset') && (parts.has('liability') || parts.has('equity')) : parts.has('sales') && (parts.has('costSales') || parts.has('opex'));
    const confirmed = clone(draft); confirmed.rows.forEach(r => { r.confirmed = true; });
    const check = P.validate(confirmed);
    const sides = ['previous', 'current'];
    const coherent = kind === 'balance' ? sides.every(s => check.summary?.[s]?.balanced === true) : sides.every(s => number(check.summary?.[s]?.netProfit));
    const n2 = norm(name);
    const value = .35 * classified / n + .35 * known / n + (structure ? .15 : 0) + (coherent ? .15 : 0) + (NAME_KIND[kind].test(n2) ? .05 : 0) - (AUXILIARY.test(n2) ? .25 : 0);
    return { kind, score: Math.round(value * 1000) / 1000, draft, check, rows: n, known, structure, coherent };
  }

  // Avisos que el usuario debe ver antes de aplicar.
  function warnings(result) {
    const out = [], draft = result.draft, check = result.check;
    const rows = draft.rows.filter(r => r.include !== false);
    const seen = new Map();
    rows.forEach(r => { const k = norm(r.name); seen.set(k, [...(seen.get(k) || []), r]); });
    for (const [, list] of seen) if (list.length > 1) out.push({ level: 'warn', text: `Cuenta repetida: «${list[0].name}» aparece ${list.length} veces.` });
    const incomplete = rows.filter(r => ['previous', 'current'].some(s => r.amounts[s] === null) && ['previous', 'current'].some(s => r.amounts[s] !== null));
    if (incomplete.length) out.push({ level: 'warn', text: `${incomplete.length === 1 ? 'Una cuenta tiene' : `${incomplete.length} cuentas tienen`} un período sin importe: ${incomplete.slice(0, 3).map(r => r.name).join(', ')}.` });
    if (result.kind === 'balance') for (const s of ['previous', 'current']) {
      const sum = check.summary?.[s];
      if (sum && sum.balanced === false) out.push({ level: 'error', text: `${draft.periods[s]}: el balance no cuadra. Activos ${fmt(sum.assets)} − pasivo y patrimonio ${fmt(sum.funding)} = ${fmt(sum.difference)}.` });
    }
    (check.totals || []).filter(t => t.status === 'diff').forEach(t => out.push({ level: 'warn', text: `«${t.name}» del documento no coincide con la suma de sus cuentas.` }));
    const pending = rows.filter(r => r.needsReview);
    if (pending.length) out.push({ level: 'review', text: `${pending.length} ${pending.length === 1 ? 'cuenta necesita' : 'cuentas necesitan'} confirmar su clasificación: ${pending.slice(0, 3).map(r => r.name).join(', ')}${pending.length > 3 ? '…' : ''}.` });
    return out;
  }
  const fmt = v => number(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';

  // Analiza una hoja: si es un estado, con qué tipo, configuración y avisos; si no, por qué se ignora.
  function analyzeSheet(data, name = data?.name || '') {
    const rows = data?.rows || [];
    if (!rows.some(row => row?.some(v => v !== null && v !== ''))) return { name, ignored: true, reason: 'La hoja está vacía.' };
    const place = locate(rows);
    if (!place.config) return { name, ignored: true, reason: place.reason };
    let extracted;
    try { extracted = T.extract({ rows, problems: data.problems || [] }, place.config); }
    catch (error) { return { name, ignored: true, reason: error.message }; }
    const results = KINDS.map(kind => score(extracted.text, kind, name)).sort((a, b) => b.score - a.score);
    const best = results[0];
    if (!best.structure || best.rows < 3 || best.score < .55) {
      const why = best.rows < 3 ? 'Tiene muy pocas cuentas con importes.' : !best.structure ? 'Sus cuentas no forman un balance ni un estado de resultados completo.' : 'Sus cuentas se reconocen poco; parece una hoja de apoyo.';
      return { name, ignored: true, reason: why, score: best.score };
    }
    const years = { previous: Number(place.config.previousYear), current: Number(place.config.currentYear) };
    const draft = best.draft; draft.periods = { previous: String(years.previous), current: String(years.current) };
    return { name, ignored: false, kind: best.kind, score: best.score, config: place.config, text: extracted.text, years, accounts: best.rows, known: best.known,
      pending: draft.rows.filter(r => r.include !== false && r.needsReview).length, totals: draft.totals.length, coherent: best.coherent, draft, warnings: warnings(best) };
  }

  // Elige el mejor balance y el mejor estado de resultados del libro; marca la ambigüedad cuando hay dos parecidos.
  function detectWorkbook(sheets) {
    const analyzed = sheets.map(s => analyzeSheet(s.data, s.name));
    const out = { sheets: analyzed, ignored: analyzed.filter(a => a.ignored), choice: {}, candidates: {}, ambiguous: {}, notes: [] };
    for (const kind of KINDS) {
      const list = analyzed.filter(a => !a.ignored && a.kind === kind)
        .sort((a, b) => (b.score - a.score) || ((EXACT[kind].test(norm(b.name)) ? 1 : 0) - (EXACT[kind].test(norm(a.name)) ? 1 : 0)) || (a.pending - b.pending));
      out.candidates[kind] = list;
      out.choice[kind] = list[0]?.name || null;
      out.ambiguous[kind] = list.length > 1 && list[1].score >= list[0].score - .1;
    }
    const b = out.candidates.balance[0], i = out.candidates.income[0];
    if (b && i && (b.years.previous !== i.years.previous || b.years.current !== i.years.current)) out.notes.push({ level: 'error', text: `El balance (${b.years.previous}–${b.years.current}) y los resultados (${i.years.previous}–${i.years.current}) no son de los mismos años.` });
    if (!b && !i) out.notes.push({ level: 'error', text: 'No se encontró ningún balance general ni estado de resultados con dos años. Usa la configuración manual.' });
    return out;
  }
  const pick = (result, kind, name) => result.candidates[kind].find(c => c.name === name) || result.candidates[kind][0] || null;

  const api = { analyzeSheet, detectWorkbook, pick, locate, LABEL };
  if (node) module.exports = api; else root.FinoraSheetDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
