// pdc-reglas.js — Reglas de comportamiento del Plan de Cuentas.
// Convierte el PDC en una fuente de reglas y evita excepciones dispersas.
import {PDC} from './core.js';

const AUX_POR_DEFECTO={
  '1104001':'cliente',
  '2102001':'proveedor',
  '2102006':'honorario',
  '3202019':'honorario',
};
const IVA_POR_DEFECTO={
  '1108002':'iva_credito',
  '1108008':'iva_credito_activo_fijo',
  '1108006':'impuesto_adicional_recuperable',
  '2103003':'iva_debito',
  '2103005':'iva_retenido',
};

function inferirReglasCuenta(c){
  const tp=c.tp||'';
  const movimiento=tp!=='T'&&tp!=='S';
  const tipoAux=c.tipoAuxiliar||AUX_POR_DEFECTO[c.cd]||'';
  return {
    id:c.id||c.cd,
    codigo:c.cd,
    nombre:c.nm,
    tipo:tp,
    naturaleza:c.nat||'',
    nivel:c.nivel||String(c.cd||'').length,
    aceptaMovimientos:c.aceptaMovimientos!=null?!!c.aceptaMovimientos:movimiento,
    requiereAuxiliar:c.requiereAuxiliar!=null?!!c.requiereAuxiliar:!!tipoAux,
    tipoAuxiliar:tipoAux,
    aceptaCentroCosto:c.aceptaCentroCosto!=null?!!c.aceptaCentroCosto:(tp==='C'||tp==='I'),
    requiereCentroCosto:c.requiereCentroCosto!=null?!!c.requiereCentroCosto:false,
    tipoIVA:c.tipoIVA||IVA_POR_DEFECTO[c.cd]||'',
    esCuentaTributaria:c.esCuentaTributaria!=null?!!c.esCuentaTributaria:!!IVA_POR_DEFECTO[c.cd],
    permiteAsientoManual:c.permiteAsientoManual!=null?!!c.permiteAsientoManual:movimiento,
    permiteCierre:c.permiteCierre!=null?!!c.permiteCierre:movimiento,
    permiteApertura:c.permiteApertura!=null?!!c.permiteApertura:movimiento,
    activa:c.activa!==false,
  };
}

function normalizarCuenta(c){
  return {...c,...inferirReglasCuenta(c)};
}
function normalizarPDC(arr=PDC){
  for(let i=0;i<arr.length;i++)arr[i]=normalizarCuenta(arr[i]);
  return arr;
}

function asegurarCuentasSistema(arr=PDC){
  let cambios=0;
  const requeridas=[
    {cd:'1108008',nm:'IVA CRÉDITO FISCAL ACTIVO FIJO',tp:'A',nat:'D',tipoIVA:'iva_credito_activo_fijo',esCuentaTributaria:true},
    {cd:'1108006',nm:'OTROS IMPUESTOS POR RECUPERAR',tp:'A',nat:'D',tipoIVA:'impuesto_adicional_recuperable',esCuentaTributaria:true},
    {cd:'2103005',nm:'IVA RETENIDO FACTURAS DE COMPRA',tp:'P',nat:'C',tipoIVA:'iva_retenido',esCuentaTributaria:true},
  ];
  for(const c of requeridas){
    if(!arr.some(x=>x.cd===c.cd)){arr.push(normalizarCuenta(c));cambios++;}
  }
  if(cambios)arr.sort((a,b)=>String(a.cd).localeCompare(String(b.cd),'es',{numeric:true}));
  return cambios;
}

function reglaCuenta(cd){
  const c=PDC.find(x=>x.cd===String(cd||''));
  return c?inferirReglasCuenta(c):null;
}
function validarMovimientoPDC(m,{manual=false,apertura=false,cierre=false}={}){
  const errs=[];
  const r=reglaCuenta(m.cd);
  if(!r)return [`La cuenta ${m.cd||'(vacía)'} no existe en el Plan de Cuentas`];
  if(!r.activa)errs.push(`La cuenta ${m.cd} está inactiva`);
  if(!r.aceptaMovimientos)errs.push(`La cuenta ${m.cd} es agrupadora y no acepta movimientos`);
  if(manual&&!r.permiteAsientoManual)errs.push(`La cuenta ${m.cd} no permite asientos manuales`);
  if(apertura&&!r.permiteApertura)errs.push(`La cuenta ${m.cd} no permite apertura`);
  if(cierre&&!r.permiteCierre)errs.push(`La cuenta ${m.cd} no permite cierre`);
  if(r.requiereAuxiliar&&!m.rutCodigo)errs.push(`La cuenta ${m.cd} requiere auxiliar (${r.tipoAuxiliar||'identificación'})`);
  if(r.requiereCentroCosto&&!m.cc)errs.push(`La cuenta ${m.cd} exige centro de costo`);
  if(m.cc&&!r.aceptaCentroCosto)errs.push(`La cuenta ${m.cd} no admite centro de costo`);
  return errs;
}
function validarMovimientosPDC(movs,opts={}){
  const errores=[];
  (movs||[]).forEach((m,i)=>validarMovimientoPDC(m,opts).forEach(e=>errores.push(`Línea ${i+1}: ${e}`)));
  return {ok:errores.length===0,errores};
}

export {AUX_POR_DEFECTO,IVA_POR_DEFECTO,inferirReglasCuenta,normalizarCuenta,normalizarPDC,asegurarCuentasSistema,reglaCuenta,validarMovimientoPDC,validarMovimientosPDC};
