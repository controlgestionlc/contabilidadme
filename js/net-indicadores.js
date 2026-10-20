// net-indicadores.js — V2.21.85 · Lectura de indicadores públicos (mindicador.cl).
//
// El navegador sólo puede leer otra web si ésta lo autoriza (CORS). Cuando
// mindicador.cl responde sin esa autorización (por ejemplo, si está caído o
// detrás de una página de error), el navegador bloquea la lectura. Para esos
// casos se reintenta a través de pasarelas públicas que agregan el permiso.
// Los datos son públicos (UF, UTM, dólar): no viaja información de la empresa.
// Cada intento tiene un tiempo límite para que la pantalla nunca quede pegada.

const PASARELAS=[
  u=>u,
  u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
  u=>'https://corsproxy.io/?url='+encodeURIComponent(u),
];

async function intento(url,ms){
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;
  const t=setTimeout(()=>{try{ctl&&ctl.abort();}catch(e){}},ms);
  try{
    const r=await fetch(url,{cache:'no-store',...(ctl?{signal:ctl.signal}:{})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const txt=await r.text();
    return JSON.parse(txt);
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('sin respuesta en '+Math.round(ms/1000)+' s');
    throw e;
  }finally{clearTimeout(t);}
}

// Devuelve el JSON de la URL probando directo y luego por las pasarelas.
export async function fetchIndicadorJSON(url,ms=10000){
  const errores=[];
  for(const via of PASARELAS){
    try{return await intento(via(url),ms);}
    catch(e){errores.push(e.message||String(e));}
  }
  throw new Error(errores[0]==='Failed to fetch'?'el servicio bloqueó la consulta o no está disponible':errores[0]||'sin respuesta');
}
