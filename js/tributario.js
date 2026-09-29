// tributario.js — Formulario 29 (IVA mensual), PPM y asiento de compensación de IVA
import {fmtC, fmt, MESES, IVA, dteV, dteC, esDteHonorario, PDC, pdcNm, toast, pn} from './core.js';
import {retencionHonorarios, getIndicadores} from './indicadores.js';
import {todosDocsCompras, todosDocsVentas, proxFolioComprobante} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {buildMayor} from './reportes.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {savePDC} from './pdc.js';
import {S} from './state.js';
import {ejercicioCerrado,persistirAsientosCritico} from './contabilidad-v2.js';
import {tributacionCompra,clasificacionIVACompra,periodoContableCompra} from './motor-contable.js';
import './storage.js';



// ═══ V2.12 — DECLARACIÓN F29 PRESENTADA / HISTÓRICA ═══
// El cálculo del sistema es dinámico; la declaración presentada al SII es un hecho
// histórico. Se guardan por separado para que una edición posterior de documentos
// no reescriba silenciosamente el remanente ya declarado.
const F29DECL={anio:null,items:{},loaded:false,cargando:false};
const F29_CODIGOS_DECL=[538,39,537,504,77,89,563,62,151,48,91];
const claveF29Decl=anio=>`f29-declaraciones-${anio}`;
const periodoF29=mes=>`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
function declaracionF29(periodo){return F29DECL.items?.[periodo]||null;}
function esF29Presentado(d){return !!(d&&['presentado','cerrado'].includes(d.estado));}
function codDecl(d,cod,def=0){const v=d?.declarado?.[String(cod)];return v==null?def:+v||0;}
async function cargarDeclaracionesF29(force=false){
  const anio=+S.empresa.anio;
  if(!force&&F29DECL.loaded&&F29DECL.anio===anio)return F29DECL.items;
  if(F29DECL.cargando)return F29DECL.items;
  F29DECL.cargando=true;
  try{
    const r=await window.storage.get(claveF29Decl(anio));
    F29DECL.items=r?JSON.parse(r.value||'{}'):{};
    if(!F29DECL.items||Array.isArray(F29DECL.items)||typeof F29DECL.items!=='object')F29DECL.items={};
    F29DECL.anio=anio;F29DECL.loaded=true;
  }catch(e){console.warn('No se pudieron cargar declaraciones F29:',e);F29DECL.items={};F29DECL.anio=anio;F29DECL.loaded=true;}
  finally{F29DECL.cargando=false;}
  return F29DECL.items;
}
async function guardarDeclaracionesF29(){
  const r=await window.storage.set(claveF29Decl(S.empresa.anio),JSON.stringify(F29DECL.items||{}));
  return !!(r&&r.ok!==false);
}
function snapshotF29(d){
  const c={};F29_CODIGOS_DECL.forEach(k=>c[String(k)]=Math.round(+d.codigos?.[k]||0));
  return c;
}
function diferenciasF29(calc,decl){
  if(!decl)return [];
  return F29_CODIGOS_DECL.map(c=>({cod:c,calc:Math.round(+calc.codigos?.[c]||0),decl:codDecl(decl,c,0)}))
    .filter(x=>x.calc!==x.decl);
}
function setF29Declarado(cod,val){
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes);
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador',declarado:{}});
  if(esF29Presentado(d))return;
  d.declarado=d.declarado||{};d.declarado[String(cod)]=Math.max(0,pn(val));
}
function setF29DeclCampo(k,val){
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes);
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador',declarado:{}});
  if(esF29Presentado(d))return; d[k]=val;
}
async function setF29UTM(val){
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes);
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador',declarado:{}});
  if(esF29Presentado(d)){toast('🔒 Reabre el F29 antes de modificar la UTM del período.','e');return;}
  d.utm=Math.max(0,pn(val));d.actualizadoEn=new Date().toISOString();
  if(!await guardarDeclaracionesF29()){toast('❌ No se pudo guardar la UTM del período.','e');return;}
  renderF29();
}
function copiarCalculadoAF29(){
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes), calc=calcularF29Anual()[mes-1];
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador'});
  if(esF29Presentado(d))return;
  d.declarado=snapshotF29(calc); renderF29();
}
async function guardarBorradorF29(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de editar el control F29.','e');return;}
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes), calc=calcularF29Anual()[mes-1];
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador',declarado:snapshotF29(calc)});
  if(esF29Presentado(d)){toast('🔒 El F29 ya está marcado como presentado. Reábrelo para modificarlo.','e');return;}
  d.estado='borrador';d.actualizadoEn=new Date().toISOString();d.calculadoAlGuardar=snapshotF29(calc);
  if(!await guardarDeclaracionesF29()){toast('❌ No se pudo guardar el borrador F29.','e');return;}
  toast(`✅ Borrador F29 ${per} guardado`);renderF29();
}
async function presentarF29(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de registrar una declaración F29.','e');return;}
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes), calc=calcularF29Anual()[mes-1];
  const d=F29DECL.items[per]||(F29DECL.items[per]={periodo:per,estado:'borrador',declarado:snapshotF29(calc)});
  if(esF29Presentado(d)){toast('ℹ️ Este F29 ya está presentado','i');return;}
  if(!d.declarado||!Object.keys(d.declarado).length)d.declarado=snapshotF29(calc);
  if(!confirm(`¿Marcar el F29 ${per} como PRESENTADO AL SII?\n\nDesde ese momento sus valores declarados y su remanente quedarán congelados para el arrastre histórico.`))return;
  d.estado='presentado';d.presentadoEn=new Date().toISOString();d.calculadoAlPresentar=snapshotF29(calc);
  if(!d.fechaPresentacion)d.fechaPresentacion=new Date().toISOString().slice(0,10);
  if(!await guardarDeclaracionesF29()){d.estado='borrador';toast('❌ No se pudo registrar la presentación del F29.','e');return;}
  logAccion('Marcó F29 como presentado',`${per} · total declarado ${fmtC(codDecl(d,91,0))}`);
  toast(`✅ F29 ${per} registrado como presentado`);renderF29();
}
async function reabrirF29(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre el ejercicio antes de reabrir un F29.','e');return;}
  const mes=+(document.getElementById('f29-mes')?.value||1), per=periodoF29(mes), d=F29DECL.items[per];
  if(!esF29Presentado(d))return;
  const motivo=prompt(`Motivo de reapertura del F29 ${per} (mínimo 10 caracteres):`,'');
  if(!motivo||motivo.trim().length<10){toast('⚠️ Debes indicar un motivo de al menos 10 caracteres','e');return;}
  d.estado='borrador';d.reabiertoEn=new Date().toISOString();d.motivoReapertura=motivo.trim();
  if(!await guardarDeclaracionesF29()){d.estado='presentado';toast('❌ No se pudo reabrir el F29.','e');return;}
  logAccion('Reabrió F29',`${per} · ${motivo.trim()}`);toast(`🔓 F29 ${per} reabierto`);renderF29();
}

// ═══ FORMULARIO 29 (IVA mensual + PPM + retenciones) ═══
// Devuelve los datos mensuales de F29 para un año, con arrastre de remanente de crédito fiscal.
function _f29VentaDetalle(vs){
  const r={facturas:{n:0,iva:0},boletas:{n:0,iva:0},nd:{n:0,iva:0},nc:{n:0,iva:0},exentas:{n:0,monto:0}};
  vs.forEach(d=>{
    const t=+d.tipoDTE, iva=Math.abs(+d.iva||0), ex=Math.abs(+d.exento||0);
    if(t===33){r.facturas.n++;r.facturas.iva+=iva;}
    else if(t===39){r.boletas.n++;r.boletas.iva+=iva;}
    else if(t===56){r.nd.n++;r.nd.iva+=iva;}
    else if(t===61){r.nc.n++;r.nc.iva+=iva;}
    else if(t===34||t===41){r.exentas.n++;r.exentas.monto+=ex||Math.abs(+d.total||0);}
  });
  return r;
}
function _f29CompraDetalle(cs){
  const r={facturas:{n:0,credito:0},activoFijo:{n:0,credito:0},nd:{n:0,credito:0},nc:{n:0,credito:0},sinDerecho:{n:0,neto:0},exentas:{n:0,monto:0}};
  cs.forEach(d=>{
    const t=+d.tipoDTE, ci=clasificacionIVACompra(d), rec=ci.recuperable;
    if(t===61){r.nc.n++;r.nc.credito+=rec;return;}
    if(t===56){r.nd.n++;r.nd.credito+=rec;return;}
    if(t===32||t===34){r.exentas.n++;r.exentas.monto+=Math.abs(+d.exento||+d.total||0);return;}
    if(ci.activoFijo>0){r.activoFijo.n++;r.activoFijo.credito+=ci.activoFijo;}
    const creditoGiro=Math.max(0,rec-ci.activoFijo);
    if(creditoGiro>0){r.facturas.n++;r.facturas.credito+=creditoGiro;}
    if(ci.noRecuperable>0){r.sinDerecho.n++;r.sinDerecho.neto+=Math.abs(+d.neto||0);}
  });
  return r;
}

function _iuscRemuneraciones(periodo){
  return Math.max(0,Math.round((S.asientos||[])
    .filter(a=>!a.anulado&&a.tipo==='remuneraciones'&&(a.periodo===periodo||String(a.fecha||'').startsWith(periodo)))
    .reduce((s,a)=>s+(a.movs||[]).reduce((x,m)=>x+(m.cd==='2104002'?(+m.haber||0)-(+m.debe||0):0),0),0)));
}
function _utmPeriodo(periodo){
  const guardada=+declaracionF29(periodo)?.utm||0;
  if(guardada>0)return guardada;
  const asiento=(S.asientos||[]).find(a=>!a.anulado&&a.tipo==='remuneraciones'&&(a.periodo===periodo||String(a.fecha||'').startsWith(periodo))&&+a.indicadoresLiquidacion?.utm>0);
  return +asiento?.indicadoresLiquidacion?.utm||0;
}

// V2.11: devuelve además el desglose de códigos que explican el F29. El cálculo
// económico usa los signos de los DTE; el desglose conserva NC/ND en sus líneas
// propias para poder conciliar la propuesta del SII sin esconder compensaciones.
function calcularF29Anual(){
  const anio=S.empresa.anio;
  const meses=[];
  let remanenteAnt=0;
  let utmRemanenteAnt=0;
  const tasaPPM=(S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0)/100;
  for(let m=1;m<=12;m++){
    const vs=todosDocsVentas().filter(d=>+d.fecha.slice(5,7)===m);
    const vdet=_f29VentaDetalle(vs);
    let ventasNetas=0,ventasExentas=0,debito=0;
    vs.forEach(d=>{
      const signo=(dteV(d.tipoDTE)?.signo)||1;
      ventasNetas+=(d.neto||0)*signo;
      ventasExentas+=(d.exento||0)*signo;
      debito+=(d.iva||0)*signo;
    });

    const per=`${anio}-${String(m).padStart(2,'0')}`;
    const cs=todosDocsCompras().filter(d=>!esDteHonorario(d.tipoDTE)&&periodoContableCompra(d)===per);
    const cdet=_f29CompraDetalle(cs);
    let comprasNetas=0,credito=0,creditoActivoFijo=0,ivaNoRecuperable=0,ivaRetenido=0;
    cs.forEach(d=>{
      const signo=(dteC(d.tipoDTE)?.signo)||1;
      comprasNetas+=(d.neto||0)*signo;
      const ci=clasificacionIVACompra(d);
      credito+=(ci.recuperable-ci.activoFijo)*signo;
      creditoActivoFijo+=ci.activoFijo*signo;
      ivaNoRecuperable+=ci.noRecuperable*signo;
      const tc=tributacionCompra(d);
      if(tc.facturaCompra)ivaRetenido+=tc.ivaRetenido*signo;
    });
    const creditoMes=credito+creditoActivoFijo;
    const honM=(S.honorarios||[]).filter(h=>h.estado!=='anulado'&&h.mes===m);
    const retencionHon=Math.round(honM.reduce((s,h)=>s+(h.retencion!=null?Math.abs(+h.retencion||0):Math.round(Math.abs(+h.bruto||0)*(h.tasaRetencion!=null?+h.tasaRetencion:retencionHonorarios(S.empresa.anio)))),0));
    const iusc=_iuscRemuneraciones(per);
    const utmPeriodo=_utmPeriodo(per);
    const remanenteReaj=remanenteAnt>0&&utmRemanenteAnt>0&&utmPeriodo>0?Math.round((remanenteAnt/utmRemanenteAnt)*utmPeriodo):remanenteAnt;
    const reajusteRemanente=remanenteReaj-remanenteAnt;
    const remanenteSinUTM=remanenteAnt>0&&!(utmRemanenteAnt>0&&utmPeriodo>0);
    const creditoTotal=creditoMes+remanenteReaj;
    const debitoTotal=debito+ivaRetenido;
    const ivaDeterminado=debitoTotal-creditoTotal;
    const ivaAPagar=ivaDeterminado>0?ivaDeterminado:0;
    const remanente=ivaDeterminado<0?-ivaDeterminado:0;
    const basePPM=ventasNetas+ventasExentas;
    const ppm=Math.round(basePPM*tasaPPM);
    const totalPagar=ivaAPagar+ppm+retencionHon+iusc;
    const codigos={
      503:vdet.facturas.n,502:vdet.facturas.iva,
      110:vdet.boletas.n,111:vdet.boletas.iva,
      512:vdet.nd.n,513:vdet.nd.iva,
      509:vdet.nc.n,510:vdet.nc.iva,
      586:vdet.exentas.n,142:vdet.exentas.monto,
      538:debito,
      519:cdet.facturas.n,520:cdet.facturas.credito,
      524:cdet.activoFijo.n,525:cdet.activoFijo.credito,
      527:cdet.nc.n,528:cdet.nc.credito,
      531:cdet.nd.n,532:cdet.nd.credito,
      564:cdet.sinDerecho.n,521:cdet.sinDerecho.neto,
      584:cdet.exentas.n,562:cdet.exentas.monto,
      504:remanenteReaj,537:creditoTotal,77:remanente,89:ivaAPagar,
      563:basePPM,62:ppm,151:retencionHon,48:iusc,91:totalPagar,
      39:ivaRetenido
    };
    const decl=declaracionF29(per);
    meses.push({m,ventasNetas,ventasExentas,debito,ivaRetenido,debitoTotal,comprasNetas,credito,creditoActivoFijo,creditoMes,ivaNoRecuperable,remanenteAnt,remanenteReaj,reajusteRemanente,remanenteSinUTM,utmRemanenteAnt,utmPeriodo,creditoTotal,ivaDeterminado,ivaAPagar,remanente,basePPM,ppm,retencionHon,iusc,totalPagar,nDocsV:vs.length,nDocsC:cs.length,codigos,detalleVentas:vdet,detalleCompras:cdet,declaracion:decl||null});
    // Si el período fue presentado, el arrastre legal al mes siguiente es el
    // remanente DECLARADO, no el que hoy resulte de recalcular documentos viejos.
    remanenteAnt=esF29Presentado(decl)?codDecl(decl,77,remanente):remanente;
    utmRemanenteAnt=utmPeriodo;
  }
  return meses;
}

// ═══ V2.13 — CONCILIACIÓN F29 ↔ ASIENTOS ↔ PAGO ═══
// Concilia por período los importes declarados/calculados contra los asientos
// efectivamente contabilizados. Para asientos V2.13 usa metadata f29Detalle;
// para históricos conserva un fallback por descripción/código F29.
function _asientosF29(periodo,origen){
  return (S.asientos||[]).filter(a=>!a.anulado&&a.origenAuto===origen&&a.periodoIVA===periodo);
}
function _montoMov(a,re,lado='debe'){
  return (a?.movs||[]).reduce((s,m)=>re.test(String(m.desc||''))?s+(+m[lado]||0):s,0);
}
function _detalleComp(a){
  const d=a?.f29Detalle?.componentes||{};
  return {
    iva:d.ivaAPagar!=null?+d.ivaAPagar:_montoMov(a,/F29\s*c[oó]d\.?\s*89/i,'haber'),
    ppm:d.ppmProvisionado!=null?+d.ppmProvisionado:_montoMov(a,/PPM por pagar/i,'haber'),
  };
}
function _detallePago(a){
  const d=a?.f29Detalle?.componentes||{};
  const iva=d.iva!=null?+d.iva:_montoMov(a,/F29\s*c[oó]d\.?\s*89/i,'debe');
  const ppm=d.ppm!=null?+d.ppm:_montoMov(a,/F29\s*c[oó]d\.?\s*62/i,'debe');
  const honorarios=d.honorarios!=null?+d.honorarios:_montoMov(a,/F29\s*c[oó]d\.?\s*151/i,'debe');
  const iusc=d.iusc!=null?+d.iusc:_montoMov(a,/F29\s*c[oó]d\.?\s*48|Impuesto [ÚU]nico/i,'debe');
  const total=a?.f29Detalle?.totalPagado!=null?+a.f29Detalle.totalPagado:(a?.movs||[]).reduce((s,m)=>s+(+m.haber||0),0);
  return {iva,ppm,honorarios,iusc,total};
}
function _pagosAcumuladosF29(periodo){
  const pagos=_asientosF29(periodo,'pagof29');
  const componentes={}; let totalPagado=0,totalTributos=0;
  pagos.forEach(a=>{
    const det=a?.f29Detalle?.componentes||{};
    Object.entries(det).forEach(([k,v])=>componentes[k]=(componentes[k]||0)+Math.max(0,+v||0));
    const d=_detallePago(a);
    // Compatibilidad con pagos anteriores a V2.13, que no guardaban componentes.
    if(!Object.keys(det).length){
      componentes.iva=(componentes.iva||0)+Math.max(0,+d.iva||0);
      componentes.ppm=(componentes.ppm||0)+Math.max(0,+d.ppm||0);
      componentes.honorarios=(componentes.honorarios||0)+Math.max(0,+d.honorarios||0);
      componentes.iusc=(componentes.iusc||0)+Math.max(0,+d.iusc||0);
    }
    totalPagado+=Math.max(0,+d.total||0);
    totalTributos+=a?.f29Detalle?.totalTributos!=null?Math.max(0,+a.f29Detalle.totalTributos||0):Math.max(0,(+d.iva||0)+(+d.ppm||0)+(+d.honorarios||0)+(+d.iusc||0));
  });
  return {pagos,componentes,totalPagado,totalTributos};
}
function _retencionHonContabilizada(mes){
  const pref=`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
  return Math.round((S.asientos||[]).filter(a=>!a.anulado&&a.subtipo==='honorario'&&a.tipo==='documento'&&String(a.fecha||'').startsWith(pref))
    .reduce((s,a)=>s+(a.movs||[]).reduce((x,m)=>x+(m.cd==='2103002'?(+m.haber||0)-(+m.debe||0):0),0),0));
}
function conciliarF29Periodo(mes){
  const periodo=periodoF29(mes),calc=calcularF29Anual()[mes-1],decl=declaracionF29(periodo),presentado=esF29Presentado(decl);
  const esperado={
    iva:presentado?codDecl(decl,89,calc.ivaAPagar):Math.round(calc.ivaAPagar||0),
    ppm:presentado?codDecl(decl,62,calc.ppm):Math.round(calc.ppm||0),
    honorarios:presentado?codDecl(decl,151,calc.retencionHon):Math.round(calc.retencionHon||0),
    iusc:presentado?codDecl(decl,48,calc.iusc):Math.round(calc.iusc||0),
    total:presentado?codDecl(decl,91,calc.totalPagar):Math.round(calc.totalPagar||0),
  };
  const comps=_asientosF29(periodo,'ivaf29'), pagos=_asientosF29(periodo,'pagof29');
  const provision=comps.reduce((r,a)=>{const d=_detalleComp(a);r.iva+=d.iva;r.ppm+=d.ppm;return r;},{iva:0,ppm:0});
  const pagado=pagos.reduce((r,a)=>{const d=_detallePago(a);r.iva+=d.iva;r.ppm+=d.ppm;r.honorarios+=d.honorarios;r.iusc+=d.iusc;r.total+=d.total;return r;},{iva:0,ppm:0,honorarios:0,iusc:0,total:0});
  const retHonContable=_retencionHonContabilizada(mes);
  const nucleoEsperado=esperado.iva+esperado.ppm+esperado.honorarios+esperado.iusc;
  const nucleoPagado=pagado.iva+pagado.ppm+pagado.honorarios+pagado.iusc;
  const saldos={
    iva:Math.max(0,esperado.iva-pagado.iva),
    ppm:Math.max(0,esperado.ppm-pagado.ppm),
    honorarios:Math.max(0,esperado.honorarios-pagado.honorarios),
    iusc:Math.max(0,esperado.iusc-pagado.iusc),
    total:Math.max(0,nucleoEsperado-nucleoPagado),
  };
  const sobrepagos={
    iva:Math.max(0,pagado.iva-esperado.iva),ppm:Math.max(0,pagado.ppm-esperado.ppm),
    honorarios:Math.max(0,pagado.honorarios-esperado.honorarios),iusc:Math.max(0,pagado.iusc-esperado.iusc),total:Math.max(0,nucleoPagado-nucleoEsperado)
  };
  const alertas=[];
  if(comps.length>1)alertas.push(`Hay ${comps.length} asientos activos de compensación para ${periodo}.`);
  // V2.14: múltiples pagos son válidos; sólo se alertan sobrepagos o inconsistencias.
  if(presentado&&Math.abs(esperado.iva-provision.iva)>0)alertas.push(`IVA declarado ${fmtC(esperado.iva)} ≠ provisionado ${fmtC(provision.iva)}.`);
  if(presentado&&esperado.ppm>0&&provision.ppm>0&&Math.abs(esperado.ppm-provision.ppm)>0)alertas.push(`PPM declarado ${fmtC(esperado.ppm)} ≠ provisionado ${fmtC(provision.ppm)}.`);
  if(Math.abs(esperado.honorarios-retHonContable)>0)alertas.push(`Retención honorarios F29 ${fmtC(esperado.honorarios)} ≠ contabilidad fuente ${fmtC(retHonContable)}.`);
  if(Math.abs(esperado.iusc-Math.round(calc.iusc||0))>0)alertas.push(`IUSC F29 ${fmtC(esperado.iusc)} ≠ asiento de remuneraciones ${fmtC(calc.iusc)}.`);
  Object.entries(sobrepagos).filter(([k,v])=>k!=='total'&&v>0).forEach(([k,v])=>alertas.push(`Existe sobrepago en ${k}: ${fmtC(v)} sobre lo declarado/base.`));
  const discrepanciaOrigen=presentado&&(
    Math.abs(esperado.iva-Math.round(calc.ivaAPagar||0))>0 || Math.abs(esperado.ppm-Math.round(calc.ppm||0))>0 ||
    Math.abs(esperado.honorarios-retHonContable)>0 || Math.abs(esperado.iusc-Math.round(calc.iusc||0))>0
  );
  let estado='BORRADOR';
  if(presentado){
    const errorProvision=(esperado.iva>0&&Math.abs(esperado.iva-provision.iva)>0)||(esperado.ppm>0&&provision.ppm>0&&Math.abs(esperado.ppm-provision.ppm)>0);
    const sobre=Object.values(sobrepagos).some(v=>v>0);
    if(sobre||errorProvision||discrepanciaOrigen)estado='REVISAR';
    else if(saldos.total<=0)estado='CONCILIADO';
    else if(nucleoPagado>0)estado='PAGO_PARCIAL';
    else estado='PENDIENTE_PAGO';
  }
  return {periodo,calc,decl,presentado,esperado,comps,pagos,provision,pagado,retHonContable,nucleoEsperado,nucleoPagado,saldos,sobrepagos,estado,alertas};
}
function renderConciliacionF29(mes){
  const r=conciliarF29Periodo(mes),ok=r.estado==='CONCILIADO';
  const fila=(lbl,e,origen,prov,pag,saldo)=>{const dif=Math.round((+pag||0)-(+e||0));return `<tr><td class="tl">${lbl}</td><td>${fmtC(e)}</td><td>${fmtC(origen)}</td><td>${prov==null?'—':fmtC(prov)}</td><td>${fmtC(pag)}</td><td style="font-weight:700;color:${saldo>0?'var(--warn)':'var(--ach)'}">${saldo>0?fmtC(saldo):'—'}</td><td style="color:${dif>0?'var(--err)':'var(--mt)'}">${dif>0?'+'+fmtC(dif):'—'}</td></tr>`};
  const badge=r.estado==='CONCILIADO'?'bg':r.estado==='PAGO_PARCIAL'?'bi':r.estado==='PENDIENTE_PAGO'?'br':r.estado==='REVISAR'?'br':'bi';
  const historial=r.pagos.length?`<div style="margin-top:12px"><div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Historial de pagos</div><div class="card-np"><div class="tw"><table><thead><tr><th class="tl">ASIENTO</th><th class="tl">FECHA</th><th>IVA</th><th>PPM</th><th>HONORARIOS</th><th>IUSC</th><th>TOTAL</th></tr></thead><tbody>${r.pagos.slice().sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))).map(a=>{const d=_detallePago(a);return `<tr><td class="tl">N°${a.n||a.folioComp||'—'}</td><td class="tl">${a.fecha||'—'}</td><td>${fmtC(d.iva)}</td><td>${fmtC(d.ppm)}</td><td>${fmtC(d.honorarios)}</td><td>${fmtC(d.iusc)}</td><td>${fmtC(d.total)}</td></tr>`}).join('')}</tbody></table></div></div></div>`:'';
  return `<div class="card" style="max-width:980px;margin-top:14px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><div class="card-title">🔎 Conciliación F29 · Mayor · Pagos</div><div style="font-size:11px;color:var(--mt)">Controla declarado, origen contable, provisión, pagos acumulados y saldo pendiente del período.</div></div><span class="badge ${badge}">${r.estado.replaceAll('_',' ')}</span></div>
    ${r.alertas.length?`<div class="info-tip" style="margin:10px 0;background:rgba(210,153,34,.10);border-color:var(--warn)">${r.alertas.map(x=>'⚠️ '+x).join('<br>')}</div>`:(ok?'<div class="info-tip" style="margin:10px 0">✅ El período está completamente conciliado y sin saldo pendiente.</div>':`<div class="info-tip" style="margin:10px 0">💳 Saldo pendiente controlado: <strong>${fmtC(r.saldos.total)}</strong>. Los pagos parciales son válidos y se acumulan contra el período.</div>`)}
    <div class="card-np"><div class="tw"><table><thead><tr><th class="tl">CONCEPTO</th><th>DECL./BASE</th><th>CONTAB. ORIGEN</th><th>PROVISIÓN</th><th>PAGADO ACUM.</th><th>SALDO</th><th>SOBREPAGO</th></tr></thead><tbody>
      ${fila('IVA a pagar · cód. 89',r.esperado.iva,r.calc.ivaAPagar,r.provision.iva,r.pagado.iva,r.saldos.iva)}
      ${fila('PPM · cód. 62',r.esperado.ppm,r.calc.ppm,r.provision.ppm,r.pagado.ppm,r.saldos.ppm)}
      ${fila('Retención honorarios · cód. 151',r.esperado.honorarios,r.retHonContable,null,r.pagado.honorarios,r.saldos.honorarios)}
      ${fila('IUSC trabajadores · cód. 48',r.esperado.iusc,r.calc.iusc,null,r.pagado.iusc,r.saldos.iusc)}
      ${fila('Total núcleo controlado',r.nucleoEsperado,r.calc.ivaAPagar+r.calc.ppm+r.retHonContable+r.calc.iusc,null,r.nucleoPagado,r.saldos.total)}
    </tbody></table></div></div>
    ${historial}
    <div style="font-size:10px;color:var(--mt);margin-top:8px">Asientos activos: compensación ${r.comps.length} · pagos F29 ${r.pagos.length}. Más de un pago ya no se considera duplicado: representa pagos parciales mientras el acumulado no exceda la deuda del período.</div>
  </div>`;
}

function renderF29(){
  if(!F29DECL.loaded||F29DECL.anio!==+S.empresa.anio){cargarDeclaracionesF29().then(()=>renderF29());}
  const sel=document.getElementById('f29-mes');
  if(sel&&sel.options.length===0){
    sel.innerHTML=MESES.map((nm,i)=>`<option value="${i+1}">${nm} ${S.empresa.anio}</option>`).join('');
    // Mes por defecto: el actual si es del año en curso, si no enero
    const hoyMes=new Date().getMonth()+1;
    sel.value=(S.empresa.anio===new Date().getFullYear())?hoyMes:1;
  }
  const mSel=+sel.value||1;
  const data=calcularF29Anual();
  const d=data[mSel-1];
  const el=document.getElementById('f29-content');
  const per=periodoF29(mSel), decl=declaracionF29(per), presentado=esF29Presentado(decl), difs=diferenciasF29(d,decl);
  const declVal=cod=>decl?.declarado?.[String(cod)]!=null?decl.declarado[String(cod)]:(d.codigos?.[cod]||0);
  const panelDeclaracion=`<div class="card" style="max-width:760px;margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><div class="card-title">📌 Declaración F29 presentada</div><div style="font-size:11px;color:var(--mt)">Separa el cálculo dinámico del sistema de lo efectivamente declarado al SII.</div></div><span class="badge ${presentado?'bg':'bi'}">${presentado?'PRESENTADO':'BORRADOR'}</span></div>
    ${presentado&&difs.length?`<div class="info-tip" style="margin:10px 0;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ El cálculo actual difiere de la declaración presentada en <strong>${difs.length}</strong> código(s). La historia declarada no fue modificada; revisa la conciliación antes de rectificar.</div>`:''}
    <div class="fg" style="margin:10px 0"><div class="grp"><label>Fecha presentación</label><input type="date" value="${decl?.fechaPresentacion||''}" onchange="setF29DeclCampo('fechaPresentacion',this.value)" ${presentado?'disabled':''}></div><div class="grp"><label>Folio / N° declaración</label><input type="text" value="${String(decl?.folio||'').replace(/"/g,'&quot;')}" onchange="setF29DeclCampo('folio',this.value)" ${presentado?'disabled':''}></div></div>
    <div class="card-np"><div class="tw"><table><thead><tr><th class="tl">CÓDIGO</th><th class="tl">CONCEPTO</th><th>CALCULADO</th><th>DECLARADO</th><th>DIF.</th></tr></thead><tbody>
    ${[[538,'Total débitos'],[39,'IVA retenido'],[504,'Remanente anterior reajustado'],[537,'Total créditos'],[77,'Remanente siguiente'],[89,'IVA a pagar'],[62,'PPM'],[151,'Ret. honorarios'],[48,'IUSC trabajadores'],[91,'Total a pagar']].map(([c,l])=>{const cv=Math.round(+d.codigos?.[c]||0),dv=Math.round(+declVal(c)||0),df=dv-cv;return `<tr><td class="tl" style="font-family:var(--mono)">${c}</td><td class="tl">${l}</td><td>${fmtC(cv)}</td><td><input type="number" class="money-input" min="0" value="${dv}" onchange="setF29Declarado(${c},this.value)" ${presentado?'disabled':''} style="text-align:right;font-family:var(--mono);max-width:130px"></td><td style="font-family:var(--mono);color:${df?'var(--warn)':'var(--ach)'}">${df?fmtC(df):'—'}</td></tr>`}).join('')}
    </tbody></table></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">${presentado?`<button class="btn btn-g" onclick="reabrirF29()">🔓 Reabrir declaración</button>`:`<button class="btn btn-g" onclick="copiarCalculadoAF29()">↙ Copiar calculado</button><button class="btn btn-s" onclick="guardarBorradorF29()">💾 Guardar borrador</button><button class="btn btn-p" onclick="presentarF29()">✅ Marcar presentado</button>`}</div>
  </div>`;
  const linea=(cod,lbl,val,opts={})=>`<tr${opts.hl?' style="background:'+(opts.pos?'rgba(46,160,67,.10)':'rgba(88,166,255,.08)')+'"':''}>
    <td class="f29-cod" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${cod||''}</td>
    <td class="tl f29-desc" style="font-size:12px;${opts.bold?'font-weight:700':''}">${lbl}</td>
    <td class="f29-monto money-cell" style="font-family:var(--mono);text-align:right;${opts.bold?'font-weight:700;':''}color:${opts.color||'var(--tx)'}">${val===''?'':fmtC(val)}</td>
  </tr>`;
  el.innerHTML=`<div class="card" style="max-width:640px">
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:15px;font-weight:700">${S.empresa.nombre||'(sin empresa)'}</div>
      <div style="color:var(--mt);font-size:12px;margin-top:3px">Formulario 29 — ${MESES[mSel-1]} ${S.empresa.anio}</div>
      <div style="color:var(--mt);font-size:11px">RUT ${S.empresa.rut||'—'} · ${d.nDocsV} ventas · ${d.nDocsC} compras</div>
    </div>
    <table class="f29-table"><colgroup><col class="f29-col-cod"><col class="f29-col-desc"><col class="f29-col-monto"></colgroup><tbody>
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">DÉBITO FISCAL (Ventas)</td></tr>
      ${d.codigos[502]?linea('502',`IVA Facturas emitidas (${d.codigos[503]} docs)`,d.codigos[502]):''}
      ${d.codigos[111]?linea('111',`IVA Boletas emitidas (${d.codigos[110]} docs)`,d.codigos[111]):''}
      ${d.codigos[513]?linea('513',`IVA Notas de Débito emitidas (${d.codigos[512]} docs)`,d.codigos[513],{color:'var(--warn)'}):''}
      ${d.codigos[510]?linea('510',`IVA Notas de Crédito emitidas (${d.codigos[509]} docs)`,d.codigos[510],{color:'var(--info)'}):''}
      ${d.codigos[142]?linea('142',`Ventas exentas/no gravadas (${d.codigos[586]} docs)`,d.codigos[142]):''}
      ${linea('538','TOTAL DÉBITOS IVA',d.debito,{bold:true})}
      ${d.ivaRetenido?linea('39','IVA retenido a terceros / cambio de sujeto',d.ivaRetenido,{color:'var(--info)'})+linea('','Débitos + retenciones del período',d.debitoTotal,{bold:true}):''}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">CRÉDITO FISCAL (Compras)</td></tr>
      ${d.codigos[520]?linea('520',`Crédito facturas del giro (${d.codigos[519]} docs)`,d.codigos[520]):''}
      ${d.codigos[525]?linea('525',`Crédito activo fijo (${d.codigos[524]} docs)`,d.codigos[525],{color:'var(--info)'}):''}
      ${d.codigos[532]?linea('532',`Crédito Notas de Débito recibidas (${d.codigos[531]} docs)`,d.codigos[532],{color:'var(--warn)'}):''}
      ${d.codigos[528]?linea('528',`Crédito Notas de Crédito recibidas (${d.codigos[527]} docs)`,d.codigos[528],{color:'var(--info)'}):''}
      ${d.codigos[521]?linea('521',`Compras afectas sin derecho a crédito (${d.codigos[564]} docs)`,d.codigos[521],{color:'var(--warn)'}):''}
      ${d.codigos[562]?linea('562',`Compras exentas/no gravadas (${d.codigos[584]} docs)`,d.codigos[562]):''}
      ${d.ivaNoRecuperable?linea('','IVA no recuperable incorporado al costo',d.ivaNoRecuperable,{color:'var(--warn)'}):''}
      ${d.remanenteAnt>0?linea('504','Remanente anterior reajustado por UTM',d.remanenteReaj,{color:'var(--info)'}):''}
      ${d.reajusteRemanente?linea('','Reajuste del remanente',d.reajusteRemanente,{color:'var(--info)'}):''}
      ${linea('537','TOTAL CRÉDITOS',d.creditoTotal,{bold:true})}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">DETERMINACIÓN IVA</td></tr>
      ${d.ivaAPagar>0?linea('89','IVA a pagar',d.ivaAPagar,{bold:true,hl:true,color:'var(--err)'}):linea('77','Remanente crédito fiscal (mes siguiente)',d.remanente,{bold:true,hl:true,color:'var(--info)'})}
      <tr class="rth"><td colspan="3" class="tl" style="padding:7px 10px">PPM Y RETENCIONES</td></tr>
      ${linea('563','Base imponible PPM',d.basePPM)}
      ${linea('62','PPM ('+((S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0))+'%)',d.ppm,{color:'var(--err)'})}
      ${linea('151',`Retención honorarios (${(retencionHonorarios(S.empresa.anio)*100).toFixed(2)}%)`,d.retencionHon,{color:'var(--err)'})}
      ${linea('48','Impuesto Único de Segunda Categoría',d.iusc,{color:'var(--err)'})}
      <tr style="background:${d.totalPagar>0?'rgba(248,81,73,.12)':'rgba(46,160,67,.12)'}">
        <td class="f29-cod" style="font-family:var(--mono);font-size:11px;color:var(--mt)">91</td>
        <td class="tl f29-desc" style="padding:11px;font-weight:700;font-size:14px">TOTAL A PAGAR</td>
        <td class="f29-monto money-cell" style="font-family:var(--mono);text-align:right;font-weight:700;font-size:14px;color:${d.totalPagar>0?'var(--err)':'var(--ach)'}">${fmtC(d.totalPagar)}</td>
      </tr>
    </tbody></table>
    <div class="fg" style="margin-top:12px"><div class="grp"><label>UTM del período ${per}</label><input type="number" class="money-input" min="0" value="${d.utmPeriodo||''}" onchange="setF29UTM(this.value)" ${presentado?'disabled':''}></div></div>
    ${d.remanenteSinUTM?'<div class="info-tip" style="margin-top:10px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ Falta la UTM del mes de origen o del período actual. El código 504 se muestra sin reajuste hasta completar ambas UTM.</div>':''}
    ${d.tasaPPM===0&&(S.empresa.tasaPPM==null||+S.empresa.tasaPPM===0)?'<div class="info-tip" style="margin-top:12px;font-size:11px">⚠️ La tasa de PPM está en 0%. Configúrala en Empresa → Configuración Tributaria para que se calcule el PPM.</div>':''}
    <div style="margin-top:12px;font-size:10px;color:var(--mt)">Los códigos corresponden al Formulario 29 del SII. Este es un cálculo referencial basado en tus registros; verifica antes de declarar.</div>
  </div>
  ${panelDeclaracion}
  ${renderConciliacionF29(mSel)}
  <div id="ivac-content" style="max-width:760px"></div>
  <div id="pagof29-content" style="max-width:900px"></div>`;
  renderCompensacionIVA();
  renderPagoF29();
}

// ═══════════════════════════════════════════════════════════════════════
// ASIENTO DE COMPENSACIÓN DE IVA (liquidación mensual del F29)
// ═══════════════════════════════════════════════════════════════════════
//
// Procedimiento contable chileno. Durante el mes, el IVA recargado en las
// ventas se acumula en el pasivo IVA Débito Fiscal y el soportado en las
// compras en el activo IVA Crédito Fiscal. Al cierre del período tributario
// ambas cuentas se saldan entre sí (DL 825, art. 20 y 23) y la diferencia
// determina el resultado del período:
//
//   • Débito > Crédito  → IVA a pagar (F29 código 89): pasivo por enterar en
//                         arcas fiscales dentro del plazo legal.
//   • Crédito > Débito  → Remanente de crédito fiscal (F29 código 77): activo
//                         que se imputa al período siguiente (art. 26 y 27).
//
// El remanente arrastrado se reajusta según el art. 27 del DL 825:
// se convierte a UTM del mes en que se originó y se reconvierte a UTM del mes
// en que se imputa. La diferencia de reajuste es un resultado del ejercicio.
//
// Las líneas quedan siempre cuadradas por construcción:
//   Débito = Crédito del mes ± Δ Remanente + IVA a pagar ± Reajuste

// Cuentas por defecto del asiento (se pueden cambiar en el formulario)
const IVAC_DEFAULT={
  debito:'2103003',      // IVA DÉBITO FISCAL (pasivo)
  ivaRetenido:'2103005', // IVA RETENIDO / OTROS IMPUESTOS POR PAGAR (pasivo)
  credito:'1108002',     // IVA CRÉDITO FISCAL (activo)
  creditoActivoFijo:'1108008', // IVA CRÉDITO FISCAL ACTIVO FIJO
  remanente:'1108007',   // REMANENTE CRÉDITO FISCAL (activo) — se crea si no existe
  porPagar:'2104002',    // IMPUESTOS POR PAGAR (pasivo)
  reajuste:'3501001',    // CORRECCIÓN MONETARIA (resultado) — se resuelve dinámicamente
  ppmActivo:'1108001',   // PAGOS PROVISIONALES MENSUALES (activo)
  ppmPasivo:'2105006',   // PROVISIÓN PPM (pasivo)
};
// Estado del formulario
const IVAC={cuentas:{...IVAC_DEFAULT},incluirPPM:false,utmOrigen:0,utmActual:0,fecha:'',glosa:''};

// Primera cuenta existente de una lista de candidatos
function primeraCuenta(...cds){
  for(const cd of cds){if(PDC.some(x=>x.cd===cd))return cd;}
  return '';
}
// La cuenta de remanente no viene en el plan estándar: se ofrece crearla.
function cuentaRemanenteExiste(){return PDC.some(x=>x.cd===IVAC.cuentas.remanente);}
async function crearCuentaRemanente(){
  const cd=IVAC_DEFAULT.remanente;
  if(PDC.some(x=>x.cd===cd)){toast('La cuenta ya existe');return;}
  PDC.push({cd,nm:'REMANENTE CRÉDITO FISCAL',tp:'A',nat:'D'});
  PDC.sort((a,b)=>String(a.cd).localeCompare(String(b.cd),'es',{numeric:true}));
  await savePDC();
  IVAC.cuentas.remanente=cd;
  toast(`✅ Cuenta ${cd} REMANENTE CRÉDITO FISCAL creada en el plan de cuentas`);
  renderCompensacionIVA();
}

// Último día del mes (fecha contable del asiento de liquidación)
function ultimoDiaMes(anio,mes){
  return `${anio}-${String(mes).padStart(2,'0')}-${String(new Date(anio,mes,0).getDate()).padStart(2,'0')}`;
}

// ¿Ya se generó el asiento de compensación de este período?
function asientoIVAExistente(periodo){
  return (S.asientos||[]).find(a=>!a.anulado&&a.origenAuto==='ivaf29'&&a.periodoIVA===periodo)||null;
}

// Calcula las líneas del asiento para un mes. Devuelve {movs, detalle, cuadra}.
function calcularCompensacionIVA(mes){
  const anio=S.empresa.anio;
  const d=calcularF29Anual()[mes-1];
  const c=IVAC.cuentas;

  // Reajuste del remanente arrastrado (art. 27 DL 825). Con UTM iguales el
  // factor es 1 y no se genera línea: el usuario decide si reajusta o no.
  const utmO=+IVAC.utmOrigen||0, utmA=+IVAC.utmActual||0;
  let remanenteReaj=d.remanenteAnt, reajuste=0, remanenteUTM=0;
  if(d.remanenteAnt>0&&utmO>0&&utmA>0&&utmO!==utmA){
    remanenteUTM=d.remanenteAnt/utmO;
    remanenteReaj=Math.round(remanenteUTM*utmA);
    reajuste=remanenteReaj-d.remanenteAnt;
  }
  // Recalcular la determinación con el remanente reajustado.
  // El débito a saldar incluye el IVA retenido en facturas de compra, porque el
  // asiento automático de compras lo acredita en la misma cuenta de débito.
  const creditoTotal=d.creditoMes+remanenteReaj;
  const determinado=d.debitoTotal-creditoTotal;
  const ivaAPagar=determinado>0?determinado:0;
  const remanenteNuevo=determinado<0?-determinado:0;
  // Movimiento neto de la cuenta de remanente en el período
  const deltaRem=remanenteNuevo-d.remanenteAnt;

  const movs=[];
  const nm=cd=>pdcNm(cd)||cd;
  const per=`${MESES[mes-1]} ${anio}`;
  // 1) Se salda el IVA Débito Fiscal de ventas.
  if(d.debito>0)movs.push({cd:c.debito,nm:nm(c.debito),debe:Math.round(d.debito),haber:0,
    desc:`Débito fiscal ventas ${per} (F29 cód. 538)`});
  // 1b) Se salda por separado el IVA retenido de facturas de compra DTE 45/46.
  //     El motor de compras lo acredita en 2103005, evitando mezclarlo con ventas.
  if(d.ivaRetenido>0)movs.push({cd:c.ivaRetenido,nm:nm(c.ivaRetenido),debe:Math.round(d.ivaRetenido),haber:0,
    desc:`IVA retenido facturas de compra ${per} (DTE 45/46)`});
  // 2) Se salda el IVA Crédito Fiscal del mes
  if(d.credito>0)movs.push({cd:c.credito,nm:nm(c.credito),debe:0,haber:Math.round(d.credito),desc:`Crédito fiscal ${per} (F29 cód. 524)`});
  if(d.creditoActivoFijo>0)movs.push({cd:c.creditoActivoFijo,nm:nm(c.creditoActivoFijo),debe:0,haber:Math.round(d.creditoActivoFijo),desc:`Crédito fiscal activo fijo ${per}`});
  // 3) Reajuste del remanente arrastrado, si corresponde.
  //    Un reajuste positivo aumenta el crédito imputable, así que reduce el IVA
  //    a pagar (o engrosa el remanente): se reconoce como ingreso por corrección
  //    monetaria (HABER). Si la UTM bajara sería una pérdida (DEBE).
  if(reajuste!==0)movs.push({
    cd:c.reajuste,nm:nm(c.reajuste),
    debe:reajuste<0?Math.round(-reajuste):0,haber:reajuste>0?Math.round(reajuste):0,
    desc:`Reajuste remanente art. 27 DL 825 (UTM ${fmt(utmO)} → ${fmt(utmA)})`});
  // 4) Movimiento neto de la cuenta de remanente
  if(deltaRem>0)movs.push({cd:c.remanente,nm:nm(c.remanente),debe:Math.round(deltaRem),haber:0,desc:`Remanente crédito fiscal ${per} (F29 cód. 77)`});
  else if(deltaRem<0)movs.push({cd:c.remanente,nm:nm(c.remanente),debe:0,haber:Math.round(-deltaRem),desc:`Imputación remanente mes anterior (F29 cód. 504)`});
  // 5) IVA a pagar del período
  if(ivaAPagar>0)movs.push({cd:c.porPagar,nm:nm(c.porPagar),debe:0,haber:Math.round(ivaAPagar),desc:`IVA a pagar ${per} (F29 cód. 89)`});
  // 6) PPM del período (opcional — no se registra en ninguna otra parte del sistema)
  if(IVAC.incluirPPM&&d.ppm>0){
    movs.push({cd:c.ppmActivo,nm:nm(c.ppmActivo),debe:Math.round(d.ppm),haber:0,desc:`PPM ${per} (F29 cód. 62)`});
    movs.push({cd:c.ppmPasivo,nm:nm(c.ppmPasivo),debe:0,haber:Math.round(d.ppm),desc:`PPM por pagar ${per}`});
  }

  const tD=movs.reduce((s,m)=>s+m.debe,0),tH=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,tD,tH,cuadra:Math.abs(tD-tH)<1,
    d,remanenteReaj,reajuste,remanenteUTM,creditoTotal,determinado,ivaAPagar,remanenteNuevo,deltaRem};
}

// ── Handlers del formulario ──
function setIvacCuenta(k,cd){IVAC.cuentas[k]=cd;renderCompensacionIVA();}
function setIvacCampo(k,v){
  if(k==='incluirPPM')IVAC.incluirPPM=!!v;
  else if(k==='utmOrigen'||k==='utmActual')IVAC[k]=pn(v);
  else IVAC[k]=v;
  renderCompensacionIVA();
}
function resetIvacCuentas(){IVAC.cuentas={...IVAC_DEFAULT};renderCompensacionIVA();}

function renderCompensacionIVA(){
  const el=document.getElementById('ivac-content');if(!el)return;
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  // Al cambiar de mes se recalculan fecha y glosa (si no las editó el usuario a mano)
  if(IVAC.periodo!==periodo){IVAC.periodo=periodo;IVAC.fecha='';IVAC.glosa='';}

  // Cuentas por defecto que sí existan en este plan de cuentas
  if(!PDC.some(x=>x.cd===IVAC.cuentas.reajuste))
    IVAC.cuentas.reajuste=primeraCuenta('3502001','3501001','3503001','4301001','3401001')||IVAC.cuentas.reajuste;
  // UTM: por defecto la configurada en Indicadores para ambos meses (factor 1)
  const utmCfg=Math.round(getIndicadores()?.utm||0);
  if(!IVAC.utmOrigen)IVAC.utmOrigen=utmCfg;
  if(!IVAC.utmActual)IVAC.utmActual=utmCfg;

  const r=calcularCompensacionIVA(mes);
  const d=r.d;
  const yaExiste=asientoIVAExistente(periodo);
  const faltaRemanente=(r.deltaRem!==0)&&!cuentaRemanenteExiste();
  const fecha=IVAC.fecha||ultimoDiaMes(anio,mes);
  const glosa=IVAC.glosa||`Compensación IVA ${MESES[mes-1]} ${anio} — F29`;

  const selCuenta=(k,lbl,ayuda)=>`<div class="grp">
    <label>${lbl}</label>
    ${inputCuenta({id:'ivac-cd-'+k,value:IVAC.cuentas[k]||'',onPick:`setIvacCuenta('${k}','%CD%')`,
      placeholder:'Buscar cuenta…',clase:'linea-inp'})}
    ${ayuda?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${ayuda}</div>`:''}
  </div>`;

  const filaMov=m=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${m.cd}</td>
    <td class="tnm" style="font-size:12px">${m.nm}<div style="font-size:10px;color:var(--mt)">${m.desc}</div></td>
    <td style="font-family:var(--mono)">${m.debe?fmtC(m.debe):'–'}</td>
    <td style="font-family:var(--mono)">${m.haber?fmtC(m.haber):'–'}</td>
  </tr>`;

  el.innerHTML=`<div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      <div>
        <div style="font-size:15px;font-weight:700">🧾 Asiento de compensación de IVA</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">Liquidación del período ${MESES[mes-1]} ${anio} — salda Débito contra Crédito Fiscal</div>
      </div>
      ${yaExiste?`<span class="badge br" title="Ya se generó la compensación de este período">⚠️ Ya generado — Asiento N°${yaExiste.n}</span>`:''}
    </div>

    <div class="info-tip" style="margin:10px 0 14px;font-size:11px;line-height:1.6">
      📘 El IVA recargado en las ventas se acumula en el pasivo <strong>IVA Débito Fiscal</strong> y el soportado en las compras
      en el activo <strong>IVA Crédito Fiscal</strong>. Al cierre del período tributario ambas cuentas se saldan entre sí
      (DL 825, arts. 20 y 23) y la diferencia determina el resultado:
      si el débito supera al crédito queda un <strong>IVA a pagar</strong> (código 89); si el crédito supera al débito queda un
      <strong>remanente de crédito fiscal</strong> (código 77) que se imputa al período siguiente, reajustado en UTM según el art. 27.
    </div>

    <div class="card-np" style="margin-bottom:14px"><table><tbody>
      <tr class="rth"><td colspan="2" class="tl" style="padding:7px 10px">DETERMINACIÓN DEL PERÍODO</td></tr>
      <tr><td class="tl" style="font-size:12px">Débito fiscal del mes (cód. 538)</td><td style="font-family:var(--mono)">${fmtC(d.debito)}</td></tr>
      ${d.ivaRetenido?`<tr><td class="tl" style="font-size:12px;color:var(--info)">IVA retenido en facturas de compra (cambio de sujeto)</td><td style="font-family:var(--mono);color:var(--info)">${fmtC(d.ivaRetenido)}</td></tr>`:''}
      <tr><td class="tl" style="font-size:12px">Crédito fiscal del mes (cód. 524)</td><td style="font-family:var(--mono)">${fmtC(d.credito)}</td></tr>
      ${d.creditoActivoFijo?`<tr><td class="tl" style="font-size:12px;color:var(--info)">Crédito fiscal activo fijo</td><td style="font-family:var(--mono);color:var(--info)">${fmtC(d.creditoActivoFijo)}</td></tr>`:''}
      ${d.ivaNoRecuperable?`<tr><td class="tl" style="font-size:12px;color:var(--warn)">IVA no recuperable incorporado al costo</td><td style="font-family:var(--mono);color:var(--warn)">${fmtC(d.ivaNoRecuperable)}</td></tr>`:''}
      ${d.remanenteAnt>0?`<tr><td class="tl" style="font-size:12px">Remanente del mes anterior (cód. 504)</td><td style="font-family:var(--mono)">${fmtC(d.remanenteAnt)}</td></tr>`:''}
      ${r.reajuste!==0?`<tr><td class="tl" style="font-size:12px;color:var(--info)">Reajuste del remanente (art. 27) — ${r.remanenteUTM.toFixed(2)} UTM</td><td style="font-family:var(--mono);color:var(--info)">${fmtC(r.reajuste)}</td></tr>`:''}
      <tr><td class="tl" style="font-size:12px;font-weight:600">Crédito fiscal total</td><td style="font-family:var(--mono);font-weight:600">${fmtC(r.creditoTotal)}</td></tr>
      <tr style="background:${r.ivaAPagar>0?'rgba(248,81,73,.10)':'rgba(88,166,255,.08)'}">
        <td class="tl" style="font-size:13px;font-weight:700;padding:9px 10px">${r.ivaAPagar>0?'IVA A PAGAR (cód. 89)':'REMANENTE PARA EL MES SIGUIENTE (cód. 77)'}</td>
        <td style="font-family:var(--mono);font-weight:700;color:${r.ivaAPagar>0?'var(--err)':'var(--info)'}">${fmtC(r.ivaAPagar>0?r.ivaAPagar:r.remanenteNuevo)}</td>
      </tr>
    </tbody></table></div>

    <div class="fg" style="margin-bottom:12px">
      <div class="grp"><label>Fecha del asiento</label>
        <input type="date" value="${fecha}" onchange="setIvacCampo('fecha',this.value)">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Por defecto el último día del período tributario</div></div>
      <div class="grp"><label>Glosa</label>
        <input type="text" value="${glosa.replace(/"/g,'&quot;')}" onchange="setIvacCampo('glosa',this.value)"></div>
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Cuentas del asiento</div>
    <div class="fg" style="margin-bottom:6px">
      ${selCuenta('debito','IVA Débito Fiscal (se salda al DEBE)')}
      ${selCuenta('credito','IVA Crédito Fiscal (se salda al HABER)')}
      ${d.creditoActivoFijo?selCuenta('creditoActivoFijo','IVA Crédito Fiscal Activo Fijo (se salda al HABER)'):''}
      ${selCuenta('remanente','Remanente crédito fiscal',faltaRemanente?'<span style="color:var(--warn)">⚠️ Esta cuenta no existe en tu plan</span>':'')}
      ${selCuenta('porPagar','IVA por pagar')}
      ${r.reajuste!==0?selCuenta('reajuste','Reajuste del remanente (resultado)'):''}
      ${IVAC.incluirPPM?selCuenta('ppmActivo','PPM (activo)')+selCuenta('ppmPasivo','PPM por pagar'):''}
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-g" style="font-size:11px" onclick="resetIvacCuentas()">↺ Cuentas por defecto</button>
      ${faltaRemanente?`<button class="btn btn-i" style="font-size:11px" onclick="crearCuentaRemanente()">+ Crear cuenta 1108007 REMANENTE CRÉDITO FISCAL</button>`:''}
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Reajuste del remanente (art. 27 DL 825)</div>
    ${d.remanenteAnt>0?`
      <div class="fg" style="margin-bottom:6px">
        <div class="grp"><label>UTM del mes en que se originó</label>
          <input type="number" class="money-input" value="${IVAC.utmOrigen}" onchange="setIvacCampo('utmOrigen',this.value)"></div>
        <div class="grp"><label>UTM del mes de imputación</label>
          <input type="number" class="money-input" value="${IVAC.utmActual}" onchange="setIvacCampo('utmActual',this.value)"></div>
      </div>
      <div style="font-size:11px;color:var(--mt);margin-bottom:14px">
        El remanente se expresa en UTM del mes en que se originó y se reconvierte a la UTM del mes en que se imputa.
        Con ambos valores iguales el factor es 1 y no se genera línea de reajuste.
        ${r.reajuste!==0?`<br><strong style="color:var(--info)">${fmtC(d.remanenteAnt)} ÷ ${fmt(IVAC.utmOrigen)} = ${r.remanenteUTM.toFixed(2)} UTM × ${fmt(IVAC.utmActual)} = ${fmtC(r.remanenteReaj)}</strong> · reajuste ${fmtC(r.reajuste)}`:''}
      </div>`
      :`<div style="font-size:11px;color:var(--mt);margin-bottom:14px">No hay remanente arrastrado desde el mes anterior, así que no corresponde reajuste.</div>`}

    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;user-select:none;margin-bottom:14px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
      <input type="checkbox" ${IVAC.incluirPPM?'checked':''} onchange="setIvacCampo('incluirPPM',this.checked)" style="width:auto">
      <span>Incluir también el PPM del período (${fmtC(d.ppm)})</span>
    </label>
    <div style="font-size:10px;color:var(--mt);margin-top:-10px;margin-bottom:14px">
      Las retenciones (honorarios, impuesto único, cambio de sujeto) <strong>no</strong> se incluyen acá: se registran al momento de cada operación y se cancelan en el asiento de pago del F29, más abajo.
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Previsualización del asiento</div>
    ${r.movs.length?`<div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th class="tl" style="width:82px">CÓD.</th><th class="tl">CUENTA</th><th style="width:130px">DEBE</th><th style="width:130px">HABER</th></tr></thead>
      <tbody>${r.movs.map(filaMov).join('')}</tbody>
      <tfoot><tr><td class="tl" colspan="2">TOTALES</td>
        <td style="font-family:var(--mono)">${fmtC(r.tD)}</td>
        <td style="font-family:var(--mono)">${fmtC(r.tH)}</td></tr></tfoot>
    </table></div></div>
    <div style="font-size:12px;color:${r.cuadra?'var(--ach)':'var(--err)'};margin-bottom:12px">
      ${r.cuadra?'✅ Asiento cuadrado — Debe = Haber = '+fmtC(r.tD):'⚠️ Descuadre de '+fmtC(Math.abs(r.tD-r.tH))}
    </div>`
    :`<div style="text-align:center;padding:24px;color:var(--mt);font-size:12px">No hay IVA que compensar en ${MESES[mes-1]} ${anio}.</div>`}

    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-p" onclick="generarAsientoIVA()" ${(!r.movs.length||!r.cuadra||faltaRemanente)?'disabled style="opacity:.5;cursor:not-allowed"':''}>
        📝 ${yaExiste?'Generar de nuevo':'Generar asiento'}
      </button>
    </div>
    <div style="margin-top:10px;font-size:10px;color:var(--mt)">
      El asiento se crea como <strong>asiento manual</strong>: queda visible en Comprobantes y Libro Diario, y se puede editar o anular como cualquier otro.
    </div>
  </div>`;
}

async function generarAsientoIVA(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de generar asientos de IVA/F29.','e');return;}
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  const r=calcularCompensacionIVA(mes);
  if(!r.movs.length){toast('⚠️ No hay IVA que compensar en este período','e');return;}
  if(!r.cuadra){toast('⚠️ El asiento no cuadra — revisa las cuentas','e');return;}
  const faltantes=r.movs.filter(m=>!PDC.some(x=>x.cd===m.cd)).map(m=>m.cd);
  if(faltantes.length){toast(`⚠️ Estas cuentas no existen en el plan: ${[...new Set(faltantes)].join(', ')}`,'e');return;}

  const yaExiste=asientoIVAExistente(periodo);
  const per=`${MESES[mes-1]} ${anio}`;
  const resumen=r.ivaAPagar>0?`IVA a pagar ${fmtC(r.ivaAPagar)}`:`Remanente ${fmtC(r.remanenteNuevo)}`;
  const msg=(yaExiste
      ? `⚠️ Ya existe el asiento N°${yaExiste.n} de compensación de ${per}.\nSe creará OTRO asiento (el anterior no se borra: anúlalo si corresponde).\n\n`
      : '')
    +`Compensación de IVA — ${per}\n\n`
    +`Débito fiscal:   ${fmtC(r.d.debito)}\n`
    +(r.d.ivaRetenido?`IVA retenido:    ${fmtC(r.d.ivaRetenido)} (facturas de compra)\n`:'')
    +`Crédito fiscal:  ${fmtC(r.d.credito)}\n`
    +(r.d.remanenteAnt>0?`Remanente ant.:  ${fmtC(r.d.remanenteAnt)}${r.reajuste?` (reajustado a ${fmtC(r.remanenteReaj)})`:''}\n`:'')
    +(IVAC.incluirPPM&&r.d.ppm>0?`PPM:             ${fmtC(r.d.ppm)}\n`:'')
    +`\nResultado:       ${resumen}\n\n¿Generar el asiento?`;
  if(!confirm(msg))return;

  const folio=proxFolioComprobante();
  const fecha=IVAC.fecha||ultimoDiaMes(anio,mes);
  const glosa=IVAC.glosa||`Compensación IVA ${per} — F29`;
  const pr=await persistirAsientosCritico(()=>{S.asientos.push({
    id:'as_iva_'+Date.now(),n:folio,folioComp:folio,fecha,glosa,
    movs:r.movs.map(m=>({...m})),
    origenAuto:'ivaf29',periodoIVA:periodo,tipo:'tributario',
    f29Detalle:{version:13,periodo,componentes:{ivaAPagar:Math.round(r.ivaAPagar||0),ppmProvisionado:IVAC.incluirPPM?Math.round(r.d.ppm||0):0,remanenteNuevo:Math.round(r.remanenteNuevo||0)},cuentas:{...IVAC.cuentas},calculado:snapshotF29(r.d),declarado:esF29Presentado(declaracionF29(periodo))?{...(declaracionF29(periodo).declarado||{})}:null},
  });});
  if(!pr.ok){toast('❌ No se pudo guardar la compensación de IVA. La operación NO se contabilizó.','e');return;}
  toast(`✅ Asiento N°${folio} — compensación IVA ${per} · ${resumen}`);
  logAccion('Generó compensación de IVA',`${per} · asiento N°${folio} · ${resumen}`);
  rerender();
  renderF29();
}
// Resumen anual PPM
function renderPPM(){
  const data=calcularF29Anual();
  const tasaPPM=(S.empresa.tasaPPM!=null?+S.empresa.tasaPPM:0);
  const el=document.getElementById('ppm-content');
  const totBase=data.reduce((s,d)=>s+d.basePPM,0);
  const totPPM=data.reduce((s,d)=>s+d.ppm,0);
  const rows=data.map(d=>`<tr${d.basePPM>0?'':' style="opacity:.4"'}>
    <td class="tl ppm-mes" style="font-size:12px">${MESES[d.m-1]}</td>
    <td class="ppm-base money-cell" style="font-family:var(--mono);text-align:right">${fmtC(d.basePPM)}</td>
    <td class="ppm-monto money-cell" style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(d.ppm)}</td>
  </tr>`).join('');
  el.innerHTML=`<div class="card" style="max-width:560px">
    <div class="info-tip" style="margin-bottom:14px">💰 PPM del ejercicio ${S.empresa.anio} — tasa <strong>${tasaPPM}%</strong> sobre ingresos brutos mensuales.${tasaPPM===0?' <span style="color:var(--warn)">Configura la tasa en Empresa.</span>':''}</div>
    <table class="ppm-table"><thead><tr><th class="tl ppm-mes">MES</th><th class="ppm-base" style="text-align:right">BASE (Ingresos brutos)</th><th class="ppm-monto" style="text-align:right">PPM</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl ppm-mes" style="font-weight:700">TOTAL AÑO</td><td class="ppm-base money-cell" style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totBase)}</td><td class="ppm-monto money-cell" style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totPPM)}</td></tr></tfoot>
    </table>
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════════
// ASIENTO DE PAGO DEL F29
// ═══════════════════════════════════════════════════════════════════════
//
// El F29 no paga sólo IVA: en el mismo formulario se enteran las retenciones
// que la empresa practicó durante el mes actuando como agente retenedor.
// El asiento de pago cancela esos pasivos contra banco/caja:
//
//   DEBE   IVA determinado a pagar .................... cód. 89
//   DEBE   PPM Primera Categoría ...................... cód. 62
//   DEBE   Retención boletas de honorarios recibidas .. cód. 151 (Art. 42 N°2)
//   DEBE   Retención boletas de servicios de terceros . cód. 151 (BTE)
//   DEBE   Impuesto Único de Segunda Categoría ........ cód. 48 (Art. 74 N°1)
//   DEBE   IVA retenido en facturas de compra ......... cambio de sujeto
//   DEBE   Multas, reajustes e intereses (si paga fuera de plazo) → gasto
//     HABER  Banco / Caja ............................. total enterado
//
// Los montos se proponen desde el propio F29 del período (y desde las
// liquidaciones, para el impuesto único), pero cada línea es editable: lo que
// manda es lo efectivamente declarado.

const PAGOF29_DEFAULT={
  iva:'2104002',          // IMPUESTOS POR PAGAR
  ivaRetenido:'2103005',  // IVA retenido facturas de compra DTE 45/46
  ppm:'1108001',          // PAGOS PROVISIONALES MENSUALES (activo: anticipo de impuesto renta)
  honorarios:'2103002',   // RETENCIÓN 2º CATEGORÍA
  bte:'2103002',          // RETENCIÓN 2º CATEGORÍA
  iusc:'2104002',         // IMPUESTOS POR PAGAR (donde lo acredita el asiento de remuneraciones)
  multas:'3403001',       // OTROS GASTOS NO OPERACIONALES
  banco:'1101201',        // BANCO ESTADO
};
const PAGOF29={cuentas:{...PAGOF29_DEFAULT},montos:{},incluir:null,fecha:'',glosa:'',periodo:''};

// Conceptos que se enteran con el F29. `on` es el estado inicial del checkbox.
const CONCEPTOS_F29=[
  {k:'iva',lbl:'IVA determinado a pagar',cod:'89',on:true},
  {k:'ivaRetenido',lbl:'IVA retenido en facturas de compra (cambio de sujeto)',cod:'',on:false,
   nota:'El motor la acredita en <strong>IVA retenido / otros impuestos por pagar</strong> y la compensación F29 la salda por separado; su efecto ya está incluido en el IVA determinado. Actívala sólo si la llevas en una cuenta separada.'},
  {k:'ppm',lbl:'PPM Primera Categoría',cod:'62',on:true,
   nota:'Es un anticipo de impuesto a la renta, no un gasto. V2.13 selecciona automáticamente la cuenta de provisión si el PPM ya fue provisionado en la compensación; si no, lo reconoce directamente como activo al pagar.'},
  {k:'honorarios',lbl:'Retención boletas de honorarios recibidas',cod:'151',on:true},
  {k:'bte',lbl:'Retención boletas de servicios de terceros (BTE)',cod:'151',on:false,
   nota:'El sistema no registra BTE todavía: ingresa el monto a mano si emitiste boletas por cuenta de terceros.'},
  {k:'iusc',lbl:'Impuesto Único de Segunda Categoría (trabajadores)',cod:'48',on:true,
   nota:'Se obtiene del asiento de remuneraciones del período. El asiento lo acredita en <strong>Impuestos por Pagar</strong> y el pago del F29 salda ese pasivo.'},
  {k:'multas',lbl:'Multas, reajustes e intereses por pago fuera de plazo',cod:'',on:false,gasto:true,
   nota:'Va a resultado, no es un pasivo previo: sólo si pagas fuera de plazo.'},
];

// IVA retenido en facturas de compra (DTE 45/46) del período
function ivaRetenidoFacturasCompra(mes){
  const per=`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
  return Math.round(todosDocsCompras()
    .filter(d=>periodoContableCompra(d)===per)
    .reduce((s,d)=>{
      const tc=tributacionCompra(d);
      return s+(tc.facturaCompra?tc.ivaRetenido*((dteC(d.tipoDTE)?.signo)||1):0);
    },0));
}
// Montos sugeridos por concepto para un mes
function montosSugeridosF29(mes){
  const d=calcularF29Anual()[mes-1];
  const comp=calcularCompensacionIVA(mes);
  const periodo=periodoF29(mes),decl=declaracionF29(periodo),presentado=esF29Presentado(decl);
  const base={
    iva:presentado?codDecl(decl,89,comp.ivaAPagar):comp.ivaAPagar,
    ivaRetenido:presentado?codDecl(decl,39,ivaRetenidoFacturasCompra(mes)):ivaRetenidoFacturasCompra(mes),
    ppm:presentado?codDecl(decl,62,d.ppm):d.ppm,
    honorarios:presentado?codDecl(decl,151,d.retencionHon):d.retencionHon,
    bte:0,iusc:presentado?codDecl(decl,48,d.iusc):d.iusc,multas:0,
  };
  const ac=_pagosAcumuladosF29(periodo).componentes;
  // V2.14: un nuevo asiento propone sólo el saldo no pagado del período.
  const saldo={}; Object.keys(base).forEach(k=>saldo[k]=k==='multas'?base[k]:Math.max(0,Math.round((+base[k]||0)-(+ac[k]||0))));
  saldo._base=base; saldo._pagado=ac;
  return saldo;
}

// Saldo pendiente (acreedor) de una cuenta a la fecha de pago
function saldoPendiente(M,cd){
  const a=M[cd];
  if(!a)return 0;
  return -a.saldo;   // pasivo: saldo negativo (debe−haber) ⇒ pendiente positivo
}

function asientosPagoF29(periodo){
  return _asientosF29(periodo,'pagof29').slice().sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')));
}
function asientoPagoExistente(periodo){return asientosPagoF29(periodo)[0]||null;}

// Fecha legal de pago: día 12 del mes siguiente al período
function fechaPagoDefault(anio,mes){
  const y=mes===12?anio+1:anio, m=mes===12?1:mes+1;
  return `${y}-${String(m).padStart(2,'0')}-12`;
}

function setPagoF29Cuenta(k,cd){PAGOF29.cuentas[k]=cd;renderPagoF29();}
function setPagoF29Campo(k,v){PAGOF29[k]=v;renderPagoF29();}
function setPagoF29Monto(k,v){PAGOF29.montos[k]=Math.max(0,pn(v));renderPagoF29();}
function togglePagoF29(k,on){PAGOF29.incluir[k]=!!on;renderPagoF29();}
function resetPagoF29(){
  PAGOF29.cuentas={...PAGOF29_DEFAULT};PAGOF29.montos={};
  PAGOF29.incluir=Object.fromEntries(CONCEPTOS_F29.map(c=>[c.k,c.on]));
  renderPagoF29();
}
// Repone en una línea el monto sugerido por el sistema
function usarSugeridoF29(k){delete PAGOF29.montos[k];renderPagoF29();}

// Arma las líneas del asiento de pago
function calcularPagoF29(mes){
  const sug=montosSugeridosF29(mes);
  const anio=S.empresa.anio;
  const per=`${MESES[mes-1]} ${anio}`;
  const nm=cd=>pdcNm(cd)||cd;
  const movs=[];
  let total=0;
  CONCEPTOS_F29.forEach(c=>{
    if(!PAGOF29.incluir[c.k])return;
    const monto=PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:sug[c.k];
    if(!monto||monto<=0)return;
    const cd=PAGOF29.cuentas[c.k];
    movs.push({cd,nm:nm(cd),debe:Math.round(monto),haber:0,
      desc:`${c.lbl}${c.cod?` (F29 cód. ${c.cod})`:''} — ${per}`});
    total+=Math.round(monto);
  });
  if(total>0){
    const cb=PAGOF29.cuentas.banco;
    movs.push({cd:cb,nm:nm(cb),debe:0,haber:total,desc:`Pago F29 ${per}`});
  }
  const tD=movs.reduce((s,m)=>s+m.debe,0),tH=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,tD,tH,total,sug,cuadra:Math.abs(tD-tH)<1};
}

function renderPagoF29(){
  const el=document.getElementById('pagof29-content');if(!el)return;
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  if(!PAGOF29.incluir)PAGOF29.incluir=Object.fromEntries(CONCEPTOS_F29.map(c=>[c.k,c.on]));
  if(PAGOF29.periodo!==periodo){PAGOF29.periodo=periodo;PAGOF29.fecha='';PAGOF29.glosa='';PAGOF29.montos={};}

  const compActiva=asientoIVAExistente(periodo);
  const compDet=compActiva?_detalleComp(compActiva):{ppm:0};
  // Si el PPM ya fue provisionado en la compensación, el pago debe cancelar
  // el pasivo 2105006. Si no, se reconoce directamente como activo PPM al pagar.
  if(PAGOF29.montos.ppm==null)PAGOF29.cuentas.ppm=compDet.ppm>0?(IVAC.cuentas.ppmPasivo||'2105006'):(PAGOF29_DEFAULT.ppm||'1108001');
  const r=calcularPagoF29(mes);
  const pagosPrevios=asientosPagoF29(periodo), yaExiste=pagosPrevios[0]||null;
  const fecha=PAGOF29.fecha||fechaPagoDefault(anio,mes);
  const glosa=PAGOF29.glosa||`Pago F29 ${MESES[mes-1]} ${anio}`;
  // Saldos del mayor hasta la fecha de pago, como referencia de lo pendiente
  const M=buildMayor(undefined,fecha);
  // Cuentas usadas por más de un concepto activo: su saldo es compartido
  const usoCuenta={};
  CONCEPTOS_F29.forEach(c=>{if(PAGOF29.incluir[c.k]&&!c.gasto)usoCuenta[PAGOF29.cuentas[c.k]]=(usoCuenta[PAGOF29.cuentas[c.k]]||0)+1;});

  const filas=CONCEPTOS_F29.map(c=>{
    const on=!!PAGOF29.incluir[c.k];
    const monto=PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:r.sug[c.k];
    const editado=PAGOF29.montos[c.k]!=null&&PAGOF29.montos[c.k]!==r.sug[c.k];
    const cd=PAGOF29.cuentas[c.k];
    const pend=c.gasto?null:saldoPendiente(M,cd);
    const compartida=!c.gasto&&usoCuenta[cd]>1;
    return `<tr style="${on?'':'opacity:.45'}">
      <td style="text-align:center;width:26px"><input type="checkbox" ${on?'checked':''} onchange="togglePagoF29('${c.k}',this.checked)" style="width:auto"></td>
      <td class="tnm" style="font-size:12px">
        ${c.lbl}${c.cod?` <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">cód. ${c.cod}</span>`:''}
        ${c.nota?`<div style="font-size:10px;color:var(--mt);line-height:1.45;margin-top:2px">${c.nota}</div>`:''}
      </td>
      <td style="width:250px">${inputCuenta({id:'pf29-cd-'+c.k,value:cd||'',onPick:`setPagoF29Cuenta('${c.k}','%CD%')`,placeholder:'Cuenta…',clase:'linea-inp'})}</td>
      <td style="width:130px"><input type="number" class="money-input" value="${monto||0}" onchange="setPagoF29Monto('${c.k}',this.value)" style="text-align:right;font-family:var(--mono)"></td>
      <td style="width:150px;font-size:10px;color:var(--mt);text-align:right">
        ${editado?`<div><button class="btn btn-g" style="padding:1px 6px;font-size:9px" onclick="usarSugeridoF29('${c.k}')">↺ saldo ${fmtC(r.sug[c.k])}</button></div>`:''}
        ${!c.gasto?`<div>Pagado: ${fmtC(r.sug._pagado?.[c.k]||0)} · Saldo: ${fmtC(r.sug[c.k]||0)}</div>`:''}
        ${pend!==null?`<div title="Saldo acreedor de la cuenta al ${fecha}">Mayor: ${fmtC(pend)}${compartida?' <span style="color:var(--warn)" title="Otro concepto usa la misma cuenta: el saldo es compartido">⚠</span>':''}</div>`:'<div>—</div>'}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML=`<div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      <div>
        <div style="font-size:15px;font-weight:700">🏦 Asiento de pago del F29</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">Cancela los impuestos y retenciones del período ${MESES[mes-1]} ${anio} contra banco o caja</div>
      </div>
      ${pagosPrevios.length?`<span class="badge bi">💳 ${pagosPrevios.length} pago(s) registrado(s)</span>`:''}
    </div>

    <div class="info-tip" style="margin:10px 0 14px;font-size:11px;line-height:1.6">
      📘 En el F29 no se entera sólo el IVA: también las <strong>retenciones que la empresa practicó como agente retenedor</strong>
      durante el mes — boletas de honorarios recibidas (Art. 42 N°2), boletas de servicios de terceros, el Impuesto Único de
      Segunda Categoría de los trabajadores (Art. 74 N°1) y el IVA retenido en facturas de compra por cambio de sujeto.
      Todos son pasivos que ya se registraron al momento de la operación: este asiento sólo los <strong>cancela contra banco</strong>.
      Los montos se proponen desde el F29 del período, pero manda lo efectivamente declarado: edítalos si difieren.
    </div>

    <div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th style="width:26px"></th><th class="tl">CONCEPTO</th><th class="tl">CUENTA</th><th style="text-align:right">MONTO</th><th style="text-align:right">REFERENCIA</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td colspan="3" class="tl">TOTAL A ENTERAR</td>
        <td style="font-family:var(--mono);font-weight:700;color:${r.total>0?'var(--err)':'var(--mt)'}">${fmtC(r.total)}</td><td></td></tr></tfoot>
    </table></div></div>

    <div class="fg" style="margin-bottom:12px">
      <div class="grp"><label>Fecha de pago</label>
        <input type="date" value="${fecha}" onchange="setPagoF29Campo('fecha',this.value)">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Por defecto el día 12 del mes siguiente</div></div>
      <div class="grp"><label>Glosa</label>
        <input type="text" value="${glosa.replace(/"/g,'&quot;')}" onchange="setPagoF29Campo('glosa',this.value)"></div>
      <div class="grp"><label>Cuenta de pago (banco o caja)</label>
        ${inputCuenta({id:'pf29-cd-banco',value:PAGOF29.cuentas.banco||'',onPick:"setPagoF29Cuenta('banco','%CD%')",placeholder:'Buscar cuenta…',clase:'linea-inp'})}</div>
      <div class="grp" style="justify-content:flex-end">
        <button class="btn btn-g" style="font-size:11px" onclick="resetPagoF29()">↺ Cuentas y montos por defecto</button></div>
    </div>

    <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Previsualización del asiento</div>
    ${r.movs.length?`<div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th class="tl" style="width:82px">CÓD.</th><th class="tl">CUENTA</th><th style="width:130px">DEBE</th><th style="width:130px">HABER</th></tr></thead>
      <tbody>${r.movs.map(m=>`<tr>
        <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt)">${m.cd}</td>
        <td class="tnm" style="font-size:12px">${m.nm}<div style="font-size:10px;color:var(--mt)">${m.desc}</div></td>
        <td style="font-family:var(--mono)">${m.debe?fmtC(m.debe):'–'}</td>
        <td style="font-family:var(--mono)">${m.haber?fmtC(m.haber):'–'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="tl" colspan="2">TOTALES</td>
        <td style="font-family:var(--mono)">${fmtC(r.tD)}</td><td style="font-family:var(--mono)">${fmtC(r.tH)}</td></tr></tfoot>
    </table></div></div>
    <div style="font-size:12px;color:${r.cuadra?'var(--ach)':'var(--err)'};margin-bottom:12px">
      ${r.cuadra?'✅ Asiento cuadrado — Debe = Haber = '+fmtC(r.tD):'⚠️ Descuadre de '+fmtC(Math.abs(r.tD-r.tH))}
    </div>`
    :`<div style="text-align:center;padding:24px;color:var(--mt);font-size:12px">No hay montos que enterar en ${MESES[mes-1]} ${anio}. Marca al menos un concepto con monto mayor a cero.</div>`}

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-p" onclick="generarAsientoPagoF29()" ${(!r.movs.length||!r.cuadra)?'disabled style="opacity:.5;cursor:not-allowed"':''}>
        🏦 ${pagosPrevios.length?'Registrar otro pago':'Generar asiento de pago'}
      </button>
    </div>
  </div>`;
}

async function generarAsientoPagoF29(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de generar asientos de IVA/F29.','e');return;}
  const mes=+(document.getElementById('f29-mes')?.value||1);
  const anio=S.empresa.anio;
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  const r=calcularPagoF29(mes);
  if(!r.movs.length){toast('⚠️ No hay montos que enterar','e');return;}
  if(!r.cuadra){toast('⚠️ El asiento no cuadra — revisa las cuentas','e');return;}
  const faltantes=[...new Set(r.movs.filter(m=>!PDC.some(x=>x.cd===m.cd)).map(m=>m.cd))];
  if(faltantes.length){toast(`⚠️ Estas cuentas no existen en el plan: ${faltantes.join(', ')}`,'e');return;}

  const pagosPrevios=asientosPagoF29(periodo);
  const per=`${MESES[mes-1]} ${anio}`;
  const excedidos=CONCEPTOS_F29.filter(c=>!c.gasto&&PAGOF29.incluir[c.k]).map(c=>{
    const actual=Math.round(PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:(r.sug[c.k]||0));
    const saldo=Math.round(r.sug[c.k]||0); return {c,actual,saldo};
  }).filter(x=>x.actual>x.saldo);
  if(excedidos.length){toast(`⚠️ El pago excede el saldo pendiente en: ${excedidos.map(x=>x.c.lbl).join(', ')}.`,'e');return;}
  const detalle=r.movs.filter(m=>m.debe>0)
    .map(m=>`  ${m.cd} ${m.nm}: ${fmtC(m.debe)}`).join('\n');
  const msg=(pagosPrevios.length?`💳 Ya existen ${pagosPrevios.length} pago(s) para ${per}. Este asiento se registrará como pago parcial/adicional.\n\n`:'')
    +`Pago F29 — ${per}\n\n${detalle}\n\nMonto de este pago: ${fmtC(r.total)}\nContra: ${pdcNm(PAGOF29.cuentas.banco)||PAGOF29.cuentas.banco}\n\n¿Registrar el pago?`;
  if(!confirm(msg))return;

  const folio=proxFolioComprobante();
  const fecha=PAGOF29.fecha||fechaPagoDefault(anio,mes);
  const glosa=PAGOF29.glosa||`Pago F29 ${per}`;
  const pr=await persistirAsientosCritico(()=>{S.asientos.push({
    id:'as_pagof29_'+Date.now(),n:folio,folioComp:folio,fecha,glosa,
    movs:r.movs.map(m=>({...m})),
    origenAuto:'pagof29',periodoIVA:periodo,tipo:'tributario',
    f29Detalle:{version:14,periodo,pagoNro:pagosPrevios.length+1,componentes:Object.fromEntries(CONCEPTOS_F29.map(c=>[c.k,PAGOF29.incluir[c.k]?Math.round(PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:r.sug[c.k]||0):0])),cuentas:{...PAGOF29.cuentas},totalTributos:Math.round(CONCEPTOS_F29.filter(c=>!c.gasto&&PAGOF29.incluir[c.k]).reduce((t,c)=>t+(PAGOF29.montos[c.k]!=null?PAGOF29.montos[c.k]:r.sug[c.k]||0),0)),totalPagado:Math.round(r.total||0),declarado:esF29Presentado(declaracionF29(periodo))?{...(declaracionF29(periodo).declarado||{})}:null},
  });});
  if(!pr.ok){toast('❌ No se pudo guardar el pago F29. La operación NO se contabilizó.','e');return;}
  toast(`✅ Asiento N°${folio} — pago F29 ${per} · ${fmtC(r.total)}`);
  logAccion('Generó pago de F29',`${per} · asiento N°${folio} · ${fmtC(r.total)}`);
  PAGOF29.montos={}; PAGOF29.fecha=''; PAGOF29.glosa='';
  rerender();
  renderF29();
}

export {calcularF29Anual, conciliarF29Periodo, renderConciliacionF29, renderF29, renderPPM, cargarDeclaracionesF29, declaracionF29, diferenciasF29, F29DECL, setF29Declarado, setF29DeclCampo, setF29UTM, copiarCalculadoAF29, guardarBorradorF29, presentarF29, reabrirF29,
        IVAC, calcularCompensacionIVA, renderCompensacionIVA, generarAsientoIVA,
        setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente, asientoIVAExistente,
        PAGOF29, CONCEPTOS_F29, calcularPagoF29, montosSugeridosF29, renderPagoF29, generarAsientoPagoF29,
        setPagoF29Cuenta, setPagoF29Campo, setPagoF29Monto, togglePagoF29, resetPagoF29, usarSugeridoF29,
        ivaRetenidoFacturasCompra, asientoPagoExistente, asientosPagoF29};
