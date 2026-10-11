# Pruebas de Finora

Desde la carpeta del proyecto:

```powershell
node tests/casos.test.cjs
node --test tests/import.test.cjs tests/file-import.test.cjs tests/attached-import.test.cjs
```

Estas pruebas no requieren internet ni dependencias externas. Cubren los casos de clase, los totales informados y el lector de tablas reutilizado de GestiCode.

Para la prueba de interfaz, inicia `node tools/preview.mjs` en otra terminal y ejecuta `node tests/ledger-browser.cjs`. Requiere Playwright y un navegador Chromium. Si no están en las rutas estándar, define `FINORA_PLAYWRIGHT` con la ruta del módulo y `FINORA_BROWSER_PATH` con la ruta del ejecutable. Opcionalmente, `FINORA_BASE_URL` cambia `http://127.0.0.1:4173`.

El navegador de pruebas usa un contexto nuevo y aislado; no toca los casos del navegador del usuario. Comprueba cancelar/aplicar, persistencia, totales, edición, teclado, pegado directo, opciones de cuentas, sincronización con análisis y vista móvil. Guarda capturas de comprobación en `.reference/`.

La carga de Excel y CSV tiene pruebas en `tests/file-browser.cjs`. Se ejecuta con las mismas variables de Playwright y navegador. Comprueba archivos .xlsx reales, hojas, fechas y años invertidos, CSV con varios años, asignación manual, revisión antes de guardar, cancelación, recuperación de errores y ausencia de conexiones externas. El lector SheetJS y su licencia están incluidos en `assets/vendor/sheetjs`.

La regresión del balance 2025-2026 está en `tests/attached-browser.cjs`. Por defecto arma un libro a partir de las fixtures; para probar un archivo real, define `FINORA_TEST_WORKBOOK` con su ruta. Comprueba Patrimonio, subtotales, diagnóstico de diferencias y preparación automática de un documento nuevo cuando los años no coinciden, conservando el documento anterior y las correcciones hechas en revisión.
