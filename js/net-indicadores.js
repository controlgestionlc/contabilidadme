// net-indicadores.js — V2.21.86 · Lectura de indicadores públicos (UF, UTM, dólar, euro).
//
// mindicador.cl dejó de autorizar consultas desde el navegador (CORS), así que
// la app ya no puede leerlo directo de forma confiable. Orden de fuentes:
//   1) Copia diaria en la rama "datos" del repositorio, que actualiza la acción
//      de GitHub ".github/workflows/indicadores.yml" (raw.githubusercontent.com
//      sí permite la lectura desde el navegador).
//   2) mindicador.cl directo (por si vuelve a permitirlo).
//   3) Pasarela pública allorigins.
// Cada intento tiene tiempo límite: la pantalla nunca queda pegada.
// Son datos públicos: no viaja información de la empresa.

// Repositorio del sitio publicado en GitHub Pages: <dueño>.github.io/<repo>/
function repoDelSitio(){
  try{
    const h=location.hostname,m=h.match(/^([^.]+)\.github\.io$/i);
    if(!m)return null;
    const repo=(location.pathname.split('/').filter(Boolean)[0])||`${m[1]}.github.io`;
    return {owner:m[1],repo};
  }catch(e){return null;}
}
// URL de mindicador → archivo de la copia ('https://mindicador.cl/api/utm/2025' → 'utm-2025.json')
function archivoCopia(url){
  const m=String(url).match(/mindicador\.cl\/api(?:\/(uf|utm|dolar|euro)\/(\d{4}))?\/?$/);
  if(!m)return null;
  return m[1]?`${m[1]}-${m[2]}.json`:'indicadores.json';
}
function fuentes(url){
  const out=[];
  const r=repoDelSitio(),f=archivoCopia(url);
  if(r&&f)out.push({nombre:'copia del repositorio',url:`https://raw.githubusercontent.com/${r.owner}/${r.repo}/datos/data/${f}?t=${Math.floor(Date.now()/600000)}`});
  out.push({nombre:'mindicador.cl',url});
  out.push({nombre:'pasarela allorigins',url:'https://api.allorigins.win/raw?url='+encodeURIComponent(url)});
  return out;
}

async function intento(url,ms){
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;
  const t=setTimeout(()=>{try{ctl&&ctl.abort();}catch(e){}},ms);
  try{
    const r=await fetch(url,{cache:'no-store',...(ctl?{signal:ctl.signal}:{})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return JSON.parse(await r.text());
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('sin respuesta en '+Math.round(ms/1000)+' s');
    throw e;
  }finally{clearTimeout(t);}
}

// JSON de una URL de mindicador, probando las fuentes en orden. Devuelve el
// JSON con una marca no enumerable __fuente con el nombre de la fuente usada.
export async function fetchIndicadorJSON(url,ms=8000){
  const errores=[];
  for(const f of fuentes(url)){
    try{
      const j=await intento(f.url,ms);
      try{Object.defineProperty(j,'__fuente',{value:f.nombre,enumerable:false});}catch(e){}
      return j;
    }catch(e){errores.push(`${f.nombre}: ${e.message==='Failed to fetch'?'bloqueado o no disponible':e.message||e}`);}
  }
  throw new Error(errores.join(' · '));
}
