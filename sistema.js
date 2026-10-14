// sistema.js — Sección "Sistema y Respaldos" (Configuración)
//
// Reúne todo lo que antes vivía apretado en la barra superior: estado de
// sincronización, respaldos en la nube, exportar/importar Excel, carpeta de
// auto-guardado, tema y guardado manual. La barra superior quedó solo con el
// título, el último guardado y el usuario.
//
// Los indicadores (#fs-indicator, #db-indicator) siguen existiendo en el
// header oculto porque varios módulos escriben directo sobre ellos; acá se
// clonan sus contenidos para mostrarlos en la tarjeta de estado.

import {S, AUTH} from './state.js';
import {TEMAS} from './tema.js';
import {AG, OPCIONES_INTERVALO, etiquetaIntervalo} from './autoguardado.js';
import {DISPOSITIVO} from './dispositivo.js';
import {listarBorradoresLocales} from './salida.js';
import {resumenMonitorFS} from './monitorfs.js';

// Lee el texto que los módulos de sincronización dejaron en los indicadores
function estadoTexto(id,fallback){
  const el=document.getElementById(id);
  const t=(el&&el.textContent||'').trim();
  return t||fallback;
}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function nombreSeccionBorrador(s){
  const item=document.querySelector(`[data-s="${String(s||'').replace(/"/g,'')}"]`);
  return item?.textContent?.trim()||String(s||'Borrador');
}
function resumenBorradores(){
  const grupos=listarBorradoresLocales();
  if(!grupos.length)return `<div class="info-tip" style="font-size:11px">✅ No hay formularios incompletos en esta sesión.</div>`;
  return `<div class="draft-list">${grupos.map(g=>{
    const k=encodeURIComponent(g.clave);
    const fecha=g.ts?new Date(g.ts).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
    const campos=g.campos.slice(0,4).map(d=>esc(d.etiqueta||d.id)).join(' · ')+(g.campos.length>4?` · +${g.campos.length-4}`:'');
    return `<div class="draft-item">
      <div class="draft-main"><strong>📝 ${esc(nombreSeccionBorrador(g.seccion))}</strong><span>${g.campos.length} campo${g.campos.length===1?'':'s'} · ${esc(fecha)}</span><small>${campos}</small></div>
      <div class="draft-actions">
        <button class="btn btn-i" onclick="continuarBorradorLocal(decodeURIComponent('${k}'))">✏️ Editar</button>
        <button class="btn btn-g" onclick="if(confirm('¿Descartar este formulario incompleto de la sesión?')){descartarBorradorLocal(decodeURIComponent('${k}'));renderSistema()}">🗑 Descartar</button>
      </div>
    </div>`;
  }).join('')}</div>
  <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-g" onclick="if(confirm('¿Descartar TODOS los formularios incompletos de esta sesión?')){descartarTodosBorradoresLocales();renderSistema()}">🗑 Descartar todos</button></div>`;
}

// ── Consumo de Firestore (monitorfs.js) ──
const kb=b=>b==null?'—':(b>=1048576?(b/1048576).toFixed(2)+' MB':Math.max(1,Math.round(b/1024)).toLocaleString('es-CL')+' KB');
const num=n=>(+n||0).toLocaleString('es-CL');
function colorPct(p,r){return p>=r.umbralCritico?'var(--err)':(p>=r.umbralAviso?'var(--warn,#d29922)':'var(--ach)');}
function tarjetaConsumoFS(){
  const r=resumenMonitorFS();
  if(!r.instalado){
    return `<div class="card" style="margin-bottom:0;grid-column:1/-1">
      <div style="font-size:15px;font-weight:700">📊 Consumo de Firestore</div>
      <div class="info-tip" style="font-size:11px;margin-top:10px">El contador se activa al conectar con la nube. Ahora mismo la app está sin conexión a Firestore, así que no hay nada que medir.</div>
    </div>`;
  }
  const hora=r.inicio.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  const conTam=r.docs.filter(d=>d.bytes!=null).sort((a,b)=>b.bytes-a.bytes);
  const alertas=conTam.filter(d=>d.pct>=r.umbralAviso);
  const tam=conTam.slice(0,15).map(d=>{
    const p=Math.min(1,d.pct);const c=colorPct(d.pct,r);
    return `<tr>
      <td class="tl" style="font-size:11px;font-family:var(--mono)" title="${esc(d.ruta)}">${esc(d.clave)}${d.empresa?` <span style="color:var(--mt)">· ${esc(d.empresa)}</span>`:''}</td>
      <td style="font-size:11px;white-space:nowrap">${kb(d.bytes)}</td>
      <td style="width:38%"><div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;height:7px;background:var(--sf2);border-radius:4px;overflow:hidden"><div style="width:${(p*100).toFixed(1)}%;height:100%;background:${c}"></div></div>
        <span style="font-size:10px;font-family:var(--mono);color:${c};min-width:34px;text-align:right">${Math.round(d.pct*100)}%</span></div></td>
    </tr>`;}).join('');
  const activos=r.docs.filter(d=>d.lect||d.esc||d.cache).sort((a,b)=>(b.lect+b.esc)-(a.lect+a.esc)).slice(0,10).map(d=>`<tr>
      <td class="tl" style="font-size:11px;font-family:var(--mono)" title="${esc(d.ruta)}">${esc(d.clave)}${d.empresa?` <span style="color:var(--mt)">· ${esc(d.empresa)}</span>`:''}</td>
      <td style="font-size:11px">${num(d.lect)}</td><td style="font-size:11px">${num(d.esc)}</td><td style="font-size:11px;color:var(--mt)">${num(d.cache)}</td></tr>`).join('');
  const dias=r.dias.slice(0,7).map(d=>{
    const top=Object.entries(d.claves||{}).sort((a,b)=>(b[1].l+b[1].e)-(a[1].l+a[1].e))[0];
    const topTxt=top?`${esc(top[0].includes(':')?top[0].slice(top[0].indexOf(':')+1):top[0])} (${num(top[1].l+top[1].e)})`:'—';
    return `<tr><td class="tl" style="font-size:11px;font-family:var(--mono)">${esc(d.fecha)}</td><td style="font-size:11px">${num(d.lect)}</td><td style="font-size:11px">${num(d.esc)}</td><td style="font-size:11px;color:var(--mt)">${num(d.cache)}</td><td class="tl" style="font-size:10px;color:var(--mt)">${topTxt}</td></tr>`;
  }).join('');
  const aviso=alertas.length
    ? `<div style="background:${alertas.some(d=>d.pct>=r.umbralCritico)?'rgba(248,81,73,.08)':'rgba(210,153,34,.08)'};border:1px solid ${alertas.some(d=>d.pct>=r.umbralCritico)?'var(--err)':'var(--warn)'};border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
        ${alertas.map(d=>`${d.pct>=r.umbralCritico?'🚨':'⚠️'} <strong>${esc(d.clave)}</strong> ocupa ${kb(d.bytes)} (${Math.round(d.pct*100)}% del máximo de 1 MB por documento).`).join('<br>')}
        <div style="font-size:11px;color:var(--mt);margin-top:6px">Al llegar al 100% la nube rechaza el guardado. Hay que partir ese registro en bloques antes de que ocurra.</div>
      </div>`
    : (conTam.length?`<div class="info-tip" style="font-size:11px;margin-bottom:12px">✅ Ningún documento supera el ${Math.round(r.umbralAviso*100)}% del máximo de 1 MB. El más pesado es <strong>${esc(conTam[0].clave)}</strong> con ${kb(conTam[0].bytes)} (${Math.round(conTam[0].pct*100)}%).</div>`:'');
  const tabla=(cab,filas,vacio)=>filas
    ? `<div class="tw"><table style="font-size:11px"><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table></div>`
    : `<div style="font-size:11px;color:var(--mt);padding:8px 0">${vacio}</div>`;
  return `<div class="card" style="margin-bottom:0;grid-column:1/-1">
    <div style="font-size:15px;font-weight:700">📊 Consumo de Firestore</div>
    <div style="font-size:11px;color:var(--mt);margin-top:3px;margin-bottom:12px;line-height:1.5">
      Lo que esta app le pide a la nube desde este equipo. Firestore cobra por documento leído o escrito; las lecturas desde caché local no se cobran.
    </div>
    ${aviso}
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi"><div class="kpi-lbl">Lecturas nube · desde ${hora}</div><div class="kpi-val">${num(r.sesion.lect)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Escrituras · desde ${hora}</div><div class="kpi-val">${num(r.sesion.esc)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Lecturas desde caché</div><div class="kpi-val" style="color:var(--mt)">${num(r.sesion.cache)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Hoy en este equipo</div><div class="kpi-val" style="font-size:15px">${num(r.dias[0]&&r.dias[0].fecha===r.hoy?r.dias[0].lect:0)} L · ${num(r.dias[0]&&r.dias[0].fecha===r.hoy?r.dias[0].esc:0)} E</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--mt);text-transform:uppercase;margin-bottom:6px">Tamaño de documentos (máx. 1 MB)</div>
        ${tabla('<th class="tl">CLAVE</th><th>TAMAÑO</th><th>USO</th>',tam,'Aún no se ha leído ningún documento en esta sesión.')}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--mt);text-transform:uppercase;margin-bottom:6px">Más consultados en esta sesión</div>
        ${tabla('<th class="tl">CLAVE</th><th>LECT.</th><th>ESCR.</th><th>CACHÉ</th>',activos,'Sin actividad todavía.')}
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--mt);text-transform:uppercase;margin:14px 0 6px">Últimos días en este equipo</div>
    ${tabla('<th class="tl">DÍA</th><th>LECT.</th><th>ESCR.</th><th>CACHÉ</th><th class="tl">CLAVE MÁS USADA</th>',dias,'El historial diario empieza a llenarse desde hoy.')}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="renderSistema()">🔄 Actualizar</button>
      <button class="btn btn-g" onclick="if(confirm('¿Reiniciar el contador de esta sesión? El historial por día se conserva.')){reiniciarMonitorFS(false);renderSistema()}">↺ Reiniciar sesión</button>
      <button class="btn btn-g" onclick="if(confirm('¿Borrar también el historial de los últimos días de este equipo?')){reiniciarMonitorFS(true);renderSistema()}">🗑 Borrar historial</button>
    </div>
    <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
      Referencia: el plan gratuito de Firestore incluye 50.000 lecturas y 20.000 escrituras diarias por proyecto, sumando todos los usuarios y equipos. Cada guardado en la nube cuesta 1 lectura y 1 escritura por cada registro que cambia (ventas del año, asientos del año, etc.), porque antes de escribir se verifica que otro equipo no lo haya modificado. Los tamaños son aproximados y se actualizan cada vez que un documento se lee o se guarda.
    </div>
  </div>`;
}

function renderSistema(){
  const el=document.getElementById('sistema-content');if(!el)return;
  const guardado=estadoTexto('save-indicator','—');
  const nube=estadoTexto('fs-indicator','Sin información');
  const excel=estadoTexto('db-indicator','Sin carpeta vinculada');
  const temaActual=document.documentElement.getAttribute('data-theme')||'claro';

  const tarjeta=(icono,titulo,sub,cuerpo)=>`<div class="card" style="margin-bottom:0">
    <div style="font-size:15px;font-weight:700">${icono} ${titulo}</div>
    <div style="font-size:11px;color:var(--mt);margin-top:3px;margin-bottom:12px;line-height:1.5">${sub}</div>
    ${cuerpo}
  </div>`;

  el.innerHTML=`
    <div class="info-tip" style="margin-bottom:14px;font-size:11px;line-height:1.6">
      💡 La barra superior quedó solo con el título, el estado de guardado, el botón 💾 y tu usuario.
      Todo lo demás vive acá. La <strong>empresa activa</strong> y el <strong>ejercicio</strong> se cambian
      desde el bloque de arriba del menú lateral, y el buscador global sigue abriéndose con <strong>Ctrl+K</strong>
      desde cualquier sección.
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px">

      ${tarjeta('📡','Estado de sincronización',
        'Cómo está guardada tu información en este momento.',
        `<table><tbody>
          <tr><td class="tl" style="font-size:12px">Último guardado</td><td style="text-align:right;font-size:12px">${guardado}</td></tr>
          <tr><td class="tl" style="font-size:12px">Nube (Firestore)</td><td style="text-align:right;font-size:12px">${nube}</td></tr>
          <tr><td class="tl" style="font-size:12px">Carpeta Excel</td><td style="text-align:right;font-size:12px">${excel}</td></tr>
        </tbody></table>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-p" onclick="saveAll().then(renderSistema)">💾 Guardar todo ahora</button>
          <button class="btn btn-g" onclick="renderSistema()">🔄 Actualizar</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:8px">El sistema guarda solo cada vez que registras algo; este botón fuerza un guardado inmediato.</div>`)}

      ${tarjetaConsumoFS()}

      ${tarjeta('📝','Borradores de esta sesión',
        'Formularios iniciados pero todavía no confirmados. Se eliminan automáticamente al cerrar la app.',
        `${resumenBorradores()}
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.55">
          <strong>Editar</strong> vuelve al módulo y recupera los campos mientras esta sesión siga abierta. <strong>Cancelar</strong> en el formulario los descarta. Al cerrar la app se eliminan automáticamente.
        </div>`)}

      ${tarjeta('⏱','Guardado automático',
        'Sincroniza automáticamente sólo cambios que ya fueron confirmados. Los formularios incompletos no se guardan entre sesiones.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn ${AG.activo?'btn-p':'btn-g'}" onclick="setAutoguardado(${!AG.activo})">
            ${AG.activo?'✅ Activado':'⏸ Desactivado'}
          </button>
          <select onchange="setIntervaloAutoguardado(this.value)" ${AG.activo?'':'disabled'} style="width:auto">
            ${OPCIONES_INTERVALO.map(s=>`<option value="${s}" ${s===AG.segundos?'selected':''}>Cada ${etiquetaIntervalo(s)}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
          ${AG.activo
            ? `Cada <strong>${etiquetaIntervalo(AG.segundos)}</strong> sincroniza a Firebase sólo hechos ya confirmados${AG.ultimo?` · última sincronización automática a las ${AG.ultimo.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}`:''}.`
            : 'Con el automático apagado, el botón 💾 de la barra superior se pone <strong>amarillo</strong> cuando hay algo sin guardar.'}
          <br><strong>Importante:</strong> escribir en un formulario no lo contabiliza automáticamente. Hasta presionar Guardar/Registrar queda sólo en esta sesión. Al cerrar la app, los formularios incompletos se descartan.
        </div>`)}

      ${tarjeta('🔐','Inicio de sesión obligatorio',
        'Por seguridad, la sesión no queda guardada permanentemente en este equipo.',
        `<div class="info-tip" style="font-size:11px;line-height:1.6">
          🔒 <strong>Protección activa.</strong> Mientras esta ejecución de la app siga abierta, un simple refresco puede conservar la sesión.
          Al <strong>cerrar la app o el navegador y volver a abrirlo</strong>, se solicitará nuevamente email y contraseña.
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
          Esta política es obligatoria y no puede cambiarse desde la aplicación. Cerrar sesión manualmente sigue invalidando el acceso de inmediato.
        </div>`)}

      ${tarjeta('🖥','Este dispositivo',
        'Cada equipo donde abres la app tiene su propia identidad. Firma lo que guarda, para que dos equipos no se pisen sin que nadie se entere.',
        `<table><tbody>
          <tr><td class="tl" style="font-size:12px">Nombre</td><td style="text-align:right;font-size:12px"><strong>${DISPOSITIVO.nombre}</strong></td></tr>
          <tr><td class="tl" style="font-size:12px">Identificador</td><td style="text-align:right;font-size:11px;font-family:var(--mono);color:var(--mt)">${DISPOSITIVO.id}</td></tr>
        </tbody></table>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-g" onclick="renombrarEsteDispositivo()">✏️ Ponerle nombre</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px;line-height:1.6">
          Ponle un nombre reconocible —"PC oficina", "Celular Rodrigo"— y los avisos de
          cambios simultáneos se van a entender de una.
        </div>`)}

      ${tarjeta('☁️','Respaldo en la nube',
        'Copia de todos tus datos en Firestore. Útil para abrir el sistema en otro equipo o recuperar información.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-i" onclick="fsBackupToCloud()" title="Subir todos los datos locales a Firestore">☁️⬆ Subir a la nube</button>
          <button class="btn btn-i" onclick="fsRestoreFromCloud()" title="Descargar los datos desde Firestore a este dispositivo">☁️⬇ Descargar de la nube</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          <strong>Descargar</strong> reemplaza lo que tengas en este dispositivo con lo que hay en la nube. Úsalo al entrar desde un equipo nuevo.
        </div>`)}

      ${tarjeta('📊','Respaldo en Excel',
        'Descarga toda la base de datos en un archivo, o restaura desde uno previo.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-i" onclick="exportarExcelManual()">📥 Exportar Excel</button>
          <button class="btn btn-i" onclick="document.getElementById('imp-bd-file').click()">📤 Importar Excel</button>
        </div>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          El archivo incluye empresa, ventas, compras, honorarios, asientos, apertura, activos fijos, trabajadores, centros de costo, plan de cuentas y auxiliares.
        </div>`)}

      ${tarjeta('🔗','Auto-guardado en carpeta',
        'Vincula una carpeta del computador para que el respaldo Excel se escriba solo cada vez que guardas.',
        `<button class="btn btn-s" onclick="conectarBD()" id="btn-conectar-bd">🔗 Conectar carpeta</button>
        <div style="font-size:10px;color:var(--mt);margin-top:10px">
          Requiere un navegador con soporte para acceso a archivos (Chrome o Edge de escritorio). Si no está disponible, usa Exportar / Importar.
        </div>`)}

      ${tarjeta('🎨','Apariencia',
        'Tema de la interfaz. La preferencia queda guardada en este dispositivo.',
        `<div style="display:flex;gap:8px;flex-wrap:wrap">
          ${TEMAS.map(t=>`<button class="btn ${t.id===temaActual?'btn-p':'btn-g'}" onclick="aplicarTema('${t.id}');renderSistema()">${t.ico} ${t.nm}</button>`).join('')}
        </div>`)}

      ${tarjeta('🔎','Búsqueda global',
        'Encuentra documentos, asientos, cuentas y personas desde cualquier sección.',
        `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-i" onclick="abrirBusqueda()">🔍 Abrir buscador</button>
          <span style="font-size:11px;color:var(--mt)">Atajo: <strong style="font-family:var(--mono)">Ctrl + K</strong></span>
        </div>`)}

    </div>


    <div style="margin-top:16px;font-size:10px;color:var(--mt)">
      Sesión iniciada como <strong>${AUTH.user?.nombre||AUTH.user?.email||'—'}</strong>${AUTH.user?.rol?` · ${AUTH.user.rol}`:''} ·
      Empresa activa <strong>${S.empresa.nombre||'(sin nombre)'}</strong> · Ejercicio <strong>${S.empresa.anio}</strong>
    </div>`;
}

export {renderSistema};
