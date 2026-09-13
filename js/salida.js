// salida.js — Aviso antes de cerrar la app con trabajo sin guardar.
//
// El navegador solo permite mostrar el diálogo nativo de confirmación
// (no se puede personalizar el texto por seguridad), y únicamente si
// hay una razón real: por eso solo se activa cuando hay cambios pendientes.

import {AUTH} from './state.js';
import {toast} from './core.js';

let _sucio=false;           // cambios confirmados en memoria aún no persistidos
let _borrador=false;        // campos de formulario editados, todavía NO confirmados
let _ultimoGuardado=null;   // marca de tiempo del último guardado confirmado
let _ultimoBorrador=null;   // marca de tiempo de la última edición de formulario en esta sesión

// V2.16.21: los borradores son deliberadamente efímeros. Viven sólo en memoria
// durante la ejecución actual y se descartan al cerrar la app. BORRADOR_BASE se
// conserva únicamente para purgar copias persistentes creadas por versiones
// anteriores.
const BORRADOR_BASE='cv:borrador-form';
const borradores=new Map();
let _restauracionAvisada=false;

function claveBorrador(){
  let emp='emp1',anio='';
  try{emp=window.storage?.getPrefijo?.()||emp;}catch(e){}
  try{anio=String(window.S?.empresa?.anio||'');}catch(e){}
  return `${BORRADOR_BASE}:${emp}:${anio||'actual'}`;
}
function etiquetaCampo(el){
  if(!el)return '';
  try{
    const lbl=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if(lbl?.textContent)return lbl.textContent.trim();
  }catch(e){}
  try{
    const grp=el.closest('.grp');
    const lbl=grp?.querySelector('label');
    if(lbl?.textContent)return lbl.textContent.trim();
  }catch(e){}
  return el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.name||el.id||'';
}
function contenedorBorrador(el){
  if(!el)return '';
  try{
    const c=el.closest('.modal-bkd,[id$="-form"],form,.section');
    return c?.id||'';
  }catch(e){return '';}
}
function serializarCampo(el){
  if(!el||!el.id)return null;
  return {id:el.id,tipo:(el.type||el.tagName||'').toLowerCase(),value:el.value??'',checked:!!el.checked,
    etiqueta:etiquetaCampo(el),contenedor:contenedorBorrador(el),
    seccion:(window.getCurSec&&window.getCurSec())||'',ts:Date.now()};
}
function purgarBorradoresPersistentes(){
  // Versiones anteriores guardaban formularios incompletos en localStorage.
  // Desde V2.16.21 no deben sobrevivir al cierre de la aplicación.
  try{
    const borrar=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&(k===BORRADOR_BASE||k.startsWith(BORRADOR_BASE+':')))borrar.push(k);
    }
    borrar.forEach(k=>localStorage.removeItem(k));
  }catch(e){}
}
function persistirBorradores(){
  // Compatibilidad con llamadas históricas: ya NO escribe localStorage.
  // El borrador queda únicamente en el Map de esta ejecución.
  _ultimoBorrador=new Date();
  return true;
}
function cargarBorradores(){
  // No restaurar nada de ejecuciones anteriores. Además se limpian copias
  // antiguas que pudieran haber quedado después de actualizar desde V2.16.20.
  purgarBorradoresPersistentes();
  borradores.clear();
  _borrador=false;
}
function aplicarBorradoresDOM(){
  let n=0;
  borradores.forEach((d,id)=>{
    const el=document.getElementById(id);if(!el||el.dataset.borradorRestaurado==='1')return;
    if((el.type||'').toLowerCase()==='checkbox'||(el.type||'').toLowerCase()==='radio')el.checked=!!d.checked;
    else el.value=d.value??'';
    el.dataset.borradorRestaurado='1';n++;
  });
  if(n&&!_restauracionAvisada){_restauracionAvisada=true;}
}

export function recargarBorradoresContexto(){
  // Cambiar empresa/ejercicio equivale a abandonar el formulario en curso.
  borradores.clear();_borrador=false;_restauracionAvisada=false;
  purgarBorradoresPersistentes();actualizarIndicador();
}

export function registrarBorradorCampo(el){
  const d=serializarCampo(el);if(!d)return;
  borradores.set(d.id,d);_borrador=true;persistirBorradores();actualizarIndicador();
}
export function limpiarBorradorCampos(ids=[]){
  (ids||[]).forEach(id=>{borradores.delete(String(id));const el=document.getElementById(String(id));if(el)delete el.dataset.borradorRestaurado;});
  _borrador=borradores.size>0;persistirBorradores();actualizarIndicador();
}
export function limpiarBorradoresOcultos(){
  let cambio=false;
  [...borradores.keys()].forEach(id=>{const el=document.getElementById(id);if(!el||el.offsetParent===null){borradores.delete(id);cambio=true;}});
  if(cambio){_borrador=borradores.size>0;persistirBorradores();}
  actualizarIndicador();
}
export function guardarBorradoresAhora(){return persistirBorradores();}

// Inventario de borradores para Configuración > Sistema y Respaldos.
// Se agrupan por sección + formulario/modal para que el usuario pueda retomar
// exactamente el trabajo que dejó pendiente, en vez de ver una lista de campos
// técnicos sin contexto.
export function listarBorradoresLocales(){
  const grupos=new Map();
  for(const d of borradores.values()){
    const seccion=d.seccion||'inicio';
    const contenedor=d.contenedor||'';
    const clave=`${seccion}::${contenedor}`;
    if(!grupos.has(clave))grupos.set(clave,{clave,seccion,contenedor,campos:[],ts:0});
    const g=grupos.get(clave);g.campos.push({...d});g.ts=Math.max(g.ts,+d.ts||0);
  }
  return [...grupos.values()].sort((a,b)=>b.ts-a.ts);
}
export function descartarBorradorLocal(clave){
  const g=listarBorradoresLocales().find(x=>x.clave===String(clave));
  if(!g)return false;
  for(const d of g.campos){
    borradores.delete(String(d.id));
    const el=document.getElementById(String(d.id));
    if(el)delete el.dataset.borradorRestaurado;
  }
  _borrador=borradores.size>0;persistirBorradores();actualizarIndicador();
  try{toast('🗑 Borrador descartado');}catch(e){}
  return true;
}
export function descartarTodosBorradoresLocales(silencioso=false){
  borradores.forEach((_,id)=>{const el=document.getElementById(String(id));if(el)delete el.dataset.borradorRestaurado;});
  borradores.clear();_borrador=false;persistirBorradores();actualizarIndicador();
  if(!silencioso)try{toast('🗑 Borradores de esta sesión descartados');}catch(e){}
  return true;
}

// Descarta sólo los campos pertenecientes a un formulario/modal. Es la base del
// botón Cancelar global y también del botón Atrás de Android.
export function descartarBorradorContenedor(ref){
  let c=ref;
  if(typeof ref==='string')c=document.getElementById(ref);
  if(c&&c.nodeType===1&&!c.matches?.('.modal-bkd,[id$="-form"],form'))c=c.closest?.('.modal-bkd,[id$="-form"],form');
  const cid=c?.id||'';
  let cambio=false;
  for(const [id,d] of [...borradores.entries()]){
    const el=document.getElementById(String(id));
    const pertenece=(cid&&d.contenedor===cid)||(c&&el&&c.contains(el));
    if(pertenece){borradores.delete(id);if(el)delete el.dataset.borradorRestaurado;cambio=true;}
  }
  if(cambio){_borrador=borradores.size>0;persistirBorradores();actualizarIndicador();}
  return cambio;
}

export function cancelarFormularioSinGuardar(ref){
  let c=ref;
  if(typeof ref==='string')c=document.getElementById(ref);
  if(c&&c.nodeType===1&&!c.matches?.('.modal-bkd,[id$="-form"],form'))c=c.closest?.('.modal-bkd,[id$="-form"],form');
  if(!c)return false;
  descartarBorradorContenedor(c);
  if(c.classList.contains('modal-bkd'))c.classList.remove('open');
  else c.style.display='none';
  try{toast('Formulario cancelado · no se guardaron cambios');}catch(e){}
  return true;
}
export function continuarBorradorLocal(clave){
  const g=listarBorradoresLocales().find(x=>x.clave===String(clave));
  if(!g)return false;
  try{window.nav&&window.nav(g.seccion||'inicio');}catch(e){}
  // Esperar a que la sección se renderice; luego abrir el contenedor si existe
  // y volver a aplicar los valores del borrador sobre el DOM recién creado.
  setTimeout(()=>{
    try{
      if(g.contenedor){
        const c=document.getElementById(g.contenedor);
        if(c){
          if(c.classList.contains('modal-bkd'))c.classList.add('open');
          else if(getComputedStyle(c).display==='none'||c.style.display==='none')c.style.display='';
        }
      }
      // Permitir reaplicar aunque ya hubiese sido restaurado antes en otro render.
      for(const d of g.campos){const el=document.getElementById(d.id);if(el)delete el.dataset.borradorRestaurado;}
      aplicarBorradoresDOM();
      const primero=g.campos.map(d=>document.getElementById(d.id)).find(Boolean);
      if(primero){primero.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{try{primero.focus({preventScroll:true});}catch(e){}},250);}
      toast('✏️ Borrador abierto. Revisa y usa el botón Guardar/Registrar del módulo cuando esté listo.');
    }catch(e){console.warn('No se pudo abrir borrador',e);}
  },80);
  return true;
}
export const hayBorrador=()=>_borrador||borradores.size>0;
export const hayCambiosConfirmados=()=>_sucio;

// ── Historial de secciones dentro de la app ──
// El botón atrás saltaba SIEMPRE a Inicio desde cualquier pantalla, así que
// entrar a un documento desde el Libro Diario y volver te dejaba en la portada
// en vez de donde estabas. Ahora se lleva la pista de por dónde pasaste y el
// atrás deshace un paso a la vez, como en cualquier app.
const PILA=[];
let _navAtras=false;
const CLAVE_SEC='cv:ultima-seccion';

export function recordarNav(s){
  if(!s)return;
  // Dónde estoy AHORA se guarda siempre, incluso al volver atrás: si Android
  // descarta la app mientras estás en otra aplicación, al reabrirla se retoma
  // esta pantalla y no la última a la que se entró hacia adelante.
  try{localStorage.setItem(CLAVE_SEC,s);}catch(e){}
  // El recorrido, en cambio, sólo crece hacia adelante: volver atrás lo
  // deshace, y repintar la misma sección no cuenta como un paso nuevo.
  if(_navAtras||PILA[PILA.length-1]===s)return;
  PILA.push(s);
  if(PILA.length>50)PILA.shift();
}

export const ultimaSeccion=()=>{
  try{return localStorage.getItem(CLAVE_SEC)||'';}catch(e){return '';}
};

// Al cerrar sesión el recorrido anterior ya no significa nada
export function olvidarNav(){
  PILA.length=0;
  try{localStorage.removeItem(CLAVE_SEC);}catch(e){}
}

// Marcar que hay trabajo sin guardar (lo llaman los módulos al editar)
export function marcarSucio(){
  _sucio=true;
  actualizarIndicador();
}

// Marcar que ya se guardó todo
export function marcarGuardado(){
  _sucio=false;
  _ultimoGuardado=new Date();
  limpiarBorradoresOcultos();
  actualizarIndicador();
  // V2.15.4: cada guardado normal puede programar un snapshot automático.
  // recovery.js aplica debounce y un mínimo de 6 horas, así que esto no crea
  // una copia por cada edición ni bloquea la operación que acaba de guardarse.
  try{window.__programarSnapshotRecuperacion&&window.__programarSnapshotRecuperacion();}catch(e){}
}

// Los formularios incompletos son efímeros y no cuentan como un guardado pendiente
// global: al cerrar se descartan. Sólo hechos ya confirmados activan el estado
// 'sin guardar' y la advertencia de salida.
export const haySinGuardar=()=>_sucio;

// Indicador visual en el encabezado
function actualizarIndicador(){
  // El botón de la barra superior también refleja el estado. Se llama por
  // window para no importar autoguardado.js desde acá (él ya importa este
  // módulo y quedaría un ciclo).
  try{ if(window.actualizarBotonGuardar)window.actualizarBotonGuardar(); }catch(e){}
  const el=document.getElementById('save-indicator');
  if(!el)return;
  if(_sucio){
    el.textContent='● Sin sincronizar';
    el.style.color='var(--warn)';
    el.title='Hay cambios confirmados pendientes de persistir';
  }else if(_ultimoGuardado){
    el.textContent='✓ Guardado '+_ultimoGuardado.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
    el.style.color='var(--mt)';
    el.title='Todos los cambios están guardados';
  }else{
    el.textContent='';
  }
}

// Asegura que todo formulario de ingreso tenga una salida explícita y que
// Cancelar nunca deje un borrador escondido. Los módulos que ya traen su propio
// botón Cancelar conservan su lógica; esta capa sólo limpia el estado efímero.
function instalarCancelacionFormularios(){
  const esEditable=c=>!!c.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
  const tieneAccion=c=>[...c.querySelectorAll('button')].some(b=>/(guardar|registrar|asociar|importar|confirmar|crear|actualizar|presentar|pagar)/i.test(b.textContent||''));
  const tieneCancelarAbajo=c=>{
    const bs=[...c.querySelectorAll('button')].filter(b=>/cancelar/i.test(b.textContent||''));
    if(!bs.length)return false;
    const r=c.getBoundingClientRect();
    return bs.some(b=>b.getBoundingClientRect().top>r.top+r.height*.45);
  };
  const decorar=()=>{
    const candidatos=[...document.querySelectorAll('.modal-bkd.open,[id$="-form"]')];
    for(const c of candidatos){
      if(!c.classList.contains('modal-bkd')&&(c.offsetParent===null||getComputedStyle(c).display==='none'))continue;
      if(c.id==='login-form-box'||!esEditable(c)||!tieneAccion(c)||tieneCancelarAbajo(c)||c.querySelector(':scope > .cancel-form-auto'))continue;
      // Para modal insertamos dentro de modal-box; para formulario inline, al final.
      const host=c.classList.contains('modal-bkd')?(c.querySelector('.modal-box')||c):c;
      if(host.querySelector(':scope > .cancel-form-auto'))continue;
      const pie=document.createElement('div');pie.className='cancel-form-auto';
      pie.style.cssText='display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid var(--bd)';
      pie.innerHTML='<button type="button" class="btn btn-g" style="min-width:140px">Cancelar</button>';
      pie.querySelector('button').onclick=()=>cancelarFormularioSinGuardar(c);
      host.appendChild(pie);
    }
  };
  // Los Cancelar/X existentes primero descartan el borrador y después ejecutan
  // la función histórica del módulo que cierre/resetee el formulario.
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('button');if(!b)return;
    const c=b.closest?.('.modal-bkd,[id$="-form"],form');if(!c)return;
    const txt=(b.textContent||'').trim();
    if(/cancelar/i.test(txt)||b.classList.contains('modal-close'))descartarBorradorContenedor(c);
  },true);
  try{new MutationObserver(decorar).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});}catch(e){}
  setTimeout(decorar,0);
}

// Instala el aviso del navegador al cerrar/recargar
export function initAvisoSalida(){
  // Idempotente: si se llamara dos veces quedarían dos manejadores de `atrás`
  // y cada toque haría dos cosas —cerrar el modal Y navegar al inicio—, que es
  // justo el tipo de comportamiento errático que se está corrigiendo acá.
  if(window.__salidaLista)return;
  window.__salidaLista=true;

  cargarBorradores();
  instalarCancelacionFormularios();

  // Publicar el marcador para que storage.js lo llame al persistir
  window.__marcarGuardado=marcarGuardado;

  // ── Botón "atrás" (Android / navegación del historial) ──
  //
  // En el móvil el atrás es EL botón que se usa, y en una web cerrar la pestaña
  // de un toque es brutal: se pierde la sesión y hay que volver a entrar.
  //
  // La versión anterior tenía tres fallas que lo hacían cerrarse igual:
  //   · buscaba los modales por `style.display`, pero se abren con la clase
  //     `open`, así que NUNCA detectaba uno abierto
  //   · en varios caminos salía sin reponer la entrada centinela del historial,
  //     y sin centinela el siguiente atrás se va de la página
  //   · usaba `confirm()` dentro de popstate, que en Android Chrome se ignora
  //     con frecuencia — el diálogo no aparecía y la salida seguía su curso
  //
  // Ahora: la centinela se repone SIEMPRE y de inmediato, lo abierto se detecta
  // de forma genérica, y la confirmación es un diálogo propio de la página.
  let _saliendo=false;
  let _ultimoAtrasInicio=0;
  const DOBLE_ATRAS_MS=2200;
  const ponerCentinela=()=>{try{history.pushState({app:'centinela'},'');}catch(e){}};

  // Lo que el atrás debe cerrar antes de pensar en salir, de más a menos encima
  function capaAbierta(){
    // 1. Modales (comprobante, DTE, importadores, plantillas…)
    const modales=[...document.querySelectorAll('.modal-bkd.open')];
    if(modales.length)return {el:modales[modales.length-1],cerrar:el=>{descartarBorradorContenedor(el);el.classList.remove('open');}};
    // 2. Buscador global y otras capas por display
    for(const id of ['search-overlay','nav-overlay']){
      const el=document.getElementById(id);
      if(el&&el.style.display&&el.style.display!=='none')
        return {el,cerrar:e=>{descartarBorradorContenedor(e);e.style.display='none';}};
    }
    // 3. Menú lateral desplegado en móvil
    const nav=document.querySelector('nav.open,nav.abierto,.sidebar.abierto,#sidebar.open');
    if(nav)return {el:nav,cerrar:()=>{try{window.cerrarNavMovil&&window.cerrarNavMovil();}catch(e){}}};
    // 4. Formularios en pantalla (nueva venta, compra, asiento…)
    const forms=['vf-form','cf-form','as-form','ap-form','cc-form','rem-form',
                 'af-form-bien','pdc-form','emp-form','us-form'];
    for(const id of forms){
      const el=document.getElementById(id);
      if(el&&el.style.display!=='none'&&el.offsetParent!==null)
        return {el,cerrar:e=>{descartarBorradorContenedor(e);e.style.display='none';}};
    }
    return null;
  }

  // Diálogo propio: `confirm()` no es de fiar dentro de popstate en Android
  function preguntarSalir(sucio){
    return new Promise(resolve=>{
      const prev=document.getElementById('salir-dlg');
      if(prev)prev.remove();
      const d=document.createElement('div');
      d.id='salir-dlg';
      d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9500;display:flex;'+
        'align-items:center;justify-content:center;padding:24px';
      d.innerHTML=`<div style="background:var(--sf,#161b22);border:1px solid var(--bd,#30363d);border-radius:14px;
          max-width:340px;width:100%;padding:22px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.5)">
        <div style="font-size:32px;margin-bottom:8px">${sucio?'⚠️':'🚪'}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">¿Salir de Contabilidad?</div>
        <div style="font-size:12px;color:var(--mt,#8b949e);line-height:1.6;margin-bottom:18px">
          ${sucio
            ? 'Tienes cambios <strong>sin guardar</strong>. Si sales ahora podrías perderlos.'
            : 'Vas a cerrar la aplicación y tendrás que iniciar sesión otra vez.'}
        </div>
        <div style="display:flex;gap:8px;flex-direction:column">
          <button id="salir-no" class="btn btn-p" style="width:100%;justify-content:center">Seguir trabajando</button>
          ${sucio?'<button id="salir-guardar" class="btn btn-s" style="width:100%;justify-content:center">💾 Guardar y salir</button>':''}
          <button id="salir-si" class="btn btn-d" style="width:100%;justify-content:center">${sucio?'Salir sin guardar':'Salir'}</button>
        </div>
      </div>`;
      document.body.appendChild(d);
      const cerrar=v=>{d.remove();resolve(v);};
      d.querySelector('#salir-no').onclick=()=>cerrar('quedarse');
      d.querySelector('#salir-si').onclick=()=>cerrar('salir');
      const g=d.querySelector('#salir-guardar');
      if(g)g.onclick=()=>cerrar('guardar');
      d.onclick=e=>{if(e.target===d)cerrar('quedarse');};   // tocar fuera = quedarse
    });
  }

  async function manejarAtras(){
    // Lo primero, SIEMPRE: reponer la centinela. Pase lo que pase después, el
    // siguiente atrás vuelve a caer acá y no se va de la página.
    ponerCentinela();
    if(_saliendo)return;
    if(!AUTH.user)return;               // en el login, que el atrás sea normal

    const capa=capaAbierta();
    if(capa){capa.cerrar(capa.el);return;}

    // Deshacer un paso del recorrido: la actual sale de la pila y se vuelve a
    // la anterior. Sólo cuando ya no queda nada atrás se ofrece salir.
    const sec=(window.getCurSec&&window.getCurSec())||'inicio';
    if(window.nav){
      if(PILA[PILA.length-1]===sec)PILA.pop();
      const previa=PILA[PILA.length-1];
      if(previa&&previa!==sec){
        _navAtras=true;
        try{window.nav(previa);}finally{_navAtras=false;}
        return;
      }
      // Sin recorrido guardado pero fuera de la portada: al menos volver a ella
      if(sec!=='inicio'){window.nav('inicio');return;}
    }

    // En Inicio, un toque accidental de Atrás NUNCA debe cerrar la PWA.
    // El primer toque sólo arma una ventana corta; recién un segundo toque
    // dentro de esa ventana se interpreta como intención real de salir.
    const ahora=Date.now();
    if(ahora-_ultimoAtrasInicio>DOBLE_ATRAS_MS){
      _ultimoAtrasInicio=ahora;
      try{toast&&toast('Presiona Atrás nuevamente para salir');}catch(e){}
      return;
    }
    _ultimoAtrasInicio=0;

    // Salir por Atrás NO ejecuta signOut(). Si Android/PWA efectivamente cierra
    // la app, al abrirla de nuevo auth.js aplicará la política de login
    // obligatorio de una nueva ejecución. Mientras no se cierre, la sesión
    // permanece intacta.
    const r=await preguntarSalir(_sucio);
    if(r==='quedarse')return;
    if(r==='guardar'){
      try{
        if(hayCambiosConfirmados()&&window.saveAll)await window.saveAll();
      }catch(e){}
    }
    _saliendo=true;
    // Saltar la centinela y la entrada de la app para llegar a lo que había antes.
    // No llamamos logout/signOut en este flujo.
    try{history.go(-2);}catch(e){}
    // Si la app se abrió en una pestaña nueva no hay adónde volver: mantenerla
    // abierta y rearmar el centinela en vez de romper la sesión.
    setTimeout(()=>{
      if(!document.hidden){
        _saliendo=false;ponerCentinela();
        try{toast&&toast('No hay una pantalla anterior. Puedes seguir trabajando.');}catch(e){}
      }
    },600);
  }

  try{
    ponerCentinela();
    window.addEventListener('popstate',manejarAtras);
  }catch(e){ console.warn('No se pudo interceptar el botón atrás:',e); }

  // Detectar edición: cualquier campo modificado dentro de la app marca pendiente.
  // Se excluyen los campos de búsqueda/filtro y el login, que no son datos.
  const IGNORAR=new Set(['search-input','login-email','login-password','conc-cartola-file']);
  const esFiltro=id=>/^(vf|cf)-(mes|desde|hasta|dte-flt|search)$|filtro|-flt$|^cierre-mes$|^cmp-year$/.test(id||'');
  document.addEventListener('input',(e)=>{
    const t=e.target;
    if(!t||!t.tagName)return;
    if(!['INPUT','SELECT','TEXTAREA'].includes(t.tagName))return;
    if(IGNORAR.has(t.id)||esFiltro(t.id))return;
    if(t.type==='file')return;
    registrarBorradorCampo(t);
  },true);
  document.addEventListener('change',(e)=>{
    const t=e.target;if(!t||!['INPUT','SELECT','TEXTAREA'].includes(t.tagName))return;
    if(IGNORAR.has(t.id)||esFiltro(t.id)||t.type==='file')return;
    registrarBorradorCampo(t);
  },true);
  window.addEventListener('pagehide',()=>{
    // Formularios incompletos no sobreviven a una nueva ejecución.
    descartarTodosBorradoresLocales(true);
    purgarBorradoresPersistentes();
  });
  window.addEventListener('beforeunload',(e)=>{
    // Solo avisar si hay sesión activa Y cambios sin guardar.
    // Sin cambios pendientes no molestamos al usuario.
    if(!AUTH.user||!_sucio)return;
    e.preventDefault();
    e.returnValue='';   // requerido por el estándar para que salga el diálogo
    return '';
  });
}
