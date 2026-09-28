// monitorfs.js — Contador de lecturas/escrituras de Firestore y monitor de tamaño
//
// Firestore cobra por DOCUMENTO leído o escrito, no por su tamaño. Pero cada
// documento tiene un tope duro de 1 MiB: pasado eso la escritura falla. Este
// módulo mide las dos cosas sin tocar la lógica de guardado:
//
//  - Envuelve los métodos del SDK compat (DocumentReference, Query, Transaction)
//    una sola vez al conectar. Así cuenta TODO lo que habla con Firestore,
//    venga de storage.js, auth.js, inventario o de cualquier módulo nuevo.
//  - Separa lecturas del servidor (se cobran) de lecturas de caché local
//    (enablePersistence: no se cobran).
//  - Registra el tamaño aproximado de cada documento cada vez que se lee o se
//    escribe, y avisa una vez por sesión al pasar el 70% del tope.
//
// Los totales por día se guardan en localStorage de ESTE equipo (14 días), para
// poder mirar el consumo de varios días de uso real. No sube nada a la nube.

const LIMITE_DOC=1048576;          // 1 MiB, tope de Firestore por documento
const UMBRAL_AVISO=0.70;           // aviso amarillo
const UMBRAL_CRITICO=0.90;         // aviso rojo
const CLAVE_LS='monitorFS:v1';
const DIAS_HISTORIA=14;

const MON={
  instalado:false,
  inicio:new Date(),
  docs:new Map(),   // ruta → {coleccion,id,lect,cache,esc,fallidas,bytes,ts}
  sesion:{lect:0,cache:0,esc:0,fallidas:0,consultas:0},
  avisados:new Set(),
};

// ── Tamaño en bytes (UTF-8) sin crear buffers: los valores pueden pesar ~1 MB ──
function bytesUtf8(s){
  let n=0;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c<0x80)n+=1;
    else if(c<0x800)n+=2;
    else if(c>=0xd800&&c<=0xdbff){n+=4;i++;}   // par sustituto
    else n+=3;
  }
  return n;
}
// Aproximación del tamaño que Firestore cuenta para el documento:
// nombre del documento + nombres de campo + valores. Para estos documentos el
// campo `value` (el JSON comprimido) es prácticamente todo el peso.
function tamanoDoc(ruta,data){
  if(!data||typeof data!=='object')return null;
  let n=bytesUtf8(String(ruta||''))+16;
  for(const [k,v] of Object.entries(data)){
    n+=bytesUtf8(k)+1;
    if(typeof v==='string')n+=bytesUtf8(v)+1;
    else if(typeof v==='number'||typeof v==='boolean')n+=8;
    else if(v&&typeof v==='object'&&typeof v.toMillis!=='function'&&!v._methodName){
      try{n+=bytesUtf8(JSON.stringify(v));}catch(e){}
    }else n+=8;   // timestamps y FieldValue
  }
  return n;
}

function entrada(ref){
  const ruta=ref&&ref.path||'?';
  let d=MON.docs.get(ruta);
  if(!d){
    const partes=ruta.split('/');
    d={ruta,coleccion:partes.slice(0,-1).join('/'),id:partes[partes.length-1],lect:0,cache:0,esc:0,fallidas:0,bytes:null,ts:0};
    MON.docs.set(ruta,d);
  }
  return d;
}

function registrarTamano(d,bytes){
  if(bytes==null)return;
  d.bytes=bytes;
  const pct=bytes/LIMITE_DOC;
  if(pct>=UMBRAL_AVISO&&!MON.avisados.has(d.ruta)){
    MON.avisados.add(d.ruta);
    const txt=`${pct>=UMBRAL_CRITICO?'🚨':'⚠️'} "${nombreClave(d.id)}" ocupa el ${Math.round(pct*100)}% del máximo de un documento de Firestore (1 MB). Revisa Configuración → Sistema.`;
    try{window.toast&&window.toast(txt,pct>=UMBRAL_CRITICO?'e':'w');}catch(e){}
    console.warn('[monitorFS]',txt,d.ruta,bytes);
  }
}

// ── Historial diario (localStorage de este equipo) ──
function hoyISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function leerHistoria(){try{return JSON.parse(localStorage.getItem(CLAVE_LS)||'{}')||{};}catch(e){return {};}}
let _pendiente=null;
let _delta={};   // fecha → {lect,cache,esc,claves:{id:{l,e}}}
function sumarDia(tipo,id){
  const f=hoyISO();
  const x=_delta[f]||(_delta[f]={lect:0,cache:0,esc:0,claves:{}});
  x[tipo]=(x[tipo]||0)+1;
  if(tipo!=='cache'){
    const c=x.claves[id]||(x.claves[id]={l:0,e:0});
    if(tipo==='lect')c.l++;else c.e++;
  }
  if(!_pendiente)_pendiente=setTimeout(volcarHistoria,2000);
}
function volcarHistoria(){
  _pendiente=null;
  const h=leerHistoria();
  for(const [f,x] of Object.entries(_delta)){
    const t=h[f]||(h[f]={lect:0,cache:0,esc:0,claves:{}});
    t.lect+=x.lect||0;t.cache+=x.cache||0;t.esc+=x.esc||0;
    for(const [k,c] of Object.entries(x.claves)){
      const tc=t.claves[k]||(t.claves[k]={l:0,e:0});tc.l+=c.l;tc.e+=c.e;
    }
  }
  _delta={};
  const fechas=Object.keys(h).sort().reverse();
  fechas.slice(DIAS_HISTORIA).forEach(f=>delete h[f]);
  try{localStorage.setItem(CLAVE_LS,JSON.stringify(h));}catch(e){}
}
try{window.addEventListener('pagehide',()=>{if(_pendiente){clearTimeout(_pendiente);volcarHistoria();}});}catch(e){}

function contarLectura(d,snap){
  if(snap&&snap.metadata&&snap.metadata.fromCache){d.cache++;MON.sesion.cache++;sumarDia('cache',d.id);}
  else{d.lect++;MON.sesion.lect++;sumarDia('lect',d.id);}
  d.ts=Date.now();
  if(snap&&snap.exists){try{registrarTamano(d,tamanoDoc(d.ruta,snap.data()));}catch(e){}}
}
function contarEscritura(d,data){
  d.esc++;MON.sesion.esc++;d.ts=Date.now();sumarDia('esc',d.id);
  if(data){try{registrarTamano(d,tamanoDoc(d.ruta,data));}catch(e){}}
}

// ── Instalación: envuelve el SDK compat una sola vez ──
function instalarMonitorFS(){
  if(MON.instalado)return true;
  const fs=typeof firebase!=='undefined'&&firebase.firestore;
  if(!fs||!fs.DocumentReference||!fs.Query)return false;
  const DR=fs.DocumentReference.prototype;
  const Q=fs.Query.prototype;
  const TX=fs.Transaction&&fs.Transaction.prototype;

  const oGet=DR.get;
  DR.get=function(...a){
    const d=entrada(this);
    return oGet.apply(this,a).then(snap=>{contarLectura(d,snap);return snap;},
      e=>{d.fallidas++;MON.sesion.fallidas++;throw e;});
  };
  const oSet=DR.set;
  DR.set=function(data,...a){contarEscritura(entrada(this),data);return oSet.call(this,data,...a);};
  const oUpd=DR.update;
  DR.update=function(...a){contarEscritura(entrada(this),null);return oUpd.apply(this,a);};
  const oDel=DR.delete;
  DR.delete=function(...a){const d=entrada(this);contarEscritura(d,null);d.bytes=null;return oDel.apply(this,a);};

  // Consultas: se cobra 1 lectura por documento devuelto (mínimo 1)
  const oQGet=Q.get;
  Q.get=function(...a){
    return oQGet.apply(this,a).then(snap=>{
      MON.sesion.consultas++;
      const cache=!!(snap&&snap.metadata&&snap.metadata.fromCache);
      const docs=snap&&snap.docs||[];
      if(!docs.length){if(!cache){MON.sesion.lect++;sumarDia('lect','(consulta vacía)');}}
      docs.forEach(ds=>{const d=entrada(ds.ref);contarLectura(d,cache?{metadata:{fromCache:true},exists:ds.exists,data:()=>ds.data()}:ds);});
      return snap;
    });
  };

  // Transacciones: cada get dentro de la transacción es una lectura de servidor
  // (se repite si la transacción reintenta, y así se cobra).
  if(TX){
    const oTGet=TX.get;
    TX.get=function(ref,...a){
      const d=entrada(ref);
      return oTGet.call(this,ref,...a).then(snap=>{contarLectura(d,snap);return snap;},
        e=>{d.fallidas++;MON.sesion.fallidas++;throw e;});
    };
    const oTSet=TX.set;
    TX.set=function(ref,data,...a){contarEscritura(entrada(ref),data);return oTSet.call(this,ref,data,...a);};
    const oTUpd=TX.update;
    TX.update=function(ref,...a){contarEscritura(entrada(ref),null);return oTUpd.call(this,ref,...a);};
    const oTDel=TX.delete;
    TX.delete=function(ref,...a){contarEscritura(entrada(ref),null);return oTDel.call(this,ref,...a);};
  }
  MON.instalado=true;
  return true;
}

// ── Consulta para la interfaz ──
// "emp3:asientos-2026" → "asientos-2026". El prefijo de empresa se muestra aparte.
function nombreClave(id){const s=String(id||'');const i=s.indexOf(':');return i>=0?s.slice(i+1):s;}
function empresaDeId(id){const s=String(id||'');const i=s.indexOf(':');return i>=0?s.slice(0,i):'';}

function resumenMonitorFS(){
  volcarHistoria();
  const docs=[...MON.docs.values()];
  const historia=leerHistoria();
  const dias=Object.keys(historia).sort().reverse().map(f=>({fecha:f,...historia[f]}));
  return {
    instalado:MON.instalado,inicio:MON.inicio,hoy:hoyISO(),sesion:{...MON.sesion},
    docs:docs.map(d=>({...d,clave:nombreClave(d.id),empresa:empresaDeId(d.id),
      pct:d.bytes!=null?d.bytes/LIMITE_DOC:null})),
    dias,limite:LIMITE_DOC,umbralAviso:UMBRAL_AVISO,umbralCritico:UMBRAL_CRITICO,
  };
}
function reiniciarMonitorFS(borrarHistoria){
  MON.docs.forEach(d=>{d.lect=0;d.cache=0;d.esc=0;d.fallidas=0;});
  MON.sesion={lect:0,cache:0,esc:0,fallidas:0,consultas:0};
  MON.inicio=new Date();MON.avisados.clear();_delta={};
  if(borrarHistoria){try{localStorage.removeItem(CLAVE_LS);}catch(e){}}
}

export {instalarMonitorFS, resumenMonitorFS, reiniciarMonitorFS, tamanoDoc, bytesUtf8, nombreClave, LIMITE_DOC, MON};
