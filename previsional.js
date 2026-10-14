// previsional.js — Instituciones previsionales de Chile y sus tasas.
// Todo es editable desde la sección Indicadores → Previsional, porque las
// comisiones AFP, la tasa SIS y la mutual cambian por resolución.
//
// Fuentes: Superintendencia de Pensiones, Superintendencia de Salud, AFC Chile.

import {S} from './state.js';

// ── Valores de referencia (Superintendencia de Pensiones, 2026) ──
// Comisión = % adicional sobre la renta imponible que cobra la AFP.
export const AFP_DEFAULT=[
  {k:'capital',   nm:'AFP Capital',   comision:1.44},
  {k:'cuprum',    nm:'AFP Cuprum',    comision:1.44},
  {k:'habitat',   nm:'AFP Habitat',   comision:1.27},
  {k:'modelo',    nm:'AFP Modelo',    comision:0.58},
  {k:'planvital', nm:'AFP PlanVital', comision:1.16},
  {k:'provida',   nm:'AFP ProVida',   comision:1.45},
  {k:'uno',       nm:'AFP Uno',       comision:0.46},
];

// Isapres abiertas vigentes. El plan de cada trabajador se pacta en UF (su FUN).
export const ISAPRES_DEFAULT=[
  {k:'fonasa',        nm:'Fonasa'},
  {k:'banmedica',     nm:'Isapre Banmédica'},
  {k:'colmena',       nm:'Isapre Colmena Golden Cross'},
  {k:'consalud',      nm:'Isapre Consalud'},
  {k:'cruzblanca',    nm:'Isapre Cruz Blanca'},
  {k:'esencial',      nm:'Isapre Esencial'},
  {k:'nuevamasvida',  nm:'Isapre Nueva Masvida'},
  {k:'vidatres',      nm:'Isapre Vida Tres'},
  {k:'fundacion',     nm:'Isapre Fundación'},
];

// Mutualidades de seguridad (Ley 16.744). La tasa total = base 0,90% + adicional
// por riesgo de la actividad (0% a 3,4%), que notifica la propia mutual.
export const MUTUALES_DEFAULT=[
  {k:'achs',  nm:'ACHS — Asociación Chilena de Seguridad'},
  {k:'mutual',nm:'Mutual de Seguridad CChC'},
  {k:'ist',   nm:'IST — Instituto de Seguridad del Trabajo'},
  {k:'isl',   nm:'ISL — Instituto de Seguridad Laboral (estatal)'},
];

// Cajas de compensación (opcionales; afiliación de la empresa)
export const CAJAS_DEFAULT=[
  {k:'ninguna',   nm:'Sin caja de compensación'},
  {k:'losandes',  nm:'Caja Los Andes'},
  {k:'laaraucana',nm:'Caja La Araucana'},
  {k:'18septiembre',nm:'Caja 18 de Septiembre'},
  {k:'gabriela',  nm:'Caja Gabriela Mistral'},
];

// ── Tasas del empleador (aporte patronal) ──
export const PATRONAL_DEFAULT={
  sis:1.78,               // Seguro de Invalidez y Sobrevivencia (trimestre ago-oct 2026)
  // Seguro de accidentes del trabajo (Ley 16.744). V2.21.37: tasas separadas
  // para mutualidad e ISL; se aplica la de la institución elegida.
  mutualBase:0.90,        // cotización básica
  mutualAdicional:0.00,   // adicional diferenciada por riesgo/siniestralidad (la notifica la mutual)
  mutualSanna:0.03,       // Ley 21.063 (Seguro SANNA)
  mutualExtra:0.00,       // cotización extraordinaria, si está vigente
  islBase:0.90,
  islAdicional:0.00,
  islSanna:0.03,
  islExtra:0.00,
  // Seguro de cesantía (Ley 19.728). V2.21.37: aporte del trabajador y del
  // empleador por tipo de contrato, todos editables.
  afcIndefinido:2.40,     // empleador, contrato indefinido
  afcTrabIndefinido:0.60, // trabajador, contrato indefinido
  afcPlazoFijo:3.00,      // empleador, plazo fijo / obra o faena
  afcTrabPlazoFijo:0.00,  // trabajador, plazo fijo (no aporta)
  afcIndef11:0.80,        // empleador, indefinido con más de 11 años de antigüedad
  afcTrabIndef11:0.00,    // trabajador, más de 11 años (deja de aportar)
  cajaCompensacion:0.00,  // si la empresa está afiliada (habitualmente 0,6%)
  mutualInstitucion:'achs',
  cajaInstitucion:'ninguna',
};

// Configuraciones guardadas antes de V2.21.37 tenían una sola tasa (base y
// adicional) usada también para el ISL: si la empresa usaba ISL, esas tasas
// pasan a la columna ISL para no cambiar su cálculo.
function patronalVigente(g){
  const p={...PATRONAL_DEFAULT,...(g||{})};
  // El aporte del trabajador a cesantía se configuraba en Indicadores
  if(!g||g.afcTrabIndefinido===undefined){
    const ind=S.empresa&&S.empresa.indicadores;
    if(ind&&ind.tasaCesantiaTrab!=null&&ind.tasaCesantiaTrab!=='')p.afcTrabIndefinido=+ind.tasaCesantiaTrab;
  }
  if(g&&g.islBase===undefined&&g.mutualInstitucion==='isl'){
    p.islBase=+g.mutualBase||PATRONAL_DEFAULT.islBase;
    p.islAdicional=+g.mutualAdicional||0;
  }
  return p;
}

// ── Acceso a la configuración vigente (mezcla defaults con lo guardado) ──
export function getPrevisional(){
  const g=(S.empresa&&S.empresa.previsional)||{};
  return {
    afps:      g.afps||AFP_DEFAULT,
    isapres:   g.isapres||ISAPRES_DEFAULT,
    mutuales:  g.mutuales||MUTUALES_DEFAULT,
    cajas:     g.cajas||CAJAS_DEFAULT,
    patronal:  patronalVigente(g.patronal),
  };
}

export const afpInfo=k=>getPrevisional().afps.find(a=>a.k===k)||getPrevisional().afps[0];
export const isapreInfo=k=>getPrevisional().isapres.find(i=>i.k===k)||getPrevisional().isapres[0];
export const mutualInfo=k=>getPrevisional().mutuales.find(m=>m.k===k)||getPrevisional().mutuales[0];
export const cajaInfo=k=>getPrevisional().cajas.find(c=>c.k===k)||getPrevisional().cajas[0];

// ── Aporte patronal de un trabajador ──
// Devuelve el costo empresa adicional al sueldo bruto, con su desglose y
// la institución a la que se paga cada componente.
// `bases` (opcional, V2.21.32): bases distintas para SIS y cesantía. Durante
// una licencia médica el empleador sigue pagando SIS y aporte AFC sobre la
// renta del mes completo (norma Previred), mientras la mutual y la caja se
// calculan sólo sobre los días pagados.
// ── Reforma de pensiones (Ley 21.735) · V2.21.39 ──
// Aporte adicional del EMPLEADOR, por tramos de vigencia (remuneraciones del
// mes indicado en adelante). Desde agosto 2026 el Seguro Social se financia
// con 2,5% para SIS + Compensación por Expectativa de Vida (CEV): por eso la
// CEV por defecto es 2,5% − SIS vigente (cev:null = automática).
//  - capInd: cotización a la cuenta individual (va a la AFP, campo 28 Previred)
//  - cev:    compensación por expectativa de vida (Seguro Social, campo 94)
//  - crp:    cotización con rentabilidad protegida (Seguro Social, campo 95)
export const REFORMA_DEFAULT=[
  {desde:'2025-08',capInd:0.10,cev:0.90,crp:0.00},
  {desde:'2026-08',capInd:0.10,cev:null,crp:0.90},
  {desde:'2027-08',capInd:0.25,cev:null,crp:1.50},
  {desde:'2028-08',capInd:1.00,cev:null,crp:1.50},
  {desde:'2029-08',capInd:1.70,cev:null,crp:1.50},
  {desde:'2030-08',capInd:2.40,cev:null,crp:1.50},
  {desde:'2031-08',capInd:3.10,cev:null,crp:1.50},
  {desde:'2032-08',capInd:3.80,cev:null,crp:1.50},
  {desde:'2033-08',capInd:4.50,cev:null,crp:1.50},
];
export const SEGURO_SOCIAL_SIS_CEV=2.5;   // SIS + CEV desde agosto 2026
export const SIS_A_SEGURO_SOCIAL_DESDE='2026-08';

export function reformaTramos(){
  const g=(S.empresa&&S.empresa.previsional&&S.empresa.previsional.reforma)||null;
  return (Array.isArray(g)&&g.length?g:REFORMA_DEFAULT).slice().sort((a,b)=>String(a.desde).localeCompare(String(b.desde)));
}
// Tasas vigentes para un período 'YYYY-MM' (sin período: el mes actual)
export function reformaVigente(periodo,p=getPrevisional().patronal){
  const per=/^\d{4}-\d{2}$/.test(String(periodo||''))?periodo:new Date().toISOString().slice(0,7);
  const t=reformaTramos().filter(x=>x.desde<=per).pop();
  if(!t)return {desde:null,capInd:0,cev:0,crp:0,cevAuto:false};
  const auto=t.cev===null||t.cev===undefined||t.cev==='';
  const cev=auto?Math.max(0,+(SEGURO_SOCIAL_SIS_CEV-(+p.sis||0)).toFixed(4)):+t.cev||0;
  return {desde:t.desde,capInd:+t.capInd||0,cev,crp:+t.crp||0,cevAuto:auto};
}
// Sólo trabajadores activos afiliados a AFP pagan SIS y aportes de la reforma
// (no pensionados ni mayores de 65 sin pensión).
export const aplicaSISyReforma=t=>!t.tipoTrabajador||String(t.tipoTrabajador)==='0';

// Tipos de contrato para el seguro de cesantía
export const CONTRATOS_AFC=[
  {k:'indefinido',  nm:'Indefinido'},
  {k:'plazo',       nm:'Plazo fijo / obra o faena'},
  {k:'indefinido11',nm:'Indefinido, más de 11 años'},
];
// Tasas (%) de cesantía de un contrato: {trab, emp}
export function tasasAFC(contrato,p=getPrevisional().patronal){
  if(contrato==='plazo')return {trab:+p.afcTrabPlazoFijo||0,emp:+p.afcPlazoFijo||0};
  if(contrato==='indefinido11')return {trab:+p.afcTrabIndef11||0,emp:+p.afcIndef11||0};
  return {trab:+p.afcTrabIndefinido||0,emp:+p.afcIndefinido||0};
}

// Tasa total del seguro de accidentes según la institución elegida
export function tasaAccidentes(p=getPrevisional().patronal){
  const pre=p.mutualInstitucion==='isl'?'isl':'mutual';
  return ['Base','Adicional','Sanna','Extra'].reduce((s,k)=>s+(+p[pre+k]||0),0);
}

export function calcularAportePatronal(t,baseImponible,baseCesantia,bases){
  const p=getPrevisional().patronal;
  const R=n=>Math.round(n||0);
  const baseSIS=bases&&bases.sis!=null?bases.sis:baseImponible;
  if(bases&&bases.afc!=null)baseCesantia=bases.afc;
  const activo=aplicaSISyReforma(t);
  const sis=activo?R(baseSIS*p.sis/100):0;
  // Reforma: capitalización y rentabilidad protegida sobre los días pagados;
  // la CEV, igual que el SIS, también sobre los días de licencia.
  const rf=reformaVigente(bases&&bases.periodo,p);
  const capInd=activo?R(baseImponible*rf.capInd/100):0;
  const cev=activo?R(baseSIS*rf.cev/100):0;
  const crp=activo?R(baseImponible*rf.crp/100):0;
  const ssAFP=!bases||!bases.periodo||bases.periodo<SIS_A_SEGURO_SOCIAL_DESDE;
  const mutualTasa=tasaAccidentes(p);
  const mutual=R(baseImponible*mutualTasa/100);
  const afcTasa=tasasAFC(t.contrato||'indefinido',p).emp;
  const afc=R(baseCesantia*afcTasa/100);
  const caja=R(baseImponible*(+p.cajaCompensacion||0)/100);
  const total=sis+mutual+afc+caja+capInd+cev+crp;
  return {
    sis, mutual, afc, caja, capInd, cev, crp, total,
    mutualTasa, afcTasa, reforma:rf,
    detalle:[
      {concepto:'SIS (invalidez y sobrevivencia)', tasa:activo?p.sis:0, monto:sis, institucion:ssAFP?'AFP del trabajador':'Seguro Social Previsional'},
      ...(rf.capInd||capInd?[{concepto:'Reforma: capitalización individual', tasa:activo?rf.capInd:0, monto:capInd, institucion:'AFP del trabajador'}]:[]),
      ...(rf.cev||cev?[{concepto:'Reforma: expectativa de vida (CEV)', tasa:activo?rf.cev:0, monto:cev, institucion:'Seguro Social Previsional'}]:[]),
      ...(rf.crp||crp?[{concepto:'Reforma: rentabilidad protegida (CRP)', tasa:activo?rf.crp:0, monto:crp, institucion:'Seguro Social Previsional'}]:[]),
      {concepto:p.mutualInstitucion==='isl'?'ISL (Ley 16.744)':'Mutual (Ley 16.744)', tasa:mutualTasa, monto:mutual, institucion:mutualInfo(p.mutualInstitucion).nm},
      {concepto:`Seguro cesantía (${(CONTRATOS_AFC.find(c=>c.k===(t.contrato||'indefinido'))||CONTRATOS_AFC[0]).nm.toLowerCase()})`, tasa:afcTasa, monto:afc, institucion:'AFC Chile'},
      ...(caja>0?[{concepto:'Caja de compensación', tasa:p.cajaCompensacion, monto:caja, institucion:cajaInfo(p.cajaInstitucion).nm}]:[]),
    ],
  };
}
