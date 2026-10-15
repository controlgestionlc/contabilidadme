// previred.js — V2.21.32 · Archivo de carga masiva Previred
//
// Formato estándar de LARGO VARIABLE POR SEPARADOR de Previred (versión 58):
//  - 105 campos por línea, separados por punto y coma, todos presentes.
//  - Numéricos enteros, sin decimales, sin ceros a la izquierda.
//    No aplica → 0. Alfanumérico no aplica → vacío.
//  - Tasas en formato 99,99 (no aplica → 00,00).
//  - Fechas dd/mm/aaaa. Períodos mmaaaa.
//  - Una línea principal (tipo 00) por trabajador. Cada movimiento de personal
//    adicional del mes va en una línea tipo 01 inmediatamente después.
//  - Archivo .txt en ANSI (Windows-1252), fin de línea CRLF, sin encabezado.
//
// Los montos salen del Libro de Remuneraciones del mes (el cerrado, si existe)
// y los movimientos de personal, de la Asistencia y de las fechas de contrato.

import {toast, fmtC, MESES} from './core.js';
import {S} from './state.js';
import {libroDelMes} from './libroremuneraciones.js';
import {getPrevisional} from './previsional.js';
import {datosAsistencia, TIPOS_LICENCIA} from './asistencia.js';
import {getIndicadores} from './indicadores.js';

// ── Tablas oficiales (Formato Previred v58) ──
const AFP_PREVIRED={cuprum:'3',habitat:'5',provida:'8',planvital:'29',capital:'33',modelo:'34',uno:'35'};
const SALUD_PREVIRED={banmedica:'1',consalud:'2',vidatres:'3',colmena:'4',cruzblanca:'5',fonasa:'7',nuevamasvida:'10'};
const CCAF_PREVIRED={ninguna:'0',losandes:'1',laaraucana:'2',losheroes:'3','18septiembre':'6'};
const MUTUAL_PREVIRED={achs:'1',mutual:'2',ist:'3',isl:'0'};
// RUT de la entidad pagadora del subsidio (Tabla 20)
const PAGADOR_SUBSIDIO={
  banmedica:'96572800-7',consalud:'96856780-2',vidatres:'96502530-8',colmena:'76296619-0',
  cruzblanca:'96501450-0',fonasa:'61603000-0',nuevamasvida:'96504160-5',
  achs:'70360100-6',mutual:'70285100-9',ist:'70015580-3',isl:'61533000-0',
};
// Fonasa con empresa afiliada a CCAF: el 7% se reparte entre Fonasa y la caja.
// Las tasas se configuran en Previsional (Previred oct-2026: 2,8% Fonasa y 4,2% caja).
const N_CAMPOS=105;

// ── Configuración de la empresa para Previred ──
// Códigos de institución que no están en la tabla (o que Previred cambió)
// se pueden fijar a mano; también la sucursal de pago de la mutual.
function cfgPrevired(){
  const c=(S.empresa&&S.empresa.previred)||{};
  return {sucursalMutual:c.sucursalMutual||'',codigos:c.codigos||{}};
}
function codigo(tabla,mapa,key){
  const manual=cfgPrevired().codigos[`${tabla}:${key}`];
  if(manual!==undefined&&manual!=='')return String(+manual);
  return mapa[key]!==undefined?mapa[key]:null;
}

// ── Formatos ──
const num=v=>String(Math.max(0,Math.round(+v||0)));
const tasa=v=>{const n=+v||0;const [e,d]=n.toFixed(2).split('.');return `${e.padStart(2,'0')},${d}`;};
const fecha=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
const uf=v=>{const s=(+v||0).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');return s.replace('.',',');};
function textoPrevired(v,max=30){
  return String(v||'').normalize('NFD').replace(/[̀-̂̄-ͯ]/g,'')   // quita tildes, conserva la virgulilla de la Ñ
    .normalize('NFC').toUpperCase().replace(/[^A-ZÑ ]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function separarRut(r){
  const s=String(r||'').toUpperCase().replace(/[^0-9K]/g,'');
  return s.length<2?{cuerpo:'',dv:''}:{cuerpo:String(+s.slice(0,-1)),dv:s.slice(-1)};
}
function dvRut(cuerpo){
  let suma=0,mul=2;
  for(let i=cuerpo.length-1;i>=0;i--){suma+=+cuerpo[i]*mul;mul=mul===7?2:mul+1;}
  const r=11-(suma%11);return r===11?'0':r===10?'K':String(r);
}
// Nombre: usa los campos de la ficha; si faltan, divide el nombre completo
// (últimas dos palabras = apellidos) y lo marca para revisión.
function nombresTrabajador(t){
  if(t.apellidoPaterno&&t.nombres)return {pat:t.apellidoPaterno,mat:t.apellidoMaterno||'',nom:t.nombres,auto:false};
  const p=String(t.nombre||'').trim().split(/\s+/);
  if(p.length>=3)return {pat:p[p.length-2],mat:p[p.length-1],nom:p.slice(0,-2).join(' '),auto:true};
  if(p.length===2)return {pat:p[1],mat:'',nom:p[0],auto:true};
  return {pat:'',mat:'',nom:p[0]||'',auto:true};
}

// ── Movimientos de personal del mes (Tabla 7) ──
function movimientosDelMes(t,anio,mes){
  const dm=new Date(anio,mes,0).getDate();
  const ini=`${anio}-${String(mes).padStart(2,'0')}-01`, fin=`${anio}-${String(mes).padStart(2,'0')}-${String(dm).padStart(2,'0')}`;
  const recorta=(d,h)=>({desde:d<ini?ini:d,hasta:h>fin?fin:h});
  const movs=[];
  const lre=t.lre||{};
  if(lre.fechaInicio&&lre.fechaInicio>=ini&&lre.fechaInicio<=fin)
    movs.push({codigo:t.contrato==='plazo'?7:1,desde:lre.fechaInicio,hasta:'',nm:t.contrato==='plazo'?'Contratación plazo fijo':'Contratación indefinida'});
  (datosAsistencia().eventos||[]).filter(e=>e.trab===t.id&&e.desde<=fin&&(e.hasta||e.desde)>=ini).sort((a,b)=>a.desde.localeCompare(b.desde)).forEach(e=>{
    const r=recorta(e.desde,e.hasta||e.desde);
    if(e.tipo==='licencia'){
      const accidente=e.licTipo==='5'||e.licTipo==='6';
      const pagadorKey=accidente?getPrevisional().patronal.mutualInstitucion:(t.salud||'fonasa');
      const lic=TIPOS_LICENCIA.find(x=>x.k===String(e.licTipo));
      movs.push({codigo:accidente?6:3,...r,pagador:PAGADOR_SUBSIDIO[pagadorKey]||'',pagadorKey,nm:lic?lic.nm:'Licencia médica'});
    }else if(e.tipo==='permiso_sin')movs.push({codigo:4,...r,nm:'Permiso sin goce de sueldo'});
    else if(e.tipo==='ausencia')movs.push({codigo:11,...r,nm:'Ausencia injustificada'});
  });
  if(lre.fechaTermino&&lre.fechaTermino>=ini&&lre.fechaTermino<=fin)
    movs.push({codigo:2,desde:'',hasta:lre.fechaTermino,nm:'Retiro'});
  return movs;
}

// ── Construcción de las líneas ──
function lineaVacia(){return new Array(N_CAMPOS+1).fill(undefined);} // índice 1..105
function cerrarLinea(c){
  // Campos no informados: 0 si son numéricos, vacío si alfanuméricos
  const ALFA=new Set([2,3,4,5,6,14,16,17,18,25,35,36,37,41,46,51,52,53,54,56,57,76,104,105]);
  const TASAS=new Set([32,38,63,68]);
  const out=[];
  for(let i=1;i<=N_CAMPOS;i++){
    let v=c[i];
    if(v===undefined||v===null)v=ALFA.has(i)?'':TASAS.has(i)?'00,00':'0';
    out.push(String(v).replace(/;/g,' '));
  }
  return out;
}
function identificacion(c,t,per){
  const r=separarRut(t.rut),n=nombresTrabajador(t);
  c[1]=r.cuerpo;c[2]=r.dv;
  c[3]=textoPrevired(n.pat);c[4]=textoPrevired(n.mat);c[5]=textoPrevired(n.nom);
  c[6]=t.sexo==='F'?'F':t.sexo==='M'?'M':'';
  c[7]=t.nacionalidad==='1'?'1':'0';
  c[8]='1';                   // Tabla 3: 01 remuneraciones del mes
  c[9]=per;                   // mmaaaa
  c[11]='AFP';
  c[12]=String(t.tipoTrabajador||'0');
}
function lineaMovimiento(c,mv){
  c[15]=String(mv.codigo);
  c[16]=fecha(mv.desde);c[17]=fecha(mv.hasta);
  if(mv.pagador){const r=separarRut(mv.pagador);c[103]=r.cuerpo;c[104]=r.dv;}
}

function construirPrevired(mes){
  const anio=+S.empresa.anio;
  const L=libroDelMes(mes);
  const P=getPrevisional().patronal;
  const per=`${String(mes).padStart(2,'0')}${anio}`;
  const errores=[],advertencias=[],lineas=[];
  const err=(tr,campo,msg)=>errores.push({trabajador:tr,campo,msg});
  const adv=(tr,campo,msg)=>advertencias.push({trabajador:tr,campo,msg});

  const rEmp=separarRut(S.empresa.rut);
  if(!rEmp.cuerpo)err('Empresa','RUT','La empresa no tiene RUT: se necesita para el nombre del archivo.');
  const cajaKey=P.cajaInstitucion||'ninguna', conCaja=cajaKey!=='ninguna';
  const codCaja=codigo('ccaf',CCAF_PREVIRED,cajaKey);
  if(codCaja===null)err('Empresa','Campo 83',`La caja "${cajaKey}" no tiene código Previred. Ingrésalo en la configuración Previred.`);
  const mutualKey=P.mutualInstitucion||'isl';
  const codMutual=codigo('mutual',MUTUAL_PREVIRED,mutualKey);
  if(codMutual===null)err('Empresa','Campo 96',`La mutual "${mutualKey}" no tiene código Previred.`);
  if(L.cerrado&&L.lineas.some(l=>l.baseAFP===undefined))adv('Empresa','Libro','El libro de este mes se cerró con una versión anterior: las bases se reconstruyen desde los montos. Si puedes, reábrelo y ciérralo de nuevo.');
  if(!L.cerrado)adv('Empresa','Libro',`El libro de ${MESES[mes-1]} está provisorio. Ciérralo antes de declarar para que el archivo coincida con lo pagado.`);

  for(const l of L.lineas){
    const t={...((S.trabajadores||[]).find(x=>x.id===l.id)||{}),...{rut:l.rut,nombre:l.nombre,afp:l.afpKey,salud:l.saludKey,contrato:l.contrato,lre:l.lre}};
    const quien=l.nombre||l.rut||'—';
    const c=lineaVacia();
    identificacion(c,t,per);
    // Validaciones de identificación
    const r=separarRut(t.rut);
    if(!r.cuerpo)err(quien,'Campo 1','Falta el RUT del trabajador.');
    else if(dvRut(r.cuerpo)!==r.dv)err(quien,'Campo 2',`RUT ${t.rut} con dígito verificador inválido.`);
    const n=nombresTrabajador(t);
    if(textoPrevired(n.pat).length<2)err(quien,'Campo 3','Falta el apellido paterno (mínimo 2 letras). Complétalo en la ficha.');
    if(textoPrevired(n.nom).length<2)err(quien,'Campo 5','Faltan los nombres (mínimo 2 letras). Complétalo en la ficha.');
    if(n.auto)adv(quien,'Campos 3-5',`Apellidos y nombres separados automáticamente (${textoPrevired(n.pat)} / ${textoPrevired(n.mat)} / ${textoPrevired(n.nom)}). Revísalos en la ficha.`);
    if(!c[6])err(quien,'Campo 6','Falta el sexo (M/F). Complétalo en la ficha.');
    if(+c[12]===1||+c[12]===2)adv(quien,'Campo 12','Trabajador pensionado: la liquidación no aplica reglas especiales de pensionados. Revisa las cotizaciones.');

    const dias=Math.max(0,Math.min(30,+l.diasPagados||0));
    c[13]=String(dias);
    c[14]='00';
    const movs=movimientosDelMes(t,anio,mes);
    if(movs.length)lineaMovimiento(c,movs[0]);else c[15]='0';
    if(dias===0&&!movs.some(m=>m.codigo===3||m.codigo===6||m.codigo===4||m.codigo===11||m.codigo===2||m.codigo===1||m.codigo===7))
      err(quien,'Campo 13','0 días trabajados sin movimiento de personal: registra la ausencia en Asistencia.');
    // Asignación familiar (campos 18-22). Libros cerrados antes de V2.21.47 no la traen.
    if(l.tramoAF!==undefined){
      const cg=l.cargasAF||{};
      c[18]=/^[ABCD]$/.test(l.tramoAF)?l.tramoAF:'D';
      if(cg.simples)c[19]=num(cg.simples);
      if(cg.maternales)c[20]=num(cg.maternales);
      if(cg.invalidas)c[21]=num(cg.invalidas);
      if(+l.asigFamiliar>0)c[22]=num(l.asigFamiliar);
      if((cg.simples||0)>13||(cg.maternales||0)>1||(cg.invalidas||0)>1)err(quien,'Campos 19-21','Previred acepta hasta 13 cargas simples, 1 maternal y 1 inválida.');
      if(c[18]==='D'&&(cg.simples||cg.maternales||cg.invalidas))adv(quien,'Campo 18','Tiene cargas familiares, pero su tramo es D (sin derecho a asignación).');
    }else{
      c[18]='D';
      if(+(l.lre?.cargasLegales||0)>0)adv(quien,'Campos 18-22','Libro cerrado antes de calcular asignación familiar: se informa tramo D. Reabre y cierra el libro para incluirla.');
    }
    // Trabajo pesado (campos 37-39): % total 04,00 (pesado) o 02,00 (menos pesado)
    if(+l.descTrabPesado>0||+l.trabPesado>0){
      const pct=+l.tasaTrabPesado||0;
      c[37]=textoPrevired(l.puestoPesado||'',40);
      c[38]=(pct<10?'0':'')+pct.toFixed(2).replace('.',',');
      c[39]=num((+l.descTrabPesado||0)+(+l.trabPesado||0));
      if(!c[37])err(quien,'Campo 37','Falta el nombre del puesto de trabajo pesado en la ficha.');
      if(c[38]!=='04,00'&&c[38]!=='02,00')err(quien,'Campo 38',`Previred solo acepta 04,00 o 02,00 como % de trabajo pesado (calculado ${c[38]}).`);
    }

    // Bases (con respaldo para libros cerrados en versiones anteriores)
    const topeAFP=Math.round((+getIndicadores().topeAFP_UF||0)*(+L.uf||0));
    const baseAFP=l.baseAFP!==undefined?l.baseAFP:Math.min(+l.totalImponible||0,Math.round(topeAFP*dias/30));
    const baseAFC=l.baseAFC!==undefined?l.baseAFC:(l.baseCes!==undefined?l.baseCes:baseAFP);

    // AFP (campos 26-29)
    const codAFP=codigo('afp',AFP_PREVIRED,t.afp);
    if(codAFP===null)err(quien,'Campo 26',`AFP "${t.afp||'—'}" sin código Previred.`);
    c[26]=codAFP??'0';
    c[27]=num(baseAFP);
    // Campo 28: cotización obligatoria + 0,1% (o el tramo vigente) de
    // capitalización individual de la reforma, que se informa junto a ella.
    c[28]=num((+l.descAFP||0)+(+l.capInd||0));
    c[29]=num(l.sis);
    // Reforma de pensiones (Ley 21.735): campos 92 a 95
    c[92]=num(l.rentaLicencia);          // RIMA proporcional a los días de licencia
    c[93]=l.jornada==='2'?'2':'1';      // 1 jornada completa · 2 parcial (obligatorio)
    c[94]=num(l.cev);                   // compensación por expectativa de vida
    c[95]=num(l.crp);                   // cotización con rentabilidad protegida
    if(l.cev===undefined&&L.cerrado)adv(quien,'Campos 94-95','Libro cerrado antes de incorporar la reforma de pensiones: CEV y rentabilidad protegida van en 0. Reabre y cierra el libro para incluirlas.');

    // Salud (campos 70, 75-81, 84, 90)
    const salud=t.salud||'fonasa';
    const codSalud=codigo('salud',SALUD_PREVIRED,salud);
    if(codSalud===null)err(quien,'Campo 75',`La institución de salud "${salud}" no tiene código en la tabla Previred v58. Ingrésalo en la configuración Previred.`);
    c[75]=codSalud??'0';
    if(salud==='fonasa'){
      if(conCaja){
        const tCaja=isFinite(+P.ccafSaludCaja)&&P.ccafSaludCaja!==''?+P.ccafSaludCaja:4.2;
        const tFon=isFinite(+P.ccafSaludFonasa)&&P.ccafSaludFonasa!==''?+P.ccafSaludFonasa:2.8;
        if(Math.abs(tCaja+tFon-7)>0.001)adv(quien,'Campos 70 y 90',`La distribución del 7% con caja suma ${(tCaja+tFon).toLocaleString('es-CL')}%: revisa las tasas en Previsional.`);
        c[70]=num(baseAFP*tFon/100);
        c[90]=num(baseAFP*tCaja/100);
      }else c[70]=num(l.saludLegal);
      c[78]='1';
    }else{
      c[76]=String(t.numeroFUN||'').replace(/[^0-9A-Za-z]/g,'').slice(0,16);
      c[77]=num(baseAFP);
      const plan=+l.planUF||+t.plan||0;
      if(plan>0){c[78]='2';c[79]=uf(plan);}
      else{c[78]='1';c[79]=num(l.saludLegal);}
      c[80]=num(l.saludLegal);
      c[81]=num(l.adicionalIsapre);
      if(!c[76])adv(quien,'Campo 76','Falta el N° de FUN del contrato de Isapre (recomendado).');
    }
    // Accidentes del trabajo (71 ISL o 96-99 mutual)
    if(codMutual==='0')c[71]=num(l.mutual);
    else{c[96]=codMutual;c[97]=num(baseAFP);c[98]=num(l.mutual);c[99]=num(cfgPrevired().sucursalMutual||0);}
    // CCAF (83-84)
    if(conCaja&&codCaja){c[83]=codCaja;c[84]=num(baseAFP);}
    // Seguro de cesantía (100-102)
    c[100]=num(baseAFC);
    c[101]=num(l.descCesantia);
    c[102]=num(l.afc);
    if(+l.descCesantia>0&&!(baseAFC>0))err(quien,'Campo 100','Cotización de cesantía sin renta imponible.');

    lineas.push({trabajador:quien,campos:cerrarLinea(c),tipo:'00',movimiento:movs[0]||null});

    // Movimientos adicionales → líneas tipo 01
    for(const mv of movs.slice(1)){
      const d=lineaVacia();
      identificacion(d,t,per);
      d[13]='0';d[14]='01';d[18]='';
      d[26]=codAFP??'0';
      lineaMovimiento(d,mv);
      lineas.push({trabajador:quien,campos:cerrarLinea(d),tipo:'01',movimiento:mv});
    }
    movs.forEach(mv=>{
      if((mv.codigo===3||mv.codigo===6)&&!mv.pagador)err(quien,'Campo 103',`Licencia sin entidad pagadora de subsidio conocida (${mv.pagadorKey||'—'}).`);
    });
  }
  if(!L.lineas.length)err('—','Nómina','No hay trabajadores en el período.');
  return {libro:L,lineas,errores,advertencias,ok:!errores.length,
    nombre:`${rEmp.cuerpo||'empresa'}_previred_${anio}${String(mes).padStart(2,'0')}.txt`};
}

function textoArchivo(res){
  return res.lineas.map(x=>x.campos.join(';')).join('\r\n')+'\r\n';
}
function aWindows1252(text){
  const out=[];
  for(const ch of text){const cp=ch.codePointAt(0);out.push(cp<=255?cp:0x3F);}
  return new Uint8Array(out);
}
function descargar(bytes,nombre){
  const blob=new Blob([bytes],{type:'text/plain;charset=windows-1252'}),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}

const mesSel=()=>+(document.getElementById('rem-mes')?.value||1);

function mostrarValidacionPrevired(res){
  const mes=mesSel();
  const v=res||construirPrevired(mes);
  const el=document.getElementById('lre-validacion');if(!el)return v;
  const cfg=cfgPrevired();
  const filas=[...v.errores.map(x=>({...x,tipo:'❌'})),...v.advertencias.map(x=>({...x,tipo:'⚠️'}))];
  const tot=v.libro.totales||{};
  el.innerHTML=`<div class="card" style="margin-top:10px">
    <div class="card-title">📤 Previred · ${MESES[mes-1]} ${S.empresa.anio}</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:8px">Formato estándar de largo variable (105 campos separados por ";"), ${v.lineas.length} línea(s) para ${v.libro.lineas.length} trabajador(es). Total imponible ${fmtC(tot.totalImponible||0)} · AFP ${fmtC(tot.descAFP||0)} · Salud ${fmtC(tot.descSalud||0)} · Cesantía ${fmtC((tot.descCesantia||0)+(tot.afc||0))}</div>
    ${v.ok?(filas.length?'':'<div style="color:var(--ach);font-size:12px">✅ Sin errores. Archivo listo para subir.</div>')
      :`<div style="color:var(--err);font-size:12px">❌ ${v.errores.length} error(es): el archivo no se genera hasta corregirlos.</div>`}
    ${filas.length?`<div class="tw" style="margin-top:8px"><table style="font-size:11px"><thead><tr><th class="tl">TIPO</th><th class="tl">TRABAJADOR</th><th class="tl">CAMPO</th><th class="tl">DETALLE</th></tr></thead><tbody>${filas.map(x=>`<tr><td class="tl">${x.tipo}</td><td class="tl">${x.trabajador}</td><td class="tl" style="font-family:var(--mono)">${x.campo}</td><td class="tl">${x.msg}</td></tr>`).join('')}</tbody></table></div>`:''}
    <div class="fg" style="margin-top:10px">
      <div class="grp"><label>Sucursal de pago mutual (campo 99)</label><input type="number" min="0" value="${cfg.sucursalMutual}" onchange="setCfgPrevired('sucursalMutual',this.value)" placeholder="0"></div>
      <div class="grp"><label>Código manual de institución</label><input type="text" placeholder="salud:esencial=99" onchange="setCodigoPrevired(this.value)"><div style="font-size:10px;color:var(--mt);margin-top:2px">Para instituciones nuevas fuera de la tabla. Formato tabla:clave=código (tablas: afp, salud, ccaf, mutual).${Object.keys(cfg.codigos).length?' Vigentes: '+Object.entries(cfg.codigos).map(([k,c])=>k+'='+c).join(', '):''}</div></div>
    </div>
  </div>`;
  return v;
}
async function guardarCfg(c){
  S.empresa.previred={...cfgPrevired(),...c};
  const r=await window.storage.set('empresa',JSON.stringify(S.empresa));
  if(!r||r.ok===false){toast('❌ No se pudo guardar la configuración Previred','e');return false;}
  return true;
}
async function setCfgPrevired(k,v){if(await guardarCfg({[k]:String(v||'').trim()}))mostrarValidacionPrevired();}
async function setCodigoPrevired(txt){
  const m=String(txt||'').trim().match(/^(afp|salud|ccaf|mutual):([a-z0-9_]+)\s*=\s*(\d*)$/i);
  if(!m){toast('⚠️ Usa el formato tabla:clave=código, por ejemplo salud:esencial=99','e');return;}
  const codigos={...cfgPrevired().codigos};
  const k=`${m[1].toLowerCase()}:${m[2].toLowerCase()}`;
  if(m[3]==='')delete codigos[k];else codigos[k]=m[3];
  if(await guardarCfg({codigos})){toast('✅ Código Previred guardado');mostrarValidacionPrevired();}
}

function exportarPrevired(){
  const mes=mesSel();
  const v=construirPrevired(mes);
  mostrarValidacionPrevired(v);
  if(!v.ok){toast(`❌ Archivo Previred no generado: ${v.errores.length} error(es). Revisa el detalle.`,'e');return;}
  descargar(aWindows1252(textoArchivo(v)),v.nombre);
  toast(`✅ Archivo Previred generado · ${v.lineas.length} línea(s)`);
}

export {construirPrevired, textoArchivo, exportarPrevired, mostrarValidacionPrevired, setCfgPrevired, setCodigoPrevired,
        movimientosDelMes, nombresTrabajador, textoPrevired, AFP_PREVIRED, SALUD_PREVIRED};
