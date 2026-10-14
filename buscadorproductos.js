// buscadorproductos.js — Autocompletado de productos de inventario.
// Reemplaza los <select> largos de productos por un input que filtra por
// código o descripción mientras se escribe. Mismo patrón que buscadorcuentas.js.
//
// Uso en un template:
//   ${inputProductoInv({id:'oc-prod-0', value:l.productoId, onPick:"invOCLineaCampo(0,'productoId','%PID%',true)"})}

import {S} from './state.js';

let PR_RES=[], PR_SEL=0;

function productosInv(){return (S.inventario?.productos||[]).filter(p=>p.activo!==false&&p.inventariable!==false);}

function nombreProductoInv(id){
  const p=(S.inventario?.productos||[]).find(x=>x.id===id);
  return p?`${p.codigo} · ${p.descripcion}`:'';
}

function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

function buscarProductoInv(q){
  const todos=productosInv();
  const t=norm(q).trim();
  if(!t)return todos.slice(0,40);
  const palabras=t.split(/\s+/);
  return todos.filter(p=>{
    const hay=`${norm(p.codigo)} ${norm(p.descripcion)}`;
    return palabras.every(w=>hay.includes(w));
  }).slice(0,40);
}

export function inputProductoInv({id,value='',onPick='',placeholder='Código o descripción del producto…',clase='linea-inp'}){
  const txt=value?nombreProductoInv(value):'';
  const op=String(onPick).replace(/"/g,'&quot;');
  return `<div class="ac-wrap" style="position:relative">
    <input type="text" id="${id}" class="${clase}" value="${txt.replace(/"/g,'&quot;')}"
      placeholder="${placeholder}" autocomplete="off"
      data-pid="${value}" data-onpick="${op}"
      oninput="prAcBuscar('${id}')" onfocus="prAcBuscar('${id}')"
      onkeydown="prAcTecla(event,'${id}')" onblur="prAcCerrarDif('${id}')">
    <div id="${id}-ac" class="ac-lista" style="display:none;min-width:280px"></div>
  </div>`;
}

export function prAcBuscar(id){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp||!box)return;
  const q=inp.value===nombreProductoInv(inp.dataset.pid)?'':inp.value;
  PR_RES=buscarProductoInv(q);
  PR_SEL=0;
  if(!PR_RES.length){
    box.innerHTML=`<div class="ac-item" style="color:var(--mt)">${productosInv().length?'Sin coincidencias':'No hay productos activos cargados'}</div>`;
    box.style.display='block';return;
  }
  pintarListaProductoInv(id,box);
}

function pintarListaProductoInv(id,box){
  box.innerHTML=PR_RES.map((p,i)=>`
    <div class="ac-item${i===PR_SEL?' sel':''}" onmousedown="prAcElegir('${id}','${p.id}')">
      <span style="font-family:var(--mono);color:var(--ac);font-size:11px">${p.codigo}</span>
      <span style="margin-left:8px">${p.descripcion}</span>
    </div>`).join('');
  box.style.display='block';
}

export function prAcTecla(ev,id){
  const box=document.getElementById(id+'-ac');
  if(!box||box.style.display==='none')return;
  if(ev.key==='ArrowDown'){ev.preventDefault();PR_SEL=Math.min(PR_SEL+1,PR_RES.length-1);pintarListaProductoInv(id,box);}
  else if(ev.key==='ArrowUp'){ev.preventDefault();PR_SEL=Math.max(PR_SEL-1,0);pintarListaProductoInv(id,box);}
  else if(ev.key==='Enter'){ev.preventDefault();if(PR_RES[PR_SEL])prAcElegir(id,PR_RES[PR_SEL].id);}
  else if(ev.key==='Escape'){box.style.display='none';}
}

export function prAcElegir(id,pid){
  const inp=document.getElementById(id);
  const box=document.getElementById(id+'-ac');
  if(!inp)return;
  inp.value=nombreProductoInv(pid);
  inp.dataset.pid=pid;
  if(box)box.style.display='none';
  const acc=inp.dataset.onpick;
  if(acc){
    try{ new Function('pid',acc.replace(/%PID%/g,pid))(pid); }
    catch(e){ console.warn('prAcElegir:',e); }
  }
}

// Al salir del campo: si lo escrito identifica un único producto, se da por
// elegido (igual criterio que el buscador de cuentas); si no, se limpia.
export function prAcCerrarDif(id){
  setTimeout(()=>{
    const inp=document.getElementById(id);
    const box=document.getElementById(id+'-ac');
    if(box)box.style.display='none';
    if(!inp)return;
    if(inp.dataset.pid){inp.value=nombreProductoInv(inp.dataset.pid);return;}
    const texto=String(inp.value||'').trim();
    if(!texto)return;
    const res=buscarProductoInv(texto);
    if(res.length===1)prAcElegir(id,res[0].id);
    else inp.value='';
  },160);
}
