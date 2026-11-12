'use strict';
(() => {
  const C = window.FinoraCasos, P = window.FinoraProforma, L = window.FinoraLeverage, { esc } = window.FinoraCaseBar;
  const $ = id => document.getElementById(id);
  const set = (id, value) => { if ($(id)) $(id).textContent = value; };
  let company = C.store.active(), settings = P.settingsFor(company), dirty = false, savedSignature = '';
  const tabs = Array.from(document.querySelectorAll('[data-report]'));
  const money = value => C.fmt.money(value, company);
  const pct = value => C.fmt.pct(value);
  const presentIssue = text => String(text).replace(/entre (-?\d+(?:\.\d+)?) y 1000000000000000/g, 'desde $1 hasta el límite de importes permitido');
  const issueLabel = text => {
    const rules = [[/fechas|período histórico|cierre histórico/i, 'fechas y período'], [/costo/i, 'costos'], [/gasto/i, 'gastos'], [/ventas/i, 'ventas'], [/inter[eé]s/i, 'intereses'], [/impuesto|fiscal/i, 'impuestos'], [/dividendo/i, 'dividendos'], [/balance/i, 'balance histórico o proforma']];
    return rules.find(([pattern]) => pattern.test(text))?.[1] || 'otras premisas';
  };
  const valueOf = path => path.split('.').reduce((obj, key) => obj?.[key], settings);
  const field = (label, path, type = 'number', extra = '') => `<label class="field"><span class="field-label">${esc(label)}</span><input class="input" data-setting="${esc(path)}" type="${type}" ${type === 'number' ? 'step="any"' : ''} value="${esc(valueOf(path) ?? '')}" ${extra}></label>`;
  const select = (label, path, options) => `<label class="field"><span class="field-label">${esc(label)}</span><select class="select" data-setting="${esc(path)}">${options.map(([v, text]) => `<option value="${esc(v)}"${valueOf(path) === v ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const check = (label, path) => `<label class="proforma-check"><input type="checkbox" data-setting="${esc(path)}"${valueOf(path) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const row = (label, value, total = false) => `<tr${total ? ' class="statement-subtotal"' : ''}><th scope="row">${esc(label)}</th><td>${esc(money(value))}</td></tr>`;
  const results = [['sales', 'Ventas proyectadas'], ['costSales', 'Costo de ventas'], ['grossProfit', 'Utilidad bruta'],
    ['operatingExpenses', 'Gastos operativos (incluye depreciación)'], ['ebit', 'Utilidad operativa'], ['otherIncome', 'Otros ingresos netos'],
    ['interest', 'Intereses'], ['ebt', 'Utilidad antes de impuestos'], ['taxes', 'Impuesto sobre la renta'], ['netProfit', 'Utilidad neta'],
    ['dividends', 'Dividendos totales'], ['retained', 'Ganancias retenidas del período']];
  const isTotal = key => ['grossProfit', 'ebit', 'ebt', 'netProfit', 'retained'].includes(key);
  function selectReport(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected); item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1; $(`report-${item.dataset.report}`).hidden = !selected;
    });
    set('paper-title', tab.dataset.report === 'income' ? 'Estado de resultados proforma' : 'Balance general proforma');
    renderResults();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectReport(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length];
      selectReport(next); next.focus();
    });
  });
  function renderForms() {
    const r = P.analyze(company, settings), a = settings.balance;
    const saved = company.params?.proformaProjections || [];
    $('projection-controls').innerHTML = `<label class="field"><span class="field-label">Proyecciones guardadas</span><select class="select" id="saved-projection"><option value="">${dirty ? 'Borrador actual' : 'Selecciona una proyección'}</option>${saved.map(s => `<option value="${esc(s.id)}"${s.id === settings.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` +
      field('Nombre de la proyección', 'name', 'text', 'maxlength="80"') +
      select('Período histórico', 'historicalPeriod', C.SIDES.map(side => [side, company.periods?.[side] || side])) +
      field('Fecha de cierre histórico', 'historicalEnd', 'date') + field('Inicio de la proyección', 'start', 'date') + field('Fin de la proyección', 'end', 'date') +
      select('Ventas esperadas', 'salesMode', [['growth', 'Crecimiento sobre ventas históricas (%)'], ['amount', 'Importe total proyectado']]) +
      field(settings.salesMode === 'growth' ? 'Crecimiento (%)' : `Ventas (${C.fmt.unit(company)})`, 'salesValue', 'number', `min="${settings.salesMode === 'growth' ? -100 : 0}"`) +
      select('Metodología activa', 'method', [['sales', 'Porcentaje de ventas'], ['mixed', 'Costos fijos y variables']]) +
      select('Impuesto sobre utilidades', 'taxMode', [['historical', 'Tasa efectiva histórica'], ['rate', 'Tasa explícita (%)']]) +
      (settings.taxMode === 'rate' ? field('Tasa de impuesto (%)', 'taxRate', 'number', 'min="0" max="99.999999"') : '') +
      select('Tratamiento de pérdidas', 'taxLoss', [['none', 'Sin beneficio fiscal (impuesto mínimo cero)'], ['credit', 'Reconocer beneficio con la misma tasa']]) +
      select('Dividendos totales (incluye preferentes)', 'dividendMode', [['amount', 'Importe del período'], ['percent', '% de utilidad neta positiva']]) +
      field(settings.dividendMode === 'percent' ? 'Dividendos (%)' : `Dividendos (${C.fmt.unit(company)}; 0 si no hay)`, 'dividends', 'number', `min="0"${settings.dividendMode === 'percent' ? ' max="100"' : ''}`);
    const editableRows = r.history.rows.filter(line => ['costSales', 'opex', 'otherIncome', 'interest'].includes(line.category));
    const costInput = (line, key, label, value, extra = '') => `<input class="input" type="number" step="any" data-line="${esc(line.key)}" data-line-field="${key}" value="${esc(value ?? '')}" aria-label="${esc(label + ': ' + line.name)}" ${extra}>`;
    const costRows = editableRows.map(line => {
      const p = P.lineSettings(r.history, settings, line), cost = ['costSales', 'opex'].includes(line.category);
      const projected = r.comparison.sales.rows.find(item => item.key === line.key);
      return `<tr><th scope="row">${esc(line.name)}<small>${esc(P.incomeFields[line.category])}</small></th><td>${esc(money(projected?.historical))}<small>${esc(pct(projected?.ratio))} de ventas</small></td>` +
        `<td>${cost ? costInput(line, 'fixedPercent', '% fijo histórico', p.fixedPercent, 'min="0" max="100" placeholder="Confirmar"') : 'Constante en método mixto'}</td>` +
        `<td>${cost ? costInput(line, 'fixedGrowth', 'Ajuste del fijo (%)', p.fixedGrowth, 'min="-100"') : '—'}</td>` +
        `<td>${costInput(line, 'amount', 'Importe proyectado sustituto', p.amount, 'min="0" placeholder="Automático"')}</td>` +
        `<td>${cost ? `<input type="checkbox" data-line="${esc(line.key)}" data-line-field="depreciation" aria-label="${esc('Identificar depreciación: ' + line.name)}"${p.depreciation ? ' checked' : ''}>` : '—'}</td></tr>`;
    }).join('');
    let balance = check('Preparar Balance General por método crítico', 'balance.enabled');
    if (a.enabled) {
      balance += `<p>Importes en ${esc(C.fmt.unit(company))}. Los saldos vacíos de «otras cuentas» conservan el histórico: es una premisa editable, no un cero. El mínimo de efectivo es el activo objetivo.</p><div class="proforma-field-grid">` +
        field('Efectivo mínimo al cierre', 'balance.cash', 'number', 'min="0"') +
        select('Cuentas por cobrar', 'balance.receivablesMode', [['sales', '% histórico de ventas'], ['amount', 'Saldo final explícito'], ['days', 'Política de cobro en días']]) +
        (a.receivablesMode === 'amount' ? field('Saldo final de cuentas por cobrar', 'balance.receivables', 'number', 'min="0"') : '') +
        (a.receivablesMode === 'days' ? field('Ventas a crédito (%)', 'balance.salesCreditPercent', 'number', 'min="0" max="100"') + field('Plazo de cobro (días)', 'balance.collectionDays', 'number', 'min="0"') + field('CxC iniciales aún pendientes al cierre (0 si se cobran)', 'balance.openingReceivablesRemaining', 'number', 'min="0"') : '') +
        select('Inventarios', 'balance.inventoryMode', [['sales', '% histórico de ventas'], ['amount', 'Inventario final explícito']]) +
        (a.inventoryMode === 'amount' ? field('Inventario final', 'balance.inventory', 'number', 'min="0"') : '') +
        field('Inversión en activos fijos (0 si no hay)', 'balance.capex', 'number', 'min="0"') + field('Bajas de activos a valor neto (0 si no hay)', 'balance.disposals', 'number', 'min="0"') +
        select('Depreciación de activos fijos', 'balance.depreciationMode', [['selected', 'Usar cuentas identificadas en resultados'], ['none', 'Confirmo que no hay depreciación']]) +
        select('Cuentas por pagar', 'balance.payablesMode', [['sales', '% histórico de ventas'], ['amount', 'Saldo final explícito'], ['days', 'Política de pago sobre compras']]) +
        (a.payablesMode === 'amount' ? field('Saldo final de cuentas por pagar', 'balance.payables', 'number', 'min="0"') : '') +
        (a.payablesMode === 'days' ? select('Base de compras', 'balance.purchasesMode', [['manual', 'Compras explícitas'], ['inventory', 'Empresa comercial: costo + inventario final − inicial']]) +
          (a.purchasesMode === 'manual' ? field('Compras proyectadas', 'balance.purchases', 'number', 'min="0"') : '') +
          field('Compras a crédito (%)', 'balance.purchasesCreditPercent', 'number', 'min="0" max="100"') + field('Plazo de pago (días)', 'balance.paymentDays', 'number', 'min="0"') + field('CxP iniciales aún pendientes al cierre (0 si se pagan)', 'balance.openingPayablesRemaining', 'number', 'min="0"') : '') +
        ((a.receivablesMode === 'days' || a.payablesMode === 'days') ? field(`Días base (vacío: ${r.days ?? 'fechas pendientes'} días calendario)`, 'balance.days', 'number', 'min="1" max="36600"') : '') +
        ['otherCurrentAssets', 'otherNonCurrentAssets', 'otherCurrentLiabilities', 'longDebt', 'otherNonCurrentLiabilities'].map(key => field(P.balanceFields[key] + ' (vacío: constante)', 'balance.' + key, 'number', 'min="0"')).join('') +
        field('Aportes netos de capital, sin dividendos (0 si no hay)', 'balance.equityChange') + field('Retenidas históricas incluidas en patrimonio (detalle opcional)', 'balance.retainedOpening') + '</div>' +
        check('Confirmo que los rubros no registrados en el balance histórico no existen; su saldo es cero.', 'balance.absentZero') +
        '<p>Las políticas en días suponen operaciones uniformes. El remanente inicial se indica por separado para no duplicarlo. La depreciación reduce los activos una sola vez y ya está incluida en resultados. No se generan préstamos para cubrir diferencias.</p>';
    }
    const openSections = new Set(Array.from($('proforma-assumptions').querySelectorAll('details[open]')).map(d => d.dataset.section));
    $('proforma-assumptions').innerHTML = `<details data-section="costs"${openSections.has('costs') || settings.method === 'mixed' ? ' open' : ''}><summary>Costos, gastos y clasificación fija / variable</summary><p>Sin clasificación explícita, confirma el porcentaje fijo de cada costo y gasto (0 % = todo variable; 100 % = todo fijo). La parte variable cambia con las ventas; la fija conserva su importe para el período salvo ajuste. Revisa la duración de ambos períodos. Un importe sustituto aplica a ambas metodologías. Marca solo cuentas de depreciación de activos fijos, no amortizaciones de intangibles.</p><div class="proforma-table-scroll"><table class="statement-table proforma-input-table"><thead><tr><th>Cuenta</th><th>Histórico / ventas</th><th>Fijo histórico (%)</th><th>Ajuste fijo (%)</th><th>Importe sustituto</th><th>Depreciación</th></tr></thead><tbody>${costRows || '<tr><td colspan="6">No hay cuentas de resultados. Captúralas en Estados financieros.</td></tr>'}</tbody></table></div></details>` +
      `<details data-section="balance"${openSections.has('balance') || a.enabled ? ' open' : ''}><summary>Premisas del Balance General · método crítico</summary>${balance}</details>`;
  }
  function renderResults() {
    const r = P.analyze(company, settings), t = r.income, b = r.balance;
    const incomeTab = $('tab-income').getAttribute('aria-selected') === 'true', ready = incomeTab ? t.ready : b.ready;
    $('income-pending-message').hidden = t.ready;
    $('balance-pending-message').hidden = b.ready;
    set('paper-company', company.name.toUpperCase()); set('paper-period', r.period);
    set('paper-currency', 'Cifras en ' + C.fmt.unit(company)); set('summary-currency', C.fmt.unit(company));
    set('paper-badge-status', `${company.sample ? 'EJEMPLO · ' : ''}${ready ? 'PROYECCIÓN HISTÓRICA' : 'DATOS PENDIENTES'}`);
    set('proforma-data-source', ready ? 'Históricos conectados' : 'Faltan premisas');
    set('proforma-data-desc', `${settings.name}. Base: ${company.periods[settings.historicalPeriod] || 'pendiente'}. No requiere presupuesto maestro.`);
    set('summary-months', r.days === null ? '—' : `${r.days} días`); set('summary-cost-ratio', pct(r.history.ratios.costSales));
    set('proforma-footnote', 'Los históricos se conservan. Las premisas y resultados se recalculan por empresa; el Estado de Resultados no depende del balance proforma.');
    set('projection-save-status', dirty ? 'Cambios sin guardar' : company.params?.proforma?.id === settings.id ? 'Proyección guardada' : 'Proyección nueva sin guardar');
    $('save-projection').disabled = r.stale;
    $('income-proforma-body').innerHTML = results.map(([key, label]) => row(label, t[key], isTotal(key))).join('');
    set('proforma-net-margin', pct(t.margin)); set('proforma-margin-desc', 'Utilidad neta / ventas proyectadas. Ganancias retenidas = utilidad neta − dividendos totales.');
    $('proforma-comparison-body').innerHTML = results.map(([key, label]) => `<tr${isTotal(key) ? ' class="statement-subtotal"' : ''}><th scope="row">${esc(label)}</th><td>${esc(money(r.comparison.sales[key]))}</td><td>${esc(money(r.comparison.mixed[key]))}</td></tr>`).join('');
    const calculations = t.rows.map(line => `<tr><th scope="row">${esc(line.label)}<small>${esc(line.formula)}</small></th><td>${esc(money(line.historical))}<small>${esc(pct(line.ratio))} de ventas</small></td><td>${esc(money(line.value))}${settings.method === 'mixed' && ['costSales', 'opex'].includes(line.category) ? `<small>Parte fija: ${esc(money(line.fixedValue))}</small>` : ''}</td></tr>`).join('');
    $('proforma-calculations').innerHTML = `<p>Ventas históricas: ${esc(money(r.history.values.sales))}. Tasa fiscal aplicada: ${esc(pct(t.taxRate))}. Impuesto = ${settings.taxLoss === 'credit' ? 'UAI' : 'máximo(UAI, 0)'} × tasa. ${settings.dividendMode === 'percent' ? 'Dividendos = máximo(utilidad neta, 0) × porcentaje indicado.' : 'Dividendos: importe total indicado.'}</p><div class="proforma-table-scroll"><table class="statement-table"><thead><tr><th>Cálculo por cuenta</th><th>Histórico</th><th>Proyectado</th></tr></thead><tbody>${calculations}</tbody></table></div>` +
      (r.comparison.mixed.issues.length && settings.method !== 'mixed' ? `<details><summary>Comparación fija / variable pendiente</summary><ul>${[...new Set(r.comparison.mixed.issues)].map(text => `<li>${esc(presentIssue(text))}</li>`).join('')}</ul></details>` : '');
    $('balance-proforma-body').innerHTML = ['cash', 'receivables', 'inventory', 'otherCurrentAssets'].map(k => row(P.balanceFields[k], b.values[k])).join('') +
      row('Total activo corriente', b.currentAssets, true) + row('Activos fijos netos', b.values.fixed) + row('Otros activos no corrientes', b.values.otherNonCurrentAssets) + row('Total activos', b.assets, true) +
      ['payables', 'otherCurrentLiabilities', 'longDebt', 'otherNonCurrentLiabilities'].map(k => row(P.balanceFields[k], b.values[k])).join('') + row('Total pasivos', b.liabilities, true) +
      row('Patrimonio histórico', b.opening.equity) + row('Ganancias retenidas del período', t.retained) + row('Patrimonio proyectado', b.values.equity, true) +
      (settings.balance.retainedOpening !== null ? row('Detalle: ganancias retenidas acumuladas (ya incluidas)', b.retainedClosing) : '') +
      row('Total pasivos y patrimonio', b.funding, true) + row('Activos − pasivos − patrimonio', b.difference) +
      row('Financiamiento externo requerido', b.externalRequired, true) + row('Excedente de financiamiento', b.surplus, true);
    set('balance-equation-msg', !b.ready ? 'Completa las premisas y revisa los pendientes.' : b.externalRequired > 0 ? 'Existe financiamiento por cubrir. No se ha registrado ningún préstamo automático.' : b.surplus > 0 ? 'Existe excedente de financiamiento. No se ha agregado efectivo para cuadrar.' : 'Activos = pasivos + patrimonio con las premisas indicadas.');
    $('balance-calculations').innerHTML = `<details><summary>Cálculos del método crítico</summary>${b.calculations.map(item => `<p><strong>${esc(item.label)}: ${esc(money(item.value))}.</strong> ${esc(item.formula)}.</p>`).join('')}<p>Financiamiento requerido = máximo(activos − pasivos − patrimonio, 0). Excedente = máximo(pasivos + patrimonio − activos, 0). Depreciación incluida: ${esc(money(b.depreciation))}.</p></details>`;
    const leverage = L.analyze(company, 'proforma', r);
    for (const key of ['gao', 'gaf', 'gat']) {
      set('proforma-' + key + '-val', Number.isFinite(leverage[key]) ? leverage[key].toFixed(2) + ' veces' : '—');
      set('proforma-' + key + '-desc', leverage.unavailable ? 'Clasificación pendiente' : leverage[key] === null ? leverage.metricReasons[key] : key === 'gao' ? 'Contribución / utilidad operativa' : key === 'gaf' ? 'Utilidad operativa / UAI' : 'GAO × GAF');
    }
    set('proforma-leverage-note', (leverage.unavailable ? leverage.reason : [leverage.assumption, ...leverage.warnings].join(' ')) + (dirty ? ' Guarda la proyección para abrir estos datos en Apalancamiento.' : ''));
    const notices = [...new Set([...r.issues, ...t.issues, ...(incomeTab ? [] : b.issues)])];
    const labels = [...new Set(notices.map(issueLabel))];
    const detailsOpen = !!$('proforma-pending').querySelector('details[open]');
    $('proforma-pending').innerHTML = notices.length ? `<p><strong>Datos pendientes o por revisar:</strong> ${esc(labels.join(', '))}.</p><details${detailsOpen ? ' open' : ''}><summary>Ver detalle de pendientes y alertas (${notices.length})</summary><ul>${notices.map(text => `<li>${esc(presentIssue(text))}</li>`).join('')}</ul></details>` : '';
    set('paper-notes-text', `${company.sample ? 'CASO DE EJEMPLO. ' : ''}Base histórica ${company.periods[settings.historicalPeriod] || 'pendiente'}; ${settings.method === 'sales' ? 'porcentajes históricos sobre ventas proyectadas' : 'costos fijos y variables confirmados'}. Moneda y escala del histórico. Precisión completa en cálculos; presentación a dos decimales. Los datos faltantes se muestran como —. Las cuentas opcionales de otros ingresos ausentes no aportan al resultado. El mínimo de efectivo no es gasto. No se incluyen intereses sobre financiamiento externo todavía no contratado.`);
  }
  function handleInput(event) {
    const el = event.target;
    if (el.id === 'saved-projection') {
      const saved = (company.params?.proformaProjections || []).find(s => s.id === el.value);
      if (saved) { settings = P.settingsFor({ ...company, params: { ...company.params, proforma: saved } }); dirty = true; renderForms(); renderResults(); }
      return;
    }
    if (!el.dataset.setting && !el.dataset.line) return;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? el.value === '' ? null : Number(el.value) : el.value;
    if (el.dataset.line) {
      settings.lines[el.dataset.line] ||= {};
      settings.lines[el.dataset.line][el.dataset.lineField] = value;
    } else {
      const path = el.dataset.setting.split('.');
      if (path.length === 2) settings[path[0]][path[1]] = value; else settings[path[0]] = value;
      if (el.dataset.setting === 'historicalPeriod') settings.historicalEnd = P.historicalEnd(company.periods[value]);
    }
    dirty = true;
    if (el.tagName === 'SELECT' || el.dataset.setting === 'balance.enabled') renderForms();
    renderResults();
  }
  $('projection-controls').addEventListener('input', handleInput);
  $('proforma-assumptions').addEventListener('input', handleInput);
  $('save-projection').addEventListener('click', () => {
    if (!settings.name.trim()) { window.Finora.toast('Indica un nombre para la proyección.'); return; }
    try {
      const current = C.store.active();
      const saved = C.store.save(P.saveProjection(current, settings));
      dirty = !saved; renderResults();
      window.Finora.toast(saved ? 'Proyección guardada por separado del presupuesto.' : 'No fue posible guardar en el navegador; conserva esta pestaña abierta.');
    } catch (error) { window.Finora.toast(error.message); }
  });
  $('new-projection').addEventListener('click', () => { settings = P.newProjection(company); dirty = true; renderForms(); renderResults(); });
  $('print-report').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount($('case-bar'));
  C.store.subscribe(() => {
    const next = C.store.active(), signature = JSON.stringify([next.id, next.params?.proforma]);
    if (signature !== savedSignature) { settings = P.settingsFor(next); dirty = false; }
    company = next; savedSignature = signature; renderForms(); renderResults();
  });
  savedSignature = JSON.stringify([company.id, company.params?.proforma]);
  renderForms(); renderResults();
})();
