/* Copia del motor de GestiCode (Desktop/GestiCode/dist/finance.js). No editar aquí: los cambios van en GestiCode y se vuelven a copiar. */
/* Motor financiero puro: estados, razones, CVU y escenarios independientes. */
(function (root) {
  'use strict';
  const keys = ['sales', 'profit', 'cash', 'receivables', 'inventory', 'fixed', 'payables', 'otherCurrent', 'longDebt'];
  // Calculadoras rápidas: adaptadores sobre el motor central. No tienen fórmulas propias; una cifra nunca puede diferir de Razones o Escenarios.
  function dupont({ profit, sales, assets, equity }) {
    if (![profit, sales, assets, equity].every(Number.isFinite) || sales <= 0 || assets <= 0 || equity <= 0 || equity > assets) throw new Error('Ventas, activos y patrimonio deben ser positivos; patrimonio no mayor que activos.');
    const p = calculateProfitability({ assets, equity }, { sales, netProfit: profit, grossProfit: null, ebit: null }, null, { returnMethod: 'closing' });
    return { margin: p.metrics.netMargin.value, turnover: p.dupont.turnover.value, leverage: p.dupont.leverage.value, roe: p.dupont.roe.value, roa: p.metrics.roa.value };
  }
  // Margen neto constante: se expresa como un estado de resultados donde todo el costo es variable, sin intereses ni impuestos, y se resuelve con simulateModel.
  function simulate(base, growth = 0, repayment = 0) {
    if (keys.some(k => !Number.isFinite(base[k]) || Math.abs(base[k]) > 1e15 || (k !== 'profit' && base[k] < 0)) || base.sales <= 0) throw new Error('Completa la base con importes válidos; ventas mayores que cero y solo la utilidad puede ser negativa.');
    if (!Number.isFinite(growth) || growth < -50 || growth > 50 || !Number.isFinite(repayment) || repayment < 0 || repayment > 100) throw new Error('Los cambios deben estar dentro del rango de los controles.');
    const assets = base.cash + base.receivables + base.inventory + base.fixed;
    const currentLiabilities = base.payables + base.otherCurrent;
    const equity = assets - currentLiabilities - base.longDebt;
    if (equity <= 0 || assets <= 0) throw new Error('La base necesita activos y patrimonio positivos. El patrimonio se obtiene restando todos los pasivos a los activos.');
    if (base.profit > base.sales) throw new Error('La utilidad no puede superar las ventas: el margen neto constante sería mayor que 100 %.');
    const account = (name, section, term, role, amount) => ({ name, section, term, role, sign: 1, memo: false, amount });
    const line = (name, category, amount) => ({ name, category, sign: 1, amount });
    const model = { year: 2000, params: { days: 365, purchaseRate: .7, returnMethod: 'closing' }, previous: null, current: { year: 2000,
      balance: { accounts: [account('Efectivo', 'asset', 'current', 'cash', base.cash), account('Cuentas por cobrar', 'asset', 'current', 'receivables', base.receivables), account('Inventarios', 'asset', 'current', 'inventory', base.inventory), account('Activos no corrientes', 'asset', 'noncurrent', 'fixed', base.fixed),
        account('Cuentas por pagar', 'liability', 'current', 'payables', base.payables), account('Otros pasivos corrientes', 'liability', 'current', null, base.otherCurrent), account('Deuda a largo plazo', 'liability', 'noncurrent', 'longDebt', base.longDebt), account('Patrimonio', 'equity', null, null, equity)] },
      income: { accounts: [line('Ventas', 'sales', base.sales), line('Costo total, todo variable', 'costSales', base.sales - base.profit), line('Gastos operativos', 'opex', 0), line('Costos fijos', 'fixedCosts', 0), line('Intereses', 'interest', 0), line('Impuestos', 'taxes', 0), line('Dividendos preferentes', 'preferred', 0)] } } };
    const sim = simulateModel(model, growth, repayment);
    const view = a => ({ profit: a.currentIncome.netProfit, sales: a.currentIncome.sales, assets: a.currentBalance.assets, equity: a.currentBalance.equity, cash: a.currentBalance.cash, currentAssets: a.currentBalance.currentAssets, currentLiabilities: a.currentBalance.currentLiabilities, roa: a.profitability.metrics.roa.value, roe: a.profitability.metrics.roe.value, liquidity: a.liquidity.currentRatio.value, workingCapital: a.liquidity.workingCapital.value });
    const scenario = view(sim.result);
    if (scenario.equity <= 0 || scenario.assets <= 0) throw new Error('El escenario deja activos o patrimonio no positivos; no se interpretan ROA ni ROE.');
    return { base: view(sim.base), scenario, retainedChange: sim.retainedChange, payment: sim.payment, growth, repayment };
  }
  const validYear = v => Number.isInteger(v) && v >= 1901 && v <= 9999;
  const balanceKeys = ['cash','receivables','inventory','otherCurrentAssets','fixed','otherNonCurrentAssets','payables','otherCurrentLiabilities','longDebt','otherNonCurrentLiabilities','equity'];
  const incomeKeys = ['sales','creditSales','costSales','operatingExpenses','fixedCosts','fixedCostSales','otherIncome','interest','taxes','taxRate','preferredDividends','shares'];
  const cvuKeys = ['price','quantity','variableCost','fixedCosts','taxRate','interest','preferredDividends','shares'];
  const num = (v, label, negative = false) => {
    const labels={cash:'Efectivo',receivables:'Cuentas por cobrar',inventory:'Inventarios',otherCurrentAssets:'Otros activos corrientes',fixed:'Activos fijos',otherNonCurrentAssets:'Otros activos no corrientes',payables:'Cuentas por pagar',otherCurrentLiabilities:'Otros pasivos corrientes',longDebt:'Deuda a largo plazo',otherNonCurrentLiabilities:'Otros pasivos no corrientes',equity:'Patrimonio',sales:'Ventas',creditSales:'Ventas a crédito',costSales:'Costo de ventas',operatingExpenses:'Gastos operativos',fixedCosts:'Costos fijos',fixedCostSales:'Costos fijos del costo de ventas',otherIncome:'Otros ingresos',interest:'Intereses',taxes:'Impuestos',preferredDividends:'Dividendos preferentes',shares:'Acciones',price:'Precio unitario',quantity:'Cantidad',variableCost:'Costo variable unitario',taxRate:'Tasa de impuesto'};
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v)>1e15 || (!negative && v<0)) throw new Error(`${labels[label]||label}: ingresa un número ${negative?'válido':'no negativo'} (máximo 10¹⁵).`);
    return v;
  };
  const metric = (value, unit, formula, reason = '') => ({value:Number.isFinite(value)?value:null,unit,formula,reason:Number.isFinite(value)?'':reason||'No calculable con estos datos'});
  const divide = (n,d,unit,formula,reason='Base cero o negativa') => metric(Number.isFinite(n)&&Number.isFinite(d)&&d>0?n/d:null,unit,formula,reason);
  const roleNames={inventory:'Inventarios',receivables:'Cuentas por cobrar',payables:'Cuentas por pagar',fixed:'Activos fijos'};
  // Una razón que necesita una cuenta con rol no se calcula si esa cuenta no fue informada (cero explícito ≠ sin informar).
  const withRole=(m,role,...balances)=>balances.some(x=>x?.provided?.[role]===false)?metric(null,m.unit,m.formula,`${roleNames[role]} no informados: agrega la cuenta con ese rol o escribe 0.`):m;
  // Balance parcial: cada parte se declara completa o no; una razón solo se calcula si todas las partes que usa están completas.
  const partNames={currentAssets:'activos corrientes',nonCurrentAssets:'activos no corrientes',currentLiabilities:'pasivos corrientes',nonCurrentLiabilities:'pasivos no corrientes',equity:'patrimonio'};
  const partKeys=Object.keys(partNames);
  const needParts=(m,parts,...balances)=>{const missing=parts.filter(part=>balances.some(x=>x?.known?.[part]===false));return missing.length?metric(null,m.unit,m.formula,`Balance parcial: marca como completas estas partes: ${missing.map(part=>partNames[part]).join(', ')}.`):m;};
  // Estado de resultados parcial: una razón solo se calcula si todas las categorías que usa están declaradas completas.
  const incomeNames={sales:'ventas',costSales:'costo de ventas',operatingExpenses:'gastos operativos',interest:'gastos por intereses',taxes:'impuestos',preferredDividends:'dividendos preferentes'};
  const incomeKnownAll=()=>Object.fromEntries(Object.keys(incomeNames).map(k=>[k,true]));
  const needIncome=(m,keys,i)=>{const missing=keys.filter(k=>i?.known?.[k]===false);if(!missing.length)return m;const text=`Estado de resultados parcial: marca como completas estas categorías: ${missing.map(k=>incomeNames[k]).join(', ')}.`;return metric(null,m.unit,m.formula,m.value===null&&m.reason.startsWith('Balance parcial')?`${m.reason} ${text}`:text);};
  // Balance por cuentas: cada cuenta declara sección, plazo, rol en las razones y tratamiento.
  const roleRules={cash:['asset','current','Efectivo'],receivables:['asset','current','Cuentas por cobrar'],inventory:['asset','current','Inventarios'],fixed:['asset','noncurrent','Activos fijos netos'],payables:['liability','current','Cuentas por pagar'],longDebt:['liability','noncurrent','Deuda a largo plazo']};
  const accountTemplate=[['cash','Efectivo y bancos','asset','current','cash'],['receivables','Cuentas por cobrar','asset','current','receivables'],['inventory','Inventarios','asset','current','inventory'],['otherCurrentAssets','Otros activos corrientes','asset','current',null],['fixed','Activos fijos netos','asset','noncurrent','fixed'],['otherNonCurrentAssets','Otros activos no corrientes','asset','noncurrent',null],['payables','Cuentas por pagar','liability','current','payables'],['otherCurrentLiabilities','Otros pasivos corrientes','liability','current',null],['longDebt','Deuda a largo plazo','liability','noncurrent','longDebt'],['otherNonCurrentLiabilities','Otros pasivos no corrientes','liability','noncurrent',null],['equity','Patrimonio','equity',null,null]];
  // Catálogo: al elegir un nombre conocido, la interfaz asigna sola clasificación, rol y tratamiento.
  const normalizeName=text=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const accountCatalog=[
    ['Efectivo y bancos','asset','current','cash'],['Efectivo','asset','current','cash'],['Caja y bancos','asset','current','cash'],['Valores negociables','asset','current',null],['Cuentas por cobrar','asset','current','receivables'],['Inventarios','asset','current','inventory'],
    ['Gastos pagados por anticipado','asset','current',null],['Otros activos corrientes','asset','current',null],['Total activos corrientes','asset','current',null],
    ['De los cuales: efectivo','asset','current','cash',1,true],['De los cuales: cuentas por cobrar','asset','current','receivables',1,true],['De los cuales: inventarios','asset','current','inventory',1,true],
    ['Terrenos y edificios','asset','noncurrent','fixed'],['Maquinaria y equipo','asset','noncurrent','fixed'],['Mobiliario y accesorios','asset','noncurrent','fixed'],['Vehículos','asset','noncurrent','fixed'],['Depreciación acumulada','asset','noncurrent','fixed',-1],['Activos fijos netos','asset','noncurrent','fixed'],
    ['Inversiones a largo plazo','asset','noncurrent',null],['Activos intangibles','asset','noncurrent',null],['Otros activos no corrientes','asset','noncurrent',null],['Total activos no corrientes','asset','noncurrent',null],
    ['Cuentas por pagar','liability','current','payables'],['Documentos por pagar','liability','current',null],['Deudas acumuladas','liability','current',null],['Porción corriente de la deuda a largo plazo','liability','current',null],['Otros pasivos corrientes','liability','current',null],['Total pasivos corrientes','liability','current',null],['De los cuales: cuentas por pagar','liability','current','payables',1,true],
    ['Deuda a largo plazo','liability','noncurrent','longDebt'],['Bonos por pagar','liability','noncurrent','longDebt'],['Otros pasivos no corrientes','liability','noncurrent',null],['Total pasivos no corrientes','liability','noncurrent',null],
    ['Acciones preferentes','equity',null,null],['Acciones comunes','equity',null,null],['Capital pagado en exceso','equity',null,null],['Utilidades retenidas','equity',null,null],['Acciones en tesorería','equity',null,null,-1],['Patrimonio','equity',null,null],['Patrimonio total','equity',null,null],['Capital social','equity',null,null],['Ganancias retenidas','equity',null,null],['Utilidades','equity',null,null],
    ['Efectivo y equivalentes','asset','current','cash'],['Efectivos y equivalentes','asset','current','cash'],['Efectivo y equivalentes de efectivo','asset','current','cash'],
    ['IVA por cobrar','asset','current',null],['IVA x cobrar','asset','current',null],['Seguros pagados por anticipado','asset','current',null],['Seguro pagado por adelantado','asset','current',null],
    ['Propiedad, planta y equipo','asset','noncurrent','fixed'],['Propiedad, planta y equipo brutos','asset','noncurrent','fixed'],['Propiedad, planta y equipo netos','asset','noncurrent','fixed'],['Depreciación y agotamientos acumulados','asset','noncurrent','fixed',-1],['Equipo de transporte','asset','noncurrent','fixed'],['Equipo de oficina','asset','noncurrent','fixed'],['Franquicias','asset','noncurrent',null],
    ['IVA por pagar','liability','current',null],['IVA x pagar','liability','current',null],['IR por pagar','liability','current',null],['IR x pagar','liability','current',null],['Acreedores','liability','current',null],['Acreedor','liability','current',null],
    ['Banco','asset','current','cash'],['Bancos','asset','current','cash'],['Clientes','asset','current','receivables'],['Cliente','asset','current','receivables'],['Inventario','asset','current','inventory'],['Proveedores','liability','current','payables'],['Proveedor','liability','current','payables'],
    ['Deuda por pagar a corto plazo','liability','current',null],['Deuda por pagar a largo plazo','liability','noncurrent','longDebt'],['Impuesto sobre la renta diferido','liability','noncurrent',null],
  ].map(([name,section,term,role,sign=1,memo=false])=>({name,section,term,role,sign,memo}));
  const matchAccount=name=>{const key=normalizeName(name);const hit=key?accountCatalog.find(entry=>normalizeName(entry.name)===key):null;return hit?{...hit}:null;};
  const defaultAccounts=()=>accountTemplate.map(([id,name,section,term,role])=>({id,name,section,term,role,sign:1,memo:false,amounts:{previous:null,current:null}}));
  const accountsFromBalances=({previous=null,current=null}={})=>{const rows=defaultAccounts();for(const row of rows)for(const [side,b] of [['previous',previous],['current',current]]){const v=b?.[row.id];row.amounts[side]=typeof v==='number'&&Number.isFinite(v)?v:null;}return rows;};
  const accountsForPeriod=(accounts,side)=>(accounts||[]).map(a=>({name:a.name,section:a.section,term:a.term,role:a.role??null,sign:a.sign??1,memo:!!a.memo,amount:a.amounts?.[side]??null}));
  function balanceFromAccounts(accounts, complete) {
    if(complete!==undefined&&complete!==null&&(typeof complete!=='object'||partKeys.some(part=>typeof complete[part]!=='boolean')))throw new Error('Indica qué partes del balance están completas.');
    const known=Object.fromEntries(partKeys.map(part=>[part,complete?complete[part]:true])),partial=!partKeys.every(part=>known[part]);
    const totals={'asset.current':0,'asset.noncurrent':0,'liability.current':0,'liability.noncurrent':0,equity:0};
    const roles=Object.fromEntries(Object.keys(roleRules).map(r=>[r,0])),provided=Object.fromEntries(Object.keys(roleRules).map(r=>[r,false]));
    let counted=0;
    accounts.forEach((a,index)=>{
      const name=String(a?.name??'').trim()||`Cuenta ${index+1}`;
      if(!a||typeof a!=='object')throw new Error(`${name}: cuenta inválida.`);
      if(a.amount===null||a.amount===undefined)return; // En blanco: no informada, no equivale a cero.
      if(!['asset','liability','equity'].includes(a.section))throw new Error(`${name}: indica si es activo, pasivo o patrimonio.`);
      const equity=a.section==='equity';
      if(!equity&&!['current','noncurrent'].includes(a.term))throw new Error(`${name}: indica si es corriente o no corriente.`);
      const role=a.role??null;
      if(role!==null){
        if(!Object.hasOwn(roleRules,role))throw new Error(`${name}: rol desconocido.`);
        const [section,term,label]=roleRules[role];
        if(a.section!==section||a.term!==term)throw new Error(`${name}: el rol «${label}» solo aplica a ${section==='asset'?'activos':'pasivos'} ${term==='current'?'corrientes':'no corrientes'}.`);
      }
      const sign=a.sign??1;
      if(sign!==1&&sign!==-1)throw new Error(`${name}: el efecto debe ser suma o resta.`);
      if(a.memo&&role===null)throw new Error(`${name}: una cuenta «de los cuales» necesita un rol; si es una cuenta normal, trátala como suma.`);
      const signed=sign*num(a.amount,name,equity);
      counted++;
      if(!a.memo)totals[equity?'equity':`${a.section}.${a.term}`]+=signed;
      if(role!==null){roles[role]+=signed;provided[role]=true;}
    });
    if(!counted)throw new Error('Agrega al menos una cuenta con importe al balance.');
    for(const [role,total] of Object.entries(roles))if(provided[role]&&total<-1e-6)throw new Error(`${roleRules[role][2]}: las cuentas que restan superan a las que suman; revisa los importes.`);
    const rest=(total,used,label)=>{const value=total-used;if(Math.abs(value)<1e-6)return 0;if(value<0)throw new Error(`${label} suman más que el total corriente/no corriente registrado. Revisa los roles o trata esas cuentas como «de los cuales» dentro de un total.`);return value;};
    return {cash:roles.cash,receivables:roles.receivables,inventory:roles.inventory,otherCurrentAssets:known.currentAssets?rest(totals['asset.current'],roles.cash+roles.receivables+roles.inventory,'Efectivo, cuentas por cobrar e inventarios'):null,
      fixed:roles.fixed,otherNonCurrentAssets:known.nonCurrentAssets?rest(totals['asset.noncurrent'],roles.fixed,'Los activos fijos netos'):null,
      payables:roles.payables,otherCurrentLiabilities:known.currentLiabilities?rest(totals['liability.current'],roles.payables,'Las cuentas por pagar'):null,
      longDebt:roles.longDebt,otherNonCurrentLiabilities:known.nonCurrentLiabilities?rest(totals['liability.noncurrent'],roles.longDebt,'La deuda a largo plazo'):null,
      equity:known.equity?totals.equity:null,provided,known,partial};
  }
  function calculateBalance(data, options = {}) {
    if(Array.isArray(data?.accounts))data=balanceFromAccounts(data.accounts,data.complete);
    const provided=data?.provided??Object.fromEntries(Object.keys(roleRules).map(r=>[r,true]));
    const known=data?.known??Object.fromEntries(partKeys.map(part=>[part,true])),partial=!partKeys.every(part=>known[part]);
    balanceKeys.forEach(k=>{if(partial&&data?.[k]===null)return;num(data?.[k], k, k==='equity');});
    const currentAssets=known.currentAssets?data.cash+data.receivables+data.inventory+data.otherCurrentAssets:null;
    const nonCurrentAssets=known.nonCurrentAssets?data.fixed+data.otherNonCurrentAssets:null;
    const currentLiabilities=known.currentLiabilities?data.payables+data.otherCurrentLiabilities:null;
    const nonCurrentLiabilities=known.nonCurrentLiabilities?data.longDebt+data.otherNonCurrentLiabilities:null;
    const assets=currentAssets!==null&&nonCurrentAssets!==null?currentAssets+nonCurrentAssets:null,liabilities=currentLiabilities!==null&&nonCurrentLiabilities!==null?currentLiabilities+nonCurrentLiabilities:null;
    const equity=known.equity?data.equity:null;
    let difference=null,balanced=null;
    if(assets!==null&&liabilities!==null&&equity!==null){
      difference=assets-liabilities-equity;balanced=Math.abs(difference)<=Math.max(.01,Math.abs(assets)*1e-12);
      if(!balanced&&!options.lenient)throw new Error(`El balance no cuadra. Activos − pasivos − patrimonio = ${difference.toFixed(2)}.`);
    }
    return {...data,provided,known,partial,difference,balanced,currentAssets,nonCurrentAssets,currentLiabilities,nonCurrentLiabilities,assets,liabilities,funding:liabilities!==null&&equity!==null?liabilities+equity:null};
  }
  // Estado de resultados por cuentas: cada cuenta declara su categoría. Las de detalle («de los cuales») no suman al resultado.
  const incomeSum={sales:['sales','Ventas'],costSales:['costSales','Costo de ventas'],opex:['operatingExpenses','Gastos operativos'],interest:['interest','Gastos por intereses'],taxes:['taxes','Impuestos'],preferred:['preferredDividends','Dividendos preferentes']};
  const incomeMemo={creditSales:['creditSales','Ventas a crédito'],fixedCosts:['fixedCosts','Costos fijos operativos'],fixedCostSales:['fixedCostSales','Costos fijos dentro del costo de ventas'],creditPurchases:['creditPurchases','Compras a crédito reales'],shares:['shares','Número de acciones'],taxRate:['taxRate','Tasa de impuestos']};
  // Suma opcional: si no se informa, no aporta (la mayoría de las empresas no tiene otros ingresos).
  const incomeOptional={otherIncome:['otherIncome','Otros ingresos']};
  const incomeCategories={...incomeSum,...incomeOptional,...incomeMemo};
  const incomeTemplate=[['sales','Ventas totales'],['creditSales','Ventas a crédito'],['costSales','Costo de ventas'],['opex','Gastos operativos totales'],['fixedCosts','De los gastos: costos fijos operativos'],['fixedCostSales','De los costos de ventas: costos fijos'],['otherIncome','Otros ingresos'],['interest','Gastos por intereses'],['taxes','Impuestos'],['taxRate','Tasa de impuestos'],['preferred','Dividendos preferentes'],['shares','Número de acciones'],['creditPurchases','Compras reales a crédito']];
  const incomeCatalog=[
    ['Ventas totales','sales'],['Ventas','sales'],['Devoluciones y rebajas sobre ventas','sales',-1],['Costo de ventas','costSales'],['Costo de bienes vendidos','costSales'],
    ['Gastos operativos totales','opex'],['Gastos de venta','opex'],['Gastos administrativos','opex'],['Gastos generales y de administración','opex'],['Gastos de arrendamiento','opex'],['Gasto por depreciación','opex'],
    ['Gastos por intereses','interest'],['Impuestos','taxes'],['Beneficio fiscal','taxes',-1],['Dividendos preferentes','preferred'],
    ['Ventas a crédito','creditSales'],['De los gastos: costos fijos operativos','fixedCosts'],['De los costos de ventas: costos fijos','fixedCostSales'],['Compras reales a crédito','creditPurchases'],['Número de acciones','shares'],['Otros ingresos','otherIncome'],['Ingresos financieros','otherIncome'],['Tasa de impuestos','taxRate'],
  ].map(([name,category,sign=1])=>({name,category,sign}));
  const matchIncomeAccount=name=>{const key=normalizeName(name);const hit=key?incomeCatalog.find(entry=>normalizeName(entry.name)===key):null;return hit?{...hit}:null;};
  const defaultIncomeAccounts=()=>incomeTemplate.map(([category,name])=>({id:category,name,category,sign:1,amounts:{previous:null,current:null}}));
  const incomeAccountsFromStatements=({previous=null,current=null}={})=>{const rows=defaultIncomeAccounts();for(const row of rows){const key=incomeCategories[row.category][0];for(const [side,statement] of [['previous',previous],['current',current]]){const v=statement?.[key];row.amounts[side]=typeof v==='number'&&Number.isFinite(v)?v:null;}}return rows;};
  const incomeAccountsForPeriod=(accounts,side)=>(accounts||[]).map(a=>({name:a.name,category:a.category,sign:a.sign??1,amount:a.amounts?.[side]??null}));
  function incomeFromAccounts(accounts, complete, options = {}) {
    if(complete!==undefined&&complete!==null&&(typeof complete!=='object'||Object.keys(incomeSum).some(c=>typeof complete[c]!=='boolean')))throw new Error('Indica qué categorías del estado de resultados están completas.');
    const isKnown=category=>complete?complete[category]:true;
    const totals=Object.fromEntries(Object.keys(incomeCategories).map(c=>[c,0])),provided=Object.fromEntries(Object.keys(incomeCategories).map(c=>[c,false]));
    accounts.forEach((a,index)=>{
      const name=String(a?.name??'').trim()||`Cuenta ${index+1}`;
      if(!a||typeof a!=='object')throw new Error(`${name}: cuenta inválida.`);
      if(a.amount===null||a.amount===undefined)return; // En blanco: no informada, no equivale a cero.
      if(!Object.hasOwn(incomeCategories,a.category))throw new Error(`${name}: elige la categoría de la cuenta.`);
      const sign=a.sign??1;
      if(sign!==1&&sign!==-1)throw new Error(`${name}: el efecto debe ser suma o resta.`);
      if(Object.hasOwn(incomeMemo,a.category)&&sign===-1)throw new Error(`${name}: una cuenta de detalle no admite «resta».`);
      totals[a.category]+=sign*num(a.amount,name,a.category==='taxes');provided[a.category]=true;
    });
    if(provided.taxRate&&(totals.taxRate<0||totals.taxRate>=1))throw new Error('La tasa de impuestos debe ser una fracción entre 0 y 1 (por ejemplo 0.35 para 35 %).');
    const taxesGiven=c=>provided[c]||(c==='taxes'&&provided.taxRate); // la tasa reemplaza al monto de impuestos
    const missing=Object.entries(incomeSum).filter(([category])=>isKnown(category)&&!taxesGiven(category)).map(([,[,label]])=>label.toLowerCase());
    if(missing.length&&!options.lenient)throw new Error(`Falta informar: ${missing.join(', ')}. Escribe 0 si la cuenta no existe.`);
    const known=Object.fromEntries(Object.entries(incomeSum).map(([category,[key]])=>[key,isKnown(category)&&(!options.lenient||taxesGiven(category))]));
    const flat=Object.fromEntries(Object.entries(incomeCategories).map(([category,[key]])=>[key,Object.hasOwn(incomeSum,category)?(known[incomeSum[category][0]]&&(category!=='taxes'||provided.taxes||!provided.taxRate)?totals[category]:null):(provided[category]?totals[category]:null)]));
    return {...flat,known,partial:!Object.values(known).every(Boolean)};
  }
  // Resúmenes en vivo: la interfaz muestra subtotales y el cuadre mientras se escribe, aunque el estado aún no sea válido para el análisis.
  const summarizeBalance = data => calculateBalance(data, { lenient: true });
  function summarizeIncome(data) {
    return calculateIncome(Array.isArray(data?.accounts) ? incomeFromAccounts(data.accounts, data.complete, { lenient: true }) : data);
  }
  function calculateIncome(data) {
    if(Array.isArray(data?.accounts))data=incomeFromAccounts(data.accounts,data.complete);
    const known=data?.known??incomeKnownAll(),partial=!Object.values(known).every(Boolean);
    incomeKeys.forEach(k=>{if(['creditSales','fixedCosts','fixedCostSales','shares','otherIncome','taxRate'].includes(k)&&data?.[k]==null)return;if(k==='taxes'&&data?.taxes==null&&data?.taxRate!=null)return;if(partial&&known[k]===false)return;num(data?.[k],k,k==='taxes'||k==='otherIncome');});
    if(data.creditSales!=null&&known.sales&&data.creditSales>data.sales)throw new Error('Las ventas a crédito no pueden superar las ventas totales.');
    if(data.fixedCosts!=null&&known.operatingExpenses&&data.fixedCosts>data.operatingExpenses)throw new Error('Los costos fijos operativos están incluidos en los gastos operativos; no pueden superarlos.');
    if(data.fixedCostSales!=null&&known.costSales&&data.fixedCostSales>data.costSales)throw new Error('Los costos fijos dentro del costo de ventas no pueden superar el costo de ventas.');
    if(data.shares!=null&&!Number.isInteger(data.shares))throw new Error('El número de acciones debe ser entero.');
    if(data.taxRate!=null&&(!Number.isFinite(data.taxRate)||data.taxRate<0||data.taxRate>=1))throw new Error('La tasa de impuestos debe ser una fracción entre 0 y 1 (por ejemplo 0.35 para 35 %).');
    const grossProfit=known.sales&&known.costSales?data.sales-data.costSales:null,ebit=grossProfit!==null&&known.operatingExpenses?grossProfit-data.operatingExpenses:null,ebt=ebit!==null&&known.interest?ebit+(data.otherIncome??0)-data.interest:null;
    const taxes=data.taxes??(data.taxRate!=null&&ebt!==null?ebt*data.taxRate:null);
    const netProfit=ebt!==null&&known.taxes&&taxes!==null?ebt-taxes:null,commonProfit=netProfit!==null&&known.preferredDividends?netProfit-data.preferredDividends:null;
    const result={...data,taxes,known,partial,grossProfit,ebit,ebt,netProfit,commonProfit};
    return {...result,eps:needIncome(divide(commonProfit,data.shares,'money/share','(Utilidad neta − dividendos preferentes) / acciones','Sin acciones registradas'),Object.keys(incomeNames),result)};
  }
  function liquidityCore(b) {
    return {workingCapital:metric(b.currentAssets-b.currentLiabilities,'money','Activo corriente − pasivo corriente'),currentRatio:divide(b.currentAssets,b.currentLiabilities,'times','Activo corriente / pasivo corriente','Sin deuda a corto plazo'),quickRatio:withRole(divide(b.currentAssets-b.inventory,b.currentLiabilities,'times','(Activo corriente − inventarios) / pasivo corriente','Sin deuda a corto plazo'),'inventory',b)};
  }
  function calculateLiquidity(b) {
    const parts=['currentAssets','currentLiabilities'],m=liquidityCore(b);
    return Object.fromEntries(Object.entries(m).map(([k,v])=>[k,needParts(v,parts,b)]));
  }
  function calculateDebt(b,i=null) {
    const m=debtCore(b,i);
    return {debtRatio:needParts(m.debtRatio,['currentAssets','nonCurrentAssets','currentLiabilities','nonCurrentLiabilities'],b),debtEquity:needParts(m.debtEquity,['currentLiabilities','nonCurrentLiabilities','equity'],b),interestCoverage:needIncome(m.interestCoverage,['sales','costSales','operatingExpenses','interest'],i)};
  }
  function debtCore(b,i=null) {
    return {debtRatio:divide(b.liabilities,b.assets,'percent','Pasivo total / activo total','Sin activos registrados'),debtEquity:divide(b.liabilities,b.equity,'times','Pasivo total / patrimonio','Patrimonio no positivo'),interestCoverage:i?divide(i.ebit,i.interest,'times','UAII / intereses','Sin gastos por intereses registrados'):metric(null,'times','UAII / intereses','Completa el estado de resultados')};
  }
  function parameters(p={}) {
    if(p.days===null||p.purchaseRate===null||p.returnMethod===null)throw new Error('Completa los parámetros de días, compras y metodología.');
    const days=p.days??365, purchaseRate=p.purchaseRate??.7,returnMethod=p.returnMethod??'average';
    if(![360,365].includes(days))throw new Error('La base de días debe ser 360 o 365.');
    if(!Number.isFinite(purchaseRate)||purchaseRate<0||purchaseRate>1)throw new Error('El porcentaje de compras debe estar entre 0 y 100 %.');
    if(!['average','closing'].includes(returnMethod))throw new Error('Método de rentabilidad inválido.');
    const purchasesMethod=p.purchasesMethod??'percent',allSalesCredit=p.allSalesCredit??false;
    if(!['percent','inventory'].includes(purchasesMethod))throw new Error('Método de compras inválido.');
    if(typeof allSalesCredit!=='boolean')throw new Error('El supuesto de ventas a crédito debe ser sí o no.');
    return {days,purchaseRate,returnMethod,purchasesMethod,allSalesCredit};
  }
  function calculateActivity(b,i,previous=null,p={}) {
    const a=activityCore(b,i,previous,p),m=a.metrics,cost=['costSales'],onCost=x=>a.purchasesEstimated?(a.purchasesMethod==='inventory'?withRole(needIncome(x,cost,i),'inventory',b,previous):needIncome(x,cost,i)):x;
    return {...a,metrics:{...m,inventoryTurnover:needIncome(m.inventoryTurnover,cost,i),inventoryDays:needIncome(m.inventoryDays,cost,i),payableTurnover:onCost(m.payableTurnover),paymentDays:onCost(m.paymentDays),fixedTurnover:needIncome(m.fixedTurnover,['sales'],i),assetTurnover:needIncome(m.assetTurnover,['sales'],i)}};
  }
  function activityCore(b,i,previous=null,p={}) {
    const {days,purchaseRate,purchasesMethod,allSalesCredit}=parameters(p);
    // Supuestos declarados: solo completan lo que no se informó
    const creditSales=i.creditSales??(allSalesCredit&&Number.isFinite(i.sales)?i.sales:null),creditSalesAssumed=i.creditSales==null&&creditSales!==null;
    const avg=k=>previous?(Number.isFinite(previous[k])&&Number.isFinite(b[k])?(previous[k]+b[k])/2:null):b[k];
    const actual=i.creditPurchases;
    if(actual!=null)num(actual,'Compras reales a crédito');
    let purchases=actual??null,purchasesReason='';
    if(actual==null){
      if(purchasesMethod==='inventory'){
        if(!previous||!Number.isFinite(previous.inventory))purchasesReason='Requiere el inventario de T1: compras = costo de ventas + inventario final − inventario inicial.';
        else if(Number.isFinite(i.costSales)&&Number.isFinite(b.inventory))purchases=i.costSales+b.inventory-previous.inventory;
        if(purchases!==null&&purchases<0){purchases=null;purchasesReason='Las compras estimadas dan un valor negativo: revisa los inventarios.';}
      }else if(Number.isFinite(i.costSales))purchases=purchaseRate*i.costSales;
    }
    const need=(m,role)=>withRole(m,role,b,previous);
    const result={method:previous?'average':'closing',days,purchases,purchasesMethod,purchasesEstimated:actual==null,creditSales,creditSalesAssumed,averages:{inventory:avg('inventory'),receivables:avg('receivables'),payables:avg('payables'),fixed:avg('fixed'),assets:avg('assets')},metrics:{
      inventoryTurnover:need(divide(i.costSales,avg('inventory'),'times','Costo de ventas / inventario promedio','Inventario base cero'),'inventory'),inventoryDays:need(divide(avg('inventory')*days,i.costSales,'days','Inventario promedio × días / costo de ventas','Costo de ventas cero'),'inventory'),
      receivableTurnover:need(creditSales==null?metric(null,'times','Ventas a crédito / CxC promedio','Ventas a crédito no informadas'):divide(creditSales,avg('receivables'),'times','Ventas a crédito / CxC promedio','Cuentas por cobrar base cero'),'receivables'),collectionDays:need(divide(avg('receivables')*days,creditSales,'days','CxC promedio × días / ventas a crédito',creditSales==null?'Ventas a crédito no informadas':'Sin ventas a crédito'),'receivables'),
      payableTurnover:need(divide(purchases,avg('payables'),'times','Compras a crédito / CxP promedio','Cuentas por pagar base cero'),'payables'),paymentDays:need(divide(avg('payables')*days,purchases,'days','CxP promedio × días / compras a crédito','Compras a crédito cero'),'payables'),
      fixedTurnover:need(divide(i.sales,avg('fixed'),'times','Ventas / activos fijos promedio','Activos fijos base cero'),'fixed'),assetTurnover:needParts(divide(i.sales,avg('assets'),'times','Ventas / activos totales promedio','Activos totales base cero'),['currentAssets','nonCurrentAssets'],b,previous)
    }};
    if(purchases===null&&actual==null&&purchasesReason){const f='CxP promedio × días / compras a crédito';result.metrics.payableTurnover=metric(null,'times','Compras a crédito / CxP promedio',purchasesReason);result.metrics.paymentDays=metric(null,'days',f,purchasesReason);}
    return result;
  }
  function calculateProfitability(b,i,previous=null,p={}) {
    const {returnMethod}=parameters(p),averaged=returnMethod==='average'&&!!previous;
    const mean=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)?(x+y)/2:null;
    const assets=averaged?mean(b.assets,previous.assets):b.assets, equity=averaged?mean(b.equity,previous.equity):b.equity;
    const bases=averaged?[b,previous]:[b],assetParts=['currentAssets','nonCurrentAssets'];
    const method=averaged?'average':'closing';
    const ratios={grossMargin:divide(i.grossProfit,i.sales,'percent','Utilidad bruta / ventas','Ventas cero'),operatingMargin:divide(i.ebit,i.sales,'percent','UAII / ventas','Ventas cero'),netMargin:divide(i.netProfit,i.sales,'percent','Utilidad neta / ventas','Ventas cero'),roa:divide(i.netProfit,assets,'percent',`Utilidad neta / activos ${averaged?'promedio':'al cierre'}`,'Activos base no positivos'),roe:divide(i.netProfit,equity,'percent',`Utilidad neta / patrimonio ${averaged?'promedio':'al cierre'}`,'Patrimonio base no positivo')};
    ratios.roa=needParts(ratios.roa,assetParts,...bases);ratios.roe=needParts(ratios.roe,['equity'],...bases);
    const netKeys=['sales','costSales','operatingExpenses','interest','taxes'];
    ratios.grossMargin=needIncome(ratios.grossMargin,['sales','costSales'],i);ratios.operatingMargin=needIncome(ratios.operatingMargin,['sales','costSales','operatingExpenses'],i);ratios.netMargin=needIncome(ratios.netMargin,netKeys,i);ratios.roa=needIncome(ratios.roa,netKeys,i);ratios.roe=needIncome(ratios.roe,netKeys,i);
    const margin=ratios.netMargin, turnover=needIncome(needParts(divide(i.sales,assets,'times','Ventas / activos de la misma metodología'),assetParts,...bases),['sales'],i),leverage=needParts(divide(assets,equity,'times','Activos / patrimonio de la misma metodología'),[...assetParts,'equity'],...bases);
    const factors=[margin.value,turnover.value,leverage.value];
    const direct=ratios.roe.value,product=factors.every(v=>v!==null)?factors.reduce((a,v)=>a*v,1):null;
    return {method,bases:{assets,equity},metrics:ratios,dupont:{margin,turnover,leverage,roe:needIncome(needParts(metric(product,'percent','Margen neto × rotación × multiplicador'),[...assetParts,'equity'],...bases),netKeys,i),difference:direct!==null&&product!==null?product-direct:null}};
  }
  function compareValues(before,after,referenceBefore=null,referenceAfter=null) {
    before=before??null;after=after??null;
    if(after!=null)num(after,'Valor actual',true);if(before!=null)num(before,'Valor anterior',true);
    return {before,after,absolute:before!==null&&after!==null?after-before:null,relative:before>0&&after!==null?(after-before)/before:null,relativeReason:before===null?'Sin T1':before===0?'Base T1 cero':before<0?'Base T1 negativa: interpretar cambio absoluto':'',verticalBefore:referenceBefore>0&&before!==null?before/referenceBefore:null,verticalAfter:referenceAfter>0&&after!==null?after/referenceAfter:null};
  }
  // Análisis vertical y horizontal cuenta por cuenta. Base vertical: total de activos para las cuentas del activo y
  // total de pasivo + patrimonio para el financiamiento. La base horizontal es el período anterior (si es 0 no hay % de cambio).
  function compareBalanceAccounts(accounts, options = {}) {
    if(!Array.isArray(accounts))throw new Error('Indica las cuentas del balance.');
    const sides=['previous','current'];
    const totals=Object.fromEntries(sides.map(side=>[side,accounts.some(a=>a?.amounts?.[side]!=null)?summarizeBalance({accounts:accountsForPeriod(accounts,side),complete:options.complete?.[side]}):null]));
    const base=(side,kind)=>totals[side]?.[kind==='asset'?'assets':'funding']??null;
    const compare=(before,after,kind)=>{
      const cmp=compareValues(before,after,base('previous',kind),base('current',kind));
      const missing=cmp.before===null||cmp.after===null;
      return {...cmp,relativeReason:missing?'Falta el importe de un período':cmp.relativeReason};
    };
    const rows=accounts.map((a,index)=>{
      const section=a?.section,kind=section==='asset'?'asset':'funding';
      return {name:String(a?.name??'').trim()||`Cuenta ${index+1}`,section,term:a?.term??null,memo:!!a?.memo,sign:a?.sign??1,...compare(a?.amounts?.previous,a?.amounts?.current,kind)};
    });
    const groups=[['currentAssets','Activos corrientes','asset'],['nonCurrentAssets','Activos no corrientes','asset'],['assets','Total activos','asset'],['currentLiabilities','Pasivos corrientes','funding'],['nonCurrentLiabilities','Pasivos no corrientes','funding'],['liabilities','Total pasivos','funding'],['equity','Patrimonio','funding'],['funding','Total pasivo y patrimonio','funding']]
      .map(([key,name,kind])=>({key,name,kind,...compare(totals.previous?.[key],totals.current?.[key],kind)}));
    return {accounts:rows,groups,bases:Object.fromEntries(sides.map(side=>[side,{assets:totals[side]?.assets??null,funding:totals[side]?.funding??null}])),balanced:Object.fromEntries(sides.map(side=>[side,totals[side]?.balanced??null]))};
  }
  function calculateCVU(data) {
    cvuKeys.forEach(k=>num(data?.[k],k));
    if(data.taxRate>=1)throw new Error('La tasa de impuesto debe estar entre 0 % y menos de 100 %.');
    if(!Number.isInteger(data.shares))throw new Error('El número de acciones debe ser entero.');
    const contributionUnit=data.price-data.variableCost;
    if(contributionUnit<=0)throw new Error('El Precio de Venta debe ser mayor al Costo Variable Unitario para generar Margen de Contribución');
    const sales=data.price*data.quantity,variableCosts=data.variableCost*data.quantity,contribution=sales-variableCosts,ebit=contribution-data.fixedCosts,ebt=ebit-data.interest,afterTax=ebt*(1-data.taxRate),taxes=ebt-afterTax,commonProfit=afterTax-data.preferredDividends;
    const financialDenominator=ebit-data.interest-data.preferredDividends/(1-data.taxRate);
    // Denominadores negativos sí tienen un valor matemático; cero queda no definido.
    const direct=(n,d,f)=>metric(d!==0?n/d:null,'times',f,'No definido: denominador cero');
    const gao=direct(contribution,ebit,'Margen de contribución / UAII');
    const gaf=direct(ebit,financialDenominator,'UAII / [UAII − intereses − DP/(1−t)]');
    const gat=metric(gao.value!==null&&gaf.value!==null?gao.value*gaf.value:null,'times','GAO × GAF','No definido: GAO o GAF sin base');
    const breakEvenUnits=data.fixedCosts/contributionUnit,breakEvenSales=breakEvenUnits*data.price;
    return {...data,sales,variableCosts,contributionUnit,contribution,ebit,ebt,taxes,afterTax,commonProfit,eps:divide(commonProfit,data.shares,'money/share','Utilidad común / número de acciones','Sin acciones registradas'),breakEvenUnits,breakEvenSales,minimumWholeUnits:Math.ceil(breakEvenUnits),gao,gaf,gat,method:'direct',taxAssumption:'La fórmula académica reconoce un beneficio fiscal teórico cuando UAI es negativa.'};
  }
  function leverageChanges(base,scenario) {
    const change=(a,b)=>a!==0&&Number.isFinite(a)&&Number.isFinite(b)?(b-a)/a:null;
    const sales=change(base.sales,scenario.sales),ebit=change(base.ebit,scenario.ebit),eps=base.eps.value!==null&&scenario.eps.value!==null?change(base.eps.value,scenario.eps.value):null;
    const rate=(a,b,formula)=>metric(a!==null&&b!==null&&b!==0?a/b:null,'times',formula,'Variación base cero o dato no definido');
    return {method:'changes',changes:{sales,ebit,eps},gao:rate(ebit,sales,'%Δ UAII / %Δ ventas'),gaf:rate(eps,ebit,'%Δ UPA / %Δ UAII'),gat:rate(eps,sales,'%Δ UPA / %Δ ventas'),sameStructure:['price','variableCost','fixedCosts','taxRate','interest','preferredDividends','shares'].every(k=>base[k]===scenario[k])};
  }
  function calculateOperatingModel(i) {
    if(i.fixedCosts==null)return null;
    // Sin «costos fijos dentro del costo de ventas» se supone que todo el costo de ventas es variable; el resultado lo declara.
    const costSalesFullyVariable=i.fixedCostSales==null,fixedInCostSales=i.fixedCostSales??0;
    const assumption=costSalesFullyVariable?'Se supone que todo el costo de ventas es variable. Si incluye costos fijos (depreciación de planta, mano de obra fija), infórmalos como «De los costos de ventas: costos fijos»; de lo contrario el GAO y el punto de equilibrio se distorsionan.':'Los costos fijos declarados dentro del costo de ventas se separan de la contribución y se suman a los costos fijos del punto de equilibrio.';
    if(i.partial){const off=(unit,formula)=>needIncome(metric(null,unit,formula),Object.keys(incomeNames),i);return {contribution:null,taxRate:null,gao:off('times','Contribución / UAII'),gaf:off('times','UAII / [UAII − intereses − DP/(1−t)]'),gat:off('times','GAO × GAF'),breakEvenSales:off('money','Costos fijos / razón de contribución'),costSalesFullyVariable,assumption};}
    const contribution=i.sales-(i.costSales-fixedInCostSales)-(i.operatingExpenses-i.fixedCosts),totalFixed=i.fixedCosts+fixedInCostSales;
    const taxRate=i.ebt!==0?i.taxes/i.ebt:0;
    const denominator=i.ebit-i.interest-i.preferredDividends/(1-taxRate);
    const gao=metric(i.ebit!==0?contribution/i.ebit:null,'times','Contribución / UAII','UAII cero');
    const gaf=metric(taxRate>=0&&taxRate<1&&denominator!==0?i.ebit/denominator:null,'times','UAII / [UAII − intereses − DP/(1−t)]','Denominador cero o tasa efectiva fuera de 0–100 %');
    return {contribution,taxRate,gao,gaf,gat:metric(gao.value!==null&&gaf.value!==null?gao.value*gaf.value:null,'times','GAO × GAF'),breakEvenSales:metric(contribution>0&&i.sales>0?totalFixed/(contribution/i.sales):null,'money','Costos fijos / razón de contribución','Contribución no positiva'),costSalesFullyVariable,assumption};
  }
  function analyzeModel(model) {
    const p=parameters(model.params),errors={};
    const year=model.year;
    if(!validYear(year))throw new Error('El año actual debe ser un entero entre 1901 y 9999.');
    if(model.previous && model.previous.year!==year-1)throw new Error('T1 debe ser el año inmediatamente anterior a T2.');
    if(model.current?.year!==year)throw new Error('Los datos T2 deben corresponder al año actual.');
    const safe=(fn,key)=>{try{return fn();}catch(e){errors[key]=e.message;return null;}};
    const currentBalance=safe(()=>calculateBalance(model.current.balance),'balance');
    const currentIncome=safe(()=>calculateIncome(model.current.income),'income');
    const previousBalance=model.previous?safe(()=>calculateBalance(model.previous.balance),'previousBalance'):null;
    const previousIncome=model.previous?safe(()=>calculateIncome(model.previous.income),'previousIncome'):null;
    // Un T1 solicitado pero incompleto no se sustituye silenciosamente por cierre.
    const completePeriods=!model.previous||!!previousBalance;
    return {year,params:p,errors,currentBalance,currentIncome,previousBalance,previousIncome,
      liquidity:currentBalance?calculateLiquidity(currentBalance):null,
      debt:currentBalance?calculateDebt(currentBalance,currentIncome):null,
      activity:currentBalance&&currentIncome&&completePeriods?calculateActivity(currentBalance,currentIncome,previousBalance,p):null,
      profitability:currentBalance&&currentIncome&&(p.returnMethod==='closing'||completePeriods)?calculateProfitability(currentBalance,currentIncome,previousBalance,p):null};
  }
  function simulateModel(model,growth=0,repayment=0) {
    if(!Number.isFinite(growth)||growth< -50||growth>50||!Number.isFinite(repayment)||repayment<0||repayment>100)throw new Error('Cambios de escenario fuera del rango permitido.');
    const base=analyzeModel(model);if(!base.currentBalance||!base.currentIncome)throw new Error('Completa y concilia los estados T2 antes de simular.');
    if(base.currentIncome.partial)throw new Error('El escenario integrado necesita un estado de resultados completo: desmarca «Estado de resultados parcial» o marca todas sus categorías como completas.');
    if(base.currentBalance.partial||base.previousBalance?.partial)throw new Error('El escenario integrado necesita un balance completo: desmarca «Balance parcial» o marca todas sus partes como completas.');
    const snapshot=JSON.parse(JSON.stringify(model)),i=Object.fromEntries([...incomeKeys,'creditPurchases'].filter(k=>Object.hasOwn(base.currentIncome,k)).map(k=>[k,base.currentIncome[k]])),factor=1+growth/100;snapshot.current.income=i;
    const b=Object.fromEntries([...balanceKeys.map(k=>[k,base.currentBalance[k]]),['provided',{...base.currentBalance.provided}]]);snapshot.current.balance=b;
    // Mantiene costos fijos e intereses; escala costos variables, ventas e impuestos efectivos.
    const old=base.currentIncome;
    if(old.fixedCosts==null)throw new Error('Indica los costos fijos incluidos en los gastos operativos para simular.');
    i.sales*=factor;if(i.creditSales!=null)i.creditSales*=factor;{const fixedInCostSales=old.fixedCostSales??0;i.costSales=fixedInCostSales+(old.costSales-fixedInCostSales)*factor;}i.operatingExpenses=old.fixedCosts+(old.operatingExpenses-old.fixedCosts)*factor;
    if(i.creditPurchases!=null)i.creditPurchases*=factor;
    const newEBT=i.sales-i.costSales-i.operatingExpenses+(i.otherIncome??0)-i.interest;
    const taxRate=old.ebt>0?Math.max(0,Math.min(1,old.taxes/old.ebt)):0;
    i.taxes=old.taxes+(Math.max(0,newEBT)-Math.max(0,old.ebt))*taxRate;
    const income=calculateIncome(i),delta=income.netProfit-old.netProfit,payment=b.payables*repayment/100;
    b.cash+=delta-payment;b.payables-=payment;b.equity+=delta;
    if(b.cash<-1e-8)throw new Error('Escenario no viable: efectivo insuficiente para cubrir los cambios y el pago.');if(b.cash<0)b.cash=0;
    if(base.previousBalance)snapshot.previous.balance=Object.fromEntries([...balanceKeys.map(k=>[k,base.previousBalance[k]]),['provided',{...base.previousBalance.provided}]]);
    const result=analyzeModel(snapshot);
    return {snapshot,base,result,growth,repayment,payment,retainedChange:delta,taxRate,assumptions:'Mismo período: cambian ventas y costos variables; costos fijos e intereses constantes. La diferencia de utilidad se retiene en caja y patrimonio. Proveedores se paga en efectivo; los demás saldos no cambian. Se conserva el impuesto original y se ajusta por la variación de UAI positiva, usando la tasa efectiva T2 limitada a 0–100 %; no se generan nuevos créditos por pérdidas.'};
  }
  const api = { accountRoles:Object.fromEntries(Object.entries(roleRules).map(([k,[section,term,label]])=>[k,{section,term,label}])),validYear,summarizeBalance,summarizeIncome,accountCatalog,incomeCatalog,matchAccount,matchIncomeAccount,balanceParts:partNames,incomeParts:Object.fromEntries(Object.entries(incomeSum).map(([category,[,label]])=>[category,label])),incomeCategories:Object.fromEntries(Object.entries(incomeCategories).map(([category,[,label]])=>[category,{label,memo:Object.hasOwn(incomeMemo,category)}])),defaultIncomeAccounts,incomeAccountsFromStatements,incomeAccountsForPeriod,defaultAccounts,accountsFromBalances,accountsForPeriod, dupont, simulate, scenarioKeys: keys, balanceKeys,incomeKeys,cvuKeys,calculateBalance,calculateIncome,calculateLiquidity,calculateActivity,calculateDebt,calculateProfitability,calculateCVU,calculateOperatingModel,leverageChanges,compareValues,compareBalanceAccounts,analyzeModel,simulateModel,parameters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Finance = api; root.FinancialEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);

