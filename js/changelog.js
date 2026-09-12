// changelog.js — Historial de versiones de la aplicación
//
// Este módulo es la FUENTE ÚNICA de la versión: el badge del encabezado se
// rellena desde aquí al arrancar, así que al publicar una versión nueva solo
// hay que tocar este archivo (y el `?v=` del importmap en index.html, que es
// cache-busting del navegador y no puede leerse desde JS).
//
// Módulo puro: sin imports, para que cualquiera pueda leer APP_VERSION sin
// arrastrar dependencias ni arriesgar ciclos.

const APP_VERSION='v2026.09.12-2255';

// Historial, de la más reciente a la más antigua.
//   tipo: 'nuevo' | 'arreglo' | 'cambio'
// Cada entrada describe QUÉ cambia para quien usa el sistema, no qué función se
// tocó: esto lo lee un contador, no quien programa.
const CHANGELOG=[
  {version:'V2.16.7',fecha:'12-09-2026',titulo:'Sistema productivo por defecto y alertas administrativas',items:[
    {tipo:'cambio',txt:'Todas las empresas y ejercicios operan directamente en PRODUCCIÓN, sin habilitaciones por sesión ni bloqueos de preproducción.'},
    {tipo:'seguridad',txt:'Auditoría de Integridad, alertas técnicas y Registro de Actividad quedan visibles y accesibles sólo para administradores.'},
    {tipo:'cambio',txt:'Los contadores operan normalmente en las empresas asignadas, manteniendo validaciones contables, cierres, ACL y persistencia segura.'}
  ]},
  {version:'V2.16.6',fecha:'12-09-2026',titulo:'Inicio de producción condicional',items:[
    {tipo:'nuevo',txt:'Un administrador puede habilitar PRODUCCIÓN aunque existan controles o confirmaciones pendientes, usando una frase de autorización reforzada.'},
    {tipo:'seguridad',txt:'El acta identifica la habilitación como condicional y conserva el detalle de todos los controles pendientes con huella SHA-256.'},
    {tipo:'cambio',txt:'Las validaciones contables, cierres, control de concurrencia y protecciones de persistencia continúan obligatorias durante la fase productiva.'}
  ]},
  {version:'V2.16.5.1',fecha:'12-09-2026',titulo:'Certificación coherente entre PC y móvil',items:[
    {tipo:'arreglo',txt:'La verificación de concurrencia recarga y fusiona la certificación vigente antes de guardarla, evitando el aviso genérico de persistencia cuando otro equipo ya aprobó la prueba.'},
    {tipo:'cambio',txt:'Los errores de certificación ahora informan su causa real y la aprobación sólo se confirma cuando queda guardada en Firebase.'}
  ]},
  {version:'V2.15.9.5',fecha:'11-09-2026',titulo:'Navegación móvil segura con botón Atrás',items:[
    {tipo:'arreglo',txt:'En Android/PWA, el primer Atrás desde Inicio ya no cierra la aplicación: sólo muestra un aviso y mantiene la sesión activa.'},
    {tipo:'cambio',txt:'Sólo un segundo Atrás dentro de 2,2 segundos se interpreta como intención de salir; desde módulos, formularios o modales Atrás vuelve/cierra la capa correspondiente.'},
    {tipo:'seguridad',txt:'Salir mediante navegación nunca ejecuta signOut(); el login obligatorio sólo se aplica cuando la app realmente se inicia como una nueva ejecución.'}
  ]},
  {version:'V2.15.9.3',fecha:'11-09-2026',titulo:'Login simplificado y documentación vigente',items:[
    {tipo:'cambio',txt:'Se elimina del login el recuadro informativo inferior de acceso restringido para dejar una pantalla de ingreso más limpia.'},
    {tipo:'nuevo',txt:'README reescrito completamente desde cero para documentar únicamente el funcionamiento actual del sistema, su arquitectura, módulos, seguridad, operación y puesta en marcha.'}
  ]},
  {version:'V2.15.9.2',fecha:'11-09-2026',titulo:'Autoguardado seguro y borradores locales',items:[
    {tipo:'arreglo',txt:'El temporizador ya no envía formularios incompletos a Firebase ni simula un Guardar mientras el usuario escribe.'},
    {tipo:'nuevo',txt:'Los campos editados se respaldan localmente como borrador por empresa y ejercicio y pueden recuperarse tras un cierre inesperado.'},
    {tipo:'seguridad',txt:'pagehide deja de iniciar escrituras Firestore asíncronas; al cerrar sólo se persiste el borrador local de forma síncrona.'},
    {tipo:'cambio',txt:'El indicador superior distingue Borrador sin confirmar, cambios confirmados pendientes y datos efectivamente guardados.'},
    {tipo:'arreglo',txt:'Datos de Empresa sólo limpia el borrador después de comprobar que storage respondió ok.'}
  ]},
  {version:'V2.15.9',fecha:'11-09-2026',titulo:'Puesta en marcha asistida y acta de habilitación',items:[
    {tipo:'nuevo',txt:'Panel final resume en una sola vista los requisitos pendientes antes de habilitar PRODUCCIÓN.'},
    {tipo:'auditoria',txt:'Al activar PRODUCCIÓN se genera un acta con empresa, ejercicio, versión, administrador, piloto certificado, checklist, controles técnicos y huella SHA-256.'},
    {tipo:'nuevo',txt:'El acta queda persistida dentro de la configuración del ejercicio, conserva historial de habilitaciones y puede descargarse como documento HTML.'},
    {tipo:'seguridad',txt:'Los snapshots de recuperación incluyen explícitamente preproducción y certificación piloto para preservar el estado de puesta en marcha.'}
  ]},
  {version:'V2.15.8',fecha:'11-09-2026',titulo:'Certificación mensual del piloto',items:[
    {tipo:'nuevo',txt:'Panel de certificación mensual compara RCV Ventas, RCV Compras y F29 contra referencias externas conocidas.'},
    {tipo:'seguridad',txt:'Activar PRODUCCIÓN exige al menos un período piloto certificado sin diferencias y con campos mínimos de control.'},
    {tipo:'auditoria',txt:'Guardar, certificar e invalidar un piloto deja trazabilidad por usuario, período y referencias comparadas.'}
  ]},
  {
    v:'v2026.09.11-1724',
    fecha:'2026-09-11',
    titulo:'V2.15.7 — Piloto controlado y entorno PRUEBA / PRODUCCIÓN',
    cambios:[
      {tipo:'nuevo', txt:'Cada empresa y ejercicio dispone de un modo operacional explícito PRUEBA o PRODUCCIÓN, visible permanentemente en la barra superior.'},
      {tipo:'nuevo', txt:'En PRUEBA las escrituras de negocio quedan bloqueadas al abrir una nueva sesión y sólo un administrador puede habilitarlas temporalmente escribiendo una confirmación explícita; al cerrar la app se vuelven a bloquear.'},
      {tipo:'nuevo', txt:'La activación de PRODUCCIÓN exige que Preparación Productiva esté completamente verde, seis confirmaciones de puesta en marcha y la frase ACTIVAR PRODUCCION.'},
      {tipo:'nuevo', txt:'Se incorpora checklist de empresa, PDC, apertura, RCV, usuarios/roles y respaldo externo, con certificación por administrador y auditoría de los cambios de estado.'},
      {tipo:'arreglo', txt:'Al cambiar de empresa o ejecutar migraciones técnicas de arranque, la guardia de entorno no bloquea tareas internas necesarias; la protección se activa una vez terminada la inicialización.'},
    ],
  },
  {
    v:'v2026.09.11-1718',
    fecha:'2026-09-11',
    titulo:'V2.15.6 — Regresión contable integral',
    cambios:[
      {tipo:'nuevo', txt:'Se incorpora una batería de regresión contable aislada en memoria que cubre ventas, compras, NC/ND, IVA recuperable/no recuperable, DTE 45/46, honorarios, pagos parciales, F29, activo fijo y remuneraciones.'},
      {tipo:'nuevo', txt:'La suite comprueba explícitamente que Diario, Mayor y Balance de comprobación produzcan los mismos totales y que la suma de saldos contables sea cero.'},
      {tipo:'arreglo', txt:'El escenario F29 verifica que una compra con fecha documental de agosto y período RCV septiembre se considere en septiembre sin alterar la fecha del DTE, y que el remanente declarado sea el que se arrastra legalmente.'},
      {tipo:'nuevo', txt:'Preparación Productiva incorpora la regresión integral como criterio bloqueante: una prueba fallida deja el semáforo en rojo y muestra el área y detalle del fallo.'},
      {tipo:'nuevo', txt:'Las pruebas restauran automáticamente el estado real al terminar; no crean documentos ni asientos productivos.'},
    ],
  },
  {
    v:'v2026.09.11-1707',
    fecha:'2026-09-11',
    titulo:'V2.15.5 — Puerta central de validación contable',
    cambios:[
      {tipo:'nuevo', txt:'Toda escritura del libro de asientos pasa por una puerta central antes de llegar a localStorage o Firebase, incluso si un módulo antiguo intenta escribir la clave directamente.'},
      {tipo:'arreglo', txt:'Se bloquean asientos descuadrados, cuentas inexistentes/inactivas o agrupadoras, líneas de monto cero, Debe/Haber simultáneo y referencias documentales inconsistentes.'},
      {tipo:'nuevo', txt:'El Plan de Cuentas permite marcar una cuenta con centro de costo obligatorio; la persistencia rechaza movimientos que omitan esa asignación o usen un centro inexistente.'},
      {tipo:'arreglo', txt:'Modificar, anular, eliminar o trasladar un asiento de un período mensual cerrado se rechaza desde el núcleo; la reapertura formal del asiento anual de cierre sigue permitida.'},
      {tipo:'nuevo', txt:'La validación se ejecuta también dentro de la transacción Firebase, después de una eventual fusión por concurrencia, para impedir que una mezcla de dos equipos produzca un asiento inválido.'},
      {tipo:'nuevo', txt:'Preparación Productiva incorpora una prueba automática que demuestra que la puerta central acepta un asiento válido y rechaza uno descuadrado/con cuenta inexistente.'},
    ],
  },
  {
    v:'v2026.09.11-1658',fecha:'2026-09-11',titulo:'V2.15.4 — Recuperación ante desastre',
    cambios:[{tipo:'nuevo',txt:'Snapshots productivos con manifiesto SHA-256, restauración administrativa y punto de retorno previo al rollback.'}],
  },
  {
    v:'v2026.09.11-1645',fecha:'2026-09-11',titulo:'V2.15.3 — Correlativo definitivo y auditoría',
    cambios:[{tipo:'nuevo',txt:'Número contable definitivo por transacción Firebase y auditoría estructurada antes/después para operaciones críticas.'}],
  },
  {
    v:'v2026.09.11-1635',
    fecha:'2026-09-11',
    titulo:'V2.15.2 — RCV idempotente y control de cambios',
    cambios:[
      {tipo:'arreglo', txt:'Reimportar exactamente el mismo RCV ya no reescribe documentos ni asientos: los registros con huella idéntica quedan como “Sin cambios”.'},
      {tipo:'nuevo', txt:'Compras y ventas comparan los datos económicos del RCV contra la versión contabilizada y muestran qué campos cambiaron antes de permitir una actualización.'},
      {tipo:'nuevo', txt:'Cada cambio RCV aceptado conserva snapshot anterior e historial de diferencias; documentos ya registrados dentro de asientos manuales quedan protegidos y no son modificados por el importador.'},
      {tipo:'arreglo', txt:'La conciliación completa de Compras sólo anula ausentes activos; repetir el mismo archivo no vuelve a anular ni cambia marcas de tiempo.'},
      {tipo:'arreglo', txt:'El importador de Ventas deja de forzar fechas al período seleccionado y respeta el bloqueo mensual según la fecha documental real.'},
      {tipo:'nuevo', txt:'El respaldo Excel conserva ahora el objeto completo de compras y ventas, incluyendo huellas, historial RCV, correlativos y metadata de trazabilidad.'},
      {tipo:'nuevo', txt:'Preparación Productiva incorpora pruebas automáticas de idempotencia y detección de cambios económicos del RCV.'},
    ],
  },
  {
    v:'v2026.09.11-1621',
    fecha:'2026-09-11',
    titulo:'V2.15.1 — Certificación operacional',
    cambios:[
      {tipo:'nuevo', txt:'Protocolo guiado de concurrencia Firebase con dos equipos: ambos escriben desde la misma revisión y la prueba sólo aprueba si sobreviven las dos marcas sin pérdida.'},
      {tipo:'nuevo', txt:'Simulacro seguro de restauración: genera el Excel completo, lo serializa y vuelve a leer en memoria verificando hojas, conteos y metadata de asientos sin tocar la base real.'},
      {tipo:'nuevo', txt:'Los resultados aprobados quedan certificados por empresa y año y alimentan el semáforo de Preparación Productiva.'},
      {tipo:'cambio', txt:'El sistema sólo marca LISTO PARA PRODUCTIVO cuando, además de los controles automáticos, ya fueron aprobadas la prueba real de concurrencia y la restauración simulada.'},
    ],
  },
  {
    v:'v2026.09.11-1614',
    fecha:'2026-09-11',
    titulo:'V2.15 — Hardening Productivo',
    cambios:[
      {tipo:'nuevo', txt:'Cierre contable mensual con reapertura formal: bloquea movimientos por fecha de contabilización; las compras RCV respetan periodoContable sin alterar la fecha original del DTE.'},
      {tipo:'nuevo', txt:'Panel de Preparación Productiva con semáforo de integridad, persistencia, folios, pruebas automáticas y controles operacionales aún pendientes.'},
      {tipo:'nuevo', txt:'Suite automática mínima del motor para venta afecta, compra mixta, RCV fuera de mes, DTE 46 y nota de crédito.'},
      {tipo:'arreglo', txt:'El respaldo Excel conserva el objeto completo de cada asiento —incluyendo tipo, fuente, docId, f29Detalle y trazabilidad— y también los cierres contables mensuales.'},
      {tipo:'arreglo', txt:'El Registro de Actividad mantiene reglas Firestore inmutables y ahora registra empresa y detalles estructurados cuando están disponibles.'},
      {tipo:'cambio', txt:'La app no se declara lista para producción mientras sigan pendientes la prueba real de concurrencia en dos equipos y un simulacro de restauración.'},
    ],
  },
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
