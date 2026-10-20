// vacaciones.js — V2.21.42 · Feriado legal (vacaciones) por trabajador
//
// Normativa (Código del Trabajo):
//  - Art. 67: 15 días HÁBILES de feriado por año de servicio (20 en las
//    regiones de Arica y Parinacota, Tarapacá, Antofagasta, Atacama, Aysén,
//    Magallanes y la provincia de Palena). Se devenga 1,25 día por mes.
//  - Art. 68: feriado progresivo. Con 10 años de trabajo (para uno o más
//    empleadores; de los anteriores se pueden hacer valer hasta 10, con
//    certificado) se gana 1 día adicional por cada 3 años NUEVOS trabajados
//    para el empleador actual (Dirección del Trabajo).
//  - Art. 69: para el feriado, el sábado es siempre inhábil, igual que
//    domingos y festivos.
//  - Art. 70: se pueden acumular hasta dos períodos consecutivos.
//
// Las vacaciones tomadas se registran como eventos "vacaciones" de la
// Asistencia: así la liquidación las paga normal y el LRE las informa. Aquí
// se cuentan en días hábiles y se calcula el saldo.

import {toast, fmtC, MESES} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {datosAsistencia, mesesCerradosEn, alertaMesCerrado} from './asistencia.js';
import './storage.js';

const ZONA_EXTREMA_DIAS=20, DIAS_BASE=15;

// ── Feriados legales de Chile ──
function pascua(y){ // algoritmo anónimo gregoriano
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
    h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(y,mes-1,dia));
}
const iso=d=>d.toISOString().slice(0,10);
const ymd=(y,m,d)=>new Date(Date.UTC(y,m-1,d));
const dow=d=>d.getUTCDay();
const masDias=(d,n)=>new Date(d.getTime()+n*864e5);
// Solsticio de invierno (Día de los Pueblos Indígenas), fijado por decreto cada año
const SOLSTICIO={2024:20,2025:20,2026:21,2027:21,2028:20,2029:20,2030:21};
// Ley 19.668: 29 jun y 12 oct se trasladan al lunes de esa semana si caen
// martes, miércoles o jueves, y al lunes siguiente si caen viernes.
function trasladoLunes(d){const w=dow(d);if(w>=2&&w<=4)return masDias(d,1-w);if(w===5)return masDias(d,3);return d;}
function feriadosAnio(y){
  const f=new Map();
  const add=(d,nm)=>f.set(iso(d),nm);
  add(ymd(y,1,1),'Año Nuevo');
  if(dow(ymd(y,1,2))===1)add(ymd(y,1,2),'Feriado 2 de enero');
  const p=pascua(y);add(masDias(p,-2),'Viernes Santo');add(masDias(p,-1),'Sábado Santo');
  add(ymd(y,5,1),'Día del Trabajo');add(ymd(y,5,21),'Glorias Navales');
  add(ymd(y,6,SOLSTICIO[y]||21),'Día de los Pueblos Indígenas');
  add(trasladoLunes(ymd(y,6,29)),'San Pedro y San Pablo');
  add(ymd(y,7,16),'Virgen del Carmen');add(ymd(y,8,15),'Asunción de la Virgen');
  if(dow(ymd(y,9,17))===1)add(ymd(y,9,17),'Feriado Fiestas Patrias');
  add(ymd(y,9,18),'Independencia Nacional');add(ymd(y,9,19),'Glorias del Ejército');
  if(dow(ymd(y,9,20))===5)add(ymd(y,9,20),'Feriado Fiestas Patrias');
  add(trasladoLunes(ymd(y,10,12)),'Encuentro de Dos Mundos');
  // Ley 20.299: si cae martes pasa al viernes anterior; si cae miércoles, al viernes siguiente
  const ev=ymd(y,10,31);add(dow(ev)===2?masDias(ev,-4):dow(ev)===3?masDias(ev,2):ev,'Iglesias Evangélicas');
  add(ymd(y,11,1),'Todos los Santos');add(ymd(y,12,8),'Inmaculada Concepción');add(ymd(y,12,25),'Navidad');
  return f;
}
function cfgFeriados(){
  const c=(S.empresa&&S.empresa.feriados)||{};
  return {extra:Array.isArray(c.extra)?c.extra:[],quitar:Array.isArray(c.quitar)?c.quitar:[]};
}
const CACHE=new Map();
function esFeriado(fechaIso){
  const y=+fechaIso.slice(0,4);
  if(!CACHE.has(y))CACHE.set(y,feriadosAnio(y));
  const c=cfgFeriados();
  if(c.quitar.includes(fechaIso))return null;
  const ex=c.extra.find(x=>x.fecha===fechaIso);
  if(ex)return ex.nombre||'Feriado';
  return CACHE.get(y).get(fechaIso)||null;
}
// Días hábiles para el feriado legal: lunes a viernes que no sean festivos
function diasHabiles(desde,hasta){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(desde||''))return {habiles:0,feriados:[]};
  const h=/^\d{4}-\d{2}-\d{2}$/.test(hasta||'')&&hasta>=desde?hasta:desde;
  let d=new Date(desde+'T00:00:00Z');const fin=new Date(h+'T00:00:00Z');
  let n=0;const fer=[];
  while(d<=fin){
    const w=dow(d),k=iso(d);
    if(w>=1&&w<=5){const nf=esFeriado(k);if(nf)fer.push({fecha:k,nombre:nf});else n++;}
    d=masDias(d,1);
  }
  return {habiles:n,feriados:fer};
}

// ── Antigüedad y progresivos ──
function mesesEntre(desde,hasta){ // meses completos de servicio (incluye el día "hasta")
  const a=new Date(desde+'T00:00:00Z'),b=masDias(new Date(hasta+'T00:00:00Z'),1);
  if(b<=a)return 0;
  let m=(b.getUTCFullYear()-a.getUTCFullYear())*12+(b.getUTCMonth()-a.getUTCMonth());
  if(b.getUTCDate()<a.getUTCDate())m--;
  return Math.max(0,m);
}
// Días progresivos según años con el empleador actual y años anteriores certificados
function progresivos(aniosActual,aniosPrevios){
  const A=Math.min(10,Math.max(0,Math.floor(+aniosPrevios||0)));
  const nuevos=Math.floor(aniosActual)-Math.max(0,10-A);
  return nuevos>0?Math.floor(nuevos/3):0;
}

// Saldo de vacaciones de un trabajador a una fecha
function saldoVacaciones(t,fechaCorte){
  const v=t.vacaciones||{};
  const inicio=t.lre&&t.lre.fechaInicio;
  const corte=fechaCorte||new Date().toISOString().slice(0,10);
  const base=v.zonaExtrema?ZONA_EXTREMA_DIAS:DIAS_BASE;
  if(!inicio)return {ok:false,motivo:'Falta la fecha de inicio del contrato en la ficha del trabajador',base};
  const tieneInicial=v.saldoInicial!==undefined&&v.saldoInicial!==null&&v.saldoInicial!==''&&/^\d{4}-\d{2}-\d{2}$/.test(v.fechaSaldo||'');
  const desdeDev=tieneInicial&&v.fechaSaldo>inicio?v.fechaSaldo:inicio;
  const fin=t.lre&&t.lre.fechaTermino&&t.lre.fechaTermino<corte?t.lre.fechaTermino:corte;
  // Devengo mes a mes: (base + progresivos vigentes ese mes) / 12
  const mesesDesdeInicio=m0=>mesesEntre(inicio,m0);
  const nMeses=mesesEntre(desdeDev,fin);
  const mIni=mesesDesdeInicio(desdeDev);
  let devengado=0,devProgresivo=0;
  for(let i=1;i<=nMeses;i++){
    const anios=Math.floor((mIni+i-1)/12);
    const pg=progresivos(anios,v.aniosPrevios);
    devengado+=(base+pg)/12;devProgresivo+=pg/12;
  }
  const mesesTot=mesesDesdeInicio(fin);
  const aniosActual=Math.floor(mesesTot/12);
  const progActual=progresivos(aniosActual,v.aniosPrevios);
  // Tomadas: eventos de vacaciones desde el inicio del devengo hasta el corte
  const tomadas=(datosAsistencia().eventos||[]).filter(e=>e.trab===t.id&&e.tipo==='vacaciones'&&e.desde>=desdeDev&&e.desde<=fin)
    .map(e=>({...e,...diasHabiles(e.desde,e.hasta||e.desde)}));
  const diasTomados=tomadas.reduce((s,e)=>s+e.habiles,0);
  const inicial=tieneInicial?(+v.saldoInicial||0):0;
  const saldo=+(inicial+devengado-diasTomados).toFixed(2);
  const anual=base+progActual;
  // Años que faltan para el próximo día progresivo
  let faltan=null;
  for(let k=aniosActual+1;k<=aniosActual+40;k++)if(progresivos(k,v.aniosPrevios)>progActual){faltan=k-aniosActual;break;}
  return {ok:true,base,inicio,desdeDev,corte:fin,inicial,tieneInicial,meses:nMeses,
    devengado:+devengado.toFixed(2),devProgresivo:+devProgresivo.toFixed(2),
    tomadas,diasTomados,saldo,anual,aniosActual,mesesTot,progActual,faltan,
    excedeAcumulacion:saldo>2*anual,aniosPrevios:Math.min(10,+v.aniosPrevios||0)};
}

// ── Vista ──
let VF={trab:null,config:null};
const mesSel=()=>+(document.getElementById('rem-mes')?.value||1);
function fechaCorte(){
  const y=+S.empresa.anio,m=mesSel();
  const finMes=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  const hoy=new Date().toISOString().slice(0,10);
  return finMes<hoy?finMes:hoy;
}
const f2=n=>(+n||0).toLocaleString('es-CL',{maximumFractionDigits:2});

function renderVacaciones(){
  const el=document.getElementById('rem-content');if(!el)return;
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  if(!(S.trabajadores||[]).length){el.innerHTML=tabs+'<div class="empty"><div class="ei">🏖️</div>Registra trabajadores para llevar sus vacaciones.</div>';return;}
  const corte=fechaCorte();
  const filas=S.trabajadores.map(t=>{
    const s=saldoVacaciones(t,corte);
    if(!s.ok)return `<tr><td class="tl" style="font-size:12px">${t.nombre}</td><td colspan="7" class="tl" style="color:var(--warn);font-size:11px">⚠️ ${s.motivo}</td><td style="text-align:right"><button class="btn btn-g" onclick="editarTrabajador('${t.id}')">✏️ Ficha</button></td></tr>`;
    const ant=`${Math.floor(s.mesesTot/12)} a ${s.mesesTot%12} m`;
    const det=s.tomadas.sort((a,b)=>b.desde.localeCompare(a.desde)).slice(0,6).map(e=>`<div style="font-size:10px;color:var(--mt)">🏖️ ${e.desde}${e.hasta&&e.hasta!==e.desde?' → '+e.hasta:''} · ${e.habiles} día(s) hábil(es)${e.feriados.length?' · '+e.feriados.length+' feriado(s)':''}</div>`).join('');
    return `<tr>
      <td class="tl" style="font-size:12px">${t.nombre}<div style="font-size:10px;color:var(--mt)">Ingreso ${s.inicio} · ${ant}${s.aniosPrevios?` · +${s.aniosPrevios} año(s) anteriores`:''}${(t.vacaciones||{}).zonaExtrema?' · zona extrema':''}</div>${det}</td>
      <td style="text-align:right;font-family:var(--mono)">${s.anual}</td>
      <td style="text-align:right;font-family:var(--mono)" title="${s.faltan?'Próximo día progresivo en '+s.faltan+' año(s)':''}">${s.progActual||'–'}${s.faltan&&s.faltan<=3?`<div style="font-size:9px;color:var(--mt)">+1 en ${s.faltan} a</div>`:''}</td>
      <td style="text-align:right;font-family:var(--mono)">${s.tieneInicial?f2(s.inicial):'–'}${s.tieneInicial?`<div style="font-size:9px;color:var(--mt)">al ${s.desdeDev}</div>`:''}</td>
      <td style="text-align:right;font-family:var(--mono)">${f2(s.devengado)}</td>
      <td style="text-align:right;font-family:var(--mono);color:var(--err)">${s.diasTomados||'–'}</td>
      <td style="text-align:right;font-family:var(--mono);font-weight:700;color:${s.saldo<0?'var(--err)':s.excedeAcumulacion?'var(--warn)':'var(--ach)'}">${f2(s.saldo)}${s.excedeAcumulacion?'<div style="font-size:9px">⚠️ más de 2 períodos</div>':''}</td>
      <td style="text-align:right;font-family:var(--mono);font-size:11px">${f2(s.saldo/s.anual)}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-p" onclick="abrirFormVacaciones('${t.id}')">+ Vacaciones</button> <button class="btn btn-g" onclick="abrirConfigVacaciones('${t.id}')" title="Saldo inicial, años anteriores, zona extrema">⚙️</button></td>
    </tr>${VF.config===t.id?configHTML(t):''}${VF.trab===t.id?formHTML(t,s):''}`;
  }).join('');
  const c=cfgFeriados();
  el.innerHTML=tabs+`
    <div class="info-tip" style="font-size:11px;margin-bottom:12px;line-height:1.6">
      🏖️ <strong>Feriado legal</strong> (Arts. 67 a 70 del Código del Trabajo): 15 días hábiles por año (20 en zonas extremas), devengados a razón de 1,25 día por mes.
      <strong>Progresivos</strong>: con 10 años de trabajo (hasta 10 con empleadores anteriores, certificados) se suma 1 día por cada 3 años nuevos con el empleador actual.
      Sábados, domingos y festivos no se cuentan. Se pueden acumular hasta 2 períodos. Saldos calculados al <strong>${corte}</strong>.
    </div>
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">TRABAJADOR</th><th style="text-align:right">DÍAS / AÑO</th><th style="text-align:right">PROGRESIVOS</th><th style="text-align:right">SALDO INICIAL</th><th style="text-align:right">DEVENGADO</th><th style="text-align:right">TOMADOS</th><th style="text-align:right">SALDO</th><th style="text-align:right">PERÍODOS</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-i" onclick="exportarVacacionesExcel()">📊 Excel de saldos</button>
      <span style="font-size:11px;color:var(--mt)">Las vacaciones registradas aquí aparecen también en la pestaña Asistencia (se pagan normalmente).</span>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-title">📅 Feriados adicionales</div>
      <div style="font-size:11px;color:var(--mt);margin-bottom:6px">Los feriados nacionales se calculan solos. Agrega aquí elecciones, feriados regionales o decretados (uno por línea: AAAA-MM-DD nombre). Para quitar uno, escribe "- AAAA-MM-DD".</div>
      <textarea id="vac-feriados" rows="4" style="width:100%;font-family:var(--mono);font-size:12px">${[...c.extra.map(x=>`${x.fecha} ${x.nombre||''}`.trim()),...c.quitar.map(x=>'- '+x)].join('\n')}</textarea>
      <div style="margin-top:6px"><button class="btn btn-g" onclick="guardarFeriadosExtra()">💾 Guardar feriados</button>
      <span style="font-size:11px;color:var(--mt);margin-left:8px">${S.empresa.anio}: ${[...feriadosAnio(+S.empresa.anio).entries()].filter(([k])=>!c.quitar.includes(k)).length+c.extra.filter(x=>x.fecha.startsWith(String(S.empresa.anio))).length} feriados</span></div>
    </div>`;
  if(VF.trab)previewVacaciones();
}
function configHTML(t){
  const v=t.vacaciones||{};
  return `<tr><td colspan="9" style="background:var(--sf2,rgba(88,166,255,.05))"><div class="fg" style="padding:6px 4px">
    <div class="grp"><label>Años con empleadores anteriores (certificados)</label><input type="number" id="vacc-previos" min="0" max="40" step="1" value="${v.aniosPrevios||''}" placeholder="0"><div style="font-size:10px;color:var(--mt);margin-top:2px">Se consideran hasta 10 para el feriado progresivo</div></div>
    <div class="grp"><label>Saldo inicial (días hábiles)</label><input type="number" id="vacc-saldo" step="0.01" value="${v.saldoInicial??''}" placeholder="Opcional"></div>
    <div class="grp"><label>Saldo inicial al</label><input type="date" id="vacc-fecha" value="${v.fechaSaldo||''}"><div style="font-size:10px;color:var(--mt);margin-top:2px">Desde esta fecha se calcula el devengo</div></div>
    <div class="grp"><label>Zona extrema (20 días)</label><select id="vacc-zona"><option value="0">No (15 días)</option><option value="1" ${v.zonaExtrema?'selected':''}>Sí (20 días)</option></select></div>
  </div><div style="display:flex;gap:8px;padding:0 4px 6px"><button class="btn btn-p" onclick="guardarConfigVacaciones('${t.id}')">💾 Guardar</button><button class="btn btn-g" onclick="abrirConfigVacaciones(null)">Cancelar</button></div></td></tr>`;
}
function formHTML(t,s){
  const hoy=new Date().toISOString().slice(0,10);
  return `<tr><td colspan="9" style="background:var(--sf2,rgba(88,166,255,.05))"><div class="fg" style="padding:6px 4px">
    <div class="grp"><label>Desde</label><input type="date" id="vacf-desde" value="${hoy}" onchange="previewVacaciones()"></div>
    <div class="grp"><label>Hasta</label><input type="date" id="vacf-hasta" value="${hoy}" onchange="previewVacaciones()"></div>
    <div class="grp full"><label>Observación</label><input type="text" id="vacf-obs" placeholder="Opcional"></div>
  </div><div id="vacf-prev" style="font-size:12px;padding:0 4px 6px"></div>
  <div style="display:flex;gap:8px;padding:0 4px 6px"><button class="btn btn-p" onclick="guardarVacaciones('${t.id}')">💾 Registrar vacaciones</button><button class="btn btn-g" onclick="abrirFormVacaciones(null)">Cancelar</button></div></td></tr>`;
}
function previewVacaciones(){
  const el=document.getElementById('vacf-prev');if(!el)return;
  const d=document.getElementById('vacf-desde')?.value,h=document.getElementById('vacf-hasta')?.value;
  const t=(S.trabajadores||[]).find(x=>x.id===VF.trab);
  const r=diasHabiles(d,h);
  const s=t?saldoVacaciones(t,h||d):null;
  el.innerHTML=`<strong>${r.habiles}</strong> día(s) hábil(es)${r.feriados.length?` · no se cuentan ${r.feriados.map(x=>x.fecha+' '+x.nombre).join(', ')}`:''}${s&&s.ok?` · saldo disponible ${f2(s.saldo)} → <strong style="color:${s.saldo-r.habiles<0?'var(--err)':'var(--ach)'}">${f2(s.saldo-r.habiles)}</strong> después`:''}`;
}
function abrirFormVacaciones(id){VF={trab:id,config:null};renderVacaciones();}
function abrirConfigVacaciones(id){VF={trab:null,config:id};renderVacaciones();}

async function guardarTrabajadores(){
  const r=await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));
  if(!r||r.ok===false){toast('❌ No se pudo guardar la ficha del trabajador','e');return false;}
  return true;
}
async function guardarConfigVacaciones(id){
  const t=(S.trabajadores||[]).find(x=>x.id===id);if(!t)return;
  const g=k=>document.getElementById(k)?.value??'';
  const saldo=String(g('vacc-saldo')).trim(),fecha=g('vacc-fecha');
  if(saldo!==''&&!fecha){toast('⚠️ Indica la fecha a la que corresponde el saldo inicial','e');return;}
  t.vacaciones={...(t.vacaciones||{}),aniosPrevios:Math.max(0,Math.floor(+g('vacc-previos')||0)),
    saldoInicial:saldo===''?null:+saldo.replace(',','.'),fechaSaldo:saldo===''?'':fecha,zonaExtrema:g('vacc-zona')==='1'};
  if(!await guardarTrabajadores())return;
  toast('✅ Datos de vacaciones guardados');
  VF={trab:null,config:null};renderVacaciones();
}
async function guardarVacaciones(id){
  const t=(S.trabajadores||[]).find(x=>x.id===id);if(!t)return;
  const desde=document.getElementById('vacf-desde')?.value,hasta=document.getElementById('vacf-hasta')?.value||desde;
  if(!desde||hasta<desde){toast('⚠️ Revisa las fechas','e');return;}
  const cerr=mesesCerradosEn(desde,hasta);
  if(cerr.length){alertaMesCerrado(cerr,'registrar vacaciones en esas fechas');return;}
  const r=diasHabiles(desde,hasta);
  if(!r.habiles){toast('⚠️ El período no tiene días hábiles','e');return;}
  const s=saldoVacaciones(t,hasta);
  if(s.ok&&s.saldo-r.habiles<0&&!confirm(`El saldo disponible es ${f2(s.saldo)} día(s) y se registran ${r.habiles}.\nQuedará en negativo (vacaciones anticipadas). ¿Continuar?`))return;
  const A=datosAsistencia();
  const choque=A.eventos.find(e=>e.trab===id&&e.desde<=hasta&&(e.hasta||e.desde)>=desde);
  if(choque&&!confirm(`Ya hay un evento de asistencia en esas fechas (${choque.desde} a ${choque.hasta}). ¿Registrar igual?`))return;
  A.eventos.push({id:'as_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),trab:id,tipo:'vacaciones',desde,hasta,
    diasHabiles:r.habiles,obs:(document.getElementById('vacf-obs')?.value||'').trim(),creado:new Date().toISOString()});
  const w=await window.storage.set('asistencia',JSON.stringify(A));
  if(!w||w.ok===false){A.eventos.pop();toast('❌ No se pudieron guardar las vacaciones','e');return;}
  toast(`✅ ${r.habiles} día(s) hábil(es) de vacaciones registrados para ${t.nombre}`);
  logAccion('Registró vacaciones',`${t.nombre} · ${desde} a ${hasta} · ${r.habiles} días hábiles`);
  VF={trab:null,config:null};renderVacaciones();
}
async function guardarFeriadosExtra(){
  const txt=document.getElementById('vac-feriados')?.value||'';
  const extra=[],quitar=[],malos=[];
  txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(l=>{
    let m=l.match(/^-\s*(\d{4}-\d{2}-\d{2})$/);if(m){quitar.push(m[1]);return;}
    m=l.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);if(m){extra.push({fecha:m[1],nombre:m[2]||'Feriado'});return;}
    malos.push(l);
  });
  if(malos.length){toast('⚠️ Formato no reconocido: '+malos.join(' | '),'e');return;}
  S.empresa.feriados={extra,quitar};
  const r=await window.storage.set('empresa',JSON.stringify(S.empresa));
  if(!r||r.ok===false){toast('❌ No se pudieron guardar los feriados','e');return;}
  toast('✅ Feriados guardados');renderVacaciones();
}
function exportarVacacionesExcel(){
  try{
    if(typeof XLSX==='undefined'){toast('⚠️ Biblioteca Excel no cargada','e');return;}
    const corte=fechaCorte();
    const hdr=['TRABAJADOR','RUT','FECHA INGRESO','ANTIGÜEDAD (AÑOS)','AÑOS ANTERIORES','DÍAS / AÑO','PROGRESIVOS','SALDO INICIAL','FECHA SALDO INICIAL','DEVENGADO','TOMADOS','SALDO','PERÍODOS'];
    const rows=(S.trabajadores||[]).map(t=>{const s=saldoVacaciones(t,corte);
      return s.ok?[t.nombre,t.rut||'',s.inicio,+(s.mesesTot/12).toFixed(2),s.aniosPrevios,s.anual,s.progActual,s.tieneInicial?s.inicial:'',s.tieneInicial?s.desdeDev:'',s.devengado,s.diasTomados,s.saldo,+(s.saldo/s.anual).toFixed(2)]
        :[t.nombre,t.rut||'',s.motivo]});
    const det=[['TRABAJADOR','DESDE','HASTA','DÍAS HÁBILES','FERIADOS EN EL PERÍODO','OBSERVACIÓN']];
    (S.trabajadores||[]).forEach(t=>{const s=saldoVacaciones(t,corte);if(s.ok)s.tomadas.forEach(e=>det.push([t.nombre,e.desde,e.hasta||e.desde,e.habiles,e.feriados.map(f=>f.fecha).join(', '),e.obs||'']));});
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([[`SALDOS DE VACACIONES AL ${corte}`],[S.empresa.nombre||''],[],hdr,...rows]);
    ws['!cols']=hdr.map((h,i)=>({wch:i===0?30:Math.max(12,h.length+2)}));
    XLSX.utils.book_append_sheet(wb,ws,'Saldos');
    const ws2=XLSX.utils.aoa_to_sheet(det);ws2['!cols']=[{wch:30},{wch:12},{wch:12},{wch:13},{wch:30},{wch:30}];
    XLSX.utils.book_append_sheet(wb,ws2,'Vacaciones tomadas');
    const emp=(S.empresa.nombre||'empresa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    XLSX.writeFile(wb,`${emp}_vacaciones_${corte}.xlsx`);
    toast('✅ Saldos de vacaciones exportados');
  }catch(e){toast('❌ Error al exportar: '+e.message,'e');}
}

export {feriadosAnio, esFeriado, diasHabiles, progresivos, saldoVacaciones, renderVacaciones, abrirFormVacaciones,
        abrirConfigVacaciones, guardarConfigVacaciones, guardarVacaciones, guardarFeriadosExtra, previewVacaciones,
        exportarVacacionesExcel, mesesEntre};
