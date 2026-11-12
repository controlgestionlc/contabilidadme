/* ═══════════════════════════════════════════════════════════════
   MÓDULO ÓRDENES DE COMPRA (OC) — SCI La Cabaña
   - Documento de compra (NO afecta stock; el ingreso real se registra
     después como movimiento de entrada tipo COMPRA).
   - Folio autoincremental formato OC-00001 (contador en config.counters).
   - Store IndexedDB 'ordenescompra' (key 'id'), sincroniza vía sci/main.
   - Impresión con membrete (logo + datos de empresa desde config).
   ═══════════════════════════════════════════════════════════════ */

var ocFilter = { search:'', estado:'' };
var ocDraft = null;

var OC_FORMAS_PAGO = ['CONTADO','TRANSFERENCIA','CREDITO 30 DIAS','CREDITO 60 DIAS','CREDITO 90 DIAS','CHEQUE','OTRO'];
var OC_IVA_PCT = 19;

function ocAll(){ return STATE.cache.ordenescompra || []; }
function ocGet(id){ return ocAll().find(function(o){ return o.id===id; }); }
function ocProv(cod){ return (STATE.cache.providers||[]).find(function(p){ return p.codigo===cod; }); }
function ocCC(cod){ return (STATE.cache.costCenters||[]).find(function(c){ return c.codigo===cod; }); }
function ocCCLabel(cod){
  var c = ocCC(cod);
  return c ? (c.codigo+' · '+(c.descripcion||c.nombre||'')) : (cod||'-');
}

/* ── Folio autoincremental OC-00001 ── */
async function ocNextFolio(){
  var c = STATE.cache.config.counters || {key:'counters'};
  // Protección contra desync: considerar también el folio máximo existente
  var maxExist = 0;
  ocAll().forEach(function(o){
    var m = /^OC-(\d+)$/.exec(o.folio||'');
    if(m) maxExist = Math.max(maxExist, parseInt(m[1],10));
  });
  var n = Math.max(c.OC||0, maxExist) + 1;
  c.OC = n;
  await dbPut('config', c);
  STATE.cache.config.counters = c;
  return 'OC-' + String(n).padStart(5,'0');
}

/* ═══════════════ LISTADO ═══════════════ */
function renderOrdenesCompra(main){
  var rows = ocAll().slice();
  if(ocFilter.search){
    var s = ocFilter.search.toLowerCase();
    rows = rows.filter(function(o){
      return ((o.folio||'')+' '+(o.proveedorNombre||'')+' '+(o.cotizacion||'')+' '+(o.entregarEn||'')).toLowerCase().includes(s);
    });
  }
  if(ocFilter.estado) rows = rows.filter(function(o){ return (o.estado||'EMITIDA')===ocFilter.estado; });
  rows.sort(function(a,b){ return (b.folio||'').localeCompare(a.folio||''); });

  main.innerHTML = `
    <div class="page-header">
      <div><h1>🧾 Órdenes de Compra</h1><div class="page-sub">Documentos de compra a proveedores (no afectan stock)</div></div>
      <div style="display:flex;gap:10px">
        ${can('movimientos.crear')?`<button class="btn btn-primary" onclick="nuevaOrdenCompra()">+ Nueva Orden de Compra</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filter-bar" style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;gap:10px;flex-wrap:wrap">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar</label><input type="text" id="ocFltSearch" value="${escapeHtml(ocFilter.search)}" placeholder="Folio, proveedor, cotización..."></div>
        <div class="form-field"><label>Estado</label><select id="ocFltEstado"><option value="">Todos</option><option value="EMITIDA" ${ocFilter.estado==='EMITIDA'?'selected':''}>Emitidas</option><option value="ANULADA" ${ocFilter.estado==='ANULADA'?'selected':''}>Anuladas</option></select></div>
      </div>
      <div id="ocTable"></div>
    </div>`;
  ['ocFltSearch','ocFltEstado'].forEach(function(id){
    document.getElementById(id).addEventListener('input', function(){
      ocFilter.search = document.getElementById('ocFltSearch').value;
      ocFilter.estado = document.getElementById('ocFltEstado').value;
      renderOrdenesCompra(main);
    });
  });
  ocRenderTabla(rows);
}

function ocRenderTabla(rows){
  var el = document.getElementById('ocTable');
  if(!el) return;
  if(!rows.length){ el.innerHTML = '<div class="empty-state" style="padding:36px;text-align:center;color:var(--mu)">No hay órdenes de compra</div>'; return; }
  el.innerHTML = `<div style="overflow-x:auto"><table class="data" style="width:100%">
    <thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>C. Costo</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${rows.map(function(o){
      var anulada = (o.estado==='ANULADA');
      return `<tr style="cursor:pointer;${anulada?'opacity:.55':''}" onclick="verOrdenCompra('${o.id}')">
        <td class="mono"><strong>${escapeHtml(o.folio||'')}</strong></td>
        <td>${fmtDateOnly(o.fecha)}</td>
        <td>${escapeHtml(o.proveedorNombre||'-')}</td>
        <td>${escapeHtml(ocCCLabel(o.ccDefault))}</td>
        <td class="num"><strong>${fmtMon(o.total||0)}</strong></td>
        <td>${anulada?'<span class="badge badge-danger">ANULADA</span>':'<span class="badge badge-success">EMITIDA</span>'}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="ocImprimir('${o.id}')">🖨️</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ═══════════════ FORMULARIO ═══════════════ */
function nuevaOrdenCompra(){
  if(!can('movimientos.crear')){ toast('Sin permiso','No puede crear órdenes de compra','error'); return; }
  ocDraft = {
    id:null, folio:null, fecha:new Date().toISOString().slice(0,10),
    proveedorCodigo:'', contacto:'', cotizacion:'', formaPago:'',
    ccDefault:'', entregarEn:'', notas:'', lineas:[{}]
  };
  navigate('ordenCompraForm');
}
function editOrdenCompra(id){
  if(!can('movimientos.crear')){ toast('Sin permiso','','error'); return; }
  var o = ocGet(id); if(!o){ toast('No encontrada','','error'); return; }
  if(o.estado==='ANULADA'){ toast('Orden anulada','No se puede editar una OC anulada','warning'); return; }
  ocDraft = JSON.parse(JSON.stringify(o));
  if(!ocDraft.lineas || !ocDraft.lineas.length) ocDraft.lineas=[{}];
  closeModal();
  navigate('ordenCompraForm');
}

function renderOrdenCompraForm(main){
  if(!ocDraft){ nuevaOrdenCompra(); return; }
  var provs = (STATE.cache.providers||[]).slice().sort(function(a,b){ return (a.razonSocial||'').localeCompare(b.razonSocial||''); });
  var ccs = (STATE.cache.costCenters||[]).filter(function(c){ return c.activo!==false; })
    .slice().sort(function(a,b){ return (a.codigo||'').localeCompare(b.codigo||''); });

  main.innerHTML = `
    <div class="page-header">
      <div><h1>🧾 ${ocDraft.id?('Editar '+(ocDraft.folio||'Orden de Compra')):'Nueva Orden de Compra'}</h1>
      <div class="page-sub">${ocDraft.id?'Modificación de OC emitida':'Folio automático: se asignará al guardar (formato OC-00001)'}</div></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" onclick="navigate('ordenesCompra')">← Volver</button>
        <button class="btn btn-primary" onclick="guardarOrdenCompra()">💾 ${ocDraft.id?'Guardar cambios':'Emitir Orden'}</button>
      </div>
    </div>
    <div class="card" style="padding:18px">
      <div class="form-grid">
        <div class="form-field required"><label>Fecha</label><input type="date" id="ocFecha" value="${escapeHtml(ocDraft.fecha||'')}"></div>
        <div class="form-field"><label>Folio</label><input type="text" value="${escapeHtml(ocDraft.folio||'(automático)')}" readonly><div class="hint">${ocDraft.folio?'No editable':'Autoincremental OC-00001'}</div></div>
        <div class="form-field span-2 required"><label>Proveedor</label>
          <select id="ocProv" onchange="ocSetProveedor(this.value)">
            <option value="">— Seleccione proveedor —</option>
            ${provs.map(function(p){ return `<option value="${escapeHtml(p.codigo)}" ${ocDraft.proveedorCodigo===p.codigo?'selected':''}>${escapeHtml(p.razonSocial)}${p.rut?' · '+escapeHtml(p.rut):''}</option>`; }).join('')}
          </select>
        </div>
        <div class="form-field"><label>Contacto</label><input type="text" id="ocContacto" value="${escapeHtml(ocDraft.contacto||'')}" placeholder="Contacto del proveedor"></div>
        <div class="form-field"><label>Cotización</label><input type="text" id="ocCotiz" value="${escapeHtml(ocDraft.cotizacion||'')}" placeholder="N° o referencia de cotización"></div>
        <div class="form-field"><label>Forma de pago</label>
          <select id="ocFormaPago">
            <option value="">— Seleccione —</option>
            ${OC_FORMAS_PAGO.map(function(f){ return `<option value="${f}" ${ocDraft.formaPago===f?'selected':''}>${f}</option>`; }).join('')}
          </select>
        </div>
        <div class="form-field"><label>Centro de Costo (predeterminado)</label>
          <select id="ocCCDef" onchange="ocSetCCDefault(this.value)">
            <option value="">— Sin CC por defecto —</option>
            ${ccs.map(function(c){ return `<option value="${escapeHtml(c.codigo)}" ${ocDraft.ccDefault===c.codigo?'selected':''}>${escapeHtml(c.codigo)} · ${escapeHtml(c.descripcion||c.nombre||'')}</option>`; }).join('')}
          </select>
          <div class="hint">Se aplica a cada producto; se puede cambiar línea a línea</div>
        </div>
        <div class="form-field span-2"><label>Entregar en</label><input type="text" id="ocEntregar" value="${escapeHtml(ocDraft.entregarEn||'')}" placeholder="Dirección o lugar de entrega"></div>
        <div class="form-field span-2"><label>Notas</label><textarea id="ocNotas" rows="2" placeholder="Observaciones para el proveedor">${escapeHtml(ocDraft.notas||'')}</textarea></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;justify-content:space-between;align-items:center">
        <strong>Productos</strong>
        <button class="btn btn-secondary btn-sm" onclick="ocAddLinea()">+ Agregar línea</button>
      </div>
      <div id="ocLineasWrap"></div>
    </div>`;
  ocRenderLineas();
}

function ocSetProveedor(cod){
  ocDraft.proveedorCodigo = cod;
  var p = ocProv(cod);
  if(p && p.contacto){
    var inp = document.getElementById('ocContacto');
    if(inp && !inp.value.trim()){ inp.value = p.contacto; }
  }
}
function ocSetCCDefault(cod){
  var prev = ocDraft.ccDefault||'';
  ocDraft.ccDefault = cod;
  // Actualizar las líneas que aún tenían el CC anterior (o ninguno);
  // las modificadas individualmente se respetan.
  (ocDraft.lineas||[]).forEach(function(l){
    if(!l.cc || l.cc===prev) l.cc = cod;
  });
  ocRenderLineas();
}
function ocAddLinea(){
  ocCaptureHeader();
  ocDraft.lineas.push({ cc: ocDraft.ccDefault||'' });
  ocRenderLineas();
}
function ocRemoveLinea(i){
  ocDraft.lineas.splice(i,1);
  if(!ocDraft.lineas.length) ocDraft.lineas.push({ cc: ocDraft.ccDefault||'' });
  ocRenderLineas();
}
function ocUpd(i,k,v){
  ocDraft.lineas[i][k] = v;
  if(k==='cantidad'||k==='precio'||k==='otros') ocRecalc();
}
function ocCaptureHeader(){
  var g = function(id){ var e=document.getElementById(id); return e?e.value:''; };
  ocDraft.fecha = g('ocFecha');
  ocDraft.proveedorCodigo = g('ocProv');
  ocDraft.contacto = g('ocContacto');
  ocDraft.cotizacion = g('ocCotiz');
  ocDraft.formaPago = g('ocFormaPago');
  ocDraft.ccDefault = g('ocCCDef');
  ocDraft.entregarEn = g('ocEntregar');
  ocDraft.notas = g('ocNotas');
}

/* ── Cálculo de una línea: neto, IVA (19% según producto), otros, total ── */
function ocCalcLinea(l){
  var cant = parseFloat(l.cantidad)||0;
  var precio = parseFloat(l.precio)||0;
  var neto = Math.round(cant*precio);
  var p = l.codigoInterno ? getProduct(l.codigoInterno) : null;
  var afectoIVA = p ? (p.aplicaIVA!==false) : true;
  var iva = afectoIVA ? Math.round(neto*OC_IVA_PCT/100) : 0;
  var otros = Math.round(parseFloat(l.otros)||0);
  return { neto:neto, iva:iva, otros:otros, total:neto+iva+otros, afectoIVA:afectoIVA };
}
function ocTotales(){
  var t = { neto:0, iva:0, otros:0, total:0 };
  (ocDraft.lineas||[]).forEach(function(l){
    if(!l.codigoInterno && !(parseFloat(l.cantidad)||0)) return;
    var c = ocCalcLinea(l);
    t.neto+=c.neto; t.iva+=c.iva; t.otros+=c.otros; t.total+=c.total;
  });
  return t;
}

function ocRenderLineas(){
  var wrap = document.getElementById('ocLineasWrap');
  if(!wrap) return;
  var ccs = (STATE.cache.costCenters||[]).filter(function(c){ return c.activo!==false; })
    .slice().sort(function(a,b){ return (a.codigo||'').localeCompare(b.codigo||''); });
  var ccOpts = function(sel){
    return '<option value="">—</option>'+ccs.map(function(c){
      return '<option value="'+escapeHtml(c.codigo)+'" '+(sel===c.codigo?'selected':'')+'>'+escapeHtml(c.codigo)+'</option>';
    }).join('');
  };
  wrap.innerHTML = `<div style="overflow-x:auto"><table class="data" style="width:100%">
    <thead><tr>
      <th style="width:13%;min-width:120px">Producto</th><th style="width:26%;min-width:180px">Descripción</th>
      <th style="width:9%;min-width:95px">C. Costo</th><th class="num" style="width:8%;min-width:75px">Cantidad</th><th class="num" style="width:10%;min-width:95px">P. Unit. Neto</th>
      <th class="num" style="width:9%">Neto</th><th class="num" style="width:9%">IVA 19%</th><th class="num" style="width:9%;min-width:85px">Otros Imp.</th><th class="num" style="width:10%">Total</th><th style="width:36px"></th>
    </tr></thead>
    <tbody>${ocDraft.lineas.map(function(l,i){
      var c = ocCalcLinea(l);
      var p = l.codigoInterno ? getProduct(l.codigoInterno) : null;
      return `<tr>
        <td style="min-width:150px"><input type="text" class="mono" style="width:100%;box-sizing:border-box" id="oc-prod-${i}" value="${escapeHtml(l.codigoInterno||'')}" placeholder="🔍 Buscar en SCI..."
             oninput="ocBuscarProd(${i})" onfocus="ocBuscarProd(${i})" onblur="setTimeout(ocHideAC,250)"></td>
        <td><input type="text" style="width:100%;box-sizing:border-box" value="${escapeHtml(l.descripcion||'')}" placeholder="Descripción"
             onchange="ocUpd(${i},'descripcion',this.value)">${p?`<div class="hint">${escapeHtml(p.unidadMedida||'')}${c.afectoIVA?'':' · EXENTO IVA'}</div>`:''}</td>
        <td><select style="width:100%;box-sizing:border-box" onchange="ocUpd(${i},'cc',this.value)">${ccOpts(l.cc||'')}</select></td>
        <td class="num"><input type="number" min="0" step="any" style="width:100%;box-sizing:border-box;text-align:right" value="${l.cantidad!=null?l.cantidad:''}"
             oninput="ocUpd(${i},'cantidad',this.value)"></td>
        <td class="num"><input type="number" min="0" step="any" style="width:100%;box-sizing:border-box;text-align:right" value="${l.precio!=null?l.precio:''}"
             oninput="ocUpd(${i},'precio',this.value)"></td>
        <td class="num mono" id="oc-neto-${i}">${fmtMon(c.neto)}</td>
        <td class="num mono" id="oc-iva-${i}">${fmtMon(c.iva)}</td>
        <td class="num"><input type="number" min="0" step="any" style="width:100%;box-sizing:border-box;text-align:right" value="${l.otros!=null?l.otros:''}"
             oninput="ocUpd(${i},'otros',this.value)"></td>
        <td class="num mono" id="oc-total-${i}"><strong>${fmtMon(c.total)}</strong></td>
        <td><button class="btn btn-secondary btn-sm" onclick="ocRemoveLinea(${i})" title="Quitar línea">✕</button></td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr style="background:var(--hd,#f5f9fd)">
      <td colspan="5" style="text-align:right;font-weight:700">TOTALES</td>
      <td class="num mono" id="oc-tot-neto"></td>
      <td class="num mono" id="oc-tot-iva"></td>
      <td class="num mono" id="oc-tot-otros"></td>
      <td class="num mono" id="oc-tot-total"></td><td></td>
    </tr></tfoot>
  </table></div>`;
  ocRecalc();
}

function ocRecalc(){
  (ocDraft.lineas||[]).forEach(function(l,i){
    var c = ocCalcLinea(l);
    var n=document.getElementById('oc-neto-'+i), v=document.getElementById('oc-iva-'+i), t=document.getElementById('oc-total-'+i);
    if(n) n.textContent = fmtMon(c.neto);
    if(v) v.textContent = fmtMon(c.iva);
    if(t) t.innerHTML = '<strong>'+fmtMon(c.total)+'</strong>';
  });
  var tt = ocTotales();
  var set = function(id,val,strong){ var e=document.getElementById(id); if(e) e.innerHTML = strong?('<strong>'+fmtMon(val)+'</strong>'):fmtMon(val); };
  set('oc-tot-neto',tt.neto); set('oc-tot-iva',tt.iva); set('oc-tot-otros',tt.otros); set('oc-tot-total',tt.total,true);
}

/* ── Buscador dinámico de productos del SCI (autocompletado) ──
   La lista se monta en <body> con posición fija: así nunca queda oculta
   bajo la tarjeta/tabla (overflow) ni desplazada por transforms. ── */
function _ocACEl(){
  var el=document.getElementById('oc-ac-global');
  if(!el){
    el=document.createElement('div');
    el.id='oc-ac-global';
    el.className='cc-ac-list';
    el.style.cssText='display:none;position:fixed;z-index:9000;width:340px;max-height:240px;overflow-y:auto;text-align:left';
    document.body.appendChild(el);
    window.addEventListener('resize',ocHideAC);
    window.addEventListener('scroll',ocHideAC,true);
  }
  return el;
}
function ocHideAC(e){
  // No ocultar si el scroll ocurre dentro de la propia lista
  if(e && e.target && e.target.id==='oc-ac-global') return;
  var l=document.getElementById('oc-ac-global'); if(l) l.style.display='none';
}
function ocBuscarProd(i){
  var inp=document.getElementById('oc-prod-'+i);
  if(!inp) return;
  var list=_ocACEl();
  var q=(inp.value||'').trim().toLowerCase();
  var res=[];
  if(q){
    res=(STATE.cache.products||[]).filter(function(p){
      if(p.activo===false) return false;
      return ((p.descripcion||'')+' '+(p.codigoInterno||'')+' '+(p.codigoEAN||'')+' '+(p.grupo||'')+' '+(p.tipoProducto||'')).toLowerCase().includes(q);
    }).slice(0,12);
  }
  var html=res.map(function(p){
    return '<div class="cc-ac-item" onmousedown="ocSelProd('+i+',\''+escapeHtml(p.codigoInterno)+'\')">'+
      '<strong>'+escapeHtml(p.descripcion||'')+'</strong>'+
      '<div class="cc-ac-sub">'+escapeHtml(p.codigoInterno||'')+(p.codigoEAN?' · EAN '+escapeHtml(p.codigoEAN):'')+(p.grupo?' · '+escapeHtml(p.grupo):'')+' · '+escapeHtml(p.unidadMedida||'')+(p.aplicaIVA===false?' · EXENTO IVA':'')+'</div></div>';
  }).join('');
  if(q && can('productos.crear')){
    html+='<div class="cc-ac-item" style="border-top:1px solid #e3e8ee;background:#f0f7ff;color:#1565c0;font-weight:700" onmousedown="ocCrearDesdeBusqueda('+i+')">'+
      '➕ Crear «'+escapeHtml(inp.value.trim())+'» en el SCI'+
      '<div class="cc-ac-sub" style="color:#5a7fa6;font-weight:400">'+(res.length?'¿No es ninguno de estos?':'Sin coincidencias en el catálogo.')+' Crear ficha de producto.</div></div>';
  }
  if(!html){ list.style.display='none'; return; }
  list.innerHTML=html;
  var r=inp.getBoundingClientRect();
  var w=Math.min(340,window.innerWidth-16);
  list.style.width=w+'px';
  list.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px';
  // Si no cabe abajo, mostrar hacia arriba
  var abajo=window.innerHeight-r.bottom;
  if(abajo<180 && r.top>240){
    list.style.top='auto';
    list.style.bottom=(window.innerHeight-r.top+2)+'px';
  }else{
    list.style.bottom='auto';
    list.style.top=(r.bottom+2)+'px';
  }
  list.style.display='block';
}
function ocSelProd(i,codigo){
  ocHideAC();
  var p=getProduct(codigo); if(!p) return;
  ocCaptureHeader();
  ocDraft.lineas[i].codigoInterno=p.codigoInterno;
  ocDraft.lineas[i].descripcion=p.descripcion||'';
  if(!ocDraft.lineas[i].cc) ocDraft.lineas[i].cc=ocDraft.ccDefault||'';
  ocRenderLineas();
}
function ocCrearDesdeBusqueda(i){
  ocHideAC();
  var inp=document.getElementById('oc-prod-'+i);
  var q=inp?inp.value.trim():'';
  var isEAN=/^\d{8,14}$/.test(q);
  ocCaptureHeader();
  openProductForm(null,{ fromOC:true, lineIndex:i, prefilledEAN:isEAN?q:'', prefilledDesc:isEAN?'':q });
}
/* Llamado desde saveProduct (inventario.js) cuando el producto se crea desde una OC */
function ocProductoCreado(codigo,i){
  if(!ocDraft || !ocDraft.lineas || !ocDraft.lineas[i]) return;
  ocDraft.lineas[i].codigoInterno = codigo;
  var p = getProduct(codigo);
  if(p) ocDraft.lineas[i].descripcion = p.descripcion||'';
  if(!ocDraft.lineas[i].cc) ocDraft.lineas[i].cc = ocDraft.ccDefault||'';
  ocRenderLineas();
  toast('Producto disponible', codigo+' creado y agregado a la orden','success');
}

/* ═══════════════ GUARDAR / ANULAR ═══════════════ */
async function guardarOrdenCompra(){
  if(!can('movimientos.crear')){ toast('Sin permiso','','error'); return; }
  ocCaptureHeader();
  if(!ocDraft.fecha){ toast('Falta fecha','Indique la fecha de la orden','error'); return; }
  if(!ocDraft.proveedorCodigo){ toast('Falta proveedor','Seleccione el proveedor','error'); return; }
  var lineas = (ocDraft.lineas||[]).filter(function(l){
    return (l.codigoInterno||l.descripcion) && (parseFloat(l.cantidad)||0)>0;
  });
  if(!lineas.length){ toast('Sin productos','Agregue al menos un producto con cantidad','error'); return; }

  // Consolidar montos por línea
  lineas = lineas.map(function(l){
    var c = ocCalcLinea(l);
    return {
      codigoInterno:l.codigoInterno||'', descripcion:l.descripcion||'',
      cc:l.cc||ocDraft.ccDefault||'',
      cantidad:parseFloat(l.cantidad)||0, precio:parseFloat(l.precio)||0,
      neto:c.neto, iva:c.iva, otros:c.otros, total:c.total
    };
  });
  var tot = { neto:0, iva:0, otros:0, total:0 };
  lineas.forEach(function(l){ tot.neto+=l.neto; tot.iva+=l.iva; tot.otros+=l.otros; tot.total+=l.total; });

  var prov = ocProv(ocDraft.proveedorCodigo);
  var esNueva = !ocDraft.id;
  var reg = {
    id: ocDraft.id || uid(),
    folio: ocDraft.folio || await ocNextFolio(),
    fecha: ocDraft.fecha,
    proveedorCodigo: ocDraft.proveedorCodigo,
    proveedorNombre: prov?prov.razonSocial:'',
    proveedorRut: prov?(prov.rut||''):'',
    contacto: ocDraft.contacto||'',
    cotizacion: ocDraft.cotizacion||'',
    formaPago: ocDraft.formaPago||'',
    ccDefault: ocDraft.ccDefault||'',
    entregarEn: ocDraft.entregarEn||'',
    notas: ocDraft.notas||'',
    lineas: lineas,
    neto: tot.neto, iva: tot.iva, otros: tot.otros, total: tot.total,
    estado: ocDraft.estado||'EMITIDA',
    creadoPor: STATE.user?STATE.user.id:'',
    creado: ocDraft.creado || new Date().toISOString(),
    modificado: new Date().toISOString(),
    _mod: Date.now()
  };
  await dbPut('ordenescompra', reg);
  STATE.cache.ordenescompra = await dbAll('ordenescompra');
  await audit(esNueva?'oc.crear':'oc.editar', (esNueva?'Emisión':'Edición')+' de orden de compra '+reg.folio, reg.folio);
  toast(esNueva?'Orden emitida':'Orden actualizada', reg.folio+' · '+fmtMon(reg.total));
  ocDraft = null;
  navigate('ordenesCompra');
}

function anularOrdenCompra(id){
  var o = ocGet(id); if(!o) return;
  if(!can('movimientos.anular')){ toast('Sin permiso','No puede anular órdenes de compra','error'); return; }
  confirmDialog('Anular orden de compra','¿Anular la orden '+(o.folio||'')+' de '+(o.proveedorNombre||'')+'? Quedará marcada como ANULADA (no se elimina).', async function(){
    o.estado='ANULADA'; o.modificado=new Date().toISOString(); o._mod=Date.now();
    await dbPut('ordenescompra',o);
    STATE.cache.ordenescompra = await dbAll('ordenescompra');
    await audit('oc.anular','Anulación de orden de compra '+o.folio,o.folio);
    closeModal();
    toast('Orden anulada',o.folio);
    navigate('ordenesCompra');
  },'Anular',true);
}

/* ═══════════════ VER DETALLE ═══════════════ */
function verOrdenCompra(id){
  var o = ocGet(id); if(!o) return;
  var anulada = o.estado==='ANULADA';
  showModal('Orden de Compra · '+escapeHtml(o.folio||''),
    `${anulada?'<div class="alert alert-danger" style="margin-bottom:12px">⛔ Esta orden está ANULADA</div>':''}
    <div class="form-grid" style="font-size:13px">
      <div class="form-field"><label>Fecha</label><div>${fmtDateOnly(o.fecha)}</div></div>
      <div class="form-field"><label>Cotización</label><div>${escapeHtml(o.cotizacion||'-')}</div></div>
      <div class="form-field span-2"><label>Proveedor</label><div><strong>${escapeHtml(o.proveedorNombre||'-')}</strong>${o.proveedorRut?' · '+escapeHtml(o.proveedorRut):''}</div></div>
      <div class="form-field"><label>Contacto</label><div>${escapeHtml(o.contacto||'-')}</div></div>
      <div class="form-field"><label>Forma de pago</label><div>${escapeHtml(o.formaPago||'-')}</div></div>
      <div class="form-field"><label>C. Costo predeterminado</label><div>${escapeHtml(ocCCLabel(o.ccDefault))}</div></div>
      <div class="form-field"><label>Entregar en</label><div>${escapeHtml(o.entregarEn||'-')}</div></div>
      ${o.notas?`<div class="form-field span-2"><label>Notas</label><div>${escapeHtml(o.notas)}</div></div>`:''}
    </div>
    <div style="overflow-x:auto;margin-top:10px"><table class="data" style="width:100%">
      <thead><tr><th>Código</th><th>Descripción</th><th>C.C.</th><th class="num">Cant.</th><th class="num">P. Unit.</th><th class="num">Neto</th><th class="num">IVA</th><th class="num">Otros</th><th class="num">Total</th></tr></thead>
      <tbody>${(o.lineas||[]).map(function(l){
        return `<tr><td class="mono">${escapeHtml(l.codigoInterno||'-')}</td><td>${escapeHtml(l.descripcion||'')}</td><td class="mono">${escapeHtml(l.cc||'-')}</td>
          <td class="num">${fmtNum(l.cantidad,2)}</td><td class="num">${fmtMon(l.precio)}</td><td class="num">${fmtMon(l.neto)}</td>
          <td class="num">${fmtMon(l.iva)}</td><td class="num">${fmtMon(l.otros)}</td><td class="num"><strong>${fmtMon(l.total)}</strong></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700">TOTALES</td>
        <td class="num"><strong>${fmtMon(o.neto)}</strong></td><td class="num"><strong>${fmtMon(o.iva)}</strong></td>
        <td class="num"><strong>${fmtMon(o.otros)}</strong></td><td class="num"><strong>${fmtMon(o.total)}</strong></td></tr></tfoot>
    </table></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
     ${(!anulada&&can('movimientos.anular'))?`<button class="btn btn-secondary" style="color:#c0392b" onclick="anularOrdenCompra('${o.id}')">⛔ Anular</button>`:''}
     ${(!anulada&&can('movimientos.crear'))?`<button class="btn btn-secondary" onclick="editOrdenCompra('${o.id}')">✏️ Editar</button>`:''}
     <button class="btn btn-primary" onclick="ocImprimir('${o.id}')">🖨️ Imprimir</button>`,'lg');
}

/* ═══════════════ IMPRESIÓN CON MEMBRETE ═══════════════ */
function ocImprimir(id){
  var o = ocGet(id); if(!o){ toast('No encontrada','','error'); return; }
  var emp = (STATE.cache.config&&STATE.cache.config.empresa)?STATE.cache.config.empresa:{};
  var esc = escapeHtml;
  var membrete =
    '<div class="oc-hdr">'+
      '<div class="oc-emp">'+
        (emp.logo?('<img class="oc-logo" src="'+emp.logo+'" alt="Logo">'):'')+
        '<div class="oc-emp-txt">'+
          '<div class="oc-emp-nom">'+esc(emp.nombre||'')+'</div>'+
          (emp.rut?('<div>RUT: '+esc(emp.rut)+'</div>'):'')+
          (emp.giro?('<div>Giro: '+esc(emp.giro)+'</div>'):'')+
          (emp.direccion?('<div>'+esc(emp.direccion)+'</div>'):'')+
          ((emp.telefono||emp.correo)?('<div>'+esc(emp.telefono||'')+(emp.telefono&&emp.correo?' · ':'')+esc(emp.correo||'')+'</div>'):'')+
        '</div>'+
      '</div>'+
      '<div class="oc-folio-box">'+
        '<div class="oc-folio-t">ORDEN DE COMPRA</div>'+
        '<div class="oc-folio-n">N° '+esc(o.folio||'')+'</div>'+
        '<div class="oc-folio-f">Fecha: '+fmtDateOnly(o.fecha)+'</div>'+
        (o.estado==='ANULADA'?'<div class="oc-anulada">ANULADA</div>':'')+
      '</div>'+
    '</div>';
  var datos =
    '<div class="oc-grid">'+
      '<div class="oc-fld oc-span2"><div class="oc-l">Proveedor</div><div class="oc-v">'+esc(o.proveedorNombre||'-')+(o.proveedorRut?(' · RUT '+esc(o.proveedorRut)):'')+'</div></div>'+
      '<div class="oc-fld"><div class="oc-l">Contacto</div><div class="oc-v">'+esc(o.contacto||'-')+'</div></div>'+
      '<div class="oc-fld"><div class="oc-l">Cotización</div><div class="oc-v">'+esc(o.cotizacion||'-')+'</div></div>'+
      '<div class="oc-fld"><div class="oc-l">Forma de pago</div><div class="oc-v">'+esc(o.formaPago||'-')+'</div></div>'+
      '<div class="oc-fld"><div class="oc-l">Centro de Costo</div><div class="oc-v">'+esc(ocCCLabel(o.ccDefault))+'</div></div>'+
      '<div class="oc-fld oc-span3"><div class="oc-l">Entregar en</div><div class="oc-v">'+esc(o.entregarEn||'-')+'</div></div>'+
    '</div>';
  var filas = (o.lineas||[]).map(function(l){
    return '<tr><td class="mono">'+esc(l.codigoInterno||'-')+'</td><td>'+esc(l.descripcion||'')+'</td><td class="mono">'+esc(l.cc||'-')+'</td>'+
      '<td class="num">'+fmtNum(l.cantidad,2)+'</td><td class="num">'+fmtMon(l.precio)+'</td><td class="num">'+fmtMon(l.neto)+'</td>'+
      '<td class="num">'+fmtMon(l.iva)+'</td><td class="num">'+fmtMon(l.otros)+'</td><td class="num"><strong>'+fmtMon(l.total)+'</strong></td></tr>';
  }).join('');
  var tabla =
    '<table><thead><tr><th>Código</th><th>Descripción</th><th>C.C.</th><th class="num">Cant.</th><th class="num">P. Unit. Neto</th>'+
    '<th class="num">Neto</th><th class="num">IVA 19%</th><th class="num">Otros Imp.</th><th class="num">Total</th></tr></thead>'+
    '<tbody>'+filas+'</tbody>'+
    '<tfoot><tr><td colspan="5" style="text-align:right">TOTALES</td>'+
      '<td class="num">'+fmtMon(o.neto)+'</td><td class="num">'+fmtMon(o.iva)+'</td>'+
      '<td class="num">'+fmtMon(o.otros)+'</td><td class="num">'+fmtMon(o.total)+'</td></tr></tfoot></table>';
  var notas = o.notas?('<div class="oc-notas"><div class="oc-l">Notas</div><div>'+esc(o.notas)+'</div></div>'):'';
  var firmas =
    '<div class="oc-firmas">'+
      '<div class="oc-fbox">Solicitado por</div>'+
      '<div class="oc-fbox">Aprobado por</div>'+
      '<div class="oc-fbox">Proveedor (recepción)</div>'+
    '</div>';

  var html = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(o.folio||'Orden de Compra')+'</title><style>'+
    '*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;font-size:12px;color:#111}'+
    'body{padding:14px 18px}'+
    '.oc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #354a5f;padding-bottom:12px;margin-bottom:14px}'+
    '.oc-emp{display:flex;gap:14px;align-items:center}'+
    '.oc-logo{max-width:90px;max-height:90px;object-fit:contain}'+
    '.oc-emp-txt{font-size:11px;color:#444;line-height:1.5}'+
    '.oc-emp-nom{font-size:16px;font-weight:700;color:#111}'+
    '.oc-folio-box{border:2px solid #354a5f;border-radius:6px;padding:10px 16px;text-align:center;min-width:190px}'+
    '.oc-folio-t{font-size:12px;font-weight:700;letter-spacing:1px;color:#354a5f}'+
    '.oc-folio-n{font-size:17px;font-weight:700;margin-top:3px}'+
    '.oc-folio-f{font-size:11px;color:#555;margin-top:3px}'+
    '.oc-anulada{margin-top:5px;color:#c0392b;font-weight:700;border:1px solid #c0392b;border-radius:4px;padding:2px 6px}'+
    '.oc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}'+
    '.oc-span2{grid-column:span 2}.oc-span3{grid-column:span 3}'+
    '.oc-fld{border:1px solid #ccc;border-radius:4px;padding:6px 8px}'+
    '.oc-l{font-size:9px;font-weight:700;text-transform:uppercase;color:#666}'+
    '.oc-v{font-size:12px;font-weight:600;margin-top:2px}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:6px}'+
    'thead tr{background:#354a5f}th{padding:7px 8px;color:#d1e8ff;font-size:10px;font-weight:700;text-transform:uppercase;text-align:left}'+
    'td{padding:6px 8px;border-bottom:1px solid #e8e8e8;font-size:11px}'+
    'tbody tr:nth-child(even){background:#fafafa}'+
    'tfoot tr{background:#d1e8ff}tfoot td{font-weight:700;border-top:2px solid #0a6ed1}'+
    '.num{text-align:right}.mono{font-family:Consolas,monospace}'+
    'th.num{text-align:right}'+
    '.oc-notas{border:1px solid #ccc;border-radius:4px;padding:8px 10px;margin-top:8px}'+
    '.oc-firmas{margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;page-break-inside:avoid}'+
    '.oc-fbox{border-top:1px solid #aaa;padding-top:8px;text-align:center;font-size:11px;color:#555}'+
    '@page{margin:12mm 12mm 14mm 12mm}'+
    'table tr{page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}'+
    '</style></head><body>'+membrete+datos+tabla+notas+firmas+'</body></html>';

  // Iframe oculto (mismo patrón que ccPrintOrden: confiable en PC y móvil)
  var existing = document.getElementById('oc-print-iframe');
  if(existing) existing.remove();
  var iframe = document.createElement('iframe');
  iframe.id='oc-print-iframe';
  iframe.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  var idoc = iframe.contentWindow?iframe.contentWindow.document:iframe.contentDocument;
  if(!idoc){ toast('Error','No se pudo preparar la impresión','error'); iframe.remove(); return; }
  idoc.open(); idoc.write(html); idoc.close();
  setTimeout(function(){
    try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch(e){ toast('Error al imprimir', e.message,'error'); }
    setTimeout(function(){ try{ iframe.remove(); }catch(e){} }, 2000);
  }, 350);
}
