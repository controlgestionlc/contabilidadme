// rcv-control.js — V2.15.2 · normalización, huella y comparación idempotente RCV.
// Este módulo NO modifica libros. Sólo transforma datos para decidir si una
// reimportación es nueva, idéntica o contiene cambios provenientes del SII.

const n=v=>Number.isFinite(+v)?+v:0;
const s=v=>String(v??'').trim();
const txt=v=>s(v).replace(/\s+/g,' ');

function claveRCV(d){
  return `${s(d?.rutCodigo)}|${n(d?.tipoDTE)}|${s(d?.numero)}`;
}

function snapshotCompraRCV(d,periodo=''){
  return {
    fecha:s(d?.fechaOriginal||d?.fecha),
    fechaVencimiento:s(d?.fechaVencimiento),
    periodoContable:s(periodo||d?.periodoContable||(d?.fecha||'').slice(0,7)),
    tipoDTE:n(d?.tipoDTE), numero:s(d?.numero),
    rutCodigo:s(d?.rutCodigo), rutDV:s(d?.rutDV), razonSocial:txt(d?.razonSocial),
    neto:n(d?.neto), exento:n(d?.exento), iva:n(d?.iva),
    ivaRecuperable:d?.ivaRecuperable==null?null:n(d.ivaRecuperable),
    ivaNoRecuperable:d?.ivaNoRecuperable==null?null:n(d.ivaNoRecuperable),
    ivaUsoComun:d?.ivaUsoComun==null?null:n(d.ivaUsoComun),
    ivaActivoFijo:d?.ivaActivoFijo==null?null:n(d.ivaActivoFijo),
    ivaRetenido:d?.ivaRetenido==null?null:n(d.ivaRetenido),
    otrosImpuestos:n(d?.otrosImpuestos), total:n(d?.total),
  };
}

function snapshotVentaRCV(d){
  return {
    fecha:s(d?.fechaOriginal||d?.fecha),
    fechaVencimiento:s(d?.fechaVencimiento),
    tipoDTE:n(d?.tipoDTE), numero:s(d?.numero),
    rutCodigo:s(d?.rutCodigo), rutDV:s(d?.rutDV), razonSocial:txt(d?.razonSocial),
    neto:n(d?.neto), exento:n(d?.exento), iva:n(d?.iva),
    otrosImpuestos:n(d?.otrosImpuestos), total:n(d?.total),
  };
}

function fingerprintSnapshot(obj){
  // JSON con orden de propiedades estable porque los snapshots anteriores se
  // construyen en orden fijo. La huella es legible y no depende de WebCrypto.
  return JSON.stringify(obj);
}

const LABELS={
  fecha:'Fecha documento',fechaVencimiento:'Fecha vencimiento',periodoContable:'Período RCV',tipoDTE:'Tipo DTE',numero:'Folio',
  rutCodigo:'RUT',rutDV:'DV',razonSocial:'Razón social',neto:'Neto',exento:'Exento',iva:'IVA',
  ivaRecuperable:'IVA recuperable',ivaNoRecuperable:'IVA no recuperable',ivaUsoComun:'IVA uso común',
  ivaActivoFijo:'IVA activo fijo',ivaRetenido:'IVA retenido',otrosImpuestos:'Otros impuestos',total:'Total'
};

function compararSnapshots(entrada,guardado){
  const cambios=[];
  Object.keys(entrada).forEach(campo=>{
    const nuevo=entrada[campo], anterior=guardado?.[campo];
    if(JSON.stringify(nuevo)!==JSON.stringify(anterior)){
      cambios.push({campo,label:LABELS[campo]||campo,anterior,nuevo});
    }
  });
  return {igual:cambios.length===0,cambios,fingerprint:fingerprintSnapshot(entrada),snapshot:entrada};
}

function compararCompraRCV(entrada,guardado,periodo=''){
  const nuevo=snapshotCompraRCV(entrada,periodo);
  const anterior=snapshotCompraRCV(guardado,guardado?.periodoContable||'');
  return compararSnapshots(nuevo,anterior);
}
function compararVentaRCV(entrada,guardado){
  return compararSnapshots(snapshotVentaRCV(entrada),snapshotVentaRCV(guardado));
}

function valorCambio(v){
  if(v==null)return '—';
  if(typeof v==='number')return new Intl.NumberFormat('es-CL').format(v);
  return String(v)||'—';
}

export {claveRCV,snapshotCompraRCV,snapshotVentaRCV,fingerprintSnapshot,compararCompraRCV,compararVentaRCV,valorCambio};
