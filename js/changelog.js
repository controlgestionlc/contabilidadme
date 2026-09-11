// changelog.js — Historial de versiones de la aplicación
//
// Este módulo es la FUENTE ÚNICA de la versión: el badge del encabezado se
// rellena desde aquí al arrancar, así que al publicar una versión nueva solo
// hay que tocar este archivo (y el `?v=` del importmap en index.html, que es
// cache-busting del navegador y no puede leerse desde JS).
//
// Módulo puro: sin imports, para que cualquiera pueda leer APP_VERSION sin
// arrastrar dependencias ni arriesgar ciclos.

const APP_VERSION='v2026.09.11-1525';

// Historial, de la más reciente a la más antigua.
//   tipo: 'nuevo' | 'arreglo' | 'cambio'
// Cada entrada describe QUÉ cambia para quien usa el sistema, no qué función se
// tocó: esto lo lee un contador, no quien programa.
const CHANGELOG=[
  {
    v:'v2026.09.11-1525',
    fecha:'2026-09-11',
    titulo:'Núcleo V2.10 — Persistencia atómica y cierre seguro',
    cambios:[
      {tipo:'arreglo', txt:'Libro y asiento maestro se guardan en una sola transacción: una falla de Firebase ya no puede dejar sólo la mitad del hecho económico persistido.'},
      {tipo:'arreglo', txt:'El guardado local ya no se actualiza antes de confirmar Firestore cuando la nube está activa, evitando operaciones que parecían guardadas tras una falla remota.'},
      {tipo:'arreglo', txt:'Anulaciones masivas de compras y ventas anulan también sus asientos maestros y hacen rollback completo si la persistencia falla.'},
      {tipo:'arreglo', txt:'Cambios masivos de forma de pago en ventas regeneran el asiento maestro y respetan el bloqueo de ejercicio cerrado.'},
      {tipo:'arreglo', txt:'Convertir un comprobante automático a manual anula el asiento automático original para evitar doble contabilización.'},
      {tipo:'nuevo', txt:'El cierre del ejercicio se bloquea si la Auditoría de Integridad mantiene hallazgos críticos.'},
      {tipo:'nuevo', txt:'Auditoría informa claves de persistencia bloqueadas por una lectura remota fallida.'},
    ],
  },
  {
    v:'v2026.09.11-1240',
    fecha:'2026-09-11',
    titulo:'Núcleo V2.4 — Plan de cuentas, activos y preparación de migración',
    cambios:[
      {tipo:'nuevo', txt:'La configuración de Firebase queda centralizada en un único archivo para facilitar la migración a un proyecto nuevo.'},
      {tipo:'nuevo', txt:'El Plan de Cuentas incorpora reglas de comportamiento: cuentas agrupadoras, auxiliares obligatorios, centros de costo, cuentas tributarias y permisos de movimiento.'},
      {tipo:'arreglo', txt:'Los asientos manuales y automáticos validan las reglas del Plan de Cuentas antes de contabilizar.'},
      {tipo:'nuevo', txt:'Activo Fijo separa depreciación contable y tributaria. Los asientos financieros usan únicamente la depreciación contable.'},
      {tipo:'cambio', txt:'Auditoría de Integridad incorpora reglas PDC, control mensual de IVA y detección de activos aún en el modelo histórico.'},
      {tipo:'arreglo', txt:'Comprobantes ya no elimina físicamente ventas o compras: los documentos se anulan conservando su trazabilidad y asiento asociado.'},
      {tipo:'arreglo', txt:'Cierres de centros de costo y capitalizaciones críticas usan persistencia controlada con rollback ante fallo.'},
    ],
  },
  {
    v:'v2026.08.29-2216',
    fecha:'2026-08-29',
    titulo:'Periodo tributario e historial de versiones',
    cambios:[
      {tipo:'nuevo', txt:'Los libros de compras y ventas distinguen entre la fecha del documento y el periodo tributario en que se declara. Un DTE de agosto que entra al RCV de septiembre por falta de acuse de recibo conserva su fecha real y se declara en septiembre.'},
      {tipo:'nuevo', txt:'Al importar del SII, los documentos arrastrados de otro mes se marcan con ↩ y se informa cuántos son.'},
      {tipo:'cambio', txt:'El filtro de mes en Compras y Ventas ahora filtra por periodo tributario. Los campos Desde/Hasta siguen filtrando por fecha real de emisión.'},
      {tipo:'cambio', txt:'El correlativo mensual y el folio MM-NNN se calculan por periodo: el libro de septiembre numera 1..N incluyendo los arrastrados.'},
      {tipo:'cambio', txt:'El F29 agrupa débito, crédito y la retención de DTE 45/46 por periodo tributario.'},
      {tipo:'cambio', txt:'Se quitó la opción "Forzar todas las fechas al periodo", que reescribía la fecha del documento y ensuciaba vencimientos y aging. El periodo la reemplaza.'},
      {tipo:'arreglo', txt:'La carpeta de Excel vinculada vuelve a restaurarse al arrancar. Un error interno cortaba el arranque a medias y lo impedía.'},
      {tipo:'nuevo', txt:'El respaldo Excel incluye la columna de periodo al exportar y la recupera al importar.'},
      {tipo:'nuevo', txt:'Historial de versiones: pulsa el número de versión del encabezado, o entra en Configuración → Sistema. Un punto verde avisa cuando hay cambios que no has visto.'},
    ],
  },
  {
    v:'v2026.08.29-0212',
    fecha:'2026-08-29',
    titulo:'Correcciones en Comprobantes y Reportes',
    cambios:[
      {tipo:'arreglo', txt:'El filtro "Solo descuadrados" de Comprobantes ya no devuelve la lista vacía.'},
      {tipo:'arreglo', txt:'El buscador por N° de comprobante encuentra cualquier documento del año, no solo los cinco más recientes.'},
      {tipo:'arreglo', txt:'El comparativo entre años del Balance y el Estado de Resultados respeta el filtro de mes: antes la columna del año actual mostraba siempre el ejercicio completo.'},
      {tipo:'cambio', txt:'El Libro Mayor muestra los saldos con signo de presentación, igual que el Balance. Una cuenta con saldo contrario a su naturaleza —un banco sobregirado— ahora se ve en negativo.'},
      {tipo:'arreglo', txt:'Al borrar el número en el buscador de comprobantes ya no se pierde el foco del campo.'},
      {tipo:'nuevo', txt:'Sección "Exportar XML SII" para generar el archivo IECV de compras y ventas. Estaba escrita pero sin acceso desde el menú.'},
    ],
  },
  {
    v:'v2026.08.24-1420',
    fecha:'2026-08-24',
    titulo:'Versión base',
    cambios:[
      {tipo:'nuevo', txt:'Punto de partida del historial de versiones. Los cambios anteriores a esta fecha no están registrados aquí.'},
    ],
  },
];

const ICONO={nuevo:'✨', arreglo:'🔧', cambio:'🔄'};
const ETIQUETA={nuevo:'Nuevo', arreglo:'Arreglo', cambio:'Cambio'};
const COLOR={nuevo:'var(--ach)', arreglo:'var(--warn)', cambio:'var(--info)'};

// Última versión que el usuario ya vio, para marcar lo nuevo con un punto.
// Va en localStorage y no en Firestore: es del dispositivo, no de la empresa.
const CLAVE_VISTA='contab:changelog-visto';

function versionVista(){
  try{return localStorage.getItem(CLAVE_VISTA)||'';}catch(e){return '';}
}
function marcarChangelogVisto(){
  try{localStorage.setItem(CLAVE_VISTA,APP_VERSION);}catch(e){}
}
// ¿Hay versiones que el usuario no ha visto? La comparación es por posición en
// el historial, no alfabética: si la versión guardada ya no existe (o nunca
// hubo ninguna) se considera todo pendiente salvo la primera vez, que se marca
// como vista para no dar la bienvenida con un aviso de novedades.
function hayNovedades(){
  const vista=versionVista();
  if(!vista)return false;
  return vista!==APP_VERSION;
}
function novedadesDesdeUltimaVista(){
  const vista=versionVista();
  const idx=CHANGELOG.findIndex(e=>e.v===vista);
  return idx<0?CHANGELOG.length:idx;
}

export {APP_VERSION, CHANGELOG, ICONO, ETIQUETA, COLOR,
        versionVista, marcarChangelogVisto, hayNovedades, novedadesDesdeUltimaVista};
