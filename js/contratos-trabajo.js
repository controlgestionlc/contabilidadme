// contratos-trabajo.js — Contrato de trabajo desde plantillas por cargo (V2.21.67)
//
// Cada empresa tiene sus plantillas de contrato: las plantillas tipo (editables y
// restaurables) y las propias que crea cada contador, escribiéndolas o subiendo
// un .docx/.txt. Una plantilla puede asociarse a uno o varios cargos y a un tipo
// de contrato; al generar el contrato de un trabajador se sugiere la plantilla de
// su cargo.
//
// Los textos usan marcadores {{campo}} que se llenan con la ficha del trabajador
// y con los datos del registro DT (los mismos que van al CSV de Mi DT), así el
// contrato y el registro en la DT dicen lo mismo.
//
// Datos (clave por empresa 'contratosTrab'):
//   {plantillas:[{id,nombre,cargos:'Operario, Motosierrista',tipoContrato:''|1|2|3,texto}],
//    items:{[trabajadorId]:{plantillaId,texto,fecha}}}

import {toast, fmtC, MESES} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {numeroALetras} from './numletras.js';
import {datosContrato, validarContrato} from './contratos-dt.js';
import {DT_COMUNAS, DT_NACIONALIDADES} from './contratos-dt-tablas.js';
import {generarPDF} from './pdf-rem.js';
import {calcularLiquidacion, getUF, getUTM} from './remuneraciones.js';
import {leerArchivoTexto} from './finiquitos.js';
import {descargarDocx} from './docx-simple.js';
import './storage.js';

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const MESES_L=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const esFecha=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const fechaLarga=s=>{if(!esFecha(s))return '';const [y,m,d]=s.split('-').map(Number);return `${d} de ${MESES_L[m-1]} de ${y}`;};
const pesos=v=>'$'+Math.round(+v||0).toLocaleString('es-CL');
const palabras=v=>{const t=numeroALetras(Math.round(+v||0));return t?t.charAt(0).toUpperCase()+t.slice(1):'';};
const titulo=s=>String(s||'').toLowerCase().replace(/(^|\s|-)\S/g,c=>c.toUpperCase());
const g=id=>document.getElementById(id);

// ── Marcadores ──
const MARCADORES=[
  ['ciudad','Ciudad donde se firma'],['fecha_contrato','Fecha de firma (en palabras)'],
  ['empresa','Razón social del empleador'],['rut_empresa','RUT del empleador'],['giro','Giro del empleador'],
  ['domicilio_empresa','Domicilio del empleador'],['representante','Representante legal'],['rut_representante','RUT del representante'],
  ['trabajador','Nombre completo del trabajador'],['rut_trabajador','RUT (o DNI) del trabajador'],['nacionalidad','Nacionalidad'],
  ['fecha_nacimiento','Fecha de nacimiento (en palabras)'],['domicilio_trabajador','Domicilio del trabajador'],
  ['email_trabajador','Email del trabajador'],['telefono_trabajador','Teléfono del trabajador'],
  ['cargo','Cargo'],['funciones','Funciones pactadas'],['lugar_trabajo','Comuna donde se prestan los servicios'],
  ['fecha_inicio','Fecha de inicio de la relación laboral'],['fecha_termino','Fecha de término (plazo fijo)'],['tipo_contrato','Tipo de contrato'],
  ['sueldo_base','Sueldo base'],['sueldo_base_palabras','Sueldo base en palabras'],['gratificacion','Cláusula de gratificación según lo pactado'],
  ['colacion','Asignación de colación'],['movilizacion','Asignación de movilización'],['otros_haberes','Otros haberes imponibles fijos'],
  ['beneficios','Colación, movilización y otros haberes en una frase'],['remuneracion_imponible','Remuneración imponible mensual'],
  ['dia_pago','Día de pago'],['forma_pago','Forma de pago'],['anticipo','Anticipo pactado'],
  ['jornada_horas','Horas semanales'],['jornada_tipo','Tipo de jornada'],['distribucion_jornada','Días y horario de trabajo'],
  ['colacion_minutos','Minutos de colación'],['turno','Turno'],
  ['afp','AFP'],['salud','Institución de salud'],['otros_pactos','Otros pactos'],
];
const AFP_NM={capital:'AFP Capital',cuprum:'AFP Cuprum',habitat:'AFP Habitat',modelo:'AFP Modelo',planvital:'AFP PlanVital',provida:'AFP ProVida',uno:'AFP Uno'};
const SALUD_NM={fonasa:'Fonasa',banmedica:'Isapre Banmédica',colmena:'Isapre Colmena Golden Cross',consalud:'Isapre Consalud',cruzblanca:'Isapre Cruz Blanca',esencial:'Isapre Esencial',nuevamasvida:'Isapre Nueva Masvida',vidatres:'Isapre Vida Tres',fundacion:'Isapre Fundación'};
const GENTILICIO={CHILE:'chilena',PERU:'peruana',ARGENTINA:'argentina',BOLIVIA:'boliviana',VENEZUELA:'venezolana',COLOMBIA:'colombiana',HAITI:'haitiana',ECUADOR:'ecuatoriana',BRASIL:'brasileña',PARAGUAY:'paraguaya',URUGUAY:'uruguaya','REPUBLICA DOMINICANA':'dominicana',CUBA:'cubana',ESPAÑA:'española'};
const DIAS=[['lu','lunes'],['ma','martes'],['mi','miércoles'],['ju','jueves'],['vi','viernes'],['sa','sábado'],['do','domingo']];
const TIPOS_JORNADA={1:'semanal ordinaria',2:'semanal extendida',3:'bisemanal',4:'mensual',5:'diaria',6:'excepcional',7:'sin límite de jornada (artículo 22 inciso segundo del Código del Trabajo)',8:'semanal ordinaria (artículo 38)',9:'semanal extendida (artículo 38)'};
const FORMAS_PAGO={1:'en dinero efectivo',2:'mediante cheque',3:'mediante vale vista',4:'mediante depósito en la cuenta bancaria del trabajador',5:'mediante transferencia electrónica a la cuenta bancaria del trabajador'};
const ANTICIPOS={1:'',2:'por hora',3:'diario',4:'semanal',5:'quincenal'};
const TURNOS={1:'horario fijo, sin sistema de turnos',2:'turno de mañana',3:'turno de tarde',4:'turno de noche'};

// "lunes a jueves de 08:00 a 17:30 horas y viernes de 08:00 a 16:30 horas"
function textoHorario(h){
  const dias=DIAS.map(([k,nm])=>({nm,ini:(h[k]||[])[0]||'',fin:(h[k]||[])[1]||''})).filter(d=>d.ini&&d.fin);
  if(!dias.length)return '';
  const grupos=[];
  dias.forEach((d,i)=>{const ult=grupos[grupos.length-1];const idx=DIAS.findIndex(x=>x[1]===d.nm);
    if(ult&&ult.ini===d.ini&&ult.fin===d.fin&&ult.idxFin===idx-1){ult.hasta=d.nm;ult.idxFin=idx;}
    else grupos.push({desde:d.nm,hasta:d.nm,ini:d.ini,fin:d.fin,idxFin:idx});});
  const partes=grupos.map(gr=>`${gr.desde===gr.hasta?gr.desde:`${gr.desde} a ${gr.hasta}`} de ${gr.ini} a ${gr.fin} horas`);
  return partes.length>1?partes.slice(0,-1).join(', ')+' y '+partes.at(-1):partes[0];
}
function gentilicio(cd){
  const nm=DT_NACIONALIDADES.find(x=>x.cd===+cd)?.nm||'';
  return GENTILICIO[nm]||(nm?titulo(nm):'');
}
function clausulaGratificacion(dc,t){
  switch(+dc.gratForma){
    case 4:return 'El empleador pagará al trabajador una gratificación anual equivalente al veinticinco por ciento de lo devengado en el respectivo ejercicio comercial por concepto de remuneraciones mensuales, con un tope de cuatro coma setenta y cinco ingresos mínimos mensuales, conforme al artículo 50 del Código del Trabajo. Esta gratificación se anticipará mensualmente, a cuenta de la que corresponda al término del ejercicio';
    case 2:return 'El empleador pagará al trabajador la gratificación que le corresponda conforme al artículo 47 del Código del Trabajo, en proporción a sus remuneraciones anuales';
    case 3:return `Las partes acuerdan la siguiente gratificación convencional, que no es inferior a la legal: ${dc.gratModalidad||'(describir la modalidad pactada)'}`;
    case 5:return 'El empleador no está afecto a la obligación legal de pagar gratificación';
    default:return 'En materia de gratificación se aplicarán las normas legales vigentes';
  }
}
// Valores de los marcadores para un trabajador
function valoresContrato(t){
  const E=S.empresa||{};const dc=datosContrato(t);
  const comuna=cd=>titulo(DT_COMUNAS.find(x=>x.cd===+cd)?.nm||'');
  let imponible=+t.base||0;try{imponible=calcularLiquidacion(t,getUF(),getUTM(),null).totalImponible;}catch(e){}
  const benef=[];
  if(+t.colacion)benef.push(`una asignación de colación de ${pesos(t.colacion)} mensuales`);
  if(+t.movilizacion)benef.push(`una asignación de movilización de ${pesos(t.movilizacion)} mensuales`);
  if(+t.otros)benef.push(`otros haberes imponibles fijos por ${pesos(t.otros)} mensuales`);
  const domTrab=[[dc.domCalle,dc.domNumero].filter(Boolean).join(' '),dc.domDpto?'depto. '+dc.domDpto:'',comuna(dc.domComuna)].filter(Boolean).join(', ');
  const nombre=[t.nombres,t.apellidoPaterno,t.apellidoMaterno].filter(Boolean).join(' ')||t.nombre||'';
  const ant=ANTICIPOS[+dc.anticipo]||'';
  return {
    ciudad:E.ciudad||comuna(dc.comunaCelebracion)||E.comuna||'',fecha_contrato:fechaLarga(dc.fechaSuscripcion),
    empresa:E.nombre||'',rut_empresa:E.rut||'',giro:E.giro||'',
    domicilio_empresa:[E.domicilio,E.comuna||E.ciudad].filter(Boolean).join(', '),
    representante:E.rep||'',rut_representante:E.rutrep||'',
    trabajador:String(nombre).toUpperCase(),rut_trabajador:dc.dni?`DNI ${dc.dni}`:(t.rut||''),
    nacionalidad:gentilicio(dc.nacionalidad),fecha_nacimiento:fechaLarga(dc.fechaNacimiento),
    domicilio_trabajador:domTrab,email_trabajador:dc.email||'',telefono_trabajador:dc.telefono||'',
    cargo:t.cargo||'',funciones:dc.funciones||t.cargo||'',lugar_trabajo:comuna(dc.zona1),
    fecha_inicio:fechaLarga(dc.fechaInicio),fecha_termino:fechaLarga(dc.fechaFin),
    tipo_contrato:{1:'indefinido',2:'a plazo fijo',3:'por obra o faena'}[dc.tipoContrato]||'',
    sueldo_base:pesos(t.base),sueldo_base_palabras:palabras(t.base),
    gratificacion:clausulaGratificacion(dc,t),
    colacion:+t.colacion?pesos(t.colacion):'',movilizacion:+t.movilizacion?pesos(t.movilizacion):'',otros_haberes:+t.otros?pesos(t.otros):'',
    beneficios:benef.length?'Además, el empleador pagará al trabajador '+(benef.length>1?benef.slice(0,-1).join(', ')+' y '+benef.at(-1):benef[0])+', asignaciones que no constituyen remuneración conforme al artículo 41 del Código del Trabajo en la parte que corresponda.':'',
    remuneracion_imponible:pesos(imponible),
    dia_pago:String(dc.diaPago||''),forma_pago:FORMAS_PAGO[+dc.formaPago]||'',
    anticipo:ant?`Las partes pactan un anticipo ${ant} de remuneraciones, que se descontará en la liquidación del mes.`:'',
    jornada_horas:String(dc.duracion||''),jornada_tipo:TIPOS_JORNADA[+dc.tipoJornada]||'',
    distribucion_jornada:textoHorario(dc.horario||{}),colacion_minutos:String(dc.colacion||0),turno:TURNOS[+dc.turnos]||'',
    afp:AFP_NM[t.afp]||t.afp||'',salud:SALUD_NM[t.salud]||t.salud||'',otros_pactos:dc.otrosPactos||'',
  };
}

// ── Plantillas tipo ──
const CLAUSULA_JORNADA=`SEGUNDO: JORNADA DE TRABAJO. La jornada ordinaria de trabajo será de {{jornada_horas}} horas semanales, de tipo {{jornada_tipo}}, distribuidas de {{distribucion_jornada}}, con {{colacion_minutos}} minutos de colación que no se imputan a la jornada, en {{turno}}. Las horas extraordinarias sólo podrán trabajarse previo pacto escrito y se pagarán con el recargo legal.`;
const CLAUSULA_REMUNERACION=`TERCERO: REMUNERACIÓN. El trabajador percibirá un sueldo base mensual de {{sueldo_base}} ({{sueldo_base_palabras}}), que se pagará por mes vencido el día {{dia_pago}} de cada mes o el día hábil anterior, {{forma_pago}}. De las remuneraciones se deducirán los impuestos, las cotizaciones de seguridad social y los demás descuentos legales o autorizados por escrito por el trabajador. {{anticipo}}

CUARTO: GRATIFICACIÓN Y BENEFICIOS. {{gratificacion}}. {{beneficios}}`;
const CLAUSULAS_FINALES=`SÉPTIMO: PREVISIÓN Y SALUD. El trabajador declara estar afiliado a {{afp}} y a {{salud}}, instituciones a las que el empleador enterará las cotizaciones que correspondan.

OCTAVO: REGLAMENTO INTERNO Y PROTOCOLO. El trabajador declara recibir en este acto un ejemplar del Reglamento Interno de Orden, Higiene y Seguridad y del protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo (Ley N° 21.643), y se obliga a cumplirlos.

NOVENO: OTROS PACTOS. Las partes no acuerdan otros pactos distintos de los señalados en este contrato. {{otros_pactos}}

DÉCIMO: EJEMPLARES. El presente contrato se firma en dos ejemplares de igual tenor, quedando uno en poder de cada parte. El trabajador declara recibir su ejemplar a entera conformidad.`;
const ENCABEZADO=`En {{ciudad}}, a {{fecha_contrato}}, entre {{empresa}}, RUT {{rut_empresa}}, giro {{giro}}, representada por {{representante}}, RUT {{rut_representante}}, ambos con domicilio en {{domicilio_empresa}}, en adelante "el empleador", y don(ña) {{trabajador}}, RUT {{rut_trabajador}}, de nacionalidad {{nacionalidad}}, nacido(a) el {{fecha_nacimiento}}, con domicilio en {{domicilio_trabajador}}, en adelante "el trabajador", se ha convenido el siguiente contrato de trabajo:`;
const PLANTILLAS_TIPO=[
  {id:'indefinido',nombre:'Contrato indefinido · general',tipoContrato:1,cargos:'',texto:`CONTRATO DE TRABAJO

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}}, realizando las siguientes funciones: {{funciones}}. Los servicios se prestarán en la comuna de {{lugar_trabajo}}, sin perjuicio de que el empleador pueda alterar la naturaleza de los servicios o el sitio en que deban prestarse dentro del mismo lugar o ciudad, en los términos del artículo 12 del Código del Trabajo.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad, y a guardar reserva de la información de la empresa a que tenga acceso con motivo de su trabajo.

SEXTO: DURACIÓN. El presente contrato es de duración indefinida. El trabajador ingresó a prestar servicios el {{fecha_inicio}}.

${CLAUSULAS_FINALES}`},
  {id:'plazo',nombre:'Contrato a plazo fijo',tipoContrato:2,cargos:'',texto:`CONTRATO DE TRABAJO A PLAZO FIJO

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}}, realizando las siguientes funciones: {{funciones}}, en la comuna de {{lugar_trabajo}}.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} hasta el {{fecha_termino}}, fecha en que terminará por vencimiento del plazo convenido, conforme al artículo 159 N° 4 del Código del Trabajo. Si el trabajador continúa prestando servicios con conocimiento del empleador después de esa fecha, el contrato se transformará en indefinido en los casos que señala la ley.

${CLAUSULAS_FINALES}`},
  {id:'obra',nombre:'Contrato por obra o faena',tipoContrato:3,cargos:'',texto:`CONTRATO DE TRABAJO POR OBRA O FAENA

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}} en la siguiente obra o faena: {{funciones}}, que se ejecutará en la comuna de {{lugar_trabajo}}.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad propias de la faena.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} y durará hasta la conclusión de la obra o faena señalada en la cláusula primera, conforme al artículo 159 N° 5 del Código del Trabajo. Al término, el trabajador tendrá derecho a la indemnización que corresponda según el artículo 163 bis del mismo código.

${CLAUSULAS_FINALES}`},
  {id:'temporada',nombre:'Trabajador agrícola de temporada',tipoContrato:3,cargos:'Temporero, Cosechero, Trabajador agrícola de temporada',texto:`CONTRATO DE TRABAJO AGRÍCOLA DE TEMPORADA

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}} en labores agrícolas de temporada, en especial: {{funciones}}, en los predios del empleador ubicados en la comuna de {{lugar_trabajo}}. Este contrato se rige por los artículos 93 y siguientes del Código del Trabajo.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: CONDICIONES DE TRABAJO. El empleador proporcionará al trabajador condiciones higiénicas y adecuadas para mantener, preparar y consumir sus alimentos, y los elementos de protección personal que requieran las labores. El trabajador se obliga a usarlos y a cumplir las normas de seguridad en la aplicación de productos fitosanitarios.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} y durará hasta el término de la temporada o de las labores señaladas en la cláusula primera, conforme al artículo 159 N° 5 del Código del Trabajo.

${CLAUSULAS_FINALES}`},
];

// ── Estado ──
const CT={modo:'lista',tid:null,plantilla:null,editTexto:false};
function datos(){
  if(!S.contratosTrab||typeof S.contratosTrab!=='object'||Array.isArray(S.contratosTrab))S.contratosTrab={plantillas:[],items:{}};
  if(!Array.isArray(S.contratosTrab.plantillas))S.contratosTrab.plantillas=[];
  if(!S.contratosTrab.items||typeof S.contratosTrab.items!=='object')S.contratosTrab.items={};
  return S.contratosTrab;
}
async function guardarDatos(){
  try{const r=await window.storage.set('contratosTrab',JSON.stringify(datos()));return !(r&&r.ok===false);}catch(e){console.error(e);return false;}
}
function plantillas(){
  const D=datos();
  const tipo=PLANTILLAS_TIPO.map(p=>{const ed=D.plantillas.find(x=>x.id===p.id);return ed?{...p,...ed,tipo:true,editada:true}:{...p,tipo:true};});
  const propias=D.plantillas.filter(x=>!PLANTILLAS_TIPO.some(p=>p.id===x.id)).map(x=>({...x,tipo:false}));
  return [...propias,...tipo];
}
const plantillaPorId=id=>plantillas().find(p=>p.id===id)||null;
const cargosDe=p=>String(p.cargos||'').split(/[,;\n]/).map(norm).filter(Boolean);
// Plantilla sugerida: la guardada para el trabajador, la de su cargo, la de su tipo de contrato
function plantillaSugerida(t){
  const it=datos().items[t.id];if(it&&plantillaPorId(it.plantillaId))return plantillaPorId(it.plantillaId);
  const pls=plantillas();const cargo=norm(t.cargo);
  const porCargo=cargo&&pls.find(p=>cargosDe(p).includes(cargo));if(porCargo)return porCargo;
  const tc=datosContrato(t).tipoContrato;
  return pls.find(p=>+p.tipoContrato===tc&&p.tipo)||pls.find(p=>+p.tipoContrato===tc)||PLANTILLAS_TIPO[0];
}

// ── Texto → HTML (mismo formato que los finiquitos) ──
// Opcionales: si están vacíos desaparecen sin aviso (cláusulas que sólo existen si se pactaron)
const OPCIONALES=new Set(['anticipo','beneficios','otros_pactos','otros_haberes','colacion','movilizacion','email_trabajador','telefono_trabajador','fecha_termino','giro']);
function combinar(texto,vals){
  return String(texto||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(m,k)=>{k=k.toLowerCase();if(!(k in vals))return m;return vals[k]||(OPCIONALES.has(k)?'':`[${k.replace(/_/g,' ')}]`);});
}
function textoAHTML(texto,vals){
  const t=combinar(texto,vals);
  const bloques=t.replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  return bloques.map((b,i)=>{
    let b2=esc(b).replace(/\n/g,'<br>').replace(/\[([a-z ]+)\]/g,'<span class="ct-falta">[$1]</span>');
    if(i===0&&b.length<90&&b===b.toUpperCase())return `<div class="fin-tit">${b2}</div>`;
    return `<p>${b2.replace(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,40}:)/,'<b>$1</b>')}</p>`;
  }).join('');
}
// Marcadores usados en el texto que quedarían vacíos
function faltantes(texto,vals){
  const usados=new Set([...String(texto||'').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map(m=>m[1].toLowerCase()));
  return [...usados].filter(k=>k in vals&&!vals[k]&&!OPCIONALES.has(k)).map(k=>(MARCADORES.find(x=>x[0]===k)||[k,k])[1]);
}
function htmlDocumento(t,texto){
  const vals=valoresContrato(t);const E=S.empresa||{};
  return `<div class="fin-doc ct-doc">${textoAHTML(texto,vals)}
    <div class="fin-firmas">
      <div><div class="fin-linea"></div>${esc(E.nombre||'EMPLEADOR')}<br>RUT ${esc(E.rut||'')}${E.rep?`<br>p.p. ${esc(E.rep)}`:''}</div>
      <div><div class="fin-linea"></div>${esc(vals.trabajador)}<br>${esc(vals.rut_trabajador)}<br>TRABAJADOR</div>
    </div></div>`;
}
function textoDe(t){
  const it=datos().items[t.id];
  if(it&&it.texto&&String(it.texto).trim())return it.texto;
  const p=(it&&plantillaPorId(it.plantillaId))||plantillaSugerida(t);
  return p.texto;
}

// ── Vistas (dentro de la pestaña Contratos DT) ──
// renderContratosDT llama a ctVistaActiva(): si hay una vista propia abierta, la dibuja.
function ctVistaActiva(){
  if(CT.modo==='plantillas'){renderPlantillasCT();return true;}
  if(CT.modo==='doc'){renderDocCT();return true;}
  return false;
}
function tabs(){return window.tabsRemuneraciones?window.tabsRemuneraciones():'';}
function ctReset(){CT.modo='lista';CT.tid=null;CT.plantilla=null;CT.editTexto=false;}
function volverContratos(){CT.modo='lista';CT.tid=null;CT.plantilla=null;CT.editTexto=false;if(window.renderContratosDT)window.renderContratosDT();}
function abrirContratoTrabajo(tid){
  const t=(S.trabajadores||[]).find(x=>x.id===tid);if(!t)return;
  const m=document.getElementById('cdt-modal');if(m)m.classList.remove('open');
  CT.modo='doc';CT.tid=tid;CT.editTexto=false;
  if(window.getRemView&&window.getRemView()!=='contratosdt'&&window.setRemView){window.setRemView('contratosdt');return;}
  renderDocCT();
}
function renderDocCT(){
  const el=g('rem-content');const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);
  if(!el||!t){volverContratos();return;}
  const it=datos().items[t.id]||{};
  const p=(it.plantillaId&&plantillaPorId(it.plantillaId))||plantillaSugerida(t);
  const texto=textoDe(t);const vals=valoresContrato(t);
  const falt=faltantes(texto,vals);const vdt=validarContrato(t);
  const pls=plantillas();
  el.innerHTML=tabs()+`<div class="card no-print" style="margin-bottom:12px">
    <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      <div class="grp" style="min-width:280px;flex:1"><label>Plantilla</label><select id="ct-plantilla" onchange="ctCambiarPlantilla(this.value)">${pls.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.nombre)}${x.tipo?'':' · propia'}${cargosDe(x).includes(norm(t.cargo))?' · de su cargo':''}</option>`).join('')}</select></div>
      <button class="btn btn-g" onclick="volverContratos()">← Volver</button>
      <button class="btn btn-i" onclick="cdtEditar('${t.id}')">✏️ Datos del contrato</button>
      <button class="btn ${CT.editTexto?'btn-g':'btn-p'}" onclick="ctEditarTexto()">${CT.editTexto?'👁 Ver documento':'✏️ Editar contrato'}</button>
      <button class="btn btn-g" onclick="ctImprimir()">🖨️ Imprimir</button>
      <button class="btn btn-g" onclick="ctWord()">⬇️ Word</button>
      <button class="btn btn-p" onclick="ctPDF()">📄 PDF</button>
      <button class="btn btn-i" onclick="cdtCSVUno('${t.id}')" ${vdt.ok?'':'disabled'} title="${vdt.ok?'CSV para Mi DT':'Completa los datos del contrato'}">⬇️ CSV DT</button>
    </div>
    ${it.texto?'<div style="font-size:11px;color:var(--warn);margin-top:6px">📝 Este contrato tiene texto propio (no se actualiza si cambias la plantilla). <a href="#" onclick="ctQuitarTexto();return false">Volver al texto de la plantilla</a></div>':''}
    ${falt.length?`<div class="rd-err" style="margin-top:6px">⚠️ Datos vacíos en el contrato: ${esc(falt.join(', '))}. Complétalos en la ficha o en ✏️ Datos del contrato.</div>`:''}
    ${!vdt.ok?`<div class="rd-avi" style="margin-top:4px">ℹ️ Para el CSV de la DT falta: ${esc(vdt.faltan.join(', '))}</div>`:''}
  </div>
  ${CT.editTexto?htmlEditorCT(t,texto,vals,p):htmlDocumento(t,texto)}`;
  if(CT.editTexto)activarEditorCT();
}

// ── Editor visual del contrato (V2.21.70) ──
// El texto se edita directo sobre el documento. Cada dato automático se muestra
// con su valor real, destacado y bloqueado (no se puede borrar ni editar: se
// cambia en la ficha o en los datos del contrato). Al guardar, el editor se
// vuelve a convertir en texto con {{marcadores}}.
const DESC_MARCADOR=Object.fromEntries(MARCADORES);
function chipHTML(k,vals){
  const conocido=k in vals;const v=conocido?vals[k]:'';
  const cls=!conocido?' ct-chip-mal':(v?'':(OPCIONALES.has(k)?' ct-chip-vacio':' ct-chip-falta'));
  const txt=!conocido?`dato desconocido: ${k}`:(v||(OPCIONALES.has(k)?`sin ${(DESC_MARCADOR[k]||k).toLowerCase()}`:`falta: ${(DESC_MARCADOR[k]||k).toLowerCase()}`));
  return `<span class="ct-chip${cls}" contenteditable="false" data-k="${esc(k)}" title="Dato automático: ${esc(DESC_MARCADOR[k]||k)}. Se cambia en la ficha o en ✏️ Datos del contrato">${esc(txt)}</span>`;
}
function inlineEditable(texto,vals){
  let out='',ult=0;const re=/\{\{\s*([a-z_]+)\s*\}\}/gi;let m;
  while((m=re.exec(texto))){out+=esc(texto.slice(ult,m.index)).replace(/\n/g,'<br>')+chipHTML(m[1].toLowerCase(),vals);ult=m.index+m[0].length;}
  return out+esc(texto.slice(ult)).replace(/\n/g,'<br>');
}
function editableDesdeTexto(texto,vals){
  const bloques=String(texto||'').replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  return bloques.map((b,i)=>{
    const tit=i===0&&b.length<90&&b===b.toUpperCase()&&!b.includes('\n');
    if(tit)return `<p class="ct-ed-tit">${inlineEditable(b,vals)}</p>`;
    const m=b.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,40}:)/);
    return `<p>${m?`<b>${esc(m[1])}</b>${inlineEditable(b.slice(m[1].length),vals)}`:inlineEditable(b,vals)}</p>`;
  }).join('');
}
// Editor → texto de plantilla
const BLOQUES=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','UL','OL','PRE','SECTION','ARTICLE']);
function serializarEditor(root){
  const parrafos=[];let actual='';
  const inline=n=>{
    if(n.nodeType===3)return n.textContent.replace(/\u00a0/g,' ');
    if(n.nodeType!==1)return '';
    if(n.classList&&n.classList.contains('ct-chip'))return `{{${n.dataset.k}}}`;
    if(n.tagName==='BR')return '\n';
    let t='';n.childNodes.forEach(c=>{
      if(c.nodeType===1&&BLOQUES.has(c.tagName)){const x=inline(c);t+=(t&&!t.endsWith('\n')?'\n':'')+x+'\n';}
      else t+=inline(c);
    });
    return t;
  };
  const cerrar=()=>{const x=actual.replace(/[ \t]+\n/g,'\n').replace(/\n+$/,'').replace(/^\n+/,'').trim();if(x)parrafos.push(x);actual='';};
  root.childNodes.forEach(n=>{
    if(n.nodeType===1&&BLOQUES.has(n.tagName)){cerrar();actual=inline(n);cerrar();}
    else actual+=inline(n);
  });
  cerrar();
  return parrafos.join('\n\n');
}
function htmlEditorCT(t,texto,vals,p){
  const destino=plantillaCargo(t);
  return `<div class="card no-print ct-ed-bar">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="ct-ins" onchange="ctInsertarDato(this.value);this.value=''" style="width:auto;min-width:210px"><option value="">➕ Insertar dato automático…</option>${MARCADORES.map(([k,d])=>`<option value="${k}">${esc(d)}</option>`).join('')}</select>
        <span class="ct-leyenda"><span class="ct-chip" contenteditable="false">dato automático</span> no se puede borrar ni editar aquí · <span class="ct-chip ct-chip-falta" contenteditable="false">falta</span> completar en la ficha</span>
        <span style="flex:1"></span>
        <button class="btn btn-g" onclick="ctEditarTexto()">Cancelar</button>
        <button class="btn btn-g" onclick="ctGuardarEdicion(false)" title="Guarda el texto sólo para el contrato de ${esc(t.nombre||'')}">💾 Guardar este contrato</button>
        <button class="btn btn-p" onclick="ctGuardarEdicion(true)" title="${destino?`Actualiza la plantilla «${esc(destino.nombre)}»`:'Crea una plantilla nueva para este cargo'}">💾 Guardar y dejar como plantilla de «${esc(t.cargo||'sin cargo')}»</button>
      </div>
      <div style="font-size:11px;color:var(--mt);margin-top:6px">Escribe directo sobre el contrato. Enter crea una cláusula nueva; Mayús+Enter, un salto de línea dentro de la cláusula. Plantilla base: ${esc(p.nombre)}${destino?` · al guardar como plantilla se actualiza «${esc(destino.nombre)}»`:' · al guardar como plantilla se crea una nueva para este cargo'}.</div>
    </div>
    <div class="fin-doc ct-doc ct-editor-wrap"><div id="ct-editor" class="ct-editor" contenteditable="true" spellcheck="true">${editableDesdeTexto(texto,vals)}</div></div>`;
}
let ED={html:'',chips:0,rango:null};
function contarChips(root){return root.querySelectorAll('.ct-chip').length;}
function activarEditorCT(){
  const ed=g('ct-editor');if(!ed)return;
  try{document.execCommand('defaultParagraphSeparator',false,'p');}catch(e){}
  ED={html:ed.innerHTML,chips:contarChips(ed),rango:null};
  const chips=()=>[...ed.querySelectorAll('.ct-chip')];
  ed.addEventListener('beforeinput',e=>{
    const rs=e.getTargetRanges?e.getTargetRanges():[];
    for(const sr of rs){
      const r=document.createRange();
      try{r.setStart(sr.startContainer,sr.startOffset);r.setEnd(sr.endContainer,sr.endOffset);}catch(x){continue;}
      if(r.collapsed&&!String(e.inputType).startsWith('delete'))continue;
      if(chips().some(c=>r.intersectsNode(c))){e.preventDefault();toast('🔒 Los datos automáticos no se pueden borrar ni editar aquí: cámbialos en la ficha o en ✏️ Datos del contrato','e');return;}
    }
  });
  ed.addEventListener('input',()=>{
    if(contarChips(ed)<ED.chips){ed.innerHTML=ED.html;toast('🔒 Se restauró un dato automático que se había borrado','e');return;}
    ED.html=ed.innerHTML;ED.chips=contarChips(ed);
  });
  ed.addEventListener('paste',e=>{e.preventDefault();const txt=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,txt.replace(/\{\{|\}\}/g,''));});
  ed.addEventListener('drop',e=>e.preventDefault());
  ed.addEventListener('dragstart',e=>e.preventDefault());
  ed.addEventListener('cut',e=>{const sel=window.getSelection();if(sel.rangeCount&&chips().some(c=>sel.getRangeAt(0).intersectsNode(c))){e.preventDefault();toast('🔒 La selección incluye datos automáticos: no se puede cortar','e');}});
  document.addEventListener('selectionchange',()=>{const sel=window.getSelection();if(sel.rangeCount&&ed.contains(sel.anchorNode))ED.rango=sel.getRangeAt(0).cloneRange();});
}
function ctInsertarDato(k){
  if(!k)return;const ed=g('ct-editor');const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!ed||!t)return;
  const tmp=document.createElement('span');tmp.innerHTML=chipHTML(k,valoresContrato(t));const chip=tmp.firstChild;
  let r=ED.rango&&ed.contains(ED.rango.startContainer)?ED.rango:null;
  if(!r){r=document.createRange();const ult=ed.lastElementChild||ed;r.selectNodeContents(ult);r.collapse(false);}
  if(!r.collapsed&&[...ed.querySelectorAll('.ct-chip')].some(c=>r.intersectsNode(c)))r.collapse(false);
  r.deleteContents();r.insertNode(chip);
  const sp=document.createTextNode(' ');chip.after(sp);
  const sel=window.getSelection();const r2=document.createRange();r2.setStartAfter(sp);r2.collapse(true);sel.removeAllRanges();sel.addRange(r2);
  ED.html=ed.innerHTML;ED.chips=contarChips(ed);ed.focus();
}
// Plantilla del cargo: propia o tipo cuyo campo "cargos" incluye el cargo
function plantillaCargo(t){
  const cargo=norm(t.cargo);if(!cargo)return null;
  const pls=plantillas();
  return pls.find(p=>!p.tipo&&cargosDe(p).includes(cargo))||pls.find(p=>p.tipo&&cargosDe(p).includes(cargo))||null;
}
async function ctGuardarEdicion(comoPlantilla){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);const ed=g('ct-editor');if(!t||!ed)return;
  const texto=serializarEditor(ed);
  const v=validarPlantilla(texto,null);
  if(!v.ok){toast('⛔ '+v.errores[0],'e');return;}
  if(!texto.trim()){toast('⚠️ El contrato no tiene texto','e');return;}
  const D=datos();const prev=D.items[t.id]||{};
  const base=plantillaPorId(prev.plantillaId)||plantillaSugerida(t);
  if(!comoPlantilla){
    D.items[t.id]={plantillaId:base.id,texto:texto.trim()===String(base.texto).trim()?'':texto,fecha:new Date().toISOString()};
    if(!(await guardarDatos())){toast('❌ No se pudo guardar','e');return;}
    toast('💾 Contrato guardado (sólo para este trabajador)');CT.editTexto=false;renderDocCT();return;
  }
  if(!String(t.cargo||'').trim()){toast('⚠️ El trabajador no tiene cargo en su ficha: no se puede asociar la plantilla','e');return;}
  const destino=plantillaCargo(t);
  const usos=destino?Object.entries(D.items).filter(([id,x])=>id!==t.id&&x.plantillaId===destino.id&&!x.texto).length:0;
  const msg=destino
    ?`Se actualizará la plantilla «${destino.nombre}» (cargos: ${destino.cargos}).${usos?`

${usos} contrato(s) más usan esta plantilla sin texto propio y tomarán este texto.`:''}

¿Continuar?`
    :`Se creará la plantilla «Contrato · ${t.cargo}» asociada al cargo «${t.cargo}». Los próximos trabajadores con ese cargo la usarán.

¿Continuar?`;
  if(!confirm(msg))return;
  const antes=JSON.stringify(D.plantillas);const antesItem=D.items[t.id];
  let id;
  if(destino){
    id=destino.id;const i=D.plantillas.findIndex(x=>x.id===id);
    const reg={id,nombre:destino.nombre,cargos:destino.cargos||t.cargo,tipoContrato:destino.tipoContrato||'',texto,actualizado:new Date().toISOString()};
    if(i>=0)D.plantillas[i]=reg;else D.plantillas.push(reg);
  }else{
    id='ctp_'+Date.now().toString(36);
    D.plantillas.push({id,nombre:`Contrato · ${t.cargo}`,cargos:t.cargo,tipoContrato:datosContrato(t).tipoContrato||'',texto,actualizado:new Date().toISOString()});
  }
  D.items[t.id]={plantillaId:id,texto:'',fecha:new Date().toISOString()};
  if(!(await guardarDatos())){D.plantillas=JSON.parse(antes);D.items[t.id]=antesItem;toast('❌ No se pudo guardar','e');return;}
  logAccion('Guardó plantilla de contrato por cargo',t.cargo);
  toast(`💾 Contrato guardado y plantilla de «${t.cargo}» ${destino?'actualizada':'creada'}`);CT.editTexto=false;renderDocCT();
}
async function ctCambiarPlantilla(id){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!t)return;
  const D=datos();const it=D.items[t.id]||{};
  if(it.texto&&!confirm('Este contrato tiene texto propio. ¿Reemplazarlo por la plantilla elegida?')){renderDocCT();return;}
  D.items[t.id]={plantillaId:id,texto:'',fecha:new Date().toISOString()};
  if(!(await guardarDatos()))toast('❌ No se pudo guardar la plantilla elegida','e');
  renderDocCT();
}
function ctEditarTexto(){CT.editTexto=!CT.editTexto;renderDocCT();}
async function ctGuardarTexto(){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!t)return;
  const txt=g('ct-texto')?.value||'';if(!txt.trim()){toast('⚠️ El contrato no tiene texto','e');return;}
  const D=datos();const prev=D.items[t.id]||{};const p=plantillaPorId(prev.plantillaId)||plantillaSugerida(t);
  D.items[t.id]={plantillaId:p.id,texto:txt.trim()===String(p.texto).trim()?'':txt,fecha:new Date().toISOString()};
  if(!(await guardarDatos())){toast('❌ No se pudo guardar','e');return;}
  toast('💾 Texto del contrato guardado');CT.editTexto=false;renderDocCT();
}
async function ctQuitarTexto(){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!t)return;
  if(!confirm('¿Descartar el texto propio de este contrato y volver al de la plantilla?'))return;
  const D=datos();if(D.items[t.id])D.items[t.id].texto='';
  if(!(await guardarDatos()))toast('❌ No se pudo guardar','e');
  renderDocCT();
}
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
function ctImprimir(){
  document.body.classList.add('print-fin');
  const limpiar=()=>{document.body.classList.remove('print-fin');window.removeEventListener('afterprint',limpiar);};
  window.addEventListener('afterprint',limpiar);window.print();setTimeout(limpiar,1500);
}
async function ctPDF(){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!t)return;
  toast('⏳ Generando PDF del contrato…');
  try{await generarPDF(htmlDocumento(t,textoDe(t)),{nombre:`contrato_${slug(t.nombre)}.pdf`,orientacion:'portrait',pie:`Contrato de trabajo · ${t.nombre||''}`});
    logAccion('Generó contrato de trabajo',t.nombre||'');toast('✅ PDF del contrato generado');}
  catch(e){console.error(e);toast('❌ '+(e.message||e),'e');}
}
// Word: HTML que Word abre y permite seguir editando
// ── Word de plantillas (V2.21.68): bajar, editar en Word y volver a subir ──
async function ctBajarWordPlantilla(id){
  const p=plantillaPorId(id);if(!p)return;
  try{await descargarDocx(p.texto,`plantilla_contrato_${slug(p.nombre)}.docx`,{titulo:p.nombre,asunto:'Plantilla de contrato · no borres ni cambies los textos entre {{ }}'});
    toast('⬇️ Plantilla descargada. Edítala en Word sin cambiar los {{marcadores}} (en amarillo) y súbela con 📤 Subir Word');}
  catch(e){console.error(e);toast('❌ '+(e.message||e),'e');}
}
async function ctBajarWordEditor(){
  const p=CT.plantilla;if(!p)return;const texto=g('ctp-texto')?.value||'';const nombre=(g('ctp-nombre')?.value||p.nombre||'plantilla').trim();
  try{await descargarDocx(texto,`plantilla_contrato_${slug(nombre)}.docx`,{titulo:nombre});}catch(e){toast('❌ '+(e.message||e),'e');}
}
async function ctSubirWordPlantilla(input,id){
  const file=input.files&&input.files[0];if(!file)return;
  const p=plantillaPorId(id);if(!p){input.value='';return;}
  try{
    const txt=String(await leerArchivoTexto(file)||'').replace(/\r/g,'').trim();
    if(!txt){toast('⚠️ El archivo no tiene texto','e');return;}
    CT.plantilla={...p,texto:txt,originalTexto:p.texto,desdeWord:file.name};
    renderPlantillasCT();
    const v=validarPlantilla(txt,p.texto);
    toast(!v.ok?`⛔ El Word tiene ${v.errores.length} marcador(es) dañado(s): corrígelos antes de guardar`:(v.avisos.length?'⚠️ Word cargado: revisa los avisos y guarda':'✅ Word cargado: marcadores intactos. Revisa y guarda'),v.ok?undefined:'e');
  }catch(e){toast('❌ '+e.message,'e');}finally{input.value='';}
}
async function ctWord(){
  const t=(S.trabajadores||[]).find(x=>x.id===CT.tid);if(!t)return;
  const vals=valoresContrato(t);const E=S.empresa||{};
  const firmas=[[E.nombre||'EMPLEADOR',`RUT ${E.rut||''}`,...(E.rep?[`p.p. ${E.rep}`]:[])],[vals.trabajador,vals.rut_trabajador,'TRABAJADOR']];
  try{await descargarDocx(combinar(textoDe(t),vals),`contrato_${slug(t.nombre)}.docx`,{titulo:`Contrato de trabajo · ${t.nombre||''}`,firmas});
    logAccion('Descargó contrato de trabajo (Word)',t.nombre||'');}
  catch(e){console.error(e);toast('❌ '+(e.message||e),'e');}
}

// ── Validación de marcadores (V2.21.68) ──
// Datos que el contrato debe traer según el Art. 10 del Código del Trabajo; si
// faltan sus marcadores, el contrato no capturará esos datos automáticamente.
const ESENCIALES=['ciudad','fecha_contrato','empresa','rut_empresa','trabajador','rut_trabajador','nacionalidad','fecha_nacimiento',
  'cargo','lugar_trabajo','sueldo_base','jornada_horas','distribucion_jornada','fecha_inicio'];
const CONOCIDOS=new Set(MARCADORES.map(m=>m[0]));
function distancia(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function sugerir(k){let mejor=null,dm=99;CONOCIDOS.forEach(c=>{const dd=distancia(k,c);if(dd<dm){dm=dd;mejor=c;}});return dm<=3?mejor:null;}
function validarPlantilla(texto,original){
  const t=String(texto||'');const errores=[],avisos=[];
  const usados=[...t.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map(m=>m[1]);
  const validos=new Set();
  usados.forEach(k=>{
    const kk=k.toLowerCase().replace(/\s+/g,'_');
    if(CONOCIDOS.has(k))validos.add(k);
    else{const sg=CONOCIDOS.has(kk)?kk:sugerir(kk);errores.push(`{{${k}}} no es un marcador válido${sg?`; ¿quisiste decir {{${sg}}}?`:''}`);}
  });
  // Llaves sueltas o incompletas (marcadores dañados al editar)
  const resto=t.replace(/\{\{\s*[^{}]*?\s*\}\}/g,'');
  const rotos=[...resto.matchAll(/.{0,25}[{}].{0,25}/g)].map(m=>m[0].replace(/\s+/g,' ').trim());
  rotos.slice(0,5).forEach(r=>errores.push(`Marcador incompleto o llave suelta: "…${r}…"`));
  if(rotos.length>5)errores.push(`… y ${rotos.length-5} llave(s) suelta(s) más`);
  const faltanEsenciales=ESENCIALES.filter(k=>!validos.has(k));
  if(faltanEsenciales.length)avisos.push(`No están los marcadores de datos esenciales del contrato (Art. 10 del Código del Trabajo): ${faltanEsenciales.map(k=>`{{${k}}}`).join(', ')}. Esos datos no se llenarán solos.`);
  if(original){
    const antes=new Set([...String(original).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m=>m[1]));
    const quitados=[...antes].filter(k=>!validos.has(k)&&!faltanEsenciales.includes(k));
    if(quitados.length)avisos.push(`Se quitaron marcadores que tenía la plantilla: ${quitados.map(k=>`{{${k}}}`).join(', ')}.`);
  }
  if(!t.trim())errores.push('La plantilla no tiene texto.');
  return {ok:!errores.length,errores,avisos,usados:[...validos]};
}
function htmlValidacion(v){
  if(v.ok&&!v.avisos.length)return `<div class="rd-ok">✅ Marcadores correctos (${v.usados.length} en uso): el contrato capturará los datos automáticamente.</div>`;
  return `${v.errores.map(e=>`<div class="rd-err">⛔ ${esc(e)}</div>`).join('')}${v.avisos.map(e=>`<div class="rd-avi" style="color:var(--warn)">⚠️ ${esc(e)}</div>`).join('')}${v.ok?`<div class="rd-avi">Los marcadores existentes están bien escritos (${v.usados.length} en uso).</div>`:''}`;
}
function ctValidarEditor(){
  const p=CT.plantilla;const box=g('ctp-val');if(!p||!box)return null;
  const v=validarPlantilla(g('ctp-texto')?.value||'',p.originalTexto||null);box.innerHTML=htmlValidacion(v);return v;
}

// ── Plantillas ──
function ayudaMarcadores(idTa){
  return `<div style="font-size:10px;color:var(--mt);margin-top:6px;line-height:1.7">Marcadores (clic para insertar): ${MARCADORES.map(([k,d])=>`<code title="${esc(d)}" style="cursor:pointer" onclick="ctInsertar('${idTa}','${k}')">{{${k}}}</code>`).join(' ')}
    <br>La primera línea en mayúsculas es el título. Separa las cláusulas con una línea en blanco. "PRIMERO:" al inicio de un párrafo va en negrita. Las firmas se agregan solas al final.</div>`;
}
function ctInsertar(idTa,k){
  const ta=g(idTa);if(!ta)return;const ins=`{{${k}}}`;const a=ta.selectionStart??ta.value.length,b=ta.selectionEnd??a;
  ta.value=ta.value.slice(0,a)+ins+ta.value.slice(b);ta.focus();ta.selectionStart=ta.selectionEnd=a+ins.length;
}
function verPlantillasContrato(){
  CT.modo='plantillas';CT.plantilla=null;
  if(window.getRemView&&window.getRemView()!=='contratosdt'&&window.setRemView){window.setRemView('contratosdt');return;}
  renderPlantillasCT();
}
function renderPlantillasCT(){
  const el=g('rem-content');if(!el)return;
  const pls=plantillas();const p=CT.plantilla;
  const tc={1:'Indefinido',2:'Plazo fijo',3:'Obra o faena'};
  el.innerHTML=tabs()+`<div class="card">
    <div class="card-title">📄 Plantillas de contrato de trabajo</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Asocia cada plantilla a los cargos que la usan: al generar el contrato se sugiere la de su cargo. Las plantillas tipo se pueden editar y restaurar; crea las tuyas escribiéndolas, duplicando una tipo o subiendo tu texto en .docx, .txt, .md o .html. Los marcadores se llenan con la ficha del trabajador y los datos del registro DT.</div>
    <div class="tw"><table>
      <thead><tr><th class="tl">PLANTILLA</th><th class="tl">CARGOS</th><th class="tl">TIPO DE CONTRATO</th><th></th></tr></thead>
      <tbody>${pls.map(x=>`<tr>
        <td class="tl" style="font-size:12px">${esc(x.nombre)} ${x.tipo?(x.editada?'<span style="font-size:10px;color:var(--warn)">· editada</span>':'<span style="font-size:10px;color:var(--mt)">· tipo</span>'):'<span style="font-size:10px;color:var(--ach)">· propia</span>'}</td>
        <td class="tl" style="font-size:11px">${esc(x.cargos||'—')}</td>
        <td class="tl" style="font-size:11px">${tc[+x.tipoContrato]||'Cualquiera'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-i" onclick="ctEditarPlantilla('${x.id}')">✏️</button>
          <button class="btn btn-g" onclick="ctDuplicarPlantilla('${x.id}')" title="Duplicar">📋</button>
          <button class="btn btn-g" onclick="ctBajarWordPlantilla('${x.id}')" title="Descargar en Word para editarla">⬇️ Word</button>
          <label class="btn btn-g" style="cursor:pointer;text-transform:none;letter-spacing:0" title="Subir el Word editado de esta plantilla">📤 Subir Word<input type="file" accept=".docx,.txt,.md,.html,.htm" style="display:none" onchange="ctSubirWordPlantilla(this,'${x.id}')"></label>
          ${x.tipo?(x.editada?`<button class="btn btn-g" onclick="ctRestaurarPlantilla('${x.id}')" title="Restaurar texto original">↺</button>`:''):`<button class="btn btn-d" onclick="ctEliminarPlantilla('${x.id}')">🗑</button>`}
        </td></tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="ctNuevaPlantilla()">+ Nueva plantilla</button>
      <label class="btn btn-g" style="cursor:pointer">📤 Subir texto como plantilla<input type="file" accept=".txt,.docx,.md,.html,.htm" style="display:none" onchange="ctSubirPlantilla(this)"></label>
      <button class="btn btn-g" onclick="volverContratos()">← Volver</button>
    </div>
  </div>
  ${p?`<div class="card" style="margin-top:12px">
    <div class="card-title">${p.id?'✏️ Editar plantilla':'📄 Nueva plantilla'}</div>
    <div class="fg">
      <div class="grp"><label>Nombre</label><input type="text" id="ctp-nombre" value="${esc(p.nombre||'')}"></div>
      <div class="grp"><label>Cargos que la usan (separados por coma)</label><input type="text" id="ctp-cargos" value="${esc(p.cargos||'')}" placeholder="Ej: Operador de maquinaria, Motosierrista"></div>
      <div class="grp"><label>Tipo de contrato</label><select id="ctp-tc"><option value="">Cualquiera</option>${[1,2,3].map(v=>`<option value="${v}" ${+p.tipoContrato===v?'selected':''}>${tc[v]}</option>`).join('')}</select></div>
    </div>
    ${p.desdeWord?`<div class="info-tip" style="font-size:11px;margin-top:6px">📤 Texto cargado desde <b>${esc(p.desdeWord)}</b>. Revisa la validación y guarda para reemplazar la plantilla.</div>`:''}
    <textarea id="ctp-texto" rows="24" style="width:100%;font-family:var(--mono);font-size:12px;line-height:1.5;margin-top:6px">${esc(p.texto||'')}</textarea>
    <div id="ctp-val" style="margin-top:6px"></div>
    ${ayudaMarcadores('ctp-texto')}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-p" onclick="ctGuardarPlantilla()">💾 Guardar plantilla</button><button class="btn btn-g" onclick="ctValidarEditor()">✔ Validar marcadores</button><button class="btn btn-g" onclick="ctBajarWordEditor()">⬇️ Descargar este texto en Word</button><button class="btn btn-g" onclick="ctCancelarPlantilla()">Cancelar</button></div>
  </div>`:''}`;
  if(p){g('ctp-nombre')?.focus();ctValidarEditor();}
}
function ctEditarPlantilla(id){const p=plantillaPorId(id);if(!p)return;CT.plantilla={...p};renderPlantillasCT();}
function ctNuevaPlantilla(texto,nombre){CT.plantilla={id:null,nombre:nombre||'',cargos:'',tipoContrato:'',texto:texto||PLANTILLAS_TIPO[0].texto};renderPlantillasCT();}
function ctDuplicarPlantilla(id){const p=plantillaPorId(id);if(!p)return;CT.plantilla={id:null,nombre:p.nombre+' (copia)',cargos:p.cargos||'',tipoContrato:p.tipoContrato||'',texto:p.texto};renderPlantillasCT();}
function ctCancelarPlantilla(){CT.plantilla=null;renderPlantillasCT();}
async function ctSubirPlantilla(input){
  const file=input.files&&input.files[0];if(!file)return;
  try{
    const txt=await leerArchivoTexto(file);
    if(!String(txt||'').trim()){toast('⚠️ El archivo no tiene texto','e');return;}
    ctNuevaPlantilla(String(txt).replace(/\r/g,'').trim(),file.name.replace(/\.[^.]+$/,''));
    const v=validarPlantilla(txt,null);
    toast(v.ok&&!v.avisos.length?'✅ Texto cargado con marcadores correctos. Revisa y guarda':'⚠️ Texto cargado: revisa la validación de marcadores antes de guardar',v.ok?undefined:'e');
  }catch(e){toast('❌ '+e.message,'e');}finally{input.value='';}
}
async function ctGuardarPlantilla(){
  const p=CT.plantilla;if(!p)return;
  const nombre=(g('ctp-nombre')?.value||'').trim(),texto=g('ctp-texto')?.value||'',cargos=(g('ctp-cargos')?.value||'').trim(),tipoContrato=+(g('ctp-tc')?.value||0)||'';
  if(!nombre){toast('⚠️ Ponle un nombre a la plantilla','e');return;}
  if(!texto.trim()){toast('⚠️ La plantilla no tiene texto','e');return;}
  const v=validarPlantilla(texto,p.originalTexto||null);
  const box=g('ctp-val');if(box)box.innerHTML=htmlValidacion(v);
  if(!v.ok){toast('⛔ Corrige los marcadores dañados antes de guardar','e');box?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(v.avisos.length&&!confirm(`Revisa antes de guardar:\n\n• ${v.avisos.join('\n• ')}\n\n¿Guardar de todas formas?`))return;
  const D=datos();const antes=JSON.stringify(D.plantillas);
  const id=p.id||('ctp_'+Date.now().toString(36));
  const reg={id,nombre,cargos,tipoContrato,texto,actualizado:new Date().toISOString()};
  const i=D.plantillas.findIndex(x=>x.id===id);if(i>=0)D.plantillas[i]=reg;else D.plantillas.push(reg);
  if(!await guardarDatos()){D.plantillas=JSON.parse(antes);toast('❌ No se pudo guardar la plantilla','e');return;}
  logAccion('Guardó plantilla de contrato',nombre);
  toast('✅ Plantilla guardada');CT.plantilla=null;renderPlantillasCT();
}
async function ctRestaurarPlantilla(id){
  if(!confirm('¿Restaurar el texto original de esta plantilla tipo? Se pierden los cambios hechos.'))return;
  const D=datos();const antes=D.plantillas;D.plantillas=D.plantillas.filter(x=>x.id!==id);
  if(!await guardarDatos()){D.plantillas=antes;toast('❌ No se pudo restaurar','e');return;}
  toast('↺ Plantilla restaurada');renderPlantillasCT();
}
async function ctEliminarPlantilla(id){
  const p=plantillaPorId(id);if(!p||p.tipo)return;
  const usos=Object.values(datos().items).filter(x=>x.plantillaId===id).length;
  if(!confirm(`¿Eliminar la plantilla "${p.nombre}"?${usos?`\n\n${usos} contrato(s) la usan: pasarán a la plantilla sugerida por su cargo.`:''}`))return;
  const D=datos();const antes=D.plantillas;D.plantillas=D.plantillas.filter(x=>x.id!==id);
  if(!await guardarDatos()){D.plantillas=antes;toast('❌ No se pudo eliminar','e');return;}
  toast('🗑 Plantilla eliminada');renderPlantillasCT();
}

export {serializarEditor, editableDesdeTexto, plantillaCargo, ctGuardarEdicion, ctInsertarDato, validarPlantilla, ESENCIALES, ctValidarEditor, ctBajarWordPlantilla, ctBajarWordEditor, ctSubirWordPlantilla, PLANTILLAS_TIPO, MARCADORES, valoresContrato, textoHorario, plantillaSugerida, combinar, faltantes, htmlDocumento,
  ctReset, ctVistaActiva, volverContratos, abrirContratoTrabajo, ctCambiarPlantilla, ctEditarTexto, ctGuardarTexto, ctQuitarTexto, ctImprimir, ctPDF, ctWord,
  ctInsertar, verPlantillasContrato, ctEditarPlantilla, ctNuevaPlantilla, ctDuplicarPlantilla, ctCancelarPlantilla, ctSubirPlantilla, ctGuardarPlantilla,
  ctRestaurarPlantilla, ctEliminarPlantilla};
