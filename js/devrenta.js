import {toast, fmtC, PDC, pdcNm} from './core.js';
import {S} from './state.js';
import {puedeEditar} from './auth.js';
import {calcularRenta, cargarRenta} from './renta.js';
import {proxFolioAsiento} from './asientos.js';
import {persistirAsientosCritico} from './contabilidad-v2.js';
import {updateHdr} from './empresa.js';

// ═══════════════════════════════════════════════════════════════════════
// DEVOLUCIÓN DE RENTA (resultado del F22)
// ═══════════════════════════════════════════════════════════════════════
// Durante el año los PPM se cargan a 1108001 y quedan ahí como activo. Al presentar el F22 se
// determina el impuesto de primera categoría del ejercicio y, contra los PPM reajustados y los
// créditos, resulta una devolución o un pago. El asiento se hace cuando la plata se mueve:
//
//   Devolución:  Banco (debe) + Impuesto 1ª cat. (debe) = PPM (haber) + Corrección monetaria (haber)
//   A pagar:     Impuesto 1ª cat. (debe) = PPM (haber) + Banco (haber) + Corrección monetaria (haber)
//
// El F22 del año comercial N se cobra en N+1, así que el asiento se registra en el año abierto
// (N+1) y descarga el saldo de PPM que viene en su apertura.

const CUENTAS_F22={ppm:'1108001',impuesto:'3601001',correccion:'3501001'};
const claveF22=anio=>'f22-'+anio;
const F22_DEFAULT=anio=>({anio,modo:'devolucion',idpc:0,ppmReajustado:0,solicitado:0,ppmContable:0,
  monto:0,fecha:'',cuentaBanco:'',folio:'',fechaPresentacion:'',notas:'',asientoId:''});

let F22={},F22_ANIO=0;

async function cargarF22(anio){
  F22=F22_DEFAULT(anio);
  try{
    const r=await window.storage.get(claveF22(anio));
    if(r&&r.value){const p=JSON.parse(r.value);if(p&&typeof p==='object')F22={...F22_DEFAULT(anio),...p,anio};}
  }catch(e){}
  F22_ANIO=anio;
  return F22;
}
function guardarF22Datos(){
  return window.storage.set(claveF22(F22.anio),JSON.stringify(F22));
}

// Saldo contable (debe − haber) de una cuenta en el año abierto, incluida la apertura.
function saldoCuentaF22(cd){
  let s=0;
  (S.asientos||[]).forEach(a=>{
    if(a.anulado)return;
    (a.movs||[]).forEach(m=>{if(String(m.cd)===cd)s+=(+m.debe||0)-(+m.haber||0);});
  });
  return Math.round(s);
}

/** Líneas del asiento. La diferencia que queda es el reajuste de los PPM. */
function asientoF22(d){
  const at=d.anio+1;
  const monto=Math.abs(Math.round(+d.monto||0));
  const idpc=Math.max(0,Math.round(+d.idpc||0));
  const ppm=Math.max(0,Math.round(+d.ppmContable||0));
  const devolucion=d.modo!=='pago';
  const movs=[];
  const agregar=(cd,m,lado,glosa)=>{if(cd&&m>0)movs.push({cd,nm:(typeof pdcNm==='function'?pdcNm(cd):''),debe:lado==='debe'?m:0,haber:lado==='haber'?m:0,glosa});};
  agregar(d.cuentaBanco,monto,devolucion?'debe':'haber',
    devolucion?('Devolución de renta AT '+at+' recibida'):('Pago de impuesto a la renta AT '+at));
  agregar(CUENTAS_F22.impuesto,idpc,'debe','Impuesto 1ª categoría año comercial '+d.anio+' (F22 AT '+at+')');
  agregar(CUENTAS_F22.ppm,ppm,'haber','PPM año comercial '+d.anio+' aplicados al F22 AT '+at);
  const dif=movs.reduce((s,m)=>s+m.debe-m.haber,0);
  if(dif!==0)agregar(CUENTAS_F22.correccion,Math.abs(dif),dif>0?'haber':'debe','Reajuste de PPM del F22 AT '+at);
  const debe=movs.reduce((s,m)=>s+m.debe,0),haber=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,debe,haber,cuadra:debe===haber&&debe>0,reajuste:dif,
    glosa:(devolucion?'Devolución de renta AT ':'Pago de impuesto a la renta AT ')+at+' (año comercial '+d.anio+')'+(d.folio?' · F22 folio '+d.folio:'')};
}

/** Avisos antes de generar: no bloquean, pero conviene revisarlos. */
function revisarF22(d){
  const a=[],r=asientoF22(d);
  const monto=Math.abs(Math.round(+d.monto||0)),ppm=Math.max(0,Math.round(+d.ppmContable||0));
  if(!d.cuentaBanco)a.push('Elige la cuenta de banco donde entró (o desde donde salió) el dinero.');
  if(!d.fecha)a.push('Indica la fecha de la transferencia.');
  if(!monto)a.push('Indica el monto transferido.');
  if(!ppm)a.push('No hay saldo de PPM (cuenta '+CUENTAS_F22.ppm+') para descargar: revisa el año y el saldo.');
  const esperado=Math.abs(Math.round(+d.solicitado||0));
  if(esperado&&monto&&Math.abs(monto-esperado)>=1)
    a.push('Lo transferido ('+fmtC(monto)+') no coincide con el F22 ('+fmtC(esperado)+'). Si Tesorería retuvo parte por una deuda, la diferencia queda en corrección monetaria: revísala.');
  if(ppm&&Math.abs(r.reajuste)>ppm*0.2)
    a.push('La diferencia que va a corrección monetaria es muy alta para ser sólo reajuste. Revisa el impuesto determinado y el saldo de PPM.');
  if(!r.cuadra)a.push('El asiento no cuadra con estos datos.');
  return a;
}

// ═══ Pantalla ═══
const escF22=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function renderDevRenta(){
  const cont=document.getElementById('devrenta-content');
  if(!cont)return;
  const abierto=+S.empresa.anio;                 // año en que se registra el asiento
  const anio=F22_ANIO||(abierto-1);              // año comercial del F22
  if(F22_ANIO!==anio)await cargarF22(anio);
  // Si está en blanco y el año comercial es el año abierto, se precarga desde la declaración de renta.
  if(!F22.idpc&&!F22.ppmReajustado&&anio===abierto&&typeof calcularRenta==='function'){
    try{
      await cargarRenta(anio);
      const R=calcularRenta();
      F22.idpc=Math.round(R.idpcNeto||0);
      F22.ppmReajustado=Math.round(R.ppmReajustado||0);
      F22.modo=(R.aPagar>0)?'pago':'devolucion';
      F22.solicitado=Math.round((R.aPagar>0?R.aPagar:R.devolucion)||0);
    }catch(e){}
  }
  if(!F22.ppmContable)F22.ppmContable=Math.max(0,saldoCuentaF22(CUENTAS_F22.ppm));

  const at=anio+1;
  const a=asientoF22(F22);
  const avisos=revisarF22(F22);
  const dev=F22.modo!=='pago';
  const esc=puedeEditar('renta');
  const bancos=(typeof PDC!=='undefined'?PDC:[]).filter(c=>String(c.cd).length===7&&String(c.cd).startsWith('1101')).map(c=>c.cd).sort();
  const yaHecho=(S.asientos||[]).find(x=>x.id===F22.asientoId&&!x.anulado);
  const anios=[];for(let y=abierto;y>=abierto-7;y--)anios.push(y);

  cont.innerHTML=`
  <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:12px">
    <div style="font-size:12px;color:var(--mut)">
      El asiento se registra en el año abierto <b>${abierto}</b> y descarga el saldo de PPM que hay en él.
      ${anio!==abierto-1?'':'Por defecto se trabaja el F22 del año comercial anterior.'}
    </div>
    <div class="grp" style="min-width:160px"><label>Año comercial del F22</label>
      <select id="f22-anio">${anios.map(y=>`<option value="${y}"${y===anio?' selected':''}>${y} (AT ${y+1})</option>`).join('')}</select></div>
  </div>

  ${yaHecho?`<div class="info-tip" style="margin-bottom:12px;background:rgba(46,160,67,.12);border-color:var(--ach)">✅ Ya está contabilizado: asiento N°${yaHecho.n} del ${yaHecho.fecha}. Para rehacerlo, anúlalo primero en el Libro Diario.</div>`:''}

  <div class="card" style="margin-bottom:12px">
    <div class="card-t">1 · Lo que dice el F22 presentado</div>
    <div style="font-size:12px;color:var(--mut);margin-bottom:10px">
      ${anio===abierto?'Precargado desde la Declaración de Renta de este año.':'Guardado para el año comercial '+anio+'. Si está en blanco, escribe las cifras del F22 presentado.'}
      Corrige lo que haga falta para que calce con el F22 que presentaste al SII.
    </div>
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <div class="grp" style="width:210px"><label>Impuesto 1ª categoría determinado</label>
        <input type="number" id="f22-idpc" value="${F22.idpc||0}" ${esc?'':'disabled'}><small style="color:var(--mut)">Ya descontados los créditos</small></div>
      <div class="grp" style="width:200px"><label>PPM reajustados (cód. 36)</label>
        <input type="number" id="f22-ppmr" value="${F22.ppmReajustado||0}" ${esc?'':'disabled'}></div>
      <div class="grp" style="width:170px"><label>Resultado</label>
        <select id="f22-modo" ${esc?'':'disabled'}>
          <option value="devolucion"${dev?' selected':''}>Devolución</option>
          <option value="pago"${dev?'':' selected'}>Impuesto a pagar</option></select></div>
      <div class="grp" style="width:210px"><label>${dev?'Devolución solicitada (cód. 87)':'Impuesto a pagar'}</label>
        <input type="number" id="f22-sol" value="${F22.solicitado||0}" ${esc?'':'disabled'}></div>
      <div class="grp" style="width:150px"><label>Folio del F22</label>
        <input type="text" id="f22-folio" value="${escF22(F22.folio)}" maxlength="40" ${esc?'':'disabled'}></div>
      <div class="grp" style="width:170px"><label>Fecha de presentación</label>
        <input type="date" id="f22-fpres" value="${escF22(F22.fechaPresentacion)}" ${esc?'':'disabled'}></div>
    </div>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="card-t">2 · La transferencia</div>
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <div class="grp" style="width:170px"><label>Fecha ${dev?'del depósito':'del pago'}</label>
        <input type="date" id="f22-fecha" value="${escF22(F22.fecha)}" ${esc?'':'disabled'}></div>
      <div class="grp" style="width:200px"><label>Monto ${dev?'recibido':'pagado'}</label>
        <input type="number" id="f22-monto" value="${F22.monto||0}" ${esc?'':'disabled'}></div>
      <div class="grp" style="min-width:260px"><label>Cuenta de banco</label>
        <select id="f22-banco" ${esc?'':'disabled'}>
          <option value="">Elige una cuenta…</option>
          ${bancos.map(cd=>`<option value="${cd}"${cd===F22.cuentaBanco?' selected':''}>${cd} · ${escF22(pdcNm(cd))}</option>`).join('')}</select></div>
      <div class="grp" style="width:210px"><label>Saldo de PPM a descargar</label>
        <input type="number" id="f22-ppmc" value="${F22.ppmContable||0}" ${esc?'':'disabled'}>
        <small style="color:var(--mut)">Cuenta ${CUENTAS_F22.ppm} en ${abierto}: ${fmtC(saldoCuentaF22(CUENTAS_F22.ppm))}</small></div>
    </div>
    <div class="grp" style="margin-top:10px"><label>Notas</label>
      <textarea id="f22-notas" rows="2" ${esc?'':'disabled'}>${escF22(F22.notas)}</textarea></div>
  </div>

  <div class="card">
    <div class="card-t">3 · Asiento que se va a generar</div>
    <table class="tbl"><thead><tr><th>Cuenta</th><th>Detalle</th><th class="r">Debe</th><th class="r">Haber</th></tr></thead>
    <tbody>${a.movs.length?a.movs.map(m=>`<tr>
      <td class="num">${m.cd} <span style="color:var(--mut)">${escF22(m.nm)}</span></td>
      <td>${escF22(m.glosa)}</td>
      <td class="r num">${m.debe?fmtC(m.debe):''}</td>
      <td class="r num">${m.haber?fmtC(m.haber):''}</td></tr>`).join('')
      :'<tr><td colspan="4" style="text-align:center;color:var(--mut);padding:12px">Completa los datos de la transferencia.</td></tr>'}</tbody>
    ${a.movs.length?`<tfoot><tr style="font-weight:700"><td colspan="2">${a.cuadra?'Cuadra':'No cuadra'}</td>
      <td class="r num">${fmtC(a.debe)}</td><td class="r num">${fmtC(a.haber)}</td></tr></tfoot>`:''}</table>
    ${a.reajuste!==0?`<div style="font-size:11px;color:var(--mut);margin-top:8px">El reajuste de los PPM (${fmtC(Math.abs(a.reajuste))}) va a ${CUENTAS_F22.correccion} Corrección monetaria, porque el SII devuelve los PPM reajustados y la contabilidad los tiene a valor histórico.</div>`:''}
    ${avisos.length?`<div class="info-tip" style="margin-top:10px;background:rgba(210,153,34,.10);border-color:var(--warn)"><ul style="margin:0;padding-left:18px">${avisos.map(x=>`<li>${escF22(x)}</li>`).join('')}</ul></div>`:''}
    ${esc?`<div class="row" style="gap:8px;margin-top:12px">
      <button class="btn" onclick="guardarSoloF22()">💾 Guardar sin contabilizar</button>
      <button class="btn btn-g" onclick="generarAsientoF22()" ${(!a.cuadra||yaHecho)?'disabled':''}>📝 Generar asiento del F22 AT ${at}</button>
    </div>`:''}
  </div>`;

  // Cada campo actualiza el estado y vuelve a dibujar (para ver el asiento al tiro).
  const liga=(id,campo,num)=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('change',()=>{
      F22[campo]=num?Math.max(0,Math.round(+el.value||0)):el.value;
      if(campo!=='anio')guardarF22Datos().catch(()=>{});
      renderDevRenta();
    });
  };
  liga('f22-idpc','idpc',true);liga('f22-ppmr','ppmReajustado',true);liga('f22-sol','solicitado',true);
  liga('f22-monto','monto',true);liga('f22-ppmc','ppmContable',true);
  liga('f22-modo','modo');liga('f22-folio','folio');liga('f22-fpres','fechaPresentacion');
  liga('f22-fecha','fecha');liga('f22-banco','cuentaBanco');liga('f22-notas','notas');
  const sa=document.getElementById('f22-anio');
  if(sa)sa.addEventListener('change',async()=>{await cargarF22(+sa.value);renderDevRenta();});
}

async function guardarSoloF22(){
  try{await guardarF22Datos();toast('✅ Datos del F22 guardados');}
  catch(e){toast('❌ No se pudieron guardar los datos','e');}
}

async function generarAsientoF22(){
  if(!puedeEditar('renta')){toast('⚠️ No tienes permiso para contabilizar','e');return;}
  const a=asientoF22(F22);
  if(!a.cuadra){toast('⚠️ El asiento no cuadra con estos datos','e');return;}
  if(!F22.fecha){toast('⚠️ Indica la fecha de la transferencia','e');return;}
  if(!F22.cuentaBanco){toast('⚠️ Elige la cuenta de banco','e');return;}
  const ya=(S.asientos||[]).find(x=>x.id===F22.asientoId&&!x.anulado);
  if(ya){toast('⚠️ Ya existe el asiento N°'+ya.n+' para este F22. Anúlalo para rehacerlo','e');return;}
  const id='f22-'+F22.anio+'-'+Date.now();
  const folio=proxFolioAsiento();
  const r=await persistirAsientosCritico(()=>{S.asientos.push({id,n:folio,fecha:F22.fecha,glosa:a.glosa,
    movs:a.movs,tipo:'tributario',origenAuto:'f22',anioF22:F22.anio,creadoEn:new Date().toISOString()});});
  if(!r.ok){toast('❌ No se pudo guardar el asiento. La operación NO se contabilizó.','e');return;}
  F22.asientoId=id;
  try{await guardarF22Datos();}catch(e){}
  toast('✅ Asiento N°'+folio+' generado ('+fmtC(Math.abs(F22.monto))+')');
  renderDevRenta();if(typeof updateHdr==='function')updateHdr();
}

export {renderDevRenta, guardarSoloF22, generarAsientoF22, cargarF22, asientoF22, revisarF22, CUENTAS_F22};
