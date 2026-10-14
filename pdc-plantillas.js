// pdc-plantillas.js — V2.21.27 · Planes de cuentas tipo por rubro
//
// Todas las plantillas parten del plan base (PDC_DEFAULT) y comparten su
// estructura y sus cuentas de sistema: bancos, clientes, proveedores, IVA,
// honorarios, retenciones, patrimonio, impuestos. Sólo cambia lo propio del
// rubro: existencias (1109), costo de explotación (3101 / 3103) e ingresos de
// explotación (4101), más alguna cuenta puntual de cobro o pasivo.
//
// Hay códigos que el sistema usa por defecto y por eso EXISTEN en todas las
// plantillas, con el nombre que corresponde al rubro:
//   4101002  ventas con factura / nota de débito / nota de crédito (mapa DTE)
//   4101003  ventas con boleta (mapa DTE)
//   4101001  ingreso por defecto del importador de auxiliares
//   3101002  costo de venta de lo que sale de inventario
//   3101003  costo por defecto de los centros de costo de inversión
//   1109007  cuenta única del módulo de inventario
//
// La plantilla se elige al crear la empresa y se aplica una sola vez, al
// activarla por primera vez, si la nube confirma que todavía no tiene plan.

import {PDC_DEFAULT} from './pdc.js';

const A=(cd,nm)=>({cd,nm,tp:'A',nat:'D'});
const P=(cd,nm)=>({cd,nm,tp:'P',nat:'C'});
const C=(cd,nm)=>({cd,nm,tp:'C',nat:'D'});
const I=(cd,nm)=>({cd,nm,tp:'I',nat:'C'});

// Cuentas del plan base que son propias del rubro agrícola/forestal (o de
// La Cabaña) y no se llevan a las demás plantillas.
const QUITAR_EN_RUBROS=new Set([
  '1109001','1109002','1109003','1109004','1109005','1109006',
  '1110','1110001','1190005','1206','1206001','1210','1210001','2209','2209001',
  '3101001','3101002','3101003','3101004','3101005',
  '3103001','3103002','3103003','3103004','3103005','3103006','3103007',
  '4101001','4101002','4101003','4101004','4101005',
]);
// Nombres genéricos para cuentas bancarias que en el base son de una empresa.
const RENOMBRAR_EN_RUBROS={
  '1101202':'BANCO DE CHILE',
  '1101203':'BANCO CUENTA SECUNDARIA',
  '1101204':'BANCO CUENTA EN DÓLARES',
  '3101':'COSTO DE VENTAS',
  '3103':'OTROS COSTOS DE EXPLOTACIÓN',
};

const PLANTILLAS=[
  {id:'agroforestal',nm:'General · Agrícola y forestal',icono:'🌲',
   desc:'El plan estándar del sistema, sin cambios: maderas, bosques, plantaciones, cultivos y servicios forestales.',
   cuentas:null},

  {id:'comercio',nm:'Comercio minorista (minimarket, supermercado)',icono:'🛒',
   desc:'Mercaderías e inventario, ventas separadas por factura, boleta y delivery, mermas, comisiones de tarjetas y arriendo de local.',
   cuentas:[
     A('1109005','ENVASES Y BOLSAS'),
     A('1109007','MERCADERÍAS'),
     A('1109008','MERCADERÍAS EN CONSIGNACIÓN'),
     C('3101001','COSTO DE VENTA PERECIBLES'),
     C('3101002','COSTO DE VENTA MERCADERÍAS'),
     C('3101003','COSTO DE VENTA OTROS PRODUCTOS'),
     C('3101004','MERMAS Y PÉRDIDAS DE MERCADERÍAS'),
     C('3101005','FLETES SOBRE COMPRAS'),
     C('3103001','BOLSAS Y MATERIAL DE EMPAQUE'),
     C('3103002','ARRIENDO DE LOCAL COMERCIAL'),
     C('3103003','COMISIONES POR VENTAS CON TARJETA'),
     C('3103004','MANTENCIÓN DE EQUIPOS DE FRÍO'),
     C('3103005','RETIRO DE RESIDUOS'),
     I('4101001','VENTAS DE MERCADERÍAS'),
     I('4101002','VENTAS CON FACTURA'),
     I('4101003','VENTAS CON BOLETA'),
     I('4101004','VENTAS POR APLICACIONES Y DELIVERY'),
     I('4101005','COMISIONES POR RECAUDACIÓN DE SERVICIOS'),
   ]},

  {id:'banqueteria',nm:'Banquetería y gastronomía',icono:'🍽️',
   desc:'Materias primas y bebidas, costo por evento (un centro de costo por evento), personal externo, arriendo de salones y menaje, propinas por pagar.',
   cuentas:[
     A('1109001','MATERIAS PRIMAS ALIMENTOS'),
     A('1109002','BEBIDAS Y LICORES'),
     A('1109003','VAJILLA Y MENAJE'),
     A('1109005','ENVASES Y DESECHABLES'),
     A('1109007','MERCADERÍAS'),
     P('2105007','PROPINAS POR PAGAR AL PERSONAL'),
     C('3101001','COSTO MATERIAS PRIMAS ALIMENTOS'),
     C('3101002','COSTO DE VENTA MERCADERÍAS'),
     C('3101003','COSTO DE EVENTOS'),
     C('3101004','COSTO BEBIDAS Y LICORES'),
     C('3101005','MERMAS DE ALIMENTOS'),
     C('3103001','PERSONAL EXTERNO DE EVENTOS'),
     C('3103002','ARRIENDO DE SALONES Y RECINTOS'),
     C('3103003','ARRIENDO DE MOBILIARIO Y MENAJE'),
     C('3103004','FLETE Y TRASLADO A EVENTOS'),
     C('3103005','GAS DE COCINA'),
     C('3103006','DECORACIÓN Y AMBIENTACIÓN'),
     C('3103007','DESECHABLES Y ASEO DE COCINA'),
     I('4101001','INGRESOS POR BANQUETERÍA'),
     I('4101002','VENTAS CON FACTURA'),
     I('4101003','VENTAS CON BOLETA'),
     I('4101004','INGRESOS POR SERVICIO DE ALIMENTACIÓN Y CASINO'),
     I('4101005','ARRIENDO DE MOBILIARIO Y MENAJE A CLIENTES'),
   ]},

  {id:'contratistas',nm:'Contratistas (eléctricos, construcción)',icono:'⚡',
   desc:'Materiales en bodega, costo por obra (un centro de costo por obra), subcontratos, retenciones de garantía, estados de pago y certificaciones.',
   cuentas:[
     A('1104007','RETENCIONES DE GARANTÍA POR COBRAR'),
     A('1104008','ESTADOS DE PAGO POR FACTURAR'),
     A('1109001','OBRAS EN EJECUCIÓN'),
     A('1109002','HERRAMIENTAS MENORES'),
     A('1109007','MATERIALES EN BODEGA'),
     P('2102008','RETENCIONES DE GARANTÍA A SUBCONTRATISTAS'),
     C('3101001','COSTO MATERIALES DE OBRA'),
     C('3101002','COSTO DE VENTA MATERIALES'),
     C('3101003','COSTO DE OBRAS'),
     C('3101004','SUBCONTRATOS'),
     C('3101005','COSTO DE SERVICIOS DE MANTENCIÓN'),
     C('3103001','ARRIENDO DE MAQUINARIA Y ANDAMIOS'),
     C('3103002','HERRAMIENTAS Y FUNGIBLES'),
     C('3103003','COMBUSTIBLE Y LUBRICANTES'),
     C('3103004','FLETES Y TRASLADOS A OBRA'),
     C('3103005','ELEMENTOS DE PROTECCIÓN PERSONAL'),
     C('3103006','PERMISOS, CERTIFICACIONES Y TRÁMITES SEC'),
     C('3103007','BOLETAS DE GARANTÍA Y SEGUROS DE OBRA'),
     I('4101001','INGRESOS POR OBRAS (ESTADOS DE PAGO)'),
     I('4101002','VENTAS CON FACTURA'),
     I('4101003','VENTAS CON BOLETA'),
     I('4101004','INGRESOS POR SERVICIOS DE MANTENCIÓN'),
     I('4101005','INGRESOS POR VENTA DE MATERIALES'),
   ]},

  {id:'transporte',nm:'Transporte de carga',icono:'🚚',
   desc:'Repuestos y neumáticos, costo de operación por camión (un centro de costo por equipo), combustible, peajes, fletes subcontratados y viáticos.',
   cuentas:[
     A('1109001','NEUMÁTICOS EN BODEGA'),
     A('1109002','COMBUSTIBLE EN ESTANQUE'),
     A('1109007','REPUESTOS E INSUMOS'),
     C('3101001','COMBUSTIBLE DE FLOTA'),
     C('3101002','COSTO DE VENTA REPUESTOS'),
     C('3101003','COSTO DE OPERACIÓN DE FLOTA'),
     C('3101004','PEAJES Y PESAJES'),
     C('3101005','NEUMÁTICOS'),
     C('3103001','MANTENCIÓN Y REPARACIÓN DE FLOTA'),
     C('3103002','ARRIENDO DE CAMIONES Y EQUIPOS'),
     C('3103003','LUBRICANTES Y FILTROS'),
     C('3103004','FLETES SUBCONTRATADOS'),
     C('3103005','SEGUROS DE CARGA Y FLOTA'),
     C('3103006','PERMISOS DE CIRCULACIÓN Y REVISIÓN TÉCNICA'),
     C('3103007','VIÁTICOS DE CONDUCTORES'),
     I('4101001','INGRESOS POR FLETES'),
     I('4101002','VENTAS CON FACTURA'),
     I('4101003','VENTAS CON BOLETA'),
     I('4101004','ARRIENDO DE CAMIONES Y EQUIPOS'),
     I('4101005','INGRESOS POR SERVICIOS LOGÍSTICOS Y BODEGAJE'),
   ]},

  {id:'inmobiliaria',nm:'Inmobiliaria y arriendos',icono:'🏢',
   desc:'Arriendos por cobrar, garantías de arrendatarios, costo por propiedad (un centro de costo por inmueble), gastos comunes, contribuciones y corretaje.',
   cuentas:[
     A('1104007','ARRIENDOS POR COBRAR'),
     A('1109001','PROPIEDADES PARA LA VENTA'),
     A('1109002','OBRAS EN CONSTRUCCIÓN PARA LA VENTA'),
     A('1109007','MATERIALES EN BODEGA'),
     P('2102008','GARANTÍAS DE ARRENDATARIOS'),
     C('3101001','COSTO DE VENTA DE PROPIEDADES'),
     C('3101002','COSTO DE VENTA MATERIALES'),
     C('3101003','COSTO DE PROPIEDADES Y PROYECTOS'),
     C('3101004','GASTOS COMUNES DE PROPIEDADES ARRENDADAS'),
     C('3101005','CONTRIBUCIONES DE PROPIEDADES ARRENDADAS'),
     C('3103001','MANTENCIÓN Y REPARACIÓN DE PROPIEDADES'),
     C('3103002','COMISIONES DE CORRETAJE'),
     C('3103003','ADMINISTRACIÓN DE PROPIEDADES'),
     C('3103004','SEGUROS DE PROPIEDADES'),
     C('3103005','SERVICIOS BÁSICOS DE PROPIEDADES DESOCUPADAS'),
     I('4101001','INGRESOS POR ARRIENDO DE INMUEBLES'),
     I('4101002','VENTAS CON FACTURA'),
     I('4101003','VENTAS CON BOLETA'),
     I('4101004','INGRESOS POR VENTA DE PROPIEDADES'),
     I('4101005','INGRESOS POR ADMINISTRACIÓN DE PROPIEDADES'),
   ]},
];

const PLANTILLA_DEFAULT='agroforestal';
const plantillaInfo=id=>PLANTILLAS.find(p=>p.id===id)||null;

// Arma el plan completo de una plantilla. Siempre una copia nueva: nunca
// devuelve objetos compartidos con PDC_DEFAULT ni con otra plantilla.
function construirPlanPlantilla(id){
  const p=plantillaInfo(id);
  if(!p)return null;
  const base=JSON.parse(JSON.stringify(PDC_DEFAULT));
  if(!p.cuentas)return base;
  const plan=base
    .filter(c=>!QUITAR_EN_RUBROS.has(c.cd))
    .map(c=>RENOMBRAR_EN_RUBROS[c.cd]?{...c,nm:RENOMBRAR_EN_RUBROS[c.cd]}:c);
  const idx=new Map(plan.map((c,i)=>[c.cd,i]));
  for(const c of p.cuentas){
    const nueva={...c};
    if(idx.has(c.cd))plan[idx.get(c.cd)]=nueva;   // el rubro manda sobre el base
    else{idx.set(c.cd,plan.length);plan.push(nueva);}
  }
  plan.sort((a,b)=>String(a.cd).localeCompare(String(b.cd)));   // mismo orden que renderPDC
  return plan;
}

export {PLANTILLAS, PLANTILLA_DEFAULT, plantillaInfo, construirPlanPlantilla};
