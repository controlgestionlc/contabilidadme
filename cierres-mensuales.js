// cierres-mensuales.js — Gestión operativa de cierres contables mensuales.
// Visible para administradores y contadores en empresas a las que tienen acceso.
// La Auditoría de Integridad permanece separada y exclusiva de administración.
import {S,AUTH} from './state.js';
import {MESES,toast} from './core.js';
import {puedeEditar} from './auth.js';
import {empresaActiva,puedeVerEmpresa} from './empresas.js';
import {ejercicioCerrado,periodoCerrado,cerrarPeriodoContable,reabrirPeriodoContable} from './contabilidad-v2.js';

function puedeGestionarCierresMensuales(){
  const u=AUTH.user;
  if(!u?.activo||!['admin','contador'].includes(u.rol))return false;
  const e=empresaActiva();
  if(!e||!puedeVerEmpresa(e))return false;
  return puedeEditar('cierresmensuales');
}
function periodoMes(i){return `${S.empresa.anio}-${String(i+1).padStart(2,'0')}`;}
function cierreActivo(per){return (S.cierresContables||[]).find(c=>c.periodo===per&&c.estado==='cerrado')||null;}
function historialPeriodo(per){return (S.cierresContables||[]).filter(c=>c.periodo===per).slice().reverse();}
function fmtFecha(iso){if(!iso)return '—';try{return new Date(iso).toLocaleString('es-CL');}catch(_){return iso;}}

function renderCierresMensuales(){
  const el=document.getElementById('cierres-mensuales-content');if(!el)return;
  if(!puedeGestionarCierresMensuales()){
    el.innerHTML='<div class="empty"><div class="ei">🔒</div>Los cierres mensuales están disponibles para administradores y contadores con permiso de edición en la empresa activa.</div>';
    return;
  }
  const cerradoAnual=ejercicioCerrado();
  const filas=MESES.map((m,i)=>{
    const per=periodoMes(i), c=cierreActivo(per), hist=historialPeriodo(per);
    const ult=hist[0];
    const estado=c?'CERRADO':'ABIERTO';
    const meta=c?`Cerrado ${fmtFecha(c.cerradoEn)}${c.cerradoPor?' · '+c.cerradoPor:''}`:
      (ult?.estado==='reabierto'?`Reabierto ${fmtFecha(ult.reabiertoEn)}${ult.reabiertoPor?' · '+ult.reabiertoPor:''}`:'Sin cierre registrado');
    const accion=c
      ? `<button class="btn btn-g" onclick="reabrirMesContableOperativo('${per}')" ${cerradoAnual?'disabled title="Primero reabre el ejercicio anual"':''}>🔓 Reabrir</button>`
      : `<button class="btn btn-i" onclick="cerrarMesContableOperativo('${per}')" ${cerradoAnual?'disabled title="El ejercicio anual ya está cerrado"':''}>🔒 Cerrar</button>`;
    return `<tr><td class="tl"><strong>${m}</strong><div style="font-size:10px;color:var(--mt)">${per}</div></td><td><span class="badge ${c?'br':'bg'}">${estado}</span></td><td class="tl"><div style="font-size:11px">${meta}</div></td><td>${accion}</td></tr>`;
  }).join('');
  el.innerHTML=`
    <div class="card" style="margin-bottom:14px;border-left:4px solid ${cerradoAnual?'var(--warn)':'var(--info)'}">
      <div class="card-title">🔒 Cierres contables mensuales · ${S.empresa.anio}</div>
      <div class="info-tip" style="margin-bottom:12px;line-height:1.55">
        Cierra cada mes una vez terminada su contabilización. El cierre bloquea altas, modificaciones, anulaciones y asientos cuya <strong>fecha de contabilización</strong> pertenezca a ese período. En compras RCV se respeta <code>periodoContable/fechaContabilizacion</code>, no la fecha original del DTE.
      </div>
      ${cerradoAnual?'<div class="info-tip" style="margin-bottom:12px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ El ejercicio anual está cerrado. Para cambiar un cierre mensual primero debes reabrir el ejercicio.</div>':''}
      <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Empresa activa: <strong>${S.empresa.nombre||'—'}</strong>. Los contadores sólo pueden operar empresas que tengan asignadas/compartidas y para las cuales conserven permiso de edición.</div>
      <div class="tw"><table><thead><tr><th class="tl">MES</th><th>ESTADO</th><th class="tl">TRAZABILIDAD</th><th>ACCIÓN</th></tr></thead><tbody>${filas}</tbody></table></div>
    </div>`;
}

async function cerrarMesContableOperativo(per){
  if(!puedeGestionarCierresMensuales()){toast('🚫 No tienes permiso para cerrar períodos en esta empresa','e');return;}
  if(periodoCerrado(per)){toast(`ℹ️ ${per} ya está cerrado`);return;}
  if(!confirm(`¿Cerrar contablemente ${per}?\n\nNo se podrán registrar ni modificar movimientos contabilizados en ese mes hasta una reapertura formal.`))return;
  const r=await cerrarPeriodoContable(per,'Cierre mensual operativo');
  if(!r.ok){
    const msg=r.motivo==='integridad-critica'
      ?`🚫 No se puede cerrar ${per}: existen ${r.criticas} hallazgo(s) crítico(s). Solicita al administrador revisar Auditoría de Integridad.`
      :r.motivo==='ejercicio-cerrado'?`🔒 El ejercicio ${S.empresa.anio} ya está cerrado.`
      :r.motivo==='sin-permiso'?`🚫 No tienes permiso para cerrar ${per}.`
      :`❌ No se pudo cerrar ${per}: ${r.motivo||'error'}`;
    toast(msg,'e');return;
  }
  toast(`🔒 Período ${per} cerrado`);renderCierresMensuales();
}

async function reabrirMesContableOperativo(per){
  if(!puedeGestionarCierresMensuales()){toast('🚫 No tienes permiso para reabrir períodos en esta empresa','e');return;}
  if(!periodoCerrado(per)){toast(`ℹ️ ${per} ya está abierto`);return;}
  const motivo=(prompt(`Motivo de reapertura de ${per} (mínimo 10 caracteres):`,'')||'').trim();
  if(!motivo)return;
  const r=await reabrirPeriodoContable(per,motivo);
  if(!r.ok){
    const msg=r.motivo==='motivo-corto'?'⚠️ Indica un motivo de al menos 10 caracteres':
      r.motivo==='ejercicio-cerrado'?'🔒 Primero debes reabrir el ejercicio anual':
      r.motivo==='sin-permiso'?'🚫 No tienes permiso para reabrir este período':
      `❌ No se pudo reabrir ${per}: ${r.motivo||'error'}`;
    toast(msg,'e');return;
  }
  toast(`🔓 Período ${per} reabierto`);renderCierresMensuales();
}

export {renderCierresMensuales,cerrarMesContableOperativo,reabrirMesContableOperativo,puedeGestionarCierresMensuales};
