import {auditoriaIntegridad,migrarDocumentosAAsientos,ejercicioCerrado} from './contabilidad-v2.js';
import {toast} from './core.js';

function renderIntegridad(){
  const el=document.getElementById('integridad-content'); if(!el)return;
  const r=auditoriaIntegridad();
  const filas=r.hallazgos.map(h=>`<tr><td class="tl"><b>${h.sev.toUpperCase()}</b></td><td class="tl">${h.tipo}</td><td class="tl">${h.detalle}</td></tr>`).join('');
  const sev=r.porSeveridad||{};
  el.innerHTML=`<div class="card" style="margin-bottom:14px">
    <div class="card-title">${r.ok?'🟢 SISTEMA CUADRADO':'🔴 '+r.total+' DIFERENCIA'+(r.total===1?'':'S')+' DETECTADA'+(r.total===1?'':'S')}</div>
    <div class="info-tip" style="margin-bottom:12px;line-height:1.55">
      Control V2 sobre <strong>cuadratura de asientos, documentos↔asientos, auxiliares↔Mayor, IVA por documento, pagos, duplicados F29 y cierre del ejercicio</strong>.
      ${r.ok?'No se detectaron diferencias en los controles implementados.':'Las diferencias críticas deben corregirse antes del cierre o de usar los estados financieros como definitivos.'}
    </div>
    ${r.ok?'':`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="badge br">Críticas: ${sev.critica||0}</span><span class="badge" style="background:rgba(210,153,34,.15);color:var(--warn)">Altas: ${sev.alta||0}</span>
    </div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-i" onclick="migrarAsientosV2()" ${ejercicioCerrado()?'disabled title="Ejercicio cerrado"':''}>⚙️ Migrar documentos a asiento maestro</button><button class="btn btn-g" onclick="renderIntegridad()">🔄 Volver a auditar</button></div>
  </div>${r.ok?'':`<div class="card-np"><div class="tw"><table><thead><tr><th class="tl">GRAVEDAD</th><th class="tl">CONTROL</th><th class="tl">DETALLE</th></tr></thead><tbody>${filas}</tbody></table></div></div>`}`;
}

async function migrarAsientosV2(){
  const r=await migrarDocumentosAAsientos();
  if(!r.ok){toast(r.motivo==='ejercicio-cerrado'?'🔒 No se puede migrar con el ejercicio cerrado':'❌ No se pudo completar la migración','e');return;}
  toast(`✅ Migración V2: ${r.creados} asientos creados, ${r.actualizados} actualizados`);renderIntegridad();
}
export {renderIntegridad,migrarAsientosV2};
