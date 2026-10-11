'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../assets/js/paste-import.js');
const C = require('../assets/js/casos.js');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const confirm = draft => { draft.rows.forEach(row => { row.confirmed = true; }); return draft; };
const options = { kind: 'balance', periods: { previous: '2024', current: '2025' } };
const empty = () => ({ id:'stable-id', name:'Mi empresa', currency:'C$', scale:'miles', statementDate:'al cierre', params:{days:360}, periods:{...options.periods}, balance:[],income:[],reported:{},custom:{keep:true} });
const errors = draft => P.validate(draft).errors.map(issue => issue.code);

test('Mundo Moda conserva 18 cuentas, grupos, depreciaciones y 11 totales sin sumarlos dos veces', () => {
  const draft = P.analyze(fixture('5-mundo-moda-balance.txt'), options);
  assert.deepEqual(draft.periods,{previous:'2018',current:'2019'});
  assert.equal(draft.rows.length,18); assert.equal(draft.totals.length,11);
  assert.equal(draft.rows.filter(row=>row.sign===-1).length,2);
  assert.equal(draft.rows.find(row=>row.name==='Franquicias').group,'Otros activos');
  assert.equal(draft.rows.find(row=>row.name==='Franquicias').amounts.current,0);
  assert.equal(draft.rows.some(row=>/^total/i.test(row.name)),false);
  assert.ok(errors(draft).includes('review'));
  confirm(draft); assert.equal(P.validate(draft).valid,true);
  const model=P.buildCase(empty(),draft); const analysis=C.analyzeBalance(model);
  assert.deepEqual(analysis.totals.assets,{previous:871475,current:1094142.25});
  assert.deepEqual(analysis.totals.liabilities,{previous:283660,current:330592});
  assert.deepEqual(model.reported,C.samples['mundo-moda']().reported);
  assert.ok(P.validate(draft).totals.every(total=>total.status==='ok'));
});

test('Dayton balance ordena 2012/2011 sin alterar las cantidades', () => {
  const draft=confirm(P.analyze(fixture('4-dayton-balance.txt'),options));
  assert.deepEqual(draft.periods,{previous:'2011',current:'2012'});
  assert.equal(draft.rows.length,14);
  assert.deepEqual(draft.rows[0].amounts,{previous:6547,current:7229});
  const analysis=C.analyzeBalance(P.buildCase(empty(),draft));
  assert.deepEqual(analysis.totals.assets,{previous:143174,current:152644});
  assert.equal(analysis.engine.current.balanced,true);
  assert.ok(P.validate(draft).totals.every(total=>total.status==='ok'));
});

test('Dayton resultados mantiene tasa de impuestos y utilidades calculadas', () => {
  const draft=confirm(P.analyze(fixture('4-dayton-resultados.txt'),{...options,kind:'income'}));
  assert.equal(draft.rows.length,8);
  assert.deepEqual(draft.rows.find(row=>row.category==='taxRate').amounts,{previous:.37495,current:.35324});
  const model=P.buildCase(empty(),draft),income=C.analyzeIncome(model);
  assert.ok(Math.abs(income.statements.current.netProfit-9006.77976)<1e-8);
  assert.equal(model.reported['income:netProfit'].previous,15431.2344);
  assert.equal(P.validate(draft).totals.length,5);
  assert.ok(P.validate(draft).totals.every(total=>total.status==='ok'));
});

test('Analizar y revisar no modifica el caso, ni escribe almacenamiento', () => {
  const model=C.samples.dayton(); const before=JSON.stringify(model);
  const draft=P.analyze('Cuenta\t2011\t2012\nBanco\t10\t20',{kind:'balance',periods:model.periods});
  P.validate(draft,model);
  const next=P.buildCase(model,draft);
  assert.equal(JSON.stringify(model),before); assert.notEqual(next,model);
  assert.deepEqual(next.income,model.income); assert.deepEqual(next.params,model.params);
  assert.equal(next.name,model.name);assert.equal(next.id,model.id);assert.equal(next.currency,model.currency);assert.equal(next.sample,model.sample);
});

test('Reemplazar balance conserva resultados y sus comprobaciones', () => {
  const model=empty();model.reported={assets:{previous:1,current:1},'asset|Viejo':{previous:1,current:1},'income:netProfit':{previous:4,current:5}};
  model.balance=[{id:'old',name:'vieja',amounts:{previous:1,current:1}}];
  const draft=P.analyze('Banco\t12\t13',options),next=P.buildCase(model,draft);
  assert.equal(next.balance.length,1);assert.equal(next.balance[0].name,'Banco');
  assert.deepEqual(next.reported,{'income:netProfit':{previous:4,current:5}});assert.deepEqual(next.custom,model.custom);
});

test('Reemplazar resultados conserva balance y sus comprobaciones', () => {
  const model=empty();model.reported={assets:{previous:1,current:1},'income:netProfit':{previous:4,current:5}};
  const draft=P.analyze('Ventas\t12\t13',{...options,kind:'income'}),next=P.buildCase(model,draft);
  assert.deepEqual(next.balance,model.balance);assert.deepEqual(next.reported,{assets:{previous:1,current:1}});
});

test('Cambiar períodos bloquea reemplazo si el otro estado tiene datos, incluso cero', () => {
  const model=empty();model.income=[{id:'i1',category:'sales',sign:1,amounts:{previous:0,current:0}}];
  const draft=P.analyze('Cuenta\t2022\t2023\nBanco\t10\t20',options);
  assert.ok(P.validate(draft,model).errors.some(issue=>issue.code==='period-conflict'));
  assert.throws(()=>P.buildCase(model,draft),/años no coinciden/);
});

test('Agregar filas preserva datos y totales originales, con identificadores sin colisión', () => {
  const model=empty();model.balance=[{id:'paste-b-1',name:'Banco existente',section:'asset',term:'current',group:'Activos circulantes',role:'cash',sign:1,amounts:{previous:20,current:30}}];
  model.reported={assets:{previous:20,current:30}};
  const draft=P.analyze('Banco\t3\t4\nTotal\t3\t4',{...options,mode:'append',context:{block:0,group:'Activos circulantes'}});
  const next=P.buildCase(model,draft);
  assert.equal(next.balance.length,2);assert.deepEqual(next.balance[0],model.balance[0]);
  assert.notEqual(next.balance[1].id,next.balance[0].id);assert.deepEqual(next.reported,model.reported);
});

test('Agregar filas exige mismos años aunque el otro estado esté vacío', () => {
  const model=empty();model.balance=[{id:'b',amounts:{previous:0,current:0}}];
  const draft=P.analyze('Cuenta\t2022\t2023\nBanco\t10\t20',{...options,mode:'append'});
  assert.ok(P.validate(draft,model).errors.some(issue=>issue.code==='period-conflict'));
});

test('Agregar una depreciación considera el activo ya existente', () => {
  const model=empty();model.balance=[{id:'fixed',name:'Equipo',section:'asset',term:'noncurrent',role:'fixed',sign:1,amounts:{previous:100,current:100}}];
  const draft=P.analyze('Depreciación acumulada\t10\t20',{...options,mode:'append'});
  assert.equal(P.validate(draft,model).valid,true);assert.equal(P.buildCase(model,draft).balance.length,2);
});

test('Cero y las dos posiciones vacías se conservan separados', () => {
  const draft=P.analyze('Cuenta\t2024\t2025\nBanco\t0\t\nCliente\t\t0',options);
  assert.deepEqual(draft.rows[0].amounts,{previous:0,current:null});
  assert.deepEqual(draft.rows[1].amounts,{previous:null,current:0});
  assert.equal(P.validate(draft).valid,true);assert.ok(P.validate(draft).warnings.some(warning=>warning.code==='blank'));
});

test('Una fila que equivale a la suma de anteriores sigue siendo cuenta', () => {
  const draft=P.analyze('Banco\t100\t100\nCliente\t40\t40\nInventario\t140\t140',options);
  assert.equal(draft.rows.length,3);assert.equal(draft.totals.length,0);
});

test('Desconocidas requieren confirmar clasificación o excluir, incluso debajo de un encabezado', () => {
  const draft=P.analyze('ACTIVOS CIRCULANTES\nFondo nuevo\t5\t10\nBanco\t1\t2',options);
  const unknown=draft.rows[0];assert.equal(unknown.section,'asset');assert.equal(unknown.needsReview,true);
  assert.ok(errors(draft).includes('review'));
  unknown.confirmed=true;assert.equal(P.validate(draft).valid,true);
  unknown.confirmed=false;unknown.include=false;assert.equal(P.validate(draft).valid,true);
});

test('Contexto de pegar en un grupo clasifica sugerencia, pero exige confirmarla', () => {
  const draft=P.analyze('Anticipo especial\t5\t10',{...options,mode:'append',context:{block:0,group:'Anticipos'}});
  assert.equal(draft.rows[0].section,'asset');assert.equal(draft.rows[0].term,'current');assert.equal(draft.rows[0].group,'Anticipos');
  assert.ok(errors(draft).includes('review'));confirm(draft);assert.equal(P.validate(draft).valid,true);
});

test('Confirmar una cuenta sin clasificación no permite aplicarla', () => {
  const draft=confirm(P.analyze('Fila desconocida\t5\t10',options));
  assert.ok(errors(draft).includes('classification'));assert.throws(()=>P.buildCase(empty(),draft));
});

test('Una celda inválida nunca se desplaza a otro período ni desaparece', () => {
  for(const text of ['Banco\tno sirve\t20','Banco\t20\tno sirve','Banco\tmal\tpeor','Extraña\tmal\tpeor']){
    const draft=confirm(P.analyze('Cuenta\t2024\t2025\n'+text,options));
    assert.equal(draft.rows.length,1);assert.ok(errors(draft).includes('amount'));
    assert.throws(()=>P.buildCase(empty(),draft));
  }
});

test('Parser numérico valida agrupadores y formatos locales', () => {
  for(const [text,value] of [['1,234.56',1234.56],['1.234,56',1234.56],['12,5',12.5],['1 234,50',1234.5],['(1,234.56)',-1234.56],['C$ 123',123],['0',0],['.35',.35],['',null]])assert.equal(P.parseAmount(text),value,text);
  for(const text of ['1,,234','1.2.3','12 34','1,23,45','1.234,5,6','abc','Infinity','10000000000000001'])assert.equal(Number.isNaN(P.parseAmount(text)),true,text);
});

test('Más de dos columnas se bloquea y no se importa silenciosamente', () => {
  const draft=confirm(P.analyze('Cuenta\t2023\t2024\t2025\nBanco\t1\t2\t3',options));
  assert.ok(errors(draft).includes('columns'));assert.throws(()=>P.buildCase(empty(),draft));
});

test('Años idénticos, invertidos o fuera de rango no se aceptan en revisión', () => {
  const draft=P.analyze('Banco\t1\t2',options);
  for(const periods of [{previous:'2025',current:'2024'},{previous:'2024',current:'2024'},{previous:'1899',current:'2024'},{previous:'2024',current:'2101'}]){draft.periods=periods;assert.ok(errors(draft).includes('periods'));}
});

test('Totales discrepantes permanecen comprobables y no se convierten en cuentas', () => {
  const draft=P.analyze('ACTIVOS CIRCULANTES\nBanco\t10\t20\nTotal\t11\t25',options);
  assert.equal(draft.rows.length,1);assert.equal(draft.totals.length,1);
  assert.equal(P.validate(draft).totals[0].status,'diff');assert.deepEqual(draft.reported['asset|Activos circulantes'],{previous:11,current:25});
});

test('Un total con detalle parcial no agrega otra cuenta ni inventa partidas restantes', () => {
  const draft=P.analyze('Banco\t10\t20\nTotal activos corrientes\t100\t200',options);
  assert.equal(draft.rows.length,1);assert.equal(draft.rows[0].memo,undefined);
  assert.equal(P.validate(draft).totals[0].status,'diff');
});

test('La API del navegador funciona sin módulos, red ni localStorage', () => {
  const sandbox={};vm.createContext(sandbox);
  for(const filename of ['finance.js','table-import.js','paste-import.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js',filename),'utf8'),sandbox);
  assert.equal(typeof sandbox.FinoraPaste.analyze,'function');
  const draft=sandbox.FinoraPaste.analyze('Banco\t10\t20',options);
  assert.equal(sandbox.FinoraPaste.validate(draft).valid,true);
});

test('Cambiar el grupo durante la revisión remapea su total informado', () => {
  const draft=P.analyze('Banco\t10\t20\nTotal\t10\t20',options);
  draft.rows[0].group='Disponibilidades';
  const model=P.buildCase(empty(),draft);
  assert.equal(model.reported['asset|Activos circulantes'],undefined);
  assert.deepEqual(model.reported['asset|Disponibilidades'],{previous:10,current:20});
});

test('Totales de ventas por membresía usan la categoría contable sin duplicarla', () => {
  const draft=confirm(P.analyze('Ventas al contado\t10\t20\nVentas a empresas\t5\t10\nTotal\t15\t30',{...options,kind:'income'}));
  const model=P.buildCase(empty(),draft);
  assert.equal(model.income.length,2);
  assert.deepEqual(model.reported['income:sales'],{previous:15,current:30});
});

test('Dos importes parecidos a años no ocultan una cuenta desconocida', () => {
  const draft=P.analyze('Cuenta especial\t2018\t2019',options);
  assert.equal(draft.rows.length,1);assert.deepEqual(draft.rows[0].amounts,{previous:2018,current:2019});
  assert.deepEqual(draft.periods,options.periods);
});

test('Negativos entre paréntesis normalizan la resta de la depreciación', () => {
  const draft=P.analyze('Equipo de oficina\t100\t200\nDepreciación acumulada\t(10)\t(20)',options);
  assert.equal(draft.rows[1].sign,-1);assert.deepEqual(draft.rows[1].amounts,{previous:10,current:20});
  assert.equal(P.validate(draft).valid,true);
});

test('Un encabezado con dos años conserva el primero aunque falte el tabulador final', () => {
  const draft=P.analyze('Cuenta\t2024\t2025\nBanco\t10',options);
  assert.deepEqual(draft.columns,['previous','current']);
  assert.deepEqual(draft.rows[0].amounts,{previous:10,current:null});
  assert.equal(P.validate(draft).valid,true);
});

test('Una cuenta incluida conserva sus dos importes vacíos tras revisar', () => {
  const draft = confirm(P.analyze('Cuenta\t2024\t2025\nEfectivo\t10\t20\nInventarios\t5\t6', options));
  draft.rows[1].amounts = { previous: null, current: null };
  const next = P.buildCase(empty(), draft);
  assert.equal(next.balance.length, 2);
  assert.deepEqual(next.balance[1].amounts, { previous: null, current: null });
  assert.equal(next.balance[1].name, 'Inventarios');
});

test('El punto final de una abreviatura se conserva y no impide reconocer la cuenta', () => {
  const draft = P.analyze(fixture('5-mundo-moda-balance.txt'), options);
  const names = draft.rows.map(row => row.name);
  ['Seguro pagado x Ad.', 'Depreciación acumulada Trans.', 'Depreciación acum. Equ. de ofi.'].forEach(name => assert.ok(names.includes(name), `falta «${name}» en ${names}`));
  const sample = C.samples['mundo-moda']().balance.map(a => a.name);
  assert.deepEqual(names, sample);
  // «Banco.» con punto sigue en el catálogo (efectivo) y los encabezados con punto siguen siendo encabezados.
  const dotted = P.analyze('Cuenta\t2024\t2025\nActivos circulantes.\nBanco.\t100\t200\nTotal activos circulantes.\t100\t200', options);
  assert.equal(dotted.rows.length, 1); assert.equal(dotted.rows[0].role, 'cash'); assert.equal(dotted.rows[0].name, 'Banco.');
  assert.equal(dotted.totals.length, 1);
});

test('Moneda y escala del documento: se ofrecen y solo cambian la empresa si se aceptan', () => {
  const draft = confirm(P.analyze(fixture('5-mundo-moda-balance.txt'), options));
  assert.deepEqual(draft.units, { currency: 'U$', scale: 'miles' });
  const model = { ...empty(), currency: 'C$', scale: '' };
  const kept = P.buildCase(model, draft);
  assert.equal(kept.currency, 'C$'); assert.equal(kept.scale, '');
  draft.applyUnits = true;
  const changed = P.buildCase(model, draft);
  assert.equal(changed.currency, 'U$'); assert.equal(changed.scale, 'miles');
  assert.equal(changed.balance[0].amounts.previous, 88342, 'los importes no se multiplican');
  assert.equal(P.analyze('Cuenta\t2024\t2025\nBanco\t1\t2', options).units, null);
});

test('Sugerencia de uso por palabra clave respeta sección y plazo', () => {
  const R = require('../assets/js/table-import.js');
  assert.equal(R.suggestRole('Caja chica', 'asset', 'current'), 'cash');
  assert.equal(R.suggestRole('Clientes nacionales', 'asset', 'current'), 'receivables');
  assert.equal(R.suggestRole('Préstamo bancario', 'liability', 'noncurrent'), 'longDebt');
  assert.equal(R.suggestRole('Caja chica', 'asset', 'noncurrent'), null);
  assert.equal(R.suggestRole('Seguro pagado', 'asset', 'current'), null);
});
