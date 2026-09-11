// motor-contable.js — Núcleo V2 de reglas contables y tributarias.
// Los módulos de documentos describen el hecho económico; este archivo decide
// qué movimientos contables corresponden. Reportes sólo consume el resultado.

import {pdcNm, dteV, dteC} from './core.js';

const n=v=>Number(v)||0;
const mov=(cd,debe,haber,extra={})=>({cd,nm:pdcNm(cd),debe:n(debe),haber:n(haber),...extra});

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

// Determina la semántica de DTE 45/46 sin depender de una interpretación única
// de `total`. Los registros nuevos pueden explicitar totalIncluyeRetencion.
function tributacionCompra(d){
  const tipo=+d.tipoDTE;
  const facturaCompra=tipo===45||tipo===46;
  const iva=n(d.iva);
  if(!facturaCompra)return {facturaCompra:false,ivaRetenido:0,totalProveedor:n(d.total)};
  let incluye=d.totalIncluyeRetencion;
  if(incluye==null){
    const base=n(d.neto)+n(d.exento)+n(d.otrosImpuestos);
    const conIva=Math.abs(n(d.total)-(base+iva));
    const sinIva=Math.abs(n(d.total)-base);
    incluye=conIva<=sinIva;
  }
  const ivaRetenido=n(d.ivaRetenido||iva);
  return {facturaCompra:true,ivaRetenido,totalProveedor:incluye?n(d.total)-ivaRetenido:n(d.total),totalIncluyeRetencion:incluye};
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
  const otros=n(d.otrosImpuestos);
  dist.forEach((l,idx)=>{
    let monto=n(l.monto);
    if(idx===0)monto+=faltanteBase+otros;
    monto*=signo;
    if(!monto)return;
    const extra={docId:d.id}; if(l.cc)extra.desc=`CC: ${l.cc}`; if(l.cc)extra.cc=l.cc;
    if(monto>0)movs.push(mov(l.cuenta,monto,0,extra)); else movs.push(mov(l.cuenta,0,-monto,extra));
  });
  const iva=n(d.iva)*signo;
  if(iva){ if(iva>0)movs.push(mov('1108002',iva,0,{docId:d.id})); else movs.push(mov('1108002',0,-iva,{docId:d.id})); }

  const trib=tributacionCompra(d);
  const prov=trib.totalProveedor*signo;
  const aux={desc:`${d.razonSocial||''} · ${nombreDoc} N°${d.numero}`.trim(),rutCodigo:d.rutCodigo,rutDV:d.rutDV,folio:d.numero,tipoDTE:d.tipoDTE,docId:d.id};
  if(prov){ if(prov>0)movs.push(mov('2102001',0,prov,aux)); else movs.push(mov('2102001',-prov,0,aux)); }
  if(trib.facturaCompra&&trib.ivaRetenido){
    const ret=trib.ivaRetenido*signo;
    if(ret>0)movs.push(mov('2103003',0,ret,{desc:'IVA retenido factura de compra',docId:d.id,tributo:'iva_retenido'}));
    else movs.push(mov('2103003',-ret,0,{desc:'IVA retenido factura de compra',docId:d.id,tributo:'iva_retenido'}));
  }
  return {fecha:d.fecha,glosa,movs,fuente:'compras',docId:d.id,tipoDTE:d.tipoDTE,folio:d.numero,rutCodigo:d.rutCodigo,tributacion:trib,cuadre:cuadratura(movs)};
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

export {asientoVenta,asientoCompra,tributacionCompra,cuadratura,pagosDesdeAsientos,pagosDocumento};
