// asiento-validacion.js — V2.15.5 · puerta central de validación contable.
//
// Toda persistencia de asientos pasa por estas reglas antes de tocar Firestore.
// La validación se concentra aquí para que ningún módulo pueda "olvidar"
// comprobar cuadratura, PDC, cierres o referencias documentales.
import {S} from './state.js';
import {cuadratura} from './motor-contable.js';
import {reglaCuenta,validarMovimientosPDC} from './pdc-reglas.js';

const n=v=>Number(v)||0;
const periodo=f=>String(f||'').slice(0,7);
const clone=o=>JSON.parse(JSON.stringify(o));
const mismo=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function periodoCerradoLocal(fecha){
  const p=periodo(fecha);
  return /^\d{4}-\d{2}$/.test(p)&&(S.cierresContables||[]).some(c=>c.periodo===p&&c.estado==='cerrado');
}
function centroExiste(cc){
  if(!cc)return false;
  return (S.centros||[]).some(c=>String(c.id)===String(cc)||String(c.codigo||'')===String(cc));
}
function documentoPorReferencia(tipo,docId){
  const arr=tipo==='cliente'?S.ventas:tipo==='honorario'?S.honorarios:S.compras;
  return (arr||[]).find(d=>String(d.id)===String(docId));
}
function documentoMaestro(a){
  const arr=a.fuente==='ventas'?S.ventas:a.fuente==='compras'?S.compras:a.fuente==='honorarios'?S.honorarios:null;
  return arr?(arr||[]).find(d=>String(d.id)===String(a.docId)):null;
}

function validarAsientoCentral(a,{validarReferencias=true}={}){
  const errores=[];
  if(!a||typeof a!=='object')return {ok:false,errores:['Asiento inválido']};
  if(!a.id)errores.push('El asiento no tiene id interno');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha||'')))errores.push(`El asiento ${a.id||''} no tiene una fecha válida`);
  if(!Array.isArray(a.movs)||a.movs.length<2)errores.push(`El asiento ${a.id||''} debe tener al menos dos movimientos`);

  const movs=Array.isArray(a.movs)?a.movs:[];
  movs.forEach((m,i)=>{
    const debe=n(m.debe),haber=n(m.haber);
    if(debe<0||haber<0)errores.push(`Línea ${i+1}: Debe/Haber no pueden ser negativos`);
    if(debe>0&&haber>0)errores.push(`Línea ${i+1}: no puede tener Debe y Haber simultáneamente`);
    if(debe===0&&haber===0)errores.push(`Línea ${i+1}: el movimiento tiene monto cero`);
    const r=reglaCuenta(m.cd);
    if(r?.requiereCentroCosto&&!m.cc)errores.push(`Línea ${i+1}: la cuenta ${m.cd} exige centro de costo`);
    if(m.cc&&!centroExiste(m.cc))errores.push(`Línea ${i+1}: el centro de costo ${m.cc} no existe`);
  });

  const vp=validarMovimientosPDC(movs,{manual:a.tipo==='manual',apertura:a.tipo==='apertura',cierre:a.tipo==='cierre'});
  if(!vp.ok)errores.push(...vp.errores);
  const q=cuadratura(movs);
  if(!q.ok)errores.push(`Asiento descuadrado: Debe ${q.debe} / Haber ${q.haber} / diferencia ${q.diferencia}`);

  if(validarReferencias&&a.tipo==='documento'&&['ventas','compras','honorarios'].includes(a.fuente)){
    const d=documentoMaestro(a);
    if(!d)errores.push(`El asiento ${a.id} referencia un documento inexistente (${a.fuente}:${a.docId||'sin id'})`);
    else if(d.estado==='anulado'&&!a.anulado)errores.push(`El asiento ${a.id} está activo pero su documento ${a.docId} está anulado`);
    else{
      if(a.tipoDTE!=null&&d.tipoDTE!=null&&String(a.tipoDTE)!==String(d.tipoDTE))errores.push(`El tipo DTE del asiento no coincide con su documento ${a.docId}`);
      if(a.folio!=null&&d.numero!=null&&String(a.folio)!==String(d.numero))errores.push(`El folio del asiento no coincide con su documento ${a.docId}`);
    }
  }

  if(validarReferencias&&a.referenciaDoc?.docId){
    const rd=a.referenciaDoc;
    const arr=rd.fuente==='ventas'?S.ventas:rd.fuente==='compras'?S.compras:rd.fuente==='honorarios'?S.honorarios:null;
    const d=arr?(arr||[]).find(x=>String(x.id)===String(rd.docId)):null;
    if(!d)errores.push(`Referencia documental manual inexistente (${rd.fuente||'sin fuente'}:${rd.docId})`);
    else if(d.estado==='anulado')errores.push(`Referencia documental manual apunta a un documento anulado (${rd.docId})`);
    else{
      if(rd.tipoDTE!=null&&d.tipoDTE!=null&&String(rd.tipoDTE)!==String(d.tipoDTE))errores.push(`Referencia manual: tipo DTE no coincide con ${rd.docId}`);
      if(rd.folio!=null&&d.numero!=null&&String(rd.folio)!==String(d.numero))errores.push(`Referencia manual: folio no coincide con ${rd.docId}`);
    }
  }

  if(validarReferencias&&a.tipo==='pago'){
    (a.documentos||[]).forEach((r,i)=>{
      if(!r?.docId){errores.push(`Referencia de pago ${i+1} sin docId`);return;}
      const d=documentoPorReferencia(r.tipo,r.docId);
      if(!d)errores.push(`Pago referencia documento inexistente ${r.docId}`);
      else if(d.estado==='anulado')errores.push(`Pago referencia documento anulado ${r.docId}`);
      if(!(n(r.monto)>0))errores.push(`Referencia de pago ${r.docId}: monto inválido`);
    });
  }

  return {ok:errores.length===0,errores,cuadre:q};
}

function validarMutacionAsientos(antes,despues){
  antes=Array.isArray(antes)?antes:[];despues=Array.isArray(despues)?despues:[];
  const errores=[];
  const ant=new Map(antes.filter(x=>x?.id).map(x=>[String(x.id),x]));
  const nue=new Map(despues.filter(x=>x?.id).map(x=>[String(x.id),x]));
  const ids=new Set([...ant.keys(),...nue.keys()]);
  const cambiados=[];

  ids.forEach(id=>{
    const a0=ant.get(id),a1=nue.get(id);
    if(a0&&a1&&mismo(a0,a1))return;
    cambiados.push(id);

    // Un período cerrado protege tanto la fecha anterior como la nueva. Esto
    // evita el atajo de mover temporalmente un asiento fuera del mes cerrado.
    const esCierre=(a0?.tipo==='cierre'||a1?.tipo==='cierre');
    if(!esCierre&&a0&&periodoCerradoLocal(a0.fecha))errores.push(`Período ${periodo(a0.fecha)} cerrado: no se puede modificar/anular/eliminar el asiento ${a0.numeroContable||a0.n||id}`);
    if(!esCierre&&a1&&periodoCerradoLocal(a1.fecha))errores.push(`Período ${periodo(a1.fecha)} cerrado: no se puede crear/modificar el asiento ${a1.numeroContable||a1.n||id}`);

    if(a1&&!a1.anulado){
      const v=validarAsientoCentral(a1);
      if(!v.ok)errores.push(...v.errores.map(e=>`${a1.numeroContable||a1.n||id}: ${e}`));
    }
  });

  return {ok:errores.length===0,errores,cambiados};
}

function leerAsientosPersistidosLocal(anio=S.empresa.anio){
  try{
    const pref=window.storage?.getPrefijo?.()||'emp1';
    const raw=localStorage.getItem(`cv:${pref}:asientos-${anio}`);
    const v=raw?JSON.parse(raw):[];
    return Array.isArray(v)?v:[];
  }catch(e){return [];}
}

export {validarAsientoCentral,validarMutacionAsientos,leerAsientosPersistidosLocal};
