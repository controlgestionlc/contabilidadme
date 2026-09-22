// autoguardado.js — Autoguardado seguro
//
// Desde V2.16.21 los formularios incompletos viven sólo durante la sesión:
//   · BORRADOR DE SESIÓN: texto aún no confirmado -> memoria, nunca Firebase.
//   · CONFIRMADO: estado de negocio ya aceptado -> puede sincronizarse a Firebase.
// Al cerrar la aplicación, los formularios incompletos se descartan.

import {toast} from './core.js';
import {AUTH} from './state.js';
import {haySinGuardar, hayBorrador, hayCambiosConfirmados} from './salida.js';

const CLAVE='cv:_autoguardado';
const OPCIONES=[30,60,120,300];      // segundos ofrecidos en la interfaz
const POR_DEFECTO={activo:true,segundos:60};

export const AG={...POR_DEFECTO,timer:null,ultimo:null,guardando:false};

function leerPreferencia(){
  try{
    const v=JSON.parse(localStorage.getItem(CLAVE)||'null');
    if(v&&typeof v==='object'){
      AG.activo=v.activo!==false;
      AG.segundos=OPCIONES.includes(+v.segundos)?+v.segundos:POR_DEFECTO.segundos;
    }
  }catch(e){}
}
function grabarPreferencia(){
  try{localStorage.setItem(CLAVE,JSON.stringify({activo:AG.activo,segundos:AG.segundos}));}catch(e){}
}

// ¿Tiene sentido guardar ahora?
// Con claves bloqueadas por una lectura fallida NO se guarda nada automático:
// el autoguardado es justamente el que convertiría el error en pérdida.
const procede=()=>!!(AUTH.user&&hayCambiosConfirmados()&&!AG.guardando&&window.saveAll
                     &&!(window.storage&&window.storage.hayBloqueos&&window.storage.hayBloqueos()));

// Guardado silencioso: sin toast, salvo que falle
export async function guardarAuto(motivo){
  // Los formularios incompletos permanecen sólo en memoria durante esta sesión.
  // Nunca se persisten ni se transforman en una operación contable por el temporizador.
  if(!procede())return false;
  AG.guardando=true;
  try{
    const ok=await window.saveAll({silencioso:true});
    if(ok){AG.ultimo=new Date();console.log('Autoguardado ('+motivo+')');}
    return ok;
  }finally{AG.guardando=false;}
}

function reprogramar(){
  if(AG.timer){clearInterval(AG.timer);AG.timer=null;}
  if(AG.activo)AG.timer=setInterval(()=>guardarAuto('temporizador'),AG.segundos*1000);
}

// ── Controles para la interfaz ──
export function setAutoguardado(activo){
  AG.activo=!!activo;grabarPreferencia();reprogramar();
  toast(AG.activo?`💾 Autoguardado activado — cada ${etiquetaIntervalo(AG.segundos)}`:'⏸ Autoguardado desactivado');
  if(window.renderSistema)window.renderSistema();
}
export function setIntervaloAutoguardado(segundos){
  const n=+segundos;
  if(!OPCIONES.includes(n))return;
  AG.segundos=n;grabarPreferencia();reprogramar();
  toast(`💾 Autoguardado cada ${etiquetaIntervalo(n)}`);
  if(window.renderSistema)window.renderSistema();
}
export const etiquetaIntervalo=s=>s<60?`${s} segundos`:(s===60?'1 minuto':`${s/60} minutos`);
export const OPCIONES_INTERVALO=OPCIONES;

// Guardar ahora desde la barra superior
export async function guardarTodoAhora(){
  if(!window.saveAll)return;
  const bloq=(window.storage&&window.storage.clavesBloqueadas)?window.storage.clavesBloqueadas():[];
  if(bloq.length){
    alert(
      '🚫 GUARDADO BLOQUEADO\n\n'+
      'No se pudieron leer estos registros desde la nube:\n'+
      bloq.map(b=>'  · '+b.clave+' — '+b.motivo).join('\n')+'\n\n'+
      'La app los está mostrando vacíos, y guardar ahora escribiría ese vacío\n'+
      'encima de tus datos reales. Por eso no se guarda nada.\n\n'+
      'Recarga la página cuando vuelva la conexión: si se leen bien, el\n'+
      'guardado se desbloquea solo.');
    return;
  }
  if(!hayCambiosConfirmados()){
    if(hayBorrador())toast('Completa el formulario y usa Guardar/Registrar, o Cancelar para descartarlo.');
    else toast('✓ No hay cambios pendientes');
    return;
  }
  await window.saveAll();
}

// Refleja en el botón de la barra superior si hay algo pendiente
// Ojo: el innerHTML siempre debe conservar <span class="save-lbl">…</span>
// alrededor del texto — es lo que el CSS usa para ocultar la etiqueta y dejar
// sólo el ícono en móvil. Perder ese span (por ejemplo, poniendo un string
// plano) rompe ese comportamiento sin que sea evidente por qué.
export function actualizarBotonGuardar(){
  const btn=document.getElementById('btn-guardar-todo');
  if(!btn)return;
  // Guardado bloqueado: es más importante decirlo que mostrar el estado normal
  const bloq=(window.storage&&window.storage.clavesBloqueadas)?window.storage.clavesBloqueadas():[];
  if(bloq.length){
    btn.classList.remove('pendiente');
    btn.classList.add('bloqueado');
    btn.innerHTML='<span aria-hidden="true">🚫</span><span class="save-lbl">Guardado bloqueado</span>';
    btn.title='No se pudieron leer '+bloq.length+' registro(s) desde la nube ('+bloq.map(b=>b.clave).join(', ')+
      '). No se guarda nada para no sobrescribirlos. Recarga la página cuando vuelva la conexión.';
    return;
  }
  btn.classList.remove('bloqueado');
  const sucio=hayCambiosConfirmados();
  btn.classList.toggle('pendiente',sucio);
  btn.title=sucio ? 'Hay cambios confirmados sin sincronizar — haz clic para guardarlos ahora'
    : 'Todo guardado'+(AG.activo?` · sincronización automática cada ${etiquetaIntervalo(AG.segundos)}`:'');
  btn.innerHTML=`<span aria-hidden="true">💾</span><span class="save-lbl">Guardar${sucio?' •':''}</span>`;
}

// ── Salida segura ──
// Ofrece guardar antes de irse. Devuelve true si se puede continuar.
export async function confirmarSalida(accion='salir'){
  if(!haySinGuardar())return true;
  const guardar=confirm(
    `⚠️ Hay cambios SIN GUARDAR.\n\n`+
    `Aceptar  → guardar y ${accion}\n`+
    `Cancelar → volver sin ${accion}`);
  if(!guardar)return false;
  let ok=true;
  if(hayCambiosConfirmados())ok=await window.saveAll();
  if(!ok){
    return confirm('No se pudo guardar.\n\n¿Quieres '+accion+' de todas formas y perder esos cambios?');
  }
  return true;
}

export function initAutoguardado(){
  leerPreferencia();
  reprogramar();

  // Al dejar la pestaña o minimizar: es cuando la gente da el trabajo por hecho
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')guardarAuto('pestaña oculta');
  });
  window.addEventListener('blur',()=>guardarAuto('pierde el foco'));


  actualizarBotonGuardar();
}
