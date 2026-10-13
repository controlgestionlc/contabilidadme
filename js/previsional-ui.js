// previsional-ui.js — Configuración editable de instituciones previsionales.
// Vive dentro de la sección Indicadores.

import {toast, fmtC} from './core.js';
import {S} from './state.js';
import {getPrevisional, tasaAccidentes, tasasAFC, CONTRATOS_AFC, AFP_DEFAULT, ISAPRES_DEFAULT, MUTUALES_DEFAULT,
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
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Se paga a la AFP del trabajador. Vigente desde abril 2026: 1,62%</div>
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

  <div class="save-row" style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="guardarPrevisional()">💾 Guardar configuración previsional</button>
    <button class="btn btn-g" onclick="restaurarPrevisional()">↺ Valores oficiales 2026</button>
  </div>`;
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
  S.empresa.previsional={afps,isapres:P.isapres,mutuales:P.mutuales,cajas:P.cajas,patronal};
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
