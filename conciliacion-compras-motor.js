// conciliacion-compras-motor.js — Reglas puras de conciliación entre
// recepciones de inventario (OC) y facturas del Libro de Compras (RCV).
// Sin DOM ni storage: sólo funciones de comparación/búsqueda, testeables con Node.

const norm=v=>String(v??'').trim().toUpperCase();
// El folio del documento puede venir con ceros a la izquierda en un lado y
// no en el otro (p.ej. la guía/factura física "000455" vs el folio "455" que
// trae el RCV o que tipea el usuario en Compras). Si es puramente numérico se
// comparan sin los ceros a la izquierda; si no, se compara tal cual.
const normNumero=v=>{const s=norm(v);return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s;};

// Coincidencia exacta: mismo tipo de DTE (33/34), mismo RUT y mismo N° de documento.
// a: {tipoDTE, proveedorRut|rutCodigo, documentoNumero|numero}
// b: idem
function mismoDocumento(a,b){
  if(!a||!b)return false;
  const tipoA=+((a.tipoDTE));
  const tipoB=+((b.tipoDTE));
  if(!tipoA||tipoA!==tipoB)return false;
  const rutA=norm(a.proveedorRut??a.rutCodigo);
  const rutB=norm(b.proveedorRut??b.rutCodigo);
  if(!rutA||rutA!==rutB)return false;
  const numA=normNumero(a.documentoNumero??a.numero);
  const numB=normNumero(b.documentoNumero??b.numero);
  if(!numA||numA!==numB)return false;
  return true;
}

// Busca en S.compras la factura (33/34) que corresponde a una recepción.
// Excluye compras anuladas. No excluye compras ya vinculadas a OTRA recepción:
// eso se resuelve aparte (una factura puede consolidar varias guías).
function buscarCompraParaRecepcion(rec,compras=[]){
  if(!rec||![33,34].includes(+rec.tipoDTE))return null;
  return compras.find(c=>c&&c.estado!=='anulado'&&mismoDocumento(rec,c))||null;
}

// Busca en las recepciones vigentes la que corresponde a una compra recién
// guardada/importada. Sólo recepciones tipo Factura (33/34), vigentes y que
// todavía no tengan una factura conciliada (compraId vacío): la conciliación
// automática es 1:1 por N° exacto.
function buscarRecepcionParaCompra(compra,recepciones=[]){
  if(!compra||![33,34].includes(+compra.tipoDTE))return null;
  return recepciones.find(r=>r&&r.estado==='VIGENTE'&&!r.compraId&&mismoDocumento(r,compra))||null;
}

// Otras recepciones vigentes (distintas de `rec`) que apuntan al mismo RUT +
// N° de documento, aunque el tipo de documento informado no coincida
// (p.ej. Factura Afecta vs Factura Exenta por error de tipeo). Sirve para
// advertir de un posible duplicado sin bloquear el guardado.
function otrasRecepcionesMismoDocumento(rec,recepciones=[]){
  if(!rec)return [];
  const rut=norm(rec.proveedorRut);
  const numero=normNumero(rec.documentoNumero);
  if(!rut||!numero)return [];
  return recepciones.filter(r=>r&&r.id!==rec.id&&r.estado==='VIGENTE'&&norm(r.proveedorRut)===rut&&normNumero(r.documentoNumero)===numero);
}

// Facturas (33/34) del mismo proveedor de la recepción, disponibles para
// vincular manualmente (usado por recepciones tipo GUÍA que llegan con una
// factura posterior, o por cualquier recepción que el match automático no
// haya resuelto). No excluye facturas ya vinculadas a otras recepciones:
// una factura puede consolidar varias guías del mismo proveedor.
function comprasVinculables(rec,compras=[]){
  if(!rec)return [];
  const rut=norm(rec.proveedorRut);
  if(!rut)return [];
  return compras
    .filter(c=>c&&c.estado!=='anulado'&&[33,34].includes(+c.tipoDTE)&&norm(c.rutCodigo)===rut)
    .sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
}

export {mismoDocumento,buscarCompraParaRecepcion,buscarRecepcionParaCompra,otrasRecepcionesMismoDocumento,comprasVinculables};
