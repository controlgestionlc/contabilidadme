// inventario.js — Auxiliar multiempresa de existencias.
// Maestros, carga Excel, lotes, movimientos, traspasos, tomas y stock PPP derivado.

import {S,AUTH} from './state.js';
import {toast,PDC,CUENTAS_GASTO,pdcNm,pn} from './core.js';
import {inputAux} from './buscadorcuentas.js';
import {inputProductoInv} from './buscadorproductos.js';
import {puedeEditar} from './auth.js';
import {logCambio} from './firebase.js';
import {recalcularInventario,validarMovimiento,rebasarLineaToma} from './inventario-motor.js';
import {prepararImportacionProductos} from './inventario-importador.js';
import {calcularTotalesOC,resumenRecepcionOC,validarOrdenCompra,validarRecepcion,estadoSegunRecepciones} from './inventario-oc-motor.js';
import {buscarCompraParaRecepcion,otrasRecepcionesMismoDocumento,comprasVinculables} from './conciliacion-compras-motor.js';

const K={
  grupos:'inv-grupos',bodegas:'inv-bodegas',productos:'inv-productos',
  movimientos:'inv-movimientos',tomas:'inv-tomas',ordenesCompra:'inv-ordenes-compra',recepciones:'inv-recepciones'
};
const UI={tab:'stock',q:'',bodega:'',estado:'',cargando:false,errorCarga:'',tomaId:'',ocId:''};
let movDraft=null;
let productosImportDraft=null;
let ocDraft=null,recDraft=null;
const uid=()=>globalThis.crypto?.randomUUID?.()||('inv-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(+v)?+v:0;
const fmt=v=>num(v).toLocaleString('es-CL',{maximumFractionDigits:2});
const mon=v=>'$ '+Math.round(num(v)).toLocaleString('es-CL');
const hoy=()=>new Date().toISOString().slice(0,10);
const writable=()=>puedeEditar('inventario');
const inv=()=>S.inventario;
const prod=id=>inv().productos.find(x=>String(x.id)===String(id));
const bod=id=>inv().bodegas.find(x=>String(x.id)===String(id));
const grupo=id=>inv().grupos.find(x=>String(x.id)===String(id));

async function cargarInventario(force=false){
  if(inv().cargado&&!force)return inv();
  UI.cargando=true;UI.errorCarga='';
  const fallidas=[];
  for(const [prop,key] of Object.entries(K)){
    try{
      const r=await window.storage.leerConEstado(key);
      if(r.fuente==='error'){fallidas.push(key);continue;}
      const x=r.value==null?[]:JSON.parse(r.value);
      inv()[prop]=Array.isArray(x)?x:[];
    }catch(e){fallidas.push(key);console.error('Inventario cargar',key,e);}
  }
  inv().cargado=fallidas.length===0;UI.cargando=false;
  if(fallidas.length){UI.errorCarga='No se pudo cargar completamente el inventario. La edición permanece bloqueada para proteger los datos.';toast('🚫 '+UI.errorCarga,'e');}
  return inv();
}

async function guardarLista(prop){
  const key=K[prop];
  if(!key)throw new Error('Colección de inventario inválida');
  const r=await window.storage.set(key,JSON.stringify(inv()[prop]||[]));
  if(!r||r.ok===false)throw new Error(r?.detalle||r?.motivo||`No se pudo guardar ${key}`);
  if(r.fusionado&&typeof r.value==='string'){
    const definitivo=JSON.parse(r.value);
    if(Array.isArray(definitivo))inv()[prop]=definitivo;
  }
  return true;
}

function calculo(){return recalcularInventario(inv().movimientos,inv().productos);}
function nombreProducto(id){const p=prod(id);return p?`${p.codigo} · ${p.descripcion}`:id;}
function nombreBodega(id){return bod(id)?.nombre||id||'—';}
function fechaCorta(s){if(!s)return '—';const [y,m,d]=String(s).slice(0,10).split('-');return y&&m&&d?`${d}-${m}-${y}`:s;}
function opcionesBodega(sel='',todos=false){return `${todos?'<option value="">Todas las bodegas</option>':'<option value="">Seleccione…</option>'}`+inv().bodegas.filter(b=>b.activo!==false).map(b=>`<option value="${esc(b.id)}" ${String(sel)===String(b.id)?'selected':''}>${esc(b.codigo)} · ${esc(b.nombre)}</option>`).join('');}
function opcionesProducto(sel=''){return '<option value="">Seleccione producto…</option>'+inv().productos.filter(p=>p.activo!==false&&p.inventariable!==false).map(p=>`<option value="${esc(p.id)}" ${String(sel)===String(p.id)?'selected':''}>${esc(p.codigo)} · ${esc(p.descripcion)}</option>`).join('');}
function cuentaEsGasto(cd){return CUENTAS_GASTO.some(c=>String(c.cd)===String(cd));}
const CUENTA_INVENTARIO_FIJA='1109007'; // Única cuenta permitida para inventario en todos los productos.

function renderInventario(){
  const c=document.getElementById('s-inventario');if(!c)return;
  if(UI.cargando){c.innerHTML='<div class="empty"><div class="ei">⏳</div>Cargando inventario…</div>';return;}
  if(UI.errorCarga){c.innerHTML=`<div class="inv-alert error"><strong>Inventario no disponible.</strong> ${esc(UI.errorCarga)}</div>`;return;}
  if(!inv().cargado){cargarInventario().then(renderInventario);return;}
  const calc=calculo();
  const unidades=calc.stock.reduce((s,x)=>s+Math.max(0,num(x.cantidad)),0);
  const valor=calc.stock.reduce((s,x)=>s+Math.max(0,num(x.valor)),0);
  const alertas=calc.stock.filter(s=>{const p=prod(s.productoId);return p&&num(p.stockMinimo)>0&&s.cantidad<p.stockMinimo;}).length;
  c.innerHTML=`
    <div class="sec-hdr"><div><div class="sec-title">Inventario</div><div class="sec-sub">Auxiliar permanente por empresa · multibodega · lotes · costo promedio ponderado</div></div>
      <div class="inv-actions">${writable()?'<button class="btn btn-p" onclick="invNuevoMovimiento()">＋ Movimiento</button>':''}</div></div>
    <div class="inv-kpis">
      <div><small>Productos activos</small><strong>${inv().productos.filter(p=>p.activo!==false).length}</strong></div>
      <div><small>Bodegas activas</small><strong>${inv().bodegas.filter(b=>b.activo!==false).length}</strong></div>
      <div><small>Unidades en stock</small><strong>${fmt(unidades)}</strong></div>
      <div><small>Valor inventario</small><strong>${mon(valor)}</strong></div>
      <div class="${alertas?'warn':''}"><small>Bajo mínimo</small><strong>${alertas}</strong></div>
    </div>
    ${calc.errores.length?`<div class="inv-alert error"><strong>⚠ ${calc.errores.length} inconsistencia(s) en el libro.</strong> No se ocultan los saldos negativos. Revisa los movimientos señalados.</div>`:''}
    <div class="inv-tabs">
      ${[['stock','Existencias'],['movimientos','Movimientos'],['tomas','Tomas físicas'],['oc','Órdenes de compra'],['productos','Productos'],['bodegas','Bodegas'],['grupos','Grupos y subgrupos']].map(([id,l])=>`<button class="${UI.tab===id?'active':''}" onclick="invSetTab('${id}')">${l}</button>`).join('')}
    </div>
    <div id="inv-tab-body"></div>`;
  renderTab(calc);
}

function renderTab(calc=calculo()){
  const c=document.getElementById('inv-tab-body');if(!c)return;
  if(UI.tab==='stock')renderStock(c,calc);
  else if(UI.tab==='movimientos')renderMovimientos(c,calc);
  else if(UI.tab==='tomas')renderTomas(c,calc);
  else if(UI.tab==='oc')renderOrdenesCompra(c);
  else if(UI.tab==='productos')renderProductos(c);
  else if(UI.tab==='bodegas')renderBodegas(c);
  else renderGrupos(c);
}
function invSetTab(tab){UI.tab=tab;UI.q='';UI.bodega='';UI.estado='';UI.tomaId='';UI.ocId='';renderInventario();}
function invSetFiltro(campo,valor){UI[campo]=valor;renderTab();}

function renderStock(c,calc){
  let rows=calc.stock.filter(s=>Math.abs(num(s.cantidad))>1e-6||Math.abs(num(s.valor))>1e-6);
  if(UI.bodega)rows=rows.filter(s=>String(s.bodegaId)===String(UI.bodega));
  if(UI.q){const q=UI.q.toLowerCase();rows=rows.filter(s=>nombreProducto(s.productoId).toLowerCase().includes(q)||nombreBodega(s.bodegaId).toLowerCase().includes(q));}
  const total=rows.reduce((s,x)=>s+num(x.valor),0);
  c.innerHTML=`<div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Buscar producto…"><select onchange="invSetFiltro('bodega',this.value)">${opcionesBodega(UI.bodega,true)}</select></div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Código</th><th>Producto</th><th>Grupo / subgrupo</th><th>Bodega</th><th class="num">Cantidad</th><th>U.M.</th><th class="num">PPP</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>
  ${rows.length?rows.map(s=>{const p=prod(s.productoId),min=num(p?.stockMinimo),low=min>0&&s.cantidad<min;return `<tr class="${s.cantidad<0?'inv-negativo':''}"><td class="mono">${esc(p?.codigo||'')}</td><td><strong>${esc(p?.descripcion||s.productoId)}</strong>${p?.manejaLotes?'<span class="inv-mini">LOTES</span>':''}</td><td>${esc(grupo(p?.grupoId)?.nombre||'—')}<small>${esc(p?.subgrupo||'')}</small></td><td>${esc(nombreBodega(s.bodegaId))}</td><td class="num"><strong>${fmt(s.cantidad)}</strong></td><td>${esc(p?.unidad||'')}</td><td class="num">${mon(s.costoPromedio)}</td><td class="num"><strong>${mon(s.valor)}</strong></td><td>${s.cantidad<0?'<span class="badge inv-bad">NEGATIVO</span>':low?'<span class="badge inv-warn">BAJO MÍNIMO</span>':'<span class="badge inv-ok">OK</span>'}</td></tr>`;}).join(''):'<tr><td colspan="9" class="empty">No hay existencias para mostrar.</td></tr>'}
  </tbody><tfoot><tr><td colspan="7">VALOR FILTRADO</td><td class="num"><strong>${mon(total)}</strong></td><td></td></tr></tfoot></table></div></div>
  ${renderLotes(calc)}`;
}
function renderLotes(calc){
  let rows=calc.lotes.filter(l=>Math.abs(num(l.cantidad))>1e-6);
  if(UI.bodega)rows=rows.filter(l=>String(l.bodegaId)===String(UI.bodega));
  if(!rows.length)return '';
  return `<div class="card-np"><div class="inv-card-title">Trazabilidad por lote</div><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vencimiento</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Valor</th></tr></thead><tbody>${rows.map(l=>{const dias=l.fechaVencimiento?Math.ceil((new Date(l.fechaVencimiento+'T12:00:00')-new Date())/86400000):null;return `<tr><td>${esc(nombreProducto(l.productoId))}</td><td>${esc(nombreBodega(l.bodegaId))}</td><td class="mono"><strong>${esc(l.lote)}</strong></td><td>${fechaCorta(l.fechaVencimiento)} ${dias!==null&&dias<=60?`<span class="badge ${dias<0?'inv-bad':'inv-warn'}">${dias<0?'Vencido':dias+' días'}</span>`:''}</td><td class="num">${fmt(l.cantidad)}</td><td class="num">${mon(l.costoPromedio)}</td><td class="num">${mon(l.valor)}</td></tr>`;}).join('')}</tbody></table></div></div>`;
}

function renderProductos(c){
  let rows=inv().productos.slice().sort((a,b)=>(a.codigo||'').localeCompare(b.codigo||''));
  if(UI.q){const q=UI.q.toLowerCase();rows=rows.filter(p=>(`${p.codigo} ${p.ean||''} ${p.descripcion} ${p.subgrupo||''}`).toLowerCase().includes(q));}
  c.innerHTML=`<div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Código, EAN o descripción…">${writable()?'<div class="inv-toolbar-actions"><button class="btn btn-g" onclick="invDescargarPlantillaProductos()">📄 Plantilla Excel</button><button class="btn btn-g" onclick="invAbrirImportProductos()">⬆ Importar Excel</button><button class="btn btn-p" onclick="invAbrirProducto()">＋ Producto</button></div>':''}</div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Código</th><th>EAN</th><th>Descripción</th><th>Tipo</th><th>Grupo / subgrupo</th><th>U.M.</th><th class="num">Mínimo</th><th>Lotes</th><th>Estado</th><th></th></tr></thead><tbody>${rows.length?rows.map(p=>`<tr><td class="mono"><strong>${esc(p.codigo)}</strong></td><td class="mono">${esc(p.ean||'—')}</td><td>${esc(p.descripcion)}</td><td>${esc(p.tipo||'MERCADERÍA')}</td><td>${esc(grupo(p.grupoId)?.nombre||'—')}<small>${esc(p.subgrupo||'')}</small></td><td>${esc(p.unidad)}</td><td class="num">${fmt(p.stockMinimo)}</td><td>${p.manejaLotes?'Sí':'No'}</td><td><span class="badge ${p.activo===false?'inv-muted':'inv-ok'}">${p.activo===false?'INACTIVO':'ACTIVO'}</span></td><td>${writable()?`<button class="btn btn-g" onclick="invAbrirProducto('${p.id}')">Editar</button>`:''}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">Aún no hay productos.</td></tr>'}</tbody></table></div></div>`;
}

function renderBodegas(c){
  c.innerHTML=`${writable()?'<div class="inv-right"><button class="btn btn-p" onclick="invAbrirBodega()">＋ Bodega</button></div>':''}<div class="inv-grid">${inv().bodegas.length?inv().bodegas.map(b=>`<div class="card inv-master-card"><div><span class="mono">${esc(b.codigo)}</span><h3>${esc(b.nombre)}</h3><p>${esc(b.direccion||'Sin dirección registrada')}</p><span class="badge ${b.activo===false?'inv-muted':'inv-ok'}">${b.activo===false?'INACTIVA':'ACTIVA'}</span></div>${writable()?`<button class="btn btn-g" onclick="invAbrirBodega('${b.id}')">Editar</button>`:''}</div>`).join(''):'<div class="empty">Crea la primera bodega para comenzar a registrar inventario.</div>'}</div>`;
}
function renderGrupos(c){
  c.innerHTML=`${writable()?'<div class="inv-right"><button class="btn btn-p" onclick="invAbrirGrupo()">＋ Grupo</button></div>':''}<div class="inv-grid">${inv().grupos.length?inv().grupos.map(g=>`<div class="card inv-master-card"><div><h3>${esc(g.nombre)}</h3><div class="inv-chips">${(g.subgrupos||[]).length?g.subgrupos.map(s=>`<span>${esc(s)}</span>`).join(''):'<em>Sin subgrupos</em>'}</div></div>${writable()?`<button class="btn btn-g" onclick="invAbrirGrupo('${g.id}')">Editar</button>`:''}</div>`).join(''):'<div class="empty">Crea grupos para clasificar los productos.</div>'}</div>`;
}

function renderMovimientos(c,calc){
  let rows=inv().movimientos.slice().sort((a,b)=>(String(b.fecha)+String(b.creado)).localeCompare(String(a.fecha)+String(a.creado)));
  if(UI.estado)rows=rows.filter(m=>m.estado===UI.estado);
  if(UI.q){const q=UI.q.toLowerCase();rows=rows.filter(m=>(`${m.folio} ${m.motivo||''} ${m.documento||''} ${m.tercero||''}`).toLowerCase().includes(q));}
  c.innerHTML=`<div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Folio, documento, motivo o tercero…"><select onchange="invSetFiltro('estado',this.value)"><option value="">Todos los estados</option><option value="VIGENTE" ${UI.estado==='VIGENTE'?'selected':''}>Vigentes</option><option value="ANULADO" ${UI.estado==='ANULADO'?'selected':''}>Anulados</option></select>${writable()?'<button class="btn btn-p" onclick="invNuevoMovimiento()">＋ Movimiento</button>':''}</div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Folio</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Origen</th><th>Destino</th><th>Documento</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>${rows.length?rows.map(m=>{const vals=calc.valorizaciones.get(String(m.id))||[],v=vals.reduce((s,l)=>s+num(l.valorAplicado),0);return `<tr class="${m.estado==='ANULADO'?'inv-anulado':''}"><td class="mono"><strong>${esc(m.folio)}</strong></td><td>${fechaCorta(m.fecha)}</td><td><span class="badge inv-type-${m.tipo.toLowerCase()}">${esc(m.tipo.replace('_',' '))}</span></td><td>${esc(m.motivo||'—')}</td><td>${esc(nombreBodega(m.bodegaOrigenId))}</td><td>${esc(nombreBodega(m.bodegaDestinoId))}</td><td>${esc(m.documento||'—')}</td><td class="num">${mon(v)}</td><td>${m.estado==='ANULADO'?'<span class="badge inv-bad">ANULADO</span>':'<span class="badge inv-ok">VIGENTE</span>'}</td><td><button class="btn btn-g" onclick="invVerMovimiento('${m.id}')">Ver</button>${writable()&&m.estado!=='ANULADO'&&!m.recepcionId&&!m.tomaId?` <button class="btn btn-i" onclick="invEditarMovimiento('${m.id}')" title="Editar">✏️</button>`:''}</td></tr>`;}).join(''):'<tr><td colspan="10" class="empty">Aún no hay movimientos.</td></tr>'}</tbody></table></div></div>`;
}

const TOMA_ESTADOS={EN_PROCESO:'En proceso',DEVUELTA:'Devuelta',PENDIENTE_AUTORIZACION:'Pendiente de autorización',RECHAZADA:'Rechazada',APLICADA:'Aplicada'};
async function leerListaActual(prop){
  const r=await window.storage.leerConEstado(K[prop]);
  if(r.fuente==='error')throw new Error(`No fue posible verificar ${K[prop]} en la nube`);
  const lista=r.value==null?[]:JSON.parse(r.value);
  if(!Array.isArray(lista))throw new Error(`Contenido inválido en ${K[prop]}`);
  inv()[prop]=lista;return lista;
}
async function mutarTomaSegura(id,version,mutador){
  const actuales=await leerListaActual('tomas'),idx=actuales.findIndex(x=>x.id===id);
  if(idx<0)throw new Error('La toma ya no existe');
  if(num(actuales[idx].version)!==num(version))throw new Error('La toma cambió en otro equipo. Se recargó la versión más reciente. Revisa antes de continuar.');
  const respaldo=JSON.parse(JSON.stringify(actuales));
  const siguiente=JSON.parse(JSON.stringify(actuales[idx]));mutador(siguiente);siguiente.version=num(siguiente.version)+1;siguiente.modificado=new Date().toISOString();
  actuales[idx]=siguiente;inv().tomas=actuales;
  try{await guardarLista('tomas');return inv().tomas.find(x=>x.id===id)||siguiente;}catch(e){inv().tomas=respaldo;throw e;}
}

function renderTomas(c,calc){
  if(UI.tomaId){const t=inv().tomas.find(x=>x.id===UI.tomaId);if(t){renderTomaDetalle(c,t,calc);return;}UI.tomaId='';}
  let rows=inv().tomas.slice().sort((a,b)=>String(b.creado||'').localeCompare(String(a.creado||'')));
  if(UI.estado)rows=rows.filter(t=>t.estado===UI.estado);
  if(UI.bodega)rows=rows.filter(t=>t.bodegaId===UI.bodega);
  if(UI.q){const q=UI.q.toLowerCase();rows=rows.filter(t=>(`${t.folio} ${t.observaciones||''} ${t.creadoPor||''}`).toLowerCase().includes(q));}
  c.innerHTML=`<div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Folio, observación o usuario…"><select onchange="invSetFiltro('estado',this.value)"><option value="">Todos los estados</option>${Object.entries(TOMA_ESTADOS).map(([k,v])=>`<option value="${k}" ${UI.estado===k?'selected':''}>${v}</option>`).join('')}</select><select onchange="invSetFiltro('bodega',this.value)">${opcionesBodega(UI.bodega,true)}</select>${writable()?'<button class="btn btn-p" onclick="invNuevaToma()">＋ Iniciar toma</button>':''}</div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Folio</th><th>Inicio</th><th>Bodega</th><th>Estado</th><th class="num">Líneas</th><th class="num">Contadas</th><th class="num">Diferencias</th><th>Usuario</th><th></th></tr></thead><tbody>${rows.length?rows.map(t=>{const cont=(t.lineas||[]).filter(l=>l.contado).length,dif=(t.lineas||[]).filter(l=>l.contado&&Math.abs(rebasarLineaToma(l,t,inv().movimientos,calc).diferencia)>1e-6).length;return `<tr><td class="mono"><strong>${esc(t.folio)}</strong></td><td>${fechaCorta(t.creado)}</td><td>${esc(nombreBodega(t.bodegaId))}</td><td><span class="badge inv-toma-${String(t.estado).toLowerCase()}">${esc(TOMA_ESTADOS[t.estado]||t.estado)}</span></td><td class="num">${(t.lineas||[]).length}</td><td class="num">${cont}</td><td class="num">${dif}</td><td>${esc(t.creadoPor||'—')}</td><td><button class="btn btn-g" onclick="invAbrirToma('${t.id}')">${['EN_PROCESO','DEVUELTA'].includes(t.estado)&&writable()?'Continuar':'Ver'}</button></td></tr>`;}).join(''):'<tr><td colspan="9" class="empty">Aún no hay tomas físicas.</td></tr>'}</tbody></table></div></div>`;
}

function invNuevaToma(){
  if(!writable())return;if(!inv().bodegas.some(b=>b.activo!==false)){toast('Primero crea una bodega activa','e');return;}
  modal(`${modalHdr('Iniciar toma física','Se congela una referencia inicial, pero la autorización rebasa automáticamente los movimientos posteriores a cada conteo')}
    <div class="inv-alert"><strong>Conteo seguro:</strong> no es necesario bloquear la bodega. Si hay entradas, salidas o traspasos durante la toma, el sistema los incorpora al calcular el ajuste final.</div>
    <div class="inv-form-grid"><label>Bodega<select id="it-bod">${opcionesBodega()}</select></label><label>Alcance<select id="it-alc"><option value="CON_STOCK">Productos/lotes con stock</option><option value="TODOS">Todos los productos sin lote y lotes existentes</option></select></label><label>Grupo<select id="it-grupo"><option value="">Todos los grupos</option>${inv().grupos.map(g=>`<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select></label><label>Observaciones<input id="it-obs" placeholder="Cierre mensual, conteo cíclico…"></label></div>
    <div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invCrearToma()">Iniciar</button></div>`);
}
async function invCrearToma(){
  if(!writable())return;const bodegaId=document.getElementById('it-bod').value,alcance=document.getElementById('it-alc').value,grupoId=document.getElementById('it-grupo').value;
  if(!bodegaId){toast('Selecciona una bodega','e');return;}
  try{await leerListaActual('tomas');}catch(e){toast('❌ '+e.message,'e');return;}
  if(inv().tomas.some(t=>t.bodegaId===bodegaId&&['EN_PROCESO','DEVUELTA','PENDIENTE_AUTORIZACION'].includes(t.estado))){toast('Ya existe una toma abierta o pendiente para esa bodega','e');return;}
  const calc=calculo(),lineas=[];
  for(const p of inv().productos.filter(p=>p.activo!==false&&p.inventariable!==false&&(!grupoId||p.grupoId===grupoId))){
    const st=calc.stock.find(x=>x.productoId===p.id&&x.bodegaId===bodegaId),cant=num(st?.cantidad);
    if(p.manejaLotes){
      const ls=calc.lotes.filter(x=>x.productoId===p.id&&x.bodegaId===bodegaId&&x.cantidad!==0);
      for(const l of ls)lineas.push({id:uid(),productoId:p.id,lote:l.lote,fechaVencimiento:l.fechaVencimiento||'',teoricoBase:num(l.cantidad),costoBase:num(st?.costoPromedio),fisico:null,contado:false});
    }else if(alcance==='TODOS'||cant!==0){
      lineas.push({id:uid(),productoId:p.id,lote:'',fechaVencimiento:'',teoricoBase:cant,costoBase:num(st?.costoPromedio),fisico:null,contado:false});
    }
  }
  lineas.sort((a,b)=>nombreProducto(a.productoId).localeCompare(nombreProducto(b.productoId))||a.lote.localeCompare(b.lote));
  const toma={id:uid(),folio:nuevoFolio('TOMA'),bodegaId,alcance,grupoId,observaciones:document.getElementById('it-obs').value.trim(),estado:'EN_PROCESO',version:1,lineas,creado:new Date().toISOString(),creadoPor:AUTH.user?.email||''};
  const respaldo=inv().tomas.slice();inv().tomas.push(toma);
  try{await guardarLista('tomas');logCambio('Inició toma de inventario',{entidad:'inventario-toma',id:toma.id,despues:toma,meta:{detalle:toma.folio}});invCerrarModal();UI.tomaId=toma.id;renderInventario();toast(`✅ ${toma.folio} iniciada con ${lineas.length} línea(s)`);}catch(e){inv().tomas=respaldo;toast('❌ '+e.message,'e');}
}

function invAbrirToma(id){UI.tomaId=id;renderInventario();}
function invVolverTomas(){UI.tomaId='';renderInventario();}
function renderTomaDetalle(c,t,calc){
  const editable=['EN_PROCESO','DEVUELTA'].includes(t.estado)&&writable(),lineas=t.lineas||[],contadas=lineas.filter(l=>l.contado).length,pend=lineas.length-contadas;
  const revisiones=lineas.map(l=>l.contado?rebasarLineaToma(l,t,inv().movimientos,calc):null),difs=revisiones.filter(x=>x&&Math.abs(x.diferencia)>1e-6).length;
  c.innerHTML=`<div class="sec-hdr"><div><div class="sec-title">${esc(t.folio)} · ${esc(nombreBodega(t.bodegaId))}</div><div class="sec-sub">${esc(TOMA_ESTADOS[t.estado]||t.estado)} · versión ${num(t.version)} · iniciada por ${esc(t.creadoPor||'—')}</div></div><div class="inv-actions"><button class="btn btn-g" onclick="invVolverTomas()">← Volver</button>${editable?'<button class="btn btn-g" onclick="invAgregarLineaToma()">＋ Producto/lote</button><button class="btn btn-p" onclick="invCerrarToma()">Cerrar para autorización</button>':''}</div></div>
  ${t.estado==='DEVUELTA'?`<div class="inv-alert"><strong>Devuelta:</strong> ${esc(t.motivoDevolucion||'')}</div>`:''}
  ${t.estado==='RECHAZADA'?`<div class="inv-alert error"><strong>Rechazada:</strong> ${esc(t.motivoRechazo||'')}</div>`:''}
  ${t.estado==='APLICADA'?`<div class="inv-alert"><strong>Ajustes aplicados:</strong> ${(t.movimientosAjuste||[]).map(esc).join(', ')||'sin diferencias'}</div>`:''}
  <div class="inv-kpis inv-kpis-4"><div><small>Líneas</small><strong>${lineas.length}</strong></div><div><small>Contadas</small><strong>${contadas}</strong></div><div class="${pend?'warn':''}"><small>Pendientes</small><strong>${pend}</strong></div><div class="${difs?'warn':''}"><small>Diferencias actuales</small><strong>${difs}</strong></div></div>
  <div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Buscar producto o lote…"></div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table inv-toma-table"><thead><tr><th>Código</th><th>Producto</th><th>Lote / vencimiento</th><th class="num">Teórico inicial</th><th class="num">Físico contado</th><th class="num">Mov. posteriores</th><th class="num">Objetivo actual</th><th class="num">Diferencia</th><th class="num">Costo ajuste</th></tr></thead><tbody>${renderLineasToma(t,calc,editable)}</tbody></table></div></div>
  ${t.observaciones?`<div class="inv-nota"><strong>Observaciones:</strong> ${esc(t.observaciones)}</div>`:''}
  ${t.estado==='PENDIENTE_AUTORIZACION'&&writable()?`<div class="inv-review-actions"><button class="btn btn-g" onclick="invDevolverToma()">↩ Devolver</button><button class="btn btn-r" onclick="invRechazarToma()">Rechazar</button><button class="btn btn-p" onclick="invAutorizarToma()">✓ Autorizar y aplicar</button></div>`:''}`;
}
function renderLineasToma(t,calc,editable){
  const q=UI.q.toLowerCase();let lineas=(t.lineas||[]).map(l=>({l,p:prod(l.productoId)}));if(q)lineas=lineas.filter(x=>(`${x.p?.codigo||''} ${x.p?.descripcion||''} ${x.l.lote||''}`).toLowerCase().includes(q));
  if(!lineas.length)return '<tr><td colspan="9" class="empty">Sin líneas para mostrar.</td></tr>';
  return lineas.map(({l,p})=>{const r=l.contado?rebasarLineaToma(l,t,inv().movimientos,calc):null,dif=r?.diferencia||0;return `<tr class="${l.contado&&Math.abs(dif)>1e-6?'inv-diferencia':''}"><td class="mono">${esc(p?.codigo||'')}</td><td><strong>${esc(p?.descripcion||l.productoId)}</strong><small>${esc(p?.unidad||'')}</small></td><td class="mono">${esc(l.lote||'—')}<small>${fechaCorta(l.fechaVencimiento)}</small></td><td class="num">${fmt(l.teoricoBase)}</td><td class="num">${editable?`<input class="inv-count-input" type="number" min="0" step="any" value="${l.contado?esc(l.fisico):''}" onchange="invSetFisicoToma('${t.id}','${l.id}',${t.version},this.value)">`:(l.contado?`<strong>${fmt(l.fisico)}</strong>`:'—')}</td><td class="num">${r?fmt(r.posteriores):'—'}</td><td class="num">${r?fmt(r.objetivo):'—'}</td><td class="num"><strong class="${dif>0?'inv-pos':dif<0?'inv-neg':''}">${r?(dif>0?'+':'')+fmt(dif):'—'}</strong></td><td class="num">${editable&&num(l.costoBase)<=0?`<input class="inv-count-input" type="number" min="0" step="any" value="${esc(l.costoConteo||'')}" placeholder="$" onchange="invSetCostoToma('${t.id}','${l.id}',${t.version},this.value)">`:mon(l.costoConteo||l.costoBase)}</td></tr>`;}).join('');
}

async function invSetFisicoToma(tomaId,lineaId,version,valor){
  const v=valor===''?null:num(valor);if(v!==null&&v<0){toast('La cantidad física no puede ser negativa','e');renderInventario();return;}
  try{const t=await mutarTomaSegura(tomaId,version,x=>{if(!['EN_PROCESO','DEVUELTA'].includes(x.estado))throw new Error('La toma ya no está editable');const l=x.lineas.find(y=>y.id===lineaId);if(!l)throw new Error('Línea no encontrada');l.fisico=v;l.contado=v!==null;l.fisicoFecha=v!==null?new Date().toISOString():null;l.contadoPor=AUTH.user?.email||'';});UI.tomaId=t.id;renderInventario();}catch(e){toast('❌ '+e.message,'e');renderInventario();}
}
async function invSetCostoToma(tomaId,lineaId,version,valor){
  const v=valor===''?0:num(valor);if(v<0){toast('El costo no puede ser negativo','e');return;}
  try{await mutarTomaSegura(tomaId,version,x=>{const l=x.lineas.find(y=>y.id===lineaId);if(!l)throw new Error('Línea no encontrada');l.costoConteo=v;});renderInventario();}catch(e){toast('❌ '+e.message,'e');renderInventario();}
}

function invAgregarLineaToma(){
  const t=inv().tomas.find(x=>x.id===UI.tomaId);if(!t)return;
  modal(`${modalHdr('Agregar producto o lote a '+esc(t.folio),'Úsalo para productos omitidos o para un lote nuevo detectado físicamente')}
  <div class="inv-form-grid"><label class="span2">Producto<select id="itl-prod" onchange="invTomaProductoCambio()">${opcionesProducto()}</select></label><label id="itl-lote-wrap">Lote<input id="itl-lote"></label><label id="itl-venc-wrap">Vencimiento<input type="date" id="itl-venc"></label><label>Cantidad física<input type="number" min="0" step="any" id="itl-fis"></label><label>Costo unitario si no existe PPP<input type="number" min="0" step="any" id="itl-costo"></label></div><div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarLineaToma('${t.id}',${t.version})">Agregar</button></div>`);invTomaProductoCambio();
}
function invTomaProductoCambio(){const p=prod(document.getElementById('itl-prod')?.value);for(const id of ['itl-lote-wrap','itl-venc-wrap']){const e=document.getElementById(id);if(e)e.style.display=p?.manejaLotes?'flex':'none';}}
async function invGuardarLineaToma(tomaId,version){
  const productoId=document.getElementById('itl-prod').value,p=prod(productoId),lote=String(document.getElementById('itl-lote')?.value||'').trim().toUpperCase(),fechaVencimiento=document.getElementById('itl-venc')?.value||'',fisicoRaw=document.getElementById('itl-fis').value,fisico=num(fisicoRaw),costoConteo=num(document.getElementById('itl-costo').value);
  if(!p){toast('Selecciona un producto','e');return;}if(fisicoRaw===''){toast('Ingresa la cantidad física, incluso si es cero','e');return;}if(fisico<0){toast('La cantidad física no puede ser negativa','e');return;}if(p.manejaLotes&&(!lote||!fechaVencimiento)){toast('Indica lote y vencimiento','e');return;}
  const calc=calculo(),st=calc.stock.find(x=>x.productoId===p.id&&x.bodegaId===inv().tomas.find(t=>t.id===tomaId)?.bodegaId),lt=p.manejaLotes?calc.lotes.find(x=>x.productoId===p.id&&x.bodegaId===inv().tomas.find(t=>t.id===tomaId)?.bodegaId&&x.lote===lote):null;
  try{await mutarTomaSegura(tomaId,version,x=>{if(x.lineas.some(y=>y.productoId===p.id&&String(y.lote||'')===lote))throw new Error('Ese producto/lote ya está en la toma');x.lineas.push({id:uid(),productoId:p.id,lote:p.manejaLotes?lote:'',fechaVencimiento:p.manejaLotes?fechaVencimiento:'',teoricoBase:p.manejaLotes?num(lt?.cantidad):num(st?.cantidad),costoBase:num(st?.costoPromedio),costoConteo,fisico,contado:true,fisicoFecha:new Date().toISOString(),contadoPor:AUTH.user?.email||'',agregadaManual:true});});invCerrarModal();renderInventario();toast('✅ Línea agregada');}catch(e){toast('❌ '+e.message,'e');}
}

async function invCerrarToma(){
  const t=inv().tomas.find(x=>x.id===UI.tomaId);if(!t)return;if(!(t.lineas||[]).length){toast('La toma no tiene líneas. Agrega al menos un producto o lote.','e');return;}const pendientes=(t.lineas||[]).filter(l=>!l.contado);if(pendientes.length){toast(`Faltan ${pendientes.length} línea(s) por contar. Ingresa cero cuando corresponda.`,'e');return;}if(!confirm(`Cerrar ${t.folio} y enviarla a autorización?`))return;
  try{await mutarTomaSegura(t.id,t.version,x=>{x.estado='PENDIENTE_AUTORIZACION';x.cerrado=new Date().toISOString();x.cerradoPor=AUTH.user?.email||'';delete x.motivoDevolucion;});renderInventario();toast('✅ Toma cerrada y pendiente de autorización');}catch(e){toast('❌ '+e.message,'e');renderInventario();}
}
async function invDevolverToma(){const t=inv().tomas.find(x=>x.id===UI.tomaId);if(!t)return;const motivo=prompt('Motivo de la devolución:');if(motivo===null)return;if(!motivo.trim()){toast('Indica el motivo','e');return;}try{await mutarTomaSegura(t.id,t.version,x=>{x.estado='DEVUELTA';x.motivoDevolucion=motivo.trim();x.devuelta=new Date().toISOString();x.devueltaPor=AUTH.user?.email||'';});renderInventario();toast('✅ Toma devuelta para corrección');}catch(e){toast('❌ '+e.message,'e');renderInventario();}}
async function invRechazarToma(){const t=inv().tomas.find(x=>x.id===UI.tomaId);if(!t)return;const motivo=prompt('Motivo del rechazo definitivo:');if(motivo===null)return;if(!motivo.trim()){toast('Indica el motivo','e');return;}if(!confirm('La toma se archivará sin aplicar ajustes. ¿Continuar?'))return;try{await mutarTomaSegura(t.id,t.version,x=>{x.estado='RECHAZADA';x.motivoRechazo=motivo.trim();x.rechazada=new Date().toISOString();x.rechazadaPor=AUTH.user?.email||'';});renderInventario();toast('Toma rechazada');}catch(e){toast('❌ '+e.message,'e');renderInventario();}}

async function invAutorizarToma(){
  const vista=inv().tomas.find(x=>x.id===UI.tomaId);if(!vista||vista.estado!=='PENDIENTE_AUTORIZACION')return;if(!confirm(`Autorizar ${vista.folio} y generar los ajustes de inventario?`))return;
  try{
    const tomas=await leerListaActual('tomas'),movimientos=await leerListaActual('movimientos'),idx=tomas.findIndex(x=>x.id===vista.id),t=idx>=0?tomas[idx]:null;
    if(!t)throw new Error('La toma ya no existe');if(num(t.version)!==num(vista.version))throw new Error('La toma cambió en otro equipo. Revisa la versión actual antes de autorizar.');if(t.estado!=='PENDIENTE_AUTORIZACION')throw new Error('La toma ya no está pendiente');
    const calc=recalcularInventario(movimientos,inv().productos),entradas=[],salidas=[];
    for(const l of (t.lineas||[])){
      const r=rebasarLineaToma(l,t,movimientos,calc),p=prod(l.productoId);if(r.objetivo<0)throw new Error(`${p?.descripcion}: el objetivo rebasado queda negativo; revisa movimientos posteriores al conteo`);if(Math.abs(r.diferencia)<1e-6)continue;
      const base={id:uid(),productoId:l.productoId,cantidad:Math.abs(r.diferencia),lote:l.lote||'',fechaVencimiento:l.fechaVencimiento||''};
      if(r.diferencia>0){const st=calc.stock.find(x=>x.productoId===l.productoId&&x.bodegaId===t.bodegaId),costo=num(st?.costoPromedio)||num(l.costoBase)||num(l.costoConteo);if(costo<=0)throw new Error(`${p?.descripcion}: indica un costo para valorizar el sobrante`);entradas.push({...base,costoUnitario:costo});}else salidas.push(base);
    }
    const ahora=new Date().toISOString(),nuevos=[];
    if(entradas.length)nuevos.push({id:uid(),folio:nuevoFolio('AJUSTE_ENTRADA'),tipo:'AJUSTE_ENTRADA',motivo:'AJUSTE POR TOMA',fecha:hoy(),bodegaDestinoId:t.bodegaId,documento:t.folio,observaciones:`Sobrantes autorizados de ${t.folio}`,centroCosto:'',tercero:'',lineas:entradas,estado:'VIGENTE',tomaId:t.id,creado:ahora,creadoPor:AUTH.user?.email||''});
    if(salidas.length)nuevos.push({id:uid(),folio:nuevoFolio('AJUSTE_SALIDA'),tipo:'AJUSTE_SALIDA',motivo:'AJUSTE POR TOMA',fecha:hoy(),bodegaOrigenId:t.bodegaId,documento:t.folio,observaciones:`Faltantes autorizados de ${t.folio}`,centroCosto:'',tercero:'',lineas:salidas,estado:'VIGENTE',tomaId:t.id,creado:ahora,creadoPor:AUTH.user?.email||''});
    for(const m of nuevos){const v=validarMovimiento(m,{productos:inv().productos,bodegas:inv().bodegas,movimientos:[...movimientos,...nuevos.filter(x=>x!==m)]});if(!v.ok)throw new Error(v.errores[0]);}
    const aplicada={...t,estado:'APLICADA',aplicado:ahora,autorizadoPor:AUTH.user?.email||'',movimientosAjuste:nuevos.map(x=>x.folio),version:num(t.version)+1};tomas[idx]=aplicada;const movFinal=[...movimientos,...nuevos];
    const wr=await window.storage.setMany([{key:K.movimientos,value:JSON.stringify(movFinal)},{key:K.tomas,value:JSON.stringify(tomas)}]);if(!wr||wr.ok===false)throw new Error(wr?.detalle||wr?.motivo||'No se pudieron aplicar los ajustes atómicamente');
    inv().movimientos=movFinal;inv().tomas=tomas;logCambio('Autorizó toma de inventario',{entidad:'inventario-toma',id:t.id,antes:t,despues:aplicada,meta:{detalle:t.folio}});for(const m of nuevos)logCambio('Creó ajuste por toma',{entidad:'inventario-movimiento',id:m.id,despues:m,meta:{detalle:m.folio}});
    renderInventario();toast(`✅ Toma aplicada · ${nuevos.length} movimiento(s) de ajuste`);
  }catch(e){toast('❌ '+e.message,'e');renderInventario();}
}

const OC_ESTADOS={BORRADOR:'Borrador',EMITIDA:'Emitida',PARCIAL:'Recepción parcial',RECIBIDA:'Recibida completa',CERRADA_PARCIAL:'Cerrada con saldo',ANULADA:'Anulada'};
function proveedoresOC(){return Object.values(S.fichasAux?.proveedor||{}).sort((a,b)=>String(a.razonSocial||'').localeCompare(String(b.razonSocial||'')));}
function proveedorOC(rut){return proveedoresOC().find(p=>String(p.rutCodigo||p.rut||'')===String(rut));}

function renderOrdenesCompra(c){
  if(UI.ocId){const oc=inv().ordenesCompra.find(x=>x.id===UI.ocId);if(oc){renderOCDetalle(c,oc);return;}UI.ocId='';}
  let rows=inv().ordenesCompra.slice().sort((a,b)=>String(b.creado||b.fecha||'').localeCompare(String(a.creado||a.fecha||'')));
  if(UI.estado)rows=rows.filter(o=>o.estado===UI.estado);if(UI.bodega)rows=rows.filter(o=>o.bodegaId===UI.bodega);if(UI.q){const q=UI.q.toLowerCase();rows=rows.filter(o=>(`${o.folio} ${o.proveedorNombre} ${o.proveedorRut} ${o.observaciones||''}`).toLowerCase().includes(q));}
  c.innerHTML=`<div class="card inv-toolbar"><input value="${esc(UI.q)}" oninput="invSetFiltro('q',this.value)" placeholder="Folio, proveedor u observación…"><select onchange="invSetFiltro('estado',this.value)"><option value="">Todos los estados</option>${Object.entries(OC_ESTADOS).map(([k,v])=>`<option value="${k}" ${UI.estado===k?'selected':''}>${v}</option>`).join('')}</select><select onchange="invSetFiltro('bodega',this.value)">${opcionesBodega(UI.bodega,true)}</select>${writable()?'<button class="btn btn-p" onclick="invNuevaOC()">＋ Orden de compra</button>':''}</div>
  <div class="card-np"><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>Bodega</th><th>Estado</th><th class="num">Recepción</th><th class="num">Neto</th><th class="num">Total</th><th></th></tr></thead><tbody>${rows.length?rows.map(o=>{const t=calcularTotalesOC(o),r=resumenRecepcionOC(o,inv().recepciones);return `<tr><td class="mono"><strong>${esc(o.folio)}</strong></td><td>${fechaCorta(o.fecha)}</td><td>${esc(o.proveedorNombre)}<small>${esc(o.proveedorRut)}</small></td><td>${esc(nombreBodega(o.bodegaId))}</td><td><span class="badge inv-oc-${String(o.estado).toLowerCase()}">${esc(OC_ESTADOS[o.estado]||o.estado)}</span></td><td class="num">${fmt(r.avance)}%</td><td class="num">${mon(t.neto)}</td><td class="num"><strong>${mon(t.total)}</strong></td><td><button class="btn btn-g" onclick="invVerOC('${o.id}')">Ver</button></td></tr>`;}).join(''):'<tr><td colspan="9" class="empty">Aún no hay órdenes de compra.</td></tr>'}</tbody></table></div></div>`;
}

function invNuevaOC(){
  if(!writable())return;if(!proveedoresOC().length){toast('Primero carga al menos un proveedor en Carga de Datos','e');return;}if(!inv().bodegas.some(b=>b.activo!==false)||!inv().productos.some(p=>p.activo!==false&&p.inventariable!==false)){toast('Necesitas una bodega y productos activos','e');return;}
  const pr=proveedoresOC()[0];ocDraft={id:'',version:0,fecha:hoy(),fechaEntrega:hoy(),proveedorRut:String(pr.rutCodigo||pr.rut||''),proveedorNombre:pr.razonSocial||'',bodegaId:inv().bodegas.find(b=>b.activo!==false)?.id||'',centroCosto:pr.ccDefault||'',condicionPago:'30 DÍAS',observaciones:'',tasaIVA:19,lineas:[{id:uid(),productoId:'',cantidad:'',precioUnitario:'',descuentoPct:0}]};invRenderOCModal();
}
function invEditarOC(id){const o=inv().ordenesCompra.find(x=>x.id===id);if(!o||o.estado!=='BORRADOR')return;ocDraft=JSON.parse(JSON.stringify(o));invRenderOCModal();}
function invRenderOCModal(){
  const d=ocDraft;if(!d)return;const tot=calcularTotalesOC({...d,lineas:d.lineas.map(l=>({...l,aplicaIVA:prod(l.productoId)?.aplicaIVA!==false}))});
  modal(`${modalHdr(d.id?'Editar '+esc(d.folio):'Nueva orden de compra','Los precios se ingresan netos; la recepción generará la entrada valorizada al inventario')}
  <div class="inv-form-grid"><label class="span2">Proveedor${inputAux({id:'oc-proveedor',tipo:'proveedor',value:d.proveedorRut,onPick:"invOCCampo('proveedorRut','%RUT%',true)",placeholder:'RUT o nombre del proveedor…'})}${d.proveedorNombre?`<small>${esc(d.proveedorNombre)}</small>`:''}</label><label>Fecha OC<input type="date" value="${esc(d.fecha)}" onchange="invOCCampo('fecha',this.value)"></label><label>Entrega esperada<input type="date" value="${esc(d.fechaEntrega)}" onchange="invOCCampo('fechaEntrega',this.value)"></label><label>Bodega de recepción<select onchange="invOCCampo('bodegaId',this.value)">${opcionesBodega(d.bodegaId)}</select></label><label>Condición de pago<input value="${esc(d.condicionPago)}" onchange="invOCCampo('condicionPago',this.value)"></label><label>Centro de costo<select onchange="invOCCampo('centroCosto',this.value)"><option value="">Sin centro</option>${(S.centros||[]).filter(x=>x.estado!=='inactivo').map(x=>`<option value="${esc(x.codigo||x.id)}" ${d.centroCosto===(x.codigo||x.id)?'selected':''}>${esc(x.codigo||'')} · ${esc(x.nombre||'')}</option>`).join('')}</select></label><label class="span2">Observaciones<input value="${esc(d.observaciones)}" onchange="invOCCampo('observaciones',this.value)"></label></div>
  <div class="inv-lines"><div class="inv-card-title">Productos solicitados</div>${d.lineas.map((l,i)=>`<div class="inv-oc-line"><label>Producto${inputProductoInv({id:`oc-prod-${i}`,value:l.productoId,onPick:`invOCLineaCampo(${i},'productoId','%PID%',true)`})}</label><label>Cantidad<input type="number" min="0" step="any" value="${esc(l.cantidad)}" onchange="invOCLineaCampo(${i},'cantidad',this.value,true)"></label><label>Precio unitario neto<input type="number" min="0" step="any" value="${esc(l.precioUnitario)}" onchange="invOCLineaCampo(${i},'precioUnitario',this.value,true)"></label><label>Descuento %<input type="number" min="0" max="100" step="any" value="${esc(l.descuentoPct)}" onchange="invOCLineaCampo(${i},'descuentoPct',this.value,true)"></label><div class="inv-line-total"><small>Total neto</small><strong>${mon(num(l.cantidad)*num(l.precioUnitario)*(1-num(l.descuentoPct)/100))}</strong></div><button class="inv-line-del" onclick="invOCQuitarLinea(${i})">×</button></div>`).join('')}<button class="btn btn-g" onclick="invOCAgregarLinea()">＋ Agregar producto</button></div>
  <div class="inv-oc-totales"><span>Neto <b>${mon(tot.neto)}</b></span><span>IVA <b>${mon(tot.iva)}</b></span><span>Total <b>${mon(tot.total)}</b></span></div>
  <div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-g" onclick="invGuardarOC(false)">Guardar borrador</button><button class="btn btn-p" onclick="invGuardarOC(true)">Guardar y emitir</button></div>`);
}
function invOCCampo(campo,valor,r=false){if(!ocDraft)return;ocDraft[campo]=valor;if(campo==='proveedorRut'){const p=proveedorOC(valor);ocDraft.proveedorNombre=p?.razonSocial||'';ocDraft.centroCosto=p?.ccDefault||ocDraft.centroCosto;}if(r)invRenderOCModal();}
function invOCLineaCampo(i,campo,valor,r=false){if(!ocDraft?.lineas[i])return;ocDraft.lineas[i][campo]=valor;if(r)invRenderOCModal();}
function invOCAgregarLinea(){ocDraft.lineas.push({id:uid(),productoId:'',cantidad:'',precioUnitario:'',descuentoPct:0});invRenderOCModal();}
function invOCQuitarLinea(i){if(ocDraft.lineas.length===1)ocDraft.lineas[0]={id:uid(),productoId:'',cantidad:'',precioUnitario:'',descuentoPct:0};else ocDraft.lineas.splice(i,1);invRenderOCModal();}

async function invGuardarOC(emitir=false){
  if(!writable()||!ocDraft)return;const p=proveedorOC(ocDraft.proveedorRut),ahora=new Date().toISOString();
  const candidata={...ocDraft,proveedorNombre:p?.razonSocial||ocDraft.proveedorNombre,proveedorDV:p?.rutDV||'',proveedorGiro:p?.giro||'',proveedorDireccion:p?.direccion||'',lineas:ocDraft.lineas.map(l=>({...l,cantidad:num(l.cantidad),precioUnitario:num(l.precioUnitario),descuentoPct:num(l.descuentoPct),aplicaIVA:prod(l.productoId)?.aplicaIVA!==false}))};
  const v=validarOrdenCompra(candidata,{productos:inv().productos,bodegas:inv().bodegas,proveedores:proveedoresOC()});if(!v.ok){toast('❌ '+v.errores[0],'e');return;}candidata.lineas=v.lineas;
  let respaldo=null;try{const actuales=await leerListaActual('ordenesCompra');respaldo=JSON.parse(JSON.stringify(actuales));let antes=null;if(candidata.id){const i=actuales.findIndex(x=>x.id===candidata.id);if(i<0)throw new Error('La orden ya no existe');if(num(actuales[i].version)!==num(candidata.version))throw new Error('La orden cambió en otro equipo. Vuelve a abrirla.');if(actuales[i].estado!=='BORRADOR')throw new Error('Sólo se puede editar una orden en borrador');antes=actuales[i];candidata.estado=emitir?'EMITIDA':'BORRADOR';candidata.version=num(candidata.version)+1;candidata.modificado=ahora;candidata.modificadoPor=AUTH.user?.email||'';actuales[i]=candidata;}else{candidata.id=uid();candidata.folio=nuevoFolio('OC');candidata.estado=emitir?'EMITIDA':'BORRADOR';candidata.version=1;candidata.creado=ahora;candidata.creadoPor=AUTH.user?.email||'';actuales.push(candidata);}inv().ordenesCompra=actuales;await guardarLista('ordenesCompra');logCambio(emitir?'Emitió orden de compra':'Guardó orden de compra',{entidad:'inventario-oc',id:candidata.id,antes,despues:candidata,meta:{detalle:candidata.folio}});ocDraft=null;invCerrarModal();UI.ocId=candidata.id;renderInventario();toast(`✅ ${candidata.folio} ${emitir?'emitida':'guardada como borrador'}`);}catch(e){if(respaldo)inv().ordenesCompra=respaldo;toast('❌ '+e.message,'e');}
}

function invVerOC(id){UI.ocId=id;renderInventario();}function invVolverOC(){UI.ocId='';renderInventario();}
function renderOCDetalle(c,o){
  const tot=calcularTotalesOC(o),res=resumenRecepcionOC(o,inv().recepciones),recs=inv().recepciones.filter(r=>r.ordenCompraId===o.id).sort((a,b)=>String(b.creado).localeCompare(String(a.creado)));
  c.innerHTML=`<div class="sec-hdr"><div><div class="sec-title">${esc(o.folio)} · ${esc(o.proveedorNombre)}</div><div class="sec-sub">${esc(o.proveedorRut)} · ${fechaCorta(o.fecha)} · ${esc(nombreBodega(o.bodegaId))} · versión ${num(o.version)}</div></div><div class="inv-actions"><button class="btn btn-g" onclick="invVolverOC()">← Volver</button>${writable()&&o.estado==='BORRADOR'?`<button class="btn btn-g" onclick="invEditarOC('${o.id}')">Editar</button><button class="btn btn-p" onclick="invEmitirOC('${o.id}')">Emitir OC</button>`:''}${writable()&&['EMITIDA','PARCIAL'].includes(o.estado)?`<button class="btn btn-p" onclick="invAbrirRecepcion('${o.id}')">＋ Recibir</button>`:''}</div></div>
  <div class="inv-kpis inv-kpis-4"><div><small>Estado</small><strong class="inv-kpi-text">${esc(OC_ESTADOS[o.estado]||o.estado)}</strong></div><div><small>Recepción</small><strong>${fmt(res.avance)}%</strong></div><div><small>Pendiente</small><strong>${fmt(res.pendiente)}</strong></div><div><small>Total OC</small><strong>${mon(tot.total)}</strong></div></div>
  <div class="card-np"><div class="inv-card-title">Detalle de la orden</div><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Producto</th><th class="num">Pedido</th><th class="num">Recibido</th><th class="num">Pendiente</th><th class="num">Precio neto</th><th class="num">Desc. %</th><th class="num">Total neto</th></tr></thead><tbody>${res.lineas.map(l=>`<tr><td>${esc(nombreProducto(l.productoId))}</td><td class="num">${fmt(l.cantidad)}</td><td class="num">${fmt(l.recibida)}</td><td class="num"><strong>${fmt(l.pendiente)}</strong></td><td class="num">${mon(l.precioUnitario)}</td><td class="num">${fmt(l.descuentoPct)}</td><td class="num">${mon(num(l.cantidad)*num(l.precioUnitario)*(1-num(l.descuentoPct)/100))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Neto ${mon(tot.neto)} · IVA ${mon(tot.iva)}</td><td>Total</td><td class="num"><strong>${mon(tot.total)}</strong></td></tr></tfoot></table></div></div>
  <div class="card-np inv-oc-recs"><div class="inv-card-title">Recepciones</div><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Folio</th><th>Fecha</th><th>Documento</th><th class="num">Líneas</th><th>Estado</th><th>Integración contable</th><th>Responsable</th><th></th></tr></thead><tbody>${recs.length?recs.map(r=>`<tr class="${r.estado==='ANULADA'?'inv-anulado':''}"><td class="mono"><strong>${esc(r.folio)}</strong></td><td>${fechaCorta(r.fecha)}</td><td>${esc(r.documentoTipo)} ${esc(r.documentoNumero)}</td><td class="num">${r.lineas.length}</td><td><span class="badge ${r.estado==='ANULADA'?'inv-bad':'inv-ok'}">${esc(r.estado)}</span></td><td>${r.estado==='ANULADA'?'<span class="badge inv-muted">Anulada</span>':r.compraId?`<span class="badge inv-ok">✅ Conciliada · DTE ${esc(r.compraTipoDTE)} N°${esc(r.compraNumero)}</span>`:`<span class="badge inv-muted">${r.estadoContable==='PENDIENTE_CONCILIACION'?'Pendiente DTE':'Espera factura'}</span>${writable()?` <button class="btn btn-g" style="padding:2px 6px;font-size:10px" onclick="invAbrirVincularFactura('${r.id}')">🔗 Vincular</button>`:''}`}</td><td>${esc(r.creadoPor||'—')}</td><td>${writable()&&r.estado!=='ANULADA'?`<button class="btn btn-r" onclick="invAnularRecepcion('${r.id}')">Anular</button>`:''}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">Sin recepciones registradas.</td></tr>'}</tbody></table></div></div>
  ${o.observaciones?`<div class="inv-nota"><strong>Observaciones:</strong> ${esc(o.observaciones)}</div>`:''}
  ${writable()&&o.estado==='PARCIAL'?'<div class="inv-review-actions"><button class="btn btn-g" onclick="invCerrarSaldoOC()">Cerrar saldo pendiente</button></div>':''}${writable()&&['BORRADOR','EMITIDA'].includes(o.estado)?'<div class="inv-review-actions"><button class="btn btn-r" onclick="invAnularOC()">Anular orden</button></div>':''}`;
}

async function mutarOCSegura(id,version,mutador){const actuales=await leerListaActual('ordenesCompra'),respaldo=JSON.parse(JSON.stringify(actuales)),i=actuales.findIndex(x=>x.id===id);if(i<0)throw new Error('La orden ya no existe');if(num(actuales[i].version)!==num(version))throw new Error('La orden cambió en otro equipo. Revisa la versión actual.');const siguiente=JSON.parse(JSON.stringify(actuales[i]));mutador(siguiente);siguiente.version=num(siguiente.version)+1;siguiente.modificado=new Date().toISOString();actuales[i]=siguiente;inv().ordenesCompra=actuales;try{await guardarLista('ordenesCompra');return siguiente;}catch(e){inv().ordenesCompra=respaldo;throw e;}}
async function invEmitirOC(id){const o=inv().ordenesCompra.find(x=>x.id===id);if(!o||o.estado!=='BORRADOR')return;if(!confirm(`Emitir ${o.folio}? Después sólo podrá recibirse o anularse.`))return;try{const n=await mutarOCSegura(o.id,o.version,x=>{const v=validarOrdenCompra(x,{productos:inv().productos,bodegas:inv().bodegas,proveedores:proveedoresOC()});if(!v.ok)throw new Error(v.errores[0]);x.estado='EMITIDA';x.emitido=new Date().toISOString();x.emitidoPor=AUTH.user?.email||'';});logCambio('Emitió orden de compra',{entidad:'inventario-oc',id:n.id,despues:n,meta:{detalle:n.folio}});renderInventario();toast('✅ Orden emitida');}catch(e){toast('❌ '+e.message,'e');renderInventario();}}
async function invAnularOC(){const o=inv().ordenesCompra.find(x=>x.id===UI.ocId);if(!o)return;if(inv().recepciones.some(r=>r.ordenCompraId===o.id&&r.estado!=='ANULADA')){toast('No se puede anular una OC con recepciones vigentes','e');return;}const motivo=prompt('Motivo de anulación:');if(motivo===null)return;if(!motivo.trim()){toast('Indica el motivo','e');return;}try{const n=await mutarOCSegura(o.id,o.version,x=>{x.estado='ANULADA';x.motivoAnulacion=motivo.trim();x.anulado=new Date().toISOString();x.anuladoPor=AUTH.user?.email||'';});logCambio('Anuló orden de compra',{entidad:'inventario-oc',id:n.id,despues:n,meta:{detalle:n.folio}});renderInventario();toast('Orden anulada');}catch(e){toast('❌ '+e.message,'e');renderInventario();}}
async function invCerrarSaldoOC(){const o=inv().ordenesCompra.find(x=>x.id===UI.ocId);if(!o||o.estado!=='PARCIAL'||!confirm(`Cerrar definitivamente el saldo pendiente de ${o.folio}?`))return;try{await mutarOCSegura(o.id,o.version,x=>{x.estado='CERRADA_PARCIAL';x.cerrado=new Date().toISOString();x.cerradoPor=AUTH.user?.email||'';});renderInventario();toast('✅ Saldo pendiente cerrado');}catch(e){toast('❌ '+e.message,'e');renderInventario();}}

function invAbrirRecepcion(id){
  const o=inv().ordenesCompra.find(x=>x.id===id);if(!o||!['EMITIDA','PARCIAL'].includes(o.estado))return;const r=resumenRecepcionOC(o,inv().recepciones);
  recDraft={ordenCompraId:o.id,ordenVersion:o.version,fecha:hoy(),documentoTipo:'GUÍA',documentoNumero:'',observaciones:'',lineas:r.lineas.filter(l=>l.pendiente>1e-6).map(l=>({id:uid(),ocLineaId:l.id,productoId:l.productoId,pendiente:l.pendiente,cantidad:'',lote:'',fechaVencimiento:''}))};invRenderRecepcionModal();
}
function invRenderRecepcionModal(){const d=recDraft,o=inv().ordenesCompra.find(x=>x.id===d?.ordenCompraId);if(!d||!o)return;modal(`${modalHdr('Recepción de '+esc(o.folio),`${esc(o.proveedorNombre)} · destino ${esc(nombreBodega(o.bodegaId))}`)}<div class="inv-form-grid"><label>Fecha recepción<input type="date" value="${esc(d.fecha)}" onchange="invRecCampo('fecha',this.value)"></label><label>Tipo documento<select onchange="invRecCampo('documentoTipo',this.value)">${['GUÍA','FACTURA AFECTA','FACTURA EXENTA','OTRO'].map(x=>`<option ${d.documentoTipo===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Número documento<input value="${esc(d.documentoNumero)}" onchange="invRecCampo('documentoNumero',this.value)"></label><label>Observaciones<input value="${esc(d.observaciones)}" onchange="invRecCampo('observaciones',this.value)"></label></div><div class="inv-lines"><div class="inv-card-title">Cantidades recibidas</div>${d.lineas.map((l,i)=>{const p=prod(l.productoId),repetida=d.lineas.filter(x=>x.ocLineaId===l.ocLineaId).length>1;return `<div class="inv-rec-line"><div><strong>${esc(nombreProducto(l.productoId))}</strong><small>Pendiente total: ${fmt(l.pendiente)} ${esc(p?.unidad||'')}</small></div><label>Recibido<input type="number" min="0" max="${l.pendiente}" step="any" value="${esc(l.cantidad)}" onchange="invRecLineaCampo(${i},'cantidad',this.value)"></label>${p?.manejaLotes?`<label>Lote<input value="${esc(l.lote)}" onchange="invRecLineaCampo(${i},'lote',this.value.toUpperCase())"></label><label>Vencimiento<input type="date" value="${esc(l.fechaVencimiento)}" onchange="invRecLineaCampo(${i},'fechaVencimiento',this.value)"></label><div class="inv-rec-actions"><button class="btn btn-g" onclick="invRecAgregarLote(${i})">＋ lote</button>${repetida?`<button class="btn btn-r" onclick="invRecQuitarLinea(${i})">×</button>`:''}</div>`:''}</div>`;}).join('')}</div><div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarRecepcion()">Registrar recepción</button></div>`);}
function invRecCampo(campo,valor){if(recDraft)recDraft[campo]=valor;}function invRecLineaCampo(i,campo,valor){if(recDraft?.lineas[i])recDraft.lineas[i][campo]=valor;}
function invRecAgregarLote(i){const l=recDraft?.lineas[i];if(!l)return;recDraft.lineas.splice(i+1,0,{id:uid(),ocLineaId:l.ocLineaId,productoId:l.productoId,pendiente:l.pendiente,cantidad:'',lote:'',fechaVencimiento:''});invRenderRecepcionModal();}
function invRecQuitarLinea(i){if(!recDraft?.lineas[i])return;recDraft.lineas.splice(i,1);invRenderRecepcionModal();}

async function invGuardarRecepcion(){
  if(!writable()||!recDraft)return;const vista=JSON.parse(JSON.stringify(recDraft));
  try{await Promise.all([leerListaActual('ordenesCompra'),leerListaActual('recepciones'),leerListaActual('movimientos')]);const oi=inv().ordenesCompra.findIndex(x=>x.id===vista.ordenCompraId),o=inv().ordenesCompra[oi];if(!o)throw new Error('La orden ya no existe');if(num(o.version)!==num(vista.ordenVersion))throw new Error('La orden cambió en otro equipo. Reabre la recepción.');if(!['EMITIDA','PARCIAL'].includes(o.estado))throw new Error('La orden ya no admite recepciones');if(vista.fecha<o.fecha)throw new Error('La recepción no puede ser anterior a la orden');if(inv().recepciones.some(r=>r.estado!=='ANULADA'&&r.proveedorRut===o.proveedorRut&&r.documentoTipo===vista.documentoTipo&&String(r.documentoNumero).trim().toUpperCase()===String(vista.documentoNumero).trim().toUpperCase()))throw new Error('Ese documento ya fue recibido para el proveedor');
    const valida=validarRecepcion(vista,o,{productos:inv().productos,recepciones:inv().recepciones});if(!valida.ok)throw new Error(valida.errores[0]);if(vista.documentoTipo==='FACTURA EXENTA'&&valida.lineas.some(l=>prod(l.productoId)?.aplicaIVA!==false))throw new Error('Una factura exenta contiene productos configurados como afectos a IVA');const ahora=new Date().toISOString(),tipoDTE={'GUÍA':52,'FACTURA AFECTA':33,'FACTURA EXENTA':34}[vista.documentoTipo]||null,rec={id:uid(),folio:nuevoFolio('RECEPCION'),ordenCompraId:o.id,ordenFolio:o.folio,proveedorRut:o.proveedorRut,proveedorNombre:o.proveedorNombre,bodegaId:o.bodegaId,fecha:vista.fecha,documentoTipo:vista.documentoTipo,tipoDTE,documentoNumero:String(vista.documentoNumero).trim().toUpperCase(),estadoContable:tipoDTE===33||tipoDTE===34?'PENDIENTE_CONCILIACION':'ESPERA_FACTURA',observaciones:vista.observaciones,estado:'VIGENTE',creado:ahora,creadoPor:AUTH.user?.email||'',lineas:valida.lineas.map(l=>{const ol=o.lineas.find(x=>x.id===l.ocLineaId);return {...l,id:uid(),productoId:ol.productoId,cantidad:num(l.cantidad),lote:String(l.lote||'').trim().toUpperCase(),precioUnitario:num(ol.precioUnitario)*(1-num(ol.descuentoPct)/100)};})};
    // V2.22 — Conciliación automática: si ya existe en Compras la factura con el mismo RUT+tipoDTE+N°, se vincula de una vez.
    const compraMatch=(tipoDTE===33||tipoDTE===34)?buscarCompraParaRecepcion(rec,S.compras||[]):null;
    if(compraMatch){rec.compraId=compraMatch.id;rec.compraTipoDTE=compraMatch.tipoDTE;rec.compraNumero=compraMatch.numero;rec.compraAnio=S.empresa.anio;rec.estadoContable='CONCILIADA';}
    const mov={id:uid(),folio:nuevoFolio('ENTRADA'),tipo:'ENTRADA',motivo:'COMPRA',fecha:rec.fecha,bodegaDestinoId:o.bodegaId,documento:`${rec.documentoTipo} ${rec.documentoNumero}`,tercero:o.proveedorNombre,centroCosto:o.centroCosto||'',observaciones:`Recepción ${rec.folio} de ${o.folio}`,lineas:rec.lineas.map(l=>({id:uid(),productoId:l.productoId,cantidad:l.cantidad,costoUnitario:l.precioUnitario,lote:l.lote,fechaVencimiento:l.fechaVencimiento||''})),estado:'VIGENTE',recepcionId:rec.id,ordenCompraId:o.id,creado:ahora,creadoPor:AUTH.user?.email||''};
    const vm=validarMovimiento(mov,{productos:inv().productos,bodegas:inv().bodegas,movimientos:inv().movimientos});if(!vm.ok)throw new Error(vm.errores[0]);mov.lineas=vm.lineas;const recs=[...inv().recepciones,rec],movs=[...inv().movimientos,mov],actualizada={...o,estado:estadoSegunRecepciones(o,recs),version:num(o.version)+1,modificado:ahora,ultimaRecepcion:ahora};const ocs=inv().ordenesCompra.slice();ocs[oi]=actualizada;
    const wr=await window.storage.setMany([{key:K.recepciones,value:JSON.stringify(recs)},{key:K.movimientos,value:JSON.stringify(movs)},{key:K.ordenesCompra,value:JSON.stringify(ocs)}]);if(!wr||wr.ok===false)throw new Error(wr?.detalle||wr?.motivo||'No fue posible registrar la recepción');inv().recepciones=recs;inv().movimientos=movs;inv().ordenesCompra=ocs;
    let avisoExtra='';
    if(compraMatch){
      const ci=S.compras.findIndex(x=>x.id===compraMatch.id);
      if(ci>=0&&!(S.compras[ci].recepcionesVinculadas||[]).some(v=>v.id===rec.id)){
        S.compras[ci]={...S.compras[ci],recepcionesVinculadas:[...(S.compras[ci].recepcionesVinculadas||[]),{id:rec.id,folio:rec.folio}]};
        const wc=await window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras));
        if(!wc||wc.ok===false)avisoExtra=' · ⚠️ no se pudo actualizar la referencia en Compras (vincúlala manualmente)';
      }
    }
    logCambio('Registró recepción de compra',{entidad:'inventario-recepcion',id:rec.id,despues:rec,meta:{detalle:`${rec.folio} · ${o.folio}`}});recDraft=null;invCerrarModal();UI.ocId=o.id;renderInventario();
    const otras=otrasRecepcionesMismoDocumento(rec,recs);
    if(otras.length)toast(`⚠️ ${rec.folio} registrada, pero ya existe otra recepción con el mismo N° de documento para este proveedor (${otras.map(x=>x.folio).join(', ')}). Verifica que no sea un duplicado.${avisoExtra}`,'e');
    else if(avisoExtra)toast(`✅ ${rec.folio} registrada · entrada ${mov.folio}${compraMatch?' · 🔗 conciliada':''}${avisoExtra}`,'e');
    else toast(`✅ ${rec.folio} registrada · entrada ${mov.folio}${compraMatch?' · 🔗 conciliada con factura ya registrada':''}`);
  }catch(e){toast('❌ '+e.message,'e');renderInventario();}
}

async function invAbrirVincularFactura(recepcionId){
  const r=inv().recepciones.find(x=>x.id===recepcionId);if(!r||r.estado==='ANULADA'||r.compraId)return;
  const candidatas=comprasVinculables(r,S.compras||[]);
  modal(`${modalHdr('Vincular factura de Compras',`${esc(r.proveedorNombre)} · ${esc(r.documentoTipo)} ${esc(r.documentoNumero)}`)}
  ${candidatas.length?`<div class="inv-lines">${candidatas.map(c=>`<div class="inv-rec-line"><div><strong>DTE ${c.tipoDTE} N° ${esc(c.numero)}</strong><small>${fechaCorta(c.fecha)} · ${mon(c.total)}${(c.recepcionesVinculadas||[]).length?` · ya vinculada a ${c.recepcionesVinculadas.length} recepción(es)`:''}</small></div><button class="btn btn-p" onclick="invVincularFactura('${r.id}','${c.id}')">Vincular</button></div>`).join('')}</div>`
  :`<div class="empty">No hay facturas de ${esc(r.proveedorNombre)} registradas en Compras este año.</div>`}
  <div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cerrar</button></div>`);
}
async function invVincularFactura(recepcionId,compraId){
  if(!writable())return;
  try{
    await leerListaActual('recepciones');
    const ri=inv().recepciones.findIndex(x=>x.id===recepcionId),r=inv().recepciones[ri];
    if(!r||r.estado==='ANULADA')throw new Error('La recepción ya no está disponible');
    if(r.compraId)throw new Error('Esta recepción ya está conciliada con una factura');
    const c=(S.compras||[]).find(x=>x.id===compraId);
    if(!c||c.estado==='anulado')throw new Error('La factura seleccionada ya no está disponible');
    const ahora=new Date().toISOString(),recs=inv().recepciones.slice();
    recs[ri]={...r,compraId:c.id,compraTipoDTE:c.tipoDTE,compraNumero:c.numero,compraAnio:S.empresa.anio,estadoContable:'CONCILIADA',conciliadoManual:true,conciliadoEn:ahora,conciliadoPor:AUTH.user?.email||''};
    const wr=await window.storage.set(K.recepciones,JSON.stringify(recs));if(!wr||wr.ok===false)throw new Error(wr?.detalle||wr?.motivo||'No se pudo vincular la recepción');
    inv().recepciones=recs;
    const ci=S.compras.findIndex(x=>x.id===c.id);
    if(ci>=0&&!(S.compras[ci].recepcionesVinculadas||[]).some(v=>v.id===r.id)){
      S.compras[ci]={...S.compras[ci],recepcionesVinculadas:[...(S.compras[ci].recepcionesVinculadas||[]),{id:r.id,folio:r.folio}]};
      const wc=await window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras));
      if(!wc||wc.ok===false){invCerrarModal();renderInventario();toast(`🔗 ${r.folio} vinculada, pero no se pudo actualizar la referencia en Compras`,'e');return;}
    }
    logCambio('Vinculó recepción con factura',{entidad:'inventario-recepcion',id:r.id,despues:recs[ri],meta:{detalle:`${r.folio} ↔ DTE ${c.tipoDTE} N°${c.numero}`}});
    invCerrarModal();renderInventario();toast(`🔗 ${r.folio} conciliada con DTE ${c.tipoDTE} N°${c.numero}`);
  }catch(e){toast('❌ '+e.message,'e');renderInventario();}
}

async function invAnularRecepcion(id){
  const vista=inv().recepciones.find(x=>x.id===id);if(!vista||vista.estado==='ANULADA')return;const motivo=prompt('Motivo de anulación de la recepción:');if(motivo===null)return;if(!motivo.trim()){toast('Indica el motivo','e');return;}if(!confirm('La entrada de inventario asociada también será anulada. ¿Continuar?'))return;
    try{await Promise.all([leerListaActual('ordenesCompra'),leerListaActual('recepciones'),leerListaActual('movimientos')]);const ri=inv().recepciones.findIndex(x=>x.id===id),r=inv().recepciones[ri];if(!r||r.estado==='ANULADA')throw new Error('La recepción ya fue anulada o no existe');const mi=inv().movimientos.findIndex(x=>x.recepcionId===r.id&&x.estado!=='ANULADO'),m=inv().movimientos[mi];if(!m)throw new Error('No se encontró la entrada de inventario asociada');const salida={tipo:'AJUSTE_SALIDA',fecha:hoy(),bodegaOrigenId:r.bodegaId,lineas:m.lineas.map(l=>({productoId:l.productoId,cantidad:l.cantidad,lote:l.lote}))};const vs=validarMovimiento(salida,{productos:inv().productos,bodegas:inv().bodegas,movimientos:inv().movimientos});if(!vs.ok)throw new Error('No se puede anular: parte de la mercadería ya no está disponible. '+vs.errores[0]);const ahora=new Date().toISOString(),recs=inv().recepciones.slice(),movs=inv().movimientos.slice();recs[ri]={...r,estado:'ANULADA',motivoAnulacion:motivo.trim(),anulado:ahora,anuladoPor:AUTH.user?.email||''};movs[mi]={...m,estado:'ANULADO',motivoAnulacion:`Recepción anulada: ${motivo.trim()}`,anulado:ahora,anuladoPor:AUTH.user?.email||''};const oi=inv().ordenesCompra.findIndex(x=>x.id===r.ordenCompraId),ocs=inv().ordenesCompra.slice();if(oi>=0){const o=ocs[oi],baseEstado=o.estado==='CERRADA_PARCIAL'?'CERRADA_PARCIAL':'EMITIDA';ocs[oi]={...o,estado:estadoSegunRecepciones({...o,estado:baseEstado},recs),version:num(o.version)+1,modificado:ahora};}const wr=await window.storage.setMany([{key:K.recepciones,value:JSON.stringify(recs)},{key:K.movimientos,value:JSON.stringify(movs)},{key:K.ordenesCompra,value:JSON.stringify(ocs)}]);if(!wr||wr.ok===false)throw new Error(wr?.detalle||wr?.motivo||'No fue posible anular');inv().recepciones=recs;inv().movimientos=movs;inv().ordenesCompra=ocs;
    let avisoExtra='';
    if(r.compraId){
      const ci=S.compras.findIndex(x=>x.id===r.compraId);
      if(ci>=0&&(S.compras[ci].recepcionesVinculadas||[]).some(v=>v.id===r.id)){
        S.compras[ci]={...S.compras[ci],recepcionesVinculadas:S.compras[ci].recepcionesVinculadas.filter(v=>v.id!==r.id)};
        const wc=await window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras));
        if(!wc||wc.ok===false)avisoExtra=' · ⚠️ no se pudo desvincular la factura en Compras';
      }
    }
    logCambio('Anuló recepción de compra',{entidad:'inventario-recepcion',id:r.id,antes:r,despues:recs[ri],meta:{detalle:r.folio}});renderInventario();toast('✅ Recepción y entrada anuladas'+avisoExtra,avisoExtra?'e':'ok');}catch(e){toast('❌ '+e.message,'e');renderInventario();}
}

function modal(html){
  let e=document.getElementById('inv-modal');if(!e){e=document.createElement('div');e.id='inv-modal';e.className='modal-bkd';document.body.appendChild(e);}
  e.innerHTML=`<div class="modal-box inv-modal-box">${html}</div>`;e.classList.add('open');
}
function invCerrarModal(){const e=document.getElementById('inv-modal');if(e)e.classList.remove('open');movDraft=null;productosImportDraft=null;ocDraft=null;recDraft=null;}
function modalHdr(t,s=''){return `<div class="modal-hdr"><div><div class="modal-title">${t}</div>${s?`<div class="modal-sub">${s}</div>`:''}</div><button class="modal-close" onclick="invCerrarModal()">×</button></div>`;}

function invAbrirGrupo(id=''){
  const g=id?grupo(id):null;
  modal(`${modalHdr(g?'Editar grupo':'Nuevo grupo')}<div class="inv-form-grid"><label class="span2">Nombre<input id="ig-nombre" value="${esc(g?.nombre||'')}" maxlength="80"></label><label class="span2">Subgrupos separados por coma<textarea id="ig-sub" rows="4">${esc((g?.subgrupos||[]).join(', '))}</textarea></label></div><div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarGrupo('${esc(id)}')">Guardar</button></div>`);
}
async function invGuardarGrupo(id=''){
  if(!writable())return;
  const nombre=document.getElementById('ig-nombre').value.trim().toUpperCase();
  const subgrupos=[...new Set(document.getElementById('ig-sub').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))];
  if(!nombre){toast('Indica el nombre del grupo','e');return;}
  if(inv().grupos.some(g=>g.id!==id&&g.nombre===nombre)){toast('Ese grupo ya existe','e');return;}
  const respaldo=JSON.stringify(inv().grupos);
  const viejo=id?grupo(id):null,reg={...(viejo||{}),id:id||uid(),nombre,subgrupos,activo:true,actualizado:new Date().toISOString()};
  if(viejo)Object.assign(viejo,reg);else inv().grupos.push(reg);
  try{await guardarLista('grupos');invCerrarModal();renderInventario();toast('✅ Grupo guardado');}catch(e){inv().grupos=JSON.parse(respaldo);toast('❌ '+e.message,'e');}
}

function invAbrirBodega(id=''){
  const b=id?bod(id):null;
  modal(`${modalHdr(b?'Editar bodega':'Nueva bodega')}<div class="inv-form-grid"><label>Código<input id="ib-codigo" value="${esc(b?.codigo||'')}" maxlength="20"></label><label>Nombre<input id="ib-nombre" value="${esc(b?.nombre||'')}" maxlength="100"></label><label class="span2">Dirección<input id="ib-dir" value="${esc(b?.direccion||'')}" maxlength="160"></label><label class="inv-check span2"><input type="checkbox" id="ib-activa" ${b?.activo===false?'':'checked'}> Bodega activa</label></div><div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarBodega('${esc(id)}')">Guardar</button></div>`);
}
async function invGuardarBodega(id=''){
  if(!writable())return;
  const codigo=document.getElementById('ib-codigo').value.trim().toUpperCase(),nombre=document.getElementById('ib-nombre').value.trim().toUpperCase();
  if(!codigo||!nombre){toast('Completa código y nombre','e');return;}
  if(inv().bodegas.some(b=>b.id!==id&&b.codigo===codigo)){toast('Ese código de bodega ya existe','e');return;}
  const respaldo=JSON.stringify(inv().bodegas);
  const viejo=id?bod(id):null,reg={...(viejo||{}),id:id||uid(),codigo,nombre,direccion:document.getElementById('ib-dir').value.trim(),activo:document.getElementById('ib-activa').checked,actualizado:new Date().toISOString()};
  if(viejo)Object.assign(viejo,reg);else inv().bodegas.push(reg);
  try{await guardarLista('bodegas');invCerrarModal();renderInventario();toast('✅ Bodega guardada');}catch(e){inv().bodegas=JSON.parse(respaldo);toast('❌ '+e.message,'e');}
}

function siguienteCodigo(){let max=0;for(const p of inv().productos){const m=String(p.codigo||'').match(/^P(\d+)$/i);if(m)max=Math.max(max,+m[1]);}return 'P'+String(max+1).padStart(6,'0');}
function invAbrirProducto(id=''){
  const p=id?prod(id):null,grupos=inv().grupos.filter(g=>g.activo!==false);
  modal(`${modalHdr(p?'Editar producto':'Nuevo producto','Los productos y su clasificación pertenecen exclusivamente a la empresa activa')}
  <div class="inv-form-grid">
    <label>Código interno<input id="ip-codigo" value="${esc(p?.codigo||siguienteCodigo())}" ${p?'readonly':''} maxlength="30"></label><label>Código EAN<input id="ip-ean" value="${esc(p?.ean||'')}" maxlength="20"></label>
    <label class="span2">Descripción<input id="ip-desc" value="${esc(p?.descripcion||'')}" maxlength="180"></label>
    <label>Tipo<select id="ip-tipo">${['MERCADERÍA','MATERIA PRIMA','PRODUCTO TERMINADO','INSUMO','ACTIVO FIJO','SERVICIO'].map(x=>`<option ${p?.tipo===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Unidad<select id="ip-unidad">${['UN','KG','LT','MT','M2','M3','CAJA','SACO','PQT','GL'].map(x=>`<option ${p?.unidad===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Grupo<select id="ip-grupo" onchange="invActualizarSubgrupos()"><option value="">Sin grupo</option>${grupos.map(g=>`<option value="${g.id}" ${p?.grupoId===g.id?'selected':''}>${esc(g.nombre)}</option>`).join('')}</select></label>
    <label>Subgrupo<select id="ip-sub" data-value="${esc(p?.subgrupo||'')}"></select></label>
    <label>Stock mínimo<input type="number" min="0" step="any" id="ip-min" value="${num(p?.stockMinimo)}"></label><label>Cuenta inventario<input value="${CUENTA_INVENTARIO_FIJA} — ${esc(pdcNm(CUENTA_INVENTARIO_FIJA)||'')}" readonly disabled title="Única cuenta de inventario permitida"></label>
    <label>Cuenta de gasto/consumo<select id="ip-ccosto"><option value="">Selecciona una cuenta de gasto…</option>${CUENTAS_GASTO.map(c=>`<option value="${c.cd}" ${(p?.cuentaCosto||'')===c.cd?'selected':''}>${c.cd} — ${esc(c.nm)}</option>`).join('')}</select></label><label class="inv-check"><input type="checkbox" id="ip-iva" ${p?.aplicaIVA===false?'':'checked'}> Afecto a IVA</label>
    <label class="inv-check"><input type="checkbox" id="ip-lotes" ${p?.manejaLotes?'checked':''} ${p&&inv().movimientos.some(m=>(m.lineas||[]).some(l=>l.productoId===p.id))?'disabled':''}> Maneja lote y vencimiento</label>
    <label class="inv-check"><input type="checkbox" id="ip-inv" ${p?.inventariable===false?'':'checked'}> Inventariable</label><label class="inv-check"><input type="checkbox" id="ip-activo" ${p?.activo===false?'':'checked'}> Producto activo</label>
  </div><div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarProducto('${esc(id)}')">Guardar</button></div>`);
  invActualizarSubgrupos();
}
function invActualizarSubgrupos(){const gs=document.getElementById('ip-grupo'),ss=document.getElementById('ip-sub');if(!gs||!ss)return;const sel=ss.dataset.value||ss.value||'',g=grupo(gs.value);ss.innerHTML='<option value="">Sin subgrupo</option>'+((g?.subgrupos||[]).map(x=>`<option value="${esc(x)}" ${sel===x?'selected':''}>${esc(x)}</option>`).join(''));delete ss.dataset.value;}
async function invGuardarProducto(id=''){
  if(!writable())return;
  const codigo=document.getElementById('ip-codigo').value.trim().toUpperCase(),descripcion=document.getElementById('ip-desc').value.trim().toUpperCase();
  if(!codigo||!descripcion){toast('Completa código y descripción','e');return;}
  if(inv().productos.some(p=>p.id!==id&&p.codigo===codigo)){toast('El código interno ya existe','e');return;}
  const ean=document.getElementById('ip-ean').value.trim();if(ean&&inv().productos.some(p=>p.id!==id&&p.ean===ean)){toast('El código EAN ya está asignado','e');return;}
  const cc=document.getElementById('ip-ccosto').value.trim();
  if(!cc){toast('Selecciona la cuenta de gasto/consumo','e');return;}
  if(!cuentaEsGasto(cc)){toast('La cuenta de gasto/consumo debe ser una cuenta de Gasto del plan de cuentas','e');return;}
  const respaldo=JSON.stringify(inv().productos);
  const viejo=id?prod(id):null,reg={...(viejo||{}),id:id||uid(),codigo,ean,descripcion,tipo:document.getElementById('ip-tipo').value,unidad:document.getElementById('ip-unidad').value,grupoId:document.getElementById('ip-grupo').value,subgrupo:document.getElementById('ip-sub').value,stockMinimo:num(document.getElementById('ip-min').value),cuentaInventario:CUENTA_INVENTARIO_FIJA,cuentaCosto:cc,aplicaIVA:document.getElementById('ip-iva').checked,manejaLotes:document.getElementById('ip-lotes').checked,inventariable:document.getElementById('ip-inv').checked,activo:document.getElementById('ip-activo').checked,actualizado:new Date().toISOString()};
  if(viejo)Object.assign(viejo,reg);else inv().productos.push(reg);
  try{await guardarLista('productos');invCerrarModal();renderInventario();toast('✅ Producto guardado');}catch(e){inv().productos=JSON.parse(respaldo);toast('❌ '+e.message,'e');}
}

function invDescargarPlantillaProductos(){
  if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada','e');return;}
  const hdr=['CÓDIGO','EAN','DESCRIPCIÓN','TIPO','UNIDAD','GRUPO','SUBGRUPO','STOCK MÍNIMO','CUENTA INVENTARIO','CUENTA COSTO/CONSUMO','AFECTO IVA','MANEJA LOTES','INVENTARIABLE','ACTIVO'];
  const ejemplo=['P000001','7801234567890','PRODUCTO DE EJEMPLO','MERCADERÍA','UN','MERCADERÍAS','GENERAL',0,'1109007','3101002','SÍ','NO','SÍ','SÍ'];
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([hdr,ejemplo,[]]);
  ws['!cols']=[{wch:15},{wch:18},{wch:38},{wch:22},{wch:12},{wch:24},{wch:24},{wch:15},{wch:20},{wch:23},{wch:14},{wch:15},{wch:16},{wch:12}];
  ws['!autofilter']={ref:`A1:N2`};XLSX.utils.book_append_sheet(wb,ws,'Productos');
  const instrucciones=[
    ['PLANTILLA DE PRODUCTOS — INSTRUCCIONES'],
    ['1. No cambies los encabezados de la hoja Productos. Código y descripción son obligatorios.'],
    ['2. La carga crea productos nuevos. Para modificar códigos existentes debes marcar “Actualizar productos existentes” al importar.'],
    ['3. Los grupos y subgrupos inexistentes se crearán automáticamente en la empresa activa.'],
    ['4. Valores lógicos admitidos: SÍ o NO. Stock mínimo puede ser cero.'],
    ['5. Esta plantilla no carga cantidades ni costos iniciales. Esos saldos se ingresan mediante un movimiento de inventario.'],
    ['6. La cuenta de inventario es siempre 1109007 para todos los productos: lo que traiga esa columna se ignora y se reemplaza automáticamente.'],
    ['6b. La cuenta de gasto/consumo es obligatoria y debe ser una cuenta de tipo Gasto del plan de cuentas de la empresa (columna “Catálogos” no la lista; revisa el Plan de Cuentas en el sistema).'],
    ['7. Tipos permitidos: MERCADERÍA, MATERIA PRIMA, PRODUCTO TERMINADO, INSUMO, ACTIVO FIJO, SERVICIO.'],
    ['8. Unidades permitidas: UN, KG, LT, MT, M2, M3, CAJA, SACO, PQT, GL.']
  ];
  const wi=XLSX.utils.aoa_to_sheet(instrucciones);wi['!cols']=[{wch:120}];XLSX.utils.book_append_sheet(wb,wi,'Instrucciones');
  const catalogo=[['TIPOS','UNIDADES','GRUPOS ACTUALES','SUBGRUPOS ACTUALES']];
  const tipos=['MERCADERÍA','MATERIA PRIMA','PRODUCTO TERMINADO','INSUMO','ACTIVO FIJO','SERVICIO'],unidades=['UN','KG','LT','MT','M2','M3','CAJA','SACO','PQT','GL'];
  const subgrupos=inv().grupos.flatMap(g=>(g.subgrupos||[]).map(s=>`${g.nombre} / ${s}`)),n=Math.max(tipos.length,unidades.length,inv().grupos.length,subgrupos.length);
  for(let i=0;i<n;i++)catalogo.push([tipos[i]||'',unidades[i]||'',inv().grupos[i]?.nombre||'',subgrupos[i]||'']);
  const wc=XLSX.utils.aoa_to_sheet(catalogo);wc['!cols']=[{wch:24},{wch:14},{wch:28},{wch:40}];XLSX.utils.book_append_sheet(wb,wc,'Catálogos');
  const empresa=String(S.empresa?.nombre||S.empresa?.razonSocial||'empresa').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g,'_').slice(0,40);
  XLSX.writeFile(wb,`plantilla_productos_${empresa}.xlsx`);toast('📥 Plantilla de productos descargada');
}

function invAbrirImportProductos(){
  if(!writable())return;productosImportDraft=null;
  modal(`${modalHdr('Importar productos desde Excel','La información se valida y previsualiza antes de guardar')}
    <div class="inv-alert"><strong>Importante:</strong> esta carga crea el catálogo, pero no modifica existencias ni costos.</div>
    <label class="check-line"><input type="checkbox" id="inv-prod-actualizar"> Actualizar productos cuyo código ya existe. Si no se marca, esas filas se omitirán.</label>
    <div class="inv-upload-box"><input id="inv-prod-file" type="file" accept=".xlsx,.xls" onchange="invLeerProductosExcel(event)"><span>Selecciona la plantilla Excel completada.</span></div>
    <div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-g" onclick="invDescargarPlantillaProductos()">📄 Descargar plantilla</button></div>`);
}

function datosValidacionImportProductos(actualizar){
  const usados=new Set();for(const m of inv().movimientos)for(const l of (m.lineas||[]))usados.add(String(l.productoId));
  return {productos:inv().productos,grupos:inv().grupos,actualizar,cuentaGastoExiste:cuentaEsGasto,cuentaInventarioFija:CUENTA_INVENTARIO_FIJA,productosConMovimientos:[...usados]};
}

async function invLeerProductosExcel(event){
  const file=event?.target?.files?.[0];if(!file)return;
  if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada','e');return;}
  try{
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',cellDates:false}),ws=wb.Sheets[wb.SheetNames[0]],filas=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    const actualizar=!!document.getElementById('inv-prod-actualizar')?.checked,resultado=prepararImportacionProductos(filas,datosValidacionImportProductos(actualizar));
    productosImportDraft={filasOriginales:filas,actualizar,nombre:file.name,...resultado};invRenderPreviewImportProductos();
  }catch(e){productosImportDraft=null;toast('❌ '+e.message,'e');}
}

function invRenderPreviewImportProductos(){
  const d=productosImportDraft;if(!d)return;const r=d.resumen;
  modal(`${modalHdr('Vista previa de productos',`${esc(d.nombre)} · ${d.actualizar?'creación y actualización':'sólo productos nuevos'}`)}
    <div class="inv-import-summary"><span class="inv-ok"><b>${r.nuevos}</b>Nuevos</span><span class="inv-info"><b>${r.actualiza}</b>Actualizan</span><span class="inv-muted"><b>${r.omite}</b>Omitidos</span><span class="inv-bad"><b>${r.errores}</b>Con error</span></div>
    ${r.errores?'<div class="inv-alert error"><strong>Corrige las filas con error en Excel y vuelve a cargar la plantilla.</strong> No se guardará ninguna fila mientras existan errores.</div>':''}
    <div class="inv-table-wrap inv-import-preview"><table class="inv-table"><thead><tr><th>Fila</th><th>Estado</th><th>Código</th><th>Descripción</th><th>Grupo / subgrupo</th><th>Tipo</th><th>U.M.</th><th>Validación</th></tr></thead><tbody>${d.filas.map(x=>`<tr><td class="num">${x.fila}</td><td><span class="badge inv-import-${x.estado.toLowerCase()}">${x.estado}</span></td><td class="mono">${esc(x.codigo||'—')}</td><td>${esc(x.producto.descripcion||'—')}</td><td>${esc(x.producto.grupoNombre||'—')}<small>${esc(x.producto.subgrupo||'')}</small></td><td>${esc(x.producto.tipo)}</td><td>${esc(x.producto.unidad)}</td><td>${x.errores.length?esc(x.errores.join(' · ')):'OK'}</td></tr>`).join('')}</tbody></table></div>
    <div class="modal-footer"><button class="btn btn-g" onclick="invAbrirImportProductos()">← Elegir otro archivo</button><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invAplicarImportProductos()" ${r.errores?'disabled':''}>Importar ${r.nuevos+r.actualiza} producto(s)</button></div>`);
}

async function invAplicarImportProductos(){
  if(!writable()||!productosImportDraft)return;const d=productosImportDraft;if(d.resumen.errores){toast('Corrige primero las filas con error','e');return;}
  try{
    await Promise.all([leerListaActual('productos'),leerListaActual('grupos'),leerListaActual('movimientos')]);
    const revision=prepararImportacionProductos(d.filasOriginales,datosValidacionImportProductos(d.actualizar));
    if(revision.resumen.errores)throw new Error('Los datos maestros cambiaron desde la vista previa. Revisa los errores y vuelve a importar.');
    const grupos=JSON.parse(JSON.stringify(inv().grupos)),productos=JSON.parse(JSON.stringify(inv().productos)),ahora=new Date().toISOString();
    for(const x of revision.filas){
      if(!['NUEVO','ACTUALIZA'].includes(x.estado))continue;const p=x.producto;
      let grupoId='';if(p.grupoNombre){let g=grupos.find(y=>String(y.nombre).toUpperCase()===p.grupoNombre);if(!g){g={id:uid(),nombre:p.grupoNombre,subgrupos:[],activo:true,actualizado:ahora};grupos.push(g);}if(p.subgrupo&&!g.subgrupos.some(s=>String(s).toUpperCase()===p.subgrupo))g.subgrupos.push(p.subgrupo);g.subgrupos.sort();g.actualizado=ahora;grupoId=g.id;}
      const reg={...p,grupoId,actualizado:ahora};delete reg.grupoNombre;
      if(x.estado==='ACTUALIZA'){const i=productos.findIndex(y=>y.id===p.id);if(i>=0)productos[i]={...productos[i],...reg};}
      else productos.push({...reg,id:uid(),creado:ahora,creadoPor:AUTH.user?.email||''});
    }
    const wr=await window.storage.setMany([{key:K.grupos,value:JSON.stringify(grupos)},{key:K.productos,value:JSON.stringify(productos)}]);if(!wr||wr.ok===false)throw new Error(wr?.detalle||wr?.motivo||'No se pudo guardar la importación');
    inv().grupos=grupos;inv().productos=productos;logCambio('Importó productos desde Excel',{entidad:'inventario-productos',id:'carga-'+Date.now(),meta:{detalle:`${revision.resumen.nuevos} nuevos · ${revision.resumen.actualiza} actualizados · archivo ${d.nombre}`}});
    productosImportDraft=null;invCerrarModal();renderInventario();toast(`✅ ${revision.resumen.nuevos} producto(s) creados · ${revision.resumen.actualiza} actualizado(s)`);
  }catch(e){toast('❌ '+e.message,'e');}
}

function nuevoFolio(tipo){const p={ENTRADA:'ENT',SALIDA:'SAL',TRASPASO:'TRS',AJUSTE_ENTRADA:'AJE',AJUSTE_SALIDA:'AJS',TOMA:'TOMA',OC:'OC',RECEPCION:'REC'}[tipo]||'MOV',d=new Date(),stamp=d.toISOString().replace(/[-:TZ.]/g,'').slice(2,14),rnd=Math.random().toString(36).slice(2,5).toUpperCase();return `${p}-${stamp}-${rnd}`;}
function invNuevoMovimiento(){
  if(!writable())return;if(!inv().bodegas.some(b=>b.activo!==false)){toast('Primero crea una bodega activa','e');UI.tab='bodegas';renderInventario();return;}if(!inv().productos.some(p=>p.activo!==false&&p.inventariable!==false)){toast('Primero crea un producto inventariable','e');UI.tab='productos';renderInventario();return;}
  movDraft={tipo:'ENTRADA',folio:nuevoFolio('ENTRADA'),fecha:hoy(),motivo:'COMPRA',bodegaOrigenId:'',bodegaDestinoId:inv().bodegas.find(b=>b.activo!==false)?.id||'',tercero:'',documentoTipo:'SIN DOCUMENTO',documentoNumero:'',proveedorRut:'',proveedorNombre:'',ordenCompraId:'',centroCosto:'',observaciones:'',lineas:[{id:uid(),productoId:'',cantidad:'',costoUnitario:'',lote:'',fechaVencimiento:''}]};invRenderMovModal();
}
function invEditarMovimiento(id){
  if(!writable())return;
  const m=inv().movimientos.find(x=>x.id===id);
  if(!m||m.estado==='ANULADO')return;
  if(m.recepcionId){toast('Esta entrada proviene de una recepción de compra. Edítala desde la orden de compra.','e');return;}
  if(m.tomaId){toast('Este ajuste proviene de una toma física. No se edita directamente.','e');return;}
  movDraft={editId:m.id,tipo:m.tipo,folio:m.folio,fecha:m.fecha,motivo:m.motivo,bodegaOrigenId:m.bodegaOrigenId||'',bodegaDestinoId:m.bodegaDestinoId||'',tercero:m.tercero||'',documentoTipo:m.documentoTipo||(m.documento?'OTRO':'SIN DOCUMENTO'),documentoNumero:m.documentoNumero||m.documento||'',proveedorRut:m.proveedorRut||'',proveedorNombre:m.proveedorNombre||'',ordenCompraId:m.ordenCompraId||'',centroCosto:m.centroCosto||'',observaciones:m.observaciones||'',lineas:(m.lineas||[]).map(l=>({...l}))};
  invRenderMovModal();
}
function motivos(tipo){return tipo==='ENTRADA'?['COMPRA','DEVOLUCIÓN','PRODUCCIÓN','SALDO INICIAL','OTRA ENTRADA']:tipo==='SALIDA'?['CONSUMO','VENTA','MERMA','DEVOLUCIÓN A PROVEEDOR','OTRA SALIDA']:['TRASPASO ENTRE BODEGAS'];}
const DOC_TIPOS_MOV=['SIN DOCUMENTO','GUÍA DE DESPACHO','FACTURA AFECTA','FACTURA EXENTA','BOLETA','ORDEN DE COMPRA','ORDEN DE TRABAJO','SOLICITUD INTERNA','ACTA DE TOMA FÍSICA','OTRO'];
const DOC_TIPOS_PROVEEDOR=['GUÍA DE DESPACHO','FACTURA AFECTA','FACTURA EXENTA']; // exigen asociar proveedor/OC en Movimientos
function ocsAbiertasProveedor(rut){return rut?inv().ordenesCompra.filter(o=>['EMITIDA','PARCIAL'].includes(o.estado)&&String(o.proveedorRut)===String(rut)):[];}
function productosConOCAbierta(rut){const set=new Set();ocsAbiertasProveedor(rut).forEach(o=>(o.lineas||[]).forEach(l=>set.add(String(l.productoId))));return set;}
function invRenderMovModal(){
  const d=movDraft;if(!d)return;const esEnt=d.tipo==='ENTRADA',esSal=d.tipo==='SALIDA',esTra=d.tipo==='TRASPASO';
  modal(`${modalHdr(d.editId?'Editar movimiento':'Nuevo movimiento',d.editId?'Los cambios se reflejan de inmediato en el stock y el PPP recalculados':'El stock y el PPP se recalculan desde este libro cronológico')}
  <div style="font-size:11px;color:var(--mt);margin:-6px 0 12px;font-family:var(--mono)">Folio interno: <strong style="color:var(--tx)">${esc(d.folio)}</strong> <span style="font-family:var(--sans)">— ${d.editId?'se conserva a través de las ediciones':'asignado al abrir este formulario, para trazabilidad del movimiento'}</span></div>
  <div class="inv-form-grid"><label>Tipo<select ${d.editId?'disabled':''} onchange="invMovCampo('tipo',this.value,true)">${['ENTRADA','SALIDA','TRASPASO'].map(x=>`<option ${d.tipo===x?'selected':''}>${x}</option>`).join('')}</select>${d.editId?'<small>No editable</small>':''}</label><label>Fecha<input type="date" value="${esc(d.fecha)}" onchange="invMovCampo('fecha',this.value)"></label>
  <label>Motivo<select onchange="invMovCampo('motivo',this.value)">${motivos(d.tipo).map(x=>`<option ${d.motivo===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Centro de costo<select onchange="invMovCampo('centroCosto',this.value)"><option value="">Sin centro</option>${(S.centros||[]).filter(x=>x.estado!=='inactivo').map(x=>`<option value="${esc(x.codigo||x.id)}" ${d.centroCosto===(x.codigo||x.id)?'selected':''}>${esc(x.codigo||'')} · ${esc(x.nombre||'')}</option>`).join('')}</select></label>
  ${!esEnt?`<label>Bodega origen<select onchange="invMovCampo('bodegaOrigenId',this.value,true)">${opcionesBodega(d.bodegaOrigenId)}</select></label>`:''}${!esSal?`<label>Bodega destino<select onchange="invMovCampo('bodegaDestinoId',this.value)">${opcionesBodega(d.bodegaDestinoId)}</select></label>`:''}
  <label>Tercero / responsable<input value="${esc(d.tercero)}" onchange="invMovCampo('tercero',this.value)"></label><label>Tipo de documento<select onchange="invMovCampo('documentoTipo',this.value,true)">${DOC_TIPOS_MOV.map(x=>`<option ${d.documentoTipo===x?'selected':''}>${x}</option>`).join('')}</select></label>
  ${d.documentoTipo&&d.documentoTipo!=='SIN DOCUMENTO'?`<label>N° de documento<input value="${esc(d.documentoNumero)}" onchange="invMovCampo('documentoNumero',this.value)" placeholder="N°…"></label>`:''}
  ${esEnt&&DOC_TIPOS_PROVEEDOR.includes(d.documentoTipo)?`<label>Proveedor${inputAux({id:'mov-proveedor',tipo:'proveedor',value:d.proveedorRut,onPick:"invMovProveedor('%RUT%')",placeholder:'RUT o nombre del proveedor…'})}${d.proveedorNombre?`<small>${esc(d.proveedorNombre)}</small>`:''}</label>
  <label>Orden de compra<select onchange="invMovCampo('ordenCompraId',this.value,true)" ${!d.proveedorRut?'disabled':''}><option value="">Sin orden de compra</option>${ocsAbiertasProveedor(d.proveedorRut).map(o=>{const r=resumenRecepcionOC(o,inv().recepciones);return `<option value="${o.id}" ${d.ordenCompraId===o.id?'selected':''}>${esc(o.folio)} · ${fechaCorta(o.fecha)} · pendiente ${fmt(r.pendiente)}</option>`;}).join('')}</select>${!d.proveedorRut?'<small>Selecciona primero el proveedor</small>':''}</label>
  ${d.ordenCompraId?renderPendienteOC(d.ordenCompraId):''}`:''}
  <label class="span2">Observaciones<input value="${esc(d.observaciones)}" onchange="invMovCampo('observaciones',this.value)"></label></div>
  <div class="inv-lines"><div class="inv-card-title">Detalle</div>${d.lineas.map((l,i)=>renderMovLinea(l,i,d)).join('')}<button class="btn btn-g" onclick="invMovAgregarLinea()">＋ Agregar línea</button></div>
  <div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cancelar</button><button class="btn btn-p" onclick="invGuardarMovimiento()">${d.editId?'Guardar cambios':'Guardar movimiento'}</button></div>`);
}
function renderMovLinea(l,i,d){
  const p=prod(l.productoId),calc=calculo(),salida=d.tipo!=='ENTRADA';
  const lotes=p?.manejaLotes&&salida?calc.lotes.filter(x=>x.productoId===p.id&&x.bodegaId===d.bodegaOrigenId&&x.cantidad>0):[];
  const st=p&&d.bodegaOrigenId?calc.stock.find(x=>x.productoId===p.id&&x.bodegaId===d.bodegaOrigenId):null;
  const totalLinea=d.tipo==='ENTRADA'&&l.cantidad!==''&&l.costoUnitario!==''?mon(num(l.cantidad)*num(l.costoUnitario)):'';
  return `<div class="inv-line"><label>Producto<select onchange="invMovLineaCampo(${i},'productoId',this.value,true)">${opcionesProducto(l.productoId)}</select>${p&&salida?`<small>Disponible: ${fmt(st?.cantidad||0)} ${esc(p.unidad)}</small>`:''}</label><label>Cantidad<input type="number" min="0" step="any" value="${esc(l.cantidad)}" onchange="invMovLineaCampo(${i},'cantidad',this.value,true)"></label>${d.tipo==='ENTRADA'?`<label>Costo unitario neto<input type="text" inputmode="numeric" class="money-input" value="${esc(l.costoUnitario)}" onchange="invMovLineaCampo(${i},'costoUnitario',pn(this.value),true)"></label>`:''}${p?.manejaLotes?(salida?`<label>Lote<select onchange="invMovLineaCampo(${i},'lote',this.value,true)"><option value="">Seleccione lote…</option>${lotes.map(x=>`<option value="${esc(x.lote)}" ${l.lote===x.lote?'selected':''}>${esc(x.lote)} · ${fmt(x.cantidad)} · vence ${fechaCorta(x.fechaVencimiento)}</option>`).join('')}</select></label>`:`<label>Lote<input value="${esc(l.lote)}" onchange="invMovLineaCampo(${i},'lote',this.value.toUpperCase())"></label><label>Vencimiento<input type="date" value="${esc(l.fechaVencimiento)}" onchange="invMovLineaCampo(${i},'fechaVencimiento',this.value)"></label>`):''}<button class="inv-line-del" onclick="invMovQuitarLinea(${i})" title="Quitar">×</button>${totalLinea?`<div style="grid-column:1/-1;text-align:right;font-size:11px;color:var(--mt);margin-top:-4px">Total neto línea: <strong style="color:var(--tx)">${totalLinea}</strong></div>`:''}</div>`;
}
function renderPendienteOC(ocId){
  const o=inv().ordenesCompra.find(x=>x.id===ocId);if(!o)return'';
  const r=resumenRecepcionOC(o,inv().recepciones),pend=r.lineas.filter(l=>l.pendiente>0);
  if(!pend.length)return'<div class="inv-nota span2" style="grid-column:1/-1">Esta orden ya no tiene saldo pendiente por recibir.</div>';
  return `<div class="inv-nota span2" style="grid-column:1/-1"><strong>Pendiente por recibir de ${esc(o.folio)}:</strong> ${pend.map(l=>`${esc(nombreProducto(l.productoId))} (${fmt(l.pendiente)})`).join(' · ')}</div>`;
}
function invMovCampo(campo,valor,r=false){if(!movDraft)return;movDraft[campo]=valor;if(campo==='tipo'){movDraft.motivo=motivos(valor)[0];if(!movDraft.editId)movDraft.folio=nuevoFolio(valor);movDraft.lineas.forEach(l=>{l.lote='';l.fechaVencimiento='';});}if(campo==='documentoTipo'&&valor==='SIN DOCUMENTO')movDraft.documentoNumero='';if(r)invRenderMovModal();}
function invMovProveedor(rut){if(!movDraft)return;const p=proveedorOC(rut);movDraft.proveedorRut=rut;movDraft.proveedorNombre=p?.razonSocial||'';movDraft.ordenCompraId='';invRenderMovModal();}
function invMovLineaCampo(i,campo,valor,r=false){if(!movDraft?.lineas[i])return;movDraft.lineas[i][campo]=valor;if(campo==='productoId'){movDraft.lineas[i].lote='';movDraft.lineas[i].fechaVencimiento='';}if(campo==='lote'&&movDraft.tipo!=='ENTRADA'){const lt=calculo().lotes.find(x=>x.productoId===movDraft.lineas[i].productoId&&x.bodegaId===movDraft.bodegaOrigenId&&x.lote===valor);movDraft.lineas[i].fechaVencimiento=lt?.fechaVencimiento||'';}if(r)invRenderMovModal();}
function invMovAgregarLinea(){movDraft.lineas.push({id:uid(),productoId:'',cantidad:'',costoUnitario:'',lote:'',fechaVencimiento:''});invRenderMovModal();}
function invMovQuitarLinea(i){if(movDraft.lineas.length===1){movDraft.lineas[0]={id:uid(),productoId:'',cantidad:'',costoUnitario:'',lote:'',fechaVencimiento:''};}else movDraft.lineas.splice(i,1);invRenderMovModal();}
async function invGuardarMovimiento(){
  if(!writable()||!movDraft)return;
  if(movDraft.documentoTipo&&movDraft.documentoTipo!=='SIN DOCUMENTO'&&!String(movDraft.documentoNumero||'').trim()){toast('Indica el N° de documento','e');return;}
  if(movDraft.tipo==='ENTRADA'&&DOC_TIPOS_PROVEEDOR.includes(movDraft.documentoTipo)){
    if(!movDraft.proveedorRut){toast('Selecciona el proveedor','e');return;}
    if(!movDraft.ordenCompraId){
      const productosLinea=new Set(movDraft.lineas.filter(l=>l.productoId).map(l=>String(l.productoId)));
      const conOC=productosConOCAbierta(movDraft.proveedorRut);
      const conflicto=[...productosLinea].filter(pid=>conOC.has(pid));
      if(conflicto.length){toast('❌ '+conflicto.map(pid=>nombreProducto(pid)).join(', ')+' tiene una orden de compra emitida con este proveedor. Selecciónala o recibe desde Órdenes de compra.','e');return;}
    }
  }
  const documento=(movDraft.documentoTipo&&movDraft.documentoTipo!=='SIN DOCUMENTO')?`${movDraft.documentoTipo} ${String(movDraft.documentoNumero).trim().toUpperCase()}`:'';
  const documentoNumero=String(movDraft.documentoNumero||'').trim().toUpperCase();
  const lineasFinal=movDraft.lineas.map(l=>({...l,cantidad:num(l.cantidad),costoUnitario:num(l.costoUnitario),lote:String(l.lote||'').trim().toUpperCase()}));
  const proveedorRut=DOC_TIPOS_PROVEEDOR.includes(movDraft.documentoTipo)?movDraft.proveedorRut:'';
  const proveedorNombre=DOC_TIPOS_PROVEEDOR.includes(movDraft.documentoTipo)?movDraft.proveedorNombre:'';
  const ordenCompraId=DOC_TIPOS_PROVEEDOR.includes(movDraft.documentoTipo)?movDraft.ordenCompraId:'';

  if(movDraft.editId){
    const idx=inv().movimientos.findIndex(x=>x.id===movDraft.editId),original=idx>=0?inv().movimientos[idx]:null;
    if(!original||original.estado==='ANULADO'){toast('El movimiento ya no está disponible para editar','e');invCerrarModal();renderInventario();return;}
    const now=new Date().toISOString();
    const m={...original,fecha:movDraft.fecha,motivo:movDraft.motivo,bodegaOrigenId:movDraft.bodegaOrigenId,bodegaDestinoId:movDraft.bodegaDestinoId,tercero:movDraft.tercero,documentoTipo:movDraft.documentoTipo,documentoNumero,documento,proveedorRut,proveedorNombre,ordenCompraId,centroCosto:movDraft.centroCosto,observaciones:movDraft.observaciones,lineas:lineasFinal,editadoEn:now,editadoPor:AUTH.user?.email||''};
    const otrosMovimientos=inv().movimientos.filter(x=>x.id!==movDraft.editId);
    const v=validarMovimiento(m,{productos:inv().productos,bodegas:inv().bodegas,movimientos:otrosMovimientos});
    if(!v.ok){toast('❌ '+v.errores[0],'e');return;}
    m.lineas=v.lineas;
    // Red de seguridad adicional: validarMovimiento sólo revisa suficiencia de stock
    // para salidas/traspasos. Al EDITAR una entrada (p.ej. reducir su cantidad) el
    // problema puede aparecer en una salida posterior ya registrada, así que se
    // recalcula todo el libro con el cambio aplicado antes de guardarlo.
    const calcHip=recalcularInventario([...otrosMovimientos,m],inv().productos);
    const negativos=calcHip.errores.filter(e=>e.tipo==='STOCK_NEGATIVO');
    if(negativos.length){toast('❌ Esta edición dejaría stock negativo: '+negativos.slice(0,2).map(e=>e.mensaje).join(' · '),'e');return;}
    const respaldo=inv().movimientos,movs=respaldo.slice();movs[idx]=m;inv().movimientos=movs;
    try{await guardarLista('movimientos');logCambio('Editó movimiento de inventario',{entidad:'inventario-movimiento',id:m.id,antes:original,despues:m,meta:{detalle:m.folio}});movDraft=null;invCerrarModal();renderInventario();toast('✅ '+m.folio+' actualizado');}catch(e){inv().movimientos=respaldo;toast('❌ '+e.message,'e');}
    return;
  }

  const now=new Date().toISOString(),m={tipo:movDraft.tipo,folio:movDraft.folio||nuevoFolio(movDraft.tipo),fecha:movDraft.fecha,motivo:movDraft.motivo,bodegaOrigenId:movDraft.bodegaOrigenId,bodegaDestinoId:movDraft.bodegaDestinoId,tercero:movDraft.tercero,documentoTipo:movDraft.documentoTipo,documentoNumero,documento,proveedorRut,proveedorNombre,ordenCompraId,centroCosto:movDraft.centroCosto,observaciones:movDraft.observaciones,id:uid(),estado:'VIGENTE',creado:now,creadoPor:AUTH.user?.email||'',lineas:lineasFinal};
  const v=validarMovimiento(m,{productos:inv().productos,bodegas:inv().bodegas,movimientos:inv().movimientos});
  if(!v.ok){toast('❌ '+v.errores[0],'e');return;}
  m.lineas=v.lineas;inv().movimientos.push(m);
  try{await guardarLista('movimientos');logCambio('Creó movimiento de inventario',{entidad:'inventario-movimiento',id:m.id,despues:m,meta:{detalle:m.folio}});invCerrarModal();UI.tab='movimientos';renderInventario();toast('✅ Movimiento '+m.folio+' registrado');}catch(e){inv().movimientos=inv().movimientos.filter(x=>x.id!==m.id);toast('❌ '+e.message,'e');}
}

function invVerMovimiento(id){
  const m=inv().movimientos.find(x=>x.id===id);if(!m)return;const vals=calculo().valorizaciones.get(String(m.id))||[];
  modal(`${modalHdr('Movimiento '+esc(m.folio),`${fechaCorta(m.fecha)} · ${esc(m.tipo)} · ${esc(m.estado)}`)}${m.estado==='ANULADO'?`<div class="inv-alert error"><strong>ANULADO:</strong> ${esc(m.motivoAnulacion||'Sin detalle')}</div>`:''}${m.estado!=='ANULADO'&&(m.recepcionId||m.tomaId)?`<div class="inv-alert"><strong>Movimiento protegido:</strong> ${m.recepcionId?'se administra desde la recepción de su orden de compra.':'se administra desde su toma física de inventario.'}</div>`:''}${m.editadoEn?`<div class="inv-nota" style="margin-bottom:10px">✏️ Editado el ${fechaCorta(m.editadoEn)} por ${esc(m.editadoPor||'—')}</div>`:''}<div class="inv-doc-grid"><div><small>Motivo</small><strong>${esc(m.motivo||'—')}</strong></div><div><small>Documento</small><strong>${esc(m.documento||'—')}</strong></div>${m.proveedorRut?`<div><small>Proveedor</small><strong>${esc(m.proveedorNombre||m.proveedorRut)}</strong></div>`:''}${m.ordenCompraId?`<div><small>Orden de compra</small><strong>${esc(inv().ordenesCompra.find(o=>o.id===m.ordenCompraId)?.folio||m.ordenCompraId)}</strong></div>`:''}<div><small>Origen</small><strong>${esc(nombreBodega(m.bodegaOrigenId))}</strong></div><div><small>Destino</small><strong>${esc(nombreBodega(m.bodegaDestinoId))}</strong></div><div><small>Tercero</small><strong>${esc(m.tercero||'—')}</strong></div><div><small>Centro de costo</small><strong>${esc(m.centroCosto||'—')}</strong></div></div><div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th>Lote</th><th>Vencimiento</th><th class="num">Costo aplicado</th><th class="num">Valor</th></tr></thead><tbody>${(m.lineas||[]).map((l,i)=>{const v=vals[i]||{};return `<tr><td>${esc(nombreProducto(l.productoId))}</td><td class="num">${fmt(l.cantidad)}</td><td class="mono">${esc(l.lote||'—')}</td><td>${fechaCorta(l.fechaVencimiento)}</td><td class="num">${mon(v.costoAplicado??l.costoUnitario)}</td><td class="num">${mon(v.valorAplicado??num(l.cantidad)*num(l.costoUnitario))}</td></tr>`;}).join('')}</tbody></table></div>${m.observaciones?`<div class="inv-nota">${esc(m.observaciones)}</div>`:''}<div class="modal-footer"><button class="btn btn-g" onclick="invCerrarModal()">Cerrar</button>${writable()&&m.estado!=='ANULADO'&&!m.recepcionId&&!m.tomaId?`<button class="btn btn-i" onclick="invEditarMovimiento('${m.id}')">✏️ Editar</button>`:''}${writable()&&m.estado!=='ANULADO'&&!m.recepcionId?`<button class="btn btn-r" onclick="invAnularMovimiento('${m.id}')">Anular movimiento</button>`:''}</div>`);
}
async function invAnularMovimiento(id){
  if(!writable())return;const m=inv().movimientos.find(x=>x.id===id);if(!m||m.estado==='ANULADO')return;if(m.recepcionId){toast('Esta entrada proviene de una recepción. Anúlala desde la orden de compra para conservar la trazabilidad.','e');return;}const motivo=prompt('Motivo obligatorio de la anulación:');if(motivo===null)return;if(!motivo.trim()){toast('Debes indicar el motivo','e');return;}
  const antes={...m};m.estado='ANULADO';m.motivoAnulacion=motivo.trim();m.anulado=new Date().toISOString();m.anuladoPor=AUTH.user?.email||'';
  try{await guardarLista('movimientos');logCambio('Anuló movimiento de inventario',{entidad:'inventario-movimiento',id:m.id,antes,despues:m,meta:{detalle:m.folio}});invCerrarModal();renderInventario();toast('✅ Movimiento anulado; stock reconstruido');}catch(e){Object.assign(m,antes);toast('❌ '+e.message,'e');}
}

export {
  cargarInventario,renderInventario,invSetTab,invSetFiltro,invCerrarModal,
  invAbrirGrupo,invGuardarGrupo,invAbrirBodega,invGuardarBodega,
  invAbrirProducto,invActualizarSubgrupos,invGuardarProducto,
  invDescargarPlantillaProductos,invAbrirImportProductos,invLeerProductosExcel,invAplicarImportProductos,
  invNuevoMovimiento,invMovCampo,invMovLineaCampo,invMovAgregarLinea,invMovQuitarLinea,
  invGuardarMovimiento,invVerMovimiento,invAnularMovimiento,invEditarMovimiento,
  invNuevaToma,invCrearToma,invAbrirToma,invVolverTomas,invSetFisicoToma,invSetCostoToma,
  invAgregarLineaToma,invTomaProductoCambio,invGuardarLineaToma,invCerrarToma,
  invDevolverToma,invRechazarToma,invAutorizarToma
  ,invNuevaOC,invEditarOC,invOCCampo,invOCLineaCampo,invOCAgregarLinea,invOCQuitarLinea,invGuardarOC,
  invVerOC,invVolverOC,invEmitirOC,invAnularOC,invCerrarSaldoOC,invAbrirRecepcion,invRecCampo,invRecLineaCampo,invRecAgregarLote,invRecQuitarLinea,
  invGuardarRecepcion,invAnularRecepcion,invAbrirVincularFactura,invVincularFactura
};
