/* Run against `node tools/preview.mjs`.
   FINORA_PLAYWRIGHT may be an absolute path to a Playwright installation.
   FINORA_BROWSER_PATH may select a local Chromium/Edge executable. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.FINORA_PLAYWRIGHT || 'playwright');
const base = process.env.FINORA_BASE_URL || 'http://127.0.0.1:4173';
const sample = 'Cuenta\t2024\t2025\nActivos circulantes\nEfectivo y bancos\t100\t200\nTotal activos\t100\t200\nCapital\nCapital social\t100\t200\nTotal pasivo y capital\t100\t200';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.FINORA_BROWSER_PATH ? { executablePath: process.env.FINORA_BROWSER_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const model = () => page.evaluate(() => FinoraCasos.store.active());
    const importText = async text => {
      await page.click('#paste-excel');
      await page.fill('#import-source', text);
      await page.click('[data-import-action="analyze"]');
      await page.waitForSelector('#import-summary');
    };
    await page.goto(base + '/modulos/estados-financieros/index.html');
    await page.waitForSelector('#balance-editor.ledger-table');
    assert.equal(await page.locator('#balance-editor thead th').count(), 4);
    assert.equal(await page.locator('#income-editor thead th').count(), 4);
    await page.evaluate(() => FinoraCasos.store.create('Caso QA local'));
    const before = await model();
    await importText(sample);
    assert.deepEqual(await model(), before, 'Revisar no guarda');
    assert.match(await page.locator('#import-check-count').innerText(), /4\/4/);
    await page.click('[data-import-action="cancel"]');
    assert.deepEqual(await model(), before, 'Cancelar conserva el caso');
    await importText(sample);
    await page.click('[data-import-action="apply"]');
    await page.waitForSelector('.detail-dialog', { state: 'hidden' });
    let current = await model();
    assert.equal(current.balance.length, 2);
    assert.deepEqual(current.income, before.income, 'No reemplaza el otro estado');
    assert.equal(current.balance[0].amounts.current, 200);
    assert.equal(current.reported.assets.current, 200);
    assert.equal(await page.evaluate(() => FinoraCasos.analyzeBalance(FinoraCasos.store.active()).balanced.current), true);
    await page.reload();
    await page.waitForSelector('#balance-editor.ledger-table');
    assert.equal((await model()).balance.length, 2, 'Persiste al recargar');
    console.log('ok revisión, cancelación, aplicación, totales, guardado');

    const currentCash = page.locator('#balance-editor [data-amount][data-side="current"]').first();
    await currentCash.fill('1.234,56');
    assert.equal((await model()).balance[0].amounts.current, 1234.56, 'Mismo formato numérico en revisión y edición');
    await currentCash.fill('250');
    assert.equal((await model()).balance[0].amounts.current, 250);
    assert.equal(await page.evaluate(() => FinoraCasos.analyzeBalance(FinoraCasos.store.active()).totals.assets.current), 250);
    assert.match(await page.locator('#balance-editor').innerText(), /No coincide/);
    await currentCash.fill('bad-number');
    assert.equal(await currentCash.getAttribute('aria-invalid'), 'true');
    assert.equal((await model()).balance[0].amounts.current, 250, 'Importe inválido no reemplaza el último válido');
    await currentCash.fill('200');
    const fold = page.locator('#balance-editor [data-fold]').first();
    await fold.click();
    assert.equal(await fold.getAttribute('aria-expanded'), 'false');
    await fold.click();
    assert.equal(await fold.getAttribute('aria-expanded'), 'true');
    const cashId = (await model()).balance[0].id;
    await page.click(`[data-options="${cashId}"]`);
    await page.selectOption('#ledger-sign', '-1');
    assert.equal((await model()).balance[0].sign, -1);
    await page.selectOption('#ledger-sign', '1');
    await page.selectOption('#ledger-role', 'cash');
    assert.equal((await model()).balance[0].sign, 1);
    assert.equal((await model()).balance[0].role, 'cash');
    await page.click('.detail-dialog .dialog-header button');
    console.log('ok edición, avisos discretos, grupos plegables y menú de cuenta');

    const group = page.locator('#balance-editor [data-group-body]').first();
    const draft = group.locator('[data-draft][data-cell-column="name"]');
    await draft.focus();
    await page.keyboard.type('Inventarios');
    await page.keyboard.press('Tab');
    let inventory = (await model()).balance.find(row => row.name === 'Inventarios');
    assert.ok(inventory, 'Escribir en última fila crea cuenta');
    assert.equal((await model()).balance.length, 3, 'Una cuenta, no una por letra');
    await page.locator(`[data-amount="${inventory.id}"][data-side="previous"]`).fill('10');
    await page.locator(`[data-amount="${inventory.id}"][data-side="current"]`).fill('20');
    await page.locator('#balance-editor [data-amount][data-side="current"]').first().press('Enter');
    const focused = await page.evaluate(() => ({ id: document.activeElement.dataset.amount, side: document.activeElement.dataset.side }));
    assert.equal(focused.id, inventory.id); assert.equal(focused.side, 'current');
    const beforePaste = await model();
    await group.locator('[data-draft][data-cell-column="name"]').evaluate(el => {
      el.focus(); const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'Clientes\t5\t10\nCaja\t2\t3');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    await page.waitForSelector('#import-summary');
    assert.deepEqual(await model(), beforePaste, 'Pegar en tabla pasa por revisión');
    const confirm = page.locator('[data-edit="confirmed"]');
    for (let i = 0; i < await confirm.count(); i++) await confirm.nth(i).check();
    await page.click('[data-import-action="apply"]');
    assert.equal((await model()).balance.length, beforePaste.balance.length + 2);
    assert.equal((await model()).reported.assets.current, 200, 'Append conserva comprobaciones');
    console.log('ok nueva fila, Enter y pegado directo revisable');

    await page.click('#tab-income');
    const balanceBeforeIncome = (await model()).balance;
    await importText('Cuenta\t2024\t2025\nVentas\t1000\t2000\nCosto de ventas\t400\t800\nGastos operativos totales\t100\t200\nGastos por intereses\t0\t0\nImpuestos\t0\t0\nUtilidad neta\t500\t1000');
    for (let i = 0; i < await page.locator('[data-edit="confirmed"]').count(); i++) await page.locator('[data-edit="confirmed"]').nth(i).check();
    await page.click('[data-import-action="apply"]');
    assert.deepEqual((await model()).balance, balanceBeforeIncome);
    const incomeCheck = await page.evaluate(() => FinoraCasos.checks(FinoraCasos.store.active()).items.filter(x => x.name === 'Utilidad neta'));
    assert.equal(incomeCheck.length, 2); assert.ok(incomeCheck.every(x => x.ok === true));
    await page.goto(base + '/modulos/analisis-financiero/index.html');
    await page.waitForFunction(() => window.FinoraCasos && FinoraCasos.store.active().name === 'Caso QA local');
    assert.equal(await page.evaluate(() => FinoraCasos.analyzeIncome(FinoraCasos.store.active()).statements.current.netProfit), 1000);
    await page.goto(base + '/modulos/estados-financieros/index.html');
    await page.waitForSelector('#balance-editor', { state: 'attached' });
    await page.click('#tab-balance');
    console.log('ok estado de resultados y análisis compartido');

    await importText('Cuenta\t2024\t2025\nEfectivo\tmal\t20');
    assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(), true);
    assert.equal(await page.locator('[data-import-side="previous"]').inputValue(), 'mal');
    await page.click('[data-import-action="cancel"]');
    await importText(sample);
    await page.evaluate(() => { const c = FinoraCasos.store.active(); c.name = 'Cambio durante revisión'; FinoraCasos.store.save(c); });
    await page.click('[data-import-action="apply"]');
    assert.match(await page.locator('#import-errors').innerText(), /cambió/);
    assert.equal((await model()).name, 'Cambio durante revisión');
    await page.click('[data-import-action="cancel"]');
    console.log('ok importes ilegibles y protección frente a cambios durante revisión');

    await page.click('.presentation-toggle');
    assert.equal(await page.locator('html').getAttribute('data-presentation'), 'off');
    await page.locator('.statements-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.reference/ledger-light.png' });
    await page.click('.presentation-toggle');
    await page.locator('.statements-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.reference/ledger-dark.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.statements-panel').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Sin desborde del documento móvil');
    await page.screenshot({ path: '.reference/ledger-mobile.png' });
    await importText(sample);
    assert.ok(await page.evaluate(() => document.querySelector('.import-dialog').getBoundingClientRect().width <= innerWidth), 'Diálogo cabe en móvil');
    await page.screenshot({ path: '.reference/import-review-mobile.png' });
    await page.click('[data-import-action="cancel"]');
    assert.deepEqual(errors, [], 'Sin errores JavaScript en navegador');
    console.log('ok modo claro/oscuro, móvil y sin errores de JavaScript');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });



