// finiquitos.js — V2.21.44 · Finiquitos de contrato de trabajo
// V2.21.45 · Asiento contable del finiquito (un asiento activo por finiquito)
//
// Normativa considerada (Código del Trabajo):
//  - Art. 159, 160 y 161: causales de término.
//  - Art. 162: aviso con 30 días de anticipación en el Art. 161, o pago de la
//    indemnización sustitutiva (una remuneración mensual). Cotizaciones
//    pagadas hasta el último día del mes anterior al despido.
//  - Art. 163: indemnización por años de servicio (Art. 161): 30 días de la
//    última remuneración por cada año y fracción superior a seis meses, con
//    un máximo de 330 días (11 años). Requiere un año o más de contrato.
//  - Art. 172: la última remuneración mensual incluye toda cantidad que el
//    trabajador perciba por sus servicios (con colación y movilización) y
//    excluye pagos esporádicos. Tope de 90 UF.
//  - Art. 73: feriado pendiente y proporcional. Los días hábiles se convierten
//    a días corridos (se suman sábados, domingos y festivos del período) y se
//    pagan con la remuneración íntegra diaria.
//  - Art. 13 Ley 19.728: en el Art. 161 se puede descontar de la indemnización
//    por años de servicio el aporte del empleador a la cuenta individual de
//    cesantía (1,6% en contrato indefinido).
//  - Art. 177: el finiquito se ratifica ante ministro de fe (notario,
//    inspector del trabajo, etc.) o en forma electrónica en la DT.
//  - Art. 178: las indemnizaciones por término no son imponibles ni tributables.
//
// Los textos se arman con plantillas editables con marcadores {{campo}}.
// Hay plantillas tipo por causal y se pueden crear propias, escribiéndolas o
// subiendo un archivo (.txt, .docx, .html, .md).

import {toast, fmtC, pdcNm, PDC, rutParse} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {calcularLiquidacion, getUF, getUTM, refrescarAsientosDesdeNube} from './remuneraciones.js';
import {puedeOperarFecha, persistirAsientosCritico} from './contabilidad-v2.js';
import {numeroMostrar} from './correlativo-contable.js';
import {reglaCuenta, validarMovimientosPDC} from './pdc-reglas.js';
import {buildMayor} from './reportes.js';
import {saldoVacaciones, esFeriado, mesesEntre} from './vacaciones.js';
import {asistenciaMes} from './asistencia.js';
import './storage.js';

// ── Causales ──
const CAUSALES=[
  {k:'159-1',nm:'Mutuo acuerdo de las partes',art:'artículo 159 N° 1',plantilla:'mutuo'},
  {k:'159-2',nm:'Renuncia voluntaria del trabajador',art:'artículo 159 N° 2',plantilla:'renuncia',aviso:'renuncia'},
  {k:'159-4',nm:'Vencimiento del plazo convenido en el contrato',art:'artículo 159 N° 4',plantilla:'plazo'},
  {k:'159-5',nm:'Conclusión del trabajo o servicio que dio origen al contrato',art:'artículo 159 N° 5',plantilla:'obra'},
  {k:'159-6',nm:'Caso fortuito o fuerza mayor',art:'artículo 159 N° 6',plantilla:'generica',hechos:true},
  {k:'160',nm:'Conducta del trabajador (Art. 160)',art:'artículo 160',plantilla:'generica',hechos:true,numeral:true},
  {k:'161-1',nm:'Necesidades de la empresa, establecimiento o servicio',art:'artículo 161 inciso primero',plantilla:'necesidades',ias:true,aviso:'despido',hechos:true},
  {k:'161-2',nm:'Desahucio escrito del empleador',art:'artículo 161 inciso segundo',plantilla:'desahucio',ias:true,aviso:'despido'},
];
const NUMERALES_160=[
  ['1a','N° 1 letra a)','falta de probidad del trabajador en el desempeño de sus funciones'],
  ['1b','N° 1 letra b)','conductas de acoso sexual'],['1c','N° 1 letra c)','vías de hecho ejercidas por el trabajador'],
  ['1d','N° 1 letra d)','injurias proferidas por el trabajador al empleador'],['1e','N° 1 letra e)','conducta inmoral del trabajador que afecte a la empresa'],
  ['1f','N° 1 letra f)','conductas de acoso laboral'],['2','N° 2','negociaciones que ejecute el trabajador dentro del giro del negocio y que hubiesen sido prohibidas por escrito en el contrato'],
  ['3','N° 3','no concurrencia del trabajador a sus labores sin causa justificada'],['4a','N° 4 letra a)','abandono del trabajo'],
  ['4b','N° 4 letra b)','negativa a trabajar sin causa justificada en las faenas convenidas'],['5','N° 5','actos, omisiones o imprudencias temerarias que afecten la seguridad'],
  ['6','N° 6','perjuicio material causado intencionalmente en las instalaciones, maquinarias, herramientas o mercaderías'],
  ['7','N° 7','incumplimiento grave de las obligaciones que impone el contrato'],
];
const causalInfo=k=>CAUSALES.find(c=>c.k===k)||CAUSALES[1];
const TOPE_UF_ART172=90, MAX_ANIOS_IAS=11, TASA_AFC_CIC_EMPLEADOR=0.016, INICIO_AFC='2002-10-01';

// ── Plantillas tipo ──
const ENCABEZADO=`FINIQUITO DE CONTRATO DE TRABAJO

En {{ciudad}}, a {{fecha_finiquito}}, entre {{empresa}}, RUT {{rut_empresa}}, representada por {{representante}}, RUT {{rut_representante}}, ambos con domicilio en {{domicilio_empresa}}, en adelante "el empleador", y don(ña) {{trabajador}}, RUT {{rut_trabajador}}, en adelante "el trabajador", se deja constancia del siguiente finiquito:

PRIMERO: El trabajador prestó servicios al empleador en el cargo de {{cargo}}, desde el {{fecha_inicio}} hasta el {{fecha_termino}}, fecha en que terminó su contrato de trabajo por la causal de {{causal}}, {{causal_articulo}} del Código del Trabajo.`;
const PAGO=`TERCERO: El trabajador declara recibir en este acto, a su entera satisfacción, la suma de {{total}} ({{total_palabras}}), mediante {{forma_pago}}, según el siguiente detalle:

{{detalle}}`;
const COTIZ=`CUARTO: El empleador declara, y el trabajador lo reconoce, que las cotizaciones previsionales y de seguridad social del trabajador se encuentran íntegramente pagadas hasta el último día del mes anterior al término del contrato, lo que se acredita con los certificados de las instituciones respectivas, conforme al artículo 162 del Código del Trabajo.`;
const RENUNCIA_DERECHOS=`QUINTO: El trabajador declara que durante todo el tiempo que prestó servicios recibió oportunamente el total de las remuneraciones, beneficios y demás prestaciones convenidas, y que nada se le adeuda por concepto de remuneraciones, horas extraordinarias, feriados, gratificaciones, cotizaciones previsionales, indemnizaciones ni por ningún otro concepto, legal o contractual. En consecuencia, otorga al empleador el más amplio, total y completo finiquito, declarando que no tiene reclamo ni cargo alguno que formular.`;
const CIERRE=`SEXTO: El presente finiquito se firma en dos ejemplares, quedando uno en poder de cada parte, y será ratificado por el trabajador ante un ministro de fe, conforme al artículo 177 del Código del Trabajo.`;
const armar=segundo=>[ENCABEZADO,segundo,PAGO,COTIZ,RENUNCIA_DERECHOS,CIERRE].join('\n\n');

const PLANTILLAS_TIPO=[
  {id:'renuncia',nombre:'Renuncia voluntaria (Art. 159 N° 2)',causal:'159-2',texto:armar(
`SEGUNDO: El término del contrato se produjo por la renuncia voluntaria del trabajador, presentada por escrito al empleador con fecha {{fecha_aviso}}.`)},
  {id:'mutuo',nombre:'Mutuo acuerdo (Art. 159 N° 1)',causal:'159-1',texto:armar(
`SEGUNDO: Las partes, de común acuerdo, han decidido poner término al contrato de trabajo que las vinculaba a contar de la fecha indicada en la cláusula anterior.`)},
  {id:'plazo',nombre:'Vencimiento del plazo (Art. 159 N° 4)',causal:'159-4',texto:armar(
`SEGUNDO: El contrato de trabajo, celebrado a plazo fijo, terminó por el vencimiento del plazo convenido por las partes, lo que fue comunicado al trabajador por escrito.`)},
  {id:'obra',nombre:'Conclusión de la obra o servicio (Art. 159 N° 5)',causal:'159-5',texto:armar(
`SEGUNDO: El contrato de trabajo terminó por la conclusión del trabajo o servicio que le dio origen, lo que fue comunicado al trabajador por escrito.`)},
  {id:'necesidades',nombre:'Necesidades de la empresa (Art. 161)',causal:'161-1',texto:armar(
`SEGUNDO: El empleador puso término al contrato de trabajo por necesidades de la empresa, fundado en los siguientes hechos: {{hechos}}. La carta de aviso fue entregada al trabajador con fecha {{fecha_aviso}}, con copia a la Inspección del Trabajo.`)},
  {id:'desahucio',nombre:'Desahucio del empleador (Art. 161 inc. 2°)',causal:'161-2',texto:armar(
`SEGUNDO: El empleador puso término al contrato de trabajo mediante desahucio escrito, comunicado al trabajador con fecha {{fecha_aviso}}, atendido que el trabajador desempeñaba un cargo de exclusiva confianza con facultades generales de administración.`)},
  {id:'generica',nombre:'Genérica (cualquier causal)',causal:'',texto:armar(
`SEGUNDO: El término del contrato se fundamenta en los siguientes hechos: {{hechos}}. La comunicación de término fue entregada al trabajador con fecha {{fecha_aviso}}.`)},
];

const MARCADORES=[
  ['empresa','Razón social del empleador'],['rut_empresa','RUT del empleador'],['domicilio_empresa','Domicilio del empleador'],
  ['representante','Representante legal'],['rut_representante','RUT del representante'],['ciudad','Ciudad de firma'],
  ['trabajador','Nombre del trabajador'],['rut_trabajador','RUT del trabajador'],['cargo','Cargo'],
  ['fecha_inicio','Fecha de inicio del contrato'],['fecha_termino','Fecha de término'],['fecha_finiquito','Fecha del finiquito (en palabras)'],
  ['fecha_aviso','Fecha de la carta de aviso o renuncia'],['causal','Causal de término'],['causal_articulo','Artículo de la causal'],
  ['hechos','Hechos que fundamentan la causal'],['antiguedad','Antigüedad (años y meses)'],['dias_feriado','Días de feriado pagados (corridos)'],
  ['anios_indemnizacion','Años pagados de indemnización'],['ultima_remuneracion','Última remuneración (Art. 172)'],
  ['total','Total a pagar'],['total_palabras','Total en palabras'],['forma_pago','Forma de pago'],['detalle','Tabla con el detalle de montos'],
];

// ── Estado ──
function datos(){
  if(!S.finiquitos||typeof S.finiquitos!=='object'||Array.isArray(S.finiquitos))S.finiquitos={items:[],plantillas:[]};
  if(!Array.isArray(S.finiquitos.items))S.finiquitos.items=[];
  if(!Array.isArray(S.finiquitos.plantillas))S.finiquitos.plantillas=[];
  return S.finiquitos;
}
async function cargarFiniquitos(){
  try{const r=await window.storage.get('finiquitos');if(r&&r.value){const p=JSON.parse(r.value);if(p&&typeof p==='object'&&!Array.isArray(p))S.finiquitos=p;}}
  catch(e){}
  return datos();
}
async function guardarDatos(){
  const r=await window.storage.set('finiquitos',JSON.stringify(datos()));
  return !(r&&r.ok===false);
}
// Plantillas disponibles: las tipo (con su versión editada si existe) + las propias
function plantillas(){
  const D=datos();
  const tipo=PLANTILLAS_TIPO.map(p=>{const ed=D.plantillas.find(x=>x.id===p.id);return ed?{...p,...ed,tipo:true,editada:true}:{...p,tipo:true};});
  const propias=D.plantillas.filter(x=>!PLANTILLAS_TIPO.some(p=>p.id===x.id)).map(x=>({...x,tipo:false}));
  return [...tipo,...propias];
}
const plantillaPorId=id=>plantillas().find(p=>p.id===id)||null;

// ── Fechas ──
const esFecha=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const dUTC=s=>new Date(s+'T00:00:00Z');
const isoU=d=>d.toISOString().slice(0,10);
const sumarDias=(s,n)=>{const d=dUTC(s);d.setUTCDate(d.getUTCDate()+n);return isoU(d);};
const sumarMeses=(s,n)=>{const [y,m,d]=s.split('-').map(Number);const fin=new Date(Date.UTC(y,m-1+n+1,0)).getUTCDate();return isoU(new Date(Date.UTC(y,m-1+n,Math.min(d,fin))));};
const diasEntre=(a,b)=>Math.round((dUTC(b)-dUTC(a))/86400000);
const MESES_L=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fechaLarga=s=>{if(!esFecha(s))return '';const [y,m,d]=s.split('-').map(Number);return `${d} de ${MESES_L[m-1]} de ${y}`;};
const fechaCorta=s=>esFecha(s)?s.split('-').reverse().join('/'):'';
const esHabil=s=>{const w=dUTC(s).getUTCDay();return w>=1&&w<=5&&!esFeriado(s);};

// Días hábiles de feriado → días corridos, contados desde el día siguiente al
// término. Los sábados, domingos y festivos que caen dentro se suman.
function habilesACorridos(fechaTermino,habiles){
  let entero=Math.floor(+habiles||0);const frac=+((+habiles||0)-entero).toFixed(4);
  let d=fechaTermino,corridos=0,inhabiles=0;
  let guard=0;
  while(entero>0&&guard<4000){d=sumarDias(d,1);corridos++;if(esHabil(d))entero--;else inhabiles++;guard++;}
  return {corridos:+(corridos+frac).toFixed(2),inhabiles,hasta:corridos?d:fechaTermino};
}

// Antigüedad: años, meses y días completos desde el inicio hasta el término (inclusive)
function antiguedad(inicio,termino){
  const meses=mesesEntre(inicio,termino);
  const ancla=sumarMeses(inicio,meses);
  const dias=Math.max(0,diasEntre(ancla,sumarDias(termino,1)));
  return {anios:Math.floor(meses/12),meses:meses%12,mesesTot:meses,dias};
}
// Años de indemnización (Art. 163): años completos + 1 si la fracción supera seis meses
function aniosIndemnizacion(inicio,termino){
  const a=antiguedad(inicio,termino);
  if(a.mesesTot<12)return {anios:0,motivo:'Menos de un año de contrato: no corresponde indemnización por años de servicio (Art. 163).',a};
  const fraccionMayor6=a.meses>6||(a.meses===6&&a.dias>0);
  const anios=a.anios+(fraccionMayor6?1:0);
  return {anios:Math.min(MAX_ANIOS_IAS,anios),topeAplicado:anios>MAX_ANIOS_IAS,fraccionMayor6,a};
}

// ── Cálculo ──
// inp: {fechaTermino, causal, fechaAviso, uf, incGrat, incColacion, incMovilizacion,
//       baseManual, incMesTermino, montoMesTermino, diasFeriadoManual, aniosManual,
//       afcManual, haberesExtra:[{d,m}], descuentosExtra:[{d,m}]}
function calcularFiniquito(t,inp){
  const avisos=[];
  const c=causalInfo(inp.causal);
  const inicio=t.lre&&t.lre.fechaInicio;
  const termino=inp.fechaTermino;
  if(!esFecha(inicio))return {ok:false,motivo:'Falta la fecha de inicio del contrato en la ficha del trabajador.'};
  if(!esFecha(termino))return {ok:false,motivo:'Indica la fecha de término.'};
  if(termino<inicio)return {ok:false,motivo:'La fecha de término es anterior al inicio del contrato.'};
  const uf=+inp.uf||getUF(), utm=getUTM();
  const t2={...t,lre:{...(t.lre||{}),fechaTermino:termino}};
  const full=calcularLiquidacion(t2,uf,utm);       // mes completo, sin asistencia
  const ant=antiguedad(inicio,termino);

  // Remuneraciones de referencia
  const remIntegra=full.base+full.otros+(inp.incGrat!==false?full.grat:0);
  const r172Calc=full.base+full.otros+(inp.incGrat!==false?full.grat:0)
    +(inp.incColacion!==false?full.colacion:0)+(inp.incMovilizacion!==false?full.movilizacion:0);
  const ultimaRem=num(inp.baseManual)!=null?num(inp.baseManual):r172Calc;
  const tope90=Math.round(TOPE_UF_ART172*uf);
  const baseIndem=Math.min(ultimaRem,tope90);
  if(ultimaRem>tope90)avisos.push(`La última remuneración (${fmtC(ultimaRem)}) supera el tope de 90 UF: las indemnizaciones se calculan con ${fmtC(tope90)} (Art. 172).`);

  const lineas=[], desc=[];
  // 1. Remuneración pendiente del mes de término
  let mesTerm=null;
  if(inp.incMesTermino){
    const [y,m]=termino.split('-').map(Number);
    const asis=asistenciaMes(t2,y,m);
    const l=calcularLiquidacion(t2,uf,utm,asis);
    const monto=num(inp.montoMesTermino)!=null?num(inp.montoMesTermino):l.liquido;
    mesTerm={dias:asis?asis.diasPagados:30,liquido:l.liquido,monto};
    lineas.push({k:'mes',d:`Remuneración líquida pendiente (${mesTerm.dias} día(s) de ${MESES_L[m-1]})`,m:monto});
  }
  // 2. Feriado pendiente y proporcional (Art. 73)
  const s=saldoVacaciones(t2,termino);
  let habiles=0,habilesCalc=0,fraccion=0;
  if(s.ok){
    fraccion=+((Math.min(30,ant.dias)/30)*(s.anual/12)).toFixed(2);
    habilesCalc=Math.max(0,+(s.saldo+fraccion).toFixed(2));
    if(s.saldo<0)avisos.push(`El trabajador tiene ${String(Math.abs(s.saldo)).replace('.',',')} día(s) de vacaciones tomados en exceso. No se descuentan automáticamente: agrégalos como descuento si corresponde.`);
  }else avisos.push('Feriado: '+s.motivo);
  habiles=num(inp.diasFeriadoManual)!=null?Math.max(0,num(inp.diasFeriadoManual)):habilesCalc;
  const conv=habilesACorridos(termino,habiles);
  const diario=remIntegra/30;
  const montoFeriado=Math.round(diario*conv.corridos);
  if(montoFeriado>0)lineas.push({k:'feriado',d:`Feriado pendiente y proporcional (${fmtN(habiles)} días hábiles = ${fmtN(conv.corridos)} días corridos)`,m:montoFeriado,exento:true});

  // 3. Indemnización sustitutiva del aviso previo (Art. 161 y 162)
  let diasAviso=null,sustitutiva=0;
  if(c.aviso==='despido'){
    diasAviso=esFecha(inp.fechaAviso)?diasEntre(inp.fechaAviso,termino):null;
    if(diasAviso==null||diasAviso<30){
      sustitutiva=baseIndem;
      lineas.push({k:'aviso',d:'Indemnización sustitutiva del aviso previo (Art. 161 y 162)',m:sustitutiva,exento:true});
    }
    if(diasAviso!=null&&diasAviso<0)avisos.push('La fecha de aviso es posterior a la de término.');
  }
  // 4. Indemnización por años de servicio (Art. 163)
  let ias=0,iasInfo=null;
  if(c.ias){
    iasInfo=aniosIndemnizacion(inicio,termino);
    const anios=num(inp.aniosManual)!=null?Math.max(0,Math.floor(num(inp.aniosManual))):iasInfo.anios;
    iasInfo={...iasInfo,aniosPagados:anios};
    if(iasInfo.motivo&&!anios)avisos.push(iasInfo.motivo);
    if(iasInfo.topeAplicado)avisos.push(`Antigüedad mayor a 11 años: se aplica el máximo legal de 330 días (Art. 163).`);
    ias=anios*baseIndem;
    if(ias>0)lineas.push({k:'ias',d:`Indemnización por años de servicio (${anios} año(s) × ${fmtC(baseIndem)}, Art. 163)`,m:ias,exento:true});
  }
  // Haberes adicionales
  (inp.haberesExtra||[]).forEach(x=>{const m=Math.round(num(x.m)||0);if(m&&String(x.d||'').trim())lineas.push({k:'extra',d:String(x.d).trim(),m});});

  // Descuentos: aporte del empleador al seguro de cesantía (Art. 13 Ley 19.728)
  let afc=0,afcEstimado=0;
  if(ias>0){
    const contrato=t.contrato||'indefinido';
    if(contrato==='indefinido'){
      const desde=inicio>INICIO_AFC?inicio:INICIO_AFC;
      const meses=desde<=termino?mesesEntre(desde,termino):0;
      afcEstimado=Math.round(full.baseCes*TASA_AFC_CIC_EMPLEADOR*meses);
    }
    afc=num(inp.afcManual)!=null?Math.max(0,Math.round(num(inp.afcManual))):afcEstimado;
    afc=Math.min(afc,ias);
    if(afc>0)desc.push({k:'afc',d:'Aporte del empleador al seguro de cesantía (Art. 13 Ley 19.728)',m:afc});
  }
  (inp.descuentosExtra||[]).forEach(x=>{const m=Math.round(num(x.m)||0);if(m&&String(x.d||'').trim())desc.push({k:'extra',d:String(x.d).trim(),m});});

  const totalHaberes=lineas.reduce((a,x)=>a+x.m,0);
  const totalDescuentos=desc.reduce((a,x)=>a+x.m,0);
  const total=totalHaberes-totalDescuentos;
  if(total<0)avisos.push('Los descuentos superan los haberes: el total queda negativo.');
  return {ok:true,causal:c,inicio,termino,uf,ant,remIntegra,r172Calc,ultimaRem,tope90,baseIndem,
    feriado:{saldo:s.ok?s.saldo:null,fraccion,habilesCalc,habiles,corridos:conv.corridos,inhabiles:conv.inhabiles,hasta:conv.hasta,diario:Math.round(diario),monto:montoFeriado},
    mesTerm,diasAviso,sustitutiva,ias,iasInfo,afc,afcEstimado,lineas,desc,totalHaberes,totalDescuentos,total,avisos,full};
}
function num(v){if(v===null||v===undefined)return null;const s=String(v).trim();if(s==='')return null;const n=+s.replace(/\./g,'').replace(',','.');return isFinite(n)?n:null;}
const fmtN=n=>(+n||0).toLocaleString('es-CL',{maximumFractionDigits:2});

// ── Número a palabras (pesos chilenos) ──
const UNI=['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiún','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const DEC=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CEN=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
function cientos(n){ // 0..999
  if(n===0)return '';if(n===100)return 'cien';
  const c=Math.floor(n/100),r=n%100;
  let t=c?CEN[c]:'';
  if(r){
    let s;
    if(r<30)s=UNI[r];else{const d=Math.floor(r/10),u=r%10;s=DEC[d]+(u?' y '+UNI[u]:'');}
    t=(t?t+' ':'')+s;
  }
  return t;
}
function numeroALetras(n){
  n=Math.floor(Math.abs(+n||0));
  if(n===0)return 'cero pesos';
  const partes=[];
  const mm=Math.floor(n/1e12);n%=1e12;
  const millones=Math.floor(n/1e6),miles=Math.floor((n%1e6)/1000),resto=n%1000;
  if(mm)partes.push(mm===1?'un billón':cientosMiles(mm)+' billones');
  if(millones)partes.push(millones===1?'un millón':cientosMiles(millones)+' millones');
  if(miles)partes.push(miles===1?'mil':cientos(miles)+' mil');
  if(resto)partes.push(cientos(resto));
  let s=partes.join(' ');
  // "de pesos" tras millón/millones exactos
  if(!miles&&!resto&&(millones||mm))s+=' de';
  return s+(s==='un'?' peso':' pesos');
}
function cientosMiles(n){ // 1..999999 (para millones)
  const m=Math.floor(n/1000),r=n%1000;
  return [(m?(m===1?'mil':cientos(m)+' mil'):''),cientos(r)].filter(Boolean).join(' ');
}

// ── Texto del finiquito ──
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function valoresMarcadores(f,t,r){
  const E=S.empresa||{};const c=causalInfo(f.causal);
  const n160=c.numeral?NUMERALES_160.find(x=>x[0]===f.numeral160):null;
  const causalTxt=n160?n160[2]:c.nm.toLowerCase();
  const art=n160?`artículo 160 ${n160[1]}`:c.art;
  const ant=r&&r.ok?r.ant:null;
  return {
    empresa:E.nombre||'',rut_empresa:E.rut||'',domicilio_empresa:[...new Set([E.domicilio,E.comuna,E.ciudad].map(x=>String(x||'').trim()).filter(Boolean))].join(', '),
    representante:E.rep||'',rut_representante:E.rutrep||'',ciudad:f.ciudad||E.ciudad||E.comuna||'',
    trabajador:t?t.nombre:f.nombre||'',rut_trabajador:t?t.rut||'':f.rut||'',cargo:(t&&t.cargo)||'',
    fecha_inicio:fechaLarga(r&&r.inicio),fecha_termino:fechaLarga(f.fechaTermino),fecha_finiquito:fechaLarga(f.fecha||f.fechaTermino),
    fecha_aviso:fechaLarga(f.fechaAviso)||'[fecha de aviso]',causal:causalTxt,causal_articulo:art,
    hechos:(f.hechos||'').trim()||'[indicar los hechos]',
    antiguedad:ant?`${ant.anios} año(s) y ${ant.meses} mes(es)`:'',
    dias_feriado:r&&r.ok?fmtN(r.feriado.corridos):'',
    anios_indemnizacion:r&&r.ok&&r.iasInfo?String(r.iasInfo.aniosPagados):'0',
    ultima_remuneracion:r&&r.ok?fmtC(r.ultimaRem):'',
    total:r&&r.ok?fmtC(r.total):'',total_palabras:r&&r.ok?numeroALetras(r.total):'',
    forma_pago:(f.formaPago||'').trim()||'transferencia electrónica',
  };
}
function tablaDetalle(r){
  if(!r||!r.ok)return '';
  const fila=(d,m,cls='')=>`<tr class="${cls}"><td>${esc(d)}</td><td class="fin-m">${fmtC(m)}</td></tr>`;
  return `<table class="fin-det">
    <tr class="fin-det-h"><td colspan="2">HABERES</td></tr>
    ${r.lineas.map(x=>fila(x.d,x.m)).join('')||fila('Sin haberes',0)}
    <tr class="fin-det-t">${'<td>Total haberes</td><td class="fin-m">'+fmtC(r.totalHaberes)+'</td>'}</tr>
    ${r.desc.length?`<tr class="fin-det-h"><td colspan="2">DESCUENTOS</td></tr>${r.desc.map(x=>fila(x.d,x.m)).join('')}<tr class="fin-det-t"><td>Total descuentos</td><td class="fin-m">${fmtC(r.totalDescuentos)}</td></tr>`:''}
    <tr class="fin-det-tot"><td>TOTAL A PAGAR</td><td class="fin-m">${fmtC(r.total)}</td></tr>
  </table>`;
}
function tablaTexto(r){
  if(!r||!r.ok)return '';
  return [...r.lineas.map(x=>`${x.d}: ${fmtC(x.m)}`),...r.desc.map(x=>`Menos ${x.d}: ${fmtC(x.m)}`),`Total a pagar: ${fmtC(r.total)}`].join('\n');
}
// Reemplaza marcadores. Los desconocidos quedan a la vista para que se noten.
function combinar(texto,vals){
  return String(texto||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(m,k)=>{k=k.toLowerCase();return k==='detalle'?m:(k in vals?vals[k]:m);});
}
// Texto → HTML: 1ª línea título, párrafos por línea en blanco, "PRIMERO:" en negrita,
// {{detalle}} solo en su párrafo → tabla.
function textoAHTML(texto,vals,r){
  const t=combinar(texto,vals);
  const bloques=t.replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  return bloques.map((b,i)=>{
    if(/^\{\{\s*detalle\s*\}\}$/i.test(b))return tablaDetalle(r);
    const b2=esc(b).replace(/\{\{\s*detalle\s*\}\}/gi,esc(tablaTexto(r))).replace(/\n/g,'<br>');
    if(i===0&&b.length<90&&b===b.toUpperCase())return `<div class="fin-tit">${b2}</div>`;
    return `<p>${b2.replace(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,30}:)/,'<b>$1</b>')}</p>`;
  }).join('');
}
function textoDe(f){
  if(f.texto&&String(f.texto).trim())return f.texto;
  const p=plantillaPorId(f.plantillaId)||plantillaPorId(causalInfo(f.causal).plantilla)||PLANTILLAS_TIPO[0];
  return p.texto;
}

// ── Lectura de archivos (.txt, .md, .html, .docx) ──
function cargarScript(src){
  return new Promise((ok,err)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>err(new Error('No se pudo cargar '+src));document.head.appendChild(s);});
}
async function leerArchivoTexto(file){
  const nm=(file.name||'').toLowerCase();
  if(nm.endsWith('.docx')){
    if(!window.mammoth)await cargarScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    const buf=await file.arrayBuffer();
    const r=await window.mammoth.extractRawText({arrayBuffer:buf});
    return limpiarTexto(r.value);
  }
  if(nm.endsWith('.doc'))throw new Error('El formato .doc antiguo no se puede leer. Guárdalo como .docx o .txt.');
  if(nm.endsWith('.pdf'))throw new Error('Los PDF no se pueden editar. Sube el texto en .docx o .txt.');
  let txt=await file.text();
  if(nm.endsWith('.html')||nm.endsWith('.htm')){
    const d=document.createElement('div');d.innerHTML=txt.replace(/<\/(p|div|h\d|li|tr)>/gi,'\n\n').replace(/<br\s*\/?>/gi,'\n');
    txt=d.textContent||'';
  }
  return limpiarTexto(txt);
}
const limpiarTexto=t=>String(t||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();

// ── Vista ──
let FV={modo:'lista',id:null,form:null,plantilla:null,editTexto:false};
const tabs=()=>window.tabsRemuneraciones?window.tabsRemuneraciones():'';
const trabajador=id=>(S.trabajadores||[]).find(x=>x.id===id)||null;
const hoyIso=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};

function renderFiniquitos(){
  const el=document.getElementById('rem-content');if(!el)return;
  datos();
  if(FV.modo==='form')return renderForm(el);
  if(FV.modo==='doc')return renderDoc(el);
  if(FV.modo==='plantillas')return renderPlantillas(el);
  const D=datos();
  const items=[...D.items].sort((a,b)=>String(b.fechaTermino).localeCompare(String(a.fechaTermino)));
  const filas=items.map(f=>`<tr>
      <td class="tl" style="font-size:12px">${esc(f.nombre)}<div style="font-size:10px;color:var(--mt)">${esc(f.rut||'')}</div></td>
      <td>${fechaCorta(f.fechaTermino)}</td>
      <td class="tl" style="font-size:11px">${esc(causalInfo(f.causal).nm)}<div style="font-size:10px;color:var(--mt)">${esc(causalInfo(f.causal).art)}</div></td>
      <td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(f.calc?.total||0)}</td>
      <td><span class="badge" style="font-size:10px;padding:2px 8px;border-radius:10px;background:${f.estado==='ratificado'?'rgba(63,185,80,.15);color:var(--ok,#3fb950)':'rgba(210,153,34,.15);color:var(--warn)'}">${f.estado==='ratificado'?'Ratificado':'Borrador'}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${(()=>{const a=asientoFiniquito(f.id);return a?'N° '+esc(numeroMostrar(a)||'?'):'<span style="color:var(--mt)">–</span>';})()}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-i" onclick="verFiniquito('${f.id}')" title="Ver e imprimir">📄</button>
        <button class="btn btn-i" onclick="editarFiniquito('${f.id}')" title="Editar">✏️</button>
        <button class="btn btn-d" onclick="eliminarFiniquito('${f.id}')" title="Eliminar">🗑</button>
      </td></tr>`).join('');
  el.innerHTML=tabs()+`
    <div class="info-tip" style="font-size:11px;margin-bottom:12px;line-height:1.6">
      📝 <strong>Finiquitos</strong>: calcula feriado pendiente y proporcional (Art. 73), indemnización sustitutiva del aviso previo y por años de servicio (Arts. 161 a 163, tope 90 UF y 11 años) y el descuento del aporte al seguro de cesantía (Art. 13 Ley 19.728).
      El pago y la ratificación ante ministro de fe o en el portal de la Dirección del Trabajo deben hacerse dentro de 10 días hábiles desde la separación (Art. 177).
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="nuevoFiniquito()">+ Nuevo finiquito</button>
      <button class="btn btn-g" onclick="verPlantillasFiniquito()">📑 Plantillas</button>
    </div>
    ${items.length?`<div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">TRABAJADOR</th><th>TÉRMINO</th><th class="tl">CAUSAL</th><th style="text-align:right">TOTAL</th><th>ESTADO</th><th>ASIENTO</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`
    :'<div class="empty"><div class="ei">📝</div>No hay finiquitos registrados.</div>'}`;
}

// ── Formulario ──
function formVacio(trabId){
  const t=trabajador(trabId)||(S.trabajadores||[])[0]||null;
  return {id:null,trab:t?t.id:'',fechaTermino:(t&&t.lre&&t.lre.fechaTermino)||hoyIso(),fecha:hoyIso(),causal:'159-2',numeral160:'',fechaAviso:'',
    hechos:'',uf:getUF(),incGrat:true,incColacion:true,incMovilizacion:true,baseManual:'',incMesTermino:false,montoMesTermino:'',
    diasFeriadoManual:'',aniosManual:'',afcManual:'',haberesExtra:[],descuentosExtra:[],formaPago:'transferencia electrónica',
    ciudad:(S.empresa||{}).ciudad||'',plantillaId:'',texto:'',actualizarFicha:true,codigoLRE:(t&&t.lre&&t.lre.causalTermino)||'',estado:'borrador'};
}
function nuevoFiniquito(trabId){
  if(!(S.trabajadores||[]).length){toast('⚠️ Registra trabajadores primero','e');return;}
  FV={modo:'form',id:null,form:formVacio(trabId),editTexto:false};renderFiniquitos();
}
function editarFiniquito(id){
  const f=datos().items.find(x=>x.id===id);if(!f)return;
  FV={modo:'form',id,form:JSON.parse(JSON.stringify(f)),editTexto:false};renderFiniquitos();
}
function volverFiniquitos(){ASF=null;FV={modo:'lista',id:null,form:null,editTexto:false};renderFiniquitos();}

const g=id=>document.getElementById(id);
function leerForm(){
  const f=FV.form;if(!f||!g('fin-trab'))return f;
  const v=id=>g(id)?.value??'';const ck=id=>!!g(id)?.checked;
  const trabAntes=f.trab;
  Object.assign(f,{trab:v('fin-trab'),fechaTermino:v('fin-termino'),fecha:v('fin-fecha'),causal:v('fin-causal'),numeral160:v('fin-numeral'),
    fechaAviso:v('fin-aviso'),hechos:v('fin-hechos'),uf:num(v('fin-uf'))||getUF(),incGrat:ck('fin-incgrat'),incColacion:ck('fin-inccol'),
    incMovilizacion:ck('fin-incmov'),baseManual:v('fin-base'),incMesTermino:ck('fin-incmes'),montoMesTermino:v('fin-montomes'),
    diasFeriadoManual:v('fin-feriado'),aniosManual:v('fin-anios'),afcManual:v('fin-afc'),formaPago:v('fin-pago'),ciudad:v('fin-ciudad'),
    plantillaId:v('fin-plantilla'),actualizarFicha:ck('fin-ficha'),codigoLRE:v('fin-lre')});
  if(g('fin-texto'))f.texto=v('fin-texto');
  const filas=pref=>[...document.querySelectorAll(`[data-fin-${pref}]`)].map(r=>({d:r.querySelector('.fd')?.value||'',m:r.querySelector('.fm')?.value||''}));
  if(document.querySelector('[data-fin-hab]')||f.haberesExtra.length)f.haberesExtra=filas('hab');
  if(document.querySelector('[data-fin-des]')||f.descuentosExtra.length)f.descuentosExtra=filas('des');
  if(trabAntes!==f.trab){const t=trabajador(f.trab);f.codigoLRE=(t&&t.lre&&t.lre.causalTermino)||'';}
  return f;
}
function onFinCambio(rehacer){
  leerForm();
  if(rehacer){renderFiniquitos();return;}
  previewFiniquito();
}
function agregarFilaFin(tipo){leerForm();(tipo==='hab'?FV.form.haberesExtra:FV.form.descuentosExtra).push({d:'',m:''});renderFiniquitos();}
function quitarFilaFin(tipo,i){leerForm();(tipo==='hab'?FV.form.haberesExtra:FV.form.descuentosExtra).splice(i,1);renderFiniquitos();}

function renderForm(el){
  const f=FV.form;const c=causalInfo(f.causal);const t=trabajador(f.trab);
  const pls=plantillas();
  const plDef=c.plantilla;
  const opt=(v,l,sel)=>`<option value="${esc(v)}" ${String(sel)===String(v)?'selected':''}>${esc(l)}</option>`;
  const filasExtra=(tipo,arr)=>arr.map((x,i)=>`<div data-fin-${tipo} style="display:flex;gap:6px;margin-bottom:4px">
      <input class="fd" type="text" value="${esc(x.d)}" placeholder="Descripción" style="flex:2" onchange="onFinCambio()">
      <input class="fm" type="number" value="${esc(x.m)}" placeholder="Monto" style="flex:1" onchange="onFinCambio()">
      <button class="btn btn-d" onclick="quitarFilaFin('${tipo}',${i})">✕</button></div>`).join('');
  el.innerHTML=tabs()+`<div class="card">
    <div class="card-title">${FV.id?'✏️ Editar finiquito':'📝 Nuevo finiquito'}</div>
    <div class="fg">
      <div class="grp"><label>Trabajador *</label><select id="fin-trab" onchange="onFinCambio(true)">${(S.trabajadores||[]).map(x=>opt(x.id,x.nombre+(x.rut?' · '+x.rut:''),f.trab)).join('')}</select>
        <div style="font-size:10px;color:var(--mt);margin-top:2px">${t&&t.lre&&t.lre.fechaInicio?'Ingreso '+fechaCorta(t.lre.fechaInicio)+' · '+(t.contrato==='plazo'?'plazo fijo':t.contrato==='obra'?'por obra':'indefinido'):'<span style="color:var(--warn)">⚠️ Falta fecha de inicio en la ficha</span>'}</div></div>
      <div class="grp"><label>Fecha de término *</label><input type="date" id="fin-termino" value="${esc(f.fechaTermino)}" onchange="onFinCambio()"></div>
      <div class="grp"><label>Causal *</label><select id="fin-causal" onchange="onFinCambio(true)">${CAUSALES.map(x=>opt(x.k,`${x.nm} (${x.art.replace('artículo','Art.')})`,f.causal)).join('')}</select></div>
      ${c.numeral?`<div class="grp"><label>Numeral del Art. 160</label><select id="fin-numeral" onchange="onFinCambio()">${opt('','Seleccionar…',f.numeral160)}${NUMERALES_160.map(x=>opt(x[0],x[1]+' '+x[2].charAt(0).toUpperCase()+x[2].slice(1),f.numeral160)).join('')}</select></div>`:''}
      ${c.aviso||c.hechos?`<div class="grp"><label>${c.aviso==='renuncia'?'Fecha de la carta de renuncia':'Fecha de la carta de aviso'}</label><input type="date" id="fin-aviso" value="${esc(f.fechaAviso)}" onchange="onFinCambio()">
        ${c.aviso==='despido'?'<div style="font-size:10px;color:var(--mt);margin-top:2px">Con menos de 30 días de anticipación se paga la indemnización sustitutiva</div>':''}</div>`:''}
      ${c.hechos?`<div class="grp full"><label>Hechos que fundamentan la causal</label><textarea id="fin-hechos" rows="2" onchange="onFinCambio()" placeholder="Los mismos indicados en la carta de aviso">${esc(f.hechos)}</textarea></div>`:''}
      <div class="grp"><label>Fecha del finiquito</label><input type="date" id="fin-fecha" value="${esc(f.fecha)}" onchange="onFinCambio()"></div>
      <div class="grp"><label>Ciudad de firma</label><input type="text" id="fin-ciudad" value="${esc(f.ciudad)}" onchange="onFinCambio()"></div>
      <div class="grp"><label>Forma de pago</label><input type="text" id="fin-pago" value="${esc(f.formaPago)}" placeholder="transferencia electrónica, cheque N°…, vale vista…" onchange="onFinCambio()"></div>
      <div class="grp"><label>UF a la fecha de término</label><input type="number" step="0.01" id="fin-uf" value="${esc(f.uf)}" onchange="onFinCambio()"></div>
    </div>

    <div class="card-title" style="margin-top:14px;font-size:13px">Base de cálculo y ajustes</div>
    <div class="fg">
      <div class="fin-cks" style="grid-column:1/-1">
        <span style="color:var(--mt)">Última remuneración (Art. 172) incluye:</span>
        <label><input type="checkbox" id="fin-incgrat" ${f.incGrat?'checked':''} onchange="onFinCambio()"> Gratificación mensual</label>
        <label><input type="checkbox" id="fin-inccol" ${f.incColacion?'checked':''} onchange="onFinCambio()"> Colación</label>
        <label><input type="checkbox" id="fin-incmov" ${f.incMovilizacion?'checked':''} onchange="onFinCambio()"> Movilización</label>
      </div>
      <div class="grp"><label>Última remuneración manual</label><input type="number" id="fin-base" value="${esc(f.baseManual)}" placeholder="Automática" onchange="onFinCambio()"><div style="font-size:10px;color:var(--mt);margin-top:2px">Para remuneraciones variables: promedio de los últimos 3 meses</div></div>
      <div class="grp"><label>Días hábiles de feriado</label><input type="number" step="0.01" id="fin-feriado" value="${esc(f.diasFeriadoManual)}" placeholder="Automático" onchange="onFinCambio()"></div>
      ${c.ias?`<div class="grp"><label>Años de indemnización</label><input type="number" step="1" id="fin-anios" value="${esc(f.aniosManual)}" placeholder="Automático" onchange="onFinCambio()"></div>
      <div class="grp"><label>Descuento aporte AFC empleador</label><input type="number" id="fin-afc" value="${esc(f.afcManual)}" placeholder="Estimado" onchange="onFinCambio()"><div style="font-size:10px;color:var(--mt);margin-top:2px">Usa el monto del certificado de la AFC. Escribe 0 para no descontar</div></div>`:''}
      <div class="fin-cks" style="grid-column:1/-1"><label><input type="checkbox" id="fin-incmes" ${f.incMesTermino?'checked':''} onchange="onFinCambio(true)"> Incluir la remuneración del mes de término (si no se paga en la liquidación mensual)</label></div>
      ${f.incMesTermino?`<div class="grp"><label>Monto líquido del mes</label><input type="number" id="fin-montomes" value="${esc(f.montoMesTermino)}" placeholder="Automático" onchange="onFinCambio()"></div>`:''}
    </div>
    <div class="fg" style="margin-top:6px">
      <div class="grp"><label>Otros haberes</label>${filasExtra('hab',f.haberesExtra)}<button class="btn btn-g" onclick="agregarFilaFin('hab')">+ Haber</button></div>
      <div class="grp"><label>Otros descuentos (anticipos, préstamos…)</label>${filasExtra('des',f.descuentosExtra)}<button class="btn btn-g" onclick="agregarFilaFin('des')">+ Descuento</button></div>
    </div>

    <div id="fin-prev" style="margin-top:12px"></div>

    <div class="card-title" style="margin-top:14px;font-size:13px">Texto del finiquito</div>
    <div class="fg">
      <div class="grp"><label>Plantilla</label><select id="fin-plantilla" onchange="onFinCambio()">${opt('',`Según la causal (${(plantillaPorId(plDef)||{}).nombre||''})`,f.plantillaId)}${pls.map(p=>opt(p.id,p.nombre+(p.tipo?'':' · propia'),f.plantillaId)).join('')}</select></div>
      <div class="grp"><label>Texto propio para este finiquito</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-g" onclick="editarTextoFiniquito()">${f.texto?'✏️ Editar texto propio':'✏️ Personalizar texto'}</button>
          <label class="btn btn-g" style="cursor:pointer">📤 Subir archivo<input type="file" accept=".txt,.docx,.md,.html,.htm" style="display:none" onchange="subirTextoFiniquito(this)"></label>
          ${f.texto?'<button class="btn btn-d" onclick="quitarTextoFiniquito()">Volver a la plantilla</button>':''}
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:2px">${f.texto?'✅ Este finiquito usa un texto propio':'Archivos .docx, .txt, .md o .html. Puede traer marcadores como {{trabajador}} o {{total}}'}</div></div>
    </div>
    ${FV.editTexto?`<div class="grp full" style="margin-top:6px"><textarea id="fin-texto" rows="18" style="width:100%;font-family:var(--mono);font-size:12px;line-height:1.5">${esc(textoDe(f))}</textarea>
      ${ayudaMarcadores()}</div>`:''}

    <div class="fg" style="margin-top:10px">
      <div class="fin-cks" style="grid-column:1/-1">
        <label><input type="checkbox" id="fin-ficha" ${f.actualizarFicha?'checked':''}> Registrar fecha y causal de término en la ficha del trabajador (LRE y Previred)</label>
        <span>Código causal LRE <input type="number" id="fin-lre" value="${esc(f.codigoLRE)}" style="width:80px;display:inline-block" min="1" max="99"></span>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="guardarFiniquito()">💾 Guardar y ver documento</button>
      <button class="btn btn-g" onclick="volverFiniquitos()">Cancelar</button>
    </div>
  </div>`;
  previewFiniquito();
}
function ayudaMarcadores(){
  return `<div style="font-size:10px;color:var(--mt);margin-top:6px;line-height:1.7">Marcadores: ${MARCADORES.map(([k,d])=>`<code title="${esc(d)}" style="cursor:pointer" onclick="insertarMarcadorFin('${k}')">{{${k}}}</code>`).join(' ')}
    <br>La primera línea en mayúsculas es el título. Separa párrafos con una línea en blanco. Deja {{detalle}} solo en su párrafo para mostrar la tabla de montos.</div>`;
}
function insertarMarcadorFin(k){
  const ta=g('fin-texto')||g('fpl-texto');if(!ta)return;
  const ins=`{{${k}}}`;const a=ta.selectionStart??ta.value.length,b=ta.selectionEnd??a;
  ta.value=ta.value.slice(0,a)+ins+ta.value.slice(b);ta.focus();ta.selectionStart=ta.selectionEnd=a+ins.length;
}
function previewFiniquito(){
  const el=g('fin-prev');if(!el)return;
  const f=FV.form;const t=trabajador(f.trab);
  if(!t){el.innerHTML='';return;}
  const r=calcularFiniquito(t,f);
  if(!r.ok){el.innerHTML=`<div class="info-tip" style="color:var(--warn);font-size:12px">⚠️ ${esc(r.motivo)}</div>`;return;}
  const fila=(d,m,cls='')=>`<tr><td class="tl" style="font-size:12px">${esc(d)}</td><td style="text-align:right;font-family:var(--mono)" class="${cls}">${fmtC(m)}</td></tr>`;
  el.innerHTML=`<div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">CÁLCULO</th><th style="text-align:right">MONTO</th></tr></thead>
    <tbody>
      ${r.lineas.map(x=>fila(x.d,x.m)).join('')||'<tr><td class="tl" colspan="2" style="font-size:12px;color:var(--mt)">Sin haberes</td></tr>'}
      ${r.desc.map(x=>fila('Menos: '+x.d,-x.m,'neg')).join('')}
    </tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" style="font-weight:700">TOTAL A PAGAR</td><td style="text-align:right;font-family:var(--mono);font-weight:700;color:var(--ach)">${fmtC(r.total)}</td></tr></tfoot>
  </table></div></div>
  <div style="font-size:11px;color:var(--mt);margin-top:6px;line-height:1.6">
    Antigüedad ${r.ant.anios} año(s), ${r.ant.meses} mes(es) y ${r.ant.dias} día(s).
    Última remuneración ${fmtC(r.ultimaRem)}${r.ultimaRem>r.tope90?` (tope 90 UF: ${fmtC(r.tope90)})`:''}.
    Feriado: saldo ${r.feriado.saldo!=null?fmtN(r.feriado.saldo):'–'} + proporcional ${fmtN(r.feriado.fraccion)} = ${fmtN(r.feriado.habilesCalc)} hábiles${r.feriado.habiles!==r.feriado.habilesCalc?` (usado ${fmtN(r.feriado.habiles)})`:''} → ${fmtN(r.feriado.corridos)} corridos hasta el ${fechaCorta(r.feriado.hasta)}, a ${fmtC(r.feriado.diario)} diarios (remuneración íntegra ${fmtC(r.remIntegra)} / 30).
    ${r.causal.aviso==='despido'?(r.diasAviso==null?'Sin fecha de aviso: se paga la sustitutiva.':`Aviso con ${r.diasAviso} día(s) de anticipación${r.diasAviso>=30?': no corresponde sustitutiva.':'.'}`):''}
    ${r.ias?` Estimado AFC: ${fmtC(r.afcEstimado)}.`:''}
  </div>
  ${r.avisos.map(a=>`<div style="font-size:11px;color:var(--warn);margin-top:4px">⚠️ ${esc(a)}</div>`).join('')}`;
}
function editarTextoFiniquito(){leerForm();FV.form.texto=textoDe(FV.form);FV.editTexto=true;renderFiniquitos();g('fin-texto')?.focus();}
function quitarTextoFiniquito(){leerForm();FV.form.texto='';FV.editTexto=false;renderFiniquitos();}
async function subirTextoFiniquito(input){
  const file=input.files&&input.files[0];if(!file)return;
  try{
    const txt=await leerArchivoTexto(file);
    if(!txt){toast('⚠️ El archivo no tiene texto','e');return;}
    leerForm();FV.form.texto=txt;FV.editTexto=true;renderFiniquitos();
    toast('✅ Texto cargado. Revisa los marcadores antes de guardar');
  }catch(e){toast('❌ '+e.message,'e');}
  finally{input.value='';}
}

async function guardarFiniquito(){
  const f=leerForm();const t=trabajador(f.trab);
  if(!t){toast('⚠️ Selecciona el trabajador','e');return;}
  const r=calcularFiniquito(t,f);
  if(!r.ok){toast('⚠️ '+r.motivo,'e');return;}
  if(f.texto&&f.texto.trim()===(plantillaPorId(f.plantillaId||causalInfo(f.causal).plantilla)||{}).texto)f.texto='';
  const D=datos();
  const rec={...f,nombre:t.nombre,rut:t.rut||'',calc:{total:r.total,totalHaberes:r.totalHaberes,totalDescuentos:r.totalDescuentos,
    lineas:r.lineas,desc:r.desc,ultimaRem:r.ultimaRem,baseIndem:r.baseIndem,feriado:r.feriado,ias:r.ias,sustitutiva:r.sustitutiva,afc:r.afc},
    actualizado:new Date().toISOString()};
  delete rec.id;
  let reg;
  if(FV.id){reg=D.items.find(x=>x.id===FV.id);if(!reg){toast('❌ El finiquito ya no existe','e');return;}Object.assign(reg,rec);}
  else{reg={id:'fin_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),creado:new Date().toISOString(),estado:'borrador',...rec};D.items.push(reg);}
  if(!await guardarDatos()){toast('❌ No se pudo guardar el finiquito','e');return;}
  // Ficha del trabajador
  if(f.actualizarFicha){
    t.lre={...(t.lre||{}),fechaTermino:f.fechaTermino};
    if(String(f.codigoLRE||'').trim())t.lre.causalTermino=String(f.codigoLRE).trim();
    const w=await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));
    if(w&&w.ok===false)toast('⚠️ Finiquito guardado, pero no se pudo actualizar la ficha del trabajador','e');
  }
  logAccion(FV.id?'Editó finiquito':'Creó finiquito',`${t.nombre} · término ${f.fechaTermino} · ${causalInfo(f.causal).art} · ${fmtC(r.total)}`);
  toast('✅ Finiquito guardado');
  FV={modo:'doc',id:reg.id,form:null,editTexto:false};renderFiniquitos();
}
function verFiniquito(id){if(!ASF||ASF.id!==id)ASF=null;FV={modo:'doc',id,form:null,editTexto:false};renderFiniquitos();}
async function eliminarFiniquito(id){
  const D=datos();const f=D.items.find(x=>x.id===id);if(!f)return;
  const act=asientoFiniquito(id);
  if(act){toast(`🔒 El finiquito está contabilizado (asiento N° ${numeroMostrar(act)||'?'}). Elimina o anula primero ese asiento en Comprobantes.`,'e');return;}
  if(!confirm(`¿Eliminar el finiquito de ${f.nombre} (término ${fechaCorta(f.fechaTermino)})?\n\nLa fecha de término registrada en la ficha del trabajador no se modifica.`))return;
  const antes=D.items;D.items=D.items.filter(x=>x.id!==id);
  if(!await guardarDatos()){D.items=antes;toast('❌ No se pudo eliminar','e');return;}
  logAccion('Eliminó finiquito',`${f.nombre} · ${f.fechaTermino}`);
  toast('🗑 Finiquito eliminado');renderFiniquitos();
}
async function marcarRatificado(id){
  const f=datos().items.find(x=>x.id===id);if(!f)return;
  const nuevo=f.estado==='ratificado'?'borrador':'ratificado';
  f.estado=nuevo;f.ratificadoEn=nuevo==='ratificado'?new Date().toISOString():null;
  if(!await guardarDatos()){toast('❌ No se pudo guardar','e');return;}
  logAccion(nuevo==='ratificado'?'Marcó finiquito ratificado':'Volvió finiquito a borrador',`${f.nombre} · ${f.fechaTermino}`);
  renderFiniquitos();
}

// ── Documento ──
function renderDoc(el){
  const f=datos().items.find(x=>x.id===FV.id);
  if(!f){volverFiniquitos();return;}
  const t=trabajador(f.trab);
  // Recalcula con los datos guardados; si el trabajador ya no existe usa el cálculo guardado
  let r=t?calcularFiniquito(t,f):null;
  if(!r||!r.ok)r={ok:true,...f.calc,inicio:t&&t.lre&&t.lre.fechaInicio,ant:null,iasInfo:null};
  const vals=valoresMarcadores(f,t,r);
  const cuerpo=textoAHTML(textoDe(f),vals,r);
  const E=S.empresa||{};
  const pendientes=[...new Set((combinar(textoDe(f),vals).match(/\{\{\s*[a-z_]+\s*\}\}/gi)||[]).filter(m=>!/detalle/i.test(m)))];
  el.innerHTML=tabs()+`
    ${pendientes.length?`<div class="info-tip" style="color:var(--warn);font-size:11px;margin-bottom:8px">⚠️ Marcadores sin reemplazar: ${pendientes.map(esc).join(', ')}</div>`:''}
    ${/\[(indicar|fecha de aviso)/.test(cuerpo)?'<div class="info-tip" style="color:var(--warn);font-size:11px;margin-bottom:8px">⚠️ Faltan datos en el texto (fecha de aviso o hechos). Complétalos editando el finiquito.</div>':''}
    <div class="card fin-doc">
      ${cuerpo}
      <div class="fin-firmas">
        <div><div class="fin-linea"></div><b>${esc(vals.trabajador)}</b><div>RUT ${esc(vals.rut_trabajador)}</div><div>Trabajador</div></div>
        <div><div class="fin-linea"></div><b>${esc(E.nombre||'')}</b><div>RUT ${esc(E.rut||'')}</div><div>${E.rep?'p.p. '+esc(E.rep):'Empleador'}</div></div>
      </div>
      <div class="fin-ministro"><div class="fin-linea"></div><b>Ministro de fe</b><div>Nombre, firma y timbre</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" class="no-print">
      <button class="btn btn-g" onclick="volverFiniquitos()">← Volver</button>
      <button class="btn btn-p" onclick="imprimirFiniquito()">🖨️ Imprimir</button>
      <button class="btn btn-i" onclick="editarFiniquito('${f.id}')">✏️ Editar</button>
      <button class="btn btn-g" onclick="marcarRatificado('${f.id}')">${f.estado==='ratificado'?'↩️ Volver a borrador':'✅ Marcar como ratificado'}</button>
    </div>
    ${htmlContabilizacion(f,t,t?calcularFiniquito(t,f):null)}`;
}
function imprimirFiniquito(){
  document.body.classList.add('print-fin');
  const limpiar=()=>{document.body.classList.remove('print-fin');window.removeEventListener('afterprint',limpiar);};
  window.addEventListener('afterprint',limpiar);
  window.print();
  setTimeout(limpiar,1500);
}


// ── Contabilización ──
// Cuentas por defecto de cada concepto. Se pueden cambiar en cada asiento.
const CUENTAS_FIN={
  mes:{cd:'2104005',lado:'debe',nm:'Remuneración del mes de término',ayuda:'Rebaja las remuneraciones por pagar del asiento mensual. Si el mes no se contabilizó, usa 3201001 Sueldos y salarios.'},
  feriado:{cd:'3201011',lado:'debe',nm:'Feriado pendiente y proporcional',prov:'2105004'},
  aviso:{cd:'3201009',lado:'debe',nm:'Indemnización sustitutiva del aviso previo',prov:'2202001'},
  ias:{cd:'3201009',lado:'debe',nm:'Indemnización por años de servicio',prov:'2202001'},
  extraH:{cd:'3201014',lado:'debe',nm:'Otros haberes del finiquito'},
  afc:{cd:'3201009',lado:'haber',nm:'Descuento aporte AFC del empleador',ayuda:'Rebaja el gasto en indemnizaciones: esos aportes ya se contabilizaron mes a mes.'},
  extraD:{cd:'1106001',lado:'haber',nm:'Otros descuentos (anticipos, préstamos)'},
  pagar:{cd:'2104005',lado:'haber',nm:'Finiquito por pagar'},
};
const asientosDeFiniquito=id=>(S.asientos||[]).filter(a=>a.tipo==='finiquito'&&a.finiquitoId===id);
const asientoFiniquito=id=>asientosDeFiniquito(id).find(a=>!a.anulado)||null;
// Saldo acreedor de una cuenta en el libro del ejercicio (para las provisiones)
function saldoAcreedor(cd){
  let s=0;
  try{
    const M=buildMayor();
    if(M&&M[cd])s=-(M[cd].saldo||0);
    else s=-(S.asientos||[]).filter(a=>!a.anulado).reduce((x,a)=>x+(a.movs||[]).filter(m=>m.cd===cd).reduce((y,m)=>y+(+m.debe||0)-(+m.haber||0),0),0);
  }catch(e){s=0;}
  return Math.max(0,Math.round(s));
}
function cfgAsientoInicial(f){
  const cfg={fecha:f.fechaTermino,cc:'',cuentas:{},usarProv:{}};
  // Si hay provisión con saldo, se propone usarla
  cfg.usarProv.feriado=saldoAcreedor('2105004')>0;
  cfg.usarProv.ias=saldoAcreedor('2202001')>0;
  return cfg;
}
// Arma los movimientos del asiento. Devuelve {movs, errores, avisos}
function propuestaAsiento(f,t,r,cfg){
  const errores=[],avisos=[],movs=[];
  if(!r||!r.ok)return {movs,errores:[r?r.motivo:'Sin cálculo'],avisos};
  const cta=k=>String((cfg.cuentas||{})[k]||CUENTAS_FIN[k].cd).trim();
  const rut=rutParse(t?t.rut:f.rut);
  const nombre=t?t.nombre:f.nombre;
  const add=(k,cd,monto,desc,lado)=>{
    monto=Math.round(monto);if(!monto)return;
    lado=lado||CUENTAS_FIN[k].lado;
    const m={cd,nm:pdcNm(cd)||'',debe:lado==='debe'?monto:0,haber:lado==='haber'?monto:0,desc,k};
    const rg=reglaCuenta(cd);
    if(rg&&rg.requiereAuxiliar&&rut.codigo){m.rutCodigo=rut.codigo;m.rutDV=rut.dv;m.razonSocial=nombre;}
    if(cfg.cc&&rg&&rg.aceptaCentroCosto)m.cc=cfg.cc;
    movs.push(m);
  };
  // Usa la provisión hasta su saldo y el resto a gasto
  const conProvision=(k,clave,monto,desc)=>{
    const prov=CUENTAS_FIN[k].prov;
    if(cfg.usarProv&&cfg.usarProv[clave]&&prov){
      const disp=Math.max(0,saldoAcreedor(prov)-(movs.filter(m=>m.cd===prov).reduce((s,m)=>s+m.debe,0)));
      const usa=Math.min(disp,monto);
      if(usa>0)add(k,prov,usa,desc+' (contra provisión)');
      if(monto-usa>0){add(k,cta(k),monto-usa,desc);if(usa>0)avisos.push(`La provisión ${prov} alcanza para ${fmtC(usa)}: el resto (${fmtC(monto-usa)}) va a gasto.`);}
      if(!disp)avisos.push(`La cuenta ${prov} no tiene saldo: ${desc.toLowerCase()} va a gasto.`);
      return;
    }
    add(k,cta(k),monto,desc);
  };
  const L=k=>r.lineas.filter(x=>x.k===k).reduce((s,x)=>s+x.m,0);
  if(L('mes'))add('mes',cta('mes'),L('mes'),'Remuneración pendiente '+nombre);
  if(L('feriado'))conProvision('feriado','feriado',L('feriado'),'Feriado proporcional '+nombre);
  if(L('aviso'))conProvision('aviso','ias',L('aviso'),'Indemnización sustitutiva aviso previo '+nombre);
  if(L('ias'))conProvision('ias','ias',L('ias'),'Indemnización años de servicio '+nombre);
  r.lineas.filter(x=>x.k==='extra').forEach(x=>add('extraH',cta('extraH'),x.m,x.d+' '+nombre));
  if(r.afc){
    // El descuento AFC va contra la misma cuenta donde quedó la indemnización
    const dIas=movs.filter(m=>m.k==='ias');
    const cdAfc=(cfg.cuentas||{}).afc?cta('afc'):(dIas.length?dIas[dIas.length-1].cd:cta('afc'));
    add('afc',cdAfc,r.afc,'Descuento aporte AFC empleador (Art. 13 Ley 19.728)');
  }
  r.desc.filter(x=>x.k==='extra').forEach(x=>add('extraD',cta('extraD'),x.m,x.d+' '+nombre));
  if(r.total<=0)errores.push('El total a pagar debe ser mayor que cero para contabilizar.');
  else add('pagar',cta('pagar'),r.total,'Finiquito por pagar '+nombre);
  // Cuadratura y reglas del plan de cuentas
  const d=movs.reduce((s,m)=>s+m.debe,0),h=movs.reduce((s,m)=>s+m.haber,0);
  if(d!==h)errores.push(`Asiento descuadrado: Debe ${fmtC(d)} / Haber ${fmtC(h)}`);
  const vp=validarMovimientosPDC(movs);
  if(!vp.ok)errores.push(...vp.errores);
  if(!esFecha(cfg.fecha))errores.push('Indica la fecha del asiento.');
  else if(String(cfg.fecha).slice(0,4)!==String(S.empresa.anio))errores.push(`La fecha ${fechaCorta(cfg.fecha)} no es del ejercicio ${S.empresa.anio}. Cambia al ejercicio ${String(cfg.fecha).slice(0,4)} para contabilizar.`);
  else if(!puedeOperarFecha(cfg.fecha))errores.push(`El período ${String(cfg.fecha).slice(0,7)} o el ejercicio está cerrado.`);
  return {movs,errores,avisos,debe:d,haber:h};
}

let ASF=null; // {id, cfg}
function abrirAsientoFiniquito(id){
  const f=datos().items.find(x=>x.id===id);if(!f)return;
  ASF={id,cfg:cfgAsientoInicial(f)};renderFiniquitos();
  setTimeout(()=>g('fin-asiento')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
}
function cerrarAsientoFiniquito(){ASF=null;renderFiniquitos();}
function leerCfgAsiento(){
  if(!ASF)return null;const c=ASF.cfg;
  if(g('fas-fecha'))c.fecha=g('fas-fecha').value;
  if(g('fas-cc'))c.cc=g('fas-cc').value;
  document.querySelectorAll('[data-fas-cta]').forEach(i=>{const k=i.dataset.fasCta;const v=String(i.value||'').trim();if(v&&v!==CUENTAS_FIN[k].cd)c.cuentas[k]=v;else delete c.cuentas[k];});
  document.querySelectorAll('[data-fas-prov]').forEach(i=>{c.usarProv[i.dataset.fasProv]=!!i.checked;});
  return c;
}
function onAsientoFinCambio(){leerCfgAsiento();renderFiniquitos();}

function htmlContabilizacion(f,t,r){
  const act=asientoFiniquito(f.id);
  const anul=asientosDeFiniquito(f.id).filter(a=>a.anulado);
  const desact=act&&r&&r.ok&&Math.round(+act.totalFiniquito||0)!==Math.round(r.total);
  let estado;
  if(act)estado=`<div style="font-size:12px">✅ Contabilizado en el asiento <b>N° ${esc(numeroMostrar(act)||'?')}</b> del ${fechaCorta(act.fecha)} por ${fmtC(act.totalFiniquito||0)}.${desact?` <span style="color:var(--warn)">⚠️ El finiquito cambió (total actual ${fmtC(r.total)}): vuelve a generar el asiento.</span>`:''}</div>`;
  else estado=`<div style="font-size:12px;color:var(--mt)">Sin contabilizar.${anul.length?` Asiento(s) anulado(s): ${anul.map(a=>'N° '+esc(numeroMostrar(a)||'?')).join(', ')}.`:''}</div>`;
  let panel='';
  if(ASF&&ASF.id===f.id){
    const c=ASF.cfg;const p=propuestaAsiento(f,t,r,c);
    const usados=[...new Set(p.movs.map(m=>m.k))];
    const filas=p.movs.map(m=>`<tr>
        <td style="font-family:var(--mono);font-size:12px">${esc(m.cd)}</td>
        <td class="tl" style="font-size:12px">${esc(m.nm||'⚠️ cuenta no existe')}<div style="font-size:10px;color:var(--mt)">${esc(m.desc)}${m.cc?' · CC '+esc(m.cc):''}${m.rutCodigo?' · RUT '+esc(m.rutCodigo+'-'+m.rutDV):''}</div></td>
        <td style="text-align:right;font-family:var(--mono)">${m.debe?fmtC(m.debe):''}</td>
        <td style="text-align:right;font-family:var(--mono)">${m.haber?fmtC(m.haber):''}</td></tr>`).join('');
    const ctas=usados.filter(k=>CUENTAS_FIN[k]).map(k=>{
      const def=CUENTAS_FIN[k];const val=(c.cuentas||{})[k]||def.cd;
      const prov=def.prov&&(k==='feriado'||k==='ias'||k==='aviso')?(k==='feriado'?'feriado':'ias'):'';
      return `<div class="grp"><label>${esc(def.nm)}</label><input type="text" list="fas-pdc" data-fas-cta="${k}" value="${esc(val)}" onchange="onAsientoFinCambio()" style="font-family:var(--mono)">
        ${def.ayuda?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${esc(def.ayuda)}</div>`:''}
        ${prov&&k!=='aviso'?`<div class="fin-cks" style="margin-top:4px"><label><input type="checkbox" data-fas-prov="${prov}" ${c.usarProv[prov]?'checked':''} onchange="onAsientoFinCambio()"> Usar ${def.prov} ${esc(pdcNm(def.prov)||'')} (saldo ${fmtC(saldoAcreedor(def.prov))})</label></div>`:''}</div>`;
    }).join('');
    const centros=(S.centros||[]).filter(x=>x&&x.id&&x.estado!=='inactivo');
    panel=`<div id="fin-asiento" style="margin-top:10px">
      <div class="fg">
        <div class="grp"><label>Fecha del asiento</label><input type="date" id="fas-fecha" value="${esc(c.fecha)}" onchange="onAsientoFinCambio()"></div>
        ${centros.length?`<div class="grp"><label>Centro de costo (cuentas de gasto)</label><select id="fas-cc" onchange="onAsientoFinCambio()"><option value="">Sin centro de costo</option>${centros.map(x=>`<option value="${esc(x.id)}" ${c.cc===x.id?'selected':''}>${esc(x.codigo?x.codigo+' · ':'')}${esc(x.nombre||x.id)}</option>`).join('')}</select></div>`:''}
        ${ctas}
      </div>
      <datalist id="fas-pdc">${PDC.filter(x=>x.tp!=='T'&&x.tp!=='S'&&x.activa!==false).map(x=>`<option value="${esc(x.cd)}">${esc(x.nm)}</option>`).join('')}</datalist>
      <div class="tw" style="margin-top:8px"><table>
        <thead><tr><th>CUENTA</th><th class="tl">DETALLE</th><th style="text-align:right">DEBE</th><th style="text-align:right">HABER</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr style="background:rgba(88,166,255,.08)"><td></td><td class="tl" style="font-weight:700">TOTALES</td><td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(p.debe||0)}</td><td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(p.haber||0)}</td></tr></tfoot>
      </table></div>
      ${p.avisos.map(a=>`<div style="font-size:11px;color:var(--mt);margin-top:4px">ℹ️ ${esc(a)}</div>`).join('')}
      ${p.errores.map(a=>`<div style="font-size:11px;color:var(--err);margin-top:4px">⛔ ${esc(a)}</div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-p" onclick="generarAsientoFiniquito('${f.id}')" ${p.errores.length?'disabled':''}>📝 ${act?'Reemplazar asiento':'Contabilizar'}</button>
        <button class="btn btn-g" onclick="cerrarAsientoFiniquito()">Cancelar</button>
      </div></div>`;
  }
  return `<div class="card no-print" style="margin-top:12px">
    <div class="card-title">📒 Contabilización</div>
    ${estado}
    ${ASF&&ASF.id===f.id?panel:`<div style="margin-top:8px"><button class="btn btn-p" onclick="abrirAsientoFiniquito('${f.id}')">📝 ${act?'Regenerar asiento':'Generar asiento contable'}</button></div>`}
  </div>`;
}

let GEN_FIN_EN_CURSO=false;
async function generarAsientoFiniquito(id){
  const f=datos().items.find(x=>x.id===id);if(!f||!ASF||ASF.id!==id)return;
  const t=trabajador(f.trab);
  if(!t){toast('⚠️ El trabajador ya no existe en la ficha: no se puede recalcular el finiquito','e');return;}
  const cfg=leerCfgAsiento();
  const r=calcularFiniquito(t,f);
  if(!r.ok){toast('⚠️ '+r.motivo,'e');return;}
  // Libro vigente desde la nube antes de decidir (otro equipo pudo contabilizarlo)
  const fresco=await refrescarAsientosDesdeNube(S.empresa.anio);
  if(!fresco.ok){toast('⚠️ No se pudo leer el libro de asientos desde la nube ('+fresco.motivo+'). Revisa la conexión.','e');return;}
  const p=propuestaAsiento(f,t,r,cfg);
  if(p.errores.length){toast('⛔ '+p.errores[0],'e');renderFiniquitos();return;}
  const previos=asientosDeFiniquito(id).filter(a=>!a.anulado);
  const resumen=`${t.nombre}\nTotal a pagar: ${fmtC(r.total)}\nFecha: ${fechaCorta(cfg.fecha)}`;
  if(previos.length){
    if(!confirm(`Este finiquito ya está contabilizado en el asiento ${previos.map(a=>'N° '+(numeroMostrar(a)||'?')).join(', ')}.\n\n¿Reemplazarlo? El anterior queda anulado (conserva su número, sin efecto contable).\n\n${resumen}`))return;
  }else if(!confirm(`¿Contabilizar el finiquito?\n\n${resumen}`))return;
  if(GEN_FIN_EN_CURSO)return;GEN_FIN_EN_CURSO=true;
  const aid='as_fin_'+id+'_'+Date.now().toString(36);
  const idsPrev=new Set(previos.map(a=>a.id));
  const movs=p.movs.map(({k,...m})=>m);
  let w;
  try{
    w=await persistirAsientosCritico(()=>{
      const ahora=new Date().toISOString();
      S.asientos.forEach(a=>{if(idsPrev.has(a.id)){a.anulado=true;a.anuladoEn=ahora;a.motivoAnulacion='Reemplazado por un nuevo asiento del finiquito';}});
      S.asientos.push({id:aid,n:null,fecha:cfg.fecha,glosa:`Finiquito ${t.nombre} · ${causalInfo(f.causal).art.replace('artículo','Art.')}`,movs,
        tipo:'finiquito',finiquitoId:id,totalFiniquito:r.total,trabajadorId:t.id,creadoEn:ahora});
    });
  }finally{GEN_FIN_EN_CURSO=false;}
  if(!w||!w.ok){toast('❌ No se pudo guardar el asiento del finiquito ('+((w&&w.motivo)||'error')+'). La operación NO se contabilizó.','e');return;}
  const nuevo=(S.asientos||[]).find(a=>a.id===aid);const num=numeroMostrar(nuevo);
  toast(`✅ Asiento N°${num||'?'} del finiquito de ${t.nombre}${previos.length?' · anulado '+previos.map(a=>'N°'+numeroMostrar(a)).join(', '):''}`);
  logAccion('Contabilizó finiquito',`${t.nombre} · N°${num} · ${fmtC(r.total)}${previos.length?' · reemplaza '+previos.map(a=>'N°'+numeroMostrar(a)).join(', '):''}`);
  ASF=null;renderFiniquitos();
  if(window.updateHdr)try{window.updateHdr();}catch(e){}
}

// ── Plantillas ──
function verPlantillasFiniquito(){FV={modo:'plantillas',id:null,form:null,plantilla:null};renderFiniquitos();}
function renderPlantillas(el){
  const pls=plantillas();
  const p=FV.plantilla;
  el.innerHTML=tabs()+`<div class="card">
    <div class="card-title">📑 Plantillas de finiquito</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Las plantillas tipo se pueden editar y restaurar. Crea plantillas propias escribiéndolas o subiendo tu texto en .docx, .txt, .md o .html.</div>
    <div class="tw"><table>
      <thead><tr><th class="tl">PLANTILLA</th><th class="tl">CAUSAL SUGERIDA</th><th></th></tr></thead>
      <tbody>${pls.map(x=>`<tr>
        <td class="tl" style="font-size:12px">${esc(x.nombre)} ${x.tipo?(x.editada?'<span style="font-size:10px;color:var(--warn)">· editada</span>':'<span style="font-size:10px;color:var(--mt)">· tipo</span>'):'<span style="font-size:10px;color:var(--ach)">· propia</span>'}</td>
        <td class="tl" style="font-size:11px">${x.causal?esc(causalInfo(x.causal).nm):'Cualquiera'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-i" onclick="editarPlantillaFin('${x.id}')">✏️</button>
          <button class="btn btn-g" onclick="duplicarPlantillaFin('${x.id}')" title="Duplicar">📋</button>
          ${x.tipo?(x.editada?`<button class="btn btn-g" onclick="restaurarPlantillaFin('${x.id}')" title="Restaurar texto original">↺</button>`:''):`<button class="btn btn-d" onclick="eliminarPlantillaFin('${x.id}')">🗑</button>`}
        </td></tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="nuevaPlantillaFin()">+ Nueva plantilla</button>
      <label class="btn btn-g" style="cursor:pointer">📤 Subir texto como plantilla<input type="file" accept=".txt,.docx,.md,.html,.htm" style="display:none" onchange="subirPlantillaFin(this)"></label>
      <button class="btn btn-g" onclick="volverFiniquitos()">← Volver</button>
    </div>
  </div>
  ${p?`<div class="card" style="margin-top:12px">
    <div class="card-title">${p.id?'✏️ Editar plantilla':'📄 Nueva plantilla'}</div>
    <div class="fg">
      <div class="grp"><label>Nombre</label><input type="text" id="fpl-nombre" value="${esc(p.nombre||'')}"></div>
      <div class="grp"><label>Causal sugerida</label><select id="fpl-causal"><option value="">Cualquiera</option>${CAUSALES.map(c=>`<option value="${c.k}" ${p.causal===c.k?'selected':''}>${esc(c.nm)}</option>`).join('')}</select></div>
    </div>
    <textarea id="fpl-texto" rows="20" style="width:100%;font-family:var(--mono);font-size:12px;line-height:1.5;margin-top:6px">${esc(p.texto||'')}</textarea>
    ${ayudaMarcadores()}
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p" onclick="guardarPlantillaFin()">💾 Guardar plantilla</button><button class="btn btn-g" onclick="cancelarPlantillaFin()">Cancelar</button></div>
  </div>`:''}`;
  if(p)g('fpl-nombre')?.focus();
}
function editarPlantillaFin(id){const p=plantillaPorId(id);if(!p)return;FV.plantilla={...p};renderFiniquitos();}
function nuevaPlantillaFin(texto,nombre){FV.plantilla={id:null,nombre:nombre||'',causal:'',texto:texto||PLANTILLAS_TIPO.find(x=>x.id==='generica').texto};renderFiniquitos();}
function duplicarPlantillaFin(id){const p=plantillaPorId(id);if(!p)return;FV.plantilla={id:null,nombre:p.nombre+' (copia)',causal:p.causal||'',texto:p.texto};renderFiniquitos();}
function cancelarPlantillaFin(){FV.plantilla=null;renderFiniquitos();}
async function subirPlantillaFin(input){
  const file=input.files&&input.files[0];if(!file)return;
  try{const txt=await leerArchivoTexto(file);if(!txt){toast('⚠️ El archivo no tiene texto','e');return;}
    nuevaPlantillaFin(txt,file.name.replace(/\.[^.]+$/,''));toast('✅ Texto cargado. Agrega los marcadores que necesites y guarda');}
  catch(e){toast('❌ '+e.message,'e');}finally{input.value='';}
}
async function guardarPlantillaFin(){
  const p=FV.plantilla;if(!p)return;
  const nombre=(g('fpl-nombre')?.value||'').trim(),texto=g('fpl-texto')?.value||'',causal=g('fpl-causal')?.value||'';
  if(!nombre){toast('⚠️ Ponle un nombre a la plantilla','e');return;}
  if(!texto.trim()){toast('⚠️ La plantilla no tiene texto','e');return;}
  const D=datos();const antes=JSON.stringify(D.plantillas);
  const id=p.id||('fpl_'+Date.now().toString(36));
  const reg={id,nombre,causal,texto,actualizado:new Date().toISOString()};
  const i=D.plantillas.findIndex(x=>x.id===id);
  if(i>=0)D.plantillas[i]=reg;else D.plantillas.push(reg);
  if(!await guardarDatos()){D.plantillas=JSON.parse(antes);toast('❌ No se pudo guardar la plantilla','e');return;}
  logAccion('Guardó plantilla de finiquito',nombre);
  toast('✅ Plantilla guardada');FV.plantilla=null;renderFiniquitos();
}
async function restaurarPlantillaFin(id){
  if(!confirm('¿Restaurar el texto original de esta plantilla tipo? Se pierden los cambios hechos.'))return;
  const D=datos();const antes=D.plantillas;D.plantillas=D.plantillas.filter(x=>x.id!==id);
  if(!await guardarDatos()){D.plantillas=antes;toast('❌ No se pudo restaurar','e');return;}
  toast('↺ Plantilla restaurada');renderFiniquitos();
}
async function eliminarPlantillaFin(id){
  const p=plantillaPorId(id);if(!p||p.tipo)return;
  const usos=datos().items.filter(x=>x.plantillaId===id).length;
  if(!confirm(`¿Eliminar la plantilla "${p.nombre}"?${usos?`\n\n${usos} finiquito(s) la usan: pasarán a la plantilla de su causal.`:''}`))return;
  const D=datos();const antes=D.plantillas;D.plantillas=D.plantillas.filter(x=>x.id!==id);
  if(!await guardarDatos()){D.plantillas=antes;toast('❌ No se pudo eliminar','e');return;}
  toast('🗑 Plantilla eliminada');renderFiniquitos();
}

export {CAUSALES, PLANTILLAS_TIPO, calcularFiniquito, habilesACorridos, antiguedad, aniosIndemnizacion, numeroALetras,
  combinar, textoAHTML, valoresMarcadores, cargarFiniquitos, renderFiniquitos, nuevoFiniquito, editarFiniquito,
  volverFiniquitos, onFinCambio, agregarFilaFin, quitarFilaFin, previewFiniquito, editarTextoFiniquito, quitarTextoFiniquito,
  subirTextoFiniquito, guardarFiniquito, verFiniquito, eliminarFiniquito, marcarRatificado, imprimirFiniquito,
  verPlantillasFiniquito, editarPlantillaFin, nuevaPlantillaFin, duplicarPlantillaFin, cancelarPlantillaFin,
  subirPlantillaFin, guardarPlantillaFin, restaurarPlantillaFin, eliminarPlantillaFin, insertarMarcadorFin,
  CUENTAS_FIN, propuestaAsiento, cfgAsientoInicial, asientoFiniquito, abrirAsientoFiniquito, cerrarAsientoFiniquito,
  onAsientoFinCambio, generarAsientoFiniquito};
