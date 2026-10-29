// rcv-captura.js — V2.21.76 · Paso 2 del importador RCV: captura documento por documento.
//
// Pantalla dividida:
//   · Izquierda: TODO el registro leído del SII, una fila por documento con el
//     proveedor o cliente, el folio, la fecha y el monto. Los que ya están en el
//     libro se muestran marcados.
//   · Arriba a la derecha: "Importar", que se activa al elegir una fila.
//   · Derecha: si el auxiliar no tiene ficha, primero se crea (con su cuenta y
//     centro de costo por defecto); después se abre el editor del asiento (glosa,
//     líneas con cuenta y CC, IVA y vista del asiento completo).
//   · "Contabilizar documento" genera el asiento sólo de ese documento y lo lleva
//     al libro. La cuenta y el CC usados pasan a ser los de la ficha del auxiliar.
//
// La contabilización reutiliza confirmarImportacion / confirmarImportacionV con
// un lote de un solo documento (siempre en modo "agregar"), así que valida,
// numera, persiste y audita exactamente igual que la importación clásica.

import {toast, fmtC, rutFmt, pdcNm, MESES} from './core.js';
import {S} from './state.js';
import {fichaAux, fichasAux, guardarFichasAux} from './importadoraux.js';
import {inputCuenta} from './buscadorcuentas.js';
import {ccOpts} from './centroscosto.js';
import {logAccion} from './firebase.js';
import {abrirEditorEmbebido, guardarDoc, RD} from './rcv-detalle.js';
import {IM, confirmarImportacion, abrirImportModal, recalcularEstadoImportCompras, abrirImportSII, mostrarDocsImportados} from './compras.js';
import {IMV, confirmarImportacionV, abrirImportModalVentas, recalcularEstadoImportVentas, abrirImportSIIVentas, mostrarVentasImportadas} from './ventas.js';

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n=v=>Math.round(+v||0);

const CAP={tipo:'compra',sel:null,abierto:null,panel:null,q:'',filtro:'pendientes',ficha:null};
const cfg=()=>CAP.tipo==='compra'
  ?{IMx:IM,confirmar:confirmarImportacion,tabla:abrirImportModal,recalc:recalcularEstadoImportCompras,
    fichaTipo:'proveedor',etiqueta:'proveedor',libro:()=>S.compras||[],titulo:'Compras',filtroCta:'compra'}
  :{IMx:IMV,confirmar:confirmarImportacionV,tabla:abrirImportModalVentas,recalc:recalcularEstadoImportVentas,
    fichaTipo:'cliente',etiqueta:'cliente',libro:()=>S.ventas||[],titulo:'Ventas',filtroCta:'ingreso'};
const docs=()=>cfg().IMx.docs||[];

// Documento ya registrado en el libro (mismo RUT, tipo y folio, no anulado)
function enLibro(d){
  return cfg().libro().find(x=>x.estado!=='anulado'&&x.rutCodigo===d.rutCodigo&&+x.tipoDTE===+d.tipoDTE&&String(x.numero).trim()===String(d.numero).trim())||null;
}
// 'libro' = ya contabilizado e idéntico; 'cambio' = el SII trae datos distintos; 'pendiente'
function estadoDoc(d){
  if(d.capturado||d.estadoImport==='igual')return 'libro';
  if(d.estadoImport==='cambio')return 'cambio';
  return 'pendiente';
}
const importable=d=>estadoDoc(d)!=='libro';

function asegurarModal(){
  let m=document.getElementById('cap-modal');
  if(!m){
    m=document.createElement('div');m.id='cap-modal';m.className='modal-bkd cap-modal';
    m.innerHTML=`<div class="modal-box cap-box">
      <div class="cap-top" id="cap-top"></div>
      <div class="cap-split">
        <aside class="cap-lista" id="cap-lista"></aside>
        <section class="cap-der" id="cap-der"></section>
      </div></div>`;
    document.body.appendChild(m);
  }
  return m;
}

function abrirCapturaRCV(tipo){
  CAP.tipo=tipo==='venta'?'venta':'compra';
  if(!docs().length){toast('⚠️ Primero carga el archivo del RCV','e');return;}
  CAP.sel=null;CAP.abierto=null;CAP.panel=null;CAP.ficha=null;
  // Los documentos de la vista tabla que ya traían detalle siguen disponibles
  asegurarModal().classList.add('open');
  const pend=docs().findIndex(importable);
  if(pend>=0)CAP.sel=pend;else CAP.filtro='todos';
  renderCaptura();
}
function cerrarCapturaRCV(){
  const m=document.getElementById('cap-modal');if(m)m.classList.remove('open');
  RD.embebido=false;
  renderImportRCV();   // si el módulo Importador RCV está a la vista, refleja el avance
}
function verTablaRCV(tipo){if(tipo)CAP.tipo=tipo==='venta'?'venta':'compra';cerrarCapturaRCV();cfg().tabla();}

function setCapPeriodo(){
  const c=cfg();
  c.IMx.periodoMes=+document.getElementById('cap-mes').value;
  c.IMx.periodoAnio=+document.getElementById('cap-anio').value;
  try{c.recalc();}catch(e){}
  renderCaptura();
}
function setCapFiltro(f){CAP.filtro=f;renderLista();}
function setCapQ(v){CAP.q=v;renderLista();}
function capSel(i){
  CAP.sel=i;
  renderLista();renderTop();
}

function renderCaptura(){renderTop();renderLista();renderDerecha();}

function renderTop(){
  const box=document.getElementById('cap-top');if(!box)return;
  const c=cfg(),ds=docs(),d=CAP.sel!=null?ds[CAP.sel]:null;
  const cy=new Date().getFullYear(),anios=new Set([cy-3,cy-2,cy-1,cy,cy+1,c.IMx.periodoAnio]);
  const nPend=ds.filter(importable).length;
  const puede=d&&importable(d)&&CAP.abierto!==CAP.sel;
  box.innerHTML=`<div class="cap-tit">
      <div class="modal-title">📥 RCV ${c.titulo} · paso 2: contabilizar documento por documento</div>
      <div class="modal-sub">${esc(c.IMx.archivo||'')} · ${ds.length} documento(s) en el registro · ${nPend} por contabilizar${c.IMx.descartados?` · ${c.IMx.descartados} fila(s) del archivo no se pudieron leer`:''}</div>
    </div>
    <div class="cap-acc">
      <label class="cap-per">Período
        <select id="cap-mes" onchange="setCapPeriodo()">${MESES.map((m,i)=>`<option value="${i+1}" ${i+1===+c.IMx.periodoMes?'selected':''}>${m}</option>`).join('')}</select>
        <select id="cap-anio" onchange="setCapPeriodo()">${[...anios].sort().map(y=>`<option value="${y}" ${y===+c.IMx.periodoAnio?'selected':''}>${y}</option>`).join('')}</select>
      </label>
      <button class="btn btn-g" onclick="verTablaRCV()" title="Vista tabla con asignación masiva de cuentas">▦ Vista tabla</button>
      <button class="btn btn-p" id="cap-importar" onclick="capImportar()" ${puede?'':'disabled'} title="${d&&!importable(d)?'Este documento ya está en el libro':'Abre el documento para editar su asiento'}">⬇ Importar</button>
      <button class="btn btn-g" onclick="cerrarCapturaRCV()" title="Cerrar">✕</button>
    </div>`;
}

function renderLista(){
  const box=document.getElementById('cap-lista');if(!box)return;
  const ds=docs();
  const q=CAP.q.trim().toLowerCase();
  const cuenta={pendientes:0,libro:0,todos:ds.length};
  ds.forEach(d=>{if(importable(d))cuenta.pendientes++;else cuenta.libro++;});
  const filas=ds.map((d,i)=>({d,i})).filter(({d})=>{
    if(CAP.filtro==='pendientes'&&!importable(d))return false;
    if(CAP.filtro==='libro'&&importable(d))return false;
    if(!q)return true;
    return String(d.razonSocial||'').toLowerCase().includes(q)||String(d.numero).includes(q)||String(d.rutCodigo).includes(q.replace(/[.\-]/g,''));
  }).sort((a,b)=>String(a.d.fecha||'').localeCompare(String(b.d.fecha||''))||String(a.d.razonSocial||'').localeCompare(String(b.d.razonSocial||'')));
  const est=d=>{const e=estadoDoc(d);return e==='libro'?'<span class="cap-est ok" title="Ya está en el libro">✓</span>':e==='cambio'?'<span class="cap-est cambio" title="El SII trae datos distintos a los registrados">≠</span>':'';};
  // El buscador se dibuja una sola vez: si se reconstruyera en cada tecla, el
  // input se reemplaza por uno nuevo y pierde el foco (había que volver a
  // hacer clic para escribir cada carácter). Solo se refrescan pestañas y filas.
  if(!box.querySelector('#cap-q')){
    box.innerHTML=`<div class="cap-filtros">
        <input type="text" id="cap-q" enterkeyhint="search" class="linea-inp" placeholder="Buscar nombre, folio o RUT…" autocomplete="off" value="${esc(CAP.q)}" oninput="setCapQ(this.value)">
        <div class="cap-tabs" id="cap-tabs"></div>
      </div>
      <div class="cap-filas" id="cap-filas"></div>`;
  }
  const inp=box.querySelector('#cap-q');
  if(inp&&inp.value!==CAP.q&&document.activeElement!==inp)inp.value=CAP.q;
  box.querySelector('#cap-tabs').innerHTML=[['pendientes','Por contabilizar'],['libro','En el libro'],['todos','Todos']].map(([k,l])=>`<button class="${CAP.filtro===k?'act':''}" onclick="setCapFiltro('${k}')">${l} <b>${cuenta[k]}</b></button>`).join('');
  box.querySelector('#cap-filas').innerHTML=filas.length?filas.map(({d,i})=>`<div class="cap-fila${i===CAP.sel?' sel':''}${i===CAP.abierto?' abierta':''}${importable(d)?'':' hecha'}" onclick="capSel(${i})" ondblclick="capSel(${i});capImportar()">
          <div class="cap-f1"><span class="cap-nom" title="${esc(d.razonSocial||'')}">${esc(d.razonSocial||rutFmt(d.rutCodigo,d.rutDV))}</span>${est(d)}</div>
          <div class="cap-f2"><span>${d.tipoDTE}-${esc(d.numero)}</span><span>${esc(String(d.fechaOriginal||d.fecha||'').split('-').reverse().join('-'))}</span><span class="cap-monto">${fmtC(d.total)}</span></div>
        </div>`).join(''):'<div class="cap-vacio">Sin documentos en este filtro.</div>';
}

function renderDerecha(){
  const box=document.getElementById('cap-der');if(!box)return;
  const d=CAP.abierto!=null?docs()[CAP.abierto]:null;
  if(!d){
    const sel=CAP.sel!=null?docs()[CAP.sel]:null;
    box.innerHTML=`<div class="cap-ayuda">
      <div class="ei">🧾</div>
      ${sel?(importable(sel)
        ?`<b>${esc(sel.razonSocial||'')}</b> · ${sel.tipoDTE}-${esc(sel.numero)} · ${fmtC(sel.total)}<br><br>Toca <b>⬇ Importar</b> (arriba a la derecha) para editar su asiento.`
        :`<b>${esc(sel.razonSocial||'')}</b> · ${sel.tipoDTE}-${esc(sel.numero)}<br><br>Este documento ya está contabilizado en el libro.`)
        :'Elige un documento de la lista de la izquierda.'}
    </div>`;
    return;
  }
  if(CAP.panel==='ficha'){renderFicha(box,d);return;}
  box.innerHTML='<div id="rd-body" class="cap-editor"></div>';
  abrirEditorEmbebido(CAP.tipo,CAP.abierto);
}

// ── Importar: ficha primero si el auxiliar es nuevo ──
function capImportar(){
  const d=CAP.sel!=null?docs()[CAP.sel]:null;
  if(!d)return;
  if(!importable(d)){toast('ℹ️ Ese documento ya está en el libro','e');return;}
  CAP.abierto=CAP.sel;
  const c=cfg();
  const ficha=fichaAux(c.fichaTipo,d.rutCodigo);
  if(!ficha){
    CAP.panel='ficha';
    CAP.ficha={razonSocial:d.razonSocial||'',giro:'',direccion:'',comuna:'',ciudad:'',email:'',telefono:'',
      cuentaDefault:d.cuenta||'',ccDefault:d.cc||''};
  }else{
    CAP.panel='editor';
    // Sin detalle propio, el documento parte con la cuenta y el CC de la ficha
    if(!d.detalleRCV){
      if(ficha.cuentaDefault)d.cuenta=ficha.cuentaDefault;
      if(CAP.tipo==='compra'&&ficha.ccDefault)d.cc=ficha.ccDefault;
    }
  }
  renderTop();renderLista();renderDerecha();
}

function renderFicha(box,d){
  const c=cfg(),f=CAP.ficha;
  const campo=(k,lbl,ph='')=>`<div class="grp"><label>${lbl}</label><input type="text" value="${esc(f[k])}" placeholder="${ph}" oninput="capFicha('${k}',this.value)"></div>`;
  box.innerHTML=`<div class="cap-ficha">
    <div class="rd-emb-hdr"><div class="modal-title">👤 ${c.etiqueta==='proveedor'?'Proveedor':'Cliente'} nuevo</div>
      <button class="btn btn-g" onclick="capCerrarEditor()" title="Cancelar">✕</button></div>
    <div class="info-tip" style="margin:6px 0 12px;font-size:11px">
      ${esc(d.razonSocial||'')} (${esc(rutFmt(d.rutCodigo,d.rutDV))}) no tiene ficha. Créala antes de editar el asiento:
      la cuenta y el centro de costo por defecto se usarán en este documento y en los próximos.</div>
    <div class="fg">
      <div class="grp"><label>RUT</label><input type="text" value="${esc(rutFmt(d.rutCodigo,d.rutDV))}" disabled></div>
      ${campo('razonSocial','Razón social *')}
      ${campo('giro','Giro')}
      ${campo('direccion','Dirección')}
      ${campo('comuna','Comuna')}
      ${campo('ciudad','Ciudad')}
      ${campo('email','Email')}
      ${campo('telefono','Teléfono')}
    </div>
    <div class="fg" style="margin-top:6px">
      <div class="grp"><label>Cuenta por defecto (${c.etiqueta==='proveedor'?'gasto o activo':'ingreso'}) *</label>
        ${inputCuenta({id:'cap-f-cta',value:f.cuentaDefault,onPick:"capFicha('cuentaDefault','%CD%')",placeholder:'Código o nombre…',clase:'linea-inp',filtro:c.filtroCta})}</div>
      ${CAP.tipo==='compra'?`<div class="grp"><label>Centro de costo por defecto</label><select onchange="capFicha('ccDefault',this.value)">${ccOpts(f.ccDefault||'')}</select></div>`:''}
    </div>
    <div class="modal-footer rd-pie">
      <button class="btn btn-d" onclick="capCerrarEditor()">Cancelar</button><span style="flex:1"></span>
      <button class="btn btn-p" onclick="capCrearFicha()">💾 Crear ${c.etiqueta} y editar asiento</button>
    </div></div>`;
}
function capFicha(k,v){if(CAP.ficha)CAP.ficha[k]=v;}
async function capCrearFicha(){
  const d=docs()[CAP.abierto];if(!d||!CAP.ficha)return;
  const c=cfg(),f=CAP.ficha;
  if(!String(f.razonSocial||'').trim()){toast('⚠️ Ingresa la razón social','e');return;}
  if(!f.cuentaDefault){toast('⚠️ Elige la cuenta por defecto','e');return;}
  fichasAux(c.fichaTipo)[d.rutCodigo]={rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:String(f.razonSocial).trim(),
    giro:f.giro||'',direccion:f.direccion||'',comuna:f.comuna||'',ciudad:f.ciudad||'',email:f.email||'',telefono:f.telefono||'',notas:'',
    cuentaDefault:f.cuentaDefault,ccDefault:CAP.tipo==='compra'?(f.ccDefault||''):''};
  await guardarFichasAux();
  try{logAccion('Creó ficha desde RCV',`${c.etiqueta} ${rutFmt(d.rutCodigo,d.rutDV)} ${f.razonSocial}`);}catch(e){}
  d.cuenta=f.cuentaDefault;if(CAP.tipo==='compra')d.cc=f.ccDefault||'';
  delete d.detalleRCV;
  toast(`✅ Ficha de ${c.etiqueta} creada`);
  CAP.ficha=null;CAP.panel='editor';
  renderDerecha();
}
function capCerrarEditor(){
  CAP.abierto=null;CAP.panel=null;CAP.ficha=null;RD.embebido=false;
  renderTop();renderLista();renderDerecha();
}

// ── Contabilizar un documento ──
async function capContabilizar(){
  const idx=CAP.abierto;const d=docs()[idx];if(!d)return;
  if(!guardarDoc())return;   // valida y deja el detalle en el documento
  const c=cfg(),IMx=c.IMx;
  // La cuenta y el CC del asiento pasan a ser los de la ficha
  const base=(d.detalleRCV?.lineas||[]).find(l=>!l.otroImp)||d.detalleRCV?.lineas?.[0];
  const ficha=fichaAux(c.fichaTipo,d.rutCodigo);
  if(base&&ficha){
    ficha.cuentaDefault=base.cuenta;
    if(CAP.tipo==='compra')ficha.ccDefault=base.cc||'';
    await guardarFichasAux();
  }
  // Lote de un solo documento, siempre agregando (nunca sobrescribe el período)
  const lista=IMx.docs.slice(),inc=lista.map(x=>x.incluir),modo=IMx.modo;
  lista.forEach((x,i)=>{x.incluir=i===idx;});
  if(CAP.tipo==='compra')IMx.modo='agregar';
  const t0=new Date(Date.now()-1000).toISOString();
  try{await c.confirmar();}
  catch(e){toast('❌ '+(e.message||e),'e');}
  finally{
    IMx.docs=lista;IMx.modo=modo;
    lista.forEach((x,i)=>{if(i!==idx)x.incluir=inc[i];});
    // confirmarImportacion cierra su propia ventana: la captura sigue abierta
    asegurarModal().classList.add('open');
  }
  const reg=enLibro(d);
  const ok=reg&&!d.errorImport&&((reg.reimportadoEn||'')>=t0||(reg.importadoEn||'')>=t0);
  if(!ok){
    d.incluir=false;
    toast(d.errorImport?`⛔ No se contabilizó: ${d.errorImport}`:'⚠️ El documento no se contabilizó. Revisa el mensaje anterior.','e');
    renderCaptura();return;
  }
  d.dup=reg;d.capturado=true;d.estadoImport='igual';d.incluir=false;
  RD.embebido=false;
  CAP.abierto=null;CAP.panel=null;
  // Siguiente pendiente
  const sig=docs().findIndex((x,i)=>i>idx&&importable(x));
  const otro=sig>=0?sig:docs().findIndex(importable);
  CAP.sel=otro>=0?otro:idx;
  toast(`✅ ${d.tipoDTE}-${d.numero} contabilizado y llevado al libro${otro>=0?'':' · no quedan documentos por contabilizar'}`);
  renderCaptura();
}

// ── Cargas RCV guardadas (V2.21.81) ──
// Cada archivo cargado se guarda por tipo y período (`rcv-compra-2026-06`) tal como
// lo leyó el lector del SII, más un índice por año (`rcv-cargas-2026`). Así el
// Importador RCV lista los meses cargados antes y permite retomar el paso 2.
// Lo pendiente se calcula siempre contra el libro, no se guarda.
const periodoDe=docs=>{const c={};(docs||[]).forEach(d=>{const p=String(d.fecha||'').slice(0,7);if(p)c[p]=(c[p]||0)+1;});return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';};
async function leerJSON(key){try{const r=await window.storage.get(key);return r&&r.value?JSON.parse(r.value):null;}catch(e){return null;}}
async function guardarCargaRCV(tipo,res,archivo){
  const docs=res&&res.docs||[];if(!docs.length)return;
  const periodo=periodoDe(docs);if(!periodo)return;
  const cuerpo=JSON.stringify({tipo,periodo,archivo:archivo||'',cargadoEn:new Date().toISOString(),descartados:res.descartados||0,docs});
  const anio=periodo.slice(0,4);
  await window.storage.set(`rcv-${tipo}-${periodo}`,cuerpo);
  const idx=(await leerJSON(`rcv-cargas-${anio}`))||{};
  idx[`${tipo}:${periodo}`]={tipo,periodo,archivo:archivo||'',cargadoEn:new Date().toISOString(),n:docs.length};
  await window.storage.set(`rcv-cargas-${anio}`,JSON.stringify(idx));
  RCVH.idx=null;
}
const RCVH={anio:null,idx:null,cache:{},cargando:false};
const prefRCV=()=>{try{return window.storage.getPrefijo?.()||'';}catch(e){return '';}};
// El índice se relee en cada visita (una sola lectura); el contenido de cada mes
// se guarda en memoria por empresa + carga, así no se relee si no cambió.
async function cargarIndiceRCV(){
  const anio=String(S.empresa.anio||'');
  RCVH.anio=anio;RCVH.idx=(await leerJSON(`rcv-cargas-${anio}`))||{};
  return RCVH.idx;
}
async function docsCarga(tipo,periodo,cargadoEn){
  const k=`${prefRCV()}|${tipo}:${periodo}|${cargadoEn||''}`;
  if(!RCVH.cache[k])RCVH.cache[k]=await leerJSON(`rcv-${tipo}-${periodo}`);
  return RCVH.cache[k];
}
function pendientesCarga(tipo,docs){
  const libro=tipo==='compra'?(S.compras||[]):(S.ventas||[]);
  const claves=new Set(libro.filter(x=>x.estado!=='anulado').map(x=>`${x.rutCodigo}|${+x.tipoDTE}|${String(x.numero).trim()}`));
  return (docs||[]).filter(d=>!claves.has(`${d.rutCodigo}|${+d.tipoDTE}|${String(d.numero).trim()}`)).length;
}
async function abrirCargaRCV(tipo,periodo){
  const e=(RCVH.idx||{})[`${tipo}:${periodo}`];
  const c=await docsCarga(tipo,periodo,e&&e.cargadoEn);
  if(!c||!Array.isArray(c.docs)||!c.docs.length){toast('⚠️ No se encontró ese registro guardado. Vuelve a cargar el archivo.','e');return;}
  const res={docs:JSON.parse(JSON.stringify(c.docs)),descartados:c.descartados||0};
  if(tipo==='compra')mostrarDocsImportados(res,c.archivo);else mostrarVentasImportadas(res,c.archivo);
}

// ── Módulo "Importador RCV" (menú lateral, bajo Libro de Compras) ──
function tarjetaImport(tipo,filas){
  const c=tipo==='compra'
    ?{t:'Compras',ico:'🧾',cargar:"abrirImportSII()",libro:"nav('compras')"}
    :{t:'Ventas',ico:'🛒',cargar:"abrirImportSIIVentas()",libro:"nav('ventas')"};
  const tot=filas.reduce((s,f)=>s+f.pend,0);
  const fecha=iso=>{try{return new Date(iso).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return '';}};
  const tabla=filas.length?`<div class="tw"><table class="imp-tabla">
      <thead><tr><th class="tl">MES</th><th class="tl">ARCHIVO</th><th class="tl">CARGADO</th><th>DOCUMENTOS</th><th>EN EL LIBRO</th><th>POR CONTABILIZAR</th><th></th></tr></thead>
      <tbody>${filas.map(f=>`<tr class="fila-link" onclick="abrirCargaRCV('${tipo}','${f.periodo}')" title="Abrir el paso 2 de ${MESES[+f.periodo.slice(5,7)-1]}">
        <td class="tl"><a href="#" onclick="return false">${MESES[+f.periodo.slice(5,7)-1]} ${f.periodo.slice(0,4)}</a></td>
        <td class="tl imp-arch" title="${esc(f.archivo)}">${esc(f.archivo)}</td>
        <td class="tl">${fecha(f.cargadoEn)}</td>
        <td>${f.n}</td><td>${f.n-f.pend}</td>
        <td>${f.pend?`<span class="imp-pend">${f.pend}</span>`:'<span class="imp-ok">✓ completo</span>'}</td>
        <td>${f.pend?'<span class="imp-ir">Continuar ›</span>':'<span class="imp-ir">Ver ›</span>'}</td></tr>`).join('')}</tbody>
    </table></div>`:'<div class="imp-estado imp-vacio">No hay registros cargados para este ejercicio.</div>';
  return `<div class="card imp-card">
    <div class="imp-cab"><div class="card-title" style="margin:0">${c.ico} RCV ${c.t}</div>
      ${filas.length?`<span class="${tot?'imp-pend':'imp-ok'}">${tot?`${tot} por contabilizar`:'Todo contabilizado'}</span>`:''}</div>
    ${tabla}
    <div class="imp-acc" style="margin-top:12px">
      <button class="btn btn-p" onclick="${c.cargar}">📂 Cargar archivo RCV</button>
      <button class="btn btn-g" onclick="${c.libro}">📖 Ver libro</button>
    </div>
  </div>`;
}
async function renderImportRCV(){
  const el=document.getElementById('importrcv-content');if(!el)return;
  if(!el.innerHTML)el.innerHTML='<div class="imp-estado imp-vacio">Cargando registros…</div>';
  const idx=await cargarIndiceRCV();
  const filas={compra:[],venta:[]};
  for(const e of Object.values(idx).sort((a,b)=>String(a.periodo).localeCompare(String(b.periodo)))){
    if(!filas[e.tipo])continue;
    const c=await docsCarga(e.tipo,e.periodo,e.cargadoEn);
    const docs=c&&c.docs||[];
    filas[e.tipo].push({...e,n:docs.length||e.n||0,pend:pendientesCarga(e.tipo,docs)});
  }
  el.innerHTML=`<div class="imp-grid">${tarjetaImport('compra',filas.compra)}${tarjetaImport('venta',filas.venta)}</div>
    <div class="info-tip" style="margin-top:14px;font-size:11px;line-height:1.6">
      Toca un mes para abrir su paso 2 y seguir contabilizando. Cada archivo que cargas queda guardado por mes; si vuelves
      a cargar el mismo mes, reemplaza al anterior. <b>Por contabilizar</b> se calcula contra el libro, así que se actualiza solo.</div>`;
}

export {guardarCargaRCV, abrirCargaRCV, renderImportRCV, abrirCapturaRCV, cerrarCapturaRCV, verTablaRCV, setCapPeriodo, setCapFiltro, setCapQ, capSel, capImportar,
  capFicha, capCrearFicha, capCerrarEditor, capContabilizar, CAP};
