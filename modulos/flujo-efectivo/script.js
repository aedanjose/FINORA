'use strict';

// Filtros y detalles del prototipo; los movimientos son datos de ejemplo.
const cashRows = Array.from(document.querySelectorAll('[data-cash-category]'));
document.querySelectorAll('[data-cash-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.cashFilter;
    document.querySelectorAll('[data-cash-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    let visible = 0;
    cashRows.forEach((row) => {
      row.hidden = filter !== 'all' && row.dataset.cashCategory !== filter;
      if (!row.hidden) visible += 1;
    });
    document.getElementById('movement-count').textContent = visible + (visible === 1 ? ' movimiento' : ' movimientos');
    document.getElementById('filtered-description').textContent = filter === 'all' ? 'Todos los movimientos del ejemplo' : 'Movimientos de ' + button.textContent.toLowerCase() + ' del ejemplo';
  });
});
const cashDetails = {
  sales: ['Cobros por ventas', '05 de junio de 2025', 'Entrada', 'C$145,000', 'Operación', 'Cobros de clientes por ventas del período.'],
  services: ['Cobros por servicios', '10 de junio de 2025', 'Entrada', 'C$18,500', 'Operación', 'Cobros por servicios profesionales prestados.'],
  suppliers: ['Pago a proveedores', '12 de junio de 2025', 'Salida', 'C$86,500', 'Operación', 'Pagos de materiales y mercadería para la actividad del negocio.'],
  equipment: ['Compra de equipo', '16 de junio de 2025', 'Salida', 'C$18,000', 'Inversión', 'Adquisición de equipo para producción.'],
  loan: ['Préstamo recibido', '20 de junio de 2025', 'Entrada', 'C$12,000', 'Financiamiento', 'Ingreso de efectivo por financiamiento bancario.'],
  payroll: ['Pago de nómina', '28 de junio de 2025', 'Salida', 'C$39,000', 'Operación', 'Pago al personal administrativo y operativo.'],
  expenses: ['Servicios y gastos operativos', '29 de junio de 2025', 'Salida', 'C$9,000', 'Operación', 'Pagos de servicios básicos y gastos administrativos.'],
  repayment: ['Amortización de préstamo', '30 de junio de 2025', 'Salida', 'C$4,500', 'Financiamiento', 'Abono al capital de un préstamo; no incluye intereses.']
};
document.querySelectorAll('[data-cash-detail]').forEach((button) => {
  button.addEventListener('click', () => {
    const [title, date, direction, amount, activity, description] = cashDetails[button.dataset.cashDetail];
    window.Finora.openDialog(title, '<p class="demo-label">Movimiento ilustrativo</p><p><strong>' + direction + ': ' + amount + '</strong></p><p><strong>Fecha:</strong> ' + date + '<br><strong>Actividad:</strong> ' + activity + '</p><p>' + description + '</p><p>Registro de muestra para revisar el diseño. No corresponde a una transacción real ni a una conexión bancaria.</p>');
  });
});
document.getElementById('cash-activities-guide').addEventListener('click', () => {
  window.Finora.openDialog('Las actividades del flujo de efectivo', '<p><strong>Operación:</strong> cobros y pagos relacionados con la actividad cotidiana. En este ejemplo: C$163,500 en cobros menos C$134,500 en pagos = C$29,000.</p><p><strong>Inversión:</strong> adquisición y venta de activos de largo plazo. El ejemplo registra C$18,000 de salida por compra de equipo.</p><p><strong>Financiamiento:</strong> obtención y devolución de recursos financieros. C$12,000 recibidos menos C$4,500 de amortización = C$7,500.</p><p>El flujo neto de C$18,500 se suma al saldo inicial de C$87,000 para obtener un saldo final de C$105,500.</p>');
});
document.getElementById('cash-report').addEventListener('click', () => {
  window.Finora.openDialog('Vista previa · flujo de efectivo', '<p class="demo-label">Junio 2025 · Datos de muestra</p><p>Saldo inicial: <strong>C$87,000</strong></p><p>Actividades de operación: <strong>+C$29,000</strong><br>Actividades de inversión: <strong>−C$18,000</strong><br>Actividades de financiamiento: <strong>+C$7,500</strong></p><p>Aumento neto: <strong>C$18,500</strong><br>Saldo final: <strong>C$105,500</strong></p><p>Vista ilustrativa del reporte. La generación de archivos y los datos reales se incorporarán en la etapa funcional.</p>');
});
