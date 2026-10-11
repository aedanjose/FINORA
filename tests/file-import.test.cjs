'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const XLSX=require('../assets/vendor/sheetjs/xlsx.full.min.js');
const T=require('../assets/js/file-table.js'), P=require('../assets/js/paste-import.js'), C=require('../assets/js/casos.js');
const rows=[['Cuenta',2025,2024],['Activos circulantes',null,null],['Caja y bancos',200,100],['Total activos',200,100],['Capital',null,null],['Capital social',200,100],['Total pasivo y capital',200,100]];
const book=data=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Balance');return wb;};
const bytes=wb=>new Uint8Array(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
const config=data=>{const s=T.suggest(data.rows);return{...s,previousYear:s.previousYear,currentYear:s.currentYear,confirmed:false};};
const draft=data=>P.analyze(T.extract(data,config(data)).text,{kind:'balance',periods:{previous:'2024',current:'2025'}});

test('Lee un XLSX real; años invertidos conservan sus cantidades y cuadre',()=>{
 const wb=T.read(bytes(book(rows)),'balance.xlsx',XLSX), data=T.sheetData(wb,'Balance',XLSX), s=T.suggest(data.rows);
 assert.equal(s.previous,2);assert.equal(s.current,1);assert.equal(s.previousYear,2024);assert.equal(s.currentYear,2025);
 const d=draft(data);d.rows.forEach(row=>row.confirmed=true);const c=P.buildCase(C.blankCase(),d);
 assert.deepEqual(c.balance[0].amounts,{previous:100,current:200});assert.equal(C.analyzeBalance(c).balanced.current,true);
});
test('Selecciona dos de tres años sin importar la columna adicional',()=>{
 const data={rows:[['Cuenta',2025,2023,2024],['Caja',30,10,20],['Capital social',30,10,20]],problems:[]};
 let s=config(data);assert.equal(s.previousYear,2024);assert.equal(s.currentYear,2025);
 let text=T.extract(data,s).text;assert.equal(text,'Cuenta\t2024\t2025\nCaja\t20\t30\nCapital social\t20\t30');
 s={...s,previous:2,previousYear:2023};text=T.extract(data,s).text;assert.match(text,/Caja\t10\t30/);assert.doesNotMatch(text,/2024/);
});
test('CSV semicolon con decimales locales, comillas y acentos',()=>{
 const csv='Cuenta;2025;2024\r\n"Caja y bancos";"1234,56";"0"\r\n"Depreciación acumulada";"0,12";""';
 const wb=T.read(new TextEncoder().encode(csv),'estado.csv',XLSX),data=T.sheetData(wb,wb.SheetNames[0],XLSX);
 const d=draft(data);assert.equal(d.rows[0].amounts.current,1234.56);assert.equal(d.rows[0].amounts.previous,0);assert.equal(d.rows[1].amounts.previous,null);
});
test('CSV con comas respeta separadores de miles dentro de comillas',()=>{
 const wb=T.read(new TextEncoder().encode('Cuenta,2025,2024\nCaja,"1,200.50",0'),'b.csv',XLSX),data=T.sheetData(wb,wb.SheetNames[0],XLSX);
 assert.equal(draft(data).rows[0].amounts.current,1200.5);
});
test('Distingue cero, vacío y celdas ilegibles antes de aplicar',()=>{
 const data={rows:[['Cuenta',2024,2025],['Caja',0,null],['Inventarios','ilegible',20]],problems:[]};const d=draft(data);
 assert.deepEqual(d.rows[0].amounts,{previous:0,current:null});assert.equal(P.validate(d).valid,false);assert.equal(d.rows[1].amounts.previous,'ilegible');
});
test('Sin encabezados exige asignar los años y confirmar columnas',()=>{
 const data={rows:[['Caja',2024,2025],['Capital social',2024,2025]],problems:[]};const s=T.suggest(data.rows);assert.equal(s.header,-1);
 const choice={...s,previousYear:'2024',currentYear:'2025'};
 assert.throws(()=>T.extract(data,choice),/Confirma/);assert.match(T.extract(data,{...choice,confirmed:true}).text,/Caja\t2024\t2025/);
});
test('No permite columnas repetidas, períodos inversos ni rangos inválidos',()=>{
 const data={rows,problems:[]},s=config(data);
 assert.throws(()=>T.extract(data,{...s,current:s.previous}),/distintas/);
 assert.throws(()=>T.extract(data,{...s,previousYear:2026}),/anterior/);
 assert.throws(()=>T.extract(data,{...s,last:999}),/fila/);
});
test('Conserva encabezados de moneda y nombres pero elimina los años no seleccionados',()=>{
 const data={rows:[['PRUEBA S.A.'],['Balance general · C$ miles'],['Cuenta',2023,2024,2025],['Caja',1,2,3]],problems:[]};
 const text=T.extract(data,config(data)).text;assert.match(text,/PRUEBA S.A./);assert.match(text,/C\$ miles/);assert.doesNotMatch(text,/2023/);
});
test('Usa resultados guardados de fórmulas y rechaza faltantes o errores seleccionados',()=>{
 const wb=book(rows);wb.Sheets.Balance.B3={t:'n',f:'100+100',v:200};
 let data=T.sheetData(wb,'Balance',XLSX);assert.equal(data.rows[2][1],200);assert.doesNotThrow(()=>T.extract(data,config(data)));
 wb.Sheets.Balance.B3={t:'n',f:'100+100'};data=T.sheetData(wb,'Balance',XLSX);assert.throws(()=>T.extract(data,config(data)),/B3.*resultado guardado/);
 wb.Sheets.Balance.B3={t:'e',v:7,w:'#DIV/0!'};data=T.sheetData(wb,'Balance',XLSX);assert.throws(()=>T.extract(data,config(data)),/B3.*error de Excel/);
 assert.doesNotThrow(()=>T.extract(data,{...config(data),first:3}));
});
test('Reconoce encabezados con fechas y deja intactos porcentajes y decimales',()=>{
 const wb=book([['Cuenta',new Date('2025-12-31'),new Date('2024-12-31')],['Caja',.125,.05]]);
 const read=T.read(bytes(wb),'dates.xlsx',XLSX),data=T.sheetData(read,'Balance',XLSX),s=config(data);
 assert.equal(s.previousYear,2024);assert.equal(s.currentYear,2025);assert.match(T.extract(data,s).text,/Caja\t0.05\t0.125/);
});
test('Lista hojas, admite hojas vacías y bloquea libros dañados o demasiado grandes',()=>{
 const wb=book(rows);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([]),'Vacía');
 assert.deepEqual(T.sheets(wb).map(x=>x.name),['Balance','Vacía']);assert.deepEqual(T.sheetData(wb,'Vacía',XLSX).rows,[]);
 assert.throws(()=>T.read(new Uint8Array(0),'x.xlsx',XLSX),/vacío/);assert.throws(()=>T.read(new TextEncoder().encode('hola'),'x.xlsx',XLSX),/válido/);
 assert.throws(()=>T.read(new Uint8Array(T.MAX_BYTES+1),'x.xlsx',XLSX),/10 MB/);assert.throws(()=>T.read(new Uint8Array([1]),'x.pdf',XLSX),/xlsx/);
 wb.Sheets.Balance['!ref']='A1:ZZ99999';assert.throws(()=>T.sheetData(wb,'Balance',XLSX),/5,000/);
});

test('Encabezados con fechas conservan la moneda sin introducir años adicionales', () => {
  const data={rows:[['BALANCE GENERAL'],['Saldos al 31 de diciembre de 2026. Moneda: C$'],['Cuenta',2023,2025,2026],['Caja',1,2,3]],problems:[]};
  const text=T.extract(data,config(data)).text;
  assert.match(text,/Moneda: C\$/);assert.doesNotMatch(text,/2023/);
  assert.equal(P.analyze(text,{kind:'balance',periods:{previous:'2025',current:'2026'}}).units.currency,'C$');
});
