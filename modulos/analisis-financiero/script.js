'use strict';

// Interacciones de presentación. Los importes son ejemplos estáticos.
const analysisTabs = Array.from(document.querySelectorAll('[data-analysis-tab]'));
function selectAnalysisTab(tab) {
  analysisTabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
}
analysisTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectAnalysisTab(tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % analysisTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + analysisTabs.length) % analysisTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = analysisTabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectAnalysisTab(analysisTabs[next]);
      analysisTabs[next].focus();
    }
  });
});
const analysisDetails = {
  horizontal: ['Cómo leer el análisis horizontal', '<p>Compara una misma cuenta entre dos períodos. En este ejemplo, las ventas pasan de C$218,000 a C$245,000.</p><p><strong>(C$245,000 − C$218,000) / C$218,000 × 100 = 12.4%</strong></p><p>La tabla muestra valores de muestra. Un aumento de una cuenta no implica por sí solo un mejor resultado; importa si corresponde a ingresos, costos o gastos.</p>'],
  liquidez: ['Razón corriente · ejemplo', '<p><strong>C$111,000 / C$60,000 = 1.85 veces</strong></p><p>Por cada córdoba de pasivo corriente, este ejemplo presenta C$1.85 en activos corrientes. Es una medida de cobertura contable; no equivale a efectivo disponible inmediato.</p>'],
  deuda: ['Razón de deuda · ejemplo', '<p><strong>C$140,000 / C$300,000 × 100 = 46.7%</strong></p><p>En la muestra, los pasivos representan el 46.7% del activo total. El valor se interpreta junto con plazos, costos de financiamiento y capacidad de pago.</p>'],
  roa: ['Rendimiento del activo · ejemplo', '<p><strong>C$31,430 / C$300,000 × 100 = 10.5%</strong></p><p>Se utiliza la utilidad neta del período y el activo al cierre. En una implementación completa puede utilizarse el activo promedio cuando la información esté disponible.</p>'],
  rotacion: ['Rotación de activos · ejemplo', '<p><strong>C$245,000 / C$300,000 = 0.82 veces</strong></p><p>El ejemplo genera cerca de C$0.82 de ventas por cada córdoba de activo al cierre durante el período analizado.</p>'],
  dupont: ['Descomposición DuPont · ejemplo', '<p><strong>ROE = margen neto × rotación de activos × multiplicador de capital</strong></p><p>(C$31,430 / C$245,000) × (C$245,000 / C$300,000) × (C$300,000 / C$160,000) = <strong>19.64%</strong>.</p><p>Los componentes visibles están redondeados. Este es un esquema de diseño con saldos ilustrativos al cierre.</p>']
};
document.querySelectorAll('[data-detail]').forEach((button) => {
  button.addEventListener('click', () => {
    const detail = analysisDetails[button.dataset.detail];
    window.Finora.openDialog(detail[0], detail[1]);
  });
});
document.getElementById('analysis-report').addEventListener('click', () => {
  window.Finora.openDialog('Vista previa · análisis financiero', '<p class="demo-label">Informe ilustrativo · 2025</p><p><strong>Ingresos:</strong> C$245,000<br><strong>Utilidad neta:</strong> C$31,430<br><strong>Margen neto:</strong> 12.8%<br><strong>ROE:</strong> 19.6%</p><p>Los ingresos crecen 12.4% respecto a 2024 y la utilidad neta crece 27.6% en los datos de muestra.</p><p>Esta vista permite revisar el diseño del informe. La exportación a archivo se implementará en la etapa funcional.</p>');
});
