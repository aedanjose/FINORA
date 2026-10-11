/* Captura de los estados financieros por cuenta. Los totales y el cuadre salen del análisis compartido (casos.js). */
(() => {
  'use strict';
  const C = window.FinoraCasos, { fmt, BLOCKS, SECTIONS, INCOME_BLOCKS, SIDES } = C;
  const { icon, hydrateIcons, openDialog } = window.Finora;
  const esc = window.FinoraCaseBar.esc;
  const F = C.engine;

  let model = C.store.active();
  let ownSave = false;

  // ---------- Importes ----------
  const parseAmount = text => {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-') || raw.startsWith('−');
    const value = Number(raw.replace(/[()\s,−-]/g, ''));
    return Number.isFinite(value) ? (negative ? -value : value) : NaN;
  };
  const showAmount = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '';
  const out = (value, kind = 'number') => {
    if (kind === 'number') return `<span class="${value < 0 ? 'num-negative' : ''}">${fmt.number(value)}</span>`;
    return fmt.pct(value);
  };

  let savedOk = true;
  function save() {
    ownSave = true;
    savedOk = C.store.save(model);
    ownSave = false;
  }

  // ---------- Balance general ----------
  const ROLES = {
    'asset|current': [['cash', 'Efectivo'], ['receivables', 'Cuentas por cobrar'], ['inventory', 'Inventarios']],
    'asset|noncurrent': [['fixed', 'Activo fijo']],
    'liability|current': [['payables', 'Cuentas por pagar']],
    'liability|noncurrent': [['longDebt', 'Deuda a largo plazo']]
  };
  const blockIndex = a => BLOCKS.findIndex(b => b.section === a.section && (b.section === 'equity' || b.term === a.term));
  const groupName = a => String(a.group || '').trim() || C.defaultGroup(a);
  function groupsOfBlock(bi) {
    const groups = [];
    model.balance.forEach(a => {
      if (blockIndex(a) !== bi) return;
      const name = groupName(a); let g = groups.find(x => x.name === name);
      if (!g) { g = { name, accounts: [] }; groups.push(g); }
      g.accounts.push(a);
    });
    if (!groups.length) groups.push({ name: BLOCKS[bi].group, accounts: [] });
    return groups;
  }

  function amountCells(item, kind) {
    return SIDES.map(side => `<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-${kind}="${esc(item.id)}" data-side="${side}" id="${kind}-${esc(item.id)}-${side}" value="${esc(showAmount(item.amounts?.[side]))}" aria-label="${esc(item.name || 'Cuenta')}, ${esc(model.periods[side])}"></td>`).join('');
  }
  const outCells = (key, extraClass = '') => SIDES.map(side => `<td class="${extraClass}" data-out="${esc(key)}|${side}"></td>`).join('');

  function renderBalance() {
    const p = model.periods;
    let html = `<thead><tr><th scope="col">Cuenta</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th><th scope="col">Efecto</th><th scope="col">Uso en razones</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>`;
    let section = null;
    BLOCKS.forEach((block, bi) => {
      if (block.section !== section) {
        if (section === 'asset') html += `<tr class="row-total"><td>Total activos</td>${outCells('tot|assets')}<td colspan="3"></td></tr>${reportedRow('assets', 'Total activos según el documento')}`;
        if (section === 'liability') html += `<tr class="row-total"><td>Total pasivo</td>${outCells('tot|liabilities')}<td colspan="3"></td></tr>`;
        section = block.section;
        html += `<tr class="row-section"><td colspan="6">${SECTIONS[section]}</td></tr>`;
      }
      groupsOfBlock(bi).forEach(g => {
        const key = `${block.section}|${g.name}`;
        html += `<tr class="row-group"><td><input class="cell-input group-input" data-group-block="${bi}" data-group-name="${esc(g.name)}" id="group-${bi}-${esc(g.name)}" value="${esc(g.name)}" aria-label="Nombre del grupo"></td><td colspan="4"></td><td><button class="mini-button" type="button" data-add-account="${bi}" data-group="${esc(g.name)}">${icon('plus')}Cuenta</button></td></tr>`;
        g.accounts.forEach((a, i) => {
          const roles = ROLES[`${a.section}|${a.term}`];
          const roleCell = roles ? `<select class="cell-select" data-role="${esc(a.id)}" aria-label="Uso en razones de ${esc(a.name)}"><option value="">—</option>${roles.map(([value, label]) => `<option value="${value}"${a.role === value ? ' selected' : ''}>${label}</option>`).join('')}</select>` : '<span class="muted">—</span>';
          html += `<tr class="row-account${(a.sign ?? 1) === -1 ? ' row-contra' : ''}"><td><input class="cell-input name" data-name="${esc(a.id)}" id="name-${esc(a.id)}" value="${esc(a.name)}" placeholder="Nombre de la cuenta" aria-label="Nombre de la cuenta"></td>${amountCells(a, 'amount')}
            <td><select class="cell-select" data-sign="${esc(a.id)}" aria-label="Efecto de ${esc(a.name)}"><option value="1"${(a.sign ?? 1) === 1 ? ' selected' : ''}>Suma</option><option value="-1"${(a.sign ?? 1) === -1 ? ' selected' : ''}>Resta</option></select></td>
            <td>${roleCell}</td><td><button class="mini-button icon-only" type="button" data-delete="${esc(a.id)}" aria-label="Eliminar ${esc(a.name || 'cuenta')}">${icon('close')}</button></td></tr>`;
          const prev = g.accounts[i - 1];
          if ((a.sign ?? 1) === -1 && prev && (prev.sign ?? 1) === 1) html += `<tr class="row-net"><td>${esc(prev.name)} neto</td>${outCells(`net|${a.id}`)}<td colspan="3"></td></tr>`;
        });
        html += `<tr class="row-subtotal"><td>Total ${esc(g.name.toLowerCase())}</td>${outCells(`sub|${key}`)}<td colspan="3" data-out="rep|${esc(key)}"></td></tr>${reportedRow(key, 'Según el documento')}`;
      });
      const nextBlock = BLOCKS[bi + 1];
      html += `<tr class="row-add"><td colspan="6"><button class="mini-button" type="button" data-add-group="${bi}">${icon('plus')}Subgrupo en ${esc(block.group.toLowerCase())}</button></td></tr>`;
      if (!nextBlock) html += `${groupsOfBlock(bi).length > 1 ? `<tr class="row-total"><td>Total capital</td>${outCells('tot|equity')}<td colspan="3"></td></tr>` : ''}<tr class="row-total"><td>Total pasivo y capital</td>${outCells('tot|funding')}<td colspan="3" data-out="rep|funding"></td></tr>${reportedRow('funding', 'Total pasivo y capital según el documento')}`;
    });
    document.getElementById('balance-editor').innerHTML = html + '</tbody>';
  }
  // Fila opcional para escribir el total que trae el documento y comprobar la captura.
  function reportedRow(key, label) {
    const values = model.reported?.[key] || {};
    return `<tr class="row-reported"><td>${esc(label)} <span class="muted">(opcional)</span></td>${SIDES.map(side => `<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-reported="${esc(key)}" data-side="${side}" id="rep-${esc(key)}-${side}" value="${esc(showAmount(values[side]))}" aria-label="${esc(label)}, ${esc(model.periods[side])}"></td>`).join('')}<td colspan="3"></td></tr>`;
  }

  // ---------- Estado de resultados ----------
  const rateAccount = () => model.income.find(a => a.category === 'taxRate');
  function renderIncome() {
    const p = model.periods;
    let html = `<thead><tr><th scope="col">Cuenta</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th><th scope="col">Efecto</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>`;
    const result = (label, key, final = false) => `<tr class="${final ? 'row-final' : 'row-result'}"><td>${label}</td>${outCells(`ires|${key}`)}<td colspan="2"></td></tr>`;
    INCOME_BLOCKS.forEach(block => {
      const accounts = model.income.filter(a => a.category === block.category);
      html += `<tr class="row-group"><td>${esc(block.label)}</td><td colspan="3"></td><td><button class="mini-button" type="button" data-add-income="${block.category}">${icon('plus')}Cuenta</button></td></tr>`;
      accounts.forEach(a => {
        html += `<tr class="row-account${(a.sign ?? 1) === -1 ? ' row-contra' : ''}"><td><input class="cell-input name" data-income-name="${esc(a.id)}" id="iname-${esc(a.id)}" value="${esc(a.name)}" placeholder="Nombre de la cuenta" aria-label="Nombre de la cuenta"></td>${amountCells(a, 'income')}
          <td><select class="cell-select" data-income-sign="${esc(a.id)}" aria-label="Efecto de ${esc(a.name)}"><option value="1"${(a.sign ?? 1) === 1 ? ' selected' : ''}>Suma</option><option value="-1"${(a.sign ?? 1) === -1 ? ' selected' : ''}>Resta</option></select></td>
          <td><button class="mini-button icon-only" type="button" data-income-delete="${esc(a.id)}" aria-label="Eliminar ${esc(a.name || 'cuenta')}">${icon('close')}</button></td></tr>`;
      });
      if (accounts.length > 1) html += `<tr class="row-subtotal"><td>${esc(block.total)}</td>${outCells(`isub|${block.category}`)}<td colspan="2"></td></tr>`;
      if (block.category === 'taxes') {
        const rate = rateAccount();
        html += `<tr class="row-account"><td>Tasa de impuestos (%) <span class="muted">— opcional, si no hay monto</span></td>${SIDES.map(side => `<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-rate data-side="${side}" id="rate-${side}" value="${esc(rate && Number.isFinite(rate.amounts?.[side]) ? showAmount(+(rate.amounts[side] * 100).toFixed(6)) : '')}" aria-label="Tasa de impuestos en ${esc(model.periods[side])}"></td>`).join('')}<td colspan="2"></td></tr>`;
        html += `<tr class="row-net" data-tax-computed><td>Impuestos calculados con la tasa</td>${outCells('itax')}<td colspan="2"></td></tr>`;
      }
      if (block.category === 'costSales') html += result('Utilidad bruta', 'grossProfit');
      if (block.category === 'opex') html += result('Utilidad operativa', 'ebit');
      if (block.category === 'interest') html += result('Utilidad antes de impuestos', 'ebt');
    });
    html += result('Utilidad neta', 'netProfit', true);
    document.getElementById('income-editor').innerHTML = html + '</tbody>';
  }

  // ---------- Totales, cuadre y estado ----------
  function update() {
    const balance = C.analyzeBalance(model), income = C.analyzeIncome(model);
    const values = new Map();
    const setPair = (key, pair) => SIDES.forEach(side => values.set(`${key}|${side}`, out(pair?.[side] ?? null)));
    balance.groups.forEach(g => setPair(`sub|${g.key}`, g.total));
    balance.rows.filter(r => r.type === 'net').forEach(r => setPair(`net|${r.contra}`, r.values));
    ['assets', 'liabilities', 'equity', 'funding'].forEach(key => setPair(`tot|${key}`, balance.totals[key]));
    const reportStatus = (key, pair) => {
      const rep = model.reported?.[key]; if (!rep) return '';
      const diffs = SIDES.filter(side => Number.isFinite(rep[side]) && Number.isFinite(pair[side]) && Math.abs(rep[side] - pair[side]) > 0.01);
      const checked = SIDES.filter(side => Number.isFinite(rep[side]) && Number.isFinite(pair[side]));
      if (!checked.length) return '';
      return diffs.length ? `<span class="badge badge-amber">No coincide en ${diffs.map(side => esc(model.periods[side])).join(' y ')}: ${diffs.map(side => fmt.number(rep[side] - pair[side])).join(' / ')}</span>` : '<span class="badge badge-green">Coincide con el documento</span>';
    };
    balance.groups.forEach(g => values.set(`rep|${g.key}`, reportStatus(g.key, g.total)));
    values.set('rep|funding', reportStatus('funding', balance.totals.funding) || reportStatus('assets', balance.totals.assets));
    const s = income.statements || {};
    INCOME_BLOCKS.forEach(b => setPair(`isub|${b.category}`, Object.fromEntries(SIDES.map(side => [side, sumOf(model.income.filter(a => a.category === b.category), side)]))));
    ['grossProfit', 'ebit', 'ebt', 'netProfit'].forEach(key => setPair(`ires|${key}`, Object.fromEntries(SIDES.map(side => [side, s[side]?.[key] ?? null]))));
    const rate = rateAccount(), usesRate = rate && SIDES.some(side => Number.isFinite(rate.amounts?.[side])) && !model.income.some(a => a.category === 'taxes' && SIDES.some(side => Number.isFinite(a.amounts?.[side])));
    setPair('itax', Object.fromEntries(SIDES.map(side => [side, usesRate ? s[side]?.taxes ?? null : null])));
    document.querySelectorAll('[data-tax-computed]').forEach(row => { row.hidden = !usesRate; });
    document.querySelectorAll('[data-out]').forEach(cell => { const v = values.get(cell.dataset.out); cell.innerHTML = v ?? ''; });
    renderStats(balance, income);
    renderStatus(balance, income);
  }
  const sumOf = (list, side) => list.some(a => Number.isFinite(a.amounts?.[side])) ? list.reduce((t, a) => t + (Number.isFinite(a.amounts?.[side]) ? (a.sign ?? 1) * a.amounts[side] : 0), 0) : null;

  function renderStats(balance, income) {
    const t = balance.totals, p = model.periods;
    const card = (label, iconName, value, cmp, caption) => {
      const trend = cmp && Number.isFinite(cmp.relative) ? `<span class="trend ${cmp.relative >= 0 ? 'trend-positive' : 'trend-negative'}"><i data-icon="${cmp.relative >= 0 ? 'arrow-up-right' : 'arrow-down-right'}"></i>${fmt.signedPct(cmp.relative)}</span> vs. ${esc(p.previous)}` : esc(caption || '');
      return `<article class="stat-card"><div class="stat-topline"><span class="stat-label">${label}</span><span class="mini-icon"><i data-icon="${iconName}"></i></span></div><p class="stat-value"><span class="stat-currency">${esc(model.currency)}</span>${fmt.plain(value)}</p><p class="stat-caption">${trend}</p></article>`;
    };
    const cmp = pair => F.compareValues(pair.previous ?? null, pair.current ?? null);
    const safe = pair => { try { return cmp(pair); } catch (_) { return null; } };
    const ind = C.indicators(model, balance, income);
    const last = !income.empty && income.statements.current
      ? card('Utilidad neta', 'trend', income.statements.current.netProfit, income.statements.previous ? safe({ previous: income.statements.previous.netProfit, current: income.statements.current.netProfit }) : null, `Estado de resultados ${p.current}`)
      : card('Capital de trabajo neto', 'wallet', ind.workingCapital.values.current, ind.workingCapital, 'Activo circulante − pasivo de corto plazo');
    document.getElementById('statement-stats').innerHTML = card(`Total activos ${esc(p.current)}`, 'grid', t.assets.current, safe(t.assets)) + card('Total pasivo', 'bank', t.liabilities.current, safe(t.liabilities)) + card('Total capital', 'scale', t.equity.current, safe(t.equity)) + last;
    hydrateIcons(document.getElementById('statement-stats'));
    document.getElementById('statements-subtitle').textContent = `${model.name} · ${model.statementDate ? `${model.statementDate} de ` : ''}${p.previous} y ${p.current} · Cifras en ${fmt.unit(model) || 'unidades'}`;
  }

  function renderStatus(balance, income) {
    const chips = [];
    const chip = (ok, text, iconName = ok ? 'check' : 'info') => chips.push(`<span class="status-chip ${ok ? 'ok' : 'bad'}"><i data-icon="${iconName}"></i>${text}</span>`);
    SIDES.forEach(side => {
      const p = esc(model.periods[side]);
      if (balance.errors[side]) chip(false, `${p}: ${esc(balance.errors[side])}`);
      else if (balance.balanced[side] === true) chip(true, `${p}: Activo = Pasivo + Capital`);
      else if (balance.balanced[side] === false) chip(false, `${p}: no cuadra, diferencia ${esc(fmt.money(balance.difference[side], model))}`);
    });
    const ch = C.checks(model, balance, income);
    const mismatched = ch.items.filter(x => x.note === 'Total del documento vs suma de cuentas' && x.ok === false).length;
    if (mismatched) chip(false, `${mismatched} ${mismatched === 1 ? 'total no coincide' : 'totales no coinciden'} con el documento`);
    if (!income.empty && income.missing.length) chip(false, `Estado de resultados: falta ${esc(income.missing.join(', '))}`);
    if (income.empty) chips.push('<span class="status-chip"><i data-icon="info"></i>Sin estado de resultados: el análisis mostrará solo el balance</span>');
    chips.push(`<span class="status-chip"><i data-icon="${savedOk ? 'check' : 'info'}"></i>${savedOk ? 'Guardado en este navegador' : 'No se pudo guardar: el navegador bloquea el almacenamiento'}</span>`);
    const strip = document.getElementById('status-strip');
    strip.innerHTML = chips.join('');
    hydrateIcons(strip);
  }

  function renderAll(focusId) {
    renderBalance(); renderIncome(); update();
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (el.select) el.select(); } }
  }

  // ---------- Edición ----------
  const findBalance = id => model.balance.find(a => a.id === id);
  const findIncome = id => model.income.find(a => a.id === id);

  document.addEventListener('input', event => {
    const el = event.target; if (!el.classList?.contains('amount')) return;
    const value = parseAmount(el.value);
    el.classList.toggle('invalid', Number.isNaN(value));
    el.setAttribute('aria-invalid', String(Number.isNaN(value)));
    if (Number.isNaN(value)) return;
    const side = el.dataset.side;
    if (el.dataset.amount) findBalance(el.dataset.amount).amounts[side] = value;
    else if (el.dataset.income) findIncome(el.dataset.income).amounts[side] = value;
    else if (el.dataset.reported !== undefined) {
      model.reported = model.reported || {};
      const rep = model.reported[el.dataset.reported] = model.reported[el.dataset.reported] || {};
      rep[side] = value;
    } else if (el.dataset.rate !== undefined) {
      let rate = rateAccount();
      if (!rate) { rate = { id: C.store.newId('i'), name: 'Tasa de impuestos', category: 'taxRate', sign: 1, amounts: { previous: null, current: null } }; model.income.push(rate); }
      rate.amounts[side] = value === null ? null : value / 100;
    } else return;
    save(); update();
  });
  // Al salir de la celda se muestra el importe con separadores de miles.
  document.addEventListener('focusout', event => {
    const el = event.target; if (!el.classList?.contains('amount') || el.classList.contains('invalid')) return;
    const value = parseAmount(el.value); if (value !== null && !Number.isNaN(value)) el.value = showAmount(value);
  });

  document.addEventListener('change', event => {
    const el = event.target, d = el.dataset;
    if (d.name) {
      const a = findBalance(d.name); a.name = el.value.trim();
      // Catálogo del motor: un nombre conocido propone su uso en razones y su efecto.
      const hit = F.matchAccount(a.name);
      let changed = false;
      if (hit && hit.section === a.section && (a.section === 'equity' || hit.term === a.term) && !hit.memo) {
        if (!a.role && hit.role) { a.role = hit.role; changed = true; }
        if ((a.sign ?? 1) !== hit.sign && hit.sign === -1) { a.sign = -1; changed = true; }
      }
      save(); changed ? renderAll() : update();
    } else if (d.incomeName) {
      const a = findIncome(d.incomeName); a.name = el.value.trim();
      const hit = F.matchIncomeAccount(a.name);
      const changed = hit && hit.category === a.category && hit.sign === -1 && (a.sign ?? 1) !== -1;
      if (changed) a.sign = -1;
      save(); changed ? renderAll() : update();
    } else if (d.sign) { findBalance(d.sign).sign = Number(el.value); save(); renderAll(); }
    else if (d.incomeSign) { findIncome(d.incomeSign).sign = Number(el.value); save(); renderAll(); }
    else if (d.role) { findBalance(d.role).role = el.value || null; save(); update(); }
    else if (d.groupBlock !== undefined) {
      const bi = Number(d.groupBlock), from = d.groupName, to = el.value.trim() || BLOCKS[bi].group;
      const taken = groupsOfBlock(bi).some(g => g.name === to && g.name !== from);
      model.balance.forEach(a => { if (blockIndex(a) === bi && groupName(a) === from) { if (to === BLOCKS[bi].group) delete a.group; else a.group = to; } });
      if (model.reported?.[`${BLOCKS[bi].section}|${from}`] && !taken) { model.reported[`${BLOCKS[bi].section}|${to}`] = model.reported[`${BLOCKS[bi].section}|${from}`]; delete model.reported[`${BLOCKS[bi].section}|${from}`]; }
      save(); renderAll();
    }
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const d = button.dataset;
    if (d.addAccount !== undefined) {
      const bi = Number(d.addAccount), block = BLOCKS[bi], group = d.group;
      const account = { id: C.store.newId('b'), name: '', section: block.section, term: block.term, role: null, sign: 1, amounts: { previous: null, current: null } };
      if (group !== block.group) account.group = group;
      const lastIndex = model.balance.map((a, i) => blockIndex(a) === bi && groupName(a) === group ? i : -1).filter(i => i >= 0).pop();
      model.balance.splice(lastIndex === undefined ? insertionPoint(bi) : lastIndex + 1, 0, account);
      save(); renderAll(`name-${account.id}`);
    } else if (d.addGroup !== undefined) {
      const bi = Number(d.addGroup), block = BLOCKS[bi];
      const names = new Set(groupsOfBlock(bi).map(g => g.name));
      let name = 'Nuevo subgrupo', n = 2; while (names.has(name)) name = `Nuevo subgrupo ${n++}`;
      const account = { id: C.store.newId('b'), name: '', section: block.section, term: block.term, role: null, sign: 1, group: name, amounts: { previous: null, current: null } };
      const lastIndex = model.balance.map((a, i) => blockIndex(a) === bi ? i : -1).filter(i => i >= 0).pop();
      model.balance.splice(lastIndex === undefined ? insertionPoint(bi) : lastIndex + 1, 0, account);
      save(); renderAll(`group-${bi}-${name}`);
    } else if (d.delete) {
      const a = findBalance(d.delete);
      if (hasData(a)) confirmDelete(a, () => removeBalance(a.id)); else removeBalance(a.id);
    } else if (d.addIncome) {
      const account = { id: C.store.newId('i'), name: '', category: d.addIncome, sign: 1, amounts: { previous: null, current: null } };
      const lastIndex = model.income.map((a, i) => a.category === d.addIncome ? i : -1).filter(i => i >= 0).pop();
      model.income.splice(lastIndex === undefined ? model.income.length : lastIndex + 1, 0, account);
      save(); renderAll(`iname-${account.id}`);
    } else if (d.incomeDelete) {
      const a = findIncome(d.incomeDelete);
      if (hasData(a)) confirmDelete(a, () => removeIncome(a.id)); else removeIncome(a.id);
    }
  });
  const hasData = a => SIDES.some(side => Number.isFinite(a.amounts?.[side]) && a.amounts[side] !== 0);
  const insertionPoint = bi => { const after = model.balance.findIndex(a => blockIndex(a) > bi); return after < 0 ? model.balance.length : after; };
  function removeBalance(id) { model.balance = model.balance.filter(a => a.id !== id); save(); renderAll(); }
  function removeIncome(id) { model.income = model.income.filter(a => a.id !== id); save(); renderAll(); }
  function confirmDelete(a, onConfirm) {
    const modal = openDialog('Eliminar cuenta', `<p>La cuenta <strong>${esc(a.name || 'sin nombre')}</strong> tiene importes. ¿Quieres eliminarla?</p><button class="button button-primary" type="button" id="confirm-account-delete">Eliminar</button>`);
    modal.querySelector('#confirm-account-delete').addEventListener('click', () => { modal.close(); onConfirm(); });
  }

  // ---------- Pestañas ----------
  const tabs = Array.from(document.querySelectorAll('[data-statement]'));
  function selectTab(tab) {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; document.getElementById(t.getAttribute('aria-controls')).hidden = !on; });
    try { sessionStorage.setItem('finora:estados-tab', tab.dataset.statement); } catch (_) { /* preferencia opcional */ }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      selectTab(next); next.focus();
    });
  });
  try { const saved = sessionStorage.getItem('finora:estados-tab'); const tab = tabs.find(t => t.dataset.statement === saved); if (tab) selectTab(tab); } catch (_) { /* sin preferencia */ }
  if (new URLSearchParams(location.search).get('estado') === 'resultados') selectTab(tabs[1]);

  document.getElementById('capture-help').addEventListener('click', () => openDialog('Cómo capturar los estados', `
    <p><strong>1. Elige o crea la empresa</strong> en la barra superior. Los ejemplos de clase (Mundo Moda y Dayton) se pueden modificar y restaurar.</p>
    <p><strong>2. Una fila por cuenta</strong>, con el importe de cada período. Agrega cuentas con «＋ Cuenta» y grupos propios (por ejemplo «Otros activos») con «＋ Subgrupo».</p>
    <p><strong>3. Contracuentas:</strong> la depreciación acumulada va en positivo con efecto «Resta», justo debajo de su activo; Finora muestra el neto.</p>
    <p><strong>4. Uso en razones:</strong> indica qué cuenta es el efectivo, las cuentas por cobrar, el inventario, el activo fijo, las cuentas por pagar o la deuda de largo plazo. Los nombres conocidos se asignan solos.</p>
    <p><strong>5. Comprueba la captura</strong> escribiendo, si quieres, los totales que trae el documento: Finora te avisa si no coinciden.</p>
    <p class="note">El estado de resultados es opcional. Si la empresa no lo tiene, el análisis financiero muestra solo el balance.</p>`));

  // ---------- Sincronización ----------
  C.store.subscribe(active => {
    if (ownSave) return;
    model = active; renderAll();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { C.store.reload(); } });
  window.FinoraCaseBar.mount(document.getElementById('case-bar'), { editable: true });
  renderAll();
})();
