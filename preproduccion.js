// preproduccion.js — V2.15.7 · Modo PRUEBA / PRODUCCIÓN y checklist de puesta en marcha.
import {S,AUTH} from './state.js';
import {toast} from './core.js';
import {logAccion} from './firebase.js';

const PREPRO={
  modo:'produccion',
  checklist:{empresa:false,pdc:false,saldos:false,rcv:false,usuarios:false,respaldo:false},
  activadoEn:null,activadoPor:null,version:null,revision:null,actaHabilitacion:null,actasHabilitacion:[]
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
  // V2.16.7: la aplicación es un sistema productivo. Los registros históricos
  // que quedaron en modo prueba ya no bloquean la operación de una empresa.
  Object.assign(PREPRO,{modo:'produccion',checklist:c,
    activadoEn:x?.activadoEn||null,activadoPor:x?.activadoPor||null,version:x?.version||null,revision:x?.revision||null,actaHabilitacion:x?.actaHabilitacion||null,actasHabilitacion:Array.isArray(x?.actasHabilitacion)?x.actasHabilitacion:(x?.actaHabilitacion?[x.actaHabilitacion]:[])});
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
  // El estado técnico del entorno es información administrativa. Para el
  // contador la interfaz se mantiene limpia y enfocada en su empresa.
  if(AUTH.user?.rol!=='admin'){el.style.display='none';return;}
  const prod=PREPRO.modo==='produccion';
  const habil=escrituraPruebaHabilitada();
  el.textContent=prod?'● PRODUCCIÓN':habil?'● PRUEBA · ESCRITURA':'● PRUEBA · BLOQUEADA';
  el.style.display='inline-flex';
  el.style.background=prod?'rgba(46,160,67,.18)':habil?'rgba(210,153,34,.18)':'rgba(248,81,73,.14)';
  el.style.color=prod?'var(--ok)':'var(--warn)';
  el.title=prod?'Datos productivos: escrituras habilitadas':'Modo de preproducción: las escrituras de negocio requieren habilitación explícita por sesión';
}
function claveControl(k0){return /^preproduccion-\d{4}$/.test(k0)||/^piloto-\d{4}$/.test(k0)||/^hardening-/.test(k0)||/^recovery-/.test(k0)||/^_/.test(k0);}
function autorizarEscrituraEntorno(key){
  if(window.__entornoBypass===true)return {ok:true};
  if(claveControl(String(key||'')))return {ok:true};
  // Producción es el modo operativo global. El acceso a cada empresa se sigue
  // resolviendo por ACL y las validaciones de storage continúan obligatorias.
  return {ok:true};
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

function versionDesplegada(){
  return document.querySelector('.logo span[title="Versión desplegada"]')?.textContent?.trim()||'sin-version';
}
async function sha256(txt){
  try{const b=new TextEncoder().encode(String(txt));const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(e){return '';}
}
function textoSeguro(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));}
function actaActual(){return PREPRO.actaHabilitacion||null;}
async function construirActaHabilitacion(p){
  const {estadoPiloto}=await import('./piloto.js');
  const piloto=estadoPiloto();
  const base={
    id:`ACTA-${S.empresa.anio}-${Date.now()}`,
    tipo:'habilitacion-produccion',
    generadoEn:new Date().toISOString(),
    empresa:{nombre:S.empresa.nombre||'',rut:S.empresa.rut||'',giro:S.empresa.giro||'',comuna:S.empresa.comuna||'',codigo:S.empresa.codigo||''},
    ejercicio:S.empresa.anio,
    version:versionDesplegada(),
    autorizadoPor:{email:AUTH.user?.email||'',nombre:AUTH.user?.nombre||'',rol:AUTH.user?.rol||''},
    periodoPiloto:piloto.ultimo?.periodo||null,
    pilotoCertificadoEn:piloto.ultimo?.certificadoEn||null,
    checklist:{...PREPRO.checklist},
    criterios:(p?.criterios||[]).map(c=>({id:c.id,nombre:c.nombre,ok:!!c.ok,pendiente:!!c.pendiente,detalle:c.detalle||''})),
    resultado:{listo:!!p?.listo,bloqueantes:(p?.bloqueantes||[]).length,pendientes:(p?.pendientes||[]).length},
    habilitacionCondicional:!p?.listo||!checklistCompleto(),
    checklistPendiente:Object.entries(CHECKS).filter(([id])=>!PREPRO.checklist[id]).map(([id,nombre])=>({id,nombre})),
    modoAnterior:PREPRO.modo,
    modoNuevo:'produccion'
  };
  base.hash=await sha256(JSON.stringify(base));
  return base;
}
function descargarActaHabilitacion(){
  const a=actaActual();
  if(!a){toast('ℹ️ Aún no existe un acta de habilitación');return false;}
  const rows=(a.criterios||[]).map(c=>`<tr><td>${c.ok?'APROBADO':c.pendiente?'PENDIENTE':'NO APROBADO'}</td><td>${textoSeguro(c.nombre)}</td><td>${textoSeguro(c.detalle)}</td></tr>`).join('');
  const checks=Object.entries(CHECKS).map(([id,n])=>`<tr><td>${a.checklist?.[id]?'SI':'NO'}</td><td>${textoSeguro(n)}</td></tr>`).join('');
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${textoSeguro(a.id)}</title><style>body{font-family:Arial,sans-serif;margin:34px;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #bbb;padding:7px;text-align:left;font-size:12px}.meta{line-height:1.65;font-size:13px}.hash{font-family:monospace;word-break:break-all;font-size:11px;background:#f4f4f4;padding:8px}.ok{font-weight:bold}.warn{padding:10px;border-left:4px solid #d29922;background:#fff8dc}</style></head><body><h1>Acta de habilitación a PRODUCCIÓN</h1><div class="meta"><b>Acta:</b> ${textoSeguro(a.id)}<br><b>Empresa:</b> ${textoSeguro(a.empresa?.nombre)} · RUT ${textoSeguro(a.empresa?.rut)}<br><b>Ejercicio:</b> ${a.ejercicio}<br><b>Versión:</b> ${textoSeguro(a.version)}<br><b>Fecha/hora:</b> ${new Date(a.generadoEn).toLocaleString('es-CL')}<br><b>Administrador:</b> ${textoSeguro(a.autorizadoPor?.nombre||a.autorizadoPor?.email)} · ${textoSeguro(a.autorizadoPor?.email)}<br><b>Período piloto certificado:</b> ${textoSeguro(a.periodoPiloto||'—')}</div>${a.habilitacionCondicional?'<p class="warn"><b>HABILITACIÓN CONDICIONAL:</b> el administrador autorizó el inicio productivo con controles o confirmaciones pendientes, los cuales deberán regularizarse durante la operación.</p>':''}<h2>Checklist de puesta en marcha</h2><table><thead><tr><th>Estado</th><th>Confirmación</th></tr></thead><tbody>${checks}</tbody></table><h2>Controles técnicos</h2><table><thead><tr><th>Estado</th><th>Control</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table><h2>Resultado</h2><p class="ok">MODALIDAD: ${a.habilitacionCondicional?'PRODUCCIÓN CONDICIONAL':'PRODUCCIÓN APROBADA'}</p><p>Esta acta documenta el estado de los controles al momento de habilitar el entorno productivo. No reemplaza respaldos, documentación tributaria ni procedimientos internos.</p><h2>Huella de integridad SHA-256</h2><div class="hash">${textoSeguro(a.hash||'')}</div></body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});const u=URL.createObjectURL(blob);const x=document.createElement('a');x.href=u;x.download=`${a.id}.html`;document.body.appendChild(x);x.click();x.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);return true;
}

async function activarProduccion(){
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo administrador puede activar PRODUCCIÓN','e');return {ok:false};}
  if(PREPRO.modo==='produccion')return {ok:true};
  const {estadoPreparacionProductiva}=await import('./hardening.js');
  const p=estadoPreparacionProductiva();
  const condicional=!p.listo||!checklistCompleto();
  const frase=condicional?'ACTIVAR PRODUCCION CON PENDIENTES':'ACTIVAR PRODUCCION';
  const resumen=condicional?`\n\nQuedan ${p.bloqueantes.length} control(es) rojo(s), ${p.pendientes.length} control(es) pendiente(s) y ${Object.keys(CHECKS).filter(id=>!PREPRO.checklist[id]).length} confirmación(es) sin completar. La activación quedará registrada como CONDICIONAL.`:'';
  const txt=prompt(`Vas a habilitar operación PRODUCTIVA para esta empresa y ejercicio.\nLos cambios afectarán datos reales.${resumen}\n\nLas validaciones contables, cierres y protecciones de persistencia seguirán activas.\n\nEscribe exactamente: ${frase}`,'');
  if(txt!==frase){toast('Activación cancelada');return {ok:false,motivo:'confirmacion'};}
  const acta=await construirActaHabilitacion(p);
  PREPRO.modo='produccion';PREPRO.activadoEn=acta.generadoEn;PREPRO.activadoPor=AUTH.user?.email||'';
  PREPRO.version=versionDesplegada();
  PREPRO.revision={criterios:p.criterios.map(c=>({id:c.id,ok:c.ok,pendiente:!!c.pendiente,detalle:c.detalle})),checklist:{...PREPRO.checklist}};
  PREPRO.actaHabilitacion=acta;
  PREPRO.actasHabilitacion=[...(PREPRO.actasHabilitacion||[]),acta];
  await persistir();setEscrituraPrueba(false);actualizarBadgeEntorno();
  try{await logAccion('activar_produccion',{entidad:'preproduccion',estadoNuevo:{modo:'produccion',condicional:acta.habilitacionCondicional,anio:S.empresa.anio,checklist:PREPRO.checklist,actaId:acta.id,actaHash:acta.hash},empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  toast(acta.habilitacionCondicional?'🟡 PRODUCCIÓN CONDICIONAL activada · revisa los pendientes':'🟢 Entorno PRODUCTIVO activado');return {ok:true,condicional:acta.habilitacionCondicional};
}
async function volverAPrueba(){
  if(AUTH.user?.rol!=='admin'){toast('🚫 Sólo administrador','e');return false;}
  toast('ℹ️ El sistema está configurado para operación productiva permanente');return false;
}
function estadoPreproduccion(){return {modo:PREPRO.modo,checklist:{...PREPRO.checklist},checklistCompleto:checklistCompleto(),escrituraPrueba:escrituraPruebaHabilitada(),activadoEn:PREPRO.activadoEn,activadoPor:PREPRO.activadoPor,version:PREPRO.version,revision:PREPRO.revision,actaHabilitacion:PREPRO.actaHabilitacion,actasHabilitacion:[...(PREPRO.actasHabilitacion||[])],checks:CHECKS};}

export {PREPRO,CHECKS,cargarPreproduccion,estadoPreproduccion,setChecklistPreprod,habilitarEscriturasPrueba,bloquearEscriturasPrueba,activarProduccion,volverAPrueba,actualizarBadgeEntorno,autorizarEscrituraEntorno,actaActual,descargarActaHabilitacion};
