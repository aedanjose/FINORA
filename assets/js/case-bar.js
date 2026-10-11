/* Barra de empresa compartida: elegir, crear, restaurar y renombrar el caso activo. */
(() => {
  'use strict';
  const C = window.FinoraCasos;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function mount(container, { editable = false } = {}) {
    const { openDialog, toast, hydrateIcons } = window.Finora;
    function render() {
      const c = C.store.active(), list = C.store.list();
      const options = list.map(item => `<option value="${esc(item.id)}"${item.id === c.id ? ' selected' : ''}>${esc(item.name)}${item.sample ? ' · ejemplo' : ''}</option>`).join('');
      container.innerHTML = `
        <div class="case-bar-main">
          <label class="case-field case-select-field"><span class="field-label">Empresa</span>
            <select class="select" id="case-select" aria-label="Empresa analizada">${options}<option value="__new">＋ Nueva empresa…</option></select></label>
          <div class="case-meta"><span><i data-icon="calendar"></i>${esc(c.periods.previous)} → ${esc(c.periods.current)}</span><span class="case-unit">Cifras en ${esc(C.fmt.unit(c)) || 'unidades'}</span></div>
          <div class="case-actions">
            ${c.sample ? '<button class="button button-secondary button-small" type="button" id="case-reset"><i data-icon="arrow-left"></i>Restaurar ejemplo</button>' : ''}
            ${editable && !c.sample ? '<button class="button button-ghost button-small" type="button" id="case-delete"><i data-icon="close"></i>Eliminar empresa</button>' : ''}
          </div>
        </div>
        ${editable ? `<div class="case-details">
          <label class="case-field"><span class="field-label">Nombre</span><input class="input" data-case="name" value="${esc(c.name)}" maxlength="80"></label>
          <label class="case-field case-short"><span class="field-label">Moneda</span><input class="input" data-case="currency" value="${esc(c.currency)}" maxlength="6"></label>
          <label class="case-field case-short"><span class="field-label">Escala</span><input class="input" data-case="scale" value="${esc(c.scale)}" maxlength="20" placeholder="miles, millones…"></label>
          <label class="case-field case-short"><span class="field-label">Período anterior</span><input class="input" data-case="periods.previous" value="${esc(c.periods.previous)}" maxlength="20"></label>
          <label class="case-field case-short"><span class="field-label">Período actual</span><input class="input" data-case="periods.current" value="${esc(c.periods.current)}" maxlength="20"></label>
        </div>` : ''}`;
      hydrateIcons(container);
      container.querySelector('#case-select').addEventListener('change', event => {
        if (event.target.value !== '__new') { C.store.setActive(event.target.value); return; }
        event.target.value = c.id;
        // Una empresa nueva empieza por su documento: en Estados financieros se abre la puerta de entrada.
        if (window.FinoraStart) { window.FinoraStart.show(); return; }
        if (document.body.dataset.base !== undefined) { location.href = `${document.body.dataset.base}modulos/estados-financieros/index.html?nueva=1`; return; }
        const modal = openDialog('Nueva empresa', '<form id="new-case-form"><label class="field"><span class="field-label">Nombre de la empresa</span><input class="input" name="name" required maxlength="80" placeholder="Ej. Comercial El Roble"></label><p class="note">Se crea con el catálogo básico de cuentas en blanco. Podrás renombrar, agregar o quitar cuentas.</p><button class="button button-primary" type="submit">Crear empresa</button></form>');
        const form = modal.querySelector('form');
        form.querySelector('input').focus();
        form.addEventListener('submit', submit => { submit.preventDefault(); C.store.create(form.name.value.trim() || 'Nueva empresa'); modal.close(); toast('Empresa creada. Captura sus cuentas en los dos períodos.'); });
      });
      container.querySelector('#case-reset')?.addEventListener('click', () => {
        const modal = openDialog('Restaurar el ejemplo', `<p>Se perderán los cambios que hiciste en <strong>${esc(c.name)}</strong> y volverán las cifras originales del ejercicio.</p><button class="button button-primary" type="button" id="confirm-reset">Restaurar</button>`);
        modal.querySelector('#confirm-reset').addEventListener('click', () => { C.store.resetSample(c.id); modal.close(); toast('Ejemplo restaurado.'); });
      });
      container.querySelector('#case-delete')?.addEventListener('click', () => {
        const modal = openDialog('Eliminar empresa', `<p>Se eliminará <strong>${esc(c.name)}</strong> con todas sus cuentas de este navegador. No se puede deshacer.</p><button class="button button-primary" type="button" id="confirm-delete">Eliminar</button>`);
        modal.querySelector('#confirm-delete').addEventListener('click', () => { C.store.remove(c.id); modal.close(); toast('Empresa eliminada.'); });
      });
      container.querySelectorAll('[data-case]').forEach(input => input.addEventListener('change', () => {
        const current = C.store.active(); const path = input.dataset.case.split('.');
        const value = input.value.trim();
        if (path[0] === 'name' && !value) { input.value = current.name; return; }
        if (path.length === 2) current[path[0]][path[1]] = value || (path[1] === 'previous' ? 'Anterior' : 'Actual'); else current[path[0]] = value;
        C.store.save(current);
      }));
    }
    // Solo se vuelve a dibujar si cambia algo que la barra muestra (no en cada importe capturado).
    let signature = '';
    const refresh = () => {
      const c = C.store.active();
      const next = JSON.stringify([C.store.list(), c.id, c.name, c.currency, c.scale, c.periods]);
      if (next !== signature) { signature = next; render(); }
    };
    refresh();
    C.store.subscribe(refresh);
  }
  window.FinoraCaseBar = { mount, esc };
})();
