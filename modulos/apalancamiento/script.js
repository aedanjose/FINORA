'use strict';

(() => {
  const C = window.FinoraCasos;
  let activeData = null;
  let activeScenario = 'base';

  function fmtMoney(amount, c) {
    if (C?.fmt?.money) return C.fmt.money(amount, c);
    const curr = c?.currency || 'C$';
    return `${curr} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getBaseFigures(c) {
    if (!c || !C) {
      return getSampleFigures();
    }
    const income = C.analyzeIncome(c);
    const cur = income?.statements?.current;
    if (!cur || !cur.sales || cur.sales <= 0 || cur.ebit === null || cur.ebit === undefined) {
      return { isSample: true, ...getSampleFigures(c) };
    }

    const sales = cur.sales;
    const vc = cur.costSales ?? (sales * 0.6);
    const cm = sales - vc;
    const ebit = cur.ebit;
    const fc = Math.max(0, cm - ebit);
    const interest = Math.abs(cur.interest ?? 0);
    const ebt = cur.ebt ?? (ebit - interest);

    const gao = ebit > 0 ? (cm / ebit) : null;
    const gaf = (ebt > 0 && ebit > 0) ? (ebit / ebt) : null;
    const gat = (gao !== null && gaf !== null) ? (gao * gaf) : (ebt > 0 ? (cm / ebt) : null);

    return {
      isSample: false,
      companyName: c.name,
      currency: c.currency || 'C$',
      period: c.periods?.current || 'Actual',
      sales,
      vc,
      cm,
      fc,
      ebit,
      interest,
      ebt,
      gao: gao && Number.isFinite(gao) ? gao : 2.4,
      gaf: gaf && Number.isFinite(gaf) ? gaf : 1.25,
      gat: gat && Number.isFinite(gat) ? gat : 3.0
    };
  }

  function getSampleFigures(c) {
    const curr = c?.currency || 'C$';
    return {
      isSample: true,
      companyName: c?.name || 'Ejemplo ilustrativo',
      currency: curr,
      period: c?.periods?.current || 'Período muestra',
      sales: 300000,
      vc: 180000,
      cm: 120000,
      fc: 70000,
      ebit: 50000,
      interest: 10000,
      ebt: 40000,
      gao: 2.40,
      gaf: 1.25,
      gat: 3.00
    };
  }

  function calculateScenario(base, deltaPercent) {
    const delta = deltaPercent / 100;
    const newSales = base.sales * (1 + delta);
    const vcRatio = base.sales > 0 ? (base.vc / base.sales) : 0.6;
    const newVc = newSales * vcRatio;
    const newCm = newSales - newVc;
    const newEbit = newCm - base.fc;
    const newEbt = newEbit - base.interest;

    const salesChangePct = deltaPercent;
    const ebitChangePct = base.ebit !== 0 ? ((newEbit - base.ebit) / Math.abs(base.ebit)) * 100 : 0;
    const ebtChangePct = base.ebt !== 0 ? ((newEbt - base.ebt) / Math.abs(base.ebt)) * 100 : 0;

    const sign = v => (v > 0 ? `+${v.toFixed(1)}%` : v < 0 ? `−${Math.abs(v).toFixed(1)}%` : '0%');
    const widthOf = pct => `${Math.min(100, Math.max(0, Math.abs(pct) * 2.8)).toFixed(1)}%`;

    return {
      salesStr: sign(salesChangePct),
      operatingStr: sign(ebitChangePct),
      pretaxStr: sign(ebtChangePct),
      salesWidth: deltaPercent === 0 ? '0%' : '33.3%',
      operatingWidth: deltaPercent === 0 ? '0%' : widthOf(ebitChangePct),
      pretaxWidth: deltaPercent === 0 ? '0%' : widthOf(ebtChangePct),
      newSales,
      newEbit,
      newEbt,
      description: deltaPercent === 0
        ? `El caso base parte de ventas de <strong>${fmtMoney(base.sales, base)}</strong>, utilidad operativa de <strong>${fmtMoney(base.ebit, base)}</strong> y utilidad antes de impuestos de <strong>${fmtMoney(base.ebt, base)}</strong>.`
        : `Con una variación en ventas a <strong>${fmtMoney(newSales, base)}</strong> (${sign(salesChangePct)}), la utilidad operativa cambia a <strong>${fmtMoney(newEbit, base)}</strong> (${sign(ebitChangePct)}) y la utilidad antes de impuestos a <strong>${fmtMoney(newEbt, base)}</strong> (${sign(ebtChangePct)}).`
    };
  }

  function render() {
    const c = C?.store ? C.store.active() : null;
    activeData = getBaseFigures(c);

    // Context & Currency
    const badgeEl = document.getElementById('leverage-mode-badge');
    const periodEl = document.getElementById('leverage-period-label');
    const currEl = document.getElementById('leverage-currency-caption');
    const emptyNotice = document.getElementById('leverage-empty-notice');

    if (badgeEl) {
      badgeEl.textContent = activeData.isSample ? 'Ejemplo ilustrativo' : `Empresa: ${activeData.companyName}`;
      badgeEl.className = activeData.isSample ? 'badge badge-amber' : 'badge badge-blue';
    }
    if (periodEl) {
      periodEl.textContent = `Período: ${activeData.period}`;
    }
    if (currEl) {
      currEl.textContent = `Moneda: ${activeData.currency}`;
    }

    if (emptyNotice) {
      if (activeData.isSample && c && !c.sample) {
        emptyNotice.style.display = 'block';
        emptyNotice.innerHTML = `<strong>${c.name}</strong> aún no tiene capturado un Estado de Resultados en el período actual. Mostrando un escenario de muestra para explorar los indicadores. Puedes <a href="../estados-financieros/index.html" class="link">capturar el Estado de Resultados</a> para calcular con datos reales.`;
      } else {
        emptyNotice.style.display = 'none';
      }
    }

    // Leverage cards values
    const gaoEl = document.getElementById('gao-val');
    const gafEl = document.getElementById('gaf-val');
    const gatEl = document.getElementById('gat-val');
    if (gaoEl) gaoEl.innerHTML = `${activeData.gao.toFixed(2)}<span> veces</span>`;
    if (gafEl) gafEl.innerHTML = `${activeData.gaf.toFixed(2)}<span> veces</span>`;
    if (gatEl) gatEl.innerHTML = `${activeData.gat.toFixed(2)}<span> veces</span>`;

    const gaoDesc = document.getElementById('gao-desc');
    const gafDesc = document.getElementById('gaf-desc');
    const gatDesc = document.getElementById('gat-desc');
    if (gaoDesc) gaoDesc.textContent = `Por cada 1% de cambio en ventas, la utilidad operativa varía ${(activeData.gao).toFixed(2)}%.`;
    if (gafDesc) gafDesc.textContent = `Por cada 1% de cambio en utilidad operativa, la utilidad antes de impuestos varía ${(activeData.gaf).toFixed(2)}%.`;
    if (gatDesc) gatDesc.textContent = `Por cada 1% de cambio en ventas, la utilidad antes de impuestos varía ${(activeData.gat).toFixed(2)}%.`;

    const gaoFormula = document.getElementById('gao-formula');
    const gafFormula = document.getElementById('gaf-formula');
    const gatFormula = document.getElementById('gat-formula');
    if (gaoFormula) gaoFormula.textContent = `${fmtMoney(activeData.cm, activeData)} / ${fmtMoney(activeData.ebit, activeData)}`;
    if (gafFormula) gafFormula.textContent = `${fmtMoney(activeData.ebit, activeData)} / ${fmtMoney(activeData.ebt, activeData)}`;
    if (gatFormula) gatFormula.textContent = `${activeData.gao.toFixed(2)} × ${activeData.gaf.toFixed(2)}`;

    // Breakdown list
    const vcRatio = activeData.sales > 0 ? (activeData.vc / activeData.sales * 100).toFixed(1) : '60.0';
    const bdSales = document.getElementById('bd-sales');
    const bdVcRate = document.getElementById('bd-vc-rate');
    const bdVc = document.getElementById('bd-vc');
    const bdCm = document.getElementById('bd-cm');
    const bdFc = document.getElementById('bd-fc');
    const bdEbit = document.getElementById('bd-ebit');
    const bdInterest = document.getElementById('bd-interest');
    const bdEbt = document.getElementById('bd-ebt');

    if (bdSales) bdSales.textContent = fmtMoney(activeData.sales, activeData);
    if (bdVcRate) bdVcRate.textContent = `${vcRatio}% de ventas`;
    if (bdVc) bdVc.textContent = `− ${fmtMoney(activeData.vc, activeData)}`;
    if (bdCm) bdCm.textContent = fmtMoney(activeData.cm, activeData);
    if (bdFc) bdFc.textContent = `− ${fmtMoney(activeData.fc, activeData)}`;
    if (bdEbit) bdEbit.textContent = fmtMoney(activeData.ebit, activeData);
    if (bdInterest) bdInterest.textContent = `− ${fmtMoney(activeData.interest, activeData)}`;
    if (bdEbt) bdEbt.textContent = fmtMoney(activeData.ebt, activeData);

    // Apply active scenario
    applyScenario(activeScenario);
  }

  function applyScenario(key) {
    activeScenario = key;
    if (!activeData) return;
    const delta = key === 'lower' ? -10 : key === 'higher' ? 10 : 0;
    const res = calculateScenario(activeData, delta);

    document.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.scenario === key));
    });

    const salesChange = document.getElementById('sales-change');
    const operChange = document.getElementById('operating-change');
    const pretaxChange = document.getElementById('pretax-change');
    if (salesChange) salesChange.textContent = res.salesStr;
    if (operChange) operChange.textContent = res.operatingStr;
    if (pretaxChange) pretaxChange.textContent = res.pretaxStr;

    const salesBar = document.getElementById('sales-bar');
    const operBar = document.getElementById('operating-bar');
    const pretaxBar = document.getElementById('pretax-bar');
    if (salesBar) salesBar.style.width = res.salesWidth;
    if (operBar) operBar.style.width = res.operatingWidth;
    if (pretaxBar) pretaxBar.style.width = res.pretaxWidth;

    const chartEl = document.querySelector('.sensitivity-chart');
    if (chartEl) chartEl.classList.toggle('is-negative', key === 'lower');

    const descEl = document.getElementById('scenario-description');
    if (descEl) descEl.innerHTML = res.description;
  }

  // Event Listeners
  document.querySelectorAll('[data-scenario]').forEach(btn => {
    btn.addEventListener('click', () => applyScenario(btn.dataset.scenario));
  });

  document.getElementById('show-lower-scenario')?.addEventListener('click', () => {
    applyScenario('lower');
    document.querySelector('[data-scenario="lower"]')?.focus();
  });

  document.querySelectorAll('[data-leverage-detail]').forEach(button => {
    button.addEventListener('click', () => {
      if (!activeData) return;
      const type = button.dataset.leverageDetail;
      if (type === 'gao') {
        window.Finora.openDialog(
          'Apalancamiento operativo · GAO',
          `<p><strong>GAO = Margen de Contribución / Utilidad Operativa (UAII)</strong></p>
           <p>(${fmtMoney(activeData.sales, activeData)} − ${fmtMoney(activeData.vc, activeData)}) / ${fmtMoney(activeData.ebit, activeData)} = <strong>${activeData.gao.toFixed(2)} veces</strong>.</p>
           <p>Significa que ante un aumento o disminución del 10% en ingresos por ventas, la utilidad operativa responderá con una variación de <strong>${(activeData.gao * 10).toFixed(1)}%</strong>.</p>`
        );
      } else if (type === 'gaf') {
        window.Finora.openDialog(
          'Apalancamiento financiero · GAF',
          `<p><strong>GAF = Utilidad Operativa / Utilidad antes de impuestos</strong></p>
           <p>${fmtMoney(activeData.ebit, activeData)} / (${fmtMoney(activeData.ebit, activeData)} − ${fmtMoney(activeData.interest, activeData)}) = <strong>${activeData.gaf.toFixed(2)} veces</strong>.</p>
           <p>El costo fijo financiero de intereses amplifica la sensibilidad de la utilidad antes de impuestos frente a cambios en la operación.</p>`
        );
      } else if (type === 'gat') {
        window.Finora.openDialog(
          'Apalancamiento total · GAT',
          `<p><strong>GAT = GAO × GAF = Margen de Contribución / Utilidad antes de impuestos</strong></p>
           <p>${activeData.gao.toFixed(2)} × ${activeData.gaf.toFixed(2)} = <strong>${activeData.gat.toFixed(2)} veces</strong>.</p>
           <p>Un cambio de 10% en el volumen de ventas provocará una variación del <strong>${(activeData.gat * 10).toFixed(1)}%</strong> en la utilidad antes de impuestos.</p>`
        );
      }
    });
  });

  document.getElementById('leverage-guide')?.addEventListener('click', () => {
    window.Finora.openDialog(
      'Cómo leer el apalancamiento',
      `<p><strong>GAO</strong> (Operativo): Mide cómo impacta la estructura de costos fijos operativos sobre la ganancia antes de intereses e impuestos.</p>
       <p><strong>GAF</strong> (Financiero): Mide el impacto del endeudamiento y los intereses financieros sobre la utilidad antes de impuestos.</p>
       <p><strong>GAT</strong> (Total): Multiplica ambos efectos para medir la sensibilidad integral desde las ventas hasta la última línea de utilidad.</p>
       <p class="note">Selecciona −10%, Base o +10% en los controles de sensibilidad para observar los efectos dinámicos en tiempo real.</p>`
    );
  });

  // Init Case Bar and reactivity
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
