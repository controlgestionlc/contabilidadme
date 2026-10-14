// reversas.js — V2.21.42 · Eliminar o anular asientos generados automáticamente
//
// Un asiento automático no siempre está solo: algunos dejan amarrado otro
// registro (un cierre de costos marca los centros como cerrados, una
// capitalización crea un activo fijo y deja el centro "capitalizado"). Para
// que se pueda eliminar a mano sin dejar datos huérfanos, cada tipo sabe qué
// revertir.
//
//   eliminar → el asiento desaparece (su N° queda libre)
//   anular   → el asiento queda con su N° pero sin efecto contable
//
// En ambos casos se aplica la misma reversa. Los saldos que se DERIVAN de los
// asientos (deuda del F29, pagos pendientes, liquidaciones contabilizadas) se
// recalculan solos al desaparecer el asiento.

import {fmtC, MESES} from './core.js';
import {S} from './state.js';
import {persistirAsientosCritico} from './contabilidad-v2.js';
import {numeroMostrar} from './correlativo-contable.js';
import {ccInfo, ccNombre, cierresCC, revertirCierre, guardarCierresCC, guardarCentros} from './centroscosto.js';
import {logAccion} from './firebase.js';

const nomMes=per=>{const [y,m]=String(per||'').split('-');return m?`${MESES[+m-1]} ${y}`:String(per||'');};
const activos=()=>(S.asientos||[]).filter(a=>!a.anulado);

// Clasifica un asiento automático y describe su reversa.
// Devuelve null si no es un asiento automático que se gestione aquí.
function infoReversa(a){
  if(!a||a.tipo==='manual'||a.tipo==='pago'||a.tipo==='documento')return null;
  if(a.fuente==='honorarios')return null;   // tiene su propio flujo documental
  const num=numeroMostrar(a);
  const r={asiento:a,num,clase:'generico',nombre:a.glosa||'Asiento automático',efectos:[],advertencias:[],bloqueo:null,reversa:null};

  if(a.tipo==='cierre'){
    r.clase='cierre-ejercicio';r.nombre='Cierre del ejercicio '+(a.ejercicio||String(a.fecha||'').slice(0,4));
    r.bloqueo='El cierre del ejercicio no se elimina desde aquí: usa "Reabrir ejercicio" en Cierre de ejercicio, que lo anula dejando el motivo en la auditoría.';
    return r;
  }
  if(a.origenAuto==='ivaf29'){
    r.clase='compensacion-iva';r.nombre='Compensación de IVA '+nomMes(a.periodoIVA);
    r.efectos.push(`El F29 de ${nomMes(a.periodoIVA)} queda sin compensación contabilizada; se puede volver a generar desde el F29.`);
    const pagos=activos().filter(x=>x.origenAuto==='pagof29'&&x.periodoIVA===a.periodoIVA);
    if(pagos.length)r.advertencias.push(`Hay ${pagos.length} pago(s) del F29 de ese período (N° ${pagos.map(numeroMostrar).join(', ')}). Quedarán sin la provisión del IVA a pagar hasta que vuelvas a generar la compensación.`);
    return r;
  }
  if(a.origenAuto==='pagof29'){
    r.clase='pago-f29';r.nombre='Pago F29 '+nomMes(a.periodoIVA);
    r.efectos.push(`El monto pagado (${fmtC(a.f29Detalle?.totalPagado||0)}) vuelve a quedar pendiente en la conciliación del F29 de ${nomMes(a.periodoIVA)}.`);
    return r;
  }
  if(a.tipo==='remuneraciones'){
    r.clase='remuneraciones';r.nombre='Remuneraciones '+nomMes(a.periodo||String(a.fecha||'').slice(0,7));
    r.efectos.push('Las remuneraciones del mes quedan sin contabilizar; se puede volver a generar el asiento desde Remuneraciones. El Libro de Remuneraciones no cambia.');
    return r;
  }
  if(a.tipo==='depreciacion'){
    r.clase='depreciacion';r.nombre='Depreciación del ejercicio '+(a.periodoAF||String(a.fecha||'').slice(0,4));
    r.efectos.push('La depreciación del año queda sin contabilizar; se puede volver a generar desde Activo Fijo.');
    return r;
  }
  if(a.tipo==='ajuste-cierre'){
    r.clase='provision';r.nombre=a.glosa||'Provisión de cierre';
    r.efectos.push('La provisión queda sin contabilizar; se puede volver a calcular desde Provisiones.');
    return r;
  }
  if(a.tipoCierreCC&&/^Capitalizaci/i.test(a.glosa||'')){
    r.clase='capitalizacion';
    const ccId=(a.movs||[]).map(m=>m.cc).find(Boolean)||a.ccCapitalizado||'';
    const centro=ccInfo(ccId);
    r.nombre=a.glosa;
    const total=(a.movs||[]).filter(m=>+m.debe>0&&m.cd===(a.movs[0]||{}).cd).reduce((s,m)=>s+(+m.debe||0),0);
    const af=(S.activos||[]).find(x=>x.asientoCapitalizacion===a.id)
      ||(S.activos||[]).find(x=>x.cc===ccId&&x.fecha===a.fecha&&Math.round(+x.valor||0)===Math.round(total));
    if(af){
      const dep=activos().find(x=>x.tipo==='depreciacion'&&(x.detalleActivos||[]).some(d=>d.activoId===af.id));
      if(dep)r.bloqueo=`El activo "${af.desc}" ya tiene depreciación contabilizada (asiento N° ${numeroMostrar(dep)}). Elimina primero ese asiento de depreciación.`;
      r.efectos.push(`Se elimina el activo fijo "${af.desc}" (${fmtC(af.valor||0)}) creado por la capitalización.`);
    }else r.advertencias.push('No se encontró el activo fijo creado por esta capitalización; revisa Activo Fijo por si quedó registrado.');
    if(centro)r.efectos.push(`El centro "${ccNombre(ccId)}" vuelve a quedar como inversión en curso y se puede capitalizar de nuevo.`);
    r.reversa={tipo:'capitalizacion',ccId,activoId:af?af.id:null,prevEstado:centro?.estadoPrevioCapitalizacion||'formacion'};
    return r;
  }
  if(a.tipoCierreCC){
    r.clase='cierre-costos';r.nombre=a.glosa||'Cierre de costos';
    const regs=cierresCC().filter(c=>(c.asientoId&&c.asientoId===a.id)||(!c.asientoId&&c.folio!=null&&(c.folio===a.n||c.folio===a.numeroContable)&&c.fecha===a.fecha));
    const pers=[...new Set(regs.map(c=>c.periodo))];
    if(regs.length)r.efectos.push(`${regs.length} centro(s) de costo vuelven a quedar con ${pers.map(nomMes).join(', ')} abierto, para cerrarlo de nuevo.`);
    else r.advertencias.push('No se encontró el registro de cierre de los centros de costo; si el mes sigue marcado como cerrado, usa "Revertir cierre" en Centros de Costo.');
    r.reversa={tipo:'cierre-costos',regs:regs.map(c=>({cc:c.cc,periodo:c.periodo}))};
    return r;
  }
  // Otros asientos generados por el sistema
  r.efectos.push('El asiento deja de afectar el Mayor, el Balance y los reportes.');
  return r;
}

function mensajeConfirmacion(info,modo){
  const a=info.asiento;
  return `${modo==='anular'?'¿Anular':'¿Eliminar'} el asiento automático N°${info.num||'?'}?\n\n`+
    `${info.nombre}\n${a.fecha||''}\n\n`+
    (info.efectos.length?`Al hacerlo:\n${info.efectos.map(x=>'• '+x).join('\n')}\n\n`:'')+
    (info.advertencias.length?`⚠️ ${info.advertencias.join('\n⚠️ ')}\n\n`:'')+
    (modo==='anular'
      ?`El N° ${info.num} se conserva en el correlativo, sin efecto contable.`
      :`El N° ${info.num} queda libre y el correlativo pierde continuidad. Si prefieres conservarlo, usa "Anular".\n\nEsta acción no se puede deshacer.`);
}

// Ejecuta la eliminación o anulación con su reversa. Devuelve {ok, motivo}.
async function eliminarAsientoAuto(a,{modo='eliminar',confirmar=window.confirm}={}){
  const info=infoReversa(a);
  if(!info)return {ok:false,motivo:'no-es-automatico'};
  if(info.bloqueo)return {ok:false,motivo:'bloqueado',detalle:info.bloqueo};
  if(confirmar&&!confirmar(mensajeConfirmacion(info,modo)))return {ok:false,motivo:'cancelado'};

  const ahora=new Date().toISOString();
  const r=await persistirAsientosCritico(()=>{
    if(modo==='anular'){a.anulado=true;a.anuladoEn=ahora;a.motivoAnulacion='Anulado manualmente desde Comprobantes';}
    else S.asientos=S.asientos.filter(x=>x!==a&&x.id!==a.id);
  });
  if(!r.ok)return {ok:false,motivo:r.motivo||'persistencia'};

  // Reversas de registros vinculados (después de grabar el asiento: si el
  // asiento no se pudo tocar, no se revierte nada)
  const avisos=[];
  try{
    const rv=info.reversa;
    if(rv&&rv.tipo==='cierre-costos'&&rv.regs.length){
      rv.regs.forEach(x=>revertirCierre(x.cc,x.periodo));
      await guardarCierresCC();
    }
    if(rv&&rv.tipo==='capitalizacion'){
      if(rv.activoId){
        const antes=S.activos||[];
        S.activos=antes.filter(x=>x.id!==rv.activoId);
        const ra=await window.storage.set('activos',JSON.stringify(S.activos));
        if(ra&&ra.ok===false){S.activos=antes;avisos.push('No se pudo eliminar el activo fijo: elimínalo a mano en Activo Fijo.');}
      }
      const c=ccInfo(rv.ccId);
      if(c&&c.estado==='capitalizado'){c.estado=rv.prevEstado||'formacion';c.capitalizadoEn=null;delete c.estadoPrevioCapitalizacion;await guardarCentros();}
    }
  }catch(e){console.error('Reversa',e);avisos.push('La reversa de los registros vinculados no se completó: '+(e.message||e));}

  logAccion(modo==='anular'?'Anuló asiento automático':'Eliminó asiento automático',
    `N°${info.num} · ${info.nombre}${info.reversa?' · con reversa '+info.reversa.tipo:''}`);
  return {ok:true,info,avisos};
}

export {infoReversa, eliminarAsientoAuto};
