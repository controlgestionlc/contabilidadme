// asistencia.js — V2.21.30 · Asistencia mensual de trabajadores
//
// Se registran sólo las AUSENCIAS (y vacaciones) como eventos con fecha
// desde/hasta. Los días pagados del mes se calculan solos:
//
//   mes comercial de 30 días (Art. 55 CdT, práctica Previred):
//   días no pagados = licencias + permisos sin goce + ausencias injustificadas
//                     + días fuera del contrato (ingreso o término a mitad de mes)
//   días pagados    = 30 − días no pagados
//
// Ajuste del mes comercial: si un evento llega hasta el último día de un mes
// de 31 días se descuenta uno menos; si cubre hasta fin de febrero se suman los
// días que faltan para 30. Así un mes completo de licencia da exactamente 0
// días pagados, tenga el mes 28, 30 o 31 días.
//
// Si dos eventos se solapan, cada día cuenta una sola vez con esta prioridad:
// fuera de contrato > licencia > permiso sin goce > ausencia > permiso con goce
// > vacaciones.
//
// Trabajadores pagados por hora: cada mes se ingresan las horas trabajadas
// (por defecto, las horas habituales de su ficha).
//
// Persistencia: clave de empresa `asistencia` (no por año, porque una licencia
// puede cruzar de diciembre a enero):
//   { eventos:[{id,trab,tipo,licTipo,desde,hasta,folio,obs,creado}],
//     horas:{ 'YYYY-MM': { <idTrabajador>: horas } } }
//
// Este módulo no importa remuneraciones.js (evita ciclos): llama al render
// de la sección por `window`.

import {toast, fmtC, MESES, pn} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import './storage.js';

const TIPOS_EVENTO=[
  {k:'licencia',     nm:'Licencia médica',            icono:'🩺', descuenta:true,  color:'var(--err)'},
  {k:'permiso_sin',  nm:'Permiso sin goce de sueldo', icono:'⛔', descuenta:true,  color:'var(--warn)'},
  {k:'ausencia',     nm:'Ausencia injustificada',     icono:'❌', descuenta:true,  color:'var(--err)'},
  {k:'permiso_con',  nm:'Permiso con goce de sueldo', icono:'✅', descuenta:false, color:'var(--ach)'},
  {k:'vacaciones',   nm:'Vacaciones (feriado legal)', icono:'🏖️', descuenta:false, color:'var(--info)'},
];
// Tipos de licencia médica del formulario oficial (COMPIN / Isapres).
const TIPOS_LICENCIA=[
  {k:'1',nm:'Tipo 1 · Enfermedad o accidente común',             paga:'Fonasa (vía CCAF si está afiliado) o Isapre'},
  {k:'2',nm:'Tipo 2 · Prórroga de medicina preventiva',          paga:'Fonasa o Isapre'},
  {k:'3',nm:'Tipo 3 · Pre y postnatal',                           paga:'Fonasa o Isapre'},
  {k:'4',nm:'Tipo 4 · Enfermedad grave del niño menor de 1 año', paga:'Fonasa o Isapre'},
  {k:'5',nm:'Tipo 5 · Accidente del trabajo o de trayecto',      paga:'Mutual o ISL (Ley 16.744)'},
  {k:'6',nm:'Tipo 6 · Enfermedad profesional',                   paga:'Mutual o ISL (Ley 16.744)'},
  {k:'7',nm:'Tipo 7 · Patología del embarazo',                   paga:'Fonasa o Isapre'},
  {k:'sanna',nm:'Ley SANNA · Hijo/a de 1 a 18 años con enfermedad grave', paga:'Seguro SANNA (vía AFC)'},
];
const PRIORIDAD=['contrato','licencia','permiso_sin','ausencia','permiso_con','vacaciones'];
const tipoInfo=k=>TIPOS_EVENTO.find(t=>t.k===k)||{k,nm:k,icono:'•',descuenta:false,color:'var(--mt)'};
const licInfo=k=>TIPOS_LICENCIA.find(t=>t.k===String(k))||null;

// ── Estado ──
function datosAsistencia(){
  if(!S.asistencia||typeof S.asistencia!=='object')S.asistencia={eventos:[],horas:{}};
  if(!Array.isArray(S.asistencia.eventos))S.asistencia.eventos=[];
  if(!S.asistencia.horas||typeof S.asistencia.horas!=='object')S.asistencia.horas={};
  return S.asistencia;
}
async function guardarAsistencia(){
  const r=await window.storage.set('asistencia',JSON.stringify(datosAsistencia()));
  if(!r||r.ok===false){toast('❌ No se pudo guardar la asistencia','e');return false;}
  return true;
}

// ── Fechas (sin zonas horarias: todo en 'YYYY-MM-DD') ──
const iso=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const diasDelMes=(y,m)=>new Date(y,m,0).getDate();
const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));

// Días de un trabajador en un mes. `t` es la ficha; devuelve el detalle.
function asistenciaMes(t,anio,mes){
  const y=+anio,m=+mes,dm=diasDelMes(y,m);
  const ini=iso(y,m,1),fin=iso(y,m,dm);
  const dia=new Array(dm+1).fill(null);   // índice 1..dm → tipo que manda ese día
  const marcar=(desde,hasta,tipo)=>{
    if(!esFecha(desde))return;
    const h=esFecha(hasta)&&hasta>=desde?hasta:desde;
    if(h<ini||desde>fin)return;
    const a=desde<ini?1:+desde.slice(8,10), b=h>fin?dm:+h.slice(8,10);
    for(let d=a;d<=b;d++){
      const actual=dia[d];
      if(actual===null||PRIORIDAD.indexOf(tipo)<PRIORIDAD.indexOf(actual))dia[d]=tipo;
    }
  };
  // Días fuera del contrato (ingreso o término dentro del mes)
  const lre=t.lre||{};
  if(esFecha(lre.fechaInicio)&&lre.fechaInicio>ini){
    const dIni=new Date(lre.fechaInicio+'T12:00:00');dIni.setDate(dIni.getDate()-1);
    marcar(ini,dIni.toISOString().slice(0,10),'contrato');
  }
  if(esFecha(lre.fechaTermino)&&lre.fechaTermino<fin){
    const dFin=new Date(lre.fechaTermino+'T12:00:00');dFin.setDate(dFin.getDate()+1);
    marcar(dFin.toISOString().slice(0,10),fin,'contrato');
  }
  const eventos=datosAsistencia().eventos.filter(e=>e.trab===t.id&&esFecha(e.desde)&&(e.hasta||e.desde)>=ini&&e.desde<=fin);
  eventos.forEach(e=>marcar(e.desde,e.hasta,e.tipo));

  // Conteo por tipo, con el ajuste de mes comercial en el tipo que tiene el último día
  const cuenta={contrato:0,licencia:0,permiso_sin:0,ausencia:0,permiso_con:0,vacaciones:0};
  for(let d=1;d<=dm;d++)if(dia[d])cuenta[dia[d]]++;
  const ultimo=dia[dm];
  if(ultimo&&dm!==30)cuenta[ultimo]=Math.max(0,cuenta[ultimo]+(30-dm));

  const noPagados=Math.min(30,cuenta.contrato+cuenta.licencia+cuenta.permiso_sin+cuenta.ausencia);
  const diasPagados=30-noPagados;
  // Horas del mes (sólo pago por hora)
  const porHora=t.tipoPago==='hora';
  const per=`${y}-${String(m).padStart(2,'0')}`;
  const hGuardada=datosAsistencia().horas[per]?.[t.id];
  const horas=porHora?(hGuardada!=null?+hGuardada:(+t.horasMes||0)):null;
  return {
    periodo:per, diasPagados, factor:diasPagados/30,
    diasLicencia:cuenta.licencia, diasPermisoSin:cuenta.permiso_sin, diasAusencia:cuenta.ausencia,
    diasPermisoCon:cuenta.permiso_con, diasVacaciones:cuenta.vacaciones, diasFueraContrato:cuenta.contrato,
    diasNoPagados:noPagados,
    porHora, horas, horasIngresadas:porHora&&hGuardada!=null,
    eventos, completo:noPagados===0,
  };
}

// Mes seleccionado en la sección Remuneraciones
const mesSel=()=>+(document.getElementById('rem-mes')?.value||1);

// ── Formulario de eventos ──
let ASF={editId:null,trab:null};   // trab !== null → formulario abierto

function opcionesTrabajadores(sel){
  return (S.trabajadores||[]).map(t=>`<option value="${t.id}" ${t.id===sel?'selected':''}>${t.nombre}</option>`).join('');
}
function formEventoHTML(){
  const e=ASF.editId?datosAsistencia().eventos.find(x=>x.id===ASF.editId):null;
  const y=S.empresa.anio,m=mesSel();
  const tipo=e?.tipo||'licencia';
  return `<div class="card" id="asis-form" style="margin-bottom:14px">
    <div class="card-title">${e?'Editando evento':'Nuevo evento de asistencia'}</div>
    <div class="fg">
      <div class="grp"><label>Trabajador</label><select id="asis-trab">${opcionesTrabajadores(e?.trab||ASF.trab)}</select></div>
      <div class="grp"><label>Tipo</label><select id="asis-tipo" onchange="onAsisTipoChange()">
        ${TIPOS_EVENTO.map(t=>`<option value="${t.k}" ${t.k===tipo?'selected':''}>${t.icono} ${t.nm}</option>`).join('')}
      </select></div>
      <div class="grp" id="asis-lic-wrap"><label>Tipo de licencia</label><select id="asis-lic" onchange="onAsisTipoChange()">
        ${TIPOS_LICENCIA.map(l=>`<option value="${l.k}" ${l.k===String(e?.licTipo||'1')?'selected':''}>${l.nm}</option>`).join('')}
      </select></div>
      <div class="grp"><label>Desde</label><input type="date" id="asis-desde" value="${e?.desde||iso(y,m,1)}"></div>
      <div class="grp"><label>Hasta</label><input type="date" id="asis-hasta" value="${e?.hasta||e?.desde||iso(y,m,1)}"></div>
      <div class="grp" id="asis-folio-wrap"><label>N° de licencia (folio)</label><input type="text" id="asis-folio" value="${e?.folio||''}" placeholder="Opcional"></div>
      <div class="grp full"><label>Observación</label><input type="text" id="asis-obs" value="${(e?.obs||'').replace(/"/g,'&quot;')}" placeholder="Opcional"></div>
    </div>
    <div id="asis-hint" class="info-tip" style="font-size:11px;margin:10px 0"></div>
    <div class="save-row" style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="guardarEventoAsistencia()">💾 Guardar</button>
      <button class="btn btn-g" onclick="cerrarFormAsistencia()">Cancelar</button>
    </div>
  </div>`;
}
function onAsisTipoChange(){
  const tipo=document.getElementById('asis-tipo')?.value;
  const esLic=tipo==='licencia';
  const lw=document.getElementById('asis-lic-wrap'),fw=document.getElementById('asis-folio-wrap');
  if(lw)lw.style.display=esLic?'':'none';
  if(fw)fw.style.display=esLic?'':'none';
  const h=document.getElementById('asis-hint');if(!h)return;
  const ti=tipoInfo(tipo);
  if(esLic){
    const l=licInfo(document.getElementById('asis-lic')?.value);
    h.innerHTML=`Los días de licencia <strong>no los paga la empresa</strong>: se descuentan del sueldo y el trabajador recibe el subsidio de <strong>${l?l.paga:'la institución de salud'}</strong>. La renta imponible y los topes quedan proporcionales a los días pagados.`;
  }else h.innerHTML=ti.descuenta
    ?'Estos días <strong>se descuentan</strong> del sueldo base, gratificación, otros haberes, colación y movilización (proporcional sobre 30 días).'
    :'Estos días <strong>se pagan normalmente</strong>. Quedan registrados para control y para el Libro de Remuneraciones Electrónico.';
}
function abrirFormAsistencia(trabId){
  if(!(S.trabajadores||[]).length){toast('⚠️ Primero registra trabajadores','e');return;}
  ASF={editId:null,trab:trabId||''};
  renderAsistencia();
}
function editarEventoAsistencia(id){ASF={editId:id,trab:''};renderAsistencia();}
function cerrarFormAsistencia(){ASF={editId:null,trab:null};renderAsistencia();}

async function guardarEventoAsistencia(){
  const g=id=>document.getElementById(id)?.value??'';
  const trab=g('asis-trab'),tipo=g('asis-tipo'),desde=g('asis-desde');
  let hasta=g('asis-hasta')||desde;
  if(!trab){toast('⚠️ Elige el trabajador','e');return;}
  if(!esFecha(desde)){toast('⚠️ Ingresa la fecha de inicio','e');return;}
  if(hasta<desde){toast('⚠️ La fecha "hasta" es anterior a "desde"','e');return;}
  const ev={id:ASF.editId||'as_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    trab,tipo,desde,hasta,obs:g('asis-obs').trim(),creado:new Date().toISOString()};
  if(tipo==='licencia'){ev.licTipo=g('asis-lic')||'1';const f=g('asis-folio').trim();if(f)ev.folio=f;}
  // Aviso si toca un mes con el libro de remuneraciones ya cerrado
  const cerrados=Object.keys(S.libroRem||{}).filter(p=>p>=desde.slice(0,7)&&p<=hasta.slice(0,7));
  if(cerrados.length&&!confirm(`El libro de remuneraciones de ${cerrados.join(', ')} ya está cerrado: su fotografía no cambiará hasta que lo reabras.\n¿Guardar el evento de todas formas?`))return;
  const A=datosAsistencia();
  const i=A.eventos.findIndex(x=>x.id===ev.id);
  if(i>=0)A.eventos[i]={...A.eventos[i],...ev};else A.eventos.push(ev);
  if(!await guardarAsistencia())return;
  const t=(S.trabajadores||[]).find(x=>x.id===trab);
  toast(`✅ ${tipoInfo(tipo).nm} registrado para ${t?.nombre||'el trabajador'}`);
  logAccion('Registró asistencia',`${t?.nombre||trab} · ${tipoInfo(tipo).nm} · ${desde} a ${hasta}`);
  ASF={editId:null,trab:null};
  renderAsistencia();
}
async function eliminarEventoAsistencia(id){
  const A=datosAsistencia(),e=A.eventos.find(x=>x.id===id);if(!e)return;
  if(!confirm(`¿Eliminar ${tipoInfo(e.tipo).nm.toLowerCase()} del ${e.desde} al ${e.hasta}?`))return;
  A.eventos=A.eventos.filter(x=>x.id!==id);
  if(!await guardarAsistencia())return;
  toast('🗑 Evento eliminado');
  renderAsistencia();
}
async function setHorasMes(trabId,val){
  const per=`${S.empresa.anio}-${String(mesSel()).padStart(2,'0')}`;
  const A=datosAsistencia();
  const txt=String(val??'').trim();
  if(!A.horas[per])A.horas[per]={};
  if(txt==='')delete A.horas[per][trabId];else A.horas[per][trabId]=Math.max(0,+String(txt).replace(',','.')||0);
  if(!Object.keys(A.horas[per]).length)delete A.horas[per];
  if(!await guardarAsistencia())return;
  renderAsistencia();
}

// ── Vista ──
function renderAsistencia(){
  const el=document.getElementById('rem-content');if(!el)return;
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  const y=S.empresa.anio,m=mesSel(),per=`${y}-${String(m).padStart(2,'0')}`;
  if(!(S.trabajadores||[]).length){
    el.innerHTML=tabs+`<div class="empty"><div class="ei">📅</div>Registra trabajadores para llevar su asistencia.</div>`;return;
  }
  const libroCerrado=!!(S.libroRem||{})[per];
  const formAbierto=ASF.trab!==null&&ASF.trab!==undefined||ASF.editId;
  const celda=(n,c)=>n?`<span style="color:${c};font-weight:600">${n}</span>`:'<span style="color:var(--mt)">—</span>';
  const filas=S.trabajadores.map(t=>{
    const a=asistenciaMes(t,y,m);
    const evs=a.eventos.slice().sort((p,q)=>p.desde.localeCompare(q.desde)).map(e=>{
      const ti=tipoInfo(e.tipo),li=e.tipo==='licencia'?licInfo(e.licTipo):null;
      return `<div style="display:flex;gap:8px;align-items:center;font-size:11px;padding:3px 0">
        <span style="color:${ti.color}">${ti.icono} ${li?li.nm:ti.nm}</span>
        <span style="color:var(--mt);font-family:var(--mono)">${e.desde}${e.hasta&&e.hasta!==e.desde?' → '+e.hasta:''}</span>
        ${e.folio?`<span style="color:var(--mt)">folio ${e.folio}</span>`:''}${e.obs?`<span style="color:var(--mt)">· ${e.obs}</span>`:''}
        <span style="margin-left:auto;white-space:nowrap"><button class="btn btn-i" onclick="editarEventoAsistencia('${e.id}')" title="Editar">✏️</button> <button class="btn btn-d" onclick="eliminarEventoAsistencia('${e.id}')" title="Eliminar">🗑</button></span>
      </div>`;}).join('');
    const horasCel=a.porHora
      ?`<input type="number" min="0" step="0.5" value="${a.horas||''}" placeholder="0" onchange="setHorasMes('${t.id}',this.value)" style="width:80px;text-align:right;font-family:var(--mono)" title="${a.horasIngresadas?'Horas ingresadas para este mes':'Horas habituales de la ficha'}">${!a.horasIngresadas?'<div style="font-size:9px;color:var(--mt)">habituales</div>':''}`
      :'<span style="color:var(--mt);font-size:10px">mensual</span>';
    return `<tr>
      <td class="tl" style="font-size:12px">${t.nombre}<div style="font-size:10px;color:var(--mt)">${t.cargo||''}${a.diasFueraContrato?` · <span style="color:var(--warn)">${a.diasFueraContrato} día(s) fuera de contrato</span>`:''}</div>${evs?`<div style="margin-top:4px;border-top:1px dashed var(--bd);padding-top:3px">${evs}</div>`:''}</td>
      <td style="text-align:center;font-family:var(--mono);font-weight:700;color:${a.completo?'var(--ach)':'var(--warn)'}">${a.diasPagados}</td>
      <td style="text-align:center;font-family:var(--mono)">${celda(a.diasLicencia,'var(--err)')}</td>
      <td style="text-align:center;font-family:var(--mono)">${celda(a.diasPermisoSin,'var(--warn)')}</td>
      <td style="text-align:center;font-family:var(--mono)">${celda(a.diasAusencia,'var(--err)')}</td>
      <td style="text-align:center;font-family:var(--mono)">${celda(a.diasPermisoCon,'var(--ach)')}</td>
      <td style="text-align:center;font-family:var(--mono)">${celda(a.diasVacaciones,'var(--info)')}</td>
      <td style="text-align:center">${horasCel}</td>
      <td style="text-align:right"><button class="btn btn-g" onclick="abrirFormAsistencia('${t.id}')" title="Agregar evento">+ Evento</button></td>
    </tr>`;
  }).join('');
  el.innerHTML=tabs
    +(libroCerrado?`<div class="info-tip" style="font-size:11px;margin-bottom:12px;background:rgba(210,153,34,.10);border-color:var(--warn)">🔒 El libro de ${MESES[m-1]} ${y} está cerrado. Los cambios de asistencia no lo modifican hasta que lo reabras.</div>`:'')
    +(formAbierto?formEventoHTML():`<div style="margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-p" onclick="abrirFormAsistencia()">+ Registrar ausencia, permiso o licencia</button><span style="font-size:11px;color:var(--mt)">Sólo se registran las excepciones: sin eventos, el trabajador tiene los 30 días pagados.</span></div>`)
    +`<div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">TRABAJADOR · ${MESES[m-1].toUpperCase()} ${y}</th><th>DÍAS PAGADOS</th><th>LICENCIA</th><th>PERMISO S/GOCE</th><th>AUSENCIA</th><th>PERMISO C/GOCE</th><th>VACACIONES</th><th>HORAS</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="margin-top:8px;font-size:10px;color:var(--mt)">Mes comercial de 30 días. Descuentan: licencias, permisos sin goce, ausencias injustificadas y días fuera de contrato (fechas de inicio y término de la ficha). Las licencias las paga la institución de salud o la mutual como subsidio.</div>`;
  if(formAbierto)onAsisTipoChange();
}

export {TIPOS_EVENTO, TIPOS_LICENCIA, asistenciaMes, datosAsistencia, renderAsistencia,
        abrirFormAsistencia, editarEventoAsistencia, cerrarFormAsistencia, guardarEventoAsistencia,
        eliminarEventoAsistencia, setHorasMes, onAsisTipoChange};
