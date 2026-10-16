// contratos-dt.js — Registro de contratos de trabajo en la DT (V2.21.65)
//
// Genera el CSV del "Registro Masivo de Contratos de Trabajo" de Mi DT
// (Instructivo DT v21.04.22): separador punto y coma, una fila por trabajador,
// fechas DD/MM/AAAA, RUT sin puntos con guion, montos sin puntos, horas HH:MM.
// Nombre del archivo: rutempleador_aaaamm. Máximo 1.000 filas y un archivo por
// cargo: si los trabajadores seleccionados tienen cargos distintos se genera un
// archivo por cargo.
//
// Datos: lo que ya está en la ficha (nombre, RUT, sexo, AFP, salud, sueldo,
// colación, movilización, gratificación, tipo de contrato, fecha de inicio) más
// los datos propios del contrato en t.contratoDT y los valores por defecto de la
// empresa en S.empresa.contratoDT (comuna de celebración, jornada, horario,
// colación, día y forma de pago).

import {toast, fmtC, MESES} from './core.js';
import {S} from './state.js';
import {DT_COMUNAS, DT_NACIONALIDADES} from './contratos-dt-tablas.js';
import {calcularLiquidacion, getUF, getUTM} from './remuneraciones.js';
import './storage.js';

const COLUMNAS=['CATEGORIA_CONTRATO','COMUNA_CELEBRACION','FECHA_SUSCRPCION','RUT_TRABAJADOR','DNI_TRABAJADOR',
'FECHA_NACIMIENTO','NOMBRES','APELLIDOS','SEXO','NACIONALIDAD','EMAIL','TELEFONO','COMUNA','CALLE',
'NUMERO','DPTO','DECLARACION_DISCAPACIDAD','DECLARACION_INVALIDEZ','FUNCIONES','SUBCONTRATACION',
'RUT_EMPRESA_PRINCIPAL','EST','RUT_EMPRESA_USUARIA','FAENA_COMUNA','FAENA_CALLE','FAENA_NUMERO',
'FAENA_DPTO','ZONA_GEOGRAFICA_1','ZONA_GEOGRAFICA_2','ZONA_GEOGRAFICA_3','ZONA_GEOGRAFICA_4',
'ZONA_GEOGRAFICA_5','SUELDO_BASE','MONTO_IMPONIBLE','HABER_1','MONTO_1','PER_DEVENGAMIENTO_1',
'HABER_2','MONTO_2','PER_DEVENGAMIENTO_2','HABER_3','MONTO_3','PER_DEVENGAMIENTO_3','HABER_4',
'MONTO_4','PER_DEVENGAMIENTO_4','HABER_5','MONTO_5','PER_DEVENGAMIENTO_5','GRAT_FORMA_PAGO',
'GRAT_MODALIDAD','GRAT_PERIODO_PAGO','REM_PERIODO_PAGO','REM_FECHA_PAGO','REM_FORMA_PAGO',
'REM_ANTICIPO','REM_AFP','REM_SALUD','REM_OTROS_PACTOS','TIPO_JORNADA','NRO_RESOLUCION',
'FECHA_RESOLUCION','DURACION_JORNADA','TURNOS','TIEMPO_COLACION','T_COLACION_IMP',
'T_COLACION_NO_IMP','ROTACION','NRO_DIAS_DIST_JOR','LUNES_HORA_INICIO','LUNES_HORA_TERMINO',
'MARTES_HORA_INICIO','MARTES_HORA_TERMINO','MIERCOLES_HORA_INICIO','MIERCOLES_HORA_TERMINO',
'JUEVES_HORA_INICIO','JUEVES_HORA_TERMINO','VIERNES_HORA_INICIO','VIERNES_HORA_TERMINO',
'SABADO_HORA_INICIO','SABADO_HORA_TERMINO','DOMINGO_HORA_INICIO','DOMINGO_HORA_TERMINO',
'TIPO_CONTRATO','FECHA_INI_RELABORAL','FECHA_FIN_RELABORAL','OTROS_INDEMNIZACIONES',
'OTROS_FERIADOS','OTROS_NEGOCIACIONES','OTROS_PROPINTELECTUAL','OTROS_LICMEDICA',
'OTROS_SALACUNA','OTROS_PERMISOS','OTROS_CONESPECIALES','OTROS_SEGUROS','OTROS_STOCK',
'OTROS_INSTCOLECTIVO','AFECTO_A','FECHA_INI_INSTCOLECTIVO','FECHA_FIN_INSTCOLECTIVO'];

// Códigos DT de AFP y salud desde las claves de la ficha
const AFP_DT={provida:6,planvital:11,cuprum:13,habitat:14,uno:19,capital:31,modelo:103};
const SALUD_DT={cruzblanca:1,banmedica:3,colmena:4,consalud:9,vidatres:12,fundacion:40,nuevamasvida:43,fonasa:102};
const DIAS=[['lu','LUNES','Lunes'],['ma','MARTES','Martes'],['mi','MIERCOLES','Miércoles'],['ju','JUEVES','Jueves'],['vi','VIERNES','Viernes'],['sa','SABADO','Sábado'],['do','DOMINGO','Domingo']];
const TIPOS_JORNADA=[[1,'Semanal ordinaria'],[2,'Semanal extendida'],[3,'Bisemanal'],[4,'Mensual'],[5,'Diaria'],[6,'Excepcional (con resolución)'],[7,'Art. 22 (sin límite de jornada)'],[8,'Art. 38 semanal ordinaria'],[9,'Art. 38 semanal extendida']];
const FORMAS_PAGO=[[1,'Efectivo'],[2,'Cheque'],[3,'Vale vista'],[4,'Depósito bancario'],[5,'Transferencia bancaria']];
const ANTICIPOS=[[1,'Sin anticipo'],[2,'Por hora'],[3,'Diario'],[4,'Semanal'],[5,'Quincenal']];
const GRAT_FORMAS=[[1,'No pactado'],[2,'Art. 47 (30% utilidades)'],[3,'Convencional superior al mínimo legal'],[4,'Art. 50 (25% con tope 4,75 IMM)'],[5,'Sin obligación legal de pago']];

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const fDT=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
const fCorta=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'—';};
const rutDT=r=>{const s=String(r||'').toUpperCase().replace(/[^0-9K]/g,'').replace(/^0+/,'');return s.length>1?`${s.slice(0,-1)}-${s.slice(-1)}`:'';};
const entero=v=>String(Math.max(0,Math.round(+v||0)));
const hhmm=v=>/^\d{1,2}:\d{2}$/.test(String(v||''))?String(v).padStart(5,'0'):'';
const minutos=v=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null;};
const comunaPorNombre=nm=>{const k=norm(nm);if(!k)return '';const c=DT_COMUNAS.find(x=>norm(x.nm)===k);return c?String(c.cd):'';};
const nombreComuna=cd=>DT_COMUNAS.find(x=>x.cd===+cd)?.nm||'';

// ── Valores por defecto de la empresa ──
function defaultsEmpresa(){
  const E=S.empresa||{};
  const d=E.contratoDT||{};
  const comunaEmp=comunaPorNombre(E.comuna)||comunaPorNombre(E.ciudad);
  return {
    comunaCelebracion:d.comunaCelebracion||comunaEmp||'',
    zona1:d.zona1||comunaEmp||'',
    tipoJornada:+d.tipoJornada||1,
    duracion:+d.duracion||42,
    turnos:+d.turnos||1,
    colacion:d.colacion!=null&&d.colacion!==''?+d.colacion:60,
    colacionImputable:!!d.colacionImputable,
    horario:d.horario||{lu:['08:00','17:30'],ma:['08:00','17:30'],mi:['08:00','17:30'],ju:['08:00','17:30'],vi:['08:00','16:30'],sa:['',''],do:['','']},
    diaPago:+d.diaPago||30,
    formaPago:+d.formaPago||5,
    anticipo:+d.anticipo||1,
  };
}
// Datos del contrato de un trabajador, completados con los valores por defecto
function datosContrato(t){
  const D=defaultsEmpresa();const c=t.contratoDT||{};const lre=t.lre||{};
  const tipoContrato=+c.tipoContrato||(t.contrato==='plazo'?2:1);
  let gratForma=+c.gratForma;
  if(!gratForma)gratForma=(t.gratifModo||'pct')==='pct'?4:((+t.grat||0)>0?3:1);
  return {
    fechaSuscripcion:c.fechaSuscripcion||lre.fechaInicio||'',
    fechaInicio:lre.fechaInicio||'',
    fechaFin:c.fechaFin||lre.fechaTermino||'',
    tipoContrato,
    fechaNacimiento:c.fechaNacimiento||'',
    nacionalidad:c.nacionalidad||(String(t.nacionalidad||'0')==='0'?'320':''),
    dni:c.dni||'',
    email:c.email||'',telefono:c.telefono||'',
    domComuna:c.domComuna||'',domCalle:c.domCalle||'',domNumero:c.domNumero||'',domDpto:c.domDpto||'',
    funciones:c.funciones||t.cargo||'',
    comunaCelebracion:c.comunaCelebracion||D.comunaCelebracion,
    zona1:c.zona1||D.zona1,
    tipoJornada:+c.tipoJornada||D.tipoJornada,
    nroResolucion:c.nroResolucion||'',fechaResolucion:c.fechaResolucion||'',
    duracion:c.duracion!=null&&c.duracion!==''?+c.duracion:D.duracion,
    turnos:+c.turnos||D.turnos,
    colacion:c.colacion!=null&&c.colacion!==''?+c.colacion:D.colacion,
    colacionImputable:c.colacionImputable!=null?!!c.colacionImputable:D.colacionImputable,
    horario:c.horarioPropio&&c.horario?c.horario:D.horario,
    horarioPropio:!!c.horarioPropio,
    diaPago:+c.diaPago||D.diaPago,
    formaPago:+c.formaPago||D.formaPago,
    anticipo:+c.anticipo||D.anticipo,
    gratForma,gratModalidad:c.gratModalidad||((gratForma===3&&(+t.grat||0)>0)?`Gratificación mensual fija de $${Math.round(+t.grat).toLocaleString('es-CL')}`:''),
    subcontratacion:+c.subcontratacion||0,rutPrincipal:c.rutPrincipal||'',
    otrosPactos:c.otrosPactos||'',
    informado:c.informado||'',
  };
}
// Horas semanales del horario (descontando la colación no imputable)
function horasSemana(dc){
  let min=0,dias=0;
  DIAS.forEach(([k])=>{const h=dc.horario[k]||['',''];const a=minutos(h[0]),b=minutos(h[1]);if(a!=null&&b!=null&&b>a){min+=b-a;dias++;}});
  if(!dc.colacionImputable)min-=dias*(+dc.colacion||0);
  return {horas:Math.round(min/60*100)/100,dias};
}

// ── Validación ──
function validarContrato(t){
  const dc=datosContrato(t),err=[],avi=[];
  const req=(cond,msg)=>{if(!cond)err.push(msg);};
  req(rutDT(t.rut)||dc.dni,'RUT del trabajador');
  req(/^\d{4}-\d{2}-\d{2}$/.test(dc.fechaSuscripcion),'fecha de suscripción del contrato');
  req(/^\d{4}-\d{2}-\d{2}$/.test(dc.fechaInicio),'fecha de inicio de la relación laboral (ficha → LRE)');
  req(/^\d{4}-\d{2}-\d{2}$/.test(dc.fechaNacimiento),'fecha de nacimiento');
  req(t.nombres||t.nombre,'nombres');
  req(t.apellidoPaterno,'apellidos (ficha)');
  req(t.sexo==='M'||t.sexo==='F','sexo (ficha)');
  req(+dc.nacionalidad>0,'nacionalidad');
  req(+dc.comunaCelebracion>0,'comuna de celebración');
  req(+dc.domComuna>0&&String(dc.domCalle).trim(),'domicilio del trabajador (comuna y calle)');
  req(String(dc.funciones).trim(),'funciones');
  if(String(dc.funciones).length>300)err.push('funciones: máximo 300 caracteres');
  req(+dc.zona1>0,'comuna donde se prestan los servicios');
  req(AFP_DT[t.afp]!=null,`AFP con código DT${t.afp?` (${t.afp})`:''}`);
  req(SALUD_DT[t.salud]!=null,`institución de salud con código DT${t.salud&&SALUD_DT[t.salud]==null?` (${t.salud} no figura en la tabla DT)`:''}`);
  if(t.tipoPago!=='hora')req((+t.base||0)>0,'sueldo base');
  if(dc.tipoContrato===2)req(/^\d{4}-\d{2}-\d{2}$/.test(dc.fechaFin),'fecha de término (contrato a plazo fijo)');
  if(dc.tipoJornada===6)req(dc.nroResolucion&&/^\d{4}-\d{2}-\d{2}$/.test(dc.fechaResolucion),'resolución de jornada excepcional (número y fecha)');
  if(![6,7].includes(dc.tipoJornada)){
    req(dc.duracion>=1&&dc.duracion<=180,'duración de la jornada (1 a 180 horas)');
  }
  if([1,2,5,8,9].includes(dc.tipoJornada)){
    req(dc.colacion===0||(dc.colacion>=30&&dc.colacion<=240),'tiempo de colación (0, o entre 30 y 240 minutos)');
    const hs=horasSemana(dc);
    req(hs.dias>0,'horario de trabajo (al menos un día)');
    if(hs.dias&&[1,2,8,9].includes(dc.tipoJornada)&&Math.abs(hs.horas-dc.duracion)>0.5)avi.push(`el horario suma ${String(hs.horas).replace('.',',')} h semanales y la jornada pactada es ${dc.duracion} h`);
  }
  if(dc.subcontratacion)req(rutDT(dc.rutPrincipal),'RUT de la empresa principal (subcontratación)');
  if(dc.gratForma===3)req(String(dc.gratModalidad).trim(),'modalidad de la gratificación convencional');
  return {ok:!err.length,faltan:err,avisos:avi,dc};
}

// ── Fila CSV ──
function filaContrato(t){
  const dc=datosContrato(t),r={};COLUMNAS.forEach(k=>r[k]='');
  const uf=getUF(),utm=getUTM();
  let imponible=+t.base||0;
  try{imponible=calcularLiquidacion(t,uf,utm,null).totalImponible;}catch(e){}
  const apellidos=[t.apellidoPaterno,t.apellidoMaterno].filter(Boolean).join(' ');
  Object.assign(r,{
    CATEGORIA_CONTRATO:'1',COMUNA_CELEBRACION:String(dc.comunaCelebracion||''),FECHA_SUSCRPCION:fDT(dc.fechaSuscripcion),
    RUT_TRABAJADOR:dc.dni?'':rutDT(t.rut),DNI_TRABAJADOR:dc.dni||'',FECHA_NACIMIENTO:fDT(dc.fechaNacimiento),
    NOMBRES:(t.nombres||t.nombre||'').trim(),APELLIDOS:apellidos,SEXO:t.sexo==='F'?'1':(t.sexo==='M'?'2':''),
    NACIONALIDAD:String(dc.nacionalidad||''),EMAIL:dc.email,TELEFONO:String(dc.telefono||'').replace(/[^0-9+]/g,''),
    COMUNA:String(dc.domComuna||''),CALLE:dc.domCalle,NUMERO:dc.domNumero,DPTO:dc.domDpto,
    DECLARACION_DISCAPACIDAD:String((t.lre&&t.lre.discapacidad)==='1'?1:0),
    DECLARACION_INVALIDEZ:String(['2','3'].includes(String(t.lre&&t.lre.discapacidad))?1:0),
    FUNCIONES:String(dc.funciones||'').slice(0,300),SUBCONTRATACION:String(dc.subcontratacion?1:0),
    RUT_EMPRESA_PRINCIPAL:dc.subcontratacion?rutDT(dc.rutPrincipal):'',EST:'0',
    ZONA_GEOGRAFICA_1:String(dc.zona1||''),
    SUELDO_BASE:entero(t.base),MONTO_IMPONIBLE:entero(imponible),
    GRAT_FORMA_PAGO:String(dc.gratForma),GRAT_MODALIDAD:dc.gratForma===3?String(dc.gratModalidad).slice(0,2000):'',
    GRAT_PERIODO_PAGO:[2,3,4].includes(dc.gratForma)?'1':'',
    REM_PERIODO_PAGO:'1',REM_FECHA_PAGO:String(dc.diaPago),REM_FORMA_PAGO:String(dc.formaPago),REM_ANTICIPO:String(dc.anticipo),
    REM_AFP:String(AFP_DT[t.afp]??''),REM_SALUD:String(SALUD_DT[t.salud]??''),REM_OTROS_PACTOS:String(dc.otrosPactos||'').slice(0,2000),
    TIPO_JORNADA:String(dc.tipoJornada),NRO_RESOLUCION:dc.tipoJornada===6?String(dc.nroResolucion).slice(0,12):'',FECHA_RESOLUCION:dc.tipoJornada===6?fDT(dc.fechaResolucion):'',
    TIPO_CONTRATO:String(dc.tipoContrato),FECHA_INI_RELABORAL:fDT(dc.fechaInicio),FECHA_FIN_RELABORAL:dc.tipoContrato===2?fDT(dc.fechaFin):'',
  });
  // Haberes pactados distintos del sueldo base (Tabla 2)
  const haberes=[];
  if(+t.colacion)haberes.push([30,t.colacion]);
  if(+t.movilizacion)haberes.push([31,t.movilizacion]);
  if(+t.otros)haberes.push([11,t.otros]);
  haberes.slice(0,5).forEach(([cod,monto],i)=>{r[`HABER_${i+1}`]=String(cod);r[`MONTO_${i+1}`]=entero(monto);r[`PER_DEVENGAMIENTO_${i+1}`]='5';});
  if(![6,7].includes(dc.tipoJornada)){r.DURACION_JORNADA=String(dc.duracion);r.TURNOS=String(dc.turnos);}
  if([1,2,5,8,9].includes(dc.tipoJornada)){
    const col=+dc.colacion||0;
    r.TIEMPO_COLACION=String(col);r.T_COLACION_IMP=String(dc.colacionImputable?col:0);r.T_COLACION_NO_IMP=String(dc.colacionImputable?0:col);
    DIAS.forEach(([k,COL])=>{
      if(k==='do'&&![8,9].includes(dc.tipoJornada)&&!(dc.horario.do||[])[0])return;
      const h=dc.horario[k]||['',''];r[`${COL}_HORA_INICIO`]=hhmm(h[0]);r[`${COL}_HORA_TERMINO`]=hhmm(h[1]);
    });
  }
  if([1,2,8,9].includes(dc.tipoJornada))r.ROTACION=String(dc.turnos);
  ['OTROS_INDEMNIZACIONES','OTROS_FERIADOS','OTROS_NEGOCIACIONES','OTROS_PROPINTELECTUAL','OTROS_LICMEDICA',
   'OTROS_SALACUNA','OTROS_PERMISOS','OTROS_CONESPECIALES','OTROS_SEGUROS','OTROS_STOCK','OTROS_INSTCOLECTIVO'].forEach(k=>r[k]='0');
  return r;
}
const csvCampo=v=>{const s=String(v??'').replace(/[\r\n;]+/g,' ').trim();return /"/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
function csvContratos(trabs){
  return [COLUMNAS.join(';'),...trabs.map(t=>{const r=filaContrato(t);return COLUMNAS.map(k=>csvCampo(r[k])).join(';');})].join('\r\n')+'\r\n';
}
// El portal de la DT trabaja en ANSI (igual que el LRE)
function aWindows1252(text){
  const out=[];for(const ch of text){const cp=ch.codePointAt(0);out.push(cp<=255?cp:0x3F);}
  return new Uint8Array(out);
}
function descargar(texto,nombre){
  const blob=new Blob([aWindows1252(texto)],{type:'text/csv;charset=windows-1252'}),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function nombreArchivo(sufijo){
  const rut=String(S.empresa.rut||'').toUpperCase().replace(/[^0-9K]/g,'');
  const h=new Date();const per=`${h.getFullYear()}${String(h.getMonth()+1).padStart(2,'0')}`;
  return `${rut}_${per}${sufijo?'_'+sufijo:''}.csv`;
}

// ── Plazo de registro: 15 días hábiles desde la suscripción (aprox., lunes a viernes) ──
function venceRegistro(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
  const d=new Date(+m[1],+m[2]-1,+m[3]);let n=0;
  while(n<15){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)n++;}
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Vista ──
const CDT={sel:new Set(),verInformados:false,editId:null};
function opts(lista,val){return lista.map(([v,nm])=>`<option value="${v}" ${String(v)===String(val)?'selected':''}>${v} · ${esc(nm)}</option>`).join('');}
function optsComunas(val){return '<option value="">Seleccionar…</option>'+DT_COMUNAS.slice().sort((a,b)=>a.nm.localeCompare(b.nm,'es')).map(c=>`<option value="${c.cd}" ${String(c.cd)===String(val)?'selected':''}>${esc(c.nm)} (${c.cd})</option>`).join('');}
function optsNac(val){return '<option value="">Seleccionar…</option>'+DT_NACIONALIDADES.map(c=>`<option value="${c.cd}" ${String(c.cd)===String(val)?'selected':''}>${esc(c.nm)} (${c.cd})</option>`).join('');}

function renderContratosDT(){
  const el=document.getElementById('rem-content');if(!el)return;
  const tabs=window.tabsRemuneraciones?window.tabsRemuneraciones():'';
  const D=defaultsEmpresa();
  const hoy=new Date().toISOString().slice(0,10);
  const trabs=(S.trabajadores||[]).filter(t=>!(t.lre&&t.lre.fechaTermino&&t.lre.fechaTermino<hoy&&!t.contratoDT));
  const lista=trabs.filter(t=>CDT.verInformados||!(t.contratoDT&&t.contratoDT.informado));
  const filas=lista.map(t=>{
    const v=validarContrato(t),dc=v.dc,inf=dc.informado;
    const vence=venceRegistro(dc.fechaSuscripcion);
    const atrasado=!inf&&vence&&vence<hoy;
    const estado=inf?`<span style="color:var(--ach)">✓ Informado ${fCorta(inf)}</span>`
      :v.ok?`<span style="color:var(--info)">Listo para informar</span>${v.avisos.length?`<div style="font-size:10px;color:var(--warn)">⚠️ ${esc(v.avisos[0])}</div>`:''}`
      :`<span style="color:var(--err)" title="Falta: ${esc(v.faltan.join(', '))}">Faltan ${v.faltan.length} dato(s)</span><div style="font-size:10px;color:var(--mt);max-width:320px;white-space:normal">${esc(v.faltan.slice(0,3).join(', '))}${v.faltan.length>3?'…':''}</div>`;
    return `<tr>
      <td style="text-align:center"><input type="checkbox" ${CDT.sel.has(t.id)?'checked':''} ${v.ok?'':'disabled'} onchange="cdtSel('${t.id}',this.checked)" style="width:16px;height:16px"></td>
      <td class="tl" style="font-size:12px">${esc(t.nombre||'')}<div style="font-size:10px;color:var(--mt)">${esc(t.rut||'')} · ${esc(t.cargo||'sin cargo')}</div></td>
      <td class="tl">${fCorta(dc.fechaSuscripcion)}</td>
      <td class="tl" style="${atrasado?'color:var(--err);font-weight:700':''}">${inf?'—':(vence?fCorta(vence)+(atrasado?' · vencido':''):'—')}</td>
      <td class="tl">${estado}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-i" onclick="cdtEditar('${t.id}')" title="Datos del contrato">✏️ Datos</button>
        <button class="btn btn-i" onclick="cdtCSVUno('${t.id}')" ${v.ok?'':'disabled'} title="Descargar CSV sólo de este trabajador">⬇️ CSV</button>
        ${inf?`<button class="btn btn-g" onclick="cdtMarcar('${t.id}',false)" title="Volver a pendiente">↺</button>`:`<button class="btn btn-g" onclick="cdtMarcar('${t.id}',true)" title="Marcar como informado a la DT">✓</button>`}
      </td></tr>`;}).join('');
  const nSel=[...CDT.sel].filter(id=>lista.some(t=>t.id===id)).length;
  el.innerHTML=tabs+`
  <div class="info-tip" style="font-size:11px;margin-bottom:12px">📑 Los contratos de trabajo se registran en <strong>Mi DT</strong> (Registro de contratos → carga masiva) dentro de los 15 días hábiles siguientes a su firma. Este CSV sigue la plantilla del <strong>Instructivo de Registro Masivo de Contratos</strong> de la DT: separador punto y coma, un archivo por cargo, máximo 1.000 trabajadores. El plazo que se muestra es aproximado (no descuenta feriados).</div>
  <details class="card" style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px">⚙️ Valores por defecto de la empresa (jornada, horario, pago)</summary>
    <div class="fg" style="margin-top:10px">
      <div class="grp"><label>Comuna de celebración</label><select id="cdt-d-celeb">${optsComunas(D.comunaCelebracion)}</select></div>
      <div class="grp"><label>Comuna donde se prestan los servicios</label><select id="cdt-d-zona">${optsComunas(D.zona1)}</select></div>
      <div class="grp"><label>Tipo de jornada</label><select id="cdt-d-tj">${opts(TIPOS_JORNADA,D.tipoJornada)}</select></div>
      <div class="grp"><label>Duración jornada (horas semanales)</label><input type="number" id="cdt-d-dur" min="1" max="180" value="${D.duracion}"></div>
      <div class="grp"><label>Turno</label><select id="cdt-d-turno">${opts([[1,'Horario fijo sin turno'],[2,'Mañana'],[3,'Tarde'],[4,'Noche']],D.turnos)}</select></div>
      <div class="grp"><label>Colación (minutos)</label><input type="number" id="cdt-d-col" min="0" max="240" value="${D.colacion}"></div>
      <div class="grp"><label>Colación imputable a la jornada</label><select id="cdt-d-colimp"><option value="0" ${D.colacionImputable?'':'selected'}>No</option><option value="1" ${D.colacionImputable?'selected':''}>Sí</option></select></div>
      <div class="grp"><label>Día de pago (1 a 30)</label><input type="number" id="cdt-d-dia" min="1" max="30" value="${D.diaPago}"></div>
      <div class="grp"><label>Forma de pago</label><select id="cdt-d-forma">${opts(FORMAS_PAGO,D.formaPago)}</select></div>
      <div class="grp"><label>Anticipo</label><select id="cdt-d-ant">${opts(ANTICIPOS,D.anticipo)}</select></div>
    </div>
    <div style="font-size:11px;font-weight:700;margin:8px 0 4px">Horario (deja en blanco los días libres)</div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));gap:6px">${DIAS.map(([k,,nm])=>`<div class="grp"><label>${nm}</label><input type="time" id="cdt-d-${k}-i" value="${esc((D.horario[k]||[])[0]||'')}"><input type="time" id="cdt-d-${k}-f" value="${esc((D.horario[k]||[])[1]||'')}" style="margin-top:3px"></div>`).join('')}</div>
    <div style="margin-top:8px;display:flex;gap:10px;align-items:center"><button class="btn btn-p" onclick="cdtGuardarDefaults()">💾 Guardar valores por defecto</button><span id="cdt-d-horas" style="font-size:11px;color:var(--mt)">${(()=>{const h=horasSemana({...D});return `Horario: ${String(h.horas).replace('.',',')} h semanales en ${h.dias} días`;})()}</span></div>
  </details>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
    <label style="display:inline-flex;gap:6px;align-items:center;font-size:12px;text-transform:none;letter-spacing:0;font-weight:400"><input type="checkbox" ${CDT.verInformados?'checked':''} onchange="cdtVerInformados(this.checked)" style="width:auto"> Mostrar también los ya informados</label>
    <span style="flex:1"></span>
    <button class="btn btn-g" onclick="cdtSelTodos(true)">Seleccionar listos</button>
    <button class="btn btn-p" onclick="cdtCSVMasivo()" ${nSel?'':'disabled'}>⬇️ CSV masivo (${nSel})</button>
  </div>
  ${lista.length?`<div class="card-np"><div class="tw"><table>
    <thead><tr><th></th><th class="tl">TRABAJADOR</th><th class="tl">FIRMA CONTRATO</th><th class="tl">PLAZO REGISTRO</th><th class="tl">ESTADO</th><th></th></tr></thead>
    <tbody>${filas}</tbody></table></div></div>`:`<div class="empty"><div class="ei">📑</div>${trabs.length?'Todos los contratos están informados.':'No hay trabajadores registrados.'}</div>`}`;
}
function cdtSel(id,on){on?CDT.sel.add(id):CDT.sel.delete(id);renderContratosDT();}
function cdtSelTodos(){
  (S.trabajadores||[]).forEach(t=>{if(!(t.contratoDT&&t.contratoDT.informado)&&validarContrato(t).ok)CDT.sel.add(t.id);});
  renderContratosDT();
}
function cdtVerInformados(v){CDT.verInformados=!!v;renderContratosDT();}
async function guardarTrabajadores(){
  try{const r=await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));return !(r&&r.ok===false);}catch(e){console.error(e);return false;}
}
async function cdtGuardarDefaults(){
  const g=id=>document.getElementById(id)?.value??'';
  const horario={};DIAS.forEach(([k])=>{horario[k]=[g(`cdt-d-${k}-i`),g(`cdt-d-${k}-f`)];});
  S.empresa.contratoDT={comunaCelebracion:g('cdt-d-celeb'),zona1:g('cdt-d-zona'),tipoJornada:+g('cdt-d-tj')||1,duracion:+g('cdt-d-dur')||42,
    turnos:+g('cdt-d-turno')||1,colacion:+g('cdt-d-col')||0,colacionImputable:g('cdt-d-colimp')==='1',horario,
    diaPago:Math.min(30,Math.max(1,+g('cdt-d-dia')||30)),formaPago:+g('cdt-d-forma')||5,anticipo:+g('cdt-d-ant')||1};
  try{const r=await window.storage.set('empresa',JSON.stringify(S.empresa));if(r&&r.ok===false)throw new Error('no ok');toast('💾 Valores por defecto guardados');}
  catch(e){toast('❌ No se pudieron guardar los valores por defecto','e');}
  renderContratosDT();
}

// ── Modal de datos del contrato ──
function asegurarModal(){
  let m=document.getElementById('cdt-modal');
  if(!m){m=document.createElement('div');m.id='cdt-modal';m.className='modal-bkd';
    m.innerHTML='<div class="modal-box modal-fit" style="max-width:900px"><div id="cdt-body" class="modal-scroll"></div></div>';document.body.appendChild(m);}
  return m;
}
function cdtEditar(id){
  const t=(S.trabajadores||[]).find(x=>x.id===id);if(!t)return;
  CDT.editId=id;const dc=datosContrato(t);const v=validarContrato(t);
  const H=dc.horario;
  document.getElementById('cdt-body')||asegurarModal();
  asegurarModal().classList.add('open');
  document.getElementById('cdt-body').innerHTML=`
    <div class="modal-hdr"><div><div class="modal-title">📑 Datos del contrato para la DT</div>
      <div class="modal-sub">${esc(t.nombre||'')} · ${esc(t.rut||'')} · lo demás (sueldo, AFP, salud, sexo, inicio) sale de la ficha</div></div>
      <button class="btn btn-g" onclick="cdtCerrar()">✕</button></div>
    <div class="fg" style="margin-top:10px">
      <div class="grp"><label>Fecha de suscripción *</label><input type="date" id="cdt-fsus" value="${esc(dc.fechaSuscripcion)}"></div>
      <div class="grp"><label>Tipo de contrato *</label><select id="cdt-tc">${opts([[1,'Indefinido'],[2,'Plazo fijo'],[3,'Obra o faena']],dc.tipoContrato)}</select></div>
      <div class="grp"><label>Fecha de término (plazo fijo)</label><input type="date" id="cdt-ffin" value="${esc(dc.fechaFin)}"></div>
      <div class="grp"><label>Fecha de nacimiento *</label><input type="date" id="cdt-fnac" value="${esc(dc.fechaNacimiento)}"></div>
      <div class="grp"><label>Nacionalidad *</label><select id="cdt-nac">${optsNac(dc.nacionalidad)}</select></div>
      <div class="grp"><label>DNI (sólo extranjero sin RUT)</label><input type="text" id="cdt-dni" value="${esc(dc.dni)}"></div>
      <div class="grp"><label>Email</label><input type="text" inputmode="email" id="cdt-email" value="${esc(dc.email)}"></div>
      <div class="grp"><label>Teléfono</label><input type="text" id="cdt-tel" value="${esc(dc.telefono)}" placeholder="9XXXXXXXX"></div>
      <div class="grp"><label>Comuna domicilio *</label><select id="cdt-dcom">${optsComunas(dc.domComuna)}</select></div>
      <div class="grp"><label>Calle *</label><input type="text" id="cdt-dcalle" value="${esc(dc.domCalle)}"></div>
      <div class="grp"><label>Número</label><input type="text" id="cdt-dnum" value="${esc(dc.domNumero)}"></div>
      <div class="grp"><label>Depto.</label><input type="text" id="cdt-ddpto" value="${esc(dc.domDpto)}"></div>
      <div class="grp full"><label>Funciones * (máx. 300)</label><input type="text" id="cdt-func" maxlength="300" value="${esc(dc.funciones)}"></div>
      <div class="grp"><label>Comuna de celebración *</label><select id="cdt-celeb">${optsComunas(dc.comunaCelebracion)}</select></div>
      <div class="grp"><label>Comuna prestación de servicios *</label><select id="cdt-zona">${optsComunas(dc.zona1)}</select></div>
      <div class="grp"><label>Tipo de jornada</label><select id="cdt-tj">${opts(TIPOS_JORNADA,dc.tipoJornada)}</select></div>
      <div class="grp"><label>Duración (h semanales)</label><input type="number" id="cdt-dur" min="1" max="180" value="${dc.duracion}"></div>
      <div class="grp"><label>N° resolución (jornada excepcional)</label><input type="text" id="cdt-nres" maxlength="12" value="${esc(dc.nroResolucion)}"></div>
      <div class="grp"><label>Fecha resolución</label><input type="date" id="cdt-fres" value="${esc(dc.fechaResolucion)}"></div>
      <div class="grp"><label>Gratificación</label><select id="cdt-grat">${opts(GRAT_FORMAS,dc.gratForma)}</select></div>
      <div class="grp"><label>Modalidad (si es convencional)</label><input type="text" id="cdt-gratmod" value="${esc(dc.gratModalidad)}"></div>
      <div class="grp"><label>Día de pago</label><input type="number" id="cdt-dia" min="1" max="30" value="${dc.diaPago}"></div>
      <div class="grp"><label>Forma de pago</label><select id="cdt-forma">${opts(FORMAS_PAGO,dc.formaPago)}</select></div>
      <div class="grp"><label>Anticipo</label><select id="cdt-ant">${opts(ANTICIPOS,dc.anticipo)}</select></div>
      <div class="grp"><label>Colación (min)</label><input type="number" id="cdt-col" min="0" max="240" value="${dc.colacion}"></div>
      <div class="grp"><label>Subcontratación</label><select id="cdt-sub"><option value="0">No</option><option value="1" ${dc.subcontratacion?'selected':''}>Sí</option></select></div>
      <div class="grp"><label>RUT empresa principal</label><input type="text" id="cdt-rutp" value="${esc(dc.rutPrincipal)}"></div>
      <div class="grp full"><label>Otros pactos (opcional, máx. 2.000)</label><input type="text" id="cdt-otros" maxlength="2000" value="${esc(dc.otrosPactos)}"></div>
    </div>
    <label style="display:inline-flex;gap:6px;align-items:center;font-size:12px;margin-top:8px;text-transform:none;letter-spacing:0;font-weight:400"><input type="checkbox" id="cdt-hprop" ${dc.horarioPropio?'checked':''} style="width:auto" onchange="document.getElementById('cdt-hgrid').style.opacity=this.checked?1:.5"> Horario propio (si no, usa el de la empresa)</label>
    <div id="cdt-hgrid" style="display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));gap:6px;margin-top:6px;opacity:${dc.horarioPropio?1:.5}">${DIAS.map(([k,,nm])=>`<div class="grp"><label>${nm}</label><input type="time" id="cdt-${k}-i" value="${esc((H[k]||[])[0]||'')}"><input type="time" id="cdt-${k}-f" value="${esc((H[k]||[])[1]||'')}" style="margin-top:3px"></div>`).join('')}</div>
    ${v.faltan.length?`<div class="rd-err" style="margin-top:8px">⛔ Falta: ${esc(v.faltan.join(', '))}</div>`:''}
    ${v.avisos.map(a=>`<div class="rd-avi">⚠️ ${esc(a)}</div>`).join('')}
    <div class="modal-footer"><button class="btn btn-d" onclick="cdtCerrar()">Cancelar</button><span style="flex:1"></span><button class="btn btn-g" onclick="cdtGuardar()">💾 Guardar datos</button><button class="btn btn-p" onclick="cdtGuardar(true)" title="Guarda y descarga el CSV de este trabajador para subirlo a Mi DT">⬇️ Guardar y descargar CSV DT</button></div>`;
}
// Al cerrar se vuelve a la vista desde donde se abrió (pestaña Contratos DT o ficha/lista)
function cdtCerrar(){
  const m=document.getElementById('cdt-modal');if(m)m.classList.remove('open');
  if(window.getRemView&&window.getRemView()==='contratosdt')renderContratosDT();
  else if(typeof window.renderRemuneraciones==='function')window.renderRemuneraciones();
}
async function cdtGuardar(descargarCSV){
  const t=(S.trabajadores||[]).find(x=>x.id===CDT.editId);if(!t)return;
  const g=id=>document.getElementById(id)?.value??'';
  const prev=t.contratoDT||{};
  const horarioPropio=!!document.getElementById('cdt-hprop')?.checked;
  const horario={};DIAS.forEach(([k])=>{horario[k]=[g(`cdt-${k}-i`),g(`cdt-${k}-f`)];});
  t.contratoDT={...prev,fechaSuscripcion:g('cdt-fsus'),tipoContrato:+g('cdt-tc')||1,fechaFin:g('cdt-ffin'),fechaNacimiento:g('cdt-fnac'),
    nacionalidad:g('cdt-nac'),dni:g('cdt-dni').trim(),email:g('cdt-email').trim(),telefono:g('cdt-tel').trim(),
    domComuna:g('cdt-dcom'),domCalle:g('cdt-dcalle').trim(),domNumero:g('cdt-dnum').trim(),domDpto:g('cdt-ddpto').trim(),
    funciones:g('cdt-func').trim(),comunaCelebracion:g('cdt-celeb'),zona1:g('cdt-zona'),tipoJornada:+g('cdt-tj')||1,
    duracion:g('cdt-dur'),nroResolucion:g('cdt-nres').trim(),fechaResolucion:g('cdt-fres'),gratForma:+g('cdt-grat')||'',
    gratModalidad:g('cdt-gratmod').trim(),diaPago:+g('cdt-dia')||'',formaPago:+g('cdt-forma')||'',anticipo:+g('cdt-ant')||'',
    colacion:g('cdt-col'),subcontratacion:+g('cdt-sub')||0,rutPrincipal:g('cdt-rutp').trim(),otrosPactos:g('cdt-otros').trim(),
    horarioPropio,...(horarioPropio?{horario}:{})};
  if(!(await guardarTrabajadores())){toast('❌ No se pudieron guardar los datos','e');return;}
  const v=validarContrato(t);
  toast(v.ok?'💾 Datos guardados · listo para informar':`💾 Guardado · faltan ${v.faltan.length} dato(s)`);
  if(descargarCSV&&!v.ok){toast(`⚠️ Para descargar el CSV completa: ${v.faltan.join(', ')}`,'e');cdtEditar(t.id);return;}
  if(v.ok)CDT.sel.add(t.id);
  cdtCerrar();
  if(descargarCSV)exportar([t]);
}

// ── Descargas ──
async function marcarInformados(ids){
  const hoy=new Date();const iso=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  (S.trabajadores||[]).forEach(t=>{if(ids.includes(t.id))t.contratoDT={...(t.contratoDT||{}),informado:iso};});
  if(!(await guardarTrabajadores()))toast('❌ No se pudo guardar el estado','e');
  ids.forEach(id=>CDT.sel.delete(id));
}
async function exportar(trabs){
  const malos=trabs.filter(t=>!validarContrato(t).ok);
  if(malos.length){toast(`⚠️ ${malos.length} trabajador(es) con datos incompletos: completa con ✏️ Datos`,'e');return;}
  if(trabs.length>1000){toast('⚠️ La DT acepta máximo 1.000 trabajadores por archivo','e');return;}
  // Un archivo por cargo
  const grupos=new Map();
  trabs.forEach(t=>{const k=String(t.cargo||'sin cargo').trim()||'sin cargo';if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(t);});
  const varios=grupos.size>1;
  [...grupos.entries()].forEach(([cargo,lista],i)=>{
    const suf=varios?norm(cargo).toLowerCase().replace(/\s+/g,'_').slice(0,30):'';
    setTimeout(()=>descargar(csvContratos(lista),nombreArchivo(suf)),i*400);
  });
  const avisos=trabs.flatMap(t=>validarContrato(t).avisos.map(a=>`${t.nombre}: ${a}`));
  setTimeout(async()=>{
    if(confirm(`${varios?`Se generaron ${grupos.size} archivos (uno por cargo: ${[...grupos.keys()].join(', ')}).\n\n`:''}${avisos.length?'Revisa antes de subir:\n• '+avisos.join('\n• ')+'\n\n':''}Sube el archivo en Mi DT → Registro de contratos → Carga masiva.\n\n¿Marcar ${trabs.length===1?'el contrato':'los '+trabs.length+' contratos'} como informado${trabs.length===1?'':'s'} a la DT?`)){
      await marcarInformados(trabs.map(t=>t.id));toast('✓ Contratos marcados como informados');
    }
    renderContratosDT();
  },grupos.size*400+200);
}
function cdtCSVUno(id){const t=(S.trabajadores||[]).find(x=>x.id===id);if(t)exportar([t]);}
function cdtCSVMasivo(){exportar((S.trabajadores||[]).filter(t=>CDT.sel.has(t.id)));}
async function cdtMarcar(id,informado){
  const t=(S.trabajadores||[]).find(x=>x.id===id);if(!t)return;
  if(informado){await marcarInformados([id]);toast('✓ Marcado como informado');}
  else{t.contratoDT={...(t.contratoDT||{}),informado:''};if(!(await guardarTrabajadores()))toast('❌ No se pudo guardar','e');}
  renderContratosDT();
}

export {COLUMNAS, AFP_DT, SALUD_DT, datosContrato, validarContrato, filaContrato, csvContratos, venceRegistro, horasSemana,
  renderContratosDT, cdtSel, cdtSelTodos, cdtVerInformados, cdtGuardarDefaults, cdtEditar, cdtCerrar, cdtGuardar, cdtCSVUno, cdtCSVMasivo, cdtMarcar};
