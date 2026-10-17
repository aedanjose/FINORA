# Pruebas de Finora

Desde la carpeta del proyecto:

```powershell
node tests/casos.test.cjs
node --test tests/import.test.cjs tests/file-import.test.cjs tests/attached-import.test.cjs tests/workbook-import.test.cjs tests/cash-flow.test.cjs tests/break-even.test.cjs tests/dashboard.test.cjs
```

Estas pruebas no requieren internet ni dependencias externas. Cubren los casos de clase, los totales informados y el lector de tablas reutilizado de GestiCode.

El presupuesto mensual y la proforma comparten `assets/js/budget.js`. Ejecuta `node --test tests/budget.test.cjs` para comprobar ventas, compras, inventario con costo promedio ponderado, resultados, caja y balance. Incluye referencias independientes, ceros y faltantes, costos variables de compra, déficits, cambios de contexto, importación Excel/CSV y conservación de las cuentas originales. `node tests/budget-browser.cjs` comprueba captura manual, revisión/cancelación de archivos, ajustes posteriores, guardado, sincronización, aislamiento por empresa, conflictos entre pestañas, teclado y vista móvil. Usa las mismas variables de Playwright y navegador descritas abajo.

El modelo vigente es comercial, de una línea con unidades comparables, entre 1 y 24 meses consecutivos. El usuario informa precio, costo de compra, ventas, inventario inicial y política de inventario. Se explicita qué porcentaje de ventas/compras se cobra/paga en el mismo mes; el resto vence al siguiente y los saldos iniciales por cobrar/pagar se liquidan en el primero. Gastos, impuestos, intereses, otros ingresos, inversiones y dividendos se pagan/cobran en el mes informado; depreciación se registra aparte. Préstamos netos modifica la deuda a largo plazo. Otros saldos del balance permanecen constantes. No se modelan automáticamente varios productos, calendarios de crédito de más de un mes, impuestos legales ni financiamiento para cubrir faltantes: esos casos requieren ampliar el modelo. Los supuestos requieren revisión explícita.

Las previsiones importadas o manuales se guardan en `params.budget` de la empresa activa, sin cambiar balance ni resultados históricos. Los saldos de partida pueden tomarse automáticamente del balance actual o informarse manualmente. Las cifras usan la moneda y escala de la empresa, incluso los precios unitarios. Los vacíos no equivalen a cero; se puede guardar un borrador incompleto y la proforma conserva la marca de pendientes. Cambiar años, moneda o escala invalida el presupuesto anterior; al guardar otro se conserva el anterior en `params.budgetArchive`. Cambiar las cuentas de partida exige revisar los supuestos otra vez. El guardado es local al navegador.

Para la prueba de interfaz, inicia `node tools/preview.mjs` en otra terminal y ejecuta `node tests/ledger-browser.cjs`. Requiere Playwright y un navegador Chromium. Si no están en las rutas estándar, define `FINORA_PLAYWRIGHT` con la ruta del módulo y `FINORA_BROWSER_PATH` con la ruta del ejecutable. Opcionalmente, `FINORA_BASE_URL` cambia `http://127.0.0.1:4173`.

El navegador de pruebas usa un contexto nuevo y aislado; no toca los casos del navegador del usuario. Comprueba cancelar/aplicar, persistencia, totales, edición, teclado, pegado directo, opciones de cuentas, sincronización con análisis y vista móvil. Guarda capturas de comprobación en `.reference/`.

La carga de Excel y CSV tiene pruebas en `tests/file-browser.cjs`. Se ejecuta con las mismas variables de Playwright y navegador. Comprueba archivos .xlsx reales, hojas, fechas y años invertidos, CSV con varios años, asignación manual, revisión antes de guardar, cancelación, recuperación de errores y ausencia de conexiones externas. El lector SheetJS y su licencia están incluidos en `assets/vendor/sheetjs`.

La regresión del balance 2025-2026 está en `tests/attached-browser.cjs`. Por defecto arma un libro a partir de las fixtures; para probar un archivo real, define `FINORA_TEST_WORKBOOK` con su ruta. Comprueba Patrimonio, subtotales, diagnóstico de diferencias y preparación automática de un documento nuevo cuando los años no coinciden, conservando el documento anterior y las correcciones hechas en revisión.

La carga conjunta se verifica con `node --test tests/workbook-import.test.cjs` y `node tests/joint-browser.cjs`. Este último usa `FINORA_TEST_WORKBOOK` si está definido; en otro caso construye un libro desde las mismas cuentas de prueba. Comprueba ambas hojas, cancelación sin guardado parcial, revisión hacia atrás, períodos coherentes, cuentas desconocidas, datos cambiados y columnas invertidas. Las pruebas anteriores mantienen la importación de una sola hoja desmarcando la carga conjunta.

El flujo de efectivo conectado se comprueba con `node --test tests/cash-flow.test.cjs` y `node tests/cash-flow-browser.cjs`. La prueba de navegador importa las dos hojas, valida el saldo final, los supuestos pendientes, los ajustes por empresa y años, la actualización entre pestañas, la impresión completa y las vistas clara, oscura y móvil. Puede usar `FINORA_TEST_WORKBOOK` con el Excel real. El cálculo conserva las diferencias visibles y no agrega partidas para forzar el cuadre. Referencia conceptual: https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/.

El dashboard se verifica con `node --test tests/dashboard.test.cjs` y `node tests/dashboard-browser.cjs`. Usa la misma configuración de Playwright y, opcionalmente, `FINORA_TEST_WORKBOOK`. Comprueba entrada desde la bienvenida, importación de ambos estados, indicadores, gráficos con cifras exactas, pérdidas y datos incompletos, escenarios separados de las cuentas, persistencia por empresa y período, actualización entre pestañas, impresión y vistas clara/oscura/móvil. La proyección de ventas aplica el crecimiento al año actual; la utilidad usa el margen neto actual o el margen supuesto informado.
