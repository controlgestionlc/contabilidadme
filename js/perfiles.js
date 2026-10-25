// perfiles.js — V2.21.88 · Edición de perfiles (sólo administrador)
//
// El administrador define, para cada tipo de usuario (Senior y Contador), el
// nivel de acceso a cada módulo: Sin acceso, Lectura o Edición. Se guarda en el
// documento global `_perfiles` y se aplica a todos los usuarios de ese rol en
// todas las empresas. Un usuario puntual puede tener permisos personalizados
// (Usuarios → Editar), que mandan sobre su perfil.
//
// El administrador no tiene perfil: siempre tiene acceso total.

import {toast} from './core.js';
import {logAccion} from './firebase.js';
import {ROLES, ROLES_PERFIL, SECCIONES, PERFILES, permisosBase, permisosDeRol,
        setPerfiles, cargarPerfiles, esAdmin, aplicarPermisosUI} from './auth.js';
import {AUTH} from './state.js';

const NIVEL_LBL={none:'Sin acceso',read:'Lectura',write:'Edición'};
const NIVEL_COLOR={none:'var(--mt)',read:'var(--info)',write:'var(--ok,#3fb950)'};
const PF={borrador:null};   // {senior:{...},contador:{...}} mientras se edita

function borradorDesdeActual(){
  const b={};
  ROLES_PERFIL.forEach(r=>{b[r]=permisosDeRol(r);});
  return b;
}

function celda(rol,s,nivel){
  return `<td style="padding:3px 6px;text-align:center">
    <select data-rol="${rol}" data-sec="${s.id}" onchange="setNivelPerfil('${rol}','${s.id}',this.value)"
      style="min-width:110px;font-size:11px;color:${NIVEL_COLOR[nivel]}">
      ${Object.keys(NIVEL_LBL).map(n=>`<option value="${n}" ${n===nivel?'selected':''}>${NIVEL_LBL[n]}</option>`).join('')}
    </select></td>`;
}

export async function renderPerfiles(){
  const el=document.getElementById('perfiles-content');
  if(!el)return;
  if(!esAdmin()){
    el.innerHTML='<div class="empty"><div class="ei">🔒</div>Sólo el administrador puede editar los perfiles.</div>';
    return;
  }
  if(!PF.borrador){
    await cargarPerfiles();
    PF.borrador=borradorDesdeActual();
  }
  const b=PF.borrador;
  const cambios=ROLES_PERFIL.some(r=>SECCIONES.some(s=>b[r][s.id]!==permisosDeRol(r)[s.id]));
  const filas=SECCIONES.filter(s=>!['integridad','auditlog'].includes(s.id)).map(s=>`<tr>
      <td class="tl" style="font-size:12px">${s.lbl}</td>
      <td style="text-align:center;font-size:11px;color:var(--mt)">Edición</td>
      ${ROLES_PERFIL.map(r=>celda(r,s,b[r][s.id]||'none')).join('')}
    </tr>`).join('');
  const resumen=r=>{
    const v=SECCIONES.filter(s=>!['integridad','auditlog'].includes(s.id)).map(s=>b[r][s.id]||'none');
    return `${v.filter(x=>x==='write').length} edición · ${v.filter(x=>x==='read').length} lectura · ${v.filter(x=>x==='none').length} sin acceso`;
  };
  el.innerHTML=`
    <div class="info-tip" style="margin-bottom:14px;font-size:11.5px;line-height:1.6">
      Define qué puede hacer cada tipo de usuario en cada módulo. El perfil se aplica a todos los usuarios
      de ese rol y en todas las empresas a las que tengan acceso.<br>
      👑 <strong>Administrador</strong>: acceso total a todas las empresas, propias o de otros usuarios. No se limita.<br>
      🎖 <strong>Senior</strong>: crea sus propias empresas y autoriza a usuarios Contador a trabajar en ellas (Empresas → 👥).
      Ve sólo sus empresas y las que le asignen.<br>
      📝 <strong>Contador</strong>: trabaja sólo en las empresas que le asignen. No crea empresas.<br>
      <span style="color:var(--mt)">Usuarios, Perfiles, Registro de Actividad y Auditoría de Integridad son siempre exclusivos del administrador.
      Si un usuario necesita algo distinto a su perfil, usa "Personalizar permisos" en Usuarios → Editar.</span>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      ${ROLES_PERFIL.map(r=>`<div class="card" style="flex:1;min-width:220px;margin:0;padding:12px 14px">
        <div style="font-weight:700;color:${ROLES[r].color}">${ROLES[r].icon} ${ROLES[r].label}</div>
        <div style="font-size:11px;color:var(--mt);margin:2px 0 8px">${resumen(r)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="setTodosPerfil('${r}','write')">Todo edición</button>
          <button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="setTodosPerfil('${r}','read')">Todo lectura</button>
          <button class="btn btn-g" style="font-size:10px;padding:3px 8px" onclick="restablecerPerfil('${r}')">Valores de fábrica</button>
        </div>
      </div>`).join('')}
    </div>
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">MÓDULO</th><th style="text-align:center">👑 ADMINISTRADOR</th>
        ${ROLES_PERFIL.map(r=>`<th style="text-align:center">${ROLES[r].icon} ${ROLES[r].label.toUpperCase()}</th>`).join('')}</tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="guardarPerfiles()" ${cambios?'':'disabled'}>💾 Guardar perfiles</button>
      <button class="btn btn-g" onclick="descartarPerfiles()" ${cambios?'':'disabled'}>Descartar cambios</button>
      ${cambios?'<span style="font-size:11px;color:var(--warn)">● Hay cambios sin guardar</span>':''}
      <span style="font-size:10px;color:var(--mt);margin-left:auto">${PERFILES.actualizadoEn?`Última modificación: ${new Date(PERFILES.actualizadoEn).toLocaleString('es-CL')}${PERFILES.actualizadoPor?' · '+PERFILES.actualizadoPor:''}`:'Usando los valores de fábrica'}</span>
    </div>`;
}

export function setNivelPerfil(rol,sec,nivel){
  if(!PF.borrador||!PF.borrador[rol]||!NIVEL_LBL[nivel])return;
  PF.borrador[rol][sec]=nivel;
  renderPerfiles();
}
export function setTodosPerfil(rol,nivel){
  if(!PF.borrador||!PF.borrador[rol])return;
  SECCIONES.forEach(s=>{if(!['integridad','auditlog'].includes(s.id))PF.borrador[rol][s.id]=nivel;});
  renderPerfiles();
}
export function restablecerPerfil(rol){
  if(!PF.borrador)return;
  PF.borrador[rol]=permisosBase(rol);
  renderPerfiles();
}
export function descartarPerfiles(){
  PF.borrador=borradorDesdeActual();
  renderPerfiles();
}

export async function guardarPerfiles(){
  if(!esAdmin()){toast('🔒 Sólo el administrador','e');return;}
  const b=PF.borrador;if(!b)return;
  const datos={_actualizadoEn:new Date().toISOString(),_actualizadoPor:(AUTH.user&&AUTH.user.email)||''};
  ROLES_PERFIL.forEach(r=>{datos[r]={...b[r],integridad:'none',auditlog:'none'};});
  const r=await window.storage.setGlobal('_perfiles',JSON.stringify(datos));
  if(!r||r.ok===false){
    toast('❌ La nube no aceptó los perfiles. Revisa que las reglas de Firestore estén actualizadas (V2.21.88).','e');
    return;
  }
  setPerfiles(datos);
  PF.borrador=borradorDesdeActual();
  aplicarPermisosUI();
  toast('✅ Perfiles guardados. Cada usuario los verá al volver a entrar.');
  try{logAccion('Editó perfiles de usuario',ROLES_PERFIL.map(x=>ROLES[x].label).join(', '));}catch(e){}
  renderPerfiles();
}
