// pdf-rem.js — V2.21.48 · PDF de liquidaciones (individual y masivo) y del
// Libro de Remuneraciones, con membrete de la empresa.
//
// Usa html2pdf.js (html2canvas + jsPDF), que se carga sólo al generar el
// primer PDF. Cada liquidación va en su propia hoja carta vertical; el libro
// va en hojas carta horizontales, repitiendo el encabezado de la tabla.

import {toast, MESES} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {htmlLiquidacion, membreteEmpresa, mesRemSel} from './remuneraciones.js';
import {libroDelMes} from './libroremuneraciones.js';
import {construirImposiciones} from './imposiciones.js';

const H2P_URL='https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
let cargando=null;
function cargarHtml2pdf(){
  if(window.html2pdf)return Promise.resolve(window.html2pdf);
  if(cargando)return cargando;
  cargando=new Promise((ok,err)=>{
    const s=document.createElement('script');s.src=H2P_URL;
    s.onload=()=>window.html2pdf?ok(window.html2pdf):err(new Error('La biblioteca de PDF no quedó disponible'));
    s.onerror=()=>{cargando=null;err(new Error('No se pudo cargar la biblioteca de PDF (revisa la conexión)'));};
    document.head.appendChild(s);
  });
  return cargando;
}

const slug=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'empresa';
const n=v=>Math.round(+v||0).toLocaleString('es-CL');
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let EN_CURSO=false;

// Genera y descarga el PDF. contenido: HTML; orientacion: 'portrait'|'landscape'
async function generarPDF(contenido,{nombre,orientacion='portrait',pie=''}){
  const h2p=await cargarHtml2pdf();
  const ancho=orientacion==='landscape'?980:740;   // px útiles en carta con márgenes de 10 mm
  const el=document.createElement('div');
  el.className='pdf-doc';el.style.width=ancho+'px';
  el.innerHTML=contenido;
  const opt={
    margin:[10,10,12,10],filename:nombre,
    image:{type:'jpeg',quality:0.95},
    html2canvas:{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,scrollX:0,scrollY:0},
    jsPDF:{unit:'mm',format:'letter',orientation:orientacion},
    pagebreak:{mode:['css'],before:'.pdf-salto',avoid:['.liq2-firmas','tr']},
  };
  await h2p().set(opt).from(el).toPdf().get('pdf').then(pdf=>{
    const tot=pdf.internal.getNumberOfPages();
    const W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight();
    pdf.setFontSize(7);pdf.setTextColor(110);
    for(let i=1;i<=tot;i++){
      pdf.setPage(i);
      if(pie)pdf.text(pie,10,H-5);
      pdf.text(`Página ${i} de ${tot}`,W-10,H-5,{align:'right'});
    }
  }).save();
}

// ── Liquidaciones ──
async function pdfLiquidaciones(ids,{nombre}={}){
  if(EN_CURSO){toast('⏳ Ya se está generando un PDF');return;}
  const mes=mesRemSel();
  const trabs=(S.trabajadores||[]).filter(t=>!ids||ids.includes(t.id));
  if(!trabs.length){toast('⚠️ No hay trabajadores','e');return;}
  EN_CURSO=true;
  toast(`⏳ Generando PDF de ${trabs.length} liquidación(es)…`);
  try{
    const paginas=trabs.map((t,i)=>`<div class="pdf-pag${i?' pdf-salto':''}">${htmlLiquidacion(t,{mes,botones:false})}</div>`).join('');
    const per=`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
    await generarPDF(paginas,{nombre:nombre||`liquidaciones_${slug(S.empresa.nombre)}_${per}.pdf`,orientacion:'portrait'});
    toast(`✅ PDF generado: ${trabs.length} liquidación(es) de ${MESES[mes-1]} ${S.empresa.anio}`);
    logAccion('Generó PDF de liquidaciones',`${MESES[mes-1]} ${S.empresa.anio} · ${trabs.length} trabajador(es)`);
  }catch(e){console.error(e);toast('❌ '+(e.message||e),'e');}
  finally{EN_CURSO=false;}
}
function pdfLiquidacionesMasivo(){return pdfLiquidaciones(null);}
function pdfLiquidacion(id){
  const t=(S.trabajadores||[]).find(x=>x.id===id);if(!t)return;
  const mes=mesRemSel();
  return pdfLiquidaciones([id],{nombre:`liquidacion_${slug(t.nombre)}_${S.empresa.anio}-${String(mes).padStart(2,'0')}.pdf`});
}

// ── Libro de Remuneraciones ──
const COLS=[
  ['Días','diasPagados'],['Sueldo base','base'],['Gratif.','gratificacion'],['Otros imp.','otros'],['Total imponible','totalImponible',1],
  ['Colación','colacion'],['Moviliz.','movilizacion'],['Asig. fam.','asigFamiliar'],['Total haberes','totalHaberes',1],
  ['AFP','descAFP'],['Salud','descSalud'],['Cesantía','descCesantia'],['T. pesado','descTrabPesado'],['Imp. único','iusc'],['Total desc.','totalDescuentos',1],
  ['Líquido','liquido',1],
];
const FILAS_POR_HOJA=22;
function htmlLibro(L,mes){
  const per=`${MESES[mes-1]} ${S.empresa.anio}`;
  const lineas=L.lineas;const T=L.totales;
  // Columnas opcionales: se omiten si todo el mes está en cero
  const cols=COLS.filter(([,k])=>k==='diasPagados'||['asigFamiliar','descTrabPesado','otros'].indexOf(k)<0||lineas.some(l=>+l[k]));
  const thead=`<thead><tr><th class="tl">N°</th><th class="tl">TRABAJADOR</th>${cols.map(([h])=>`<th>${h.toUpperCase()}</th>`).join('')}</tr></thead>`;
  const fila=(l,i)=>`<tr><td class="tl">${i+1}</td><td class="tl"><b>${esc(l.nombre)}</b><div class="lp-sub">${esc(l.rut||'')}${l.afp?' · '+esc(l.afp):''}${l.salud?' · '+esc(l.salud):''}</div></td>${cols.map(([,k,b])=>`<td class="${b?'lp-b':''}">${k==='diasPagados'?(l.diasPagados??30):n(l[k])}</td>`).join('')}</tr>`;
  const totales=`<tr class="lp-tot"><td></td><td class="tl">TOTALES (${lineas.length})</td>${cols.map(([,k])=>`<td>${k==='diasPagados'?'':n(T[k])}</td>`).join('')}</tr>`;
  const estado=L.cerrado?`Cerrado${L.cerradoEl?' el '+new Date(L.cerradoEl).toLocaleDateString('es-CL'):''}`:'Calculado en vivo (mes no cerrado)';
  const cab=`<div class="lp-cab">${membreteEmpresa()}
      <div class="lp-tit"><div class="lp-t1">LIBRO DE REMUNERACIONES</div><div class="lp-t2">${per}</div>
        <div class="lp-t3">UF ${(+L.uf||0).toLocaleString('es-CL',{maximumFractionDigits:2})} · UTM ${n(L.utm)} · ${estado}</div></div></div>`;
  const hojas=[];
  for(let i=0;i<lineas.length||i===0;i+=FILAS_POR_HOJA){
    const trozo=lineas.slice(i,i+FILAS_POR_HOJA);
    const ultima=i+FILAS_POR_HOJA>=lineas.length;
    hojas.push(`<div class="lp-hoja${i?' pdf-salto':''}">${i?`<div class="lp-cont">${esc(S.empresa.nombre||'')} · Libro de Remuneraciones ${per} (continuación)</div>`:cab}
      <table class="lp-tab">${thead}<tbody>${trozo.map((l,j)=>fila(l,i+j)).join('')}${ultima?totales:''}</tbody></table></div>`);
    if(!lineas.length)break;
  }
  // Resumen de aportes del empleador e imposiciones
  const ap=[['SIS','sis'],['Seguro Social (exp. vida)','cev'],['Rentabilidad protegida','crp'],['Capitalización individual','capInd'],['Mutual / ISL','mutual'],['Seguro de cesantía','afc'],['Caja de compensación','caja'],['Trabajo pesado','trabPesado']].filter(([,k])=>+T[k]);
  const resumen=`<div class="lp-res">
    <div><div class="lp-rh">RESUMEN DEL MES</div>
      <div class="lp-rf"><span>Total haberes</span><b>${n(T.totalHaberes)}</b></div>
      <div class="lp-rf"><span>Total descuentos</span><b>${n(T.totalDescuentos)}</b></div>
      <div class="lp-rf"><span>Total líquido a pagar</span><b>${n(T.liquido)}</b></div>
      <div class="lp-rf"><span>Impuesto único retenido</span><b>${n(T.iusc)}</b></div>
      ${+T.asigFamiliar?`<div class="lp-rf"><span>Asignación familiar (se compensa)</span><b>${n(T.asigFamiliar)}</b></div>`:''}</div>
    <div><div class="lp-rh">APORTES DEL EMPLEADOR</div>
      ${ap.map(([h,k])=>`<div class="lp-rf"><span>${h}</span><b>${n(T[k])}</b></div>`).join('')}
      <div class="lp-rf lp-rt"><span>Total aportes</span><b>${n(T.totalPatronal)}</b></div>
      <div class="lp-rf lp-rt"><span>Costo total empresa</span><b>${n(T.costoEmpresa)}</b></div></div>
    <div class="lp-firma"><div class="lp-linea"></div>${esc(S.empresa.rep||'Representante legal')}<div class="lp-sub">${esc(S.empresa.nombre||'')}${S.empresa.rut?' · RUT '+esc(S.empresa.rut):''}</div></div>
  </div>`;
  return hojas.join('')+resumen+htmlInstituciones(mes,per);
}
// Hoja de pago por institución (V2.21.50), como el resumen de Previred.
// Usa el mismo cálculo del detalle de imposiciones y del archivo Previred.
function htmlInstituciones(mes,per){
  let I;
  try{I=construirImposiciones(mes);}catch(e){console.error(e);return '';}
  if(!I||!I.instituciones||!I.instituciones.length)return '';
  const sumaCargo=(i,c)=>i.conceptos.filter(x=>x.cargo===c).reduce((s,x)=>s+x.monto,0);
  const hayComp=I.instituciones.some(i=>sumaCargo(i,'Compensación'));
  const filasRes=I.instituciones.map(i=>`<tr><td class="tl"><b>${esc(i.institucion)}</b></td><td class="tl">${esc(i.tipo)}</td>
      <td>${n(sumaCargo(i,'Trabajador'))}</td><td>${n(sumaCargo(i,'Empleador'))}</td>${hayComp?`<td>${sumaCargo(i,'Compensación')?n(sumaCargo(i,'Compensación')):''}</td>`:''}<td class="lp-b">${n(i.total)}</td></tr>`).join('');
  const totT=I.instituciones.reduce((s,i)=>s+sumaCargo(i,'Trabajador'),0),totE=I.instituciones.reduce((s,i)=>s+sumaCargo(i,'Empleador'),0);
  const totC=I.instituciones.reduce((s,i)=>s+sumaCargo(i,'Compensación'),0),totG=I.instituciones.reduce((s,i)=>s+i.total,0);
  const tarjetas=I.instituciones.map(i=>`<div class="li-card"><div class="li-h"><span>${esc(i.institucion)}</span><span>${esc(i.tipo)}</span></div>
      <table class="li-t">${i.conceptos.map(c=>`<tr><td class="tl">${esc(c.concepto)}<div class="lp-sub">${esc(c.cargo)} · ${c.trabajadores} trab.</div></td><td>${n(c.monto)}</td></tr>`).join('')}
      <tr class="li-sub"><td class="tl">Total a pagar</td><td>${n(i.total)}</td></tr></table></div>`).join('');
  return `<div class="lp-hoja pdf-salto">
    <div class="lp-cab">${membreteEmpresa()}
      <div class="lp-tit"><div class="lp-t1">DETALLE DE PAGO POR INSTITUCIÓN</div><div class="lp-t2">Remuneraciones ${per}</div>
        <div class="lp-t3">Resumen de cotizaciones a pagar en Previred</div></div></div>
    <table class="lp-tab li-res"><thead><tr><th class="tl">INSTITUCIÓN</th><th class="tl">TIPO</th><th>CARGO TRABAJADOR</th><th>CARGO EMPLEADOR</th>${hayComp?'<th>ASIG. FAMILIAR (SE DESCUENTA)</th>':''}<th>TOTAL A PAGAR</th></tr></thead>
      <tbody>${filasRes}<tr class="lp-tot"><td class="tl" colspan="2">TOTAL A PAGAR EN PREVIRED</td><td>${n(totT)}</td><td>${n(totE)}</td>${hayComp?`<td>${n(totC)}</td>`:''}<td>${n(totG)}</td></tr></tbody></table>
    <div class="li-grid">${tarjetas}</div>
    <div class="li-nota">No incluye el impuesto único de segunda categoría (${n(I.libro&&I.libro.totales?I.libro.totales.iusc:0)}), que se declara y paga en el F29. Las cotizaciones se pagan hasta el día 10 del mes siguiente, o hasta el 13 si el pago es electrónico.</div>
  </div>`;
}
async function pdfLibroRem(){
  if(EN_CURSO){toast('⏳ Ya se está generando un PDF');return;}
  const mes=+(document.getElementById('rem-mes')?.value||1);
  const L=libroDelMes(mes);
  if(!L.lineas.length){toast('⚠️ No hay trabajadores en el libro','e');return;}
  EN_CURSO=true;toast('⏳ Generando PDF del libro…');
  try{
    const per=`${S.empresa.anio}-${String(mes).padStart(2,'0')}`;
    await generarPDF(htmlLibro(L,mes),{nombre:`libro_remuneraciones_${slug(S.empresa.nombre)}_${per}.pdf`,orientacion:'landscape',
      pie:`${S.empresa.nombre||''} · RUT ${S.empresa.rut||''} · Libro de Remuneraciones ${MESES[mes-1]} ${S.empresa.anio}`});
    toast(`✅ PDF del libro de ${MESES[mes-1]} generado`);
    logAccion('Generó PDF del libro de remuneraciones',`${MESES[mes-1]} ${S.empresa.anio}${L.cerrado?' (cerrado)':' (en vivo)'}`);
  }catch(e){console.error(e);toast('❌ '+(e.message||e),'e');}
  finally{EN_CURSO=false;}
}

export {pdfLiquidacionesMasivo, pdfLiquidacion, pdfLibroRem, htmlLibro, htmlInstituciones, cargarHtml2pdf};
