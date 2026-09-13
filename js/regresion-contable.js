// regresion-contable.js — V2.15.6 · batería de regresión contable previa a productivo.
// Las pruebas trabajan en memoria y restauran el estado global al terminar.
import {S} from './state.js';
import {asientoVenta,asientoCompra,asientoHonorario,asientoPagoHonorario,cuadratura,pagosDocumento,clasificacionIVACompra,fechaContabilizacionCompra} from './motor-contable.js';
import {validarAsientoCentral} from './contabilidad-v2.js';
import {validarMutacionAsientos} from './asiento-validacion.js';
import {calcularF29Anual,F29DECL} from './tributario.js';
import {calcularDepreciacionContable,calcularDepreciacionTributaria} from './activofijo.js';
import {calcularLiquidacion} from './remuneraciones.js';

const n=v=>Number(v)||0;
const eq=(a,b,tol=1)=>Math.abs(n(a)-n(b))<=tol;
function assert(cond,msg){if(!cond)throw new Error(msg);}
function t(nombre,categoria,fn){
  try{const detalle=fn();return {nombre,categoria,ok:true,detalle:detalle||'OK'};}
  catch(e){return {nombre,categoria,ok:false,detalle:e?.message||String(e)};}
}
function totalMovs(movs){return (movs||[]).reduce((a,m)=>({debe:a.debe+n(m.debe),haber:a.haber+n(m.haber)}),{debe:0,haber:0});}
function saldoCuenta(asientos,cd){return (asientos||[]).filter(a=>!a.anulado).reduce((s,a)=>s+(a.movs||[]).filter(m=>m.cd===cd).reduce((x,m)=>x+n(m.debe)-n(m.haber),0),0);}
function resumenLibros(asientos){
  const diario=(asientos||[]).filter(a=>!a.anulado).reduce((r,a)=>{const z=totalMovs(a.movs);r.debe+=z.debe;r.haber+=z.haber;return r;},{debe:0,haber:0});
  const porCuenta={};
  (asientos||[]).filter(a=>!a.anulado).forEach(a=>(a.movs||[]).forEach(m=>{
    const k=m.cd||'';if(!porCuenta[k])porCuenta[k]={debe:0,haber:0,saldo:0};
    porCuenta[k].debe+=n(m.debe);porCuenta[k].haber+=n(m.haber);porCuenta[k].saldo+=n(m.debe)-n(m.haber);
  }));
  const mayor=Object.values(porCuenta).reduce((r,x)=>({debe:r.debe+x.debe,haber:r.haber+x.haber,saldo:r.saldo+x.saldo}),{debe:0,haber:0,saldo:0});
  return {diario,mayor,porCuenta};
}
function snapEstado(){return {
  empresa:{...S.empresa},ventas:S.ventas,compras:S.compras,honorarios:S.honorarios,asientos:S.asientos,activos:S.activos,trabajadores:S.trabajadores,cierresContables:S.cierresContables,
  f29:{anio:F29DECL.anio,items:F29DECL.items,loaded:F29DECL.loaded,cargando:F29DECL.cargando}
};}
function restoreEstado(x){
  S.empresa=x.empresa;S.ventas=x.ventas;S.compras=x.compras;S.honorarios=x.honorarios;S.asientos=x.asientos;S.activos=x.activos;S.trabajadores=x.trabajadores;S.cierresContables=x.cierresContables;
  F29DECL.anio=x.f29.anio;F29DECL.items=x.f29.items;F29DECL.loaded=x.f29.loaded;F29DECL.cargando=x.f29.cargando;
}

function ejecutarRegresionContableCompleta(){
  const pruebas=[];
  const add=(nombre,categoria,fn)=>pruebas.push(t(nombre,categoria,fn));
  const snap=snapEstado();
  try{
    // 1. Ventas / notas
    add('Venta afecta DTE 33','Ventas',()=>{
      const a=asientoVenta({id:'rv33',fecha:'2026-09-05',tipoDTE:33,numero:'100',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE',neto:100000,exento:0,iva:19000,total:119000,cuentaIngreso:'4101001'});
      assert(cuadratura(a.movs).ok,'Asiento descuadrado');assert(eq(totalMovs(a.movs).debe,119000),'Total debe incorrecto');return '$119.000 balanceado';
    });
    add('Venta exenta DTE 34','Ventas',()=>{
      const a=asientoVenta({id:'rv34',fecha:'2026-09-05',tipoDTE:34,numero:'101',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE',neto:0,exento:50000,iva:0,total:50000,cuentaIngreso:'4101001'});
      assert(cuadratura(a.movs).ok,'Venta exenta descuadrada');return 'Exento sin débito fiscal';
    });
    add('Nota de crédito venta DTE 61','Ventas',()=>{
      const a=asientoVenta({id:'rv61',fecha:'2026-09-06',tipoDTE:61,numero:'102',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE',neto:20000,exento:0,iva:3800,total:23800,cuentaIngreso:'4101001',referencia:{tipoDTE:33,folio:'100',fecha:'2026-09-05'}});
      assert(cuadratura(a.movs).ok,'NC descuadrada');assert(saldoCuenta([{movs:a.movs}], '2103003')>0,'NC no revierte IVA débito');return 'Reversa ingreso/IVA/cliente';
    });
    add('Nota de débito venta DTE 56','Ventas',()=>{
      const a=asientoVenta({id:'rv56',fecha:'2026-09-06',tipoDTE:56,numero:'103',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE',neto:10000,exento:0,iva:1900,total:11900,cuentaIngreso:'4101001',referencia:{tipoDTE:33,folio:'100',fecha:'2026-09-05'}});
      assert(cuadratura(a.movs).ok,'ND descuadrada');return 'Aumenta débito fiscal';
    });

    // 2. Compras / IVA
    add('Compra afecta DTE 33','Compras',()=>{
      const a=asientoCompra({id:'rc33',fecha:'2026-09-07',tipoDTE:33,numero:'200',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:100000,exento:0,iva:19000,total:119000,dist:[{cuenta:'5101001',monto:100000}]});
      assert(cuadratura(a.movs).ok,'Compra afecta descuadrada');assert(eq(saldoCuenta([{movs:a.movs}],'1108002'),19000),'IVA crédito incorrecto');return 'Crédito fiscal $19.000';
    });
    add('Compra neta + exenta','Compras',()=>{
      const a=asientoCompra({id:'rcmix',fecha:'2026-09-07',tipoDTE:33,numero:'201',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:100000,exento:50000,iva:19000,total:169000,dist:[{cuenta:'5101001',monto:150000}]});
      assert(cuadratura(a.movs).ok,'Compra mixta descuadrada');return 'Base económica $150.000';
    });
    add('IVA no recuperable va a costo','Compras',()=>{
      const d={id:'rcnr',fecha:'2026-09-07',tipoDTE:33,numero:'202',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:100000,iva:19000,total:119000,tratamientoIVA:'no_recuperable',dist:[{cuenta:'5101001',monto:100000}]};
      const c=clasificacionIVACompra(d),a=asientoCompra(d);assert(c.noRecuperable===19000&&c.recuperable===0,'Clasificación IVA incorrecta');assert(eq(saldoCuenta([{movs:a.movs}],'5101001'),119000),'IVA no fue incorporado al costo');return '$19.000 incorporado a costo';
    });
    add('IVA proporcional','Compras',()=>{
      const d={id:'rcprop',fecha:'2026-09-07',tipoDTE:33,numero:'203',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:100000,iva:19000,total:119000,tratamientoIVA:'proporcional',porcentajeIvaRecuperable:60,dist:[{cuenta:'5101001',monto:100000}]};
      const c=clasificacionIVACompra(d),a=asientoCompra(d);assert(c.recuperable===11400&&c.noRecuperable===7600,'Prorrata IVA incorrecta');assert(cuadratura(a.movs).ok,'Asiento proporcional descuadrado');return '60% recuperable / 40% costo';
    });
    add('IVA activo fijo separado','Compras',()=>{
      const d={id:'rcaf',fecha:'2026-09-07',tipoDTE:33,numero:'204',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:1000000,iva:190000,total:1190000,tratamientoIVA:'activo_fijo',ivaActivoFijo:190000,dist:[{cuenta:'1201003',monto:1000000}]};
      const a=asientoCompra(d);assert(eq(saldoCuenta([{movs:a.movs}],'1108008'),190000),'IVA AF no fue a 1108008');return 'IVA AF $190.000';
    });
    add('Factura de compra DTE 45/46 con retención','Compras',()=>{
      [45,46].forEach(tipo=>{const a=asientoCompra({id:'rc'+tipo,fecha:'2026-09-07',tipoDTE:tipo,numero:String(tipo),rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:100000,iva:19000,ivaRetenido:19000,total:119000,dist:[{cuenta:'5101001',monto:100000}]});assert(cuadratura(a.movs).ok,`DTE ${tipo} descuadrado`);assert(eq(-saldoCuenta([{movs:a.movs}],'2103005'),19000),`Retención DTE ${tipo} incorrecta`);});return 'DTE 45 y 46 balanceados';
    });
    add('NC de factura de compra revierte retención','Compras',()=>{
      const a=asientoCompra({id:'rc61ret',fecha:'2026-09-07',tipoDTE:61,numero:'249',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:50000000,iva:9500000,ivaRetenido:9500000,total:50000000,totalIncluyeRetencion:false,dist:[{cuenta:'5101001',monto:50000000}]});
      assert(cuadratura(a.movs).ok,'NC con retención descuadrada');
      assert(eq(saldoCuenta([{movs:a.movs}],'2103005'),9500000),'NC no revirtió IVA retenido');
      return 'Proveedor e IVA retenido revertidos';
    });
    add('RCV conserva fecha documental','Compras',()=>{const d={fecha:'2026-08-15',periodoContable:'2026-09',fechaContabilizacion:'2026-09-30'};assert(fechaContabilizacionCompra(d)==='2026-09-30','Fecha contable incorrecta');assert(d.fecha==='2026-08-15','Fecha DTE alterada');return '15-08 contabiliza 30-09';});

    // 3. Honorarios / pagos / auxiliares
    add('Honorario: reconocimiento separado del pago','Honorarios',()=>{
      const h={id:'rh1',fecha:'2026-09-10',fechaPago:'2026-09-12',numero:'10',rut:'12345678-5',nombre:'PRESTADOR',bruto:100000,retencion:14500,cuentaPago:'1101201'};
      const rec=asientoHonorario(h,2026),pag=asientoPagoHonorario(h,2026);assert(cuadratura(rec.movs).ok&&cuadratura(pag.movs).ok,'Honorario descuadrado');assert(eq(-saldoCuenta([{movs:rec.movs}],'2103002'),14500),'Retención incorrecta');assert(eq(saldoCuenta([{movs:rec.movs},{movs:pag.movs}],'2102006'),0),'Honorario por pagar no quedó saldado');return 'Bruto $100.000 · retención $14.500';
    });
    add('Pago parcial mantiene saldo auxiliar','Auxiliares',()=>{
      const doc={id:'rp1',total:119000,pagos:[]};
      const asientos=[{id:'pay1',tipo:'pago',fecha:'2026-09-15',documentos:[{docId:'rp1',monto:50000,tipo:'proveedor'}],movs:[{cd:'2102001',debe:50000,haber:0,docId:'rp1'},{cd:'1101201',debe:0,haber:50000}]}];
      const pagos=pagosDocumento(doc,'proveedor',asientos);const pagado=pagos.reduce((s,p)=>s+n(p.monto),0);assert(pagado===50000,'Pago no derivado desde asiento');assert(doc.total-pagado===69000,'Saldo auxiliar incorrecto');return 'Pagado $50.000 · saldo $69.000';
    });

    // 4. F29 con remanente declarado histórico
    add('F29 usa período RCV y arrastre declarado','F29',()=>{
      S.empresa={...S.empresa,anio:2026,tasaPPM:0};S.ventas=[{id:'fv1',fecha:'2026-09-05',tipoDTE:33,numero:'1',neto:1000000,exento:0,iva:190000,total:1190000,estado:'activo'}];
      S.compras=[{id:'fc8',fecha:'2026-08-10',periodoContable:'2026-08',tipoDTE:33,numero:'8',neto:1000000,exento:0,iva:190000,total:1190000,estado:'activo'},{id:'fc9',fecha:'2026-08-15',periodoContable:'2026-09',fechaContabilizacion:'2026-09-30',tipoDTE:33,numero:'9',neto:100000,exento:0,iva:19000,total:119000,estado:'activo'}];
      S.honorarios=[];F29DECL.anio=2026;F29DECL.loaded=true;F29DECL.items={'2026-08':{periodo:'2026-08',estado:'presentado',declarado:{'77':180000}}};
      const f=calcularF29Anual();assert(f[8].codigos[504]===180000,'Septiembre no arrastró remanente declarado');assert(f[8].nDocsC===1,'Compra fecha agosto/período septiembre no entró en septiembre');assert(f[8].codigos[89]===0,'IVA septiembre esperado sin pago por remanente');return 'Cód.504 = $180.000 declarado';
    });

    // 5. Activo fijo / remuneraciones
    add('Depreciación contable y tributaria independientes','Activo fijo',()=>{
      const b={id:'af1',cat:'vehiculos',fecha:'2026-01-01',valor:7000000,valorContable:7000000,valorTributario:7000000,residualContable:0,residualTributario:0,vidaContable:7,vidaTributaria:7,metodoContable:'lineal',metodoTributario:'acelerada',fechaInicioDepContable:'2026-01-01',fechaInicioDepTributaria:'2026-01-01'};
      const c=calcularDepreciacionContable(b,2026),tr=calcularDepreciacionTributaria(b,2026);assert(c.deprEsteAnio>0&&tr.deprEsteAnio>0,'Depreciación cero');assert(tr.deprEsteAnio>=c.deprEsteAnio,'Acelerada tributaria debería ser >= contable');assert(eq(c.valorLibro,7000000-c.acumulada), 'Valor libro contable inconsistente');return `Contable ${Math.round(c.deprEsteAnio)} · tributaria ${Math.round(tr.deprEsteAnio)}`;
    });
    add('Liquidación de remuneraciones conserva ecuación','Remuneraciones',()=>{
      const l=calcularLiquidacion({base:1200000,otros:100000,colacion:60000,movilizacion:40000,gratifModo:'monto',grat:100000,afp:'capital',salud:'fonasa',contrato:'indefinido'},40000,68000);
      assert(eq(l.liquido+l.totalDescuentos,l.totalHaberes),'Líquido + descuentos != haberes');assert(eq(l.costoEmpresa,l.totalHaberes+l.patronal.total),'Costo empresa inconsistente');return `Líquido ${Math.round(l.liquido)} · costo ${Math.round(l.costoEmpresa)}`;
    });

    // 6. Libros y guardas centrales
    add('Diario = Mayor = Balance','Libros',()=>{
      const apertura={id:'ra',fecha:'2026-01-01',tipo:'apertura',movs:[{cd:'1101201',debe:1000000,haber:0},{cd:'3101001',debe:0,haber:1000000}]};
      const venta=asientoVenta({id:'rlv',fecha:'2026-09-05',tipoDTE:33,numero:'500',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE',neto:100000,iva:19000,total:119000,cuentaIngreso:'4101001'});
      const compra=asientoCompra({id:'rlc',fecha:'2026-09-06',tipoDTE:33,numero:'501',rutCodigo:'22222222',rutDV:'2',razonSocial:'PROVEEDOR',neto:50000,iva:9500,total:59500,dist:[{cuenta:'5101001',monto:50000}]});
      const as=[apertura,{id:'v',movs:venta.movs},{id:'c',movs:compra.movs}];const r=resumenLibros(as);
      assert(eq(r.diario.debe,r.diario.haber),'Diario descuadrado');assert(eq(r.diario.debe,r.mayor.debe)&&eq(r.diario.haber,r.mayor.haber),'Mayor no coincide con Diario');assert(eq(r.mayor.saldo,0),'Balance de comprobación no suma cero');return `Debe/Haber ${Math.round(r.diario.debe)}`;
    });
    add('Puerta central rechaza descuadre y cuenta inválida','Integridad',()=>{
      S.cierresContables=[];const bueno={id:'rg1',fecha:'2026-09-10',tipo:'manual',movs:[{cd:'1101101',debe:1000,haber:0},{cd:'1101201',debe:0,haber:1000}]};
      const r1=validarAsientoCentral(bueno,{validarReferencias:false});assert(r1.ok,'Asiento válido rechazado: '+(r1.errores||[])[0]);
      const malo={...bueno,id:'rg2',movs:[{cd:'9999999',debe:1000,haber:0},{cd:'1101201',debe:0,haber:900}]};const r2=validarAsientoCentral(malo,{validarReferencias:false});assert(!r2.ok,'Asiento inválido aceptado');return 'Válido aceptado / inválido bloqueado';
    });
    add('Período cerrado bloquea asiento','Integridad',()=>{
      S.cierresContables=[{periodo:'2026-09',estado:'cerrado'}];const a={id:'rg3',fecha:'2026-09-10',tipo:'manual',movs:[{cd:'1101101',debe:1000,haber:0},{cd:'1101201',debe:0,haber:1000}]};const r=validarMutacionAsientos([], [a]);assert(!r.ok,'Asiento en período cerrado fue aceptado');return 'Septiembre cerrado → escritura rechazada';
    });
  }finally{restoreEstado(snap);}
  const aprobadas=pruebas.filter(x=>x.ok).length;
  const categorias={};pruebas.forEach(p=>{if(!categorias[p.categoria])categorias[p.categoria]={total:0,aprobadas:0};categorias[p.categoria].total++;if(p.ok)categorias[p.categoria].aprobadas++;});
  return {ok:aprobadas===pruebas.length,total:pruebas.length,aprobadas,fallidas:pruebas.length-aprobadas,pruebas,categorias,ejecutadoEn:new Date().toISOString()};
}

export {ejecutarRegresionContableCompleta,resumenLibros};
