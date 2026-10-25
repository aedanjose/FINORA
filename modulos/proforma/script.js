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
    render();
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
    const income = document.querySelector('[data-report="income"]').getAttribute('aria-selected') === 'true';
    const ready = r.stages[income ? 'income' : 'balance'].ready;
    const state = !ready ? !income && !r.settings.advanced.enabled ? 'ETAPA AVANZADA SIN ACTIVAR' : 'INCOMPLETO' : r.warnings.length ? 'PROYECCIÓN · REVISAR ALERTAS' : 'PROYECCIÓN PRESUPUESTADA';
    set('paper-company', c.name.toUpperCase()); set('paper-period', period);
    set('paper-currency', `Cifras en ${C.fmt.unit(c)}`); set('summary-currency', C.fmt.unit(c));
    set('budget-period-summary', period); set('paper-badge-status', `${c.sample ? 'EJEMPLO · ' : ''}${state}`);
    set('proforma-data-source', c.sample ? 'Caso de ejemplo' : ready ? 'Presupuesto conectado' : 'Faltan datos');
    set('proforma-data-desc', `${r.settings.name || 'Proyección'}. ${ready ? `Resultados guardados de ${c.name}.` : 'Completa y guarda esta etapa en Planeación y presupuestos.'}`);
    set('summary-months', `${r.periods.length} ${r.settings.config.frequency === 'annual' ? 'años' : 'meses'}`);
    set('summary-cost-ratio', 'Promedio ponderado');
    set('proforma-footnote', 'Resultados calculados desde los productos y períodos de la proyección guardada. Caja y balance se calculan al activar la etapa avanzada; los históricos se conservan.');
    document.getElementById('income-proforma-body').innerHTML = group('RESULTADOS DEL PERÍODO') +
      row('Ventas presupuestadas', t.sales) + row('Costo de ventas', t.costSales) + row('Utilidad bruta', t.grossProfit, true) +
      row('Gastos administrativos', t.administration) + row('Gastos de ventas', t.selling) + row('Depreciación', t.depreciation) + row('Utilidad operativa', t.ebit, true) +
      row('Otros ingresos', t.otherIncome) + row('Otros gastos', t.otherExpenses) + row('Intereses', t.interest) + row('Utilidad antes de impuestos', t.ebt, true) + row('Impuesto sobre la renta', t.taxes) + row('Utilidad neta proyectada', t.netProfit, true);
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
    set('balance-equation-msg', !r.settings.advanced.enabled ? 'Activa Caja y proforma avanzado en Planeación para preparar este balance.' : !r.stages.balance.ready ? 'Balance pendiente: completa los datos y revisa los supuestos antes de usar esta proyección.' : r.warnings.length ? 'La ecuación contable cuadra; revisa las alertas de caja e inventario indicadas abajo.' : 'Activos = pasivos + patrimonio. La caja procede de los cobros y pagos presupuestados.');
    const activeStages = income ? ['configuration','sales','purchases','costs','expenses','income'] : Object.keys(r.stages);
    const notices = [...new Set(activeStages.flatMap(k => [...r.stages[k].issues, ...r.stages[k].warnings]))];
    const policy = `Proyección: ${r.settings.name}. Costo promedio ponderado periódico, por producto. ${!income && r.settings.advanced.enabled ? `Base ${r.settings.advanced.openingSource === 'manual' ? 'manual' : 'del balance actual'}. Crédito restante al período siguiente; saldos iniciales por cobrar/pagar en el primero. Otros saldos constantes. Sin financiamiento automático para déficits.` : 'El ISR usa el tratamiento configurado en el presupuesto. Los espacios pendientes se muestran como —.'}`;
    set('paper-notes-text', `${c.sample ? 'CASO DE EJEMPLO. ' : ''}${state}. ${policy}`);
    document.getElementById('proforma-pending').innerHTML = notices.length ? `<strong>Pendientes y alertas</strong><ul>${notices.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : '';
    window.Finora.hydrateIcons();
  }
  document.getElementById('print-report').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount(document.getElementById('case-bar'));
  C.store.subscribe(render); render();
})();
