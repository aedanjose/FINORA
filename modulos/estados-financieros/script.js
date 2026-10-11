/* Hoja contable: captura por cuenta y totales del motor compartido. */
(() => {
  'use strict';
  const C = window.FinoraCasos, { fmt, BLOCKS, SECTIONS, INCOME_BLOCKS, SIDES } = C;
  const { icon, hydrateIcons, openDialog } = window.Finora;
  const esc = window.FinoraCaseBar.esc, F = C.engine;
  let model = C.store.active(), ownSave = false, savedOk = true;
  const collapsed = new Set(), invalidInputs = new Map();

  const parseAmount = text => window.FinoraPaste.parseAmount(text);
  const showAmount = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '';
  const out = (value, kind = 'number') => kind === 'number' ? '<span class="' + (value < 0 ? 'num-negative' : '') + '">' + fmt.number(value) + '</span>' : fmt.pct(value);
  function save() { ownSave = true; try { savedOk = C.store.save(model); } finally { ownSave = false; } }

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
  const groupId = (kind, key) => 'ledger-' + kind + '-' + encodeURIComponent(key);
  const warningId = (kind, id) => 'warning-' + kind + '-' + id;
  const tableHead = () => '<colgroup><col class="ledger-name-column"><col class="ledger-amount-column"><col class="ledger-amount-column"><col class="ledger-options-column"></colgroup><thead><tr><th scope="col">Cuenta</th><th scope="col">' + esc(model.periods.previous) + '</th><th scope="col">' + esc(model.periods.current) + '</th><th scope="col"><span class="sr-only">Opciones</span></th></tr></thead>';
  const outCells = key => SIDES.map(side => '<td data-out="' + esc(key) + '|' + side + '"></td>').join('');
  function amountCells(item, kind) {
    const inputKind = kind === 'balance' ? 'amount' : 'income';
    return SIDES.map(side => '<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-cell-column="' + side + '" data-' + inputKind + '="' + esc(item.id) + '" data-side="' + side + '" id="' + inputKind + '-' + esc(item.id) + '-' + side + '" value="' + esc(showAmount(item.amounts?.[side])) + '" aria-describedby="' + warningId(kind, esc(item.id)) + '" aria-label="' + esc(item.name || 'Cuenta') + ', ' + esc(model.periods[side]) + '"></td>').join('');
  }
  function accountTags(a, kind) {
    const role = kind === 'balance' ? ROLES[a.section + '|' + a.term]?.find(r => r[0] === a.role)?.[1] : '';
    return '<span class="ledger-tags">' + ((a.sign ?? 1) === -1 ? '<span class="ledger-tag ledger-tag-contra">resta</span>' : '') + (role ? '<span class="ledger-tag">' + esc(role.toLowerCase()) + '</span>' : '') + '</span>';
  }
  function accountRow(a, kind) {
    const balance = kind === 'balance', nameAttr = balance ? 'name' : 'income-name', nameId = balance ? 'name-' : 'iname-';
    return '<tr class="row-account' + ((a.sign ?? 1) === -1 ? ' row-contra' : '') + '" data-edit-row="' + esc(a.id) + '"><td><div class="ledger-account-name"><input class="cell-input name" data-cell-column="name" data-' + nameAttr + '="' + esc(a.id) + '" id="' + nameId + esc(a.id) + '" value="' + esc(a.name) + '" placeholder="Nombre de la cuenta" aria-describedby="' + warningId(kind, esc(a.id)) + '" aria-label="Nombre de la cuenta">' + accountTags(a, kind) + '</div>' + (balance && (a.sign ?? 1) === -1 ? '<span class="contra-caption" data-contra-caption="' + esc(a.id) + '"></span>' : '') + '</td>' + amountCells(a, kind) + '<td class="ledger-options-cell"><button class="mini-button ledger-options" type="button" data-' + (balance ? 'options' : 'income-options') + '="' + esc(a.id) + '" aria-label="Opciones de ' + esc(a.name || 'cuenta sin nombre') + '" aria-haspopup="dialog">⋯</button></td></tr><tr class="row-warning" data-row-warning="' + esc(a.id) + '" data-warning-kind="' + kind + '" id="' + warningId(kind, esc(a.id)) + '" hidden><td colspan="4"></td></tr>';
  }
  function blankRow(kind, key) {
    const id = groupId(kind, key) + '-draft';
    return '<tr class="row-account row-draft" data-edit-row="draft"><td><input class="cell-input name" data-draft="' + kind + '" data-cell-column="name" id="' + id + '-name" autocomplete="off" placeholder="Escribe una cuenta nueva…" aria-label="Agregar cuenta"></td>' + SIDES.map(side => '<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-draft="' + kind + '" data-cell-column="' + side + '" data-side="' + side + '" id="' + id + '-' + side + '" placeholder="—" aria-label="Importe de la cuenta nueva, ' + esc(model.periods[side]) + '"></td>').join('') + '<td></td></tr>';
  }
  function groupStart(kind, key, label, count, totalKey, context) {
    const id = groupId(kind, key), folded = collapsed.has(id);
    const editable = kind === 'balance' ? '<input class="cell-input group-input" data-group-block="' + context.block + '" data-group-name="' + esc(context.group) + '" id="group-' + context.block + '-' + esc(context.group) + '" value="' + esc(label) + '" aria-label="Nombre del grupo">' : '<span class="ledger-group-label">' + esc(label) + '</span>';
    return '<tbody class="ledger-group-heading"><tr class="row-group"><td><div class="ledger-group-title"><button class="ledger-fold" type="button" data-fold="' + id + '" aria-expanded="' + !folded + '" aria-controls="' + id + '" aria-label="Mostrar u ocultar ' + esc(label) + '">' + icon('chevron-down') + '</button>' + editable + '<small class="ledger-count">' + count + (count === 1 ? ' cuenta' : ' cuentas') + '</small></div>' + '<span class="ledger-document-check" data-out="rep|' + esc(kind === 'balance' ? BLOCKS[context.block].section + '|' + context.group : 'income:' + incomePart(context.category)) + '"></span>' + '</td>' + outCells(totalKey) + '<td></td></tr></tbody><tbody class="ledger-group-body" id="' + id + '" data-group-body data-kind="' + kind + '"' + (kind === 'balance' ? ' data-block="' + context.block + '" data-group="' + esc(context.group) + '"' : ' data-category="' + esc(context.category) + '"') + (folded ? ' hidden' : '') + '>';
  }
  const totalRow = (label, key, reportKey) => '<tbody><tr class="row-total"><td>' + label + (reportKey ? '<span class="ledger-document-check" data-out="rep|' + esc(reportKey) + '"></span>' : '') + '</td>' + outCells(key) + '<td></td></tr></tbody>';
  function renderBalance() {
    let html = tableHead(), section = null;
    BLOCKS.forEach((block, bi) => {
      if (block.section !== section) {
        if (section === 'asset') html += totalRow('Total activos', 'tot|assets', 'assets');
        if (section === 'liability') html += totalRow('Total pasivo', 'tot|liabilities', 'liabilities');
        section = block.section;
        html += '<tbody><tr class="row-section"><td colspan="4">' + SECTIONS[section] + '</td></tr></tbody>';
      }
      groupsOfBlock(bi).forEach(g => {
        const key = bi + '|' + g.name;
        html += groupStart('balance', key, g.name, g.accounts.length, 'sub|' + block.section + '|' + g.name, { block: bi, group: g.name });
        const { runs } = C.contraRuns(g.accounts);
        g.accounts.forEach(a => {
          html += accountRow(a, 'balance');
          const run = runs.find(r => r.contras[r.contras.length - 1] === a);
          if (run) html += '<tr class="row-net"><td>' + esc(run.asset.name) + ' neto</td>' + outCells('net|' + a.id) + '<td></td></tr>';
        });
        html += blankRow('balance', key) + '</tbody>';
      });
      if (bi < 4 && groupsOfBlock(bi).length > 1 && model.reported?.['balance:' + balancePart(bi)]) html += totalRow('Total ' + esc(block.group.toLowerCase()), 'bpart|' + bi, 'balance:' + balancePart(bi));
      html += '<tbody><tr class="row-add"><td colspan="4"><button class="mini-button" type="button" data-add-group="' + bi + '">' + icon('plus') + 'Subgrupo en ' + esc(block.group.toLowerCase()) + '</button></td></tr></tbody>';
      if (bi === BLOCKS.length - 1) html += (groupsOfBlock(bi).length > 1 ? totalRow('Total capital', 'tot|equity', 'equity') : '') + totalRow('Total pasivo y capital', 'tot|funding', 'funding');
    });
    const table = document.getElementById('balance-editor'); table.classList.add('ledger-table'); table.innerHTML = html;
  }
  const incomePart = category => ({ opex: 'operatingExpenses', preferred: 'preferredDividends' }[category] || category);
  const balancePart = bi => ['currentAssets', 'nonCurrentAssets', 'currentLiabilities', 'nonCurrentLiabilities', 'equity'][bi];
  const editableIncomeBlocks = () => {
    const blocks = INCOME_BLOCKS.slice();
    model.income.forEach(a => { if (a.category !== 'taxRate' && !blocks.some(b => b.category === a.category)) blocks.push({ category: a.category, label: F.incomeCategories[a.category]?.label || a.category }); });
    return blocks;
  };
  const rateAccount = () => model.income.find(a => a.category === 'taxRate');
  function renderIncome() {
    let html = tableHead();
    const result = (label, key, final = false) => '<tbody><tr class="' + (final ? 'row-final' : 'row-result') + '"><td>' + label + '<span class="ledger-document-check" data-out="rep|income:' + key + '"></span></td>' + outCells('ires|' + key) + '<td></td></tr></tbody>';
    editableIncomeBlocks().forEach(block => {
      const accounts = model.income.filter(a => a.category === block.category);
      html += groupStart('income', block.category, block.label, accounts.length, 'isub|' + block.category, { category: block.category });
      html += accounts.map(a => accountRow(a, 'income')).join('') + blankRow('income', block.category);
      if (block.category === 'taxes') {
        const rate = rateAccount();
        html += '<tr class="row-account row-tax-rate"><td>Tasa de impuestos (%) <small class="ledger-tax-hint">Opcional, si no hay monto</small></td>' + SIDES.map(side => '<td><input class="cell-input amount" inputmode="decimal" autocomplete="off" data-rate data-side="' + side + '" data-cell-column="' + side + '" id="rate-' + side + '" value="' + esc(rate && Number.isFinite(rate.amounts?.[side]) ? showAmount(+(rate.amounts[side] * 100).toFixed(6)) : '') + '" aria-label="Tasa de impuestos en ' + esc(model.periods[side]) + '"></td>').join('') + '<td></td></tr><tr class="row-warning" id="warning-tax-rate" data-rate-warning hidden><td colspan="4"></td></tr><tr class="row-net" data-tax-computed><td>Impuestos calculados con la tasa</td>' + outCells('itax') + '<td></td></tr>';
      }
      html += '</tbody>';
      if (block.category === 'costSales') html += result('Utilidad bruta', 'grossProfit');
      if (block.category === 'opex') html += result('Utilidad operativa', 'ebit');
      if (block.category === 'interest') html += result('Utilidad antes de impuestos', 'ebt');
    });
    html += result('Utilidad neta', 'netProfit', !model.income.some(a => a.category === 'preferred'));
    if (model.income.some(a => a.category === 'preferred')) html += result('Utilidad disponible para acciones comunes', 'commonProfit', true);
    const table = document.getElementById('income-editor'); table.classList.add('ledger-table'); table.innerHTML = html;
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
      return diffs.length ? '<span class="ledger-match mismatch" title="Diferencia respecto al documento: ' + esc(diffs.map(side => model.periods[side] + ': ' + fmt.number(rep[side] - pair[side])).join(' / ')) + '">No coincide · ' + diffs.map(side => esc(model.periods[side])).join(' y ') + '</span>' : '<span class="ledger-match">✓ Coincide</span>';
    };
    balance.groups.forEach(g => {
      const fallback = balance.groups.filter(x => x.block === g.block).length === 1 ? (g.block === 4 ? 'equity' : 'balance:' + balancePart(g.block)) : '';
      values.set('rep|' + g.key, reportStatus(g.key, g.total) || (fallback ? reportStatus(fallback, g.total) : ''));
    });
    BLOCKS.forEach((b, bi) => {
      const pair = Object.fromEntries(SIDES.map(side => [side, sumOf(model.balance.filter(a => blockIndex(a) === bi), side)]));
      setPair('bpart|' + bi, pair);
      values.set('rep|balance:' + balancePart(bi), reportStatus('balance:' + balancePart(bi), pair));
    });
    ['assets', 'liabilities', 'equity', 'funding'].forEach(key => values.set('rep|' + key, reportStatus(key, balance.totals[key])));
    const s = income.statements || {};
    editableIncomeBlocks().forEach(b => setPair(`isub|${b.category}`, Object.fromEntries(SIDES.map(side => [side, sumOf(model.income.filter(a => a.category === b.category), side)]))));
    ['grossProfit', 'ebit', 'ebt', 'netProfit', 'commonProfit'].forEach(key => setPair(`ires|${key}`, Object.fromEntries(SIDES.map(side => [side, s[side]?.[key] ?? null]))));
    [...editableIncomeBlocks().map(b => incomePart(b.category)), 'grossProfit', 'ebit', 'ebt', 'netProfit', 'commonProfit'].forEach(part => values.set('rep|income:' + part, reportStatus('income:' + part, Object.fromEntries(SIDES.map(side => [side, s[side]?.[part] ?? null])))));
    const rate = rateAccount(), usesRate = rate && SIDES.some(side => Number.isFinite(rate.amounts?.[side])) && !model.income.some(a => a.category === 'taxes' && SIDES.some(side => Number.isFinite(a.amounts?.[side])));
    setPair('itax', Object.fromEntries(SIDES.map(side => [side, usesRate ? s[side]?.taxes ?? null : null])));
    document.querySelectorAll('[data-tax-computed]').forEach(row => { row.hidden = !usesRate; });
    document.querySelectorAll('[data-out]').forEach(cell => { const v = values.get(cell.dataset.out); cell.innerHTML = v ?? ''; });
    document.querySelectorAll('[data-contra-caption]').forEach(el => {
      const id = el.dataset.contraCaption, net = balance.rows.find(r => r.type === 'net' && r.contras.includes(id));
      const ofName = net ? model.balance.find(a => a.id === net.of)?.name : null;
      el.textContent = net ? `resta a «${ofName || 'la cuenta de arriba'}»` : '';
      el.hidden = !net;
      el.classList.toggle('warn', !net);
    });
    document.querySelectorAll('.cell-input.over').forEach(el => { el.classList.remove('over'); el.removeAttribute('title'); });
    balance.issues.filter(x => x.type === 'exceeds').forEach(x => x.sides.forEach(side => x.ids.forEach(id => {
      const el = document.getElementById(`amount-${id}-${side}`);
      if (el) { el.classList.add('over'); el.title = x.text; }
    })));
    renderWarnings(balance);
    renderStats(balance, income);
    renderStatus(balance, income);
  }
  const sumOf = (list, side) => list.some(a => Number.isFinite(a.amounts?.[side])) ? list.reduce((t, a) => t + (Number.isFinite(a.amounts?.[side]) ? (a.sign ?? 1) * a.amounts[side] : 0), 0) : null;

  function renderWarnings(balance) {
    document.querySelectorAll('[data-row-warning]').forEach(row => {
      const id = row.dataset.rowWarning, kind = row.dataset.warningKind;
      const a = kind === 'balance' ? model.balance.find(x => x.id === id) : model.income.find(x => x.id === id);
      const issues = kind === 'balance' ? balance.issues.filter(x => x.id === id) : [];
      const messages = issues.map(x => esc(x.text));
      if (SIDES.some(side => invalidInputs.has((kind === 'balance' ? 'amount-' : 'income-') + id + '-' + side))) messages.unshift('Escribe un número válido. El último importe válido se conserva hasta que corrijas la celda.');
      if (a && SIDES.some(side => Number.isFinite(a.amounts?.[side]) && ((a.amounts[side] < 0 && !(kind === 'balance' ? a.section === 'equity' : a.category === 'taxes')) || Math.abs(a.amounts[side]) > 1e15))) messages.push('Usa un importe positivo de hasta 10¹⁵; para restar, cambia el efecto en «⋯».');
      const action = issues.find(x => x.type === 'misplaced');
      const unique = Array.from(new Set(messages));
      row.hidden = !unique.length;
      row.firstElementChild.innerHTML = unique.join(' ') + (action ? ' <button class="mini-button" type="button" data-move-noncurrent="' + esc(id) + '">Mover a activos no circulantes</button>' : '');
      const accountRow = row.previousElementSibling;
      accountRow?.classList.toggle('has-warning', !!unique.length);
    });
    const taxRow = document.querySelector('[data-rate-warning]'), rate = rateAccount();
    if (taxRow) {
      const invalid = SIDES.some(side => invalidInputs.has('rate-' + side));
      const outside = rate && SIDES.some(side => Number.isFinite(rate.amounts?.[side]) && (rate.amounts[side] < 0 || rate.amounts[side] >= 1));
      taxRow.hidden = !invalid && !outside;
      taxRow.firstElementChild.textContent = invalid ? 'Escribe una tasa válida; el último valor válido se conserva.' : outside ? 'La tasa debe ser desde 0 y menor que 100 %.' : '';
    }
  }

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
      if (balance.errors[side] && !balance.issues.some(x => x.text === balance.errors[side])) chip(false, `${p}: ${esc(balance.errors[side])}`);
      else if (balance.balanced[side] === true) chip(true, `${p}: Activo = Pasivo + Capital`);
      else if (balance.balanced[side] === false) chip(false, `${p}: no cuadra, diferencia ${esc(fmt.money(balance.difference[side], model))}`);
    });
    const accountIssues = new Set(balance.issues.map(x => x.id));
    if (accountIssues.size) chips.push('<span class="status-chip"><i data-icon="info"></i>Revisa ' + accountIssues.size + (accountIssues.size === 1 ? ' cuenta señalada' : ' cuentas señaladas') + ' en la hoja</span>');
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
    renderBalance(); renderIncome();
    invalidInputs.forEach((value, id) => {
      const input = document.getElementById(id);
      if (input) { input.value = value; input.classList.add('invalid'); input.setAttribute('aria-invalid', 'true'); }
      else invalidInputs.delete(id);
    });
    update();
    if (focusId) focusCell(focusId);
  }
  function focusCell(id, select = true) {
    const el = document.getElementById(id);
    if (el) { el.focus(); if (select && el.select) el.select(); }
  }

  // ---------- Edición de la hoja ----------
  const findBalance = id => model.balance.find(a => a.id === id);
  const findIncome = id => model.income.find(a => a.id === id);
  const insertionPoint = bi => { const after = model.balance.findIndex(a => blockIndex(a) > bi); return after < 0 ? model.balance.length : after; };
  function insertBalance(bi, group) {
    const block = BLOCKS[bi];
    const a = { id: C.store.newId('b'), name: '', section: block.section, term: block.term, role: null, sign: 1, amounts: { previous: null, current: null } };
    if (group !== block.group) a.group = group;
    const last = model.balance.map((x, i) => blockIndex(x) === bi && groupName(x) === group ? i : -1).filter(i => i >= 0).pop();
    model.balance.splice(last === undefined ? insertionPoint(bi) : last + 1, 0, a);
    return a;
  }
  function insertIncome(category) {
    const a = { id: C.store.newId('i'), name: '', category, sign: 1, amounts: { previous: null, current: null } };
    const last = model.income.map((x, i) => x.category === category ? i : -1).filter(i => i >= 0).pop();
    model.income.splice(last === undefined ? model.income.length : last + 1, 0, a);
    return a;
  }
  function materializeDraft(el) {
    if (!el.value.trim()) return;
    const body = el.closest('[data-group-body]'), kind = el.dataset.draft, side = el.dataset.side;
    const a = kind === 'balance' ? insertBalance(Number(body.dataset.block), body.dataset.group) : insertIncome(body.dataset.category);
    const raw = el.value, start = el.selectionStart, end = el.selectionEnd;
    const id = side ? (kind === 'balance' ? 'amount-' : 'income-') + a.id + '-' + side : (kind === 'balance' ? 'name-' : 'iname-') + a.id;
    if (side) {
      const value = parseAmount(raw);
      if (Number.isNaN(value)) invalidInputs.set(id, raw); else a.amounts[side] = value;
    } else {
      a.name = raw;
      if (kind === 'balance') identifyBalance(a);
      else { const hit = F.matchIncomeAccount(a.name); if (hit && hit.category === a.category && hit.sign === -1) a.sign = -1; }
    }
    save(); renderAll();
    const replacement = document.getElementById(id);
    if (replacement) { replacement.value = raw; replacement.focus(); replacement.setSelectionRange(start, end); }
  }
  function identifyBalance(a) {
    const hit = F.matchAccount(a.name);
    let changed = false;
    if (hit && hit.section === a.section && (a.section === 'equity' || hit.term === a.term) && !hit.memo) {
      if (!a.role && hit.role) { a.role = hit.role; changed = true; }
      if ((a.sign ?? 1) !== hit.sign && hit.sign === -1) { a.sign = -1; changed = true; }
    }
    if (!hit && a.section === 'asset' && a.term === 'noncurrent' && /deprec|amortiz|agotamiento/.test(a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) {
      if ((a.sign ?? 1) !== -1) { a.sign = -1; changed = true; }
      if (!a.role) { a.role = 'fixed'; changed = true; }
    }
    // Fuera del catálogo, el uso se sugiere por palabra clave («Caja chica» → efectivo); se ve como etiqueta y se cambia en «⋯».
    if (!hit && !a.role && (a.sign ?? 1) === 1) {
      const role = window.FinoraTableImporter?.suggestRole(a.name, a.section, a.term);
      if (role) { a.role = role; changed = true; }
    }
    return changed;
  }
  document.addEventListener('input', event => {
    const el = event.target;
    if (el.dataset?.draft) { materializeDraft(el); return; }
    if (!el.classList?.contains('amount') || !el.closest('.ledger-table')) return;
    const value = parseAmount(el.value), invalid = Number.isNaN(value);
    el.classList.toggle('invalid', invalid); el.setAttribute('aria-invalid', String(invalid));
    if (invalid) { invalidInputs.set(el.id, el.value); update(); return; }
    invalidInputs.delete(el.id);
    const side = el.dataset.side;
    if (el.dataset.amount) findBalance(el.dataset.amount).amounts[side] = value;
    else if (el.dataset.income) findIncome(el.dataset.income).amounts[side] = value;
    else if (el.dataset.rate !== undefined) {
      let rate = rateAccount();
      if (!rate) { rate = { id: C.store.newId('i'), name: 'Tasa de impuestos', category: 'taxRate', sign: 1, amounts: { previous: null, current: null } }; model.income.push(rate); }
      rate.amounts[side] = value === null ? null : value / 100;
    } else return;
    save(); update();
  });
  document.addEventListener('focusout', event => {
    const el = event.target;
    if (!el.classList?.contains('amount') || !el.closest('.ledger-table') || el.classList.contains('invalid')) return;
    const value = parseAmount(el.value); if (value !== null && !Number.isNaN(value)) el.value = showAmount(value);
  });
  document.addEventListener('keydown', event => {
    const el = event.target;
    if (event.key !== 'Enter' || event.isComposing || !el.matches?.('.ledger-table [data-cell-column]')) return;
    event.preventDefault();
    const cells = Array.from(el.closest('table').querySelectorAll('[data-cell-column="' + el.dataset.cellColumn + '"]')).filter(cell => !cell.closest('[hidden]'));
    const next = cells[cells.indexOf(el) + (event.shiftKey ? -1 : 1)];
    const nextId = next?.id; el.blur();
    focusCell(nextId || el.id);
  });
  document.addEventListener('paste', event => {
    const el = event.target, body = el.closest?.('.ledger-table [data-group-body]');
    if (!body || !el.matches('input')) return;
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!/[\t\r\n]/.test(text.trim())) return;
    event.preventDefault();
    if (!window.FinoraImport?.open) { window.Finora.toast('El lector de tablas no está disponible. Vuelve a cargar la página.'); return; }
    const context = body.dataset.kind === 'balance' ? { block: Number(body.dataset.block), group: body.dataset.group } : { category: body.dataset.category };
    window.FinoraImport.open({ kind: body.dataset.kind, text, mode: 'append', context });
  });

  document.addEventListener('change', event => {
    const el = event.target, d = el.dataset;
    if (d.name) {
      const a = findBalance(d.name); if (!a) return; a.name = el.value.trim();
      const changed = identifyBalance(a); save(); changed ? renderAll() : update();
    } else if (d.incomeName) {
      const a = findIncome(d.incomeName); if (!a) return; a.name = el.value.trim();
      const hit = F.matchIncomeAccount(a.name), changed = hit && hit.category === a.category && hit.sign === -1 && (a.sign ?? 1) !== -1;
      if (changed) a.sign = -1;
      save(); changed ? renderAll() : update();
    } else if (d.sign) { findBalance(d.sign).sign = Number(el.value); save(); renderAll(); }
    else if (d.incomeSign) { findIncome(d.incomeSign).sign = Number(el.value); save(); renderAll(); }
    else if (d.role) { findBalance(d.role).role = el.value || null; save(); renderAll(); }
    else if (d.transfer) {
      const a = findBalance(d.transfer), target = JSON.parse(el.value), block = BLOCKS[target.block];
      model.balance.splice(model.balance.indexOf(a), 1);
      a.section = block.section; a.term = block.term;
      if (target.group === block.group) delete a.group; else a.group = target.group;
      if (!ROLES[a.section + '|' + a.term]?.some(r => r[0] === a.role)) a.role = null;
      const last = model.balance.map((x, i) => blockIndex(x) === target.block && groupName(x) === target.group ? i : -1).filter(i => i >= 0).pop();
      model.balance.splice(last === undefined ? insertionPoint(target.block) : last + 1, 0, a);
      collapsed.delete(groupId('balance', target.block + '|' + target.group));
      el.closest('dialog')?.close(); save(); renderAll('name-' + a.id);
    } else if (d.incomeCategory) {
      const a = findIncome(d.incomeCategory); a.category = el.value;
      collapsed.delete(groupId('income', a.category)); el.closest('dialog')?.close(); save(); renderAll('iname-' + a.id);
    } else if (d.groupBlock !== undefined) {
      const bi = Number(d.groupBlock), from = d.groupName, to = el.value.trim() || BLOCKS[bi].group;
      const taken = groupsOfBlock(bi).some(g => g.name === to && g.name !== from);
      model.balance.forEach(a => { if (blockIndex(a) === bi && groupName(a) === from) { if (to === BLOCKS[bi].group) delete a.group; else a.group = to; } });
      if (model.reported?.[BLOCKS[bi].section + '|' + from] && !taken) { model.reported[BLOCKS[bi].section + '|' + to] = model.reported[BLOCKS[bi].section + '|' + from]; delete model.reported[BLOCKS[bi].section + '|' + from]; }
      if (collapsed.delete(groupId('balance', bi + '|' + from))) collapsed.add(groupId('balance', bi + '|' + to));
      save(); renderAll();
    }
  });

  function optionsFor(a, kind) {
    const balance = kind === 'balance', siblings = balance ? model.balance.filter(x => blockIndex(x) === blockIndex(a) && groupName(x) === groupName(a)) : model.income.filter(x => x.category === a.category);
    const at = siblings.indexOf(a), roleOptions = balance ? ROLES[a.section + '|' + a.term] : null;
    const roles = roleOptions ? '<label class="field-label" for="ledger-role">Uso en razones financieras</label><select class="cell-select" id="ledger-role" data-role="' + esc(a.id) + '"><option value="">Sin uso específico</option>' + roleOptions.map(([value, label]) => '<option value="' + value + '"' + (a.role === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>' : '';
    const destinations = balance ? BLOCKS.map((b, bi) => groupsOfBlock(bi).map(g => '<option value="' + esc(JSON.stringify({ block: bi, group: g.name })) + '"' + (bi === blockIndex(a) && g.name === groupName(a) ? ' selected' : '') + '>' + esc(SECTIONS[b.section] + ' · ' + g.name) + '</option>').join('')).join('') : Object.entries(F.incomeCategories).filter(([category]) => category !== 'taxRate').map(([category, info]) => ({ category, label: info.label })).map(b => '<option value="' + b.category + '"' + (b.category === a.category ? ' selected' : '') + '>' + esc(b.label) + '</option>').join('');
    const modal = openDialog('Opciones de ' + (a.name || 'la cuenta'), '<div class="ledger-menu"><label class="field-label" for="ledger-sign">Efecto dentro de su grupo</label><select class="cell-select" id="ledger-sign" data-' + (balance ? 'sign' : 'income-sign') + '="' + esc(a.id) + '"><option value="1"' + ((a.sign ?? 1) === 1 ? ' selected' : '') + '>Suma</option><option value="-1"' + ((a.sign ?? 1) === -1 ? ' selected' : '') + '>Resta</option></select>' + roles + '<label class="field-label" for="ledger-destination">Mover a otro grupo</label><select class="cell-select" id="ledger-destination" data-' + (balance ? 'transfer' : 'income-category') + '="' + esc(a.id) + '">' + destinations + '</select><p class="ledger-menu-note">Las contracuentas se capturan en positivo con efecto «Resta», debajo de la cuenta que corrigen.</p><div class="ledger-menu-actions"><button class="button button-secondary" type="button" data-' + (balance ? 'move' : 'income-move') + '="' + esc(a.id) + '" data-dir="-1"' + (at === 0 ? ' disabled' : '') + '>Subir fila</button><button class="button button-secondary" type="button" data-' + (balance ? 'move' : 'income-move') + '="' + esc(a.id) + '" data-dir="1"' + (at === siblings.length - 1 ? ' disabled' : '') + '>Bajar fila</button></div><button class="button button-secondary ledger-delete" type="button" data-' + (balance ? 'delete' : 'income-delete') + '="' + esc(a.id) + '">Eliminar cuenta</button></div>');
    modal.querySelector('select')?.focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const d = button.dataset;
    if (d.fold) {
      const body = document.getElementById(d.fold); if (!body) return;
      body.hidden = !body.hidden; button.setAttribute('aria-expanded', String(!body.hidden));
      body.hidden ? collapsed.add(d.fold) : collapsed.delete(d.fold);
    } else if (d.options) optionsFor(findBalance(d.options), 'balance');
    else if (d.incomeOptions) optionsFor(findIncome(d.incomeOptions), 'income');
    else if (d.addGroup !== undefined) {
      const bi = Number(d.addGroup), names = new Set(groupsOfBlock(bi).map(g => g.name));
      let name = 'Nuevo subgrupo', n = 2; while (names.has(name)) name = 'Nuevo subgrupo ' + n++;
      insertBalance(bi, name); save(); renderAll('group-' + bi + '-' + name);
    } else if (d.delete || d.incomeDelete) {
      const balance = !!d.delete, a = balance ? findBalance(d.delete) : findIncome(d.incomeDelete);
      const remove = () => {
        if (balance) model.balance = model.balance.filter(x => x.id !== a.id); else model.income = model.income.filter(x => x.id !== a.id);
        SIDES.forEach(side => invalidInputs.delete((balance ? 'amount-' : 'income-') + a.id + '-' + side));
        save(); renderAll();
      };
      if (hasData(a)) confirmDelete(a, remove); else { button.closest('dialog')?.close(); remove(); }
    } else if (d.move || d.incomeMove) {
      const balance = !!d.move, list = balance ? model.balance : model.income, a = balance ? findBalance(d.move) : findIncome(d.incomeMove);
      const siblings = list.map((x, i) => (balance ? blockIndex(x) === blockIndex(a) && groupName(x) === groupName(a) : x.category === a.category) ? i : -1).filter(i => i >= 0);
      const from = list.indexOf(a), target = siblings[siblings.indexOf(from) + Number(d.dir)]; if (target === undefined) return;
      [list[from], list[target]] = [list[target], list[from]];
      button.closest('dialog')?.close(); save(); renderAll((balance ? 'name-' : 'iname-') + a.id);
    } else if (d.moveNoncurrent) {
      const a = findBalance(d.moveNoncurrent); model.balance.splice(model.balance.indexOf(a), 1);
      a.term = 'noncurrent'; delete a.group; a.sign = -1; a.role = 'fixed';
      const fixedIdx = model.balance.map((x, i) => blockIndex(x) === 1 && !x.group && (x.sign ?? 1) === 1 && x.role === 'fixed' ? i : -1).filter(i => i >= 0).pop();
      const lastIdx = model.balance.map((x, i) => blockIndex(x) === 1 && !x.group ? i : -1).filter(i => i >= 0).pop();
      const at = fixedIdx ?? lastIdx; model.balance.splice(at === undefined ? insertionPoint(1) : at + 1, 0, a);
      collapsed.delete(groupId('balance', '1|' + BLOCKS[1].group)); save(); renderAll('name-' + a.id);
      window.Finora.toast('La cuenta se movió a activos no circulantes. Revisa que quede debajo del activo que deprecia.');
    }
  });
  const hasData = a => SIDES.some(side => Number.isFinite(a.amounts?.[side]) && a.amounts[side] !== 0);
  function confirmDelete(a, onConfirm) {
    const modal = openDialog('Eliminar cuenta', '<p>La cuenta <strong>' + esc(a.name || 'sin nombre') + '</strong> tiene importes. ¿Quieres eliminarla?</p><button class="button button-primary" type="button" id="confirm-account-delete">Eliminar</button>');
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

  document.getElementById('capture-help').addEventListener('click', () => openDialog('Cómo capturar los estados', '<p><strong>1. Elige o crea la empresa</strong> en la barra superior. Cada empresa conserva sus propias cuentas y períodos.</p><p><strong>2. Pega desde Excel.</strong> Copia las filas con sus dos períodos y usa «Pegar Excel», o pégalas en una celda de la hoja. Revisa la clasificación y los importes antes de aplicar.</p><p><strong>3. Edita como en una hoja contable.</strong> Haz clic en un nombre o importe. Enter baja a la siguiente fila de esa columna; Mayús + Enter sube. Escribir en la fila vacía crea una cuenta.</p><p><strong>4. Ordena tus grupos.</strong> La flecha pliega sus cuentas y conserva visibles el subtotal y la cantidad. Puedes renombrar el grupo o agregar un subgrupo.</p><p><strong>5. Abre «⋯»</strong> para cambiar el efecto, el uso en razones, el grupo o el orden de una cuenta. La depreciación acumulada va en positivo con efecto «Resta», justo debajo de su activo.</p><p><strong>6. Comprueba la captura.</strong> Los totales detectados al importar se comparan con la suma y muestran «Coincide» o «No coincide». Los avisos de una cuenta aparecen debajo de su fila.</p><p class="note">El estado de resultados es opcional. Los importes se guardan en este navegador; escribe 0 cuando la cuenta no exista en un período y deja en blanco solo los datos que no tienes.</p>'));

  // ---------- Sincronización ----------
  C.store.subscribe(active => {
    if (ownSave) return;
    invalidInputs.clear(); model = active; renderAll();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { C.store.reload(); } });
  window.FinoraCaseBar.mount(document.getElementById('case-bar'), { editable: true });
  renderAll();
})();
