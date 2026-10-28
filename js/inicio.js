// inicio.js — Pantalla de partida del sistema.
//
// Antes la app abría en «Datos de Empresa»: un formulario de configuración
// que rara vez hay que tocar y que además muestra el RUT y el giro apenas
// entras. Ahora abre en una pantalla propia con las empresas del usuario,
// que es lo primero que se necesita: elegir con cuál trabajar.
//
// Si el usuario todavía no tiene ninguna, queda el panel limpio con el icono
// de la aplicación como marca de agua y un botón para crear la primera.

import {S} from './state.js';
import {AUTH} from './state.js';
import {EMPRESAS, empresaActiva, esDuenioDeEmpresa, empresaSinDuenio,
        activarEmpresa, empresasDeOtros, setVerOtras} from './empresas.js';
import {regimenInfo} from './regimenes.js';
import {marcoInfo, puedeCrearEmpresasActual} from './empresas.js';
import {toast} from './core.js';
import {puedeVer} from './auth.js';

const esc=s=>String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Primer nombre del usuario, para saludar sin ceremonia
function nombreCorto(){
  const u=AUTH.user||{};
  const n=String(u.nombre||'').trim();
  if(n)return n.split(/\s+/)[0];
  return String(u.email||'').split('@')[0]||'';
}

export function renderInicio(){
  const el=document.getElementById('inicio-content');
  if(!el)return;

  const lista=EMPRESAS.lista||[];
  const activa=EMPRESAS.activa;
  const saludo=nombreCorto();

  // Sin empresas visibles: panel limpio, sólo la marca de agua
  if(!lista.length){
    el.innerHTML=`
      <div class="inicio-vacio">
        <div class="inicio-vacio-txt">
          ${EMPRESAS.errorCarga
            ? `<span style="color:var(--err)">No se pudo leer el catálogo de empresas.</span><br>
               <span style="font-size:12px">Revisa <strong>Configuración → Empresas</strong> antes de cargar datos.</span>`
            : puedeCrearEmpresasActual()?'Todavía no tienes empresas.'
              :'Todavía no tienes empresas asignadas.<br><span style="font-size:12px">Pide a un usuario Senior o al administrador que te asigne una.</span>'}
        </div>
        ${EMPRESAS.errorCarga||!puedeCrearEmpresasActual()?'':`
        <button class="btn btn-p" onclick="nav('empresas');setTimeout(abrirFormEmpresa,120)">+ Crear mi primera empresa</button>`}
      </div>`;
    return;
  }

  const tarjetas=lista.map(e=>{
    const esActiva=e.id===activa;
    const mia=esDuenioDeEmpresa(e);
    const huerfana=empresaSinDuenio(e);
    const reg=regimenInfo(e.regimen);
    const marca=marcoInfo(e.marco);
    const dueno=huerfana
      ? '<span class="badge" style="background:rgba(210,153,34,.15);color:var(--warn)">sin dueño</span>'
      : (mia?'<span class="badge bg">tuya</span>'
            :`<span class="badge bb" title="Creada por ${esc(e.creadoPor)}">de ${esc(String(e.creadoPor).split('@')[0])}</span>`);
    const compartida=(e.compartidaCon||[]).length;
    return `
      <button class="inicio-emp${esActiva?' activa':''}" onclick="abrirEmpresaInicio('${e.id}')"
              title="${esActiva?'Empresa activa — entrar':'Cambiar a esta empresa'}">
        <div class="inicio-emp-top">
          <span class="inicio-emp-nombre">${esc(e.nombre)}</span>
          ${esActiva?'<span class="inicio-emp-activa">● activa</span>':''}
        </div>
        <div class="inicio-emp-rut">${esc(e.rut||'sin RUT')}</div>
        <div class="inicio-emp-meta">
          <span>${esc(reg.corto)}</span>
          <span>·</span>
          <span>${esc(marca.nm)}</span>
        </div>
        <div class="inicio-emp-pie">
          ${dueno}
          ${compartida?`<span class="badge bb" title="Compartida con ${compartida}">👥 ${compartida}</span>`:''}
        </div>
      </button>`;
  }).join('');

  el.innerHTML=`
    <div class="inicio-cab">
      <div>
        <div class="inicio-hola">${saludo?'Hola, '+esc(saludo):'Bienvenido'}</div>
        <div class="inicio-sub">${lista.length} empresa${lista.length===1?'':'s'} · elige con cuál trabajar</div>
      </div>
    </div>
    <div class="inicio-grid">${tarjetas}</div>
    <div class="inicio-pie">
      ${botonVerOtras()}
      <button class="btn btn-g" onclick="nav('empresas')">🏢 Administrar empresas</button>
      <button class="btn btn-g" onclick="nav('empresa')">🏛️ Datos de la empresa activa</button>
    </div>`;
}

// Admin: botón para mostrar u ocultar las empresas de otros usuarios
export function botonVerOtras(){
  const n=empresasDeOtros().length;
  if(!n)return '';
  return EMPRESAS.verOtras
    ? `<button class="btn btn-g" onclick="alternarVerOtras()">🙈 Ocultar empresas de otros usuarios</button>`
    : `<button class="btn btn-g" onclick="alternarVerOtras()" title="Como administrador puedes abrir las empresas de otros usuarios">👁 Ver empresas de otros usuarios (${n})</button>`;
}
export function alternarVerOtras(){
  setVerOtras(!EMPRESAS.verOtras);
  renderInicio();
  if(window.renderSelectorEmpresa)window.renderSelectorEmpresa();
  if(window.renderEmpresas&&document.getElementById('empresas-content')?.offsetParent)window.renderEmpresas();
}

// Entrar a una empresa desde la portada.
// Si ya es la activa no se recarga nada: se va directo a trabajar.
export async function abrirEmpresaInicio(id){
  const e=(EMPRESAS.lista||[]).find(x=>x.id===id);
  if(!e){toast('⚠️ Esa empresa ya no está disponible','e');renderInicio();return;}
  // Al entrar a una empresa se abre su Resumen (V2.21.99); si el usuario no
  // tiene acceso, Comprobantes; si tampoco, se queda en Inicio.
  const irAComprobantes=()=>{
    if(!window.nav)return;
    if(puedeVer('dashboard'))window.nav('dashboard');
    else if(puedeVer('comprobantes'))window.nav('comprobantes');
  };
  if(id===EMPRESAS.activa){ irAComprobantes(); return; }

  const ok=await activarEmpresa(id);
  if(!ok)return;
  if(window.recargarEmpresaActiva)await window.recargarEmpresaActiva();
  toast('🏢 Empresa activa: '+e.nombre);
  renderInicio();
  irAComprobantes();
}
