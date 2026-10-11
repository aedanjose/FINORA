(() => {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('[data-personal-filter]'));
  const chooseFilter = tab => {
    tabs.forEach(button => { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.classList.toggle('active', active); button.tabIndex = active ? 0 : -1; });
    let visible = 0;
    document.querySelectorAll('[data-movement]').forEach(row => { row.hidden = tab.dataset.personalFilter !== 'all' && row.dataset.movement !== tab.dataset.personalFilter; if (!row.hidden) visible++; });
    document.querySelector('#personal-movements').setAttribute('aria-labelledby', tab.id);
    document.querySelector('#movements-count').textContent = `Mostrando ${visible} movimientos de ejemplo`;
  };
  tabs.forEach((tab, index) => { tab.addEventListener('click', () => chooseFilter(tab)); tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; chooseFilter(next); next.focus(); }); });
  document.querySelector('#savings-details').addEventListener('click', () => window.Finora.openDialog('Mi fondo de tranquilidad', '<p>Esta meta de ejemplo busca reunir <strong>C$ 60,000</strong> para gastos inesperados.</p><div class="savings-amount">C$ 25,500 <span>acumulados · 42.5%</span></div><div class="progress-track"><div class="progress-bar" style="width:42.5%;background:#55a797"></div></div><p>El aporte ilustrativo del mes es de <strong>C$ 8,500</strong>. Faltan <strong>C$ 34,500</strong> para completar la meta.</p><p class="note">Vista de diseño con datos ficticios. No se han movido fondos ni guardado una meta.</p>'));
  const draft = document.querySelector('#personal-draft');
  document.querySelector('#add-personal-movement').addEventListener('click', () => { draft.hidden = false; draft.scrollIntoView({ behavior: 'smooth', block: 'center' }); draft.querySelector('input').focus({ preventScroll: true }); });
  document.querySelector('#personal-cancel').addEventListener('click', () => { draft.hidden = true; document.querySelector('#add-personal-movement').focus(); });
  document.querySelector('#personal-form').addEventListener('submit', event => { event.preventDefault(); window.Finora.toast('Formulario probado. El movimiento no se guardó: estás viendo el diseño.'); });
})();
