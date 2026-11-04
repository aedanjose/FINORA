# Traspaso: importación automática de Excel en FINORA

Lee primero `CLAUDE.md` (reglas y datos del proyecto). Responde en español.

## Objetivo

Al subir un Excel, FINORA debe encontrar sola las hojas del balance general y del estado de resultados, sus columnas, años y filas; el usuario solo revisa y aplica. Flujo: **Cargar Excel → Detección automática → Revisión → Aplicar**. La configuración manual (hoja, columnas, años, filas) queda como opción avanzada.

## Diagnóstico (ya hecho)

- `modulos/estados-financieros/file-import.js` marcaba hojas candidatas solo por el nombre de la hoja o por conteo de palabras (`P.detectKind`) en todo su texto. Por eso hojas de apoyo como «Guia practica» entraban como candidatas y su error de años bloqueaba la importación conjunta.
- `assets/js/file-table.js` → `suggest()` ya encontraba columnas y años, pero solo aceptaba encabezados «Cuenta/Concepto» exactos y tomaba como última fila la última de la hoja (entraban notas al pie).
- La pantalla siempre abría en la configuración manual y exigía la casilla «Confirmo que cada columna…».
- Se conserva todo lo que funciona: `table-import.js` (lector), `paste-import.js` (`analyze`/`validate`/`buildCase`), `workbook-import.js` (guardado conjunto), `import.js` (revisión de cuentas).

## Hecho

1. `file-import.js` (líneas ~168–180): la importación conjunta prueba las hojas candidatas en orden y usa la primera que se pueda leer (ya no se bloquea por «Guia practica»).
2. `file-table.js` → `suggest()`: acepta encabezados como «Nombre de la cuenta», «Descripción de la partida» (textos ≤ 40 caracteres).
3. **Nuevo `assets/js/sheet-detect.js`** (lógica pura, UMD, expone `window.FinoraSheetDetect`):
   - `locate(rows)`: encabezado con dos años, columnas, `first` = fila siguiente al encabezado, `last` = última fila con importe en alguna columna de año.
   - `analyzeSheet(data, name)`: extrae con `T.extract`, puntúa como balance y como resultados con `P.analyze` + `P.validate` (cuentas reconocidas, clasificadas, estructura, cuadre/utilidad, nombre de hoja ±). Devuelve `{ignored, reason}` o `{kind, score, config, text, years, accounts, pending, totals, coherent, draft, warnings}`. Avisos: cuentas repetidas, períodos sin importe, balance descuadrado con diferencia, totales del documento que no coinciden, cuentas por confirmar.
   - `detectWorkbook([{name, data}])`: `choice` (mejor hoja por tipo), `candidates`, `ambiguous` (otra hoja a ≤ 0.1 de puntaje), `ignored` con motivo, `notes` (años distintos entre estados, nada detectado).
   - `pick(result, kind, name)`.
4. **Nuevas pruebas**: `tests/fixtures/libro-practica.cjs` (libro de 8 hojas con los datos de control) y `tests/sheet-detect.test.cjs` (11 pruebas, incluye generar un .xlsx real con SheetJS y leerlo). **10 pasan, 1 falla** (ver abajo).

Datos de control (deben cumplirse): 2024 activos 138,000 = pasivos 60,000 + patrimonio 78,000; 2025 173,000 = 65,000 + 108,000; utilidad neta 30,000 ambos años; diferencia 0.

## Pendiente

### 1. Prueba que falla: «Columnas en otro orden» (`tests/sheet-detect.test.cjs`, línea ~74, `s.coherent` es `false`)
Hipótesis (sin confirmar): el test invierte solo las filas de 3 celdas; las filas de una celda (encabezados de sección como «ACTIVOS CORRIENTES», títulos) quedan en la columna 0, que ahora es la del año 2025, así que se pierde el contexto de sección. Probar cambiando en el test `row.length === 1 ? row` por `row.length === 1 ? [null, null, row[0]]`. Si aun así falla, depurar `analyzeSheet` imprimiendo `s.draft.rows` y `s.warnings`. No cambiar fórmulas.

### 2. Interfaz en `modulos/estados-financieros/file-import.js` (no empezada)
- Agregar `<script defer src="../../assets/js/sheet-detect.js"></script>` en `modulos/estados-financieros/index.html` después de `paste-import.js` (y en cualquier otra página que abra `FinoraFileImport`, buscar con grep).
- En `loadFile`, tras leer todas las hojas (ya hay un bucle que llama `readSheet`), ejecutar `FinoraSheetDetect.detectWorkbook` y mostrar una **pantalla resumen** en lugar de abrir la configuración manual:
  - Una tarjeta por estado detectado: hoja, años, n.º de cuentas, totales del documento, cuadre, avisos; si `ambiguous[kind]`, un `<select>` con `candidates[kind]` (por defecto `choice[kind]`).
  - Lista plegable «Hojas ignoradas» con su motivo.
  - Botones: **Revisar cuentas** (secundario) → reutilizar `jointReview(entries)` con `entries = [{kind, name, text}]` de las hojas elegidas (o `FinoraImport.open` si solo hay un estado, igual que en las líneas ~177–184); **Aplicar** (primario) habilitado solo si no hay cuentas pendientes ni errores (`P.validate` válido en ambos borradores y `FinoraWorkbook.pairErrors` vacío) → construir con `FinoraWorkbook.buildCase` (o `P.buildCase`) usando la misma lógica de destino que `jointReview` (empresa nueva si `options.newCase` o si cambian los años y ya hay datos) y guardar con `C.store.add`/`C.store.save`; **Configuración manual avanzada** (enlace) → la pantalla actual (`loadSheet` + `mapping`).
- Mantener el diseño existente (clases `import-*`, tokens de `assets/css/global.css`); textos ≥ 11 px; modo Exposición en `presentation.css` solo si hace falta.
- Nada se guarda hasta pulsar Aplicar o terminar la revisión; cancelar no toca el almacén.

### 3. Verificación final
- Correr todas las pruebas (comandos en `CLAUDE.md`), más `tests/sheet-detect.test.cjs`:
  `ELECTRON_RUN_AS_NODE=1 "C:/Users/aedan/AppData/Local/Programs/Microsoft VS Code/Code.exe" --test tests/sheet-detect.test.cjs`
- Agregar `tests/sheet-detect.test.cjs` a la lista de `tests/README.md` y de `CLAUDE.md`.
- Probar en el navegador con un .xlsx de 8 hojas (se puede generar con el mismo código del test «Ruta real de Excel» y guardarlo en `tests/fixtures/`).
- Las pruebas `tests/*-browser.cjs` requieren Playwright (no instalado): no afirmar que corrieron.

## Limitaciones conocidas
- La detección exige un encabezado con dos años distintos; hojas sin años se ignoran y van por la configuración manual.
- Si la columna de cuentas tiene códigos con letras, `suggest()` podría elegirla como columna de cuentas.
- El usuario hace los commits y el push (dar comandos de PowerShell uno por uno; PowerShell 5.1 no acepta `&&`).
