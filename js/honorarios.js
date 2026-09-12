// honorarios.js — Honorarios V2: reconocimiento, retención y pago separados.
import {toast, pn, fmt, MESES, PDC, today} from './core.js';
import {retencionHonorarios} from './indicadores.js';
import {S} from './state.js';
import {ccOpts} from './centroscosto.js';
import {asientoHonorario,asientoPagoHonorario} from './motor-contable.js';
import {validarMovimientosPDC} from './pdc-reglas.js';
import {ejercicioCerrado,puedeOperarFecha,persistirClavesCritico} from './contabilidad-v2.js';
import './storage.js';

const uid=()=>`hon_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const fechaMes=m=>`${S.empresa.anio}-${String(m||1).padStart(2,'0')}-28`;
function cuentasPagoOpts(valor=''){
  const cs=PDC.filter(c=>c.cd&&c.cd.startsWith('1101')&&c.tp==='A'&&c.activa!==false);
  return '<option value="">— cuenta —</option>'+cs.map(c=>`<option value="${c.cd}"${valor===c.cd?' selected':''}>${c.cd} — ${c.nm}</option>`).join('');
}
function cuentasGastoOpts(valor='3202019'){
  const cs=PDC.filter(c=>c.cd&&c.tp==='A'&&c.activa!==false&&!String(c.cd).startsWith('1')&&!String(c.cd).startsWith('2'));
  return '<option value="">— cuenta de gasto —</option>'+cs.map(c=>`<option value="${c.cd}"${valor===c.cd?' selected':''}>${c.cd} — ${c.nm}</option>`).join('');
}
function normalizarHon(h){
  if(!h.id)h.id=uid();
  if(!h.fecha)h.fecha=fechaMes(h.mes||1);
  if(!h.modalidad)h.modalidad='pendiente';
  if(h.estado==null)h.estado='activo';
  // Compatibilidad: los registros anteriores a V2.16.10 siempre fueron
  // creados bajo el flujo con retención.
  if(!h.tipoRetencion)h.tipoRetencion='con_retencion';
  return h;
}
function asientoId(h,tipo){return `auto:honorarios:${h.id}:${tipo}`;}
function upsertAsientoHonorario(h){
  const tasa=h.tipoRetencion==='sin_retencion'?0:retencionHonorarios(S.empresa.anio);
  h.tasaRetencion=tasa;
  h.retencion=Math.round((+h.bruto||0)*tasa);
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

function pagoActivo(h){return (S.asientos||[]).find(a=>!a.anulado&&a.tipo==='pago'&&a.fuente==='honorarios'&&a.docId===h.id);}
function reconocimientoActivo(h){return (S.asientos||[]).find(a=>!a.anulado&&a.tipo==='documento'&&a.fuente==='honorarios'&&a.docId===h.id);}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));}

function renderHon(){
  const tasa=retencionHonorarios(S.empresa.anio);
  const sub=document.getElementById('hon-sub');
  if(sub)sub.textContent=`Libro auxiliar · boletas con o sin retención · tasa vigente ${(tasa*100).toFixed(2).replace('.',',')}% · ${S.empresa.anio}`;
  const tbody=document.getElementById('h-tbody');
  const lista=(S.honorarios||[]).map(normalizarHon).filter(h=>h.estado!=='anulado');
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="10" class="empty"><div class="ei">📝</div>No hay boletas. Regístralas desde Comprobantes.</td></tr>`;document.getElementById('h-tfoot').innerHTML='';return;}
  let tB=0,tR=0,h='';
  lista.forEach(hn=>{
    const i=S.honorarios.indexOf(hn),sinRet=hn.tipoRetencion==='sin_retencion',tasaH=sinRet?0:(hn.tasaRetencion!=null?+hn.tasaRetencion:tasa),ret=sinRet?0:(hn.retencion!=null?+hn.retencion:Math.round((hn.bruto||0)*tasaH)),net=(hn.bruto||0)-ret;
    const pag=pagoActivo(hn),rec=reconocimientoActivo(hn);tB+=hn.bruto||0;
    tR+=ret;
    h+=`<tr>
      <td class="tl">${hn.fecha||fechaMes(hn.mes)}</td><td class="tl">${esc(hn.numero||'—')}</td>
      <td class="tl"><strong>${esc(hn.nombre||'')}</strong></td><td class="tl">${esc(hn.rut||'')}</td>
      <td class="ac">${fmt(hn.bruto||0)}</td>
      <td class="ac" title="${sinRet?'Sin retención':'Con retención'}">${fmt(ret)}${sinRet?' · SIN RET.':''}</td><td class="ac">${fmt(net)}</td>
      <td class="tl">${esc(hn.cc||'—')}</td>
      <td><span class="badge ${pag?'bg':rec?'by':'br'}">${pag?'PAGADA':rec?'PENDIENTE':'SIN COMPROBANTE'}</span></td>
      <td style="white-space:nowrap"><button class="btn btn-g" onclick="abrirHonComprobante('${hn.id}')">Editar</button> ${!pag?`<button class="btn btn-p" onclick="abrirHonComprobante('${hn.id}',true)">Pagar</button>`:''} <button class="btn btn-d" onclick="delHon(${i})">Anular</button></td></tr>`;
  });
  tbody.innerHTML=h;
  document.getElementById('h-tfoot').innerHTML=`<tr><td class="tl" colspan="4">TOTAL</td><td>${fmt(tB)}</td><td>${fmt(tR)}</td><td>${fmt(tB-tR)}</td><td colspan="3"></td></tr>`;
}
let HON_FORM={id:null,soloPago:false};
function prestadoresDisponibles(){
  const out=[];
  Object.values(S.fichasAux?.proveedor||{}).forEach(f=>out.push({nombre:f.razonSocial||'',rut:`${f.rutCodigo||''}${f.rutDV?'-'+f.rutDV:''}`,cc:f.centroCosto||f.cc||'',cuentaGasto:f.cuenta||''}));
  (S.honorarios||[]).filter(h=>h.estado!=='anulado').forEach(h=>out.push({nombre:h.nombre||'',rut:h.rut||'',cc:h.cc||'',cuentaGasto:h.cuentaGasto||''}));
  return [...new Map(out.filter(x=>x.nombre).map(x=>[(x.nombre+'|'+x.rut).toLowerCase(),x])).values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
function seleccionarPrestadorHon(){
  const nombre=document.getElementById('honf-nombre')?.value.trim().toLowerCase();
  const p=prestadoresDisponibles().find(x=>x.nombre.trim().toLowerCase()===nombre);if(!p)return;
  const rut=document.getElementById('honf-rut');if(rut&&!rut.value)rut.value=p.rut;
  const cc=document.getElementById('honf-cc');if(cc&&p.cc&&!cc.value)cc.value=p.cc;
  const cg=document.getElementById('honf-gasto');if(cg&&p.cuentaGasto)cg.value=p.cuentaGasto;
}
function abrirHonComprobante(id=null,soloPago=false){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado.','e');return;}
  const existente=id?(S.honorarios||[]).find(h=>h.id===id):null;
  const h=existente?{...normalizarHon(existente)}:{id:null,fecha:today(),numero:'',nombre:'',rut:'',bruto:0,cc:'',cuentaGasto:'3202019',tipoRetencion:'con_retencion',modalidad:'pendiente',cuentaPago:'1101201',fechaPago:today()};
  const pag=existente&&pagoActivo(existente);HON_FORM={id:id||null,soloPago:!!soloPago};
  const box=document.getElementById('cmp-hon-modal'),body=document.getElementById('cmp-hon-body'),title=document.getElementById('cmp-hon-title');
  if(!box||!body)return; title.textContent=soloPago?'💳 Pagar boleta de honorarios':existente?'📝 Editar boleta de honorarios':'📝 Nueva boleta de honorarios';
  const bloqueado=soloPago?'disabled':'';
  body.innerHTML=`<div class="fg">
    <div class="grp"><label>Fecha de la boleta</label><input id="honf-fecha" type="date" value="${h.fecha||today()}" ${bloqueado}></div>
    <div class="grp"><label>N° de boleta</label><input id="honf-numero" type="text" inputmode="numeric" value="${esc(h.numero||'')}" ${bloqueado}></div>
    <div class="grp"><label>Prestador</label><input id="honf-nombre" type="text" list="honf-prestadores" value="${esc(h.nombre||'')}" onchange="seleccionarPrestadorHon()" ${bloqueado}><datalist id="honf-prestadores">${prestadoresDisponibles().map(p=>`<option value="${esc(p.nombre)}">${esc(p.rut)}</option>`).join('')}</datalist></div>
    <div class="grp"><label>RUT prestador</label><input id="honf-rut" type="text" value="${esc(h.rut||'')}" ${bloqueado}></div>
    <div class="grp"><label>Monto bruto</label><input id="honf-bruto" type="number" min="0" value="${h.bruto||''}" oninput="actualizarPreviewHon()" ${bloqueado}></div>
    <div class="grp"><label>Tratamiento de retención</label><select id="honf-tipo-retencion" onchange="actualizarPreviewHon()" ${bloqueado}><option value="con_retencion"${h.tipoRetencion!=='sin_retencion'?' selected':''}>Con retención</option><option value="sin_retencion"${h.tipoRetencion==='sin_retencion'?' selected':''}>Sin retención (no afecta/exenta)</option></select></div>
    <div class="grp"><label>Centro de costo</label><select id="honf-cc" ${bloqueado}>${ccOpts(h.cc||'')}</select></div>
    <div class="grp" style="grid-column:1/-1"><label>Cuenta de gasto</label><select id="honf-gasto" ${bloqueado}>${cuentasGastoOpts(h.cuentaGasto||'3202019')}</select></div>
  </div>
  <div id="honf-preview" class="info-tip" style="margin:12px 0"></div>
  <div class="card" style="margin:12px 0"><label style="display:flex;align-items:center;gap:8px"><input id="honf-pagar" type="checkbox" ${(soloPago||pag)?'checked':''} ${pag&&!soloPago?'disabled':''} onchange="actualizarPreviewHon()"> <strong>${pag?'Pago ya registrado':'Registrar pago ahora'}</strong></label>
    <div id="honf-pago-campos" class="fg" style="margin-top:10px">
      <div class="grp"><label>Fecha de pago</label><input id="honf-fecha-pago" type="date" value="${pag?.fecha||h.fechaPago||h.fecha||today()}"></div>
      <div class="grp"><label>Banco / Caja</label><select id="honf-cuenta-pago">${cuentasPagoOpts(pag?.cuentaPago||h.cuentaPago||'1101201')}</select></div>
    </div>
  </div>
  <div class="modal-footer"><button class="btn btn-g" onclick="cerrarHonComprobante()">Cancelar</button><button class="btn btn-p" onclick="guardarHonComprobante()">💾 ${soloPago?'Registrar pago':'Guardar comprobante'}</button></div>`;
  box.classList.add('open');actualizarPreviewHon();
}
function cerrarHonComprobante(){document.getElementById('cmp-hon-modal')?.classList.remove('open');HON_FORM={id:null,soloPago:false};}
function actualizarPreviewHon(){
  const bruto=+(document.getElementById('honf-bruto')?.value||0),sinRet=document.getElementById('honf-tipo-retencion')?.value==='sin_retencion',tasa=sinRet?0:retencionHonorarios(S.empresa.anio),ret=Math.round(bruto*tasa),liq=bruto-ret,pagar=!!document.getElementById('honf-pagar')?.checked;
  const detalle=sinRet?'sin retención':`retención ${(tasa*100).toFixed(2).replace('.',',')}% ${fmt(ret)}`;
  const p=document.getElementById('honf-preview');if(p)p.innerHTML=`<strong>Reconocimiento:</strong> gasto ${fmt(bruto)} · ${detalle} · honorario por pagar ${fmt(liq)}${pagar?`<br><strong>Pago separado:</strong> honorarios por pagar ${fmt(liq)} contra Banco/Caja`:''}`;
  const campos=document.getElementById('honf-pago-campos');if(campos)campos.style.display=pagar?'grid':'none';
}
async function guardarHonComprobante(){
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado.','e');return;}
  const existente=HON_FORM.id?(S.honorarios||[]).find(h=>h.id===HON_FORM.id):null;
  const val=id=>document.getElementById(id)?.value||'';
  const h=existente?{...existente}:{id:uid(),estado:'activo'};
  if(!HON_FORM.soloPago){
    const tipoRetencion=val('honf-tipo-retencion')==='sin_retencion'?'sin_retencion':'con_retencion';
    const tasaRetencion=tipoRetencion==='sin_retencion'?0:retencionHonorarios(S.empresa.anio);
    Object.assign(h,{fecha:val('honf-fecha'),mes:+val('honf-fecha').slice(5,7),numero:val('honf-numero').trim(),nombre:val('honf-nombre').trim(),rut:val('honf-rut').trim(),bruto:pn(val('honf-bruto')),cc:val('honf-cc'),cuentaGasto:val('honf-gasto'),tipoRetencion,tasaRetencion,retencion:Math.round(pn(val('honf-bruto'))*tasaRetencion)});
  }
  const pagar=!!document.getElementById('honf-pagar')?.checked;
  if(pagar){h.modalidad='contado';h.fechaPago=val('honf-fecha-pago');h.cuentaPago=val('honf-cuenta-pago');}else h.modalidad='pendiente';
  if(!h.fecha||!h.numero||!h.nombre||!h.rut||!(h.bruto>0)||!h.cuentaGasto){toast('⚠️ Completa fecha, número, prestador, RUT, bruto y cuenta de gasto','e');return;}
  if(!puedeOperarFecha(h.fecha)||pagar&&!puedeOperarFecha(h.fechaPago)){toast('🔒 La fecha pertenece a un período cerrado','e');return;}
  if(pagar&&(!h.fechaPago||!h.cuentaPago)){toast('⚠️ Completa fecha y cuenta de pago','e');return;}
  const dup=(S.honorarios||[]).find(x=>x.estado!=='anulado'&&x.id!==h.id&&String(x.numero)===String(h.numero)&&String(x.rut).replace(/\W/g,'')===String(h.rut).replace(/\W/g,''));
  if(dup){toast('⚠️ Ya existe una boleta con el mismo número y RUT','e');return;}
  const snapH=JSON.stringify(S.honorarios||[]),snapA=JSON.stringify(S.asientos||[]);
  try{
    if(!existente)S.honorarios.push(h);else Object.assign(existente,h);
    upsertAsientoHonorario(existente||h);
    await persistirClavesCritico([{key:'honorarios-'+S.empresa.anio,value:JSON.stringify(S.honorarios)},{key:'asientos-'+S.empresa.anio,value:JSON.stringify(S.asientos)}]);
    cerrarHonComprobante();renderHon();try{window.renderComprobantes&&window.renderComprobantes();}catch(e){}
    toast(pagar?'✅ Boleta reconocida y pago contabilizado por separado':'✅ Boleta contabilizada · pago pendiente');
  }catch(e){S.honorarios=JSON.parse(snapH);S.asientos=JSON.parse(snapA);toast('❌ '+(e.message||'No se pudo contabilizar')+'. No se aplicaron cambios.','e');}
}
function setHonCampo(){}
function uhon(){}
function addHon(){abrirHonComprobante();}
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
function anularHonDesdeComprobante(id){
  const i=(S.honorarios||[]).findIndex(h=>h.id===id);
  if(i<0){toast('⚠️ No se encontró la boleta de origen','e');return;}
  delHon(i);
}
async function saveHon(){
  const bloqueado=(S.honorarios||[]).some(h=>h.estado!=='anulado'&&!puedeOperarFecha(h.fecha));
  if(bloqueado){toast('🔒 Hay honorarios del formulario en un período cerrado. Reabre el período antes de guardar.','e');return;}
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

export {renderHon,setHonCampo,uhon,addHon,delHon,saveHon,abrirHonComprobante,cerrarHonComprobante,actualizarPreviewHon,guardarHonComprobante,anularHonDesdeComprobante,seleccionarPrestadorHon};
