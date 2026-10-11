'use strict';

// Casos predefinidos: navegación visual, sin motor de cálculo financiero.
const leverageScenarios = {
  lower: { sales: '−10%', operating: '−24%', pretax: '−30%', widths: ['33.33%', '80%', '100%'], description: 'Con ventas de <strong>C$270,000</strong>, la utilidad operativa baja a <strong>C$38,000</strong> y la utilidad antes de impuestos a <strong>C$28,000</strong>.' },
  base: { sales: '0%', operating: '0%', pretax: '0%', widths: ['0%', '0%', '0%'], description: 'El caso base parte de ventas de <strong>C$300,000</strong>, utilidad operativa de <strong>C$50,000</strong> y utilidad antes de impuestos de <strong>C$40,000</strong>.' },
  higher: { sales: '+10%', operating: '+24%', pretax: '+30%', widths: ['33.33%', '80%', '100%'], description: 'Con ventas de <strong>C$330,000</strong>, la utilidad operativa pasa a <strong>C$62,000</strong> y la utilidad antes de impuestos a <strong>C$52,000</strong>.' }
};
function showLeverageScenario(key) {
  const scenario = leverageScenarios[key];
  document.querySelectorAll('[data-scenario]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.scenario === key)));
  ['sales', 'operating', 'pretax'].forEach((metric, index) => {
    document.getElementById(metric + '-change').textContent = scenario[metric];
    document.getElementById(metric + '-bar').style.width = scenario.widths[index];
  });
  document.querySelector('.sensitivity-chart').classList.toggle('is-negative', key === 'lower');
  document.getElementById('scenario-description').innerHTML = scenario.description;
}
document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => showLeverageScenario(button.dataset.scenario)));
document.getElementById('show-lower-scenario').addEventListener('click', () => {
  showLeverageScenario('lower');
  document.querySelector('[data-scenario="lower"]').focus();
});
const leverageDetails = {
  gao: ['Apalancamiento operativo · GAO', '<p><strong>GAO = margen de contribución / utilidad operativa</strong></p><p>(C$300,000 − C$180,000) / C$50,000 = <strong>2.40 veces</strong>.</p><p>En los supuestos de este ejemplo, un cambio del 10% en ventas produce un cambio del 24% en la utilidad operativa respecto al caso base.</p>'],
  gaf: ['Apalancamiento financiero · GAF', '<p><strong>GAF = utilidad operativa / (utilidad operativa − intereses)</strong></p><p>C$50,000 / (C$50,000 − C$10,000) = <strong>1.25 veces</strong>.</p><p>El costo de intereses amplifica la variación de la utilidad antes de impuestos. El ejemplo supone intereses constantes y no incorpora acciones preferentes.</p>'],
  gat: ['Apalancamiento total · GAT', '<p><strong>GAT = GAO × GAF</strong></p><p>2.40 × 1.25 = <strong>3.00 veces</strong>.</p><p>Un cambio del 10% en ventas se traduce en un cambio del 30% en la utilidad antes de impuestos bajo los supuestos del ejemplo.</p>']
};
document.querySelectorAll('[data-leverage-detail]').forEach((button) => {
  button.addEventListener('click', () => {
    const detail = leverageDetails[button.dataset.leverageDetail];
    window.Finora.openDialog(detail[0], detail[1] + '<p>Vista de diseño con datos de muestra todavía sin sincronizar entre módulos.</p>');
  });
});
document.getElementById('leverage-guide').addEventListener('click', () => {
  window.Finora.openDialog('Cómo leer el apalancamiento', '<p><strong>GAO</strong> relaciona el cambio porcentual en ventas con el cambio porcentual en utilidad operativa.</p><p><strong>GAF</strong> relaciona el cambio porcentual de la utilidad operativa con el de la utilidad antes de impuestos.</p><p><strong>GAT</strong> combina ambos efectos. Los tres indicadores corresponden al caso base.</p><p>Selecciona −10%, Base o +10% para comparar escenarios predefinidos. Se mantienen constantes los costos fijos, los intereses y el costo variable como proporción de ventas.</p><p>Los grados de apalancamiento expresan sensibilidad y no constituyen por sí solos una calificación del negocio.</p>');
});
