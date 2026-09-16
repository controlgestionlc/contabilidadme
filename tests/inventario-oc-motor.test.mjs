import assert from 'node:assert/strict';
import {calcularTotalesOC,resumenRecepcionOC,validarOrdenCompra,validarRecepcion,estadoSegunRecepciones} from '../js/inventario-oc-motor.js';
import {recalcularInventario} from '../js/inventario-motor.js';

const productos=[{id:'p1',descripcion:'Afecto',activo:true,inventariable:true,aplicaIVA:true,manejaLotes:false},{id:'p2',descripcion:'Con lote',activo:true,inventariable:true,aplicaIVA:false,manejaLotes:true}];
const bodegas=[{id:'b1',activo:true}],proveedores=[{rutCodigo:'76543210',razonSocial:'Proveedor'}];
const oc={id:'oc1',fecha:'2026-09-16',proveedorRut:'76543210',proveedorNombre:'Proveedor',bodegaId:'b1',estado:'EMITIDA',tasaIVA:19,lineas:[
  {id:'l1',productoId:'p1',cantidad:10,precioUnitario:1000,descuentoPct:10,aplicaIVA:true},
  {id:'l2',productoId:'p2',cantidad:5,precioUnitario:500,descuentoPct:0,aplicaIVA:false}
]};
assert.deepEqual(calcularTotalesOC(oc),{netoAfecto:9000,netoExento:2500,neto:11500,iva:1710,total:13210});
assert.equal(validarOrdenCompra(oc,{productos,bodegas,proveedores}).ok,true);
const sinPrecio=validarOrdenCompra({...oc,lineas:[{...oc.lineas[0],precioUnitario:0}]},{productos,bodegas,proveedores});
assert.equal(sinPrecio.ok,false);assert.match(sinPrecio.errores.join(' '),/precio/i);

const rec1={id:'r1',ordenCompraId:'oc1',estado:'VIGENTE',lineas:[{ocLineaId:'l1',cantidad:4},{ocLineaId:'l2',cantidad:2}]};
let rr=resumenRecepcionOC(oc,[rec1]);
assert.equal(rr.recibida,6);assert.equal(rr.pendiente,9);assert.equal(estadoSegunRecepciones(oc,[rec1]),'PARCIAL');
const recepcion={fecha:'2026-09-17',documentoNumero:'G-1',lineas:[{ocLineaId:'l1',cantidad:6},{ocLineaId:'l2',cantidad:3,lote:'L1',fechaVencimiento:'2027-09-01'}]};
assert.equal(validarRecepcion(recepcion,oc,{productos,recepciones:[rec1]}).ok,true);
const rec2={id:'r2',ordenCompraId:'oc1',estado:'VIGENTE',lineas:recepcion.lineas};
assert.equal(estadoSegunRecepciones(oc,[rec1,rec2]),'RECIBIDA');

const exceso=validarRecepcion({fecha:'2026-09-17',documentoNumero:'G-2',lineas:[{ocLineaId:'l1',cantidad:7}]},oc,{productos,recepciones:[rec1]});
assert.equal(exceso.ok,false);assert.match(exceso.errores.join(' '),/supera/i);
const sinLote=validarRecepcion({fecha:'2026-09-17',documentoNumero:'G-3',lineas:[{ocLineaId:'l2',cantidad:1}]},oc,{productos,recepciones:[rec1]});
assert.equal(sinLote.ok,false);assert.match(sinLote.errores.join(' '),/lote|vencimiento/i);
const variosLotes=validarRecepcion({fecha:'2026-09-17',documentoNumero:'G-4',lineas:[
  {ocLineaId:'l2',cantidad:1,lote:'L2',fechaVencimiento:'2027-09-01'},
  {ocLineaId:'l2',cantidad:2,lote:'L3',fechaVencimiento:'2027-10-01'}
]},oc,{productos,recepciones:[rec1]});
assert.equal(variosLotes.ok,true);
const loteDuplicado=validarRecepcion({fecha:'2026-09-17',documentoNumero:'G-5',lineas:[
  {ocLineaId:'l2',cantidad:1,lote:'L2',fechaVencimiento:'2027-09-01'},
  {ocLineaId:'l2',cantidad:1,lote:'L2',fechaVencimiento:'2027-09-01'}
]},oc,{productos,recepciones:[rec1]});
assert.equal(loteDuplicado.ok,false);assert.match(loteDuplicado.errores.join(' '),/repetido/i);
const fechaMala=validarRecepcion({...recepcion,fecha:'2026-09-15'},oc,{productos,recepciones:[rec1]});
assert.equal(fechaMala.ok,false);assert.match(fechaMala.errores.join(' '),/anterior/i);
assert.equal(resumenRecepcionOC(oc,[rec1,{...rec1,id:'rX',estado:'ANULADA'}]).recibida,6);

// Dos recepciones parciales deben reconstruir exactamente el stock pedido y
// valorizarlo al precio neto después del descuento de la OC.
const movsRecepcion=[
  {id:'m1',folio:'ENT-R1',tipo:'ENTRADA',fecha:'2026-09-17',estado:'VIGENTE',bodegaDestinoId:'b1',lineas:[{productoId:'p1',cantidad:4,costoUnitario:900},{productoId:'p2',cantidad:2,costoUnitario:500,lote:'L1',fechaVencimiento:'2027-09-01'}]},
  {id:'m2',folio:'ENT-R2',tipo:'ENTRADA',fecha:'2026-09-18',estado:'VIGENTE',bodegaDestinoId:'b1',lineas:[{productoId:'p1',cantidad:6,costoUnitario:900},{productoId:'p2',cantidad:3,costoUnitario:500,lote:'L1',fechaVencimiento:'2027-09-01'}]}
];
const stock=recalcularInventario(movsRecepcion,productos);
assert.equal(stock.stock.find(x=>x.productoId==='p1').cantidad,10);
assert.equal(stock.stock.find(x=>x.productoId==='p1').costoPromedio,900);
assert.equal(stock.lotes.find(x=>x.productoId==='p2'&&x.lote==='L1').cantidad,5);
console.log('Órdenes de compra: OK');
