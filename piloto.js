// piloto.js — V2.15.8 · Certificación mensual del piloto contra referencias externas.
import {S,AUTH} from './state.js';
import {periodoContableCompra,clasificacionIVACompra} from './motor-contable.js';
import {calcularF29Anual} from './tributario.js';
import {logAccion} from './firebase.js';

const PILOTO={periodos:{}};
const k=()=>`piloto-${S.empresa.anio}`;
const CAMPOS={
  ventasDocs:'RCV Ventas · N° documentos',
  ventasNeto:'RCV Ventas · Neto',
  ventasExento:'RCV Ventas · Exento',
  ventasIVA:'RCV Ventas · IVA',
  ventasTotal:'RCV Ventas · Total',
  comprasDocs:'RCV Compras · N° documentos',
  comprasNeto:'RCV Compras · Neto',
  comprasExento:'RCV Compras · Exento',
  comprasIVA:'RCV Compras · IVA crédito recuperable',
  comprasTotal:'RCV Compras · Total documento',
  f29_538:'F29 cód. 538 · Débitos',
  f29_537:'F29 cód. 537 · Créditos',
  f29_77:'F29 cód. 77 · Remanente',
  f29_89:'F29 cód. 89 · IVA a pagar',
  f29_91:'F29 cód. 91 · Total a pagar'
};
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function signoDTE(tipo){return (+tipo===61)?-1:1;}
function periodoValido(p){return /^\d{4}-\d{2}$/.test(String(p||''));}
async function cargarPiloto(){
  PILOTO.periodos={};
  try{const r=await window.storage.get(k());if(r?.value){const x=JSON.parse(r.value);if(x&&typeof x==='object')PILOTO.periodos=x.periodos||{};}}catch(e){console.warn('Piloto:',e);}
  return PILOTO;
}
async function persistir(){
  const r=await window.storage.set(k(),JSON.stringify({version:1,periodos:PILOTO.periodos,actualizadoEn:new Date().toISOString()}));
  if(r?.ok===false)throw new Error(r.motivo||'No se pudo persistir certificación piloto');
}
function calculadoPeriodo(periodo){
  if(!periodoValido(periodo))return null;
  const vs=(S.ventas||[]).filter(d=>d.estado!=='anulado'&&String(d.fecha||'').slice(0,7)===periodo);
  const cs=(S.compras||[]).filter(d=>d.estado!=='anulado'&&periodoContableCompra(d)===periodo);
  const ventas=vs.reduce((a,d)=>{const s=signoDTE(d.tipoDTE);a.neto+=n(d.neto)*s;a.exento+=n(d.exento)*s;a.iva+=n(d.iva)*s;a.total+=n(d.total)*s;return a;},{neto:0,exento:0,iva:0,total:0});
  const compras=cs.reduce((a,d)=>{const s=signoDTE(d.tipoDTE);a.neto+=n(d.neto)*s;a.exento+=n(d.exento)*s;a.iva+=n(clasificacionIVACompra(d).recuperable)*s;a.total+=n(d.total)*s;return a;},{neto:0,exento:0,iva:0,total:0});
  const mes=+periodo.slice(5,7);
  const f29=calcularF29Anual().find(x=>x.m===mes)?.codigos||{};
  return {
    ventasDocs:vs.length,ventasNeto:ventas.neto,ventasExento:ventas.exento,ventasIVA:ventas.iva,ventasTotal:ventas.total,
    comprasDocs:cs.length,comprasNeto:compras.neto,comprasExento:compras.exento,comprasIVA:compras.iva,comprasTotal:compras.total,
    f29_538:n(f29[538]),f29_537:n(f29[537]),f29_77:n(f29[77]),f29_89:n(f29[89]),f29_91:n(f29[91])
  };
}
function referenciaPeriodo(periodo){return PILOTO.periodos[periodo]?.referencia||{};}
function compararPeriodo(periodo){
  const calc=calculadoPeriodo(periodo)||{};
  const ref=referenciaPeriodo(periodo);
  const filas=[];
  for(const [id,nombre] of Object.entries(CAMPOS)){
    const tiene=ref[id]!==undefined&&ref[id]!==null&&String(ref[id])!=='';
    const esperado=tiene?n(ref[id]):null;
    const actual=n(calc[id]);
    const dif=tiene?actual-esperado:null;
    const ok=!tiene||Math.abs(dif)<=0.5;
    filas.push({id,nombre,tiene,esperado,actual,diferencia:dif,ok});
  }
  const informados=filas.filter(x=>x.tiene);
  const minimos=['ventasDocs','ventasTotal','comprasDocs','comprasTotal','f29_538','f29_537'];
  const minimosOk=minimos.every(id=>filas.find(x=>x.id===id)?.tiene);
  const ok=minimosOk&&informados.length>=6&&informados.every(x=>x.ok);
  return {periodo,ok,minimosOk,informados:informados.length,filas,calculado:calc,referencia:ref};
}
async function guardarReferenciaPiloto(periodo,referencia){
  if(!periodoValido(periodo))throw new Error('Período inválido');
  if(AUTH.user?.rol!=='admin'&&AUTH.user?.rol!=='contador')throw new Error('Sin permiso');
  const anterior=PILOTO.periodos[periodo]||{};
  PILOTO.periodos[periodo]={...anterior,referencia:{...referencia},certificado:false,certificadoEn:null,certificadoPor:null,actualizadoEn:new Date().toISOString(),actualizadoPor:AUTH.user?.email||''};
  await persistir();
  try{await logAccion('piloto_referencia',{entidad:'piloto',id:periodo,periodo,estadoAnterior:anterior.referencia||{},estadoNuevo:referencia,empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  return compararPeriodo(periodo);
}
async function certificarPiloto(periodo){
  if(AUTH.user?.rol!=='admin')return {ok:false,motivo:'solo-admin'};
  const c=compararPeriodo(periodo);
  if(!c.ok)return {ok:false,motivo:'diferencias',comparacion:c};
  const anterior=PILOTO.periodos[periodo]||{};
  PILOTO.periodos[periodo]={...anterior,certificado:true,certificadoEn:new Date().toISOString(),certificadoPor:AUTH.user?.email||'',snapshot:{calculado:c.calculado,referencia:c.referencia}};
  await persistir();
  try{await logAccion('piloto_certificado',{entidad:'piloto',id:periodo,periodo,estadoNuevo:{certificado:true,calculado:c.calculado,referencia:c.referencia},empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  return {ok:true,periodo};
}
async function invalidarPiloto(periodo,motivo){
  if(AUTH.user?.rol!=='admin')return {ok:false,motivo:'solo-admin'};
  if(!motivo||motivo.trim().length<10)return {ok:false,motivo:'motivo-corto'};
  const x=PILOTO.periodos[periodo];if(!x)return {ok:false,motivo:'sin-registro'};
  const anterior={certificado:x.certificado,certificadoEn:x.certificadoEn,certificadoPor:x.certificadoPor};
  x.certificado=false;x.invalidadoEn=new Date().toISOString();x.invalidadoPor=AUTH.user?.email||'';x.motivoInvalidacion=motivo.trim();
  await persistir();
  try{await logAccion('piloto_invalidado',{entidad:'piloto',id:periodo,periodo,estadoAnterior:anterior,estadoNuevo:{certificado:false},motivo:motivo.trim(),empresa:window.storage?.getPrefijo?.()||''});}catch(e){}
  return {ok:true};
}
function estadoPiloto(){
  const certificados=Object.entries(PILOTO.periodos).filter(([,x])=>x?.certificado).map(([periodo,x])=>({periodo,...x})).sort((a,b)=>a.periodo.localeCompare(b.periodo));
  return {periodos:PILOTO.periodos,certificados,ok:certificados.length>0,ultimo:certificados.at(-1)||null};
}
export {PILOTO,CAMPOS,cargarPiloto,calculadoPeriodo,compararPeriodo,guardarReferenciaPiloto,certificarPiloto,invalidarPiloto,estadoPiloto};
