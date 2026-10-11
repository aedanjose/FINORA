/* Se lee el libro fuera del hilo de la interfaz. El archivo no se envía a un servidor. */
importScripts('../vendor/sheetjs/xlsx.full.min.js', 'file-table.js');
let workbook;
self.onmessage = event => {
  const { id, action, bytes, name } = event.data;
  try {
    let result;
    if (action === 'read') {
      workbook = FinoraFileTable.read(new Uint8Array(bytes), name, XLSX);
      result = FinoraFileTable.sheets(workbook);
    } else if (action === 'sheet' && workbook) result = FinoraFileTable.sheetData(workbook, name, XLSX);
    else throw new Error('Vuelve a seleccionar el archivo.');
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || 'No se pudo leer el archivo.' });
  }
};
