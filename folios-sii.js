// folios-sii.js — Impresión de libros contables en hojas sueltas foliadas/timbradas por SII
// V2.16.5
//
// Este módulo NO reemplaza la autorización de contabilidad computacional ni el
// timbraje/autorización previa de folios. Su objetivo es administrar rangos ya
// autorizados y componer las páginas del Libro Diario, Mayor, Caja e Inventarios
// y Balances para imprimirlas sobre esas hojas físicas sin reutilizar folios.

import {S, AUTH} from './state.js';
import {toast} from './core.js';
import {genDiario, buildMayor} from './reportes.js';
import {logAccion} from './firebase.js';
import {puedeEditar} from './auth.js';

const CFG_DEFAULT={
  papel:'A4',orientacion:'portrait',margenSup:30,margenDer:10,margenInf:12,margenIzq:10,
  lineas:28,orden:'asc',mostrarFolio:false
};
const EST={data:null, cargando:false, preview:null,ctx:''};
const LIBROS={
  diario:'Libro Diario',
  mayor:'Libro Mayor',
  caja:'Libro Caja',
  inventario:'Libro de Inventarios y Balances'
};

const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>'$ '+Math.round(+n||0).toLocaleString('es-CL');
const fechaCL=s=>{if(!s)return '';const [y,m,d]=String(s).slice(0,10).split('-');return `${d||''}/${m||''}/${y||''}`;};
const hoyISO=()=>new Date().toISOString();
const uid=()=>`fsii_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const puedeMutar=()=>{if(puedeEditar('foliossii'))return true;toast('🚫 Tu perfil sólo tiene permiso de lectura en Hojas foliadas SII','e');return false;};
const keyData=()=>`folios-sii-${S.empresa.anio}`;

function dataVacia(){return {version:1,config:{...CFG_DEFAULT},rangos:[],movimientos:[]};}
async function cargarFoliosSII(force=false){
  const ctx=`${String(S.empresa.rut||S.empresa.nombre||'empresa')}|${S.empresa.anio}`;
  if(EST.ctx!==ctx){EST.data=null;EST.preview=null;EST.ctx=ctx;}
  if(EST.data&&!force)return EST.data;
  if(EST.cargando)return EST.data||dataVacia();
  EST.cargando=true;
  let d=dataVacia();
  try{
    const r=await window.storage.get(keyData());
    if(r?.value){
      const p=JSON.parse(r.value);
      d={...d,...p,config:{...CFG_DEFAULT,...(p.config||{})},rangos:Array.isArray(p.rangos)?p.rangos:[],movimientos:Array.isArray(p.movimientos)?p.movimientos:[]};
    }
  }catch(e){console.error('folios SII',e);toast('⚠️ No se pudo cargar el control de folios SII','e');}
  EST.data=d;EST.cargando=false;return d;
}
async function guardarFoliosSII(accion='Actualizó control de folios SII',detalle=''){
  const r=await window.storage.set(keyData(),JSON.stringify(EST.data||dataVacia()));
  if(!r||r.ok===false)throw new Error(r?.motivo||'No se pudo guardar el control de folios');
  try{logAccion(accion,detalle);}catch(e){}
  return true;
}

function rangoActivo(){return (EST.data?.rangos||[]).find(r=>r.activo!==false)||null;}
function estadosPorFolio(){
  const m=new Map();
  for(const mov of EST.data?.movimientos||[]){
    for(const f of mov.folios||[]){
      if(mov.estado==='usado'||mov.estado==='reservado'||mov.estado==='inutilizado')m.set(+f,mov.estado);
    }
  }
  return m;
}
function siguienteBloque(cantidad){
  const r=rangoActivo();if(!r)return null;
  const usados=estadosPorFolio();
  for(let ini=+r.desde;ini<=+r.hasta-cantidad+1;ini++){
    let ok=true;for(let f=ini;f<ini+cantidad;f++){if(usados.has(f)){ok=false;ini=f;break;}}
    if(ok)return Array.from({length:cantidad},(_,i)=>ini+i);
  }
  return null;
}
function resumenRango(r){
  if(!r)return {total:0,usados:0,reservados:0,inutilizados:0,libres:0};
  const st=estadosPorFolio();let usados=0,reservados=0,inutilizados=0;
  for(let f=+r.desde;f<=+r.hasta;f++){
    const e=st.get(f);if(e==='usado')usados++;else if(e==='reservado')reservados++;else if(e==='inutilizado')inutilizados++;
  }
  const total=+r.hasta-+r.desde+1;return {total,usados,reservados,inutilizados,libres:total-usados-reservados-inutilizados};
}

function valoresForm(){
  const g=id=>document.getElementById(id);
  return {
    libro:g('fsii-libro')?.value||'diario',
    desde:g('fsii-desde')?.value||`${S.empresa.anio}-01-01`,
    hasta:g('fsii-hasta')?.value||`${S.empresa.anio}-12-31`,
    papel:g('fsii-papel')?.value||'A4',
    orientacion:g('fsii-orient')?.value||'portrait',
    margenSup:+(g('fsii-msup')?.value||30),margenDer:+(g('fsii-mder')?.value||10),
    margenInf:+(g('fsii-minf')?.value||12),margenIzq:+(g('fsii-mizq')?.value||10),
    lineas:Math.max(16,Math.min(42,+(g('fsii-lineas')?.value||28))),
    orden:g('fsii-orden')?.value||'asc',mostrarFolio:!!g('fsii-mostrar-folio')?.checked
  };
}
function periodoTxt(v){return `${fechaCL(v.desde)} al ${fechaCL(v.hasta)}`;}

function filasDiario(v){
  const out=[];
  const entries=genDiario().filter(e=>(!v.desde||e.fecha>=v.desde)&&(!v.hasta||e.fecha<=v.hasta));
  for(const e of entries){
    let first=true;
    for(const m of e.movs||[]){
      out.push({tipo:'mov',fecha:first?e.fecha:'',n:first?e.n:'',cuenta:`${m.cd||''} ${m.nm||''}`.trim(),glosa:first?e.glosa:(m.desc||''),debe:+m.debe||0,haber:+m.haber||0});
      first=false;
    }
  }
  return out;
}
function filasCaja(v){
  const out=[];
  for(const e of genDiario().filter(e=>(!v.desde||e.fecha>=v.desde)&&(!v.hasta||e.fecha<=v.hasta))){
    for(const m of e.movs||[]){
      if(!String(m.cd||'').startsWith('11011'))continue;
      out.push({tipo:'mov',fecha:e.fecha,n:e.n,cuenta:`${m.cd||''} ${m.nm||''}`.trim(),glosa:e.glosa,debe:+m.debe||0,haber:+m.haber||0});
    }
  }
  return out;
}
function filasMayor(v){
  const M=buildMayor(v.desde,v.hasta),out=[];
  for(const cd of Object.keys(M).sort()){
    const a=M[cd];
    if(!a.movs.length&&Math.abs(a.saldoAnterior||0)<.5)continue;
    out.push({tipo:'cuenta',cd,nm:a.nm,saldoAnterior:+a.saldoAnterior||0});
    for(const m of a.movs)out.push({tipo:'movMayor',fecha:m.fecha,n:m.n,glosa:m.glosa,debe:+m.debe||0,haber:+m.haber||0,saldo:+m.saldo||0});
    out.push({tipo:'totalMayor',debe:+a.debe||0,haber:+a.haber||0,saldo:+a.saldo||0});
  }
  return out;
}
function filasInventario(v){
  const M=buildMayor('',v.hasta),out=[];
  for(const cd of Object.keys(M).sort()){
    const a=M[cd],saldo=+a.saldo||0;if(Math.abs(saldo)<.5)continue;
    out.push({tipo:'inv',cd,nm:a.nm,debe:saldo>0?saldo:0,haber:saldo<0?-saldo:0});
  }
  return out;
}
function obtenerFilas(v){
  if(v.libro==='mayor')return filasMayor(v);
  if(v.libro==='caja')return filasCaja(v);
  if(v.libro==='inventario')return filasInventario(v);
  return filasDiario(v);
}
function paginar(filas,lineas){
  const pags=[];for(let i=0;i<filas.length;i+=lineas)pags.push(filas.slice(i,i+lineas));
  if(!pags.length)pags.push([]);return pags;
}

function tablaPagina(libro,rows){
  if(libro==='mayor')return `<table class="fsii-print-table"><thead><tr><th>Fecha</th><th>Comp.</th><th>Detalle</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead><tbody>${rows.map(r=>{
    if(r.tipo==='cuenta')return `<tr class="grp"><td colspan="6">${esc(r.cd)} · ${esc(r.nm)} · Saldo anterior ${money(r.saldoAnterior)}</td></tr>`;
    if(r.tipo==='totalMayor')return `<tr class="tot"><td colspan="3">Totales cuenta</td><td class="money">${money(r.debe)}</td><td class="money">${money(r.haber)}</td><td class="money">${money(r.saldo)}</td></tr>`;
    return `<tr><td>${fechaCL(r.fecha)}</td><td>${esc(r.n)}</td><td>${esc(r.glosa)}</td><td class="money">${r.debe?money(r.debe):''}</td><td class="money">${r.haber?money(r.haber):''}</td><td class="money">${money(r.saldo)}</td></tr>`;
  }).join('')}</tbody></table>`;
  if(libro==='inventario')return `<table class="fsii-print-table"><thead><tr><th>Código</th><th>Cuenta / detalle base</th><th>Saldo deudor</th><th>Saldo acreedor</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.cd)}</td><td>${esc(r.nm)}</td><td class="money">${r.debe?money(r.debe):''}</td><td class="money">${r.haber?money(r.haber):''}</td></tr>`).join('')}</tbody></table>`;
  return `<table class="fsii-print-table"><thead><tr><th>Fecha</th><th>Comp.</th><th>Cuenta</th><th>Glosa / detalle</th><th>Debe</th><th>Haber</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fechaCL(r.fecha)}</td><td>${esc(r.n)}</td><td>${esc(r.cuenta)}</td><td>${esc(r.glosa)}</td><td class="money">${r.debe?money(r.debe):''}</td><td class="money">${r.haber?money(r.haber):''}</td></tr>`).join('')}</tbody></table>`;
}
function htmlPaginas(v,paginas,folios,{prueba=false}={}){
  const arr=paginas.map((rows,i)=>({rows,folio:folios?.[i]??'PRUEBA',idx:i}));
  if(v.orden==='desc')arr.reverse();
  return arr.map(p=>`<section class="folio-sheet">
    <div class="fsii-book-head"><strong>${esc(LIBROS[v.libro])}</strong><span>${esc(periodoTxt(v))}</span></div>
    ${prueba?'<div class="fsii-prueba">PRUEBA DE ALINEACIÓN · NO USAR HOJA FOLIADA</div>':''}
    ${tablaPagina(v.libro,p.rows)}
    <div class="fsii-foot"><span>Página ${p.idx+1} de ${paginas.length}</span><span>${v.mostrarFolio||prueba?`Folio físico previsto: ${esc(p.folio)}`:''}</span></div>
  </section>`).join('');
}
function inyectarImpresion(v,html){
  limpiarImpresion();
  const root=document.createElement('div');root.id='folio-print-root';root.innerHTML=html;document.body.appendChild(root);
  const st=document.createElement('style');st.id='folio-print-style';
  const size=v.papel==='Carta'?'letter':(v.papel==='Oficio'?'legal':'A4');
  const dim=v.papel==='Carta'?[216,279]:(v.papel==='Oficio'?[216,356]:[210,297]);
  const [pw,ph]=v.orientacion==='landscape'?[dim[1],dim[0]]:dim;
  st.textContent=`@media print{
    @page{size:${size} ${v.orientacion};margin:0}
    body.printing-foliado>*:not(#folio-print-root){display:none!important}
    body.printing-foliado{margin:0!important;background:#fff!important}
    #folio-print-root{display:block!important;background:#fff!important;color:#000!important}
    .folio-sheet{box-sizing:border-box;position:relative;width:${pw}mm;height:${ph}mm;padding:${v.margenSup}mm ${v.margenDer}mm ${v.margenInf}mm ${v.margenIzq}mm;page-break-after:always;overflow:hidden;font-family:Arial,sans-serif;font-size:8.3pt;color:#000;background:#fff}
    .folio-sheet:last-child{page-break-after:auto}.fsii-book-head{display:flex;justify-content:space-between;gap:8mm;border-bottom:.3mm solid #000;padding-bottom:2mm;margin-bottom:2.5mm;font-size:10pt}.fsii-prueba{position:absolute;top:48%;left:10%;right:10%;transform:rotate(-18deg);font-size:23pt;font-weight:800;color:#aaa;text-align:center;opacity:.32;z-index:4}
    .fsii-print-table{width:100%;border-collapse:collapse;table-layout:fixed}.fsii-print-table th,.fsii-print-table td{border:.2mm solid #777;padding:1.05mm 1.4mm;vertical-align:top;line-height:1.18}.fsii-print-table th{font-weight:700;text-align:left}.fsii-print-table .money{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.fsii-print-table td{overflow-wrap:anywhere}.fsii-print-table td.money{overflow-wrap:normal}.fsii-print-table .grp td{font-weight:700;background:#eee!important;text-align:left!important}.fsii-print-table .tot td{font-weight:700;border-top:.4mm solid #000}.fsii-foot{position:absolute;left:${v.margenIzq}mm;right:${v.margenDer}mm;bottom:4mm;display:flex;justify-content:space-between;font-size:7pt;color:#333}
  }`;
  document.head.appendChild(st);document.body.classList.add('printing-foliado');
}
function limpiarImpresion(){document.getElementById('folio-print-root')?.remove();document.getElementById('folio-print-style')?.remove();document.body.classList.remove('printing-foliado');}
window.addEventListener('afterprint',()=>setTimeout(limpiarImpresion,100));

function recalcularPreview(){
  const v=valoresForm();const filas=obtenerFilas(v);const paginas=paginar(filas,v.lineas);EST.preview={v,filas,paginas};
  const r=rangoActivo(),res=resumenRango(r),bloque=r?siguienteBloque(paginas.length):null;
  const el=document.getElementById('fsii-preview');if(el)el.innerHTML=`<div class="fsii-preview-grid">
    <div><b>${LIBROS[v.libro]}</b><small>${periodoTxt(v)}</small></div><div><b>${filas.length}</b><small>líneas</small></div><div><b>${paginas.length}</b><small>hojas</small></div><div><b>${bloque?`${bloque[0]}–${bloque.at(-1)}`:'—'}</b><small>folios previstos</small></div></div>
    ${!r?'<div class="warn-tip">⚠️ Primero registra un rango de folios previamente autorizado/timbrado por el SII.</div>':(!bloque?`<div class="warn-tip">⚠️ No quedan ${paginas.length} folios consecutivos disponibles en el rango activo.</div>`:`<div class="info-tip">Disponibles en rango activo: <b>${res.libres}</b> · reservados ${res.reservados} · usados ${res.usados} · inutilizados ${res.inutilizados}.</div>`)}
    ${v.libro==='inventario'?'<div class="info-tip">ℹ️ Este libro imprime la base por cuentas y saldos. Cuando una cuenta requiera individualización de bienes o deudas, debe complementarse con el detalle de inventario correspondiente antes de cerrar el libro.</div>':''}`;
  return EST.preview;
}
function actualizarCfg(){
  if(!EST.data)return;const v=valoresForm();EST.data.config={...EST.data.config,...v};guardarFoliosSII('Actualizó configuración de impresión SII','Márgenes, papel u orden de impresión').catch(e=>toast('❌ '+e.message,'e'));recalcularPreview();
}

async function agregarRangoFolios(){if(!puedeMutar())return;
  await cargarFoliosSII();
  const d=+(document.getElementById('fsii-rango-desde')?.value||0),h=+(document.getElementById('fsii-rango-hasta')?.value||0),fa=document.getElementById('fsii-rango-fecha')?.value||'';
  if(!Number.isInteger(d)||!Number.isInteger(h)||d<=0||h<d){toast('⚠️ Ingresa un rango de folios válido','e');return;}
  if((EST.data.rangos||[]).some(r=>!(h<+r.desde||d>+r.hasta))){toast('⚠️ El rango se superpone con otro ya registrado','e');return;}
  EST.data.rangos.forEach(r=>r.activo=false);
  EST.data.rangos.push({id:uid(),desde:d,hasta:h,fechaAutorizacion:fa,activo:true,creadoEn:hoyISO()});
  try{await guardarFoliosSII('Registró rango de folios SII',`${d}–${h}`);toast('✅ Rango de folios registrado');renderFoliosSII();}catch(e){toast('❌ '+e.message,'e');}
}
async function activarRangoFolios(id){if(!puedeMutar())return;await cargarFoliosSII();EST.data.rangos.forEach(r=>r.activo=r.id===id);try{await guardarFoliosSII('Cambió rango activo de folios SII',id);renderFoliosSII();}catch(e){toast('❌ '+e.message,'e');}}

function imprimirPruebaFolios(){
  const p=recalcularPreview(),folios=Array.from({length:p.paginas.length},(_,i)=>i+1);inyectarImpresion(p.v,htmlPaginas(p.v,p.paginas,folios,{prueba:true}));setTimeout(()=>window.print(),50);
}
async function reservarEImprimir(){if(!puedeMutar())return;
  await cargarFoliosSII();const p=recalcularPreview();const folios=siguienteBloque(p.paginas.length);
  if(!folios){toast('⚠️ No hay suficientes folios consecutivos disponibles','e');return;}
  if(!confirm(`Se reservarán ${folios.length} hojas físicas foliadas (${folios[0]} a ${folios.at(-1)}).\n\nUna vez reservadas NO se reutilizarán automáticamente. Si una hoja se atasca o se imprime mal, deberá marcarse como inutilizada y conservarse.\n\n¿Continuar con la impresión?`))return;
  const mov={id:uid(),libro:p.v.libro,libroNombre:LIBROS[p.v.libro],desde:p.v.desde,hasta:p.v.hasta,folios:[...folios],paginas:folios.length,estado:'reservado',creadoEn:hoyISO(),usuario:AUTH.user?.email||'',config:{...p.v},paginasData:p.paginas};
  EST.data.config={...EST.data.config,...p.v};EST.data.movimientos.push(mov);
  try{
    await guardarFoliosSII('Reservó folios SII para impresión',`${mov.libroNombre}: ${folios[0]}–${folios.at(-1)}`);
    inyectarImpresion(p.v,htmlPaginas(p.v,p.paginas,folios));setTimeout(()=>window.print(),80);setTimeout(()=>{toast(`🖨️ Folios ${folios[0]}–${folios.at(-1)} reservados. Confirma luego si quedaron usados o inutilizados.`);renderFoliosSII();},350);
  }catch(e){toast('❌ '+e.message,'e');}
}
async function reimprimirReserva(id){
  await cargarFoliosSII();const mov=EST.data.movimientos.find(x=>x.id===id);if(!mov)return;
  const v={...CFG_DEFAULT,...mov.config,libro:mov.libro,desde:mov.desde,hasta:mov.hasta};const pags=Array.isArray(mov.paginasData)?mov.paginasData:paginar(obtenerFilas(v),v.lineas);
  if(pags.length!==mov.folios.length){toast('⚠️ La reserva no conserva una página por cada folio. Revisa el control antes de imprimir.','e');return;}
  inyectarImpresion(v,htmlPaginas(v,pags,mov.folios));setTimeout(()=>window.print(),80);
}
async function cerrarReserva(id,estado){if(!puedeMutar())return;
  await cargarFoliosSII();const m=EST.data.movimientos.find(x=>x.id===id);if(!m||m.estado!=='reservado')return;
  const palabra=estado==='usado'?'USADAS':'INUTILIZADAS';
  if(!confirm(`¿Confirmas que las hojas ${m.folios[0]}–${m.folios.at(-1)} quedan ${palabra}?\n\nEsta clasificación forma parte del control y no reutilizará esos folios.`))return;
  m.estado=estado;m.cerradoEn=hoyISO();m.cerradoPor=AUTH.user?.email||'';
  try{await guardarFoliosSII(estado==='usado'?'Confirmó folios SII usados':'Marcó folios SII inutilizados',`${m.folios[0]}–${m.folios.at(-1)} · ${m.libroNombre}`);toast('✅ Control de folios actualizado');renderFoliosSII();}catch(e){toast('❌ '+e.message,'e');}
}

function exportarControlFolios(){
  const rows=[['Folio','Estado','Libro','Período','Fecha reserva','Usuario']];
  const por=new Map();for(const m of EST.data?.movimientos||[])for(const f of m.folios||[])por.set(+f,m);
  for(const r of EST.data?.rangos||[])for(let f=+r.desde;f<=+r.hasta;f++){
    const m=por.get(f);rows.push([f,m?.estado||'disponible',m?.libroNombre||'',m?`${m.desde} a ${m.hasta}`:'',m?.creadoEn||'',m?.usuario||'']);
  }
  const csv=rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`control_hojas_sueltas_${String(S.empresa.rut||'').replace(/\D/g,'')}_${S.empresa.anio}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function renderFoliosSII(){
  const el=document.getElementById('folios-sii-content');if(!el)return;el.innerHTML='<div class="empty">⏳ Cargando control de folios…</div>';
  await cargarFoliosSII();const d=EST.data,c=d.config||CFG_DEFAULT,r=rangoActivo(),res=resumenRango(r);
  const rangos=(d.rangos||[]).slice().sort((a,b)=>a.desde-b.desde).map(x=>`<tr><td>${x.desde}–${x.hasta}</td><td>${x.fechaAutorizacion?fechaCL(x.fechaAutorizacion):'—'}</td><td>${x.activo!==false?'<span class="badge ok">ACTIVO</span>':'—'}</td><td>${x.activo===false?`<button class="btn btn-g" onclick="activarRangoFolios('${x.id}')">Usar</button>`:''}</td></tr>`).join('');
  const movs=(d.movimientos||[]).slice().reverse().map(m=>`<tr><td>${m.folios?.[0]}–${m.folios?.at(-1)}</td><td>${esc(m.libroNombre)}</td><td>${fechaCL(m.desde)}<br>${fechaCL(m.hasta)}</td><td><span class="badge ${m.estado==='usado'?'ok':m.estado==='inutilizado'?'err':'warn'}">${m.estado.toUpperCase()}</span></td><td>${m.estado==='reservado'?`<div class="fsii-actions"><button class="btn btn-g" onclick="reimprimirReserva('${m.id}')">🖨️ Reimprimir</button><button class="btn btn-p" onclick="cerrarReserva('${m.id}','usado')">✓ Usadas</button><button class="btn btn-g" onclick="cerrarReserva('${m.id}','inutilizado')">✕ Inutilizadas</button></div>`:'—'}</td></tr>`).join('');
  el.innerHTML=`
  <div class="info-tip" style="margin-bottom:14px"><b>Hojas sueltas de contabilidad computacional.</b> Registra aquí únicamente rangos de folios que ya hayan sido autorizados/timbrados conforme a tu modalidad ante el SII. El módulo administra su uso e imprime el contenido contable; no solicita ni reemplaza la autorización del Servicio.</div>
  <div class="card fsii-card"><div class="card-title">1. Rango físico autorizado</div>
    <div class="fg"><div class="grp"><label>Folio inicial</label><input id="fsii-rango-desde" type="number" min="1" inputmode="numeric"></div><div class="grp"><label>Folio final</label><input id="fsii-rango-hasta" type="number" min="1" inputmode="numeric"></div><div class="grp"><label>Fecha autorización/timbraje</label><input id="fsii-rango-fecha" type="date"></div></div>
    <button class="btn btn-p" onclick="agregarRangoFolios()">＋ Registrar rango</button>
    ${r?`<div class="fsii-range-kpis"><span><b>${r.desde}–${r.hasta}</b><small>rango activo</small></span><span><b>${res.libres}</b><small>disponibles</small></span><span><b>${res.usados}</b><small>usados</small></span><span><b>${res.reservados}</b><small>reservados</small></span><span><b>${res.inutilizados}</b><small>inutilizados</small></span></div>`:''}
    <div class="tw"><table><thead><tr><th>RANGO</th><th>AUTORIZACIÓN</th><th>ESTADO</th><th></th></tr></thead><tbody>${rangos||'<tr><td colspan="4">Sin rangos registrados</td></tr>'}</tbody></table></div>
  </div>
  <div class="card fsii-card"><div class="card-title">2. Preparar libro para hojas foliadas</div>
    <div class="fg"><div class="grp"><label>Libro</label><select id="fsii-libro" onchange="recalcularPreview()"><option value="diario">Libro Diario</option><option value="mayor">Libro Mayor</option><option value="caja">Libro Caja</option><option value="inventario">Inventarios y Balances</option></select></div><div class="grp"><label>Desde</label><input id="fsii-desde" type="date" value="${S.empresa.anio}-01-01" onchange="recalcularPreview()"></div><div class="grp"><label>Hasta</label><input id="fsii-hasta" type="date" value="${S.empresa.anio}-12-31" onchange="recalcularPreview()"></div></div>
    <div class="fg"><div class="grp"><label>Papel</label><select id="fsii-papel" onchange="actualizarCfg()"><option ${c.papel==='A4'?'selected':''}>A4</option><option ${c.papel==='Carta'?'selected':''}>Carta</option><option ${c.papel==='Oficio'?'selected':''}>Oficio</option></select></div><div class="grp"><label>Orientación</label><select id="fsii-orient" onchange="actualizarCfg()"><option value="portrait" ${c.orientacion==='portrait'?'selected':''}>Vertical</option><option value="landscape" ${c.orientacion==='landscape'?'selected':''}>Horizontal</option></select></div><div class="grp"><label>Líneas por hoja</label><input id="fsii-lineas" type="number" min="16" max="42" value="${c.lineas}" onchange="actualizarCfg()"></div><div class="grp"><label>Orden de alimentación</label><select id="fsii-orden" onchange="actualizarCfg()"><option value="asc" ${c.orden==='asc'?'selected':''}>Folio menor primero</option><option value="desc" ${c.orden==='desc'?'selected':''}>Folio mayor primero</option></select></div></div>
    <div class="fg fsii-margins"><div class="grp"><label>Margen superior mm</label><input id="fsii-msup" type="number" value="${c.margenSup}" onchange="actualizarCfg()"></div><div class="grp"><label>Derecho</label><input id="fsii-mder" type="number" value="${c.margenDer}" onchange="actualizarCfg()"></div><div class="grp"><label>Inferior</label><input id="fsii-minf" type="number" value="${c.margenInf}" onchange="actualizarCfg()"></div><div class="grp"><label>Izquierdo</label><input id="fsii-mizq" type="number" value="${c.margenIzq}" onchange="actualizarCfg()"></div></div>
    <label class="check-line"><input id="fsii-mostrar-folio" type="checkbox" ${c.mostrarFolio?'checked':''} onchange="actualizarCfg()"> Imprimir también el número de folio previsto al pie (déjalo desmarcado si la hoja ya lo trae preimpreso).</label>
    <div id="fsii-preview"></div>
    <div class="fsii-actions-main"><button class="btn btn-g" onclick="imprimirPruebaFolios()">🧪 Prueba en hoja blanca</button><button class="btn btn-p" onclick="reservarEImprimir()">🖨️ Reservar folios e imprimir</button></div>
    <div class="warn-tip">Antes del primer uso real, imprime una prueba en hoja blanca y superpónla sobre una hoja autorizada para calibrar márgenes. No cargues hojas foliadas durante la prueba.</div>
  </div>
  <div class="card fsii-card"><div class="card-title">3. Control de hojas sueltas</div><div class="info-tip">Las hojas inutilizadas no vuelven a quedar disponibles en el sistema. Conserva físicamente las hojas anuladas/inutilizadas según corresponda a tu control documental.</div><div class="fsii-actions-main"><button class="btn btn-i" onclick="exportarControlFolios()">📄 Exportar control CSV</button></div><div class="tw"><table><thead><tr><th>FOLIOS</th><th>LIBRO</th><th>PERÍODO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>${movs||'<tr><td colspan="5">Aún no hay folios utilizados.</td></tr>'}</tbody></table></div></div>
  <div class="info-tip"><b>Nota tributaria:</b> desde agosto de 2017 el Registro de Compras y Ventas reemplaza, para contribuyentes afectos, el antiguo timbraje del Libro de Compras y Ventas. Por eso esta pantalla se concentra en los libros de contabilidad computacional en hojas sueltas.</div>`;
  document.getElementById('fsii-libro').value=c.libro||'diario';
  recalcularPreview();
}

export {renderFoliosSII,cargarFoliosSII,agregarRangoFolios,activarRangoFolios,recalcularPreview,actualizarCfg,imprimirPruebaFolios,reservarEImprimir,reimprimirReserva,cerrarReserva,exportarControlFolios};
