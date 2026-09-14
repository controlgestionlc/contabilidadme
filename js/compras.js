import {tributacionCompra,periodoContableCompra,fechaContabilizacionCompra,asientoCompra} from './motor-contable.js';
import {claveRCV,compararCompraRCV,snapshotCompraRCV,fingerprintSnapshot,valorCambio} from './rcv-control.js';
// compras.js — Libro de compras + importador SII
import {toast, fmt, pn, today, MESES, IVA, DTE_COMPRAS, dteC, rutParse, rutFmt, rutDV, pdcNm, CCOLS, CUENTAS_GASTO, CUENTAS_COMPRA, fmtC} from './core.js';
import {rerender} from './ui.js';
import {S} from './state.js';
import {logAccion,logCambio} from './firebase.js';
import {mesOpts, mesRango} from './helpers.js';
import {todosDocsCompras, abrirAsientoDesde, proxFolioComprobante} from './asientos.js';
import {ccOpts} from './centroscosto.js';
import {inputCuenta} from './buscadorcuentas.js';
import {leerArchivo,resolverVencimientoImportado} from './importadorsii.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import './storage.js';
import {guardarDocumentoContabilizado,anularDocumentoContabilizado,ejercicioCerrado,upsertAsientoDocumento,anularAsientoDocumento,persistirClavesCritico,puedeOperarFecha} from './contabilidad-v2.js';
import {validarMovimientosPDC} from './pdc-reglas.js';

// Estado del formulario de compras (interno del módulo)
// CF NUNCA debe reasignarse: app.js expone este objeto con Object.assign(window,{CF})
// una sola vez y los oninput/onchange del HTML generado escriben en window.CF
// (CF.dist[i].monto, CF.dist[i].cc). Reasignarlo dejaba window.CF apuntando al
// objeto viejo y la distribución del gasto —montos y centros de costo— se perdía.
const CF={editId:null,dist:[]};
const textoSeguroImport=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fijarCF(editId,dist){
  CF.editId=editId==null?null:editId;
  CF.dist=dist||[];
}

function validarCuadraturaImportCompras(){
  const out=[];
  IM.docs.forEach((d,i)=>{
    // Sin cuenta todavía no existe un asiento completo que validar. Es un
    // pendiente de clasificación, no un descuadre del documento del SII.
    if(!d.incluir||!d.cuenta)return;
    const base=(+d.neto||0)+(+d.exento||0);
    const prev=d.dup||null;
    let dist=[{cuenta:d.cuenta||'',monto:base,cc:d.cc||''}];
    if(prev&&Array.isArray(prev.dist)&&prev.dist.length>1){
      const sum=prev.dist.reduce((s,l)=>s+(+l.monto||0),0);
      if(Math.abs(sum-base)<=1)dist=prev.dist.map(l=>({...l}));
    }
    const doc={...d,id:prev?.id||`preview-c-${i}`,fecha:d.fechaOriginal||d.fecha,
      periodoContable:periodoImportSeleccionado(),fechaContabilizacion:fechaContabilizacionImport(d),dist,
      totalIncluyeRetencion:(+d.tipoDTE===45||+d.tipoDTE===46)?false:d.totalIncluyeRetencion,
      ...((+d.tipoDTE===45||+d.tipoDTE===46)?{ivaRetenido:d.ivaRetenido!=null?d.ivaRetenido:d.iva}:{}),
      tratamientoOtrosImpuestos:d.tratamientoOtrosImpuestos||'costo'};
    try{
      const a=asientoCompra(doc);
      const vp=validarMovimientosPDC(a.movs||[]);
      if(!a.cuadre?.ok||!vp.ok){
        const motivos=[];
        if(!a.cuadre?.ok)motivos.push(`Debe y Haber difieren en ${fmtC(a.cuadre?.diferencia||0)}`);
        if(!vp.ok)motivos.push(vp.errores[0]);
        out.push({idx:i,tipoDTE:d.tipoDTE,numero:d.numero,diferencia:a.cuadre?.diferencia||0,motivo:motivos.join(' · '),tipo:!vp.ok?'pdc':'cuadratura'});
      }else if(d.errorImport){
        out.push({idx:i,tipoDTE:d.tipoDTE,numero:d.numero,diferencia:0,motivo:d.errorImport,tipo:'guardado'});
      }
    }catch(err){
      out.push({idx:i,tipoDTE:d.tipoDTE,numero:d.numero,diferencia:0,motivo:err?.message||String(err),tipo:'preview'});
    }
  });
  return out;
}

function enfocarPendienteImportC(i){
  const el=document.getElementById('imp-row-'+i);
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.add('imp-pending-focus');
  setTimeout(()=>el.classList.remove('imp-pending-focus'),1800);
}

function alertaCuadraturaImportCompras(lista){
  if(!lista.length)return '';
  const items=lista.slice(0,8).map(x=>`<button type="button" class="imp-pending-link" onclick="enfocarPendienteImportC(${x.idx})">DTE ${x.tipoDTE} N° ${textoSeguroImport(x.numero)} · ${textoSeguroImport(x.motivo||`diferencia ${fmtC(x.diferencia)}`)}</button>`).join('');
  return `<div class="imp-pending-alert"><strong>⚠️ ${lista.length} documento${lista.length===1?'':'s'} no pasarían la validación contable.</strong><div class="imp-pending-links">${items}${lista.length>8?`<span>… y ${lista.length-8} más</span>`:''}</div><span>Se detectaron antes de guardar. Los documentos válidos sí pueden importarse; estos quedarán pendientes para corregir su cuenta, centro de costo o cuadratura.</span></div>`;
}

function alertaSinCuentaImportCompras(lista){
  if(!lista.length)return '';
  const items=lista.slice(0,8).map(x=>`<button type="button" class="imp-pending-link" onclick="enfocarPendienteImportC(${x.idx})">DTE ${x.tipoDTE} N° ${x.numero}</button>`).join('');
  return `<div class="imp-pending-alert" style="border-color:var(--warn);background:rgba(210,153,34,.08)"><strong style="color:var(--warn)">⚠️ ${lista.length} documento${lista.length===1?'':'s'} sin cuenta asignada.</strong><div class="imp-pending-links">${items}${lista.length>8?`<span>… y ${lista.length-8} más</span>`:''}</div><span>Los montos del RCV están cuadrados. Asigna una cuenta de gasto o activo para completar y guardar estos documentos.</span></div>`;
}

// ═══ CORRELATIVO MENSUAL PERSISTENTE ═══
// Cada documento de compra lleva un `corrMes` fijo: el correlativo que se le
// asignó al guardarlo. Reinicia en 1 cada mes y NO se recalcula al editar o
// eliminar otros documentos (a diferencia del folio dinámico por fecha).

// Devuelve el próximo correlativo libre para el mes de `fecha` (YYYY-MM-DD),
// mirando el máximo corrMes ya asignado en ese mes. Excluye un id opcional.
function proxCorrMesCompra(fecha,excluirId=null,periodoContable=''){
  const m=periodoContable||(fecha||'').slice(0,7);
  if(!m)return 1;
  let max=0;
  S.compras.forEach(d=>{
    if(d.id===excluirId)return;
    if(periodoContableCompra(d)!==m)return;
    if(typeof d.corrMes==='number'&&d.corrMes>max)max=d.corrMes;
  });
  return max+1;
}

// Asigna corrMes a los documentos que aún no lo tienen, respetando los ya
// asignados. Ordena por fecha y N° para dar números estables a los antiguos.
// Retorna true si hubo cambios (para persistir).
function migrarCorrelativosCompras(){
  const porMes={};
  S.compras.forEach(d=>{
    const m=periodoContableCompra(d);if(!m)return;
    (porMes[m]||(porMes[m]=[])).push(d);
  });
  let cambios=false;
  Object.keys(porMes).forEach(m=>{
    const arr=porMes[m];
    // Correlativo máximo ya usado en el mes
    let max=arr.reduce((mx,d)=>typeof d.corrMes==='number'&&d.corrMes>mx?d.corrMes:mx,0);
    // Los que no tienen corrMes se ordenan por fecha+número y toman los siguientes
    arr.filter(d=>typeof d.corrMes!=='number')
      .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(a.numero||'').localeCompare(b.numero||''))
      .forEach(d=>{d.corrMes=++max;cambios=true;});
  });
  return cambios;
}


// ═══ DUPLICADOS ═══
// Un documento tributario es único por RUT emisor + tipo DTE + folio.
// Si aparece más de una vez (por ejemplo, cargado en el libro y además a través
// de un asiento manual) se duplica el gasto y el crédito fiscal.
function claveDocCompra(d){return claveRCV(d);}

function recalcularEstadoImportCompras(){
  const per=periodoImportSeleccionado();
  IM.docs.forEach(d=>{
    const prev=d.dup;
    if(!prev){d.estadoImport='nuevo';d.cambiosRCV=[];if(d.incluir==null)d.incluir=true;return;}
    if(prev.origen==='asiento'){d.estadoImport='manual';d.cambiosRCV=[];d.incluir=false;return;}
    const cmp=compararCompraRCV(d,prev,per);
    d.cambiosRCV=cmp.cambios;d.rcvFingerprint=cmp.fingerprint;
    if(prev.estado==='anulado'){d.estadoImport='cambio';d.cambiosRCV=[{campo:'estado',label:'Estado',anterior:'Anulado',nuevo:'Activo'},...d.cambiosRCV];}
    else d.estadoImport=cmp.igual?'igual':'cambio';
  });
}

function gruposDuplicadosCompras(){
  const map=new Map();
  todosDocsCompras().forEach(d=>{
    const k=claveDocCompra(d);
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(d);
  });
  return [...map.values()].filter(g=>g.length>1)
    .sort((a,b)=>(a[0].fecha||'').localeCompare(b[0].fecha||''));
}
// Filtra el libro para dejar a la vista un documento concreto
function verDuplicadoC(numero){
  ['cf-desde','cf-hasta'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const sm=document.getElementById('cf-mes');if(sm)sm.value='';
  const sd=document.getElementById('cf-dte-flt');if(sd)sd.value='';
  const q=document.getElementById('cf-search');if(q)q.value=numero;
  renderCompras();
  document.getElementById('c-tbody')?.scrollIntoView({behavior:'smooth',block:'center'});
}
function renderCDupAlert(){
  const el=document.getElementById('c-dup-alert');if(!el)return;
  const grupos=gruposDuplicadosCompras();
  if(!grupos.length){el.style.display='none';el.innerHTML='';return;}
  const montoDup=grupos.reduce((s,g)=>{
    const sg=(dteC(g[0].tipoDTE)?.signo)||1;
    return s+(g.length-1)*(g[0].total||0)*sg;
  },0);
  const ivaDup=grupos.reduce((s,g)=>{
    const sg=(dteC(g[0].tipoDTE)?.signo)||1;
    return s+(g.length-1)*(g[0].iva||0)*sg;
  },0);
  const filas=grupos.slice(0,25).map(g=>{
    const d=g[0];
    const origenes=g.map(x=>x.origen==='asiento'?`✏ Asiento N°${x.asientoN}`:'📗 Libro').join(' + ');
    return `<tr>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}</td>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${d.tipoDTE} N°${d.numero}</td>
      <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(d.rutCodigo,d.rutDV)}</td>
      <td class="tnm" style="font-size:11px">${d.razonSocial||''}</td>
      <td style="font-size:11px;font-weight:600">${fmt(d.total)}</td>
      <td class="tl" style="font-size:10px;color:var(--mt)">${g.length}× · ${origenes}</td>
      <td style="text-align:center"><button class="btn btn-g" style="padding:3px 8px;font-size:10px" onclick="verDuplicadoC('${String(d.numero).replace(/'/g,'')}')">🔎 Ver</button></td>
    </tr>`;
  }).join('');
  el.style.display='block';
  el.innerHTML=`<div style="background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.35);border-radius:8px;padding:12px 14px;margin-bottom:12px">
    <div style="font-size:13px;font-weight:700;color:var(--err);margin-bottom:4px">⚠️ ${grupos.length} documento${grupos.length===1?'':'s'} duplicado${grupos.length===1?'':'s'} en el libro de compras</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px">
      Mismo RUT + tipo de DTE + folio registrado más de una vez. Están inflando el libro en
      <strong style="color:var(--err)">${fmtC(montoDup)}</strong> de total y
      <strong style="color:var(--err)">${fmtC(ivaDup)}</strong> de crédito fiscal.
      Elimina la copia sobrante (si viene de un asiento manual, bórrala desde el asiento).
    </div>
    <div class="tw" style="max-height:260px;overflow:auto"><table>
      <thead><tr><th class="tl">FECHA</th><th class="tl">DOC</th><th class="tl">RUT</th><th class="tl">RAZÓN SOCIAL</th><th>TOTAL</th><th class="tl">ORIGEN</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${grupos.length>25?`<div style="font-size:10px;color:var(--mt);margin-top:6px">Mostrando los primeros 25 de ${grupos.length}.</div>`:''}
  </div>`;
}

function onMesChangeC(){
  // El selector mensual representa el PERIODO CONTABLE/RCV. No modifica ni
  // filtra por la fecha documental; los campos Desde/Hasta siguen disponibles
  // como filtros explícitos de fecha de emisión.
  renderCompras();
}

function limpiarFiltrosC(){
  ['cf-mes','cf-desde','cf-hasta','cf-dte-flt','cf-search'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderCompras();
}

// ═══ COMPRAS — Documentos individuales ═══
function dteComprasOpts(sel=''){
  return '<option value="">— Seleccionar —</option>'+DTE_COMPRAS.map(d=>`<option value="${d.cod}" ${+sel===d.cod?'selected':''}>${d.cod} — ${d.nm}</option>`).join('');
}
function cuentasGastoOpts(sel=''){
  // Ahora incluye gastos + activos (para compras que son inversión, no gasto)
  return '<option value="">— cuenta de gasto o activo —</option>'+CUENTAS_COMPRA.map(c=>`<option value="${c.cd}" ${c.cd===sel?'selected':''}>${c.cd} — ${c.nm} ${c.tp==='A'?'(activo)':''}</option>`).join('');
}

// Estado de selección para acciones masivas
let CF_SEL=new Set();

function toggleCSel(id){
  if(CF_SEL.has(id))CF_SEL.delete(id);else CF_SEL.add(id);
  renderCompras();
}
function toggleCSelAll(marcados){
  const box=document.getElementById('c-tbody');
  if(!box)return;
  box.querySelectorAll('input.c-chk[data-id]').forEach(chk=>{
    const id=chk.dataset.id;
    if(marcados)CF_SEL.add(id);else CF_SEL.delete(id);
  });
  renderCompras();
}
function limpiarCSel(){CF_SEL.clear();renderCompras();}
async function eliminarCSel(){
  const cerrados=(S.compras||[]).filter(d=>CF_SEL.has(d.id)&&!puedeOperarFecha(fechaContabilizacionCompra(d)));
  if(cerrados.length){toast(`🔒 ${cerrados.length} compra(s) pertenecen a períodos cerrados. Reabre esos períodos antes de anular.`, 'e');return;}
  if(!CF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de anular compras.','e');return;}
  const n=CF_SEL.size;
  if(!confirm(`¿Anular ${n} documento${n===1?'':'s'} de compra seleccionado${n===1?'':'s'}?

Los documentos y sus asientos se conservarán para trazabilidad.`))return;
  const snapC=JSON.stringify(S.compras||[]),snapA=JSON.stringify(S.asientos||[]);
  let borrados=0;
  try{
    S.compras.forEach(d=>{if(CF_SEL.has(d.id)&&d.estado!=='anulado'){d.estado='anulado';d.anuladoEn=new Date().toISOString();anularAsientoDocumento('compras',d.id,'anulación masiva');borrados++;}});
    await persistirClavesCritico([
      {key:'compras-'+S.empresa.anio,value:JSON.stringify(S.compras)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos||[])},
    ]);
  }catch(e){
    S.compras=JSON.parse(snapC);S.asientos=JSON.parse(snapA);
    toast('❌ No se pudo guardar la anulación. No se aplicaron cambios.','e');return;
  }
  CF_SEL.clear();
  toast(`🚫 ${borrados} documento${borrados===1?'':'s'} anulado${borrados===1?'':'s'}`);
  logAccion('Anuló compras masivamente',`${borrados} documentos`);
  rerender();
}

function renderCompras(){
  // Asegurar que todos los documentos del libro tengan correlativo mensual fijo
  if(migrarCorrelativosCompras())
    window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras)).then(r=>{if(r&&r.ok===false)console.warn('No se pudo persistir correlativos migrados',r);}).catch(e=>console.warn('No se pudo persistir correlativos migrados',e));

  const selMes=document.getElementById('cf-mes');
  if(selMes&&selMes.options.length<=1)selMes.innerHTML=mesOpts(selMes.value);
  const selDteFlt=document.getElementById('cf-dte-flt');
  if(selDteFlt&&selDteFlt.options.length<=1)selDteFlt.innerHTML='<option value="">Todos los DTE</option>'+DTE_COMPRAS.map(d=>`<option value="${d.cod}">${d.cod} — ${d.nm}</option>`).join('');

  // Aviso de documentos duplicados (se calcula sobre todo el libro, con o sin filtro)
  renderCDupAlert();

  const fMes=+(document.getElementById('cf-mes')?.value||0);
  const fDesde=(document.getElementById('cf-desde')?.value||'');
  const fHasta=(document.getElementById('cf-hasta')?.value||'');
  const fDte=+(document.getElementById('cf-dte-flt')?.value||0);
  const fQ=(document.getElementById('cf-search')?.value||'').toLowerCase().trim();
  const todos=todosDocsCompras();
  const docs=[...todos].sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.numero||'').localeCompare(b.numero||''));
  // Correlativo mensual: los del libro traen su corrMes fijo; los que vienen de
  // asientos manuales continúan la secuencia del mes (máximo del libro + N).
  const corr={};
  const maxMes={};
  todos.forEach(d=>{if(d.origen==='libro'&&typeof d.corrMes==='number'){corr[d.id]=d.corrMes;const m=periodoContableCompra(d);if(!maxMes[m]||d.corrMes>maxMes[m])maxMes[m]=d.corrMes;}});
  [...todos].filter(d=>d.origen!=='libro')
    .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(a.numero||'').localeCompare(b.numero||''))
    .forEach(d=>{const m=periodoContableCompra(d);maxMes[m]=(maxMes[m]||0)+1;corr[d.id]=maxMes[m];});
  const fDocs=docs.filter(d=>{
    if(fMes&&periodoContableCompra(d)!==`${S.empresa.anio}-${String(fMes).padStart(2,'0')}`)return false;
    if(fDesde&&d.fecha<fDesde)return false;
    if(fHasta&&d.fecha>fHasta)return false;
    if(fDte&&+d.tipoDTE!==fDte)return false;
    if(fQ){const t=(d.rutCodigo+' '+(d.razonSocial||'')+' '+(d.numero||'')).toLowerCase();if(!t.includes(fQ))return false;}
    return true;
  });

  const cntMan=todos.filter(d=>d.origen==='asiento').length;

  // Sin ningún filtro activo no cargamos las filas (pueden ser cientos). El
  // usuario debe aplicar un filtro de búsqueda para ver documentos.
  const hayFiltroC=!!(fMes||fDesde||fHasta||fDte||fQ);
  const tb=document.getElementById('c-tbody');
  const tf=document.getElementById('c-tfoot');
  if(!hayFiltroC){
    document.getElementById('cf-count').textContent=`${todos.length} documentos en total`;
    tb.innerHTML=`<tr><td colspan="14" class="empty" style="padding:36px 20px">
      <div class="ei">🔎</div>
      Aplica un filtro para ver documentos<br>
      <span style="font-size:11px;color:var(--mt)">Elige un mes, un rango de fechas, un tipo de DTE, o busca por RUT / razón social / N°.${todos.length?` Hay <strong>${todos.length}</strong> documentos registrados.`:''}</span>
    </td></tr>`;
    if(tf)tf.innerHTML='';
    // Igual refrescamos el resumen inferior (usa todos los docs)
    renderCResumen();
    return;
  }

  document.getElementById('cf-count').textContent=`${fDocs.length} de ${todos.length} documentos${cntMan?` (${cntMan} desde asientos)`:''}`;

  // Barra de acciones masivas
  const barraSel=document.getElementById('c-bulk-bar');
  if(barraSel){
    if(CF_SEL.size){
      barraSel.style.display='flex';
      barraSel.innerHTML=`<span style="font-weight:600;color:var(--ac)">${CF_SEL.size} seleccionado${CF_SEL.size===1?'':'s'}</span>
        <button class="btn btn-d" style="font-size:11px" onclick="eliminarCSel()">🗑 Eliminar seleccionados</button>
        <button class="btn btn-g" style="font-size:11px" onclick="limpiarCSel()">✕ Limpiar selección</button>`;
    }else{
      barraSel.style.display='none';
      barraSel.innerHTML='';
    }
  }

  if(!fDocs.length){
    tb.innerHTML=`<tr><td colspan="14" class="empty"><div class="ei">🧾</div>No hay documentos con ese filtro</td></tr>`;
    document.getElementById('c-tfoot').innerHTML='';
  }else{
    let tN=0,tE=0,tI=0,tO=0,tT=0;
    tb.innerHTML=fDocs.map(d=>{
      const signo=(dteC(d.tipoDTE)?.signo)||1;
      tN+=(d.neto||0)*signo;tE+=(d.exento||0)*signo;tI+=(d.iva||0)*signo;tO+=(d.otrosImpuestos||0)*signo;tT+=(d.total||0)*signo;
      const dte=dteC(d.tipoDTE);
      const mesSl=periodoContableCompra(d).slice(5,7);
      const folioNum=corr[d.id]||'';
      const esManual=d.origen==='asiento';
      const rowStyle=esManual?' style="background:rgba(88,166,255,.04)"':'';
      const origenBadge=esManual?`<div style="font-size:9px;color:var(--info);margin-top:2px">✏ Asiento N°${d.asientoN}</div>`:'';
      const perC=periodoContableCompra(d);
      const periodoBadge=d.periodoContable&&d.fecha?.slice(0,7)!==perC?`<div style="font-size:9px;color:var(--info);margin-top:2px" title="Período contable/RCV">RCV ${perC}</div>`:'';
      const distTxt=d.dist&&d.dist.length>1?`📊 ${d.dist.length} categorías`:(d.dist&&d.dist[0]?pdcNm(d.dist[0].cuenta):'');
      // Las notas de crédito RESTAN: se muestran en negativo y en rojo, igual
      // que como se computan en los totales, el F29 y el libro diario.
      const esNC=signo<0;
      const sg=v=>fmt((v||0)*signo);
      const cNC=esNC?' style="color:var(--err)"':'';
      const cNCb=esNC?' style="color:var(--err);font-weight:600"':' style="font-weight:600"';
      const acciones=esManual
        ?`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="abrirAsientoDesde('${d.asientoId}')">📝 Abrir</button>`
        :`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarCompra('${d.id}')">✏️</button> <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="eliminarCompra('${d.id}')">🗑</button>`;
      const chk=esManual
        ?'<span style="color:var(--mt);font-size:10px" title="Viene de un asiento manual">—</span>'
        :`<input type="checkbox" class="c-chk" data-id="${d.id}" ${CF_SEL.has(d.id)?'checked':''} onchange="toggleCSel('${d.id}')">`;
      return `<tr${rowStyle}>
        <td style="text-align:center;width:26px">${chk}</td>
        <td class="tl"><span class="doc-folio">${String(folioNum).padStart(3,'0')}</span></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}${origenBadge}${periodoBadge}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:${d.fechaVencimiento?'var(--tx)':'var(--mt)'}">${d.fechaVencimiento||'—'}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.tipoDTE}${esNC?' <span style="font-family:var(--sans);font-size:8px;font-weight:700;color:var(--err);border:1px solid var(--err);border-radius:3px;padding:0 3px;vertical-align:middle">NC</span>':''}${dte?`<div style="font-size:9px;color:var(--mt);font-family:var(--sans);line-height:1.1;margin-top:1px">${dte.nm.slice(0,18)}</div>`:''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(d.rutCodigo,d.rutDV)}</td>
        <td class="tnm">${d.razonSocial||''}${distTxt?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${distTxt}</div>`:''}</td>
        <td${cNC}>${sg(d.neto)}</td>
        <td${cNC}>${sg(d.exento)}</td>
        <td${cNC}>${sg(d.iva)}</td>
        <td${cNC}>${sg(d.otrosImpuestos)}</td>
        <td${cNCb}>${sg(d.total)}</td>
        <td style="text-align:center">${acciones}</td>
      </tr>`;
    }).join('');
    document.getElementById('c-tfoot').innerHTML=`<tr><td class="tl" colspan="8">TOTALES</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td><td></td></tr>`;
  }
  renderCResumen();
}

function renderCResumen(){
  const el=document.getElementById('c-resumen');if(!el)return;
  if(!S.compras.length){el.innerHTML='';return;}
  const porMes=Array.from({length:12},()=>({neto:0,exento:0,iva:0,otros:0,total:0,cant:0}));
  // El resumen usa el mismo universo y el mismo signo que el libro y el F29:
  // documentos del libro + los que vienen de asientos manuales, y las notas de
  // crédito restando.
  todosDocsCompras().forEach(d=>{
    const m=+(periodoContableCompra(d).slice(5,7))-1;if(m<0||m>11)return;
    const sg=(dteC(d.tipoDTE)?.signo)||1;
    porMes[m].neto+=(d.neto||0)*sg;porMes[m].exento+=(d.exento||0)*sg;porMes[m].iva+=(d.iva||0)*sg;porMes[m].otros+=(d.otrosImpuestos||0)*sg;porMes[m].total+=(d.total||0)*sg;porMes[m].cant++;
  });
  const porCta={};
  S.compras.forEach(d=>{const sg=(dteC(d.tipoDTE)?.signo)||1;(d.dist||[]).forEach(l=>{if(!porCta[l.cuenta])porCta[l.cuenta]={nm:pdcNm(l.cuenta),monto:0};porCta[l.cuenta].monto+=(l.monto||0)*sg;});});

  let tN=0,tE=0,tI=0,tO=0,tT=0,tC=0;
  let rowsM=porMes.map((p,i)=>{
    tN+=p.neto;tE+=p.exento;tI+=p.iva;tO+=p.otros;tT+=p.total;tC+=p.cant;
    if(!p.cant)return '';
    return `<tr><td class="tl">${MESES[i]}</td><td>${p.cant}</td><td>${fmt(p.neto)}</td><td>${fmt(p.exento)}</td><td>${fmt(p.iva)}</td><td>${fmt(p.otros)}</td><td style="font-weight:600">${fmt(p.total)}</td></tr>`;
  }).join('');
  if(!rowsM)rowsM=`<tr><td colspan="7" class="empty" style="padding:18px">Sin movimientos</td></tr>`;

  const ctaKeys=Object.keys(porCta).sort();
  const rowsC=ctaKeys.map(k=>`<tr><td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${k}</td><td class="tnm">${porCta[k].nm}</td><td style="font-weight:600">${fmt(porCta[k].monto)}</td></tr>`).join('');

  el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📅 Resumen Mensual</div><div class="tw"><table>
      <thead><tr><th class="tl">MES</th><th>DOCS</th><th>NETO</th><th>EXENTO</th><th>IVA</th><th>OTROS</th><th>TOTAL</th></tr></thead>
      <tbody>${rowsM}</tbody>
      <tfoot><tr><td class="tl">TOTAL</td><td>${tC}</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td></tr></tfoot>
    </table></div></div>
    <div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📊 Por Cuenta de Gasto</div><div class="tw"><table>
      <thead><tr><th class="tl">CÓDIGO</th><th class="tl">CUENTA</th><th>MONTO</th></tr></thead>
      <tbody>${rowsC||'<tr><td colspan="3" class="empty" style="padding:18px">Sin distribución</td></tr>'}</tbody>
    </table></div></div>
  </div>`;
}

// — Form Compras —
// V2.11 — referencias tributarias de Notas de Crédito/Débito
function cfDteChanged(){
  const t=+document.getElementById('cf-dte')?.value||0;
  const row=document.getElementById('cf-ref-row');if(row)row.style.display=(t===56||t===61)?'grid':'none';
  if(t===56||t===61)cfRefrescarDocs();
}

let _cfRefs=[];
const escOptC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cfAsegurarTipoReferencia(tipo){
  const sel=document.getElementById('cf-ref-tipo');if(!sel)return;
  const val=String(+tipo||33);
  if(![...sel.options].some(o=>o.value===val)){
    const info=dteC(+tipo);sel.add(new Option(`${val} — ${info?.nm||'Documento tributario'}`,val));
  }
  sel.value=val;
}
function cfRefrescarDocs(){
  const sel=document.getElementById('cf-ref-doc');if(!sel)return;
  const r=rutParse(document.getElementById('cf-rut')?.value||'');
  const actual={tipo:+document.getElementById('cf-ref-tipo')?.value||0,folio:(document.getElementById('cf-ref-folio')?.value||'').trim(),fecha:document.getElementById('cf-ref-fecha')?.value||''};
  _cfRefs=r.codigo?todosDocsCompras().filter(d=>d&&d.estado!=='anulado'&&d.rutCodigo===r.codigo&&d.id!==CF.editId)
    .sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||String(b.numero||'').localeCompare(String(a.numero||''))):[];
  const ayuda=document.getElementById('cf-ref-ayuda');
  if(!r.codigo){sel.innerHTML='<option value="">Ingrese el RUT para buscar documentos…</option>';if(ayuda)ayuda.textContent='Selecciona un documento ya registrado para completar la referencia.';return;}
  if(!_cfRefs.length){sel.innerHTML='<option value="">No hay documentos registrados para este proveedor</option>';if(ayuda)ayuda.textContent='Puedes ingresar la referencia manualmente en los campos inferiores.';return;}
  sel.innerHTML='<option value="">Seleccionar documento referenciado…</option>'+_cfRefs.map((d,i)=>`<option value="${i}">${escOptC(d.fecha)} · DTE ${+d.tipoDTE||''} N° ${escOptC(d.numero)} · ${escOptC(fmtC(d.total||0))}</option>`).join('');
  const idx=_cfRefs.findIndex(d=>+d.tipoDTE===actual.tipo&&String(d.numero||'')===actual.folio&&(!actual.fecha||d.fecha===actual.fecha));
  if(idx>=0)sel.value=String(idx);
  if(ayuda)ayuda.textContent=`${_cfRefs.length} documento${_cfRefs.length===1?' disponible':'s disponibles'} para este proveedor.`;
}
function cfSeleccionarReferencia(valor){
  if(valor==='')return;
  const d=_cfRefs[+valor];if(!d)return;
  cfAsegurarTipoReferencia(d.tipoDTE);
  document.getElementById('cf-ref-folio').value=d.numero||'';
  document.getElementById('cf-ref-fecha').value=d.fecha||'';
  const razon=document.getElementById('cf-ref-razon');
  if(razon&&!razon.value)razon.value=(+document.getElementById('cf-dte')?.value===61?'Anula / corrige documento seleccionado':'Modifica documento seleccionado');
}

function abrirCF(){
  fijarCF(null,[{cuenta:'',monto:0,cc:''}]);
  const f=document.getElementById('cf-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('cf-title').textContent='Nuevo Documento de Compra';
  document.getElementById('cf-fecha').value=today();
  document.getElementById('cf-vence').value='';
  document.getElementById('cf-dte').innerHTML=dteComprasOpts('');
  ['cf-num','cf-rut','cf-rs','cf-neto','cf-exento','cf-iva','cf-otros','cf-total','cf-ref-folio','cf-ref-fecha','cf-ref-razon'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  cfDteChanged();
  document.getElementById('cf-iva-tipo').value='recuperable';document.getElementById('cf-iva-pct').value='100';cfTratamientoIVAUI();
  const ot=document.getElementById('cf-otros-trat');if(ot)ot.value='costo';
  document.getElementById('cf-dv').textContent='';
  document.getElementById('cf-dup-warn').style.display='none';
  renderDist();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function editarCompra(id){
  const d=S.compras.find(x=>x.id===id);if(!d)return;
  fijarCF(id,d.dist?d.dist.map(l=>({...l})):[{cuenta:'',monto:d.neto||0,cc:''}]);
  const f=document.getElementById('cf-form');f.style.display='block';f.classList.add('editing');
  document.getElementById('cf-title').textContent='Editando Documento — '+rutFmt(d.rutCodigo,d.rutDV);
  document.getElementById('cf-fecha').value=d.fecha;
  document.getElementById('cf-vence').value=d.fechaVencimiento||'';
  document.getElementById('cf-dte').innerHTML=dteComprasOpts(d.tipoDTE);
  cfDteChanged();
  if(document.getElementById('cf-ref-tipo'))document.getElementById('cf-ref-tipo').value=d.referencia?.tipoDTE||33;
  if(document.getElementById('cf-ref-folio'))document.getElementById('cf-ref-folio').value=d.referencia?.folio||'';
  if(document.getElementById('cf-ref-fecha'))document.getElementById('cf-ref-fecha').value=d.referencia?.fecha||'';
  if(document.getElementById('cf-ref-razon'))document.getElementById('cf-ref-razon').value=d.referencia?.razon||'';
  document.getElementById('cf-num').value=d.numero||'';
  document.getElementById('cf-rut').value=(d.rutCodigo||'')+(d.rutDV||'');
  document.getElementById('cf-rs').value=d.razonSocial||'';
  document.getElementById('cf-neto').value=d.neto||'';
  document.getElementById('cf-exento').value=d.exento||'';
  document.getElementById('cf-iva').value=d.iva||'';
  const ivaTot=Math.abs(+d.iva||0), ivaRec=d.ivaRecuperable!=null?Math.abs(+d.ivaRecuperable||0):ivaTot;
  const tipoIVA=d.tratamientoIVA||(d.ivaActivoFijo>0?'activo_fijo':d.ivaNoRecuperable>=ivaTot&&ivaTot>0?'no_recuperable':d.ivaNoRecuperable>0?'proporcional':'recuperable');
  document.getElementById('cf-iva-tipo').value=tipoIVA;
  document.getElementById('cf-iva-pct').value=ivaTot?Math.round((ivaRec/ivaTot)*10000)/100:100;cfTratamientoIVAUI();
  document.getElementById('cf-otros').value=d.otrosImpuestos||'';
  const ot=document.getElementById('cf-otros-trat');if(ot)ot.value=d.tratamientoOtrosImpuestos||(d.otrosImpuestosDetalle?.some(x=>x.tratamiento==='recuperable')?'recuperable':'costo');
  document.getElementById('cf-total').value=d.total||'';
  document.getElementById('cf-dup-warn').style.display='none';
  cfRutInput(document.getElementById('cf-rut').value);
  renderDist();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function cerrarCF(){document.getElementById('cf-form').style.display='none';fijarCF(null,[]);}

function cfRutInput(val){
  const r=rutParse(val);
  const el=document.getElementById('cf-dv');
  if(!r.raw){el.textContent='';el.className='rut-dv';cfRefrescarDocs();return;}
  if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv ok';
    const prev=S.compras.find(v=>v.rutCodigo===r.codigo&&v.razonSocial);
    const rs=document.getElementById('cf-rs');
    if(prev&&!rs.value)rs.value=prev.razonSocial;
    cfRefrescarDocs();
  }else if(r.codigo){el.textContent='✗ DV ≠ '+rutDV(r.codigo);el.className='rut-dv bad';cfRefrescarDocs();}
  else{el.textContent='…';el.className='rut-dv';}
}

// Detección de duplicado en vivo
function cfCheckDup(){
  const warn=document.getElementById('cf-dup-warn');if(!warn)return;
  const tipoDTE=+document.getElementById('cf-dte').value;
  const numero=document.getElementById('cf-num').value.trim();
  const r=rutParse(document.getElementById('cf-rut').value);
  if(!tipoDTE||!numero||!r.codigo){warn.style.display='none';return;}
  const dup=S.compras.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==CF.editId);
  if(dup){
    const f=(typeof dup.corrMes==='number')?dup.corrMes:'?';
    warn.className='doc-dup-warn';warn.style.display='';
    warn.innerHTML=`⚠️ <span>DOCUMENTO DUPLICADO</span><span style="font-weight:400;margin-left:auto;font-size:11px">Ya existe: N° ${String(f).padStart(3,'0')} · ${dup.fecha} · ${rutFmt(dup.rutCodigo,dup.rutDV)} · DTE ${dup.tipoDTE} N°${dup.numero} · ${fmtC(dup.total)}</span>`;
  }else{warn.style.display='none';}
}

function cfTratamientoIVAUI(){
  const tipo=document.getElementById('cf-iva-tipo')?.value||'recuperable';
  const pct=document.getElementById('cf-iva-pct');if(!pct)return;
  pct.disabled=tipo!=='proporcional';
  if(tipo==='recuperable'||tipo==='activo_fijo')pct.value='100';
  if(tipo==='no_recuperable')pct.value='0';
  if(tipo==='proporcional'&&(!pct.value||+pct.value<0||+pct.value>100))pct.value='50';
}

function cfCalcTotals(changed){
  const neto=pn(document.getElementById('cf-neto').value);
  const exento=pn(document.getElementById('cf-exento').value);
  const otros=pn(document.getElementById('cf-otros').value);
  const ivaEl=document.getElementById('cf-iva'),totEl=document.getElementById('cf-total');
  const dte=dteC(document.getElementById('cf-dte').value);
  const afecto=dte?dte.afecto:true;
  if(changed==='neto'||changed==='exento'||changed==='otros'){
    const iva=afecto?Math.round(neto*IVA):0;
    ivaEl.value=iva||'';
    totEl.value=neto+exento+iva+otros;
    if(CF.dist.length===1&&!CF.dist[0].monto&&changed==='neto')CF.dist[0].monto=neto;
    if(changed==='neto')renderDist();
  }else if(changed==='total'){
    const total=pn(totEl.value);
    if(afecto&&total>0&&!exento&&!otros){
      const n=Math.round(total/(1+IVA)),iv=total-n;
      document.getElementById('cf-neto').value=n;ivaEl.value=iv;
      if(CF.dist.length===1&&!CF.dist[0].monto){CF.dist[0].monto=n;renderDist();}
    }
  }else if(changed==='iva'){
    const iva=pn(ivaEl.value);
    totEl.value=neto+exento+iva+otros;
  }
  updCfCheck();
}

function renderDist(){
  const box=document.getElementById('cf-dist');
  if(!CF.dist.length)CF.dist=[{cuenta:'',monto:0,cc:''}];
  // Cada celda lleva su clase: en móvil la fila se apila y el CSS necesita saber
  // qué es cada cosa para colocarla y ponerle su etiqueta.
  box.innerHTML=CF.dist.map((l,i)=>`<div class="dist-row">
    <div class="dist-num">${i+1}</div>
    <div class="dist-cd">${inputCuenta({id:`dist-cd-${i}`,value:l.cuenta,onPick:`CF.dist[${i}].cuenta='%CD%';updCfCheck()`,placeholder:'Cuenta de gasto…',clase:'dist-inp'})}<select class="dist-inp" style="margin-top:4px;font-size:10px" title="Tratamiento tributario" onchange="CF.dist[${i}].tratamientoTributario=this.value"><option value="aceptado" ${(l.tratamientoTributario||'aceptado')==='aceptado'?'selected':''}>Tributario: gasto aceptado</option><option value="rechazado" ${l.tratamientoTributario==='rechazado'?'selected':''}>Tributario: gasto rechazado</option></select></div>
    <div class="dist-mt"><input type="number" class="dist-num-inp money-input" min="0" placeholder="0" value="${l.monto||''}" oninput="CF.dist[${i}].monto=pn(this.value);updCfCheck()"></div>
    <div class="dist-ccc"><select class="dist-inp" title="Centro de costo" onchange="CF.dist[${i}].cc=this.value">${ccOpts(l.cc||'')}</select></div>
    <div class="dist-del"><button class="btn btn-d" onclick="delDist(${i})" title="Quitar esta línea">✕</button></div>
  </div>`).join('');
  updCfCheck();
}
function addDist(){CF.dist.push({cuenta:'',monto:0,cc:'',tratamientoTributario:'aceptado'});renderDist();}
function delDist(i){if(CF.dist.length>1)CF.dist.splice(i,1);else CF.dist[0]={cuenta:'',monto:0,cc:'',tratamientoTributario:'aceptado'};renderDist();}
function updCfCheck(){
  const neto=pn(document.getElementById('cf-neto').value);
  const exento=pn(document.getElementById('cf-exento').value);
  const base=neto+exento;
  const sum=CF.dist.reduce((s,l)=>s+(l.monto||0),0);
  const diff=sum-base,ok=base>0&&Math.abs(diff)<=1;
  const box=document.getElementById('cf-check');
  box.className='dist-check '+(ok?'ok':'err');
  document.getElementById('cf-check-ico').textContent=ok?'✅':'⚠️';
  document.getElementById('cf-check-msg').textContent=ok?'Distribución cuadrada con Neto + Exento':
    base===0?'Ingresa el neto/exento y distribúyelo en cuentas':
    diff>0?`Exceso de ${fmtC(diff)} sobre Neto + Exento`:
    `Faltan ${fmtC(-diff)} por distribuir`;
  document.getElementById('cf-check-det').innerHTML=`<span>Neto + Exento: ${fmtC(base)}</span> · <span>Distribuido: ${fmtC(sum)}</span>`;
}

async function guardarCompra(){
  const fecha=document.getElementById('cf-fecha').value;
  const fechaVencimiento=document.getElementById('cf-vence').value||'';
  const tipoDTE=+document.getElementById('cf-dte').value;
  const numero=document.getElementById('cf-num').value.trim();
  const rutInput=document.getElementById('cf-rut').value;
  const razonSocial=document.getElementById('cf-rs').value.trim();
  const neto=pn(document.getElementById('cf-neto').value);
  const exento=pn(document.getElementById('cf-exento').value);
  const iva=pn(document.getElementById('cf-iva').value);
  const tratamientoIVA=document.getElementById('cf-iva-tipo')?.value||'recuperable';
  let porcentajeIvaRecuperable=parseFloat(String(document.getElementById('cf-iva-pct')?.value||100).replace(',','.'))||0;
  porcentajeIvaRecuperable=Math.max(0,Math.min(100,porcentajeIvaRecuperable));
  if(tratamientoIVA==='recuperable'||tratamientoIVA==='activo_fijo')porcentajeIvaRecuperable=100;
  if(tratamientoIVA==='no_recuperable')porcentajeIvaRecuperable=0;
  const ivaRecuperable=Math.round(iva*porcentajeIvaRecuperable/100);
  const ivaNoRecuperable=iva-ivaRecuperable;
  const ivaActivoFijo=tratamientoIVA==='activo_fijo'?ivaRecuperable:0;
  const otrosImpuestos=pn(document.getElementById('cf-otros').value);
  const tratamientoOtrosImpuestos=document.getElementById('cf-otros-trat')?.value||'costo';
  const otrosImpuestosDetalle=otrosImpuestos?[{tipo:'otro',nombre:'Otros impuestos',monto:otrosImpuestos,tratamiento:tratamientoOtrosImpuestos}]:[];
  const total=pn(document.getElementById('cf-total').value);
  const prevEdit=CF.editId?S.compras.find(x=>x.id===CF.editId):null;
  const esNota=tipoDTE===56||tipoDTE===61;
  const referencia=esNota?{tipoDTE:+document.getElementById('cf-ref-tipo')?.value||33,folio:(document.getElementById('cf-ref-folio')?.value||'').trim(),fecha:document.getElementById('cf-ref-fecha')?.value||'',razon:(document.getElementById('cf-ref-razon')?.value||'').trim()}:null;
  const refRegistrada=referencia?_cfRefs.find(d=>+d.tipoDTE===referencia.tipoDTE&&String(d.numero||'')===referencia.folio&&(!referencia.fecha||d.fecha===referencia.fecha)):null;
  if(refRegistrada){referencia.documentoId=refRegistrada.id;referencia.totalOriginal=refRegistrada.total||0;}
  const esFacturaCompra=tipoDTE===45||tipoDTE===46;
  const esNotaFacturaCompra=esNota&&([45,46].includes(+referencia?.tipoDTE)||(+prevEdit?.ivaRetenido||0)>0);
  const usaIvaRetenido=esFacturaCompra||esNotaFacturaCompra;

  if(!fecha){toast('⚠️ Ingresa la fecha de emisión','e');return;}
  if(fechaVencimiento&&fechaVencimiento<fecha){toast('⚠️ La fecha de vencimiento no puede ser anterior a la emisión','e');return;}
  if(!tipoDTE){toast('⚠️ Selecciona el tipo de documento','e');return;}
  if(!numero){toast('⚠️ Ingresa el N° de documento','e');return;}
  const r=rutParse(rutInput);
  if(!r.codigo){toast('⚠️ Ingresa el RUT del proveedor','e');return;}
  if(!r.valido){toast('⚠️ RUT inválido — dígito verificador no coincide','e');return;}
  if(!razonSocial){toast('⚠️ Ingresa la razón social','e');return;}
  if(total<=0){toast('⚠️ El total debe ser mayor a cero','e');return;}
  if(!usaIvaRetenido&&Math.abs((neto+exento+iva+otrosImpuestos)-total)>1){toast('⚠️ Neto + Exento + IVA + Otros no coincide con el Total','e');return;}
  if(usaIvaRetenido){
    const tc=tributacionCompra({tipoDTE,neto,exento,iva,otrosImpuestos,total,ivaRetenido:iva,referencia});
    if(tc.diferenciaTotal>1){
      toast(`⚠️ En DTE ${tipoDTE}, el Total debe corresponder al total del documento (${fmtC(tc.totalDocumento)}) o al monto pagadero al proveedor (${fmtC(tc.totalProveedor)}).`,'e');return;
    }
  }

  const dist=CF.dist.filter(l=>l.cuenta&&l.monto>0);
  if(!dist.length){toast('⚠️ Agrega al menos una cuenta de gasto','e');return;}
  const sumDist=dist.reduce((s,l)=>s+l.monto,0);
  if(Math.abs(sumDist-(neto+exento))>1){toast('⚠️ La distribución debe cuadrar con Neto + Exento','e');return;}

  const dup=S.compras.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==CF.editId);
  if(dup){
    const f=(typeof dup.corrMes==='number')?dup.corrMes:'?';
    toast(`⚠️ Documento duplicado — ya existe N° ${String(f).padStart(3,'0')} (${dup.fecha}, ${fmtC(dup.total)})`,'e');
    return;
  }

  if(esNota&&!referencia.folio){toast('⚠️ Las Notas de Crédito/Débito deben indicar el folio del documento referenciado','e');return;}
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre el ejercicio antes de registrar o modificar documentos.','e');return;}
  const fechaVencimientoOrigen=fechaVencimiento
    ?((prevEdit?.fechaVencimiento===fechaVencimiento&&prevEdit?.fechaVencimientoOrigen)?prevEdit.fechaVencimientoOrigen:'manual')
    :'';
  const doc={id:CF.editId||'c_'+Date.now(),fecha,fechaVencimiento,fechaVencimientoOrigen,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,neto,exento,iva,ivaRecuperable,ivaNoRecuperable,ivaActivoFijo,porcentajeIvaRecuperable,tratamientoIVA,otrosImpuestos,tratamientoOtrosImpuestos,otrosImpuestosDetalle,total,dist,...(referencia?{referencia}:{}),...(usaIvaRetenido?{ivaRetenido:iva,totalIncluyeRetencion:Math.abs(total-(neto+exento+otrosImpuestos+iva))<=1}:{}),...(prevEdit?.periodoContable?{periodoContable:prevEdit.periodoContable,fechaContabilizacion:prevEdit.fechaContabilizacion||fechaContabilizacionCompra(prevEdit),origenRegistro:prevEdit.origenRegistro||'RCV'}:{}),...(prevEdit?{fechaRecepcionSII:prevEdit.fechaRecepcionSII||'',fechaAcuseSII:prevEdit.fechaAcuseSII||'',tipoCompra:prevEdit.tipoCompra||'',codigoIvaNoRecuperable:prevEdit.codigoIvaNoRecuperable||'',numeroInternoSII:prevEdit.numeroInternoSII||''}:{})};
  const editando=!!CF.editId;
  if(editando){
    const i=S.compras.findIndex(x=>x.id===CF.editId); const prev=i>=0?S.compras[i]:null;
    if(prev&&typeof prev.corrMes==='number'&&periodoContableCompra(prev)===periodoContableCompra(doc))doc.corrMes=prev.corrMes;
    else doc.corrMes=proxCorrMesCompra(fecha,CF.editId,periodoContableCompra(doc));
  } else doc.corrMes=proxCorrMesCompra(fecha,null,periodoContableCompra(doc));
  const rSave=await guardarDocumentoContabilizado('compras',doc,S.compras,editando);
  if(!rSave.ok){toast('❌ No se pudo contabilizar el documento. No se considera guardado. ('+(rSave.motivo||'error')+')','e');return;}
  toast(editando?'✅ Documento actualizado y contabilizado':'✅ Documento registrado y contabilizado');
  logAccion(editando?'Editó compra':'Registró compra',`DTE ${doc.tipoDTE} N°${doc.numero} · ${doc.razonSocial} · ${fmtC(doc.total)}`);
  cerrarCF();rerender();
}

async function eliminarCompra(id){
  const d=S.compras.find(x=>x.id===id);if(!d)return;
  if(!confirm(`¿Eliminar documento ${d.tipoDTE} N°${d.numero} de ${d.razonSocial}?\nTotal: ${fmtC(d.total)}`))return;
  const r=await anularDocumentoContabilizado('compras',d,S.compras);
  if(!r.ok){toast(r.motivo==='ejercicio-cerrado'?'🔒 El ejercicio está cerrado':'❌ No se pudo guardar la anulación','e');return;}
  rerender();toast('🚫 Documento y asiento anulados (se conserva la trazabilidad)');
}

// ═══ IMPORTACIÓN DESDE SII (Registro de Compras CSV) ═══
let IM={docs:[]};

// Parser de CSV que respeta comillas dobles (con escape "")

// Parsea número en formato chileno (1.234.567 o 1.234,56 o 1234567)

// "02/01/2026" o "2/1/2026" → "2026-01-02"

function parseSIICompras(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1); // BOM
  const rawLines=text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(!rawLines.length)throw new Error('Archivo vacío');

  // Detectar delimitador (; es lo más común en SII)
  const first=rawLines[0];
  const nSemi=(first.match(/;/g)||[]).length;
  const nComma=(first.match(/,/g)||[]).length;
  const delim=nSemi>=nComma?';':',';

  const rows=rawLines.map(l=>splitCSVRow(l,delim));

  // Buscar fila de headers
  let headerIdx=-1;
  for(let i=0;i<Math.min(8,rows.length);i++){
    const joined=rows[i].join(' ').toLowerCase();
    if(joined.includes('tipo doc')&&(joined.includes('rut')||joined.includes('proveedor'))){
      headerIdx=i;break;
    }
    if(joined.includes('tipo dte')&&joined.includes('rut')){headerIdx=i;break;}
  }
  if(headerIdx<0)throw new Error('No se encontró fila de encabezados. ¿Es el archivo "Detalle de Registro de Compras" del SII?');

  const headers=rows[headerIdx].map(h=>h.toLowerCase().trim().replace(/"/g,''));
  const getCol=(...patterns)=>{
    for(const p of patterns){
      const idx=headers.findIndex(h=>h.includes(p.toLowerCase()));
      if(idx>=0)return idx;
    }
    return -1;
  };

  const cTipo=getCol('tipo doc','tipo dte');
  const cRut=getCol('rut proveedor','rut emisor','rut');
  const cRazon=getCol('razon social','razón social','razonsocial');
  const cNro=getCol('nro doc','n° doc','folio');
  const cFecha=getCol('fecha docto','fecha documento','fecha emision','fecha emisión','fecha doc','fecha');
  const cExento=getCol('monto exento','exento');
  const cNeto=getCol('monto neto','neto');
  const cIvaRec=getCol('iva recuperable','monto iva recuperable');
  const cIvaNoRec=getCol('iva no recuperable','monto iva no recuperable');
  const cIvaUsoComun=getCol('iva uso común','iva uso comun','iva uso comun');
  const cIvaActivoFijo=getCol('iva activo fijo','iva activo');
  const cIvaPlano=getCol('monto iva','iva');
  const cTotal=getCol('monto total','total');
  const cOtroImp=getCol('valor otro impuesto','otro impuesto');

  if(cTipo<0||cRut<0||cNro<0||cFecha<0||cTotal<0){
    throw new Error('Faltan columnas esenciales (Tipo Doc, RUT, N° Doc, Fecha, Total). Verifica el formato del archivo.');
  }

  const docs=[];let descartados=0;
  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i];if(r.length<3)continue;
    const tipoDTE=parseInt(r[cTipo],10)||0;
    if(!tipoDTE){descartados++;continue;}
    if(!dteC(tipoDTE)){descartados++;continue;} // DTE no soportado
    const rutInfo=rutParse(r[cRut]||'');
    if(!rutInfo.codigo||!rutInfo.valido){descartados++;continue;}
    const fecha=parseFechaSII(r[cFecha]||'');
    if(!fecha){descartados++;continue;}
    const neto=Math.abs(parseNumSII(r[cNeto]||'0'));
    const exento=Math.abs(parseNumSII(r[cExento]||'0'));
    const ivaRecuperable=cIvaRec>=0?Math.abs(parseNumSII(r[cIvaRec]||'0')):null;
    const ivaNoRecuperable=cIvaNoRec>=0?Math.abs(parseNumSII(r[cIvaNoRec]||'0')):null;
    const ivaUsoComun=cIvaUsoComun>=0?Math.abs(parseNumSII(r[cIvaUsoComun]||'0')):0;
    const ivaActivoFijo=cIvaActivoFijo>=0?Math.abs(parseNumSII(r[cIvaActivoFijo]||'0')):0;
    let iva=(ivaRecuperable||0)+(ivaNoRecuperable||0);
    if(!iva&&cIvaPlano>=0)iva=Math.abs(parseNumSII(r[cIvaPlano]||'0'));
    const total=Math.abs(parseNumSII(r[cTotal]||'0'));
    const otrosImpuestos=cOtroImp>=0?Math.abs(parseNumSII(r[cOtroImp]||'0')):0;
    const numero=String(r[cNro]||'').trim();
    if(!numero||total===0){descartados++;continue;}

    docs.push({fecha,tipoDTE,numero,rutCodigo:rutInfo.codigo,rutDV:rutInfo.dv,razonSocial:(r[cRazon]||'').trim(),neto,exento,iva,ivaRecuperable,ivaNoRecuperable,ivaUsoComun,ivaActivoFijo,tratamientoIVA:ivaActivoFijo>0?'activo_fijo':(ivaNoRecuperable>0?'sii':'recuperable'),otrosImpuestos,tratamientoOtrosImpuestos:'costo',otrosImpuestosDetalle:otrosImpuestos?[{tipo:'otro',nombre:'Otros impuestos RCV',monto:otrosImpuestos,tratamiento:'costo'}]:[],total});
  }
  return {docs,descartados};
}

function abrirImportSII(){
  const input=document.getElementById('imp-file');
  input.value='';
  input.click();
}

async function handleFileImport(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const res=await leerArchivo(file,'compra');
    mostrarDocsImportados(res,file.name);
  }catch(err){
    toast('❌ '+err.message,'e');
  }
}


function mostrarDocsImportados(res,nombreArchivo){
  if(!res.docs.length){
    toast('⚠️ No se detectaron documentos válidos en el archivo','e');
    return;
  }
  // Detectar periodo: el mes-año más frecuente entre los documentos
  const conteo={};
  res.docs.forEach(d=>{
    const mY=d.fecha.slice(0,7); // "YYYY-MM"
    conteo[mY]=(conteo[mY]||0)+1;
  });
  const periodos=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
  const [periodoTop,cantTop]=periodos[0];
  const [anioTop,mesTop]=periodoTop.split('-');

  // Marcar duplicados: comparamos SIEMPRE como string, porque un doc guardado
  // manualmente puede tener el número como Number y el CSV lo trae como String.
  const todos=todosDocsCompras();
  res.docs.forEach(d=>{
    const dupLibro=(S.compras||[]).find(x=>claveDocCompra(x)===claveDocCompra(d));
    const dup=dupLibro||todos.find(x=>
      x.rutCodigo===d.rutCodigo &&
      +x.tipoDTE===+d.tipoDTE &&
      String(x.numero).trim()===String(d.numero).trim()
    );
    d.dup=dup||null;
    Object.assign(d,resolverVencimientoImportado(d,dup||null));
    d.incluir=!dup;
    d.estadoImport=dup?'igual':'nuevo';
    d.cambiosRCV=[];
    // Pre-poblar cuenta y CC. Prioridad: la clasificación que ya tiene el
    // documento registrado (si es una recarga del mismo periodo), luego la
    // ficha del proveedor. Así una re-importación no pierde el trabajo hecho.
    const ficha=fichaAux('proveedor',d.rutCodigo);
    const distPrev=dup&&Array.isArray(dup.dist)?dup.dist[0]:null;
    d.cuenta=distPrev?.cuenta||ficha?.cuentaDefault||'';
    d.cc=distPrev?.cc||ficha?.ccDefault||'';
    d.fechaOriginal=d.fecha;
  });

  // Mutar IM in-place (NO reasignar): window.IM debe seguir apuntando a este
  // objeto para que los onPick de los buscadores de cuenta escriban aquí.
  IM.docs=res.docs;
  IM.descartados=res.descartados||0;
  IM.archivo=nombreArchivo;
  IM.modo='agregar';   // 'agregar' | 'sobrescribir'
  IM.periodoMes=+mesTop;
  IM.periodoAnio=+anioTop;
  IM.periodos=periodos;
  recalcularEstadoImportCompras();
  abrirImportModal();
}

function abrirImportModal(){
  const selModo=document.getElementById('imp-modo');
  if(selModo)selModo.value=IM.modo||'agregar';
  // Poblar select de mes
  const selMes=document.getElementById('imp-periodo-mes');
  selMes.innerHTML=MESES.map((m,i)=>`<option value="${i+1}" ${i+1===IM.periodoMes?'selected':''}>${m}</option>`).join('');
  // Poblar select de año (±3 años del actual, incluyendo el detectado)
  const selAnio=document.getElementById('imp-periodo-anio');
  const cy=new Date().getFullYear();
  const anios=new Set();
  for(let y=cy-3;y<=cy+1;y++)anios.add(y);
  anios.add(IM.periodoAnio);
  const aniosOrd=[...anios].sort();
  selAnio.innerHTML=aniosOrd.map(y=>`<option value="${y}" ${y===IM.periodoAnio?'selected':''}>${y}</option>`).join('');

  // Poblar select bulk
  // El bulk usa el buscador dinámico: reemplazamos el <select> por un <input>
  const bulkWrap=document.getElementById('imp-bulk-wrap');
  if(bulkWrap){
    bulkWrap.innerHTML=inputCuenta({id:'imp-bulk-cd',value:'',
      onPick:"setBulkCuentaImp('%CD%')",
      placeholder:'Buscar cuenta de gasto o activo por código o nombre…',
      clase:'linea-inp',filtro:'compra'});
  }
  // Bulk de centro de costo: reutilizamos ccOpts() que ya arma la jerarquía
  const bulkCC=document.getElementById('imp-bulk-cc');
  if(bulkCC)bulkCC.innerHTML=ccOpts('');

  renderImportModal();
  document.getElementById('imp-modal').classList.add('open');
}

function cambiarPeriodoImport(){
  IM.periodoMes=+document.getElementById('imp-periodo-mes').value;
  IM.periodoAnio=+document.getElementById('imp-periodo-anio').value;
  recalcularEstadoImportCompras();
  // Al cambiar el período, no aplicar cambios SII silenciosamente.
  IM.docs.forEach(d=>{d.incluir=d.estadoImport==='nuevo'||(IM.modo==='sobrescribir'&&d.estadoImport==='cambio');});
  renderImportModal();
}

// ═══ MODO DE IMPORTACIÓN ═══
// 'agregar'      → solo carga documentos que aún no existen (comportamiento clásico)
// 'sobrescribir' → reemplaza el libro completo del periodo con el archivo,
//                  reutilizando el correlativo mensual de los documentos que ya
//                  estaban registrados (mismo RUT + tipo DTE + folio).
function cambiarModoImport(){
  IM.modo=document.getElementById('imp-modo')?.value||'agregar';
  recalcularEstadoImportCompras();
  // Idempotencia: los documentos idénticos nunca vuelven a escribirse. En
  // sobrescritura sólo se seleccionan nuevos + cambios reales detectados.
  IM.docs.forEach(d=>{
    d.incluir=d.estadoImport==='nuevo'||(IM.modo==='sobrescribir'&&d.estadoImport==='cambio');
  });
  renderImportModal();
}

// Documentos del libro (no de asientos) que caen en el periodo seleccionado
function docsLibroDelPeriodo(){
  const per=`${IM.periodoAnio}-${String(IM.periodoMes).padStart(2,'0')}`;
  return S.compras.filter(d=>periodoContableCompra(d)===per);
}

function cerrarImportModal(){
  document.getElementById('imp-modal').classList.remove('open');
  IM.docs=[];  // limpiar in-place (no reasignar; ver nota en cargarArchivoSII)
}

// La fecha del documento NUNCA se altera durante la importación RCV.
// El periodo seleccionado se guarda por separado y determina F29, correlativo y asiento.
function fechaEfectivaImport(d){
  return d.fechaOriginal;
}
function periodoImportSeleccionado(){
  return `${IM.periodoAnio}-${String(IM.periodoMes).padStart(2,'0')}`;
}
function fechaContabilizacionImport(d){
  const per=periodoImportSeleccionado();
  const fd=String(d?.fechaOriginal||'');
  if(fd.slice(0,7)===per)return fd;
  const [y,m]=per.split('-').map(Number);
  const dia=new Date(y,m,0).getDate();
  return `${per}-${String(dia).padStart(2,'0')}`;
}

function renderImportModal(){
  const total=IM.docs.length;
  const dups=IM.docs.filter(d=>d.dup).length;
  const incl=IM.docs.filter(d=>d.incluir).length;
  const conCuenta=IM.docs.filter(d=>d.incluir&&d.cuenta).length;
  const nuevos=IM.docs.filter(d=>d.estadoImport==='nuevo').length;
  const iguales=IM.docs.filter(d=>d.estadoImport==='igual').length;
  const cambiados=IM.docs.filter(d=>d.estadoImport==='cambio').length;
  const manuales=IM.docs.filter(d=>d.estadoImport==='manual').length;
  const descuadrados=validarCuadraturaImportCompras();
  const badIdx=new Set(descuadrados.map(x=>x.idx));
  const sinCuenta=IM.docs.map((d,idx)=>({...d,idx})).filter(d=>d.incluir&&!d.cuenta);
  const noAccountIdx=new Set(sinCuenta.map(x=>x.idx));
  const listos=IM.docs.filter((d,i)=>d.incluir&&d.cuenta&&!badIdx.has(i));

  // Info del periodo
  const periodoStr=`${MESES[IM.periodoMes-1]} ${IM.periodoAnio}`;
  const fuera=IM.docs.filter(d=>{
    const [y,m]=d.fechaOriginal.split('-');
    return +y!==IM.periodoAnio||+m!==IM.periodoMes;
  }).length;
  let periodoInfo=`Periodo seleccionado: <strong>${periodoStr}</strong>`;
  if(IM.periodos&&IM.periodos.length>1){
    const detallado=IM.periodos.map(([p,c])=>{
      const [y,m]=p.split('-');
      return `${MESES[+m-1].slice(0,3)} ${y}: ${c}`;
    }).join(' · ');
    periodoInfo+=`<br><span style="color:var(--mt);font-size:10px">Detectado en archivo: ${detallado}</span>`;
  }
  if(fuera>0){
    periodoInfo+=`<br><span style="color:var(--info);font-size:11px;margin-top:2px;display:inline-block">✓ ${fuera} documento${fuera===1?'':'s'} con fecha de emisión distinta del período RCV: conservarán su fecha original y se contabilizarán en ${periodoStr}.</span>`;
  }
  document.getElementById('imp-periodo-info').innerHTML=periodoInfo;

  // ── Modo sobrescribir: qué se reemplaza y qué se pierde ──
  const modo=IM.modo||'agregar';
  const sobre=modo==='sobrescribir';
  let avisoModo='';
  if(sobre){
    const enLibro=docsLibroDelPeriodo().filter(d=>d.estado!=='anulado');
    const clavesArchivo=new Set(IM.docs.map(claveDocCompra));
    const conservan=enLibro.filter(d=>clavesArchivo.has(claveDocCompra(d))).length;
    const sePierden=enLibro.length-conservan;
    avisoModo=`<div style="background:rgba(210,153,34,.10);border:1px solid rgba(210,153,34,.35);border-radius:6px;padding:9px 12px;margin-top:8px;font-size:11px;line-height:1.5">
      🔁 <strong>Sobrescribir ${periodoStr}</strong> — se concilian los <strong>${enLibro.length}</strong> documento${enLibro.length===1?'':'s'} activos del libro contra el archivo. Sólo se escriben documentos nuevos o realmente modificados.
      <strong style="color:var(--ach)">${conservan}</strong> conservan su correlativo actual; los nuevos toman los números libres del mes.
      ${sePierden?`<br><span style="color:var(--err)">⚠️ ${sePierden} documento${sePierden===1?'':'s'} del libro no viene${sePierden===1?'':'n'} en el archivo y se anulará${sePierden===1?'':'n'} con trazabilidad.</span>`:''}
      <br><span style="color:var(--mt)">Los documentos registrados vía asientos manuales no se tocan.</span>
    </div>`;
  }

  // Summary
  document.getElementById('imp-summary').innerHTML=`📊 <strong>${total}</strong> documentos detectados` +
    (IM.descartados?` · ${IM.descartados} descartados (datos incompletos o DTE no soportado)`:'')+
    ` · <strong style="color:var(--ach)">${nuevos} nuevo${nuevos===1?'':'s'}</strong>`+
    ` · <strong style="color:var(--mt)">${iguales} sin cambios</strong>`+
    (cambiados?` · <strong style="color:var(--warn)">${cambiados} con cambios SII</strong>`:'')+
    (manuales?` · <strong style="color:var(--info)">${manuales} ya en asiento manual</strong>`:'')+
    ` · Archivo: <code style="font-family:var(--mono);font-size:11px">${IM.archivo||'-'}</code>`+avisoModo+alertaCuadraturaImportCompras(descuadrados)+alertaSinCuentaImportCompras(sinCuenta);
  document.getElementById('imp-count').textContent=`${listos.length} listos${sinCuenta.length?` · ${sinCuenta.length} sin cuenta`:''}${descuadrados.length?` · ${descuadrados.length} con error contable`:''}`;

  // Botón OK
  const btnOk=document.getElementById('imp-btn-ok');
  const ausentes=sobre?docsLibroDelPeriodo().filter(d=>d.estado!=='anulado'&&!new Set(IM.docs.map(claveDocCompra)).has(claveDocCompra(d))).length:0;
  const nListos=listos.length;
  btnOk.textContent=sobre
    ?`♻️ Conciliar ${periodoStr}: ${nListos} cambio${nListos===1?'':'s'}${descuadrados.length?` · ${descuadrados.length} pendiente${descuadrados.length===1?'':'s'}`:''}${ausentes?` + ${ausentes} ausencia${ausentes===1?'':'s'}`:''}`
    :`💾 Aplicar ${nListos} documento${nListos===1?'':'s'}${sinCuenta.length?` · ${sinCuenta.length} sin cuenta`:''}${descuadrados.length?` · ${descuadrados.length} con descuadre`:''}`;
  btnOk.disabled=(nListos===0&&ausentes===0);
  btnOk.title=descuadrados.length?'Los documentos con errores contables no se guardarán: quedarán pendientes para revisión':'';

  // Checkbox "todos"
  const chkAll=document.getElementById('imp-all');
  const seleccionables=IM.docs.filter(d=>d.estadoImport!=='igual'&&d.estadoImport!=='manual').length;
  chkAll.checked=incl>0&&incl===seleccionables;

  // Filas: cada una usa buscador dinámico (compra = gasto + activo)
  document.getElementById('imp-rows').innerHTML=IM.docs.map((d,i)=>{
    const pendiente=badIdx.has(i)||noAccountIdx.has(i);
    const cls='imp-row'+(d.dup?' dup':'')+(!d.incluir?' excluded':'')+(pendiente?' imp-pending-row':'');
    const [y,m]=d.fechaOriginal.split('-');
    const fueraP=+y!==IM.periodoAnio||+m!==IM.periodoMes;
    const vtoShow=d.fechaVencimiento?`<div style="font-size:9px;color:var(--mt);margin-top:2px" title="${d.fechaVencimientoOrigen==='archivo'?'Vencimiento informado por el archivo':'Vencimiento estimado: emisión + 30 días'}">Vence ${d.fechaVencimiento}${d.fechaVencimientoOrigen==='estimado30d'?' · 30d':''}</div>`:'';
    const fechaShow=(fueraP
      ? `<span style="color:var(--err)" title="Fecha documental fuera del período RCV">${d.fechaOriginal}</span><div style="font-size:9px;color:var(--info)">Contab. → ${fechaContabilizacionImport(d)}</div>`
      : d.fechaOriginal)+vtoShow;
    const cambiosTxt=(d.cambiosRCV||[]).map(c=>`${c.label}: ${valorCambio(c.anterior)} → ${valorCambio(c.nuevo)}`).join(' · ');
    const estado=d.errorImport
      ?`<button type="button" class="imp-pending-mini" onclick="delete IM.docs[${i}].errorImport;renderImportModal()" title="${textoSeguroImport(d.errorImport)} · Toca para volver a validar y reintentar">⛔ ERROR</button>`
      :noAccountIdx.has(i)
      ?`<button type="button" class="imp-pending-mini" onclick="enfocarPendienteImportC(${i})" style="color:var(--warn)">⚠ SIN CUENTA</button>`
      :pendiente
      ?`<button type="button" class="imp-pending-mini" onclick="enfocarPendienteImportC(${i})">⚠ PENDIENTE</button>`
      :d.estadoImport==='manual'
      ?`<span class="dup-badge" style="background:rgba(88,166,255,.12);color:var(--info)" title="Este DTE ya existe dentro de un asiento manual y el importador no lo modificará">YA EN ASIENTO</span>`
      :d.estadoImport==='igual'
      ?`<span class="ok-badge" style="background:rgba(139,148,158,.12);color:var(--mt)" title="Huella RCV idéntica: no se volverá a escribir">SIN CAMBIOS</span>`
      :d.estadoImport==='cambio'
        ?`<span class="dup-badge" style="background:rgba(210,153,34,.15);color:var(--warn)" title="${cambiosTxt.replace(/"/g,'&quot;')}">CAMBIO SII${typeof d.dup?.corrMes==='number'?' N°'+String(d.dup.corrMes).padStart(3,'0'):''}</span>`
        :(d.cuenta?`<span class="ok-badge">NUEVO</span>`:`<span style="color:var(--mt);font-size:10px">pendiente</span>`);
    const selHtml=inputCuenta({id:`imp-cd-${i}`,value:d.cuenta||'',
      onPick:`setImportCuenta(${i},'%CD%')`,
      placeholder:'Buscar cuenta…',clase:'linea-inp',filtro:'compra'});
    // Selector de centro de costo (opcional)
    const ccHtml=`<select onchange="setImportCC(${i},this.value)" style="width:100%;font-size:11px;padding:3px">${ccOpts(d.cc||'')}</select>`;
    return `<div id="imp-row-${i}" class="${cls}">
      <div style="text-align:center"><input type="checkbox" ${d.incluir?'checked':''} ${(d.estadoImport==='igual'||d.estadoImport==='manual')?'disabled':''} onchange="toggleImportDoc(${i},this.checked)"></div>
      <div style="font-family:var(--mono);font-size:10px">${fechaShow}</div>
      <div style="font-family:var(--mono);font-size:10px">${d.tipoDTE}</div>
      <div style="font-family:var(--mono);font-size:10px">${d.numero}</div>
      <div style="font-family:var(--mono);font-size:10px">${rutFmt(d.rutCodigo,d.rutDV)}</div>
      <div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="${(d.razonSocial||'').replace(/"/g,'&quot;')}" onclick="toast('${(d.razonSocial||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;')}')">${d.razonSocial}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.neto)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.iva)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmt(d.otrosImpuestos)}</div>
      <div style="text-align:right;font-family:var(--mono);font-weight:600">${fmt(d.total)}</div>
      <div>${selHtml}</div>
      <div>${ccHtml}</div>
      <div>${estado}</div>
    </div>`;
  }).join('');
}

function toggleImportDoc(i,checked){
  IM.docs[i].incluir=checked;
  renderImportModal();
}
function toggleAllImport(checked){
  const sobre=(IM.modo||'agregar')==='sobrescribir';
  IM.docs.forEach(d=>{if(d.estadoImport!=='igual'&&d.estadoImport!=='manual')d.incluir=checked;});
  renderImportModal();
}
function setImportCuenta(i,cuenta){
  IM.docs[i].cuenta=cuenta;
  delete IM.docs[i].errorImport;
  renderImportModal();
}
// Guarda temporalmente la cuenta elegida en el buscador bulk
let _bulkCuentaImp='';
function setBulkCuentaImp(cd){_bulkCuentaImp=cd;}

function aplicarCuentaATodos(){
  // Leer del buscador (nuevo) o del select antiguo si aún existe
  const bulkInp=document.getElementById('imp-bulk-cd');
  const cta=_bulkCuentaImp||(bulkInp?bulkInp.dataset.cd:'')||
    (document.getElementById('imp-bulk')&&document.getElementById('imp-bulk').value)||'';
  if(!cta){toast('⚠️ Selecciona una cuenta primero','e');return;}
  let n=0;
  IM.docs.forEach(d=>{if(d.incluir){d.cuenta=cta;delete d.errorImport;n++;}});
  renderImportModal();
  toast(`✅ Aplicada cuenta a ${n} documento${n===1?'':'s'}`);
}

// ── Centro de costo en el importador ──
function setImportCC(i,cc){
  IM.docs[i].cc=cc;
  delete IM.docs[i].errorImport;
}
function aplicarCCATodos(){
  const sel=document.getElementById('imp-bulk-cc');
  const cc=sel?sel.value:'';
  // Se aplica también con cc vacío: eso significa "quitar CC a todos"
  let n=0;
  IM.docs.forEach(d=>{if(d.incluir){d.cc=cc;delete d.errorImport;n++;}});
  renderImportModal();
  toast(cc
    ? `✅ Centro de costo aplicado a ${n} documento${n===1?'':'s'}`
    : `✅ Centro de costo quitado de ${n} documento${n===1?'':'s'}`);
}

async function confirmarImportacion(){
  const perFecha=`${IM.periodoAnio}-${String(IM.periodoMes).padStart(2,'0')}-01`;
  if(!puedeOperarFecha(perFecha)){toast('🔒 El período RCV seleccionado está cerrado. Reábrelo antes de importar compras.','e');return;}
  const seleccionados=IM.docs.filter(d=>d.incluir);
  const descuadrados=validarCuadraturaImportCompras();
  const badIdx=new Set(descuadrados.map(x=>x.idx));
  const sinCuenta=IM.docs.map((d,idx)=>({...d,idx})).filter(d=>d.incluir&&!d.cuenta);
  const sinCuentaIdx=new Set(sinCuenta.map(x=>x.idx));
  const incluidos=IM.docs.filter((d,i)=>d.incluir&&d.cuenta&&!badIdx.has(i)&&!sinCuentaIdx.has(i));
  const modo=IM.modo||'agregar';
  const enPeriodoActivos=modo==='sobrescribir'?docsLibroDelPeriodo().filter(d=>d.estado!=='anulado'):[];
  const clavesFuente=new Set(IM.docs.map(claveDocCompra));
  const ausentesFuente=modo==='sobrescribir'?enPeriodoActivos.filter(d=>!clavesFuente.has(claveDocCompra(d))):[];
  if(!seleccionados.length&&!ausentesFuente.length){
    toast(`✅ Importación idempotente: ${IM.docs.filter(d=>d.estadoImport==='igual').length} documento(s) ya estaban idénticos. No se modificó el libro.`);
    cerrarImportModal();return;
  }
  if(descuadrados.length){
    const detalle=descuadrados.slice(0,8).map(x=>`• DTE ${x.tipoDTE} N° ${x.numero}: ${x.motivo||`diferencia ${fmtC(x.diferencia)}`}`).join('\n');
    if(!incluidos.length&&!ausentesFuente.length){
      alert(`⚠️ No hay documentos que pasen la validación contable.\n\n${detalle}${descuadrados.length>8?'\n• …':''}\n\nLos DTE indicados quedan pendientes en el importador para revisión.`);
      renderImportModal();return;
    }
    const ok=confirm(`⚠️ Se detectaron ${descuadrados.length} documento(s) que no pasan la validación contable.\n\n${detalle}${descuadrados.length>8?'\n• …':''}\n\nEstos NO se guardarán. Se procesarán ${incluidos.length} documento(s) válidos y los demás quedarán pendientes en esta ventana para corregir o revisar.\n\n¿Continuar?`);
    if(!ok){renderImportModal();return;}
  }
  if(sinCuenta.length&&!incluidos.length&&!ausentesFuente.length){
    toast(`⚠️ Asigna una cuenta a los ${sinCuenta.length} documento${sinCuenta.length===1?'':'s'} pendientes`,'e');
    renderImportModal();return;
  }
  const cambiosSeleccionados=incluidos.filter(d=>d.estadoImport==='cambio');
  if(cambiosSeleccionados.length){
    const detalle=cambiosSeleccionados.slice(0,8).map(d=>{
      const cs=(d.cambiosRCV||[]).slice(0,4).map(c=>c.label).join(', ');
      return `• DTE ${d.tipoDTE} N°${d.numero} ${d.razonSocial||''}: ${cs||'reactivación'}`;
    }).join('\n');
    if(!confirm(`⚠️ El SII trae ${cambiosSeleccionados.length} documento(s) con información distinta a la ya contabilizada.\n\n${detalle}${cambiosSeleccionados.length>8?'\n• …':''}\n\nSe conservará la versión anterior en el historial RCV. ¿Aplicar estos cambios?`))return;
  }
  // Detectar proveedores nuevos (RUTs que no aparecen en el libro actual)
  const rutsExistentes=new Set(todosDocsCompras().map(x=>x.rutCodigo));
  const proveedoresNuevos=new Map();
  incluidos.forEach(d=>{
    if(!rutsExistentes.has(d.rutCodigo)&&!proveedoresNuevos.has(d.rutCodigo)){
      proveedoresNuevos.set(d.rutCodigo,{rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial});
    }
  });
  // ── Modo sobrescribir ──────────────────────────────────────────────
  // Reemplaza el libro del periodo por el contenido del archivo, conservando
  // el correlativo mensual (corrMes), el folio de comprobante y la
  // distribución de gastos de los documentos que ya existían.
  const periodoStrConf=`${MESES[IM.periodoMes-1]} ${IM.periodoAnio}`;
  // V2.15.4: punto de recuperación antes de una operación masiva RCV.
  if(window.__snapshotAntesOperacion){
    const seg=await window.__snapshotAntesOperacion(`Antes de importar RCV compras ${periodoStrConf}`);
    if(!seg?.ok){
      const seguir=confirm(`⚠️ No se pudo crear el snapshot previo (${seg?.motivo||'error'}).\n\nLa importación todavía puede continuar, pero no tendrás un punto automático de retorno inmediato.\n\n¿Continuar de todas formas?`);
      if(!seguir)return;
    }
  }
  const snapCompras=JSON.stringify(S.compras||[]);
  const snapAsientos=JSON.stringify(S.asientos||[]);
  const prevPorClave=new Map();   // clave → documento anterior
  S.compras.forEach(d=>{const k=claveDocCompra(d);if(!prevPorClave.has(k)||prevPorClave.get(k)?.estado==='anulado')prevPorClave.set(k,d);});
  let reemplazados=0,depurados=0;
  if(modo==='sobrescribir'){
    // Se indexa TODO el libro (no solo el periodo) para recuperar identidad,
    // correlativo y clasificación sin reescribir documentos idénticos.
    const enPeriodo=enPeriodoActivos;
    const clavesArchivo=clavesFuente;
    reemplazados=enPeriodo.filter(d=>clavesArchivo.has(claveDocCompra(d))).length;
    depurados=enPeriodo.length-reemplazados;
    const ok=confirm(
      `♻️ Sobrescribir el Libro de Compras de ${periodoStrConf}\n\n`+
      `• Se concilian los ${enPeriodo.length} documento(s) que hoy tiene el libro en ese periodo; los ausentes quedarán anulados, no eliminados.\n`+
      `• Se cargan los ${incluidos.length} documento(s) del archivo del SII.\n`+
      `• ${reemplazados} conservan su correlativo mensual y su clasificación de cuentas.\n`+
      (depurados?`• ⚠️ ${depurados} documento(s) del libro NO vienen en el archivo y se anularán conservando trazabilidad.\n`:'')+
      `\nLos documentos registrados desde asientos manuales no se modifican.\n\n¿Continuar?`
    );
    if(!ok)return;
    const per=`${IM.periodoAnio}-${String(IM.periodoMes).padStart(2,'0')}`;
    // V2.4: nunca borrar físicamente. Sólo se anulan los documentos que ya no
    // vienen en el RCV. Los que siguen presentes se actualizan conservando id,
    // correlativo, folio y referencias de pago.
    enPeriodo.filter(d=>!clavesArchivo.has(claveDocCompra(d))).forEach(d=>{
      d.estado='anulado';d.anuladoEn=new Date().toISOString();d.motivoAnulacion='Depurado por sobrescritura RCV '+per;
      anularAsientoDocumento('compras',d.id,'Depurado por sobrescritura RCV '+per);
    });
  }

  // Crear registros de compras
  let agregados=0,fueraPeriodoContable=0;
  const aplicados=[],pendientesError=[];
  const sinCorr=[];   // docs que quedaron sin correlativo (se asigna al final)
  const ts=Date.now();
  // Reservar el rango de folios de comprobante ANTES de crear los docs, así
  // cada uno recibe un correlativo único y consecutivo aunque el import
  // se interrumpa a mitad.
  // Los folios de comprobante se asignan DESPUÉS de crear los documentos: al
  // sobrescribir, los que se conservan mantienen el suyo y los nuevos deben
  // tomar números que no choquen con ellos.
  const sinFolio=[];
  incluidos.forEach((d,i)=>{
    const fechaFinal=d.fechaOriginal;
    const periodoContable=periodoImportSeleccionado();
    const fechaContabilizacion=fechaContabilizacionImport(d);
    const fueraDelPeriodo=fechaFinal.slice(0,7)!==periodoContable;
    // La distribución importada representa la base económica (neto + exento).
    // El motor V2.8 clasifica otros impuestos e IVA no recuperable antes de llevarlos al costo y
    // separa el crédito fiscal recuperable (general / activo fijo).
    // DTE 45/46 (factura de compra): el IVA retenido se modela por separado.
    // La distribución contiene sólo la base económica; el motor deriva proveedor y retención.
    const montoDist=d.neto+d.exento; // V2: la distribución representa la base económica; IVA/otros se tratan en el motor
    // En modo sobrescribir recuperamos lo que ya estaba registrado para este
    // mismo documento: correlativo, folio de comprobante, vencimiento y la
    // distribución de gastos si sigue cuadrando con el nuevo neto.
    const prev=prevPorClave.get(claveDocCompra(d))||null;
    let dist=[{cuenta:d.cuenta,monto:montoDist,cc:d.cc||''}];
    if(prev&&Array.isArray(prev.dist)&&prev.dist.length>1){
      const sumPrev=prev.dist.reduce((s,l)=>s+(l.monto||0),0);
      if(Math.abs(sumPrev-montoDist)<=1)dist=prev.dist.map(l=>({...l}));
    }
    const doc={
      id:prev?prev.id:'c_imp_'+ts+'_'+i,
      folioComp:(prev&&+prev.folioComp)||0,   // correlativo único de comprobante contable
      fecha:fechaFinal,
      periodoContable,
      fechaContabilizacion,
      origenRegistro:'RCV',
      fechaVencimiento:d.fechaVencimiento||'',
      fechaVencimientoOrigen:d.fechaVencimientoOrigen||'',
      fechaRecepcionSII:d.fechaRecepcionSII||'',
      fechaAcuseSII:d.fechaAcuseSII||'',
      tipoDTE:d.tipoDTE,
      numero:d.numero,
      rutCodigo:d.rutCodigo,
      rutDV:d.rutDV,
      razonSocial:d.razonSocial,
      neto:d.neto,
      exento:d.exento,
      iva:d.iva,
      ...(d.ivaRecuperable!=null?{ivaRecuperable:d.ivaRecuperable}:{}),
      ...(d.ivaNoRecuperable!=null?{ivaNoRecuperable:d.ivaNoRecuperable}:{}),
      ...(d.codigoIvaNoRecuperable?{codigoIvaNoRecuperable:d.codigoIvaNoRecuperable}:{}),
      ...(d.ivaUsoComun?{ivaUsoComun:d.ivaUsoComun}:{}),
      ...(d.ivaActivoFijo?{ivaActivoFijo:d.ivaActivoFijo}:{}),
      ...(d.tratamientoIVA?{tratamientoIVA:d.tratamientoIVA}:{}),
      otrosImpuestos:d.otrosImpuestos||0,
      tratamientoOtrosImpuestos:d.tratamientoOtrosImpuestos||'costo',
      otrosImpuestosDetalle:d.otrosImpuestosDetalle||((d.otrosImpuestos||0)?[{tipo:'otro',nombre:'Otros impuestos RCV',monto:d.otrosImpuestos||0,tratamiento:'costo'}]:[]),
      ...(d.tipoCompra?{tipoCompra:d.tipoCompra}:{}),
      ...(d.numeroInternoSII?{numeroInternoSII:d.numeroInternoSII}:{}),
      // DTE 45/46 importados desde RCV históricamente pueden informar el total
      // pagadero al proveedor sin sumar el IVA retenido. El motor usa esta marca
      // para no depender de una excepción dentro de reportes.js.
      totalIncluyeRetencion:(+d.tipoDTE===45||+d.tipoDTE===46)?false:undefined,
      ...((+d.tipoDTE===45||+d.tipoDTE===46)?{ivaRetenido:d.ivaRetenido!=null?d.ivaRetenido:d.iva,totalSII:d.totalSII!=null?d.totalSII:d.total}:{}),
      total:d.total,
      dist,
      estado:'activo',
      importadoEn:prev?.importadoEn||new Date().toISOString(),
      ...(prev?{reimportadoEn:new Date().toISOString()}:{}),
      rcvFingerprint:fingerprintSnapshot(snapshotCompraRCV(d,periodoContable)),
      rcvVersion:2,
      ...(prev?{
        versionAnterior:{fecha:prev.fecha,fechaVencimiento:prev.fechaVencimiento||'',tipoDTE:prev.tipoDTE,numero:prev.numero,neto:prev.neto,exento:prev.exento,iva:prev.iva,otrosImpuestos:prev.otrosImpuestos,total:prev.total},
        rcvHistorial:[...(Array.isArray(prev.rcvHistorial)?prev.rcvHistorial:[]),{
          fecha:new Date().toISOString(),
          snapshot:snapshotCompraRCV(prev,prev.periodoContable||''),
          cambios:(d.cambiosRCV||[]).map(c=>({campo:c.campo,anterior:c.anterior,nuevo:c.nuevo}))
        }].slice(-20)
      }: {})
    };
    // Correlativo mensual: se reutiliza el del documento anterior si existía.
    if(prev&&typeof prev.corrMes==='number')doc.corrMes=prev.corrMes;
    const idxPrev=S.compras.findIndex(x=>x.id===doc.id);
    const docAnterior=idxPrev>=0?JSON.parse(JSON.stringify(S.compras[idxPrev])):null;
    const asientosAntes=JSON.stringify(S.asientos||[]);
    try{
      if(idxPrev>=0)S.compras[idxPrev]=doc;else S.compras.push(doc);
      upsertAsientoDocumento('compras',doc);
      if(typeof doc.corrMes!=='number')sinCorr.push(doc);
      if(!doc.folioComp)sinFolio.push(doc);
      if(fueraDelPeriodo)fueraPeriodoContable++;
      delete d.errorImport;
      aplicados.push(d);agregados++;
    }catch(err){
      if(idxPrev>=0)S.compras[idxPrev]=docAnterior;
      else{
        const creado=S.compras.findIndex(x=>x.id===doc.id);
        if(creado>=0)S.compras.splice(creado,1);
      }
      S.asientos=JSON.parse(asientosAntes);
      d.errorImport=err?.message||String(err);
      d.estadoImport='pendiente_error';d.incluir=true;
      pendientesError.push(d);
    }
  });

  // Asignar folio de comprobante a los documentos que no heredaron uno,
  // saltando los que ya están ocupados en todo el sistema.
  if(sinFolio.length){
    const usadosF=new Set();
    (S.asientos||[]).forEach(a=>{const n=+a.folioComp||+a.n||0;if(n)usadosF.add(n);});
    (S.compras||[]).forEach(d=>{const n=+d.folioComp||0;if(n)usadosF.add(n);});
    (S.ventas||[]).forEach(d=>{const n=+d.folioComp||0;if(n)usadosF.add(n);});
    if(S.apertura?.folioComp)usadosF.add(+S.apertura.folioComp);
    let fn=proxFolioComprobante();
    sinFolio.forEach(doc=>{while(usadosF.has(fn))fn++;doc.folioComp=fn;usadosF.add(fn);});
  }

  // Asignar correlativo a los documentos nuevos: se toman los números libres
  // del mes (los huecos que dejaron los documentos eliminados), de modo que el
  // libro quede numerado de 1 a N sin saltos.
  if(sinCorr.length){
    const usados={};
    S.compras.forEach(d=>{
      if(typeof d.corrMes!=='number')return;
      const m=periodoContableCompra(d);if(!m)return;
      (usados[m]||(usados[m]=new Set())).add(d.corrMes);
    });
    sinCorr.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||String(a.numero).localeCompare(String(b.numero)))
      .forEach(doc=>{
        const m=periodoContableCompra(doc);if(!m)return;
        const set=usados[m]||(usados[m]=new Set());
        let n=1;while(set.has(n))n++;
        doc.corrMes=n;set.add(n);
      });
  }

  try{
    await persistirClavesCritico([
      {key:'compras-'+S.empresa.anio,value:JSON.stringify(S.compras)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos||[])},
    ]);
  }catch(err){
    S.compras=JSON.parse(snapCompras);S.asientos=JSON.parse(snapAsientos);
    toast('❌ No se pudo completar la importación. Se revirtieron documentos y asientos.','e');return;
  }

  // Auditoría inmutable de cambios RCV. Para altas masivas se registra un
  // resumen de lote; cuando el SII cambió un documento existente se conserva
  // además el antes/después individual.
  aplicados.filter(d=>d.estadoImport==='cambio').forEach(d=>{
    const prev=d.dup||null;
    const nuevo=prev?S.compras.find(x=>x.id===prev.id):null;
    if(nuevo)logCambio('Actualizó compra desde RCV',{entidad:'compra',id:nuevo.id,antes:prev,despues:nuevo,meta:{numeroContable:(S.asientos||[]).find(a=>a.docId===nuevo.id&&a.fuente==='compras')?.numeroContable,tipoDTE:nuevo.tipoDTE,folio:nuevo.numero,periodoContable:nuevo.periodoContable}});
  });
  logCambio('Importó lote RCV compras',{entidad:'lote-rcv',id:`compras:${periodoStrConf}:${Date.now()}`,antes:null,despues:null,meta:{periodo:periodoStrConf,archivo:IM.archivo||'',nuevos:aplicados.filter(d=>d.estadoImport==='nuevo').length,cambios:aplicados.filter(d=>d.estadoImport==='cambio').length,conError:pendientesError.length,sinCambios:IM.docs.filter(d=>d.estadoImport==='igual').length,modo}});

  // Guardar cuenta y CC como default en la ficha del proveedor.
  // Reglas:
  //  - Si el proveedor NO tiene ficha, se crea con los datos actuales.
  //  - Si tiene ficha pero SIN cuentaDefault/ccDefault, se completan.
  //  - Si ya tiene cuentaDefault/ccDefault configurados por el usuario,
  //    NO se sobreescriben (respetamos su configuración).
  //  - Cuando un proveedor tiene documentos con distinta cuenta en el mismo
  //    batch, se usa la más frecuente.
  const asignaciones={};  // rut → { cuenta:{cd→count}, cc:{cd→count}, dv, razon }
  aplicados.forEach(d=>{
    const key=d.rutCodigo;
    if(!key)return;
    if(!asignaciones[key])asignaciones[key]={cuenta:{},cc:{},rutDV:d.rutDV,razonSocial:d.razonSocial};
    if(d.cuenta)asignaciones[key].cuenta[d.cuenta]=(asignaciones[key].cuenta[d.cuenta]||0)+1;
    if(d.cc)asignaciones[key].cc[d.cc]=(asignaciones[key].cc[d.cc]||0)+1;
    if(!asignaciones[key].razonSocial&&d.razonSocial)asignaciones[key].razonSocial=d.razonSocial;
  });
  let fichasCreadas=0, fichasActualizadas=0;
  const proveedoresF=fichasAux('proveedor');
  Object.entries(asignaciones).forEach(([rut,a])=>{
    const cuentaTop=Object.entries(a.cuenta).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ccTop=Object.entries(a.cc).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ficha=proveedoresF[rut];
    if(!ficha){
      // Ficha nueva con datos básicos (se completa el resto luego)
      proveedoresF[rut]={
        rutCodigo:rut, rutDV:a.rutDV, razonSocial:a.razonSocial||'',
        cuentaDefault:cuentaTop, ccDefault:ccTop,
        giro:'', direccion:'', comuna:'', ciudad:'', email:'', telefono:'', notas:'',
      };
      fichasCreadas++;
    }else{
      // Completar solo los campos vacíos, respetando lo que el usuario ya haya
      // configurado manualmente
      let cambio=false;
      if(!ficha.cuentaDefault&&cuentaTop){ficha.cuentaDefault=cuentaTop;cambio=true;}
      if(!ficha.ccDefault&&ccTop){ficha.ccDefault=ccTop;cambio=true;}
      if(!ficha.razonSocial&&a.razonSocial){ficha.razonSocial=a.razonSocial;cambio=true;}
      if(!ficha.rutDV&&a.rutDV){ficha.rutDV=a.rutDV;cambio=true;}
      if(cambio)fichasActualizadas++;
    }
  });
  if(fichasCreadas||fichasActualizadas){
    guardarFichasAux().catch(e=>console.warn('No se pudo guardar ficha auxiliar:',e));
  }

  // Mantener abierta la ventana con todo lo que todavía requiere acción:
  // descuadre real o falta de cuenta. Antes, los sin cuenta desaparecían de la
  // vista después de aplicar el resto del lote.
  const pendientes=[...new Set([...IM.docs.filter((d,i)=>badIdx.has(i)||sinCuentaIdx.has(i)),...pendientesError])];
  if(pendientes.length){
    IM.docs=pendientes;
    IM.docs.forEach(d=>{d.incluir=true;d.estadoImport=d.errorImport?'pendiente_error':(d.cuenta?'pendiente_cuadratura':'pendiente_cuenta');});
    renderImportModal();
  }else cerrarImportModal();
  const periodoStr=periodoStrConf;
  const proveedoresNuevosAplicados=new Set(aplicados.filter(d=>proveedoresNuevos.has(d.rutCodigo)).map(d=>d.rutCodigo)).size;
  const msgProv=proveedoresNuevosAplicados?` · ${proveedoresNuevosAplicados} proveedor${proveedoresNuevosAplicados===1?'':'es'} nuevo${proveedoresNuevosAplicados===1?'':'s'} detectado${proveedoresNuevosAplicados===1?'':'s'} en auxiliares`:'';
  const msgFichas=(fichasCreadas||fichasActualizadas)?` · fichas: ${fichasCreadas} nuevas${fichasActualizadas?', '+fichasActualizadas+' completadas':''}`:'';
  const msgPend=pendientes.length?` · ⚠️ ${pendientes.length} pendiente${pendientes.length===1?'':'s'} de clasificación/revisión`:'';
  const msgError=pendientesError.length?` · ⛔ ${pendientesError.length} con error aislado`:'';
  if(modo==='sobrescribir'){
    toast(`♻️ ${periodoStr} reemplazado — ${agregados} documento${agregados===1?'':'s'} · ${reemplazados} conservaron su correlativo${depurados?` · ${depurados} anulado${depurados===1?'':'s'}`:''}${msgFichas}${msgPend}${msgError}`);
    logAccion('Sobrescribió compras SII',`${periodoStr}: ${agregados} nuevos/cambiados, ${reemplazados} ya presentes, ${depurados} anulados por ausencia en RCV`);
  }else{
    toast(`✅ ${agregados} documento${agregados===1?'':'s'} importado${agregados===1?'':'s'} al periodo ${periodoStr}${fueraPeriodoContable?` (${fueraPeriodoContable} con fecha documental distinta del período RCV, conservada sin cambios)`:''}${msgProv}${msgFichas}${msgPend}${msgError}`);
    logAccion('Importó compras SII',`${agregados} documentos${msgFichas}`);
  }
  rerender();
}

// Listener del file input (se adjunta al init)
function initImportListener(){
  const input=document.getElementById('imp-file');
  if(input&&!input._listenerAttached){
    input.addEventListener('change',handleFileImport);
    input._listenerAttached=true;
  }
}


export {onMesChangeC, limpiarFiltrosC, dteComprasOpts, cuentasGastoOpts, renderCompras, renderCResumen,
        renderCDupAlert, gruposDuplicadosCompras, verDuplicadoC, cambiarModoImport, abrirCF, editarCompra, cerrarCF, cfRutInput, cfCheckDup, cfDteChanged, cfRefrescarDocs, cfSeleccionarReferencia, cfCalcTotals, cfTratamientoIVAUI, renderDist, addDist, delDist, updCfCheck, guardarCompra, eliminarCompra, IM,  abrirImportSII, handleFileImport,  mostrarDocsImportados, abrirImportModal, cambiarPeriodoImport, cerrarImportModal, fechaEfectivaImport, renderImportModal, toggleImportDoc, toggleAllImport, setImportCuenta, aplicarCuentaATodos, setImportCC, aplicarCCATodos, setBulkCuentaImp, confirmarImportacion, initImportListener, enfocarPendienteImportC,
        toggleCSel, toggleCSelAll, limpiarCSel, eliminarCSel, validarCuadraturaImportCompras, CF};
