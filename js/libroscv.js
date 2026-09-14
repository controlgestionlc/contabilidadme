// libroscv.js — Libros mensuales de Compras y Ventas para control interno.
// Replica las dimensiones de resumen/detalle del RCV del SII, sin presentarse
// como sustituto del Registro oficial ni como archivo de carga directa.
import {S} from './state.js';
import {MESES,fmtC,rutFmt,dteC,dteV} from './core.js';
import {todosDocsCompras,todosDocsVentas} from './asientos.js';
import {periodoContableCompra} from './motor-contable.js';
import {foliosMensuales} from './helpers.js';

const abs=v=>Math.abs(Number(v)||0);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const periodo=(mes)=>`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
const nombreDte=(tipo,cod)=>(tipo==='compras'?dteC(cod):dteV(cod))?.nm||`DTE ${cod}`;
const signoDte=(tipo,cod)=>(tipo==='compras'?dteC(cod):dteV(cod))?.signo||1;
const rutDoc=d=>rutFmt(d.rutCodigo||'',d.rutDV||'');
let LCV={tipo:'compras',mes:'',dte:''};

function mesInicial(){
  const todos=[...(S.compras||[]).map(d=>periodoContableCompra(d)),...(S.ventas||[]).map(d=>String(d.fecha||'').slice(0,7))]
    .filter(p=>String(p).startsWith(`${S.empresa.anio}-`)).sort();
  return todos.length?String(+todos[todos.length-1].slice(5,7)):String(new Date().getMonth()+1);
}

function documentosMes(tipo,mes){
  const per=periodo(mes);
  const arr=tipo==='compras'?todosDocsCompras():todosDocsVentas();
  return arr.filter(d=>d.estado!=='anulado'&&(tipo==='compras'?periodoContableCompra(d)===per:String(d.fecha||'').slice(0,7)===per));
}

function correlativos(tipo,docs){
  const out={};
  if(tipo==='ventas')return foliosMensuales(docs);
  let siguiente=Math.max(0,...docs.map(d=>Number.isInteger(+d.corrMes)?+d.corrMes:0))+1;
  [...docs].sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||''))||String(a.numero||'').localeCompare(String(b.numero||'')))
    .forEach(d=>{out[d.id]=Number.isInteger(+d.corrMes)&&+d.corrMes>0?+d.corrMes:siguiente++;});
  return out;
}

function naturalezaCompra(d){
  if(d.tipoCompra)return d.tipoCompra;
  if(abs(d.netoAF)||abs(d.ivaActivoFijo))return 'Activo Fijo';
  return 'Del Giro';
}
function codigoIvaNoRec(d){
  if(d.codigoIvaNoRecuperable!=null&&String(d.codigoIvaNoRecuperable)!=='')return String(d.codigoIvaNoRecuperable);
  if(abs(d.ivaNoRecuperable)&&(d.dist||[]).some(l=>l.tratamientoTributario==='rechazado'))return '3';
  return '';
}
function otrosCompra(d){
  const det=Array.isArray(d.otrosImpuestosDetalle)?d.otrosImpuestosDetalle:[];
  if(!det.length)return {conCredito:d.tratamientoOtrosImpuestos==='recuperable'?abs(d.otrosImpuestos):0,sinCredito:d.tratamientoOtrosImpuestos==='recuperable'?0:abs(d.otrosImpuestos),detalle:[]};
  return {
    conCredito:det.filter(x=>x.tratamiento==='recuperable').reduce((s,x)=>s+abs(x.monto),0),
    sinCredito:det.filter(x=>x.tratamiento!=='recuperable').reduce((s,x)=>s+abs(x.monto),0),detalle:det
  };
}

function normalizarDoc(tipo,d,corr){
  const otros=tipo==='compras'?otrosCompra(d):null;
  const ivaRec=d.ivaRecuperable!=null?abs(d.ivaRecuperable):abs(d.iva);
  const ivaNo=abs(d.ivaNoRecuperable);
  const ivaUso=abs(d.ivaUsoComun);
  return {
    id:d.id,corr,tipoDTE:+d.tipoDTE,nombreDTE:nombreDte(tipo,+d.tipoDTE),signo:signoDte(tipo,+d.tipoDTE),
    folio:String(d.numero||''),fecha:d.fecha||'',fechaVencimiento:d.fechaVencimiento||'',fechaRecepcionSII:d.fechaRecepcionSII||'',fechaAcuseSII:d.fechaAcuseSII||'',rut:rutDoc(d),razonSocial:d.razonSocial||'',
    exento:abs(d.exento),neto:abs(d.neto),iva:abs(d.iva),ivaRecuperable:ivaRec,ivaNoRecuperable:ivaNo,
    codigoIvaNoRecuperable:tipo==='compras'?codigoIvaNoRec(d):'',ivaUsoComun:ivaUso,
    netoActivoFijo:abs(d.netoAF),ivaActivoFijo:abs(d.ivaActivoFijo),ivaRetenido:abs(d.ivaRetenido),
    otrosConCredito:otros?.conCredito||0,otrosSinCredito:tipo==='compras'?(otros?.sinCredito||0):abs(d.otrosImpuestos),
    otrosDetalle:otros?.detalle||[],total:abs(d.total),naturaleza:tipo==='compras'?naturalezaCompra(d):'',
    totalIncluyeRetencion:!!d.totalIncluyeRetencion,
    refTipo:+d.referencia?.tipoDTE||'',refFolio:d.referencia?.folio||'',refFecha:d.referencia?.fecha||'',origen:d.origen||'libro'
  };
}

function resumir(tipo,docs){
  const grupos=new Map();
  docs.forEach(d=>{
    if(!grupos.has(d.tipoDTE))grupos.set(d.tipoDTE,{tipoDTE:d.tipoDTE,nombreDTE:d.nombreDTE,documentos:0,exento:0,neto:0,ivaRecuperable:0,ivaUsoComun:0,ivaNoRecuperable:0,iva:0,otros:0,total:0,efectoTotal:0});
    const g=grupos.get(d.tipoDTE);g.documentos++;g.exento+=d.exento;g.neto+=d.neto;g.ivaRecuperable+=d.ivaRecuperable;
    g.ivaUsoComun+=d.ivaUsoComun;g.ivaNoRecuperable+=d.ivaNoRecuperable;g.iva+=d.iva;
    g.otros+=d.otrosConCredito+d.otrosSinCredito;g.total+=d.total;g.efectoTotal+=d.total*d.signo;
  });
  return [...grupos.values()].sort((a,b)=>a.tipoDTE-b.tipoDTE);
}

function validarLibro(tipo,docs){
  const errores=[],avisos=[],claves=new Map(),corrs=new Map();
  docs.forEach(d=>{
    const ref=`Corr. ${d.corr} · DTE ${d.tipoDTE} N°${d.folio||'?'}`;
    if(!d.fecha||!d.tipoDTE||!d.folio||!d.rut||!d.razonSocial)errores.push(`${ref}: faltan datos esenciales del detalle SII.`);
    if(!(d.total>0))errores.push(`${ref}: el monto total debe ser mayor que cero.`);
    const componentes=d.neto+d.exento+d.iva+d.otrosConCredito+d.otrosSinCredito;
    const cuadraTotal=Math.abs(componentes-d.total)<=1||(tipo==='compras'&&d.ivaRetenido>0&&Math.abs((componentes-d.ivaRetenido)-d.total)<=1);
    if(!cuadraTotal)errores.push(`${ref}: Neto + Exento + IVA + Otros no concilia con el Total informado.`);
    const k=`${d.rut}|${d.tipoDTE}|${d.folio}`;
    if(claves.has(k))errores.push(`${ref}: documento duplicado con correlativo ${claves.get(k)}.`);else claves.set(k,d.corr);
    if(corrs.has(d.corr))errores.push(`${ref}: correlativo interno repetido.`);else corrs.set(d.corr,true);
    if(tipo==='compras'&&d.ivaNoRecuperable>0&&!d.codigoIvaNoRecuperable)avisos.push(`${ref}: falta código de IVA no recuperable (1, 2, 3, 4 o 9).`);
    if([56,60,61].includes(d.tipoDTE)&&!d.refFolio)avisos.push(`${ref}: nota sin folio de documento referenciado.`);
  });
  return {ok:errores.length===0,errores,avisos};
}

function construirLibroCV(tipo=LCV.tipo,mes=LCV.mes){
  const base=documentosMes(tipo,mes),corr=correlativos(tipo,base);
  const docs=base.map(d=>normalizarDoc(tipo,d,corr[d.id])).sort((a,b)=>a.tipoDTE-b.tipoDTE||a.corr-b.corr||a.fecha.localeCompare(b.fecha));
  return {tipo,mes:+mes,periodo:periodo(mes),docs,resumen:resumir(tipo,docs),validacion:validarLibro(tipo,docs)};
}

function totalesResumen(libro){
  return libro.resumen.reduce((t,g)=>{Object.keys(t).forEach(k=>t[k]+=g[k]||0);return t;},{documentos:0,exento:0,neto:0,ivaRecuperable:0,ivaUsoComun:0,ivaNoRecuperable:0,iva:0,otros:0,total:0,efectoTotal:0});
}
function totalesEfecto(libro){return libro.docs.reduce((t,d)=>{t.neto+=d.neto*d.signo;t.exento+=d.exento*d.signo;t.iva+=(libro.tipo==='compras'?d.ivaRecuperable:d.iva)*d.signo;t.total+=d.total*d.signo;return t;},{neto:0,exento:0,iva:0,total:0});}
function opcionesMes(){return MESES.map((m,i)=>`<option value="${i+1}" ${+LCV.mes===i+1?'selected':''}>${m} ${S.empresa.anio}</option>`).join('');}
function opcionesDte(libro){return '<option value="">Todos los tipos de documento</option>'+libro.resumen.map(g=>`<option value="${g.tipoDTE}" ${+LCV.dte===g.tipoDTE?'selected':''}>${g.tipoDTE} — ${esc(g.nombreDTE)}</option>`).join('');}

function resumenHTML(libro){
  const t=totalesResumen(libro),compra=libro.tipo==='compras';
  const head=compra?'<th>TIPO DOCUMENTO</th><th>DOCS</th><th>EXENTO</th><th>NETO</th><th>IVA REC.</th><th>IVA USO COMÚN</th><th>IVA NO REC.</th><th>TOTAL</th>'
    :'<th>TIPO DOCUMENTO</th><th>DOCS</th><th>EXENTO</th><th>NETO</th><th>IVA DÉBITO</th><th>OTROS IMP.</th><th>TOTAL</th>';
  const fila=g=>compra
    ?`<tr><td class="tl">${g.tipoDTE} — ${esc(g.nombreDTE)}</td><td>${g.documentos}</td><td>${fmtC(g.exento)}</td><td>${fmtC(g.neto)}</td><td>${fmtC(g.ivaRecuperable)}</td><td>${fmtC(g.ivaUsoComun)}</td><td>${fmtC(g.ivaNoRecuperable)}</td><td>${fmtC(g.total)}</td></tr>`
    :`<tr><td class="tl">${g.tipoDTE} — ${esc(g.nombreDTE)}</td><td>${g.documentos}</td><td>${fmtC(g.exento)}</td><td>${fmtC(g.neto)}</td><td>${fmtC(g.iva)}</td><td>${fmtC(g.otros)}</td><td>${fmtC(g.total)}</td></tr>`;
  const foot=compra
    ?`<tr><td class="tl">TOTAL REGISTRO</td><td>${t.documentos}</td><td>${fmtC(t.exento)}</td><td>${fmtC(t.neto)}</td><td>${fmtC(t.ivaRecuperable)}</td><td>${fmtC(t.ivaUsoComun)}</td><td>${fmtC(t.ivaNoRecuperable)}</td><td>${fmtC(t.total)}</td></tr>`
    :`<tr><td class="tl">TOTAL REGISTRO</td><td>${t.documentos}</td><td>${fmtC(t.exento)}</td><td>${fmtC(t.neto)}</td><td>${fmtC(t.iva)}</td><td>${fmtC(t.otros)}</td><td>${fmtC(t.total)}</td></tr>`;
  const ef=totalesEfecto(libro);
  return `<div class="card-np lcv-resumen"><div class="card-title">Resumen por tipo de documento</div><div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${libro.resumen.map(fila).join('')}</tbody><tfoot>${foot}</tfoot></table></div><div class="lcv-efecto"><strong>Efecto tributario neto (facturas/débitos − créditos):</strong><span>Exento ${fmtC(ef.exento)}</span><span>Neto ${fmtC(ef.neto)}</span><span>IVA ${fmtC(ef.iva)}</span><span>Total ${fmtC(ef.total)}</span></div></div>`;
}

function detalleHTML(libro){
  const compra=libro.tipo==='compras';
  const tipos=libro.resumen.filter(g=>!LCV.dte||+LCV.dte===g.tipoDTE);
  return tipos.map(g=>{
    const docs=libro.docs.filter(d=>d.tipoDTE===g.tipoDTE);
    const head=compra?'<th>CORR.</th><th>FECHA</th><th>FOLIO</th><th>RUT PROVEEDOR</th><th>RAZÓN SOCIAL</th><th>EXENTO</th><th>NETO</th><th>IVA REC.</th><th>IVA NO REC.</th><th>IVA USO COMÚN</th><th>OTROS IMP.</th><th>IVA RET.</th><th>TOTAL</th><th>REFERENCIA</th>'
      :'<th>CORR.</th><th>FECHA</th><th>FOLIO</th><th>RUT CLIENTE</th><th>RAZÓN SOCIAL</th><th>EXENTO</th><th>NETO</th><th>IVA DÉBITO</th><th>OTROS IMP.</th><th>TOTAL</th><th>REFERENCIA</th>';
    const rows=docs.map(d=>compra
      ?`<tr><td>${d.corr}</td><td>${d.fecha}</td><td class="tl">${esc(d.folio)}</td><td class="tl">${esc(d.rut)}</td><td class="tl">${esc(d.razonSocial)}</td><td>${fmtC(d.exento)}</td><td>${fmtC(d.neto)}</td><td>${fmtC(d.ivaRecuperable)}</td><td>${fmtC(d.ivaNoRecuperable)}</td><td>${fmtC(d.ivaUsoComun)}</td><td>${fmtC(d.otrosConCredito+d.otrosSinCredito)}</td><td>${fmtC(d.ivaRetenido)}</td><td>${fmtC(d.total)}</td><td class="tl">${d.refFolio?`DTE ${d.refTipo} N°${esc(d.refFolio)}`:'—'}</td></tr>`
      :`<tr><td>${d.corr}</td><td>${d.fecha}</td><td class="tl">${esc(d.folio)}</td><td class="tl">${esc(d.rut)}</td><td class="tl">${esc(d.razonSocial)}</td><td>${fmtC(d.exento)}</td><td>${fmtC(d.neto)}</td><td>${fmtC(d.iva)}</td><td>${fmtC(d.otrosSinCredito)}</td><td>${fmtC(d.total)}</td><td class="tl">${d.refFolio?`DTE ${d.refTipo} N°${esc(d.refFolio)}`:'—'}</td></tr>`).join('');
    return `<div class="card-np lcv-grupo"><div class="lcv-grupo-title"><strong>DTE ${g.tipoDTE} — ${esc(g.nombreDTE)}</strong><span>${docs.length} documento${docs.length===1?'':'s'} · ${fmtC(g.total)}</span></div><div class="tw"><table class="lcv-detalle"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');
}

function validacionHTML(v){
  if(v.ok&&!v.avisos.length)return '<div class="lcv-ok">✅ Estructura completa: sin duplicados ni datos esenciales faltantes.</div>';
  const bloques=[];
  if(v.errores.length)bloques.push(`<strong>⛔ ${v.errores.length} error${v.errores.length===1?'':'es'} que deben corregirse</strong>${v.errores.slice(0,12).map(x=>`<div>• ${esc(x)}</div>`).join('')}`);
  if(v.avisos.length)bloques.push(`<strong>⚠️ ${v.avisos.length} observación${v.avisos.length===1?'':'es'} tributaria${v.avisos.length===1?'':'s'}</strong>${v.avisos.slice(0,12).map(x=>`<div>• ${esc(x)}</div>`).join('')}`);
  return `<div class="lcv-validacion ${v.errores.length?'error':'warn'}">${bloques.join('<hr>')}</div>`;
}

function renderLibrosCV(){
  const box=document.getElementById('libroscv-content');if(!box)return;
  if(!LCV.mes)LCV.mes=mesInicial();
  const libro=construirLibroCV();
  box.innerHTML=`<div class="lcv-portada">
    <div><strong>${esc(S.empresa.nombre||'Empresa sin nombre')}</strong><span>RUT ${esc(S.empresa.rut||'—')} · ${esc(S.empresa.giro||'Giro no informado')}</span><span>Período tributario ${libro.periodo.replace('-','')}</span></div>
    <div><strong>REGISTRO DE ${LCV.tipo==='compras'?'COMPRAS':'VENTAS'}</strong><span>Control interno basado en estructura RCV SII</span></div>
  </div>
  <div class="filter-row lcv-filtros no-print">
    <select onchange="setLibroCVTipo(this.value)"><option value="compras" ${LCV.tipo==='compras'?'selected':''}>🧾 Libro de Compras</option><option value="ventas" ${LCV.tipo==='ventas'?'selected':''}>🛒 Libro de Ventas</option></select>
    <select onchange="setLibroCVMes(this.value)">${opcionesMes()}</select>
    <select onchange="setLibroCVDte(this.value)">${opcionesDte(libro)}</select>
    <button class="btn btn-i" onclick="exportarLibroCVExcel()">📊 Excel</button>
    <button class="btn btn-i" onclick="exportarLibroCVCSV()">📄 CSV detalle</button>
    <button class="btn btn-g" onclick="window.print()">🖨️ Imprimir / PDF</button>
  </div>
  <div class="lcv-nota no-print">ℹ️ El RCV disponible en sii.cl es el registro tributario oficial. Este reporte sirve para control, conciliación y respaldo; compáralo con la descarga del SII antes de declarar el F29.</div>
  ${validacionHTML(libro.validacion)}
  ${libro.docs.length?resumenHTML(libro)+detalleHTML(libro):'<div class="empty"><div class="ei">📚</div>No hay documentos registrados para este período.</div>'}`;
}

function setLibroCVTipo(v){LCV.tipo=v==='ventas'?'ventas':'compras';LCV.dte='';renderLibrosCV();}
function setLibroCVMes(v){LCV.mes=String(+v||1);LCV.dte='';renderLibrosCV();}
function setLibroCVDte(v){LCV.dte=String(v||'');renderLibrosCV();}

function encabezadosDetalle(tipo){
  return tipo==='compras'
    ?['N° Interno','Tipo Doc','Documento','Folio','Fecha Emisión','Fecha Recepción SII','Fecha Acuse SII','Fecha Vencimiento','RUT Proveedor','Razón Social','Naturaleza Compra','Monto Exento','Monto Neto','IVA Recuperable','Cód IVA No Recuperable','Monto IVA No Recuperable','IVA Uso Común','Otros Imp. con Crédito','Otros Imp. sin Crédito','Monto Neto Activo Fijo','IVA Activo Fijo','IVA Retenido','Monto Total','Tipo Doc Referenciado','Folio Referenciado','Fecha Referenciada']
    :['N° Interno','Tipo Doc','Documento','Folio','Fecha Emisión','Fecha Recepción SII','Fecha Acuse SII','Fecha Vencimiento','RUT Cliente','Razón Social','Monto Exento','Monto Neto','IVA Débito','Otros Impuestos','Monto Total','Tipo Doc Referenciado','Folio Referenciado','Fecha Referenciada'];
}
function filaDetalle(tipo,d){
  return tipo==='compras'
    ?[d.corr,d.tipoDTE,d.nombreDTE,d.folio,d.fecha,d.fechaRecepcionSII,d.fechaAcuseSII,d.fechaVencimiento,d.rut,d.razonSocial,d.naturaleza,d.exento,d.neto,d.ivaRecuperable,d.codigoIvaNoRecuperable,d.ivaNoRecuperable,d.ivaUsoComun,d.otrosConCredito,d.otrosSinCredito,d.netoActivoFijo,d.ivaActivoFijo,d.ivaRetenido,d.total,d.refTipo,d.refFolio,d.refFecha]
    :[d.corr,d.tipoDTE,d.nombreDTE,d.folio,d.fecha,d.fechaRecepcionSII,d.fechaAcuseSII,d.fechaVencimiento,d.rut,d.razonSocial,d.exento,d.neto,d.iva,d.otrosSinCredito,d.total,d.refTipo,d.refFolio,d.refFecha];
}
function encabezadosCSV(tipo){return tipo==='compras'
  ?['Nro','Tipo Doc','Tipo Compra','RUT Proveedor','Razon Social','Folio','Fecha Docto','Fecha Recepcion','Fecha Acuse Recibo','Monto Exento','Monto Neto','Monto IVA Recuperable','Monto Iva No Recuperable','Codigo IVA No Recuperable','Monto Total','Monto Neto Activo Fijo','IVA Activo Fijo','IVA Uso Comun','Impto. Sin Derecho a Credito','IVA No Retenido','Tabacos Puros','Tabacos Cigarrillos','Tabacos Elaborados','NCE o NDE sobre Fact. de Compra','Codigo Otro Impuesto','Valor Otro Impuesto','Tasa Otro Impuesto','Numero Interno']
  :['Nro','Tipo Doc','RUT Cliente','Razon Social','Folio','Fecha Docto','Fecha Recepcion','Fecha Acuse Recibo','Monto Exento','Monto Neto','Monto IVA','Otros Impuestos','Monto Total','Numero Interno'];}
function filaCSV(tipo,d){
  if(tipo==='ventas')return [d.corr,d.tipoDTE,d.rut,d.razonSocial,d.folio,d.fecha,d.fechaRecepcionSII,d.fechaAcuseSII,d.exento,d.neto,d.iva,d.otrosSinCredito,d.total,d.corr];
  const oi=d.otrosDetalle[0]||{},codOtro=oi.tipo&&oi.tipo!=='otro'?oi.tipo:'';
  return [d.corr,d.tipoDTE,d.naturaleza,d.rut,d.razonSocial,d.folio,d.fecha,d.fechaRecepcionSII,d.fechaAcuseSII,d.exento,d.neto,d.ivaRecuperable,d.ivaNoRecuperable,d.codigoIvaNoRecuperable,d.total,d.netoActivoFijo,d.ivaActivoFijo,d.ivaUsoComun,d.otrosSinCredito,Math.max(0,d.iva-d.ivaRetenido),0,0,0,([56,60,61].includes(d.tipoDTE)&&[45,46].includes(+d.refTipo))?1:'',codOtro,d.otrosConCredito+d.otrosSinCredito,oi.tasa||'',d.corr];
}
function ajustarHoja(ws,hdr,rows){
  ws['!cols']=hdr.map((h,i)=>({wch:Math.min(42,Math.max(String(h).length+2,...rows.slice(0,500).map(r=>String(r[i]??'').length+2)))}));
  if(rows.length)ws['!autofilter']={ref:`A1:${String.fromCharCode(64+Math.min(hdr.length,26))}${rows.length+1}`};
}
function nombreArchivo(tipo,ext){return `${tipo==='compras'?'libro_compras':'libro_ventas'}_${periodo(LCV.mes).replace('-','')}.${ext}`;}

function exportarLibroCVExcel(){
  try{
    if(typeof XLSX==='undefined')throw new Error('Biblioteca Excel no disponible');
    const libro=construirLibroCV();if(!libro.docs.length)throw new Error('No hay documentos en el período');
    if(!libro.validacion.ok&&!confirm('El libro contiene errores de validación. ¿Exportar igualmente para revisión?'))return;
    const wb=XLSX.utils.book_new(),compra=libro.tipo==='compras';
    const meta=[['REGISTRO DE '+(compra?'COMPRAS':'VENTAS')+' — CONTROL INTERNO'],['Empresa',S.empresa.nombre||''],['RUT',S.empresa.rut||''],['Giro',S.empresa.giro||''],['Domicilio',S.empresa.domicilio||''],['Comuna',S.empresa.comuna||''],['Período tributario',libro.periodo.replace('-','')],['Generado',new Date().toLocaleString('es-CL')],['Advertencia','El RCV de sii.cl es el registro tributario oficial. Este archivo es de control y conciliación.']];
    const wm=XLSX.utils.aoa_to_sheet(meta);wm['!cols']=[{wch:24},{wch:70}];XLSX.utils.book_append_sheet(wb,wm,'Datos');
    const rh=compra?['Tipo Doc','Documento','Total Documentos','Monto Exento','Monto Neto','IVA Recuperable','IVA Uso Común','IVA No Recuperable','Monto Total','Efecto firmado Total']
      :['Tipo Doc','Documento','Total Documentos','Monto Exento','Monto Neto','IVA Débito','Otros Impuestos','Monto Total','Efecto firmado Total'];
    const rr=libro.resumen.map(g=>compra?[g.tipoDTE,g.nombreDTE,g.documentos,g.exento,g.neto,g.ivaRecuperable,g.ivaUsoComun,g.ivaNoRecuperable,g.total,g.efectoTotal]
      :[g.tipoDTE,g.nombreDTE,g.documentos,g.exento,g.neto,g.iva,g.otros,g.total,g.efectoTotal]);
    const wr=XLSX.utils.aoa_to_sheet([rh,...rr]);ajustarHoja(wr,rh,rr);XLSX.utils.book_append_sheet(wb,wr,'Resumen por DTE');
    const hdr=encabezadosDetalle(libro.tipo),rows=libro.docs.map(d=>filaDetalle(libro.tipo,d));
    const wd=XLSX.utils.aoa_to_sheet([hdr,...rows]);ajustarHoja(wd,hdr,rows);XLSX.utils.book_append_sheet(wb,wd,'Detalle consolidado');
    libro.resumen.forEach(g=>{const rs=libro.docs.filter(d=>d.tipoDTE===g.tipoDTE).map(d=>filaDetalle(libro.tipo,d));const ws=XLSX.utils.aoa_to_sheet([hdr,...rs]);ajustarHoja(ws,hdr,rs);XLSX.utils.book_append_sheet(wb,ws,`DTE ${g.tipoDTE}`.slice(0,31));});
    if(libro.validacion.errores.length||libro.validacion.avisos.length){const vr=[...libro.validacion.errores.map(x=>['ERROR',x]),...libro.validacion.avisos.map(x=>['AVISO',x])];const wv=XLSX.utils.aoa_to_sheet([['Nivel','Observación'],...vr]);wv['!cols']=[{wch:12},{wch:100}];XLSX.utils.book_append_sheet(wb,wv,'Validación');}
    XLSX.writeFile(wb,nombreArchivo(libro.tipo,'xlsx'));
  }catch(e){window.toast?.('❌ No se pudo exportar: '+e.message,'e');}
}

function csvCelda(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function exportarLibroCVCSV(){
  const libro=construirLibroCV();if(!libro.docs.length){window.toast?.('⚠️ No hay documentos en el período','e');return;}
  if(!libro.validacion.ok&&!confirm('El detalle contiene errores de validación. ¿Descargar igualmente para revisión?'))return;
  const hdr=encabezadosCSV(libro.tipo),rows=libro.docs.map(d=>filaCSV(libro.tipo,d));
  const txt='\ufeff'+[hdr,...rows].map(r=>r.map(csvCelda).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download=nombreArchivo(libro.tipo,'csv');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

export {LCV,construirLibroCV,validarLibro,renderLibrosCV,setLibroCVTipo,setLibroCVMes,setLibroCVDte,exportarLibroCVExcel,exportarLibroCVCSV,encabezadosDetalle,filaDetalle,encabezadosCSV,filaCSV};
