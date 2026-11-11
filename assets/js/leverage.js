/* Adaptador de apalancamiento para históricos y la proyección activa.
   Las razones y los resultados se calculan con el motor financiero compartido. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const C = node ? require('./casos.js') : root.FinoraCasos;
  const P = node ? require('./proforma.js') : root.FinoraProforma;
  const E = node ? require('./break-even.js') : root.FinoraBreakEven;
  const F = C.engine;
  const finite = Number.isFinite;
  function analyze(c, source = 'proforma', report) {
    const out = { source, companyName: c?.name || '', currency: c?.currency || '', scale: c?.scale || '',
      isSample: !!c?.sample, unavailable: true, reason: '', warnings: [], period: '', projectionName: '',
      sales: null, vc: null, cm: null, fc: null, ebit: null, interest: null, otherNet: null, ebt: null,
      gao: null, gaf: null, gat: null, variableRatio: null, metricReasons: {} };
    if (!c) { out.reason = 'Selecciona una empresa para analizar sus datos.'; return out; }
    let input, fixedCosts, fixedCostSales;
    if (source === 'proforma') {
      const r = report || P.analyze(c);
      out.projectionName = r.settings.name || 'Proyección';
      if (r.source === 'historical-proforma') {
        out.period = r.period;
        const t = r.income;
        if (!t.ready || !finite(t.fixedCosts) || !finite(t.fixedCostSales)) {
          out.reason = 'Para calcular apalancamiento, guarda el método de costos fijos y variables con su clasificación completa. Los importes totales sustituidos requieren desglosar nuevamente sus componentes.';
          out.warnings = [...r.issues, ...t.issues]; return out;
        }
        input = { sales: t.sales, costSales: t.costSales, operatingExpenses: t.operatingExpenses,
          interest: t.interest, taxes: t.taxes, otherIncome: t.otherIncome };
        fixedCosts = t.fixedCosts; fixedCostSales = t.fixedCostSales;
        out.assumption = 'Se utiliza la clasificación fija y variable confirmada en Estados Proforma.';
      } else {
      out.period = r.rows.length ? r.rows[0].month + ' a ' + r.rows.at(-1).month : '';
      if (r.stale) { out.reason = r.stages.configuration.issues.join(' '); return out; }
      if (r.mode === 'cash') {
        out.reason = 'La proyección activa es de caja independiente: sus cobros y pagos no constituyen un estado de resultados. Selecciona una proyección integrada en Planeación.';
        return out;
      }
      if (!r.stages.income.ready) {
        out.reason = 'Completa y guarda el estado de resultados del presupuesto para calcular el apalancamiento.';
        out.warnings = [...new Set(['configuration','sales','purchases','costs','expenses','income'].flatMap(k => r.stages[k].issues))];
        return out;
      }
      const t = r.totals;
      input = { sales: t.sales, costSales: t.costSales, operatingExpenses: t.operatingExpenses,
        interest: t.interest, taxes: t.taxes, otherIncome: t.otherIncome - t.otherExpenses };
      fixedCosts = t.operatingExpenses; fixedCostSales = 0;
      out.assumption = 'Sensibilidad: se supone que el costo de ventas varía con las ventas y que los gastos operativos, incluida la depreciación, permanecen fijos. Revisa esta clasificación para tu proyección.';
      }
    } else {
      const h = E.analyze(c), i = C.analyzeIncome(c).statements.current;
      out.period = c.periods?.current || 'Actual';
      if (!h.ok || !i) {
        out.reason = h.error || 'Completa el estado de resultados actual: ' + h.missing.join(', ') + '.';
        return out;
      }
      input = { sales: i.sales, costSales: i.costSales, operatingExpenses: i.operatingExpenses,
        interest: i.interest, taxes: i.taxes, otherIncome: i.otherIncome ?? 0 };
      fixedCosts = h.fixedOpex; fixedCostSales = h.fixedCostSales;
      out.assumption = 'Se utiliza la clasificación de costos fijos y variables de Punto de equilibrio.';
      if (h.doubtful) out.warnings.push('Revisa las cuentas con clasificación propuesta en Punto de equilibrio.');
    }
    try {
      // Esta vista mide UAI, no utilidad por acción: no incluye dividendos preferentes.
      const income = F.calculateIncome({ ...input, fixedCosts, fixedCostSales, preferredDividends: 0 });
      // El motor usa UAII menos costo financiero como denominador. Se netean los
      // otros resultados constantes para que ese denominador sea la UAI del informe.
      const op = F.calculateOperatingModel({ ...income, interest: income.interest - (income.otherIncome ?? 0),
        taxes: 0, preferredDividends: 0 });
      Object.assign(out, { unavailable: false, input: income, sales: income.sales,
        vc: income.sales - op.contribution, cm: op.contribution, fc: fixedCosts + fixedCostSales,
        ebit: income.ebit, interest: income.interest, otherNet: income.otherIncome ?? 0, ebt: income.ebt,
        variableRatio: income.sales > 0 ? (income.sales - op.contribution) / income.sales : null,
        gao: op.gao.value, gaf: op.gaf.value, gat: op.gat.value,
        metricReasons: { gao: 'No definido: la utilidad operativa es cero.',
          gaf: 'No definido: la utilidad antes de impuestos es cero.',
          gat: 'No definido: GAO o GAF no tienen base.' } });
      out.assumption += ' Intereses y otros ingresos/gastos netos se mantienen constantes. La sensibilidad no modifica la proyección guardada.';
      if (income.ebit < 0 || income.ebt < 0) out.warnings.push('Hay pérdidas: los grados conservan su signo; compara los cambios absolutos del escenario.');
      return out;
    } catch (error) { out.reason = String(error.message || error); return out; }
  }
  function scenario(base, deltaPercent) {
    if (!base || base.unavailable || !finite(deltaPercent) || deltaPercent < -100) return null;
    const i = base.input, factor = 1 + deltaPercent / 100;
    try {
      const next = F.calculateIncome({ ...i, sales: i.sales * factor,
        costSales: i.fixedCostSales + (i.costSales - i.fixedCostSales) * factor,
        operatingExpenses: i.fixedCosts + (i.operatingExpenses - i.fixedCosts) * factor });
      const changes = Object.fromEntries(['sales','ebit','ebt'].map(k => [k, F.compareValues(i[k], next[k])]));
      return { sales: next.sales, ebit: next.ebit, ebt: next.ebt, changes };
    } catch (_) { return null; }
  }
  const api = { analyze, scenario };
  if (node) module.exports = api; else root.FinoraLeverage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
