/* Elegir archivo, hoja y columnas antes de reutilizar la revisión de cuentas. */
(() => {
  'use strict';
  const T = window.FinoraFileTable, C = window.FinoraCasos, P = window.FinoraPaste;
  const esc = window.FinoraCaseBar.esc;
  const base = new URL('../../assets/', document.currentScript.src);
  let libraryPromise;
  function library() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = new URL('vendor/sheetjs/xlsx.full.min.js', base).href;
      script.onload = () => resolve(window.XLSX); script.onerror = () => { libraryPromise = null; script.remove(); reject(new Error('No se pudo cargar el lector de Excel. Vuelve a abrir Finora.')); }; document.head.append(script);
    });
    return libraryPromise;
  }
  function columnLetter(n) { let text = ''; for (n++; n; n = Math.floor((n-1)/26)) text = String.fromCharCode(65+(n-1)%26) + text; return text; }
  function open(options = {}) {
    const original = C.store.active(), snapshot = JSON.stringify(original);
    const modal = window.Finora.openDialog('Importar Excel o CSV', '<div id="file-workspace"></div>');
    modal.classList.add('import-dialog');
    const container = modal.querySelector('#file-workspace'), abort = new AbortController();
    let file = null, sheet = null, workbook = null, worker = null, sequence = 0, generation = 0, sheetSequence = 0;
    const pending = new Map();
    function stop() { worker?.terminate(); worker = null; pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('Lectura cancelada.')); }); pending.clear(); }
    modal.addEventListener('close', () => { abort.abort(); generation++; stop(); modal.classList.remove('import-dialog'); }, { once: true });
    function request(action, payload) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { stop(); reject(new Error('La lectura tardó demasiado. Prueba con un archivo más pequeño.')); }, 30000);
        pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, action, ...payload });
      });
    }
    function launchWorker() {
      if (location.protocol === 'file:' || !window.Worker) return false;
      worker = new Worker(new URL('js/file-worker.js', base));
      worker.onmessage = event => { const p = pending.get(event.data.id); if (!p) return; pending.delete(event.data.id); clearTimeout(p.timer); event.data.error ? p.reject(new Error(event.data.error)) : p.resolve(event.data.result); };
      worker.onerror = () => { stop(); }; return true;
    }
    function error(message) { container.querySelector('#file-error').textContent = message; }
    function initial() {
      container.innerHTML = `<p class="import-kicker">01 · Seleccionar archivo</p><p>Sube el balance o estado de resultados. Después elegirás la hoja, los años y las columnas, y revisarás la clasificación de las cuentas.</p><label class="file-drop" for="financial-file"><span class="file-drop-title">Elegir archivo Excel o CSV</span><span>.xlsx o .csv · Hasta 10 MB</span><input type="file" id="financial-file" accept=".xlsx,.csv"></label><p class="import-help">El archivo se lee en tu navegador. No se guarda nada hasta pulsar Aplicar.</p><p id="file-error" class="import-error" role="alert"></p><div id="file-selection" hidden></div><div class="import-actions"><button type="button" class="button button-secondary" data-file-cancel>Cancelar</button></div>`;
      container.querySelector('#financial-file').focus();
    }
    function config() {
      const value = id => container.querySelector('#'+id).value;
      return { account: Number(value('file-account')), previous: Number(value('file-previous')), current: Number(value('file-current')), previousYear: value('file-previous-year'), currentYear: value('file-current-year'), header: sheet.suggestion.header, first: Number(value('file-first'))-1, last: Number(value('file-last'))-1, confirmed: container.querySelector('#file-confirm-columns').checked };
    }
    function preview() {
      error('');
      try {
        const result = T.extract(sheet, { ...config(), confirmed: true });
        container.querySelector('#file-preview').innerHTML = `<p class="import-help">${result.selected.length} filas seleccionadas. Vista previa de las primeras 8:</p><div class="import-table-scroll"><table class="import-table"><thead><tr><th>Cuenta</th><th>${esc(config().previousYear)} · Anterior</th><th>${esc(config().currentYear)} · Actual</th></tr></thead><tbody>${result.selected.slice(0,8).map(row=>`<tr>${row.map(v=>`<td>${esc(v??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      } catch (e) { container.querySelector('#file-preview').textContent = ''; error(e.message); }
    }
    function mapping() {
      const s = sheet.suggestion = T.suggest(sheet.rows);
      const choice = (col, selected) => `<option value="${col}"${col === selected ? ' selected' : ''}>${columnLetter(col)}${s.columns.find(x=>x.c===col) ? ' · '+s.columns.find(x=>x.c===col).year : ''}${col===s.account ? ' · Cuenta' : ''}</option>`;
      const columnSelect = (id, label, chosen) => `<label>${label}<select class="select" id="${id}">${s.available.map(col=>choice(col,chosen)).join('')}</select></label>`;
      container.querySelector('#file-mapping').innerHTML = `<div class="file-columns">${columnSelect('file-account','Columna de cuentas',s.account)}${columnSelect('file-previous','Columna del año anterior',s.previous)}${columnSelect('file-current','Columna del año actual',s.current)}<label>Año anterior<input class="input" id="file-previous-year" inputmode="numeric" maxlength="4" value="${s.previousYear}"></label><label>Año actual<input class="input" id="file-current-year" inputmode="numeric" maxlength="4" value="${s.currentYear}"></label><div class="file-years-note">${s.columns.length > 2 ? 'Hay varios años. Elige los dos que quieres comparar.' : s.columns.length === 2 ? 'Los años se ordenan del menor al mayor, aunque en Excel estén invertidos.' : 'No se reconocieron los años. Indica a qué año pertenece cada columna.'}</div><label>Primera fila de cuentas<input class="input" type="number" id="file-first" min="1" max="${sheet.rows.length}" value="${s.first+1}"></label><label>Última fila<input class="input" type="number" id="file-last" min="1" max="${sheet.rows.length}" value="${sheet.rows.length}"></label><label>Estado financiero<select class="select" id="file-kind"><option value="">Detectar automáticamente</option><option value="balance"${options.kind==='balance'?' selected':''}>Balance general</option><option value="income"${options.kind==='income'?' selected':''}>Estado de resultados</option></select></label></div><label class="import-confirm file-confirm"><input type="checkbox" id="file-confirm-columns">Confirmo que cada columna corresponde al año indicado.</label><div id="file-preview"></div><div class="import-actions"><button type="button" class="button button-primary" id="file-review">Revisar cuentas</button></div>`;
      preview();
    }
    async function loadSheet(name) {
      const token = ++sheetSequence;
      container.querySelector('#file-mapping').innerHTML = '<p class="import-help">Leyendo hoja…</p>';
      error('');
      try {
        const data = worker ? await request('sheet', { name }) : T.sheetData(workbook, name, await library());
        if (abort.signal.aborted || token !== sheetSequence) return;
        if (!data.rows.length || !data.rows.some(row=>row.some(v=>v!==null && v!==''))) throw new Error('Esta hoja está vacía. Elige otra hoja.');
        sheet = data; mapping();
      } catch (e) { if (!abort.signal.aborted && token === sheetSequence) { sheet=null; container.querySelector('#file-mapping').innerHTML=''; error(e.message); } }
    }
    async function loadFile(next) {
      const token = ++generation; ++sheetSequence; stop(); sheet = null; workbook = null; file = next;
      container.querySelector('#file-selection').hidden = true; error('');
      if (!file) return;
      if (!/\.(xlsx|csv)$/i.test(file.name)) { error('Elige un archivo .xlsx o .csv.'); return; }
      if (!file.size || file.size > T.MAX_BYTES) { error(file.size ? 'El archivo supera 10 MB.' : 'El archivo está vacío.'); return; }
      container.querySelector('.file-drop-title').textContent = 'Leyendo archivo…';
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (abort.signal.aborted || token !== generation) return;
        let list;
        if (launchWorker()) list = await request('read', { bytes: bytes.buffer, name: file.name });
        else { workbook = T.read(bytes, file.name, await library()); list = T.sheets(workbook); }
        if (abort.signal.aborted || token !== generation) return;
        container.querySelector('.file-drop-title').textContent = 'Cambiar archivo';
        const selection = container.querySelector('#file-selection'); selection.hidden=false;
        selection.innerHTML = `<div class="import-destination"><strong>${esc(file.name)}</strong><span>${list.length} ${list.length===1?'hoja':'hojas'}</span></div><label class="field-label" for="file-sheet">Hoja del archivo</label><select class="select file-sheet" id="file-sheet">${list.map(item=>`<option value="${esc(item.name)}">${esc(item.name)}${item.hidden?' (oculta)':''}</option>`).join('')}</select><div id="file-mapping"></div>`;
        const preferred = list.find(item=>options.kind && (P.detectKind(item.name) || (/resultados?|income/i.test(item.name) ? 'income' : /balance/i.test(item.name) ? 'balance' : null))===options.kind && !item.hidden) || list.find(item=>!item.hidden) || list[0];
        container.querySelector('#file-sheet').value=preferred.name; await loadSheet(preferred.name);
      } catch (e) { if (!abort.signal.aborted && token===generation) { container.querySelector('.file-drop-title').textContent='Elegir archivo Excel o CSV'; error(e.message || 'No se pudo leer el archivo. Si está protegido con contraseña, guarda una copia sin protección.'); } }
    }
    container.addEventListener('change', event => {
      const id=event.target.id;
      if (id==='financial-file') { loadFile(event.target.files[0]); return; }
      if (id==='file-sheet') { loadSheet(event.target.value); return; }
      if (!sheet) return;
      if (id==='file-previous' || id==='file-current') {
        const side=id==='file-previous'?'previous':'current';
        const year=T.yearOf(sheet.rows[sheet.suggestion.header]?.[Number(event.target.value)]);
        if(year) container.querySelector('#file-'+side+'-year').value=year;
        container.querySelector('#file-confirm-columns').checked=false;
      }
      if (id.startsWith('file-')) preview();
    }, {signal:abort.signal});
    container.addEventListener('input', event => { if (sheet && /file-(?:previous-year|current-year|first|last)/.test(event.target.id)) { container.querySelector('#file-confirm-columns').checked=false; preview(); } }, {signal:abort.signal});
    container.addEventListener('click', event => {
      if(event.target.closest('[data-file-cancel]')) { modal.close(); return; }
      if(!event.target.closest('#file-review') || !sheet) return;
      try {
        if(!options.newCase && JSON.stringify(C.store.active())!==snapshot) throw new Error('Los datos actuales cambiaron. Cierra esta ventana y vuelve a importar el archivo.');
        const result=T.extract(sheet,config());
        const kind=container.querySelector('#file-kind').value || P.detectKind(result.text);
        if(!kind) throw new Error('Elige si esta hoja contiene un balance general o un estado de resultados.');
        const baseline=options.newCase?C.blankCase(P.detectCompany(result.text)||file.name.replace(/\.[^.]+$/,'')):null;
        const filename=`${file.name} · ${sheet.name}`;
        if(options.newCase) window.FinoraStart?.prepareImport();
        modal.addEventListener('close', () => window.FinoraImport.open({kind,text:result.text,...(baseline?{baseline}:{}),fileName:filename}), {once:true});
        modal.close();
      } catch(e) { error(e.message); }
    }, {signal:abort.signal});
    initial();
  }
  window.FinoraFiles={open};
  document.getElementById('upload-excel')?.addEventListener('click',()=>open({kind:document.querySelector('[data-statement][aria-selected="true"]')?.dataset.statement||'balance'}));
})();
