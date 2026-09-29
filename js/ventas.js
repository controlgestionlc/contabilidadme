// ventas.js — Libro de ventas (documentos individuales)
import {toast, pn, today, MESES, IVA, DTE_VENTAS, dteV, rutParse, rutFmt, rutDV, fmt, fmtC, CUENTAS_INGRESO} from './core.js';
import {leerArchivo,resolverVencimientoImportado} from './importadorsii.js';
import {inputCuenta} from './buscadorcuentas.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import {rerender} from './ui.js';
import {S} from './state.js';
import {logAccion,logCambio} from './firebase.js';
import {mesRango, mesOpts, dteVentasOpts, foliosMensuales} from './helpers.js';
import {todosDocsVentas, abrirAsientoDesde, proxFolioComprobante} from './asientos.js';
import './storage.js';
import {guardarDocumentoContabilizado,anularDocumentoContabilizado,ejercicioCerrado,upsertAsientoDocumento,anularAsientoDocumento,persistirClavesCritico,puedeOperarFecha} from './contabilidad-v2.js';
import {claveRCV,compararVentaRCV,snapshotVentaRCV,fingerprintSnapshot,valorCambio} from './rcv-control.js';
import {asientoVenta} from './motor-contable.js';
import {validarMovimientosPDC} from './pdc-reglas.js';

// Estado del formulario de ventas (interno del módulo)
// Mismo cuidado que con AF y CF: este objeto se publica en window desde app.js,
// así que se muta, nunca se reasigna. Hoy sólo lo lee este módulo, pero dejarlo
// como `let` reasignable es la trampa que ya costó dos bugs silenciosos.
const VF={editId:null};
const textoSeguroImportV=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fijarVF=editId=>{VF.editId=editId==null?null:editId;};
let IMV={docs:[]}; // estado del importador SII de ventas

function validarCuadraturaImportVentas(){
  const out=[];
  IMV.docs.forEach((d,i)=>{
    if(!d.incluir)return;
    const doc={...d,id:d.dup?.id||`preview-v-${i}`,fecha:d.fechaOriginal||d.fecha,
      formaPago:d.dup?.formaPago||d.fp||'clientes',cuentaIngreso:d.dup?.cuentaIngreso||d.cuenta||''};
    try{
      const a=asientoVenta(doc);
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

function enfocarPendienteImportV(i){
  const el=document.getElementById('impv-row-'+i);
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.add('imp-pending-focus');
  setTimeout(()=>el.classList.remove('imp-pending-focus'),1800);
}

function alertaCuadraturaImport(lista){
  if(!lista.length)return '';
  const items=lista.slice(0,8).map(x=>`<button type="button" class="imp-pending-link" onclick="enfocarPendienteImportV(${x.idx})">DTE ${x.tipoDTE} N° ${textoSeguroImportV(x.numero)} · ${textoSeguroImportV(x.motivo||`diferencia ${fmtC(x.diferencia)}`)}</button>`).join('');
  return `<div class="imp-pending-alert"><strong>⚠️ ${lista.length} documento${lista.length===1?'':'s'} no pasarían la validación contable.</strong><div class="imp-pending-links">${items}${lista.length>8?`<span>… y ${lista.length-8} más</span>`:''}</div><span>Se detectaron antes de guardar. Los documentos válidos sí pueden importarse; estos quedarán pendientes para corregir su cuenta, auxiliar, centro de costo o cuadratura.</span></div>`;
}

function recalcularEstadoImportVentas(){
  IMV.docs.forEach(d=>{
    const prev=d.dup;
    if(!prev){d.estadoImport='nuevo';d.cambiosRCV=[];if(d.incluir==null)d.incluir=true;return;}
    if(prev.origen==='asiento'){d.estadoImport='manual';d.cambiosRCV=[];d.incluir=false;return;}
    const cmp=compararVentaRCV(d,prev);
    d.cambiosRCV=cmp.cambios;d.rcvFingerprint=cmp.fingerprint;
    if(prev.estado==='anulado'){d.estadoImport='cambio';d.cambiosRCV=[{campo:'estado',label:'Estado',anterior:'Anulado',nuevo:'Activo'},...d.cambiosRCV];}
    else d.estadoImport=cmp.igual?'igual':'cambio';
  });
}

// ═══ VENTAS — Documentos individuales ═══
// Computa folio correlativo por mes: retorna {[docId]: folioNumero}
// Al elegir un mes en el select, auto-poblar desde/hasta con primer y último día
function onMesChangeV(){
  const m=+(document.getElementById('vf-mes')?.value||0);
  if(m){const r=mesRango(m);document.getElementById('vf-desde').value=r.desde;document.getElementById('vf-hasta').value=r.hasta;}
  else{document.getElementById('vf-desde').value='';document.getElementById('vf-hasta').value='';}
  renderVentas();
}
function limpiarFiltrosV(){
  ['vf-mes','vf-desde','vf-hasta','vf-dte-flt','vf-search'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderVentas();
}
// Estado interno: ids de documentos seleccionados para acciones masivas
let VF_SEL=new Set();

function toggleVSel(id){
  if(VF_SEL.has(id))VF_SEL.delete(id);else VF_SEL.add(id);
  renderVentas();
}
function toggleVSelAll(marcados){
  // Solo alterna los que se están mostrando actualmente
  const box=document.getElementById('v-tbody');
  if(!box)return;
  box.querySelectorAll('input.v-chk[data-id]').forEach(chk=>{
    const id=chk.dataset.id;
    if(marcados)VF_SEL.add(id);else VF_SEL.delete(id);
  });
  renderVentas();
}
function limpiarVSel(){VF_SEL.clear();renderVentas();}
async function cambiarFPVSel(nuevaFP){
  if(!VF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de modificar ventas.','e');return;}
  const cerrados=(S.ventas||[]).filter(d=>VF_SEL.has(d.id)&&!puedeOperarFecha(d.fecha));
  if(cerrados.length){toast(`🔒 ${cerrados.length} venta(s) pertenecen a períodos cerrados.`, 'e');return;}
  const fpLbl=nuevaFP==='clientes'?'a crédito (Cliente)':nuevaFP==='banco'?'al contado (Banco)':nuevaFP;
  const snapV=JSON.stringify(S.ventas||[]),snapA=JSON.stringify(S.asientos||[]);
  let cambiados=0, omitidos=0;
  try{
    S.ventas.forEach(d=>{
      if(!VF_SEL.has(d.id)||d.estado==='anulado')return;
      if(d.formaPago!==nuevaFP){d.formaPago=nuevaFP;upsertAsientoDocumento('ventas',d);cambiados++;}
    });
    omitidos=VF_SEL.size-S.ventas.filter(d=>VF_SEL.has(d.id)).length;
    if(!cambiados&&!omitidos){toast('Los documentos ya tenían esa forma de pago');return;}
    await persistirClavesCritico([
      {key:'ventas-'+S.empresa.anio,value:JSON.stringify(S.ventas)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos||[])},
    ]);
  }catch(e){
    S.ventas=JSON.parse(snapV);S.asientos=JSON.parse(snapA);
    toast('❌ No se pudo guardar el cambio. No se aplicaron modificaciones.','e');return;
  }
  VF_SEL.clear();
  toast(`✅ ${cambiados} documento${cambiados===1?'':'s'} marcado${cambiados===1?'':'s'} ${fpLbl}${omitidos?` · ${omitidos} omitido${omitidos===1?'':'s'} (vienen de asientos)`:''}`);
  logAccion('Cambió forma de pago masivamente',`${cambiados} ventas → ${nuevaFP}`);
  rerender();
}
async function eliminarVSel(){
  const cerrados=(S.ventas||[]).filter(d=>VF_SEL.has(d.id)&&!puedeOperarFecha(d.fecha));
  if(cerrados.length){toast(`🔒 ${cerrados.length} documento(s) pertenecen a períodos cerrados. Reabre esos períodos antes de anular.`, 'e');return;}
  if(!VF_SEL.size){toast('⚠️ No hay documentos seleccionados','e');return;}
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de anular ventas.','e');return;}
  const n=VF_SEL.size;
  if(!confirm(`¿Anular ${n} documento${n===1?'':'s'} de venta seleccionado${n===1?'':'s'}?

Los documentos y sus asientos se conservarán para trazabilidad.`))return;
  const snapV=JSON.stringify(S.ventas||[]),snapA=JSON.stringify(S.asientos||[]);
  let borrados=0;
  try{
    S.ventas.forEach(d=>{if(VF_SEL.has(d.id)&&d.estado!=='anulado'){d.estado='anulado';d.anuladoEn=new Date().toISOString();anularAsientoDocumento('ventas',d.id,'anulación masiva');borrados++;}});
    await persistirClavesCritico([
      {key:'ventas-'+S.empresa.anio,value:JSON.stringify(S.ventas)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos||[])},
    ]);
  }catch(e){
    S.ventas=JSON.parse(snapV);S.asientos=JSON.parse(snapA);
    toast('❌ No se pudo guardar la anulación. No se aplicaron cambios.','e');return;
  }
  VF_SEL.clear();
  toast(`🚫 ${borrados} documento${borrados===1?'':'s'} anulado${borrados===1?'':'s'}`);
  logAccion('Anuló ventas masivamente',`${borrados} documentos`);
  rerender();
}

function renderVentas(){
  const selMes=document.getElementById('vf-mes');
  if(selMes&&selMes.options.length<=1)selMes.innerHTML=mesOpts(selMes.value);
  const selDteFlt=document.getElementById('vf-dte-flt');
  if(selDteFlt&&selDteFlt.options.length<=1)selDteFlt.innerHTML='<option value="">Todos los DTE</option>'+DTE_VENTAS.map(d=>`<option value="${d.cod}">${d.cod} — ${d.nm}</option>`).join('');

  const fDesde=(document.getElementById('vf-desde')?.value||'');
  const fHasta=(document.getElementById('vf-hasta')?.value||'');
  const fDte=+(document.getElementById('vf-dte-flt')?.value||0);
  const fQ=(document.getElementById('vf-search')?.value||'').toLowerCase().trim();
  const todos=todosDocsVentas();
  const docs=[...todos].sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.numero||'').localeCompare(b.numero||''));
  const folios=foliosMensuales(todos);
  const fDocs=docs.filter(d=>{
    if(fDesde&&d.fecha<fDesde)return false;
    if(fHasta&&d.fecha>fHasta)return false;
    if(fDte&&+d.tipoDTE!==fDte)return false;
    if(fQ){const t=(d.rutCodigo+' '+(d.razonSocial||'')+' '+(d.numero||'')).toLowerCase();if(!t.includes(fQ))return false;}
    return true;
  });

  const cntMan=todos.filter(d=>d.origen==='asiento').length;

  // Sin ningún filtro activo no cargamos las filas. El usuario debe aplicar un
  // filtro de búsqueda para ver documentos.
  const hayFiltroV=!!(fDesde||fHasta||fDte||fQ);
  const tb=document.getElementById('v-tbody');
  const tf=document.getElementById('v-tfoot');
  if(!hayFiltroV){
    document.getElementById('vf-count').textContent=`${todos.length} documentos en total`;
    tb.innerHTML=`<tr><td colspan="15" class="empty" style="padding:36px 20px">
      <div class="ei">🔎</div>
      Aplica un filtro para ver documentos<br>
      <span style="font-size:11px;color:var(--mt)">Elige un mes, un rango de fechas, un tipo de DTE, o busca por RUT / razón social / N°.${todos.length?` Hay <strong>${todos.length}</strong> documentos registrados.`:''}</span>
    </td></tr>`;
    if(tf)tf.innerHTML='';
    renderVResumen();
    return;
  }

  document.getElementById('vf-count').textContent=`${fDocs.length} de ${todos.length} documentos${cntMan?` (${cntMan} desde asientos)`:''}`;

  // Barra de acciones masivas (solo si hay seleccionados)
  const barraSel=document.getElementById('v-bulk-bar');
  if(barraSel){
    if(VF_SEL.size){
      barraSel.style.display='flex';
      barraSel.innerHTML=`<span style="font-weight:600;color:var(--ac)">${VF_SEL.size} seleccionado${VF_SEL.size===1?'':'s'}</span>
        <button class="btn btn-i" style="font-size:11px" onclick="cambiarFPVSel('clientes')" title="Marcar como venta a crédito (genera cuenta por cobrar en el auxiliar del cliente)">📇 A crédito (Cliente)</button>
        <button class="btn btn-i" style="font-size:11px" onclick="cambiarFPVSel('banco')" title="Marcar como venta al contado (cobrada, sin saldo en el auxiliar)">💵 A contado (Banco)</button>
        <button class="btn btn-d" style="font-size:11px" onclick="eliminarVSel()">🗑 Eliminar seleccionados</button>
        <button class="btn btn-g" style="font-size:11px" onclick="limpiarVSel()">✕ Limpiar selección</button>`;
    }else{
      barraSel.style.display='none';
      barraSel.innerHTML='';
    }
  }

  if(!fDocs.length){
    tb.innerHTML=`<tr><td colspan="15" class="empty"><div class="ei">🛒</div>No hay documentos con ese filtro</td></tr>`;
    document.getElementById('v-tfoot').innerHTML='';
  }else{
    let tN=0,tE=0,tI=0,tO=0,tT=0;
    tb.innerHTML=fDocs.map(d=>{
      const signo=(dteV(d.tipoDTE)?.signo)||1;
      tN+=(d.neto||0)*signo;tE+=(d.exento||0)*signo;tI+=(d.iva||0)*signo;tO+=(d.otrosImpuestos||0)*signo;tT+=(d.total||0)*signo;
      const dte=dteV(d.tipoDTE);
      const fpMap={banco:'💵 Banco',clientes:'📇 Cliente',deudores:'📋 Deudor'};
      const mesSl=(d.fecha||'').slice(5,7);
      const folioNum=folios[d.id]||'';
      const esManual=d.origen==='asiento';
      const rowStyle=esManual?' style="background:rgba(88,166,255,.04)"':'';
      const origenBadge=esManual?`<div style="font-size:9px;color:var(--info);margin-top:2px">✏ Asiento N°${d.asientoN}</div>`:'';
      // Las notas de crédito RESTAN: se muestran en negativo y en rojo, igual
      // que como se computan en los totales, el F29 y el libro diario.
      const esNC=signo<0;
      const sg=v=>fmt((v||0)*signo);
      const cNC=esNC?' style="color:var(--err)"':'';
      const cNCb=esNC?' style="color:var(--err);font-weight:600"':' style="font-weight:600"';
      const acciones=esManual
        ?`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="abrirAsientoDesde('${d.asientoId}')">📝 Abrir</button>`
        :`<button class="btn btn-i" style="padding:3px 7px;font-size:10px" onclick="editarVenta('${d.id}')">✏️</button> <button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="eliminarVenta('${d.id}')">🗑</button>`;
      // Los documentos originados por asientos no se pueden marcar
      // (habría que borrar el asiento, no el reflejo en el libro)
      const chk=esManual
        ?'<span style="color:var(--mt);font-size:10px" title="Viene de un asiento manual">—</span>'
        :`<input type="checkbox" class="v-chk" data-id="${d.id}" ${VF_SEL.has(d.id)?'checked':''} onchange="toggleVSel('${d.id}')">`;
      return `<tr${rowStyle}>
        <td style="text-align:center;width:26px">${chk}</td>
        <td class="tl"><span class="doc-folio">${mesSl}-${String(folioNum).padStart(3,'0')}</span></td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.fecha}${origenBadge}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:${d.fechaVencimiento?'var(--tx)':'var(--mt)'}">${d.fechaVencimiento||'—'}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.tipoDTE}${esNC?' <span style="font-family:var(--sans);font-size:8px;font-weight:700;color:var(--err);border:1px solid var(--err);border-radius:3px;padding:0 3px;vertical-align:middle">NC</span>':''}${dte?`<div style="font-size:9px;color:var(--mt);font-family:var(--sans);line-height:1.1;margin-top:1px">${dte.nm.slice(0,18)}</div>`:''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${d.numero||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(d.rutCodigo,d.rutDV)}</td>
        <td class="tnm">${d.razonSocial||''}</td>
        <td${cNC}>${sg(d.neto)}</td>
        <td${cNC}>${sg(d.exento)}</td>
        <td${cNC}>${sg(d.iva)}</td>
        <td${cNC}>${sg(d.otrosImpuestos)}</td>
        <td${cNCb}>${sg(d.total)}</td>
        <td class="tl" style="font-size:11px">${esManual?'—':(fpMap[d.formaPago]||d.formaPago||'')}</td>
        <td style="text-align:center">${acciones}</td>
      </tr>`;
    }).join('');
    document.getElementById('v-tfoot').innerHTML=`<tr><td class="tl" colspan="8">TOTALES</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td><td colspan="2"></td></tr>`;
  }
  renderVResumen();
}

function renderVResumen(){
  const el=document.getElementById('v-resumen');if(!el)return;
  if(!S.ventas.length){el.innerHTML='';return;}
  const porMes=Array.from({length:12},()=>({neto:0,exento:0,iva:0,otros:0,total:0,cant:0}));
  // Mismo universo y mismo signo que el libro y el F29: las notas de crédito restan.
  todosDocsVentas().forEach(d=>{
    const m=+((d.fecha||'').slice(5,7))-1;if(m<0||m>11)return;
    const sg=(dteV(d.tipoDTE)?.signo)||1;
    porMes[m].neto+=(d.neto||0)*sg;porMes[m].exento+=(d.exento||0)*sg;porMes[m].iva+=(d.iva||0)*sg;porMes[m].otros+=(d.otrosImpuestos||0)*sg;porMes[m].total+=(d.total||0)*sg;porMes[m].cant++;
  });
  let tN=0,tE=0,tI=0,tO=0,tT=0,tC=0;
  let rows=porMes.map((p,i)=>{
    tN+=p.neto;tE+=p.exento;tI+=p.iva;tO+=p.otros;tT+=p.total;tC+=p.cant;
    if(!p.cant)return '';
    return `<tr><td class="tl">${MESES[i]}</td><td>${p.cant}</td><td>${fmt(p.neto)}</td><td>${fmt(p.exento)}</td><td>${fmt(p.iva)}</td><td>${fmt(p.otros)}</td><td style="font-weight:600">${fmt(p.total)}</td></tr>`;
  }).join('');
  if(!rows)rows=`<tr><td colspan="7" class="empty" style="padding:18px">Sin movimientos</td></tr>`;
  el.innerHTML=`<div class="card-np"><div style="padding:12px 16px;background:var(--sf2);font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd)">📅 Resumen Mensual</div><div class="tw"><table>
    <thead><tr><th class="tl">MES</th><th>N° DOCS</th><th>NETO</th><th>EXENTO</th><th>IVA</th><th>OTROS</th><th>TOTAL</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="tl">TOTAL ${S.empresa.anio}</td><td>${tC}</td><td>${fmt(tN)}</td><td>${fmt(tE)}</td><td>${fmt(tI)}</td><td>${fmt(tO)}</td><td>${fmt(tT)}</td></tr></tfoot>
  </table></div></div>`;
}

// — Form Ventas —
// V2.11 — referencias tributarias de Notas de Crédito/Débito
function vfDteChanged(){
  const t=+document.getElementById('vf-dte')?.value||0;
  const row=document.getElementById('vf-ref-row');if(row)row.style.display=(t===56||t===61)?'grid':'none';
  if(t===56||t===61)vfRefrescarDocs();
}

let _vfRefs=[];
const escOptV=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function vfAsegurarTipoReferencia(tipo){
  const sel=document.getElementById('vf-ref-tipo');if(!sel)return;
  const val=String(+tipo||33);
  if(![...sel.options].some(o=>o.value===val)){
    const info=dteV(+tipo);sel.add(new Option(`${val} — ${info?.nm||'Documento tributario'}`,val));
  }
  sel.value=val;
}
function vfRefrescarDocs(){
  const sel=document.getElementById('vf-ref-doc');if(!sel)return;
  const r=rutParse(document.getElementById('vf-rut')?.value||'');
  const actual={tipo:+document.getElementById('vf-ref-tipo')?.value||0,folio:(document.getElementById('vf-ref-folio')?.value||'').trim(),fecha:document.getElementById('vf-ref-fecha')?.value||''};
  _vfRefs=r.codigo?todosDocsVentas().filter(d=>d&&d.estado!=='anulado'&&d.rutCodigo===r.codigo&&d.id!==VF.editId)
    .sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||String(b.numero||'').localeCompare(String(a.numero||''))):[];
  const ayuda=document.getElementById('vf-ref-ayuda');
  if(!r.codigo){sel.innerHTML='<option value="">Ingrese el RUT para buscar documentos…</option>';if(ayuda)ayuda.textContent='Selecciona un documento ya registrado para completar la referencia.';return;}
  if(!_vfRefs.length){sel.innerHTML='<option value="">No hay documentos registrados para este cliente</option>';if(ayuda)ayuda.textContent='Puedes ingresar la referencia manualmente en los campos inferiores.';return;}
  sel.innerHTML='<option value="">Seleccionar documento referenciado…</option>'+_vfRefs.map((d,i)=>`<option value="${i}">${escOptV(d.fecha)} · DTE ${+d.tipoDTE||''} N° ${escOptV(d.numero)} · ${escOptV(fmtC(d.total||0))}</option>`).join('');
  const idx=_vfRefs.findIndex(d=>+d.tipoDTE===actual.tipo&&String(d.numero||'')===actual.folio&&(!actual.fecha||d.fecha===actual.fecha));
  if(idx>=0)sel.value=String(idx);
  if(ayuda)ayuda.textContent=`${_vfRefs.length} documento${_vfRefs.length===1?' disponible':'s disponibles'} para este cliente.`;
}
function vfSeleccionarReferencia(valor){
  if(valor==='')return;
  const d=_vfRefs[+valor];if(!d)return;
  vfAsegurarTipoReferencia(d.tipoDTE);
  document.getElementById('vf-ref-folio').value=d.numero||'';
  document.getElementById('vf-ref-fecha').value=d.fecha||'';
  const razon=document.getElementById('vf-ref-razon');
  if(razon&&!razon.value)razon.value=(+document.getElementById('vf-dte')?.value===61?'Anula / corrige documento seleccionado':'Modifica documento seleccionado');
}

function abrirVF(){
  fijarVF(null);
  const f=document.getElementById('vf-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('vf-title').textContent='Nuevo Documento de Venta';
  document.getElementById('vf-fecha').value=today();
  document.getElementById('vf-vence').value='';
  document.getElementById('vf-dte').innerHTML=dteVentasOpts('');
  ['vf-num','vf-rut','vf-rs','vf-neto','vf-exento','vf-iva','vf-otros','vf-total','vf-ref-folio','vf-ref-fecha','vf-ref-razon'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  vfDteChanged();
  document.getElementById('vf-fp').value='banco';
  document.getElementById('vf-dv').textContent='';
  document.getElementById('vf-dup-warn').style.display='none';
  _vfCuentaSel='';
  const wrap=document.getElementById('vf-cuenta-wrap');
  if(wrap)wrap.innerHTML=inputCuenta({id:'vf-cuenta',value:'',onPick:"setVfCuenta('%CD%')",placeholder:'Cuenta de ingreso (opcional)…',filtro:'ingreso'});
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function editarVenta(id){
  const d=S.ventas.find(x=>x.id===id);if(!d)return;
  fijarVF(id);
  const f=document.getElementById('vf-form');f.style.display='block';f.classList.add('editing');
  document.getElementById('vf-title').textContent='Editando Documento — '+rutFmt(d.rutCodigo,d.rutDV);
  document.getElementById('vf-fecha').value=d.fecha;
  document.getElementById('vf-vence').value=d.fechaVencimiento||'';
  document.getElementById('vf-dte').innerHTML=dteVentasOpts(d.tipoDTE);
  vfDteChanged();
  if(document.getElementById('vf-ref-tipo'))document.getElementById('vf-ref-tipo').value=d.referencia?.tipoDTE||33;
  if(document.getElementById('vf-ref-folio'))document.getElementById('vf-ref-folio').value=d.referencia?.folio||'';
  if(document.getElementById('vf-ref-fecha'))document.getElementById('vf-ref-fecha').value=d.referencia?.fecha||'';
  if(document.getElementById('vf-ref-razon'))document.getElementById('vf-ref-razon').value=d.referencia?.razon||'';
  document.getElementById('vf-num').value=d.numero||'';
  document.getElementById('vf-rut').value=(d.rutCodigo||'')+(d.rutDV||'');
  document.getElementById('vf-rs').value=d.razonSocial||'';
  document.getElementById('vf-neto').value=d.neto||'';
  document.getElementById('vf-exento').value=d.exento||'';
  document.getElementById('vf-iva').value=d.iva||'';
  document.getElementById('vf-otros').value=d.otrosImpuestos||'';
  document.getElementById('vf-total').value=d.total||'';
  document.getElementById('vf-fp').value=d.formaPago||'banco';
  document.getElementById('vf-dup-warn').style.display='none';
  _vfCuentaSel=d.cuentaIngreso||'';
  const wrap=document.getElementById('vf-cuenta-wrap');
  if(wrap)wrap.innerHTML=inputCuenta({id:'vf-cuenta',value:d.cuentaIngreso||'',onPick:"setVfCuenta('%CD%')",placeholder:'Cuenta de ingreso (opcional)…',filtro:'ingreso'});
  vfRutInput(document.getElementById('vf-rut').value);
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
let _vfCuentaSel='';
function setVfCuenta(cd){_vfCuentaSel=cd;}
function cerrarVF(){document.getElementById('vf-form').style.display='none';fijarVF(null);}

function vfRutInput(val){
  const r=rutParse(val);
  const el=document.getElementById('vf-dv');
  if(!r.raw){el.textContent='';el.className='rut-dv';vfRefrescarDocs();return;}
  if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv ok';
    const prev=S.ventas.find(v=>v.rutCodigo===r.codigo&&v.razonSocial);
    const rs=document.getElementById('vf-rs');
    if(prev&&!rs.value)rs.value=prev.razonSocial;
    vfRefrescarDocs();
  }else if(r.codigo){el.textContent='✗ DV ≠ '+rutDV(r.codigo);el.className='rut-dv bad';vfRefrescarDocs();}
  else{el.textContent='…';el.className='rut-dv';}
}

// Detección de duplicado en vivo (mientras el usuario escribe)
function vfCheckDup(){
  const warn=document.getElementById('vf-dup-warn');if(!warn)return;
  const tipoDTE=+document.getElementById('vf-dte').value;
  const numero=document.getElementById('vf-num').value.trim();
  const r=rutParse(document.getElementById('vf-rut').value);
  if(!tipoDTE||!numero||!r.codigo){warn.style.display='none';return;}
  const dup=S.ventas.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==VF.editId);
  if(dup){
    const folios=foliosMensuales(S.ventas);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    warn.className='doc-dup-warn';warn.style.display='';
    warn.innerHTML=`⚠️ <span>DOCUMENTO DUPLICADO</span><span style="font-weight:400;margin-left:auto;font-size:11px">Ya existe: Folio ${mesSl}-${String(f).padStart(3,'0')} · ${dup.fecha} · ${rutFmt(dup.rutCodigo,dup.rutDV)} · DTE ${dup.tipoDTE} N°${dup.numero} · ${fmtC(dup.total)}</span>`;
  }else{warn.style.display='none';}
}

function vfCalcTotals(changed){
  const neto=pn(document.getElementById('vf-neto').value);
  const exento=pn(document.getElementById('vf-exento').value);
  const otros=pn(document.getElementById('vf-otros').value);
  const ivaEl=document.getElementById('vf-iva'),totEl=document.getElementById('vf-total');
  const dte=dteV(document.getElementById('vf-dte').value);
  const afecto=dte?dte.afecto:true;
  if(changed==='neto'||changed==='exento'||changed==='otros'){
    const iva=afecto?Math.round(neto*IVA):0;
    ivaEl.value=iva||'';
    totEl.value=neto+exento+iva+otros;
  }else if(changed==='total'){
    const total=pn(totEl.value);
    if(afecto&&total>0&&!exento&&!otros){
      const n=Math.round(total/(1+IVA)),iv=total-n;
      document.getElementById('vf-neto').value=n;ivaEl.value=iv;
    }
  }else if(changed==='iva'){
    const iva=pn(ivaEl.value);
    totEl.value=neto+exento+iva+otros;
  }
}
function vfAutoCalc(){vfCalcTotals('neto');}

async function guardarVenta(){
  const fecha=document.getElementById('vf-fecha').value;
  const fechaVencimiento=document.getElementById('vf-vence').value||'';
  const tipoDTE=+document.getElementById('vf-dte').value;
  const numero=document.getElementById('vf-num').value.trim();
  const rutInput=document.getElementById('vf-rut').value;
  const razonSocial=document.getElementById('vf-rs').value.trim();
  const neto=pn(document.getElementById('vf-neto').value);
  const exento=pn(document.getElementById('vf-exento').value);
  const iva=pn(document.getElementById('vf-iva').value);
  const otrosImpuestos=pn(document.getElementById('vf-otros').value);
  const total=pn(document.getElementById('vf-total').value);
  const formaPago=document.getElementById('vf-fp').value;

  if(!fecha){toast('⚠️ Ingresa la fecha de emisión','e');return;}
  if(fechaVencimiento&&fechaVencimiento<fecha){toast('⚠️ La fecha de vencimiento no puede ser anterior a la emisión','e');return;}
  if(!tipoDTE){toast('⚠️ Selecciona el tipo de documento','e');return;}
  if(!numero){toast('⚠️ Ingresa el N° de documento','e');return;}
  const r=rutParse(rutInput);
  if(!r.codigo){toast('⚠️ Ingresa el RUT del cliente','e');return;}
  if(!r.valido){toast('⚠️ RUT inválido — dígito verificador no coincide','e');return;}
  if(!razonSocial){toast('⚠️ Ingresa la razón social','e');return;}
  if(total<=0){toast('⚠️ El total debe ser mayor a cero','e');return;}
  if(Math.abs((neto+exento+iva+otrosImpuestos)-total)>1){toast('⚠️ Neto + Exento + IVA + Otros no coincide con el Total','e');return;}

  const dup=S.ventas.find(v=>v.rutCodigo===r.codigo&&+v.tipoDTE===tipoDTE&&v.numero===numero&&v.id!==VF.editId);
  if(dup){
    const folios=foliosMensuales(S.ventas);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    toast(`⚠️ Documento duplicado — ya existe Folio ${mesSl}-${String(f).padStart(3,'0')} (${dup.fecha}, ${fmtC(dup.total)})`,'e');
    return;
  }

  const cuentaIngreso=_vfCuentaSel||(document.getElementById('vf-cuenta')?.dataset.cd)||'';
  const esNota=tipoDTE===56||tipoDTE===61;
  const referencia=esNota?{tipoDTE:+document.getElementById('vf-ref-tipo')?.value||33,folio:(document.getElementById('vf-ref-folio')?.value||'').trim(),fecha:document.getElementById('vf-ref-fecha')?.value||'',razon:(document.getElementById('vf-ref-razon')?.value||'').trim()}:null;
  const refRegistrada=referencia?_vfRefs.find(d=>+d.tipoDTE===referencia.tipoDTE&&String(d.numero||'')===referencia.folio&&(!referencia.fecha||d.fecha===referencia.fecha)):null;
  if(refRegistrada){referencia.documentoId=refRegistrada.id;referencia.totalOriginal=refRegistrada.total||0;}
  if(esNota&&!referencia.folio){toast('⚠️ Las Notas de Crédito/Débito deben indicar el folio del documento referenciado','e');return;}
  if(!puedeOperarFecha(fecha)){toast('🔒 El período contable de esta fecha está cerrado. Reabre el período antes de registrar o modificar documentos.','e');return;}
  const prevEdit=VF.editId?S.ventas.find(x=>x.id===VF.editId):null;
  const fechaVencimientoOrigen=fechaVencimiento
    ?((prevEdit?.fechaVencimiento===fechaVencimiento&&prevEdit?.fechaVencimientoOrigen)?prevEdit.fechaVencimientoOrigen:'manual')
    :'';
  const doc={id:VF.editId||'v_'+Date.now(),fecha,fechaVencimiento,fechaVencimientoOrigen,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,neto,exento,iva,otrosImpuestos,total,formaPago,cuentaIngreso,...(referencia?{referencia}:{}),...(prevEdit?{fechaRecepcionSII:prevEdit.fechaRecepcionSII||'',fechaAcuseSII:prevEdit.fechaAcuseSII||''}:{})};
  const editando=!!VF.editId;
  const rSave=await guardarDocumentoContabilizado('ventas',doc,S.ventas,editando);
  if(!rSave.ok){toast('❌ No se pudo contabilizar el documento. No se considera guardado. ('+(rSave.motivo||'error')+')','e');return;}
  toast(editando?'✅ Documento actualizado y contabilizado':'✅ Documento registrado y contabilizado');
  logAccion(editando?'Editó venta':'Registró venta',`DTE ${doc.tipoDTE} N°${doc.numero} · ${doc.razonSocial} · ${fmtC(doc.total)}`);
  cerrarVF();rerender();
}

async function eliminarVenta(id){
  const d=S.ventas.find(x=>x.id===id);if(!d)return;
  if(!confirm(`¿Eliminar documento ${d.tipoDTE} N°${d.numero} de ${d.razonSocial}?\nTotal: ${fmtC(d.total)}`))return;
  const r=await anularDocumentoContabilizado('ventas',d,S.ventas);
  if(!r.ok){toast(r.motivo==='ejercicio-cerrado'?'🔒 El ejercicio está cerrado':'❌ No se pudo guardar la anulación','e');return;}
  rerender();toast('🚫 Documento y asiento anulados (se conserva la trazabilidad)');
}




function initImportListenerV(){
  const input=document.getElementById('imp-ventas-file');
  if(input&&!input._bound){input._bound=true;input.addEventListener('change',handleFileImportVentas);}
}

// ═══ IMPORTACIÓN DESDE SII (Registro de Ventas) ═══

function abrirImportSIIVentas(){
  const input=document.getElementById('imp-ventas-file');
  input.value='';
  input.click();
}

async function handleFileImportVentas(e){
  const file=e.target.files[0];if(!file)return;
  try{
    const res=await leerArchivo(file,'venta');
    mostrarVentasImportadas(res,file.name);
  }catch(err){
    toast('❌ '+err.message,'e');
  }
}

function mostrarVentasImportadas(res,nombreArchivo){
  if(!res.docs.length){
    toast('⚠️ No se detectaron documentos válidos en el archivo','e');
    return;
  }
  // Periodo más frecuente
  const conteo={};
  res.docs.forEach(d=>{const mY=d.fecha.slice(0,7);conteo[mY]=(conteo[mY]||0)+1;});
  const [periodoTop]=Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
  const [anioTop,mesTop]=periodoTop.split('-');

  // Duplicados: comparación como string para tolerar tipos mixtos.
  const todos=todosDocsVentas();
  res.docs.forEach(d=>{
    const dupLibro=(S.ventas||[]).find(x=>claveRCV(x)===claveRCV(d));
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
    d.fechaOriginal=d.fecha;
    const ficha=fichaAux('cliente',d.rutCodigo);
    d.cuenta=dup?.cuentaIngreso||ficha?.cuentaDefault||'';
    d.fp=dup?.formaPago||'clientes';
  });

  // Mutar IMV in-place (NO reasignar): window.IMV apunta a este mismo objeto y
  // los onPick de los buscadores de cuenta escriben vía window.IMV. Si se
  // reasignara, esas escrituras irían al objeto viejo y la cuenta no se
  // guardaría (bug: "documentos sin cuenta" pese a asignarla).
  IMV.docs=res.docs;
  IMV.descartados=res.descartados||0;
  IMV.archivo=nombreArchivo;
  IMV.periodoMes=+mesTop;
  IMV.periodoAnio=+anioTop;
  recalcularEstadoImportVentas();
  abrirImportModalVentas();
}

function abrirImportModalVentas(){
  const selMes=document.getElementById('impv-periodo-mes');
  selMes.innerHTML=MESES.map((m,i)=>`<option value="${i+1}" ${i+1===IMV.periodoMes?'selected':''}>${m}</option>`).join('');
  const selAnio=document.getElementById('impv-periodo-anio');
  const cy=new Date().getFullYear();
  const anios=new Set();
  for(let y=cy-3;y<=cy+1;y++)anios.add(y);
  anios.add(IMV.periodoAnio);
  selAnio.innerHTML=[...anios].sort().map(y=>`<option value="${y}" ${y===IMV.periodoAnio?'selected':''}>${y}</option>`).join('');

  // Bulk: usa buscador dinámico
  const bulkWrap=document.getElementById('impv-bulk-wrap');
  if(bulkWrap){
    bulkWrap.innerHTML=inputCuenta({id:'impv-bulk-cd',value:'',
      onPick:"setBulkCuentaImpV('%CD%')",
      placeholder:'Buscar cuenta de ingreso por código o nombre…',
      clase:'linea-inp',filtro:'ingreso'});
  }

  renderImportModalVentas();
  document.getElementById('impv-modal').classList.add('open');
}

function cerrarImportModalVentas(){
  document.getElementById('impv-modal').classList.remove('open');
}

function cambiarPeriodoImportV(){
  IMV.periodoMes=+document.getElementById('impv-periodo-mes').value;
  IMV.periodoAnio=+document.getElementById('impv-periodo-anio').value;
  renderImportModalVentas();
}

function toggleAllImportV(v){
  IMV.docs.forEach(d=>{if(d.estadoImport!=='igual'&&d.estadoImport!=='manual')d.incluir=v;});
  renderImportModalVentas();
}

// Guarda temporalmente la cuenta elegida en el buscador bulk
let _bulkCuentaImpV='';
function setBulkCuentaImpV(cd){_bulkCuentaImpV=cd;}

function aplicarCuentaATodosV(){
  const bulkInp=document.getElementById('impv-bulk-cd');
  const cd=_bulkCuentaImpV||(bulkInp?bulkInp.dataset.cd:'')||
    (document.getElementById('impv-bulk')&&document.getElementById('impv-bulk').value)||'';
  if(!cd){toast('⚠️ Elige una cuenta primero','e');return;}
  IMV.docs.forEach(d=>{if(d.incluir){d.cuenta=cd;delete d.errorImport;}});
  renderImportModalVentas();
}

function renderImportModalVentas(){
  const box=document.getElementById('impv-rows');
  const descuadrados=validarCuadraturaImportVentas();
  const badIdx=new Set(descuadrados.map(x=>x.idx));

  const filas=IMV.docs.map((d,i)=>{
    const pendiente=badIdx.has(i);
    const fechaBase=d.fechaOriginal||d.fecha;
    const fechaMostrar=fechaBase+(d.fechaVencimiento?`<div style="font-size:9px;color:var(--mt);margin-top:2px" title="${d.fechaVencimientoOrigen==='archivo'?'Vencimiento informado por el archivo':'Vencimiento estimado: emisión + 30 días'}">Vence ${d.fechaVencimiento}${d.fechaVencimientoOrigen==='estimado30d'?' · 30d':''}</div>`:'');
    const cambiosTxt=(d.cambiosRCV||[]).map(c=>`${c.label}: ${valorCambio(c.anterior)} → ${valorCambio(c.nuevo)}`).join(' · ');
    const estado=d.errorImport
      ? `<button type="button" class="imp-pending-mini" onclick="delete IMV.docs[${i}].errorImport;renderImportModalVentas()" title="${textoSeguroImportV(d.errorImport)} · Toca para volver a validar y reintentar">⛔ error</button>`
      :pendiente
      ? `<button type="button" class="imp-pending-mini" onclick="enfocarPendienteImportV(${i})">⚠ pendiente</button>`
      :d.estadoImport==='manual'
      ? '<span style="color:var(--info);font-size:10px" title="Este DTE ya existe en un asiento manual; el importador no lo modifica">↔ ya en asiento</span>'
      :d.estadoImport==='igual'
      ? '<span style="color:var(--mt);font-size:10px" title="Huella RCV idéntica; no se vuelve a escribir">✓ sin cambios</span>'
      :d.estadoImport==='cambio'
        ? `<span style="color:var(--warn);font-size:10px" title="${cambiosTxt.replace(/"/g,'&quot;')}">⚠️ cambio SII</span>`
        :(d.incluir?'<span style="color:var(--ach);font-size:10px">✓ nuevo</span>':'<span style="color:var(--mt);font-size:10px">omitido</span>');
    // Por defecto todas las ventas van al auxiliar de clientes (cuenta por
    // cobrar). El usuario cambia a "Banco" las que sean realmente al contado.
    if(!d.fp)d.fp='clientes';
    const fpSel=`<select onchange="IMV.docs[${i}].fp=this.value;delete IMV.docs[${i}].errorImport;renderImportModalVentas()" style="width:100%;font-size:11px;padding:3px">
      <option value="banco" ${d.fp==='banco'?'selected':''}>💵 Banco</option>
      <option value="clientes" ${d.fp==='clientes'?'selected':''}>📇 Cliente</option>
      <option value="deudores" ${d.fp==='deudores'?'selected':''}>📋 Deudor</option>
    </select>`;
    return `<div id="impv-row-${i}" class="imp-row${pendiente?' imp-pending-row':''}" style="display:grid;grid-template-columns:26px 90px 60px 80px 120px 1fr 90px 80px 80px 100px 180px 110px 80px;gap:6px;padding:6px 8px;border-bottom:1px solid var(--bd);font-size:11px;align-items:center">
      <div style="text-align:center">${(d.estadoImport==='igual'||d.estadoImport==='manual')?'':`<input type="checkbox" ${d.incluir?'checked':''} onchange="IMV.docs[${i}].incluir=this.checked;renderImportModalVentas()">`}</div>
      <div>${fechaMostrar}</div>
      <div>${d.tipoDTE}</div>
      <div>${d.numero}</div>
      <div>${rutFmt(d.rutCodigo,d.rutDV)}</div>
      <div title="${(d.razonSocial||'').replace(/"/g,'&quot;')}">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="toast('${(d.razonSocial||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;')}')">${d.razonSocial}</div>
        <input type="text" value="${(d.glosa||'').replace(/"/g,'&quot;')}" placeholder="Descripción (glosa)…" onclick="event.stopPropagation()" oninput="IMV.docs[${i}].glosa=this.value" style="width:100%;font-size:10px;margin-top:3px;padding:2px 5px;border:1px solid var(--bd);border-radius:3px;background:var(--sf);color:var(--tx)">
      </div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.neto)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.iva)}</div>
      <div style="text-align:right;font-family:var(--mono)">${fmtC(d.otrosImpuestos||0)}</div>
      <div style="text-align:right;font-family:var(--mono);font-weight:600">${fmtC(d.total)}</div>
      <div>${inputCuenta({id:`impv-cd-${i}`,value:d.cuenta||'',onPick:`IMV.docs[${i}].cuenta='%CD%';delete IMV.docs[${i}].errorImport;renderImportModalVentas()`,placeholder:'Buscar cuenta…',clase:'linea-inp',filtro:'ingreso'})}</div>
      <div>${fpSel}</div>
      <div>${estado}</div>
    </div>`;
  }).join('');

  box.innerHTML=filas;

  const nuevos=IMV.docs.filter(d=>d.estadoImport==='nuevo').length;
  const iguales=IMV.docs.filter(d=>d.estadoImport==='igual').length;
  const cambiados=IMV.docs.filter(d=>d.estadoImport==='cambio').length;
  const manuales=IMV.docs.filter(d=>d.estadoImport==='manual').length;
  const incluidos=IMV.docs.filter(d=>d.incluir).length;
  const conCuenta=IMV.docs.filter(d=>d.incluir&&d.cuenta).length;
  const listos=IMV.docs.filter((d,i)=>d.incluir&&!badIdx.has(i)).length;

  const summary=document.getElementById('impv-summary');
  if(summary){
    summary.innerHTML=`📄 <strong>${IMV.docs.length}</strong> documentos en <em>${IMV.archivo||''}</em> · <strong style="color:var(--ach)">${nuevos}</strong> nuevos · <strong style="color:var(--mt)">${iguales}</strong> sin cambios${cambiados?` · <strong style="color:var(--warn)">${cambiados}</strong> con cambios SII`:''}${manuales?` · <strong style="color:var(--info)">${manuales}</strong> ya en asiento manual`:''}${IMV.descartados?' · '+IMV.descartados+' descartados':''}${alertaCuadraturaImport(descuadrados)}`;
  }
  const info=document.getElementById('impv-periodo-info');
  if(info)info.textContent=descuadrados.length?`${listos} listos · ${descuadrados.length} pendientes por validación contable`:`${incluidos} para importar · ${conCuenta} con cuenta asignada`;
  const cnt=document.getElementById('impv-count');
  if(cnt)cnt.textContent=`${incluidos} seleccionados`;
  const btn=document.getElementById('impv-btn-ok');
  if(btn){btn.disabled=listos===0;btn.textContent=`💾 Aplicar ${listos}${descuadrados.length?` · dejar ${descuadrados.length} pendiente${descuadrados.length===1?'':'s'}`:''}`;btn.title=descuadrados.length?'Los documentos con errores contables no se guardarán: quedarán pendientes para revisión':'';}
}

async function confirmarImportacionV(){
  const perFecha=`${IMV.periodoAnio}-${String(IMV.periodoMes).padStart(2,'0')}-01`;
  if(!puedeOperarFecha(perFecha)){toast('🔒 El período seleccionado está cerrado. Reábrelo antes de importar el RCV de ventas.','e');return;}
  const seleccionados=IMV.docs.filter(d=>d.incluir);
  const descuadrados=validarCuadraturaImportVentas();
  const badIdx=new Set(descuadrados.map(x=>x.idx));
  const incluidos=IMV.docs.filter((d,i)=>d.incluir&&!badIdx.has(i));
  if(!seleccionados.length){
    toast(`✅ Importación idempotente: ${IMV.docs.filter(d=>d.estadoImport==='igual').length} documento(s) ya estaban idénticos. No se modificó el libro.`);
    cerrarImportModalVentas();return;
  }
  if(descuadrados.length){
    const detalle=descuadrados.slice(0,8).map(x=>`• DTE ${x.tipoDTE} N° ${x.numero}: ${x.motivo||`diferencia ${fmtC(x.diferencia)}`}`).join('\n');
    if(!incluidos.length){
      alert(`⚠️ No hay documentos que pasen la validación contable.\n\n${detalle}${descuadrados.length>8?'\n• …':''}\n\nLos DTE indicados quedan pendientes en el importador para revisión.`);
      renderImportModalVentas();return;
    }
    const ok=confirm(`⚠️ Se detectaron ${descuadrados.length} documento(s) que no pasan la validación contable.\n\n${detalle}${descuadrados.length>8?'\n• …':''}\n\nEstos NO se guardarán. Se procesarán ${incluidos.length} documento(s) válidos y los demás quedarán pendientes en esta ventana para corregir o revisar.\n\n¿Continuar?`);
    if(!ok){renderImportModalVentas();return;}
  }
  const enPeriodoCerrado=incluidos.filter(d=>!puedeOperarFecha(d.fechaOriginal||d.fecha));
  if(enPeriodoCerrado.length){
    toast(`🔒 ${enPeriodoCerrado.length} venta(s) tienen fecha documental en un período contable cerrado. Reabre esos períodos antes de importarlas.`,'e');
    return;
  }
  const sinCuenta=incluidos.filter(d=>!d.cuenta);
  if(sinCuenta.length){
    if(!confirm(`⚠️ Hay ${sinCuenta.length} documentos sin cuenta de ingreso asignada.\n\nSe importarán igual pero deberás asignarles cuenta después. ¿Continuar?`))return;
  }
  const cambiosSeleccionados=incluidos.filter(d=>d.estadoImport==='cambio');
  if(cambiosSeleccionados.length){
    const detalle=cambiosSeleccionados.slice(0,8).map(d=>{
      const cs=(d.cambiosRCV||[]).slice(0,4).map(c=>c.label).join(', ');
      return `• DTE ${d.tipoDTE} N°${d.numero} ${d.razonSocial||''}: ${cs||'reactivación'}`;
    }).join('\n');
    if(!confirm(`⚠️ El RCV trae ${cambiosSeleccionados.length} venta(s) con información distinta a la contabilizada.\n\n${detalle}${cambiosSeleccionados.length>8?'\n• …':''}\n\nSe conservará la versión anterior en el historial RCV. ¿Aplicar?`))return;
  }

  const anio=IMV.periodoAnio;

  // Detectar clientes nuevos
  const rutsExistentes=new Set(todosDocsVentas().map(v=>v.rutCodigo));
  const clientesNuevos=new Map();
  incluidos.forEach(d=>{
    if(!rutsExistentes.has(d.rutCodigo)&&!clientesNuevos.has(d.rutCodigo)){
      clientesNuevos.set(d.rutCodigo,{rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial});
    }
  });

  // Aviso si el año del archivo no coincide con el año activo:
  // S.ventas es el libro del año activo; guardar en otro año no se vería.
  if(anio!==S.empresa.anio){
    if(!confirm(`El archivo es de ${anio} pero el año activo es ${S.empresa.anio}.\n\nSi importas ahora, los documentos irán al libro de ${S.empresa.anio}. Para importarlos en ${anio}, cambia primero de año con el selector del encabezado.\n\n¿Continuar de todas formas?`))return;
  }

  // V2.15.4: punto de recuperación antes de una importación masiva.
  if(window.__snapshotAntesOperacion){
    const periodoTxt=`${String(IMV.periodoMes).padStart(2,'0')}-${IMV.periodoAnio}`;
    const seg=await window.__snapshotAntesOperacion(`Antes de importar RCV ventas ${periodoTxt}`);
    if(!seg?.ok){
      const seguir=confirm(`⚠️ No se pudo crear el snapshot previo (${seg?.motivo||'error'}).\n\nLa importación todavía puede continuar, pero no tendrás un punto automático de retorno inmediato.\n\n¿Continuar de todas formas?`);
      if(!seguir)return;
    }
  }

  // S.ventas es un array plano (el año lo define storage). Cada documento
  // importado debe crear también su asiento maestro V2.
  if(!Array.isArray(S.ventas))S.ventas=[];
  const snapVentas=JSON.stringify(S.ventas||[]);
  const snapAsientos=JSON.stringify(S.asientos||[]);

  let importados=0;
  const aplicados=[],pendientesError=[];
  // Reservar rango de folios de comprobante para las ventas.
  let folioNext=proxFolioComprobante();
  incluidos.forEach((d,i)=>{
    const prev=d.dup||null;
    const fecha=d.fechaOriginal||d.fecha; // fecha documental RCV: nunca se fuerza al período
    const folioCandidato=prev?.folioComp||folioNext;
    const doc={
      id:prev?.id||('v_imp_'+Date.now()+'_'+i),
      folioComp:folioCandidato,   // el existente conserva comprobante
      fecha, tipoDTE:d.tipoDTE, numero:d.numero,
      fechaVencimiento:d.fechaVencimiento||'',
      fechaVencimientoOrigen:d.fechaVencimientoOrigen||'',
      fechaRecepcionSII:d.fechaRecepcionSII||'',
      fechaAcuseSII:d.fechaAcuseSII||'',
      rutCodigo:d.rutCodigo, rutDV:d.rutDV, razonSocial:d.razonSocial,
      neto:d.neto, exento:d.exento, iva:d.iva,
      otrosImpuestos:d.otrosImpuestos||0, total:d.total,
      formaPago:prev?.formaPago||d.fp||'clientes',
      cuentaIngreso:prev?.cuentaIngreso||d.cuenta||'',
      ...((d.glosa||prev?.glosa)?{glosa:d.glosa||prev.glosa}:{}),
      estado:'activo',
      importadoEn:prev?.importadoEn||new Date().toISOString(),
      ...(prev?{reimportadoEn:new Date().toISOString()}:{}),
      rcvFingerprint:fingerprintSnapshot(snapshotVentaRCV(d)),
      rcvVersion:2,
      ...(prev?{
        versionAnterior:{fecha:prev.fecha,fechaVencimiento:prev.fechaVencimiento||'',tipoDTE:prev.tipoDTE,numero:prev.numero,neto:prev.neto,exento:prev.exento,iva:prev.iva,otrosImpuestos:prev.otrosImpuestos,total:prev.total},
        rcvHistorial:[...(Array.isArray(prev.rcvHistorial)?prev.rcvHistorial:[]),{
          fecha:new Date().toISOString(),snapshot:snapshotVentaRCV(prev),
          cambios:(d.cambiosRCV||[]).map(c=>({campo:c.campo,anterior:c.anterior,nuevo:c.nuevo}))
        }].slice(-20)
      }: {})
    };
    const idxPrev=S.ventas.findIndex(x=>x.id===doc.id);
    const docAnterior=idxPrev>=0?JSON.parse(JSON.stringify(S.ventas[idxPrev])):null;
    const asientosAntes=JSON.stringify(S.asientos||[]);
    try{
      if(idxPrev>=0)S.ventas[idxPrev]=doc;else S.ventas.push(doc);
      upsertAsientoDocumento('ventas',doc);
      if(!prev)folioNext++;
      delete d.errorImport;
      aplicados.push(d);importados++;
    }catch(err){
      if(idxPrev>=0)S.ventas[idxPrev]=docAnterior;
      else{
        const creado=S.ventas.findIndex(x=>x.id===doc.id);
        if(creado>=0)S.ventas.splice(creado,1);
      }
      S.asientos=JSON.parse(asientosAntes);
      d.errorImport=err?.message||String(err);
      d.estadoImport='pendiente_error';d.incluir=true;
      pendientesError.push(d);
    }
  });

  try{
    await persistirClavesCritico([
      {key:'ventas-'+S.empresa.anio,value:JSON.stringify(S.ventas)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos||[])},
    ]);
  }catch(err){
    S.ventas=JSON.parse(snapVentas);S.asientos=JSON.parse(snapAsientos);
    toast('❌ No se pudo completar la importación. Se revirtieron ventas y asientos.','e');return;
  }

  aplicados.filter(d=>d.estadoImport==='cambio').forEach(d=>{
    const prev=d.dup||null;
    const nuevo=prev?S.ventas.find(x=>x.id===prev.id):null;
    if(nuevo)logCambio('Actualizó venta desde RCV',{entidad:'venta',id:nuevo.id,antes:prev,despues:nuevo,meta:{numeroContable:(S.asientos||[]).find(a=>a.docId===nuevo.id&&a.fuente==='ventas')?.numeroContable,tipoDTE:nuevo.tipoDTE,folio:nuevo.numero}});
  });
  logCambio('Importó lote RCV ventas',{entidad:'lote-rcv',id:`ventas:${S.empresa.anio}:${Date.now()}`,antes:null,despues:null,meta:{archivo:IMV.archivo||'',nuevos:aplicados.filter(d=>d.estadoImport==='nuevo').length,cambios:aplicados.filter(d=>d.estadoImport==='cambio').length,conError:pendientesError.length,sinCambios:IMV.docs.filter(d=>d.estadoImport==='igual').length}});

  // Crear/completar la ficha del cliente para TODOS los documentos importados,
  // tenga o no cuenta de ingreso asignada. Si el cliente no existe, se crea la
  // ficha con los datos básicos (RUT, razón social) para editarla luego; si el
  // documento trae cuenta, se guarda como cuenta por defecto.
  const asignaciones={};  // rut → {cuenta:{cd→count}, dv, razon}
  aplicados.forEach(d=>{
    const key=d.rutCodigo;
    if(!key)return;
    if(!asignaciones[key])asignaciones[key]={cuenta:{},rutDV:d.rutDV,razonSocial:d.razonSocial};
    if(d.cuenta)asignaciones[key].cuenta[d.cuenta]=(asignaciones[key].cuenta[d.cuenta]||0)+1;
    // conservar la razón social si aún no la teníamos
    if(!asignaciones[key].razonSocial&&d.razonSocial)asignaciones[key].razonSocial=d.razonSocial;
  });
  let fichasCreadas=0, fichasActualizadas=0;
  const clientesF=fichasAux('cliente');
  Object.entries(asignaciones).forEach(([rut,a])=>{
    const cuentaTop=Object.entries(a.cuenta).sort((x,y)=>y[1]-x[1])[0]?.[0]||'';
    const ficha=clientesF[rut];
    if(!ficha){
      clientesF[rut]={
        rutCodigo:rut, rutDV:a.rutDV, razonSocial:a.razonSocial||'',
        cuentaDefault:cuentaTop, ccDefault:'',
        giro:'', direccion:'', comuna:'', ciudad:'', email:'', telefono:'', notas:'',
      };
      fichasCreadas++;
    }else{
      let cambio=false;
      if(!ficha.cuentaDefault&&cuentaTop){ficha.cuentaDefault=cuentaTop;cambio=true;}
      if(!ficha.razonSocial&&a.razonSocial){ficha.razonSocial=a.razonSocial;cambio=true;}
      if(!ficha.rutDV&&a.rutDV){ficha.rutDV=a.rutDV;cambio=true;}
      if(cambio)fichasActualizadas++;
    }
  });
  if(fichasCreadas||fichasActualizadas){
    guardarFichasAux().catch(e=>console.warn('No se pudo guardar ficha auxiliar:',e));
  }

  const pendientesCuadratura=[...new Set([...IMV.docs.filter((d,i)=>badIdx.has(i)),...pendientesError])];
  if(pendientesCuadratura.length){
    IMV.docs=pendientesCuadratura;
    IMV.docs.forEach(d=>{d.incluir=true;d.estadoImport=d.errorImport?'pendiente_error':'pendiente_cuadratura';});
    renderImportModalVentas();
  }else cerrarImportModalVentas();
  const clientesNuevosAplicados=new Set(aplicados.filter(d=>clientesNuevos.has(d.rutCodigo)).map(d=>d.rutCodigo)).size;
  const msgClientes=clientesNuevosAplicados?` · ${clientesNuevosAplicados} clientes nuevos detectados en auxiliares`:'';
  const msgFichas=(fichasCreadas||fichasActualizadas)?` · fichas: ${fichasCreadas} nuevas${fichasActualizadas?', '+fichasActualizadas+' completadas':''}`:'';
  const msgPend=pendientesCuadratura.length?` · ⚠️ ${pendientesCuadratura.length} pendiente${pendientesCuadratura.length===1?'':'s'} por validación`:'';
  const msgError=pendientesError.length?` · ⛔ ${pendientesError.length} con error aislado`:'';
  toast(`✅ ${importados} venta${importados===1?'':'s'} nueva${importados===1?'':'s'}/actualizada${importados===1?'':'s'}${msgClientes}${msgFichas}${msgPend}${msgError}`);
  logAccion('Conciliación RCV ventas',`${importados} documentos nuevos/actualizados${msgFichas}`);
  rerender();
}


export {onMesChangeV, abrirImportSIIVentas, handleFileImportVentas,
        cambiarPeriodoImportV, toggleAllImportV, aplicarCuentaATodosV, setBulkCuentaImpV,
        renderImportModalVentas, confirmarImportacionV, cerrarImportModalVentas, initImportListenerV, enfocarPendienteImportV,
        IMV, limpiarFiltrosV, renderVentas, renderVResumen, abrirVF, editarVenta, cerrarVF, vfRutInput, vfCheckDup, vfDteChanged, vfRefrescarDocs, vfSeleccionarReferencia, vfCalcTotals, vfAutoCalc, guardarVenta, setVfCuenta, eliminarVenta,
        toggleVSel, toggleVSelAll, limpiarVSel, eliminarVSel, cambiarFPVSel, validarCuadraturaImportVentas, VF};
