// dashboard.js — V2.21.99 · Resumen de la empresa (se abre al elegir una
// empresa en Inicio).
//
// Todo sale del Libro Diario del ejercicio (genDiario): los mismos números que
// el Mayor y el Estado de Resultados, separados por mes. Nada se guarda: es
// una vista.
//   · Ingresos = cuentas tipo I (haber − debe) · Gastos = cuentas tipo C
//     (debe − haber) · Disponible = cuentas 1101xxx (caja y bancos).
//   · El asiento de apertura sólo cuenta para saldos, no para ingresos/gastos.

import {fmtC, fmt, MESES, PDC, pdcNm, dteV, dteC} from './core.js';
import {S} from './state.js';
import {genDiario} from './reportes.js';
import {calcularF29Anual, cargarDeclaracionesF29, F29DECL} from './tributario.js';
import {todosDocsVentas, todosDocsCompras} from './asientos.js';
import {periodoContableCompra} from './motor-contable.js';
import {pendientesCC} from './asigcc.js';
import {puedeVer} from './auth.js';
import {empresaActiva, EMPRESAS} from './empresas.js';

const DB={mes:null,cuenta:'',acumulado:false,clave:''};
const tipoDe=cd=>(PDC.find(c=>c.cd===cd)||{}).tp||'';
const esDisponible=cd=>/^1101\d{3}$/.test(cd);
const pct=(a,b)=>b?((a-b)/Math.abs(b))*100:null;
const fmtPct=v=>v==null||!isFinite(v)?'':(v>0?'+':'')+v.toLocaleString('es-CL',{maximumFractionDigits:1})+'%';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ── Datos ──
function calcular(){
  const entries=genDiario();
  const porCta={};          // cd → [13] {d,h}  (0 = apertura, 1..12 meses)
  const ing=Array(13).fill(0),gas=Array(13).fill(0);
  let descuadres=0;
  for(const e of entries){
    const m=e.origen==='apertura'?0:+String(e.fecha||'').slice(5,7)||0;
    let d=0,h=0;
    for(const mv of e.movs||[]){
      const cd=String(mv.cd||''),de=+mv.debe||0,ha=+mv.haber||0;d+=de;h+=ha;
      (porCta[cd]||(porCta[cd]=Array.from({length:13},()=>({d:0,h:0}))))[m].d+=de;
      porCta[cd][m].h+=ha;
      if(m>0){const t=tipoDe(cd);if(t==='I')ing[m]+=ha-de;else if(t==='C')gas[m]+=de-ha;}
    }
    if(Math.abs(d-h)>1)descuadres++;
  }
  return {porCta,ing,gas,descuadres,nAsientos:entries.length};
}

function saldoAl(porCta,filtro,mes){
  let s=0;
  for(const [cd,arr] of Object.entries(porCta)){if(!filtro(cd))continue;for(let i=0;i<=mes;i++)s+=arr[i].d-arr[i].h;}
  return s;
}

function mesPorDefecto(ing,gas,porCta){
  const anio=+S.empresa.anio,hoy=new Date();
  const tope=anio===hoy.getFullYear()?hoy.getMonth()+1:12;
  for(let m=tope;m>=1;m--){
    if(ing[m]||gas[m]||Object.values(porCta).some(a=>a[m].d||a[m].h))return m;
  }
  return tope;
}

// Resumen de documentos del mes por tipo (ventas por fecha, compras por período del libro)
function documentosMes(mes){
  const per=`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
  const agrupar=(docs,info)=>{
    const r={};
    docs.forEach(d=>{
      if(d.estado==='anulado')return;
      const t=+d.tipoDTE,sg=(info(t)?.signo)||1,k=r[t]||(r[t]={n:0,neto:0,exento:0,iva:0,total:0,nm:info(t)?.nm||('DTE '+t)});
      k.n++;k.neto+=(+d.neto||0)*sg;k.exento+=(+d.exento||0)*sg;k.iva+=(+d.iva||0)*sg;k.total+=(+d.total||0)*sg;
    });
    return r;
  };
  return {
    ventas:agrupar((todosDocsVentas()||[]).filter(d=>String(d.fecha||'').slice(0,7)===per),dteV),
    compras:agrupar((todosDocsCompras()||[]).filter(d=>periodoContableCompra(d)===per),dteC),
  };
}
function netoMensual(){
  const v=Array(13).fill(0),c=Array(13).fill(0),anio=String(S.empresa.anio);
  (todosDocsVentas()||[]).forEach(d=>{if(d.estado==='anulado'||!String(d.fecha||'').startsWith(anio))return;const sg=(dteV(d.tipoDTE)?.signo)||1;v[+d.fecha.slice(5,7)]+=((+d.neto||0)+(+d.exento||0))*sg;});
  (todosDocsCompras()||[]).forEach(d=>{const p=periodoContableCompra(d)||'';if(d.estado==='anulado'||!p.startsWith(anio))return;const sg=(dteC(d.tipoDTE)?.signo)||1;c[+p.slice(5,7)]+=((+d.neto||0)+(+d.exento||0))*sg;});
  return {v,c};
}

// ── Gráfico de líneas (SVG, curvas suaves) ──
let _gid=0;
// Curva monótona (Fritsch-Carlson): suave, pero sin pasarse por encima o
// por debajo de los datos (no inventa valores negativos entre dos ceros).
function curva(pts){
  const n=pts.length;
  if(n<2)return n?`M${pts[0][0]},${pts[0][1]}`:'';
  const dx=[],d=[],m=Array(n).fill(0);
  for(let i=0;i<n-1;i++){dx[i]=pts[i+1][0]-pts[i][0];d[i]=(pts[i+1][1]-pts[i][1])/dx[i];}
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;
  for(let i=0;i<n-1;i++){
    if(d[i]===0){m[i]=0;m[i+1]=0;continue;}
    const a=m[i]/d[i],b=m[i+1]/d[i],q=a*a+b*b;
    if(q>9){const t=3/Math.sqrt(q);m[i]=t*a*d[i];m[i+1]=t*b*d[i];}
  }
  let out=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for(let i=0;i<n-1;i++){
    const h=dx[i]/3;
    out+=` C${(pts[i][0]+h).toFixed(1)},${(pts[i][1]+m[i]*h).toFixed(1)} ${(pts[i+1][0]-h).toFixed(1)},${(pts[i+1][1]-m[i+1]*h).toFixed(1)} ${pts[i+1][0].toFixed(1)},${pts[i+1][1].toFixed(1)}`;
  }
  return out;
}
function graficoLineas({series,etiquetas,alto=210,marcar=null,ancho=640}){
  const W=ancho,H=alto,pl=58,pr=14,pt=14,pb=26;
  const todos=series.flatMap(s=>s.valores);
  let max=Math.max(0,...todos),min=Math.min(0,...todos);
  if(max===min)max=min+1;
  const paso=(()=>{const r=(max-min)/4,p=Math.pow(10,Math.floor(Math.log10(r)));return [1,2,2.5,5,10].map(k=>k*p).find(k=>k>=r)||r;})();
  max=Math.ceil(max/paso)*paso;min=Math.floor(min/paso)*paso;
  const x=i=>pl+(W-pl-pr)*(etiquetas.length===1?.5:i/(etiquetas.length-1));
  const y=v=>pt+(H-pt-pb)*(1-(v-min)/(max-min));
  const abrev=v=>{const a=Math.abs(v);return (v<0?'-':'')+(a>=1e9?(a/1e9).toLocaleString('es-CL',{maximumFractionDigits:1})+'MM':a>=1e6?(a/1e6).toLocaleString('es-CL',{maximumFractionDigits:1})+'M':a>=1e3?Math.round(a/1e3)+'K':fmt(a));};
  let g='';
  for(let v=min;v<=max+paso/2;v+=paso){
    g+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--bd)" stroke-width="1" ${v===0?'':'stroke-dasharray="3 4"'} opacity="${v===0?.9:.6}"/>`
      +`<text x="${pl-8}" y="${y(v)+3.5}" text-anchor="end" font-size="10" fill="var(--mt)" font-family="var(--mono)">${abrev(v)}</text>`;
  }
  etiquetas.forEach((l,i)=>{g+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" font-size="10" fill="${marcar===i?'var(--tx)':'var(--mt)'}" font-weight="${marcar===i?700:400}">${l}</text>`;});
  if(marcar!=null)g+=`<line x1="${x(marcar)}" x2="${x(marcar)}" y1="${pt}" y2="${H-pb}" stroke="var(--ac)" stroke-width="1" opacity=".25"/>`;
  const capas=series.map((s,k)=>{
    const id='dbg'+(++_gid),pts=s.valores.map((v,i)=>[x(i),y(v)]);
    const linea=curva(pts);
    const area=k===0&&pts.length>1?`<path d="${linea} L${pts[pts.length-1][0]},${y(Math.max(min,0))} L${pts[0][0]},${y(Math.max(min,0))} Z" fill="url(#${id})"/>`:'';
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity=".22"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
      ${area}<path d="${linea}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${s.punteada?'stroke-dasharray="5 5"':''}/>
      ${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${marcar===i?4.5:3}" fill="var(--sf)" stroke="${s.color}" stroke-width="2"><title>${esc(s.nombre)} · ${etiquetas[i]}: ${fmtC(s.valores[i])}</title></circle>`).join('')}`;
  }).join('');
  const leyenda=series.map(s=>`<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px"><span style="width:16px;height:3px;border-radius:2px;background:${s.color}"></span>${esc(s.nombre)}</span>`).join('');
  return `<div style="font-size:11px;color:var(--mt);margin-bottom:6px">${leyenda}</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img">${g}${capas}</svg>`;
}

// ── Vista ──
function kpi(icono,color,titulo,valor,sub,{colorValor}={}){
  return `<div class="db-kpi">
    <div class="db-kpi-ico" style="background:color-mix(in srgb, ${color} 14%, transparent);color:${color}">${icono}</div>
    <div style="min-width:0"><div class="db-kpi-t">${titulo}</div>
      <div class="db-kpi-v" style="color:${colorValor||'var(--tx)'}">${valor}</div>
      ${sub?`<div class="db-kpi-s">${sub}</div>`:''}</div>
  </div>`;
}
function tablaDocs(titulo,r){
  const filas=Object.entries(r).sort((a,b)=>a[0]-b[0]);
  const tot=filas.reduce((s,[,x])=>({n:s.n+x.n,neto:s.neto+x.neto+x.exento,iva:s.iva+x.iva}),{n:0,neto:0,iva:0});
  return `<table class="db-tabla"><thead><tr><th class="tl">${titulo}</th><th>Cant.</th><th>Neto + exento</th><th>IVA</th></tr></thead><tbody>
    ${filas.length?filas.map(([t,x])=>`<tr><td class="tl">${t} · ${esc(x.nm)}</td><td>${fmt(x.n)}</td><td>${fmtC(x.neto+x.exento)}</td><td>${fmtC(x.iva)}</td></tr>`).join(''):`<tr><td class="tl" colspan="4" style="color:var(--mt)">Sin documentos en el mes</td></tr>`}
    </tbody>${filas.length?`<tfoot><tr><td class="tl">Total</td><td>${fmt(tot.n)}</td><td>${fmtC(tot.neto)}</td><td>${fmtC(tot.iva)}</td></tr></tfoot>`:''}</table>`;
}

export function setDashMes(v){DB.mes=+v||null;renderDashboard();}
export function setDashCuenta(v){DB.cuenta=String(v||'');renderDashboard();}
export function setDashAcumulado(v){DB.acumulado=!!v;renderDashboard();}

export function renderDashboard(){
  const el=document.getElementById('dashboard-content');
  if(!el)return;
  if(!F29DECL.loaded||F29DECL.anio!==+S.empresa.anio){cargarDeclaracionesF29().then(()=>renderDashboard()).catch(()=>{});}
  const anio=+S.empresa.anio;
  // Otra empresa u otro año: el mes y la cuenta elegidos no aplican
  const clave=`${EMPRESAS.activa}|${anio}`;
  if(DB.clave!==clave){DB.clave=clave;DB.mes=null;DB.cuenta='';}
  const {porCta,ing,gas,descuadres}=calcular();
  const mes=DB.mes&&DB.mes>=1&&DB.mes<=12?DB.mes:mesPorDefecto(ing,gas,porCta);
  const ant=mes>1?mes-1:null;
  const resMes=ing[mes]-gas[mes];
  const margen=ing[mes]?resMes/ing[mes]*100:null;
  const disp=saldoAl(porCta,esDisponible,mes);
  let resAcum=0;for(let m=1;m<=mes;m++)resAcum+=ing[m]-gas[m];
  let f29=null;try{f29=calcularF29Anual()[mes-1];}catch(e){}
  const imp=f29?Math.round(f29.totalPagar||0):0;
  const vsAnt=(a,b)=>ant&&b?`${fmtPct(pct(a,b))} vs ${MESES[ant-1].toLowerCase()}`:'';
  const ok='var(--ok,#107e3e)';

  // Gráficos
  const etiq=MESES.map(m=>m.slice(0,3));
  const nm=netoMensual();
  const acum=[];let a=0;for(let m=1;m<=12;m++){a+=ing[m]-gas[m];acum.push(a);}
  const hasta=(anio===new Date().getFullYear())?new Date().getMonth()+1:12;
  const corta=arr=>arr.slice(0,Math.max(hasta,mes));
  const etq=etiq.slice(0,Math.max(hasta,mes));

  // Observaciones
  const obs=[];
  if(descuadres)obs.push(['err',`${descuadres} asiento(s) no cuadran.`,'diario']);
  Object.entries(porCta).forEach(([cd,arr])=>{
    const t=tipoDe(cd);if(t!=='A'&&t!=='P')return;
    const s=arr.slice(0,mes+1).reduce((x,v)=>x+v.d-v.h,0);
    if(t==='A'&&s<-1&&/^110[1-4]/.test(cd))obs.push(['warn',`${cd} ${esc(pdcNm(cd))} tiene saldo acreedor (${fmtC(s)}).`,'mayor']);
    if(t==='P'&&s>1&&/^210[1-5]/.test(cd))obs.push(['warn',`${cd} ${esc(pdcNm(cd))} tiene saldo deudor (${fmtC(s)}).`,'mayor']);
  });
  try{const p=pendientesCC();if(p&&p.n)obs.push(['info',`${p.n} gasto(s) sin centro de costo por ${fmtC(p.monto)}.`,'asigcc']);}catch(e){}
  if(F29DECL.loaded){
    const sinF29=[];for(let m=1;m<mes;m++){const d=F29DECL.items?.[`${anio}-${String(m).padStart(2,'0')}`];if(!d||!(d.calculadoAlGuardar||['presentado','cerrado'].includes(d.estado)))sinF29.push(MESES[m-1].slice(0,3));}
    if(sinF29.length)obs.push(['info',`F29 sin guardar: ${sinF29.join(', ')}.`,'f29']);
  }

  // Consulta de saldo
  const cuentasMov=Object.keys(porCta).filter(cd=>PDC.some(c=>c.cd===cd)).sort();
  const cta=DB.cuenta&&porCta[DB.cuenta]?DB.cuenta:(cuentasMov.find(esDisponible)||cuentasMov[0]||'');
  let filasSaldo='',serieSaldo=[];
  if(cta){
    let acc=0;
    for(let m=0;m<=12;m++){
      if(m>Math.max(hasta,mes))break;
      const v=porCta[cta][m],neto=v.d-v.h;acc+=neto;
      if(m>0)serieSaldo.push(DB.acumulado?acc:neto);
      const sal=DB.acumulado?acc:neto;
      filasSaldo+=`<tr${m===mes?' class="db-sel"':''}><td class="tl">${m===0?'Apertura':MESES[m-1].slice(0,3)+' '+anio}</td><td>${fmt(Math.round(v.d))}</td><td>${fmt(Math.round(v.h))}</td><td style="color:${sal<0?'var(--err)':'var(--tx)'}">${fmt(Math.round(sal))}</td></tr>`;
    }
  }

  // Gastos por categoría (año, hasta el mes)
  const gastosCta={};
  Object.entries(porCta).forEach(([cd,arr])=>{if(tipoDe(cd)!=='C')return;let s=0;for(let m=1;m<=mes;m++)s+=arr[m].d-arr[m].h;if(s>0)gastosCta[cd]=s;});
  const topG=Object.entries(gastosCta).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxG=topG.length?topG[0][1]:1;
  const barras=topG.map(([cd,v])=>`<div class="db-barra"><div class="db-barra-l" title="${cd}">${esc(pdcNm(cd))}</div>
    <div class="db-barra-b"><div style="width:${Math.max(2,v/maxG*100)}%"></div></div><div class="db-barra-v">${fmtC(v)}</div></div>`).join('');

  const docs=documentosMes(mes);
  const e=empresaActiva();
  el.innerHTML=`
  <div class="db-hdr">
    <div><div class="sec-title">${esc(S.empresa.nombre||e?.nombre||'Empresa')}</div>
      <div class="sec-sub">Resumen de ${MESES[mes-1].toLowerCase()} ${anio}${S.empresa.rut?' · RUT '+esc(S.empresa.rut):''}</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select onchange="setDashMes(this.value)" style="width:auto;min-width:160px">${MESES.map((m,i)=>`<option value="${i+1}" ${i+1===mes?'selected':''}>${m} ${anio}</option>`).join('')}</select>
      ${puedeVer('comprobantes')?`<button class="btn btn-p" onclick="nav('comprobantes')">📔 Ir a Comprobantes</button>`:''}
    </div>
  </div>
  <div class="db-kpis">
    ${kpi('$',ok,'Ingresos del mes',fmtC(ing[mes]),vsAnt(ing[mes],ing[ant]),{colorValor:ok})}
    ${kpi('↗','var(--err)','Gastos del mes',fmtC(gas[mes]),vsAnt(gas[mes],gas[ant]),{colorValor:'var(--err)'})}
    ${kpi('%','var(--ac)','Margen del mes',margen==null?'—':margen.toLocaleString('es-CL',{maximumFractionDigits:1})+'%',`Resultado ${fmtC(resMes)}`,{colorValor:margen!=null&&margen<0?'var(--err)':'var(--ac)'})}
    ${kpi('🏦','var(--warn)','Disponible (caja y bancos)',fmtC(disp),`Al cierre de ${MESES[mes-1].toLowerCase()}`,{colorValor:disp<0?'var(--err)':'var(--tx)'})}
    ${kpi('🧾','var(--info)','Impuestos del mes (F29)',fmtC(imp),f29?`IVA ${fmtC(f29.ivaAPagar||0)} · PPM ${fmtC(f29.ppm||0)}`:'')}
    ${kpi('Σ','var(--ac)','Resultado del ejercicio',fmtC(resAcum),`Enero a ${MESES[mes-1].toLowerCase()}`,{colorValor:resAcum<0?'var(--err)':ok})}
  </div>
  <div class="db-grid">
    <div class="card db-c2"><div class="card-title">Ventas y compras mensuales (neto + exento)</div>
      ${graficoLineas({series:[{nombre:'Ventas',color:'var(--ac)',valores:corta(nm.v.slice(1))},{nombre:'Compras',color:'var(--warn)',valores:corta(nm.c.slice(1))}],etiquetas:etq,marcar:mes-1})}</div>
    <div class="card"><div class="card-title">Documentos de ${MESES[mes-1].toLowerCase()}</div>
      ${tablaDocs('Ventas',docs.ventas)}<div style="height:12px"></div>${tablaDocs('Compras',docs.compras)}</div>
    <div class="card db-c2"><div class="card-title">Ingresos, gastos y resultado acumulado</div>
      ${graficoLineas({series:[{nombre:'Resultado acumulado',color:'var(--ac)',valores:corta(acum)},{nombre:'Ingresos',color:ok,valores:corta(ing.slice(1))},{nombre:'Gastos',color:'var(--err)',valores:corta(gas.slice(1)),punteada:true}],etiquetas:etq,marcar:mes-1})}</div>
    <div class="card"><div class="card-title">Observaciones a revisar</div>
      ${obs.length?obs.map(([n,t,s])=>`<div class="db-obs db-obs-${n}" ${puedeVer(s)?`onclick="nav('${s}')" title="Revisar"`:''}>${n==='err'?'⛔':n==='warn'?'⚠️':'ℹ️'} <span>${t}</span></div>`).join(''):'<div style="font-size:12px;color:var(--mt)">✅ No hay observaciones para este mes.</div>'}</div>
    <div class="card db-c2"><div class="card-title">Consulta de saldo</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <select onchange="setDashCuenta(this.value)" style="flex:1;min-width:200px">${cuentasMov.map(cd=>`<option value="${cd}" ${cd===cta?'selected':''}>${cd} · ${esc(pdcNm(cd))}</option>`).join('')}</select>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;text-transform:none;letter-spacing:0;color:var(--tx);cursor:pointer"><input type="checkbox" ${DB.acumulado?'checked':''} onchange="setDashAcumulado(this.checked)" style="width:auto">Saldo acumulado</label>
      </div>
      ${cta?`<div class="db-saldo"><div>${graficoLineas({series:[{nombre:DB.acumulado?'Saldo acumulado':'Movimiento neto del mes',color:'var(--ac)',valores:serieSaldo}],etiquetas:etq.slice(0,serieSaldo.length),alto:240,marcar:mes-1,ancho:520})}</div><div><table class="db-tabla"><thead><tr><th class="tl">Período</th><th>Debe</th><th>Haber</th><th>${DB.acumulado?'Saldo':'Neto'}</th></tr></thead><tbody>${filasSaldo}</tbody></table></div></div>`:'<div style="font-size:12px;color:var(--mt)">Sin movimientos.</div>'}
    </div>
    <div class="card"><div class="card-title">Gastos por cuenta · enero a ${MESES[mes-1].toLowerCase()}</div>
      ${barras||'<div style="font-size:12px;color:var(--mt)">Sin gastos registrados.</div>'}</div>
  </div>`;
}
