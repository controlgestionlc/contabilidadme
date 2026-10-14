// previsional-ui.js — Configuración editable de instituciones previsionales.
// Vive dentro de la sección Indicadores.

import {toast, fmtC} from './core.js';
import {S} from './state.js';
import {getPrevisional, tasaAccidentes, tasasAFC, CONTRATOS_AFC, reformaTramos, reformaVigente, REFORMA_DEFAULT, SEGURO_SOCIAL_SIS_CEV, AFP_DEFAULT, ISAPRES_DEFAULT, MUTUALES_DEFAULT,
        CAJAS_DEFAULT, PATRONAL_DEFAULT} from './previsional.js';
import {logAccion} from './firebase.js';

export function renderPrevisional(){
  const el=document.getElementById('previsional-content');
  if(!el)return;
  const P=getPrevisional();
  const p=P.patronal;

  const filasAFP=P.afps.map((a,i)=>`<tr>
    <td class="tl" style="font-size:12px">${a.nm}</td>
    <td style="text-align:right"><input type="number" step="0.01" id="afp-com-${i}" value="${a.comision}" style="width:80px;text-align:right"> %</td>
  </tr>`).join('');

  el.innerHTML=`
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🏦 Comisiones AFP</div>
    <div class="info-tip" style="font-size:11px;margin-bottom:10px">
      Comisión que cobra cada AFP sobre la renta imponible, <strong>adicional al 10% obligatorio</strong>.
      Las publica la Superintendencia de Pensiones y cambian ocasionalmente.
      <a href="https://www.spensiones.cl/" target="_blank" rel="noopener" style="color:var(--ac);margin-left:6px">↗ spensiones.cl</a>
    </div>
    <div class="tw"><table>
      <thead><tr><th class="tl">ADMINISTRADORA</th><th style="text-align:right">COMISIÓN</th></tr></thead>
      <tbody>${filasAFP}</tbody>
    </table></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">👔 Aporte del empleador, accidentes del trabajo y seguro de cesantía</div>
    <div class="info-tip" style="font-size:11px;margin-bottom:12px">
      Cargas que paga la <strong>empresa</strong> por cada trabajador, además del sueldo bruto (no se descuentan de la liquidación). En el seguro de cesantía también se define el aporte del trabajador, que sí se descuenta.
    </div>
    <div class="fg">
      <div class="grp">
        <label>SIS — Invalidez y sobrevivencia (%)</label>
        <input type="number" id="pat-sis" step="0.01" value="${p.sis}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Trimestre agosto a octubre 2026: 1,78%. Desde agosto 2026 lo recauda el Seguro Social Previsional. No aplica a pensionados ni mayores de 65.</div>
      </div>
      <div class="grp full">
        <label>Seguro de accidentes del trabajo (Ley 16.744) — institución</label>
        <select id="pat-mutual-inst" onchange="renderPrevisionalAccidentes()">
          ${P.mutuales.map(m=>`<option value="${m.k}" ${m.k===p.mutualInstitucion?'selected':''}>${m.nm}</option>`).join('')}
        </select>
      </div>
      <div class="grp full">
        <div class="tw"><table style="font-size:12px">
          <thead><tr><th class="tl">COTIZACIÓN (%)</th><th style="text-align:right">MUTUALIDAD</th><th style="text-align:right">ISL</th></tr></thead>
          <tbody>
            ${[['Base','Básica','Ley 16.744 · general 0,90%'],['Adicional','Adicional diferenciada','Por riesgo y siniestralidad de la actividad; la notifica la mutual o el ISL'],['Sanna','Ley SANNA','Ley 21.063 · 0,03%'],['Extra','Extraordinaria','Sólo si hay una cotización extraordinaria vigente']].map(([k,nm,h])=>`<tr>
              <td class="tl">${nm}<div style="font-size:10px;color:var(--mt)">${h}</div></td>
              <td style="text-align:right"><input type="number" step="0.001" min="0" id="pat-mutual-${k}" value="${+p['mutual'+k]||0}" oninput="renderPrevisionalAccidentes()" style="width:90px;text-align:right"></td>
              <td style="text-align:right"><input type="number" step="0.001" min="0" id="pat-isl-${k}" value="${+p['isl'+k]||0}" oninput="renderPrevisionalAccidentes()" style="width:90px;text-align:right"></td>
            </tr>`).join('')}
            <tr><td class="tl" style="font-weight:700">Total</td><td style="text-align:right;font-family:var(--mono);font-weight:700" id="pat-mutual-total"></td><td style="text-align:right;font-family:var(--mono);font-weight:700" id="pat-isl-total"></td></tr>
          </tbody>
        </table></div>
        <div style="font-size:10px;color:var(--mt);margin-top:4px" id="pat-acc-hint"></div>
      </div>
      <div class="grp full">
        <label>Seguro de cesantía (Ley 19.728) — AFC Chile</label>
        <div class="tw"><table style="font-size:12px">
          <thead><tr><th class="tl">TIPO DE CONTRATO</th><th style="text-align:right">TRABAJADOR (%)</th><th style="text-align:right">EMPLEADOR (%)</th><th style="text-align:right">TOTAL</th></tr></thead>
          <tbody>
            ${[['indefinido','Indefinido','afcTrabIndefinido','afcIndefinido','Trabajador 0,6% · empleador 2,4%'],
               ['plazo','Plazo fijo / obra o faena','afcTrabPlazoFijo','afcPlazoFijo','Sólo empleador: 3%'],
               ['indefinido11','Indefinido, más de 11 años','afcTrabIndef11','afcIndef11','Sólo empleador: 0,8%']].map(([k,nm,kt,ke,h])=>`<tr>
              <td class="tl">${nm}<div style="font-size:10px;color:var(--mt)">${h}</div></td>
              <td style="text-align:right"><input type="number" step="0.01" min="0" id="pat-${kt}" value="${+p[kt]||0}" oninput="renderPrevisionalAccidentes()" style="width:80px;text-align:right"></td>
              <td style="text-align:right"><input type="number" step="0.01" min="0" id="pat-${ke}" value="${+p[ke]||0}" oninput="renderPrevisionalAccidentes()" style="width:80px;text-align:right"></td>
              <td style="text-align:right;font-family:var(--mono);font-weight:700" id="pat-afc-tot-${k}"></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div style="font-size:10px;color:var(--mt);margin-top:4px">El tipo de contrato se elige en la ficha de cada trabajador. El tope imponible de cesantía está en Topes imponibles (Indicadores).</div>
      </div>
      <div class="grp">
        <label>Caja de compensación (%)</label>
        <input type="number" id="pat-caja" step="0.01" value="${p.cajaCompensacion}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Solo si la empresa está afiliada (habitual 0,6%)</div>
      </div>
      <div class="grp">
        <label>Caja — institución</label>
        <select id="pat-caja-inst">
          ${P.cajas.map(cj=>`<option value="${cj.k}" ${cj.k===p.cajaInstitucion?'selected':''}>${cj.nm}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="info-tip" style="font-size:11px;margin-top:10px">
      💡 Costo empresa aproximado por trabajador: <strong>${(+p.sis+tasaAccidentes(p)+(+p.afcIndefinido)+(+p.cajaCompensacion)).toFixed(2)}%</strong> sobre la renta imponible (contrato indefinido).
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🏛️ Reforma de pensiones (Ley 21.735) · aporte del empleador</div>
    <div class="info-tip" style="font-size:11px;margin-bottom:10px">
      Aporte adicional de cargo del <strong>empleador</strong>, sobre la renta imponible con tope AFP. No se descuenta al trabajador y sólo aplica a trabajadores <strong>activos afiliados a AFP</strong> (no a pensionados ni mayores de 65).
      Cada tramo rige desde las remuneraciones del mes indicado. <strong>Seguro Social Previsional (expectativa de vida)</strong> en blanco = automática: ${SEGURO_SOCIAL_SIS_CEV.toLocaleString('es-CL')}% − SIS.
      <a href="https://www.chileatiende.gob.cl/fichas/130987-aportes-del-empleador-al-sistema-de-pensiones" target="_blank" rel="noopener" style="color:var(--ac);margin-left:6px">↗ ChileAtiende</a>
    </div>
    <div class="tw"><table style="font-size:12px">
      <thead><tr><th class="tl">DESDE</th><th style="text-align:right">CAPITALIZACIÓN INDIVIDUAL (%)</th><th style="text-align:right">SEGURO SOCIAL PREVISIONAL · EXPECTATIVA DE VIDA (%)</th><th style="text-align:right">RENTABILIDAD PROTEGIDA (%)</th><th style="text-align:right">TOTAL + SIS</th><th></th></tr></thead>
      <tbody id="ref-filas">${reformaTramos().map((r,i)=>filaReforma(r,i)).join('')}</tbody>
    </table></div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-g" onclick="agregarTramoReforma()">+ Agregar tramo</button>
      <span style="font-size:11px;color:var(--mt)" id="ref-vigente"></span>
    </div>
  </div>

  <div class="save-row" style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="guardarPrevisional()">💾 Guardar configuración previsional</button>
    <button class="btn btn-g" onclick="restaurarPrevisional()">↺ Valores oficiales 2026</button>
  </div>`;
  renderPrevisionalAccidentes();
}

function filaReforma(r,i){
  const auto=r.cev===null||r.cev===undefined||r.cev==='';
  return `<tr data-ref="${i}">
    <td class="tl"><input type="month" class="ref-desde" value="${r.desde||''}" onchange="renderPrevisionalAccidentes()" style="width:140px"></td>
    <td style="text-align:right"><input type="number" step="0.01" min="0" class="ref-cap" value="${+r.capInd||0}" oninput="renderPrevisionalAccidentes()" style="width:80px;text-align:right"></td>
    <td style="text-align:right"><input type="number" step="0.01" min="0" class="ref-cev" value="${auto?'':(+r.cev||0)}" placeholder="auto" oninput="renderPrevisionalAccidentes()" style="width:80px;text-align:right"></td>
    <td style="text-align:right"><input type="number" step="0.01" min="0" class="ref-crp" value="${+r.crp||0}" oninput="renderPrevisionalAccidentes()" style="width:80px;text-align:right"></td>
    <td style="text-align:right;font-family:var(--mono);font-weight:700" class="ref-tot"></td>
    <td style="text-align:right"><button class="btn btn-d" title="Quitar tramo" onclick="quitarTramoReforma(${i})">🗑</button></td>
  </tr>`;
}
// Lee la tabla de tramos tal como está en pantalla
function leerTramosReforma(){
  return [...document.querySelectorAll('#ref-filas tr')].map(tr=>{
    const q=c=>tr.querySelector(c)?.value??'';
    const cev=String(q('.ref-cev')).trim();
    return {desde:q('.ref-desde'),capInd:+q('.ref-cap')||0,cev:cev===''?null:(+cev||0),crp:+q('.ref-crp')||0};
  }).filter(r=>/^\d{4}-\d{2}$/.test(r.desde)).sort((a,b)=>a.desde.localeCompare(b.desde));
}
export function agregarTramoReforma(){
  const t=leerTramosReforma();const u=t[t.length-1]||{capInd:0,cev:null,crp:0,desde:'2026-07'};
  const [y,m]=u.desde.split('-').map(Number);
  t.push({...u,desde:`${y+1}-${String(m).padStart(2,'0')}`});
  document.getElementById('ref-filas').innerHTML=t.map((r,i)=>filaReforma(r,i)).join('');
  renderPrevisionalAccidentes();
}
export function quitarTramoReforma(i){
  const t=leerTramosReforma().filter((_,j)=>j!==i);
  document.getElementById('ref-filas').innerHTML=t.map((r,k)=>filaReforma(r,k)).join('');
  renderPrevisionalAccidentes();
}

// Totales en vivo de mutualidad e ISL, y cuál se está aplicando
export function renderPrevisionalAccidentes(){
  const v=id=>+(document.getElementById(id)?.value||0)||0;
  const tot=pre=>['Base','Adicional','Sanna','Extra'].reduce((s,k)=>s+v(`pat-${pre}-${k}`),0);
  const fmt=n=>n.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:3})+'%';
  const inst=document.getElementById('pat-mutual-inst')?.value||'achs';
  const esISL=inst==='isl';
  const tm=document.getElementById('pat-mutual-total'),ti=document.getElementById('pat-isl-total'),h=document.getElementById('pat-acc-hint');
  if(tm){tm.textContent=fmt(tot('mutual'));tm.style.color=esISL?'var(--mt)':'var(--ach)';}
  if(ti){ti.textContent=fmt(tot('isl'));ti.style.color=esISL?'var(--ach)':'var(--mt)';}
  [['indefinido','afcTrabIndefinido','afcIndefinido'],['plazo','afcTrabPlazoFijo','afcPlazoFijo'],['indefinido11','afcTrabIndef11','afcIndef11']].forEach(([k,a,b])=>{
    const e=document.getElementById('pat-afc-tot-'+k);if(e)e.textContent=fmt(v('pat-'+a)+v('pat-'+b));
  });
  // Reforma: total de cada tramo (con el SIS de la pantalla) y tramo vigente hoy
  const sis=v('pat-sis');
  const hoy=new Date().toISOString().slice(0,7);let vig=null;
  document.querySelectorAll('#ref-filas tr').forEach(tr=>{
    const q=c=>tr.querySelector(c)?.value??'';
    const cevTxt=String(q('.ref-cev')).trim();
    const desde=q('.ref-desde');
    const cev=cevTxt===''?(desde>='2026-08'?Math.max(0,2.5-sis):0):(+cevTxt||0);
    const tot=(+q('.ref-cap')||0)+cev+(+q('.ref-crp')||0)+sis;
    const e=tr.querySelector('.ref-tot');if(e)e.textContent=fmt(tot);
    const c=tr.querySelector('.ref-cev');if(c)c.placeholder=cevTxt===''?('auto '+cev.toLocaleString('es-CL',{maximumFractionDigits:2})):'auto';
    if(desde&&desde<=hoy)vig={desde,cap:+q('.ref-cap')||0,cev,crp:+q('.ref-crp')||0,tot};
  });
  const rv=document.getElementById('ref-vigente');
  if(rv)rv.innerHTML=vig?`Vigente hoy (desde ${vig.desde}): capitalización ${fmt(vig.cap)} · Seguro Social Previsional ${fmt(vig.cev)} · rentabilidad protegida ${fmt(vig.crp)} · con SIS ${fmt(vig.tot)}`:'Sin tramo vigente para el mes actual.';
  if(h)h.innerHTML=`Se aplica la columna <strong>${esISL?'ISL':'Mutualidad'}</strong> (${fmt(tot(esISL?'isl':'mutual'))} sobre la renta imponible), según la institución elegida.`;
}

export async function guardarPrevisional(){
  const num=id=>{const e=document.getElementById(id);return e?(+e.value||0):0;};
  const P=getPrevisional();
  const afps=P.afps.map((a,i)=>({...a,comision:num('afp-com-'+i)}));
  const patronal={
    sis:num('pat-sis'),
    mutualBase:num('pat-mutual-Base'),
    mutualAdicional:num('pat-mutual-Adicional'),
    mutualSanna:num('pat-mutual-Sanna'),
    mutualExtra:num('pat-mutual-Extra'),
    islBase:num('pat-isl-Base'),
    islAdicional:num('pat-isl-Adicional'),
    islSanna:num('pat-isl-Sanna'),
    islExtra:num('pat-isl-Extra'),
    afcIndefinido:num('pat-afcIndefinido'),
    afcTrabIndefinido:num('pat-afcTrabIndefinido'),
    afcPlazoFijo:num('pat-afcPlazoFijo'),
    afcTrabPlazoFijo:num('pat-afcTrabPlazoFijo'),
    afcIndef11:num('pat-afcIndef11'),
    afcTrabIndef11:num('pat-afcTrabIndef11'),
    cajaCompensacion:num('pat-caja'),
    mutualInstitucion:document.getElementById('pat-mutual-inst').value,
    cajaInstitucion:document.getElementById('pat-caja-inst').value,
  };
  const reforma=leerTramosReforma();
  S.empresa.previsional={afps,isapres:P.isapres,mutuales:P.mutuales,cajas:P.cajas,patronal,
    ...(reforma.length&&JSON.stringify(reforma)!==JSON.stringify(REFORMA_DEFAULT)?{reforma}:{})};
  const r=await window.storage.set('empresa',JSON.stringify(S.empresa));
  if(!r||r.ok===false){toast('❌ Error al guardar la configuración previsional','e');return;}
  toast('✅ Configuración previsional guardada');
  logAccion('Actualizó tasas previsionales',`SIS ${patronal.sis}% · ${patronal.mutualInstitucion==='isl'?'ISL':'Mutual'} ${tasaAccidentes(patronal).toFixed(3)}%`);
  renderPrevisional();
}

export async function restaurarPrevisional(){
  if(!confirm('¿Restaurar las tasas oficiales de referencia 2026?\n\nSe sobrescriben las comisiones AFP y el aporte patronal que hayas configurado.'))return;
  S.empresa.previsional={
    afps:AFP_DEFAULT,isapres:ISAPRES_DEFAULT,mutuales:MUTUALES_DEFAULT,
    cajas:CAJAS_DEFAULT,patronal:{...PATRONAL_DEFAULT}
  };
  const r=await window.storage.set('empresa',JSON.stringify(S.empresa));
  if(!r||r.ok===false){toast('❌ No se pudieron restaurar las tasas','e');return;}
  renderPrevisional();
  toast('↺ Tasas oficiales 2026 restauradas');
}
