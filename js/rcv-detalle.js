// rcv-detalle.js — V2.21.57 · Paso 2 del importador RCV: contabilización
// documento por documento.
//
// El paso 1 (importadores de compras y ventas) lee el RCV del SII y deja los
// documentos seleccionados. En este paso se abre cada documento con sus datos
// del RCV (tipo, folio, fechas, RUT, auxiliar, exento, neto, IVA, otros
// impuestos y total) y se distribuye en líneas: cuenta, descripción, monto
// neto, centro de costo y si la línea es afecta o exenta (por ejemplo,
// facturas de seguros con prima afecta y exenta).
//
// Validador (no deja guardar con diferencias):
//   • Σ líneas afectas = Neto del RCV
//   • Σ líneas exentas = Exento del RCV
//   • IVA calculado (Σ afectas × 19%) = IVA del RCV
//   • Σ líneas + IVA calculado + otros impuestos = Total del RCV
//   • Cada línea con cuenta válida y monto; descripción obligatoria si hay
//     más de una línea; centro de costo si la cuenta lo exige.
// Una diferencia de $1 por redondeo del emisor sólo se acepta marcándola.

import {fmtC, IVA, dteC, dteV, rutFmt, pdcNm, toast} from './core.js';
import {reglaCuenta} from './pdc-reglas.js';
import {ccOpts} from './centroscosto.js';
import {inputCuenta} from './buscadorcuentas.js';
import {tributacionCompra} from './motor-contable.js';

const n=v=>Math.round(+v||0);
// V2.21.62: tipo de línea. 'otro' = línea de otros impuestos del RCV (sólo compras)
const tipoL=l=>l&&l.otroImp?'otro':(l&&l.afecto===false?'exento':'afecto');
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Validador puro (testeable) ──
// tipo: 'compra' | 'venta'. doc: datos del RCV. lineas: [{cuenta,desc,monto,cc,afecto}]
function validarDetalleRCV(tipo,doc,lineas,{aceptaRedondeo=false,legacyOtros=false}={}){
  const errores=[],avisos=[];
  const dte=tipo==='compra'?dteC(doc.tipoDTE):dteV(doc.tipoDTE);
  const neto=n(doc.neto),exento=n(doc.exento),iva=n(doc.iva),otros=n(doc.otrosImpuestos),total=n(doc.total);
  const ls=(lineas||[]).map(l=>({...l,monto:n(l.monto)}));
  if(!ls.length)errores.push('Agrega al menos una línea.');
  const nBase=ls.filter(l=>tipoL(l)!=='otro').length;   // la línea de otro impuesto no obliga a describir la base
  ls.forEach((l,i)=>{
    const k=`Línea ${i+1}`;
    if(!l.cuenta)errores.push(`${k}: falta la cuenta.`);
    else{
      const r=reglaCuenta(l.cuenta);
      if(!r)errores.push(`${k}: la cuenta ${l.cuenta} no existe en el plan de cuentas.`);
      else{
        if(!r.aceptaMovimientos)errores.push(`${k}: la cuenta ${l.cuenta} es agrupadora y no acepta movimientos.`);
        if(r.activa===false)errores.push(`${k}: la cuenta ${l.cuenta} está inactiva.`);
        if(r.requiereCentroCosto&&!l.cc)errores.push(`${k}: la cuenta ${l.cuenta} exige centro de costo.`);
        if(l.cc&&!r.aceptaCentroCosto)avisos.push(`${k}: la cuenta ${l.cuenta} no admite centro de costo; se ignorará.`);
      }
    }
    if(!(l.monto>0))errores.push(`${k}: el monto debe ser mayor que cero.`);
    if((tipoL(l)==='otro'?ls.length>1:nBase>1)&&!String(l.desc||'').trim())errores.push(`${k}: la descripción es obligatoria cuando el documento tiene más de una línea.`);
  });
  const sumAfecto=ls.filter(l=>tipoL(l)==='afecto').reduce((s,l)=>s+l.monto,0);
  const sumExento=ls.filter(l=>tipoL(l)==='exento').reduce((s,l)=>s+l.monto,0);
  const sumOtros=ls.filter(l=>tipoL(l)==='otro').reduce((s,l)=>s+l.monto,0);
  // Otros impuestos: en compras se cruzan contra líneas propias (con su cuenta).
  // Detalles guardados antes de V2.21.62 (legacyOtros) y ventas: criterio anterior.
  const cruzaOtros=tipo==='compra'&&!legacyOtros;
  if(tipo!=='compra'&&sumOtros>0)errores.push('Las líneas de otros impuestos sólo aplican a compras.');
  const tasa=IVA;
  const ivaCalc=Math.round(sumAfecto*tasa);
  const difNeto=sumAfecto-neto, difExento=sumExento-exento, difIva=ivaCalc-iva;
  if(difNeto)errores.push(`Las líneas afectas suman ${fmtC(sumAfecto)} y el neto del RCV es ${fmtC(neto)} (diferencia ${fmtC(difNeto)}).`);
  if(difExento)errores.push(`Las líneas exentas suman ${fmtC(sumExento)} y el exento del RCV es ${fmtC(exento)} (diferencia ${fmtC(difExento)}).`);
  if(dte&&dte.afecto===false&&sumAfecto>0)errores.push(`El ${dte.nm||'documento'} no lleva IVA: todas las líneas deben ser exentas.`);
  const redondeoOk=v=>aceptaRedondeo&&Math.abs(v)<=1;
  const otrosLineas=cruzaOtros?sumOtros:otros;
  const difOtros=cruzaOtros?sumOtros-otros:0;
  if(difOtros&&!redondeoOk(difOtros)){
    if(otros>0&&!sumOtros)errores.push(`El RCV informa otros impuestos por ${fmtC(otros)}: agrega una línea de tipo "Otro impuesto" con su cuenta (costo/gasto, o 1108006 si es recuperable).`);
    else errores.push(`Las líneas de otros impuestos suman ${fmtC(sumOtros)} y el RCV informa ${fmtC(otros)} (diferencia ${fmtC(difOtros)}).`);
  }
  if(difIva&&!redondeoOk(difIva))errores.push(`IVA calculado ${fmtC(ivaCalc)} (19% de ${fmtC(sumAfecto)}) distinto del IVA del RCV ${fmtC(iva)} (diferencia ${fmtC(difIva)}).${Math.abs(difIva)<=1?' Si es redondeo del emisor, marca "Aceptar diferencia de $1".':''}`);
  // Total: en facturas de compra (45/46) el total del RCV puede informar el
  // total del documento o sólo lo pagadero al proveedor (sin el IVA retenido).
  const base=sumAfecto+sumExento;
  // El total se controla con el IVA CALCULADO desde las líneas, no con el del RCV
  let totalCalc=base+ivaCalc+otrosLineas, difTotal=totalCalc-total;
  const facturaCompra=tipo==='compra'&&(+doc.tipoDTE===45||+doc.tipoDTE===46||doc.ivaRetenido!=null);
  if(facturaCompra){
    const sinRet=base+otrosLineas;
    if(Math.abs(sinRet-total)<Math.abs(difTotal)){totalCalc=sinRet;difTotal=sinRet-total;}
  }
  if(difTotal&&!redondeoOk(difTotal))errores.push(`Líneas + IVA calculado + otros impuestos = ${fmtC(totalCalc)} y el total del RCV es ${fmtC(total)} (diferencia ${fmtC(difTotal)}).`);
  return {ok:errores.length===0,errores,avisos,resumen:{sumAfecto,sumExento,sumOtros,difOtros,cruzaOtros,ivaCalc,totalCalc,difNeto,difExento,difIva,difTotal,neto,exento,iva,otros,total}};
}

// Líneas por defecto para un documento del RCV
function lineasIniciales(tipo,d){
  const out=lineasBase(tipo,d);
  // V2.21.62: en compras, una línea por cada otro impuesto del RCV (si aún no hay)
  if(tipo==='compra'&&n(d.otrosImpuestos)>0&&!out.some(l=>l.otroImp)){
    const cuenta=out[0]?.cuenta||d.cuenta||'',cc=out[0]?.cc||d.cc||'';
    const det=(d._otrosDetRCV||d.otrosImpuestosDetalle||[]).filter(x=>x&&n(x.monto)>0);
    const sumDet=det.reduce((s,x)=>s+n(x.monto),0);
    if(det.length&&sumDet===n(d.otrosImpuestos))det.forEach(x=>{const cod=String(x.tipo||'');out.push({cuenta,cc,monto:n(x.monto),afecto:false,otroImp:true,codImp:/^\d+$/.test(cod)?cod:'',desc:/^\d+$/.test(cod)?`Otro impuesto cód. ${cod}`:'Otros impuestos'});});
    else out.push({cuenta,cc,monto:n(d.otrosImpuestos),afecto:false,otroImp:true,codImp:'',desc:'Otros impuestos'});
  }
  return out;
}
function lineasBase(tipo,d){
  const prev=d.dup||null;
  if(d.detalleRCV&&Array.isArray(d.detalleRCV.lineas)&&d.detalleRCV.lineas.length)return d.detalleRCV.lineas.map(l=>({...l}));
  if(tipo==='compra'&&prev&&Array.isArray(prev.dist)&&prev.dist.length){
    const base=n(d.neto)+n(d.exento),sum=prev.dist.reduce((s,l)=>s+n(l.monto),0);
    if(sum===base)return prev.dist.map(l=>({cuenta:l.cuenta||'',desc:l.desc||'',monto:n(l.monto),cc:l.cc||'',afecto:l.afecto!==false&&!(n(d.neto)===0&&n(d.exento)>0)}));
  }
  if(tipo==='venta'&&prev&&Array.isArray(prev.dist)&&prev.dist.length){
    const base=n(d.neto)+n(d.exento),sum=prev.dist.reduce((s,l)=>s+n(l.monto),0);
    if(sum===base)return prev.dist.map(l=>({cuenta:l.cuenta||'',desc:l.desc||'',monto:n(l.monto),cc:l.cc||'',afecto:l.afecto!==false}));
  }
  const cuenta=tipo==='venta'?(prev?.cuentaIngreso||d.cuenta||(dteV(d.tipoDTE)?.cuenta)||''):(d.cuenta||'');
  const cc=d.cc||'';
  const out=[];
  if(n(d.neto)>0)out.push({cuenta,desc:'',monto:n(d.neto),cc,afecto:true});
  if(n(d.exento)>0)out.push({cuenta,desc:'',monto:n(d.exento),cc,afecto:false});
  if(!out.length)out.push({cuenta,desc:'',monto:0,cc,afecto:true});
  return out;
}

// ── Estado del editor ──
// RD nunca se reasigna: los onPick/oninput generados escriben en window.RD.
const RD={tipo:'compra',pos:0,lista:[],lineas:[],glosa:'',vence:'',aceptaRedondeo:false};
const ctx=()=>RD.tipo==='compra'
  ?{IMx:window.IM,render:window.renderImportModal,confirmar:window.confirmarImportacion,filtro:'compra',titulo:'Compras'}
  :{IMx:window.IMV,render:window.renderImportModalVentas,confirmar:window.confirmarImportacionV,filtro:'ingreso',titulo:'Ventas'};
const docActual=()=>{const c=ctx();return c.IMx&&c.IMx.docs?c.IMx.docs[RD.lista[RD.pos]]:null;};

function asegurarModal(){
  let m=document.getElementById('rd-modal');
  if(!m){
    m=document.createElement('div');m.id='rd-modal';m.className='modal-bkd rd-modal';
    m.innerHTML='<div class="modal-box rd-box" style="max-width:1180px"><div id="rd-body"></div></div>';
    document.body.appendChild(m);
  }
  return m;
}
// Abre el paso 2. idx: índice del documento en el importador (opcional)
function abrirDetalleRCV(tipo,idx){
  RD.tipo=tipo==='venta'?'venta':'compra';
  const c=ctx();if(!c.IMx||!Array.isArray(c.IMx.docs)){toast('⚠️ Primero carga el archivo RCV','e');return;}
  RD.lista=c.IMx.docs.map((d,i)=>i).filter(i=>c.IMx.docs[i].incluir||i===idx);
  if(!RD.lista.length){toast('⚠️ No hay documentos seleccionados para revisar','e');return;}
  let pos=idx!=null?RD.lista.indexOf(idx):RD.lista.findIndex(i=>!c.IMx.docs[i].detalleRCV?.revisado);
  RD.pos=pos>=0?pos:0;
  cargarDoc();
  asegurarModal().classList.add('open');
  renderDetalleRCV();
}
function cargarDoc(){
  const d=docActual();if(!d)return;
  RD.lineas.length=0;lineasIniciales(RD.tipo,d).forEach(l=>RD.lineas.push(l));
  RD.glosa=d.detalleRCV?.glosa??d.glosa??'';
  RD.vence=d.fechaVencimiento||'';
  RD.aceptaRedondeo=!!d.detalleRCV?.aceptaRedondeo;
}
function cerrarDetalleRCV(){
  const m=document.getElementById('rd-modal');if(m)m.classList.remove('open');
  const c=ctx();if(typeof c.render==='function')c.render();
}
function leerCampos(){
  const g=document.getElementById('rd-glosa');if(g)RD.glosa=g.value;
  const v=document.getElementById('rd-vence');if(v)RD.vence=v.value;
  const r=document.getElementById('rd-redondeo');if(r)RD.aceptaRedondeo=r.checked;
}
function rdLinea(i,campo,valor){
  const l=RD.lineas[i];if(!l)return;
  if(campo==='monto')l.monto=n(String(valor).replace(/\./g,'').replace(',','.'));
  else if(campo==='afecto'){l.afecto=valor==='afecto';l.otroImp=valor==='otro';if(l.otroImp&&!String(l.desc||'').trim())l.desc='Otros impuestos';}
  else l[campo]=valor;
  rdValidar();
}
function rdAgregar(){leerCampos();RD.lineas.push({cuenta:RD.lineas[0]?.cuenta||'',desc:'',monto:0,cc:RD.lineas[0]?.cc||'',afecto:true});renderDetalleRCV();}
function rdQuitar(i){leerCampos();if(RD.lineas.length>1)RD.lineas.splice(i,1);renderDetalleRCV();}
// Completa la línea con lo que falta para cuadrar su tipo (afecto o exento)
function rdCompletar(i){
  const d=docActual();const l=RD.lineas[i];if(!d||!l)return;
  leerCampos();
  const t=tipoL(l);
  const objetivo=t==='otro'?n(d.otrosImpuestos):(t==='afecto'?n(d.neto):n(d.exento));
  const otras=RD.lineas.filter((x,j)=>j!==i&&tipoL(x)===t).reduce((s,x)=>s+n(x.monto),0);
  l.monto=Math.max(0,objetivo-otras);
  renderDetalleRCV();
}
function rdValidar(){
  const d=docActual();const box=document.getElementById('rd-val');if(!d||!box)return null;
  leerCampos();
  const v=validarDetalleRCV(RD.tipo,d,RD.lineas,{aceptaRedondeo:RD.aceptaRedondeo});
  const R=v.resumen;
  const fila=(lbl,calc,rcv,dif)=>`<tr class="${dif?'rd-mal':'rd-bien'}"><td class="tl">${lbl}</td><td>${fmtC(calc)}</td><td>${fmtC(rcv)}</td><td>${dif?fmtC(dif):'✓'}</td></tr>`;
  box.innerHTML=`<table class="rd-vt"><thead><tr><th class="tl">CONTROL</th><th>LÍNEAS</th><th>RCV</th><th>DIF.</th></tr></thead><tbody>
    ${fila('Neto (líneas afectas)',R.sumAfecto,R.neto,R.difNeto)}
    ${fila('Exento (líneas exentas)',R.sumExento,R.exento,R.difExento)}
    ${fila('IVA (19% de afectas)',R.ivaCalc,R.iva,R.difIva)}
    ${R.cruzaOtros&&(R.otros||R.sumOtros)?fila('Otros impuestos (líneas)',R.sumOtros,R.otros,R.difOtros):''}
    ${fila('Total',R.totalCalc,R.total,R.difTotal)}
  </tbody></table>
  ${v.errores.map(e=>`<div class="rd-err">⛔ ${esc(e)}</div>`).join('')}
  ${v.avisos.map(e=>`<div class="rd-avi">ℹ️ ${esc(e)}</div>`).join('')}
  ${v.ok?'<div class="rd-ok">✅ Documento cuadrado: listo para contabilizar.</div>':''}`;
  const b=document.getElementById('rd-guardar');if(b)b.disabled=!v.ok;
  const b2=document.getElementById('rd-guardar-sig');if(b2)b2.disabled=!v.ok;
  return v;
}
function guardarDoc(){
  const d=docActual();if(!d)return false;
  const v=rdValidar();
  if(!v||!v.ok){toast('⛔ Corrige las diferencias antes de guardar','e');return false;}
  const lineas=RD.lineas.map(l=>({cuenta:l.cuenta,desc:String(l.desc||'').trim(),monto:n(l.monto),cc:l.cc||'',afecto:tipoL(l)==='afecto',...(l.otroImp?{otroImp:true,codImp:l.codImp||''}:{})}));
  // V2.21.62: los otros impuestos se contabilizan en la cuenta de su línea.
  // 1108006 = recuperable; cualquier otra cuenta = costo/gasto en esa cuenta.
  if(RD.tipo==='compra'){
    if(!d._otrosDetRCV)d._otrosDetRCV=(d.otrosImpuestosDetalle||[]).map(x=>({...x}));
    const ol=lineas.filter(l=>l.otroImp);
    if(ol.length)d.otrosImpuestosDetalle=ol.map(l=>({tipo:l.codImp||'otro',nombre:l.desc||'Otros impuestos',monto:l.monto,
      tratamiento:l.cuenta==='1108006'?'recuperable':'costo',...(l.cuenta!=='1108006'?{cuenta:l.cuenta,cc:l.cc||'',desc:l.desc||''}:{})}));
  }
  d.detalleRCV={v:2,lineas,glosa:String(RD.glosa||'').trim(),aceptaRedondeo:!!RD.aceptaRedondeo,revisado:true,revisadoEn:new Date().toISOString()};
  // Compatibilidad con el paso 1: cuenta/CC de la primera línea y glosa
  d.cuenta=lineas[0].cuenta;d.cc=lineas[0].cc||'';
  d.glosa=d.detalleRCV.glosa;
  if(RD.vence&&RD.vence!==d.fechaVencimiento){d.fechaVencimiento=RD.vence;d.fechaVencimientoOrigen='manual';}
  d.incluir=true;delete d.errorImport;
  return true;
}
function rdGuardar(siguiente){
  leerCampos();
  if(!guardarDoc())return;
  if(siguiente){
    const c=ctx();
    const sig=RD.lista.findIndex((i,k)=>k>RD.pos&&!c.IMx.docs[i].detalleRCV?.revisado);
    if(sig>=0){RD.pos=sig;cargarDoc();renderDetalleRCV();toast('✅ Guardado · siguiente documento');return;}
    const otro=RD.lista.findIndex(i=>!c.IMx.docs[i].detalleRCV?.revisado);
    if(otro>=0){RD.pos=otro;cargarDoc();renderDetalleRCV();toast('✅ Guardado · quedan documentos sin revisar');return;}
    toast('✅ Todos los documentos están revisados');
  }
  renderDetalleRCV();
}
function rdIr(delta){
  leerCampos();
  const p=RD.pos+delta;if(p<0||p>=RD.lista.length)return;
  RD.pos=p;cargarDoc();renderDetalleRCV();
}
function rdIrA(pos){leerCampos();RD.pos=+pos;cargarDoc();renderDetalleRCV();}
function rdLimpiar(){
  const d=docActual();if(!d)return;
  if(!confirm('¿Descartar el detalle de este documento y volver a la distribución por defecto?'))return;
  delete d.detalleRCV;if(d._otrosDetRCV){d.otrosImpuestosDetalle=d._otrosDetRCV.map(x=>({...x}));delete d._otrosDetRCV;}cargarDoc();renderDetalleRCV();
}
async function rdContabilizar(){
  const c=ctx();
  const docs=c.IMx.docs;
  const revisados=RD.lista.filter(i=>docs[i].detalleRCV?.revisado);
  const pendientes=RD.lista.length-revisados.length;
  if(!revisados.length){toast('⚠️ Aún no hay documentos revisados','e');return;}
  if(pendientes&&!confirm(`Hay ${pendientes} documento(s) seleccionados sin revisar.\n\nSólo se contabilizarán los ${revisados.length} revisados; los demás quedarán sin seleccionar para revisarlos después.\n\n¿Continuar?`))return;
  // Sólo los revisados quedan incluidos en el lote
  docs.forEach((d,i)=>{if(d.incluir&&!d.detalleRCV?.revisado)d.incluir=false;});
  const m=document.getElementById('rd-modal');if(m)m.classList.remove('open');
  if(typeof c.confirmar==='function')await c.confirmar();
}

function renderDetalleRCV(){
  const body=document.getElementById('rd-body');const d=docActual();if(!body||!d)return;
  const c=ctx();
  const dteInfo=RD.tipo==='compra'?dteC(d.tipoDTE):dteV(d.tipoDTE);
  const revisados=RD.lista.filter(i=>c.IMx.docs[i].detalleRCV?.revisado).length;
  const lineas=RD.lineas.map((l,i)=>`<tr>
      <td class="rd-n">${i+1}</td>
      <td class="rd-cta">${inputCuenta({id:`rd-cd-${i}`,value:l.cuenta,onPick:`rdLinea(${i},'cuenta','%CD%')`,placeholder:'Cuenta…',clase:'linea-inp',filtro:c.filtro})}</td>
      <td><input type="text" class="linea-inp" value="${esc(l.desc)}" placeholder="${RD.lineas.filter(x=>!x.otroImp).length>1||l.otroImp?'Descripción (obligatoria)':'Descripción'}" oninput="rdLinea(${i},'desc',this.value)"></td>
      <td><input type="text" inputmode="numeric" class="linea-inp rd-monto" value="${n(l.monto)?n(l.monto).toLocaleString('es-CL'):''}" placeholder="0" onchange="rdLinea(${i},'monto',this.value);this.value=(+RD.lineas[${i}].monto||'')?(+RD.lineas[${i}].monto).toLocaleString('es-CL'):''"></td>
      <td><select class="linea-inp" onchange="rdLinea(${i},'cc',this.value)">${ccOpts(l.cc||'')}</select></td>
      <td><select class="linea-inp" onchange="rdLinea(${i},'afecto',this.value);renderDetalleRCV()"><option value="afecto" ${tipoL(l)==='afecto'?'selected':''}>Afecto</option><option value="exento" ${tipoL(l)==='exento'?'selected':''}>Exento</option>${RD.tipo==='compra'?`<option value="otro" ${tipoL(l)==='otro'?'selected':''}>Otro impuesto${l.codImp?' (cód. '+esc(l.codImp)+')':''}</option>`:''}</select></td>
      <td class="rd-acc"><button class="btn btn-g" title="Completar con lo que falta para cuadrar" onclick="rdCompletar(${i})">⇥</button> <button class="btn btn-d" title="Quitar línea" onclick="rdQuitar(${i})" ${RD.lineas.length<2?'disabled':''}>✕</button></td>
    </tr>`).join('');
  const dato=(lbl,val,cls='')=>`<div class="rd-dato ${cls}"><span>${lbl}</span><b>${val}</b></div>`;
  body.innerHTML=`
    <div class="modal-hdr"><div>
      <div class="modal-title">📝 Paso 2 · Contabilizar ${c.titulo.toLowerCase()} documento por documento</div>
      <div class="modal-sub">Documento ${RD.pos+1} de ${RD.lista.length} · ${revisados} revisado(s)
        <select style="margin-left:8px;font-size:11px;padding:2px 4px" onchange="rdIrA(this.value)">${RD.lista.map((i,k)=>{const x=c.IMx.docs[i];return `<option value="${k}" ${k===RD.pos?'selected':''}>${x.detalleRCV?.revisado?'✓':'·'} ${x.tipoDTE}-${esc(x.numero)} ${esc(String(x.razonSocial||'').slice(0,28))}</option>`;}).join('')}</select></div>
    </div><button class="btn btn-g" onclick="cerrarDetalleRCV()">✕</button></div>
    <div class="rd-cab">
      ${dato('Tipo de documento',`${d.tipoDTE} · ${esc(dteInfo?.nm||'')}`)}
      ${dato('Folio',esc(d.numero))}
      ${dato('Fecha emisión',esc(d.fechaOriginal||d.fecha||''))}
      <div class="rd-dato"><span>Fecha vencimiento</span><input type="date" id="rd-vence" value="${esc(RD.vence)}"></div>
      ${dato(RD.tipo==='compra'?'RUT proveedor':'RUT cliente',esc(rutFmt(d.rutCodigo,d.rutDV)))}
      ${dato('Auxiliar',esc(d.razonSocial||''),'rd-ancho')}
      ${dato('Exento',fmtC(d.exento),'rd-num')}
      ${dato('Neto',fmtC(d.neto),'rd-num')}
      ${dato('IVA',fmtC(d.iva),'rd-num')}
      ${dato('Otros impuestos',fmtC(d.otrosImpuestos),'rd-num')}
      ${dato('Total',fmtC(d.total),'rd-num rd-tot')}
    </div>
    <div class="grp" style="margin:10px 0 6px"><label>Descripción general del documento (glosa)</label><input type="text" id="rd-glosa" value="${esc(RD.glosa)}" placeholder="Ej: Seguro flota camiones 2026"></div>
    <div class="tw"><table class="rd-tab">
      <thead><tr><th>#</th><th class="tl">CUENTA</th><th class="tl">DESCRIPCIÓN</th><th>MONTO</th><th class="tl">CENTRO DE COSTO</th><th class="tl">${RD.tipo==='compra'?'TIPO':'AFECTO / EXENTO'}</th><th></th></tr></thead>
      <tbody>${lineas}</tbody>
    </table></div>
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0 10px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="rdAgregar()">+ Agregar línea</button>
      ${d.detalleRCV?'<button class="btn btn-g" onclick="rdLimpiar()">↺ Volver a la distribución por defecto</button>':''}
      <label class="rd-chk"><input type="checkbox" id="rd-redondeo" ${RD.aceptaRedondeo?'checked':''} onchange="rdValidar()"> Aceptar diferencia de $1 por redondeo del emisor</label>
      ${d.detalleRCV?.revisado?'<span class="rd-badge">✓ Revisado</span>':''}
    </div>
    <div id="rd-val"></div>
    <div class="modal-footer rd-pie">
      <button class="btn btn-d" onclick="cerrarDetalleRCV()" title="Cierra el paso 2; lo ya guardado en cada documento se conserva">Cancelar</button>
      <button class="btn btn-g" onclick="rdIr(-1)" ${RD.pos===0?'disabled':''}>← Anterior</button>
      <button class="btn btn-g" onclick="rdIr(1)" ${RD.pos>=RD.lista.length-1?'disabled':''}>Siguiente →</button>
      <span style="flex:1"></span>
      <button class="btn btn-g" id="rd-guardar" onclick="rdGuardar(false)">💾 Guardar</button>
      <button class="btn btn-p" id="rd-guardar-sig" onclick="rdGuardar(true)">💾 Guardar y siguiente</button>
      <button class="btn btn-p" onclick="rdContabilizar()" title="Contabiliza los documentos revisados">📒 Contabilizar ${revisados} revisado(s)</button>
    </div>`;
  rdValidar();
}

export {validarDetalleRCV, lineasIniciales, abrirDetalleRCV, cerrarDetalleRCV, rdLinea, rdAgregar, rdQuitar, rdCompletar,
  rdValidar, rdGuardar, rdIr, rdIrA, rdLimpiar, rdContabilizar, RD};
