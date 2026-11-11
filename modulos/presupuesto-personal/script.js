(() => {
  'use strict';
  const P = window.FinoraPersonal, store = P.createStore(), $ = id => document.getElementById(id);
  const form = $('personal-form'), openingForm = $('personal-opening-form'), draft = $('personal-draft');
  const tabs = Array.from(document.querySelectorAll('[data-personal-filter]'));
  const today = new Date(), localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dateFormat = new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  let state = null, period = localDate.slice(0, 7), filter = 'all', editingId = null;
  const set = (id, value) => { $(id).textContent = value; };
  const error = (id, message = '') => { set(id, message); $(id).hidden = !message; };
  const percent = value => value === null ? 'Sin porcentaje: no hay ingresos este mes' : `${value.toFixed(2)}% de tus ingresos del mes`;

  // La moneda personal no modifica la moneda global ni los estados empresariales.
  const currencyButton = $('topbar-currency');
  if (currencyButton) {
    const currency = document.createElement('span'); currency.className = currencyButton.className;
    currency.innerHTML = '<span class="currency-tag">Moneda personal</span><strong>C$</strong>';
    currencyButton.replaceWith(currency);
  }
  function updateType() {
    const type = form.elements.type.value, expense = type === 'expense';
    $('personal-priority-field').hidden = !expense;
    form.elements.priority.disabled = !expense; form.elements.priority.required = expense;
    if (!expense) form.elements.priority.value = '';
    $('personal-categories').replaceChildren(...P.categoriesFor(state, type).map(name => new Option(name, name)));
  }
  function renderOpening() {
    const firstPeriod = state.movements.map(row => row.date.slice(0, 7)).sort()[0];
    openingForm.elements.period.value = state.opening.period || firstPeriod || period;
    for (const key of ['available', 'saving', 'reserve']) openingForm.elements[key].value = state.opening[key];
  }
  function render() {
    const r = P.summarize(state, period, filter);
    $('personal-period').value = period;
    for (const key of ['income', 'expense', 'saving', 'reserve', 'available']) set('personal-' + key, P.money(r[key]));
    set('personal-balance', P.money(r.available));
    set('personal-expense-percent', percent(r.expensePercent)); set('personal-saving-percent', percent(r.savingPercent));
    set('personal-opening-caption', 'Disponible trasladado al mes: ' + P.money(r.openingAvailable));
    set('personal-accumulated-saving', P.money(r.accumulatedSaving)); set('personal-accumulated-reserve', P.money(r.accumulatedReserve));
    set('personal-funds-note', `Separado antes de este mes: ahorro ${P.money(r.openingSaving)}; reserva ${P.money(r.openingReserve)}. No se cuentan como ingresos nuevos.`);
    set('personal-formula', `${P.money(r.openingAvailable)} iniciales + ${P.money(r.income)} ingresos − ${P.money(r.expense)} gastos − ${P.money(r.saving)} ahorro − ${P.money(r.reserve)} reservas = ${P.money(r.available)} disponibles.`);
    set('personal-opening-note', r.beforeOpening ? `Este mes es anterior a los saldos iniciales de ${state.opening.period}. Para registrar movimientos anteriores, revisa el mes de inicio.` : state.opening.period ? `Base inicial registrada en ${state.opening.period}. Los cambios en meses anteriores actualizan el saldo trasladado.` : 'Sin saldos iniciales registrados: se parte de C$ 0.00. Puedes configurarlos antes del primer movimiento.');
    set('personal-welcome-text', r.count ? `Este mes separaste ${P.money(r.saving)} para ahorro y ${P.money(r.reserve)} para imprevistos.` : 'Este mes no tiene movimientos. El saldo anterior se conserva; agrega un registro para comenzar.');
    const body = $('personal-movement-rows'); body.replaceChildren();
    for (const row of r.movements) {
      const tr = document.createElement('tr'); tr.dataset.movement = row.type; tr.dataset.id = row.id;
      tr.innerHTML = '<td><div class="movement-name"><span class="movement-icon"></span><div><span class="cell-main"></span><span class="cell-sub"></span></div></div></td><td data-cell="category"></td><td data-cell="date"></td><td data-cell="priority"></td><td class="table-number" data-cell="amount"></td><td class="personal-row-actions"><button class="button button-ghost button-small" type="button" data-action="edit">Editar</button><button class="button button-ghost button-small" type="button" data-action="delete">Eliminar</button></td>';
      const icon = tr.querySelector('.movement-icon'); icon.classList.add(row.type === 'income' ? 'income' : 'expense');
      icon.innerHTML = window.Finora.icon(row.type === 'income' ? 'arrow-down-right' : row.type === 'expense' ? 'arrow-up-right' : 'bank');
      tr.querySelector('.cell-main').textContent = row.description;
      tr.querySelector('.cell-sub').textContent = [P.types[row.type], row.paymentMethod].filter(Boolean).join(' · ');
      const cells = { category: row.category, date: dateFormat.format(new Date(row.date + 'T00:00:00Z')),
        priority: row.priority === 'need' ? 'Necesidad' : row.priority === 'want' ? 'Deseo' : 'No aplica',
        amount: `${row.type === 'income' ? '+' : '−'} ${P.money(row.amount)}` };
      for (const [key, value] of Object.entries(cells)) tr.querySelector(`[data-cell="${key}"]`).textContent = value;
      if (row.type === 'income') tr.querySelector('[data-cell="amount"]').classList.add('income-amount');
      for (const button of tr.querySelectorAll('[data-action]')) button.setAttribute('aria-label', `${button.textContent}: ${row.description}`);
      body.append(tr);
    }
    if (!r.movements.length) {
      const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 6; td.className = 'personal-empty';
      td.textContent = r.count ? 'No hay movimientos de este tipo en el mes seleccionado.' : 'No hay movimientos registrados en este mes. Usa «Agregar movimiento» para comenzar.';
      tr.append(td); body.append(tr);
    }
    set('movements-count', `Mostrando ${r.movements.length} de ${r.count} movimientos del mes`);
    tabs.forEach(button => { const active = button.dataset.personalFilter === filter; button.setAttribute('aria-selected', String(active)); button.classList.toggle('active', active); button.tabIndex = active ? 0 : -1; });
    $('personal-movements').setAttribute('aria-labelledby', tabs.find(button => button.dataset.personalFilter === filter).id);
    window.FinoraPersonalInsights.render(state, period);
  }
  function reload(initial = false) {
    try {
      state = store.load(); if (initial) period = state.selectedPeriod || period;
      render(); renderOpening(); error('personal-storage-error'); $('add-personal-movement').disabled = false;
      $('personal-submit').disabled = false;
      openingForm.querySelector('[type="submit"]').disabled = false;
    } catch (issue) {
      state = null; $('personal-submit').disabled = true;
      $('personal-insights').hidden = true;
      error('personal-storage-error', issue.message); $('add-personal-movement').disabled = true;
      openingForm.querySelector('[type="submit"]').disabled = true;
      for (const key of ['income', 'expense', 'saving', 'reserve', 'available', 'balance', 'accumulated-saving', 'accumulated-reserve']) set('personal-' + key, '—');
      for (const key of ['expense-percent', 'saving-percent', 'opening-caption', 'formula', 'opening-note', 'funds-note']) set('personal-' + key, '—');
      set('personal-welcome-text', 'No se pudieron cargar los registros personales. Revisa el mensaje de almacenamiento.');
      $('personal-movement-rows').replaceChildren(); set('movements-count', 'Datos personales no disponibles');
    }
  }
  function openMovement(row) {
    form.reset(); editingId = row?.id || null;
    if (row) for (const key of ['type', 'description', 'amount', 'date', 'category', 'priority', 'paymentMethod']) form.elements[key].value = row[key] ?? '';
    else form.elements.date.value = period === localDate.slice(0, 7) ? localDate : period + '-01';
    updateType(); error('personal-form-error');
    set('personal-form-title', row ? 'Editar movimiento personal' : 'Nuevo movimiento personal');
    set('personal-submit', row ? 'Guardar cambios' : 'Guardar movimiento');
    draft.hidden = false; draft.scrollIntoView({ behavior: 'smooth', block: 'center' }); form.elements.description.focus({ preventScroll: true });
  }
  function closeMovement() { draft.hidden = true; editingId = null; $('add-personal-movement').focus({ preventScroll: true }); }
  $('add-personal-movement').addEventListener('click', () => openMovement());
  $('personal-cancel').addEventListener('click', closeMovement);
  form.elements.type.addEventListener('change', () => { form.elements.category.value = ''; if (state) updateType(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form)); if (editingId) input.id = editingId;
    try {
      const wasEditing = !!editingId; state = store.saveMovement(input); period = state.selectedPeriod; filter = 'all';
      render(); renderOpening(); closeMovement(); error('personal-storage-error');
      window.Finora.toast(wasEditing ? 'Movimiento actualizado y saldos recalculados.' : 'Movimiento guardado.');
    } catch (issue) { error('personal-form-error', issue.message); }
  });
  openingForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      state = store.saveOpening(Object.fromEntries(new FormData(openingForm))); render(); renderOpening();
      error('personal-opening-error'); window.Finora.toast('Saldos iniciales guardados. Los meses posteriores se recalcularon.');
    } catch (issue) { error('personal-opening-error', issue.message); }
  });
  $('personal-period').addEventListener('change', event => {
    try { state = store.selectPeriod(event.target.value); period = state.selectedPeriod; closeMovement(); render(); renderOpening(); error('personal-storage-error'); }
    catch (issue) { event.target.value = period; error('personal-storage-error', issue.message); }
  });
  const chooseFilter = tab => { filter = tab.dataset.personalFilter; if (state) render(); };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => chooseFilter(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      chooseFilter(next); next.focus();
    });
  });
  $('personal-movement-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const row = state.movements.find(item => item.id === button.closest('[data-id]').dataset.id); if (!row) return;
    if (button.dataset.action === 'edit') { openMovement(row); return; }
    const dialog = window.Finora.openDialog('Eliminar movimiento', '<p id="personal-delete-description"></p><p>Se recalcularán este mes y los saldos trasladados a meses posteriores.</p><p id="personal-delete-error" role="alert" class="personal-error" hidden></p><button class="button button-primary" type="button" id="personal-delete-confirm">Eliminar movimiento</button>');
    dialog.querySelector('#personal-delete-description').textContent = `${row.description} · ${P.money(row.amount)}`;
    dialog.querySelector('#personal-delete-confirm').addEventListener('click', () => {
      try { state = store.removeMovement(row.id); if (editingId === row.id) closeMovement(); render(); renderOpening(); dialog.close(); window.Finora.toast('Movimiento eliminado y saldos recalculados.'); }
      catch (issue) { error('personal-delete-error', issue.message); }
    });
  });
  window.addEventListener('storage', event => { if (event.key === P.STORAGE_KEY || event.key === null) reload(); });
  window.addEventListener('personal:imported', () => { filter = 'all'; closeMovement(); reload(true); });
  reload(true);
})();
