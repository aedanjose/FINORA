# FINORA · Reglas para IA (Claude Code, Codex, Antigravity)

`CLAUDE.md` y `AGENTS.md` tienen el mismo contenido: si cambias uno, copia el otro. Responde en español. Las instrucciones del usuario tienen prioridad.

## Forma de trabajo (ahorro de tokens sin perder precisión)
1. **Un objetivo.** Haz solo lo pedido; si es amplio, divídelo en etapas y ejecuta la autorizada. Si una decisión es del usuario, pregunta solo ese punto.
2. **Localiza, luego lee.** `rg` por símbolo; abre fragmentos y dependencias necesarias. No recorras el repositorio ni releas lo ya leído.
3. **Cambio mínimo completo.** Reutiliza motores, componentes y estilos. Sin refactors, renombres, reformateos masivos ni dependencias nuevas. Informa problemas ajenos; no los corrijas por tu cuenta. Respeta cambios del usuario y trabajo en curso.
4. **Verifica según el riesgo.** Sintaxis y pruebas afectadas; en cálculos, un caso conocido y límites (cero, extremos, vacíos, redondeo). Si tocas código compartido, corre la regresión de sus consumidores. Añade una prueba enfocada si falta. Nunca ahorres en verificación esencial.
5. **Sin herramientas de más.** Nada de capturas, búsquedas web, subagentes ni lecturas masivas salvo que resuelvan una duda concreta.
6. **No inventes resultados.** Distingue aprobado, fallido y no ejecutado. No digas que probaste la interfaz si solo leíste código.
7. **Entrega corta:** Cambios · Pruebas (resultado real) · Pendientes. Sin archivos completos, logs largos ni narración.
8. **Git:** no hagas commit, push, reset ni borres archivos salvo pedido. El usuario hace commit y push: dale comandos de PowerShell uno por línea (PowerShell 5.1 no acepta `&&`).
9. **Si retomas trabajo:** empieza por `git status --short` y `git diff --stat`; nunca descartes cambios. Si dejas algo inconcluso, traspaso de máximo ocho líneas (objetivo, archivos, pruebas, pendiente, siguiente paso).

## Invariantes financieras
- Cambiar ventas, compras, inventarios, gastos, tasas o calendarios recalcula todo lo dependiente: sin valores fijos ni fórmulas duplicadas.
- Respeta moneda (C$ en casos nicaragüenses), escala, signos, períodos, redondeo, saldos iniciales y continuidad entre períodos. Lo visual no altera cifras.
- No confundir ventas con cobros, compras con pagos, utilidad con efectivo ni depreciación con desembolso. No duplicar saldos iniciales, intereses, amortizaciones, dividendos ni financiamiento.
- El mínimo de caja es referencia, no gasto; sin préstamos automáticos. No forzar cuadres con ajustes inventados: si faltan datos, dilo.
- Conserva formatos guardados y compatibilidad con proyecciones anteriores.

## Mapa del proyecto
Sitio estático HTML/CSS/JS sin build. Módulos en `modulos/<id>/{index.html,script.js,styles.css}`; shell en `assets/js/app.js`. Las pantallas solo presentan: las fórmulas viven en `assets/js/`.

| Necesidad | Empezar por |
|---|---|
| Motor financiero (no agregar fórmulas) | `assets/js/finance.js` (copia del motor de GestiCode) |
| Estados, casos y análisis por cuenta | `assets/js/casos.js`, `modulos/estados-financieros/`, `modulos/analisis-financiero/` |
| Pegado y clasificación | `assets/js/{table-import,paste-import}.js`, `modulos/estados-financieros/{import,start}.js` |
| Excel y detección de hojas | `assets/js/{file-table,sheet-detect,workbook-import}.js`, `modulos/estados-financieros/file-import.js` (SheetJS en `assets/vendor/`) |
| Presupuestos, caja y proforma | `assets/js/budget.js` (+ `budget-import.js`), `modulos/planeacion-presupuestos/script.js` |
| Flujo de efectivo / equilibrio | `assets/js/cash-flow.js`, `assets/js/break-even.js` |
| Diseño | tokens en `assets/css/global.css`; modo Exposición (oscuro, por defecto) en `assets/css/presentation.css`; tablas en `assets/css/casos.css`. Usa tokens; textos ≥ 11 px |

Datos en `localStorage`: `finora:casos:v1` (casos) y `finora:presentation:v1` (modo). Ejemplos de clase: Mundo Moda (solo balance) y Dayton (balance + resultados).

## Comandos
- Pruebas (no hay Node; se usa el de VS Code), desde la raíz:
  - `ELECTRON_RUN_AS_NODE=1 "C:/Users/aedan/AppData/Local/Programs/Microsoft VS Code/Code.exe" tests/casos.test.cjs`
  - el mismo ejecutable con `--test` y los demás `tests/*.test.cjs` afectados (o todos para regresión completa).
  - `tests/*-browser.cjs` requieren Playwright (no instalado): no afirmes que corrieron.
- Navegador: Live Server en la raíz, o `python -m http.server 4180 --bind 127.0.0.1` (Python en `AppData/Local/Programs/Python/Python314`; el 4173 está bloqueado). Recargar con Ctrl+Shift+R.
- Remoto: `github.com/aedanjose/FINORA`.
