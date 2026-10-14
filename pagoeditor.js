// pagoeditor.js — Editor dedicado del comprobante de pago / cobro.
//
// Un comprobante de pago agrupa documentos de un proveedor o cliente: cada
// línea afecta la cuenta del auxiliar (referenciando el documento) y una única
// línea de banco/caja cierra el asiento. Este editor entiende esa estructura:
//   - Agregar/quitar documentos (siempre referenciados por su docId).
//   - Elegir el tipo de movimiento por línea: ABONO (reduce el saldo, ej. un
//     pago) o CARGO (aumenta el saldo, ej. un ajuste o nota de débito).
//   - Ajustar montos, cambiar la cuenta de banco/caja, la fecha y la glosa.
// La línea de banco/caja se recalcula sola como el neto que cuadra el asiento.

import {S} from './state.js';
import {toast, fmtC, pdcNm, today, dteC, dteV, esDteHonorario, rutFmt, pn, PDC} from './core.js';
import {pagosDocumento} from './motor-contable.js';
import {persistirAsientosCritico, ejercicioCerrado, puedeOperarFecha} from './contabilidad-v2.js';
import {validarMovimientosPDC} from './pdc-reglas.js';
import {logAccion, logCambio} from './firebase.js';
import {rerender} from './ui.js';

let PE={asientoId:null,tipo:'proveedor',fecha:'',cuentaPago:'',glosa:'',lineas:[]};

const dteNombre=(t,tipo)=>((tipo==='cliente'?dteV(t):dteC(t))?.nm)||('DTE '+t);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

function cuentasPagoOpts(sel=''){
  const cs=PDC.filter(c=>c.cd&&String(c.cd).startsWith('1101')&&c.tp==='A'&&c.activa!==false);
  return '<option value="">— seleccionar cuenta —</option>'+cs.map(c=>`<option value="${c.cd}"${sel===c.cd?' selected':''}>${c.cd} — ${c.nm}</option>`).join('');
}

// Cuenta del auxiliar según el tipo del pago y el documento (honorarios usan
// Honorarios por Pagar 2102006).
function cuentaAuxDe(tipoDTE){
  if(PE.tipo==='cliente')return '1104001';
  return esDteHonorario(tipoDTE)?'2102006':'2102001';
}

function docsDelTipo(){
  const arr=PE.tipo==='cliente'?S.ventas:S.compras;
  return (arr||[]).filter(d=>d.estado!=='anulado');
}
function saldoDoc(d){
  const signo=(PE.tipo==='cliente'?dteV(d.tipoDTE):dteC(d.tipoDTE))?.signo||1;
  const total=(d.total||0)*signo;
  const pagado=pagosDocumento(d,PE.tipo,S.asientos).reduce((s,p)=>s+(p.monto||0),0);
  return {total,pagado,saldo:total-pagado};
}

// ── Apertura ──
export function abrirEditorPago(asientoId){
  const a=(S.asientos||[]).find(x=>x.id===asientoId&&x.tipo==='pago');
  if(!a){toast('⚠️ No se encontró el comprobante de pago','e');return;}
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reábrelo para editar pagos.','e');return;}
  const tipo=(a.documentos&&a.documentos[0]&&a.documentos[0].tipo)||
    ((a.movs||[]).some(m=>m.cd==='1104001')?'cliente':'proveedor');
  PE={asientoId,tipo,fecha:a.fecha||today(),cuentaPago:a.cuentaPago||'',glosa:a.glosa||'',lineas:[]};
  const arr=tipo==='cliente'?S.ventas:S.compras;
  // Reconstruir las líneas desde documentos[] (la fuente de verdad del vínculo).
  const refs=Array.isArray(a.documentos)&&a.documentos.length?a.documentos:null;
  if(refs){
    refs.forEach(r=>{
      const d=(arr||[]).find(x=>x.id===r.docId)||{};
      const monto=Number(r.monto)||0;
      PE.lineas.push({docId:r.docId,rutCodigo:d.rutCodigo||'',rutDV:d.rutDV||'',razonSocial:d.razonSocial||'',
        tipoDTE:d.tipoDTE||'',numero:d.numero||'',direccion:monto<0?'cargo':'abono',monto:Math.abs(monto)});
    });
  }else{
    // Respaldo: derivar de las líneas de auxiliar del asiento.
    (a.movs||[]).forEach(m=>{
      if(!m.docId||!(m.cd==='2102001'||m.cd==='2102006'||m.cd==='1104001'))return;
      const d=(arr||[]).find(x=>x.id===m.docId)||{};
      const esAbono=tipo==='proveedor'?(m.debe>0):(m.haber>0);
      PE.lineas.push({docId:m.docId,rutCodigo:m.rutCodigo||d.rutCodigo||'',rutDV:m.rutDV||d.rutDV||'',razonSocial:d.razonSocial||'',
        tipoDTE:m.tipoDTE||d.tipoDTE||'',numero:m.folio||d.numero||'',direccion:esAbono?'abono':'cargo',monto:(m.debe||0)+(m.haber||0)});
    });
  }
  if(!PE.cuentaPago){const b=(a.movs||[]).find(m=>String(m.cd).startsWith('1101'));if(b)PE.cuentaPago=b.cd;}
  asegurarModal();
  render();
  document.getElementById('pe-modal').classList.add('open');
}

export function cerrarEditorPago(){const m=document.getElementById('pe-modal');if(m)m.classList.remove('open');}

function asegurarModal(){
  if(document.getElementById('pe-modal'))return;
  const div=document.createElement('div');
  div.id='pe-modal';div.className='modal-bkd';div.style.zIndex='1060';
  div.innerHTML=`<div class="modal-box" style="max-width:720px">
    <div class="modal-hdr"><div><div class="modal-title">✏️ Editar comprobante de pago</div>
      <div class="modal-sub" id="pe-sub"></div></div>
      <button class="modal-close" onclick="cerrarEditorPago()">✕</button></div>
    <div id="pe-body"></div></div>`;
  document.body.appendChild(div);
}

// ── Render ──
function render(){
  const sub=document.getElementById('pe-sub');
  if(sub)sub.textContent=PE.tipo==='proveedor'?'Pago a proveedores':'Cobro a clientes';
  const body=document.getElementById('pe-body');if(!body)return;
  const esProv=PE.tipo==='proveedor';
  body.innerHTML=`
    <div style="padding:14px 16px">
      <div class="fg">
        <div class="grp"><label>Fecha</label><input type="date" value="${PE.fecha}" oninput="peCampo('fecha',this.value)"></div>
        <div class="grp full"><label>${esProv?'Cuenta de origen':'Cuenta de destino'} (caja / banco)</label>
          <select onchange="peCampo('cuentaPago',this.value)">${cuentasPagoOpts(PE.cuentaPago)}</select></div>
      </div>
      <div class="grp full" style="margin-top:8px"><label>Glosa</label>
        <input type="text" value="${(PE.glosa||'').replace(/"/g,'&quot;')}" oninput="peCampo('glosa',this.value)"></div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--bd)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600">Documentos del comprobante</div>
          <span style="font-size:10px;color:var(--mt)">Abono reduce el saldo · Cargo lo aumenta</span>
        </div>
        <div class="tw"><table style="font-size:11px;width:100%">
          <thead><tr>
            <th class="tl">DOCUMENTO</th><th class="tl" style="width:110px">MOVIMIENTO</th>
            <th style="width:130px;text-align:right">MONTO</th><th style="width:34px"></th>
          </tr></thead>
          <tbody id="pe-lineas"></tbody>
        </table></div>

        <div style="position:relative;margin-top:8px">
          <input type="text" id="pe-pick" autocomplete="off" placeholder="➕ Agregar documento: busca por razón social, RUT o folio…"
            oninput="pePickBuscar(this.value)" onfocus="pePickBuscar(this.value)" onblur="setTimeout(pePickCerrar,160)" style="width:100%">
          <div id="pe-pick-ac" class="ac-lista" style="display:none"></div>
        </div>
      </div>

      <div id="pe-tot" style="margin-top:12px;background:var(--sf2);border-radius:6px;padding:10px 14px;font-size:12px"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button class="btn btn-g" onclick="cerrarEditorPago()">Cancelar</button>
        <button class="btn btn-p" onclick="guardarEditorPago()">💾 Guardar cambios</button>
      </div>
    </div>`;
  renderLineas();
}

function renderLineas(){
  const box=document.getElementById('pe-lineas');if(!box)return;
  if(!PE.lineas.length){
    box.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--mt);padding:14px">Sin documentos. Agrega al menos uno abajo.</td></tr>`;
    peTotales();return;
  }
  box.innerHTML=PE.lineas.map((l,i)=>`<tr>
    <td class="tl">${(l.razonSocial||'(sin razón social)').replace(/</g,'&lt;')}
      <div style="color:var(--mt);font-size:10px">${dteNombre(l.tipoDTE,PE.tipo)} N°${l.numero||''} · ${rutFmt(l.rutCodigo,l.rutDV)}</div></td>
    <td class="tl"><select onchange="peLineaCampo(${i},'direccion',this.value)">
      <option value="abono"${l.direccion==='abono'?' selected':''}>Abono (−)</option>
      <option value="cargo"${l.direccion==='cargo'?' selected':''}>Cargo (+)</option>
    </select></td>
    <td style="text-align:right"><input type="number" min="0" value="${l.monto||''}" style="width:120px;text-align:right"
      oninput="peLineaCampo(${i},'monto',this.value)"></td>
    <td><button class="btn btn-d" style="padding:4px 8px" onclick="peDelLinea(${i})" title="Quitar">✕</button></td>
  </tr>`).join('');
  peTotales();
}

function peTotales(){
  const box=document.getElementById('pe-tot');if(!box)return;
  const {neto,esSalida}=netoCaja();
  const esProv=PE.tipo==='proveedor';
  const lbl=esSalida?(esProv?'Sale de caja/banco':'Sale de caja/banco'):(esProv?'Entra a caja/banco':'Entra a caja/banco');
  box.innerHTML=`<div style="display:flex;justify-content:space-between">
    <span style="color:var(--mt)">Neto de banco/caja (se recalcula solo)</span>
    <b style="color:${esSalida?'var(--err)':'var(--ach)'}">${fmtC(Math.abs(neto))} · ${lbl}</b></div>`;
}

// Neto que cerrará el asiento: suma con signo del efecto de las líneas sobre la
// caja. Un abono a proveedor = salida de caja; un cargo = entrada.
function netoCaja(){
  let salida=0;
  PE.lineas.forEach(l=>{
    const m=pn(l.monto);if(!m)return;
    if(PE.tipo==='proveedor')salida+=l.direccion==='abono'?m:-m;
    else salida-=l.direccion==='abono'?m:-m;   // cobro: abono cliente = entrada
  });
  // Para proveedores 'salida' positivo = sale caja. Para clientes lo invertimos
  // para que positivo también signifique salida y negativo entrada.
  const neto=PE.tipo==='proveedor'?salida:salida;
  return {neto,esSalida:neto>=0};
}

// ── Acciones de edición ──
export function peCampo(campo,val){PE[campo]=val;if(campo==='cuentaPago')return;}
export function peLineaCampo(i,campo,val){
  if(!PE.lineas[i])return;
  PE.lineas[i][campo]=campo==='monto'?pn(val):val;
  peTotales();   // sin re-render para no perder foco en el monto
}
export function peDelLinea(i){PE.lineas.splice(i,1);renderLineas();}

// ── Buscador para agregar documentos ──
export function pePickBuscar(q){
  const box=document.getElementById('pe-pick-ac');if(!box)return;
  const t=norm(q).trim();
  let arr=docsDelTipo().map(d=>({d,s:saldoDoc(d)}));
  if(t){
    const pal=t.split(/\s+/);
    arr=arr.filter(({d})=>{const hay=norm(`${d.rutCodigo||''} ${rutFmt(d.rutCodigo,d.rutDV)} ${d.razonSocial||''} ${d.numero||''}`);return pal.every(p=>hay.includes(p));});
  }
  // Priorizar los que tienen saldo pendiente
  arr.sort((a,b)=>(Math.abs(b.s.saldo)>1?1:0)-(Math.abs(a.s.saldo)>1?1:0)||(a.d.razonSocial||'').localeCompare(b.d.razonSocial||''));
  arr=arr.slice(0,30);
  if(!arr.length){box.innerHTML='<div class="ac-item" style="color:var(--mt)">Sin documentos que coincidan</div>';box.style.display='';return;}
  box.innerHTML=arr.map(({d,s})=>`<div class="ac-item" onmousedown="pePickAdd('${d.id}')">
    <b>${(d.razonSocial||'(sin razón social)').replace(/</g,'&lt;')}</b>
    <span style="color:var(--mt);font-size:10px;margin-left:6px">${dteNombre(d.tipoDTE,PE.tipo)} N°${d.numero||''} · saldo ${fmtC(s.saldo)}</span></div>`).join('');
  box.style.display='';
}
export function pePickCerrar(){const b=document.getElementById('pe-pick-ac');if(b)b.style.display='none';}
export function pePickAdd(docId){
  const arr=PE.tipo==='cliente'?S.ventas:S.compras;
  const d=(arr||[]).find(x=>x.id===docId);if(!d){pePickCerrar();return;}
  const s=saldoDoc(d);
  PE.lineas.push({docId:d.id,rutCodigo:d.rutCodigo||'',rutDV:d.rutDV||'',razonSocial:d.razonSocial||'',
    tipoDTE:d.tipoDTE||'',numero:d.numero||'',direccion:'abono',monto:Math.max(0,Math.round(s.saldo))});
  const inp=document.getElementById('pe-pick');if(inp)inp.value='';
  pePickCerrar();
  renderLineas();
}

// ── Construcción del asiento ──
function construirMovs(){
  const movs=[],documentos=[];
  PE.lineas.forEach(l=>{
    const monto=Math.round(pn(l.monto));if(!monto||!l.docId)return;
    const cd=cuentaAuxDe(l.tipoDTE);
    const desc=`${l.razonSocial||''} · ${dteNombre(l.tipoDTE,PE.tipo)} N°${l.numero||''}`.trim();
    let debe=0,haber=0;
    if(PE.tipo==='proveedor'){ if(l.direccion==='abono')debe=monto; else haber=monto; }
    else { if(l.direccion==='abono')haber=monto; else debe=monto; }
    movs.push({cd,nm:pdcNm(cd),desc,debe,haber,rutCodigo:l.rutCodigo,rutDV:l.rutDV,folio:l.numero,tipoDTE:l.tipoDTE,docId:l.docId});
    documentos.push({docId:l.docId,monto:l.direccion==='abono'?monto:-monto,tipo:PE.tipo});
  });
  const sumD=movs.reduce((s,m)=>s+m.debe,0),sumH=movs.reduce((s,m)=>s+m.haber,0);
  const dif=Math.round(sumD-sumH);
  const cd=PE.cuentaPago,desc=`${PE.lineas.length} ${PE.tipo==='proveedor'?'pagos a proveedores':'cobros a clientes'}`;
  if(dif>0)movs.push({cd,nm:pdcNm(cd),desc,debe:0,haber:dif});
  else if(dif<0)movs.push({cd,nm:pdcNm(cd),desc,debe:-dif,haber:0});
  return {movs,documentos};
}

export async function guardarEditorPago(){
  if(!PE.fecha){toast('⚠️ Ingresa la fecha','e');return;}
  if(!puedeOperarFecha(PE.fecha)){toast('🔒 El período de esa fecha está cerrado.','e');return;}
  if(!PE.cuentaPago){toast('⚠️ Selecciona la cuenta de banco/caja','e');return;}
  const lineasValidas=PE.lineas.filter(l=>l.docId&&pn(l.monto)>0);
  if(!lineasValidas.length){toast('⚠️ Agrega al menos un documento con monto','e');return;}
  const {movs,documentos}=construirMovs();
  if(movs.length<2){toast('⚠️ El comprobante necesita al menos el banco y un documento','e');return;}
  const vp=validarMovimientosPDC(movs);
  if(!vp.ok){toast('❌ '+vp.errores[0],'e');return;}
  const a=(S.asientos||[]).find(x=>x.id===PE.asientoId&&x.tipo==='pago');
  if(!a){toast('⚠️ No se encontró el comprobante','e');return;}
  const antes=JSON.parse(JSON.stringify(a));

  const r=await persistirAsientosCritico(()=>{
    a.fecha=PE.fecha;a.glosa=PE.glosa||a.glosa;a.cuentaPago=PE.cuentaPago;
    a.movs=movs;a.documentos=documentos;a.actualizadoEn=new Date().toISOString();
  });
  if(!r.ok){
    const mo=String(r.motivo||'');
    toast(mo.startsWith('validacion-contable')?('❌ '+mo):('❌ No se pudo guardar. ('+(mo||'motivo desconocido')+')'),'e');
    return;
  }
  logAccion('Editó comprobante de pago',`${a.glosa||''} · ${documentos.length} doc`);
  logCambio('Editó pago',{entidad:'asiento',id:a.id,antes,despues:a,meta:{numeroContable:a.numeroContable,documentos:documentos.length}});
  toast('✅ Comprobante de pago actualizado');
  cerrarEditorPago();
  rerender();
}
