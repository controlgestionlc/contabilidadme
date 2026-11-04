// activofijo.js — Activos fijos y depreciación
import {toast, fmtC, fmt, today, pdcNm, PDC, pn} from './core.js';
import {updateHdr} from './empresa.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {proxFolioAsiento} from './asientos.js';
import {rerender} from './ui.js';
import {ejercicioCerrado,persistirAsientosCritico} from './contabilidad-v2.js';
import './storage.js';

let AFB={editId:null}; // form de activo fijo (estado interno)

// ═══ ACTIVO FIJO Y DEPRECIACIÓN ═══
// Categorías: cada una mapea a su cuenta de activo, depreciación acumulada y gasto.
// Vida útil normal según tabla del SII (Res. Ex. N°43/2002).
const AF_CATEGORIAS=[
  {k:'bienes_raices', lbl:'Bienes raíces (construcciones)', activo:'1201002', deprAcum:'1201202', gasto:'3301002', vida:40},
  {k:'maquinarias',   lbl:'Maquinarias y equipos',          activo:'1201003', deprAcum:'1201203', gasto:'3301003', vida:15},
  {k:'instalaciones', lbl:'Instalaciones',                  activo:'1201004', deprAcum:'1201204', gasto:'3301004', vida:10},
  {k:'vehiculos',     lbl:'Vehículos (camiones, remolques)',activo:'1201005', deprAcum:'1201205', gasto:'3301005', vida:7},
  {k:'equipos_ofic',  lbl:'Equipos de oficina / muebles',   activo:'1201006', deprAcum:'1201206', gasto:'3301006', vida:7},
];
const afCat=k=>AF_CATEGORIAS.find(c=>c.k===k)||AF_CATEGORIAS[0];
// Depreciación acelerada general, Art. 31 N°5 LIR: 1/3 de la vida normal,
// descartando la fracción. Como sólo procede desde 3 años, el piso es 1 año.
// El régimen especial del N°5 bis (1/10, si se cumplen sus requisitos) no se
// confunde con este método y debe modelarse como una opción tributaria aparte.
const vidaAcelerada=vidaNormal=>Math.max(1,Math.floor(vidaNormal/3));

// Calcula depreciación separando política financiera y base tributaria.
// Los registros antiguos siguen siendo compatibles mediante los fallbacks vida/metodo.
// V2.22.20 · Obras en curso y mejoras.
//  - Ficha en etapa 'obra' (construcción o puesta en marcha): acumula sus facturas
//    en 1201007 OBRAS EN CURSO y NO se deprecia. «Poner en servicio» traspasa el
//    total a la cuenta del bien y fija el inicio de la depreciación.
//  - Mejora (factura posterior que aumenta capacidad o vida del bien): suma al
//    costo y se deprecia desde su fecha en la vida útil RESTANTE del bien. Si al
//    bien le quedan menos de 12 meses (o ya terminó), la mejora se deprecia en 12.
const CUENTA_OBRAS='1201007';
const enObra=b=>b?.etapa==='obra';
const costosDe=(b,tipo)=>(b?.costos||[]).filter(c=>c&&c.tipo===tipo&&(+c.monto||0)>0);
const indiceMes=f=>{const [y,m]=String(f||'').split('-').map(Number);return y?y*12+((m||1)-1):0;};
function deprMejoras(bien,anioCierre,ambito,vidaUsada,fechaInicio){
  const esTrib=ambito==='tributario';
  const mejoras=costosDe(bien,'mejora');
  if(!mejoras.length)return {valor:0,depr:0,acum:0};
  const inicioBien=fechaInicio&&/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)?indiceMes(fechaInicio):(+(String(bien.fecha||'').slice(0,4))+1)*12;
  const finVida=inicioBien+Math.max(1,Math.round(vidaUsada*12));
  const inicioEj=anioCierre*12,finEj=inicioEj+12;
  let valor=0,depr=0,acum=0;
  for(const c of mejoras){
    const monto=Math.round(+(esTrib?(c.montoTributario??c.monto):c.monto)||0);if(!monto)continue;
    const ini=Math.max(inicioBien,indiceMes(c.fecha));
    const fin=Math.max(finVida,ini+12);
    const cuota=monto/(fin-ini);
    valor+=monto;
    depr+=Math.min(monto,Math.round(cuota*Math.max(0,Math.min(fin,finEj)-Math.max(ini,inicioEj))));
    acum+=Math.min(monto,Math.round(cuota*Math.max(0,Math.min(fin,finEj)-ini)));
  }
  return {valor,depr,acum};
}
function calcularDepreciacionBase(bien,anioCierre,ambito='contable'){
  const r=calcularDepreciacionBienBase(bien,anioCierre,ambito);
  if(enObra(bien))return {...r,deprEsteAnio:0,acumulada:0,valorLibro:r.base+(+(ambito==='tributario'?(bien.residualTributario??0):(bien.residualContable??bien.residual))||0),totalmenteDepreciado:false,enObra:true,mejoras:0};
  const m=deprMejoras(bien,anioCierre,ambito,r.vidaUsada,r.fechaInicio);
  if(!m.valor)return r;
  const acumulada=r.acumulada+m.acum;
  return {...r,mejoras:m.valor,base:r.base+m.valor,deprEsteAnio:r.deprEsteAnio+m.depr,acumulada,valorLibro:r.valorLibro+m.valor-m.acum,
    totalmenteDepreciado:r.totalmenteDepreciado&&m.acum>=m.valor};
}
function calcularDepreciacionBienBase(bien,anioCierre,ambito='contable'){
  const esTrib=ambito==='tributario';
  const vidaNormal=+(esTrib?(bien.vidaTributaria||bien.vida):(bien.vidaContable||bien.vida))||afCat(bien.cat).vida;
  const metodo=esTrib?(bien.metodoTributario||bien.metodo||'lineal'):(bien.metodoContable||'lineal');
  const vidaUsada=metodo==='acelerada'?vidaAcelerada(vidaNormal):vidaNormal;
  const valor=+(esTrib?(bien.valorTributario??bien.valor):(bien.valorContable??bien.valor))||0;
  const residual=+(esTrib?(bien.residualTributario??0):(bien.residualContable??bien.residual))||0;
  const base=Math.max(0,valor-residual);
  const fechaInicio=esTrib?bien.fechaInicioDepTributaria:bien.fechaInicioDepContable;

  // V2.9: si la ficha tiene fecha de inicio específica se prorratea por meses.
  // Los registros históricos sin fecha conservan el algoritmo legado para no
  // alterar retroactivamente ejercicios ya contabilizados.
  if(fechaInicio&&/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)){
    const [yi,mi]=fechaInicio.split('-').map(Number);
    const totalMeses=Math.max(1,Math.round(vidaUsada*12));
    const indiceInicio=yi*12+(mi-1);
    const inicioEj=anioCierre*12, finEj=inicioEj+12;
    const finVida=indiceInicio+totalMeses;
    const desde=Math.max(indiceInicio,inicioEj),hasta=Math.min(finVida,finEj);
    const mesesEsteAnio=Math.max(0,hasta-desde);
    const mesesHastaCierre=Math.max(0,Math.min(finVida,finEj)-indiceInicio);
    const cuotaMensual=totalMeses>0?base/totalMeses:0;
    const deprEsteAnio=Math.min(base,Math.round(cuotaMensual*mesesEsteAnio));
    const acumulada=Math.min(base,Math.round(cuotaMensual*mesesHastaCierre));
    const valorLibro=valor-acumulada;
    return {ambito,metodo,vidaNormal,vidaUsada,base,cuotaAnual:Math.round(cuotaMensual*12),cuotaMensual,fechaInicio,mesesEsteAnio,deprEsteAnio,acumulada,valorLibro,totalmenteDepreciado:mesesHastaCierre>=totalMeses};
  }

  // Compatibilidad histórica: depreciación anual desde el ejercicio siguiente.
  const cuotaAnual=vidaUsada>0?Math.round(base/vidaUsada):0;
  const anioCompra=+(bien.fecha||'').slice(0,4);
  const anioInicio=anioCompra+1;
  let aniosTranscurridos=anioCierre-anioInicio+1;
  if(aniosTranscurridos<0)aniosTranscurridos=0;
  if(aniosTranscurridos>vidaUsada)aniosTranscurridos=vidaUsada;
  const deprEsteAnio=(anioCierre>=anioInicio&&anioCierre<anioInicio+vidaUsada)?cuotaAnual:0;
  let acumulada=cuotaAnual*aniosTranscurridos;
  if(acumulada>base)acumulada=base;
  const valorLibro=valor-acumulada;
  const totalmenteDepreciado=aniosTranscurridos>=vidaUsada;
  return {ambito,metodo,vidaNormal,vidaUsada,base,cuotaAnual,anioInicio,aniosTranscurridos,deprEsteAnio,acumulada,valorLibro,totalmenteDepreciado,legacy:true};
}
function calcularDepreciacionContable(bien,anioCierre){return calcularDepreciacionBase(bien,anioCierre,'contable');}
function calcularDepreciacionTributaria(bien,anioCierre){return calcularDepreciacionBase(bien,anioCierre,'tributario');}
// Alias histórico: los asientos financieros SIEMPRE usan depreciación contable.
function calcularDepreciacion(bien,anioCierre){return calcularDepreciacionContable(bien,anioCierre);}

// Compra de origen: la ficha puede quedar ligada al documento que generó la
// inversión. No se contabiliza nuevamente: el vínculo es sólo trazabilidad.
function comprasElegiblesAF(){
  return (S.compras||[]).filter(d=>d.estado!=='anulado'&&(
    d.tratamientoIVA==='activo_fijo'||(+d.ivaActivoFijo||0)>0||
    (d.dist||[]).some(l=>String(l.cuenta||'').startsWith('12'))
  )).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
}
function opcionesCompraAF(sel=''){
  const docs=comprasElegiblesAF();
  return '<option value="">— Sin documento vinculado —</option>'+docs.map(d=>{
    const rot=`${d.fecha||''} · DTE ${d.tipoDTE||''} N°${d.numero||''} · ${d.razonSocial||''} · ${fmtC(d.neto||d.total||0)}`;
    return `<option value="${d.id}" ${d.id===sel?'selected':''}>${rot}</option>`;
  }).join('');
}
function onCompraAF(){
  const id=document.getElementById('afb-compra')?.value||'';
  const d=(S.compras||[]).find(x=>x.id===id);if(!d){previewAF();return;}
  document.getElementById('afb-fecha').value=d.fecha||today();
  // Para activo fijo se usa base neta/exenta + impuestos que formen parte del costo,
  // nunca el IVA recuperable. Si la compra trae distribución, preferimos el monto
  // efectivamente cargado a cuentas de activo 12xxxx.
  const desdeDist=(d.dist||[]).filter(l=>String(l.cuenta||'').startsWith('12')).reduce((t,l)=>t+(+l.monto||0),0);
  const base=desdeDist||(+d.neto||0)+(+d.exento||0)+(+d.ivaNoRecuperable||0)+((d.tratamientoOtrosImpuestos==='recuperable')?0:(+d.otrosImpuestos||0));
  if(base>0){document.getElementById('afb-valor').value=Math.round(base);document.getElementById('afb-valor-tributario').value=Math.round(base);}
  document.getElementById('afb-inicio-contable').value=d.fecha||today();
  document.getElementById('afb-inicio-tributario').value=d.fecha||today();
  const desc=document.getElementById('afb-desc');
  if(desc&&!desc.value.trim())desc.value=`${d.razonSocial||'Activo fijo'} · DTE ${d.tipoDTE||''} N°${d.numero||''}`;
  previewAF();
}

// Conciliación financiera/tributaria del activo fijo para Renta.
// En regímenes con depreciación instantánea, la base tributaria del año es el
// valor tributario de las adquisiciones del ejercicio. En los demás, se usa la
// cuota tributaria calculada por ficha.
function conciliacionDepreciacionAF(anio,{deprInstantanea=false}={}){
  const bienes=(S.activos||[]).filter(b=>b.estado!=='anulado');
  const detalle=bienes.map(b=>{
    const c=calcularDepreciacionContable(b,anio);
    const t=calcularDepreciacionTributaria(b,anio);
    const adquirido=+(String(b.fecha||'').slice(0,4))===+anio;
    // V2.22.20 · obra en curso: aún no se deprecia; mejoras del año: también se rebajan de inmediato
    const mejorasAnio=costosDe(b,'mejora').filter(x=>String(x.fecha||'').startsWith(String(anio))).reduce((s,x)=>s+Math.round(+(x.montoTributario??x.monto)||0),0);
    const depTribEj=enObra(b)?0:deprInstantanea?((adquirido?Math.max(0,+(b.valorTributario??b.valor)||0):0)+mejorasAnio):Math.max(0,t.deprEsteAnio);
    return {id:b.id,nm:b.desc||b.nombre||'Activo',fecha:b.fecha,contable:c.deprEsteAnio,tributaria:depTribEj,diferencia:depTribEj-c.deprEsteAnio,valorTributario:+(b.valorTributario??b.valor)||0};
  });
  return {
    contable:detalle.reduce((s,x)=>s+x.contable,0),
    tributaria:detalle.reduce((s,x)=>s+x.tributaria,0),
    diferencia:detalle.reduce((s,x)=>s+x.diferencia,0),detalle,
    instantanea:!!deprInstantanea
  };
}

function abrirFormAF(){
  AFB={editId:null};
  const f=document.getElementById('af-form-bien');f.style.display='block';
  document.getElementById('afb-title').textContent='Nuevo Activo Fijo';
  const sel=document.getElementById('afb-cat');
  sel.innerHTML=AF_CATEGORIAS.map(c=>`<option value="${c.k}">${c.lbl}</option>`).join('');
  document.getElementById('afb-desc').value='';
  const compraSel=document.getElementById('afb-compra');if(compraSel)compraSel.innerHTML=opcionesCompraAF('');
  document.getElementById('afb-fecha').value=today();
  document.getElementById('afb-valor').value='';
  document.getElementById('afb-residual').value='0';
  document.getElementById('afb-valor-tributario').value='';
  document.getElementById('afb-residual-tributario').value='0';
  document.getElementById('afb-inicio-contable').value=today();
  document.getElementById('afb-inicio-tributario').value=today();
  document.getElementById('afb-metodo-contable').value='lineal';
  document.getElementById('afb-metodo-tributario').value='lineal';
  {const et=document.getElementById('afb-etapa');if(et){et.value='servicio';et.disabled=false;}}
  onCatAF(); // setea vida útil default
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
function onCatAF(){
  const k=document.getElementById('afb-cat').value;
  document.getElementById('afb-vida-contable').value=afCat(k).vida;
  document.getElementById('afb-vida-tributaria').value=afCat(k).vida;
  previewAF();
}
function cerrarFormAF(){document.getElementById('af-form-bien').style.display='none';AFB={editId:null};}

function previewAF(){
  const bien={
    cat:document.getElementById('afb-cat').value,
    fecha:document.getElementById('afb-fecha').value,
    valor:pn(document.getElementById('afb-valor').value),
    valorContable:pn(document.getElementById('afb-valor').value),
    valorTributario:pn(document.getElementById('afb-valor-tributario').value)||pn(document.getElementById('afb-valor').value),
    residual:pn(document.getElementById('afb-residual').value),
    residualContable:pn(document.getElementById('afb-residual').value),
    residualTributario:pn(document.getElementById('afb-residual-tributario').value),
    vidaContable:+document.getElementById('afb-vida-contable').value||0,
    vidaTributaria:+document.getElementById('afb-vida-tributaria').value||0,
    metodoContable:document.getElementById('afb-metodo-contable').value,
    metodoTributario:document.getElementById('afb-metodo-tributario').value,
    fechaInicioDepContable:document.getElementById('afb-inicio-contable').value,
    fechaInicioDepTributaria:document.getElementById('afb-inicio-tributario').value,
  };
  const el=document.getElementById('afb-preview');
  if(document.getElementById('afb-etapa')?.value==='obra'){el.innerHTML=`<div class="info-tip" style="font-size:11px">🏗️ <strong>Obra en curso:</strong> no se deprecia. Agrega sus facturas con 🧾 en la lista (cárgalas en Compras a 1201007 OBRAS EN CURSO). El valor de la ficha es la suma de esas facturas (más el monto inicial, si hay). Al terminar, «Poner en servicio» genera el traspaso a ${afCat(bien.cat).activo} y la depreciación parte en esa fecha.</div>`;return;}
  if(!bien.valor||!bien.vidaContable||!bien.vidaTributaria){el.innerHTML='';return;}
  const anio=+S.empresa.anio;
  const dc=calcularDepreciacionContable(bien,anio),dt=calcularDepreciacionTributaria(bien,anio);
  const dif=dt.acumulada-dc.acumulada;
  el.innerHTML=`<div class="info-tip" style="font-size:11px">
    📐 <strong>Separación financiera / tributaria (${anio})</strong><br>
    • Contable: base ${fmtC(dc.base)} · ${dc.metodo} · ${dc.vidaUsada} años${dc.fechaInicio?' · inicio '+dc.fechaInicio:''} · depreciación ${anio} ${fmtC(dc.deprEsteAnio)} · acumulada ${fmtC(dc.acumulada)} · valor libro ${fmtC(dc.valorLibro)}<br>
    • Tributaria: base ${fmtC(dt.base)} · ${dt.metodo} · ${dt.vidaUsada} años${dt.fechaInicio?' · inicio '+dt.fechaInicio:''} · depreciación ${anio} ${fmtC(dt.deprEsteAnio)} · acumulada ${fmtC(dt.acumulada)} · valor tributario neto ${fmtC(dt.valorLibro)}<br>
    • Diferencia temporaria acumulada (deprec. tributaria − contable): <strong>${fmtC(dif)}</strong><br>
    <span style="color:var(--mt)">Los asientos financieros usan únicamente la depreciación contable. La tributaria se usa para conciliación de Renta y no crea asientos financieros.</span>
  </div>`;
}

async function guardarAF(){
  const desc=document.getElementById('afb-desc').value.trim();
  const cat=document.getElementById('afb-cat').value;
  const fecha=document.getElementById('afb-fecha').value;
  const valor=pn(document.getElementById('afb-valor').value);
  const residual=pn(document.getElementById('afb-residual').value);
  const valorTributario=pn(document.getElementById('afb-valor-tributario').value)||valor;
  const residualTributario=pn(document.getElementById('afb-residual-tributario').value);
  const fechaInicioDepContable=document.getElementById('afb-inicio-contable').value||fecha;
  const fechaInicioDepTributaria=document.getElementById('afb-inicio-tributario').value||fecha;
  const vidaContable=+document.getElementById('afb-vida-contable').value||0;
  const vidaTributaria=+document.getElementById('afb-vida-tributaria').value||0;
  const metodoContable=document.getElementById('afb-metodo-contable').value;
  const metodoTributario=document.getElementById('afb-metodo-tributario').value;
  const compraOrigenId=document.getElementById('afb-compra')?.value||'';
  const compraOrigen=(S.compras||[]).find(d=>d.id===compraOrigenId);
  const prev=AFB.editId?(S.activos||[]).find(a=>a.id===AFB.editId):null;
  const obra=(document.getElementById('afb-etapa')?.value||'servicio')==='obra';
  if(prev&&!enObra(prev)&&obra){toast('⚠️ Un bien ya en servicio no vuelve a obra en curso. Sus facturas nuevas se agregan como mejoras (🧾).','e');return;}
  if(!desc){toast('⚠️ Ingresa la descripción del bien','e');return;}
  if(!fecha){toast('⚠️ Ingresa la fecha de compra','e');return;}
  if(valor<=0&&!obra){toast('⚠️ El valor debe ser mayor a 0','e');return;}
  if(vidaContable<=0||vidaTributaria<=0){toast('⚠️ Las vidas útiles contable y tributaria deben ser mayores a 0','e');return;}
  if(valor>0&&residual>=valor){toast('⚠️ El valor residual contable no puede ser mayor o igual al valor','e');return;}
  if(valor>0&&(valorTributario<=0||residualTributario>=valorTributario)){toast('⚠️ Revisa la base y residual tributarios','e');return;}
  const c=afCat(cat);
  const bien={
    // V2.22.20 · conserva facturas vinculadas (obras y mejoras), etapa y puesta en servicio
    ...(prev?{costos:prev.costos,fechaServicio:prev.fechaServicio,asientoServicioId:prev.asientoServicioId}:{}),
    ...(obra?{etapa:'obra'}:{}),
    id:AFB.editId||'af_'+Date.now(),
    desc,cat,fecha,valor,residual,
    valorContable:valor,residualContable:residual,vidaContable,metodoContable,fechaInicioDepContable,
    valorTributario,residualTributario,vidaTributaria,metodoTributario,fechaInicioDepTributaria,
    // compatibilidad con lectores históricos
    vida:vidaTributaria,metodo:metodoTributario,
    cuentaActivo:c.activo,cuentaDeprAcum:c.deprAcum,cuentaGasto:c.gasto,
    compraOrigenId:compraOrigenId||null,compraOrigenRef:compraOrigen?{fecha:compraOrigen.fecha,tipoDTE:compraOrigen.tipoDTE,numero:compraOrigen.numero,rutCodigo:compraOrigen.rutCodigo}:null,
  };
  const snap=JSON.stringify(S.activos||[]);
  if(AFB.editId){const i=S.activos.findIndex(a=>a.id===AFB.editId);if(i>=0)S.activos[i]=bien;}
  else S.activos.push(bien);
  const r=await window.storage.set('activos',JSON.stringify(S.activos));
  if(r&&r.ok===false){S.activos=JSON.parse(snap);toast('❌ No se pudo guardar el activo. No se realizaron cambios.','e');return;}
  toast(AFB.editId?'✅ Activo actualizado':'✅ Activo registrado');
  cerrarFormAF();
  renderActivoFijo();updateHdr();
}
function editarAF(id){
  const b=S.activos.find(a=>a.id===id);if(!b)return;
  AFB={editId:id};
  const f=document.getElementById('af-form-bien');f.style.display='block';
  document.getElementById('afb-title').textContent='Editando Activo';
  document.getElementById('afb-cat').innerHTML=AF_CATEGORIAS.map(c=>`<option value="${c.k}" ${c.k===b.cat?'selected':''}>${c.lbl}</option>`).join('');
  document.getElementById('afb-desc').value=b.desc;
  const compraSel=document.getElementById('afb-compra');if(compraSel)compraSel.innerHTML=opcionesCompraAF(b.compraOrigenId||'');
  document.getElementById('afb-fecha').value=b.fecha;
  document.getElementById('afb-valor').value=b.valor;
  document.getElementById('afb-residual').value=b.residualContable??b.residual??0;
  document.getElementById('afb-valor-tributario').value=b.valorTributario??b.valor??0;
  document.getElementById('afb-residual-tributario').value=b.residualTributario??0;
  const yCompra=+(b.fecha||'').slice(0,4)||+S.empresa.anio;
  document.getElementById('afb-inicio-contable').value=b.fechaInicioDepContable||`${yCompra+1}-01-01`;
  document.getElementById('afb-inicio-tributario').value=b.fechaInicioDepTributaria||`${yCompra+1}-01-01`;
  document.getElementById('afb-vida-contable').value=b.vidaContable||b.vida||afCat(b.cat).vida;
  document.getElementById('afb-metodo-contable').value=b.metodoContable||'lineal';
  document.getElementById('afb-vida-tributaria').value=b.vidaTributaria||b.vida||afCat(b.cat).vida;
  document.getElementById('afb-metodo-tributario').value=b.metodoTributario||b.metodo||'lineal';
  {const et=document.getElementById('afb-etapa');if(et){et.value=enObra(b)?'obra':'servicio';et.disabled=!enObra(b);}}
  previewAF();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}
async function eliminarAF(id){
  const b=S.activos.find(a=>a.id===id);if(!b)return;
  if(!confirm(`¿Eliminar el activo "${b.desc}"?\nEsta acción no se puede deshacer.`))return;
  const snap=JSON.stringify(S.activos||[]);
  S.activos=S.activos.filter(a=>a.id!==id);
  const r=await window.storage.set('activos',JSON.stringify(S.activos));
  if(r&&r.ok===false){S.activos=JSON.parse(snap);toast('❌ No se pudo eliminar el activo.','e');return;}
  renderActivoFijo();updateHdr();toast('🗑 Activo eliminado');
}

// Genera el asiento financiero de depreciación del ejercicio. El asiento es
// único por año y conserva el detalle de activos que lo componen para auditoría.
async function generarAsientoDepreciacion(){
  const anio=S.empresa.anio;
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado. Reabre antes de registrar depreciación.','e');return;}
  const idDep=`dep_${anio}`;
  const existente=S.asientos.find(a=>!a.anulado&&(a.id===idDep||(a.tipo==='depreciacion'&&String(a.fecha||'').startsWith(String(anio)))));
  if(existente){toast(`⚠️ Ya existe depreciación activa para ${anio} (N°${existente.n||'—'}). Anúlala antes de regenerar.`, 'e');return;}
  const porGasto={},porAcum={},detalleActivos=[];let total=0;
  (S.activos||[]).filter(b=>b.estado!=='anulado').forEach(b=>{
    const d=calcularDepreciacionContable(b,anio);
    if(d.deprEsteAnio<=0)return;
    porGasto[b.cuentaGasto]=(porGasto[b.cuentaGasto]||0)+d.deprEsteAnio;
    porAcum[b.cuentaDeprAcum]=(porAcum[b.cuentaDeprAcum]||0)+d.deprEsteAnio;
    detalleActivos.push({activoId:b.id,desc:b.desc,monto:d.deprEsteAnio,cuentaGasto:b.cuentaGasto,cuentaDeprAcum:b.cuentaDeprAcum});
    total+=d.deprEsteAnio;
  });
  if(total<=0){toast('⚠️ No hay depreciación que registrar para '+anio,'e');return;}
  const movs=[];
  Object.keys(porGasto).sort().forEach(cd=>movs.push({cd,nm:pdcNm(cd),debe:porGasto[cd],haber:0}));
  Object.keys(porAcum).sort().forEach(cd=>movs.push({cd,nm:pdcNm(cd),debe:0,haber:porAcum[cd]}));
  const fecha=anio+'-12-31';
  const folio=proxFolioAsiento();
  const r=await persistirAsientosCritico(()=>{S.asientos.push({id:idDep,n:folio,fecha,glosa:'Depreciación del ejercicio '+anio,movs,tipo:'depreciacion',origenAuto:'activofijo',periodoAF:String(anio),detalleActivos});});
  if(!r.ok){toast('❌ No se pudo guardar la depreciación. La operación NO se contabilizó.','e');return;}
  toast('✅ Asiento N°'+folio+' de depreciación creado ('+fmtC(total)+')');
  renderActivoFijo();updateHdr();
}

// ═══ V2.22.20 · Facturas de la ficha: obras en curso y mejoras ═══
let AF_ABIERTO='';   // ficha con su panel de facturas desplegado
const escAF=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function comprasUsadasAF(){
  const u=new Set();
  (S.activos||[]).forEach(b=>{if(b.compraOrigenId)u.add(b.compraOrigenId);(b.costos||[]).forEach(c=>{if(c.compraId)u.add(c.compraId);});});
  return u;
}
// Monto de la compra que corresponde a la ficha: las líneas cargadas a 1201007
// (obra) o a la cuenta del bien (mejora); si no hay, todas las 12xxxx; si no, la base.
function montoCompraAF(d,b){
  const dist=(d.dist||[]).filter(l=>+l.monto);
  const objetivo=enObra(b)?CUENTA_OBRAS:b.cuentaActivo;
  let ls=dist.filter(l=>String(l.cuenta)===objetivo);
  if(!ls.length)ls=dist.filter(l=>String(l.cuenta||'').startsWith('12'));
  const base=(+d.neto||0)+(+d.exento||0)+(+d.ivaNoRecuperable||0)+((d.tratamientoOtrosImpuestos==='recuperable')?0:(+d.otrosImpuestos||0));
  return {monto:Math.round(ls.length?ls.reduce((s,l)=>s+(+l.monto||0),0):base),cuenta:ls.length?String(ls[0].cuenta):''};
}
function toggleCostosAF(id){AF_ABIERTO=AF_ABIERTO===id?'':id;renderActivoFijo();}
function onCompraCostoAF(id){
  const b=(S.activos||[]).find(a=>a.id===id);const cid=document.getElementById('afc-compra')?.value||'';
  const d=(S.compras||[]).find(x=>x.id===cid);if(!b||!d)return;
  const m=montoCompraAF(d,b);
  document.getElementById('afc-monto').value=m.monto||'';
  document.getElementById('afc-fecha').value=d.fecha||today();
  const ds=document.getElementById('afc-desc');if(ds&&!ds.value.trim())ds.value=`${d.razonSocial||''} · DTE ${d.tipoDTE||''} N°${d.numero||''}`;
}
async function guardarActivosAF(snap,ok){
  const r=await window.storage.set('activos',JSON.stringify(S.activos));
  if(r&&r.ok===false){S.activos=JSON.parse(snap);toast('❌ No se pudo guardar el activo. No se realizaron cambios.','e');return false;}
  if(ok)toast(ok);
  renderActivoFijo();updateHdr();return true;
}
async function agregarCostoAF(id){
  const b=(S.activos||[]).find(a=>a.id===id);if(!b)return;
  const tipo=enObra(b)?'obra':'mejora';
  const compraId=document.getElementById('afc-compra')?.value||'';
  const d=(S.compras||[]).find(x=>x.id===compraId);
  const monto=Math.round(pn(document.getElementById('afc-monto')?.value));
  const fecha=document.getElementById('afc-fecha')?.value||'';
  const desc=(document.getElementById('afc-desc')?.value||'').trim()||(d?`${d.razonSocial||''} · DTE ${d.tipoDTE||''} N°${d.numero||''}`:'');
  if(!(monto>0)){toast('⚠️ Ingresa el monto','e');return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){toast('⚠️ Ingresa la fecha','e');return;}
  if(!desc){toast('⚠️ Elige la factura o escribe una descripción','e');return;}
  if(tipo==='mejora'&&fecha<(b.fechaInicioDepContable||b.fecha||'')){toast('⚠️ La mejora no puede ser anterior al inicio de la depreciación del bien','e');return;}
  const cuenta=d?montoCompraAF(d,b).cuenta:(tipo==='obra'?CUENTA_OBRAS:b.cuentaActivo);
  if(d&&tipo==='obra'&&cuenta!==CUENTA_OBRAS&&!confirm(`La factura no está cargada a ${CUENTA_OBRAS} OBRAS EN CURSO (está en ${cuenta||'otra cuenta'}).\nSe agrega a la ficha, pero no se incluirá en el traspaso al poner en servicio. ¿Continuar?`))return;
  const snap=JSON.stringify(S.activos);
  const costo={id:'afc_'+Date.now(),tipo,fecha,monto,desc,cuenta,...(d?{compraId:d.id,compraRef:{fecha:d.fecha,tipoDTE:d.tipoDTE,numero:d.numero,rutCodigo:d.rutCodigo}}:{})};
  b.costos=[...(b.costos||[]),costo];
  // Las facturas de obra forman el valor de la ficha; las mejoras se deprecian aparte
  if(tipo==='obra'){b.valor=(+b.valor||0)+monto;b.valorContable=(+(b.valorContable??0)||0)+monto;b.valorTributario=(+(b.valorTributario??0)||0)+monto;}
  await guardarActivosAF(snap,tipo==='obra'?`✅ Factura agregada a la obra (${fmtC(monto)})`:`✅ Mejora agregada (${fmtC(monto)}): se deprecia en la vida restante del bien`);
}
async function quitarCostoAF(id,cid){
  const b=(S.activos||[]).find(a=>a.id===id);const c=(b?.costos||[]).find(x=>x.id===cid);if(!b||!c)return;
  if(c.tipo==='obra'&&!enObra(b)){toast('⚠️ El bien ya está en servicio: su costo de obra no se quita aquí. Edita la ficha o anula el traspaso.','e');return;}
  if(!confirm(`¿Quitar "${c.desc}" (${fmtC(c.monto)}) de la ficha?\nLa compra no se modifica.`))return;
  const snap=JSON.stringify(S.activos);
  b.costos=b.costos.filter(x=>x.id!==cid);
  if(c.tipo==='obra'){b.valor=Math.max(0,(+b.valor||0)-c.monto);b.valorContable=Math.max(0,(+(b.valorContable??0)||0)-c.monto);b.valorTributario=Math.max(0,(+(b.valorTributario??0)||0)-c.monto);}
  await guardarActivosAF(snap,'🗑 Factura quitada de la ficha');
}
// Termina la obra: traspasa lo acumulado en 1201007 a la cuenta del bien y parte la depreciación.
async function ponerEnServicioAF(id){
  const b=(S.activos||[]).find(a=>a.id===id);if(!b||!enObra(b))return;
  if(ejercicioCerrado()){toast('🔒 El ejercicio está cerrado.','e');return;}
  const fecha=document.getElementById('afs-fecha')?.value||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){toast('⚠️ Indica la fecha de puesta en servicio','e');return;}
  if(!(+b.valor>0)){toast('⚠️ La obra no tiene costo: agrega sus facturas antes de ponerla en servicio','e');return;}
  const traspaso=costosDe(b,'obra').filter(c=>c.cuenta===CUENTA_OBRAS).reduce((s,c)=>s+c.monto,0);
  const enAnio=String(fecha).startsWith(String(S.empresa.anio));
  if(traspaso>0&&!enAnio){toast(`⚠️ La fecha debe ser del ejercicio ${S.empresa.anio} para registrar el traspaso`,'e');return;}
  if(!PDC.some(x=>x.cd===CUENTA_OBRAS)&&traspaso>0){toast(`⚠️ Falta la cuenta ${CUENTA_OBRAS} en el plan de cuentas`,'e');return;}
  if(!confirm(`Poner en servicio "${b.desc}" el ${fecha}\n\nCosto total: ${fmtC(b.valor)}${traspaso?`\nAsiento: ${b.cuentaActivo} ${pdcNm(b.cuentaActivo)} a ${CUENTA_OBRAS} OBRAS EN CURSO por ${fmtC(traspaso)}`:'\nSin traspaso (ninguna factura está en 1201007)'}\n\nLa depreciación contable y tributaria parte en esa fecha. ¿Continuar?`))return;
  let asientoId='';
  if(traspaso>0){
    asientoId='as_afserv_'+Date.now();
    const folio=proxFolioAsiento();
    const r=await persistirAsientosCritico(()=>{S.asientos.push({id:asientoId,n:folio,fecha,glosa:`Puesta en servicio — ${b.desc}`,tipo:'manual',subtipo:'af-servicio',activoId:b.id,
      movs:[{cd:b.cuentaActivo,nm:pdcNm(b.cuentaActivo),debe:traspaso,haber:0,desc:b.desc},{cd:CUENTA_OBRAS,nm:pdcNm(CUENTA_OBRAS)||'OBRAS EN CURSO',debe:0,haber:traspaso,desc:b.desc}],creadoEn:new Date().toISOString()});});
    if(!r.ok){toast('❌ No se pudo guardar el asiento de traspaso. La ficha sigue en obra.','e');return;}
  }
  const snap=JSON.stringify(S.activos);
  delete b.etapa;b.fechaServicio=fecha;b.fechaInicioDepContable=fecha;b.fechaInicioDepTributaria=fecha;if(asientoId)b.asientoServicioId=asientoId;
  if(await guardarActivosAF(snap,`✅ "${b.desc}" en servicio desde ${fecha}${traspaso?' · traspaso a '+b.cuentaActivo+' registrado':''}`)){logAccion('Puso en servicio activo fijo',`${b.desc} · ${fecha} · ${fmtC(b.valor)}`);rerender();}
}
function panelCostosAF(b){
  const obra=enObra(b);
  const usadas=comprasUsadasAF();
  const opts='<option value="">— Factura de compra (opcional) —</option>'+comprasElegiblesAF().filter(d=>!usadas.has(d.id)).map(d=>`<option value="${d.id}">${d.fecha||''} · DTE ${d.tipoDTE||''} N°${escAF(d.numero)} · ${escAF(d.razonSocial)} · ${fmtC(montoCompraAF(d,b).monto)}</option>`).join('');
  const filas=(b.costos||[]).map(c=>`<tr><td class="tl" style="font-family:var(--mono);font-size:10px">${c.fecha}</td>
    <td class="tl" style="font-size:11px">${c.tipo==='obra'?'🏗️ Obra':'🔧 Mejora'}</td>
    <td class="tl" style="font-size:11px">${escAF(c.desc)}${c.cuenta?`<div style="font-size:9px;color:var(--mt)">Cuenta ${c.cuenta}${c.tipo==='obra'&&c.cuenta!==CUENTA_OBRAS?' · no entra al traspaso':''}</div>`:''}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(c.monto)}</td>
    <td style="text-align:right">${c.tipo==='obra'&&!obra?'':`<button class="btn btn-d" style="padding:2px 7px" onclick="quitarCostoAF('${b.id}','${c.id}')" title="Quitar de la ficha">✕</button>`}</td></tr>`).join('');
  const tObra=costosDe(b,'obra').reduce((s,c)=>s+c.monto,0),tMej=costosDe(b,'mejora').reduce((s,c)=>s+c.monto,0);
  return `<tr><td colspan="9" style="background:rgba(88,166,255,.05);padding:12px 14px;text-align:left">
    <div style="font-weight:700;font-size:12px;margin-bottom:6px">🧾 Facturas de ${escAF(b.desc)} ${obra?'· 🏗️ obra en curso':''}</div>
    ${filas?`<table style="width:100%;margin-bottom:10px"><thead><tr><th class="tl">FECHA</th><th class="tl">TIPO</th><th class="tl">DETALLE</th><th style="text-align:right">MONTO</th><th></th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><td class="tl" colspan="3" style="font-size:11px">Obras ${fmtC(tObra)} · Mejoras ${fmtC(tMej)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(tObra+tMej)}</td><td></td></tr></tfoot></table>`
      :'<div style="font-size:11px;color:var(--mt);margin-bottom:8px">Aún no hay facturas vinculadas.</div>'}
    <div style="display:grid;grid-template-columns:minmax(220px,2fr) 140px 130px minmax(160px,1.5fr) auto;gap:6px;align-items:end">
      <div class="grp" style="margin:0"><label style="font-size:10px">${obra?'Factura de la obra':'Factura de la mejora'}</label><select id="afc-compra" onchange="onCompraCostoAF('${b.id}')">${opts}</select></div>
      <div class="grp" style="margin:0"><label style="font-size:10px">Fecha</label><input type="date" id="afc-fecha" value="${today()}"></div>
      <div class="grp" style="margin:0"><label style="font-size:10px">Monto neto</label><input type="number" class="money-input" id="afc-monto" placeholder="0" style="background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;font-size:13px"></div>
      <div class="grp" style="margin:0"><label style="font-size:10px">Detalle</label><input type="text" id="afc-desc" style="background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;font-size:13px" placeholder="${obra?'Ej: hormigón, montaje…':'Ej: cambio de motor'}"></div>
      <button class="btn btn-p" onclick="agregarCostoAF('${b.id}')">+ ${obra?'Agregar a la obra':'Agregar mejora'}</button>
    </div>
    <div style="font-size:10px;color:var(--mt);margin-top:6px">${obra
      ?`Registra la factura en Compras con su línea a <strong>${CUENTA_OBRAS} OBRAS EN CURSO</strong> y agrégala aquí: suma al costo de la obra, sin depreciarse.`
      :`Registra la factura en Compras con su línea a <strong>${b.cuentaActivo} ${escAF(pdcNm(b.cuentaActivo))}</strong> y agrégala aquí: la mejora se deprecia desde su fecha en la vida útil restante del bien.`} La compra ya genera su asiento: aquí sólo se vincula a la ficha.</div>
    ${obra?`<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--bd)">
      <div class="grp" style="margin:0"><label style="font-size:10px">Fecha de puesta en servicio</label><input type="date" id="afs-fecha" value="${today()}"></div>
      <button class="btn btn-s" onclick="ponerEnServicioAF('${b.id}')">✅ Poner en servicio</button>
      <span style="font-size:10px;color:var(--mt)">Traspasa lo cargado en ${CUENTA_OBRAS} a ${b.cuentaActivo} y la depreciación parte en esa fecha.</span></div>`:''}
  </td></tr>`;
}

function renderActivoFijo(){
  const anio=S.empresa.anio;
  const el=document.getElementById('af-content');
  if(!S.activos.length){
    el.innerHTML=`<div class="empty"><div class="ei">🏗️</div>No hay activos fijos registrados.<br><br><button class="btn btn-p" onclick="abrirFormAF()">+ Registrar primer activo</button></div>`;
    return;
  }
  // KPIs
  let totValor=0,totAcum=0,totLibro=0,totDeprAnio=0,totDepTrib=0,totDifTemp=0;
  const filas=S.activos.map(b=>{
    const d=calcularDepreciacionContable(b,anio);
    const dt=calcularDepreciacionTributaria(b,anio);
    totValor+=(+(b.valorContable??b.valor)||0)+(d.mejoras||0);totAcum+=d.acumulada;totLibro+=d.valorLibro;totDeprAnio+=d.deprEsteAnio;totDepTrib+=dt.deprEsteAnio;totDifTemp+=dt.acumulada-d.acumulada;
    const c=afCat(b.cat);
    const nCostos=(b.costos||[]).length;
    const estado=d.enObra?'<span class="badge" style="background:rgba(210,153,34,.15);color:var(--warn)">🏗️ En obra</span>':d.totalmenteDepreciado?'<span class="badge br">Depreciado</span>':(d.deprEsteAnio>0?'<span class="badge bg">Activo</span>':'<span class="badge" style="background:rgba(130,130,130,.12);color:var(--mt)">Sin iniciar</span>');
    return `<tr>
      <td class="tl" style="font-size:12px">${b.desc}<div style="font-size:10px;color:var(--mt)">${c.lbl}</div>${b.compraOrigenRef?`<div style="font-size:9px;color:var(--info)">🔗 DTE ${b.compraOrigenRef.tipoDTE||''} N°${b.compraOrigenRef.numero||''}</div>`:''}</td>
      <td class="tl" style="font-family:var(--mono);font-size:10px">${b.fecha}</td>
      <td style="font-size:11px">C: ${d.metodo==='acelerada'?'Acel.':'Lineal'} ${d.vidaUsada}a<div style="font-size:9px;color:var(--mt)">T: ${dt.metodo==='acelerada'?'Acel.':'Normal'} ${dt.vidaUsada}a · Dif. ${fmtC(dt.acumulada-d.acumulada)}</div></td>
      <td style="font-family:var(--mono);text-align:right">${fmtC((+b.valor||0)+(d.mejoras||0))}${d.mejoras?`<div style="font-size:9px;color:var(--mt)">incl. mejoras ${fmtC(d.mejoras)}</div>`:''}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--err)">${fmtC(d.deprEsteAnio)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--mt)">${fmtC(d.acumulada)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:600">${fmtC(d.valorLibro)}</td>
      <td style="text-align:center">${estado}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn ${AF_ABIERTO===b.id?'btn-p':'btn-g'}" onclick="toggleCostosAF('${b.id}')" title="${d.enObra?'Facturas de la obra y puesta en servicio':'Facturas de mejoras'}">🧾${nCostos?' '+nCostos:''}</button>
        <button class="btn btn-i" onclick="editarAF('${b.id}')">✏️</button>
        <button class="btn btn-d" onclick="eliminarAF('${b.id}')">🗑</button>
      </td>
    </tr>${AF_ABIERTO===b.id?panelCostosAF(b):''}`;
  }).join('');
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Valor de Adquisición</div><div class="kpi-val">${fmtC(totValor)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Deprec. Acumulada</div><div class="kpi-val neg">${fmtC(totAcum)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Valor Libro</div><div class="kpi-val pos">${fmtC(totLibro)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Deprec. contable ${anio}</div><div class="kpi-val neg">${fmtC(totDeprAnio)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Deprec. tributaria ${anio}</div><div class="kpi-val">${fmtC(totDepTrib)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Dif. temporaria acum.</div><div class="kpi-val">${fmtC(totDifTemp)}</div></div>
  </div>
  <div class="card-np"><div class="tw"><table>
    <thead><tr><th class="tl">BIEN</th><th class="tl">COMPRA</th><th class="tl">MÉTODO</th><th style="text-align:right">VALOR</th><th style="text-align:right">DEPR. ${anio}</th><th style="text-align:right">ACUMULADA</th><th style="text-align:right">V. LIBRO</th><th style="text-align:center">ESTADO</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr style="background:rgba(88,166,255,.08)"><td class="tl" colspan="3" style="font-weight:700">TOTALES</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totValor)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--err)">${fmtC(totDeprAnio)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totAcum)}</td><td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totLibro)}</td><td colspan="2"></td></tr></tfoot>
  </table></div></div>
  ${totDeprAnio>0?`<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-p" onclick="generarAsientoDepreciacion()">📝 Generar asiento de depreciación ${anio}</button>
    <span style="font-size:11px;color:var(--mt)">Crea el asiento al 31/dic/${anio} por ${fmtC(totDeprAnio)} (cargo a gasto, abono a depreciación acumulada).</span>
  </div>`:''}
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">La depreciación financiera y tributaria se calculan por separado. En fichas V2.9 cada ámbito usa su propia base, residual y fecha de inicio, con prorrateo mensual; los activos históricos sin fecha específica conservan el cálculo legado. El método acelerado general usa 1/3 de la vida configurada (mínimo 1 año). El régimen especial del Art. 31 N°5 bis no se aplica automáticamente.</div>`;
}


export {CUENTA_OBRAS, toggleCostosAF, onCompraCostoAF, agregarCostoAF, quitarCostoAF, ponerEnServicioAF, AF_CATEGORIAS, afCat, vidaAcelerada, calcularDepreciacion, calcularDepreciacionContable, calcularDepreciacionTributaria, conciliacionDepreciacionAF, comprasElegiblesAF, onCompraAF, abrirFormAF, onCatAF, cerrarFormAF, previewAF, guardarAF, editarAF, eliminarAF, generarAsientoDepreciacion, renderActivoFijo, AFB};
