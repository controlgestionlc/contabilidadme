function toggleSidebar(){
  var sb=document.getElementById('sidebar');
  var abierto=sb.classList.toggle('open');
  var ov=document.getElementById('sidebarOverlay');
  if(abierto){
    if(!ov){
      ov=document.createElement('div');
      ov.id='sidebarOverlay';
      ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:150;';
      ov.onclick=function(){ sb.classList.remove('open'); ov.remove(); };
      document.body.appendChild(ov);
    }
  } else if(ov){ ov.remove(); }
}

/* ═══════════════ HELPERS ═══════════════ */
function fmtNum(n,d=2){
  if(n==null||isNaN(n))return '-';
  return Number(n).toLocaleString('es-CL',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function fmtMon(n){return '$\u00a0'+fmtNum(n,0)}
function fmtDate(iso){
  if(!iso)return '-';
  const d=new Date(iso);
  return d.toLocaleDateString('es-CL')+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
}
function fmtDateOnly(iso){if(!iso)return '-';return new Date(iso).toLocaleDateString('es-CL')}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}

async function nextCounter(prefix){
  const c=STATE.cache.config.counters||{key:'counters',ENT:0,SAL:0,TRA:0,AJU:0,COMP:0,DCC:0,TIE:0,MUE:0,VTA:0,CCC:0,TRB:0,MER:0,DEV:0,TIS:0,TOMA:0,OT:0};
  c[prefix]=(c[prefix]||0)+1;
  await dbPut('config',c);
  STATE.cache.config.counters=c;
  return prefix+'-'+String(c[prefix]).padStart(6,'0');
}
async function nextProductCode(){
  const c=STATE.cache.config.productCounter||{key:'productCounter',value:0};
  c.value++;
  await dbPut('config',c);
  STATE.cache.config.productCounter=c;
  return 'P'+String(c.value).padStart(6,'0');
}

function stockKey(prod,bod){return `${prod}|${bod}`}
function getStock(prod,bod){
  return STATE.cache.stock.find(s=>s.codigoInterno===prod&&s.bodegaId===bod)||null;
}
function getProduct(code){return STATE.cache.products.find(p=>p.codigoInterno===code)}
function getWarehouse(id){return STATE.cache.warehouses.find(w=>w.id===id)}
function getProvider(codigo){return (STATE.cache.providers||[]).find(p=>String(p.codigo)===String(codigo))}
function getStockTotal(prod){
  return STATE.cache.stock.filter(s=>s.codigoInterno===prod).reduce((sum,s)=>sum+(s.cantidad||0),0);
}

/* ═══════════════ MODALS ═══════════════ */
function showModal(title,bodyHTML,footerHTML='',size='md'){
  const bd=document.getElementById('modalBackdrop');
  bd.innerHTML=`<div class="modal modal-${size}">
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">${bodyHTML}</div>
    ${footerHTML?`<div class="modal-footer">${footerHTML}</div>`:''}
  </div>`;
  bd.classList.add('show');
}
function closeModal(){document.getElementById('modalBackdrop').classList.remove('show')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

function confirmDialog(title,msg,onConfirm,confirmText='Confirmar',danger=false){
  showModal(title,
    `<div style="font-size:14px;line-height:1.6">${msg}</div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn ${danger?'btn-danger':'btn-primary'}" id="confirmBtn">${confirmText}</button>`,
    'sm');
  document.getElementById('confirmBtn').onclick=()=>{closeModal();onConfirm()};
}

/* ═══════════════ USER MENU ═══════════════ */
function openUserMenu(){
  showModal('Mi cuenta',
    `<div class="form-grid">
      <div class="form-field span-2"><label>Nombre</label><input type="text" id="profNombre" value="${escapeHtml(STATE.user.nombre||'')}"></div>
      <div class="form-field"><label>Usuario</label><input type="text" value="${STATE.user.id}" readonly></div>
      <div class="form-field"><label>Rol</label><input type="text" value="${STATE.user.role}" readonly></div>
      <div class="form-field span-2"><label>Nueva contraseña</label><input type="password" id="profNewPass" placeholder="(dejar vacío para no cambiar)"><div class="hint">Mínimo 6 caracteres</div></div>
      <div class="form-field span-2"><label>Confirmar contraseña</label><input type="password" id="profNewPass2"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-secondary" onclick="logout();closeModal()">Cerrar sesión</button>
     <button class="btn btn-primary" onclick="saveProfile()">Guardar</button>`,
    'md');
}
async function saveProfile(){
  const nombre=document.getElementById('profNombre').value.trim();
  const p1=document.getElementById('profNewPass').value;
  const p2=document.getElementById('profNewPass2').value;
  if(p1){
    if(p1.length<6){toast('Contraseña muy corta','Mínimo 6 caracteres','error');return}
    if(p1!==p2){toast('No coincide','Las contraseñas no coinciden','error');return}
  }
  const u=await dbGet('users',STATE.user.id);
  u.nombre=nombre;
  if(p1)u.passwordHash=await sha256(p1);
  await dbPut('users',u);
  STATE.user=u;
  await reloadCache();
  document.getElementById('userChipName').textContent=u.nombre||u.id;
  document.getElementById('userAvatar').textContent=(u.nombre||u.id).charAt(0).toUpperCase();
  closeModal();
  toast('Perfil actualizado');
  audit('perfil.editar','Cambio de datos del perfil',u.id);
}

/* ═══════════════ BACKUP ═══════════════ */
/* ═══════════════ RESPALDO Y CARPETA PERSONALIZADA ═══════════════ */
let _backupDirHandle=null;  // FileSystemDirectoryHandle (en memoria)

/* Detectar si el navegador soporta File System Access API */
function fsaSupported(){
  return typeof window.showDirectoryPicker==='function';
}

/* Obtener handle de la carpeta configurada (si existe) y restaurar permiso.
   Si tienes carpeta configurada pero el handle se perdió (nueva sesión), pide
   re-seleccionarla con un mensaje claro. */
async function _getBackupDir(promptIfMissing=false){
  if(!fsaSupported())return null;
  // Caso 1: ya tenemos handle activo en memoria
  if(_backupDirHandle){
    const perm=await _backupDirHandle.queryPermission({mode:'readwrite'});
    if(perm==='granted')return _backupDirHandle;
    if(perm==='prompt'){
      try{
        const req=await _backupDirHandle.requestPermission({mode:'readwrite'});
        if(req==='granted')return _backupDirHandle;
      }catch(e){console.warn('Permission request failed:',e)}
    }
    _backupDirHandle=null;
  }
  // Caso 2: hay carpeta configurada en BD pero sin handle vivo (nueva sesión)
  const cfg=STATE.cache.config?.backupConfig||{};
  if(cfg.carpetaNombre&&promptIfMissing){
    // Pedir al usuario que vuelva a seleccionar la carpeta
    return await _solicitarReseleccionCarpeta(cfg.carpetaNombre);
  }
  return null;
}

/* Pedir al usuario que vuelva a seleccionar la carpeta configurada */
async function _solicitarReseleccionCarpeta(carpetaConfigurada){
  return new Promise((resolve)=>{
    showModal('Confirmar carpeta de respaldos',
      `<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">📁 Por seguridad, los navegadores piden confirmar el acceso a tu carpeta cada nueva sesión.</div>
      <div style="font-size:14px;line-height:1.6">
        Tu carpeta configurada es: <strong style="color:var(--gd)">${escapeHtml(carpetaConfigurada)}</strong>
      </div>
      <div style="margin-top:10px;color:var(--mu);font-size:13px">
        Al hacer clic en "Seleccionar carpeta", se abrirá el explorador. Elige la <strong>misma carpeta</strong> que usaste antes (la llamada "${escapeHtml(carpetaConfigurada)}").
      </div>`,
      `<button class="btn btn-secondary" id="btnCancelDir">Saltar (usar Descargas)</button>
       <button class="btn btn-primary" id="btnPickDir">📁 Seleccionar carpeta</button>`,
      'md');
    document.getElementById('btnCancelDir').onclick=()=>{closeModal();resolve(null)};
    document.getElementById('btnPickDir').onclick=async()=>{
      try{
        const handle=await window.showDirectoryPicker({mode:'readwrite',id:'sciBackupDir'});
        _backupDirHandle=handle;
        // Si el nombre cambió, actualizar la config
        const cfg=STATE.cache.config?.backupConfig||{key:'backupConfig'};
        cfg.carpetaNombre=handle.name;
        await dbPut('config',cfg);
        await reloadCache();
        closeModal();
        toast('Carpeta confirmada',`Respaldos se guardarán en: ${handle.name}`);
        resolve(handle);
      }catch(e){
        closeModal();
        if(e.name!=='AbortError')toast('Error',e.message,'error');
        resolve(null);
      }
    };
  });
}

/* Configurar (elegir) la carpeta de respaldos */
async function configurarCarpetaRespaldo(){
  if(!fsaSupported()){
    toast('No disponible','Tu navegador no soporta esta función. Usa Chrome, Edge o Brave en escritorio.','warning');
    return;
  }
  try{
    const handle=await window.showDirectoryPicker({mode:'readwrite',id:'sciBackupDir'});
    _backupDirHandle=handle;
    const cfg=STATE.cache.config?.backupConfig||{key:'backupConfig'};
    cfg.carpetaNombre=handle.name;
    cfg.configuradaEn=new Date().toISOString();
    await dbPut('config',cfg);
    await reloadCache();
    toast('Carpeta configurada',`Los respaldos se guardarán en: ${handle.name}`);
    if(STATE.page==='config')renderConfig(document.getElementById('mainContent'));
  }catch(e){
    if(e.name==='AbortError')return; // usuario canceló
    toast('Error al configurar carpeta',e.message,'error');
    console.error(e);
  }
}

/* Olvidar la carpeta configurada (volver a Descargas) */
async function olvidarCarpetaRespaldo(){
  _backupDirHandle=null;
  const cfg=STATE.cache.config?.backupConfig||{key:'backupConfig'};
  delete cfg.carpetaNombre;
  delete cfg.configuradaEn;
  await dbPut('config',cfg);
  await reloadCache();
  toast('Carpeta olvidada','Los respaldos volverán a la carpeta de Descargas');
  if(STATE.page==='config')renderConfig(document.getElementById('mainContent'));
}

/* Escribir un archivo en la carpeta configurada (sobrescribiendo si existe) */
async function _writeFileToDir(dirHandle,filename,content){
  const fileHandle=await dirHandle.getFileHandle(filename,{create:true});
  const writable=await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/* ═══════════════ RECÁLCULO DE STOCK DESDE MOVIMIENTOS ═══════════════
   Útil para corregir inconsistencias acumuladas: lee todos los movimientos
   vigentes (no anulados) en orden cronológico y reconstruye stock + lotes
   desde cero. NO afecta los movimientos en sí, solo los saldos consolidados.
*/
async function recalcularStock(){
  if(STATE.user.role!=='admin'){toast('Sin permiso','Solo el admin puede recalcular','error');return}
  const mov=STATE.cache.movements.filter(m=>!m.anulado);
  const total=mov.length;
  confirmDialog('Recalcular stock desde movimientos',
    `<div>Esta acción reconstruirá los saldos de stock y lotes desde cero, leyendo todos los <strong>${total} movimientos vigentes</strong> en orden cronológico.</div>
     <div class="alert alert-warning" style="margin-top:10px;font-size:13px">
       <strong>Antes de continuar:</strong>
       <ul style="margin:6px 0 0 18px;padding:0">
         <li>Descarga un respaldo si no tienes uno reciente.</li>
         <li>El proceso puede tomar algunos segundos según la cantidad de movimientos.</li>
         <li>Los movimientos no se modifican, solo se recalculan los saldos.</li>
       </ul>
     </div>
     <div style="margin-top:10px;color:var(--mu);font-size:13px">¿Continuar con el recálculo?</div>`,
    async()=>{
      closeModal();
      showLoading('Recalculando stock... Esto puede tomar unos segundos.');
      // Seguridad: nunca dejar el overlay bloqueando más de 60s
      const _guard=setTimeout(()=>{ try{ hideLoading(); }catch(e){} }, 60000);
      try{
        const resultado=await _ejecutarRecalculoStock();
        toast('Stock recalculado',`${resultado.movProcesados} movimientos procesados, ${resultado.stockEntries} saldos actualizados${resultado.stockHuerfanos?`, ${resultado.stockHuerfanos} saldo(s) huérfano(s) eliminado(s)`:''}`);
        await audit('mantenimiento.recalcularStock',`Recálculo manual: ${resultado.movProcesados} movimientos vigentes`,STATE.user.id);
        if(STATE.page==='config')renderConfig(document.getElementById('mainContent'));
      }catch(e){
        toast('Error',e.message,'error');
        console.error('Error recalculando stock:',e);
      }finally{
        clearTimeout(_guard);
        hideLoading();
      }
    },'Sí, recalcular');
}

async function _ejecutarRecalculoStock(){
  // 0. Snapshot de los lotes existentes ANTES de limpiar. Necesario para
  //    sepultar (tombstone) en la nube los registros que ya no correspondan:
  //    'lots' es un store ACUMULATIVO que se fusiona por id, así que un simple
  //    dbClear local NO basta — sin lápida, la nube los reinyecta al sincronizar.
  const lotesPrevios=await dbAll('lots');

  // 1. Borrar stock y lotes actuales (local)
  await dbClear('stock');
  await dbClear('lots');

  // 2. Estructuras temporales en memoria (más rápido que ir a IndexedDB en cada movimiento)
  const stockMap={};   // key=cod|bod → {cantidad, costoPromedio, codigoInterno, bodegaId, key}
  const lotMap={};     // key=cod|bod|lote → {id, cantidad, costo, fechaVenc, codigoInterno, bodegaId, lote}
  const ensureStock=(cod,bod)=>{
    const k=stockKey(cod,bod);
    if(!stockMap[k])stockMap[k]={key:k,codigoInterno:cod,bodegaId:bod,cantidad:0,costoPromedio:0};
    return stockMap[k];
  };
  const lotKey=(cod,bod,lote)=>`${cod}|${bod}|${lote||''}`;
  const ensureLot=(cod,bod,lote,fechaVenc)=>{
    const k=lotKey(cod,bod,lote);
    // ID DETERMINÍSTICO (clave real cod|bod|lote) en vez de uid() aleatorio.
    // Así cada recálculo reescribe el MISMO registro en lugar de crear uno
    // nuevo; la fusión acumulativa de la nube colapsa por id en vez de
    // multiplicar. Esto hace el recálculo idempotente.
    if(!lotMap[k])lotMap[k]={id:'lot|'+k,codigoInterno:cod,bodegaId:bod,lote:lote||'',fechaVenc:fechaVenc||'',cantidad:0,costo:0};
    return lotMap[k];
  };

  // 3. Procesar movimientos vigentes en orden cronológico (fecha asc, luego numero asc)
  //    Se leen SIEMPRE desde IndexedDB: si el llamador acaba de guardar un
  //    movimiento y no refrescó el cache, el recálculo lo omitía y el saldo
  //    no bajaba hasta reabrir la app (bug de consumos de combustible, v142).
  try{ STATE.cache.movements=await dbAll('movements'); }catch(e){}
  const mov=STATE.cache.movements.filter(m=>!m.anulado).slice().sort((a,b)=>{
    const fa=(a.fecha||'')+(a.creado||'')+(a.numero||'');
    const fb=(b.fecha||'')+(b.creado||'')+(b.numero||'');
    return fa.localeCompare(fb);
  });

  let procesados=0;
  for(const m of mov){
    if(!m.detalles||m.detalles.length===0)continue;
    const isTraspaso=m.tipoMovimiento==='TRASPASO BODEGA'&&m.bodegaDestinoId;
    for(const d of m.detalles){
      const p=getProduct(d.codigoInterno);
      const cant=Number(d.cantidad)||0;
      const costo=Number(d.costo)||0;
      if(isTraspaso){
        // Salida del origen
        const stOrig=ensureStock(d.codigoInterno,m.bodegaId);
        stOrig.cantidad-=cant;
        if(stOrig.cantidad<0)stOrig.cantidad=0;
        // PPP origen no cambia
        // Entrada al destino con costo del origen
        const stDest=ensureStock(d.codigoInterno,m.bodegaDestinoId);
        const valActDest=stDest.cantidad*stDest.costoPromedio;
        const newCantDest=stDest.cantidad+cant;
        const newValDest=valActDest+cant*costo;
        stDest.cantidad=newCantDest;
        stDest.costoPromedio=newCantDest>0?(newValDest/newCantDest):costo;
        // Lotes
        if(p?.manejaAtributos&&d.lote){
          const lotOrig=ensureLot(d.codigoInterno,m.bodegaId,d.lote,d.fechaVenc);
          lotOrig.cantidad-=cant;
          if(lotOrig.cantidad<0)lotOrig.cantidad=0;
          const lotDest=ensureLot(d.codigoInterno,m.bodegaDestinoId,d.lote,d.fechaVenc);
          const va=lotDest.cantidad*lotDest.costo;
          lotDest.cantidad+=cant;
          lotDest.costo=lotDest.cantidad>0?(va+cant*costo)/lotDest.cantidad:costo;
          if(d.fechaVenc&&!lotDest.fechaVenc)lotDest.fechaVenc=d.fechaVenc;
        }
      }else if(m.tipo==='ENT'){
        const st=ensureStock(d.codigoInterno,m.bodegaId);
        const valAct=st.cantidad*st.costoPromedio;
        const newCant=st.cantidad+cant;
        const newVal=valAct+cant*costo;
        st.cantidad=newCant;
        st.costoPromedio=newCant>0?(newVal/newCant):costo;
        if(p?.manejaAtributos&&d.lote){
          const lot=ensureLot(d.codigoInterno,m.bodegaId,d.lote,d.fechaVenc);
          const va=lot.cantidad*lot.costo;
          lot.cantidad+=cant;
          lot.costo=lot.cantidad>0?(va+cant*costo)/lot.cantidad:costo;
          if(d.fechaVenc&&!lot.fechaVenc)lot.fechaVenc=d.fechaVenc;
        }
      }else if(m.tipo==='SAL'){
        const st=ensureStock(d.codigoInterno,m.bodegaId);
        st.cantidad-=cant;
        if(st.cantidad<0)st.cantidad=0;
        // PPP no cambia en salidas
        if(p?.manejaAtributos&&d.lote){
          const lot=ensureLot(d.codigoInterno,m.bodegaId,d.lote,d.fechaVenc);
          lot.cantidad-=cant;
          if(lot.cantidad<0)lot.cantidad=0;
        }
      }
    }
    procesados++;
  }

  // 4. Persistir resultados
  // 4a. Purgar saldos HUÉRFANOS: claves que existen en el store pero que los
  // movimientos vigentes ya no justifican. Sin esto, un registro corrupto
  // (ej. snapshot vacío/erróneo sincronizado desde otro dispositivo) sobrevive
  // al recálculo y la detección de inconsistencias nunca deja de alertar.
  let stockHuerfanos=0;
  try{
    const actuales=await dbAll('stock');
    for(const s of (actuales||[])){
      if(!Object.prototype.hasOwnProperty.call(stockMap, s.key)){
        await dbDel('stock', s.key);
        stockHuerfanos++;
      }
    }
  }catch(e){ console.error('Purga de stock huérfano:', e); }
  let stockEntries=0;
  for(const k of Object.keys(stockMap)){
    const st=stockMap[k];
    // Solo guardar si tiene saldo o costo (evitar registros vacíos)
    await dbPut('stock',st);
    stockEntries++;
  }
  let lotEntries=0;
  const idsNuevos=new Set();
  for(const k of Object.keys(lotMap)){
    const lot=lotMap[k];
    await dbPut('lots',lot);
    idsNuevos.add(lot.id);
    lotEntries++;
  }

  // 5. Sepultar (tombstone) en la nube los lotes previos cuyo id ya no
  //    corresponde a la reconstrucción. 'lots' es un store ACUMULATIVO que se
  //    fusiona por id; sin lápida, los registros viejos (ids aleatorios de
  //    versiones anteriores del recálculo) se reinyectan desde la nube al
  //    sincronizar y el saldo de lotes se infla sin control. Se hace en lote
  //    (un solo dbPut a config) para no spamear la sincronización.
  let lotesSepultados=0;
  try{
    const huerfanos=(lotesPrevios||[]).filter(lp=>lp&&lp.id!==undefined&&!idsNuevos.has(lp.id));
    if(huerfanos.length){
      const tombs=_sciGetTombstones();
      if(!tombs.lots)tombs.lots={};
      const ahora=Date.now();
      for(const lp of huerfanos){ tombs.lots[String(lp.id)]=ahora; lotesSepultados++; }
      const tombObj={key:_SCI_TOMB_KEY,tombs:tombs,_updatedAt:new Date().toISOString()};
      STATE.cache.config=STATE.cache.config||{};
      STATE.cache.config[_SCI_TOMB_KEY]=tombObj;
      await dbPut('config',tombObj); // dbPut sincroniza config (con las lápidas) a la nube
    }
  }catch(e){ console.error('Error al sepultar lotes huérfanos en recálculo:',e); }

  await reloadCache();
  return {movProcesados:procesados,stockEntries,lotEntries,lotesSepultados,stockHuerfanos};
}

/* ═══════════════ DETECCIÓN DE INCONSISTENCIAS DE STOCK ═══════════════
   Compara los saldos actuales contra los que deberían existir según los
   movimientos vigentes. Devuelve {ok, diferencias} sin modificar nada.
*/
async function detectarInconsistenciaStock(){
  const stockActual={};
  STATE.cache.stock.forEach(s=>{stockActual[s.key]={cant:Number(s.cantidad)||0,costo:Number(s.costoPromedio)||0}});

  // Calcular stock esperado
  const stockEsp={};
  const ensureStock=(cod,bod)=>{
    const k=stockKey(cod,bod);
    if(!stockEsp[k])stockEsp[k]={cantidad:0,costoPromedio:0};
    return stockEsp[k];
  };
  const mov=STATE.cache.movements.filter(m=>!m.anulado).slice().sort((a,b)=>{
    const fa=(a.fecha||'')+(a.creado||'')+(a.numero||'');
    const fb=(b.fecha||'')+(b.creado||'')+(b.numero||'');
    return fa.localeCompare(fb);
  });
  for(const m of mov){
    if(!m.detalles)continue;
    const isTraspaso=m.tipoMovimiento==='TRASPASO BODEGA'&&m.bodegaDestinoId;
    for(const d of m.detalles){
      const cant=Number(d.cantidad)||0;
      const costo=Number(d.costo)||0;
      if(isTraspaso){
        const stOrig=ensureStock(d.codigoInterno,m.bodegaId);
        stOrig.cantidad-=cant;if(stOrig.cantidad<0)stOrig.cantidad=0;
        const stDest=ensureStock(d.codigoInterno,m.bodegaDestinoId);
        const valActDest=stDest.cantidad*stDest.costoPromedio;
        const newCantDest=stDest.cantidad+cant;
        const newValDest=valActDest+cant*costo;
        stDest.cantidad=newCantDest;
        stDest.costoPromedio=newCantDest>0?(newValDest/newCantDest):costo;
      }else if(m.tipo==='ENT'){
        const st=ensureStock(d.codigoInterno,m.bodegaId);
        const valAct=st.cantidad*st.costoPromedio;
        const newCant=st.cantidad+cant;
        const newVal=valAct+cant*costo;
        st.cantidad=newCant;
        st.costoPromedio=newCant>0?(newVal/newCant):costo;
      }else if(m.tipo==='SAL'){
        const st=ensureStock(d.codigoInterno,m.bodegaId);
        st.cantidad-=cant;if(st.cantidad<0)st.cantidad=0;
      }
    }
  }

  // Comparar
  const diferencias=[];
  const todasKeys=new Set([...Object.keys(stockActual),...Object.keys(stockEsp)]);
  for(const k of todasKeys){
    const ac=stockActual[k]||{cant:0,costo:0};
    const esp=stockEsp[k]||{cantidad:0,costoPromedio:0};
    const difCant=Math.abs(ac.cant-esp.cantidad);
    if(difCant>0.001){
      diferencias.push({key:k,cantActual:ac.cant,cantEsperada:esp.cantidad,diferencia:ac.cant-esp.cantidad});
    }
  }
  return {ok:diferencias.length===0,diferencias,total:Object.keys(stockEsp).length};
}

/* ═══════════════ RESPALDO CONSOLIDADO (SCI + Cuaderno + Presupuesto) ═══════════════
   Un único archivo que respalda TODO el sistema. Reemplaza los respaldos
   separados. Recuerda al administrador cada 10 días. */
const BACKUP_INTERVALO_DIAS = 10;
const BACKUP_KEY = 'SCI_ULTIMO_RESPALDO';

function confirmRestoreConsolidado(file){
  confirmDialog('Restaurar respaldo completo',
    '⚠ Esto REEMPLAZARÁ todos los datos actuales (Inventario, Cuaderno, Presupuesto, Huerto) con los del archivo.\n\nSe recomienda generar un respaldo del estado actual antes de continuar.\n\n¿Restaurar de todas formas?',
    function(){ importBackupConsolidado(file); },'Restaurar', true);
}
try{ window.confirmRestoreConsolidado=confirmRestoreConsolidado; }catch(e){}

async function exportBackupConsolidado(silent=false){
  try{
    if(!silent) showLoading('Generando respaldo consolidado...');
    // 1) Todos los stores de IndexedDB (SCI + huerto + combustible)
    const sci={};
    for(const [name] of (typeof STORES!=='undefined'?STORES:[])){
      try{ sci[name]=await dbAll(name); }catch(e){ sci[name]=[]; }
    }
    // 2) Cuaderno de campo (estado global S.*)
    let cuaderno=null;
    try{ if(typeof S!=='undefined'){ cuaderno={panos:S.panos,registros:S.registros,productos:S.productos,ordenes:S.ordenes,confirmaciones:S.confirmaciones,oCounter:S.oCounter,cfFolioSeq:S.cfFolioSeq,indicadores:S.indicadores}; } }catch(e){}
    // 3) Presupuesto (dataset serializado)
    let presupuesto=null;
    try{ if(window.PZ && typeof window.PZ.serializeDataset==='function'){ presupuesto=window.PZ.serializeDataset(); } }catch(e){}

    const data={
      version:3, tipo:'RESPALDO_CONSOLIDADO_SCI',
      fecha:new Date().toISOString(),
      generadoPor:(STATE.user?.nombre||STATE.user?.id||'-'),
      sci, cuaderno, presupuesto
    };
    const json=JSON.stringify(data);
    const fname='SCI_respaldo_completo_'+new Date().toISOString().slice(0,10)+'.json';

    // 1) Si hay carpeta de respaldo configurada (ej. carpeta compartida del servidor),
    //    guardar ahí automáticamente: un archivo "actual" y otro con fecha (histórico).
    let guardadoEnCarpeta=false;
    try{
      const dir=await _getBackupDir(false);
      if(dir){
        await _writeFileToDir(dir,'SCI_respaldo_actual.json',json);
        await _writeFileToDir(dir,fname,json);
        guardadoEnCarpeta=true;
      }
    }catch(e){ console.warn('No se pudo escribir en la carpeta de respaldo:',e); }

    // 2) Si no hay carpeta configurada, descargar el archivo.
    if(!guardadoEnCarpeta){
      const blob=new Blob([json],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=fname; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    if(!silent){
      hideLoading();
      toast('Respaldo generado',
        (guardadoEnCarpeta ? 'Guardado en la carpeta de respaldo del servidor' : `Descargado: ${fname}`)+
        ` (${Math.round(json.length/1024)} KB)`,'success');
    }
    refreshBackupAlert();
    return true;
  }catch(e){
    if(!silent) hideLoading();
    toast('Error en respaldo',e.message,'error');
    console.error('Respaldo consolidado:',e);
    return false;
  }
}
try{ window.exportBackupConsolidado=exportBackupConsolidado; }catch(e){}

function diasDesdeRespaldo(){
  const last=localStorage.getItem(BACKUP_KEY);
  if(!last) return null;
  return Math.floor((Date.now()-new Date(last).getTime())/86400000);
}

// Verifica si el admin debe respaldar (cada 10 días) y avisa.
function verificarRecordatorioRespaldo(){
  if(!STATE.user || STATE.user.role!=='admin') return;
  const dias=diasDesdeRespaldo();
  if(dias===null){
    setTimeout(()=>toast('📦 Respaldo recomendado','Aún no has generado un respaldo. Ve a Configuración → Respaldo del sistema.','warning'),2500);
  } else if(dias>=BACKUP_INTERVALO_DIAS){
    setTimeout(()=>toast('📦 Respaldo pendiente',`Han pasado ${dias} días desde el último respaldo. Se recomienda generar uno nuevo.`,'warning'),2500);
  }
}
try{ window.verificarRecordatorioRespaldo=verificarRecordatorioRespaldo; }catch(e){}

async function importBackupConsolidado(file){
  try{
    showLoading('Restaurando respaldo consolidado...');
    const txt=await file.text();
    const data=JSON.parse(txt);
    if(data.tipo!=='RESPALDO_CONSOLIDADO_SCI'){ hideLoading(); toast('Archivo inválido','No es un respaldo consolidado del sistema','error'); return; }
    // 1) Restaurar stores SCI
    if(data.sci){
      for(const name of Object.keys(data.sci)){
        try{ await dbClear(name); }catch(e){}
        for(const rec of (data.sci[name]||[])){ try{ await dbPut(name,rec); }catch(e){} }
      }
    }
    // 2) Cuaderno
    try{
      if(data.cuaderno && typeof S!=='undefined'){
        Object.assign(S, data.cuaderno);
        if(typeof save==='function') save();
        if(typeof fbPush==='function') fbPush(true);
      }
    }catch(e){ console.warn('cuaderno restore:',e); }
    // 3) Presupuesto
    try{
      if(data.presupuesto && window.PZ && typeof window.PZ.loadDataset==='function'){
        window.PZ.loadDataset(data.presupuesto);
        if(typeof window.PZ.fbPush==='function') window.PZ.fbPush(true);
      }
    }catch(e){ console.warn('presupuesto restore:',e); }
    hideLoading();
    toast('Respaldo restaurado','El sistema se recargará para aplicar los cambios','success');
    setTimeout(()=>location.reload(),1500);
  }catch(e){
    hideLoading();
    toast('Error al restaurar',e.message,'error');
    console.error('Import consolidado:',e);
  }
}
try{ window.importBackupConsolidado=importBackupConsolidado; }catch(e){}

async function exportBackup(silent=false){
  const data={
    version:1,
    fecha:new Date().toISOString(),
    users:await dbAll('users'),
    products:await dbAll('products'),
    warehouses:await dbAll('warehouses'),
    groups:await dbAll('groups'),
    productTypes:await dbAll('productTypes'),
    providers:await dbAll('providers'),
    customers:await dbAll('customers'),
    costCenters:await dbAll('costCenters'),
    inventoryCounts:await dbAll('inventoryCounts'),
    movements:await dbAll('movements'),
    stock:await dbAll('stock'),
    lots:await dbAll('lots'),
    audit:await dbAll('audit'),
    config:await dbAll('config')
  };
  const json=JSON.stringify(data,null,2);
  const now=new Date();
  const fechaStr=now.toISOString().slice(0,10);
  const fechaHora=now.toISOString().slice(11,19).replace(/:/g,'-');

  /* Modo MIXTO:
     - Siempre se actualiza "SCI_backup_actual.json" (sobrescribe el anterior).
     - Adicionalmente, si pasaron >=24h desde el último respaldo diario, o nunca hubo,
       se crea un archivo histórico "SCI_backup_diario_YYYY-MM-DD.json".
  */
  const cfg=STATE.cache.config?.backupConfig||{};
  const ultDiario=cfg.ultimoDiario?new Date(cfg.ultimoDiario):null;
  const necesitaDiario=!ultDiario||(Date.now()-ultDiario.getTime())>=20*3600000; // 20+ horas

  let savedToFolder=false;
  let folderName='';
  let archivosGuardados=[];

  /* Intento 1: si hay carpeta configurada, escribir directo ahí.
     Si la carpeta está configurada pero el handle se perdió (nueva sesión),
     pedir al usuario que la vuelva a seleccionar. */
  const dir=await _getBackupDir(!silent);
  if(dir){
    try{
      await _writeFileToDir(dir,'SCI_backup_actual.json',json);
      archivosGuardados.push('SCI_backup_actual.json');
      if(necesitaDiario){
        const nombreDiario=`SCI_backup_diario_${fechaStr}.json`;
        await _writeFileToDir(dir,nombreDiario,json);
        archivosGuardados.push(nombreDiario);
      }
      savedToFolder=true;
      folderName=dir.name;
    }catch(e){
      console.error('Error escribiendo en carpeta configurada:',e);
      toast('Carpeta inaccesible','Cayendo a descarga normal. Reconfigura la carpeta si persiste.','warning');
    }
  }

  /* Intento 2 (fallback): descargar a la carpeta de Descargas del navegador */
  if(!savedToFolder){
    const blob=new Blob([json],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    // Siempre el "actual"
    const aA=document.createElement('a');
    aA.href=url;aA.download='SCI_backup_actual.json';aA.click();
    archivosGuardados.push('SCI_backup_actual.json');
    if(necesitaDiario){
      // Esperar un instante para evitar que el navegador colapse las dos descargas
      await new Promise(r=>setTimeout(r,400));
      const aD=document.createElement('a');
      const nombreDiario=silent?`SCI_backup_diario_${fechaStr}_${fechaHora}.json`:`SCI_backup_diario_${fechaStr}.json`;
      aD.href=url;aD.download=nombreDiario;aD.click();
      archivosGuardados.push(nombreDiario);
    }
    URL.revokeObjectURL(url);
  }

  /* Persistir metadatos */
  const newCfg={
    key:'backupConfig',
    ...(cfg||{}),
    ultimoBackup:now.toISOString()
  };
  if(necesitaDiario)newCfg.ultimoDiario=now.toISOString();
  await dbPut('config',newCfg);
  await dbPut('config',{key:'lastBackup',fecha:now.toISOString(),autoSilent:!!silent});
  await reloadCache();

  if(!silent){
    const lugar=savedToFolder?`Carpeta: ${folderName}`:'Carpeta de Descargas';
    const detalle=archivosGuardados.length===2?
      `Actualizado: actual + diario (${fechaStr})`:
      `Actualizado: archivo actual`;
    toast('Respaldo guardado',`${detalle}. ${lugar}`);
    refreshBackupAlert();
  }
}

/* ── Días desde último backup ── */
function getDaysSinceBackup(){
  const lb=STATE.cache.config?.lastBackup;
  if(!lb||!lb.fecha)return null;
  const diff=Date.now()-new Date(lb.fecha).getTime();
  return Math.floor(diff/(86400000));
}
function getLastBackupDate(){
  const lb=STATE.cache.config?.lastBackup;
  if(!lb||!lb.fecha)return null;
  return new Date(lb.fecha);
}

/* ── Estado de respaldo en la barra superior (discreto, sin alarmas) ── */
function refreshBackupAlert(){
  const el=document.getElementById('backupAlert');
  if(!el)return;
  // Con sincronización en la nube, ocultamos la alerta alarmante de respaldo.
  el.style.display='none';
}
async function importBackup(file){
  const text=await file.text();
  const data=JSON.parse(text);
  if(!data.version)throw new Error('Archivo no válido');
  // Usar dbPutLocal para no disparar una subida por cada registro
  for(const s of STORES.map(x=>x[0])){
    if(data[s]){
      await dbClear(s);
      for(const r of data[s])await dbPutLocal(s,r);
    }
  }
  await reloadCache();
  // Subir todo a la nube UNA SOLA VEZ al final (si Firebase está disponible)
  if(typeof SCIFB!=='undefined' && SCIFB.ready){
    try{ await sciFbPush(true); toast('Respaldo restaurado','Subido a la nube. Recargando...'); }
    catch(e){ toast('Respaldo restaurado','Recargando...'); }
  } else {
    toast('Respaldo restaurado','Recargando...');
  }
  setTimeout(()=>navigate(STATE.page),500);
}

/* ═══════════════ PAGE: DASHBOARD ═══════════════ */
/* Desde el desglose por tipo de la tarjeta de valor: abre la página Stock ya
   filtrada por ese tipo. "Sin clasificar" no es un tipo real del catálogo, así
   que en ese caso se limpia el filtro y se avisa, en vez de dejar la tabla
   vacía sin explicación. */
function verStockPorTipo(tipo){
  if(typeof stockFilter==='undefined') return;
  // navigate() no valida permisos, así que se comprueba aquí: un usuario sin
  // acceso a Stock vería la página igual al tocar la tarjeta.
  if(typeof can==='function' && !can('stock.ver')){
    if(typeof toast==='function') toast('Sin acceso','No tiene permiso para ver el stock por bodega','error');
    return;
  }
  var sinClasificar = (tipo==='Sin clasificar');
  stockFilter.tipo        = sinClasificar ? '' : (tipo||'');
  stockFilter.bodega      = '';
  stockFilter.grupo       = '';
  stockFilter.subgrupo    = '';
  stockFilter.search      = '';
  stockFilter.soloConSaldo= true;
  navigate('stock');
  if(sinClasificar && typeof toast==='function'){
    toast('Sin clasificar','Son productos sin tipo asignado en su ficha. Se muestra el stock completo.','info');
  }
}
try{ window.verStockPorTipo=verStockPorTipo; }catch(e){}

/* Detalle del valor por tipo de producto en una ventana emergente (sin salir
   del dashboard). Muestra los productos inventariables de ese tipo con su
   stock total y valor. */
function verDetalleTipoModal(tipo){
  if(typeof showModal!=='function') { verStockPorTipo(tipo); return; }
  var sinClasif = (tipo==='Sin clasificar');
  var acc={};
  (STATE.cache.stock||[]).forEach(function(x){
    var p=getProduct(x.codigoInterno);
    if(p && p.inventariable===false) return;                 // servicios/no inventariables fuera
    var t=(p && p.tipoProducto) ? p.tipoProducto : 'Sin clasificar';
    if(sinClasif){ if(p && p.tipoProducto) return; } else if(t!==tipo) return;
    var val=(x.cantidad*x.costoPromedio)||0;
    if(!acc[x.codigoInterno]) acc[x.codigoInterno]={desc:(p?p.descripcion:x.codigoInterno), um:(p?p.unidadMedida:''), cant:0, val:0};
    acc[x.codigoInterno].cant+=(x.cantidad||0);
    acc[x.codigoInterno].val+=val;
  });
  var rows=Object.keys(acc).map(function(k){ var o=acc[k]; o.cod=k; return o; })
    .filter(function(r){ return r.val!==0 || r.cant!==0; })
    .sort(function(a,b){ return b.val-a.val; });
  var total=rows.reduce(function(s,r){ return s+r.val; },0);
  var body = rows.length
    ? '<div style="max-height:60vh;overflow:auto;border:1px solid var(--bo);border-radius:6px"><table class="data" style="margin:0;width:100%">'+
        '<thead><tr><th>Producto</th><th class="num">Stock</th><th class="num">Valor</th><th class="num">%</th></tr></thead><tbody>'+
        rows.map(function(r){ var pct=total>0?(r.val/total*100):0; return '<tr><td><strong>'+escapeHtml(r.cod)+'</strong> · '+escapeHtml(r.desc)+'</td>'+
          '<td class="num">'+fmtNum(r.cant,2)+(r.um?(' '+escapeHtml(r.um)):'')+'</td>'+
          '<td class="num">'+fmtMon(r.val)+'</td>'+
          '<td class="num" style="color:var(--mu)">'+pct.toFixed(1)+'%</td></tr>'; }).join('')+
        '</tbody><tfoot><tr style="background:var(--gp);font-weight:700"><td style="text-align:right">Total ('+rows.length+' producto(s))</td><td></td><td class="num">'+fmtMon(total)+'</td><td></td></tr></tfoot>'+
      '</table></div>'
    : '<div style="padding:22px;text-align:center;color:var(--mu)">Sin productos valorizados en este tipo.</div>';
  var argEsc=String(tipo).replace(/'/g,"\\'");
  var footer='<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>'+
    ((typeof can==='function' && can('stock.ver'))?'<button class="btn btn-primary" onclick="closeModal();verStockPorTipo(\''+argEsc+'\')">Ver en Stock ↗</button>':'');
  showModal('Detalle · '+escapeHtml(tipo), body, footer, 'lg');
}
try{ window.verDetalleTipoModal=verDetalleTipoModal; }catch(e){}

// Detalle de productos bajo stock mínimo (desde la tarjeta del dashboard)
function verStockBajo(){
  var filas=[];
  STATE.cache.products.forEach(function(p){
    var min=p.stockMinimo||0;
    if(min<=0 || p.inventariable===false) return;
    var regs=STATE.cache.stock.filter(function(s){ return s.codigoInterno===p.codigoInterno; });
    var totalCant=regs.reduce(function(a,s){ return a+(s.cantidad||0); },0);
    if(totalCant<=min){
      filas.push({prod:p, total:totalCant, min:min, regs:regs});
    }
  });
  if(!filas.length){ toast('Sin alertas','No hay productos bajo el stock mínimo','success'); return; }
  // Ordenar: primero los más críticos (en 0), luego por menor cobertura
  filas.sort(function(a,b){ return (a.total/a.min) - (b.total/b.min); });
  var body = '<div style="font-size:13px;color:var(--mu);margin-bottom:12px">'+filas.length+' producto(s) en o por debajo de su stock mínimo. Toque uno para ver su ficha.</div>';
  body += '<div class="table-wrap"><table class="data"><thead><tr><th>Producto</th><th>UM</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Faltante</th></tr></thead><tbody>';
  body += filas.map(function(f){
    var enCero=f.total<=0;
    var faltante=Math.max(0, f.min - f.total);
    return '<tr class="row-link" onclick="closeModal();navigate(\'productos\');setTimeout(function(){if(typeof viewProduct===\'function\')viewProduct(\''+f.prod.codigoInterno+'\')},150)"'+(enCero?' style="background:#fdeaea"':'')+'>'+
      '<td><strong>'+escapeHtml(f.prod.codigoInterno)+'</strong> · '+escapeHtml(f.prod.descripcion||'')+'</td>'+
      '<td>'+escapeHtml(f.prod.unidadMedida||'')+'</td>'+
      '<td class="num"'+(enCero?' style="color:#c0392b;font-weight:700"':'')+'>'+fmtNum(f.total,2)+'</td>'+
      '<td class="num">'+fmtNum(f.min,2)+'</td>'+
      '<td class="num" style="color:#c0392b;font-weight:700">'+fmtNum(faltante,2)+'</td>'+
    '</tr>';
  }).join('');
  body += '</tbody></table></div>';
  showModal('⚠️ Productos bajo stock mínimo', body,
    '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>'+
    (can('movimientos.crear')?'<button class="btn btn-success" onclick="closeModal();navigate(\'entradas\')">⬇️ Registrar entrada</button>':''),
    'lg');
}

// Detalle de lotes por vencer (desde la tarjeta del dashboard)
function verPorVencer(){
  var hoy=new Date();
  var limite=new Date(Date.now()+30*86400000);
  var lotes=STATE.cache.lots.filter(function(l){ return l.cantidad>0 && l.fechaVenc && new Date(l.fechaVenc)<limite; });
  if(!lotes.length){ toast('Sin alertas','No hay lotes por vencer en los próximos 30 días','success'); return; }
  lotes.sort(function(a,b){ return (a.fechaVenc||'').localeCompare(b.fechaVenc||''); });
  var body = '<div style="font-size:13px;color:var(--mu);margin-bottom:12px">'+lotes.length+' lote(s) que vencen en los próximos 30 días (o ya vencidos).</div>';
  body += '<div class="table-wrap"><table class="data"><thead><tr><th>Producto</th><th>Lote</th><th>Bodega</th><th class="num">Cantidad</th><th>Vencimiento</th><th class="center">Días</th></tr></thead><tbody>';
  body += lotes.map(function(l){
    var p=getProduct(l.codigoInterno);
    var b=getWarehouse(l.bodegaId);
    var dias=Math.ceil((new Date(l.fechaVenc)-hoy)/86400000);
    var vencido=dias<0;
    var color=vencido?'#c0392b':(dias<=7?'#e9730c':'#0a6e2e');
    return '<tr'+(vencido?' style="background:#fdeaea"':(dias<=7?' style="background:#fff7ef"':''))+'>'+
      '<td><strong>'+escapeHtml(l.codigoInterno)+'</strong> · '+escapeHtml(p?p.descripcion:'')+'</td>'+
      '<td class="mono">'+escapeHtml(l.lote||'-')+'</td>'+
      '<td>'+escapeHtml(b?b.nombre:l.bodegaId||'')+'</td>'+
      '<td class="num">'+fmtNum(l.cantidad,2)+'</td>'+
      '<td>'+fmtDateOnly(l.fechaVenc)+'</td>'+
      '<td class="center" style="color:'+color+';font-weight:700">'+(vencido?'Vencido':dias+' d')+'</td>'+
    '</tr>';
  }).join('');
  body += '</tbody></table></div>';
  showModal('⏰ Lotes por vencer', body,
    '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>',
    'lg');
}

/* ── Donut de distribución del inventario (dashboard) ── */
var _dashInvChart=null;
var _DASH_DONUT_COLORS=['#0a6ed1','#e9730c','#1a7e3e','#8e44ad','#c0392b','#16a085','#d4ac0d','#2c3e50','#e84393','#2563eb'];
function _dashInjectCss(){
  if(document.getElementById('dashCompactCss')) return;
  var s=document.createElement('style'); s.id='dashCompactCss';
  s.textContent='@media(max-width:760px){.dash-top-grid{grid-template-columns:1fr!important}}';
  document.head.appendChild(s);
}
function _dashDibujarDonutInv(data){
  var cv=document.getElementById('dashInvDonut'); if(!cv||typeof Chart==='undefined') return;
  if(_dashInvChart){ try{_dashInvChart.destroy();}catch(e){} _dashInvChart=null; }
  if(!data||!data.length) return;
  var vals=data.map(function(t){return Math.round(t.valor);});
  var colors=data.map(function(_,i){return _DASH_DONUT_COLORS[i%_DASH_DONUT_COLORS.length];});
  _dashInvChart=new Chart(cv.getContext('2d'),{
    type:'doughnut',
    data:{labels:data.map(function(t){return t.tipo;}),datasets:[{data:vals,backgroundColor:colors,borderWidth:1,borderColor:'#fff'}]},
    options:{
      responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{ legend:{display:false},
        tooltip:{callbacks:{label:function(ctx){ var tot=ctx.dataset.data.reduce(function(a,b){return a+b;},0); var p=tot>0?(ctx.parsed/tot*100):0; return ' '+ctx.label+': '+fmtMon(ctx.parsed)+' ('+p.toFixed(1)+'%)'; }}}
      },
      onClick:function(e,els){ if(els&&els.length){ var i=els[0].index; var t=data[i]&&data[i].tipo; if(t && typeof verDetalleTipoModal==='function') verDetalleTipoModal(t); } }
    }
  });
}
try{ window._dashDibujarDonutInv=_dashDibujarDonutInv; }catch(e){}

function renderDashboard(c){
  // OP. CONTEOS no tiene acceso al dashboard: mostrar su menú de conteos.
  if(STATE.user && STATE.user.role==='opconteos'){
    if(typeof mostrarMenuConteos==='function') mostrarMenuConteos();
    return;
  }
  const totalProd=STATE.cache.products.length;
  const totalBod=STATE.cache.warehouses.filter(w=>w.activo).length;
  const totalMov=STATE.cache.movements.filter(m=>!m.anulado).length;
  const valorInv=STATE.cache.stock.reduce((s,x)=>{
    const p=getProduct(x.codigoInterno);
    if(p && p.inventariable===false) return s;
    return s+(x.cantidad*x.costoPromedio||0);
  },0);
  const valorServ=STATE.cache.stock.reduce((s,x)=>{
    const p=getProduct(x.codigoInterno);
    if(!p || p.inventariable!==false) return s;
    return s+(x.cantidad*x.costoPromedio||0);
  },0);
  // Desglose del valor por TIPO DE PRODUCTO (campo `tipoProducto`, el mismo que
  // usa el filtro de la página Productos, para que ambas vistas coincidan).
  // Los productos sin tipo van a "Sin clasificar": si se descartaran, la suma
  // de las líneas no cuadraría con el total y parecería un error de cálculo.
  const porTipo=(()=>{
    const acc={};
    STATE.cache.stock.forEach(x=>{
      const p=getProduct(x.codigoInterno);
      if(p && p.inventariable===false) return;      // los servicios van aparte
      const val=(x.cantidad*x.costoPromedio)||0;
      if(!val) return;
      const k=(p && p.tipoProducto) ? p.tipoProducto : 'Sin clasificar';
      acc[k]=(acc[k]||0)+val;
    });
    return Object.keys(acc)
      .map(k=>({tipo:k, valor:acc[k], pct: valorInv>0 ? (acc[k]/valorInv*100) : 0}))
      .sort((a,b)=>b.valor-a.valor);
  })();
  const porTipoHtml = porTipo.length
    ? porTipo.map(t=>{
        const arg=String(t.tipo).replace(/'/g,"\\'");
        return `<div onclick="verDetalleTipoModal('${escapeHtml(arg)}')" title="Ver el detalle de ${escapeHtml(t.tipo)}"
             style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-top:1px solid rgba(0,0,0,.06);cursor:pointer"
             onmouseover="this.style.background='rgba(0,0,0,.03)'" onmouseout="this.style.background=''">
          <span style="font-size:12px;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.tipo)}</span>
          <span style="white-space:nowrap"><strong style="font-size:14px">${fmtMon(t.valor)}</strong>
            <span style="font-size:11px;color:var(--mu);margin-left:5px">${t.pct.toFixed(1)}%</span></span>
        </div>`;
      }).join('')
    : '<div style="font-size:12px;color:var(--mu);padding:6px 0">Sin existencias valorizadas.</div>';
  // Stock bajo: recorrer PRODUCTOS con stock mínimo definido y comparar su existencia total.
  // Incluye productos en 0 o sin registro en cache.stock (que antes quedaban fuera).
  const lowStock=(()=>{
    const res=[];
    STATE.cache.products.forEach(p=>{
      const min=p.stockMinimo||0;
      if(min<=0) return;                       // sin mínimo definido, no alerta
      if(p.inventariable===false) return;      // servicios/no inventariables no llevan stock
      // Existencia total del producto sumando todas las bodegas
      const regs=STATE.cache.stock.filter(s=>s.codigoInterno===p.codigoInterno);
      const totalCant=regs.reduce((a,s)=>a+(s.cantidad||0),0);
      if(totalCant<=min){
        // Una fila por bodega con stock; si no hay ninguna, una fila "sin existencias"
        if(regs.length){
          regs.forEach(s=>res.push({codigoInterno:p.codigoInterno, bodegaId:s.bodegaId, cantidad:s.cantidad||0, _min:min}));
        } else {
          res.push({codigoInterno:p.codigoInterno, bodegaId:null, cantidad:0, _min:min});
        }
      }
    });
    return res;
  })();
  const lotsExp=STATE.cache.lots.filter(l=>l.cantidad>0&&l.fechaVenc&&new Date(l.fechaVenc)<new Date(Date.now()+30*86400000));

  const recents=[...STATE.cache.movements].filter(m=>!m.anulado).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).slice(0,8);

  // Estado de respaldos
  const days=getDaysSinceBackup();
  // Backup ahora se gestiona solo en Configuración (visible para admin)
  // Tarjeta de compra urgente (datos del Cuaderno de Campo)
  var _cuHtml = '';
  try{
    if(typeof S!=='undefined' && Array.isArray(S.comprasUrgentes)){
      var _cuVig = S.comprasUrgentes.filter(function(e){ return (S.ordenes||[]).some(function(o){ return String(o.id)===String(e.ordenId); }); });
      var _cuSet={};
      _cuVig.forEach(function(e){ (e.items||[]).forEach(function(it){ _cuSet[(it.nombre||'').toUpperCase()]=true; }); });
      var _cuN=Object.keys(_cuSet).length;
      if(_cuVig.length && _cuN){
        _cuHtml='<div onclick="abrirCompraUrgente()" style="cursor:pointer;background:linear-gradient(135deg,#b91c1c,#ef4444);border-radius:11px;padding:16px 20px;margin-bottom:18px;color:#fff;display:flex;align-items:center;gap:16px;box-shadow:0 2px 8px rgba(185,28,28,.25)">'+
          '<span style="font-size:34px;flex-shrink:0">🛒</span>'+
          '<div style="flex:1">'+
            '<div style="font-size:16px;font-weight:800">Productos Compra Urgente</div>'+
            '<div style="font-size:12px;color:#fde2e2;margin-top:2px">'+_cuN+' producto(s) sin stock suficiente para '+_cuVig.length+' orden(es) de aplicación · Toca para ver el detalle</div>'+
          '</div>'+
          '<span style="font-size:22px;font-weight:700;background:rgba(255,255,255,.2);border-radius:8px;padding:4px 12px">'+_cuN+'</span>'+
        '</div>';
      }
    }
  }catch(e){}
  c.innerHTML=`
    <div class="page-header" style="align-items:flex-start">
      <div style="flex:0 1 auto">
        <div class="page-title">Bienvenido, ${escapeHtml(STATE.user.nombre||STATE.user.id)}</div>
        <div class="page-subtitle">Resumen del estado actual del inventario</div>
        ${STATE.user.role==='admin'?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px">
          <span id="fb-count-chip" style="font-size:11px;background:#fff3e0;color:#b45309;border:1px solid #fcd9a0;border-radius:12px;padding:3px 10px"></span>
          <button onclick="FBCOUNT.reset()" title="Reiniciar contador" style="font-size:11px;border:none;background:#eee;border-radius:10px;padding:3px 8px;cursor:pointer">↺</button>
        </div>`:''}
      </div>
      <div id="dash-clima" style="flex:1 1 560px;min-width:300px;max-width:100%"></div>
    </div>

    ${_cuHtml}

    <div class="dash-top-grid" style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:16px">
      <div class="stat-card gold">
        <div class="stat-label">Valor inventario</div>
        <div style="display:flex;flex-wrap:wrap;gap:14px 24px;align-items:flex-start;justify-content:space-between">
          <div style="flex:1 1 300px;min-width:240px">
            <div style="display:flex;flex-wrap:wrap;gap:4px 20px;align-items:baseline;margin-bottom:8px">
              <div><span class="stat-value">${fmtMon(valorInv)}</span> <span class="stat-sub">inventariables · costo PPP</span></div>
            </div>
            <div style="font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Por tipo de producto · toca para ver el detalle</div>
            ${porTipoHtml}
          </div>
          <div style="flex:0 0 auto;width:188px;max-width:46vw;align-self:center">
            <div style="position:relative;height:188px"><canvas id="dashInvDonut"></canvas></div>
            <div style="text-align:center;font-size:10.5px;color:var(--mu);margin-top:2px">Toca un segmento para ver el detalle</div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="stat-card amber" style="flex:1${(new Set(lowStock.map(s=>s.codigoInterno)).size)>0?';cursor:pointer':''}" ${(new Set(lowStock.map(s=>s.codigoInterno)).size)>0?'onclick="verStockBajo()"':''}>
          <div class="stat-label">Stock bajo ${(new Set(lowStock.map(s=>s.codigoInterno)).size)>0?'<span style="font-size:11px;color:#0a6ed1">› ver</span>':''}</div>
          <div class="stat-value">${new Set(lowStock.map(s=>s.codigoInterno)).size}</div>
          <div class="stat-sub">productos bajo mínimo</div>
        </div>
        <div class="stat-card red" style="flex:1${lotsExp.length>0?';cursor:pointer':''}" ${lotsExp.length>0?'onclick="verPorVencer()"':''}>
          <div class="stat-label">Por vencer ${lotsExp.length>0?'<span style="font-size:11px;color:#0a6ed1">› ver</span>':''}</div>
          <div class="stat-value">${lotsExp.length}</div>
          <div class="stat-sub">lotes en próximos 30 días</div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:18px;margin-top:4px" id="dashGrid">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Movimientos recientes</div>
          ${can('movimientos.ver')?'<button class="btn btn-secondary btn-sm" onclick="navigate(\'movimientos\')">Ver todos</button>':''}
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>N°</th><th>Tipo</th><th>Fecha</th><th>Bodega</th><th>Producto</th><th class="num">Items</th><th class="num">Valor</th></tr></thead>
            <tbody>
              ${recents.length===0?'<tr><td colspan="7" class="center" style="color:var(--mu);padding:30px">Sin movimientos</td></tr>':
                recents.map(m=>{
                  const bod=getWarehouse(m.bodegaId);
                  const valor=(m.detalles||[]).reduce((s,d)=>s+(d.cantidad*d.costo||0),0);
                  const dets=(m.detalles||[]);
                  const prodDesc=dets.length===0?'—':(()=>{
                    const p0=getProduct(dets[0].codigoInterno);
                    const n0=escapeHtml(p0?p0.descripcion:(dets[0].descripcion||dets[0].codigoInterno||'—'));
                    return dets.length>1?(n0+' <span style="color:var(--mu)">+'+(dets.length-1)+'</span>'):n0;
                  })();
                  return `<tr class="row-link" onclick="viewMovimiento('${m.numero}')">
                    <td class="mono"><strong>${m.numero}</strong></td>
                    <td><span class="badge ${m.tipo==='ENT'?'badge-green':(m.tipo==='SAL'?'badge-amber':'badge-blue')}">${tipoLabel(m.tipo)}</span></td>
                    <td>${fmtDate(m.fecha)}</td>
                    <td>${escapeHtml(bod?bod.nombre:m.bodegaId)}</td>
                    <td>${prodDesc}</td>
                    <td class="num">${dets.length}</td>
                    <td class="num">${fmtMon(valor)}</td>
                  </tr>`;
  try{FBCOUNT.refresh();}catch(e){}
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Acciones rápidas</div></div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:8px">
          ${can('movimientos.crear')?`<button class="btn btn-success" onclick="navigate('entradas')" style="justify-content:center">⬇️ Registrar Entrada</button>`:''}
          ${can('movimientos.crear')?`<button class="btn btn-primary" onclick="navigate('salidas')" style="justify-content:center">⬆️ Registrar Salida</button>`:''}
          ${can('productos.crear')?`<button class="btn btn-secondary" onclick="navigate('productos');setTimeout(openProductForm,200)" style="justify-content:center">📦 Nuevo Producto</button>`:''}
          <button class="btn btn-secondary" onclick="navigate('stock')" style="justify-content:center">📋 Ver Stock</button>
        </div>
      </div>
    </div>

    ${lowStock.length>0?`
      <div class="card" style="margin-top:18px">
        <div class="card-header"><div class="card-title">⚠️ Productos con stock bajo</div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Producto</th><th>Bodega</th><th class="num">Stock</th><th class="num">Mínimo</th></tr></thead>
          <tbody>${lowStock.slice(0,8).map(s=>{
            const p=getProduct(s.codigoInterno);const b=getWarehouse(s.bodegaId);
            const enCero=(s.cantidad||0)<=0;
            return `<tr${enCero?' style="background:#fdeaea"':''}><td><strong>${s.codigoInterno}</strong> · ${escapeHtml(p?p.descripcion:'')}</td><td>${s.bodegaId?escapeHtml(b?b.nombre:s.bodegaId):'<span style="color:#c0392b">Sin existencias</span>'}</td><td class="num"${enCero?' style="color:#c0392b;font-weight:700"':''}>${fmtNum(s.cantidad,2)}</td><td class="num">${fmtNum(s._min||p?.stockMinimo||0,2)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`:''}
  `;
  // El chip del clima se pinta aparte: depende de GPS y de red, y no debe
  // retrasar ni romper el dashboard si algo de eso falla.
  try{ if(typeof renderDashClima==='function') renderDashClima(); }catch(e){}
  try{ _dashInjectCss(); _dashDibujarDonutInv(porTipo); }catch(e){ console.error('[dash donut]',e); }
}
function tipoLabel(t){return {ENT:'Entrada',SAL:'Salida',TRA:'Traspaso',AJU:'Ajuste'}[t]||t}
function tipoMovLabel(m){
  if(!m)return '';
  const cfg=getMovCfg(m.tipo,m.tipoMovimiento);
  return cfg?cfg.label:(m.tipoMovimiento||tipoLabel(m.tipo));
}

/* ═══════════════ PAGE: PRODUCTOS ═══════════════ */
let prodFilter={search:'',grupo:'',tipo:''};
function renderProductos(c){
  const grupos=[...new Set(STATE.cache.products.map(p=>p.grupo).filter(Boolean))].sort();
  const tipos=[...new Set(STATE.cache.products.map(p=>p.tipoProducto).filter(Boolean))].sort();

  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Productos</div>
        <div class="page-subtitle">Catálogo · ${STATE.cache.products.length} producto(s)</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="exportProductosExcel()">📊 Exportar Excel</button>
        ${can('productos.crear')?`
          <button class="btn btn-secondary" onclick="downloadPlantillaProductos()" title="Descargar plantilla Excel para carga masiva">📥 Plantilla</button>
          <label class="btn btn-secondary" style="cursor:pointer" title="Cargar productos desde un Excel"><span>📤 Importar Excel</span><input type="file" accept=".xlsx,.xls" style="display:none" onchange="if(this.files[0]){previewImportProductos(this.files[0]);this.value=''}"></label>
          <button class="btn btn-primary" onclick="openProductForm()">+ Nuevo Producto</button>
        `:''}
        ${can('productos.eliminar')?`<button class="btn btn-secondary" onclick="previewLimpiezaProductos()" title="Unificar productos duplicados por nombre">🧹 Limpiar duplicados</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filters">
        <div class="field grow"><label>Buscar</label><input type="text" id="prodSearch" placeholder="Código, EAN, descripción..." value="${escapeHtml(prodFilter.search)}"></div>
        <div class="field"><label>Grupo</label><select id="prodGrupo"><option value="">Todos</option>${grupos.map(g=>`<option value="${escapeHtml(g)}" ${prodFilter.grupo===g?'selected':''}>${escapeHtml(g)}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo</label><select id="prodTipo"><option value="">Todos</option>${tipos.map(t=>`<option value="${escapeHtml(t)}" ${prodFilter.tipo===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></div>
      </div>
      <div class="table-wrap" id="prodTableWrap"></div>
    </div>`;
  ['prodSearch','prodGrupo','prodTipo'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    prodFilter.search=document.getElementById('prodSearch').value;
    prodFilter.grupo=document.getElementById('prodGrupo').value;
    prodFilter.tipo=document.getElementById('prodTipo').value;
    renderProductosTable();
  }));
  renderProductosTable();
}
function renderProductosTable(){
  const w=document.getElementById('prodTableWrap');
  // Si no hay búsqueda ni filtros activos, no listar todos (pueden ser muchos): invitar a buscar
  const hayFiltro = prodFilter.search || prodFilter.grupo || prodFilter.tipo;
  if(!hayFiltro){
    w.innerHTML='<div class="empty-state" style="padding:40px 20px">'+
      '<div class="empty-state-icon">🔍</div>'+
      '<div class="empty-state-title">Busca o filtra productos</div>'+
      '<div class="empty-state-text">Usa el buscador (código, EAN o descripción) o los filtros de grupo y tipo para encontrar productos.<br>Hay <strong>'+STATE.cache.products.filter(function(p){return p.activo!==false;}).length+'</strong> productos registrados.</div>'+
      (can('productos.crear')?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openProductForm()">+ Nuevo producto</button>':'')+
    '</div>';
    return;
  }
  let prods=STATE.cache.products.filter(function(p){ return p.activo!==false; });
  if(prodFilter.search){
    const s=prodFilter.search.toLowerCase();
    prods=prods.filter(p=>(p.codigoInterno+' '+p.codigoEAN+' '+p.descripcion).toLowerCase().includes(s));
  }
  if(prodFilter.grupo)prods=prods.filter(p=>p.grupo===prodFilter.grupo);
  if(prodFilter.tipo)prods=prods.filter(p=>p.tipoProducto===prodFilter.tipo);
  prods=prods.sort((a,b)=>a.codigoInterno.localeCompare(b.codigoInterno));
  if(prods.length===0){w.innerHTML='<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-title">Sin coincidencias</div><div class="empty-state-text">No hay productos que coincidan con la búsqueda o filtros.</div></div>';return}
  w.innerHTML=`<div style="font-size:12px;color:var(--mu);margin-bottom:8px">${prods.length} producto(s) encontrado(s)</div><table class="data">
    <thead><tr>
      <th>Código</th><th>EAN</th><th>Descripción</th><th>UM</th><th>Tipo</th><th>Grupo / Sub-Grupo</th>
      <th class="center">Lote</th><th class="num">Stock total</th><th class="num">Costo PPP</th><th class="actions">Acciones</th>
    </tr></thead>
    <tbody>${prods.map(p=>{
      const tot=getStockTotal(p.codigoInterno);
      const sk=STATE.cache.stock.filter(s=>s.codigoInterno===p.codigoInterno&&s.cantidad>0);
      const ppp=sk.length?sk.reduce((s,x)=>s+x.cantidad*x.costoPromedio,0)/sk.reduce((s,x)=>s+x.cantidad,0):0;
      return `<tr class="row-link" onclick="viewProduct('${p.codigoInterno}')">
        <td class="mono"><strong>${p.codigoInterno}</strong></td>
        <td class="mono">${escapeHtml(p.codigoEAN||'')}</td>
        <td>${escapeHtml(p.descripcion)}${p.inventariable===false?' <span class="badge badge-amber" style="font-size:10px">No inventariable</span>':''}</td>
        <td class="center">${escapeHtml(p.unidadMedida)}</td>
        <td>${escapeHtml(p.tipoProducto||'')}</td>
        <td>${escapeHtml(p.grupo||'')} ${p.subGrupo?'<span style="color:var(--mu)"> / '+escapeHtml(p.subGrupo)+'</span>':''}</td>
        <td class="center">${p.manejaAtributos?'<span class="badge badge-green">Sí</span>':'<span class="badge badge-gray">No</span>'}</td>
        <td class="num">${fmtNum(tot,2)}</td>
        <td class="num">${ppp?fmtMon(ppp):'-'}</td>
        <td class="actions" onclick="event.stopPropagation()">
          ${can('productos.crear')?`<button class="btn btn-secondary btn-sm" onclick="openProductForm('${p.codigoInterno}')">Editar</button>`:''}
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function pfTab(tab){
  document.querySelectorAll('.pf-tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab')===tab); });
  document.querySelectorAll('.pf-pane').forEach(function(pn){ pn.classList.remove('active'); });
  var pane=document.getElementById('pf-pane-'+tab);
  if(pane) pane.classList.add('active');
}
function openProductForm(codigo=null,opts={}){
  const p=codigo?getProduct(codigo):null;
  const grupos=[...new Set(STATE.cache.groups.map(g=>g.nombre))];
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).map(t=>t.nombre).sort();
  const ums=['UN','KG','GR','LT','ML','MT','M2','M3','CJ','PQ','TON','PZ','MR'];
  const isNew=!p;
  const preEAN=opts.prefilledEAN||'';
  const preDesc=opts.prefilledDesc||'';
  showModal(p?`Editar producto · ${p.codigoInterno}`:(opts.fromMov?'Crear producto desde entrada':'Nuevo producto'),
    `${opts.fromMov?'<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">📦 Estás creando un nuevo producto sin perder los datos de la entrada en curso. Al guardar, volverás al formulario con el producto ya seleccionado.</div>':''}
    <div class="pf-ficha">
      <div class="pf-tabs">
        <button type="button" class="pf-tab active" data-tab="generales" onclick="pfTab('generales')">📋 Datos Generales</button>
        <button type="button" class="pf-tab" data-tab="clasif" onclick="pfTab('clasif')">🗂️ Clasificación</button>
        <button type="button" class="pf-tab" data-tab="inventario" onclick="pfTab('inventario')">📦 Inventario</button>
        <button type="button" class="pf-tab" data-tab="impuestos" onclick="pfTab('impuestos')">💲 Impuestos</button>
        <button type="button" class="pf-tab" data-tab="aplicacion" onclick="pfTab('aplicacion')">🌿 Aplicación / Cuaderno</button>
      </div>
      <div class="pf-content">
        <div class="pf-pane active" id="pf-pane-generales">
          <div class="pf-section-title">Identificación del producto</div>
          <div class="form-grid">
            <div class="form-field required"><label>Código Interno</label><input type="text" id="fpCod" value="${p?p.codigoInterno:'(automático)'}" readonly><div class="hint">${p?'No editable':'Se asigna automáticamente al guardar'}</div></div>
            <div class="form-field"><label>Código EAN</label><input type="text" id="fpEAN" value="${escapeHtml(p?.codigoEAN||preEAN)}" placeholder="código de barras"></div>
            <div class="form-field span-2 required"><label>Descripción</label><input type="text" id="fpDesc" value="${escapeHtml(p?.descripcion||preDesc)}" placeholder="Nombre del producto"></div>
            <div class="form-field required"><label>Unidad de Medida</label><select id="fpUM">${ums.map(u=>`<option value="${u}" ${p?.unidadMedida===u?'selected':''}>${u}</option>`).join('')}</select></div>
            <div class="form-field required"><label>Tipo Producto</label><select id="fpTipo"><option value="">- Seleccionar -</option>${tipos.map(t=>`<option value="${escapeHtml(t)}" ${p?.tipoProducto===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}${p?.tipoProducto&&!tipos.includes(p.tipoProducto)?`<option value="${escapeHtml(p.tipoProducto)}" selected>${escapeHtml(p.tipoProducto)} (inactivo)</option>`:''}</select></div>
          </div>
        </div>
        <div class="pf-pane" id="pf-pane-clasif">
          <div class="pf-section-title">Clasificación y agrupación</div>
          <div class="form-grid">
            <div class="form-field required"><label>Grupo</label><select id="fpGrupo" onchange="updateSubGrupos()"><option value="">- Seleccionar -</option>${grupos.map(g=>`<option value="${escapeHtml(g)}" ${p?.grupo===g?'selected':''}>${escapeHtml(g)}</option>`).join('')}</select></div>
            <div class="form-field"><label>Sub-Grupo</label><select id="fpSubGrupo"></select></div>
          </div>
          <div class="hint" style="margin-top:6px">El grupo y sub-grupo se usan para organizar y filtrar el catálogo de productos.</div>
        </div>
        <div class="pf-pane" id="pf-pane-inventario">
          <div class="pf-section-title">Control de inventario</div>
          <div class="form-grid">
            <div class="form-field"><label>Inventariable</label>
              <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
                <span class="switch"><input type="checkbox" id="fpInv" ${(p?(p.inventariable!==false):true)?'checked':''}><span class="switch-slider"></span></span>
                <span id="fpInvLbl">${(p?(p.inventariable!==false):true)?'Sí — lleva control de stock':'No — no lleva stock'}</span>
              </label>
              <div class="hint">Marque "No" para servicios o consumibles que no controlan inventario.</div>
            </div>
            <div class="form-field"><label>Maneja atributos (Lote/Vencimiento)</label>
              <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
                <span class="switch"><input type="checkbox" id="fpAtrib" ${p?.manejaAtributos?'checked':''}><span class="switch-slider"></span></span>
                <span id="fpAtribLbl">${p?.manejaAtributos?'Sí — lote y fecha de vencimiento':'No'}</span>
              </label>
              <div class="hint">Cuando es Sí, las entradas pedirán lote y fecha de vencimiento.</div>
            </div>
            <div class="form-field"><label>Stock mínimo (opcional)</label><input type="number" step="0.01" id="fpMin" value="${p?.stockMinimo||0}"><div class="hint">Para alertas de bajo stock</div></div>
          </div>
        </div>
        <div class="pf-pane" id="pf-pane-impuestos">
          <div class="pf-section-title">Impuestos aplicables</div>
          <div class="form-grid">
            <div class="form-field span-2"><label>IVA</label>
              <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
                <span class="switch"><input type="checkbox" id="fpIVA" ${(p?(p.aplicaIVA!==false):true)?'checked':''} onchange="document.getElementById('fpIVALbl').textContent=this.checked?'Sí — afecto a IVA (19%)':'No — exento de IVA'"><span class="switch-slider"></span></span>
                <span id="fpIVALbl">${(p?(p.aplicaIVA!==false):true)?'Sí — afecto a IVA (19%)':'No — exento de IVA'}</span>
              </label>
              <div class="hint">Por defecto los productos son afectos a IVA. Marque "No" solo para productos exentos.</div>
            </div>
            <div class="form-field"><label>Impuesto específico combustibles</label>
              <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
                <span class="switch"><input type="checkbox" id="fpIEC" ${p?.aplicaIEC?'checked':''}><span class="switch-slider"></span></span>
                <span>Aplica impuesto específico</span>
              </label>
              <div class="hint">Para diésel, gasolina y otros combustibles. El monto se ingresa al registrar la factura de compra.</div>
            </div>
            <div class="form-field"><label>ILA (bebidas y licores)</label>
              <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
                <span class="switch"><input type="checkbox" id="fpILA" ${p?.aplicaILA?'checked':''}><span class="switch-slider"></span></span>
                <span>Aplica ILA</span>
              </label>
              <div class="hint">Impuesto a bebidas alcohólicas, analcohólicas y similares. El monto se ingresa al registrar la factura.</div>
            </div>
          </div>
        </div>
        <div class="pf-pane" id="pf-pane-aplicacion">
          <div class="pf-section-title">Datos agronómicos (Cuaderno de Campo)</div>
          <div class="hint" style="margin-bottom:10px">Complete estos campos si el producto se usa en aplicaciones del Cuaderno de Campo (fitosanitarios, fertilizantes, etc.). Permiten consolidar la ficha del SCI con los datos del Cuaderno.</div>
          <div class="form-grid">
            <div class="form-field"><label>Tipo (agronómico)</label>
              <select id="fpCCTipo">
                <option value="">— Ninguno —</option>
                ${['Fungicida','Bactericida','Insecticida','Acaricida','Herbicida','Fertilizante foliar','Fertilizante edáfico','Fertilizante suelo','Enmienda','Fitoregulador','Bioestimulante','Orgánico','Corrector mineral','Coadyuvante','Otro'].map(t=>`<option value="${t}" ${p?.ccTipo===t?'selected':''}>${t}</option>`).join('')}
              </select>
              <div class="hint">Clasificación para el Cuaderno de Campo.</div>
            </div>
            <div class="form-field"><label>Ingrediente activo</label><input type="text" id="fpCCIA" value="${escapeHtml(p?.ccIngredienteActivo||'')}" placeholder="Ej: Captan 80%"></div>
            <div class="form-field"><label>Principal objetivo</label><input type="text" id="fpCCObj" value="${escapeHtml(p?.ccObjetivo||'')}" placeholder="Ej: Botrytis, Monilia"></div>
            <div class="form-field"><label>Dosis de referencia</label><input type="text" id="fpCCDosis" value="${escapeHtml(p?.ccDosis!=null?String(p.ccDosis):'')}" placeholder="Ej: 1.5"></div>
            <div class="form-field"><label>Unidad de medida (CC)</label>
              <select id="fpCCUnidad">
                <option value="">—</option>
                ${['mL/100L','L/100L','g/100L','kg/100L','L/ha','kg/ha','mL/ha','g/ha','cc/ha'].map(u=>`<option value="${u}" ${p?.ccUnidad===u?'selected':''}>${u}</option>`).join('')}
              </select>
              <div class="hint">Unidad de dosificación usada en el Cuaderno (distinta de la unidad de inventario).</div>
            </div>
          </div>
        </div>
      </div>
    </div>`,
    `<button class="btn btn-secondary" id="pfCancel">${opts.fromMov?'← Volver a la entrada':'Cancelar'}</button>
     ${p && can('productos.eliminar') ? '<button class="btn" id="pfDelete" style="background:#b91c1c;color:#fff;margin-left:auto">🗑 Eliminar</button>' : ''}
     <button class="btn btn-primary" id="pfSave">${p?'Guardar cambios':(opts.fromMov?'Crear y volver':'Crear producto')}</button>`,
    'lg');
  // Binding seguro
  document.getElementById('pfCancel').onclick=()=>{
    closeModal();
    if(opts.fromMov)_renderMovForm(document.getElementById('mainContent'));
  };
  document.getElementById('pfSave').onclick=()=>saveProduct(p?p.codigoInterno:null,opts);
  var pfDel=document.getElementById('pfDelete'); if(pfDel) pfDel.onclick=()=>deleteProduct(p.codigoInterno);
  document.getElementById('fpAtrib').addEventListener('change',e=>{
    document.getElementById('fpAtribLbl').textContent=e.target.checked?'Sí — lote y fecha de vencimiento':'No';
  });
  document.getElementById('fpInv').addEventListener('change',e=>{
    document.getElementById('fpInvLbl').textContent=e.target.checked?'Sí — lleva control de stock':'No — no lleva stock';
  });
  updateSubGrupos();
  if(p?.subGrupo){setTimeout(()=>{document.getElementById('fpSubGrupo').value=p.subGrupo},10)}
  // Auto-foco: si hay descripción pre-llenada, foco en EAN; de lo contrario en descripción
  setTimeout(()=>{
    if(opts.fromMov){
      const focusEl=preDesc?document.getElementById('fpEAN'):document.getElementById('fpDesc');
      if(focusEl){focusEl.focus();focusEl.select&&focusEl.select()}
    }
  },80);
}
function updateSubGrupos(){
  const grupo=document.getElementById('fpGrupo').value;
  const g=STATE.cache.groups.find(x=>x.nombre===grupo);
  const sg=g?(g.subgrupos||[]):[];
  document.getElementById('fpSubGrupo').innerHTML='<option value="">- Sin sub-grupo -</option>'+sg.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}
async function saveProduct(codigo,opts){
  opts=opts||{};
  const desc=document.getElementById('fpDesc').value.trim();
  if(!desc){toast('Falta descripción','La descripción es obligatoria','error');return}
  const um=document.getElementById('fpUM').value;
  const tipo=document.getElementById('fpTipo').value;
  if(!tipo){toast('Falta tipo','Seleccione un tipo de producto','error');return}
  const grupo=document.getElementById('fpGrupo').value;
  if(!grupo){toast('Falta grupo','Seleccione un grupo','error');return}
  const subGrupo=document.getElementById('fpSubGrupo').value;
  const ean=document.getElementById('fpEAN').value.trim();
  const atrib=document.getElementById('fpAtrib').checked;
  const inventariable=document.getElementById('fpInv').checked;
  const stockMin=Number(document.getElementById('fpMin').value)||0;
  // Impuestos (solo flags; los montos se ingresan al registrar la factura)
  const aplicaIVA=document.getElementById('fpIVA')?document.getElementById('fpIVA').checked:true;
  const aplicaIEC=document.getElementById('fpIEC')?document.getElementById('fpIEC').checked:false;
  const aplicaILA=document.getElementById('fpILA')?document.getElementById('fpILA').checked:false;
  // Datos agronómicos del Cuaderno de Campo (consolidación de productos)
  const ccTipo=document.getElementById('fpCCTipo')?document.getElementById('fpCCTipo').value:'';
  const ccIA=document.getElementById('fpCCIA')?document.getElementById('fpCCIA').value.trim():'';
  const ccObj=document.getElementById('fpCCObj')?document.getElementById('fpCCObj').value.trim():'';
  const ccDosisRaw=document.getElementById('fpCCDosis')?document.getElementById('fpCCDosis').value.trim():'';
  const ccDosis=ccDosisRaw!==''?(parseFloat(ccDosisRaw.replace(',','.'))||null):null;
  const ccUnidad=document.getElementById('fpCCUnidad')?document.getElementById('fpCCUnidad').value:'';

  // Validar EAN duplicado al crear (si tiene EAN)
  if(!codigo && ean){
    const dup=STATE.cache.products.find(x=>x.codigoEAN===ean);
    if(dup){toast('EAN duplicado',`Ya existe el producto ${dup.codigoInterno} (${dup.descripcion}) con ese código de barras.`,'error');return}
  }

  let nuevoCodigo;
  if(codigo){
    const p=getProduct(codigo);
    const tieneMov=STATE.cache.movements.some(m=>(m.detalles||[]).some(d=>d.codigoInterno===codigo));
    if(tieneMov && p.manejaAtributos!==atrib){
      toast('No se puede cambiar','Ya existen movimientos con este producto. No se puede modificar el manejo de atributos.','error');return;
    }
    p.codigoEAN=ean;p.descripcion=desc;p.unidadMedida=um;p.tipoProducto=tipo;p.grupo=grupo;p.subGrupo=subGrupo;p.manejaAtributos=atrib;p.inventariable=inventariable;p.stockMinimo=stockMin;
    p.aplicaIVA=aplicaIVA;p.aplicaIEC=aplicaIEC;p.aplicaILA=aplicaILA;
    p.ccTipo=ccTipo;p.ccIngredienteActivo=ccIA;p.ccObjetivo=ccObj;p.ccDosis=ccDosis;p.ccUnidad=ccUnidad;
    p.modificado=new Date().toISOString();
    await dbPut('products',p);
    await audit('producto.editar','Edición de producto',codigo);
    nuevoCodigo=codigo;
  }else{
    const cod=await nextProductCode();
    const np={
      codigoInterno:cod,codigoEAN:ean,descripcion:desc,unidadMedida:um,
      tipoProducto:tipo,grupo:grupo,subGrupo:subGrupo,manejaAtributos:atrib,inventariable:inventariable,
      aplicaIVA:aplicaIVA,aplicaIEC:aplicaIEC,aplicaILA:aplicaILA,
      ccTipo:ccTipo,ccIngredienteActivo:ccIA,ccObjetivo:ccObj,ccDosis:ccDosis,ccUnidad:ccUnidad,
      stockMinimo:stockMin,activo:true,creado:new Date().toISOString()
    };
    await dbPut('products',np);
    await audit('producto.crear','Creación de producto',cod);
    nuevoCodigo=cod;
  }
  await reloadCache();
  closeModal();
  toast(codigo?'Producto actualizado':'Producto creado',nuevoCodigo);

  // Si fue creado/editado desde el form de movimiento, regresar y rellenar la línea
  if(opts.fromMov){
    if(typeof opts.lineIndex==='number'&&movDraft.lineas[opts.lineIndex]){
      movDraft.lineas[opts.lineIndex].codigoInterno=nuevoCodigo;
      // En SAL, cargar costo desde stock; en ENT, dejar para que el operador lo ingrese
      if(movDraft.tipo==='SAL'){
        const st=getStock(nuevoCodigo,movDraft.bodegaId);
        movDraft.lineas[opts.lineIndex].costo=st?st.costoPromedio:0;
      }
    }
    _renderMovForm(document.getElementById('mainContent'));
    return;
  }

  // Si fue creado desde una Orden de Compra: rellenar la línea de la OC.
  if(opts.fromOC){
    if(typeof ocProductoCreado==='function') ocProductoCreado(nuevoCodigo, opts.lineIndex);
    return;
  }

  // Si fue creado desde la búsqueda de una orden de aplicación: volver al
  // Cuaderno y rellenar el producto recién creado en el input de la orden.
  if(opts.fromOrden){
    var nuevo = getProduct(nuevoCodigo);
    if(nuevo && opts.ordenInputId){
      // navegar de vuelta al Cuaderno si cambiamos de módulo
      if(typeof navigate==='function' && STATE.page!=='cuaderno'){
        navigate('cuaderno');
      }
      setTimeout(function(){
        var inp=document.getElementById(opts.ordenInputId);
        if(inp){
          var lid = opts.ordenInputId.replace('-prod','-ac').replace('cc-o-prod','cc-o-ac').replace('cc-f-prod','cc-f-ac');
          // selProd rellena nombre + unidad/dosis a partir de los datos del CC.
          selProd(opts.ordenInputId, lid, (nuevo.descripcion||'').replace(/'/g,''), nuevo.ccUnidad||'', (nuevo.ccDosis!=null?nuevo.ccDosis:''));
          if(typeof toast==='function') toast('Producto disponible','«'+(nuevo.descripcion||'')+'» creado y seleccionado','success');
        }
      }, 300);
    }
    return;
  }
  if(STATE.page==='productos')renderProductos(document.getElementById('mainContent'));
}
// Eliminar producto: solo admin (productos.eliminar), con restricción si tiene movimientos.
async function deleteProduct(codigo){
  if(!can('productos.eliminar')){ toast('Sin permiso','Solo un administrador puede eliminar productos','error'); return; }
  var p = getProduct(codigo); if(!p){ toast('No encontrado','','error'); return; }
  // Verificar si tiene movimientos asociados
  var movs = (STATE.cache.movements||[]).filter(function(m){
    return (m.lineas||[]).some(function(l){ return l.codigoInterno===codigo; });
  });
  if(movs.length > 0){
    toast('No se puede eliminar','El producto «'+p.descripcion+'» tiene '+movs.length+' movimiento(s) asociado(s). Debe anularlos primero.','error');
    return;
  }
  confirmDialog('Eliminar producto','¿Eliminar definitivamente «'+p.descripcion+'» ('+codigo+')?  No tiene movimientos asociados. Se eliminará por completo.', async function(){
    await dbDel('products', codigo);
    await reloadCache();
    closeModal();
    navigate('productos');
    toast('Producto eliminado','«'+p.descripcion+'» eliminado definitivamente','success');
  }, 'Eliminar', true);
}
// ══════════════════════════════════════════════════════════════
// LIMPIEZA / UNIFICACIÓN DE PRODUCTOS DUPLICADOS
// Agrupa por nombre normalizado (MAYÚSCULAS), elige un ganador y
// reasigna stock/lotes/movimientos del resto, eliminando duplicados.
// ══════════════════════════════════════════════════════════════
function _normNombreProd(s){ return String(s||'').toUpperCase().trim().replace(/\s+/g,' '); }
// Campos considerados para el "score de completitud"
var _PROD_CAMPOS_SCORE = ['codigoEAN','descripcion','unidadMedida','tipoProducto','grupo','subGrupo','ccTipo','ccIngredienteActivo','ccObjetivo','ccDosis','ccUnidad','stockMinimo'];
function _scoreCompletitud(p){
  var n=0;
  _PROD_CAMPOS_SCORE.forEach(function(c){ var v=p[c]; if(v!==undefined && v!==null && String(v).trim()!=='' && !(typeof v==='number' && v===0)) n++; });
  return n;
}
function _prodTieneMovs(codigo){
  return (STATE.cache.movements||[]).filter(function(m){ return !m.anulado && (m.detalles||[]).some(function(d){ return d.codigoInterno===codigo; }); }).length;
}
function _prodTieneStock(codigo){
  return (STATE.cache.stock||[]).filter(function(s){ return s.codigoInterno===codigo && (Number(s.cantidad)||0)>0; }).length>0;
}
// Devuelve los grupos de duplicados: [{nombre, ganador, perdedores:[], fusion:{}}]
function _analizarDuplicadosProductos(){
  var porNombre={};
  (STATE.cache.products||[]).forEach(function(p){
    var k=_normNombreProd(p.descripcion);
    if(!k) return;
    (porNombre[k]=porNombre[k]||[]).push(p);
  });
  var grupos=[];
  Object.keys(porNombre).forEach(function(k){
    var lista=porNombre[k];
    if(lista.length<2) return; // solo duplicados reales
    // Enriquecer con métricas
    var conMetrica=lista.map(function(p){
      return { p:p, movs:_prodTieneMovs(p.codigoInterno), score:_scoreCompletitud(p), stock:_prodTieneStock(p.codigoInterno), creado:p.creado||'' };
    });
    // Orden de prioridad para el ganador:
    // 1) más movimientos  2) mayor completitud  3) tiene stock  4) más antiguo
    conMetrica.sort(function(a,b){
      if(b.movs!==a.movs) return b.movs-a.movs;
      if(b.score!==a.score) return b.score-a.score;
      if(a.stock!==b.stock) return (b.stock?1:0)-(a.stock?1:0);
      return String(a.creado).localeCompare(String(b.creado)); // más antiguo primero
    });
    var ganador=conMetrica[0];
    var perdedores=conMetrica.slice(1);
    // Fusión: el ganador hereda campos vacíos desde los perdedores (en orden de prioridad)
    var fusion={};
    _PROD_CAMPOS_SCORE.forEach(function(c){
      var vg=ganador.p[c];
      var vacio=(vg===undefined||vg===null||String(vg).trim()===''||(typeof vg==='number'&&vg===0));
      if(vacio){
        for(var i=0;i<perdedores.length;i++){
          var vp=perdedores[i].p[c];
          if(vp!==undefined&&vp!==null&&String(vp).trim()!==''&&!(typeof vp==='number'&&vp===0)){ fusion[c]=vp; break; }
        }
      }
    });
    grupos.push({ nombre:k, ganador:ganador, perdedores:perdedores, fusion:fusion });
  });
  // Ordenar por nombre
  grupos.sort(function(a,b){ return a.nombre.localeCompare(b.nombre); });
  return grupos;
}
// Vista previa (no destructiva)
function previewLimpiezaProductos(){
  if(!can('productos.eliminar')){ toast('Sin permiso','Solo un administrador puede unificar productos','error'); return; }
  var grupos=_analizarDuplicadosProductos();
  if(!grupos.length){
    showModal('🧹 Limpieza de productos','<div class="empty-state" style="padding:30px"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin duplicados</div><div class="empty-state-text">No se encontraron productos con el mismo nombre. Igualmente se normalizarán a MAYÚSCULAS al aplicar.</div></div>',
      '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button class="btn btn-primary" onclick="aplicarLimpiezaProductos()">Solo normalizar a MAYÚSCULAS</button>');
    return;
  }
  var totalPerd=grupos.reduce(function(s,g){ return s+g.perdedores.length; },0);
  var rows=grupos.map(function(g){
    var gp=g.ganador;
    var perdList=g.perdedores.map(function(x){
      var tags=[];
      if(x.movs) tags.push('<span class="badge badge-amber" style="font-size:10px">'+x.movs+' mov</span>');
      if(x.stock) tags.push('<span class="badge badge-gray" style="font-size:10px">stock</span>');
      return '<div style="font-size:12px;color:var(--mu);padding:2px 0">↳ '+escapeHtml(x.p.codigoInterno)+' · '+escapeHtml(x.p.descripcion)+' '+tags.join(' ')+'</div>';
    }).join('');
    var fusionTxt=Object.keys(g.fusion).length?('<div style="font-size:11px;color:#0a6e2e;margin-top:3px">+ hereda: '+Object.keys(g.fusion).join(', ')+'</div>'):'';
    var gTags=[];
    if(gp.movs) gTags.push('<span class="badge badge-green" style="font-size:10px">'+gp.movs+' mov</span>');
    if(gp.stock) gTags.push('<span class="badge badge-gray" style="font-size:10px">stock</span>');
    gTags.push('<span class="badge badge-gray" style="font-size:10px">'+gp.score+' campos</span>');
    return '<div style="border:1px solid var(--bo);border-radius:8px;padding:10px 12px;margin-bottom:8px">'+
      '<div style="font-weight:700;font-size:13px;color:var(--tx)">✅ '+escapeHtml(_normNombreProd(gp.p.descripcion))+'</div>'+
      '<div style="font-size:12px;color:var(--mu);margin-top:2px">Ganador: <strong>'+escapeHtml(gp.p.codigoInterno)+'</strong> '+gTags.join(' ')+'</div>'+
      fusionTxt+
      '<div style="margin-top:6px;border-top:1px dashed var(--bo);padding-top:6px"><div style="font-size:11px;font-weight:700;color:#c0392b;margin-bottom:2px">Se eliminarán y reasignarán al ganador:</div>'+perdList+'</div>'+
    '</div>';
  }).join('');
  showModal('🧹 Limpieza de productos · Vista previa',
    '<div class="alert alert-info" style="margin-bottom:12px;font-size:13px">Se encontraron <strong>'+grupos.length+'</strong> grupo(s) de duplicados ('+totalPerd+' producto(s) a eliminar). '+
      'El stock, lotes y movimientos de cada duplicado se <strong>reasignan al ganador</strong> (no se pierde historial). Las descripciones quedarán en MAYÚSCULAS.</div>'+
    '<div style="max-height:50vh;overflow-y:auto">'+rows+'</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="aplicarLimpiezaProductos()">Aplicar unificación ('+totalPerd+')</button>');
}
// Aplicar (destructivo): fusiona, reasigna y elimina
async function aplicarLimpiezaProductos(){
  if(!can('productos.eliminar')){ toast('Sin permiso','','error'); return; }
  closeModal();
  if(typeof showLoading==='function') showLoading('Unificando productos...');
  try{
    var grupos=_analizarDuplicadosProductos();
    var totalElim=0, totalReasig=0;
    // 1) Procesar cada grupo de duplicados
    for(var gi=0; gi<grupos.length; gi++){
      var g=grupos[gi];
      var ganCod=g.ganador.p.codigoInterno;
      // 1a) Fusionar campos heredados + normalizar nombre en el ganador
      var gan=g.ganador.p;
      Object.keys(g.fusion).forEach(function(c){ gan[c]=g.fusion[c]; });
      gan.descripcion=_normNombreProd(gan.descripcion);
      gan.modificado=new Date().toISOString();
      await dbPut('products', gan);
      // 1b) Reasignar registros de cada perdedor → ganador
      for(var pi=0; pi<g.perdedores.length; pi++){
        var perdCod=g.perdedores[pi].p.codigoInterno;
        // STOCK: clave = cod|bod ; al reasignar puede colisionar → sumar cantidades
        var stocksP=(STATE.cache.stock||[]).filter(function(s){ return s.codigoInterno===perdCod; });
        for(var si=0; si<stocksP.length; si++){
          var sp=stocksP[si];
          var bod=sp.bodegaId;
          var newKey=ganCod+'|'+bod;
          var dest=await dbGet('stock', newKey);
          if(dest){
            // Sumar cantidades y recalcular costo promedio ponderado
            var qA=Number(dest.cantidad)||0, qB=Number(sp.cantidad)||0;
            var cA=Number(dest.costoPromedio)||0, cB=Number(sp.costoPromedio)||0;
            var qT=qA+qB;
            dest.cantidad=qT;
            dest.costoPromedio=qT>0?((qA*cA+qB*cB)/qT):cA;
            await dbPut('stock', dest);
            await dbDel('stock', sp.key);
          }else{
            // Mover: crear con nueva key y borrar la vieja
            var nuevo={...sp, key:newKey, codigoInterno:ganCod};
            await dbPut('stock', nuevo);
            await dbDel('stock', sp.key);
          }
          totalReasig++;
        }
        // LOTES: id = lot|cod|bod ; reasignar conservando lote/fechaVenc, fusionando por lote
        var lotsP=(STATE.cache.lots||[]).filter(function(l){ return l.codigoInterno===perdCod; });
        for(var li=0; li<lotsP.length; li++){
          var lp=lotsP[li];
          var newId='lot|'+ganCod+'|'+(lp.bodegaId||'')+'|'+(lp.lote||'');
          var destL=await dbGet('lots', newId);
          if(destL){
            destL.cantidad=(Number(destL.cantidad)||0)+(Number(lp.cantidad)||0);
            await dbPut('lots', destL);
            await dbDel('lots', lp.id);
          }else{
            var nuevoL={...lp, id:newId, codigoInterno:ganCod};
            await dbPut('lots', nuevoL);
            await dbDel('lots', lp.id);
          }
        }
        // MOVIMIENTOS: reapuntar detalles del perdedor al ganador
        var movsP=(STATE.cache.movements||[]).filter(function(m){ return (m.detalles||[]).some(function(d){ return d.codigoInterno===perdCod; }); });
        for(var mi=0; mi<movsP.length; mi++){
          var m=movsP[mi];
          var cambio=false;
          (m.detalles||[]).forEach(function(d){ if(d.codigoInterno===perdCod){ d.codigoInterno=ganCod; cambio=true; } });
          if(cambio){ await dbPut('movements', m); }
        }
        // Eliminar el producto perdedor
        await dbDel('products', perdCod);
        totalElim++;
      }
    }
    // 2) Normalizar a MAYÚSCULAS TODOS los productos restantes (aunque no tengan duplicados)
    var todos=await dbAll('products');
    for(var ti=0; ti<todos.length; ti++){
      var pr=todos[ti];
      var norm=_normNombreProd(pr.descripcion);
      if(pr.descripcion!==norm){ pr.descripcion=norm; pr.modificado=new Date().toISOString(); await dbPut('products', pr); }
    }
    await reloadCache();
    if(typeof hideLoading==='function') hideLoading();
    await audit('producto.editar','Limpieza/unificación de productos: '+totalElim+' eliminados, '+totalReasig+' stocks reasignados');
    toast('Limpieza completada', totalElim+' duplicado(s) unificado(s)', 'success');
    navigate('productos');
  }catch(e){
    if(typeof hideLoading==='function') hideLoading();
    console.error('Limpieza productos error:', e);
    toast('Error','No se pudo completar la limpieza: '+(e.message||e),'error');
  }
}

function viewProduct(codigo, verTodos){
  const p=getProduct(codigo);if(!p)return;
  const stocks=STATE.cache.stock.filter(s=>s.codigoInterno===codigo&&s.cantidad>0);
  const lots=(function(){
    var raw=STATE.cache.lots.filter(l=>l.codigoInterno===codigo&&l.cantidad>0);
    var seen={},dd=[];
    raw.forEach(function(l){
      var k=l.codigoInterno+'|'+(l.bodegaId||'')+'|'+(l.lote||'');
      if(!seen[k]){
        seen[k]={
          ...l,
          cantidad:Number(l.cantidad)||0
        };
        dd.push(seen[k]);
      }else{
        seen[k].cantidad += Number(l.cantidad)||0;
      }
    });
    return dd;
  })();
  // Historial con saldo acumulado (todos los vigentes, cronológico)
  const movsAll=STATE.cache.movements.filter(m=>!m.anulado&&(m.detalles||[]).some(d=>d.codigoInterno===codigo))
    .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||String(a.numero).localeCompare(String(b.numero)));
  let saldoAcum=0;
  const movRowsAll=movsAll.map(m=>{
    const cant=(m.detalles||[]).filter(d=>d.codigoInterno===codigo).reduce((s,d)=>s+(Number(d.cantidad)||0),0);
    const delta=m.tipo==='ENT'?cant:(m.tipo==='SAL'?-cant:0);
    saldoAcum+=delta;
    return {m, delta, saldo:saldoAcum};
  });
  // Por defecto se muestran los últimos 15; los anteriores se resumen en una
  // fila "Saldo anterior" para que la tabla cuadre con los informes (v143).
  const LIM_MOV=15;
  const ocultos=(!verTodos && movRowsAll.length>LIM_MOV)?movRowsAll.length-LIM_MOV:0;
  const movRows=ocultos?movRowsAll.slice(-LIM_MOV):movRowsAll;
  const saldoAnterior=ocultos?movRowsAll[ocultos-1].saldo:0;
  const saldoFinal=getStockTotal(codigo);
  showModal(`Producto · ${p.codigoInterno}`,
    `<div class="form-grid">
      <div class="form-field"><label>Código Interno</label><div class="mono"><strong>${p.codigoInterno}</strong></div></div>
      <div class="form-field"><label>Código EAN</label><div class="mono">${escapeHtml(p.codigoEAN||'-')}</div></div>
      <div class="form-field span-2"><label>Descripción</label><div>${escapeHtml(p.descripcion)}</div></div>
      <div class="form-field"><label>Unidad / Tipo</label><div>${escapeHtml(p.unidadMedida)} · ${escapeHtml(p.tipoProducto||'')}</div></div>
      <div class="form-field"><label>Grupo</label><div>${escapeHtml(p.grupo||'')}${p.subGrupo?' / '+escapeHtml(p.subGrupo):''}</div></div>
      <div class="form-field"><label>Maneja atributos</label><div>${p.manejaAtributos?'<span class="badge badge-green">Sí · Lote y vencimiento</span>':'<span class="badge badge-gray">No</span>'}</div></div>
      <div class="form-field"><label>Inventariable</label><div>${p.inventariable===false?'<span class="badge badge-amber">No — sin control de stock</span>':'<span class="badge badge-green">Sí · lleva stock</span>'}</div></div>
      <div class="form-field"><label>Stock mínimo</label><div>${fmtNum(p.stockMinimo||0,2)} ${p.unidadMedida}</div></div>
    </div>
    <h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Stock por bodega</h4>
    ${stocks.length===0?'<div style="color:var(--mu);font-size:13px">Sin stock</div>':
      `<table class="detalle-table"><thead><tr><th>Bodega</th><th class="num">Cantidad</th><th class="num">Costo PPP</th><th class="num">Valor</th></tr></thead>
      <tbody>${stocks.map(s=>{const b=getWarehouse(s.bodegaId);return `<tr><td>${escapeHtml(b?b.nombre:s.bodegaId)}</td><td class="num">${fmtNum(s.cantidad,2)}</td><td class="num">${fmtMon(s.costoPromedio)}</td><td class="num">${fmtMon(s.cantidad*s.costoPromedio)}</td></tr>`}).join('')}</tbody></table>`}
    ${p.manejaAtributos&&lots.length>0?`<h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Lotes con saldo</h4>
      <table class="detalle-table"><thead><tr><th>Bodega</th><th>Lote</th><th>Vence</th><th class="num">Cantidad</th><th class="num">Costo</th></tr></thead>
      <tbody>${lots.map(l=>{const b=getWarehouse(l.bodegaId);const venc=l.fechaVenc?new Date(l.fechaVenc):null;const venceClass=venc&&venc<new Date(Date.now()+30*86400000)?'badge-amber':'';
        return `<tr><td>${escapeHtml(b?b.nombre:l.bodegaId)}</td><td class="mono">${escapeHtml(l.lote)}</td><td><span class="badge ${venceClass}">${fmtDateOnly(l.fechaVenc)}</span></td><td class="num">${fmtNum(l.cantidad,2)}</td><td class="num">${fmtMon(l.costo)}</td></tr>`}).join('')}</tbody></table>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px">
      <h4 style="margin:0;color:var(--gd);font-size:13px">Movimientos (${ocultos?`últimos ${movRows.length} de ${movRowsAll.length}`:`${movRows.length}`})</h4>
      ${movRowsAll.length>LIM_MOV?`<button class="btn btn-secondary btn-sm" onclick="viewProduct('${codigo}',${ocultos?'true':'false'})">${ocultos?`Ver todos (${movRowsAll.length})`:`Ver solo últimos ${LIM_MOV}`}</button>`:''}
    </div>
    ${movRows.length===0?'<div style="color:var(--mu);font-size:13px">Sin movimientos</div>':
      `<table class="detalle-table"><thead><tr><th>N°</th><th>Tipo</th><th>Fecha</th><th class="num">Cantidad</th><th class="num">Saldo</th></tr></thead>
      <tbody>${ocultos?`<tr style="background:var(--bg2,#f4f6f8)"><td colspan="4" style="color:var(--mu);font-style:italic">Saldo anterior · ${ocultos} movimiento(s) previo(s) no mostrados</td><td class="num"><strong>${fmtNum(saldoAnterior,2)}</strong></td></tr>`:''}${movRows.map(r=>`<tr class="row-link" onclick="closeModal();viewMovimiento('${r.m.numero}')">
        <td class="mono">${r.m.numero}</td>
        <td><span class="badge ${r.m.tipo==='ENT'?'badge-green':(r.m.tipo==='SAL'?'badge-amber':'badge-blue')}">${tipoMovLabel(r.m)}</span></td>
        <td>${fmtDate(r.m.fecha)}</td>
        <td class="num">${r.delta>0?'+':''}${fmtNum(r.delta,2)}</td>
        <td class="num"><strong>${fmtNum(r.saldo,2)}</strong></td>
      </tr>`).join('')}
      <tr style="background:var(--bg2,#f4f6f8)"><td colspan="4" style="font-weight:700;text-align:right">Saldo actual</td><td class="num"><strong>${fmtNum(saldoFinal,2)} ${escapeHtml(p.unidadMedida||'')}</strong></td></tr>
      </tbody></table>`}
    `,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${can('productos.crear')?`<button class="btn btn-primary" onclick="closeModal();openProductForm('${codigo}')">Editar</button>`:''}`,
    'lg');
}

async function exportProductosExcel(){
  const data=STATE.cache.products.filter(function(p){ return p.activo!==false; }).map(p=>({
    'Código Interno':p.codigoInterno,'EAN':p.codigoEAN||'',
    'Descripción':p.descripcion,'UM':p.unidadMedida,
    'Tipo':p.tipoProducto||'','Grupo':p.grupo||'','Sub-Grupo':p.subGrupo||'',
    'Maneja Atributos':p.manejaAtributos?'SI':'NO',
    'Tipo Agronómico (CC)':p.ccTipo||'',
    'Ingrediente Activo':p.ccIngredienteActivo||'',
    'Principal Objetivo':p.ccObjetivo||'',
    'Dosis Referencia':p.ccDosis!=null?p.ccDosis:'',
    'Unidad CC':p.ccUnidad||'',
    'Stock Total':getStockTotal(p.codigoInterno)
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Productos');
  XLSX.writeFile(wb,`Productos_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ CARGA MASIVA DE PRODUCTOS ═══════════════ */
const PLANTILLA_HEADERS=['EAN','Descripcion','UM','Tipo','Grupo','SubGrupo','ManejaAtributos','Inventariable','StockMinimo','IVA','ImpuestoEspecifico','ILA'];
const UM_VALIDAS=['UN','KG','GR','LT','ML','MT','M2','M3','CJ','PQ','TON','PZ','MR'];

function downloadPlantillaProductos(){
  // Datos de empresa para el encabezado (puede no estar configurada)
  var empresaCfg = (STATE.cache && STATE.cache.config && STATE.cache.config.empresa) || {};
  // Hoja 1: Productos (con encabezados + 2 filas de ejemplo)
  const ejemplos=[
    {EAN:'7801234567890',Descripcion:'PRODUCTO DE EJEMPLO 1',UM:'UN',Tipo:'MERCADERIA',Grupo:'GENERAL',SubGrupo:'',ManejaAtributos:'NO',Inventariable:'SI',StockMinimo:0,IVA:'SI',ImpuestoEspecifico:'NO',ILA:'NO'},
    {EAN:'',Descripcion:'DIÉSEL (EJEMPLO COMBUSTIBLE)',UM:'LT',Tipo:'MATERIA PRIMA',Grupo:'GENERAL',SubGrupo:'',ManejaAtributos:'NO',Inventariable:'SI',StockMinimo:200,IVA:'SI',ImpuestoEspecifico:'SI',ILA:'NO'},
    {EAN:'',Descripcion:'SERVICIO DE EJEMPLO (NO INVENTARIABLE)',UM:'UN',Tipo:'SERVICIO',Grupo:'GENERAL',SubGrupo:'',ManejaAtributos:'NO',Inventariable:'NO',StockMinimo:0,IVA:'SI',ImpuestoEspecifico:'NO',ILA:'NO'}
  ];
  const ws1=XLSX.utils.json_to_sheet(ejemplos,{header:PLANTILLA_HEADERS});
  // Anchos de columna razonables
  ws1['!cols']=[{wch:16},{wch:42},{wch:6},{wch:22},{wch:18},{wch:18},{wch:16},{wch:13},{wch:11},{wch:6},{wch:18},{wch:6}];

  // Hoja 2: Instrucciones
  const ahora=new Date().toLocaleDateString('es-CL');
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).map(t=>t.nombre).sort();
  const grupos=STATE.cache.groups.map(g=>g.nombre).sort();
  const subgruposPorGrupo=STATE.cache.groups.map(g=>({Grupo:g.nombre,SubGrupos:(g.subgrupos||[]).join(', ')||'(ninguno)'}));

  const inst=[
    [`SISTEMA DE CONTROL DE INVENTARIO${empresaCfg.nombre?' · '+empresaCfg.nombre.toUpperCase():''}`],
    ['Plantilla de carga masiva de productos · Generada: '+ahora],
    [],
    ['INSTRUCCIONES'],
    ['1. Complete los datos de los productos en la hoja "Productos". Cada fila = un producto.'],
    ['2. NO modifique los nombres de las columnas (encabezado de la primera fila).'],
    ['3. Borre las filas de ejemplo antes de cargar.'],
    ['4. El "Código Interno" se asigna automáticamente al cargar (P000001, P000002, ...).'],
    ['5. Guarde el archivo y vuelva al sistema → Productos → Importar Excel.'],
    [],
    ['CAMPOS'],
    ['Campo','Obligatorio','Descripción / Validación'],
    ['EAN','No','Código de barras. Debe ser único si se ingresa. Solo dígitos.'],
    ['Descripcion','SÍ','Nombre del producto. Se guarda tal cual lo ingrese.'],
    ['UM','SÍ','Unidad de medida. Valores válidos: '+UM_VALIDAS.join(', ')],
    ['Tipo','SÍ','Tipo de producto. Vea hoja "Listas válidas".'],
    ['Grupo','SÍ','Grupo del producto. Vea hoja "Listas válidas".'],
    ['SubGrupo','No','Sub-grupo. Si lo informa, debe pertenecer al grupo indicado.'],
    ['ManejaAtributos','No','SI / NO. Si es SI, las entradas pedirán lote y vencimiento.'],
    ['Inventariable','No','SI / NO. Si es NO, el producto no lleva control de stock (servicios). Default SI.'],
    ['StockMinimo','No','Número. Para alertas de bajo stock. Default 0.'],
    ['IVA','No','SI / NO. Si el producto es afecto a IVA (19%). Default SI.'],
    ['ImpuestoEspecifico','No','SI / NO. Si aplica impuesto específico a combustibles (diésel, gasolina). Default NO. El monto se ingresa al registrar la factura.'],
    ['ILA','No','SI / NO. Si aplica ILA (bebidas y licores). Default NO. El monto se ingresa al registrar la factura.'],
    [],
    ['REGLAS'],
    ['• Productos con EAN duplicado serán rechazados.'],
    ['• Filas con Descripción vacía serán omitidas.'],
    ['• Si el Tipo o Grupo no existe, la fila se rechaza (debe crearlos antes en Configuración).'],
    ['• Si el Sub-Grupo no pertenece al Grupo indicado, queda en blanco con aviso.'],
    ['• Antes de cargar, el sistema mostrará una vista previa con errores y aciertos.'],
  ];
  const ws2=XLSX.utils.aoa_to_sheet(inst);
  ws2['!cols']=[{wch:22},{wch:14},{wch:80}];

  // Hoja 3: Listas válidas
  const listas=[];
  listas.push(['UNIDADES DE MEDIDA VÁLIDAS']);
  UM_VALIDAS.forEach(u=>listas.push([u]));
  listas.push([]);
  listas.push(['TIPOS DE PRODUCTO ACTIVOS ('+tipos.length+')']);
  tipos.forEach(t=>listas.push([t]));
  listas.push([]);
  listas.push(['GRUPOS / SUB-GRUPOS ('+grupos.length+')']);
  listas.push(['Grupo','Sub-Grupos disponibles']);
  subgruposPorGrupo.forEach(g=>listas.push([g.Grupo,g.SubGrupos]));
  const ws3=XLSX.utils.aoa_to_sheet(listas);
  ws3['!cols']=[{wch:30},{wch:60}];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws1,'Productos');
  XLSX.utils.book_append_sheet(wb,ws2,'Instrucciones');
  XLSX.utils.book_append_sheet(wb,ws3,'Listas válidas');
  XLSX.writeFile(wb,`Plantilla_Productos_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Plantilla descargada','Complete la hoja Productos y vuelva a importarla');
}

/* ── Lectura del Excel y previa ── */
async function previewImportProductos(file){
  if(!can('productos.crear')){toast('Sin permiso','No puede crear productos','error');return}
  showLoading();
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    // Buscar hoja "Productos" o usar la primera
    const sheetName=wb.SheetNames.find(n=>n.toLowerCase().includes('producto'))||wb.SheetNames[0];
    const ws=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    hideLoading();
    if(rows.length===0){toast('Excel vacío','La hoja no contiene filas','error');return}
    // Validar encabezados
    const firstRow=rows[0];
    const headers=Object.keys(firstRow);
    const missing=PLANTILLA_HEADERS.filter(h=>!headers.includes(h));
    if(missing.length>0){
      toast('Encabezados faltantes','Faltan columnas: '+missing.join(', '),'error');
      return;
    }
    // Validar fila por fila
    const validate=_validateBulkRows(rows);
    _showImportPreview(validate,file.name);
  }catch(e){
    hideLoading();
    toast('Error leyendo Excel',e.message,'error');
    console.error(e);
  }
}

function _normaliza(s){return String(s||'').trim()}
function _normalizaSI(s){
  const v=_normaliza(s).toUpperCase();
  return ['SI','SÍ','S','Y','YES','TRUE','1','X'].includes(v);
}

function _validateBulkRows(rows){
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).map(t=>t.nombre);
  const tiposLower=tipos.map(t=>t.toLowerCase());
  const grupos=STATE.cache.groups;
  const gruposLower=grupos.map(g=>g.nombre.toLowerCase());
  const eansExistentes=new Set(STATE.cache.products.map(p=>p.codigoEAN).filter(Boolean));
  const descExistentes=new Map(STATE.cache.products.map(p=>[p.descripcion.toLowerCase(),p.codigoInterno]));

  const validas=[];
  const invalidas=[];
  const eansEnArchivo=new Set();

  rows.forEach((r,idx)=>{
    const fila=idx+2; // +1 por encabezado, +1 por base 1
    const errs=[];
    const warns=[];
    const desc=_normaliza(r.Descripcion);
    if(!desc){errs.push('Descripción vacía')}
    const um=_normaliza(r.UM).toUpperCase();
    if(!um)errs.push('UM vacía');
    else if(!UM_VALIDAS.includes(um))errs.push(`UM "${um}" inválida (válidas: ${UM_VALIDAS.join(', ')})`);
    const tipo=_normaliza(r.Tipo).toUpperCase();
    if(!tipo)errs.push('Tipo vacío');
    else if(!tiposLower.includes(tipo.toLowerCase()))errs.push(`Tipo "${tipo}" no existe (créelo primero)`);
    const tipoCanon=tipos.find(t=>t.toLowerCase()===tipo.toLowerCase())||tipo;
    const grupo=_normaliza(r.Grupo).toUpperCase();
    if(!grupo)errs.push('Grupo vacío');
    else if(!gruposLower.includes(grupo.toLowerCase()))errs.push(`Grupo "${grupo}" no existe (créelo primero)`);
    const grupoCanon=grupos.find(g=>g.nombre.toLowerCase()===grupo.toLowerCase());
    const grupoNombre=grupoCanon?grupoCanon.nombre:grupo;
    let subGrupo=_normaliza(r.SubGrupo).toUpperCase();
    if(subGrupo&&grupoCanon){
      const sgs=(grupoCanon.subgrupos||[]).map(s=>s.toUpperCase());
      if(!sgs.includes(subGrupo)){
        warns.push(`Sub-grupo "${subGrupo}" no pertenece al grupo "${grupoNombre}", se omitirá`);
        subGrupo='';
      }
    }
    const ean=_normaliza(r.EAN).replace(/\D/g,'');
    if(ean){
      if(eansExistentes.has(ean))errs.push(`EAN "${ean}" ya existe en la base`);
      else if(eansEnArchivo.has(ean))errs.push(`EAN "${ean}" duplicado en este Excel`);
      else eansEnArchivo.add(ean);
    }
    // Aviso si la descripción coincide exactamente con un producto existente
    if(desc&&descExistentes.has(desc.toLowerCase())){
      warns.push(`Descripción ya existe como ${descExistentes.get(desc.toLowerCase())} (se creará uno nuevo igual)`);
    }
    const manejaAtrib=_normalizaSI(r.ManejaAtributos);
    // Inventariable: default SI (true). Solo es false si explícitamente dice NO.
    var invRaw = (r.Inventariable==null?'':String(r.Inventariable)).trim();
    var inventariable = invRaw==='' ? true : _normalizaSI(r.Inventariable);
    let stockMin=0;
    if(r.StockMinimo!==''&&r.StockMinimo!=null){
      const n=Number(String(r.StockMinimo).replace(',','.'));
      if(isNaN(n))warns.push(`Stock mínimo "${r.StockMinimo}" no es numérico, se usará 0`);
      else stockMin=n;
    }
    // Impuestos: IVA default SI; específico e ILA default NO
    var ivaRaw=(r.IVA==null?'':String(r.IVA)).trim();
    var aplicaIVA = ivaRaw==='' ? true : _normalizaSI(r.IVA);
    var aplicaIEC = _normalizaSI(r.ImpuestoEspecifico);
    var aplicaILA = _normalizaSI(r.ILA);

    const item={
      fila,
      data:{ean,descripcion:desc,unidadMedida:um,tipoProducto:tipoCanon,grupo:grupoNombre,subGrupo,manejaAtributos:manejaAtrib,inventariable:inventariable,stockMinimo:stockMin,aplicaIVA:aplicaIVA,aplicaIEC:aplicaIEC,aplicaILA:aplicaILA},
      errors:errs,warnings:warns
    };
    if(errs.length>0)invalidas.push(item);else validas.push(item);
  });

  return {validas,invalidas,total:rows.length};
}

function _showImportPreview(v,fileName){
  const total=v.total;
  const okCount=v.validas.length;
  const errCount=v.invalidas.length;
  const warnCount=v.validas.filter(x=>x.warnings.length>0).length;

  const header=`<div style="margin-bottom:14px;font-size:13px;line-height:1.6">
    <div><strong>Archivo:</strong> ${escapeHtml(fileName)}</div>
    <div><strong>Total de filas:</strong> ${total}</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <span class="badge badge-green">${okCount} válidas</span>
      ${warnCount>0?`<span class="badge badge-amber">${warnCount} con avisos</span>`:''}
      ${errCount>0?`<span class="badge badge-red">${errCount} con errores</span>`:''}
    </div>
  </div>`;

  let body=header;
  if(errCount>0){
    body+=`<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px">⚠ Las filas con errores NO se importarán. Corrija el Excel y vuelva a cargarlo si necesita esos productos.</div>`;
    body+=`<h4 style="color:var(--gd);font-size:13px;margin:14px 0 8px">Filas con errores (${errCount})</h4>`;
    body+=`<div style="max-height:200px;overflow:auto;border:1px solid var(--bo);border-radius:6px"><table class="detalle-table" style="margin:0">
      <thead><tr><th style="width:50px">Fila</th><th>Descripción</th><th>Errores</th></tr></thead>
      <tbody>${v.invalidas.slice(0,50).map(it=>`<tr>
        <td class="mono">${it.fila}</td>
        <td>${escapeHtml(it.data.descripcion||'(vacío)')}</td>
        <td style="color:var(--red);font-size:12px">${it.errors.map(e=>escapeHtml(e)).join('<br>')}</td>
      </tr>`).join('')}${v.invalidas.length>50?`<tr><td colspan="3" style="text-align:center;color:var(--mu);font-size:12px;padding:8px">… y ${v.invalidas.length-50} fila(s) más</td></tr>`:''}</tbody>
    </table></div>`;
  }
  if(okCount>0){
    body+=`<h4 style="color:var(--gd);font-size:13px;margin:14px 0 8px">Filas a importar (${okCount})</h4>`;
    body+=`<div style="max-height:260px;overflow:auto;border:1px solid var(--bo);border-radius:6px"><table class="detalle-table" style="margin:0">
      <thead><tr><th style="width:50px">Fila</th><th>EAN</th><th>Descripción</th><th>UM</th><th>Tipo</th><th>Grupo</th><th>Lote</th><th>Invent.</th><th>Avisos</th></tr></thead>
      <tbody>${v.validas.slice(0,100).map(it=>`<tr>
        <td class="mono">${it.fila}</td>
        <td class="mono">${escapeHtml(it.data.ean||'-')}</td>
        <td>${escapeHtml(it.data.descripcion)}</td>
        <td>${escapeHtml(it.data.unidadMedida)}</td>
        <td>${escapeHtml(it.data.tipoProducto)}</td>
        <td>${escapeHtml(it.data.grupo)}${it.data.subGrupo?' / '+escapeHtml(it.data.subGrupo):''}</td>
        <td>${it.data.manejaAtributos?'SI':'NO'}</td>
        <td>${it.data.inventariable!==false?'SI':'<span style="color:#e9730c;font-weight:700">NO</span>'}</td>
        <td style="color:var(--gm);font-size:11px">${it.warnings.map(w=>escapeHtml(w)).join('<br>')||'-'}</td>
      </tr>`).join('')}${v.validas.length>100?`<tr><td colspan="9" style="text-align:center;color:var(--mu);font-size:12px;padding:8px">… y ${v.validas.length-100} fila(s) más</td></tr>`:''}</tbody>
    </table></div>`;
  }

  // Guardar el resultado para que el botón de confirmar lo use
  STATE._bulkImportPending=v;

  showModal(`Vista previa de importación`,body,
    `<button class="btn btn-secondary" onclick="closeModal();STATE._bulkImportPending=null">Cancelar</button>
     ${okCount>0?`<button class="btn btn-primary" id="btnConfirmBulk">✓ Importar ${okCount} producto(s)</button>`:''}`,
    'xl');
  if(okCount>0){
    document.getElementById('btnConfirmBulk').onclick=()=>_executeBulkImport();
  }
}

async function _executeBulkImport(){
  const v=STATE._bulkImportPending;
  if(!v||v.validas.length===0)return;
  closeModal();
  showLoading();
  let creados=0,fallos=0;
  const fallidos=[];
  for(const it of v.validas){
    try{
      const cod=await nextProductCode();
      const np={
        codigoInterno:cod,
        codigoEAN:it.data.ean,
        descripcion:it.data.descripcion,
        unidadMedida:it.data.unidadMedida,
        tipoProducto:it.data.tipoProducto,
        grupo:it.data.grupo,
        subGrupo:it.data.subGrupo,
        manejaAtributos:!!it.data.manejaAtributos,
        inventariable:it.data.inventariable!==false,
        stockMinimo:it.data.stockMinimo||0,
        aplicaIVA:it.data.aplicaIVA!==false,
        aplicaIEC:!!it.data.aplicaIEC,
        aplicaILA:!!it.data.aplicaILA,
        activo:true,
        creado:new Date().toISOString(),
        cargaMasiva:true
      };
      await dbPut('products',np);
      creados++;
    }catch(e){
      fallos++;
      fallidos.push({fila:it.fila,desc:it.data.descripcion,err:e.message});
      console.error('Error creando producto fila',it.fila,e);
    }
  }
  await audit('producto.cargaMasiva',`Carga masiva: ${creados} producto(s) creado(s)`,`bulk-${creados}`);
  await reloadCache();
  hideLoading();
  STATE._bulkImportPending=null;
  if(fallos===0){
    toast('Importación exitosa',`Se crearon ${creados} producto(s)`);
  }else{
    toast('Importación con errores',`${creados} creados, ${fallos} con error`,'warning');
    console.warn('Productos fallidos:',fallidos);
  }
  if(STATE.page==='productos')renderProductos(document.getElementById('mainContent'));
}

/* ═══════════════ PAGE: BODEGAS ═══════════════ */
function renderBodegas(c){
  c.innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Bodegas</div><div class="page-subtitle">${STATE.cache.warehouses.length} bodega(s) · ${STATE.cache.warehouses.filter(w=>w.activo).length} activa(s)</div></div>
      ${can('bodegas.crear')?`<button class="btn btn-primary" onclick="openBodegaForm()">+ Nueva Bodega</button>`:''}
    </div>
    <div class="card">
      <div class="table-wrap">
        ${STATE.cache.warehouses.length===0?'<div class="empty-state"><div class="empty-state-icon">🏭</div><div class="empty-state-title">Sin bodegas</div></div>':
        `<table class="data">
          <thead><tr><th>ID</th><th>Nombre</th><th>Dirección</th><th class="center">Estado</th><th class="num">Productos</th><th class="num">Valor inventariable</th><th class="num">Valor servicios</th><th class="num">Valor total</th><th class="actions">Acciones</th></tr></thead>
          <tbody>${STATE.cache.warehouses.map(b=>{
            const sk=STATE.cache.stock.filter(s=>s.bodegaId===b.id&&s.cantidad>0);
            let valorInv=0, valorNoInv=0;
            sk.forEach(x=>{
              const prod=getProduct(x.codigoInterno);
              const v=x.cantidad*x.costoPromedio;
              if(prod && prod.inventariable===false) valorNoInv+=v;
              else valorInv+=v;
            });
            const valorTotal=valorInv+valorNoInv;
            return `<tr><td class="mono"><strong>${b.id}</strong></td>
              <td>${escapeHtml(b.nombre)}</td>
              <td>${escapeHtml(b.direccion||'-')}</td>
              <td class="center">${b.activo?'<span class="badge badge-green">Activa</span>':'<span class="badge badge-gray">Inactiva</span>'}</td>
              <td class="num">${sk.length}</td>
              <td class="num">${fmtMon(valorInv)}</td>
              <td class="num" style="color:#e9730c">${valorNoInv>0?fmtMon(valorNoInv):'-'}</td>
              <td class="num"><strong>${fmtMon(valorTotal)}</strong></td>
              <td class="actions">${can('bodegas.crear')?`<button class="btn btn-secondary btn-sm" onclick="openBodegaForm('${b.id}')">Editar</button>`:''}</td>
            </tr>`;
          }).join('')}</tbody></table>`}
      </div>
    </div>`;
}
function openBodegaForm(id=null){
  const b=id?getWarehouse(id):null;
  showModal(b?`Editar bodega · ${b.id}`:'Nueva bodega',
    `<div class="form-grid">
      <div class="form-field required"><label>ID / Código</label><input type="text" id="fbId" value="${b?b.id:''}" ${b?'readonly':''} placeholder="B002" maxlength="10"><div class="hint">${b?'No editable':'Identificador único, ej: B002'}</div></div>
      <div class="form-field required"><label>Nombre</label><input type="text" id="fbNom" value="${escapeHtml(b?.nombre||'')}" placeholder="Bodega Central"></div>
      <div class="form-field span-2"><label>Dirección</label><input type="text" id="fbDir" value="${escapeHtml(b?.direccion||'')}"></div>
      <div class="form-field span-2"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="fbActiva" ${!b||b.activo?'checked':''}><span class="switch-slider"></span></span>
          <span id="fbActLbl">Activa</span>
        </label>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveBodega(${b?`'${b.id}'`:'null'})">${b?'Guardar':'Crear bodega'}</button>`,
    'md');
  document.getElementById('fbActiva').addEventListener('change',e=>document.getElementById('fbActLbl').textContent=e.target.checked?'Activa':'Inactiva');
}
async function saveBodega(id){
  const idVal=(id||document.getElementById('fbId').value.trim().toUpperCase());
  const nom=document.getElementById('fbNom').value.trim();
  const dir=document.getElementById('fbDir').value.trim();
  const act=document.getElementById('fbActiva').checked;
  if(!idVal){toast('Falta ID','El ID es obligatorio','error');return}
  if(!nom){toast('Falta nombre','El nombre es obligatorio','error');return}
  if(!id && getWarehouse(idVal)){toast('ID duplicado','Ya existe una bodega con este ID','error');return}
  await dbPut('warehouses',{id:idVal,nombre:nom,direccion:dir,activo:act,creado:id?(getWarehouse(idVal)?.creado||new Date().toISOString()):new Date().toISOString()});
  await audit(id?'bodega.editar':'bodega.crear',nom,idVal);
  await reloadCache();
  closeModal();toast(id?'Bodega actualizada':'Bodega creada');
  renderBodegas(document.getElementById('mainContent'));
}

/* ═══════════════ PAGE: PROVEEDORES ═══════════════ */
let provFilter={search:'',activo:''};
function renderProveedores(c){
  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Proveedores</div>
        <div class="page-subtitle">Ficha · ${STATE.cache.providers.length} proveedor(es)</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="exportProveedoresExcel()">📊 Exportar Excel</button>
        ${can('proveedores.crear')?`<button class="btn btn-primary" onclick="openProveedorForm()">+ Nuevo Proveedor</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filter-bar" style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;gap:10px;flex-wrap:wrap">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar</label><input type="text" id="prvSearch" value="${escapeHtml(provFilter.search)}" placeholder="Código, razón social, RUT, giro..."></div>
        <div class="form-field"><label>Estado</label><select id="prvAct"><option value="">Todos</option><option value="1" ${provFilter.activo==='1'?'selected':''}>Activos</option><option value="0" ${provFilter.activo==='0'?'selected':''}>Inactivos</option></select></div>
      </div>
      <div id="prvTable"></div>
    </div>`;
  ['prvSearch','prvAct'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    provFilter.search=document.getElementById('prvSearch').value;
    provFilter.activo=document.getElementById('prvAct').value;
    renderProveedoresTable();
  }));
  renderProveedoresTable();
}
function renderProveedoresTable(){
  const w=document.getElementById('prvTable');
  const hayFiltro = provFilter.search || provFilter.activo;
  if(!hayFiltro){
    w.innerHTML='<div class="empty-state" style="padding:40px 20px">'+
      '<div class="empty-state-icon">🔍</div>'+
      '<div class="empty-state-title">Busca o filtra proveedores</div>'+
      '<div class="empty-state-text">Usa el buscador (código, razón social, RUT o giro) o el filtro de estado.<br>Hay <strong>'+STATE.cache.providers.length+'</strong> proveedor(es) registrados.</div>'+
      (can('proveedores.crear')?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openProveedorForm()">+ Nuevo proveedor</button>':'')+
    '</div>';
    return;
  }
  let rows=[...STATE.cache.providers];
  if(provFilter.search){
    const s=provFilter.search.toLowerCase();
    rows=rows.filter(p=>(p.codigo+' '+p.razonSocial+' '+(p.rut||'')+' '+(p.giro||'')).toLowerCase().includes(s));
  }
  if(provFilter.activo==='1')rows=rows.filter(p=>p.activo!==false);
  if(provFilter.activo==='0')rows=rows.filter(p=>p.activo===false);
  rows=rows.sort((a,b)=>a.razonSocial.localeCompare(b.razonSocial));
  if(rows.length===0){
    w.innerHTML='<div class="empty-state"><div class="empty-state-icon">🚚</div><div class="empty-state-title">Sin proveedores</div><div class="empty-state-text">'+(STATE.cache.providers.length===0?'Crea el primer proveedor':'No hay coincidencias con los filtros')+'</div></div>';return;
  }
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>Código</th><th>RUT</th><th>Razón Social</th><th>Giro</th><th>Comuna</th><th>Teléfono</th><th class="center">Estado</th><th class="actions">Acciones</th></tr></thead>
    <tbody>${rows.map(p=>`<tr class="row-link" onclick="viewProveedor('${escapeHtml(p.codigo)}')">
      <td class="mono"><strong>${escapeHtml(p.codigo)}</strong></td>
      <td class="mono">${escapeHtml(p.rut||'-')}</td>
      <td>${escapeHtml(p.razonSocial)}</td>
      <td>${escapeHtml(p.giro||'-')}</td>
      <td>${escapeHtml(p.comuna||'-')}</td>
      <td>${escapeHtml(p.telefono||'-')}</td>
      <td class="center">${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</td>
      <td class="actions" onclick="event.stopPropagation()">
        ${can('proveedores.crear')?`<button class="btn btn-secondary btn-sm" onclick="openProveedorForm('${escapeHtml(p.codigo)}')">Editar</button>`:''}
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function viewProveedor(codigo){
  const p=STATE.cache.providers.find(x=>x.codigo===codigo);if(!p)return;
  // Calcular movimientos recientes con este proveedor
  const movs=STATE.cache.movements.filter(m=>m.tipo==='ENT'&&m.proveedorCodigo===codigo&&!m.anulado).sort((a,b)=>b.numero.localeCompare(a.numero));
  const recientes=movs.slice(0,8);
  const totalMov=movs.length;
  const totalValor=movs.reduce((s,m)=>s+(m.detalles||[]).reduce((ss,d)=>ss+d.cantidad*d.costo,0),0);
  showModal(`Proveedor · ${p.codigo}`,
    `<div class="form-grid">
      <div class="form-field"><label>Código (RUT s/DV)</label><div class="mono"><strong>${escapeHtml(p.codigo)}</strong></div></div>
      <div class="form-field"><label>RUT completo</label><div class="mono">${escapeHtml(p.rut||'-')}</div></div>
      <div class="form-field span-2"><label>Razón social</label><div><strong>${escapeHtml(p.razonSocial)}</strong></div></div>
      <div class="form-field span-2"><label>Giro</label><div>${escapeHtml(p.giro||'-')}</div></div>
      <div class="form-field span-2"><label>Dirección</label><div>${escapeHtml(p.direccion||'-')}</div></div>
      <div class="form-field"><label>Comuna</label><div>${escapeHtml(p.comuna||'-')}</div></div>
      <div class="form-field"><label>Ciudad</label><div>${escapeHtml(p.ciudad||'-')}</div></div>
      <div class="form-field"><label>Teléfono</label><div>${escapeHtml(p.telefono||'-')}</div></div>
      <div class="form-field"><label>Email</label><div>${escapeHtml(p.email||'-')}</div></div>
      <div class="form-field span-2"><label>Contacto</label><div>${escapeHtml(p.contacto||'-')}</div></div>
      <div class="form-field"><label>Estado</label><div>${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</div></div>
      <div class="form-field"><label>Creado</label><div style="font-size:12px;color:var(--mu)">${p.creado?fmtDate(p.creado):'-'}</div></div>
    </div>
    <div style="margin-top:18px;padding:12px;background:var(--gp);border-radius:8px">
      <div style="font-size:12px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Resumen de compras</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:var(--mu)">Movimientos</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${totalMov}</div></div>
        <div><div style="font-size:11px;color:var(--mu)">Valor acumulado</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${fmtMon(totalValor)}</div></div>
      </div>
    </div>
    ${recientes.length>0?`<h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Últimas entradas</h4>
    <table class="detalle-table"><thead><tr><th>N°</th><th>Fecha</th><th>Documento</th><th class="num">Items</th><th class="num">Valor</th></tr></thead>
    <tbody>${recientes.map(m=>{const v=(m.detalles||[]).reduce((s,d)=>s+d.cantidad*d.costo,0);return `<tr><td class="mono">${m.numero}</td><td>${fmtDateOnly(m.fecha)}</td><td class="mono">${escapeHtml((m.tipoDoc||'')+' '+(m.numeroDoc||''))}</td><td class="num">${(m.detalles||[]).length}</td><td class="num">${fmtMon(v)}</td></tr>`}).join('')}</tbody></table>`:''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${can('proveedores.crear')?`<button class="btn btn-primary" onclick="closeModal();openProveedorForm('${escapeHtml(codigo)}')">✏️ Editar</button>`:''}`,
    'xl');
}

function openProveedorForm(codigo=null,opts={}){
  // opts.fromMov: si viene del form de movimiento, después de guardar volver a allá
  // opts.prefilledCodigo: código pre-llenado al abrir (para creación rápida desde entrada)
  const p=codigo?STATE.cache.providers.find(x=>x.codigo===codigo):null;
  const isNew=!p;
  const preCod=opts.prefilledCodigo||'';
  showModal(p?`Editar proveedor · ${p.codigo}`:'Nuevo proveedor',
    `<div class="form-grid">
      <div class="form-field required"><label>Código (RUT sin guión ni DV)</label>
        <input type="text" id="pvCod" value="${escapeHtml(p?p.codigo:preCod)}" ${p?'readonly':''} placeholder="Ej: 77684700" maxlength="9" inputmode="numeric">
        <div class="hint">${p?'No editable. Es la clave única.':'Solo dígitos. Ej: para 77.684.700-7 ingrese 77684700'}</div>
      </div>
      <div class="form-field"><label>RUT completo (con DV)</label>
        <input type="text" id="pvRut" value="${escapeHtml(p?.rut||'')}" placeholder="Ej: 77.684.700-7">
        <div class="hint">Opcional, solo para mostrar</div>
      </div>
      <div class="form-field span-2 required"><label>Razón social</label><input type="text" id="pvRS" value="${escapeHtml(p?.razonSocial||'')}" placeholder="Nombre legal del proveedor"></div>
      <div class="form-field span-2"><label>Giro</label><input type="text" id="pvGiro" value="${escapeHtml(p?.giro||'')}" placeholder="Actividad económica"></div>
      <div class="form-field span-2"><label>Dirección</label><input type="text" id="pvDir" value="${escapeHtml(p?.direccion||'')}"></div>
      <div class="form-field"><label>Comuna</label><input type="text" id="pvCom" value="${escapeHtml(p?.comuna||'')}"></div>
      <div class="form-field"><label>Ciudad</label><input type="text" id="pvCiu" value="${escapeHtml(p?.ciudad||'')}"></div>
      <div class="form-field"><label>Teléfono</label><input type="text" id="pvTel" value="${escapeHtml(p?.telefono||'')}"></div>
      <div class="form-field"><label>Email</label><input type="email" id="pvMail" value="${escapeHtml(p?.email||'')}"></div>
      <div class="form-field span-2"><label>Contacto</label><input type="text" id="pvCont" value="${escapeHtml(p?.contacto||'')}" placeholder="Nombre del contacto comercial"></div>
      ${!isNew?`<div class="form-field span-2"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="pvAct" ${p.activo!==false?'checked':''}><span class="switch-slider"></span></span>
          <span id="pvActLbl">${p.activo!==false?'Activo':'Inactivo'}</span>
        </label></div>`:''}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()${opts.fromMov?';_renderMovForm(document.getElementById(\'mainContent\'))':''}">Cancelar</button>
     <button class="btn btn-primary" onclick="saveProveedor(${p?`'${escapeHtml(p.codigo)}'`:'null'}, ${JSON.stringify(opts).replace(/"/g,'&quot;')})">${p?'Guardar cambios':'Crear proveedor'}</button>`,
    'lg');
  setTimeout(()=>{
    const cod=document.getElementById('pvCod');if(cod&&!p&&!preCod)cod.focus();
    const rs=document.getElementById('pvRS');if(rs&&(p||preCod))rs.focus();
  },50);
  const actEl=document.getElementById('pvAct');
  if(actEl)actEl.addEventListener('change',e=>{document.getElementById('pvActLbl').textContent=e.target.checked?'Activo':'Inactivo'});
  // Solo dígitos en código
  const codEl=document.getElementById('pvCod');
  if(codEl&&!p)codEl.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'')});
}

async function saveProveedor(existing,opts){
  opts=opts||{};
  const cod=document.getElementById('pvCod').value.trim().replace(/\D/g,'');
  const rs=document.getElementById('pvRS').value.trim();
  const rut=document.getElementById('pvRut').value.trim();
  const giro=document.getElementById('pvGiro').value.trim();
  const dir=document.getElementById('pvDir').value.trim();
  const com=document.getElementById('pvCom').value.trim();
  const ciu=document.getElementById('pvCiu').value.trim();
  const tel=document.getElementById('pvTel').value.trim();
  const mail=document.getElementById('pvMail').value.trim();
  const cont=document.getElementById('pvCont').value.trim();
  if(!cod){toast('Falta código','Ingrese el RUT sin DV','error');return}
  if(cod.length<6||cod.length>9){toast('Código inválido','El RUT (sin DV) debe tener entre 6 y 9 dígitos','error');return}
  if(!rs){toast('Falta razón social','La razón social es obligatoria','error');return}
  if(!existing&&STATE.cache.providers.find(x=>x.codigo===cod)){toast('Código duplicado','Ya existe un proveedor con ese código','error');return}
  let obj;
  if(existing){
    obj=STATE.cache.providers.find(x=>x.codigo===existing);
    obj.modificado=new Date().toISOString();
    const actEl=document.getElementById('pvAct');
    if(actEl)obj.activo=actEl.checked;
  }else{
    obj={codigo:cod,activo:true,creado:new Date().toISOString()};
  }
  obj.razonSocial=rs;obj.rut=rut;obj.giro=giro;obj.direccion=dir;obj.comuna=com;obj.ciudad=ciu;obj.telefono=tel;obj.email=mail;obj.contacto=cont;
  await dbPut('providers',obj);
  await audit(existing?'proveedor.editar':'proveedor.crear',`${existing?'Edición':'Creación'} de proveedor ${rs}`,obj.codigo);
  await reloadCache();closeModal();
  toast(existing?'Proveedor actualizado':'Proveedor creado',rs);
  // Si fue creado desde el formulario de entrada, regresar y rellenar
  if(opts.fromMov){
    movDraft.proveedorCodigo=obj.codigo;
    movDraft.proveedorNombre=obj.razonSocial;
    _renderMovForm(document.getElementById('mainContent'));
  }else if(STATE.page==='proveedores'){
    renderProveedores(document.getElementById('mainContent'));
  }
}

function exportProveedoresExcel(){
  const data=STATE.cache.providers.map(p=>({
    'Código':p.codigo,'RUT':p.rut||'','Razón Social':p.razonSocial,'Giro':p.giro||'',
    'Dirección':p.direccion||'','Comuna':p.comuna||'','Ciudad':p.ciudad||'',
    'Teléfono':p.telefono||'','Email':p.email||'','Contacto':p.contacto||'',
    'Estado':p.activo===false?'Inactivo':'Activo','Creado':p.creado?fmtDate(p.creado):''
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Proveedores');
  XLSX.writeFile(wb,`proveedores_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ PAGE: CLIENTES ═══════════════ */
let cliFilter={search:'',activo:''};
function renderClientes(c){
  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Clientes</div>
        <div class="page-subtitle">Ficha · ${STATE.cache.customers.length} cliente(s)</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="exportClientesExcel()">📊 Exportar Excel</button>
        ${can('clientes.crear')?`<button class="btn btn-primary" onclick="openClienteForm()">+ Nuevo Cliente</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filter-bar" style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;gap:10px;flex-wrap:wrap">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar</label><input type="text" id="cliSearch" value="${escapeHtml(cliFilter.search)}" placeholder="Código, razón social, RUT, giro..."></div>
        <div class="form-field"><label>Estado</label><select id="cliAct"><option value="">Todos</option><option value="1" ${cliFilter.activo==='1'?'selected':''}>Activos</option><option value="0" ${cliFilter.activo==='0'?'selected':''}>Inactivos</option></select></div>
      </div>
      <div id="cliTable"></div>
    </div>`;
  ['cliSearch','cliAct'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    cliFilter.search=document.getElementById('cliSearch').value;
    cliFilter.activo=document.getElementById('cliAct').value;
    renderClientesTable();
  }));
  renderClientesTable();
}
function renderClientesTable(){
  const w=document.getElementById('cliTable');
  const hayFiltro = cliFilter.search || cliFilter.activo;
  if(!hayFiltro){
    w.innerHTML='<div class="empty-state" style="padding:40px 20px">'+
      '<div class="empty-state-icon">🔍</div>'+
      '<div class="empty-state-title">Busca o filtra clientes</div>'+
      '<div class="empty-state-text">Usa el buscador (código, razón social, RUT o giro) o el filtro de estado.<br>Hay <strong>'+STATE.cache.customers.length+'</strong> cliente(s) registrados.</div>'+
      (can('clientes.crear')?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openClienteForm()">+ Nuevo cliente</button>':'')+
    '</div>';
    return;
  }
  let rows=[...STATE.cache.customers];
  if(cliFilter.search){
    const s=cliFilter.search.toLowerCase();
    rows=rows.filter(p=>(p.codigo+' '+p.razonSocial+' '+(p.rut||'')+' '+(p.giro||'')).toLowerCase().includes(s));
  }
  if(cliFilter.activo==='1')rows=rows.filter(p=>p.activo!==false);
  if(cliFilter.activo==='0')rows=rows.filter(p=>p.activo===false);
  rows=rows.sort((a,b)=>a.razonSocial.localeCompare(b.razonSocial));
  if(rows.length===0){
    w.innerHTML='<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-title">Sin clientes</div><div class="empty-state-text">'+(STATE.cache.customers.length===0?'Crea el primer cliente':'No hay coincidencias con los filtros')+'</div></div>';return;
  }
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>Código</th><th>RUT</th><th>Razón Social</th><th>Giro</th><th>Comuna</th><th>Teléfono</th><th class="center">Estado</th><th class="actions">Acciones</th></tr></thead>
    <tbody>${rows.map(p=>`<tr class="row-link" onclick="viewCliente('${escapeHtml(p.codigo)}')">
      <td class="mono"><strong>${escapeHtml(p.codigo)}</strong></td>
      <td class="mono">${escapeHtml(p.rut||'-')}</td>
      <td>${escapeHtml(p.razonSocial)}</td>
      <td>${escapeHtml(p.giro||'-')}</td>
      <td>${escapeHtml(p.comuna||'-')}</td>
      <td>${escapeHtml(p.telefono||'-')}</td>
      <td class="center">${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</td>
      <td class="actions" onclick="event.stopPropagation()">
        ${can('clientes.crear')?`<button class="btn btn-secondary btn-sm" onclick="openClienteForm('${escapeHtml(p.codigo)}')">Editar</button>`:''}
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function viewCliente(codigo){
  const p=STATE.cache.customers.find(x=>x.codigo===codigo);if(!p)return;
  const movs=STATE.cache.movements.filter(m=>m.tipo==='SAL'&&m.clienteCodigo===codigo&&!m.anulado).sort((a,b)=>b.numero.localeCompare(a.numero));
  const recientes=movs.slice(0,8);
  const totalMov=movs.length;
  const totalValor=movs.reduce((s,m)=>s+(m.detalles||[]).reduce((ss,d)=>ss+d.cantidad*d.costo,0),0);
  showModal(`Cliente · ${p.codigo}`,
    `<div class="form-grid">
      <div class="form-field"><label>Código (RUT s/DV)</label><div class="mono"><strong>${escapeHtml(p.codigo)}</strong></div></div>
      <div class="form-field"><label>RUT completo</label><div class="mono">${escapeHtml(p.rut||'-')}</div></div>
      <div class="form-field span-2"><label>Razón social</label><div><strong>${escapeHtml(p.razonSocial)}</strong></div></div>
      <div class="form-field span-2"><label>Giro</label><div>${escapeHtml(p.giro||'-')}</div></div>
      <div class="form-field span-2"><label>Dirección</label><div>${escapeHtml(p.direccion||'-')}</div></div>
      <div class="form-field"><label>Comuna</label><div>${escapeHtml(p.comuna||'-')}</div></div>
      <div class="form-field"><label>Ciudad</label><div>${escapeHtml(p.ciudad||'-')}</div></div>
      <div class="form-field"><label>Teléfono</label><div>${escapeHtml(p.telefono||'-')}</div></div>
      <div class="form-field"><label>Email</label><div>${escapeHtml(p.email||'-')}</div></div>
      <div class="form-field span-2"><label>Contacto</label><div>${escapeHtml(p.contacto||'-')}</div></div>
      <div class="form-field"><label>Estado</label><div>${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</div></div>
      <div class="form-field"><label>Creado</label><div style="font-size:12px;color:var(--mu)">${p.creado?fmtDate(p.creado):'-'}</div></div>
    </div>
    <div style="margin-top:18px;padding:12px;background:var(--gp);border-radius:8px">
      <div style="font-size:12px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Resumen de ventas</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:var(--mu)">Movimientos</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${totalMov}</div></div>
        <div><div style="font-size:11px;color:var(--mu)">Valor acumulado</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${fmtMon(totalValor)}</div></div>
      </div>
    </div>
    ${recientes.length>0?`<h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Últimas salidas</h4>
    <table class="detalle-table"><thead><tr><th>N°</th><th>Fecha</th><th>Documento</th><th class="num">Items</th><th class="num">Valor</th></tr></thead>
    <tbody>${recientes.map(m=>{const v=(m.detalles||[]).reduce((s,d)=>s+d.cantidad*d.costo,0);return `<tr><td class="mono">${m.numero}</td><td>${fmtDateOnly(m.fecha)}</td><td class="mono">${escapeHtml((m.tipoDoc||'')+' '+(m.numeroDoc||''))}</td><td class="num">${(m.detalles||[]).length}</td><td class="num">${fmtMon(v)}</td></tr>`}).join('')}</tbody></table>`:''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${can('clientes.crear')?`<button class="btn btn-primary" onclick="closeModal();openClienteForm('${escapeHtml(codigo)}')">✏️ Editar</button>`:''}`,
    'xl');
}

function openClienteForm(codigo=null,opts={}){
  const p=codigo?STATE.cache.customers.find(x=>x.codigo===codigo):null;
  const isNew=!p;
  const preCod=opts.prefilledCodigo||'';
  showModal(p?`Editar cliente · ${p.codigo}`:(opts.fromMov?'Crear cliente desde salida':'Nuevo cliente'),
    `${opts.fromMov?'<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">👤 Estás creando un nuevo cliente sin perder los datos de la salida en curso. Al guardar, volverás al formulario con el cliente ya seleccionado.</div>':''}
    <div class="form-grid">
      <div class="form-field required"><label>Código (RUT sin guión ni DV)</label>
        <input type="text" id="clCod" value="${escapeHtml(p?p.codigo:preCod)}" ${p?'readonly':''} placeholder="Ej: 77684700" maxlength="9" inputmode="numeric">
        <div class="hint">${p?'No editable. Es la clave única.':'Solo dígitos. Ej: para 77.684.700-7 ingrese 77684700'}</div>
      </div>
      <div class="form-field"><label>RUT completo (con DV)</label>
        <input type="text" id="clRut" value="${escapeHtml(p?.rut||'')}" placeholder="Ej: 77.684.700-7">
        <div class="hint">Opcional, solo para mostrar</div>
      </div>
      <div class="form-field span-2 required"><label>Razón social</label><input type="text" id="clRS" value="${escapeHtml(p?.razonSocial||'')}" placeholder="Nombre legal del cliente"></div>
      <div class="form-field span-2"><label>Giro</label><input type="text" id="clGiro" value="${escapeHtml(p?.giro||'')}" placeholder="Actividad económica"></div>
      <div class="form-field span-2"><label>Dirección</label><input type="text" id="clDir" value="${escapeHtml(p?.direccion||'')}"></div>
      <div class="form-field"><label>Comuna</label><input type="text" id="clCom" value="${escapeHtml(p?.comuna||'')}"></div>
      <div class="form-field"><label>Ciudad</label><input type="text" id="clCiu" value="${escapeHtml(p?.ciudad||'')}"></div>
      <div class="form-field"><label>Teléfono</label><input type="text" id="clTel" value="${escapeHtml(p?.telefono||'')}"></div>
      <div class="form-field"><label>Email</label><input type="email" id="clMail" value="${escapeHtml(p?.email||'')}"></div>
      <div class="form-field span-2"><label>Contacto</label><input type="text" id="clCont" value="${escapeHtml(p?.contacto||'')}" placeholder="Nombre del contacto comercial"></div>
      ${!isNew?`<div class="form-field span-2"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="clAct" ${p.activo!==false?'checked':''}><span class="switch-slider"></span></span>
          <span id="clActLbl">${p.activo!==false?'Activo':'Inactivo'}</span>
        </label></div>`:''}
    </div>`,
    `<button class="btn btn-secondary" id="clCancel">${opts.fromMov?'← Volver a la salida':'Cancelar'}</button>
     <button class="btn btn-primary" id="clSave">${p?'Guardar cambios':(opts.fromMov?'Crear y volver':'Crear cliente')}</button>`,
    'lg');
  document.getElementById('clCancel').onclick=()=>{
    closeModal();
    if(opts.fromMov)_renderMovForm(document.getElementById('mainContent'));
  };
  document.getElementById('clSave').onclick=()=>saveCliente(p?p.codigo:null,opts);
  setTimeout(()=>{
    const cod=document.getElementById('clCod');if(cod&&!p&&!preCod)cod.focus();
    const rs=document.getElementById('clRS');if(rs&&(p||preCod))rs.focus();
  },50);
  const actEl=document.getElementById('clAct');
  if(actEl)actEl.addEventListener('change',e=>{document.getElementById('clActLbl').textContent=e.target.checked?'Activo':'Inactivo'});
  const codEl=document.getElementById('clCod');
  if(codEl&&!p)codEl.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'')});
}

async function saveCliente(existing,opts){
  opts=opts||{};
  const cod=document.getElementById('clCod').value.trim().replace(/\D/g,'');
  const rs=document.getElementById('clRS').value.trim();
  const rut=document.getElementById('clRut').value.trim();
  const giro=document.getElementById('clGiro').value.trim();
  const dir=document.getElementById('clDir').value.trim();
  const com=document.getElementById('clCom').value.trim();
  const ciu=document.getElementById('clCiu').value.trim();
  const tel=document.getElementById('clTel').value.trim();
  const mail=document.getElementById('clMail').value.trim();
  const cont=document.getElementById('clCont').value.trim();
  if(!cod){toast('Falta código','Ingrese el RUT sin DV','error');return}
  if(cod.length<6||cod.length>9){toast('Código inválido','El RUT (sin DV) debe tener entre 6 y 9 dígitos','error');return}
  if(!rs){toast('Falta razón social','La razón social es obligatoria','error');return}
  if(!existing&&STATE.cache.customers.find(x=>x.codigo===cod)){toast('Código duplicado','Ya existe un cliente con ese código','error');return}
  let obj;
  if(existing){
    obj=STATE.cache.customers.find(x=>x.codigo===existing);
    obj.modificado=new Date().toISOString();
    const actEl=document.getElementById('clAct');
    if(actEl)obj.activo=actEl.checked;
  }else{
    obj={codigo:cod,activo:true,creado:new Date().toISOString()};
  }
  obj.razonSocial=rs;obj.rut=rut;obj.giro=giro;obj.direccion=dir;obj.comuna=com;obj.ciudad=ciu;obj.telefono=tel;obj.email=mail;obj.contacto=cont;
  await dbPut('customers',obj);
  await audit(existing?'cliente.editar':'cliente.crear',`${existing?'Edición':'Creación'} de cliente ${rs}`,obj.codigo);
  await reloadCache();closeModal();
  toast(existing?'Cliente actualizado':'Cliente creado',rs);
  if(opts.fromMov){
    movDraft.clienteCodigo=obj.codigo;
    movDraft.clienteNombre=obj.razonSocial;
    _renderMovForm(document.getElementById('mainContent'));
  }else if(STATE.page==='clientes'){
    renderClientes(document.getElementById('mainContent'));
  }
}

function exportClientesExcel(){
  const data=STATE.cache.customers.map(p=>({
    'Código':p.codigo,'RUT':p.rut||'','Razón Social':p.razonSocial,'Giro':p.giro||'',
    'Dirección':p.direccion||'','Comuna':p.comuna||'','Ciudad':p.ciudad||'',
    'Teléfono':p.telefono||'','Email':p.email||'','Contacto':p.contacto||'',
    'Estado':p.activo===false?'Inactivo':'Activo','Creado':p.creado?fmtDate(p.creado):''
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Clientes');
  XLSX.writeFile(wb,`clientes_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ PAGE: CENTROS DE COSTO ═══════════════ */
let ccFilter={search:'',activo:'',area:''};
function renderCentrosCosto(c){
  const areas=[...new Set(STATE.cache.costCenters.map(x=>x.area).filter(Boolean))].sort();
  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Centros de Costo</div>
        <div class="page-subtitle">${STATE.cache.costCenters.length} centro(s) de costo</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="exportCentrosCostoExcel()">📊 Exportar Excel</button>
        ${can('centrosCosto.crear')?`<button class="btn btn-primary" onclick="openCentroCostoForm()">+ Nuevo Centro</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filter-bar" style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;gap:10px;flex-wrap:wrap">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar</label><input type="text" id="ccFltSearch" value="${escapeHtml(ccFilter.search)}" placeholder="Código, descripción, área..."></div>
        <div class="form-field"><label>Área</label><select id="ccFltArea"><option value="">Todas</option>${areas.map(a=>`<option value="${escapeHtml(a)}" ${ccFilter.area===a?'selected':''}>${escapeHtml(a)}</option>`).join('')}</select></div>
        <div class="form-field"><label>Estado</label><select id="ccFltAct"><option value="">Todos</option><option value="1" ${ccFilter.activo==='1'?'selected':''}>Activos</option><option value="0" ${ccFilter.activo==='0'?'selected':''}>Inactivos</option></select></div>
      </div>
      <div id="ccTable"></div>
    </div>`;
  ['ccFltSearch','ccFltArea','ccFltAct'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    ccFilter.search=document.getElementById('ccFltSearch').value;
    ccFilter.area=document.getElementById('ccFltArea').value;
    ccFilter.activo=document.getElementById('ccFltAct').value;
    renderCentrosCostoTable();
  }));
  renderCentrosCostoTable();
}
function renderCentrosCostoTable(){
  const w=document.getElementById('ccTable');
  let rows=[...STATE.cache.costCenters];
  if(ccFilter.search){
    const s=ccFilter.search.toLowerCase();
    rows=rows.filter(p=>(p.codigo+' '+p.descripcion+' '+(p.area||'')).toLowerCase().includes(s));
  }
  if(ccFilter.area)rows=rows.filter(p=>p.area===ccFilter.area);
  if(ccFilter.activo==='1')rows=rows.filter(p=>p.activo!==false);
  if(ccFilter.activo==='0')rows=rows.filter(p=>p.activo===false);
  rows=rows.sort((a,b)=>a.codigo.localeCompare(b.codigo));
  if(rows.length===0){
    w.innerHTML='<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-title">Sin centros de costo</div><div class="empty-state-text">'+(STATE.cache.costCenters.length===0?'Crea el primer centro de costo':'No hay coincidencias con los filtros')+'</div></div>';return;
  }
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>Código</th><th>Descripción</th><th>Área</th><th class="num">Movimientos</th><th class="center">Estado</th><th class="actions">Acciones</th></tr></thead>
    <tbody>${rows.map(p=>{
      const usos=STATE.cache.movements.filter(m=>m.centroCosto===p.codigo&&!m.anulado).length;
      return `<tr class="row-link" onclick="viewCentroCosto('${escapeHtml(p.codigo)}')">
        <td class="mono"><strong>${escapeHtml(p.codigo)}</strong></td>
        <td>${escapeHtml(p.descripcion)}</td>
        <td>${escapeHtml(p.area||'-')}</td>
        <td class="num">${usos}</td>
        <td class="center">${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</td>
        <td class="actions" onclick="event.stopPropagation()">
          ${can('centrosCosto.crear')?`<button class="btn btn-secondary btn-sm" onclick="openCentroCostoForm('${escapeHtml(p.codigo)}')">Editar</button>`:''}
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function viewCentroCosto(codigo){
  const p=STATE.cache.costCenters.find(x=>x.codigo===codigo);if(!p)return;
  const movs=STATE.cache.movements.filter(m=>m.centroCosto===codigo&&!m.anulado).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  const recientes=movs.slice(0,10);
  const totalEnt=movs.filter(m=>m.tipo==='ENT').length;
  const totalSal=movs.filter(m=>m.tipo==='SAL').length;
  const valorTotal=movs.reduce((s,m)=>s+(m.detalles||[]).reduce((ss,d)=>ss+d.cantidad*d.costo,0),0);
  showModal(`Centro de Costo · ${p.codigo}`,
    `<div class="form-grid">
      <div class="form-field"><label>Código</label><div class="mono"><strong>${escapeHtml(p.codigo)}</strong></div></div>
      <div class="form-field"><label>Área</label><div>${escapeHtml(p.area||'-')}</div></div>
      <div class="form-field span-2"><label>Descripción</label><div><strong>${escapeHtml(p.descripcion)}</strong></div></div>
      ${p.responsable?`<div class="form-field span-2"><label>Responsable</label><div>${escapeHtml(p.responsable)}</div></div>`:''}
      ${p.observaciones?`<div class="form-field span-2"><label>Observaciones</label><div>${escapeHtml(p.observaciones)}</div></div>`:''}
      <div class="form-field"><label>Estado</label><div>${p.activo===false?'<span class="badge badge-gray">Inactivo</span>':'<span class="badge badge-green">Activo</span>'}</div></div>
      <div class="form-field"><label>Creado</label><div style="font-size:12px;color:var(--mu)">${p.creado?fmtDate(p.creado):'-'}</div></div>
    </div>
    <div style="margin-top:18px;padding:12px;background:var(--gp);border-radius:8px">
      <div style="font-size:12px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Resumen de movimientos</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:var(--mu)">Entradas</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${totalEnt}</div></div>
        <div><div style="font-size:11px;color:var(--mu)">Salidas</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${totalSal}</div></div>
        <div><div style="font-size:11px;color:var(--mu)">Valor acumulado</div><div style="font-size:18px;font-weight:600;color:var(--gd)">${fmtMon(valorTotal)}</div></div>
      </div>
    </div>
    ${recientes.length>0?`<h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Últimos movimientos</h4>
    <table class="detalle-table"><thead><tr><th>N°</th><th>Fecha</th><th>Tipo</th><th class="num">Items</th><th class="num">Valor</th></tr></thead>
    <tbody>${recientes.map(m=>{const v=(m.detalles||[]).reduce((s,d)=>s+d.cantidad*d.costo,0);return `<tr><td class="mono">${m.numero}</td><td>${fmtDateOnly(m.fecha)}</td><td>${escapeHtml(tipoMovLabel(m))}</td><td class="num">${(m.detalles||[]).length}</td><td class="num">${fmtMon(v)}</td></tr>`}).join('')}</tbody></table>`:''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${can('centrosCosto.crear')?`<button class="btn btn-primary" onclick="closeModal();openCentroCostoForm('${escapeHtml(codigo)}')">✏️ Editar</button>`:''}`,
    'xl');
}

function openCentroCostoForm(codigo=null,opts={}){
  const p=codigo?STATE.cache.costCenters.find(x=>x.codigo===codigo):null;
  const isNew=!p;
  const preCod=opts.prefilledCodigo||'';
  // Sugerir áreas existentes
  const areas=[...new Set(STATE.cache.costCenters.map(x=>x.area).filter(Boolean))].sort();
  showModal(p?`Editar centro de costo · ${p.codigo}`:(opts.fromMov?'Crear centro de costo desde movimiento':'Nuevo centro de costo'),
    `${opts.fromMov?'<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">🏢 Estás creando un nuevo centro de costo sin perder los datos del movimiento en curso. Al guardar, volverás al formulario con el centro de costo ya seleccionado.</div>':''}
    <div class="form-grid">
      <div class="form-field required"><label>Código</label>
        <input type="text" id="ccCod" value="${escapeHtml(p?p.codigo:preCod)}" ${p?'readonly':''} placeholder="Ej: ADM-01, OBRA-PORTAL, MANT-VEH" maxlength="20" autocomplete="off">
        <div class="hint">${p?'No editable. Es la clave única.':'Identificador corto. Se guarda en mayúsculas.'}</div>
      </div>
      <div class="form-field required"><label>Área</label>
        <input type="text" id="ccArea" value="${escapeHtml(p?.area||'')}" placeholder="Ej: ADMINISTRACION, OPERACIONES, MANTENCION" list="ccAreasList">
        <datalist id="ccAreasList">${areas.map(a=>`<option value="${escapeHtml(a)}">`).join('')}</datalist>
        <div class="hint">Agrupación general (puede repetirse entre centros)</div>
      </div>
      <div class="form-field span-2 required"><label>Descripción</label><input type="text" id="ccDesc" value="${escapeHtml(p?.descripcion||'')}" placeholder="Nombre completo del centro de costo"></div>
      <div class="form-field span-2"><label>Responsable (opcional)</label><input type="text" id="ccResp" value="${escapeHtml(p?.responsable||'')}" placeholder="Nombre del encargado"></div>
      <div class="form-field span-2"><label>Observaciones (opcional)</label><input type="text" id="ccObs" value="${escapeHtml(p?.observaciones||'')}"></div>
      ${!isNew?`<div class="form-field span-2"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="ccAct" ${p.activo!==false?'checked':''}><span class="switch-slider"></span></span>
          <span id="ccActLbl">${p.activo!==false?'Activo':'Inactivo'}</span>
        </label></div>`:''}
    </div>`,
    `<button class="btn btn-secondary" id="ccCancel">${opts.fromMov?'← Volver al movimiento':'Cancelar'}</button>
     <button class="btn btn-primary" id="ccSave">${p?'Guardar cambios':(opts.fromMov?'Crear y volver':'Crear centro de costo')}</button>`,
    'lg');
  document.getElementById('ccCancel').onclick=()=>{
    closeModal();
    if(opts.fromMov)_renderMovForm(document.getElementById('mainContent'));
  };
  document.getElementById('ccSave').onclick=()=>saveCentroCosto(p?p.codigo:null,opts);
  setTimeout(()=>{
    const cod=document.getElementById('ccCod');
    if(cod&&!p&&!preCod)cod.focus();
    else if(p||preCod)document.getElementById('ccDesc').focus();
  },50);
  const actEl=document.getElementById('ccAct');
  if(actEl)actEl.addEventListener('change',e=>{document.getElementById('ccActLbl').textContent=e.target.checked?'Activo':'Inactivo'});
  // Forzar mayúsculas en código
  const codEl=document.getElementById('ccCod');
  if(codEl&&!p)codEl.addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/\s+/g,'-')});
}

async function saveCentroCosto(existing,opts){
  opts=opts||{};
  const cod=document.getElementById('ccCod').value.trim().toUpperCase();
  const desc=document.getElementById('ccDesc').value.trim();
  const area=document.getElementById('ccArea').value.trim().toUpperCase();
  const resp=document.getElementById('ccResp').value.trim();
  const obs=document.getElementById('ccObs').value.trim();
  if(!cod){toast('Falta código','Indique el código del centro de costo','error');return}
  if(!/^[A-Z0-9_.\-]+$/.test(cod)){toast('Código inválido','Solo letras, números, guiones, puntos','error');return}
  if(!desc){toast('Falta descripción','La descripción es obligatoria','error');return}
  if(!area){toast('Falta área','El área es obligatoria','error');return}
  if(!existing&&STATE.cache.costCenters.find(x=>x.codigo===cod)){toast('Código duplicado','Ya existe un centro de costo con ese código','error');return}
  let obj;
  if(existing){
    obj=STATE.cache.costCenters.find(x=>x.codigo===existing);
    obj.modificado=new Date().toISOString();
    const actEl=document.getElementById('ccAct');
    if(actEl)obj.activo=actEl.checked;
  }else{
    obj={codigo:cod,activo:true,creado:new Date().toISOString()};
  }
  obj.descripcion=desc;obj.area=area;obj.responsable=resp;obj.observaciones=obs;
  await dbPut('costCenters',obj);
  await audit(existing?'centroCosto.editar':'centroCosto.crear',`${existing?'Edición':'Creación'} de centro de costo ${desc}`,obj.codigo);
  await reloadCache();closeModal();
  toast(existing?'Centro de costo actualizado':'Centro de costo creado',desc);
  if(opts.fromMov){
    movDraft.centroCosto=obj.codigo;
    _renderMovForm(document.getElementById('mainContent'));
  }else if(STATE.page==='centrosCosto'){
    renderCentrosCosto(document.getElementById('mainContent'));
  }
}

function exportCentrosCostoExcel(){
  const data=STATE.cache.costCenters.map(p=>{
    const usos=STATE.cache.movements.filter(m=>m.centroCosto===p.codigo&&!m.anulado).length;
    return {
      'Código':p.codigo,'Descripción':p.descripcion,'Área':p.area||'',
      'Responsable':p.responsable||'','Observaciones':p.observaciones||'',
      'Movimientos':usos,
      'Estado':p.activo===false?'Inactivo':'Activo','Creado':p.creado?fmtDate(p.creado):''
    };
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Centros de Costo');
  XLSX.writeFile(wb,`centros_costo_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ PAGE: TOMAS DE INVENTARIO ═══════════════ */
/* Estados:
   - EN_PROCESO: el operador captura (puede editar)
   - PENDIENTE_AUTORIZACION: el operador cerró, espera admin
   - AUTORIZADA: admin autorizó pero ajustes aún no aplicados (estado intermedio breve)
   - APLICADA: ajustes generados, stock actualizado, toma cerrada
   - DEVUELTA: admin devolvió al operador (vuelve a EN_PROCESO)
   - RECHAZADA: admin rechazó (toma archivada sin efecto)
*/
const TOMA_ESTADOS={
  EN_PROCESO:{label:'En proceso',badge:'badge-amber',icon:'✏️'},
  PENDIENTE_AUTORIZACION:{label:'Pendiente autorización',badge:'badge-amber',icon:'⏳'},
  APLICADA:{label:'Ajustes aplicados',badge:'badge-green',icon:'✓'},
  RECHAZADA:{label:'Rechazada',badge:'badge-red',icon:'✗'},
  DEVUELTA:{label:'Devuelta al operador',badge:'badge-amber',icon:'↩️'}
};

let tomaFilter={search:'',estado:'',bodega:''};
let _tomaActiva=null;       // toma en captura/visualización
let _tomaScroll=0;

function renderTomas(c){
  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Tomas de Inventario</div>
        <div class="page-subtitle">${STATE.cache.inventoryCounts.length} toma(s) registrada(s)</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('tomas.crear')?`<button class="btn btn-primary" onclick="iniciarToma()">+ Iniciar Nueva Toma</button>`:''}
      </div>
    </div>
    <div class="card">
      <div class="filter-bar" style="padding:14px 18px;border-bottom:1px solid var(--bo);display:flex;gap:10px;flex-wrap:wrap">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar</label><input type="text" id="tomaFltSearch" value="${escapeHtml(tomaFilter.search)}" placeholder="Número, observaciones, usuario..."></div>
        <div class="form-field"><label>Estado</label><select id="tomaFltEstado"><option value="">Todos</option>${Object.entries(TOMA_ESTADOS).map(([k,v])=>`<option value="${k}" ${tomaFilter.estado===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}</select></div>
        <div class="form-field"><label>Bodega</label><select id="tomaFltBod"><option value="">Todas</option>${STATE.cache.warehouses.map(b=>`<option value="${b.id}" ${tomaFilter.bodega===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}</select></div>
      </div>
      <div id="tomaTable"></div>
    </div>`;
  ['tomaFltSearch','tomaFltEstado','tomaFltBod'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    tomaFilter.search=document.getElementById('tomaFltSearch').value;
    tomaFilter.estado=document.getElementById('tomaFltEstado').value;
    tomaFilter.bodega=document.getElementById('tomaFltBod').value;
    renderTomasTable();
  }));
  renderTomasTable();
}

function renderTomasTable(){
  const w=document.getElementById('tomaTable');
  let rows=[...STATE.cache.inventoryCounts];
  if(tomaFilter.search){
    const s=tomaFilter.search.toLowerCase();
    rows=rows.filter(t=>(t.numero+' '+(t.observaciones||'')+' '+(t.usuario||'')+' '+(t.autorizadoPor||'')).toLowerCase().includes(s));
  }
  if(tomaFilter.estado)rows=rows.filter(t=>t.estado===tomaFilter.estado);
  if(tomaFilter.bodega)rows=rows.filter(t=>t.bodegaId===tomaFilter.bodega);
  rows=rows.sort((a,b)=>(b.creado||'').localeCompare(a.creado||''));
  if(rows.length===0){
    w.innerHTML='<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Sin tomas</div><div class="empty-state-text">'+(STATE.cache.inventoryCounts.length===0?'Aún no se ha iniciado ninguna toma de inventario':'No hay coincidencias con los filtros')+'</div></div>';return;
  }
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>N°</th><th>Fecha inicio</th><th>Bodega</th><th>Estado</th><th class="num">Items</th><th class="num">Diferencias</th><th>Usuario</th><th class="actions">Acciones</th></tr></thead>
    <tbody>${rows.map(t=>{
      const b=getWarehouse(t.bodegaId);
      const est=TOMA_ESTADOS[t.estado]||{label:t.estado,badge:'badge-gray',icon:''};
      const diffCount=(t.lineas||[]).filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico)).length;
      const totalItems=(t.lineas||[]).length;
      return `<tr class="row-link" onclick="verToma('${t.id}')">
        <td class="mono"><strong>${t.numero}</strong></td>
        <td>${fmtDate(t.creado)}</td>
        <td>${escapeHtml(b?b.nombre:t.bodegaId)}</td>
        <td><span class="badge ${est.badge}">${est.icon} ${est.label}</span></td>
        <td class="num">${totalItems}</td>
        <td class="num"><strong style="color:${diffCount>0?'var(--red)':'var(--mu)'}">${diffCount}</strong></td>
        <td style="font-size:12px">${escapeHtml(t.usuario||'-')}</td>
        <td class="actions" onclick="event.stopPropagation()">
          ${t.estado==='EN_PROCESO'&&t.usuario===STATE.user.id&&can('tomas.crear')?`<button class="btn btn-secondary btn-sm" onclick="continuarToma('${t.id}')">Continuar</button>`:''}
          ${t.estado==='DEVUELTA'&&t.usuario===STATE.user.id&&can('tomas.crear')?`<button class="btn btn-secondary btn-sm" onclick="continuarToma('${t.id}')">Retomar</button>`:''}
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ─── Iniciar nueva toma ─── */
function iniciarToma(){
  if(!can('tomas.crear')){toast('Sin permiso','','error');return}
  const bodegas=STATE.cache.warehouses.filter(b=>b.activo);
  if(bodegas.length===0){toast('Sin bodegas','Debe crear al menos una bodega','error');return}
  // Verificar si hay otra toma en curso del mismo usuario en la misma bodega
  const existeEnCurso=STATE.cache.inventoryCounts.find(t=>
    (t.estado==='EN_PROCESO'||t.estado==='DEVUELTA')&&t.usuario===STATE.user.id);
  if(existeEnCurso){
    toast('Toma en curso',`Tienes una toma activa (${existeEnCurso.numero}) sin cerrar. Termínala primero.`,'warning');
    setTimeout(()=>continuarToma(existeEnCurso.id),500);
    return;
  }
  // Listar grupos y tipos para filtrado opcional
  const grupos=STATE.cache.groups.map(g=>g.nombre).sort();
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).map(t=>t.nombre).sort();
  showModal('Iniciar nueva toma de inventario',
    `<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">📋 Al iniciar la toma se congelan los saldos teóricos actuales. Luego podrá capturar las cantidades físicas reales y, al finalizar, un administrador autorizará los ajustes.</div>
    <div class="form-grid">
      <div class="form-field span-2 required"><label>Bodega a inventariar</label>
        <select id="iniBod">
          <option value="">- Seleccionar -</option>
          ${bodegas.map(b=>`<option value="${b.id}">${escapeHtml(b.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Filtrar por grupo (opcional)</label>
        <select id="iniGrupo">
          <option value="">Todos los grupos</option>
          ${grupos.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Filtrar por tipo (opcional)</label>
        <select id="iniTipo">
          <option value="">Todos los tipos</option>
          ${tipos.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field span-2"><label>Alcance</label>
        <select id="iniAlcance">
          <option value="todos">Todos los productos del sistema</option>
          <option value="conStock" selected>Solo productos con stock en la bodega</option>
        </select>
        <div class="hint">Recomendado: "con stock" para inventario habitual. "Todos" para inventario inicial completo.</div>
      </div>
      <div class="form-field span-2"><label>Observaciones (opcional)</label>
        <input type="text" id="iniObs" placeholder="Ej: Toma cierre de mes, conteo cíclico, etc.">
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" id="btnIniToma">Iniciar toma</button>`,
    'lg');
  document.getElementById('btnIniToma').onclick=async()=>{
    const bodId=document.getElementById('iniBod').value;
    if(!bodId){toast('Falta bodega','Seleccione la bodega a inventariar','error');return}
    const grupo=document.getElementById('iniGrupo').value;
    const tipo=document.getElementById('iniTipo').value;
    const alcance=document.getElementById('iniAlcance').value;
    const obs=document.getElementById('iniObs').value.trim();
    showLoading('Generando lista de productos...');
    try{
      // Construir lista de productos
      let productos=[...STATE.cache.products];
      if(grupo)productos=productos.filter(p=>p.grupo===grupo);
      if(tipo)productos=productos.filter(p=>p.tipoProducto===tipo);
      const lineas=[];
      for(const p of productos){
        const st=getStock(p.codigoInterno,bodId);
        const tienestock=st&&st.cantidad>0;
        if(alcance==='conStock'&&!tienestock&&!p.manejaAtributos)continue;
        if(p.manejaAtributos){
          // Una línea por lote con saldo
          const lotes=STATE.cache.lots.filter(l=>l.codigoInterno===p.codigoInterno&&l.bodegaId===bodId&&l.cantidad>0);
          if(lotes.length===0&&alcance==='todos'){
            lineas.push({
              codigoInterno:p.codigoInterno,
              descripcion:p.descripcion,
              unidadMedida:p.unidadMedida,
              manejaAtributos:true,
              loteId:'',lote:'',fechaVenc:'',
              teorico:0,
              costoTeorico:0,
              fisico:'',fisicoIngresado:false
            });
          }else{
            lotes.forEach(l=>{
              lineas.push({
                codigoInterno:p.codigoInterno,
                descripcion:p.descripcion,
                unidadMedida:p.unidadMedida,
                manejaAtributos:true,
                loteId:l.id,lote:l.lote,fechaVenc:l.fechaVenc||'',
                teorico:Number(l.cantidad)||0,
                costoTeorico:Number(l.costo)||0,
                fisico:'',fisicoIngresado:false
              });
            });
          }
        }else{
          if(alcance==='conStock'&&!tienestock)continue;
          lineas.push({
            codigoInterno:p.codigoInterno,
            descripcion:p.descripcion,
            unidadMedida:p.unidadMedida,
            manejaAtributos:false,
            loteId:'',lote:'',fechaVenc:'',
            teorico:st?Number(st.cantidad)||0:0,
            costoTeorico:st?Number(st.costoPromedio)||0:0,
            fisico:'',fisicoIngresado:false
          });
        }
      }
      lineas.sort((a,b)=>a.descripcion.localeCompare(b.descripcion));
      // Crear el documento de toma
      const numero=await nextCounter('TOMA');
      const toma={
        id:'TOMA-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
        numero,
        bodegaId:bodId,
        estado:'EN_PROCESO',
        filtroGrupo:grupo||'',
        filtroTipo:tipo||'',
        alcance,
        observaciones:obs,
        lineas,
        usuario:STATE.user.id,
        creado:new Date().toISOString()
      };
      await dbPut('inventoryCounts',toma);
      await audit('toma.iniciar',`Inicio de toma ${numero} en ${bodId} con ${lineas.length} línea(s)`,toma.id);
      await reloadCache();
      hideLoading();
      closeModal();
      toast('Toma iniciada',`${numero} con ${lineas.length} producto(s)/lote(s) por contar`);
      _tomaActiva=toma;
      navigate('tomaCapturar');
    }catch(e){
      hideLoading();
      toast('Error',e.message,'error');
      console.error(e);
    }
  };
}

function continuarToma(id){
  const toma=STATE.cache.inventoryCounts.find(t=>t.id===id);
  if(!toma){toast('Toma no encontrada','','error');return}
  if(toma.estado!=='EN_PROCESO'&&toma.estado!=='DEVUELTA'){
    toast('No editable',`La toma está en estado ${TOMA_ESTADOS[toma.estado]?.label}`,'warning');
    return verToma(id);
  }
  if(toma.usuario!==STATE.user.id&&!STATE.user.role==='admin'){
    toast('Sin permiso','Esta toma fue iniciada por otro usuario','error');
    return;
  }
  _tomaActiva=toma;
  navigate('tomaCapturar');
}

function verToma(id){
  const toma=STATE.cache.inventoryCounts.find(t=>t.id===id);
  if(!toma)return;
  _tomaActiva=toma;
  navigate('tomaVer');
}

/* ─── Pantalla de captura ─── */
let _tomaCaptureSearch='';
let _tomaCaptureFilter='todos'; // todos | pendientes | conDif
function renderTomaCapturar(c){
  if(!_tomaActiva){navigate('tomas');return}
  const t=_tomaActiva;
  const b=getWarehouse(t.bodegaId);
  const lineas=t.lineas||[];
  const ingresadas=lineas.filter(l=>l.fisicoIngresado).length;
  const pendientes=lineas.length-ingresadas;
  const conDif=lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico)).length;
  const editable=(t.estado==='EN_PROCESO'||t.estado==='DEVUELTA')&&t.usuario===STATE.user.id;

  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title"><span class="badge ${TOMA_ESTADOS[t.estado].badge}">${TOMA_ESTADOS[t.estado].icon} ${TOMA_ESTADOS[t.estado].label}</span> ${t.numero}</div>
        <div class="page-subtitle">Bodega: <strong>${escapeHtml(b?b.nombre:t.bodegaId)}</strong> · Iniciada: ${fmtDate(t.creado)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="navigate('tomas')">← Volver</button>
        ${editable?`<button class="btn btn-primary" onclick="cerrarTomaParaAutorizacion()">Cerrar para autorización</button>`:''}
      </div>
    </div>

    ${t.estado==='DEVUELTA'&&t.devolucionMotivo?`<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px"><strong>↩️ Devuelta por el administrador:</strong> ${escapeHtml(t.devolucionMotivo)}</div>`:''}

    <div class="card" style="margin-bottom:14px">
      <div style="padding:14px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;border-bottom:1px solid var(--bo)">
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Total líneas</div><div style="font-size:22px;font-weight:600;color:var(--gd)">${lineas.length}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Ingresadas</div><div style="font-size:22px;font-weight:600;color:var(--gm)">${ingresadas}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Pendientes</div><div style="font-size:22px;font-weight:600;color:${pendientes>0?'#a64':'var(--mu)'}">${pendientes}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Con diferencia</div><div style="font-size:22px;font-weight:600;color:${conDif>0?'var(--red)':'var(--mu)'}">${conDif}</div></div>
      </div>

      <div style="padding:14px 18px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--bo)">
        <div class="form-field" style="flex:1;min-width:200px"><label>Buscar producto</label><input type="text" id="tcSearch" value="${escapeHtml(_tomaCaptureSearch)}" placeholder="Código, descripción, lote..." autocomplete="off"></div>
        <div class="form-field"><label>Mostrar</label><select id="tcFilter">
          <option value="todos" ${_tomaCaptureFilter==='todos'?'selected':''}>Todos</option>
          <option value="pendientes" ${_tomaCaptureFilter==='pendientes'?'selected':''}>Pendientes</option>
          <option value="conDif" ${_tomaCaptureFilter==='conDif'?'selected':''}>Con diferencia</option>
        </select></div>
        ${editable?`<div class="form-field"><label>&nbsp;</label><button class="btn btn-secondary btn-sm" onclick="agregarProductoToma()" style="height:38px">+ Agregar producto</button></div>`:''}
      </div>

      <div id="tcLineas" style="max-height:60vh;overflow-y:auto"></div>
    </div>`;

  document.getElementById('tcSearch').addEventListener('input',e=>{_tomaCaptureSearch=e.target.value;renderTomaCapturarLineas()});
  document.getElementById('tcFilter').addEventListener('change',e=>{_tomaCaptureFilter=e.target.value;renderTomaCapturarLineas()});
  renderTomaCapturarLineas();
}

function renderTomaCapturarLineas(){
  const t=_tomaActiva;
  const editable=(t.estado==='EN_PROCESO'||t.estado==='DEVUELTA')&&t.usuario===STATE.user.id;
  const w=document.getElementById('tcLineas');
  let lineas=t.lineas.map((l,i)=>({...l,_idx:i}));
  if(_tomaCaptureSearch){
    const s=_tomaCaptureSearch.toLowerCase();
    lineas=lineas.filter(l=>(l.codigoInterno+' '+l.descripcion+' '+(l.lote||'')).toLowerCase().includes(s));
  }
  if(_tomaCaptureFilter==='pendientes')lineas=lineas.filter(l=>!l.fisicoIngresado);
  else if(_tomaCaptureFilter==='conDif')lineas=lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico));

  if(lineas.length===0){
    w.innerHTML='<div class="empty-state"><div class="empty-state-text">Sin líneas que coincidan con los filtros</div></div>';return;
  }

  w.innerHTML=`<table class="data" style="margin:0">
    <thead><tr>
      <th style="width:90px">Código</th>
      <th>Producto</th>
      <th style="width:100px">Lote</th>
      <th class="num" style="width:90px">Teórico</th>
      <th class="num" style="width:120px">Físico</th>
      <th class="num" style="width:90px">Diferencia</th>
      ${editable?'<th class="actions" style="width:50px"></th>':''}
    </tr></thead>
    <tbody>${lineas.map(l=>{
      const dif=l.fisicoIngresado?Number(l.fisico)-Number(l.teorico):null;
      const difColor=dif===null?'var(--mu)':(dif===0?'var(--mu)':(dif>0?'var(--gm)':'var(--red)'));
      const difTxt=dif===null?'-':(dif>0?'+'+dif:dif);
      return `<tr ${l.fisicoIngresado&&dif!==0?'style="background:#fff8ed"':''}>
        <td class="mono"><strong>${escapeHtml(l.codigoInterno)}</strong></td>
        <td><div>${escapeHtml(l.descripcion)}</div><div style="font-size:11px;color:var(--mu)">${escapeHtml(l.unidadMedida||'')}</div></td>
        <td class="mono" style="font-size:12px">${l.lote?escapeHtml(l.lote)+(l.fechaVenc?'<br><span style="color:var(--mu);font-size:10px">vc '+fmtDateOnly(l.fechaVenc)+'</span>':''):'-'}</td>
        <td class="num"><strong>${l.teorico}</strong></td>
        <td class="num">${editable?`<input type="number" step="0.01" min="0" value="${l.fisicoIngresado?l.fisico:''}" placeholder="-" onchange="setTomaFisico(${l._idx},this.value)" onfocus="this.select()" style="width:100px;text-align:right;padding:5px 8px;border:1px solid var(--bo);border-radius:4px;font-family:'IBM Plex Mono',monospace">`:`<strong>${l.fisicoIngresado?l.fisico:'-'}</strong>`}</td>
        <td class="num"><strong style="color:${difColor}">${difTxt}</strong></td>
        ${editable?`<td class="actions">${l.fisicoIngresado?`<button class="btn btn-secondary btn-sm" onclick="limpiarTomaFisico(${l._idx})" title="Limpiar conteo" style="padding:3px 8px">✕</button>`:''}</td>`:''}
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function setTomaFisico(idx,val){
  if(!_tomaActiva)return;
  const t=_tomaActiva;
  const v=val===''||val==null?'':Number(val);
  if(val!==''&&isNaN(v)){toast('Valor inválido','Ingrese un número','error');return}
  if(v<0){toast('Valor inválido','La cantidad no puede ser negativa','error');return}
  if(val===''){
    t.lineas[idx].fisico='';
    t.lineas[idx].fisicoIngresado=false;
  }else{
    t.lineas[idx].fisico=v;
    t.lineas[idx].fisicoIngresado=true;
    t.lineas[idx].fisicoFecha=new Date().toISOString();
  }
  t.modificado=new Date().toISOString();
  await dbPut('inventoryCounts',t);
  await reloadCache();
  // Re-buscar la toma activa porque reloadCache la replazó
  _tomaActiva=STATE.cache.inventoryCounts.find(x=>x.id===t.id)||t;
  renderTomaCapturar(document.getElementById('mainContent'));
}

async function limpiarTomaFisico(idx){
  await setTomaFisico(idx,'');
}

function agregarProductoToma(){
  if(!_tomaActiva)return;
  const t=_tomaActiva;
  // Filtrar productos que NO estén ya en la toma (a menos que sean con lote)
  const codsEnToma=new Set(t.lineas.filter(l=>!l.manejaAtributos).map(l=>l.codigoInterno));
  const candidatos=STATE.cache.products.filter(p=>!codsEnToma.has(p.codigoInterno));
  showModal('Agregar producto a la toma',
    `<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">Buscar y agregar un producto que no estaba en la lista inicial. Su saldo teórico actual se tomará como base.</div>
    <div class="form-field"><label>Buscar producto</label><input type="text" id="apSearch" placeholder="Código, EAN o descripción" autofocus autocomplete="off"></div>
    <div id="apResults" style="max-height:300px;overflow-y:auto;border:1px solid var(--bo);border-radius:6px;margin-top:10px;display:none"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>`,'lg');
  const input=document.getElementById('apSearch');
  const results=document.getElementById('apResults');
  input.addEventListener('input',()=>{
    const s=input.value.trim().toLowerCase();
    if(s.length<2){results.style.display='none';return}
    const matches=candidatos.filter(p=>(p.codigoInterno+' '+(p.codigoEAN||'')+' '+p.descripcion).toLowerCase().includes(s)).slice(0,20);
    if(matches.length===0){
      results.style.display='block';
      results.innerHTML='<div style="padding:12px;color:var(--mu);font-size:13px">Sin coincidencias</div>';
      return;
    }
    results.style.display='block';
    results.innerHTML=matches.map(p=>{
      const st=getStock(p.codigoInterno,t.bodegaId);
      const cant=st?Number(st.cantidad):0;
      return `<div style="padding:10px 14px;border-bottom:1px solid var(--bo);cursor:pointer" onclick="agregarProductoTomaConfirm('${escapeHtml(p.codigoInterno)}')" onmouseover="this.style.background='var(--gp)'" onmouseout="this.style.background='transparent'">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div><strong class="mono">${escapeHtml(p.codigoInterno)}</strong> · ${escapeHtml(p.descripcion)}</div>
          <div style="font-size:12px;color:var(--mu)">Stock: ${cant} ${escapeHtml(p.unidadMedida||'')}</div>
        </div>
      </div>`;
    }).join('');
  });
}

async function agregarProductoTomaConfirm(codigo){
  const t=_tomaActiva;
  const p=getProduct(codigo);
  if(!p)return;
  if(p.manejaAtributos){
    // Agregar líneas por cada lote con saldo + opción de agregar lote nuevo
    const lotes=STATE.cache.lots.filter(l=>l.codigoInterno===codigo&&l.bodegaId===t.bodegaId&&l.cantidad>0);
    if(lotes.length===0){
      // Producto con atributos sin lotes: agregar línea con teórico 0 y lote vacío
      t.lineas.push({
        codigoInterno:codigo,descripcion:p.descripcion,unidadMedida:p.unidadMedida,
        manejaAtributos:true,loteId:'',lote:'',fechaVenc:'',
        teorico:0,costoTeorico:0,fisico:'',fisicoIngresado:false,agregadaManual:true
      });
    }else{
      lotes.forEach(l=>{
        if(t.lineas.find(x=>x.loteId===l.id))return; // ya está
        t.lineas.push({
          codigoInterno:codigo,descripcion:p.descripcion,unidadMedida:p.unidadMedida,
          manejaAtributos:true,loteId:l.id,lote:l.lote,fechaVenc:l.fechaVenc||'',
          teorico:Number(l.cantidad)||0,costoTeorico:Number(l.costo)||0,
          fisico:'',fisicoIngresado:false,agregadaManual:true
        });
      });
    }
  }else{
    if(t.lineas.find(x=>x.codigoInterno===codigo&&!x.manejaAtributos)){
      toast('Ya está','Ese producto ya está en la lista','warning');return;
    }
    const st=getStock(codigo,t.bodegaId);
    t.lineas.push({
      codigoInterno:codigo,descripcion:p.descripcion,unidadMedida:p.unidadMedida,
      manejaAtributos:false,loteId:'',lote:'',fechaVenc:'',
      teorico:st?Number(st.cantidad)||0:0,
      costoTeorico:st?Number(st.costoPromedio)||0:0,
      fisico:'',fisicoIngresado:false,agregadaManual:true
    });
  }
  t.modificado=new Date().toISOString();
  await dbPut('inventoryCounts',t);
  await reloadCache();
  _tomaActiva=STATE.cache.inventoryCounts.find(x=>x.id===t.id)||t;
  closeModal();
  toast('Producto agregado',p.descripcion);
  renderTomaCapturar(document.getElementById('mainContent'));
}

async function cerrarTomaParaAutorizacion(){
  const t=_tomaActiva;
  if(!t)return;
  const ingresadas=t.lineas.filter(l=>l.fisicoIngresado).length;
  const total=t.lineas.length;
  const pendientes=total-ingresadas;
  let msg=`<div>¿Cerrar la toma <strong>${t.numero}</strong> para autorización?</div>
    <div style="margin-top:10px;padding:10px;background:var(--gp);border-radius:6px;font-size:13px">
      Total líneas: <strong>${total}</strong><br>
      Conteos ingresados: <strong>${ingresadas}</strong><br>
      Pendientes (sin conteo): <strong style="color:${pendientes>0?'var(--red)':'var(--mu)'}">${pendientes}</strong>
    </div>`;
  if(pendientes>0){
    msg+=`<div class="alert alert-warning" style="margin-top:12px;font-size:13px">⚠ Las líneas sin conteo se interpretarán como <strong>cantidad física = 0</strong> al aplicar los ajustes.</div>`;
  }
  msg+=`<div style="margin-top:10px;color:var(--mu);font-size:13px">Una vez cerrada, no podrás editarla a menos que el administrador la devuelva.</div>`;
  confirmDialog('Cerrar toma',msg,async()=>{
    // Para las pendientes, marcar fisico=0 al cerrar
    t.lineas.forEach(l=>{
      if(!l.fisicoIngresado){l.fisico=0;l.fisicoIngresado=true;l.fisicoFecha=new Date().toISOString();l.asumidoCero=true;}
    });
    t.estado='PENDIENTE_AUTORIZACION';
    t.cerrado=new Date().toISOString();
    t.cerradoPor=STATE.user.id;
    await dbPut('inventoryCounts',t);
    await audit('toma.cerrar',`Toma ${t.numero} cerrada para autorización`,t.id);
    await reloadCache();
    closeModal();
    toast('Toma cerrada','Pendiente de autorización por administrador');
    _tomaActiva=null;
    navigate('tomas');
  },'Sí, cerrar toma');
}

/* ─── Pantalla de visualización (modo lectura + autorización admin) ─── */
function renderTomaVer(c){
  if(!_tomaActiva){navigate('tomas');return}
  const t=_tomaActiva;
  const b=getWarehouse(t.bodegaId);
  const lineas=t.lineas||[];
  const conDif=lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico));
  const sinDif=lineas.length-conDif.length;
  const totalEnt=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).length;
  const totalSal=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).length;
  // Calcular impacto financiero
  const impactoEnt=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).reduce((s,l)=>s+(Number(l.fisico)-Number(l.teorico))*Number(l.costoTeorico),0);
  const impactoSal=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).reduce((s,l)=>s+(Number(l.teorico)-Number(l.fisico))*Number(l.costoTeorico),0);
  const impactoNeto=impactoEnt-impactoSal;

  const puedeAutorizar=t.estado==='PENDIENTE_AUTORIZACION'&&can('tomas.autorizar');

  c.innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title"><span class="badge ${TOMA_ESTADOS[t.estado].badge}">${TOMA_ESTADOS[t.estado].icon} ${TOMA_ESTADOS[t.estado].label}</span> ${t.numero}</div>
        <div class="page-subtitle">Bodega: <strong>${escapeHtml(b?b.nombre:t.bodegaId)}</strong> · Iniciada: ${fmtDate(t.creado)} por ${escapeHtml(t.usuario||'-')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="navigate('tomas')">← Volver</button>
        ${puedeAutorizar?`
          <button class="btn btn-secondary" onclick="devolverToma()">↩️ Devolver al operador</button>
          <button class="btn btn-secondary" onclick="rechazarToma()" style="color:var(--red)">✗ Rechazar</button>
          <button class="btn btn-primary" onclick="autorizarYAplicarToma()">✓ Autorizar y aplicar</button>
        `:''}
        <button class="btn btn-secondary" onclick="exportTomaExcel()">📊 Excel</button>
      </div>
    </div>

    ${t.cerrado?`<div style="font-size:13px;color:var(--mu);margin-bottom:12px">Cerrada: ${fmtDate(t.cerrado)} por ${escapeHtml(t.cerradoPor||'-')}${t.autorizado?` · Autorizada: ${fmtDate(t.autorizado)} por ${escapeHtml(t.autorizadoPor||'-')}`:''}${t.aplicado?` · Aplicada: ${fmtDate(t.aplicado)}`:''}</div>`:''}

    ${t.observaciones?`<div style="margin-bottom:12px;padding:10px 14px;background:var(--gp);border-radius:6px;font-size:13px"><strong>Observaciones:</strong> ${escapeHtml(t.observaciones)}</div>`:''}

    ${t.estado==='APLICADA'&&t.movimientosGenerados?`<div class="alert alert-info" style="margin-bottom:12px;font-size:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><strong>✓ Ajustes aplicados.</strong> Movimientos generados: ${t.movimientosGenerados.map(n=>`<a href="#" onclick="event.preventDefault();_navToMov('${escapeHtml(n)}')" style="color:var(--gm);font-weight:600;text-decoration:none" class="mono">${escapeHtml(n)} ↗</a>`).join(', ')}</div>
      <button class="btn btn-primary btn-sm" onclick="generarInformeAjustes()">📊 Informe de ajustes</button>
    </div>`:''}

    ${t.devolucionMotivo?`<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px"><strong>↩️ Devolución:</strong> ${escapeHtml(t.devolucionMotivo)}</div>`:''}
    ${t.rechazoMotivo?`<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px"><strong>✗ Rechazo:</strong> ${escapeHtml(t.rechazoMotivo)}</div>`:''}

    <div class="card" style="margin-bottom:14px">
      <div style="padding:14px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px">
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Total líneas</div><div style="font-size:22px;font-weight:600;color:var(--gd)">${lineas.length}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Sin diferencia</div><div style="font-size:22px;font-weight:600;color:var(--mu)">${sinDif}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Sobrantes</div><div style="font-size:22px;font-weight:600;color:var(--gm)">${totalEnt}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Faltantes</div><div style="font-size:22px;font-weight:600;color:var(--red)">${totalSal}</div></div>
        <div><div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px">Impacto neto</div><div style="font-size:22px;font-weight:600;color:${impactoNeto>=0?'var(--gm)':'var(--red)'}">${fmtMon(impactoNeto)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Diferencias detectadas (${conDif.length})</div></div>
      ${conDif.length===0?'<div class="empty-state" style="padding:30px"><div class="empty-state-text">No se detectaron diferencias entre stock teórico y físico ✓</div></div>':`
      <div style="overflow-x:auto"><table class="data" style="margin:0">
        <thead><tr><th>Código</th><th>Producto</th><th>Lote</th><th class="num">Teórico</th><th class="num">Físico</th><th class="num">Dif.</th><th class="num">Costo unit.</th><th class="num">Impacto</th><th>Tipo ajuste</th></tr></thead>
        <tbody>${conDif.map(l=>{
          const dif=Number(l.fisico)-Number(l.teorico);
          const impacto=dif*Number(l.costoTeorico);
          const tipoAjuste=dif>0?'<span class="badge badge-green">TIE Entrada</span>':'<span class="badge badge-red">TIS Salida</span>';
          return `<tr>
            <td class="mono">${escapeHtml(l.codigoInterno)}</td>
            <td>${escapeHtml(l.descripcion)}</td>
            <td class="mono" style="font-size:12px">${l.lote?escapeHtml(l.lote):'-'}</td>
            <td class="num">${l.teorico}</td>
            <td class="num"><strong>${l.fisico}</strong>${l.asumidoCero?' <span style="color:var(--mu);font-size:10px">(asumido)</span>':''}</td>
            <td class="num"><strong style="color:${dif>0?'var(--gm)':'var(--red)'}">${dif>0?'+'+dif:dif}</strong></td>
            <td class="num">${fmtMon(l.costoTeorico)}</td>
            <td class="num"><strong>${fmtMon(impacto)}</strong></td>
            <td>${tipoAjuste}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`}
    </div>

    ${sinDif>0?`<div style="margin-top:14px"><details><summary style="cursor:pointer;color:var(--mu);font-size:13px;padding:8px">Ver ${sinDif} línea(s) sin diferencia</summary>
      <div class="card" style="margin-top:6px"><div style="overflow-x:auto"><table class="data" style="margin:0">
        <thead><tr><th>Código</th><th>Producto</th><th>Lote</th><th class="num">Cantidad</th></tr></thead>
        <tbody>${lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)===Number(l.teorico)).map(l=>`<tr>
          <td class="mono">${escapeHtml(l.codigoInterno)}</td>
          <td>${escapeHtml(l.descripcion)}</td>
          <td class="mono" style="font-size:12px">${l.lote?escapeHtml(l.lote):'-'}</td>
          <td class="num">${l.fisico}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>
    </details></div>`:''}
  `;
}

/* ─── Acciones del admin ─── */
function devolverToma(){
  const t=_tomaActiva;
  if(!t)return;
  showModal('Devolver toma al operador',
    `<div class="form-field span-2 required"><label>Motivo de la devolución</label>
      <textarea id="devMotivo" rows="3" style="padding:9px 11px;border:1px solid var(--bo);border-radius:6px;font-family:inherit;font-size:14px;resize:vertical;width:100%" placeholder="Indique qué debe corregir el operador" autofocus></textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" id="btnDevConfirm">↩️ Devolver</button>`,'md');
  document.getElementById('btnDevConfirm').onclick=async()=>{
    const motivo=document.getElementById('devMotivo').value.trim();
    if(!motivo){toast('Falta motivo','Indique el motivo de la devolución','error');return}
    t.estado='DEVUELTA';
    t.devolucionMotivo=motivo;
    t.devolucionFecha=new Date().toISOString();
    t.devolucionPor=STATE.user.id;
    // Limpiar fechas de cierre
    delete t.cerrado;delete t.cerradoPor;
    // Permitir reedición: limpiar las marcas de "asumidoCero"
    t.lineas.forEach(l=>{if(l.asumidoCero){l.fisico='';l.fisicoIngresado=false;delete l.asumidoCero}});
    await dbPut('inventoryCounts',t);
    await audit('toma.devolver',`Devolución de toma ${t.numero}: ${motivo}`,t.id);
    await reloadCache();
    closeModal();
    toast('Toma devuelta','El operador podrá retomarla');
    _tomaActiva=null;
    navigate('tomas');
  };
}

function rechazarToma(){
  const t=_tomaActiva;
  if(!t)return;
  showModal('Rechazar toma',
    `<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px">⚠ Rechazar la toma la archivará sin aplicar ningún ajuste. Esta acción no se puede deshacer.</div>
    <div class="form-field span-2 required"><label>Motivo del rechazo</label>
      <textarea id="rejMotivo" rows="3" style="padding:9px 11px;border:1px solid var(--bo);border-radius:6px;font-family:inherit;font-size:14px;resize:vertical;width:100%" autofocus></textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" id="btnRejConfirm" style="background:var(--red);border-color:var(--red)">✗ Rechazar</button>`,'md');
  document.getElementById('btnRejConfirm').onclick=async()=>{
    const motivo=document.getElementById('rejMotivo').value.trim();
    if(!motivo){toast('Falta motivo','','error');return}
    t.estado='RECHAZADA';
    t.rechazoMotivo=motivo;
    t.rechazoFecha=new Date().toISOString();
    t.rechazoPor=STATE.user.id;
    await dbPut('inventoryCounts',t);
    await audit('toma.rechazar',`Rechazo de toma ${t.numero}: ${motivo}`,t.id);
    await reloadCache();
    closeModal();
    toast('Toma rechazada','');
    _tomaActiva=null;
    navigate('tomas');
  };
}

async function autorizarYAplicarToma(){
  const t=_tomaActiva;
  if(!t)return;
  const conDif=t.lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico));
  const totalEnt=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).length;
  const totalSal=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).length;

  showModal('Autorizar y aplicar ajustes',
    `<div class="alert alert-warning" style="margin-bottom:14px;font-size:13px">
      <strong>⚠ Esta acción es irreversible.</strong> Se generarán los siguientes movimientos automáticos:
      <ul style="margin:8px 0 0 18px;padding:0">
        ${totalEnt>0?`<li><strong>${totalEnt}</strong> ajuste(s) <span class="badge badge-green">TIE</span> por sobrantes detectados</li>`:''}
        ${totalSal>0?`<li><strong>${totalSal}</strong> ajuste(s) <span class="badge badge-red">TIS</span> por faltantes detectados</li>`:''}
        ${conDif.length===0?'<li>Sin diferencias: solo se cerrará la toma sin generar movimientos</li>':''}
      </ul>
      Los costos de los ajustes usan el <strong>PPP actual</strong> de cada producto.
    </div>
    <div class="form-field span-2 required"><label>🔒 Reingrese su contraseña para confirmar</label>
      <input type="password" id="autPass" autocomplete="current-password" autofocus style="font-family:monospace">
      <div class="hint">Se requiere la contraseña del administrador autorizando para mantener la trazabilidad.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" id="btnAutConfirm">✓ Confirmar autorización</button>`,'md');
  document.getElementById('btnAutConfirm').onclick=async()=>{
    const pass=document.getElementById('autPass').value;
    if(!pass){toast('Falta contraseña','','error');return}
    // Verificar contraseña del admin
    const u=await dbGet('users',STATE.user.id);
    const hash=await sha256(pass);
    if(hash!==u.passwordHash){toast('Contraseña incorrecta','','error');return}
    closeModal();
    showLoading('Aplicando ajustes...');
    try{
      await _aplicarAjustesToma(t);
      hideLoading();
      toast('Ajustes aplicados',`Toma ${t.numero} cerrada con ${conDif.length} ajuste(s)`);
      _tomaActiva=null;
      navigate('tomas');
    }catch(e){
      hideLoading();
      toast('Error',e.message,'error');
      console.error(e);
    }
  };
}

async function _aplicarAjustesToma(t){
  const conDif=t.lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico));
  const movimientosGenerados=[];

  // Marcar autorización
  t.estado='AUTORIZADA';
  t.autorizado=new Date().toISOString();
  t.autorizadoPor=STATE.user.id;
  await dbPut('inventoryCounts',t);

  // Separar diferencias en sobrantes (TIE) y faltantes (TIS)
  const sobrantes=conDif.filter(l=>Number(l.fisico)>Number(l.teorico));
  const faltantes=conDif.filter(l=>Number(l.fisico)<Number(l.teorico));

  // Generar movimiento TIE consolidado por sobrantes
  if(sobrantes.length>0){
    const numero=await nextCounter('TIE');
    const detalles=sobrantes.map(l=>{
      const cant=Number(l.fisico)-Number(l.teorico);
      // Costo: usar el costo teórico (PPP actual) congelado al inicio de la toma
      const costo=Number(l.costoTeorico)||0;
      return {
        codigoInterno:l.codigoInterno,
        descripcion:l.descripcion,
        unidadMedida:l.unidadMedida,
        cantidad:cant,
        costo:costo,
        lote:l.lote||'',
        fechaVenc:l.fechaVenc||'',
        loteId:l.loteId||''
      };
    });
    const m={
      numero,tipo:'ENT',tipoMovimiento:'TOMA INVENTARIO ENT',
      fecha:new Date().toISOString(),
      bodegaId:t.bodegaId,
      documento:`Toma ${t.numero}`,
      observaciones:`Sobrantes detectados en toma ${t.numero}. Autorizado por ${STATE.user.id}.`,
      detalles,
      tomaId:t.id,
      tomaNumero:t.numero,
      usuario:STATE.user.id,
      autorizadoPor:STATE.user.id,
      creado:new Date().toISOString(),
      anulado:false
    };
    await dbPut('movements',m);
    movimientosGenerados.push(numero);
    await audit('movimiento.crear',`Ajuste por toma: ${numero} (${sobrantes.length} línea(s))`,numero);
  }

  // Generar movimiento TIS consolidado por faltantes
  if(faltantes.length>0){
    const numero=await nextCounter('TIS');
    const detalles=faltantes.map(l=>{
      const cant=Number(l.teorico)-Number(l.fisico);
      const costo=Number(l.costoTeorico)||0;
      return {
        codigoInterno:l.codigoInterno,
        descripcion:l.descripcion,
        unidadMedida:l.unidadMedida,
        cantidad:cant,
        costo:costo,
        lote:l.lote||'',
        fechaVenc:l.fechaVenc||'',
        loteId:l.loteId||''
      };
    });
    const m={
      numero,tipo:'SAL',tipoMovimiento:'TOMA INVENTARIO SAL',
      fecha:new Date().toISOString(),
      bodegaId:t.bodegaId,
      documento:`Toma ${t.numero}`,
      observaciones:`Faltantes detectados en toma ${t.numero}. Autorizado por ${STATE.user.id}.`,
      detalles,
      tomaId:t.id,
      tomaNumero:t.numero,
      usuario:STATE.user.id,
      autorizadoPor:STATE.user.id,
      creado:new Date().toISOString(),
      anulado:false
    };
    await dbPut('movements',m);
    movimientosGenerados.push(numero);
    await audit('movimiento.crear',`Ajuste por toma: ${numero} (${faltantes.length} línea(s))`,numero);
  }

  // Saldos: recálculo completo desde movimientos (regla general del SCI).
  if(movimientosGenerados.length) await _ejecutarRecalculoStock();

  // Marcar la toma como aplicada
  t.estado='APLICADA';
  t.aplicado=new Date().toISOString();
  t.movimientosGenerados=movimientosGenerados;
  await dbPut('inventoryCounts',t);
  await audit('toma.autorizar',`Toma ${t.numero} autorizada y aplicada (${movimientosGenerados.length} movimiento(s))`,t.id);
  await reloadCache();
}

/* Navegar a la vista del movimiento generado */
function _navToMov(numero){
  navigate('movimientos');
  setTimeout(()=>viewMovimiento(numero),200);
}

function exportTomaExcel(){
  const t=_tomaActiva;if(!t)return;
  const b=getWarehouse(t.bodegaId);
  const data=t.lineas.map(l=>{
    const dif=l.fisicoIngresado?Number(l.fisico)-Number(l.teorico):null;
    return {
      'Código':l.codigoInterno,'Descripción':l.descripcion,'UM':l.unidadMedida||'',
      'Lote':l.lote||'','Vencimiento':l.fechaVenc||'',
      'Teórico':l.teorico,'Físico':l.fisicoIngresado?l.fisico:'',
      'Diferencia':dif!==null?dif:'',
      'Costo Unit.':l.costoTeorico,
      'Impacto':dif!==null?(dif*Number(l.costoTeorico)):'',
      'Estado conteo':l.fisicoIngresado?(l.asumidoCero?'Asumido cero':'Ingresado'):'Pendiente'
    };
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Toma');
  XLSX.writeFile(wb,`${t.numero}_${(b?b.nombre:t.bodegaId).replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ INFORME DE AJUSTES POST-TOMA ═══════════════ */
async function generarInformeAjustes(){
  const t=_tomaActiva;
  if(!t){toast('Sin toma activa','','error');return}
  if(t.estado!=='APLICADA'){toast('Toma no aplicada','El informe solo se genera tras aplicar los ajustes','warning');return}

  const b=getWarehouse(t.bodegaId);
  const empresaCfg=STATE.cache.config?.empresa||{};
  const conDif=t.lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)!==Number(l.teorico));
  const sinDif=t.lineas.filter(l=>l.fisicoIngresado&&Number(l.fisico)===Number(l.teorico));

  // Para cada línea con diferencia, calcular PPP antes y después
  const filas=[];
  for(const l of conDif){
    const dif=Number(l.fisico)-Number(l.teorico);
    const tipoAjuste=dif>0?'TIE (Sobrante)':'TIS (Faltante)';
    const cantAjuste=Math.abs(dif);
    const costoUnitario=Number(l.costoTeorico)||0;
    const impacto=dif*costoUnitario;

    // PPP antes del ajuste = costoTeorico congelado
    const pppAntes=costoUnitario;

    // Para calcular PPP después del ajuste:
    // - Si es TIE (sobrante): hubo entrada → PPP cambia
    //   nuevoPPP = (cantAntes * pppAntes + cantEntr * costoEntr) / (cantAntes + cantEntr)
    //   Como costoEntr = pppAntes (usamos costo congelado), entonces nuevoPPP = pppAntes (no cambia)
    //   PERO: el PPP real de la bodega después de aplicar es el actual del stock
    // - Si es TIS (faltante): salida → PPP no cambia
    //
    // Vamos a leer el stock ACTUAL del producto en la bodega para mostrar el PPP real post-ajuste

    let pppDespues=pppAntes;
    let cantStockActual=0;
    if(!l.manejaAtributos){
      const stockActual=getStock(l.codigoInterno,t.bodegaId);
      if(stockActual){
        pppDespues=Number(stockActual.costoPromedio)||0;
        cantStockActual=Number(stockActual.cantidad)||0;
      }
    }else{
      // Para productos con lote, el PPP del lote
      if(l.loteId){
        const lote=STATE.cache.lots.find(x=>x.id===l.loteId);
        if(lote){
          pppDespues=Number(lote.costo)||0;
          cantStockActual=Number(lote.cantidad)||0;
        }
      }
      // Y también el stock total consolidado
      const stockActual=getStock(l.codigoInterno,t.bodegaId);
      if(stockActual)cantStockActual=Number(stockActual.cantidad)||0;
    }

    const variacionPPP=pppDespues-pppAntes;
    const variacionPctPPP=pppAntes>0?((variacionPPP/pppAntes)*100):0;

    filas.push({
      'Código':l.codigoInterno,
      'Descripción':l.descripcion,
      'UM':l.unidadMedida||'',
      'Lote':l.lote||'',
      'Vencimiento':l.fechaVenc?fmtDateOnly(l.fechaVenc):'',
      'Cantidad teórica':Number(l.teorico),
      'Cantidad física':Number(l.fisico),
      'Diferencia (cant.)':dif,
      'Tipo ajuste':tipoAjuste,
      'Cantidad ajustada':cantAjuste,
      'PPP antes':pppAntes,
      'PPP después':pppDespues,
      'Variación PPP':variacionPPP,
      'Variación PPP %':Number(variacionPctPPP.toFixed(2)),
      'Costo unitario aplicado':costoUnitario,
      'Impacto valorado':impacto,
      'Stock actual post-ajuste':cantStockActual,
      'Asumido cero':l.asumidoCero?'Sí':'No'
    });
  }

  // Hoja 1: Informe ejecutivo (resumen)
  const totalSobrantes=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).length;
  const totalFaltantes=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).length;
  const cantSobrante=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).reduce((s,l)=>s+(Number(l.fisico)-Number(l.teorico)),0);
  const cantFaltante=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).reduce((s,l)=>s+(Number(l.teorico)-Number(l.fisico)),0);
  const valorSobrante=conDif.filter(l=>Number(l.fisico)>Number(l.teorico)).reduce((s,l)=>s+(Number(l.fisico)-Number(l.teorico))*Number(l.costoTeorico),0);
  const valorFaltante=conDif.filter(l=>Number(l.fisico)<Number(l.teorico)).reduce((s,l)=>s+(Number(l.teorico)-Number(l.fisico))*Number(l.costoTeorico),0);
  const impactoNeto=valorSobrante-valorFaltante;

  const resumen=[
    ['INFORME DE AJUSTES POR TOMA DE INVENTARIO'],
    [],
    ['Empresa:',empresaCfg.nombre||'(no configurado)'],
    ['RUT:',empresaCfg.rut||'-'],
    [],
    ['DATOS DE LA TOMA'],
    ['N° Toma:',t.numero],
    ['Bodega:',b?b.nombre:t.bodegaId],
    ['Fecha inicio:',fmtDate(t.creado)],
    ['Iniciada por:',t.usuario||'-'],
    ['Fecha cierre:',t.cerrado?fmtDate(t.cerrado):'-'],
    ['Cerrada por:',t.cerradoPor||'-'],
    ['Fecha autorización:',t.autorizado?fmtDate(t.autorizado):'-'],
    ['Autorizada por:',t.autorizadoPor||'-'],
    ['Fecha aplicación:',t.aplicado?fmtDate(t.aplicado):'-'],
    ['Movimientos generados:',(t.movimientosGenerados||[]).join(', ')],
    ['Observaciones:',t.observaciones||''],
    [],
    ['ALCANCE'],
    ['Filtro grupo:',t.filtroGrupo||'(todos)'],
    ['Filtro tipo:',t.filtroTipo||'(todos)'],
    ['Alcance:',t.alcance==='conStock'?'Solo productos con stock':'Todos los productos'],
    ['Total líneas inventariadas:',t.lineas.length],
    [],
    ['RESULTADO DE LA TOMA'],
    ['Líneas SIN diferencia:',sinDif.length],
    ['Líneas CON diferencia:',conDif.length],
    [],
    ['SOBRANTES (TIE - Entrada)'],
    ['Cantidad de líneas:',totalSobrantes],
    ['Total unidades sobrantes:',cantSobrante],
    ['Valor monetario sobrantes:',valorSobrante],
    [],
    ['FALTANTES (TIS - Salida)'],
    ['Cantidad de líneas:',totalFaltantes],
    ['Total unidades faltantes:',cantFaltante],
    ['Valor monetario faltantes:',valorFaltante],
    [],
    ['IMPACTO NETO EN INVENTARIO'],
    ['Valor:',impactoNeto],
    ['Interpretación:',impactoNeto>=0?'El inventario aumentó en valor':'El inventario disminuyó en valor'],
    [],
    ['NOTA TÉCNICA'],
    ['• El PPP solo se modifica con sobrantes (TIE), porque las entradas afectan el promedio.'],
    ['• Los faltantes (TIS) NO modifican el PPP, solo decrementan la cantidad.'],
    ['• El costo aplicado a los ajustes es el PPP congelado al iniciar la toma.'],
    ['• Para productos con lote, el costo aplicado es el del lote específico al iniciar.'],
    [],
    ['Generado:',fmtDate(new Date())]
  ];
  const ws1=XLSX.utils.aoa_to_sheet(resumen);
  ws1['!cols']=[{wch:32},{wch:60}];
  // Aplicar negrita a títulos (vía celdas específicas)
  ['A1','A6','A19','A25','A28','A33','A38','A41'].forEach(addr=>{
    if(ws1[addr])ws1[addr].s={font:{bold:true}};
  });

  // Hoja 2: Detalle completo de ajustes
  const ws2=XLSX.utils.json_to_sheet(filas);
  ws2['!cols']=[
    {wch:11},{wch:38},{wch:5},{wch:14},{wch:11},
    {wch:13},{wch:13},{wch:14},{wch:16},{wch:14},
    {wch:11},{wch:11},{wch:13},{wch:14},{wch:18},
    {wch:14},{wch:18},{wch:11}
  ];

  // Hoja 3: Solo sobrantes
  const sobrantesData=filas.filter(f=>f['Tipo ajuste'].includes('TIE'));
  const ws3=sobrantesData.length>0?XLSX.utils.json_to_sheet(sobrantesData):XLSX.utils.aoa_to_sheet([['Sin sobrantes en esta toma']]);
  if(sobrantesData.length>0)ws3['!cols']=ws2['!cols'];

  // Hoja 4: Solo faltantes
  const faltantesData=filas.filter(f=>f['Tipo ajuste'].includes('TIS'));
  const ws4=faltantesData.length>0?XLSX.utils.json_to_sheet(faltantesData):XLSX.utils.aoa_to_sheet([['Sin faltantes en esta toma']]);
  if(faltantesData.length>0)ws4['!cols']=ws2['!cols'];

  // Hoja 5: Líneas sin diferencia (auditoria)
  const sinDifData=sinDif.map(l=>({
    'Código':l.codigoInterno,
    'Descripción':l.descripcion,
    'UM':l.unidadMedida||'',
    'Lote':l.lote||'',
    'Cantidad confirmada':Number(l.fisico),
    'Costo unitario':Number(l.costoTeorico),
    'Valor':Number(l.fisico)*Number(l.costoTeorico)
  }));
  const ws5=sinDifData.length>0?XLSX.utils.json_to_sheet(sinDifData):XLSX.utils.aoa_to_sheet([['Sin líneas confirmadas (todas tuvieron diferencia)']]);
  if(sinDifData.length>0)ws5['!cols']=[{wch:11},{wch:38},{wch:5},{wch:14},{wch:18},{wch:14},{wch:14}];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws1,'Resumen ejecutivo');
  XLSX.utils.book_append_sheet(wb,ws2,'Detalle de ajustes');
  XLSX.utils.book_append_sheet(wb,ws3,'Sobrantes (TIE)');
  XLSX.utils.book_append_sheet(wb,ws4,'Faltantes (TIS)');
  XLSX.utils.book_append_sheet(wb,ws5,'Sin diferencia');

  const fname=`Informe_Ajustes_${t.numero}_${(b?b.nombre:t.bodegaId).replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb,fname);
  toast('Informe generado',`${conDif.length} ajuste(s) en ${filas.length===0?'sin diferencias':filas.length+' línea(s)'}`);
}

/* ═══════════════ PAGE: STOCK ═══════════════ */
let stockFilter={bodega:'',search:'',soloConSaldo:true,grupo:'',subgrupo:'',tipo:''};
function renderStock(c){
  const grupos=STATE.cache.groups.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  // Sub-grupos disponibles según el grupo seleccionado
  let subgruposDisponibles=[];
  if(stockFilter.grupo){
    const g=STATE.cache.groups.find(x=>x.nombre===stockFilter.grupo);
    if(g)subgruposDisponibles=(g.subgrupos||[]).slice().sort();
  }else{
    // Si no hay grupo, mostrar todos los sub-grupos posibles
    const set=new Set();
    STATE.cache.groups.forEach(g=>(g.subgrupos||[]).forEach(s=>set.add(s)));
    subgruposDisponibles=[...set].sort();
  }
  c.innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Stock por Bodega</div><div class="page-subtitle">Saldos y valorización a costo PPP</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="exportStockExcel()">📊 Exportar Excel</button>
        <button class="btn btn-primary" onclick="generarInformeStock()">📄 Generar Informe</button>
      </div>
    </div>
    <div class="card">
      <div class="filters" style="flex-wrap:wrap;gap:10px">
        <div class="field grow" style="min-width:220px"><label>Buscar producto</label><input type="text" id="stSearch" placeholder="Código, EAN o descripción..." value="${escapeHtml(stockFilter.search)}"></div>
        <div class="field"><label>Bodega</label><select id="stBod"><option value="">Todas</option>${STATE.cache.warehouses.map(b=>`<option value="${b.id}" ${stockFilter.bodega===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo</label><select id="stTipo"><option value="">Todos</option>${tipos.map(t=>`<option value="${escapeHtml(t.nombre)}" ${stockFilter.tipo===t.nombre?'selected':''}>${escapeHtml(t.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label>Grupo</label><select id="stGrp"><option value="">Todos</option>${grupos.map(g=>`<option value="${escapeHtml(g.nombre)}" ${stockFilter.grupo===g.nombre?'selected':''}>${escapeHtml(g.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label>Sub-grupo</label><select id="stSub" ${subgruposDisponibles.length===0?'disabled':''}><option value="">Todos</option>${subgruposDisponibles.map(s=>`<option value="${escapeHtml(s)}" ${stockFilter.subgrupo===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></div>
        <div class="field"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:400;font-size:13px;padding-top:18px"><input type="checkbox" id="stSaldo" ${stockFilter.soloConSaldo?'checked':''}> Solo con saldo</label></div>
        ${stockFilter.bodega||stockFilter.tipo||stockFilter.grupo||stockFilter.subgrupo||stockFilter.search?`<div class="field" style="display:flex;align-items:end"><button class="btn btn-secondary btn-sm" onclick="limpiarFiltrosStock()" style="height:38px">✕ Limpiar filtros</button></div>`:''}
      </div>
      <div id="stTable"></div>
    </div>`;
  ['stSearch','stBod','stTipo','stSaldo'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    stockFilter.search=document.getElementById('stSearch').value;
    stockFilter.bodega=document.getElementById('stBod').value;
    stockFilter.tipo=document.getElementById('stTipo').value;
    stockFilter.soloConSaldo=document.getElementById('stSaldo').checked;
    renderStockTable();
  }));
  // Grupo cambia: re-render para actualizar sub-grupos disponibles
  document.getElementById('stGrp').addEventListener('change',()=>{
    stockFilter.grupo=document.getElementById('stGrp').value;
    stockFilter.subgrupo=''; // resetear sub-grupo al cambiar grupo
    renderStock(c);
  });
  document.getElementById('stSub').addEventListener('change',()=>{
    stockFilter.subgrupo=document.getElementById('stSub').value;
    renderStockTable();
  });
  renderStockTable();
}

function limpiarFiltrosStock(){
  stockFilter={bodega:'',search:'',soloConSaldo:true,grupo:'',subgrupo:'',tipo:''};
  renderStock(document.getElementById('mainContent'));
}
function renderStockTable(){
  const w=document.getElementById('stTable');
  // soloConSaldo está activo por defecto y NO cuenta como filtro de búsqueda
  const hayFiltro = stockFilter.search || stockFilter.bodega || stockFilter.tipo || stockFilter.grupo || stockFilter.subgrupo;
  if(!hayFiltro){
    w.innerHTML='<div class="empty-state" style="padding:40px 20px">'+
      '<div class="empty-state-icon">🔍</div>'+
      '<div class="empty-state-title">Busca o filtra el stock</div>'+
      '<div class="empty-state-text">Usa el buscador (código, EAN o descripción) o filtra por bodega, tipo, grupo o sub-grupo para ver saldos.</div>'+
    '</div>';
    return;
  }
  let rows;
  if(stockFilter.search){
    // Con texto de búsqueda: buscar en TODO el catálogo, incluyendo productos
    // con saldo 0 o sin ningún registro de stock (que no están en cache.stock).
    const s=stockFilter.search.toLowerCase();
    const coincide=p=>(p.codigoInterno+' '+(p.codigoEAN||'')+' '+(p.descripcion||'')).toLowerCase().includes(s);
    rows=[];
    STATE.cache.products.filter(coincide).forEach(p=>{
      const regs=STATE.cache.stock.filter(x=>x.codigoInterno===p.codigoInterno);
      if(regs.length){
        regs.forEach(x=>rows.push({...x,p:p,b:getWarehouse(x.bodegaId)}));
      }else{
        // Producto sin registro de stock: fila virtual con saldo 0
        rows.push({codigoInterno:p.codigoInterno,bodegaId:null,cantidad:0,costoPromedio:0,p:p,b:null});
      }
    });
    // Al buscar por texto, ignoramos "solo con saldo" para no ocultar coincidencias.
  }else{
    rows=STATE.cache.stock.map(s=>({...s,p:getProduct(s.codigoInterno),b:getWarehouse(s.bodegaId)})).filter(r=>r.p);
    if(stockFilter.soloConSaldo)rows=rows.filter(r=>r.cantidad>0);
  }
  if(stockFilter.bodega)rows=rows.filter(r=>r.bodegaId===stockFilter.bodega);
  if(stockFilter.tipo)rows=rows.filter(r=>r.p.tipoProducto===stockFilter.tipo);
  if(stockFilter.grupo)rows=rows.filter(r=>r.p.grupo===stockFilter.grupo);
  if(stockFilter.subgrupo)rows=rows.filter(r=>r.p.subGrupo===stockFilter.subgrupo);
  rows=rows.sort((a,b)=>(a.b?.nombre||'').localeCompare(b.b?.nombre||'')||a.codigoInterno.localeCompare(b.codigoInterno));
  const totVal=rows.reduce((s,r)=>s+r.cantidad*r.costoPromedio,0);
  if(rows.length===0){w.innerHTML='<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Sin saldos</div></div>';return}
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>Bodega</th><th>Código</th><th>Producto</th><th>Grupo / Sub-grupo</th><th>UM</th><th class="num">Stock</th><th class="num">Costo PPP</th><th class="num">Valor</th><th class="center">Lote</th></tr></thead>
    <tbody>${rows.map(r=>{
      const lots=(function(){
        // De-duplicar lotes por (codigoInterno, bodegaId, lote) — pueden existir duplicados
        // por sincronización Firebase con distintos id pero misma clave real.
        var raw=STATE.cache.lots.filter(l=>l.codigoInterno===r.codigoInterno&&l.bodegaId===r.bodegaId&&l.cantidad>0);
        var seen={}, dedup=[];
        raw.forEach(function(l){
          var k=(l.codigoInterno||'')+'|'+(l.bodegaId||'')+'|'+(l.lote||'');
          if(!seen[k]){
            seen[k]={
              ...l,
              cantidad:Number(l.cantidad)||0
            };
            dedup.push(seen[k]);
          }else{
            seen[k].cantidad += Number(l.cantidad)||0;
          }
        });
        return dedup;
      })();
      return `<tr${(!r.bodegaId&&r.cantidad<=0)?' style="background:#fdeaea"':''}><td>${r.b?escapeHtml(r.b.nombre):(r.bodegaId?escapeHtml(r.bodegaId):'<span style="color:#c0392b">Sin existencias</span>')}</td>
        <td class="mono"><strong>${r.codigoInterno}</strong></td>
        <td>${escapeHtml(r.p.descripcion)}</td>
        <td style="font-size:12px;color:var(--mu)">${escapeHtml(r.p.grupo||'-')}${r.p.subGrupo?' / '+escapeHtml(r.p.subGrupo):''}</td>
        <td class="center">${escapeHtml(r.p.unidadMedida)}</td>
        <td class="num">${fmtNum(r.cantidad,2)}</td>
        <td class="num">${fmtMon(r.costoPromedio)}</td>
        <td class="num"><strong>${fmtMon(r.cantidad*r.costoPromedio)}</strong></td>
        <td class="center">${r.p.manejaAtributos?`<a onclick="showLotsDetail('${r.codigoInterno}','${r.bodegaId}')" style="cursor:pointer;color:var(--gm)">${lots.length} lote(s)</a>`:'-'}</td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr style="background:var(--gp);font-weight:600"><td colspan="7" style="padding:10px 12px;text-align:right">Total valorizado (${rows.length} línea(s)):</td><td class="num" style="padding:10px 12px;color:var(--gd)">${fmtMon(totVal)}</td><td></td></tr></tfoot>
  </table></div>`;
}
function showLotsDetail(prod,bod){
  const p=getProduct(prod);const b=getWarehouse(bod);
  const lots=(function(){ var raw=STATE.cache.lots.filter(l=>l.codigoInterno===prod&&l.bodegaId===bod&&l.cantidad>0).sort((a,b)=>(a.fechaVenc||'').localeCompare(b.fechaVenc||''));
    var seen={},dd=[];
    raw.forEach(function(l){
      var k=l.codigoInterno+'|'+l.bodegaId+'|'+(l.lote||'');
      if(!seen[k]){
        seen[k]={
          ...l,
          cantidad:Number(l.cantidad)||0
        };
        dd.push(seen[k]);
      }else{
        seen[k].cantidad += Number(l.cantidad)||0;
      }
    });
    return dd; })();
  showModal(`Lotes · ${prod} · ${b?b.nombre:bod}`,
    `<div style="font-size:13px;margin-bottom:8px"><strong>${escapeHtml(p?.descripcion||'')}</strong></div>
     <table class="detalle-table"><thead><tr><th>Lote</th><th>Vencimiento</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Valor</th></tr></thead>
     <tbody>${lots.map(l=>{const venc=l.fechaVenc?new Date(l.fechaVenc):null;const cls=venc&&venc<new Date(Date.now()+30*86400000)?'badge-amber':(venc&&venc<new Date()?'badge-red':'');
       return `<tr><td class="mono"><strong>${escapeHtml(l.lote)}</strong></td><td><span class="badge ${cls}">${fmtDateOnly(l.fechaVenc)}</span></td><td class="num">${fmtNum(l.cantidad,2)}</td><td class="num">${fmtMon(l.costo)}</td><td class="num"><strong>${fmtMon(l.cantidad*l.costo)}</strong></td></tr>`}).join('')}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`,'md');
}
/* ═══════════════ INFORME DE STOCK CON FILTROS ═══════════════ */
function generarInformeStock(){
  const grupos=STATE.cache.groups.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const tipos=STATE.cache.productTypes.filter(t=>t.activo!==false).slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  showModal('Generar informe de stock',
    `<div class="alert alert-info" style="margin-bottom:14px;font-size:13px">📄 Genera un informe Excel con filtros específicos. El informe incluye 3 hojas: detalle de productos, resumen agrupado por grupo/sub-grupo, y portada con totales.</div>
    <div class="form-grid">
      <div class="form-field"><label>Bodega</label>
        <select id="infBod">
          <option value="">Todas las bodegas</option>
          ${STATE.cache.warehouses.map(b=>`<option value="${b.id}" ${stockFilter.bodega===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Tipo de producto</label>
        <select id="infTipo">
          <option value="">Todos los tipos</option>
          ${tipos.map(t=>`<option value="${escapeHtml(t.nombre)}" ${stockFilter.tipo===t.nombre?'selected':''}>${escapeHtml(t.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Grupo</label>
        <select id="infGrp">
          <option value="">Todos los grupos</option>
          ${grupos.map(g=>`<option value="${escapeHtml(g.nombre)}" ${stockFilter.grupo===g.nombre?'selected':''}>${escapeHtml(g.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Sub-grupo</label>
        <select id="infSub" disabled>
          <option value="">Todos los sub-grupos</option>
        </select>
        <div class="hint">Se habilitará al seleccionar un grupo</div>
      </div>
      <div class="form-field span-2"><label>Mostrar</label>
        <select id="infSaldo">
          <option value="1" ${stockFilter.soloConSaldo?'selected':''}>Solo productos con saldo > 0</option>
          <option value="0" ${!stockFilter.soloConSaldo?'selected':''}>Todos los productos del catálogo (incluye saldo cero)</option>
        </select>
      </div>
      <div class="form-field span-2"><label>Detalle de lotes</label>
        <select id="infLotes">
          <option value="resumen">Solo cantidad consolidada por producto</option>
          <option value="detalle">Incluir hoja con detalle por lote (productos con manejo de atributos)</option>
        </select>
      </div>
      <div class="form-field span-2"><label>Observaciones del informe (opcional)</label>
        <input type="text" id="infObs" placeholder="Ej: Cierre mensual mayo 2026, Auditoría externa, etc.">
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" id="btnGenInf">📄 Generar Informe</button>`,
    'lg');

  // Cargar sub-grupos al cambiar grupo
  const grpSel=document.getElementById('infGrp');
  const subSel=document.getElementById('infSub');
  function loadSubgrupos(){
    const grp=grpSel.value;
    if(!grp){
      subSel.innerHTML='<option value="">Todos los sub-grupos</option>';
      subSel.disabled=true;
      return;
    }
    const g=STATE.cache.groups.find(x=>x.nombre===grp);
    const subs=g?(g.subgrupos||[]).slice().sort():[];
    subSel.innerHTML='<option value="">Todos los sub-grupos</option>'+subs.map(s=>`<option value="${escapeHtml(s)}" ${stockFilter.subgrupo===s?'selected':''}>${escapeHtml(s)}</option>`).join('');
    subSel.disabled=subs.length===0;
  }
  grpSel.addEventListener('change',loadSubgrupos);
  loadSubgrupos();

  document.getElementById('btnGenInf').onclick=()=>{
    const filtros={
      bodega:document.getElementById('infBod').value,
      tipo:document.getElementById('infTipo').value,
      grupo:document.getElementById('infGrp').value,
      subgrupo:document.getElementById('infSub').value,
      soloConSaldo:document.getElementById('infSaldo').value==='1',
      incluirLotes:document.getElementById('infLotes').value==='detalle',
      observaciones:document.getElementById('infObs').value.trim()
    };
    closeModal();
    _ejecutarInformeStock(filtros);
  };
}

function _ejecutarInformeStock(f){
  showLoading('Generando informe...');
  try{
    // Construir set de productos según filtros (incluye los sin stock si aplicable)
    let productos=STATE.cache.products.slice();
    if(f.tipo)productos=productos.filter(p=>p.tipoProducto===f.tipo);
    if(f.grupo)productos=productos.filter(p=>p.grupo===f.grupo);
    if(f.subgrupo)productos=productos.filter(p=>p.subGrupo===f.subgrupo);

    // Bodegas a incluir
    const bodegas=f.bodega?STATE.cache.warehouses.filter(b=>b.id===f.bodega):STATE.cache.warehouses.filter(b=>b.activo);

    // Construir filas: una por (producto, bodega) con saldo
    const filas=[];
    for(const p of productos){
      for(const b of bodegas){
        const st=getStock(p.codigoInterno,b.id);
        const cant=st?Number(st.cantidad)||0:0;
        const ppp=st?Number(st.costoPromedio)||0:0;
        if(f.soloConSaldo&&cant<=0)continue;
        const lots=p.manejaAtributos?STATE.cache.lots.filter(l=>l.codigoInterno===p.codigoInterno&&l.bodegaId===b.id&&l.cantidad>0):[];
        filas.push({
          'Bodega':b.nombre,
          'Código':p.codigoInterno,
          'EAN':p.codigoEAN||'',
          'Descripción':p.descripcion,
          'Tipo':p.tipoProducto||'',
          'Grupo':p.grupo||'',
          'Sub-grupo':p.subGrupo||'',
          'UM':p.unidadMedida||'',
          'Cantidad':cant,
          'Costo PPP':ppp,
          'Valor total':cant*ppp,
          'Maneja lotes':p.manejaAtributos?'SI':'NO',
          'N° de lotes':lots.length,
          'Stock mínimo':p.stockMinimo||0,
          'Bajo mínimo':(p.stockMinimo>0&&cant<p.stockMinimo)?'SI':'NO',
          '_p':p,'_b':b,'_lots':lots,'_st':st
        });
      }
    }
    // Ordenar por bodega → grupo → sub-grupo → descripción
    filas.sort((a,b)=>
      a.Bodega.localeCompare(b.Bodega)||
      a.Grupo.localeCompare(b.Grupo)||
      (a['Sub-grupo']||'').localeCompare(b['Sub-grupo']||'')||
      a.Descripción.localeCompare(b.Descripción)
    );

    // Datos para el informe
    const totalLineas=filas.length;
    const totalUnidades=filas.reduce((s,r)=>s+r.Cantidad,0);
    const totalValorizado=filas.reduce((s,r)=>s+r['Valor total'],0);
    const bajoMinimo=filas.filter(r=>r['Bajo mínimo']==='SI').length;
    const conLotes=filas.filter(r=>r['Maneja lotes']==='SI').length;

    const empresaCfg=STATE.cache.config?.empresa||{};

    // ─── Hoja 1: Portada / resumen ───
    const portada=[
      ['INFORME DE STOCK'],
      [],
      ['Empresa:',empresaCfg.nombre||'(no configurado)'],
      ['RUT:',empresaCfg.rut||'-'],
      ['Generado:',fmtDate(new Date())],
      ['Generado por:',(STATE.user?.nombre||STATE.user?.id||'-')],
      [],
      ['CRITERIOS DE FILTRO'],
      ['Bodega:',f.bodega?(getWarehouse(f.bodega)?.nombre||f.bodega):'Todas las bodegas activas'],
      ['Tipo de producto:',f.tipo||'Todos los tipos'],
      ['Grupo:',f.grupo||'Todos los grupos'],
      ['Sub-grupo:',f.subgrupo||'Todos los sub-grupos'],
      ['Mostrar:',f.soloConSaldo?'Solo productos con saldo > 0':'Todos los productos (incluye saldo cero)'],
      ['Detalle de lotes:',f.incluirLotes?'Incluido en hoja aparte':'No incluido'],
      ['Observaciones:',f.observaciones||'-'],
      [],
      ['TOTALES DEL INFORME'],
      ['Líneas (producto × bodega):',totalLineas],
      ['Total unidades en stock:',totalUnidades],
      ['Valor total inventario:',totalValorizado],
      ['Productos bajo stock mínimo:',bajoMinimo],
      ['Productos con manejo de lotes:',conLotes],
      [],
      ['NOTA TÉCNICA'],
      ['• La valorización usa el costo PPP (Precio Promedio Ponderado) actual de cada producto en cada bodega.'],
      ['• Para productos con manejo de atributos (lote), el costo del lote individual puede diferir del PPP consolidado.'],
      ['• "Bajo mínimo" indica productos cuyo stock actual es inferior al stock mínimo configurado en la ficha.'],
    ];
    const ws1=XLSX.utils.aoa_to_sheet(portada);
    ws1['!cols']=[{wch:32},{wch:60}];

    // ─── Hoja 2: Detalle de productos ───
    // Para productos con manejo de atributos, se expande UNA FILA POR LOTE con
    // su lote y vencimiento (trazabilidad completa). Los demás, una fila normal.
    const hoy0=new Date();
    const detalleData=[];
    filas.forEach(r=>{
      const base={
        'Bodega':r.Bodega,'Código':r['Código'],'EAN':r.EAN,'Descripción':r.Descripción,
        'Tipo':r.Tipo,'Grupo':r.Grupo,'Sub-grupo':r['Sub-grupo'],'UM':r.UM
      };
      if(r['Maneja lotes']==='SI' && r._lots.length>0){
        r._lots.forEach(l=>{
          const venc=l.fechaVenc?new Date(l.fechaVenc):null;
          const dias=venc?Math.floor((venc-hoy0)/86400000):null;
          let estadoVenc='Sin vencimiento';
          if(dias!==null){ estadoVenc = dias<0?'VENCIDO':(dias<=30?'Por vencer (<=30d)':'Vigente'); }
          detalleData.push({
            ...base,
            'Lote':l.lote||'(sin lote)',
            'Vencimiento':l.fechaVenc?fmtDateOnly(l.fechaVenc):'',
            'Estado venc.':estadoVenc,
            'Cantidad':Number(l.cantidad)||0,
            'Costo unitario':Number(l.costo)||0,
            'Valor total':(Number(l.cantidad)||0)*(Number(l.costo)||0),
            'Stock mínimo':r['Stock mínimo'],
            'Bajo mínimo':r['Bajo mínimo']
          });
        });
      } else {
        detalleData.push({
          ...base,
          'Lote':r['Maneja lotes']==='SI'?'(sin lote)':'—',
          'Vencimiento':'',
          'Estado venc.':'—',
          'Cantidad':r.Cantidad,
          'Costo unitario':r['Costo PPP'],
          'Valor total':r['Valor total'],
          'Stock mínimo':r['Stock mínimo'],
          'Bajo mínimo':r['Bajo mínimo']
        });
      }
    });
    const ws2=XLSX.utils.json_to_sheet(detalleData);
    ws2['!cols']=[
      {wch:20},{wch:11},{wch:14},{wch:38},{wch:16},{wch:16},{wch:16},
      {wch:5},{wch:16},{wch:12},{wch:16},{wch:11},{wch:13},{wch:14},{wch:12},{wch:11}
    ];

    // ─── Hoja 3: Resumen por grupo / sub-grupo ───
    const resumenMap={};
    filas.forEach(r=>{
      const key=`${r.Grupo||'(sin grupo)'} / ${r['Sub-grupo']||'(sin sub-grupo)'}`;
      if(!resumenMap[key]){
        resumenMap[key]={
          'Grupo':r.Grupo||'(sin grupo)',
          'Sub-grupo':r['Sub-grupo']||'(sin sub-grupo)',
          'Productos distintos':new Set(),
          'Líneas':0,
          'Cantidad total':0,
          'Valor total':0
        };
      }
      resumenMap[key]['Productos distintos'].add(r['Código']);
      resumenMap[key]['Líneas']+=1;
      resumenMap[key]['Cantidad total']+=r.Cantidad;
      resumenMap[key]['Valor total']+=r['Valor total'];
    });
    const resumenData=Object.values(resumenMap).map(x=>({
      'Grupo':x.Grupo,
      'Sub-grupo':x['Sub-grupo'],
      'Productos distintos':x['Productos distintos'].size,
      'Líneas (producto × bodega)':x['Líneas'],
      'Cantidad total':x['Cantidad total'],
      'Valor total':x['Valor total']
    })).sort((a,b)=>a.Grupo.localeCompare(b.Grupo)||a['Sub-grupo'].localeCompare(b['Sub-grupo']));
    // Agregar fila de total general
    resumenData.push({
      'Grupo':'TOTAL GENERAL',
      'Sub-grupo':'',
      'Productos distintos':new Set(filas.map(r=>r.Código)).size,
      'Líneas (producto × bodega)':totalLineas,
      'Cantidad total':totalUnidades,
      'Valor total':totalValorizado
    });
    const ws3=XLSX.utils.json_to_sheet(resumenData);
    ws3['!cols']=[{wch:22},{wch:22},{wch:18},{wch:22},{wch:14},{wch:16}];

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws1,'Portada');
    XLSX.utils.book_append_sheet(wb,ws2,'Detalle');
    XLSX.utils.book_append_sheet(wb,ws3,'Resumen por grupo');

    // ─── Hoja 4 (opcional): Detalle de lotes ───
    if(f.incluirLotes){
      const lotesData=[];
      filas.filter(r=>r['Maneja lotes']==='SI'&&r._lots.length>0).forEach(r=>{
        r._lots.forEach(l=>{
          const venc=l.fechaVenc?new Date(l.fechaVenc):null;
          const hoy=new Date();
          const diasParaVencer=venc?Math.floor((venc-hoy)/86400000):null;
          let estadoVenc='Sin vencimiento';
          if(diasParaVencer!==null){
            if(diasParaVencer<0)estadoVenc='VENCIDO';
            else if(diasParaVencer<=30)estadoVenc='Por vencer (<= 30 días)';
            else estadoVenc='Vigente';
          }
          lotesData.push({
            'Bodega':r.Bodega,
            'Código':r['Código'],
            'Descripción':r['Descripción'],
            'Grupo':r['Grupo'],
            'Sub-grupo':r['Sub-grupo'],
            'Lote':l.lote||'-',
            'Vencimiento':l.fechaVenc||'-',
            'Días para vencer':diasParaVencer!==null?diasParaVencer:'-',
            'Estado vencimiento':estadoVenc,
            'Cantidad lote':Number(l.cantidad),
            'Costo lote':Number(l.costo),
            'Valor lote':Number(l.cantidad)*Number(l.costo)
          });
        });
      });
      lotesData.sort((a,b)=>(a.Vencimiento||'9999').localeCompare(b.Vencimiento||'9999'));
      const ws4=lotesData.length>0?XLSX.utils.json_to_sheet(lotesData):XLSX.utils.aoa_to_sheet([['Sin lotes para los criterios seleccionados']]);
      if(lotesData.length>0)ws4['!cols']=[{wch:20},{wch:11},{wch:38},{wch:18},{wch:18},{wch:14},{wch:12},{wch:14},{wch:24},{wch:13},{wch:13},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws4,'Detalle de lotes');
    }

    // Nombre del archivo
    let suffix=[];
    if(f.bodega){const b=getWarehouse(f.bodega);if(b)suffix.push(b.nombre.replace(/\s+/g,'_'))}
    if(f.grupo)suffix.push(f.grupo.replace(/\s+/g,'_'));
    if(f.subgrupo)suffix.push(f.subgrupo.replace(/\s+/g,'_'));
    const sufijo=suffix.length>0?'_'+suffix.join('_'):'';
    const fname=`Informe_Stock${sufijo}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb,fname);

    hideLoading();
    toast('Informe generado',`${totalLineas} línea(s) · ${fmtMon(totalValorizado)} valorizado`);
  }catch(e){
    hideLoading();
    toast('Error generando informe',e.message,'error');
    console.error(e);
  }
}

async function exportStockExcel(){
  // Aplica los filtros activos (igual que la tabla en pantalla)
  let rows=STATE.cache.stock.map(s=>({...s,p:getProduct(s.codigoInterno),b:getWarehouse(s.bodegaId)})).filter(r=>r.p);
  if(stockFilter.soloConSaldo)rows=rows.filter(r=>r.cantidad>0);
  if(stockFilter.bodega)rows=rows.filter(r=>r.bodegaId===stockFilter.bodega);
  if(stockFilter.tipo)rows=rows.filter(r=>r.p.tipoProducto===stockFilter.tipo);
  if(stockFilter.grupo)rows=rows.filter(r=>r.p.grupo===stockFilter.grupo);
  if(stockFilter.subgrupo)rows=rows.filter(r=>r.p.subGrupo===stockFilter.subgrupo);
  if(stockFilter.search){const s=stockFilter.search.toLowerCase();rows=rows.filter(r=>(r.codigoInterno+' '+(r.p.codigoEAN||'')+' '+r.p.descripcion).toLowerCase().includes(s))}
  const data=rows.map(r=>({
    Bodega:r.b?.nombre||r.bodegaId,
    'Código':r.codigoInterno,
    'EAN':r.p.codigoEAN||'',
    'Descripción':r.p.descripcion||'',
    'Tipo':r.p.tipoProducto||'',
    'Grupo':r.p.grupo||'',
    'Sub-grupo':r.p.subGrupo||'',
    UM:r.p.unidadMedida||'',
    Cantidad:r.cantidad,
    'Costo PPP':r.costoPromedio,
    Valor:r.cantidad*r.costoPromedio
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=[{wch:20},{wch:11},{wch:14},{wch:38},{wch:18},{wch:18},{wch:18},{wch:5},{wch:11},{wch:13},{wch:14}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Stock');
  XLSX.writeFile(wb,`Stock_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ PAGE: MOVIMIENTOS LISTA ═══════════════ */
let movFilter={tipo:'',bodega:'',search:'',from:'',to:''};
function renderMovimientos(c){
  c.innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Movimientos</div><div class="page-subtitle">Buscar y editar registros</div></div>
      <div style="display:flex;gap:8px">
        ${can('movimientos.crear')?`<button class="btn btn-success" onclick="navigate('entradas')">⬇️ Entrada</button>
        <button class="btn btn-primary" onclick="navigate('salidas')">⬆️ Salida</button>`:''}
        <button class="btn btn-secondary" onclick="exportMovimientosExcel()">📊 Excel</button>
      </div>
    </div>
    <div class="card">
      <div class="filters">
        <div class="field grow"><label>Buscar (N°, observación, doc)</label><input type="text" id="mvSearch" value="${escapeHtml(movFilter.search)}"></div>
        <div class="field"><label>Tipo</label><select id="mvTipo">
          <option value="">Todos</option>
          <option value="ENT" ${movFilter.tipo==='ENT'?'selected':''}>Entrada (todas)</option>
          ${TIPOS_MOV_ENT.map(t=>`<option value="ENT:${t.tipo}" ${movFilter.tipo==='ENT:'+t.tipo?'selected':''}>↳ ${t.icon} ${t.label}</option>`).join('')}
          <option value="SAL" ${movFilter.tipo==='SAL'?'selected':''}>Salida (todas)</option>
          ${TIPOS_MOV_SAL.map(t=>`<option value="SAL:${t.tipo}" ${movFilter.tipo==='SAL:'+t.tipo?'selected':''}>↳ ${t.icon} ${t.label}</option>`).join('')}
        </select></div>
        <div class="field"><label>Bodega</label><select id="mvBod"><option value="">Todas</option>${STATE.cache.warehouses.map(b=>`<option value="${b.id}" ${movFilter.bodega===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label>Desde</label><input type="date" id="mvFrom" value="${movFilter.from}"></div>
        <div class="field"><label>Hasta</label><input type="date" id="mvTo" value="${movFilter.to}"></div>
      </div>
      <div id="mvTable"></div>
    </div>`;
  ['mvSearch','mvTipo','mvBod','mvFrom','mvTo'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{
    movFilter.search=document.getElementById('mvSearch').value;
    movFilter.tipo=document.getElementById('mvTipo').value;
    movFilter.bodega=document.getElementById('mvBod').value;
    movFilter.from=document.getElementById('mvFrom').value;
    movFilter.to=document.getElementById('mvTo').value;
    renderMovimientosTable();
  }));
  renderMovimientosTable();
}
function renderMovimientosTable(){
  const w=document.getElementById('mvTable');
  const hayFiltro = movFilter.search || movFilter.tipo || movFilter.bodega || movFilter.from || movFilter.to;
  if(!hayFiltro){
    w.innerHTML='<div class="empty-state" style="padding:40px 20px">'+
      '<div class="empty-state-icon">🔍</div>'+
      '<div class="empty-state-title">Busca o filtra movimientos</div>'+
      '<div class="empty-state-text">Usa el buscador (N°, observación, documento, proveedor/cliente) o filtra por tipo, bodega o rango de fechas.<br>Hay <strong>'+STATE.cache.movements.length+'</strong> movimiento(s) registrados.</div>'+
    '</div>';
    return;
  }
  let rows=[...STATE.cache.movements].filter(r=>!r.anulado);
  if(movFilter.tipo){
    if(movFilter.tipo.includes(':')){
      const [base,sub]=movFilter.tipo.split(':');
      rows=rows.filter(r=>r.tipo===base&&r.tipoMovimiento===sub);
    }else{
      rows=rows.filter(r=>r.tipo===movFilter.tipo);
    }
  }
  if(movFilter.bodega)rows=rows.filter(r=>r.bodegaId===movFilter.bodega);
  if(movFilter.from)rows=rows.filter(r=>r.fecha>=movFilter.from);
  if(movFilter.to)rows=rows.filter(r=>r.fecha<=movFilter.to+'T23:59:59');
  if(movFilter.search){const s=movFilter.search.toLowerCase();rows=rows.filter(r=>(r.numero+' '+(r.observaciones||'')+' '+(r.documento||'')+' '+(r.proveedor||'')+' '+(r.proveedorCodigo||'')+' '+(r.proveedorNombre||'')+' '+(r.clienteCodigo||'')+' '+(r.clienteNombre||'')+' '+(r.destino||'')+' '+(r.tipoDoc||'')+' '+(r.numeroDoc||'')+' '+(r.tipoMovimiento||'')+' '+(r.centroCosto||'')+' '+(r.centroCostoNombre||'')+' '+(r.centroCostoArea||'')+' '+tipoMovLabel(r)).toLowerCase().includes(s))}
  rows=rows.sort((a,b)=>b.numero.localeCompare(a.numero));
  if(rows.length===0){w.innerHTML='<div class="empty-state"><div class="empty-state-icon">🔄</div><div class="empty-state-title">Sin movimientos</div></div>';return}
  w.innerHTML=`<div class="table-wrap"><table class="data">
    <thead><tr><th>N°</th><th>Tipo</th><th>Fecha</th><th>Bodega</th><th>Documento</th><th>Proveedor / Destino</th><th class="num">Items</th><th class="num">Valor</th><th class="center">Estado</th><th>Usuario</th><th class="actions">Acciones</th></tr></thead>
    <tbody>${rows.map(m=>{
      const b=getWarehouse(m.bodegaId);
      const valor=(m.detalles||[]).reduce((s,d)=>s+d.cantidad*d.costo,0);
      return `<tr class="row-link" onclick="viewMovimiento('${m.numero}')">
        <td class="mono"><strong>${m.numero}</strong></td>
        <td>
          <span class="badge ${m.tipo==='ENT'?'badge-green':'badge-amber'}">${tipoLabel(m.tipo)}</span>
          ${m.tipoMovimiento?`<div style="font-size:11px;color:var(--mu);margin-top:2px;line-height:1.3">${escapeHtml(tipoMovLabel(m))}</div>`:''}
        </td>
        <td>${fmtDate(m.fecha)}${m.fechaCosecha?`<div style="font-size:11px;color:#0a6e2e;margin-top:2px">🍒 Cosecha: ${fmtDateOnly(m.fechaCosecha)}</div>`:''}</td>
        <td>${escapeHtml(b?b.nombre:m.bodegaId)}</td>
        <td class="mono">${m.tipoDoc?escapeHtml((m.tipoDoc==='GUIA DE DESPACHO'?'GD':m.tipoDoc==='FACTURA'?'FAC':m.tipoDoc==='FACTURA EXENTA'?'FAC.EX':m.tipoDoc==='BOLETA'?'BOL':m.tipoDoc==='NOTA DE CREDITO'?'NC':m.tipoDoc==='NOTA DE DEBITO'?'ND':m.tipoDoc)+' '+(m.numeroDoc||'')):escapeHtml(m.documento||(m.centroCosto?'CC: '+m.centroCosto:'-'))}</td>
        <td>${(()=>{
          if(m.bodegaDestinoId){const bd=getWarehouse(m.bodegaDestinoId);return '→ '+escapeHtml(bd?bd.nombre:m.bodegaDestinoId)}
          if(m.centroCosto){
            const cc=STATE.cache.costCenters.find(c=>c.codigo===m.centroCosto);
            const desc=m.centroCostoNombre||cc?.descripcion||'';
            return '🏢 '+escapeHtml(m.centroCosto)+(desc?' · '+escapeHtml(desc):'');
          }
          return escapeHtml(m.proveedorNombre||m.clienteNombre||m.proveedor||m.destino||'-');
        })()}</td>
        <td class="num">${(m.detalles||[]).length}</td>
        <td class="num">${fmtMon(valor)}</td>
        <td class="center">${m.anulado?'<span class="badge badge-red">Anulado</span>':'<span class="badge badge-green">Vigente</span>'}</td>
        <td>${escapeHtml(m.usuario||'-')}</td>
        <td class="actions" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="viewMovimiento('${m.numero}')">Ver</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function viewMovimiento(numero){
  const m=STATE.cache.movements.find(x=>x.numero===numero);if(!m)return;
  const b=getWarehouse(m.bodegaId);
  const valor=(m.detalles||[]).reduce((s,d)=>s+d.cantidad*d.costo,0);
  const isEnt=m.tipo==='ENT';
  const isSal=m.tipo==='SAL';
  const provLink=isEnt&&m.proveedorCodigo?STATE.cache.providers.find(x=>x.codigo===m.proveedorCodigo):null;
  const cliLink=isSal&&m.clienteCodigo?STATE.cache.customers.find(x=>x.codigo===m.clienteCodigo):null;
  const bDest=isSal&&m.bodegaDestinoId?getWarehouse(m.bodegaDestinoId):null;
  showModal(`${tipoLabel(m.tipo)} · ${m.numero} ${m.anulado?'<span class="badge badge-red">ANULADO</span>':''}`,
    `<div class="form-grid">
      ${m.tipoMovimiento?`<div class="form-field span-2"><label>Tipo de movimiento</label><div><strong style="color:var(--gd)">${escapeHtml(tipoMovLabel(m))}</strong></div></div>`:''}
      <div class="form-field"><label>${isEnt?'Fecha de ingreso':isSal?'Fecha de salida':'Fecha'}</label><div>${fmtDate(m.fecha)}</div></div>
      ${m.fechaCosecha?`<div class="form-field"><label>🍒 Fecha de cosecha</label><div><strong>${fmtDateOnly(m.fechaCosecha)}</strong></div></div>`:''}
      <div class="form-field"><label>Bodega ${bDest?'origen':''}</label><div>${escapeHtml(b?b.nombre:m.bodegaId)}</div></div>
      ${bDest?`<div class="form-field span-2"><label>Bodega destino</label><div><strong>${escapeHtml(bDest.nombre)}</strong></div></div>`:''}
      ${m.centroCosto?`<div class="form-field span-2"><label>Centro de costo</label><div>${(()=>{
        const cc=STATE.cache.costCenters.find(c=>c.codigo===m.centroCosto);
        const desc=m.centroCostoNombre||cc?.descripcion||'';
        const area=m.centroCostoArea||cc?.area||'';
        if(cc){
          return `<a href="#" onclick="event.preventDefault();closeModal();viewCentroCosto('${escapeHtml(m.centroCosto)}')" style="color:var(--gm);text-decoration:none"><strong class="mono">${escapeHtml(m.centroCosto)}</strong> · ${escapeHtml(desc)}${area?` <span style="color:var(--mu);font-size:12px">(${escapeHtml(area)})</span>`:''} ↗</a>`;
        }
        return `<strong class="mono">${escapeHtml(m.centroCosto)}</strong>${desc?' · '+escapeHtml(desc):''}${area?` <span style="color:var(--mu);font-size:12px">(${escapeHtml(area)})</span>`:''}`;
      })()}</div></div>`:''}
      ${isEnt&&m.tipoDoc?`
      <div class="form-field"><label>Tipo de documento</label><div><strong>${escapeHtml(m.tipoDoc)}</strong></div></div>
      <div class="form-field"><label>Número documento</label><div class="mono"><strong>${escapeHtml(m.numeroDoc||'-')}</strong></div></div>
      <div class="form-field"><label>Vencimiento documento</label><div>${m.fechaVencDoc?fmtDateOnly(m.fechaVencDoc):'<span style="color:var(--mu)">-</span>'}</div></div>
      <div class="form-field"><label>Código proveedor</label><div class="mono">${escapeHtml(m.proveedorCodigo||'-')}</div></div>
      <div class="form-field span-2"><label>Proveedor</label><div>${provLink?`<a href="#" onclick="event.preventDefault();closeModal();viewProveedor('${escapeHtml(m.proveedorCodigo)}')" style="color:var(--gm);text-decoration:none"><strong>${escapeHtml(m.proveedorNombre||provLink.razonSocial)}</strong> ↗</a>`:`<strong>${escapeHtml(m.proveedorNombre||m.proveedor||'-')}</strong>`}</div></div>
      `:isSal&&m.tipoDoc?`
      <div class="form-field"><label>Tipo de documento</label><div><strong>${escapeHtml(m.tipoDoc)}</strong></div></div>
      <div class="form-field"><label>Número documento</label><div class="mono"><strong>${escapeHtml(m.numeroDoc||'-')}</strong></div></div>
      <div class="form-field"><label>Vencimiento documento</label><div>${m.fechaVencDoc?fmtDateOnly(m.fechaVencDoc):'<span style="color:var(--mu)">-</span>'}</div></div>
      <div class="form-field"><label>Código cliente</label><div class="mono">${escapeHtml(m.clienteCodigo||'-')}</div></div>
      <div class="form-field span-2"><label>Cliente / Destino</label><div>${cliLink?`<a href="#" onclick="event.preventDefault();closeModal();viewCliente('${escapeHtml(m.clienteCodigo)}')" style="color:var(--gm);text-decoration:none"><strong>${escapeHtml(m.clienteNombre||cliLink.razonSocial)}</strong> ↗</a>`:`<strong>${escapeHtml(m.clienteNombre||m.destino||'-')}</strong>`}</div></div>
      `:`
      <div class="form-field"><label>Documento</label><div class="mono">${escapeHtml(m.documento||'-')}</div></div>
      <div class="form-field"><label>${isEnt?'Proveedor':'Destino'}</label><div>${escapeHtml(m.proveedor||m.destino||'-')}</div></div>
      `}
      ${m.facturaAsociada?`<div class="form-field span-2"><label>🔗 Factura asociada (Nota de Crédito)</label><div><strong>${escapeHtml(m.facturaAsociadaDoc||m.facturaAsociada)}</strong> <span style="color:var(--mu);font-size:12px">· mov. ${escapeHtml(m.facturaAsociada)}</span></div></div>`:''}
      <div class="form-field span-2"><label>Observaciones</label><div>${escapeHtml(m.observaciones||'-')}</div></div>
      <div class="form-field"><label>Usuario</label><div>${escapeHtml(m.usuario||'-')}</div></div>
      <div class="form-field"><label>Total</label><div><strong>${fmtMon(valor)}</strong></div></div>
    </div>
    <h4 style="margin:18px 0 8px;color:var(--gd);font-size:13px">Detalle</h4>
    <table class="detalle-table"><thead><tr><th>Código</th><th>Producto</th><th>UM</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Total</th>${(m.detalles||[]).some(d=>d.lote)?'<th>Lote</th><th>Vence</th>':''}</tr></thead>
    <tbody>${(m.detalles||[]).map(d=>{const p=getProduct(d.codigoInterno);return `<tr>
      <td class="mono">${d.codigoInterno}</td>
      <td>${escapeHtml(p?.descripcion||'')}</td>
      <td class="center">${escapeHtml(p?.unidadMedida||'')}</td>
      <td class="num">${fmtNum(d.cantidad,2)}</td>
      <td class="num">${fmtMon(d.costo)}</td>
      <td class="num"><strong>${fmtMon(d.cantidad*d.costo)}</strong></td>
      ${(m.detalles||[]).some(x=>x.lote)?`<td class="mono">${escapeHtml(d.lote||'')}</td><td>${fmtDateOnly(d.fechaVenc)}</td>`:''}
    </tr>`}).join('')}</tbody></table>
    ${m.editado?`<div class="alert alert-info" style="margin-top:12px;font-size:12px">📝 Editado el ${fmtDate(m.editado)} por ${escapeHtml(m.editadoPor||'')}${m.editadoMotivo?' — '+escapeHtml(m.editadoMotivo):''}</div>`:''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
     ${can('movimientos.editar')&&!m.anulado?`<button class="btn btn-secondary" onclick="closeModal();editMovimiento('${numero}')">✏️ Editar</button>`:''}
     ${can('movimientos.anular')?`<button class="btn btn-danger" onclick="confirmEliminar('${numero}')">🗑️ Eliminar</button>`:''}`,
    'xl');
}

function confirmAnular(numero){
  closeModal();
  setTimeout(()=>{
    showModal('Anular movimiento',
      `<div style="margin-bottom:14px">¿Confirma anular el movimiento <strong>${numero}</strong>?</div>
       <div class="form-field"><label>Motivo (obligatorio)</label><textarea id="anuMot" rows="3" style="padding:9px 11px;border:1px solid var(--bo);border-radius:6px;background:var(--wh);font-family:inherit;font-size:14px"></textarea></div>
       <div class="alert alert-warning" style="margin-top:14px">⚠️ Al anular, se revertirán los efectos en stock y costo PPP. Esta acción queda registrada en auditoría.</div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-danger" onclick="anularMovimiento('${numero}')">Anular</button>`,
      'md');
  },50);
}
async function anularMovimiento(numero){
  const motivo=document.getElementById('anuMot').value.trim();
  if(!motivo){toast('Falta motivo','Debe indicar un motivo','error');return}
  showLoading('Anulando movimiento y recalculando stock...');
  try{
    const m=await dbGet('movements',numero);
    if(!m||m.anulado){hideLoading();toast('Error','Movimiento no encontrado o ya anulado','error');return}
    // Marcar como anulado primero (excluirlo del recálculo)
    m.anulado=true;m.fechaAnulacion=new Date().toISOString();m.usuarioAnulacion=STATE.user.id;m.motivoAnulacion=motivo;
    await dbPut('movements',m);
    await reloadCache();
    // Recalcular TODO el stock desde los movimientos vigentes (excluye el recién anulado)
    // Esto garantiza consistencia matemática sin depender de la reversión inversa
    await _ejecutarRecalculoStock();
    await audit('movimiento.anular',`Anulación: ${motivo}`,numero);
    hideLoading();closeModal();
    toast('Movimiento anulado',`${numero} · Stock recalculado`);
    if(STATE.page==='movimientos')renderMovimientosTable();else navigate(STATE.page);
  }catch(e){hideLoading();toast('Error',e.message,'error');console.error(e)}
}

/* ── Eliminar movimiento (borrado definitivo) ──
   Borra el movimiento por completo y sus registros de combustible vinculados
   (store `combustible`, por movNumero) para que no queden huérfanos en el
   informe de rendimiento; luego recalcula stock desde los movimientos
   restantes. A diferencia de "anular", no deja rastro en la lista. Queda en
   auditoría. */
function confirmEliminar(numero){
  closeModal();
  setTimeout(()=>{
    showModal('Eliminar movimiento',
      `<div style="margin-bottom:14px">¿Confirma <strong>eliminar definitivamente</strong> el movimiento <strong>${numero}</strong>?</div>
       <div class="alert alert-warning" style="margin-top:4px">⚠️ Se borra el registro por completo (incluido su registro de combustible, si corresponde) y se recalcula el stock. Esta acción no se puede deshacer y queda en auditoría.</div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-danger" onclick="eliminarMovimiento('${numero}')">Eliminar definitivamente</button>`,
      'md');
  },50);
}
async function eliminarMovimiento(numero){
  showLoading('Eliminando movimiento y recalculando stock...');
  try{
    const m=await dbGet('movements',numero);
    if(!m){hideLoading();closeModal();toast('Error','Movimiento no encontrado','error');return}
    // Lápida ANTES de borrar: movements y combustible son stores acumulativos;
    // sin la lápida, el merge con Firebase los vuelve a agregar (reaparecían en
    // el informe de combustible tras eliminarlos).
    await sciMarcarEliminado('movements', numero);
    await dbDel('movements',numero);
    // Borrar registros de combustible vinculados (por N° de movimiento) para
    // que no queden huérfanos en el informe de rendimiento.
    let cbDel=0;
    const cbs=(STATE.cache.combustible||[]).filter(r=>r.movNumero===numero);
    for(const r of cbs){ await sciMarcarEliminado('combustible', r.id); await dbDel('combustible', r.id); cbDel++; }
    await reloadCache();
    await _ejecutarRecalculoStock();
    // Subida INMEDIATA para que el listener remoto no restaure lo eliminado.
    try{ if(typeof sciFbPush==='function') sciFbPush(true); }catch(e){}
    await audit('movimiento.eliminar',`Eliminación definitiva${cbDel?(' · '+cbDel+' reg. combustible'):''}`,numero);
    hideLoading();closeModal();
    toast('Movimiento eliminado',`${numero} · Stock recalculado`);
    if(STATE.page==='movimientos')renderMovimientosTable();else navigate(STATE.page);
  }catch(e){hideLoading();toast('Error',e.message,'error');console.error(e)}
}
try{ window.confirmEliminar=confirmEliminar; window.eliminarMovimiento=eliminarMovimiento; }catch(e){}

/* ═══════════════ MOVIMIENTO FORM (ENTRADA / SALIDA) ═══════════════ */
let movDraft={lineas:[],tipo:'ENT',editId:null};

/* ═══════════════ SALIDAS: selector normal vs combustible ═══════════════ */
/* Semilla histórica: se usa solo la primera vez para poblar el catálogo de
   equipos (config → store `equipos`) si aún no existe ninguno. */
const CB_EQUIPOS_SEED=['TRACTOR 1','TRACTOR 2','CAMIONETA ADM.','TORRE CONTROL HELADA 1','TORRE CONTROL HELADA 2','MAQ. AUXILIARES'];
/* Nombre canónico de equipo/torre: MAYÚSCULAS, sin espacios dobles (v144).
   El normalizador global de mayúsculas hizo que convivieran "Torre Control
   Helada 1" y "TORRE CONTROL HELADA 1", y los informes las separaban. */
function normEquipo(n){ return String(n==null?'':n).replace(/\s+/g,' ').trim().toUpperCase(); }
try{ window.normEquipo=normEquipo; }catch(e){}
const EQUIPO_OTRO='Otro (especificar)';
/* Catálogo de tipos y medidores para el alta de equipos. */
const EQUIPO_TIPOS=['Tractor','Camioneta','Camión','Torre de helada','Generador','Motobomba','Maquinaria','Otro'];
const EQUIPO_MEDIDORES=[['km','Kilómetros (odómetro)'],['horometro','Horómetro (horas)'],['ninguno','Sin medidor']];

/* Lista de equipos desde config.equipos (o semilla la primera vez, en memoria). */
function getEquipos(){
  try{
    const cfg=(STATE.cache.config||{}).equipos;
    if(cfg && Array.isArray(cfg.lista)) return cfg.lista.slice();
  }catch(e){}
  // Sin catálogo aún: devolver la semilla como equipos activos de tipo genérico.
  return CB_EQUIPOS_SEED.map(n=>({id:'seed-'+n,nombre:n,tipo:'',medidor:/torre/i.test(n)?'horometro':'km',estado:'activo'}));
}
function getEquiposActivos(){
  return getEquipos().filter(e=>e.estado!=='inactivo')
    .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||'')));
}
function getEquipoByNombre(nom){
  const k=normEquipo(nom);
  return getEquipos().find(e=>normEquipo(e.nombre)===k)||null;
}

/* Migración idempotente (v144): lleva a nombre canónico los equipos y torres
   en catálogos (config.equipos, helTorres, cbEquiposHora), registros de
   combustible, registros de helada y movimientos de consumo de combustible.
   Solo escribe lo que cambia; se ejecuta en cada arranque tras la sync. Sella
   _mod para que la fusión con la nube prefiera la versión normalizada. */
async function sciNormalizarNombresEquipos(){
  let cambios=0; const ahora=Date.now();
  const dedup=(arr)=>{ const vistos={}, out=[]; (arr||[]).forEach(n=>{ const k=normEquipo(n); if(k && !vistos[k]){ vistos[k]=1; out.push(k); } }); return out; };
  const cfg=STATE.cache.config||{};
  try{
    const eq=cfg.equipos;
    if(eq && Array.isArray(eq.lista)){
      const mapa={}, orden=[];
      eq.lista.forEach(e=>{
        const k=normEquipo(e.nombre); if(!k) return;
        if(!mapa[k]){ mapa[k]=Object.assign({},e,{nombre:k}); orden.push(k); }
        else{
          const t=mapa[k];
          if(e.estado!=='inactivo') t.estado=e.estado||'activo';
          if(!t.tipo && e.tipo) t.tipo=e.tipo;
          if(!t.medidor && e.medidor) t.medidor=e.medidor;
        }
      });
      const nueva=orden.map(k=>mapa[k]);
      if(JSON.stringify(nueva)!==JSON.stringify(eq.lista)){ await saveEquiposLista(nueva); cambios++; }
    }
  }catch(e){ console.error('[normEquipo] catálogo equipos:',e); }
  for(const key of ['helTorres','cbEquiposHora']){
    try{
      const o=cfg[key];
      if(o && Array.isArray(o.lista)){
        const nueva=dedup(o.lista);
        if(JSON.stringify(nueva)!==JSON.stringify(o.lista)){
          const obj=Object.assign({},o,{key:key,lista:nueva});
          await dbPut('config',obj); STATE.cache.config[key]=obj; cambios++;
        }
      }
    }catch(e){ console.error('[normEquipo] '+key+':',e); }
  }
  for(const r of (await dbAll('combustible'))){
    const k=normEquipo(r.equipo);
    if(r.equipo && r.equipo!==k){ r.equipo=k; r._mod=ahora; await dbPut('combustible',r); cambios++; }
  }
  for(const r of (await dbAll('heladas'))){
    const k=normEquipo(r.torre);
    if(r.torre && r.torre!==k){ r.torre=k; r.updatedAt=new Date().toISOString(); await dbPut('heladas',r); cambios++; }
  }
  for(const m of (await dbAll('movements'))){
    if(m.tipoMovimiento!=='CONSUMO COMBUSTIBLE') continue;
    let mod=false;
    const k=normEquipo(m.destino);
    if(m.destino && m.destino!==k){ m.destino=k; mod=true; }
    if(m.observaciones){
      const obs=m.observaciones.replace(/^Equipo: ([^·]+?)( ·|$)/,(x,n,t)=>'Equipo: '+normEquipo(n)+t);
      if(obs!==m.observaciones){ m.observaciones=obs; mod=true; }
    }
    if(mod){ await dbPut('movements',m); cambios++; }
  }
  if(cambios){
    await reloadCache();
    console.log('[normEquipo] '+cambios+' registro(s) normalizados');
  }
  return cambios;
}
try{ window.sciNormalizarNombresEquipos=sciNormalizarNombresEquipos; }catch(e){}
/* Persiste el catálogo completo de equipos en config (se sincroniza). */
async function saveEquiposLista(lista){
  const obj={key:'equipos',lista:lista};
  await dbPut('config',obj);
  STATE.cache.config=STATE.cache.config||{};
  STATE.cache.config.equipos=obj;
}

/* Registros de combustible reconciliados contra sus movimientos.
   El store `combustible` guarda una COPIA de cantidad y fecha; el movimiento es
   la fuente de verdad. Desde v117 la edición sincroniza ambos, pero los
   registros editados ANTES de esa versión siguen con la copia antigua, así que
   aquí se prefiere siempre el dato del movimiento. Además descarta los
   movimientos anulados, que antes seguían sumando en los informes. */
function getCombustibleReal(){
  const movs=STATE.cache.movements||[];
  return (STATE.cache.combustible||[]).map(r=>{
    const mov=movs.find(m=>m.numero===r.movNumero);
    // Huérfano: el registro apuntaba a un movimiento que ya no existe (fue
    // eliminado) → se descarta. Los registros sin movNumero (legado real) se
    // conservan.
    if(!mov) return Object.assign({},r,{_orphan: !!r.movNumero});
    let det=(mov.detalles||[]).find(d=>d.codigoInterno===r.codigoProducto);
    if(!det) det=(mov.detalles||[])[0];
    return Object.assign({},r,{
      cantidad: det?(Number(det.cantidad)||0):(Number(r.cantidad)||0),
      costoUnit: det?(Number(det.costo)||0):0,
      fecha: mov.fecha||r.fecha,
      centroCosto: mov.centroCosto||r.centroCosto,
      bodegaId: mov.bodegaId||r.bodegaId,
      _anulado: !!mov.anulado
    });
  }).filter(r=>!r._anulado && !r._orphan);
}
try{ window.getCombustibleReal=getCombustibleReal; }catch(e){}

/* ═══════════════ REPORTE: rendimiento de combustible (solo admin) ═══════════════ */
/* ¿Este equipo se mide con HORÓMETRO (horas) o con odómetro (km)?
   El campo del formulario es genérico ("Kilometraje / Horómetro"), así que el
   tipo se deduce del equipo. Para una torre, el indicador útil es litros por
   hora de funcionamiento; para un vehículo, kilómetros por litro. Son inversos
   entre sí, y mostrar el de vehículo en una torre daba cifras como "0,02" que
   no significan nada operativamente. */
function _cbUsaHorometro(equipo){
  // 1) Catálogo de equipos: el medidor definido en el alta manda.
  try{
    const eq=getEquipoByNombre(equipo);
    if(eq && eq.medidor){ return eq.medidor==='horometro'; }
  }catch(e){}
  try{
    const cfg=(STATE.cache.config||{}).cbEquiposHora;
    if(cfg && Array.isArray(cfg.lista) && cfg.lista.length) return cfg.lista.indexOf(equipo)>=0;
  }catch(e){}
  // Catálogo compartido con Control de Heladas: sus torres siempre son horómetro
  try{ if(typeof _helTorres==='function' && _helTorres().indexOf(equipo)>=0) return true; }catch(e){}
  return /torre|generador|motobomba|bomba|motor/i.test(equipo||'');
}

/* Iconos SVG por tipo de equipo para el reporte de combustible. */
const _CB_ICONS={
 torre:`<svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-6px"><g stroke="#e6552e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8.5 21h7"/><path d="M10 21 11.3 9M14 21 12.7 9"/></g><g stroke="#e6552e" stroke-width="2" stroke-linecap="round"><path d="M12 7.5V4.3"/><path d="M12 7.5 8.8 9.4"/><path d="M12 7.5 15.2 9.4"/></g><circle cx="12" cy="7.5" r="1.9" fill="#e6552e"/></svg>`,
 camioneta:`<svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-6px"><path d="M2 14.5h8.5V9h4l3 3.2H21a1 1 0 0 1 1 1v2.3h-2.1a2.5 2.5 0 0 0-4.9 0h-5a2.5 2.5 0 0 0-4.9 0H2z" fill="#3f7d57"/><g fill="#1e293b"><circle cx="7.4" cy="17.3" r="2"/><circle cx="17.6" cy="17.3" r="2"/></g><g fill="#cde7d8"><circle cx="7.4" cy="17.3" r="0.8"/><circle cx="17.6" cy="17.3" r="0.8"/></g></svg>`,
 tractor:`<svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-6px"><path d="M4 7.5h5.5l1.6 4.2H15V7.5h3.5v6.2h-2a3.6 3.6 0 0 0-6.8.6A3 3 0 0 0 4.8 13V7.5z" fill="#2563eb"/><g fill="#1e293b"><circle cx="8" cy="16.3" r="3.6"/><circle cx="18" cy="16.6" r="2.5"/></g><g fill="#93c5fd"><circle cx="8" cy="16.3" r="1.5"/><circle cx="18" cy="16.6" r="1"/></g></svg>`,
 generador:`<svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-6px"><rect x="2.5" y="7" width="19" height="11" rx="2" fill="#475569"/><rect x="2.5" y="7" width="19" height="3.4" rx="2" fill="#64748b"/><path d="M13.2 9l-3.2 4.3h2.4l-.9 3.1 3.2-4.3h-2.4z" fill="#facc15"/><circle cx="6" cy="15.3" r="1.1" fill="#cbd5e1"/><path d="M17 14.5h2.5" stroke="#cbd5e1" stroke-width="1.4" stroke-linecap="round"/></svg>`
};
function _cbIconoEquipo(eq){
  var tipo='';
  try{ if(typeof getEquipoByNombre==='function'){ var e=getEquipoByNombre(eq); if(e&&e.tipo) tipo=String(e.tipo); } }catch(_){}
  var s=(tipo+' '+(eq||'')).toLowerCase();
  var key = /torre|helad/.test(s) ? 'torre'
          : /tractor/.test(s) ? 'tractor'
          : /camioneta|cami[oó]n|pick|veh[ií]culo/.test(s) ? 'camioneta'
          : /generad|motobomba|bomba|auxiliar|maquin|motor/.test(s) ? 'generador'
          : (typeof _cbUsaHorometro==='function' && _cbUsaHorometro(eq) ? 'torre' : 'camioneta');
  return _CB_ICONS[key]||_CB_ICONS.camioneta;
}
function renderReporteCombustible(c){
  if(STATE.user.role!=='admin'){ c.innerHTML='<div class="empty-state">Solo disponible para administrador.</div>'; return; }
  const regs=getCombustibleReal().sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  // Agrupar por equipo
  const porEquipo={};
  regs.forEach(r=>{ const k=normEquipo(r.equipo); (porEquipo[k]=porEquipo[k]||[]).push(r); });

  let bloques='';
  Object.keys(porEquipo).sort().forEach((eq,_eqIdx)=>{
    const _id='cbEq'+_eqIdx;
    const lista=porEquipo[eq];
    const porHora=_cbUsaHorometro(eq);
    let filas=''; let totalLitros=0, totalRecorrido=0, litrosEnTramos=0;
    for(let i=0;i<lista.length;i++){
      const r=lista[i];
      totalLitros+=(r.cantidad||0);
      let rend='—', recorrido='—';
      // Indicador entre esta carga y la anterior: los litros de la carga
      // ANTERIOR son los que se gastaron para recorrer/funcionar este tramo.
      if(i>0){
        const prev=lista[i-1];
        const dif=(r.km||0)-(prev.km||0);
        if(dif>0 && (prev.cantidad||0)>0){
          recorrido=fmtNum(dif,1);
          rend = porHora
            ? fmtNum((prev.cantidad||0)/dif, 2)   // litros por hora
            : fmtNum(dif/(prev.cantidad||1), 2);  // km por litro
          totalRecorrido+=dif;
          litrosEnTramos+=(prev.cantidad||0);
        }
      }
      filas+=`<tr>
        <td>${new Date(r.fecha).toLocaleDateString('es-CL')}</td>
        <td class="num">${fmtNum(r.km||0,1)}</td>
        <td class="num">${recorrido}</td>
        <td class="num">${fmtNum(r.cantidad||0,2)}</td>
        <td class="num"><strong>${rend}</strong></td>
        <td>${escapeHtml(r.usuario||'')}</td>
        <td>${escapeHtml(r.centroCosto||'')}</td>
      </tr>`;
    }
    // Promedio del bloque.
    // Horómetro (v148): suma de cargas ÷ (horómetro final − inicial). Cada
    // salida es una carga a la torre y todo lo cargado se quema; el saldo de
    // estanque solo se muestra como validador.
    // Odómetro: km de los tramos / litros de la carga anterior.
    let horasTot=0, detProm='', detVal='';
    if(porHora){
      const fL=r=>(typeof _helFechaLocal==='function')?_helFechaLocal(r.fecha):String(r.fecha||'').slice(0,10);
      const cargas=lista.map(r=>({fecha:fL(r), litros:Number(r.cantidad)||0, horom:Number(r.km)||0}));
      let res=null;
      try{ if(typeof helConsumoHoraTorre==='function') res=helConsumoHoraTorre(eq, cargas, null); }catch(e){ console.warn('[Rendimiento]',e); }
      if(!res){
        const lect=cargas.map(c=>c.horom).filter(v=>v>0);
        const hi=lect.length?Math.min(...lect):0, hf=lect.length?Math.max(...lect):0;
        res={horas:hf-hi,hIni:hi,hFin:hf,validador:null};
      }
      horasTot=res.horas;
      if(horasTot>0) detProm=`${fmtNum(totalLitros,1)} L cargados ÷ ${fmtNum(horasTot,1)} h (horómetro ${fmtNum(res.hIni,1)} → ${fmtNum(res.hFin,1)})`;
      if(res.validador){
        const v=res.validador;
        detVal=`Validador: saldo declarado ${fmtNum(v.saldo,1)} L al ${new Date(v.fecha+'T12:00:00').toLocaleDateString('es-CL')}`+
               (v.cargasPost>0?` · cargas posteriores ${fmtNum(v.cargasPost,1)} L`:'');
      }
    }
    const rendProm = porHora
      ? (horasTot>0 ? totalLitros/horasTot : 0)
      : (litrosEnTramos>0 ? totalRecorrido/litrosEnTramos : 0);
    const hayProm = porHora ? horasTot>0 : totalRecorrido>0;
    const unidadProm = porHora ? 'L por hora' : 'km por litro';
    const colRend    = porHora ? 'L/Hora' : 'Rend/L';
    const colRec     = porHora ? 'Horas'  : 'Recorrido';
    const colMedida  = porHora ? 'Horómetro' : 'Km';
    const icono      = _cbIconoEquipo(eq);
    const promBadge = hayProm
      ? `<span style="font-size:15px;font-weight:800;color:var(--gd)">${fmtNum(rendProm,2)}</span> <span style="font-size:11px;color:var(--mu)">${unidadProm}</span>`
      : `<span style="font-size:12px;color:var(--mu)">sin promedio</span>`;
    // Sparkline de evolución semanal (línea gruesa, sin ejes ni leyenda).
    const _spark = _cbSparkline(_cbSerieSemanal(lista, porHora).vals);
    bloques+=`<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">
      <div onclick="cbToggleEquipo('${_id}')" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 16px;cursor:pointer;user-select:none">
        <div style="display:flex;align-items:center;gap:10px">
          <span id="${_id}-chev" style="font-size:12px;color:var(--mu);transition:transform .15s">▸</span>
          <span style="font-weight:800;font-size:16px">${icono} ${escapeHtml(eq)}</span>
        </div>
        <div style="flex:1 1 110px;min-width:70px;display:flex;justify-content:center;align-items:center">${_spark||''}</div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--mu)">${lista.length} carga(s) · ${fmtNum(totalLitros,1)} L</span>
          <span style="text-align:right">${promBadge}</span>
        </div>
      </div>
      <div id="${_id}-det" style="display:none;padding:0 16px 16px">
        ${porHora&&hayProm&&detProm?`<div style="font-size:11px;margin-bottom:4px;color:var(--mu)">${detProm}</div>`:''}
        ${porHora&&detVal?`<div style="font-size:11px;margin-bottom:6px;color:#92600a">${detVal}</div>`:''}
        <div class="table-wrap"><table class="data" style="width:100%">
          <thead><tr><th>Fecha</th><th class="num">${colMedida}</th><th class="num">${colRec}</th><th class="num">Litros</th><th class="num">${colRend}</th><th>Operador</th><th>C.Costo</th></tr></thead>
          <tbody>${filas}</tbody>
        </table></div>
      </div>
    </div>`;
  });
  if(!bloques) bloques='<div class="empty-state">Aún no hay registros de combustible.</div>';

  c.innerHTML=`
    <div class="page-header"><div><div class="page-title">⛽ Rendimiento de combustible</div>
      <div class="page-subtitle">Consumo y rendimiento por equipo · haz clic en un equipo para ver el detalle</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" onclick="exportarReporteCombustible()">📥 Exportar Excel</button>
      <button class="btn btn-primary" onclick="cbReporteGerencial()">📄 Reporte gerencial</button></div></div>
    <div class="hint" style="margin-bottom:14px">Los equipos con <strong>horómetro</strong> (🗼 torres, generadores) se miden en <strong>litros por hora</strong> de funcionamiento; los que llevan <strong>odómetro</strong> (🚜 tractores, vehículos) en <strong>km por litro</strong>. En cada fila se usan los litros de la carga anterior, que son los que alimentaron ese tramo. El <strong>consumo promedio por hora</strong> de las torres es la suma de todas las cargas dividida por las horas entre el horómetro inicial y el final. El saldo declarado en el último registro de helada se muestra solo como validador.</div>
    ${bloques}`;
}
/* Expande/colapsa el detalle de un equipo en el reporte de combustible. */
function cbToggleEquipo(id){
  var det=document.getElementById(id+'-det'); if(!det) return;
  var chev=document.getElementById(id+'-chev');
  var abierto=det.style.display!=='none';
  det.style.display=abierto?'none':'block';
  if(chev) chev.textContent=abierto?'▸':'▾';
}
try{ window.cbToggleEquipo=cbToggleEquipo; }catch(e){}
/* ═══════════ REPORTE GERENCIAL (carta, 1 página, gráfico semanal x vehículo) ═══════════ */
/* Fecha local (AAAA-MM-DD) del registro, con el mismo criterio que la app. */
function _cbLocalYMD(r){
  try{ if(typeof _helFechaLocal==='function') return _helFechaLocal(r.fecha); }catch(e){}
  return String(r.fecha||'').slice(0,10);
}
/* Lunes de la semana a partir de una fecha AAAA-MM-DD, construida en hora LOCAL
   (sin reparsear como UTC, que corría las fechas un día y partía mal las semanas). */
function _cbWeekStart(ymd){
  var m=String(ymd||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(!m) return null;
  var x=new Date(+m[1], +m[2]-1, +m[3]);
  var day=(x.getDay()+6)%7;            // 0 = lunes
  x.setDate(x.getDate()-day);
  return x;
}
/* Rendimiento por semana, con el MISMO criterio del resumen de la app:
   - Odómetro (km/L): km de los tramos ÷ litros de la carga anterior.
   - Horómetro (L/h): litros cargados en la semana ÷ horas de la semana
     (incremento del horómetro), de modo que el agregado coincide con el
     promedio del resumen (total litros ÷ horas totales). */
function _cbSerieSemanal(lista, porHora){
  var wk={}, order=[];
  function bucket(r){ var ws=_cbWeekStart(_cbLocalYMD(r)); if(!ws) return null; var k=ws.getTime(); if(!wk[k]){ wk[k]={rec:0,lit:0,date:ws}; order.push(k); } return wk[k]; }
  // Cada TRAMO entre dos cargas consecutivas se atribuye completo (sus horas o
  // km Y los litros que lo alimentaron) a la semana de la carga final. Así el
  // ratio de cada semana usa el MISMO método que el promedio global
  // (litros ÷ horas, o km ÷ litros), y los puntos quedan en la misma escala
  // que el promedio del encabezado. Antes, para horómetro, las horas se
  // atribuían al tramo y los litros a la semana de cada carga, lo que
  // desalineaba numerador y denominador y sacaba los puntos de escala.
  for(var i=1;i<lista.length;i++){
    var dif=(lista[i].km||0)-(lista[i-1].km||0);
    var litrosPrev=lista[i-1].cantidad||0;
    if(dif>0 && litrosPrev>0){
      var b=bucket(lista[i]); if(!b) continue;
      b.rec+=dif;
      b.lit+=litrosPrev;
    }
  }
  order.sort(function(a,b){return a-b;});
  var labels=[], vals=[];
  order.forEach(function(k){
    var b=wk[k];
    // porHora: litros ÷ horas (L/h).  odómetro: km ÷ litros (km/L).
    var r = porHora ? (b.rec>0? b.lit/b.rec : null) : (b.lit>0? b.rec/b.lit : null);
    var dd=('0'+b.date.getDate()).slice(-2), mm=('0'+(b.date.getMonth()+1)).slice(-2);
    labels.push(dd+'/'+mm);
    vals.push(r!=null? Math.round(r*100)/100 : null);
  });
  return {labels:labels, vals:vals};
}
/* Sparkline SVG (línea gruesa, sin ejes ni leyenda) de la evolución semanal. */
function _cbSparkline(vals){
  var pts=[]; (vals||[]).forEach(function(v,i){ if(v!=null && !isNaN(v)) pts.push({i:i,v:v}); });
  if(pts.length<2) return '';
  var w=130,h=30,pad=3, n=vals.length;
  var xs=(n>1)?(w-2*pad)/(n-1):0;
  var vs=pts.map(function(p){return p.v;});
  var min=Math.min.apply(null,vs), max=Math.max.apply(null,vs), rng=(max-min)||1;
  function X(i){return pad+i*xs;}
  function Y(v){return pad+(h-2*pad)*(1-(v-min)/rng);}
  var d=pts.map(function(p,k){return (k?'L':'M')+X(p.i).toFixed(1)+' '+Y(p.v).toFixed(1);}).join(' ');
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" style="display:block">'+
    '<path d="'+d+'" fill="none" stroke="#0a6ed1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
try{ window._cbSparkline=_cbSparkline; }catch(e){}

/* Renderiza un mini-gráfico de líneas en un canvas fuera de pantalla y devuelve PNG. */
function _cbChartToImg(labels, vals){
  var cv=document.createElement('canvas'); cv.width=560; cv.height=230;
  var tmp=document.createElement('div'); tmp.style.cssText='position:fixed;left:-99999px;top:0';
  document.body.appendChild(tmp); tmp.appendChild(cv);
  var url='';
  try{
    var ch=new Chart(cv.getContext('2d'),{
      type:'line',
      data:{labels:labels,datasets:[{data:vals,borderColor:'#0a6ed1',backgroundColor:'rgba(10,110,209,.12)',fill:true,tension:.25,pointRadius:3,borderWidth:2,spanGaps:true}]},
      options:{responsive:false,animation:false,
        plugins:{legend:{display:false},title:{display:false}},
        scales:{x:{ticks:{font:{size:11},maxRotation:0,autoSkip:true}},y:{beginAtZero:true,ticks:{font:{size:11}}}}}
    });
    url=cv.toDataURL('image/png');
    try{ ch.destroy(); }catch(e){}
  }catch(e){ console.error('[cbChartToImg]',e); }
  tmp.remove();
  return url;
}
function cbReporteGerencial(){
  if(STATE.user.role!=='admin'){ toast('Solo administrador','Este reporte es solo para administradores','error'); return; }
  if(typeof Chart==='undefined'){ toast('Sin librería','La librería de gráficos no está disponible','error'); return; }
  var regs=getCombustibleReal().sort(function(a,b){return new Date(a.fecha)-new Date(b.fecha);});
  if(!regs.length){ toast('Sin datos','No hay registros de combustible','error'); return; }
  var porEquipo={};
  regs.forEach(function(r){ var k=normEquipo(r.equipo); (porEquipo[k]=porEquipo[k]||[]).push(r); });
  var equipos=Object.keys(porEquipo).sort();
  var bloques=[];
  equipos.forEach(function(eq){
    var lista=porEquipo[eq];
    var porHora=(typeof _cbUsaHorometro==='function') ? _cbUsaHorometro(eq) : false;
    var serie=_cbSerieSemanal(lista, porHora);
    var totalLitros=lista.reduce(function(s,r){return s+(r.cantidad||0);},0);
    // Promedio IDÉNTICO al resumen de la app:
    //  · Horómetro: total litros ÷ horas (helConsumoHoraTorre, o hFin−hIni).
    //  · Odómetro: km de tramos ÷ litros de la carga anterior.
    var prom=null;
    if(porHora){
      var fL=function(r){ return (typeof _helFechaLocal==='function')?_helFechaLocal(r.fecha):String(r.fecha||'').slice(0,10); };
      var cargas=lista.map(function(r){ return {fecha:fL(r),litros:Number(r.cantidad)||0,horom:Number(r.km)||0}; });
      var res=null;
      try{ if(typeof helConsumoHoraTorre==='function') res=helConsumoHoraTorre(eq,cargas,null); }catch(e){}
      if(!res){ var lect=cargas.map(function(c){return c.horom;}).filter(function(v){return v>0;}); var hi=lect.length?Math.min.apply(null,lect):0, hf=lect.length?Math.max.apply(null,lect):0; res={horas:hf-hi}; }
      prom = (res && res.horas>0) ? totalLitros/res.horas : null;
    } else {
      var sumRec=0,sumLit=0;
      for(var i=1;i<lista.length;i++){ var dif=(lista[i].km||0)-(lista[i-1].km||0); var lp=lista[i-1].cantidad||0; if(dif>0&&lp>0){ sumRec+=dif; sumLit+=lp; } }
      prom = (sumLit>0) ? sumRec/sumLit : null;
    }
    var hasData = serie.vals.some(function(v){return v!=null;});
    bloques.push({ eq:eq, porHora:porHora, nCargas:lista.length, totalLitros:totalLitros, prom:prom,
                   img: hasData ? _cbChartToImg(serie.labels, serie.vals) : '' });
  });
  var n=bloques.length;
  var cols = n<=2 ? 1 : (n<=8 ? 2 : 3);
  var emp=(STATE.cache.config && STATE.cache.config.empresa) || {};
  var fecha=new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  var unidad=function(pH){ return pH?'L/hora':'km/L'; };
  var logoHtml = emp.logo ? '<img src="'+emp.logo+'" style="height:44px;margin-right:12px">' : '';
  var blkHtml = bloques.map(function(b){
    return '<div class="blk">'+
      '<h3>'+escapeHtml(b.eq)+' <span style="font-weight:400;color:#64748b;font-size:10px">('+(b.porHora?'horómetro · L/h':'odómetro · km/L')+')</span></h3>'+
      '<div class="st">'+b.nCargas+' carga(s) · '+fmtNum(b.totalLitros,1)+' L · Prom: <b>'+(b.prom!=null?fmtNum(b.prom,2):'—')+'</b> '+unidad(b.porHora)+'</div>'+
      (b.img ? '<img src="'+b.img+'">' : '<div style="font-size:10px;color:#94a3b8;padding:16px 0;text-align:center">Sin tramos suficientes para calcular rendimiento.</div>')+
    '</div>';
  }).join('');
  var html='<!doctype html><html><head><meta charset="utf-8"><title>Rendimiento de Combustible</title><style>'+
    '@page{size:letter;margin:12mm}*{box-sizing:border-box}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:0;font-size:11px}'+
    '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #354a5f;padding-bottom:7px;margin-bottom:8px}'+
    '.emp{display:flex;align-items:center}'+
    '.emp .nm{font-size:15px;font-weight:800;color:#23303d;line-height:1.15}'+
    '.emp .sb{font-size:10px;color:#64748b;margin-top:2px}'+
    '.right{font-size:10px;color:#64748b;text-align:right}'+
    '.ttl{font-size:15px;font-weight:800;text-align:center;margin:4px 0 1px;color:#23303d}'+
    '.per{font-size:11px;text-align:center;color:#64748b;margin-bottom:9px}'+
    '.grid{display:grid;grid-template-columns:repeat('+cols+',1fr);gap:7px}'+
    '.blk{border:1px solid #cbd5e1;border-radius:6px;padding:5px 7px;break-inside:avoid;page-break-inside:avoid}'+
    '.blk h3{margin:0 0 1px;font-size:12px;color:#23303d}'+
    '.blk .st{font-size:10px;color:#475569;margin-bottom:3px}'+
    '.blk img{width:100%;height:auto;display:block}'+
    '.ft{margin-top:9px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:5px}'+
    '@media print{.noprint{display:none}}'+
    '.noprint{position:fixed;top:8px;right:8px}'+
    '.noprint button{padding:8px 14px;border:none;border-radius:7px;background:#1565c0;color:#fff;font-weight:700;cursor:pointer}'+
    '</style></head><body>'+
    '<div class="noprint"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>'+
    '<div class="hdr"><div class="emp">'+logoHtml+'<div><div class="nm">'+escapeHtml(emp.nombre||'Empresa')+'</div>'+
      '<div class="sb">'+[emp.rut?('RUT '+emp.rut):'', emp.direccion||''].filter(Boolean).map(escapeHtml).join(' · ')+'</div></div></div>'+
      '<div class="right">Fecha de emisión<br><b>'+fecha+'</b></div></div>'+
    '<div class="ttl">Reporte de Rendimiento de Combustible por Vehículo</div>'+
    '<div class="per">Evolución semanal del rendimiento · '+bloques.length+' vehículo(s)</div>'+
    '<div class="grid">'+blkHtml+'</div>'+
    '<div class="ft">Equipos con horómetro: litros por hora de funcionamiento. Equipos con odómetro: kilómetros por litro. Cada punto es el rendimiento ponderado de la semana. · Generado por SCI</div>'+
    '</body></html>';
  var w=window.open('','_blank');
  if(!w){ toast('Ventana bloqueada','Permita ventanas emergentes para generar el reporte','error'); return; }
  w.document.open(); w.document.write(html); w.document.close(); w.focus();
  setTimeout(function(){ try{ w.print(); }catch(e){} }, 500);
}
try{ window.cbReporteGerencial=cbReporteGerencial; }catch(e){}

function exportarReporteCombustible(){
  const regs=getCombustibleReal().sort((a,b)=>a.equipo.localeCompare(b.equipo)||new Date(a.fecha)-new Date(b.fecha));
  const rows=[['Equipo','Medicion','Fecha','Km/Horometro','Recorrido u horas','Litros','Km por litro','Litros por hora','Operador','Producto','Centro Costo','N Movimiento']];
  const porEquipo={};
  regs.forEach(r=>{ const k=normEquipo(r.equipo); (porEquipo[k]=porEquipo[k]||[]).push(r); });
  Object.keys(porEquipo).forEach(eq=>{
    const lista=porEquipo[eq];
    const porHora=_cbUsaHorometro(eq);
    lista.forEach((r,i)=>{
      // Dos columnas separadas en vez de una ambigua: cada equipo llena la suya
      let recorrido='', kmL='', lH='';
      if(i>0){
        const dif=(r.km||0)-(lista[i-1].km||0);
        const litrosPrev=lista[i-1].cantidad||0;
        if(dif>0 && litrosPrev>0){
          recorrido=dif;
          if(porHora) lH=(litrosPrev/dif).toFixed(2);
          else        kmL=(dif/litrosPrev).toFixed(2);
        }
      }
      rows.push([eq,porHora?'Horometro':'Odometro',new Date(r.fecha).toLocaleDateString('es-CL'),
                 r.km||0,recorrido,r.cantidad||0,kmL,lH,
                 r.usuario||'',r.producto||'',r.centroCosto||'',r.movNumero||'']);
    });
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Combustible');
  XLSX.writeFile(wb,`Rendimiento_Combustible_${new Date().toISOString().slice(0,10)}.xlsx`);
}
try{ window.renderReporteCombustible=renderReporteCombustible; window.exportarReporteCombustible=exportarReporteCombustible; }catch(e){}

function renderSelectorSalida(c){
  // Si el usuario solo puede registrar combustible (no salidas normales), ir directo.
  if(!can('movimientos.crear') && can('combustible.registrar')){
    renderCombustibleForm(c); return;
  }
  c.innerHTML=`
    <div class="page-header"><div><div class="page-title">Nueva Salida</div>
      <div class="page-subtitle">Elija el tipo de salida</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;max-width:960px">
      <button class="card" onclick="renderMovimientoForm(document.getElementById('mainContent'),'SAL')"
        style="cursor:pointer;text-align:left;padding:22px;border:2px solid var(--bo);border-radius:12px">
        <div style="font-size:30px;margin-bottom:8px">📦</div>
        <div style="font-weight:800;font-size:16px">Salida normal</div>
        <div class="stat-sub">Productos de inventario general</div>
      </button>
      <button class="card" onclick="renderCombustibleForm(document.getElementById('mainContent'))"
        style="cursor:pointer;text-align:left;padding:22px;border:2px solid #e9730c;border-radius:12px;background:#fff7ef">
        <div style="font-size:30px;margin-bottom:8px">⛽</div>
        <div style="font-weight:800;font-size:16px">Salida de combustible</div>
        <div class="stat-sub">Gasolina / Diesel con equipo y horómetro</div>
      </button>
      <button class="card" onclick="renderCargaMasivaConsumos(document.getElementById('mainContent'))"
        style="cursor:pointer;text-align:left;padding:22px;border:2px solid #1565c0;border-radius:12px;background:#f1f6fc">
        <div style="font-size:30px;margin-bottom:8px">📥</div>
        <div style="font-weight:800;font-size:16px">Carga masiva (Excel)</div>
        <div class="stat-sub">Consumos y combustible desde una plantilla</div>
      </button>
    </div>`;
}
try{ window.renderSelectorSalida=renderSelectorSalida; }catch(e){}

/* ═══════════════ CARGA MASIVA DE SALIDAS (Excel) ═══════════════ */
/* Dos hojas: "Consumos" (salida CONSUMO CC) y "Combustible" (salida con
   equipo/horómetro). La foliación reutiliza nextCounter() — el MISMO
   correlativo que el flujo manual — por lo que nunca se repiten folios.
   Identificación por código: producto (codigoInterno), bodega (id),
   centro de costo (código). */
const CM_HEAD_CONS=['Fecha','CodigoProducto','Cantidad','BodegaId','CentroCosto','Observaciones'];
const CM_HEAD_COMB=['Fecha','CodigoProducto','Cantidad','BodegaId','CentroCosto','Equipo','KmHorometro','Operador','Observaciones'];

function renderCargaMasivaConsumos(c){
  if(!can('movimientos.crear') && !can('combustible.registrar')){
    c.innerHTML='<div class="empty-state"><div class="empty-state-icon">🔒</div><div class="empty-state-title">Sin permiso</div><div class="empty-state-text">No tiene permiso para registrar salidas.</div></div>';
    return;
  }
  c.innerHTML=`
    <div class="page-header"><div><div class="page-title">📥 Carga masiva de salidas</div>
      <div class="page-subtitle">Consumos y combustible desde una plantilla Excel</div></div>
      <button class="btn btn-secondary" onclick="navigate('salidas')">← Volver</button></div>
    <div style="max-width:720px">
      <div class="alert" style="background:#f1f6fc;border:1px solid #d6e4f5;border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px;line-height:1.6;color:#334155">
        <strong>Cómo funciona</strong><br>
        1. Descargue la plantilla y complete la hoja <strong>Consumos</strong> y/o <strong>Combustible</strong>.<br>
        2. Use los <strong>códigos</strong> de las hojas "Listas" (producto, bodega, centro de costo).<br>
        3. Vuelva aquí e importe el archivo: verá una <strong>vista previa</strong> con validaciones antes de confirmar.<br>
        4. Los folios se asignan automáticamente siguiendo el correlativo vigente (CCC para consumos, SAL para combustible). No se repiten registros.
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="downloadPlantillaConsumos()">📥 Descargar plantilla</button>
        <label class="btn btn-primary" style="cursor:pointer"><span>📤 Importar Excel</span><input type="file" accept=".xlsx,.xls" style="display:none" onchange="if(this.files[0]){previewImportConsumos(this.files[0]);this.value=''}"></label>
      </div>
    </div>`;
}
try{ window.renderCargaMasivaConsumos=renderCargaMasivaConsumos; }catch(e){}

function downloadPlantillaConsumos(){
  const ahora=new Date().toLocaleDateString('es-CL');
  const hoy=new Date().toISOString().slice(0,10);
  const prods=(STATE.cache.products||[]).filter(p=>p.activo!==false && p.inventariable!==false);
  const combs=prods.filter(p=>{const t=((p.descripcion||'')+' '+(p.grupo||'')+' '+(p.subGrupo||'')).toLowerCase();return /gasolina|diesel|di[eé]sel|petr[oó]leo|bencina/.test(t);});
  const bods=STATE.cache.warehouses||[];
  const ccs=(STATE.cache.costCenters||[]).filter(x=>x.activo!==false);
  const codProd=(prods[0]&&prods[0].codigoInterno)||'P000001';
  const codComb=(combs[0]&&combs[0].codigoInterno)||codProd;
  const codBod=(bods[0]&&bods[0].id)||'BOD1';
  const codCC=(ccs[0]&&ccs[0].codigo)||'CC1';

  // Hoja Consumos (ejemplo)
  const ejCons=[{Fecha:hoy,CodigoProducto:codProd,Cantidad:1,BodegaId:codBod,CentroCosto:codCC,Observaciones:'EJEMPLO — borre esta fila'}];
  const wsC=XLSX.utils.json_to_sheet(ejCons,{header:CM_HEAD_CONS});
  wsC['!cols']=[{wch:12},{wch:16},{wch:10},{wch:14},{wch:14},{wch:36}];
  // Hoja Combustible (ejemplo)
  const ejComb=[{Fecha:hoy,CodigoProducto:codComb,Cantidad:40,BodegaId:codBod,CentroCosto:codCC,Equipo:'TRACTOR 1',KmHorometro:1250,Operador:'JUAN PÉREZ',Observaciones:'EJEMPLO — borre esta fila'}];
  const wsB=XLSX.utils.json_to_sheet(ejComb,{header:CM_HEAD_COMB});
  wsB['!cols']=[{wch:12},{wch:16},{wch:10},{wch:14},{wch:14},{wch:18},{wch:14},{wch:22},{wch:30}];

  // Instrucciones
  const inst=[
    ['SISTEMA DE CONTROL DE INVENTARIO — Carga masiva de salidas'],
    ['Generada: '+ahora],
    [],
    ['INSTRUCCIONES'],
    ['1. Complete la hoja "Consumos" (salidas normales) y/o "Combustible". Cada fila = una salida.'],
    ['2. NO cambie los encabezados (primera fila).'],
    ['3. Borre las filas de ejemplo antes de importar.'],
    ['4. Use los CÓDIGOS de la hoja "Listas" para Producto, Bodega y Centro de costo.'],
    ['5. Fecha en formato AAAA-MM-DD (ej: '+hoy+').'],
    ['6. El folio se asigna automáticamente al importar (no lo escriba). Consumos → CCC, Combustible → SAL.'],
    ['7. Al importar verá una vista previa con errores/avisos antes de confirmar.'],
    [],
    ['HOJA "Consumos" (CONSUMO de centro de costo)'],
    ['Campo','Obligatorio','Descripción'],
    ['Fecha','SÍ','Fecha del consumo (AAAA-MM-DD).'],
    ['CodigoProducto','SÍ','Código interno del producto (ver Listas).'],
    ['Cantidad','SÍ','Número > 0. No puede superar el stock disponible en la bodega.'],
    ['BodegaId','SÍ','Id de la bodega de origen (ver Listas).'],
    ['CentroCosto','SÍ','Código del centro de costo (ver Listas). Debe estar activo.'],
    ['Observaciones','No','Texto libre.'],
    [],
    ['HOJA "Combustible"'],
    ['Campo','Obligatorio','Descripción'],
    ['Fecha','SÍ','Fecha de la carga (AAAA-MM-DD).'],
    ['CodigoProducto','SÍ','Código interno del combustible (ver Listas).'],
    ['Cantidad','SÍ','Litros > 0. No puede superar el stock disponible.'],
    ['BodegaId','SÍ','Id de la bodega de origen.'],
    ['CentroCosto','SÍ','Código del centro de costo activo.'],
    ['Equipo','SÍ','Nombre del equipo/máquina.'],
    ['KmHorometro','No','Km u horómetro. Si se informa, no puede ser menor al último registrado del equipo.'],
    ['Operador','SÍ','Nombre del operador.'],
    ['Observaciones','No','Texto libre.'],
  ];
  const wsI=XLSX.utils.aoa_to_sheet(inst); wsI['!cols']=[{wch:16},{wch:12},{wch:70}];

  // Listas de códigos
  const L=[];
  L.push(['PRODUCTOS (código → descripción)']);
  L.push(['CodigoProducto','Descripción','UM','¿Combustible?']);
  prods.forEach(p=>{const t=((p.descripcion||'')+' '+(p.grupo||'')+' '+(p.subGrupo||'')).toLowerCase();L.push([p.codigoInterno,p.descripcion||'',p.unidadMedida||'',/gasolina|diesel|di[eé]sel|petr[oó]leo|bencina/.test(t)?'SÍ':'']);});
  L.push([]);
  L.push(['BODEGAS (id → nombre)']);
  L.push(['BodegaId','Nombre']);
  bods.forEach(b=>L.push([b.id,b.nombre||'']));
  L.push([]);
  L.push(['CENTROS DE COSTO ACTIVOS (código → descripción)']);
  L.push(['CentroCosto','Descripción','Área']);
  ccs.forEach(x=>L.push([x.codigo,x.descripcion||'',x.area||'']));
  const wsL=XLSX.utils.aoa_to_sheet(L); wsL['!cols']=[{wch:18},{wch:44},{wch:14},{wch:14}];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,wsC,'Consumos');
  XLSX.utils.book_append_sheet(wb,wsB,'Combustible');
  XLSX.utils.book_append_sheet(wb,wsI,'Instrucciones');
  XLSX.utils.book_append_sheet(wb,wsL,'Listas');
  XLSX.writeFile(wb,`Plantilla_Consumos_${hoy}.xlsx`);
  toast('Plantilla descargada','Complete Consumos y/o Combustible y vuelva a importarla');
}
try{ window.downloadPlantillaConsumos=downloadPlantillaConsumos; }catch(e){}

/* Normaliza una fecha de Excel (string AAAA-MM-DD, dd-mm-aaaa o Date) → 'AAAA-MM-DD' o null */
function _cmParseFecha(v){
  if(v==null||v==='') return null;
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  var s=String(v).trim();
  var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if(m) return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  var d=new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}

async function previewImportConsumos(file){
  if(!can('movimientos.crear') && !can('combustible.registrar')){toast('Sin permiso','No puede registrar salidas','error');return;}
  showLoading();
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const shC=wb.SheetNames.find(n=>n.trim().toLowerCase()==='consumos');
    const shB=wb.SheetNames.find(n=>n.trim().toLowerCase()==='combustible');
    const rowsC=shC?XLSX.utils.sheet_to_json(wb.Sheets[shC],{defval:'',raw:false}):[];
    const rowsB=shB?XLSX.utils.sheet_to_json(wb.Sheets[shB],{defval:'',raw:false}):[];
    hideLoading();
    if(rowsC.length===0 && rowsB.length===0){toast('Excel vacío','No hay filas en Consumos ni Combustible','error');return;}
    const v=_validateConsumos(rowsC,rowsB);
    _showConsumosPreview(v,file.name);
  }catch(e){
    hideLoading();
    toast('Error al leer','No se pudo procesar el archivo: '+e.message,'error');
    console.error('previewImportConsumos:',e);
  }
}
try{ window.previewImportConsumos=previewImportConsumos; }catch(e){}

function _validateConsumos(rowsC,rowsB){
  const validas=[], invalidas=[];
  const usado={}; // key prod|bodega → cantidad ya comprometida en este archivo
  const kmMax={}; // equipo → último km visto (historial + archivo)
  // Precargar último km por equipo desde historial
  // Reconciliado: un movimiento anulado no debe seguir fijando el horómetro máximo
  getCombustibleReal().forEach(r=>{ if(r.equipo && (r.km||0)>0){ kmMax[r.equipo]=Math.max(kmMax[r.equipo]||0, r.km||0); } });

  function chkComun(d, isComb){
    const errs=[], warns=[];
    const fecha=_cmParseFecha(d.Fecha);
    if(!fecha) errs.push('Fecha inválida (use AAAA-MM-DD).');
    const cod=String(d.CodigoProducto||'').trim();
    const prod=cod?getProduct(cod):null;
    if(!cod) errs.push('Falta CodigoProducto.');
    else if(!prod) errs.push('Producto '+cod+' no existe.');
    const cant=parseFloat(String(d.Cantidad).replace(',','.'))||0;
    if(cant<=0) errs.push('Cantidad debe ser > 0.');
    const bod=String(d.BodegaId||'').trim();
    const bodObj=bod?getWarehouse(bod):null;
    if(!bod) errs.push('Falta BodegaId.');
    else if(!bodObj) errs.push('Bodega '+bod+' no existe.');
    const ccCod=String(d.CentroCosto||'').trim().toUpperCase();
    const ccObj=ccCod?(STATE.cache.costCenters||[]).find(x=>x.codigo===ccCod):null;
    if(!ccCod) errs.push('Falta CentroCosto.');
    else if(!ccObj) errs.push('Centro de costo '+ccCod+' no existe.');
    else if(ccObj.activo===false) errs.push('Centro de costo '+ccCod+' está inactivo.');
    // permiso por tipo
    if(isComb && !can('combustible.registrar')) errs.push('Sin permiso para registrar combustible.');
    if(!isComb && !can('movimientos.crear')) errs.push('Sin permiso para registrar consumos.');
    // stock acumulado por prod|bodega
    if(prod && bodObj && cant>0){
      const k=cod+'|'+bod;
      const disp=(getStock(cod,bod)?.cantidad)||0;
      const ya=usado[k]||0;
      if(ya+cant>disp) errs.push('Stock insuficiente en '+(bodObj.nombre||bod)+': disponible '+fmtNum(disp,2)+', ya comprometido '+fmtNum(ya,2)+', solicitado '+fmtNum(cant,2)+'.');
      else usado[k]=ya+cant;
    }
    return {errs,warns,fecha,cod,prod,cant,bod,bodObj,ccCod,ccObj};
  }

  rowsC.forEach((d,i)=>{
    if(Object.values(d).every(x=>x===''||x==null)) return;
    const r=chkComun(d,false);
    const data={tipo:'NORMAL',fecha:r.fecha,codigo:r.cod,producto:r.prod,cantidad:r.cant,bodegaId:r.bod,bodega:r.bodObj,centroCosto:r.ccCod,cc:r.ccObj,obs:String(d.Observaciones||'').trim()};
    if(r.errs.length) invalidas.push({hoja:'Consumos',fila:i+2,data,errors:r.errs});
    else validas.push({hoja:'Consumos',fila:i+2,data,warnings:r.warns});
  });
  rowsB.forEach((d,i)=>{
    if(Object.values(d).every(x=>x===''||x==null)) return;
    const r=chkComun(d,true);
    const equipo=String(d.Equipo||'').trim();
    const operador=String(d.Operador||'').trim();
    const km=parseFloat(String(d.KmHorometro).replace(',','.'))||0;
    if(!equipo) r.errs.push('Falta Equipo.');
    if(!operador) r.errs.push('Falta Operador.');
    if(r.prod){const t=((r.prod.descripcion||'')+' '+(r.prod.grupo||'')+' '+(r.prod.subGrupo||'')).toLowerCase(); if(!/gasolina|diesel|di[eé]sel|petr[oó]leo|bencina/.test(t)) r.warns.push('El producto no parece combustible.');}
    if(km>0 && equipo){ if(km<(kmMax[equipo]||0)) r.errs.push('Km/Horómetro ('+km+') menor al último de '+equipo+' ('+kmMax[equipo]+').'); else kmMax[equipo]=km; }
    const data={tipo:'COMBUSTIBLE',fecha:r.fecha,codigo:r.cod,producto:r.prod,cantidad:r.cant,bodegaId:r.bod,bodega:r.bodObj,centroCosto:r.ccCod,cc:r.ccObj,equipo,km,operador,obs:String(d.Observaciones||'').trim()};
    if(r.errs.length) invalidas.push({hoja:'Combustible',fila:i+2,data,errors:r.errs});
    else validas.push({hoja:'Combustible',fila:i+2,data,warnings:r.warns});
  });
  return {total:validas.length+invalidas.length, validas, invalidas};
}

function _showConsumosPreview(v,fileName){
  const okCount=v.validas.length, errCount=v.invalidas.length;
  const warnCount=v.validas.filter(x=>x.warnings.length>0).length;
  let body=`<div style="margin-bottom:14px;font-size:13px;line-height:1.6">
    <div><strong>Archivo:</strong> ${escapeHtml(fileName)}</div>
    <div><strong>Total de filas:</strong> ${v.total}</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <span class="badge badge-green">${okCount} válidas</span>
      ${warnCount>0?`<span class="badge badge-amber">${warnCount} con avisos</span>`:''}
      ${errCount>0?`<span class="badge badge-red">${errCount} con errores</span>`:''}
    </div></div>`;
  if(errCount>0){
    body+=`<div class="alert alert-warning" style="margin-bottom:12px;font-size:13px">⚠ Las filas con errores NO se cargarán. Corrija el Excel y vuelva a importarlo.</div>`;
    body+=`<h4 style="color:var(--gd);font-size:13px;margin:14px 0 8px">Filas con errores (${errCount})</h4>
      <div style="max-height:200px;overflow:auto;border:1px solid var(--bo);border-radius:6px"><table class="detalle-table" style="margin:0">
      <thead><tr><th>Hoja</th><th style="width:44px">Fila</th><th>Producto</th><th>Errores</th></tr></thead>
      <tbody>${v.invalidas.slice(0,60).map(it=>`<tr>
        <td>${it.hoja}</td><td class="mono">${it.fila}</td>
        <td>${escapeHtml((it.data.producto&&it.data.producto.descripcion)||it.data.codigo||'(?)')}</td>
        <td style="color:var(--red);font-size:12px">${it.errors.map(e=>escapeHtml(e)).join('<br>')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  if(okCount>0){
    body+=`<h4 style="color:var(--gd);font-size:13px;margin:14px 0 8px">Filas a cargar (${okCount})</h4>
      <div style="max-height:260px;overflow:auto;border:1px solid var(--bo);border-radius:6px"><table class="detalle-table" style="margin:0">
      <thead><tr><th>Hoja</th><th style="width:44px">Fila</th><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Bodega</th><th>C.Costo</th><th>Equipo</th><th>Avisos</th></tr></thead>
      <tbody>${v.validas.slice(0,120).map(it=>`<tr>
        <td>${it.hoja}</td><td class="mono">${it.fila}</td>
        <td>${escapeHtml(it.data.fecha||'')}</td>
        <td>${escapeHtml((it.data.producto&&it.data.producto.descripcion)||it.data.codigo)}</td>
        <td class="mono">${fmtNum(it.data.cantidad,2)}</td>
        <td>${escapeHtml((it.data.bodega&&it.data.bodega.nombre)||it.data.bodegaId)}</td>
        <td>${escapeHtml(it.data.centroCosto)}</td>
        <td>${escapeHtml(it.data.equipo||'-')}</td>
        <td style="color:var(--gm);font-size:11px">${it.warnings.map(w=>escapeHtml(w)).join('<br>')||'-'}</td>
      </tr>`).join('')}${v.validas.length>120?`<tr><td colspan="9" style="text-align:center;color:var(--mu);font-size:12px;padding:8px">… y ${v.validas.length-120} fila(s) más</td></tr>`:''}</tbody></table></div>`;
  }
  STATE._bulkConsumosPending=v;
  showModal('Vista previa · Carga masiva de salidas',body,
    `<button class="btn btn-secondary" onclick="closeModal();STATE._bulkConsumosPending=null">Cancelar</button>
     ${okCount>0?`<button class="btn btn-primary" id="btnConfirmConsumos">✓ Cargar ${okCount} salida(s)</button>`:''}`,
    'xl');
  if(okCount>0) document.getElementById('btnConfirmConsumos').onclick=()=>_executeBulkConsumos();
}

async function _executeBulkConsumos(){
  const v=STATE._bulkConsumosPending;
  if(!v||!v.validas.length) return;
  closeModal();
  showLoading('Cargando salidas...');
  let ok=0, fail=0; const fallidos=[];
  for(const it of v.validas){
    const d=it.data;
    try{
      const prod=d.producto;
      const costo=(getStock(d.codigo,d.bodegaId)?.costoPromedio)||prod?.costoPromedio||0;
      const fechaISO=d.fecha+'T'+new Date().toTimeString().slice(0,8);
      if(d.tipo==='NORMAL'){
        const cfg=getMovCfg('SAL','CONSUMO CC');
        const numero=await nextCounter(cfg.prefijo);
        const m={
          numero,tipo:'SAL',tipoMovimiento:'CONSUMO CC',
          fecha:fechaISO,bodegaId:d.bodegaId,
          documento:'',proveedor:'',destino:d.centroCosto,
          centroCosto:d.centroCosto,centroCostoNombre:(d.cc&&d.cc.descripcion)||'',centroCostoArea:(d.cc&&d.cc.area)||'',
          observaciones:d.obs||'',
          detalles:[{codigoInterno:d.codigo,cantidad:d.cantidad,costo,costoNeto:costo,lote:null,loteId:null,fechaVenc:null}],
          usuario:STATE.user.id,creado:new Date().toISOString(),anulado:false,cargaMasiva:true
        };
        await dbPut('movements',m);
        if(!(await dbGet('movements',numero))) throw new Error('no persistió');
        ok++;
      }else{
        const numero=await nextCounter('SAL');
        const m={
          numero,tipo:'SAL',tipoMovimiento:'CONSUMO COMBUSTIBLE',
          fecha:fechaISO,bodegaId:d.bodegaId,centroCosto:d.centroCosto,
          destino:d.equipo,
          observaciones:`Equipo: ${d.equipo} · Km/Hr: ${d.km} · Operador: ${d.operador}${d.obs?(' · '+d.obs):''}`,
          detalles:[{codigoInterno:d.codigo,descripcion:prod?.descripcion||d.codigo,cantidad:d.cantidad,costo}],
          usuario:STATE.user.id,creado:new Date().toISOString(),cargaMasiva:true
        };
        await dbPut('movements',m);
        if(!(await dbGet('movements',numero))) throw new Error('no persistió');
        const regCb={
          id:Date.now()+'-'+Math.random().toString(36).slice(2,7),
          fecha:fechaISO,equipo:d.equipo,km:d.km,usuario:d.operador,
          codigoProducto:d.codigo,producto:prod?.descripcion||d.codigo,
          cantidad:d.cantidad,centroCosto:d.centroCosto,bodegaId:d.bodegaId,movNumero:numero,
          observaciones:d.obs||'',registrado:new Date().toISOString(),registradoPor:STATE.user.id,cargaMasiva:true
        };
        await dbPut('combustible',regCb);
        ok++;
      }
    }catch(e){
      fail++; fallidos.push({hoja:it.hoja,fila:it.fila,err:e.message});
      console.error('Carga masiva salida fila',it.fila,e);
    }
  }
  // Recalcular stock una sola vez desde todos los movimientos.
  STATE.cache.movements=await dbAll('movements');
  await _ejecutarRecalculoStock();
  await audit('salida.cargaMasiva',`Carga masiva: ${ok} salida(s) creada(s)`,`bulk-${ok}`);
  await reloadCache();
  hideLoading();
  STATE._bulkConsumosPending=null;
  if(fail===0) toast('Carga exitosa',`Se registraron ${ok} salida(s)`);
  else { toast('Carga con errores',`${ok} creadas, ${fail} con error`,'warning'); console.warn('Salidas fallidas:',fallidos); }
  navigate('movimientos');
}
try{ window._executeBulkConsumos=_executeBulkConsumos; }catch(e){}

let cbDraft={};
function renderCombustibleForm(c){
  const today=new Date().toISOString().slice(0,10);
  // Solo productos combustibles (grupo/descripcion con gasolina o diesel)
  const combustibles=(STATE.cache.products||[]).filter(p=>{
    const t=((p.descripcion||'')+' '+(p.grupo||'')+' '+(p.subGrupo||'')).toLowerCase();
    return /gasolina|diesel|di[eé]sel|petr[oó]leo|bencina/.test(t);
  });
  const bodegasAll=STATE.cache.warehouses||[];
  // Solo la bodega de combustibles y lubricantes puede ser origen de una salida de combustible.
  const bodegas=bodegasAll.filter(b=>/combustible/i.test(b.nombre||''));
  const bodegaUnica = bodegas.length===1 ? bodegas[0] : null;
  const centros=STATE.cache.costCenters||[];
  const equipos=getEquiposActivos();
  cbDraft={fecha:today};
  c.innerHTML=`
    <div class="page-header"><div><div class="page-title">⛽ Salida de combustible</div>
      <div class="page-subtitle">Registro de consumo por equipo</div></div>
      <button class="btn btn-secondary" onclick="navigate('salidas')">← Volver</button></div>
    <div class="card" style="max-width:760px;margin:24px auto;padding:24px 26px">
      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:18px 20px">
        <div class="form-field"><label>Fecha</label>
          <input type="date" id="cb-fecha" value="${today}"></div>
        <div class="form-field"><label>Bodega origen</label>
          <select id="cb-bodega" onchange="cbStockHint()">
            ${bodegas.length===0?'<option value="">— Sin bodega de combustible —</option>':
              (bodegaUnica?`<option value="${bodegaUnica.id}" selected>${escapeHtml(bodegaUnica.nombre)}</option>`:
               '<option value="">— Seleccione —</option>'+bodegas.map(b=>`<option value="${b.id}">${escapeHtml(b.nombre)}</option>`).join(''))}
          </select>
          ${bodegas.length===0?'<div class="hint" style="color:#c0392b">No existe una bodega de combustibles y lubricantes. Créela en Bodegas.</div>':''}</div>
        <div class="form-field"><label>Equipo</label>
          <select id="cb-equipo" onchange="cbToggleOtro()">
            <option value="">— Seleccione —</option>
            ${equipos.map(e=>`<option value="${escapeHtml(e.nombre)}">${escapeHtml(e.nombre)}</option>`).join('')}
            <option value="${EQUIPO_OTRO}">➕ ${EQUIPO_OTRO}</option></select></div>
        <div class="span-2" id="cb-otro-wrap" style="display:none;grid-column:1/-1">
          <div style="border:1px dashed var(--bo);border-radius:10px;padding:16px 18px;background:var(--gs)">
            <div style="font-weight:700;color:var(--gd);font-size:13px;margin-bottom:12px">➕ Nuevo equipo</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px">
              <div class="form-field"><label>Nombre / identificador</label>
                <input type="text" id="cbeq-nombre" placeholder="Ej: TRACTOR JOHN DEERE 5090"></div>
              <div class="form-field"><label>Tipo</label>
                <select id="cbeq-tipo">${EQUIPO_TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
              <div class="form-field"><label>Medidor</label>
                <select id="cbeq-medidor">${EQUIPO_MEDIDORES.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('')}</select></div>
              <div class="form-field"><label>Patente / código (opcional)</label>
                <input type="text" id="cbeq-patente" placeholder="Ej: ABCD-12"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
              <button type="button" class="btn btn-primary btn-sm" onclick="cbCrearEquipoInline()">Crear y usar</button>
            </div>
            <div class="hint" id="cbeq-err" style="color:#c0392b;display:none;margin-top:6px"></div>
          </div>
        </div>
        <div class="form-field"><label id="cb-km-label">Kilometraje / Horómetro</label>
          <input type="number" id="cb-km" step="0.1" min="0" placeholder="Ej: 1250.5">
          <div class="hint" id="cb-km-hint" style="display:none;color:#0a6ed1"></div></div>
        <div class="form-field"><label>Usuario / Operador</label>
          <input type="text" id="cb-usuario" placeholder="Nombre de quien retira"></div>
        <div class="form-field"><label>Producto</label>
          <select id="cb-producto" onchange="cbStockHint()">
            <option value="">— Seleccione —</option>
            ${combustibles.map(p=>`<option value="${p.codigoInterno}">${escapeHtml(p.descripcion)}</option>`).join('')}</select>
          ${combustibles.length===0?'<div class="hint" style="color:#c0392b">No hay productos de combustible en el catálogo</div>':''}</div>
        <div class="form-field"><label>Cantidad (litros)</label>
          <input type="number" id="cb-cantidad" step="0.01" min="0" placeholder="0.00" oninput="cbStockHint()">
          <div class="hint" id="cb-stock-hint" style="display:none"></div></div>
        <div class="form-field" style="grid-column:1/-1"><label>Centro de costo</label>
          <select id="cb-centro"><option value="">— Seleccione —</option>
            ${centros.filter(cc=>cc.activo!==false).map(cc=>`<option value="${cc.codigo}">${escapeHtml(cc.codigo)} · ${escapeHtml(cc.descripcion||cc.nombre||'')}</option>`).join('')}</select></div>
        <div class="form-field" style="grid-column:1/-1"><label>Observaciones (opcional)</label>
          <input type="text" id="cb-obs" placeholder="Notas adicionales"></div>
      </div>
      <div id="cb-error" class="login-error" style="margin-top:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-secondary" onclick="navigate('salidas')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarCombustible()">💾 Registrar salida</button>
      </div>
    </div>`;
}
function cbToggleOtro(){
  const sel=document.getElementById('cb-equipo').value;
  const w=document.getElementById('cb-otro-wrap');
  if(w) w.style.display = sel===EQUIPO_OTRO ? 'block' : 'none';
  // Ajustar la etiqueta del medidor según el equipo elegido.
  const lbl=document.getElementById('cb-km-label');
  if(lbl){
    const eq=(sel && sel!==EQUIPO_OTRO)?getEquipoByNombre(sel):null;
    lbl.textContent = eq&&eq.medidor==='horometro' ? 'Horómetro (horas)'
      : eq&&eq.medidor==='km' ? 'Kilometraje (km)'
      : eq&&eq.medidor==='ninguno' ? 'Lectura (opcional)'
      : 'Kilometraje / Horómetro';
  }
  // Mostrar último horómetro/km registrado para el equipo elegido
  const hint=document.getElementById('cb-km-hint');
  if(hint){
    const regsEq=getCombustibleReal().filter(r=>r.equipo===sel && (r.km||0)>0);
    if(sel && sel!==EQUIPO_OTRO && regsEq.length>0){
      // Referencia = el horómetro/km MÁS ALTO del equipo (no el último por fecha,
      // que puede ser inferior si se editó o reordenó un registro).
      const mx=regsEq.reduce((a,b)=>((b.km||0)>(a.km||0)?b:a));
      hint.textContent=`Horómetro/km más alto registrado: ${mx.km} (${new Date(mx.fecha).toLocaleDateString('es-CL')})`;
      hint.style.display='block';
    } else { hint.style.display='none'; }
  }
}
/* Alta rápida de equipo desde el propio formulario de salida (opción "Otro"). */
async function cbCrearEquipoInline(){
  const errEl=document.getElementById('cbeq-err');
  const setE=(m)=>{ if(errEl){errEl.textContent=m;errEl.style.display='block';} };
  const nombre=(document.getElementById('cbeq-nombre').value||'').trim();
  const tipo=document.getElementById('cbeq-tipo').value||'';
  const medidor=document.getElementById('cbeq-medidor').value||'km';
  const patente=(document.getElementById('cbeq-patente').value||'').trim();
  if(!nombre) return setE('Ingrese el nombre del equipo.');
  // Materializar la semilla a registros reales si el catálogo aún no existe.
  let lista=getEquipos().map(e=>String(e.id||'').startsWith('seed-')
    ? {id:'eq-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),nombre:e.nombre,tipo:e.tipo||'',medidor:e.medidor||'km',patente:'',estado:'activo',creado:new Date().toISOString()}
    : e);
  if(lista.some(e=>String(e.nombre||'').toLowerCase()===nombre.toLowerCase())) return setE('Ya existe un equipo con ese nombre.');
  lista.push({id:'eq-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),nombre,tipo,medidor,patente,estado:'activo',creado:new Date().toISOString()});
  try{
    await saveEquiposLista(lista);
    try{ await audit('equipo.crear','Alta de equipo desde salida de combustible',nombre); }catch(e){}
  }catch(e){ return setE('No se pudo guardar el equipo.'); }
  const sel=document.getElementById('cb-equipo');
  if(sel){
    sel.innerHTML='<option value="">— Seleccione —</option>'+
      getEquiposActivos().map(e=>`<option value="${escapeHtml(e.nombre)}">${escapeHtml(e.nombre)}</option>`).join('')+
      `<option value="${EQUIPO_OTRO}">➕ ${EQUIPO_OTRO}</option>`;
    sel.value=nombre;
  }
  const w=document.getElementById('cb-otro-wrap'); if(w) w.style.display='none';
  cbToggleOtro();
  toast('Equipo creado',`${nombre} agregado al catálogo`);
}
/* Muestra el saldo disponible del combustible EN LA BODEGA seleccionada
   y avisa en el acto si la cantidad pedida lo supera. */
function cbStockHint(){
  const hint=document.getElementById('cb-stock-hint');
  if(!hint) return;
  const cod=(document.getElementById('cb-producto')||{}).value||'';
  const bod=(document.getElementById('cb-bodega')||{}).value||'';
  const inp=document.getElementById('cb-cantidad');
  const cant=parseFloat(inp&&inp.value)||0;
  if(!cod||!bod){ hint.style.display='none'; if(inp) inp.removeAttribute('max'); return; }
  const disp=(getStock(cod,bod)?.cantidad)||0;
  if(inp) inp.setAttribute('max',disp);
  hint.style.display='block';
  if(disp<=0){
    hint.style.color='#c0392b';
    hint.textContent='Sin stock de este combustible en la bodega seleccionada.';
  }else if(cant>disp){
    hint.style.color='#c0392b';
    hint.textContent=`Excede el saldo: disponible ${fmtNum(disp,2)} LT en esta bodega.`;
  }else{
    hint.style.color='#0a6ed1';
    hint.textContent=`Disponible en esta bodega: ${fmtNum(disp,2)} LT`+
      (cant>0?` · queda ${fmtNum(disp-cant,2)} LT`:'');
  }
}
try{ window.renderCombustibleForm=renderCombustibleForm; window.cbToggleOtro=cbToggleOtro; window.cbStockHint=cbStockHint; window.cbCrearEquipoInline=cbCrearEquipoInline; }catch(e){}

async function guardarCombustible(){
  if(!can('combustible.registrar')){ toast('Sin permiso','No tiene permiso para registrar salidas de combustible','error'); return; }
  const err=document.getElementById('cb-error');
  const setErr=(m)=>{ err.textContent=m; err.classList.add('show'); };
  const fecha=document.getElementById('cb-fecha').value;
  const bodegaId=document.getElementById('cb-bodega').value;
  let equipo=document.getElementById('cb-equipo').value;
  const km=parseFloat(document.getElementById('cb-km').value)||0;
  const usuario=(document.getElementById('cb-usuario').value||'').trim();
  const codigo=document.getElementById('cb-producto').value;
  const cantidad=parseFloat(document.getElementById('cb-cantidad').value)||0;
  const centro=document.getElementById('cb-centro').value;
  const obs=(document.getElementById('cb-obs').value||'').trim();

  if(!fecha) return setErr('Ingrese la fecha.');
  if(!bodegaId) return setErr('Seleccione la bodega de origen.');
  if(!equipo) return setErr('Seleccione el equipo.');
  if(equipo===EQUIPO_OTRO) return setErr('Complete los datos del equipo nuevo y presione «Crear y usar».');
  if(!usuario) return setErr('Ingrese el usuario/operador.');
  if(!codigo) return setErr('Seleccione el producto.');
  if(cantidad<=0) return setErr('Ingrese una cantidad válida.');
  if(!centro) return setErr('Seleccione el centro de costo.');

  // Validación de horómetro/kilometraje: no puede ser inferior al MÁS ALTO del
  // equipo (no el último por fecha, que puede ser menor tras editar/reordenar).
  const regsEq=getCombustibleReal().filter(r=>r.equipo===equipo && (r.km||0)>0);
  if(km>0 && regsEq.length>0){
    const mx=regsEq.reduce((a,b)=>((b.km||0)>(a.km||0)?b:a));
    if(km < (mx.km||0)){
      return setErr(`El horómetro/km (${km}) no puede ser inferior al más alto registrado para ${equipo}: ${mx.km} (${new Date(mx.fecha).toLocaleDateString('es-CL')}).`);
    }
  }

  const prod=getProduct(codigo);
  // La salida se emite contra la bodega seleccionada, así que el saldo debe
  // medirse en esa bodega. Antes se comparaba con getStockTotal (suma de todas
  // las bodegas), lo que permitía dejar una bodega en negativo.
  const dispBodega=(getStock(codigo,bodegaId)?.cantidad)||0;
  if(cantidad>dispBodega){
    const bodNom=(getWarehouse(bodegaId)?.nombre)||bodegaId;
    const total=getStockTotal(codigo);
    let msg=`Stock insuficiente en ${bodNom}. Disponible: ${fmtNum(dispBodega,2)} LT`;
    if(total>dispBodega) msg+=` (total en todas las bodegas: ${fmtNum(total,2)} LT)`;
    return setErr(msg+'.');
  }

  try{
    showLoading('Registrando salida de combustible...');
    // 1) Crear el movimiento de salida (usa el costo PPP actual)
    const costo=(getStock(codigo,bodegaId)?.costoPromedio)||prod?.costoPromedio||0;
    const numero=await nextCounter('SAL');
    const mov={
      numero, tipo:'SAL', tipoMovimiento:'CONSUMO COMBUSTIBLE',
      fecha:new Date(fecha).toISOString(), bodegaId, centroCosto:centro,
      destino:equipo, observaciones:`Equipo: ${equipo} · Km/Hr: ${km} · Operador: ${usuario}${obs?(' · '+obs):''}`,
      detalles:[{codigoInterno:codigo, descripcion:prod?.descripcion||codigo, cantidad, costo}],
      usuario:STATE.user.id, creado:new Date().toISOString()
    };
    await dbPut('movements',mov);
    var _v=await dbGet('movements',numero);
    if(!_v){ hideLoading(); setErr('El movimiento no pudo guardarse. Reintente.'); return; }
    // 2) Recalcular stock desde movimientos (misma lógica probada; descuenta el consumo)
    await _ejecutarRecalculoStock();
    // 3) Registro aparte para historial por equipo
    const regCb={
      id:Date.now()+'-'+Math.random().toString(36).slice(2,7),
      fecha:new Date(fecha).toISOString(), equipo, km, usuario,
      codigoProducto:codigo, producto:prod?.descripcion||codigo,
      cantidad, centroCosto:centro, bodegaId, movNumero:numero,
      observaciones:obs, registrado:new Date().toISOString(), registradoPor:STATE.user.id
    };
    await dbPut('combustible',regCb);
    await audit('combustible.salida',`${equipo} · ${cantidad}L de ${prod?.descripcion||codigo} · Km/Hr ${km}`,numero);
    STATE.cache.movements=await dbAll('movements');
    STATE.cache.stock=await dbAll('stock');
    STATE.cache.combustible=await dbAll('combustible');
    hideLoading();
    toast('Salida registrada',`${numero} · ${cantidad}L a ${equipo}`,'success');
    navigate('movimientos');
  }catch(e){
    hideLoading();
    setErr('Error al guardar: '+e.message);
    console.error('Error combustible:',e);
  }
}
try{ window.guardarCombustible=guardarCombustible; }catch(e){}

/* ── Ventana flotante del formulario de entrada/salida ──
   El formulario se muestra como un modal centrado sobre el área de contenido,
   dejando la barra lateral accesible. No se cierra al clicar fuera: solo con la
   X o al cambiar de módulo (navigate lo elimina). */
function _mvInjectStyles(){
  if(document.getElementById('mvFormStyles')) return;
  var st=document.createElement('style'); st.id='mvFormStyles';
  st.textContent=''+
    '.mv-form-overlay{position:fixed;top:56px;left:240px;right:0;bottom:0;background:rgba(15,23,42,.45);z-index:150;display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}'+
    '@media(max-width:880px){.mv-form-overlay{left:0}}'+
    '.mv-form-modal{background:#fff;width:100%;max-width:900px;max-height:calc(100vh - 92px);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}'+
    '.mv-form-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 18px;border-bottom:1px solid var(--bo,#e3e8ee);background:#fff;flex-shrink:0}'+
    '.mv-form-head h3{font-size:17px;font-weight:700;margin:0;color:var(--gd,#23303d)}'+
    '.mv-form-x{border:none;background:#f1f5f9;width:34px;height:34px;border-radius:8px;font-size:17px;cursor:pointer;color:#475569;line-height:1}'+
    '.mv-form-x:hover{background:#e2e8f0}'+
    '.mv-form-body{padding:14px 18px;overflow:auto}'+
    '.mv-form-body .card{margin-top:10px;box-shadow:none;border:1px solid var(--bo,#e3e8ee)}'+
    '.mv-form-body .card:first-of-type{margin-top:0}'+
    '.mv-form-body .card>div{padding:12px 14px}'+
    '.mv-form-body .form-grid{gap:10px 12px}';
  document.head.appendChild(st);
}
function _mvEnsureOverlay(isEnt,isEdit,editId){
  _mvInjectStyles();
  var ov=document.getElementById('mvFormOverlay');
  if(!ov){
    ov=document.createElement('div'); ov.id='mvFormOverlay'; ov.className='mv-form-overlay';
    ov.innerHTML='<div class="mv-form-modal"><div class="mv-form-head"><h3 id="mvFormTitle"></h3>'+
      '<button class="mv-form-x" title="Cerrar" onclick="_mvCloseForm()">✕</button></div>'+
      '<div class="mv-form-body" id="mvFormBody"></div></div>';
    document.body.appendChild(ov);
  }
  var t=document.getElementById('mvFormTitle');
  if(t) t.textContent=(isEdit?'Editar ':'Nueva ')+(isEnt?'Entrada':'Salida')+' de Bodega'+((isEdit&&editId)?(' · '+editId):'');
  return document.getElementById('mvFormBody');
}
function _mvCloseForm(){
  var ov=document.getElementById('mvFormOverlay'); if(ov) ov.remove();
  try{ navigate('movimientos'); }catch(e){}
}
try{ window._mvCloseForm=_mvCloseForm; }catch(e){}

function renderMovimientoForm(c,tipo='ENT'){
  movDraft={
    lineas:[{}],tipo,editId:null,
    fecha:new Date().toISOString().slice(0,10),
    bodegaId:'',
    tipoMovimiento:'',
    tipoDoc:'',numeroDoc:'',fechaVencDoc:'',
    proveedorCodigo:'',proveedorNombre:'',
    clienteCodigo:'',clienteNombre:'',
    centroCosto:'',
    bodegaDestinoId:'',
    documento:'',proveedor:'',destino:'',
    observaciones:'',
    facturaAsociada:''
  };
  _renderMovForm(c);
}
/* Extrae equipo/km/operador/nota del texto de observaciones de un consumo de
   combustible ("EQUIPO: X · KM/HR: Y · OPERADOR: Z · nota..."). */
function _parseObsCombustible(obs){
  var r={equipo:'',km:'',operador:'',nota:''}, resto=[];
  String(obs||'').split('·').forEach(function(p){
    p=p.trim();
    var mE=p.match(/^EQUIPO:\s*(.*)$/i); if(mE){r.equipo=mE[1].trim();return;}
    var mK=p.match(/^KM\/?\s*HR?:\s*(.*)$/i)||p.match(/^KM\/HR:\s*(.*)$/i); if(mK){r.km=mK[1].trim();return;}
    var mO=p.match(/^OPERADOR:\s*(.*)$/i); if(mO){r.operador=mO[1].trim();return;}
    if(p) resto.push(p);
  });
  r.nota=resto.join(' · ');
  return r;
}
function editMovimiento(numero){
  const m=STATE.cache.movements.find(x=>x.numero===numero);if(!m)return;
  STATE.page=m.tipo==='ENT'?'entradas':'salidas';
  movDraft={
    tipo:m.tipo,editId:numero,
    fecha:m.fecha?m.fecha.slice(0,10):new Date().toISOString().slice(0,10),
    bodegaId:m.bodegaId,
    tipoMovimiento:m.tipoMovimiento||'',
    tipoDoc:m.tipoDoc||'',
    numeroDoc:m.numeroDoc||'',
    fechaVencDoc:m.fechaVencDoc||'',
    proveedorCodigo:m.proveedorCodigo||'',
    proveedorNombre:m.proveedorNombre||m.proveedor||'',
    clienteCodigo:m.clienteCodigo||'',
    clienteNombre:m.clienteNombre||m.destino||'',
    centroCosto:m.centroCosto||'',
    bodegaDestinoId:m.bodegaDestinoId||'',
    documento:m.documento||'',
    proveedor:m.proveedor||'',destino:m.destino||'',
    observaciones:m.observaciones||'',
    facturaAsociada:m.facturaAsociada||'',
    motivo:'',
    lineas:(m.detalles||[]).map(d=>({...d}))
  };
  if(movDraft.lineas.length===0)movDraft.lineas=[{}];
  // Edición de consumo de combustible: exponer campos dedicados Equipo /
  // Km-Horómetro / Operador (que viven en el registro del store `combustible`),
  // en vez de dejarlos embebidos en el texto de observaciones.
  movDraft._esComb = (m.tipoMovimiento==='CONSUMO COMBUSTIBLE');
  if(movDraft._esComb){
    var _reg=(STATE.cache.combustible||[]).find(r=>r.movNumero===numero);
    var _pa=_parseObsCombustible(m.observaciones);
    movDraft.cbId=_reg?_reg.id:null;
    movDraft.cbEquipo=(_reg&&_reg.equipo)||_pa.equipo||m.destino||'';
    movDraft.cbKm=(_reg&&_reg.km!=null&&_reg.km!=='')?_reg.km:(_pa.km||'');
    movDraft.cbOperador=(_reg&&_reg.usuario)||_pa.operador||'';
    movDraft.observaciones=_pa.nota; // el campo de observaciones muestra solo la nota libre
  }
  renderSidebar();
  document.getElementById('topTitle').textContent=`Editar ${tipoLabel(m.tipo)} · ${numero}`;
  _renderMovForm(document.getElementById('mainContent'));
}

function _renderMovForm(c){
  const tipo=movDraft.tipo;
  const isEnt=tipo==='ENT';
  const today=new Date().toISOString().slice(0,10);
  const fecha=movDraft.fecha||today;
  // Montar en la ventana flotante (reasigna el contenedor al cuerpo del modal).
  c=_mvEnsureOverlay(isEnt,!!movDraft.editId,movDraft.editId);
  c.innerHTML=`
    <div class="page-subtitle" style="margin-bottom:12px">${movDraft.editId?'Modificación de '+movDraft.editId:'Auto-numerado al guardar'} · Auto-guardado activo</div>
    ${(()=>{
      const TODOS=isEnt?TIPOS_MOV_ENT:TIPOS_MOV_SAL;
      // Al crear se ofrecen solo los tipos manuales; al editar se muestra el
      // tipo real del movimiento aunque sea uno generado por el sistema.
      const TIPOS=movDraft.editId
        ? TODOS.filter(t=>!t.oculto||t.tipo===movDraft.tipoMovimiento)
        : TODOS.filter(t=>!t.oculto);
      const cfg=getMovCfg(movDraft.tipo,movDraft.tipoMovimiento);
      const fechaLabel=isEnt?'Fecha de ingreso':'Fecha de salida';
      return `
      <!-- 0. Selector de tipo de movimiento (siempre visible) -->
      <div class="card">
        <div class="card-header"><div class="card-title">${isEnt?'⬇️':'⬆️'} Tipo de ${isEnt?'entrada':'salida'}</div></div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field span-2 required"><label>Motivo del movimiento</label>
              <select id="mvTipoMov" ${movDraft.editId?'disabled':''}>
                ${movDraft.editId?'':`<option value="">- Seleccionar tipo de ${isEnt?'entrada':'salida'} -</option>`}
                ${TIPOS.map(t=>`<option value="${t.tipo}" ${movDraft.tipoMovimiento===t.tipo?'selected':''}>${t.icon} ${t.label}</option>`).join('')}
                ${(movDraft.editId&&!cfg)?`<option value="${escapeHtml(movDraft.tipoMovimiento||'')}" selected>${escapeHtml(movDraft.tipoMovimiento||'(sin tipo)')}</option>`:''}
              </select>
              <div class="hint" id="mvMovPrefHint">${movDraft.editId?'No editable. El correlativo del movimiento queda atado al tipo original.':_movPrefixHint(movDraft.tipo,movDraft.tipoMovimiento)}</div>
            </div>
          </div>
        </div>
      </div>

      ${cfg?`
      <!-- 1. Datos básicos: fecha + bodega(s) -->
      <div class="card" style="margin-top:14px">
        <div class="card-header"><div class="card-title">📅 Datos del movimiento</div></div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field required"><label>${fechaLabel}</label><input type="date" id="mvFecha" value="${fecha}"></div>
            <div class="form-field required"><label>Bodega ${cfg.reqBodDest?'origen':(isEnt?'destino':'origen')}</label>
              <select id="mvBodId">
                <option value="">- Seleccionar -</option>
                ${STATE.cache.warehouses.filter(b=>b.activo).map(b=>`<option value="${b.id}" ${movDraft.bodegaId===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}
              </select>
            </div>
            ${cfg.reqBodDest?`
            <div class="form-field span-2 required"><label>Bodega destino</label>
              <select id="mvBodDest">
                <option value="">- Seleccionar -</option>
                ${STATE.cache.warehouses.filter(b=>b.activo).map(b=>`<option value="${b.id}" ${movDraft.bodegaDestinoId===b.id?'selected':''}>${escapeHtml(b.nombre)}</option>`).join('')}
              </select>
              <div class="hint">Debe ser distinta a la bodega origen</div>
            </div>`:''}
            ${cfg.reqFechaCosecha?`
            <div class="form-field span-2 required"><label>🍒 Fecha de cosecha</label><input type="date" id="mvFechaCosecha" value="${escapeHtml(movDraft.fechaCosecha||fecha)}"><div class="hint">Fecha en que se cosechó el producto que ingresa a stock</div></div>`:''}
          </div>
        </div>
      </div>

      ${cfg.reqDoc?`
      <!-- 2a. Documento tributario (cuando aplica) -->
      <div class="card" style="margin-top:14px">
        <div class="card-header"><div class="card-title">📄 Documento tributario</div></div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field required"><label>Tipo de documento</label>
              <select id="mvTipoDoc">
                <option value="">- Seleccionar -</option>
                ${TIPOS_DOC.map(t=>`<option value="${t}" ${movDraft.tipoDoc===t?'selected':''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-field required"><label>Número del documento</label><input type="text" id="mvNumDoc" value="${escapeHtml(movDraft.numeroDoc||'')}" placeholder="Ej: 12345" inputmode="numeric"><div class="hint">Folio del documento (SII u interno)</div></div>
            <div class="form-field span-2"><label>Fecha vencimiento documento</label><input type="date" id="mvVencDoc" value="${escapeHtml(movDraft.fechaVencDoc||'')}"><div class="hint">Vencimiento de pago (opcional)</div></div>
          </div>
        </div>
      </div>`:''}

      ${(movDraft.tipoMovimiento==='DEVOLUCION PROVEEDOR' && movDraft.tipoDoc==='NOTA DE CREDITO')?`
      <!-- 2a-bis. Factura asociada (obligatoria para Nota de Crédito) -->
      <div class="card" style="margin-top:14px;border:2px solid #e9730c">
        <div class="card-header"><div class="card-title">🔗 Factura asociada <span style="color:#e9730c;font-size:11px">· obligatoria para Nota de Crédito</span></div>
          <button class="btn btn-secondary btn-sm" onclick="_mvRefreshFacturas()">🔄 Actualizar lista</button></div>
        <div style="padding:18px">
          <div class="form-field required">
            <label>Factura del proveedor que contiene el producto devuelto</label>
            <select id="mvFacturaAsoc" onchange="_mvFacturaAsocChange()">
              <option value="">- Seleccionar factura -</option>
              ${_mvFacturasProveedor().map(f=>`<option value="${escapeHtml(f.numero)}" ${movDraft.facturaAsociada===f.numero?'selected':''}>${escapeHtml((f.tipoDoc==='FACTURA EXENTA'?'FAC.EX':'FAC')+' '+(f.numeroDoc||'')+' · '+fmtDateOnly(f.fecha)+' · '+((f.detalles||[]).length)+' ítem(s)')}</option>`).join('')}
            </select>
            <div class="hint">${(function(){ if(!movDraft.proveedorCodigo) return '⚠ Seleccione primero el proveedor.'; var fs=_mvFacturasProveedor(); if(!fs.length) return '⚠ No hay facturas de este proveedor que contengan el/los producto(s) del detalle. Agregue el producto y pulse “Actualizar lista”.'; return 'El costo de la devolución se tomará de esta factura. La cantidad devuelta no puede superar la comprada (menos devoluciones previas).'; })()}</div>
          </div>
        </div>
      </div>`:''}

      ${cfg.reqProv?`
      <!-- 2b. Proveedor (cuando aplica) -->
      <div class="card card-autocomplete" style="margin-top:14px">
        <div class="card-header"><div class="card-title">🚚 Proveedor</div>${can('proveedores.crear')?`<button class="btn btn-secondary btn-sm" onclick="_captureMovHeader();openProveedorForm(null,{fromMov:true,prefilledCodigo:document.getElementById('mvProvCod')?document.getElementById('mvProvCod').value:''})">+ Crear nuevo</button>`:''}</div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field required" style="position:relative;z-index:100"><label>Código o razón social</label>
              <input type="text" id="mvProvCod" value="${escapeHtml(movDraft.proveedorCodigo||'')}" placeholder="Ej: 77684700 o nombre del proveedor" autocomplete="off">
              <div class="hint">Escriba el código (RUT sin guión) o el nombre para buscar</div>
              <div id="mvProvSug" class="mv-sug-box" style="display:none"></div>
            </div>
            <div class="form-field"><label>Razón social</label>
              <div id="mvProvNomBox" style="padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;min-height:38px;font-size:14px;color:var(--tx);display:flex;align-items:center;gap:8px">
                ${movDraft.proveedorNombre?`<strong>${escapeHtml(movDraft.proveedorNombre)}</strong>${movDraft.proveedorCodigo?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openProveedorForm('${escapeHtml(movDraft.proveedorCodigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`:'<span style="color:var(--mu);font-size:13px">— Ingrese el código y tabule —</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>`:''}

      ${cfg.reqCli?`
      <!-- 2c. Cliente (cuando aplica) -->
      <div class="card card-autocomplete" style="margin-top:14px">
        <div class="card-header"><div class="card-title">👤 Cliente / Destino</div>${can('clientes.crear')?`<button class="btn btn-secondary btn-sm" onclick="_captureMovHeader();openClienteForm(null,{fromMov:true,prefilledCodigo:document.getElementById('mvCliCod')?document.getElementById('mvCliCod').value:''})">+ Crear nuevo</button>`:''}</div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field required" style="position:relative;z-index:100"><label>Código o razón social</label>
              <input type="text" id="mvCliCod" value="${escapeHtml(movDraft.clienteCodigo||'')}" placeholder="Ej: 77684700 o nombre del cliente" autocomplete="off">
              <div class="hint">Escriba el código (RUT sin guión) o el nombre para buscar</div>
              <div id="mvCliSug" class="mv-sug-box" style="display:none"></div>
            </div>
            <div class="form-field"><label>Razón social</label>
              <div id="mvCliNomBox" style="padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;min-height:38px;font-size:14px;color:var(--tx);display:flex;align-items:center;gap:8px">
                ${movDraft.clienteNombre?`<strong>${escapeHtml(movDraft.clienteNombre)}</strong>${movDraft.clienteCodigo?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openClienteForm('${escapeHtml(movDraft.clienteCodigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`:'<span style="color:var(--mu);font-size:13px">— Ingrese el código y tabule —</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>`:''}

      ${cfg.reqCC?`
      <!-- 2d. Centro de costo (cuando aplica) -->
      <div class="card" style="margin-top:14px">
        <div class="card-header"><div class="card-title">🏢 Centro de costo</div>${can('centrosCosto.crear')?`<button class="btn btn-secondary btn-sm" onclick="_captureMovHeader();openCentroCostoForm(null,{fromMov:true})">+ Crear nuevo</button>`:''}</div>
        <div style="padding:18px">
          <div class="form-grid">
            <div class="form-field span-2 required"><label>Centro de costo</label>
              <select id="mvCC">
                <option value="">- Seleccionar -</option>
                ${(()=>{
                  const ccs=STATE.cache.costCenters.filter(c=>c.activo!==false).slice().sort((a,b)=>a.codigo.localeCompare(b.codigo));
                  // Si el draft tiene un CC inactivo o que ya no existe, igual lo mostramos como selección actual
                  const draftCod=movDraft.centroCosto;
                  const existeActivo=draftCod&&ccs.find(c=>c.codigo===draftCod);
                  const inactivo=draftCod&&!existeActivo&&STATE.cache.costCenters.find(c=>c.codigo===draftCod);
                  let html='';
                  // Agrupar por área
                  const porArea={};
                  ccs.forEach(c=>{const a=c.area||'(sin área)';if(!porArea[a])porArea[a]=[];porArea[a].push(c)});
                  Object.keys(porArea).sort().forEach(area=>{
                    html+=`<optgroup label="${escapeHtml(area)}">`;
                    porArea[area].forEach(c=>{
                      html+=`<option value="${escapeHtml(c.codigo)}" ${draftCod===c.codigo?'selected':''}>${escapeHtml(c.codigo)} · ${escapeHtml(c.descripcion)}</option>`;
                    });
                    html+='</optgroup>';
                  });
                  if(inactivo){
                    html+=`<option value="${escapeHtml(draftCod)}" selected>${escapeHtml(draftCod)} · ${escapeHtml(inactivo.descripcion)} (inactivo)</option>`;
                  }else if(draftCod&&!existeActivo){
                    html+=`<option value="${escapeHtml(draftCod)}" selected>${escapeHtml(draftCod)} (no encontrado)</option>`;
                  }
                  if(ccs.length===0&&!draftCod){
                    html+='<option disabled>(No hay centros de costo creados)</option>';
                  }
                  return html;
                })()}
              </select>
              <div class="hint">${STATE.cache.costCenters.length===0?'⚠ No hay centros de costo creados. Use el botón "+ Crear nuevo" para registrar el primero.':'Seleccione un centro de costo activo o cree uno nuevo'}</div>
            </div>
          </div>
        </div>
      </div>`:''}

      <!-- 3. Observaciones + motivo de edición -->
      <div class="card" style="margin-top:14px">
        <div style="padding:18px">
          <div class="form-grid">
            ${movDraft._esComb?`
            <div class="form-field"><label>Equipo</label><input type="text" id="mvCbEquipo" value="${escapeHtml(movDraft.cbEquipo||'')}" placeholder="Ej: TRACTOR 2"></div>
            <div class="form-field"><label>Km / Horómetro</label><input type="number" step="any" id="mvCbKm" value="${escapeHtml(String(movDraft.cbKm==null?'':movDraft.cbKm))}" placeholder="Ej: 2064"><div class="hint">Corrige aquí el horómetro; se guarda en el registro de combustible.</div></div>
            <div class="form-field"><label>Operador</label><input type="text" id="mvCbOperador" value="${escapeHtml(movDraft.cbOperador||'')}" placeholder="Ej: FELIPE RAMIREZ"></div>
            <div class="form-field span-2"><label>Nota (observaciones)</label><input type="text" id="mvObs" value="${escapeHtml(movDraft.observaciones||'')}" placeholder="Notas opcionales"></div>
            `:`
            <div class="form-field span-2 ${movDraft.tipoMovimiento==='MERMA'||movDraft.tipoMovimiento==='TOMA INVENTARIO ENT'||movDraft.tipoMovimiento==='TOMA INVENTARIO SAL'?'required':''}"><label>${movDraft.tipoMovimiento==='MERMA'?'Motivo de la merma':'Observaciones'}</label><input type="text" id="mvObs" value="${escapeHtml(movDraft.observaciones||'')}" placeholder="${movDraft.tipoMovimiento==='MERMA'?'Ej: Vencimiento, daño, pérdida':'Notas opcionales'}"></div>
            `}
            ${movDraft.editId?`<div class="form-field span-2 required"><label>Motivo de edición</label><input type="text" id="mvMot" placeholder="Indique por qué se edita este movimiento" value="${escapeHtml(movDraft.motivo||'')}"></div>`:''}
          </div>
        </div>
      </div>
      `:''}
      `;
    })()}
    <div class="card" style="margin-top:14px">
      <div class="card-header">
        <div class="card-title">Detalle de productos</div>
        <div style="display:flex;gap:8px">
          ${can('productos.crear')?`<button class="btn btn-secondary btn-sm" onclick="_captureMovHeader();openProductForm(null,{fromMov:true,lineIndex:_findEmptyLineIndex(),prefilledDesc:''})" title="Crear un producto nuevo en la base">📦 Nuevo producto</button>`:''}
          <button class="btn btn-secondary btn-sm" onclick="addMovLine()">+ Agregar línea</button>
        </div>
      </div>
      <div style="padding:0 18px 18px" id="mvDetalleWrap"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button class="btn btn-secondary" onclick="navigate('movimientos')">Cancelar</button>
      <button class="btn ${isEnt?'btn-success':'btn-primary'}" onclick="saveMovimiento()">${movDraft.editId?'💾 Guardar cambios':isEnt?'⬇️ Registrar Entrada':'⬆️ Registrar Salida'}</button>
    </div>`;
  renderMovDetalle();
  // Tipo de movimiento: cambia el formulario completo cuando se selecciona
  const tipoMovEl=document.getElementById('mvTipoMov');
  if(tipoMovEl&&!movDraft.editId){
    tipoMovEl.addEventListener('change',()=>{
      movDraft.tipoMovimiento=tipoMovEl.value;
      // Limpiar campos que ya no aplican al cambiar el tipo
      const cfg=getMovCfg(movDraft.tipo,movDraft.tipoMovimiento);
      if(cfg){
        if(!cfg.reqProv){movDraft.proveedorCodigo='';movDraft.proveedorNombre=''}
        if(!cfg.reqCli){movDraft.clienteCodigo='';movDraft.clienteNombre=''}
        if(!cfg.reqCC)movDraft.centroCosto='';
        if(!cfg.reqDoc){movDraft.tipoDoc='';movDraft.numeroDoc='';movDraft.fechaVencDoc=''}
        if(!cfg.reqBodDest)movDraft.bodegaDestinoId='';
      }
      _renderMovForm(document.getElementById('mainContent'));
    });
  }

  // Auto-bind: campos comunes a ENT y SAL
  const commonIds=['mvFecha','mvBodId','mvObs','mvMot','mvCC','mvBodDest'];
  commonIds.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.addEventListener('change',()=>{
      if(document.getElementById('mvFecha'))movDraft.fecha=document.getElementById('mvFecha').value;
      if(document.getElementById('mvBodId'))movDraft.bodegaId=document.getElementById('mvBodId').value;
      if(document.getElementById('mvBodDest'))movDraft.bodegaDestinoId=document.getElementById('mvBodDest').value;
      if(document.getElementById('mvFechaCosecha'))movDraft.fechaCosecha=document.getElementById('mvFechaCosecha').value;
      if(document.getElementById('mvObs'))movDraft.observaciones=document.getElementById('mvObs').value;
      if(document.getElementById('mvCC'))movDraft.centroCosto=document.getElementById('mvCC').value;
      if(movDraft.editId&&document.getElementById('mvMot'))movDraft.motivo=document.getElementById('mvMot').value;
    });
  });
  const bodIdEl=document.getElementById('mvBodId');
  if(bodIdEl)bodIdEl.addEventListener('change',()=>{movDraft.bodegaId=bodIdEl.value;renderMovDetalle()});

  // Doc tributario (cuando está visible)
  ['mvTipoDoc','mvNumDoc','mvVencDoc'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.addEventListener('change',()=>{
      if(document.getElementById('mvTipoDoc'))movDraft.tipoDoc=document.getElementById('mvTipoDoc').value;
      if(document.getElementById('mvNumDoc'))movDraft.numeroDoc=document.getElementById('mvNumDoc').value.trim();
      if(document.getElementById('mvVencDoc'))movDraft.fechaVencDoc=document.getElementById('mvVencDoc').value;
      // En devolución a proveedor, al elegir/quitar Nota de Crédito se muestra u
      // oculta la tarjeta de factura asociada → re-render.
      if(id==='mvTipoDoc' && movDraft.tipoMovimiento==='DEVOLUCION PROVEEDOR'){
        _renderMovForm(document.getElementById('mainContent'));
      }
    });
  });
  const numDocEl=document.getElementById('mvNumDoc');
  if(numDocEl)numDocEl.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'');});

  // Proveedor (cuando está visible)
  const provCodEl=document.getElementById('mvProvCod');
  if(provCodEl){
    provCodEl.addEventListener('input',e=>{ mvSugerir('prov', e.target.value); });
    provCodEl.addEventListener('blur',()=>{ setTimeout(()=>{ var s=document.getElementById('mvProvSug'); if(s)s.style.display='none'; lookupProveedor(); },180); });
    provCodEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();var s=document.getElementById('mvProvSug');if(s)s.style.display='none';lookupProveedor()}});
  }
  // Cliente (cuando está visible)
  const cliCodEl=document.getElementById('mvCliCod');
  if(cliCodEl){
    cliCodEl.addEventListener('input',e=>{ mvSugerir('cli', e.target.value); });
    cliCodEl.addEventListener('blur',()=>{ setTimeout(()=>{ var s=document.getElementById('mvCliSug'); if(s)s.style.display='none'; lookupCliente(); },180); });
    cliCodEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();var s=document.getElementById('mvCliSug');if(s)s.style.display='none';lookupCliente()}});
  }
}

// Muestra sugerencias de proveedores/clientes que coincidan con el texto (código o razón social)
function mvSugerir(tipo, texto){
  const esProv = tipo==='prov';
  const sugBox = document.getElementById(esProv?'mvProvSug':'mvCliSug');
  if(!sugBox) return;
  const q = (texto||'').trim().toLowerCase();
  if(q.length<2){ sugBox.style.display='none'; return; }
  const lista = esProv ? (STATE.cache.providers||[]) : (STATE.cache.customers||[]);
  const matches = lista.filter(x=>{
    const cod=(x.codigo||'').toLowerCase();
    const rs=(x.razonSocial||'').toLowerCase();
    const fant=(x.nombreFantasia||'').toLowerCase();
    return cod.includes(q) || rs.includes(q) || fant.includes(q);
  }).slice(0,8);
  if(!matches.length){
    sugBox.innerHTML='<div style="padding:10px 12px;color:var(--mu);font-size:13px">Sin coincidencias. Puede crear uno nuevo con el botón "+ Crear nuevo".</div>';
    sugBox.style.display='block';
    return;
  }
  sugBox.innerHTML = matches.map(x=>{
    const fn = esProv?'mvElegirProv':'mvElegirCli';
    return '<div class="mv-sug-item" onmousedown="event.preventDefault();'+fn+'(\''+escapeHtml(x.codigo)+'\')">'+
      '<div style="font-weight:700;color:var(--tx)">'+escapeHtml(x.razonSocial||'(sin razón social)')+'</div>'+
      '<div style="font-size:12px;color:var(--mu)">'+escapeHtml(x.codigo||'')+(x.nombreFantasia?' · '+escapeHtml(x.nombreFantasia):'')+'</div>'+
    '</div>';
  }).join('');
  sugBox.style.display='block';
}
function mvElegirProv(codigo){
  const el=document.getElementById('mvProvCod');
  if(el){ el.value=codigo; }
  const s=document.getElementById('mvProvSug'); if(s)s.style.display='none';
  lookupProveedor();
}
function mvElegirCli(codigo){
  const el=document.getElementById('mvCliCod');
  if(el){ el.value=codigo; }
  const s=document.getElementById('mvCliSug'); if(s)s.style.display='none';
  lookupCliente();
}

/* ── Hint del correlativo según tipo de movimiento ── */
function _movPrefixHint(tipo,tipoMov){
  if(!tipoMov)return 'Cada tipo de movimiento usa su propio correlativo independiente.';
  const cfg=getMovCfg(tipo,tipoMov);
  if(!cfg)return '';
  const c=STATE.cache.config.counters||{};
  const next=(c[cfg.prefijo]||0)+1;
  return `Se asignará el número interno <strong class="mono" style="color:var(--gd)">${cfg.prefijo}-${String(next).padStart(6,'0')}</strong> al guardar.`;
}

/* ── Lookup de cliente desde el form ── */
function lookupCliente(){
  const codEl=document.getElementById('mvCliCod');if(!codEl)return;
  const cod=codEl.value.trim();
  movDraft.clienteCodigo=cod;
  if(!cod){
    movDraft.clienteNombre='';
    document.getElementById('mvCliNomBox').innerHTML='<span style="color:var(--mu);font-size:13px">— Ingrese el código y tabule —</span>';
    return;
  }
  const p=STATE.cache.customers.find(x=>x.codigo===cod);
  if(p){
    if(p.activo===false){
      movDraft.clienteNombre=p.razonSocial;
      document.getElementById('mvCliNomBox').innerHTML=`<strong style="color:var(--mu)">${escapeHtml(p.razonSocial)}</strong> <span class="badge badge-gray">Inactivo</span>${can('clientes.crear')?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openClienteForm('${escapeHtml(p.codigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`;
      toast('Cliente inactivo','Está marcado como inactivo. Puede activarlo desde su ficha.','warning');
    }else{
      movDraft.clienteNombre=p.razonSocial;
      document.getElementById('mvCliNomBox').innerHTML=`<strong>${escapeHtml(p.razonSocial)}</strong>${can('clientes.crear')?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openClienteForm('${escapeHtml(p.codigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`;
    }
  }else{
    movDraft.clienteNombre='';
    if(can('clientes.crear')){
      document.getElementById('mvCliNomBox').innerHTML=`<span style="color:var(--red);font-size:13px">⚠ No existe cliente con ese código</span><button class="btn btn-primary btn-sm" onclick="event.preventDefault();_captureMovHeader();openClienteForm(null,{fromMov:true,prefilledCodigo:'${escapeHtml(cod)}'})" style="margin-left:auto" type="button">+ Crear ahora</button>`;
    }else{
      document.getElementById('mvCliNomBox').innerHTML=`<span style="color:var(--red);font-size:13px">⚠ No existe cliente con ese código. Sin permiso para crear.</span>`;
    }
  }
}

/* ── Captura los valores actuales del header del form a movDraft (antes de re-render) ── */
function _captureMovHeader(){
  const get=(id)=>{const el=document.getElementById(id);return el?el.value:''};
  // Al editar, el tipo es inmutable (el correlativo depende de él) y su selector
  // está deshabilitado. Leerlo aquí lo dejaba vacío y la validación bloqueaba el
  // guardado con "Falta tipo de movimiento".
  if(!movDraft.editId && document.getElementById('mvTipoMov'))movDraft.tipoMovimiento=get('mvTipoMov');
  if(document.getElementById('mvFecha'))movDraft.fecha=get('mvFecha');
  if(document.getElementById('mvBodId'))movDraft.bodegaId=get('mvBodId');
  if(document.getElementById('mvBodDest'))movDraft.bodegaDestinoId=get('mvBodDest');
  if(document.getElementById('mvFechaCosecha'))movDraft.fechaCosecha=get('mvFechaCosecha');
  if(document.getElementById('mvObs'))movDraft.observaciones=get('mvObs');
  if(document.getElementById('mvFacturaAsoc'))movDraft.facturaAsociada=get('mvFacturaAsoc');
  if(document.getElementById('mvCbEquipo'))movDraft.cbEquipo=get('mvCbEquipo');
  if(document.getElementById('mvCbKm'))movDraft.cbKm=get('mvCbKm');
  if(document.getElementById('mvCbOperador'))movDraft.cbOperador=get('mvCbOperador');
  if(document.getElementById('mvMot'))movDraft.motivo=get('mvMot');
  if(document.getElementById('mvCC'))movDraft.centroCosto=get('mvCC');
  if(document.getElementById('mvTipoDoc'))movDraft.tipoDoc=get('mvTipoDoc');
  if(document.getElementById('mvNumDoc'))movDraft.numeroDoc=get('mvNumDoc').trim();
  if(document.getElementById('mvVencDoc'))movDraft.fechaVencDoc=get('mvVencDoc');
  if(document.getElementById('mvProvCod'))movDraft.proveedorCodigo=get('mvProvCod').trim();
  if(document.getElementById('mvCliCod'))movDraft.clienteCodigo=get('mvCliCod').trim();
}

/* ── Lookup de proveedor desde el form de entrada ── */
function lookupProveedor(){
  const codEl=document.getElementById('mvProvCod');if(!codEl)return;
  const cod=codEl.value.trim();
  movDraft.proveedorCodigo=cod;
  if(!cod){
    movDraft.proveedorNombre='';
    document.getElementById('mvProvNomBox').innerHTML='<span style="color:var(--mu);font-size:13px">— Ingrese el código y tabule —</span>';
    return;
  }
  const p=STATE.cache.providers.find(x=>x.codigo===cod);
  if(p){
    if(p.activo===false){
      movDraft.proveedorNombre=p.razonSocial;
      document.getElementById('mvProvNomBox').innerHTML=`<strong style="color:var(--mu)">${escapeHtml(p.razonSocial)}</strong> <span class="badge badge-gray">Inactivo</span>${can('proveedores.crear')?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openProveedorForm('${escapeHtml(p.codigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`;
      toast('Proveedor inactivo','Está marcado como inactivo. Puede activarlo desde su ficha.','warning');
    }else{
      movDraft.proveedorNombre=p.razonSocial;
      document.getElementById('mvProvNomBox').innerHTML=`<strong>${escapeHtml(p.razonSocial)}</strong>${can('proveedores.crear')?`<button class="btn btn-secondary btn-sm" onclick="event.preventDefault();_captureMovHeader();openProveedorForm('${escapeHtml(p.codigo)}',{fromMov:true})" style="margin-left:auto" type="button">✏️ Ver/Editar</button>`:''}`;
    }
  }else{
    movDraft.proveedorNombre='';
    if(can('proveedores.crear')){
      document.getElementById('mvProvNomBox').innerHTML=`<span style="color:var(--red);font-size:13px">⚠ No existe proveedor con ese código</span><button class="btn btn-primary btn-sm" onclick="event.preventDefault();_captureMovHeader();openProveedorForm(null,{fromMov:true,prefilledCodigo:'${escapeHtml(cod)}'})" style="margin-left:auto" type="button">+ Crear ahora</button>`;
    }else{
      document.getElementById('mvProvNomBox').innerHTML=`<span style="color:var(--red);font-size:13px">⚠ No existe proveedor con ese código. Sin permiso para crear.</span>`;
    }
  }
}
// Calcula el costo unitario REAL de una línea de entrada considerando impuestos no recuperables.
// IVA: siempre recuperable (no es costo). ILA: 100% costo. Específico: solo la parte NO recuperada es costo.
// montoEspecifico e montoILA son los montos TOTALES de la línea (desde la factura).
function calcCostoConImpuestos(neto, cantidad, montoEspecifico, montoILA){
  cantidad = Number(cantidad)||0;
  if(cantidad<=0) return Number(neto)||0;
  var emp = (STATE.cache.config && STATE.cache.config.empresa) || {};
  var recupPct = (emp.recupIEC!=null ? emp.recupIEC : 100)/100;   // % recuperación específico
  var espNoRecup = (Number(montoEspecifico)||0) * (1 - recupPct); // parte del específico que es costo
  var ilaCosto = (Number(montoILA)||0);                            // ILA 100% costo
  // Costo unitario = neto unitario + (no recuperado del específico + ILA) repartido por unidad
  var netoUnit = Number(neto)||0;
  return netoUnit + (espNoRecup + ilaCosto)/cantidad;
}

/* ── Devolución a proveedor con Nota de Crédito: facturas asociables ──
   Facturas de COMPRA (FACTURA / FACTURA EXENTA) del proveedor seleccionado que
   contengan TODOS los productos actualmente en el detalle de la devolución. */
function _mvFacturasProveedor(){
  var prov=movDraft.proveedorCodigo;
  var codigos=(movDraft.lineas||[]).map(function(l){return l.codigoInterno;}).filter(Boolean);
  return (STATE.cache.movements||[]).filter(function(m){
    if(m.anulado) return false;
    if(m.tipo!=='ENT' || m.tipoMovimiento!=='COMPRA') return false;
    if(!(m.tipoDoc==='FACTURA'||m.tipoDoc==='FACTURA EXENTA')) return false;
    if(prov && m.proveedorCodigo!==prov) return false;
    if(codigos.length){
      var prods=(m.detalles||[]).map(function(d){return d.codigoInterno;});
      for(var i=0;i<codigos.length;i++){ if(prods.indexOf(codigos[i])<0) return false; }
    }
    return true;
  }).sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||''); });
}
function _mvRefreshFacturas(){ _captureMovHeader(); _renderMovForm(document.getElementById('mainContent')); }
function _mvFacturaAsocChange(){
  _captureMovHeader();
  // Tomar el costo unitario de cada línea desde la factura asociada.
  var f=(STATE.cache.movements||[]).find(function(m){return m.numero===movDraft.facturaAsociada;});
  if(f){
    (movDraft.lineas||[]).forEach(function(l){
      if(!l.codigoInterno) return;
      var d=(f.detalles||[]).find(function(x){return x.codigoInterno===l.codigoInterno;});
      if(d){ l.costo=(d.costoNeto!=null?d.costoNeto:d.costo)||0; }
    });
  }
  _renderMovForm(document.getElementById('mainContent'));
}
try{ window._mvFacturasProveedor=_mvFacturasProveedor; window._mvRefreshFacturas=_mvRefreshFacturas; window._mvFacturaAsocChange=_mvFacturaAsocChange; }catch(e){}

function renderMovDetalle(){
  const w=document.getElementById('mvDetalleWrap');
  const isEnt=movDraft.tipo==='ENT';
  const bod=movDraft.bodegaId;
  let total=0;
  let html=`<div style="overflow-x:auto;margin-top:14px"><table class="detalle-table" style="min-width:1060px">
    <thead><tr>
      <th style="min-width:150px">Producto</th>
      <th style="min-width:140px">Descripción</th>
      <th class="num" style="min-width:80px">${isEnt?'Saldo prev.':'Disponible'}</th>
      <th class="num" style="min-width:135px">Cantidad</th>
      <th class="num" style="min-width:135px">${isEnt?'Costo unit.':'Costo PPP'}</th>
      <th class="num" style="min-width:140px">Total</th>
      <th style="min-width:120px">Lote</th>
      <th style="min-width:155px">Vence</th>
      <th class="col-action"></th>
    </tr></thead><tbody>`;
  movDraft.lineas.forEach((l,i)=>{
    const p=l.codigoInterno?getProduct(l.codigoInterno):null;
    const saldo=l.codigoInterno&&bod?(getStock(l.codigoInterno,bod)?.cantidad||0):0;
    const costoSugerido=l.codigoInterno&&bod?(getStock(l.codigoInterno,bod)?.costoPromedio||0):0;
    const cant=Number(l.cantidad)||0;const costo=Number(l.costo)||0;
    total+=cant*costo;
    const lots=p&&p.manejaAtributos&&!isEnt&&bod?STATE.cache.lots.filter(x=>x.codigoInterno===l.codigoInterno&&x.bodegaId===bod&&x.cantidad>0):[];
    html+=`<tr>
      <td><input type="text" placeholder="P000001, EAN o nuevo" value="${escapeHtml(l.codigoInterno||'')}" oninput="mvFiltrarProductos(this.value);updateMovLine(${i},'codigoInterno',this.value);" onblur="resolveProductCode(${i})" list="prodList" autocomplete="off" title="Escriba para buscar; si el código no existe, se ofrecerá crearlo"></td>
      <td>${p?escapeHtml(p.descripcion):'<span style="color:var(--mu)">-</span>'} ${p?'<span style="color:var(--mu);font-size:11px">· '+escapeHtml(p.unidadMedida)+'</span>':''}</td>
      <td class="num" id="mvDisp-${i}" style="color:${saldo>0?'var(--gm)':'var(--mu)'}">${fmtNum(saldo,2)}</td>
      <td><input type="number" step="0.01" class="num" id="mvCant-${i}" value="${l.cantidad||''}" oninput="updateMovLine(${i},'cantidad',this.value);recalcMovTotals();mvChkSaldo(${i})"></td>
      <td><input type="number" step="0.01" class="num" value="${l.costo!=null?l.costo:(isEnt?'':costoSugerido)}" ${isEnt?'':'readonly'} oninput="updateMovLine(${i},'costo',this.value);recalcMovTotals()"></td>
      <td class="num" id="mvLineTot-${i}">${fmtMon(cant*costo)}</td>
      <td>${p&&p.manejaAtributos?
          (isEnt
            ?`<input type="text" value="${escapeHtml(l.lote||'')}" oninput="updateMovLine(${i},'lote',this.value)">`
            :`<select onchange="selectLote(${i},this.value)"><option value="">- Lote -</option>${lots.map(lt=>`<option value="${escapeHtml(lt.id)}" ${l.loteId===lt.id?'selected':''}>${escapeHtml(lt.lote)} (${fmtNum(lt.cantidad,2)})</option>`).join('')}</select>`)
          :'<span style="color:var(--mu);font-size:11px">N/A</span>'}</td>
      <td>${p&&p.manejaAtributos?
          (isEnt
            ?`<input type="date" value="${l.fechaVenc||''}" oninput="updateMovLine(${i},'fechaVenc',this.value)">`
            :`<span class="mono" style="font-size:11px">${l.fechaVenc?fmtDateOnly(l.fechaVenc):'-'}</span>`)
          :'<span style="color:var(--mu);font-size:11px">N/A</span>'}</td>
      <td class="col-action"><button class="btn-row-del" onclick="removeMovLine(${i})">×</button></td>
    </tr>${(isEnt && p && (p.aplicaIEC || p.aplicaILA))?`
    <tr class="mv-imp-row" style="background:#fafbfc">
      <td></td>
      <td colspan="8" style="padding:8px 10px">
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:12px">
          <span style="color:#0854a0;font-weight:700">💲 Impuestos de factura:</span>
          ${p.aplicaIEC?`<label style="display:flex;align-items:center;gap:5px">Específico $<input type="number" step="0.01" class="num" style="width:110px" value="${l.montoEspecifico||''}" placeholder="monto total" oninput="updateMovLine(${i},'montoEspecifico',this.value);recalcMovTotals()"></label>`:''}
          ${p.aplicaILA?`<label style="display:flex;align-items:center;gap:5px">ILA $<input type="number" step="0.01" class="num" style="width:100px" value="${l.montoILA||''}" placeholder="monto total" oninput="updateMovLine(${i},'montoILA',this.value);recalcMovTotals()"></label>`:''}
          <span style="color:var(--mu)">Costo real unit.: <strong style="color:#0a6e2e" id="mvCostoReal-${i}">${fmtMon(calcCostoConImpuestos(costo, cant, l.montoEspecifico, l.montoILA))}</strong></span>
        </div>
      </td>
    </tr>`:''}`;
  });
  html+=`</tbody>
    <tfoot><tr style="background:var(--gp);font-weight:600">
      <td colspan="5" style="padding:10px 9px;text-align:right">Total movimiento:</td>
      <td class="num" id="mvGranTotal" style="padding:10px 9px;color:var(--gd);font-size:15px">${fmtMon(total)}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>
  <datalist id="prodList"></datalist></div>`;

// Puebla el datalist de productos SOLO cuando el usuario ha escrito ≥1 carácter,
// filtrando por código, EAN o descripción. Evita desplegar el catálogo completo.
function mvFiltrarProductos(texto){
  var dl=document.getElementById('prodList'); if(!dl) return;
  var q=(texto||'').trim().toLowerCase();
  if(q.length<1){ dl.innerHTML=''; return; }
  var res=(STATE.cache.products||[]).filter(function(p){
    return String(p.codigoInterno||'').toLowerCase().includes(q)
        || String(p.codigoEAN||'').toLowerCase().includes(q)
        || String(p.descripcion||'').toLowerCase().includes(q);
  }).slice(0,25);
  dl.innerHTML=res.map(function(p){
    return '<option value="'+escapeHtml(p.codigoInterno)+'">'+escapeHtml(p.descripcion)+(p.codigoEAN?(' · '+escapeHtml(p.codigoEAN)):'')+'</option>';
  }).join('');
}
try{ window.mvFiltrarProductos=mvFiltrarProductos; }catch(e){}
  w.innerHTML=html;
  // Marcar de inmediato las líneas que ya exceden el saldo (p. ej. al editar)
  if(movDraft.tipo==='SAL') movDraft.lineas.forEach((l,i)=>mvChkSaldo(i));
}

/* Avisa en vivo si la cantidad de una línea de SALIDA supera el saldo disponible.
   Usa el saldo del lote cuando el producto maneja atributos, y la bodega si no.
   Al editar, la cantidad original del movimiento vuelve a considerarse disponible. */
function mvChkSaldo(i){
  if(!movDraft||movDraft.tipo!=='SAL') return;
  const l=movDraft.lineas[i]; if(!l) return;
  const bod=movDraft.bodegaId;
  const p=l.codigoInterno?getProduct(l.codigoInterno):null;
  const porLote=!!(p&&p.manejaAtributos&&l.loteId);
  let disp=0;
  if(porLote){
    const lt=STATE.cache.lots.find(x=>x.id===l.loteId);
    disp=lt?(Number(lt.cantidad)||0):0;
  }else{
    disp=(l.codigoInterno&&bod)?((getStock(l.codigoInterno,bod)||{}).cantidad||0):0;
  }
  if(movDraft.editId){
    const orig=STATE.cache.movements.find(m=>m.numero===movDraft.editId);
    const dets=(orig&&orig.detalles)||[];
    const od=dets.find(d=>porLote?d.loteId===l.loteId:d.codigoInterno===l.codigoInterno);
    if(od) disp+=Number(od.cantidad)||0;
  }
  const cant=Number(l.cantidad)||0;
  const exceso=cant>disp;
  const inp=document.getElementById('mvCant-'+i);
  const cell=document.getElementById('mvDisp-'+i);
  if(inp){
    if(l.codigoInterno&&bod) inp.setAttribute('max',disp); else inp.removeAttribute('max');
    inp.style.borderColor=exceso?'#c0392b':'';
    inp.style.background=exceso?'#fdecea':'';
    inp.title=exceso?('Excede el saldo disponible '+(porLote?'en el lote':'en la bodega')+': '+fmtNum(disp,2)):'';
  }
  if(cell){
    cell.textContent=fmtNum(disp,2);
    cell.style.color=exceso?'#c0392b':(disp>0?'var(--gm)':'var(--mu)');
    cell.style.fontWeight=exceso?'700':'';
  }
}
try{ window.mvChkSaldo=mvChkSaldo; }catch(e){}
function recalcMovTotals(){
  let total=0;
  const isEnt=movDraft.tipo==='ENT';
  movDraft.lineas.forEach((l,i)=>{
    const t=(Number(l.cantidad)||0)*(Number(l.costo)||0);total+=t;
    const el=document.getElementById('mvLineTot-'+i);if(el)el.textContent=fmtMon(t);
    // Refrescar costo real con impuestos no recuperables (si la línea lo muestra)
    const cr=document.getElementById('mvCostoReal-'+i);
    if(cr&&isEnt){
      cr.textContent=fmtMon(calcCostoConImpuestos(l.costo, l.cantidad, l.montoEspecifico, l.montoILA));
    }
  });
  const gt=document.getElementById('mvGranTotal');if(gt)gt.textContent=fmtMon(total);
}
function addMovLine(){movDraft.lineas.push({});renderMovDetalle()}
function _findEmptyLineIndex(){
  // Busca la primera línea vacía. Si no hay, agrega una y retorna su índice.
  let idx=movDraft.lineas.findIndex(l=>!l||!l.codigoInterno);
  if(idx<0){movDraft.lineas.push({});idx=movDraft.lineas.length-1}
  return idx;
}
function removeMovLine(i){movDraft.lineas.splice(i,1);if(movDraft.lineas.length===0)movDraft.lineas.push({});renderMovDetalle()}
function updateMovLine(i,k,v){movDraft.lineas[i][k]=v}
function resolveProductCode(i){
  const code=(movDraft.lineas[i].codigoInterno||'').trim();
  if(!code)return;
  let p=getProduct(code);
  if(!p){p=STATE.cache.products.find(x=>x.codigoEAN===code)}
  if(p){
    movDraft.lineas[i].codigoInterno=p.codigoInterno;
    if(movDraft.tipo==='SAL'){
      const st=getStock(p.codigoInterno,movDraft.bodegaId);
      movDraft.lineas[i].costo=st?st.costoPromedio:0;
    }
    renderMovDetalle();
  }else{
    // Producto no existe: si tiene permisos para crear, ofrecer crearlo en el momento
    if(can('productos.crear')){
      _captureMovHeader();
      promptCreateProductFromMov(code,i);
    }else{
      toast('Producto no encontrado',code+' — sin permiso para crear','warning');
      movDraft.lineas[i].codigoInterno='';renderMovDetalle();
    }
  }
}

/* ── Modal: "producto no existe, ¿crear ahora?" ── */
function promptCreateProductFromMov(typedCode,lineIndex){
  const isEAN=/^\d{8,14}$/.test(typedCode);
  const isInternalLike=/^P\d+$/i.test(typedCode);
  showModal('Producto no encontrado',
    `<div style="font-size:14px;line-height:1.6">
      <div>El código <strong class="mono" style="color:var(--gd)">${escapeHtml(typedCode)}</strong> no se encontró ni como código interno ni como EAN.</div>
      ${isInternalLike?'<div class="alert alert-warning" style="margin-top:12px;font-size:13px">⚠ Este código tiene formato de código interno (P + dígitos), pero no existe. Si crea un nuevo producto, se le asignará un código auto-generado distinto.</div>':''}
      <div style="margin-top:12px;color:var(--mu);font-size:13px">¿Desea crear un nuevo producto ahora? Los datos del documento, proveedor y otras líneas que ya ingresó se mantendrán intactos.</div>
    </div>`,
    `<button class="btn btn-secondary" id="pcpCancel">Cancelar y borrar</button>
     <button class="btn btn-secondary" id="pcpRetry">Reintentar</button>
     <button class="btn btn-primary" id="pcpCreate">+ Crear producto</button>`,
    'sm');
  // Binding seguro: evita problemas con apóstrofes/comillas en typedCode
  document.getElementById('pcpCancel').onclick=()=>{closeModal();_clearLineCode(lineIndex)};
  document.getElementById('pcpRetry').onclick=()=>closeModal();
  document.getElementById('pcpCreate').onclick=()=>{
    closeModal();
    openProductForm(null,{
      fromMov:true,
      lineIndex,
      prefilledEAN:isEAN?typedCode:'',
      prefilledDesc:isEAN?'':typedCode
    });
  };
}
function _clearLineCode(i){
  if(movDraft.lineas[i])movDraft.lineas[i].codigoInterno='';
  renderMovDetalle();
}
function selectLote(i,loteId){
  const lt=STATE.cache.lots.find(x=>x.id===loteId);
  if(lt){
    movDraft.lineas[i].loteId=loteId;
    movDraft.lineas[i].lote=lt.lote;
    movDraft.lineas[i].fechaVenc=lt.fechaVenc;
    movDraft.lineas[i].costo=lt.costo;
  }else{
    delete movDraft.lineas[i].loteId;movDraft.lineas[i].lote='';movDraft.lineas[i].fechaVenc='';
  }
  renderMovDetalle();
}

async function saveMovimiento(){
  const isEnt=movDraft.tipo==='ENT';
  // Capturar TODO desde el DOM
  _captureMovHeader();

  // Validar tipo de movimiento (clave de todo)
  if(!movDraft.tipoMovimiento){toast('Falta tipo de movimiento',`Seleccione el tipo de ${isEnt?'entrada':'salida'}`,'error');return}
  const cfg=getMovCfg(movDraft.tipo,movDraft.tipoMovimiento);
  if(!cfg){toast('Tipo inválido','El tipo de movimiento seleccionado no es válido','error');return}

  // Validaciones básicas
  if(!movDraft.fecha){toast('Falta fecha','Indique la fecha','error');return}
  if(!movDraft.bodegaId){toast('Falta bodega','Seleccione la bodega','error');return}

  // Bodega destino (traspaso)
  if(cfg.reqBodDest){
    if(!movDraft.bodegaDestinoId){toast('Falta bodega destino','Seleccione la bodega destino','error');return}
    if(movDraft.bodegaDestinoId===movDraft.bodegaId){toast('Bodegas iguales','La bodega destino debe ser distinta a la origen','error');return}
  }

  // Fecha de cosecha (producto cosechado a stock)
  if(cfg.reqFechaCosecha){
    if(!movDraft.fechaCosecha){toast('Falta fecha de cosecha','Indique la fecha de cosecha del producto','error');return}
  }

  // Documento tributario (cuando aplica)
  if(cfg.reqDoc){
    if(!movDraft.tipoDoc){toast('Falta tipo de documento','Seleccione el tipo de documento','error');return}
    if(!movDraft.numeroDoc){toast('Falta número de documento','Ingrese el número del documento','error');return}
    if(movDraft.fechaVencDoc&&movDraft.fechaVencDoc<movDraft.fecha){
      toast('Fecha de vencimiento','La fecha de vencimiento es anterior a la fecha del movimiento','warning');
    }
  }

  // Proveedor (cuando aplica)
  if(cfg.reqProv){
    if(!movDraft.proveedorCodigo){toast('Falta proveedor','Ingrese el código del proveedor (RUT sin DV)','error');return}
    const prov=STATE.cache.providers.find(x=>x.codigo===movDraft.proveedorCodigo);
    if(!prov){toast('Proveedor no existe',`No hay proveedor con código ${movDraft.proveedorCodigo}. Créelo primero.`,'error');return}
    movDraft.proveedorNombre=prov.razonSocial;
    movDraft.proveedor=prov.razonSocial;
  }else{
    movDraft.proveedorCodigo='';movDraft.proveedorNombre='';movDraft.proveedor='';
  }

  // Cliente (cuando aplica)
  if(cfg.reqCli){
    if(!movDraft.clienteCodigo){toast('Falta cliente','Ingrese el código del cliente (RUT sin DV)','error');return}
    const cli=STATE.cache.customers.find(x=>x.codigo===movDraft.clienteCodigo);
    if(!cli){toast('Cliente no existe',`No hay cliente con código ${movDraft.clienteCodigo}. Créelo primero.`,'error');return}
    movDraft.clienteNombre=cli.razonSocial;
    movDraft.destino=cli.razonSocial;
  }else{
    movDraft.clienteCodigo='';movDraft.clienteNombre='';movDraft.destino='';
  }

  // Centro de costo (cuando aplica)
  if(cfg.reqCC){
    if(!movDraft.centroCosto||!movDraft.centroCosto.trim()){toast('Falta centro de costo','Seleccione el centro de costo','error');return}
    movDraft.centroCosto=movDraft.centroCosto.trim().toUpperCase();
    const ccObj=STATE.cache.costCenters.find(c=>c.codigo===movDraft.centroCosto);
    if(!ccObj){toast('Centro de costo no existe',`No hay un centro de costo con código ${movDraft.centroCosto}. Créelo desde el módulo Centros de Costo.`,'error');return}
    if(ccObj.activo===false){toast('Centro de costo inactivo',`El centro ${ccObj.codigo} está inactivo. Actívelo o seleccione otro.`,'error');return}
    movDraft.centroCostoNombre=ccObj.descripcion;
    movDraft.centroCostoArea=ccObj.area||'';
    movDraft.destino=isEnt?'':movDraft.centroCosto; // para legado
    movDraft.proveedor=isEnt?movDraft.centroCosto:movDraft.proveedor;
  }

  // Merma y tomas requieren motivo en observaciones
  if(['MERMA','TOMA INVENTARIO ENT','TOMA INVENTARIO SAL'].includes(movDraft.tipoMovimiento)){
    if(!movDraft.observaciones||!movDraft.observaciones.trim()){
      toast('Falta motivo','Indique el motivo en observaciones','error');return;
    }
  }

  // Documento legado (string display)
  if(cfg.reqDoc){
    movDraft.documento=`${movDraft.tipoDoc} ${movDraft.numeroDoc}`.trim();
  }else{
    movDraft.documento='';
  }

  // Validar unicidad de documento (solo cuando aplica)
  if(cfg.validaUnicidadDoc){
    const refKey=cfg.reqProv?movDraft.proveedorCodigo:movDraft.clienteCodigo;
    const refKeyName=cfg.reqProv?'proveedorCodigo':'clienteCodigo';
    const dup=STATE.cache.movements.find(m=>
      m.tipo===movDraft.tipo && !m.anulado &&
      m.tipoMovimiento===movDraft.tipoMovimiento &&
      m[refKeyName]===refKey &&
      m.tipoDoc===movDraft.tipoDoc &&
      String(m.numeroDoc)===String(movDraft.numeroDoc) &&
      m.numero!==movDraft.editId
    );
    if(dup){
      const refName=cfg.reqProv?movDraft.proveedorNombre:movDraft.clienteNombre;
      toast('Documento duplicado',`Ya existe ${dup.numero}: ${movDraft.tipoDoc} ${movDraft.numeroDoc} de ${refName}. No se puede repetir.`,'error');
      return;
    }
  }
  const lineas=movDraft.lineas.filter(l=>l.codigoInterno&&Number(l.cantidad)>0);
  if(lineas.length===0){toast('Sin productos','Agregue al menos un producto con cantidad','error');return}

  // Devolución a proveedor con NOTA DE CRÉDITO: debe asociarse a una factura del
  // proveedor que contenga el producto; se valida cantidad (no superar lo
  // comprado, descontando devoluciones previas) y el costo se toma de la factura.
  if(movDraft.tipoMovimiento==='DEVOLUCION PROVEEDOR' && movDraft.tipoDoc==='NOTA DE CREDITO'){
    if(!movDraft.facturaAsociada){ toast('Falta factura','La Nota de Crédito debe asociarse a una factura del proveedor','error'); return; }
    const fact=STATE.cache.movements.find(m=>m.numero===movDraft.facturaAsociada && !m.anulado);
    if(!fact){ toast('Factura no válida','La factura asociada no existe o fue anulada','error'); return; }
    if(fact.proveedorCodigo!==movDraft.proveedorCodigo){ toast('Proveedor no coincide','La factura asociada es de otro proveedor','error'); return; }
    for(const l of lineas){
      const pr=getProduct(l.codigoInterno);
      const d=(fact.detalles||[]).find(x=>x.codigoInterno===l.codigoInterno);
      if(!d){ toast('Producto no está en la factura',`${pr?pr.descripcion:l.codigoInterno} no figura en ${fact.tipoDoc} ${fact.numeroDoc}`,'error'); return; }
      const comprada=Number(d.cantidad)||0;
      let prev=0;
      (STATE.cache.movements||[]).forEach(m=>{
        if(m.anulado||m.tipoMovimiento!=='DEVOLUCION PROVEEDOR'||m.facturaAsociada!==fact.numero) return;
        if(movDraft.editId && m.numero===movDraft.editId) return;
        (m.detalles||[]).forEach(x=>{ if(x.codigoInterno===l.codigoInterno) prev+=Number(x.cantidad)||0; });
      });
      if((Number(l.cantidad)||0)+prev > comprada){
        toast('Cantidad excede la factura',`${pr?pr.descripcion:l.codigoInterno}: comprado ${fmtNum(comprada,2)}, ya devuelto ${fmtNum(prev,2)}, solicitado ${fmtNum(Number(l.cantidad)||0,2)}`,'error'); return;
      }
      // Costo desde la factura (revierte bien la valorización).
      l.costo=(d.costoNeto!=null?d.costoNeto:d.costo)||0;
    }
  }

  // Validaciones por línea
  for(const l of lineas){
    const p=getProduct(l.codigoInterno);
    if(!p){toast('Producto inválido',l.codigoInterno,'error');return}
    if(movDraft.tipo==='ENT' && (!l.costo||Number(l.costo)<=0)){
      toast('Costo requerido',`${l.codigoInterno}: indique costo unitario`,'error');return;
    }
    if(p.manejaAtributos){
      if(movDraft.tipo==='ENT'){
        if(!l.lote){toast('Lote requerido',`${l.codigoInterno} maneja atributos. Indique lote.`,'error');return}
        if(!l.fechaVenc){toast('Vencimiento requerido',`${l.codigoInterno} maneja atributos. Indique fecha vencimiento.`,'error');return}
      }else{
        if(!l.loteId){toast('Lote requerido',`${l.codigoInterno} maneja atributos. Seleccione lote.`,'error');return}
      }
    }
    // validar saldos para SALIDA
    if(movDraft.tipo==='SAL'){
      if(p.manejaAtributos){
        const lt=STATE.cache.lots.find(x=>x.id===l.loteId);
        const disp=lt?lt.cantidad:0;
        // si estamos editando, sumar la cantidad original
        let extra=0;
        if(movDraft.editId){
          const orig=STATE.cache.movements.find(m=>m.numero===movDraft.editId);
          const od=(orig?.detalles||[]).find(d=>d.loteId===l.loteId);
          if(od)extra=od.cantidad;
        }
        if(Number(l.cantidad)>(disp+extra)){toast('Saldo insuficiente',`Lote ${l.lote}: disp ${fmtNum(disp,2)}`,'error');return}
      }else{
        const st=getStock(l.codigoInterno,movDraft.bodegaId);
        const disp=st?st.cantidad:0;
        let extra=0;
        if(movDraft.editId){
          const orig=STATE.cache.movements.find(m=>m.numero===movDraft.editId);
          const od=(orig?.detalles||[]).find(d=>d.codigoInterno===l.codigoInterno);
          if(od)extra=od.cantidad;
        }
        if(Number(l.cantidad)>(disp+extra)){toast('Saldo insuficiente',`${l.codigoInterno}: disp ${fmtNum(disp,2)} ${p.unidadMedida}`,'error');return}
      }
    }
  }

  if(movDraft.editId){
    const motivo=document.getElementById('mvMot').value.trim();
    if(!motivo){toast('Falta motivo','Indique motivo de edición','error');return}
    movDraft.motivo=motivo;
  }

  showLoading('Guardando movimiento...');
  try{
    const esEntrada = movDraft.tipo==='ENT';
    const detalles=lineas.map(l=>{
      const p = l.codigoInterno?getProduct(l.codigoInterno):null;
      const netoUnit = Number(l.costo)||0;
      // En entradas, el costo que entra al stock incluye los impuestos NO recuperables
      let costoFinal = netoUnit;
      if(esEntrada && p && (p.aplicaIEC || p.aplicaILA)){
        costoFinal = calcCostoConImpuestos(netoUnit, l.cantidad, l.montoEspecifico, l.montoILA);
      }
      return {
        codigoInterno:l.codigoInterno,
        cantidad:Number(l.cantidad),
        costo:costoFinal,
        costoNeto:netoUnit,
        montoEspecifico:Number(l.montoEspecifico)||0,
        montoILA:Number(l.montoILA)||0,
        lote:l.lote||null,loteId:l.loteId||null,fechaVenc:l.fechaVenc||null
      };
    });

    if(movDraft.editId){
      // Edición: persistir cambios y recalcular stock desde cero
      const old=await dbGet('movements',movDraft.editId);
      // Consumo de combustible: reconstruir el texto de observaciones a partir
      // de los campos dedicados (Equipo/Km/Operador) + nota, y usar el equipo
      // como destino.
      let _obsFinal=movDraft.observaciones, _destFinal=movDraft.destino;
      let _cbEquipoN='', _cbKmN=null, _cbOperadorN='';
      if(movDraft._esComb){
        _cbEquipoN=(typeof normEquipo==='function'?normEquipo(movDraft.cbEquipo):String(movDraft.cbEquipo||'').trim());
        const _k=parseFloat(String(movDraft.cbKm).replace(',','.')); _cbKmN=isNaN(_k)?null:_k;
        _cbOperadorN=String(movDraft.cbOperador||'').trim();
        _obsFinal=`EQUIPO: ${_cbEquipoN} · KM/HR: ${_cbKmN==null?'':_cbKmN} · OPERADOR: ${_cbOperadorN}${movDraft.observaciones?(' · '+movDraft.observaciones):''}`;
        _destFinal=_cbEquipoN||movDraft.destino;
      }
      const updated={...old,
        fecha:movDraft.fecha+'T'+(old.fecha.split('T')[1]||'00:00:00'),
        bodegaId:movDraft.bodegaId,
        documento:movDraft.documento,proveedor:movDraft.proveedor,destino:_destFinal,
        observaciones:_obsFinal,
        detalles,editado:new Date().toISOString(),editadoPor:STATE.user.id,editadoMotivo:movDraft.motivo
      };
      // Tipo de movimiento NO se puede cambiar al editar (mantiene el original)
      if(cfg.reqDoc){
        updated.tipoDoc=movDraft.tipoDoc;
        updated.numeroDoc=movDraft.numeroDoc;
        updated.fechaVencDoc=movDraft.fechaVencDoc||null;
      }
      if(movDraft.tipoMovimiento==='DEVOLUCION PROVEEDOR'){
        if(movDraft.facturaAsociada){
          updated.facturaAsociada=movDraft.facturaAsociada;
          var _faU=STATE.cache.movements.find(x=>x.numero===movDraft.facturaAsociada);
          if(_faU) updated.facturaAsociadaDoc=((_faU.tipoDoc||'')+' '+(_faU.numeroDoc||'')).trim();
        } else { updated.facturaAsociada=''; updated.facturaAsociadaDoc=''; }
      }
      if(cfg.reqProv){
        updated.proveedorCodigo=movDraft.proveedorCodigo;
        updated.proveedorNombre=movDraft.proveedorNombre;
      }
      if(cfg.reqCli){
        updated.clienteCodigo=movDraft.clienteCodigo;
        updated.clienteNombre=movDraft.clienteNombre;
      }
      if(cfg.reqCC){
        updated.centroCosto=movDraft.centroCosto;
        updated.centroCostoNombre=movDraft.centroCostoNombre||'';
        updated.centroCostoArea=movDraft.centroCostoArea||'';
      }
      if(cfg.reqBodDest){
        updated.bodegaDestinoId=movDraft.bodegaDestinoId;
      }
      await dbPut('movements',updated);
      // El registro de `combustible` guarda una COPIA de cantidad y fecha. Si no
      // se actualiza aquí, los informes que lo leen (rendimiento y Control de
      // Heladas) siguen mostrando los valores originales tras editar la salida.
      try{
        const regsComb=(STATE.cache.combustible||[]).filter(r=>r.movNumero===movDraft.editId);
        for(const rc of regsComb){
          const det=(detalles||[]).find(d=>d.codigoInterno===rc.codigoProducto)||detalles[0];
          if(det) rc.cantidad=Number(det.cantidad)||0;
          rc.fecha=updated.fecha;
          rc.bodegaId=updated.bodegaId;
          if(updated.centroCosto) rc.centroCosto=updated.centroCosto;
          // Campos editados desde el formulario de combustible (horómetro, etc.)
          if(movDraft._esComb){
            if(_cbKmN!=null) rc.km=_cbKmN;
            if(_cbEquipoN) rc.equipo=_cbEquipoN;
            if(_cbOperadorN) rc.usuario=_cbOperadorN;
            rc.observaciones=movDraft.observaciones||'';
          }
          await dbPut('combustible',rc);
        }
      }catch(e){ console.error('[SCI] No se pudo sincronizar el registro de combustible:',e); }
      await reloadCache();
      // Recalcular stock desde cero (incluye el cambio recién hecho)
      await _ejecutarRecalculoStock();
      await audit('movimiento.editar',`Edición ${movDraft.editId}: ${movDraft.motivo}`,movDraft.editId);
      hideLoading();
      toast('Movimiento actualizado',`${movDraft.editId} · Stock recalculado`);
      navigate('movimientos');
    }else{
      const numero=await nextCounter(cfg.prefijo);
      const m={
        numero,tipo:movDraft.tipo,
        fecha:movDraft.fecha+'T'+new Date().toTimeString().slice(0,8),
        bodegaId:movDraft.bodegaId,
        documento:movDraft.documento,
        proveedor:movDraft.tipo==='ENT'?movDraft.proveedor:'',
        destino:movDraft.tipo==='SAL'?movDraft.destino:'',
        observaciones:movDraft.observaciones,
        detalles,
        usuario:STATE.user.id,
        creado:new Date().toISOString(),
        anulado:false
      };
      // Tipo de movimiento (motivo) y campos contextuales
      m.tipoMovimiento=movDraft.tipoMovimiento;
      if(cfg.reqFechaCosecha){
        m.fechaCosecha=movDraft.fechaCosecha||null;
      }
      if(cfg.reqDoc){
        m.tipoDoc=movDraft.tipoDoc;
        m.numeroDoc=movDraft.numeroDoc;
        m.fechaVencDoc=movDraft.fechaVencDoc||null;
      }
      if(movDraft.tipoMovimiento==='DEVOLUCION PROVEEDOR' && movDraft.facturaAsociada){
        m.facturaAsociada=movDraft.facturaAsociada;
        var _fa=STATE.cache.movements.find(x=>x.numero===movDraft.facturaAsociada);
        if(_fa) m.facturaAsociadaDoc=((_fa.tipoDoc||'')+' '+(_fa.numeroDoc||'')).trim();
      }
      if(cfg.reqProv){
        m.proveedorCodigo=movDraft.proveedorCodigo;
        m.proveedorNombre=movDraft.proveedorNombre;
      }
      if(cfg.reqCli){
        m.clienteCodigo=movDraft.clienteCodigo;
        m.clienteNombre=movDraft.clienteNombre;
      }
      if(cfg.reqCC){
        m.centroCosto=movDraft.centroCosto;
        m.centroCostoNombre=movDraft.centroCostoNombre||'';
        m.centroCostoArea=movDraft.centroCostoArea||'';
      }
      if(cfg.reqBodDest){
        m.bodegaDestinoId=movDraft.bodegaDestinoId;
      }
      // Validar saldo suficiente en bodega para SALIDAS (no traspasos, que tienen su propia lógica)
      if(m.tipo==='SAL' && m.tipoMovimiento!=='TRASPASO BODEGA'){
        var insuficientes=[];
        for(var _vi=0;_vi<m.detalles.length;_vi++){
          var _d=m.detalles[_vi];
          var _st=getStock(_d.codigoInterno, m.bodegaId);
          var _disp=_st?_st.cantidad:0;
          if(_d.cantidad>_disp){
            var _pn=getProduct(_d.codigoInterno);
            insuficientes.push((_pn?_pn.descripcion:_d.codigoInterno)+': disponible '+fmtNum(_disp,2)+', solicitado '+fmtNum(_d.cantidad,2));
          }
        }
        if(insuficientes.length>0){
          toast('Saldo insuficiente','No se puede rebajar más de lo disponible en bodega:\n'+insuficientes.join('\n'),'error');
          return;
        }
      }
      await dbPut('movements',m);
      // Confirmación de persistencia: releer de IndexedDB para asegurar que quedó guardado.
      var _verif = await dbGet('movements', numero);
      if(!_verif){
        hideLoading();
        toast('⚠ No se guardó','El movimiento no pudo persistirse. Reintente o revise el almacenamiento.','error');
        return;
      }
      // Reconstruir el stock desde TODOS los movimientos (mismo criterio que la
      // verificación de consistencia). Evita divergencias del cálculo incremental
      // cuando se registran movimientos con fecha retroactiva o tras un sync.
      STATE.cache.movements = await dbAll('movements');
      await _ejecutarRecalculoStock();
      await audit('movimiento.crear',`${tipoLabel(m.tipo)} ${numero}`,numero);
      // Si la salida vino de una confirmación del Cuaderno, marcarla como dada de baja.
      try{
        if(movDraft._origenConfirmacion && typeof S!=='undefined' && Array.isArray(S.confirmaciones)){
          var oc=movDraft._origenConfirmacion;
          var conf=null;
          // localizar por ordenId + índice del producto, o por ordenId solo
          var candidatas=S.confirmaciones.filter(function(c){ return String(c.ordenId)===String(oc.ordenId); });
          conf = candidatas[parseInt(oc.idx,10)] || candidatas[0] || null;
          if(conf){
            if(!conf.bajasBodega) conf.bajasBodega={};
            conf.bajasBodega[oc.productoNombre]=numero; // guarda el N° de movimiento
            if(typeof save==='function') save();        // persiste el Cuaderno (localStorage + Firebase)
          }
        }
      }catch(e){ console.warn('No se pudo marcar la confirmación:', e); }
      await reloadCache();
      hideLoading();
      toast(`${tipoLabel(m.tipo)} registrada`,numero);
      navigate('movimientos');
    }
  }catch(e){hideLoading();toast('Error',e.message,'error');console.error(e)}
}

/* ═══════════════ COSTING ENGINE ═══════════════ */
/* Reglas:
   - ENTRADA: actualiza PPP de la bodega y crea/sumar lote si maneja atributos.
     PPP_new = (cant_actual*PPP_actual + cant_entr*costo_entr) / (cant_actual + cant_entr)
   - SALIDA:  decrementa stock con costo PPP de la bodega.
              Si maneja atributos, decrementa lote específico.
   - Reverse: opera contrario para anular/editar.
*/
async function applyMovementToStock(m,isReverse=false){
  // TRASPASO BODEGA: tratar como SAL+ENT atómica entre bodegas
  if(m.tipoMovimiento==='TRASPASO BODEGA'&&m.bodegaDestinoId){
    return _applyTraspasoBodega(m,isReverse);
  }
  for(const d of m.detalles){
    const key=stockKey(d.codigoInterno,m.bodegaId);
    let st=await dbGet('stock',key);
    if(!st)st={key,codigoInterno:d.codigoInterno,bodegaId:m.bodegaId,cantidad:0,costoPromedio:0};
    const p=getProduct(d.codigoInterno);

    const tipoEfec=isReverse?(m.tipo==='ENT_REVERSE'?'ENT':'SAL'):m.tipo;
    // ENT_REVERSE means: undo an entry → behave like a salida (decrease) but do NOT change PPP
    // SAL_REVERSE means: undo a salida → behave like an entrada (increase) but at the cost it left
    if(isReverse){
      if(m.tipo==='ENT_REVERSE'){
        // revertir entrada → restar cantidad y monto. Recalcular PPP si queda saldo.
        const valorAct=st.cantidad*st.costoPromedio;
        const valorRev=d.cantidad*d.costo;
        const newCant=Math.max(0,st.cantidad-d.cantidad);
        const newValor=Math.max(0,valorAct-valorRev);
        st.cantidad=newCant;
        st.costoPromedio=newCant>0?(newValor/newCant):0;
        if(p?.manejaAtributos&&d.lote){
          // decrementar lote
          const lots=await dbAll('lots');
          const lot=lots.find(l=>l.codigoInterno===d.codigoInterno&&l.bodegaId===m.bodegaId&&l.lote===d.lote);
          if(lot){
            lot.cantidad=Math.max(0,lot.cantidad-d.cantidad);
            await dbPut('lots',lot);
          }
        }
      }else if(m.tipo==='SAL_REVERSE'){
        // revertir salida → sumar cantidad al costo que tenía. Mantener PPP (al ser reversal exacto)
        const valorAct=st.cantidad*st.costoPromedio;
        const newCant=st.cantidad+d.cantidad;
        const newValor=valorAct+d.cantidad*d.costo;
        st.cantidad=newCant;
        st.costoPromedio=newCant>0?(newValor/newCant):d.costo;
        if(p?.manejaAtributos&&d.lote){
          // Buscar el lote por (codigo, bodega, lote) — más robusto que loteId
          const lots=await dbAll('lots');
          let lot=lots.find(l=>l.codigoInterno===d.codigoInterno&&l.bodegaId===m.bodegaId&&l.lote===d.lote);
          if(lot){
            lot.cantidad+=d.cantidad;
            await dbPut('lots',lot);
          }else{
            // Crear el lote si no existe (caso edge: lote borrado por agotamiento total)
            const lid=uid();
            lot={id:lid,codigoInterno:d.codigoInterno,bodegaId:m.bodegaId,lote:d.lote,fechaVenc:d.fechaVenc||'',cantidad:d.cantidad,costo:d.costo};
            await dbPut('lots',lot);
          }
        }
      }
    }else{
      if(tipoEfec==='ENT'){
        const valorAct=st.cantidad*st.costoPromedio;
        const newCant=st.cantidad+d.cantidad;
        const newValor=valorAct+d.cantidad*d.costo;
        st.cantidad=newCant;
        st.costoPromedio=newCant>0?(newValor/newCant):d.costo;
        if(p?.manejaAtributos){
          // crear o sumar a lote
          const lots=await dbAll('lots');
          let lot=lots.find(l=>l.codigoInterno===d.codigoInterno&&l.bodegaId===m.bodegaId&&l.lote===d.lote);
          if(lot){
            // promediar costo del lote también
            const va=lot.cantidad*lot.costo;
            lot.cantidad+=d.cantidad;
            lot.costo=lot.cantidad>0?(va+d.cantidad*d.costo)/lot.cantidad:d.costo;
            // actualizar fecha venc si cambia (mantiene la antigua)
            await dbPut('lots',lot);
            d.loteId=lot.id;
          }else{
            const lid=uid();
            lot={id:lid,codigoInterno:d.codigoInterno,bodegaId:m.bodegaId,lote:d.lote,fechaVenc:d.fechaVenc,cantidad:d.cantidad,costo:d.costo};
            await dbPut('lots',lot);
            d.loteId=lid;
          }
        }
      }else if(tipoEfec==='SAL'){
        // SALIDA: usa costoPromedio de la bodega (NO cambia)
        st.cantidad-=d.cantidad;
        if(st.cantidad<0)st.cantidad=0; // safety
        // d.costo ya viene del PPP en pantalla
        if(p?.manejaAtributos&&d.loteId){
          let lot=await dbGet('lots',d.loteId);
          if(lot){lot.cantidad-=d.cantidad;if(lot.cantidad<0)lot.cantidad=0;await dbPut('lots',lot)}
        }
      }
    }
    await dbPut('stock',st);
  }
}

/* ── Traspaso entre bodegas: salida del origen + entrada al destino al mismo costo ── */
async function _applyTraspasoBodega(m,isReverse=false){
  for(const d of m.detalles){
    const keyOrig=stockKey(d.codigoInterno,m.bodegaId);
    const keyDest=stockKey(d.codigoInterno,m.bodegaDestinoId);
    let stOrig=await dbGet('stock',keyOrig);
    let stDest=await dbGet('stock',keyDest);
    if(!stOrig)stOrig={key:keyOrig,codigoInterno:d.codigoInterno,bodegaId:m.bodegaId,cantidad:0,costoPromedio:0};
    if(!stDest)stDest={key:keyDest,codigoInterno:d.codigoInterno,bodegaId:m.bodegaDestinoId,cantidad:0,costoPromedio:0};
    const p=getProduct(d.codigoInterno);

    if(!isReverse){
      // Aplicar traspaso: sale del origen, entra al destino al mismo costo
      stOrig.cantidad-=d.cantidad;
      if(stOrig.cantidad<0)stOrig.cantidad=0;
      // PPP del origen no cambia (sale al costo promedio actual)
      // Destino: PPP nuevo = (cant_dest*PPP_dest + cant_in*costo_in) / (cant_dest+cant_in)
      const valActDest=stDest.cantidad*stDest.costoPromedio;
      const newCantDest=stDest.cantidad+d.cantidad;
      const newValDest=valActDest+d.cantidad*d.costo;
      stDest.cantidad=newCantDest;
      stDest.costoPromedio=newCantDest>0?(newValDest/newCantDest):d.costo;
      // Lotes: mover del origen al destino (si maneja atributos)
      if(p?.manejaAtributos&&d.loteId){
        const lots=await dbAll('lots');
        const lotOrig=lots.find(l=>l.id===d.loteId);
        if(lotOrig){
          lotOrig.cantidad-=d.cantidad;if(lotOrig.cantidad<0)lotOrig.cantidad=0;
          await dbPut('lots',lotOrig);
          // Buscar lote destino con mismo número de lote+producto+bodegaDest
          let lotDest=lots.find(l=>l.codigoInterno===d.codigoInterno&&l.bodegaId===m.bodegaDestinoId&&l.lote===d.lote);
          if(lotDest){
            const va=lotDest.cantidad*lotDest.costo;
            lotDest.cantidad+=d.cantidad;
            lotDest.costo=lotDest.cantidad>0?(va+d.cantidad*d.costo)/lotDest.cantidad:d.costo;
            await dbPut('lots',lotDest);
            d.loteIdDest=lotDest.id;
          }else{
            const lid=uid();
            lotDest={id:lid,codigoInterno:d.codigoInterno,bodegaId:m.bodegaDestinoId,lote:d.lote,fechaVenc:lotOrig.fechaVenc||d.fechaVenc,cantidad:d.cantidad,costo:d.costo};
            await dbPut('lots',lotDest);
            d.loteIdDest=lid;
          }
        }
      }
    }else{
      // Revertir traspaso: deshacer destino, sumar de vuelta al origen
      const valActDest=stDest.cantidad*stDest.costoPromedio;
      const valRev=d.cantidad*d.costo;
      stDest.cantidad-=d.cantidad;if(stDest.cantidad<0)stDest.cantidad=0;
      const newValDest=valActDest-valRev;
      stDest.costoPromedio=stDest.cantidad>0?(newValDest/stDest.cantidad):0;
      stOrig.cantidad+=d.cantidad;
      // Lotes
      if(p?.manejaAtributos){
        const lots=await dbAll('lots');
        if(d.loteIdDest){
          const lotDest=lots.find(l=>l.id===d.loteIdDest);
          if(lotDest){lotDest.cantidad-=d.cantidad;if(lotDest.cantidad<0)lotDest.cantidad=0;await dbPut('lots',lotDest)}
        }
        if(d.loteId){
          const lotOrig=lots.find(l=>l.id===d.loteId);
          if(lotOrig){lotOrig.cantidad+=d.cantidad;await dbPut('lots',lotOrig)}
        }
      }
    }
    await dbPut('stock',stOrig);
    await dbPut('stock',stDest);
  }
}

async function exportMovimientosExcel(){
  const data=[];
  STATE.cache.movements.forEach(m=>{
    const b=getWarehouse(m.bodegaId);
    (m.detalles||[]).forEach(d=>{
      const p=getProduct(d.codigoInterno);
      const bDest=m.bodegaDestinoId?getWarehouse(m.bodegaDestinoId):null;
      data.push({
        'N°':m.numero,'Tipo':tipoLabel(m.tipo),'Tipo Movimiento':tipoMovLabel(m),
        'Fecha':fmtDate(m.fecha),
        'Fecha Cosecha':m.fechaCosecha?fmtDateOnly(m.fechaCosecha):'',
        'Bodega':b?.nombre||'',
        'Bodega Destino':bDest?.nombre||'',
        'Centro Costo':m.centroCosto||'',
        'CC Descripción':m.centroCostoNombre||'',
        'CC Área':m.centroCostoArea||'',
        'Tipo Doc':m.tipoDoc||'','N° Doc':m.numeroDoc||'','Venc. Doc':m.fechaVencDoc||'',
        'Cod. Proveedor':m.proveedorCodigo||'','Cod. Cliente':m.clienteCodigo||'',
        'Documento':m.documento||'',
        'Proveedor/Cliente':m.proveedorNombre||m.clienteNombre||m.proveedor||m.destino||'',
        'Código':d.codigoInterno,'Descripción':p?.descripcion||'','UM':p?.unidadMedida||'',
        'Cantidad':d.cantidad,'Costo':d.costo,'Total':d.cantidad*d.costo,
        'Lote':d.lote||'','Vencimiento':d.fechaVenc?fmtDateOnly(d.fechaVenc):'',
        'Estado':m.anulado?'ANULADO':'VIGENTE','Usuario':m.usuario||''
      });
    });
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Movimientos');
  XLSX.writeFile(wb,`Movimientos_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══════════════ PAGE: USUARIOS ═══════════════ */
function renderUsuarios(c){
  c.innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Usuarios</div><div class="page-subtitle">${STATE.cache.users.length} usuario(s) · Permisos por rol y específicos</div></div>
      ${can('usuarios.crear')?`<button class="btn btn-primary" onclick="openUserForm()">+ Nuevo Usuario</button>`:''}
    </div>
    <div class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Rol</th><th class="num">Permisos</th><th class="center">Estado</th><th>Creado</th><th class="actions">Acciones</th></tr></thead>
        <tbody>${STATE.cache.users.map(u=>`<tr>
          <td class="mono"><strong>${u.id}</strong></td>
          <td>${escapeHtml(u.nombre||'-')}</td>
          <td>${u.email?escapeHtml(u.email):'<span class="badge badge-red">sin correo</span>'}</td>
          <td><span class="badge ${u.role==='admin'?'badge-gold':(u.role==='gerente'?'badge-gold':(u.role==='agronomo'?'badge-blue':(u.role==='operador'?'badge-blue':'badge-gray')))}">${ROLE_LABELS[u.role]||u.role}</span></td>
          <td class="num">${(u.permissions||[]).length}/${PERMISSIONS.length}</td>
          <td class="center">${u.activo?'<span class="badge badge-green">Activo</span>':'<span class="badge badge-red">Inactivo</span>'}</td>
          <td>${u.creado?fmtDateOnly(u.creado):'-'}</td>
          <td class="actions">${can('usuarios.crear')?`<button class="btn btn-secondary btn-sm" onclick="openUserForm('${u.id}')">Editar</button>`:''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}
function openUserForm(id=null){
  const u=id?STATE.cache.users.find(x=>x.id===id):null;
  const isMe=u&&u.id===STATE.user.id;
  showModal(u?`Editar usuario · ${u.id}`:'Nuevo usuario',
    `<div class="form-grid">
      <div class="form-field required"><label>Usuario (ID)</label><input type="text" id="fuId" value="${u?u.id:''}" ${u?'readonly':''} maxlength="20"><div class="hint">Sin espacios. Se convertirá a minúsculas.</div></div>
      <div class="form-field required"><label>Nombre completo</label><input type="text" id="fuNom" value="${escapeHtml(u?.nombre||'')}"></div>
      <div class="form-field span-2 required"><label>Correo de acceso</label><input type="email" id="fuEmail" data-nouppercase autocapitalize="off" spellcheck="false" value="${escapeHtml(u?.email||'')}" placeholder="correo@forestallacabana.cl"><div class="hint">Debe coincidir EXACTO con el correo creado en Firebase. Con este correo inicia sesión.</div></div>
      <div class="form-field required"><label>Rol</label><select id="fuRole" onchange="loadRolePerms()">
        <option value="admin" ${u?.role==='admin'?'selected':''}>Administrador</option>
        <option value="gerente" ${u?.role==='gerente'?'selected':''}>Gerente</option>
        <option value="agronomo" ${u?.role==='agronomo'?'selected':''}>Admin. Agrónomo</option>
        <option value="operador" ${u?.role==='operador'?'selected':''}>Operador</option>
        <option value="consulta" ${u?.role==='consulta'?'selected':''}>Consulta</option>
        <option value="opconteos" ${u?.role==='opconteos'?'selected':''}>OP. CONTEOS (terreno)</option>
        <option value="opcombustible" ${u?.role==='opcombustible'?'selected':''}>OP. COMBUSTIBLE (salida petróleo)</option>
      </select></div>
      <div class="form-field"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="fuActivo" ${!u||u.activo?'checked':''} ${isMe?'disabled':''}><span class="switch-slider"></span></span>
          <span>${isMe?'No puedes desactivarte':'Activo'}</span>
        </label>
      </div>
      <div class="form-field span-2"><label>Contraseña</label><input type="password" id="fuPass" placeholder="Se gestiona en Firebase" disabled><div class="hint">⚠ La contraseña ya NO se define aquí. Se crea y cambia en Firebase Console → Authentication, con el correo de acceso de arriba.</div></div>
      <div class="form-field span-2"><label>Permisos específicos</label>
        <div class="checkbox-group" id="fuPerms">
          ${PERMISSIONS.map(([p,lbl])=>`<label><input type="checkbox" value="${p}" ${(u?.permissions||[]).includes(p)?'checked':''}> ${lbl}</label>`).join('')}
        </div>
        <div class="hint">Cambia el rol para auto-marcar los permisos típicos</div>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveUser(${u?`'${u.id}'`:'null'})">${u?'Guardar':'Crear usuario'}</button>`,
    'lg');
}
function loadRolePerms(){
  const role=document.getElementById('fuRole').value;
  const perms=ROLE_PERMS[role]||[];
  document.querySelectorAll('#fuPerms input').forEach(cb=>{cb.checked=perms.includes(cb.value)});
}
async function saveUser(id){
  const idVal=(id||document.getElementById('fuId').value.trim().toLowerCase());
  if(!idVal){toast('Falta usuario','Indique ID','error');return}
  if(!/^[a-z0-9_.-]+$/.test(idVal)){toast('ID inválido','Solo letras, números, . _ -','error');return}
  const nom=document.getElementById('fuNom').value.trim();
  if(!nom){toast('Falta nombre','Indique nombre','error');return}
  const email=(document.getElementById('fuEmail').value||'').trim().toLowerCase();
  if(!email){toast('Falta correo','Indique el correo de acceso','error');return}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Correo inválido','Revise el formato del correo','error');return}
  const role=document.getElementById('fuRole').value;
  const activo=document.getElementById('fuActivo').checked;
  const perms=Array.from(document.querySelectorAll('#fuPerms input:checked')).map(c=>c.value);

  let u=id?await dbGet('users',idVal):null;
  if(!id&&await dbGet('users',idVal)){toast('Usuario duplicado','Ya existe','error');return}
  try{
    const todos=await dbAll('users');
    const choca=(todos||[]).find(x=>x && x.id!==idVal && String(x.email||'').trim().toLowerCase()===email);
    if(choca){toast('Correo en uso',`Ya lo usa el usuario "${choca.id}"`,'error');return}
  }catch(e){}

  if(!u)u={id:idVal,creado:new Date().toISOString()};
  u.nombre=nom;u.email=email;u.role=role;u.activo=activo;u.permissions=perms;
  await dbPut('users',u);
  await audit(id?'usuario.editar':'usuario.crear',nom,idVal);
  await reloadCache();
  closeModal();
  toast(id?'Usuario actualizado':'Usuario creado');
  renderUsuarios(document.getElementById('mainContent'));
}

/* ═══════════════ PAGE: CONFIG ═══════════════ */

// ══════════════════════════════════════════════════════════════════
//  EMPRESA: gestión de datos de la empresa (solo admin)
// ══════════════════════════════════════════════════════════════════
function renderEmpresaDisplay(){
  const emp = (STATE.cache.config && STATE.cache.config.empresa) || {};
  const hasData = emp.nombre || emp.rut || emp.direccion || emp.giro || emp.telefono || emp.correo;
  if(!hasData){
    return `<div class="empty-state" style="padding:24px"><div class="empty-state-text">Sin datos configurados</div><div style="font-size:12px;color:var(--mu);margin-top:6px">Click en "Editar" para agregar el nombre de la empresa, RUT, logo y datos de contacto.</div></div>`;
  }
  return `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start">
      <div style="text-align:center">
        ${emp.logo ? 
          `<img src="${emp.logo}" alt="Logo" style="max-width:140px;max-height:140px;object-fit:contain;border:1px solid var(--bo);border-radius:8px;padding:6px;background:#fff">` :
          `<div style="width:140px;height:140px;background:linear-gradient(135deg,#354a5f,#0854a0);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#d1e8ff;font-size:48px;font-weight:700">📊</div>`}
        <div style="font-size:11px;color:var(--mu);margin-top:6px">Logo de la empresa</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        ${emp.nombre?`<div><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">Nombre</div><div style="font-weight:600;color:var(--gd);font-size:15px">${escapeHtml(emp.nombre)}</div></div>`:''}
        ${emp.rut?`<div><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">RUT</div><div style="font-weight:600">${escapeHtml(emp.rut)}</div></div>`:''}
        ${emp.giro?`<div><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">Giro</div><div>${escapeHtml(emp.giro)}</div></div>`:''}
        ${emp.direccion?`<div style="grid-column:span 2"><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">Dirección</div><div>${escapeHtml(emp.direccion)}</div></div>`:''}
        ${emp.telefono?`<div><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">Teléfono</div><div>${escapeHtml(emp.telefono)}</div></div>`:''}
        ${emp.correo?`<div><div style="font-size:10px;color:var(--mu);text-transform:uppercase;font-weight:700">Correo</div><div><a href="mailto:${escapeHtml(emp.correo)}" style="color:var(--gd)">${escapeHtml(emp.correo)}</a></div></div>`:''}
      </div>
    </div>`;
}

function openEmpresaForm(){
  if(!can('config.editar')){ toast('Sin permiso', 'Solo administradores pueden editar los datos de la empresa', 'error'); return; }
  const emp = (STATE.cache.config && STATE.cache.config.empresa) || {};
  const m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  m.innerHTML = `
    <div class="modal" style="background:#fff;border-radius:10px;max-width:680px;width:100%;max-height:96vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div class="modal-header" style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:15px">🏢 Datos de la Empresa</div>
        <button onclick="this.closest('.modal-backdrop').remove()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>
      </div>
      <div class="modal-body" style="padding:18px 20px;overflow-y:auto;flex:1">
        <!-- Logo upload -->
        <div style="margin-bottom:18px;text-align:center">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:6px">Logo de la empresa</div>
          <div id="empresaLogoPreview" style="display:inline-block;margin-bottom:8px">
            ${emp.logo ? 
              `<img src="${emp.logo}" alt="Logo actual" style="max-width:160px;max-height:160px;object-fit:contain;border:1px solid var(--bo);border-radius:8px;padding:6px;background:#fff">` :
              `<div style="width:160px;height:160px;background:#fafafa;border:2px dashed #d9d9d9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:36px">🖼️</div>`}
          </div>
          <div style="font-size:11px;color:var(--mu);margin-bottom:8px">El logo se redimensionará automáticamente</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <input type="file" id="empresaLogoFile" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="handleLogoUpload(this.files[0])">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('empresaLogoFile').click()">📤 Subir logo</button>
            ${emp.logo?`<button class="btn btn-secondary btn-sm" onclick="removeLogoPreview()" style="color:#8B1A1A;border-color:#8B1A1A">🗑️ Quitar logo</button>`:''}
          </div>
        </div>

        <!-- Campos de datos -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="grid-column:span 2">
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">Nombre de la empresa</label>
            <input type="text" id="empresaNombre" value="${escapeHtml(emp.nombre||'')}" placeholder="Ej: Mi Empresa Ltda." style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">RUT</label>
            <input type="text" id="empresaRut" value="${escapeHtml(emp.rut||'')}" placeholder="Ej: 77.123.456-7" style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">Giro</label>
            <input type="text" id="empresaGiro" value="${escapeHtml(emp.giro||'')}" placeholder="Ej: Servicios forestales" style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div style="grid-column:span 2">
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">Dirección</label>
            <input type="text" id="empresaDireccion" value="${escapeHtml(emp.direccion||'')}" placeholder="Ej: Av. Ejemplo 123, Comuna, Ciudad" style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">Teléfono</label>
            <input type="text" id="empresaTelefono" value="${escapeHtml(emp.telefono||'')}" placeholder="Ej: +56 9 1234 5678" style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">Correo electrónico</label>
            <input type="email" id="empresaCorreo" value="${escapeHtml(emp.correo||'')}" placeholder="contacto@empresa.cl" style="width:100%;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
          </div>
          <div style="grid-column:span 2;border-top:1px solid var(--bo);margin-top:6px;padding-top:12px">
            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:4px">⛽ Recuperación del impuesto específico (%)</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" step="0.01" min="0" max="100" id="empresaRecupIEC" value="${emp.recupIEC!=null?emp.recupIEC:100}" style="width:120px;padding:9px 12px;border:1px solid var(--bo);border-radius:5px;font-size:13px;box-sizing:border-box">
              <span style="font-weight:700;color:var(--mu)">%</span>
            </div>
            <div style="font-size:11px;color:var(--mu);margin-top:4px">% del impuesto específico (diésel, etc.) que la empresa puede recuperar según su giro. La parte NO recuperada se considera costo en los consumos por centro de costo. Ej: forestal/agrícola normalmente 100%, pero por circular SII puede ser temporalmente menor (ej. 31% hasta 31-oct).</div>
          </div>
        </div>
        <div id="empresaFormErr" style="display:none;background:#fee;color:#8B1A1A;padding:8px 12px;border-radius:5px;margin-top:10px;font-size:12px"></div>
      </div>
      <div class="modal-footer" style="padding:12px 20px;background:#fafafa;border-top:1px solid var(--bo);display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveEmpresaForm()">💾 Guardar cambios</button>
      </div>
    </div>`;
  // Stash temporal del nuevo logo (si se sube)
  m._newLogo = emp.logo || '';
  document.body.appendChild(m);
}

// Maneja la subida de logo: redimensiona en canvas a max 200x60 manteniendo aspect ratio
function handleLogoUpload(file){
  if(!file) return;
  const modal = document.querySelector('.modal-backdrop');
  if(!modal) return;
  // Validar tipo
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){
    toast('Formato no válido', 'Solo se permiten imágenes PNG, JPEG o WebP', 'error');
    return;
  }
  // Validar tamaño (máximo 2MB de entrada)
  if(file.size > 2*1024*1024){
    toast('Archivo muy grande', 'El logo debe pesar menos de 2MB. Se redimensionará automáticamente al guardar.', 'warning');
  }
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // Redimensionar: máximo 200x80 manteniendo aspect ratio
      const maxW = 200, maxH = 80;
      let w = img.width, h = img.height;
      if(w > maxW || h > maxH){
        const ratio = Math.min(maxW/w, maxH/h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // Convertir con compresión; si queda pesado, bajar calidad hasta <60 KB
      let dataUrl = canvas.toDataURL('image/png');
      if(dataUrl.length > 60*1024){
        let q = 0.85;
        do{
          dataUrl = canvas.toDataURL('image/jpeg', q);
          q -= 0.15;
        } while(dataUrl.length > 60*1024 && q > 0.2);
      }
      modal._newLogo = dataUrl;
      const preview = document.getElementById('empresaLogoPreview');
      if(preview){
        preview.innerHTML = `<img src="${dataUrl}" alt="Logo nuevo" style="max-width:160px;max-height:160px;object-fit:contain;border:1px solid var(--bo);border-radius:8px;padding:6px;background:#fff">`;
      }
      toast('Logo cargado', `Redimensionado a ${w}×${h}px (${Math.round(dataUrl.length/1024)} KB)`, 'success');
    };
    img.onerror = function(){ toast('Error', 'No se pudo leer la imagen', 'error'); };
    img.src = e.target.result;
  };
  reader.onerror = function(){ toast('Error', 'No se pudo leer el archivo', 'error'); };
  reader.readAsDataURL(file);
}

function removeLogoPreview(){
  const modal = document.querySelector('.modal-backdrop');
  if(!modal) return;
  modal._newLogo = '';
  const preview = document.getElementById('empresaLogoPreview');
  if(preview){
    preview.innerHTML = `<div style="width:160px;height:160px;background:#fafafa;border:2px dashed #d9d9d9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:36px">🖼️</div>`;
  }
}

async function saveEmpresaForm(){
  if(!can('config.editar')){ toast('Sin permiso', 'Solo administradores pueden editar', 'error'); return; }
  const modal = document.querySelector('.modal-backdrop');
  if(!modal) return;
  const err = document.getElementById('empresaFormErr');
  const setErr = (msg) => { err.style.display=''; err.textContent=msg; };

  const nombre = document.getElementById('empresaNombre').value.trim();
  const rut = document.getElementById('empresaRut').value.trim();
  const direccion = document.getElementById('empresaDireccion').value.trim();
  const giro = document.getElementById('empresaGiro').value.trim();
  const telefono = document.getElementById('empresaTelefono').value.trim();
  const correo = document.getElementById('empresaCorreo').value.trim();
  const recupIECEl = document.getElementById('empresaRecupIEC');
  let recupIEC = recupIECEl ? (parseFloat(recupIECEl.value)) : 100;
  if(isNaN(recupIEC)) recupIEC = 100;
  recupIEC = Math.max(0, Math.min(100, recupIEC));  // acotar 0-100
  const logo = modal._newLogo || '';

  // Validación mínima: si hay correo, debe ser válido
  if(correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
    setErr('El correo electrónico no tiene un formato válido'); return;
  }

  try {
    const empresaData = {key:'empresa', nombre, rut, direccion, giro, telefono, correo, logo, recupIEC};
    await dbPut('config', empresaData);
    // Actualizar cache
    if(STATE.cache.config){ STATE.cache.config.empresa = empresaData; }
    // Aplicar branding inmediatamente
    await applyCompanyBranding();
    // Auditoría
    try { await audit('config.empresa.update', 'Datos de empresa actualizados'); } catch(e){}
    toast('Guardado', 'Datos de empresa actualizados correctamente', 'success');
    modal.remove();
    // Recargar la pestaña de configuración (necesita el contenedor principal)
    const cont = document.getElementById('mainContent');
    if(typeof renderConfig === 'function' && cont){ renderConfig(cont); }
  } catch(ex){
    setErr('Error al guardar: ' + ex.message);
  }
}

/* ═══════════════ INDICADORES DIARIOS (config) ═══════════════ */
/* Estructura persistida en store 'config' con key 'indicadoresDiarios':
   { key:'indicadoresDiarios',
     temporadas:{ '2025-2026':{ MAYO:{usd,utm,uf}, ... }, '2026-2027':{...} } }
   Una temporada va de MAYO de un año a ABRIL del año siguiente.
   Compatibilidad: si existe el campo antiguo 'meses' (sin año), se migra a la
   temporada 2025-2026. */
var PZ_MESES_TEMP = ['MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO','FEBRERO','MARZO','ABRIL'];
// Temporada activa que se está editando/visualizando en la tabla.
var _indicTempActiva = null;

/* Devuelve el código de temporada ('AAAA-BBBB') al que pertenece un mes/año.
   Mayo–Diciembre pertenecen a la temporada que empieza ese año; Enero–Abril
   pertenecen a la temporada que empezó el año anterior. */
function temporadaDeMesAnio(mes, anio){
  var idx = PZ_MESES_TEMP.indexOf(String(mes).toUpperCase().trim());
  anio = parseInt(anio,10);
  if(isNaN(anio)) return null;
  // idx 0..7 = MAYO..DICIEMBRE (inicio de temporada); 8..11 = ENERO..ABRIL (año siguiente)
  var inicio = (idx>=8) ? (anio-1) : anio;
  return inicio + '-' + (inicio+1);
}
/* Temporada actual según la fecha de hoy. */
function temporadaActual(){
  var hoy = new Date();
  var m = hoy.getMonth(); // 0=ene..11=dic
  var y = hoy.getFullYear();
  // Mayo(4)–Dic(11): temporada y; Ene(0)–Abr(3): temporada y-1
  var inicio = (m>=4) ? y : (y-1);
  return inicio + '-' + (inicio+1);
}
/* Objeto raíz de indicadores (con migración de la estructura antigua). */
function getIndicadoresRoot(){
  try{
    var c = (STATE.cache.config && STATE.cache.config.indicadoresDiarios) || null;
    if(!c) return { temporadas:{} };
    var root = { temporadas: (c.temporadas && typeof c.temporadas==='object') ? c.temporadas : {} };
    // Migración: estructura antigua 'meses' → temporada 2025-2026
    if(c.meses && typeof c.meses==='object' && !root.temporadas['2025-2026']){
      root.temporadas['2025-2026'] = c.meses;
    }
    return root;
  }catch(e){ return { temporadas:{} }; }
}
/* Meses de una temporada concreta (objeto {MAYO:{...},...}) o {}. */
function getIndicadoresTemporada(temp){
  var root = getIndicadoresRoot();
  return (root.temporadas && root.temporadas[temp]) ? root.temporadas[temp] : {};
}
/* Lista ordenada de temporadas conocidas (las guardadas + la actual + un margen
   hacia adelante para poder avanzar). */
function listarTemporadas(){
  var root = getIndicadoresRoot();
  var set = {};
  Object.keys(root.temporadas||{}).forEach(function(t){ set[t]=1; });
  // Asegurar la temporada actual y al menos una hacia adelante.
  var actual = temporadaActual();
  set[actual] = 1;
  var inicioAct = parseInt(actual.split('-')[0],10);
  set[(inicioAct+1)+'-'+(inicioAct+2)] = 1;
  // Asegurar 2025-2026 (histórica)
  set['2025-2026'] = 1;
  return Object.keys(set).sort();
}
function getIndicadores(){
  // Compatibilidad: devuelve los meses de la temporada ACTUAL (por fecha).
  return getIndicadoresTemporada(temporadaActual());
}
/* Indicador de un mes. Acepta año opcional para resolver la temporada exacta;
   si no se da año, usa la temporada actual por fecha. */
function getIndicadorMes(mes, anio){
  if(!mes) return null;
  var temp = anio ? temporadaDeMesAnio(mes, anio) : temporadaActual();
  var m = getIndicadoresTemporada(temp);
  var key = String(mes).toUpperCase().trim();
  return m[key] || null;
}
function _fmtIndic(v){
  if(v==null || v==='' || isNaN(v)) return '';
  return Number(v).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
}
/* Año calendario que corresponde a un mes dentro de la temporada activa. */
function _anioDeMesEnTemporada(mes, temp){
  var inicio = parseInt(String(temp).split('-')[0],10);
  var idx = PZ_MESES_TEMP.indexOf(String(mes).toUpperCase());
  return (idx>=8) ? (inicio+1) : inicio; // ENE..ABR caen en el año siguiente
}
function renderIndicadoresRows(){
  if(!_indicTempActiva) _indicTempActiva = temporadaActual();
  var datos = getIndicadoresTemporada(_indicTempActiva);
  var editable = (typeof can==='function') && can('config.editar');
  var ro = editable ? '' : ' readonly';
  return PZ_MESES_TEMP.map(function(mes){
    var d = datos[mes] || {};
    var anioMes = _anioDeMesEnTemporada(mes, _indicTempActiva);
    var inp = function(campo, val){
      return '<input type="text" data-mes="'+mes+'" data-campo="'+campo+'" value="'+(_fmtIndic(val))+'"'+ro+
             ' style="width:120px;padding:6px 8px;border:1px solid var(--bo);border-radius:6px;font-size:13px" placeholder="—">';
    };
    return '<tr style="border-bottom:1px solid var(--bo)">'+
      '<td style="padding:6px 10px;font-weight:600">'+mes+' <span style="color:#94a3b8;font-weight:400;font-size:11px">'+anioMes+'</span></td>'+
      '<td style="padding:6px 10px">'+inp('usd', d.usd)+'</td>'+
      '<td style="padding:6px 10px">'+inp('utm', d.utm)+'</td>'+
      '<td style="padding:6px 10px">'+inp('uf', d.uf)+'</td>'+
      '</tr>';
  }).join('');
}
/* Opciones del selector de temporada. */
function renderTemporadaOptions(){
  if(!_indicTempActiva) _indicTempActiva = temporadaActual();
  return listarTemporadas().map(function(t){
    var sel = (t===_indicTempActiva) ? ' selected' : '';
    var actualTxt = (t===temporadaActual()) ? ' (actual)' : '';
    return '<option value="'+t+'"'+sel+'>Temporada '+t+actualTxt+'</option>';
  }).join('');
}
/* Cambia la temporada activa y re-renderiza la tabla. */
function cambiarTemporadaIndic(temp){
  _indicTempActiva = temp;
  var tbody = document.getElementById('indicadores-tbody');
  if(tbody) tbody.innerHTML = renderIndicadoresRows();
  var lbl = document.getElementById('indic-temp-label');
  if(lbl) lbl.textContent = temp;
}
function _parseIndic(str){
  if(str==null) return null;
  var v = String(str).trim().replace(/\./g,'').replace(',', '.').replace(/[^0-9.\-]/g,'');
  if(v==='') return null;
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}
async function saveIndicadores(){
  if(!can('config.editar')){ return; }
  try{
    if(!_indicTempActiva) _indicTempActiva = temporadaActual();
    var inputs = document.querySelectorAll('#indicadores-tbody input[data-mes]');
    var meses = {};
    inputs.forEach(function(inp){
      var mes = inp.getAttribute('data-mes');
      var campo = inp.getAttribute('data-campo');
      var val = _parseIndic(inp.value);
      if(!meses[mes]) meses[mes] = {};
      if(val!=null) meses[mes][campo] = val;
    });
    // Partir del root existente (con migración) y actualizar solo la temporada activa.
    var root = getIndicadoresRoot();
    if(!root.temporadas) root.temporadas = {};
    root.temporadas[_indicTempActiva] = meses;
    var obj = { key:'indicadoresDiarios', temporadas: root.temporadas, _updatedAt: new Date().toISOString() };
    await dbPut('config', obj);
    STATE.cache.config = STATE.cache.config || {};
    STATE.cache.config.indicadoresDiarios = obj;
    if(typeof showNotice==='function') showNotice('\u2713 Indicadores de la temporada '+_indicTempActiva+' guardados.', 'ok');
    else if(typeof toast==='function') toast('Indicadores guardados','Temporada '+_indicTempActiva,'success');
  }catch(e){
    console.error('saveIndicadores error:', e);
    if(typeof showNotice==='function') showNotice('\u274c No se pudieron guardar los indicadores.', 'error');
  }
}
window.getIndicadorMes = getIndicadorMes;
window.getIndicadores = getIndicadores;
window.temporadaActual = temporadaActual;

/* ─── EQUIPOS (catálogo para salida de combustible) ─── */
function _eqFindById(id){ return getEquipos().find(e=>String(e.id||e.nombre)===String(id))||null; }
/* Convierte los equipos-semilla en registros reales conservando el orden. */
function _eqMaterializar(raw){
  return raw.map(e=>String(e.id||'').startsWith('seed-')
    ? {id:'eq-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8),nombre:e.nombre,tipo:e.tipo||'',medidor:e.medidor||'km',patente:'',obs:'',estado:'activo',creado:new Date().toISOString()}
    : Object.assign({},e));
}
function _eqFormBody(e){
  e=e||{};
  return `<div class="form-grid">
      <div class="form-field span-2 required"><label>Nombre / identificador</label><input type="text" id="eqNom" value="${escapeHtml(e.nombre||'')}" placeholder="Ej: TRACTOR JOHN DEERE 5090" autofocus></div>
      <div class="form-field"><label>Tipo</label><select id="eqTipo">${EQUIPO_TIPOS.map(t=>`<option value="${t}" ${e.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-field"><label>Medidor</label><select id="eqMed">${EQUIPO_MEDIDORES.map(m=>`<option value="${m[0]}" ${(e.medidor||'km')===m[0]?'selected':''}>${m[1]}</option>`).join('')}</select></div>
      <div class="form-field span-2"><label>Patente / código interno (opcional)</label><input type="text" id="eqPat" value="${escapeHtml(e.patente||'')}" placeholder="Ej: ABCD-12"></div>
      <div class="form-field span-2"><label>Observaciones (opcional)</label><input type="text" id="eqObs" value="${escapeHtml(e.obs||'')}" placeholder="Notas del equipo"></div>
    </div>`;
}
function addEquipoForm(){
  if(!can('config.editar')) return;
  showModal('Nuevo equipo', _eqFormBody({medidor:'km'}),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveEquipo()">Crear</button>`,'md');
}
function editEquipoForm(id){
  if(!can('config.editar')) return;
  const e=_eqFindById(id); if(!e) return;
  const body=_eqFormBody(e)+`
    <div class="form-field span-2" style="margin-top:2px">
      <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
        <span class="switch"><input type="checkbox" id="eqAct" ${e.estado!=='inactivo'?'checked':''}><span class="switch-slider"></span></span>
        <span>Activo — visible en el formulario de combustible</span>
      </label>
    </div>`;
  showModal(`Editar equipo · ${e.nombre}`, body,
    `<button class="btn btn-danger" onclick="deleteEquipo('${escapeHtml(String(id))}')">Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveEquipo('${escapeHtml(String(id))}')">Guardar</button>`,'md');
}
async function saveEquipo(id){
  const nombre=(document.getElementById('eqNom').value||'').trim();
  if(!nombre){ toast('Falta nombre','El nombre del equipo es obligatorio','error'); return; }
  const tipo=document.getElementById('eqTipo').value||'';
  const medidor=document.getElementById('eqMed').value||'km';
  const patente=(document.getElementById('eqPat').value||'').trim();
  const obs=(document.getElementById('eqObs').value||'').trim();
  const actEl=document.getElementById('eqAct');
  const raw=getEquipos();
  let idx=-1;
  if(id){ idx=raw.findIndex(e=>String(e.id||e.nombre)===String(id)); }
  const lista=_eqMaterializar(raw); // conserva el orden y el índice
  if(lista.some((e,i)=>i!==idx && String(e.nombre||'').toLowerCase()===nombre.toLowerCase())){
    toast('Equipo duplicado','Ya existe un equipo con ese nombre','error'); return;
  }
  if(idx>=0){
    lista[idx]=Object.assign({},lista[idx],{nombre,tipo,medidor,patente,obs,
      estado:actEl&&!actEl.checked?'inactivo':'activo',modificado:new Date().toISOString()});
  }else{
    lista.push({id:'eq-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8),nombre,tipo,medidor,patente,obs,estado:'activo',creado:new Date().toISOString()});
  }
  try{
    await saveEquiposLista(lista);
    await audit(id?'equipo.editar':'equipo.crear',`${id?'Edición':'Creación'} de equipo`,nombre);
  }catch(e){ toast('Error','No se pudo guardar el equipo','error'); return; }
  closeModal(); toast(id?'Equipo actualizado':'Equipo creado');
  renderConfig(document.getElementById('mainContent'));
}
async function deleteEquipo(id){
  const e=_eqFindById(id); if(!e) return;
  if(!confirm(`¿Eliminar el equipo "${e.nombre}"?\n\nLos registros de combustible ya guardados no se modifican.`)) return;
  const raw=getEquipos();
  const idx=raw.findIndex(x=>String(x.id||x.nombre)===String(id));
  const lista=_eqMaterializar(raw);
  if(idx>=0) lista.splice(idx,1);
  try{
    await saveEquiposLista(lista);
    await audit('equipo.eliminar','Eliminación de equipo',e.nombre);
  }catch(err){ toast('Error','No se pudo eliminar el equipo','error'); return; }
  closeModal(); toast('Equipo eliminado');
  renderConfig(document.getElementById('mainContent'));
}

function renderConfig(c){
  const groups=STATE.cache.groups;
  const tipos=(STATE.cache.productTypes||[]).slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  c.innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Configuración</div><div class="page-subtitle">Tipos, grupos, sub-grupos y respaldos</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px">
      <div class="card" style="grid-column:1/-1">
        <div class="card-header"><div class="card-title">🏢 Datos de la Empresa</div>${can('config.editar')?`<button class="btn btn-primary btn-sm" onclick="openEmpresaForm()">✏️ Editar</button>`:''}</div>
        <div style="padding:14px 18px" id="empresaConfigDisplay">
          ${renderEmpresaDisplay()}
        </div>
      </div>
      <div class="card" style="grid-column:1/-1">
        <div class="card-header"><div class="card-title">🎨 Apariencia</div></div>
        <div style="padding:14px 18px">
          <div style="font-size:13px;color:var(--mu);margin-bottom:12px">Elija la paleta de colores del sistema. El cambio se aplica de inmediato y se recuerda en este dispositivo.</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div onclick="cambiarTema('sap')" id="tema-card-sap" style="cursor:pointer;border:2px solid var(--bo);border-radius:10px;padding:14px;width:200px;transition:.15s">
              <div style="display:flex;gap:6px;margin-bottom:8px">
                <div style="width:28px;height:28px;border-radius:6px;background:#354a5f"></div>
                <div style="width:28px;height:28px;border-radius:6px;background:#0a6ed1"></div>
                <div style="width:28px;height:28px;border-radius:6px;background:#d1e8ff"></div>
              </div>
              <div style="font-weight:700;color:var(--gd)">Azul corporativo</div>
              <div style="font-size:11px;color:var(--mu)">Estilo SAP (actual)</div>
            </div>
            <div onclick="cambiarTema('forestal')" id="tema-card-forestal" style="cursor:pointer;border:2px solid var(--bo);border-radius:10px;padding:14px;width:200px;transition:.15s">
              <div style="display:flex;gap:6px;margin-bottom:8px">
                <div style="width:28px;height:28px;border-radius:6px;background:#1e3d0f"></div>
                <div style="width:28px;height:28px;border-radius:6px;background:#2d5a1b"></div>
                <div style="width:28px;height:28px;border-radius:6px;background:#d4f0b8"></div>
              </div>
              <div style="font-weight:700;color:var(--gd)">Verde forestal</div>
              <div style="font-size:11px;color:var(--mu)">Estilo anterior</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column:1/-1">
        <div class="card-header">
          <div class="card-title">📈 Indicadores Diarios</div>
          ${can('config.editar')?`<button class="btn btn-primary btn-sm" onclick="saveIndicadores()">💾 Guardar indicadores</button>`:''}
        </div>
        <div style="padding:14px 18px">
          <div style="font-size:13px;color:var(--mu);margin-bottom:12px">
            Valores mensuales de los principales indicadores económicos. Se usan como respaldo en otros módulos
            (por ejemplo, el Tipo de Cambio del Control de Presupuesto toma el <strong>Valor USD</strong> del mes
            cuando el Excel no lo trae). Cada temporada va de Mayo a Abril del año siguiente. Edite y presione «Guardar indicadores».
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
            <label style="font-size:13px;font-weight:700;color:#334155">Temporada:</label>
            <select id="indic-temp-select" onchange="cambiarTemporadaIndic(this.value)" style="padding:8px 12px;border:1px solid var(--bo);border-radius:8px;font-size:13px;font-weight:600;background:#fff;min-width:220px">${renderTemporadaOptions()}</select>
            <span style="font-size:12px;color:#94a3b8">Mayo (<span id="indic-temp-label">${_indicTempActiva||temporadaActual()}</span>) → Abril</span>
          </div>
          <div style="overflow-x:auto">
            <table class="data-table" id="indicadores-table" style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="text-align:left;border-bottom:2px solid var(--bo)">
                  <th style="padding:8px 10px">Mes</th>
                  <th style="padding:8px 10px">Valor USD ($/USD)</th>
                  <th style="padding:8px 10px">UTM ($)</th>
                  <th style="padding:8px 10px">UF ($)</th>
                </tr>
              </thead>
              <tbody id="indicadores-tbody">${renderIndicadoresRows()}</tbody>
            </table>
          </div>
          <div class="hint" style="margin-top:8px;line-height:1.4">Elija la temporada en el selector. Deje en blanco los meses sin dato. Puede avanzar a temporadas futuras (2027-2028, etc.).</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Tipos de Producto</div>${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="addTipoForm()">+ Tipo</button>`:''}</div>
        <div style="padding:10px 0">
          ${tipos.length===0?'<div class="empty-state"><div class="empty-state-text">Sin tipos</div></div>':
            tipos.map(t=>{
              const usos=STATE.cache.products.filter(p=>p.tipoProducto===t.nombre).length;
              return `<div style="padding:12px 18px;border-bottom:1px solid var(--bo);display:flex;align-items:center;justify-content:space-between;gap:10px">
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong style="color:var(--gd)">${escapeHtml(t.nombre)}</strong>
                    ${t.activo===false?'<span class="badge badge-gray">inactivo</span>':''}
                    <span style="color:var(--mu);font-size:12px">${usos} producto(s)</span>
                  </div>
                  ${t.descripcion?`<div style="font-size:12px;color:var(--mu);margin-top:2px">${escapeHtml(t.descripcion)}</div>`:''}
                </div>
                ${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="editTipoForm('${escapeHtml(t.nombre)}')">Editar</button>`:''}
              </div>`;
            }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Grupos / Sub-grupos</div>${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="addGroupForm()">+ Grupo</button>`:''}</div>
        <div style="padding:10px 0">
          ${groups.length===0?'<div class="empty-state"><div class="empty-state-text">Sin grupos</div></div>':
            groups.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(g=>{
              const usos=STATE.cache.products.filter(p=>p.grupo===g.nombre).length;
              return `<div style="padding:12px 18px;border-bottom:1px solid var(--bo)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px">
                  <div style="min-width:0">
                    <strong style="color:var(--gd)">${escapeHtml(g.nombre)}</strong>
                    <span style="color:var(--mu);font-size:12px"> · ${(g.subgrupos||[]).length} sub-grupo(s) · ${usos} producto(s)</span>
                  </div>
                  ${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="editGroupForm('${escapeHtml(g.nombre)}')">Editar</button>`:''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(g.subgrupos||[]).map(s=>`<span class="badge badge-gray">${escapeHtml(s)}</span>`).join('')||'<span style="color:var(--mu);font-size:12px">Sin sub-grupos</span>'}
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">🚜 Equipos</div>${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="addEquipoForm()">+ Equipo</button>`:''}</div>
        <div style="padding:10px 0">
          ${(()=>{
            const eqs=getEquipos().slice().sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||'')));
            if(eqs.length===0) return '<div class="empty-state"><div class="empty-state-text">Sin equipos</div></div>';
            const medLbl={km:'Kilómetros',horometro:'Horómetro',ninguno:'Sin medidor'};
            return eqs.map(e=>`<div style="padding:12px 18px;border-bottom:1px solid var(--bo);display:flex;align-items:center;justify-content:space-between;gap:10px">
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong style="color:var(--gd)">${escapeHtml(e.nombre)}</strong>
                    ${e.estado==='inactivo'?'<span class="badge badge-gray">inactivo</span>':''}
                    ${e.tipo?`<span class="badge badge-blue">${escapeHtml(e.tipo)}</span>`:''}
                    <span style="color:var(--mu);font-size:12px">${medLbl[e.medidor]||'Kilometraje / Horómetro'}${e.patente?(' · '+escapeHtml(e.patente)):''}</span>
                  </div>
                </div>
                ${can('config.editar')?`<button class="btn btn-secondary btn-sm" onclick="editEquipoForm('${escapeHtml(e.id||e.nombre)}')">Editar</button>`:''}
              </div>`).join('');
          })()}
        </div>
        <div class="hint" style="padding:0 18px 12px">Estos equipos aparecen en la casilla <strong>Equipo</strong> de la salida de combustible. El medidor define si el rendimiento se calcula en km/L o L/hora.</div>
      </div>

      ${STATE.user.role==='admin'?`<div class="card">
        <div class="card-header"><div class="card-title">📦 Respaldo del sistema</div></div>
        <div style="padding:18px;display:flex;flex-direction:column;gap:12px">
          ${(()=>{
            const dias=diasDesdeRespaldo();
            let estado, color;
            if(dias===null){ estado='Nunca se ha generado un respaldo'; color='#c0392b'; }
            else if(dias>=BACKUP_INTERVALO_DIAS){ estado=`Último respaldo hace ${dias} días — se recomienda actualizar`; color='#e9730c'; }
            else { estado=`Último respaldo hace ${dias} día(s) · al día`; color='#1a7e3e'; }
            return `<div style="background:var(--gs);border-left:4px solid ${color};border-radius:8px;padding:12px 14px">
              <div style="font-weight:700;color:${color};font-size:13px">${estado}</div>
              <div style="font-size:12px;color:var(--mu);margin-top:4px">El sistema recuerda respaldar cada ${BACKUP_INTERVALO_DIAS} días. Un solo archivo consolida <strong>Inventario, Cuaderno de Campo, Presupuesto e Inventario de Huerto</strong>.</div>
            </div>`;
          })()}
          <button class="btn btn-primary" onclick="exportBackupConsolidado()" style="justify-content:center">💾 Generar respaldo completo</button>
          ${fsaSupported()?`<button class="btn btn-secondary" onclick="configurarCarpetaRespaldo()" style="justify-content:center">📁 Configurar carpeta de respaldo (servidor)</button>
          <div class="hint" style="margin-top:-4px">Elija la carpeta compartida del servidor. Los respaldos se guardarán ahí automáticamente (archivo <strong>SCI_respaldo_actual.json</strong> + una copia con fecha), sin descargas manuales.</div>`:''}
          <label class="btn btn-secondary" style="justify-content:center;cursor:pointer"><span>📂 Restaurar respaldo completo...</span><input type="file" accept=".json,application/json" style="display:none" onchange="if(this.files[0]){confirmRestoreConsolidado(this.files[0]);this.value='';}"></label>
          <div class="hint" style="line-height:1.4">El archivo se descarga a tu carpeta de Descargas. Guárdalo en un lugar seguro (idealmente sincronizado con Google Drive u OneDrive). Restaurar reemplaza todos los datos actuales.</div>
          <div style="border-top:1px solid var(--bo);margin-top:6px;padding-top:12px">
            <div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Mantenimiento</div>
            <button class="btn btn-secondary btn-sm" onclick="recalcularStock()" style="width:100%;justify-content:center">🔄 Recalcular stock desde movimientos</button>
            <div class="hint" style="margin-top:6px;line-height:1.4">Útil si sospechas inconsistencias en los saldos. Recompone el stock desde cero leyendo todos los movimientos vigentes (excluye anulados).</div>
          </div>
        </div>
      </div>`:''}
    </div>`;
  // Resaltar la tarjeta del tema activo
  setTimeout(function(){ if(typeof _resaltarTemaCard==='function') _resaltarTemaCard(getTema()); },30);
}
/* ─── TIPOS DE PRODUCTO ─── */
function addTipoForm(){
  showModal('Nuevo tipo de producto',
    `<div class="form-grid">
      <div class="form-field span-2 required"><label>Nombre</label><input type="text" id="tpNom" placeholder="Ej: REPUESTO" autofocus><div class="hint">Se guarda en mayúsculas. No se puede cambiar después.</div></div>
      <div class="form-field span-2"><label>Descripción (opcional)</label><input type="text" id="tpDesc" placeholder="Descripción breve del tipo"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveTipo()">Crear</button>`,'md');
}
function editTipoForm(nom){
  const t=STATE.cache.productTypes.find(x=>x.nombre===nom);if(!t)return;
  const usos=STATE.cache.products.filter(p=>p.tipoProducto===nom).length;
  showModal(`Editar tipo · ${t.nombre}`,
    `<div class="form-grid">
      <div class="form-field span-2"><label>Nombre</label><input type="text" id="tpNom" value="${escapeHtml(t.nombre)}" readonly><div class="hint">El nombre es la clave del registro y no se puede modificar.</div></div>
      <div class="form-field span-2"><label>Descripción</label><input type="text" id="tpDesc" value="${escapeHtml(t.descripcion||'')}" placeholder="Descripción breve del tipo"></div>
      <div class="form-field span-2"><label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--gs);border:1px solid var(--bo);border-radius:6px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--tx)">
          <span class="switch"><input type="checkbox" id="tpAct" ${t.activo!==false?'checked':''}><span class="switch-slider"></span></span>
          <span id="tpActLbl">${t.activo!==false?'Activo — visible al crear productos':'Inactivo — oculto en formularios'}</span>
        </label>
        <div class="hint">${usos} producto(s) usan este tipo. Desactivarlo no los afecta, solo lo oculta para nuevos productos.</div>
      </div>
    </div>`,
    `<button class="btn btn-danger" onclick="deleteTipo('${escapeHtml(nom)}')" ${usos>0?'disabled title="Hay productos usando este tipo"':''}>Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveTipo('${escapeHtml(nom)}')">Guardar</button>`,'md');
  document.getElementById('tpAct').addEventListener('change',e=>{
    document.getElementById('tpActLbl').textContent=e.target.checked?'Activo — visible al crear productos':'Inactivo — oculto en formularios';
  });
}
async function saveTipo(existing){
  const nom=document.getElementById('tpNom').value.trim().toUpperCase();
  const desc=document.getElementById('tpDesc').value.trim();
  if(!nom){toast('Falta nombre','El nombre del tipo es obligatorio','error');return}
  if(!existing&&STATE.cache.productTypes.find(t=>t.nombre===nom)){toast('Tipo duplicado','Ya existe un tipo con ese nombre','error');return}
  let obj;
  if(existing){
    obj=STATE.cache.productTypes.find(t=>t.nombre===existing);
    obj.descripcion=desc;
    obj.activo=document.getElementById('tpAct').checked;
    obj.modificado=new Date().toISOString();
  }else{
    obj={nombre:nom,descripcion:desc,activo:true,creado:new Date().toISOString()};
  }
  await dbPut('productTypes',obj);
  await audit(existing?'tipo.editar':'tipo.crear',`${existing?'Edición':'Creación'} de tipo de producto`,nom);
  await reloadCache();closeModal();toast(existing?'Tipo actualizado':'Tipo creado');
  renderConfig(document.getElementById('mainContent'));
}
async function deleteTipo(nom){
  const usos=STATE.cache.products.filter(p=>p.tipoProducto===nom).length;
  if(usos>0){toast('No se puede eliminar',`${usos} producto(s) usan este tipo. Reasígnalos primero.`,'error');return}
  closeModal();
  confirmDialog('Eliminar tipo',
    `<div>¿Eliminar el tipo <strong>${escapeHtml(nom)}</strong>?</div><div style="color:var(--mu);font-size:13px;margin-top:6px">Esta acción no se puede deshacer.</div>`,
    async()=>{
      await dbDel('productTypes',nom);
      await audit('tipo.eliminar','Eliminación de tipo de producto',nom);
      await reloadCache();closeModal();toast('Tipo eliminado');
      renderConfig(document.getElementById('mainContent'));
    },'Sí, eliminar',true);
}

/* ─── GRUPOS / SUB-GRUPOS ─── */
function addGroupForm(){
  showModal('Nuevo grupo',
    `<div class="form-grid">
      <div class="form-field span-2 required"><label>Nombre del grupo</label><input type="text" id="gpNom" placeholder="Ej: BEBIDAS" autofocus><div class="hint">Se guarda en mayúsculas. No se puede cambiar después.</div></div>
      <div class="form-field span-2"><label>Sub-grupos (uno por línea, opcional)</label><textarea id="gpSubs" rows="6" style="padding:9px 11px;border:1px solid var(--bo);border-radius:6px;font-family:inherit;font-size:14px;resize:vertical" placeholder="GASEOSAS&#10;AGUAS&#10;JUGOS"></textarea><div class="hint">Se guardan en mayúsculas y se eliminan duplicados.</div></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveGroup()">Crear</button>`,'md');
}
function editGroupForm(nom){
  const g=STATE.cache.groups.find(x=>x.nombre===nom);if(!g)return;
  const usos=STATE.cache.products.filter(p=>p.grupo===nom).length;
  const usosBySg={};
  STATE.cache.products.filter(p=>p.grupo===nom&&p.subGrupo).forEach(p=>{usosBySg[p.subGrupo]=(usosBySg[p.subGrupo]||0)+1});
  const subsEnUso=Object.keys(usosBySg);
  showModal(`Editar grupo · ${g.nombre}`,
    `<div class="form-grid">
      <div class="form-field span-2"><label>Nombre del grupo</label><input type="text" id="gpNom" value="${escapeHtml(g.nombre)}" readonly><div class="hint">El nombre es la clave del registro y no se puede modificar. ${usos} producto(s) usan este grupo.</div></div>
      <div class="form-field span-2"><label>Sub-grupos (uno por línea)</label><textarea id="gpSubs" rows="6" style="padding:9px 11px;border:1px solid var(--bo);border-radius:6px;font-family:inherit;font-size:14px;resize:vertical">${(g.subgrupos||[]).join('\n')}</textarea>
        ${subsEnUso.length>0?`<div class="hint" style="color:var(--gm)">⚠ Sub-grupos en uso: ${Object.entries(usosBySg).map(([k,v])=>`<strong>${escapeHtml(k)}</strong> (${v})`).join(', ')}. Si los eliminas de la lista, no se guardará.</div>`:'<div class="hint">Ningún sub-grupo está en uso por productos. Puedes editar libremente.</div>'}
      </div>
    </div>`,
    `<button class="btn btn-danger" onclick="deleteGroup('${escapeHtml(nom)}')" ${usos>0?'disabled title="Hay productos en este grupo"':''}>Eliminar grupo</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveGroup('${escapeHtml(nom)}')">Guardar</button>`,'md');
}
async function saveGroup(existing){
  const nom=document.getElementById('gpNom').value.trim().toUpperCase();
  const rawSubs=document.getElementById('gpSubs').value.split('\n').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const subs=[...new Set(rawSubs)];
  if(!nom){toast('Falta nombre','','error');return}
  if(!existing&&STATE.cache.groups.find(g=>g.nombre===nom)){toast('Grupo duplicado','Ya existe un grupo con ese nombre','error');return}
  if(existing){
    const usosBySg={};
    STATE.cache.products.filter(p=>p.grupo===nom&&p.subGrupo).forEach(p=>{usosBySg[p.subGrupo]=(usosBySg[p.subGrupo]||0)+1});
    const removidos=Object.keys(usosBySg).filter(s=>!subs.includes(s));
    if(removidos.length>0){
      toast('Sub-grupos en uso',`No se puede eliminar: ${removidos.join(', ')}. Hay productos asignados.`,'error');return;
    }
  }
  await dbPut('groups',{nombre:nom,subgrupos:subs});
  await audit(existing?'grupo.editar':'grupo.crear',`${existing?'Edición':'Creación'} de grupo`,nom);
  await reloadCache();closeModal();toast(existing?'Grupo actualizado':'Grupo creado');
  renderConfig(document.getElementById('mainContent'));
}
async function deleteGroup(nom){
  const usos=STATE.cache.products.filter(p=>p.grupo===nom).length;
  if(usos>0){toast('No se puede eliminar',`${usos} producto(s) usan este grupo. Reasígnalos primero.`,'error');return}
  closeModal();
  confirmDialog('Eliminar grupo',
    `<div>¿Eliminar el grupo <strong>${escapeHtml(nom)}</strong> y todos sus sub-grupos?</div><div style="color:var(--mu);font-size:13px;margin-top:6px">Esta acción no se puede deshacer.</div>`,
    async()=>{
      await dbDel('groups',nom);
      await audit('grupo.eliminar','Eliminación de grupo',nom);
      await reloadCache();closeModal();toast('Grupo eliminado');
      renderConfig(document.getElementById('mainContent'));
    },'Sí, eliminar',true);
}
function confirmRestore(file){
  confirmDialog('Restaurar respaldo',
    `<div>Vas a restaurar desde el archivo:</div><div style="margin:10px 0;padding:8px 10px;background:var(--gs);border-radius:6px;font-family:monospace;font-size:13px">${escapeHtml(file.name)}</div><div style="color:var(--red)"><strong>⚠️ Esto reemplazará todos los datos actuales</strong>. La sesión actual se cerrará.</div>`,
    async()=>{
      showLoading('Restaurando...');
      try{await importBackup(file);hideLoading();logout()}
      catch(e){hideLoading();toast('Error',e.message,'error')}
    },'Sí, restaurar',true);
}


