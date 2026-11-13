import {toast, fmtC, PDC, pdcNm} from './core.js';
import {S} from './state.js';
import {puedeEditar} from './auth.js';
import {proxFolioAsiento} from './asientos.js';
import {persistirAsientosCritico} from './contabilidad-v2.js';
import {updateHdr} from './empresa.js';

// ═══════════════════════════════════════════════════════════════════════
// COSTEO DE VENTAS (sin inventario permanente)
// ═══════════════════════════════════════════════════════════════════════
// Las empresas mandan el registro de compras y ventas, pero no el detalle de lo que se vendió ni un
// conteo mensual. Sin eso no hay inventario permanente posible, así que el costo del mes se estima y el
// saldo de existencias queda como control: si crece sin parar, el margen usado es muy alto; si se va a
// negativo, es muy bajo. El costo tributario se fija una vez al año con el conteo físico.
//
// Tres métodos, elegibles por empresa:
//   margen        · costo = ventas netas × (1 − margen). Margen parejo mes a mes.
//   margen_linea  · lo mismo, pero con un margen por cuenta de venta (líneas de negocio distintas).
//   compras       · costo = compras que entraron a existencias en el mes. Cuadra solo en el año, pero
//                   el margen mensual baila con el ritmo de compra.

const CLAVE_CFG='costeo-cfg', CLAVE_CONTEOS='costeo-conteos';
const MESES_NM=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const CFG_DEFAULT=()=>({metodo:'margen',margen:0.3,lineas:[],cuentaCosto:'',cuentasExistencias:[],mesesAviso:6});

let CFG=CFG_DEFAULT(), CONTEOS=[], PERIODO='', CARGADO=false;

const mesEnPalabras=p=>{const[a,m]=String(p).split('-');return (MESES_NM[+m-1]||m)+' de '+a;};
const pctTxt=v=>(v*100).toFixed(1).replace('.',',')+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/**
 * Propone las cuentas leyendo el propio plan de la empresa, para no pedirle al usuario que las busque
 * la primera vez. Las existencias salen del subtítulo que se llama así (1109 en el plan estándar).
 */
function sugerirCuentas(){
  const sinTilde=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
  const prefijos=(PDC||[]).filter(c=>c.tp==='S'&&sinTilde(c.nm).includes('EXISTENCIA')).map(c=>String(c.cd));
  const cuentasExistencias=(PDC||[]).filter(c=>c.tp==='A'&&prefijos.some(p=>String(c.cd).startsWith(p)&&String(c.cd)!==p)).map(c=>String(c.cd));
  const costo=(PDC||[]).find(c=>c.tp==='C'&&/COSTO\s+(DE\s+)?VENTA/.test(sinTilde(c.nm)))
    ||(PDC||[]).find(c=>c.tp==='C'&&sinTilde(c.nm).includes('COSTO'));
  return {cuentaCosto:costo?String(costo.cd):'',cuentasExistencias};
}

async function cargarCosteo(){
  if(CARGADO)return;
  CFG=CFG_DEFAULT();
  try{
    const r=await window.storage.get(CLAVE_CFG);
    if(r&&r.value){const p=JSON.parse(r.value);if(p&&typeof p==='object')CFG={...CFG_DEFAULT(),...p};}
    else {const s=sugerirCuentas();CFG={...CFG,...s};}   // primera vez: propuestas desde el plan
  }catch(e){}
  try{
    const r=await window.storage.get(CLAVE_CONTEOS);
    CONTEOS=r&&r.value?(JSON.parse(r.value)||[]):[];
  }catch(e){CONTEOS=[];}
  CARGADO=true;
}
const guardarCfg=()=>window.storage.set(CLAVE_CFG,JSON.stringify(CFG));
const guardarConteos=()=>window.storage.set(CLAVE_CONTEOS,JSON.stringify(CONTEOS));

// ═══ Lo que pasó, leído de los asientos (no de los libros de compra y venta): lo que hay que costear
// es lo que está contabilizado ═══

const finDeMes=p=>{const[a,m]=p.split('-').map(Number);return new Date(Date.UTC(a,m,0)).toISOString().slice(0,10);};

function recorrer(fn,desde,hasta){
  (S.asientos||[]).forEach(a=>{
    if(a.anulado)return;
    const f=String(a.fecha||'').slice(0,10);
    if(desde&&f<desde)return;
    if(hasta&&f>hasta)return;
    (a.movs||[]).forEach(m=>fn(String(m.cd),(+m.debe||0),(+m.haber||0)));
  });
}

function datosMes(periodo){
  const desde=periodo+'-01', hasta=finDeMes(periodo);
  const esExistencia=cd=>CFG.cuentasExistencias.includes(cd);
  const tipoDe=cd=>{const r=(PDC||[]).find(x=>String(x.cd)===cd);return r?r.tp:'';};

  const ventasMap={};let comprasExistencias=0;
  recorrer((cd,debe,haber)=>{
    if(tipoDe(cd)==='I')ventasMap[cd]=(ventasMap[cd]||0)+haber-debe;
    if(esExistencia(cd))comprasExistencias+=debe-haber;
  },desde,hasta);

  const saldos=CFG.cuentasExistencias.map(cd=>{let s=0;recorrer((c,debe,haber)=>{if(c===cd)s+=debe-haber;},null,hasta);return {cuenta:cd,saldo:Math.round(s)};});

  // El año abierto es lo que hay en memoria, así que el promedio se saca de los meses ya transcurridos.
  let comprasAnio=0,mesesConDatos=Math.max(1,+periodo.slice(5,7));
  recorrer((cd,debe,haber)=>{if(esExistencia(cd))comprasAnio+=debe-haber;},null,hasta);

  return {
    periodo,
    ventas:Object.keys(ventasMap).filter(cd=>Math.round(ventasMap[cd])!==0).sort()
      .map(cd=>({cuenta:cd,neto:Math.round(ventasMap[cd])})),
    comprasExistencias:Math.round(comprasExistencias),
    saldos,
    comprasPromedio:Math.round(comprasAnio/mesesConDatos),
  };
}

/** Ventas y compras acumuladas del año hasta el mes, para proponer el margen. */
function ventanaCosteo(periodo){
  const hasta=finDeMes(periodo);
  const tipoDe=cd=>{const r=(PDC||[]).find(x=>String(x.cd)===cd);return r?r.tp:'';};
  let ventas=0,compras=0;
  recorrer((cd,debe,haber)=>{
    if(tipoDe(cd)==='I')ventas+=haber-debe;
    if(CFG.cuentasExistencias.includes(cd))compras+=debe-haber;
  },null,hasta);
  return {ventas:Math.round(ventas),compras:Math.round(compras),meses:+periodo.slice(5,7)};
}

/**
 * Margen que se deduce de la propia contabilidad: en una ventana larga, si el stock se mantiene parejo,
 * las compras se parecen al costo de lo vendido. Devuelve null cuando no hay con qué calcularlo.
 */
function margenSugerido(ventas,compras){
  const v=Math.round(+ventas||0),c=Math.round(+compras||0);
  if(v<=0)return null;
  const m=1-c/v;
  if(m<=-1||m>=0.95)return null;
  return Math.round(m*1000)/1000;
}

/** Reparte el costo entre las cuentas de existencias, a prorrata del saldo de cada una. */
function repartir(total,saldos){
  if(!saldos.length||total<=0)return[];
  const positivos=saldos.filter(s=>s.saldo>0);
  const base=positivos.length?positivos:[saldos[0]];
  const suma=base.reduce((s,x)=>s+Math.max(0,x.saldo),0);
  if(suma<=0)return[{cuenta:base[0].cuenta,monto:total}];
  const r=base.map(x=>({cuenta:x.cuenta,monto:Math.round(total*Math.max(0,x.saldo)/suma)}));
  const dif=total-r.reduce((s,x)=>s+x.monto,0);
  if(dif!==0){const mayor=r.reduce((a,b)=>b.monto>a.monto?b:a,r[0]);mayor.monto+=dif;}
  return r.filter(x=>x.monto!==0);
}

function costearMes(cfg,mes){
  const ventasNetas=mes.ventas.reduce((s,v)=>s+Math.round(+v.neto||0),0);
  const avisos=[],porCosto={};
  const cargar=(cd,m)=>{if(cd&&m>0)porCosto[cd]=(porCosto[cd]||0)+m;};

  if(cfg.metodo==='compras')cargar(cfg.cuentaCosto,Math.max(0,mes.comprasExistencias));
  else if(cfg.metodo==='margen_linea'){
    const sin=[];
    mes.ventas.forEach(v=>{
      const neto=Math.round(+v.neto||0);if(neto<=0)return;
      const l=(cfg.lineas||[]).find(x=>x.cuentaVenta===v.cuenta);
      if(!l){sin.push(v.cuenta);return;}
      cargar(l.cuentaCosto||cfg.cuentaCosto,Math.round(neto*(1-l.margen)));
    });
    if(sin.length)avisos.push('Sin margen configurado para '+sin.join(', ')+': esas ventas quedaron sin costo. Agrégalas en la configuración.');
  }
  else cargar(cfg.cuentaCosto,Math.round(Math.max(0,ventasNetas)*(1-cfg.margen)));

  const costo=Object.values(porCosto).reduce((s,x)=>s+x,0);
  const saldoAntes=mes.saldos.reduce((s,x)=>s+x.saldo,0);
  const saldoDespues=saldoAntes-costo;
  const glosa='Costo de ventas de '+mesEnPalabras(mes.periodo);
  const movs=[];
  Object.keys(porCosto).forEach(cd=>{if(cd)movs.push({cd,nm:pdcNm(cd),debe:porCosto[cd],haber:0,glosa});});
  repartir(costo,mes.saldos).forEach(r=>movs.push({cd:r.cuenta,nm:pdcNm(r.cuenta),debe:0,haber:r.monto,glosa}));

  if(!cfg.cuentaCosto&&cfg.metodo!=='margen_linea')avisos.push('Falta elegir la cuenta de costo en la configuración.');
  if(!cfg.cuentasExistencias.length)avisos.push('Falta elegir de qué cuentas de existencias se descuenta el costo.');
  if(ventasNetas<=0)avisos.push('No hay ventas en '+mesEnPalabras(mes.periodo)+': no hay nada que costear.');
  if(costo>0&&saldoAntes<=0)avisos.push('Las existencias ya están en cero o en negativo: el costo que se registre dejará el saldo bajo cero. Revisa el margen o ingresa un conteo.');
  else if(saldoDespues<0)avisos.push('El saldo de existencias queda en '+fmtC(saldoDespues)+'. El margen que estás usando es muy bajo para lo que se compró, o faltan compras por registrar.');

  const mesesDeCompra=mes.comprasPromedio>0?saldoDespues/mes.comprasPromedio:0;
  if(mesesDeCompra>cfg.mesesAviso)
    avisos.push('Las existencias quedan en '+fmtC(saldoDespues)+', que son '+mesesDeCompra.toFixed(1).replace('.',',')+' meses de compra. Si no tienes ese stock de verdad, el margen está muy alto: bájalo o haz un conteo.');

  const debe=movs.reduce((s,m)=>s+m.debe,0),haber=movs.reduce((s,m)=>s+m.haber,0);
  return {costo,ventasNetas,margenEfectivo:ventasNetas>0?(ventasNetas-costo)/ventasNetas:0,
    movs,saldoAntes,saldoDespues,mesesDeCompra,avisos,glosa,cuadra:debe===haber&&debe>0};
}

/**
 * Ajuste contra el conteo físico: lo que sobra en los libros se lleva a costo, lo que falta vuelve a
 * existencias. Es el asiento que cierra el año y el que endereza un saldo arrastrado de antes.
 */
function asientoConteo(cfg,p){
  const contado=Math.max(0,Math.round(+p.contado||0));
  const libros=p.saldos.reduce((s,x)=>s+x.saldo,0);
  const diferencia=libros-contado;
  const glosa='Ajuste de existencias según inventario al '+String(p.fecha).split('-').reverse().join('-');
  const avisos=[],movs=[];
  if(diferencia>0){
    if(cfg.cuentaCosto)movs.push({cd:cfg.cuentaCosto,nm:pdcNm(cfg.cuentaCosto),debe:diferencia,haber:0,glosa});
    repartir(diferencia,p.saldos).forEach(r=>movs.push({cd:r.cuenta,nm:pdcNm(r.cuenta),debe:0,haber:r.monto,glosa}));
  }else if(diferencia<0){
    const monto=-diferencia;
    const destino=p.saldos.length?repartir(monto,p.saldos):[];
    (destino.length?destino:[{cuenta:cfg.cuentasExistencias[0]||'',monto}]).forEach(r=>{
      if(r.cuenta)movs.push({cd:r.cuenta,nm:pdcNm(r.cuenta),debe:r.monto,haber:0,glosa});});
    if(cfg.cuentaCosto)movs.push({cd:cfg.cuentaCosto,nm:pdcNm(cfg.cuentaCosto),debe:0,haber:monto,glosa});
  }
  if(!cfg.cuentaCosto)avisos.push('Falta elegir la cuenta de costo en la configuración.');
  if(!diferencia)avisos.push('El inventario contado coincide con los libros: no hace falta ajuste.');
  if(libros>0&&contado>0&&Math.abs(diferencia)>libros*0.5)
    avisos.push('La diferencia es '+pctTxt(Math.abs(diferencia)/libros)+' del saldo en libros. Revisa que el conteo esté valorizado al costo y no al precio de venta.');
  const debe=movs.reduce((s,m)=>s+m.debe,0),haber=movs.reduce((s,m)=>s+m.haber,0);
  return {movs,diferencia,glosa,avisos,cuadra:debe===haber&&debe>0};
}

// ═══ Pantalla ═══

function mesPorDefecto(){
  const anio=+S.empresa.anio, hoy=new Date();
  if(hoy.getFullYear()!==anio)return anio+'-12';
  const m=hoy.getMonth();
  return m===0?(anio-1)+'-12':anio+'-'+String(m).padStart(2,'0');
}

async function renderCosteo(){
  const cont=document.getElementById('costeo-content');
  if(!cont)return;
  await cargarCosteo();
  if(!PERIODO||PERIODO.slice(0,4)!==String(S.empresa.anio))PERIODO=mesPorDefecto();

  const mes=datosMes(PERIODO);
  const r=costearMes(CFG,mes);
  const v=ventanaCosteo(PERIODO);
  const sug=margenSugerido(v.ventas,v.compras);
  const puede=puedeEditar('costeo');
  const ya=(S.asientos||[]).find(x=>!x.anulado&&x.origenAuto==='costeo'&&x.periodoCosteo===PERIODO);
  const deCosto=(PDC||[]).filter(c=>c.tp==='C');
  const deActivo=(PDC||[]).filter(c=>c.tp==='A'&&(CFG.cuentasExistencias.includes(String(c.cd))||/EXISTENC|MERCAD|MATERIA|INSUMO|MADERA|PRODUCTO/i.test(c.nm||'')));
  const cuentasVenta=[...new Set([...mes.ventas.map(x=>x.cuenta),...(CFG.lineas||[]).map(l=>l.cuentaVenta)])].sort();
  const opt=(lista,sel)=>lista.map(c=>'<option value="'+c.cd+'"'+(String(c.cd)===String(sel)?' selected':'')+'>'+esc(c.cd+' · '+c.nm)+'</option>').join('');
  const dato=(t,val,nota,destacado)=>'<div class="card" style="padding:10px'+(destacado?';border-color:var(--ok)':'')+'"><div class="muted" style="font-size:11px">'+esc(t)+'</div><div class="num" style="font-size:18px'+(destacado?';color:var(--ok);font-weight:600':'')+'">'+val+'</div>'+(nota?'<div class="muted" style="font-size:11px">'+esc(nota)+'</div>':'')+'</div>';

  cont.innerHTML=`
  ${ya?'<div class="alert ok">✓ '+esc(mesEnPalabras(PERIODO))+' ya está costeado: asiento N°'+ya.n+'. Para rehacerlo, anúlalo primero en el libro diario.</div>':''}

  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">1 · Cómo se costea esta empresa</h3>
      <div><label class="lbl" for="cost-mes">Mes</label>
        <input type="month" id="cost-mes" class="inp" style="width:150px" value="${PERIODO}"></div>
    </div>
    <div style="margin:8px 0">
      ${[['margen','Margen sobre ventas','Costo = ventas del mes × (1 − margen). Da un margen parejo mes a mes.'],
         ['margen_linea','Margen por línea de venta','Un margen distinto para cada cuenta de venta, cuando las líneas de negocio no se parecen.'],
         ['compras','Compras del período','Costo = lo que entró a existencias en el mes. Cuadra solo en el año, pero el margen mensual baila con el ritmo de compra.']]
        .map(([k,nm,ay])=>'<label style="display:block;margin:3px 0"><input type="radio" name="cost-metodo" value="'+k+'"'+(CFG.metodo===k?' checked':'')+(puede?'':' disabled')+'> <b>'+nm+'.</b> <span class="muted">'+ay+'</span></label>').join('')}
    </div>

    ${CFG.metodo==='margen'?`
    <div class="row" style="align-items:flex-end;gap:10px">
      <div><label class="lbl" for="cost-margen">Margen bruto (%)</label>
        <input type="number" step="0.1" id="cost-margen" class="inp num" style="width:100px" value="${(CFG.margen*100).toFixed(1)}" ${puede?'':'disabled'}></div>
      ${sug!=null?'<div class="muted">Lo que va del año da <b>'+pctTxt(sug)+'</b> ('+fmtC(v.ventas)+' de venta contra '+fmtC(v.compras)+' de compra a existencias).'
        +(puede&&Math.abs(sug-CFG.margen)>0.005?' <button class="btn sm" id="cost-usar-sug">Usar '+pctTxt(sug)+'</button>':'')+'</div>':''}
    </div>`:''}

    ${CFG.metodo==='margen_linea'?`
    <div>${cuentasVenta.length?cuentasVenta.map(cd=>{
      const l=(CFG.lineas||[]).find(x=>x.cuentaVenta===cd);
      return '<div class="row" style="align-items:flex-end;gap:8px;border-bottom:1px solid var(--bd);padding:4px 0">'
        +'<div style="flex:1;min-width:200px">'+esc(cd+' '+pdcNm(cd))+'</div>'
        +'<div><label class="lbl">Margen (%)</label><input type="number" step="0.1" class="inp num cost-lin-m" data-cd="'+cd+'" style="width:90px" value="'+(l?(l.margen*100).toFixed(1):'')+'" placeholder="sin margen" '+(puede?'':'disabled')+'></div>'
        +'<div><label class="lbl">Cuenta de costo</label><select class="inp cost-lin-c" data-cd="'+cd+'" style="width:240px" '+(puede?'':'disabled')+'><option value="">La general</option>'+opt(deCosto,l&&l.cuentaCosto)+'</select></div>'
        +'</div>';}).join(''):'<div class="muted">No hay ventas en este mes con las que armar las líneas. Elige un mes con ventas.</div>'}</div>`:''}

    <div class="row" style="gap:10px;align-items:flex-end;margin-top:8px">
      <div><label class="lbl" for="cost-cuenta">Cuenta de costo${CFG.metodo==='margen_linea'?' (para las líneas sin una propia)':''}</label>
        <select id="cost-cuenta" class="inp" style="width:280px" ${puede?'':'disabled'}><option value="">Elige una</option>${opt(deCosto,CFG.cuentaCosto)}</select></div>
      <div><label class="lbl" for="cost-meses">Avisar sobre (meses de compra)</label>
        <input type="number" min="1" max="60" id="cost-meses" class="inp num" style="width:80px" value="${CFG.mesesAviso}" ${puede?'':'disabled'}></div>
    </div>

    <div style="margin-top:8px">
      <div class="lbl">Cuentas de existencias de las que se descuenta</div>
      ${deActivo.map(c=>'<label style="margin-right:12px"><input type="checkbox" class="cost-ex" value="'+c.cd+'"'+(CFG.cuentasExistencias.includes(String(c.cd))?' checked':'')+(puede?'':' disabled')+'> '+esc(c.cd+' '+c.nm)+'</label>').join('')||'<span class="muted">El plan de esta empresa no tiene cuentas que parezcan de existencias.</span>'}
      <div class="muted" style="font-size:11px">El costo se reparte entre ellas a prorrata del saldo de cada una.</div>
    </div>
    ${puede?'<button class="btn" id="cost-guardar" style="margin-top:8px">Guardar configuración</button>':''}
  </div>

  <div class="card">
    <h3 style="margin:0 0 8px">2 · ${esc(mesEnPalabras(PERIODO))}</h3>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      ${dato('Ventas netas del mes',fmtC(r.ventasNetas))}
      ${dato('Compras a existencias',fmtC(mes.comprasExistencias))}
      ${dato('Costo de ventas',fmtC(r.costo),'',true)}
      ${dato('Margen que queda',r.ventasNetas>0?pctTxt(r.margenEfectivo):'—')}
      ${dato('Existencias después del asiento',fmtC(r.saldoDespues),mes.comprasPromedio>0?r.mesesDeCompra.toFixed(1).replace('.',',')+' meses de compra':'sin compras con que compararlo')}
    </div>
    ${r.avisos.map(a=>'<div class="alert warn">'+esc(a)+'</div>').join('')}
    ${r.movs.length?'<table class="tbl" style="margin-top:8px"><thead><tr><th>Cuenta</th><th></th><th class="r">Debe</th><th class="r">Haber</th></tr></thead><tbody>'
      +r.movs.map(m=>'<tr><td class="num">'+esc(m.cd)+'</td><td>'+esc(m.nm)+'</td><td class="r num">'+(m.debe?fmtC(m.debe):'')+'</td><td class="r num">'+(m.haber?fmtC(m.haber):'')+'</td></tr>').join('')
      +'</tbody></table><div class="muted" style="font-size:11px">Con fecha del último día del mes, tipo traspaso.</div>':''}
    ${puede&&!ya&&r.cuadra?'<button class="btn" id="cost-generar" style="margin-top:8px">Generar asiento de '+fmtC(r.costo)+'</button>':''}
    ${puede?'':'<div class="muted">Sólo puedes mirar: no tienes permiso de edición en Costeo de Ventas.</div>'}
  </div>

  <div class="card">
    <h3 style="margin:0 0 6px">3 · Ajuste por conteo</h3>
    <div class="muted">El costo de arriba es una estimación. Una vez al año, con el inventario físico que el SII pide al 31 de diciembre, el ajuste deja las existencias en su valor real y la diferencia se va a costo. Es también la forma de enderezar un saldo arrastrado de años anteriores. Valorízalo al costo, no al precio de venta.</div>
    <div class="row" style="gap:10px;align-items:flex-end;margin-top:8px">
      <div><label class="lbl" for="cost-cfecha">Fecha del conteo</label><input type="date" id="cost-cfecha" class="inp" style="width:150px" value="${S.empresa.anio}-12-31" ${puede?'':'disabled'}></div>
      <div><label class="lbl" for="cost-ccontado">Inventario contado</label><input type="number" id="cost-ccontado" class="inp num" style="width:150px" value="0" ${puede?'':'disabled'}></div>
      <div style="flex:1;min-width:200px"><label class="lbl" for="cost-cnotas">Notas</label><input type="text" id="cost-cnotas" class="inp" style="width:100%" maxlength="2000" placeholder="Quién contó, con qué criterio se valorizó…" ${puede?'':'disabled'}></div>
      ${puede?'<button class="btn" id="cost-conteo">Guardar conteo y generar ajuste</button>':''}
    </div>
    <div class="muted" style="margin-top:4px">En libros hoy: <b class="num">${fmtC(r.saldoAntes)}</b>${mes.saldos.length?' · '+mes.saldos.map(s=>esc(s.cuenta)+': '+fmtC(s.saldo)).join(' · '):''}</div>
    ${CONTEOS.length?'<table class="tbl" style="margin-top:8px"><thead><tr><th>Fecha</th><th class="r">En libros</th><th class="r">Contado</th><th class="r">Diferencia</th><th>Asiento</th><th>Notas</th></tr></thead><tbody>'
      +CONTEOS.slice().reverse().map(c=>{const as=(S.asientos||[]).find(x=>x.id===c.asientoId&&!x.anulado);
        return '<tr><td>'+esc(c.fecha)+'</td><td class="r num">'+fmtC(c.enLibros)+'</td><td class="r num">'+fmtC(c.contado)+'</td><td class="r num">'+fmtC(c.enLibros-c.contado)+'</td><td>'+(as?'N°'+as.n:'<span class="muted">anulado o sin asiento</span>')+'</td><td class="muted">'+esc(c.notas||'')+'</td></tr>';}).join('')
      +'</tbody></table>':''}
  </div>`;

  // ═══ Enlaces ═══
  const $=id=>document.getElementById(id);
  const refrescar=()=>renderCosteo();
  const guardarYRefrescar=async()=>{try{await guardarCfg();}catch(e){}refrescar();};

  const sm=$('cost-mes');if(sm)sm.addEventListener('change',()=>{PERIODO=sm.value||PERIODO;refrescar();});
  cont.querySelectorAll('input[name="cost-metodo"]').forEach(el=>el.addEventListener('change',()=>{CFG.metodo=el.value;guardarYRefrescar();}));
  const mg=$('cost-margen');if(mg)mg.addEventListener('change',()=>{CFG.margen=Math.max(-0.99,Math.min(0.99,(+mg.value||0)/100));guardarYRefrescar();});
  const us=$('cost-usar-sug');if(us)us.addEventListener('click',()=>{CFG.margen=sug;guardarYRefrescar();});
  const cc=$('cost-cuenta');if(cc)cc.addEventListener('change',()=>{CFG.cuentaCosto=cc.value;guardarYRefrescar();});
  const ms=$('cost-meses');if(ms)ms.addEventListener('change',()=>{CFG.mesesAviso=Math.max(1,Math.min(60,+ms.value||6));guardarYRefrescar();});
  cont.querySelectorAll('.cost-ex').forEach(el=>el.addEventListener('change',()=>{
    const cd=el.value;
    CFG.cuentasExistencias=el.checked?[...CFG.cuentasExistencias,cd].sort():CFG.cuentasExistencias.filter(x=>x!==cd);
    guardarYRefrescar();
  }));
  const ponerLinea=(cd,p)=>{
    const l=(CFG.lineas||[]).find(x=>x.cuentaVenta===cd);
    if(l)Object.assign(l,p);else CFG.lineas=[...(CFG.lineas||[]),{cuentaVenta:cd,margen:p.margen??CFG.margen,cuentaCosto:p.cuentaCosto||''}];
    guardarYRefrescar();
  };
  cont.querySelectorAll('.cost-lin-m').forEach(el=>el.addEventListener('change',()=>ponerLinea(el.dataset.cd,{margen:Math.max(-0.99,Math.min(0.99,(+el.value||0)/100))})));
  cont.querySelectorAll('.cost-lin-c').forEach(el=>el.addEventListener('change',()=>ponerLinea(el.dataset.cd,{cuentaCosto:el.value})));
  const bg=$('cost-guardar');if(bg)bg.addEventListener('click',async()=>{try{await guardarCfg();toast('✅ Configuración guardada');}catch(e){toast('❌ No se pudo guardar','e');}});
  const gen=$('cost-generar');if(gen)gen.addEventListener('click',generarAsientoCosteo);
  const con=$('cost-conteo');if(con)con.addEventListener('click',guardarConteoCosteo);
}

async function generarAsientoCosteo(){
  if(!puedeEditar('costeo')){toast('⚠️ No tienes permiso para contabilizar','e');return;}
  await cargarCosteo();
  const mes=datosMes(PERIODO);
  const r=costearMes(CFG,mes);
  if(!r.cuadra){toast(r.costo<=0?('⚠️ No hay costo que registrar en '+mesEnPalabras(PERIODO)):'⚠️ El asiento no cuadra con esta configuración','e');return;}
  const ya=(S.asientos||[]).find(x=>!x.anulado&&x.origenAuto==='costeo'&&x.periodoCosteo===PERIODO);
  if(ya){toast('⚠️ Ya existe el asiento N°'+ya.n+' para '+mesEnPalabras(PERIODO)+'. Anúlalo para rehacerlo','e');return;}
  const id='costeo-'+PERIODO+'-'+Date.now();
  const folio=proxFolioAsiento();
  const res=await persistirAsientosCritico(()=>{S.asientos.push({id,n:folio,fecha:finDeMes(PERIODO),glosa:r.glosa,
    movs:r.movs,tipo:'traspaso',origenAuto:'costeo',periodoCosteo:PERIODO,creadoEn:new Date().toISOString()});});
  if(!res.ok){toast('❌ No se pudo guardar el asiento. La operación NO se contabilizó.','e');return;}
  toast('✅ Asiento N°'+folio+' generado ('+fmtC(r.costo)+' de costo de '+mesEnPalabras(PERIODO)+')');
  renderCosteo();if(typeof updateHdr==='function')updateHdr();
}

async function guardarConteoCosteo(){
  if(!puedeEditar('costeo')){toast('⚠️ No tienes permiso para contabilizar','e');return;}
  await cargarCosteo();
  const fecha=(document.getElementById('cost-cfecha')||{}).value||'';
  const contado=Math.max(0,Math.round(+((document.getElementById('cost-ccontado')||{}).value)||0));
  const notas=((document.getElementById('cost-cnotas')||{}).value||'').slice(0,2000);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){toast('⚠️ Indica la fecha del conteo','e');return;}
  const saldos=CFG.cuentasExistencias.map(cd=>{let s=0;recorrer((c,debe,haber)=>{if(c===cd)s+=debe-haber;},null,fecha);return {cuenta:cd,saldo:Math.round(s)};});
  const enLibros=saldos.reduce((s,x)=>s+x.saldo,0);
  const a=asientoConteo(CFG,{fecha,contado,saldos});
  if(!a.diferencia){toast('⚠️ El inventario contado coincide con los libros: no hay nada que ajustar','e');return;}
  if(!a.cuadra){toast('⚠️ El ajuste no cuadra. Revisa las cuentas de la configuración','e');return;}
  const id='costeo-conteo-'+fecha+'-'+Date.now();
  const folio=proxFolioAsiento();
  const res=await persistirAsientosCritico(()=>{S.asientos.push({id,n:folio,fecha,glosa:a.glosa,movs:a.movs,
    tipo:'traspaso',origenAuto:'costeo-conteo',creadoEn:new Date().toISOString()});});
  if(!res.ok){toast('❌ No se pudo guardar el asiento. La operación NO se contabilizó.','e');return;}
  CONTEOS.push({fecha,contado,enLibros,notas,asientoId:id,creadoEn:new Date().toISOString()});
  try{await guardarConteos();}catch(e){}
  toast('✅ Asiento N°'+folio+': diferencia de '+fmtC(Math.abs(a.diferencia))+(a.diferencia>0?' cargada a costo':' devuelta a existencias'));
  renderCosteo();if(typeof updateHdr==='function')updateHdr();
}

/** Se llama al cambiar de empresa o de año: obliga a releer la configuración. */
function resetCosteo(){CARGADO=false;CFG=CFG_DEFAULT();CONTEOS=[];PERIODO='';}

export {renderCosteo, generarAsientoCosteo, guardarConteoCosteo, resetCosteo,
        costearMes, asientoConteo, margenSugerido, sugerirCuentas, datosMes, mesEnPalabras};
