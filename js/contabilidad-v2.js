// contabilidad-v2.js — capa de orquestación contable V2.
// Mantiene un asiento persistido por documento y protege operaciones críticas.
import {S} from './state.js';
import {asientoVenta,asientoCompra,cuadratura} from './motor-contable.js';
import {validarMovimientosPDC,reglaCuenta} from './pdc-reglas.js';

const n=v=>Number(v)||0;
const idAsientoDoc=(fuente,docId)=>`auto:${fuente}:${docId}`;

function ejercicioCerrado(){
  const anio=+S.empresa.anio;
  return (S.asientos||[]).some(a=>!a.anulado&&a.tipo==='cierre'&&(+((a.ejercicio)||String(a.fecha||'').slice(0,4))===anio));
}
function puedeOperarFecha(fecha){
  if(!fecha)return !ejercicioCerrado();
  const anio=+String(fecha).slice(0,4);
  return anio!==+S.empresa.anio||!ejercicioCerrado();
}

// Persistencia crítica de asientos con rollback en memoria. Todos los módulos
// que crean/anulan asientos automáticos pueden usar esta misma puerta.
async function persistirAsientosCritico(mutacion){
  if(ejercicioCerrado())return {ok:false,motivo:'ejercicio-cerrado'};
  const snap=JSON.stringify(S.asientos||[]);
  try{
    const resultado=await mutacion();
    const r=await window.storage.set(`asientos-${S.empresa.anio}`,JSON.stringify(S.asientos||[]));
    if(!r||r.ok===false)throw new Error(r?.motivo||'fallo-persistencia');
    return {ok:true,resultado};
  }catch(e){
    S.asientos=JSON.parse(snap);
    return {ok:false,motivo:e.message||String(e)};
  }
}
function asientoDesdeDocumento(fuente,doc){
  const base=fuente==='ventas'?asientoVenta(doc):asientoCompra(doc);
  if(!base.cuadre?.ok)throw new Error(`El asiento automático de ${fuente} no cuadra (${base.cuadre?.diferencia||0})`);
  const vp=validarMovimientosPDC(base.movs||[]);
  if(!vp.ok)throw new Error(vp.errores[0]);
  return {
    id:idAsientoDoc(fuente,doc.id),
    n:null,
    fecha:base.fecha,
    glosa:base.glosa,
    movs:base.movs,
    tipo:'documento',
    origen:'motor-v2',
    fuente,
    docId:doc.id,
    tipoDTE:doc.tipoDTE,
    folio:doc.numero,
    rutCodigo:doc.rutCodigo,
    tributacion:base.tributacion,
    cuadre:base.cuadre,
    generadoAutomaticamente:true,
    actualizadoEn:new Date().toISOString(),
  };
}
function upsertAsientoDocumento(fuente,doc){
  if(!S.asientos)S.asientos=[];
  const id=idAsientoDoc(fuente,doc.id);
  const i=S.asientos.findIndex(a=>a.id===id||(a.tipo==='documento'&&a.fuente===fuente&&a.docId===doc.id));
  const nuevo=asientoDesdeDocumento(fuente,doc);
  if(i>=0){
    // conservar metadatos operativos relevantes
    nuevo.n=S.asientos[i].n||S.asientos[i].folioComp||null;
    nuevo.creadoEn=S.asientos[i].creadoEn||S.asientos[i].actualizadoEn||new Date().toISOString();
    S.asientos[i]=nuevo;
  }else{
    nuevo.creadoEn=new Date().toISOString();
    S.asientos.push(nuevo);
  }
  return nuevo;
}
function anularAsientoDocumento(fuente,docId,motivo='documento anulado'){
  const a=(S.asientos||[]).find(x=>x.id===idAsientoDoc(fuente,docId)||(x.tipo==='documento'&&x.fuente===fuente&&x.docId===docId));
  if(a){a.anulado=true;a.anuladoEn=new Date().toISOString();a.motivoAnulacion=motivo;}
  return a||null;
}

// Guarda documento + asiento como una unidad lógica. Si una de las dos
// persistencias falla, restaura el estado en memoria y reintenta restaurar nube.
async function guardarDocumentoContabilizado(fuente,doc,arr,esEdicion=false){
  if(!puedeOperarFecha(doc.fecha))return {ok:false,motivo:'ejercicio-cerrado'};
  const claveDoc=`${fuente}-${S.empresa.anio}`;
  const claveAs=`asientos-${S.empresa.anio}`;
  const snapArr=JSON.stringify(arr);
  const snapAs=JSON.stringify(S.asientos||[]);
  try{
    if(esEdicion){
      const i=arr.findIndex(x=>x.id===doc.id); if(i<0)throw new Error('Documento no encontrado');
      arr[i]=doc;
    }else arr.push(doc);
    upsertAsientoDocumento(fuente,doc);
    const r1=await window.storage.set(claveDoc,JSON.stringify(arr));
    if(!r1||r1.ok===false)throw new Error(r1?.motivo||'fallo-documento');
    const r2=await window.storage.set(claveAs,JSON.stringify(S.asientos));
    if(!r2||r2.ok===false)throw new Error(r2?.motivo||'fallo-asiento');
    return {ok:true,asiento:idAsientoDoc(fuente,doc.id)};
  }catch(e){
    const arrPrev=JSON.parse(snapArr), asPrev=JSON.parse(snapAs);
    arr.splice(0,arr.length,...arrPrev); S.asientos=asPrev;
    try{await window.storage.set(claveDoc,snapArr);}catch(_e){}
    try{await window.storage.set(claveAs,snapAs);}catch(_e){}
    return {ok:false,motivo:e.message||String(e)};
  }
}

async function anularDocumentoContabilizado(fuente,doc,arr){
  if(!puedeOperarFecha(doc.fecha))return {ok:false,motivo:'ejercicio-cerrado'};
  const snapArr=JSON.stringify(arr),snapAs=JSON.stringify(S.asientos||[]);
  doc.estado='anulado';doc.anuladoEn=new Date().toISOString();
  anularAsientoDocumento(fuente,doc.id);
  try{
    const r1=await window.storage.set(`${fuente}-${S.empresa.anio}`,JSON.stringify(arr));
    const r2=await window.storage.set(`asientos-${S.empresa.anio}`,JSON.stringify(S.asientos));
    if(r1?.ok===false||r2?.ok===false)throw new Error(r1?.motivo||r2?.motivo||'fallo-persistencia');
    return {ok:true};
  }catch(e){
    arr.splice(0,arr.length,...JSON.parse(snapArr)); S.asientos=JSON.parse(snapAs);
    return {ok:false,motivo:e.message||String(e)};
  }
}

async function migrarDocumentosAAsientos(){
  if(ejercicioCerrado())return {ok:false,motivo:'ejercicio-cerrado',creados:0};
  let creados=0,actualizados=0;
  for(const [fuente,arr] of [['ventas',S.ventas||[]],['compras',S.compras||[]]]){
    for(const d of arr.filter(x=>x.estado!=='anulado'&&!x.excluidoAuto)){
      const existe=(S.asientos||[]).find(a=>a.id===idAsientoDoc(fuente,d.id)||(a.tipo==='documento'&&a.fuente===fuente&&a.docId===d.id));
      upsertAsientoDocumento(fuente,d); if(existe)actualizados++;else creados++;
    }
  }
  const r=await window.storage.set(`asientos-${S.empresa.anio}`,JSON.stringify(S.asientos||[]));
  return {ok:!(r&&r.ok===false),creados,actualizados,motivo:r?.motivo};
}

function auditoriaIntegridad(){
  const hallazgos=[];
  const activos=a=>(a||[]).filter(x=>!x.anulado);
  const asAct=activos(S.asientos);
  const agregar=(sev,tipo,detalle,ref='')=>hallazgos.push({sev,tipo,detalle,ref});

  // 1) Cuadratura de cada asiento
  for(const a of asAct){
    const q=cuadratura(a.movs||[]);
    if(!q.ok)agregar('critica','asiento_descuadrado',`Asiento ${a.n||a.id}: diferencia ${q.diferencia}`,a.id);
  }

  // 2) Cada documento activo debe tener exactamente un asiento maestro
  for(const [fuente,arr] of [['ventas',S.ventas||[]],['compras',S.compras||[]]]){
    for(const d of arr.filter(x=>x.estado!=='anulado'&&!x.excluidoAuto)){
      const encontrados=asAct.filter(x=>x.tipo==='documento'&&x.fuente===fuente&&x.docId===d.id);
      if(!encontrados.length)agregar('critica','documento_sin_asiento',`${fuente} DTE ${d.tipoDTE} N°${d.numero} sin asiento persistido`,d.id);
      if(encontrados.length>1)agregar('critica','asiento_duplicado',`${encontrados.length} asientos activos para ${fuente}:${d.id}`,`${fuente}:${d.id}`);
    }
  }
  for(const a of asAct.filter(x=>x.tipo==='documento')){
    const arr=a.fuente==='ventas'?S.ventas:S.compras;
    const d=(arr||[]).find(x=>x.id===a.docId&&x.estado!=='anulado');
    if(!d)agregar('alta','asiento_sin_documento',`Asiento automático ${a.id} no tiene documento activo`,a.id);
  }

  // 3) Auxiliares: las cuentas de cliente/proveedor deben llevar RUT para que
  //    el sublibro pueda reconstruirse íntegramente desde los asientos.
  const auxCfg={
    '1104001':{nombre:'Clientes',signo:1},
    '2102001':{nombre:'Proveedores',signo:-1},
  };
  Object.entries(auxCfg).forEach(([cd,cfg])=>{
    let mayor=0,conAux=0,sinAux=0;
    asAct.forEach(a=>(a.movs||[]).filter(m=>m.cd===cd).forEach(m=>{
      const saldo=n(m.debe)-n(m.haber);mayor+=saldo;
      if(m.rutCodigo)conAux+=saldo;else sinAux+=saldo;
    }));
    if(Math.abs(sinAux)>0.5)agregar('critica','auxiliar_sin_identificacion',`${cfg.nombre}: ${Math.round(Math.abs(sinAux))} en movimientos sin RUT; el auxiliar no puede cuadrar con el Mayor`,cd);
    if(Math.abs(mayor-conAux)>0.5)agregar('critica','auxiliar_mayor_diferencia',`${cfg.nombre}: diferencia Mayor/Auxiliar ${Math.round(Math.abs(mayor-conAux))}`,cd);
  });

  // 4) IVA de documentos contra sus asientos maestros. No compara sólo totales
  //    generales: valida documento por documento para detectar modificaciones
  //    que no hayan regenerado su asiento.
  for(const [fuente,arr,cdIVA] of [['ventas',S.ventas||[],'2103003'],['compras',S.compras||[],'1108002']]){
    for(const d of arr.filter(x=>x.estado!=='anulado'&&!x.excluidoAuto)){
      const a=asAct.find(x=>x.tipo==='documento'&&x.fuente===fuente&&x.docId===d.id); if(!a)continue;
      const movs=(a.movs||[]).filter(m=>m.cd===cdIVA&&m.tributo!=='iva_retenido');
      const contabilizado=Math.abs(movs.reduce((s,m)=>s+n(m.debe)-n(m.haber),0));
      const esperado=Math.abs(n(d.iva));
      if(Math.abs(contabilizado-esperado)>1)agregar('critica','iva_documento_difiere',`${fuente} DTE ${d.tipoDTE} N°${d.numero}: IVA documento ${Math.round(esperado)} ≠ IVA asiento ${Math.round(contabilizado)}`,d.id);
    }
  }

  // 5) Cierre y secuencia temporal
  const cierres=asAct.filter(a=>a.tipo==='cierre');
  if(cierres.length>1)agregar('critica','cierres_duplicados',`Existen ${cierres.length} asientos de cierre activos`);
  if(cierres.length){
    const fc=cierres.map(a=>a.fecha||'').sort().at(-1);
    asAct.filter(a=>a.tipo!=='cierre'&&a.fecha>fc).forEach(a=>agregar('critica','movimiento_post_cierre',`Movimiento ${a.id} posterior al cierre (${a.fecha})`,a.id));
  }

  // 6) IVA/F29: un solo asiento activo por período y tipo de proceso.
  for(const origen of ['ivaf29','pagof29']){
    const porPeriodo=new Map();
    asAct.filter(a=>a.origenAuto===origen).forEach(a=>{
      const k=a.periodoIVA||'sin-periodo';porPeriodo.set(k,(porPeriodo.get(k)||0)+1);
    });
    [...porPeriodo].filter(([,c])=>c>1).forEach(([per,c])=>agregar('alta','f29_duplicado',`${c} asientos ${origen==='ivaf29'?'de compensación IVA':'de pago F29'} activos para ${per}`,`${origen}:${per}`));
  }

  // 7) Pagos: cada referencia debe apuntar a un documento existente y activo.
  asAct.filter(a=>a.tipo==='pago').forEach(a=>{
    (a.documentos||[]).forEach(r=>{
      const arr=r.tipo==='cliente'?S.ventas:S.compras;
      const d=(arr||[]).find(x=>x.id===r.docId&&x.estado!=='anulado');
      if(!d)agregar('alta','pago_sin_documento',`Pago ${a.n||a.id} referencia documento inexistente/anulado ${r.docId}`,a.id);
    });
  });

  // 8) Reglas del Plan de Cuentas sobre todos los movimientos activos.
  for(const a of asAct){
    (a.movs||[]).forEach((m,i)=>{
      const r=reglaCuenta(m.cd);
      if(!r)agregar('critica','cuenta_inexistente',`Asiento ${a.n||a.id}, línea ${i+1}: cuenta ${m.cd} no existe en PDC`,a.id);
      else{
        if(!r.activa)agregar('alta','cuenta_inactiva',`Asiento ${a.n||a.id}: usa cuenta inactiva ${m.cd}`,a.id);
        if(!r.aceptaMovimientos)agregar('critica','movimiento_en_agrupadora',`Asiento ${a.n||a.id}: movimiento directo en cuenta agrupadora ${m.cd}`,a.id);
        if(r.requiereAuxiliar&&!m.rutCodigo)agregar('critica','cuenta_requiere_auxiliar',`Asiento ${a.n||a.id}: ${m.cd} requiere auxiliar`,a.id);
        if(m.cc&&!r.aceptaCentroCosto)agregar('alta','cc_no_permitido',`Asiento ${a.n||a.id}: ${m.cd} no admite centro de costo`,a.id);
      }
    });
  }

  // 9) Control mensual IVA: documento vs asiento maestro por período.
  for(const [fuente,arr,cdIVA] of [['ventas',S.ventas||[],'2103003'],['compras',S.compras||[],'1108002']]){
    const periodos=new Set((arr||[]).filter(d=>d.estado!=='anulado').map(d=>String(d.fecha||'').slice(0,7)).filter(Boolean));
    for(const per of periodos){
      const ivaDocs=(arr||[]).filter(d=>d.estado!=='anulado'&&String(d.fecha||'').startsWith(per)).reduce((t,d)=>t+Math.abs(n(d.iva)),0);
      const ivaAs=asAct.filter(a=>a.tipo==='documento'&&a.fuente===fuente&&String(a.fecha||'').startsWith(per)).reduce((t,a)=>t+Math.abs((a.movs||[]).filter(m=>m.cd===cdIVA&&m.tributo!=='iva_retenido').reduce((s,m)=>s+n(m.debe)-n(m.haber),0)),0);
      if(Math.abs(ivaDocs-ivaAs)>1)agregar('critica','iva_periodo_difiere',`${fuente} ${per}: IVA documentos ${Math.round(ivaDocs)} ≠ IVA asientos ${Math.round(ivaAs)}`,`${fuente}:${per}`);
    }
  }

  // 10) Activo fijo: verificar que los registros nuevos separen base contable/tributaria.
  (S.activos||[]).forEach(b=>{
    if(b.valorContable==null||b.valorTributario==null)agregar('alta','activo_modelo_legacy',`Activo "${b.desc||b.id}" aún usa modelo histórico; editar y guardar para separar base contable/tributaria`,b.id);
    if((+b.valorContable||+b.valor||0)<0||(+b.valorTributario||+b.valor||0)<0)agregar('critica','activo_valor_invalido',`Activo "${b.desc||b.id}" tiene valor negativo`,b.id);
  });

  const porSeveridad=hallazgos.reduce((o,h)=>(o[h.sev]=(o[h.sev]||0)+1,o),{});
  return {ok:hallazgos.length===0,total:hallazgos.length,hallazgos,porSeveridad};
}

export {idAsientoDoc,ejercicioCerrado,puedeOperarFecha,persistirAsientosCritico,asientoDesdeDocumento,upsertAsientoDocumento,anularAsientoDocumento,guardarDocumentoContabilizado,anularDocumentoContabilizado,migrarDocumentosAAsientos,auditoriaIntegridad};
