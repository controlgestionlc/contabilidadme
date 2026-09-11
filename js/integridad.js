import {auditoriaIntegridad,migrarDocumentosAAsientos,ejercicioCerrado,periodoCerrado,cerrarPeriodoContable,reabrirPeriodoContable} from './contabilidad-v2.js';
import {estadoPreparacionProductiva,ejecutarPruebasProductivas,ejecutarRegresionContableCompleta,iniciarPruebaConcurrencia,prepararPruebaConcurrencia,escribirPruebaConcurrencia,verificarPruebaConcurrencia,ejecutarSimulacroRestauracion} from './hardening.js';
import {toast,MESES} from './core.js';
import {S,AUTH} from './state.js';
import {RECOVERY,estadoRecuperacion,crearSnapshotRecuperacion,verificarSnapshotRecuperacion,restaurarSnapshotRecuperacion} from './recovery.js';
import {estadoPreproduccion,setChecklistPreprod,habilitarEscriturasPrueba,bloquearEscriturasPrueba,activarProduccion,volverAPrueba} from './preproduccion.js';

function periodoActualUI(){
  const sel=document.getElementById('hard-periodo');
  return sel?.value||`${S.empresa.anio}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
}
function opcionesPeriodo(){
  return MESES.map((m,i)=>{const p=`${S.empresa.anio}-${String(i+1).padStart(2,'0')}`;return `<option value="${p}">${m} ${S.empresa.anio}${periodoCerrado(p)?' · CERRADO':''}</option>`;}).join('');
}
function opcionesSnapshots(){
  if(!RECOVERY.index?.length)return '<option value="">Sin snapshots disponibles</option>';
  return RECOVERY.index.map((x,i)=>{
    const f=x.creadoEn?new Date(x.creadoEn).toLocaleString('es-CL'):'sin fecha';
    const tipo=String(x.tipo||'manual').replace(/-/g,' ');
    const kb=((+x.totalBytes||0)/1024).toFixed(1);
    return `<option value="${x.id}">${i===0?'★ ':''}${f} · ${tipo} · ${kb} KB</option>`;
  }).join('');
}
function renderIntegridad(){
  const el=document.getElementById('integridad-content'); if(!el)return;
  const r=auditoriaIntegridad();
  const prod=estadoPreparacionProductiva();
  const filas=r.hallazgos.map(h=>`<tr><td class="tl"><b>${h.sev.toUpperCase()}</b></td><td class="tl">${h.tipo}</td><td class="tl">${h.detalle}</td></tr>`).join('');
  const sev=r.porSeveridad||{};
  const checks=prod.criterios.map(c=>`<tr><td class="tl" style="width:70px"><b>${c.ok?'🟢':c.pendiente?'🟡':'🔴'}</b></td><td class="tl"><b>${c.nombre}</b></td><td class="tl">${c.detalle}</td></tr>`).join('');
  const tests=prod.tests.pruebas.map(t=>`<tr><td class="tl">${t.ok?'✅':'❌'}</td><td class="tl">${t.nombre}</td><td class="tl">${t.detalle}</td></tr>`).join('');
  const regresion=prod.regresion.pruebas.map(t=>`<tr><td class="tl">${t.ok?'✅':'❌'}</td><td class="tl">${t.categoria}</td><td class="tl">${t.nombre}</td><td class="tl">${t.detalle}</td></tr>`).join('');
  const per=periodoActualUI();
  const rec=estadoRecuperacion();
  const pre=estadoPreproduccion();
  const ult=rec.ultimo;
  const ultTxt=ult?`${new Date(ult.creadoEn).toLocaleString('es-CL')} · ${ult.tipo} · ${ult.totalClaves||0} claves · ${((ult.totalBytes||0)/1024).toFixed(1)} KB`:'Aún no hay snapshots';
  el.innerHTML=`
  <div class="card" style="margin-bottom:14px;border-left:4px solid ${prod.listo?'var(--ok)':'var(--warn)'}">
    <div class="card-title">${prod.listo?'🟢 LISTO PARA PRODUCTIVO':'🟡 PREPARACIÓN PRODUCTIVA V2.15'}</div>
    <div class="info-tip" style="margin-bottom:12px;line-height:1.55">
      Este semáforo no se declara verde sólo por compilar. Los controles técnicos se verifican aquí y las pruebas que requieren <strong>Firebase real / dos equipos / restauración</strong> quedan amarillas hasta ejecutarlas operacionalmente.
    </div>
    <div class="tw"><table><thead><tr><th></th><th class="tl">CONTROL</th><th class="tl">RESULTADO</th></tr></thead><tbody>${checks}</tbody></table></div>
  </div>

  <div class="card" style="margin-bottom:14px;border-left:4px solid ${pre.modo==='produccion'?'var(--ok)':'var(--warn)'}">
    <div class="card-title">${pre.modo==='produccion'?'🟢 ENTORNO PRODUCTIVO':'🧪 PILOTO / PREPRODUCCIÓN'}</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">
      <strong>PRUEBA</strong> bloquea por defecto las escrituras de negocio al abrir una nueva sesión. Para probar modificaciones debes habilitarlas explícitamente; al cerrar la app vuelven a bloquearse. <strong>PRODUCCIÓN</strong> sólo puede activarse con todos los controles técnicos verdes y las seis confirmaciones de puesta en marcha.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <span class="badge ${pre.modo==='produccion'?'bg':'br'}">${pre.modo.toUpperCase()}</span>
      ${pre.modo==='prueba'?`<span class="badge ${pre.escrituraPrueba?'bg':'br'}">${pre.escrituraPrueba?'ESCRITURA DE PRUEBA HABILITADA':'ESCRITURA BLOQUEADA'}</span>`:''}
      ${pre.modo==='prueba'&&!pre.escrituraPrueba?'<button class="btn btn-g" onclick="habilitarEscriturasPrueba().then(()=>renderIntegridad())">🧪 Habilitar escrituras esta sesión</button>':''}
      ${pre.modo==='prueba'&&pre.escrituraPrueba?'<button class="btn btn-s" onclick="bloquearEscriturasPrueba();renderIntegridad()">🔒 Bloquear escrituras</button>':''}
      ${pre.modo==='prueba'?'<button class="btn btn-i" onclick="activarProduccion().then(()=>renderIntegridad())">🚀 Activar PRODUCCIÓN</button>':'<button class="btn btn-s" onclick="volverAPrueba().then(()=>renderIntegridad())">↩ Volver a PRUEBA</button>'}
    </div>
    <div class="tw"><table><thead><tr><th></th><th class="tl">CHECKLIST DE PUESTA EN MARCHA</th></tr></thead><tbody>
      ${Object.entries(pre.checks).map(([id,nm])=>`<tr><td style="width:48px"><input type="checkbox" ${pre.checklist[id]?'checked':''} ${AUTH.user?.rol!=='admin'?'disabled':''} onchange="setChecklistPreprod('${id}',this.checked).then(()=>renderIntegridad())"></td><td class="tl">${nm}</td></tr>`).join('')}
    </tbody></table></div>
    ${pre.modo==='produccion'?`<div style="margin-top:10px;font-size:11px;color:var(--mt)">Activado: <strong>${pre.activadoEn?new Date(pre.activadoEn).toLocaleString('es-CL'):'—'}</strong> · ${pre.activadoPor||'—'}</div>`:''}
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🔒 Cierre contable mensual</div>
    <div class="info-tip" style="margin-bottom:10px">Bloquea altas, modificaciones, anulaciones y asientos cuya <strong>fecha de contabilización</strong> pertenezca al período cerrado. En compras RCV se usa <code>periodoContable/fechaContabilizacion</code>, no la fecha original del DTE.</div>
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
      <div><label>Período</label><select id="hard-periodo" onchange="renderIntegridad()">${opcionesPeriodo()}</select></div>
      <button class="btn btn-i" onclick="cerrarMesContableUI()" ${ejercicioCerrado()?'disabled':''}>🔒 Cerrar período</button>
      <button class="btn btn-g" onclick="reabrirMesContableUI()" ${AUTH.user?.rol!=='admin'?'disabled title="Sólo administrador"':''}>🔓 Reabrir período</button>
    </div>
    <div style="margin-top:8px"><span class="badge ${periodoCerrado(per)?'br':''}">${periodoCerrado(per)?'CERRADO':'ABIERTO'}</span></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🌐 Prueba operacional Firebase · 2 equipos</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">
      Esta prueba usa un registro aislado de diagnóstico, <strong>no toca ventas, compras ni asientos</strong>. En el equipo A inicia la prueba. En el equipo B pulsa Preparar. Luego, sin recargar, pulsa Escribir una vez en cada equipo y finalmente Verificar. Sólo aprueba si Firebase conserva las marcas de dos dispositivos distintos sobre la misma revisión.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-i" onclick="iniciarPruebaConcurrenciaUI()">1 · Iniciar (equipo A)</button>
      <button class="btn btn-g" onclick="prepararPruebaConcurrenciaUI()">2 · Preparar (equipo B)</button>
      <button class="btn btn-g" onclick="escribirPruebaConcurrenciaUI()">3 · Escribir este equipo</button>
      <button class="btn btn-s" onclick="verificarPruebaConcurrenciaUI()">4 · Verificar</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🛟 Recuperación ante desastre · V2.15.4</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">
      Se conservan hasta <strong>6 snapshots</strong> independientes del Excel. La app crea uno automático como máximo cada 6 horas de actividad y puede crear puntos previos a operaciones masivas. Antes de restaurar se verifica SHA-256 y se genera un snapshot de seguridad del estado actual.
    </div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px">Último snapshot: <strong>${ultTxt}</strong></div>
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
      <div style="min-width:360px;max-width:100%"><label>Punto de recuperación</label><select id="recovery-sel" style="width:100%">${opcionesSnapshots()}</select></div>
      <button class="btn btn-g" onclick="crearSnapshotUI()">＋ Crear snapshot</button>
      <button class="btn btn-s" onclick="verificarSnapshotUI()" ${!RECOVERY.index?.length?'disabled':''}>✓ Verificar</button>
      <button class="btn btn-d" onclick="restaurarSnapshotUI()" ${(!RECOVERY.index?.length||AUTH.user?.rol!=='admin')?'disabled':''}>↩ Restaurar</button>
    </div>
    <div style="margin-top:8px"><span class="badge ${rec.vigente?'bg':'br'}">${rec.vigente?'SNAPSHOT RECIENTE':'SNAPSHOT PENDIENTE / ANTIGUO'}</span></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">💾 Simulacro de restauración</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">Genera el respaldo Excel completo, lo serializa y lo vuelve a abrir <strong>en memoria</strong>. Verifica hojas, cantidad de registros y metadata completa de asientos sin alterar la base real.</div>
    <button class="btn btn-g" onclick="ejecutarSimulacroRestauracionUI()">▶ Ejecutar simulacro seguro</button>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🧪 Regresión contable integral · V2.15.6</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">Ejecuta escenarios aislados en memoria y restaura el estado real al terminar. Comprueba documentos, signos de NC/ND, IVA recuperable/no recuperable, DTE 45/46, honorarios, pagos parciales, arrastre F29, depreciación, remuneraciones y la igualdad <strong>Diario = Mayor = Balance</strong>.</div>
    <div class="tw" style="max-height:430px;overflow:auto"><table><thead><tr><th></th><th class="tl">ÁREA</th><th class="tl">PRUEBA</th><th class="tl">DETALLE</th></tr></thead><tbody>${regresion}</tbody></table></div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn btn-g" onclick="ejecutarRegresionContableUI()">▶ Ejecutar regresión</button><span class="badge ${prod.regresion.ok?'bg':'br'}">${prod.regresion.aprobadas}/${prod.regresion.total} aprobadas</span></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🧪 Suite rápida de hardening</div>
    <div class="tw"><table><thead><tr><th></th><th class="tl">PRUEBA</th><th class="tl">DETALLE</th></tr></thead><tbody>${tests}</tbody></table></div>
    <div style="margin-top:10px"><button class="btn btn-g" onclick="ejecutarPruebasProductivasUI()">▶ Ejecutar nuevamente</button></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">${r.ok?'🟢 SISTEMA CUADRADO':'🔴 '+r.total+' DIFERENCIA'+(r.total===1?'':'S')+' DETECTADA'+(r.total===1?'':'S')}</div>
    <div class="info-tip" style="margin-bottom:12px;line-height:1.55">
      Control sobre <strong>cuadratura, documentos↔asientos, auxiliares↔Mayor, IVA, activo fijo, pagos, F29, cierres y persistencia</strong>.
      ${r.ok?'No se detectaron diferencias en los controles implementados.':'Las diferencias críticas deben corregirse antes de utilizar información como definitiva.'}
    </div>
    ${r.ok?'':`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><span class="badge br">Críticas: ${sev.critica||0}</span><span class="badge" style="background:rgba(210,153,34,.15);color:var(--warn)">Altas: ${sev.alta||0}</span></div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-i" onclick="migrarAsientosV2()" ${ejercicioCerrado()?'disabled title="Ejercicio cerrado"':''}>⚙️ Migrar documentos a asiento maestro</button><button class="btn btn-g" onclick="renderIntegridad()">🔄 Volver a auditar</button></div>
  </div>${r.ok?'':`<div class="card-np"><div class="tw"><table><thead><tr><th class="tl">GRAVEDAD</th><th class="tl">CONTROL</th><th class="tl">DETALLE</th></tr></thead><tbody>${filas}</tbody></table></div></div>`}`;
  const sel=document.getElementById('hard-periodo');if(sel&&per)sel.value=per;
}

async function cerrarMesContableUI(){
  const per=periodoActualUI();
  const rec=estadoRecuperacion();
  const ult=rec.ultimo;
  const ultTxt=ult?`${new Date(ult.creadoEn).toLocaleString('es-CL')} · ${ult.tipo} · ${ult.totalClaves||0} claves · ${((ult.totalBytes||0)/1024).toFixed(1)} KB`:'Aún no hay snapshots';
  if(periodoCerrado(per)){toast(`ℹ️ ${per} ya está cerrado`);return;}
  if(!confirm(`¿Cerrar contablemente ${per}?\n\nNo se podrán registrar ni modificar movimientos contabilizados en ese mes hasta una reapertura formal.`))return;
  const r=await cerrarPeriodoContable(per,'Cierre mensual desde Hardening Productivo');
  if(!r.ok){toast(r.motivo==='integridad-critica'?`🚫 No se puede cerrar: existen ${r.criticas} hallazgo(s) crítico(s) de integridad.`:`❌ No se pudo cerrar ${per}: ${r.motivo}`,'e');return;}
  toast(`🔒 Período ${per} cerrado`);renderIntegridad();
}
async function reabrirMesContableUI(){
  const per=periodoActualUI();
  const rec=estadoRecuperacion();
  const ult=rec.ultimo;
  const ultTxt=ult?`${new Date(ult.creadoEn).toLocaleString('es-CL')} · ${ult.tipo} · ${ult.totalClaves||0} claves · ${((ult.totalBytes||0)/1024).toFixed(1)} KB`:'Aún no hay snapshots';
  if(!periodoCerrado(per)){toast(`ℹ️ ${per} no está cerrado`);return;}
  const motivo=prompt(`Motivo de reapertura de ${per} (mínimo 10 caracteres):`,'');
  const r=await reabrirPeriodoContable(per,motivo||'');
  if(!r.ok){toast(r.motivo==='solo-admin'?'🔒 Sólo un administrador puede reabrir períodos':r.motivo==='motivo-corto'?'⚠️ Indica un motivo de al menos 10 caracteres':`❌ No se pudo reabrir ${per}`,'e');return;}
  toast(`🔓 Período ${per} reabierto`);renderIntegridad();
}
function ejecutarRegresionContableUI(){
  const r=ejecutarRegresionContableCompleta();toast(r.ok?`✅ Regresión contable: ${r.aprobadas}/${r.total} pruebas aprobadas`:`❌ Regresión contable: ${r.aprobadas}/${r.total} aprobadas · ${r.fallidas} fallida(s)`,r.ok?undefined:'e');renderIntegridad();
}
function ejecutarPruebasProductivasUI(){
  const r=ejecutarPruebasProductivas();toast(r.ok?`✅ ${r.aprobadas}/${r.total} pruebas aprobadas`:`❌ ${r.aprobadas}/${r.total} pruebas aprobadas` ,r.ok?undefined:'e');renderIntegridad();
}
async function iniciarPruebaConcurrenciaUI(){
  const r=await iniciarPruebaConcurrencia();
  toast(r.ok?`✅ Sesión ${r.sesion} creada. Ahora prepara el segundo equipo.`:`❌ ${r.motivo||'No se pudo iniciar la prueba'}`,r.ok?undefined:'e');
  renderIntegridad();
}
async function prepararPruebaConcurrenciaUI(){
  const r=await prepararPruebaConcurrencia();
  toast(r.ok?`✅ Equipo preparado en sesión ${r.sesion}. No recargues antes de escribir.`:`❌ ${r.motivo||'No se pudo preparar'}`,r.ok?undefined:'e');
}
async function escribirPruebaConcurrenciaUI(){
  const r=await escribirPruebaConcurrencia();
  toast(r.ok?`✅ Marca escrita por ${r.dispositivo}${r.fusionado?' · conflicto detectado y fusionado correctamente':''}`:`❌ ${r.motivo||'No se pudo escribir'}`,r.ok?undefined:'e');
}
async function verificarPruebaConcurrenciaUI(){
  const r=await verificarPruebaConcurrencia();
  toast(r.ok?`✅ Concurrencia aprobada con ${r.dispositivos.length} dispositivos`:`⚠️ ${r.motivo||'Prueba aún incompleta'}`,r.ok?undefined:'e');
  renderIntegridad();
}
async function ejecutarSimulacroRestauracionUI(){
  const r=await ejecutarSimulacroRestauracion();
  toast(r.ok?`✅ Simulacro aprobado: ${r.hojas} hojas · ${(r.bytes/1024).toFixed(1)} KB reconstruidos`:`❌ Simulacro falló: ${r.motivo||'error desconocido'}`,r.ok?undefined:'e');
  renderIntegridad();
}

async function crearSnapshotUI(){
  const motivo=prompt('Descripción opcional del snapshot:','Punto de recuperación manual');
  if(motivo===null)return;
  toast('🛟 Creando snapshot de recuperación…');
  const r=await crearSnapshotRecuperacion('manual',motivo||'Punto de recuperación manual');
  if(!r.ok){toast(`❌ No se pudo crear el snapshot: ${r.motivo||'error'}`,'e');return;}
  toast(`✅ Snapshot creado: ${r.snapshot.totalClaves} claves · ${(r.snapshot.totalBytes/1024).toFixed(1)} KB`);
  renderIntegridad();
}
async function verificarSnapshotUI(){
  const id=document.getElementById('recovery-sel')?.value||RECOVERY.index?.[0]?.id;
  if(!id){toast('⚠️ No hay snapshot para verificar','e');return;}
  toast('🔎 Verificando integridad SHA-256…');
  const r=await verificarSnapshotRecuperacion(id);
  if(!r.ok){toast(`❌ Snapshot inválido: ${r.motivo}${r.clave?' · '+r.clave:''}`,'e');return;}
  toast(`✅ Snapshot íntegro: ${r.totalClaves} claves · ${(r.totalBytes/1024).toFixed(1)} KB`);
  renderIntegridad();
}
async function restaurarSnapshotUI(){
  const id=document.getElementById('recovery-sel')?.value||RECOVERY.index?.[0]?.id;
  if(!id){toast('⚠️ No hay snapshot para restaurar','e');return;}
  const snap=RECOVERY.index.find(x=>x.id===id);
  const cuando=snap?.creadoEn?new Date(snap.creadoEn).toLocaleString('es-CL'):id;
  const aviso=`⚠️ RECUPERACIÓN DE EMERGENCIA\n\nSe restaurará el estado guardado el ${cuando}.\n\nAntes de hacerlo se creará automáticamente un snapshot del estado ACTUAL, para poder volver atrás.\n\nLa operación requiere rol administrador y Firebase disponible.\n\n¿Continuar?`;
  if(!confirm(aviso))return;
  const frase=prompt('Para confirmar escribe exactamente: RESTAURAR','');
  if(frase!=='RESTAURAR'){toast('Restauración cancelada');return;}
  toast('🛟 Verificando y restaurando snapshot…');
  const r=await restaurarSnapshotRecuperacion(id);
  if(!r.ok){toast(`❌ No se pudo restaurar: ${r.motivo}${r.detalle?' · '+r.detalle:''}`,'e');return;}
  alert(`✅ Restauración completada.\n\n${r.claves} claves restauradas.\nPunto de retorno creado: ${r.seguridad.id}\n\nLa aplicación se recargará para leer el estado restaurado.`);
  location.reload();
}

async function migrarAsientosV2(){
  const r=await migrarDocumentosAAsientos();
  if(!r.ok){toast(r.motivo==='ejercicio-cerrado'?'🔒 No se puede migrar con el ejercicio cerrado':'❌ No se pudo completar la migración','e');return;}
  toast(`✅ Migración V2: ${r.creados} asientos creados, ${r.actualizados} actualizados`);renderIntegridad();
}
export {renderIntegridad,migrarAsientosV2,cerrarMesContableUI,reabrirMesContableUI,ejecutarRegresionContableUI,ejecutarPruebasProductivasUI,iniciarPruebaConcurrenciaUI,prepararPruebaConcurrenciaUI,escribirPruebaConcurrenciaUI,verificarPruebaConcurrenciaUI,ejecutarSimulacroRestauracionUI,crearSnapshotUI,verificarSnapshotUI,restaurarSnapshotUI};
