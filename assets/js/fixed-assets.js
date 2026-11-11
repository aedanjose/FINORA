/* Activos del hogar: valoración lineal por años completos, independiente del inventario. */
(function (root) {
  'use strict';
  const KEY = 'finora:fixed-assets:v1', MAX = 1e12, clone = value => JSON.parse(JSON.stringify(value));
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  let sequence = 0;
  const id = () => root.crypto?.randomUUID?.() || `asset-${Date.now().toString(36)}-${sequence++}`;
  function text(value, label, max = 120, optional = false) {
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max) throw Error(`${label}: completa el campo (máximo ${max} caracteres).`);
    return value.trim();
  }
  function moneyInput(value, label) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value).trim()) || !Number.isFinite(Number(value)) || Number(value) > MAX) throw Error(`${label}: indica un importe no negativo con hasta dos decimales.`);
    return Math.round(Number(value) * 100);
  }
  function integer(value, label, max = 9999) {
    if (!/^\d+$/.test(String(value).trim()) || Number(value) < 1 || Number(value) > max) throw Error(`${label}: indica un entero entre 1 y ${max}.`);
    return Number(value);
  }
  function asset(input) {
    if (!input) throw Error('Completa los datos del activo.');
    const cost = moneyInput(input.cost, 'Costo'), residual = moneyInput(input.residual, 'Residual');
    if (residual > cost) throw Error('El valor residual no puede superar el costo.');
    return { name: text(input.name, 'Activo'), area: text(input.area, 'Área', 60), type: text(input.type, 'Tipo', 60),
      purchaseYear: integer(input.purchaseYear, 'Año de compra'), cost: cost / 100, life: integer(input.life, 'Vida útil', 1000), residual: residual / 100,
      replacement: input.replacement === null || input.replacement === undefined || input.replacement === '' ? null : moneyInput(input.replacement, 'Reposición') / 100,
      situation: text(input.situation ?? '', 'Situación', 180, true), recommendation: text(input.recommendation ?? '', 'Recomendación', 300, true) };
  }
  const ratio = (cents, years, life) => Number((BigInt(cents) * BigInt(years) * 2n + BigInt(life)) / (2n * BigInt(life)));
  function calculate(input, year) {
    const a = asset(input), valuationYear = integer(year, 'Año de valoración');
    if (a.purchaseYear > valuationYear) throw Error(`${a.name}: la compra es posterior al año de valoración.`);
    const age = valuationYear - a.purchaseYear, cost = moneyInput(a.cost, 'Costo'), residual = moneyInput(a.residual, 'Residual'), base = cost - residual;
    const annual = ratio(base, 1, a.life), accumulated = ratio(base, Math.min(age, a.life), a.life);
    return { ...a, id: input.id, age, annual: annual / 100, accumulated: accumulated / 100, book: (cost - accumulated) / 100,
      remainingYears: Math.max(0, a.life - age), exhausted: age >= a.life, consumedPercent: Math.min(age / a.life, 1) * 100 };
  }
  function blank(year = new Date().getFullYear()) { return { version: 1, currency: 'C$', year: integer(year, 'Año de valoración'), assets: [], imported: [] }; }
  function validate(state) {
    if (!state || state.version !== 1 || state.currency !== 'C$' || !Array.isArray(state.assets) || !Array.isArray(state.imported)) throw Error('Formato de activos no compatible.');
    integer(state.year, 'Año de valoración'); const ids = new Set();
    for (const a of state.assets) {
      text(a.id, 'Identificador', 100); if (ids.has(a.id)) throw Error('Hay identificadores duplicados.'); ids.add(a.id); calculate(a, state.year);
    }
    if (state.imported.some(key => typeof key !== 'string')) throw Error('Historial de importación no válido.');
    return state;
  }
  function total(rows, key) {
    const cents = rows.reduce((sum, row) => sum + Math.round(row[key] * 100), 0);
    if (!Number.isSafeInteger(cents) || cents > MAX * 100) throw Error('El total de activos supera el límite de importes.');
    return cents / 100;
  }
  function summary(state) {
    validate(state); const rows = state.assets.map(a => calculate(a, state.year)), known = rows.filter(a => a.replacement !== null);
    const groups = key => [...new Set(rows.map(a => a[key]))].map(name => {
      const group = rows.filter(a => a[key] === name);
      return { name, count: group.length, cost: total(group, 'cost'), book: total(group, 'book'), accumulated: total(group, 'accumulated') };
    });
    return { year: state.year, count: rows.length, rows, cost: total(rows, 'cost'), annual: total(rows, 'annual'), accumulated: total(rows, 'accumulated'), book: total(rows, 'book'),
      replacement: known.length ? total(known, 'replacement') : null, missingReplacement: rows.length - known.length,
      exhausted: rows.filter(a => a.exhausted).length, types: groups('type'), areas: groups('area') };
  }
  function upsert(state, input) {
    validate(state); const data = asset(input), next = clone(state), at = next.assets.findIndex(a => a.id === input.id);
    if (input.id && at < 0) throw Error('El activo ya no existe.');
    const row = { id: input.id || id(), ...data }; if (at < 0) next.assets.push(row); else next.assets[at] = row;
    summary(next); return next;
  }
  function remove(state, assetId) {
    validate(state); if (!state.assets.some(a => a.id === assetId)) throw Error('El activo ya no existe.');
    const next = clone(state); next.assets = next.assets.filter(a => a.id !== assetId); return next;
  }
  function setYear(state, year) { const next = clone(validate(state)); next.year = integer(year, 'Año de valoración'); summary(next); return next; }
  const fingerprint = input => { const a = asset(input); return JSON.stringify([norm(a.name), norm(a.area), norm(a.type), a.purchaseYear, a.cost, a.life, a.residual, a.replacement]); };
  function prepareImport(state, incoming, { mode = 'merge', year = incoming.year } = {}) {
    validate(state);
    if (!['merge', 'replace'].includes(mode) || !Array.isArray(incoming.assets) || !incoming.assets.length) throw Error('Selecciona activos válidos y cómo importarlos.');
    const next = mode === 'replace' ? blank(year) : clone(state); next.year = integer(year, 'Año de valoración');
    const known = new Set(next.imported), existing = new Map(), seen = new Map(); let added = 0, skipped = 0;
    next.assets.forEach(a => { const key = fingerprint(a); existing.set(key, (existing.get(key) || 0) + 1); });
    for (const input of incoming.assets) {
      const data = asset(input), base = fingerprint(data), occurrence = (seen.get(base) || 0) + 1, key = base + '#' + occurrence; seen.set(base, occurrence);
      if (known.has(key) || occurrence <= (existing.get(base) || 0)) { skipped++; continue; }
      next.assets.push({ id: id(), ...data }); next.imported.push(key); known.add(key); added++;
    }
    const totals = summary(next);
    return { state: next, totals, added, skipped, replaced: mode === 'replace' ? state.assets.length : 0 };
  }
  function createStore(provider = () => root.localStorage) {
    const storage = () => typeof provider === 'function' ? provider() : provider;
    const load = () => {
      let raw; try { raw = storage().getItem(KEY); } catch (_) { throw Error('No se pueden leer los activos de este navegador.'); }
      if (raw === null) return blank();
      try { return clone(validate(JSON.parse(raw))); } catch (issue) { throw Error('No se pudieron cargar los activos. No se sobrescribieron. ' + issue.message); }
    };
    const save = next => { try { storage().setItem(KEY, JSON.stringify(next)); } catch (_) { throw Error('No se pudo guardar; conserva el formulario y revisa el almacenamiento del navegador.'); } return clone(next); };
    return { load, saveAsset: input => save(upsert(load(), input)), removeAsset: assetId => save(remove(load(), assetId)), setYear: year => save(setYear(load(), year)),
      importData: (incoming, options) => { const r = prepareImport(load(), incoming, options); return { ...r, state: save(r.state) }; } };
  }
  const money = value => Number.isFinite(value) ? 'C$ ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Sin dato';
  const api = { KEY, MAX, blank, asset, calculate, summary, upsert, remove, setYear, prepareImport, createStore, money, norm };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FinoraAssets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
