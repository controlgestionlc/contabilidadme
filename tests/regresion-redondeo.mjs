import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx=vm.createContext({console});
const core=new vm.SourceTextModule(`
  export const pdcNm=x=>x;
  export const dteV=x=>({signo:+x===61?-1:1,nm:'DTE',cuenta:'4101002'});
  export const dteC=x=>({signo:[56,61].includes(+x)?-1:1,nm:'DTE'});
`,{context:ctx});
await core.link(()=>{});await core.evaluate();
const src=fs.readFileSync(new URL('../js/motor-contable.js',import.meta.url),'utf8');
const motor=new vm.SourceTextModule(src,{context:ctx});
await motor.link(s=>{if(s==='./core.js')return core;throw new Error(s);});
await motor.evaluate();
const {asientoCompra,asientoVenta}=motor.namespace;

function exigirCuadre(nombre,a,total){
  const debe=a.movs.reduce((s,m)=>s+m.debe,0);
  const haber=a.movs.reduce((s,m)=>s+m.haber,0);
  assert.equal(debe,haber,`${nombre}: Debe/Haber`);
  assert.equal(debe,total,`${nombre}: total comprobante`);
  assert.equal(a.cuadre.ok,true,`${nombre}: validación central`);
}

const compra=asientoCompra({id:'c1',fecha:'2026-01-12',tipoDTE:33,numero:'62717',rutCodigo:'76516434',neto:48740,exento:0,iva:9261,otrosImpuestos:0,total:58000,dist:[{cuenta:'1109001',monto:48740}]});
exigirCuadre('RCV con redondeo de $1',compra,58000);
assert.equal(compra.movs.find(m=>m.cd==='1108002').debe,9261);
assert.equal(compra.movs.find(m=>m.cd==='1109001').debe,48739);

const nota=asientoCompra({id:'c2',fecha:'2026-02-06',tipoDTE:61,numero:'249',rutCodigo:'19001550',neto:50000000,exento:0,iva:9500000,otrosImpuestos:0,total:50000000,ivaRetenido:9500000,referencia:{tipoDTE:46},totalIncluyeRetencion:false,dist:[{cuenta:'1109001',monto:50000000}]});
exigirCuadre('NC referida a factura de compra',nota,59500000);

const venta=asientoVenta({id:'v1',fecha:'2026-01-12',tipoDTE:33,numero:'1',rutCodigo:'1',neto:48740,exento:0,iva:9261,otrosImpuestos:0,total:58000});
exigirCuadre('RVE con redondeo de $1',venta,58000);

console.log('OK: 3 regresiones contables verificadas');
