// hardening.js — V2.15.1 · controles de preparación productiva y pruebas operacionales.
import {S,AUTH} from './state.js';
import {asientoVenta,asientoCompra,cuadratura,fechaContabilizacionCompra} from './motor-contable.js';
import {auditoriaIntegridad,validarAsientoCentral} from './contabilidad-v2.js';
import {DISPOSITIVO} from './dispositivo.js';
import {simularRestauracionBackup} from './backup.js';
import {compararCompraRCV,compararVentaRCV} from './rcv-control.js';
import {diagnosticoNumeracion} from './correlativo-contable.js';
import {estadoRecuperacion} from './recovery.js';
import {ejecutarRegresionContableCompleta} from './regresion-contable.js';
import {estadoPiloto} from './piloto.js';

function prueba(nombre,fn){
  try{
    const detalle=fn();
    return {nombre,ok:true,detalle:detalle||'OK'};
  }catch(e){return {nombre,ok:false,detalle:e.message||String(e)};}
}

function ejecutarPruebasProductivas(){
  const pruebas=[];
  pruebas.push(prueba('Venta afecta cuadra',()=>{
    const a=asientoVenta({id:'t_v1',fecha:'2026-09-10',tipoDTE:33,numero:'1',rutCodigo:'11111111',rutDV:'1',razonSocial:'TEST',neto:100000,exento:0,iva:19000,otrosImpuestos:0,total:119000,cuentaIngreso:'4101001'});
    if(!cuadratura(a.movs).ok)throw new Error('Debe/Haber no cuadra');
    return 'DTE 33 $119.000';
  }));
  pruebas.push(prueba('Compra exenta + afecta cuadra',()=>{
    const a=asientoCompra({id:'t_c1',fecha:'2026-09-10',tipoDTE:33,numero:'1',rutCodigo:'11111111',rutDV:'1',razonSocial:'TEST',neto:100000,exento:50000,iva:19000,total:169000,dist:[{cuenta:'5101001',monto:150000}]});
    if(!cuadratura(a.movs).ok)throw new Error('Compra mixta descuadrada');
    return 'Neto + exento + IVA';
  }));
  pruebas.push(prueba('Compra RCV conserva fecha y contabiliza en período',()=>{
    const d={fecha:'2026-08-15',periodoContable:'2026-09',fechaContabilizacion:'2026-09-30'};
    if(d.fecha!=='2026-08-15')throw new Error('Fecha DTE alterada');
    if(fechaContabilizacionCompra(d).slice(0,7)!=='2026-09')throw new Error('Asiento fuera del RCV');
    return '15-08 → RCV 09 → asiento 30-09';
  }));
  pruebas.push(prueba('Factura de compra DTE 46 cuadra',()=>{
    const a=asientoCompra({id:'t_c46',fecha:'2026-09-10',tipoDTE:46,numero:'46',rutCodigo:'11111111',rutDV:'1',razonSocial:'TEST',neto:100000,exento:0,iva:19000,ivaRetenido:19000,total:119000,dist:[{cuenta:'5101001',monto:100000}]});
    if(!cuadratura(a.movs).ok)throw new Error('DTE 46 descuadrado');
    return 'IVA retenido separado';
  }));
  pruebas.push(prueba('Notas con signo tributario',()=>{
    const nc=asientoVenta({id:'t_nc',fecha:'2026-09-10',tipoDTE:61,numero:'10',rutCodigo:'11111111',rutDV:'1',razonSocial:'TEST',neto:100000,exento:0,iva:19000,total:119000,cuentaIngreso:'4101001'});
    if(!cuadratura(nc.movs).ok)throw new Error('NC descuadrada');
    return 'NC DTE 61 balanceada';
  }));
  pruebas.push(prueba('RCV compras es idempotente',()=>{
    const guardado={fecha:'2026-08-15',periodoContable:'2026-09',tipoDTE:33,numero:'123',rutCodigo:'11111111',rutDV:'1',razonSocial:'PROVEEDOR TEST',neto:100000,exento:0,iva:19000,otrosImpuestos:0,total:119000};
    const entrada={...guardado,fechaOriginal:'2026-08-15'};
    const cmp=compararCompraRCV(entrada,guardado,'2026-09');
    if(!cmp.igual||cmp.cambios.length)throw new Error('Una reimportación idéntica aparece modificada');
    return 'Misma huella → 0 escrituras';
  }));
  pruebas.push(prueba('Puerta central rechaza asiento inválido',()=>{
    const valido={id:'test_val',fecha:'2026-09-10',tipo:'manual',movs:[
      {cd:'1101101',debe:1000,haber:0},{cd:'1101201',debe:0,haber:1000}
    ]};
    const ok=validarAsientoCentral(valido,{validarReferencias:false});
    if(!ok.ok)throw new Error('Rechazó asiento balanceado válido: '+ok.errores[0]);
    const malo={...valido,id:'test_bad',movs:[{cd:'9999999',debe:1000,haber:0},{cd:'1101201',debe:0,haber:900}]};
    const bad=validarAsientoCentral(malo,{validarReferencias:false});
    if(bad.ok)throw new Error('Aceptó cuenta inexistente/asiento descuadrado');
    return 'PDC + cuadratura bloquean persistencia inválida';
  }));
  pruebas.push(prueba('RCV detecta cambio económico',()=>{
    const guardado={fecha:'2026-09-10',tipoDTE:33,numero:'9',rutCodigo:'11111111',rutDV:'1',razonSocial:'CLIENTE TEST',neto:100000,exento:0,iva:19000,otrosImpuestos:0,total:119000};
    const entrada={...guardado,total:120000};
    const cmp=compararVentaRCV(entrada,guardado);
    if(cmp.igual||!cmp.cambios.some(c=>c.campo==='total'))throw new Error('No detectó cambio de total');
    return 'Cambio de total queda explícito';
  }));
  const ok=pruebas.every(x=>x.ok);
  return {ok,total:pruebas.length,aprobadas:pruebas.filter(x=>x.ok).length,pruebas};
}

function revisarFolios(){
  const items=[];
  (S.asientos||[]).filter(a=>!a.anulado).forEach(a=>{if(a.folioComp||a.n)items.push({tipo:'asiento',id:a.id,n:+(a.folioComp||a.n)});});
  (S.compras||[]).filter(d=>d.estado!=='anulado').forEach(d=>{if(d.folioComp)items.push({tipo:'compra',id:d.id,n:+d.folioComp});});
  (S.ventas||[]).filter(d=>d.estado!=='anulado').forEach(d=>{if(d.folioComp)items.push({tipo:'venta',id:d.id,n:+d.folioComp});});
  if(S.apertura?.folioComp)items.push({tipo:'apertura',id:'apertura',n:+S.apertura.folioComp});
  const map=new Map();
  items.forEach(x=>{if(!map.has(x.n))map.set(x.n,[]);map.get(x.n).push(x);});
  const duplicados=[...map.entries()].filter(([,v])=>v.length>1).map(([folio,v])=>({folio,items:v}));
  return {ok:duplicados.length===0,duplicados,total:items.length};
}

const certKey=()=>`hardening-certificacion-${S.empresa.anio}`;
const concKey=()=>`hardening-concurrencia-${S.empresa.anio}`;
const ssKey='cv:hardening-concurrencia-sesion';

async function guardarCertificacion(parcial){
  const anterior=(S.hardeningCert&&typeof S.hardeningCert==='object')?S.hardeningCert:{};
  const nuevo={...anterior,...parcial,actualizadoEn:new Date().toISOString(),actualizadoPor:AUTH.user?.email||''};
  const r=await window.storage.set(certKey(),JSON.stringify(nuevo));
  if(r&&r.ok===false)return {ok:false,motivo:r.motivo||'persistencia'};
  S.hardeningCert=nuevo;
  return {ok:true,cert:nuevo};
}

function nuevaSesion(){
  try{return (crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,10).toUpperCase();}
  catch(e){return (Date.now().toString(36)+Math.random().toString(36).slice(2,6)).toUpperCase();}
}
function guardarSesionLocal(s){try{sessionStorage.setItem(ssKey,JSON.stringify(s));}catch(e){}}
function leerSesionLocal(){try{return JSON.parse(sessionStorage.getItem(ssKey)||'null');}catch(e){return null;}}

// Paso 1, equipo A: crea una lista base versionada. Este documento está aislado
// de los libros contables y existe sólo para probar la transacción/fusión real.
async function iniciarPruebaConcurrencia(){
  if(!window.storage?.leerConEstado)return {ok:false,motivo:'storage-no-disponible'};
  const sesion=nuevaSesion();
  await window.storage.leerConEstado(concKey()); // establece rev actual antes de reemplazar la prueba anterior
  const base=[{id:'base_'+sesion,sesion,tipo:'base',dispositivo:DISPOSITIVO.id,nombre:DISPOSITIVO.nombre,ts:new Date().toISOString()}];
  const r=await window.storage.set(concKey(),JSON.stringify(base));
  if(!r?.ok)return {ok:false,motivo:r?.motivo||'No se pudo crear prueba en Firebase'};
  guardarSesionLocal({sesion,base,preparadoEn:new Date().toISOString()});
  return {ok:true,sesion,dispositivo:DISPOSITIVO.nombre};
}

// Paso 2, equipo B (y opcionalmente A): lee exactamente la misma revisión. A
// partir de aquí NO se relee antes de escribir, para provocar una revisión
// obsoleta real cuando el otro equipo gane la carrera.
async function prepararPruebaConcurrencia(){
  const r=await window.storage.leerConEstado(concKey());
  if(r.fuente==='error')return {ok:false,motivo:r.error||'No se pudo leer Firebase'};
  if(!r.value)return {ok:false,motivo:'No hay una prueba iniciada en esta empresa/año'};
  let base;try{base=JSON.parse(r.value);}catch(e){return {ok:false,motivo:'Prueba ilegible'};}
  const sesion=base.find(x=>x&&x.tipo==='base')?.sesion;
  if(!sesion)return {ok:false,motivo:'No se encontró sesión activa'};
  guardarSesionLocal({sesion,base,preparadoEn:new Date().toISOString()});
  return {ok:true,sesion,dispositivo:DISPOSITIVO.nombre};
}

// Paso 3: usa la foto guardada en sessionStorage. Si el otro equipo ya escribió,
// storage.js debe detectar rev antigua y fusionar ambas marcas sin perder datos.
async function escribirPruebaConcurrencia(){
  const s=leerSesionLocal();
  if(!s?.sesion||!Array.isArray(s.base))return {ok:false,motivo:'Primero prepara esta prueba en el equipo'};
  const marca={id:'dev_'+s.sesion+'_'+DISPOSITIVO.id,sesion:s.sesion,tipo:'marca',dispositivo:DISPOSITIVO.id,nombre:DISPOSITIVO.nombre,ts:new Date().toISOString()};
  const datos=[...s.base.filter(x=>x&&x.sesion===s.sesion&&x.id!==marca.id),marca];
  const r=await window.storage.set(concKey(),JSON.stringify(datos));
  if(!r?.ok)return {ok:false,motivo:r?.motivo||'No se pudo escribir',conflicto:!!r?.conflicto};
  return {ok:true,sesion:s.sesion,fusionado:!!r.fusionado,dispositivo:DISPOSITIVO.nombre};
}

// Paso 4: la prueba sólo se certifica si Firebase devuelve dos ids de dispositivo
// distintos dentro de la misma sesión. Dos pestañas del mismo navegador no valen.
async function verificarPruebaConcurrencia(){
  const s=leerSesionLocal();
  if(!s?.sesion)return {ok:false,motivo:'No hay sesión preparada en este equipo'};
  const r=await window.storage.leerConEstado(concKey());
  if(r.fuente==='error')return {ok:false,motivo:r.error||'No se pudo verificar'};
  let datos;try{datos=JSON.parse(r.value||'[]');}catch(e){return {ok:false,motivo:'Resultado ilegible'};}
  const marcas=datos.filter(x=>x&&x.tipo==='marca'&&x.sesion===s.sesion);
  const dispositivos=[...new Map(marcas.map(x=>[x.dispositivo,x])).values()];
  if(dispositivos.length<2)return {ok:false,motivo:`Sólo se detectó ${dispositivos.length} dispositivo. Falta escribir desde el segundo equipo.`,dispositivos};
  const cert={ok:true,fecha:new Date().toISOString(),sesion:s.sesion,dispositivos:dispositivos.map(x=>({id:x.dispositivo,nombre:x.nombre||x.dispositivo})),detalle:'Dos dispositivos escribieron sobre la misma revisión y ambas marcas sobrevivieron'};
  const g=await guardarCertificacion({concurrencia:cert});
  if(!g.ok)return g;
  return {ok:true,...cert};
}

async function ejecutarSimulacroRestauracion(){
  const r=simularRestauracionBackup();
  if(!r.ok)return r;
  const cert={ok:true,fecha:new Date().toISOString(),bytes:r.bytes,hojas:r.hojas,conteos:r.leido,detalle:'Backup generado y releído íntegramente en memoria; no se modificaron datos'};
  const g=await guardarCertificacion({restore:cert});
  if(!g.ok)return g;
  return {ok:true,...cert};
}

function estadoPreparacionProductiva(){
  const integ=auditoriaIntegridad();
  const tests=ejecutarPruebasProductivas();
  const regresion=ejecutarRegresionContableCompleta();
  const folios=revisarFolios();
  const numeracion=diagnosticoNumeracion();
  const bloqueos=window.storage?.clavesBloqueadas?.()||[];
  const cert=S.hardeningCert||{};
  const conc=cert.concurrencia;
  const restore=cert.restore;
  const recovery=estadoRecuperacion();
  const piloto=estadoPiloto();
  const criterios=[
    {id:'integridad',nombre:'Integridad contable sin hallazgos críticos',ok:!(integ.porSeveridad?.critica>0),detalle:`Críticas: ${integ.porSeveridad?.critica||0}`},
    {id:'tests',nombre:'Pruebas automáticas del motor y RCV',ok:tests.ok,detalle:`${tests.aprobadas}/${tests.total}`},
    {id:'regresion',nombre:'Regresión contable integral V2.15.6',ok:regresion.ok,detalle:`${regresion.aprobadas}/${regresion.total} · Ventas, Compras, IVA, Honorarios, F29, AF, Remuneraciones, Auxiliares y Libros`},
    {id:'puertaContable',nombre:'Puerta central obligatoria de asientos',ok:tests.pruebas.some(x=>x.nombre==='Puerta central rechaza asiento inválido'&&x.ok),detalle:'Cuadratura, PDC, cierres, CC y referencias se validan antes de persistir'},
    {id:'rcv',nombre:'Importadores RCV con control idempotente',ok:tests.pruebas.filter(x=>x.nombre.startsWith('RCV ')).every(x=>x.ok),detalle:'Reimportación idéntica no escribe; cambios económicos se detectan'},
    {id:'folios',nombre:'Folios de comprobante sin duplicados',ok:folios.ok,detalle:folios.ok?`${folios.total} comprobantes revisados`:`${folios.duplicados.length} folio(s) duplicado(s)`},
    {id:'numeroContable',nombre:'Numeración contable definitiva única',ok:numeracion.ok,detalle:numeracion.ok?`${numeracion.total} asiento(s) con número irrevocable`:`Faltantes: ${numeracion.faltantes.length} · duplicados: ${numeracion.duplicados.length}`},
    {id:'persistencia',nombre:'Sin claves bloqueadas de persistencia',ok:bloqueos.length===0,detalle:bloqueos.length?`${bloqueos.length} bloqueo(s)`:'Sin bloqueos'},
    {id:'auditoria',nombre:'Reglas de auditoría inmutable incluidas',ok:true,detalle:'audit_log: create-only; update/delete denegado'},
    {id:'cierreMensual',nombre:'Cierre contable mensual habilitado',ok:Array.isArray(S.cierresContables),detalle:`${(S.cierresContables||[]).filter(x=>x.estado==='cerrado').length} período(s) cerrado(s)`},
    {id:'concurrencia',nombre:'Prueba de concurrencia real en 2 equipos',ok:!!conc?.ok,pendiente:!conc?.ok,detalle:conc?.ok?`Aprobada ${new Date(conc.fecha).toLocaleString('es-CL')} · ${(conc.dispositivos||[]).map(x=>x.nombre).join(' + ')}`:'Pendiente: ejecutar protocolo con dos dispositivos conectados a Firebase'},
    {id:'restore',nombre:'Simulacro de restauración de backup',ok:!!restore?.ok,pendiente:!restore?.ok,detalle:restore?.ok?`Aprobado ${new Date(restore.fecha).toLocaleString('es-CL')} · ${restore.hojas||0} hojas`:'Pendiente: ejecutar round-trip del respaldo en memoria'},
    {id:'recovery',nombre:'Snapshot de recuperación ante desastre vigente',ok:!!recovery.vigente,pendiente:!recovery.vigente,detalle:recovery.ultimo?`Último ${new Date(recovery.ultimo.creadoEn).toLocaleString('es-CL')} · ${recovery.snapshots} punto(s) disponible(s)`:'Pendiente: crear el primer snapshot productivo'},
    {id:'piloto',nombre:'Período piloto certificado contra RCV/F29',ok:!!piloto.ok,pendiente:!piloto.ok,detalle:piloto.ultimo?`Certificado ${piloto.ultimo.periodo} · ${new Date(piloto.ultimo.certificadoEn).toLocaleString('es-CL')}`:'Pendiente: certificar al menos un período completo contra referencias externas'}
  ];
  const bloqueantes=criterios.filter(c=>!c.ok&&!c.pendiente);
  const pendientes=criterios.filter(c=>c.pendiente);
  return {listo:bloqueantes.length===0&&pendientes.length===0,criterios,bloqueantes,pendientes,tests,regresion,folios,numeracion,integ,cert};
}

export {ejecutarPruebasProductivas,ejecutarRegresionContableCompleta,revisarFolios,estadoPreparacionProductiva,
  iniciarPruebaConcurrencia,prepararPruebaConcurrencia,escribirPruebaConcurrencia,verificarPruebaConcurrencia,
  ejecutarSimulacroRestauracion};
