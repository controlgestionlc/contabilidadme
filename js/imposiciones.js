// imposiciones.js — V2.21.38 · Detalle del pago de imposiciones (Excel)
//
// Arma, para un mes, cuánto se paga a cada institución previsional y por qué
// concepto, separando lo descontado al trabajador de lo que aporta el
// empleador. Usa los montos del Libro de Remuneraciones (el cerrado si
// existe) y el mismo reparto que el archivo Previred, para que el total
// coincida con la planilla de pago.

import {toast, fmtC, MESES} from './core.js';
import {S} from './state.js';
import {libroDelMes} from './libroremuneraciones.js';
import {getPrevisional, mutualInfo, cajaInfo} from './previsional.js';

// Fonasa con empresa afiliada a CCAF (Formato Previred v58)
const TASA_FONASA_CON_CCAF=0.55, TASA_CCAF_FONASA=6.45;
const R=n=>Math.round(+n||0);

function construirImposiciones(mes){
  const L=libroDelMes(mes);
  const P=getPrevisional().patronal;
  const conCaja=(P.cajaInstitucion||'ninguna')!=='ninguna';
  const nomCaja=conCaja?cajaInfo(P.cajaInstitucion).nm:'';
  const nomMutual=mutualInfo(P.mutualInstitucion).nm;
  const esISL=P.mutualInstitucion==='isl';
  const avisos=[];

  // Acumulador por institución → concepto
  const inst=new Map();
  const sumar=(institucion,tipo,concepto,cargo,monto,idTrab)=>{
    monto=R(monto);if(!monto)return;
    if(!inst.has(institucion))inst.set(institucion,{institucion,tipo,conceptos:new Map()});
    const c=inst.get(institucion).conceptos;
    const k=concepto+'|'+cargo;
    if(!c.has(k))c.set(k,{concepto,cargo,monto:0,trabajadores:new Set()});
    const x=c.get(k);x.monto+=monto;x.trabajadores.add(idTrab);
  };

  const detalle=L.lineas.map(l=>{
    const id=l.id||l.rut||l.nombre;
    // AFP: 10% + comisión (trabajador) y SIS (empleador)
    let pension=l.descAFP_pension, comision=l.descAFP_comision;
    if(pension===undefined){pension=R(l.descAFP);comision=0;
      if(!avisos.includes('libro'))avisos.push('libro');}
    sumar(l.afp||'AFP','AFP','Cotización obligatoria 10%','Trabajador',pension,id);
    sumar(l.afp||'AFP','AFP','Comisión AFP','Trabajador',comision,id);
    sumar(l.afp||'AFP','AFP','Seguro de invalidez y sobrevivencia (SIS)','Empleador',l.sis,id);
    // Salud
    const base=R(l.baseAFP!==undefined?l.baseAFP:l.totalImponible);
    const fonasa=(l.saludKey||'fonasa')==='fonasa';
    let salud7=R(l.saludLegal), saludFonasa=0, saludCaja=0;
    if(fonasa){
      if(conCaja){
        saludFonasa=R(base*TASA_FONASA_CON_CCAF/100);saludCaja=R(base*TASA_CCAF_FONASA/100);
        sumar('Fonasa','Salud',`Cotización de salud (${TASA_FONASA_CON_CCAF.toLocaleString('es-CL')}%)`,'Trabajador',saludFonasa,id);
        sumar(nomCaja,'CCAF',`Cotización de salud Fonasa (${TASA_CCAF_FONASA.toLocaleString('es-CL')}%)`,'Trabajador',saludCaja,id);
      }else{
        saludFonasa=salud7;
        sumar('Fonasa','Salud','Cotización de salud 7%','Trabajador',salud7,id);
      }
    }else{
      sumar(l.salud||'Isapre','Salud','Cotización legal 7%','Trabajador',salud7,id);
      sumar(l.salud||'Isapre','Salud','Cotización adicional (plan pactado)','Trabajador',l.adicionalIsapre,id);
    }
    // Seguro de cesantía
    sumar('AFC Chile','Cesantía','Seguro de cesantía trabajador','Trabajador',l.descCesantia,id);
    sumar('AFC Chile','Cesantía','Seguro de cesantía empleador','Empleador',l.afc,id);
    // Accidentes del trabajo
    sumar(nomMutual,esISL?'ISL':'Mutual','Seguro de accidentes del trabajo (Ley 16.744)','Empleador',l.mutual,id);
    // Aporte de caja configurado como tasa del empleador
    if(conCaja)sumar(nomCaja,'CCAF','Aporte empleador caja de compensación','Empleador',l.caja,id);

    const totalAFP=R(pension)+R(comision)+R(l.sis);
    const totalSalud=fonasa?(saludFonasa+saludCaja):(salud7+R(l.adicionalIsapre));
    const totalAFC=R(l.descCesantia)+R(l.afc);
    const trab=R(pension)+R(comision)+totalSalud+R(l.descCesantia);
    const emp=R(l.sis)+R(l.afc)+R(l.mutual)+(conCaja?R(l.caja):0);
    return {
      rut:l.rut||'',nombre:l.nombre||'',dias:l.diasPagados!=null?l.diasPagados:30,
      renta:base,rentaAFC:R(l.baseAFC!==undefined?l.baseAFC:(l.baseCes!==undefined?l.baseCes:base)),
      afp:l.afp||'',pension:R(pension),comision:R(comision),sis:R(l.sis),totalAFP,
      salud:fonasa?(conCaja?`Fonasa + ${nomCaja}`:'Fonasa'):(l.salud||''),salud7:fonasa?saludFonasa+saludCaja:salud7,adicional:fonasa?0:R(l.adicionalIsapre),totalSalud,
      afcTrab:R(l.descCesantia),afcEmp:R(l.afc),totalAFC,
      mutual:R(l.mutual),caja:conCaja?R(l.caja):0,
      totalTrabajador:trab,totalEmpleador:emp,total:trab+emp,
    };
  });

  const instituciones=[...inst.values()].map(i=>{
    const conceptos=[...i.conceptos.values()].map(c=>({...c,trabajadores:c.trabajadores.size}));
    return {...i,conceptos,total:conceptos.reduce((s,c)=>s+c.monto,0)};
  }).sort((a,b)=>({AFP:1,Salud:2,CCAF:3,Cesantía:4,Mutual:5,ISL:5}[a.tipo]||9)-({AFP:1,Salud:2,CCAF:3,Cesantía:4,Mutual:5,ISL:5}[b.tipo]||9)||a.institucion.localeCompare(b.institucion));

  const tot=k=>detalle.reduce((s,d)=>s+(+d[k]||0),0);
  return {libro:L,instituciones,detalle,avisos,
    totales:{trabajador:tot('totalTrabajador'),empleador:tot('totalEmpleador'),total:tot('total')}};
}

// Celda con fórmula de suma (y su valor calculado, para que se vea sin recalcular)
const col=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const suma=(c,f1,f2,valor)=>({t:'n',v:valor,f:`SUM(${col(c)}${f1}:${col(c)}${f2})`,z:'#,##0'});
const num=v=>({t:'n',v:R(v),z:'#,##0'});

function exportarImposicionesExcel(){
  try{
    if(typeof XLSX==='undefined'){toast('⚠️ Biblioteca Excel no cargada (¿sin internet?)','e');return;}
    const mes=+(document.getElementById('rem-mes')?.value||1);
    const I=construirImposiciones(mes);
    if(!I.detalle.length){toast('⚠️ No hay trabajadores en el período','e');return;}
    const per=`${MESES[mes-1]} ${S.empresa.anio}`;
    const wb=XLSX.utils.book_new();

    // ── Hoja 1: resumen por institución ──
    const enc=[
      ['DETALLE DEL PAGO DE IMPOSICIONES'],
      [`${S.empresa.nombre||''}${S.empresa.rut?' · RUT '+S.empresa.rut:''}`],
      [`Período: ${per} · ${I.libro.cerrado?'Libro cerrado':'Libro provisorio (calculado en vivo)'} · ${I.detalle.length} trabajador(es)`],
      [],
      ['INSTITUCIÓN','TIPO','CONCEPTO','CARGO DE','TRABAJADORES','MONTO'],
    ];
    const filas=[...enc];
    const subtotales=[];
    I.instituciones.forEach(i=>{
      const ini=filas.length+1;
      i.conceptos.forEach(c=>filas.push([i.institucion,i.tipo,c.concepto,c.cargo,c.trabajadores,num(c.monto)]));
      const fin=filas.length;
      filas.push(['','',`Total ${i.institucion}`,'','',suma(5,ini,fin,i.total)]);
      subtotales.push(filas.length);
      filas.push([]);
    });
    const totalGeneral={t:'n',v:I.totales.total,f:subtotales.map(r=>`F${r}`).join('+'),z:'#,##0'};
    filas.push(['','','TOTAL A PAGAR EN IMPOSICIONES','','',totalGeneral]);
    filas.push(['','','  Descontado a los trabajadores','','',num(I.totales.trabajador)]);
    filas.push(['','','  Aporte del empleador','','',num(I.totales.empleador)]);
    filas.push([]);
    filas.push(['No incluye el impuesto único de segunda categoría, que se declara y paga en el F29.']);
    if(I.avisos.includes('libro'))filas.push(['Aviso: el libro de este mes se cerró con una versión anterior; la comisión AFP va incluida en la cotización obligatoria. Reábrelo y ciérralo de nuevo para separarla.']);
    const ws1=XLSX.utils.aoa_to_sheet(filas);
    ws1['!cols']=[{wch:34},{wch:10},{wch:46},{wch:12},{wch:13},{wch:16}];
    ws1['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}},{s:{r:2,c:0},e:{r:2,c:5}}];
    XLSX.utils.book_append_sheet(wb,ws1,'Resumen por institución');

    // ── Hoja 2: detalle por trabajador ──
    const hdr=['RUT','TRABAJADOR','DÍAS','RENTA IMPONIBLE','AFP','COT. OBLIGATORIA 10%','COMISIÓN AFP','SIS (EMPLEADOR)','TOTAL AFP',
      'SALUD','COTIZACIÓN 7%','ADICIONAL ISAPRE','TOTAL SALUD','RENTA CESANTÍA','CESANTÍA TRABAJADOR','CESANTÍA EMPLEADOR','TOTAL CESANTÍA',
      'ACCIDENTES (MUTUAL/ISL)','APORTE CAJA','TOTAL TRABAJADOR','TOTAL EMPLEADOR','TOTAL IMPOSICIONES'];
    const claves=['rut','nombre','dias','renta','afp','pension','comision','sis','totalAFP','salud','salud7','adicional','totalSalud',
      'rentaAFC','afcTrab','afcEmp','totalAFC','mutual','caja','totalTrabajador','totalEmpleador','total'];
    const texto=new Set(['rut','nombre','afp','salud','dias']);
    const det=[[`DETALLE POR TRABAJADOR · ${per}`],[],hdr,
      ...I.detalle.map(d=>claves.map(k=>texto.has(k)?d[k]:num(d[k])))];
    const f1=4,f2=det.length;
    det.push(claves.map((k,ci)=>ci===1?'TOTALES':texto.has(k)?'':suma(ci,f1,f2,I.detalle.reduce((s,d)=>s+(+d[k]||0),0))));
    const ws2=XLSX.utils.aoa_to_sheet(det);
    ws2['!cols']=hdr.map((h,i)=>({wch:i===1?30:Math.max(11,h.length+2)}));
    XLSX.utils.book_append_sheet(wb,ws2,'Detalle por trabajador');

    const emp=(S.empresa.nombre||'empresa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    XLSX.writeFile(wb,`${emp}_imposiciones_${I.libro.periodo}.xlsx`);
    toast(`✅ Detalle de imposiciones de ${per} exportado · total ${fmtC(I.totales.total)}`);
  }catch(e){console.error(e);toast('❌ Error al exportar imposiciones: '+e.message,'e');}
}

export {construirImposiciones, exportarImposicionesExcel};
