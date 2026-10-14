// correlativo-contable.js — V2.15.3
// Número contable definitivo, único por empresa/año y no reutilizable.
import {S} from './state.js';

const n=v=>Math.max(0,Math.trunc(+v||0));

function diagnosticoNumeracion(){
  const usados=new Map(), faltantes=[];
  for(const a of (S.asientos||[])){
    const num=n(a.numeroContable);
    if(!num){faltantes.push(a);continue;}
    if(!usados.has(num))usados.set(num,[]);
    usados.get(num).push(a);
  }
  const duplicados=[...usados.entries()].filter(([,arr])=>arr.length>1)
    .map(([numero,arr])=>({numero,ids:arr.map(x=>x.id),glosas:arr.map(x=>x.glosa||'')}));
  return {ok:!faltantes.length&&!duplicados.length,total:(S.asientos||[]).length,
    numerados:(S.asientos||[]).length-faltantes.length,faltantes:faltantes.map(x=>x.id),duplicados,
    maximo:Math.max(0,...usados.keys())};
}

// Todo asiento que aún no tenga número definitivo recibe un correlativo de la
// secuencia atómica. No se adopta `n`/`folioComp` como número nuevo: esos campos
// históricos se calculaban localmente y dos equipos podían haber elegido el
// mismo valor. Así la primera migración también sanea ese riesgo.
async function asegurarNumerosContables(){
  if(!Array.isArray(S.asientos)||!S.asientos.length)return {ok:true,asignados:0,nuevos:0};
  const usados=new Set((S.asientos||[]).map(a=>n(a.numeroContable)).filter(Boolean));
  const pendientes=S.asientos.filter(a=>!n(a.numeroContable))
    .sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||''))||String(a.creadoEn||'').localeCompare(String(b.creadoEn||''))||String(a.id||'').localeCompare(String(b.id||'')));
  if(!pendientes.length)return {ok:true,asignados:0,nuevos:0};
  const maximo=Math.max(0,...usados);
  if(!window.storage?.reservarCorrelativos)return {ok:false,motivo:'reservador-no-disponible'};
  const r=await window.storage.reservarCorrelativos(`asientos-${S.empresa.anio}`,pendientes.length,maximo);
  if(!r?.ok)return {ok:false,motivo:r?.motivo||'no-se-pudo-reservar-correlativo'};
  let num=r.inicio;
  for(const a of pendientes){
    a.numeroContable=num++;
    a.numeroContableOrigen='secuencia-firebase';
    a.numeroContableAsignadoEn=new Date().toISOString();
    // `n` queda como referencia histórica/compatibilidad. Las vistas nuevas
    // deben preferir numeroContable.
  }
  return {ok:true,asignados:pendientes.length,nuevos:pendientes.length,inicio:r.inicio,fin:r.fin};
}

function numeroMostrar(a){return n(a?.numeroContable)||n(a?.n)||n(a?.folioComp)||0;}

export {asegurarNumerosContables,diagnosticoNumeracion,numeroMostrar};
