/* Sólo controla la bienvenida; no almacena ni modifica datos financieros. */
(() => {
  'use strict';
  const destination = new URL('../estados-financieros/index.html', window.location.href).href;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const replayButton = document.getElementById('replay-intro');
  const motionNote = document.getElementById('motion-note');

  // Inicio siempre muestra la bienvenida, aunque se haya visitado antes.
  // Los enlaces entre módulos siguen siendo directos y no pasan por esta pantalla.

  function updateMotionPreference() {
    motionNote.hidden = !reducedMotion.matches;
    replayButton.hidden = reducedMotion.matches;
    if (reducedMotion.matches) document.body.classList.remove('is-playing');
  }

  replayButton.addEventListener('click', () => {
    if (reducedMotion.matches) return;
    document.body.classList.remove('is-playing');
    // Reinicia la secuencia CSS sin recargar ni cambiar la posición del foco.
    void document.body.offsetWidth;
    document.body.classList.add('is-playing');
  });

  document.querySelectorAll('[data-enter]').forEach(link => {
    link.addEventListener('click', event => {
      // Conserva abrir en otra pestaña y los enlaces nativos si JS no está disponible.
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.location.replace(destination);
    });
  });

  reducedMotion.addEventListener('change', updateMotionPreference);
  updateMotionPreference();
})();
