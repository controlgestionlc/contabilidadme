// utm-historico.js — V2.21.28 · Histórico mensual de UTM (desde 2023)
//
// Se usa para reajustar el remanente de crédito fiscal en el F29 (art. 27
// DL 825): el remanente se convierte a UTM del mes en que se originó y se
// reconvierte a UTM del mes en que se imputa. Rehacer un año pasado necesita
// la UTM de cada mes de ese año, no la vigente hoy.
//
// Fuentes, en orden de prioridad:
//   1. manual       valor corregido a mano por el usuario (por empresa)
//   2. sii          tabla incluida en el código, transcrita de sii.cl
//   3. mindicador   meses nuevos traídos de mindicador.cl, que publica la
//                   serie del SII. El navegador no puede leer sii.cl
//                   directamente (no permite consultas de otros sitios).
//
// Los meses nuevos se guardan en la clave `utm-historico` de la empresa, junto
// con las correcciones manuales.

import {toast, fmtC, pn, MESES} from './core.js';
import {rerender} from './ui.js';
import './storage.js';

const ANIO_INICIO=2023;
const CLAVE='utm-historico';

// Valores oficiales SII (pesos), enero a diciembre.
const UTM_SII={
  2023:[61769,61954,62450,62388,63074,63263,63326,63199,63452,63515,63960,64216],
  2024:[64666,64343,64793,65182,65443,65770,65967,65901,66362,66561,66628,67294],
  2025:[67429,67294,68034,68306,68648,68785,68923,68647,69265,69265,69542,69542],
  2026:[69751,69611,69889,69889,70588,71506,71649,71649,71721,72151],
};

const UTMH={manual:{},auto:{},actualizadoEn:'',loaded:false,cargando:null,consultando:false,ultimoIntento:0,ultimoError:''};

const per=(y,m)=>`${y}-${String(m).padStart(2,'0')}`;
const esPeriodo=p=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(p||''));
function valorSII(p){
  if(!esPeriodo(p))return 0;
  const [y,m]=p.split('-').map(Number);
  return +(UTM_SII[y]?.[m-1])||0;
}

// UTM de un período 'YYYY-MM' (0 si no se conoce).
function utmDelPeriodo(p){
  if(!esPeriodo(p))return 0;
  return +UTMH.manual[p]||valorSII(p)||+UTMH.auto[p]||0;
}
function fuenteUTM(p){
  if(+UTMH.manual[p])return 'manual';
  if(valorSII(p))return 'sii';
  if(+UTMH.auto[p])return 'mindicador';
  return '';
}

async function cargarUTMHistorico(force=false){
  if(UTMH.loaded&&!force)return UTMH;
  if(UTMH.cargando)return UTMH.cargando;
  UTMH.cargando=(async()=>{
    try{
      const r=await window.storage.get(CLAVE);
      const d=r&&r.value?JSON.parse(r.value):{};
      UTMH.manual=(d&&typeof d.manual==='object'&&d.manual)||{};
      UTMH.auto=(d&&typeof d.auto==='object'&&d.auto)||{};
      UTMH.actualizadoEn=d?.actualizadoEn||'';
    }catch(e){console.warn('No se pudo cargar el histórico UTM:',e);UTMH.manual={};UTMH.auto={};}
    UTMH.loaded=true;
    return UTMH;
  })();
  try{return await UTMH.cargando;}finally{UTMH.cargando=null;}
}

async function guardarUTMHistorico(){
  const r=await window.storage.set(CLAVE,JSON.stringify({manual:UTMH.manual,auto:UTMH.auto,actualizadoEn:UTMH.actualizadoEn}));
  return !!(r&&r.ok!==false);
}

// mindicador entrega la fecha del mes en UTC (p.ej. 2025-01-01T03:00:00Z).
// Se corre medio día para no caer en el mes anterior por la zona horaria.
function periodoDeFecha(f){
  const t=Date.parse(f);
  if(!isFinite(t))return '';
  return new Date(t+12*3600e3).toISOString().slice(0,7);
}

// Trae de mindicador.cl los años indicados y agrega SOLO los meses que no están
// en la tabla SII ni corregidos a mano. Nunca pisa un valor existente.
async function actualizarUTMHistorico({anios,silencioso=false}={}){
  if(UTMH.consultando)return {ok:false,motivo:'en-curso'};
  await cargarUTMHistorico();
  const hoy=new Date(), yHoy=hoy.getFullYear();
  const lista=(anios&&anios.length?anios:[yHoy-1,yHoy]).filter(y=>y>=ANIO_INICIO&&y<=yHoy);
  UTMH.consultando=true;UTMH.ultimoIntento=Date.now();
  const nuevos=[], diferencias=[];
  try{
    for(const y of lista){
      const r=await fetch(`https://mindicador.cl/api/utm/${y}`);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      (j?.serie||[]).forEach(x=>{
        const p=periodoDeFecha(x.fecha), v=Math.round(+x.valor||0);
        if(!esPeriodo(p)||v<=0||+p.slice(0,4)!==y)return;
        const sii=valorSII(p);
        if(sii){if(sii!==v)diferencias.push(`${p}: SII ${sii} · mindicador ${v}`);return;}
        if(+UTMH.manual[p]||+UTMH.auto[p]===v)return;
        UTMH.auto[p]=v;nuevos.push(p);
      });
    }
    UTMH.ultimoError='';
    if(diferencias.length)console.warn('UTM: mindicador difiere de la tabla SII (se mantiene SII):',diferencias);
    if(nuevos.length){
      UTMH.actualizadoEn=new Date().toISOString();
      if(!await guardarUTMHistorico()){
        if(!silencioso)toast('⚠️ Se obtuvieron UTM nuevas pero no se pudieron guardar','e');
        return {ok:false,nuevos,motivo:'guardar'};
      }
    }
    if(!silencioso)toast(nuevos.length?`✅ ${nuevos.length} UTM nueva(s): ${nuevos.join(', ')}`:'✅ Histórico UTM al día');
    return {ok:true,nuevos,diferencias};
  }catch(e){
    UTMH.ultimoError=e.message||String(e);
    if(!silencioso)toast('⚠️ No se pudo consultar mindicador.cl. Puedes ingresar la UTM a mano.','e');
    return {ok:false,nuevos,motivo:UTMH.ultimoError};
  }finally{UTMH.consultando=false;}
}

// Consulta en segundo plano si falta la UTM del mes en curso.
// Como máximo un intento cada 6 horas por sesión.
function asegurarUTMHistoricoAlDia(){
  const h=new Date(), p=per(h.getFullYear(),h.getMonth()+1);
  if(utmDelPeriodo(p)||UTMH.consultando)return;
  if(Date.now()-UTMH.ultimoIntento<6*3600e3)return;
  actualizarUTMHistorico({silencioso:true}).then(r=>{
    if(r&&r.nuevos&&r.nuevos.length){try{rerender();}catch(e){}}
  });
}

async function setUTMManual(p,val){
  if(!esPeriodo(p))return;
  await cargarUTMHistorico();
  const v=Math.round(pn(val));
  const antes=+UTMH.manual[p]||0;
  if(v>0&&v!==(valorSII(p)||+UTMH.auto[p]||0))UTMH.manual[p]=v;
  else delete UTMH.manual[p];                       // vacío o igual al oficial: vuelve al oficial
  if((+UTMH.manual[p]||0)===antes){renderUTMHistoricoBox();return;}
  if(!await guardarUTMHistorico()){toast('❌ No se pudo guardar la UTM','e');return;}
  toast(UTMH.manual[p]?`✎ UTM ${p} corregida a ${fmtC(UTMH.manual[p])}`:`↺ UTM ${p} vuelve al valor oficial`);
  renderUTMHistoricoBox();
}

// ── Vista en Indicadores: meses en filas, años en columnas ──
function renderUTMHistoricoHTML(){
  const yHoy=new Date().getFullYear();
  const anios=[];for(let y=ANIO_INICIO;y<=yHoy;y++)anios.push(y);
  const color={manual:'var(--warn)',sii:'var(--tx)',mindicador:'var(--info)'};
  const filas=MESES.map((nm,i)=>`<tr><td class="tl" style="font-size:11px">${nm}</td>${anios.map(y=>{
    const p=per(y,i+1),v=utmDelPeriodo(p),f=fuenteUTM(p);
    const futuro=y===yHoy&&i+1>new Date().getMonth()+1;
    return `<td style="padding:2px 4px"><input type="number" class="money-input" min="0" value="${v||''}" placeholder="${futuro?'':'—'}"
      title="${f==='manual'?'Corregido a mano (oficial: '+(valorSII(p)||UTMH.auto[p]||'—')+')':f==='sii'?'Valor oficial SII':f==='mindicador'?'Traído de mindicador.cl':'Sin dato'}"
      onchange="setUTMManual('${p}',this.value)" ${futuro?'disabled':''}
      style="width:92px;text-align:right;font-family:var(--mono);font-size:11px;color:${color[f]||'var(--mt)'}${f==='manual'?';font-weight:700':''}"></td>`;
  }).join('')}</tr>`).join('');
  const faltan=[];for(const y of anios)for(let m=1;m<=12;m++){if(y===yHoy&&m>new Date().getMonth()+1)break;if(!utmDelPeriodo(per(y,m)))faltan.push(per(y,m));}
  return `<div class="info-tip" style="font-size:11px;margin-bottom:10px">
      Se usa en el F29 para reajustar el remanente de crédito fiscal (art. 27 DL 825) con la UTM <strong>del mes de origen</strong> y la
      <strong>del mes de imputación</strong>, aunque estés rehaciendo un año anterior.
      <span style="color:var(--tx)">Negro</span>: oficial SII ·
      <span style="color:var(--info)">azul</span>: traído de mindicador.cl ·
      <span style="color:var(--warn);font-weight:700">naranjo</span>: corregido a mano (borra el valor para volver al oficial).
    </div>
    ${faltan.length?`<div class="info-tip" style="font-size:11px;margin-bottom:10px;background:rgba(210,153,34,.10);border-color:var(--warn)">⚠️ Sin UTM: ${faltan.join(', ')}. Pulsa "Buscar meses nuevos" o ingrésala a mano.</div>`:''}
    <div class="card-np"><div class="tw"><table>
      <thead><tr><th class="tl">MES</th>${anios.map(y=>`<th style="text-align:right">${y}</th>`).join('')}</tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-g" id="btn-utm-hist" onclick="buscarUTMNuevas()" ${UTMH.consultando?'disabled':''}>🔄 Buscar meses nuevos</button>
      <span style="font-size:10px;color:var(--mt)">${UTMH.ultimoError?'Último intento falló: '+UTMH.ultimoError+'. ':''}${UTMH.actualizadoEn?'Última incorporación: '+new Date(UTMH.actualizadoEn).toLocaleString('es-CL')+'. ':''}Fuente oficial: <a href="https://www.sii.cl/valores_y_fechas/utm/utm${yHoy}.htm" target="_blank" rel="noopener" style="color:var(--ac)">sii.cl UTM ${yHoy}</a></span>
    </div>`;
}
function renderUTMHistoricoBox(){
  const el=document.getElementById('utm-hist-box');
  if(!el)return;
  if(!UTMH.loaded){cargarUTMHistorico().then(()=>{renderUTMHistoricoBox();asegurarUTMHistoricoAlDia();});el.innerHTML='<div style="font-size:11px;color:var(--mt)">Cargando…</div>';return;}
  el.innerHTML=renderUTMHistoricoHTML();
}
async function buscarUTMNuevas(){
  const yHoy=new Date().getFullYear(), anios=[];
  for(let y=ANIO_INICIO;y<=yHoy;y++)anios.push(y);
  const b=document.getElementById('btn-utm-hist');if(b){b.disabled=true;b.textContent='⏳ Consultando…';}
  await actualizarUTMHistorico({anios});
  renderUTMHistoricoBox();
}

export {UTM_SII, UTMH, ANIO_INICIO, utmDelPeriodo, fuenteUTM, cargarUTMHistorico, actualizarUTMHistorico,
        asegurarUTMHistoricoAlDia, setUTMManual, renderUTMHistoricoBox, buscarUTMNuevas, periodoDeFecha};
