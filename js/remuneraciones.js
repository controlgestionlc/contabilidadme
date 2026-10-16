// remuneraciones.js — Liquidaciones de sueldo (AFP, salud, cesantía, IUSC)
import {toast, fmtC, MESES, pdcNm, pn} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {getIndicadores, IND, calcularGratificacion, topeGratificacionMensual,
        getIUSCTabla, calcularIUSCDetalle, IUSC_TABLA_OFICIAL,
        tramoAsignacionFamiliar, montoAsignacionTramo, tasasTrabajoPesado} from './indicadores.js';
import {getPrevisional, afpInfo, isapreInfo, calcularAportePatronal, tasasAFC} from './previsional.js';
import {ejercicioCerrado,persistirAsientosCritico} from './contabilidad-v2.js';
import {numeroMostrar} from './correlativo-contable.js';
import {asistenciaMes} from './asistencia.js';
import {numeroALetras} from './numletras.js';
import {anticiposMes,aplicarAnticipos} from './anticipos.js';
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

// Renta mínima que corresponde al trabajador (V2.21.47)
function rentaMinimaDe(t){
  const i=getIndicadores();const k=(t.lre&&t.lre.rentaMinima)||'general';
  if(k==='especial')return {k,nm:'para menores de 18 y mayores de 65',monto:+i.rentaMinimaEspecial||0};
  if(k==='casa')return {k,nm:'de casa particular',monto:+i.rentaMinimaCasa||0};
  return {k:'general',nm:'(ingreso mínimo)',monto:+i.ingresoMinimo||0};
}

// ── Asignación familiar (V2.21.47) ──
// Cargas: simples + maternales + 2 × inválidas (las inválidas valen doble).
// Tramo: el fijado en la ficha o, en automático, según el ingreso promedio del
// semestre anterior (enero-junio para julio-diciembre y julio-diciembre del año
// anterior para enero-junio) tomado de los libros cerrados. Sin libros, se usa
// la renta imponible del mes completo.
// Con menos de 25 días trabajados se paga en proporción a los días (Art. 12
// DFL 150; Previred campo 22).
function cargasFamiliares(t){
  const l=t.lre||{};
  const s=Math.max(0,Math.floor(+l.cargasLegales||0)),m=Math.max(0,Math.floor(+l.cargasMaternales||0)),i=Math.max(0,Math.floor(+l.cargasInvalidez||0));
  return {simples:s,maternales:m,invalidas:i,total:s+m+i,equivalentes:s+m+2*i};
}
function ingresoSemestreAnterior(t,periodo){
  if(!/^\d{4}-\d{2}$/.test(periodo||''))return null;
  const [y,m]=periodo.split('-').map(Number);
  const meses=m>=7?[1,2,3,4,5,6].map(x=>`${y}-${String(x).padStart(2,'0')}`):[7,8,9,10,11,12].map(x=>`${y-1}-${String(x).padStart(2,'0')}`);
  const libros=S.libroRem||{};
  const vals=meses.map(p=>{const L=libros[p];const ln=L&&Array.isArray(L.lineas)?L.lineas.find(x=>x.id===t.id):null;return ln?+ln.totalImponible||0:0;}).filter(v=>v>0);
  if(!vals.length)return null;
  return {promedio:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),meses:vals.length};
}
function asignacionFamiliar(t,{totalImponible,factor=1,dias=30,periodo}={}){
  const c=cargasFamiliares(t);
  const manual=String((t.lre&&t.lre.tramoAsignacion)||'').toUpperCase();
  let ingreso=null,fuente='';
  const hist=ingresoSemestreAnterior(t,periodo);
  if(hist){ingreso=hist.promedio;fuente=`promedio semestre anterior (${hist.meses} mes${hist.meses>1?'es':''})`;}
  else{ingreso=factor>0&&factor<1?Math.round(totalImponible/factor):totalImponible;fuente='renta imponible del mes';}
  const tramoIngreso=/^[ABCD]$/.test(manual)?manual:tramoAsignacionFamiliar(ingreso);
  // Sin cargas no hay derecho: se informa tramo D (Previred tabla 8)
  const tramo=c.equivalentes?tramoIngreso:'D';
  const valor=montoAsignacionTramo(tramo);
  const completo=valor*c.equivalentes;
  const d=Math.max(0,Math.min(30,+dias||0));
  const monto=c.equivalentes?Math.round(d>=25?completo:completo/30*d):0;
  return {tramo,tramoIngreso,manual:/^[ABCD]$/.test(manual),ingreso,fuente,valor,cargas:c,dias:d,proporcional:d<25,monto};
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
  // V2.21.47 — Asignación familiar: no imponible ni tributable. La paga el
  // empleador y la recupera al descontarla de las cotizaciones (Previred).
  const af=asignacionFamiliar(t,{totalImponible,factor,dias:asis?asis.diasPagados:30,periodo:asis&&asis.periodo});
  const asigFamiliar=af.monto;
  const totalNoImponible=colacion+movilizacion+asigFamiliar;
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
  const tasaCesTrab=tasasAFC(t.contrato||'indefinido').trab;
  const descCesantia=Math.round(baseCes*tasaCesTrab/100);
  // V2.21.47 — Cotización de trabajo pesado (Ley 19.404), sobre la renta
  // imponible AFP: una parte la paga el trabajador y otra el empleador.
  const califPesado=(t.lre&&t.lre.puestoPesado)||'';
  const tasasTP=tasasTrabajoPesado(califPesado);
  // El total se redondea una vez (Previred campo 39 = renta imponible × %)
  const totalTrabPesado=Math.round(baseAFP*(tasasTP.trab+tasasTP.emp)/100);
  const descTrabPesado=Math.round(baseAFP*tasasTP.trab/100);
  const aporteTrabPesado=totalTrabPesado-descTrabPesado;
  // Total cotizaciones previsionales
  const totalPrevisional=descAFP+descSalud+descCesantia+descTrabPesado;
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
  const patronal=calcularAportePatronal(t,baseAFP,baseCes,{sis:baseSIS,afc:baseAFC,periodo:asis&&asis.periodo});
  if(aporteTrabPesado>0){
    patronal.trabPesado=aporteTrabPesado;patronal.total+=aporteTrabPesado;
    patronal.detalle.push({concepto:`Trabajo ${califPesado==='pesado'?'pesado':'menos pesado'} (Ley 19.404)`,tasa:tasasTP.emp,monto:aporteTrabPesado,institucion:'AFP del trabajador'});
  }else patronal.trabPesado=0;
  // La asignación familiar no es costo: se compensa con las cotizaciones
  const costoEmpresa=totalHaberes-asigFamiliar+patronal.total;
  return {patronal,costoEmpresa,
    base,baseContrato,otros,colacion,movilizacion,porHora,horas,valorHora:porHora?(+t.valorHora||0):null,
    factor,asis:asis||null,tasaCesTrab,
    grat,gratModo,gratInfo,
    totalImponible,totalNoImponible,totalHaberes,baseAFP,baseCes,baseSIS,baseAFC,
    descAFP,descAFP_pension,descAFP_comision,descSalud,saludLegal,adicionalIsapre,planUF,planPesos,descCesantia,
    asigFamiliar,af,descTrabPesado,aporteTrabPesado,califPesado,tasasTP,
    totalPrevisional,baseTributable,iusc,iuscDet,totalDescuentos,liquido,
    afpNm:afp.nm, saludNm:(t.salud&&t.salud!=='fonasa')?isapreInfo(t.salud).nm:'Fonasa'};
}

// Liquidación del mes seleccionado en la sección, con su asistencia
function mesRemSel(){return +(document.getElementById('rem-mes')?.value||1);}
function liquidacionMes(t,uf,utm,mes){
  const m=mes||mesRemSel();
  // V2.21.63: los anticipos del mes se descuentan como otro descuento
  return aplicarAnticipos(calcularLiquidacion(t,uf,utm,asistenciaMes(t,S.empresa.anio,m)),anticiposMes(t,S.empresa.anio,m));
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
    otrosCodigo:g('remf-lre-otros')||'2111',
    cargasLegales:String(Math.max(0,Math.floor(+g('remf-cargas-s')||0))),cargasMaternales:String(Math.max(0,Math.floor(+g('remf-cargas-m')||0))),
    cargasInvalidez:String(Math.max(0,Math.floor(+g('remf-cargas-i')||0))),tramoAsignacion:g('remf-tramo'),
    puestoPesado:g('remf-pesado'),nombrePuestoPesado:String(g('remf-pesado-nombre')).trim().slice(0,40),rentaMinima:g('remf-rentamin')||'general'
  };
}
function cargarLREForm(lre={}){
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  set('remf-lre-inicio',lre.fechaInicio||'');set('remf-lre-termino',lre.fechaTermino||'');set('remf-lre-causal',lre.causalTermino||'');
  set('remf-lre-region',lre.region||'');set('remf-lre-comuna',lre.comuna||'');set('remf-lre-impuesto',lre.tipoImpuesto||'1');
  set('remf-lre-jornada',lre.jornada||'101');set('remf-lre-dias',lre.diasTrabajados??'30');set('remf-lre-licencia',lre.diasLicencia||'');set('remf-lre-vacaciones',lre.diasVacaciones||'');
  set('remf-lre-discapacidad',lre.discapacidad||'0');set('remf-lre-vejez',lre.pensionadoVejez||'0');set('remf-lre-extranjero',lre.tecnicoExtranjero||'0');
  set('remf-lre-apv',lre.apvIndividual||'0');set('remf-lre-apvc',lre.apvColectivo||'0');set('remf-lre-ite',lre.indemnizacionTodoEvento||'0');set('remf-lre-otros',lre.otrosCodigo||'2111');
  set('remf-cargas-s',+lre.cargasLegales||'');set('remf-cargas-m',+lre.cargasMaternales||'');set('remf-cargas-i',+lre.cargasInvalidez||'');
  set('remf-tramo',lre.tramoAsignacion||'');set('remf-pesado',lre.puestoPesado||'');set('remf-pesado-nombre',lre.nombrePuestoPesado||'');set('remf-rentamin',lre.rentaMinima||'general');
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
      <span style="color:var(--mt)">Cesantía (${l.tasaCesTrab.toLocaleString('es-CL')}%)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descCesantia)}</span>
      ${l.descTrabPesado?`<span style="color:var(--mt)">Trabajo ${l.califPesado==='pesado'?'pesado':'menos pesado'} (${l.tasasTP.trab.toLocaleString('es-CL')}% trabajador, ${l.tasasTP.emp.toLocaleString('es-CL')}% empleador)</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.descTrabPesado)}</span>`:''}
      ${l.af&&l.af.cargas.total?`<span style="color:var(--mt)">Asignación familiar: tramo ${l.af.tramo}${l.af.manual?' (fijado)':` (${l.af.fuente}: ${fmtC(l.af.ingreso)})`} · ${l.af.cargas.total} carga(s) × ${fmtC(l.af.valor)}${l.af.cargas.invalidas?' (inválidas al doble)':''}</span><span style="font-family:var(--mono);text-align:right">+${fmtC(l.asigFamiliar)}</span>`:''}
      <span style="color:var(--mt)">Impuesto único${l.iuscDet&&l.iuscDet.idx>=0?` <span style="font-size:10px">(tramo ${l.iuscDet.idx+1} · ${(l.iuscDet.factor*100).toFixed(2)}% · ${l.iuscDet.baseUTM.toFixed(1)} UTM)</span>`:''}</span><span style="font-family:var(--mono);text-align:right;color:var(--err)">−${fmtC(l.iusc)}</span>
      <span style="font-weight:700;border-top:1px solid var(--bd);padding-top:4px">LÍQUIDO A PAGAR</span><span style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach);border-top:1px solid var(--bd);padding-top:4px">${fmtC(l.liquido)}</span>
    </div>
  </div>`;
}
function guardarTrabajador(abrirContratoDT){
  const t=leerFormTrabajador();
  if(!t.nombre){toast('⚠️ Ingresa el nombre','e');return;}
  if(t.tipoPago==='hora'){
    if(t.valorHora<=0){toast('⚠️ Ingresa el valor hora','e');return;}
    t.base=0;
  }else if(t.base<=0){toast('⚠️ Ingresa el sueldo base','e');return;}
  const rm=rentaMinimaDe(t);
  if(t.tipoPago!=='hora'&&String(t.lre.jornada||'101')!=='201'&&t.base<rm.monto){
    if(!confirm(`El sueldo base (${fmtC(t.base)}) es menor a la renta mínima ${rm.nm} (${fmtC(rm.monto)}). ¿Continuar de todas formas?`))return;
  }
  const cg=cargasFamiliares(t);
  if(cg.simples>13||cg.maternales>1||cg.invalidas>1){toast('⚠️ Previred acepta hasta 13 cargas simples, 1 maternal y 1 inválida','e');return;}
  if(t.lre.puestoPesado&&!t.lre.nombrePuestoPesado){toast('⚠️ Indica el nombre del puesto de trabajo pesado (Previred campo 37)','e');return;}
  // V2.21.66: se conservan los datos que el formulario no edita (anticipos,
  // datos del contrato DT, etc.); antes se perdían al editar la ficha.
  const previo=REMF.editId?S.trabajadores.find(x=>x.id===REMF.editId):null;
  const bien={...(previo||{}),id:REMF.editId||'tr_'+Date.now(),...t};
  if(REMF.editId){const i=S.trabajadores.findIndex(x=>x.id===REMF.editId);if(i>=0)S.trabajadores[i]=bien;toast('✅ Trabajador actualizado');}
  else{S.trabajadores.push(bien);toast('✅ Trabajador registrado');}
  window.storage.set('trabajadores',JSON.stringify(S.trabajadores)).catch(()=>toast('❌ Error al guardar','e'));
  cerrarFormTrabajador();renderRemuneraciones();updateHdr();
  // V2.21.66: registrar el contrato en la DT directo desde la ficha
  if(abrirContratoDT===true&&typeof window.cdtEditar==='function')window.cdtEditar(bien.id);
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
  if(window.getRemView&&window.getRemView()==='vacaciones'&&window.renderVacaciones){window.renderVacaciones();return;}
  if(window.getRemView&&window.getRemView()==='finiquitos'&&window.renderFiniquitos){window.renderFiniquitos();return;}
  if(window.getRemView&&window.getRemView()==='contratosdt'&&window.renderContratosDT){window.renderContratosDT();return;}
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  const uf=getUF(),utm=getUTM();
  const el=document.getElementById('rem-content');
  if(!S.trabajadores.length){
    el.innerHTML=tabs+`<div class="empty"><div class="ei">👷</div>No hay trabajadores registrados.<br><br><button class="btn btn-p" onclick="abrirFormTrabajador()">+ Registrar primer trabajador</button></div>`;
    return;
  }
  let totHab=0,totLiq=0,totPrev=0,totIusc=0,totPatronal=0,totAFk=0;
  let conAusencias=0;
  const filas=S.trabajadores.map(t=>{
    const l=liquidacionMes(t,uf,utm);
    const a=l.asis;if(a&&!a.completo)conAusencias++;
    const rm=rentaMinimaDe(t);
    const bajoMinimo=!l.porHora&&String((t.lre&&t.lre.jornada)||'101')!=='201'&&(+t.base||0)<rm.monto;
    const notaDias=(l.porHora?`${l.horas||0} h × ${fmtC(l.valorHora)}`:(a&&!a.completo?`<span style="color:var(--warn)">${a.diasPagados}/30 días pagados</span>`:''))
      +(bajoMinimo?`${l.porHora||(a&&!a.completo)?' · ':''}<span style="color:var(--err)" title="Renta mínima ${rm.nm}: ${fmtC(rm.monto)}">⚠️ sueldo base bajo la renta mínima</span>`:'')
      +(l.asigFamiliar?` · AF ${fmtC(l.asigFamiliar)}`:'');
    totHab+=l.totalHaberes;totLiq+=l.liquido;totAFk+=l.asigFamiliar||0;totPrev+=l.totalPrevisional;totIusc+=l.iusc;totPatronal+=l.patronal.total;
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
        <button class="btn btn-i" onclick="abrirAnticipos('${t.id}')" title="Anticipos de sueldo${(t.anticipos||[]).length?' ('+t.anticipos.length+')':''}">💵</button>
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
    <div class="kpi"><div class="kpi-lbl">Costo Total Empresa</div><div class="kpi-val">${fmtC(totHab-totAFk+totPatronal)}</div>${totAFk?`<div style="font-size:10px;color:var(--mt)">sin asignación familiar (${fmtC(totAFk)}), que se compensa</div>`:''}</div>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">TRABAJADOR</th><th style="text-align:right">HABERES</th><th style="text-align:right">AFP</th><th style="text-align:right">SALUD</th><th style="text-align:right">CESANTÍA</th><th style="text-align:right">IUSC</th><th style="text-align:right">LÍQUIDO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTALES (${S.trabajadores.length})</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totHab)}</td><td colspan="4"></td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(totLiq)}</td><td></td></tr></tfoot>
  </table></div></div>
  <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-p" onclick="generarAsientoRemuneraciones()">📝 Generar asiento de remuneraciones</button>
    <button class="btn btn-i" onclick="pdfLiquidacionesMasivo()" title="Un PDF con la liquidación de cada trabajador, una por hoja">📄 PDF liquidaciones (masivo)</button>
    <span style="font-size:11px;color:var(--mt)">Crea el asiento mensual: sueldos a gasto, cotizaciones e impuesto a pasivos, líquido por pagar.</span>
  </div>
  ${conAusencias?`<div class="info-tip" style="font-size:11px;margin-top:10px">📅 ${conAusencias} trabajador(es) con días no pagados en ${MESES[mesRemSel()-1]}. Revisa el detalle en la pestaña Asistencia.</div>`:''}
  <div style="margin-top:8px;font-size:10px;color:var(--mt)">Cálculo con UF ${fmtC(uf)} y UTM ${fmtC(utm)}. Topes: AFP/salud 90 UF, cesantía 135,2 UF. Referencial — verifica en Previred antes de declarar.</div>`;
}
// Membrete con los datos de la empresa (V2.21.48), a la izquierda
function membreteEmpresa(){
  const E=S.empresa||{};
  const lugar=[...new Set([E.comuna,E.ciudad].map(x=>String(x||'').trim()).filter(Boolean))].join(', ');
  return `<div class="memb">
    <div class="memb-nom">${E.nombre||''}</div>
    ${E.rut?`<div>RUT ${E.rut}</div>`:''}
    ${E.giro?`<div>${E.giro}</div>`:''}
    ${E.domicilio||lugar?`<div>${[E.domicilio,lugar].filter(Boolean).join(', ')}</div>`:''}
  </div>`;
}
// HTML de la liquidación de un trabajador. opts: {mes, botones}
function htmlLiquidacion(t,opts={}){
  const uf=getUF(),utm=getUTM();
  const mesN=opts.mes||mesRemSel(),mes=MESES[mesN-1];
  const l=liquidacionMes(t,uf,utm,mesN);
  const a=l.asis;
  const E=S.empresa||{};
  const P=remParams();
  // V2.21.43 — Formato tradicional · V2.21.48 — membrete, AFP con % del trabajador,
  // días trabajados y líquido en palabras
  const n=v=>Math.round(+v||0).toLocaleString('es-CL');
  const pct=v=>(+v||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  const fFecha=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
  const hoy=new Date();const fecha=`${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;
  const comision=+(afpInfo(t.afp).comision||0);
  const pctTrab=(P.tasaAFP!=null?+P.tasaAFP*100:10)+comision;   // remParams entrega la tasa en fracción (0,10)
  const esIsapre=t.salud&&t.salud!=='fonasa';
  const pctSalud=((P.tasaSalud!=null?+P.tasaSalud*100:7)).toLocaleString('es-CL',{maximumFractionDigits:2})+'%';   // remParams entrega fracción (0,07)
  const diasTrab=a?a.diasPagados:30;
  const fila=(lbl,val,cls='')=>`<div class="liq2-f ${cls}"><span>${lbl}</span><span>${val===null?'':n(val)}</span></div>`;
  const descLegales=l.saludLegal+l.descAFP+l.adicionalIsapre+l.descCesantia+(l.descTrabPesado||0)+l.iusc;
  const palabras=numeroALetras(l.liquido);
  return `<div class="card liq-print liq2" style="max-width:760px;margin:0 auto">
    ${membreteEmpresa()}
    <div class="liq2-tit">LIQUIDACIÓN DE REMUNERACIONES<div>${mes} - ${S.empresa.anio}</div></div>

    <div class="liq2-box">
      <div class="liq2-emp"><div><span class="liq2-k">Empleador:</span> <b>${E.nombre||''}</b></div><div><span class="liq2-k">RUT:</span> <b>${E.rut||''}</b></div></div>
      <div class="liq2-cab">
        <div>
          <div><span class="liq2-k">Trabajador/a:</span> <b>${String(t.nombre||'').toUpperCase()}</b></div>
          <div><span class="liq2-k">RUT:</span> <b>${t.rut||''}</b></div>
          ${t.centroCosto?`<div><span class="liq2-k">C. Costo:</span> <b>${t.centroCosto}</b></div>`:''}
          <div><span class="liq2-k">Cargo:</span> <b>${String(t.cargo||'').toUpperCase()}</b></div>
          <div><span class="liq2-k">Incorporación:</span> <b>${fFecha(t.lre&&t.lre.fechaInicio)}</b></div>
          <div><span class="liq2-k">Días trabajados:</span> <b>${diasTrab}</b></div>
        </div>
        <div style="text-align:right">
          <div><span class="liq2-k">${esIsapre?'ISAPRE':'SALUD'}:</span> <b>${esIsapre?l.saludNm.replace(/^Isapre\s+/i,''):'Fonasa'}</b>${esIsapre&&l.planUF?` &nbsp; <span class="liq2-k">Plan:</span> <b>UF ${(+l.planUF).toLocaleString('es-CL',{maximumFractionDigits:4})}</b>`:''}</div>
          <div><span class="liq2-k">AFP:</span> <b>${l.afpNm.replace(/^AFP\s+/i,'')}</b> &nbsp; <b>${pct(pctTrab)}</b></div>
          <div><span class="liq2-k">Cargas:</span> <b>${l.af?l.af.cargas.total:0}</b>${l.af&&l.af.cargas.total?` <span class="liq2-k">Tramo</span> <b>${l.af.tramo}</b>`:''}</div>
        </div>
      </div>
    </div>


    <div class="liq2-cols">
      <div>
        <div class="liq2-h">HABERES</div>
        ${fila('Imponible',l.totalImponible,'liq2-sub')}
        ${fila(l.porHora?`Sueldo por horas (${l.horas||0} h)`:'Sueldo Base',l.base,'liq2-in')}
        ${l.grat?fila(l.gratModo==='pct'?'Gratificación legal':'Gratificación',l.grat,'liq2-in'):''}
        ${l.otros?fila('Otros imponibles',l.otros,'liq2-in'):''}
        ${fila('No imponible',l.totalNoImponible,'liq2-sub')}
        ${l.movilizacion?fila('Movilización',l.movilizacion,'liq2-in'):''}
        ${l.colacion?fila('Colación',l.colacion,'liq2-in'):''}
        ${l.asigFamiliar?fila(`Asignación familiar (${l.af.cargas.total} carga${l.af.cargas.total>1?'s':''})`,l.asigFamiliar,'liq2-in'):''}
      </div>
      <div>
        <div class="liq2-h">DESCUENTOS</div>
        ${fila('Descuentos Legales',descLegales,'liq2-sub')}
        ${fila(`Salud ${esIsapre?'Isapre':'Fonasa'} (${pctSalud})`,l.saludLegal,'liq2-in')}
        ${fila(`AFP (${pct(pctTrab)})`,l.descAFP,'liq2-in')}
        ${esIsapre&&l.adicionalIsapre?fila(`Adicional Isapre (plan UF ${(+l.planUF).toLocaleString('es-CL',{maximumFractionDigits:4})})`,l.adicionalIsapre,'liq2-in'):''}
        ${l.descCesantia?fila('Seguro de cesantía (trabajador)',l.descCesantia,'liq2-in'):''}
        ${l.descTrabPesado?fila(`Cotización trabajo ${l.califPesado==='pesado'?'pesado':'menos pesado'} (${String(l.tasasTP.trab).replace('.',',')}%)`,l.descTrabPesado,'liq2-in'):''}
        ${l.iusc?fila('Impuesto único',l.iusc,'liq2-in'):''}
        ${l.anticipo?fila('Otros Descuentos',l.anticipo,'liq2-sub'):''}
        ${(l.anticipos||[]).map(a=>fila(`Anticipo ${fFecha(a.fecha).slice(0,5)}${a.motivo?' · '+String(a.motivo).replace(/</g,'&lt;'):''}`,a.monto,'liq2-in')).join('')}
      </div>
    </div>
    <div class="liq2-cols liq2-tot">
      <div><b>TOTAL HABERES:</b> &nbsp; ${n(l.totalHaberes)}</div>
      <div><b>TOTAL DESCUENTOS:</b> &nbsp; ${n(l.totalDescuentos)}</div>
    </div>
    <div class="liq2-pagar"><b>TOTAL A PAGAR:</b><b>${n(l.liquido)}</b></div>
    <div class="liq2-palabras">Son: ${palabras.charAt(0).toUpperCase()+palabras.slice(1)}.</div>
    ${a&&!a.completo?`<div class="liq2-nota">Días pagados: ${a.diasPagados} de 30${[a.diasLicencia?a.diasLicencia+' de licencia':'',a.diasPermisoSin?a.diasPermisoSin+' de permiso sin goce':'',a.diasAusencia?a.diasAusencia+' de ausencia':'',a.diasFueraContrato?a.diasFueraContrato+' fuera de contrato':''].filter(Boolean).map(x=>' · '+x).join('')}</div>`:''}

    <div class="liq2-fecha">Fecha: ${fecha}</div>
    <div class="liq2-cert">Certifico que he recibido de ${E.nombre||'mi empleador'} a mi entera satisfacción el saldo indicado en la presente liquidación, no teniendo cargo ni cobro alguno posteriores que hacer.</div>
    <div class="liq2-firmas">
      <div><div class="liq2-linea"></div>Recibí conforme<div class="liq2-firma-sub">${t.nombre||''}${t.rut?' · '+t.rut:''}</div></div>
      <div><div class="liq2-linea"></div>${E.nombre||'Empleador'}<div class="liq2-firma-sub">${E.rut?'RUT '+E.rut:''}</div></div>
    </div>
    ${opts.botones?`<div class="no-print liq2-btns" style="margin-top:14px;text-align:right"><button class="btn btn-g" onclick="renderRemuneraciones()">← Volver</button> <button class="btn btn-g" onclick="imprimirLiquidacion()">🖨️ Imprimir</button> <button class="btn btn-p" onclick="pdfLiquidacion('${t.id}')">📄 PDF</button></div>`:''}
  </div>`;
}
function verLiquidacion(id){
  const t=S.trabajadores.find(x=>x.id===id);if(!t)return;
  document.getElementById('rem-content').innerHTML=htmlLiquidacion(t,{botones:true});
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

// V2.21.53 — Impresión de la sección Remuneraciones: hoja carta horizontal,
// sólo el contenido de la pestaña abierta (sin parámetros ni formularios) y
// reducido lo necesario para que el ancho completo de las tablas quepa en la
// hoja. Una liquidación o un finiquito abiertos usan su propio formato.
function imprimirRemuneraciones(){
  const c=document.getElementById('rem-content');if(!c){window.print();return;}
  if(c.querySelector('.liq-print'))return imprimirLiquidacion();
  if(c.querySelector('.fin-doc')&&window.imprimirFiniquito)return window.imprimirFiniquito();
  const MM=96/25.4, anchoUtil=(279.4-20)*MM;      // carta horizontal, márgenes de 10 mm
  // Ancho natural del contenido, con las tablas desplegadas sin scroll
  c.classList.add('rem-midiendo');
  const ancho=Math.max(c.scrollWidth,...[...c.querySelectorAll('table')].map(t=>t.scrollWidth+24));
  c.classList.remove('rem-midiendo');
  const escala=Math.max(0.45,Math.min(1,anchoUtil/Math.max(1,ancho)));
  document.documentElement.style.setProperty('--rem-zoom',escala.toFixed(3));
  let st=document.getElementById('print-rem-page');
  if(!st){st=document.createElement('style');st.id='print-rem-page';document.head.appendChild(st);}
  st.textContent='@page{size:letter landscape;margin:10mm}';
  document.body.classList.add('print-rem');
  const limpiar=()=>{document.body.classList.remove('print-rem');document.documentElement.style.removeProperty('--rem-zoom');
    const x=document.getElementById('print-rem-page');if(x)x.remove();window.removeEventListener('afterprint',limpiar);};
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
  let totSueldo=0,totColMov=0,totAFP=0,totSalud=0,totCes=0,totIusc=0,totLiq=0,totPatronal=0,totAF=0,totTP=0,totAnt=0;
  S.trabajadores.forEach(t=>{
    const l=liquidacionMes(t,uf,utm,mesNum);
    totSueldo+=l.totalImponible;totColMov+=l.totalNoImponible-(l.asigFamiliar||0);totAF+=l.asigFamiliar||0;totTP+=l.descTrabPesado||0;
    totAFP+=l.descAFP;totSalud+=l.descSalud;totCes+=l.descCesantia;totIusc+=l.iusc;totLiq+=l.liquido;totAnt+=l.anticipo||0;
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
  const totPrev=totAFP+totSalud+totCes+totTP;
  if(totPrev)movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:0,haber:totPrev,desc:'Instituciones previsionales por pagar'});
  // Asignación familiar: se paga al trabajador y se descuenta de las cotizaciones
  // a enterar, por eso rebaja las instituciones previsionales por pagar.
  if(totAF)movs.push({cd:'2104001',nm:pdcNm('2104001'),debe:totAF,haber:0,desc:'Asignación familiar compensada'});
  if(totIusc)movs.push({cd:'2104002',nm:pdcNm('2104002'),debe:0,haber:totIusc,desc:'Impuesto único por pagar'});
  // V2.21.63: los anticipos descontados rebajan la cuenta de anticipos (activo)
  if(totAnt)movs.push({cd:'1106001',nm:pdcNm('1106001'),debe:0,haber:totAnt,desc:'Anticipos descontados en liquidación'});
  movs.push({cd:'2104005',nm:pdcNm('2104005'),debe:0,haber:totLiq,desc:'Líquidos por pagar'});
  // Aporte patronal: es GASTO de la empresa (no se descuenta al trabajador),
  // con contrapartida en instituciones previsionales por pagar.
  if(totPatronal>0){
    movs.push({cd:'3201013',nm:pdcNm('3201013'),debe:totPatronal,haber:0,desc:'Aporte patronal (SIS, mutual, AFC'+(totTP?', trabajo pesado':'')+')'});
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


export {imprimirRemuneraciones, htmlLiquidacion, membreteEmpresa, mesRemSel, rentaMinimaDe, cargasFamiliares, asignacionFamiliar, ingresoSemestreAnterior, remParams, IUSC_TABLA, calcularIUSC, getUF, getUTM, calcularLiquidacion, liquidacionMes, onTipoPagoChange, imprimirLiquidacion, sugerirNombresPrevired, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, onGratModoChange, gratificacionModo, leerFormTrabajador, leerLRETrabajador, cargarLREForm, previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador, onParamRem, renderRemuneraciones, verLiquidacion, generarAsientoRemuneraciones, refrescarAsientosDesdeNube, REMF};
