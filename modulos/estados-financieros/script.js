/* Datos exclusivos de la maqueta; no constituyen un motor financiero. */
(() => {
  'use strict';
  const { icon, openDialog } = window.Finora;
  const format = value => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sample = {
    junio: { label: 'Junio', balance: 124850.40, income: 32480, expenses: 18260.80, result: 14219.20, cash: 48630.20, receivables: 22720.20, inventory: 28500, fixed: 25000, liabilities: 24850.40, equity: 100000, changes: ['8.4%', '12.6%', '3.2%', '42.5%'], months: 6 },
    mayo: { label: 'Mayo', balance: 115175.65, income: 28845.47, expenses: 18864.46, result: 9981.01, cash: 34411, receivables: 27764.65, inventory: 28000, fixed: 25000, liabilities: 25175.65, equity: 90000, changes: ['—', '—', '—', '—'], months: 5 }
  };
  const history = { cash: [15940, 21460, 19890, 28620, 34411, 48630.20], income: [21250, 24520, 23780, 28150, 28845.47, 32480], expenses: [16300, 18740, 19420, 18100, 18864.46, 18260.80] };
  const movements = [
    { title: 'Venta de productos', detail: 'Cobro de contado · Cliente mostrador', day: '28', type: 'Ingreso', amount: 4250, icon: 'bank' },
    { title: 'Pago a proveedores', detail: 'Abono de una compra anterior', day: '26', type: 'Egreso', amount: -1820, icon: 'box' },
    { title: 'Servicios del local', detail: 'Energía y conexión a internet', day: '25', type: 'Egreso', amount: -780, icon: 'layers' },
    { title: 'Cobro a cliente', detail: 'Recuperación de cuenta por cobrar', day: '22', type: 'Ingreso', amount: 2800, icon: 'user' },
    { title: 'Material de oficina', detail: 'Gastos de administración', day: '20', type: 'Egreso', amount: -450, icon: 'file' }
  ];
  let period = 'junio';
  let chartType = 'cash';
  let allMovements = false;
  function drawChart() {
    const data = sample[period];
    const chart = document.getElementById('cash-chart');
    const ticks = chartType === 'cash' ? [0, 15000, 30000, 45000, 60000] : [0, 10000, 20000, 30000, 40000];
    const top = 10, bottom = 165, left = 51, right = 653;
    const max = ticks.at(-1);
    const x = i => left + i * (right - left) / (data.months - 1);
    const y = val => bottom - val / max * (bottom - top);
    const points = values => values.slice(0, data.months).map((value, i) => `${x(i)},${y(value)}`).join(' ');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
    let content = '<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2864f0" stop-opacity=".13"/><stop offset="100%" stop-color="#2864f0" stop-opacity="0"/></linearGradient></defs>';
    content += ticks.map(t => `<line class="chart-grid" x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}"/><text x="37" y="${y(t) + 3}" text-anchor="end">${t === 0 ? '0' : `${t / 1000} mil`}</text>`).join('');
    content += months.slice(0, data.months).map((month, i) => `<text class="chart-label" x="${x(i)}" y="190" text-anchor="middle">${month}</text>`).join('');
    if (chartType === 'cash') {
      content += `<polygon points="${left},${bottom} ${points(history.cash)} ${right},${bottom}" fill="url(#chart-fill)"/><polyline points="${points(history.cash)}" fill="none" stroke="#2864f0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      content += history.cash.slice(0, data.months).map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === data.months - 1 ? 4 : 2.5}" fill="${i === data.months - 1 ? '#2864f0' : 'white'}" stroke="#2864f0" stroke-width="1.5"><title>${months[i]}: C$ ${format(v)}</title></circle>`).join('');
    } else {
      content += `<polyline points="${points(history.income)}" fill="none" stroke="#2864f0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points(history.expenses)}" fill="none" stroke="#a3b7dc" stroke-width="2.4" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    chart.innerHTML = content;
    chart.setAttribute('aria-label', `${chartType === 'cash' ? 'Efectivo' : 'Ingresos en azul y gastos en gris'} de enero a ${period} de 2025. Datos ilustrativos. ${chartType === 'cash' ? 'Efectivo final C$ ' + format(data.cash) : 'Ingresos C$ ' + format(data.income) + ', gastos C$ ' + format(data.expenses)}`);
    document.getElementById('chart-amount').textContent = `C$ ${format(chartType === 'cash' ? data.cash : data.income)}`;
    document.getElementById('chart-subtitle').innerHTML = chartType === 'cash' ? `<span class="chart-legend-dot"></span>Efectivo al cierre de ${period}` : '<span class="chart-legend-dot"></span>Ingresos <span class="chart-legend-dot" style="background:#a3b7dc;margin-left:12px"></span>Gastos';
  }
  function renderMovements() {
    const month = period === 'junio' ? 'jun' : 'may';
    const shown = movements.slice(0, allMovements ? 5 : 3);
    document.getElementById('movements-body').innerHTML = shown.map(m => `<tr><td><div class="transaction-cell"><span class="transaction-icon${m.amount < 0 ? ' out' : ''}">${icon(m.icon)}</span><div><div class="cell-main">${m.title}</div><div class="cell-sub">${m.detail}</div></div></div></td><td>${m.day} ${month}</td><td><span class="badge ${m.amount > 0 ? 'badge-green' : 'badge-amber'}">${m.type}</span></td><td class="table-number ${m.amount > 0 ? 'amount-income' : ''}">${m.amount > 0 ? '+' : '−'} C$ ${format(Math.abs(m.amount))}</td></tr>`).join('');
    document.getElementById('movement-count').textContent = `Mostrando ${shown.length} de 5 movimientos ilustrativos`;
    document.getElementById('view-movements').innerHTML = `${allMovements ? 'Ver menos' : 'Ver todos'}${icon('arrow-right')}`;
  }
  const statementRow = (label, amount, total = false) => `<div class="statement-row${total ? ' total' : ''}"><span>${label}</span><strong>C$ ${format(amount)}</strong></div>`;
  function render() {
    const data = sample[period];
    ['balance', 'income', 'expenses', 'result'].forEach((key, i) => { document.getElementById(`${key}-value`).textContent = format(data[key]); document.getElementById(`${key}-change`).textContent = data.changes[i]; });
    document.querySelectorAll('.comparison-label').forEach((el, i) => { el.textContent = period === 'mayo' ? 'sin comparativo de abril' : i === 2 ? 'menos que el mes anterior' : 'vs. mes anterior'; });
    document.getElementById('period-label').textContent = `Resumen de ${period}`;
    document.getElementById('statement-period').textContent = `${data.label} 2025`;
    document.getElementById('donut-total').innerHTML = `${(data.balance / 1000).toFixed(1)}<span>mil</span>`;
    const composition = [['Efectivo', data.cash, '#2864f0'], ['Por cobrar', data.receivables, '#79a1fa'], ['Inventario', data.inventory, '#b5cbfb'], ['Activos fijos', data.fixed, '#e2eafd']];
    let cumulative = 0;
    const segments = composition.map(([, value, color]) => { const start = cumulative; cumulative += value / data.balance * 100; return `${color} ${start}% ${cumulative}%`; });
    document.getElementById('balance-donut').style.setProperty('--donut-fill', `conic-gradient(${segments.join(',')})`);
    document.getElementById('balance-donut').setAttribute('aria-label', composition.map(([label, value]) => `${label} ${(value / data.balance * 100).toFixed(0)}%`).join(', '));
    document.getElementById('composition-legend').innerHTML = composition.map(([label, value, color]) => `<div class="legend-item" style="--legend-color:${color}"><span>${label}</span><strong>${Math.round(value / data.balance * 100)}%</strong></div>`).join('');
    document.getElementById('balance-statement').innerHTML = `<div class="statement-column"><h3>Activos</h3>${statementRow('Efectivo y bancos', data.cash)}${statementRow('Cuentas por cobrar', data.receivables)}${statementRow('Inventario', data.inventory)}${statementRow('Activos fijos netos', data.fixed)}${statementRow('Total activos', data.balance, true)}</div><div class="statement-column"><h3>Pasivos y patrimonio</h3>${statementRow('Pasivos corrientes', data.liabilities)}${statementRow('Pasivos no corrientes', 0)}${statementRow('Patrimonio total', data.equity)}${statementRow('Total pasivos y patrimonio', data.balance, true)}<p class="note">Corte ilustrativo con datos de muestra aún sin sincronizar. No representa una conciliación contable entre meses.</p></div>`;
    document.getElementById('results-statement').innerHTML = `<div class="statement-column">${statementRow('Ingresos del período', data.income)}${statementRow('Costos y gastos totales', data.expenses)}${statementRow('Resultado neto ilustrativo', data.result, true)}</div><p class="note">Presentación simplificada del ejemplo visual. El detalle de costos, intereses e impuestos se definirá al construir la lógica del módulo.</p>`;
    renderMovements();
    drawChart();
  }
  document.getElementById('period-select').addEventListener('change', event => { period = event.target.value; render(); });
  function wireTabs(selector, onChange) {
    const tabs = Array.from(document.querySelectorAll(selector));
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => { tabs.forEach(other => { other.setAttribute('aria-selected', String(other === tab)); other.tabIndex = other === tab ? 0 : -1; }); onChange(tab); });
      tab.addEventListener('keydown', event => { let next; if (event.key === 'ArrowRight') next = (index + 1) % tabs.length; else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = tabs.length - 1; if (next !== undefined) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); } });
    });
  }
  wireTabs('[data-chart]', tab => { chartType = tab.dataset.chart; document.getElementById('chart-panel').setAttribute('aria-labelledby', tab.id); drawChart(); });
  wireTabs('[data-statement]', tab => { document.getElementById('balance-statement').hidden = tab.dataset.statement !== 'balance'; document.getElementById('results-statement').hidden = tab.dataset.statement !== 'results'; });
  document.getElementById('view-movements').addEventListener('click', () => { allMovements = !allMovements; renderMovements(); });
  document.getElementById('balance-info').addEventListener('click', () => openDialog('Tus recursos, a simple vista', `<p>El gráfico muestra la distribución de los <strong>activos</strong> del ejemplo de ${period}: efectivo, cuentas por cobrar, inventario y activos fijos.</p><p class="note">C$ ${format(sample[period].liabilities)} de pasivos + C$ ${format(sample[period].equity)} de patrimonio = C$ ${format(sample[period].balance)} de activos. Son saldos ilustrativos para revisar la interfaz.</p>`));
  document.getElementById('new-entry').addEventListener('click', () => {
    const modal = openDialog('Nueva operación', '<form class="demo-form" id="operation-form"><p class="note"><strong>Vista previa del formulario.</strong> Puedes explorar los campos. Los datos no se guardan ni modifican el resumen.</p><div class="form-grid"><label class="field"><span class="field-label">Tipo de operación</span><select class="select" name="type"><option>Ingreso</option><option>Egreso</option></select></label><label class="field"><span class="field-label">Fecha</span><input class="input" type="date" name="date" value="2025-06-30" required></label></div><label class="field"><span class="field-label">Concepto</span><input class="input" name="concept" placeholder="Ej. Venta de productos" maxlength="100" required></label><div class="form-grid"><label class="field"><span class="field-label">Monto (C$)</span><input class="input" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label><label class="field"><span class="field-label">Cuenta</span><select class="select" name="account"><option>Efectivo y bancos</option><option>Cuentas por cobrar</option></select></label></div><button type="submit" class="button button-primary">Probar formulario</button><div class="form-feedback" role="status" id="form-feedback"></div></form>');
    modal.querySelector('[name="date"]').value = period === 'junio' ? '2025-06-30' : '2025-05-31';
    modal.querySelector('form').addEventListener('submit', event => { event.preventDefault(); modal.querySelector('#form-feedback').textContent = 'Vista previa completada. No se ha guardado ningún movimiento.'; });
  });
  render();
})();
