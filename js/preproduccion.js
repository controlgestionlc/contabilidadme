// preproduccion.js — V2.15.7 · Modo PRUEBA / PRODUCCIÓN y checklist de puesta en marcha.
import {S,AUTH} from './state.js';
import {toast} from './core.js';
import {logAccion} from './firebase.js';

const PREPRO={
  modo:'prueba',
  checklist:{empresa:false,pdc:false,saldos:false,rcv:false,usuarios:false,respaldo:false},
  activadoEn:null,activadoPor:null,version:null,revision:null
};
const CHECKS={
  empresa:'Ficha de empresa y datos tributarios revisados',
  pdc:'Plan de cuentas y reglas obligatorias revisados',
  saldos:'Saldos de apertura / arrastre conciliados',
  rcv:'RCV Compras y Ventas del período piloto validado',
  usuarios:'Usuarios, roles y permisos revisados',
  respaldo:'Respaldo externo descargado y custodiado'
};
const k=()=>`preproduccion-${S.empresa.anio}`;
const ss=()=>`cv:preprod-write:${window.storage?.getPrefijo?.()||'emp'}:${S.empresa.anio}`;
function escrituraPruebaHabilitada(){try{return sessionStorage.getItem(ss())==='1';}catch(e){return false;}}
function setEscrituraPrueba(v){try{v?sessionStorage.setItem(ss(),'1'):sessionStorage.removeItem(ss());}catch(e){} actualizarBadgeEntorno();}
function normalizar(x){
  const c={...PREPRO.checklist,...(x?.checklist||{})};
  Object.assign(PREPRO,{modo:x?.modo==='produccion'?'produccion':'prueba',checklist:c,
    activadoEn:x?.activadoEn||null,activadoPor:x?.activadoPor||null,version:x?.version||null,revision:x?.revision||null});
  return PREPRO;
}
async function cargarPreproduccion(){
  normalizar(null);
  try{const r=await window.storage.get(k());if(r?.value)normalizar(JSON.parse(r.value));}catch(e){console.warn('Preproducción:',e);}
  instalarGuardiaEntorno();actualizarBadgeEntorno();return PREPRO;
}
async function persistir(){
  const r=await window.storage.set(k(),JSON.stringify(PREPRO));
  if(r?.ok===false)throw new Error(r.motivo||'No se pudo guardar configuración de entorno');
}
function actualizarBadgeEntorno(){
  const el=document.getElementById('entorno-badge');if(!el)return;
  const prod=PREPRO.modo==='produccion';
  const habil=escrituraPruebaHabilitada();
  el.textContent=prod?'● PRODUCCIÓN':habil?'● PRUEBA · ESCRITURA':'● PRUEBA · BLOQUEADA';
  el.style.display='inline-flex';
  el.style.background=prod?'rgba(46,160,67,.18)':habil?'rgba(210,153,34,.18)':'rgba(248,81,73,.14)';
  el.style.color=prod?'var(--ok)':'var(--warn)';
  el.title=prod?'Datos productivos: escrituras habilitadas':'Modo de preproducción: las escrituras de negocio requieren habilitación explícita por sesión';
}
function claveControl(k0){return /^preproduccion-\d{4}$/.test(k0)||/^hardening-/.test(k0)||/^recovery-/.test(k0)||/^_/.test(k0);}
function autorizarEscrituraEntorno(key){
  if(window.__entornoBypass===true)return {ok:true};
  if(claveControl(String(key||'')))return {ok:true};
  if(PREPRO.modo==='produccion')return {ok:true};
  if(escrituraPruebaHabilitada())return {ok:true};
  return {ok:false,motivo:'modo-prueba-bloqueado',detalle:'Modo PRUEBA: habilita escrituras de prueba para esta sesión antes de modificar datos.'};
}
function instalarGuardiaEntorno(){window.__autorizarEscrituraEntorno=autorizarEscrituraEntorno;}
async function setChecklistPreprod(id,valor){
  if(!(id in CHECKS))return false;
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo un administrador puede certificar el checklist','e');return false;}
  PREPRO.checklist[id]=!!valor;await persistir();
  try{await logAccion('preproduccion_check',{entidad:'preproduccion',id,campo:id,valor:!!valor,empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  return true;
}
function checklistCompleto(){return Object.keys(CHECKS).every(x=>!!PREPRO.checklist[x]);}
async function habilitarEscriturasPrueba(){
  if(PREPRO.modo==='produccion'){toast('ℹ️ La empresa ya está en PRODUCCIÓN');return false;}
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo administrador','e');return false;}
  const txt=prompt('Esta habilitación dura sólo hasta cerrar la app/navegador.\n\nEscribe HABILITAR PRUEBAS para permitir modificaciones en esta sesión:','');
  if(txt!=='HABILITAR PRUEBAS'){toast('Operación cancelada');return false;}
  setEscrituraPrueba(true);toast('🧪 Escrituras de PRUEBA habilitadas sólo para esta sesión');return true;
}
function bloquearEscriturasPrueba(){setEscrituraPrueba(false);toast('🔒 Escrituras de PRUEBA bloqueadas');}
async function activarProduccion(){
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo administrador puede activar PRODUCCIÓN','e');return {ok:false};}
  if(PREPRO.modo==='produccion')return {ok:true};
  const {estadoPreparacionProductiva}=await import('./hardening.js');
  const p=estadoPreparacionProductiva();
  if(!p.listo){toast(`🚫 No se puede activar: quedan ${p.bloqueantes.length} control(es) rojo(s) y ${p.pendientes.length} pendiente(s)`,'e');return {ok:false,motivo:'hardening'};}
  if(!checklistCompleto()){toast('🚫 Completa las 6 confirmaciones de puesta en marcha','e');return {ok:false,motivo:'checklist'};}
  const txt=prompt('Vas a habilitar operación PRODUCTIVA para esta empresa y ejercicio.\nLos cambios afectarán datos reales.\n\nEscribe exactamente: ACTIVAR PRODUCCION','');
  if(txt!=='ACTIVAR PRODUCCION'){toast('Activación cancelada');return {ok:false,motivo:'confirmacion'};}
  PREPRO.modo='produccion';PREPRO.activadoEn=new Date().toISOString();PREPRO.activadoPor=AUTH.user?.email||'';
  PREPRO.version=document.querySelector('.logo span[title="Versión desplegada"]')?.textContent||'';
  PREPRO.revision={criterios:p.criterios.map(c=>({id:c.id,ok:c.ok,pendiente:!!c.pendiente,detalle:c.detalle})),checklist:{...PREPRO.checklist}};
  await persistir();setEscrituraPrueba(false);actualizarBadgeEntorno();
  try{await logAccion('activar_produccion',{entidad:'preproduccion',estadoNuevo:{modo:'produccion',anio:S.empresa.anio,checklist:PREPRO.checklist},empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  toast('🟢 Entorno PRODUCTIVO activado');return {ok:true};
}
async function volverAPrueba(){
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo administrador','e');return false;}
  const motivo=prompt('Motivo para volver a modo PRUEBA (mínimo 10 caracteres):','');
  if(!motivo||motivo.trim().length<10){toast('🚫 Debes indicar un motivo de al menos 10 caracteres','e');return false;}
  const anterior={modo:PREPRO.modo,activadoEn:PREPRO.activadoEn,activadoPor:PREPRO.activadoPor};
  PREPRO.modo='prueba';PREPRO.activadoEn=null;PREPRO.activadoPor=null;PREPRO.revision=null;await persistir();setEscrituraPrueba(false);
  try{await logAccion('volver_modo_prueba',{entidad:'preproduccion',estadoAnterior:anterior,estadoNuevo:{modo:'prueba'},motivo:motivo.trim(),empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  toast('🟡 Entorno cambiado a PRUEBA · escrituras bloqueadas');return true;
}
function estadoPreproduccion(){return {modo:PREPRO.modo,checklist:{...PREPRO.checklist},checklistCompleto:checklistCompleto(),escrituraPrueba:escrituraPruebaHabilitada(),activadoEn:PREPRO.activadoEn,activadoPor:PREPRO.activadoPor,checks:CHECKS};}

export {PREPRO,CHECKS,cargarPreproduccion,estadoPreproduccion,setChecklistPreprod,habilitarEscriturasPrueba,bloquearEscriturasPrueba,activarProduccion,volverAPrueba,actualizarBadgeEntorno,autorizarEscrituraEntorno};
