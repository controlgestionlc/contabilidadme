// contabilidad-v2.js — capa de orquestación contable V2.
// Mantiene un asiento persistido por documento y protege operaciones críticas.
import {S,AUTH} from './state.js';
import {logAccion,logCambio} from './firebase.js';
import {asientoVenta,asientoCompra,cuadratura,tributacionCompra,clasificacionIVACompra,clasificacionOtrosImpuestosCompra,periodoContableCompra,fechaContabilizacionCompra} from './motor-contable.js';
import {validarMovimientosPDC,reglaCuenta} from './pdc-reglas.js';
import {dteV,dteC} from './core.js';
import {asegurarNumerosContables} from './correlativo-contable.js';
import {validarAsientoCentral,validarMutacionAsientos,leerAsientosPersistidosLocal} from './asiento-validacion.js';
import {puedeEditar} from './auth.js';
import {empresaActiva,puedeVerEmpresa} from './empresas.js';

const n=v=>Number(v)||0;
const idAsientoDoc=(fuente,docId)=>`auto:${fuente}:${docId}`;

// Guardia de último nivel para storage.js. Aunque un módulo antiguo escriba
// `asientos-AAAA` directamente, la escritura se rechaza si la mutación no pasa
// las mismas reglas centrales. `prevRaw` permite validar también el resultado
// fusionado dentro de una transacción Firebase.
if(typeof window!=='undefined')window.__validarEscrituraAsientos=(key,value,prevRaw=null)=>{
  if(window.__bypassValidacionAsientos===true)return {ok:true,bypass:true};
  if(!/^asientos-\d{4}$/.test(String(key||'')))return {ok:true};
  let nuevos,previos;
  try{nuevos=JSON.parse(String(value||'[]'));}catch(e){return {ok:false,motivo:'asientos-json-invalido'};}
  if(!Array.isArray(nuevos))return {ok:false,motivo:'asientos-no-es-lista'};
  if(prevRaw!=null){try{previos=JSON.parse(String(prevRaw||'[]'));}catch(e){previos=[];}}
  else previos=leerAsientosPersistidosLocal(String(key).slice(-4));
  const r=validarMutacionAsientos(Array.isArray(previos)?previos:[],nuevos);
  return r.ok?{ok:true,cambiados:r.cambiados}:{ok:false,motivo:'validacion-contable',errores:r.errores};
};

// Persiste varias claves relacionadas como una sola unidad cuando storage V2.10
// ofrece transacción multi-documento. El fallback conserva compatibilidad con
// versiones antiguas del shim, pero la versión actual siempre usa setMany.
async function persistirClavesCritico(entries){
  const lista=(entries||[]).map(e=>({...e}));
  if(lista.some(e=>String(e.key||'')===`asientos-${S.empresa.anio}`)){
    const previo=leerAsientosPersistidosLocal();
    const val=validarMutacionAsientos(previo,S.asientos||[]);
    if(!val.ok)throw new Error('validacion-contable: '+val.errores[0]);
    const nr=await asegurarNumerosContables();
    if(!nr.ok)throw new Error(nr.motivo||'correlativo-contable');
    // La numeración también es parte del asiento definitivo: se valida otra vez
    // después de asignarla para impedir que un cambio inesperado llegue a nube.
    const val2=validarMutacionAsientos(previo,S.asientos||[]);
    if(!val2.ok)throw new Error('validacion-contable: '+val2.errores[0]);
    lista.forEach(e=>{if(String(e.key||'')===`asientos-${S.empresa.anio}`)e.value=JSON.stringify(S.asientos||[]);});
  }
  entries=lista;
  if(window.storage&&typeof window.storage.setMany==='function'){
    const r=await window.storage.setMany(entries);
    if(!r||r.ok===false)throw new Error(r?.motivo||'fallo-persistencia-multiple');
    return r;
  }
  if(entries.length>1)throw new Error('Se requiere almacenamiento transaccional (setMany). Recarga la aplicación antes de guardar.');
  for(const e of entries){
    const r=await window.storage.set(e.key,e.value);
    if(!r||r.ok===false)throw new Error(r?.motivo||`fallo-${e.key}`);
  }
  return {ok:true};
}

function ejercicioCerrado(){
  const anio=+S.empresa.anio;
  return (S.asientos||[]).some(a=>!a.anulado&&a.tipo==='cierre'&&(+((a.ejercicio)||String(a.fecha||'').slice(0,4))===anio));
}
function periodoDeFecha(fecha){return String(fecha||'').slice(0,7);}
function periodoCerrado(fechaOPeriodo){
  const per=String(fechaOPeriodo||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(per))return false;
  return (S.cierresContables||[]).some(c=>c.periodo===per&&c.estado==='cerrado');
}
function puedeOperarFecha(fecha){
  if(!fecha)return !ejercicioCerrado();
  const anio=+String(fecha).slice(0,4);
  if(anio===+S.empresa.anio&&ejercicioCerrado())return false;
  return !periodoCerrado(fecha);
}
function puedeGestionarCierresMensuales(){
  const u=AUTH.user;
  if(!u?.activo||!['admin','contador'].includes(u.rol))return false;
  const e=empresaActiva();
  return !!e&&puedeVerEmpresa(e)&&puedeEditar('cierresmensuales');
}
async function cerrarPeriodoContable(periodo,motivo='Cierre mensual de control'){
  if(!/^\d{4}-\d{2}$/.test(String(periodo||'')))return {ok:false,motivo:'periodo-invalido'};
  if(+String(periodo).slice(0,4)!==+S.empresa.anio)return {ok:false,motivo:'otro-ejercicio'};
  if(ejercicioCerrado())return {ok:false,motivo:'ejercicio-cerrado'};
  if(!puedeGestionarCierresMensuales())return {ok:false,motivo:'sin-permiso'};
  if(periodoCerrado(periodo))return {ok:true,yaCerrado:true};
  const aud=auditoriaIntegridad();
  if((aud.porSeveridad?.critica||0)>0)return {ok:false,motivo:'integridad-critica',criticas:aud.porSeveridad.critica};
  if(!Array.isArray(S.cierresContables))S.cierresContables=[];
  const rec={periodo,estado:'cerrado',cerradoEn:new Date().toISOString(),cerradoPor:AUTH.user?.email||'',motivo:String(motivo||'').trim()||'Cierre mensual de control'};
  S.cierresContables.push(rec);
  const r=await window.storage.set(`cierresContables-${S.empresa.anio}`,JSON.stringify(S.cierresContables));
  if(r&&r.ok===false){S.cierresContables=S.cierresContables.filter(x=>x!==rec);return {ok:false,motivo:r.motivo||'persistencia'};}
  logAccion('Cerró período contable',{periodo,motivo:rec.motivo,estado:'cerrado'});
  logCambio('Cerró período contable',{entidad:'cierre-mensual',id:periodo,antes:null,despues:rec,meta:{periodo}});
  return {ok:true,registro:rec};
}
async function reabrirPeriodoContable(periodo,motivo){
  if(!puedeGestionarCierresMensuales())return {ok:false,motivo:'sin-permiso'};
  if(ejercicioCerrado())return {ok:false,motivo:'ejercicio-cerrado'};
  if(!motivo||String(motivo).trim().length<10)return {ok:false,motivo:'motivo-corto'};
  const rec=(S.cierresContables||[]).find(c=>c.periodo===periodo&&c.estado==='cerrado');
  if(!rec)return {ok:false,motivo:'no-cerrado'};
  const previo={...rec};
  rec.estado='reabierto';rec.reabiertoEn=new Date().toISOString();rec.reabiertoPor=AUTH.user?.email||'';rec.motivoReapertura=String(motivo).trim();
  const r=await window.storage.set(`cierresContables-${S.empresa.anio}`,JSON.stringify(S.cierresContables));
  if(r&&r.ok===false){Object.assign(rec,previo);return {ok:false,motivo:r.motivo||'persistencia'};}
  logAccion('Reabrió período contable',{periodo,motivo:rec.motivoReapertura,estado:'reabierto'});
  logCambio('Reabrió período contable',{entidad:'cierre-mensual',id:periodo,antes:previo,despues:rec,meta:{periodo}});
  return {ok:true};
}

// Persistencia crítica de asientos con rollback en memoria. Todos los módulos
// que crean/anulan asientos automáticos pueden usar esta misma puerta.
async function persistirAsientosCritico(mutacion){
  if(ejercicioCerrado())return {ok:false,motivo:'ejercicio-cerrado'};
  const snap=JSON.stringify(S.asientos||[]);
  try{
    const resultado=await mutacion();
    const previo=JSON.parse(snap);
    const val=validarMutacionAsientos(previo,S.asientos||[]);
    if(!val.ok)throw new Error('validacion-contable: '+val.errores[0]);
    const nr=await asegurarNumerosContables();
    if(!nr.ok)throw new Error(nr.motivo||'correlativo-contable');
    const val2=validarMutacionAsientos(previo,S.asientos||[]);
    if(!val2.ok)throw new Error('validacion-contable: '+val2.errores[0]);
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
  if(doc.excluidoAuto||(S.asientos||[]).some(a=>!a.anulado&&a.referenciaDoc?.fuente===fuente&&a.referenciaDoc?.docId===doc.id)){
    throw new Error('Documento convertido por una versión anterior: abre Editar en su libro para recuperar el vínculo antes de importar o regenerar.');
  }
  const id=idAsientoDoc(fuente,doc.id);
  const i=S.asientos.findIndex(a=>a.id===id||(a.tipo==='documento'&&a.fuente===fuente&&a.docId===doc.id));
  const activos=S.asientos.filter(a=>!a.anulado&&a.tipo==='documento'&&a.fuente===fuente&&a.docId===doc.id);
  if(activos.length>1)throw new Error('Más de un asiento activo vinculado al documento. Requiere revisión de duplicados.');
  const nuevo=asientoDesdeDocumento(fuente,doc);
  if(i>=0){
    // conservar metadatos operativos relevantes
    nuevo.id=S.asientos[i].id;
    nuevo.n=S.asientos[i].n||S.asientos[i].folioComp||null;
    nuevo.numeroContable=S.asientos[i].numeroContable||null;
    nuevo.numeroContableOrigen=S.asientos[i].numeroContableOrigen||null;
    nuevo.numeroContableAsignadoEn=S.asientos[i].numeroContableAsignadoEn||null;
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
  const lock=`${fuente}:${doc.id}`;
  if(documentosGuardando.has(lock))return {ok:false,motivo:'guardado-en-curso'};
  if(!puedeOperarFecha(fuente==='compras'?fechaContabilizacionCompra(doc):doc.fecha))return {ok:false,motivo:'ejercicio-cerrado'};
  const claveDoc=`${fuente}-${S.empresa.anio}`;
  const claveAs=`asientos-${S.empresa.anio}`;
  const snapArr=JSON.stringify(arr);
  const snapAs=JSON.stringify(S.asientos||[]);
  const anterior=esEdicion?JSON.parse(JSON.stringify(arr.find(x=>x.id===doc.id)||null)):null;
  if(anterior&&!puedeOperarFecha(fuente==='compras'?fechaContabilizacionCompra(anterior):anterior.fecha))return {ok:false,motivo:'periodo-original-cerrado'};
  documentosGuardando.add(lock);
  try{
    if(esEdicion){
      const convertidos=(S.asientos||[]).filter(a=>!a.anulado&&a.referenciaDoc?.fuente===fuente&&a.referenciaDoc?.docId===doc.id);
      if(convertidos.length||anterior?.excluidoAuto){
        if(!confirm('Este documento fue convertido a un asiento manual por una versión anterior. Al guardar se regenerará el comprobante desde estos datos y se anulará la conversión vinculada, conservando su historial. Los cambios manuales no reflejados en el documento no se conservarán. ¿Continuar?'))throw new Error('recuperación cancelada');
        convertidos.forEach(a=>{a.anulado=true;a.anuladoEn=new Date().toISOString();a.motivoAnulacion='Recuperación de vínculo documental V2.16.28';});
        doc.excluidoAuto=false;
      }
    }
    if(esEdicion){
      const i=arr.findIndex(x=>x.id===doc.id); if(i<0)throw new Error('Documento no encontrado');
      arr[i]=doc;
    }else{
      if(arr.some(x=>x.id===doc.id))throw new Error('El documento ya existe; use Editar.');
      arr.push(doc);
    }
    const actualizado=upsertAsientoDocumento(fuente,doc);
    await persistirClavesCritico([
      {key:claveDoc,value:JSON.stringify(arr)},
      {key:claveAs,value:JSON.stringify(S.asientos)},
    ]);
    const asiento=actualizado;
    logCambio(esEdicion?'Editó documento':'Registró documento',{entidad:fuente==='ventas'?'venta':'compra',id:doc.id,antes:anterior,despues:doc,meta:{asientoId:asiento?.id,numeroContable:asiento?.numeroContable,tipoDTE:doc.tipoDTE,folio:doc.numero}});
    return {ok:true,asiento:asiento.id};
  }catch(e){
    const arrPrev=JSON.parse(snapArr), asPrev=JSON.parse(snapAs);
    arr.splice(0,arr.length,...arrPrev); S.asientos=asPrev;
    return {ok:false,motivo:e.message||String(e)};
  }finally{
    documentosGuardando.delete(lock);
  }
}
const documentosGuardando=new Set();

async function anularDocumentoContabilizado(fuente,doc,arr){
  if(!puedeOperarFecha(fuente==='compras'?fechaContabilizacionCompra(doc):doc.fecha))return {ok:false,motivo:'ejercicio-cerrado'};
  const snapArr=JSON.stringify(arr),snapAs=JSON.stringify(S.asientos||[]);
  const anterior=JSON.parse(JSON.stringify(doc));
  doc.estado='anulado';doc.anuladoEn=new Date().toISOString();
  anularAsientoDocumento(fuente,doc.id);
  try{
    await persistirClavesCritico([
      {key:`${fuente}-${S.empresa.anio}`,value:JSON.stringify(arr)},
      {key:`asientos-${S.empresa.anio}`,value:JSON.stringify(S.asientos)},
    ]);
    const asiento=(S.asientos||[]).find(a=>a.id===idAsientoDoc(fuente,doc.id));
    logCambio('Anuló documento',{entidad:fuente==='ventas'?'venta':'compra',id:doc.id,antes:anterior,despues:doc,meta:{asientoId:asiento?.id,numeroContable:asiento?.numeroContable,tipoDTE:doc.tipoDTE,folio:doc.numero}});
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
  const val=validarMutacionAsientos([],S.asientos||[]);
  if(!val.ok)return {ok:false,creados,actualizados,motivo:'validacion-contable: '+val.errores[0]};
  const nr=await asegurarNumerosContables();
  if(!nr.ok)return {ok:false,creados,actualizados,motivo:nr.motivo||'correlativo-contable'};
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
  // Honorarios también son documentos maestros desde V2.5.
  for(const h of (S.honorarios||[]).filter(x=>x.estado!=='anulado'&&+x.bruto>0)){
    const encontrados=asAct.filter(x=>x.tipo==='documento'&&x.fuente==='honorarios'&&x.docId===h.id);
    if(!encontrados.length)agregar('critica','honorario_sin_asiento',`Honorario ${h.nombre||h.id} sin asiento de reconocimiento persistido`,h.id);
    if(encontrados.length>1)agregar('critica','honorario_asiento_duplicado',`${encontrados.length} asientos de reconocimiento para honorario ${h.nombre||h.id}`,h.id);
    if(h.modalidad==='contado'){
      const pagos=asAct.filter(x=>x.tipo==='pago'&&x.fuente==='honorarios'&&x.docId===h.id);
      if(!pagos.length)agregar('alta','honorario_contado_sin_pago',`Honorario ${h.nombre||h.id} está marcado al contado pero no tiene asiento de pago`,h.id);
    }
  }
  for(const a of asAct.filter(x=>x.tipo==='documento')){
    let arr=[];
    if(a.fuente==='ventas')arr=S.ventas;
    else if(a.fuente==='compras')arr=S.compras;
    else if(a.fuente==='honorarios')arr=S.honorarios;
    else continue;
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
  for(const d of (S.ventas||[]).filter(x=>x.estado!=='anulado'&&!x.excluidoAuto)){
    const a=asAct.find(x=>x.tipo==='documento'&&x.fuente==='ventas'&&x.docId===d.id); if(!a)continue;
    const contabilizado=Math.abs((a.movs||[]).filter(m=>m.cd==='2103003').reduce((s,m)=>s+n(m.haber)-n(m.debe),0));
    const esperado=Math.abs(n(d.iva));
    if(Math.abs(contabilizado-esperado)>1)agregar('critica','iva_documento_difiere',`ventas DTE ${d.tipoDTE} N°${d.numero}: IVA documento ${Math.round(esperado)} ≠ IVA asiento ${Math.round(contabilizado)}`,d.id);
  }
  for(const d of (S.compras||[]).filter(x=>x.estado!=='anulado'&&!x.excluidoAuto)){
    const a=asAct.find(x=>x.tipo==='documento'&&x.fuente==='compras'&&x.docId===d.id); if(!a)continue;
    const ci=clasificacionIVACompra(d);
    // V2.11.1: la fecha documental puede pertenecer a otro mes, pero el asiento
    // debe quedar obligatoriamente dentro del periodo RCV/contable informado.
    const perC=periodoContableCompra(d);
    const fechaC=fechaContabilizacionCompra(d);
    if(d.origenRegistro==='RCV'&&!/^\d{4}-\d{2}$/.test(String(d.periodoContable||'')))
      agregar('critica','rcv_sin_periodo_contable',`Compra DTE ${d.tipoDTE} N°${d.numero}: importada desde RCV sin período contable`,d.id);
    if(perC&&String(a.fecha||'').slice(0,7)!==perC)
      agregar('critica','asiento_fuera_periodo_rcv',`Compra DTE ${d.tipoDTE} N°${d.numero}: período contable ${perC} pero asiento fechado ${a.fecha||'sin fecha'}`,d.id);
    if(d.fechaContabilizacion&&a.fecha!==fechaC)
      agregar('alta','fecha_contabilizacion_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: fecha contable esperada ${fechaC} ≠ asiento ${a.fecha||'sin fecha'}`,d.id);
    const recGeneral=Math.abs((a.movs||[]).filter(m=>m.cd==='1108002').reduce((s,m)=>s+n(m.debe)-n(m.haber),0));
    const recAF=Math.abs((a.movs||[]).filter(m=>m.cd==='1108008').reduce((s,m)=>s+n(m.debe)-n(m.haber),0));
    if(Math.abs(recGeneral-(ci.recuperable-ci.activoFijo))>1)agregar('critica','iva_credito_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: crédito general esperado ${Math.round(ci.recuperable-ci.activoFijo)} ≠ asiento ${Math.round(recGeneral)}`,d.id);
    if(Math.abs(recAF-ci.activoFijo)>1)agregar('critica','iva_activo_fijo_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: crédito activo fijo esperado ${Math.round(ci.activoFijo)} ≠ asiento ${Math.round(recAF)}`,d.id);
    const cuentasCosto=new Set((d.dist||[]).map(l=>l.cuenta).filter(Boolean));
    const costoAs=Math.abs((a.movs||[]).filter(m=>cuentasCosto.has(m.cd)).reduce((s,m)=>s+n(m.debe)-n(m.haber),0));
    const oi=clasificacionOtrosImpuestosCompra(d);
    const costoEsperado=Math.abs(n(d.neto)+n(d.exento)+oi.costo+ci.noRecuperable);
    if(cuentasCosto.size&&Math.abs(costoAs-costoEsperado)>1)agregar('critica','iva_no_recuperable_costo_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: costo esperado con IVA no recuperable ${Math.round(costoEsperado)} ≠ asiento ${Math.round(costoAs)}`,d.id);
    if(Math.abs((ci.recuperable+ci.noRecuperable)-ci.total)>1)agregar('critica','clasificacion_iva_invalida',`Compra DTE ${d.tipoDTE} N°${d.numero}: clasificación IVA no suma el IVA total`,d.id);
    const otrosRecAs=Math.abs((a.movs||[]).filter(m=>m.cd==='1108006'&&m.tributo==='impuesto_adicional_recuperable').reduce((t,m)=>t+n(m.debe)-n(m.haber),0));
    if(Math.abs(otrosRecAs-oi.recuperable)>1)agregar('critica','otros_impuestos_recuperables_difieren',`Compra DTE ${d.tipoDTE} N°${d.numero}: otros impuestos recuperables esperados ${Math.round(oi.recuperable)} ≠ asiento ${Math.round(otrosRecAs)}`,d.id);
    const sumaDet=(oi.detalle||[]).reduce((t,x)=>t+n(x.monto),0);
    if(Math.abs(sumaDet-oi.total)>1)agregar('alta','otros_impuestos_detalle_invalido',`Compra DTE ${d.tipoDTE} N°${d.numero}: detalle de otros impuestos no suma el total informado`,d.id);
    const rechazadoDist=(d.dist||[]).filter(l=>l.tratamientoTributario==='rechazado').reduce((t,l)=>t+n(l.monto),0);
    const rechazadoAs=Math.abs((a.movs||[]).filter(m=>m.tributario==='gasto_rechazado').reduce((t,m)=>t+n(m.debe)-n(m.haber),0));
    if(rechazadoDist>0&&rechazadoAs<1)agregar('alta','gasto_rechazado_sin_marca_asiento',`Compra DTE ${d.tipoDTE} N°${d.numero}: tiene líneas tributariamente rechazadas pero el asiento no conserva la marca`,d.id);
  }


  // 4b) Facturas de compra DTE 45/46: retención y total proveedor deben seguir
  //     la normalización única del motor contable.
  for(const d of (S.compras||[]).filter(x=>x.estado!=='anulado'&&( +x.tipoDTE===45||+x.tipoDTE===46))){
    const a=asAct.find(x=>x.tipo==='documento'&&x.fuente==='compras'&&x.docId===d.id); if(!a)continue;
    const tc=tributacionCompra(d);
    const retAs=Math.abs((a.movs||[]).filter(m=>m.cd==='2103005'&&m.tributo==='iva_retenido').reduce((t,m)=>t+n(m.haber)-n(m.debe),0));
    const provAs=Math.abs((a.movs||[]).filter(m=>m.cd==='2102001').reduce((t,m)=>t+n(m.haber)-n(m.debe),0));
    if(Math.abs(retAs-tc.ivaRetenido)>1)agregar('critica','iva_retenido_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: retención esperada ${Math.round(tc.ivaRetenido)} ≠ asiento ${Math.round(retAs)}`,d.id);
    if(Math.abs(provAs-tc.totalProveedor)>1)agregar('critica','proveedor_factura_compra_difiere',`Compra DTE ${d.tipoDTE} N°${d.numero}: proveedor esperado ${Math.round(tc.totalProveedor)} ≠ asiento ${Math.round(provAs)}`,d.id);
    if(tc.diferenciaTotal>1)agregar('alta','total_factura_compra_ambiguo',`Compra DTE ${d.tipoDTE} N°${d.numero}: total informado ${Math.round(tc.totalInformado)} no coincide con total documento ${Math.round(tc.totalDocumento)} ni total proveedor ${Math.round(tc.totalProveedor)}`,d.id);
  }

  // 4c) Notas de crédito/débito: desde V2.11 deben conservar el documento
  //     referenciado. En datos históricos la ausencia se reporta como alta,
  //     no crítica, para no bloquear cierres sólo por migración documental.
  for(const [fuente,arr] of [['ventas',S.ventas||[]],['compras',S.compras||[]]]){
    for(const d of arr.filter(x=>x.estado!=='anulado'&&(+x.tipoDTE===56||+x.tipoDTE===61))){
      if(!d.referencia?.folio)agregar('alta','nota_sin_referencia',`${fuente} DTE ${d.tipoDTE} N°${d.numero}: falta folio del documento referenciado`,d.id);
      if(d.referencia?.fecha&&d.fecha&&d.referencia.fecha>d.fecha)agregar('alta','nota_referencia_fecha_posterior',`${fuente} DTE ${d.tipoDTE} N°${d.numero}: la fecha del documento referenciado es posterior a la nota`,d.id);
    }
  }

  // 5) Cierre y secuencia temporal
  const cierres=asAct.filter(a=>a.tipo==='cierre');
  if(cierres.length>1)agregar('critica','cierres_duplicados',`Existen ${cierres.length} asientos de cierre activos`);
  if(cierres.length){
    const fc=cierres.map(a=>a.fecha||'').sort().at(-1);
    asAct.filter(a=>a.tipo!=='cierre'&&a.fecha>fc).forEach(a=>agregar('critica','movimiento_post_cierre',`Movimiento ${a.id} posterior al cierre (${a.fecha})`,a.id));
  }

  // 6) IVA/F29: la compensación debe ser única por período. Desde V2.14 los
  //    pagos F29 pueden ser múltiples porque representan abonos/pagos parciales.
  {
    const porPeriodo=new Map();
    asAct.filter(a=>a.origenAuto==='ivaf29').forEach(a=>{
      const k=a.periodoIVA||'sin-periodo';porPeriodo.set(k,(porPeriodo.get(k)||0)+1);
    });
    [...porPeriodo].filter(([,c])=>c>1).forEach(([per,c])=>agregar('alta','f29_compensacion_duplicada',`${c} asientos de compensación IVA activos para ${per}`,`ivaf29:${per}`));
  }
  // Los pagos parciales nuevos deben conservar metadata estructurada para poder
  // reconstruir el acumulado por concepto sin depender de la glosa.
  asAct.filter(a=>a.origenAuto==='pagof29').forEach(a=>{
    if(!a.periodoIVA)agregar('alta','f29_pago_sin_periodo',`Pago F29 ${a.n||a.id} sin período IVA asociado`,a.id);
    if(!a.f29Detalle?.componentes)agregar('media','f29_pago_legacy',`Pago F29 ${a.n||a.id} no tiene detalle estructurado por concepto; se conciliará por compatibilidad histórica`,a.id);
  });

  // 7) Pagos: cada referencia debe apuntar a un documento existente y activo.
  asAct.filter(a=>a.tipo==='pago').forEach(a=>{
    (a.documentos||[]).forEach(r=>{
      const arr=r.tipo==='cliente'?S.ventas:r.tipo==='honorario'?S.honorarios:S.compras;
      const d=(arr||[]).find(x=>x.id===r.docId&&x.estado!=='anulado');
      if(!d)agregar('alta','pago_sin_documento',`Pago ${a.n||a.id} referencia documento inexistente/anulado ${r.docId}`,a.id);
    });
  });

  // 8) Honorarios: la retención registrada debe coincidir con el asiento maestro.
  for(const h of (S.honorarios||[]).filter(x=>x.estado!=='anulado'&&+x.bruto>0)){
    const a=asAct.find(x=>x.tipo==='documento'&&x.fuente==='honorarios'&&x.docId===h.id); if(!a)continue;
    const retAs=Math.abs((a.movs||[]).filter(m=>m.cd==='2103002').reduce((t,m)=>t+n(m.haber)-n(m.debe),0));
    const tasa=n(h.tasaRetencion)||0;
    const retEsp=tasa?Math.round(n(h.bruto)*tasa):retAs;
    if(tasa&&Math.abs(retAs-retEsp)>1)agregar('critica','retencion_honorario_difiere',`Honorario ${h.nombre||h.id}: retención esperada ${retEsp} ≠ asiento ${Math.round(retAs)}`,h.id);
  }

  // 9) Reglas del Plan de Cuentas sobre todos los movimientos activos.
  for(const a of asAct){
    (a.movs||[]).forEach((m,i)=>{
      const r=reglaCuenta(m.cd);
      if(!r)agregar('critica','cuenta_inexistente',`Asiento ${a.n||a.id}, línea ${i+1}: cuenta ${m.cd} no existe en PDC`,a.id);
      else{
        if(!r.activa)agregar('alta','cuenta_inactiva',`Asiento ${a.n||a.id}: usa cuenta inactiva ${m.cd}`,a.id);
        if(!r.aceptaMovimientos)agregar('critica','movimiento_en_agrupadora',`Asiento ${a.n||a.id}: movimiento directo en cuenta agrupadora ${m.cd}`,a.id);
        if(r.requiereAuxiliar&&!m.rutCodigo)agregar('critica','cuenta_requiere_auxiliar',`Asiento ${a.numeroContable||a.n||a.id}: ${m.cd} requiere auxiliar`,a.id);
        if(r.requiereCentroCosto&&!m.cc)agregar('critica','cc_obligatorio_faltante',`Asiento ${a.numeroContable||a.n||a.id}: ${m.cd} exige centro de costo`,a.id);
        if(m.cc&&!r.aceptaCentroCosto)agregar('alta','cc_no_permitido',`Asiento ${a.numeroContable||a.n||a.id}: ${m.cd} no admite centro de costo`,a.id);
        if(m.cc&&!(S.centros||[]).some(c=>String(c.id)===String(m.cc)||String(c.codigo||'')===String(m.cc)))agregar('critica','cc_inexistente',`Asiento ${a.numeroContable||a.n||a.id}: centro de costo ${m.cc} inexistente`,a.id);
      }
    });
  }

  // 10) Control mensual IVA: documento vs asiento maestro por período.
  for(const fuente of ['ventas','compras']){
    const arr=fuente==='ventas'?(S.ventas||[]):(S.compras||[]);
    const periodos=new Set(arr.filter(d=>d.estado!=='anulado').map(d=>fuente==='compras'?periodoContableCompra(d):String(d.fecha||'').slice(0,7)).filter(Boolean));
    for(const per of periodos){
      let ivaDocs=0,ivaAs=0;
      if(fuente==='ventas'){
        ivaDocs=arr.filter(d=>d.estado!=='anulado'&&String(d.fecha||'').startsWith(per)).reduce((t,d)=>t+n(d.iva)*((dteV(d.tipoDTE)?.signo)||1),0);
        ivaAs=asAct.filter(a=>a.tipo==='documento'&&a.fuente===fuente&&String(a.fecha||'').startsWith(per)).reduce((t,a)=>t+(a.movs||[]).filter(m=>m.cd==='2103003').reduce((s,m)=>s+n(m.haber)-n(m.debe),0),0);
      }else{
        ivaDocs=arr.filter(d=>d.estado!=='anulado'&&periodoContableCompra(d)===per).reduce((t,d)=>t+clasificacionIVACompra(d).recuperable*((dteC(d.tipoDTE)?.signo)||1),0);
        ivaAs=asAct.filter(a=>a.tipo==='documento'&&a.fuente===fuente&&String(a.fecha||'').startsWith(per)).reduce((t,a)=>t+(a.movs||[]).filter(m=>m.cd==='1108002'||m.cd==='1108008').reduce((s,m)=>s+n(m.debe)-n(m.haber),0),0);
      }
      if(Math.abs(ivaDocs-ivaAs)>1)agregar('critica','iva_periodo_difiere',`${fuente} ${per}: IVA recuperable documentos ${Math.round(ivaDocs)} ≠ IVA asientos ${Math.round(ivaAs)}`,`${fuente}:${per}`);
    }
  }

  // 11) Activo fijo: bases separadas, compra de origen y depreciación única/trazable.
  const activosAct=(S.activos||[]).filter(b=>b.estado!=='anulado');
  activosAct.forEach(b=>{
    if(b.valorContable==null||b.valorTributario==null)agregar('alta','activo_modelo_legacy',`Activo "${b.desc||b.id}" aún usa modelo histórico; editar y guardar para separar base contable/tributaria`,b.id);
    if((+b.valorContable||+b.valor||0)<0||(+b.valorTributario||+b.valor||0)<0)agregar('critica','activo_valor_invalido',`Activo "${b.desc||b.id}" tiene valor negativo`,b.id);
    if(b.compraOrigenId){
      const c=(S.compras||[]).find(x=>x.id===b.compraOrigenId&&x.estado!=='anulado');
      if(!c)agregar('alta','activo_compra_origen_inexistente',`Activo "${b.desc||b.id}" referencia una compra inexistente o anulada`,b.id);
    }
  });
  const depPorAnio=new Map();
  asAct.filter(a=>a.tipo==='depreciacion').forEach(a=>{
    const an=String(a.periodoAF||a.fecha||'').slice(0,4)||'sin-año';
    depPorAnio.set(an,(depPorAnio.get(an)||0)+1);
    if(Array.isArray(a.detalleActivos)){
      const sumDet=a.detalleActivos.reduce((t,x)=>t+n(x.monto),0);
      const sumAs=(a.movs||[]).filter(m=>String(m.cd||'').startsWith('3301')).reduce((t,m)=>t+n(m.debe)-n(m.haber),0);
      if(Math.abs(sumDet-sumAs)>1)agregar('critica','depreciacion_detalle_difiere',`Depreciación ${an}: detalle de activos ${Math.round(sumDet)} ≠ gasto contabilizado ${Math.round(sumAs)}`,a.id);
      a.detalleActivos.forEach(x=>{if(!activosAct.some(b=>b.id===x.activoId))agregar('alta','depreciacion_activo_inexistente',`Depreciación ${an} referencia activo inexistente/anulado ${x.activoId}`,a.id);});
    }else agregar('alta','depreciacion_sin_trazabilidad',`Asiento de depreciación ${an} no conserva detalle por activo; regenerar en un ejercicio abierto para obtener trazabilidad V2.9`,a.id);
  });
  [...depPorAnio].filter(([,c])=>c>1).forEach(([an,c])=>agregar('critica','depreciacion_duplicada',`${c} asientos de depreciación activos para ${an}`,`depreciacion:${an}`));

  // 12) Cierre mensual: ningún movimiento puede aparecer/modificarse después del cierre
  // dentro del mismo período sin una reapertura formal.
  (S.cierresContables||[]).filter(c=>c.estado==='cerrado').forEach(c=>{
    const tCierre=Date.parse(c.cerradoEn||'')||0;
    asAct.filter(a=>String(a.fecha||'').slice(0,7)===c.periodo).forEach(a=>{
      const tMov=Math.max(Date.parse(a.creadoEn||'')||0,Date.parse(a.actualizadoEn||'')||0,Date.parse(a.anuladoEn||'')||0);
      if(tCierre&&tMov>tCierre+1000)agregar('critica','movimiento_posterior_cierre_mensual',`Asiento ${a.n||a.id} del período ${c.periodo} fue modificado después de su cierre`,a.id);
    });
  });

  // 13) Numeración contable definitiva: todo asiento maestro debe conservar
  // un número único. Los números anulados no se reutilizan.
  const nums=new Map();
  (S.asientos||[]).forEach(a=>{
    const num=Math.trunc(+a.numeroContable||0);
    if(!num){agregar('critica','asiento_sin_numero_contable',`Asiento ${a.id||'(sin id)'} no tiene número contable definitivo`,a.id);return;}
    if(!nums.has(num))nums.set(num,[]);nums.get(num).push(a);
  });
  [...nums.entries()].filter(([,arr])=>arr.length>1).forEach(([num,arr])=>agregar('critica','numero_contable_duplicado',`Número contable ${num} está asignado a ${arr.length} asientos`,String(num)));

  // 14) Persistencia: una clave bloqueada significa que no pudo confirmarse
  // su lectura remota. Guardar encima de ella podría destruir información.
  try{
    const bloqueos=window.storage?.clavesBloqueadas?.()||[];
    bloqueos.forEach(b=>agregar('critica','persistencia_bloqueada',`Persistencia bloqueada para ${b.clave}: ${b.motivo}`,b.clave));
  }catch(_e){}

  const porSeveridad=hallazgos.reduce((o,h)=>(o[h.sev]=(o[h.sev]||0)+1,o),{});
  return {ok:hallazgos.length===0,total:hallazgos.length,hallazgos,porSeveridad};
}

export {validarAsientoCentral,validarMutacionAsientos,idAsientoDoc,ejercicioCerrado,periodoCerrado,puedeOperarFecha,cerrarPeriodoContable,reabrirPeriodoContable,persistirClavesCritico,persistirAsientosCritico,asientoDesdeDocumento,upsertAsientoDocumento,anularAsientoDocumento,guardarDocumentoContabilizado,anularDocumentoContabilizado,migrarDocumentosAAsientos,auditoriaIntegridad};
