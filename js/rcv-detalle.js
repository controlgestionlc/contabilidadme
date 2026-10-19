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
import {ccOpts, ccNombre} from './centroscosto.js';
import {inputCuenta} from './buscadorcuentas.js';
import {tributacionCompra, asientoCompra, asientoVenta, asientoHonorarioDoc} from './motor-contable.js';

const n=v=>Math.round(+v||0);
// V2.21.62: tipo de línea. 'otro' = línea de otros impuestos del RCV (sólo compras)
const tipoL=l=>l&&l.otroImp?'otro':(l&&l.afecto===false?'exento':'afecto');
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Validador puro (testeable) ──
// tipo: 'compra' | 'venta'. doc: datos del RCV. lineas: [{cuenta,desc,monto,cc,afecto}]
// ivaLinea: IVA escrito en la línea de IVA del asiento (V2.21.75). Si no viene, se usa el 19% de las afectas.
function validarDetalleRCV(tipo,doc,lineas,{aceptaRedondeo=false,legacyOtros=false,ivaLinea=null}={}){
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
  // Con línea de IVA editable, el IVA del asiento es el escrito en ella. Se acepta
  // hasta $1 de diferencia con el 19% de las afectas (redondeo del emisor).
  const conIvaLinea=ivaLinea!=null&&Number.isFinite(+ivaLinea);
  const ivaUsado=conIvaLinea?n(ivaLinea):ivaCalc;
  if(conIvaLinea){
    const difCalc=ivaUsado-ivaCalc;
    if(Math.abs(difCalc)>1)errores.push(`El IVA del asiento ${fmtC(ivaUsado)} no corresponde al 19% de las líneas afectas (${fmtC(ivaCalc)}; diferencia ${fmtC(difCalc)}).`);
    else if(difCalc)avisos.push(`El IVA del asiento difiere en ${fmtC(difCalc)} del 19% de las afectas: redondeo del emisor.`);
    if(ivaUsado!==iva)avisos.push(`El IVA del asiento (${fmtC(ivaUsado)}) es distinto del informado en el RCV (${fmtC(iva)}): se registrará el del asiento y es el que tomará el F29.`);
  }else if(difIva&&!redondeoOk(difIva))errores.push(`IVA calculado ${fmtC(ivaCalc)} (19% de ${fmtC(sumAfecto)}) distinto del IVA del RCV ${fmtC(iva)} (diferencia ${fmtC(difIva)}).${Math.abs(difIva)<=1?' Si es redondeo del emisor, marca "Aceptar diferencia de $1".':''}`);
  // Total: en facturas de compra (45/46) el total del RCV puede informar el
  // total del documento o sólo lo pagadero al proveedor (sin el IVA retenido).
  const base=sumAfecto+sumExento;
  // El total se controla con el IVA CALCULADO desde las líneas (o el de la línea de IVA), no con el del RCV
  let totalCalc=base+ivaUsado+otrosLineas, difTotal=totalCalc-total;
  const facturaCompra=tipo==='compra'&&(+doc.tipoDTE===45||+doc.tipoDTE===46||doc.ivaRetenido!=null);
  if(facturaCompra){
    const sinRet=base+otrosLineas;
    if(Math.abs(sinRet-total)<Math.abs(difTotal)){totalCalc=sinRet;difTotal=sinRet-total;}
  }
  if(difTotal&&!redondeoOk(difTotal))errores.push(`Líneas + IVA calculado + otros impuestos = ${fmtC(totalCalc)} y el total del RCV es ${fmtC(total)} (diferencia ${fmtC(difTotal)}).`);
  return {ok:errores.length===0,errores,avisos,resumen:{sumAfecto,sumExento,sumOtros,difOtros,cruzaOtros,ivaCalc,ivaUsado,conIvaLinea,totalCalc,difNeto,difExento,difIva,difTotal,neto,exento,iva,otros,total}};
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
const RD={tipo:'compra',pos:0,lista:[],lineas:[],glosa:'',vence:'',aceptaRedondeo:false,iva:0,embebido:false};
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
  // V2.21.76: el paso 2 ahora es la pantalla de captura (lista + editor). Se
  // conserva esta entrada para quien llegue desde la vista tabla.
  RD.embebido=false;
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
  // IVA del asiento: el guardado en el detalle o, si no hay, el del RCV
  RD.iva=d.detalleRCV?.iva!=null?n(d.detalleRCV.iva):n(d.ivaRCV!=null?d.ivaRCV:d.iva);
}
// Editor dentro de la pantalla de captura (panel derecho). Trabaja sobre un solo documento.
function abrirEditorEmbebido(tipo,idx){
  RD.tipo=tipo==='venta'?'venta':'compra';
  RD.embebido=true;
  RD.lista=[idx];RD.pos=0;
  const viejo=document.getElementById('rd-modal');if(viejo)viejo.remove();   // evita dos #rd-body
  cargarDoc();
  renderDetalleRCV();
}
function cerrarDetalleRCV(){
  if(RD.embebido){RD.embebido=false;if(typeof window.capCerrarEditor==='function')window.capCerrarEditor();return;}
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
  if(l.otroImp&&campo!=='afecto')return;   // las líneas de impuesto no se editan
  const sigue=(campo==='cuenta'||campo==='cc')&&RD.lineas.find(x=>!x.otroImp)===l&&RD.lineas.some(x=>x.otroImp);
  if(campo==='monto')l.monto=n(String(valor).replace(/\./g,'').replace(',','.'));
  else if(campo==='afecto'){l.afecto=valor==='afecto';l.otroImp=valor==='otro';if(l.otroImp&&!String(l.desc||'').trim())l.desc='Otros impuestos';}
  else l[campo]=valor;
  if(sigue){syncOtrosImp();leerCampos();renderDetalleRCV();return;}
  rdValidar();
}
// Cuenta y CC de las líneas de otros impuestos (no se editan a mano)
function syncOtrosImp(){
  const base=RD.lineas.find(l=>!l.otroImp);
  RD.lineas.forEach(l=>{
    if(!l.otroImp)return;
    if(l.cuenta==='1108006'){l.cc='';return;}
    l.cuenta=base?.cuenta||l.cuenta||'';
    if(!l.ccManual)l.cc=base?.cc||'';   // sigue al gasto hasta que se elija otro a mano
    if(!String(l.desc||'').trim())l.desc=l.codImp?`Otro impuesto cód. ${l.codImp}`:'Otros impuestos';
  });
}
function rdOtroCC(i,v){
  const l=RD.lineas[i];if(!l||!l.otroImp)return;
  l.cc=v;l.ccManual=true;rdValidar();
}
function rdOtroTrat(i,v){
  const l=RD.lineas[i];if(!l||!l.otroImp)return;
  l.cuenta=v==='recuperable'?'1108006':'';
  syncOtrosImp();renderDetalleRCV();
}
function rdAgregar(){leerCampos();RD.lineas.push({cuenta:RD.lineas[0]?.cuenta||'',desc:'',monto:0,cc:RD.lineas[0]?.cc||'',afecto:true});renderDetalleRCV();}
function rdQuitar(i){leerCampos();if(RD.lineas[i]?.otroImp)return;if(RD.lineas.filter(x=>!x.otroImp).length>1)RD.lineas.splice(i,1);renderDetalleRCV();}
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
  syncOtrosImp();
  const v=validarDetalleRCV(RD.tipo,docRCV(d),RD.lineas,{aceptaRedondeo:RD.aceptaRedondeo,ivaLinea:RD.iva});
  const R=v.resumen;
  const fila=(lbl,calc,rcv,dif)=>`<tr class="${dif?'rd-mal':'rd-bien'}"><td class="tl">${lbl}</td><td>${fmtC(calc)}</td><td>${fmtC(rcv)}</td><td>${dif?fmtC(dif):'✓'}</td></tr>`;
  box.innerHTML=`<table class="rd-vt"><thead><tr><th class="tl">CONTROL</th><th>LÍNEAS</th><th>RCV</th><th>DIF.</th></tr></thead><tbody>
    ${fila('Neto (líneas afectas)',R.sumAfecto,R.neto,R.difNeto)}
    ${fila('Exento (líneas exentas)',R.sumExento,R.exento,R.difExento)}
    ${R.conIvaLinea?fila('IVA (línea del asiento)',R.ivaUsado,R.iva,R.ivaUsado-R.iva):fila('IVA (19% de afectas)',R.ivaCalc,R.iva,R.difIva)}
    ${R.cruzaOtros&&(R.otros||R.sumOtros)?fila('Otros impuestos (líneas)',R.sumOtros,R.otros,R.difOtros):''}
    ${fila('Total',R.totalCalc,R.total,R.difTotal)}
  </tbody></table>
  ${v.errores.map(e=>`<div class="rd-err">⛔ ${esc(e)}</div>`).join('')}
  ${v.avisos.map(e=>`<div class="rd-avi">ℹ️ ${esc(e)}</div>`).join('')}
  ${v.ok?'<div class="rd-ok">✅ Documento cuadrado: listo para contabilizar.</div>':''}`;
  renderAsientoRD(d);
  const b=document.getElementById('rd-guardar');if(b)b.disabled=!v.ok;
  const b2=document.getElementById('rd-guardar-sig');if(b2)b2.disabled=!v.ok;
  const bc=document.getElementById('rd-contab');if(bc)bc.disabled=!v.ok;
  return v;
}
function guardarDoc(){
  const d=docActual();if(!d)return false;
  const v=rdValidar();
  if(!v||!v.ok){toast('⛔ Corrige las diferencias antes de guardar','e');return false;}
  // IVA del asiento: si se corrigió, el documento lo adopta (se guarda el del RCV aparte)
  const ivaAs=n(RD.iva);
  if(d.ivaRCV==null&&ivaAs!==n(d.iva))d.ivaRCV=n(d.iva);
  d.iva=ivaAs;
  if(d.ivaRCV!=null&&n(d.ivaRCV)===ivaAs)delete d.ivaRCV;
  const lineas=RD.lineas.map(l=>({cuenta:l.cuenta,desc:String(l.desc||'').trim(),monto:n(l.monto),cc:l.cc||'',afecto:tipoL(l)==='afecto',...(l.otroImp?{otroImp:true,codImp:l.codImp||'',...(l.ccManual?{ccManual:true}:{})}:{})}));
  // V2.21.62: los otros impuestos se contabilizan en la cuenta de su línea.
  // 1108006 = recuperable; cualquier otra cuenta = costo/gasto en esa cuenta.
  if(RD.tipo==='compra'){
    if(!d._otrosDetRCV)d._otrosDetRCV=(d.otrosImpuestosDetalle||[]).map(x=>({...x}));
    const ol=lineas.filter(l=>l.otroImp);
    if(ol.length)d.otrosImpuestosDetalle=ol.map(l=>({tipo:l.codImp||'otro',nombre:l.desc||'Otros impuestos',monto:l.monto,
      tratamiento:l.cuenta==='1108006'?'recuperable':'costo',...(l.cuenta!=='1108006'?{cuenta:l.cuenta,cc:l.cc||'',desc:l.desc||''}:{})}));
  }
  d.descImpuestos=true;   // V2.21.77: las líneas de impuestos del asiento llevan el nombre de su cuenta
  d.detalleRCV={v:2,lineas,glosa:String(RD.glosa||'').trim(),aceptaRedondeo:!!RD.aceptaRedondeo,iva:ivaAs,revisado:true,revisadoEn:new Date().toISOString()};
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
  delete d.detalleRCV;if(d.ivaRCV!=null){d.iva=n(d.ivaRCV);delete d.ivaRCV;}if(d._otrosDetRCV){d.otrosImpuestosDetalle=d._otrosDetRCV.map(x=>({...x}));delete d._otrosDetRCV;}cargarDoc();renderDetalleRCV();
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

// ── Asiento que se generará (V2.21.75) ──
// Se arma con el mismo motor que contabiliza, sobre una copia del documento con
// las líneas del paso 2 y el IVA de la línea editable. Así se ven todas las
// líneas (incluidas IVA y proveedor/cliente) antes de contabilizar.
const docRCV=d=>(d.ivaRCV!=null?{...d,iva:d.ivaRCV}:d);   // datos del RCV tal como vinieron
function docVirtual(d){
  const base=docRCV(d);
  const v={...base,iva:n(RD.iva),glosa:String(RD.glosa||'').trim(),descImpuestos:true};
  if(RD.tipo==='compra'){
    v.dist=RD.lineas.filter(l=>!l.otroImp).map(l=>({cuenta:l.cuenta,monto:n(l.monto),cc:l.cc||'',desc:l.desc||'',afecto:tipoL(l)==='afecto'}));
    const ol=RD.lineas.filter(l=>l.otroImp);
    if(ol.length)v.otrosImpuestosDetalle=ol.map(l=>({tipo:l.codImp||'otro',nombre:l.desc||'Otros impuestos',monto:n(l.monto),
      tratamiento:l.cuenta==='1108006'?'recuperable':'costo',...(l.cuenta!=='1108006'?{cuenta:l.cuenta,cc:l.cc||'',desc:l.desc||''}:{})}));
  }else{
    v.dist=RD.lineas.map(l=>({cuenta:l.cuenta,monto:n(l.monto),cc:l.cc||'',desc:l.desc||'',afecto:l.afecto!==false}));
    v.cuentaIngreso=RD.lineas[0]?.cuenta||v.cuentaIngreso;
    v.formaPago=d.dup?.formaPago||d.fp||d.formaPago||'clientes';
  }
  return v;
}
const esCuentaIva=cd=>['1108002','1108008','2103003'].includes(String(cd));
// Nombre visible del centro de costo (el valor guardado es un id interno)
const nombreCC=cc=>cc?(ccNombre(cc)||cc):'—';
const ROL={'1108002':'IVA crédito','1108008':'IVA activo fijo','1108006':'Otros imp. recuperables','2103005':'IVA retenido','2103003':'IVA débito','2103002':'Retención honorarios',
  '2102001':'Proveedor','2102006':'Honorarios por pagar','1104001':'Cliente','1101201':'Banco','1107003':'Deudores varios'};
// Las líneas que arma el motor y no se editan: impuestos, retenciones y proveedor/cliente.
// Las de gasto/activo/ingreso y las de otros impuestos ya están arriba (líneas del detalle).
function esAutomatica(m){
  if(m.tributo==='otro_impuesto_costo')return false;
  return !!ROL[String(m.cd)]||!!m.tributo;
}
function renderAsientoRD(d){
  const gen=document.getElementById('rd-gen'),tot=document.getElementById('rd-tot');if(!gen||!tot)return;
  let as;
  const dv=docVirtual(d);
  try{as=RD.tipo==='venta'?asientoVenta(dv):(dteC(dv.tipoDTE)?.honorario?asientoHonorarioDoc(dv):asientoCompra(dv));}
  catch(e){gen.innerHTML=`<tr><td colspan="8" class="tl"><div class="rd-avi">ℹ️ No se pudo armar el asiento: ${esc(e.message)}</div></td></tr>`;tot.innerHTML='';return;}
  const movs=(as&&as.movs)||[];
  const tD=movs.reduce((s,m)=>s+n(m.debe),0),tH=movs.reduce((s,m)=>s+n(m.haber),0);
  let ivaEditable=false;
  const filas=movs.filter(esAutomatica).map(m=>{
    const esIva=!ivaEditable&&(RD.tipo==='venta'?m.cd==='2103003':(m.cd==='1108002'||m.cd==='1108008'));
    if(esIva)ivaEditable=true;
    const lado=n(m.debe)?'debe':'haber';
    const inp=`<input type="text" inputmode="numeric" class="linea-inp rd-monto money-input" id="rd-iva" value="${n(RD.iva).toLocaleString('es-CL')}" title="IVA del documento: corrígelo si el emisor redondeó distinto" onchange="rdIva(this.value)">`;
    const val=l=>esIva&&lado===l?inp:(n(m[l])?`<div class="rd-ro rd-num-ro">${n(m[l]).toLocaleString('es-CL')}</div>`:'');
    return `<tr class="rd-fija${esIva?' rd-iva-fila':''}" title="${esIva?'El monto del IVA se puede corregir':'Línea automática: no se edita'}">
      <td class="rd-n">·</td>
      <td class="rd-cta"><div class="rd-ro">${esc(m.cd)} – ${esc(pdcNm(m.cd)||'')}</div></td>
      <td><div class="rd-ro" title="${esc(m.desc||'')}">${esc(m.desc||'')}</div></td>
      <td><div class="rd-ro">—</div></td>
      <td><div class="rd-ro">${esc(ROL[String(m.cd)]||'Automática')}</div></td>
      <td>${val('debe')}</td><td>${val('haber')}</td><td class="rd-acc"></td></tr>`;
  }).join('');
  gen.innerHTML=filas;
  const cuadra=Math.abs(tD-tH)<0.5;
  tot.innerHTML=`<tr class="rd-tot"><td></td><td class="tl" colspan="4">Totales del asiento${cuadra?'':' · <span style="color:var(--err)">no cuadra</span>'}</td><td>${fmtC(tD)}</td><td>${fmtC(tH)}</td><td></td></tr>`;
}
function rdIva(valor){
  RD.iva=Math.max(0,n(String(valor).replace(/\./g,'').replace(',','.')));
  rdValidar();
}

function renderDetalleRCV(){
  const body=document.getElementById('rd-body');const d=docActual();if(!body||!d)return;
  const c=ctx();
  const dteInfo=RD.tipo==='compra'?dteC(d.tipoDTE):dteV(d.tipoDTE);
  const revisados=RD.lista.filter(i=>c.IMx.docs[i].detalleRCV?.revisado).length;
  syncOtrosImp();
  // Líneas de otros impuestos: vienen del RCV y no se editan. Su cuenta sigue a la
  // primera línea de gasto/activo (impuesto de costo) o va a 1108006 si es recuperable.
  // Lado del asiento de las líneas editables: gasto/activo al Debe en compras,
  // ingreso al Haber en ventas (al revés en notas de crédito).
  const signoDoc=(RD.tipo==='compra'?dteC(d.tipoDTE)?.signo:dteV(d.tipoDTE)?.signo)||1;
  const ladoBase=(RD.tipo==='compra')===(signoDoc>0)?'debe':'haber';
  const celdas=(contenido)=>ladoBase==='debe'?`<td>${contenido}</td><td></td>`:`<td></td><td>${contenido}</td>`;
  const filaOtro=(l,i)=>`<tr class="rd-fija" title="Línea de impuesto: se completa sola desde el RCV">
      <td class="rd-n">${i+1}</td>
      <td class="rd-cta"><div class="rd-ro">${esc(l.cuenta||'')} – ${esc(pdcNm(l.cuenta)||'(elige la cuenta de la línea 1)')}</div></td>
      <td><div class="rd-ro">${esc(l.desc||'Otros impuestos')}</div></td>
      <td>${l.cuenta==='1108006'?'<div class="rd-ro">—</div>':`<select class="linea-inp" onchange="rdOtroCC(${i},this.value)">${ccOpts(l.cc||'')}</select>`}</td>
      <td><select class="linea-inp" onchange="rdOtroTrat(${i},this.value)"><option value="costo" ${l.cuenta!=='1108006'?'selected':''}>Otro impuesto · costo</option><option value="recuperable" ${l.cuenta==='1108006'?'selected':''}>Otro impuesto · recuperable</option></select></td>
      ${celdas(`<div class="rd-ro rd-num-ro">${n(l.monto).toLocaleString('es-CL')}</div>`)}
      <td class="rd-acc"></td>
    </tr>`;
  const lineas=RD.lineas.map((l,i)=>l.otroImp?filaOtro(l,i):`<tr>
      <td class="rd-n">${i+1}</td>
      <td class="rd-cta">${inputCuenta({id:`rd-cd-${i}`,value:l.cuenta,onPick:`rdLinea(${i},'cuenta','%CD%')`,placeholder:'Cuenta…',clase:'linea-inp',filtro:c.filtro})}</td>
      <td><input type="text" class="linea-inp" value="${esc(l.desc)}" placeholder="${RD.lineas.filter(x=>!x.otroImp).length>1?'Descripción (obligatoria)':'Descripción'}" oninput="rdLinea(${i},'desc',this.value)"></td>
      <td><select class="linea-inp" onchange="rdLinea(${i},'cc',this.value)">${ccOpts(l.cc||'')}</select></td>
      <td><select class="linea-inp" onchange="rdLinea(${i},'afecto',this.value);renderDetalleRCV()"><option value="afecto" ${tipoL(l)==='afecto'?'selected':''}>Afecto</option><option value="exento" ${tipoL(l)==='exento'?'selected':''}>Exento</option></select></td>
      ${celdas(`<input type="text" inputmode="numeric" class="linea-inp rd-monto" value="${n(l.monto)?n(l.monto).toLocaleString('es-CL'):''}" placeholder="0" onchange="rdLinea(${i},'monto',this.value);this.value=(+RD.lineas[${i}].monto||'')?(+RD.lineas[${i}].monto).toLocaleString('es-CL'):''">`)}
      <td class="rd-acc"><button class="btn btn-g" title="Completar con lo que falta para cuadrar" onclick="rdCompletar(${i})">⇥</button> <button class="btn btn-d" title="Quitar línea" onclick="rdQuitar(${i})" ${RD.lineas.filter(x=>!x.otroImp).length<2?'disabled':''}>✕</button></td>
    </tr>`).join('');
  const dato=(lbl,val,cls='')=>`<div class="rd-dato ${cls}"><span>${lbl}</span><b>${val}</b></div>`;
  const cab=RD.embebido
    ?`<div class="rd-emb-hdr"><div class="modal-title">📝 ${esc(d.razonSocial||'')} · ${d.tipoDTE}-${esc(d.numero)}</div>
       <button class="btn btn-g" onclick="cerrarDetalleRCV()" title="Cerrar el editor sin contabilizar">✕</button></div>`
    :null;
  const pie=RD.embebido
    ?`<div class="modal-footer rd-pie">
      <button class="btn btn-d" onclick="cerrarDetalleRCV()">Cancelar</button>
      ${d.detalleRCV?'<button class="btn btn-g" onclick="rdLimpiar()">↺ Distribución por defecto</button>':''}
      <span style="flex:1"></span>
      <button class="btn btn-p" id="rd-contab" onclick="capContabilizar()" title="Genera el asiento y lleva el documento al libro">📒 Contabilizar documento</button>
    </div>`
    :null;
  body.innerHTML=(cab||'')+`
    <div class="modal-hdr"${RD.embebido?' style="display:none"':''}><div>
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
      <colgroup><col style="width:34px"><col style="width:23%"><col style="width:23%"><col style="width:14%"><col style="width:13%"><col style="width:11%"><col style="width:11%"><col style="width:84px"></colgroup>
      <thead><tr><th>#</th><th class="tl">CUENTA</th><th class="tl">DESCRIPCIÓN</th><th class="tl">CENTRO DE COSTO</th><th class="tl">TIPO</th><th>DEBE</th><th>HABER</th><th></th></tr></thead>
      <tbody>${lineas}</tbody>
      <tbody id="rd-gen" class="rd-gen"></tbody>
      <tfoot id="rd-tot"></tfoot>
    </table></div>
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0 10px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="rdAgregar()">+ Agregar línea</button>
      ${d.detalleRCV?'<button class="btn btn-g" onclick="rdLimpiar()">↺ Volver a la distribución por defecto</button>':''}
      <label class="rd-chk"><input type="checkbox" id="rd-redondeo" ${RD.aceptaRedondeo?'checked':''} onchange="rdValidar()"> Aceptar diferencia de $1 por redondeo del emisor</label>
      ${d.detalleRCV?.revisado?'<span class="rd-badge">✓ Revisado</span>':''}
    </div>
    <div id="rd-val"></div>
    ${pie||''}
    <div class="modal-footer rd-pie"${RD.embebido?' style="display:none"':''}>
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

export {rdOtroTrat, rdOtroCC, validarDetalleRCV, lineasIniciales, abrirDetalleRCV, abrirEditorEmbebido, guardarDoc, cerrarDetalleRCV, rdLinea, rdAgregar, rdQuitar, rdCompletar, rdIva,
  rdValidar, rdGuardar, rdIr, rdIrA, rdLimpiar, rdContabilizar, RD};
