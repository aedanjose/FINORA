/* Puerta de entrada: se empieza pegando un documento. Los ejemplos de clase quedan como opción secundaria. */
(() => {
  'use strict';
  const C = window.FinoraCasos, P = window.FinoraPaste;
  const { esc } = window.FinoraCaseBar;
  const panel = document.getElementById('start-panel');
  const hideWhileStarting = ['case-bar', 'statement-stats', 'status-strip', 'hoja-contable'].map(id => document.getElementById(id));
  const params = new URLSearchParams(location.search);
  let shownFor = null;

  function render() {
    const returning = C.store.started();
    panel.innerHTML = `
      <p class="eyebrow">Paso 1 de 2</p>
      <h2 class="start-title" id="start-title">Pega tu balance general o estado de resultados</h2>
      <p class="start-lead">Copia la tabla desde Excel, Word o un PDF, con sus años y totales. Finora reconoce las cuentas, los grupos y los totales, propone cómo clasificar cada cuenta y te pide confirmar solo las dudosas.</p>
      <label class="field-label" for="start-source">Documento</label>
      <textarea id="start-source" class="import-source start-source" spellcheck="false" maxlength="200000" placeholder="MUNDO MODA S.A.&#10;BALANCE GENERAL · U$ miles&#10;Cuenta&#9;2018&#9;2019&#10;ACTIVOS CIRCULANTES&#10;Banco&#9;88,342.00&#9;260,975.20&#10;Cliente&#9;87,400.00&#9;52,472.00&#10;…"></textarea>
      <div class="start-controls">
        <label class="start-kind"><span class="field-label">Es un</span><select class="select" id="start-kind"><option value="">Detectar automáticamente</option><option value="balance">Balance general</option><option value="income">Estado de resultados</option></select></label>
        <span class="start-detected" id="start-detected" aria-live="polite"></span>
        <button type="button" class="button button-primary" id="start-review">Revisar documento</button>
      </div>
      <p class="import-error" role="alert" id="start-error"></p>
      <div class="start-alternatives">
        <span>¿Solo quieres explorar? Prueba con un ejemplo de clase:</span>
        ${C.SAMPLE_IDS.map(id => `<button type="button" class="button button-secondary button-small" data-start-sample="${esc(id)}">${esc(C.samples[id]().name)}</button>`).join('')}
        <button type="button" class="mini-button" id="start-blank">o empieza en blanco</button>
        ${returning ? '<button type="button" class="mini-button" id="start-cancel">Volver a la empresa actual</button>' : ''}
      </div>`;
    const source = panel.querySelector('#start-source');
    const detected = panel.querySelector('#start-detected');
    // Mientras se pega o escribe, se anuncia qué entendió Finora del documento.
    source.addEventListener('input', () => {
      const text = source.value;
      if (!text.trim()) { detected.textContent = ''; return; }
      const kind = P.detectKind(text), name = P.detectCompany(text);
      detected.textContent = [kind ? (kind === 'income' ? 'Parece un estado de resultados' : 'Parece un balance general') : 'No reconozco el tipo de estado: elígelo', name ? `de «${name}»` : ''].filter(Boolean).join(' ');
      panel.querySelector('#start-error').textContent = '';
    });
    panel.querySelector('#start-review').addEventListener('click', () => {
      const text = source.value;
      if (!text.trim()) { panel.querySelector('#start-error').textContent = 'Pega primero la tabla del estado financiero.'; source.focus(); return; }
      const kind = panel.querySelector('#start-kind').value || P.detectKind(text) || 'balance';
      const company = C.blankCase(P.detectCompany(text) || 'Mi empresa');
      shownFor = null;
      window.FinoraImport.open({ kind, text, baseline: company });
    });
    panel.querySelectorAll('[data-start-sample]').forEach(button => button.addEventListener('click', () => { C.store.setActive(button.dataset.startSample); close(); }));
    panel.querySelector('#start-blank').addEventListener('click', () => { C.store.create('Nueva empresa'); close(); window.Finora.toast('Empresa en blanco creada. Cambia su nombre en la barra superior.'); });
    panel.querySelector('#start-cancel')?.addEventListener('click', close);
  }

  function show() {
    shownFor = C.store.started() ? C.store.active().id : '__none';
    render();
    panel.hidden = false;
    hideWhileStarting.forEach(el => { if (el) el.hidden = true; });
    panel.querySelector('#start-source').focus();
  }
  function close() {
    panel.hidden = true;
    hideWhileStarting.forEach(el => { if (el) el.hidden = false; });
    if (params.has('nueva')) { params.delete('nueva'); history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash); }
  }
  // Al aplicar la importación la empresa nueva queda activa: se pasa a la hoja contable.
  C.store.subscribe(active => {
    if (panel.hidden || !C.store.started()) return;
    if (shownFor === null || active.id !== shownFor) close();
  });

  window.FinoraStart = { show, close };
  if (!C.store.started() || params.has('nueva')) show();
})();
