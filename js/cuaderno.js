// Valores por defecto del % de producción por estado
var PROD_ESTADO_DEFAULT = { sano:100, debil:60, replante:30, muerto:0, falta:0 };
function getProdPorEstado(pano){
  var base = Object.assign({}, PROD_ESTADO_DEFAULT, (typeof S!=='undefined' && S.prodPorEstado) ? S.prodPorEstado : {});
  // Si se pasa un paño con su propia configuración, esa tiene prioridad
  if(pano && pano.prodPct && typeof pano.prodPct==='object'){
    return Object.assign({}, base, pano.prodPct);
  }
  return base;
}

// Garantiza la estructura de fertirriego (para datos cargados de versiones previas)
function _ensureFertirriego(){
  if(!S.fertirriego) S.fertirriego = { sectores:[], ordenes:[], oCounter:1, cfg:{} };
  var f = S.fertirriego;
  if(!Array.isArray(f.sectores)) f.sectores=[];
  if(!Array.isArray(f.ordenes)) f.ordenes=[];
  if(typeof f.oCounter!=='number') f.oCounter=1;
  if(!f.cfg) f.cfg={};
  var c=f.cfg;
  // Identificación
  if(typeof c.empresa!=='string') c.empresa='SOC. AGRICOLA Y FORESTAL LA CABA\u00d1A LTDA';
  if(typeof c.temporada!=='string') c.temporada='2026-2027';
  if(typeof c.documento!=='string') c.documento='ORDEN DE APLICACION';
  if(typeof c.obsDefecto!=='string') c.obsDefecto='';
  // Listas
  if(!Array.isArray(c.rangos)) c.rangos=[{especie:'CEREZOS',desde:1,hasta:99}];
  if(!Array.isArray(c.estados)) c.estados=['YEMA INCHADA','PUNTAS ALGODON','PUNTAS VERDES','RAMILLETE EXPUESTO','BOTON BLANCO','BOTON ROSADO','INICIO FLORACION','PLENA FLOR','CAIDA DE PETALOS INICIO','CAIDA DE PETALOS FINAL','ESTADO T','COSECHA INICIO','COSECHA','COSECHA FINAL','CAIDA DE HOJAS 50% AMARILLO','CAIDA DE HOJAS 50% CAIDA','CAIDA DE HOJAS 100% CAIDA','POSH COSECHA','CRECIMIENTO FRUTO','ESTADO BALON','FLORACION','CUAJA','CAIDA DE PETALOS','MULTIPLICACION CELULAR','OREJA DE RATON','PAJA/ CAMBIO COLOR','PINTA'];
  if(!Array.isArray(c.condiciones)) c.condiciones=['NORMAL','DEBIL','VIGOROSO'];
  if(!Array.isArray(c.equipos)) c.equipos=['EQ 1','EQ 2'];
  if(!Array.isArray(c.formas)) c.formas=['POR GOTEO','MANUAL','ASPERSION'];
  if(!Array.isArray(c.unidades)) c.unidades=['GRS.','C.C','L','kg','mL'];
  if(!Array.isArray(c.horarios)) c.horarios=['08:00 A 17:00','08:00 A 18:00','18:00 A 21:00'];
  if(!Array.isArray(c.tiposDoc)) c.tiposDoc=['ORDEN APLICACION','CONFIRMACION'];
  if(!Array.isArray(c.predios)) c.predios=[];
}

// Catálogo de objetivos para órdenes de aplicación (selección múltiple)
var OBJETIVOS_CAT = {
  'Enfermedades fúngicas (hongos)': [
    'Pudrición parda (Monilia laxa)',
    'Cribado (Stigmina carpophila)',
    'Botrytis (Botrytis cinerea)',
    'Alternaria',
    'Antracnosis (Blumeriella jaapii)'
  ],
  'Enfermedades bacterianas': [
    'Cáncer bacterial (Pseudomonas syringae)'
  ],
  'Plagas (insectos)': [
    'Mosca de alas manchadas (Drosophila suzukii)',
    'Mosca de la cereza (Rhagoletis cerasi)',
    'Pulgón negro del cerezo (Myzus cerasi)',
    'Polilla oriental (Cydia molesta)',
    'Chape del cerezo (Caliroa cerasi)',
    'Trips californiano (Frankliniella occidentalis)',
    'Escama de San José (Diaspidiotus perniciosus)',
    'Burrito de la vid (Naupactus xantographus)'
  ],
  'Ácaros': [
    'Arañita roja',
    'Falsa arañita roja de la vid (Brevipalpus chilensis)'
  ],
  'Malezas': [
    'Control general de malezas'
  ],
  'Nutrición y fisiología': [
    'Fertilización foliar',
    'Fertilización al suelo / fertirriego',
    'Bioestimulación',
    'Corrección de deficiencias nutricionales',
    'Endurecimiento de fruto / firmeza',
    'Inducción floral',
    'Mejora de cuaje'
  ],
  'Otros': [
    'Prevención de daño por heladas',
    'Cicatrización de poda'
  ]
};
var OBJETIVOS_ICONS = {
  'Enfermedades fúngicas (hongos)': '🍄',
  'Enfermedades bacterianas': '🧫',
  'Plagas (insectos)': '🐛',
  'Ácaros': '🕷️',
  'Malezas': '🌿',
  'Nutrición y fisiología': '🌱',
  'Otros': '❄️'
};

// Helper: renderizar dropdown multi-select de objetivos
// idPrefix: ej "cc-o-obj" (para nueva orden) o "cc-eo-obj" (para editor)
// selected: array de objetivos ya seleccionados
function renderObjetivosUI(idPrefix, selected, otroVal){
  selected = selected || [];
  otroVal = otroVal || '';
  // Contenedor con: botón summary (clickable) + panel desplegable con checkboxes
  var html = '<div class="cc-obj-dd" data-prefix="'+idPrefix+'" style="position:relative">'+
    // Botón resumen (lo que se ve cerrado)
    '<div id="'+idPrefix+'-summary" class="cc-obj-summary" onclick="ccObjToggle(\''+idPrefix+'\')" style="padding:9px 12px;background:#fff;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;min-height:38px">'+
      '<span id="'+idPrefix+'-text" style="flex:1;color:#666">Click para seleccionar...</span>'+
      '<span style="color:#888;font-size:11px;margin-left:8px">▼</span>'+
    '</div>'+
    // Panel desplegable (oculto por defecto)
    '<div id="'+idPrefix+'-panel" class="cc-obj-panel" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #0a6ed1;border-top:none;border-radius:0 0 6px 6px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-height:400px;overflow-y:auto;z-index:100;padding:8px 10px">';

  // Categorías con checkboxes
  Object.keys(OBJETIVOS_CAT).forEach(function(cat, catIdx){
    var icon = OBJETIVOS_ICONS[cat] || '';
    html += '<div style="margin-bottom:8px">'+
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:4px;padding-bottom:2px;border-bottom:1px solid #e5e5e5">'+icon+' '+escapeHtml(cat)+'</div>'+
      '<div style="display:flex;flex-direction:column;gap:3px;padding-left:4px">';
    OBJETIVOS_CAT[cat].forEach(function(obj, idx){
      var id = idPrefix+'-c'+catIdx+'-'+idx;
      var checked = selected.indexOf(obj)>=0 ? ' checked' : '';
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:3px 4px;border-radius:3px;line-height:1.3" onmouseenter="this.style.background=\'#fafafa\'" onmouseleave="this.style.background=\'\'">'+
        '<input type="checkbox" class="'+idPrefix+'-chk" id="'+id+'" value="'+escapeHtml(obj)+'"'+checked+' onchange="ccObjUpdateSummary(\''+idPrefix+'\')" style="margin:0">'+
        '<span>'+escapeHtml(obj)+'</span>'+
        '</label>';
    });
    html += '</div></div>';
  });

  // Campo "Otro" con texto libre
  var otroChecked = otroVal ? ' checked' : '';
  html += '<div style="margin-top:6px;padding:8px;background:#fafafa;border:1px dashed #d9d9d9;border-radius:5px">'+
    '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:4px">'+
      '<input type="checkbox" id="'+idPrefix+'-otro-chk"'+otroChecked+' onchange="ccObjUpdateSummary(\''+idPrefix+'\');if(this.checked)document.getElementById(\''+idPrefix+'-otro-txt\').focus()" style="margin:0">'+
      '<strong>Otro (especificar):</strong></label>'+
    '<input type="text" id="'+idPrefix+'-otro-txt" placeholder="Describa el objetivo..." value="'+escapeHtml(otroVal)+'" oninput="if(this.value){document.getElementById(\''+idPrefix+'-otro-chk\').checked=true;}ccObjUpdateSummary(\''+idPrefix+'\')" style="width:100%;padding:6px 9px;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;box-sizing:border-box">'+
    '</div>';

  // Botón para cerrar
  html += '<div style="margin-top:8px;text-align:right;padding-top:6px;border-top:1px solid #e5e5e5">'+
    '<button type="button" onclick="ccObjToggle(\''+idPrefix+'\')" style="background:#354a5f;color:#fff;border:none;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Cerrar</button>'+
    '</div>';

  html += '</div></div>';
  return html;
}

// Abre/cierra el dropdown de objetivos
function ccObjToggle(idPrefix){
  var panel = document.getElementById(idPrefix+'-panel');
  var summary = document.getElementById(idPrefix+'-summary');
  if(!panel || !summary) return;
  var isOpen = panel.style.display !== 'none';
  if(isOpen){
    panel.style.display = 'none';
    summary.style.borderRadius = '6px';
    summary.style.borderColor = '#d9d9d9';
  } else {
    // Cerrar otros dropdowns abiertos primero
    document.querySelectorAll('.cc-obj-panel').forEach(function(p){
      if(p.id !== idPrefix+'-panel') p.style.display='none';
    });
    panel.style.display = 'block';
    summary.style.borderRadius = '6px 6px 0 0';
    summary.style.borderColor = '#0a6ed1';
  }
}

// Actualiza el texto resumen del dropdown según los checkboxes marcados
function ccObjUpdateSummary(idPrefix){
  var textEl = document.getElementById(idPrefix+'-text');
  if(!textEl) return;
  var selected = [];
  document.querySelectorAll('.'+idPrefix+'-chk:checked').forEach(function(cb){
    selected.push(cb.value);
  });
  var otroChk = document.getElementById(idPrefix+'-otro-chk');
  var otroTxt = document.getElementById(idPrefix+'-otro-txt');
  if(otroChk && otroChk.checked && otroTxt && otroTxt.value.trim()){
    selected.push('Otro: '+otroTxt.value.trim());
  }
  if(selected.length===0){
    textEl.textContent = 'Click para seleccionar...';
    textEl.style.color = '#666';
  } else if(selected.length===1){
    textEl.textContent = selected[0];
    textEl.style.color = '#354a5f';
  } else {
    // Mostrar como badges
    textEl.innerHTML = '';
    textEl.style.color = '#354a5f';
    var maxShow = 3;
    selected.slice(0, maxShow).forEach(function(s){
      var span = document.createElement('span');
      span.style.cssText = 'display:inline-block;background:#d1e8ff;color:#354a5f;padding:2px 8px;border-radius:10px;margin:2px 4px 2px 0;font-size:11px;font-weight:600';
      span.textContent = s;
      textEl.appendChild(span);
    });
    if(selected.length > maxShow){
      var more = document.createElement('span');
      more.style.cssText = 'color:#666;font-size:11px;margin-left:4px';
      more.textContent = '+'+(selected.length-maxShow)+' más';
      textEl.appendChild(more);
    }
  }
}

// Helper: recoger los objetivos seleccionados desde el DOM
function readObjetivosUI(idPrefix){
  var arr = [];
  document.querySelectorAll('.'+idPrefix+'-chk:checked').forEach(function(cb){
    arr.push(cb.value);
  });
  var otroChk = document.getElementById(idPrefix+'-otro-chk');
  var otroTxt = document.getElementById(idPrefix+'-otro-txt');
  var otro = '';
  if(otroChk && otroChk.checked && otroTxt && otroTxt.value.trim()){
    otro = otroTxt.value.trim();
  }
  return { objetivos: arr, objetivoOtro: otro };
}

// Cerrar dropdowns al hacer click fuera
document.addEventListener('click', function(e){
  var openPanels = document.querySelectorAll('.cc-obj-panel');
  openPanels.forEach(function(panel){
    if(panel.style.display === 'none' || panel.style.display === '') return;
    var dd = panel.closest('.cc-obj-dd');
    if(dd && !dd.contains(e.target)){
      panel.style.display = 'none';
      var prefix = dd.getAttribute('data-prefix');
      var summary = document.getElementById(prefix+'-summary');
      if(summary){
        summary.style.borderRadius = '6px';
        summary.style.borderColor = '#d9d9d9';
      }
    }
  });
}, true);
var COLORS = ['#8B1A1A','#C0392B','#1F618D','#1E8449','#76448A','#B7950B','#117A65','#784212','#943126','#2471A3'];
var TIPO_C = {
  'Fungicida':['#fff3cd','#856404'],
  'Bactericida':['#ffe8d9','#7a3500'],
  'Insecticida':['#f8d7da','#842029'],
  'Acaricida':['#f3e2f5','#5a0d6e'],
  'Herbicida':['#d1e7dd','#23303d'],
  'Fertilizante foliar':['#cfe2ff','#084298'],
  'Fertilizante edáfico':['#d0e4ff','#0a3577'],
  'Fertilizante suelo':['#dce7f5','#1c4570'],
  'Enmienda':['#e7d8c0','#5a3a10'],
  'Bioestimulante':['#d2f4ea','#23303d'],
  'Orgánico':['#d4edda','#155724'],
  'Corrector mineral':['#fde2be','#7a4200'],
  'Coadyuvante':['#e2e3e5','#383d41'],
  'Fitoregulador':['#e0d4f7','#4a2a82'],
  'Otro':['#e9ecef','#495057']
};

// ══ STORAGE ══
// ══════════════════════════════════════════════════════════════════
//  SINCRONIZACIÓN EN LA NUBE — Firebase Firestore
// ══════════════════════════════════════════════════════════════════
var FB = {
  config: {
    apiKey: "AIzaSyCl2CDK9tzMZQ5iJmDlYqAxZeV_Pw_rgqE",
    authDomain: "cuaderno-de-campo-d2922.firebaseapp.com",
    projectId: "cuaderno-de-campo-d2922",
    storageBucket: "cuaderno-de-campo-d2922.firebasestorage.app",
    messagingSenderId: "112356988045",
    appId: "1:112356988045:web:432a76e2fe6826b4abfec4"
  },
  db: null,
  ready: false,
  online: false,
  syncing: false,
  lastSyncTime: null,
  // ID único de esta sesión/dispositivo (para no procesar los ecos de nuestras propias escrituras)
  clientId: 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
  // Versión del último guardado conocido (para detectar cambios remotos)
  lastVersion: 0,
  unsubscribe: null,
  // Flag para evitar que un cambio recibido de la nube dispare otro guardado
  applyingRemote: false,
  saveTimer: null,
  // Mientras es true, las escrituras locales NO se suben (evita pisar la nube al arrancar)
  bootingUp: true,
  firstSnapshotReceived: false
};

// Documento compartido en Firestore: cuaderno/main
function fbDocRef(){
  if(!FB.db) return null;
  return FB.db.collection('cuaderno').doc('main');
}

// Inicializa Firebase y arranca la sincronización
function fbInit(){
  try {
    if(typeof firebase === 'undefined'){
      console.warn('[Firebase] SDK no cargado. Funcionando solo localmente.');
      fbUpdateIndicator('offline', 'Sin conexión a la nube (SDK no disponible)');
      return;
    }
    if(!firebase.apps.length){
      firebase.initializeApp(FB.config);
    }
    // NOTA: ya NO se hace login anónimo. El acceso exige correo+contraseña.
    FB.db = firebase.firestore();
    FB.ready = true;
    console.log('[Firebase] Inicializado correctamente');
    fbUpdateIndicator('connecting', 'Conectando a la nube...');
    // Arrancar el listener en vivo SOLO cuando la autenticación anónima esté lista
    // (con la regla de seguridad, sin auth las lecturas/escrituras serían rechazadas)
    if(firebase.auth){
      var _listenerArrancado = false;
      firebase.auth().onAuthStateChanged(function(user){
        if(user && !_listenerArrancado){
          _listenerArrancado = true;
          console.log('[Firebase] Autenticado (correo+clave). Arrancando sincronización del Cuaderno.');
          fbStartListener();
        }
      });
    } else {
      fbStartListener();
    }
    // Red de seguridad: si en 10s no hay respuesta, habilitar subidas locales
    setTimeout(function(){
      if(!FB.firstSnapshotReceived){
        console.log('[Firebase] Sin respuesta de la nube en 10s. Habilitando subidas locales.');
        FB.bootingUp = false;
      }
    }, 10000);
  } catch(e){
    console.error('[Firebase] Error al inicializar:', e);
    fbUpdateIndicator('offline', 'Error de conexión: ' + e.message);
  }
}

// Escucha cambios en el documento en tiempo real
function fbStartListener(){
  var ref = fbDocRef();
  if(!ref) return;
  // Cancelar listener previo si existe
  if(FB.unsubscribe){ try{ FB.unsubscribe(); }catch(e){} }
  FB.unsubscribe = ref.onSnapshot(
    {includeMetadataChanges: false},
    function(doc){
      try{FBCOUNT.read();}catch(e){}
      FB.online = true;
      if(!doc.exists){
        // La nube está vacía. Recién aquí permitimos subir los datos locales.
        console.log('[Firebase] Documento no existe. Creando con datos locales...');
        FB.firstSnapshotReceived = true;
        FB.bootingUp = false;
        fbUpdateIndicator('online', 'Conectado · creando base en la nube');
        fbPush(true);
        return;
      }
      var data = doc.data();
      // Ignorar si es el eco de nuestra propia escritura
      if(data._clientId === FB.clientId && data._version === FB.lastVersion){
        FB.firstSnapshotReceived = true;
        FB.bootingUp = false;
        fbUpdateIndicator('online', 'Sincronizado');
        return;
      }
      // Hay datos en la nube: SIEMPRE ganan sobre el estado local de arranque.
      if(data._version && data._version !== FB.lastVersion){
        console.log('[Firebase] Cambio remoto detectado (v'+data._version+'). Actualizando...');
        FB.firstSnapshotReceived = true;
        fbApplyRemote(data);
        FB.bootingUp = false;
      }
    },
    function(err){
      FB.online = false;
      console.error('[Firebase] Error en listener:', err);
      fbUpdateIndicator('offline', 'Sin conexión: ' + err.code);
    }
  );
}

// Aplica el estado recibido de la nube al estado local S
function fbApplyRemote(data){
  try {
    FB.applyingRemote = true;
    if(data.payload){
      var remote = (typeof data.payload === 'string') ? JSON.parse(data.payload) : data.payload;
      ['panos','registros','productos','ordenes','confirmaciones','equipos'].forEach(function(k){
        if(remote[k] !== undefined) S[k] = remote[k];
      });
      if(remote.fertirriego !== undefined) S.fertirriego = remote.fertirriego;
      if(!Array.isArray(S.equipos)) S.equipos = [];
      S.equipos = S.equipos.map(function(e){ return (typeof e==='string')?{nombre:e,capacidad:0}:{nombre:(e&&e.nombre)||'',capacidad:(e&&parseFloat(e.capacidad))||0}; }).filter(function(e){ return e.nombre; });
      if(remote.prodPorEstado !== undefined) S.prodPorEstado = remote.prodPorEstado;
      if(remote.versionesEstim !== undefined) S.versionesEstim = remote.versionesEstim;
      if(remote.pctExport !== undefined) S.pctExport = remote.pctExport;
      if(remote.oCounter !== undefined) S.oCounter = remote.oCounter;
      if(remote.comprasUrgentes !== undefined) S.comprasUrgentes = remote.comprasUrgentes;
      if(remote.vinculosSCI !== undefined) S.vinculosSCI = remote.vinculosSCI;
      if(!S.vinculosSCI || typeof S.vinculosSCI!=='object') S.vinculosSCI = {};
      if(!Array.isArray(S.comprasUrgentes)) S.comprasUrgentes = [];
      if(!Array.isArray(S.confirmaciones)) S.confirmaciones = [];
      // Guardar en localStorage como respaldo
      try{ localStorage.setItem('cc_v2', JSON.stringify(S)); }catch(e){}
      FB.lastVersion = data._version || FB.lastVersion;
      FB.lastSyncTime = new Date();
      // Si llegaron datos de la nube y estábamos en el wizard de setup, mostrar la app
      if(S.panos && S.panos.length > 0){
        var setup = document.getElementById('cc-setup');
        var app = document.getElementById('cc-app');
        if(setup && setup.style.display !== 'none'){
          setup.style.display = 'none';
          if(app) app.style.display = 'block';
          try{ if(typeof initApp==='function') initApp(); }catch(e){}
        }
      }
      // Si el usuario está viendo Conteos en terreno o Inventario de Huerto y los
      // paños recién llegaron desde la nube (típico al abrir en un dispositivo
      // nuevo, sin datos en localStorage), re-renderizar esa vista para que los
      // paños aparezcan sin tener que entrar antes al Cuaderno de Campo.
      try{
        if(typeof STATE!=='undefined' && STATE.page){
          var main = document.getElementById('mainContent');
          if(STATE.page==='conteos' && typeof cteRender==='function'){ cteRender(main); }
          else if(STATE.page==='invplantas' && typeof ipRender==='function'){ ipRender(main); }
        }
      }catch(e){}
      // Refrescar la vista actual del Cuaderno
      fbRefreshUI();
      fbUpdateIndicator('online', 'Actualizado desde la nube · ' + fbTimeStr());
    }
  } catch(e){
    console.error('[Firebase] Error al aplicar cambio remoto:', e);
  } finally {
    FB.applyingRemote = false;
  }
}

// Envía el estado local S a la nube
function fbPush(immediate){
  var ref = fbDocRef();
  if(!ref){ return; }
  if(FB.applyingRemote){ return; } // no re-enviar lo que acabamos de recibir
  // Debounce: agrupar escrituras rápidas
  if(FB.saveTimer){ clearTimeout(FB.saveTimer); }
  var doSave = function(){
    FB.syncing = true;
    fbUpdateIndicator('syncing', 'Guardando en la nube...');
    var newVersion = Date.now();
    FB.lastVersion = newVersion;
    var payload = JSON.stringify({
      panos: S.panos, registros: S.registros, productos: S.productos,
      ordenes: S.ordenes, confirmaciones: S.confirmaciones, oCounter: S.oCounter,
      equipos: S.equipos, comprasUrgentes: S.comprasUrgentes,
      vinculosSCI: S.vinculosSCI,
      fertirriego: S.fertirriego, prodPorEstado: S.prodPorEstado,
      versionesEstim: S.versionesEstim,
      pctExport: S.pctExport
    });
    var userName = '';
    try { if(typeof STATE!=='undefined' && STATE.user){ userName = STATE.user.nombre || STATE.user.id || ''; } }catch(e){}
    try{FBCOUNT.write();}catch(e){} ref.set({
      payload: payload,
      _version: newVersion,
      _clientId: FB.clientId,
      _updatedBy: userName,
      _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){
      FB.syncing = false;
      FB.online = true;
      FB.lastSyncTime = new Date();
      fbUpdateIndicator('online', 'Guardado en la nube · ' + fbTimeStr());
    }).catch(function(err){
      FB.syncing = false;
      FB.online = false;
      console.error('[Firebase] Error al guardar:', err);
      fbUpdateIndicator('offline', 'Error al guardar: ' + err.code + ' (datos guardados localmente)');
    });
  };
  if(immediate){ doSave(); }
  else { FB.saveTimer = setTimeout(doSave, 800); }
}

// Refresca la UI del Cuaderno tras un cambio remoto
function fbRefreshUI(){
  try {
    if(typeof renderHeader === 'function') renderHeader();
    // Detectar qué pestaña del Cuaderno está activa y refrescarla
    var activeTab = document.querySelector('#cc-app-wrapper .cc-tab-c.cc-act, .cc-tab-c.cc-act');
    if(activeTab){
      var id = activeTab.id || '';
      if(id.indexOf('resumen')>=0 && typeof renderResumen==='function') renderResumen();
      else if(id.indexOf('ordenes')>=0 && typeof renderOrdenesList==='function') renderOrdenesList();
      else if(id.indexOf('panos')>=0 && typeof renderPanosApp==='function') renderPanosApp();
      else if(id.indexOf('productos')>=0 && typeof renderProdList==='function') renderProdList();
    }
    // Si hay un módulo de confirmación abierto, refrescar
    if(typeof cfRefrescarLista === 'function'){ try{ cfRefrescarLista(); }catch(e){} }
  } catch(e){
    console.error('[Firebase] Error al refrescar UI:', e);
  }
}

function fbTimeStr(){
  var d = new Date();
  return d.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
}

// Actualiza el indicador visual de conexión
function fbUpdateIndicator(state, msg){
  var el = document.getElementById('cc-sync-indicator');
  if(!el) return;
  var colors = {
    online: '#22c55e', syncing: '#eab308', connecting: '#3b82f6', offline: '#ef4444'
  };
  var labels = {
    online: 'En línea', syncing: 'Guardando...', connecting: 'Conectando...', offline: 'Sin conexión'
  };
  var color = colors[state] || '#999';
  var label = labels[state] || state;
  el.innerHTML = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+color+';margin-right:6px;'+(state==='syncing'||state==='connecting'?'animation:ccPulse 1s infinite':'')+'"></span>'+
    '<span style="font-size:11px;color:#555">'+label+'</span>';
  el.title = msg || label;
}

// ── save() y load() integrados con Firebase ──
function save(){
  // 1. Guardar local SIEMPRE (respaldo instantáneo y offline)
  try{ localStorage.setItem('cc_v2',JSON.stringify(S)); }catch(e){}
  // 2. Sincronizar a la nube (si está disponible y no estamos aplicando un cambio remoto)
  if(FB.ready && !FB.applyingRemote && !FB.bootingUp){
    fbPush(false);
  }
}
function _migrarPanos(){
  // Inicializar campos nuevos en paños existentes
  (S.panos||[]).forEach(function(p){
    if(p.tipo===undefined) p.tipo='Productivo';
    if(p.panoPadre===undefined) p.panoPadre='';
    if(p.plantas===undefined){
      // Estimar plantas desde densidad × hectáreas si existe
      p.plantas = (p.densidad && p.hectareas) ? Math.round(p.densidad * p.hectareas) : 0;
    }
    if(p.deh===undefined) p.deh=0;
    if(p.dsh===undefined) p.dsh=0;
    if(p.portaInjerto===undefined) p.portaInjerto='';
  });
}
function load(){
  try{
    var d = localStorage.getItem('cc_v2');
    if(d){ var p=JSON.parse(d); ['panos','registros','productos','ordenes','confirmaciones','fertirriego','equipos','comprasUrgentes','versionesEstim','pctExport','vinculosSCI'].forEach(function(k){ if(p[k]) S[k]=p[k]; }); if(p.oCounter) S.oCounter=p.oCounter;
      if(!Array.isArray(S.confirmaciones)) S.confirmaciones = [];
      if(!Array.isArray(S.comprasUrgentes)) S.comprasUrgentes = [];
      if(!S.vinculosSCI || typeof S.vinculosSCI!=='object') S.vinculosSCI = {};
      if(!Array.isArray(S.equipos)) S.equipos = [];
      // Normalizar equipos (nebulizadoras) a objetos {nombre,capacidad}
      S.equipos = S.equipos.map(function(e){ return (typeof e==='string')?{nombre:e,capacidad:0}:{nombre:(e&&e.nombre)||'',capacidad:(e&&parseFloat(e.capacidad))||0}; }).filter(function(e){ return e.nombre; });
      _ensureFertirriego();
      // ─── Migraciones automáticas ───
      var migrated = false;
      // 1d) Limpiar confirmaciones huérfanas (sin orden asociada) ANTES del forEach
      var ordenIds = {};
      (S.ordenes||[]).forEach(function(o){ if(o && o.id!==undefined) ordenIds[String(o.id)] = true; });
      var beforeLen = (S.confirmaciones||[]).length;
      S.confirmaciones = (S.confirmaciones||[]).filter(function(c){
        return c && c.ordenId!==undefined && ordenIds[String(c.ordenId)];
      });
      if(S.confirmaciones.length < beforeLen){
        migrated = true;
        console.log('[Cuaderno] Eliminadas '+(beforeLen - S.confirmaciones.length)+' confirmaciones huérfanas');
      }
      (S.ordenes||[]).forEach(function(o){
        // 1) Limpiar prefijo 'cc-' corrupto en números de orden antiguos
        if(o && typeof o.numero==='string' && o.numero.indexOf('cc-OA-')===0){
          o.numero = o.numero.substring(3);
          migrated = true;
        }
        // 1b) Quitar el margen 5% de órdenes anteriores: igualar margin a tProd (netos)
        if(o && o.tProd!==undefined && o.margin!==undefined && Math.abs(o.margin - o.tProd*1.05) < 0.01){
          o.margin = o.tProd;
          migrated = true;
        }
        // 1c) Asegurar que orden.objetivos exista como array (órdenes pre-objetivo)
        if(o && o.objetivos===undefined){
          o.objetivos = [];
          o.objetivoOtro = o.objetivoOtro || '';
          migrated = true;
        }
        if(o && o.productos && o.productos.length){
          o.productos.forEach(function(ap){
            if(ap && ap.tProd!==undefined && ap.margin!==undefined && Math.abs(ap.margin - ap.tProd*1.05) < 0.01){
              ap.margin = ap.tProd;
              migrated = true;
            }
          });
        }
        // 2) Asegurar que toda orden tiene un array 'productos' (compat hacia atrás)
        if(o && (!o.productos || !o.productos.length)){
          o.productos = [{
            nombre: o.producto, dosis: o.dosis, unidad: o.unidad,
            unitS: o.unitS || unitBase(o.unidad||''),
            tProd: o.tProd, margin: o.margin
          }];
          // También poblar prods en cada fila de distribución
          (o.distribucion||[]).forEach(function(r){
            if(!r.prods){
              r.prods = [{nombre:o.producto, qty:r.prod, unitS:o.unitS||unitBase(o.unidad||''), unidad:o.unidad, dosis:o.dosis}];
            }
          });
          migrated = true;
        }
      });
      _migrarPanos();
      if(migrated){ try{ localStorage.setItem('cc_v2',JSON.stringify(S)); }catch(e){} }
      return true;
    }
  }catch(e){}
  return false;
}

// ══ UTIL ══
function fmtN(n,d){ return Number(n).toLocaleString('es-CL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
function hide(id){ var el=document.getElementById(id); if(el) el.style.display='none'; }
function show(id){ var el=document.getElementById(id); if(el) el.style.display=''; }
function today(){ return new Date().toISOString().slice(0,10); }
function getPano(id){ return S.panos.find(function(p){ return p.id==id; }); }
function badge(tipo){
  var c=TIPO_C[tipo]||TIPO_C['Otro'];
  return '<span class="cc-badge" style="background:'+c[0]+';color:'+c[1]+'">'+tipo+'</span>';
}

// ══ PANO ROW (SETUP) ══
var rowId=1;
function addPanoRow(p){
  p = p || { nombre:'', variedad:'', anio:'2024', hectareas:'', has_riego:'', densidad:'', color:COLORS[rowId%COLORS.length] };
  var id = rowId++;
  var tr = document.createElement('tr');
  tr.id = 'cc-pr'+id;
  var anioOpts = ['2018','2024','2026'].map(function(y){
    return '<option value="'+y+'"'+(p.anio===y?' selected':'')+'>'+y+'</option>';
  }).join('');
  // Build cells using DOM to avoid escaping issues
  var tdNombre = document.createElement('td');
  var inNombre = document.createElement('input'); inNombre.type='text'; inNombre.value=p.nombre||''; inNombre.placeholder='Pano A-1'; inNombre.dataset.f='nombre'; inNombre.style.minWidth='110px'; tdNombre.appendChild(inNombre);
  var tdVar = document.createElement('td');
  var inVar = document.createElement('input'); inVar.type='text'; inVar.value=p.variedad||''; inVar.placeholder='Santina'; inVar.dataset.f='variedad'; inVar.style.minWidth='100px'; tdVar.appendChild(inVar);
  var tdAnio = document.createElement('td');
  var selAnio = document.createElement('select'); selAnio.dataset.f='anio'; selAnio.style.minWidth='70px';
  ['2018','2024','2026'].forEach(function(y){ var o=document.createElement('option'); o.value=y; o.text=y; if(p.anio===y) o.selected=true; selAnio.appendChild(o); });
  tdAnio.appendChild(selAnio);
  var tdHa = document.createElement('td');
  var inHa = document.createElement('input'); inHa.type='number'; inHa.value=p.hectareas||''; inHa.placeholder='0.0'; inHa.step='0.1'; inHa.min='0'; inHa.dataset.f='hectareas'; inHa.style.minWidth='75px'; inHa.title='Ha plantadas'; tdHa.appendChild(inHa);
  var tdRiego = document.createElement('td');
  var inRiego = document.createElement('input'); inRiego.type='number'; inRiego.value=p.has_riego||''; inRiego.placeholder='0.0'; inRiego.step='0.1'; inRiego.min='0'; inRiego.dataset.f='has_riego'; inRiego.style.minWidth='75px'; inRiego.title='Ha riego'; tdRiego.appendChild(inRiego);
  var tdDens = document.createElement('td');
  var inDens = document.createElement('input'); inDens.type='number'; inDens.value=p.densidad||''; inDens.placeholder='1250'; inDens.step='1'; inDens.min='0'; inDens.dataset.f='densidad'; inDens.style.minWidth='75px'; inDens.title='Plantas/ha'; tdDens.appendChild(inDens);
  var tdColor = document.createElement('td');
  var dotsDiv = document.createElement('div'); dotsDiv.style.cssText='display:flex;gap:5px;flex-wrap:wrap';
  COLORS.forEach(function(c){
    var dot = document.createElement('div'); dot.className='cc-cdot'+(c===p.color?' sel':'');
    dot.style.background=c; dot.dataset.c=c;
    dot.onclick=function(){ pickColor(id,c,dot); };
    dotsDiv.appendChild(dot);
  });
  var hidColor = document.createElement('input'); hidColor.type='hidden'; hidColor.dataset.f='color'; hidColor.value=p.color||COLORS[0];
  tdColor.appendChild(dotsDiv); tdColor.appendChild(hidColor);
  var tdDel = document.createElement('td');
  var btnDel = document.createElement('button'); btnDel.className='cc-btn-del'; btnDel.textContent='X';
  btnDel.onclick=function(){ tr.remove(); };
  tdDel.appendChild(btnDel);
  [tdNombre,tdVar,tdAnio,tdHa,tdRiego,tdDens,tdColor,tdDel].forEach(function(td){ tr.appendChild(td); });
  document.getElementById('cc-panos-tbody').appendChild(tr);
}
function pickColor(rid,color,el){
  var row=document.getElementById('cc-pr'+rid);
  (row||el.closest('tr')).querySelectorAll('.cc-cdot').forEach(function(d){ d.classList.remove('cc-sel'); });
  el.classList.add('cc-sel');
  el.closest('tr').querySelector('[data-f="color"]').value=color;
}
function savePanosFromTable(){
  S.panos=[];
  document.querySelectorAll('#cc-panos-tbody tr').forEach(function(tr,i){
    var n=tr.querySelector('[data-f="nombre"]').value.trim();
    var v=tr.querySelector('[data-f="variedad"]').value.trim();
    if(!n && !v) return;
    S.panos.push({
      id: Date.now()+i,
      nombre: n||'Sin nombre',
      variedad: v||'Sin variedad',
      anio: tr.querySelector('[data-f="anio"]').value,
      hectareas: parseFloat(tr.querySelector('[data-f="hectareas"]').value)||0,
      has_riego: parseFloat(tr.querySelector('[data-f="has_riego"]').value)||0,
      densidad: parseFloat(tr.querySelector('[data-f="densidad"]').value)||0,
      color: tr.querySelector('[data-f="color"]').value||COLORS[i%COLORS.length]
    });
  });
  save();
}

// ══ WIZARD STEPS ══
function goStep(n){
  [1,2,3].forEach(function(i){
    document.getElementById('cc-step'+i).style.display = i===n?'':'none';
    var t=document.getElementById('cc-stab'+i);
    t.className='cc-step-tab'+(i===n?' act':i<n?' done':'');
  });
  var titles=['Paso 1 — Configurar Paños','Paso 2 — Catálogo de Productos','Paso 3 — ¡Todo listo!'];
  document.getElementById('cc-s-ttl').textContent=titles[n-1];
  document.getElementById('cc-s-badge').textContent=n+' de 3';
  if(n===3){
    document.getElementById('cc-wiz-summary').textContent='Huerto configurado con '+S.panos.length+' paños ('+S.panos.reduce(function(s,p){ return s+p.hectareas; },0).toFixed(1)+' há) y '+S.productos.length+' productos en catálogo.';
  }
  if(n===2) renderProdListWiz();
}
function saveWizPanosAndNext(){
  savePanosFromTable();
  if(!S.panos.length){
    document.getElementById('cc-wiz-msg').innerHTML='<div class="cc-notice cc-notice-err">⚠️ Agrega al menos un paño.</div>';
    return;
  }
  document.getElementById('cc-wiz-msg').innerHTML='';
  goStep(2);
}

// ══ FILE IMPORT ══
function handleFile(file){
  if(!file) return;
  var ext=file.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    var r=new FileReader();
    r.onload=function(e){ parseCSV(e.target.result); };
    r.readAsText(file,'UTF-8');
  } else {
    // Excel via FileReader as binary, manual parse minimally
    var r=new FileReader();
    r.onload=function(e){ parseExcelSimple(e.target.result); };
    r.readAsBinaryString(file);
  }
}
function parseCSV(text){
  var lines=text.trim().split(/\r?\n/);
  if(lines.length<2){ showNotice('El archivo CSV está vacío.','err'); return; }
  var headers=lines[0].split(/[;,]/).map(function(h){ return h.trim().toLowerCase().replace(/['"]/g,''); });
  var iN=findCol(headers,['producto','nombre','product','name']);
  var iT=findCol(headers,['tipo','type','categoria','categoría','clase']);
  var iU=findCol(headers,['unidad','unit','ud']);
  var iD=findCol(headers,['dosis','dose','cantidad']);
  var added=0;
  for(var i=1;i<lines.length;i++){
    var cols=lines[i].split(/[;,]/).map(function(c){ return c.trim().replace(/^["']|["']$/g,''); });
    var nom=iN>=0?cols[iN]:'';
    if(!nom) continue;
    if(!S.productos.find(function(p){ return p.nombre.toLowerCase()===nom.toLowerCase(); })){
      S.productos.push({ nombre:nom, tipo:iT>=0?cols[iT]:'Otro', unidad:iU>=0?cols[iU]:'mL/100L', dosis:iD>=0?cols[iD]:'' });
      added++;
    }
  }
  save();
  showNotice('✓ '+added+' productos importados.','ok');
  renderProdListWiz();
  renderProdList();
}
// ══════════════════════════════════════════════════════════════════
//  IMPORT XLSX con SheetJS — formato: TIPO | PRODUCTO | UNIDAD | DOSIS
// ══════════════════════════════════════════════════════════════════
// Normaliza el tipo de MAYÚSCULAS a Capitalizado. Mapea sinónimos.
function _normTipo(raw){
  if(!raw) return 'Otro';
  var s = String(raw).trim();
  var up = s.toUpperCase();
  var map = {
    'FUNGICIDA':'Fungicida','FUNGUICIDA':'Fungicida',
    'BACTERICIDA':'Bactericida','BACTERIOSTATICO':'Bactericida','BACTERIOSTÁTICO':'Bactericida',
    'INSECTICIDA':'Insecticida',
    'ACARICIDA':'Acaricida',
    'HERBICIDA':'Herbicida','HERVICIDA':'Herbicida',
    'FERTILIZANTE FOLIAR':'Fertilizante foliar','FOLIAR':'Fertilizante foliar',
    'FERTILIZANTE EDAFICO':'Fertilizante edáfico','FERTILIZANTE EDÁFICO':'Fertilizante edáfico','EDAFICO':'Fertilizante edáfico','EDÁFICO':'Fertilizante edáfico',
    'FERTILIZANTE SUELO':'Fertilizante suelo','FERTILIZANTE DE SUELO':'Fertilizante suelo','FERT.SUELO':'Fertilizante suelo','FERT SUELO':'Fertilizante suelo',
    'ENMIENDA':'Enmienda','ENMIENDAS':'Enmienda',
    'BIOESTIMULANTE':'Bioestimulante','BIO-ESTIMULANTE':'Bioestimulante',
    'ORGANICO':'Orgánico','ORGÁNICO':'Orgánico','ABONO ORGANICO':'Orgánico',
    'CORRECTOR MINERAL':'Corrector mineral','CORRECTOR':'Corrector mineral',
    'COADYUVANTE':'Coadyuvante','ADYUVANTE':'Coadyuvante','ADHERENTE':'Coadyuvante','SURFACTANTE':'Coadyuvante','MOJANTE':'Coadyuvante',
    'OTRO':'Otro','OTROS':'Otro'
  };
  if(map[up]) return map[up];
  // Si ya viene capitalizado correctamente, intentar coincidencia case-insensitive contra TIPO_C
  var keys = Object.keys(TIPO_C);
  for(var i=0;i<keys.length;i++){
    if(keys[i].toLowerCase()===s.toLowerCase()) return keys[i];
  }
  return 'Otro';
}
// Extrae unidad y dosis cuando la columna UNIDAD trae el valor completo: "60 g/100 L"
// Devuelve {unidad:"g/100L", dosis:60} o {unidad:original, dosis:undefined} si no parsea
function _parseUnidadDosis(rawUnidad, rawDosis){
  var unidadRaw = (rawUnidad==null?'':String(rawUnidad)).trim();
  var dosisRaw = (rawDosis==null?'':String(rawDosis)).trim().replace(',','.');
  var dosisOut = '';
  var unidadOut = '';
  // 1) Si UNIDAD tiene formato "<num> <unidad>" (ej: "60 g/100 L"), parsearlo
  var m = unidadRaw.match(/^([0-9]+(?:[.,][0-9]+)?)\s+(.+)$/);
  if(m){
    dosisOut = m[1].replace(',','.');
    unidadOut = m[2];
  } else {
    unidadOut = unidadRaw;
    if(dosisRaw && !isNaN(parseFloat(dosisRaw))) dosisOut = dosisRaw;
  }
  // 2) Si el campo DOSIS trae un valor numérico válido, prefierelo (más confiable)
  if(dosisRaw && !isNaN(parseFloat(dosisRaw))){
    dosisOut = dosisRaw;
  }
  // 3) Normalizar la unidad: quitar espacios, normalizar cc→mL, kg→kg, etc.
  unidadOut = unidadOut.replace(/\s+/g, '');  // "g/100 L" → "g/100L"
  unidadOut = unidadOut.replace(/^cc\b/i, 'mL').replace(/\bcc\b/i, 'mL');  // cc → mL
  unidadOut = unidadOut.replace(/^Kg\b/, 'kg');  // Kg → kg
  unidadOut = unidadOut.replace(/^Ml\b/, 'mL').replace(/^ML\b/, 'mL');  // Ml/ML → mL
  unidadOut = unidadOut.replace(/^L\/100L$/i, 'L/100L').replace(/^l\/100l$/i, 'L/100L');
  return { unidad: unidadOut, dosis: dosisOut };
}

// Procesa el archivo Excel y muestra preview
function parseExcelSimple(bin){
  if(typeof XLSX==='undefined'){
    showNotice('La librería de Excel no está cargada. Recargue la página.','err');
    return;
  }
  try{
    var wb = XLSX.read(bin, {type:'binary'});
    if(!wb.SheetNames.length){
      showNotice('El archivo Excel no contiene hojas.','err');
      return;
    }
    var ws = wb.Sheets[wb.SheetNames[0]];
    // Leer como array de objetos (con cabeceras)
    var rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
    if(!rows.length){
      showNotice('La hoja está vacía.','err');
      return;
    }
    // Detectar nombres de columnas (case-insensitive)
    var first = rows[0];
    var headerMap = {};
    Object.keys(first).forEach(function(k){
      var lk = String(k).trim().toLowerCase();
      if(/^(producto|nombre|product|name)$/.test(lk)) headerMap.nombre = k;
      else if(/^(tipo|type|categoria|categoría|clase)$/.test(lk)) headerMap.tipo = k;
      else if(/^(ingrediente activo|ingrediente|i\.a\.?|ia|principio activo|activo|ingr\.? activo)$/.test(lk)) headerMap.ingredienteActivo = k;
      else if(/^(objetivo principal|principal objetivo|objetivo|objetivos|plaga|plagas|target|controla|control)$/.test(lk)) headerMap.objetivo = k;
      else if(/^(unidad|unit|ud)$/.test(lk)) headerMap.unidad = k;
      else if(/^(dosis|dose|cantidad)$/.test(lk)) headerMap.dosis = k;
    });
    if(!headerMap.nombre){
      showNotice('No se encontró la columna "Producto" o "Nombre" en el Excel.','err');
      return;
    }
    // Procesar todas las filas
    var nuevos = [], duplicados = [], errores = [];
    rows.forEach(function(row, idx){
      var nom = (row[headerMap.nombre]==null?'':String(row[headerMap.nombre])).trim();
      if(!nom){ return; } // fila vacía, ignorar silenciosamente
      var tipoRaw = headerMap.tipo ? row[headerMap.tipo] : '';
      var unidadRaw = headerMap.unidad ? row[headerMap.unidad] : '';
      var dosisRaw = headerMap.dosis ? row[headerMap.dosis] : '';
      var tipo = _normTipo(tipoRaw);
      var ud = _parseUnidadDosis(unidadRaw, dosisRaw);
      var iaRaw = headerMap.ingredienteActivo ? row[headerMap.ingredienteActivo] : '';
      var objRaw = headerMap.objetivo ? row[headerMap.objetivo] : '';
      var item = { nombre:nom, tipo:tipo, ingredienteActivo:(iaRaw==null?'':String(iaRaw)).trim(), objetivo:(objRaw==null?'':String(objRaw)).trim(), unidad:ud.unidad||'', dosis:ud.dosis||'', _row:idx+2 };
      // Verificar duplicado contra catálogo existente
      if(S.productos.find(function(p){ return p.nombre.toLowerCase()===nom.toLowerCase(); })){
        duplicados.push(item);
        return;
      }
      // Verificar duplicado dentro del mismo archivo
      if(nuevos.find(function(p){ return p.nombre.toLowerCase()===nom.toLowerCase(); })){
        duplicados.push(item);
        return;
      }
      // Aceptar el ítem
      nuevos.push(item);
    });
    // Mostrar preview
    _mostrarPreviewImport(nuevos, duplicados, errores);
  }catch(ex){
    showNotice('Error al leer el Excel: '+ex.message,'err');
  }
}

// Modal de preview antes de confirmar la importación
function _mostrarPreviewImport(nuevos, duplicados, errores){
  var existing = document.getElementById('cc-imp-modal');
  if(existing) existing.remove();
  // Pre-guardar los items en una global para que applyImport los lea
  window._impNuevos = nuevos;
  var prodHtml = nuevos.slice(0,30).map(function(p){
    var tc = TIPO_C[p.tipo]||TIPO_C['Otro'];
    return '<tr><td style="padding:5px 9px;border-bottom:1px solid #f0f0f0;font-size:12px"><strong>'+escapeHtml(p.nombre)+'</strong></td>'+
      '<td style="padding:5px 9px;border-bottom:1px solid #f0f0f0"><span class="cc-badge" style="background:'+tc[0]+';color:'+tc[1]+';font-size:10px">'+escapeHtml(p.tipo)+'</span></td>'+
      '<td style="padding:5px 9px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#555">'+escapeHtml(p.ingredienteActivo||'—')+'</td>'+
      '<td style="padding:5px 9px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#0a6ed1">'+escapeHtml(p.objetivo||'—')+'</td>'+
      '<td style="padding:5px 9px;border-bottom:1px solid #f0f0f0;font-size:11px">'+escapeHtml(p.dosis||'—')+' '+escapeHtml(p.unidad||'')+'</td></tr>';
  }).join('');
  var more = nuevos.length>30 ? '<div style="font-size:11px;color:#888;padding:6px 9px">... y '+(nuevos.length-30)+' más</div>' : '';
  var dupList = duplicados.length ? '<div style="margin-top:14px;background:#fff8e0;border-left:3px solid #e9730c;padding:8px 12px;font-size:11px;border-radius:4px;max-height:120px;overflow-y:auto"><strong>⚠ '+duplicados.length+' duplicados se omitirán:</strong><br>'+duplicados.slice(0,20).map(function(p){ return escapeHtml(p.nombre); }).join(', ')+(duplicados.length>20?', ...':'')+'</div>' : '';
  var html = '<div id="cc-imp-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto">'+
    '<div style="background:#fff;border-radius:10px;max-width:720px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;max-height:96vh">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'+
        '<div style="font-weight:700;font-size:15px">📊 Preview de importación desde Excel</div>'+
        '<button onclick="document.getElementById(\'cc-imp-modal\').remove()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>'+
      '</div>'+
      '<div style="padding:18px 20px;overflow-y:auto;flex:1">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
          '<div style="background:#d1e8ff;border-radius:6px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:700;color:#354a5f">'+nuevos.length+'</div><div style="font-size:11px;color:#354a5f">A importar</div></div>'+
          '<div style="background:#fff8e0;border-radius:6px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:700;color:#7a4200">'+duplicados.length+'</div><div style="font-size:11px;color:#7a4200">Duplicados (omitidos)</div></div>'+
        '</div>'+
        (nuevos.length>0 ?
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:6px">Productos a agregar al catálogo</div>'+
          '<div style="border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">'+
            '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#fafafa">'+
              '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700">Producto</th>'+
              '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700">Tipo</th>'+
              '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700">Ingr. activo</th>'+
              '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700">Objetivo</th>'+
              '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700">Dosis · Unidad</th>'+
            '</tr></thead><tbody>'+prodHtml+'</tbody></table>'+more+
          '</div>'
          : '<div class="cc-no-data"><span>📦</span>Ningún producto nuevo para importar.</div>') +
        dupList +
      '</div>'+
      '<div style="padding:12px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">'+
        '<button onclick="document.getElementById(\'cc-imp-modal\').remove()" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Cancelar</button>'+
        (nuevos.length>0 ? '<button onclick="_aplicarImport()" style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">✓ Importar '+nuevos.length+' productos</button>' : '') +
      '</div>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}
function _aplicarImport(){
  var items = window._impNuevos || [];
  if(!items.length){ document.getElementById('cc-imp-modal').remove(); return; }
  items.forEach(function(p){
    S.productos.push({
      nombre:p.nombre,
      tipo:p.tipo,
      ingredienteActivo: p.ingredienteActivo||'',
      objetivo: p.objetivo||'',
      unidad:p.unidad,
      dosis:p.dosis
    });
  });
  save();
  showNotice('✓ '+items.length+' productos importados al catálogo.','ok');
  document.getElementById('cc-imp-modal').remove();
  window._impNuevos = [];
  renderProdListWiz();
  renderProdList();
}
function findCol(headers,keys){
  for(var k=0;k<keys.length;k++){
    var idx=headers.findIndex(function(h){ return h.includes(keys[k]); });
    if(idx>=0) return idx;
  }
  return -1;
}
function downloadCSVTemplate(){
  // Mantenido por compatibilidad
  var csv='Producto,Tipo,Unidad,Dosis\nCaptan 80 WG,Fungicida,kg/100L,0.15\nClorpirifos 48 EC,Insecticida,mL/100L,100\nNitrato de Calcio,Fertilizante foliar,kg/ha,3\n';
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='plantilla_productos.csv'; a.click();
}
function downloadXLSXTemplate(){
  if(typeof XLSX==='undefined'){
    showNotice('Librería Excel no disponible. Recargue la página.','err');
    return;
  }
  var data = [
    {TIPO:'FUNGICIDA', PRODUCTO:'Captan 80 WG', 'INGREDIENTE ACTIVO':'Captan 80%', OBJETIVO:'Botrytis, Monilia', UNIDAD:'200 g/100 L', DOSIS:200},
    {TIPO:'INSECTICIDA', PRODUCTO:'Clorpirifos 48 EC', 'INGREDIENTE ACTIVO':'Clorpirifos 48%', OBJETIVO:'Burrito, Trips', UNIDAD:'100 cc/100 L', DOSIS:100},
    {TIPO:'FERTILIZANTE FOLIAR', PRODUCTO:'Nitrato de Calcio', 'INGREDIENTE ACTIVO':'Calcio, Nitrógeno', OBJETIVO:'Nutrición / Cracking', UNIDAD:'3 kg/ha', DOSIS:3},
    {TIPO:'COADYUVANTE', PRODUCTO:'Adherente XYZ', 'INGREDIENTE ACTIVO':'Nonil fenol', OBJETIVO:'Mojante', UNIDAD:'50 cc/100 L', DOSIS:50},
    {TIPO:'ENMIENDA', PRODUCTO:'Yeso agrícola', 'INGREDIENTE ACTIVO':'Sulfato de calcio', OBJETIVO:'Enmienda de suelo', UNIDAD:'500 kg/ha', DOSIS:500}
  ];
  var ws = XLSX.utils.json_to_sheet(data, {header:['TIPO','PRODUCTO','INGREDIENTE ACTIVO','OBJETIVO','UNIDAD','DOSIS']});
  // Ajustar ancho de columnas
  ws['!cols'] = [{wch:22},{wch:30},{wch:22},{wch:24},{wch:18},{wch:10}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla_productos_cuaderno.xlsx');
}
function addManualProduct(pfx){
  // Los IDs reales tienen prefijo 'cc-' (ej: cc-ap-n, cc-mp-n)
  var g=function(suf){ return document.getElementById('cc-'+pfx+'-'+suf); };
  var nomEl=g('n');
  if(!nomEl){ console.error('Formulario de producto no encontrado para prefijo', pfx); return; }
  var nom=nomEl.value.trim();
  if(!nom){ showNotice('Ingrese el nombre del producto.','err'); return; }
  if(S.productos.find(function(p){ return (p.nombre||'').toLowerCase()===nom.toLowerCase(); })){
    showNotice('Ya existe un producto con ese nombre.','err');
    return;
  }
  var iaEl=g('ia'), objEl=g('obj'), tEl=g('t'), uEl=g('u'), dEl=g('d');
  S.productos.push({
    nombre:nom,
    tipo: tEl ? tEl.value : '',
    ingredienteActivo: iaEl ? iaEl.value.trim() : '',
    objetivo: objEl ? objEl.value.trim() : '',
    unidad: uEl ? uEl.value : '',
    dosis: dEl ? dEl.value : ''
  });
  save();
  // Limpiar campos
  if(nomEl) nomEl.value='';
  if(dEl) dEl.value='';
  if(iaEl) iaEl.value='';
  if(objEl) objEl.value='';
  renderProdListWiz();
  renderProdList();
  showNotice('\u2713 Producto "'+nom+'" agregado.','ok');
}
function renderProdListWiz(){
  var el=document.getElementById('cc-prod-list-wiz'); if(!el) return;
  if(!S.productos.length){ el.innerHTML=''; return; }
  el.innerHTML='<div style="font-size:12px;color:#888;margin-bottom:6px">'+S.productos.length+' productos en catálogo:</div>'+
    '<div style="max-height:180px;overflow-y:auto;border:1px solid #eee;border-radius:6px">'+
    S.productos.slice(-10).map(function(p,i){
      return '<div style="padding:7px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;display:flex;justify-content:space-between">'+
        '<span style="font-weight:700">'+p.nombre+'</span><span style="color:#888">'+p.tipo+'</span></div>';
    }).join('')+'</div>';
}

// ══ LAUNCH ══
function launchApp(){
  savePanosFromTable();
  document.getElementById('cc-setup').style.display='none';
  document.getElementById('cc-app').style.display='block';
  initApp();
}
// ══ HEADER ══
function renderHeader(){
  var tHas=S.panos.reduce(function(s,p){ return s+p.hectareas; },0);
  document.getElementById('cc-h-has').textContent=tHas.toFixed(1);
  document.getElementById('cc-h-panos').textContent=S.panos.length;
  // Las aplicaciones reales son las CONFIRMACIONES, no S.registros (que es el
  // registro manual antiguo y hoy queda vacío). Mismo criterio que la tarjeta
  // "Aplicaciones confirmadas" del resumen, que sí mostraba el número correcto.
  document.getElementById('cc-h-regs').textContent=(S.confirmaciones||[]).length;
  renderCompraUrgente();
}

// ─── Tarjeta "Productos Compra Urgente" en el dashboard del Cuaderno ───
// Reúne los faltantes de stock detectados al emitir órdenes de aplicación.
function renderCompraUrgente(){
  var box=document.getElementById('cc-compra-urgente'); if(!box) return;
  var lista=Array.isArray(S.comprasUrgentes)?S.comprasUrgentes:[];
  // Filtrar solo entradas cuya orden todavía exista (no anuladas/eliminadas)
  var vigentes=lista.filter(function(e){ return S.ordenes.some(function(o){ return String(o.id)===String(e.ordenId); }); });
  // Total de productos distintos faltantes
  var prodset={};
  vigentes.forEach(function(e){ (e.items||[]).forEach(function(it){ prodset[(it.nombre||'').toUpperCase()]=true; }); });
  var nProd=Object.keys(prodset).length;
  if(!vigentes.length || !nProd){ box.innerHTML=''; return; }
  box.innerHTML=
    '<div onclick="abrirCompraUrgente()" style="cursor:pointer;background:linear-gradient(135deg,#b91c1c,#ef4444);border-radius:11px;padding:16px 20px;margin-bottom:16px;color:#fff;display:flex;align-items:center;gap:16px;box-shadow:0 2px 8px rgba(185,28,28,.25)">'+
      '<span style="font-size:34px;flex-shrink:0">🛒</span>'+
      '<div style="flex:1">'+
        '<div style="font-size:16px;font-weight:800">Productos Compra Urgente</div>'+
        '<div style="font-size:12px;color:#fde2e2;margin-top:2px">'+nProd+' producto(s) sin stock suficiente para '+vigentes.length+' orden(es) · Toca para ver el detalle</div>'+
      '</div>'+
      '<span style="font-size:22px;font-weight:700;background:rgba(255,255,255,.2);border-radius:8px;padding:4px 12px">'+nProd+'</span>'+
    '</div>';
}
// Claves de producto de la última apertura del detalle de compra urgente.
var _ccUrgKeys=[];
function abrirCompraUrgente(){
  var lista=Array.isArray(S.comprasUrgentes)?S.comprasUrgentes:[];
  var vigentes=lista.filter(function(e){ return S.ordenes.some(function(o){ return String(o.id)===String(e.ordenId); }); });
  if(!vigentes.length){ if(typeof toast==='function') toast('Sin pendientes','No hay productos en compra urgente','info'); return; }
  // Agrupar por producto: sumar lo que falta y registrar en qué órdenes se requiere
  var porProd={};
  vigentes.forEach(function(e){
    (e.items||[]).forEach(function(it){
      var k=(it.nombre||'').toUpperCase();
      if(!porProd[k]) porProd[k]={ nombre:it.nombre, totalFalta:0, unit:it.unit||'', encontrado:it.encontrado, ordenes:[] };
      porProd[k].totalFalta += (Number(it.falta)||0);
      if(!it.encontrado) porProd[k].encontrado=false;
      porProd[k].ordenes.push({ numero:e.numero, fecha:e.fecha, requerido:it.requerido, disponible:it.disponible, falta:it.falta, unit:it.unit, encontrado:it.encontrado });
    });
  });
  var esAdmin=(typeof can==='function') && can('config.editar');
  // Claves en el mismo orden que las tarjetas: la casilla envía el índice,
  // así los nombres con comillas o & no rompen el atributo onchange.
  _ccUrgKeys=Object.keys(porProd);
  var bodyRows=_ccUrgKeys.map(function(k,ki){
    var p=porProd[k];
    var detOrdenes=p.ordenes.map(function(o){
      return '<div style="font-size:12px;color:#475569;padding:3px 0;border-top:1px dashed #e2e8f0">'+
        '<strong>'+escapeHtml(o.numero)+'</strong> ('+escapeHtml(o.fecha||'')+') — requiere '+fmtN(o.requerido,2)+' '+(o.unit||'')+
        ' · stock '+(o.encontrado?fmtN(o.disponible,2)+' '+(o.unit||''):'no está en bodega')+
        ' · <span style="color:#b91c1c;font-weight:700">falta '+fmtN(o.falta,2)+' '+(o.unit||'')+'</span></div>';
    }).join('');
    var badge=p.encontrado?('Comprar ≈ '+fmtN(p.totalFalta,2)+' '+(p.unit||'')):'No está en bodega';
    // Casilla admin: descarta la alerta cuando la compra o la baja ya se resolvió a mano.
    var chk = esAdmin
      ? '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;color:#475569;cursor:pointer" '+
        'title="Quita este producto de la alerta. Úselo si ya lo compró o si la salida se registró manualmente.">'+
        '<input type="checkbox" onchange="descartarCompraUrgente('+ki+')" style="width:15px;height:15px;cursor:pointer">'+
        'Resuelto — quitar de la alerta</label>'
      : '';
    return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:12px 14px;margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'+
        '<div style="font-weight:800;color:#1f2d3d;font-size:14px">'+escapeHtml(p.nombre)+'</div>'+
        '<div style="background:#fef2f2;color:#b91c1c;font-weight:700;font-size:12px;padding:4px 10px;border-radius:8px">'+badge+'</div>'+
      '</div>'+detOrdenes+chk+
    '</div>';
  }).join('');
  var html='<div style="max-height:60vh;overflow-y:auto">'+
    '<div class="cc-notice" style="background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;margin-bottom:12px">Estos productos no tienen stock suficiente en bodega para las órdenes de aplicación emitidas. La cantidad a comprar es la suma de los faltantes de cada orden.</div>'+
    bodyRows+'</div>';
  if(typeof showModal==='function'){
    showModal('🛒 Productos Compra Urgente', html,
      '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>', 'lg');
  }
}

// Quita un producto de la alerta de compra urgente: se usa cuando la compra ya
// se hizo o cuando la baja de bodega se registró manualmente desde Salidas.
// Reservado a administradores (permiso config.editar).
function descartarCompraUrgente(ki){
  if(typeof can!=='function' || !can('config.editar')){
    if(typeof toast==='function') toast('Sin permiso','Solo un administrador puede descartar alertas','error');
    return;
  }
  var claveProd=(_ccUrgKeys||[])[ki];
  if(!claveProd){ if(typeof toast==='function') toast('No encontrado','No se pudo ubicar el producto','error'); return; }
  var lista=Array.isArray(S.comprasUrgentes)?S.comprasUrgentes:[];
  var k=String(claveProd).toUpperCase();
  var quitados=0;
  lista.forEach(function(e){
    var antes=(e.items||[]).length;
    e.items=(e.items||[]).filter(function(it){ return (it.nombre||'').toUpperCase()!==k; });
    quitados += antes-e.items.length;
  });
  // Descartar las entradas que quedaron sin productos pendientes
  S.comprasUrgentes=lista.filter(function(e){ return (e.items||[]).length>0; });
  if(typeof save==='function') save();
  if(typeof renderCompraUrgente==='function') renderCompraUrgente();
  if(typeof closeModal==='function') closeModal();
  if(typeof toast==='function'){
    toast('Alerta descartada', claveProd+' · '+quitados+' orden(es) actualizada(s)','success');
  }
  // Reabrir el detalle solo si aún quedan pendientes
  var quedan=(S.comprasUrgentes||[]).filter(function(e){
    return (S.ordenes||[]).some(function(o){ return String(o.id)===String(e.ordenId); });
  });
  if(quedan.length) setTimeout(abrirCompraUrgente,250);
}
try{ window.descartarCompraUrgente=descartarCompraUrgente; }catch(e){}

// ══ TAB NAV ══
function showTab(name,btn){
  document.querySelectorAll('.cc-tab-c').forEach(function(el){ el.classList.remove('cc-act'); });
  document.querySelectorAll('.cc-nav-btn').forEach(function(el){ el.classList.remove('cc-act'); });
  document.getElementById('cc-tab-'+name).classList.add('cc-act');
  btn.classList.add('cc-act');
  if(name==='historial'){ renderHist(); updateFiltroSelect(); }
  if(name==='resumen') renderResumen();
  if(name==='panos') renderPanosApp();
  if(name==='productos') renderProdList();
  if(name==='ordenes'){ 
    renderOrdenChips(); 
    ccRenderEquipoSelect();
    document.getElementById('cc-o-num').value='OA-'+String(S.oCounter).padStart(5,'0');
    // Inicializar dropdown de objetivos si no existe
    var objBox = document.getElementById('cc-o-obj-box');
    if(objBox && !objBox.innerHTML){
      objBox.innerHTML = renderObjetivosUI('cc-o-obj', [], '');
      setTimeout(function(){ ccObjUpdateSummary('cc-o-obj'); }, 30);
    }
  }
  if(name==='reportes') rpActualizarPreview();
  if(name==='estimacion') renderEstimacion();
  if(name==='fertirriego') renderFertirriego();
}

// ══════════════════════════════════════════════════════════════════
//  ESTIMACIÓN DE PRODUCCIÓN POR CONTEOS
//  Fórmula: centros florales/árbol × frutos/centro × kg/fruto = kg/árbol
//           kg/árbol × N° plantas = kg del paño
// ══════════════════════════════════════════════════════════════════

// Calcula plantas de un paño (valor manual o estimado densidad × ha)
function estPlantasDe(p){
  if(p.plantas && p.plantas>0) return Math.round(p.plantas);
  return Math.round((p.densidad||0)*(p.hectareas||0));
}

// Obtiene los conteos efectivos de un paño (los polinizantes heredan del padre)
function estConteosDe(p){
  // Cada paño (principal o polinizante) usa EXCLUSIVAMENTE sus propios conteos.
  // Los polinizantes ya no heredan del paño principal: se cuentan por separado
  // en terreno y sus datos se importan de forma independiente.
  var c = parseFloat(p.centrosFlorales)||0;
  var f = parseFloat(p.frutosPorCentro)||0;
  var k = parseFloat(p.kgPorFruto)||0;
  return {
    centros: c,
    frutos: f,
    kgFruto: k,
    centrosHered: false,
    frutosHered: false,
    kgFrutoHered: false,
    heredado: false
  };
}

// kg por árbol de un paño
function estKgArbol(p){
  var c = estConteosDe(p);
  return c.centros * c.frutos * c.kgFruto;
}

// kg totales del paño
function estKgPano(p){
  return estKgArbol(p) * estPlantasDe(p);
}


// ══════════════════════════════════════════════════════════════════
//  MÓDULO FERTIRRIEGO (dentro del Cuaderno de Campo)
//  Registra órdenes de aplicación por goteo. Productos del catálogo
//  del Cuaderno (S.productos). Las rebajas de bodega son manuales.
// ══════════════════════════════════════════════════════════════════
var _frEditId = null;
var _frSecSel = new Set();
var _frLineas = [];

function frTab(name, btn){
  document.querySelectorAll('.cc-fr-panel').forEach(function(el){ el.style.display='none'; });
  document.querySelectorAll('.fr-subtab').forEach(function(el){ el.classList.remove('fr-act'); });
  var panel = document.getElementById('cc-fr-'+name);
  if(panel) panel.style.display='block';
  if(btn) btn.classList.add('fr-act');
  if(name==='orden') frRenderOrden();
  if(name==='lista') frRenderLista();
  if(name==='inv') frRenderInv();
  if(name==='prod') frRenderProd();
  if(name==='param') frRenderParam();
}

function renderFertirriego(){
  _ensureFertirriego();
  // Mostrar la subpestaña activa (por defecto, Nueva Orden)
  var activa = document.querySelector('.fr-subtab.fr-act');
  var name = activa ? activa.getAttribute('data-fr') : 'orden';
  if(name==='orden') frRenderOrden();
  else if(name==='lista') frRenderLista();
  else if(name==='inv') frRenderInv();
  else if(name==='prod') frRenderProd();
  else if(name==='param') frRenderParam();
}

// ───────────── SECTORES Y EQUIPOS (Inventario de riego) ─────────────
// ───────────── PRODUCTOS Y APORTES NUTRICIONALES ─────────────
// Nutrientes que se registran como % del producto
var FR_NUTRIENTES = ['N','P','K','Mg','S','Ca','B','Zn'];

// ── Base de fertilizantes conocidos con su aporte nutricional (% elemental) ──
// Valores referenciales de composición garantizada. P y K expresados como ELEMENTO.
// (Para convertir de óxido: P = P2O5 × 0.4364 ; K = K2O × 0.8301)
// patrones: lista de palabras clave que deben estar TODAS en el nombre para coincidir.
var FR_BASE_NUTRIENTES = [
  // Nitrogenados
  { nombre:'Urea',                       patrones:['urea'],                              ap:{N:46} },
  { nombre:'Nitrato de amonio',          patrones:['nitrato','amonio'],                  ap:{N:33} },
  { nombre:'Sulfato de amonio',          patrones:['sulfato','amonio'],                  ap:{N:21, S:24} },
  { nombre:'Nitrato de calcio',          patrones:['nitrato','calcio'],                  ap:{N:15.5, Ca:19} },
  { nombre:'Nitrato de magnesio',        patrones:['nitrato','magnesio'],                ap:{N:11, Mg:9.5} },
  { nombre:'Nitrato de potasio',         patrones:['nitrato','potasio'],                 ap:{N:13, K:38} },
  { nombre:'Nitrato de potasio (salitre potásico)', patrones:['salitre','potasico'],     ap:{N:15, K:14} },
  { nombre:'UAN 32',                     patrones:['uan'],                               ap:{N:32} },
  // Fosfatados
  { nombre:'MAP (fosfato monoamónico)',  patrones:['map'],                               ap:{N:12, P:26} },
  { nombre:'Fosfato monoamónico',        patrones:['fosfato','monoamonico'],             ap:{N:12, P:26} },
  { nombre:'DAP (fosfato diamónico)',    patrones:['dap'],                               ap:{N:18, P:20} },
  { nombre:'Fosfato diamónico',          patrones:['fosfato','diamonico'],               ap:{N:18, P:20} },
  { nombre:'Fosfato monopotásico (MKP)', patrones:['fosfato','monopotasico'],            ap:{P:22.7, K:28} },
  { nombre:'MKP',                        patrones:['mkp'],                               ap:{P:22.7, K:28} },
  { nombre:'Ácido fosfórico',            patrones:['acido','fosforico'],                 ap:{P:23} },
  { nombre:'Superfosfato triple',        patrones:['superfosfato','triple'],             ap:{P:20, Ca:14} },
  { nombre:'Superfosfato normal',        patrones:['superfosfato','normal'],             ap:{P:9, Ca:20, S:12} },
  // Potásicos
  { nombre:'Cloruro de potasio (KCl)',   patrones:['cloruro','potasio'],                 ap:{K:50} },
  { nombre:'Muriato de potasio',         patrones:['muriato','potasio'],                 ap:{K:50} },
  { nombre:'Sulfato de potasio',         patrones:['sulfato','potasio'],                 ap:{K:42, S:18} },
  { nombre:'Sulfato de potasio y magnesio', patrones:['sulfato','potasio','magnesio'],   ap:{K:18, Mg:11, S:22} },
  { nombre:'Tiosulfato de potasio',      patrones:['tiosulfato','potasio'],              ap:{K:25, S:17} },
  // Cálcicos / magnésicos / azufrados
  { nombre:'Sulfato de magnesio (sal de Epsom)', patrones:['sulfato','magnesio'],        ap:{Mg:9.8, S:13} },
  { nombre:'Sulfato de calcio (yeso)',   patrones:['sulfato','calcio'],                  ap:{Ca:23, S:18} },
  { nombre:'Yeso agrícola',              patrones:['yeso'],                              ap:{Ca:23, S:18} },
  { nombre:'Cloruro de calcio',          patrones:['cloruro','calcio'],                  ap:{Ca:36} },
  { nombre:'Tiosulfato de amonio',       patrones:['tiosulfato','amonio'],               ap:{N:12, S:26} },
  { nombre:'Azufre elemental',           patrones:['azufre'],                            ap:{S:90} },
  // Enmiendas
  { nombre:'Cal (carbonato de calcio)',  patrones:['carbonato','calcio'],                ap:{Ca:38} },
  { nombre:'Cal agrícola',               patrones:['cal','agricola'],                    ap:{Ca:38} },
  { nombre:'Dolomita',                   patrones:['dolomita'],                          ap:{Ca:21, Mg:11} },
  { nombre:'Cal dolomítica',             patrones:['cal','dolomitica'],                  ap:{Ca:21, Mg:11} },
  // Micronutrientes / boro / zinc
  { nombre:'Boro (ácido bórico)',        patrones:['acido','borico'],                    ap:{B:17} },
  { nombre:'Borax / Boro',               patrones:['borax'],                             ap:{B:11} },
  { nombre:'Boro',                       patrones:['boro'],                              ap:{B:11} },
  { nombre:'Sulfato de zinc',            patrones:['sulfato','zinc'],                    ap:{Zn:35, S:17} },
  { nombre:'Quelato de zinc',            patrones:['quelato','zinc'],                    ap:{Zn:14} },
  { nombre:'Zinc',                       patrones:['zinc'],                              ap:{Zn:35} }
];

// Normaliza texto: minúsculas, sin tildes
function _frNorm(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim();
}

// Busca coincidencia en la base por nombre comercial. Devuelve {ap, nombreBase} o null.
function frBuscarAporteBase(nombreComercial){
  var n = _frNorm(nombreComercial);
  if(!n) return null;
  // Buscar la coincidencia con MÁS patrones cumplidos (la más específica)
  var mejor=null, mejorScore=0;
  FR_BASE_NUTRIENTES.forEach(function(item){
    var todos = item.patrones.every(function(pat){ return n.indexOf(_frNorm(pat))>=0; });
    if(todos && item.patrones.length>mejorScore){
      mejor=item; mejorScore=item.patrones.length;
    }
  });
  return mejor ? {ap:mejor.ap, nombreBase:mejor.nombre} : null;
}


function frRenderProd(){
  _ensureFertirriego();
  var f = S.fertirriego;
  var cont = document.getElementById('cc-fr-prod'); if(!cont) return;
  // Solo fertilizantes de suelo/edáficos y enmiendas
  var TIPOS_FR = ['fertilizante suelo','fertilizante edafico','fertilizante ed\u00e1fico','enmienda'];
  var prods = (S.productos||[]).filter(function(p){
    var t=(p.tipo||'').toLowerCase().trim();
    return TIPOS_FR.indexOf(t)>=0;
  }).sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||''); });

  var html = '<div style="font-size:13px;color:#666;margin-bottom:10px">Configure el <strong>aporte nutricional (%)</strong> de cada fertilizante de suelo y enmienda. Estos valores se usan para calcular el aporte real de nutrientes según la dosis aplicada en cada orden.</div>';
  html += '<div style="margin-bottom:10px"><button class="cc-btn cc-btn-g cc-btn-sm" onclick="frAutocompletarTodos()">✨ Autocompletar % desde base de fertilizantes conocidos</button> <span style="font-size:11px;color:#888">Rellena los productos vacíos cuyo nombre coincida con un fertilizante conocido (urea, MAP, nitrato de potasio, etc.).</span></div>';

  if(!prods.length){
    html += '<div style="padding:24px;text-align:center;color:#999;border:1px dashed #ccc;border-radius:8px">Sin productos de tipo fertilizante de suelo/edáfico o enmienda. Agréguelos primero en el catálogo de Productos del Cuaderno.</div>';
    cont.innerHTML=html; return;
  }

  html += '<div style="overflow-x:auto"><table class="data" style="width:100%;font-size:12px;min-width:1000px"><thead><tr>'+
    '<th style="min-width:180px">Nombre comercial</th>'+
    '<th style="min-width:75px">Unidad</th>'+
    '<th style="min-width:110px">Forma aplicación</th>'+
    '<th style="min-width:90px;text-align:right">Dosis defecto<br><span style="font-weight:400;font-size:10px">(× ha · día)</span></th>'+
    FR_NUTRIENTES.map(function(nu){return '<th style="min-width:60px;text-align:right">'+nu+' %</th>';}).join('')+
  '</tr></thead><tbody>';

  prods.forEach(function(p){
    // Buscar índice real en S.productos (para guardar)
    var idx = S.productos.indexOf(p);
    var ap = p.aportes||{};
    html += '<tr>'+
      '<td style="font-weight:600">'+escapeHtml(p.nombre)+(frBuscarAporteBase(p.nombre)?' <button onclick="frAutocompletarUno('+idx+')" title="Autocompletar desde: '+escapeHtml(frBuscarAporteBase(p.nombre).nombreBase)+'" style="background:#0a6ed1;color:#fff;border:none;border-radius:4px;padding:1px 6px;cursor:pointer;font-size:10px;margin-left:4px">✨ base</button>':'')+'</td>'+
      '<td><select onchange="frProdUpd('+idx+',\'frUnidad\',this.value)" style="width:100%;padding:4px;border:1px solid #d9d9d9;border-radius:5px;font-size:11px">'+
        f.cfg.unidades.map(function(u){return '<option '+((p.frUnidad||p.unidad)===u?'selected':'')+'>'+escapeHtml(u)+'</option>';}).join('')+
      '</select></td>'+
      '<td><select onchange="frProdUpd('+idx+',\'frForma\',this.value)" style="width:100%;padding:4px;border:1px solid #d9d9d9;border-radius:5px;font-size:11px">'+
        f.cfg.formas.map(function(fo){return '<option '+(p.frForma===fo?'selected':'')+'>'+escapeHtml(fo)+'</option>';}).join('')+
      '</select></td>'+
      '<td><input type="number" step="any" min="0" value="'+(p.frDosisDef!=null?p.frDosisDef:'')+'" onchange="frProdUpd('+idx+',\'frDosisDef\',this.value)" style="width:80px;padding:4px;border:1px solid #d9d9d9;border-radius:5px;text-align:right;font-size:11px"></td>'+
      FR_NUTRIENTES.map(function(nu){
        return '<td><input type="number" step="any" min="0" max="100" value="'+(ap[nu]!=null?ap[nu]:'')+'" onchange="frProdUpdAporte('+idx+',\''+nu+'\',this.value)" style="width:55px;padding:4px;border:1px solid #d9d9d9;border-radius:5px;text-align:right;font-size:11px" placeholder="0"></td>';
      }).join('')+
    '</tr>';
  });
  html += '</tbody></table></div>';
  html += '<div style="font-size:11px;color:#888;margin-top:8px">💡 Los porcentajes representan el contenido de cada nutriente en el producto (ej: un 0-52-34 tiene P=52 y K=34). El sistema usa estos valores para calcular kg de nutriente aportado según la dosis y superficie.</div>';
  cont.innerHTML = html;
}

function frProdUpd(idx, campo, val){
  var p = S.productos[idx]; if(!p) return;
  if(campo==='frDosisDef'){ p[campo]=parseFloat(val)||0; }
  else { p[campo]=val; }
  save();
}
function frProdUpdAporte(idx, nutriente, val){
  var p = S.productos[idx]; if(!p) return;
  if(!p.aportes) p.aportes={};
  var n=parseFloat(val);
  if(isNaN(n)||n===0){ delete p.aportes[nutriente]; }
  else { p.aportes[nutriente]=n; }
  save();
}

// Autocompletar UN producto desde la base de fertilizantes conocidos
function frAutocompletarUno(idx){
  var p = S.productos[idx]; if(!p) return;
  var match = frBuscarAporteBase(p.nombre);
  if(!match){ toast('Sin coincidencia','No se encontró "'+p.nombre+'" en la base de fertilizantes','error'); return; }
  p.aportes = {};
  FR_NUTRIENTES.forEach(function(nu){ if(match.ap[nu]!=null){ p.aportes[nu]=match.ap[nu]; } });
  save();
  frRenderProd();
  toast('Aportes cargados','"'+p.nombre+'" → '+match.nombreBase,'success');
}

// Autocompletar TODOS los productos vacíos que coincidan con la base
function frAutocompletarTodos(){
  var TIPOS_FR = ['fertilizante suelo','fertilizante edafico','fertilizante ed\u00e1fico','enmienda'];
  var candidatos = (S.productos||[]).filter(function(p){
    var t=(p.tipo||'').toLowerCase().trim();
    return TIPOS_FR.indexOf(t)>=0;
  });
  var conMatch = candidatos.filter(function(p){ return frBuscarAporteBase(p.nombre); });
  if(!conMatch.length){ toast('Sin coincidencias','Ningún producto coincide con la base de fertilizantes conocidos','error'); return; }
  // Cuántos ya tienen aportes (para avisar que se sobrescriben)
  var conDatos = conMatch.filter(function(p){ return p.aportes && Object.keys(p.aportes).length>0; }).length;
  var msg = 'Se encontraron '+conMatch.length+' producto(s) que coinciden con la base de fertilizantes.';
  if(conDatos>0) msg += ' '+conDatos+' ya tienen valores que serán SOBRESCRITOS.';
  msg += ' ¿Continuar?';
  confirmDialog('Autocompletar aportes', msg, function(){
    var n=0;
    conMatch.forEach(function(p){
      var match=frBuscarAporteBase(p.nombre);
      if(match){
        p.aportes={};
        FR_NUTRIENTES.forEach(function(nu){ if(match.ap[nu]!=null){ p.aportes[nu]=match.ap[nu]; } });
        n++;
      }
    });
    save();
    frRenderProd();
    toast('Aportes cargados',n+' producto(s) actualizados desde la base','success');
  },'Autocompletar',false);
}


function frRenderInv(){
  _ensureFertirriego();
  var f = S.fertirriego;
  var cont = document.getElementById('cc-fr-inv'); if(!cont) return;
  var totalHa = f.sectores.reduce(function(a,s){ return a+(parseFloat(s.ha)||0); },0);
  var varsList = [...new Set(S.panos.map(function(p){return p.variedad;}).filter(Boolean))];

  var html = '<div style="background:#f5f9fd;border:1px solid #d1e8ff;border-radius:8px;padding:14px;margin-bottom:14px">'+
    '<div style="font-weight:700;color:#0854a0;margin-bottom:10px">Agregar sector de riego</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">'+
      '<div class="cc-field"><label class="cc-lbl">Nombre / Código sector</label><input type="text" id="fr-sec-nombre" placeholder="Ej: Sector 1, Cuartel A"></div>'+
      '<div class="cc-field"><label class="cc-lbl">Equipo de riego</label><input type="text" id="fr-sec-equipo" list="fr-equipos-dl" placeholder="Ej: E.1"><datalist id="fr-equipos-dl">'+f.cfg.equipos.map(function(e){return '<option value="'+escapeHtml(e)+'">';}).join('')+'</datalist></div>'+
      '<div class="cc-field"><label class="cc-lbl">Superficie (ha)</label><input type="number" id="fr-sec-ha" step="0.01" min="0" placeholder="0.0"></div>'+
      '<div class="cc-field"><label class="cc-lbl">Variedad</label><input type="text" id="fr-sec-var" list="fr-vars-dl" placeholder="Variedad"><datalist id="fr-vars-dl">'+varsList.map(function(v){return '<option value="'+escapeHtml(v)+'">';}).join('')+'</datalist></div>'+
      '<div class="cc-field"><label class="cc-lbl">N° plantas (opc.)</label><input type="number" id="fr-sec-pl" step="1" min="0" placeholder="0"></div>'+
    '</div>'+
    '<div class="cc-field" style="margin-top:10px"><label class="cc-lbl">Paños del huerto asociados (opcional)</label>'+
      '<div style="font-size:11px;color:#888;margin-bottom:5px">Selecciona los cuarteles que riega este sector. Si se asignan, la distribución del producto se hace por paño según sus hectáreas. Si no, se usa la superficie del sector.</div>'+
      '<div id="fr-sec-panos" style="display:flex;flex-wrap:wrap;gap:6px;max-height:130px;overflow-y:auto;padding:4px;border:1px solid #e5e5e5;border-radius:6px">'+
        ((S.panos||[]).length? (S.panos||[]).slice().sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'');}).map(function(p){
          var ha=(parseFloat(p.has_riego)||parseFloat(p.hectareas)||0);
          return '<label style="display:flex;align-items:center;gap:5px;font-size:12px;background:#f7f9fb;border:1px solid #e0e0e0;border-radius:6px;padding:4px 8px;cursor:pointer">'+
            '<input type="checkbox" class="fr-sec-pano-cb" value="'+escapeHtml(String(p.id))+'"> '+escapeHtml(p.nombre||'')+' <span style="color:#999">('+ha.toFixed(2)+' ha)</span></label>';
        }).join('') : '<span style="font-size:12px;color:#999;padding:4px">No hay paños cargados en el huerto todavía.</span>')+
      '</div>'+
    '</div>'+
    '<button class="cc-btn cc-btn-g cc-btn-sm" style="margin-top:10px" onclick="frAgregarSector()">+ Agregar sector</button>'+
  '</div>';

  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
    '<div style="font-weight:700;color:#23303d">Sectores registrados ('+f.sectores.length+' · '+totalHa.toFixed(2)+' ha)</div>'+
    (f.sectores.length?'<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frExportSectores()">📊 Exportar</button>':'')+
  '</div>';

  if(!f.sectores.length){
    html += '<div style="padding:20px;text-align:center;color:#999;border:1px dashed #ccc;border-radius:8px">Sin sectores. Agregue el primero arriba.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table class="data" style="width:100%;font-size:13px"><thead><tr>'+
      '<th>Sector</th><th>Equipo</th><th>Variedad</th><th style="text-align:right">Ha</th><th style="text-align:right">Plantas</th><th></th>'+
    '</tr></thead><tbody>';
    f.sectores.forEach(function(s){
      html += '<tr>'+
        '<td style="font-weight:600">'+escapeHtml(s.nombre)+'</td>'+
        '<td>'+escapeHtml(s.equipo||'-')+'</td>'+
        '<td>'+escapeHtml(s.variedad||'-')+'</td>'+
        '<td style="text-align:right">'+(parseFloat(s.ha)||0).toFixed(2)+'</td>'+
        '<td style="text-align:right">'+(s.plantas?Number(s.plantas).toLocaleString('es-CL'):'-')+'</td>'+
        '<td style="text-align:right"><button onclick="frEliminarSector(\''+s.id+'\')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:14px" title="Eliminar">✕</button></td>'+
      '</tr>';
    });
    html += '</tbody></table></div>';
  }
  cont.innerHTML = html;
}

function frAgregarSector(){
  _ensureFertirriego();
  var nombre=(document.getElementById('fr-sec-nombre').value||'').trim();
  if(!nombre){ toast('Falta nombre','Ingrese el nombre del sector','error'); return; }
  var equipo=(document.getElementById('fr-sec-equipo').value||'').trim();
  // Paños del huerto asociados (opcional)
  var panosSel=[];
  document.querySelectorAll('.fr-sec-pano-cb:checked').forEach(function(cb){ panosSel.push(cb.value); });
  // Si hay paños asignados, la superficie del sector se toma como la suma de sus
  // hectáreas de riego (a menos que el usuario haya escrito una ha mayor a 0).
  var haInput=parseFloat(document.getElementById('fr-sec-ha').value)||0;
  var haPanos=panosSel.reduce(function(a,pid){ var p=(S.panos||[]).find(function(x){return String(x.id)===String(pid);}); return a+(p?(parseFloat(p.has_riego)||parseFloat(p.hectareas)||0):0); },0);
  var haFinal = haInput>0 ? haInput : haPanos;
  S.fertirriego.sectores.push({
    id: uid(),
    nombre: nombre,
    equipo: equipo,
    ha: haFinal,
    variedad: (document.getElementById('fr-sec-var').value||'').trim(),
    plantas: parseFloat(document.getElementById('fr-sec-pl').value)||0,
    panos: panosSel
  });
  // Registrar el equipo en cfg si es nuevo
  if(equipo && S.fertirriego.cfg.equipos.indexOf(equipo)<0){ S.fertirriego.cfg.equipos.push(equipo); }
  save();
  frRenderInv();
  toast('Sector agregado','"'+nombre+'" agregado','success');
}

function frEliminarSector(id){
  _ensureFertirriego();
  // Verificar que no esté usado en órdenes
  var usado = S.fertirriego.ordenes.some(function(o){ return (o.sectores||[]).indexOf(id)>=0; });
  if(usado){ toast('No se puede eliminar','El sector tiene órdenes asociadas','error'); return; }
  confirmDialog('Eliminar sector','¿Eliminar este sector de riego?',function(){
    S.fertirriego.sectores = S.fertirriego.sectores.filter(function(s){ return String(s.id)!==String(id); });
    save();
    frRenderInv();
    toast('Sector eliminado','','success');
  },'Eliminar',true);
}

// ───────────── PARÁMETROS ─────────────
function frRenderParam(){
  _ensureFertirriego();
  var f = S.fertirriego, c = f.cfg;
  var cont = document.getElementById('cc-fr-param'); if(!cont) return;

  // Helper: lista de chips editable (una sola columna de texto)
  function chips(arr, fnDel){
    return (arr.length?arr.map(function(x,i){return '<span style="background:#eef3f8;border:1px solid #d1e8ff;border-radius:14px;padding:3px 10px;font-size:12px;display:inline-flex;align-items:center;gap:6px;margin:2px">'+escapeHtml(x)+' <button onclick="'+fnDel+'('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;padding:0;font-size:13px">\u2715</button></span>';}).join(''):'<span style="color:#999;font-size:12px">Sin elementos</span>');
  }
  function bloqueLista(titulo, arr, fnAdd, fnDel, inputId, ph){
    return '<div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:14px">'+
      '<div style="font-weight:700;color:#0854a0;margin-bottom:8px;font-size:13px">'+titulo+'</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:10px;max-height:260px;overflow-y:auto">'+chips(arr,fnDel)+'</div>'+
      '<div style="display:flex;gap:6px"><input type="text" id="'+inputId+'" placeholder="'+ph+'" onkeydown="if(event.key===\'Enter\'){'+fnAdd+'();}" style="flex:1;padding:6px 9px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px"><button class="cc-btn cc-btn-g cc-btn-sm" onclick="'+fnAdd+'()">+ Agregar</button></div>'+
    '</div>';
  }

  var html='';
  // ── Identificación ──
  html += '<div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:14px">'+
    '<div style="font-weight:700;color:#23303d;margin-bottom:10px">Identificación</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">'+
      '<div class="cc-field"><label class="cc-lbl">Empresa / Fundo</label><input type="text" id="fr-cfg-empresa" value="'+escapeHtml(c.empresa)+'" onchange="frSaveIdent()"></div>'+
      '<div class="cc-field"><label class="cc-lbl">Temporada</label><input type="text" id="fr-cfg-temporada" value="'+escapeHtml(c.temporada)+'" onchange="frSaveIdent()"></div>'+
      '<div class="cc-field"><label class="cc-lbl">Documento</label><input type="text" id="fr-cfg-documento" value="'+escapeHtml(c.documento)+'" onchange="frSaveIdent()"></div>'+
    '</div>'+
    '<div class="cc-field" style="margin-top:12px"><label class="cc-lbl">Observación por defecto en órdenes</label><textarea id="fr-cfg-obs" rows="2" onchange="frSaveIdent()" style="width:100%;padding:7px 9px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical">'+escapeHtml(c.obsDefecto)+'</textarea></div>'+
  '</div>';

  // ── Rangos de numeración ──
  html += '<div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:14px">'+
    '<div style="font-weight:700;color:#23303d;margin-bottom:10px">Rangos de numeración por especie / tipo</div>'+
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f0f0f0">'+
      '<th style="padding:6px 10px;text-align:left">Especie / Tipo</th><th style="padding:6px 10px;text-align:right">Desde</th><th style="padding:6px 10px;text-align:right">Hasta</th><th></th></tr></thead><tbody>'+
      c.rangos.map(function(r,i){return '<tr>'+
        '<td style="padding:4px 8px"><input type="text" value="'+escapeHtml(r.especie||'')+'" onchange="frUpdRango('+i+',\'especie\',this.value)" style="width:100%;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px"></td>'+
        '<td style="padding:4px 8px"><input type="number" value="'+(r.desde||1)+'" onchange="frUpdRango('+i+',\'desde\',this.value)" style="width:90px;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px;text-align:right"></td>'+
        '<td style="padding:4px 8px"><input type="number" value="'+(r.hasta||99)+'" onchange="frUpdRango('+i+',\'hasta\',this.value)" style="width:90px;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px;text-align:right"></td>'+
        '<td style="padding:4px 8px;text-align:center"><button onclick="frDelRango('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:14px">\u2715</button></td>'+
      '</tr>';}).join('')+
    '</tbody></table></div>'+
    '<button class="cc-btn cc-btn-s cc-btn-sm" style="margin-top:8px" onclick="frAddRango()">+ Agregar rango</button>'+
    '<div style="font-size:11px;color:#888;margin-top:6px">Al elegir la especie en una orden nueva se sugiere el siguiente número libre dentro de su rango.</div>'+
  '</div>';

  // ── Grid de listas ──
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px">'+
    bloqueLista('Estados fenológicos', c.estados, 'frAddEstado','frDelEstado','fr-new-estado','Ej: PLENA FLOR')+
    bloqueLista('Tipos de cuartel / condición', c.condiciones, 'frAddCondicion','frDelCondicion','fr-new-condicion','Ej: NORMAL')+
    bloqueLista('Equipos de riego', c.equipos, 'frAddEquipo','frDelEquipo','fr-new-equipo','Ej: EQ 1')+
    bloqueLista('Horarios de trabajo', c.horarios, 'frAddHorario','frDelHorario','fr-new-horario','Ej: 08:00 A 17:00')+
    bloqueLista('Tipos de documento', c.tiposDoc, 'frAddTipoDoc','frDelTipoDoc','fr-new-tipodoc','Ej: ORDEN APLICACION')+
    bloqueLista('Formas de aplicación', c.formas, 'frAddForma','frDelForma','fr-new-forma','Ej: POR GOTEO')+
    bloqueLista('Unidades de medida', c.unidades, 'frAddUnidad','frDelUnidad','fr-new-unidad','Ej: L, kg, C.C')+
  '</div>';

  // ── Predios y administradores ──
  html += '<div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:14px">'+
    '<div style="font-weight:700;color:#23303d;margin-bottom:10px">Predios y administradores</div>'+
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f0f0f0">'+
      '<th style="padding:6px 10px;text-align:left">Predio</th><th style="padding:6px 10px;text-align:left">Administrador</th><th></th></tr></thead><tbody>'+
      c.predios.map(function(p,i){return '<tr>'+
        '<td style="padding:4px 8px"><input type="text" value="'+escapeHtml(p.predio||'')+'" onchange="frUpdPredio('+i+',\'predio\',this.value)" style="width:100%;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px"></td>'+
        '<td style="padding:4px 8px"><input type="text" value="'+escapeHtml(p.admin||'')+'" onchange="frUpdPredio('+i+',\'admin\',this.value)" style="width:100%;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px"></td>'+
        '<td style="padding:4px 8px;text-align:center"><button onclick="frDelPredio('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:14px">\u2715</button></td>'+
      '</tr>';}).join('')||'<tr><td colspan="3" style="padding:10px;color:#999;text-align:center">Sin predios</td></tr>'+
    '</tbody></table></div>'+
    '<button class="cc-btn cc-btn-s cc-btn-sm" style="margin-top:8px" onclick="frAddPredio()">+ Agregar predio</button>'+
  '</div>';

  // ── Zona de riesgo ──
  html += '<div style="background:#fff5f5;border:1px solid #f0b8b8;border-radius:8px;padding:16px">'+
    '<div style="font-weight:700;color:#b00;margin-bottom:8px">Zona de riesgo</div>'+
    '<button class="cc-btn cc-btn-r cc-btn-sm" onclick="frBorrarTodo()">Borrar todos los datos de fertirriego</button>'+
    '<div style="font-size:11px;color:#888;margin-top:6px">Elimina sectores, órdenes y configuración del módulo de fertirriego. No afecta al resto del Cuaderno ni al SCI.</div>'+
  '</div>';

  cont.innerHTML = html;
}

// ── Identificación ──
function frSaveIdent(){
  var c=S.fertirriego.cfg;
  c.empresa=(document.getElementById('fr-cfg-empresa').value||'').trim();
  c.temporada=(document.getElementById('fr-cfg-temporada').value||'').trim();
  c.documento=(document.getElementById('fr-cfg-documento').value||'').trim();
  c.obsDefecto=(document.getElementById('fr-cfg-obs').value||'').trim();
  save();
}

// ── Rangos ──
function frAddRango(){ S.fertirriego.cfg.rangos.push({especie:'',desde:1,hasta:99}); save(); frRenderParam(); }
function frUpdRango(i,campo,val){ var r=S.fertirriego.cfg.rangos[i]; if(!r)return; r[campo]=(campo==='especie')?val:(parseInt(val)||0); save(); }
function frDelRango(i){ S.fertirriego.cfg.rangos.splice(i,1); save(); frRenderParam(); }

// ── Predios ──
function frAddPredio(){ S.fertirriego.cfg.predios.push({predio:'',admin:''}); save(); frRenderParam(); }
function frUpdPredio(i,campo,val){ var p=S.fertirriego.cfg.predios[i]; if(!p)return; p[campo]=val; save(); }
function frDelPredio(i){ S.fertirriego.cfg.predios.splice(i,1); save(); frRenderParam(); }

// ── Listas simples (genéricas) ──
function _frAddTo(arrName,inputId){ var v=(document.getElementById(inputId).value||'').trim(); if(!v)return; if(S.fertirriego.cfg[arrName].indexOf(v)<0)S.fertirriego.cfg[arrName].push(v); save(); frRenderParam(); }
function _frDelFrom(arrName,i){ S.fertirriego.cfg[arrName].splice(i,1); save(); frRenderParam(); }
function frAddEstado(){ _frAddTo('estados','fr-new-estado'); }
function frDelEstado(i){ _frDelFrom('estados',i); }
function frAddCondicion(){ _frAddTo('condiciones','fr-new-condicion'); }
function frDelCondicion(i){ _frDelFrom('condiciones',i); }
function frAddEquipo(){ _frAddTo('equipos','fr-new-equipo'); }
function frDelEquipo(i){ _frDelFrom('equipos',i); }
function frAddHorario(){ _frAddTo('horarios','fr-new-horario'); }
function frDelHorario(i){ _frDelFrom('horarios',i); }
function frAddTipoDoc(){ _frAddTo('tiposDoc','fr-new-tipodoc'); }
function frDelTipoDoc(i){ _frDelFrom('tiposDoc',i); }
function frAddForma(){ _frAddTo('formas','fr-new-forma'); }
function frDelForma(i){ _frDelFrom('formas',i); }
function frAddUnidad(){ _frAddTo('unidades','fr-new-unidad'); }
function frDelUnidad(i){ _frDelFrom('unidades',i); }

// ── Borrar todo ──
function frBorrarTodo(){
  confirmDialog('Borrar datos de fertirriego','¿Borrar TODOS los sectores, órdenes y configuración del módulo de fertirriego? Esta acción no se puede deshacer.',function(){
    S.fertirriego={ sectores:[], ordenes:[], oCounter:1, cfg:{} };
    _ensureFertirriego();
    save();
    frRenderParam();
    toast('Datos borrados','El módulo de fertirriego fue reiniciado','success');
  },'Borrar todo',true);
}


function frExportSectores(){
  if(typeof XLSX==='undefined'){ toast('Sin librería','Excel no disponible','error'); return; }
  var rows=[['Sector','Equipo','Variedad','Ha','Plantas']];
  S.fertirriego.sectores.forEach(function(s){ rows.push([s.nombre,s.equipo||'',s.variedad||'',parseFloat(s.ha)||0,s.plantas||0]); });
  var wb=XLSX.utils.book_new(); var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:18},{wch:12},{wch:16},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,'Sectores riego');
  XLSX.writeFile(wb,'Sectores_Fertirriego_'+new Date().toISOString().slice(0,10)+'.xlsx');
}


// ───────────── NUEVA ORDEN ─────────────
function frRenderOrden(){
  _ensureFertirriego();
  var f = S.fertirriego;
  var cont = document.getElementById('cc-fr-orden'); if(!cont) return;
  if(!_frEditId){ _frSecSel = _frSecSel || new Set(); }

  var hoy = new Date().toISOString().slice(0,10);
  var equipos = [...new Set([...f.cfg.equipos, ...f.sectores.map(function(s){return s.equipo;})])].filter(Boolean).sort();
  var numero = _frEditId ? (f.ordenes.find(function(o){return String(o.id)===String(_frEditId);})||{}).numero : ('OAF-'+String(f.oCounter).padStart(5,'0'));

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:14px">'+
    '<div class="cc-field"><label class="cc-lbl">N° Orden</label><input type="text" id="fr-o-num" value="'+escapeHtml(numero)+'" readonly style="background:#f0f0f0"></div>'+
    '<div class="cc-field"><label class="cc-lbl">Fecha</label><input type="date" id="fr-o-fecha" value="'+hoy+'"></div>'+
    '<div class="cc-field"><label class="cc-lbl">Forma de aplicación</label><select id="fr-o-forma">'+f.cfg.formas.map(function(x){return '<option>'+escapeHtml(x)+'</option>';}).join('')+'</select></div>'+
    '<div class="cc-field"><label class="cc-lbl">Horario</label><select id="fr-o-horario">'+f.cfg.horarios.map(function(x){return '<option>'+escapeHtml(x)+'</option>';}).join('')+'</select></div>'+
    '<div class="cc-field"><label class="cc-lbl">Estado fenológico</label><input type="text" id="fr-o-estado" list="fr-estados-dl" placeholder="Ej: PLENA FLOR"><datalist id="fr-estados-dl">'+(f.cfg.estados||[]).map(function(e){return '<option value="'+escapeHtml(e)+'">';}).join('')+'</datalist></div>'+
    '<div class="cc-field"><label class="cc-lbl">Responsable</label><input type="text" id="fr-o-resp" placeholder="Nombre"></div>'+
  '</div>';

  // Selección de sectores
  html += '<div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin-bottom:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<div style="font-weight:700;color:#23303d">Sectores de riego a aplicar</div>'+
      '<select id="fr-o-filtro-eq" onchange="frRenderSectoresChips()" style="padding:5px 8px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px"><option value="">Todos los equipos</option>'+equipos.map(function(e){return '<option>'+escapeHtml(e)+'</option>';}).join('')+'</select>'+
    '</div>'+
    '<div id="fr-o-sectores"></div>'+
    '<div id="fr-o-sec-resumen" style="margin-top:8px;font-size:12px;color:#0854a0;font-weight:700"></div>'+
  '</div>';

  // Productos
  html += '<div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin-bottom:14px">'+
    '<div style="font-weight:700;color:#23303d;margin-bottom:8px">Productos de la orden <span style="font-size:11px;font-weight:400;color:#888">(solo fertilizantes de suelo/edáficos y enmiendas)</span></div>'+
    '<div id="fr-o-lineas"></div>'+
    '<button class="cc-btn cc-btn-s cc-btn-sm" style="margin-top:8px" onclick="frAddLinea()">+ Agregar producto</button>'+
  '</div>';

  html += '<div style="display:flex;gap:10px;justify-content:flex-end">'+
    (_frEditId?'<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frCancelarEdit()">Cancelar edición</button>':'')+
    '<button class="cc-btn cc-btn-g" onclick="frGuardarOrden()">'+(_frEditId?'Guardar cambios':'Registrar orden')+'</button>'+
  '</div>';

  cont.innerHTML = html;
  if(!_frLineas.length) _frLineas=[{prod:'',dosis:'',unidad:(f.cfg.unidades[0]||''),obs:''}];
  frRenderSectoresChips();
  frRenderLineas();
}

function frRenderSectoresChips(){
  var f = S.fertirriego;
  var cont = document.getElementById('fr-o-sectores'); if(!cont) return;
  var filtro = (document.getElementById('fr-o-filtro-eq')||{}).value||'';
  var secs = f.sectores.filter(function(s){ return !filtro || s.equipo===filtro; });
  if(!secs.length){ cont.innerHTML='<div style="color:#999;font-size:12px;padding:8px">Sin sectores. Agréguelos en la pestaña "Sectores y Equipos".</div>'; frActualizarResumenSec(); return; }
  cont.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px">'+
    secs.map(function(s){
      var checked=_frSecSel.has(s.id)?'checked':'';
      return '<label style="display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid '+(_frSecSel.has(s.id)?'#0a6ed1':'#e0e0e0')+';border-radius:6px;cursor:pointer;font-size:12px;background:'+(_frSecSel.has(s.id)?'#f0f7ff':'#fff')+'">'+
        '<input type="checkbox" '+checked+' onchange="frToggleSector(\''+s.id+'\')">'+
        '<span><strong>'+escapeHtml(s.nombre)+'</strong><br><span style="color:#888">'+escapeHtml(s.equipo||'-')+' · '+(parseFloat(s.ha)||0).toFixed(2)+' ha</span></span>'+
      '</label>';
    }).join('')+'</div>';
  frActualizarResumenSec();
}
function frToggleSector(id){
  if(_frSecSel.has(id)) _frSecSel.delete(id); else _frSecSel.add(id);
  frRenderSectoresChips();
}
function frActualizarResumenSec(){
  var f = S.fertirriego;
  var el=document.getElementById('fr-o-sec-resumen'); if(!el) return;
  var ha=0; _frSecSel.forEach(function(id){ var s=f.sectores.find(function(x){return String(x.id)===String(id);}); if(s)ha+=parseFloat(s.ha)||0; });
  el.textContent = _frSecSel.size+' sector(es) seleccionado(s) · '+ha.toFixed(2)+' ha total';
}

function frRenderLineas(){
  var f = S.fertirriego;
  var cont=document.getElementById('fr-o-lineas'); if(!cont) return;
  // Productos para fertirriego: fertilizantes/enmiendas. Se hace un match flexible
  // (sin acentos, por inclusión) para no depender de un valor de "tipo" exacto.
  // Si ningún producto coincide, se muestran TODOS para no bloquear el guardado.
  var _norm=function(s){ return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); };
  var todos = (S.productos||[]).slice().sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||''); });
  var prods = todos.filter(function(p){
    var t=_norm(p.tipo);
    return t.indexOf('fertiliz')>=0 || t.indexOf('enmienda')>=0 || t.indexOf('nutri')>=0;
  });
  if(!prods.length) prods = todos; // fallback: todo el catálogo
  cont.innerHTML = _frLineas.map(function(l,i){
    return '<div style="display:grid;grid-template-columns:1fr 90px 90px 1fr 32px;gap:8px;align-items:end;margin-bottom:7px;padding:7px;background:#fafafa;border-radius:6px">'+
      '<div class="cc-field"><label class="cc-lbl" style="font-size:10px">Producto</label>'+
        '<select onchange="frUpdLinea('+i+',\'prod\',this.value)"><option value="">— Seleccione —</option>'+prods.map(function(p){ return '<option value="'+escapeHtml(p.nombre)+'" '+(l.prod===p.nombre?'selected':'')+'>'+escapeHtml(p.nombre)+'</option>'; }).join('')+'</select>'+
      '</div>'+
      '<div class="cc-field"><label class="cc-lbl" style="font-size:10px">Dosis</label><input type="number" step="any" value="'+(l.dosis||'')+'" oninput="frUpdLinea('+i+',\'dosis\',this.value)"></div>'+
      '<div class="cc-field"><label class="cc-lbl" style="font-size:10px">Unidad</label><select onchange="frUpdLinea('+i+',\'unidad\',this.value)">'+f.cfg.unidades.map(function(u){return '<option '+(l.unidad===u?'selected':'')+'>'+escapeHtml(u)+'</option>';}).join('')+'</select></div>'+
      '<div class="cc-field"><label class="cc-lbl" style="font-size:10px">Observación</label><input type="text" value="'+escapeHtml(l.obs||'')+'" oninput="frUpdLinea('+i+',\'obs\',this.value)" placeholder="Opcional"></div>'+
      '<button onclick="frDelLinea('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:15px;height:34px" title="Quitar">✕</button>'+
    '</div>';
  }).join('');
}
function frAddLinea(){ _frLineas.push({prod:'',dosis:'',unidad:(S.fertirriego.cfg.unidades[0]||''),obs:''}); frRenderLineas(); }
function frUpdLinea(i,campo,val){ if(_frLineas[i]) _frLineas[i][campo]=val; }
function frDelLinea(i){ _frLineas.splice(i,1); if(!_frLineas.length)_frLineas.push({prod:'',dosis:'',unidad:(S.fertirriego.cfg.unidades[0]||''),obs:''}); frRenderLineas(); }

function frGuardarOrden(){
  _ensureFertirriego();
  var f = S.fertirriego;
  if(_frSecSel.size===0){ toast('Sin sectores','Seleccione al menos un sector de riego','error'); return; }
  var lineasValidas = _frLineas.filter(function(l){ return l.prod; });
  if(!lineasValidas.length){
    if(!(S.productos||[]).length){
      toast('Sin productos en catálogo','No hay productos cargados. Agregue productos en la pestaña "Productos" del fertirriego antes de crear la orden.','error');
    }else{
      toast('Sin productos','Seleccione al menos un producto en el desplegable de cada línea','error');
    }
    return;
  }
  var existing = _frEditId ? f.ordenes.find(function(o){return String(o.id)===String(_frEditId);}) : null;
  var orden = {
    id: _frEditId || uid(),
    numero: existing ? existing.numero : ('OAF-'+String(f.oCounter).padStart(5,'0')),
    fecha: document.getElementById('fr-o-fecha').value,
    forma: document.getElementById('fr-o-forma').value,
    horario: document.getElementById('fr-o-horario').value,
    estado: (document.getElementById('fr-o-estado').value||'').trim(),
    responsable: (document.getElementById('fr-o-resp').value||'').trim(),
    sectores: [..._frSecSel],
    lineas: lineasValidas,
    confirmada: existing ? existing.confirmada : false,
    creado: existing ? existing.creado : new Date().toISOString(),
    modificado: new Date().toISOString()
  };
  if(existing){
    var idx=f.ordenes.findIndex(function(o){return String(o.id)===String(_frEditId);});
    f.ordenes[idx]=orden;
  } else {
    f.ordenes.push(orden);
    f.oCounter++;
  }
  save();
  _frEditId=null; _frSecSel=new Set(); _frLineas=[];
  frTab('lista', document.querySelector('.fr-subtab[data-fr="lista"]'));
  toast('Orden guardada','Orden '+orden.numero+' registrada','success');
}
function frCancelarEdit(){ _frEditId=null; _frSecSel=new Set(); _frLineas=[]; frRenderOrden(); }


// ───────────── LISTA DE ÓRDENES ─────────────
function frRenderLista(){
  _ensureFertirriego();
  var f = S.fertirriego;
  var cont = document.getElementById('cc-fr-lista'); if(!cont) return;
  var ords = f.ordenes.slice().sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||''); });

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
    '<div style="font-weight:700;color:#23303d">Órdenes registradas ('+ords.length+')</div>'+
    (ords.length?'<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frExportOrdenes()">📊 Exportar Excel</button>':'')+
  '</div>';

  if(!ords.length){
    html += '<div style="padding:24px;text-align:center;color:#999;border:1px dashed #ccc;border-radius:8px">💧 Sin órdenes de fertirriego. Cree la primera en "Nueva Orden".</div>';
    cont.innerHTML=html; return;
  }
  html += '<div style="overflow-x:auto"><table class="data" style="width:100%;font-size:13px"><thead><tr>'+
    '<th>N° Orden</th><th>Fecha</th><th>Forma</th><th>Sectores</th><th>Productos</th><th>Estado</th><th></th>'+
  '</tr></thead><tbody>';
  ords.forEach(function(o){
    var haTot=(o.sectores||[]).reduce(function(a,id){var s=f.sectores.find(function(x){return String(x.id)===String(id);});return a+(s?(parseFloat(s.ha)||0):0);},0);
    var badge=o.confirmada?'<span style="background:#d1f0d8;color:#0a6e2e;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700">Confirmada</span>':'<span style="background:#fbe5cc;color:#7a4200;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700">Pendiente</span>';
    html += '<tr onclick="frVerOrden(\''+o.id+'\')" style="cursor:pointer" onmouseover="this.style.background=\'#f5f9fd\'" onmouseout="this.style.background=\'\'">'+
      '<td style="font-weight:700;color:#0a6ed1">'+escapeHtml(o.numero)+'</td>'+
      '<td>'+(o.fecha||'')+'</td>'+
      '<td style="font-size:12px">'+escapeHtml(o.forma||'')+'</td>'+
      '<td style="font-size:12px">'+(o.sectores||[]).length+' ('+haTot.toFixed(1)+' ha)</td>'+
      '<td style="font-size:12px">'+(o.lineas||[]).length+'</td>'+
      '<td>'+badge+'</td>'+
      '<td style="text-align:right"><span style="color:#888;font-size:11px">ver ›</span></td>'+
    '</tr>';
  });
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

function frImprimirOrden(id){
  _ensureFertirriego();
  var f=S.fertirriego;
  var o=f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  var cfg=f.cfg||{};
  function dosisAKg(dosis,unidad){ var d=parseFloat(dosis)||0; var u=(unidad||'').toUpperCase().trim();
    if(u==='GRS.'||u==='GR'||u==='G'||u==='GRS'||u==='G/HA'||u==='GRS/HA') return d/1000;
    if(u==='C.C'||u==='CC'||u==='ML'||u==='MML'||u==='ML/HA') return d/1000;
    if(u==='KG'||u==='KG/HA'||u==='K') return d;
    if(u==='L'||u==='LT'||u==='L/HA') return d; return d; }
  function ubKg(unidad){ var u=(unidad||'').toUpperCase().trim(); if(u==='C.C'||u==='CC'||u==='ML'||u==='MML'||u==='ML/HA'||u==='L'||u==='LT'||u==='L/HA') return 'L'; return 'kg'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Unidades de distribución (paños o sector)
  var unidades=[];
  (o.sectores||[]).forEach(function(sid){
    var s=f.sectores.find(function(x){return String(x.id)===String(sid);}); if(!s) return;
    if(Array.isArray(s.panos)&&s.panos.length){
      s.panos.forEach(function(pid){ var p=(S.panos||[]).find(function(x){return String(x.id)===String(pid);}); if(p){ unidades.push({nombre:p.nombre||'',variedad:p.variedad||s.variedad||'',ha:(parseFloat(p.has_riego)||parseFloat(p.hectareas)||0),sector:s.nombre}); } });
    } else { unidades.push({nombre:s.nombre||'',variedad:s.variedad||'',ha:(parseFloat(s.ha)||0),sector:s.nombre}); }
  });
  var haTot=unidades.reduce(function(a,u){return a+u.ha;},0);

  // Tabla detalle por paño
  var aporteTotal={}; FR_NUTRIENTES.forEach(function(nu){aporteTotal[nu]=0;});
  var filas=unidades.map(function(u){
    var prods=(o.lineas||[]).map(function(l){ var tot=dosisAKg(l.dosis,l.unidad)*u.ha; return esc(l.prod)+': <b>'+tot.toFixed(2)+' '+ubKg(l.unidad)+'</b>'; }).join('<br>');
    var apPano={}; FR_NUTRIENTES.forEach(function(nu){apPano[nu]=0;});
    (o.lineas||[]).forEach(function(l){ var prod=(S.productos||[]).find(function(p){return p.nombre===l.prod;}); if(!prod||!prod.aportes) return; var kg=dosisAKg(l.dosis,l.unidad)*u.ha; FR_NUTRIENTES.forEach(function(nu){var pct=parseFloat(prod.aportes[nu])||0; if(pct>0){apPano[nu]+=kg*(pct/100); aporteTotal[nu]+=kg*(pct/100);}}); });
    var ap=FR_NUTRIENTES.filter(function(nu){return apPano[nu]>0;}).map(function(nu){return nu+': '+apPano[nu].toFixed(2);}).join(' · ');
    return '<tr><td>'+esc(u.nombre)+(u.variedad?'<br><span class="mu">'+esc(u.variedad)+'</span>':'')+'</td><td class="r">'+u.ha.toFixed(2)+'</td><td>'+prods+'</td><td class="mu">'+(ap||'—')+'</td></tr>';
  }).join('');

  // Tabla de productos/dosis
  var prodRows=(o.lineas||[]).map(function(l){ return '<tr><td>'+esc(l.prod)+'</td><td class="r">'+esc(String(l.dosis||''))+' '+esc(l.unidad||'')+'/ha</td><td>'+esc(l.obs||'')+'</td></tr>'; }).join('');
  var apTot=FR_NUTRIENTES.filter(function(nu){return aporteTotal[nu]>0;}).map(function(nu){return '<span class="chip">'+nu+': '+aporteTotal[nu].toFixed(2)+' kg</span>';}).join(' ');

  var empresa=cfg.empresa||'SOC. AGRICOLA Y FORESTAL LA CABAÑA LTDA';
  var temporada=cfg.temporada||'';
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(o.numero)+'</title>'+
    '<style>*{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}body{margin:0;padding:24px;color:#1a2530}'+
    '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0854a0;padding-bottom:12px;margin-bottom:16px}'+
    '.hdr h1{font-size:18px;margin:0;color:#0854a0}.hdr .sub{font-size:12px;color:#555;margin-top:3px}'+
    '.num{text-align:right;font-size:13px}.num b{font-size:16px;color:#0854a0}'+
    '.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 18px;font-size:12px;margin-bottom:14px}'+
    '.grid .mu{color:#888}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}'+
    'th{background:#eef3f8;text-align:left;padding:6px 8px;border:1px solid #cdd9e5;font-size:11px}'+
    'td{padding:6px 8px;border:1px solid #e0e6ec;vertical-align:top}.r{text-align:right}.mu{color:#888;font-size:11px}'+
    'h3{font-size:13px;color:#23303d;margin:14px 0 6px;border-left:3px solid #0854a0;padding-left:8px}'+
    '.chip{display:inline-block;background:#eef3f8;border:1px solid #d1e8ff;border-radius:10px;padding:2px 9px;font-size:11px;color:#0854a0;margin:2px}'+
    '.firmas{display:flex;justify-content:space-around;margin-top:46px;font-size:12px}.firmas div{border-top:1px solid #333;padding-top:5px;width:200px;text-align:center}'+
    '@media print{body{padding:0}.noprint{display:none}}</style></head><body>'+
    '<div class="hdr"><div><h1>'+esc(empresa)+'</h1><div class="sub">'+esc(cfg.documento||'ORDEN DE APLICACIÓN')+' · FERTIRRIEGO'+(temporada?' · Temporada '+esc(temporada):'')+'</div></div>'+
      '<div class="num">N°<br><b>'+esc(o.numero)+'</b><br>'+esc(o.fecha||'')+'</div></div>'+
    '<div class="grid">'+
      '<div><span class="mu">Forma:</span> '+esc(o.forma||'-')+'</div>'+
      '<div><span class="mu">Horario:</span> '+esc(o.horario||'-')+'</div>'+
      '<div><span class="mu">Estado fenológico:</span> '+esc(o.estado||'-')+'</div>'+
      '<div><span class="mu">Responsable:</span> '+esc(o.responsable||'-')+'</div>'+
      '<div><span class="mu">Superficie total:</span> '+haTot.toFixed(2)+' ha</div>'+
      '<div><span class="mu">Estado:</span> '+(o.confirmada?'Confirmada':'Pendiente')+'</div>'+
    '</div>'+
    '<h3>Productos y dosis (por hectárea)</h3>'+
    '<table><thead><tr><th>Producto</th><th class="r">Dosis</th><th>Observación</th></tr></thead><tbody>'+prodRows+'</tbody></table>'+
    '<h3>Distribución por paño</h3>'+
    '<table><thead><tr><th>Paño</th><th class="r">Sup. (ha)</th><th>Producto a aplicar</th><th>Aportes (kg)</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    (apTot?'<h3>Aporte nutricional total estimado</h3><div>'+apTot+'</div>':'')+
    '<div class="firmas"><div>Preparado por</div><div>Aplicado por</div><div>Supervisado por</div></div>'+
    '<div class="noprint" style="text-align:center;margin-top:24px"><button onclick="window.print()" style="padding:9px 20px;font-size:14px;background:#0854a0;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ Imprimir</button></div>'+
    '</body></html>';
  var w=window.open('','_blank'); if(!w){ toast('Bloqueado','Permita ventanas emergentes para imprimir','error'); return; }
  w.document.write(html); w.document.close();
}

function frVerOrden(id){
  _ensureFertirriego();
  var f = S.fertirriego;
  var o = f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  var secNombres = (o.sectores||[]).map(function(sid){ var s=f.sectores.find(function(x){return String(x.id)===String(sid);}); return s?s.nombre+' ('+(parseFloat(s.ha)||0).toFixed(2)+' ha)':sid; });
  var haTot=(o.sectores||[]).reduce(function(a,sid){var s=f.sectores.find(function(x){return String(x.id)===String(sid);});return a+(s?(parseFloat(s.ha)||0):0);},0);

  var lineasHtml=(o.lineas||[]).map(function(l){
    return '<tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px">'+escapeHtml(l.prod)+'</td>'+
      '<td style="padding:6px 10px;text-align:right">'+escapeHtml(String(l.dosis||''))+' '+escapeHtml(l.unidad||'')+'</td>'+
      '<td style="padding:6px 10px;color:#888">'+escapeHtml(l.obs||'')+'</td></tr>';
  }).join('');

  // ── Interpretación de la dosis: POR HECTÁREA ──
  // dosisAKg(dosis,unidad) = kg de producto por hectárea (según la unidad).
  function dosisAKg(dosis, unidad){
    var d=parseFloat(dosis)||0;
    var u=(unidad||'').toUpperCase().trim();
    if(u==='GRS.'||u==='GR'||u==='G'||u==='GRS'||u==='G/HA'||u==='GRS/HA') return d/1000;
    if(u==='C.C'||u==='CC'||u==='ML'||u==='MML'||u==='ML/HA') return d/1000; // ~1 g/mL aprox
    if(u==='KG'||u==='KG/HA'||u==='K') return d;
    if(u==='L'||u==='LT'||u==='L/HA') return d; // ~1 kg/L aprox
    return d; // por defecto kg
  }
  function unidadBaseKg(unidad){ // etiqueta resultante tras convertir
    var u=(unidad||'').toUpperCase().trim();
    if(u==='C.C'||u==='CC'||u==='ML'||u==='MML'||u==='ML/HA'||u==='L'||u==='LT'||u==='L/HA') return 'L';
    return 'kg';
  }

  // ── Construir el universo de "paños" sobre los que se distribuye ──
  // Para cada sector de la orden: si tiene paños asociados, se usan esos paños
  // (con sus ha de riego); si no, el propio sector actúa como una unidad.
  var unidades=[]; // {nombre, variedad, ha, sector}
  (o.sectores||[]).forEach(function(sid){
    var s=f.sectores.find(function(x){return String(x.id)===String(sid);}); if(!s) return;
    if(Array.isArray(s.panos) && s.panos.length){
      s.panos.forEach(function(pid){
        var p=(S.panos||[]).find(function(x){return String(x.id)===String(pid);});
        if(p){ unidades.push({ nombre:p.nombre||'', variedad:p.variedad||s.variedad||'', ha:(parseFloat(p.has_riego)||parseFloat(p.hectareas)||0), sector:s.nombre }); }
      });
    } else {
      unidades.push({ nombre:s.nombre||'', variedad:s.variedad||'', ha:(parseFloat(s.ha)||0), sector:s.nombre });
    }
  });
  var haTotDist=unidades.reduce(function(a,u){ return a+u.ha; },0) || haTot;

  // ── Distribución por paño: cantidad de cada producto y aportes ──
  // producto.totalKg = dosisKgHa × ha del paño
  var distHtml='';
  var aporteTotal={}; FR_NUTRIENTES.forEach(function(nu){ aporteTotal[nu]=0; });
  var hayAportes=false;
  if(unidades.length){
    var filas=unidades.map(function(u){
      var prodCeldas=(o.lineas||[]).map(function(l){
        var kgHa=dosisAKg(l.dosis,l.unidad);
        var tot=kgHa*u.ha;
        var ub=unidadBaseKg(l.unidad);
        return '<div style="font-size:11px;padding:2px 0"><strong>'+escapeHtml(l.prod)+':</strong> '+tot.toFixed(2)+' '+ub+'</div>';
      }).join('');
      // Aportes nutricionales de este paño
      var apPano={}; FR_NUTRIENTES.forEach(function(nu){apPano[nu]=0;});
      (o.lineas||[]).forEach(function(l){
        var prod=(S.productos||[]).find(function(p){return p.nombre===l.prod;});
        if(!prod||!prod.aportes) return;
        var kgProd=dosisAKg(l.dosis,l.unidad)*u.ha;
        FR_NUTRIENTES.forEach(function(nu){
          var pct=parseFloat(prod.aportes[nu])||0;
          if(pct>0){ apPano[nu]+=kgProd*(pct/100); aporteTotal[nu]+=kgProd*(pct/100); hayAportes=true; }
        });
      });
      var apTxt=FR_NUTRIENTES.filter(function(nu){return apPano[nu]>0;}).map(function(nu){return nu+': '+apPano[nu].toFixed(2)+' kg';}).join(' · ');
      return '<tr style="border-bottom:1px solid #eee">'+
        '<td style="padding:7px 10px;vertical-align:top"><strong>'+escapeHtml(u.nombre)+'</strong>'+(u.variedad?'<div style="font-size:11px;color:#888">'+escapeHtml(u.variedad)+'</div>':'')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;vertical-align:top;white-space:nowrap">'+u.ha.toFixed(2)+' ha</td>'+
        '<td style="padding:7px 10px;vertical-align:top">'+prodCeldas+'</td>'+
        '<td style="padding:7px 10px;vertical-align:top;font-size:11px;color:#0854a0">'+(apTxt||'—')+'</td>'+
      '</tr>';
    }).join('');
    distHtml='<div style="margin-top:14px"><div style="font-weight:700;color:#23303d;margin-bottom:6px;font-size:13px">Distribución por paño (dosis interpretada por hectárea)</div>'+
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#eef3f8">'+
        '<th style="padding:7px 10px;text-align:left">Paño</th><th style="padding:7px 10px;text-align:right">Sup.</th><th style="padding:7px 10px;text-align:left">Producto a aplicar</th><th style="padding:7px 10px;text-align:left">Aportes</th>'+
      '</tr></thead><tbody>'+filas+'</tbody></table></div></div>';
  }

  var aporteHtml='';
  if(hayAportes){
    var celdas=FR_NUTRIENTES.filter(function(nu){return aporteTotal[nu]>0;}).map(function(nu){
      return '<div style="text-align:center;padding:6px 10px;background:#fff;border-radius:6px;border:1px solid #d1e8ff"><div style="font-size:11px;color:#0854a0;font-weight:700">'+nu+'</div><div style="font-size:15px;font-weight:700;color:#23303d">'+aporteTotal[nu].toFixed(2)+'</div><div style="font-size:9px;color:#888">kg</div></div>';
    }).join('');
    aporteHtml='<div style="margin-top:14px;padding:12px;background:#f5f9fd;border-radius:8px">'+
      '<div style="font-weight:700;color:#0854a0;margin-bottom:8px;font-size:13px">Aporte nutricional estimado (total orden · '+haTotDist.toFixed(2)+' ha)</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+celdas+'</div>'+
      '<div style="font-size:10px;color:#888;margin-top:8px">Estimación: dosis (kg/ha) × superficie del paño × % de cada producto. Conversión aproximada de unidades a kg.</div>'+
    '</div>';
  }

  var modal=document.createElement('div');
  modal.id='fr-ver-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  modal.innerHTML='<div style="background:#fff;border-radius:10px;max-width:640px;width:100%;margin:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
    '<div style="background:linear-gradient(90deg,#23303d,#0854a0);color:#fff;padding:15px 22px;display:flex;justify-content:space-between;align-items:center;border-radius:10px 10px 0 0">'+
      '<div style="font-weight:700;font-size:16px">💧 '+escapeHtml(o.numero)+(o.confirmada?' · Confirmada':' · Pendiente')+'</div>'+
      '<button onclick="document.getElementById(\'fr-ver-modal\').remove()" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer">×</button>'+
    '</div>'+
    '<div style="padding:20px 22px">'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;margin-bottom:14px">'+
        '<div><span style="color:#888">Fecha:</span> <strong>'+(o.fecha||'-')+'</strong></div>'+
        '<div><span style="color:#888">Forma:</span> <strong>'+escapeHtml(o.forma||'-')+'</strong></div>'+
        '<div><span style="color:#888">Horario:</span> <strong>'+escapeHtml(o.horario||'-')+'</strong></div>'+
        '<div><span style="color:#888">Estado feno.:</span> <strong>'+escapeHtml(o.estado||'-')+'</strong></div>'+
        '<div><span style="color:#888">Responsable:</span> <strong>'+escapeHtml(o.responsable||'-')+'</strong></div>'+
      '</div>'+
      '<div style="margin-bottom:12px"><span style="color:#888;font-size:12px">Sectores ('+haTot.toFixed(2)+' ha):</span><div style="margin-top:4px;font-size:13px">'+secNombres.map(function(n){return '<span style="background:#eef3f8;border-radius:10px;padding:2px 8px;margin:2px;display:inline-block;font-size:12px">'+escapeHtml(n)+'</span>';}).join('')+'</div></div>'+
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f0f0f0"><th style="padding:7px 10px;text-align:left">Producto</th><th style="padding:7px 10px;text-align:right">Dosis</th><th style="padding:7px 10px;text-align:left">Obs.</th></tr></thead><tbody>'+lineasHtml+'</tbody></table>'+
      '<div style="font-size:11px;color:#888;margin-top:4px">La dosis se interpreta <strong>por hectárea</strong>.</div>'+
      distHtml+
      aporteHtml+
      (o.confirmada?'<div style="margin-top:14px;padding:12px;background:#d1f0d8;border-radius:8px;font-size:13px;color:#0a6e2e"><strong>✓ Orden confirmada</strong>'+(o.confirmadaFecha?(' el '+o.confirmadaFecha):'')+'. Recuerde realizar la rebaja de bodega manualmente.</div>':'')+
    '</div>'+
    '<div style="padding:14px 22px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px;border-radius:0 0 10px 10px;flex-wrap:wrap">'+
      '<button class="cc-btn cc-btn-r cc-btn-sm" onclick="frEliminarOrden(\''+o.id+'\')" style="margin-right:auto">🗑️ Eliminar</button>'+
      '<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frImprimirOrden(\''+o.id+'\')">🖨️ Imprimir</button>'+
      '<button class="cc-btn cc-btn-s cc-btn-sm" onclick="document.getElementById(\'fr-ver-modal\').remove()">Cerrar</button>'+
      (!o.confirmada?'<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frEditarOrden(\''+o.id+'\')">✏️ Editar</button>':'')+
      (!o.confirmada?'<button class="cc-btn cc-btn-g cc-btn-sm" onclick="frConfirmarOrden(\''+o.id+'\')">✓ Confirmar</button>':'<button class="cc-btn cc-btn-s cc-btn-sm" onclick="frDesconfirmarOrden(\''+o.id+'\')">↩️ Deshacer confirmación</button>')+
    '</div>'+
  '</div>';
  document.body.appendChild(modal);
}

function frConfirmarOrden(id){
  var f=S.fertirriego;
  var o=f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  o.confirmada=true; o.confirmadaFecha=new Date().toISOString().slice(0,10);
  save();
  var m=document.getElementById('fr-ver-modal'); if(m)m.remove();
  frRenderLista();
  toast('Orden confirmada','La orden '+o.numero+' fue confirmada. Recuerde la rebaja manual de bodega.','success');
}
function frDesconfirmarOrden(id){
  var f=S.fertirriego;
  var o=f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  o.confirmada=false; o.confirmadaFecha=null;
  save();
  var m=document.getElementById('fr-ver-modal'); if(m)m.remove();
  frRenderLista();
  toast('Confirmación deshecha','','success');
}
function frEditarOrden(id){
  var f=S.fertirriego;
  var o=f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  _frEditId=o.id;
  _frSecSel=new Set(o.sectores||[]);
  _frLineas=JSON.parse(JSON.stringify(o.lineas||[]));
  var m=document.getElementById('fr-ver-modal'); if(m)m.remove();
  frTab('orden', document.querySelector('.fr-subtab[data-fr="orden"]'));
  // Rellenar campos tras render
  setTimeout(function(){
    if(document.getElementById('fr-o-fecha')) document.getElementById('fr-o-fecha').value=o.fecha||'';
    if(document.getElementById('fr-o-forma')) document.getElementById('fr-o-forma').value=o.forma||'';
    if(document.getElementById('fr-o-horario')) document.getElementById('fr-o-horario').value=o.horario||'';
    if(document.getElementById('fr-o-estado')) document.getElementById('fr-o-estado').value=o.estado||'';
    if(document.getElementById('fr-o-resp')) document.getElementById('fr-o-resp').value=o.responsable||'';
  },50);
}
function frEliminarOrden(id){
  var f=S.fertirriego;
  var o=f.ordenes.find(function(x){return String(x.id)===String(id);}); if(!o) return;
  // Cerrar el modal de la orden primero para que la confirmación quede visible
  var mv=document.getElementById('fr-ver-modal'); if(mv)mv.remove();
  confirmDialog('Eliminar orden','¿Eliminar la orden de fertirriego '+o.numero+'? Esta acción no se puede deshacer.',function(){
    S.fertirriego.ordenes=S.fertirriego.ordenes.filter(function(x){return String(x.id)!==String(id);});
    save();
    frRenderLista();
    toast('Orden eliminada','','success');
  },'Eliminar',true);
}

function frExportOrdenes(){
  if(typeof XLSX==='undefined'){ toast('Sin librería','Excel no disponible','error'); return; }
  var f=S.fertirriego;
  var resumen=[['N° Orden','Fecha','Forma','Horario','Estado feno.','Responsable','Sectores','Ha total','Confirmada']];
  var detalle=[['N° Orden','Producto','Dosis','Unidad','Observación']];
  f.ordenes.forEach(function(o){
    var secN=(o.sectores||[]).map(function(sid){var s=f.sectores.find(function(x){return String(x.id)===String(sid);});return s?s.nombre:sid;}).join(', ');
    var haTot=(o.sectores||[]).reduce(function(a,sid){var s=f.sectores.find(function(x){return String(x.id)===String(sid);});return a+(s?(parseFloat(s.ha)||0):0);},0);
    resumen.push([o.numero,o.fecha,o.forma,o.horario,o.estado,o.responsable,secN,haTot,o.confirmada?'SÍ':'NO']);
    (o.lineas||[]).forEach(function(l){ detalle.push([o.numero,l.prod,l.dosis,l.unidad,l.obs||'']); });
  });
  var wb=XLSX.utils.book_new();
  var ws1=XLSX.utils.aoa_to_sheet(resumen); ws1['!cols']=[{wch:14},{wch:11},{wch:14},{wch:16},{wch:16},{wch:16},{wch:30},{wch:10},{wch:11}];
  var ws2=XLSX.utils.aoa_to_sheet(detalle); ws2['!cols']=[{wch:14},{wch:28},{wch:10},{wch:8},{wch:24}];
  XLSX.utils.book_append_sheet(wb,ws1,'Órdenes');
  XLSX.utils.book_append_sheet(wb,ws2,'Detalle productos');
  XLSX.writeFile(wb,'Ordenes_Fertirriego_'+new Date().toISOString().slice(0,10)+'.xlsx');
}


function renderEstimacion(){
  var el = document.getElementById('cc-estim-content'); if(!el) return;
  if(!S.panos.length){ el.innerHTML='<div class="cc-no-data"><span>📈</span>Cree paños primero para estimar producción.</div>'; return; }

  var html = '';

  // ── Sección 1: Conteos editables por paño (solo productivos tienen campos; polinizantes heredan) ──
  html += '<div class="cc-card"><div class="cc-card-ttl">🔢 Conteos por paño</div>';
  html += '<div style="font-size:12px;color:#888;margin-bottom:10px">Todos los conteos son editables. Cada paño (principal y polinizante) usa <strong>sus propios conteos</strong>; los polinizantes se cuentan por separado en terreno.</div>';
  // Filtro de temporada + importación de conteos registrados en terreno
  html += (function(){
    var tempsCte = [];
    (STATE.cache.conteos||[]).forEach(function(s){ if(s.temporada && tempsCte.indexOf(s.temporada)<0) tempsCte.push(s.temporada); });
    tempsCte.sort().reverse();
    var sel = window._estCteTemporada || (tempsCte[0]||'');
    return '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:#f0f7ff;border:1px solid #bcd9f5;border-radius:8px;padding:12px 14px;margin-bottom:14px">'+
      '<div style="flex:1;min-width:180px">'+
        '<label style="display:block;font-size:11px;font-weight:700;color:#0854a0;margin-bottom:4px">TEMPORADA DE LOS CONTEOS</label>'+
        '<select id="est-cte-temp" onchange="window._estCteTemporada=this.value" style="width:100%;padding:9px;border:1px solid #bcd9f5;border-radius:7px;font-size:13px">'+
          (tempsCte.length
            ? tempsCte.map(function(t){ return '<option value="'+escapeHtml(t)+'"'+(t===sel?' selected':'')+'>'+escapeHtml(t)+'</option>'; }).join('')
            : '<option value="">Sin conteos registrados en terreno</option>')+
        '</select>'+
      '</div>'+
      '<button onclick="estImportarConteosTerreno()" class="cc-btn cc-btn-g" '+(tempsCte.length?'':'disabled')+' style="padding:10px 16px">⬇️ Importar conteos de terreno</button>'+
      '<div style="flex-basis:100%;font-size:11px;color:#5a7590">Importa desde las sesiones de conteo (por paño y variedad): <strong>centros florales/árbol</strong> y <strong>frutos/centro</strong> (la cuaja = frutos ÷ dardos). Principales y polinizantes se importan por separado.</div>'+
    '</div>';
  })();

  ['2018','2024','2026'].forEach(function(y){
    var ps = ordenarPanosPadreHijo(S.panos.filter(function(p){ return p.anio===y; }));
    if(!ps.length) return;
    html += '<div style="font-weight:700;color:#354a5f;margin:12px 0 6px;font-size:13px">🌱 Plantación '+y+'</div>';
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">';
    html += '<thead><tr style="background:#f0f0f0">'+
      '<th style="text-align:left;padding:7px 9px">Paño</th>'+
      '<th style="text-align:left;padding:7px 9px">Variedad</th>'+
      '<th style="text-align:right;padding:7px 9px">N° plantas</th>'+
      '<th style="text-align:center;padding:7px 9px">Centros florales/árbol</th>'+
      '<th style="text-align:center;padding:7px 9px">Frutos/centro</th>'+
      '<th style="text-align:center;padding:7px 9px">Kg/fruto</th>'+
      '<th style="text-align:right;padding:7px 9px">Kg/árbol</th>'+
      '<th style="text-align:right;padding:7px 9px">Kg paño</th>'+
      '<th style="text-align:center;padding:7px 9px">Conteo árboles</th>'+
      '</tr></thead><tbody>';
    ps.forEach(function(p){
      var esPolin = (p.tipo||'Productivo')==='Polinizante';
      var c = estConteosDe(p);
      var kgArbol = estKgArbol(p);
      var kgPano = estKgPano(p);
      var plantas = estPlantasDe(p);
      var polBadge = esPolin ? ' <span style="background:#fef3c7;color:#92600a;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">🐝</span>' : '';
      var heredBadge = '';
      var bgRow = esPolin ? 'background:#fafcff' : '';
      // Inputs SIEMPRE editables. Herencia CAMPO POR CAMPO: si ese campo se hereda, mostrar el valor del padre como placeholder y dejar el input vacío.
      var phC = c.centrosHered ? 'placeholder="'+(c.centros||'')+'"' : '';
      var phF = c.frutosHered ? 'placeholder="'+(c.frutos||'')+'"' : '';
      var phK = c.kgFrutoHered ? 'placeholder="'+(c.kgFruto||'')+'"' : '';
      var valC = c.centrosHered ? '' : (c.centros||'');
      var valF = c.frutosHered ? '' : (c.frutos||'');
      var valK = c.kgFrutoHered ? '' : (c.kgFruto||'');
      html += '<tr style="border-bottom:1px solid #eee;'+bgRow+'">'+
        '<td style="padding:6px 9px;font-weight:700">'+escapeHtml(p.nombre)+polBadge+heredBadge+'</td>'+
        '<td style="padding:6px 9px;color:#888;font-style:italic">'+escapeHtml(p.variedad||'')+'</td>'+
        '<td style="padding:6px 9px;text-align:right">'+plantas.toLocaleString('es-CL')+'</td>'+
        '<td style="padding:6px 9px;text-align:center"><input type="number" min="0" step="0.1" value="'+valC+'" '+phC+' onchange="estGuardarConteo('+p.id+',\'centrosFlorales\',this.value)" style="width:70px;padding:4px 6px;border:1px solid #d9d9d9;border-radius:5px;text-align:center"></td>'+
        '<td style="padding:6px 9px;text-align:center"><input type="number" min="0" step="0.1" value="'+valF+'" '+phF+' onchange="estGuardarConteo('+p.id+',\'frutosPorCentro\',this.value)" style="width:70px;padding:4px 6px;border:1px solid #d9d9d9;border-radius:5px;text-align:center"></td>'+
        '<td style="padding:6px 9px;text-align:center"><input type="number" min="0" step="0.001" value="'+valK+'" '+phK+' onchange="estGuardarConteo('+p.id+',\'kgPorFruto\',this.value)" style="width:80px;padding:4px 6px;border:1px solid #d9d9d9;border-radius:5px;text-align:center"></td>'+
        '<td style="padding:6px 9px;text-align:right;font-weight:600">'+(kgArbol>0?kgArbol.toFixed(2):'—')+'</td>'+
        '<td style="padding:6px 9px;text-align:right;font-weight:700;color:#354a5f">'+(kgPano>0?kgPano.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
        '<td style="padding:6px 9px;text-align:center"><button onclick="abrirConteoArboles('+p.id+')" style="background:#fff;border:1px solid #354a5f;color:#354a5f;border-radius:5px;padding:4px 9px;cursor:pointer;font-size:11px;white-space:nowrap" title="Ingresar conteos de varios árboles y promediar">🌳 Conteo'+((p.conteoArboles&&p.conteoArboles.length)?' ('+p.conteoArboles.length+')':'')+'</button></td>'+
        '</tr>';
    });
    html += '</tbody></table></div>';
  });
  html += '</div>';

  // ── Sección 2: Resumen por variedad ──
  // Agrupar por variedad, separando productivos de polinizantes
  var porVariedad = {};
  S.panos.forEach(function(p){
    var v = (p.variedad||'Sin variedad').trim() || 'Sin variedad';
    if(!porVariedad[v]) porVariedad[v] = { plantasPrincipal:0, plantasPolin:0, kgPrincipal:0, kgPolin:0, panos:0 };
    var esPolin = (p.tipo||'Productivo')==='Polinizante';
    var plantas = estPlantasDe(p);
    var kg = estKgPano(p);
    porVariedad[v].panos++;
    if(esPolin){
      porVariedad[v].plantasPolin += plantas;
      porVariedad[v].kgPolin += kg;
    } else {
      porVariedad[v].plantasPrincipal += plantas;
      porVariedad[v].kgPrincipal += kg;
    }
  });

  html += '<div class="cc-card"><div class="cc-card-ttl">🍒 Estimación por variedad</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:900px">';
  html += '<thead><tr style="background:#354a5f;color:#d1e8ff">'+
    '<th style="text-align:left;padding:9px 11px">Variedad</th>'+
    '<th style="text-align:right;padding:9px 11px">Plantas principal</th>'+
    '<th style="text-align:right;padding:9px 11px">Plantas polin.</th>'+
    '<th style="text-align:right;padding:9px 11px">Kg variedad principal</th>'+
    '<th style="text-align:center;padding:9px 11px">% Export principal</th>'+
    '<th style="text-align:right;padding:9px 11px">Kg polinizantes</th>'+
    '<th style="text-align:center;padding:9px 11px">% Export polin.</th>'+
    '<th style="text-align:right;padding:9px 11px">Kg Export</th>'+
    '<th style="text-align:right;padding:9px 11px">Kg Merc. interno</th>'+
    '<th style="text-align:right;padding:9px 11px">Kg TOTAL</th>'+
    '</tr></thead><tbody>';
  var totalKgGeneral = 0, totalKgPrincipal = 0, totalKgPolin = 0, totalKgExport = 0, totalKgInterno = 0;
  Object.keys(porVariedad).sort().forEach(function(v){
    var d = porVariedad[v];
    var totalV = d.kgPrincipal + d.kgPolin;
    var pctP = estGetPctExport(v,'principal');
    var pctPol = estGetPctExport(v,'polin');
    var kgExpV = d.kgPrincipal*(pctP/100) + d.kgPolin*(pctPol/100);
    var kgIntV = totalV - kgExpV;
    totalKgGeneral += totalV; totalKgPrincipal += d.kgPrincipal; totalKgPolin += d.kgPolin;
    totalKgExport += kgExpV; totalKgInterno += kgIntV;
    function inputPct(tipo, val, dis){
      return '<input type="number" min="0" max="100" step="1" value="'+(val||'')+'"'+(dis?' disabled':'')+' onchange="estGuardarPctExport(\''+v.replace(/'/g,"\\'")+'\',\''+tipo+'\',this.value)" style="width:56px;padding:4px 6px;border:1px solid #d9d9d9;border-radius:5px;text-align:center'+(dis?';background:#f5f5f5':'')+'">';
    }
    html += '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:8px 11px;font-weight:700">'+escapeHtml(v)+'</td>'+
      '<td style="padding:8px 11px;text-align:right">'+d.plantasPrincipal.toLocaleString('es-CL')+'</td>'+
      '<td style="padding:8px 11px;text-align:right;color:#92600a">'+(d.plantasPolin?d.plantasPolin.toLocaleString('es-CL'):'—')+'</td>'+
      '<td style="padding:8px 11px;text-align:right">'+(d.kgPrincipal>0?d.kgPrincipal.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
      '<td style="padding:8px 11px;text-align:center">'+inputPct('principal', pctP, false)+'</td>'+
      '<td style="padding:8px 11px;text-align:right;color:#92600a">'+(d.kgPolin>0?d.kgPolin.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
      '<td style="padding:8px 11px;text-align:center">'+inputPct('polin', pctPol, false)+'</td>'+
      '<td style="padding:8px 11px;text-align:right;font-weight:700;color:#1a7e3e">'+(kgExpV>0?kgExpV.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
      '<td style="padding:8px 11px;text-align:right;color:#b45309">'+(kgIntV>0?kgIntV.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
      '<td style="padding:8px 11px;text-align:right;font-weight:800;color:#354a5f">'+(totalV>0?totalV.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg':'—')+'</td>'+
      '</tr>';
  });
  html += '</tbody><tfoot><tr style="background:#f0f0f0;font-weight:800">'+
    '<td style="padding:10px 11px">TOTAL GENERAL</td>'+
    '<td style="padding:10px 11px"></td><td style="padding:10px 11px"></td>'+
    '<td style="padding:10px 11px;text-align:right">'+totalKgPrincipal.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg</td>'+
    '<td style="padding:10px 11px"></td>'+
    '<td style="padding:10px 11px;text-align:right;color:#92600a">'+totalKgPolin.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg</td>'+
    '<td style="padding:10px 11px"></td>'+
    '<td style="padding:10px 11px;text-align:right;color:#1a7e3e">'+totalKgExport.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg</td>'+
    '<td style="padding:10px 11px;text-align:right;color:#b45309">'+totalKgInterno.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg</td>'+
    '<td style="padding:10px 11px;text-align:right;color:#354a5f;font-size:15px">'+totalKgGeneral.toLocaleString('es-CL',{maximumFractionDigits:0})+' kg</td>'+
    '</tr></tfoot></table></div>';
  // Equivalencia en cajas (referencial: 5kg por caja)
  if(totalKgGeneral>0){
    html += '<div style="margin-top:10px;font-size:12px;color:#666">Equivalencia referencial: <strong>'+Math.round(totalKgGeneral/5).toLocaleString('es-CL')+'</strong> cajas de 5 kg · <strong>'+(totalKgGeneral/1000).toFixed(1)+'</strong> toneladas</div>';
  }
  html += '</div>';

  // ── Sección 3: Versiones guardadas ──
  var versiones = S.versionesEstim || [];
  // Temporadas disponibles en las versiones guardadas
  var tempsVer = [];
  versiones.forEach(function(v){ if(v.temporada && tempsVer.indexOf(v.temporada)<0) tempsVer.push(v.temporada); });
  tempsVer.sort().reverse();
  var tempFiltro = window._estTempFiltro || '';
  var versFiltradas = tempFiltro ? versiones.filter(function(v){ return v.temporada===tempFiltro; }) : versiones;

  html += '<div class="cc-card"><div class="cc-card-ttl" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><span>🗂️ Versiones de estimación</span>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
      (tempsVer.length?'<select onchange="estFiltrarTemporada(this.value)" style="padding:6px 10px;border:1px solid #ccd;border-radius:6px;font-size:12px">'+
        '<option value="">Todas las temporadas</option>'+
        tempsVer.map(function(t){ return '<option value="'+escapeHtml(t)+'"'+(t===tempFiltro?' selected':'')+'>'+escapeHtml(t)+'</option>'; }).join('')+
      '</select>':'')+
      (versiones.length>1?'<button onclick="estGraficarEvolucion()" class="cc-btn cc-btn-sm" style="background:#0a6ed1;color:#fff">📈 Evolución</button>':'')+
      '<button onclick="guardarVersionEstimacion()" class="cc-btn cc-btn-g cc-btn-sm">💾 Guardar versión actual</button>'+
    '</div></div>';
  if(!versFiltradas.length){
    html += '<div style="font-size:12px;color:#888;padding:8px 0">'+(tempFiltro?'No hay versiones en la temporada '+escapeHtml(tempFiltro)+'.':'Aún no hay versiones guardadas. Guarde una "foto" de la estimación actual para comparar su evolución (v0 floración, v1 cuaja, etc.).')+'</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f0f0f0">'+
      '<th style="text-align:left;padding:7px 10px">Versión</th>'+
      '<th style="text-align:left;padding:7px 10px">Temporada</th>'+
      '<th style="text-align:left;padding:7px 10px">Fecha</th>'+
      '<th style="text-align:right;padding:7px 10px">Kg totales</th>'+
      '<th style="text-align:center;padding:7px 10px">Acciones</th></tr></thead><tbody>';
    versFiltradas.slice().reverse().forEach(function(v){
      html += '<tr style="border-bottom:1px solid #eee">'+
        '<td style="padding:7px 10px;font-weight:700">'+escapeHtml(v.nombre)+'</td>'+
        '<td style="padding:7px 10px;color:#0854a0;font-weight:600;font-size:12px">'+escapeHtml(v.temporada||'—')+'</td>'+
        '<td style="padding:7px 10px;color:#888;font-size:12px">'+new Date(v.fecha).toLocaleDateString('es-CL')+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-weight:700;color:#354a5f">'+Math.round(v.totalKg).toLocaleString('es-CL')+' kg</td>'+
        '<td style="padding:7px 10px;text-align:center;white-space:nowrap">'+
          '<button onclick="verVersionEstim('+v.id+')" style="background:#fff;border:1px solid #354a5f;color:#354a5f;border-radius:5px;padding:3px 9px;cursor:pointer;font-size:11px;margin-right:4px">👁 Ver</button>'+
          '<button onclick="eliminarVersionEstim('+v.id+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:14px">✕</button>'+
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  el.innerHTML = html;
}

// Guarda un conteo en el paño y recalcula
function estGuardarConteo(panoId, campo, valor){
  var p = S.panos.find(function(x){ return x.id==panoId; });
  if(!p) return;
  p[campo] = parseFloat(valor)||0;
  save();
  renderEstimacion(); // re-render para actualizar cálculos (incluye polinizantes que heredan)
}

// Guardar % de exportación por variedad y tipo (principal / polinizante). Se persiste y sincroniza.
function estGuardarPctExport(variedad, tipo, valor){
  if(!S.pctExport) S.pctExport = {};
  var pct = parseFloat(valor);
  if(isNaN(pct)) pct = 0;
  if(pct<0) pct=0; if(pct>100) pct=100;
  S.pctExport[variedad+'||'+tipo] = pct;
  save();
  renderEstimacion();
}
function estGetPctExport(variedad, tipo){
  if(!S.pctExport) return 0;
  var v = S.pctExport[variedad+'||'+tipo];
  return (v==null||isNaN(v)) ? 0 : v;
}
try{ window.estGuardarPctExport=estGuardarPctExport; }catch(e){}

// ══ FORMULARIO DE CONTEO DE ÁRBOLES (promedio) ══
var _conteoActivePano = null;
function abrirConteoArboles(panoId){
  var p = S.panos.find(function(x){ return x.id==panoId; });
  if(!p) return;
  _conteoActivePano = panoId;
  if(!Array.isArray(p.conteoArboles)) p.conteoArboles = [];
  renderConteoModal(p);
}

function renderConteoModal(p){
  var existing = document.getElementById('cc-conteo-modal');
  if(existing) existing.remove();
  var arboles = p.conteoArboles || [];
  // Promedio SOLO de centros florales (los frutos/centro y kg/fruto se saben en cosecha)
  var n = arboles.length;
  var sumC=0;
  arboles.forEach(function(a){ sumC+=parseFloat(a.centros)||0; });
  var promC = n? (sumC/n):0;

  var filasHtml = arboles.map(function(a,i){
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:5px 8px;text-align:center;color:#888;font-size:11px">Árbol '+(i+1)+'</td>'+
      '<td style="padding:5px 8px;text-align:center"><input type="number" min="0" step="0.1" value="'+(a.centros||'')+'" onchange="actualizarArbol('+i+',\'centros\',this.value)" style="width:110px;padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px;text-align:center"></td>'+
      '<td style="padding:5px 8px;text-align:center"><button onclick="eliminarArbol('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:15px" title="Eliminar">✕</button></td>'+
      '</tr>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'cc-conteo-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:10px;max-width:480px;width:100%;max-height:94vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2">'+
        '<div style="font-weight:700;font-size:15px">🌳 Conteo de centros florales — '+escapeHtml(p.nombre)+'</div>'+
        '<button onclick="document.getElementById(\'cc-conteo-modal\').remove()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer">×</button>'+
      '</div>'+
      '<div style="padding:18px 20px">'+
        '<div style="font-size:12px;color:#666;margin-bottom:12px">Ingrese los centros florales contados en cada árbol muestreado. El sistema calcula el promedio, que luego puede aplicar al paño. <em>Los frutos/centro y kg/fruto se ingresan directamente en la tabla (se conocen en cosecha).</em></div>'+
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
          '<thead><tr style="background:#f0f0f0">'+
            '<th style="padding:6px 8px;font-size:11px;text-align:center">Muestra</th>'+
            '<th style="padding:6px 8px;font-size:11px;text-align:center">Centros florales/árbol</th>'+
            '<th style="padding:6px 8px"></th>'+
          '</tr></thead><tbody id="cc-conteo-tbody">'+
            (filasHtml || '<tr><td colspan="3" style="padding:14px;text-align:center;color:#999">Sin árboles. Agregue uno para comenzar.</td></tr>')+
          '</tbody></table></div>'+
        '<button onclick="agregarArbol()" style="margin-top:10px;background:#354a5f;color:#fff;border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700">＋ Agregar árbol</button>'+
        '<div style="margin-top:16px;background:#fafafa;border-radius:8px;padding:14px;text-align:center">'+
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:6px">Promedio de '+n+' árbol(es)</div>'+
          '<div style="font-size:24px;font-weight:800;color:#354a5f">'+promC.toFixed(1)+'</div>'+
          '<div style="font-size:11px;color:#888">centros florales/árbol</div>'+
        '</div>'+
      '</div>'+
      '<div style="padding:12px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px;position:sticky;bottom:0">'+
        '<button onclick="document.getElementById(\'cc-conteo-modal\').remove()" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Cerrar</button>'+
        '<button onclick="aplicarPromedioAlPano()" '+(n?'':'disabled')+' style="background:'+(n?'linear-gradient(90deg,#354a5f,#0854a0)':'#ccc')+';color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:'+(n?'pointer':'not-allowed')+';font-size:13px;font-weight:700">✓ Aplicar promedio al paño</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

function agregarArbol(){
  var p = S.panos.find(function(x){ return x.id==_conteoActivePano; });
  if(!p) return;
  if(!Array.isArray(p.conteoArboles)) p.conteoArboles = [];
  p.conteoArboles.push({centros:''});
  save();
  renderConteoModal(p);
}
function actualizarArbol(idx, campo, valor){
  var p = S.panos.find(function(x){ return x.id==_conteoActivePano; });
  if(!p || !p.conteoArboles || !p.conteoArboles[idx]) return;
  p.conteoArboles[idx][campo] = parseFloat(valor)||0;
  save();
  renderConteoModal(p); // recalcular promedio en vivo
}
function eliminarArbol(idx){
  var p = S.panos.find(function(x){ return x.id==_conteoActivePano; });
  if(!p || !p.conteoArboles) return;
  p.conteoArboles.splice(idx,1);
  save();
  renderConteoModal(p);
}
function aplicarPromedioAlPano(){
  var p = S.panos.find(function(x){ return x.id==_conteoActivePano; });
  if(!p || !p.conteoArboles || !p.conteoArboles.length) return;
  var arboles = p.conteoArboles, n = arboles.length;
  var sumC=0;
  arboles.forEach(function(a){ sumC+=parseFloat(a.centros)||0; });
  // Solo aplica los centros florales (frutos/centro y kg/fruto se ingresan aparte, se saben en cosecha)
  p.centrosFlorales = parseFloat((sumC/n).toFixed(2));
  save();
  document.getElementById('cc-conteo-modal').remove();
  renderEstimacion();
  showNotice('\u2713 Promedio de centros florales ('+n+' árbol(es)) aplicado a "'+p.nombre+'".','ok');
}

// ══ VERSIONES DE ESTIMACIÓN ══
function guardarVersionEstimacion(){
  var nombre = prompt('Nombre de la versión (ej: v0 floración, v1 cuaja):');
  if(nombre===null) return;
  nombre = (nombre||'').trim();
  if(!nombre) nombre = 'v'+((S.versionesEstim||[]).length);
  // Temporada de la versión (permite comparar evolución entre temporadas)
  var tempDef = (typeof temporadaActual==='function') ? temporadaActual() : '';
  var temporada = prompt('Temporada de esta estimación (formato AAAA-AAAA):', tempDef||'');
  if(temporada===null) return;
  temporada = (temporada||'').trim() || tempDef;
  if(!Array.isArray(S.versionesEstim)) S.versionesEstim = [];
  // Capturar foto de la estimación actual
  var snapshot = {
    id: Date.now(),
    nombre: nombre,
    temporada: temporada,
    fecha: new Date().toISOString(),
    panos: S.panos.map(function(p){
      return {
        id:p.id, nombre:p.nombre, variedad:p.variedad, tipo:(p.tipo||'Productivo'),
        plantas: estPlantasDe(p),
        centros: estConteosDe(p).centros, frutos: estConteosDe(p).frutos, kgFruto: estConteosDe(p).kgFruto,
        kgArbol: estKgArbol(p), kgPano: estKgPano(p)
      };
    })
  };
  // Total general
  snapshot.totalKg = snapshot.panos.reduce(function(s,p){ return s+p.kgPano; },0);
  S.versionesEstim.push(snapshot);
  save();
  renderEstimacion();
  showNotice('\u2713 Versión "'+nombre+'" guardada.','ok');
}
/* Importa los conteos registrados en terreno (módulo Conteos) a la estimación,
   emparejando por paño Y variedad. Principales y polinizantes se cargan por
   separado, cada uno con su propio promedio de centros florales. */
function estImportarConteosTerreno(){
  var temp = (document.getElementById('est-cte-temp')||{}).value || window._estCteTemporada || '';
  var sesiones = (STATE.cache.conteos||[]).filter(function(s){
    return (!temp || s.temporada===temp) && (s.promedioCentros!=null || s.cuajaSesion!=null);
  });
  if(!sesiones.length){ showNotice('No hay conteos de terreno para la temporada '+(temp||'seleccionada')+'.','err'); return; }

  // Acumular por paño+variedad: centros florales y cuaja (frutos/centro)
  var acum = {};
  sesiones.forEach(function(s){
    var clave = (s.panoNombre||'').trim().toLowerCase()+'|'+(s.variedad||'').trim().toLowerCase();
    if(!acum[clave]) acum[clave] = { sumC:0, nC:0, sumQ:0, nQ:0, pano:s.panoNombre, variedad:s.variedad };
    if(s.promedioCentros!=null){ acum[clave].sumC += s.promedioCentros; acum[clave].nC++; }
    if(s.cuajaSesion!=null){ acum[clave].sumQ += s.cuajaSesion; acum[clave].nQ++; }
  });

  var cambios=[], sinPano=[];
  Object.keys(acum).forEach(function(clave){
    var a = acum[clave];
    var pano = (S.panos||[]).find(function(p){
      return (p.nombre||'').trim().toLowerCase()===(a.pano||'').trim().toLowerCase()
          && (p.variedad||'').trim().toLowerCase()===(a.variedad||'').trim().toLowerCase();
    });
    if(!pano){ sinPano.push(a.pano+' · '+a.variedad); return; }
    cambios.push({
      pano: pano,
      centros: a.nC ? Math.round((a.sumC/a.nC)*100)/100 : null,
      cuaja:   a.nQ ? Math.round((a.sumQ/a.nQ)*1000)/1000 : null,
      sesiones: Math.max(a.nC, a.nQ)
    });
  });

  if(!cambios.length){ showNotice('No se encontraron paños que coincidan con los conteos de terreno.','err'); return; }

  var resumen = cambios.map(function(c){
    var partes=[];
    if(c.centros!=null) partes.push(c.centros+' centros/árbol');
    if(c.cuaja!=null)   partes.push('cuaja '+c.cuaja+' (frutos/centro)');
    if(!partes.length)  partes.push('sin datos');
    return '• '+c.pano.nombre+' · '+(c.pano.variedad||'')+': '+partes.join(' · ')+(c.sesiones>1?(' ['+c.sesiones+' sesiones]'):'');
  }).join('\n');
  var aviso = sinPano.length ? '\n\n⚠ Sin paño coincidente (no se importan): '+sinPano.join(', ') : '';

  if(!confirm('Importar desde los conteos de terreno'+(temp?(' · temporada '+temp):'')+':\n\n'+resumen+aviso+'\n\nSe actualizarán los campos "Centros florales/árbol" y "Frutos/centro (cuaja)".\n\n¿Aplicar?')) return;

  var nC=0, nQ=0;
  cambios.forEach(function(c){
    if(c.centros!=null){ c.pano.centrosFlorales = c.centros; nC++; }
    if(c.cuaja!=null){ c.pano.frutosPorCentro = c.cuaja; nQ++; }
  });
  save();
  renderEstimacion();
  showNotice('\u2713 Importado: '+nC+' paño(s) con centros florales, '+nQ+' con cuaja.','ok');
}
try{ window.estImportarConteosTerreno=estImportarConteosTerreno; }catch(e){}

function estFiltrarTemporada(t){
  window._estTempFiltro = t || '';
  renderEstimacion();
}
try{ window.estFiltrarTemporada=estFiltrarTemporada; }catch(e){}

/* Gráfico de evolución de la estimación por paño a través de las versiones. */
function estGraficarEvolucion(){
  var versiones = (S.versionesEstim||[]).slice()
    .sort(function(a,b){ return new Date(a.fecha)-new Date(b.fecha); });
  var tempFiltro = window._estTempFiltro || '';
  if(tempFiltro) versiones = versiones.filter(function(v){ return v.temporada===tempFiltro; });
  if(versiones.length<2){ showNotice('Se necesitan al menos 2 versiones para graficar la evolución.','err'); return; }

  // Paños presentes en las versiones (solo productivos con kg)
  var panosMap = {};
  var variedadesSet = {};
  versiones.forEach(function(v){
    (v.panos||[]).forEach(function(p){
      if((p.kgPano||0)>0){
        panosMap[p.nombre+' · '+(p.variedad||'')] = (p.variedad||'');
        variedadesSet[(p.variedad||'Sin variedad')] = true;
      }
    });
  });
  var etiquetas = Object.keys(panosMap).sort();
  var variedades = Object.keys(variedadesSet).sort();
  var colores = ['#0a6ed1','#1a7e3e','#e9730c','#c0392b','#8e44ad','#16a085','#d35400','#2c3e50','#c2185b','#00838f','#558b2f','#6d4c41'];
  var _chartEvo = null;

  function construirDatasets(varFiltro){
    var ds = etiquetas.filter(function(nom){
      if(!varFiltro) return true;
      return (panosMap[nom]||'Sin variedad')===varFiltro || panosMap[nom]===varFiltro;
    }).map(function(nom, i){
      return {
        label: nom,
        data: versiones.map(function(v){
          var p=(v.panos||[]).find(function(x){ return (x.nombre+' · '+(x.variedad||''))===nom; });
          return p ? Math.round(p.kgPano) : null;
        }),
        borderColor: colores[i % colores.length],
        backgroundColor: colores[i % colores.length]+'22',
        tension: .3, borderWidth: 2, pointRadius: 4, spanGaps: true
      };
    });
    // Serie total: solo cuando se muestran todas las variedades
    if(!varFiltro){
      ds.push({
        label:'TOTAL',
        data: versiones.map(function(v){ return Math.round(v.totalKg||0); }),
        borderColor:'#111', backgroundColor:'transparent',
        borderDash:[6,4], borderWidth:3, tension:.3, pointRadius:5
      });
    }
    return ds;
  }

  function dibujar(varFiltro){
    var cv=document.getElementById('est-evo-chart'); if(!cv) return;
    if(_chartEvo){ try{ _chartEvo.destroy(); }catch(e){} }
    _chartEvo = new Chart(cv.getContext('2d'),{
      type:'line',
      data:{
        labels: versiones.map(function(v){ return v.nombre + (v.temporada?(' ('+v.temporada+')'):''); }),
        datasets: construirDatasets(varFiltro)
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}},
          tooltip:{callbacks:{label:function(c){ return c.dataset.label+': '+(c.parsed.y!=null?c.parsed.y.toLocaleString('es-CL'):'—')+' kg'; }}}
        },
        scales:{ y:{ beginAtZero:true, title:{display:true,text:'Kilos estimados'},
          ticks:{callback:function(v){ return v.toLocaleString('es-CL'); }} } }
      }
    });
  }
  window._estEvoDibujar = function(val){ window._estEvoVarFiltro = val; dibujar(val); };

  var prev=document.getElementById('est-evo-modal'); if(prev) prev.remove();
  var m=document.createElement('div');
  m.id='est-evo-modal';
  m.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100dvh;background:rgba(0,0,0,.55);z-index:10004;display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML=
    '<div style="background:#fff;border-radius:12px;max-width:960px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="background:#0a6ed1;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'+
        '<div><div style="font-size:17px;font-weight:800">📈 Evolución de la estimación por paño</div>'+
          '<div style="font-size:12px;opacity:.9">'+versiones.length+' versiones'+(tempFiltro?(' · temporada '+escapeHtml(tempFiltro)):' · todas las temporadas')+'</div></div>'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<select onchange="window._estEvoDibujar(this.value)" style="padding:8px 10px;border:none;border-radius:7px;font-size:13px;font-weight:700;color:#0854a0;cursor:pointer">'+
            '<option value="">Todas las variedades</option>'+
            variedades.map(function(vv){ return '<option value="'+escapeHtml(vv)+'">'+escapeHtml(vv)+'</option>'; }).join('')+
          '</select>'+
          '<button onclick="document.getElementById(\'est-evo-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
        '</div>'+
      '</div>'+
      '<div style="padding:18px;overflow:auto;flex:1"><canvas id="est-evo-chart" style="height:1040px;max-height:1040px"></canvas></div>'+
    '</div>';
  document.body.appendChild(m);

  setTimeout(function(){
    try{ dibujar(''); }catch(e){ console.error('Gráfico evolución:',e); }
  },60);
}
try{ window.estGraficarEvolucion=estGraficarEvolucion; }catch(e){}

function eliminarVersionEstim(id){
  if(!confirm('¿Eliminar esta versión guardada?')) return;
  S.versionesEstim = (S.versionesEstim||[]).filter(function(v){ return v.id!=id; });
  save();
  renderEstimacion();
}
function verVersionEstim(id){
  var v = (S.versionesEstim||[]).find(function(x){ return x.id==id; });
  if(!v) return;
  var existing = document.getElementById('cc-ver-modal'); if(existing) existing.remove();
  // Agrupar por variedad
  var porVar={};
  v.panos.forEach(function(p){
    var key=(p.variedad||'Sin variedad')+(p.tipo==='Polinizante'?' (polin.)':'');
    if(!porVar[key]) porVar[key]={kg:0,plantas:0};
    porVar[key].kg+=p.kgPano; porVar[key].plantas+=p.plantas;
  });
  var varRows=Object.keys(porVar).sort().map(function(k){
    return '<tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px;font-weight:700">'+escapeHtml(k)+'</td>'+
      '<td style="padding:6px 10px;text-align:right">'+porVar[k].plantas.toLocaleString('es-CL')+'</td>'+
      '<td style="padding:6px 10px;text-align:right;font-weight:700;color:#354a5f">'+Math.round(porVar[k].kg).toLocaleString('es-CL')+' kg</td></tr>';
  }).join('');
  var modal=document.createElement('div');
  modal.id='cc-ver-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  modal.innerHTML='<div style="background:#fff;border-radius:10px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
    '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">'+
      '<div style="font-weight:700;font-size:15px">📋 '+escapeHtml(v.nombre)+'</div>'+
      '<button onclick="document.getElementById(\'cc-ver-modal\').remove()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer">×</button>'+
    '</div>'+
    '<div style="padding:18px 20px">'+
      '<div style="font-size:12px;color:#888;margin-bottom:12px">Guardada: '+new Date(v.fecha).toLocaleString('es-CL')+'</div>'+
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#354a5f;color:#d1e8ff">'+
        '<th style="text-align:left;padding:8px 10px">Variedad</th><th style="text-align:right;padding:8px 10px">Plantas</th><th style="text-align:right;padding:8px 10px">Kg estimados</th></tr></thead>'+
        '<tbody>'+varRows+'</tbody>'+
        '<tfoot><tr style="background:#f0f0f0;font-weight:800"><td style="padding:9px 10px">TOTAL</td><td></td><td style="padding:9px 10px;text-align:right;color:#354a5f">'+Math.round(v.totalKg).toLocaleString('es-CL')+' kg</td></tr></tfoot>'+
      '</table>'+
    '</div></div>';
  document.body.appendChild(modal);
}

// Exporta la estimación a Excel
function exportarEstimacionExcel(){
  if(typeof XLSX==='undefined'){ showNotice('Librería Excel no disponible.','err'); return; }
  if(!S.panos.length){ showNotice('No hay paños para estimar.','err'); return; }

  // Hoja 1: Detalle por paño
  var det = [['Paño','Tipo','Variedad','Año','N° plantas','Centros florales/árbol','Frutos/centro','Kg/fruto','Kg/árbol','Kg paño']];
  var ordenados = [];
  ['2018','2024','2026'].forEach(function(y){
    ordenados = ordenados.concat(ordenarPanosPadreHijo(S.panos.filter(function(p){ return p.anio===y; })));
  });
  ordenados.forEach(function(p){
    var c = estConteosDe(p);
    det.push([
      p.nombre||'', p.tipo||'Productivo', p.variedad||'', p.anio||'',
      estPlantasDe(p), c.centros, c.frutos, c.kgFruto,
      parseFloat(estKgArbol(p).toFixed(3)), Math.round(estKgPano(p))
    ]);
  });
  var ws1 = XLSX.utils.aoa_to_sheet(det);
  ws1['!cols'] = [{wch:18},{wch:12},{wch:14},{wch:8},{wch:11},{wch:20},{wch:13},{wch:10},{wch:11},{wch:12}];

  // Hoja 2: Resumen por variedad
  var porVar = {};
  S.panos.forEach(function(p){
    var v = (p.variedad||'Sin variedad').trim()||'Sin variedad';
    if(!porVar[v]) porVar[v] = { plantasPrincipal:0, plantasPolin:0, kgPrincipal:0, kgPolin:0 };
    var esPolin = (p.tipo||'Productivo')==='Polinizante';
    if(esPolin){ porVar[v].plantasPolin += estPlantasDe(p); porVar[v].kgPolin += estKgPano(p); }
    else { porVar[v].plantasPrincipal += estPlantasDe(p); porVar[v].kgPrincipal += estKgPano(p); }
  });
  var res = [['Variedad','Plantas principal','Plantas polinizante','Kg variedad principal','Kg polinizantes','Kg TOTAL','Cajas 5kg','Toneladas']];
  var tG=0, tP=0, tPol=0;
  Object.keys(porVar).sort().forEach(function(v){
    var d = porVar[v]; var tot = d.kgPrincipal+d.kgPolin;
    tG+=tot; tP+=d.kgPrincipal; tPol+=d.kgPolin;
    res.push([v, d.plantasPrincipal, d.plantasPolin, Math.round(d.kgPrincipal), Math.round(d.kgPolin), Math.round(tot), Math.round(tot/5), parseFloat((tot/1000).toFixed(2))]);
  });
  res.push([]);
  res.push(['TOTAL GENERAL','','',Math.round(tP),Math.round(tPol),Math.round(tG),Math.round(tG/5),parseFloat((tG/1000).toFixed(2))]);
  var ws2 = XLSX.utils.aoa_to_sheet(res);
  ws2['!cols'] = [{wch:16},{wch:16},{wch:18},{wch:20},{wch:16},{wch:14},{wch:11},{wch:11}];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por variedad');
  XLSX.utils.book_append_sheet(wb, ws1, 'Detalle por paño');
  var fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, 'Estimacion_Produccion_'+fecha+'.xlsx');
  showNotice('\u2713 Estimación exportada a Excel.','ok');
}

// ══ RESUMEN ══
// Reporte de aplicaciones confirmadas de un cuartel (paño principal + sus
// polinizantes), imprimible, con todos los datos de cada aplicación.
function verResumenAplicaciones(){
  var confs=(S.confirmaciones||[]).slice().sort(function(a,b){ return String(b.fechaApp||'').localeCompare(String(a.fechaApp||'')); });
  function fmtN(n,d){ n=parseFloat(n)||0; return n.toLocaleString('es-CL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
  var totalAgua=0;
  var filas=confs.map(function(c){
    var orden=(S.ordenes||[]).find(function(o){ return String(o.id)===String(c.ordenId); });
    var tipoApp=orden?(orden.tipo||orden.tipoApp||''):'';
    var nroOrden=c.ordenNumero||(orden?(orden.numero||orden.id||''):(c.ordenId||''));
    var nombresPanos=(c.panoIds||[]).map(function(pid){ var px=getPano(pid); return px?px.nombre:('#'+pid); });
    var panosUnicos=nombresPanos.filter(function(x,i){ return nombresPanos.indexOf(x)===i; });
    var agua=parseFloat(c.aguaReal)||0; totalAgua+=agua;
    // Objetivo(s) desde la orden
    var objs=(orden&&orden.objetivos?orden.objetivos.slice():[]);
    if(orden&&orden.objetivoOtro) objs.push('Otro: '+orden.objetivoOtro);
    var objetivoHtml=objs.length?('<div style="margin-top:4px;font-size:11px;color:#8a5a00">🎯 '+escapeHtml(objs.join(', '))+'</div>'):'';
    // Detalle de productos aplicados
    var prods=(c.productosReales||[]).filter(function(pr){ return pr.nombre; });
    var prodHtml=prods.length
      ? '<div style="margin-top:5px;font-size:11px;color:#444">'+prods.map(function(pr){
          return '• '+escapeHtml(pr.nombre)+' <strong>'+fmtN(pr.qtyAplicada,3)+' '+escapeHtml(pr.unitS||'')+'</strong>';
        }).join('<br>')+'</div>'
      : '<div style="margin-top:5px;font-size:11px;color:#aaa">Sin productos</div>';
    return '<tr style="border-bottom:1px solid #eee;vertical-align:top">'+
      '<td style="padding:8px 10px;white-space:nowrap;font-weight:700">'+escapeHtml(c.fechaApp||'—')+(c.turno?'<div style="font-size:11px;color:#888;font-weight:400">'+escapeHtml(c.turno)+'</div>':'')+'</td>'+
      '<td style="padding:8px 10px;font-size:12px">'+escapeHtml(String(nroOrden||'—'))+(tipoApp?'<div style="color:#1565c0;font-weight:700">'+escapeHtml(tipoApp)+'</div>':'')+objetivoHtml+'</td>'+
      '<td style="padding:8px 10px;font-size:12px">'+escapeHtml(panosUnicos.join(', '))+prodHtml+'</td>'+
      '<td style="padding:8px 10px;font-size:12px;color:#555">'+escapeHtml(c.operador||'—')+(c.equipo?'<div style="color:#888">'+escapeHtml(c.equipo)+'</div>':'')+'</td>'+
      '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1a5a8a;white-space:nowrap">'+fmtN(agua,0)+' L</td>'+
    '</tr>';
  }).join('');
  if(!filas) filas='<tr><td colspan="5" style="padding:24px;text-align:center;color:#888">Sin aplicaciones confirmadas.</td></tr>';

  var prev=document.getElementById('cc-resumen-aplic-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='cc-resumen-aplic-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10005;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick=function(e){ if(e.target===modal) modal.remove(); };
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:820px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#1565c0;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-size:16px;font-weight:800">🧪 Resumen de aplicaciones confirmadas</div>'+
        '<div style="font-size:12px;opacity:.9">'+confs.length+' aplicación(es) · '+fmtN(totalAgua,0)+' L de agua en total</div></div>'+
      '<button onclick="document.getElementById(\'cc-resumen-aplic-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
    '</div>'+
    '<div style="padding:0;overflow:auto;flex:1">'+
      '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px">'+
        '<thead><tr style="background:#f0f7ff;position:sticky;top:0">'+
          '<th style="padding:9px 10px;text-align:left">Fecha</th>'+
          '<th style="padding:9px 10px;text-align:left">Orden / Tipo / Objetivo</th>'+
          '<th style="padding:9px 10px;text-align:left">Paños y productos</th>'+
          '<th style="padding:9px 10px;text-align:left">Operador / Equipo</th>'+
          '<th style="padding:9px 10px;text-align:right">Agua</th>'+
        '</tr></thead><tbody>'+filas+'</tbody>'+
        '<tfoot><tr style="background:#f0f0f0;font-weight:800"><td colspan="4" style="padding:10px">TOTAL AGUA</td><td style="padding:10px;text-align:right;color:#1a5a8a">'+fmtN(totalAgua,0)+' L</td></tr></tfoot>'+
      '</table>'+
    '</div>'+
    '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;justify-content:flex-end">'+
      '<button onclick="document.getElementById(\'cc-resumen-aplic-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cerrar</button>'+
    '</div></div>';
  document.body.appendChild(modal);
}
try{ window.verResumenAplicaciones=verResumenAplicaciones; }catch(e){}

function verAplicacionesPano(panoId){
  var p=getPano(panoId); if(!p){ if(typeof toast==='function') toast('No encontrado','Paño no encontrado','error'); return; }
  var hijosP=S.panos.filter(function(x){ return (x.tipo||'Productivo')==='Polinizante' && String(x.panoPadre)===String(p.id); });
  var idsGrupo=[String(p.id)].concat(hijosP.map(function(h){ return String(h.id); }));
  // Confirmaciones que incluyen el cuartel, ordenadas por fecha
  var confs=(S.confirmaciones||[]).filter(function(c){
    return (c.panoIds||[]).some(function(pid){ return idsGrupo.indexOf(String(pid))>=0; });
  }).sort(function(a,b){ return String(b.fechaApp||'').localeCompare(String(a.fechaApp||'')); });

  function fmtN(n,d){ n=parseFloat(n)||0; return n.toLocaleString('es-CL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }

  // Construir el cuerpo del reporte (una sección por aplicación)
  // Solo lo aplicado EN ESTE PAÑO: se prorratea producto y agua por hectáreas
  // del grupo (paño + polinizantes hijos) sobre el total de paños cubiertos.
  var hasDe=function(pid){ var px=getPano(pid); if(!px) return 0; return (parseFloat(px.hectareas)||0); };
  var cuerpo='';
  var totalAguaGrupo=0;
  confs.forEach(function(c){
    var orden=(S.ordenes||[]).find(function(o){ return String(o.id)===String(c.ordenId); });
    var tipoApp=orden?(orden.tipo||orden.tipoApp||''):'';
    var nroConf=c.folio||c.id||'—';
    var nroOrden=c.ordenNumero||(orden?(orden.numero||orden.id||''):(c.ordenId||''));
    var haTotal=(c.panoIds||[]).reduce(function(s,pid){ return s+hasDe(pid); },0);
    var haGrupo=(c.panoIds||[]).filter(function(pid){ return idsGrupo.indexOf(String(pid))>=0; })
      .reduce(function(s,pid){ return s+hasDe(pid); },0);
    var factor=(haTotal>0 && haGrupo>0) ? (haGrupo/haTotal) : 1;
    totalAguaGrupo += (parseFloat(c.aguaReal)||0)*factor;
    var prods=(c.productosReales||[]).map(function(pr){
      return '<tr><td style="padding:4px 8px;border:1px solid #ddd">'+escapeHtml(pr.nombre||'')+'</td>'+
        '<td style="padding:4px 8px;border:1px solid #ddd;text-align:right">'+fmtN((parseFloat(pr.qtyAplicada)||0)*factor,3)+' '+escapeHtml(pr.unitS||'')+'</td></tr>';
    }).join('');
    cuerpo+='<div class="aplic-bloque" style="margin-bottom:18px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">'+
      '<div style="background:#f0f7ff;padding:10px 14px;border-bottom:1px solid #e0e0e0">'+
        '<div style="font-weight:800;font-size:14px;color:#1565c0">📅 '+escapeHtml(c.fechaApp||'Sin fecha')+(c.turno?' · '+escapeHtml(c.turno):'')+'</div>'+
        '<div style="font-size:12px;color:#555;margin-top:2px">Confirmación N° '+escapeHtml(String(nroConf))+' · Orden '+escapeHtml(String(nroOrden))+(tipoApp?' · '+escapeHtml(tipoApp):'')+'</div>'+
        '<div style="font-size:12px;color:#555;margin-top:2px">Operador: '+escapeHtml(c.operador||'—')+' · Equipo: '+escapeHtml(c.equipo||'—')+'</div>'+
      '</div>'+
      '<div style="padding:10px 14px">'+
        '<table style="border-collapse:collapse;font-size:12px;width:100%;margin-bottom:8px">'+
          '<thead><tr style="background:#fafafa"><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Producto</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:right">Cantidad en este paño</th></tr></thead>'+
          '<tbody>'+(prods||'<tr><td colspan="2" style="padding:4px 8px;border:1px solid #ddd;color:#888">Sin productos</td></tr>')+'</tbody>'+
        '</table>'+
        '<div style="font-size:12px;color:#333"><strong>💧 Agua aplicada en este paño:</strong> '+fmtN((parseFloat(c.aguaReal)||0)*factor,0)+' L</div>'+
        (factor<1?'<div style="font-size:11px;color:#777;margin-top:4px">Prorrateado por superficie: '+fmtN(haGrupo,2)+' ha de '+fmtN(haTotal,2)+' ha cubiertas por la aplicación.</div>':'')+
        (c.observaciones?'<div style="font-size:11px;color:#777;margin-top:2px"><strong>Obs:</strong> '+escapeHtml(c.observaciones)+'</div>':'')+
      '</div>'+
    '</div>';
  });
  if(!cuerpo) cuerpo='<div style="color:#888;padding:20px;text-align:center">Sin aplicaciones confirmadas para este cuartel.</div>';
  else cuerpo+='<div style="margin-top:6px;padding:12px 14px;background:#eef6ff;border:1px solid #cfe4fb;border-radius:8px;font-size:13px;color:#1565c0;font-weight:800">💧 Total agua aplicada al grupo: '+fmtN(totalAguaGrupo,0)+' L</div>';

  var fecha=new Date().toLocaleString('es-CL');
  var titulo='Aplicaciones confirmadas · '+(p.nombre||'')+(p.variedad?' ('+p.variedad+')':'');

  // Modal con botón imprimir
  var prev=document.getElementById('cc-aplic-pano-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='cc-aplic-pano-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10005;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#1565c0;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-size:16px;font-weight:800">'+escapeHtml(titulo)+'</div>'+
        '<div style="font-size:12px;opacity:.9">'+confs.length+' aplicación(es) confirmada(s)</div></div>'+
      '<button onclick="document.getElementById(\'cc-aplic-pano-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
    '</div>'+
    '<div id="cc-aplic-pano-body" style="padding:18px;overflow:auto;flex:1">'+cuerpo+'</div>'+
    '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
      '<button onclick="document.getElementById(\'cc-aplic-pano-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cerrar</button>'+
      '<button onclick="imprimirAplicacionesPano(\''+p.id+'\')" style="padding:11px 18px;border:none;border-radius:9px;background:#1565c0;color:#fff;cursor:pointer;font-size:14px;font-weight:700">🖨️ Imprimir reporte</button>'+
    '</div></div>';
  document.body.appendChild(modal);
}
// Imprime el reporte de aplicaciones confirmadas del cuartel.
function imprimirAplicacionesPano(panoId){
  var p=getPano(panoId); if(!p) return;
  var bodyEl=document.getElementById('cc-aplic-pano-body');
  var contenido=bodyEl?bodyEl.innerHTML:'';
  var fecha=new Date().toLocaleString('es-CL');
  var titulo='Aplicaciones confirmadas · '+(p.nombre||'')+(p.variedad?' ('+p.variedad+')':'');
  var win=window.open('','_blank');
  if(!win){ if(typeof toast==='function') toast('Impresión bloqueada','Permita las ventanas emergentes para imprimir','error'); return; }
  win.document.write('<html><head><title>'+escapeHtml(titulo)+'</title><meta charset="utf-8"><style>'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px;max-width:800px;margin:0 auto}'+
    'h1{font-size:19px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:18px}'+
    'table{page-break-inside:avoid} .aplic-bloque{page-break-inside:avoid}'+
    '@media print{button{display:none}}'+
    '</style></head><body>'+
    '<h1>'+escapeHtml(titulo)+'</h1>'+
    '<div class="sub">Sociedad Agrícola y Forestal La Cabaña · Cuaderno de Campo<br>Generado: '+fecha+'</div>'+
    contenido+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt></body></html>');
  win.document.close();
}

// ── Resumen de confirmaciones para BAJA DE BODEGA (solo con permiso) ──
// Lista cada confirmación con su número y la cantidad total de producto usado,
// con un enlace para dar de baja ese producto en la bodega (movimiento de
// salida del SCI por centro de costo). Pensado para administrador/encargado.
function abrirResumenBajaConfirmaciones(){
  if(typeof can==='function' && !can('movimientos.crear')){
    if(typeof toast==='function') toast('Sin permiso','Necesita permiso para crear movimientos de bodega','error');
    return;
  }
  function fmtN(n,d){ n=parseFloat(n)||0; return n.toLocaleString('es-CL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
  var esAdmin=(typeof can==='function') && can('config.editar');
  var confs=(S.confirmaciones||[]).slice().sort(function(a,b){ return String(b.fechaApp||'').localeCompare(String(a.fechaApp||'')); });

  var filas='';
  confs.forEach(function(c,idx){
    // Índice REAL en S.confirmaciones (confs está ordenado, no sirve su índice)
    var realIdx=(S.confirmaciones||[]).indexOf(c);
    var orden=(S.ordenes||[]).find(function(o){ return String(o.id)===String(c.ordenId); });
    var nro=orden?(orden.numero||orden.id||''):(c.numero||c.ordenId||('#'+(idx+1)));
    var panosTxt=(c.panoIds||[]).map(function(pid){ var p=getPano(pid); return p?p.nombre:pid; });
    // Cuarteles únicos
    var cuarteles=[]; panosTxt.forEach(function(n){ if(cuarteles.indexOf(n)<0) cuarteles.push(n); });
    var prodRows=(c.productosReales||[]).map(function(pr,prIdx){
      var nombre=pr.nombre||'';
      // Resolución por vínculo manual → descripción exacta → descripción normalizada
      var prodSCI=_resolverProdSCI(nombre);
      var codigoSCI=prodSCI?prodSCI.codigoInterno:'';
      var vinculado=!!_getVinculoSCI(nombre);
      var qty=parseFloat(pr.qtyAplicada)||0;
      var unit=pr.unitS||'';
      // ¿Ya se dio de baja esta confirmación+producto? (marca en la confirmación)
      var yaBaja=(c.bajasBodega && c.bajasBodega[nombre]) ? c.bajasBodega[nombre] : null;
      // Baja registrada MANUALMENTE fuera de este flujo (marcada por un admin)
      var manual=(c.bajasManual && c.bajasManual[nombre]) ? c.bajasManual[nombre] : null;
      var resuelto=!!(yaBaja||manual);
      // Saldo disponible en bodega (todas las bodegas) para este producto.
      var saldo = (codigoSCI && typeof getStockTotal==='function') ? getStockTotal(codigoSCI) : null;
      // Si la baja ya está resuelta, el faltante deja de ser una alerta.
      var insuf = (!resuelto && saldo!=null && saldo < qty);
      var saldoCell = (saldo==null)
        ? '<span style="color:#999;font-size:11px">—</span>'
        : '<span style="font-size:11px;font-weight:700;color:'+(insuf?'#b91c1c':'#15803d')+'">'+fmtN(saldo,3)+(insuf?' ⚠':'')+'</span>'+(insuf?'<div style="font-size:9px;color:#b91c1c">insuficiente</div>':'');
      // Casilla de baja manual (solo administrador). Permite silenciar la alerta
      // cuando la salida ya se registró a mano desde el módulo de Salidas.
      var chk='';
      if(esAdmin && !yaBaja){
        chk='<label style="display:flex;align-items:center;gap:5px;justify-content:center;margin-top:5px;font-size:10px;color:#475569;cursor:pointer" '+
            'title="Marcar si la salida ya se registró manualmente en el módulo de Salidas">'+
            '<input type="checkbox" '+(manual?'checked':'')+' onchange="marcarBajaManual('+realIdx+','+prIdx+',this.checked)" '+
            'style="width:14px;height:14px;cursor:pointer">Baja manual</label>';
      }
      var accion;
      if(yaBaja){
        accion='<span style="color:#15803d;font-weight:700;font-size:11px">✓ Baja '+escapeHtml(yaBaja)+'</span>';
      } else if(manual){
        accion='<span style="color:#15803d;font-weight:700;font-size:11px" title="Marcada por '+escapeHtml(manual.usuario||'')+'">✓ Baja manual'+
               (manual.fecha?('<div style="font-size:9px;font-weight:400;color:#64748b">'+escapeHtml(manual.fecha)+'</div>'):'')+'</span>';
      } else if(codigoSCI){
        accion='<button onclick="bajaConfirmacionEnBodega(\''+String(c.ordenId||idx)+'\',\''+String(idx)+'\',\''+codigoSCI+'\','+qty+')" '+
          'style="background:'+(insuf?'#b91c1c':'#1565c0')+';color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">📤 Dar de baja</button>';
      } else {
        accion='<span style="color:#b91c1c;font-size:11px" title="No existe en el catálogo del SCI">⚠ Sin correspondencia</span>';
        if(esAdmin){
          accion+='<div style="margin-top:5px"><button onclick="abrirVinculoSCI('+realIdx+','+prIdx+')" '+
            'style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer" '+
            'title="Enlazar este nombre con un producto del catálogo del SCI">🔗 Vincular</button></div>';
        }
      }
      // Indicador de vínculo manual activo, con opción de deshacerlo
      var vinc='';
      if(vinculado && codigoSCI){
        vinc='<div style="font-size:9px;color:#7c3aed;margin-top:3px">🔗 vinculado'+
             (esAdmin?(' · <a href="#" onclick="desvincularSCI('+realIdx+','+prIdx+');return false;" style="color:#7c3aed">quitar</a>'):'')+'</div>';
      }
      return '<tr style="border-bottom:1px solid #eee'+(resuelto?';background:#f6fdf8':'')+'">'+
        '<td style="padding:6px 10px">'+escapeHtml(nombre)+(codigoSCI?'<div style="font-size:10px;color:#888">'+escapeHtml(codigoSCI)+'</div>':'')+vinc+'</td>'+
        '<td style="padding:6px 10px;text-align:right;font-weight:700">'+fmtN(qty,3)+' '+escapeHtml(unit)+'</td>'+
        '<td style="padding:6px 10px;text-align:right">'+saldoCell+'</td>'+
        '<td style="padding:6px 10px;text-align:center">'+accion+chk+'</td>'+
      '</tr>';
    }).join('');
    if(!prodRows) return;
    filas+='<div style="margin-bottom:16px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">'+
      '<div style="background:#f7f9fc;padding:9px 12px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">'+
        '<div style="font-weight:800;font-size:13px;color:#23303d">📋 Confirmación '+escapeHtml(String(nro))+'</div>'+
        '<div style="font-size:11px;color:#666">'+escapeHtml(c.fechaApp||'')+' · '+escapeHtml(cuarteles.join(', '))+'</div>'+
      '</div>'+
      '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
        '<thead><tr style="background:#fafafa;text-align:left"><th style="padding:5px 10px">Producto</th><th style="padding:5px 10px;text-align:right">Cantidad total usada</th><th style="padding:5px 10px;text-align:right">Saldo bodega</th><th style="padding:5px 10px;text-align:center">Baja bodega</th></tr></thead>'+
        '<tbody>'+prodRows+'</tbody>'+
      '</table>'+
    '</div>';
  });
  if(!filas) filas='<div style="color:#888;padding:24px;text-align:center">No hay confirmaciones con productos para dar de baja.</div>';

  var prev=document.getElementById('cc-baja-resumen-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='cc-baja-resumen-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10006;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:720px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#23303d;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
      '<div><div style="font-size:16px;font-weight:800">📦 Resumen de confirmaciones · Baja de bodega</div>'+
        '<div style="font-size:12px;opacity:.85">Producto usado por confirmación. Pulse «Dar de baja» para registrar la salida en el SCI.'+
        (esAdmin?' Si ya la registró a mano, marque «Baja manual» para silenciar la alerta.':'')+'</div></div>'+
      '<button onclick="document.getElementById(\'cc-baja-resumen-modal\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
    '</div>'+
    '<div style="padding:18px;overflow:auto;flex:1">'+filas+'</div>'+
    '<div style="padding:10px 18px;border-top:1px solid #e3e8ee;text-align:right">'+
      '<button onclick="document.getElementById(\'cc-baja-resumen-modal\').remove()" style="padding:10px 18px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cerrar</button>'+
    '</div></div>';
  document.body.appendChild(modal);
}

// Marca (o desmarca) un producto de una confirmación como "dado de baja
// manualmente", cuando la salida se registró a mano desde el módulo de Salidas.
// Silencia la alerta de saldo insuficiente sin generar ningún movimiento.
// Reservado a administradores (permiso config.editar).
function marcarBajaManual(idx, prIdx, marcar){
  if(typeof can!=='function' || !can('config.editar')){
    if(typeof toast==='function') toast('Sin permiso','Solo un administrador puede marcar bajas manuales','error');
    abrirResumenBajaConfirmaciones();
    return;
  }
  var c=(S.confirmaciones||[])[idx];
  if(!c){ if(typeof toast==='function') toast('No encontrada','No se pudo ubicar la confirmación','error'); return; }
  var pr=(c.productosReales||[])[prIdx];
  var nombreProd=pr?(pr.nombre||''):'';
  if(!nombreProd){ if(typeof toast==='function') toast('No encontrado','No se pudo ubicar el producto','error'); return; }
  if(c.bajasBodega && c.bajasBodega[nombreProd]){
    if(typeof toast==='function') toast('Ya registrada','Esta baja tiene un movimiento asociado y no puede marcarse como manual','error');
    abrirResumenBajaConfirmaciones();
    return;
  }
  if(!c.bajasManual) c.bajasManual={};
  if(marcar){
    c.bajasManual[nombreProd]={
      fecha:new Date().toISOString().slice(0,10),
      usuario:(STATE.user&&(STATE.user.nombre||STATE.user.username))||'?'
    };
  } else {
    delete c.bajasManual[nombreProd];
  }
  if(typeof save==='function') save();
  if(typeof renderCompraUrgente==='function') renderCompraUrgente();
  abrirResumenBajaConfirmaciones();
  if(typeof toast==='function'){
    toast(marcar?'Baja manual marcada':'Marca retirada',
          marcar?(nombreProd+' · alerta silenciada'):(nombreProd+' · vuelve a alertar'),
          marcar?'success':'info');
  }
}
try{ window.marcarBajaManual=marcarBajaManual; }catch(e){}

// ── Modal: vincular un nombre del Cuaderno con un producto del catálogo SCI ──
// Sugiere el candidato más parecido, pero la decisión es siempre del usuario:
// nunca se enlaza automáticamente por similitud.
function abrirVinculoSCI(idx, prIdx){
  if(typeof can!=='function' || !can('config.editar')){
    if(typeof toast==='function') toast('Sin permiso','Solo un administrador puede vincular productos','error');
    return;
  }
  var c=(S.confirmaciones||[])[idx];
  var pr=c?((c.productosReales||[])[prIdx]):null;
  var nombre=pr?(pr.nombre||''):'';
  if(!nombre){ if(typeof toast==='function') toast('No encontrado','No se pudo ubicar el producto','error'); return; }

  var prods=(STATE.cache.products||[]).filter(function(p){ return p && p.activo!==false; });
  // Ordenar por similitud con el nombre del Cuaderno
  var conSim=prods.map(function(p){ return {p:p, sim:_similitudNombre(nombre, p.descripcion||'')}; })
                  .sort(function(a,b){ return b.sim-a.sim; });
  var sugerido=(conSim[0] && conSim[0].sim>=0.6) ? conSim[0] : null;
  var actual=_getVinculoSCI(nombre);

  var opciones=conSim.map(function(x){
    var sel=(actual && String(x.p.codigoInterno)===String(actual)) ? ' selected'
          : ((!actual && sugerido && x.p.codigoInterno===sugerido.p.codigoInterno) ? ' selected' : '');
    var pct=Math.round(x.sim*100);
    return '<option value="'+escapeHtml(x.p.codigoInterno)+'"'+sel+'>'+
           escapeHtml(x.p.descripcion||'')+' · '+escapeHtml(x.p.codigoInterno)+
           (pct>=60?(' ('+pct+'% parecido)'):'')+'</option>';
  }).join('');

  var prev=document.getElementById('cc-vinculo-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='cc-vinculo-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10008;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick=function(e){ if(e.target===modal) modal.remove(); };
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#7c3aed;color:#fff;padding:14px 18px">'+
      '<div style="font-size:16px;font-weight:800">🔗 Vincular con producto del SCI</div>'+
      '<div style="font-size:12px;opacity:.9">El enlace se guarda por código, así sobrevive si luego se corrige la descripción.</div>'+
    '</div>'+
    '<div style="padding:18px">'+
      '<div style="font-size:12px;color:#666;margin-bottom:4px">Nombre en el Cuaderno</div>'+
      '<div style="background:#fef3c7;color:#92600a;padding:8px 12px;border-radius:7px;font-weight:700;font-size:14px;margin-bottom:14px">📒 '+escapeHtml(nombre)+'</div>'+
      '<div style="font-size:12px;color:#666;margin-bottom:4px">Producto del SCI</div>'+
      '<input type="text" id="cc-vinc-buscar" placeholder="Filtrar por nombre o código..." '+
        'style="width:100%;padding:9px 11px;border:1px solid #cdd5df;border-radius:7px;font-size:13px;margin-bottom:8px;box-sizing:border-box">'+
      '<select id="cc-vinc-sel" size="8" style="width:100%;padding:6px;border:1px solid #cdd5df;border-radius:7px;font-size:13px;box-sizing:border-box">'+opciones+'</select>'+
      '<div style="font-size:11px;color:#888;margin-top:8px">Los porcentajes son solo una sugerencia. Verifique que sea realmente el mismo producto antes de guardar.</div>'+
    '</div>'+
    '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
      '<button onclick="document.getElementById(\'cc-vinculo-modal\').remove()" style="padding:10px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
      '<button id="cc-vinc-ok" style="padding:10px 18px;border:none;border-radius:9px;background:#7c3aed;color:#fff;cursor:pointer;font-size:14px;font-weight:700">Vincular</button>'+
    '</div></div>';
  document.body.appendChild(modal);

  // Filtro en vivo del listado
  var buscar=document.getElementById('cc-vinc-buscar');
  var sel=document.getElementById('cc-vinc-sel');
  if(buscar&&sel){
    buscar.oninput=function(){
      var q=(this.value||'').toLowerCase();
      Array.prototype.forEach.call(sel.options,function(o){
        o.style.display = (!q || o.textContent.toLowerCase().indexOf(q)>=0) ? '' : 'none';
      });
    };
  }
  document.getElementById('cc-vinc-ok').onclick=function(){
    var cod=sel?sel.value:'';
    if(!cod){ if(typeof toast==='function') toast('Seleccione','Elija un producto del SCI','error'); return; }
    if(guardarVinculoSCI(nombre, cod)){
      modal.remove();
      if(typeof renderCompraUrgente==='function') renderCompraUrgente();
      abrirResumenBajaConfirmaciones();
      if(typeof toast==='function') toast('Vinculado', nombre+' → '+cod, 'success');
    }
  };
}
try{ window.abrirVinculoSCI=abrirVinculoSCI; }catch(e){}

// Quita el vínculo manual y vuelve al emparejamiento por nombre.
function desvincularSCI(idx, prIdx){
  var c=(S.confirmaciones||[])[idx];
  var pr=c?((c.productosReales||[])[prIdx]):null;
  var nombre=pr?(pr.nombre||''):'';
  if(!nombre) return;
  if(guardarVinculoSCI(nombre, '')){
    if(typeof renderCompraUrgente==='function') renderCompraUrgente();
    abrirResumenBajaConfirmaciones();
    if(typeof toast==='function') toast('Vínculo quitado', nombre, 'info');
  }
}
try{ window.desvincularSCI=desvincularSCI; }catch(e){}
function bajaConfirmacionEnBodega(ordenId, idx, codigoSCI, cantidad){
  if(typeof can==='function' && !can('movimientos.crear')){
    if(typeof toast==='function') toast('Sin permiso','Necesita permiso para crear movimientos','error');
    return;
  }
  var prod=getProduct(codigoSCI);
  if(!prod){ if(typeof toast==='function') toast('No encontrado','El producto no está en el catálogo del SCI','error'); return; }
  // Aviso de stock: comparar la cantidad a rebajar con el saldo disponible.
  var stockTotal = (typeof getStockTotal==='function') ? getStockTotal(codigoSCI) : 0;
  var cant = parseFloat(cantidad)||0;
  function continuar(){
    var m=document.getElementById('cc-baja-resumen-modal'); if(m) m.remove();
    // Navegar a Salidas (esto crea un movDraft limpio) y LUEGO sobreescribirlo.
    if(typeof navigate==='function') navigate('salidas');
    movDraft={
      tipo:'SAL', editId:null,
      fecha:new Date().toISOString().slice(0,10),
      bodegaId:'', tipoMovimiento:'CONSUMO CC',
      tipoDoc:'', numeroDoc:'', fechaVencDoc:'',
      proveedorCodigo:'', proveedorNombre:'',
      clienteCodigo:'', clienteNombre:'',
      centroCosto:'',
      bodegaDestinoId:'',
      documento:'', proveedor:'', destino:'',
      observaciones:'Baja por aplicación (Cuaderno de Campo)',
      lineas:[{ codigoInterno:codigoSCI, descripcion:prod.descripcion, cantidad:cant, costo:0 }],
      _origenConfirmacion:{ ordenId:String(ordenId), idx:String(idx), productoNombre:prod.descripcion }
    };
    // Re-renderizar el formulario con el draft ya cargado.
    var main=document.getElementById('mainContent');
    if(main && typeof _renderMovForm==='function') _renderMovForm(main);
    var topT=document.getElementById('topTitle'); if(topT) topT.textContent='Nueva Salida de Bodega · Consumo CC';
    if(typeof toast==='function') toast('Salida preparada','Seleccione bodega y centro de costo, luego guarde','success');
  }
  // Si el stock total disponible es menor que lo que se quiere rebajar, advertir.
  if(stockTotal < cant){
    var msg='El saldo en bodega ('+stockTotal.toLocaleString('es-CL',{maximumFractionDigits:3})+') es INFERIOR a la cantidad a dar de baja ('+cant.toLocaleString('es-CL',{maximumFractionDigits:3})+'). '+
            'Si continúa, el stock podría quedar negativo. ¿Desea continuar de todos modos?';
    if(typeof confirmDialog==='function'){
      confirmDialog('⚠️ Saldo insuficiente en bodega', msg, continuar, 'Continuar igual', true);
    } else {
      if(confirm(msg)) continuar();
    }
    return;
  }
  continuar();
}

// Normaliza un nombre para comparar: minúsculas, sin acentos, sin signos de
// puntuación, espacios colapsados. Diferencias triviales (acentos, espacios,
// mayúsculas, guiones) se consideran el mismo producto automáticamente.
function _normNombreProd(s){
  return String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // quitar acentos
    .replace(/[^a-z0-9 ]+/g,' ')                        // signos → espacio
    .replace(/\s+/g,' ')                                 // colapsar espacios
    .trim();
}
// Distancia de Levenshtein (para detectar nombres "parecidos" pero no iguales).
function _levenshtein(a,b){
  a=String(a||''); b=String(b||'');
  var m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  var prev=[], cur=[], i, j;
  for(j=0;j<=n;j++) prev[j]=j;
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      var cost=a.charAt(i-1)===b.charAt(j-1)?0:1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
    }
    for(j=0;j<=n;j++) prev[j]=cur[j];
  }
  return cur[n];
}
// Similitud 0..1 entre dos nombres. Considera el nombre completo y también la
// primera palabra (la "raíz" comercial), para detectar casos como
// "Domine" ↔ "Dodine 65 WP" donde difieren en sufijos y una letra.
function _similitudNombre(a,b){
  var na=_normNombreProd(a), nb=_normNombreProd(b);
  if(!na||!nb) return 0;
  if(na===nb) return 1;
  // uno contiene al otro como palabra inicial (ej. "dodine" en "dodine 65 wp")
  if(na.indexOf(nb)>=0 || nb.indexOf(na)>=0) return 0.92;
  // comparar por nombre completo
  function simStr(x,y){ var d=_levenshtein(x,y); var ml=Math.max(x.length,y.length); return ml?(1-(d/ml)):0; }
  var simFull=simStr(na,nb);
  // comparar por primera palabra (raíz comercial)
  var ra=na.split(' ')[0], rb=nb.split(' ')[0];
  var simRaiz=simStr(ra,rb);
  // si las raíces son muy parecidas (ej. "domine"↔"dodine" = 0.83), pesa fuerte
  return Math.max(simFull, simRaiz*0.95);
}

// ── Migración: productos del Cuaderno (S.productos) → fichas del SCI ──
// Diferencias triviales (acentos, espacios, mayúsculas) se resuelven solas.
// Para nombres PARECIDOS pero no idénticos, pregunta antes de duplicar.
async function migrarProductosCuadernoASCI(){
  if(typeof can==='function' && !can('productos.crear')){
    if(typeof toast==='function') toast('Sin permiso','Necesita permiso para crear productos','error');
    return;
  }
  var viejos = (typeof S!=='undefined' && Array.isArray(S.productos)) ? S.productos : [];
  if(!viejos.length){
    if(typeof toast==='function') toast('Sin productos','No hay productos en el catálogo del Cuaderno para migrar','info');
    return;
  }
  var scis=(STATE.cache.products||[]);
  // Clasificar cada producto del Cuaderno
  var aCrear=[], aCompletar=[], dudosos=[];
  viejos.forEach(function(v){
    var nombre=(v.nombre||'').trim();
    if(!nombre) return;
    // 1) coincidencia exacta tras normalizar → completar
    var exacto=scis.find(function(p){ return _normNombreProd(p.descripcion)===_normNombreProd(nombre); });
    if(exacto){ aCompletar.push({v:v, sci:exacto}); return; }
    // 2) buscar el más parecido por encima de un umbral
    var mejor=null, mejorSim=0;
    scis.forEach(function(p){
      var sim=_similitudNombre(nombre, p.descripcion);
      if(sim>mejorSim){ mejorSim=sim; mejor=p; }
    });
    if(mejor && mejorSim>=0.75){ dudosos.push({v:v, sci:mejor, sim:mejorSim}); }
    else { aCrear.push(v); }
  });

  // Si hay dudosos, mostrar un modal de revisión ANTES de ejecutar.
  if(dudosos.length){
    _mostrarRevisionMigracion(aCrear, aCompletar, dudosos);
  } else {
    await _ejecutarMigracion(aCrear, aCompletar);
  }
}

// Modal de revisión: por cada producto dudoso, el usuario decide si es el mismo
// (vincular y completar) o uno distinto (crear nuevo).
function _mostrarRevisionMigracion(aCrear, aCompletar, dudosos){
  var prev=document.getElementById('cc-migra-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='cc-migra-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10007;display:flex;align-items:center;justify-content:center;padding:16px';
  var filas=dudosos.map(function(d,i){
    return '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;margin-bottom:10px">'+
      '<div style="font-size:12px;color:#666;margin-bottom:6px">¿Son el mismo producto?</div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px;margin-bottom:8px">'+
        '<span style="background:#fef3c7;color:#92600a;padding:3px 8px;border-radius:6px;font-weight:700">📒 Cuaderno: '+escapeHtml(d.v.nombre||'')+'</span>'+
        '<span style="color:#888">↔</span>'+
        '<span style="background:#e0e7ff;color:#3730a3;padding:3px 8px;border-radius:6px;font-weight:700">📦 SCI: '+escapeHtml(d.sci.descripcion||'')+'</span>'+
        '<span style="font-size:11px;color:#999">('+Math.round(d.sim*100)+'% parecido)</span>'+
      '</div>'+
      '<div style="display:flex;gap:8px">'+
        '<label style="flex:1;display:flex;align-items:center;gap:6px;font-size:12px;padding:7px 10px;border:1px solid #ddd;border-radius:7px;cursor:pointer;background:#f0fdf4"><input type="radio" name="migra-d-'+i+'" value="mismo" checked> Es el mismo (completar SCI)</label>'+
        '<label style="flex:1;display:flex;align-items:center;gap:6px;font-size:12px;padding:7px 10px;border:1px solid #ddd;border-radius:7px;cursor:pointer;background:#fef2f2"><input type="radio" name="migra-d-'+i+'" value="distinto"> Es distinto (crear nuevo)</label>'+
      '</div>'+
    '</div>';
  }).join('');
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">'+
    '<div style="background:#1565c0;color:#fff;padding:14px 18px">'+
      '<div style="font-size:16px;font-weight:800">🔍 Revisar productos parecidos</div>'+
      '<div style="font-size:12px;opacity:.9">'+aCrear.length+' nuevos · '+aCompletar.length+' a completar · '+dudosos.length+' por revisar</div>'+
    '</div>'+
    '<div style="padding:18px;overflow:auto;flex:1">'+
      '<div style="font-size:12px;color:#555;margin-bottom:12px">Estos nombres se parecen pero no son idénticos. Indique cuáles son el mismo producto (para no duplicar) y cuáles son distintos.</div>'+
      filas+
    '</div>'+
    '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
      '<button onclick="document.getElementById(\'cc-migra-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
      '<button id="cc-migra-confirm" style="padding:11px 18px;border:none;border-radius:9px;background:#1565c0;color:#fff;cursor:pointer;font-size:14px;font-weight:700">Migrar</button>'+
    '</div></div>';
  document.body.appendChild(modal);
  // Guardar el contexto para el confirm
  window._migraCtx={ aCrear:aCrear, aCompletar:aCompletar, dudosos:dudosos };
  document.getElementById('cc-migra-confirm').onclick=async function(){
    var ctx=window._migraCtx;
    var crear=ctx.aCrear.slice();
    var completar=ctx.aCompletar.slice();
    ctx.dudosos.forEach(function(d,i){
      var sel=document.querySelector('input[name="migra-d-'+i+'"]:checked');
      var val=sel?sel.value:'mismo';
      if(val==='mismo') completar.push({v:d.v, sci:d.sci});
      else crear.push(d.v);
    });
    document.getElementById('cc-migra-modal').remove();
    await _ejecutarMigracion(crear, completar);
  };
}

// Ejecuta la migración con las listas ya resueltas.
async function _ejecutarMigracion(aCrear, aCompletar){
  var grupos=(STATE.cache.groups||[]).map(function(g){ return g.nombre; });
  var grupoDef = grupos.length ? grupos[0] : 'General';
  var tipos=(STATE.cache.productTypes||[]).filter(function(t){ return t.activo!==false; }).map(function(t){ return t.nombre; });
  var tipoDef = tipos.length ? tipos[0] : 'Insumo agrícola';
  var creados=0, completados=0;
  // Completar existentes
  for(var i=0;i<aCompletar.length;i++){
    var v=aCompletar[i].v, ex=aCompletar[i].sci;
    var dosisNum=(v.dosis!=null && String(v.dosis).trim()!=='')?(parseFloat(String(v.dosis).replace(',','.'))||null):null;
    var cambio=false;
    if((!ex.ccTipo||ex.ccTipo==='') && v.tipo){ ex.ccTipo=v.tipo; cambio=true; }
    if((ex.ccIngredienteActivo==null||ex.ccIngredienteActivo==='') && v.ingredienteActivo){ ex.ccIngredienteActivo=v.ingredienteActivo; cambio=true; }
    if((ex.ccObjetivo==null||ex.ccObjetivo==='') && v.objetivo){ ex.ccObjetivo=v.objetivo; cambio=true; }
    if((ex.ccDosis==null) && dosisNum!=null){ ex.ccDosis=dosisNum; cambio=true; }
    if((!ex.ccUnidad||ex.ccUnidad==='') && v.unidad){ ex.ccUnidad=v.unidad; cambio=true; }
    if(cambio){ ex.modificado=new Date().toISOString(); await dbPut('products',ex); completados++; }
  }
  // Crear nuevos
  for(var k=0;k<aCrear.length;k++){
    var nv=aCrear[k];
    var nombre=(nv.nombre||'').trim(); if(!nombre) continue;
    var dn=(nv.dosis!=null && String(nv.dosis).trim()!=='')?(parseFloat(String(nv.dosis).replace(',','.'))||null):null;
    var cod=await nextProductCode();
    var np={
      codigoInterno:cod, codigoEAN:'', descripcion:nombre,
      unidadMedida:'UN', tipoProducto:tipoDef, grupo:grupoDef, subGrupo:'',
      manejaAtributos:false, inventariable:true,
      aplicaIVA:true, aplicaIEC:false, aplicaILA:false,
      ccTipo:nv.tipo||'', ccIngredienteActivo:nv.ingredienteActivo||'', ccObjetivo:nv.objetivo||'',
      ccDosis:dn, ccUnidad:nv.unidad||'',
      stockMinimo:0, activo:true, creado:new Date().toISOString(), _migradoDeCuaderno:true
    };
    await dbPut('products',np);
    creados++;
  }
  if(typeof reloadCache==='function') await reloadCache();
  if(typeof renderProdList==='function') renderProdList();
  var msg='Migración completada: '+creados+' creados, '+completados+' completados.';
  if(typeof confirmDialog==='function'){
    confirmDialog('✓ Productos migrados', msg+' Ahora aparecen en el catálogo del SCI y en las órdenes.', function(){}, 'Entendido', false);
  } else if(typeof toast==='function'){
    toast('Migración completada', msg, 'success');
  }
}

function renderResumen(){
  if(typeof renderCompraUrgente==='function') renderCompraUrgente();
  // Mostrar la tarjeta de baja de bodega solo si el usuario tiene permiso.
  try{
    var cardBaja=document.getElementById('cc-card-baja-bodega');
    if(cardBaja) cardBaja.style.display=((typeof can==='function')&&can('movimientos.crear'))?'':'none';
  }catch(e){}
  renderBkAlert();
  var tHas=S.panos.reduce(function(s,p){ return s+p.hectareas; },0);
  var nConfirm=(S.confirmaciones||[]).length;
  document.getElementById('cc-stats').innerHTML=[
    {n:S.panos.length,l:'Paños activos'},{n:tHas.toFixed(1)+' há',l:'Superficie total'},
    {n:nConfirm,l:'Aplicaciones confirmadas',click:nConfirm>0?'verResumenAplicaciones()':''},{n:S.ordenes.length,l:'Órdenes emitidas'}
  ].map(function(s){
    var cursor=s.click?';cursor:pointer':'';
    var onclk=s.click?(' onclick="'+s.click+'"'):'';
    var flecha=s.click?' <span style="color:#1565c0;font-size:13px">›</span>':'';
    return '<div class="cc-stat-c" style="position:relative'+cursor+'"'+onclk+'><div class="cc-n">'+s.n+'</div><div class="cc-l">'+s.l+flecha+'</div></div>';
  }).join('');

  // Función para calcular plantas (valor manual o estimado de densidad × ha)
  function _plantasDe(pano){
    if(pano.plantas && pano.plantas>0) return Math.round(pano.plantas);
    return Math.round((pano.densidad||0)*(pano.hectareas||0));
  }
  var ry=document.getElementById('cc-res-years');
  ry.innerHTML=['2018','2024','2026'].map(function(y){
    var todosDelAnio=S.panos.filter(function(p){ return p.anio===y; });
    var ps=(typeof ordenarPanosPadreHijo==='function')?ordenarPanosPadreHijo(todosDelAnio):todosDelAnio;
    // Mostrar solo paños PRINCIPALES (los polinizantes se integran dentro de su padre)
    ps = ps.filter(function(p){ return (p.tipo||'Productivo')!=='Polinizante'; });
    if(!ps.length) return '';
    return '<div class="cc-card" style="margin-bottom:0"><div class="cc-card-ttl">\u{1F331} Plantaci\u00f3n '+y+'</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px">'+ps.map(function(p){
        // IDs del grupo: principal + polinizantes (las aplicaciones cubren todo el cuartel)
        var hijosP=S.panos.filter(function(x){ return (x.tipo||'Productivo')==='Polinizante' && String(x.panoPadre)===String(p.id); });
        var idsGrupo=[String(p.id)].concat(hijosP.map(function(h){ return String(h.id); }));
        // Contar APLICACIONES CONFIRMADAS que incluyan cualquier paño del grupo
        var confsPano=(S.confirmaciones||[]).filter(function(c){
          return (c.panoIds||[]).some(function(pid){ return idsGrupo.indexOf(String(pid))>=0; });
        });
        var r=confsPano.length;
        var propio=_plantasDe(p);
        var hijos=hijosP;
        var plantasHijos=hijos.reduce(function(s,h){ return s+_plantasDe(h); },0);
        var total=propio+plantasHijos;
        // Superficie total del paño = hectáreas del principal + las de sus polinizantes
        var hasTotal=(parseFloat(p.hectareas)||0)+hijos.reduce(function(s,h){ return s+(parseFloat(h.hectareas)||0); },0);
        var riegoTotal=(parseFloat(p.has_riego)||0)+hijos.reduce(function(s,h){ return s+(parseFloat(h.has_riego)||0); },0);
        var detVar='<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;font-size:11.5px">'+
          '<div style="display:flex;justify-content:space-between"><span style="color:#0a6ed1;font-weight:700">\u{1F333} '+escapeHtml(p.variedad||'Principal')+'</span><strong style="color:#0a6ed1">'+propio.toLocaleString('es-CL')+'</strong></div>';
        hijos.forEach(function(h){
          detVar+='<div style="display:flex;justify-content:space-between"><span style="color:#92600a;font-weight:700">\u{1F41D} '+escapeHtml(h.variedad||h.nombre)+'</span><strong style="color:#92600a">'+_plantasDe(h).toLocaleString('es-CL')+'</strong></div>';
        });
        if(plantasHijos>0){
          detVar+='<div style="display:flex;justify-content:space-between;border-top:1px dashed #ddd;padding-top:3px;margin-top:1px"><span style="color:#354a5f;font-weight:800">\u03a3 Total</span><strong style="color:#354a5f">'+total.toLocaleString('es-CL')+'</strong></div>';
        }
        detVar+='</div>';
        return '<div class="cc-res-pano" style="flex:1;min-width:170px;background:#fafafa;border-radius:7px;padding:10px;border-left:4px solid '+p.color+'">'+
          '<div style="font-weight:700;font-size:13px;line-height:1.2">'+escapeHtml(p.nombre)+'</div>'+
          '<div style="margin-top:5px;font-size:11px;display:flex;gap:8px;flex-wrap:wrap;color:#555">'+
            '<span style="font-weight:700">\u{1F331} '+(Math.round(hasTotal*100)/100)+' h\u00e1</span>'+
            '<span style="color:#1a5a8a;font-weight:700">\u{1F4A7} '+(Math.round(riegoTotal*100)/100)+'</span>'+
            '<span style="color:#5a3a8a;font-weight:700">\u{1F33F} '+(p.densidad||0)+'</span>'+
            '</div>'+
          detVar+'</div>';
      }).join('')+'</div></div>';
  }).join('');

  var rec=[].concat(S.registros).sort(function(a,b){ return b.fecha.localeCompare(a.fecha); }).slice(0,8);
  var tb=document.getElementById('cc-recent-tbody');
  if(!rec.length){ tb.innerHTML='<tr><td colspan="7" class="cc-no-data"><span>📋</span>Sin aplicaciones aún</td></tr>'; return; }
  tb.innerHTML=rec.map(function(r){
    var p=getPano(r.panoId);
    return '<tr><td style="font-weight:700;white-space:nowrap">'+r.fecha+'</td>'+
      '<td><span class="cc-pano-tag"><span class="cc-pano-dot" style="background:'+(p&&p.color||'#888')+'"></span>'+(p&&p.nombre||'—')+'</span></td>'+
      '<td style="font-style:italic;color:#888">'+(p&&p.variedad||'—')+'</td>'+
      '<td>'+badge(r.tipo)+'</td>'+
      '<td style="font-weight:700">'+r.producto+'</td>'+
      '<td style="white-space:nowrap">'+r.dosis+' '+r.unidad+'</td>'+
      '<td style="font-size:12px;color:#888">'+r.metodo+'</td></tr>';
  }).join('');
}

// ══ REGISTRO ══
var selPanosReg=[];
function renderChipsReg(){
  var el=document.getElementById('cc-reg-chips'); if(!el) return;
  el.innerHTML=''; selPanosReg=[];
  ['2018','2024','2026'].forEach(function(y){
    var psAnio=S.panos.filter(function(p){ return p.anio===y; });
    var productivos=psAnio.filter(function(p){ return (p.tipo||'Productivo')!=='Polinizante'; });
    var polinizantes=psAnio.filter(function(p){ return (p.tipo||'Productivo')==='Polinizante'; });
    var huerfanos=polinizantes.filter(function(pol){ return !productivos.some(function(prod){ return String(pol.panoPadre)===String(prod.id); }); });
    var chips=productivos.concat(huerfanos);
    if(!chips.length) return;
    var lbl=document.createElement('div'); lbl.className='cc-grp-lbl'; lbl.innerHTML='🌱 Plantación '+y;
    el.appendChild(lbl);
    var div=document.createElement('div'); div.className='cc-chips';
    chips.forEach(function(p){
      var esPolin=(p.tipo||'Productivo')==='Polinizante';
      var grupoIds=[p.id]; var hijosPol=[];
      if(!esPolin){ hijosPol=polinizantes.filter(function(pol){ return String(pol.panoPadre)===String(p.id); }); hijosPol.forEach(function(h){ grupoIds.push(h.id); }); }
      var haGrupo=grupoIds.reduce(function(s,gid){ var px=getPano(gid); return s+(px?(parseFloat(px.hectareas)||0):0); },0);
      var btn=document.createElement('button'); btn.className='cc-chip'; btn.dataset.id=p.id; btn.dataset.grupo=grupoIds.join(',');
      var polInfo=hijosPol.length?' <span style="background:#fef3c7;color:#92600a;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">🐝 +'+hijosPol.length+' polin.</span>':'';
      var polBadge=esPolin?' <span style="background:#fef3c7;color:#92600a;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">🐝 POL</span>':'';
      btn.innerHTML='<span class="cc-cn">'+p.nombre+polBadge+polInfo+'</span><span class="cc-cs">'+p.variedad+' · 🌱'+(Math.round(haGrupo*100)/100)+' há'+(hijosPol.length?' total':'')+' · 🌿'+(p.densidad||0)+' pl/há</span>';
      btn.onclick=function(){ toggleRegChip(btn,p); };
      div.appendChild(btn);
    });
    el.appendChild(div);
  });
}
function toggleRegChip(btn,p){
  var grupo=(btn.dataset.grupo||p.id).split(',');
  var yaSel=selPanosReg.indexOf(p.id)>=0;
  if(yaSel){
    grupo.forEach(function(gid){ var i=selPanosReg.indexOf(gid); if(i>=0) selPanosReg.splice(i,1); });
    btn.classList.remove('cc-sel'); btn.style.cssText='';
  } else {
    grupo.forEach(function(gid){ if(selPanosReg.indexOf(gid)<0) selPanosReg.push(gid); });
    btn.classList.add('cc-sel'); btn.style.background=p.color+'22'; btn.style.borderColor=p.color;
  }
  calcRegTotal();
}
function calcRegTotal(){
  var el=document.getElementById('cc-reg-info'); if(!el) return;
  if(!selPanosReg.length){ el.textContent=''; return; }
  var tHa=selPanosReg.reduce(function(s,id){ var p=getPano(id); return s+(p?p.hectareas:0); },0);
  // Contar cuarteles (grupos), no paños sueltos.
  var cuarteles={}; selPanosReg.forEach(function(id){ var p=getPano(id); if(p){ var k=(p.tipo||'Productivo')==='Polinizante'?(p.panoPadre||id):id; cuarteles[k]=1; } });
  el.textContent='✓ '+Object.keys(cuarteles).length+' cuartel(es) · '+tHa.toFixed(2)+' há';
}
// Catálogo unificado de productos: ahora vive en el SCI (STATE.cache.products).
// Esta función lo expone en el formato que el Cuaderno de Campo espera (nombre,
// tipo, dosis, unidad, etc.), mapeando los campos agronómicos (cc*) de la ficha.
// Si el SCI no está disponible, cae de vuelta a S.productos (compatibilidad).
function _getProductosCatalogo(){
  try{
    if(typeof STATE!=='undefined' && STATE.cache && Array.isArray(STATE.cache.products) && STATE.cache.products.length){
      return STATE.cache.products
        .filter(function(p){ return p && p.activo!==false; })
        .map(function(p){
          return {
            nombre: p.descripcion || '',
            tipo: p.ccTipo || '',
            ingredienteActivo: p.ccIngredienteActivo || '',
            objetivo: p.ccObjetivo || '',
            unidad: p.ccUnidad || '',
            dosis: (p.ccDosis!=null ? p.ccDosis : ''),
            codigoInterno: p.codigoInterno || ''
          };
        });
    }
  }catch(e){}
  // Respaldo: catálogo antiguo del Cuaderno
  return (typeof S!=='undefined' && Array.isArray(S.productos)) ? S.productos : [];
}

function showAC(inputId,listId){
  var q=document.getElementById(inputId).value.toLowerCase();
  var list=document.getElementById(listId);
  var catalogo=_getProductosCatalogo();
  var prods=catalogo.filter(function(p){
    if(!q) return true;
    return (p.nombre||'').toLowerCase().includes(q)
        || (p.tipo||'').toLowerCase().includes(q)
        || (p.ingredienteActivo||'').toLowerCase().includes(q);
  }).slice(0,10);
  // Enlace para crear el producto en el SCI cuando no existe (si hay permiso).
  var puedeCrear = (typeof can==='function') && can('productos.crear');
  var qTrim = (document.getElementById(inputId).value||'').trim();
  function linkCrear(){
    if(!puedeCrear || !qTrim) return '';
    var nombreSafe = qTrim.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    return '<div class="cc-ac-item" style="border-top:1px solid #e3e8ee;background:#f0f7ff;color:#1565c0;font-weight:700" '+
      'onmousedown="ccCrearProductoSCI(\''+nombreSafe+'\',\''+inputId+'\',\''+listId+'\')">'+
      '➕ Crear «'+escapeHtml(qTrim)+'» en el SCI<div class="cc-ac-sub" style="color:#5a7fa6;font-weight:400">No está en el catálogo. Crear ficha de producto.</div></div>';
  }
  if(!prods.length){
    var lk=linkCrear();
    if(lk){ list.innerHTML=lk; list.style.display=''; }
    else { list.style.display='none'; }
    return;
  }
  list.innerHTML=prods.map(function(p){
    var nombreSafe=(p.nombre||'').replace(/'/g,'');
    return '<div class="cc-ac-item" onmousedown="selProd(\''+inputId+'\',\''+listId+'\',\''+nombreSafe+'\',\''+(p.unidad||'')+'\',\''+(p.dosis||'')+'\')">'+
      escapeHtml(p.nombre||'')+'<div class="cc-ac-sub">'+escapeHtml(p.tipo||'')+(p.ingredienteActivo?' · '+escapeHtml(p.ingredienteActivo):'')+(p.dosis?' · Dosis: '+p.dosis+' '+(p.unidad||''):'')+'</div></div>';
  }).join('') + linkCrear();
  list.style.display='';
}
// Abre el formulario de producto del SCI con el nombre prellenado, desde la
// búsqueda de una orden. Al guardar, el catálogo se actualiza y el producto
// queda disponible para seleccionarlo.
function ccCrearProductoSCI(nombre, inputId, listId){
  if(typeof can==='function' && !can('productos.crear')){
    if(typeof toast==='function') toast('Sin permiso','No tiene permiso para crear productos','error');
    return;
  }
  var lst=document.getElementById(listId); if(lst) lst.style.display='none';
  if(typeof openProductForm==='function'){
    openProductForm(null, { prefilledDesc: nombre, fromOrden:true, ordenInputId:inputId });
  } else {
    if(typeof toast==='function') toast('No disponible','El formulario de productos no está disponible','error');
  }
}
function selProd(iid,lid,nombre,unidad,dosis){
  var inp = document.getElementById(iid);
  if(inp) inp.value = nombre;
  // Normalizar: la dosis puede llegar como número, string, '' o 0.
  var dosisStr = (dosis===null || dosis===undefined) ? '' : String(dosis);
  var tieneDosis = dosisStr!=='' && dosisStr!=='null' && dosisStr!=='undefined';
  var tieneUnidad = unidad!==null && unidad!==undefined && String(unidad)!=='' && String(unidad)!=='undefined';
  // Helpers internos
  function setSelectVal(elId, val){
    var s = document.getElementById(elId); if(!s) return false;
    for(var i=0;i<s.options.length;i++){ if(s.options[i].value===val){ s.selectedIndex=i; return true; } }
    return false;
  }
  function setVal(elId, val){ var el = document.getElementById(elId); if(el){ el.value = val; return true; } return false; }

  if(iid === 'cc-f-prod'){
    // Registro de aplicación
    if(tieneUnidad) setVal('cc-f-unidad', unidad);
    if(tieneDosis)  setVal('cc-f-dosis',  dosisStr);
    if(typeof calcRegTotal==='function') calcRegTotal();
  } else if(iid === 'cc-o-prod'){
    // Producto principal de orden
    if(tieneUnidad) setSelectVal('cc-o-unidad', unidad);
    if(tieneDosis)  setVal('cc-o-dosis', dosisStr);
    if(typeof calcDist==='function') calcDist();
  } else if(iid.indexOf('cc-o-mix-prod-') === 0){
    // Producto en mezcla en emisión: cc-o-mix-prod-N
    var idxM = iid.substring('cc-o-mix-prod-'.length);
    if(tieneUnidad) setSelectVal('cc-o-mix-unidad-' + idxM, unidad);
    if(tieneDosis)  setVal('cc-o-mix-dosis-' + idxM, dosisStr);
    if(typeof _syncMixProds==='function') _syncMixProds();
    if(typeof calcDist==='function') calcDist();
  } else if(iid.indexOf('cc-eo-p-n-') === 0){
    // Producto en editor de orden: cc-eo-p-n-N
    var idxE = iid.substring('cc-eo-p-n-'.length);
    if(tieneUnidad) setSelectVal('cc-eo-p-u-' + idxE, unidad);
    if(tieneDosis)  setVal('cc-eo-p-d-' + idxE, dosisStr);
    if(typeof _syncEoProds==='function') _syncEoProds();
  }
  var listEl = document.getElementById(lid);
  if(listEl) listEl.style.display = 'none';
}
function guardarRegistro(){
  var fecha=document.getElementById('cc-f-fecha').value;
  var tipo=document.getElementById('cc-f-tipo').value;
  var prod=document.getElementById('cc-f-prod').value.trim();
  var dosis=document.getElementById('cc-f-dosis').value;
  var met=document.getElementById('cc-f-metodo').value;
  var err=document.getElementById('cc-f-err');
  if(!fecha||!tipo||!prod||!dosis||!met||!selPanosReg.length){
    err.style.display=''; err.textContent='Completa todos los campos obligatorios y selecciona al menos un pano.'; return;
  }
  err.style.display='none';
  selPanosReg.forEach(function(pid,i){
    S.registros.push({ id:Date.now()+i, fecha:fecha, panoId:pid, tipo:tipo, producto:prod,
      dosis:dosis, unidad:document.getElementById('cc-f-unidad').value,
      metodo:met, operador:document.getElementById('cc-f-op').value,
      obs:document.getElementById('cc-f-obs').value, lote:document.getElementById('cc-f-lote').value });
  });
  save(); renderHeader();
  limpiarReg();
  showNotice('Aplicacion registrada en '+selPanosReg.length+' pano(s).','ok');
  // Navigate to historial
  try{
    var histBtn = document.querySelector('.nav-btn[onclick*="historial"]');
    if(histBtn){ showTab('historial', histBtn); }
    else {
      document.querySelectorAll('.cc-tab-c').forEach(function(el){ el.classList.remove('cc-act'); });
      document.getElementById('cc-tab-historial').classList.add('cc-act');
      renderHist(); updateFiltroSelect();
    }
  } catch(navErr){
    showNotice('Registro guardado. Actualiza la pagina para ver el historial.','ok');
  }
}
function limpiarReg(){
  ['cc-f-fecha','cc-f-tipo','cc-f-prod','cc-f-dosis','cc-f-metodo','cc-f-op','cc-f-obs','cc-f-lote'].forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
  });
  document.getElementById('cc-f-fecha').value=today();
  document.getElementById('cc-f-unidad').value='L/ha';
  selPanosReg=[];
  document.querySelectorAll('#cc-reg-chips .cc-chip').forEach(function(b){ b.classList.remove('cc-sel'); b.style.cssText=''; });
  document.getElementById('cc-reg-info').textContent='';
  document.getElementById('cc-f-err').style.display='none';
}

// ══ HISTORIAL ══
function updateFiltroSelect(){
  var sel=document.getElementById('cc-fl-pano'); if(!sel) return;
  var cur=sel.value;
  sel.innerHTML='<option value="">Todos</option>'+S.panos.map(function(p){ return '<option value="'+p.id+'"'+(p.id==cur?' selected':'')+'>'+p.nombre+' ('+p.variedad+')</option>'; }).join('');
}
function renderHist(){
  var anio=document.getElementById('cc-fl-anio').value;
  var pid=document.getElementById('cc-fl-pano').value;
  var tipo=document.getElementById('cc-fl-tipo').value;
  var q=document.getElementById('cc-fl-q').value.toLowerCase();
  var recs=[].concat(S.registros).sort(function(a,b){ return b.fecha.localeCompare(a.fecha); }).filter(function(r){
    var p=getPano(r.panoId);
    if(anio && p && p.anio!==anio) return false;
    if(pid && r.panoId!=pid) return false;
    if(tipo && r.tipo!==tipo) return false;
    if(q && !r.producto.toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById('cc-fl-cnt').textContent=recs.length+' registro(s)';
  var tb=document.getElementById('cc-hist-tbody');
  if(!recs.length){ tb.innerHTML='<tr><td colspan="5" class="cc-no-data"><span>📋</span>Sin registros</td></tr>'; return; }
  tb.innerHTML=recs.map(function(r){
    var p=getPano(r.panoId);
    return '<tr style="cursor:pointer" onclick="verRegDetalle('+r.id+')">'+
      '<td style="font-weight:700;white-space:nowrap">'+r.fecha+'</td>'+
      '<td><span class="cc-pano-tag"><span class="cc-pano-dot" style="background:'+(p&&p.color||'#888')+'"></span>'+(p&&p.nombre||'—')+'</span></td>'+
      '<td>'+badge(r.tipo)+'</td>'+
      '<td style="font-weight:700">'+r.producto+'</td>'+
      '<td><button class="cc-btn-del" onclick="event.stopPropagation();delReg('+r.id+')">✕</button></td></tr>';
  }).join('');
}
function verRegDetalle(id){
  var r=(S.registros||[]).find(function(x){ return x.id==id; });
  if(!r){ return; }
  var p=getPano(r.panoId);
  function fila(lbl,val){ return '<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #f0f0f0"><span style="color:#888;font-size:13px">'+lbl+'</span><span style="font-weight:600;text-align:right">'+(val||'—')+'</span></div>'; }
  var body='<div style="padding:2px 2px 6px">'+
    fila('Fecha', r.fecha)+
    fila('Paño', (p&&p.nombre||'—'))+
    fila('Variedad', (p&&p.variedad||'—'))+
    fila('Año', (p&&p.anio||'—'))+
    fila('Tipo', r.tipo)+
    fila('Producto', r.producto)+
    fila('Dosis', (r.dosis||'')+' '+(r.unidad||''))+
    fila('Método', r.metodo)+
    fila('Operador', r.operador)+
    fila('Lote', r.lote)+
    fila('Observación', r.obs)+
    '</div>';
  var ov=document.createElement('div');
  ov.id='cc-reg-detalle-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.innerHTML='<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff">'+
      '<strong style="font-size:16px">📋 Detalle del registro</strong>'+
      '<button onclick="document.getElementById(\'cc-reg-detalle-ov\').remove()" style="border:none;background:#f0f0f0;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer">✕</button>'+
    '</div><div style="padding:12px 18px 18px">'+body+'</div></div>';
  document.body.appendChild(ov);
}
function delReg(id){ if(!confirm('¿Eliminar este registro?')) return; S.registros=S.registros.filter(function(r){ return r.id!==id; }); save(); renderHist(); renderHeader(); }
function limpiarFiltros(){ ['cc-fl-anio','cc-fl-pano','cc-fl-tipo'].forEach(function(id){ document.getElementById(id).value=''; }); document.getElementById('cc-fl-q').value=''; renderHist(); }
function exportCSV(){
  var rows=[['Fecha','Paño','Variedad','Año','Tipo','Producto','Dosis','Unidad','Método','Operador','Lote','Observaciones']];
  S.registros.forEach(function(r){
    var p=getPano(r.panoId);
    rows.push([r.fecha,p&&p.nombre||'',p&&p.variedad||'',p&&p.anio||'',r.tipo,r.producto,r.dosis,r.unidad,r.metodo,r.operador||'',r.lote||'',r.obs||'']);
  });
  var csv=rows.map(function(r){ return r.map(function(c){ return '"'+(c||'').toString().replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF'+csv); a.download='historial_'+today()+'.csv'; a.click();
}

// ══ EQUIPOS / NEBULIZADORAS (Cuaderno de Campo) ══
// S.equipos = [{nombre, capacidad}]  · capacidad en litros del estanque
function ccRenderEquipoSelect(){
  var sel=document.getElementById('cc-o-equipo'); if(!sel) return;
  var actual=sel.value;
  sel.innerHTML='<option value="">— Seleccione —</option>'+(S.equipos||[]).map(function(e){
    return '<option value="'+escapeHtml(e.nombre)+'" data-cap="'+(e.capacidad||0)+'">'+escapeHtml(e.nombre)+(e.capacidad?(' ('+fmtN(e.capacidad,0)+' L)'):'')+'</option>';
  }).join('');
  if(actual) sel.value=actual;
}
function ccEquipoSel(){
  var sel=document.getElementById('cc-o-equipo');
  var opt=sel.options[sel.selectedIndex];
  var cap=opt?parseFloat(opt.getAttribute('data-cap'))||0:0;
  var capInput=document.getElementById('cc-o-equipo-cap');
  if(capInput) capInput.value=cap||'';
  calcDist();
}
function abrirGestionEquipos(){
  var html='<div style="max-width:520px">'+
    '<div style="font-size:12px;color:#666;margin-bottom:12px">Configure las nebulizadoras y la capacidad del estanque de cada una. Se usan en las órdenes de aplicación para calcular el número de estanques y la cantidad de producto por estanque.</div>'+
    '<div id="ge-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>'+
    '<div style="display:grid;grid-template-columns:1fr 130px auto;gap:6px;align-items:end;border-top:1px solid #eee;padding-top:12px">'+
      '<div class="cc-field"><label class="cc-lbl">Nueva nebulizadora</label><input type="text" id="ge-new-nombre" placeholder="Ej: Nebulizadora 1"></div>'+
      '<div class="cc-field"><label class="cc-lbl">Capacidad (L)</label><input type="number" id="ge-new-cap" min="0" step="10" placeholder="Ej: 2000"></div>'+
      '<button class="cc-btn cc-btn-g cc-btn-sm" onclick="geAddEquipo()">+ Agregar</button>'+
    '</div></div>';
  showModal('🚜 Gestionar nebulizadoras', html);
  geRenderList();
}
function geRenderList(){
  var el=document.getElementById('ge-list'); if(!el) return;
  if(!(S.equipos||[]).length){ el.innerHTML='<div style="color:#999;font-size:12px;text-align:center;padding:8px">Sin nebulizadoras configuradas</div>'; return; }
  el.innerHTML=S.equipos.map(function(e,i){
    return '<div style="display:grid;grid-template-columns:1fr 130px auto;gap:6px;align-items:center;background:#f7f9fc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px">'+
      '<input type="text" value="'+escapeHtml(e.nombre)+'" onchange="geUpd('+i+',\'nombre\',this.value)" style="padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px;font-size:13px">'+
      '<input type="number" min="0" step="10" value="'+(e.capacidad||0)+'" onchange="geUpd('+i+',\'capacidad\',this.value)" style="padding:5px 8px;border:1px solid #d9d9d9;border-radius:5px;font-size:13px;text-align:right" placeholder="L">'+
      '<button onclick="geDel('+i+')" style="background:none;border:none;color:#b00;cursor:pointer;font-size:15px;padding:0 6px">✕</button>'+
    '</div>';
  }).join('');
}
function geAddEquipo(){
  var n=(document.getElementById('ge-new-nombre').value||'').trim();
  var c=parseFloat(document.getElementById('ge-new-cap').value)||0;
  if(!n){ toast('Falta nombre','Ingrese el nombre de la nebulizadora','error'); return; }
  if(!Array.isArray(S.equipos)) S.equipos=[];
  if(S.equipos.some(function(e){ return e.nombre.toLowerCase()===n.toLowerCase(); })){ toast('Duplicado','Ya existe una nebulizadora con ese nombre','error'); return; }
  S.equipos.push({nombre:n, capacidad:c});
  save();
  document.getElementById('ge-new-nombre').value='';
  document.getElementById('ge-new-cap').value='';
  geRenderList(); ccRenderEquipoSelect();
}
function geUpd(i,campo,val){
  var e=S.equipos[i]; if(!e) return;
  e[campo]=(campo==='capacidad')?(parseFloat(val)||0):val.trim();
  save(); ccRenderEquipoSelect();
}
function geDel(i){
  if(!confirm('¿Eliminar esta nebulizadora?')) return;
  S.equipos.splice(i,1); save(); geRenderList(); ccRenderEquipoSelect();
}

// ══ ÓRDENES ══
var selPanosOrden=[];
var ordenTipoApp='';
var draftDist=[];

function showOSub(name,btn){
  document.getElementById('cc-os-nueva').style.display=name==='nueva'?'':'none';
  document.getElementById('cc-os-lista').style.display=name==='lista'?'':'none';
  var conf = document.getElementById('cc-os-confirmar');
  if(conf) conf.style.display = name==='confirmar' ? '' : 'none';
  document.querySelectorAll('#cc-tab-ordenes .cc-ytab').forEach(function(t){ t.classList.remove('cc-act'); });
  if(btn) btn.classList.add('cc-act');
  if(name==='lista') renderOrdenesList();
  if(name==='confirmar') cfRefrescarLista();
}
function selTipo(btn,tipo){
  document.querySelectorAll('.cc-tipo-btn').forEach(function(b){ b.classList.remove('cc-sel'); });
  btn.classList.add('cc-sel');
  ordenTipoApp=tipo;
  renderOrdenChips();
  calcDist();
}
function getHas(p){
  return ordenTipoApp==='Fertirriego' ? (parseFloat(p.has_riego)||0) : (parseFloat(p.hectareas)||0);
}
// Ordena una lista de paños: cada productivo seguido de sus polinizantes hijos
function ordenarPanosPadreHijo(lista){
  var res=[];
  var productivos=lista.filter(function(p){ return (p.tipo||'Productivo')!=='Polinizante'; });
  var polinizantes=lista.filter(function(p){ return (p.tipo||'Productivo')==='Polinizante'; });
  productivos.forEach(function(prod){
    res.push(prod);
    polinizantes.filter(function(pol){ return String(pol.panoPadre)===String(prod.id); }).forEach(function(pol){ res.push(pol); });
  });
  polinizantes.filter(function(pol){ return res.indexOf(pol)<0; }).forEach(function(pol){ res.push(pol); });
  return res;
}
function renderOrdenChips(){
  var el=document.getElementById('cc-o-chips'); if(!el) return;
  el.innerHTML=''; selPanosOrden=[];
  ['2018','2024','2026'].forEach(function(y){
    var psAnio=S.panos.filter(function(p){ return p.anio===y; });
    // Mostrar SOLO los productivos como chips (un chip = un cuartel/grupo). Al
    // seleccionar un grupo se incluyen también sus polinizantes en el cálculo.
    var productivos=psAnio.filter(function(p){ return (p.tipo||'Productivo')!=='Polinizante'; });
    var polinizantes=psAnio.filter(function(p){ return (p.tipo||'Productivo')==='Polinizante'; });
    // Polinizantes huérfanos (sin productivo padre del mismo año): mostrarlos solos.
    var huerfanos=polinizantes.filter(function(pol){ return !productivos.some(function(prod){ return String(pol.panoPadre)===String(prod.id); }); });
    var chips=productivos.concat(huerfanos);
    if(!chips.length) return;
    var lbl=document.createElement('div'); lbl.className='cc-grp-lbl'; lbl.innerHTML='🌱 Plantación '+y;
    el.appendChild(lbl);
    var div=document.createElement('div'); div.className='cc-chips';
    chips.forEach(function(p){
      var esPolin=(p.tipo||'Productivo')==='Polinizante';
      // IDs del grupo: el productivo + sus polinizantes (para sumar superficie).
      var grupoIds=[p.id];
      var hijosPol=[];
      if(!esPolin){
        hijosPol=polinizantes.filter(function(pol){ return String(pol.panoPadre)===String(p.id); });
        hijosPol.forEach(function(h){ grupoIds.push(h.id); });
      }
      var haGrupo=grupoIds.reduce(function(s,gid){ var px=getPano(gid); return s+(px?(parseFloat(px.hectareas)||0):0); },0);
      var btn=document.createElement('button'); btn.className='cc-chip'; btn.dataset.id=p.id; btn.dataset.grupo=grupoIds.join(',');
      var polInfo=hijosPol.length?' <span style="background:#fef3c7;color:#92600a;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">🐝 +'+hijosPol.length+' polin.</span>':'';
      var polBadge=esPolin?' <span style="background:#fef3c7;color:#92600a;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px">🐝 POL</span>':'';
      // Checkbox visual (tick) a la izquierda, como en fertirriego, para que el
      // estado seleccionado/deseleccionado sea claro y se pueda alternar.
      var tick='<span class="cc-chip-tick" style="flex-shrink:0;width:20px;height:20px;border:2px solid #cbd5e1;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;background:#fff;margin-right:8px;transition:.15s"></span>';
      btn.style.display='flex'; btn.style.alignItems='center'; btn.style.textAlign='left';
      btn.innerHTML=tick+'<span style="flex:1"><span class="cc-cn">'+p.nombre+polBadge+polInfo+'</span><span class="cc-cs">'+p.variedad+' · 🌱'+(Math.round(haGrupo*100)/100)+' há'+(hijosPol.length?' total':'')+' · 🌿'+(p.densidad||0)+' pl/há</span></span>';
      function _setTick(on){
        var t=btn.querySelector('.cc-chip-tick'); if(!t) return;
        if(on){ t.style.background=p.color||'#16a34a'; t.style.borderColor=p.color||'#16a34a'; t.textContent='✓'; }
        else { t.style.background='#fff'; t.style.borderColor='#cbd5e1'; t.textContent=''; }
      }
      btn.onclick=function(){
        var grupo=(btn.dataset.grupo||String(p.id)).split(',');
        // p.id puede ser número y el array/grupo strings: comparar como String.
        var yaSel=selPanosOrden.some(function(sid){ return String(sid)===String(p.id); });
        if(yaSel){
          // Deseleccionar: quitar todo el grupo
          grupo.forEach(function(gid){ selPanosOrden=selPanosOrden.filter(function(sid){ return String(sid)!==String(gid); }); });
          btn.classList.remove('cc-sel'); btn.style.background=''; btn.style.borderColor=''; _setTick(false);
        } else {
          // Seleccionar: añadir todo el grupo (productivo + polinizantes)
          grupo.forEach(function(gid){ if(!selPanosOrden.some(function(sid){ return String(sid)===String(gid); })) selPanosOrden.push(gid); });
          btn.classList.add('cc-sel'); btn.style.background=p.color+'22'; btn.style.borderColor=p.color; _setTick(true);
        }
        var tHa=selPanosOrden.reduce(function(s,id){ var px=getPano(id); return s+getHas(px); },0);
        // Contar grupos seleccionados (productivos visibles), no paños individuales.
        var gruposSel=chips.filter(function(c){ return selPanosOrden.some(function(sid){ return String(sid)===String(c.id); }); }).length;
        document.getElementById('cc-o-chips-info').textContent=selPanosOrden.length?'✓ '+gruposSel+' cuartel(es) · '+tHa.toFixed(2)+' há':'';
        calcDist();
      };
      div.appendChild(btn);
    });
    el.appendChild(div);
  });
}
/* ══════════ VÍNCULO EXPLÍCITO CUADERNO → SCI ══════════
   El emparejamiento por nombre exacto se rompía con cualquier diferencia de un
   carácter (ej. "DORMEX 200 LT ALZ2" vs "DORMEX 200 LT ALZ"). Ahora el vínculo
   se guarda como código en S.vinculosSCI, indexado por el nombre normalizado.
   Se guarda el CÓDIGO, no el nombre, así el enlace sobrevive si en el SCI se
   corrige la descripción del producto.                                        */

function _claveVinculo(nombre){ return _normNombreProd(nombre); }

// Devuelve el código SCI vinculado manualmente a ese nombre, o ''.
function _getVinculoSCI(nombre){
  try{
    if(!S.vinculosSCI || typeof S.vinculosSCI!=='object') return '';
    return S.vinculosSCI[_claveVinculo(nombre)] || '';
  }catch(e){ return ''; }
}

// Resuelve la ficha del SCI para un nombre del Cuaderno.
// Orden: 1) vínculo manual · 2) descripción exacta · 3) descripción normalizada.
// La normalización solo ignora mayúsculas, acentos, signos y espacios: nunca
// empareja nombres realmente distintos. Todo lo demás exige vínculo manual.
function _resolverProdSCI(nombre){
  var nom=(nombre||'').toString().trim();
  if(!nom) return null;
  var prods=(typeof STATE!=='undefined' && STATE.cache && Array.isArray(STATE.cache.products)) ? STATE.cache.products : [];
  // 1) Vínculo manual guardado por un administrador
  var cod=_getVinculoSCI(nom);
  if(cod){
    var byCod=prods.find(function(p){ return String(p.codigoInterno)===String(cod); });
    if(byCod) return byCod;   // si el producto ya no existe, se sigue buscando
  }
  // 2) Coincidencia exacta de descripción
  var low=nom.toLowerCase();
  var exacto=prods.find(function(p){ return (p.descripcion||'').toLowerCase()===low; });
  if(exacto) return exacto;
  // 3) Coincidencia normalizada (acentos, espacios, signos, mayúsculas)
  var norm=_normNombreProd(nom);
  var porNorm=prods.find(function(p){ return _normNombreProd(p.descripcion)===norm; });
  return porNorm||null;
}
try{ window._resolverProdSCI=_resolverProdSCI; }catch(e){}

// Guarda o elimina el vínculo manual. Solo administradores.
function guardarVinculoSCI(nombre, codigoSCI){
  if(typeof can!=='function' || !can('config.editar')){
    if(typeof toast==='function') toast('Sin permiso','Solo un administrador puede vincular productos','error');
    return false;
  }
  if(!S.vinculosSCI || typeof S.vinculosSCI!=='object') S.vinculosSCI={};
  var k=_claveVinculo(nombre);
  if(!k) return false;
  if(codigoSCI) S.vinculosSCI[k]=String(codigoSCI);
  else delete S.vinculosSCI[k];
  if(typeof save==='function') save();
  return true;
}
try{ window.guardarVinculoSCI=guardarVinculoSCI; }catch(e){}

// ─── Stock de un producto de la orden (por nombre) ───────────────────────
// Mapea el nombre del producto (como aparece en la orden) a su ficha del
// catálogo SCI para obtener el codigoInterno y el stock total en bodega.
// Devuelve {cod, disponible, encontrado, unidadBodega}.
function _stockProductoOrden(nombre){
  var prodSCI=_resolverProdSCI(nombre);
  if(!prodSCI || !prodSCI.codigoInterno){
    return {cod:'', disponible:0, encontrado:false, unidadBodega:''};
  }
  var disp = (typeof getStockTotal==='function') ? (getStockTotal(prodSCI.codigoInterno)||0) : 0;
  return {cod:prodSCI.codigoInterno, disponible:disp, encontrado:true, unidadBodega:prodSCI.unidadMedida||''};
}
// Faltantes de la orden en curso (se persisten al emitir). Cada item:
// {nombre, cod, requerido, disponible, falta, unit, encontrado}
var draftFaltantes = [];
function calcDist(){
  var dosis=parseFloat(document.getElementById('cc-o-dosis').value)||0;
  var unidad=document.getElementById('cc-o-unidad').value;
  var moj=parseFloat(document.getElementById('cc-o-moj').value)||0;
  var vha=parseFloat(document.getElementById('cc-o-vha').value)||1;
  var mojT=moj*vha;
  document.getElementById('cc-o-mojt').value=mojT>0?mojT.toFixed(0):'';
  var isCon=unidad.indexOf('/100L')>=0;
  if(!dosis||!selPanosOrden.length){ hide('cc-dist-card'); hide('cc-bodega-box'); return; }
  if(isCon&&!mojT){ hide('cc-dist-card'); hide('cc-bodega-box'); return; }
  show('cc-dist-card');
  var unitS=unitBase(unidad);
  var isRiego=ordenTipoApp==='Fertirriego';
  var hasLbl=isRiego?'Há riego 💧':'Há plantadas 🌱';
  document.getElementById('cc-dist-has-hdr').textContent=hasLbl;
  document.getElementById('cc-dist-prod-hdr').textContent='Producto ('+unitS+')';
  document.getElementById('cc-dist-formula').textContent=
    (isCon?'Agua = Moj.('+mojT+' L/ha) × Há | Prod = ('+dosis+' '+unidad+' ÷ 100) × Agua':'Prod = '+dosis+' '+unidad+' × Há')+
    ' | Base: '+hasLbl;
  // Sincronizar mezcla con DOM
  _syncMixProds();
  // Lista completa de productos (principal + mezcla, solo los completos)
  var prodN=document.getElementById('cc-o-prod').value.trim();
  var allProds = [{nombre:prodN, dosis:dosis, unidad:unidad, unitS:unitS}];
  mixProds.forEach(function(p){
    if(p.nombre && p.nombre.trim() && parseFloat(p.dosis)>0){
      allProds.push({nombre:p.nombre.trim(), dosis:parseFloat(p.dosis), unidad:p.unidad, unitS:unitBase(p.unidad)});
    }
  });
  var tHas=0,tAgua=0,tProd=0;
  draftDist=selPanosOrden.map(function(id){
    var p=getPano(id); var has=getHas(p);
    var agua=mojT*has;
    var prod=_calcProdQty(dosis, unidad, has, mojT);
    tHas+=has; tAgua+=agua; tProd+=prod;
    // Cantidades de productos adicionales para este paño
    var extras = {};
    allProds.slice(1).forEach(function(ap, i){
      extras['p'+i] = _calcProdQty(ap.dosis, ap.unidad, has, mojT);
    });
    return {p:p,has:has,agua:agua,prod:prod, extras:extras};
  });
  document.getElementById('cc-dist-tbody').innerHTML=draftDist.map(function(r){
    var pct=tProd>0?((r.prod/tProd)*100).toFixed(1)+'%':'0%';
    return '<tr><td><span class="cc-pano-tag"><span class="cc-pano-dot" style="background:'+(r.p&&r.p.color||'#888')+'"></span>'+(r.p&&r.p.nombre||'—')+'</span></td>'+
      '<td style="font-style:italic;color:#888">'+(r.p&&r.p.variedad||'—')+'</td>'+
      '<td style="text-align:center">'+(r.p&&r.p.anio||'—')+'</td>'+
      '<td style="text-align:right;font-weight:700">'+fmtN(r.has,2)+' há</td>'+
      '<td style="text-align:right">'+(r.agua>0?fmtN(r.agua,0)+' L':'—')+'</td>'+
      '<td style="text-align:right;font-weight:700;color:#354a5f">'+fmtN(r.prod,3)+'</td>'+
      '<td style="text-align:center;color:#888">'+pct+'</td></tr>';
  }).join('');
  document.getElementById('cc-dt-has').textContent=fmtN(tHas,2)+' há';
  document.getElementById('cc-dt-agua').textContent=tAgua>0?fmtN(tAgua,0)+' L':'—';
  document.getElementById('cc-dt-prod').textContent=fmtQtyStr(tProd,unitS,2);
  // ─── Estanques (nebulizadora): N° estanques y producto por estanque ───
  var capEst=parseFloat((document.getElementById('cc-o-equipo-cap')||{}).value)||0;
  var estInput=document.getElementById('cc-o-estanques');
  var nEst=0;
  if(estInput){
    if(capEst>0 && tAgua>0){
      nEst=Math.ceil(tAgua/capEst);
      estInput.value=nEst+' estanque(s) · '+fmtN(tProd/nEst,3)+' '+unitS+'/estanque';
    } else {
      estInput.value=capEst>0?'—':'Indique capacidad';
    }
  }
  var estBox=document.getElementById('cc-est-detalle');
  if(estBox){
    if(nEst>0){
      var rowsEst=allProds.map(function(ap,i){
        var totP = i===0 ? tProd : draftDist.reduce(function(s,r){ return s+(r.extras['p'+(i-1)]||0); },0);
        return '<div style="font-size:12px;line-height:1.6"><strong>'+escapeHtml(ap.nombre)+':</strong> '+fmtQtyStr(totP/nEst,ap.unitS,2)+' por estanque</div>';
      }).join('');
      estBox.innerHTML='<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:3px solid #16a34a;border-radius:6px;padding:10px 12px;margin-top:10px">'+
        '<div style="font-weight:700;color:#15803d;font-size:12px;margin-bottom:6px">🚜 Por estanque ('+fmtN(capEst,0)+' L · '+nEst+' estanques)</div>'+rowsEst+'</div>';
    } else { estBox.innerHTML=''; }
  }
  // ─── Resumen de mezcla (productos adicionales) ───
  var mixEl=document.getElementById('cc-mix-summary');
  if(mixEl){
    if(allProds.length<=1){
      mixEl.innerHTML='';
    } else {
      var rows = allProds.slice(1).map(function(ap, i){
        var tot = draftDist.reduce(function(s,r){ return s + (r.extras['p'+i]||0); }, 0);
        var detalle = draftDist.map(function(r){
          var qty = r.extras['p'+i]||0;
          return '<span class="cc-pano-tag" style="margin:2px;font-size:11px"><span class="cc-pano-dot" style="background:'+(r.p&&r.p.color||'#888')+'"></span>'+(r.p&&r.p.nombre||'?')+': <strong>'+fmtQtyStr(qty,ap.unitS,2)+'</strong></span>';
        }).join(' ');
        return '<div style="background:#f5f9fd;border:1px solid #bcd9f5;border-left:3px solid #0a6ed1;border-radius:6px;padding:10px 12px;margin-bottom:8px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">'+
            '<div><strong style="color:#354a5f">'+escapeHtml(ap.nombre)+'</strong> '+
              '<span style="font-size:11px;color:#666;margin-left:6px">'+ap.dosis+' '+ap.unidad+'</span></div>'+
            '<div style="font-size:13px;font-weight:700;color:#354a5f">Total: '+fmtQtyStr(tot,ap.unitS,2)+'</div>'+
          '</div>'+
          '<div style="font-size:11px;color:#555">'+detalle+'</div>'+
          '</div>';
      }).join('');
      mixEl.innerHTML = '<div style="font-size:12px;font-weight:700;color:#0a6ed1;margin-bottom:6px;text-transform:uppercase">🧪 Productos adicionales en la mezcla</div>' + rows;
    }
  }
  // ─── Solicitud a bodega: lista completa con margen ───
  show('cc-bodega-box');
  document.getElementById('cc-bodega-agua').textContent=tAgua>0?fmtN(tAgua,0):'—';
  // Cantidades netas (sin margen extra) — bodega entrega exactamente lo que la orden indica
  if(allProds.length===1){
    document.getElementById('cc-bodega-qty').textContent=fmtQtyStr(tProd,unitS,2);
    document.getElementById('cc-bodega-lbl').textContent='de '+(prodN||'producto');
    document.getElementById('cc-bodega-det').textContent=selPanosOrden.length+' paño(s) · Total: '+fmtQtyStr(tProd,unitS,2);
  } else {
    // Mezcla: lista de productos con cantidades netas
    var bodegaLista = allProds.map(function(ap, i){
      var totProd = i===0 ? tProd : draftDist.reduce(function(s,r){ return s + (r.extras['p'+(i-1)]||0); }, 0);
      return '<div style="font-size:12px;line-height:1.5"><strong>'+escapeHtml(ap.nombre)+':</strong> '+fmtQtyStr(totProd,ap.unitS,2)+'</div>';
    }).join('');
    document.getElementById('cc-bodega-qty').textContent = allProds.length + ' productos';
    document.getElementById('cc-bodega-lbl').textContent = 'en la mezcla';
    document.getElementById('cc-bodega-det').innerHTML = selPanosOrden.length+' paño(s) · Solicitar a bodega:<br>'+bodegaLista;
  }
  // ─── Stock disponible en bodega vs requerido (por producto) ───
  draftFaltantes = [];
  var stockRows = allProds.map(function(ap, i){
    var totProd = i===0 ? tProd : draftDist.reduce(function(s,r){ return s + (r.extras['p'+(i-1)]||0); }, 0);
    // Convertir requerido a kg/L (igual que se muestra) para comparar con stock
    var conv = fmtQtyAuto(totProd, ap.unitS);
    var req = conv.qty, unit = conv.unit;
    var st = _stockProductoOrden(ap.nombre);
    var disp = st.disponible;
    var falta = Math.max(0, req - disp);
    if(!st.encontrado || falta > 0.0001){
      draftFaltantes.push({ nombre: ap.nombre, cod: st.cod, requerido: req, disponible: disp, falta: (st.encontrado?falta:req), unit: unit, encontrado: st.encontrado });
    }
    var estado, color, bg;
    if(!st.encontrado){ estado='No está en bodega'; color='#b91c1c'; bg='#fef2f2'; }
    else if(falta > 0.0001){ estado='Falta '+fmtN(falta,2)+' '+unit; color='#b91c1c'; bg='#fef2f2'; }
    else { estado='OK'; color='#15803d'; bg='#f0fdf4'; }
    return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:4px 8px;border-radius:5px;background:'+bg+';margin-top:4px">'+
      '<span style="color:#1f2d3d"><strong>'+escapeHtml(ap.nombre)+'</strong></span>'+
      '<span style="color:#475569">Req: '+fmtN(req,2)+' '+unit+' · Stock: '+(st.encontrado?fmtN(disp,2)+' '+unit:'—')+'</span>'+
      '<span style="color:'+color+';font-weight:700;white-space:nowrap">'+estado+'</span>'+
    '</div>';
  }).join('');
  var stockBox=document.getElementById('cc-stock-detalle');
  if(stockBox){
    var nFalt = draftFaltantes.length;
    var hdr = '<div style="font-size:12px;font-weight:700;color:'+(nFalt?'#b91c1c':'#15803d')+';margin-bottom:2px;text-transform:uppercase">'+
      (nFalt? '⚠️ '+nFalt+' producto(s) sin stock suficiente' : '✓ Stock disponible en bodega')+'</div>';
    stockBox.innerHTML = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-top:12px">'+hdr+stockRows+'</div>';
  }
}

// ══ MEZCLA DE PRODUCTOS / UNIDAD BASE ══
// Devuelve la unidad "base" (cantidad), eliminando el denominador.
//   mL/100L -> mL, L/100L -> L, g/100L -> g, kg/100L -> kg
//   L/ha -> L, kg/ha -> kg, mL/ha -> mL, g/ha -> g
function unitBase(u){
  if(!u) return '';
  return String(u).replace(/\/(100L|ha)$/i,'').trim();
}
// Convierte qty a unidad de distribución: SIEMPRE kg o L (nunca g, mL ni cc).
// g → kg, mL → L, cc → L; kg y L se mantienen. Otras unidades quedan igual (fallback).
function fmtQtyAuto(qty, baseUnit){
  qty = qty||0;
  var u = (baseUnit||'').toString().trim();
  var ul = u.toLowerCase();
  if(ul === 'g')  return {qty: qty/1000, unit: 'kg'};
  if(ul === 'ml') return {qty: qty/1000, unit: 'L'};
  if(ul === 'cc') return {qty: qty/1000, unit: 'L'};
  if(ul === 'kg') return {qty: qty, unit: 'kg'};
  if(ul === 'l')  return {qty: qty, unit: 'L'};
  return {qty: qty, unit: u};
}
// Helper que devuelve string formateado "<num> <unit>" con conversión a kg/L
function fmtQtyStr(qty, baseUnit, dec){
  if(dec===undefined) dec = 2;
  var r = fmtQtyAuto(qty, baseUnit);
  return fmtN(r.qty, dec) + ' ' + r.unit;
}

// Estado de la mezcla en el formulario de emisión (productos adicionales).
// El primer producto sigue siendo cc-o-prod/cc-o-dosis/cc-o-unidad.
// mixProds = [{nombre, dosis, unidad}, ...]   (índices a partir de 1)
var mixProds = [];
function _mixRowHtml(idx, p){
  var nombre = (p && p.nombre) || '';
  var dosis = (p && (p.dosis||p.dosis===0)) ? p.dosis : '';
  var unidad = (p && p.unidad) || 'mL/100L';
  return '<div class="cc-g3" style="align-items:end;margin-top:8px" data-mix-idx="'+idx+'">'+
    '<div class="cc-field cc-ac-wrap"><label class="cc-lbl">Producto '+(idx+1)+'</label>'+
      '<input type="text" id="cc-o-mix-prod-'+idx+'" placeholder="Buscar en catálogo..." value="'+escapeHtml(nombre)+'" oninput="showAC(\'cc-o-mix-prod-'+idx+'\',\'cc-o-mix-ac-'+idx+'\')" onblur="setTimeout(()=>hide(\'cc-o-mix-ac-'+idx+'\'),200);_syncMixProds();calcDist();">'+
      '<div class="cc-ac-list" id="cc-o-mix-ac-'+idx+'" style="display:none"></div></div>'+
    '<div class="cc-field"><label class="cc-lbl">Dosis</label>'+
      '<input type="number" id="cc-o-mix-dosis-'+idx+'" step="0.001" placeholder="0.000" value="'+dosis+'" oninput="_syncMixProds();calcDist()"></div>'+
    '<div class="cc-field" style="display:flex;gap:6px;align-items:flex-end"><div style="flex:1"><label class="cc-lbl">Unidad</label>'+
      '<select id="cc-o-mix-unidad-'+idx+'" onchange="_syncMixProds();calcDist()">'+
        '<optgroup label="Por volumen de caldo">'+
          '<option value="mL/100L"'+(unidad==='mL/100L'?' selected':'')+'>mL / 100 L agua</option>'+
          '<option value="L/100L"'+(unidad==='L/100L'?' selected':'')+'>L / 100 L agua</option>'+
          '<option value="g/100L"'+(unidad==='g/100L'?' selected':'')+'>g / 100 L agua</option>'+
          '<option value="kg/100L"'+(unidad==='kg/100L'?' selected':'')+'>kg / 100 L agua</option>'+
        '</optgroup>'+
        '<optgroup label="Por hectárea">'+
          '<option value="L/ha"'+(unidad==='L/ha'?' selected':'')+'>L / ha</option>'+
          '<option value="kg/ha"'+(unidad==='kg/ha'?' selected':'')+'>kg / ha</option>'+
          '<option value="mL/ha"'+(unidad==='mL/ha'?' selected':'')+'>mL / ha</option>'+
          '<option value="g/ha"'+(unidad==='g/ha'?' selected':'')+'>g / ha</option>'+
        '</optgroup>'+
      '</select></div>'+
      '<button type="button" class="cc-btn cc-btn-sm cc-btn-r" style="font-size:13px;flex-shrink:0" onclick="removeMixProd('+idx+')" title="Quitar este producto de la mezcla">✕</button>'+
    '</div>'+
  '</div>';
}
function addMixProd(){
  var idx = mixProds.length;
  mixProds.push({nombre:'', dosis:'', unidad:'mL/100L'});
  _renderMixList();
}
function removeMixProd(idx){
  if(idx<0 || idx>=mixProds.length) return;
  mixProds.splice(idx, 1);
  _renderMixList();
  calcDist();
}
function _renderMixList(){
  var el = document.getElementById('cc-o-mix-list'); if(!el) return;
  el.innerHTML = mixProds.map(function(p,i){ return _mixRowHtml(i,p); }).join('');
}
function _syncMixProds(){
  // Lee los valores actuales del DOM y los guarda en mixProds[]
  mixProds.forEach(function(p, i){
    var n = document.getElementById('cc-o-mix-prod-'+i);
    var d = document.getElementById('cc-o-mix-dosis-'+i);
    var u = document.getElementById('cc-o-mix-unidad-'+i);
    if(n) p.nombre = n.value.trim();
    if(d) p.dosis = d.value;
    if(u) p.unidad = u.value;
  });
}
// Devuelve TODOS los productos del formulario (principal + mezcla), saneados
function _allProds(){
  var arr = [];
  var n1 = (document.getElementById('cc-o-prod')||{}).value || '';
  var d1 = (document.getElementById('cc-o-dosis')||{}).value || '';
  var u1 = (document.getElementById('cc-o-unidad')||{}).value || '';
  if(n1.trim() || d1){
    arr.push({nombre:n1.trim(), dosis:parseFloat(d1)||0, unidad:u1});
  }
  _syncMixProds();
  mixProds.forEach(function(p){
    if(p.nombre && p.nombre.trim() && parseFloat(p.dosis)>0){
      arr.push({nombre:p.nombre.trim(), dosis:parseFloat(p.dosis)||0, unidad:p.unidad});
    }
  });
  return arr;
}
// Calcula cantidad de producto para un (paño, dosis, unidad) dado el mojamiento total
function _calcProdQty(dosis, unidad, has, mojT){
  if(!(dosis>0) || !(has>0)) return 0;
  if(String(unidad).indexOf('/100L')>=0){
    var agua = mojT * has;
    return (dosis/100) * agua;
  } else if(String(unidad).indexOf('/ha')>=0){
    return dosis * has;
  }
  return 0;
}

/* Recalcula la distribución de agua y producto de una orden de forma
   PROPORCIONAL A LAS HECTÁREAS ACTUALES de cada paño, usando la dosis y el
   mojamiento guardados en la orden. Esto corrige las órdenes antiguas cuyo
   reparto quedó "congelado" con valores previos: el informe siempre refleja el
   reparto por hectárea. Devuelve un objeto {filas, tHas, tAgua, tProd}. */
function _recalcDistribucionOrden(o){
  if(!o) return { filas:[], tHas:0, tAgua:0, tProd:0 };
  var mojT = parseFloat(o.mojT)||0;
  // Productos de la orden (compat: si no hay array, usar el principal).
  var productos = (o.productos && o.productos.length) ? o.productos
                  : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad, unitS:unitBase(o.unidad||'')}];
  // IDs de paños: preferir panoIds; si no, derivar de la distribución guardada.
  var ids = (o.panoIds && o.panoIds.length) ? o.panoIds
            : (o.distribucion||[]).map(function(r){ return r.panoId; });
  var esFerti = (o.tipoApp==='Fertirriego');
  var _hasP=function(px){ return px ? (esFerti ? (parseFloat(px.has_riego)||0) : (parseFloat(px.hectareas)||0)) : 0; };
  var _hasGrupo=function(px){
    var t=_hasP(px);
    (S.panos||[]).forEach(function(h){
      if((h.tipo||'Productivo')==='Polinizante' && String(h.panoPadre)===String(px.id)) t+=_hasP(h);
    });
    return t;
  };
  // Distribuir solo en paños padres; los polinizantes hijos suman sus há al padre
  ids = ids.filter(function(pid){
    var px=getPano(pid);
    return !px || (px.tipo||'Productivo')!=='Polinizante';
  });
  var filas = []; var tHas=0,tAgua=0,tProd=0;
  ids.forEach(function(pid){
    var p = getPano(pid);
    // hectáreas del grupo (padre + polinizantes hijos)
    var has = p ? _hasGrupo(p) : 0;
    // respaldo: si el paño ya no existe, usar las há guardadas en la distribución
    if((!p || has===0)){
      var guardado = (o.distribucion||[]).find(function(r){ return String(r.panoId)===String(pid); });
      if(guardado && guardado.has>0) has = parseFloat(guardado.has)||0;
    }
    var agua = mojT * has;
    var prodsByPano = productos.map(function(ap){
      return { nombre:ap.nombre, unidad:ap.unidad, dosis:ap.dosis,
               unitS:(ap.unitS||unitBase(ap.unidad||'')),
               qty:_calcProdQty(ap.dosis, ap.unidad, has, mojT) };
    });
    var prodPrincipal = prodsByPano.length ? prodsByPano[0].qty : 0;
    var datosP = (o.distribucion||[]).find(function(r){ return String(r.panoId)===String(pid); }) || {};
    filas.push({
      panoId:pid,
      panoNombre: (p&&p.nombre) || datosP.panoNombre || '—',
      variedad: (p&&p.variedad) || datosP.variedad || '—',
      anio: (p&&p.anio) || datosP.anio || '—',
      color: (p&&p.color) || datosP.color || '#888',
      has:has, agua:agua, prod:prodPrincipal, prods:prodsByPano
    });
    tHas+=has; tAgua+=agua; tProd+=prodPrincipal;
  });
  return { filas:filas, tHas:tHas, tAgua:tAgua, tProd:tProd };
}

function emitirOrden(){
  var tipo=ordenTipoApp, fecha=document.getElementById('cc-o-fecha').value;
  var fenol=document.getElementById('cc-o-fenol').value, prod=document.getElementById('cc-o-prod').value.trim();
  var dosis=parseFloat(document.getElementById('cc-o-dosis').value)||0;
  var err=document.getElementById('cc-o-err');
  if(!tipo||!fecha||!fenol||!prod||!dosis||!selPanosOrden.length){
    err.style.display=''; err.textContent='Completa: tipo de aplicacion, fecha, estado fenologico, producto, dosis y selecciona al menos un pano.'; return;
  }
  // Validar objetivo
  var objData = readObjetivosUI('cc-o-obj');
  var totalObjs = objData.objetivos.length + (objData.objetivoOtro?1:0);
  if(totalObjs===0){
    err.style.display=''; err.textContent='Seleccione al menos un objetivo de la aplicacion.'; return;
  }
  if(!draftDist.length){
    err.style.display=''; err.textContent='Ingresa la dosis y el mojamiento para calcular la distribucion por pano antes de emitir.'; return;
  }
  err.style.display='none';
  var unidad=document.getElementById('cc-o-unidad').value;
  var unitS=unitBase(unidad);
  var tHas=draftDist.reduce(function(s,r){ return s+r.has; },0);
  var tAgua=draftDist.reduce(function(s,r){ return s+r.agua; },0);
  var tProd=draftDist.reduce(function(s,r){ return s+r.prod; },0);
  // Recolectar productos adicionales en la mezcla
  _syncMixProds();
  var productos = [{nombre:prod, dosis:dosis, unidad:unidad, unitS:unitS, tProd:tProd, margin:tProd}];
  mixProds.forEach(function(p){
    var dp = parseFloat(p.dosis)||0;
    if(p.nombre && p.nombre.trim() && dp>0){
      var us = unitBase(p.unidad);
      var tot = draftDist.reduce(function(s,r){ return s + _calcProdQty(dp, p.unidad, r.has, parseFloat(document.getElementById('cc-o-mojt').value)||0); }, 0);
      productos.push({nombre:p.nombre.trim(), dosis:dp, unidad:p.unidad, unitS:us, tProd:tot, margin:tot});
    }
  });
  // Para cada paño en draftDist, también guardamos las cantidades de los productos adicionales
  var mojT_final = parseFloat(document.getElementById('cc-o-mojt').value)||0;
  var distribucion = draftDist.map(function(r){
    var prodsByPano = productos.map(function(ap){
      return {nombre:ap.nombre, qty:_calcProdQty(ap.dosis, ap.unidad, r.has, mojT_final), unitS:ap.unitS, unidad:ap.unidad, dosis:ap.dosis};
    });
    return {
      panoId:r.p&&r.p.id, panoNombre:r.p&&r.p.nombre, variedad:r.p&&r.p.variedad, anio:r.p&&r.p.anio, color:r.p&&r.p.color,
      has:r.has, agua:r.agua, prod:r.prod, prods:prodsByPano
    };
  });
  var num='OA-'+String(S.oCounter).padStart(5,'0'); S.oCounter++;
  var orden={
    id:Date.now(), numero:num, fecha:fecha, tipoApp:tipo, fenologico:fenol,
    objetivos:objData.objetivos, objetivoOtro:objData.objetivoOtro,
    especie:document.getElementById('cc-o-esp').value, responsable:document.getElementById('cc-o-resp').value,
    metodo:document.getElementById('cc-o-met').value,
    panoIds:[].concat(selPanosOrden),
    // Compatibilidad: primer producto sigue en los campos antiguos
    producto:prod, dosis:dosis, unidad:unidad, unitS:unitS,
    // Nueva estructura: array de productos en la mezcla
    productos: productos,
    moj:parseFloat(document.getElementById('cc-o-moj').value)||0,
    vha:parseFloat(document.getElementById('cc-o-vha').value)||1,
    mojT:mojT_final,
    equipo:(document.getElementById('cc-o-equipo').value||'').trim(),
    equipoCap:parseFloat((document.getElementById('cc-o-equipo-cap')||{}).value)||0,
    nEstanques:(function(){ var c=parseFloat((document.getElementById('cc-o-equipo-cap')||{}).value)||0; return (c>0&&tAgua>0)?Math.ceil(tAgua/c):0; })(),
    notas:document.getElementById('cc-o-notas').value,
    distribucion: distribucion,
    tHas:tHas, tAgua:tAgua, tProd:tProd, margin:tProd
  };
  // Faltantes de stock: se recalculan aquí desde los productos de la orden
  // (no se depende de draftFaltantes para evitar desincronización con la UI).
  var faltantesOrden = [];
  productos.forEach(function(ap){
    var conv = fmtQtyAuto(ap.tProd||0, ap.unitS);
    var req = conv.qty, unit = conv.unit;
    var st = _stockProductoOrden(ap.nombre);
    var falta = Math.max(0, req - st.disponible);
    if(!st.encontrado || falta > 0.0001){
      faltantesOrden.push({ nombre:ap.nombre, cod:st.cod, requerido:req, disponible:st.disponible, falta:(st.encontrado?falta:req), unit:unit, encontrado:st.encontrado });
    }
  });
  orden.faltantes = faltantesOrden;
  if(faltantesOrden.length){
    if(!Array.isArray(S.comprasUrgentes)) S.comprasUrgentes = [];
    S.comprasUrgentes.unshift({ ordenId:orden.id, numero:num, fecha:fecha, items:faltantesOrden });
  }
  S.ordenes.unshift(orden); save(); renderHeader();
  // Limpiar el formulario para la próxima orden
  limpiarOrden();
  // Navigate immediately to show the emitted order
  showOSub('lista', document.getElementById('cc-ot2'));
  renderOrdenesList();
  setTimeout(function(){
    var firstCard = document.querySelector('#cc-ordenes-list .cc-pano-c-body');
    if(firstCard) firstCard.style.display='block';
  }, 100);
  var msg = 'Orden '+num+' emitida.';
  if(productos.length===1){
    msg += ' Solicitar '+fmtQtyStr(orden.tProd,unitS,2)+' de '+prod+' a bodega.';
  } else {
    msg += ' Mezcla de '+productos.length+' productos. Ver detalle en la lista.';
  }
  showNotice(msg,'ok');
}
function limpiarOrden(){
  ordenTipoApp=''; draftDist=[];
  document.querySelectorAll('.cc-tipo-btn').forEach(function(b){ b.classList.remove('cc-sel'); });
  ['cc-o-fecha','cc-o-fenol','cc-o-esp','cc-o-resp','cc-o-met','cc-o-prod','cc-o-dosis','cc-o-moj','cc-o-notas'].forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
  });
  document.getElementById('cc-o-esp').value='Cerezo';
  document.getElementById('cc-o-vha').value='1';
  document.getElementById('cc-o-mojt').value='';
  document.getElementById('cc-o-fecha').value=today();
  document.getElementById('cc-o-unidad').value='mL/100L';
  document.getElementById('cc-o-err').style.display='none';
  document.getElementById('cc-btn-print').style.display='none';
  hide('cc-dist-card');
  // Resetear objetivos
  var objBox=document.getElementById('cc-o-obj-box');
  if(objBox){ objBox.innerHTML = renderObjetivosUI('cc-o-obj', [], ''); setTimeout(function(){ ccObjUpdateSummary('cc-o-obj'); }, 30); }
  hide('cc-bodega-box');
  var sd=document.getElementById('cc-stock-detalle'); if(sd) sd.innerHTML='';
  draftFaltantes=[];
  // Limpiar mezcla
  mixProds = [];
  var ml = document.getElementById('cc-o-mix-list'); if(ml) ml.innerHTML='';
  var ms = document.getElementById('cc-mix-summary'); if(ms) ms.innerHTML='';
  selPanosOrden=[]; renderOrdenChips();
  ccRenderEquipoSelect();
  var eqSel=document.getElementById('cc-o-equipo'); if(eqSel) eqSel.value='';
  var eqCap=document.getElementById('cc-o-equipo-cap'); if(eqCap) eqCap.value='';
  var eqEst=document.getElementById('cc-o-estanques'); if(eqEst) eqEst.value='';
  var eqDet=document.getElementById('cc-est-detalle'); if(eqDet) eqDet.innerHTML='';
  document.getElementById('cc-o-chips-info').textContent='';
  document.getElementById('cc-o-num').value='OA-'+String(S.oCounter).padStart(5,'0');
}
function renderOrdenesList(){
  var el=document.getElementById('cc-ordenes-list');
  if(!S.ordenes.length){ el.innerHTML='<div class="cc-no-data"><span>📋</span>Sin órdenes emitidas.</div>'; return; }
  el.innerHTML=S.ordenes.map(function(o){
    var pNoms=(o.panoIds||[]).map(function(id){ var p=getPano(id); return p; }).filter(function(p){ return p && (p.tipo||'Productivo')!=='Polinizante'; }).map(function(p){ return p.nombre; }).join(', ');
    var editadaBadge = o.editada ? '<span class="cc-badge" style="background:#fff8e0;color:#7a4200;font-size:10px" title="Editada el '+(o.editadaFecha||'')+'">✎ Editada</span>' : '';
    // Resolver array de productos: compat hacia atrás
    var prods = (o.productos && o.productos.length) ? o.productos : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad, unitS:unitBase(o.unidad||''), tProd:o.tProd, margin:o.margin}];
    var mixBadge = prods.length>1 ? '<span class="cc-badge" style="background:#d1e8ff;color:#0a6ed1;font-size:10px">🧪 Mezcla '+prods.length+'</span>' : '';
    // Resumen del producto en la cabecera
    var hdrProdSummary;
    if(prods.length===1){
      hdrProdSummary = '<span style="font-weight:700">'+escapeHtml(prods[0].nombre||'—')+'</span>'+
        '<span style="font-size:12px;color:#888">'+fmtQtyStr(prods[0].tProd||0,(prods[0].unitS||unitBase(prods[0].unidad||'')),2)+'</span>';
    } else {
      hdrProdSummary = '<span style="font-weight:700">'+escapeHtml(prods[0].nombre||'—')+'</span>'+
        '<span style="font-size:11px;color:#666">+'+(prods.length-1)+' producto'+(prods.length-1>1?'s':'')+' en mezcla</span>';
    }
    return '<div class="cc-pano-c" style="border-left-color:'+(o.tipoApp==='Fertirriego'?'#1a5a8a':o.tipoApp==='Herbicida'?'#0a6ed1':'#8B1A1A')+'">'+
      '<div class="cc-pano-c-hdr" style="flex-wrap:wrap;gap:10px">'+
        '<div onclick="toggleEl(\'cc-od-'+o.id+'\')" style="cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1 1 auto;min-width:240px">'+
          '<span style="font-weight:700;font-size:15px;color:#354a5f">'+o.numero+'</span>'+
          '<span class="cc-badge" style="background:#e0f0ff;color:#084298;font-size:11px">'+o.tipoApp+'</span>'+
          '<span style="font-size:12px;color:#888">'+o.fecha+'</span>'+
          '<span style="font-size:12px;font-style:italic;color:#888">'+o.fenologico+'</span>'+
          editadaBadge + mixBadge +
        '</div>'+
        '<div onclick="toggleEl(\'cc-od-'+o.id+'\')" style="cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
          hdrProdSummary +
          (function(){
            var est = cfEstadoOrden(o);
            var bg = est==='Completa'?'#d1e7dd':(est==='Parcial'?'#fff8e0':'#e0f0ff');
            var fg = est==='Completa'?'#23303d':(est==='Parcial'?'#7a4200':'#084298');
            var ico = est==='Completa'?'✓':(est==='Parcial'?'◐':'⏳');
            return '<span class="cc-badge" style="background:'+bg+';color:'+fg+';font-weight:600">'+ico+' '+est+'</span>';
          })() +
        '</div>'+
        '<div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">'+
          '<button class="cc-btn cc-btn-gold cc-btn-sm" onclick="openPM(\''+o.id+'\')" title="Imprimir orden">🖨️</button>'+
          '<button class="cc-btn cc-btn-sm" style="background:#fff;border:1px solid #d9d9d9;color:#354a5f" onclick="editOrden(\''+o.id+'\')" title="Editar orden">✏️</button>'+
          (cfEstadoOrden(o)!=='Completa' ? '<button class="cc-btn cc-btn-sm" style="background:#354a5f;color:#fff;border:none;font-weight:700" onclick="cfDesdeListado(\''+o.id+'\')" title="Confirmar aplicación">✅</button>' : '')+
          '<button class="cc-btn cc-btn-r cc-btn-sm" onclick="anularOrden(\''+o.id+'\')" title="Eliminar orden">🗑️</button>'+
        '</div>'+
      '</div>'+
      '<div class="cc-pano-c-body" id="od-'+o.id+'">'+
        '<div class="cc-g3" style="margin-bottom:13px;font-size:13px">'+
          '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:2px">Paños</div>'+pNoms+'</div>'+
          '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:2px">Responsable</div>'+(o.responsable||'—')+'</div>'+
          '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:2px">Mojamiento</div>'+(o.mojT||o.moj||'—')+' L/ha ('+o.vha+'x)</div>'+
        '</div>'+
        // Bloque de objetivos
        (function(){
          var objs = (o.objetivos||[]).slice();
          if(o.objetivoOtro) objs.push('Otro: '+o.objetivoOtro);
          if(!objs.length) return '';
          return '<div style="background:#f5f9fd;border-left:3px solid #0a6ed1;padding:8px 12px;margin-bottom:13px;border-radius:4px">'+
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:4px">🎯 Objetivo(s) de la aplicación</div>'+
            '<div style="font-size:12px;color:#333">'+ objs.map(function(o2){ return '<span class="cc-badge" style="background:#d1e8ff;color:#354a5f;margin:2px 4px 2px 0;font-size:11px;display:inline-block">'+escapeHtml(o2)+'</span>'; }).join('') +'</div>'+
          '</div>';
        })()+
        // Lista de productos en la mezcla
        '<div style="background:#f5f9fd;border:1px solid #bcd9f5;border-radius:6px;padding:10px 12px;margin-bottom:13px">'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:6px">'+
            (prods.length>1?'🧪 Mezcla de productos':'Producto')+
          '</div>'+
          prods.map(function(ap){
            var apUS = ap.unitS||unitBase(ap.unidad||'');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed #d1e8ff;font-size:13px">'+
              '<div><strong>'+escapeHtml(ap.nombre||'—')+'</strong> '+
                '<span style="font-size:11px;color:#666;margin-left:6px">'+ap.dosis+' '+(ap.unidad||'')+'</span></div>'+
              '<div style="font-weight:700;color:#354a5f">'+fmtQtyStr(ap.tProd||0,apUS,2)+'</div>'+
            '</div>';
          }).join('')+
        '</div>'+
        (o.notas?'<div class="cc-notice cc-notice-info" style="margin-bottom:13px"><strong>📝 Notas:</strong> '+o.notas+'</div>':'')+
        '<div class="cc-tbl-wrap"><table class="cc-tbl"><thead><tr>'+
          '<th>Paño</th><th>Variedad</th><th>Año</th><th>Há base</th><th>Agua (L)</th>'+
          prods.map(function(ap){ return '<th>'+escapeHtml(ap.nombre||'Prod')+' ('+(ap.unitS||unitBase(ap.unidad||''))+')</th>'; }).join('')+
        '</tr></thead><tbody>'+
        (function(){ var _r=_recalcDistribucionOrden(o); return (_r.filas.length?_r.filas:(o.distribucion||[])); })().map(function(r){
          var prodCells;
          if(r.prods && r.prods.length){
            prodCells = r.prods.map(function(rp){ return '<td style="text-align:right;font-weight:700">'+fmtQtyStr(rp.qty||0,(rp.unitS||unitBase(rp.unidad||'')),2)+'</td>'; }).join('');
          } else {
            prodCells = '<td style="text-align:right;font-weight:700">'+fmtQtyStr(r.prod||0,(prods[0].unitS||unitBase(prods[0].unidad||'')),2)+'</td>';
            for(var k=1;k<prods.length;k++) prodCells += '<td style="text-align:right;color:#bbb">—</td>';
          }
          return '<tr><td><span class="cc-pano-tag"><span class="cc-pano-dot" style="background:'+(r.color||'#888')+'"></span>'+(r.panoNombre||'—')+'</span></td>'+
            '<td style="font-style:italic;color:#888">'+(r.variedad||'—')+'</td><td>'+( r.anio||'—')+'</td>'+
            '<td style="text-align:right">'+fmtN(r.has||0,2)+' há</td>'+
            '<td style="text-align:right">'+(r.agua>0?fmtN(r.agua,0)+' L':'—')+'</td>'+
            prodCells +
            '</tr>';
        }).join('')+
        '</tbody><tfoot><tr><td colspan="3">TOTALES</td>'+
          '<td style="text-align:right">'+fmtN(o.tHas||0,2)+' há</td>'+
          '<td style="text-align:right">'+(o.tAgua>0?fmtN(o.tAgua,0)+' L':'—')+'</td>'+
          prods.map(function(ap){ var apUS=ap.unitS||unitBase(ap.unidad||''); return '<td style="text-align:right;font-weight:700">'+fmtQtyStr(ap.tProd||0,apUS,2)+'</td>'; }).join('')+
        '</tr></tfoot></table></div>'+
        (o.editada ? '<div style="font-size:11px;color:#7a4200;background:#fff8e0;border-left:3px solid #e9730c;padding:6px 10px;margin-top:10px;border-radius:4px">✎ Esta orden fue editada el '+(o.editadaFecha||'—')+(o.editadaPor?' por '+o.editadaPor:'')+'</div>' : '')+
        // ── Bloque de confirmaciones registradas ──
        (function(){
          var confs = (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(o.id); });
          if(!confs.length) return '<div style="background:#f0f4ff;border-left:3px solid #084298;padding:8px 12px;font-size:12px;border-radius:4px;margin-top:10px;color:#084298">⏳ <strong>Sin confirmaciones aún.</strong> Esta orden está pendiente de aplicación.</div>';
          return '<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:6px;border-bottom:1px solid #bcd9f5;padding-bottom:3px">✅ Confirmaciones registradas ('+confs.length+')</div>'+
            confs.map(function(c){
              var pNoms = (c.panoIds||[]).map(function(pid){ var p=getPano(pid); return p?p.nombre:'?'; }).join(', ');
              var prodsTxt = (c.productosReales||[]).map(function(pr){ return escapeHtml(pr.nombre||'')+': '+fmtN(pr.qtyAplicada||0,3)+' '+(pr.unitS||''); }).join(' · ');
              return '<div style="background:#f5f9fd;border-left:3px solid #0a6ed1;padding:8px 11px;margin-bottom:6px;border-radius:4px;font-size:12px">'+
                '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><span><strong>'+c.fechaApp+'</strong> · '+escapeHtml(c.operador||'—')+(c.turno?' · '+c.turno:'')+'</span>'+
                  '<span style="color:#666;font-size:11px">'+(c.horaInicio||'')+(c.horaFin?'→'+c.horaFin:'')+'</span></div>'+
                '<div style="color:#555;font-size:11px;margin-top:3px">Paños: '+escapeHtml(pNoms)+'</div>'+
                '<div style="color:#354a5f;font-size:11px;margin-top:3px">'+prodsTxt+' · Agua: '+fmtN(c.aguaReal||0,0)+' L</div>'+
                ((c.tempAmb!==null&&c.tempAmb!==undefined)||c.humedad!==null||c.viento!==null||c.condClima ?
                  '<div style="color:#666;font-size:10px;margin-top:2px">🌡️ '+
                    (c.tempAmb!==null&&c.tempAmb!==undefined?c.tempAmb+'°C':'') +
                    (c.humedad!==null&&c.humedad!==undefined?' · '+c.humedad+'%HR':'') +
                    (c.viento!==null&&c.viento!==undefined?' · '+c.viento+'km/h':'') +
                    (c.condClima?' · '+escapeHtml(c.condClima):'') +
                  '</div>' : '') +
                (c.notas?'<div style="color:#7a4200;font-size:11px;margin-top:3px;font-style:italic">📝 '+escapeHtml(c.notas)+'</div>':'')+
                '</div>';
            }).join('') + '</div>';
        })() +
        '<div class="cc-gr" style="margin-top:12px">'+
          '<button class="cc-btn cc-btn-gold cc-btn-sm" onclick="openPM(\''+o.id+'\')">🖨️ Imprimir</button>'+
          '<button class="cc-btn cc-btn-sm" style="background:#fff;border:1px solid #d9d9d9;color:#354a5f" onclick="editOrden(\''+o.id+'\')">✏️ Editar</button>'+
          (cfEstadoOrden(o)!=='Completa' ? '<button class="cc-btn cc-btn-sm" style="background:#354a5f;color:#fff;border:none;font-weight:700" onclick="cfDesdeListado(\''+o.id+'\')">✅ Confirmar aplicación</button>' : '')+
          '<button class="cc-btn cc-btn-r cc-btn-sm" onclick="anularOrden(\''+o.id+'\')">🗑️ Eliminar</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}
function toggleEl(id){ var el=document.getElementById(id); if(el) el.style.display=el.style.display==='block'?'none':'block'; }

function editOrden(id){
  var o = S.ordenes.find(function(x){ return String(x.id)===String(id); });
  if(!o){ alert('Orden no encontrada.'); return; }
  // Catálogos
  var fenoOpts = ['Yema dormida','Hinchazón de yema','Punta verde','Oreja de ratón','Verde intenso','Botón blanco','Plena flor','Caída de pétalos','Cuaje','Estadio I – Endurecimiento','Estadio II – Crecimiento lento','Estadio III – Crecimiento rápido','Pinta / Viraje de color','Pre-cosecha','Cosecha','Post-cosecha'];
  var metOpts = ['Aspersión foliar','Drench','Inyección al suelo','Aspersión al suelo','Pulverización'];
  var tipoOpts = ['Foliar','Suelo','Herbicida'];
  var uniOpts = ['mL/100L','L/100L','g/100L','kg/100L','L/ha','kg/ha','mL/ha','g/ha'];
  var feno = fenoOpts.map(function(t){ return '<option'+(t===o.fenologico?' selected':'')+'>'+t+'</option>'; }).join('');
  var met = metOpts.map(function(t){ return '<option'+(t===o.metodo?' selected':'')+'>'+t+'</option>'; }).join('');
  var tipo = tipoOpts.map(function(t){ return '<option'+(t===o.tipoApp?' selected':'')+'>'+t+'</option>'; }).join('');
  var uni = uniOpts.map(function(t){ return '<option'+(t===o.unidad?' selected':'')+'>'+t+'</option>'; }).join('');
  if(uniOpts.indexOf(o.unidad||'')<0 && o.unidad){
    uni = '<option selected>'+escapeHtml(o.unidad)+'</option>' + uni;
  }
  // Chips de paños: marcamos los que están en la orden, permitimos toggle
  var chipsHtml = (S.panos||[]).map(function(p){
    var sel = (o.panoIds||[]).indexOf(p.id)>=0;
    return '<span class="cc-pano-tag" onclick="toggleEditOrdenPano(\''+p.id+'\')" data-pid="'+p.id+'" style="cursor:pointer;padding:6px 11px;border-radius:14px;font-size:12px;display:inline-flex;align-items:center;gap:6px;margin:3px;border:2px solid '+(sel?'#354a5f':'#ccc')+';background:'+(sel?(p.color||'#354a5f')+'20':'#fff')+';font-weight:'+(sel?'700':'500')+'">'+
      '<span class="cc-pano-dot" style="background:'+(p.color||'#888')+';width:10px;height:10px;border-radius:50%;display:inline-block"></span>'+
      escapeHtml(p.nombre)+'</span>';
  }).join('');
  var modal = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto" id="cc-edit-orden-modal">'+
    '<div style="background:#fff;border-radius:10px;max-width:780px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;max-height:96vh;display:flex;flex-direction:column">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'+
        '<div style="font-weight:700;font-size:15px">✏️ Editar orden '+o.numero+'</div>'+
        '<button onclick="closeEditOrden()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>'+
      '</div>'+
      '<div style="padding:18px 20px;overflow-y:auto;flex:1">'+
        '<div style="background:#fffbe6;border-left:3px solid #e9730c;padding:8px 12px;font-size:12px;color:#5a4500;border-radius:4px;margin-bottom:16px">'+
          '<strong>Atención:</strong> al guardar, esta orden quedará marcada como <strong>Editada</strong> con fecha y usuario. El número de orden no cambia.'+
        '</div>'+

        '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px">Datos generales</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">N° Orden</label>'+
            '<input type="text" value="'+escapeHtml(o.numero)+'" readonly style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box;background:#fafafa;color:#888"></div>'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Fecha *</label>'+
            '<input type="date" id="cc-eo-fecha" value="'+escapeHtml(o.fecha||'')+'" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"></div>'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Tipo aplicación *</label>'+
            '<select id="cc-eo-tipo" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box">'+tipo+'</select></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Estado fenológico *</label>'+
            '<select id="cc-eo-fenol" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">—</option>'+feno+'</select></div>'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Especie</label>'+
            '<input type="text" id="cc-eo-esp" value="'+escapeHtml(o.especie||'')+'" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"></div>'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Responsable</label>'+
            '<input type="text" id="cc-eo-resp" value="'+escapeHtml(o.responsable||'')+'" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"></div>'+
        '</div>'+
        // Bloque de objetivos en editor
        '<div style="margin-bottom:14px;background:#fafafa;border:1px solid #e5e5e5;border-radius:6px;padding:10px 12px">'+
          '<div style="font-size:12px;font-weight:700;color:#354a5f;margin-bottom:6px">🎯 Objetivo de la aplicación * <span style="font-size:11px;font-weight:400;color:#666">(seleccione uno o más)</span></div>'+
          '<div id="cc-eo-obj-box">'+ renderObjetivosUI('cc-eo-obj', o.objetivos||[], o.objetivoOtro||'') +'</div>'+
        '</div>'+
        '<div style="margin-bottom:14px">'+
          '<label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Método de aplicación</label>'+
          '<select id="cc-eo-met" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">—</option>'+met+'</select>'+
        '</div>'+

        '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px">Paños incluidos</div>'+
        '<div id="cc-eo-chips" style="margin-bottom:14px;padding:8px;background:#fafafa;border-radius:6px;border:1px solid #e5e5e5">'+chipsHtml+'</div>'+

        '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px">Productos (mezcla)</div>'+
        '<div id="cc-eo-prods" style="margin-bottom:8px"></div>'+
        '<div style="margin-bottom:14px"><button type="button" class="cc-btn cc-btn-sm" style="background:#fff;border:1px solid #0a6ed1;color:#354a5f;font-weight:600" onclick="addEoProd()">➕ Agregar producto a la mezcla</button></div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Mojamiento (L/ha)</label>'+
            '<input type="number" id="cc-eo-moj" step="10" value="'+(o.moj||'')+'" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"></div>'+
          '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">N° Pasadas (V/ha)</label>'+
            '<input type="number" id="cc-eo-vha" min="1" value="'+(o.vha||1)+'" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box"></div>'+
        '</div>'+

        '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px">Notas</div>'+
        '<textarea id="cc-eo-notas" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;box-sizing:border-box;min-height:60px;font-family:inherit;resize:vertical">'+escapeHtml(o.notas||'')+'</textarea>'+

        '<div id="cc-eo-err" style="display:none;background:#fde8e8;color:#8B1A1A;border:1px solid #f0b8b8;border-radius:6px;padding:8px 12px;font-size:12px;margin-top:12px"></div>'+
      '</div>'+
      '<div style="padding:12px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-shrink:0">'+
        '<div style="font-size:11px;color:#888">'+(o.editada?'Última edición: '+(o.editadaFecha||'—'):'Emitida originalmente')+'</div>'+
        '<div style="display:flex;gap:10px">'+
          '<button onclick="closeEditOrden()" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Cancelar</button>'+
          '<button onclick="saveEditOrden(\''+o.id+'\')" style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">Guardar cambios</button>'+
        '</div>'+
      '</div>'+
    '</div></div>';
  var existing = document.getElementById('cc-edit-orden-modal');
  if(existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modal);
  setTimeout(function(){ ccObjUpdateSummary('cc-eo-obj'); }, 30);
  // Inicializar lista de productos de la orden en edición
  var prods0 = (o.productos && o.productos.length) ? o.productos.slice() : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad}];
  // Garantizar al menos 1 producto (el principal)
  if(prods0.length===0) prods0 = [{nombre:'', dosis:'', unidad:'mL/100L'}];
  _eoProds = prods0.map(function(p){ return {nombre:p.nombre||'', dosis:p.dosis||'', unidad:p.unidad||'mL/100L'}; });
  _renderEoProds();
}
// Estado de productos en el editor de orden
var _eoProds = [];
function _renderEoProds(){
  var el = document.getElementById('cc-eo-prods'); if(!el) return;
  el.innerHTML = _eoProds.map(function(p, i){
    var nombre = escapeHtml(p.nombre||'');
    var dosis = (p.dosis||p.dosis===0)?p.dosis:'';
    var unidad = p.unidad||'mL/100L';
    var canDelete = _eoProds.length>1;
    var uniOpts = ['mL/100L','L/100L','g/100L','kg/100L','L/ha','kg/ha','mL/ha','g/ha'];
    var optsStr = uniOpts.map(function(u){ return '<option value="'+u+'"'+(u===unidad?' selected':'')+'>'+u+'</option>'; }).join('');
    if(uniOpts.indexOf(unidad)<0 && unidad){
      optsStr = '<option value="'+escapeHtml(unidad)+'" selected>'+escapeHtml(unidad)+'</option>'+optsStr;
    }
    return '<div class="cc-ac-wrap" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:8px;background:'+(i===0?'#f5f9fd':'#fafafa')+';border:1px solid '+(i===0?'#bcd9f5':'#e8e8e8')+';border-radius:6px;position:relative">'+
      '<div class="cc-ac-wrap" style="position:relative"><label style="display:block;font-size:10px;color:#555;font-weight:600;margin-bottom:3px">'+(i===0?'Producto principal *':'Producto '+(i+1))+'</label>'+
        '<input type="text" id="cc-eo-p-n-'+i+'" value="'+nombre+'" oninput="showAC(\'cc-eo-p-n-'+i+'\',\'cc-eo-p-ac-'+i+'\')" onblur="setTimeout(()=>hide(\'cc-eo-p-ac-'+i+'\'),200);_syncEoProds();" style="width:100%;padding:7px 9px;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;box-sizing:border-box">'+
        '<div class="cc-ac-list" id="cc-eo-p-ac-'+i+'" style="display:none"></div></div>'+
      '<div><label style="display:block;font-size:10px;color:#555;font-weight:600;margin-bottom:3px">Dosis '+(i===0?'*':'')+'</label>'+
        '<input type="number" step="0.001" id="cc-eo-p-d-'+i+'" value="'+dosis+'" style="width:100%;padding:7px 9px;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;box-sizing:border-box"></div>'+
      '<div><label style="display:block;font-size:10px;color:#555;font-weight:600;margin-bottom:3px">Unidad</label>'+
        '<select id="cc-eo-p-u-'+i+'" style="width:100%;padding:7px 9px;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;box-sizing:border-box">'+optsStr+'</select></div>'+
      '<div>'+(canDelete?'<button type="button" onclick="removeEoProd('+i+')" class="cc-btn cc-btn-sm cc-btn-r" style="font-size:12px" title="Quitar">✕</button>':'<div style="width:30px"></div>')+'</div>'+
    '</div>';
  }).join('');
}
function _syncEoProds(){
  _eoProds.forEach(function(p, i){
    var n = document.getElementById('cc-eo-p-n-'+i);
    var d = document.getElementById('cc-eo-p-d-'+i);
    var u = document.getElementById('cc-eo-p-u-'+i);
    if(n) p.nombre = n.value.trim();
    if(d) p.dosis = d.value;
    if(u) p.unidad = u.value;
  });
}
function addEoProd(){
  _syncEoProds();
  _eoProds.push({nombre:'', dosis:'', unidad:'mL/100L'});
  _renderEoProds();
}
function removeEoProd(idx){
  if(_eoProds.length<=1) return; // mantener al menos el principal
  _syncEoProds();
  _eoProds.splice(idx, 1);
  _renderEoProds();
}
function closeEditOrden(){
  var m = document.getElementById('cc-edit-orden-modal');
  if(m) m.remove();
}
function toggleEditOrdenPano(pid){
  var chip = document.querySelector('#cc-eo-chips [data-pid="'+pid+'"]');
  if(!chip) return;
  var sel = chip.style.borderColor === 'rgb(30, 61, 15)' || chip.getAttribute('data-sel')==='1';
  // Toggle visualmente
  if(sel){
    chip.style.borderColor = '#ccc';
    chip.style.background = '#fff';
    chip.style.fontWeight = '500';
    chip.setAttribute('data-sel','0');
  } else {
    var p = (S.panos||[]).find(function(x){ return String(x.id)===String(pid); });
    chip.style.borderColor = '#354a5f';
    chip.style.background = (p && p.color ? p.color : '#354a5f')+'20';
    chip.style.fontWeight = '700';
    chip.setAttribute('data-sel','1');
  }
}
function saveEditOrden(id){
  var o = S.ordenes.find(function(x){ return String(x.id)===String(id); });
  if(!o){ closeEditOrden(); return; }
  var err = document.getElementById('cc-eo-err');
  function setErr(msg){ err.style.display=''; err.textContent=msg; }

  var fecha = document.getElementById('cc-eo-fecha').value;
  var tipo = document.getElementById('cc-eo-tipo').value;
  var fenol = document.getElementById('cc-eo-fenol').value;
  var moj = parseFloat(document.getElementById('cc-eo-moj').value)||0;
  var vha = parseFloat(document.getElementById('cc-eo-vha').value)||1;
  // Sincronizar productos del editor
  _syncEoProds();
  // Recolectar paños seleccionados
  var selPanos = [];
  Array.prototype.forEach.call(document.querySelectorAll('#cc-eo-chips [data-pid]'), function(chip){
    var sel = chip.getAttribute('data-sel');
    if(sel===null){
      var bc = chip.style.borderColor;
      if(bc==='rgb(30, 61, 15)' || bc==='#354a5f') sel='1'; else sel='0';
    }
    if(sel==='1') selPanos.push(chip.getAttribute('data-pid'));
  });

  // Validar producto principal
  var p0 = _eoProds[0]||{};
  var prod0nombre = (p0.nombre||'').trim();
  var prod0dosis = parseFloat(p0.dosis)||0;
  var prod0uni = p0.unidad||'';
  if(!fecha||!tipo||!fenol||!prod0nombre||!prod0dosis||!prod0uni||!selPanos.length){
    setErr('Completa: fecha, tipo, estado fenológico, producto principal con dosis y unidad, y al menos un paño.'); return;
  }
  // Validar objetivo
  var objDataE = readObjetivosUI('cc-eo-obj');
  var totalObjsE = objDataE.objetivos.length + (objDataE.objetivoOtro?1:0);
  if(totalObjsE===0){
    setErr('Seleccione al menos un objetivo de la aplicación.'); return;
  }

  // Construir array de productos válidos (descartar filas vacías excepto la principal que ya validamos)
  var productos = [];
  _eoProds.forEach(function(ep, i){
    var n = (ep.nombre||'').trim();
    var d = parseFloat(ep.dosis)||0;
    var u = ep.unidad||'';
    if(i===0 || (n && d>0 && u)){
      productos.push({nombre:n, dosis:d, unidad:u, unitS:unitBase(u)});
    }
  });

  var mojT = moj * vha;
  // Hectáreas del grupo: paño padre + sus polinizantes hijos
  var esFertiE = (tipo==='Fertirriego');
  function _hasPanoE(px){ return px ? (esFertiE ? (parseFloat(px.has_riego)||0) : (parseFloat(px.hectareas)||0)) : 0; }
  function _hasGrupoE(px){
    var t=_hasPanoE(px);
    (S.panos||[]).forEach(function(h){
      if((h.tipo||'Productivo')==='Polinizante' && String(h.panoPadre)===String(px.id)) t+=_hasPanoE(h);
    });
    return t;
  }
  // Distribuir SOLO en paños padres (no polinizantes), con las há del grupo
  var padresSel = selPanos.filter(function(pid){
    var px=(S.panos||[]).find(function(x){ return String(x.id)===String(pid); });
    return px && (px.tipo||'Productivo')!=='Polinizante';
  });
  // Recalcular distribución por paño y producto
  var dist = padresSel.map(function(pid){
    var p = (S.panos||[]).find(function(x){ return String(x.id)===String(pid); });
    if(!p) return null;
    var has = _hasGrupoE(p);
    var agua = mojT * has;
    var prodQty = _calcProdQty(prod0dosis, prod0uni, has, mojT);
    var prodsByPano = productos.map(function(ap){
      return {nombre:ap.nombre, qty:_calcProdQty(ap.dosis, ap.unidad, has, mojT), unitS:ap.unitS, unidad:ap.unidad, dosis:ap.dosis};
    });
    return { panoId:p.id, panoNombre:p.nombre, variedad:p.variedad, anio:p.anio, color:p.color, has:has, agua:agua, prod:prodQty, prods:prodsByPano };
  }).filter(function(x){ return x; });
  var tHas = dist.reduce(function(s,r){ return s+r.has; }, 0);
  var tAgua = dist.reduce(function(s,r){ return s+r.agua; }, 0);
  var tProd = dist.reduce(function(s,r){ return s+r.prod; }, 0);
  // Calcular tProd y margin por producto
  productos.forEach(function(ap, i){
    ap.tProd = dist.reduce(function(s,r){ return s + ((r.prods && r.prods[i] && r.prods[i].qty) || 0); }, 0);
    ap.margin = ap.tProd;
  });

  // Actualizar la orden
  o.fecha = fecha;
  o.tipoApp = tipo;
  o.fenologico = fenol;
  o.objetivos = objDataE.objetivos;
  o.objetivoOtro = objDataE.objetivoOtro;
  o.especie = document.getElementById('cc-eo-esp').value;
  o.responsable = document.getElementById('cc-eo-resp').value;
  o.metodo = document.getElementById('cc-eo-met').value;
  o.panoIds = selPanos.slice();
  // Compat: campos legacy del producto principal
  o.producto = prod0nombre;
  o.dosis = prod0dosis;
  o.unidad = prod0uni;
  o.unitS = unitBase(prod0uni);
  // Nuevo: array de productos
  o.productos = productos;
  o.moj = moj;
  o.vha = vha;
  o.mojT = mojT;
  o.notas = document.getElementById('cc-eo-notas').value;
  o.distribucion = dist;
  o.tHas = tHas;
  o.tAgua = tAgua;
  o.tProd = tProd;
  o.margin = tProd;
  // Marca de edición
  o.editada = true;
  var now = new Date();
  o.editadaFecha = now.toISOString().slice(0,16).replace('T',' ');
  try{ if(typeof STATE!=='undefined' && STATE.user && STATE.user.usuario){ o.editadaPor = STATE.user.usuario; } }catch(e){}

  save();
  closeEditOrden();
  renderOrdenesList();
  if(typeof renderHeader==='function') renderHeader();
  if(typeof showNotice==='function') showNotice('Orden '+o.numero+' actualizada.','ok');
}


// ══════════════════════════════════════════════════════════════════
//  MÓDULO DE CONFIRMACIÓN DE APLICACIONES
// ══════════════════════════════════════════════════════════════════
// Estructura de cada confirmación:
//  { id, ordenId, ordenNumero, fechaApp, horaInicio, horaFin, operador,
//    equipo, turno, tempAmb, humedad, viento, condClima, panoIds:[...],
//    productosReales:[{nombre, qtyAplicada, unitS}], aguaReal, notas,
//    creada (timestamp), creadaPor (usuario), modificada, modificadaPor }
//
// El "estado" de una orden se calcula:
//   "Pendiente" — sin confirmaciones
//   "Parcial"   — algunos paños confirmados (1+ confirmaciones, pero no cubren todos los paños)
//   "Completa"  — todos los paños confirmados (al menos una vez)
function cfEstadoOrden(o){
  if(!o) return 'Pendiente';
  var confs = (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(o.id); });
  if(!confs.length) return 'Pendiente';
  // Si la orden no tiene paños, no puede estar "completa" (sería un dato inválido)
  if(!o.panoIds || !o.panoIds.length) return 'Pendiente';
  var coveredPanos = {};
  confs.forEach(function(c){ (c.panoIds||[]).forEach(function(pid){ coveredPanos[pid]=true; }); });
  // ¿Todos los paños de la orden están cubiertos por alguna confirmación?
  var todos = o.panoIds.every(function(pid){ return coveredPanos[pid]; });
  return todos ? 'Completa' : 'Parcial';
}
function cfPanosCubiertos(o){
  // Devuelve un Set de panoIds que ya tienen al menos una confirmación
  var s = {};
  (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(o.id); }).forEach(function(c){
    (c.panoIds||[]).forEach(function(pid){ s[pid]=true; });
  });
  return s;
}

// Estado del formulario de confirmación
var _cfOrdenActual = null;     // referencia a la orden cargada
var _cfPanosSel = [];          // paños seleccionados en el formulario

function cfBuscarOrden(){
  var input = document.getElementById('cc-cf-num');
  var listEl = document.getElementById('cc-cf-ac');
  var q = (input.value||'').trim().toLowerCase();
  if(!q){
    listEl.style.display='none';
    return;
  }
  // Mostrar órdenes que coincidan, priorizando las Pendientes/Parciales
  var matches = (S.ordenes||[]).filter(function(o){
    return o.numero && o.numero.toLowerCase().indexOf(q)>=0;
  }).slice(0,8);
  if(!matches.length){
    listEl.style.display='none';
    return;
  }
  listEl.innerHTML = matches.map(function(o){
    var estado = cfEstadoOrden(o);
    var col = estado==='Completa' ? '#23303d' : (estado==='Parcial' ? '#7a4200' : '#084298');
    var bg = estado==='Completa' ? '#d1e7dd' : (estado==='Parcial' ? '#fff8e0' : '#e0f0ff');
    var prods = (o.productos && o.productos.length) ? o.productos : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad}];
    var prodResumen = prods[0].nombre + (prods.length>1 ? ' +'+(prods.length-1) : '');
    return '<div class="cc-ac-item" onmousedown="cfSelOrden(\''+o.id+'\')">'+
      '<strong>'+o.numero+'</strong> <span style="background:'+bg+';color:'+col+';padding:1px 7px;border-radius:10px;font-size:10px;margin-left:6px">'+estado+'</span>'+
      '<div class="cc-ac-sub">'+o.fecha+' · '+escapeHtml(prodResumen)+'</div></div>';
  }).join('');
  listEl.style.display = '';
}
function cfSelOrden(id){
  var o = (S.ordenes||[]).find(function(x){ return String(x.id)===String(id); });
  if(!o){ alert('Orden no encontrada.'); return; }
  document.getElementById('cc-cf-num').value = o.numero;
  document.getElementById('cc-cf-ac').style.display = 'none';
  cfCargarDetalle(o.id);
}

function cfCargarDetalle(ordenId){
  var o = (S.ordenes||[]).find(function(x){ return String(x.id)===String(ordenId); });
  var info = document.getElementById('cc-cf-found-info');
  var det = document.getElementById('cc-cf-detail');
  var listSec = document.getElementById('cc-cf-list-section');
  if(!o){
    info.innerHTML = '<span style="color:#8B1A1A">⚠ No se encontró la orden.</span>';
    det.style.display = 'none';
    listSec.style.display = 'none';
    return;
  }
  _cfOrdenActual = o;
  var estado = cfEstadoOrden(o);
  var col = estado==='Completa' ? '#23303d' : (estado==='Parcial' ? '#7a4200' : '#084298');
  var bg = estado==='Completa' ? '#d1e7dd' : (estado==='Parcial' ? '#fff8e0' : '#e0f0ff');
  info.innerHTML = '✓ Orden cargada: <strong>'+o.numero+'</strong> · '+o.fecha+' · '+o.tipoApp+' <span style="background:'+bg+';color:'+col+';padding:2px 9px;border-radius:10px;font-size:11px;margin-left:8px">'+estado+'</span>';

  // Construir lista de productos planificados
  var prods = (o.productos && o.productos.length) ? o.productos : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad, unitS:unitBase(o.unidad||''), tProd:o.tProd}];

  // Paños cubiertos por confirmaciones previas
  var cubiertos = cfPanosCubiertos(o);

  // Pre-seleccionar SOLO paños no cubiertos aún
  _cfPanosSel = (o.panoIds||[]).filter(function(pid){ return !cubiertos[pid]; });

  // Render chips de paños con estado
  var chipsHtml = (o.panoIds||[]).map(function(pid){
    var p = getPano(pid);
    var pn = p ? p.nombre : '?';
    var col = p ? (p.color||'#888') : '#888';
    var isCubierto = !!cubiertos[pid];
    var preSel = _cfPanosSel.indexOf(pid)>=0;
    var bgChip = isCubierto ? '#e8e8e8' : (preSel ? col+'25' : '#fff');
    var borderChip = isCubierto ? '#aaa' : (preSel ? '#354a5f' : '#ccc');
    var sufix = isCubierto ? ' ✓ (ya aplicado)' : '';
    return '<span class="cc-pano-tag" data-pid="'+pid+'" data-cubierto="'+(isCubierto?'1':'0')+'" data-sel="'+(preSel?'1':'0')+'" onclick="cfTogglePano(\''+pid+'\')" style="cursor:'+(isCubierto?'not-allowed':'pointer')+';padding:7px 12px;border-radius:14px;font-size:12px;display:inline-flex;align-items:center;gap:6px;margin:3px;border:2px solid '+borderChip+';background:'+bgChip+';font-weight:'+(preSel?'700':'500')+';opacity:'+(isCubierto?'0.7':'1')+';user-select:none">'+
      '<span class="cc-pano-dot" style="background:'+col+';width:10px;height:10px;border-radius:50%;display:inline-block;pointer-events:none"></span>'+
      '<span style="pointer-events:none">'+escapeHtml(pn) + sufix + '</span></span>';
  }).join('');

  // Render filas de productos: planificado + calculado automáticamente
  // (la cantidad real se infiere proporcionalmente del agua aplicada)
  var productosRows = prods.map(function(ap, i){
    var apUS = ap.unitS || unitBase(ap.unidad||'');
    var planeado = ap.tProd || 0;
    var convP = fmtQtyAuto(planeado, apUS);
    return '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;align-items:end;margin-bottom:8px;padding:9px;background:#f5f9fd;border:1px solid #bcd9f5;border-radius:6px" data-prod-idx="'+i+'" data-prod-planeado="'+planeado+'" data-prod-us="'+apUS+'">'+
      '<div><div style="font-size:10px;font-weight:700;color:#354a5f;margin-bottom:3px">'+(i===0?'Producto principal':'Producto '+(i+1))+'</div>'+
        '<div style="font-weight:700;font-size:13px">'+escapeHtml(ap.nombre||'—')+'</div>'+
        '<div style="font-size:11px;color:#666">Dosis: '+ap.dosis+' '+(ap.unidad||'')+'</div></div>'+
      '<div><label style="display:block;font-size:10px;color:#555;font-weight:600;margin-bottom:3px">Planificado (total)</label>'+
        '<div style="padding:7px 9px;background:#fff;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;color:#888">'+fmtN(convP.qty,2)+' '+convP.unit+'</div></div>'+
      '<div><label style="display:block;font-size:10px;color:#555;font-weight:600;margin-bottom:3px">Aplicado (calculado)</label>'+
        '<div id="cc-cf-prod-'+i+'" style="padding:7px 9px;background:#fffefb;border:1px solid #0a6ed1;border-radius:5px;font-size:13px;font-weight:700;color:#354a5f">'+fmtN(convP.qty,2)+' '+convP.unit+'</div>'+
        '<div style="font-size:10px;color:#888;margin-top:2px">se recalcula con el agua aplicada</div></div>'+
    '</div>';
  }).join('');

  // Fecha y hora actuales por defecto
  var nowDate = new Date();
  var hh = String(nowDate.getHours()).padStart(2,'0');
  var mm = String(nowDate.getMinutes()).padStart(2,'0');
  var horaActual = hh+':'+mm;
  var fechaActual = nowDate.toISOString().slice(0,10);
  var aguaPlaneada = o.tAgua || 0;

  // Turno automático según hora
  var turnoSug = 'Mañana';
  if(nowDate.getHours() >= 12 && nowDate.getHours() < 19) turnoSug = 'Tarde';
  else if(nowDate.getHours() >= 19) turnoSug = 'Noche';
  else if(nowDate.getHours() < 6) turnoSug = 'Madrugada';

  det.innerHTML =
    '<div class="cc-card">'+
      '<div class="cc-card-ttl">✅ Confirmar aplicación de '+o.numero+'</div>'+

      // Resumen de la orden
      '<div style="background:#fafafa;border-left:3px solid #0a6ed1;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:12px">'+
        '<strong>📋 Datos de la orden:</strong><br>'+
        'Tipo: '+o.tipoApp+' · Fenológico: '+o.fenologico+' · Responsable técnico: '+(o.responsable||'—')+'<br>'+
        'Mojamiento: '+(o.mojT||o.moj||'—')+' L/ha total · Método: '+(o.metodo||'—')+
      '</div>'+

      // Paños
      '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:6px;border-bottom:1px solid #e5e5e5;padding-bottom:3px">Paños a confirmar en esta aplicación</div>'+
      '<div style="font-size:11px;color:#666;margin-bottom:8px">Click en cada paño para incluirlo/excluirlo. Los marcados con ✓ ya fueron confirmados antes y no se pueden seleccionar.</div>'+
      '<div id="cc-cf-chips" style="margin-bottom:14px;padding:8px;background:#fafafa;border-radius:6px;border:1px solid #e5e5e5">'+chipsHtml+'</div>'+

      // Productos
      '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:6px;border-bottom:1px solid #e5e5e5;padding-bottom:3px">Cantidades realmente aplicadas</div>'+
      '<div style="font-size:11px;color:#666;margin-bottom:8px">Ajuste los valores si difieren del planificado.</div>'+
      productosRows +

      // Agua aplicada
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;margin-top:10px">'+
        '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Agua/caldo planificado (L)</label>'+
          '<div style="padding:7px 9px;background:#fafafa;border:1px solid #d9d9d9;border-radius:5px;font-size:12px;color:#888">'+fmtN(aguaPlaneada,0)+' L</div></div>'+
        '<div><label style="display:block;font-size:11px;color:#555;font-weight:600;margin-bottom:3px">Agua/caldo aplicada (L) *</label>'+
          '<input type="number" step="1" id="cc-cf-agua" value="'+Math.round(aguaPlaneada)+'" oninput="cfRecalcProductos()" style="width:100%;padding:7px 9px;border:1px solid #0a6ed1;background:#fffefb;border-radius:5px;font-size:13px;font-weight:700;color:#354a5f;box-sizing:border-box">'+
          '<div style="font-size:10px;color:#888;margin-top:2px">Plan: '+Math.round(aguaPlaneada)+' L · ajuste para recalcular productos</div></div>'+
      '</div>'+

      // Datos del operador y equipo
      '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:6px;border-bottom:1px solid #e5e5e5;padding-bottom:3px">Operador y equipo</div>'+
      '<div class="cc-g3" style="margin-bottom:14px">'+
        '<div class="cc-field"><label class="cc-lbl">Fecha de aplicación *</label><input type="date" id="cc-cf-fecha" value="'+fechaActual+'"></div>'+
        '<div class="cc-field"><label class="cc-lbl">Hora inicio</label><input type="time" id="cc-cf-hini" value="'+horaActual+'"></div>'+
        '<div class="cc-field"><label class="cc-lbl">Hora fin</label><input type="time" id="cc-cf-hfin"></div>'+
      '</div>'+
      '<div class="cc-g3" style="margin-bottom:14px">'+
        '<div class="cc-field"><label class="cc-lbl">Operador *</label><input type="text" id="cc-cf-op" placeholder="Nombre del aplicador"></div>'+
        '<div class="cc-field"><label class="cc-lbl">Equipo usado</label><select id="cc-cf-eq"><option value="">— Seleccione —</option>'+(S.equipos||[]).map(function(e){ return '<option value="'+escapeHtml(e.nombre)+'">'+escapeHtml(e.nombre)+(e.capacidad>0?' ('+e.capacidad+' L)':'')+'</option>'; }).join('')+'</select></div>'+
        '<div class="cc-field"><label class="cc-lbl">Turno</label>'+
          '<select id="cc-cf-turno">'+
            '<option value="Mañana"'+(turnoSug==='Mañana'?' selected':'')+'>Mañana</option>'+
            '<option value="Tarde"'+(turnoSug==='Tarde'?' selected':'')+'>Tarde</option>'+
            '<option value="Noche"'+(turnoSug==='Noche'?' selected':'')+'>Noche</option>'+
            '<option value="Madrugada"'+(turnoSug==='Madrugada'?' selected':'')+'>Madrugada</option>'+
          '</select></div>'+
      '</div>'+

      // Condiciones ambientales
      '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#354a5f;margin-bottom:6px;border-bottom:1px solid #e5e5e5;padding-bottom:3px">Condiciones ambientales</div>'+
      '<div class="cc-g3" style="margin-bottom:14px">'+
        '<div class="cc-field"><label class="cc-lbl">Temperatura (°C)</label><input type="number" step="0.1" id="cc-cf-temp" placeholder="Ej: 22.5"></div>'+
        '<div class="cc-field"><label class="cc-lbl">Humedad relativa (%)</label><input type="number" step="1" min="0" max="100" id="cc-cf-hum" placeholder="Ej: 65"></div>'+
        '<div class="cc-field"><label class="cc-lbl">Viento (km/h)</label><input type="number" step="0.5" id="cc-cf-viento" placeholder="Ej: 5"></div>'+
      '</div>'+
      '<div class="cc-field" style="margin-bottom:14px">'+
        '<label class="cc-lbl">Condición climática</label>'+
        '<select id="cc-cf-clima">'+
          '<option value="">—</option>'+
          '<option>Despejado</option><option>Mayormente despejado</option><option>Parcialmente nublado</option>'+
          '<option>Nublado</option><option>Llovizna</option><option>Lluvia</option><option>Viento fuerte</option>'+
        '</select>'+
      '</div>'+

      // Notas
      '<div class="cc-field" style="margin-bottom:14px">'+
        '<label class="cc-lbl">Observaciones del operador</label>'+
        '<textarea id="cc-cf-notas" placeholder="Incidencias, ajustes realizados, condiciones particulares..."></textarea>'+
      '</div>'+

      '<div id="cc-cf-err" style="display:none" class="cc-notice cc-notice-err"></div>'+

      '<div class="cc-gr" style="margin-top:12px">'+
        '<button class="cc-btn cc-btn-g" onclick="cfGuardar()">✓ Guardar confirmación</button>'+
        '<button class="cc-btn" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889" onclick="cfLimpiar()">Limpiar formulario</button>'+
      '</div>'+
    '</div>';
  det.style.display = '';
  listSec.style.display = '';
  cfRefrescarLista();
  // Recalcular productos para reflejar el agua inicial (planificada)
  setTimeout(cfRecalcProductos, 30);
}

function cfTogglePano(pid){
  var chip = document.querySelector('#cc-cf-chips [data-pid="'+pid+'"]');
  if(!chip) return;
  // No permitir toggle de paños ya cubiertos por confirmaciones previas
  if(chip.getAttribute('data-cubierto')==='1') return;
  var sel = chip.getAttribute('data-sel')==='1';
  if(sel){
    // Deseleccionar
    var idx = _cfPanosSel.indexOf(pid);
    if(idx>=0) _cfPanosSel.splice(idx,1);
    chip.setAttribute('data-sel','0');
    chip.style.background = '#fff';
    chip.style.borderColor = '#ccc';
    chip.style.fontWeight = '500';
  } else {
    // Seleccionar
    if(_cfPanosSel.indexOf(pid)<0) _cfPanosSel.push(pid);
    var p = getPano(pid);
    chip.setAttribute('data-sel','1');
    chip.style.background = (p && p.color ? p.color : '#354a5f')+'25';
    chip.style.borderColor = '#354a5f';
    chip.style.fontWeight = '700';
  }
}


// Recalcula la cantidad de cada producto en función del agua aplicada
// Fórmula: cantidad_real = cantidad_planificada × (agua_real / agua_planificada)
// Si agua_planificada es 0 (orden sin agua, ej: producto seco aplicado al suelo),
// se asume que aplicaron el 100% del producto planificado.
function cfRecalcProductos(){
  var o = _cfOrdenActual;
  if(!o) return;
  var aguaReal = parseFloat((document.getElementById('cc-cf-agua')||{}).value)||0;
  var aguaPlan = parseFloat(o.tAgua)||0;
  // Factor de proporción
  var factor;
  if(aguaPlan>0){
    factor = aguaReal / aguaPlan;
  } else {
    factor = 1; // sin agua planificada, asumir 100%
  }
  // Recorrer cada fila de producto y actualizar el display
  document.querySelectorAll('[data-prod-idx]').forEach(function(row){
    var i = row.getAttribute('data-prod-idx');
    var planeado = parseFloat(row.getAttribute('data-prod-planeado'))||0;
    var us = row.getAttribute('data-prod-us')||'';
    var real = planeado * factor;
    var conv = fmtQtyAuto(real, us);
    var display = document.getElementById('cc-cf-prod-'+i);
    if(display){
      display.textContent = fmtN(conv.qty,2)+' '+conv.unit;
      // Alerta visual si difiere >10%
      var diffPct = factor>0 ? Math.abs(factor-1)*100 : 100;
      if(diffPct>10){
        display.style.background = '#fff8e0';
        display.style.borderColor = '#e9730c';
        display.style.color = '#7a4200';
      } else {
        display.style.background = '#fffefb';
        display.style.borderColor = '#0a6ed1';
        display.style.color = '#354a5f';
      }
    }
  });
}

function cfGuardar(){
  var o = _cfOrdenActual;
  if(!o){ alert('Cargue una orden primero.'); return; }
  var err = document.getElementById('cc-cf-err');
  function setErr(msg){ err.style.display=''; err.textContent=msg; }

  var fecha = document.getElementById('cc-cf-fecha').value;
  var hini = document.getElementById('cc-cf-hini').value;
  var hfin = document.getElementById('cc-cf-hfin').value;
  var op = (document.getElementById('cc-cf-op').value||'').trim();
  var eq = (document.getElementById('cc-cf-eq').value||'').trim();
  var turno = document.getElementById('cc-cf-turno').value;
  var temp = parseFloat(document.getElementById('cc-cf-temp').value);
  var hum = parseFloat(document.getElementById('cc-cf-hum').value);
  var viento = parseFloat(document.getElementById('cc-cf-viento').value);
  var clima = document.getElementById('cc-cf-clima').value;
  var notas = document.getElementById('cc-cf-notas').value;
  var aguaReal = parseFloat(document.getElementById('cc-cf-agua').value)||0;

  if(!fecha){ setErr('Ingrese la fecha de aplicación.'); return; }
  if(!op){ setErr('Ingrese el nombre del operador.'); return; }
  // Recolectar paños desde el DOM (fuente de verdad: lo que el usuario ve marcado)
  var panosFinales = [];
  Array.prototype.forEach.call(document.querySelectorAll('#cc-cf-chips [data-pid]'), function(chip){
    if(chip.getAttribute('data-cubierto')==='1') return; // ya estaba aplicado, ignorar
    if(chip.getAttribute('data-sel')==='1') panosFinales.push(chip.getAttribute('data-pid'));
  });
  // Sincronizar el array global con el DOM
  _cfPanosSel = panosFinales.slice();
  if(!_cfPanosSel.length){ setErr('Seleccione al menos un paño para confirmar.'); return; }

  // Calcular cantidades reales por proporción de agua aplicada vs planificada
  var prods = (o.productos && o.productos.length) ? o.productos : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad, unitS:unitBase(o.unidad||''), tProd:o.tProd}];
  var aguaPlan = parseFloat(o.tAgua)||0;
  var factor = aguaPlan>0 ? (aguaReal/aguaPlan) : 1;
  var productosReales = prods.map(function(ap, i){
    var apUS = ap.unitS || unitBase(ap.unidad||'');
    var planeado = ap.tProd||0;
    var realRaw = planeado * factor;
    // Convertir a la unidad escalada (igual que se muestra)
    var conv = fmtQtyAuto(realRaw, apUS);
    return {nombre:ap.nombre, qtyAplicada:conv.qty, unitS:conv.unit, planeado:planeado, planeadoUS:apUS, factor:factor};
  });
  err.style.display='none';

  var now = new Date();
  // Folio único correlativo (CF-0001, CF-0002, ...) con referencia a la orden
  S.cfFolioSeq = (parseInt(S.cfFolioSeq)||0) + 1;
  var folio = 'CA-' + String(S.cfFolioSeq).padStart(6,'0');
  var confirmacion = {
    id: Date.now(),
    folio: folio,
    ordenId: o.id,
    ordenNumero: o.numero,
    fechaApp: fecha,
    horaInicio: hini,
    horaFin: hfin,
    operador: op,
    equipo: eq,
    turno: turno,
    tempAmb: isNaN(temp)?null:temp,
    humedad: isNaN(hum)?null:hum,
    viento: isNaN(viento)?null:viento,
    condClima: clima,
    panoIds: _cfPanosSel.slice(),
    productosReales: productosReales,
    aguaReal: aguaReal,
    notas: notas,
    creada: now.toISOString().slice(0,16).replace('T',' '),
    creadaPor: (typeof STATE!=='undefined' && STATE.user && STATE.user.usuario) ? STATE.user.usuario : ''
  };
  S.confirmaciones = S.confirmaciones || [];
  S.confirmaciones.unshift(confirmacion);
  save();
  if(typeof showNotice==='function') showNotice('Confirmación registrada para '+o.numero+'.','ok');
  // El contador de Aplicaciones del encabezado cuenta confirmaciones: refrescarlo
  // aquí evita que quede desfasado hasta el próximo cambio de pestaña.
  if(typeof renderHeader==='function') renderHeader();

  // Recargar la vista (estado puede haber cambiado de Pendiente→Parcial→Completa)
  cfCargarDetalle(o.id);
}

function cfLimpiar(){
  ['cc-cf-fecha','cc-cf-hini','cc-cf-hfin','cc-cf-op','cc-cf-eq','cc-cf-temp','cc-cf-hum','cc-cf-viento','cc-cf-clima','cc-cf-notas','cc-cf-agua'].forEach(function(id){
    var el = document.getElementById(id);
    if(el){ if(el.tagName==='SELECT') el.selectedIndex=0; else el.value=''; }
  });
  document.getElementById('cc-cf-err').style.display='none';
}

/* Formato de impresión de una confirmación de aplicación (carta). */
function cfImprimir(id){
  var c = (S.confirmaciones||[]).find(function(x){ return String(x.id)===String(id); });
  if(!c){ showNotice('Confirmación no encontrada','err'); return; }
  var orden=(S.ordenes||[]).find(function(o){ return String(o.id)===String(c.ordenId); });
  // Distribución por paño: solo padres, há del grupo (padre + polinizantes hijos)
  var esFertiC = orden && (orden.tipoApp==='Fertirriego');
  var _hasPC=function(px){ return px ? (esFertiC ? (parseFloat(px.has_riego)||0) : (parseFloat(px.hectareas)||0)) : 0; };
  var _hasGC=function(px){
    var t=_hasPC(px);
    (S.panos||[]).forEach(function(h){ if((h.tipo||'Productivo')==='Polinizante' && String(h.panoPadre)===String(px.id)) t+=_hasPC(h); });
    return t;
  };
  var padres=(c.panoIds||[]).map(function(pid){ return getPano(pid); })
    .filter(function(p){ return p && (p.tipo||'Productivo')!=='Polinizante'; });
  var haTotal=padres.reduce(function(s,p){ return s+_hasGC(p); },0);
  var prodsC=(c.productosReales||[]);
  var thProds=prodsC.map(function(pr){ return '<th style="text-align:right">'+escapeHtml(pr.nombre||'—')+'</th>'; }).join('');
  var panosRows=padres.map(function(p){
    var hg=_hasGC(p); var share=haTotal>0?hg/haTotal:0;
    var tds=prodsC.map(function(pr){
      return '<td style="padding:5px 8px;border:1px solid #ccc;text-align:right">'+fmtN((pr.qtyAplicada||0)*share,3)+' '+escapeHtml(pr.unitS||'')+'</td>';
    }).join('');
    return '<tr><td style="padding:5px 8px;border:1px solid #ccc">'+escapeHtml(p.nombre)+'</td>'+
      '<td style="padding:5px 8px;border:1px solid #ccc">'+escapeHtml(p.variedad||'—')+'</td>'+
      '<td style="padding:5px 8px;border:1px solid #ccc;text-align:right">'+fmtN(hg,2)+'</td>'+
      '<td style="padding:5px 8px;border:1px solid #ccc;text-align:right">'+fmtN((c.aguaReal||0)*share,0)+'</td>'+tds+'</tr>';
  }).join('');
  var prodsRows=(c.productosReales||[]).map(function(pr){
    return '<tr><td style="padding:5px 8px;border:1px solid #ccc">'+escapeHtml(pr.nombre||'—')+'</td>'+
      '<td style="padding:5px 8px;border:1px solid #ccc;text-align:right">'+fmtN(pr.planeado||0,3)+' '+escapeHtml(pr.planeadoUS||'')+'</td>'+
      '<td style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-weight:700">'+fmtN(pr.qtyAplicada||0,3)+' '+escapeHtml(pr.unitS||'')+'</td></tr>';
  }).join('');
  var clima=[];
  if(c.tempAmb!=null) clima.push(c.tempAmb+' °C');
  if(c.humedad!=null) clima.push(c.humedad+' % HR');
  if(c.viento!=null) clima.push(c.viento+' km/h viento');
  if(c.condClima) clima.push(escapeHtml(c.condClima));
  var win=window.open('','_blank');
  if(!win){ showNotice('Permita las ventanas emergentes para imprimir','err'); return; }
  win.document.write(
    '<html><head><title>'+escapeHtml(c.folio||('Confirmación '+c.id))+'</title><meta charset="utf-8"><style>'+
    '@page{size:letter;margin:14mm}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:20px;max-width:760px;margin:0 auto;font-size:13px}'+
    'h1{font-size:19px;margin:0} .sub{color:#6b7280;font-size:12px;margin-bottom:14px}'+
    'table{border-collapse:collapse;width:100%;margin-bottom:12px} th{background:#f3f4f6;padding:5px 8px;border:1px solid #ccc;text-align:left;font-size:12px}'+
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin-bottom:14px} .fld b{color:#354a5f}'+
    '.firmas{display:flex;gap:40px;margin-top:50px} .firmas div{flex:1;border-top:1px solid #333;text-align:center;padding-top:6px;font-size:12px}'+
    '@media print{button{display:none}}'+
    '</style></head><body>'+
    '<div style="display:flex;justify-content:space-between;align-items:start">'+
      '<div><h1>✅ Confirmación de Aplicación</h1>'+
      '<div class="sub">Sociedad Agrícola y Forestal La Cabaña · Cuaderno de Campo</div></div>'+
      '<div style="text-align:right"><div style="font-size:17px;font-weight:800;color:#0a6ed1">'+escapeHtml(c.folio||('#'+c.id))+'</div>'+
      '<div style="font-size:12px;color:#6b7280">Orden de aplicación: <strong>'+escapeHtml(String(c.ordenNumero||'—'))+'</strong></div></div>'+
    '</div>'+
    '<div class="grid">'+
      '<div class="fld"><b>Fecha aplicación:</b> '+escapeHtml(c.fechaApp||'—')+(c.turno?' · '+escapeHtml(c.turno):'')+'</div>'+
      '<div class="fld"><b>Horario:</b> '+escapeHtml(c.horaInicio||'—')+' a '+escapeHtml(c.horaFin||'—')+'</div>'+
      '<div class="fld"><b>Operador:</b> '+escapeHtml(c.operador||'—')+'</div>'+
      '<div class="fld"><b>Equipo:</b> '+escapeHtml(c.equipo||'—')+'</div>'+
      '<div class="fld"><b>Condiciones:</b> '+(clima.length?clima.join(' · '):'—')+'</div>'+
      '<div class="fld"><b>Agua aplicada:</b> '+fmtN(c.aguaReal||0,0)+' L</div>'+
      (orden&&orden.metodo?'<div class="fld"><b>Método:</b> '+escapeHtml(orden.metodo)+'</div>':'')+
      (orden&&orden.fenol?'<div class="fld"><b>Estado fenológico:</b> '+escapeHtml(orden.fenol)+'</div>':'')+
      (orden?'<div class="fld"><b>Tipo aplicación:</b> '+escapeHtml(orden.tipoApp||orden.tipo||'—')+'</div>':'')+
      (orden&&(orden.mojT||orden.moj)?'<div class="fld"><b>Mojamiento:</b> '+fmtN(orden.mojT||orden.moj,0)+' L/ha</div>':'')+
      (orden&&orden.responsable?'<div class="fld"><b>Responsable:</b> '+escapeHtml(orden.responsable)+'</div>':'')+
      (orden&&orden.especie?'<div class="fld"><b>Especie:</b> '+escapeHtml(orden.especie)+'</div>':'')+
      (orden&&orden.equipoCap>0?'<div class="fld"><b>Estanque equipo:</b> '+fmtN(orden.equipoCap,0)+' L</div>':'')+
    '</div>'+
    '<h3 style="font-size:14px;margin:0 0 6px">Aplicado por paño</h3>'+
    '<table><thead><tr><th>Paño</th><th>Variedad</th><th style="text-align:right">Há</th><th style="text-align:right">Agua (L)</th>'+thProds+'</tr></thead><tbody>'+(panosRows||'<tr><td colspan="4" style="padding:5px 8px;border:1px solid #ccc;color:#888">—</td></tr>')+'</tbody></table>'+
    '<h3 style="font-size:14px;margin:0 0 6px">Totales por producto</h3>'+
    '<table><thead><tr><th>Producto</th><th style="text-align:right">Planificado</th><th style="text-align:right">Aplicado</th></tr></thead><tbody>'+(prodsRows||'<tr><td colspan="3" style="padding:5px 8px;border:1px solid #ccc;color:#888">—</td></tr>')+'</tbody></table>'+
    (c.observaciones?'<div style="font-size:12px"><b>Observaciones:</b> '+escapeHtml(c.observaciones)+'</div>':'')+
    '<div class="firmas"><div>Operador</div><div>Responsable técnico</div></div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt>'+
    '</body></html>'
  );
  win.document.close();
}
function cfRefrescarLista(){
  var listEl = document.getElementById('cc-cf-list');
  var sec = document.getElementById('cc-cf-list-section');
  if(!listEl) return;
  // Si hay una orden cargada, mostrar solo sus confirmaciones; si no, mostrar todas (recientes)
  var data;
  if(_cfOrdenActual){
    data = (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(_cfOrdenActual.id); });
  } else {
    data = (S.confirmaciones||[]).slice(0,30);
  }
  if(!data.length){
    listEl.innerHTML = '<div class="cc-no-data"><span>✅</span>'+(_cfOrdenActual?'Sin confirmaciones para esta orden.':'Sin confirmaciones registradas todavía.')+'</div>';
    sec.style.display = _cfOrdenActual ? '' : 'none';
    return;
  }
  sec.style.display = '';
  // Detectar permiso para eliminar (revertir): admin con cuaderno.editar
  var canRevert = (typeof can==='function') ? can('cuaderno.editar') : true;
  listEl.innerHTML = data.map(function(c){
    var pNoms = (c.panoIds||[]).map(function(pid){ var p=getPano(pid); return p?p.nombre:'?'; }).join(', ');
    var prodsTxt = (c.productosReales||[]).map(function(pr){
      return '<div style="font-size:12px"><strong>'+escapeHtml(pr.nombre||'—')+':</strong> '+fmtN(pr.qtyAplicada||0,3)+' '+(pr.unitS||'')+' <span style="color:#888;font-size:11px">(plan: '+fmtN(pr.planeado||0,3)+' '+(pr.planeadoUS||'')+')</span></div>';
    }).join('');
    var revertBtn = canRevert ? '<button class="cc-btn cc-btn-r cc-btn-sm" onclick="cfEliminar(\''+c.id+'\')" title="Revertir confirmación">↩ Revertir</button>' : '';
    var printBtn = '<button class="cc-btn cc-btn-sm" onclick="cfImprimir(\''+c.id+'\')" title="Imprimir confirmación">🖨️</button>';
    return '<div style="background:#fff;border-left:3px solid #0a6ed1;border:1px solid #e5e5e5;border-radius:6px;padding:11px 14px;margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px;margin-bottom:8px">'+
        '<div>'+
          '<strong style="color:#354a5f;font-size:14px">✅ '+escapeHtml(c.folio||('#'+c.id))+' · '+c.ordenNumero+'</strong>'+
          '<span class="cc-badge" style="background:#d1e8ff;color:#0a6ed1;font-size:10px;margin-left:8px">'+c.fechaApp+' · '+(c.turno||'')+'</span>'+
        '</div>'+
        '<div style="display:flex;gap:6px">'+printBtn+revertBtn+'</div>'+
      '</div>'+
      '<div style="font-size:12px;color:#555;margin-bottom:8px">'+
        '<strong>Operador:</strong> '+escapeHtml(c.operador||'—')+
        (c.equipo?' · <strong>Equipo:</strong> '+escapeHtml(c.equipo):'')+
        (c.horaInicio?' · <strong>Inicio:</strong> '+c.horaInicio:'')+
        (c.horaFin?' → '+c.horaFin:'')+
      '</div>'+
      '<div style="font-size:12px;color:#555;margin-bottom:8px">'+
        '<strong>Paños:</strong> '+escapeHtml(pNoms)+
      '</div>'+
      '<div style="background:#fafafa;padding:7px 10px;border-radius:5px;margin-bottom:8px">'+
        prodsTxt +
        '<div style="font-size:12px;margin-top:3px"><strong>Agua aplicada:</strong> '+fmtN(c.aguaReal||0,0)+' L</div>'+
      '</div>'+
      ((c.tempAmb!==null && c.tempAmb!==undefined)||c.humedad!==null||c.viento!==null||c.condClima ?
        '<div style="font-size:11px;color:#666;margin-bottom:6px"><strong>Clima:</strong> '+
          (c.tempAmb!==null&&c.tempAmb!==undefined?c.tempAmb+'°C':'') +
          (c.humedad!==null&&c.humedad!==undefined?' · '+c.humedad+'% HR':'') +
          (c.viento!==null&&c.viento!==undefined?' · '+c.viento+' km/h':'') +
          (c.condClima?' · '+escapeHtml(c.condClima):'') +
        '</div>' : '') +
      (c.notas?'<div style="background:#fffefb;border-left:2px solid #e9730c;padding:5px 9px;font-size:11px;border-radius:4px;margin-bottom:6px"><strong>Observaciones:</strong> '+escapeHtml(c.notas)+'</div>':'') +
      '<div style="font-size:10px;color:#888;text-align:right">Registrado '+(c.creada||'')+(c.creadaPor?' por '+c.creadaPor:'')+'</div>'+
    '</div>';
  }).join('');
}

function cfDesdeListado(ordenId){
  // Navegar a la pestaña Confirmar y precargar la orden
  var btnTab = document.getElementById('cc-ot3');
  if(btnTab){ showOSub('confirmar', btnTab); }
  // Pequeño delay para que el DOM termine de mostrar la pestaña
  setTimeout(function(){
    cfCargarDetalle(ordenId);
    // Scroll al detalle
    var det = document.getElementById('cc-cf-detail');
    if(det) det.scrollIntoView({behavior:'smooth', block:'start'});
  }, 80);
}

function cfEliminar(cid){
  var c = (S.confirmaciones||[]).find(function(x){ return String(x.id)===String(cid); });
  if(!c) return;
  if(!confirm('¿Revertir esta confirmación de '+c.ordenNumero+'?\n\nLos paños que cubría volverán al estado pendiente.')) return;
  S.confirmaciones = S.confirmaciones.filter(function(x){ return String(x.id)!==String(cid); });
  save();
  if(typeof showNotice==='function') showNotice('Confirmación revertida.','ok');
  // Recargar
  if(_cfOrdenActual) cfCargarDetalle(_cfOrdenActual.id);
  else cfRefrescarLista();
}


// ══════════════════════════════════════════════════════════════════
//  MÓDULO DE REPORTES — Excel multi-hoja con confirmaciones de aplicación
// ══════════════════════════════════════════════════════════════════

// Toggle de filtros: muestra/oculta cajas según radio seleccionado
function rpToggleFiltros(){
  var rng = document.querySelector('input[name="cc-rp-rng"]:checked').value;
  document.getElementById('cc-rp-mes-box').style.display = rng==='mes' ? '' : 'none';
  document.getElementById('cc-rp-rango-box').style.display = rng==='rango' ? '' : 'none';
  document.getElementById('cc-rp-orden-box').style.display = rng==='orden' ? '' : 'none';
  rpActualizarPreview();
}

// Aplica el filtro actual y devuelve las confirmaciones que cumplen
function rpFiltrarConfirmaciones(){
  var confs = (S.confirmaciones||[]).slice();
  var rngEl = document.querySelector('input[name="cc-rp-rng"]:checked');
  if(!rngEl) return confs;
  var rng = rngEl.value;

  if(rng==='mes'){
    var mes = (document.getElementById('cc-rp-mes')||{}).value || '';
    if(mes){ confs = confs.filter(function(c){ return (c.fechaApp||'').indexOf(mes)===0; }); }
  } else if(rng==='rango'){
    var desde = (document.getElementById('cc-rp-desde')||{}).value || '';
    var hasta = (document.getElementById('cc-rp-hasta')||{}).value || '';
    if(desde) confs = confs.filter(function(c){ return (c.fechaApp||'') >= desde; });
    if(hasta) confs = confs.filter(function(c){ return (c.fechaApp||'') <= hasta; });
  } else if(rng==='orden'){
    var ord = (document.getElementById('cc-rp-orden')||{}).value.trim().toUpperCase();
    if(ord){ confs = confs.filter(function(c){ return (c.ordenNumero||'').toUpperCase().indexOf(ord)>=0; }); }
  }
  return confs;
}

// Vista previa: muestra el conteo de registros que se incluirán
function rpActualizarPreview(){
  var el = document.getElementById('cc-rp-preview'); if(!el) return;
  var confs = rpFiltrarConfirmaciones();
  if(!confs.length){
    el.innerHTML = '<div style="color:#7a4200"><strong>⚠ Sin confirmaciones</strong> que cumplan los filtros seleccionados.</div>';
    return;
  }
  // Estadísticas rápidas
  var fechas = confs.map(function(c){ return c.fechaApp; }).filter(Boolean).sort();
  var ordenesUnicas = {};
  var productosUnicos = {};
  var panosCubiertos = {};
  var totalAgua = 0;
  confs.forEach(function(c){
    if(c.ordenNumero) ordenesUnicas[c.ordenNumero] = true;
    (c.productosReales||[]).forEach(function(p){ if(p.nombre) productosUnicos[p.nombre] = true; });
    (c.panoIds||[]).forEach(function(pid){ panosCubiertos[pid] = true; });
    totalAgua += parseFloat(c.aguaReal||0) || 0;
  });
  el.innerHTML =
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#354a5f;margin-bottom:8px">📋 Vista previa del reporte</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">'+
      '<div><div style="font-size:11px;color:#555">Confirmaciones</div><div style="font-size:18px;font-weight:700;color:#354a5f">'+confs.length+'</div></div>'+
      '<div><div style="font-size:11px;color:#555">Órdenes distintas</div><div style="font-size:18px;font-weight:700;color:#354a5f">'+Object.keys(ordenesUnicas).length+'</div></div>'+
      '<div><div style="font-size:11px;color:#555">Productos usados</div><div style="font-size:18px;font-weight:700;color:#354a5f">'+Object.keys(productosUnicos).length+'</div></div>'+
      '<div><div style="font-size:11px;color:#555">Paños cubiertos</div><div style="font-size:18px;font-weight:700;color:#354a5f">'+Object.keys(panosCubiertos).length+'</div></div>'+
      '<div><div style="font-size:11px;color:#555">Agua total aplicada</div><div style="font-size:18px;font-weight:700;color:#354a5f">'+fmtN(totalAgua,0)+' L</div></div>'+
      '<div><div style="font-size:11px;color:#555">Período</div><div style="font-size:13px;font-weight:700;color:#354a5f">'+(fechas[0]||'—')+'<br>'+(fechas[fechas.length-1]||'—')+'</div></div>'+
    '</div>';
}

// Genera el archivo Excel multi-hoja
function rpGenerarExcel(){
  if(typeof XLSX==='undefined'){
    showNotice('Librería Excel no disponible. Recargue la página.','err');
    return;
  }
  var confs = rpFiltrarConfirmaciones();
  if(!confs.length){
    showNotice('No hay confirmaciones que coincidan con los filtros.','err');
    return;
  }

  // Determinar título según filtro
  var rng = document.querySelector('input[name="cc-rp-rng"]:checked').value;
  var titulo = 'Todo el histórico';
  var sufijoArchivo = 'historico';
  if(rng==='mes'){ var mes=document.getElementById('cc-rp-mes').value; if(mes){ titulo='Mes '+mes; sufijoArchivo=mes; } }
  else if(rng==='rango'){
    var d=document.getElementById('cc-rp-desde').value, h=document.getElementById('cc-rp-hasta').value;
    titulo='Rango '+(d||'-inicio')+' a '+(h||'-fin');
    sufijoArchivo=(d||'inicio')+'_'+(h||'fin');
  }
  else if(rng==='orden'){ var o=document.getElementById('cc-rp-orden').value.trim().toUpperCase(); titulo='Orden '+o; sufijoArchivo=o.replace(/[^A-Z0-9-]/g,'_'); }

  try{
    var wb = XLSX.utils.book_new();

    // ─── HOJA 1: Resumen ejecutivo ───
    var fechas = confs.map(function(c){ return c.fechaApp; }).filter(Boolean).sort();
    var ordenesUnicas = {};
    var productosTotales = {}; // nombre -> {nombre, unitS, qty total, aplicaciones, fechaIni, fechaFin}
    var panosCubiertos = {};
    var totalAgua = 0;
    confs.forEach(function(c){
      if(c.ordenNumero) ordenesUnicas[c.ordenNumero] = true;
      (c.panoIds||[]).forEach(function(pid){ panosCubiertos[pid] = true; });
      totalAgua += parseFloat(c.aguaReal||0) || 0;
      (c.productosReales||[]).forEach(function(p){
        if(!p.nombre) return;
        var key = p.nombre + ' [' + (p.unitS||'') + ']';
        if(!productosTotales[key]){
          productosTotales[key] = {nombre:p.nombre, unitS:p.unitS||'', qty:0, aplicaciones:0, fechaIni:c.fechaApp, fechaFin:c.fechaApp};
        }
        productosTotales[key].qty += parseFloat(p.qtyAplicada||0) || 0;
        productosTotales[key].aplicaciones++;
        if(c.fechaApp){
          if(c.fechaApp < productosTotales[key].fechaIni) productosTotales[key].fechaIni = c.fechaApp;
          if(c.fechaApp > productosTotales[key].fechaFin) productosTotales[key].fechaFin = c.fechaApp;
        }
      });
    });
    // Top 5 productos por cantidad
    var topProductos = Object.values(productosTotales).sort(function(a,b){ return b.qty-a.qty; }).slice(0,5);

    // Datos de empresa al inicio del reporte
    var rpEmpCfg = (typeof STATE!=='undefined' && STATE.cache && STATE.cache.config && STATE.cache.config.empresa) || {};
    var resumenRows = [
      ['REPORTE DE APLICACIONES \u2014 '+titulo],
      ['']
    ];
    // Si hay datos de empresa, los agregamos al inicio
    if(rpEmpCfg.nombre || rpEmpCfg.rut){
      resumenRows.push(['\u2500\u2500\u2500 EMPRESA \u2500\u2500\u2500']);
      if(rpEmpCfg.nombre) resumenRows.push(['Nombre:', rpEmpCfg.nombre]);
      if(rpEmpCfg.rut) resumenRows.push(['RUT:', rpEmpCfg.rut]);
      if(rpEmpCfg.giro) resumenRows.push(['Giro:', rpEmpCfg.giro]);
      if(rpEmpCfg.direccion) resumenRows.push(['Direcci\u00f3n:', rpEmpCfg.direccion]);
      if(rpEmpCfg.telefono) resumenRows.push(['Tel\u00e9fono:', rpEmpCfg.telefono]);
      if(rpEmpCfg.correo) resumenRows.push(['Correo:', rpEmpCfg.correo]);
      resumenRows.push(['']);
    }
    resumenRows = resumenRows.concat([
      ['Generado:', new Date().toLocaleString('es-CL')],
      ['Generado por:', (typeof STATE!=='undefined' && STATE.user && STATE.user.usuario) ? STATE.user.usuario : '—'],
      [''],
      ['\u2500\u2500\u2500 M\u00c9TRICAS GLOBALES \u2500\u2500\u2500'],
      ['Total confirmaciones', confs.length],
      ['\u00d3rdenes distintas', Object.keys(ordenesUnicas).length],
      ['Productos distintos usados', Object.keys(productosTotales).length],
      ['Pa\u00f1os cubiertos', Object.keys(panosCubiertos).length],
      ['Agua/caldo total aplicado (L)', Math.round(totalAgua)],
      ['Per\u00edodo', (fechas[0]||'—')+' a '+(fechas[fechas.length-1]||'—')],
      [''],
      ['\u2500\u2500\u2500 TOP 5 PRODUCTOS POR CANTIDAD \u2500\u2500\u2500'],
      ['Producto', 'Cantidad total', 'Unidad', 'N\u00b0 aplicaciones']
    ]);
    topProductos.forEach(function(p){
      resumenRows.push([p.nombre, parseFloat(p.qty.toFixed(3)), p.unitS, p.aplicaciones]);
    });

    var wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
    wsResumen['!cols'] = [{wch:35},{wch:18},{wch:14},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // ─── HOJA 2: Detalle por confirmación ───
    var detRows = [[
      'Fecha aplicaci\u00f3n','Folio','N\u00b0 Orden','Operador','Equipo','Turno','Hora inicio','Hora fin',
      'Pa\u00f1os aplicados','Productos aplicados (detalle)','Agua/caldo (L)',
      'Temp (\u00b0C)','HR (%)','Viento (km/h)','Clima',
      'Observaciones','Registrado','Registrado por'
    ]];
    confs.forEach(function(c){
      var pNoms = (c.panoIds||[]).map(function(pid){ var p=getPano(pid); return p?p.nombre:'?'; }).join(', ');
      var prodsTxt = (c.productosReales||[]).map(function(pr){
        return (pr.nombre||'')+': '+fmtN(pr.qtyAplicada||0,3)+' '+(pr.unitS||'');
      }).join(' | ');
      detRows.push([
        c.fechaApp||'',
        c.folio||'',
        c.ordenNumero||'',
        c.operador||'',
        c.equipo||'',
        c.turno||'',
        c.horaInicio||'',
        c.horaFin||'',
        pNoms,
        prodsTxt,
        parseFloat(c.aguaReal||0)||0,
        (c.tempAmb!==null&&c.tempAmb!==undefined)?c.tempAmb:'',
        (c.humedad!==null&&c.humedad!==undefined)?c.humedad:'',
        (c.viento!==null&&c.viento!==undefined)?c.viento:'',
        c.condClima||'',
        c.notas||'',
        c.creada||'',
        c.creadaPor||''
      ]);
    });
    var wsDet = XLSX.utils.aoa_to_sheet(detRows);
    wsDet['!cols'] = [
      {wch:13},{wch:11},{wch:22},{wch:22},{wch:10},{wch:9},{wch:9},
      {wch:30},{wch:50},{wch:12},
      {wch:8},{wch:7},{wch:11},{wch:18},
      {wch:35},{wch:17},{wch:18}
    ];
    XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle confirmaciones');

    // ─── HOJA 3: Consumo por producto y cuartel (clave para bodega) ───
    // Una línea por PRODUCTO × CUARTEL. La cantidad de cada confirmación se
    // reparte entre sus paños de forma PROPORCIONAL A LAS HECTÁREAS (mismo
    // criterio que la hoja "Consumo por paño"), no en partes iguales.
    var prodRows = [[
      'Producto','Unidad','Cuartel','Tipo','Hect\u00e1reas',
      'Cantidad en el cuartel','Dosis (unidad/ha)','N\u00b0 aplicaciones',
      'Primera aplicaci\u00f3n','\u00daltima aplicaci\u00f3n','Agua en el cuartel (L)',
      '\u00d3rdenes','Cantidad total del producto'
    ]];
    var prodWithExtras = {};   // producto -> totales (para el total y el orden)
    var prodPorCuartel = {};   // producto + cuartel -> detalle de la línea

    confs.forEach(function(c){
      // Fracción de cada paño según sus hectáreas (si no hay há, reparto igual)
      var ids = c.panoIds || [];
      var hasPorPano = {}, haTotalConf = 0;
      ids.forEach(function(pid){
        var p = getPano(pid);
        var ha = p ? (parseFloat(p.hectareas)||0) : 0;
        hasPorPano[pid] = ha;
        haTotalConf += ha;
      });
      var aguaRealConf = parseFloat(c.aguaReal||0)||0;

      (c.productosReales||[]).forEach(function(p){
        if(!p.nombre) return;
        var key = p.nombre + ' [' + (p.unitS||'') + ']';
        var qtyTotal = parseFloat(p.qtyAplicada||0)||0;

        // Totales del producto (suma de todos los cuarteles)
        if(!prodWithExtras[key]){
          prodWithExtras[key] = {nombre:p.nombre, unitS:p.unitS||'', qty:0, aplicaciones:0};
        }
        prodWithExtras[key].qty += qtyTotal;
        prodWithExtras[key].aplicaciones++;

        // Desglose por cuartel
        if(!ids.length){
          // Confirmación sin paños asociados: no se pierde, se marca aparte
          var kSin = key + '||(sin cuartel)';
          if(!prodPorCuartel[kSin]){
            prodPorCuartel[kSin] = {
              prodKey:key, nombre:p.nombre, unitS:p.unitS||'',
              cuartel:'(sin cuartel asignado)', tipo:'', hectareas:0,
              qty:0, agua:0, aplicaciones:0,
              fechaIni:c.fechaApp, fechaFin:c.fechaApp, ordenes:{}
            };
          }
          var dSin = prodPorCuartel[kSin];
          dSin.qty += qtyTotal;
          dSin.agua += aguaRealConf;
          dSin.aplicaciones++;
          if(c.ordenNumero) dSin.ordenes[c.ordenNumero] = true;
          if(c.fechaApp){
            if(!dSin.fechaIni || c.fechaApp < dSin.fechaIni) dSin.fechaIni = c.fechaApp;
            if(!dSin.fechaFin || c.fechaApp > dSin.fechaFin) dSin.fechaFin = c.fechaApp;
          }
          return;
        }

        ids.forEach(function(pid){
          var pano = getPano(pid);
          var ha = hasPorPano[pid] || 0;
          var frac = (haTotalConf>0) ? (ha/haTotalConf) : (ids.length ? 1/ids.length : 0);
          var kc = key + '||' + pid;
          if(!prodPorCuartel[kc]){
            prodPorCuartel[kc] = {
              prodKey: key,
              nombre: p.nombre,
              unitS: p.unitS||'',
              cuartel: pano ? pano.nombre : ('Pa\u00f1o '+pid),
              tipo: pano ? (pano.tipo||'Productivo') : '',
              hectareas: pano ? (parseFloat(pano.hectareas)||0) : 0,
              qty:0, agua:0, aplicaciones:0,
              fechaIni:c.fechaApp, fechaFin:c.fechaApp, ordenes:{}
            };
          }
          var d = prodPorCuartel[kc];
          d.qty  += qtyTotal * frac;
          d.agua += aguaRealConf * frac;
          d.aplicaciones++;
          if(c.ordenNumero) d.ordenes[c.ordenNumero] = true;
          if(c.fechaApp){
            if(!d.fechaIni || c.fechaApp < d.fechaIni) d.fechaIni = c.fechaApp;
            if(!d.fechaFin || c.fechaApp > d.fechaFin) d.fechaFin = c.fechaApp;
          }
        });
      });
    });

    // Ordenar: producto de mayor consumo primero; dentro de cada producto,
    // el cuartel que más recibió. Así las líneas de un producto quedan juntas.
    Object.values(prodPorCuartel).sort(function(a,b){
      var ta=(prodWithExtras[a.prodKey]||{}).qty||0;
      var tb=(prodWithExtras[b.prodKey]||{}).qty||0;
      if(tb!==ta) return tb-ta;
      if(a.prodKey!==b.prodKey) return a.prodKey.localeCompare(b.prodKey);
      return b.qty-a.qty;
    }).forEach(function(d){
      var total=(prodWithExtras[d.prodKey]||{}).qty||0;
      var dosis=(d.hectareas>0) ? (d.qty/d.hectareas) : '';
      prodRows.push([
        d.nombre,
        d.unitS,
        d.cuartel,
        d.tipo,
        d.hectareas?parseFloat(d.hectareas.toFixed(2)):'',
        parseFloat(d.qty.toFixed(3)),
        dosis===''?'':parseFloat(dosis.toFixed(3)),
        d.aplicaciones,
        d.fechaIni||'',
        d.fechaFin||'',
        Math.round(d.agua),
        Object.keys(d.ordenes).join(', '),
        parseFloat(total.toFixed(3))
      ]);
    });
    var wsProd = XLSX.utils.aoa_to_sheet(prodRows);
    wsProd['!cols'] = [
      {wch:30},{wch:8},{wch:20},{wch:12},{wch:11},
      {wch:20},{wch:16},{wch:14},
      {wch:14},{wch:14},{wch:19},
      {wch:25},{wch:22}
    ];
    XLSX.utils.book_append_sheet(wb, wsProd, 'Consumo por producto');

    // ─── HOJA 4: Consumo por paño ───
    var panosData = {}; // pid -> {pano, aplicaciones, productos:{nombre->qty unitS}, agua}
    confs.forEach(function(c){
      // Reparto PROPORCIONAL A LAS HECTÁREAS de cada paño (no en partes iguales).
      // Se calcula la superficie de cada paño y el total, para prorratear el agua
      // y el producto según el peso en hectáreas de cada uno.
      var ids = c.panoIds || [];
      var hasPorPano = {};
      var haTotalConf = 0;
      ids.forEach(function(pid){
        var p = getPano(pid);
        var ha = p ? (parseFloat(p.hectareas)||0) : 0;
        hasPorPano[pid] = ha;
        haTotalConf += ha;
      });
      var aguaRealConf = parseFloat(c.aguaReal||0)||0;
      ids.forEach(function(pid){
        var p = getPano(pid);
        var ha = hasPorPano[pid] || 0;
        // Fracción de este paño según sus hectáreas (si no hay há, repartir igual).
        var frac = (haTotalConf>0) ? (ha/haTotalConf) : (ids.length ? 1/ids.length : 0);
        if(!panosData[pid]){
          panosData[pid] = {
            pano: p,
            nombre: p ? p.nombre : ('Paño '+pid),
            variedad: p ? (p.variedad||'') : '',
            anio: p ? (p.anio||'') : '',
            hectareas: p ? (p.hectareas||0) : 0,
            tipo: p ? (p.tipo||'Productivo') : 'Productivo',
            plantas: p ? (p.plantas||0) : 0,
            densidad: p ? (p.densidad||0) : 0,
            panoPadre: p ? (p.panoPadre||'') : '',
            aplicaciones: 0,
            agua: 0,
            productos: {}
          };
        }
        panosData[pid].aplicaciones++;
        // Agua proporcional a las hectáreas del paño
        panosData[pid].agua += aguaRealConf * frac;
        // Productos: cada paño recibe una porción proporcional a sus hectáreas
        (c.productosReales||[]).forEach(function(pr){
          if(!pr.nombre) return;
          var key = pr.nombre + ' [' + (pr.unitS||'') + ']';
          if(!panosData[pid].productos[key]){
            panosData[pid].productos[key] = {nombre:pr.nombre, unitS:pr.unitS||'', qty:0};
          }
          panosData[pid].productos[key].qty += (parseFloat(pr.qtyAplicada||0)||0) * frac;
        });
      });
    });
    var panoRows = [[
      'Pa\u00f1o','Tipo','Pa\u00f1o principal','Variedad','A\u00f1o plantaci\u00f3n','Hect\u00e1reas',
      'N\u00b0 plantas','Densidad (pl/ha)','N\u00b0 aplicaciones','Agua aplicada (L)','Productos aplicados (resumen)'
    ]];
    Object.values(panosData).sort(function(a,b){ return b.aplicaciones-a.aplicaciones; }).forEach(function(pd){
      var prodResumen = Object.values(pd.productos).map(function(p){
        return p.nombre+': '+fmtN(p.qty,3)+' '+p.unitS;
      }).join(' | ');
      // Nombre del paño principal (si es polinizante)
      var padreNombre = '';
      if(pd.panoPadre){ var pad = getPano(pd.panoPadre); padreNombre = pad ? pad.nombre : ''; }
      panoRows.push([
        pd.nombre, pd.tipo, padreNombre, pd.variedad, pd.anio, parseFloat((pd.hectareas||0).toFixed(2)),
        pd.plantas, pd.densidad, pd.aplicaciones, Math.round(pd.agua), prodResumen
      ]);
    });
    var wsPano = XLSX.utils.aoa_to_sheet(panoRows);
    wsPano['!cols'] = [{wch:18},{wch:12},{wch:18},{wch:16},{wch:13},{wch:11},{wch:11},{wch:14},{wch:14},{wch:16},{wch:55}];
    XLSX.utils.book_append_sheet(wb, wsPano, 'Consumo por pa\u00f1o');

    // Descargar
    var nombreArchivo = 'Reporte_Aplicaciones_'+sufijoArchivo+'_'+new Date().toISOString().slice(0,10)+'.xlsx';
    XLSX.writeFile(wb, nombreArchivo);
    showNotice('✓ Reporte Excel generado: '+confs.length+' confirmaciones, 4 hojas.','ok');
  } catch(ex){
    showNotice('Error al generar reporte: '+ex.message,'err');
    console.error(ex);
  }
}

function anularOrden(id){
  var o=S.ordenes.find(function(x){ return String(x.id)===String(id); });
  if(!o) return;
  // Validar que la orden NO tenga confirmaciones asociadas
  var confs = (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(o.id); });
  if(confs.length>0){
    alert('⚠ No se puede eliminar la orden '+o.numero+'.\n\n'+
      'Tiene '+confs.length+' confirmación(es) de aplicación registrada(s).\n\n'+
      'Para eliminarla primero debe revertir todas las confirmaciones desde la pestaña "Confirmar aplicación".');
    return;
  }
  if(!confirm('¿Eliminar definitivamente la orden '+o.numero+'?\n\nEsta acción no se puede deshacer.')) return;
  S.ordenes = S.ordenes.filter(function(x){ return String(x.id)!==String(id); });
  save();
  renderOrdenesList();
  if(typeof showNotice==='function') showNotice('Orden '+o.numero+' eliminada.','ok');
}
function printLastOrden(){ if(S.ordenes.length) openPM(S.ordenes[0].id); }
function openPM(id){
  var o=S.ordenes.find(function(x){ return String(x.id)===String(id); });
  if(!o){ alert('Orden no encontrada.'); return; }
  try{
    // Resolver array de productos (compat hacia atrás)
    var prods = (o.productos && o.productos.length) ? o.productos : [{nombre:o.producto, dosis:o.dosis, unidad:o.unidad, unitS:unitBase(o.unidad||''), tProd:o.tProd, margin:o.margin}];
    var unitS = prods[0].unitS || unitBase(prods[0].unidad||'');
    var isRiego=o.tipoApp==='Fertirriego';
    var pNoms=(o.panoIds||[]).map(function(pid){ return getPano(pid); }).filter(function(p){ return p && (p.tipo||'Productivo')!=='Polinizante'; }).map(function(p){ return p.nombre; }).join(', ');
    // Recalcular la distribución por hectáreas ACTUALES (corrige órdenes viejas).
    var _rec = _recalcDistribucionOrden(o);
    var _distrib = _rec.filas.length ? _rec.filas : (o.distribucion||[]);
    // Filas de la tabla: una fila por paño con una columna por producto
    var filas=_distrib.map(function(r){
      var prodCells;
      if(r.prods && r.prods.length){
        prodCells = r.prods.map(function(rp, idxP){
          // Convertir a la misma unidad que el header del total del producto
          var apUS = (prods[idxP] && (prods[idxP].unitS||unitBase(prods[idxP].unidad||''))) || rp.unitS || '';
          var conv = fmtQtyAuto(prods[idxP] ? (prods[idxP].tProd||0) : 0, apUS);
          // Mostrar la qty del paño en la MISMA unidad escalada del total para que las columnas sean coherentes
          var qtyConverted = (conv.unit !== apUS && conv.unit) ? rp.qty/1000 : rp.qty;
          return '<td style="text-align:right;font-weight:700">'+fmtN(qtyConverted||0,3)+'</td>';
        }).join('');
      } else {
        var apUS0 = prods[0].unitS||unitBase(prods[0].unidad||'');
        prodCells = '<td style="text-align:right;font-weight:700">'+fmtN(r.prod||0,3)+'</td>';
        for(var k=1;k<prods.length;k++) prodCells += '<td style="text-align:right;color:#bbb">-</td>';
      }
      return '<tr><td>'+(r.panoNombre||'-')+'</td><td style="font-style:italic;color:#555">'+(r.variedad||'-')+'</td>'+
        '<td style="text-align:center">'+(r.anio||'-')+'</td>'+
        '<td style="text-align:right">'+fmtN(r.has||0,2)+'</td>'+
        '<td style="text-align:right">'+(r.agua>0?fmtN(r.agua,0):'-')+'</td>'+
        prodCells + '</tr>';
    }).join('');
    var notasHtml = o.notas
      ? '<div style="background:#fffefb;border:1px solid #ddd;border-left:3px solid #e9730c;border-radius:4px;padding:8px 11px;margin-bottom:12px;font-size:11px"><strong>Notas:</strong> '+escapeHtml(o.notas)+'</div>'
      : '';
    // Sección de productos: bloque resumen al inicio
    var prodsSummary;
    if(prods.length===1){
      prodsSummary = '<div class="cc-pm-fld"><div class="cc-l">Producto</div><div class="cc-v">'+escapeHtml(prods[0].nombre||'-')+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Dosis</div><div class="cc-v">'+prods[0].dosis+' '+prods[0].unidad+'</div></div>';
    } else {
      var prodsList = prods.map(function(ap){ var apUS=ap.unitS||unitBase(ap.unidad||''); return '<div style="font-size:11px;padding:2px 0"><strong>'+escapeHtml(ap.nombre||'-')+'</strong>: '+ap.dosis+' '+ap.unidad+' ('+fmtQtyStr(ap.tProd||0,apUS,2)+' neto)</div>'; }).join('');
      prodsSummary = '<div class="cc-pm-fld" style="grid-column:span 2"><div class="cc-l">MEZCLA DE '+prods.length+' PRODUCTOS</div><div class="cc-v" style="font-size:12px">'+prodsList+'</div></div>';
    }
    // Solicitud a bodega: lista por producto
    var bodegaHtml;
    if(prods.length===1){
      bodegaHtml = '<div class="cc-pm-bodega">'+
        '<div>'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0a6ed1;margin-bottom:3px">SOLICITUD A BODEGA</div>'+
          '<div style="font-size:11px;color:#444">'+(o.panoIds||[]).length+' pa\u00f1o(s) - '+fmtN(o.tHas||0,2)+' h\u00e1'+
            ' - Neto: '+fmtQtyStr(prods[0].tProd||o.tProd||0,unitS,2)+
            ' - Agua: '+(o.tAgua>0?fmtN(o.tAgua,0):'-')+' L</div>'+
          '<div style="font-size:10px;color:#888;margin-top:2px">Cantidad neta total a aplicar</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:20px;font-weight:700;color:#354a5f">'+fmtQtyStr(prods[0].margin||o.margin||0,unitS,2)+'</div>'+
          '<div style="font-size:11px;color:#555">de '+escapeHtml(prods[0].nombre||'-')+'</div>'+
        '</div>'+
      '</div>';
    } else {
      // Mezcla: lista de productos con sus cantidades
      var rows = prods.map(function(ap){
        var us = ap.unitS||unitBase(ap.unidad||'');
        return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #ddd;font-size:11px">'+
          '<div><strong>'+escapeHtml(ap.nombre||'-')+'</strong> <span style="color:#666">('+ap.dosis+' '+ap.unidad+')</span></div>'+
          '<div style="font-weight:700;color:#354a5f">'+fmtQtyStr(ap.tProd||0,us,2)+'</div>'+
        '</div>';
      }).join('');
      bodegaHtml = '<div class="cc-pm-bodega" style="display:block">'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0a6ed1;margin-bottom:6px">SOLICITUD A BODEGA - MEZCLA DE '+prods.length+' PRODUCTOS</div>'+
        '<div style="font-size:11px;color:#444;margin-bottom:8px">'+(o.panoIds||[]).length+' pa\u00f1o(s) - '+fmtN(o.tHas||0,2)+' h\u00e1 - Agua/Caldo: '+(o.tAgua>0?fmtN(o.tAgua,0):'-')+' L</div>'+
        rows +
      '</div>';
    }
    // Encabezado de la tabla con columnas por producto
    var prodHeaders = prods.map(function(ap){
      var apUS = ap.unitS||unitBase(ap.unidad||'');
      // Para el header: usamos la unidad escalada del total (si el total se escala a kg, header dice kg)
      var conv = fmtQtyAuto(ap.tProd||0, apUS);
      return '<th style="text-align:right">'+escapeHtml(ap.nombre||'Prod')+' ('+conv.unit+')</th>';
    }).join('');
    var prodFooters = prods.map(function(ap){ var apUS=ap.unitS||unitBase(ap.unidad||''); var conv=fmtQtyAuto(ap.tProd||0,apUS); return '<td style="text-align:right"><strong>'+fmtN(conv.qty,2)+'</strong></td>'; }).join('');
    // Obtener datos de empresa para encabezado del documento
    var empCfg = (STATE && STATE.cache && STATE.cache.config && STATE.cache.config.empresa) || {};
    var empHeaderHtml = '';
    if(empCfg.nombre || empCfg.logo){
      empHeaderHtml = '<div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:1px solid #ccc;margin-bottom:10px">'+
        (empCfg.logo ? '<img src="'+empCfg.logo+'" alt="Logo" style="max-width:80px;max-height:60px;object-fit:contain">' : '')+
        '<div style="flex:1">'+
          (empCfg.nombre?'<div style="font-size:14px;font-weight:700;color:#354a5f">'+escapeHtml(empCfg.nombre)+'</div>':'')+
          (empCfg.rut?'<div style="font-size:10px;color:#666">RUT: '+escapeHtml(empCfg.rut)+'</div>':'')+
          (empCfg.giro?'<div style="font-size:10px;color:#666">'+escapeHtml(empCfg.giro)+'</div>':'')+
          (empCfg.direccion?'<div style="font-size:10px;color:#666">'+escapeHtml(empCfg.direccion)+'</div>':'')+
          ((empCfg.telefono||empCfg.correo)?'<div style="font-size:10px;color:#666">'+
            (empCfg.telefono?'Tel: '+escapeHtml(empCfg.telefono):'')+
            (empCfg.telefono&&empCfg.correo?' · ':'')+
            (empCfg.correo?escapeHtml(empCfg.correo):'')+
          '</div>':'')+
        '</div>'+
      '</div>';
    }
    var html =
      empHeaderHtml +
      '<div class="cc-pm-hdr"><h1>ORDEN DE APLICACI\u00d3N - HUERTO CEREZOS</h1>'+
        '<div class="cc-sub">'+o.numero+' - '+o.fecha+' - '+o.tipoApp+'</div></div>'+
      '<div class="cc-pm-grid">'+
        '<div class="cc-pm-fld"><div class="cc-l">N\u00b0 Orden</div><div class="cc-v">'+o.numero+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Fecha</div><div class="cc-v">'+o.fecha+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Tipo</div><div class="cc-v">'+o.tipoApp+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Estado Fenol\u00f3gico</div><div class="cc-v">'+o.fenologico+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Especie</div><div class="cc-v">'+(o.especie||'-')+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Pa\u00f1os</div><div class="cc-v">'+pNoms+'</div></div>'+
        // Objetivos: ocupan toda la fila
        (function(){
          var objs = (o.objetivos||[]).slice();
          if(o.objetivoOtro) objs.push('Otro: '+o.objetivoOtro);
          if(!objs.length) return '';
          return '<div class="cc-pm-fld" style="grid-column:span 3"><div class="cc-l">\ud83c\udfaf Objetivo(s) de la aplicaci\u00f3n</div><div class="cc-v" style="font-size:11px;line-height:1.5">'+
            objs.map(function(ob){ return '<span style="display:inline-block;background:#d1e8ff;color:#354a5f;padding:2px 8px;border-radius:10px;margin:2px 4px 2px 0;font-size:10px;font-weight:600">'+escapeHtml(ob)+'</span>'; }).join('')+
          '</div></div>';
        })() +
        prodsSummary +
        '<div class="cc-pm-fld"><div class="cc-l">Mojamiento (L/ha)</div><div class="cc-v">'+(o.mojT||o.moj||'-')+' ('+o.vha+'x)</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">M\u00e9todo</div><div class="cc-v">'+(o.metodo||'-')+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">Responsable</div><div class="cc-v">'+(o.responsable||'-')+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">H\u00e1 base ('+(isRiego?'riego':'plantadas')+')</div><div class="cc-v">'+fmtN(o.tHas||0,2)+' h\u00e1</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">\ud83d\ude9c Equipo de aplicaci\u00f3n</div><div class="cc-v">'+(o.equipo?escapeHtml(o.equipo):'-')+(o.equipoCap>0?' ('+fmtN(o.equipoCap,0)+' L)':'')+'</div></div>'+
        '<div class="cc-pm-fld"><div class="cc-l">N\u00b0 Estanques</div><div class="cc-v">'+(function(){ var n=o.nEstanques||0; if((!n||n<=0)&&o.equipoCap>0&&o.tAgua>0){ n=Math.ceil(o.tAgua/o.equipoCap); } return (n>0)?n+' estanque(s)':'-'; })()+'</div></div>'+
      '</div>'+
      (function(){
        // Cantidad de producto por estanque: total de cada producto ÷ N° estanques.
        // El N° de estanques se calcula con la capacidad del estanque del equipo.
        var cap = o.equipoCap||0;
        var aguaT = (_rec && _rec.tAgua) ? _rec.tAgua : (o.tAgua||0);
        var nEst = 0;
        if(cap>0 && aguaT>0){ nEst=Math.ceil(aguaT/cap); }
        if(!nEst || nEst<=0) return '';
        var aguaEst = aguaT/nEst;
        var filasP = prods.map(function(ap){
          var us = ap.unitS||unitBase(ap.unidad||'');
          var conv = fmtQtyAuto((ap.tProd||0)/nEst, us);
          return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ddd;font-size:11px">'+
            '<div><strong>'+escapeHtml(ap.nombre||'-')+'</strong></div>'+
            '<div style="font-weight:700;color:#354a5f">'+fmtN(conv.qty,3)+' '+conv.unit+' / estanque</div>'+
          '</div>';
        }).join('');
        return '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:3px solid #16a34a;border-radius:5px;padding:9px 12px;margin-bottom:12px">'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#15803d;margin-bottom:5px">\ud83d\ude9c Dosificaci\u00f3n por estanque ('+nEst+' estanque(s) de '+fmtN(cap,0)+' L · '+fmtN(aguaEst,0)+' L agua/estanque)</div>'+
          filasP+
        '</div>';
      })()+
      notasHtml+
      '<table><thead><tr>'+
        '<th>Pa\u00f1o</th><th>Variedad</th><th>A\u00f1o</th>'+
        '<th style="text-align:right">Ha base</th>'+
        '<th style="text-align:right">Agua/Caldo (L)</th>'+
        prodHeaders +
      '</tr></thead><tbody>'+filas+'</tbody>'+
      '<tfoot><tr><td colspan="3"><strong>TOTALES</strong></td>'+
        '<td style="text-align:right"><strong>'+fmtN(o.tHas||0,2)+'</strong></td>'+
        '<td style="text-align:right"><strong>'+(o.tAgua>0?fmtN(o.tAgua,0):'-')+'</strong></td>'+
        prodFooters +
      '</tr></tfoot></table>'+
      '<div style="font-size:10px;color:#666;margin:4px 0 12px">Base: '+(isRiego?'Hect\u00e1reas de riego':'Hect\u00e1reas plantadas')+'</div>'+
      bodegaHtml +
      (o.editada ? '<div style="font-size:10px;color:#7a4200;background:#fff8e0;border-left:2px solid #e9730c;padding:5px 9px;margin-top:8px">Esta orden fue editada el '+(o.editadaFecha||'-')+(o.editadaPor?' por '+o.editadaPor:'')+'</div>' : '')+
      // ── Confirmaciones de aplicación (si las hay) ──
      (function(){
        var confs = (S.confirmaciones||[]).filter(function(c){ return String(c.ordenId)===String(o.id); });
        if(!confs.length) return '<div style="margin-top:12px;padding:8px 11px;background:#f0f4ff;border-left:3px solid #084298;border-radius:4px;font-size:11px;color:#084298">\u23f3 Esta orden NO ha sido confirmada como aplicada.</div>';
        var est = cfEstadoOrden(o);
        var head = '<div style="margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#354a5f;border-bottom:1px solid #bcd9f5;padding-bottom:3px;margin-bottom:6px">CONFIRMACIONES DE APLICACI\u00d3N ('+est+')</div>';
        return head + confs.map(function(c){
          var pNoms = (c.panoIds||[]).map(function(pid){ var p=getPano(pid); return p?p.nombre:'?'; }).join(', ');
          var prodsTxt = (c.productosReales||[]).map(function(pr){ return escapeHtml(pr.nombre||'-')+': '+fmtN(pr.qtyAplicada||0,3)+' '+(pr.unitS||''); }).join(' / ');
          var climaTxt = ((c.tempAmb!==null && c.tempAmb!==undefined)?c.tempAmb+'\u00b0C':'') +
            (c.humedad!==null&&c.humedad!==undefined?' '+c.humedad+'%HR':'') +
            (c.viento!==null&&c.viento!==undefined?' '+c.viento+'km/h':'') +
            (c.condClima?' '+escapeHtml(c.condClima):'');
          return '<div style="background:#fafafa;border-left:2px solid #0a6ed1;padding:6px 9px;margin-bottom:5px;border-radius:3px;font-size:10px;line-height:1.4">'+
            '<div><strong>'+c.fechaApp+'</strong> '+(c.horaInicio||'')+(c.horaFin?'->'+c.horaFin:'')+' '+(c.turno||'')+' - <strong>'+escapeHtml(c.operador||'-')+'</strong>'+(c.equipo?' ('+escapeHtml(c.equipo)+')':'')+'</div>'+
            '<div>Pa\u00f1os: '+escapeHtml(pNoms)+'</div>'+
            '<div>'+prodsTxt+' / Agua: '+fmtN(c.aguaReal||0,0)+'L</div>'+
            (climaTxt?'<div>Clima: '+climaTxt+'</div>':'') +
            (c.notas?'<div style="font-style:italic;color:#666">Obs: '+escapeHtml(c.notas)+'</div>':'') +
            '</div>';
        }).join('');
      })() +
      '<div class="cc-pm-firma">'+
        '<div class="cc-pm-fbox">Firma Responsable T\u00e9cnico<br><br><br>'+(o.responsable||'_________________________')+'</div>'+
        '<div class="cc-pm-fbox">Firma Bodeguero - Confirmaci\u00f3n de entrega<br><br><br>_________________________</div>'+
      '</div>';
    var prodsTtl = prods.length===1 ? prods[0].nombre : (prods[0].nombre+' + '+(prods.length-1)+' m\u00e1s');
    document.getElementById('cc-pm-ttl').textContent=o.numero+' - '+prodsTtl+' - '+o.fecha;
    document.getElementById('cc-pm-doc').innerHTML=html;
    document.getElementById('cc-pm').classList.add('cc-act');
    document.getElementById('cc-pm').scrollTop=0;
  } catch(ex){
    alert('Error al generar la orden: '+ex.message);
  }
}

// Imprime SOLO el documento de la orden, en una ventana nueva aislada del SCI
function ccPrintOrden(){
  var doc = document.getElementById('cc-pm-doc');
  if(!doc || !doc.innerHTML.trim()){
    alert('No hay documento de orden para imprimir.');
    return;
  }
  var ttl = (document.getElementById('cc-pm-ttl')||{}).textContent || 'Orden de Aplicación';

  // Construir HTML completo con estilos embebidos
  var winHtml = '<!doctype html><html><head><meta charset="utf-8"><title>'+ttl.replace(/[<>]/g,'')+'</title>'+
    '<style>'+
      '*{box-sizing:border-box}'+
      'html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;font-size:12px;color:#111}'+
      'body{padding:14px 18px}'+
      'table{width:100%;border-collapse:collapse;margin-bottom:6px}'+
      'thead tr{background:#354a5f}'+
      'th{padding:7px 10px;color:#d1e8ff;font-size:10px;font-weight:700;text-transform:uppercase;text-align:left}'+
      'td{padding:7px 10px;border-bottom:1px solid #e8e8e8;font-size:11px}'+
      'tbody tr:nth-child(even){background:#fafafa}'+
      'tfoot tr{background:#d1e8ff}'+
      'tfoot td{font-weight:700;border-top:2px solid #0a6ed1}'+
      '.cc-pm-hdr{text-align:center;border-bottom:2px solid #354a5f;padding-bottom:12px;margin-bottom:16px}'+
      '.cc-pm-hdr h1{font-size:17px;font-weight:700;margin:0}'+
      '.cc-pm-hdr .cc-sub{font-size:12px;color:#555;margin-top:3px}'+
      '.cc-pm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:13px}'+
      '.cc-pm-fld{border:1px solid #ccc;border-radius:4px;padding:6px 8px}'+
      '.cc-pm-fld .cc-l{font-size:9px;font-weight:700;text-transform:uppercase;color:#666}'+
      '.cc-pm-fld .cc-v{font-size:12px;font-weight:600;margin-top:2px}'+
      '.cc-pm-bodega{padding:12px 15px;background:#f5f9fd;border:2px solid #0a6ed1;border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:14px;page-break-inside:avoid}'+
      '.cc-pm-firma{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:48px;page-break-inside:avoid}'+
      '.cc-pm-fbox{border-top:1px solid #aaa;padding-top:8px;text-align:center;font-size:11px;color:#555}'+
      '@page{margin:14mm 14mm 16mm 14mm}'+
      'table tr{page-break-inside:avoid;page-break-after:auto}'+
      'thead{display:table-header-group}'+
      'tfoot{display:table-footer-group}'+
    '</style></head><body>' + doc.innerHTML + '</body></html>';

  // Eliminar iframe previo si existe
  var existing = document.getElementById('cc-print-iframe');
  if(existing) existing.remove();

  // Crear iframe oculto que se va a imprimir
  var iframe = document.createElement('iframe');
  iframe.id = 'cc-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  // Escribir contenido en el iframe
  var idoc = iframe.contentWindow ? iframe.contentWindow.document : iframe.contentDocument;
  if(!idoc){
    alert('No se pudo preparar la impresión. Intente nuevamente.');
    iframe.remove();
    return;
  }
  idoc.open();
  idoc.write(winHtml);
  idoc.close();

  // Esperar a que el iframe renderice y disparar print
  function doPrint(){
    try{
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }catch(e){
      console.error('Error al imprimir:', e);
      alert('Error al imprimir: '+e.message);
    }
    // Limpiar el iframe después de un momento (dar tiempo a que se complete el diálogo)
    setTimeout(function(){
      try{ iframe.remove(); }catch(e){}
    }, 2000);
  }

  // Algunos navegadores disparan onload inmediatamente; usamos timeout como fallback
  if(idoc.readyState === 'complete'){
    setTimeout(doPrint, 100);
  } else {
    iframe.onload = function(){ setTimeout(doPrint, 100); };
    // Fallback adicional por si onload no dispara
    setTimeout(function(){
      if(iframe && iframe.parentNode){ doPrint(); }
    }, 500);
  }
}
function closePM(){ document.getElementById('cc-pm').classList.remove('cc-act'); document.getElementById('cc-pm-doc').innerHTML=''; }

// ══ EXPORTAR INVENTARIO DE PAÑOS A EXCEL ══
function exportarPanosExcel(){
  if(typeof XLSX==='undefined'){ showNotice('Librería Excel no disponible. Recargue la página.','err'); return; }
  if(!S.panos.length){ showNotice('No hay paños para exportar.','err'); return; }
  // Ordenar padre-hijo y por año
  var ordenados=[];
  ['2018','2024','2026'].forEach(function(y){
    var delAnio=ordenarPanosPadreHijo(S.panos.filter(function(p){ return p.anio===y; }));
    ordenados=ordenados.concat(delAnio);
  });
  // Paños de años no listados (por si acaso)
  S.panos.forEach(function(p){ if(['2018','2024','2026'].indexOf(p.anio)<0) ordenados.push(p); });

  var rows=[[
    'Nombre','Tipo','Pa\u00f1o principal','Variedad','A\u00f1o plantaci\u00f3n',
    'H\u00e1 plantadas','H\u00e1 riego','Densidad (pl/ha)','N\u00b0 plantas',
    'DEH (m)','DSH (m)','Porta injerto','N\u00b0 aplicaciones'
  ]];
  ordenados.forEach(function(p){
    var padreNom='';
    if((p.tipo||'Productivo')==='Polinizante' && p.panoPadre){
      var pad=S.panos.find(function(x){ return String(x.id)===String(p.panoPadre); });
      padreNom=pad?pad.nombre:'';
    }
    var nAplic=S.registros.filter(function(x){ return x.panoId==p.id; }).length;
    // Plantas: valor manual o estimado de densidad × hectáreas
    var plantasCalc = (p.plantas && p.plantas>0) ? Math.round(p.plantas) : Math.round((p.densidad||0)*(p.hectareas||0));
    rows.push([
      p.nombre||'', p.tipo||'Productivo', padreNom, p.variedad||'', p.anio||'',
      parseFloat((p.hectareas||0).toFixed(2)), parseFloat((p.has_riego||0).toFixed(2)),
      p.densidad||0, plantasCalc, p.deh||0, p.dsh||0, p.portaInjerto||'', nAplic
    ]);
  });
  // Fila de totales
  var totalHa=ordenados.reduce(function(s,p){ return s+(p.hectareas||0); },0);
  var totalPlantas=ordenados.reduce(function(s,p){ return s+((p.plantas&&p.plantas>0)?Math.round(p.plantas):Math.round((p.densidad||0)*(p.hectareas||0))); },0);
  rows.push([]);
  rows.push(['TOTALES','','','','', parseFloat(totalHa.toFixed(2)),'','', totalPlantas,'','','','']);

  var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:20},{wch:12},{wch:18},{wch:16},{wch:13},{wch:12},{wch:11},{wch:14},{wch:11},{wch:9},{wch:9},{wch:18},{wch:14}];
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario Pa\u00f1os');
  // Nombre con fecha
  var fecha=new Date().toISOString().slice(0,10);
  var emp='';
  try{ var e=getCompanyData?getCompanyData():null; }catch(e){}
  XLSX.writeFile(wb, 'Inventario_Panos_'+fecha+'.xlsx');
  showNotice('\u2713 Inventario de paños exportado ('+ordenados.length+' paños).','ok');
}

// ══ PAÑOS APP ══
var appPanoYear='2024';
function setPanoY(y,btn){ appPanoYear=y; document.querySelectorAll('.cc-ytab').forEach(function(t){ if(t.closest('#tab-panos')) t.classList.remove('cc-act'); }); btn.classList.add('cc-act'); renderPanosApp(); }
function renderPanosApp(){
  var el=document.getElementById('cc-panos-app'); if(!el) return;
  var psAll=S.panos.filter(function(p){ return p.anio===appPanoYear; });
  if(!psAll.length){ el.innerHTML='<div class="cc-no-data"><span>&#x1F5FA;</span>Sin panos para '+appPanoYear+'.</div>'; return; }
  // AGRUPACIÓN POR CUARTEL: se muestra SOLO el paño productivo (variedad
  // principal) como un grupo. La superficie y las plantas suman las de sus
  // polinizantes vinculados. Los polinizantes no se listan como tarjetas
  // separadas, pero siguen existiendo y se pueden editar al expandir el grupo.
  var ps = psAll.filter(function(p){ return (p.tipo||'Productivo')!=='Polinizante'; });
  // Polinizantes huérfanos (sin padre productivo del mismo año): se muestran
  // igualmente para no esconderlos por completo si quedaron sueltos.
  var polinizantes = psAll.filter(function(p){ return (p.tipo||'Productivo')==='Polinizante'; });
  polinizantes.filter(function(pol){
    return !ps.some(function(prod){ return String(pol.panoPadre)===String(prod.id); });
  }).forEach(function(pol){ ps.push(pol); });
  // Helper: polinizantes vinculados a un productivo.
  function _polinizantesDe(prodId){
    return S.panos.filter(function(x){ return (x.tipo||'Productivo')==='Polinizante' && String(x.panoPadre)===String(prodId); });
  }
  // Helper: superficie total del grupo (principal + polinizantes).
  function _superficieGrupo(p){
    var ha = parseFloat(p.hectareas)||0;
    _polinizantesDe(p.id).forEach(function(h){ ha += parseFloat(h.hectareas)||0; });
    return ha;
  }
  el.innerHTML='';
  ps.forEach(function(p){
    var _idsGrupo=[String(p.id)].concat(_polinizantesDe(p.id).map(function(h){ return String(h.id); }));
    var r=(S.confirmaciones||[]).filter(function(c){
      return (c.panoIds||[]).some(function(pid){ return _idsGrupo.indexOf(String(pid))>=0; });
    }).length;
    var card=document.createElement('div');
    card.className='cc-pano-c'; card.style.borderLeftColor=p.color;
    // Header
    var hdr=document.createElement('div'); hdr.className='cc-pano-c-hdr';
    hdr.onclick=function(){ toggleEl('cc-pe-'+p.id); };
    var esPolin=(p.tipo||'Productivo')==='Polinizante';
    var padreNom='';
    if(esPolin && p.panoPadre){ var pad=S.panos.find(function(x){ return String(x.id)===String(p.panoPadre); }); if(pad) padreNom=pad.nombre; }
    hdr.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      +'<span style="width:13px;height:13px;border-radius:50%;background:'+p.color+';display:inline-block;flex-shrink:0"></span>'
      +'<span style="font-weight:700;font-size:15px">'+p.nombre+'</span>'
      +'<span style="font-style:italic;color:#888">'+p.variedad+'</span>'
      +(esPolin?'<span style="background:#fef3c7;color:#92600a;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">\ud83d\udc1d POLINIZANTE'+(padreNom?' \u2192 '+padreNom:'')+'</span>':'')
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:14px;font-size:13px;color:#888">'
      +(function(){
          // Superficie: para productivos con polinizantes, mostrar el TOTAL del grupo.
          if(!esPolin){
            var haGrupo=_superficieGrupo(p);
            var hijos=_polinizantesDe(p.id);
            if(hijos.length>0){
              return '<span title="Superficie total del grupo (principal + polinizantes)">&#x1F331; '+ (Math.round(haGrupo*100)/100) +' ha total</span>';
            }
            return '<span>&#x1F331; '+p.hectareas+' ha</span>';
          }
          return '<span>&#x1F331; '+p.hectareas+' ha</span>';
        })()
      +'<span>&#x1F4A7; '+(p.has_riego||0)+' ha</span>'
      +'<span>&#x1F33F; '+(p.densidad||0)+' pl/ha</span>'
      +(function(){
          // Calcula plantas: usa el valor manual, o lo estima de densidad × hectáreas
          function plantasDe(pano){
            if(pano.plantas && pano.plantas>0) return Math.round(pano.plantas);
            return Math.round((pano.densidad||0)*(pano.hectareas||0));
          }
          if(!esPolin){
            var hijos=S.panos.filter(function(x){ return (x.tipo||'Productivo')==='Polinizante' && String(x.panoPadre)===String(p.id); });
            var plantasHijos=hijos.reduce(function(s,h){ return s+plantasDe(h); },0);
            var propio=plantasDe(p);
            var total=propio+plantasHijos;
            if(plantasHijos>0){
              // Mostrar desglose: variedad principal + polinizantes = total
              return '<span title="Plantas de la variedad principal">&#x1F333; '+propio.toLocaleString('es-CL')+' '+(p.variedad||'principal')+'</span>'
                +'<span title="Plantas polinizantes" style="color:#92600a">&#x1F41D; '+plantasHijos.toLocaleString('es-CL')+' polin.</span>'
                +'<span style="color:#0a6ed1;font-weight:700">\u03a3 '+total.toLocaleString('es-CL')+' pl totales</span>';
            }
            return propio?'<span title="Total de plantas">&#x1F333; '+propio.toLocaleString('es-CL')+' pl</span>':'';
          }
          // Polinizante: mostrar sus plantas
          var pl=plantasDe(p);
          return pl?'<span style="color:#92600a">&#x1F41D; '+pl.toLocaleString('es-CL')+' pl</span>':'';
        })()
      +(r>0
          ? '<span onclick="event.stopPropagation();verAplicacionesPano(\''+p.id+'\')" style="color:#1565c0;font-weight:700;cursor:pointer;text-decoration:underline">'+r+' aplic. \u203A</span>'
          : '<span>0 aplic.</span>')
      +'</div>';
    // Body
    var body=document.createElement('div'); body.className='cc-pano-c-body'; body.id='cc-pe-'+p.id; body.style.display='none';
    // Grid
    var grid=document.createElement('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:12px';
    function mkField(lbl,type,val,id,ph,step){
      var d=document.createElement('div'); d.className='cc-field';
      var l=document.createElement('label'); l.className='cc-lbl'; l.textContent=lbl; d.appendChild(l);
      var inp=document.createElement('input'); inp.type=type; inp.value=val||''; inp.id=id; if(ph) inp.placeholder=ph; if(step) inp.step=step;
      d.appendChild(inp); return d;
    }
    function mkSelect(lbl,opts,selVal,id){
      var d=document.createElement('div'); d.className='cc-field';
      var l=document.createElement('label'); l.className='cc-lbl'; l.textContent=lbl; d.appendChild(l);
      var s=document.createElement('select'); s.id=id;
      opts.forEach(function(o){ var op=document.createElement('option'); op.value=o; op.text=o; if(o===selVal) op.selected=true; s.appendChild(op); });
      d.appendChild(s); return d;
    }
    grid.appendChild(mkField('Nombre','text',p.nombre,'cc-pen-'+p.id,'Nombre'));
    grid.appendChild(mkField('Variedad','text',p.variedad,'cc-pev-'+p.id,'Variedad'));
    grid.appendChild(mkSelect('A\u00f1o',['2018','2024','2026'],p.anio,'cc-pea-'+p.id));
    grid.appendChild(mkField('H\u00e1 Plantadas','number',p.hectareas,'cc-peh-'+p.id,'0.0','0.1'));
    grid.appendChild(mkField('H\u00e1 Riego','number',p.has_riego,'cc-per-'+p.id,'0.0','0.1'));
    grid.appendChild(mkField('Densidad pl/ha','number',p.densidad,'cc-ped-'+p.id,'1250','1'));
    grid.appendChild(mkField('N\u00b0 plantas (auto = H\u00e1 \u00d7 densidad)','number',p.plantas,'cc-pepl-'+p.id,'0','1'));
    grid.appendChild(mkSelect('Tipo de pa\u00f1o',['Productivo','Polinizante'],p.tipo||'Productivo','cc-petipo-'+p.id));
    // Selector de paño padre (solo relevante si es polinizante) — lista los paños productivos
    (function(){
      var d=document.createElement('div'); d.className='cc-field';
      var l=document.createElement('label'); l.className='cc-lbl'; l.textContent='Pa\u00f1o principal (si es polinizante)'; d.appendChild(l);
      var s=document.createElement('select'); s.id='cc-pepadre-'+p.id;
      var optNone=document.createElement('option'); optNone.value=''; optNone.text='\u2014 Ninguno \u2014'; s.appendChild(optNone);
      S.panos.filter(function(x){ return x.id!==p.id && (x.tipo||'Productivo')==='Productivo'; }).forEach(function(x){
        var o=document.createElement('option'); o.value=x.id; o.text=x.nombre+' ('+x.variedad+')'; if(String(p.panoPadre)===String(x.id)) o.selected=true; s.appendChild(o);
      });
      d.appendChild(s); grid.appendChild(d);
    })();
    grid.appendChild(mkField('DEH (m) - dist. entre hilera','number',p.deh,'cc-pedeh-'+p.id,'0.0','0.1'));
    grid.appendChild(mkField('DSH (m) - dist. sobre hilera','number',p.dsh,'cc-pedsh-'+p.id,'0.0','0.1'));
    grid.appendChild(mkField('Porta injerto','text',p.portaInjerto,'cc-pepi-'+p.id,'Ej: Colt, Gisela 6'));
    body.appendChild(grid);
    // El N° plantas se calcula automáticamente: Há Plantadas × Densidad pl/ha
    // Usamos querySelector sobre el grid (que ya existe en memoria) en vez de document.getElementById,
    // porque el modal aún no se ha insertado en el DOM en este punto.
    (function(){
      var inHa=grid.querySelector('#cc-peh-'+p.id);
      var inDens=grid.querySelector('#cc-ped-'+p.id);
      var inPl=grid.querySelector('#cc-pepl-'+p.id);
      if(inHa&&inDens&&inPl){
        inPl.readOnly=true;
        inPl.style.background='#fafafa';
        inPl.title='Calculado autom\u00e1ticamente: H\u00e1 Plantadas \u00d7 Densidad pl/ha';
        var recalcPl=function(){
          var ha=parseFloat(inHa.value)||0;
          var dens=parseFloat(inDens.value)||0;
          inPl.value=Math.round(ha*dens);
        };
        inHa.addEventListener('input',recalcPl);
        inHa.addEventListener('change',recalcPl);
        inDens.addEventListener('input',recalcPl);
        inDens.addEventListener('change',recalcPl);
        // Calcular al abrir si hay ha y densidad pero no plantas guardadas
        if((!p.plantas||p.plantas===0) && (parseFloat(inHa.value)||0)>0 && (parseFloat(inDens.value)||0)>0){
          recalcPl();
        }
      }
    })();
    var clbl=document.createElement('label'); clbl.className='cc-lbl'; clbl.textContent='Color'; body.appendChild(clbl);
    var cdiv=document.createElement('div'); cdiv.style.cssText='display:flex;gap:7px;flex-wrap:wrap;margin-top:6px;margin-bottom:12px';
    COLORS.forEach(function(c){
      var dot=document.createElement('div'); dot.style.cssText='width:26px;height:26px;border-radius:50%;background:'+c+';cursor:pointer;border:3px solid '+(c===p.color?'#fff':'transparent')+';box-shadow:'+(c===p.color?'0 0 0 2px #354a5f':'none');
      dot.dataset.c=c;
      dot.onclick=function(){ pePickColor(p.id,c,dot); };
      cdiv.appendChild(dot);
    });
    body.appendChild(cdiv);
    var hidColor=document.createElement('input'); hidColor.type='hidden'; hidColor.id='cc-pec-'+p.id; hidColor.value=p.color;
    body.appendChild(hidColor);

    // ── Polinizantes del grupo (editables aquí, ya que no se listan aparte) ──
    if((p.tipo||'Productivo')!=='Polinizante'){
      var hijosPol = _polinizantesDe(p.id);
      if(hijosPol.length>0){
        var polWrap=document.createElement('div');
        polWrap.style.cssText='margin:6px 0 12px;padding:10px;background:#fffaf0;border:1px solid #fde8c0;border-radius:8px';
        var polTit=document.createElement('div');
        polTit.style.cssText='font-size:12px;font-weight:800;color:#92600a;margin-bottom:8px';
        polTit.innerHTML='&#x1F41D; Polinizantes de este cuartel ('+hijosPol.length+')';
        polWrap.appendChild(polTit);
        hijosPol.forEach(function(pol){
          var row=document.createElement('div');
          row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px;padding-bottom:7px;border-bottom:1px dashed #fde8c0';
          var mkMini=function(lbl,val,id,w){
            var d=document.createElement('div'); d.style.cssText='display:flex;flex-direction:column;gap:2px';
            var l=document.createElement('label'); l.style.cssText='font-size:10px;color:#92600a;font-weight:700'; l.textContent=lbl; d.appendChild(l);
            var inp=document.createElement('input'); inp.type='text'; inp.value=(val!=null?val:''); inp.id=id; inp.style.cssText='width:'+(w||'90px')+';padding:5px 7px;border:1px solid #e3c890;border-radius:6px;font-size:12px'; d.appendChild(inp);
            return d;
          };
          row.appendChild(mkMini('Variedad', pol.variedad, 'cc-polv-'+pol.id, '110px'));
          row.appendChild(mkMini('Há', pol.hectareas, 'cc-polh-'+pol.id, '70px'));
          row.appendChild(mkMini('Densidad', pol.densidad, 'cc-pold-'+pol.id, '80px'));
          row.appendChild(mkMini('N° plantas', pol.plantas, 'cc-polpl-'+pol.id, '90px'));
          var bSaveP=document.createElement('button'); bSaveP.className='cc-btn cc-btn-g cc-btn-sm'; bSaveP.style.cssText='align-self:flex-end'; bSaveP.textContent='Guardar';
          bSaveP.onclick=(function(polId){ return function(){ savePolinizanteEdit(polId); }; })(pol.id);
          var bDelP=document.createElement('button'); bDelP.className='cc-btn cc-btn-r cc-btn-sm'; bDelP.style.cssText='align-self:flex-end'; bDelP.textContent='✕';
          bDelP.onclick=(function(polId){ return function(){ delPano(polId); }; })(pol.id);
          row.appendChild(bSaveP); row.appendChild(bDelP);
          polWrap.appendChild(row);
        });
        body.appendChild(polWrap);
      }
    }

    // Buttons
    var btns=document.createElement('div'); btns.className='cc-gr';
    var bSave=document.createElement('button'); bSave.className='cc-btn cc-btn-g cc-btn-sm'; bSave.textContent='Guardar';
    bSave.onclick=function(){ savePanoEdit(p.id); };
    var bDel=document.createElement('button'); bDel.className='cc-btn cc-btn-r cc-btn-sm'; bDel.textContent='Eliminar';
    bDel.onclick=function(){ delPano(p.id); };
    btns.appendChild(bSave); btns.appendChild(bDel);
    body.appendChild(btns);
    card.appendChild(hdr); card.appendChild(body);
    el.appendChild(card);
  });
}

function pePickColor(pid,color,el){
  el.closest('div').querySelectorAll('[data-c]').forEach(function(d){ d.style.border='3px solid transparent'; d.style.boxShadow='none'; });
  el.style.border='3px solid #fff'; el.style.boxShadow='0 0 0 2px #354a5f';
  document.getElementById('cc-pec-'+pid).value=color;
}
function savePanoEdit(id){
  if(typeof can==='function' && !can('cuaderno.panos') && !can('cuaderno.editar')){ showNotice('No tiene permiso para editar paños.','err'); return; }
  var p=S.panos.find(function(x){ return x.id==id; }); if(!p) return;
  p.nombre=document.getElementById('cc-pen-'+id).value.trim()||p.nombre;
  p.variedad=document.getElementById('cc-pev-'+id).value.trim()||p.variedad;
  p.anio=document.getElementById('cc-pea-'+id).value;
  p.hectareas=parseFloat(document.getElementById('cc-peh-'+id).value)||p.hectareas;
  p.has_riego=parseFloat(document.getElementById('cc-per-'+id).value)||0;
  p.densidad=parseFloat(document.getElementById('cc-ped-'+id).value)||0;
  p.plantas=parseFloat(document.getElementById('cc-pepl-'+id).value)||0;
  p.tipo=document.getElementById('cc-petipo-'+id).value||'Productivo';
  p.panoPadre=document.getElementById('cc-pepadre-'+id).value||'';
  p.deh=parseFloat(document.getElementById('cc-pedeh-'+id).value)||0;
  p.dsh=parseFloat(document.getElementById('cc-pedsh-'+id).value)||0;
  p.portaInjerto=document.getElementById('cc-pepi-'+id).value.trim();
  p.color=document.getElementById('cc-pec-'+id).value||p.color;
  save(); renderPanosApp(); renderHeader(); renderChipsReg(); renderOrdenChips();
  showNotice('✓ Paño actualizado.','ok');
}
// Guarda la edición rápida de un paño polinizante desde la tarjeta de su grupo.
function savePolinizanteEdit(id){
  if(typeof can==='function' && !can('cuaderno.panos') && !can('cuaderno.editar')){ showNotice('No tiene permiso para editar paños.','err'); return; }
  var p=S.panos.find(function(x){ return String(x.id)===String(id); }); if(!p) return;
  function num(v){ var n=parseFloat(String(v||'').replace(',','.')); return isNaN(n)?null:n; }
  var v=document.getElementById('cc-polv-'+id); if(v && v.value.trim()) p.variedad=v.value.trim();
  var h=document.getElementById('cc-polh-'+id); var hn=h?num(h.value):null; if(hn!=null) p.hectareas=hn;
  var d=document.getElementById('cc-pold-'+id); var dn=d?num(d.value):null; if(dn!=null) p.densidad=dn;
  var pl=document.getElementById('cc-polpl-'+id); var pln=pl?num(pl.value):null; if(pln!=null) p.plantas=pln;
  save(); renderPanosApp(); renderHeader(); renderChipsReg(); renderOrdenChips();
  showNotice('✓ Polinizante actualizado.','ok');
}
function delPano(id){
  if(typeof can==='function' && !can('cuaderno.panos') && !can('cuaderno.editar')){ showNotice('No tiene permiso para eliminar paños.','err'); return; }
  var p=S.panos.find(function(x){ return x.id==id; }); if(!p) return;
  if(!confirm('¿Eliminar paño "'+p.nombre+'"?')) return;
  S.panos=S.panos.filter(function(x){ return x.id!=id; });
  S.registros=S.registros.filter(function(r){ return r.panoId!=id; });
  save(); renderPanosApp(); renderHeader(); renderChipsReg(); renderOrdenChips();
}
// Configuración: % de producción por estado, por paño-variedad (con default global)
var _cfgProdPanoSel = '__global__';
function configProdEstado(){
  var panos = (typeof S!=='undefined' && Array.isArray(S.panos)) ? S.panos : [];
  // Selector: global (valor por defecto) o un paño específico
  var opciones = '<option value="__global__">⭐ Valor por defecto (todos los paños)</option>'+
    panos.map(function(p){
      var marca = (p.prodPct && Object.keys(p.prodPct).length) ? ' ✓' : '';
      return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.nombre)+' · '+escapeHtml(p.variedad||'')+marca+'</option>';
    }).join('');

  var sel = _cfgProdPanoSel;
  var pctActual, esGlobal = (sel==='__global__');
  if(esGlobal){
    pctActual = Object.assign({}, PROD_ESTADO_DEFAULT, (S.prodPorEstado||{}));
  } else {
    var pano = panos.find(function(p){ return String(p.id)===String(sel); });
    pctActual = getProdPorEstado(pano);
  }

  var estados = [
    {k:'sano', label:'🟢 Sano (normal)', hint:'Plantas en plena producción'},
    {k:'debil', label:'🟡 Débil', hint:'Producen menos que una sana'},
    {k:'replante', label:'🔵 Replante', hint:'Plantas nuevas, producción parcial'},
    {k:'muerto', label:'🔴 Muerto', hint:'No producen'},
    {k:'falta', label:'⚪ Falla/vacío', hint:'Sin planta'}
  ];

  var body = '<div class="form-field" style="margin-bottom:14px"><label>Configurar para</label>'+
    '<select id="pe-pano" onchange="configProdEstadoCambiarPano(this.value)" style="width:100%;padding:10px;border:1px solid var(--bo);border-radius:6px">'+opciones+'</select>'+
    '<div class="hint">El "valor por defecto" se aplica a todos los paños que no tengan configuración propia. Selecciona un paño para darle porcentajes específicos.</div></div>';

  body += '<div style="font-size:13px;color:#666;margin-bottom:12px">'+(esGlobal?'Porcentajes por defecto para todo el huerto:':'Porcentajes específicos para este paño-variedad:')+'</div>';
  body += estados.map(function(e){
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--bo);border-radius:8px;margin-bottom:8px">'+
      '<div style="flex:1"><div style="font-weight:700;color:var(--tx)">'+e.label+'</div><div style="font-size:11px;color:var(--mu)">'+e.hint+'</div></div>'+
      '<div style="display:flex;align-items:center;gap:4px"><input type="number" id="pe-'+e.k+'" value="'+(pctActual[e.k]!=null?pctActual[e.k]:0)+'" min="0" max="100" step="1" style="width:70px;padding:8px;border:1px solid var(--bo);border-radius:6px;text-align:right;font-size:15px;font-weight:700">'+
      '<span style="font-weight:700;color:var(--mu)">%</span></div>'+
    '</div>';
  }).join('');
  if(!esGlobal){
    body += '<button type="button" onclick="configProdEstadoUsarDefault()" style="width:100%;padding:9px;background:#f5f5f5;color:#666;border:1px solid #ddd;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;margin-top:4px">↺ Quitar config propia y usar el valor por defecto</button>';
  }
  body += '<div style="font-size:11px;color:var(--mu);margin-top:8px">Ejemplo: 100 plantas (70 sanas + 20 débiles al 60% + 10 muertas) = 70 + 12 + 0 = 82 plantas productivas.</div>';

  showModal('⚙️ % de producción por estado'+(esGlobal?'':' — paño específico'), body,
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" id="peGuardarBtn">Guardar configuración</button>',
    'md');
  var btn = document.getElementById('peGuardarBtn');
  if(btn){
    btn.onclick = function(){
      var nuevo = {};
      ['sano','debil','replante','muerto','falta'].forEach(function(k){
        var inp=document.getElementById('pe-'+k);
        nuevo[k] = inp ? (parseFloat(inp.value)||0) : 0;
      });
      if(_cfgProdPanoSel==='__global__'){
        S.prodPorEstado = nuevo;
      } else {
        var pano = (S.panos||[]).find(function(p){ return String(p.id)===String(_cfgProdPanoSel); });
        if(pano){ pano.prodPct = nuevo; }
      }
      try{ if(typeof save==='function') save(); }catch(e){}
      try{ if(typeof fbPush==='function') fbPush(true); }catch(e){}
      closeModal();
      toast('Configuración guardada', _cfgProdPanoSel==='__global__'?'Porcentajes por defecto actualizados':'Porcentajes del paño actualizados','success');
    };
  }
}
// Cambiar el paño seleccionado dentro del modal (reabre con sus valores)
function configProdEstadoCambiarPano(val){
  // Guardar lo que el usuario tenga escrito antes de cambiar
  _cfgProdPanoSel = val;
  closeModal();
  setTimeout(configProdEstado, 50);
}
// Quitar config propia de un paño (vuelve al default global)
function configProdEstadoUsarDefault(){
  var pano = (S.panos||[]).find(function(p){ return String(p.id)===String(_cfgProdPanoSel); });
  if(pano && pano.prodPct){ delete pano.prodPct; }
  try{ if(typeof save==='function') save(); }catch(e){}
  try{ if(typeof fbPush==='function') fbPush(true); }catch(e){}
  closeModal();
  setTimeout(configProdEstado, 50);
  toast('Config eliminada','Este paño usará el valor por defecto','success');
}

function addPanoApp(){
  if(typeof can==='function' && !can('cuaderno.panos') && !can('cuaderno.editar')){ showNotice('No tiene permiso para crear paños.','err'); return; }
  // Construir lista de paños productivos para el selector de paño padre
  var padreOpts = '<option value="">— Ninguno —</option>';
  S.panos.filter(function(x){ return (x.tipo||'Productivo')==='Productivo'; }).forEach(function(x){
    padreOpts += '<option value="'+x.id+'">'+escapeHtml(x.nombre)+' ('+escapeHtml(x.variedad||'')+')</option>';
  });
  var anioOpts = ['2018','2024','2026'].map(function(y){ return '<option value="'+y+'"'+(y===appPanoYear?' selected':'')+'>'+y+'</option>'; }).join('');

  var modal = document.createElement('div');
  modal.id = 'cc-add-pano-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:10px;max-width:560px;width:100%;max-height:94vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:10px 10px 0 0">'+
        '<div style="font-weight:700;font-size:15px">🌳 Nuevo paño</div>'+
        '<button onclick="document.getElementById(\'cc-add-pano-modal\').remove()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>'+
      '</div>'+
      '<div style="padding:18px 20px">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
          '<div style="grid-column:span 2"><label class="cc-lbl">Nombre <span style="color:#c00">*</span></label><input type="text" id="cc-np-nombre" placeholder="Ej: Cuartel 1" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">Variedad</label><input type="text" id="cc-np-variedad" placeholder="Ej: Santina" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">Año plantación</label><select id="cc-np-anio" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box">'+anioOpts+'</select></div>'+
          '<div><label class="cc-lbl">Tipo de paño</label><select id="cc-np-tipo" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"><option value="Productivo">Productivo</option><option value="Polinizante">Polinizante</option></select></div>'+
          '<div><label class="cc-lbl">Paño principal (si poliniza)</label><select id="cc-np-padre" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box">'+padreOpts+'</select></div>'+
          '<div><label class="cc-lbl">Há Plantadas</label><input type="number" id="cc-np-hap" placeholder="0.0" step="0.1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">Há Riego</label><input type="number" id="cc-np-hriego" placeholder="0.0" step="0.1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">Densidad (pl/ha)</label><input type="number" id="cc-np-dens" placeholder="1250" step="1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">N° plantas</label><input type="number" id="cc-np-plantas" placeholder="0" step="1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">DEH (m)</label><input type="number" id="cc-np-deh" placeholder="0.0" step="0.1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div><label class="cc-lbl">DSH (m)</label><input type="number" id="cc-np-dsh" placeholder="0.0" step="0.1" min="0" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
          '<div style="grid-column:span 2"><label class="cc-lbl">Porta injerto</label><input type="text" id="cc-np-pi" placeholder="Ej: Colt, Gisela 6" style="width:100%;padding:8px 10px;border:1px solid #d9d9d9;border-radius:6px;box-sizing:border-box"></div>'+
        '</div>'+
        '<div id="cc-np-err" style="display:none;background:#fee;color:#8B1A1A;padding:8px 12px;border-radius:5px;margin-top:10px;font-size:12px"></div>'+
      '</div>'+
      '<div style="padding:12px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px;border-radius:0 0 10px 10px">'+
        '<button class="cc-btn cc-btn-s" onclick="document.getElementById(\'cc-add-pano-modal\').remove()">Cancelar</button>'+
        '<button class="cc-btn cc-btn-g" onclick="guardarNuevoPano()">Guardar paño</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  setTimeout(function(){ var n=document.getElementById('cc-np-nombre'); if(n) n.focus(); }, 50);
}

function guardarNuevoPano(){
  var nombre=(document.getElementById('cc-np-nombre').value||'').trim();
  var err=document.getElementById('cc-np-err');
  if(!nombre){ err.style.display=''; err.textContent='El nombre del paño es obligatorio.'; return; }
  var nuevo={
    id:Date.now(),
    nombre:nombre,
    variedad:(document.getElementById('cc-np-variedad').value||'').trim()||'Sin variedad',
    anio:document.getElementById('cc-np-anio').value,
    tipo:document.getElementById('cc-np-tipo').value||'Productivo',
    panoPadre:document.getElementById('cc-np-padre').value||'',
    hectareas:parseFloat(document.getElementById('cc-np-hap').value)||0,
    has_riego:parseFloat(document.getElementById('cc-np-hriego').value)||0,
    densidad:parseFloat(document.getElementById('cc-np-dens').value)||0,
    plantas:parseFloat(document.getElementById('cc-np-plantas').value)||0,
    deh:parseFloat(document.getElementById('cc-np-deh').value)||0,
    dsh:parseFloat(document.getElementById('cc-np-dsh').value)||0,
    portaInjerto:(document.getElementById('cc-np-pi').value||'').trim(),
    color:COLORS[S.panos.length%COLORS.length]
  };
  S.panos.push(nuevo);
  // Posicionar la vista en el año del nuevo paño
  appPanoYear = nuevo.anio;
  save();
  var modal=document.getElementById('cc-add-pano-modal'); if(modal) modal.remove();
  renderPanosApp(); renderHeader();
  try{ renderChipsReg(); }catch(e){}
  try{ renderOrdenChips(); }catch(e){}
  showNotice('✓ Paño "'+nombre+'" agregado.','ok');
}

// ══ PRODUCTOS ══
function renderProdList(){
  var el=document.getElementById('cc-prod-list'); if(!el) return;
  var cntLbl=document.getElementById('cc-prod-cnt-lbl');
  var searchEl=document.getElementById('cc-prod-search');
  var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  // El catálogo ahora vive en el SCI. Mostramos esos productos (solo lectura);
  // la creación/edición se hace en el módulo Productos del SCI.
  var catalogo = _getProductosCatalogo();
  var lista = catalogo.map(function(p,i){ return {p:p, i:i}; });
  if(q){
    lista = lista.filter(function(o){
      var p=o.p;
      return (p.nombre||'').toLowerCase().indexOf(q)>=0
        || (p.tipo||'').toLowerCase().indexOf(q)>=0
        || (p.ingredienteActivo||'').toLowerCase().indexOf(q)>=0
        || (p.objetivo||'').toLowerCase().indexOf(q)>=0;
    });
  }
  if(cntLbl) cntLbl.textContent='Catálogo del SCI — '+catalogo.length+' productos'+(q?(' ('+lista.length+' encontrados)'):'');
  if(!catalogo.length){ el.innerHTML='<div class="cc-no-data"><span>📦</span>Sin productos en el catálogo del SCI. Créelos en el módulo Productos del SCI.</div>'; return; }
  if(!lista.length){ el.innerHTML='<div class="cc-no-data"><span>🔍</span>Sin resultados para "'+escapeHtml(q)+'"</div>'; return; }
  el.innerHTML='<div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-size:12px;padding:8px 14px;border-bottom:1px solid #eee">📦 El catálogo de productos se administra en el módulo <strong>Productos</strong> del SCI. Aquí se muestra para consulta.'+
    (((typeof S!=='undefined' && Array.isArray(S.productos) && S.productos.length) && (typeof can==='function') && can('productos.crear'))
      ? '<br><button onclick="migrarProductosCuadernoASCI()" style="margin-top:8px;background:#1565c0;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer">⬆️ Migrar '+S.productos.length+' producto(s) del Cuaderno al SCI</button>'
      : '')+
    '</div>'+
  lista.map(function(o){
    var p=o.p;
    var tc=TIPO_C[p.tipo]||TIPO_C['Otro'];
    var detalle = (p.tipo||'—');
    if(p.ingredienteActivo) detalle += ' · i.a.: '+escapeHtml(p.ingredienteActivo);
    if(p.dosis) detalle += ' · '+p.dosis+' '+(p.unidad||'');
    return '<div style="padding:9px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;font-size:13px">'+
      '<div style="flex:1;min-width:0"><span style="font-weight:700">'+escapeHtml(p.nombre)+'</span>'+
        '<div style="font-size:11px;color:#888">'+detalle+'</div>'+
        (p.objetivo?'<div style="font-size:11px;color:#0a6ed1;margin-top:1px">🎯 '+escapeHtml(p.objetivo)+'</div>':'')+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span class="cc-badge" style="background:'+tc[0]+';color:'+tc[1]+'">'+(p.tipo||'Otro')+'</span>'+
      '</div></div>';
  }).join('');
  return;
}
function _renderProdList_OLD_unused(){
  var el=document.getElementById('cc-prod-list'); if(!el) return;
  var cntLbl=document.getElementById('cc-prod-cnt-lbl');
  // Filtro por buscador
  var searchEl=document.getElementById('cc-prod-search');
  var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  // Lista con índice original (para editar/eliminar correctamente tras filtrar)
  var lista = S.productos.map(function(p,i){ return {p:p, i:i}; });
  if(q){
    lista = lista.filter(function(o){
      var p=o.p;
      return (p.nombre||'').toLowerCase().indexOf(q)>=0
        || (p.tipo||'').toLowerCase().indexOf(q)>=0
        || (p.ingredienteActivo||'').toLowerCase().indexOf(q)>=0
        || (p.objetivo||'').toLowerCase().indexOf(q)>=0;
    });
  }
  if(cntLbl) cntLbl.textContent='Catálogo — '+S.productos.length+' productos'+(q?(' ('+lista.length+' encontrados)'):'');
  if(!S.productos.length){ el.innerHTML='<div class="cc-no-data"><span>📦</span>Sin productos cargados</div>'; return; }
  if(!lista.length){ el.innerHTML='<div class="cc-no-data"><span>🔍</span>Sin resultados para "'+escapeHtml(q)+'"</div>'; return; }
  el.innerHTML=lista.map(function(o){
    var p=o.p, i=o.i;
    var tc=TIPO_C[p.tipo]||TIPO_C['Otro'];
    var detalle = (p.tipo||'—');
    if(p.ingredienteActivo) detalle += ' · i.a.: '+escapeHtml(p.ingredienteActivo);
    if(p.dosis) detalle += ' · '+p.dosis+' '+(p.unidad||'');
    return '<div onclick="verDetalleProd('+i+')" style="padding:9px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;font-size:13px;cursor:pointer" onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'">'+
      '<div style="flex:1;min-width:0"><span style="font-weight:700">'+escapeHtml(p.nombre)+'</span>'+
        '<div style="font-size:11px;color:#888">'+detalle+'</div>'+
        (p.objetivo?'<div style="font-size:11px;color:#0a6ed1;margin-top:1px">🎯 '+escapeHtml(p.objetivo)+'</div>':'')+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">'+
        '<span class="cc-badge" style="background:'+tc[0]+';color:'+tc[1]+'">'+( p.tipo||'Otro')+'</span>'+
        '<button onclick="editProd('+i+')" title="Editar" style="background:#fff;border:1px solid #d9d9d9;color:#354a5f;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:13px">✏️</button>'+
        '<button onclick="delProd('+i+')" class="cc-btn-del" style="font-size:14px">✕</button>'+
      '</div></div>';
  }).join('');
}

// Detalle completo del producto (modal de solo lectura con botón Editar)
function verDetalleProd(idx){
  var p=S.productos[idx]; if(!p) return;
  var tc=TIPO_C[p.tipo]||TIPO_C['Otro'];
  function row(lbl,val){
    return '<div style="display:flex;padding:8px 0;border-bottom:1px solid #f0ece4">'+
      '<div style="width:140px;font-size:12px;color:#888;font-weight:600;flex-shrink:0">'+lbl+'</div>'+
      '<div style="font-size:13px;color:#333;flex:1">'+(val?escapeHtml(String(val)):'<span style="color:#bbb">— sin dato —</span>')+'</div>'+
    '</div>';
  }
  var modal=document.createElement('div');
  modal.id='cc-detalle-prod-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML=
    '<div style="background:#fff;border-radius:10px;max-width:480px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">'+
        '<div style="font-weight:700;font-size:15px">📦 '+escapeHtml(p.nombre)+'</div>'+
        '<button onclick="document.getElementById(\'cc-detalle-prod-modal\').remove()" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button>'+
      '</div>'+
      '<div style="padding:18px 20px">'+
        '<div style="margin-bottom:10px"><span class="cc-badge" style="background:'+tc[0]+';color:'+tc[1]+'">'+(p.tipo||'Otro')+'</span></div>'+
        row('Ingrediente activo', p.ingredienteActivo)+
        row('Principal objetivo', p.objetivo)+
        row('Unidad', p.unidad)+
        row('Dosis de referencia', p.dosis)+
      '</div>'+
      '<div style="padding:14px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px">'+
        '<button onclick="document.getElementById(\'cc-detalle-prod-modal\').remove()" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Cerrar</button>'+
        '<button onclick="document.getElementById(\'cc-detalle-prod-modal\').remove();editProd('+idx+')" style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">✏️ Editar</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}
function delProd(idx){
  var p = S.productos[idx];
  if(!p) return;
  // Solo el administrador puede eliminar productos
  if(!STATE.user || STATE.user.role!=='admin'){
    toast('Sin permiso','Solo el administrador puede eliminar productos del cuaderno.','error');
    return;
  }
  var nombre = p.nombre||p.descripcion||'';
  // Verificar que el producto no tenga movimientos/aplicaciones asociadas
  var usadoEnReg = (S.registros||[]).some(function(r){
    if(r.producto && String(r.producto)===String(nombre)) return true;
    if(Array.isArray(r.prods) && r.prods.some(function(pr){ return String(pr.nombre)===String(nombre); })) return true;
    return false;
  });
  var usadoEnOrden = (S.ordenes||[]).some(function(o){
    if(o.producto && String(o.producto)===String(nombre)) return true;
    if(Array.isArray(o.prods) && o.prods.some(function(pr){ return String(pr.nombre)===String(nombre); })) return true;
    return false;
  });
  if(usadoEnReg || usadoEnOrden){
    toast('No se puede eliminar','El producto "'+nombre+'" tiene aplicaciones u órdenes asociadas. No puede eliminarse.','error');
    return;
  }
  confirmDialog('Eliminar producto','¿Eliminar el producto "'+nombre+'" del catálogo? Esta acción no se puede deshacer.',function(){
    S.productos.splice(idx,1);
    save();
    renderProdList();
    toast('Producto eliminado','"'+nombre+'" fue eliminado del catálogo','success');
  },'Eliminar',true);
}


function editProd(idx){
  var p = S.productos[idx]; if(!p) return;
  var tipos = ['Fungicida','Bactericida','Insecticida','Acaricida','Herbicida','Fertilizante foliar','Fertilizante edáfico','Fertilizante suelo','Enmienda','Bioestimulante','Orgánico','Corrector mineral','Coadyuvante','Otro'];
  var unidades = ['mL/100L','L/100L','g/100L','kg/100L','L/ha','kg/ha','mL/ha','g/ha'];
  var tipoOpts = tipos.map(function(t){ return '<option'+(t===p.tipo?' selected':'')+'>'+t+'</option>'; }).join('');
  var uniOpts = unidades.map(function(u){ return '<option'+(u===p.unidad?' selected':'')+'>'+u+'</option>'; }).join('');
  if(unidades.indexOf(p.unidad||'')<0 && p.unidad){
    uniOpts = '<option selected>'+escapeHtml(p.unidad)+'</option>' + uniOpts;
  }
  var html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px" id="cc-edit-prod-modal">'+
    '<div style="background:#fff;border-radius:10px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden">'+
      '<div style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">'+
        '<div style="font-weight:700;font-size:15px">✏️ Editar producto</div>'+
        '<button onclick="closeEditProd()" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button>'+
      '</div>'+
      '<div style="padding:20px">'+
        '<div style="margin-bottom:14px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Nombre comercial *</label>'+
          '<input type="text" id="cc-ep-n" value="'+escapeHtml(p.nombre||'')+'" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box"></div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">'+
          '<div><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Tipo</label>'+
            '<select id="cc-ep-t" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box">'+
              '<option value="">—</option>'+tipoOpts+'</select></div>'+
          '<div><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Unidad</label>'+
            '<select id="cc-ep-u" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box">'+uniOpts+'</select></div>'+
        '</div>'+
        '<div style="margin-bottom:14px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Ingrediente activo</label>'+
          '<input type="text" id="cc-ep-ia" value="'+escapeHtml(p.ingredienteActivo||'')+'" placeholder="Ej: Captan 80%" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box"></div>'+
        '<div style="margin-bottom:14px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Principal objetivo</label>'+
          '<input type="text" id="cc-ep-obj" value="'+escapeHtml(p.objetivo||'')+'" placeholder="Ej: Botrytis, Monilia" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box"></div>'+
        '<div style="margin-bottom:6px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px;font-weight:600">Dosis recomendada</label>'+
          '<input type="text" id="cc-ep-d" value="'+escapeHtml(p.dosis||'')+'" placeholder="Ej: 150-200" style="width:100%;padding:9px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box"></div>'+
        '<div style="background:#fafafa;border-left:3px solid #e9730c;padding:8px 12px;font-size:11px;color:#5a4500;border-radius:4px;margin-top:14px">'+
          '<strong>Nota:</strong> los registros y órdenes anteriores que ya usaron este producto conservan el nombre original (histórico intacto).'+
        '</div>'+
      '</div>'+
      '<div style="padding:14px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px">'+
        '<button onclick="closeEditProd()" style="background:#fff;border:1px solid #d9d9d9;color:#6a7889;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Cancelar</button>'+
        '<button onclick="saveEditProd('+idx+')" style="background:linear-gradient(90deg,#354a5f,#0854a0);color:#fff;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">Guardar cambios</button>'+
      '</div>'+
    '</div></div>';
  var existing = document.getElementById('cc-edit-prod-modal');
  if(existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var n=document.getElementById('cc-ep-n'); if(n){ n.focus(); n.select(); } }, 50);
}
function closeEditProd(){
  var m = document.getElementById('cc-edit-prod-modal');
  if(m) m.remove();
}
function saveEditProd(idx){
  var p = S.productos[idx]; if(!p){ closeEditProd(); return; }
  var nom = (document.getElementById('cc-ep-n').value||'').trim();
  if(!nom){ alert('El nombre no puede estar vacío.'); return; }
  var nuevoTipo = document.getElementById('cc-ep-t').value;
  var nuevaUni = document.getElementById('cc-ep-u').value;
  var nuevaDos = (document.getElementById('cc-ep-d').value||'').trim();
  // Verificar duplicado de nombre (case-insensitive) contra otros productos
  var dup = S.productos.some(function(q,j){ return j!==idx && (q.nombre||'').toLowerCase()===nom.toLowerCase(); });
  if(dup){ alert('Ya existe otro producto con ese nombre.'); return; }
  p.nombre = nom;
  p.tipo = nuevoTipo;
  p.unidad = nuevaUni;
  p.dosis = nuevaDos;
  var iaEl=document.getElementById('cc-ep-ia');
  var objEl=document.getElementById('cc-ep-obj');
  p.ingredienteActivo = iaEl ? iaEl.value.trim() : (p.ingredienteActivo||'');
  p.objetivo = objEl ? objEl.value.trim() : (p.objetivo||'');
  save();
  closeEditProd();
  renderProdList();
  // Refrescar también el wizard si está visible
  if(typeof renderProdListWiz==='function') renderProdListWiz();
  if(typeof showNotice==='function') showNotice('Producto actualizado.','ok');
}

// ══ BACKUP — CARPETA PERSISTENTE ══
var BK_KEY = 'cc_last_backup';
var BK_FOLDER_NAME_KEY = 'cc_backup_folder_name';
var dirHandle = null; // FileSystemDirectoryHandle guardado en memoria

// ── IndexedDB para el dirHandle (no se puede guardar en localStorage) ──
var IDB_NAME = 'CC_FS', IDB_STORE = 'handles', IDB_KEY = 'backupDir';

function idbOpen(cb){
  var req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = function(e){ e.target.result.createObjectStore(IDB_STORE); };
  req.onsuccess = function(e){ cb(null, e.target.result); };
  req.onerror   = function(e){ cb(e.target.error); };
}
function idbPut(handle, cb){
  idbOpen(function(err, db){
    if(err){ if(cb) cb(err); return; }
    var tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = function(){ if(cb) cb(null); };
    tx.onerror    = function(e){ if(cb) cb(e.target.error); };
  });
}
function idbGet(cb){
  idbOpen(function(err, db){
    if(err){ cb(err); return; }
    var tx  = db.transaction(IDB_STORE,'readonly');
    var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = function(e){ cb(null, e.target.result||null); };
    req.onerror   = function(e){ cb(e.target.error); };
  });
}
function idbClear(cb){
  idbOpen(function(err, db){
    if(err){ if(cb) cb(err); return; }
    var tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = function(){ if(cb) cb(null); };
  });
}

// ── Cargar el handle guardado al iniciar ──
function loadDirHandle(cb){
  try{
    idbGet(function(err, handle){
      if(err || !handle){ dirHandle = null; if(cb) cb(); return; }
      // Verificar que el permiso sigue activo
      handle.queryPermission({mode:'readwrite'}).then(function(perm){
        if(perm === 'granted'){
          dirHandle = handle;
          localStorage.setItem(BK_FOLDER_NAME_KEY, handle.name);
        } else {
          dirHandle = null;
        }
        if(cb) cb();
      }).catch(function(){ dirHandle = null; if(cb) cb(); });
    });
  } catch(e){ dirHandle = null; if(cb) cb(); }
}

// ── Seleccionar carpeta ──
function selectBackupFolder(){
  if(!window.showDirectoryPicker){
    alert('Tu navegador no soporta la seleccion de carpetas.\nActualiza Chrome a la version mas reciente.');
    return;
  }
  window.showDirectoryPicker({mode:'readwrite', startIn:'documents'})
    .then(function(handle){
      dirHandle = handle;
      localStorage.setItem(BK_FOLDER_NAME_KEY, handle.name);
      idbPut(handle, function(err){
        if(err) console.warn('No se pudo guardar el handle en IDB:', err);
      });
      renderBkBtn();
      renderBkAlert();
      showNotice('Carpeta "'+handle.name+'" seleccionada. Los backups se guardaran ahi automaticamente.','ok');
    })
    .catch(function(e){
      if(e.name !== 'AbortError') showNotice('No se pudo seleccionar la carpeta: '+e.message,'err');
    });
}

// ── Cambiar carpeta ──
function changeBackupFolder(){
  dirHandle = null;
  idbClear(function(){
    localStorage.removeItem(BK_FOLDER_NAME_KEY);
    selectBackupFolder();
  });
}

// ── Guardar en carpeta (si hay handle) o descargar normal ──
function ccExportBackup(){
  var data = {version:2, app:'CuadernoCampo-Cerezos', fecha:new Date().toISOString(),
    panos:S.panos, registros:S.registros, productos:S.productos, ordenes:S.ordenes, oCounter:S.oCounter};
  var json = JSON.stringify(data, null, 2);
  var fname = 'CC_backup_'+today()+'.json';

  function markDone(){
    localStorage.setItem(BK_KEY, new Date().toISOString());
    renderBkBtn(); renderBkAlert(); updateFloatBadge();
  }

  if(dirHandle){
    // Guardar directo en la carpeta seleccionada
    dirHandle.requestPermission({mode:'readwrite'}).then(function(perm){
      if(perm !== 'granted'){
        showNotice('Sin permiso para escribir en la carpeta. Selecciona la carpeta nuevamente.','err');
        dirHandle = null; renderBkBtn();
        return;
      }
      dirHandle.getFileHandle(fname, {create:true}).then(function(fh){
        fh.createWritable().then(function(w){
          w.write(json).then(function(){
            w.close().then(function(){
              markDone();
              showNotice('Backup guardado en "'+dirHandle.name+'/'+fname+'"','ok');
            });
          });
        });
      }).catch(function(e){
        showNotice('Error al guardar: '+e.message,'err');
      });
    });
  } else {
    // Sin carpeta: descarga normal al navegador
    var blob = new Blob([json],{type:'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = fname; a.click();
    markDone();
    showNotice('Backup descargado. Selecciona una carpeta para automatizar el guardado.','ok');
  }
}

function ccImportBackup(file){
  if(!file) return;
  // Notificación robusta: usa toast (SCI) si está disponible, si no showNotice o alert
  function notify(msg, type){
    if(typeof toast === 'function'){
      toast(type==='err'?'Error':'Cuaderno de Campo', msg, type==='err'?'error':'success');
    } else if(typeof showNotice === 'function' && document.getElementById('cc-app-notice')){
      showNotice(msg, type);
    } else {
      alert(msg);
    }
  }
  var r = new FileReader();
  r.onload = function(e){
    try{
      var d = JSON.parse(e.target.result);
      if(!d || d.app !== 'CuadernoCampo-Cerezos'){
        notify('Archivo no válido. Debe ser un respaldo del Cuaderno de Campo (.json).','err');
        return;
      }
      var fechaStr = d.fecha ? new Date(d.fecha).toLocaleDateString('es-CL') : 'fecha desconocida';
      var msg = '¿Restaurar backup del '+fechaStr+'?\n\nSe reemplazarán todos los datos actuales del Cuaderno de Campo';
      if(typeof FB!=='undefined' && FB.ready){ msg += ' y se subirán a la nube (Firebase).'; } else { msg += '.'; }
      if(!confirm(msg)) return;
      // Asegurar que el objeto S existe
      if(typeof S === 'undefined'){
        notify('Error: el Cuaderno de Campo no está inicializado. Abra el Cuaderno primero.','err');
        return;
      }
      S.panos=d.panos||[]; S.registros=d.registros||[];
      S.productos=d.productos||[]; S.ordenes=d.ordenes||[];
      S.confirmaciones=d.confirmaciones||[]; S.oCounter=d.oCounter||1;
      if(!Array.isArray(S.confirmaciones)) S.confirmaciones = [];
      // Guardar local + subir a la nube
      try{ localStorage.setItem('cc_v2', JSON.stringify(S)); }catch(e){}
      if(typeof FB!=='undefined' && FB.ready && typeof fbPush === 'function'){
        try{ fbPush(true); }catch(e){ console.error('Error al subir a Firebase:', e); }
      }
      // Refrescar la vista del Cuaderno SOLO si está montado (sin romper si no lo está)
      try{ if(typeof initApp === 'function' && document.getElementById('cc-app')){ initApp(); } }catch(e){ console.error(e); }
      var okMsg = (typeof FB!=='undefined' && FB.ready)
        ? 'Backup del Cuaderno restaurado y subido a la nube. '+(d.panos?d.panos.length:0)+' paño(s), '+(d.ordenes?d.ordenes.length:0)+' orden(es).'
        : 'Backup del Cuaderno restaurado correctamente.';
      notify(okMsg,'ok');
    } catch(ex){
      notify('Error al restaurar: '+ex.message,'err');
      console.error('Error en ccImportBackup:', ex);
    }
  };
  r.onerror = function(){ notify('No se pudo leer el archivo.','err'); };
  r.readAsText(file);
}

function daysSinceBk(){
  var d = localStorage.getItem(BK_KEY); if(!d) return null;
  return Math.floor((Date.now()-new Date(d).getTime())/86400000);
}

function getFolderName(){
  return localStorage.getItem(BK_FOLDER_NAME_KEY) || null;
}

function renderBkBtn(){
  var btn = document.getElementById('cc-bk-hdr-btn');
  var lbl = document.getElementById('cc-bk-hdr-lbl');
  if(!btn) return;
  // Botón siempre neutro: con sincronización en la nube no hay alarmas de respaldo
  btn.className='cc-bk-btn';
  lbl.textContent = 'Respaldo';
}

function renderBkAlert(){
  var el = document.getElementById('cc-bk-alert'); if(!el) return;
  // Backup gestionado solo desde Configuración del SCI (admin). No mostrar nada aquí.
  el.innerHTML='';
}

// ══ NOTICES ══
function showNotice(msg,type){
  var el=document.getElementById('cc-app-notice');
  if(!el) return;
  el.innerHTML='<div class="notice notice-'+(type==='ok'?'ok':type==='err'?'err':'info')+'">'+msg+'</div>';
  el.style.display='';
  setTimeout(function(){ el.style.display='none'; },3500);
}

// ══ INIT ══
// ══ STARTUP MODAL ══
function showStartupModal(){
  var modal = document.getElementById('cc-startup-modal');
  if(!modal) return; // Modal no existe (integración SCI); inicialización via renderCuaderno()
  var hasLocal = load();
  var hasLocalDiv = document.getElementById('cc-sm-has-local');
  if(hasLocal && S.panos.length){
    hasLocalDiv.style.display = 'block';
    var info = document.getElementById('cc-sm-local-info');
    info.textContent = S.panos.length+' pano(s) - '+S.registros.length+' aplicacion(es) - '+S.productos.length+' producto(s)';
    document.getElementById('cc-sm-fresh-btn').querySelector('.cc-ot').textContent = 'Comenzar desde cero';
    document.getElementById('cc-sm-fresh-btn').querySelector('.cc-os').textContent = 'Descarta los datos actuales y configura un huerto nuevo';
  } else {
    hasLocalDiv.style.display = 'none';
  }
  var folderEl = document.getElementById('cc-sm-folder-info');
  if(folderEl){
    var fn = localStorage.getItem(BK_FOLDER_NAME_KEY);
    folderEl.textContent = fn ? 'Carpeta de backup: "'+fn+'"' : 'Sin carpeta de backup seleccionada aun';
  }
  modal.style.display = 'flex';
}

function closeStartupModal(){
  var m = document.getElementById('cc-startup-modal');
  if(m) m.style.display='none';
}

function startFromLocal(){
  // Data already loaded by showStartupModal → load()
  closeStartupModal();
  if(S.panos.length){
    document.getElementById('cc-setup').style.display='none';
    document.getElementById('cc-app').style.display='block';
    initApp();
  } else {
    document.getElementById('cc-setup').style.display='block';
    addPanoRow();
  }
}

function startFromBackup(file){
  if(!file) return;
  var r = new FileReader();
  r.onload = function(e){
    try{
      var d = JSON.parse(e.target.result);
      if(d.app !== 'CuadernoCampo-Cerezos'){
        showSmError('El archivo no es un respaldo válido del Cuaderno de Campo.');
        return;
      }
      S.panos     = d.panos     || [];
      S.registros = d.registros || [];
      S.productos = d.productos || [];
      S.ordenes   = d.ordenes   || [];
      S.oCounter  = d.oCounter  || 1;
      save();
      localStorage.setItem(BK_KEY, d.fecha || new Date().toISOString());
      closeStartupModal();
      document.getElementById('cc-setup').style.display='none';
      document.getElementById('cc-app').style.display='block';
      initApp();
      setTimeout(function(){ showNotice('Backup cargado: '+S.panos.length+' panos, '+S.registros.length+' aplicaciones.','ok'); }, 300);
    } catch(ex){
      showSmError('Error al leer el archivo: '+ex.message);
    }
    document.getElementById('cc-sm-file-in').value='';
  };
  r.readAsText(file);
}

function startFresh(){
  // Clear everything
  S = { panos:[], registros:[], productos:[], ordenes:[], oCounter:1, vinculosSCI:{} };
  save();
  closeStartupModal();
  document.getElementById('cc-panos-tbody').innerHTML='';
  document.getElementById('cc-setup').style.display='block';
  document.getElementById('cc-app').style.display='none';
  addPanoRow();
}

function showSmError(msg){
  var el = document.getElementById('cc-sm-error');
  if(!el){ alert('Cuaderno de Campo: '+msg); return; }
  el.textContent = msg;
  el.style.display = '';
}

// ══ FLOAT SAVE BUTTON ══
function showFloatSave(){
  var btn = document.getElementById('cc-float-save');
  if(btn) btn.classList.add('cc-visible');
  updateFloatBadge();
}
function updateFloatBadge(){
  var badge = document.getElementById('cc-float-badge');
  if(!badge) return;
  var d = daysSinceBk();
  if(d===null || d>=1){
    badge.textContent = d===null ? '!' : d+'d';
    badge.style.background = d===null||d>=7 ? '#e85c38' : d>=3 ? '#fbd6a8' : '#fbd6a8';
    badge.style.color = '#354a5f';
  } else {
    badge.textContent = '✓';
    badge.style.background = '#a8e890';
  }
}

// Override ccExportBackup to also update float badge
var _origCcExportBackup;

// ══ INIT ══
// window.onload removido: el Cuaderno ahora se inicializa via renderCuaderno() del SCI

function initApp(){
  // Restore folder handle from IndexedDB first
  loadDirHandle(function(){
    renderHeader();
    renderBkBtn();
    renderBkAlert();
    renderChipsReg();
    renderOrdenChips();
    renderResumen();
    renderHist();
    renderPanosApp();
    renderProdList();
    updateFiltroSelect();
    document.getElementById('cc-f-fecha').value=today();
    document.getElementById('cc-o-fecha').value=today();
    document.getElementById('cc-o-num').value='OA-'+String(S.oCounter).padStart(5,'0');
    showFloatSave();
    updateFloatBadge();
    // Ask to select folder if none saved yet
    if(!getFolderName()){
      setTimeout(function(){
        showNotice('Selecciona una carpeta de backups en el Resumen para guardar automaticamente.','info');
      }, 1500);
    }
  });
}
