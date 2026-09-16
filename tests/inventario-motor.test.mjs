import assert from 'node:assert/strict';
import {recalcularInventario,validarMovimiento} from '../js/inventario-motor.js';

const productos=[
  {id:'p1',descripcion:'Producto normal',activo:true,inventariable:true,manejaLotes:false},
  {id:'p2',descripcion:'Producto con lote',activo:true,inventariable:true,manejaLotes:true}
];
const bodegas=[{id:'b1',activo:true},{id:'b2',activo:true}];
const movs=[
  {id:'m1',folio:'ENT-1',tipo:'ENTRADA',fecha:'2026-01-01',estado:'VIGENTE',bodegaDestinoId:'b1',lineas:[{productoId:'p1',cantidad:10,costoUnitario:100},{productoId:'p2',cantidad:20,costoUnitario:50,lote:'L1',fechaVencimiento:'2027-01-01'}]},
  {id:'m2',folio:'ENT-2',tipo:'ENTRADA',fecha:'2026-01-02',estado:'VIGENTE',bodegaDestinoId:'b1',lineas:[{productoId:'p1',cantidad:10,costoUnitario:200}]},
  {id:'m3',folio:'SAL-1',tipo:'SALIDA',fecha:'2026-01-03',estado:'VIGENTE',bodegaOrigenId:'b1',lineas:[{productoId:'p1',cantidad:5}]},
  {id:'m4',folio:'TRS-1',tipo:'TRASPASO',fecha:'2026-01-04',estado:'VIGENTE',bodegaOrigenId:'b1',bodegaDestinoId:'b2',lineas:[{productoId:'p2',cantidad:6,lote:'L1',fechaVencimiento:'2027-01-01'}]},
  {id:'m5',folio:'SAL-X',tipo:'SALIDA',fecha:'2026-01-05',estado:'ANULADO',bodegaOrigenId:'b1',lineas:[{productoId:'p1',cantidad:99}]}
];

const r=recalcularInventario(movs,productos);
const s=(p,b)=>r.stock.find(x=>x.productoId===p&&x.bodegaId===b);
const l=(p,b,n)=>r.lotes.find(x=>x.productoId===p&&x.bodegaId===b&&x.lote===n);
assert.equal(s('p1','b1').cantidad,15);
assert.equal(s('p1','b1').costoPromedio,150);
assert.equal(s('p1','b1').valor,2250);
assert.equal(l('p2','b1','L1').cantidad,14);
assert.equal(l('p2','b2','L1').cantidad,6);
assert.equal(s('p2','b1').cantidad,14);
assert.equal(s('p2','b2').cantidad,6);
assert.equal(s('p2','b2').costoPromedio,50);
assert.equal(r.errores.length,0);

const valido=validarMovimiento({tipo:'SALIDA',fecha:'2026-01-06',bodegaOrigenId:'b1',lineas:[{productoId:'p2',cantidad:5,lote:'L1'}]},{productos,bodegas,movimientos:movs});
assert.equal(valido.ok,true);
const invalido=validarMovimiento({tipo:'SALIDA',fecha:'2026-01-06',bodegaOrigenId:'b1',lineas:[{productoId:'p2',cantidad:99,lote:'L1'}]},{productos,bodegas,movimientos:movs});
assert.equal(invalido.ok,false);
assert.match(invalido.errores.join(' '),/insuficiente/i);
const duplicado=validarMovimiento({tipo:'SALIDA',fecha:'2026-01-06',bodegaOrigenId:'b1',lineas:[
  {productoId:'p2',cantidad:8,lote:'L1'},{productoId:'p2',cantidad:8,lote:'L1'}
]},{productos,bodegas,movimientos:movs});
assert.equal(duplicado.ok,false);
assert.match(duplicado.errores.join(' '),/lote L1/i);
const venceDistinto=validarMovimiento({tipo:'ENTRADA',fecha:'2026-01-06',bodegaDestinoId:'b1',lineas:[
  {productoId:'p2',cantidad:1,costoUnitario:55,lote:'L1',fechaVencimiento:'2028-01-01'}
]},{productos,bodegas,movimientos:movs});
assert.equal(venceDistinto.ok,false);
assert.match(venceDistinto.errores.join(' '),/ya existe con vencimiento/i);

const negativo=recalcularInventario([...movs,{id:'m6',folio:'SAL-2',tipo:'SALIDA',fecha:'2026-01-06',estado:'VIGENTE',bodegaOrigenId:'b1',lineas:[{productoId:'p1',cantidad:30}]}],productos);
assert.equal(negativo.stock.find(x=>x.productoId==='p1'&&x.bodegaId==='b1').cantidad,-15);
assert.ok(negativo.errores.some(x=>x.tipo==='STOCK_NEGATIVO'));

console.log('Inventario motor: OK');
