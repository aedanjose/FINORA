// Libro de práctica de 8 hojas con los datos de control (C$):
// 2024: activos 138,000 = pasivos 60,000 + patrimonio 78,000 · 2025: 173,000 = 65,000 + 108,000 · utilidad neta 30,000 ambos años.
'use strict';
const titulo = nombre => [['Comercial Prueba S.A.'], [nombre], ['Cifras en córdobas (C$)'], []];

const balance = [...titulo('Balance general'),
  ['Cuenta', 2024, 2025],
  ['ACTIVOS CORRIENTES'],
  ['Efectivo y equivalentes', 30000, 45000],
  ['Cuentas por cobrar', 25000, 30000],
  ['Inventarios', 23000, 28000],
  ['Total activos corrientes', 78000, 103000],
  ['ACTIVOS NO CORRIENTES'],
  ['Propiedad, planta y equipo', 70000, 85000],
  ['Depreciación acumulada', 10000, 15000],
  ['Total activos no corrientes', 60000, 70000],
  ['Total activos', 138000, 173000],
  ['PASIVOS CORRIENTES'],
  ['Cuentas por pagar', 20000, 22000],
  ['Préstamos de corto plazo', 10000, 8000],
  ['Total pasivos corrientes', 30000, 30000],
  ['PASIVOS NO CORRIENTES'],
  ['Préstamos a largo plazo', 30000, 35000],
  ['Total pasivos', 60000, 65000],
  ['PATRIMONIO'],
  ['Capital social', 50000, 50000],
  ['Utilidades retenidas', 28000, 58000],
  ['Total patrimonio', 78000, 108000],
  ['Total pasivo y patrimonio', 138000, 173000],
  [],
  ['Nota: cifras auditadas. Esta línea no es una cuenta.']];

const resultados = [...titulo('Estado de resultados'),
  ['Concepto', 'Año 2024', 'Año 2025'],
  ['Ventas', 200000, 230000],
  ['Costo de ventas', 110000, 125000],
  ['Utilidad bruta', 90000, 105000],
  ['Gastos administrativos', 30000, 38000],
  ['Gastos de venta', 15000, 20000],
  ['Utilidad operativa', 45000, 47000],
  ['Gastos por intereses', 5000, 7000],
  ['Utilidad antes de impuestos', 40000, 40000],
  ['Impuestos', 10000, 10000],
  ['Utilidad neta', 30000, 30000]];

// Mismo balance con el efectivo desglosado: es válido, pero duplica al «Balance».
const balanceDetallado = balance.map(row => row[0] === 'Efectivo y equivalentes' ? null : row).filter(Boolean);
balanceDetallado.splice(balanceDetallado.findIndex(r => r[0] === 'Cuentas por cobrar'), 0, ['Caja', 5000, 8000], ['Bancos', 25000, 37000], ['Total efectivo', 30000, 45000]);

const hojas = [
  ['Guia practica', [['Guía práctica'], ['Paso 1: copia el balance general de 2024 y 2025 en la hoja Balance.'], ['Paso 2: revisa las ventas, los costos y la utilidad neta.'], ['', '2024', '2025'], ['Escribe aquí las cuentas que no reconozcas.'], ['Recuerda: activo = pasivo + patrimonio.']]],
  ['Balance detallado', balanceDetallado],
  ['Presupuesto 2026', [['Presupuesto 2026'], ['Concepto', '2026'], ['Ventas', 250000], ['Costo de ventas', 135000], ['Gastos administrativos', 40000]]],
  ['Balance', balance],
  ['Resultados', resultados],
  ['Complementarios', [['Datos complementarios'], ['Dato', '2024', '2025'], ['Número de acciones', 1000, 1000], ['Ventas a crédito', 150000, 170000], ['Compras a crédito', 80000, 90000]]],
  ['Cuentas para clasificar', [['Clasifica estas cuentas'], ['Cuenta', 2024, 2025], ['Caja', 5000, 8000], ['Proveedores', 20000, 22000], ['Ventas', 200000, 230000], ['Mobiliario', 12000, 15000], ['Gastos de publicidad', 4000, 5000]]],
  ['Clave contable', [['Código', 'Cuenta', 'Tipo'], ['1101', 'Caja', 'Activo'], ['2101', 'Proveedores', 'Pasivo'], ['4101', 'Ventas', 'Ingreso']]]
];

module.exports = { hojas, balance, resultados, balanceDetallado };
