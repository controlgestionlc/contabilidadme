// empresas.js — Gestión multiempresa.
// Cada empresa tiene sus datos completamente aislados: el prefijo de storage
// separa ventas, compras, asientos, PDC, indicadores, etc.
//
// Claves en storage:
//   _empresas          → catálogo maestro [{id,nombre,rut,marco}] (admin)
//   _empresas_u:<email>→ empresas creadas por ese usuario
//   _empresaActiva     → id de la empresa en uso
//   <id>:ventas-2026   → datos de esa empresa (el prefijo lo aplica storage.js)

import {toast} from './core.js';
import {AUTH} from './state.js';
import {REGIMEN_DEFAULT} from './regimenes.js';
import {guardarACLEmpresa, borrarACLEmpresa, asegurarACLEmpresa, miembrosDe, aclDisponible} from './acl.js';

// Marcos contables disponibles
export const MARCOS=[
  {id:'tributaria', nm:'Tributaria chilena (PCGA)', desc:'Orientada al SII: F29, PPM, depreciación tabla SII, corrección monetaria Art. 41.'},
  {id:'ifrs-pyme',  nm:'NIIF para PYMEs',           desc:'Estados financieros de propósito general. Sin corrección monetaria; deterioro y valor razonable.'},
  {id:'ifrs-full',  nm:'NIIF plenas (IFRS Full)',   desc:'Norma completa. Para entidades con obligación pública de rendir cuentas.'},
];
export const marcoInfo=id=>MARCOS.find(m=>m.id===id)||MARCOS[0];

// ── Visibilidad por usuario ──
// Cada empresa guarda quién la creó (`creadoPor`, el email) y con quién está
// compartida (`compartidaCon`, lista de emails). Un usuario ve sus empresas,
// las que le compartieron y las heredadas (las que existían antes de este
// cambio, que no tienen dueño y quedan visibles para todos hasta que alguien
// las reclame). Los administradores ven todo el catálogo.
//
// IMPORTANTE: esto es visibilidad de interfaz, no aislamiento de datos. Los
// documentos siguen en la misma colección de Firestore y las reglas actuales
// permiten leerlos a cualquier usuario activo. Para aislamiento real hay que
// endurecer las reglas (ver README).
export const EMPRESAS={
  lista:[],        // visibles para el usuario en sesión
  todas:[],        // catálogo completo (lo que se persiste)
  activa:null,
  errorCarga:null, // por qué no se pudo leer el catálogo (null = todo bien)
  sinEmpresas:false, // rol Consulta sin ninguna empresa compartida
};

const emailActual=()=>((AUTH.user&&AUTH.user.email)||'').toLowerCase();
const esAdminActual=()=>!!(AUTH.user&&AUTH.user.activo&&AUTH.user.rol==='admin');

export const empresaSinDuenio=e=>!e.creadoPor;
export function puedeVerEmpresa(e){
  if(!e)return false;
  if(esAdminActual())return true;              // el admin administra todo el catálogo
  if(empresaSinDuenio(e))return true;          // heredada: visible hasta que se reclame
  const yo=emailActual();
  if(!yo)return true;                          // sin sesión identificada, no ocultamos nada
  if(String(e.creadoPor).toLowerCase()===yo)return true;
  return (e.compartidaCon||[]).some(x=>String(x).toLowerCase()===yo);
}
export const esDuenioDeEmpresa=e=>!!e&&String(e.creadoPor||'').toLowerCase()===emailActual();

// Recalcula la lista visible a partir del catálogo completo
export function aplicarVisibilidad(){
  EMPRESAS.lista=EMPRESAS.todas.filter(puedeVerEmpresa);
  return EMPRESAS.lista;
}

// Clave de empresa activa POR USUARIO: antes era global y dos usuarios se
// pisaban la selección entre sí.
const claveActiva=()=>{
  const yo=emailActual();
  return yo?'_empresaActiva:'+yo:'_empresaActiva';
};

// ── Migración desde monoempresa ──
// Los datos antiguos se guardaron sin prefijo (ej "ventas-2026"). Al pasar a
// multiempresa las claves llevan "emp1:", así que hay que renombrarlas una vez.
// Si no se hiciera, la app arrancaría vacía aunque los datos siguieran ahí.
const CLAVES_DATOS=['empresa','pdc','pdc_v','activos','trabajadores'];
const PREFIJOS_ANUALES=['ventas-','compras-','honorarios-','asientos-','apertura-'];

export async function migrarSiHaceFalta(){
  try{
    const yaHecha=await window.storage.getGlobal('_migrado_multiempresa');
    if(yaHecha&&yaHecha.value==='1')return {migradas:0,yaHecha:true};
  }catch(e){}

  const LS_PREFIX='cv:';
  let migradas=0;
  try{
    // Recolectar claves antiguas (sin "empN:" y que sean de datos)
    const antiguas=[];
    for(let i=0;i<localStorage.length;i++){
      const full=localStorage.key(i);
      if(!full||!full.startsWith(LS_PREFIX))continue;
      const base=full.slice(LS_PREFIX.length);
      if(base.startsWith('_'))continue;           // catálogo
      if(/^emp[a-z0-9]+:/.test(base))continue;    // ya migrada
      const esDato=CLAVES_DATOS.includes(base)||PREFIJOS_ANUALES.some(p=>base.startsWith(p));
      if(esDato)antiguas.push(base);
    }
    // Copiar a la clave con prefijo emp1 (conservando la original por seguridad)
    for(const base of antiguas){
      const valor=localStorage.getItem(LS_PREFIX+base);
      if(valor===null)continue;
      const nueva=LS_PREFIX+'emp1:'+base;
      if(localStorage.getItem(nueva)===null){
        localStorage.setItem(nueva,valor);
        migradas++;
      }
    }
    await window.storage.setGlobal('_migrado_multiempresa','1');
  }catch(e){console.warn('Migración multiempresa:',e);}
  return {migradas,yaHecha:false};
}

// ── Catálogo repartido por usuario (V2.21.20) ──
//
// Antes todo el catálogo vivía en un solo documento `_empresas`, pero las
// reglas sólo dejan escribirlo a un administrador. Un Contador que creaba su
// empresa la veía en su equipo y NUNCA llegaba a la nube: al volver a entrar
// la app no la encontraba, le fabricaba otra con un id nuevo y todo lo hecho
// quedaba colgando de un id que ya nadie conocía.
//
// Ahora el catálogo se arma con varios documentos:
//   _empresas               → catálogo maestro (sólo lo escribe un admin)
//   _empresas_u:<email>     → empresas que creó ese usuario (lo escribe él,
//                             o un admin)
// Cada empresa tiene UN documento hogar (HOGAR[id]); guardar reescribe sólo
// los documentos cuyo contenido cambió y que este usuario puede escribir.
// El acceso real a los datos lo siguen decidiendo `empresas_acl` y las reglas.
const DOC_MAESTRO='_empresas';
const PREF_USUARIO='_empresas_u:';
const docUsuario=email=>PREF_USUARIO+String(email||'').toLowerCase();
const HOGAR={};                 // id empresa → documento donde vive
const DOCS=new Map();           // documento → {ok, ultimo:JSON guardado/leído}
const correoDe=e=>String((e&&e.creadoPor)||'').trim().toLowerCase();

// Une el maestro con los catálogos de usuario. Reglas de confianza:
//  · de un catálogo de usuario sólo vale lo que ese usuario dice ser suyo
//    (nadie se adjudica empresas ajenas escribiendo en su propio documento);
//  · si el maestro tiene la misma empresa con OTRO dueño, gana el maestro;
//  · si el maestro la tiene sin dueño o con el mismo dueño, gana el del
//    usuario (reclamo de heredada, o edición más reciente de su dueño).
export function unirCatalogos(maestro,porUsuario){
  const mapa=new Map(),hogar={};
  (maestro||[]).forEach(e=>{if(e&&e.id){mapa.set(e.id,e);hogar[e.id]=DOC_MAESTRO;}});
  (porUsuario||[]).forEach(({doc,email,lista})=>{
    const yo=String(email||'').toLowerCase();
    (lista||[]).forEach(e=>{
      if(!e||!e.id||correoDe(e)!==yo)return;
      const prev=mapa.get(e.id);
      if(prev&&correoDe(prev)&&correoDe(prev)!==yo)return;
      mapa.set(e.id,e);hogar[e.id]=doc;
    });
  });
  return {todas:[...mapa.values()],hogar};
}

// Qué documento escribir y con qué contenido. Un usuario común sólo escribe
// su propio documento, con todas las empresas de las que es dueño. Un admin
// escribe el maestro y los documentos de usuario, según el hogar de cada una.
export function repartirCatalogo(todas,hogar,{admin,email}){
  const yo=String(email||'').toLowerCase();
  const mio=docUsuario(yo);
  const out=new Map();
  if(!admin){
    out.set(mio,todas.filter(e=>correoDe(e)===yo));
    return out;
  }
  todas.forEach(e=>{
    const d=hogar[e.id]||DOC_MAESTRO;
    if(!out.has(d))out.set(d,[]);
    out.get(d).push(e);
  });
  return out;
}

const parse=v=>{try{const x=v?JSON.parse(v):[];return Array.isArray(x)?x:[];}catch(e){return [];}};

export async function cargarEmpresas(){
  // ── Por qué esto es tan cuidadoso ──
  // Si una lectura falla —reglas, red, sesión a medio iniciar— el catálogo se
  // ve vacío. Crear y guardar algo en ese estado pisaría el catálogo real.
  // Se distingue "la nube dice que no hay nada" de "no pude leer la nube".
  EMPRESAS.errorCarga=null;
  EMPRESAS.sinEmpresas=false;
  DOCS.clear();
  const yo=emailActual();
  const admin=esAdminActual();

  // 1) Maestro
  const rc=await window.storage.leerGlobalConEstado(DOC_MAESTRO);
  if(rc.fuente==='error'){
    EMPRESAS.errorCarga=rc.error||'No se pudo leer el catálogo de empresas';
    EMPRESAS.todas=parse(rc.value);
    aplicarVisibilidad();
    console.error('No se pudo cargar el catálogo de empresas:',rc.error);
    return EMPRESAS;   // sin tocar la nube
  }
  const maestro=parse(rc.value);
  DOCS.set(DOC_MAESTRO,{ok:true,ultimo:JSON.stringify(maestro)});

  // 2) Catálogos de usuario (el propio siempre, aunque la consulta falle)
  const lst=await window.storage.listarIdsGlobales(PREF_USUARIO);
  const ids=new Set(lst.ids||[]);
  if(yo)ids.add(docUsuario(yo));
  const porUsuario=[];
  for(const doc of ids){
    const r=await window.storage.leerGlobalConEstado(doc);
    const email=doc.slice(PREF_USUARIO.length);
    if(r.fuente==='error'){
      DOCS.set(doc,{ok:false,ultimo:null});
      if(email===yo){
        // Sin leer el propio no se puede guardar sin pisarlo
        EMPRESAS.errorCarga=r.error||'No se pudo leer tu catálogo de empresas';
      }
      continue;
    }
    const lista=parse(r.value);
    DOCS.set(doc,{ok:true,ultimo:r.fuente==='nube'?JSON.stringify(lista):null});
    porUsuario.push({doc,email,lista});
  }
  const u=unirCatalogos(maestro,porUsuario);
  EMPRESAS.todas=u.todas;
  Object.keys(HOGAR).forEach(k=>delete HOGAR[k]);
  Object.assign(HOGAR,u.hogar);
  if(EMPRESAS.errorCarga){aplicarVisibilidad();return EMPRESAS;}
  if(!lst.ok)console.warn('No se pudieron listar los catálogos de usuario: sólo se ven el maestro y el propio',lst.error);

  // Empresa activa: primero la del usuario, si no la global (compatibilidad)
  EMPRESAS.activa=null;
  try{
    const r=await window.storage.getGlobal(claveActiva());
    if(r)EMPRESAS.activa=r.value;
  }catch(e){}
  if(!EMPRESAS.activa){
    try{
      const r=await window.storage.getGlobal('_empresaActiva');
      EMPRESAS.activa=r?r.value:null;
    }catch(e){}
  }
  // Sistema recién instalado: sólo un admin crea la empresa inicial del maestro
  if(!EMPRESAS.todas.length&&admin){
    const def={id:'emp1',nombre:'Mi Empresa',rut:'',marco:'tributaria',
      creada:new Date().toISOString(),creadoPor:yo||'',compartidaCon:[]};
    EMPRESAS.todas=[def];HOGAR.emp1=DOC_MAESTRO;
    EMPRESAS.activa='emp1';
    await guardarCatalogo();
  }
  aplicarVisibilidad();
  // Si el usuario no puede ver la empresa activa, cae a la primera visible.
  // Si no tiene ninguna, se le crea una propia (salvo rol Consulta, que no
  // puede escribir: a ése se le avisa que pida que le compartan una).
  if(!EMPRESAS.activa||!EMPRESAS.lista.find(e=>e.id===EMPRESAS.activa)){
    if(!EMPRESAS.lista.length){
      if(AUTH.user&&AUTH.user.rol==='consulta'){
        EMPRESAS.sinEmpresas=true;EMPRESAS.activa=null;
        return EMPRESAS;
      }
      const nombre=(AUTH.user&&AUTH.user.nombre)?`Empresa de ${AUTH.user.nombre}`:'Mi Empresa';
      const id=await crearEmpresa(nombre,'','tributaria');
      EMPRESAS.activa=id;
    }else{
      EMPRESAS.activa=EMPRESAS.lista[0].id;
    }
    await window.storage.setGlobal(claveActiva(),EMPRESAS.activa);
  }
  // Un admin, al entrar, deja al día las fichas de acceso de todo el catálogo
  // (repara las que hayan quedado a medias). En segundo plano.
  if(admin)refrescarACL();
  return EMPRESAS;
}

// Firma de acceso de una empresa: si no cambió, no hace falta reescribir su ACL
const firmaACL=e=>`${String(e.creadoPor||'').toLowerCase()}|${miembrosDe(e).sort().join(',')}|${e.nombre||''}`;
const ULTIMA_ACL={};   // id → firma escrita en esta sesión

// Replica en `empresas_acl` los cambios de dueño/compartidos, porque las reglas
// de Firestore no pueden leer el catálogo (es un JSON dentro de un string).
// Las reglas sólo dejan tocar la ficha al dueño o a un admin: intentar las
// demás sólo llena la consola de "sin permisos" y demora las propias.
async function refrescarACL(){
  if(!aclDisponible())return;
  const admin=esAdminActual();
  for(const e of EMPRESAS.todas){
    if(!admin&&!esDuenioDeEmpresa(e))continue;
    const f=firmaACL(e);
    if(ULTIMA_ACL[e.id]===f)continue;
    if(await guardarACLEmpresa(e))ULTIMA_ACL[e.id]=f;
  }
}

export async function guardarCatalogo(){
  // Salvaguarda: si el catálogo no se pudo leer, escribirlo pisaría en la nube
  // lo de todos con lo poco que tengamos en memoria.
  if(EMPRESAS.errorCarga){
    console.warn('No se guarda el catálogo: no se pudo leer primero');
    return false;
  }
  const admin=esAdminActual(), yo=emailActual();
  if(!admin&&!yo){console.warn('No se guarda el catálogo: usuario sin email');return false;}
  // Un usuario común guarda en su documento todo lo que es suyo: ése pasa a
  // ser el hogar de esas empresas (incluidas las heredadas que reclamó).
  if(!admin)EMPRESAS.todas.forEach(e=>{if(correoDe(e)===yo)HOGAR[e.id]=docUsuario(yo);});
  // Documentos a revisar: los que tienen contenido ahora y los que lo tenían
  // al leer (para que una empresa que se fue de un documento salga de él).
  const plan=repartirCatalogo(EMPRESAS.todas,HOGAR,{admin,email:yo});
  if(admin)DOCS.forEach((info,doc)=>{if(info.ok&&!plan.has(doc))plan.set(doc,[]);});
  let ok=true;
  for(const [doc,lista] of plan){
    const info=DOCS.get(doc);
    if(info&&!info.ok){console.warn('No se guarda',doc,': no se pudo leer');ok=false;continue;}
    const json=JSON.stringify(lista);
    if(info&&info.ultimo===json)continue;           // sin cambios
    if(!info&&!lista.length)continue;               // nada que crear
    const r=await window.storage.setGlobal(doc,json,{fusionar:true});
    if(r&&r.conflicto){ok=false;continue;}
    let final=json;
    if(r&&r.fusionado&&r.value){
      // Otro equipo escribió en el intermedio: adoptar lo fusionado
      final=r.value;
      parse(r.value).forEach(x=>{
        if(!x||!x.id)return;
        const i=EMPRESAS.todas.findIndex(e=>e.id===x.id);
        if(i<0){EMPRESAS.todas.push(x);HOGAR[x.id]=doc;}
      });
    }
    DOCS.set(doc,{ok:true,ultimo:final});
  }
  if(EMPRESAS.activa)await window.storage.setGlobal(claveActiva(),EMPRESAS.activa);
  aplicarVisibilidad();
  refrescarACL();   // en segundo plano: no debe frenar el guardado
  return ok;
}

export const empresaActiva=()=>EMPRESAS.todas.find(e=>e.id===EMPRESAS.activa)||null;

// Antes de leer los datos de una empresa, su ficha de acceso tiene que estar
// en la nube (las reglas la consultan en cada lectura). Se ESPERA a propósito.
export async function asegurarAccesoEmpresa(id){
  const e=EMPRESAS.todas.find(x=>x.id===(id||EMPRESAS.activa));
  if(!e)return 'ok';
  const puede=esAdminActual()||esDuenioDeEmpresa(e);
  const r=await asegurarACLEmpresa(e,emailActual(),{puedeEscribir:puede});
  if(r==='escrita')ULTIMA_ACL[e.id]=firmaACL(e);
  if(r==='sin-permiso'||r==='error')console.warn('Acceso a la empresa',e.id,'→',r);
  return r;
}

// ── Operaciones ──
export async function crearEmpresa(nombre,rut,marco,regimen){
  // El id debe ser único aunque se creen dos empresas en el mismo milisegundo
  // (pasaba al auto-crear la empresa de un usuario justo después de otra).
  let id='emp'+Date.now().toString(36);
  while(EMPRESAS.todas.some(e=>e.id===id))id='emp'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  EMPRESAS.todas.push({id,nombre,rut:rut||'',marco:marco||'tributaria',
    regimen:regimen||REGIMEN_DEFAULT,
    creada:new Date().toISOString(),
    creadoPor:emailActual()||'',      // dueño = quien la crea
    compartidaCon:[]});
  // Hogar: el maestro si la crea un admin; si no, el catálogo del usuario
  HOGAR[id]=esAdminActual()?DOC_MAESTRO:docUsuario(emailActual());
  await guardarCatalogo();
  await asegurarAccesoEmpresa(id);   // la ficha debe existir antes de usarla
  return id;
}

// ── Compartir y traspasar ──
export async function compartirEmpresa(id,emails){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  const limpios=[...new Set((emails||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))]
    .filter(x=>x!==String(e.creadoPor||'').toLowerCase());   // el dueño no se auto-comparte
  e.compartidaCon=limpios;
  await guardarCatalogo();
  return true;
}
// Reclama una empresa heredada (sin dueño) o traspasa el dueño (solo admin)
export async function asignarDuenio(id,email){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  e.creadoPor=String(email||'').trim().toLowerCase();
  e.compartidaCon=(e.compartidaCon||[]).filter(x=>String(x).toLowerCase()!==e.creadoPor);
  // Un traspaso hecho por un admin deja la empresa en el maestro: ya no
  // depende del catálogo del dueño anterior.
  if(esAdminActual())HOGAR[id]=DOC_MAESTRO;
  await guardarCatalogo();
  return true;
}

// Elimina una empresa del catálogo y opcionalmente todos sus datos del storage.
// Si `borrarDatos` es true, recorre localStorage buscando las claves con
// el prefijo de esa empresa (`emp1:ventas-2026`, etc.) y las elimina.
// En Firestore no se puede borrar todo desde el cliente sin listar la colección;
// se dejan huérfanos y quedan invisibles porque ya no aparece la empresa.
export async function eliminarEmpresa(id,borrarDatos=false){
  if(EMPRESAS.lista.length<=1)throw new Error('Debe existir al menos una empresa');
  const era=EMPRESAS.activa===id;
  EMPRESAS.todas=EMPRESAS.todas.filter(e=>e.id!==id);
  borrarACLEmpresa(id);
  aplicarVisibilidad();
  if(era)EMPRESAS.activa=(EMPRESAS.lista[0]||EMPRESAS.todas[0]||{}).id||null;
  await guardarCatalogo();

  if(borrarDatos){
    // Recorrer localStorage y borrar todas las claves de esta empresa.
    // El storage guarda como `<prefijoInstancia><empresaId>:<clave>` o
    // directamente `<empresaId>:<clave>` según cómo esté configurado.
    // Debemos matchear el prefijo de empresa como un segmento COMPLETO
    // seguido de ":" para no confundir "emp1" con "emp10".
    const aBorrar=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k)continue;
        // Coincidencia: empieza con "id:" o contiene ":id:"
        if(k===id||k.startsWith(id+':')||k.includes(':'+id+':')){
          aBorrar.push(k);
        }
      }
    }catch(e){}
    aBorrar.forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
    return {borradas:aBorrar.length};
  }
  return {borradas:0};
}

// ── Recuperar una empresa borrada del catálogo ──
// Eliminar sin marcar "borrar datos" sólo saca la empresa del catálogo: sus
// claves (`<id>:ventas-2026`, `<id>:empresa`, …) siguen enteras. Esto las busca
// y permite volver a registrarla con SU MISMO id, que es lo que hace que los
// datos vuelvan a aparecer.
export function empresasHuerfanas(){
  const LS='cv:';
  const conocidas=new Set(EMPRESAS.todas.map(e=>e.id));
  const porId={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const full=localStorage.key(i);
      if(!full||!full.startsWith(LS))continue;
      const base=full.slice(LS.length);
      const m=base.match(/^(emp[a-z0-9]+):(.+)$/);
      if(!m)continue;
      const [,id,clave]=m;
      if(conocidas.has(id))continue;
      (porId[id]=porId[id]||{id,claves:0,nombre:'',rut:'',anios:new Set()}).claves++;
      // La ficha de la empresa guarda su nombre: se recupera tal cual estaba
      if(clave==='empresa'){
        try{
          const d=JSON.parse(localStorage.getItem(full)||'{}');
          porId[id].nombre=d.nombre||'';porId[id].rut=d.rut||'';
        }catch(e){}
      }
      const my=clave.match(/-(\d{4})$/);
      if(my)porId[id].anios.add(my[1]);
    }
  }catch(e){}
  return Object.values(porId)
    .map(x=>({...x,anios:[...x.anios].sort()}))
    .sort((a,b)=>b.claves-a.claves);
}

// Vuelve a registrar una empresa huérfana conservando su id
export async function recuperarEmpresa(id,nombre,rut){
  if(EMPRESAS.todas.some(e=>e.id===id))return false;
  EMPRESAS.todas.push({
    id,
    nombre:nombre||'Empresa recuperada',
    rut:rut||'',
    marco:'tributaria',
    creada:new Date().toISOString(),
    creadoPor:emailActual()||'',
    compartidaCon:[],
    recuperada:new Date().toISOString(),
  });
  HOGAR[id]=esAdminActual()?DOC_MAESTRO:docUsuario(emailActual());
  await guardarCatalogo();
  return true;
}

export async function actualizarEmpresa(id,campos){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return;
  Object.assign(e,campos);
  await guardarCatalogo();
}

// Cambia la empresa activa. Requiere recargar los datos (lo hace app.js).
export async function activarEmpresa(id){
  const e=EMPRESAS.todas.find(x=>x.id===id);
  if(!e)return false;
  if(!puedeVerEmpresa(e)){toast('⚠️ No tienes acceso a esa empresa','e');return false;}
  EMPRESAS.activa=id;
  await window.storage.setGlobal(claveActiva(),id);
  window.storage.setPrefijo(id);
  return true;
}
