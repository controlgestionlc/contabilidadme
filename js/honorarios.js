// honorarios.js — Honorarios V2: reconocimiento, retención y pago separados.
import {toast, pn, fmt, MESES, PDC} from './core.js';
import {retencionHonorarios} from './indicadores.js';
import {S} from './state.js';
import {ccOpts} from './centroscosto.js';
import {asientoHonorario,asientoPagoHonorario} from './motor-contable.js';
import {validarMovimientosPDC} from './pdc-reglas.js';
import {ejercicioCerrado,persistirClavesCritico} from './contabilidad-v2.js';
import './storage.js';

const uid=()=>`hon_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const fechaMes=m=>`${S.empresa.anio}-${String(m||1).padStart(2,'0')}-28`;
function cuentasPagoOpts(valor=''){
  const cs=PDC.filter(c=>c.cd&&c.cd.startsWith('1101')&&c.tp==='A'&&c.activa!==false);
  return '<option value="">— cuenta —</option>'+cs.map(c=>`<option value="${c.cd}"${valor===c.cd?' selected':''}>${c.cd} — ${c.nm}</option>`).join('');
}
function normalizarHon(h){
  if(!h.id)h.id=uid();
  if(!h.fecha)h.fecha=fechaMes(h.mes||1);
  if(!h.modalidad)h.modalidad='pendiente';
  if(h.estado==null)h.estado='activo';
  return h;
}
function asientoId(h,tipo){return `auto:honorarios:${h.id}:${tipo}`;}
function upsertAsientoHonorario(h){
  const tasa=retencionHonorarios(S.empresa.anio);
  h.tasaRetencion=tasa;
  const rec=asientoHonorario(h,S.empresa.anio);
  if(!rec.cuadre.ok)throw new Error('El asiento de reconocimiento de honorarios no cuadra');
  const vr=validarMovimientosPDC(rec.movs);if(!vr.ok)throw new Error(vr.errores[0]);
  const idR=asientoId(h,'reconocimiento');
  const objR={id:idR,fecha:rec.fecha,glosa:rec.glosa,movs:rec.movs,tipo:'documento',subtipo:'honorario',origen:'motor-v2',fuente:'honorarios',docId:h.id,generadoAutomaticamente:true,cuadre:rec.cuadre};
  const ir=S.asientos.findIndex(a=>a.id===idR); if(ir>=0)S.asientos[ir]={...S.asientos[ir],...objR,anulado:false};else S.asientos.push(objR);

  const idP=asientoId(h,'pago');
  const ip=S.asientos.findIndex(a=>a.id===idP);
  if(h.modalidad==='contado'){
    if(!h.cuentaPago)throw new Error('Selecciona una cuenta de pago para honorarios al contado');
    const pag=asientoPagoHonorario(h,S.empresa.anio);
    if(!pag.cuadre.ok)throw new Error('El asiento de pago de honorarios no cuadra');
    const vp=validarMovimientosPDC(pag.movs);if(!vp.ok)throw new Error(vp.errores[0]);
    const objP={id:idP,fecha:pag.fecha,glosa:pag.glosa,movs:pag.movs,tipo:'pago',subtipo:'honorario',origen:'motor-v2',fuente:'honorarios',docId:h.id,cuentaPago:h.cuentaPago,documentos:[{docId:h.id,monto:pag.movs[0]?.debe||0,tipo:'honorario'}],generadoAutomaticamente:true,cuadre:pag.cuadre};
    if(ip>=0)S.asientos[ip]={...S.asientos[ip],...objP,anulado:false};else S.asientos.push(objP);
  }else if(ip>=0){S.asientos[ip].anulado=true;S.asientos[ip].motivoAnulacion='Honorario pendiente de pago';}
}

function renderHon(){
  const tasa=retencionHonorarios(S.empresa.anio);
  const sub=document.getElementById('hon-sub');
  if(sub)sub.textContent=`Retención ${(tasa*100).toFixed(2).replace('.',',')}% · reconocimiento y pago separados · ${S.empresa.anio}`;
  const tbody=document.getElementById('h-tbody');
  const lista=(S.honorarios||[]).map(normalizarHon).filter(h=>h.estado!=='anulado');
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="11" class="empty"><div class="ei">📝</div>No hay honorarios.</td></tr>`;document.getElementById('h-tfoot').innerHTML='';return;}
  let tB=0,h='';
  lista.forEach(hn=>{
    const i=S.honorarios.indexOf(hn),ret=Math.round((hn.bruto||0)*tasa),net=(hn.bruto||0)-ret;tB+=hn.bruto||0;
    h+=`<tr>
      <td><input type="date" value="${hn.fecha||fechaMes(hn.mes)}" onchange="setHonCampo(${i},'fecha',this.value)" style="min-width:128px"></td>
      <td><input type="text" value="${hn.nombre||''}" oninput="setHonCampo(${i},'nombre',this.value)" style="min-width:140px"></td>
      <td><input type="text" value="${hn.rut||''}" oninput="setHonCampo(${i},'rut',this.value)" style="min-width:110px"></td>
      <td><input type="number" min="0" value="${hn.bruto||''}" placeholder="0" oninput="uhon(${i},this.value)"></td>
      <td class="ac">${fmt(ret)}</td><td class="ac">${fmt(net)}</td>
      <td><select onchange="setHonCampo(${i},'cc',this.value)" style="min-width:135px;font-size:11px">${ccOpts(hn.cc||'')}</select></td>
      <td><select onchange="setHonCampo(${i},'modalidad',this.value);renderHon()" style="min-width:105px"><option value="pendiente"${hn.modalidad==='pendiente'?' selected':''}>Pendiente</option><option value="contado"${hn.modalidad==='contado'?' selected':''}>Contado</option></select></td>
      <td>${hn.modalidad==='contado'?`<select onchange="setHonCampo(${i},'cuentaPago',this.value)" style="min-width:145px">${cuentasPagoOpts(hn.cuentaPago||'1101201')}</select>`:'<span style="color:var(--mt);font-size:11px">Por pagar</span>'}</td>
      <td><span class="badge ${hn.modalidad==='contado'?'bg':'by'}">${hn.modalidad==='contado'?'Pagado':'Pendiente'}</span></td>
      <td><button class="btn btn-d" onclick="delHon(${i})">✕</button></td></tr>`;
  });
  tbody.innerHTML=h;
  const tR=Math.round(tB*tasa);
  document.getElementById('h-tfoot').innerHTML=`<tr><td class="tl" colspan="3">TOTAL</td><td>${fmt(tB)}</td><td>${fmt(tR)}</td><td>${fmt(tB-tR)}</td><td colspan="5"></td></tr>`;
}
function setHonCampo(i,campo,valor){const h=normalizarHon(S.honorarios[i]);h[campo]=valor;if(campo==='fecha')h.mes=+String(valor).slice(5,7)||h.mes;}
function uhon(i,val){S.honorarios[i].bruto=pn(val);renderHon();}
function addHon(){S.honorarios.push({id:uid(),mes:new Date().getMonth()+1,fecha:fechaMes(new Date().getMonth()+1),nombre:'',rut:'',bruto:0,cc:'',modalidad:'pendiente',cuentaPago:'1101201',estado:'activo'});renderHon();}
async function delHon(i){
  if(!confirm('¿Anular este honorario? El registro y sus asientos se conservarán para trazabilidad.'))return;
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado.','e');return;}
  const h=normalizarHon(S.honorarios[i]),snapH=JSON.stringify(S.honorarios),snapA=JSON.stringify(S.asientos||[]);
  h.estado='anulado';h.anuladoEn=new Date().toISOString();
  (S.asientos||[]).filter(a=>a.fuente==='honorarios'&&a.docId===h.id).forEach(a=>{a.anulado=true;a.anuladoEn=new Date().toISOString();a.motivoAnulacion='Honorario anulado';});
  try{
    await persistirClavesCritico([
      {key:'honorarios-'+S.empresa.anio,value:JSON.stringify(S.honorarios)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos)},
    ]);
    toast('✅ Honorario anulado');renderHon();
  }catch(e){S.honorarios=JSON.parse(snapH);S.asientos=JSON.parse(snapA);toast('❌ No se pudo anular. No se aplicaron cambios.','e');}
}
async function saveHon(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. No se pueden modificar honorarios.','e');return;}
  const snapH=JSON.stringify(S.honorarios||[]),snapA=JSON.stringify(S.asientos||[]);
  try{
    for(const h of S.honorarios.map(normalizarHon).filter(x=>x.estado!=='anulado')){
      if(!h.nombre||!h.rut||!(+h.bruto>0))throw new Error('Completa nombre, RUT y monto bruto de todos los honorarios');
      upsertAsientoHonorario(h);
    }
    await persistirClavesCritico([
      {key:'honorarios-'+S.empresa.anio,value:JSON.stringify(S.honorarios)},
      {key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos)},
    ]);
    toast('✅ Honorarios contabilizados con reconocimiento y pago separados');
  }catch(e){
    S.honorarios=JSON.parse(snapH);S.asientos=JSON.parse(snapA);
    toast('❌ '+(e.message||'No se pudo guardar')+'. La operación NO fue contabilizada.','e');
  }
}

export {renderHon,setHonCampo,uhon,addHon,delHon,saveHon};
