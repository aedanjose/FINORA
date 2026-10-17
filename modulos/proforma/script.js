'use strict';

(() => {
  const C = window.FinoraCasos;

  const tabs = Array.from(document.querySelectorAll('[data-report]'));
  const slider = document.getElementById('proforma-growth-slider');
  const numInput = document.getElementById('proforma-growth-input');
  const growthDisplay = document.getElementById('growth-display');
  const summaryGrowth = document.getElementById('summary-growth');

  function fmtMoney(val, c) {
    if (C?.fmt?.money) return C.fmt.money(val, c);
    const curr = c?.currency || 'C$';
    return `${curr} ${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function selectReport(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.querySelector(`#report-${item.dataset.report}`);
      if (panel) panel.hidden = !selected;
    });
    const titleEl = document.querySelector('#paper-title');
    if (titleEl) {
      titleEl.textContent = tab.dataset.report === 'income'
        ? 'Estado de resultados proforma'
        : 'Balance general proforma';
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectReport(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[(index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length];
      selectReport(next);
      next.focus();
    });
  });

  function getProjectedYear(c) {
    const cur = c?.periods?.current;
    if (!cur) return 'Próximo período';
    const num = parseInt(cur, 10);
    return Number.isFinite(num) && num > 1900 && num < 2100 ? `${num + 1} (Proyectado)` : `${cur} + 1`;
  }

  function render() {
    const c = C?.store ? C.store.active() : null;
    const growth = parseFloat(numInput?.value || slider?.value || '8');
    const growthRate = growth / 100;

    const sign = growth >= 0 ? `+${growth.toFixed(1)}%` : `${growth.toFixed(1)}%`;
    if (growthDisplay) growthDisplay.textContent = sign;
    if (summaryGrowth) summaryGrowth.textContent = sign;

    const curr = c?.currency || 'C$';
    const companyName = c?.name || 'Comercial Horizonte';
    const periodText = getProjectedYear(c);

    // Header info in paper
    const paperComp = document.getElementById('paper-company');
    const paperPeriod = document.getElementById('paper-period');
    const paperCurr = document.getElementById('paper-currency');
    const sumCurr = document.getElementById('summary-currency');
    const dataSourceBadge = document.getElementById('proforma-data-source');
    const dataDesc = document.getElementById('proforma-data-desc');

    if (paperComp) paperComp.textContent = companyName.toUpperCase();
    if (paperPeriod) paperPeriod.textContent = periodText;
    if (paperCurr) paperCurr.textContent = `Expresado en moneda oficial (${curr})`;
    if (sumCurr) sumCurr.textContent = curr;

    const income = c ? C.analyzeIncome(c) : null;
    const balance = c ? C.analyzeBalance(c) : null;
    const curInc = income?.statements?.current;
    const curBal = balance?.engine?.current;

    const hasRealIncome = curInc && curInc.sales && curInc.sales > 0;
    const hasRealBalance = curBal && curBal.assets && curBal.assets > 0;

    if (dataSourceBadge) {
      if (hasRealIncome || hasRealBalance) {
        dataSourceBadge.textContent = 'Datos conectados';
        dataSourceBadge.className = 'badge badge-green';
      } else {
        dataSourceBadge.textContent = 'Caso modelo';
        dataSourceBadge.className = 'badge badge-amber';
      }
    }
    if (dataDesc) {
      dataDesc.textContent = (hasRealIncome || hasRealBalance)
        ? `Proyección calculada sobre los estados reales de ${companyName}.`
        : 'Mostrando estructura modelo. Carga los estados en el módulo correspondiente para proyectar tu empresa.';
    }

    // Proforma Income calculation
    const baseSales = hasRealIncome ? curInc.sales : 185000;
    const baseCost = hasRealIncome ? (curInc.costSales ?? (baseSales * 0.5)) : 92500;
    const baseOpex = hasRealIncome ? (curInc.operatingExpenses ?? (baseSales * 0.25)) : 47500;
    const baseInterest = hasRealIncome ? (curInc.interest ?? 0) : 3000;
    const taxRate = hasRealIncome && curInc.taxRate ? curInc.taxRate : 0.30;

    const projSales = baseSales * (1 + growthRate);
    const costRatio = baseSales > 0 ? (baseCost / baseSales) : 0.5;
    const projCost = projSales * costRatio;
    const projGross = projSales - projCost;
    // Operating expenses: 50% fixed, 50% variable with sales
    const projOpex = (baseOpex * 0.5) + (baseOpex * 0.5 * (1 + growthRate));
    const projEbit = projGross - projOpex;
    const projInterest = baseInterest;
    const projEbt = projEbit - projInterest;
    const projTax = projEbt > 0 ? projEbt * taxRate : 0;
    const projNet = projEbt - projTax;
    const netMargin = projSales > 0 ? (projNet / projSales) * 100 : 0;

    // Render Income Statement Proforma
    const incomeBody = document.getElementById('income-proforma-body');
    if (incomeBody) {
      incomeBody.innerHTML = `
        <tr class="statement-group"><th colspan="2" scope="colgroup">INGRESOS OPERATIVOS</th></tr>
        <tr><td>Ingresos por ventas proyectados (${sign})</td><td class="table-number">${fmtMoney(projSales, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Ventas netas proyectadas</th><td class="table-number">${fmtMoney(projSales, c)}</td></tr>
        <tr class="statement-group"><th colspan="2" scope="colgroup">COSTOS Y GASTOS</th></tr>
        <tr><td>Costo de ventas estimado (${(costRatio * 100).toFixed(1)}%)</td><td class="table-number">− ${fmtMoney(projCost, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Utilidad bruta proyectada</th><td class="table-number">${fmtMoney(projGross, c)}</td></tr>
        <tr><td>Gastos de operación (administrativos y ventas)</td><td class="table-number">− ${fmtMoney(projOpex, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Utilidad operativa proyectada (UAII)</th><td class="table-number">${fmtMoney(projEbit, c)}</td></tr>
        <tr><td>Gastos financieros / Intereses pactados</td><td class="table-number">− ${fmtMoney(projInterest, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Utilidad antes de impuestos (UAI)</th><td class="table-number">${fmtMoney(projEbt, c)}</td></tr>
        <tr><td>Impuestos sobre la renta estimados (${(taxRate * 100).toFixed(0)}%)</td><td class="table-number">− ${fmtMoney(projTax, c)}</td></tr>
        <tr class="statement-total"><th scope="row">Utilidad neta proforma</th><td class="table-number" style="font-weight:700; color:var(--blue);">${fmtMoney(projNet, c)}</td></tr>
      `;
    }

    const marginEl = document.getElementById('proforma-net-margin');
    const marginDesc = document.getElementById('proforma-margin-desc');
    if (marginEl) marginEl.textContent = `${netMargin.toFixed(1)}%`;
    if (marginDesc) {
      marginDesc.textContent = `De cada 100 en ingresos proyectados, ${netMargin.toFixed(2)} representarán utilidad neta esperada.`;
    }

    // Proforma Balance calculation
    const baseCash = hasRealBalance ? (curBal.cash || curBal.currentAssets * 0.25 || 95000) : 95000;
    const baseRec = hasRealBalance ? (curBal.receivables || curBal.currentAssets * 0.35 || 68000) : 68000;
    const baseInv = hasRealBalance ? (curBal.inventory || curBal.currentAssets * 0.40 || 112000) : 112000;
    const baseFixed = hasRealBalance ? (curBal.fixed || curBal.nonCurrentAssets || 225000) : 225000;

    const projCash = baseCash * (1 + growthRate * 0.8);
    const projRec = baseRec * (1 + growthRate);
    const projInv = baseInv * (1 + growthRate);
    const projFixed = baseFixed; // Fixed assets constant unless explicit CapEx
    const totalCurrentAssets = projCash + projRec + projInv;
    const totalAssets = totalCurrentAssets + projFixed;

    const basePay = hasRealBalance ? (curBal.payables || curBal.currentLiabilities * 0.6 || 75000) : 75000;
    const baseLongDebt = hasRealBalance ? (curBal.longDebt || curBal.nonCurrentLiabilities || 125000) : 125000;
    const baseEquity = hasRealBalance ? (curBal.equity || 300000) : 300000;

    const projPay = basePay * (1 + growthRate);
    const projLongDebt = baseLongDebt;
    const totalLiab = projPay + projLongDebt;

    const retainedChange = projNet;
    const projEquity = baseEquity + retainedChange;
    const totalFunding = totalLiab + projEquity;
    const fer = totalAssets - totalFunding; // Financiamiento Externo Requerido

    const balanceBody = document.getElementById('balance-proforma-body');
    if (balanceBody) {
      balanceBody.innerHTML = `
        <tr class="statement-group"><th colspan="2" scope="colgroup">ACTIVOS CIRCULANTES</th></tr>
        <tr><td>Efectivo y equivalentes de caja</td><td class="table-number">${fmtMoney(projCash, c)}</td></tr>
        <tr><td>Cuentas por cobrar a clientes</td><td class="table-number">${fmtMoney(projRec, c)}</td></tr>
        <tr><td>Inventarios de existencias</td><td class="table-number">${fmtMoney(projInv, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Total activo circulante proyectado</th><td class="table-number">${fmtMoney(totalCurrentAssets, c)}</td></tr>
        <tr class="statement-group"><th colspan="2" scope="colgroup">ACTIVOS NO CIRCULANTES</th></tr>
        <tr><td>Propiedades, planta y equipo (neto de depreciación)</td><td class="table-number">${fmtMoney(projFixed, c)}</td></tr>
        <tr class="statement-total"><th scope="row">Total de activos proyectados</th><td class="table-number" style="font-weight:700;">${fmtMoney(totalAssets, c)}</td></tr>

        <tr class="statement-group"><th colspan="2" scope="colgroup">PASIVOS</th></tr>
        <tr><td>Cuentas por pagar a proveedores (espontáneo)</td><td class="table-number">${fmtMoney(projPay, c)}</td></tr>
        <tr><td>Deuda financiera y pasivos de largo plazo</td><td class="table-number">${fmtMoney(projLongDebt, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Total de pasivos proyectados</th><td class="table-number">${fmtMoney(totalLiab, c)}</td></tr>

        <tr class="statement-group"><th colspan="2" scope="colgroup">PATRIMONIO</th></tr>
        <tr><td>Capital social aportado</td><td class="table-number">${fmtMoney(baseEquity, c)}</td></tr>
        <tr><td>Resultado acumulado / Utilidad proyectada del período</td><td class="table-number">${fmtMoney(retainedChange, c)}</td></tr>
        <tr class="statement-subtotal"><th scope="row">Total patrimonio proyectado</th><td class="table-number">${fmtMoney(projEquity, c)}</td></tr>

        <tr class="statement-total"><th scope="row">Total pasivos y patrimonio</th><td class="table-number" style="font-weight:700;">${fmtMoney(totalFunding, c)}</td></tr>
        ${Math.abs(fer) > 1 ? `
        <tr style="background: ${fer > 0 ? '#fff8e6' : '#eaf7f2'};">
          <th scope="row" style="font-weight:600; padding: 10px 14px;">${fer > 0 ? 'Financiamiento Externo Requerido (FER / Fondos a fondear)' : 'Superávit de tesorería proyectado'}</th>
          <td class="table-number" style="font-weight:700; color: ${fer > 0 ? 'var(--amber)' : 'var(--green)'};">${fmtMoney(Math.abs(fer), c)}</td>
        </tr>` : ''}
      `;
    }

    const eqMsg = document.getElementById('balance-equation-msg');
    const eqBox = document.getElementById('balance-highlight-box');
    if (eqMsg && eqBox) {
      if (Math.abs(fer) <= 10) {
        eqMsg.textContent = 'La ecuación contable proforma se encuentra perfectamente equilibrada (Activo = Pasivo + Patrimonio).';
        eqBox.style.background = '#eaf7f2';
      } else if (fer > 0) {
        eqMsg.textContent = `Se requiere financiamiento adicional de ${fmtMoney(fer, c)} para sostener el crecimiento en ventas e inventarios sin desbalancear la tesorería.`;
        eqBox.style.background = '#fff8e6';
      } else {
        eqMsg.textContent = `El crecimiento proyectado genera un superávit de efectivo de ${fmtMoney(Math.abs(fer), c)} disponible para reinversión o dividendos.`;
        eqBox.style.background = '#eaf7f2';
      }
    }

    if (window.Finora?.hydrateIcons) window.Finora.hydrateIcons();
  }

  // Slider & Number input sync
  if (slider && numInput) {
    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      render();
    });
    numInput.addEventListener('input', () => {
      slider.value = numInput.value;
      render();
    });
  }

  document.querySelector('#print-report')?.addEventListener('click', () => window.print());

  function init() {
    const barEl = document.getElementById('case-bar');
    if (barEl && window.FinoraCaseBar) {
      window.FinoraCaseBar.mount(barEl);
    }
    if (C?.store) {
      C.store.subscribe(render);
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
