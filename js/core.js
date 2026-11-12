/* ╔═══════════════════════════════════════════════════════════════╗
   ║                    SCI · Sistema Inventario                    ║
   ║                                                                ║
   ║  Estructura: SPA con IndexedDB para persistencia              ║
   ║  Auto-guardado en cada operación                              ║
   ║  Costeo: Promedio Ponderado (PPP)                             ║
   ║  Multi-bodega · Trazabilidad por lote · Permisos por usuario  ║
   ╚═══════════════════════════════════════════════════════════════╝ */

/* ═══════════════ DB LAYER (IndexedDB) ═══════════════ */
const DB_NAME='SCI_DB';
const DB_VERSION=16;   // v129: store 'clima'. Subido a 16 en v171 porque una prueba previa dejó bases en v15; 16 va por encima y no borra datos (onupgradeneeded solo crea stores que falten).
const STORES=[
  ['users','id'],
  ['products','codigoInterno'],
  ['warehouses','id'],
  ['groups','nombre'],
  ['productTypes','nombre'],
  ['providers','codigo'],
  ['customers','codigo'],
  ['costCenters','codigo'],
  ['inventoryCounts','id'],
  ['movements','numero'],
  ['ordenescompra','id'],
  ['mantenciones','id'],
  ['conteos','id'],
  ['estimaciones','id'],
  ['invplantas','id'],
  ['stock','key'],
  ['lots','id'],
  ['audit','id'],
  ['combustible','id'],
  ['config','key'],
  ['aihprop','id'],
  ['aihver','id'],
  ['heladas','id'],
  ['clima','fecha']
];
let DB=null;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=(e)=>{
      const db=e.target.result;
      STORES.forEach(([name,key])=>{
        if(!db.objectStoreNames.contains(name)){
          db.createObjectStore(name,{keyPath:key});
        }
      });
    };
    req.onsuccess=()=>{DB=req.result;resolve(DB)};
    req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return DB.transaction(store,mode).objectStore(store)}
// Versión local pura (sin sincronización) — usada internamente al aplicar cambios remotos
function dbPutLocal(store,obj){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').put(obj);
    r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error);
  });
}
// Versión pública: guarda local Y sincroniza a la nube
function dbPut(store,obj){
  return new Promise((res,rej)=>{
    // Sellar marca de modificación en registros acumulativos: permite a la
    // fusión saber qué versión es más reciente cuando dos dispositivos editan
    // el mismo registro. No se aplica al aplicar un cambio remoto (para no
    // re-sellar lo que ya viene de la nube).
    try{
      var ACUM = {'invplantas':1,'conteos':1,'estimaciones':1,'movements':1,'mantenciones':1,'inventoryCounts':1,'lots':1,'aihprop':1,'heladas':1,'clima':1,'combustible':1};
      if(ACUM[store] && obj && typeof obj==='object' && !(typeof SCIFB!=='undefined' && SCIFB.applyingRemote)){
        obj._mod = Date.now();
      }
    }catch(e){}
    const r=tx(store,'readwrite').put(obj);
    r.onsuccess=()=>{
      // Disparar sincronización a la nube (si está lista, no aplicando remoto, y no en arranque)
      if(typeof SCIFB!=='undefined' && SCIFB.ready && !SCIFB.applyingRemote && !SCIFB.bootingUp){
        try{ sciFbPush(false); }catch(e){}
      }
      res(obj);
    };
    r.onerror=()=>rej(r.error);
  });
}
function dbGet(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store).get(key);
    r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);
  });
}
function dbAll(store){
  return new Promise((res,rej)=>{
    let r;
    try{ r=tx(store).getAll(); }
    catch(e){ console.warn('dbAll: store no disponible aún:',store); return res([]); }
    r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);
  });
}

// ══ EMPRESA: helpers globales para datos de configuración ══
async function getCompanyData(){
  try{
    const emp = await dbGet('config', 'empresa');
    return emp || {key:'empresa',nombre:'', rut:'', direccion:'', giro:'', telefono:'', correo:'', logo:''};
  } catch(e){
    return {key:'empresa',nombre:'', rut:'', direccion:'', giro:'', telefono:'', correo:'', logo:''};
  }
}
// Aplica el branding (logo + nombre) al sidebar y login
async function applyCompanyBranding(){
  try {
    const emp = await getCompanyData();
    // Sidebar: actualizar logo y nombre
    const sidebarLogo = document.getElementById('sidebar-logo-container');
    const sidebarName = document.getElementById('sidebar-empresa-name');
    if(sidebarLogo){
      if(emp.logo){
        sidebarLogo.innerHTML = `<img src="${emp.logo}" alt="Logo" style="max-width:48px;max-height:48px;object-fit:contain;border-radius:6px">`;
      } else {
        sidebarLogo.innerHTML = `<div style="width:48px;height:48px;background:linear-gradient(135deg,#354a5f,#0854a0);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#d1e8ff;font-size:24px;font-weight:700">📊</div>`;
      }
    }
    if(sidebarName){
      sidebarName.textContent = emp.nombre || 'Sistema de Inventario';
    }
    // Login: actualizar logo si existe
    const loginLogo = document.getElementById('login-logo-container');
    if(loginLogo){
      if(emp.logo){
        loginLogo.innerHTML = `<img src="${emp.logo}" alt="Logo" style="max-width:80px;max-height:80px;object-fit:contain">`;
      } else {
        loginLogo.innerHTML = `<div style="width:80px;height:80px;background:linear-gradient(135deg,#354a5f,#0854a0);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#d1e8ff;font-size:36px;font-weight:700">📊</div>`;
      }
    }
    // Title del navegador
    if(emp.nombre){
      document.title = 'SCI · ' + emp.nombre;
    } else {
      document.title = 'SCI · Sistema de Control de Inventario';
    }
    // Cachear en STATE para acceso síncrono
    if(typeof STATE !== 'undefined' && STATE.cache){
      STATE.cache.config = STATE.cache.config || {};
      STATE.cache.config.empresa = emp;
    }
  } catch(e){
    console.error('Error al aplicar branding:', e);
  }
}
function dbDelLocal(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').delete(key);
    r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
  });
}
function dbDel(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').delete(key);
    r.onsuccess=()=>{
      if(typeof SCIFB!=='undefined' && SCIFB.ready && !SCIFB.applyingRemote && !SCIFB.bootingUp){
        try{ sciFbPush(false); }catch(e){}
      }
      res();
    };
    r.onerror=()=>rej(r.error);
  });
}
function dbClear(store){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').clear();
    r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
  });
}

// ══════════════════════════════════════════════════════════════════
//  SINCRONIZACIÓN EN LA NUBE DEL SCI — Firebase Firestore
//  Documento compartido: sci/main (espeja todas las tablas del SCI)
// ══════════════════════════════════════════════════════════════════
var SCIFB = {
  ready: false,
  online: false,
  // Mientras es true, las escrituras locales NO se suben a la nube
  // (evita que la inicialización por defecto pise los datos remotos al arrancar)
  bootingUp: true,
  // Indica si ya recibimos al menos una respuesta de la nube
  firstSnapshotReceived: false,
  clientId: 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
  lastVersion: 0,
  unsubscribe: null,
  applyingRemote: false,
  saveTimer: null,
  // Tablas que se sincronizan (todas las del SCI)
  stores: ['users','products','warehouses','groups','productTypes','providers','customers','costCenters','inventoryCounts','movements','ordenescompra','lots','config','mantenciones','conteos','estimaciones','invplantas','combustible','aihprop','heladas','clima']
};

function sciFbDocRef(){
  if(typeof firebase==='undefined' || !firebase.apps.length) return null;
  return firebase.firestore().collection('sci').doc('main');
}

/* ─── Particionado del payload (v141) ─────────────────────────────────────
   Firestore limita cada documento a ~1 MB. El payload del SCI ya superaba ese
   tope, así que se divide en trozos: sci/main_p0, sci/main_p1, ... y el doc
   sci/main solo guarda metadatos (_version, _chunks). Todo se escribe en un
   batch atómico: los trozos y el doc principal cambian juntos o no cambia
   nada. Cada trozo lleva el _version para detectar lecturas a medio camino.
   Compatibilidad: si sci/main aún trae 'payload' (formato antiguo) se usa. */
var SCI_CHUNK_CHARS = 300000;   // 300k unidades UTF-16 ≤ ~900 KB en UTF-8
function sciFbChunkRef(i){
  return firebase.firestore().collection('sci').doc('main_p'+i);
}
async function _sciFbLeerRemoto(data){
  if(!data) return null;
  if(data.payload){
    return (typeof data.payload==='string') ? JSON.parse(data.payload) : data.payload;
  }
  var n = data._chunks|0;
  if(!n) return null;
  var snaps = [];
  for(var i=0;i<n;i++){ snaps.push(sciFbChunkRef(i).get()); }
  snaps = await Promise.all(snaps);
  try{ for(var r=0;r<n;r++) FBCOUNT.read(); }catch(e){}
  var partes = [];
  for(var k=0;k<n;k++){
    var d = snaps[k] && snaps[k].exists ? snaps[k].data() : null;
    if(!d || d._version !== data._version){
      throw new Error('Trozo '+k+' desalineado (escritura en curso)');
    }
    partes.push(d.data||'');
  }
  return JSON.parse(partes.join(''));
}
/* Diagnóstico: peso de cada store en KB (ordenado de mayor a menor). */
function _sciFbTamanos(obj){
  var out = [];
  Object.keys(obj||{}).forEach(function(k){
    var kb = 0; try{ kb = Math.round(JSON.stringify(obj[k]).length/1024); }catch(e){}
    out.push({store:k, registros:Array.isArray(obj[k])?obj[k].length:'-', kb:kb});
  });
  out.sort(function(a,b){ return b.kb-a.kb; });
  return out;
}
async function sciFbDiagnosticoTamano(){
  var obj = {};
  for(var i=0;i<SCIFB.stores.length;i++){ obj[SCIFB.stores[i]] = await dbAll(SCIFB.stores[i]); }
  var t = _sciFbTamanos(obj);
  try{ console.table(t); }catch(e){ console.log(t); }
  return t;
}
try{ window.sciFbDiagnosticoTamano = sciFbDiagnosticoTamano; }catch(e){}

// Inicializa la sincronización del SCI (Firebase ya debe estar inicializado por el Cuaderno)
function sciFbInit(){
  try {
    if(typeof firebase === 'undefined'){
      console.warn('[SCI-Firebase] SDK no cargado. Inventario solo local.');
      sciFbIndicator('offline', 'Sin conexión a la nube');
      return;
    }
    if(!firebase.apps.length){
      // Si el Cuaderno no lo inicializó aún, lo hacemos con la misma config
      if(typeof FB !== 'undefined' && FB.config){
        firebase.initializeApp(FB.config);
      } else {
        console.warn('[SCI-Firebase] Sin configuración de Firebase');
        return;
      }
    }
    // NOTA: ya NO se hace login anónimo. El acceso exige correo+contraseña.
    SCIFB.ready = true;
    console.log('[SCI-Firebase] Inicializado');
    sciFbIndicator('connecting', 'Conectando inventario a la nube...');
    // Arrancar el listener solo cuando la autenticación anónima esté lista
    if(firebase.auth){
      var _sciListenerOk = false;
      firebase.auth().onAuthStateChanged(function(user){
        if(user && !_sciListenerOk){
          _sciListenerOk = true;
          sciFbStartListener();
        }
      });
    } else {
      sciFbStartListener();
    }
    // Red de seguridad: si en 10s no llegó respuesta de la nube (sin internet, etc.),
    // desactivar el modo arranque para que las escrituras locales puedan subir cuando se reconecte.
    setTimeout(function(){
      if(!SCIFB.firstSnapshotReceived){
        console.log('[SCI-Firebase] Sin respuesta de la nube en 10s. Habilitando subidas locales.');
        SCIFB.bootingUp = false;
      }
    }, 10000);
  } catch(e){
    console.error('[SCI-Firebase] Error al inicializar:', e);
    sciFbIndicator('offline', 'Error: ' + e.message);
  }
}

// Escucha cambios remotos en tiempo real
function sciFbStartListener(){
  var ref = sciFbDocRef();
  if(!ref) return;
  if(SCIFB.unsubscribe){ try{ SCIFB.unsubscribe(); }catch(e){} }
  SCIFB.unsubscribe = ref.onSnapshot(
    {includeMetadataChanges: false},
    function(doc){
      try{FBCOUNT.read();}catch(e){}
      SCIFB.online = true;
      if(!doc.exists){
        // La nube está vacía. Recién aquí permitimos subir los datos locales.
        console.log('[SCI-Firebase] Documento no existe. Creando con datos locales...');
        SCIFB.firstSnapshotReceived = true;
        SCIFB.bootingUp = false;
        sciFbIndicator('online', 'Creando base de inventario en la nube');
        sciFbPush(true);
        return;
      }
      var data = doc.data();
      if(data._clientId === SCIFB.clientId && data._version === SCIFB.lastVersion){
        SCIFB.firstSnapshotReceived = true;
        SCIFB.bootingUp = false;
        sciFbIndicator('online', 'Sincronizado');
        return;
      }
      // Hay datos en la nube: SIEMPRE ganan sobre el estado local de arranque.
      if(data._version && data._version !== SCIFB.lastVersion){
        console.log('[SCI-Firebase] Cambio remoto detectado (v'+data._version+')');
        SCIFB.firstSnapshotReceived = true;
        sciFbApplyRemote(data);
        // Tras aplicar la primera vez, ya se pueden subir cambios locales
        SCIFB.bootingUp = false;
      }
    },
    function(err){
      SCIFB.online = false;
      console.error('[SCI-Firebase] Error en listener:', err);
      sciFbIndicator('offline', 'Sin conexión: ' + err.code);
    }
  );
}

// Aplica el estado remoto a IndexedDB local
/* Firma barata de la lista de movimientos: permite distinguir un snapshot que
   trae cambios reales de uno que solo devuelve el eco de lo que acabamos de
   subir. Evita recalcular todo el stock en cada notificación de Firebase.     */
function _sigMovimientos(arr){
  var n=0, s=0;
  if(!Array.isArray(arr)) return '0:0';
  for(var i=0;i<arr.length;i++){
    var m=arr[i]; if(!m) continue;
    n++;
    var u=String(m.numero||'')+'|'+String(m.updatedAt||m.fecha||'')+(m.anulado?'|A':'');
    for(var c=0;c<u.length;c++){ s=(s*31+u.charCodeAt(c))>>>0; }
  }
  return n+':'+s;
}

async function sciFbApplyRemote(data){
  var llegaronMovimientos = false;
  try {
    SCIFB.applyingRemote = true;
    var remote = null;
    try{ remote = await _sciFbLeerRemoto(data); }
    catch(e){
      // Trozos aún no alineados: reintentar una vez en 2 s.
      console.warn('[SCI-Firebase]', e && e.message, '→ reintento');
      await new Promise(function(r){ setTimeout(r, 2000); });
      remote = await _sciFbLeerRemoto(data);
    }
    if(remote){
      // Stores acumulativos: fusión por clave (definido globalmente en
      // SCI_STORES_ACUMULATIVOS) para que ningún dispositivo borre datos de otro.
      for(var i=0;i<SCIFB.stores.length;i++){
        var store = SCIFB.stores[i];
        if(remote[store] !== undefined && Array.isArray(remote[store])){
          // Protección: si el store remoto llega VACÍO pero localmente hay datos,
          // no borrar (evita perder datos por una sincronización incompleta).
          if(remote[store].length===0){
            try{
              const localActual = await dbAll(store);
              if(localActual && localActual.length>0){
                console.warn('[SCI-Firebase] Store remoto "'+store+'" llegó vacío pero hay '+localActual.length+' local(es). Se conservan los locales.');
                continue;
              }
            }catch(e){}
          }
          if(SCI_STORES_ACUMULATIVOS[store]){
            var key = _sciStoreKey(store);
            var localArr = [];
            try{ localArr = await dbAll(store); }catch(e){ localArr = []; }
            var fusionado = _sciMergeArrays(localArr, remote[store], key, store);
            await dbClear(store);
            for(var j=0;j<fusionado.length;j++){
              try{ await dbPutLocal(store, fusionado[j]); }catch(e){}
            }
            if(store==='movements' && _sigMovimientos(localArr)!==_sigMovimientos(fusionado)){
              llegaronMovimientos = true;
            }
          } else {
            // Stores de catálogo/configuración: reemplazo directo.
            await dbClear(store);
            for(var j2=0;j2<remote[store].length;j2++){
              try{ await dbPutLocal(store, remote[store][j2]); }catch(e){}
            }
          }
        }
      }
      SCIFB.lastVersion = data._version || SCIFB.lastVersion;
      await reloadCache();
      // El stock NO se sincroniza: es un valor DERIVADO de los movimientos.
      // Si llegaron movimientos de otro dispositivo, hay que reconstruirlo aquí
      // o los saldos quedarían con el valor anterior hasta el próximo ingreso.
      if(llegaronMovimientos && typeof _ejecutarRecalculoStock==='function'){
        try{
          await _ejecutarRecalculoStock();   // recalcula y hace reloadCache()
        }catch(e){ console.error('[SCI-Firebase] Recálculo tras sync falló:', e); }
      }
      // Redibujar la pantalla actual (solo vistas de consulta)
      _refrescarVistaSegura();
      sciFbIndicator('online', llegaronMovimientos
        ? 'Movimientos sincronizados · saldos recalculados'
        : 'Inventario actualizado desde la nube');
    }
  } catch(e){
    console.error('[SCI-Firebase] Error al aplicar cambio remoto:', e);
  } finally {
    SCIFB.applyingRemote = false;
  }
}

/* ─── Refresco de la vista tras un cambio de datos de fondo ────────────────
   Vuelve a dibujar la pantalla actual SOLO si es una vista de consulta. En
   páginas con formulario (entradas, salidas, tomas, conteos...) redibujar
   borraría lo que el usuario está escribiendo, así que se omite. Tampoco se
   refresca con un modal abierto. Devuelve true si alcanzó a redibujar.        */
var _SCI_PAGINAS_CONSULTA = {
  dashboard:1, stock:1, movimientos:1, productos:1, bodegas:1, proveedores:1,
  clientes:1, centrosCosto:1, tomas:1, usuarios:1, auditoria:1,
  ordenesCompra:1, repCombustible:1, sistemasExternos:1
};
function _refrescarVistaSegura(){
  try{
    if(typeof navigate!=='function') return false;
    if(typeof STATE==='undefined' || !STATE.page) return false;
    if(!_SCI_PAGINAS_CONSULTA[STATE.page]) return false;
    var bd=document.getElementById('modalBackdrop');
    if(bd && bd.classList.contains('show')) return false;
    navigate(STATE.page, true);   // true = no apilar en el historial
    return true;
  }catch(e){ return false; }
}
try{ window._refrescarVistaSegura=_refrescarVistaSegura; }catch(e){}

// Envía todo el estado del SCI a la nube
/* ─── Lápidas de eliminación (tombstones) ───────────────────────────────
   Cuando se elimina un registro de un store acumulativo, registramos su ID con
   un timestamp. Esa marca se sincroniza (vía store 'config') y la fusión la
   respeta: un registro con lápida más reciente que el propio registro NO
   reaparece, aunque otro dispositivo todavía lo tenga. Así las eliminaciones
   se propagan sin sacrificar la protección contra pérdida de datos nuevos. */
var _SCI_TOMB_KEY = 'sci_tombstones';
function _sciGetTombstones(){
  try{
    var c = (STATE.cache.config && STATE.cache.config[_SCI_TOMB_KEY]) || null;
    return (c && c.tombs && typeof c.tombs==='object') ? c.tombs : {};
  }catch(e){ return {}; }
}
/* Marca un id como eliminado en un store (registra timestamp) y sincroniza. */
async function sciMarcarEliminado(store, id){
  try{
    var tombs = _sciGetTombstones();
    if(!tombs[store]) tombs[store] = {};
    tombs[store][String(id)] = Date.now();
    var obj = { key:_SCI_TOMB_KEY, tombs: tombs, _updatedAt:new Date().toISOString() };
    STATE.cache.config = STATE.cache.config || {};
    STATE.cache.config[_SCI_TOMB_KEY] = obj;
    await dbPut('config', obj); // dbPut sincroniza config a la nube
  }catch(e){ console.error('tombstone error:', e); }
}
/* ¿El registro (rec) está eliminado? True si hay lápida con timestamp >= _mod. */
function _sciEstaEliminado(store, rec, key){
  if(!rec || rec[key]===undefined) return false;
  var tombs = _sciGetTombstones();
  var st = tombs[store]; if(!st) return false;
  var tomb = st[String(rec[key])];
  if(tomb==null) return false;
  var mod = rec._mod || 0;
  // Si el registro fue modificado DESPUÉS de la lápida, significa que se re-creó
  // intencionalmente → no se considera eliminado. Si no, está eliminado.
  return mod <= tomb;
}

/* Mapa de stores acumulativos (donde perder un registro es grave) y sus claves.
   Compartido por la recepción (applyRemote) y la subida (push) para que ningún
   dispositivo borre datos que otro creó. */
var SCI_STORES_ACUMULATIVOS = {
  'invplantas':1,'conteos':1,'estimaciones':1,'movements':1,'combustible':1,'aihprop':1,
  'mantenciones':1,'inventoryCounts':1,'audit':1,'lots':1,'ordenescompra':1,'heladas':1,'clima':1
};
function _sciStoreKey(store){
  try{ for(var i=0;i<STORES.length;i++){ if(STORES[i][0]===store) return STORES[i][1]; } }catch(e){}
  return 'id';
}
/* Fusiona dos arrays de registros por clave, conservando todos. Ante misma
   clave, gana el de _mod más reciente (o el segundo si no hay _mod).
   Excluye los registros marcados como eliminados (lápidas) para ese store. */
function _sciMergeArrays(localArr, remoteArr, key, store){
  var mapa = {};
  (localArr||[]).forEach(function(rec){ if(rec && rec[key]!==undefined) mapa[rec[key]] = rec; });
  (remoteArr||[]).forEach(function(rrec){
    if(!rrec || rrec[key]===undefined) return;
    var ex = mapa[rrec[key]];
    if(!ex){ mapa[rrec[key]] = rrec; return; }
    var lm = (ex && ex._mod) ? ex._mod : 0;
    var rm = (rrec && rrec._mod) ? rrec._mod : 0;
    mapa[rrec[key]] = (lm > rm) ? ex : rrec;
  });
  // Filtrar los eliminados (lápidas), si se indicó el store.
  var arr = Object.keys(mapa).map(function(k){ return mapa[k]; });
  if(store){
    arr = arr.filter(function(rec){ return !_sciEstaEliminado(store, rec, key); });
  }
  return arr;
}

async function sciFbPush(immediate){
  var ref = sciFbDocRef();
  if(!ref){ return; }
  if(SCIFB.applyingRemote){ return; }
  if(SCIFB.saveTimer){ clearTimeout(SCIFB.saveTimer); }
  var doSave = async function(){
    try {
      sciFbIndicator('syncing', 'Guardando inventario en la nube...');
      // ── Leer primero el documento remoto actual y FUSIONAR con lo local ──
      // Esto evita que este dispositivo borre registros que otro creó y que
      // aún no hemos recibido. Para los stores acumulativos se fusiona por
      // clave; el resto se sube tal cual está localmente.
      var remoteObj = null;
      try{
        var snap = await ref.get(); try{FBCOUNT.read();}catch(e){}
        if(snap && snap.exists){
          remoteObj = await _sciFbLeerRemoto(snap.data());
        }
      }catch(e){ console.warn('[SCI-Firebase] No se pudo leer remoto antes de subir:', e && e.message); /* se sube lo local */ }

      var newVersion = Date.now();
      SCIFB.lastVersion = newVersion;
      var payloadObj = {};
      var _movCambiaron = false;
      for(var i=0;i<SCIFB.stores.length;i++){
        var store = SCIFB.stores[i];
        var localData = await dbAll(store);
        if(remoteObj && SCI_STORES_ACUMULATIVOS[store] && Array.isArray(remoteObj[store])){
          // Fusionar local + remoto: no perder lo que el otro dispositivo subió.
          payloadObj[store] = _sciMergeArrays(localData, remoteObj[store], _sciStoreKey(store), store);
          // Reflejar la fusión también en la base local, para quedar consistentes.
          try{
            if(payloadObj[store].length !== localData.length){
              if(store==='movements' && _sigMovimientos(localData)!==_sigMovimientos(payloadObj[store])) _movCambiaron = true;
              SCIFB.applyingRemote = true;
              await dbClear(store);
              for(var m=0;m<payloadObj[store].length;m++){ try{ await dbPutLocal(store, payloadObj[store][m]); }catch(e){} }
              SCIFB.applyingRemote = false;
            }
          }catch(e){ SCIFB.applyingRemote = false; }
        } else {
          payloadObj[store] = localData;
        }
      }
      var payload = JSON.stringify(payloadObj);
      // Partir el payload en trozos (ver SCI_CHUNK_CHARS). El batch de
      // Firestore admite hasta 10 MB y 500 operaciones: avisar al pasar 8 MB.
      var chunks = [];
      for(var c=0;c<payload.length;c+=SCI_CHUNK_CHARS){ chunks.push(payload.slice(c, c+SCI_CHUNK_CHARS)); }
      if(!chunks.length) chunks.push('');
      if(payload.length > 8000000){
        try{ toast('⚠ Sincronización en riesgo','Los datos del inventario superan 8 MB. Contacte al administrador para depurar registros antiguos.','warning'); }catch(e){}
        try{ console.warn('Payload SCI grande:', payload.length); console.table(_sciFbTamanos(payloadObj)); }catch(e){}
      }
      var userName = '';
      try { if(STATE && STATE.user){ userName = STATE.user.nombre || STATE.user.id || ''; } }catch(e){}
      var batch = firebase.firestore().batch();
      for(var q=0;q<chunks.length;q++){
        batch.set(sciFbChunkRef(q), { data: chunks[q], _version: newVersion });
        try{FBCOUNT.write();}catch(e){}
      }
      // set() sin merge reemplaza el doc principal: elimina el 'payload' antiguo.
      batch.set(ref, {
        _chunks: chunks.length,
        _size: payload.length,
        _version: newVersion,
        _clientId: SCIFB.clientId,
        _updatedBy: userName,
        _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      try{FBCOUNT.write();}catch(e){}
      await batch.commit();
      SCIFB.online = true;
      SCIFB.pendiente = false;
      try{ localStorage.removeItem('SCI_SYNC_PENDIENTE'); }catch(e){}
      sciFbIndicator('online', 'Inventario guardado en la nube');
      // Si fusionamos algo nuevo desde la nube, refrescar el cache y la vista.
      try{ if(typeof reloadCache==='function'){ await reloadCache(); } }catch(e){}
      // Si la fusión trajo movimientos de otro dispositivo, los saldos locales
      // quedan desfasados: recalcular y redibujar sin esperar a reabrir la app.
      if(_movCambiaron && typeof _ejecutarRecalculoStock==='function'){
        try{ await _ejecutarRecalculoStock(); _refrescarVistaSegura(); }
        catch(e){ console.error('[SCI-Firebase] Recálculo tras fusión falló:', e); }
      }
    } catch(err){
      SCIFB.online = false;
      SCIFB.pendiente = true;
      try{ localStorage.setItem('SCI_SYNC_PENDIENTE', new Date().toISOString()); }catch(e){}
      console.error('[SCI-Firebase] Error al guardar:', err);
      sciFbIndicator('offline', '⚠ Cambios sin subir a la nube — reintentando');
      // Reintento automático en 15s mientras haya cambios pendientes
      try{ clearTimeout(SCIFB._retryTimer); }catch(e){}
      SCIFB._retryTimer = setTimeout(function(){ try{ sciFbPush(true); }catch(e){} }, 15000);
    }
  };
  if(immediate){ await doSave(); }
  else { SCIFB.saveTimer = setTimeout(doSave, 1000); }
}

// Indicador visual del SCI (en el topbar)
function sciFbIndicator(state, msg){
  var el = document.getElementById('sci-sync-indicator');
  if(!el) return;
  var colors = { online:'#22c55e', syncing:'#eab308', connecting:'#3b82f6', offline:'#ef4444' };
  var labels = { online:'En línea', syncing:'Guardando...', connecting:'Conectando...', offline:'Sin conexión' };
  var color = colors[state] || '#999';
  var label = labels[state] || state;
  el.style.display = 'flex';
  el.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+color+';margin-right:5px;'+(state==='syncing'||state==='connecting'?'animation:ccPulse 1s infinite':'')+'"></span>'+
    '<span style="font-size:11px;color:var(--mu)">'+label+'</span>';
  el.title = msg || label;
}

/* ═══════════════ HASH (SHA-256) ═══════════════ */
async function sha256(text){
  const buf=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ═══════════════ STATE ═══════════════ */
const STATE={
  user:null,
  page:'dashboard',
  cache:{products:[],warehouses:[],groups:[],productTypes:[],providers:[],customers:[],costCenters:[],inventoryCounts:[],movements:[],ordenescompra:[],stock:[],lots:[],users:[],config:{},mantenciones:[],conteos:[],estimaciones:[],invplantas:[],combustible:[],aihprop:[],heladas:[],clima:[]}
};

// ── Advertencia al cerrar / recargar / volver atrás (evita salir por error) ──
// ═══════════════ SISTEMA DE TEMAS (SAP azul / Forestal verde) ═══════════════
function getTema(){ try{ return localStorage.getItem('sci_tema')||'sap'; }catch(e){ return 'sap'; } }
function cambiarTema(tema){
  aplicarTema(tema);
  _resaltarTemaCard(tema);
  if(typeof toast==='function') toast('Apariencia actualizada', tema==='forestal'?'Paleta verde forestal aplicada':'Paleta azul corporativo aplicada','success');
}
function _resaltarTemaCard(tema){
  var sap=document.getElementById('tema-card-sap');
  var fore=document.getElementById('tema-card-forestal');
  if(sap) sap.style.borderColor = (tema==='sap')?'#0a6ed1':'var(--bo)';
  if(sap) sap.style.background = (tema==='sap')?'#f5f9fd':'transparent';
  if(fore) fore.style.borderColor = (tema==='forestal')?'#2d5a1b':'var(--bo)';
  if(fore) fore.style.background = (tema==='forestal')?'#f0f7f2':'transparent';
}
function aplicarTema(tema){
  try{ localStorage.setItem('sci_tema', tema); }catch(e){}
  var styleEl = document.getElementById('tema-forestal-css');
  if(!styleEl) return;
  if(tema==='forestal'){
    // Sobreescribe variables CSS y los colores SAP hardcodeados más visibles → verde forestal.
    // Usa atributo [style*="..."] para alcanzar los colores en línea sin recorrer el DOM.
    var css =
      ':root{--gd:#0a3622 !important;--gm:#2d5a1b !important;--gl:#2d5a1b !important;--ga:#84c49a !important;--gp:#f0f7f2 !important;--bg:#f5f8f4 !important;--gold:#b8860b !important;}'+
      '.topbar{background:#1e3d0f !important;border-bottom-color:#143007 !important}'+
      '.nav-item.active{background:linear-gradient(135deg,#2d5a1b,#1e3d0f) !important}'+
      '.cc-nav-btn.cc-act,.cc-nav-btn.active{background:#1e3d0f !important}'+
      '.fr-subtab.fr-act{background:#2d5a1b !important;color:#fff !important}'+
      '.btn-primary{background:#2d5a1b !important;border-color:#2d5a1b !important}'+
      '.cc-btn-g{background:#2d5a1b !important}'+
      // Colores hardcodeados frecuentes mediante selector de atributo
      '[style*="#354a5f"]{--x:0}'+
      'body [style*="background:#354a5f"],body [style*="background:linear-gradient(90deg,#23303d,#0854a0)"]{background:#1e3d0f !important}'+
      'body [style*="background:linear-gradient(135deg,#23303d,#0854a0)"]{background:linear-gradient(135deg,#0a3622,#2d5010) !important}'+
      'body [style*="color:#0a6ed1"]{color:#2d5a1b !important}'+
      'body [style*="color:#0854a0"]{color:#2d5010 !important}'+
      'body [style*="background:#0a6ed1"]{background:#2d5a1b !important}'+
      'body [style*="background:#0854a0"]{background:#2d5010 !important}'+
      'body [style*="background:#d1e8ff"]{background:#d4f0b8 !important}'+
      'body [style*="background:#f5f9fd"],body [style*="background:#fafcff"],body [style*="background:#f0f7ff"],body [style*="background:#eef3f8"]{background:#f0f7f2 !important}'+
      'body [style*="border:1px solid #d1e8ff"]{border-color:#c8e0b8 !important}';
    styleEl.textContent = css;
    document.documentElement.setAttribute('data-tema','forestal');
  } else {
    styleEl.textContent = '';
    document.documentElement.setAttribute('data-tema','sap');
  }
}

// ── Botón atrás en móvil: mantener la app activa (history.pushState/popstate) ──
// Estrategia con pila interna de navegación (_sciNavStack):
//   • Cada navigate() que NO viene del history apila la página visitada.
//   • Al presionar 'atrás', popstate saca la página actual y navega a la
//     anterior de la pila (retroceso real dentro de la app).
//   • Si la pila ya está en la raíz (una sola página), re-apilamos un estado
//     para NO salir de la app: cerrar solo ocurre vía 'Cerrar sesión'.
var _sciNavStack = [];
function sciSeedHistory(){
  // Siembra el estado base al iniciar sesión (idempotente).
  try{
    if(STATE && STATE.user){
      // Para OP. CONTEOS la raíz es el MENÚ (no el dashboard): usamos el marcador
      // '__menu__' para que el botón atrás vuelva al menú de elección, no al dashboard.
      var p = (STATE.user.role==='opconteos') ? '__menu__' : (STATE.page || 'dashboard');
      _sciNavStack = [p];
      history.replaceState({sciPage:p, depth:0}, '', location.pathname + location.search + '#' + (p==='__menu__'?'menu':p));
    }
  }catch(e){}
}
window.addEventListener('popstate', function(ev){
  // Sin sesión: no interferir con el comportamiento normal del navegador.
  if(!STATE || !STATE.user) return;
  // Primero: si estamos en una sub-vista del Inventario de Huerto, dejar que
  // ese módulo maneje el 'atrás' (volver a su inicio en vez de salir).
  try{
    if(typeof ipManejarAtras==='function' && ipManejarAtras()){
      // Re-apilar para no perder el punto de retorno del módulo.
      try{ history.pushState({sciPage:'invplantas'}, '', location.pathname+location.search+'#invplantas'); }catch(e){}
      return;
    }
  }catch(e){}
  // Quitar la página actual de la pila.
  if(_sciNavStack.length > 1){
    _sciNavStack.pop();
    var anterior = _sciNavStack[_sciNavStack.length - 1] || 'dashboard';
    try{
      if(anterior==='__menu__'){ if(typeof mostrarMenuConteos==='function') mostrarMenuConteos(); }
      else { navigate(anterior, true); }
    }catch(e){ try{ navigate('dashboard', true); }catch(_e){} }
    // Reflejar la profundidad actual en el history (sin volver a apilar página).
    try{ history.replaceState({sciPage:anterior, depth:_sciNavStack.length-1}, '', location.pathname + location.search + '#' + anterior); }catch(e){}
  } else {
    // En la raíz: re-apilar para mantener la app abierta (atrás no la cierra).
    var raiz = _sciNavStack[0] || 'dashboard';
    if(raiz==='__menu__' && typeof mostrarMenuConteos==='function'){ mostrarMenuConteos(); }
    try{ history.pushState({sciPage:raiz, depth:0}, '', location.pathname + location.search + '#' + (raiz==='__menu__'?'menu':raiz)); }catch(e){}
  }
});

window.addEventListener('beforeunload', function(e){
  // Solo advertir si hay un usuario con sesión iniciada
  if(STATE && STATE.user){
    e.preventDefault();
    e.returnValue = ''; // requerido por algunos navegadores para mostrar el aviso
    return '';
  }
});

const PERMISSIONS=[
  ['productos.ver','Ver productos'],
  ['productos.crear','Crear/editar productos'],
  ['productos.eliminar','Eliminar productos'],
  ['bodegas.ver','Ver bodegas'],
  ['bodegas.crear','Crear/editar bodegas'],
  ['proveedores.ver','Ver proveedores'],
  ['proveedores.crear','Crear/editar proveedores'],
  ['clientes.ver','Ver clientes'],
  ['clientes.crear','Crear/editar clientes'],
  ['centrosCosto.ver','Ver centros de costo'],
  ['centrosCosto.crear','Crear/editar centros de costo'],
  ['tomas.ver','Ver tomas de inventario'],
  ['tomas.crear','Iniciar y capturar tomas de inventario'],
  ['tomas.autorizar','Autorizar y aplicar ajustes de inventario'],
  ['movimientos.ver','Ver movimientos'],
  ['movimientos.crear','Crear movimientos'],
  ['combustible.registrar','Registrar salidas de combustible (petróleo/gasolina)'],
  ['movimientos.editar','Editar movimientos'],
  ['movimientos.anular','Anular movimientos'],
  ['stock.ver','Ver stock'],
  ['usuarios.ver','Ver usuarios'],
  ['usuarios.crear','Crear/editar usuarios'],
  ['config.ver','Ver configuración'],
  ['config.editar','Editar configuración'],
  ['cuaderno.ver','Ver Cuaderno de Campo'],
  ['cuaderno.editar','Editar Cuaderno de Campo (registros, órdenes, paños)'],
  ['cuaderno.confirmar','Confirmar aplicaciones de órdenes'],
  ['cuaderno.panos','Gestionar paños (crear, editar, eliminar)'],
  ['presupuesto.ver','Ver Control de Presupuesto (Huerto Cerezos)'],
  ['presupuesto.editar','Actualizar datos del Control de Presupuesto (subir Excel)'],
  ['mantenciones.ver','Ver módulo de Servicio y Mantención'],
  ['mantenciones.crear','Crear y editar órdenes de trabajo'],
  ['mantenciones.facturar','Registrar facturas de servicio y mantención'],
  ['mantenciones.eliminar','Eliminar órdenes de trabajo y facturas'],
  ['conteos.ver','Acceder al módulo de Conteos en terreno'],
  ['conteos.revisar','Revisar conteos: exportar Excel y aplicar a estimación'],
  ['invplantas.ver','Acceder al Inventario de Huerto (conteo de plantas)'],
  ['invplantas.revisar','Revisar inventario de plantas: exportar y ver mapa'],
  ['invplantas.editar','Editar estado de árboles en el mapa de plantas'],
  ['aih.ver','Acceder a Actualización Inventario Huerto'],
  ['aih.proponer','Proponer cambios de estado de plantas (terreno)'],
  ['aih.aprobar','Aprobar/rechazar propuestas y restaurar versiones del inventario'],
  ['helada.ver','Ver el Control de Heladas y sus registros'],
  ['helada.registrar','Registrar y editar controles de helada de las torres'],
];
const ROLE_PERMS={
  'admin':PERMISSIONS.map(p=>p[0]),
  // Gerente: ve todo (solo lectura en general, pero acceso completo de visualización)
  'gerente':['productos.ver','bodegas.ver','proveedores.ver','clientes.ver','centrosCosto.ver','tomas.ver','movimientos.ver','stock.ver','usuarios.ver','config.ver','cuaderno.ver','mantenciones.ver','presupuesto.ver','helada.ver'],
  // Admin. Agrónomo: gestiona todo el Cuaderno de Campo + ve el inventario
  'agronomo':['productos.ver','bodegas.ver','stock.ver','movimientos.ver','config.ver','cuaderno.ver','cuaderno.editar','cuaderno.confirmar','cuaderno.panos','conteos.ver','conteos.revisar','invplantas.ver','invplantas.revisar','presupuesto.ver','aih.ver','aih.proponer','helada.ver','helada.registrar'],
  'operador':['productos.ver','productos.crear','bodegas.ver','proveedores.ver','proveedores.crear','clientes.ver','clientes.crear','centrosCosto.ver','centrosCosto.crear','movimientos.ver','movimientos.crear','combustible.registrar','stock.ver','tomas.ver','tomas.crear','config.ver','helada.ver','helada.registrar'],
  'consulta':['productos.ver','bodegas.ver','proveedores.ver','clientes.ver','centrosCosto.ver','movimientos.ver','stock.ver','tomas.ver','config.ver','helada.ver'],
  // OP. CONTEOS: solo el módulo de conteos en terreno
  'opconteos':['conteos.ver','invplantas.ver','aih.ver','aih.proponer'],
  // OP. COMBUSTIBLE: solo el formulario de salida de combustible
  'opcombustible':['combustible.registrar']
};
// Etiquetas legibles de cada rol
const ROLE_LABELS={
  'admin':'Administrador',
  'gerente':'Gerente',
  'agronomo':'Admin. Agrónomo',
  'operador':'Operador',
  'consulta':'Consulta',
  'opconteos':'OP. CONTEOS',
  'opcombustible':'OP. COMBUSTIBLE'
};

/* ═══════════ SISTEMAS EXTERNOS (enlaces a otros sistemas) ═══════════ */
// Lee los enlaces guardados en config (sincronizados). Cada enlace:
// { id, nombre, url, icon, roles:[...] }  roles vacío = visible para todos.
function getSistemasExternos(){
  var c = STATE.cache && STATE.cache.config ? STATE.cache.config['sistemasExternos'] : null;
  return (c && Array.isArray(c.links)) ? c.links : [];
}
// Enlaces visibles para el usuario actual según su rol.
function sistemasExternosVisibles(){
  var role = STATE.user ? STATE.user.role : null;
  return getSistemasExternos().filter(function(l){
    if(!l.url) return false;
    if(!l.roles || !l.roles.length) return true; // sin restricción = todos
    return l.roles.indexOf(role) !== -1;
  });
}
async function guardarSistemasExternos(links){
  var obj = { key:'sistemasExternos', links:links };
  STATE.cache.config['sistemasExternos'] = obj;
  await dbPut('config', obj); // dbPut sincroniza a la nube
}
try{ window.getSistemasExternos=getSistemasExternos; window.sistemasExternosVisibles=sistemasExternosVisibles; }catch(e){}

function can(perm){
  if(!STATE.user)return false;
  return (STATE.user.permissions||[]).includes(perm);
}

/* ── Tipos de documento tributario que respaldan ciertos movimientos ── */
const TIPOS_DOC=['FACTURA','FACTURA EXENTA','GUIA DE DESPACHO','BOLETA','NOTA DE CREDITO','NOTA DE DEBITO'];

/* ── Tipos de movimiento operativo (cada uno con su correlativo) ──
   Cada tipo declara qué campos requiere:
   - reqDoc: documento tributario obligatorio (con regla de unicidad)
   - reqProv: proveedor obligatorio
   - reqCli: cliente obligatorio
   - reqCC: centro de costo obligatorio
   - reqBodDest: bodega destino obligatoria (para traspasos) */

const TIPOS_MOV_ENT=[
  {tipo:'COMPRA',                prefijo:'COMP',label:'Compra',                       icon:'🛒', reqDoc:true,  reqProv:true,  reqCC:false, validaUnicidadDoc:true},
  {tipo:'COSECHA A STOCK',       prefijo:'COS', label:'Producto cosechado a stock',   icon:'🍒', reqDoc:false, reqProv:false, reqCC:false, validaUnicidadDoc:false, reqFechaCosecha:true, simple:true},
  {tipo:'DEVOLUCION CC',         prefijo:'DCC', label:'Devolución de centro de costo',icon:'↩️', reqDoc:false, reqProv:false, reqCC:true,  validaUnicidadDoc:false},
  {tipo:'TOMA INVENTARIO ENT',   prefijo:'TIE', label:'Toma de inventario (entrada)', icon:'📋', reqDoc:false, reqProv:false, reqCC:false, validaUnicidadDoc:false},
  {tipo:'MUESTRA GRATIS',        prefijo:'MUE', label:'Muestra gratis',               icon:'🎁', reqDoc:false, reqProv:true,  reqCC:false, validaUnicidadDoc:false}
];

const TIPOS_MOV_SAL=[
  {tipo:'VENTA',                 prefijo:'VTA', label:'Venta',                        icon:'💰', reqDoc:true,  reqCli:true,  reqCC:false, reqBodDest:false, validaUnicidadDoc:true},
  {tipo:'CONSUMO CC',            prefijo:'CCC', label:'Consumo de centro de costo',   icon:'📤', reqDoc:false, reqCli:false, reqCC:true,  reqBodDest:false, validaUnicidadDoc:false},
  {tipo:'TRASPASO BODEGA',       prefijo:'TRB', label:'Traspaso entre bodega',        icon:'🔄', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:true,  validaUnicidadDoc:false},
  {tipo:'MERMA',                 prefijo:'MER', label:'Merma',                        icon:'🗑️', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false},
  {tipo:'DEVOLUCION PROVEEDOR',  prefijo:'DEV', label:'Devolución a proveedor',       icon:'↪️', reqDoc:true,  reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false, reqProv:true},
  {tipo:'TOMA INVENTARIO SAL',   prefijo:'TIS', label:'Salida por toma de inventario',icon:'📋', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false},
  // Generado por el formulario de combustible (que además registra equipo y
  // horómetro). No se ofrece al crear una salida manual —de ahí `oculto`— pero
  // debe existir aquí: sin él, getMovCfg devolvía null y el movimiento no se
  // podía editar ni guardar.
  {tipo:'CONSUMO COMBUSTIBLE',   prefijo:'SAL', label:'Consumo de combustible',       icon:'⛽', reqDoc:false, reqCli:false, reqCC:true,  reqBodDest:false, validaUnicidadDoc:false, oculto:true}
];

function getMovCfg(tipo,tipoMov){
  const arr=tipo==='ENT'?TIPOS_MOV_ENT:TIPOS_MOV_SAL;
  return arr.find(x=>x.tipo===tipoMov)||null;
}
function getMovPrefix(tipo,tipoMov){
  const c=getMovCfg(tipo,tipoMov);
  return c?c.prefijo:tipo;
}
function getMovLabel(tipo,tipoMov){
  const c=getMovCfg(tipo,tipoMov);
  return c?c.label:(tipoMov||'');
}

/* ═══════════════ INIT / SEED ═══════════════ */
async function initDB(){
  await openDB();
  const users=await dbAll('users');
  if(users.length===0){
    const adminPass=await sha256('admin123');
    await dbPut('users',{
      id:'admin',
      nombre:'Administrador',
      passwordHash:adminPass,
      role:'admin',
      permissions:ROLE_PERMS.admin,
      activo:true,
      creado:new Date().toISOString()
    });
    await dbPut('warehouses',{id:'B001',nombre:'Bodega Central',direccion:'',activo:true});
    await dbPut('groups',{nombre:'GENERAL',subgrupos:['VARIOS']});
    await dbPut('config',{key:'counters',ENT:0,SAL:0,TRA:0,AJU:0,COMP:0,DCC:0,TIE:0,MUE:0,VTA:0,CCC:0,TRB:0,MER:0,DEV:0,TIS:0,TOMA:0});
    await dbPut('config',{key:'productCounter',value:0});
    await dbPut('config',{key:'empresa',nombre:'',rut:'',direccion:'',giro:'',telefono:'',correo:'',logo:''});
  }
  const _types=await dbAll('productTypes');
  if(_types.length===0){
    const _defaults=['MERCADERIA','MATERIA PRIMA','PRODUCTO TERMINADO','INSUMO','ACTIVO FIJO','SERVICIO'];
    for(const t of _defaults){
      await dbPut('productTypes',{nombre:t,descripcion:'',activo:true,creado:new Date().toISOString()});
    }
  }
  await reloadCache();
}
async function reloadCache(){
  STATE.cache.products=await dbAll('products');
  STATE.cache.warehouses=await dbAll('warehouses');
  STATE.cache.groups=await dbAll('groups');
  STATE.cache.productTypes=await dbAll('productTypes');
  STATE.cache.providers=await dbAll('providers');
  STATE.cache.customers=await dbAll('customers');
  STATE.cache.costCenters=await dbAll('costCenters');
  STATE.cache.inventoryCounts=await dbAll('inventoryCounts');
  STATE.cache.movements=await dbAll('movements');
  STATE.cache.ordenescompra=await dbAll('ordenescompra');
  STATE.cache.mantenciones=await dbAll('mantenciones');
  STATE.cache.conteos=await dbAll('conteos');
  STATE.cache.invplantas=await dbAll('invplantas');
  STATE.cache.aihprop=await dbAll('aihprop');
  STATE.cache.heladas=await dbAll('heladas');
  STATE.cache.clima=await dbAll('clima');
  // 'combustible' se sincroniza y se escribía en cache solo al registrar una
  // salida: tras recargar la app quedaba vacío hasta el primer consumo nuevo.
  STATE.cache.combustible=await dbAll('combustible');
  // 'stock' es derivado y desde v82 ya NO se sincroniza: la única vía que lo
  // cargaba en memoria era applyRemote. Debe leerse aquí explícitamente.
  STATE.cache.stock=await dbAll('stock');
  STATE.cache.lots=await dbAll('lots');
  STATE.cache.users=await dbAll('users');
  const cfgs=await dbAll('config');
  STATE.cache.config={};
  cfgs.forEach(c=>STATE.cache.config[c.key]=c);
}

/* ═══════════════ AUDIT LOG ═══════════════ */
async function audit(accion,detalle,referencia=''){
  const entry={
    id:Date.now()+'-'+Math.random().toString(36).slice(2,8),
    fecha:new Date().toISOString(),
    usuario:STATE.user?STATE.user.id:'system',
    accion,detalle,referencia
  };
  await dbPut('audit',entry);
  // Auto-purga: mantener solo los 300 registros más recientes (audit es local,
  // no se sincroniza; evita que crezca sin control y sobrecargue IndexedDB).
  try{
    const all=await dbAll('audit');
    if(all.length>350){
      all.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      const borrar=all.slice(300);
      for(const r of borrar){ try{ await dbDelLocal('audit', r.id); }catch(e){} }
    }
  }catch(e){}
}

/* ═══════════════ TOAST ═══════════════ */
/* Utilidad global: valida campos requeridos de un contenedor, marcando en rojo
   los vacíos. Recibe el elemento contenedor (o su id) y una lista opcional de
   ids a validar; si no se pasa lista, valida todos los [required] y [data-req].
   Devuelve true si todo OK, false si hay vacíos (y hace scroll al primero). */
function validarCampos(cont, ids){
  var root = (typeof cont==='string') ? document.getElementById(cont) : cont;
  if(!root) return true;
  // Limpiar marcas previas
  root.querySelectorAll('.campo-error').forEach(function(el){ el.classList.remove('campo-error'); });
  root.querySelectorAll('.campo-error-msg').forEach(function(el){ el.remove(); });
  var campos = ids && ids.length
    ? ids.map(function(id){ return document.getElementById(id); }).filter(Boolean)
    : Array.from(root.querySelectorAll('[required],[data-req]'));
  var primero=null;
  campos.forEach(function(el){
    var v=(el.value||'').toString().trim();
    if(!v){
      el.classList.add('campo-error');
      var fld=el.closest('.form-field'); if(fld) fld.classList.add('campo-error');
      if(!primero) primero=el;
    }
  });
  // Quitar la marca al empezar a escribir
  campos.forEach(function(el){
    if(!el._valBound){
      el._valBound=true;
      el.addEventListener('input', function(){ el.classList.remove('campo-error'); var f=el.closest('.form-field'); if(f) f.classList.remove('campo-error'); });
      el.addEventListener('change', function(){ el.classList.remove('campo-error'); var f=el.closest('.form-field'); if(f) f.classList.remove('campo-error'); });
    }
  });
  if(primero){
    try{ primero.scrollIntoView({behavior:'smooth',block:'center'}); primero.focus(); }catch(e){}
    toast('Faltan datos','Complete los campos marcados en rojo','error');
    return false;
  }
  return true;
}
try{ window.validarCampos=validarCampos; }catch(e){}

function toast(title,msg='',type='success'){
  const el=document.createElement('div');
  el.className='toast '+type;
  el.innerHTML=`<div class="toast-title">${title}</div>${msg?`<div class="toast-msg">${msg}</div>`:''}`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>{el.style.animation='toastOut .25s ease forwards';setTimeout(()=>el.remove(),250)},3500);
}

/* ═══════════════ LOGIN ═══════════════ */
async function _buscarUsuarioPorEmail(email){
  const target=String(email||'').trim().toLowerCase();
  if(!target) return null;
  try{
    const todos=await dbAll('users');
    for(const u of (todos||[])){
      if(u && u.email && String(u.email).trim().toLowerCase()===target) return u;
    }
  }catch(e){ console.error('Error buscando usuario por email:',e); }
  return null;
}

async function _intentarRescateAdmin(email){
  try{
    const todos=await dbAll('users')||[];
    const yaHayEmails=todos.some(u=>u && u.email && String(u.email).trim());
    if(yaHayEmails) return null;
    const adminsSinEmail=todos.filter(u=>u && u.activo && u.role==='admin' && !(u.email&&String(u.email).trim()));
    if(!adminsSinEmail.length) return null;
    let adminObj=adminsSinEmail[0];
    if(adminsSinEmail.length>1){
      const ids=adminsSinEmail.map(a=>a.id).join(', ');
      const elegido=(prompt('Primer acceso: ¿a qué usuario administrador se asocia este correo?\nIDs: '+ids)||'').trim().toLowerCase();
      const found=adminsSinEmail.find(a=>a.id===elegido);
      if(!found) return null;
      adminObj=found;
    } else {
      const ok=confirm('Primer acceso con correo. ¿Asociar este correo ('+email+') al administrador "'+adminObj.id+'"?');
      if(!ok) return null;
    }
    adminObj.email=String(email).trim().toLowerCase();
    await dbPut('users',adminObj);
    try{ await audit('usuario.enlazar','Enlace inicial de correo admin',adminObj.id); }catch(e){}
    return adminObj;
  }catch(e){ console.error('Error en rescate admin:',e); return null; }
}

async function doLogin(){
  const email=document.getElementById('loginUser').value.trim().toLowerCase();
  const pass=document.getElementById('loginPass').value;
  const errEl=document.getElementById('loginError');
  errEl.classList.remove('show');
  if(!email||!pass){errEl.textContent='Ingrese correo y contraseña';errEl.classList.add('show');return}

  if(typeof firebase==='undefined' || !firebase.auth){
    errEl.textContent='Sin conexión con el servidor de acceso. Revise su internet e intente de nuevo.';
    errEl.classList.add('show');return;
  }
  errEl.textContent='Verificando acceso...';errEl.classList.add('show');
  try{
    await firebase.auth().signInWithEmailAndPassword(email, pass);
  }catch(e){
    const code=(e&&e.code)||'';
    let msg='No se pudo iniciar sesión';
    if(code==='auth/invalid-email') msg='Correo con formato inválido';
    else if(code==='auth/user-disabled') msg='Esta cuenta está deshabilitada';
    else if(code==='auth/user-not-found'||code==='auth/wrong-password'||code==='auth/invalid-credential') msg='Correo o contraseña incorrectos';
    else if(code==='auth/too-many-requests') msg='Demasiados intentos. Espere unos minutos.';
    else if(code==='auth/network-request-failed') msg='Sin conexión. Revise su internet.';
    errEl.textContent=msg;errEl.classList.add('show');
    return;
  }

  errEl.textContent='Cargando datos...';
  try{
    if(typeof sciFbInit==='function' && (typeof SCIFB==='undefined' || !SCIFB.ready)){ sciFbInit(); }
    if(typeof sciFbWaitForSync==='function'){ await sciFbWaitForSync(8000); }
  }catch(e){ console.error('Error arrancando sync tras login:',e); }

  let u=await _buscarUsuarioPorEmail(email);
  if(!u){
    if(typeof sciFbWaitForSync==='function'){ await sciFbWaitForSync(4000); }
    u=await _buscarUsuarioPorEmail(email);
  }
  if(!u){ u=await _intentarRescateAdmin(email); }
  errEl.classList.remove('show');
  if(!u){
    try{ await firebase.auth().signOut(); }catch(e){}
    errEl.textContent='Tu cuenta no tiene un perfil de usuario en el sistema. Avisa al administrador.';
    errEl.classList.add('show');return;
  }
  if(!u.activo){
    try{ await firebase.auth().signOut(); }catch(e){}
    errEl.textContent='Usuario inactivo. Contacta al administrador.';
    errEl.classList.add('show');return;
  }
  STATE.user=u;
  await audit('login','Inicio de sesión',u.id);
  try{ _startInactivityWatch(); }catch(e){}
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').classList.add('show');
  // OP. CONTEOS: modo pantalla completa para móvil (oculta menú lateral y barra superior)
  if(STATE.user && STATE.user.role==='opconteos'){
    document.body.classList.add('solo-conteos');
  } else {
    document.body.classList.remove('solo-conteos');
  }
  setTimeout(refreshBackupAlert,100);
  // Verificación de consistencia al iniciar (solo admin).
  // IMPORTANTE: esperar a que la sincronización con la nube termine y el cache
  // esté completo; si se verifica antes, se comparan movimientos incompletos
  // contra un stock ya sincronizado y se reportan inconsistencias falsas.
  if(u.role==='admin'){
    (async()=>{
      try{
        // Esperar a que la sincronización inicial termine (hasta 20s)
        const t0=Date.now();
        while(Date.now()-t0 < 20000){
          if(typeof SCIFB!=='undefined' && SCIFB.ready && SCIFB.online) break;
          await new Promise(r=>setTimeout(r,500));
        }
        await new Promise(r=>setTimeout(r,2000)); // margen tras el primer snapshot
        try{ if(typeof reloadCache==='function') await reloadCache(); }catch(e){}
        // Nombres de equipos/torres a forma canónica (idempotente, v144)
        try{ if(typeof sciNormalizarNombresEquipos==='function' && STATE.user && STATE.user.role==='admin') await sciNormalizarNombresEquipos(); }catch(e){ console.error('Normalización de equipos falló:',e); }
        await new Promise(r=>setTimeout(r,1000));
        const check=await detectarInconsistenciaStock();
        if(!check.ok&&check.diferencias.length>0){
          const total=check.diferencias.length;
          // El stock es DERIVADO de los movimientos (no se sincroniza desde v81).
          // Si diverge, se reconstruye solo, sin intervención del usuario.
          if(typeof _ejecutarRecalculoStock==='function'){
            try{
              console.warn('Inconsistencias de stock detectadas:',check.diferencias);
              const res=await _ejecutarRecalculoStock();
              const check2=await detectarInconsistenciaStock();
              if(check2.ok){
                // Los saldos ya están recalculados en cache, pero la pantalla
                // se dibujó antes: hay que volver a pintarla o el usuario
                // seguiría viendo los valores viejos hasta reabrir la app.
                const refrescado=_refrescarVistaSegura();
                toast('Stock reconstruido',
                  `Se detectaron ${total} saldo(s) desactualizado(s) y se recalcularon automáticamente desde los movimientos.`+
                  (refrescado?'':' Vuelva a abrir la pantalla para ver los saldos nuevos.'),
                  'success');
              }else{
                const d0=check2.diferencias[0];
                let nom='';
                try{ const cod=String(d0.key).split('|')[0]; const p=getProduct(cod); nom=p?(p.descripcion||cod):cod; }catch(e){}
                toast('⚠ Inconsistencia en stock',`${check2.diferencias.length} producto(s) siguen con saldo distinto tras recalcular.${nom?` Ej: ${nom} (actual ${d0.cantActual}, esperado ${d0.cantEsperada}).`:''}`,'warning');
                console.warn('Inconsistencias persistentes:',check2.diferencias);
              }
            }catch(e){ console.error('Auto-recálculo de stock falló:',e); }
          }
        }
      }catch(e){console.error('Error verificando consistencia:',e)}
    })();
  }
  document.getElementById('userChipName').textContent=u.nombre||u.id;
  document.getElementById('userChipRole').textContent=(ROLE_LABELS[u.role]||u.role);
  document.getElementById('userAvatar').textContent=(u.nombre||u.id).charAt(0).toUpperCase();
  renderSidebar();
  applyCompanyBranding();
  // Firebase del SCI ya fue inicializado al arrancar (antes del login)
  if(typeof sciFbInit === 'function' && (typeof SCIFB==='undefined' || !SCIFB.ready)){
    try{ sciFbInit(); }catch(e){ console.error('Error al iniciar sync SCI:', e); }
  }
  // OP. CONTEOS: en móvil mostrar PRIMERO la barra lateral (sus 2 opciones:
  // Conteos en terreno / Inventario de Huerto) para que elija qué conteo
  // realizar. En escritorio el menú ya es visible, así que entra a conteos.
  if(STATE.user && STATE.user.role==='opconteos'){
    // OP. CONTEOS SIEMPRE ve primero la barra lateral con sus 2 opciones
    // (Conteos en terreno / Inventario de Huerto). No entra a ningún módulo
    // ni al dashboard. Funciona igual en móvil y escritorio.
    mostrarMenuConteos();
  } else if(STATE.user && STATE.user.role==='opcombustible'){
    // OP. COMBUSTIBLE: pantalla completa, directo al formulario de salida de combustible
    document.body.classList.add('solo-conteos');
    renderCombustibleForm(document.getElementById('mainContent'));
  } else {
    navigate('dashboard');
  }
  // Cambios sin subir de una sesión anterior: en vez de avisar de inmediato,
  // intentar subir primero. Si el push tiene éxito, la marca se limpia sola y no
  // se molesta al usuario. Solo se avisa si el reintento realmente falla.
  try{
    if(localStorage.getItem('SCI_SYNC_PENDIENTE')){
      setTimeout(async function(){
        try{
          if(typeof sciFbPush==='function'){ await sciFbPush(true); }
          // Si el push no lanzó error, la marca ya se limpió dentro de sciFbPush.
          if(!localStorage.getItem('SCI_SYNC_PENDIENTE')){
            if(typeof toast==='function') toast('Sincronizado','Los cambios pendientes se subieron a la nube.','success');
          } else {
            if(typeof toast==='function') toast('⚠ Cambios sin subir','Hay datos guardados localmente que no se sincronizaron. Se reintentará automáticamente al conectar.','warning');
          }
        }catch(e){
          if(typeof toast==='function') toast('⚠ Cambios sin subir','Hay datos guardados localmente que no se sincronizaron. Se reintentará automáticamente al conectar.','warning');
        }
      }, 2500);
    }
  }catch(e){}
  // Recordatorio de respaldo consolidado (admin, cada 10 días)
  try{ if(typeof verificarRecordatorioRespaldo==='function') verificarRecordatorioRespaldo(); }catch(e){}
  // Sembrar el history para el botón atrás (móvil)
  try{ sciSeedHistory(); }catch(e){}
  // Aplicar el tema de color guardado
  try{ if(typeof aplicarTema==='function') aplicarTema(getTema()); }catch(e){}
}
async function logout(){
  // Los datos se sincronizan automáticamente en la nube (Firebase),
  // por lo que ya no es necesario forzar un backup al cerrar sesión.
  await _doLogout();
}

/* ═══════════════ AUTO-CIERRE POR INACTIVIDAD (5 min) ═══════════════ */
/* Cierra la sesión automáticamente tras 5 minutos sin actividad del usuario.
   Antes de cerrar, fuerza el guardado de cualquier dato pendiente en la nube,
   para no perder información. La actividad (mouse, teclado, toque, scroll)
   reinicia el contador. */
var INACTIVITY_MS = 5 * 60 * 1000; // 5 minutos
var _inactivityTimer = null;
var _inactivityBound = false;
function _resetInactivityTimer(){
  if(!STATE.user) return; // solo cuenta si hay sesión activa
  if(_inactivityTimer){ clearTimeout(_inactivityTimer); }
  _inactivityTimer = setTimeout(_autoLogoutPorInactividad, INACTIVITY_MS);
}
async function _autoLogoutPorInactividad(){
  if(!STATE.user) return;
  // Antes de cerrar, intentar subir lo pendiente a la nube (no perder datos).
  try{ if(typeof sciFbPush==='function' && typeof SCIFB!=='undefined' && SCIFB.ready){ sciFbPush(true); } }catch(e){}
  try{ if(typeof fbPush==='function' && typeof FB!=='undefined' && FB.ready){ fbPush(true); } }catch(e){}
  // Pequeña espera para dar tiempo al guardado, luego cerrar.
  setTimeout(async function(){
    try{ await _doLogout(); }catch(e){}
    try{ if(typeof toast==='function'){ toast('Sesión cerrada','Tu sesión se cerró automáticamente por inactividad (5 min).','info'); } }catch(e){}
  }, 600);
}
function _startInactivityWatch(){
  // Cierre automático por inactividad DESACTIVADO: en terreno pueden ocurrir
  // pausas largas (distracciones, traslados) sin que deba cerrarse la sesión.
  // Se deja la función como no-op para no romper las llamadas existentes.
  return;
}
function _stopInactivityWatch(){
  if(_inactivityTimer){ clearTimeout(_inactivityTimer); _inactivityTimer = null; }
}

async function _doLogout(){
  try{ _stopInactivityWatch(); }catch(e){}
  if(STATE.user)await audit('logout','Cierre de sesión',STATE.user.id);
  try{ if(typeof firebase!=='undefined' && firebase.auth && firebase.auth().currentUser){ await firebase.auth().signOut(); } }catch(e){}
  STATE.user=null;
  document.getElementById('app').classList.remove('show');
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
}

/* ═══════════════ NAV ═══════════════ */
const PAGES=[
  {section:'PRINCIPAL',items:[
    {id:'dashboard',label:'Dashboard',icon:'📊',perm:null},
    {id:'sistemasExternos',label:'Gestionar enlaces',icon:'🔗',perm:null,adminOnly:true},
  ]},
  {section:'INVENTARIO',items:[
    {id:'productos',label:'Productos',icon:'📦',perm:'productos.ver'},
    {id:'bodegas',label:'Bodegas',icon:'🏭',perm:'bodegas.ver'},
    {id:'proveedores',label:'Proveedores',icon:'🚚',perm:'proveedores.ver'},
    {id:'clientes',label:'Clientes',icon:'👤',perm:'clientes.ver'},
    {id:'centrosCosto',label:'Centros de Costo',icon:'🏢',perm:'centrosCosto.ver'},
    {id:'stock',label:'Stock por Bodega',icon:'📋',perm:'stock.ver'},
  ]},
  {section:'OPERACIÓN',items:[
    {id:'movimientos',label:'Movimientos',icon:'🔄',perm:'movimientos.ver'},
    {id:'entradas',label:'Nueva Entrada',icon:'⬇️',perm:'movimientos.crear'},
    {id:'salidas',label:'Nueva Salida',icon:'⬆️',perm:'combustible.registrar'},
    {id:'ordenesCompra',label:'Órdenes de Compra',icon:'🧾',perm:'movimientos.ver'},
    {id:'tomas',label:'Tomas de Inventario',icon:'📋',perm:'tomas.ver'},
    {id:'repCombustible',label:'Rendimiento combustible',icon:'⛽',perm:'combustible.registrar',adminOnly:true},
    {id:'helada',label:'Control de Heladas',icon:'❄️',perm:'helada.ver'},
  ]},
  {section:'CUADERNO DE CAMPO',items:[
    {id:'cuaderno',label:'Cuaderno de Campo',icon:'🌳',perm:'cuaderno.ver'},
  ]},
  {section:'MANTENCIONES',items:[
    {id:'mantenciones',label:'Servicio y Mantención',icon:'🔧',perm:'mantenciones.ver'},
  ]},
  {section:'TERRENO',items:[
    {id:'conteos',label:'Conteos en terreno',icon:'🌸',perm:'conteos.ver'},
    {id:'invplantas',label:'Inventario de Huerto',icon:'🌳',perm:'invplantas.ver'},
    {id:'aih',label:'Actualización Inventario',icon:'🔄',perm:'aih.ver'},
  ]},
  {section:'CONTROL DE PRESUPUESTO',items:[
    {id:'presupuesto',label:'Control de Presupuesto',icon:'📊',perm:'presupuesto.ver'},
  ]},
  {section:'ADMINISTRACIÓN',items:[
    {id:'usuarios',label:'Usuarios',icon:'👥',perm:'usuarios.ver'},
    {id:'config',label:'Configuración',icon:'⚙️',perm:'config.ver'},
    {id:'auditoria',label:'Auditoría',icon:'📜',perm:null,adminOnly:true},
  ]},
];

function renderSidebar(){
  const nav=document.getElementById('sideNav');
  let html='';
  PAGES.forEach(sec=>{
    const visibleItems=sec.items.filter(it=>{
      if(it.adminOnly && STATE.user.role!=='admin')return false;
      // OP. CONTEOS solo ve sus módulos de terreno (no el Dashboard ni otros)
      if(STATE.user.role==='opconteos' && it.id!=='conteos' && it.id!=='invplantas')return false;
      return !it.perm || can(it.perm);
    });
    if(visibleItems.length===0)return;
    // ¿Esta sección contiene la página activa? Si sí, forzar expandida
    const tieneActiva = visibleItems.some(it=>it.id===STATE.page);
    const colapsada = _navColapsadas[sec.section] && !tieneActiva;
    html+=`<div class="nav-section ${colapsada?'nav-collapsed':''}" data-section="${escapeHtml(sec.section)}">`+
      `<div class="nav-label nav-label-toggle" onclick="toggleNavSection('${escapeHtml(sec.section)}')">`+
        `<span>${sec.section}</span><span class="nav-chevron">${colapsada?'▸':'▾'}</span>`+
      `</div>`+
      `<div class="nav-section-items">`;
    visibleItems.forEach(it=>{
      html+=`<div class="nav-item ${STATE.page===it.id?'active':''}" onclick="navigate('${it.id}')">
        <span class="nav-item-icon">${it.icon}</span>${it.label}
      </div>`;
    });
    html+=`</div></div>`;
    // Tras la sección PRINCIPAL, insertar los enlaces a sistemas externos (abren en pestaña nueva)
    if(sec.section==='PRINCIPAL'){
      const ext = (typeof sistemasExternosVisibles==='function') ? sistemasExternosVisibles() : [];
      if(ext.length){
        html+=`<div class="nav-section" data-section="SISTEMAS EXTERNOS">`+
          `<div class="nav-label"><span>SISTEMAS EXTERNOS</span></div>`+
          `<div class="nav-section-items">`;
        ext.forEach(l=>{
          const safeUrl = String(l.url||'').replace(/"/g,'&quot;').replace(/'/g,"\\'");
          html+=`<div class="nav-item" onclick="abrirSistemaExterno('${safeUrl}')" style="text-transform:none">`+
            `<span class="nav-item-icon">${escapeHtml(l.icon||'🔗')}</span><span style="text-transform:none">${escapeHtml(l.nombre||'Enlace')}</span>`+
            `<span style="margin-left:auto;opacity:.6;font-size:12px">↗</span>`+
          `</div>`;
        });
        html+=`</div></div>`;
      }
    }
  });
  html+=`<div class="nav-section" style="margin-top:auto"><div class="nav-item" onclick="logout()" style="color:rgba(255,180,180,.85)"><span class="nav-item-icon">🚪</span>Cerrar sesión</div></div>`;
  nav.innerHTML=html;
}
// Estado de secciones colapsadas (persiste en localStorage)
var _navColapsadas = (function(){
  try{ return JSON.parse(localStorage.getItem('sci_nav_colapsadas')||'{}'); }catch(e){ return {}; }
})();
function toggleNavSection(seccion){
  _navColapsadas[seccion] = !_navColapsadas[seccion];
  try{ localStorage.setItem('sci_nav_colapsadas', JSON.stringify(_navColapsadas)); }catch(e){}
  renderSidebar();
}

/* ── Puente: superficie total (ha) de cerezos Plantación 2018 del Cuaderno ──
   El módulo de presupuesto está encapsulado y no ve S.panos directamente; esta
   función global le permite obtener la suma de hectáreas de los paños 2018. */
function pzSumaHaPlantacion(anio){
  try{
    // Asegurar que el estado del Cuaderno (S.panos) esté cargado: el Cuaderno
    // lee sus datos de localStorage vía load(); si aún no se ha entrado al
    // módulo Cuaderno en esta sesión, S.panos puede estar vacío.
    var panos = (typeof S!=='undefined' && S && Array.isArray(S.panos)) ? S.panos : null;
    if((!panos || !panos.length) && typeof load==='function'){
      try{ load(); panos = (typeof S!=='undefined' && S && Array.isArray(S.panos)) ? S.panos : panos; }catch(e){}
    }
    if(!panos || !panos.length) return null;
    var target = String(anio);
    var suma = panos.filter(function(p){ return String(p.anio)===target; })
                    .reduce(function(s,p){ return s + (parseFloat(p.hectareas)||0); }, 0);
    return (suma>0) ? suma : null;
  }catch(e){ return null; }
}
window.pzSumaHaPlantacion = pzSumaHaPlantacion;
// Compatibilidad: la variante 2018 sigue disponible.
function pzSumaHa2018(){ return pzSumaHaPlantacion('2018'); }
window.pzSumaHa2018 = pzSumaHa2018;

/* ── OP. CONTEOS: mostrar la barra lateral con las 2 opciones para elegir ── */
function mostrarMenuConteos(){
  STATE.page = null;                 // ninguna página activa todavía
  if(typeof renderSidebar==='function') renderSidebar();
  var _sb = document.getElementById('sidebar');
  if(_sb) _sb.classList.add('open'); // abrir el menú (en móvil estaba oculto)
  var _tt = document.getElementById('topTitle');
  if(_tt) _tt.textContent = 'Elige el tipo de conteo';
  var _mc = document.getElementById('mainContent');
  if(_mc) _mc.innerHTML = '<div style="padding:32px 20px;text-align:center;color:var(--mu)">'
    + '<div style="font-size:40px;margin-bottom:10px">📋</div>'
    + '<div style="font-size:16px;font-weight:600;color:var(--tx);margin-bottom:6px">Elige el tipo de conteo</div>'
    + '<div style="font-size:13px">Abre el menú ☰ y selecciona <b>Conteos en terreno</b> o <b>Inventario de Huerto</b>.</div>'
    + '</div>';
}

/* ═══════════ SISTEMAS EXTERNOS: abrir + gestión ═══════════ */
function abrirSistemaExterno(url){
  if(!url) return;
  var u = String(url);
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  window.open(u, '_blank', 'noopener,noreferrer');
}
try{ window.abrirSistemaExterno=abrirSistemaExterno; }catch(e){}

// Estado temporal de edición (solo en memoria de la pantalla)
var _seEdit = null;

function renderSistemasExternos(main){
  if(!STATE.user || STATE.user.role!=='admin'){
    main.innerHTML='<div style="padding:24px;color:#c0392b">Solo el administrador puede gestionar los enlaces.</div>';
    return;
  }
  var links = getSistemasExternos();
  var roles = Object.keys(ROLE_LABELS);
  var html = '<div style="max-width:820px;margin:0 auto;padding:8px 4px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">'+
    '<div style="font-size:14px;color:#555">Enlaces a otros sistemas (Informe de Madera, Control Gestión Forestal, etc.). Abren en una pestaña nueva. Puedes asignar qué roles ven cada enlace.</div>'+
    '<button onclick="seNuevo()" style="padding:11px 16px;background:#0854a0;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap">+ Nuevo enlace</button>'+
  '</div>';

  if(!links.length){
    html += '<div style="text-align:center;color:#999;padding:30px;background:#fafafa;border:1px dashed #ddd;border-radius:12px">Aún no hay enlaces. Crea el primero con "+ Nuevo enlace".</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:10px">';
    links.forEach(function(l){
      var rolesTxt = (!l.roles || !l.roles.length) ? 'Todos los roles'
        : l.roles.map(function(r){ return ROLE_LABELS[r]||r; }).join(', ');
      html += '<div style="border:1px solid #e5e5e5;border-radius:12px;padding:14px;background:#fff;display:flex;justify-content:space-between;align-items:start;gap:12px">'+
        '<div style="min-width:0">'+
          '<div style="font-size:16px;font-weight:800;color:#23303d;text-transform:none">'+escapeHtml(l.icon||'🔗')+' '+escapeHtml(l.nombre||'')+'</div>'+
          '<div style="font-size:12px;color:#0854a0;word-break:break-all;margin-top:2px;text-transform:none">'+escapeHtml(l.url||'')+'</div>'+
          '<div style="font-size:12px;color:#777;margin-top:5px">👁️ '+escapeHtml(rolesTxt)+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;flex-shrink:0">'+
          '<button onclick="seEditar(\''+l.id+'\')" style="padding:9px 12px;background:#fff;color:#0854a0;border:2px solid #bcd9f5;border-radius:9px;font-weight:700;cursor:pointer">✏️</button>'+
          '<button onclick="seEliminar(\''+l.id+'\')" style="padding:9px 12px;background:#fff;color:#c0392b;border:2px solid #f0b8b8;border-radius:9px;font-weight:700;cursor:pointer">🗑️</button>'+
        '</div>'+
      '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  main.innerHTML = html;
}

function seNuevo(){ _seEdit = { id:'se-'+Date.now(), nombre:'', url:'', icon:'🔗', roles:[] }; seAbrirModal(true); }
function seEditar(id){
  var l = getSistemasExternos().find(function(x){ return x.id===id; });
  if(!l) return;
  _seEdit = JSON.parse(JSON.stringify(l));
  if(!Array.isArray(_seEdit.roles)) _seEdit.roles=[];
  seAbrirModal(false);
}
function seAbrirModal(esNuevo){
  var roles = Object.keys(ROLE_LABELS);
  var chips = roles.map(function(r){
    var on = _seEdit.roles.indexOf(r)!==-1;
    return '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:2px solid '+(on?'#0854a0':'#d9d9d9')+';border-radius:20px;cursor:pointer;font-size:13px;background:'+(on?'#eaf3fc':'#fff')+'">'+
      '<input type="checkbox" '+(on?'checked':'')+' onchange="seToggleRol(\''+r+'\',this.checked)" style="margin:0"> '+escapeHtml(ROLE_LABELS[r])+'</label>';
  }).join(' ');
  var prev=document.getElementById('se-modal'); if(prev) prev.remove();
  var m=document.createElement('div');
  m.id='se-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10006;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick=function(e){ if(e.target===m) m.remove(); };
  m.innerHTML='<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">'+
    '<div style="padding:16px 18px;border-bottom:1px solid #eee;font-size:17px;font-weight:800;color:#23303d">'+(esNuevo?'Nuevo enlace':'Editar enlace')+'</div>'+
    '<div style="padding:18px;display:flex;flex-direction:column;gap:14px">'+
      '<div><label style="font-size:13px;color:#555;font-weight:700">Nombre</label>'+
        '<input id="se-nombre" data-nouppercase value="'+escapeHtml(_seEdit.nombre||'')+'" placeholder="Ej: Informe de Madera" autocapitalize="sentences" style="width:100%;padding:10px;border:1px solid #d9d9d9;border-radius:8px;box-sizing:border-box;margin-top:4px;text-transform:none"></div>'+
      '<div><label style="font-size:13px;color:#555;font-weight:700">URL</label>'+
        '<input id="se-url" data-nouppercase value="'+escapeHtml(_seEdit.url||'')+'" placeholder="https://..." autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" inputmode="url" style="width:100%;padding:10px;border:1px solid #d9d9d9;border-radius:8px;box-sizing:border-box;margin-top:4px;text-transform:none"></div>'+
      '<div><label style="font-size:13px;color:#555;font-weight:700">Ícono (emoji)</label>'+
        '<input id="se-icon" value="'+escapeHtml(_seEdit.icon||'🔗')+'" maxlength="4" style="width:90px;padding:10px;border:1px solid #d9d9d9;border-radius:8px;margin-top:4px;text-align:center;font-size:18px"></div>'+
      '<div><label style="font-size:13px;color:#555;font-weight:700">¿Qué roles pueden ver este enlace?</label>'+
        '<div style="font-size:12px;color:#999;margin:2px 0 8px">Si no marcas ninguno, lo verán todos los roles.</div>'+
        '<div id="se-roles" style="display:flex;flex-wrap:wrap;gap:8px">'+chips+'</div></div>'+
    '</div>'+
    '<div style="padding:14px 18px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px">'+
      '<button onclick="document.getElementById(\'se-modal\').remove()" style="padding:11px 16px;background:#f0f0f0;border:none;border-radius:9px;font-weight:700;cursor:pointer">Cancelar</button>'+
      '<button onclick="seGuardar()" style="padding:11px 18px;background:#0854a0;color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer">Guardar</button>'+
    '</div></div>';
  document.body.appendChild(m);
}
function seToggleRol(r, on){
  if(!_seEdit) return;
  var i=_seEdit.roles.indexOf(r);
  if(on && i===-1) _seEdit.roles.push(r);
  if(!on && i!==-1) _seEdit.roles.splice(i,1);
  seAbrirModal(false);
}
async function seGuardar(){
  if(!_seEdit) return;
  var nombre=(document.getElementById('se-nombre').value||'').trim();
  var url=(document.getElementById('se-url').value||'').trim();
  var icon=(document.getElementById('se-icon').value||'🔗').trim()||'🔗';
  if(!nombre){ toast('Falta nombre','Escribe un nombre para el enlace','error'); return; }
  if(!url){ toast('Falta URL','Escribe la dirección del sistema','error'); return; }
  _seEdit.nombre=nombre; _seEdit.url=url; _seEdit.icon=icon;
  var links=getSistemasExternos().slice();
  var idx=links.findIndex(function(x){ return x.id===_seEdit.id; });
  if(idx===-1) links.push(_seEdit); else links[idx]=_seEdit;
  await guardarSistemasExternos(links);
  var m=document.getElementById('se-modal'); if(m) m.remove();
  renderSidebar();
  renderSistemasExternos(document.getElementById('mainContent'));
  toast('Enlace guardado', nombre+' está disponible en la barra lateral','success');
}
function seEliminar(id){
  var l=getSistemasExternos().find(function(x){ return x.id===id; });
  if(!l) return;
  confirmDialog('Eliminar enlace','¿Eliminar "'+escapeHtml(l.nombre||'')+'"?',async function(){
    var links=getSistemasExternos().filter(function(x){ return x.id!==id; });
    await guardarSistemasExternos(links);
    renderSidebar();
    renderSistemasExternos(document.getElementById('mainContent'));
    toast('Enlace eliminado','','success');
  },'Eliminar',true);
}
try{ window.renderSistemasExternos=renderSistemasExternos; window.seNuevo=seNuevo; window.seEditar=seEditar; window.seToggleRol=seToggleRol; window.seGuardar=seGuardar; window.seEliminar=seEliminar; }catch(e){}

function navigate(page, fromHistory){
  // ── Guard OP. CONTEOS: solo puede entrar a 'conteos' o 'invplantas'.
  // Cualquier otro destino (p.ej. 'dashboard') lo devuelve al menú. ──
  if(STATE.user && STATE.user.role==='opconteos' && page!=='conteos' && page!=='invplantas'){
    mostrarMenuConteos();
    return;
  }
  // ── Guard OP. COMBUSTIBLE: solo el formulario de salida de combustible ──
  if(STATE.user && STATE.user.role==='opcombustible'){
    renderCombustibleForm(document.getElementById('mainContent'));
    return;
  }
  // Cerrar la ventana flotante del formulario de movimientos al cambiar de
  // módulo (se vuelve a crear si el destino es la propia entrada de bodega).
  try{ var _mvo=document.getElementById('mvFormOverlay'); if(_mvo) _mvo.remove(); }catch(e){}
  // Refrescar alerta de backup en cada navegación
  setTimeout(refreshBackupAlert,50);
  STATE.page=page;
  // ── Botón atrás (móvil): registrar la navegación en el history ──
  // Si la navegación NO proviene de un evento popstate, apilamos la
  // página (en _sciNavStack y en history) para que el botón 'atrás'
  // del navegador vuelva dentro de la app en vez de cerrarla.
  try{
    if(!fromHistory && STATE.user){
      if(typeof _sciNavStack === 'undefined' || !_sciNavStack){ window._sciNavStack = []; }
      // Evitar apilar la misma página consecutivamente.
      if(_sciNavStack[_sciNavStack.length-1] !== page){ _sciNavStack.push(page); }
      history.pushState({sciPage:page, depth:_sciNavStack.length-1}, '', location.pathname + location.search + '#' + page);
    }
  }catch(e){ /* history no disponible: degradar silenciosamente */ }
  // Toggle de visibilidad: wrapper del Cuaderno vs mainContent del SCI
  const _ccWrap = document.getElementById('cc-app-wrapper');
  const _mc = document.getElementById('mainContent');
  if(page === 'cuaderno'){
    if(_mc) _mc.style.display = 'none';
    if(_ccWrap) _ccWrap.style.display = 'block';
  } else {
    if(_ccWrap) _ccWrap.style.display = 'none';
    if(_mc) _mc.style.display = '';
  }
  renderSidebar();
  if(window.innerWidth<880){document.getElementById('sidebar').classList.remove('open');var _ov=document.getElementById('sidebarOverlay');if(_ov)_ov.remove();}
  const titles={
    dashboard:'Dashboard',productos:'Productos',bodegas:'Bodegas',
    sistemasExternos:'Enlaces a Sistemas Externos',
    proveedores:'Proveedores',clientes:'Clientes',centrosCosto:'Centros de Costo',stock:'Stock por Bodega',movimientos:'Movimientos',
    entradas:'Nueva Entrada',salidas:'Nueva Salida',
    tomas:'Tomas de Inventario',tomaCapturar:'Capturando Toma',tomaVer:'Detalle de Toma',
    usuarios:'Usuarios',config:'Configuración',auditoria:'Auditoría',cuaderno:'Cuaderno de Campo — Cerezos',
    mantenciones:'Servicio y Mantención',
    conteos:'Conteos en terreno',
    invplantas:'Inventario de Huerto · Conteo de Plantas',
    aih:'Actualización Inventario Huerto',
    helada:'Control de Heladas — Torres de Control',
    presupuesto:'Control de Presupuesto — Huertos Cerezo'
  };
  document.getElementById('topTitle').textContent=titles[page]||'';
  const main=document.getElementById('mainContent');
  main.scrollTop=0;
  switch(page){
    case 'dashboard':renderDashboard(main);break;
    case 'sistemasExternos':renderSistemasExternos(main);break;
    case 'productos':renderProductos(main);break;
    case 'bodegas':renderBodegas(main);break;
    case 'proveedores':renderProveedores(main);break;
    case 'clientes':renderClientes(main);break;
    case 'centrosCosto':renderCentrosCosto(main);break;
    case 'stock':renderStock(main);break;
    case 'movimientos':renderMovimientos(main);break;
    case 'ordenesCompra':renderOrdenesCompra(main);break;
    case 'ordenCompraForm':renderOrdenCompraForm(main);break;
    case 'entradas':renderMovimientoForm(main,'ENT');break;
    case 'salidas':renderSelectorSalida(main);break;
    case 'repCombustible':renderReporteCombustible(main);break;
    case 'tomas':renderTomas(main);break;
    case 'tomaCapturar':renderTomaCapturar(main);break;
    case 'tomaVer':renderTomaVer(main);break;
    case 'usuarios':renderUsuarios(main);break;
    case 'config':renderConfig(main);break;
    case 'auditoria':renderAuditoria(main);break;
    case 'cuaderno':renderCuaderno(main);break;
    case 'mantenciones':renderMantenciones(main);break;
    case 'conteos':renderConteos(main);break;
    case 'invplantas':renderInvPlantas(main);break;
    case 'aih':renderAIH(main);break;
    case 'helada':renderHelada(main);break;
    case 'presupuesto':renderPresupuesto(main);break;
  }
}
