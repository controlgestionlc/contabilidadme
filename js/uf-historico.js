// uf-historico.js — V2.21.84 · UF al último día de cada mes (remuneraciones).
//
// Las remuneraciones de un mes se calculan con la UF del ÚLTIMO DÍA de ese mes
// (topes imponibles, planes de salud en UF, seguro de cesantía). Esta tabla se
// llena a mano en Indicadores y es requisito para cerrar el libro del mes: al
// cerrar, el libro se recalcula con esa UF.
//
// Clave por empresa 'uf-historico': { valores: { 'YYYY-MM': 39485.65 }, actualizadoEn }

import {toast, MESES} from './core.js';
import {S} from './state.js';
import './storage.js';

const CLAVE='uf-historico';
const ANIO_INICIO=2023;
const UFH={valores:{},actualizadoEn:'',loaded:false,cargando:null};
const per=(y,m)=>`${y}-${String(m).padStart(2,'0')}`;
const esPeriodo=p=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(p||''));
const ultimoDia=p=>{const [y,m]=p.split('-').map(Number);return new Date(y,m,0).getDate();};
const fmtUF=v=>(+v||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
// "39.485,65" · "39485,65" · "39485.65" → 39485.65
function leerUF(txt){
  let s=String(txt??'').trim().replace(/[^\d.,]/g,'');
  if(!s)return 0;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if((s.match(/\./g)||[]).length>1||/\.\d{3}$/.test(s))s=s.replace(/\./g,'');
  const n=Math.round((+s||0)*100)/100;
  return n>0?n:0;
}

function ufDelPeriodo(p){return esPeriodo(p)?(+UFH.valores[p]||0):0;}

async function cargarUFHistorico(force=false){
  if(UFH.loaded&&!force)return UFH;
  if(UFH.cargando)return UFH.cargando;
  UFH.cargando=(async()=>{
    try{
      const r=await window.storage.get(CLAVE);
      const d=r&&r.value?JSON.parse(r.value):{};
      UFH.valores=(d&&typeof d.valores==='object'&&d.valores)||{};
      UFH.actualizadoEn=d?.actualizadoEn||'';
    }catch(e){console.warn('No se pudo cargar la tabla de UF:',e);UFH.valores={};}
    UFH.loaded=true;return UFH;
  })();
  try{return await UFH.cargando;}finally{UFH.cargando=null;}
}
async function guardarUFHistorico(){
  UFH.actualizadoEn=new Date().toISOString();
  const r=await window.storage.set(CLAVE,JSON.stringify({valores:UFH.valores,actualizadoEn:UFH.actualizadoEn}));
  return !!(r&&r.ok!==false);
}

async function setUFMes(p,val){
  if(!esPeriodo(p))return;
  await cargarUFHistorico();
  const L=S_libroRem();
  if(L[p]&&Array.isArray(L[p].lineas)){
    try{alert(`🔒 El libro de remuneraciones de ${MESES[+p.slice(5,7)-1]} ${p.slice(0,4)} está cerrado con UF ${fmtUF(L[p].uf)}.\n\nPara cambiar la UF de ese mes, primero reabre el libro.`);}catch(e){}
    renderUFHistoricoBox();return;
  }
  const v=leerUF(val);
  const antes=+UFH.valores[p]||0;
  if(v>0)UFH.valores[p]=v;else delete UFH.valores[p];
  if((+UFH.valores[p]||0)===antes){renderUFHistoricoBox();return;}
  if(!await guardarUFHistorico()){toast('❌ No se pudo guardar la UF','e');UFH.valores[p]=antes||undefined;if(!antes)delete UFH.valores[p];return;}
  toast(v?`✅ UF al ${ultimoDia(p)}-${p.slice(5,7)}-${p.slice(0,4)}: ${fmtUF(v)}`:`↺ UF de ${p} borrada`);
  renderUFHistoricoBox();
  try{if(typeof window.renderRemuneraciones==='function'&&document.getElementById('s-remuneraciones')?.classList.contains('active'))window.renderRemuneraciones();}catch(e){}
}
const S_libroRem=()=>(S.libroRem&&typeof S.libroRem==='object')?S.libroRem:{};

function renderUFHistoricoHTML(){
  const yHoy=new Date().getFullYear(),mHoy=new Date().getMonth()+1;
  const anios=[];for(let y=ANIO_INICIO;y<=yHoy;y++)anios.push(y);
  const L=S_libroRem();
  const filas=MESES.map((nm,i)=>`<tr><td class="tl" style="font-size:11px">${nm}</td>${anios.map(y=>{
    const p=per(y,i+1),v=ufDelPeriodo(p),futuro=y===yHoy&&i+1>mHoy,cerr=!!(L[p]&&Array.isArray(L[p].lineas));
    return `<td style="padding:2px 4px"><input type="text" inputmode="decimal" value="${v?fmtUF(v):''}" placeholder="${futuro?'':'—'}"
      title="UF al ${ultimoDia(p)}-${String(i+1).padStart(2,'0')}-${y}${cerr?' · libro de remuneraciones cerrado':''}"
      onchange="setUFMes('${p}',this.value)" ${futuro||cerr?'disabled':''}
      style="width:96px;text-align:right;font-family:var(--mono);font-size:11px${cerr?';opacity:.7':''}"></td>`;
  }).join('')}</tr>`).join('');
  const faltan=[];for(const y of anios)for(let m=1;m<=12;m++){if(y===yHoy&&m>mHoy)break;if(!ufDelPeriodo(per(y,m)))faltan.push(`${MESES[m-1].slice(0,3)} ${y}`);}
  return `<div class="info-tip" style="font-size:11px;margin-bottom:10px">
      Ingresa la <strong>UF del último día de cada mes</strong> (por ejemplo, la del 30 de junio para las remuneraciones de junio).
      Es la que usan las liquidaciones y el libro de remuneraciones del mes, y es <strong>obligatoria para cerrar el libro</strong>:
      al cerrarlo se recalcula con este valor. Los meses con libro cerrado quedan bloqueados.</div>
    ${faltan.length?`<div style="font-size:10.5px;color:var(--mt);margin-bottom:8px">Sin UF: ${faltan.slice(-12).join(', ')}${faltan.length>12?' …':''}</div>`:''}
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">MES</th>${anios.map(y=>`<th style="text-align:right">${y}</th>`).join('')}</tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="margin-top:8px;font-size:10px;color:var(--mt)">${UFH.actualizadoEn?'Última modificación: '+new Date(UFH.actualizadoEn).toLocaleString('es-CL')+' · ':''}Fuente oficial: <a href="https://www.sii.cl/valores_y_fechas/uf/uf${yHoy}.htm" target="_blank" rel="noopener" style="color:var(--ac)">sii.cl UF ${yHoy}</a></div>`;
}
function renderUFHistoricoBox(){
  const el=document.getElementById('uf-hist-box');if(!el)return;
  if(!UFH.loaded){el.innerHTML='<div style="font-size:11px;color:var(--mt)">Cargando…</div>';cargarUFHistorico().then(renderUFHistoricoBox);return;}
  el.innerHTML=renderUFHistoricoHTML();
}

export {UFH, ufDelPeriodo, cargarUFHistorico, setUFMes, renderUFHistoricoBox, fmtUF, leerUF};
