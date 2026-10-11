/* Preferencia visual compartida; no almacena información financiera. */
(() => {
  'use strict';

  const storageKey = 'finora:presentation:v1';
  const root = document.documentElement;
  let enabled = true;
  let toggle;

  try {
    enabled = localStorage.getItem(storageKey) !== 'off';
  } catch (_) {
    // El modo sigue disponible cuando el navegador bloquea el almacenamiento.
  }

  function applyPreference(nextEnabled) {
    enabled = nextEnabled;
    root.dataset.presentation = enabled ? 'on' : 'off';
    if (toggle) {
      const action = enabled ? 'Desactivar modo exposición' : 'Activar modo exposición';
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.title = action;
    }
  }

  // Se ejecuta antes de las hojas de estilo para evitar un destello de fondo blanco.
  applyPreference(enabled);

  function initializeControl() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || actions.querySelector('.presentation-toggle')) return;

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'presentation-toggle';
    toggle.setAttribute('aria-label', 'Modo exposición');
    toggle.innerHTML = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5M7 12l3-3 3 2 4-5"/></svg><span>Exposición</span>';
    toggle.addEventListener('click', () => {
      applyPreference(!enabled);
      try {
        localStorage.setItem(storageKey, enabled ? 'on' : 'off');
      } catch (_) {
        // Cambia la apariencia aunque la preferencia no se pueda conservar.
      }
    });
    actions.prepend(toggle);
    applyPreference(enabled);
  }

  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    applyPreference(event.key === storageKey ? event.newValue !== 'off' : true);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeControl, { once: true });
  } else {
    initializeControl();
  }
})();
