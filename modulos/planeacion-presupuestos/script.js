(() => {
  'use strict';
  const periods = {
    june: { title: 'Junio 2025', rows: [['Personal', 'user', 18000, 14800], ['Operaciones', 'layers', 12000, 7900], ['Comercial', 'trend', 8000, 5600], ['Servicios', 'bank', 5000, 4750], ['Tecnología', 'grid', 5000, 2750]] },
    may: { title: 'Mayo 2025', rows: [['Personal', 'user', 18000, 14000], ['Operaciones', 'layers', 10000, 6200], ['Comercial', 'trend', 7000, 5000], ['Servicios', 'bank', 5000, 4600], ['Tecnología', 'grid', 5000, 2500]] }
  };
  const limit = 90;
  const number = value => new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 }).format(value);
  const render = key => {
    const period = periods[key];
    // Las tarjetas se derivan de las filas para que no se desfasen al cambiar el periodo.
    const planned = period.rows.reduce((sum, row) => sum + row[2], 0);
    const spent = period.rows.reduce((sum, row) => sum + row[3], 0);
    const percent = (spent / planned * 100).toFixed(1);
    const atLimit = period.rows.filter(([, , rowPlanned, rowSpent]) => rowSpent / rowPlanned * 100 > limit);
    document.querySelector('#planned-total').textContent = `C$ ${number(planned)}`;
    document.querySelector('#spent-total').textContent = `C$ ${number(spent)}`;
    document.querySelector('#available-total').textContent = `C$ ${number(planned - spent)}`;
    document.querySelector('#limit-total').innerHTML = `${atLimit.length} <span class="value-suffix">/ ${period.rows.length}</span>`;
    document.querySelector('#execution-caption').textContent = `${percent}% del presupuesto`;
    document.querySelector('#execution-percent').innerHTML = `${percent}<span>%</span>`;
    document.querySelector('#budget-ring').style.setProperty('--progress', `${percent}%`);
    document.querySelector('#budget-ring').setAttribute('aria-label', `${percent} por ciento ejecutado`);
    document.querySelector('#budget-advice').textContent = atLimit.length
      ? atLimit.map(([name, , rowPlanned, rowSpent]) => `${name} ha utilizado el ${Math.round(rowSpent / rowPlanned * 100)}% de su presupuesto.`).join(' ') + ' Revisa los próximos pagos previstos.'
      : 'Ninguna categoría supera el 90% de su presupuesto.';
    document.querySelector('#chart-period').textContent = period.title;
    document.querySelector('#budget-chart').innerHTML = period.rows.map(([name, icon, planned, spent]) => `<div class="budget-chart-row"><span class="budget-category">${name}</span><div class="budget-bars"><div class="budget-bar planned" style="width:${planned / 200}%"><span>${number(planned)}</span></div><div class="budget-bar spent" style="width:${spent / 200}%"><span>${number(spent)}</span></div></div></div>`).join('');
    document.querySelector('#budget-table').innerHTML = period.rows.map(([name, icon, planned, spent]) => {
      const percent = Math.round(spent / planned * 100);
      return `<tr><td><div class="category-cell"><span class="category-symbol">${window.Finora.icon(icon)}</span><span class="cell-main">${name}</span></div></td><td class="table-number">C$ ${number(planned)}</td><td class="table-number">C$ ${number(spent)}</td><td><div class="budget-progress"><div class="progress-track"><div class="progress-bar ${percent > limit ? 'warning' : ''}" style="width:${percent}%"></div></div><span>${percent}%</span></div></td><td><span class="badge ${percent > limit ? 'badge-amber' : 'badge-green'}">${percent > limit ? 'Cerca del límite' : 'En curso'}</span></td></tr>`;
    }).join('');
  };
  document.querySelector('#budget-period').addEventListener('change', event => render(event.target.value));
  document.querySelector('#budget-method').addEventListener('click', () => window.Finora.openDialog('Cómo leer tu presupuesto', '<p>El presupuesto es el monto previsto para cada categoría. El ejecutado muestra el gasto acumulado del periodo.</p><p>El avance indica qué parte del presupuesto se ha utilizado. La etiqueta «Cerca del límite» aparece cuando supera el 90%.</p><p class="note">Todos los valores de esta pantalla son datos de muestra todavía sin sincronizar entre módulos.</p>'));
  const draft = document.querySelector('#budget-draft');
  document.querySelector('#budget-new').addEventListener('click', () => { draft.hidden = false; draft.scrollIntoView({ behavior: 'smooth', block: 'center' }); draft.querySelector('input').focus({ preventScroll: true }); });
  document.querySelector('#budget-cancel').addEventListener('click', () => { draft.hidden = true; document.querySelector('#budget-new').focus(); });
  document.querySelector('#budget-form').addEventListener('submit', event => { event.preventDefault(); window.Finora.toast('Formulario probado. Es una vista de diseño: el presupuesto no se ha guardado.'); });
  render('june');
})();
