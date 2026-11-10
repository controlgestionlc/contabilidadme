// rcv-control.js — V2.15.2 · normalización, huella y comparación idempotente RCV.
// Este módulo NO modifica libros. Sólo transforma datos para decidir si una
// reimportación es nueva, idéntica o contiene cambios provenientes del SII.

const n=v=>Number.isFinite(+v)?+v:0;
const s=v=>String(v??'').trim();
const txt=v=>s(v).replace(/\s+/g,' ');

// V2.22.27 · Clave única de un documento tributario: RUT emisor/receptor + tipo
// + folio, normalizados (sin puntos, espacios ni ceros a la izquierda), para que
// "000518778" y "518778", o "07.123.456" y "7123456", sean el mismo documento.
const rutClave=v=>String(v??'').replace(/[^0-9kK]/g,'').toUpperCase().replace(/^0+/,'');
const folioClave=v=>String(v??'').toUpperCase().replace(/\s+/g,'').replace(/^0+/,'')||'0';
function claveRCV(d){
  return `${rutClave(d?.rutCodigo)}|${n(d?.tipoDTE)}|${folioClave(d?.numero)}`;
}
// Documento vigente (no anulado) con la misma clave que `doc`, distinto de él.
function documentoDuplicado(doc,lista,{incluirAnulados=false}={}){
  const k=claveRCV(doc);
  return (lista||[]).find(x=>x&&x!==doc&&x.id!==doc?.id&&(incluirAnulados||x.estado!=='anulado')&&claveRCV(x)===k)||null;
}
function textoDuplicado(dup,fuente){
  const corr=typeof dup?.corrMes==='number'?` · correlativo ${String(dup.corrMes).padStart(3,'0')}`:'';
  return `Documento duplicado: DTE ${dup?.tipoDTE} N°${dup?.numero} de ${dup?.razonSocial||dup?.rutCodigo||''} ya está registrado en ${fuente==='ventas'?'Ventas':'Compras'} (${dup?.fecha||''}${corr}). No se registró de nuevo.`;
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

export {documentoDuplicado,textoDuplicado,claveRCV,snapshotCompraRCV,snapshotVentaRCV,fingerprintSnapshot,compararCompraRCV,compararVentaRCV,valorCambio};
