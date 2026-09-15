// honorariodoc.js — Ingreso de boletas de honorarios como documento de proveedor.
//
// Reemplaza el módulo separado de Honorarios: la boleta se guarda en S.compras
// con un tipo de documento propio (70 con retención / 71 sin retención) y se
// contabiliza contra Honorarios por Pagar (2102006). Así queda como un
// documento más del proveedor: comparte ficha auxiliar, es pagable desde
// "Pagos y Cobros" y aparece en el estado de cuenta con su saldo por documento.
//
// El gasto se puede repartir en varias cuentas (asesorías, gastos notariales,
// servicios personales, etc.), igual que en una compra. La retención se calcula
// sobre el bruto y el líquido es lo que se paga al prestador.
//
// Se abre desde Comprobantes ("📝 Nuevo honorario"). No lleva IVA ni entra al
// Libro de Compras / F29 de compras.

import {S} from './state.js';
import {toast, fmtC, pn, today, rutParse, rutFmt} from './core.js';
import {retencionHonorarios} from './indicadores.js';
import {guardarDocumentoContabilizado} from './contabilidad-v2.js';
import {fichasAux, guardarFichasAux} from './importadoraux.js';
import {ccOpts} from './centroscosto.js';
import {inputCuenta} from './buscadorcuentas.js';
import {abrirFichaAuxNueva} from './auxiliares.js';
import {rerender} from './ui.js';
import {logAccion} from './firebase.js';

const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

const uid=()=>`hon_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

// Distribución del gasto en edición: [{cuenta, monto, cc}]
let HD_DIST=[];



// Crea el modal en el DOM una sola vez.
function asegurarModal(){
  if(document.getElementById('hd-modal'))return;
  const div=document.createElement('div');
  div.id='hd-modal';
  div.className='modal-bkd';
  div.style.zIndex='1050';   // sobre la app, pero deja pasar por encima al editor de ficha
  div.innerHTML=`<div class="modal-box" style="max-width:620px">
    <div class="modal-hdr">
      <div><div class="modal-title">📝 Nuevo honorario</div>
        <div class="modal-sub">Se registra como documento del proveedor (prestador)</div></div>
      <button class="modal-close" onclick="cerrarNuevoHonorario()">✕</button>
    </div>
    <div id="hd-modal-body"></div>
  </div>`;
  document.body.appendChild(div);
}

export function abrirNuevoHonorario(){
  asegurarModal();
  HD_DIST=[{cuenta:'3202019',monto:0,cc:''}];
  const tasa=retencionHonorarios(S.empresa.anio);
  const body=document.getElementById('hd-modal-body');
  body.innerHTML=`
    <div style="padding:16px 18px">
      <div class="fg">
        <div class="grp"><label>Tipo</label>
          <select id="hd-tipo" onchange="hdRecalc()">
            <option value="70">Boleta con retención (${(tasa*100).toFixed(2)}%)</option>
            <option value="71">Boleta sin retención</option>
          </select></div>
        <div class="grp"><label>Fecha</label><input type="date" id="hd-fecha" value="${today()}"></div>
        <div class="grp"><label>N° boleta</label><input type="text" id="hd-folio" inputmode="numeric" placeholder="Folio"></div>
      </div>

      <div style="margin-top:6px;padding-top:10px;border-top:1px dashed var(--bd)">
        <div class="grp full" style="position:relative"><label>Prestador (busca por razón social, RUT o código)</label>
          <input type="text" id="hd-prov-search" autocomplete="off" placeholder="Escribe para buscar un prestador registrado…"
            oninput="hdProvBuscar(this.value)" onfocus="hdProvBuscar(this.value)" onkeydown="hdProvTecla(event)" onblur="setTimeout(hdProvCerrar,160)">
          <div id="hd-prov-ac" class="ac-lista" style="display:none"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 8px;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--mt)">O ingresa un prestador nuevo con su RUT:</span>
          <button class="btn btn-i" style="font-size:11px;padding:3px 8px" onclick="hdNuevoAuxiliar()" title="Crear la ficha del auxiliar (proveedor) con todos sus datos">➕ Crear ficha de auxiliar</button>
        </div>
        <div class="fg">
          <div class="grp rut-wrap"><label>RUT prestador</label>
            <input type="text" id="hd-rut" placeholder="12.345.678-9" oninput="hdRutInput(this.value)">
            <span class="rut-dv" id="hd-rutdv"></span></div>
          <div class="grp full"><label>Razón social / Nombre</label><input type="text" id="hd-rs" placeholder="Nombre del prestador"></div>
        </div>
        <div id="hd-rut-warn" style="font-size:11px;color:var(--err);margin-top:2px;display:none"></div>
      </div>

      <div class="grp" style="margin-top:6px;max-width:220px"><label>Monto bruto</label>
        <input type="number" id="hd-bruto" min="0" placeholder="0" oninput="hdRecalc()"></div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--bd)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600">Distribución del gasto</div>
          <button class="btn btn-i" style="font-size:11px;padding:3px 8px" onclick="hdAddDist()">➕ Agregar cuenta</button>
        </div>
        <div style="font-size:11px;color:var(--mt);margin-bottom:8px">Reparte el bruto en una o varias cuentas (asesorías, gastos notariales, servicios personales, etc.). El total debe igualar el bruto.</div>
        <div id="hd-dist-rows"></div>
        <div id="hd-dist-tot" style="font-size:12px;margin-top:6px;text-align:right"></div>
      </div>

      <div id="hd-preview" style="margin-top:12px;background:var(--sf2);border-radius:6px;padding:10px 14px;font-size:12px"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-g" onclick="cerrarNuevoHonorario()">Cancelar</button>
        <button class="btn btn-p" onclick="guardarNuevoHonorario()">💾 Guardar honorario</button>
      </div>
    </div>`;
  document.getElementById('hd-modal').classList.add('open');
  renderDistRows();
  hdRecalc();
}

export function cerrarNuevoHonorario(){
  const m=document.getElementById('hd-modal');
  if(m)m.classList.remove('open');
}

// ── Distribución del gasto ──
function renderDistRows(){
  const box=document.getElementById('hd-dist-rows');
  if(!box)return;
  box.innerHTML=HD_DIST.map((l,i)=>`
    <div style="border:1px solid var(--bd);border-radius:6px;padding:8px;margin-bottom:6px">
      <div class="grp full" style="margin:0"><label style="font-size:10px">Cuenta de gasto</label>
        ${inputCuenta({id:'hd-cta-'+i,value:l.cuenta||'',onPick:`hdDistCampo(${i},'cuenta','%CD%')`,placeholder:'Buscar por código o nombre…',filtro:'gasto',clase:'linea-inp'})}</div>
      <div class="fg" style="align-items:flex-end;gap:6px;margin-top:6px">
        <div class="grp" style="margin:0;max-width:150px"><label style="font-size:10px">Monto</label>
          <input type="number" min="0" value="${l.monto||''}" placeholder="0" oninput="hdDistCampo(${i},'monto',this.value)"></div>
        <div class="grp full" style="margin:0"><label style="font-size:10px">Centro de costo</label>
          <select onchange="hdDistCampo(${i},'cc',this.value)">${ccOpts(l.cc||'')}</select></div>
        <button class="btn btn-d" style="padding:6px 9px" onclick="hdDelDist(${i})" ${HD_DIST.length<=1?'disabled':''} title="Quitar línea">✕</button>
      </div>
    </div>`).join('');
  hdDistTotales();
}

function hdDistTotales(){
  const box=document.getElementById('hd-dist-tot');
  if(!box)return;
  const bruto=pn(document.getElementById('hd-bruto')?.value||0);
  const sum=HD_DIST.reduce((s,l)=>s+pn(l.monto),0);
  const dif=bruto-sum;
  const col=Math.abs(dif)<1?'var(--ach)':'var(--err)';
  box.innerHTML=`Distribuido: <b>${fmtC(sum)}</b> / Bruto: <b>${fmtC(bruto)}</b> · <span style="color:${col}">${Math.abs(dif)<1?'✓ cuadra':(dif>0?'falta '+fmtC(dif):'sobra '+fmtC(-dif))}</span>`;
}

export function hdAddDist(){HD_DIST.push({cuenta:'',monto:0,cc:''});renderDistRows();}
export function hdDelDist(i){if(HD_DIST.length<=1)return;HD_DIST.splice(i,1);renderDistRows();}
export function hdDistCampo(i,campo,val){
  if(!HD_DIST[i])return;
  HD_DIST[i][campo]=campo==='monto'?pn(val):val;
  if(campo==='monto')hdDistTotales();   // sin re-render: no perder foco
}

export function hdRutInput(val){
  const r=rutParse(val);
  const dv=document.getElementById('hd-rutdv');
  const warn=document.getElementById('hd-rut-warn');
  if(dv)dv.textContent=r.codigo?`-${r.dv}`:'';
  if(warn){
    if(r.codigo&&!r.valido){warn.textContent='⚠️ El dígito verificador no corresponde al RUT';warn.style.display='';}
    else warn.style.display='none';
  }
  if(r.codigo){
    const f=fichasAux('proveedor')[r.codigo];
    if(f&&f.razonSocial){const rs=document.getElementById('hd-rs');if(rs&&!rs.value)rs.value=f.razonSocial;}
  }
}

export function hdProvSel(rutCodigo){
  if(!rutCodigo)return;
  const f=fichasAux('proveedor')[rutCodigo];
  if(!f)return;
  const rut=document.getElementById('hd-rut'), rs=document.getElementById('hd-rs');
  if(rut)rut.value=rutFmt(f.rutCodigo,f.rutDV);
  hdRutInput(rutFmt(f.rutCodigo,f.rutDV));
  if(rs)rs.value=f.razonSocial||'';
  if(f.ccDefault&&HD_DIST[0])HD_DIST[0].cc=f.ccDefault;
  if(f.cuentaDefault&&HD_DIST[0])HD_DIST[0].cuenta=f.cuentaDefault;
  if(f.ccDefault||f.cuentaDefault)renderDistRows();
}

// ── Buscador dinámico de prestador (razón social, RUT o código del auxiliar) ──
let HD_PROV_RES=[], HD_PROV_SEL=0;
export function hdProvBuscar(q){
  const box=document.getElementById('hd-prov-ac');if(!box)return;
  const t=norm(q).trim();
  const f=fichasAux('proveedor')||{};
  let arr=Object.values(f);
  if(t){
    const palabras=t.split(/\s+/);
    arr=arr.filter(x=>{
      const hay=norm(`${x.rutCodigo||''} ${rutFmt(x.rutCodigo,x.rutDV)} ${x.razonSocial||''}`);
      return palabras.every(p=>hay.includes(p));
    });
  }
  arr=arr.sort((a,b)=>(a.razonSocial||'').localeCompare(b.razonSocial||'')).slice(0,30);
  HD_PROV_RES=arr; HD_PROV_SEL=0;
  if(!arr.length){
    box.innerHTML=`<div class="ac-item" style="color:var(--mt)">Sin coincidencias · ingresa el RUT abajo para un prestador nuevo</div>`;
    box.style.display='';return;
  }
  box.innerHTML=arr.map((x,i)=>`<div class="ac-item${i===0?' sel':''}" onmousedown="hdProvElegir('${x.rutCodigo}')">
    <b>${(x.razonSocial||'(sin nombre)').replace(/</g,'&lt;')}</b>
    <span style="color:var(--mt);font-family:var(--mono);font-size:11px;margin-left:6px">${rutFmt(x.rutCodigo,x.rutDV)}</span></div>`).join('');
  box.style.display='';
}
export function hdProvElegir(rutCodigo){
  hdProvSel(rutCodigo);
  const s=document.getElementById('hd-prov-search');
  const f=fichasAux('proveedor')[rutCodigo];
  if(s&&f)s.value=`${f.razonSocial||''} · ${rutFmt(f.rutCodigo,f.rutDV)}`;
  hdProvCerrar();
}
export function hdProvCerrar(){const b=document.getElementById('hd-prov-ac');if(b)b.style.display='none';}

// Abre el editor de ficha auxiliar (proveedor) para crear el prestador si no
// existe, precargando lo que ya escribió. Al guardar vuelve al honorario con
// el prestador seleccionado.
export function hdNuevoAuxiliar(){
  const rutInput=(document.getElementById('hd-rut')?.value||'').trim();
  const rs=(document.getElementById('hd-rs')?.value||'').trim();
  // El editor de ficha comparte el z-index base de los modales, y el modal del
  // honorario se inyecta al final del DOM, así que sin esto queda tapado.
  const fm=document.getElementById('ficha-modal');
  if(fm)fm.style.zIndex='1120';
  const restaurarZ=()=>{const f=document.getElementById('ficha-modal');if(f)f.style.zIndex='';};
  abrirFichaAuxNueva({tipo:'proveedor',rutInput,razonSocial:rs,onSaved:(ficha)=>{
    restaurarZ();
    hdProvSel(ficha.rutCodigo);
    const s=document.getElementById('hd-prov-search');
    if(s)s.value=`${ficha.razonSocial||''} · ${rutFmt(ficha.rutCodigo,ficha.rutDV)}`;
    hdProvCerrar();
    toast('✅ Auxiliar creado y seleccionado');
  }});
}
export function hdProvTecla(e){
  const box=document.getElementById('hd-prov-ac');
  if(!box||box.style.display==='none'||!HD_PROV_RES.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();HD_PROV_SEL=Math.min(HD_PROV_RES.length-1,HD_PROV_SEL+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();HD_PROV_SEL=Math.max(0,HD_PROV_SEL-1);}
  else if(e.key==='Enter'){e.preventDefault();const x=HD_PROV_RES[HD_PROV_SEL];if(x)hdProvElegir(x.rutCodigo);return;}
  else if(e.key==='Escape'){hdProvCerrar();return;}
  else return;
  [...box.querySelectorAll('.ac-item')].forEach((el,i)=>el.classList.toggle('sel',i===HD_PROV_SEL));
}

export function hdRecalc(){
  const box=document.getElementById('hd-preview');if(!box)return;
  const tipo=+(document.getElementById('hd-tipo')?.value||70);
  const bruto=pn(document.getElementById('hd-bruto')?.value||0);
  // Si hay una sola cuenta de gasto, su monto sigue al bruto automáticamente.
  if(HD_DIST.length===1){HD_DIST[0].monto=bruto;renderDistRows();}
  else hdDistTotales();
  const tasa=tipo===70?retencionHonorarios(S.empresa.anio):0;
  const ret=Math.round(bruto*tasa);
  const liq=bruto-ret;
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between"><span style="color:var(--mt)">Bruto</span><b>${fmtC(bruto)}</b></div>
    <div style="display:flex;justify-content:space-between"><span style="color:var(--mt)">Retención (${(tasa*100).toFixed(2)}%)</span><b style="color:var(--err)">${ret?'- '+fmtC(ret):fmtC(0)}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px solid var(--bd)">
      <span style="font-weight:700">Líquido a pagar</span><b style="color:var(--ach)">${fmtC(liq)}</b></div>`;
}

export async function guardarNuevoHonorario(){
  const tipo=+(document.getElementById('hd-tipo')?.value||70);
  const fecha=document.getElementById('hd-fecha')?.value||'';
  const folio=(document.getElementById('hd-folio')?.value||'').trim();
  const r=rutParse(document.getElementById('hd-rut')?.value||'');
  const rs=(document.getElementById('hd-rs')?.value||'').trim();
  const bruto=pn(document.getElementById('hd-bruto')?.value||0);

  if(!fecha){toast('⚠️ Ingresa la fecha','e');return;}
  if(!folio){toast('⚠️ Ingresa el N° de boleta','e');return;}
  if(!r.codigo){toast('⚠️ Ingresa el RUT del prestador','e');return;}
  if(!r.valido){toast('⚠️ El dígito verificador del RUT no es correcto','e');return;}
  if(!rs){toast('⚠️ Ingresa la razón social / nombre','e');return;}
  if(!(bruto>0)){toast('⚠️ El monto bruto debe ser mayor a 0','e');return;}

  // Distribución: cuentas válidas y suma igual al bruto (tolerancia $1).
  const dist=HD_DIST.filter(l=>l.cuenta&&pn(l.monto)>0).map(l=>({cuenta:l.cuenta,monto:Math.round(pn(l.monto)),cc:l.cc||''}));
  if(!dist.length){toast('⚠️ Agrega al menos una cuenta de gasto','e');return;}
  if(HD_DIST.some(l=>pn(l.monto)>0&&!l.cuenta)){toast('⚠️ Hay una línea con monto pero sin cuenta','e');return;}
  const sumDist=dist.reduce((s,l)=>s+l.monto,0);
  if(Math.abs(sumDist-bruto)>1){toast(`⚠️ La distribución (${fmtC(sumDist)}) no cuadra con el bruto (${fmtC(bruto)})`,'e');return;}
  // Ajuste de redondeo de $1 a la primera línea para cuadrar exacto.
  if(sumDist!==bruto)dist[0].monto+=(bruto-sumDist);

  if((S.compras||[]).some(d=>d.estado!=='anulado'&&+d.tipoDTE===tipo&&d.rutCodigo===r.codigo&&String(d.numero||'').trim()===folio)){
    if(!confirm(`Ya existe una boleta de honorarios N°${folio} de este prestador. ¿Registrar otra igual?`))return;
  }

  const tasa=tipo===70?retencionHonorarios(S.empresa.anio):0;
  const ret=Math.round(bruto*tasa);
  const liquido=bruto-ret;
  const doc={
    id:uid(),
    fecha,
    tipoDTE:tipo,
    numero:folio,
    rutCodigo:r.codigo, rutDV:r.dv, razonSocial:rs,
    bruto, tasaRetencion:tasa, retencion:ret, liquido,
    total:liquido,          // saldo por pagar al prestador (líquido)
    neto:0, iva:0, exento:0,
    esHonorario:true,
    dist,                   // distribución del gasto en cuentas
    cuentaGasto:dist[0].cuenta,   // compatibilidad / referencia
    origen:'libro',
  };

  const res=await guardarDocumentoContabilizado('compras',doc,S.compras);
  if(!res.ok){
    const mo=String(res.motivo||'');
    toast(mo.startsWith('validacion-contable')?('❌ '+mo):('❌ No se pudo guardar el honorario. ('+(mo||'motivo desconocido')+')'),'e');
    return;
  }

  const fichas=fichasAux('proveedor');
  if(!fichas[r.codigo]){
    fichas[r.codigo]={rutCodigo:r.codigo,rutDV:r.dv,razonSocial:rs,giro:'',email:'',telefono:'',direccion:'',comuna:'',ciudad:'',notas:'',cuentaDefault:'',ccDefault:''};
    await guardarFichasAux();
  }else if(!fichas[r.codigo].razonSocial){
    fichas[r.codigo].razonSocial=rs;await guardarFichasAux();
  }

  logAccion('Registró honorario',`${rs} · Boleta N°${folio} · Bruto ${fmtC(bruto)} · Líquido ${fmtC(liquido)}`);
  toast(`✅ Honorario registrado: ${rs} · líquido ${fmtC(liquido)}`);
  cerrarNuevoHonorario();
  rerender();
}
