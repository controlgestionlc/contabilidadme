// anticipos.js — Anticipos de sueldo por trabajador (V2.21.63)
//
// Cada anticipo vive en la ficha del trabajador: t.anticipos = [{id, fecha,
// monto, motivo, mesDesc:'YYYY-MM', asientoId?}]. Se descuenta en la
// liquidación del mes `mesDesc` (por defecto, el mes de la fecha) como "otro
// descuento" (LRE 3188 · Descuentos por anticipos y préstamos).
//
// Contabilidad:
//   • Al pagar el anticipo (opcional):  Debe 1106001 Anticipo de sueldo / Haber cuenta de pago
//   • En el asiento de remuneraciones:  Haber 1106001 por el anticipo descontado
//     (el líquido por pagar ya viene rebajado).
// Un mes con libro de remuneraciones cerrado no admite cambios de anticipos.

import {toast, fmtC, MESES, pdcNm} from './core.js';
import {S} from './state.js';
import {ejercicioCerrado, persistirAsientosCritico} from './contabilidad-v2.js';
import {buscarCuentas} from './buscadorcuentas.js';
import './storage.js';

const n=v=>Math.round(+v||0);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fFecha=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
const per=(anio,mes)=>`${anio}-${String(mes).padStart(2,'0')}`;
const mesDescDe=a=>a.mesDesc||String(a.fecha||'').slice(0,7);

// Anticipos que se descuentan en la liquidación de (anio, mes)
function anticiposMes(t,anio,mes){
  const p=per(anio,mes);
  return (Array.isArray(t&&t.anticipos)?t.anticipos:[]).filter(a=>a&&n(a.monto)>0&&mesDescDe(a)===p)
    .sort((x,y)=>String(x.fecha).localeCompare(String(y.fecha)));
}
// Aplica los anticipos a una liquidación ya calculada (mutación controlada)
function aplicarAnticipos(l,lista){
  const anticipo=(lista||[]).reduce((s,a)=>s+n(a.monto),0);
  l.anticipos=(lista||[]).map(a=>({id:a.id,fecha:a.fecha,monto:n(a.monto),motivo:a.motivo||''}));
  l.anticipo=anticipo;
  if(anticipo){l.totalDescuentos+=anticipo;l.liquido-=anticipo;}
  return l;
}

// Cuentas de caja y bancos (1101xxx de movimiento) para el pago del anticipo
function cuentasPago(){
  let l=[];try{l=buscarCuentas('1101',200).filter(c=>/^1101\d{3}$/.test(String(c.cd)));}catch(e){}
  return l.length?l:[{cd:'1101201',nm:pdcNm('1101201')||'Banco'}];
}

// ── UI ──
const AN={tid:null};
function libroCerrado(p){
  const libros=S.libroRem&&typeof S.libroRem==='object'?S.libroRem:{};
  return !!(libros[p]&&Array.isArray(libros[p].lineas));
}
function asegurarModal(){
  let m=document.getElementById('an-modal');
  if(!m){
    m=document.createElement('div');m.id='an-modal';m.className='modal-bkd';
    m.innerHTML='<div class="modal-box modal-fit" style="max-width:760px"><div id="an-body" class="modal-scroll"></div></div>';
    document.body.appendChild(m);
  }
  return m;
}
function abrirAnticipos(tid){
  const t=(S.trabajadores||[]).find(x=>x.id===tid);if(!t)return;
  AN.tid=tid;
  asegurarModal().classList.add('open');
  renderAnticipos();
}
function cerrarAnticipos(){
  const m=document.getElementById('an-modal');if(m)m.classList.remove('open');
  if(typeof window.renderRemuneraciones==='function')window.renderRemuneraciones();
}
function renderAnticipos(){
  const t=(S.trabajadores||[]).find(x=>x.id===AN.tid);const body=document.getElementById('an-body');if(!t||!body)return;
  const anio=S.empresa.anio;
  const hoy=new Date();const hoyIso=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const fechaDef=String(hoyIso).startsWith(String(anio))?hoyIso:`${anio}-01-01`;
  const lista=(t.anticipos||[]).slice().sort((x,y)=>String(y.fecha).localeCompare(String(x.fecha)));
  const total=lista.filter(a=>mesDescDe(a).startsWith(String(anio))).reduce((s,a)=>s+n(a.monto),0);
  const opcMes=MESES.map((nm,i)=>`<option value="${per(anio,i+1)}">${nm} ${anio}</option>`).join('');
  const filas=lista.map(a=>{
    const p=mesDescDe(a);const [y,m]=p.split('-').map(Number);const cerrado=libroCerrado(p);
    return `<tr>
      <td class="tl">${fFecha(a.fecha)}</td>
      <td class="tl">${esc(a.motivo||'')}</td>
      <td class="tl">${MESES[(m||1)-1]||''} ${y||''}${cerrado?' <span title="Libro cerrado" style="font-size:10px;color:var(--mt)">🔒</span>':''}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtC(n(a.monto))}</td>
      <td class="tl" style="font-size:11px">${a.asientoId?'✓ pago contabilizado':'<span style="color:var(--mt)">sin asiento de pago</span>'}</td>
      <td style="text-align:right">${cerrado?'':`<button class="btn btn-d" title="Eliminar anticipo" onclick="eliminarAnticipo('${a.id}')">🗑</button>`}</td>
    </tr>`;}).join('');
  body.innerHTML=`
    <div class="modal-hdr"><div>
      <div class="modal-title">💵 Anticipos de sueldo</div>
      <div class="modal-sub">${esc(t.nombre||'')}${t.rut?' · '+esc(t.rut):''} · se descuentan en la liquidación del mes indicado</div>
    </div><button class="btn btn-g" onclick="cerrarAnticipos()">✕</button></div>
    <div class="card" style="margin:10px 0">
      <div style="display:grid;grid-template-columns:140px 130px 1fr 160px;gap:8px;align-items:end">
        <div class="grp"><label>Fecha</label><input type="date" id="an-fecha" value="${fechaDef}" onchange="anFechaCambio()"></div>
        <div class="grp"><label>Monto</label><input type="text" inputmode="numeric" id="an-monto" placeholder="0"></div>
        <div class="grp"><label>Motivo</label><input type="text" id="an-motivo" placeholder="Ej: Anticipo quincena"></div>
        <div class="grp"><label>Descontar en</label><select id="an-mes">${opcMes}</select></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <label style="display:inline-flex;gap:6px;align-items:center;font-size:12px;text-transform:none;letter-spacing:0;font-weight:400"><input type="checkbox" id="an-asiento" checked style="width:auto"> Contabilizar el pago (Debe 1106001 Anticipo de sueldo / Haber</label>
        <select id="an-cuenta" style="width:auto;font-size:12px">${cuentasPago().map(c=>`<option value="${c.cd}" ${c.cd==='1101201'?'selected':''}>${c.cd} ${esc(c.nm)}</option>`).join('')}</select><span style="font-size:12px">)</span>
        <span style="flex:1"></span>
        <button class="btn btn-p" onclick="guardarAnticipo()">+ Registrar anticipo</button>
      </div>
    </div>
    ${lista.length?`<div class="tw"><table>
      <thead><tr><th class="tl">FECHA</th><th class="tl">MOTIVO</th><th class="tl">DESCUENTO EN</th><th style="text-align:right">MONTO</th><th class="tl">PAGO</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td class="tl" colspan="3" style="font-weight:700">Total ${anio}</td><td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(total)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>`:'<div class="empty" style="padding:18px">Sin anticipos registrados.</div>'}
    <div class="modal-footer"><button class="btn btn-d" onclick="cerrarAnticipos()" title="Cierra la ventana; los anticipos registrados quedan guardados">Cancelar</button></div>`;
  anFechaCambio();
}
function anFechaCambio(){
  const f=document.getElementById('an-fecha'),s=document.getElementById('an-mes');
  if(f&&s&&/^\d{4}-\d{2}/.test(f.value)){const p=f.value.slice(0,7);if([...s.options].some(o=>o.value===p))s.value=p;}
}
async function guardarTrabajadores(){
  try{const r=await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));return !(r&&r.ok===false);}
  catch(e){console.error(e);return false;}
}
async function guardarAnticipo(){
  const t=(S.trabajadores||[]).find(x=>x.id===AN.tid);if(!t)return;
  const fecha=document.getElementById('an-fecha').value;
  const monto=n(String(document.getElementById('an-monto').value).replace(/\./g,'').replace(',','.'));
  const motivo=String(document.getElementById('an-motivo').value||'').trim();
  const mesDesc=document.getElementById('an-mes').value;
  const conAsiento=document.getElementById('an-asiento').checked;
  const cuenta=document.getElementById('an-cuenta').value||'1101201';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){toast('⚠️ Indica la fecha del anticipo','e');return;}
  if(!(monto>0)){toast('⚠️ El monto debe ser mayor que cero','e');return;}
  if(!motivo){toast('⚠️ Indica el motivo del anticipo','e');return;}
  if(libroCerrado(mesDesc)){toast('🔒 El libro de remuneraciones de ese mes está cerrado. Elige otro mes de descuento o reabre el libro.','e');return;}
  const [ym,mm]=mesDesc.split('-').map(Number);
  if(mesDesc<fecha.slice(0,7)&&!confirm('El mes de descuento es anterior a la fecha del anticipo. ¿Continuar?'))return;
  const a={id:'ant_'+Date.now().toString(36),fecha,monto,motivo,mesDesc,creadoEn:new Date().toISOString()};
  if(conAsiento){
    if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado: no se puede contabilizar el pago.','e');return;}
    if(String(fecha).slice(0,4)!==String(S.empresa.anio)){toast('⚠️ Para contabilizar el pago, la fecha debe ser del ejercicio '+S.empresa.anio,'e');return;}
    const asId='as_ant_'+a.id;
    const movs=[
      {cd:'1106001',nm:pdcNm('1106001'),debe:monto,haber:0,desc:`Anticipo ${t.nombre||''} · ${motivo}`.trim()},
      {cd:cuenta,nm:pdcNm(cuenta),debe:0,haber:monto,desc:`Pago anticipo ${t.nombre||''}`.trim()}];
    const r=await persistirAsientosCritico(()=>{
      S.asientos.push({id:asId,n:null,fecha,glosa:`Anticipo de sueldo — ${t.nombre||''} (${motivo})`,movs,tipo:'anticipo',trabajadorId:t.id,anticipoId:a.id,creadoEn:new Date().toISOString()});
    });
    if(!r||!r.ok){toast('❌ No se pudo guardar el asiento del anticipo ('+((r&&r.motivo)||'error')+'). No se registró.','e');return;}
    a.asientoId=asId;
  }
  if(!Array.isArray(t.anticipos))t.anticipos=[];
  t.anticipos.push(a);
  if(!(await guardarTrabajadores())){toast('❌ No se pudo guardar el anticipo','e');return;}
  toast(`💵 Anticipo de ${fmtC(monto)} registrado · se descuenta en ${MESES[mm-1]} ${ym}`);
  renderAnticipos();
}
async function eliminarAnticipo(aid){
  const t=(S.trabajadores||[]).find(x=>x.id===AN.tid);if(!t)return;
  const a=(t.anticipos||[]).find(x=>x.id===aid);if(!a)return;
  if(libroCerrado(mesDescDe(a))){toast('🔒 El libro de ese mes está cerrado','e');return;}
  if(!confirm(`¿Eliminar el anticipo de ${fmtC(n(a.monto))} del ${fFecha(a.fecha)}?${a.asientoId?'\n\nSu asiento de pago queda ANULADO (conserva el número, sin efecto contable).':''}`))return;
  if(a.asientoId){
    const r=await persistirAsientosCritico(()=>{
      const as=(S.asientos||[]).find(x=>x.id===a.asientoId);
      if(as&&!as.anulado){as.anulado=true;as.anuladoEn=new Date().toISOString();as.motivoAnulacion='Anticipo eliminado';}
    });
    if(!r||!r.ok){toast('❌ No se pudo anular el asiento del anticipo','e');return;}
  }
  t.anticipos=t.anticipos.filter(x=>x.id!==aid);
  if(!(await guardarTrabajadores())){toast('❌ No se pudo guardar la eliminación','e');return;}
  toast('🗑 Anticipo eliminado');
  renderAnticipos();
}

export {anticiposMes, aplicarAnticipos, abrirAnticipos, cerrarAnticipos, renderAnticipos, anFechaCambio, guardarAnticipo, eliminarAnticipo};
