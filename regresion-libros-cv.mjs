import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const S={empresa:{anio:2026,nombre:'Empresa Prueba',rut:'76.684.700-3'},compras:[
  {id:'c1',fecha:'2026-01-31',periodoContable:'2026-02',corrMes:2,tipoDTE:33,numero:'100',rutCodigo:'11111111',rutDV:'1',razonSocial:'Proveedor A',neto:1000,iva:190,total:1190,dist:[]},
  {id:'c2',fecha:'2026-02-05',periodoContable:'2026-02',corrMes:1,tipoDTE:61,numero:'8',rutCodigo:'22222222',rutDV:'2',razonSocial:'Proveedor B',neto:100,iva:19,total:119,referencia:{tipoDTE:33,folio:'90',fecha:'2026-01-20'},dist:[]},
  {id:'c3',fecha:'2026-01-10',periodoContable:'2026-01',corrMes:1,tipoDTE:33,numero:'9',rutCodigo:'33333333',rutDV:'3',razonSocial:'Fuera período',neto:500,iva:95,total:595,dist:[]}
],ventas:[
  {id:'v2',fecha:'2026-02-08',tipoDTE:33,numero:'20',rutCodigo:'44444444',rutDV:'4',razonSocial:'Cliente B',neto:2000,iva:380,total:2380},
  {id:'v1',fecha:'2026-02-01',tipoDTE:34,numero:'1',rutCodigo:'55555555',rutDV:'5',razonSocial:'Cliente A',exento:300,total:300}
]};
const ctx=vm.createContext({console,Date,setTimeout});ctx.S_REF=S;
const modulo=async code=>{const m=new vm.SourceTextModule(code,{context:ctx});await m.link(()=>{});await m.evaluate();return m;};
const state=await modulo(`export const S=globalThis.S_REF;`);
const core=await modulo(`
 export const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 export const fmtC=x=>String(x); export const rutFmt=(c,d)=>c+'-'+d;
 const m={33:{nm:'Factura Electrónica',signo:1},34:{nm:'Factura Exenta Electrónica',signo:1},61:{nm:'Nota de Crédito',signo:-1}};
 export const dteC=x=>m[+x]||null; export const dteV=x=>m[+x]||null;
`);
const asientos=await modulo(`export const todosDocsCompras=()=>globalThis.S_REF.compras; export const todosDocsVentas=()=>globalThis.S_REF.ventas;`);
const motor=await modulo(`export const periodoContableCompra=d=>d.periodoContable||String(d.fecha||'').slice(0,7);`);
const helpers=await modulo(`export const foliosMensuales=docs=>Object.fromEntries([...docs].sort((a,b)=>a.fecha.localeCompare(b.fecha)).map((d,i)=>[d.id,i+1]));`);
const src=fs.readFileSync(new URL('../js/libroscv.js',import.meta.url),'utf8');
const mod=new vm.SourceTextModule(src,{context:ctx});
await mod.link(s=>({'./state.js':state,'./core.js':core,'./asientos.js':asientos,'./motor-contable.js':motor,'./helpers.js':helpers}[s]));
await mod.evaluate();
const {construirLibroCV,encabezadosDetalle,encabezadosCSV}=mod.namespace;

const compras=construirLibroCV('compras','2');
assert.equal(compras.docs.length,2,'compras usa período contable, no sólo fecha de emisión');
assert.deepEqual(Array.from(compras.resumen,x=>x.tipoDTE),[33,61],'separa y ordena por tipo DTE');
assert.equal(compras.docs.find(d=>d.id==='c1').corr,2,'conserva correlativo mensual interno');
assert.equal(compras.resumen.find(g=>g.tipoDTE===61).efectoTotal,-119,'NC conserva efecto tributario negativo');
assert.equal(compras.validacion.ok,true);
assert.ok(Array.from(encabezadosDetalle('compras')).includes('Cód IVA No Recuperable'));
assert.deepEqual(Array.from(encabezadosCSV('compras')).slice(0,6),['Nro','Tipo Doc','Tipo Compra','RUT Proveedor','Razon Social','Folio']);
assert.equal(Array.from(encabezadosCSV('compras')).at(-1),'Numero Interno');

const ventas=construirLibroCV('ventas','2');
assert.equal(ventas.docs.length,2);
assert.equal(ventas.docs.find(d=>d.id==='v1').corr,1,'ventas asigna correlativo cronológico mensual');
assert.deepEqual(Array.from(ventas.resumen,x=>x.tipoDTE),[33,34]);
assert.equal(ventas.validacion.ok,true);
const caja={innerHTML:''};ctx.document={getElementById:id=>id==='libroscv-content'?caja:null};ctx.window={};
mod.namespace.LCV.tipo='compras';mod.namespace.LCV.mes='2';mod.namespace.renderLibrosCV();
assert.match(caja.innerHTML,/Resumen por tipo de documento/);
assert.match(caja.innerHTML,/DTE 33/);
assert.match(caja.innerHTML,/Excel/);
assert.match(caja.innerHTML,/Imprimir \/ PDF/);
console.log('OK: libros mensuales, períodos, correlativos, DTE y notas de crédito verificados');
