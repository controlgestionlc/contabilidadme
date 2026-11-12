// Devuelve el array de meses seleccionados en el filtro múltiple (vacío = todos).
function getMesesSel(){
  var el=document.getElementById('f-mes');
  if(!el) return [];
  return Array.from(el.selectedOptions||[]).map(function(o){return o.value;}).filter(Boolean);
}

/* ═══════════ MÓDULO CONTROL DE PRESUPUESTO (encapsulado) ═══════════ */
function __PZ_BOOTSTRAP__(){ (function(){
'use strict';

// ===================== CURRENCY STATE =====================
let CURRENCY = 'CLP'; // 'CLP' or 'USD'

function setCurrency(cur) {
  CURRENCY = cur;
  // Update buttons
  document.getElementById('btn-clp').className = 'cur-btn' + (cur==='CLP' ? ' active' : '');
  document.getElementById('btn-usd').className = 'cur-btn' + (cur==='USD' ? ' active-usd' : '');
  // Update subtitle
  const sub = document.getElementById('subtitle-moneda');
  if (sub) sub.textContent = cur === 'CLP' ? 'Valores en Pesos ($)' : 'Valores en USD';
  // Update accent color for USD
  document.documentElement.style.setProperty('--accent', cur==='USD' ? '#38bdf8' : '#16c784');
  // Re-render everything
  render();
  updateBanner();
}

// Pestaña activa del módulo (define la etiqueta base del título).
var PZ_TAB = 'dashboard';

// Devuelve la temporada vigente: la del filtro global, o la actual del sistema.
function pzTemporadaVigente(){
  var t=(document.getElementById('f-temporada')||{}).value||'';
  if(!t){ try{ if(typeof temporadaActual==='function') t=temporadaActual(); }catch(e){} }
  return t;
}

// Compone el título: etiqueta de la pestaña + huerto + temporada.
function pzActualizarTitulo(){
  var h1=document.getElementById('pz-dash-title'); if(!h1) return;
  var vista=(typeof PZ_VISTA!=='undefined')?PZ_VISTA:'STD';
  var huerto=(typeof PZ_HUERTO!=='undefined')?PZ_HUERTO:'2018';
  var base;
  if(PZ_TAB==='criterios')      base='Criterios';
  else if(PZ_TAB==='eerha')     base='Resultado por Hect\u00e1rea';
  else if(vista==='GTT')        base='Formato GTT Nahuelbuta';
  else                          base='Control Presupuesto';
  var txt=base+' \u00b7 CZ '+huerto;
  var t=pzTemporadaVigente();
  txt += t ? (' \u00b7 Temporada '+t) : ' \u00b7 Todas las temporadas';
  h1.textContent=txt;
}
try{ window.pzActualizarTitulo=pzActualizarTitulo; }catch(e){}

// Subtítulo: rango de meses de la temporada (la temporada ya va en el título).
function actualizarSubtituloTemporada(){
  pzActualizarTitulo();
  var el=document.getElementById('subtitle-temporada'); if(!el) return;
  var t=pzTemporadaVigente();
  if(t && /^\d{4}-\d{4}$/.test(t)){
    var a1=t.split('-')[0], a2=t.split('-')[1];
    el.textContent='Mayo '+a1+' \u2013 Abril '+a2;
  } else if(t){
    el.textContent='Temporada '+t;
  } else {
    el.textContent='Todas las temporadas';
  }
}
try{ window.actualizarSubtituloTemporada=actualizarSubtituloTemporada; }catch(e){}

function getPpto(d) { return CURRENCY === 'CLP' ? d['PPTO_CLP'] : d['PPTO_USD']; }
function getReal(d)  { return CURRENCY === 'CLP' ? d['REAL_CLP']  : d['REAL_USD'];  }
function symPrefix()  { return CURRENCY === 'CLP' ? '$' : 'USD '; }
function fmtVal(v)    {
  if (CURRENCY === 'CLP') return '$' + Math.round(v).toLocaleString('es-CL');
  return 'USD ' + Math.round(v).toLocaleString('es-CL');
}
function fmtValK(v)   {
  if (CURRENCY === 'CLP') return '$' + Math.round(v/1000).toLocaleString('es-CL') + 'K';
  return 'USD ' + Math.round(v).toLocaleString('es-CL');
}


// ===================== DETALLE GASTOS MODAL =====================
let currentDetalleItems = [];
let currentDetallePpto = 0;
// Contexto activo cuando el detalle se abre DESDE el comparador de temporadas.
// null = abierto desde el dashboard (referencia = presupuesto).
let _detalleCtxCmp = null;
let _detalleCtxPend = null;   // lo deja verDetalleComparado; se consume al abrir
let currentDetalleTC = 0; // TC implícito del Excel para la familia (REAL_CLP/REAL_USD)

/* _isSeasonDetalle(obj): true si el detalle ya está segmentado por temporada
   (el primer nivel es {temporada:{familia:[...]}}), false si es el formato
   plano antiguo ({familia:[...]}). Heurística: en el formato nuevo el valor
   del primer nivel es un objeto (no array); en el viejo es un array. */
function _isSeasonDetalle(obj){
  if(!obj || typeof obj!=='object') return false;
  const keys = Object.keys(obj);
  if(!keys.length) return false;
  const first = obj[keys[0]];
  return first != null && typeof first==='object' && !Array.isArray(first);
}
/* _toSeasonDetalle(obj): normaliza cualquier detalle al formato segmentado por
   temporada. Si ya lo está, lo devuelve tal cual (copia superficial). Si es
   plano, lo agrupa derivando la temporada de cada item (campo .temporada, o
   .anio+.mes, o 'SIN TEMPORADA'). */
function _toSeasonDetalle(obj){
  if(!obj || typeof obj!=='object') return {};
  if(_isSeasonDetalle(obj)){
    const out={}; Object.keys(obj).forEach(t=>{ out[t]=obj[t]; }); return out;
  }
  const out={};
  Object.keys(obj).forEach(familia=>{
    const arr = obj[familia]; if(!Array.isArray(arr)) return;
    arr.forEach(it=>{
      let temp = (it && it.temporada) ? String(it.temporada).trim() : '';
      if(!temp && it && it.anio!=null && typeof temporadaDeMesAnio==='function'){
        try{ temp = temporadaDeMesAnio(it.mes, it.anio) || ''; }catch(e){}
      }
      if(!temp) temp = 'SIN TEMPORADA';
      if(!out[temp]) out[temp]={};
      if(!out[temp][familia]) out[temp][familia]=[];
      out[temp][familia].push(it);
    });
  });
  return out;
}
/* _getDetalleFamilia(familia, temporada): devuelve el array de gastos de una
   familia para la temporada dada. Si temporada es '' (Todas), concatena todas
   las temporadas. Tolera el formato plano antiguo. */
function _getDetalleFamilia(familia, temporada){
  const src = (window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS);
  // Vista GTT: "familia" es una FAMILIAGTT. Los items se guardan por familia
  // estándar, así que se recorren todas y se filtra por el campo famGtt.
  if(typeof PZ_VISTA!=='undefined' && PZ_VISTA==='GTT'){
    const seg = _toSeasonDetalle(src);
    let acc = [];
    const temps = temporada ? [temporada] : Object.keys(seg);
    temps.forEach(t => {
      const fams = seg[t] || {};
      Object.keys(fams).forEach(f => {
        (fams[f] || []).forEach(it => {
          if(it && String(it.famGtt || '').trim() === familia) acc.push(it);
        });
      });
    });
    return acc;
  }
  if(!_isSeasonDetalle(src)){
    // Formato plano: sin segmentación, devolver la familia tal cual.
    return src[familia] || [];
  }
  if(temporada){
    return (src[temporada] && src[temporada][familia]) ? src[temporada][familia] : [];
  }
  // Todas las temporadas: concatenar.
  let acc=[];
  Object.keys(src).forEach(t=>{ if(src[t] && src[t][familia]) acc = acc.concat(src[t][familia]); });
  return acc;
}
function openDetalleModal(descripcion) {
  // El contexto de comparación es de UN SOLO USO: lo deja `verDetalleComparado`
  // en `_detalleCtxPend` justo antes de llamar aquí, y se consume al entrar.
  // Así, si el detalle se abre desde un gráfico o desde Top Desviaciones, el pie
  // vuelve a contrastar contra el presupuesto en vez de arrastrar la temporada.
  _detalleCtxCmp = _detalleCtxPend;
  _detalleCtxPend = null;
  const MONTH_ORDER = ['MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO','FEBRERO','MARZO','ABRIL'];
  // Detalle filtrado por la TEMPORADA seleccionada en el dashboard (o todas).
  const tempSel = (document.getElementById('f-temporada') || {}).value || '';
  const allItems = _getDetalleFamilia(descripcion, tempSel);
  const mesesSel = getMesesSel();

  // Filter by month(s) if any selected
  const filtered = mesesSel.length
    ? allItems.filter(x => mesesSel.indexOf(x.mes) >= 0)
    : allItems;

  // Sort ascending by month order
  const items = [...filtered].sort((a, b) => {
    const ai = MONTH_ORDER.indexOf(a.mes);
    const bi = MONTH_ORDER.indexOf(b.mes);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  currentDetalleItems = items;

  // Calcular el PRESUPUESTO de esta descripción (sumando las filas de datos que
  // coinciden, respetando el filtro de mes). Se usa en el pie del modal para
  // mostrar gasto vs presupuesto y el % de desviación.
  try{
    var fuenteFilas = pzDataset() || [];
    var filasDesc = fuenteFilas.filter(function(d){
      if(d.DESCRIPCION !== descripcion) return false;
      // Respetar la TEMPORADA seleccionada (igual que filterData/gráficos);
      // sin esto, con un Excel multi-temporada el ppto del pie suma todas.
      if(tempSel && _getTemporada(d) !== tempSel) return false;
      if(mesesSel.length && mesesSel.indexOf(d.MES) < 0) return false;
      return true;
    });
    currentDetallePpto = filasDesc.reduce(function(s,d){ return s + (parseFloat(getPpto(d))||0); }, 0);
    // TC implícito del Excel para esta familia: suma REAL_CLP / suma REAL_USD.
    // Se usa para convertir el detalle a USD con el MISMO criterio que el gráfico
    // (que muestra el REAL_USD del Excel), evitando descuadres con el TC de pantalla.
    var sClp=filasDesc.reduce(function(s,d){return s+(parseFloat(d.REAL_CLP)||0);},0);
    var sUsd=filasDesc.reduce(function(s,d){return s+(parseFloat(d.REAL_USD)||0);},0);
    currentDetalleTC = (sUsd>0) ? (sClp/sUsd) : 0;
  }catch(e){ currentDetallePpto = 0; }

  document.getElementById('detalle-title').textContent = descripcion;
  const mesLabel = mesesSel.length ? ` · ${mesesSel.join(', ')}` : ' · Todos los meses';
  document.getElementById('detalle-subtitle').textContent =
    `${items.length} registros${mesLabel} · Hoja Detalle Gastos`;
  document.getElementById('detalle-search').value = '';
  renderDetalleTable(items);
  document.getElementById('detalle-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/* Detalle de gastos reales de un SUB-GRUPO completo.
   La dona agrupa por sub-grupo, no por descripción, así que se reúnen los
   detalles de todas las descripciones que caen en él. Reutiliza el mismo modal
   que el detalle por descripción para no duplicar tabla, búsqueda ni pie. */
function openDetalleSubgrupo(sub){
  if(!sub) return;
  _detalleCtxCmp = null; _detalleCtxPend = null;   // referencia = presupuesto
  const MONTH_ORDER = ['MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO','FEBRERO','MARZO','ABRIL'];
  const tempSel = (document.getElementById('f-temporada') || {}).value || '';
  const mesesSel = getMesesSel();

  var filas = (pzDataset() || []).filter(function(d){
    if(String(d['SUB-GRUPO']||'').trim() !== String(sub).trim()) return false;
    if(tempSel && _getTemporada(d) !== tempSel) return false;
    if(mesesSel.length && mesesSel.indexOf(d.MES) < 0) return false;
    return true;
  });
  if(!filas.length){
    if(typeof toast==='function') toast('Sin detalle','No hay gastos registrados en '+sub+' para el período','info');
    return;
  }

  // Descripciones únicas del sub-grupo
  var descs=[];
  filas.forEach(function(d){
    var k=d.DESCRIPCION;
    if(k && descs.indexOf(k)<0) descs.push(k);
  });

  var items=[];
  descs.forEach(function(dsc){
    var it=_getDetalleFamilia(dsc, tempSel) || [];
    if(mesesSel.length) it=it.filter(function(x){ return mesesSel.indexOf(x.mes)>=0; });
    items=items.concat(it);
  });
  items.sort(function(a,b){
    var ai=MONTH_ORDER.indexOf(a.mes), bi=MONTH_ORDER.indexOf(b.mes);
    return (ai===-1?99:ai)-(bi===-1?99:bi);
  });
  currentDetalleItems = items;

  // Presupuesto y TC implícito del sub-grupo, con el mismo criterio que el
  // detalle por descripción (para que el pie no descuadre al pasar a USD).
  try{
    currentDetallePpto = filas.reduce(function(s,d){ return s + (parseFloat(getPpto(d))||0); }, 0);
    var sClp=filas.reduce(function(s,d){ return s+(parseFloat(d.REAL_CLP)||0); },0);
    var sUsd=filas.reduce(function(s,d){ return s+(parseFloat(d.REAL_USD)||0); },0);
    currentDetalleTC = (sUsd>0) ? (sClp/sUsd) : 0;
  }catch(e){ currentDetallePpto = 0; currentDetalleTC = 0; }

  document.getElementById('detalle-title').textContent = sub;
  var mesLabel = mesesSel.length ? (' · '+mesesSel.join(', ')) : ' · Todos los meses';
  document.getElementById('detalle-subtitle').textContent =
    items.length+' registros · '+descs.length+' ítem(s) del sub-grupo'+mesLabel;
  document.getElementById('detalle-search').value = '';
  renderDetalleTable(items);
  document.getElementById('detalle-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDetalleModal() {
  // Ya no se cierra al hacer clic fuera: solo con el botón o con Escape. Con el
  // comparador detrás, el clic accidental fuera cerraba el detalle sin querer.
  document.getElementById('detalle-overlay').classList.remove('active');
  // Si el comparador sigue abierto detrás, el scroll del cuerpo debe seguir
  // bloqueado: restituirlo aquí dejaba la página desplazándose bajo el modal.
  if (!document.getElementById('pz-cmp-overlay')) document.body.style.overflow = '';
}

// Escape cierra SOLO la ventana de más arriba
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const det = document.getElementById('detalle-overlay');
  if (det && det.classList.contains('active')) { closeDetalleModal(); return; }
  if (document.getElementById('pz-cmp-overlay')) cerrarComparador();
});

function filterDetalleTable() {
  const q = document.getElementById('detalle-search').value.toLowerCase();
  const filtered = currentDetalleItems.filter(x =>
    x.desc.toLowerCase().includes(q) || x.proveedor.toLowerCase().includes(q)
  );
  renderDetalleTable(filtered);
}

function renderDetalleTable(items) {
  const tbody = document.getElementById('detalle-tbody');
  const noData = document.getElementById('detalle-no-data');
  const countEl = document.getElementById('detalle-count');
  const totalEl = document.getElementById('detalle-total-val');

  if (!items.length) {
    tbody.innerHTML = '';
    const mesesSel = getMesesSel();
    noData.textContent = mesesSel.length
      ? `Sin registros en Detalle Gastos para ${mesesSel.join(', ')}. El monto proviene de la hoja Base.`
      : 'Sin registros para esta descripción en Detalle Gastos.';
    noData.style.display = 'block';
    countEl.textContent = '0 registros';
    totalEl.textContent = '';
    return;
  }

  // Get TC for conversion when in USD mode
  // TC del Excel para esta familia (cuadra con el gráfico); si no hay, cae al TC de pantalla.
  const tcPantalla = parseFloat((document.getElementById('rb-tc').value || '0').replace(/\./g,'').replace(',','.')) || 1;
  const tc = (currentDetalleTC && currentDetalleTC > 0) ? currentDetalleTC : tcPantalla;
  const convertVal = v => CURRENCY === 'USD' ? v / tc : v;

  noData.style.display = 'none';
  const total = items.reduce((s, x) => s + convertVal(x.total), 0);
  countEl.textContent = `${items.length} registro${items.length !== 1 ? 's' : ''}`;
  // Pie del modal. Hay dos contextos y cada uno pide una referencia distinta:
  //  · Abierto desde el comparador de temporadas → contra el REAL de la
  //    temporada anterior, que es lo que se está analizando.
  //  · Abierto desde el dashboard → contra el PRESUPUESTO, como siempre.
  if (_detalleCtxCmp) {
    var refReal = _detalleCtxCmp.prev || 0;
    var difR    = total - refReal;
    var pctR    = (refReal > 0) ? (difR / refReal) * 100 : null;
    var colR    = (pctR == null) ? '#64748b' : (pctR > 0 ? '#ef4444' : '#16a34a');
    var txtR    = (pctR == null)
      ? (refReal <= 0 && total > 0 ? 'nuevo' : 's/base')
      : ((pctR > 0 ? '+' : '') + pctR.toFixed(1) + '%');
    totalEl.innerHTML =
      '<span style="margin-right:14px">Real ' + escapeHtml(_detalleCtxCmp.tAct) + ': <strong>' + fmtVal(total) + '</strong></span>' +
      '<span style="margin-right:14px;color:#475569">Real ' + escapeHtml(_detalleCtxCmp.tPrev) + ': <strong>' + fmtVal(refReal) + '</strong></span>' +
      '<span style="color:' + colR + '">Variación: <strong>' + txtR + '</strong></span>';
  } else {
    // currentDetallePpto se suma desde getPpto(), que YA devuelve el valor en la
    // moneda activa (PPTO_USD en modo USD). No se debe volver a convertir.
    var pptoConv = currentDetallePpto || 0;
    var devPct = (pptoConv && pptoConv !== 0) ? ((total - pptoConv) / Math.abs(pptoConv)) * 100 : null;
    var devColor = (devPct == null) ? '#64748b' : (devPct > 0 ? '#ef4444' : '#16a34a');
    var devTxt = (devPct == null) ? 's/ppto' : ((devPct > 0 ? '+' : '') + devPct.toFixed(1) + '%');
    totalEl.innerHTML =
      '<span style="margin-right:14px">Gasto: <strong>' + fmtVal(total) + '</strong></span>' +
      '<span style="margin-right:14px;color:#475569">Ppto: <strong>' + fmtVal(pptoConv) + '</strong></span>' +
      '<span style="color:' + devColor + '">Desv: <strong>' + devTxt + '</strong></span>';
  }

  tbody.innerHTML = items.map(x => {
    const converted = convertVal(x.total);
    const cls = converted < 0 ? 'neg' : 'pos';
    const totalFmt = CURRENCY === 'USD'
      ? 'USD ' + Math.abs(converted).toFixed(2)
      : '$' + Math.round(Math.abs(converted)).toLocaleString('es-CL');
    const sign = converted < 0 ? '-' : '';
    return `<tr>
      <td class="desc" title="${x.desc}">${x.desc.length > 55 ? x.desc.slice(0,55)+'…' : x.desc}</td>
      <td class="prov" title="${x.proveedor}">${x.proveedor.length > 30 ? x.proveedor.slice(0,30)+'…' : x.proveedor}</td>
      <td style="color:#64748b;font-size:11px;white-space:nowrap;">${x.numero != null ? x.numero : '—'}</td>
      <td class="num" style="color:#64748b;">${x.cantidad != null && x.cantidad !== '' ? x.cantidad : '—'}</td>
      <td style="color:#64748b;font-size:11px;white-space:nowrap;">${x.mes}</td>
      <td class="num ${cls}">${sign}${totalFmt}</td>
    </tr>`;
  }).join('');
}

// ===================== PRINT / PDF =====================
function imprimirPDF() {
  try {
    // Reporte gerencial de 1 hoja carta: membrete + 6 KPIs + 6 gráficos.
    var txt = function(id){ var e=document.getElementById(id); return e? (e.textContent||'').trim() : ''; };
    var cls = function(id){ var e=document.getElementById(id); return e? (e.className||'') : ''; };
    // Empresa
    var emp = {};
    try{ emp = (STATE.cache && STATE.cache.config && STATE.cache.config.empresa) || {}; }catch(e){}
    var empNombre = emp.nombre || 'SOCIEDAD AGRÍCOLA Y FORESTAL LA CABAÑA LTDA.';
    var empRut    = emp.rut ? ('RUT '+emp.rut) : '';
    var logo      = emp.logo || '';
    var mesAct    = txt('last-update') || '—';

    // 6 KPIs (id, etiqueta, sub)
    var kpis = [
      { lbl:'Presupuesto Total', val:txt('kpi-ppto'),  sub:txt('kpi-sub-ppto'),  color:'#3b82f6' },
      { lbl:'Real Acumulado',    val:txt('kpi-real'),  sub:txt('kpi-sub-real'),  color:'#16c784' },
      { lbl:'Desviación',        val:txt('kpi-dev'),   sub:txt('kpi-dev-pct'),   color:(cls('kpi-dev-card').indexOf('green')>=0?'#16c784':'#ef4444') },
      { lbl:'Meses con Real',    val:txt('kpi-meses-real'), sub:'de '+txt('kpi-total-meses')+' meses', color:'#22d3ee' },
      { lbl:'Mayor Sobreejec.',  val:txt('kpi-max-over'),   sub:txt('kpi-max-over-label'), color:'#f59e0b' },
      { lbl:'Avance Ejecución',  val:txt('kpi-avance'), sub:'Real / Presupuesto', color:'#a78bfa' }
    ];

    // Capturar los 6 primeros gráficos (canvas) a PNG, con su título
    // Orden según el reporte gerencial solicitado.
    var charts = [
      { id:'chartSubgrupo',t:'Por Sub-Grupo' },
      { id:'chartTempCmp', t:'Comparación de Temporadas' },
      { id:'chartLinea',   t:'Evolución Mensual' },
      { id:'chartDesc',    t:'Presupuesto vs Real por Descripción' },
      { id:'chartTipo',    t:'Presupuesto vs Real por Tipo' }
    ];
    var varPct = txt('tcmp-var-pct'); // variación % temporadas (ya calculada en el dashboard)
    var varLbl = txt('tcmp-var-lbl'); // "2026-2027 vs 2025-2026"
    var varSub = ''; try{ var _vs=document.getElementById('tcmp-var-sub'); if(_vs) varSub=_vs.innerHTML; }catch(e){}
    var varColor = '#334155'; try{ var _vp=document.getElementById('tcmp-var-pct'); if(_vp) varColor=_vp.style.color||'#334155'; }catch(e){}
    // Leyenda del sub-grupo (los 4 recuadros con % que van junto a la dona),
    // adaptada a fondo blanco para el reporte.
    var subLeg = '';
    try{
      var lg=document.getElementById('subgrupo-legend');
      if(lg){
        subLeg = lg.innerHTML
          .replace(/color:#ffffff/g,'color:#0d1b2e')
          .replace(/color:#fff\b/g,'color:#0d1b2e')
          .replace(/color:#cbd5e1/g,'color:#334155')
          .replace(/background:rgba\(255,255,255,0\.03\)/g,'background:#f8fafc')
          .replace(/border:1px solid rgba\(255,255,255,0\.06\)/g,'border:1px solid #e2e8f0')
          .replace(/border-top:1px solid rgba\(255,255,255,0\.06\)/g,'border-top:1px solid #e2e8f0')
          // Agrandar fuentes para que sean legibles en la hoja impresa
          .replace(/font-size:10\.5px/g,'font-size:13px')
          .replace(/font-size:9\.5px/g,'font-size:12px')
          .replace(/font-size:9px/g,'font-size:11px');
      }
    }catch(e){}
    // Recorta el padding transparente de un canvas (deja solo el dibujo).
    // Útil para la dona, que en pantalla queda rodeada de mucho margen vacío.
    function _recortarCanvas(cv){
      try{
        var w=cv.width, h=cv.height;
        var ctx=cv.getContext('2d');
        var img=ctx.getImageData(0,0,w,h).data;
        var minX=w, minY=h, maxX=0, maxY=0, found=false;
        for(var y=0;y<h;y++){
          for(var x=0;x<w;x++){
            var a=img[(y*w+x)*4+3];
            if(a>8){ found=true; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
          }
        }
        if(!found) return cv.toDataURL('image/png',1.0);
        var pad=6;
        minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad);
        maxX=Math.min(w,maxX+pad); maxY=Math.min(h,maxY+pad);
        var cw=maxX-minX, ch=maxY-minY;
        var out=document.createElement('canvas'); out.width=cw; out.height=ch;
        out.getContext('2d').drawImage(cv, minX,minY,cw,ch, 0,0,cw,ch);
        return out.toDataURL('image/png',1.0);
      }catch(e){ return cv.toDataURL('image/png',1.0); }
    }
    var imgs = charts.map(function(c){
      var cv = document.getElementById(c.id);
      var src = '';
      try{
        if(cv && cv.toDataURL){
          src = (c.id==='chartSubgrupo') ? _recortarCanvas(cv) : cv.toDataURL('image/png', 1.0);
        }
      }catch(e){}
      var titulo = c.t;
      // El % del gráfico de temporadas va en un badge grande a la derecha, no en el título.
      return { t:titulo, src:src, id:c.id,
               wide:(c.id==='chartTempCmp'||c.id==='chartSubgrupo'),
               extra:(c.id==='chartSubgrupo'?subLeg:'') };
    });

    var kpiHtml = kpis.map(function(k){
      return '<div class="k"><div class="kb" style="background:'+k.color+'"></div>'+
             '<div class="kl">'+k.lbl+'</div>'+
             '<div class="kv">'+(k.val||'—')+'</div>'+
             '<div class="ks">'+(k.sub||'')+'</div></div>';
    }).join('');

    var chartHtml = imgs.map(function(im){
      var inner = (im.src ? '<img src="'+im.src+'">' : '<div class="cv">sin datos</div>');
      // El sub-grupo lleva la dona + su leyenda de 4 recuadros al lado
      if(im.id==='chartSubgrupo' && im.extra){
        inner = '<div class="sg"><div class="sg-img">'+(im.src?'<img src="'+im.src+'">':'')+'</div>'+
                '<div class="sg-leg">'+im.extra+'</div></div>';
      }
      // El de temporadas lleva el gráfico + badge % grande a la derecha (como el dashboard)
      if(im.id==='chartTempCmp' && varPct && varPct!=='—'){
        inner = '<div class="tc"><div class="tc-img">'+(im.src?'<img src="'+im.src+'">':'')+'</div>'+
                '<div class="tc-var">'+
                  '<div class="tcv-lbl">'+(varLbl||'vs temp. anterior')+'</div>'+
                  '<div class="tcv-pct" style="color:'+varColor+'">'+varPct+'</div>'+
                  '<div class="tcv-sub">'+varSub+'</div>'+
                '</div></div>';
      }
      return '<div class="c'+(im.wide?' wide':'')+'"><div class="ct">'+im.t+'</div>'+inner+'</div>';
    }).join('');

    var fecha = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
    var logoHtml = logo ? '<img class="logo" src="'+logo+'">' : '<div class="logo ph">📊</div>';

    var doc =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Gerencial Presupuesto</title>'+
    '<style>'+
    '@page{size:letter portrait;margin:8mm}'+
    '*{box-sizing:border-box;margin:0;padding:0}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:9px}'+
    '.hdr{display:flex;align-items:center;gap:10px;border-bottom:2px solid #16c784;padding-bottom:6px;margin-bottom:8px}'+
    '.logo{width:46px;height:46px;border-radius:50%;object-fit:cover;flex:none}'+
    '.logo.ph{background:linear-gradient(135deg,#354a5f,#0854a0);display:flex;align-items:center;justify-content:center;font-size:22px}'+
    '.hi .emp{font-size:12px;font-weight:800;color:#0d1b2e;line-height:1.1}'+
    '.hi .sub{font-size:8px;color:#64748b;margin-top:1px}'+
    '.hi .rep{font-size:9px;color:#0d1b2e;font-weight:700;margin-top:3px}'+
    '.hr{margin-left:auto;text-align:right;font-size:8px;color:#64748b}'+
    '.hr b{display:block;font-size:11px;color:#16a34a}'+
    '.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:8px}'+
    '.k{border:1px solid #e2e8f0;border-radius:6px;padding:6px 7px;position:relative;overflow:hidden}'+
    '.kb{position:absolute;top:0;left:0;right:0;height:3px}'+
    '.kl{font-size:6.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;margin-top:2px}'+
    '.kv{font-size:12px;font-weight:800;color:#0d1b2e;margin-top:2px;line-height:1}'+
    '.ks{font-size:6px;color:#94a3b8;margin-top:2px}'+
    '.charts{display:grid;grid-template-columns:1fr 1fr;gap:9px}'+
    '.c{border:1px solid #e2e8f0;border-radius:6px;padding:7px 8px}'+
    '.c.wide{grid-column:1 / -1}'+
    '.ct{font-size:13px;font-weight:800;color:#0d1b2e;margin-bottom:5px;text-align:center;letter-spacing:.2px}'+
    '.c img{width:100%;height:auto;display:block;max-height:165px;object-fit:contain;margin:0 auto}'+
    '.cv{font-size:8px;color:#94a3b8;text-align:center;padding:20px 0}'+
    /* Sub-grupo: dona GRANDE (2x) a la izquierda, leyenda legible a la derecha */
    '.sg{display:flex;align-items:center;gap:14px}'+
    '.sg-img{flex:none;width:48%;display:flex;align-items:center;justify-content:center}'+
    '.sg-img img{width:100%;max-width:290px;height:auto;max-height:none;object-fit:contain}'+
    '.sg-leg{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:11px}'+
    '.sg-leg>div{padding:7px 9px !important}'+
    /* Temporadas: gráfico + badge % grande a la derecha */
    '.tc{display:flex;align-items:center;gap:12px}'+
    '.tc-img{flex:1;min-width:0}.tc-img img{width:100%;max-height:150px;object-fit:contain}'+
    '.tc-var{flex:none;width:130px;text-align:center;border-left:1px solid #e2e8f0;padding-left:10px}'+
    '.tcv-lbl{font-size:9px;color:#8a7f66;text-transform:uppercase;letter-spacing:.3px;font-weight:700;line-height:1.2}'+
    '.tcv-pct{font-size:34px;font-weight:800;line-height:1;margin:5px 0}'+
    '.tcv-sub{font-size:8px;color:#94a3b8;line-height:1.3}'+
    '.ft{margin-top:8px;text-align:center;font-size:7px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px}'+
    '</style></head><body>'+
    '<div class="hdr">'+logoHtml+
      '<div class="hi"><div class="emp">'+empNombre+'</div>'+
        (empRut?'<div class="sub">'+empRut+'</div>':'')+
        '<div class="rep">Reporte Gerencial · Control de Presupuesto</div></div>'+
      '<div class="hr">Actualizado a<b>'+mesAct+'</b>Emitido '+fecha+'</div>'+
    '</div>'+
    '<div class="kpis">'+kpiHtml+'</div>'+
    '<div class="charts">'+chartHtml+'</div>'+
    '<div class="ft">Generado por SCI · Control de Presupuesto</div>'+
    '</body></html>';

    var w = window.open('', '_blank');
    if(!w){ toast&&toast('Bloqueado','Permita ventanas emergentes para imprimir','error'); return; }
    w.document.open(); w.document.write(doc); w.document.close();
    // Esperar a que carguen las imágenes antes de imprimir
    w.onload = function(){ setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400); };
    setTimeout(function(){ try{ if(!w.closed){ w.focus(); w.print(); } }catch(e){} }, 900);
  } catch(err){
    console.error('imprimirPDF gerencial error:', err);
    window.print(); // respaldo
  }
}

// ===================== RESUMEN COSECHA BANNER =====================
function updateBanner() {
  var base = pzDataset();
  // Respetar los filtros de temporada y mes (las tarjetas reflejan la
  // temporada seleccionada, no el total del archivo).
  var tempSel = (document.getElementById('f-temporada') || {}).value || '';
  var mesesSel = getMesesSel();
  const source = base.filter(function(d){
    if (tempSel && _getTemporada(d) !== tempSel) return false;
    if (mesesSel.length && mesesSel.indexOf(d.MES) < 0) return false;
    return true;
  });

  // Totales de la selección — sensibles a la moneda activa
  const totalReal = source.reduce((s,d) => s + getReal(d), 0);
  const totalPpto = source.reduce((s,d) => s + getPpto(d), 0);
  const saldo     = totalPpto - totalReal;

  // Editable inputs
  const kg = parseFloat((document.getElementById('rb-kg').value || '0').replace(/\./g,'').replace(',','.')) || 0;
  const tc = parseFloat((document.getElementById('rb-tc').value || '0').replace(',','.')) || 1;
  const ha = parseFloat((document.getElementById('rb-ha').value || '0').replace(',','.')) || 1;

  const costoKg  = kg > 0 ? totalReal / kg : 0;
  const clpHa    = ha > 0 ? totalReal / ha : 0;

  // Formatter
  const fmtM = v => fmtVal(v);   // full pesos
  const fmtN = v => Math.round(v).toLocaleString('es-CL');          // plain number
  const fmtD = v => v.toFixed(2);                                    // 2 decimals

  // Costo real, ppto y saldo se muestran en la fila KPI (Real Acumulado,
  // Presupuesto Total y Desviación), que además responde a los filtros de tipo,
  // sub-grupo y descripción. Aquí se mantienen los cálculos porque alimentan
  // costo/Kg y $/Ha, pero ya no se pintan en el banner.
  const costoRealEl = document.getElementById('rb-costo-real');
  if (costoRealEl) costoRealEl.textContent = fmtM(totalReal);
  const pptoAdjEl = document.getElementById('rb-ppto-adj');
  if (pptoAdjEl) pptoAdjEl.textContent = fmtM(totalPpto);

  const saldoEl    = document.getElementById('rb-saldo');
  const saldoSubEl = document.getElementById('rb-saldo-sub');
  if (saldoEl) {
    saldoEl.textContent = (saldo >= 0 ? '+' : '') + fmtM(saldo);
    saldoEl.className   = 'rb-value ' + (saldo >= 0 ? 'accent' : 'danger');
  }
  if (saldoSubEl) saldoSubEl.textContent = saldo >= 0 ? 'Bajo presupuesto ✓' : 'Sobre presupuesto ✗';

  document.getElementById('rb-costo-kg').textContent = CURRENCY === 'USD'
    ? 'USD ' + costoKg.toFixed(2) + '/Kg'
    : '$' + Math.round(costoKg).toLocaleString('es-CL') + '/Kg';
  document.getElementById('rb-usd-kg').textContent   = fmtVal(clpHa) + '/Ha';
  const haLabel = document.getElementById('rb-ha-label');
  if (haLabel) haLabel.textContent = (CURRENCY === 'CLP' ? '$ / Ha' : 'USD / Ha');
}

// Wire editable inputs
['rb-kg','rb-tc','rb-ha'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateBanner);
});


let ACTIVE_DATA = null; // will hold current working dataset
// ── Vista GTT Nahuelbuta ──
// Dataset paralelo clasificado según el formato GTT (Tipo GTT → TIPO DE COSTO,
// CUENTAGTT → SUB-GRUPO, FAMILIAGTT → DESCRIPCION). La pestaña "Formato GTT"
// cambia PZ_VISTA y todo el pipeline (filtros, KPIs, gráficos, modal) usa
// pzDataset() como fuente.
let ACTIVE_DATA_GTT = null;
let PZ_VISTA = 'STD'; // 'STD' | 'GTT'

// ── Multi-huerto (centro de costo) ──────────────────────────────────
// El mismo dashboard sirve a varios huertos. PZ_HUERTO indica cuál está
// activo; PZ_STORE guarda el estado completo de cada uno (filas, GTT,
// detalle, meses con real y KPIs editables). Al cambiar de pestaña de
// huerto se hace snapshot del activo y se restaura el destino, sin tocar
// la logica de render (que sigue leyendo ACTIVE_DATA via pzDataset()).
let PZ_HUERTO = '2018'; // '2018' | '2024'
var PZ_STORE = {
  '2018': { rows:null, rowsGtt:null, detalle:null, monthsWithReal:null, kpis:null },
  '2024': { rows:null, rowsGtt:null, detalle:null, monthsWithReal:null, kpis:null }
};
function pzHuertoDocId(h){ return (h==='2024') ? 'huerto2024' : 'main'; }
function pzLeerKpis(){
  function num(id){ var el=document.getElementById(id); if(!el) return null;
    var v=(el.value||'').toString().replace(/\./g,'').replace(',', '.').replace(/[^0-9.\-]/g,'');
    var n=parseFloat(v); return isNaN(n)?null:n; }
  return { kg:num('rb-kg'), tc:num('rb-tc'), ha:num('rb-ha'), kgEst:num('rb-kg-est') };
}
function pzEscribirKpis(k){
  k = k || {};
  var kg=document.getElementById('rb-kg');    if(kg)    kg.value = (k.kg!=null)    ? Math.round(k.kg).toLocaleString('es-CL') : '\u2014';
  var tc=document.getElementById('rb-tc');    if(tc)    tc.value = (k.tc!=null)    ? k.tc.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}) : '\u2014';
  var ha=document.getElementById('rb-ha');    if(ha)    ha.value = (k.ha!=null)    ? k.ha.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  var ke=document.getElementById('rb-kg-est');if(ke)    ke.value = (k.kgEst!=null) ? Math.round(k.kgEst).toLocaleString('es-CL') : '\u2014';
}
function pzSnapshotHuerto(){
  var s = PZ_STORE[PZ_HUERTO]; if(!s) return;
  s.rows          = ACTIVE_DATA;
  s.rowsGtt       = ACTIVE_DATA_GTT;
  s.detalle       = window.DETALLE_GASTOS_LIVE || null;
  s.monthsWithReal= window.MONTHS_WITH_REAL || null;
  s.kpis          = pzLeerKpis();
}
function pzRestaurarHuerto(h){
  var s = PZ_STORE[h]; if(!s) return;
  ACTIVE_DATA                = s.rows || null;
  ACTIVE_DATA_GTT            = s.rowsGtt || null;
  window.DETALLE_GASTOS_LIVE = s.detalle || null;
  window.MONTHS_WITH_REAL    = s.monthsWithReal || [];
  pzEscribirKpis(s.kpis);
}
function pzStorePayload(h, obj){
  var s = PZ_STORE[h]; if(!s || !obj) return;
  if(Array.isArray(obj.rows))          s.rows = obj.rows;
  if(Array.isArray(obj.rowsGtt))       s.rowsGtt = obj.rowsGtt.length ? obj.rowsGtt : null;
  if(obj.detalle && typeof obj.detalle==='object') s.detalle = _toSeasonDetalle(obj.detalle);
  if(Array.isArray(obj.monthsWithReal))s.monthsWithReal = obj.monthsWithReal;
  if(obj.kpis)                         s.kpis = obj.kpis;
}

function pzDataset(){
  if(PZ_VISTA==='GTT' && ACTIVE_DATA_GTT && ACTIVE_DATA_GTT.length) return ACTIVE_DATA_GTT;
  if(ACTIVE_DATA) return ACTIVE_DATA;
  // Solo el huerto 2018 tiene datos semilla (RAW); el 2024 arranca vacio.
  return (PZ_HUERTO==='2018') ? RAW : [];
}

/* ══════════════ COMPARADOR DE TEMPORADAS ══════════════
   Compara el REAL de la temporada seleccionada contra el de la anterior.
   Agrupa por DESCRIPCIÓN (el mismo nivel que ya usa el detalle de gastos), de
   modo que cada fila se puede abrir con openDetalleModal.
   Trabaja siempre sobre el REAL: comparar presupuestos entre temporadas no dice
   nada del gasto efectivo, que es lo que interesa al cerrar un año. */

var _cmpFilas = [];      // filas de la comparación, en el orden mostrado
var _cmpModo  = 'desv';  // 'desv' = mayor desviación absoluta · 'pct' = mayor variación %

// Devuelve la temporada anterior a "2026-2027" → "2025-2026".
function _tempAnterior(t){
  var m=/^(\d{4})-(\d{4})$/.exec(String(t||''));
  if(!m) return '';
  return (parseInt(m[1],10)-1)+'-'+(parseInt(m[2],10)-1);
}

// Lista de temporadas presentes en el dataset, ordenadas descendente.
function _pzTemporadas(){
  var set={};
  (pzDataset()||[]).forEach(function(d){ var t=_getTemporada(d); if(t) set[t]=1; });
  return Object.keys(set).sort().reverse();
}

/* Construye la comparación. Respeta el filtro de MES para poder comparar
   períodos equivalentes (ej. solo mayo-julio de cada temporada), pero ignora
   los filtros de tipo/sub-grupo/descripción: el modal tiene sus propios. */
function _cmpConstruir(tActual, tPrevia){
  var mesesSel = getMesesSel();
  var acc = {};
  (pzDataset()||[]).forEach(function(d){
    var t=_getTemporada(d);
    if(t!==tActual && t!==tPrevia) return;
    if(mesesSel.length && mesesSel.indexOf(d.MES)<0) return;
    var desc=(d.DESCRIPCION||'(sin descripción)').trim();
    if(!acc[desc]){
      acc[desc]={desc:desc, tipo:(d['TIPO DE COSTO']||'').trim(),
                 sub:(d['SUB-GRUPO']||'').trim(), act:0, prev:0};
    }
    var v=parseFloat(getReal(d))||0;
    if(t===tActual) acc[desc].act+=v; else acc[desc].prev+=v;
  });

  var filas=Object.keys(acc).map(function(k){
    var f=acc[k];
    f.dif = f.act - f.prev;
    // Sin base previa el porcentaje no existe: se marca como ítem nuevo en vez
    // de inventar un 100% o dividir por cero.
    f.pct = (f.prev>0) ? (f.dif/f.prev*100) : null;
    f.nuevo    = (f.prev<=0 && f.act>0);
    f.discontinuado = (f.act<=0 && f.prev>0);
    return f;
  }).filter(function(f){ return f.act!==0 || f.prev!==0; });

  return filas;
}

function _cmpOrdenar(filas){
  return filas.slice().sort(function(a,b){
    if(_cmpModo==='pct'){
      var pa=(a.pct===null)?-Infinity:Math.abs(a.pct);
      var pb=(b.pct===null)?-Infinity:Math.abs(b.pct);
      if(pb!==pa) return pb-pa;
    }
    return Math.abs(b.dif)-Math.abs(a.dif);
  });
}

function _cmpPct(f){
  if(f.nuevo) return '<span style="color:#7c3aed;font-weight:700">nuevo</span>';
  if(f.discontinuado) return '<span style="color:#64748b;font-weight:700">sin gasto</span>';
  if(f.pct===null) return '—';
  var col=(f.pct>0)?'#b91c1c':'#15803d';
  return '<span style="color:'+col+';font-weight:700">'+(f.pct>0?'+':'')+f.pct.toFixed(1)+'%</span>';
}

function openComparadorModal(){
  var temporadas=_pzTemporadas();
  var tActual=(document.getElementById('f-temporada')||{}).value || temporadas[0] || '';
  if(!tActual){
    if(typeof toast==='function') toast('Sin datos','No hay temporadas cargadas para comparar','error');
    return;
  }
  var sugerida=_tempAnterior(tActual);
  var tPrevia = (temporadas.indexOf(sugerida)>=0)
    ? sugerida
    : (temporadas.filter(function(t){ return t<tActual; })[0] || '');

  var prev=document.getElementById('pz-cmp-overlay'); if(prev) prev.remove();
  var ov=document.createElement('div');
  ov.id='pz-cmp-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10020;display:flex;align-items:center;justify-content:center;padding:16px';
  // Sin cierre por clic fuera: desde aquí se abre el detalle y un clic
  // accidental en el fondo hacía perder la comparación completa.
  ov.innerHTML='<div style="background:#fff;border-radius:14px;max-width:1000px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#1a3a5c;color:#fff;padding:15px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'+
      '<div><div style="font-size:17px;font-weight:800">📊 Comparación entre temporadas</div>'+
        '<div style="font-size:12px;opacity:.85" id="pz-cmp-sub">Gasto real acumulado</div></div>'+
      '<button onclick="PZ.cerrarComparador()" style="background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;width:32px;height:32px;font-size:18px;cursor:pointer;flex:0 0 auto">×</button>'+
    '</div>'+
    '<div style="padding:14px 20px;border-bottom:1px solid #e3e8ee;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TEMPORADA ACTUAL</label>'+
        '<select id="pz-cmp-act" onchange="PZ.refrescarComparador()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+
        temporadas.map(function(t){ return '<option value="'+t+'"'+(t===tActual?' selected':'')+'>'+t+'</option>'; }).join('')+'</select></div>'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">COMPARAR CONTRA</label>'+
        '<select id="pz-cmp-prev" onchange="PZ.refrescarComparador()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+
        temporadas.map(function(t){ return '<option value="'+t+'"'+(t===tPrevia?' selected':'')+'>'+t+'</option>'; }).join('')+'</select></div>'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">ORDENAR POR</label>'+
        '<select id="pz-cmp-modo" onchange="PZ.refrescarComparador()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+
          '<option value="desv">Mayor diferencia ($)</option><option value="pct">Mayor variación (%)</option>'+
        '</select></div>'+
      '<div style="flex:1"></div>'+
      '<button class="btn btn-secondary" onclick="PZ.exportarComparador()" style="font-size:12px;padding:7px 12px">📊 CSV</button>'+
    '</div>'+
    '<div id="pz-cmp-body" style="padding:16px 20px;overflow-y:auto;flex:1"></div>'+
  '</div>';
  document.body.appendChild(ov);
  document.body.style.overflow='hidden';
  refrescarComparador();
}

function cerrarComparador(){
  var ov=document.getElementById('pz-cmp-overlay');
  if(ov) ov.remove();
  // Solo liberar el scroll si no queda otra ventana modal abierta encima
  var det=document.getElementById('detalle-overlay');
  if(!(det && det.classList.contains('active'))) document.body.style.overflow='';
}

function refrescarComparador(){
  var body=document.getElementById('pz-cmp-body'); if(!body) return;
  var tA=(document.getElementById('pz-cmp-act')||{}).value||'';
  var tP=(document.getElementById('pz-cmp-prev')||{}).value||'';
  _cmpModo=(document.getElementById('pz-cmp-modo')||{}).value||'desv';

  if(tA===tP){
    body.innerHTML='<div style="color:#92600a;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;font-size:13px">Seleccione dos temporadas distintas para comparar.</div>';
    return;
  }

  var filas=_cmpConstruir(tA,tP);
  _cmpFilas=_cmpOrdenar(filas);

  var totA=0,totP=0;
  filas.forEach(function(f){ totA+=f.act; totP+=f.prev; });
  var difT=totA-totP;
  var pctT=(totP>0)?(difT/totP*100):null;

  var mesesSel=getMesesSel();
  var sub=document.getElementById('pz-cmp-sub');
  if(sub) sub.textContent='Gasto real'+(mesesSel.length?(' · '+mesesSel.join(', ')):' · Todos los meses')+
    ' · '+(CURRENCY==='CLP'?'Pesos':'Dólares');

  if(!_cmpFilas.length){
    body.innerHTML='<div style="color:#999;padding:26px;text-align:center;font-size:13px">No hay gasto real registrado en ninguna de las dos temporadas para el período seleccionado.</div>';
    return;
  }

  var colT=(difT>0)?'#b91c1c':'#15803d';
  var resumen=
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px">'+
      _cmpCard(tA, fmtVal(totA), 'real acumulado', '#0a6ed1')+
      _cmpCard(tP, fmtVal(totP), 'real acumulado', '#64748b')+
      _cmpCard('Diferencia', (difT>0?'+':'')+fmtVal(difT), (difT>0?'mayor gasto':'menor gasto')+' vs '+tP, colT)+
      _cmpCard('Variación', (pctT===null?'—':((pctT>0?'+':'')+pctT.toFixed(1)+'%')), 'sobre '+tP, colT)+
    '</div>';

  var filasHTML=_cmpFilas.map(function(f,i){
    var colD=(f.dif>0)?'#b91c1c':'#15803d';
    return '<tr onclick="PZ.verDetalleComparado('+i+')" style="border-bottom:1px solid #eee;cursor:pointer" '+
        'onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">'+
      '<td style="padding:8px 9px">'+escapeHtml(f.desc)+
        (f.tipo?'<div style="font-size:10px;color:#475569">'+escapeHtml(f.tipo)+(f.sub?(' · '+escapeHtml(f.sub)):'')+'</div>':'')+'</td>'+
      '<td style="padding:8px 9px;text-align:right;white-space:nowrap">'+fmtVal(f.act)+'</td>'+
      '<td style="padding:8px 9px;text-align:right;white-space:nowrap;color:#64748b">'+fmtVal(f.prev)+'</td>'+
      '<td style="padding:8px 9px;text-align:right;white-space:nowrap;font-weight:700;color:'+colD+'">'+
        (f.dif>0?'▲ +':'▼ ')+fmtVal(f.dif)+'</td>'+
      '<td style="padding:8px 9px;text-align:right;white-space:nowrap">'+_cmpPct(f)+'</td>'+
    '</tr>';
  }).join('');

  body.innerHTML=resumen+
    '<div style="font-size:11px;color:#7a8794;margin-bottom:6px">Haga clic en una fila para ver el detalle de gastos de esa descripción.</div>'+
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:660px">'+
      '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee">'+
        '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">DESCRIPCIÓN</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">'+escapeHtml(tA)+'</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">'+escapeHtml(tP)+'</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">DIFERENCIA</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">VARIACIÓN</th>'+
      '</tr></thead><tbody>'+filasHTML+'</tbody>'+
      '<tfoot><tr style="background:#f5f7fa;font-weight:800;border-top:2px solid #e3e8ee">'+
        '<td style="padding:9px">Total '+_cmpFilas.length+' ítem(s)</td>'+
        '<td style="padding:9px;text-align:right">'+fmtVal(totA)+'</td>'+
        '<td style="padding:9px;text-align:right;color:#64748b">'+fmtVal(totP)+'</td>'+
        '<td style="padding:9px;text-align:right;color:'+colT+'">'+(difT>0?'+':'')+fmtVal(difT)+'</td>'+
        '<td style="padding:9px;text-align:right;color:'+colT+'">'+(pctT===null?'—':((pctT>0?'+':'')+pctT.toFixed(1)+'%'))+'</td>'+
      '</tr></tfoot></table></div>';
}

function _cmpCard(titulo,valor,sub,color){
  return '<div style="border:1px solid #e3e8ee;border-radius:9px;padding:10px 12px">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">'+escapeHtml(titulo)+'</div>'+
    '<div style="font-size:19px;font-weight:800;color:'+color+';margin:2px 0">'+valor+'</div>'+
    '<div style="font-size:10px;color:#475569">'+escapeHtml(sub)+'</div></div>';
}

/* Abre el detalle SOBRE el comparador, sin cerrarlo: al salir del detalle se
   vuelve a la comparación en el mismo punto. Se alinea el filtro de temporada
   del dashboard con la temporada ACTUAL de la comparación, porque
   openDetalleModal lo lee y si no mostraría otra temporada. */
function verDetalleComparado(i){
  var f=_cmpFilas[i]; if(!f) return;
  var tA=(document.getElementById('pz-cmp-act')||{}).value||'';
  var tP=(document.getElementById('pz-cmp-prev')||{}).value||'';
  var selTemp=document.getElementById('f-temporada');
  if(selTemp && tA && selTemp.value!==tA){
    selTemp.value=tA;
    try{ if(typeof render==='function') render(); }catch(e){}
  }
  // El pie del detalle debe contrastar contra el REAL de la temporada anterior,
  // no contra el presupuesto: es lo que se está analizando en el comparador.
  _detalleCtxPend={ tAct:tA, tPrev:tP, prev:f.prev, act:f.act };
  openDetalleModal(f.desc);
}

function exportarComparador(){
  if(!_cmpFilas.length){ if(typeof toast==='function') toast('Sin datos','No hay filas para exportar','error'); return; }
  var tA=(document.getElementById('pz-cmp-act')||{}).value||'';
  var tP=(document.getElementById('pz-cmp-prev')||{}).value||'';
  var q=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var lineas=[['Descripcion','Tipo de costo','Sub-grupo','Real '+tA,'Real '+tP,'Diferencia','Variacion %','Nota'].map(q).join(';')];
  _cmpFilas.forEach(function(f){
    lineas.push([f.desc,f.tipo,f.sub,Math.round(f.act),Math.round(f.prev),Math.round(f.dif),
      (f.pct===null?'':f.pct.toFixed(1)),
      (f.nuevo?'Nuevo':(f.discontinuado?'Sin gasto':''))].map(q).join(';'));
  });
  var blob=new Blob(['\ufeff'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='comparacion_'+tA+'_vs_'+tP+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  if(typeof toast==='function') toast('Exportado',_cmpFilas.length+' ítem(s)','success');
}

function openUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
  setStatus('⏳ Leyendo archivo...', 'loading');
}
function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
}

// Drag & drop on body
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.match(/\.(xlsx|xls)$/i)) {
    openUploadModal();
    processExcel(file);
  }
});

function handleFileSelect(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  openUploadModal();
  setTimeout(() => processExcel(file), 100);
  try { e.target.value = ''; } catch(err) {}
}

function setStatus(msg, type) {
  const el = document.getElementById('upload-status');
  el.textContent = msg;
  el.className = 'upload-status ' + type;
}

function processExcel(file) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    setStatus('❌ Archivo no válido. Solo se aceptan archivos .xlsx o .xls', 'error');
    return;
  }
  setStatus('⏳ Leyendo archivo...', 'loading');
  // Marcar que hay una actualización local en curso: evita que un snapshot de
  // Firebase (que aún puede traer datos anteriores) pise lo que estamos
  // cargando desde el Excel. El flag se libera cuando el push a la nube confirma.
  try{ if(typeof PZFB!=='undefined') PZFB._localEditing = true; }catch(e){}

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });

      // FUENTE DE DATOS: hoja "Detalle Gastos" (tiene TEMPORADA por fila y es
      // la única con reales correctos por temporada; en "Base" los reales de
      // la temporada nueva vienen copiados de la anterior por Base Act).
      const sheetDet = wb.SheetNames.find(n => {
        var s = n.trim().toLowerCase();
        return s.indexOf('detalle') >= 0 && s.indexOf('gasto') >= 0;
      });
      if (!sheetDet) {
        setStatus('❌ No se encontró la hoja "Detalle Gastos" en el archivo.', 'error');
        return;
      }

      // Hoja "Base": ya NO es fuente de montos. Se usa solo para las celdas de
      // kilos (W1/U1) y para derivar el mapa DESCRIPCION → SUB-GRUPO (columna
      // que no existe en Detalle Gastos). Es opcional.
      const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'base');
      const ws = sheetName ? wb.Sheets[sheetName] : null;

      // ── Read Kilos Cosechados from cell W1 of Base sheet ──
      // Acepta 0 como valor válido (antes lo ignoraba). Solo se omite si la
      // celda está vacía o no es numérica.
      const w1Cell = ws ? ws['W1'] : null;
      if (w1Cell != null && w1Cell.v != null && w1Cell.v !== '') {
        const w1Val = parseFloat(w1Cell.v);
        if (!isNaN(w1Val)) {
          const kgInput = document.getElementById('rb-kg');
          if (kgInput) {
            kgInput.value = Math.round(w1Val).toLocaleString('es-CL');
          }
        }
      }
      // ── Read Kilos Estimados from cell U1 of Base sheet ──
      const u1Cell = ws ? ws['U1'] : null;
      if (u1Cell != null && u1Cell.v != null && u1Cell.v !== '') {
        const u1Val = parseFloat(u1Cell.v);
        if (!isNaN(u1Val)) {
          const kgEstInput = document.getElementById('rb-kg-est');
          if (kgEstInput) {
            kgEstInput.value = Math.round(u1Val).toLocaleString('es-CL');
          }
        }
      }

      // ── Mapa DESCRIPCION → SUB-GRUPO desde la hoja Base (si existe) ──
      const subGrupoMap = {};
      if (ws) {
        try {
          const baseMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
          const bh = (baseMatrix[0] || []).map(h => (h != null ? String(h).trim() : ''));
          const iDesc = bh.indexOf('DESCRIPCION'), iSub = bh.indexOf('SUB-GRUPO');
          if (iDesc >= 0 && iSub >= 0) {
            for (let i = 1; i < baseMatrix.length; i++) {
              const br = baseMatrix[i];
              if (br && br[iDesc] != null && br[iSub] != null) {
                subGrupoMap[String(br[iDesc]).trim()] = String(br[iSub]).trim();
              }
            }
          }
        } catch (e) {}
      }

      // ── Leer la hoja Detalle Gastos ──
      const wsDet = wb.Sheets[sheetDet];
      const rawMatrix = XLSX.utils.sheet_to_json(wsDet, { header: 1, defval: null });
      if (!rawMatrix.length || !rawMatrix[0]) {
        setStatus('❌ La hoja "Detalle Gastos" está vacía.', 'error');
        return;
      }

      // Build normalized header map (trim whitespace)
      const headers = rawMatrix[0].map(h => (h != null ? String(h).trim() : ''));

      // Validate required columns against the explicit headers
      const required = ['FECHA','AÑO1','FAMILIA','TIPO2','PROYECCION','TOTAL','PPTO $','TEMPORADA'];
      const missing = required.filter(r => !headers.includes(r));
      if (missing.length) {
        setStatus(`❌ Columnas faltantes en Detalle Gastos: ${missing.join(', ')}`, 'error');
        return;
      }

      // Convertir cada fila de Detalle Gastos al formato interno que usaba la
      // hoja Base: TIPO / MES / AÑO / SUB-GRUPO / TIPO DE COSTO / DESCRIPCION /
      // MONTO PPTO / MONTO REAL / Ppto USD / Real USD / TC / TEMPORADA.
      const hIdx = {}; headers.forEach((h, i) => { if (h) hIdx[h] = i; });
      const gv = (row, col) => (hIdx[col] != null ? row[hIdx[col]] : null);
      const rows = [];
      for (let i = 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (!row || row.every(v => v == null || v === '')) continue;
        const tipo = String(gv(row,'PROYECCION') || '').trim().toUpperCase();
        if (tipo !== 'PRESUPUESTO' && tipo !== 'REAL') continue;
        const fam = String(gv(row,'FAMILIA') || '').trim();
        if (!fam) continue;
        rows.push({
          'TIPO': tipo,
          'MES': String(gv(row,'FECHA') || '').trim().toUpperCase(),
          'AÑO': gv(row,'AÑO1'),
          'SUB-GRUPO': subGrupoMap[fam] || 'OTROS',
          'TIPO DE COSTO': String(gv(row,'TIPO2') || '').trim(),
          'DESCRIPCION': fam,
          'TEMPORADA': String(gv(row,'TEMPORADA') || '').trim(),
          'MONTO PPTO': parseFloat(gv(row,'PPTO $')) || 0,
          'MONTO REAL': parseFloat(gv(row,'TOTAL')) || 0,
          'Ppto USD': parseFloat(gv(row,'PPTO US$')) || 0,
          'Real USD': parseFloat(gv(row,'Neto USD')) || 0,
          'TC': parseFloat(gv(row,'T/C')) || 0,
          // Clasificación GTT Nahuelbuta (columnas opcionales)
          'TIPO_GTT': String(gv(row,'Tipo GTT') || '').trim(),
          'CUENTA_GTT': String(gv(row,'CUENTAGTT') || '').trim(),
          'FAM_GTT': String(gv(row,'FAMILIAGTT') || '').trim()
        });
      }

      if (!rows.length) {
        setStatus('❌ La hoja "Detalle Gastos" no tiene filas PRESUPUESTO/REAL válidas.', 'error');
        return;
      }

      // Process: split PRESUPUESTO / REAL and merge
      const ppto = rows.filter(r => r.TIPO === 'PRESUPUESTO');
      const real = rows.filter(r => r.TIPO === 'REAL');

      const MONTH_ORDER_LOCAL = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
      const monthIdx = m => { const i = MONTH_ORDER_LOCAL.indexOf((m||'').toString().toUpperCase()); return i >= 0 ? i : 99; };

      // Build maps for CLP and USD
      const pptoCLPMap = {}, pptoUSDMap = {}, realCLPMap = {}, realUSDMap = {};

      ppto.forEach(r => {
        const k = [r.MES, r.AÑO, r['SUB-GRUPO'], r['TIPO DE COSTO'], r.DESCRIPCION].join('|');
        const tc = Math.max(parseFloat(r['TC']) || 1, 1);
        pptoCLPMap[k] = (pptoCLPMap[k] || 0) + (parseFloat(r['MONTO PPTO']) || 0);
        const pUSD = (r['Ppto USD'] != null && parseFloat(r['Ppto USD']) > 0)
          ? parseFloat(r['Ppto USD'])
          : (parseFloat(r['MONTO PPTO']) || 0) / tc;
        pptoUSDMap[k] = (pptoUSDMap[k] || 0) + pUSD;
      });

      real.forEach(r => {
        const k = [r.MES, r.AÑO, r['SUB-GRUPO'], r['TIPO DE COSTO'], r.DESCRIPCION].join('|');
        const tc = Math.max(parseFloat(r['TC']) || 1, 1);
        realCLPMap[k] = (realCLPMap[k] || 0) + (parseFloat(r['MONTO REAL']) || 0);
        const rUSD = (r['Real USD'] != null && parseFloat(r['Real USD']) > 0)
          ? parseFloat(r['Real USD'])
          : (parseFloat(r['MONTO REAL']) || 0) / tc;
        realUSDMap[k] = (realUSDMap[k] || 0) + rUSD;
      });

      // Union of all keys
      const allKeys = new Set([...Object.keys(pptoCLPMap), ...Object.keys(realCLPMap)]);
      const merged = [];
      allKeys.forEach(k => {
        const [MES, AÑO, SUB, TIPO, DESC] = k.split('|');
        // Leer temporada del Excel (si la columna existe) o derivar de MES+AÑO.
        var tempDeriv = '';
        try{
          var rawRow = rows.find(function(r){ return r.MES===MES && String(r['AÑO'])===String(AÑO); });
          if(rawRow) tempDeriv = _getTemporada(rawRow);
          if(!tempDeriv && typeof temporadaDeMesAnio==='function') tempDeriv = temporadaDeMesAnio(MES, AÑO) || '';
        }catch(e){}
        merged.push({
          'MES': MES, 'AÑO': parseInt(AÑO),
          'SUB-GRUPO': SUB, 'TIPO DE COSTO': TIPO,
          'DESCRIPCION': DESC,
          'TEMPORADA': tempDeriv,
          'PPTO_CLP': pptoCLPMap[k] || 0,
          'REAL_CLP': realCLPMap[k] || 0,
          'PPTO_USD': pptoUSDMap[k] || 0,
          'REAL_USD': realUSDMap[k] || 0,
          'MONTO PPTO': pptoCLPMap[k] || 0,
          'MONTO REAL': realCLPMap[k] || 0,
          'MES_ORDER': monthIdx(MES)
        });
      });

      merged.sort((a,b) => a.MES_ORDER - b.MES_ORDER);

      // Detect months with real data
      const mesesConReal = [...new Set(merged.filter(d => d['MONTO REAL'] > 0).map(d => d.MES))];
      const lastMes = mesesConReal.length ? mesesConReal[mesesConReal.length - 1] : '—';

      // El Tipo de Cambio del ÚLTIMO mes cargado se fija de forma centralizada
      // en refreshLastUpdate() (se llama más abajo tras la carga y también al
      // cambiar de temporada), usando el orden correcto por año+mes. Así la
      // tarjeta y "Última actualización" siempre coinciden.

      // ── Dataset paralelo con la clasificación GTT Nahuelbuta ──
      // Mismo merge, pero con dims GTT: Tipo GTT / CUENTAGTT / FAMILIAGTT.
      let mergedGtt = [];
      if (rows.some(r => r['FAM_GTT'])) {
        const gP = {}, gR = {}, gPU = {}, gRU = {};
        rows.forEach(r => {
          if (!r['FAM_GTT']) return;
          const k = [r.MES, r['AÑO'], r['CUENTA_GTT'], r['TIPO_GTT'], r['FAM_GTT']].join('|');
          const tc = Math.max(parseFloat(r['TC']) || 1, 1);
          if (r.TIPO === 'PRESUPUESTO') {
            gP[k] = (gP[k] || 0) + (parseFloat(r['MONTO PPTO']) || 0);
            gPU[k] = (gPU[k] || 0) + ((parseFloat(r['Ppto USD']) > 0) ? parseFloat(r['Ppto USD']) : (parseFloat(r['MONTO PPTO']) || 0) / tc);
          } else {
            gR[k] = (gR[k] || 0) + (parseFloat(r['MONTO REAL']) || 0);
            gRU[k] = (gRU[k] || 0) + ((parseFloat(r['Real USD']) > 0) ? parseFloat(r['Real USD']) : (parseFloat(r['MONTO REAL']) || 0) / tc);
          }
        });
        new Set([...Object.keys(gP), ...Object.keys(gR)]).forEach(k => {
          const [MES, AÑO, SUB, TIPO, DESC] = k.split('|');
          var tempG = '';
          try { if (typeof temporadaDeMesAnio === 'function') tempG = temporadaDeMesAnio(MES, AÑO) || ''; } catch(e){}
          mergedGtt.push({
            'MES': MES, 'AÑO': parseInt(AÑO),
            'SUB-GRUPO': SUB, 'TIPO DE COSTO': TIPO,
            'DESCRIPCION': DESC,
            'TEMPORADA': tempG,
            'PPTO_CLP': gP[k] || 0,
            'REAL_CLP': gR[k] || 0,
            'PPTO_USD': gPU[k] || 0,
            'REAL_USD': gRU[k] || 0,
            'MONTO PPTO': gP[k] || 0,
            'MONTO REAL': gR[k] || 0,
            'MES_ORDER': monthIdx(MES)
          });
        });
        mergedGtt.sort((a,b) => a.MES_ORDER - b.MES_ORDER);
      }

      // Update global data
      ACTIVE_DATA = merged;
      ACTIVE_DATA_GTT = mergedGtt.length ? mergedGtt : null;
      window.MONTHS_WITH_REAL = mesesConReal;
      // ── Persistencia en la nube (Parte 2): si el usuario puede editar,
      // subir TODO el dataset a presupuesto/main (reemplazo total). ──
      try{
        if(typeof can==='function' && can('presupuesto.editar')){
          // Diferir brevemente para que los inputs KPI (rb-kg/rb-tc) ya estén
          // actualizados, luego subir. El flag _localEditing se libera al
          // confirmar el push (o si Firebase no está disponible).
          setTimeout(function(){ try{ pzFbPush(); }catch(e){ console.error(e); if(typeof PZFB!=='undefined') PZFB._localEditing=false; } }, 200);
        } else {
          // Sin permiso de edición: no se sube. Liberar el flag local.
          if(typeof PZFB!=='undefined') PZFB._localEditing = false;
        }
      }catch(e){ if(typeof PZFB!=='undefined') PZFB._localEditing = false; }

      // ── Reload Detalle Gastos from new file if sheet exists ──
      const detalleSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'detalle gastos');
      if (detalleSheetName) {
        try {
          const dwsRaw = XLSX.utils.sheet_to_json(wb.Sheets[detalleSheetName], { header: 1, defval: null });
          if (dwsRaw.length > 1) {
            const dHeaders = dwsRaw[0].map(h => (h != null ? String(h).trim() : ''));
            const dRows = [];
            for (let i = 1; i < dwsRaw.length; i++) {
              const row = dwsRaw[i];
              if (!row || row.every(v => v == null || v === '')) continue;
              const obj = {};
              dHeaders.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? null; });
              dRows.push(obj);
            }
            // Reconstruir el detalle de gastos SEGMENTADO POR TEMPORADA.
            // Mapeo REAL de la hoja "Detalle Gastos":
            //   FECHA=mes(A) · AÑO1=año(C) · NÚMERO(F) · DESCRIPCIÓN(H)
            //   CANTIDAD(I) · TOTAL(K) · PROVEEDOR(L) · FAMILIA(N)
            //   PROYECCION(T) · TEMPORADA(W)
            // Solo se incluyen filas REALES (PROYECCION === "REAL"); las de
            // PRESUPUESTO se ignoran. La temporada viene de la columna
            // TEMPORADA y, si falta, se deriva de FECHA(mes)+AÑO1.
            const _v = (r,k)=> (r[k]!=null && r[k]!=='') ? r[k] : null;
            const newDetalleSeason = {};
            dRows.forEach(r => {
              // Filtrar SOLO gastos reales.
              const proj = (r['PROYECCION'] || '').toString().trim().toUpperCase();
              if (proj !== 'REAL') return;
              const familia = (r['FAMILIA'] || '').toString().trim();
              const total   = parseFloat(r['TOTAL']);
              if (!familia || isNaN(total) || total === 0) return;
              const mesDet  = (r['FECHA'] || '—').toString().trim().toUpperCase();
              const anioRaw = _v(r,'AÑO1');
              const anioDet = anioRaw != null ? parseInt(anioRaw) : null;
              // Temporada: columna TEMPORADA o derivada de FECHA(mes)+AÑO1.
              let tempDet = (r['TEMPORADA'] || '').toString().trim();
              if (!tempDet && anioDet != null && typeof temporadaDeMesAnio === 'function') {
                try { tempDet = temporadaDeMesAnio(mesDet, anioDet) || ''; } catch(e){}
              }
              if (!tempDet) tempDet = 'SIN TEMPORADA';
              if (!newDetalleSeason[tempDet]) newDetalleSeason[tempDet] = {};
              if (!newDetalleSeason[tempDet][familia]) newDetalleSeason[tempDet][familia] = [];
              const numRaw  = _v(r,'NÚMERO') != null ? _v(r,'NÚMERO') : _v(r,'NUMERO');
              const cantRaw = _v(r,'CANTIDAD');
              newDetalleSeason[tempDet][familia].push({
                desc:      (r['DESCRIPCIÓN'] || r['DESCRIPCION'] || '—').toString().trim(),
                numero:    numRaw != null ? String(numRaw).trim() : '—',
                cantidad:  cantRaw != null ? cantRaw : '—',
                total:     Math.round(total),
                proveedor: (r['PROVEEDOR'] || '—').toString().trim(),
                mes:       mesDet,
                fecha:     mesDet,
                anio:      anioDet,
                temporada: tempDet,
                cuenta:    (r['CUENTA'] || '—').toString().trim(),
                famGtt:    (r['FAMILIAGTT'] || '').toString().trim(),
              });
            });
            // Ordenar cada familia por orden de mes, dentro de cada temporada.
            const MO = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
            Object.keys(newDetalleSeason).forEach(temp => {
              Object.keys(newDetalleSeason[temp]).forEach(fam => {
                newDetalleSeason[temp][fam].sort((a,b) => {
                  const ai = MO.indexOf(a.mes), bi = MO.indexOf(b.mes);
                  return (ai===-1?99:ai) - (bi===-1?99:bi);
                });
              });
            });
            // MERGE incremental: partir del detalle actual (ya segmentado) y
            // REEMPLAZAR solo las temporadas presentes en este Excel, dejando
            // intactas las demás. _toSeasonDetalle normaliza formato viejo.
            const baseSeason = _toSeasonDetalle(window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS);
            Object.keys(newDetalleSeason).forEach(temp => { baseSeason[temp] = newDetalleSeason[temp]; });
            // Update global — reassign the constant via window
            window.DETALLE_GASTOS_LIVE = baseSeason;
          }
        } catch(e) { console.warn('Detalle Gastos reload failed:', e); }
      }

      // Update last-update label
      refreshLastUpdate();

      const nRows = merged.length;
      const nMeses = mesesConReal.length;
      setStatus(`✅ Archivo cargado correctamente. ${nRows} registros, ${nMeses} meses con datos reales.`, 'ok');

      // Rebuild filters and re-render (respetando la vista activa STD/GTT)
      rebuildFilters(pzDataset());
      renderAll(pzDataset());
      // Si ya hay datos GTT, ocultar el aviso de "recargar Excel".
      try{
        var _w=document.getElementById('pz-gtt-warn');
        if(_w && ACTIVE_DATA_GTT && ACTIVE_DATA_GTT.length) _w.style.display='none';
      }catch(e){}
      updateBanner();

      setTimeout(closeUploadModal, 2200);

    } catch(err) {
      console.error('processExcel error:', err);
      setStatus('❌ Error al procesar el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===================== DATA =====================
const RAW = window.SCI_DATA.RAW;

const MONTH_ORDER = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
const DETALLE_GASTOS = window.SCI_DATA.DETALLE_GASTOS;
const MONTHS_WITH_REAL = window.SCI_DATA.MONTHS_WITH_REAL;

// Chart instances

// Safe chart destroy — handles cases where Chart.js doesn't release canvas properly
function safeDestroy(instance, canvasId) {
  try { if (instance) instance.destroy(); } catch(e) {}
  try {
    const existing = Chart.getChart(document.getElementById(canvasId));
    if (existing) existing.destroy();
  } catch(e) {}
}

let chartLinea, chartTipo, chartSubgrupo, chartDesc, chartDev, chartTempCmp;
var _tempCmpAcum = false;   // vista mensual (false) o acumulada (true)
var _tempCmpData = null;    // último dataset para re-render al cambiar el toggle

function rebuildFilters(data) {
  const temporadas = [...new Set(data.map(d => _getTemporada(d)).filter(t => t))].sort();
  const meses = [...new Set(data.map(d => d.MES))].sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const tipos = [...new Set(data.map(d => d["TIPO DE COSTO"].trim()))].sort();
  const subgrupos = [...new Set(data.map(d => d["SUB-GRUPO"]))].sort();
  const descs = [...new Set(data.map(d => d.DESCRIPCION))].sort();

  const rebuild = (id, arr) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    arr.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if (arr.includes(cur)) sel.value = cur;
  };
  // Temporada: usa "Todas" como etiqueta del vacío.
  // Por defecto (sin selección previa) selecciona la temporada actual, o la última disponible.
  (function(){
    const sel = document.getElementById('f-temporada');
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todas</option>';
    temporadas.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if (cur && temporadas.includes(cur)) {
      sel.value = cur;
    } else if (!cur && !sel.dataset.pzInit) {
      // Primera carga: elegir temporada actual si existe en los datos, si no la última
      var def = '';
      try { var ta = (typeof temporadaActual==='function') ? temporadaActual() : ''; if(ta && temporadas.includes(ta)) def = ta; } catch(e){}
      if(!def && temporadas.length) def = temporadas[temporadas.length-1];
      if(def){ sel.value = def; sel.dataset.pzInit = '1'; }
    }
  })();
  // f-mes es multiselección: reconstruir preservando los meses marcados y sin "Todos".
  (function(){
    const sel=document.getElementById('f-mes'); if(!sel) return;
    const prev=Array.from(sel.selectedOptions||[]).map(o=>o.value);
    sel.innerHTML='';
    meses.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(prev.indexOf(v)>=0)o.selected=true; sel.appendChild(o); });
  })();
  rebuild('f-tipo', tipos);
  rebuild('f-subgrupo', subgrupos);
  rebuild('f-desc', descs);

  // Rebuild month chips using current MONTHS_WITH_REAL
  const currentMWR = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  const chips = document.getElementById('month-chips');
  chips.innerHTML = '';
  MONTH_ORDER.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'month-chip ' + (currentMWR.includes(m) ? 'chip-real' : 'chip-pending');
    chip.textContent = m.slice(0,3);
    chips.appendChild(chip);
  });
}

function renderAll(data) {
  // Re-run filterData so currency mapping (getPpto/getReal) is always applied
  const filtered = filterData();
  renderWithData(filtered, data || pzDataset());
}

// Populate filters
function populateFilters() {
  // Generar las opciones desde los datos vigentes (los de la nube si existen,
  // si no la semilla). Antes se usaba solo RAW, lo que dejaba los filtros
  // desfasados respecto a los datos reales.
  const datos = pzDataset();
  const mesesReales = (typeof MONTHS_WITH_REAL !== 'undefined' ? (window.MONTHS_WITH_REAL || MONTHS_WITH_REAL) : []) || [];

  const meses = [...new Set(datos.map(d => d.MES))].sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const tipos = [...new Set(datos.map(d => (d["TIPO DE COSTO"]||'').trim()).filter(Boolean))].sort();
  const subgrupos = [...new Set(datos.map(d => d["SUB-GRUPO"]).filter(Boolean))].sort();
  const descs = [...new Set(datos.map(d => d.DESCRIPCION).filter(Boolean))].sort();

  // Limpiar el <select> dejando SOLO la opción "Todos" (value="") antes de
  // rellenar. Esto evita opciones duplicadas: el HTML ya trae opciones y, sin
  // esta limpieza, populateFilters las agregaba de nuevo en cada entrada.
  const fillSelect = (id, arr) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const prev = sel.value;                 // conservar la selección actual si existe
    sel.innerHTML = '<option value="">Todos</option>';
    arr.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if(prev && arr.includes(prev)) sel.value = prev;
  };
  // f-mes es multiselección: reconstruir preservando los meses marcados y sin "Todos".
  (function(){
    const sel=document.getElementById('f-mes'); if(!sel) return;
    const prev=Array.from(sel.selectedOptions||[]).map(o=>o.value);
    sel.innerHTML='';
    meses.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(prev.indexOf(v)>=0)o.selected=true; sel.appendChild(o); });
  })();
  fillSelect('f-tipo', tipos);
  fillSelect('f-subgrupo', subgrupos);
  fillSelect('f-desc', descs);

  // Chips de meses: vaciar antes de rellenar (el HTML ya trae chips).
  const chips = document.getElementById('month-chips');
  if(chips){
    chips.innerHTML = '';
    MONTH_ORDER.forEach(m => {
      const chip = document.createElement('div');
      chip.className = 'month-chip ' + (mesesReales.includes(m) ? 'chip-real' : 'chip-pending');
      chip.textContent = m.slice(0,3);
      chips.appendChild(chip);
    });
  }

  refreshLastUpdate();
}

// Lee el valor de "temporada" de una fila de forma tolerante al nombre exacto
// de la columna (TEMPORADA, Temporada, temporada). Si no existe la columna,
// deriva la temporada de MES+AÑO usando temporadaDeMesAnio(). Devuelve '' si
// no puede resolverla.
function _getTemporada(d){
  if(!d) return '';
  // La temporada agrícola cierra en ABRIL (mayo→abril). Se deriva SIEMPRE de
  // MES + AÑO, que son datos confiables, en vez de confiar en una columna
  // "TEMPORADA" del Excel que puede venir mal poblada y mezclar temporadas.
  if(d.MES && d['AÑO']){
    try{ var t=temporadaDeMesAnio(d.MES, d['AÑO']); if(t) return t; }catch(e){}
  }
  // Respaldo: si no hay MES/AÑO, usar la columna TEMPORADA del Excel si existe.
  if(d.TEMPORADA!=null && d.TEMPORADA!=='') return String(d.TEMPORADA).trim();
  if(d.Temporada!=null && d.Temporada!=='') return String(d.Temporada).trim();
  if(d.temporada!=null && d.temporada!=='') return String(d.temporada).trim();
  for(var k in d){ if(/^temporada$/i.test(String(k).trim())){ var v=d[k]; if(v!=null&&v!=='') return String(v).trim(); } }
  return '';
}

function getFilters() {
  return {
    temporada: document.getElementById('f-temporada') ? document.getElementById('f-temporada').value : '',
    mes: document.getElementById('f-mes').value,
    meses: getMesesSel(),
    tipo: document.getElementById('f-tipo').value,
    sub: document.getElementById('f-subgrupo').value,
    desc: document.getElementById('f-desc').value,
  };
}

function filterData() {
  const source = pzDataset();
  const f = getFilters();
  // Map to MONTO PPTO / MONTO REAL based on currency
  return source
    .filter(d =>
      (!f.temporada || _getTemporada(d) === f.temporada) &&
      (!f.meses || !f.meses.length || f.meses.indexOf(d.MES) >= 0) &&
      (!f.tipo || d["TIPO DE COSTO"].trim() === f.tipo) &&
      (!f.sub || d["SUB-GRUPO"] === f.sub) &&
      (!f.desc || d.DESCRIPCION === f.desc)
    )
    .map(d => ({
      ...d,
      "MONTO PPTO": getPpto(d),
      "MONTO REAL": getReal(d)
    }));
}

function resetFilters() {
  if(document.getElementById('f-temporada')) document.getElementById('f-temporada').value = '';
  var _fm=document.getElementById('f-mes'); if(_fm){ Array.from(_fm.options).forEach(function(o){o.selected=false;}); }
  document.getElementById('f-tipo').value = '';
  document.getElementById('f-subgrupo').value = '';
  document.getElementById('f-desc').value = '';
  render();
}

function fmtK(v) {
  // Show as integer miles, using dot as thousands separator (CL locale)
  return Math.round(v/1000).toLocaleString('es-CL');
}
function fmtPct(r, p) { if (!p) return '—'; return ((r-p)/p*100).toFixed(1)+'%'; }

// ====== RENDER ======
// ── Actualiza la etiqueta "Última actualización" desde la fuente activa ──
function refreshLastUpdate() {
  var source = pzDataset();
  // Respetar la temporada seleccionada en el filtro global
  var tempSel = (document.getElementById('f-temporada') || {}).value || '';
  // Meses con datos reales, dentro de la temporada seleccionada (o todas si no hay selección)
  var conReal = source.filter(function(d) {
    return d['MONTO REAL'] > 0 && (!tempSel || _getTemporada(d) === tempSel);
  });
  if (!conReal.length) {
    document.getElementById('last-update').textContent = '—';
    return;
  }
  // Ordenar cronológicamente por FECHA CALENDARIO real (año + mes calendario) y
  // tomar el último. Ojo: MES_ORDER es orden de temporada (Mayo→Abril), que NO
  // es cronológico dentro de un mismo año calendario (Marzo 2025 va antes que
  // Mayo 2025). Por eso aquí se usa el número de mes calendario, no MES_ORDER.
  // Así funciona con una temporada filtrada y con varias temporadas cargadas.
  var _MES_CAL = { ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6, JULIO:7, AGOSTO:8, SEPTIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12 };
  var _cronoKey = function(d){
    var y = parseInt(d['AÑO']) || 0;
    var m = _MES_CAL[(d['MES'] || '').toString().toUpperCase()] || 0;
    return y * 12 + m;
  };
  var sorted = conReal.slice().sort(function(a, b){ return _cronoKey(a) - _cronoKey(b); });
  var last = sorted[sorted.length - 1];
  var mes = (last['MES'] || '').toString();
  var año = last['AÑO'] || '';
  // Title case: "FEBRERO" → "Febrero"
  var label = mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase() + (año ? ' ' + año : '');
  document.getElementById('last-update').textContent = label;

  // ── Tipo de Cambio: mostrar el del ÚLTIMO mes cargado ──
  // Se toma el TC implícito (suma REAL_CLP / suma REAL_USD) de las filas reales
  // de ese mes/año, mismo criterio que usan los gráficos. Si no hay USD para
  // derivarlo, se cae al Valor USD del mes en Indicadores Diarios. La tarjeta
  // queda siempre en sintonía con "Última actualización" y con la temporada
  // seleccionada. Sólo se toca cuando hay datos reales (arriba hay early-return
  // si no los hay), así el TC manual sin Excel no se pisa.
  try {
    var mesU = mes.toUpperCase();
    var filasMes = conReal.filter(function(d){
      return (d['MES'] || '').toString().toUpperCase() === mesU && String(d['AÑO']) === String(año);
    });
    var sClp = filasMes.reduce(function(s, d){ return s + (parseFloat(d['REAL_CLP']) || 0); }, 0);
    var sUsd = filasMes.reduce(function(s, d){ return s + (parseFloat(d['REAL_USD']) || 0); }, 0);
    var tcInput = document.getElementById('rb-tc');
    if (tcInput) {
      var tcVal = (sUsd > 0) ? (sClp / sUsd) : null;
      if (tcVal && tcVal > 0) {
        tcInput.value = tcVal.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else if (typeof window.getIndicadorMes === 'function') {
        var indic = window.getIndicadorMes(mesU, año);
        if (indic && indic.usd) {
          tcInput.value = Number(indic.usd).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
    }
  } catch(e){}
}

function render() {
  refreshLastUpdate();
  actualizarSubtituloTemporada();
  updateBanner();
  const data = filterData();
  renderWithData(data, pzDataset());
}

function renderWithData(data, allData) {
  const currentMonthsWithReal = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  const ppto = data.reduce((s,d) => s + d["MONTO PPTO"], 0);
  const real = data.reduce((s,d) => s + d["MONTO REAL"], 0);
  const dev = real - ppto;
  const devPct = ppto ? (dev/ppto*100) : 0;

  // Count months with real (from filtered data)
  const mesesReal = [...new Set(data.filter(d => d["MONTO REAL"] > 0).map(d => d.MES))];

  // ── "Estado de Meses": chips según la TEMPORADA seleccionada ──
  // Se calcula sobre toda la temporada (sin aplicar el filtro de mes), para
  // que refleje qué meses ya tienen gasto real cargado. Ej.: 2025-2026 los 12
  // meses; 2026-2027 solo mayo y junio.
  try{
    var _tempSel = (document.getElementById('f-temporada') || {}).value || '';
    var _mesesRealTemp = [...new Set(
      pzDataset()
        .filter(function(d){ return d['MONTO REAL'] > 0 && (!_tempSel || _getTemporada(d) === _tempSel); })
        .map(function(d){ return d.MES; })
    )];
    var _chips = document.getElementById('month-chips');
    if(_chips){
      _chips.innerHTML = '';
      MONTH_ORDER.forEach(function(m){
        var c = document.createElement('div');
        c.className = 'month-chip ' + (_mesesRealTemp.indexOf(m) >= 0 ? 'chip-real' : 'chip-pending');
        c.textContent = m.slice(0,3);
        _chips.appendChild(c);
      });
    }
  }catch(e){}

  // KPIs — full integer pesos with thousands separator, no decimals
  const fmtInt = v => Math.round(v).toLocaleString('es-CL');
  document.getElementById('kpi-ppto').textContent = fmtVal(ppto);
  document.getElementById('kpi-real').textContent = fmtVal(real);
  document.getElementById('kpi-dev').textContent  = (dev >= 0 ? '+' : '-') + fmtVal(Math.abs(dev));
  document.getElementById('kpi-dev-pct').textContent = (devPct >= 0 ? '+' : '') + devPct.toFixed(1) + '% vs presupuesto';
  const devCard = document.getElementById('kpi-dev-card');
  devCard.className = 'kpi-card ' + (dev > 0 ? 'red' : 'green');
  document.getElementById('kpi-meses-real').textContent = mesesReal.length;
  document.getElementById('kpi-avance').textContent = ppto ? Math.round(real/ppto*100) + '%' : '—';

  // Max overrun by descripcion
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0,r:0};
    byDesc[k].p += d["MONTO PPTO"]; byDesc[k].r += d["MONTO REAL"];
  });
  const overruns = Object.entries(byDesc).map(([k,v]) => ({k, dev: v.r - v.p})).filter(x => x.dev > 0).sort((a,b) => b.dev - a.dev);
  if (overruns.length) {
    document.getElementById('kpi-max-over').textContent = fmtVal(overruns[0].dev);
    document.getElementById('kpi-max-over-label').textContent = overruns[0].k.split(' ').slice(0,3).join(' ');
  }

  renderLineChart(data);
  renderTipoChart(data);
  renderSubgrupoChart(data);
  renderTopDev(data, byDesc);
  renderDescChart(data);
  renderDevChart(data);
  // Comparación entre temporadas: usa TODO el dataset (no el filtrado por
  // temporada), para ver cómo se comporta la temporada actual vs las anteriores.
  renderTempCompareChart(allData);
  // renderExecSummary removed
}  // end renderWithData

/* Gráfico de líneas: gasto REAL por mes, una línea por temporada disponible.
   No se filtra por la temporada seleccionada (la gracia es comparar entre
   temporadas). Respeta la moneda activa (CLP/USD). Toggle mensual/acumulado. */
function renderTempCompareChart(allData){
  var cv=document.getElementById('chartTempCmp'); if(!cv) return;
  var rows = allData || [];
  _tempCmpData = rows;
  var temps=[]; rows.forEach(function(d){ var t=_getTemporada(d); if(t && temps.indexOf(t)<0) temps.push(t); });
  temps.sort();
  var map={}; temps.forEach(function(t){ map[t]={}; MONTH_ORDER.forEach(function(m){ map[t][m]=0; }); });
  rows.forEach(function(d){
    var t=_getTemporada(d); if(!map[t]) return;
    if(!(d.MES in map[t])) return;
    map[t][d.MES] += (getReal(d)||0);
  });
  var labels = MONTH_ORDER.map(function(m){ return m.slice(0,3); });
  var colors = ['#16c784','#3b82f6','#e9730c','#8e44ad','#c0392b','#d4ac0d','#2c3e50','#e84393'];
  var datasets = temps.map(function(t,i){
    var mesesConDatos = MONTH_ORDER.filter(function(m){ return (map[t][m]||0)>0; });
    var lastIdx = mesesConDatos.length ? MONTH_ORDER.indexOf(mesesConDatos[mesesConDatos.length-1]) : -1;
    var running=0;
    var vals = MONTH_ORDER.map(function(m,idx){
      running += (map[t][m]||0);
      if(_tempCmpAcum){ return (idx<=lastIdx) ? Math.round(running) : null; }
      var v=map[t][m]||0; return v>0 ? Math.round(v) : null;
    });
    var col=colors[i%colors.length];
    return { label:t, data:vals, borderColor:col, backgroundColor:col, borderWidth:2.5, pointRadius:3, pointBackgroundColor:col, tension:0.3, fill:false, spanGaps:true };
  });
  safeDestroy(chartTempCmp, 'chartTempCmp');
  chartTempCmp = new Chart(cv, {
    type:'line',
    data:{ labels:labels, datasets:datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:4, right:8, bottom:2, left:2 } },
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ labels:{ color:'#475569', font:{size:11}, boxWidth:12, padding:10 } },
        tooltip:{ backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1,
          callbacks:{ label:function(ctx){ return ' '+ctx.dataset.label+': '+fmtVal(ctx.parsed.y==null?0:ctx.parsed.y); } } }
      },
      scales:{
        x:{ ticks:{ color:'#64748b', font:{size:10}, autoSkip:true, maxRotation:0 }, grid:{ display:false } },
        y:{ beginAtZero:true, ticks:{ color:'#64748b', font:{size:10}, maxTicksLimit:5, callback:function(v){ return fmtVal(v); } }, grid:{ display:false } }
      }
    }
  });

  // ── Variación % de la temporada más reciente vs la anterior, considerando
  //    SOLO los meses filtrados (si no hay meses filtrados, usa todos los meses).
  try{
    var elPct=document.getElementById('tcmp-var-pct');
    var elSub=document.getElementById('tcmp-var-sub');
    var elLbl=document.getElementById('tcmp-var-lbl');
    if(elPct){
      var mesesSel = (typeof getMesesSel==='function') ? getMesesSel() : [];
      var mesesUsar = (mesesSel && mesesSel.length) ? mesesSel : MONTH_ORDER.slice();
      // sumar real por temporada en los meses a usar
      var sumaTemp={};
      temps.forEach(function(t){
        var s=0; mesesUsar.forEach(function(m){ s += (map[t][m]||0); });
        sumaTemp[t]=s;
      });
      // temps está ordenada ascendente; actual = última, anterior = penúltima
      if(temps.length>=2){
        var tAct=temps[temps.length-1], tAnt=temps[temps.length-2];
        var vAct=sumaTemp[tAct]||0, vAnt=sumaTemp[tAnt]||0;
        if(vAnt>0){
          var pct=((vAct-vAnt)/vAnt)*100;
          var signo=pct>=0?'+':'';
          var color=pct>0 ? '#ef4444' : (pct<0 ? '#16a34a' : '#64748b'); // más gasto = rojo
          elPct.textContent=signo+pct.toFixed(1)+'%';
          elPct.style.color=color;
          if(elLbl) elLbl.textContent=tAct+' vs '+tAnt;
          if(elSub){
            var etMeses = (mesesSel && mesesSel.length) ? (mesesSel.length+' mes(es) filtrado(s)') : 'todos los meses';
            elSub.innerHTML = fmtVal(vAct)+' vs '+fmtVal(vAnt)+'<br>'+etMeses;
          }
        } else {
          elPct.textContent='—'; elPct.style.color='#334155';
          if(elSub) elSub.textContent='sin base de comparación';
        }
      } else {
        elPct.textContent='—'; elPct.style.color='#334155';
        if(elLbl) elLbl.textContent='vs temp. anterior';
        if(elSub) elSub.textContent='una sola temporada';
      }
    }
  }catch(e){ console.error('tcmp var %:',e); }
}
function pzToggleTempCmp(acum){
  _tempCmpAcum=!!acum;
  var bm=document.getElementById('tcmp-mensual'), ba=document.getElementById('tcmp-acum');
  if(bm&&ba){
    bm.style.background=_tempCmpAcum?'#fff':'#1565c0'; bm.style.color=_tempCmpAcum?'#334155':'#fff';
    ba.style.background=_tempCmpAcum?'#1565c0':'#fff'; ba.style.color=_tempCmpAcum?'#fff':'#334155';
  }
  try{ renderTempCompareChart(_tempCmpData); }catch(e){}
}
try{ window.pzToggleTempCmp=pzToggleTempCmp; }catch(e){}

function renderLineChart(data) {
  const byMes = {};
  MONTH_ORDER.forEach(m => { byMes[m] = {p:0,r:0}; });
  data.forEach(d => {
    if (!byMes[d.MES]) return;
    byMes[d.MES].p += d["MONTO PPTO"];
    byMes[d.MES].r += d["MONTO REAL"];
  });
  const labels = MONTH_ORDER.map(m => m.slice(0,3));
  const pptoVals = MONTH_ORDER.map(m => Math.round(byMes[m].p));
  const realVals = MONTH_ORDER.map(m => byMes[m].r > 0 ? Math.round(byMes[m].r) : null);

  safeDestroy(chartLinea, 'chartLinea');
  chartLinea = new Chart(document.getElementById('chartLinea'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Presupuesto',
          data: pptoVals,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Real',
          data: realVals,
          borderColor: '#16c784',
          backgroundColor: 'rgba(22,199,132,0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#16c784',
          tension: 0.3,
          fill: true,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 8, bottom: 2, left: 2 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#475569', font: { size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: {
          backgroundColor: '#1a2235', borderColor: '#1e2d45', borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y ?? 0)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font:{size:10}, autoSkip: true, maxRotation: 0, minRotation: 0 },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#64748b', font:{size:10}, maxTicksLimit: 5, callback: v => fmtVal(v) },
          grid: { display: false }
        }
      }
    }
  });
}

function renderTipoChart(data) {
  const byTipo = {};
  data.forEach(d => {
    const k = d["TIPO DE COSTO"].trim();
    if (!byTipo[k]) byTipo[k] = {p:0, r:0};
    byTipo[k].p += d["MONTO PPTO"];
    byTipo[k].r += d["MONTO REAL"];
  });
  const tipos  = Object.keys(byTipo).filter(k => byTipo[k].p > 0 || byTipo[k].r > 0);
  const labels = tipos.map(k => k.replace('COSTOS ','').replace('GASTOS ',''));
  const pptoV  = tipos.map(k => Math.round(byTipo[k].p));
  const realV  = tipos.map(k => byTipo[k].r > 0 ? Math.round(byTipo[k].r) : null);

  safeDestroy(chartTipo, 'chartTipo');
  chartTipo = new Chart(document.getElementById('chartTipo'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Presupuesto',
          data: pptoV,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#7c3aed',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Real',
          data: realV,
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13,148,136,0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#0d9488',
          tension: 0.3,
          fill: true,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 8, bottom: 2, left: 2 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#475569', font: { size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: {
          backgroundColor: '#1a2235', borderColor: '#1e2d45', borderWidth: 1,
          callbacks: {
            title: items => (items && items[0]) ? labels[items[0].dataIndex] : '',
            label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y ?? 0)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#64748b', font:{size:9}, autoSkip: false,
            maxRotation: 55, minRotation: 0,
            callback: function(v){
              var t = String(this.getLabelForValue(v) || '');
              return t.length > 12 ? t.slice(0,11) + '…' : t;
            }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#64748b', font:{size:9}, maxTicksLimit: 5, callback: v => fmtVal(v) },
          grid: { display: false }
        }
      }
    }
  });
}


function renderSubgrupoChart(data) {
  const bySub = {};
  data.forEach(d => {
    const k = d["SUB-GRUPO"];
    if (!bySub[k]) bySub[k] = { total: 0, ppto: 0, tipos: {} };
    bySub[k].total += d["MONTO REAL"];
    bySub[k].ppto  += (d["MONTO PPTO"]||0);
    const tipo = (d["TIPO DE COSTO"] || '').trim();
    if (tipo) {
      if (!bySub[k].tipos[tipo]) bySub[k].tipos[tipo] = 0;
      bySub[k].tipos[tipo] += d["MONTO REAL"];
    }
  });

  // ── Real de la temporada ANTERIOR por sub-grupo (mismos meses filtrados) ──
  // Para el % de variación entre temporadas en cada sub-grupo.
  var realAntSub = {};
  try{
    var full = (typeof pzDataset==='function') ? pzDataset() : [];
    // temporadas presentes, ordenadas; la actual es la del filtro o la más reciente
    var tempsAll=[]; full.forEach(function(d){ var t=_getTemporada(d); if(t&&tempsAll.indexOf(t)<0) tempsAll.push(t); });
    tempsAll.sort();
    var tempSelEl = document.getElementById('f-temporada');
    var tempActual = (tempSelEl && tempSelEl.value) ? tempSelEl.value : (tempsAll.length?tempsAll[tempsAll.length-1]:'');
    var idxAct = tempsAll.indexOf(tempActual);
    var tempAnterior = (idxAct>0) ? tempsAll[idxAct-1] : '';
    var mesesSel = (typeof getMesesSel==='function') ? getMesesSel() : [];
    if(tempAnterior){
      full.forEach(function(d){
        if(_getTemporada(d)!==tempAnterior) return;
        if(mesesSel.length && mesesSel.indexOf(d.MES)<0) return;
        var k=d["SUB-GRUPO"];
        realAntSub[k]=(realAntSub[k]||0)+(getReal(d)||0);
      });
    }
    window._pzSubTempAnt = tempAnterior;
  }catch(e){ console.error('subgrupo temp anterior:',e); }
  const subs = Object.keys(bySub).filter(k => bySub[k].total > 0);
  const vals = subs.map(k => Math.round(bySub[k].total));
  const colors = ['#16c784','#3b82f6','#f5a623','#a78bfa','#22d3ee'];
  const total  = vals.reduce((s,v) => s+v, 0);

  safeDestroy(chartSubgrupo, 'chartSubgrupo');
  chartSubgrupo = new Chart(document.getElementById('chartSubgrupo'), {
    type: 'doughnut',
    data: {
      labels: subs,
      datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: '#111827', hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      // Clic en un segmento → detalle de los gastos reales de ese sub-grupo
      onClick: (evt, elems) => {
        if(!elems || !elems.length) return;
        const idx = elems[0].index;
        if(subs[idx]) openDetalleSubgrupo(subs[idx]);
      },
      onHover: (evt, elems) => {
        const c = evt && evt.native && evt.native.target;
        if(c) c.style.cursor = (elems && elems.length) ? 'pointer' : 'default';
      },
      layout: {
        padding: (ctx) => {
          // Padding proporcional: en móvil 75px fijos dejaban el aro diminuto
          const w = (ctx.chart && ctx.chart.width) || 320;
          const compacto = w < 520;
          const lat = compacto ? Math.round(w * 0.11) : 75;
          return { top: compacto ? 14 : 65, bottom: 10, left: lat, right: lat };
        }
      },
      plugins: {
        legend: { display: false },   // hidden — we use custom HTML legend
        tooltip: {
          backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1,
          callbacks:{
            label: ctx => {
              const pct = total ? ((ctx.parsed/total)*100).toFixed(1) : '0';
              return ` ${ctx.label}: ${fmtVal(ctx.parsed)} (${pct}%)`;
            }
          }
        },
        datalabels: false
      }
    },
    plugins: [{
      id: 'sliceLabels',
      afterDraw(chart) {
        const { ctx, data: cd } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;
        // En móvil las etiquetas flotantes se salían del canvas:
        // los montos ya se muestran en la leyenda HTML de abajo.
        if (chart.width < 520) return;
        ctx.save();
        meta.data.forEach((arc, i) => {
          const val  = cd.datasets[0].data[i];
          const pct  = total ? ((val/total)*100).toFixed(1) : '0';
          if (parseFloat(pct) < 3) return;
          const angle  = (arc.startAngle + arc.endAngle) / 2;
          const outerR = arc.outerRadius;
          const labelR = outerR + 20;
          const x      = arc.x + Math.cos(angle) * labelR;
          const y      = arc.y + Math.sin(angle) * labelR;
          const align  = Math.cos(angle) >= 0 ? 'left' : 'right';
          const xOff   = Math.cos(angle) >= 0 ? 4 : -4;
          // Connector
          ctx.beginPath();
          ctx.moveTo(arc.x + Math.cos(angle)*(outerR+3), arc.y + Math.sin(angle)*(outerR+3));
          ctx.lineTo(x, y);
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth   = 1.2; ctx.stroke();
          // Value
          ctx.fillStyle    = colors[i % colors.length];
          ctx.font         = 'bold 10px Roboto, sans-serif';
          ctx.textAlign    = align; ctx.textBaseline = 'bottom';
          ctx.fillText(fmtVal(val), x + xOff, y);
          // Pct
          ctx.fillStyle    = '#ffffff';
          ctx.font         = '9px Inter, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(`${pct}%`, x + xOff, y + 2);
        });
        ctx.restore();
      }
    }]
  });

  // ---- Build custom HTML legend (2 columns, white text + tipo de costo breakdown) ----
  const legendEl = document.getElementById('subgrupo-legend');
  if (legendEl) {
    legendEl.innerHTML = subs.map((label, i) => {
      const val  = vals[i];
      const pct  = total ? ((val/total)*100).toFixed(1) : '0';
      const col  = colors[i % colors.length];
      // Tipo de costo breakdown for this sub-grupo
      const tipos = bySub[label] ? bySub[label].tipos : {};
      const tiposHtml = Object.entries(tipos)
        .filter(([,v]) => v > 0)
        .sort(([,a],[,b]) => b - a)
        .map(([tipo, tval]) => {
          const tpct = val ? ((tval/val)*100).toFixed(0) : '0';
          const shortTipo = tipo.replace('COSTOS ', '').replace('GASTOS ', '');
          return `<div style="display:flex;justify-content:space-between;gap:6px;font-size:9px;color:#475569;line-height:1.4;">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;" title="${tipo}">${shortTipo}</span>
            <span style="color:#64748b;flex-shrink:0;">${tpct}%</span>
          </div>`;
        }).join('');
      // Presupuesto vs Real del sub-grupo
      const ppto = bySub[label] ? (bySub[label].ppto||0) : 0;
      const devPct = ppto>0 ? (((val-ppto)/ppto)*100) : null;
      const devColor = devPct==null ? '#64748b' : (devPct>0 ? '#ef4444' : '#16a34a');
      const devTxt = devPct==null ? '—' : ((devPct>=0?'+':'')+devPct.toFixed(0)+'%');
      // Variación vs temporada anterior
      const rAnt = realAntSub[label]||0;
      const varT = rAnt>0 ? (((val-rAnt)/rAnt)*100) : null;
      const varColor = varT==null ? '#94a3b8' : (varT>0 ? '#ef4444' : '#16a34a');
      const varTxt = varT==null ? 's/comparación' : ((varT>=0?'+':'')+varT.toFixed(1)+'% vs temp. ant.');
      return `
        <div onclick="PZ.openDetalleSubgrupo('${String(label).replace(/'/g,"\\'")}')" title="Ver el detalle de gastos de ${label}"
             style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:5px 7px;display:flex;flex-direction:column;gap:4px;cursor:pointer;"
             onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};flex-shrink:0;"></span>
            <span style="font-size:10.5px;font-weight:700;color:#ffffff;line-height:1.2;">${label}</span>
          </div>
          <div style="font-size:9.5px;color:#cbd5e1;font-family:'Roboto',sans-serif;font-weight:600;">
            Real $${Math.round(val).toLocaleString('es-CL')}
            <span style="color:#64748b;font-weight:400;font-size:9.5px;">&nbsp;(${pct}%)</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:6px;font-size:9px;line-height:1.4;">
            <span style="color:#94a3b8;">Ppto $${Math.round(ppto).toLocaleString('es-CL')}</span>
            <span style="color:${devColor};font-weight:700;flex-shrink:0;">${devTxt}</span>
          </div>
          <div style="font-size:9px;color:${varColor};font-weight:600;line-height:1.3;">${varTxt}</div>
          <div style="border-top:1px solid rgba(255,255,255,0.06);margin-top:2px;padding-top:4px;">
            ${tiposHtml}
          </div>
        </div>`;
    }).join('');
  }
}

function renderDescChart(data) {
  // Aggregate by DESCRIPCION
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0, r:0};
    byDesc[k].p += d["MONTO PPTO"];
    byDesc[k].r += d["MONTO REAL"];
  });

  // ── Real de la temporada ANTERIOR por descripción (mismos meses filtrados) ──
  var realAntDesc = {};
  try{
    var full = (typeof pzDataset==='function') ? pzDataset() : [];
    var tempsAll=[]; full.forEach(function(d){ var t=_getTemporada(d); if(t&&tempsAll.indexOf(t)<0) tempsAll.push(t); });
    tempsAll.sort();
    var tempSelEl=document.getElementById('f-temporada');
    var tempActual=(tempSelEl&&tempSelEl.value)?tempSelEl.value:(tempsAll.length?tempsAll[tempsAll.length-1]:'');
    var idxAct=tempsAll.indexOf(tempActual);
    var tempAnterior=(idxAct>0)?tempsAll[idxAct-1]:'';
    var mesesSel=(typeof getMesesSel==='function')?getMesesSel():[];
    if(tempAnterior){
      full.forEach(function(d){
        if(_getTemporada(d)!==tempAnterior) return;
        if(mesesSel.length && mesesSel.indexOf(d.MES)<0) return;
        var k=d.DESCRIPCION;
        realAntDesc[k]=(realAntDesc[k]||0)+(getReal(d)||0);
      });
    }
  }catch(e){ console.error('desc temp anterior:',e); }

  // Keep only items with movement, sort by max desc, top 15
  const items = Object.entries(byDesc)
    .filter(([,v]) => v.p > 0 || v.r > 0)
    .sort(([,a],[,b]) => Math.max(b.p,b.r) - Math.max(a.p,a.r))
    .slice(0, 15);

  const labels = items.map(([k]) => k);
  const pptoV  = items.map(([,v]) => Math.round(v.p));
  const realV  = items.map(([,v]) => Math.round(v.r));
  const realAntV = items.map(([k]) => Math.round(realAntDesc[k]||0));

  // Fixed height for line chart
  const wrap = document.querySelector('.chart-desc-wrap');
  if (wrap) wrap.style.height = '320px';

  const hayTempAnt = realAntV.some(function(v){ return v>0; });

  safeDestroy(chartDesc, 'chartDesc');
  chartDesc = new Chart(document.getElementById('chartDesc'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        // Barra: gasto real de la temporada anterior (al fondo).
        {
          type: 'bar',
          label: 'Real temp. anterior',
          data: realAntV,
          backgroundColor: 'rgba(148,163,184,0.45)',
          borderColor: 'rgba(100,116,139,0.6)',
          borderWidth: 1,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          order: 3,
          hidden: !hayTempAnt
        },
        {
          type: 'line',
          label: 'Presupuesto',
          data: pptoV,
          borderColor: '#d97706',
          backgroundColor: 'rgba(217,119,6,0.12)',
          pointBackgroundColor: '#d97706',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          order: 1,
        },
        {
          type: 'line',
          label: 'Real',
          data: realV,
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.08)',
          pointBackgroundColor: items.map(([,v]) => v.r > v.p ? '#ef4444' : '#059669'),
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          order: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#475569', font:{size:10}, boxWidth:10, padding:12 }
        },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const val  = ctx.parsed.y;
              const diff = realV[ctx.dataIndex] - pptoV[ctx.dataIndex];
              const base = pptoV[ctx.dataIndex];
              const pct  = base ? ((diff / Math.abs(base)) * 100).toFixed(1) : '—';
              const tag  = ctx.datasetIndex === 1
                ? ` (${diff >= 0 ? '+' : ''}${fmtVal(Math.abs(diff))} · ${diff >= 0 ? '+' : ''}${pct}%)`
                : '';
              return ` ${ctx.dataset.label}: ${fmtVal(val)}${tag}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#475569',
            font: { size: 9 },
            maxRotation: 45,
            minRotation: 30,
            callback: function(val, i) {
              const lbl = labels[i] || '';
              return lbl.length > 18 ? lbl.slice(0, 18) + '…' : lbl;
            }
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: '#64748b',
            font: { size: 9 },
            callback: v => fmtVal(v)
          },
          grid: { display: false }
        }
      }
    }
  });
}

function renderDevChart(data) {
  // Aggregate by DESCRIPCION: deviation = REAL - PPTO
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0, r:0};
    byDesc[k].p += d["MONTO PPTO"];
    byDesc[k].r += d["MONTO REAL"];
  });

  // ── Real de la temporada ANTERIOR por descripción (mismos meses filtrados) ──
  var realAntDesc = {};
  try{
    var full = (typeof pzDataset==='function') ? pzDataset() : [];
    var tempsAll=[]; full.forEach(function(d){ var t=_getTemporada(d); if(t&&tempsAll.indexOf(t)<0) tempsAll.push(t); });
    tempsAll.sort();
    var tempSelEl=document.getElementById('f-temporada');
    var tempActual=(tempSelEl&&tempSelEl.value)?tempSelEl.value:(tempsAll.length?tempsAll[tempsAll.length-1]:'');
    var idxAct=tempsAll.indexOf(tempActual);
    var tempAnterior=(idxAct>0)?tempsAll[idxAct-1]:'';
    var mesesSel=(typeof getMesesSel==='function')?getMesesSel():[];
    if(tempAnterior){
      full.forEach(function(d){
        if(_getTemporada(d)!==tempAnterior) return;
        if(mesesSel.length && mesesSel.indexOf(d.MES)<0) return;
        var k=d.DESCRIPCION;
        realAntDesc[k]=(realAntDesc[k]||0)+(getReal(d)||0);
      });
    }
  }catch(e){ console.error('dev temp anterior:',e); }

  // Calculate deviations, exclude items with no movement
  const items = Object.entries(byDesc)
    .map(([k, v]) => ({ label: k, dev: v.r - v.p, p: v.p, r: v.r, ra: Math.round(realAntDesc[k]||0) }))
    .filter(x => Math.abs(x.dev) > 0)
    .sort((a, b) => a.dev - b.dev); // ascending: negatives left, positives right

  if (!items.length) return;

  const labels   = items.map(x => x.label);
  const devVals  = items.map(x => Math.round(x.dev));
  const realVals = items.map(x => Math.round(x.r));
  const pptoVals = items.map(x => Math.round(x.p));
  const antVals  = items.map(x => Math.round(x.ra||0));
  const hayAnt   = antVals.some(function(v){ return v>0; });
  const maxX     = Math.max(...items.map(x => Math.max(x.p, x.r, x.ra||0)), 1);

  // Dynamic height — barras más gruesas para mejor lectura
  const h = Math.max(220, items.length * 32);
  const wrap = document.querySelector('.chart-dev-wrap');
  if (wrap) wrap.style.height = h + 'px';

  safeDestroy(chartDev, 'chartDev');
  chartDev = new Chart(document.getElementById('chartDev'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Gasto real',
        data: realVals,
        backgroundColor: items.map(x => x.dev > 0 ? 'rgba(227,73,72,0.9)' : 'rgba(27,175,122,0.9)'),
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        barThickness: 14,
        categoryPercentage: 0.8,
        order: 1,
      },
      {
        // Temporada anterior: barra fina superpuesta (no agrupada), de otro color.
        label: 'Real temp. anterior',
        data: antVals,
        backgroundColor: 'rgba(59,130,246,0.30)',
        borderColor: 'rgba(37,99,235,0.7)',
        borderWidth: 1,
        borderRadius: 2,
        borderSkipped: false,
        barThickness: 24,
        categoryPercentage: 0.8,
        grouped: false,
        order: 3,
        hidden: !hayAnt,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              // Solo detallar una vez (en la barra real, dataset 0)
              if(ctx.datasetIndex !== 0) return null;
              const itm = items[ctx.dataIndex];
              const pct = itm.p ? ((itm.dev / Math.abs(itm.p)) * 100).toFixed(1) : '—';
              var out = [' Real: ' + fmtVal(itm.r),
                      ' Presupuesto: ' + fmtVal(itm.p),
                      ' Desviación: ' + (itm.dev >= 0 ? '+' : '-') + fmtVal(Math.abs(itm.dev)) + '  (' + (itm.dev >= 0 ? '+' : '') + pct + '%)'];
              if(itm.ra>0){
                var vt = (((itm.r-itm.ra)/itm.ra)*100).toFixed(1);
                out.push(' Temp. anterior: ' + fmtVal(itm.ra) + '  (' + (itm.r>=itm.ra?'+':'') + vt + '%)');
              }
              return out;
            },
            title: ctx => ctx[0].label + '  👆 clic en etiqueta para ver detalle'
          }
        }
      },
      scales: {
        x: {
          min: 0, max: maxX * 1.14,
          ticks: {
            color: '#475569', font: {size:10},
            callback: v => fmtVal(v)
          },
          grid: { color: 'rgba(148,163,184,0.2)' },
          border: { color: '#cbd5e1' }
        },
        y: {
          ticks: { color: '#0369a1', font: { size: 11, weight: '600' }, padding: 6 },
          grid: { display: false }
        }
      }
    },
    plugins: [{
      id: 'bulletTrack',
      beforeDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        const x0 = scales.x.getPixelForValue(0);
        const xM = scales.x.getPixelForValue(maxX);
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,0.14)';
        chart.getDatasetMeta(0).data.forEach(bar => {
          const y = bar.y;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x0, y - 8, xM - x0, 16, 3);
          else ctx.rect(x0, y - 8, xM - x0, 16);
          ctx.fill();
        });
        ctx.restore();
      }
    }, {
      id: 'bulletPpto',
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.strokeStyle = '#2c2c2a';
        ctx.lineWidth = 2.6;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const xp = scales.x.getPixelForValue(pptoVals[i]);
          const y = bar.y;
          ctx.beginPath();
          ctx.moveTo(xp, y - 11);
          ctx.lineTo(xp, y + 11);
          ctx.stroke();
        });
        ctx.restore();
      }
    }, {
      id: 'bulletLabels',
      afterDatasetsDraw(chart) {
        const { ctx, scales, chartArea } = chart;
        const xM = scales.x.getPixelForValue(maxX);
        ctx.save();
        ctx.font = '700 10px Roboto, Inter, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const itm = items[i];
          const pct = itm.p ? Math.round((itm.dev / Math.abs(itm.p)) * 100) : null;
          if (pct === null) return;
          ctx.fillStyle = itm.dev > 0 ? '#b91c1c' : '#15803d';
          ctx.fillText((pct >= 0 ? '+' : '') + pct + '%', Math.min(xM + 8, chartArea.right - 2), bar.y);
        });
        ctx.restore();
      }
    }, {
            // Clickable y-axis labels with hover underline effect
      id: 'yAxisClickable',
      _hoveredIdx: -1,
      afterEvent(chart, args) {
        const { event } = args;
        const { scales, chartArea } = chart;
        const yScale = scales.y;
        const canvas = chart.canvas;

        // Only care about mouse events in the left label area
        if (event.x > chartArea.left) {
          if (this._hoveredIdx !== -1) {
            this._hoveredIdx = -1;
            canvas.style.cursor = 'default';
            chart.draw();
          }
          return;
        }

        // Find which tick the mouse is over
        let found = -1;
        for (let i = 0; i < labels.length; i++) {
          const tickY = yScale.getPixelForValue(i);
          if (Math.abs(event.y - tickY) < 12) { found = i; break; }
        }

        if (found !== this._hoveredIdx) {
          this._hoveredIdx = found;
          canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
          args.changed = true;
        }

        // Handle click
        if (event.type === 'click' && found >= 0) {
          openDetalleModal(labels[found]);
        }
      },
      afterDraw(chart) {
        if (this._hoveredIdx < 0) return;
        const { ctx, scales, chartArea } = chart;
        const yScale = scales.y;
        const i = this._hoveredIdx;
        const tickY = yScale.getPixelForValue(i);
        const label = labels[i];

        // Measure text width to draw underline
        ctx.save();
        ctx.font = '600 10.5px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        const x = chartArea.left - 10 - tw;

        // Draw highlight background
        ctx.fillStyle = 'rgba(56,189,248,0.1)';
        ctx.beginPath();
        ctx.roundRect(x - 6, tickY - 11, tw + 12, 22, 4);
        ctx.fill();

        // Draw underline
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, tickY + 8);
        ctx.lineTo(x + tw, tickY + 8);
        ctx.stroke();
        ctx.restore();
      }
    }]
  });
}

function renderTopDev(data, byDesc) {
  const rows = Object.entries(byDesc)
    .map(([k,v]) => ({ k, dev: v.r - v.p, p: v.p, r: v.r }))
    .filter(x => Math.abs(x.dev) > 0)
    .sort((a,b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, 8);

  const tbody = document.getElementById('top-dev-body');
  tbody.innerHTML = rows.map(r => {
    const pct = r.p ? ((r.r-r.p)/r.p*100).toFixed(0) : '—';
    const over = r.dev > 0;
    const label = over ? '▲ +'+fmtVal(r.dev) : '▼ '+fmtVal(r.dev);
    const cls = over ? 'pill-over' : 'pill-under';
    const pctLabel = r.p ? (over ? '+' : '') + pct + '%' : '—';
    // El nombre va completo: la columna lo trunca con elipsis según el ancho real.
    const nombre = r.k;
    // Cada fila es clicable: abre el detalle de gastos de esa descripción.
    // El tooltip (title) muestra el presupuesto y el real completos.
    const tip = 'Presupuesto: ' + fmtVal(r.p) + ' · Real: ' + fmtVal(r.r) + ' · Desv: ' + pctLabel + ' — Clic para ver el detalle';
    const safeKey = (r.k || '').replace(/'/g, "\\'");
    return `<tr class="dev-row-click" onclick="window.PZ.openDetalleModal('${safeKey}')" title="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer">
      <td style="font-size:10.5px;color:#cbd5e1;">${nombre}</td>
      <td><span class="dev-pill ${cls}">${label}</span></td>
      <td style="color:${over?'#ef4444':'#16c784'};font-weight:600;">${pctLabel}</td>
    </tr>`;
  }).join('');
}

function renderExecSummary(data, ppto, real, dev, devPct, overruns, monthsWithRealParam) {
  const currentMWR = monthsWithRealParam || window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  // Big picture
  const items = [];
  const totalK = fmtK(Math.abs(dev));
  if (Math.abs(devPct) < 3) {
    items.push({cls:'ok', title:'Ejecución total dentro del presupuesto', body:`El gasto real acumulado es $${fmtK(real)}K vs presupuesto $${fmtK(ppto)}K. Desviación de ${devPct.toFixed(1)}%, dentro del rango aceptable.`});
  } else if (dev > 0) {
    items.push({cls:'alert', title:`Sobreje cución: +$${totalK}K (${devPct.toFixed(1)}%)`, body:`El gasto real supera el presupuesto en $${totalK}K. Se requiere revisión de los ítems con mayor desviación.`});
  } else {
    items.push({cls:'ok', title:`Subejecución: -$${totalK}K (${Math.abs(devPct).toFixed(1)}%)`, body:`El gasto real está por debajo del presupuesto en $${totalK}K. Posible atraso en ejecución o ahorro genuino.`});
  }

  // Top overruns
  overruns.slice(0, 3).forEach(o => {
    const cls = o.dev > 5000000 ? 'alert' : '';
    items.push({cls, title:`Sobreeje cución: ${o.k}`, body:`Desviación de +$${fmtK(o.dev)}K por sobre el presupuesto asignado a este ítem.`});
  });

  // Months without real data
  const pendientes = MONTH_ORDER.filter(m => !currentMWR.includes(m));
  if (pendientes.length) {
    items.push({cls:'', title:`${pendientes.length} meses pendientes de ingreso`, body:`Los meses ${pendientes.join(', ')} aún no tienen datos reales registrados en la base.`});
  }

  document.getElementById('exec-items').innerHTML = items.map(i =>
    `<div class="exec-item ${i.cls}"><strong>${i.title}</strong><p>${i.body}</p></div>`
  ).join('');
}

// Init


updateBanner();

document.getElementById('f-mes').addEventListener('change', render);
document.getElementById('f-tipo').addEventListener('change', render);
document.getElementById('f-subgrupo').addEventListener('change', render);
document.getElementById('f-desc').addEventListener('change', render);
(function(){ var ft=document.getElementById('f-temporada'); if(ft) ft.addEventListener('change', function(){ render(); try{ if(typeof pzRenderCriterios==='function') pzRenderCriterios(); }catch(e){} }); })();

// ===================== DESCARGA HTML =====================
function downloadDashboard() {
  var btn = document.getElementById('btn-download');
  var originalText = '⬇ Descargar HTML';
  btn.textContent = '⏳ Generando...';
  btn.disabled = true;

  setTimeout(function() {
    try {
      var currentData = (typeof ACTIVE_DATA !== 'undefined' && ACTIVE_DATA) ? ACTIVE_DATA : RAW;
      var currentMWR  = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
      var currentDG   = window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS;
      var haVal       = (document.getElementById('rb-ha') || {}).value || '13.39';
      var kgVal       = (document.getElementById('rb-kg') || {}).value || '206.808';
      var tcVal       = (document.getElementById('rb-tc') || {}).value || '865.1';
      var lastUpdate  = ((document.getElementById('last-update') || {}).textContent || 'dashboard')
                          .trim().replace(/\s+/g, '_');

      var rawJSON = JSON.stringify(currentData);
      var mwrJSON = JSON.stringify(currentMWR);
      var dgJSON  = JSON.stringify(currentDG);

      var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

      function reemplazarLinea(src, prefijo, nuevoContenido) {
        var marcador = '\n' + prefijo;
        var idx = src.indexOf(marcador);
        if (idx === -1) return src;
        var inicioLinea = idx + 1;
        var finLinea    = src.indexOf('\n', inicioLinea);
        if (finLinea === -1) finLinea = src.length;
        return src.slice(0, inicioLinea) + nuevoContenido + src.slice(finLinea);
      }

      // Escape user input for safe insertion into HTML attribute (avoid breaking quotes)
      function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      html = reemplazarLinea(html, 'const RAW = [',              'const RAW = ' + rawJSON + ';');
      html = reemplazarLinea(html, 'const DETALLE_GASTOS = {',   'const DETALLE_GASTOS = ' + dgJSON + ';');
      html = reemplazarLinea(html, 'const MONTHS_WITH_REAL = [', 'const MONTHS_WITH_REAL = ' + mwrJSON + ';');

      html = html.replace(/(<input[^>]+id="rb-ha"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(haVal) + '"';
      });
      html = html.replace(/(<input[^>]+id="rb-kg"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(kgVal) + '"';
      });
      html = html.replace(/(<input[^>]+id="rb-tc"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(tcVal) + '"';
      });

      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'Control_Presupuesto_Cz_2018_' + lastUpdate + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = '✅ Descargado';
      setTimeout(function() { btn.textContent = originalText; btn.disabled = false; }, 2200);
    } catch(err) {
      console.error('downloadDashboard error:', err);
      btn.textContent = '❌ Error';
      setTimeout(function() { btn.textContent = originalText; btn.disabled = false; }, 3000);
    }
  }, 80);
}


/* ═══════════════ PERSISTENCIA FIREBASE DEL PRESUPUESTO ═══════════════ */
/* Doc único 'presupuesto/main' (mismo patrón que sci/main del SCI).
   Estrategia: REEMPLAZAR TODO. Cada Excel que sube el admin pisa el dataset
   completo en la nube; los demás roles leen en tiempo real vía onSnapshot.
   Solo el admin (permiso presupuesto.editar) puede subir. */
var PZFB = {
  ready:false, online:false, applyingRemote:false, _localEditing:false,
  clientId: 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
  lastVersion: 0, unsubs: {}, listenerStarted:false
};
function pzFbDocRef(huerto){
  if(typeof firebase==='undefined' || !firebase.apps || !firebase.apps.length) return null;
  var h = huerto || PZ_HUERTO;
  try{ return firebase.firestore().collection('presupuesto').doc(pzHuertoDocId(h)); }catch(e){ return null; }
}
/* serializeDataset(): arma el objeto persistible con TODO el estado actual del
   dashboard (filas mensuales, detalle de gastos y los KPIs editables). */
function pzSerializeDataset(){
  function num(id){ var el=document.getElementById(id); if(!el) return null;
    var v=(el.value||'').toString().replace(/\./g,'').replace(',', '.').replace(/[^0-9.\-]/g,'');
    var n=parseFloat(v); return isNaN(n)?null:n; }
  return {
    rows: (ACTIVE_DATA || RAW) || [],
    rowsGtt: ACTIVE_DATA_GTT || [],
    detalle: _toSeasonDetalle(window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS) || {},
    monthsWithReal: (window.MONTHS_WITH_REAL || MONTHS_WITH_REAL) || [],
    kpis: { kg: num('rb-kg'), tc: num('rb-tc'), ha: num('rb-ha'), kgEst: num('rb-kg-est') }
  };
}
/* loadDataset(obj): aplica datos provenientes de Firebase al dashboard y
   re-renderiza. No vuelve a subir (se marca applyingRemote). */
function pzLoadDataset(obj){
  if(!obj || typeof obj!=='object') return;
  // Si el usuario acaba de subir un Excel localmente, NO pisar sus datos con
  // un snapshot remoto que aún puede traer el valor anterior. La ventana se
  // libera cuando el push local confirma.
  if(PZFB._localEditing){ return; }
  try{
    PZFB.applyingRemote = true;
    if(Array.isArray(obj.rows) && obj.rows.length){ ACTIVE_DATA = obj.rows; }
    if(Array.isArray(obj.rowsGtt) && obj.rowsGtt.length){ ACTIVE_DATA_GTT = obj.rowsGtt; }
    if(obj.detalle && typeof obj.detalle==='object'){ window.DETALLE_GASTOS_LIVE = _toSeasonDetalle(obj.detalle); }
    if(Array.isArray(obj.monthsWithReal)){ window.MONTHS_WITH_REAL = obj.monthsWithReal; }
    // KPIs editables
    if(obj.kpis){
      var k=obj.kpis;
      var kg=document.getElementById('rb-kg'); if(kg && k.kg!=null) kg.value = Math.round(k.kg).toLocaleString('es-CL');
      var tc=document.getElementById('rb-tc'); if(tc && k.tc!=null) tc.value = k.tc.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
      var ha=document.getElementById('rb-ha'); if(ha && k.ha!=null) ha.value = k.ha.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
      var kgEst=document.getElementById('rb-kg-est'); if(kgEst && k.kgEst!=null) kgEst.value = Math.round(k.kgEst).toLocaleString('es-CL');
    }
    // Reconstruir filtros y re-render con los datos nuevos
    try{ rebuildFilters(pzDataset()); }catch(e){}
    try{ populateFilters(); }catch(e){}
    try{ render(); }catch(e){}
    try{ updateBanner(); }catch(e){}
    try{ refreshLastUpdate(); }catch(e){}
  }catch(e){ console.error('PZ loadDataset error:', e); }
  finally{ PZFB.applyingRemote = false; }
}
/* pzFbPush(): sube TODO el dataset a presupuesto/main (replace-all). */
function pzFbPush(){
  var ref = pzFbDocRef();
  if(!ref){ if(typeof PZFB!=='undefined') PZFB._localEditing = false; return; }
  if(PZFB.applyingRemote){ return; }
  try{
    var version = Date.now();
    PZFB.lastVersion = version;
    var data = pzSerializeDataset();
    var userName = '';
    try{ if(typeof STATE!=='undefined' && STATE.user){ userName = STATE.user.nombre || STATE.user.id || ''; } }catch(e){}
    try{FBCOUNT.write();}catch(e){} ref.set({
      payload: JSON.stringify(data),
      _version: version,
      _clientId: PZFB.clientId,
      _updatedBy: userName,
      _updatedAt: (firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : version)
    }).then(function(){
      PZFB.online = true;
      PZFB._localEditing = false;
      try{ setStatus('☁️ Datos del presupuesto guardados en la nube.', 'ok'); }catch(e){}
    }).catch(function(err){
      PZFB.online = false;
      PZFB._localEditing = false;
      console.error('[PZ-Firebase] Error al guardar:', err);
      try{ setStatus('⚠️ No se pudo guardar en la nube (datos locales OK).', 'error'); }catch(e){}
    });
  }catch(e){ console.error('[PZ-Firebase] push error:', e); }
}
/* pzFbStartListenerFor(huerto): escucha presupuesto/<doc> en tiempo real.
   Si el snapshot corresponde al huerto ACTIVO, se aplica y re-renderiza; si
   es de un huerto en segundo plano, solo se guarda en su store. */
function pzFbStartListenerFor(huerto){
  var ref = pzFbDocRef(huerto);
  if(!ref) return;
  if(PZFB.unsubs[huerto]){ try{ PZFB.unsubs[huerto](); }catch(e){} }
  PZFB.unsubs[huerto] = ref.onSnapshot({includeMetadataChanges:false}, function(doc){ try{FBCOUNT.read();}catch(e){}
    PZFB.online = true;
    if(!doc.exists){
      // Nube vacia. Solo el huerto 2018 se auto-siembra con la semilla RAW;
      // el 2024 se inicializa cuando el admin sube su primer Excel.
      try{
        if(huerto==='2018' && huerto===PZ_HUERTO && typeof can==='function' && can('presupuesto.editar')){ pzFbPush(); }
      }catch(e){}
      return;
    }
    var d = doc.data() || {};
    if(d._clientId === PZFB.clientId && d._version === PZFB.lastVersion){ return; }
    if(!d.payload) return;
    var obj;
    try{ obj = JSON.parse(d.payload); }catch(e){ console.error('[PZ-Firebase] payload invalido'); return; }
    if(huerto === PZ_HUERTO){ pzLoadDataset(obj); }
    else { pzStorePayload(huerto, obj); }
  }, function(err){
    console.error('[PZ-Firebase] onSnapshot error ('+huerto+'):', err);
  });
}
function pzFbStartListener(){ pzFbStartListenerFor('2018'); pzFbStartListenerFor('2024'); }
/* pzFbInit(): inicializa la sincronización del presupuesto. Reusa la app de
   Firebase ya inicializada por el SCI/Cuaderno. */
function pzFbInit(){
  try{
    if(typeof firebase === 'undefined'){ console.warn('[PZ-Firebase] SDK no disponible. Presupuesto solo local.'); return; }
    if(!firebase.apps || !firebase.apps.length){ console.warn('[PZ-Firebase] App Firebase no inicializada aún.'); return; }
    PZFB.ready = true;
    if(!PZFB.listenerStarted){
      PZFB.listenerStarted = true;
      // Si hay auth, esperar a que esté lista; si no, arrancar directo.
      if(firebase.auth){
        var started=false;
        firebase.auth().onAuthStateChanged(function(u){ if(u && !started){ started=true; pzFbStartListener(); } });
        setTimeout(function(){ if(!started){ started=true; pzFbStartListener(); } }, 6000);
      } else {
        pzFbStartListener();
      }
    }
  }catch(e){ console.error('[PZ-Firebase] init error:', e); }
}

var _pzReady = false;
function pzInit(){
  // (Re)inicializa el dashboard sobre el DOM ya inyectado.
  try{
    if(!_pzReady){
      populateFilters();
      _pzReady = true;
    } else {
      // al re-entrar, reconstruir filtros por si el DOM se recreó
      populateFilters();
    }
    render();
    updateBanner();
    try{ pzAplicarEtiquetasHuerto(); }catch(e){}
    // Boton 'Actualizar datos': solo visible para quien puede editar (admin).
    try{
      var _btn = document.getElementById('pz-btn-upload');
      if(_btn){ _btn.style.display = (typeof can==='function' && can('presupuesto.editar')) ? '' : 'none'; }
    }catch(e){}
    // El Tipo de Cambio del último mes cargado ya lo fija render()→refreshLastUpdate()
    // (TC implícito del Excel, con respaldo al Valor USD de Indicadores Diarios para
    // ese mismo mes). No se vuelve a tocar aquí para no pisarlo con un mes mal ordenado.
    // Superficie del huerto activo: suma de hectáreas de los paños de esa
    // Plantación (Cuaderno de Campo). Si no hay, queda editable manualmente.
    try{ pzAplicarSuperficieHuerto(); }catch(e){}
  }catch(e){ console.error('PZ init error:', e); }
}
function pzReset(){ _pzReady = false; }

// Filtros: enganchar change para re-render (en el original había listeners
// implícitos vía onchange en algunos; aseguramos consistencia).
function pzWireFilters(){
  ['f-temporada','f-mes','f-tipo','f-subgrupo','f-desc'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && !el._pzWired){ el.addEventListener('change', render); el._pzWired = true; }
  });
}

// ── Criterios por Temporada (pestaña del presupuesto) ──────────────
// Almacena criterios en config key 'pz_criterios': array acumulativo por
// temporada con tipo de gasto y detalle descriptivo. Editable.
var _PZ_CRIT_KEY = 'pz_criterios';
function _pzGetCriterios(){
  try{
    var c = (STATE.cache.config && STATE.cache.config[_PZ_CRIT_KEY]) || null;
    return (c && Array.isArray(c.items)) ? c.items : [];
  }catch(e){ return []; }
}
async function _pzSaveCriterios(items){
  var obj = { key:_PZ_CRIT_KEY, items:items, _updatedAt:new Date().toISOString() };
  STATE.cache.config = STATE.cache.config || {};
  STATE.cache.config[_PZ_CRIT_KEY] = obj;
  await dbPut('config', obj);
}
// Actualiza etiquetas dependientes del huerto activo (banner + subtitulo).
function pzAplicarEtiquetasHuerto(){
  var supLbl=document.getElementById('rb-sup-label');
  if(supLbl) supLbl.textContent = 'Superficie CZ ' + PZ_HUERTO;
  var sub=document.getElementById('subtitle-huerto');
  if(sub) sub.textContent = 'Huerto Cerezos ' + PZ_HUERTO;
}
// Ajusta el campo Superficie según la Plantación del huerto activo. Si el
// Cuaderno tiene paños de ese año, lo calcula y bloquea; si no, queda editable
// conservando el valor guardado del huerto.
function pzAplicarSuperficieHuerto(){
  try{
    var haInput=document.getElementById('rb-ha'); if(!haInput) return;
    var sub = haInput.closest('.rb-item') ? haInput.closest('.rb-item').querySelector('.rb-sub') : null;
    var suma=null;
    if(typeof window.pzSumaHaPlantacion==='function') suma=window.pzSumaHaPlantacion(PZ_HUERTO);
    else if(PZ_HUERTO==='2018' && typeof window.pzSumaHa2018==='function') suma=window.pzSumaHa2018();
    if(suma!=null && suma>0){
      haInput.value=(Math.round(suma*100)/100).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
      haInput.readOnly=true;
      haInput.title='Calculado: suma de hectareas de panos Plantacion '+PZ_HUERTO+' (Cuaderno de Campo)';
      if(sub) sub.textContent='Ha \u00b7 suma panos '+PZ_HUERTO+' (Cuaderno)';
    } else {
      haInput.readOnly=false;
      haInput.title='Editable \u00b7 Superficie en hectareas';
      if(sub) sub.textContent='Ha \u00b7 ingresa la superficie';
    }
  }catch(e){}
}
// Cambia el huerto activo: snapshot del actual, restaura el destino y re-render.
function pzSetHuerto(huerto){
  if(huerto===PZ_HUERTO){ return; }
  try{ pzSnapshotHuerto(); }catch(e){}
  PZ_HUERTO = huerto;
  try{ pzRestaurarHuerto(huerto); }catch(e){}
  pzAplicarEtiquetasHuerto();
  try{ pzAplicarSuperficieHuerto(); }catch(e){}
}
// Cambiar pestaña Dashboard 2018 / Dashboard 2024 / Formato GTT / Criterios
window.pzCambiarTab = function(tab){
  PZ_TAB = tab;
  var pDash=document.getElementById('pz-pane-dashboard');
  var pCrit=document.getElementById('pz-pane-criterios');
  document.querySelectorAll('.pz-tab-btn').forEach(function(b){
    var t=b.getAttribute('data-pztab');
    b.style.borderBottomColor=(t===tab)?'#1565c0':'transparent';
    b.style.color=(t===tab)?'#1565c0':'#888';
    b.classList.toggle('pz-tab-active', t===tab);
  });
  var esDash = (tab==='dashboard' || tab==='dashboard2024' || tab==='gtt');
  // "Formato GTT" y ambos dashboards reutilizan el pane del dashboard.
  if(pDash) pDash.style.display = esDash ? '' : 'none';
  if(pCrit) pCrit.style.display = (tab==='criterios') ? '' : 'none';
  var pEer=document.getElementById('pz-pane-eerha');
  if(pEer) pEer.style.display = (tab==='eerha') ? '' : 'none';
  if(esDash){
    // Los dashboards fijan el huerto; GTT conserva el huerto activo.
    if(tab==='dashboard')      pzSetHuerto('2018');
    else if(tab==='dashboard2024') pzSetHuerto('2024');
    var vistaNueva = (tab==='gtt') ? 'GTT' : 'STD';
    var faltanGtt = (vistaNueva==='GTT' && (!ACTIVE_DATA_GTT || !ACTIVE_DATA_GTT.length));
    var warn=document.getElementById('pz-gtt-warn');
    if(warn) warn.style.display = faltanGtt ? 'block' : 'none';
    var tools=document.getElementById('pz-gtt-tools');
    if(tools) tools.style.display = (vistaNueva==='GTT') ? 'block' : 'none';
    // Re-render siempre (cambio de huerto o de vista lo requiere).
    PZ_VISTA = vistaNueva;
    pzAplicarEtiquetasHuerto();
    try{ rebuildFilters(pzDataset()); }catch(e){}
    try{ populateFilters(); }catch(e){}
    try{ render(); }catch(e){}
    try{ updateBanner(); }catch(e){}
    var h1=document.getElementById('pz-dash-title');
    if(h1) pzActualizarTitulo();
  }
  if(tab==='criterios'){
    pzPopularSelectoresCriterios();
    pzRenderCriterios();
  }
  if(tab==='eerha'){
    try{ pzCargarEERInputs(); }catch(e){}
    try{ pzRenderEERHa(); }catch(e){}
  }
  pzActualizarTitulo();
};
// Popular los selectores de temporada y tipo de gasto
window.pzPopularSelectoresCriterios = function(){
  // Temporadas: las del presupuesto + las de criterios existentes + actual
  var temps={};
  var allD=ACTIVE_DATA||RAW||[];
  allD.forEach(function(d){ var t=_getTemporada(d); if(t) temps[t]=1; });
  _pzGetCriterios().forEach(function(c){ if(c.temporada) temps[c.temporada]=1; });
  try{ var ta=temporadaActual(); if(ta) temps[ta]=1; var ini=parseInt(ta.split('-')[0]); temps[(ini+1)+'-'+(ini+2)]=1; }catch(e){}
  temps['2025-2026']=1;
  var tList=Object.keys(temps).sort();
  // Selector de temporada del formulario
  var sel=document.getElementById('pz-crit-temp');
  if(sel){
    var cur=sel.value;
    sel.innerHTML='<option value="">Seleccione</option>';
    tList.forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); });
    if(cur && tList.indexOf(cur)>=0) sel.value=cur;
  }
  // (El filtro de temporada de criterios ahora es el filtro global del Dashboard: f-temporada)
  // Tipos de gasto: del Excel + algunos comunes
  var tipos={};
  allD.forEach(function(d){ var g=d.DESCRIPCION; if(g) tipos[g]=1; });
  ['Poda','Raleo','Cosecha','Fertilización','Fitosanitario','Riego','Mano de Obra','Contratista','Maquinaria','Otros'].forEach(function(t){ tipos[t]=1; });
  var tSel=document.getElementById('pz-crit-tipo');
  if(tSel){
    var curT=tSel.value;
    tSel.innerHTML='<option value="">Seleccione</option>';
    Object.keys(tipos).sort().forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; tSel.appendChild(o); });
    if(curT) tSel.value=curT;
  }
};
// Guardar un criterio
window.pzGuardarCriterio = async function(){
  if(typeof can==='function' && !can('presupuesto.editar')){
    if(typeof toast==='function') toast('Sin permiso','Necesita permiso de edición','error');
    return;
  }
  var temp=(document.getElementById('pz-crit-temp')||{}).value||'';
  var tipo=(document.getElementById('pz-crit-tipo')||{}).value||'';
  var detalle=(document.getElementById('pz-crit-detalle')||{}).value||'';
  if(!temp){ if(typeof toast==='function') toast('Falta temporada','Seleccione una temporada','error'); return; }
  if(!tipo){ if(typeof toast==='function') toast('Falta tipo','Seleccione un tipo de gasto','error'); return; }
  if(!detalle.trim()){ if(typeof toast==='function') toast('Falta detalle','Describa el criterio','error'); return; }
  var items=_pzGetCriterios();
  // Si estamos editando (hay un id de edición activo), actualizar en vez de crear.
  var editId=document.getElementById('pz-crit-edit-id');
  if(editId && editId.value){
    var ex=items.find(function(c){ return c.id===editId.value; });
    if(ex){ ex.huerto=ex.huerto||PZ_HUERTO; ex.temporada=temp; ex.tipo=tipo; ex.detalle=detalle.trim(); ex.modificado=new Date().toISOString(); ex.usuario=(STATE.user?(STATE.user.nombre||STATE.user.id):''); }
    editId.value='';
    document.querySelector('#pz-criterio-form .pz-crit-cancel-btn')?.remove();
  } else {
    items.push({
      id:'cr_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      huerto:PZ_HUERTO,
      temporada:temp, tipo:tipo, detalle:detalle.trim(),
      fecha:new Date().toISOString(),
      usuario:(STATE.user?(STATE.user.nombre||STATE.user.id):'')
    });
  }
  await _pzSaveCriterios(items);
  // Limpiar formulario
  document.getElementById('pz-crit-detalle').value='';
  if(typeof toast==='function') toast('Criterio guardado','','success');
  pzRenderCriterios();
};
// Renderizar lista de criterios
window.pzRenderCriterios = function(){
  var el=document.getElementById('pz-criterios-list'); if(!el) return;
  var items=_pzGetCriterios();
  // Criterios del huerto activo (los antiguos sin huerto se asumen 2018).
  items=items.filter(function(c){ return (c.huerto||'2018')===PZ_HUERTO; });
  // La temporada se controla con el filtro global del Dashboard (f-temporada)
  var filtro=(document.getElementById('f-temporada')||{}).value||'';
  var lbl=document.getElementById('pz-crit-temp-activa'); if(lbl) lbl.textContent = filtro || 'Todas';
  if(filtro) items=items.filter(function(c){ return c.temporada===filtro; });
  // Ordenar por temporada desc, luego por fecha desc
  items.sort(function(a,b){ return (b.temporada||'').localeCompare(a.temporada||'') || (b.fecha||'').localeCompare(a.fecha||''); });
  if(!items.length){
    el.innerHTML='<div style="color:#999;padding:24px;text-align:center;font-size:13px">No hay criterios registrados'+(filtro?' para la temporada '+filtro:'')+'.</div>';
    return;
  }
  var puedeEditar=(typeof can==='function')&&can('presupuesto.editar');
  // Agrupar por temporada
  var porTemp={};
  items.forEach(function(c){ var t=c.temporada||'—'; if(!porTemp[t]) porTemp[t]=[]; porTemp[t].push(c); });
  var html='';
  Object.keys(porTemp).sort().reverse().forEach(function(temp){
    html+='<div style="margin-bottom:16px"><div style="font-size:14px;font-weight:800;color:#1565c0;border-bottom:2px solid #e3e8ee;padding-bottom:4px;margin-bottom:8px">📅 Temporada '+escapeHtml(temp)+'</div>';
    porTemp[temp].forEach(function(c){
      var fechaFmt=''; try{ fechaFmt=new Date(c.fecha).toLocaleDateString('es-CL'); }catch(e){ fechaFmt=c.fecha||''; }
      html+='<div style="background:#fff;border:1px solid #e3e8ee;border-radius:8px;padding:12px 14px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="background:#eff6ff;color:#1e40af;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px">'+escapeHtml(c.tipo||'')+'</span>'+
          '<span style="font-size:10px;color:#475569">'+escapeHtml(fechaFmt)+(c.usuario?' · '+escapeHtml(c.usuario):'')+'</span>'+
        '</div>'+
        '<div style="font-size:13px;color:#334155;line-height:1.5;white-space:pre-wrap">'+escapeHtml(c.detalle||'')+'</div>'+
        (puedeEditar?'<div style="margin-top:8px;display:flex;gap:6px">'+
          '<button onclick="pzEditarCriterio(\''+c.id+'\')" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:11px;color:#1565c0;font-weight:700;cursor:pointer">✏️ Editar</button>'+
          '<button onclick="pzEliminarCriterio(\''+c.id+'\')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:4px 10px;font-size:11px;color:#b91c1c;font-weight:700;cursor:pointer">✕ Eliminar</button>'+
        '</div>':'')+
      '</div>';
    });
    html+='</div>';
  });
  el.innerHTML=html;
};
// Editar un criterio: carga los datos en el formulario
window.pzEditarCriterio = function(id){
  var items=_pzGetCriterios();
  var c=items.find(function(x){ return x.id===id; }); if(!c) return;
  var tempSel=document.getElementById('pz-crit-temp'); if(tempSel) tempSel.value=c.temporada||'';
  var tipoSel=document.getElementById('pz-crit-tipo'); if(tipoSel) tipoSel.value=c.tipo||'';
  var det=document.getElementById('pz-crit-detalle'); if(det) det.value=c.detalle||'';
  // Marcar id de edición
  var hidEdit=document.getElementById('pz-crit-edit-id');
  if(!hidEdit){ hidEdit=document.createElement('input'); hidEdit.type='hidden'; hidEdit.id='pz-crit-edit-id'; document.getElementById('pz-criterio-form').appendChild(hidEdit); }
  hidEdit.value=id;
  // Agregar botón cancelar edición si no existe
  if(!document.querySelector('#pz-criterio-form .pz-crit-cancel-btn')){
    var cancelBtn=document.createElement('button');
    cancelBtn.className='pz-crit-cancel-btn';
    cancelBtn.textContent='Cancelar edición';
    cancelBtn.style.cssText='padding:10px 20px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#666;font-size:13px;font-weight:700;cursor:pointer;margin-left:8px';
    cancelBtn.onclick=function(){ document.getElementById('pz-crit-edit-id').value=''; det.value=''; cancelBtn.remove(); };
    document.querySelector('#pz-criterio-form button[onclick*="pzGuardarCriterio"]').insertAdjacentElement('afterend', cancelBtn);
  }
  det.focus();
};
// Eliminar un criterio
window.pzEliminarCriterio = function(id){
  if(typeof confirmDialog==='function'){
    confirmDialog('Eliminar criterio','¿Eliminar este criterio? Esta acción no se puede deshacer.', async function(){
      var items=_pzGetCriterios().filter(function(c){ return c.id!==id; });
      await _pzSaveCriterios(items);
      pzRenderCriterios();
      if(typeof toast==='function') toast('Criterio eliminado','','success');
    }, 'Eliminar', true);
  }
};

/* pzExportarResumenHa(): genera el "Estado Resultado Operación por Hectárea"
   (formato GTT / CEAgro) con SOLO los gastos, tomados del dataset GTT de la
   temporada seleccionada, agrupados Tipo GTT → Cuenta GTT → Familia GTT.
   Las columnas de producción, precios y utilidades quedan en blanco para
   completarse a mano. Se descarga como .xlsx usando SheetJS (ya cargado). */
window.pzExportarResumenHa = function(){
  if(typeof XLSX==='undefined'){ try{toast('Librería Excel no disponible.');}catch(e){} return; }
  var G = (typeof ACTIVE_DATA_GTT!=='undefined' && ACTIVE_DATA_GTT) ? ACTIVE_DATA_GTT : [];
  if(!G.length){ try{toast('Sin datos GTT: recarga el Excel con "Actualizar datos".');}catch(e){} return; }
  function num(id){ var el=document.getElementById(id); if(!el) return null;
    var v=(el.value||'').toString().replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,'');
    var n=parseFloat(v); return isNaN(n)?null:n; }
  var tempSel = (document.getElementById('f-temporada')||{}).value || '';
  var S  = num('rb-ha') || 0;      // superficie (ha)
  var TC = num('rb-tc');           // tipo de cambio
  var kgEst = num('rb-kg-est');
  var kgCos = num('rb-kg');

  // Filtrar por temporada y agrupar Tipo → Cuenta → Familia (real).
  var rows = G.filter(function(d){ return !tempSel || _getTemporada(d)===tempSel; });
  var ORD = ['COSTOS DIRECTOS','COSTOS DIRECTOS COSECHA','COSTOS INDIRECTOS','GASTOS FINANCIEROS','IMPREVISTOS'];
  var tree = {}, totalReal = 0;
  rows.forEach(function(d){
    var tipo=(d['TIPO DE COSTO']||'—').trim(), cuenta=(d['SUB-GRUPO']||'—').trim(), fam=(d['DESCRIPCION']||'—').trim();
    var r=parseFloat(d['MONTO REAL'])||0;
    tree[tipo]=tree[tipo]||{__t:0,c:{}};
    tree[tipo].c[cuenta]=tree[tipo].c[cuenta]||{__t:0,f:{}};
    tree[tipo].c[cuenta].f[fam]=(tree[tipo].c[cuenta].f[fam]||0)+r;
    tree[tipo].c[cuenta].__t+=r; tree[tipo].__t+=r; totalReal+=r;
  });
  var perHa=function(v){ return S>0 ? Math.round(v/S) : ''; };
  var pct  =function(v){ return totalReal>0 ? +(v/totalReal*100).toFixed(1) : ''; };

  // Nombre del cuartel/variedad desde el banner si están.
  var A = []; // array of arrays
  A.push(['Agrícola La Cabaña','','','','','','']);
  A.push(['CEREZOS · ESTADO RESULTADO OPERACIÓN POR HECTÁREA','','','','','','']);
  A.push(['Temporada '+(tempSel||'(todas)'),'','','','','','']);
  A.push([]);
  A.push(['PRODUCCIÓN HUERTO — completar manualmente','','','','','','']);
  A.push(['Mercado','kg/ha','$/kg','US$/kg','$ por ha','$ total','%']);
  A.push(['Exportación','','','','','','']);
  A.push(['Categoría 2 (bajo calibre)','','','','','','']);
  A.push(['Descarte','','','','','','']);
  A.push(['TOTAL kg/ha','','','','','','']);
  A.push([]);

  function seccion(titulo, tipo){
    A.push([titulo,'','','','','','']);
    A.push(['Ítem','kg/ha','$/kg','US$/kg','$ por ha','$ total','% costos']);
    var node = tree[tipo]; if(!node) { A.push(['(sin datos)','','','','','','']); return 0; }
    Object.keys(node.c).sort().forEach(function(cuenta){
      var cn=node.c[cuenta];
      A.push([cuenta,'','','', perHa(cn.__t), Math.round(cn.__t), pct(cn.__t)]);
      // sub-líneas por Familia GTT (solo si hay más de una o difiere del nombre)
      var fams=Object.keys(cn.f).sort();
      if(!(fams.length===1 && fams[0]===cuenta)){
        fams.forEach(function(fam){
          A.push(['   '+fam,'','','', perHa(cn.f[fam]), Math.round(cn.f[fam]), pct(cn.f[fam])]);
        });
      }
    });
    A.push(['Sub-Total '+titulo,'','','', perHa(node.__t), Math.round(node.__t), pct(node.__t)]);
    return node.__t;
  }

  var directos = seccion('COSTOS DIRECTOS','COSTOS DIRECTOS');
  // Directos cosecha (si existe como tipo aparte)
  if(tree['COSTOS DIRECTOS COSECHA']){ A.push([]); directos += seccion('COSTOS DIRECTOS COSECHA','COSTOS DIRECTOS COSECHA'); }
  A.push([]);
  A.push(['UTILIDAD OPERACIONAL / ha — completar manualmente','','','','','','']);
  A.push([]);
  var indirectos = seccion('COSTOS INDIRECTOS','COSTOS INDIRECTOS');
  // Otros tipos GTT no estándar (financieros, imprevistos) si aparecen.
  Object.keys(tree).forEach(function(t){
    if(ORD.indexOf(t)<0 && t!=='COSTOS DIRECTOS' && t!=='COSTOS DIRECTOS COSECHA' && t!=='COSTOS INDIRECTOS'){
      A.push([]); seccion(t, t);
    }
  });
  A.push([]);
  A.push(['TOTAL COSTOS / ha','','','', perHa(totalReal), Math.round(totalReal), 100]);
  A.push([]);
  A.push(['UTILIDAD TOTAL / ha — completar manualmente','','','','','','']);
  A.push([]);
  A.push(['DATOS','','','','','','']);
  A.push(['Superficie Cuartel/Huerto (ha)', S||'', '','','','','']);
  A.push(['Kilos Estimados', kgEst||'', '','','','','']);
  A.push(['Kilos Cosechados', kgCos||'', '','','','','']);
  A.push(['Tipo de Cambio (USD)', TC||'', '','','','','']);
  A.push(['Variedad Cuartel/Huerto', '', '','','','','']);
  A.push(['Nombre Cuartel/Huerto', '', '','','','','']);
  A.push(['Año Plantación', '', '','','','','']);
  A.push(['Precio Venta Promedio Export (USD)', '', '','','','','']);
  A.push([]);
  A.push(['Fuente: Control de Presupuesto SCI · Formato GTT Nahuelbuta (CEAgro) · solo gastos reales','','','','','','']);

  var ws = XLSX.utils.aoa_to_sheet(A);
  ws['!cols'] = [{wch:42},{wch:10},{wch:10},{wch:10},{wch:14},{wch:15},{wch:10}];
  // Combinar celdas de títulos de sección (columna A a G).
  ws['!merges'] = ws['!merges'] || [];
  A.forEach(function(r,i){
    var t=(r[0]||'').toString();
    if(r.length && (r[1]===''||r[1]==null) && (t===t.toUpperCase()) && t.length>3 && !/^\s/.test(t) && !r.slice(1).some(function(x){return x!==''&&x!=null;})){
      ws['!merges'].push({s:{r:i,c:0},e:{r:i,c:6}});
    }
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen x Ha');
  var fn = 'Resumen_Hectarea_'+(tempSel||'todas').replace(/[^0-9A-Za-z\-]/g,'')+'.xlsx';
  XLSX.writeFile(wb, fn);
  try{ toast('Resumen por hectárea generado ('+fn+').'); }catch(e){}
};

/* ============ ESTADO DE RESULTADO POR HECTAREA (formato CEAgro) ============
   Los costos se toman del presupuesto real (dataset del huerto/temporada
   activos); produccion, precios y parametros se ingresan y se guardan por
   huerto+temporada en config ('pz_eerha'). */
var _PZ_EER_KEY = 'pz_eerha';
function _pzEERMap(){
  try{ var c=(STATE.cache.config && STATE.cache.config[_PZ_EER_KEY])||null;
    return (c && c.data && typeof c.data==='object') ? c.data : {}; }catch(e){ return {}; }
}
function _pzEERSlot(){
  var t=(document.getElementById('f-temporada')||{}).value||'todas';
  return PZ_HUERTO+'|'+t;
}
function _pzSaveEERMap(map){
  var obj={ key:_PZ_EER_KEY, data:map, _updatedAt:new Date().toISOString() };
  STATE.cache.config=STATE.cache.config||{}; STATE.cache.config[_PZ_EER_KEY]=obj;
  try{ dbPut('config', obj); }catch(e){}
}
var _EER_FIELDS=['eer-exp-kg','eer-exp-precio','eer-cat2-kg','eer-cat2-precio','eer-desc-kg','eer-desc-precio','eer-variedad','eer-cuartel','eer-anio','eer-precio-usd','eer-gfin'];
function pzCargarEERInputs(){
  var map=_pzEERMap(); var slot=map[_pzEERSlot()]||{};
  _EER_FIELDS.forEach(function(id){ var el=document.getElementById(id); if(el) el.value=(slot[id]!=null?slot[id]:''); });
}
function pzGuardarEERInputs(){
  var map=_pzEERMap(); var slot={};
  _EER_FIELDS.forEach(function(id){ var el=document.getElementById(id); if(el) slot[id]=el.value||''; });
  map[_pzEERSlot()]=slot; _pzSaveEERMap(map);
}
function _eerNum(id){ var el=document.getElementById(id); if(!el) return 0;
  var v=(el.value||'').toString().replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,'');
  var n=parseFloat(v); return isNaN(n)?0:n; }
function _eerTxt(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; }

// Arbol de costos reales con clasificacion GTT (Tipo GTT -> Cuenta GTT ->
// Familia GTT), tomado del dataset GTT del huerto activo (ACTIVE_DATA_GTT).
function pzEERCostTree(){
  var base=(typeof ACTIVE_DATA_GTT!=='undefined' && ACTIVE_DATA_GTT && ACTIVE_DATA_GTT.length) ? ACTIVE_DATA_GTT : [];
  var falta=!base.length;
  var tempSel=(document.getElementById('f-temporada')||{}).value||'';
  var rows=base.filter(function(d){ return !tempSel || _getTemporada(d)===tempSel; });
  var tree={}, total=0;
  rows.forEach(function(d){
    var tipo=((d['TIPO DE COSTO']||'OTROS')+'').trim().toUpperCase();
    var sub=((d['SUB-GRUPO']||'—')+'').trim();
    var desc=((d['DESCRIPCION']||'—')+'').trim();
    var r=parseFloat(d['MONTO REAL'])||0;
    if(!r) return;
    tree[tipo]=tree[tipo]||{t:0,sub:{}};
    tree[tipo].sub[sub]=tree[tipo].sub[sub]||{t:0,desc:{}};
    tree[tipo].sub[sub].desc[desc]=(tree[tipo].sub[sub].desc[desc]||0)+r;
    tree[tipo].sub[sub].t+=r; tree[tipo].t+=r; total+=r;
  });
  return {tree:tree, total:total, tempSel:tempSel, falta:falta};
}

function pzBuildEERHaHTML(){
  pzGuardarEERInputs();
  var ha=_eerNum('rb-ha'); var tc=_eerNum('rb-tc');
  var prod=[
    {n:'Exportación', kg:_eerNum('eer-exp-kg'), pr:_eerNum('eer-exp-precio')},
    {n:'Categoría 2 (bajo calibre)', kg:_eerNum('eer-cat2-kg'), pr:_eerNum('eer-cat2-precio')},
    {n:'Descarte', kg:_eerNum('eer-desc-kg'), pr:_eerNum('eer-desc-precio')}
  ];
  var totKg=0, totProd=0;
  prod.forEach(function(m){ m.ha=m.kg*m.pr; totKg+=m.kg; totProd+=m.ha; });
  var precioProm = totKg>0 ? totProd/totKg : 0;

  var CT=pzEERCostTree();
  var tree=CT.tree, totalCostTot=CT.total;
  var perHa=function(v){ return ha>0 ? v/ha : 0; };
  var gfinTot=_eerNum('eer-gfin'); var gfinHa=perHa(gfinTot);
  var totalCostHa=perHa(totalCostTot)+gfinHa;
  function _eerCls(t){ if(/INDIRECT/.test(t)) return 'ind'; if(/DIRECT|COSECHA/.test(t)) return 'dir'; return 'otro'; }
  var _tipos=Object.keys(tree);
  var _dirTipos=_tipos.filter(function(t){return _eerCls(t)==='dir';}).sort();
  var _indTipos=_tipos.filter(function(t){return _eerCls(t)==='ind';}).sort();
  var _otroTipos=_tipos.filter(function(t){return _eerCls(t)==='otro';}).sort();
  var directosTot=_dirTipos.reduce(function(s,t){return s+tree[t].t;},0);
  var directosHa=perHa(directosTot);
  var margenOpHa=totProd-directosHa;
  var utilTotalHa=totProd-totalCostHa;
  var rentab = totalCostHa!==0 ? (utilTotalHa/Math.abs(totalCostHa)*100) : null;

  // Formatters
  function f0(n){ if(n===''||n==null||isNaN(n)) return '—'; var s=(n<0?'-':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-CL'); return s; }
  function fkg(n){ if(n===''||n==null||isNaN(n)) return '—'; return Math.round(n).toLocaleString('es-CL'); }
  function fu(n){ if(n===''||n==null||isNaN(n)) return '—'; return 'US$ '+n.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fp(n){ if(n===''||n==null||isNaN(n)) return '—'; return n.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:1})+'%'; }
  function neg(n){ return (typeof n==='number'&&n<0)?'color:#c0392b':''; }

  var HEAD='background:#1565c0;color:#fff;font-weight:700';
  var SUBT='background:#eef4fb;font-weight:800';
  var YEL='background:#fff7cc';
  var TD='padding:5px 9px;border-bottom:1px solid #e6ecf3;font-size:12.5px';
  var TDr='padding:5px 9px;border-bottom:1px solid #e6ecf3;font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums';

  function bandRow(txt){ return '<tr><td colspan="6" style="'+TD+';'+HEAD+';border-bottom:1px solid #0f4c9a">'+txt+'</td></tr>'; }
  function colHdr(first){ return '<tr style="color:#64748b;background:#f1f6fc">'+
    '<th style="'+TD+';text-align:left">'+first+'</th>'+
    '<th style="'+TDr+'">kg/ha</th><th style="'+TDr+'">$/kg</th><th style="'+TDr+'">US$/kg</th><th style="'+TDr+'">$ por ha</th><th style="'+TDr+'">%</th></tr>'; }
  function dataRow(name, kgha, dkg, ukg, porha, pctv, style){
    style=style||'';
    return '<tr style="'+style+'">'+
      '<td style="'+TD+'">'+name+'</td>'+
      '<td style="'+TDr+'">'+fkg(kgha)+'</td>'+
      '<td style="'+TDr+'">'+f0(dkg)+'</td>'+
      '<td style="'+TDr+'">'+fu(ukg)+'</td>'+
      '<td style="'+TDr+';'+YEL+';'+neg(porha)+'">'+f0(porha)+'</td>'+
      '<td style="'+TDr+'">'+fp(pctv)+'</td></tr>';
  }

  var H='';
  H+='<table style="width:100%;min-width:560px;border-collapse:collapse;border:1px solid #cbd8e6;border-radius:8px;overflow:hidden">';
  // Produccion
  H+=bandRow('PRODUCCIÓN HUERTO');
  H+=colHdr('Mercado');
  prod.forEach(function(m){
    H+=dataRow(m.n, m.kg, m.pr, (tc?m.pr/tc:null), m.ha, (totKg>0?m.kg/totKg*100:null));
  });
  H+=dataRow('TOTAL kg / ha', totKg, precioProm, (tc?precioProm/tc:null), totProd, 100, SUBT);

  // Costos directos
  function costSection(title, tipo){
    var node=tree[tipo]; if(!node) return 0;
    H+=bandRow(title);
    H+=colHdr('Ítem');
    Object.keys(node.sub).sort().forEach(function(sub){
      var sn=node.sub[sub], v=perHa(sn.t);
      H+=dataRow(sub, (precioProm>0?v/precioProm:null), (totKg>0?v/totKg:null), (totKg>0&&tc?(v/totKg)/tc:null), v, (totalCostHa>0?v/totalCostHa*100:null), 'font-weight:600');
      var fams=Object.keys(sn.desc).sort();
      if(!(fams.length===1 && fams[0]===sub)){
        fams.forEach(function(fm){ var fv=perHa(sn.desc[fm]);
          H+=dataRow('&nbsp;&nbsp;&nbsp;'+fm, (precioProm>0?fv/precioProm:null), (totKg>0?fv/totKg:null), (totKg>0&&tc?(fv/totKg)/tc:null), fv, (totalCostHa>0?fv/totalCostHa*100:null), 'color:#64748b');
        });
      }
    });
    var tv=perHa(node.t);
    H+=dataRow('Sub-Total '+title, (precioProm>0?tv/precioProm:null), (totKg>0?tv/totKg:null), (totKg>0&&tc?(tv/totKg)/tc:null), tv, (totalCostHa>0?tv/totalCostHa*100:null), SUBT);
    return node.t;
  }
  _dirTipos.forEach(function(t){ costSection(t, t); });

  // Margen operacional
  H+=bandRow('UTILIDAD / MARGEN OPERACIONAL');
  H+=dataRow('Margen Operacional / ha', null, null, (tc?margenOpHa/tc:null), margenOpHa, null, 'font-weight:800');

  _indTipos.forEach(function(t){ costSection(t, t); });
  _otroTipos.forEach(function(t){ costSection(t, t); });

  // Gastos financieros de grupo (ingreso manual)
  if(gfinTot){
    H+=bandRow('GASTOS FINANCIEROS (financiamiento grupo)');
    H+=dataRow('Intereses financiamiento grupo (manual)', (precioProm>0?gfinHa/precioProm:null), (totKg>0?gfinHa/totKg:null), (totKg>0&&tc?(gfinHa/totKg)/tc:null), gfinHa, (totalCostHa>0?gfinHa/totalCostHa*100:null), 'font-weight:600');
  }

  // Totales
  H+=bandRow('RESULTADO');
  H+=dataRow('TOTAL COSTOS / ha', (precioProm>0?totalCostHa/precioProm:null), (totKg>0?totalCostHa/totKg:null), (totKg>0&&tc?(totalCostHa/totKg)/tc:null), totalCostHa, 100, SUBT);
  H+=dataRow('UTILIDAD TOTAL / ha', null, null, (tc?utilTotalHa/tc:null), utilTotalHa, null, 'font-weight:800;'+SUBT);
  H+='<tr style="'+SUBT+'"><td style="'+TD+'">Rentabilidad Sobre Costos</td><td colspan="4" style="'+TD+'"></td><td style="'+TDr+';'+neg(rentab)+'">'+fp(rentab)+'</td></tr>';
  H+='</table>';

  // Parametros
  var boxItem=function(l,v){ return '<div style="border:1px solid #e3e8ee;border-radius:8px;padding:8px 12px"><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase">'+l+'</div><div style="font-size:14px;font-weight:700;color:#23303d">'+(v||'—')+'</div></div>'; };
  var params='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px">'+
    boxItem('Variedad', _eerTxt('eer-variedad'))+
    boxItem('Nombre Cuartel/Huerto', _eerTxt('eer-cuartel'))+
    boxItem('Superficie (ha)', ha? ha.toLocaleString('es-CL'):'')+
    boxItem('Año Plantación', _eerTxt('eer-anio'))+
    boxItem('Precio Venta Prom. Export', _eerTxt('eer-precio-usd')? ('US$ '+_eerTxt('eer-precio-usd')):'')+
    boxItem('Tipo de Cambio (USD)', tc? tc.toLocaleString('es-CL'):'')+
    '</div>';

  var titulo='<div style="text-align:center;margin-bottom:12px">'+
    '<div style="font-size:16px;font-weight:800;color:#23303d;letter-spacing:.5px">CEREZOS · ESTADO DE RESULTADO OPERACIÓN POR HECTÁREA</div>'+
    '<div style="font-size:12.5px;color:#64748b">Huerto Cerezos '+PZ_HUERTO+' · Temporada '+(CT.tempSel||'(todas)')+'</div></div>';

  var avisoGtt = CT.falta ? '<div style="background:#fff8e1;border:1px solid #ffe082;color:#8a6d00;border-radius:9px;padding:10px 14px;font-size:12.5px;margin-bottom:12px">\u26a0\ufe0f No hay datos con clasificaci\u00f3n GTT cargados para este huerto. Los costos aparecer\u00e1n en blanco hasta que uses \u201cActualizar datos\u201d y vuelvas a seleccionar el Excel (las columnas GTT no se guardan en la nube).</div>' : '';
  var Hwrap='<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">'+H+'</div>';
  return titulo+avisoGtt+Hwrap+params+
    '<div style="font-size:10.5px;color:#475569;margin-top:10px">Fuente: Control de Presupuesto SCI · costos reales del huerto/temporada; producción y precios ingresados manualmente.</div>';
}

window.pzRenderEERHa=function(){
  var box=document.getElementById('eerha-report'); if(!box) return;
  try{ box.innerHTML=pzBuildEERHaHTML(); }catch(e){ console.error('EERHa render:',e); box.innerHTML='<div style="color:#c0392b;padding:16px">Error al generar el reporte.</div>'; }
};

window.pzImprimirEERHa=function(){
  var inner;
  try{ inner=pzBuildEERHaHTML(); }catch(e){ inner='<p>Error al generar.</p>'; }
  var w=window.open('','_blank'); if(!w){ try{toast('Permite ventanas emergentes para imprimir.');}catch(e){} return; }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Estado de Resultado por Hectárea</title>'+
    '<style>@page{size:letter portrait;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#23303d;padding:6px}'+
    'table{width:100%!important}th,td{-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>'+inner+'</body></html>');
  w.document.close();
  setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 350);
};


// ===================== LISTADO DE REVISIÓN (para gerencia) =====================
// Genera un Excel ordenado por Tipo de Costo → Descripción → Detalle, respetando
// los filtros activos (temporada, meses, tipo, subgrupo, descripción). Incluye
// columnas de checklist (¿Se ejecuta esta temporada? SÍ/NO) y Observaciones.
function generarListadoRevision(){
  try{
    if(typeof XLSX==='undefined'){ toast('Sin librería','Excel no disponible','error'); return; }
    var f = getFilters();
    var MONTH_ORDER = ['MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO','FEBRERO','MARZO','ABRIL'];

    // 1) Mapa Descripción → Tipo de Costo y Sub-Grupo (desde las filas de datos).
    var mapaTipo = {}, mapaSub = {};
    (pzDataset()||[]).forEach(function(d){
      var k=d.DESCRIPCION;
      if(k && !mapaTipo[k]){ mapaTipo[k]=(d["TIPO DE COSTO"]||'').trim(); mapaSub[k]=(d["SUB-GRUPO"]||'').trim(); }
    });

    // 2) Recolectar todos los detalles de las descripciones que pasan el filtro.
    var tempSel = f.temporada || '';
    var descripciones = Object.keys(mapaTipo);
    if(f.desc) descripciones = descripciones.filter(function(x){ return x===f.desc; });
    if(f.tipo) descripciones = descripciones.filter(function(x){ return mapaTipo[x]===f.tipo; });
    if(f.sub)  descripciones = descripciones.filter(function(x){ return mapaSub[x]===f.sub; });

    var filas = [];
    descripciones.forEach(function(desc){
      // El detalle ya viene segmentado por temporada: para 2025-2026 incluye
      // NOV-DIC 2025 y ENE-ABR 2026. El filtro de meses respeta ese año automáticamente.
      var items = _getDetalleFamilia(desc, tempSel) || [];
      if(f.meses && f.meses.length){ items = items.filter(function(x){ return f.meses.indexOf(x.mes)>=0; }); }
      items.forEach(function(x){
        var monto = Math.round(x.total||0);
        // SOLO gastos reales ejecutados (monto distinto de cero).
        if(!monto) return;
        filas.push({
          tipo: mapaTipo[desc]||'(sin tipo)',
          desc: desc,
          detalle: x.desc||'',
          proveedor: x.proveedor||'',
          doc: (x.numero!=null?x.numero:''),
          mes: x.mes||'',
          anio: (x.anio!=null?x.anio:''),
          monto: monto
        });
      });
    });

    if(!filas.length){ toast('Sin datos','No hay gastos para los filtros seleccionados','warning'); return; }

    // 3) Ordenar: Tipo de Costo → Descripción → Detalle.
    filas.sort(function(a,b){
      if(a.tipo!==b.tipo) return a.tipo.localeCompare(b.tipo,'es');
      if(a.desc!==b.desc) return a.desc.localeCompare(b.desc,'es');
      var am=MONTH_ORDER.indexOf(a.mes), bm=MONTH_ORDER.indexOf(b.mes);
      if(am!==bm) return (am<0?99:am)-(bm<0?99:bm);
      return a.detalle.localeCompare(b.detalle,'es');
    });

    // 4) Construir la hoja (array of arrays) con encabezado de contexto + tabla.
    var emp=''; try{ emp=(STATE.cache&&STATE.cache.config&&STATE.cache.config.empresa&&STATE.cache.config.empresa.nombre)||''; }catch(e){}
    var mesesTxt = (f.meses&&f.meses.length) ? f.meses.join(', ') : 'Todos los meses';
    var tempTxt = tempSel || 'Todas las temporadas';
    var hoy = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});

    var aoa = [];
    aoa.push([emp||'SOCIEDAD AGRÍCOLA Y FORESTAL LA CABAÑA LTDA.']);
    aoa.push(['Listado de Revisión de Gastos · Control de Presupuesto']);
    aoa.push(['Temporada: '+tempTxt, '', 'Meses: '+mesesTxt, '', 'Emitido: '+hoy]);
    aoa.push([]);
    aoa.push(['TIPO DE COSTO','DESCRIPCIÓN','DETALLE','PROVEEDOR','DOC','MES','AÑO','MONTO','¿SE EJECUTA? (SÍ/NO)','OBSERVACIONES']);

    var totalGeneral=0, tipoActual=null, subtotalTipo=0;
    function pushSubtotal(){
      if(tipoActual!==null){
        aoa.push(['', '', '', '', '', '', 'Subtotal '+tipoActual, subtotalTipo, '', '']);
      }
    }
    filas.forEach(function(r){
      if(r.tipo!==tipoActual){
        pushSubtotal();
        tipoActual=r.tipo; subtotalTipo=0;
      }
      aoa.push([r.tipo, r.desc, r.detalle, r.proveedor, r.doc, r.mes, r.anio, r.monto, '', '']);
      subtotalTipo+=r.monto; totalGeneral+=r.monto;
    });
    pushSubtotal();
    aoa.push([]);
    aoa.push(['', '', '', '', '', '', 'TOTAL GENERAL', totalGeneral, '', '']);

    // 5) Generar el Excel.
    var wb=XLSX.utils.book_new();
    var ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:26},{wch:34},{wch:40},{wch:26},{wch:10},{wch:12},{wch:7},{wch:14},{wch:20},{wch:34}];
    XLSX.utils.book_append_sheet(wb,ws,'Revisión gastos');
    var nombre='Listado_Revision_'+(tempSel||'todas').replace(/[^0-9A-Za-z-]/g,'')+'_'+new Date().toISOString().slice(0,10)+'.xlsx';
    XLSX.writeFile(wb,nombre);
    toast('Listado generado', filas.length+' gastos · '+tempTxt,'success');
  }catch(err){
    console.error('generarListadoRevision:',err);
    toast('Error','No se pudo generar el listado','error');
  }
}

window.PZ = {
  init: function(){ pzWireFilters(); pzInit(); },
  generarListadoRevision: generarListadoRevision,
  reset: pzReset,
  setCurrency: setCurrency,
  resetFilters: resetFilters,
  imprimirPDF: imprimirPDF,
  handleFileSelect: handleFileSelect,
  closeUploadModal: closeUploadModal,
  closeDetalleModal: closeDetalleModal,
  filterDetalleTable: filterDetalleTable,
  openDetalleModal: openDetalleModal,
  openDetalleSubgrupo: openDetalleSubgrupo,
  openComparadorModal: openComparadorModal,
  cerrarComparador: cerrarComparador,
  refrescarComparador: refrescarComparador,
  verDetalleComparado: verDetalleComparado,
  exportarComparador: exportarComparador,
  serializeDataset: pzSerializeDataset,
  loadDataset: pzLoadDataset,
  fbInit: pzFbInit,
  fbPush: pzFbPush,
  _fbState: function(){ return PZFB; }
};
})(); }
