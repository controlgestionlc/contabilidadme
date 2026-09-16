import assert from 'node:assert/strict';
import {prepararImportacionProductos} from '../js/inventario-importador.js';

const hdr=['CÓDIGO','EAN','DESCRIPCIÓN','TIPO','UNIDAD','GRUPO','SUBGRUPO','STOCK MÍNIMO','CUENTA INVENTARIO','CUENTA COSTO/CONSUMO','AFECTO IVA','MANEJA LOTES','INVENTARIABLE','ACTIVO'];
const base={productos:[{id:'p1',codigo:'P001',ean:'111',descripcion:'ANTIGUO',tipo:'INSUMO',unidad:'UN',manejaLotes:false}],grupos:[{id:'g1',nombre:'INSUMOS',subgrupos:['GENERAL']}],cuentaExiste:c=>['1109001','3101002'].includes(c),productosConMovimientos:['p1']};

const filas=[hdr,
  ['P002','222','NUEVO PRODUCTO','MERCADERIA','KG','MATERIALES','QUÍMICOS','1.500','1109001','3101002','SÍ','SÍ','SÍ','SÍ'],
  ['P001','111','PRODUCTO ACTUALIZADO','INSUMO','UN','INSUMOS','GENERAL','0','1109001','3101002','NO','NO','SÍ','SÍ']
];
let r=prepararImportacionProductos(filas,{...base,actualizar:false});
assert.deepEqual(r.resumen,{nuevos:1,actualiza:0,omite:1,errores:0});
assert.equal(r.filas[0].producto.stockMinimo,1500);
assert.equal(r.filas[0].producto.tipo,'MERCADERÍA');
assert.equal(r.filas[0].producto.manejaLotes,true);
r=prepararImportacionProductos(filas,{...base,actualizar:true});
assert.deepEqual(r.resumen,{nuevos:1,actualiza:1,omite:0,errores:0});

const errores=prepararImportacionProductos([hdr,
  ['P003','222','EAN DUPLICADO','TIPO RARO','ZZ','','SUB','-1','999','3101002','QUIZÁS','NO','SÍ','SÍ'],
  ['P003','','REPETIDO','INSUMO','UN','','',0,'1109001','3101002','SÍ','NO','SÍ','SÍ']
],base);
assert.equal(errores.resumen.errores,2);
assert.match(errores.filas[0].errores.join(' '),/EAN|Tipo|Unidad|subgrupo|Stock|Cuenta|SÍ o NO/i);
assert.match(errores.filas[1].errores.join(' '),/repetido/i);

assert.throws(()=>prepararImportacionProductos([['OTRA','HOJA']],base),/CÓDIGO y DESCRIPCIÓN/i);
console.log('Importador de productos: OK');
