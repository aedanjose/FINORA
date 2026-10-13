/* Punto de equilibrio con los estados de la empresa activa.
   Propone si cada costo es fijo o variable (por su nombre y su categoría) y calcula con el motor:
   calculateIncome + calculateOperatingModel. Aquí no hay fórmulas de equilibrio propias. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./casos.js') : root.FinoraCasos;
  const F = C.engine;
  const SIDES = ['previous', 'current'];
  const COST_CATEGORIES = { costSales: 'Costo de ventas', opex: 'Gasto operativo' };
  const has = v => typeof v === 'number' && Number.isFinite(v);
  const norm = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // ---------- Fijo o variable ----------
  const FIXED = /(alquiler|arrendamiento|renta del local|sueldo|salario|planilla|nomina|deprecia|amortiza|seguro|vigilancia|administra|generales|servicios basicos|energia|agua|telefono|internet|mantenimiento|honorarios|licencia|fiscal|cuota|suscripcion)/;
  const VARIABLE = /(comision|flete|transporte|empaque|embalaje|materia prima|materiales|mercaderia|insumo|combustible|regalia|mano de obra directa|costo de (ventas|bienes|lo vendido|produccion)|costo de mercancia|tarjeta|^ventas?\b|de ventas?\b|venta)/;

  // Propuesta para una cuenta de costo. «doubtful» marca las que conviene revisar.
  function proposeBehavior(account) {
    const n = norm(account?.name), category = account?.category;
    const fixedHit = FIXED.exec(n), variableHit = VARIABLE.exec(n);
    if (fixedHit && variableHit) return { behavior: 'fixed', doubtful: true, reason: 'Mezcla conceptos fijos y variables; se propone fijo. Revísalo o divídelo en dos cuentas.' };
    if (fixedHit) return { behavior: 'fixed', doubtful: false, reason: `«${fixedHit[1]}» suele ser un costo fijo: no cambia con lo vendido en el corto plazo.` };
    if (variableHit) {
      const selling = /venta/.test(variableHit[0]) && category === 'opex';
      return { behavior: 'variable', doubtful: selling, reason: selling ? 'Los gastos de venta suelen crecer con lo vendido; se propone variable. Confírmalo.' : 'Cambia en proporción a lo vendido o producido: costo variable.' };
    }
    return category === 'costSales'
      ? { behavior: 'variable', doubtful: false, reason: 'El costo de ventas suele variar con lo vendido.' }
      : { behavior: 'fixed', doubtful: true, reason: 'Gasto operativo sin palabras clave: se propone fijo. Confírmalo.' };
  }

  // Cuentas de costo con su comportamiento: el elegido por el usuario o la propuesta.
  function costLines(c) {
    return (c.income || []).filter(a => COST_CATEGORIES[a.category]).map(a => {
      const proposal = proposeBehavior(a);
      const chosen = a.behavior === 'fixed' || a.behavior === 'variable';
      return { id: a.id, name: String(a.name || '').trim() || 'Cuenta sin nombre', category: a.category, categoryLabel: COST_CATEGORIES[a.category], sign: a.sign ?? 1,
        amounts: { previous: a.amounts?.previous ?? null, current: a.amounts?.current ?? null },
        behavior: chosen ? a.behavior : proposal.behavior, chosen, proposal, doubtful: !chosen && proposal.doubtful };
    });
  }

  const settingsFor = c => ({ unitPrice: has(c.breakEven?.unitPrice) && c.breakEven.unitPrice > 0 ? c.breakEven.unitPrice : null });

  // ---------- Cálculo de un período ----------
  function analyze(c, side = 'current') {
    const income = c.income || [];
    const out = { side, period: c.periods?.[side] ?? side, missing: [], error: null, ok: false };
    if (!income.some(a => has(a.amounts?.[side]))) { out.missing.push('el estado de resultados de este año'); return out; }
    const informed = category => income.some(a => a.category === category && has(a.amounts?.[side]));
    [['sales', 'ventas'], ['costSales', 'costo de ventas'], ['opex', 'gastos operativos'], ['interest', 'gastos financieros (escribe 0 si no hay)']]
      .forEach(([category, label]) => { if (!informed(category)) out.missing.push(label); });
    if (!informed('taxes') && !informed('taxRate')) out.missing.push('impuestos (monto o tasa)');
    if (out.missing.length) return out;

    const lines = costLines(c);
    const fixedOf = category => lines.filter(l => l.category === category && l.behavior === 'fixed').reduce((t, l) => t + (has(l.amounts[side]) ? l.sign * l.amounts[side] : 0), 0);
    const accounts = F.incomeAccountsForPeriod(income, side).filter(a => !['fixedCosts', 'fixedCostSales'].includes(a.category));
    const fixedOpex = fixedOf('opex'), fixedCostSales = fixedOf('costSales');
    accounts.push({ name: 'Costos fijos operativos', category: 'fixedCosts', sign: 1, amount: fixedOpex });
    accounts.push({ name: 'Costos fijos del costo de ventas', category: 'fixedCostSales', sign: 1, amount: fixedCostSales });
    if (!accounts.some(a => a.category === 'preferred' && a.amount !== null)) accounts.push({ name: 'Dividendos preferentes', category: 'preferred', sign: 1, amount: 0 });

    let i, op;
    try { i = F.calculateIncome({ accounts }); op = F.calculateOperatingModel(i); }
    catch (error) { out.error = String(error?.message || error); return out; }
    if (!op) { out.error = 'No se pudo separar los costos fijos.'; return out; }

    const sales = i.sales, contribution = op.contribution, fixed = fixedOpex + fixedCostSales;
    const breakEven = op.breakEvenSales.value;
    Object.assign(out, {
      ok: true, sales, contribution, variableCosts: sales - contribution, fixedCosts: fixed, fixedOpex, fixedCostSales,
      contributionRatio: sales > 0 ? contribution / sales : null, ebit: i.ebit,
      breakEvenSales: breakEven, breakEvenReason: breakEven === null ? op.breakEvenSales.reason : '',
      safetyAmount: breakEven === null ? null : sales - breakEven, safetyMargin: breakEven === null || !(sales > 0) ? null : (sales - breakEven) / sales,
      gao: op.gao, gaf: op.gaf, gat: op.gat, assumption: op.assumption, costSalesFullyVariable: op.costSalesFullyVariable,
      doubtful: lines.filter(l => l.doubtful && has(l.amounts[side])).length
    });
    // En unidades, solo si el usuario indica el precio de venta por unidad.
    const { unitPrice } = settingsFor(c);
    if (unitPrice) {
      const units = sales / unitPrice;
      out.units = { price: unitPrice, sold: units, variableCostPerUnit: units > 0 ? out.variableCosts / units : null, breakEven: breakEven === null ? null : breakEven / unitPrice };
      out.units.breakEvenWhole = out.units.breakEven === null ? null : Math.ceil(out.units.breakEven - 1e-9);
    }
    return out;
  }
  const analyzeBoth = c => Object.fromEntries(SIDES.map(side => [side, analyze(c, side)]));

  const api = { COST_CATEGORIES, proposeBehavior, costLines, settingsFor, analyze, analyzeBoth };
  if (node) module.exports = api; else root.FinoraBreakEven = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
