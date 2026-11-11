(() => {
  'use strict';
  const P = window.FinoraPersonal, I = window.FinoraPersonalImport, store = P.createStore(), $ = id => document.getElementById(id);
  let report = null, prepared = null, revision = '', request = 0;
  const set = (id, value) => { $(id).textContent = value; };
  const error = message => { set('personal-import-error', message || ''); $('personal-import-error').hidden = !message; };
  const options = () => ({ mode: $('personal-import-mode').value, metadata: $('personal-import-metadata').value });
  const list = (id, values) => $(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li; }));
  const totals = r => `Ingresos ${P.money(r.income)} · Gastos ${P.money(r.expense)} · Ahorro separado ${P.money(r.savingBalance)} · Reservas ${P.money(r.reserveBalance)} · Disponible ${P.money(r.available)}`;
  function preview() {
    prepared = null; $('personal-import-confirm').disabled = true; error();
    set('personal-import-totals', ''); set('personal-import-impact', '');
    const chosen = report.entries.filter(row => !row.excluded), periods = [...new Set(chosen.map(row => row.movement.date.slice(0, 7)).filter(P.validPeriod))].sort();
    set('personal-import-description', `${report.name} · ${report.entries.length} movimientos identificados · ${chosen.length} seleccionados · Meses: ${periods.join(', ') || 'pendientes de corregir'}`);
    list('personal-import-warnings', report.warnings);
    try {
      const current = store.load(); revision = JSON.stringify(current);
      prepared = I.preview(report, current, options());
      set('personal-import-totals', 'Totales del archivo seleccionado: ' + totals(prepared.totals));
      const end = P.overview(prepared.state, prepared.periods.at(-1));
      set('personal-import-impact', `${prepared.added} nuevos · ${prepared.duplicates} ya registrados, omitidos · ${prepared.replaced} existentes por reemplazar. Meses: ${prepared.periods.join(', ')}. Resultado combinado al cierre: ${totals(end.accumulated)}.${end.goal ? ` Meta: ${P.money(end.goal.amount)}; avance ${end.goal.percent.toFixed(2)} %.` : ''}`);
      list('personal-import-warnings', prepared.warnings); $('personal-import-confirm').disabled = false;
    } catch (issue) { error(issue.message); }
  }
  function rows() {
    $('personal-import-rows').replaceChildren(...report.entries.map((entry, index) => {
      const tr = document.createElement('tr'); tr.dataset.importRow = index;
      const values = [entry.row, `${entry.movement.date} · ${P.types[entry.movement.type] || entry.movement.type}`, `${entry.movement.description} · ${entry.movement.category}`, P.money(Number(entry.movement.amount))];
      values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
      const td = document.createElement('td'), issue = document.createElement('p'); issue.className = 'note'; issue.textContent = entry.issue || 'Listo';
      const label = document.createElement('label'), exclude = document.createElement('input'); exclude.type = 'checkbox'; exclude.checked = entry.excluded;
      exclude.addEventListener('change', () => { entry.excluded = exclude.checked; preview(); }); label.append(exclude, ' Excluir fila');
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-ghost button-small'; edit.textContent = 'Corregir';
      edit.setAttribute('aria-label', `Corregir fila ${entry.row}`); edit.addEventListener('click', () => editRow(entry));
      td.append(issue, label, edit); tr.append(td); return tr;
    }));
  }
  function editRow(entry) {
    const dialog = window.Finora.openDialog('Revisar movimiento del Excel', '<form id="personal-import-edit"><div class="form-grid"></div><p class="personal-error" id="personal-import-edit-error" role="alert" hidden></p><div class="draft-actions"><button class="button button-primary" type="submit">Aplicar corrección</button></div></form>');
    const form = dialog.querySelector('form'), grid = form.querySelector('.form-grid');
    for (const [key, title, type] of [['date', 'Fecha', 'date'], ['type', 'Tipo', 'select'], ['amount', 'Monto (C$)', 'number'], ['category', 'Categoría', 'text'], ['description', 'Descripción', 'text'], ['priority', 'Prioridad del gasto', 'select'], ['paymentMethod', 'Medio de pago (opcional)', 'text']]) {
      const label = document.createElement('label'); label.className = 'field'; const caption = document.createElement('span'); caption.className = 'field-label'; caption.textContent = title;
      const input = document.createElement(type === 'select' ? 'select' : 'input'); input.name = key; input.className = type === 'select' ? 'select' : 'input';
      if (type === 'select') {
        input.append(new Option('Selecciona', ''));
        const values = key === 'type' ? P.types : { need: 'Necesidad', want: 'Deseo' };
        for (const [value, name] of Object.entries(values)) input.append(new Option(name, value));
      } else input.type = type;
      if (type === 'number') { input.step = '0.01'; input.min = '0.01'; input.max = P.MAX_AMOUNT; }
      if (type === 'text') input.maxLength = key === 'description' ? 120 : 60;
      input.required = !['priority', 'paymentMethod'].includes(key); input.value = entry.movement[key] || '';
      label.append(caption, input); grid.append(label);
    }
    const priority = () => { form.elements.priority.required = form.elements.type.value === 'expense'; form.elements.priority.disabled = form.elements.type.value !== 'expense'; };
    form.elements.type.addEventListener('change', priority); priority();
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { entry.movement = P.movement(Object.fromEntries(new FormData(form))); entry.issue = ''; rows(); preview(); dialog.close(); }
      catch (issue) { const message = dialog.querySelector('#personal-import-edit-error'); message.hidden = false; message.textContent = issue.message; }
    });
  }
  $('personal-import-button').addEventListener('click', () => $('personal-import-file').click());
  $('personal-import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const sequence = ++request; report = null; prepared = null; $('personal-import-preview').hidden = true; error();
    set('personal-import-status', 'Leyendo el Excel…');
    try {
      if (file.size > window.FinoraFileTable.MAX_BYTES) throw new Error('El archivo supera 10 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer()); if (sequence !== request) return;
      report = I.read(bytes, file.name, window.XLSX);
      $('personal-import-mode').value = 'merge'; $('personal-import-metadata').value = 'keep';
      $('personal-import-preview').hidden = false;
      const roles = { inicio: 'meta y controles', registro: 'movimientos detallados', seguimiento: 'resumen, sin duplicar', proyeccion: 'planificación / ejecución, sin movimientos adicionales', listas: 'catálogos de referencia' };
      list('personal-import-sheets', report.sheets.map(sheet => `${sheet.name}: ${roles[sheet.role] || 'no utilizada'}`));
      const form = $('personal-import-opening'); form.hidden = !report.openingReview;
      if (report.openingReview) for (const key of ['period', 'available', 'saving', 'reserve']) form.elements[key].value = report.opening[key];
      rows(); preview(); set('personal-import-status', 'Archivo leído. Revisa la vista previa y confirma para guardar.');
    } catch (issue) { if (sequence === request) { error(issue.message); set('personal-import-status', 'No se guardaron cambios.'); } }
    finally { if (sequence === request) event.target.value = ''; }
  });
  $('personal-import-opening').addEventListener('input', () => { if (report) { report.openingReview = true; preview(); } });
  $('personal-import-opening').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const value = Object.fromEntries(new FormData(event.target)); P.setOpening(P.blank(), value);
      report.opening = value; report.openingReview = false; preview();
    } catch (issue) { error(issue.message); }
  });
  for (const id of ['personal-import-mode', 'personal-import-metadata']) $(id).addEventListener('change', () => { if (report) preview(); });
  $('personal-import-cancel').addEventListener('click', () => {
    request++; report = null; prepared = null; $('personal-import-preview').hidden = true; error(); set('personal-import-status', 'Importación cancelada. No se guardaron cambios.');
  });
  $('personal-import-confirm').addEventListener('click', () => {
    if (!prepared) return;
    try {
      if (JSON.stringify(store.load()) !== revision) { preview(); error('Los registros cambiaron mientras revisabas el archivo. La vista previa se actualizó; revísala y confirma de nuevo.'); return; }
      const result = store.importData(prepared.data, options());
      report = null; prepared = null; $('personal-import-preview').hidden = true;
      set('personal-import-status', `Importación guardada: ${result.added} nuevos, ${result.duplicates} ya registrados omitidos, ${result.replaced} reemplazados.`);
      window.dispatchEvent(new Event('personal:imported')); error(); window.Finora.toast('Presupuesto importado. Tablas y gráficos actualizados.');
    } catch (issue) { error(issue.message); }
  });
})();
