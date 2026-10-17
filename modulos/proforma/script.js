'use strict';
(() => {
  const C = window.FinoraCasos, B = window.FinoraBudget, { esc } = window.FinoraCaseBar;
  const tabs = Array.from(document.querySelectorAll('[data-report]'));
  function selectReport(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected); item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.querySelector(`#report-${item.dataset.report}`).hidden = !selected;
    });
    document.getElementById('paper-title').textContent = tab.dataset.report === 'income' ? 'Estado de resultados proforma' : 'Balance general proforma';
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectReport(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length];
      selectReport(next); next.focus();
    });
  });
  function render() {
    const c = C.store.active(), r = B.analyze(c), t = r.totals, b = r.closing;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const money = value => Number.isFinite(value) ? C.fmt.money(value, c) : '—';
    const row = (label, value, total = false) => `<tr${total ? ' class="statement-subtotal"' : ''}><th scope="row">${esc(label)}</th><td class="table-number">${esc(money(value))}</td></tr>`;
    const group = title => `<tr class="statement-group"><th colspan="2" scope="colgroup">${esc(title)}</th></tr>`;
    const period = r.rows[0]?.month && r.rows.at(-1)?.month ? `${r.rows[0].month} a ${r.rows.at(-1).month}` : 'Período pendiente de definir';
    const state = !r.ready ? 'INCOMPLETO' : r.warnings.length ? 'REVISAR CAJA' : 'PROYECCIÓN PRESUPUESTADA';
    set('paper-company', c.name.toUpperCase()); set('paper-period', period);
    set('paper-currency', `Cifras en ${C.fmt.unit(c)}`); set('summary-currency', C.fmt.unit(c));
    set('budget-period-summary', period); set('paper-badge-status', `${c.sample ? 'EJEMPLO · ' : ''}${state}`);
    set('proforma-data-source', c.sample ? 'Caso de ejemplo' : r.ready ? 'Presupuesto conectado' : 'Faltan datos');
    set('proforma-data-desc', r.ready ? `Resultados del presupuesto guardado de ${c.name}.` : 'Completa y guarda los datos en Planeación y presupuestos. No se sustituyen faltantes por cifras de ejemplo.');
    set('summary-months', String(r.rows.filter(row => B.nextMonth(row.month)).length));
    set('summary-cost-ratio', 'Promedio ponderado');
    set('proforma-footnote', 'Ventas, compras, gastos y caja comparten el presupuesto mensual. El balance conserva los demás saldos según los supuestos confirmados.');
    document.getElementById('income-proforma-body').innerHTML = group('RESULTADOS DEL PERÍODO') +
      row('Ventas presupuestadas', t.sales) + row('Costo de ventas', t.costSales) + row('Utilidad bruta', t.grossProfit, true) +
      row('Gastos operativos pagados', t.opex) + row('Depreciación', t.depreciation) + row('Utilidad operativa', t.ebit, true) +
      row('Otros ingresos', t.otherIncome) + row('Intereses', t.interest) + row('Impuestos', t.taxes) + row('Utilidad neta proyectada', t.netProfit, true);
    const margin = Number.isFinite(t.netProfit) && t.sales > 0 ? t.netProfit / t.sales * 100 : null;
    set('proforma-net-margin', margin === null ? '—' : `${margin.toFixed(2)}%`);
    set('proforma-margin-desc', margin === null ? 'Se requieren ventas positivas y un resultado completo para calcular el margen.' : 'Utilidad neta del presupuesto dividida entre las ventas del mismo período.');
    document.getElementById('balance-proforma-body').innerHTML = group('ACTIVOS AL CIERRE') +
      row('Efectivo final del presupuesto de caja', b.cash) + row('Cuentas por cobrar', b.receivables) + row('Inventarios', b.inventory) +
      row('Otros activos corrientes', b.otherCurrentAssets) + row('Total activo corriente', b.currentAssets, true) +
      row('Activos fijos netos', b.fixed) + row('Otros activos no corrientes', b.otherNonCurrentAssets) + row('Total activos', b.assets, true) +
      group('PASIVOS Y PATRIMONIO') + row('Cuentas por pagar', b.payables) + row('Otros pasivos corrientes', b.otherCurrentLiabilities) +
      row('Deuda a largo plazo', b.longDebt) + row('Otros pasivos no corrientes', b.otherNonCurrentLiabilities) + row('Total pasivos', b.liabilities, true) +
      row('Patrimonio inicial', r.opening.equity) + row('Utilidad neta del período', t.netProfit) + row('Dividendos distribuidos', t.dividends) +
      row('Patrimonio al cierre', b.equity, true) + row('Total pasivos y patrimonio', b.funding, true) + row('Diferencia por revisar', b.difference);
    set('balance-equation-msg', !r.ready ? 'Balance pendiente: completa los datos y revisa los supuestos antes de usar esta proyección.' : r.warnings.length ? 'La ecuación contable cuadra; revisa las alertas de caja e inventario indicadas abajo.' : 'Activos = pasivos + patrimonio. La caja procede de los cobros y pagos presupuestados.');
    const notices = [...r.issues, ...r.warnings];
    const policy = `Base ${r.settings.openingSource === 'manual' ? 'manual' : 'del balance actual'}; costo promedio ponderado mensual. El crédito restante vence al mes siguiente y los saldos iniciales por cobrar/pagar se liquidan en el primer mes. Los demás saldos se mantienen constantes. Sin financiamiento automático para cubrir déficits.`;
    set('paper-notes-text', `${c.sample ? 'CASO DE EJEMPLO. ' : ''}${state}. ${policy}`);
    document.getElementById('proforma-pending').innerHTML = notices.length ? `<strong>Pendientes y alertas</strong><ul>${notices.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : '';
    window.Finora.hydrateIcons();
  }
  document.getElementById('print-report').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount(document.getElementById('case-bar'));
  C.store.subscribe(render); render();
})();
