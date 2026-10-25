// auth.js — Autenticación, roles y permisos
import {S, AUTH} from './state.js';
import {toast} from './core.js';
import {nav} from './ui.js';
import {FS, initFirestore} from './firebase.js';
import {seccionAplica} from './regimenes.js';
import {iniciarInactividad, INACTIVIDAD_MIN} from './inactividad.js';

// Callback que app.js registra para arrancar la app tras login exitoso.
let _onAuthReady=null;
export const setOnAuthReady=fn=>{_onAuthReady=fn;};

// ═══ SISTEMA DE AUTENTICACIÓN Y USUARIOS ═══
// Estructura de un usuario en Firestore (colección "usuarios", doc.id = email):
// {
//   email, nombre, foto, rol: 'admin'|'senior'|'contador'|'consulta',
//   activo: true|false,          // false = acceso revocado
//   pendiente: false|true,       // true = intentó entrar pero admin no lo aprobó
//   creadoEn, ultimoLogin,
//   permisos: {                  // opcional; sobrescribe el rol para secciones específicas
//     empresa: 'none'|'read'|'write',
//     pdc: '...', apertura: '...',
//     ventas: '...', compras: '...', honorarios: '...',
//     auxiliares: '...',
//     diario: '...', mayor: '...', balance: '...', resultados: '...'
//   }
// }

// Roles (V2.21.88)
//  admin    → acceso total a todas las empresas (propias o de otros), gestiona
//             usuarios y edita los perfiles. Sus permisos no se limitan.
//  senior   → crea sus propias empresas y autoriza a usuarios Contador a
//             trabajar en ellas. Ve sólo sus empresas y las que le asignen.
//  contador → trabaja sólo en las empresas que le asignen. No crea empresas.
//  consulta → rol heredado (sólo lectura). Es también el rol con que queda una
//             cuenta recién registrada mientras espera aprobación.
// Los permisos por módulo de Senior y Contador los define el administrador en
// "Perfiles" (documento global `_perfiles`).
const ROLES={
  admin:{icon:'👑',label:'Administrador',color:'var(--ach)',descripcion:'Acceso total a todas las empresas + usuarios y perfiles'},
  senior:{icon:'🎖',label:'Senior',color:'var(--ok,#3fb950)',descripcion:'Crea sus empresas y autoriza contadores en ellas'},
  contador:{icon:'📝',label:'Contador',color:'var(--info)',descripcion:'Trabaja en las empresas que le asignen'},
  consulta:{icon:'👁',label:'Consulta',color:'var(--mt)',descripcion:'Solo lectura (rol heredado)'}
};
// Roles cuyo perfil edita el administrador
const ROLES_PERFIL=['senior','contador'];
// Secciones exclusivas del administrador: no entran en los perfiles
const SOLO_ADMIN=['usuarios','perfiles','auditlog','integridad'];

// Secciones a las que se aplican permisos
const SECCIONES=[
  {id:'inicio',lbl:'Inicio'},
  {id:'empresa',lbl:'Empresa'},
  {id:'empresas',lbl:'Empresas'},
  {id:'centroscosto',lbl:'Centros de Costo'},
  {id:'pdc',lbl:'Plan de Cuentas'},
  {id:'cargadatos',lbl:'Carga desde Excel'},
  {id:'sistema',lbl:'Sistema y Respaldos'},
  {id:'indicadores',lbl:'Indicadores'},
  {id:'apertura',lbl:'Balance de Apertura'},
  {id:'ventas',lbl:'Libro de Ventas'},
  {id:'compras',lbl:'Libro de Compras'},
  {id:'inventario',lbl:'Control de Inventario'},
  {id:'honorarios',lbl:'Honorarios'},
  {id:'remuneraciones',lbl:'Remuneraciones'},
  {id:'auxiliares',lbl:'Auxiliares'},
  {id:'pagos',lbl:'Pagos y Cobros'},
  {id:'diario',lbl:'Libro Diario'},
  {id:'libroscv',lbl:'Libros mensuales Compra y Venta'},
  {id:'foliossii',lbl:'Hojas foliadas SII'},
  {id:'mayor',lbl:'Libro Mayor'},
  {id:'balance',lbl:'Balance General'},
  {id:'resultados',lbl:'Estado de Resultados'},
  {id:'flujocaja',lbl:'Flujo de Caja'},
  {id:'conciliacion',lbl:'Conciliación Bancaria'},
  {id:'comprobantes',lbl:'Comprobantes'},
  {id:'auditlog',lbl:'Registro de Actividad'},
  {id:'integridad',lbl:'Auditoría de Integridad / Productivo'},
  {id:'f29',lbl:'Formulario 29'},
  {id:'ppm',lbl:'PPM'},
  {id:'renta',lbl:'Declaración de Renta'},
  {id:'dj',lbl:'Declaraciones Juradas'},
  {id:'asigcc',lbl:'Asignar Centros de Costo'},
  {id:'activofijo',lbl:'Activos Fijos'},
  {id:'provisiones',lbl:'Provisiones'},
  {id:'correccion',lbl:'Corrección Monetaria'},
  {id:'cierresmensuales',lbl:'Cierres Mensuales'},
  {id:'cierre',lbl:'Cierre del Ejercicio'}
];

// Permisos de fábrica de cada rol (antes de que el admin edite los perfiles)
function permisosBase(rol){
  const p={};
  SECCIONES.forEach(s=>{
    if(rol==='admin'||rol==='senior'||rol==='contador')p[s.id]='write';
    else if(rol==='consulta')p[s.id]='read';
    else p[s.id]='none';
  });
  // Diagnóstico, alertas técnicas y trazabilidad global son exclusivos del
  // administrador.
  if(rol!=='admin'){
    p.integridad='none';
    p.auditlog='none';
  }
  // El Contador no administra empresas: puede ver el listado para cambiar de
  // empresa, pero no crear ni editar.
  if(rol==='contador')p.empresas='read';
  return p;
}

// Perfiles editados por el administrador: {senior:{seccion:nivel}, contador:{...}}
// Se cargan al iniciar sesión desde el documento global `_perfiles` y se
// recuerdan en este equipo para el arranque rápido.
const PERFILES={datos:{},actualizadoEn:'',actualizadoPor:''};
const CLAVE_PERFILES_CACHE='cv:perfiles-cache';
const NIVELES=['none','read','write'];

function setPerfiles(d){
  const limpio={};
  ROLES_PERFIL.forEach(r=>{
    const src=(d&&d[r])||{};
    const o={};
    SECCIONES.forEach(s=>{if(NIVELES.includes(src[s.id]))o[s.id]=src[s.id];});
    limpio[r]=o;
  });
  PERFILES.datos=limpio;
  PERFILES.actualizadoEn=(d&&d._actualizadoEn)||'';
  PERFILES.actualizadoPor=(d&&d._actualizadoPor)||'';
  try{localStorage.setItem(CLAVE_PERFILES_CACHE,JSON.stringify({...limpio,_actualizadoEn:PERFILES.actualizadoEn,_actualizadoPor:PERFILES.actualizadoPor}));}catch(e){}
}
function perfilesRecordados(){
  try{const d=JSON.parse(localStorage.getItem(CLAVE_PERFILES_CACHE)||'null');if(d)setPerfiles(d);}catch(e){}
}
async function cargarPerfiles(){
  try{
    if(!window.storage||!window.storage.leerGlobalConEstado)return false;
    const r=await window.storage.leerGlobalConEstado('_perfiles');
    if(r.fuente==='error')return false;
    setPerfiles(r.value?JSON.parse(r.value):{});
    return true;
  }catch(e){console.warn('No se pudieron cargar los perfiles:',e);return false;}
}

// Permisos efectivos de un rol: los de fábrica corregidos por su perfil
function permisosDeRol(rol){
  const p=permisosBase(rol);
  if(ROLES_PERFIL.includes(rol))Object.assign(p,PERFILES.datos[rol]||{});
  // Lo exclusivo del administrador no se abre por perfil
  if(rol!=='admin'){p.integridad='none';p.auditlog='none';}
  return p;
}

// Admin y Senior crean empresas; Contador y Consulta no.
function puedeCrearEmpresas(){
  return !!(AUTH.user&&AUTH.user.activo&&(AUTH.user.rol==='admin'||AUTH.user.rol==='senior'));
}

// Estado global del usuario actual
// AUTH se importa de state.js (evita duplicar el objeto de estado)

// Retorna el permiso efectivo del usuario para una sección: 'none' | 'read' | 'write'
function permiso(seccion){
  // El Balance de 8 columnas es una vista del Balance: comparte su permiso.
  if(seccion==='balance8')seccion='balance';
  // El Importador RCV opera sobre el Libro de Compras/Ventas: comparte el permiso de Compras.
  if(seccion==='importrcv')seccion='compras';
  if(!AUTH.user||!AUTH.user.activo)return 'none';
  // El administrador tiene acceso total, sin excepciones
  if(AUTH.user.rol==='admin')return 'write';
  if(SOLO_ADMIN.includes(seccion))return 'none';
  // Permisos custom del usuario sobrescriben su perfil
  if(AUTH.user.permisos&&AUTH.user.permisos[seccion])return AUTH.user.permisos[seccion];
  return permisosDeRol(AUTH.user.rol)[seccion]||'none';
}

function puedeVer(seccion){return permiso(seccion)!=='none';}
function puedeEditar(seccion){return permiso(seccion)==='write';}
function esAdmin(){return AUTH.user&&AUTH.user.activo&&AUTH.user.rol==='admin';}

async function initAuth(){
  if(typeof firebase==='undefined'||!firebase.auth){
    console.warn('Firebase Auth no disponible');
    document.getElementById('login-error').style.display='';
    document.getElementById('login-error').textContent='Sistema de autenticación no disponible. Verifica tu conexión.';
    return;
  }
  AUTH.auth=firebase.auth();

  // ── V2.13.1 · Login obligatorio al volver a abrir la app ──
  //
  // La autenticación queda limitada a la sesión actual del navegador/app.
  // Además usamos una marca en sessionStorage para distinguir un simple reload
  // de una ejecución nueva. Si la app fue cerrada y luego vuelve a abrirse,
  // sessionStorage parte vacío y eliminamos cualquier credencial que Firebase
  // pudiera haber restaurado desde una persistencia antigua LOCAL.
  //
  // Resultado: recargar la página no molesta al usuario, pero cerrar la app o
  // el navegador y abrirlos nuevamente obliga a ingresar la contraseña.
  const inicioNuevo=marcarNuevaEjecucion();
  try{
    const P=firebase.auth.Auth.Persistence;
    await AUTH.auth.setPersistence(P.SESSION);
    if(inicioNuevo){
      try{await AUTH.auth.signOut();}catch(e){console.warn('No se pudo limpiar la sesión anterior:',e);}
    }
  }catch(e){
    console.warn('No se pudo fijar la persistencia SESSION:',e);
    // Aun si setPersistence falla, en una ejecución nueva intentamos cerrar la
    // credencial restaurada para no saltarnos el login solicitado.
    if(inicioNuevo){try{await AUTH.auth.signOut();}catch(_){}}
  }

  // Listener de cambios de sesión
  AUTH.auth.onAuthStateChanged(async(user)=>{
    if(!user){
      // No hay sesión → mostrar login
      mostrarLogin();
      return;
    }
    // Hay sesión → verificar autorización en Firestore
    await verificarUsuarioAutorizado(user);
  });
}

// ── Perfil recordado de este dispositivo ──
//
// El perfil autorizado se mantiene como caché local para acelerar la verificación
// DESPUÉS de que el usuario se autentica con sus credenciales. Desde V2.13.1 ya
// no se utiliza para saltarse el login al reabrir la app: una ejecución nueva
// limpia primero cualquier sesión Firebase anterior. Una vez autenticado, si el
// perfil recordado corresponde al mismo correo, la interfaz puede entrar rápido
// mientras Firestore revalida permisos detrás.
//
// Esto no debilita la seguridad: el perfil recordado sólo decide qué se ve en
// pantalla. Quién puede leer o escribir datos de verdad lo siguen decidiendo
// las reglas de Firestore, del lado del servidor, en cada operación.
const CLAVE_PERFIL='cv:perfil';

function perfilRecordado(email){
  if(!email)return null;
  try{
    const p=JSON.parse(localStorage.getItem(CLAVE_PERFIL)||'null');
    if(p&&p.email&&p.email.toLowerCase()===String(email).toLowerCase()&&p.activo)return p;
  }catch(e){}
  return null;
}
function recordarPerfil(u){
  try{localStorage.setItem(CLAVE_PERFIL,JSON.stringify({
    email:u.email,nombre:u.nombre||'',foto:u.foto||'',
    rol:u.rol||'consulta',activo:!!u.activo,permisos:u.permisos||null,
  }));}catch(e){}
}
function olvidarPerfil(){try{localStorage.removeItem(CLAVE_PERFIL);}catch(e){}}

// ── Sesión forzada por ejecución (V2.13.1) ──
// sessionStorage sobrevive a un reload, pero normalmente desaparece al cerrar
// la pestaña/ventana o la PWA. Es exactamente la frontera que necesitamos.
const CLAVE_EJECUCION='cv:ejecucion-autenticada-v1';
function marcarNuevaEjecucion(){
  try{
    if(sessionStorage.getItem(CLAVE_EJECUCION)==='1')return false;
    sessionStorage.setItem(CLAVE_EJECUCION,'1');
    return true;
  }catch(e){
    // Si el navegador bloquea sessionStorage preferimos el lado seguro:
    // considerar cada carga como una ejecución nueva y exigir login.
    return true;
  }
}

// Se conservan estas dos funciones por compatibilidad con módulos/versiones
// antiguas, pero la persistencia LOCAL ya no se puede habilitar desde la UI.
function sesionPersistente(){return false;}
function setSesionPersistente(){
  try{
    const P=firebase.auth.Auth.Persistence;
    if(AUTH.auth)AUTH.auth.setPersistence(P.SESSION).catch(()=>{});
  }catch(e){}
  try{window.toast&&window.toast('🔒 El inicio de sesión obligatorio está activado');}catch(e){}
}

// Modo del formulario: 'login' (inicio de sesión) o 'register' (registro nuevo usuario)
let LOGIN_MODE='login';

function toggleLoginMode(){
  LOGIN_MODE=LOGIN_MODE==='login'?'register':'login';
  const isReg=LOGIN_MODE==='register';
  document.getElementById('login-mode-sub').textContent=isReg?'Crea tu cuenta para acceder':'Inicia sesión para acceder al sistema';
  document.getElementById('btn-submit-login').innerHTML=isReg?'📝 Crear Cuenta':'🔐 Iniciar Sesión';
  document.getElementById('toggle-mode-btn').textContent=isReg?'← Volver a inicio de sesión':'¿Primer usuario? Regístrate';
  document.getElementById('login-name-wrap').style.display=isReg?'':'none';
  document.getElementById('login-password-hint').style.display=isReg?'':'none';
  document.getElementById('login-password').setAttribute('autocomplete',isReg?'new-password':'current-password');
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-success').style.display='none';
}

async function submitLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const password=document.getElementById('login-password').value;
  const nombre=document.getElementById('login-name').value.trim();
  const errEl=document.getElementById('login-error');
  const loadEl=document.getElementById('login-loading');
  const okEl=document.getElementById('login-success');
  const btn=document.getElementById('btn-submit-login');

  errEl.style.display='none';okEl.style.display='none';

  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa un email válido';return;
  }
  if(!password||password.length<6){
    errEl.style.display='';errEl.textContent='⚠️ La contraseña debe tener al menos 6 caracteres';return;
  }
  if(LOGIN_MODE==='register'&&!nombre){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa tu nombre';return;
  }

  btn.disabled=true;btn.style.opacity='0.6';
  loadEl.style.display='';loadEl.textContent=LOGIN_MODE==='register'?'⏳ Creando cuenta...':'⏳ Iniciando sesión...';

  try{
    if(LOGIN_MODE==='register'){
      await AUTH.auth.createUserWithEmailAndPassword(email,password);
      // Actualizar el displayName con el nombre ingresado
      try{await AUTH.auth.currentUser.updateProfile({displayName:nombre});}catch(e){}
    }else{
      await AUTH.auth.signInWithEmailAndPassword(email,password);
    }
    // El onAuthStateChanged toma el control
  }catch(e){
    console.error('Error auth:',e);
    btn.disabled=false;btn.style.opacity='1';
    loadEl.style.display='none';
    errEl.style.display='';
    const map={
      'auth/user-not-found':'⚠️ No existe una cuenta con este email',
      'auth/wrong-password':'⚠️ Contraseña incorrecta',
      'auth/invalid-credential':'⚠️ Email o contraseña incorrectos',
      'auth/invalid-email':'⚠️ Email inválido',
      'auth/email-already-in-use':'⚠️ Este email ya está registrado. Intenta iniciar sesión.',
      'auth/weak-password':'⚠️ La contraseña es muy débil (mínimo 6 caracteres)',
      'auth/too-many-requests':'⚠️ Demasiados intentos. Espera unos minutos.',
      'auth/network-request-failed':'⚠️ Sin conexión a internet',
      'auth/operation-not-allowed':'⚠️ Registro por email/contraseña no habilitado en Firebase Console'
    };
    errEl.textContent=map[e.code]||('Error: '+(e.message||e.code));
  }
}

async function recuperarPassword(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const errEl=document.getElementById('login-error');
  const okEl=document.getElementById('login-success');
  errEl.style.display='none';okEl.style.display='none';
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
    errEl.style.display='';errEl.textContent='⚠️ Ingresa tu email primero y luego haz clic en "¿Olvidaste tu contraseña?"';return;
  }
  try{
    await AUTH.auth.sendPasswordResetEmail(email);
    okEl.style.display='';
    okEl.innerHTML=`✅ Enviamos un enlace de recuperación a <strong>${email}</strong>.<br>Revisa tu bandeja de entrada (y la carpeta de spam).`;
  }catch(e){
    errEl.style.display='';
    if(e.code==='auth/user-not-found')errEl.textContent='⚠️ No existe una cuenta con ese email';
    else errEl.textContent='Error: '+(e.message||e.code);
  }
}

// Espera antes de reintentar la verificación cuando Firestore aún no responde.
// Arranca corto y va cediendo: ahora que Auth y Firestore parten en paralelo,
// lo normal es que falte medio segundo, no tres. Con el reintento fijo de 3 s
// un login nuevo pagaba esa espera completa aunque la base ya estuviera lista.
const ESPERAS=[250,500,1000,2000,3000];
let _intentoVerif=0;

async function verificarUsuarioAutorizado(fbUser){
  const errEl=document.getElementById('login-error');
  const loadEl=document.getElementById('login-loading');

  // ── Reanudar de inmediato con el perfil recordado ──
  // Este es el camino normal al reabrir la app en el teléfono. La verificación
  // contra Firestore sigue corriendo detrás; si la cuenta ya no está activa, se
  // cierra sesión abajo.
  const recordado=perfilRecordado(fbUser.email);
  if(recordado&&!AUTH.user){
    perfilesRecordados();
    entrarConPerfil(recordado);
  }
  const yaDentro=!!AUTH.user;
  if(!yaDentro){loadEl.style.display='';loadEl.textContent='⏳ Verificando permisos...';}

  if(!FS.enabled||!FS.db){
    // Sin base de datos todavía. Si ya entramos con el perfil recordado esto es
    // sólo un reintento silencioso; si no, hay que esperar y decirlo sin
    // aparentar que la sesión se cerró.
    if(!yaDentro){
      errEl.style.display='';
      errEl.textContent=recordado
        ? 'Reanudando tu sesión… esperando conexión con la base de datos.'
        : 'Conectando con la base de datos…';
    }
    const espera=ESPERAS[Math.min(_intentoVerif++,ESPERAS.length-1)];
    setTimeout(()=>verificarUsuarioAutorizado(fbUser),espera);
    return;
  }
  _intentoVerif=0;

  try{
    const email=fbUser.email.toLowerCase();
    const doc=await FS.db.collection('usuarios').doc(email).get();

    // La cuenta de usuarios sólo hace falta para los casos raros: cuando el
    // usuario no tiene documento (¿es el primero del sistema?) o cuando su
    // documento quedó a medias. En el arranque normal esta segunda lectura
    // duplicaba la espera para no cambiar nada.
    const dudoso=!doc.exists||!doc.data()||!doc.data().activo||doc.data().rol!=='admin';
    let esPrimerUsuario=false, esUnicoYPropio=false;
    if(dudoso){
      const todos=await FS.db.collection('usuarios').limit(2).get();
      esPrimerUsuario=todos.empty;
      // Red de seguridad: si el ÚNICO documento del sistema es el de este mismo usuario,
      // debe ser admin (evita quedar bloqueado si el registro inicial falló a medias).
      esUnicoYPropio=todos.size===1&&todos.docs[0].id===email;
    }

    let userData;
    if(!doc.exists){
      // Usuario no registrado en /usuarios/
      if(esPrimerUsuario){
        // ¡Primer usuario del sistema! → auto-admin
        userData={
          email,
          nombre:fbUser.displayName||email.split('@')[0],
          foto:fbUser.photoURL||'',
          rol:'admin',
          activo:true,
          pendiente:false,
          creadoEn:firebase.firestore.FieldValue.serverTimestamp(),
          ultimoLogin:firebase.firestore.FieldValue.serverTimestamp()
        };
        await FS.db.collection('usuarios').doc(email).set(userData);
        console.log('Primer usuario del sistema — asignado como admin:',email);
      }else{
        // No es primer usuario y no está en /usuarios/ → crear como pendiente
        userData={
          email,
          nombre:fbUser.displayName||email.split('@')[0],
          foto:fbUser.photoURL||'',
          rol:'consulta',
          activo:false,
          pendiente:true,
          creadoEn:firebase.firestore.FieldValue.serverTimestamp()
        };
        try{await FS.db.collection('usuarios').doc(email).set(userData);}catch(e){}
        errEl.style.display='';loadEl.style.display='none';
        errEl.innerHTML=`⏳ Cuenta creada. Tu solicitud de acceso está <strong>pendiente de aprobación</strong> por un administrador.<br><br>Email: <strong>${email}</strong><br><br>Contacta al administrador para que apruebe tu cuenta.`;
        olvidarPerfil();
        setTimeout(async()=>{await AUTH.auth.signOut();location.reload();},8000);
        return;
      }
    }else{
      userData={...doc.data(),email};
      // Red de seguridad: si eres el ÚNICO usuario del sistema pero tu doc quedó
      // inactivo o sin rol admin (registro inicial fallido), auto-promover a admin.
      if(esUnicoYPropio&&(!userData.activo||userData.rol!=='admin')){
        userData.rol='admin';userData.activo=true;userData.pendiente=false;
        try{await FS.db.collection('usuarios').doc(email).update({rol:'admin',activo:true,pendiente:false});}catch(e){}
        console.log('Único usuario del sistema — auto-promovido a admin:',email);
      }
      if(!userData.activo){
        // Se revocó el acceso: el perfil recordado deja de valer y hay que
        // sacar al usuario aunque hubiera entrado con él hace un segundo.
        olvidarPerfil();
        document.getElementById('login-overlay').style.display='flex';
        errEl.style.display='';loadEl.style.display='none';
        if(userData.pendiente){
          errEl.innerHTML=`⏳ Tu cuenta <strong>${email}</strong> está pendiente de aprobación por un administrador.`;
        }else{
          errEl.innerHTML=`🚫 Tu acceso ha sido revocado. Contacta al administrador.`;
        }
        setTimeout(async()=>{await AUTH.auth.signOut();location.reload();},6000);
        return;
      }
      // Actualizar último login (sin bloquear)
      FS.db.collection('usuarios').doc(email).update({
        ultimoLogin:firebase.firestore.FieldValue.serverTimestamp(),
        // Actualizar foto/nombre por si cambió en Google
        foto:fbUser.photoURL||userData.foto||'',
        nombre:userData.nombre||fbUser.displayName||email.split('@')[0]
      }).catch(()=>{});
    }

    // Perfiles de permisos (los define el admin). Si la nube no responde se
    // usan los últimos conocidos en este equipo.
    await cargarPerfiles();
    recordarPerfil(userData);
    entrarConPerfil(userData);
  }catch(e){
    console.error('Error verificando usuario:',e);
    // Si ya estábamos dentro con el perfil recordado, un fallo de red al
    // re-verificar no puede echar al usuario a la calle: se avisa y se sigue.
    if(AUTH.user){
      try{toast('⚠️ No se pudieron revisar tus permisos ahora — se usarán los últimos conocidos','e');}catch(e2){}
      return;
    }
    errEl.style.display='';loadEl.style.display='none';
    errEl.textContent='Error verificando permisos: '+e.message;
  }
}

// Pinta la app con un perfil ya resuelto (recién verificado o el recordado)
function entrarConPerfil(userData){
    const email=userData.email;
    AUTH.user=userData;
    AUTH.ready=true;

    // Ocultar login, mostrar app
    document.getElementById('login-overlay').style.display='none';
    // Mostrar badge de usuario
    const badge=document.getElementById('user-badge');
    badge.style.display='flex';
    document.getElementById('user-name').textContent=userData.nombre||email;
    const rolInfo=ROLES[userData.rol]||ROLES.consulta;
    document.getElementById('user-role').innerHTML=`${rolInfo.icon} ${rolInfo.label}`;
    if(userData.foto){
      const av=document.getElementById('user-avatar');
      av.src=userData.foto;av.style.display='';
    }
    // Bloque de usuario en el nav móvil
    const nub=document.getElementById('nav-user-block-m');
    if(nub){
      nub.style.display='';
      document.getElementById('nav-user-name-m').textContent=userData.nombre||email;
      document.getElementById('nav-user-role-m').innerHTML=`${rolInfo.icon} ${rolInfo.label}`;
    }
    // Mostrar item Usuarios si es admin
    if(esAdmin()){
      document.getElementById('nav-usuarios').style.display='';
      const np=document.getElementById('nav-perfiles');if(np)np.style.display='';
      const na=document.getElementById('nav-auditlog');if(na)na.style.display='';
    }
    // Aplicar filtros de permisos a la UI
    aplicarPermisosUI();
    // Cierre automático tras 30 minutos sin actividad (V2.21.89)
    iniciarInactividad(cerrarPorInactividad);
    // Iniciar la app si aún no ha iniciado
    if(!window._appInited){window._appInited=true;(_onAuthReady||(()=>{}))();}
}

// Cierre de sesión por inactividad: sin preguntas (nadie está mirando). Antes
// se intenta guardar lo pendiente; al volver, el login explica qué pasó.
const CLAVE_MOTIVO='cv:motivo-cierre';
async function cerrarPorInactividad(){
  try{
    const pendiente=!!(window.haySinGuardar&&window.haySinGuardar());
    if(pendiente&&window.saveAll){
      await Promise.race([window.saveAll({silencioso:true}),new Promise(r=>setTimeout(r,8000))]);
    }
  }catch(e){console.warn('No se pudo guardar antes del cierre por inactividad:',e);}
  try{sessionStorage.setItem(CLAVE_MOTIVO,'inactividad');}catch(e){}
  try{await AUTH.auth.signOut();}catch(e){}
  olvidarPerfil();
  try{window.olvidarNav&&window.olvidarNav();}catch(e){}
  location.reload();
}

function mostrarLogin(){
  document.getElementById('login-overlay').style.display='flex';
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-loading').style.display='none';
  document.getElementById('login-success').style.display='none';
  const btn=document.getElementById('btn-submit-login');
  if(btn){btn.disabled=false;btn.style.opacity='1';}
  document.getElementById('user-badge').style.display='none';
  AUTH.user=null;
  try{
    if(sessionStorage.getItem(CLAVE_MOTIVO)==='inactividad'){
      sessionStorage.removeItem(CLAVE_MOTIVO);
      const ok=document.getElementById('login-success');
      if(ok){ok.style.display='';ok.textContent=`🔒 Tu sesión se cerró tras ${INACTIVIDAD_MIN} minutos sin actividad. Vuelve a ingresar.`;}
    }
  }catch(e){}
}

async function logout(){
  // Antes de cerrar sesión: si queda trabajo sin guardar, se ofrece guardarlo.
  // No se avisa y ya — se guarda, que es lo que la gente quiere de verdad.
  const pendiente=(()=>{try{return !!(window.haySinGuardar&&window.haySinGuardar());}catch(e){return false;}})();
  if(pendiente){
    // Con trabajo pendiente: Aceptar guarda y sale, Cancelar se queda.
    try{
      if(window.confirmarSalida){ if(!await window.confirmarSalida('cerrar sesión'))return; }
      else if(!confirm('⚠️ Hay cambios SIN GUARDAR.\n\n¿Cerrar sesión de todas formas?'))return;
    }catch(e){return;}
  }else if(!confirm('¿Cerrar sesión?'))return;
  try{await AUTH.auth.signOut();}catch(e){}
  olvidarPerfil();
  // El recorrido y la última pantalla son del usuario que se va
  try{window.olvidarNav&&window.olvidarNav();}catch(e){}
  location.reload();
}

// Ocultar items del nav para secciones sin acceso
// Secciones del menú que dependen del régimen tributario de la empresa activa.
// Una Pyme del Art. 14 D está liberada de corrección monetaria y un contribuyente
// de renta presunta no lleva activo fijo tributario ni cierre de RLI: mostrarles
// esos módulos sólo invita a registrar algo que no corresponde.
const SECCION_POR_REGIMEN={correccion:'correccion', activofijo:'activofijo',
                           provisiones:'provisiones', cierre:'cierre'};

function aplicarPermisosUI(){
  document.querySelectorAll('.nav-item[data-s]').forEach(item=>{
    const s=item.getAttribute('data-s');
    if(SOLO_ADMIN.includes(s)){
      item.style.display=esAdmin()?'':'none';return;
    }
    if(!puedeVer(s)){item.style.display='none';return;}
    // Régimen: se oculta la sección, pero nunca se borra su dato
    const clave=Object.keys(SECCION_POR_REGIMEN).find(k=>SECCION_POR_REGIMEN[k]===s);
    if(clave&&!seccionAplica(S.empresa&&S.empresa.regimen,clave)){item.style.display='none';return;}
    item.style.display='';
  });
  // Accesos directos de la barra superior: mismos permisos que el menú.
  document.querySelectorAll('.qn-btn[data-s]').forEach(b=>{
    b.style.display=puedeVer(b.getAttribute('data-s'))?'':'none';
  });
  ocultarGruposVacios();
}

// Un encabezado de grupo del menú ("Activo Fijo", "Cierre de Ejercicio") no
// debe quedar solo cuando el régimen o los permisos ocultaron todos sus ítems.
function ocultarGruposVacios(){
  const nav=document.querySelector('nav')||document;
  nav.querySelectorAll('.nav-label').forEach(lbl=>{
    let n=lbl.nextElementSibling, algunoVisible=false;
    while(n&&!n.classList.contains('nav-label')){
      if(n.classList.contains('nav-item')&&n.style.display!=='none'){algunoVisible=true;break;}
      n=n.nextElementSibling;
    }
    lbl.style.display=algunoVisible?'':'none';
  });
}


export {sesionPersistente, setSesionPersistente,
  ROLES, ROLES_PERFIL, SOLO_ADMIN, PERFILES, permisosBase, setPerfiles, cargarPerfiles, puedeCrearEmpresas,
  SECCIONES, permisosDeRol, permiso, puedeVer, puedeEditar, esAdmin, initAuth, LOGIN_MODE, toggleLoginMode, submitLogin, recuperarPassword, verificarUsuarioAutorizado, mostrarLogin, logout, aplicarPermisosUI};
