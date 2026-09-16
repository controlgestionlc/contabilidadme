// inventario-oc-motor.js — Reglas puras para órdenes de compra y recepciones.

const n=v=>Number.isFinite(+v)?+v:0;
const r6=v=>Math.round((n(v)+Number.EPSILON)*1e6)/1e6;

function totalLineaOC(l){return r6(n(l.cantidad)*n(l.precioUnitario)*(1-n(l.descuentoPct)/100));}
function calcularTotalesOC(oc){
  let netoAfecto=0,netoExento=0;
  for(const l of (oc?.lineas||[])){const neto=totalLineaOC(l);if(l.aplicaIVA===false)netoExento+=neto;else netoAfecto+=neto;}
  netoAfecto=r6(netoAfecto);netoExento=r6(netoExento);const iva=r6(netoAfecto*n(oc?.tasaIVA??19)/100);
  return {netoAfecto,netoExento,neto:r6(netoAfecto+netoExento),iva,total:r6(netoAfecto+netoExento+iva)};
}

function cantidadesRecibidas(ocId,recepciones=[]){
  const map=new Map();
  for(const r of recepciones){if(!r||r.estado==='ANULADA'||String(r.ordenCompraId)!==String(ocId))continue;for(const l of (r.lineas||[]))map.set(String(l.ocLineaId),r6(n(map.get(String(l.ocLineaId)))+n(l.cantidad)));}
  return map;
}

function resumenRecepcionOC(oc,recepciones=[]){
  const recibidas=cantidadesRecibidas(oc?.id,recepciones);let pedida=0,recibida=0;const lineas=(oc?.lineas||[]).map(l=>{const cantidad=n(l.cantidad),rec=n(recibidas.get(String(l.id))),pendiente=r6(Math.max(0,cantidad-rec));pedida+=cantidad;recibida+=rec;return {...l,recibida:rec,pendiente};});
  return {lineas,pedida:r6(pedida),recibida:r6(recibida),pendiente:r6(Math.max(0,pedida-recibida)),avance:pedida?Math.min(100,r6(recibida/pedida*100)):0};
}

function validarOrdenCompra(oc,{productos=[],bodegas=[],proveedores=[]}={}){
  const errores=[],ps=new Map(productos.map(p=>[String(p.id),p]));
  if(!oc.fecha)errores.push('Indica la fecha de la orden');
  if(oc.fechaEntrega&&oc.fecha&&oc.fechaEntrega<oc.fecha)errores.push('La fecha esperada de entrega no puede ser anterior a la orden');
  if(!oc.proveedorRut||!oc.proveedorNombre)errores.push('Selecciona un proveedor');
  if(proveedores.length&&!proveedores.some(p=>String(p.rutCodigo||p.rut||'')===String(oc.proveedorRut)))errores.push('El proveedor ya no está disponible');
  if(!bodegas.some(b=>String(b.id)===String(oc.bodegaId)&&b.activo!==false))errores.push('Selecciona una bodega activa');
  const lineas=(oc.lineas||[]).filter(l=>l&&l.productoId&&n(l.cantidad)>0);
  if(!lineas.length)errores.push('Agrega al menos un producto con cantidad');
  const usados=new Set();
  for(const l of lineas){const p=ps.get(String(l.productoId));if(!p){errores.push('Hay un producto inexistente');continue;}if(p.activo===false||p.inventariable===false)errores.push(`${p.descripcion}: producto no disponible para inventario`);if(usados.has(String(l.productoId)))errores.push(`${p.descripcion}: producto repetido en la orden`);usados.add(String(l.productoId));if(n(l.cantidad)<=0)errores.push(`${p.descripcion}: cantidad inválida`);if(n(l.precioUnitario)<=0)errores.push(`${p.descripcion}: el precio unitario debe ser mayor que cero`);if(n(l.descuentoPct)<0||n(l.descuentoPct)>=100)errores.push(`${p.descripcion}: descuento fuera de rango`);}
  return {ok:errores.length===0,errores,lineas};
}

function validarRecepcion(recepcion,oc,{productos=[],recepciones=[]}={}){
  const errores=[];if(!oc)errores.push('La orden de compra no existe');if(!recepcion.fecha)errores.push('Indica la fecha de recepción');if(oc&&recepcion.fecha&&recepcion.fecha<oc.fecha)errores.push('La recepción no puede ser anterior a la orden');if(!recepcion.documentoNumero)errores.push('Indica el número de guía, factura o documento');
  const pendientes=new Map(resumenRecepcionOC(oc,recepciones).lineas.map(l=>[String(l.id),l])),ps=new Map(productos.map(p=>[String(p.id),p]));
  const lineas=(recepcion.lineas||[]).filter(l=>n(l.cantidad)>0);
  if(!lineas.length)errores.push('Ingresa al menos una cantidad recibida');
  const sumas=new Map();for(const l of lineas)sumas.set(String(l.ocLineaId),r6(n(sumas.get(String(l.ocLineaId)))+n(l.cantidad)));
  for(const [id,cantidad] of sumas){const base=pendientes.get(id);if(!base){errores.push('La recepción contiene una línea que no pertenece a la orden');continue;}const p=ps.get(String(base.productoId));if(cantidad>n(base.pendiente)+1e-6)errores.push(`${p?.descripcion||base.productoId}: recibido supera la cantidad pendiente`);}
  const lotesUsados=new Set();for(const l of lineas){const base=pendientes.get(String(l.ocLineaId)),p=base&&ps.get(String(base.productoId));if(n(l.cantidad)<=0)errores.push(`${p?.descripcion||'Producto'}: cantidad inválida`);if(p?.manejaLotes&&!String(l.lote||'').trim())errores.push(`${p.descripcion}: indica lote`);if(p?.manejaLotes&&!l.fechaVencimiento)errores.push(`${p.descripcion}: indica vencimiento`);if(p?.manejaLotes&&String(l.lote||'').trim()){const k=`${l.ocLineaId}|${String(l.lote).trim().toUpperCase()}`;if(lotesUsados.has(k))errores.push(`${p.descripcion}: lote repetido en la recepción`);lotesUsados.add(k);}}
  return {ok:errores.length===0,errores,lineas};
}

function estadoSegunRecepciones(oc,recepciones=[]){
  if(['BORRADOR','ANULADA','CERRADA_PARCIAL'].includes(oc.estado))return oc.estado;
  const r=resumenRecepcionOC(oc,recepciones);if(r.recibida<=1e-6)return 'EMITIDA';if(r.pendiente<=1e-6)return 'RECIBIDA';return 'PARCIAL';
}

export {totalLineaOC,calcularTotalesOC,cantidadesRecibidas,resumenRecepcionOC,validarOrdenCompra,validarRecepcion,estadoSegunRecepciones};
