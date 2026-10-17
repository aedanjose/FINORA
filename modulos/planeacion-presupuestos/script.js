(() => {
  'use strict';
  const C = window.FinoraCasos, B = window.FinoraBudget, I = window.FinoraBudgetImport;
  const T = window.FinoraFileTable, P = window.FinoraPaste, { esc } = window.FinoraCaseBar;
  const editor = document.getElementById('budget-editor'), results = document.getElementById('budget-results');
  const notice = document.getElementById('budget-notice');
  let model, draft, snapshot, dirty = false, saving = false, libraryPromise;
  const drafts = new Map();
  const money = v => Number.isFinite(v) ? C.fmt.money(v, model) : '—';
  const plain = v => Number.isFinite(v) ? (v < 0 ? '−' : '') + C.fmt.plain(v, 4) : '—';
  const shown = v => v === null || v === undefined ? '' : String(v);
  const numeric = value => { const parsed = P.parseAmount(value); return Number.isNaN(parsed) ? value : parsed; };
  const input = (path, label, value, extra = '') => `<label>${esc(label)}<input class="input" data-path="${esc(path)}" inputmode="decimal" value="${esc(shown(value))}" placeholder="Sin informar" ${extra}></label>`;
  function getDraftKey(c) { return c.id + B.context(c); }
  function load() {
    if (model && dirty) drafts.set(getDraftKey(model), { draft: structuredClone(draft), snapshot });
    model = C.store.active();
    const pending = drafts.get(getDraftKey(model));
    draft = pending ? pending.draft : B.settingsFor(model);
    snapshot = pending ? pending.snapshot : JSON.stringify(model);
    dirty = !!pending;
    notice.textContent = model.sample ? 'Empresa de ejemplo seleccionada. Para trabajar con datos reales, crea o importa tu empresa en Estados financieros.' : '';
    if (!C.store.started()) notice.textContent = 'Empieza creando o importando tu empresa en Estados financieros. Los casos de clase están identificados como ejemplos.';
    if (model.params?.budget && model.params.budget.context !== B.context(model)) notice.textContent += ' El presupuesto anterior se conserva, pero no se aplica a estos años, moneda o escala. Al guardar lo nuevo se archivará el anterior.';
    renderEditor(); renderResults();
  }
  function renderEditor() {
    const auto = B.automaticOpening(model), manual = draft.openingSource === 'manual';
    editor.innerHTML = `<form id="budget-form" novalidate>
      <section class="panel budget-section"><div class="panel-header"><div><h2 class="panel-title">1. Datos de partida</h2><p class="panel-subtitle">Saldos al inicio del primer mes presupuestado</p></div></div><div class="panel-body">
        <p class="budget-help">Este modelo trabaja con una línea comercial de unidades comparables y costo promedio ponderado mensual. Los importes y precios usan <span class="budget-unit">${esc(C.fmt.unit(model))}</span>. No mezcles productos con costos diferentes en una misma unidad.</p>
        <div class="budget-grid"><label>Origen de los saldos<select class="select" id="budget-opening-source"><option value="automatic"${manual ? '' : ' selected'}>Automático · balance actual</option><option value="manual"${manual ? ' selected' : ''}>Manual · saldos de partida</option></select></label>${input('inventoryUnits', 'Unidades de inventario inicial', draft.inventoryUnits)}</div>
        <details${manual ? ' open' : ''}><summary>${manual ? 'Ingresar saldos iniciales' : `Revisar saldos del balance de ${esc(model.periods.current)}`}</summary><p class="budget-help">Un espacio vacío significa dato pendiente. El cero debe estar informado. Los saldos manuales solo se usan en este presupuesto; no cambian las cuentas históricas.</p><div class="budget-grid">${Object.entries(B.openingFields).map(([key, label]) => input('opening.' + key, label, manual ? draft.opening[key] : auto.amounts[key], manual ? '' : 'readonly')).join('')}</div>${!manual ? '<p class="budget-help"><a class="link" href="../estados-financieros/index.html">Importar Excel/CSV o completar el balance manualmente →</a></p>' : ''}</details>
      </div></section>
      <section class="panel budget-section"><div class="panel-header"><div><h2 class="panel-title">2. Políticas del presupuesto</h2><p class="panel-subtitle">Supuestos que la empresa debe definir</p></div></div><div class="panel-body"><div class="budget-grid">
        ${input('inventoryPercent', 'Inventario final · % de unidades del mes siguiente', draft.inventoryPercent)}
        ${input('nextUnits', 'Unidades de venta del mes posterior al presupuesto', draft.nextUnits)}
        ${input('collectionPercent', 'Ventas cobradas en el mismo mes · %', draft.collectionPercent)}
        ${input('paymentPercent', 'Compras pagadas en el mismo mes · %', draft.paymentPercent)}
      </div><p class="budget-help">El crédito restante se cobra o paga al mes siguiente. Las cuentas por cobrar y pagar iniciales se liquidan en el primer mes. El inventario disponible puede superar el objetivo; no se calculan devoluciones automáticas.</p></div></section>
      <section class="panel budget-section"><div class="panel-header"><div><h2 class="panel-title">3. Previsiones mensuales</h2><p class="panel-subtitle">Ingreso manual o importación revisada de Excel/CSV</p></div></div><div class="panel-body">
        <div class="budget-actions"><button type="button" class="button button-secondary" id="budget-import">Importar Excel o CSV</button><button type="button" class="button button-ghost" id="budget-template">Descargar plantilla CSV</button><button type="button" class="button button-secondary" id="budget-add-month">Agregar mes</button></div>
        <p class="budget-help">Desplaza la tabla para completar las columnas. Escribe 0 en los movimientos que no apliquen. Los préstamos netos son positivos al recibir dinero y negativos al amortizar deuda de largo plazo. La depreciación se informa aparte de los gastos pagados.</p>
        <div class="budget-scroll"><table class="budget-input-table"><caption>Previsiones en ${esc(C.fmt.unit(model))}. Las unidades son cantidades físicas.</caption><thead><tr><th scope="col">Mes</th>${Object.values(B.fields).map(label => `<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${draft.months.map((row, index) => `<tr><td><div class="month-cell"><input class="input" type="month" data-path="months.${index}.month" value="${esc(row.month)}" aria-label="Mes ${index + 1}"><button class="mini-button" type="button" data-remove-month="${index}" aria-label="Quitar mes ${index + 1}"${draft.months.length === 1 ? ' disabled' : ''}>×</button></div></td>${Object.entries(B.fields).map(([key, label]) => `<td><input class="input" inputmode="decimal" data-path="months.${index}.${key}" value="${esc(shown(row[key]))}" placeholder="Pendiente" aria-label="${esc(label)} · mes ${index + 1}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <label class="budget-confirm"><input type="checkbox" id="budget-confirm"${draft.confirmed && draft.baseSignature === B.signature(model) ? ' checked' : ''}><span>Revisé los datos y confirmo que los saldos corresponden al inicio del primer mes. Se aplican los plazos descritos arriba; gastos, intereses, impuestos, otros ingresos y dividendos se pagan o cobran en el mes. Las inversiones se pagan al contado, el financiamiento corresponde a deuda de largo plazo y los demás saldos del balance se mantienen constantes.</span></label>
        <div class="budget-actions"><button class="button button-primary" type="submit">Guardar y recalcular</button><button class="button button-secondary" type="button" id="budget-reload">Descartar cambios sin guardar</button><span id="budget-save-state" role="status">${dirty ? 'Cambios sin guardar' : 'Los cambios se guardan al pulsar Guardar y recalcular.'}</span></div><p id="budget-save-error" class="budget-error" role="alert"></p>
      </div></section></form>`;
    document.getElementById('budget-form').addEventListener('submit', save);
    document.getElementById('budget-opening-source').addEventListener('change', event => {
      draft.openingSource = event.target.value; draft.confirmed = false; markDirty(); renderEditor(); renderResults();
    });
    document.getElementById('budget-confirm').addEventListener('change', event => { draft.confirmed = event.target.checked; draft.baseSignature = B.signature(model); markDirty(); renderResults(); });
    document.getElementById('budget-add-month').addEventListener('click', () => {
      if (draft.months.length >= 24) { window.Finora.toast('Puedes presupuestar hasta 24 meses.'); return; }
      draft.months.push(B.blankMonth(B.nextMonth(draft.months.at(-1)?.month))); markDirty(); renderEditor(); renderResults();
    });
    document.getElementById('budget-reload').addEventListener('click', () => { drafts.delete(getDraftKey(model)); dirty = false; load(); });
    document.getElementById('budget-import').addEventListener('click', openImport);
    document.getElementById('budget-template').addEventListener('click', downloadTemplate);
  }
  function markDirty() {
    dirty = true;
    const status = document.getElementById('budget-save-state');
    if (status) status.textContent = 'Cambios sin guardar · la proforma usa el último presupuesto guardado.';
  }
  editor.addEventListener('input', event => {
    const el = event.target;
    if (!el.dataset.path || el.readOnly) return;
    const path = el.dataset.path.split('.'); let dest = draft;
    for (const key of path.slice(0, -1)) dest = dest[key];
    const value = path.at(-1) === 'month' ? el.value : numeric(el.value);
    dest[path.at(-1)] = value;
    el.setAttribute('aria-invalid', String(value !== null && path.at(-1) !== 'month' && !Number.isFinite(value)));
    markDirty(); renderResults();
  });
  editor.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-month]');
    if (!button || draft.months.length <= 1) return;
    draft.months.splice(Number(button.dataset.removeMonth), 1); markDirty(); renderEditor(); renderResults();
  });
  function save(event) {
    event.preventDefault();
    const current = C.store.active(), error = document.getElementById('budget-save-error');
    if (current.id !== model.id || JSON.stringify(current) !== snapshot) { error.textContent = 'La empresa cambió en otra vista. Conserva tus cambios y recarga antes de guardar para evitar sobrescribir datos nuevos.'; return; }
    const previous = current.params?.budget;
    current.params ||= {};
    if (previous && previous.context !== B.context(current)) {
      current.params.budgetArchive ||= []; current.params.budgetArchive.push(previous);
    }
    current.params.budget = structuredClone(draft);
    saving = true; const persisted = C.store.save(current); saving = false;
    model = C.store.active(); snapshot = JSON.stringify(model); dirty = false; drafts.delete(getDraftKey(model));
    document.getElementById('budget-save-state').textContent = persisted ? 'Presupuesto guardado en este navegador.' : 'Solo guardado en memoria. El navegador no permitió conservarlo al cerrar.';
    error.textContent = ''; renderResults();
  }
  function resultTable(title, columns, rows) {
    return `<section class="panel budget-section"><div class="panel-header"><h2 class="panel-title">${esc(title)}</h2></div><div class="budget-scroll"><table class="data-table"><thead><tr><th scope="col">Mes</th>${columns.map(([, label]) => `<th scope="col" class="table-number">${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${esc(r.month || 'Pendiente')}</th>${columns.map(([key,,unit]) => `<td class="table-number">${esc(unit === 'units' ? plain(r[key]) : money(r[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  function renderResults() {
    const r = B.analyze(model, draft);
    const title = r.status === 'ready' ? 'Presupuesto calculado' : r.status === 'review' ? 'Presupuesto calculado · revisar alertas' : 'Presupuesto incompleto';
    results.innerHTML = `<div class="budget-status" data-state="${r.status}"><strong>${title}</strong><p>${dirty ? 'Vista previa con cambios sin guardar.' : 'La proforma utiliza estos mismos cálculos.'} ${model.sample ? 'Datos de un caso de ejemplo.' : ''} Los espacios sin información aparecen como —.</p>${r.issues.length ? `<details><summary>${r.issues.length} datos o revisiones pendientes</summary><ul>${r.issues.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}${r.warnings.length ? `<ul>${r.warnings.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</div>
      <div class="budget-flow" aria-label="Presupuestos conectados"><span>Ventas</span><span>Compras e inventario</span><span>Costo de ventas</span><span>Gastos y resultados</span><span>Caja</span><span>Proforma</span></div>
      ${resultTable('Ventas, compras e inventario', [['units','Ventas · unidades','units'],['sales','Ventas'],['purchaseUnits','Compras · unidades','units'],['purchases','Compras'],['endingUnits','Inventario final · unidades','units'],['inventory','Inventario final'],['costSales','Costo de ventas']], r.rows)}
      ${resultTable('Gastos y estado de resultados', [['sales','Ventas'],['costSales','Costo de ventas'],['grossProfit','Utilidad bruta'],['operatingExpenses','Gastos + depreciación'],['otherIncome','Otros ingresos'],['interest','Intereses'],['taxes','Impuestos'],['netProfit','Utilidad neta']], r.rows)}
      ${resultTable('Presupuesto de caja', [['openingCash','Saldo inicial'],['collections','Cobros de ventas'],['payments','Pagos de compras'],['opex','Gastos pagados'],['otherIncome','Otros ingresos'],['interest','Intereses'],['taxes','Impuestos'],['capex','Inversiones'],['financing','Préstamos netos'],['dividends','Dividendos'],['cash','Saldo final']], r.rows)}
      <p class="budget-help">Costo promedio ponderado = valor disponible ÷ unidades disponibles. Compras = máximo de 0 y ventas + inventario objetivo − inventario inicial. El cierre de cada mes alimenta el inicio del siguiente. <a class="link" href="../proforma/index.html">Ver resultados acumulados y balance proforma →</a></p>`;
  }
  function library() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '../../assets/vendor/sheetjs/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX); script.onerror = () => { libraryPromise = null; script.remove(); reject(new Error('No se pudo cargar el lector de archivos.')); }; document.head.append(script);
    });
    return libraryPromise;
  }
  function downloadTemplate() {
    const csv = '\uFEFF' + Object.values(I.labels).join(';') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla-presupuesto.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openImport() {
    const original = JSON.stringify(draft), company = model.id, companySnapshot = JSON.stringify(C.store.active());
    const dialog = window.Finora.openDialog('Importar previsiones mensuales', `<p>Elige una hoja con un mes por fila. Usa AAAA-MM en Mes. Revisa las columnas y la vista previa: se reemplazarán únicamente los meses del formulario. Los saldos y políticas se conservan; luego pulsa Guardar y recalcular.</p><p class="budget-help">Importes y precios en ${esc(C.fmt.unit(model))}. Los archivos se leen en este navegador.</p><label class="field">Excel o CSV · hasta 10 MB<input type="file" id="budget-file" accept=".xlsx,.csv"></label><p class="budget-error" id="budget-file-error" role="alert"></p><div id="budget-file-options"></div><div class="budget-actions"><button type="button" class="button button-secondary" id="budget-import-cancel">Cancelar</button></div>`);
    dialog.classList.add('budget-import-dialog');
    const options = dialog.querySelector('#budget-file-options'), error = dialog.querySelector('#budget-file-error');
    let workbook, data, mapping, header = 0, preview = null, generation = 0, closed = false;
    dialog.addEventListener('close', () => { closed = true; generation++; }, { once: true });
    dialog.querySelector('#budget-import-cancel').addEventListener('click', () => dialog.close());
    function invalidate() { preview = null; options.querySelector('#budget-file-preview').innerHTML = ''; options.querySelector('#budget-import-apply').disabled = true; }
    function mapView() {
      mapping = I.suggest(data.rows[header] || []);
      const max = Math.max(0, ...data.rows.map(row => row.length));
      options.querySelector('#budget-file-mapping').innerHTML = `<div class="budget-grid">${Object.entries(I.labels).map(([key, label]) => `<label>${esc(label)}<select class="select" data-column="${key}"><option value="-1">Sin columna · pendiente</option>${Array.from({length:max}, (_, index) => `<option value="${index}"${mapping[key] === index ? ' selected' : ''}>${index + 1} · ${esc(data.rows[header]?.[index] ?? 'Sin encabezado')}</option>`).join('')}</select></label>`).join('')}</div>`;
      invalidate();
    }
    async function selectSheet(name) {
      data = null; invalidate();
      data = T.sheetData(workbook, name, await library()); header = 0;
      options.querySelector('#budget-header-row').value = '1'; mapView();
    }
    dialog.querySelector('#budget-file').addEventListener('change', async event => {
      const file = event.target.files[0], ticket = ++generation; options.innerHTML = ''; error.textContent = ''; preview = null;
      if (!file) return;
      try {
        if (file.size > T.MAX_BYTES) throw new Error('El archivo supera 10 MB.');
        const XLSX = await library(), bytes = new Uint8Array(await file.arrayBuffer());
        if (closed || generation !== ticket) return;
        workbook = T.read(bytes, file.name, XLSX);
        options.innerHTML = `<p><strong>${esc(file.name)}</strong></p><div class="budget-grid"><label>Hoja<select class="select" id="budget-file-sheet">${T.sheets(workbook).map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}</select></label><label>Fila de encabezados<input class="input" type="number" id="budget-header-row" min="1" value="1"></label></div><div id="budget-file-mapping"></div><div class="budget-actions"><button type="button" class="button button-secondary" id="budget-import-review">Revisar importación</button><button type="button" class="button button-primary" id="budget-import-apply" disabled>Usar estos meses</button></div><div class="budget-import-preview" id="budget-file-preview"></div>`;
        options.querySelector('#budget-file-sheet').addEventListener('change', async e => { try { await selectSheet(e.target.value); error.textContent = ''; } catch (err) { error.textContent = err.message; invalidate(); } });
        options.querySelector('#budget-header-row').addEventListener('change', e => {
          header = Number(e.target.value) - 1;
          if (!data || !Number.isInteger(header) || header < 0 || header >= data.rows.length) { error.textContent = 'Fila de encabezados inválida.'; invalidate(); return; }
          error.textContent = ''; mapView();
        });
        options.querySelector('#budget-file-mapping').addEventListener('change', e => { if (e.target.dataset.column) { mapping[e.target.dataset.column] = Number(e.target.value); invalidate(); } });
        options.querySelector('#budget-import-review').addEventListener('click', () => {
          try {
            if (!data) throw new Error('Elige una hoja válida antes de revisar.');
            preview = I.parse(data, mapping, header); error.textContent = '';
            options.querySelector('#budget-file-preview').innerHTML = `<p>${preview.length} meses. Revisa los valores antes de usarlos.</p><table class="data-table"><thead><tr>${Object.values(I.labels).map(v => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${preview.map(row => `<tr>${Object.keys(I.labels).map(k => `<td>${esc(k === 'month' ? row[k] : plain(row[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            options.querySelector('#budget-import-apply').disabled = false;
          } catch (err) { invalidate(); error.textContent = err.message; }
        });
        options.querySelector('#budget-import-apply').addEventListener('click', () => {
          if (!preview) return;
          if (C.store.active().id !== company || JSON.stringify(C.store.active()) !== companySnapshot || JSON.stringify(draft) !== original) { error.textContent = 'Los datos cambiaron mientras revisabas el archivo. Cierra y vuelve a importar.'; return; }
          draft.months = preview; draft.confirmed = false; draft.importSource = { file: file.name, sheet: data.name };
          markDirty(); renderEditor(); renderResults(); dialog.close();
        });
        await selectSheet(workbook.SheetNames[0]);
      } catch (err) { if (!closed && generation === ticket) { error.textContent = err.message; options.innerHTML = ''; } }
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.FinoraCaseBar.mount(document.getElementById('case-bar'));
  C.store.subscribe(() => {
    if (saving) return;
    const current = C.store.active();
    if (model && current.id === model.id && dirty) { notice.textContent = 'La empresa cambió en otra vista. Hay cambios locales sin guardar; recarga antes de guardar.'; return; }
    load();
  });
  load();
})();
