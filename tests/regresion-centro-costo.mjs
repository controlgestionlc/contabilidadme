// Centro de costo al capturar: nunca en activo, siempre en gasto, en el resto sólo con flag.
// Uso: node --experimental-vm-modules tests/regresion-centro-costo.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const PDC=[
  {cd:'1201001',nm:'MAQUINARIA',tp:'A'},
  {cd:'1201007',nm:'OBRAS EN CURSO',tp:'A',aceptaCentroCosto:true,requiereCentroCosto:true},
  {cd:'3202010',nm:'COMBUSTIBLE',tp:'C'},
  {cd:'4101001',nm:'VENTAS',tp:'I'},
  {cd:'4101009',nm:'VENTAS PREDIO',tp:'I',requiereCentroCosto:true},
];
const ctx=vm.createContext({});
const src=fs.readFileSync(new URL('../js/pdc-reglas.js',import.meta.url),'utf8');
const estado=new vm.SyntheticModule(['PDC'],function(){this.setExport('PDC',PDC);},{context:ctx});
await estado.link(()=>{});await estado.evaluate();
const m=new vm.SourceTextModule(src,{context:ctx});
await m.link(()=>estado);await m.evaluate();
const {exigeCentroCosto,lineasSinCentroCosto,reglaCuenta,validarMovimientoPDC}=m.namespace;

assert.equal(exigeCentroCosto(reglaCuenta('1201001')),false,'activo sin flag');
assert.equal(exigeCentroCosto(reglaCuenta('1201007')),false,'activo con flag');
assert.equal(exigeCentroCosto(reglaCuenta('3202010')),true,'gasto');
assert.equal(exigeCentroCosto(reglaCuenta('4101001')),false,'ingreso sin flag');
assert.equal(exigeCentroCosto(reglaCuenta('4101009')),true,'ingreso con flag');
assert.equal(lineasSinCentroCosto([{cuenta:'1201001'},{cuenta:'3202010',cc:'P1'}]).length,0);
assert.equal(lineasSinCentroCosto([{cuenta:'3202010'}]).length,1);
assert.equal(validarMovimientoPDC({cd:'1201007',debe:1,haber:0}).length,0,'el asiento no exige centro en activo');
console.log('ok centro de costo');
