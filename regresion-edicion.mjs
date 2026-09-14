import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const S={empresa:{anio:2026},asientos:[],compras:[],ventas:[],cierresContables:[]};
let bloquear=false,liberar;
const window={storage:{
  setMany:async()=>bloquear?new Promise(r=>{liberar=()=>r({ok:true});}):({ok:true}),
  set:async()=>({ok:true})
}};
const ctx=vm.createContext({console,window,confirm:()=>true,Date,setTimeout});
const modulo=async code=>{const m=new vm.SourceTextModule(code,{context:ctx});await m.link(()=>{});await m.evaluate();return m;};
ctx.S_REF=S;
const state2=await modulo(`export const S=globalThis.S_REF; export const AUTH={user:{activo:true,rol:'admin'}};`);
const firebase=await modulo(`export const logAccion=()=>{}; export const logCambio=()=>{};`);
const core=await modulo(`export const pdcNm=x=>x; export const dteV=x=>({signo:+x===61?-1:1,nm:'DTE',cuenta:'4101002'}); export const dteC=x=>({signo:[56,61].includes(+x)?-1:1,nm:'DTE'});`);
const pdc=await modulo(`export const validarMovimientosPDC=()=>({ok:true,errores:[]}); export const reglaCuenta=()=>({});`);
const corr=await modulo(`export const asegurarNumerosContables=async()=>({ok:true});`);
const val=await modulo(`export const validarAsientoCentral=()=>({ok:true}); export const validarMutacionAsientos=()=>({ok:true,errores:[],cambiados:[]}); export const leerAsientosPersistidosLocal=()=>[];`);
const auth=await modulo(`export const puedeEditar=()=>true;`);
const empresas=await modulo(`export const empresaActiva=()=>({}); export const puedeVerEmpresa=()=>true;`);
const motorSrc=fs.readFileSync(new URL('../js/motor-contable.js',import.meta.url),'utf8');
const motor=new vm.SourceTextModule(motorSrc,{context:ctx});
await motor.link(s=>{if(s==='./core.js')return core;if(s==='./pdc-reglas.js')return pdc;throw new Error(s);});await motor.evaluate();
const orqSrc=fs.readFileSync(new URL('../js/contabilidad-v2.js',import.meta.url),'utf8');
const orq=new vm.SourceTextModule(orqSrc,{context:ctx});
await orq.link(s=>({
  './state.js':state2,'./firebase.js':firebase,'./motor-contable.js':motor,'./pdc-reglas.js':pdc,
  './core.js':core,'./correlativo-contable.js':corr,'./asiento-validacion.js':val,
  './auth.js':auth,'./empresas.js':empresas
}[s]||Promise.reject(new Error(s))));
await orq.evaluate();
const {guardarDocumentoContabilizado}=orq.namespace;
const base={id:'c1',fecha:'2026-01-12',tipoDTE:33,numero:'62717',rutCodigo:'76516434',neto:48740,exento:0,iva:9261,otrosImpuestos:0,total:58000,dist:[{cuenta:'1109001',monto:48740}]};

let r=await guardarDocumentoContabilizado('compras',base,S.compras,false);
assert.equal(r.ok,true);assert.equal(S.compras.length,1);assert.equal(S.asientos.length,1);
const asientoId=S.asientos[0].id;
r=await guardarDocumentoContabilizado('compras',{...base,razonSocial:'Proveedor corregido'},S.compras,true);
assert.equal(r.ok,true);assert.equal(S.compras.length,1);assert.equal(S.asientos.length,1);
assert.equal(S.asientos[0].id,asientoId);assert.match(S.asientos[0].glosa,/Proveedor corregido/);

bloquear=true;
const p1=guardarDocumentoContabilizado('compras',{...base,razonSocial:'Edición única'},S.compras,true);
await new Promise(r=>setTimeout(r,0));
const p2=await guardarDocumentoContabilizado('compras',{...base,razonSocial:'Doble clic'},S.compras,true);
assert.equal(p2.ok,false);assert.equal(p2.motivo,'guardado-en-curso');
liberar();assert.equal((await p1).ok,true);bloquear=false;
assert.equal(S.compras.length,1);assert.equal(S.asientos.filter(a=>!a.anulado).length,1);

S.compras[0].excluidoAuto=true;
S.asientos=[{id:'manual-antiguo',tipo:'manual',fecha:base.fecha,movs:[{cd:'1109001',debe:58000,haber:0},{cd:'2102001',debe:0,haber:58000}],referenciaDoc:{fuente:'compras',docId:'c1'}}];
r=await guardarDocumentoContabilizado('compras',{...base},S.compras,true);
assert.equal(r.ok,true);
assert.equal(S.asientos.filter(a=>!a.anulado).length,1);
assert.equal(S.asientos.find(a=>!a.anulado).tipo,'documento');
assert.equal(S.asientos.find(a=>a.id==='manual-antiguo').anulado,true);
console.log('OK: edición conserva un asiento, bloquea doble clic y recupera conversiones antiguas');
