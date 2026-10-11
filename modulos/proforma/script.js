(() => {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('[data-report]'));
  const selectReport = tab => {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.querySelector(`#report-${item.dataset.report}`).hidden = !selected;
    });
    document.querySelector('#paper-title').textContent = tab.dataset.report === 'income' ? 'Estado de resultados proforma' : 'Balance general proforma';
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectReport(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length];
      selectReport(next); next.focus();
    });
  });
  document.querySelector('#report-period').addEventListener('change', event => {
    document.querySelector('.paper-period').textContent = event.target.selectedOptions[0].textContent;
    window.Finora.toast('Periodo actualizado en la vista. Los importes de ejemplo no cambian.');
  });
  document.querySelector('#print-report').addEventListener('click', () => window.print());
})();
