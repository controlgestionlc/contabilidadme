// tema.js — Selector de paleta de colores (persistente)
// Los temas se definen en css/styles.css con html[data-theme="..."]

// V2.21.24: el tema claro es el predeterminado y los temas se nombran sin
// marcas. Los ids antiguos ('sap-light', 'sap-dark') se traducen al arrancar.
export const TEMAS=[
  {id:'claro',  nm:'Claro',  ico:'☀️'},
  {id:'dark',   nm:'Oscuro', ico:'🌙'},
  {id:'noche',  nm:'Noche',  ico:'🔷'},
];
export const TEMA_DEFECTO='claro';
const ANTIGUOS={'sap-light':'claro','sap-dark':'noche'};

const KEY='tema';

export function aplicarTema(id){
  const t=TEMAS.find(x=>x.id===(ANTIGUOS[id]||id))||TEMAS.find(x=>x.id===TEMA_DEFECTO);
  document.documentElement.setAttribute('data-theme',t.id);
  try{localStorage.setItem(KEY,t.id);}catch(e){}
  const btn=document.getElementById('btn-tema');
  if(btn){btn.textContent=t.ico;btn.title='Tema: '+t.nm+' (clic para cambiar)';}
  // La sección Sistema muestra el tema vigente: refrescarla si está a la vista
  if(window.getCurSec&&window.getCurSec()==='sistema'&&window.renderSistema)window.renderSistema();
}

// Alterna al siguiente tema de la lista
export function cambiarTema(){
  const actual=document.documentElement.getAttribute('data-theme')||TEMA_DEFECTO;
  const i=TEMAS.findIndex(t=>t.id===actual);
  aplicarTema(TEMAS[(i+1)%TEMAS.length].id);
}

// Restaura el tema guardado al arrancar.
// Hasta V2.21.23 se guardaba 'dark' aunque nadie lo hubiera elegido (initTema
// grababa el predeterminado de entonces). Para que el nuevo predeterminado
// llegue a todos, una sola vez se pasa a Claro a quien tenía 'dark'; después
// cada elección se respeta.
const KEY_MIGRA='tema-claro-v2.21.24';
export function initTema(){
  let guardado=null;
  try{guardado=localStorage.getItem(KEY);}catch(e){}
  try{
    if(!localStorage.getItem(KEY_MIGRA)){
      if(!guardado||guardado==='dark')guardado=TEMA_DEFECTO;
      localStorage.setItem(KEY_MIGRA,'1');
    }
  }catch(e){}
  aplicarTema(guardado||TEMA_DEFECTO);
}
