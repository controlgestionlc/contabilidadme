import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx=vm.createContext({
  console,Date,setTimeout,clearTimeout,
  confirm:()=>true,alert:()=>{},
  window:{},
  document:{
    _els:new Map(),
    getElementById(id){
      if(!this._els.has(id))this._els.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,checked:false,style:{},dataset:{},classList:{add(){},remove(){}},addEventListener(){},scrollIntoView(){}});
      return this._els.get(id);
    }
  }
});

function importsDe(src){
  const mapa=new Map();
  for(const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)){
    const nombres=m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    mapa.set(m[2],[...(mapa.get(m[2])||[]),...nombres]);
  }
  for(const m of src.matchAll(/import\s*['"]([^'"]+)['"]/g))if(!mapa.has(m[1]))mapa.set(m[1],[]);
  return mapa;
}

async function cargar(ruta,{S,asiento,pdc,upsert,tipo}){
  const src=fs.readFileSync(new URL(ruta,import.meta.url),'utf8');
  const modulos={};
  const fichas={};
  const noop=()=>{};
  const funciones={
    toast:noop,fmt:v=>String(v||0),fmtC:v=>String(v||0),pn:Number,today:()=>'',dteC:()=>({signo:1,nm:'DTE'}),dteV:()=>({signo:1,nm:'DTE'}),rutParse:()=>({codigo:'1',dv:'9',valido:true}),rutFmt:(c,d)=>`${c}-${d}`,rutDV:()=>'',pdcNm:x=>x,
    rerender:noop,logAccion:noop,logCambio:noop,mesOpts:()=>'',mesRango:()=>({}),dteVentasOpts:()=>'',foliosMensuales:()=>({}),todosDocsCompras:()=>[],todosDocsVentas:()=>[],abrirAsientoDesde:noop,proxFolioComprobante:()=>1,ccOpts:()=>'',inputCuenta:()=>'',leerArchivo:async()=>({docs:[]}),resolverVencimientoImportado:d=>d,fichaAux:()=>null,fichasAux:()=>fichas,guardarFichasAux:async()=>{},
    guardarDocumentoContabilizado:async()=>({ok:true}),anularDocumentoContabilizado:async()=>({ok:true}),ejercicioCerrado:()=>false,upsertAsientoDocumento:upsert,anularAsientoDocumento:noop,persistirClavesCritico:async()=>{},puedeOperarFecha:()=>true,
    tributacionCompra:()=>({}),periodoContableCompra:d=>d.periodoContable||String(d.fecha||'').slice(0,7),fechaContabilizacionCompra:d=>d.fecha,asientoCompra:asiento,asientoVenta:asiento,
    claveRCV:d=>`${d.rutCodigo}|${d.tipoDTE}|${d.numero}`,compararCompraRCV:()=>({igual:false,cambios:[],fingerprint:'x'}),compararVentaRCV:()=>({igual:false,cambios:[],fingerprint:'x'}),snapshotCompraRCV:d=>d,snapshotVentaRCV:d=>d,fingerprintSnapshot:()=> 'fp',valorCambio:String,
    validarMovimientosPDC:pdc,
  };
  const constantes={S,MESES:['Enero','Febrero'],IVA:0,DTE_COMPRAS:[],DTE_VENTAS:[],CCOLS:[],CUENTAS_GASTO:[],CUENTAS_COMPRA:[],CUENTAS_INGRESO:[]};
  for(const [spec,nombres] of importsDe(src)){
    const unicos=[...new Set(nombres)];
    const sm=new vm.SyntheticModule(unicos,function(){
      unicos.forEach(n=>this.setExport(n,Object.hasOwn(constantes,n)?constantes[n]:(funciones[n]||noop)));
    },{context:ctx});
    await sm.link(()=>{});await sm.evaluate();modulos[spec]=sm;
  }
  const target=new vm.SourceTextModule(src,{context:ctx});
  await target.link(spec=>modulos[spec]||Promise.reject(new Error(`${tipo}: import no simulado ${spec}`)));
  await target.evaluate();
  return target.namespace;
}

const docBase=(numero)=>({
  incluir:true,estadoImport:'nuevo',cuenta:'5101001',cc:'CC1',fecha:'2026-02-01',fechaOriginal:'2026-02-01',
  tipoDTE:33,numero:String(numero),rutCodigo:`7600000${numero}`,rutDV:'9',razonSocial:`Auxiliar ${numero}`,
  neto:1000,exento:0,iva:190,otrosImpuestos:0,total:1190,fp:'clientes'
});
const asiento=doc=>({fecha:doc.fecha,movs:[{cd:doc.cuentaIngreso||doc.dist?.[0]?.cuenta||'5101001',debe:1190,haber:0},{cd:'2102001',debe:0,haber:1190}],cuadre:{ok:true,diferencia:0}});

// Compras: la validación PDC debe aparecer en la vista previa.
{
  const S={empresa:{anio:2026},compras:[],ventas:[],asientos:[],apertura:{}};
  let pdcOk=false;
  const ns=await cargar('../js/compras.js',{S,asiento,pdc:()=>pdcOk?{ok:true,errores:[]}:{ok:false,errores:['Línea 1: cuenta inactiva']},upsert:(fuente,doc)=>{if(doc.numero==='2')throw new Error('fallo simulado compra');S.asientos.push({fuente,docId:doc.id});},tipo:'compras'});
  ns.IM.periodoMes=2;ns.IM.periodoAnio=2026;ns.IM.modo='agregar';ns.IM.archivo='compras.csv';ns.IM.docs.push(docBase(1));
  let errores=ns.validarCuadraturaImportCompras();
  assert.equal(errores.length,1);assert.match(errores[0].motivo,/cuenta inactiva/);
  pdcOk=true;assert.equal(ns.validarCuadraturaImportCompras().length,0);

  ns.IM.docs.push(docBase(2));
  await ns.confirmarImportacion();
  assert.equal(S.compras.length,1,'una compra defectuosa no aborta la compra válida');
  assert.equal(S.asientos.length,1,'no queda asiento parcial de la compra fallida');
  assert.equal(ns.IM.docs.length,1);assert.equal(ns.IM.docs[0].estadoImport,'pendiente_error');
  assert.match(ns.IM.docs[0].errorImport,/fallo simulado compra/);
}

// Ventas: mismo aislamiento y misma validación anticipada.
{
  const S={empresa:{anio:2026},compras:[],ventas:[],asientos:[]};
  let pdcOk=false;
  const ns=await cargar('../js/ventas.js',{S,asiento,pdc:()=>pdcOk?{ok:true,errores:[]}:{ok:false,errores:['Línea 2: cuenta agrupadora']},upsert:(fuente,doc)=>{if(doc.numero==='2')throw new Error('fallo simulado venta');S.asientos.push({fuente,docId:doc.id});},tipo:'ventas'});
  ns.IMV.periodoMes=2;ns.IMV.periodoAnio=2026;ns.IMV.archivo='ventas.csv';ns.IMV.docs.push(docBase(1));
  let errores=ns.validarCuadraturaImportVentas();
  assert.equal(errores.length,1);assert.match(errores[0].motivo,/cuenta agrupadora/);
  pdcOk=true;assert.equal(ns.validarCuadraturaImportVentas().length,0);

  ns.IMV.docs.push(docBase(2));
  await ns.confirmarImportacionV();
  assert.equal(S.ventas.length,1,'una venta defectuosa no aborta la venta válida');
  assert.equal(S.asientos.length,1,'no queda asiento parcial de la venta fallida');
  assert.equal(ns.IMV.docs.length,1);assert.equal(ns.IMV.docs[0].estadoImport,'pendiente_error');
  assert.match(ns.IMV.docs[0].errorImport,/fallo simulado venta/);
}

console.log('OK: validación PDC anticipada y errores aislados por documento en compras/ventas');
