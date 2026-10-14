// actualizador.js — verificación obligatoria de versión publicada.
//
// Desde V2.15.9.4 la app consulta version.json al iniciar, al volver al primer
// plano y periódicamente. Si el servidor anuncia una versión distinta, bloquea
// nuevas escrituras, activa el service worker nuevo y recarga obligatoriamente.
// Esto evita que un equipo siga contabilizando con código antiguo después de
// publicar una corrección.

const META='meta[name="app-version"]';
const VERSION_URL='./version.json';
const CHECK_MS=2*60*1000;
let timer=null;
let aplicando=false;
let ultimaConsulta=0;

export function versionActual(){
  return document.querySelector(META)?.getAttribute('content')?.trim()||'desconocida';
}

function overlay(){
  let el=document.getElementById('actualizacion-obligatoria');
  if(el)return el;
  el=document.createElement('div');
  el.id='actualizacion-obligatoria';
  el.setAttribute('role','alertdialog');
  el.setAttribute('aria-modal','true');
  el.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0d1117;display:none;align-items:center;justify-content:center;padding:24px;font-family:Sora,Arial,sans-serif;color:#e6edf3';
  el.innerHTML=`<div style="max-width:480px;width:100%;background:#161b22;border:1px solid #30363d;border-radius:14px;padding:28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45)">
    <div style="font-size:42px;margin-bottom:10px">🔄</div>
    <div style="font-size:21px;font-weight:800;margin-bottom:8px">Actualización obligatoria</div>
    <div id="actualizacion-msg" style="font-size:13px;line-height:1.6;color:#8b949e;margin-bottom:18px">Hay una versión nueva del sistema. Se aplicará antes de continuar.</div>
    <div id="actualizacion-versiones" style="font-family:'IBM Plex Mono',monospace;font-size:11px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px;margin-bottom:18px"></div>
    <button id="actualizacion-reintentar" type="button" style="display:none;width:100%;padding:11px 14px;border:0;border-radius:8px;background:#58a6ff;color:#0d1117;font-weight:800;cursor:pointer">Reintentar actualización</button>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#actualizacion-reintentar').addEventListener('click',()=>aplicarActualizacion(window.__LATEST_APP_VERSION__||''));
  return el;
}

function bloquear(latest,detalle=''){ 
  window.__UPDATE_REQUIRED__=true;
  window.__LATEST_APP_VERSION__=latest||'';
  const el=overlay(); el.style.display='flex';
  const va=versionActual();
  const v=el.querySelector('#actualizacion-versiones');
  if(v)v.textContent=`Instalada: ${va}  →  Disponible: ${latest||'nueva versión'}`;
  const m=el.querySelector('#actualizacion-msg');
  if(m)m.textContent=detalle||'Hay una versión nueva del sistema. Se aplicará antes de continuar.';
  try{window.dispatchEvent(new CustomEvent('app-update-required',{detail:{actual:va,nueva:latest}}));}catch(_){ }
}

function desbloquear(){
  window.__UPDATE_REQUIRED__=false;
  const el=document.getElementById('actualizacion-obligatoria');
  if(el)el.style.display='none';
}

async function leerVersionServidor(){
  const sep=VERSION_URL.includes('?')?'&':'?';
  const r=await fetch(VERSION_URL+sep+'t='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const j=await r.json();
  if(!j||!j.version)throw new Error('version.json inválido');
  return j;
}

function urlRecarga(latest){
  const u=new URL(location.href);
  u.searchParams.set('appv',String(latest||Date.now()));
  u.searchParams.set('updateTs',String(Date.now()));
  return u.toString();
}

async function aplicarActualizacion(latest){
  if(aplicando)return;
  aplicando=true;
  bloquear(latest,'Actualizando la aplicación. No cierres esta pantalla.');
  const btn=document.getElementById('actualizacion-reintentar'); if(btn)btn.style.display='none';
  try{
    // Borrar cachés de aplicación evita conservar un respaldo PWA antiguo.
    if('caches' in window){
      const ks=await caches.keys();
      await Promise.all(ks.filter(k=>k.startsWith('contabilidad-')).map(k=>caches.delete(k)));
    }
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg){
        try{await reg.update();}catch(_){ }
        const sw=reg.waiting||reg.installing;
        if(sw){try{sw.postMessage('skipWaiting');}catch(_){ }}
      }
    }
    // Dar un instante al SW/GitHub Pages y recargar ignorando la URL cacheada.
    setTimeout(()=>location.replace(urlRecarga(latest)),900);
  }catch(e){
    console.error('No se pudo aplicar actualización',e);
    aplicando=false;
    bloquear(latest,'No se pudo completar la actualización. Revisa tu conexión y vuelve a intentarlo.');
    if(btn)btn.style.display='block';
  }
}

export async function verificarActualizacion({forzar=false}={}){
  if(!navigator.onLine)return {ok:false,offline:true};
  const ahora=Date.now();
  if(!forzar&&ahora-ultimaConsulta<15000)return {ok:true,omitida:true};
  ultimaConsulta=ahora;
  try{
    const srv=await leerVersionServidor();
    const act=versionActual();
    if(String(srv.version).trim()!==String(act).trim()){
      bloquear(srv.version);
      await aplicarActualizacion(srv.version);
      return {ok:true,actualizacion:true,servidor:srv.version,actual:act};
    }
    desbloquear();
    return {ok:true,actualizacion:false,servidor:srv.version,actual:act};
  }catch(e){
    // Una falla de red no bloquea: la PWA debe poder abrir offline. En cuanto
    // vuelva la conexión, online/visibility/timer repetirán la verificación.
    console.warn('Verificador de actualizaciones:',e.message||e);
    return {ok:false,error:e.message||String(e)};
  }
}

export function initActualizador(){
  window.__UPDATE_REQUIRED__=false;
  verificarActualizacion({forzar:true});
  if(timer)clearInterval(timer);
  timer=setInterval(()=>verificarActualizacion(),CHECK_MS);
  window.addEventListener('online',()=>verificarActualizacion({forzar:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')verificarActualizacion({forzar:true});});
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(window.__UPDATE_REQUIRED__&&!window.__UPDATE_RELOADING__){
        window.__UPDATE_RELOADING__=true;
        location.replace(urlRecarga(window.__LATEST_APP_VERSION__));
      }
    });
  }
}
