/* Convierte una hoja mensual revisable; no modifica la empresa ni sus estados financieros. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const B = node ? require('./budget.js') : root.FinoraBudget;
  const P = node ? require('./paste-import.js') : root.FinoraPaste;
  const labels = { month: 'Mes', ...B.fields };
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = { mes: 'month', periodo: 'month', unidades: 'units', ventasunidades: 'units', precio: 'price', costounitario: 'unitCost', gastosoperativos: 'opex', otrosingresos: 'otherIncome', intereses: 'interest', impuestos: 'taxes', inversiones: 'capex', financiamiento: 'financing', dividendos: 'dividends' };
  const lookup = Object.fromEntries(Object.entries(labels).flatMap(([key, label]) => [[norm(label), key], [norm(key), key]]));
  const suggest = header => Object.fromEntries(Object.keys(labels).map(key => [key, header.findIndex(v => (lookup[norm(v)] || aliases[norm(v)]) === key)]));
  function parse(data, mapping, header = 0) {
    if (!Number.isInteger(header) || header < 0 || header >= data.rows.length) throw new Error('Indica la fila de encabezados.');
    const selected = Object.entries(labels).map(([key]) => mapping[key]).filter(v => Number.isInteger(v) && v >= 0);
    if (new Set(selected).size !== selected.length) throw new Error('Cada columna debe corresponder a un solo campo.');
    if (!(mapping.month >= 0) || !(mapping.units >= 0)) throw new Error('Asigna al menos las columnas Mes y Unidades de venta.');
    const problem = (data.problems || []).find(p => p.r > header && selected.includes(p.c));
    if (problem) throw new Error(`${problem.address}: ${problem.message}`);
    const months = [];
    for (let i = header + 1; i < data.rows.length; i++) {
      const raw = data.rows[i];
      if (!selected.some(c => raw[c] !== null && raw[c] !== undefined && String(raw[c]).trim() !== '')) continue;
      const month = String(raw[mapping.month] ?? '').trim().replace(/^(\d{4}-\d{2})-\d{2}$/, '$1');
      if (!B.nextMonth(month)) throw new Error(`Fila ${i + 1}: indica el mes como AAAA-MM (por ejemplo, 2026-10).`);
      if (months.length && month !== B.nextMonth(months.at(-1).month)) throw new Error(`Fila ${i + 1}: los meses deben ser únicos, consecutivos y estar ordenados.`);
      const row = B.blankMonth(month);
      for (const key of Object.keys(B.fields)) {
        if (!(mapping[key] >= 0)) continue;
        const amount = P.parseAmount(raw[mapping[key]]);
        if (amount !== null && (!Number.isFinite(amount) || Math.abs(amount) > 1e15 || amount < 0 && !['financing','taxes','otherIncome'].includes(key))) throw new Error(`Fila ${i + 1}, ${labels[key]}: importe inválido.`);
        row[key] = amount;
      }
      months.push(row);
    }
    if (!months.length || months.length > 24) throw new Error('Selecciona entre 1 y 24 meses.');
    return months;
  }
  const projectionLabels = { product: 'Producto', period: 'Período', units: 'Unidades', price: 'Precio unitario', unitCost: 'Costo unitario', targetUnits: 'Inventario final manual' };
  function parseProjection(data, config, mapping) {
    const periods = B.periodList(config);
    if (!periods.length) throw new Error('Configura primero el horizonte y la fecha de inicio.');
    const head = data.rows[0] || [];
    mapping ||= Object.fromEntries(Object.entries(projectionLabels).map(([key,label])=>[key,head.findIndex(v=>[norm(label),norm(key),key==='period'?'mes':''].filter(Boolean).includes(norm(v)))]));
    const cols = Object.values(mapping).filter(v=>v>=0);
    if (new Set(cols).size!==cols.length) throw new Error('Asigna una columna distinta a cada campo.');
    if (!(mapping.period>=0) || !(mapping.units>=0)) throw new Error('La tabla necesita columnas Período y Unidades.');
    const bad = (data.problems || []).find(p=>p.r>0 && cols.includes(p.c));
    if (bad) throw new Error(`${bad.address}: ${bad.message}`);
    const products = [], seen = new Set();
    for (let i=1;i<data.rows.length;i++) {
      const row=data.rows[i]; if (!cols.some(col=>row[col]!==null && row[col]!==undefined && String(row[col]).trim()!=='')) continue;
      const key=String(row[mapping.period]??'').trim();
      if (!periods.some(p=>p.key===key)) throw new Error(`Fila ${i+1}: ${key} no pertenece al horizonte configurado.`);
      const name=mapping.product>=0?String(row[mapping.product]??'').trim():'Producto 1';
      if(!name)throw new Error(`Fila ${i+1}: falta el producto.`);
      const identity=JSON.stringify([name,key]);if(seen.has(identity))throw new Error(`Fila ${i+1}: producto y período duplicados.`);seen.add(identity);
      let product=products.find(p=>p.name===name);if(!product){product=B.newProduct(undefined,name);products.push(product);}
      const values={};
      for(const field of ['units','price','unitCost','targetUnits']) {
        const number=mapping[field]>=0?P.parseAmount(row[mapping[field]]):null;
        if(number!==null && (!Number.isFinite(number)||number<0||number>1e15))throw new Error(`Fila ${i+1}: ${projectionLabels[field]} inválido.`);
        values[field]=number;
      }
      product.values[key]=values;
    }
    if(!products.length)throw new Error('No hay productos para importar.');
    return products;
  }
  function parseAcademic(data, c, configured) {
    const s=B.upgrade(c,configured), periods=B.periodList(s.config);
    if(!periods.length)throw new Error('Configura la fecha y los períodos antes de importar.');
    const monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const headerIndex=data.rows.findIndex(row=>row.some(v=>norm(v)==='concepto'));
    if(headerIndex<0)throw new Error('No se encontró la fila Concepto con los períodos en columnas.');
    const header=data.rows[headerIndex], labelCol=header.findIndex(v=>norm(v)==='concepto');
    const cols=periods.map(p=>header.findIndex(v=>String(v??'')===p.key || s.config.frequency==='monthly' && norm(v)===monthNames[Number(p.key.slice(5,7))-1]));
    if(cols.some(col=>col<0)||new Set(cols).size!==cols.length)throw new Error('Las columnas no coinciden con el horizonte. Usa fechas AAAA-MM o años; los nombres de mes solo sirven para un horizonte sin meses repetidos.');
    const bad=(data.problems||[]).find(p=>p.r>headerIndex&&[labelCol,...cols].includes(p.c));if(bad)throw new Error(`${bad.address}: ${bad.message}`);
    const find=pattern=>data.rows.findIndex((row,i)=>i>headerIndex&&pattern.test(norm(row[labelCol])));
    const amount=(row,col,label)=>{const v=row<0?null:P.parseAmount(data.rows[row]?.[col]);if(v!==null&&!Number.isFinite(v))throw new Error(`${label}: importe inválido.`);return v;};
    const rowUnits=find(/^ventasproyectadasunidades$|^unidadesproyectadas$/),rowPrice=find(/^preciodeventa/),rowCost=find(/^costodecompra/);
    if(rowUnits<0||rowPrice<0)throw new Error('Selecciona la hoja de datos: se requieren Unidades proyectadas y Precio de venta.');
    const product=B.newProduct(undefined,'Producto importado');
    const inv=find(/^inventarioinicial.*unid/),policy=find(/^politicainventariofinal/);
    product.initialUnits=amount(inv,cols[0],'Inventario inicial');
    const cost=amount(rowCost,cols[0],'Costo inicial');
    product.initialValue=Number.isFinite(cost)&&Number.isFinite(product.initialUnits)?cost*product.initialUnits:null;
    const pct=amount(policy,cols[0],'Política de inventario'); product.inventoryPercent=pct===null?null:pct*100;
    const tailIndex=data.rows.findIndex((row,i)=>i>headerIndex&&i!==rowUnits&&/^ventas.*unid/.test(norm(row[labelCol])));
    product.nextUnits=amount(tailIndex,cols[0],'Ventas del período posterior');
    periods.forEach((p,i)=>{product.values[p.key]={units:amount(rowUnits,cols[i],'Unidades'),price:amount(rowPrice,cols[i],'Precio'),unitCost:amount(rowCost,cols[i],'Costo')};
      if(policy>=0&&amount(policy,cols[i],'Política de inventario')!==pct)throw new Error('Las políticas de inventario varían por período. Revisa la hoja antes de importar esta política general.');});
    s.products=[product];s.expenses=[];s.expensesNone=false;
    const exclusions=new Set([rowUnits,rowPrice,rowCost,inv,policy,tailIndex]);
    const interestRow=find(/^intereses$/),taxRow=find(/^isr$|^impuestosobrerenta$/);
    exclusions.add(interestRow);exclusions.add(taxRow);
    for(let i=headerIndex+1;i<data.rows.length;i++) {
      if(exclusions.has(i))continue;
      const label=String(data.rows[i][labelCol]??'').trim();
      if(!label||!cols.some(col=>data.rows[i][col]!==null&&data.rows[i][col]!==undefined))continue;
      const category=/depreci|amortiz/.test(norm(label))?'depreciation':/publicidad|venta|comercial/.test(norm(label))?'selling':/salario|alquiler|servicio|admin/.test(norm(label))?'administration':'unclassified';
      s.expenses.push({id:'import-'+i,label,category,mode:'manual',origin:'Archivo de supuestos',values:Object.fromEntries(periods.map((p,j)=>[p.key,amount(i,cols[j],label)]))});
    }
    s.result.interestMode=interestRow>=0?'manual':'none';s.result.interest=Object.fromEntries(periods.map((p,i)=>[p.key,amount(interestRow,cols[i],'Intereses')]));
    if(taxRow>=0){const rate=amount(taxRow,cols[0],'ISR');if(cols.some(col=>amount(taxRow,col,'ISR')!==rate))throw new Error('Las tasas de ISR varían. Revísalas antes de importar una tasa general.');s.result.taxMode='rate';s.result.taxRate=rate===null?null:rate*100;}
    s.advanced.confirmed=false;return s;
  }
  const api = { labels, suggest, parse, projectionLabels, parseProjection, parseAcademic };
  if (node) module.exports = api; else root.FinoraBudgetImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
