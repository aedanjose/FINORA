/* Revisión local de tablas: el caso sólo cambia después de Aplicar. */
(() => {
  'use strict';
  const C = window.FinoraCasos;
  const P = window.FinoraPaste;
  const { esc } = window.FinoraCaseBar;
  const SIDES = ['previous', 'current'];
  const roles = { cash: 'Efectivo', receivables: 'Cuentas por cobrar', inventory: 'Inventarios', fixed: 'Activo fijo', payables: 'Cuentas por pagar', longDebt: 'Deuda a largo plazo' };
  const categories = { sales: 'Ventas', costSales: 'Costo de ventas', opex: 'Gastos operativos', otherIncome: 'Otros ingresos', interest: 'Gastos financieros', taxes: 'Impuestos', taxRate: 'Tasa de impuestos (fracción)', preferred: 'Dividendos preferentes', creditSales: 'Ventas a crédito', creditPurchases: 'Compras a crédito', fixedCosts: 'Costos fijos operativos', fixedCostSales: 'Costos fijos de ventas', shares: 'Número de acciones' };
  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 6 }) : typeof value === 'string' ? value : '';
  const option = (value, label, chosen) => `<option value="${esc(value)}"${String(chosen) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
  const blockOf = row => C.BLOCKS.findIndex(b => b.section === row.section && (b.section === 'equity' || b.term === row.term));

  function open(options = {}) {
    const kind = options.kind === 'income' ? 'income' : 'balance';
    const mode = options.mode === 'append' ? 'append' : 'replace';
    // Con options.baseline la empresa todavía no existe: se crea solo al aplicar (cancelar no deja empresas vacías).
    const fresh = !!options.baseline;
    const baseline = fresh ? options.baseline : C.store.active();
    const snapshot = JSON.stringify(baseline);
    const label = kind === 'balance' ? 'balance general' : 'estado de resultados';
    let source = options.text || '', draft = null;
    const modal = window.Finora.openDialog(fresh ? 'Nueva empresa desde un documento' : 'Pegar desde Excel', '<div id="import-workspace"></div>');
    modal.classList.add('import-dialog');
    const workspace = modal.querySelector('#import-workspace');
    const abort = new AbortController();
    modal.addEventListener('close', () => { abort.abort(); modal.classList.remove('import-dialog'); }, { once: true });
    const isStale = () => !fresh && JSON.stringify(C.store.active()) !== snapshot;

    function sourceView(message = '') {
      draft = null;
      workspace.innerHTML = `<p class="import-kicker">01 · Pegar tabla</p><p>Copia las cuentas y las dos columnas de años de Excel y pégalas aquí. Puedes incluir encabezados, grupos y totales.</p>
        <div class="import-destination"><strong>${esc(baseline.name)}</strong><span>${esc(label)} · ${mode === 'append' ? 'Agregar cuentas' : 'Reemplazar este estado'}</span></div>
        <label class="field-label" for="import-source">Tabla copiada de Excel</label><textarea id="import-source" class="import-source" spellcheck="false" maxlength="200000" placeholder="Cuenta&#9;${esc(baseline.periods.previous)}&#9;${esc(baseline.periods.current)}&#10;Efectivo y bancos&#9;10,000&#9;12,500">${esc(source)}</textarea>
        <p class="import-help">Ctrl + V para pegar. No se guarda nada hasta que revises y apliques. Funciona sin internet.</p>
        <p class="import-error" role="alert" id="import-source-error">${esc(message)}</p>
        <div class="import-actions"><button type="button" class="button button-secondary" data-import-action="cancel">Cancelar</button><button type="button" class="button button-primary" data-import-action="analyze">Revisar tabla</button></div>`;
      workspace.querySelector('#import-source').focus();
    }

    function classify(row) {
      const name = esc(row.name || 'Cuenta');
      const classification = kind === 'balance'
        ? `<label>Sección<select data-edit="block" aria-label="Sección de ${name}">${option('', 'Elegir sección', blockOf(row))}${C.BLOCKS.map((b, i) => option(i, b.group, blockOf(row))).join('')}</select></label><label>Grupo<input data-edit="group" value="${esc(row.group || (C.BLOCKS[blockOf(row)]?.group || ''))}" aria-label="Grupo de ${name}"></label><label>Uso en razones<select data-edit="role" aria-label="Uso de ${name}">${option('', 'Sin uso específico', row.role || '')}${Object.entries(roles).map(([key, text]) => option(key, text, row.role)).join('')}</select></label>`
        : `<label>Categoría<select data-edit="category" aria-label="Categoría de ${name}">${option('', 'Elegir categoría', row.category)}${Object.entries(categories).map(([key, text]) => option(key, text, row.category)).join('')}</select></label>`;
      return `<details class="import-classification"><summary>Clasificación y efecto</summary><div class="import-row-fields">${classification}<label>Efecto<select data-edit="sign" aria-label="Efecto de ${name}">${option(1, 'Suma', row.sign ?? 1)}${option(-1, 'Resta', row.sign ?? 1)}</select></label></div></details>`;
    }

    // El documento declara otra moneda o escala: se ofrece actualizar la empresa (las cifras no se multiplican).
    const unitsDiffer = () => draft?.units && ((draft.units.currency && draft.units.currency !== baseline.currency) || (draft.units.scale && draft.units.scale !== baseline.scale));
    const unitText = units => `${units.currency || baseline.currency || ''}${(units.scale ?? baseline.scale) ? ` ${units.scale ?? baseline.scale}` : ''}`.trim();
    function unitsChoice() {
      if (!unitsDiffer()) return '';
      return `<label class="import-units"><input type="checkbox" data-import-units${draft.applyUnits ? ' checked' : ''}><span>El documento está en <strong>${esc(unitText(draft.units))}</strong>; la empresa usa <strong>${esc(C.fmt.unit(baseline) || 'sin unidad')}</strong>. Actualizar la empresa a ${esc(unitText(draft.units))}.</span></label>`;
    }

    function reviewView() {
      workspace.innerHTML = `<p class="import-kicker">02 · Revisar antes de aplicar</p><div class="import-destination"><strong>${esc(baseline.name)}</strong><span>${esc(label)} · ${mode === 'append' ? 'Agregar cuentas' : 'Reemplazar este estado'}</span></div>
        <div class="import-periods">${SIDES.map((side, i) => `<label class="field-label" for="import-${side}">${i ? 'Año actual' : 'Año anterior'}<input class="input" id="import-${side}" data-import-period="${side}" inputmode="numeric" maxlength="4" value="${esc(draft.periods[side])}"></label>`).join('')}<p>Revisa a qué año corresponde cada columna. Los valores se muestran en el orden anterior → actual.</p></div>${unitsChoice()}
        <p id="import-summary" class="import-summary" aria-live="polite"></p>
        <div class="import-table-scroll"><table class="import-table"><thead><tr><th scope="col">Incluir</th><th scope="col">Cuenta y clasificación</th><th scope="col" data-import-heading="previous"></th><th scope="col" data-import-heading="current"></th></tr></thead><tbody>${draft.rows.map(row => `<tr data-import-row="${esc(row.id)}"><td><input type="checkbox" data-edit="include"${row.include !== false ? ' checked' : ''} aria-label="Incluir ${esc(row.name)}"></td><td><input class="import-account-name" data-edit="name" value="${esc(row.name)}" aria-label="Nombre de la cuenta"><div class="import-row-tags">${row.sign === -1 ? '<span>Resta</span>' : ''}${row.role ? `<span>${esc(roles[row.role] || row.role)}</span>` : ''}${row.needsReview ? '<span class="import-review-tag">Revisar clasificación</span>' : ''}</div>${classify(row)}${row.needsReview ? `<label class="import-confirm"><input type="checkbox" data-edit="confirmed"${row.confirmed ? ' checked' : ''}>Revisé la clasificación de esta cuenta</label>` : ''}<p class="import-row-error" data-row-errors="${esc(row.id)}"></p></td>${SIDES.map(side => `<td><input class="import-number" data-edit="amount" data-import-side="${side}" inputmode="decimal" autocomplete="off" value="${esc(number(row.amounts?.[side]))}" aria-label="${esc(row.name)}, ${esc(draft.periods[side])}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <details class="import-checks"><summary>Totales del documento y comprobaciones <span id="import-check-count"></span></summary><div id="import-check-list"></div></details>
        ${draft.notes?.length ? `<details class="import-notes"><summary>Notas del lector (${draft.notes.length})</summary><ul>${draft.notes.map(note => `<li>${esc(typeof note === 'string' ? note : note.message || String(note))}</li>`).join('')}</ul></details>` : ''}
        <div id="import-errors" role="alert"></div><p class="import-apply-note">${mode === 'append' ? 'Se agregarán las cuentas incluidas al estado actual.' : `Al aplicar, se reemplazarán las cuentas del ${label} de esta empresa.`} El otro estado y los datos de la empresa se conservan.</p>
        <div class="import-actions"><button type="button" class="button button-secondary" data-import-action="back">Volver al texto</button><button type="button" class="button button-secondary" data-import-action="cancel">Cancelar</button><button type="button" class="button button-primary" data-import-action="apply">${mode === 'append' ? 'Agregar cuentas revisadas' : 'Aplicar cuentas revisadas'}</button></div>`;
      refresh();
      workspace.querySelector('[data-import-period]').focus();
    }

    function refresh() {
      if (!draft) return;
      const validation = P.validate(draft, baseline);
      const errors = [...validation.errors];
      if (isStale()) errors.push({ code: 'stale', message: 'La empresa cambió mientras revisabas. Cierra esta ventana y vuelve a pegar para trabajar con los datos actuales.' });
      workspace.querySelectorAll('[data-import-heading]').forEach(el => { el.textContent = draft.periods[el.dataset.importHeading]; });
      workspace.querySelectorAll('[data-import-row]').forEach(tr => {
        const row = draft.rows.find(item => item.id === tr.dataset.importRow);
        tr.classList.toggle('import-excluded', row.include === false);
        const rowErrors = errors.filter(item => item.rowId === row.id);
        tr.querySelector('[data-row-errors]').textContent = rowErrors.map(item => item.message).join(' · ') || (row.include !== false && row.needsReview && !row.confirmed ? (row.issues || []).join(' · ') : '');
        tr.querySelectorAll('input[data-edit="amount"]').forEach(input => {
          const value = row.amounts[input.dataset.importSide];
          input.setAttribute('aria-invalid', String(row.include !== false && value !== null && !Number.isFinite(value)));
        });
      });
      const included = draft.rows.filter(row => row.include !== false).length;
      workspace.querySelector('#import-summary').textContent = `${included} cuentas incluidas · ${draft.totals?.length || 0} totales detectados${errors.length ? ` · ${errors.length} pendientes de revisión` : ' · Listo para aplicar'}`;
      const globalErrors = errors.filter(item => !item.rowId);
      workspace.querySelector('#import-errors').innerHTML = globalErrors.map(item => `<p class="import-error">${esc(item.message)}</p>`).join('') + (validation.warnings || []).map(item => `<p class="import-help">${esc(typeof item === 'string' ? item : item.message)}</p>`).join('');
      workspace.querySelector('[data-import-action="apply"]').disabled = !included || errors.length > 0;
      const checks = (validation.totals || []).flatMap(total => SIDES.filter(side => Number.isFinite(total.amounts?.[side])).map(side => ({
        name: total.name, period: draft.periods[side], reported: total.amounts[side], calculated: total.calculated?.[side], difference: total.difference?.[side],
        ok: Number.isFinite(total.difference?.[side]) ? Math.abs(total.difference[side]) <= .01 : null
      })));
      const checkBox = workspace.querySelector('#import-check-list');
      workspace.querySelector('#import-check-count').textContent = checks.length ? `(${checks.filter(item => item.ok === true).length}/${checks.length} coinciden)` : '';
      if (checks.length) checkBox.innerHTML = `<div class="import-table-scroll"><table class="import-table import-totals"><thead><tr><th>Total</th><th>Año</th><th>Documento</th><th>Calculado</th><th>Revisión</th></tr></thead><tbody>${checks.map(item => `<tr><td>${esc(item.name)}</td><td>${esc(item.period)}</td><td>${esc(number(item.reported))}</td><td>${esc(number(item.calculated))}</td><td class="${item.ok === true ? 'import-match' : 'import-error'}">${item.ok === true ? 'Coincide' : item.ok === false ? `Diferencia ${esc(number(item.difference))}` : 'Sin datos'}</td></tr>`).join('')}</tbody></table></div>`;
      else checkBox.innerHTML = `<p class="import-help">${mode === 'append' ? 'Los totales del texto pegado son parciales: se conservan las comprobaciones que ya tenía la empresa.' : draft.totals?.length ? 'Termina de revisar las cuentas para comparar estos totales con la suma.' : 'No se detectaron totales del documento. Finora calculará los totales de las cuentas incluidas.'}</p>${draft.totals?.length ? `<ul>${draft.totals.map(t => `<li>${esc(t.name || t.label || t.key)}: ${SIDES.map(side => esc(number(t.amounts?.[side])) || '—').join(' / ')}</li>`).join('')}</ul>` : ''}`;
    }

    function analyze() {
      const textarea = workspace.querySelector('#import-source');
      if (textarea) source = textarea.value;
      if (!source.trim()) { sourceView('Pega al menos una cuenta con sus importes.'); return; }
      try {
        draft = P.analyze(source, { kind, periods: baseline.periods, mode, context: options.context });
        if (!draft.rows.length) { sourceView('No se encontraron cuentas. Incluye los nombres y las columnas de importes.'); return; }
        draft.applyUnits = !!unitsDiffer();
        reviewView();
      } catch (error) { sourceView(error.message || 'No se pudo leer la tabla. Revisa el texto.'); }
    }

    workspace.addEventListener('input', event => {
      const input = event.target;
      if (!draft) return;
      if (input.dataset.importPeriod) {
        draft.periods[input.dataset.importPeriod] = input.value.trim(); refresh(); return;
      }
      if (!input.dataset.edit || input.tagName === 'SELECT' || input.type === 'checkbox') return;
      const row = draft.rows.find(item => item.id === input.closest('[data-import-row]')?.dataset.importRow);
      if (!row) return;
      if (input.dataset.edit === 'amount') row.amounts[input.dataset.importSide] = P.parseAmount(input.value);
      else row[input.dataset.edit] = input.value;
      refresh();
    }, { signal: abort.signal });

    workspace.addEventListener('change', event => {
      const input = event.target;
      if (draft && input.dataset.importUnits !== undefined) { draft.applyUnits = input.checked; return; }
      if (!draft || !input.dataset.edit) return;
      const row = draft.rows.find(item => item.id === input.closest('[data-import-row]')?.dataset.importRow);
      if (!row) return;
      const key = input.dataset.edit;
      if (key === 'include' || key === 'confirmed') row[key] = input.checked;
      else if (key === 'block') {
        const block = input.value === '' ? null : C.BLOCKS[Number(input.value)];
        row.section = block?.section || null; row.term = block?.term ?? null; row.group = block?.group || ''; row.role = null;
        input.closest('[data-import-row]').querySelector('[data-edit="group"]').value = row.group;
        input.closest('[data-import-row]').querySelector('[data-edit="role"]').value = '';
      } else if (key === 'sign') row.sign = Number(input.value);
      else if (key === 'role' || key === 'category') row[key] = input.value || null;
      refresh();
    }, { signal: abort.signal });

    workspace.addEventListener('click', event => {
      const action = event.target.closest('[data-import-action]')?.dataset.importAction;
      if (!action) return;
      if (action === 'cancel') modal.close();
      if (action === 'back') sourceView();
      if (action === 'analyze') analyze();
      if (action === 'apply') {
        if (isStale()) { refresh(); return; }
        try {
          const next = P.buildCase(baseline, draft);
          const saved = fresh ? C.store.add(next) : C.store.save(next);
          const count = draft.rows.filter(row => row.include !== false).length;
          modal.close();
          window.Finora.toast(`${count} cuentas ${mode === 'append' ? 'agregadas' : 'importadas'}.${saved ? ' Guardado en este navegador.' : ' No se pudo conservar el guardado al cerrar el navegador.'}`);
        } catch (error) {
          workspace.querySelector('#import-errors').textContent = error.message;
          workspace.querySelector('#import-errors').focus();
        }
      }
    }, { signal: abort.signal });
    sourceView();
    if (source) analyze();
  }

  window.FinoraImport = { open };
  document.getElementById('paste-excel').addEventListener('click', () => {
    const kind = document.querySelector('[data-statement][aria-selected="true"]')?.dataset.statement || 'balance';
    open({ kind });
  });
})();

