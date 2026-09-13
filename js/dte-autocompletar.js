// dte-autocompletar.js — V2.16.15
//
// Reconstruye los campos tributarios visibles de un DTE a partir de las
// líneas del asiento que ya existen. Su objetivo es evitar volver a digitar
// montos cuando el usuario sólo está asociando el documento al auxiliar.
//
// Importante: si el documento original ya trae un valor explícito, ese valor
// siempre gana. La inferencia sólo completa campos vacíos/cero. De esta forma
// no reemplazamos información real del RCV por una estimación contable.

import {dteV,dteC} from './core.js';

const n=v=>Number(v)||0;
const absMov=m=>Math.abs(n(m?.debe)||n(m?.haber));
const suma=(movs,pred,excepto=-1)=>(movs||[]).reduce((s,m,i)=>i===excepto||!pred(m)?s:s+absMov(m),0);

function extraerNumeroDocumento(...textos){
  for(const txt0 of textos){
    const txt=String(txt0||'').trim();
    if(!txt)continue;
    const pats=[
      /(?:n\s*[°ºo]?|folio|#)\s*[:.\-]?\s*(\d{1,18})/i,
      /(?:factura|boleta|nota\s+de\s+(?:cr[eé]dito|d[eé]bito)|dte)[^0-9]{0,30}(\d{1,18})/i,
    ];
    for(const re of pats){const m=txt.match(re);if(m)return m[1];}
  }
  return '';
}

/**
 * Completa un DTE desde el asiento.
 *
 * tipoAux: cliente | proveedor | honorario
 * tipoDTE: código SII ya seleccionado (puede ser 0 mientras el usuario elige)
 * actual: datos del DTE que ya existen; se conservan por sobre la inferencia.
 */
function inferirDteDesdeAsiento({movs=[],lineaIdx=-1,tipoAux='',tipoDTE=0,actual={},fecha='',glosa=''}){
  const linea=movs[lineaIdx]||{};
  const d={...actual};
  const tiene=v=>v!==undefined&&v!==null&&String(v)!==''&&Number(v)!==0;

  if(!d.fecha)d.fecha=fecha||'';
  if(!d.rutCodigo&&linea.rutCodigo)d.rutCodigo=linea.rutCodigo;
  if(!d.rutDV&&linea.rutDV)d.rutDV=linea.rutDV;
  if(!d.razonSocial&&linea.razonSocial)d.razonSocial=linea.razonSocial;
  if(!d.numero)d.numero=linea.folio||extraerNumeroDocumento(linea.desc,glosa);
  if(!d.descripcion)d.descripcion=linea.desc||glosa||'';
  if(!d.tipoDTE&&tipoDTE)d.tipoDTE=+tipoDTE;

  if(tipoAux==='honorario')return d;

  const cod=+(tipoDTE||d.tipoDTE||0);
  const info=tipoAux==='proveedor'?dteC(cod):dteV(cod);
  const totalAux=absMov(linea);

  // Impuestos que sí son identificables contablemente por cuenta/etiqueta.
  const ivaAsiento=tipoAux==='cliente'
    ? suma(movs,m=>String(m.cd)==='2103003'||m.tributo==='iva_debito',lineaIdx)
    : suma(movs,m=>['1108002','1108008'].includes(String(m.cd))||String(m.tributo||'').startsWith('iva_credito'),lineaIdx);
  const otrosAsiento=tipoAux==='cliente'
    ? suma(movs,m=>String(m.cd)==='2103004'||m.tributo==='otros_impuestos_venta',lineaIdx)
    : suma(movs,m=>String(m.cd)==='1108006'||m.tributo==='impuesto_adicional_recuperable',lineaIdx);
  const ivaRetenido=tipoAux==='proveedor'
    ? suma(movs,m=>String(m.cd)==='2103005'||m.tributo==='iva_retenido',lineaIdx)
    : 0;

  // Para facturas de compra 45/46, el proveedor puede quedar por el líquido
  // luego de la retención. El total documental vuelve a incluir esa retención.
  const totalContable=totalAux+(tipoAux==='proveedor'?ivaRetenido:0);
  if(!tiene(d.total)&&totalContable)d.total=totalContable;
  if(!tiene(d.iva)&&ivaAsiento)d.iva=ivaAsiento;
  if(!tiene(d.otrosImpuestos)&&otrosAsiento)d.otrosImpuestos=otrosAsiento;
  if(tipoAux==='proveedor'&&!tiene(d.ivaRetenido)&&ivaRetenido)d.ivaRetenido=ivaRetenido;

  // Base Neto/Exento. El usuario pidió que al abrir el DTE ya aparezca la
  // base contable, incluso ANTES de escoger el tipo SII. Con IVA presente la
  // parte afecta puede reconstruirse desde el propio impuesto; cualquier
  // diferencia material contra la base total se conserva como exenta. Si no
  // hay IVA y aún no se elige DTE, mostramos provisionalmente la base en
  // Exento; al seleccionar el tipo, los callers con base automática vuelven a
  // invocar esta función con Neto/Exento en cero y se reclasifica correctamente.
  if(!tiene(d.neto)&&!tiene(d.exento)){
    const total=Math.abs(n(d.total));
    const iva=Math.abs(n(d.iva));
    const otros=Math.abs(n(d.otrosImpuestos));
    const base=Math.max(0,total-iva-otros);
    if(base>0){
      if(iva>0){
        const netoPorIva=Math.max(0,Math.round(iva/0.19));
        const residuo=base-netoPorIva;
        // El redondeo del IVA puede mover 1–2 pesos; en ese caso toda la base
        // se considera afecta. Sólo tratamos como exento un residuo material.
        if(residuo>2){
          d.neto=netoPorIva;
          d.exento=residuo;
        }else{
          d.neto=base;
          d.exento=0;
        }
      }else if(info){
        if(info.afecto)d.neto=base;
        else d.exento=base;
      }else{
        // Sin tipo aún no existe forma inequívoca de saber si una base sin IVA
        // es afecta o exenta. La mostramos en Exento como clasificación
        // provisional; al elegir el DTE se reclasifica si corresponde.
        d.exento=base;
      }
    }
  }

  return d;
}

export {inferirDteDesdeAsiento,extraerNumeroDocumento};
