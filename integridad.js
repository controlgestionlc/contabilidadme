import {auditoriaIntegridad,migrarDocumentosAAsientos,ejercicioCerrado,periodoCerrado} from './contabilidad-v2.js';
import {estadoPreparacionProductiva,ejecutarPruebasProductivas,ejecutarRegresionContableCompleta,iniciarPruebaConcurrencia,prepararPruebaConcurrencia,escribirPruebaConcurrencia,verificarPruebaConcurrencia,ejecutarSimulacroRestauracion} from './hardening.js';
import {toast,MESES,pn} from './core.js';
import {S,AUTH} from './state.js';
import {RECOVERY,estadoRecuperacion,crearSnapshotRecuperacion,verificarSnapshotRecuperacion,restaurarSnapshotRecuperacion} from './recovery.js';
import {estadoPreproduccion,setChecklistPreprod,habilitarEscriturasPrueba,bloquearEscriturasPrueba,activarProduccion,volverAPrueba,descargarActaHabilitacion} from './preproduccion.js';
import {CAMPOS,compararPeriodo,guardarReferenciaPiloto,certificarPiloto,invalidarPiloto,estadoPiloto} from './piloto.js';

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
  if(AUTH.user?.rol!=='admin'){
    el.innerHTML='<div class="empty"><div class="ei">🔒</div>Auditoría y alertas técnicas disponibles sólo para administración.</div>';
    return;
  }
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
  const faltanTecnicos=prod.criterios.filter(c=>!c.ok);
  const faltanChecklist=Object.entries(pre.checks).filter(([id])=>!pre.checklist[id]);
  const faltan=[...faltanTecnicos.map(c=>c.nombre),...faltanChecklist.map(([,n])=>n)];
  const acta=pre.actaHabilitacion;
  const listoMarcha=prod.listo&&pre.checklistCompleto;
  el.innerHTML=`
  <div class="card" style="margin-bottom:14px;border-left:4px solid ${pre.modo==='produccion'?'var(--ok)':listoMarcha?'var(--acc)':'var(--warn)'}">
    <div class="card-title">🚀 Puesta en marcha asistida · V2.15.9</div>
    <div class="info-tip" style="margin-bottom:12px;line-height:1.55">Este panel resume exactamente qué falta antes de habilitar datos reales. Al activar PRODUCCIÓN se genera una <strong>acta de habilitación</strong> con empresa, ejercicio, versión, administrador, período piloto, checklist, resultados técnicos y huella SHA-256.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <span class="badge ${pre.modo==='produccion'?'bg':listoMarcha?'bg':'br'}">${pre.modo==='produccion'?'PRODUCCIÓN HABILITADA':listoMarcha?'APTO PARA ACTIVAR':'REQUISITOS PENDIENTES'}</span>
      <span class="badge">Empresa: ${S.empresa.nombre||'sin nombre'} · ${S.empresa.anio}</span>
      <span class="badge">Piloto: ${estadoPiloto().ultimo?.periodo||'pendiente'}</span>
    </div>
    ${faltan.length?`<div style="margin-bottom:10px"><strong>Falta completar ${faltan.length} requisito(s):</strong><ol style="margin:6px 0 0 20px">${faltan.map(x=>`<li style="margin:3px 0">${x}</li>`).join('')}</ol></div>`:`<div style="margin-bottom:10px;color:var(--ok);font-weight:700">✅ Todos los requisitos previos están aprobados.</div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${pre.modo==='prueba'?`<button class="btn btn-i" onclick="activarProduccion().then(()=>renderIntegridad())">🚀 ${listoMarcha?'Activar PRODUCCIÓN':'Activar PRODUCCIÓN con pendientes'} y emitir acta</button>`:''}
      ${acta?`<button class="btn btn-g" onclick="descargarActaHabilitacion()">📄 Descargar acta de habilitación</button>`:''}
    </div>
    ${acta?`<div style="margin-top:10px;font-size:11px;color:var(--mt)">Acta <strong>${acta.id}</strong> · ${new Date(acta.generadoEn).toLocaleString('es-CL')} · ${acta.autorizadoPor?.email||''}<br>SHA-256: <code style="word-break:break-all">${acta.hash||'—'}</code></div>`:''}
  </div>

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
      <strong>PRUEBA</strong> bloquea por defecto las escrituras de negocio al abrir una nueva sesión. Para probar modificaciones debes habilitarlas explícitamente; al cerrar la app vuelven a bloquearse. <strong>PRODUCCIÓN</strong> puede habilitarse en forma condicional por un administrador; los pendientes quedan registrados en el acta y las protecciones contables permanecen activas.
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

  <div class="card" style="margin-bottom:14px;border-left:4px solid ${estadoPiloto().ok?'var(--ok)':'var(--warn)'}">
    <div class="card-title">🧾 Certificación mensual de piloto · V2.15.8</div>
    <div class="info-tip" style="margin-bottom:10px;line-height:1.55">Compara un período completo contra referencias externas conocidas de <strong>RCV Ventas, RCV Compras y F29</strong>. La certificación sólo se habilita cuando los campos mínimos están informados y no existen diferencias.</div>
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:10px"><div><label>Período piloto</label><select id="piloto-periodo" onchange="renderPilotoUI()">${opcionesPeriodo()}</select></div><button class="btn btn-g" onclick="guardarPilotoUI()">💾 Guardar referencias</button><button class="btn btn-i" onclick="certificarPilotoUI()">✅ Certificar período</button><button class="btn btn-s" onclick="invalidarPilotoUI()">↩ Invalidar certificado</button></div>
    <div id="piloto-contenido"></div>
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
  const ps=document.getElementById('piloto-periodo');if(ps&&per)ps.value=per;
  renderPilotoUI();
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


function renderPilotoUI(){
  const el=document.getElementById('piloto-contenido');if(!el)return;
  const periodo=document.getElementById('piloto-periodo')?.value||periodoActualUI();
  const c=compararPeriodo(periodo), est=estadoPiloto(), cert=est.periodos?.[periodo];
  const filas=c.filas.map(f=>`<tr><td class="tl">${f.nombre}</td><td><input data-piloto="${f.id}" type="number" class="money-input" step="1" value="${f.tiene?f.esperado:''}" placeholder="Referencia externa" style="width:150px"></td><td style="text-align:right">${Math.round(f.actual).toLocaleString('es-CL')}</td><td style="text-align:right">${f.tiene?Math.round(f.diferencia).toLocaleString('es-CL'):'—'}</td><td>${!f.tiene?'⚪':f.ok?'✅':'❌'}</td></tr>`).join('');
  el.innerHTML=`<div class="tw" style="max-height:430px;overflow:auto"><table><thead><tr><th class="tl">CONTROL</th><th>REFERENCIA EXTERNA</th><th>SISTEMA</th><th>DIFERENCIA</th><th></th></tr></thead><tbody>${filas}</tbody></table></div><div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="badge ${c.ok?'bg':'br'}">${c.ok?'SIN DIFERENCIAS':'PENDIENTE / CON DIFERENCIAS'}</span><span class="badge ${cert?.certificado?'bg':''}">${cert?.certificado?'CERTIFICADO':'NO CERTIFICADO'}</span><span style="font-size:11px;color:var(--mt)">Campos informados: ${c.informados}/15 · mínimos requeridos: Ventas docs/total, Compras docs/total, F29 538/537</span>${cert?.certificado?`<span style="font-size:11px;color:var(--mt)">Certificado ${new Date(cert.certificadoEn).toLocaleString('es-CL')} · ${cert.certificadoPor||''}</span>`:''}</div>`;
}
async function guardarPilotoUI(){
  const periodo=document.getElementById('piloto-periodo')?.value||periodoActualUI();
  const ref={};document.querySelectorAll('[data-piloto]').forEach(i=>{if(String(i.value).trim()!=='')ref[i.dataset.piloto]=pn(i.value);});
  try{const c=await guardarReferenciaPiloto(periodo,ref);toast(c.ok?'✅ Referencias guardadas · sin diferencias':'💾 Referencias guardadas · revisa las diferencias',c.ok?undefined:'e');renderIntegridad();}catch(e){toast('❌ '+e.message,'e');}
}
async function certificarPilotoUI(){
  const periodo=document.getElementById('piloto-periodo')?.value||periodoActualUI();
  const frase=prompt(`Certificar ${periodo} como período piloto conciliado contra RCV/F29.\n\nEscribe CERTIFICAR PILOTO:`,'');
  if(frase!=='CERTIFICAR PILOTO'){toast('Certificación cancelada');return;}
  const r=await certificarPiloto(periodo);
  if(!r.ok){toast(r.motivo==='solo-admin'?'🚫 Sólo administrador puede certificar':'🚫 No se puede certificar: faltan referencias mínimas o existen diferencias','e');renderPilotoUI();return;}
  toast(`✅ Período piloto ${periodo} certificado`);renderIntegridad();
}
async function invalidarPilotoUI(){
  const periodo=document.getElementById('piloto-periodo')?.value||periodoActualUI();
  const motivo=prompt(`Motivo para invalidar la certificación ${periodo} (mínimo 10 caracteres):`,'');
  if(motivo===null)return;const r=await invalidarPiloto(periodo,motivo);
  if(!r.ok){toast(r.motivo==='motivo-corto'?'⚠️ Motivo de mínimo 10 caracteres':'🚫 No se pudo invalidar el certificado','e');return;}
  toast(`↩ Certificación ${periodo} invalidada`);renderIntegridad();
}

async function migrarAsientosV2(){
  const r=await migrarDocumentosAAsientos();
  if(!r.ok){toast(r.motivo==='ejercicio-cerrado'?'🔒 No se puede migrar con el ejercicio cerrado':'❌ No se pudo completar la migración','e');return;}
  toast(`✅ Migración V2: ${r.creados} asientos creados, ${r.actualizados} actualizados`);renderIntegridad();
}
export {renderIntegridad,renderPilotoUI,guardarPilotoUI,certificarPilotoUI,invalidarPilotoUI,migrarAsientosV2,ejecutarRegresionContableUI,ejecutarPruebasProductivasUI,iniciarPruebaConcurrenciaUI,prepararPruebaConcurrenciaUI,escribirPruebaConcurrenciaUI,verificarPruebaConcurrenciaUI,ejecutarSimulacroRestauracionUI,crearSnapshotUI,verificarSnapshotUI,restaurarSnapshotUI};
