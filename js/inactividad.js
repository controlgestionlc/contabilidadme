// inactividad.js — V2.21.89 · Cierre de sesión tras 30 minutos sin actividad.
//
// Cuenta como actividad: mover el mouse, hacer clic, escribir, desplazarse o
// tocar la pantalla. La última actividad se guarda en localStorage para que
// varias pestañas abiertas compartan el mismo reloj: trabajar en una mantiene
// viva la sesión de las otras.
//
// Un minuto antes del cierre aparece un aviso con cuenta regresiva y el botón
// "Seguir trabajando". Al cumplirse el plazo se intenta guardar lo pendiente y
// se cierra la sesión.

const MINUTOS=30;
const LIMITE=MINUTOS*60*1000;
const AVISO=60*1000;                 // aviso un minuto antes
const CLAVE='cv:ultima-actividad';
const EVENTOS=['mousemove','mousedown','keydown','wheel','scroll','touchstart','pointerdown'];

let _iniciado=false,_timer=null,_ultimaEscritura=0,_cerrando=false,_alCerrar=null;

const ahora=()=>Date.now();
function leerUltima(){
  try{const v=+localStorage.getItem(CLAVE);if(v>0)return v;}catch(e){}
  return _ultimaEscritura||ahora();
}
function marcarActividad(){
  if(_cerrando)return;
  const t=ahora();
  // Si ya se cumplió el plazo (pestaña dormida, equipo suspendido), mover el
  // mouse al volver no revive la sesión: se cierra.
  if(t-leerUltima()>=LIMITE){revisar();return;}
  // Escribir a lo más una vez cada 5 s: mousemove dispara cientos de eventos
  if(t-_ultimaEscritura<5000)return;
  _ultimaEscritura=t;
  try{localStorage.setItem(CLAVE,String(t));}catch(e){}
  ocultarAviso();
}

function aviso(){
  let el=document.getElementById('aviso-inactividad');
  if(!el){
    el=document.createElement('div');
    el.id='aviso-inactividad';
    el.setAttribute('role','alertdialog');
    el.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    el.innerHTML=`<div style="background:var(--sf,#fff);color:var(--tx,#222);border:1px solid var(--bd,#ccc);border-radius:12px;padding:22px 26px;max-width:380px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:30px">⏳</div>
      <div style="font-weight:700;font-size:15px;margin:6px 0">¿Sigues ahí?</div>
      <div style="font-size:12.5px;color:var(--mt,#666);line-height:1.5">Por seguridad, tu sesión se cerrará en <strong id="aviso-inact-seg">60</strong> segundos por inactividad.</div>
      <button class="btn btn-p" style="margin-top:14px" id="aviso-inact-btn">Seguir trabajando</button>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#aviso-inact-btn').addEventListener('click',()=>{_ultimaEscritura=0;marcarActividad();});
  }
  return el;
}
function ocultarAviso(){
  const el=document.getElementById('aviso-inactividad');
  if(el)el.remove();
}

async function revisar(){
  if(_cerrando)return;
  const resto=LIMITE-(ahora()-leerUltima());
  if(resto<=0){
    _cerrando=true;
    ocultarAviso();
    try{await (_alCerrar&&_alCerrar());}catch(e){console.warn('Cierre por inactividad:',e);}
    return;
  }
  if(resto<=AVISO){
    aviso();
    const s=document.getElementById('aviso-inact-seg');
    if(s)s.textContent=String(Math.ceil(resto/1000));
  }else ocultarAviso();
}

// Arranca el control. `alCerrar` hace el cierre de sesión (lo entrega auth.js).
export function iniciarInactividad(alCerrar){
  _alCerrar=alCerrar;
  if(_iniciado)return;
  _iniciado=true;
  // El login cuenta como actividad (y borra la marca vieja de otra sesión)
  _ultimaEscritura=ahora();
  try{localStorage.setItem(CLAVE,String(_ultimaEscritura));}catch(e){}
  EVENTOS.forEach(ev=>window.addEventListener(ev,marcarActividad,{passive:true,capture:true}));
  // Otra pestaña registró actividad: quitar el aviso aquí también
  window.addEventListener('storage',e=>{if(e.key===CLAVE)ocultarAviso();});
  // Volver a la pestaña tras dejarla de lado: revisar al tiro
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)revisar();});
  _timer=setInterval(revisar,1000);
}

export const INACTIVIDAD_MIN=MINUTOS;
