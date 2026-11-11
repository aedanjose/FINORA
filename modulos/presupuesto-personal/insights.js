(() => {
  'use strict';
  const P = window.FinoraPersonal, $ = id => document.getElementById(id);
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const pct = value => value === null ? '— (sin ingresos)' : value.toFixed(2) + ' %';
  function table(id, rows) {
    $(id).replaceChildren(...rows.map(values => { const tr = node('tr'); values.forEach(value => tr.append(node('td', value))); return tr; }));
  }
  // Barras con los componentes de progreso existentes. Una escala común por gráfico,
  // con eje cero cuando hay déficit; los importes y signos permanecen visibles.
  function bars(id, groups, series) {
    const host = $(id); host.replaceChildren(); host.classList.add('personal-bars');
    if (!groups.length) { host.append(node('p', 'Sin movimientos en este período.', 'note')); return; }
    const values = groups.flatMap(group => series.map(s => group[s.key]));
    const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1, zero = -min / span * 100;
    for (const group of groups) {
      const item = node('div', undefined, 'personal-bar-group'); item.append(node('strong', group.label));
      for (const s of series) {
        const value = group[s.key], line = node('div', undefined, 'personal-chart-line');
        line.dataset.series = s.key; line.dataset.value = value;
        const caption = node('div', undefined, 'personal-chart-caption'); caption.append(node('span', s.label), node('span', P.money(value)));
        const track = node('div', undefined, 'progress-track personal-chart-track'), bar = node('div', undefined, 'progress-bar');
        track.setAttribute('aria-hidden', 'true'); track.style.setProperty('--zero', zero + '%');
        bar.style.width = Math.abs(value) / span * 100 + '%'; bar.style.left = (value < 0 ? (value - min) / span * 100 : zero) + '%';
        bar.style.background = s.color; track.append(bar); line.append(caption, track); item.append(line);
      }
      host.append(item);
    }
  }
  function render(state, period) {
    const r = P.overview(state, period), total = r.accumulated; $('personal-insights').hidden = false;
    const labels = { income: 'Ingresos acumulados', expense: 'Gastos acumulados', saving: 'Aportes a ahorro registrados', reserve: 'Aportes a reservas registrados',
      savingBalance: 'Ahorro separado, incluidos saldos anteriores', reserveBalance: 'Reserva separada, incluidos saldos anteriores', available: 'Disponible al cierre' };
    $('personal-cumulative').replaceChildren(...Object.entries(labels).map(([key, label]) => {
      const div = node('div'); div.append(node('dt', label), node('dd', P.money(total[key]))); div.dataset.total = key; return div;
    }));
    bars('personal-category-chart', r.categories.map(row => ({ label: `${row.name} · ${pct(row.expensePercent)} de gastos`, expense: row.amount })), [{ key: 'expense', label: 'Gasto', color: 'var(--blue)' }]);
    table('personal-category-rows', r.categories.length ? r.categories.map(row => [row.name, P.money(row.amount), pct(row.expensePercent), pct(row.incomePercent)]) : [['Sin gastos registrados', '—', '—', '—']]);
    const goal = $('personal-goal'); goal.replaceChildren();
    if (r.goal) {
      goal.append(node('h3', r.goal.name), node('p', `${P.money(r.goal.saved)} separados / ${P.money(r.goal.amount)} de meta`, 'savings-amount'));
      const caption = node('p', pct(r.goal.percent) + ' de avance', 'note'); caption.id = 'personal-goal-percent'; goal.append(caption);
      const track = node('div', undefined, 'progress-track'), fill = node('div', undefined, 'progress-bar');
      track.setAttribute('aria-hidden', 'true'); fill.style.width = Math.min(100, r.goal.percent) + '%'; track.append(fill); goal.append(track);
      goal.append(node('p', 'El avance usa el ahorro separado total, incluidos los saldos anteriores. No incluye el dinero disponible ni las reservas.', 'note'));
      if (r.goal.startDate || r.goal.endDate) goal.append(node('p', `Seguimiento: ${r.goal.startDate || 'sin inicio'} a ${r.goal.endDate || 'sin cierre'}.`, 'note'));
    } else goal.append(node('p', 'Sin meta importada. Un Excel con nombre e importe de meta válidos activa este indicador.', 'note'));
    const series = [{ key: 'income', label: 'Ingresos', color: 'var(--green)' }, { key: 'expense', label: 'Gastos', color: 'var(--blue)' }];
    bars('personal-monthly-chart', r.monthly.map(row => ({ ...row, label: row.period })), series);
    table('personal-monthly-rows', r.monthly.map(row => [row.period, ...['income', 'expense', 'saving', 'reserve', 'available'].map(key => P.money(row[key]))]));
    bars('personal-weekly-chart', r.weekly.map(row => ({ ...row, label: `${row.from} al ${row.to}` })), [...series, { key: 'available', label: 'Disponible al cierre', color: 'var(--amber)' }]);
    table('personal-weekly-rows', r.weekly.map(row => [`${row.from} al ${row.to}`, ...['income', 'expense', 'saving', 'reserve', 'available'].map(key => P.money(row[key]))]));
    [...$('personal-weekly-rows').rows].forEach((tr, index) => {
      const week = r.weekly[index], details = node('details'); details.append(node('summary', `${week.movements.length} movimientos`));
      const list = node('ul', undefined, 'personal-notices');
      week.movements.forEach(row => list.append(node('li', `${row.date} · ${P.types[row.type]} · ${row.description} · ${P.money(row.amount)}`)));
      if (!week.movements.length) list.append(node('li', 'Sin movimientos. Se conserva el saldo anterior.'));
      details.append(list); tr.cells[0].append(details);
    });
  }
  window.FinoraPersonalInsights = { render };
})();
