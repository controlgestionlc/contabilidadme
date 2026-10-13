// remuneraciones.js — Liquidaciones de sueldo (AFP, salud, cesantía, IUSC)
import {toast, fmtC, MESES, pdcNm, pn} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {getIndicadores, IND, calcularGratificacion, topeGratificacionMensual,
        getIUSCTabla, calcularIUSCDetalle, IUSC_TABLA_OFICIAL} from './indicadores.js';
import {getPrevisional, afpInfo, isapreInfo, calcularAportePatronal} from './previsional.js';
import {ejercicioCerrado,persistirAsientosCritico} from './contabilidad-v2.js';
import {numeroMostrar} from './correlativo-contable.js';
import {asistenciaMes} from './asistencia.js';
import './storage.js';

let REMF={editId:null}; // form trabajador (estado interno)

// ═══ FASE 5: REMUNERACIONES ═══
// Parámetros previsionales — ahora leídos desde los indicadores configurables
function remParams(){
  const i=getIndicadores();
  return {
    topeAFP_UF:i.topeAFP_UF,
    topeCesantia_UF:i.topeCesantia_UF,
    tasaAFP:i.tasaAFP/100,
    tasaSalud:i.tasaSalud/100,
    tasaCesantiaTrab:i.tasaCesantiaTrab/100,
    ingresoMinimo:i.ingresoMinimo,
  };
}
// Las AFP y sus comisiones viven en previsional.js (editables por el usuario).
// La tabla del Impuesto Único de Segunda Categoría (Art. 43 N°1 LIR) vive en
// indicadores.js, donde es editable. Se expone acá por compatibilidad.
const IUSC_TABLA=IUSC_TABLA_OFICIAL;
function calcularIUSC(baseTributable,utm){
  return calcularIUSCDetalle(baseTributable,utm,getIUSCTabla()).impuesto;
}
// UF/UTM del mes: guardadas en empresa (editables). Defaults referenciales.
function getUF(){return +document.getElementById('rem-uf')?.value||IND('uf');}
function getUTM(){return pn(document.getElementById('rem-utm')?.value)||IND('utm');}

// Calcula la liquidación completa de un trabajador con UF/UTM dados
// Modo de gratificación de un trabajador. Los registros antiguos (sin
// `gratifModo` ni `gratifPct`) siguen con su monto fijo: así una ficha ya
// cargada no cambia de líquido sólo por actualizar el sistema.
function gratificacionModo(t){
  if(t.gratifModo==='pct'||t.gratifModo==='monto')return t.gratifModo;
  return (t.gratifPct!=null&&t.gratifPct!=='')?'pct':'monto';
}

// `asis` (opcional, V2.21.30): asistencia del mes calculada por asistencia.js.
// Sin ella se liquida el mes completo (30 días), como antes.
//  - Sueldo mensual: base, otros haberes, gratificación, colación y movilización
//    se pagan en proporción a los días pagados (sobre 30).
//  - Pago por hora: base = valor hora × horas del mes; el resto de los haberes
//    sigue la proporción de días.
//  - Los topes imponibles (AFP/salud, cesantía) y el tope de gratificación
//    también quedan proporcionales a los días pagados.
function calcularLiquidacion(t,uf,utm,asis){
  const REM_PARAMS=remParams(); // indicadores configurables
  const porHora=t.tipoPago==='hora';
  const factor=asis?Math.max(0,Math.min(1,+asis.factor)):1;
  const horas=porHora?(asis&&asis.horas!=null?+asis.horas:(+t.horasMes||0)):null;
  const baseContrato=porHora?Math.round((+t.valorHora||0)*(horas||0)):(+t.base||0);
  const base=porHora?baseContrato:Math.round((+t.base||0)*factor);
  const otros=Math.round((+t.otros||0)*factor);
  const colacion=Math.round((+t.colacion||0)*factor), movilizacion=Math.round((+t.movilizacion||0)*factor);
  // ── Gratificación legal (Art. 50 Código del Trabajo) ──
  // Modo 'pct': % sobre la remuneración imponible del mes (sueldo base + otros
  // haberes imponibles, sin incluirse a sí misma), con el tope legal prorrateado.
  // Modo 'monto': cifra pactada, sin tope (es una gratificación convencional).
  // Los trabajadores creados antes de este cambio no traen `gratifModo`: se
  // mantienen en 'monto' para no alterar sus liquidaciones.
  const gratModo=gratificacionModo(t);
  let grat=0, gratInfo=null;
  if(gratModo==='pct'){
    gratInfo=calcularGratificacion(base+otros,t.gratifPct);
    if(factor<1&&gratInfo.tope>0){
      const tope=Math.round(gratInfo.tope*factor);
      gratInfo={...gratInfo,tope,monto:Math.min(gratInfo.bruta,tope),topeAplicado:gratInfo.bruta>tope};
    }
    grat=gratInfo.monto;
  }else{
    grat=Math.round((+t.grat||0)*factor);
  }
  // Total imponible (haberes que cotizan)
  const totalImponible=base+grat+otros;
  const totalNoImponible=colacion+movilizacion;
  const totalHaberes=totalImponible+totalNoImponible;
  // Topes
  const topeAFP=Math.round(REM_PARAMS.topeAFP_UF*uf*factor);
  const topeCes=Math.round(REM_PARAMS.topeCesantia_UF*uf*factor);
  const baseAFP=Math.min(totalImponible,topeAFP);
  const baseCes=Math.min(totalImponible,topeCes);
  // Descuentos previsionales
  const afp=afpInfo(t.afp);
  const descAFP=Math.round(baseAFP*(REM_PARAMS.tasaAFP+(afp.comision/100)));
  const descAFP_pension=Math.round(baseAFP*REM_PARAMS.tasaAFP);
  const descAFP_comision=descAFP-descAFP_pension;
  // Salud: se separan los dos componentes como en una liquidación real.
  //  - saludLegal: el 7% obligatorio sobre la renta imponible (topeada)
  //  - adicionalIsapre: el excedente cuando el plan pactado (UF del FUN) supera ese 7%
  // Fonasa siempre cotiza exactamente el 7%, sin adicional.
  const saludLegal=Math.round(baseAFP*REM_PARAMS.tasaSalud);
  let adicionalIsapre=0;
  if(t.salud&&t.salud!=='fonasa'&&t.plan){
    const planPesos=Math.round((+t.plan||0)*uf);
    // Si el plan vale menos que el 7%, igual se entera el 7% (no hay adicional).
    adicionalIsapre=Math.max(0,planPesos-saludLegal);
  }
  const descSalud=saludLegal+adicionalIsapre; // total enterado a la institución
  const planUF=+t.plan||0;
  const planPesos=planUF?Math.round(planUF*uf):0;
  // Cesantía trabajador (solo contrato indefinido)
  const descCesantia=t.contrato==='indefinido'?Math.round(baseCes*REM_PARAMS.tasaCesantiaTrab):0;
  // Total cotizaciones previsionales
  const totalPrevisional=descAFP+descSalud+descCesantia;
  // Base tributable = imponible − cotizaciones previsionales
  const baseTributable=totalImponible-totalPrevisional;
  // Impuesto único de Segunda Categoría, según la tabla configurada en Indicadores
  const iuscDet=calcularIUSCDetalle(baseTributable,utm,getIUSCTabla());
  const iusc=iuscDet.impuesto;
  // Total descuentos y líquido
  const totalDescuentos=totalPrevisional+iusc;
  const liquido=totalHaberes-totalDescuentos;
  // Aporte patronal (costo empresa, no se descuenta al trabajador)
  // Licencias: SIS y aporte AFC del empleador siguen sobre la renta del mes
  // completo (días pagados + días de licencia), con los topes completos.
  let baseSIS=baseAFP, baseAFC=baseCes;
  const diasLic=asis?(+asis.diasLicencia||0):0;
  if(diasLic>0&&factor<1){
    const full=porHora?null:calcularLiquidacion(t,uf,utm);
    const impFull=full?full.totalImponible:totalImponible;
    const extra=Math.round(impFull*Math.min(30,diasLic)/30);
    baseSIS=Math.min(Math.round(REM_PARAMS.topeAFP_UF*uf),baseAFP+extra);
    baseAFC=Math.min(Math.round(REM_PARAMS.topeCesantia_UF*uf),baseCes+extra);
  }
  const patronal=calcularAportePatronal(t,baseAFP,baseCes,{sis:baseSIS,afc:baseAFC});
  const costoEmpresa=totalHaberes+patronal.total;
  return {patronal,costoEmpresa,
    base,baseContrato,otros,colacion,movilizacion,porHora,horas,valorHora:porHora?(+t.valorHora||0):null,
    factor,asis:asis||null,
    grat,gratModo,gratInfo,
    totalImponible,totalNoImponible,totalHaberes,baseAFP,baseCes,baseSIS,baseAFC,
    descAFP,descAFP_pension,descAFP_comision,descSalud,saludLegal,adicionalIsapre,planUF,planPesos,descCesantia,
    totalPrevisional,baseTributable,iusc,iuscDet,totalDescuentos,liquido,
    afpNm:afp.nm, saludNm:(t.salud&&t.salud!=='fonasa')?isapreInfo(t.salud).nm:'Fonasa'};
}

// Liquidación del mes seleccionado en la sección, con su asistencia
function mesRemSel(){return +(document.getElementById('rem-mes')?.value||1);}
function liquidacionMes(t,uf,utm,mes){
  const m=mes||mesRemSel();
  return calcularLiquidacion(t,uf,utm,asistenciaMes(t,S.empresa.anio,m));
}

function abrirFormTrabajador(){
  REMF={editId:null};
  const f=document.getElementById('rem-form');f.style.display='block';
  document.getElementById('remf-title').textContent='Nuevo Trabajador';
  const P=getPrevisional();
  document.getElementById('remf-afp').innerHTML=P.afps.map(a=>`<option value="${a.k}">${a.nm} (${(+a.comision).toFixed(2)}%)</option>`).join('');
  document.getElementById('remf-salud').innerHTML=P.isapres.map(i=>`<option value="${i.k}">${i.nm}</option>`).join('');
  ['nombre','rut','cargo','base','plan','apepat','apemat','nombres','fun','sexo'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='';});
  ['nacionalidad','tipotrab'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='0';});
  ['grat','otros','colacion','movilizacion'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='0';});
  ['valorhora','horasmes'].forEach(x=>{const e=document.getElementById('remf-'+x);if(e)e.value='';});
  document.getElementById('remf-tipopago').value='mensual';onTipoPagoChange(true);
  document.getElementById('remf-salud').value='fonasa';
  document.getElementById('remf-contrato').value='indefinido';
  cargarLREForm({});
  // Los trabajadores nuevos parten con la gratificación legal en porcentaje
  document.getElementById('remf-gratmodo').value='pct';
  document.getElementById('remf-gratpct').value=getIndicadores().gratifPct??25;
  onGratModoChange();
  document.getElementById('remf-plan-wrap').style.display='none';
  document.getElementById('remf-preview').innerHTML='';
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function cerrarFormTrabajador(){document.getElementById('rem-form').style.display='none';REMF={editId:null};}
// Alterna entre gratificación por porcentaje y monto fijo, y muestra el tope legal vigente
function onGratModoChange(){
  const modo=document.getElementById('remf-gratmodo')?.value||'pct';
  const wp=document.getElementById('remf-gratpct-wrap'),wm=document.getElementById('remf-gratmonto-wrap');
  if(wp)wp.style.display=modo==='pct'?'':'none';
  if(wm)wm.style.display=modo==='monto'?'':'none';
  const hint=document.getElementById('remf-grat-hint');
  if(hint){
    const i=getIndicadores();
    hint.innerHTML=modo==='pct'
      ? `Tope legal: ${fmtC(topeGratificacionMensual())} al mes (${(+i.gratifTopeIMM||0).toLocaleString('es-CL')} IMM ÷ 12)`
      : 'Gratificación pactada — no se le aplica el tope legal';
  }
  previewLiq();
}
// Sueldo mensual o pago por hora: muestra los campos que corresponden
function onTipoPagoChange(sinPreview){
  const hora=document.getElementById('remf-tipopago')?.value==='hora';
  const wb=document.getElementById('remf-base-wrap'),wh=document.getElementById('remf-hora-wrap'),wm=document.getElementById('remf-horasmes-wrap');
  if(wb)wb.style.display=hora?'none':'';
  if(wh)wh.style.display=hora?'':'none';
  if(wm)wm.style.display=hora?'':'none';
  if(!sinPreview)previewLiq();
}
// Propone apellidos y nombres desde el nombre completo (sólo si están vacíos
// o fueron propuestos antes): las dos últimas palabras son los apellidos.
function sugerirNombresPrevired(){
  const g=id=>document.getElementById(id);
  const p=(g('remf-nombre')?.value||'').trim().split(/\s+/).filter(Boolean);
  const campos=[['remf-nombres',p.length>=3?p.slice(0,-2).join(' '):p[0]||''],['remf-apepat',p.length>=3?p[p.length-2]:p[1]||''],['remf-apemat',p.length>=3?p[p.length-1]:'']];
  campos.forEach(([id,v])=>{const e=g(id);if(e&&(!e.value||e.dataset.auto==='1')){e.value=v;e.dataset.auto='1';}});
}
function onSaludChange(){
  const isIsapre=document.getElementById('remf-salud').value!=='fonasa';
  document.getElementById('remf-plan-wrap').style.display=isIsapre?'':'none';
  const fw=document.getElementById('remf-fun-wrap');if(fw)fw.style.display=isIsapre?'':'none';
  previewLiq();
}
function leerLRETrabajador(){
  const g=id=>document.getElementById(id)?.value??'';
  return {
    fechaInicio:g('remf-lre-inicio'),fechaTermino:g('remf-lre-termino'),causalTermino:g('remf-lre-causal'),
    region:g('remf-lre-region'),comuna:g('remf-lre-comuna'),tipoImpuesto:g('remf-lre-impuesto')||'1',
    jornada:g('remf-lre-jornada')||'101',diasTrabajados:g('remf-lre-dias')||'30',diasLicencia:g('remf-lre-licencia'),diasVacaciones:g('remf-lre-vacaciones'),
    discapacidad:g('remf-lre-discapacidad')||'0',pensionadoVejez:g('remf-lre-vejez')||'0',tecnicoExtranjero:g('remf-lre-extranjero')||'0',
    apvIndividual:g('remf-lre-apv')||'0',apvColectivo:g('remf-lre-apvc')||'0',indemnizacionTodoEvento:g('remf-lre-ite')||'0',
    otrosCodigo:g('remf-lre-otros')||'2111'
  };
}
function cargarLREForm(lre={}){
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  set('remf-lre-inicio',lre.fechaInicio||'');set('remf-lre-termino',lre.fechaTermino||'');set('remf-lre-causal',lre.causalTermino||'');
  set('remf-lre-region',lre.region||'');set('remf-lre-comuna',lre.comuna||'');set('remf-lre-impuesto',lre.tipoImpuesto||'1');
  set('remf-lre-jornada',lre.jornada||'101');set('remf-lre-dias',lre.diasTrabajados??'30');set('remf-lre-licencia',lre.diasLicencia||'');set('remf-lre-vacaciones',lre.diasVacaciones||'');
  set('remf-lre-discapacidad',lre.discapacidad||'0');set('remf-lre-vejez',lre.pensionadoVejez||'0');set('remf-lre-extranjero',lre.tecnicoExtranjero||'0');
  set('remf-lre-apv',lre.apvIndividual||'0');set('remf-lre-apvc',lre.apvColectivo||'0');set('remf-lre-ite',lre.indemnizacionTodoEvento||'0');set('remf-lre-otros',lre.otrosCodigo||'2111');
}
function leerFormTrabajador(){
  return {
    nombre:document.getElementById('remf-nombre').value.trim(),
    apellidoPaterno:(document.getElementById('remf-apepat')?.value||'').trim(),
    apellidoMaterno:(document.getElementById('remf-apemat')?.value||'').trim(),
    nombres:(document.getElementById('remf-nombres')?.value||'').trim(),
    sexo:document.getElementById('remf-sexo')?.value||'',
    nacionalidad:document.getElementById('remf-nacionalidad')?.value||'0',
    tipoTrabajador:document.getElementById('remf-tipotrab')?.value||'0',
    numeroFUN:(document.getElementById('remf-fun')?.value||'').trim(),
    rut:document.getElementById('remf-rut').value.trim(),
    cargo:document.getElementById('remf-cargo').value.trim(),
    base:pn(document.getElementById('remf-base').value),
    tipoPago:document.getElementById('remf-tipopago')?.value==='hora'?'hora':'mensual',
    valorHora:pn(document.getElementById('remf-valorhora')?.value),
    horasMes:+String(document.getElementById('remf-horasmes')?.value||'').replace(',','.')||0,
    gratifModo:document.getElementById('remf-gratmodo')?.value||'pct',
    gratifPct:+document.getElementById('remf-gratpct')?.value||0,
    grat:pn(document.getElementById('remf-grat').value),
    otros:pn(document.getElementById('remf-otros').value),
    colacion:pn(document.getElementById('remf-colacion').value),
    movilizacion:pn(document.getElementById('remf-movilizacion').value),
    afp:document.getElementById('remf-afp').value,
    salud:document.getElementById('remf-salud').value,
    plan:+document.getElementById('remf-plan').value||0,
    contrato:document.getElementById('remf-contrato').value,
    lre:leerLRETrabajador(),
  };
}
function previewLiq(){
  const t=leerFormTrabajador();
  const el=document.getElementById('remf-preview');
  if(t.tipoPago==='hora'?!(t.valorHora&&t.horasMes):!t.base){el.innerHTML='';return;}
  const uf=getUF(),utm=getUTM();
  const l=calcularLiquidacion(t,uf,utm);
  el.innerHTML=`<div class="info-tip" style="font-size:12px">
    <div style="display:grid;grid-template-columns:1fr auto;gap:2px 16px">
      ${l.gratModo==='pct'&&l.gratInfo?`<span style="color:var(--mt)">Gratificación ${l.gratInfo.pct}% ${l.gratInfo.topeAplicado?`<span style="color:var(--warn)">(topeada desde ${fmtC(l.gratInfo.bruta)})</span>`:''}</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.grat)}</span>`:''}
      ${t.tipoPago==='hora'?`<span style="color:var(--mt)">Sueldo: ${t.horasMes} h × ${fmtC(t.valorHora)} (horas habituales, mes completo)</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.base)}</span>`:''}
      <span>Total haberes</span><span style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</span>
      <span style="color:var(--mt)">AFP ${l.afpNm} (10% + comisión)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descAFP)}</span>
      <span style="color:var(--mt)">Salud 7% legal</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.saludLegal)}</span>
      ${l.adicionalIsapre?`<span style="color:var(--mt)">Adicional isapre (${l.planUF} UF)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.adicionalIsapre)}</span>`:''}
      <span style="color:var(--mt)">Cesantía (0,6%)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descCesantia)}</span>
      <span style="color:var(--mt)">Impuesto único${l.iuscDet&&l.iuscDet.idx>=0?` <span style="font-size:10px">(tramo ${l.iuscDet.idx+1} · ${(l.iuscDet.factor*100).toFixed(2)}% · ${l.iuscDet.baseUTM.toFixed(1)} UTM)</span>`:''}</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.iusc)}</span>
      <span style="font-weight:700;border-top:1px solid var(--bd);padding-top:4px">LÍQUIDO A PAGAR</span><span style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach);border-top:1px solid var(--bd);padding-top:4px">${fmtC(l.liquido)}</span>
    </div>
  </div>`;
}
function guardarTrabajador(){
  const t=leerFormTrabajador();
  if(!t.nombre){toast('⚠️ Ingresa el nombre','e');return;}
  if(t.tipoPago==='hora'){
    if(t.valorHora<=0){toast('⚠️ Ingresa el valor hora','e');return;}
    t.base=0;
  }else if(t.base<=0){toast('⚠️ Ingresa el sueldo base','e');return;}
  const _rp=remParams();
  if(t.tipoPago!=='hora'&&t.base<_rp.ingresoMinimo){
    if(!confirm(`El sueldo base (${fmtC(t.base)}) es menor al ingreso mínimo (${fmtC(_rp.ingresoMinimo)}). ¿Continuar de todas formas?`))return;
  }
  const bien={id:REMF.editId||'tr_'+Date.now(),...t};
  if(REMF.editId){const i=S.trabajadores.findIndex(x=>x.id===REMF.editId);if(i>=0)S.trabajadores[i]=bien;toast('✅ Trabajador actualizado');}
  else{S.trabajadores.push(bien);toast('✅ Trabajador registrado');}
  window.storage.set('trabajadores',JSON.stringify(S.trabajadores)).catch(()=>toast('❌ Error al guardar','e'));
  cerrarFormTrabajador();renderRemuneraciones();updateHdr();
}
function editarTrabajador(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  REMF={editId:id};
  const f=document.getElementById('rem-form');f.style.display='block';
  document.getElementById('remf-title').textContent='Editando Trabajador';
  const P=getPrevisional();
  document.getElementById('remf-afp').innerHTML=P.afps.map(a=>`<option value="${a.k}" ${a.k===t.afp?'selected':''}>${a.nm} (${(+a.comision).toFixed(2)}%)</option>`).join('');
  document.getElementById('remf-salud').innerHTML=P.isapres.map(i=>`<option value="${i.k}" ${i.k===(t.salud||'fonasa')?'selected':''}>${i.nm}</option>`).join('');
  document.getElementById('remf-nombre').value=t.nombre;
  const _set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  _set('remf-apepat',t.apellidoPaterno);_set('remf-apemat',t.apellidoMaterno);_set('remf-nombres',t.nombres);
  _set('remf-sexo',t.sexo||'');_set('remf-nacionalidad',t.nacionalidad||'0');_set('remf-tipotrab',t.tipoTrabajador||'0');_set('remf-fun',t.numeroFUN);
  if(!t.apellidoPaterno&&!t.nombres)sugerirNombresPrevired();
  document.getElementById('remf-rut').value=t.rut||'';
  document.getElementById('remf-cargo').value=t.cargo||'';
  document.getElementById('remf-base').value=t.base||'';
  document.getElementById('remf-tipopago').value=t.tipoPago==='hora'?'hora':'mensual';
  document.getElementById('remf-valorhora').value=t.valorHora||'';
  document.getElementById('remf-horasmes').value=t.horasMes||'';
  onTipoPagoChange(true);
  document.getElementById('remf-gratmodo').value=gratificacionModo(t);
  document.getElementById('remf-gratpct').value=(t.gratifPct!=null&&t.gratifPct!=='')?t.gratifPct:(getIndicadores().gratifPct??25);
  document.getElementById('remf-grat').value=t.grat||0;
  onGratModoChange();
  document.getElementById('remf-otros').value=t.otros||0;
  document.getElementById('remf-colacion').value=t.colacion||0;
  document.getElementById('remf-movilizacion').value=t.movilizacion||0;
  document.getElementById('remf-salud').value=t.salud||'fonasa';
  document.getElementById('remf-plan').value=t.plan||0;
  document.getElementById('remf-contrato').value=t.contrato||'indefinido';
  cargarLREForm(t.lre||{});
  onSaludChange();previewLiq();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function eliminarTrabajador(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  if(!confirm(`¿Eliminar al trabajador "${t.nombre}"?`))return;
  S.trabajadores=S.trabajadores.filter(x=>x.id!==id);
  window.storage.set('trabajadores',JSON.stringify(S.trabajadores)).then(r=>{if(!r||r.ok===false)toast('❌ No se pudo guardar la eliminación del trabajador','e');}).catch(e=>{console.error(e);toast('❌ No se pudo guardar la eliminación del trabajador','e');});
  renderRemuneraciones();updateHdr();toast('🗑 Trabajador eliminado');
}
function onParamRem(){
  // Guardar UF/UTM en empresa y re-render
  S.empresa.remUF=getUF();S.empresa.remUTM=getUTM();
  window.storage.set('empresa',JSON.stringify(S.empresa)).then(r=>{if(!r||r.ok===false)toast('❌ No se pudieron guardar UF/UTM','e');}).catch(e=>{console.error(e);toast('❌ No se pudieron guardar UF/UTM','e');});
  renderRemuneraciones();
  if(document.getElementById('rem-form').style.display!=='none')previewLiq();
}
function renderRemuneraciones(){
  // Poblar selector de mes y UF/UTM
  const selMes=document.getElementById('rem-mes');
  if(selMes&&selMes.options.length===0){
    selMes.innerHTML=MESES.map((nm,i)=>`<option value="${i+1}">${nm} ${S.empresa.anio}</option>`).join('');
    const hoyMes=new Date().getMonth()+1;selMes.value=(S.empresa.anio===new Date().getFullYear())?hoyMes:1;
  }
  const ufEl=document.getElementById('rem-uf'),utmEl=document.getElementById('rem-utm');
  if(ufEl&&!ufEl.value)ufEl.value=IND('uf');
  if(utmEl&&!utmEl.value)utmEl.value=IND('utm');
  // El Libro de Remuneraciones es la otra vista de esta sección (libroremuneraciones.js).
  // Se llama por window para no crear un ciclo de imports entre ambos módulos.
  if(window.getRemView&&window.getRemView()==='libro'&&window.renderLibroRem){window.renderLibroRem();return;}
  if(window.getRemView&&window.getRemView()==='asistencia'&&window.renderAsistencia){window.renderAsistencia();return;}
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  const uf=getUF(),utm=getUTM();
  const el=document.getElementById('rem-content');
  if(!S.trabajadores.length){
    el.innerHTML=tabs+`<div class="empty"><div class="ei">👷</div>No hay trabajadores registrados.<br><br><button class="btn btn-p" onclick="abrirFormTrabajador()">+ Registrar primer trabajador</button></div>`;
    return;
  }
  let totHab=0,totLiq=0,totPrev=0,totIusc=0,totPatronal=0;
  let conAusencias=0;
  const filas=S.trabajadores.map(t=>{
    const l=liquidacionMes(t,uf,utm);
    const a=l.asis;if(a&&!a.completo)conAusencias++;
    const notaDias=l.porHora?`${l.horas||0} h × ${fmtC(l.valorHora)}`:(a&&!a.completo?`<span style="color:var(--warn)">${a.diasPagados}/30 días pagados</span>`:'');
    totHab+=l.totalHaberes;totLiq+=l.liquido;totPrev+=l.totalPrevisional;totIusc+=l.iusc;totPatronal+=l.patronal.total;
    return `<tr>
      <td class="tl" style="font-size:12px">${t.nombre}<div style="font-size:10px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''}${notaDias?' · '+notaDias:''}</div></td>
      <td style="font-family:var(--mono);text-align:right">${fmtC(l.totalHaberes)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descAFP)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)" title="7% legal: ${fmtC(l.saludLegal)}${l.adicionalIsapre?' · Adicional: '+fmtC(l.adicionalIsapre):''}">${fmtC(l.descSalud)}${l.adicionalIsapre?'<div style="font-size:9px;color:var(--mt)">7%: '+fmtC(l.saludLegal)+' + adic. '+fmtC(l.adicionalIsapre)+'</div>':''}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.descCesantia)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(l.iusc)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(l.liquido)}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-i" onclick="verLiquidacion('${t.id}')" title="Ver liquidación">📄</button>
        <button class="btn btn-i" onclick="editarTrabajador('${t.id}')">✏️</button>
        <button class="btn btn-d" onclick="eliminarTrabajador('${t.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML=tabs+`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Total Haberes</div><div class="kpi-val">${fmtC(totHab)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Cotizaciones</div><div class="kpi-val neg">${fmtC(totPrev)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Impuesto Único</div><div class="kpi-val neg">${fmtC(totIusc)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Líquido a Pagar</div><div class="kpi-val pos">${fmtC(totLiq)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Aporte Empleador</div><div class="kpi-val">${fmtC(totPatronal)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Costo Total Empresa</div><div class="kpi-val">${fmtC(totHab+totPatronal)}</div></div>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">TRABAJADOR</th><th style="text-align:right">HABERES</th><th style="text-align:right">AFP</th><th style="text-align:right">SALUD</th><th style="text-align:right">CESANTÍA</th><th style="text-align:right">IUSC</th><th style="text-align:right">LÍQUIDO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTALES (${S.trabajadores.length})</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totHab)}</td><td colspan="4"></td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(totLiq)}</td><td></td></tr></tfoot>
  </table></div></div>
  <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-p" onclick="generarAsientoRemuneraciones()">📝 Generar asiento de remuneraciones</button>
    <span style="font-size:11px;color:var(--mt)">Crea el asiento mensual: sueldos a gasto, cotizaciones e impuesto a pasivos, líquido por pagar.</span>
  </div>
  ${conAusencias?`<div class="info-tip" style="font-size:11px;margin-top:10px">📅 ${conAusencias} trabajador(es) con días no pagados en ${MESES[mesRemSel()-1]}. Revisa el detalle en la pestaña Asistencia.</div>`:''}
  <div style="margin-top:8px;font-size:10px;color:var(--mt)">Cálculo con UF ${fmtC(uf)} y UTM ${fmtC(utm)}. Topes: AFP/salud 90 UF, cesantía 135,2 UF. Referencial — verifica en Previred antes de declarar.</div>`;
}
function verLiquidacion(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  const uf=getUF(),utm=getUTM();
  const l=liquidacionMes(t,uf,utm);
  const a=l.asis;
  const mes=MESES[mesRemSel()-1];
  const diasTxt=a?[a.diasLicencia?a.diasLicencia+' licencia':'',a.diasPermisoSin?a.diasPermisoSin+' permiso s/goce':'',a.diasAusencia?a.diasAusencia+' ausencia':'',a.diasFueraContrato?a.diasFueraContrato+' fuera de contrato':'',a.diasPermisoCon?a.diasPermisoCon+' permiso c/goce':'',a.diasVacaciones?a.diasVacaciones+' vacaciones':''].filter(Boolean).join(' · '):'';
  const row=(lbl,val,neg,bold)=>`<tr><td class="tl" style="padding:5px 10px;font-size:12px;${bold?'font-weight:700':''}">${lbl}</td><td style="font-family:var(--mono);text-align:right;${bold?'font-weight:700;':''}color:${neg?'var(--err)':(bold?'var(--ach)':'var(--tx)')}">${neg?'−':''}${fmtC(val)}</td></tr>`;
  const E=S.empresa||{};
  const html=`<div class="card liq-print" style="max-width:620px;margin:0 auto">
    <div class="liq-emp">
      <div><strong>${E.nombre||''}</strong>${E.rut?' · RUT '+E.rut:''}</div>
      ${E.domicilio||E.direccion?`<div>${E.domicilio||E.direccion}${E.comuna?', '+E.comuna:''}</div>`:''}
    </div>
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Liquidación de Sueldo</div>
      <div style="font-size:12px;color:var(--mt)">${mes} ${S.empresa.anio} · ${S.empresa.nombre||''}</div>
    </div>
    <div style="margin-bottom:10px"><strong>${t.nombre}</strong><div style="font-size:11px;color:var(--mt)">${t.cargo||''} ${t.rut?'· '+t.rut:''} · ${l.afpNm} · ${l.saludNm}</div>
      ${a?`<div style="font-size:11px;margin-top:4px">Días pagados: <strong>${a.diasPagados}</strong> de 30${diasTxt?` <span style="color:var(--mt)">(${diasTxt})</span>`:''}</div>`:''}</div>
    <table class="liq-tbl"><colgroup><col><col class="liq-col-monto"></colgroup><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">HABERES</td></tr>
      ${row(l.porHora?`Sueldo por horas (${l.horas||0} h × ${fmtC(l.valorHora)})`:(l.factor<1?`Sueldo base (${a.diasPagados}/30 días de ${fmtC(l.baseContrato)})`:'Sueldo base'),l.base)}
      ${l.grat?row(l.gratModo==='pct'
          ?`Gratificación legal (${l.gratInfo.pct}%${l.gratInfo.topeAplicado?' · tope legal aplicado':''})`
          :'Gratificación pactada',l.grat):''}
      ${l.otros?row('Otros imponibles',l.otros):''}
      ${l.colacion?row('Colación (no imp.)',l.colacion):''}
      ${l.movilizacion?row('Movilización (no imp.)',l.movilizacion):''}
      ${row('Total haberes',l.totalHaberes,false,true)}
      <tr class="rth"><td colspan="2" class="tl" style="padding:6px 10px">DESCUENTOS</td></tr>
      ${row((/^AFP\b/i.test(l.afpNm)?l.afpNm:'AFP '+l.afpNm)+' (pensión 10%)',l.descAFP_pension,true)}
      ${row('AFP comisión',l.descAFP_comision,true)}
      ${row('Salud 7% (cotización legal)',l.saludLegal,true)}
      ${l.adicionalIsapre?row(`Adicional ${l.saludNm} (plan ${(+l.planUF).toLocaleString('es-CL',{maximumFractionDigits:4})} UF)`,l.adicionalIsapre,true):''}
      ${l.descCesantia?row('Seguro cesantía 0,6%',l.descCesantia,true):''}
      ${l.iusc?row(`Impuesto único 2ª cat. (tramo ${l.iuscDet.idx+1} · ${(l.iuscDet.factor*100).toFixed(2)}%)`,l.iusc,true):''}
      ${row('Total descuentos',l.totalDescuentos,true,true)}
      <tr style="background:rgba(46,160,67,.14)"><td class="tl" style="padding:11px 10px;font-weight:700;font-size:14px">LÍQUIDO A PAGAR</td><td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:var(--ach)">${fmtC(l.liquido)}</td></tr>
    </tbody></table>
    <div style="font-size:10px;color:var(--mt);margin-top:8px">Base tributable: ${fmtC(l.baseTributable)} · UF ${fmtC(uf)} · UTM ${fmtC(utm)}</div>
    <div class="liq-firmas">
      <div><div class="liq-linea"></div>Firma empleador</div>
      <div><div class="liq-linea"></div>Recibí conforme: ${t.nombre}${t.rut?' · '+t.rut:''}</div>
    </div>
    <div style="margin-top:12px;text-align:right"><button class="btn btn-g" onclick="renderRemuneraciones()">← Volver</button> <button class="btn btn-g" onclick="imprimirLiquidacion()">🖨️ Imprimir</button></div>
  </div>`;
  document.getElementById('rem-content').innerHTML=html;
}
// V2.21.31 — Imprime sólo la liquidación, en una hoja carta vertical.
// Antes de imprimir se mide el contenido al ancho útil de la hoja y, si no
// cabe en el alto útil, se reduce con zoom: siempre queda en una sola página.
function imprimirLiquidacion(){
  const el=document.querySelector('#rem-content .liq-print');
  if(!el){window.print();return;}
  const MM=96/25.4;                       // px por mm a 96 dpi
  const anchoUtil=(215.9-24)*MM, altoUtil=(279.4-24)*MM;   // márgenes de 12 mm
  document.body.classList.add('print-liq');
  el.style.zoom='';
  const prev={w:el.style.width,mw:el.style.maxWidth};
  el.style.maxWidth='none';el.style.width=anchoUtil+'px';
  const alto=el.scrollHeight;
  el.style.width=prev.w;el.style.maxWidth=prev.mw;
  const escala=Math.min(1,(altoUtil-8)/Math.max(1,alto));
  document.documentElement.style.setProperty('--liq-zoom',escala.toFixed(3));
  const limpiar=()=>{document.body.classList.remove('print-liq');document.documentElement.style.removeProperty('--liq-zoom');window.removeEventListener('afterprint',limpiar);};
  window.addEventListener('afterprint',limpiar);
  window.print();
  setTimeout(limpiar,1500);
}

async function generarAsientoRemuneraciones(){
  const anio=S.empresa.anio;
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de generar remuneraciones.','e');return;}
  const mesNum=+document.getElementById('rem-mes').value||1;
  const uf=getUF(),utm=getUTM();
  if(!S.trabajadores.length){toast('⚠️ No hay trabajadores','e');return;}
  // Acumular
  let totSueldo=0,totColMov=0,totAFP=0,totSalud=0,totCes=0,totIusc=0,totLiq=0,totPatronal=0;
  S.trabajadores.forEach(t=>{
    const l=liquidacionMes(t,uf,utm,mesNum);
    totSueldo+=l.totalImponible;totColMov+=l.totalNoImponible;
    totAFP+=l.descAFP;totSalud+=l.descSalud;totCes+=l.descCesantia;totIusc+=l.iusc;totLiq+=l.liquido;
    totPatronal+=l.patronal.total;
  });
  if(totSueldo<=0){toast('⚠️ No hay montos','e');return;}
  // Último día calendario real del mes: evita fechas inexistentes como
  // 2026-02-30 y mantiene el asiento dentro del período de remuneraciones.
  const ultimoDia=new Date(anio,mesNum,0).getDate();
  const fecha=`${anio}-${String(mesNum).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
  // V2.21.36 — Antes de decidir, se trae el libro de asientos vigente desde la
  // nube: otro equipo (o una sesión anterior) pudo haber grabado asientos que
  // esta pantalla aún no tiene en memoria.
  const fresco=await refrescarAsientosDesdeNube(anio);
  if(!fresco.ok){toast('⚠️ No se pudo leer el libro de asientos desde la nube ('+fresco.motivo+'). Revisa la conexión e inténtalo de nuevo.','e');return;}
  // V2.21.35 — Un solo asiento activo de remuneraciones por mes. Si ya existe,
  // se ofrece reemplazarlo: el anterior queda ANULADO (no se borra su número).
  const periodo=`${anio}-${String(mesNum).padStart(2,'0')}`;
  const previos=(S.asientos||[]).filter(a=>!a.anulado&&a.tipo==='remuneraciones'&&(a.periodo===periodo||String(a.fecha||'').slice(0,7)===periodo));
  const resumen=`${S.trabajadores.length} trabajadores\nLíquido a pagar: ${fmtC(totLiq)}\nAporte patronal: ${fmtC(totPatronal)}`;
  if(previos.length){
    const nums=previos.map(a=>'N°'+(numeroMostrar(a)||'?')).join(', ');
    if(!confirm(`${previos.length===1?'Ya existe el asiento':'Ya existen los asientos'} de remuneraciones de ${MESES[mesNum-1]} ${anio}: ${nums}.\n\n¿Reemplazarlo por uno nuevo?\n${previos.length===1?'El anterior queda anulado':'Los anteriores quedan anulados'} (conserva${previos.length===1?'':'n'} su número, sin efecto contable).\n\n${resumen}`))return;
  }else if(!confirm(`¿Generar asiento de remuneraciones de ${MESES[mesNum-1]} ${anio}?\n\n${resumen}`))return;
  const movs=[];
  // DEBE: gasto en sueldos (imponible + no imponible)
  movs.push({cd:'3201001',nm:pdcNm('3201001'),debe:totSueldo,haber:0,desc:'Sueldos '+MESES[mesNum-1]});
  if(totColMov)movs.push({cd:'3201003',nm:pdcNm('3201003'),debe:totColMov,haber:0,desc:'Colación y movilización'});
  // HABER: retenciones previsionales e impuesto (por pagar), líquido por pagar
  const totPrev=totAFP+totSalud+totCes;
  if(totPrev)movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPrev,desc:'Instituciones previsionales por pagar'});
  if(totIusc)movs.push({cd:'2104002',nm:pdcNm('2104002'),debe:0,haber:totIusc,desc:'Impuesto único por pagar'});
  movs.push({cd:'2104005',nm:pdcNm('2104005'),debe:0,haber:totLiq,desc:'Líquidos por pagar'});
  // Aporte patronal: es GASTO de la empresa (no se descuenta al trabajador),
  // con contrapartida en instituciones previsionales por pagar.
  if(totPatronal>0){
    movs.push({cd:'3201013',nm:pdcNm('3201013'),debe:totPatronal,haber:0,desc:'Aporte patronal (SIS, mutual, AFC)'});
    movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPatronal,desc:'Aporte patronal por pagar'});
  }
  // El número lo asigna la secuencia contable al guardar (numeroContable).
  // Antes se usaba un folio calculado en el equipo, que podía coincidir con
  // el número de otro asiento (por ejemplo, de una factura).
  if(GEN_REM_EN_CURSO)return;
  GEN_REM_EN_CURSO=true;
  const id='as_rem_'+periodo+'_'+Date.now().toString(36);
  const idsPrevios=new Set(previos.map(a=>a.id));
  let r;
  try{
    r=await persistirAsientosCritico(()=>{
      const ahora=new Date().toISOString();
      S.asientos.forEach(a=>{if(idsPrevios.has(a.id)){a.anulado=true;a.anuladoEn=ahora;a.motivoAnulacion='Reemplazado por un nuevo asiento de remuneraciones '+periodo;}});
      S.asientos.push({id,n:null,fecha,glosa:`Remuneraciones ${MESES[mesNum-1]} ${anio}`,movs,tipo:'remuneraciones',periodo,creadoEn:ahora,indicadoresLiquidacion:{uf,utm}});
    });
  }finally{GEN_REM_EN_CURSO=false;}
  if(!r.ok){
    console.error('Asiento de remuneraciones no guardado:',r.motivo);
    toast('❌ No se pudo guardar el asiento de remuneraciones ('+(r.motivo||'error desconocido')+'). La operación NO se contabilizó.','e');
    return;
  }
  const nuevo=(S.asientos||[]).find(a=>a.id===id);
  const num=numeroMostrar(nuevo);
  toast('✅ Asiento N°'+(num||'?')+' de remuneraciones ('+fmtC(totLiq)+' líquido)'+(previos.length?' · anulado'+(previos.length>1?'s':'')+' '+previos.map(a=>'N°'+numeroMostrar(a)).join(', '):''));
  logAccion('Generó asiento de remuneraciones',`${MESES[mesNum-1]} ${anio} · N°${num} · ${fmtC(totLiq)} líquido${previos.length?' · reemplaza '+previos.map(a=>'N°'+numeroMostrar(a)).join(', '):''}`);
  renderRemuneraciones();updateHdr();
}
let GEN_REM_EN_CURSO=false;

// Une al estado en memoria lo que está en la nube: los asientos que sólo están
// allá se agregan; para los que están en ambos manda la nube (es lo grabado).
// Los que sólo existen aquí se conservan (aún no se han subido).
async function refrescarAsientosDesdeNube(anio){
  try{
    const r=await window.storage.leerConEstado(`asientos-${anio}`);
    if(!r||r.fuente==='error')return {ok:false,motivo:r?.error||'lectura'};
    if(r.value==null)return {ok:true,agregados:0};
    const nube=JSON.parse(r.value);
    if(!Array.isArray(nube))return {ok:false,motivo:'formato'};
    const ids=new Set(nube.map(a=>String(a.id)));
    const soloLocales=(S.asientos||[]).filter(a=>!ids.has(String(a.id)));
    const antes=(S.asientos||[]).length;
    S.asientos=[...nube,...soloLocales];
    return {ok:true,agregados:S.asientos.length-antes};
  }catch(e){return {ok:false,motivo:e.message||String(e)};}
}


export {remParams, IUSC_TABLA, calcularIUSC, getUF, getUTM, calcularLiquidacion, liquidacionMes, onTipoPagoChange, imprimirLiquidacion, sugerirNombresPrevired, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, onGratModoChange, gratificacionModo, leerFormTrabajador, leerLRETrabajador, cargarLREForm, previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador, onParamRem, renderRemuneraciones, verLiquidacion, generarAsientoRemuneraciones, REMF};
