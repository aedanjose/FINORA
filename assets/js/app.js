/* Shell compartido. Sin dependencias, compatible con apertura directa de HTML. */
(() => {
  'use strict';
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
    wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-5v5h5"/><path d="M17 14.5h.01"/>',
    trend: '<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
    scale: '<path d="M12 3v18M6 21h12M4 6h16M6 6l-4 8h8L6 6Zm12 0-4 8h8l-4-8Z"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
    bank: '<path d="m3 8 9-5 9 5H3ZM4 21h16M6 11v6m6-6v6m6-6v6"/>',
    box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    file: '<path d="M14 2H5v20h14V7l-5-5ZM14 2v5h5M8 12h8M8 16h8"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    'arrow-down-right': '<path d="m7 7 10 10M7 17h10V7"/>',
    'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 2.5M12 17v.01"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    settings: '<path d="m10 3-.7 3-2.7 1-2.6-1-2 3 2 2v3l-2 2 2 3 2.6-1 2.7 1 .7 3h4l.7-3 2.7-1 2.6 1 2-3-2-2v-3l2-2-2-3-2.6 1-2.7-1L14 3Z"/><circle cx="12" cy="12.5" r="3"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
  const modules = [
    { id: 'dashboard', label: 'Resumen general', icon: 'home' },
    { id: 'estados-financieros', label: 'Estados financieros', icon: 'grid' },
    { id: 'analisis-financiero', label: 'Análisis financiero', icon: 'chart' },
    { id: 'punto-equilibrio', label: 'Punto de equilibrio y C-V-U', icon: 'trend' },
    { id: 'apalancamiento', label: 'Apalancamiento', icon: 'layers' },
    { id: 'flujo-efectivo', label: 'Flujo de efectivo', icon: 'wallet' },
    { id: 'planeacion-presupuestos', label: 'Planeación y presupuestos', icon: 'calendar' },
    { id: 'proforma', label: 'Proforma / reporte integrado', icon: 'file' },
    { id: 'presupuesto-personal', label: 'Presupuesto personal', icon: 'user' },
    { id: 'inventario', label: 'Control básico de inventario', icon: 'box' }
  ];
  const base = document.body.dataset.base || './';
  const current = modules.find(item => item.id === document.body.dataset.page) || modules[0];
  const moduleLink = item => `${base}modulos/${item.id}/index.html`;
  const navItem = item => `<a class="nav-item${item.id === current.id ? ' active' : ''}" href="${moduleLink(item)}"${item.id === current.id ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span>${item.id === current.id ? '<span class="nav-active-dot"></span>' : ''}</a>`;
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `<a class="brand" href="${base}index.html" aria-label="Finora, inicio"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V5h14M5 12h10" stroke="white" stroke-width="2.8" stroke-linecap="round"/><path d="m14 19 5-5" stroke="#94BCFF" stroke-width="2.8" stroke-linecap="round"/></svg></span><span class="brand-name">finora<span class="brand-dot">.</span></span></a><div class="brand-caption">CLARIDAD PARA DECIDIR</div><div class="nav-label">Gestión financiera</div><nav class="nav-list" aria-label="Módulos financieros">${modules.slice(0, 8).map(navItem).join('')}</nav><div class="nav-divider"></div><div class="nav-label">Complementarios</div><nav class="nav-list" aria-label="Módulos complementarios">${modules.slice(8).map(navItem).join('')}</nav><div class="sidebar-bottom"><div class="workspace-card"><div class="workspace-card-title">${icon('spark')}Tu espacio de aprendizaje</div><p>De los datos a las decisiones,<br>un módulo a la vez.</p><button type="button" id="about-project">Conocer el proyecto ${icon('arrow-right')}</button></div><div class="sidebar-profile"><span class="avatar">M</span><div><div class="profile-name">Martina</div><div class="profile-role">Perfil de demostración</div></div><button class="profile-more" type="button" id="profile-info" aria-label="Información del perfil">${icon('more')}</button></div></div>`;
  document.getElementById('topbar').innerHTML = `<button class="icon-button menu-toggle" type="button" aria-label="Abrir menú de navegación" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-root">Mi espacio</span><span class="breadcrumb-root">${icon('chevron-right')}</span><span class="breadcrumb-current">${current.short || current.label}</span></div><div class="topbar-actions"><button class="global-search" type="button" id="open-search" aria-label="Buscar módulo">${icon('search')}<span>Buscar un módulo...</span><kbd>Ctrl K</kbd></button><span class="topbar-separator"></span><button class="icon-button notification-button" type="button" id="project-status" aria-label="Estado del proyecto">${icon('bell')}</button><button class="avatar top-avatar" type="button" id="top-profile" aria-label="Perfil de demostración Martina">M</button></div>`;
  const hydrateIcons = (parent = document) => parent.querySelectorAll('[data-icon]').forEach(item => { item.innerHTML = icon(item.dataset.icon); item.setAttribute('aria-hidden', 'true'); });
  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = message;
    el.classList.add('visible');
    toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
  }
  let returnFocus;
  const dialog = document.createElement('dialog');
  dialog.className = 'detail-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  document.body.append(dialog);
  function openDialog(title, html) {
    returnFocus = document.activeElement;
    dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title"></h2><button type="button" class="icon-button" aria-label="Cerrar ventana">${icon('close')}</button></div><div class="dialog-content">${html}</div>`;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('.dialog-header button').addEventListener('click', () => dialog.close());
    hydrateIcons(dialog);
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => returnFocus?.focus());
  const profile = () => openDialog('Un perfil para explorar', '<p><strong>Martina</strong> es el perfil ficticio que acompaña al diseño original de Finora.</p><p class="note">Esta primera etapa es un prototipo visual. La autenticación, las cuentas y la conservación de datos se incorporarán en etapas posteriores.</p>');
  document.getElementById('profile-info').addEventListener('click', profile);
  document.getElementById('top-profile').addEventListener('click', profile);
  document.getElementById('about-project').addEventListener('click', () => openDialog('Sistema de Análisis y Planeación Financiera', `<p>Un espacio académico para comprender las finanzas y planear con claridad.</p><p>El diseño está organizado en <strong>un dashboard y nueve módulos con archivos separados</strong>: cada uno tiene su propio HTML, CSS y JavaScript.</p><p>Los <strong>siete módulos empresariales compartirán los datos de la empresa, el período y el escenario</strong>, y actualizarán las cuentas y los resultados relacionados. Los dos módulos complementarios tendrán sus datos aparte.</p><div class="note"><strong>Etapa 02 · Datos conectados.</strong><br>El dashboard resume los datos compartidos de la empresa y los años seleccionados. Las pantallas pendientes de integración indican que utilizan ejemplos de diseño. Los datos se guardan en este navegador.</div><p><a class="button button-secondary" href="${base}modulos/bienvenida/index.html?replay=1">${icon('spark')}Volver a ver la bienvenida</a></p>`));
  document.getElementById('project-status').addEventListener('click', () => openDialog('Estado de Finora', '<p><span class="badge badge-blue">Etapa 02 · Datos conectados</span></p><p>El resumen general presenta los estados importados, los indicadores y los escenarios de la empresa seleccionada.</p><p class="note">Las proyecciones dependen de los supuestos que indiques. Los datos se conservan en este navegador; los módulos pendientes de integración muestran sus ejemplos de diseño.</p>'));
  function openSearch() {
    const modal = openDialog('Encuentra tu módulo', '<label class="field-label" for="module-search">Nombre del módulo</label><input id="module-search" class="input" type="search" placeholder="Por ejemplo, inventario" autocomplete="off"><div class="search-results" id="search-results"></div>');
    const input = modal.querySelector('input');
    const results = modal.querySelector('.search-results');
    const normalize = value => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const render = () => { const matching = modules.filter(item => normalize(item.label).includes(normalize(input.value))); results.innerHTML = matching.length ? matching.map(item => `<a class="search-result" href="${moduleLink(item)}">${icon(item.icon)}${item.label}</a>`).join('') : '<p class="note">No encontramos ese módulo. Prueba con otra palabra.</p>'; };
    input.addEventListener('input', render);
    render();
    input.focus();
  }
  document.getElementById('open-search').addEventListener('click', openSearch);
  const menuButton = document.querySelector('.menu-toggle');
  function setMenu(open) {
    document.body.classList.toggle('sidebar-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    if (matchMedia('(max-width: 760px)').matches) sidebar.inert = !open;
    if (open) sidebar.querySelector('[aria-current="page"]').focus();
  }
  menuButton.addEventListener('click', () => setMenu(!document.body.classList.contains('sidebar-open')));
  document.querySelector('[data-close-menu]')?.addEventListener('click', () => { setMenu(false); menuButton.focus(); });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) { setMenu(false); menuButton.focus(); }
    if (event.key === 'Tab' && document.body.classList.contains('sidebar-open') && !dialog.open) {
      const focusable = Array.from(sidebar.querySelectorAll('a,button'));
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  const mobileQuery = matchMedia('(max-width: 760px)');
  const syncSidebar = () => { sidebar.inert = mobileQuery.matches && !document.body.classList.contains('sidebar-open'); if (!mobileQuery.matches) setMenu(false); };
  mobileQuery.addEventListener('change', syncSidebar);
  syncSidebar();
  hydrateIcons();
  window.Finora = Object.freeze({ icon, toast, openDialog, hydrateIcons });
})();
