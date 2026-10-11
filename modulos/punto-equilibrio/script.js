'use strict';

// El prototipo muestra un escenario estático; aún no procesa datos del usuario.
document.getElementById('show-break-even-formula').addEventListener('click', () => {
  window.Finora.openDialog('Punto de equilibrio · cálculo ilustrativo', '<p>El margen de contribución de cada unidad cubre primero los costos fijos.</p><p><strong>Contribución unitaria</strong><br>C$80 − C$48 = C$32</p><p><strong>Equilibrio en unidades</strong><br>C$80,000 / C$32 = 2,500 unidades</p><p><strong>Equilibrio en ventas</strong><br>2,500 × C$80 = C$200,000</p><p><strong>Margen de seguridad</strong><br>(3,500 − 2,500) / 3,500 × 100 = 28.6%</p><p>Estas cifras son datos de muestra todavía sin sincronizar entre módulos. El cálculo interactivo se implementará en la etapa funcional.</p>');
});
document.getElementById('review-assumptions').addEventListener('click', () => {
  window.Finora.openDialog('Supuestos y costos · ejemplo mensual', '<p><strong>Costos fijos: C$80,000</strong></p><ul><li>Alquiler: C$25,000</li><li>Salarios fijos: C$40,000</li><li>Servicios y administración: C$15,000</li></ul><p><strong>Costo variable: C$48 por unidad</strong></p><ul><li>Materia prima: C$32</li><li>Mano de obra variable: C$12</li><li>Empaque: C$4</li></ul><p>Se supone un precio de venta constante de C$80 y una previsión de 3,500 unidades al mes. Los importes se presentan únicamente como datos ilustrativos.</p>');
});
