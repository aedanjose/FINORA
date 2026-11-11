(() => {
  'use strict';
  const A = window.FinoraAssets, I = window.FinoraAssetsImport, store = A.createStore(), $ = id => document.getElementById(id), form = $('assets-form');
  let state = null, editing = null, importRow = null, report = null, prepared = null, revision = '', request = 0;
  const node = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };
  const set = (id, value) => { $(id).textContent = value; };
  const error = (id, value = '') => { set(id, value); $(id).hidden = !value; };
  const list = (id, values) => $(id).replaceChildren(...values.map(value => node('li', value)));
  const options = () => ({ mode: $('assets-import-mode').value, year: $('assets-import-year').value });
  const currency = $('topbar-currency'); if (currency) {
    const label = node('span', 'Activos del hogar · C$', currency.className); currency.replaceWith(label);
  }
  function chart(id, groups, series) {
    const host = $(id); host.replaceChildren();
    if (!groups.length) { host.append(node('p', 'Agrega o importa activos para ver el gráfico.', 'note')); return; }
    const max = Math.max(1, ...groups.flatMap(group => series.map(s => group[s.key])));
    for (const group of groups) {
      const div = node('div', undefined, 'assets-chart-group'); div.append(node('strong', `${group.name} · ${group.count} activos`));
      for (const s of series) {
        const caption = node('div', undefined, 'assets-chart-caption'); caption.append(node('span', s.name), node('span', A.money(group[s.key])));
        const track = node('div', undefined, 'progress-track'), bar = node('div', undefined, 'progress-bar');
        track.setAttribute('aria-hidden', 'true'); bar.style.width = group[s.key] / max * 100 + '%'; bar.style.background = s.color;
        bar.dataset.series = s.key; bar.dataset.value = group[s.key]; track.append(bar); div.append(caption, track);
      }
      host.append(div);
    }
  }
  function filterChoices(id, values, empty) {
    const value = $(id).value; $(id).replaceChildren(new Option(empty, ''), ...values.map(name => new Option(name, name)));
    $(id).value = values.includes(value) ? value : '';
  }
  function render() {
    const r = A.summary(state); $('assets-results').hidden = false; $('assets-year').value = r.year;
    set('assets-count', r.count); set('assets-types-caption', `${r.types.length} tipos · ${r.areas.length} áreas`);
    for (const key of ['cost', 'accumulated', 'book']) set('assets-' + key, A.money(r[key]));
    set('assets-replacement', `Reposición estimada: ${A.money(r.replacement)}.${r.missingReplacement ? ` Faltan estimaciones de ${r.missingReplacement} activos; el importe es parcial.` : ''} Es una referencia de compra, no un gasto ni el valor contable.`);
    set('assets-exhausted', `${r.exhausted} activos con la vida útil cumplida en ${r.year}. La antigüedad contable no determina por sí sola el estado físico ni obliga a reemplazarlos.`);
    filterChoices('assets-area', r.areas.map(g => g.name), 'Todas las áreas'); filterChoices('assets-type', r.types.map(g => g.name), 'Todos los tipos');
    $('assets-areas').replaceChildren(...r.areas.map(g => new Option(g.name, g.name))); $('assets-types').replaceChildren(...r.types.map(g => new Option(g.name, g.name)));
    const term = A.norm($('assets-search').value), area = $('assets-area').value, type = $('assets-type').value, condition = $('assets-condition').value;
    const filtered = r.rows.filter(a => (!area || area === a.area) && (!type || type === a.type) && (!condition || a.exhausted === (condition === 'exhausted')) && A.norm(`${a.name} ${a.recommendation} ${a.situation}`).includes(term));
    $('assets-rows').replaceChildren(...filtered.map(a => {
      const tr = node('tr'); tr.dataset.assetId = a.id;
      const name = node('td'); name.append(node('strong', a.name), node('span', a.area, 'cell-sub'));
      tr.append(name, node('td', a.type), node('td', `${a.purchaseYear} · ${a.age} años`), node('td', A.money(a.cost)), node('td', `${a.life} años · ${A.money(a.residual)}`));
      for (const key of ['annual', 'accumulated', 'book', 'replacement']) tr.append(node('td', A.money(a[key])));
      const reading = node('td'); reading.append(node('strong', a.exhausted ? 'Vida útil cumplida' : `${a.remainingYears} años restantes`));
      if (a.situation) reading.append(node('p', a.situation)); if (a.recommendation) reading.append(node('p', a.recommendation)); tr.append(reading);
      const actions = node('td');
      for (const [action, title] of [['edit', 'Editar'], ['delete', 'Eliminar']]) { const b = node('button', title, 'button button-ghost button-small'); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', title + ': ' + a.name); actions.append(b); }
      tr.append(actions); return tr;
    }));
    if (!filtered.length) { const tr = node('tr'), td = node('td', r.count ? 'No hay activos con estos filtros.' : 'Sin activos registrados. Importa tu Excel o agrega un activo para comenzar.', 'assets-empty'); td.colSpan = 11; tr.append(td); $('assets-rows').append(tr); }
    set('assets-filter-count', `Mostrando ${filtered.length} de ${r.count} activos. Las tarjetas y los gráficos resumen todo el levantamiento.`);
    chart('assets-type-chart', r.types, [{ key: 'cost', name: 'Costo', color: 'var(--blue)' }, { key: 'book', name: 'Valor contable', color: 'var(--green)' }]);
    chart('assets-area-chart', r.areas, [{ key: 'accumulated', name: 'Depreciación', color: 'var(--amber)' }, { key: 'book', name: 'Valor contable', color: 'var(--green)' }]);
  }
  function reload() {
    try { state = store.load(); render(); error('assets-storage-error'); $('assets-add').disabled = false; $('assets-year-form').querySelector('button').disabled = false; }
    catch (issue) { state = null; error('assets-storage-error', issue.message); $('assets-results').hidden = true; $('assets-add').disabled = true; $('assets-year-form').querySelector('button').disabled = true; }
  }
  function closeEditor() { $('assets-editor').hidden = true; editing = null; importRow = null; }
  function openEditor(input, row = null) {
    form.reset(); editing = row ? null : input?.id || null; importRow = row;
    for (const name of ['name', 'area', 'type', 'purchaseYear', 'cost', 'life', 'residual', 'replacement', 'situation', 'recommendation']) form.elements[name].value = input?.[name] ?? '';
    if (!input) form.elements.purchaseYear.value = state.year;
    set('assets-editor-title', row ? `Corregir fila ${row.row} del Excel` : editing ? 'Editar activo' : 'Nuevo activo');
    error('assets-form-error'); $('assets-editor').hidden = false; $('assets-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); form.elements.name.focus({ preventScroll: true });
  }
  $('assets-add').addEventListener('click', () => openEditor()); $('assets-editor-close').addEventListener('click', closeEditor);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(new FormData(form));
      if (importRow) { importRow.input = A.asset(input); importRow.issue = ''; previewRows(); preview(); }
      else { if (editing) input.id = editing; state = store.saveAsset(input); render(); window.Finora.toast('Activo guardado; valoración y gráficos actualizados.'); }
      closeEditor(); error('assets-storage-error');
    } catch (issue) { error('assets-form-error', issue.message); }
  });
  $('assets-year-form').addEventListener('submit', event => {
    event.preventDefault(); try { state = store.setYear($('assets-year').value); render(); error('assets-storage-error'); } catch (issue) { error('assets-storage-error', issue.message); }
  });
  for (const id of ['assets-search', 'assets-area', 'assets-type', 'assets-condition']) $(id).addEventListener('input', () => { if (state) render(); });
  $('assets-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button || !state) return;
    const a = state.assets.find(a => a.id === button.closest('[data-asset-id]').dataset.assetId); if (!a) return;
    if (button.dataset.action === 'edit') { openEditor(a); return; }
    const dialog = window.Finora.openDialog('Eliminar activo', '<p id="assets-delete-name"></p><p class="note">Se recalcularán los importes y gráficos del levantamiento.</p><p id="assets-delete-error" class="assets-error" role="alert" hidden></p><button class="button button-primary" id="assets-delete-confirm" type="button">Eliminar activo</button>');
    dialog.querySelector('#assets-delete-name').textContent = a.name;
    dialog.querySelector('#assets-delete-confirm').addEventListener('click', () => {
      try { state = store.removeAsset(a.id); closeEditor(); render(); dialog.close(); } catch (issue) { error('assets-delete-error', issue.message); }
    });
  });
  const describe = totals => `${totals.count} activos · Costo ${A.money(totals.cost)} · Depreciación acumulada ${A.money(totals.accumulated)} · Valor contable ${A.money(totals.book)} · Reposición ${A.money(totals.replacement)}${totals.missingReplacement ? ' (parcial)' : ''}`;
  function preview() {
    prepared = null; $('assets-import-confirm').disabled = true; error('assets-file-error'); set('assets-import-totals', ''); set('assets-import-impact', '');
    list('assets-import-warnings', report.warnings);
    try {
      const current = store.load(); revision = JSON.stringify(current); prepared = I.preview(report, current, options());
      set('assets-import-totals', 'Archivo seleccionado: ' + describe(prepared.fileTotals));
      set('assets-import-impact', `${prepared.added} nuevos · ${prepared.skipped} ya registrados, omitidos · ${prepared.replaced} existentes por reemplazar. Resultado en ${prepared.totals.year}: ${describe(prepared.totals)}`);
      list('assets-import-warnings', prepared.warnings); $('assets-import-confirm').disabled = false;
    } catch (issue) { error('assets-file-error', issue.message); }
  }
  function previewRows() {
    $('assets-preview-rows').replaceChildren(...report.entries.map((entry, index) => {
      const tr = node('tr'); tr.dataset.importRow = index;
      for (const value of [entry.row, `${entry.input.name} · ${entry.input.area}`, A.money(Number(entry.input.cost))]) tr.append(node('td', value));
      const td = node('td'), label = node('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = entry.excluded;
      check.addEventListener('change', () => { entry.excluded = check.checked; preview(); }); label.append(check, ' Excluir fila');
      const edit = node('button', 'Corregir', 'button button-ghost button-small'); edit.type = 'button'; edit.addEventListener('click', () => openEditor(entry.input, entry));
      td.append(node('p', entry.issue || 'Listo', 'note'), label, edit); tr.append(td); return tr;
    }));
  }
  $('assets-import-button').addEventListener('click', () => $('assets-file').click());
  $('assets-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const sequence = ++request; report = null; prepared = null; closeEditor(); $('assets-preview').hidden = true; error('assets-file-error'); set('assets-file-status', 'Leyendo Excel…');
    try {
      if (file.size > window.FinoraFileTable.MAX_BYTES) throw Error('El archivo supera 10 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer()); if (sequence !== request) return;
      report = I.read(bytes, file.name, window.XLSX); $('assets-preview').hidden = false; $('assets-import-mode').value = 'merge'; $('assets-import-year').value = report.year || '';
      set('assets-file-description', `${file.name} · ${report.entries.length} activos identificados`);
      list('assets-sheets', report.sheets.map(s => `${s.name}: ${s.detailed ? 'activos detallados' : 'información de referencia'}`));
      previewRows(); preview(); set('assets-file-status', 'Archivo leído. Revisa los importes y confirma para guardar.');
    } catch (issue) { if (sequence === request) { error('assets-file-error', issue.message); set('assets-file-status', 'No se guardaron cambios.'); } }
    finally { if (sequence === request) event.target.value = ''; }
  });
  for (const id of ['assets-import-mode', 'assets-import-year']) $(id).addEventListener('input', () => { if (report) preview(); });
  $('assets-import-cancel').addEventListener('click', () => { request++; report = null; prepared = null; closeEditor(); $('assets-preview').hidden = true; error('assets-file-error'); set('assets-file-status', 'Importación cancelada. No se guardaron cambios.'); });
  $('assets-import-confirm').addEventListener('click', () => {
    if (!prepared) return;
    try {
      if (JSON.stringify(store.load()) !== revision) { preview(); error('assets-file-error', 'Los activos guardados cambiaron. Revisa la vista previa actualizada antes de confirmar.'); return; }
      const result = store.importData(prepared.incoming, options()); state = result.state; render(); closeEditor(); report = null; prepared = null; $('assets-preview').hidden = true;
      set('assets-file-status', `Importación guardada: ${result.added} nuevos, ${result.skipped} omitidos, ${result.replaced} reemplazados.`); error('assets-file-error');
    } catch (issue) { error('assets-file-error', issue.message); }
  });
  window.addEventListener('storage', event => { if (event.key === A.KEY || event.key === null) reload(); }); reload();
})();
