// motor-contable.js — Núcleo V2 de reglas contables y tributarias.
// Los módulos de documentos describen el hecho económico; este archivo decide
// qué movimientos contables corresponden. Reportes sólo consume el resultado.

import {pdcNm, dteV, dteC} from './core.js';

const n=v=>Number(v)||0;
const mov=(cd,debe,haber,extra={})=>({cd,nm:pdcNm(cd),debe:n(debe),haber:n(haber),...extra});

// V2.11.1 — fecha tributaria del documento y periodo contable son conceptos distintos.
// En compras importadas desde el RCV, `fecha` conserva siempre la fecha original del DTE.
// `periodoContable` determina el mes en que el documento se reconoce contablemente y en F29.
// `fechaContabilizacion` es la fecha del asiento dentro de ese periodo; por defecto, el último
// día del mes para documentos cuya fecha documental pertenece a otro periodo.
function periodoContableCompra(d){
  const pc=String(d?.periodoContable||'').trim();
  if(/^\d{4}-\d{2}$/.test(pc))return pc;
  return String(d?.fecha||'').slice(0,7);
}
function ultimoDiaPeriodo(periodo){
  if(!/^\d{4}-\d{2}$/.test(String(periodo||'')))return '';
  const [y,m]=periodo.split('-').map(Number);
  const dia=new Date(y,m,0).getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
function fechaContabilizacionCompra(d){
  const per=periodoContableCompra(d);
  const fc=String(d?.fechaContabilizacion||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(fc)&&fc.slice(0,7)===per)return fc;
  const fd=String(d?.fecha||'').trim();
  if(fd.slice(0,7)===per)return fd;
  return ultimoDiaPeriodo(per)||fd;
}

function cuadratura(movs){
  const debe=movs.reduce((s,m)=>s+n(m.debe),0);
  const haber=movs.reduce((s,m)=>s+n(m.haber),0);
  return {debe,haber,diferencia:Math.round((debe-haber)*100)/100,ok:Math.abs(debe-haber)<=1};
}

function asientoVenta(d){
  const signo=(dteV(d.tipoDTE)?.signo)||1;
  const dteInfo=dteV(d.tipoDTE);
  const nombreDoc=dteInfo?.nm||('DTE '+d.tipoDTE);
  const glosa=`${nombreDoc} N°${d.numero} — ${d.razonSocial||'cliente'}`;
  const movs=[];
  const total=n(d.total)*signo, neto=n(d.neto)*signo, exento=n(d.exento)*signo;
  const otros=n(d.otrosImpuestos)*signo, iva=n(d.iva)*signo;
  const ingreso=neto+exento+otros;
  const cuentaDeb=d.formaPago==='banco'?'1101201':d.formaPago==='deudores'?'1107003':'1104001';
  const aux={desc:`${d.razonSocial||''} · ${nombreDoc} N°${d.numero}`.trim(),rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE,docId:d.id};
  if(total){
    if(total>0)movs.push(mov(cuentaDeb,total,0,cuentaDeb==='1104001'?aux:{docId:d.id}));
    else movs.push(mov(cuentaDeb,0,-total,cuentaDeb==='1104001'?aux:{docId:d.id}));
  }
  const cuentaIng=d.cuentaIngreso||(dteInfo?dteInfo.cuenta:'4101002');
  if(ingreso){ if(ingreso>0)movs.push(mov(cuentaIng,0,ingreso,{docId:d.id})); else movs.push(mov(cuentaIng,-ingreso,0,{docId:d.id})); }
  if(iva){ if(iva>0)movs.push(mov('2103003',0,iva,{docId:d.id})); else movs.push(mov('2103003',-iva,0,{docId:d.id})); }
  return {fecha:d.fecha,glosa,movs,fuente:'ventas',docId:d.id,tipoDTE:d.tipoDTE,folio:d.numero,rutCodigo:d.rutCodigo,cuadre:cuadratura(movs)};
}

// Normaliza la semántica tributaria de DTE 45/46 (factura de compra).
// Regla V2.6: la contabilidad NO depende de cómo venga informado `total` en el
// RCV o en un registro histórico. Se parte del hecho económico:
//   totalDocumento = base económica + IVA
//   totalProveedor = totalDocumento - IVA retenido
// Para DTE 45/46 la retención es, por defecto, el IVA completo, pero un registro
// puede informar `ivaRetenido` explícitamente para soportar casos parciales.
function tributacionCompra(d){
  const tipo=+d.tipoDTE;
  // Una NC (61) que revierte una factura de compra trae `ivaRetenido`
  // explícito desde el RCV. Debe revertir también la retención, no tratarse
  // como una NC de proveedor corriente.
  const facturaCompra=tipo===45||tipo===46||(tipo===61&&n(d.ivaRetenido)>0);
  const base=n(d.neto)+n(d.exento)+n(d.otrosImpuestos);
  const iva=n(d.iva);
  if(!facturaCompra){
    return {facturaCompra:false,ivaRetenido:0,base,totalDocumento:n(d.total),totalProveedor:n(d.total),totalInformado:n(d.total),diferenciaTotal:0};
  }
  const ivaRetenido=Math.max(0,Math.min(Math.abs(iva),Math.abs(n(d.ivaRetenido!=null?d.ivaRetenido:iva))));
  const totalDocumento=base+iva;
  const totalProveedor=totalDocumento-ivaRetenido;
  const totalInformado=n(d.total);
  const coincideDocumento=Math.abs(totalInformado-totalDocumento)<=1;
  const coincideProveedor=Math.abs(totalInformado-totalProveedor)<=1;
  const totalIncluyeRetencion=d.totalIncluyeRetencion!=null?!!d.totalIncluyeRetencion:(coincideDocumento&&!coincideProveedor);
  return {
    facturaCompra:true,ivaRetenido,base,totalDocumento,totalProveedor,totalInformado,
    totalIncluyeRetencion,
    diferenciaTotal:Math.min(Math.abs(totalInformado-totalDocumento),Math.abs(totalInformado-totalProveedor)),
    totalInterpretado:coincideProveedor?'proveedor':coincideDocumento?'documento':'no_coincide'
  };
}



// V2.8 — Otros impuestos de compras dejan de ser un monto opaco.
// Un documento puede informar detalle por impuesto. Para compatibilidad, si
// sólo existe `otrosImpuestos`, se interpreta como impuesto no recuperable que
// forma parte del costo. Tratamientos soportados:
//   costo        -> se incorpora al costo/gasto/activo distribuido
//   recuperable  -> activo tributario 1108006 OTROS IMPUESTOS POR RECUPERAR
// La suma de los detalles siempre se normaliza contra `otrosImpuestos`.
function clasificacionOtrosImpuestosCompra(d){
  const total=Math.max(0,Math.abs(n(d.otrosImpuestos)));
  let det=Array.isArray(d.otrosImpuestosDetalle)?d.otrosImpuestosDetalle.filter(x=>x&&n(x.monto)>0).map(x=>({
    tipo:String(x.tipo||'otro'),
    nombre:String(x.nombre||'Otro impuesto'),
    monto:Math.abs(n(x.monto)),
    tratamiento:x.tratamiento==='recuperable'?'recuperable':'costo',
    codigoF29:String(x.codigoF29||''),
  })):[];
  if(!det.length&&total>0)det=[{tipo:'otro',nombre:'Otros impuestos',monto:total,tratamiento:d.tratamientoOtrosImpuestos==='recuperable'?'recuperable':'costo',codigoF29:''}];
  const suma=det.reduce((a,x)=>a+x.monto,0);
  if(total>0&&suma>0&&Math.abs(suma-total)>1){
    const factor=total/suma;let acum=0;
    det=det.map((x,i)=>{const monto=i===det.length-1?total-acum:Math.round(x.monto*factor);acum+=monto;return {...x,monto};});
  }
  const efectivo=total||det.reduce((a,x)=>a+x.monto,0);
  const recuperable=det.filter(x=>x.tratamiento==='recuperable').reduce((a,x)=>a+x.monto,0);
  const costo=efectivo-recuperable;
  return {total:efectivo,recuperable,costo,detalle:det};
}

// Clasificación V2.7 del IVA de compras. `iva` sigue siendo el IVA total del
// documento; esta función determina cuánto puede usarse como crédito fiscal y
// cuánto debe incorporarse al costo/gasto. `ivaActivoFijo` es una etiqueta
// contable del crédito recuperable asociado a activo fijo, no un IVA adicional.
function clasificacionIVACompra(d){
  const total=Math.abs(n(d.iva));
  if(!total)return {total:0,recuperable:0,noRecuperable:0,activoFijo:0,usoComun:0,porcentajeRecuperable:100};

  const tieneExplicito=d.ivaRecuperable!=null||d.ivaNoRecuperable!=null;
  let recuperable=0,noRecuperable=0;
  const usoComun=Math.max(0,Math.min(total,Math.abs(n(d.ivaUsoComun))));
  let porcentaje=d.porcentajeIvaRecuperable!=null?n(d.porcentajeIvaRecuperable):
    (d.factorProporcionalidad!=null?n(d.factorProporcionalidad):100);
  porcentaje=Math.max(0,Math.min(100,porcentaje));

  if(tieneExplicito){
    const recExp=Math.max(0,Math.abs(n(d.ivaRecuperable)));
    const noExp=Math.max(0,Math.abs(n(d.ivaNoRecuperable)));
    if(d.ivaRecuperable!=null&&d.ivaNoRecuperable!=null){
      const suma=recExp+noExp;
      if(suma>0){
        // El RCV puede traer redondeos de $1: normalizamos al total del DTE.
        recuperable=Math.round(total*(recExp/suma));
        noRecuperable=total-recuperable;
      }else noRecuperable=total;
    }else if(d.ivaRecuperable!=null){
      recuperable=Math.min(total,recExp);noRecuperable=total-recuperable;
    }else{
      noRecuperable=Math.min(total,noExp);recuperable=total-noRecuperable;
    }
  }else if(usoComun>0){
    const recUso=Math.round(usoComun*(porcentaje/100));
    recuperable=(total-usoComun)+recUso;
    noRecuperable=total-recuperable;
  }else if(d.tratamientoIVA==='no_recuperable'){
    recuperable=0;noRecuperable=total;porcentaje=0;
  }else if(d.tratamientoIVA==='proporcional'){
    recuperable=Math.round(total*(porcentaje/100));noRecuperable=total-recuperable;
  }else{
    recuperable=total;noRecuperable=0;porcentaje=100;
  }

  let activoFijo=Math.max(0,Math.min(recuperable,Math.abs(n(d.ivaActivoFijo))));
  if(d.tratamientoIVA==='activo_fijo'&&!activoFijo)activoFijo=recuperable;
  return {total,recuperable,noRecuperable,activoFijo,usoComun,porcentajeRecuperable:porcentaje};
}

function asientoCompra(d){
  const signo=(dteC(d.tipoDTE)?.signo)||1;
  const dteInfo=dteC(d.tipoDTE);
  const nombreDoc=dteInfo?.nm||('DTE '+d.tipoDTE);
  const glosa=`${nombreDoc} N°${d.numero} — ${d.razonSocial||'proveedor'}`;
  const movs=[];
  const dist=(d.dist||[]).filter(l=>l&&l.cuenta&&n(l.monto));
  const sumDist=dist.reduce((s,l)=>s+n(l.monto),0);
  const baseEsperada=n(d.neto)+n(d.exento);
  // Compatibilidad: documentos antiguos distribuían sólo el neto. El exento
  // faltante se lleva a la primera cuenta para que el asiento cuadre, sin
  // inventar una cuenta nueva. Los documentos V2 deben distribuir Neto+Exento.
  const faltanteBase=Math.abs(sumDist-n(d.neto))<=1 ? n(d.exento) : Math.max(0,baseEsperada-sumDist);
  const otrosClas=clasificacionOtrosImpuestosCompra(d);
  const otros=otrosClas.costo;
  const ivaClas=clasificacionIVACompra(d);
  // El IVA no recuperable forma parte del costo del bien/servicio. Se distribuye
  // proporcionalmente entre las mismas cuentas/CC de la base económica.
  const bases=dist.map((l,idx)=>Math.max(0,n(l.monto)+(idx===0?faltanteBase+otros:0)));
  const totalBases=bases.reduce((a,b)=>a+b,0);
  let noRecAsignado=0;
  dist.forEach((l,idx)=>{
    let monto=bases[idx];
    if(ivaClas.noRecuperable){
      const extraNoRec=idx===dist.length-1?ivaClas.noRecuperable-noRecAsignado:
        Math.round(ivaClas.noRecuperable*(totalBases?monto/totalBases:(idx===0?1:0)));
      monto+=extraNoRec;noRecAsignado+=extraNoRec;
    }
    monto*=signo;
    if(!monto)return;
    const extra={docId:d.id}; if(l.cc)extra.desc=`CC: ${l.cc}`; if(l.cc)extra.cc=l.cc;
    if(l.tratamientoTributario==='rechazado'){extra.tributario='gasto_rechazado';extra.motivoTributario=l.motivoTributario||'Marcado como gasto rechazado en documento de compra';}
    if(monto>0)movs.push(mov(l.cuenta,monto,0,extra)); else movs.push(mov(l.cuenta,0,-monto,extra));
  });
  const ivaAF=ivaClas.activoFijo*signo;
  const ivaGeneral=(ivaClas.recuperable-ivaClas.activoFijo)*signo;
  if(ivaGeneral){ if(ivaGeneral>0)movs.push(mov('1108002',ivaGeneral,0,{docId:d.id,tributo:'iva_credito'})); else movs.push(mov('1108002',0,-ivaGeneral,{docId:d.id,tributo:'iva_credito'})); }
  if(ivaAF){ if(ivaAF>0)movs.push(mov('1108008',ivaAF,0,{docId:d.id,tributo:'iva_credito_activo_fijo'})); else movs.push(mov('1108008',0,-ivaAF,{docId:d.id,tributo:'iva_credito_activo_fijo'})); }
  const otrosRec=otrosClas.recuperable*signo;
  if(otrosRec){ if(otrosRec>0)movs.push(mov('1108006',otrosRec,0,{docId:d.id,tributo:'impuesto_adicional_recuperable'})); else movs.push(mov('1108006',0,-otrosRec,{docId:d.id,tributo:'impuesto_adicional_recuperable'})); }

  const trib=tributacionCompra(d);
  const prov=trib.totalProveedor*signo;
  const aux={desc:`${d.razonSocial||''} · ${nombreDoc} N°${d.numero}`.trim(),rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE,docId:d.id};
  if(prov){ if(prov>0)movs.push(mov('2102001',0,prov,aux)); else movs.push(mov('2102001',-prov,0,aux)); }
  if(trib.facturaCompra&&trib.ivaRetenido){
    const ret=trib.ivaRetenido*signo;
    if(ret>0)movs.push(mov('2103005',0,ret,{desc:'IVA retenido factura de compra',docId:d.id,tributo:'iva_retenido'}));
    else movs.push(mov('2103005',-ret,0,{desc:'IVA retenido factura de compra',docId:d.id,tributo:'iva_retenido'}));
  }
  return {fecha:fechaContabilizacionCompra(d),glosa,movs,fuente:'compras',docId:d.id,tipoDTE:d.tipoDTE,folio:d.numero,rutCodigo:d.rutCodigo,tributacion:trib,ivaClasificacion:ivaClas,otrosImpuestosClasificacion:otrosClas,cuadre:cuadratura(movs)};
}



function rutPartes(rut){
  const limpio=String(rut||'').replace(/[^0-9kK]/g,'').toUpperCase();
  if(limpio.length<2)return {rutCodigo:'',rutDV:''};
  return {rutCodigo:limpio.slice(0,-1),rutDV:limpio.slice(-1)};
}

// Honorarios V2: reconocimiento y pago son hechos económicos distintos.
function asientoHonorario(h,anio){
  const bruto=n(h.bruto);
  const sinRet=h.tipoRetencion==='sin_retencion';
  const tasa=sinRet?0:n(h.tasaRetencion!=null?h.tasaRetencion:h.retencionTasa);
  const ret=sinRet?0:n(h.retencion!=null?h.retencion:Math.round(bruto*tasa));
  const liquido=bruto-ret;
  const rp=rutPartes(h.rut);
  const fecha=h.fecha||`${anio}-${String(h.mes||1).padStart(2,'0')}-28`;
  const aux={rutCodigo:rp.rutCodigo,rutDV:rp.rutDV,docId:h.id,folio:h.numero||h.folio||'',tipoAux:'honorario',desc:h.nombre||'Honorario'};
  const movs=[];
  if(bruto)movs.push(mov(h.cuentaGasto||'3202019',bruto,0,{...aux,cc:h.cc||undefined}));
  if(ret)movs.push(mov('2103002',0,ret,{docId:h.id,tributo:'retencion_honorarios'}));
  if(liquido)movs.push(mov('2102006',0,liquido,aux));
  return {fecha,glosa:`Boleta de honorarios${h.numero?' N°'+h.numero:''} — ${h.nombre||'prestador'}`,movs,fuente:'honorarios',docId:h.id,rutCodigo:rp.rutCodigo,retencion:ret,liquido,cuadre:cuadratura(movs)};
}

function asientoPagoHonorario(h,anio){
  const rec=asientoHonorario(h,anio);
  const cuenta=h.cuentaPago||'1101201';
  const liquido=rec.liquido;
  const rp=rutPartes(h.rut);
  const aux={rutCodigo:rp.rutCodigo,rutDV:rp.rutDV,docId:h.id,folio:h.numero||h.folio||'',tipoAux:'honorario',desc:h.nombre||'Honorario'};
  const movs=[];
  if(liquido){
    movs.push(mov('2102006',liquido,0,aux));
    movs.push(mov(cuenta,0,liquido,{docId:h.id,desc:`Pago honorario ${h.nombre||''}`.trim()}));
  }
  return {fecha:h.fechaPago||rec.fecha,glosa:`Pago boleta de honorarios${h.numero?' N°'+h.numero:''} — ${h.nombre||'prestador'}`,movs,fuente:'honorarios',docId:h.id,cuentaPago:cuenta,cuadre:cuadratura(movs)};
}

// Pagos V2: el asiento es el maestro. Para datos históricos se puede mantener
// `doc.pagos` como fallback desde los módulos consumidores.
function pagosDesdeAsientos(asientos,docId,tipo){
  const out=[];
  (asientos||[]).filter(a=>!a.anulado&&a.tipo==='pago').forEach(a=>{
    const refs=Array.isArray(a.documentos)?a.documentos:[];
    refs.filter(r=>r&&r.docId===docId&&(!tipo||r.tipo===tipo)).forEach(r=>out.push({
      id:`${a.id}:${docId}`,asientoId:a.id,fecha:a.fecha,monto:n(r.monto),cuentaPago:a.cuentaPago||'',glosa:a.glosa||''
    }));
    if(!refs.length){
      (a.movs||[]).filter(m=>m.docId===docId).forEach(m=>{
        const monto=tipo==='proveedor'?n(m.debe):n(m.haber);
        if(monto)out.push({id:`${a.id}:${docId}`,asientoId:a.id,fecha:a.fecha,monto,cuentaPago:a.cuentaPago||'',glosa:a.glosa||''});
      });
    }
  });
  return out;
}

function pagosDocumento(doc,tipo,asientos){
  const actuales=pagosDesdeAsientos(asientos,doc.id,tipo);
  return actuales.length?actuales:(doc.pagos||[]); // compatibilidad histórica
}

export {asientoVenta,asientoCompra,asientoHonorario,asientoPagoHonorario,tributacionCompra,clasificacionIVACompra,clasificacionOtrosImpuestosCompra,periodoContableCompra,fechaContabilizacionCompra,cuadratura,pagosDesdeAsientos,pagosDocumento};
