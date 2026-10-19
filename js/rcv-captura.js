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
import {IM, confirmarImportacion, abrirImportModal, recalcularEstadoImportCompras, abrirImportSII} from './compras.js';
import {IMV, confirmarImportacionV, abrirImportModalVentas, recalcularEstadoImportVentas, abrirImportSIIVentas} from './ventas.js';

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
  box.innerHTML=`<div class="cap-filtros">
      <input type="text" class="linea-inp" placeholder="Buscar nombre, folio o RUT…" value="${esc(CAP.q)}" oninput="setCapQ(this.value)">
      <div class="cap-tabs">
        ${[['pendientes','Por contabilizar'],['libro','En el libro'],['todos','Todos']].map(([k,l])=>`<button class="${CAP.filtro===k?'act':''}" onclick="setCapFiltro('${k}')">${l} <b>${cuenta[k]}</b></button>`).join('')}
      </div>
    </div>
    <div class="cap-filas">
      ${filas.length?filas.map(({d,i})=>`<div class="cap-fila${i===CAP.sel?' sel':''}${i===CAP.abierto?' abierta':''}${importable(d)?'':' hecha'}" onclick="capSel(${i})" ondblclick="capSel(${i});capImportar()">
          <div class="cap-f1"><span class="cap-nom" title="${esc(d.razonSocial||'')}">${esc(d.razonSocial||rutFmt(d.rutCodigo,d.rutDV))}</span>${est(d)}</div>
          <div class="cap-f2"><span>${d.tipoDTE}-${esc(d.numero)}</span><span>${esc(String(d.fechaOriginal||d.fecha||'').split('-').reverse().join('-'))}</span><span class="cap-monto">${fmtC(d.total)}</span></div>
        </div>`).join(''):'<div class="cap-vacio">Sin documentos en este filtro.</div>'}
    </div>`;
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

// ── Módulo "Importador RCV" (menú lateral, bajo Libro de Compras) ──
function tarjetaImport(tipo){
  const c=tipo==='compra'
    ?{IMx:IM,t:'Compras',ico:'🧾',cargar:"abrirImportSII()",libro:"nav('compras')",desc:'Registro de Compras del SII (archivo CSV "Detalle" o Excel).'}
    :{IMx:IMV,t:'Ventas',ico:'🛒',cargar:"abrirImportSIIVentas()",libro:"nav('ventas')",desc:'Registro de Ventas del SII (archivo CSV "Detalle" o Excel).'};
  const ds=c.IMx.docs||[];
  const pend=ds.filter(d=>!(d.capturado||d.estadoImport==='igual')).length;
  const per=c.IMx.periodoMes?`${MESES[c.IMx.periodoMes-1]} ${c.IMx.periodoAnio}`:'';
  return `<div class="card imp-card">
    <div class="card-title">${c.ico} RCV ${c.t}</div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:12px">${c.desc}</div>
    ${ds.length?`<div class="imp-estado">
        <div><b>${esc(c.IMx.archivo||'Archivo cargado')}</b>${per?` · período ${per}`:''}</div>
        <div>${ds.length} documento(s) en el registro · <b>${pend}</b> por contabilizar · ${ds.length-pend} en el libro</div>
      </div>`:'<div class="imp-estado imp-vacio">Aún no cargas un archivo en esta sesión.</div>'}
    <div class="imp-acc">
      <button class="btn btn-p" onclick="${c.cargar}">📂 ${ds.length?'Cargar otro archivo':'Cargar archivo RCV'}</button>
      ${ds.length?`<button class="btn btn-i" onclick="abrirCapturaRCV('${tipo}')">📝 Continuar paso 2</button><button class="btn btn-g" onclick="verTablaRCV('${tipo}')">▦ Vista tabla</button>`:''}
      <button class="btn btn-g" onclick="${c.libro}">📖 Ver libro</button>
    </div>
  </div>`;
}
function renderImportRCV(){
  const el=document.getElementById('importrcv-content');if(!el)return;
  el.innerHTML=`<div class="imp-grid">${tarjetaImport('compra')}${tarjetaImport('venta')}</div>
    <div class="info-tip" style="margin-top:14px;font-size:11px;line-height:1.6">
      <b>Cómo funciona:</b> 1) carga el archivo del SII; 2) en el paso 2 eliges cada documento de la lista y tocas <b>⬇ Importar</b>;
      3) si el proveedor o cliente es nuevo, creas su ficha; 4) revisas el asiento (cuenta, descripción y centro de costo) y
      tocas <b>📒 Contabilizar documento</b>: queda en el libro con su asiento.</div>`;
}

export {renderImportRCV, abrirCapturaRCV, cerrarCapturaRCV, verTablaRCV, setCapPeriodo, setCapFiltro, setCapQ, capSel, capImportar,
  capFicha, capCrearFicha, capCerrarEditor, capContabilizar, CAP};
