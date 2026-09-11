// recovery.js — V2.15.4 · Snapshots productivos y recuperación ante desastre
//
// Objetivo:
//  · conservar puntos de recuperación independientes del backup Excel
//  · validar integridad (SHA-256) antes de restaurar
//  · crear snapshot automático periódico cuando hay actividad
//  · crear snapshot previo a operaciones masivas
//  · restaurar de forma controlada y sólo por administrador

import {S,AUTH} from './state.js';
import {FS,logAccion} from './firebase.js';
import {DISPOSITIVO} from './dispositivo.js';

const MAX_SNAPSHOTS=6;
const AUTO_CADA_MS=6*60*60*1000; // máximo un snapshot automático cada 6 horas de uso
const AUTO_DELAY_MS=8000;        // debounce después de un guardado normal

const RECOVERY={index:[],cargado:false,creando:false,timer:null,ultimaVerificacion:null};

const anio=()=>+S.empresa.anio||new Date().getFullYear();
const indexKey=()=>`recovery-index-${anio()}`;
const prefijoSnap=()=>`recovery-snap-${anio()}-`;
const dataKey=(id,i)=>`${prefijoSnap()}${id}-${String(i).padStart(3,'0')}`;

function isoCompact(){
  return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function uid(){
  try{return crypto.randomUUID().replace(/-/g,'').slice(0,10);}catch(e){return Math.random().toString(36).slice(2,12);}
}
async function sha256(txt){
  const enc=new TextEncoder().encode(String(txt??''));
  if(!crypto?.subtle)return '';
  const dig=await crypto.subtle.digest('SHA-256',enc);
  return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function bytes(txt){return new TextEncoder().encode(String(txt??'')).length;}

function esClaveRecuperacion(k){return String(k||'').startsWith('recovery-');}
function esClaveDiagnostico(k){return String(k||'').startsWith('hardening-concurrencia-');}

function clavesSnapshot(){
  const base=(window.storage?.clavesDeLaEmpresa?.(anio())||[])
    .filter(k=>!esClaveRecuperacion(k)&&!esClaveDiagnostico(k));
  // Asegurar claves nucleares aunque no estén todavía en localStorage.
  const fijas=[
    'empresa','pdc','pdc_v','activos','trabajadores','centros','cierresCC','comprobantesTipo','fichasAux','indicadores','previsional','libroRem',
    `ventas-${anio()}`,`compras-${anio()}`,`honorarios-${anio()}`,`asientos-${anio()}`,`apertura-${anio()}`,
    `f29-declaraciones-${anio()}`,`cierresContables-${anio()}`,`hardening-certificacion-${anio()}`
  ];
  return [...new Set([...base,...fijas])].sort();
}

async function cargarRecoveryIndex(forzar=false){
  if(RECOVERY.cargado&&!forzar)return RECOVERY.index;
  RECOVERY.index=[];
  try{
    const r=await window.storage.leerConEstado(indexKey());
    if(r.fuente==='error')return RECOVERY.index;
    if(r.value){
      const p=JSON.parse(r.value);
      if(Array.isArray(p))RECOVERY.index=p.filter(x=>x&&x.id).sort((a,b)=>String(b.creadoEn||'').localeCompare(String(a.creadoEn||'')));
    }
  }catch(e){console.warn('Recovery index:',e);}
  RECOVERY.cargado=true;
  return RECOVERY.index;
}

async function leerClavesParaSnapshot(){
  const datos=[];
  const fallidas=[];
  for(const clave of clavesSnapshot()){
    const r=await window.storage.leerConEstado(clave);
    if(r.fuente==='error'){fallidas.push({clave,motivo:r.error||'lectura'});continue;}
    if(r.value===null||r.value===undefined)continue;
    const value=String(r.value);
    datos.push({clave,value,bytes:bytes(value),sha256:await sha256(value)});
  }
  return {datos,fallidas};
}

async function limpiarSnapshotsFueraIndice(viejos){
  for(const snap of viejos||[]){
    for(const f of snap.archivos||[]){
      try{await window.storage.delete(f.snapshotKey);}catch(e){console.warn('No se pudo depurar snapshot',f.snapshotKey,e);}
    }
  }
}

async function crearSnapshotRecuperacion(tipo='manual',motivo=''){
  if(RECOVERY.creando)return {ok:false,motivo:'snapshot-en-curso'};
  if(!window.storage?.setMany||!window.storage?.leerConEstado)return {ok:false,motivo:'storage-no-disponible'};
  if(!FS.enabled||!FS.db)return {ok:false,motivo:'sin-nube'};
  const bloqueos=window.storage.clavesBloqueadas?.()||[];
  if(bloqueos.length)return {ok:false,motivo:'persistencia-bloqueada',bloqueos};
  RECOVERY.creando=true;
  try{
    await cargarRecoveryIndex();
    const lectura=await leerClavesParaSnapshot();
    if(lectura.fallidas.length)return {ok:false,motivo:'lectura-incompleta',fallidas:lectura.fallidas};
    if(!lectura.datos.length)return {ok:false,motivo:'sin-datos'};

    const id=`${isoCompact()}_${uid()}`;
    const entradas=[];
    const archivos=[];
    lectura.datos.forEach((d,i)=>{
      const sk=dataKey(id,i);
      entradas.push({key:sk,value:d.value});
      archivos.push({clave:d.clave,snapshotKey:sk,bytes:d.bytes,sha256:d.sha256});
    });
    const wr=await window.storage.setMany(entradas);
    if(!wr?.ok)return {ok:false,motivo:wr?.motivo||'no-se-pudo-escribir-snapshot'};

    const manifest={
      id,tipo:String(tipo||'manual'),motivo:String(motivo||''),creadoEn:new Date().toISOString(),
      creadoPor:AUTH.user?.email||'',dispositivo:DISPOSITIVO?.nombre||DISPOSITIVO?.id||'',
      empresaId:window.storage.getPrefijo?.()||'',empresa:S.empresa.nombre||'',anio:anio(),
      archivos,totalClaves:archivos.length,totalBytes:archivos.reduce((s,x)=>s+x.bytes,0),version:1
    };
    const candidatos=[manifest,...RECOVERY.index.filter(x=>x.id!==manifest.id)];
    const conservar=candidatos.slice(0,MAX_SNAPSHOTS);
    const eliminar=candidatos.slice(MAX_SNAPSHOTS);
    const ir=await window.storage.set(indexKey(),JSON.stringify(conservar));
    if(!ir?.ok)return {ok:false,motivo:ir?.motivo||'no-se-pudo-actualizar-indice'};
    RECOVERY.index=conservar;RECOVERY.cargado=true;
    // El índice ya apunta sólo a snapshots válidos; la limpieza puede hacerse después.
    limpiarSnapshotsFueraIndice(eliminar).catch(e=>console.warn('Limpieza recovery',e));
    logAccion('Snapshot de recuperación',`${manifest.tipo} · ${manifest.totalClaves} claves · ${(manifest.totalBytes/1024).toFixed(1)} KB${manifest.motivo?' · '+manifest.motivo:''}`);
    return {ok:true,snapshot:manifest};
  }catch(e){
    console.error('crearSnapshotRecuperacion',e);
    return {ok:false,motivo:e.message||String(e)};
  }finally{RECOVERY.creando=false;}
}

function resumenValor(v){
  try{
    const p=JSON.parse(v);
    if(Array.isArray(p))return {tipo:'lista',registros:p.length};
    if(p&&typeof p==='object')return {tipo:'objeto',registros:Object.keys(p).length};
  }catch(e){}
  return {tipo:'texto',registros:null};
}

async function verificarSnapshotRecuperacion(id){
  await cargarRecoveryIndex();
  const snap=RECOVERY.index.find(x=>x.id===id);
  if(!snap)return {ok:false,motivo:'snapshot-no-encontrado'};
  const detalle=[];let totalBytes=0;
  for(const f of snap.archivos||[]){
    const r=await window.storage.leerConEstado(f.snapshotKey);
    if(r.fuente==='error'||r.value==null)return {ok:false,motivo:'archivo-snapshot-inaccesible',clave:f.clave,snapshotKey:f.snapshotKey};
    const value=String(r.value),h=await sha256(value),b=bytes(value),res=resumenValor(value);
    if(f.sha256&&h!==f.sha256)return {ok:false,motivo:'hash-no-coincide',clave:f.clave};
    if(f.bytes!=null&&b!==+f.bytes)return {ok:false,motivo:'tamano-no-coincide',clave:f.clave};
    totalBytes+=b;detalle.push({clave:f.clave,bytes:b,...res});
  }
  const r={ok:true,snapshot:snap,detalle,totalBytes,totalClaves:detalle.length,verificadoEn:new Date().toISOString()};
  RECOVERY.ultimaVerificacion=r;
  return r;
}

async function restaurarSnapshotRecuperacion(id){
  if(AUTH.user?.rol!=='admin')return {ok:false,motivo:'solo-admin'};
  if(!FS.enabled||!FS.db)return {ok:false,motivo:'sin-nube'};
  const ver=await verificarSnapshotRecuperacion(id);
  if(!ver.ok)return ver;

  // Cargar el snapshot elegido en memoria ANTES de crear el punto de retorno.
  // Si ya existen MAX_SNAPSHOTS, la nueva copia de seguridad puede expulsar el
  // snapshot más antiguo del índice; conservar los bytes acá evita que eso
  // invalide una restauración que el usuario ya verificó y confirmó.
  const fuente=[];
  for(const f of ver.snapshot.archivos||[]){
    const src=await window.storage.leerConEstado(f.snapshotKey);
    if(src.fuente==='error'||src.value==null)return {ok:false,motivo:'snapshot-incompleto',clave:f.clave};
    fuente.push({f,value:String(src.value)});
  }

  // Siempre crear un punto de retorno inmediatamente antes del rollback.
  const seguridad=await crearSnapshotRecuperacion('pre-restauracion',`Antes de restaurar ${id}`);
  if(!seguridad.ok)return {ok:false,motivo:'no-se-pudo-crear-snapshot-seguridad',detalle:seguridad.motivo};

  const entradas=[];
  for(const item of fuente){
    const f=item.f;
    // Refrescar también la revisión del destino para que setMany no trabaje con baseline obsoleto.
    const actual=await window.storage.leerConEstado(f.clave);
    if(actual.fuente==='error')return {ok:false,motivo:'destino-inaccesible',clave:f.clave};
    entradas.push({key:f.clave,value:item.value});
  }
  const wr=await window.storage.setMany(entradas);
  if(!wr?.ok)return {ok:false,motivo:wr?.motivo||'restauracion-fallida',clave:wr?.clave||''};
  logAccion('Restauración de emergencia',`Restaurado snapshot ${id} · ${entradas.length} claves · punto de retorno ${seguridad.snapshot.id}`);
  return {ok:true,snapshot:ver.snapshot,seguridad:seguridad.snapshot,claves:entradas.length};
}

async function snapshotAntesOperacion(motivo){
  const r=await crearSnapshotRecuperacion('pre-operacion',motivo||'Operación masiva');
  return r;
}

function ultimoSnapshot(){return RECOVERY.index[0]||null;}
function estadoRecuperacion(){
  const u=ultimoSnapshot();
  const edad=u?.creadoEn?Date.now()-new Date(u.creadoEn).getTime():Infinity;
  return {
    cargado:RECOVERY.cargado,
    snapshots:RECOVERY.index.length,
    ultimo:u,
    vigente:!!u&&Number.isFinite(edad)&&edad<=24*60*60*1000,
    edadMs:edad,
    ultimaVerificacion:RECOVERY.ultimaVerificacion
  };
}

async function snapshotAutomaticoSiCorresponde(){
  if(RECOVERY.creando||!AUTH.user||!FS.enabled||!FS.db)return;
  await cargarRecoveryIndex();
  const u=ultimoSnapshot();
  const t=u?.creadoEn?new Date(u.creadoEn).getTime():0;
  if(t&&Date.now()-t<AUTO_CADA_MS)return;
  await crearSnapshotRecuperacion('automatico','Snapshot periódico por actividad');
}

function programarSnapshotAutomatico(delay=AUTO_DELAY_MS){
  if(RECOVERY.creando||!AUTH.user)return;
  if(RECOVERY.timer)clearTimeout(RECOVERY.timer);
  RECOVERY.timer=setTimeout(()=>{RECOVERY.timer=null;snapshotAutomaticoSiCorresponde().catch(e=>console.warn('Snapshot automático',e));},delay);
}

async function initRecovery(){
  await cargarRecoveryIndex(true);
  window.__programarSnapshotRecuperacion=()=>programarSnapshotAutomatico();
  window.__snapshotAntesOperacion=snapshotAntesOperacion;
  // Si no hay snapshot reciente, crear uno poco después de iniciar, sin retrasar la UI.
  programarSnapshotAutomatico(15000);
}

export {RECOVERY,cargarRecoveryIndex,crearSnapshotRecuperacion,verificarSnapshotRecuperacion,
  restaurarSnapshotRecuperacion,snapshotAntesOperacion,estadoRecuperacion,programarSnapshotAutomatico,initRecovery};
