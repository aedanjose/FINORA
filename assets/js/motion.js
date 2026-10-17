/* Mejora visual opcional para los nueve módulos. Sin modificar datos ni fórmulas. */
(() => {
  'use strict';

  function initializeMotion() {
    const main = document.querySelector('.main-content');
    if (!main || typeof Element.prototype.animate !== 'function') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const printMode = window.matchMedia('print');
    const active = new Map();
    let registered = new WeakSet();
    let visited = new WeakSet();
    let scanFrame = 0;

    const surfaceSelector = '.page-heading, .stat-card, .panel, .budget-context, .report-controls, .report-preview, .leverage-insight, .dupont-factor, .dupont-result';
    const barSelector = '.progress-bar, .sensitivity-bar, .comparison-track > span, .budget-bar, .break-even-portion, .safety-portion';
    const verticalSelector = '.waterfall-chart svg > rect';
    const lineSelector = '#cash-chart polyline:not([stroke-dasharray]), .equilibrium-chart svg > line:not([stroke-dasharray])';
    const ringSelector = '.balance-donut, .budget-ring, .vertical-donut';
    const rowSelector = '.data-table tbody > tr, .statement-table tbody > tr';
    const chartSelector = [barSelector, verticalSelector, lineSelector, ringSelector].join(', ');
    const targets = [surfaceSelector, chartSelector, rowSelector].join(', ');
    const canAnimate = () => !reduced.matches && !printMode.matches;
    const isVisible = el => el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden], .hidden');

    function play(el, keyframes, duration = 520, delay = 0) {
      if (!canAnimate() || !isVisible(el)) return;
      active.get(el)?.cancel();
      const animation = el.animate(keyframes, {
        duration, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards'
      });
      active.set(el, animation);
      const release = () => { if (active.get(el) === animation) active.delete(el); };
      animation.finished.then(release, release);
    }

    function reveal(el, delay = 0) {
      if (!canAnimate() || !isVisible(el)) return;
      visited.add(el);
      if (el.matches(lineSelector) && typeof el.getTotalLength === 'function') {
        const length = el.getTotalLength();
        if (length > 0) play(el, [
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
        ], 1000, delay + 100);
      } else if (el.matches(verticalSelector)) {
        el.classList.add('finora-bar-vertical');
        play(el, [{ transform: 'scaleY(.02)', opacity: .5 }, { transform: 'scaleY(1)', opacity: 1 }], 740, delay + 100);
      } else if (el.matches(barSelector)) {
        // Recorte visual: conserva el ancho real y las etiquetas numéricas.
        play(el, [{ clipPath: 'inset(-2px 100% -2px 0)' }, { clipPath: 'inset(-2px -100px -2px 0)' }], 800, delay + 80);
      } else if (el.matches(ringSelector)) {
        // Conserva las rotaciones que ya tienen los gráficos circulares.
        const currentTransform = getComputedStyle(el).transform;
        const base = currentTransform === 'none' ? '' : currentTransform;
        play(el, [{ opacity: .35, transform: `${base} scale(.95)` }, { opacity: 1, transform: `${base} scale(1)` }], 750, delay + 100);
      } else if (el.matches(rowSelector)) {
        play(el, [{ opacity: .5 }, { opacity: 1 }], 260, delay);
      } else {
        play(el, [{ opacity: .4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 420, delay);
      }
    }

    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      let index = 0;
      entries.forEach(entry => {
        if (visited.has(entry.target)) { observer.unobserve(entry.target); return; }
        if (!entry.isIntersecting) return;
        reveal(entry.target, Math.min(index++ * 55, 220));
        observer.unobserve(entry.target);
      });
    }, { threshold: .05 }) : null;

    function scan() {
      scanFrame = 0;
      if (!canAnimate()) return;
      main.querySelectorAll(targets).forEach((el, index) => {
        if (registered.has(el)) return;
        registered.add(el);
        if (observer) observer.observe(el);
        else if (isVisible(el)) reveal(el, Math.min((index % 4) * 55, 165));
      });
    }

    function cancelAnimations() {
      active.forEach(animation => animation.cancel());
      active.clear();
    }

    function replay() {
      cancelAnimations();
      observer?.disconnect();
      registered = new WeakSet();
      visited = new WeakSet();
      scan();
    }

    // Un control visible permite comparar la prueba sin recargar la página.
    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.className = 'icon-button motion-replay';
    replayButton.title = 'Repetir animaciones de este módulo';
    replayButton.setAttribute('aria-label', 'Repetir animaciones de este módulo');
    replayButton.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>';
    replayButton.addEventListener('click', replay);
    document.querySelector('.topbar-actions')?.prepend(replayButton);

    // El código de cada módulo conserva el control de pestañas, filtros y cifras.
    // Esta capa sólo anima los nodos que ese módulo crea o muestra.
    const changes = new MutationObserver(records => {
      if (!canAnimate()) return;
      const changedValues = new Set();
      records.forEach(record => {
        if (record.type === 'attributes' && isVisible(record.target)) {
          const panel = record.target;
          if (panel.matches('[role="tabpanel"], .panel')) {
            play(panel, [{ opacity: .25, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], 320);
            panel.querySelectorAll(chartSelector).forEach((el, i) => reveal(el, Math.min(i * 45, 180)));
          } else if (panel.matches(rowSelector)) {
            reveal(panel);
          }
        }
        if (record.type === 'childList' && record.target instanceof Element) {
          const value = record.target.closest('.stat-value, .leverage-value, .chart-amount, .scenario-result');
          if (value) changedValues.add(value);
        }
      });
      changedValues.forEach(el => play(el, [{ opacity: .4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], 300));
      if (!scanFrame) scanFrame = requestAnimationFrame(scan);
    });
    changes.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });

    function syncPreference() {
      replayButton.hidden = reduced.matches;
      if (reduced.matches) {
        observer?.disconnect();
        cancelAnimations();
        if (scanFrame) { cancelAnimationFrame(scanFrame); scanFrame = 0; }
      } else replay();
    }
    reduced.addEventListener('change', syncPreference);
    window.addEventListener('beforeprint', cancelAnimations);
    syncPreference();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeMotion, { once: true });
  else initializeMotion();
})();
