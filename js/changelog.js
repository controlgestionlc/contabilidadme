// changelog.js — Historial de versiones de la aplicación
//
// Este módulo es la FUENTE ÚNICA de la versión: el badge del encabezado se
// rellena desde aquí al arrancar. Al publicar una versión nueva también deben
// sincronizarse version.json, las etiquetas de index.html, su import map y la
// caché de sw.js, porque el cache-busting del navegador no puede leerse desde JS.
//
// Módulo puro: sin imports, para que cualquiera pueda leer APP_VERSION sin
// arrastrar dependencias ni arriesgar ciclos.

const APP_VERSION='v2026.10.29-1200';

// Historial, de la más reciente a la más antigua.
//   tipo: 'nuevo' | 'arreglo' | 'cambio'
// Cada entrada describe QUÉ cambia para quien usa el sistema, no qué función se
// tocó: esto lo lee un contador, no quien programa.
const CHANGELOG=[
  {version:'V2.22.4',fecha:'29-10-2026',titulo:'Comprobantes: un solo buscador, arriba',items:[
    {tipo:'cambio',txt:'Se quitó el buscador del encabezado de Comprobantes. Queda un único buscador (N°, monto o texto, con rango de fechas y origen) en la parte superior, sobre el formulario de asiento; sus resultados aparecen ahí mismo.'},
    {tipo:'cambio',txt:'Sin búsqueda no se muestra ningún panel: el formulario queda justo debajo del buscador. El botón "Nuevo honorario" pasa a la misma fila del buscador.'},
  ]},
  {version:'V2.22.3',fecha:'29-10-2026',titulo:'Comprobantes: buscador dinámico y rango de fechas',items:[
    {tipo:'nuevo',txt:'Comprobantes tiene un buscador único por N° de comprobante, monto o texto (glosa, cuenta, descripción o razón social). Filtra mientras se escribe, admite varias palabras ("pago 128500") y no distingue tildes ni mayúsculas.'},
    {tipo:'nuevo',txt:'Filtro por rango de fechas (Desde / Hasta), combinable con el buscador y el origen.'},
    {tipo:'cambio',txt:'La lista de comprobantes queda vacía hasta que se ingresa algún valor en el buscador o en las fechas; ya no se muestran los últimos comprobantes por defecto.'},
    {tipo:'correccion',txt:'Importador RCV paso 2: el buscador de documentos ya no pierde el foco al escribir; se puede tipear seguido sin volver a hacer clic.'},
  ]},
  {version:'V2.22.2',fecha:'28-10-2026',titulo:'Menú lateral reordenado',items:[
    {tipo:'cambio',txt:'Nuevo orden del menú: Registros (Importador RCV, Libro de Ventas, Libro de Compras, Honorarios, Pagos y Cobros, Comprobantes, Asignar Centros de Costo), Mantenedores (Proveedores, Clientes y Auxiliares), Inventario, Remuneraciones, Reportes, Tributario SII, Activo Fijo, Cierre de Ejercicio y Configuración.'},
    {tipo:'cambio',txt:'Los asientos tipo siguen dentro de Comprobantes. Asignar Centros de Costo pasa de Configuración a Registros y Remuneraciones tiene su propio grupo.'},
  ]},
  {version:'V2.22.1',fecha:'28-10-2026',titulo:'Inventario: crear productos desde Movimientos',items:[
    {tipo:'nuevo',txt:'En los movimientos de entrada y en la entrada desde compra hay un botón "🆕 Crear producto" que abre la ficha del producto en una ventana flotante, sin cerrar el movimiento. Al guardarlo queda elegido en la primera línea vacía (o en una línea nueva) y lo ya escrito se mantiene.'},
  ]},
  {version:'V2.22.0',fecha:'28-10-2026',titulo:'Inventario: entrada desde documento de compra',items:[
    {tipo:'nuevo',txt:'En Inventario → Movimientos, el botón "📄 Entrada desde compra" lista las facturas del libro de compras que aún no se cargaron al inventario y trae sus datos: proveedor, RUT, tipo y N° de documento, fecha, neto, exento, IVA y total.'},
    {tipo:'nuevo',txt:'Los productos se agregan línea por línea con cantidad, valor unitario neto y descuento; el neto de cada línea, el IVA y el total se calculan solos. El botón "⚖️ Cuadrar con la última línea" calcula el unitario que falta.'},
    {tipo:'nuevo',txt:'Cuadratura antes de guardar: la suma de los netos de las líneas debe ser igual al neto total del documento (neto + exento). La factura se carga de una vez y queda ligada a la entrada, así que no vuelve a aparecer en la lista; para corregirla se anula la entrada y se carga de nuevo.'},
  ]},
  {version:'V2.21.99',fecha:'28-10-2026',titulo:'Resumen de la empresa',items:[
    {tipo:'nuevo',txt:'Nuevo "Resumen de la empresa" que se abre al elegir una empresa en Inicio: ingresos, gastos, margen, disponible en caja y bancos, impuestos del F29 y resultado del ejercicio del mes elegido, con la variación contra el mes anterior.'},
    {tipo:'nuevo',txt:'Gráficos de línea de ventas y compras mensuales y de ingresos, gastos y resultado acumulado; documentos del mes por tipo; consulta de saldo mensual de cualquier cuenta (neto o acumulado); gastos por cuenta y observaciones a revisar (asientos descuadrados, saldos contrarios en caja, bancos, clientes o proveedores, gastos sin centro de costo y F29 sin guardar).'},
    {tipo:'cambio',txt:'El selector de empresas de Inicio se mantiene igual. El resumen también queda en el menú bajo Inicio y es un permiso más en Perfiles.'},
  ]},
  {version:'V2.21.98',fecha:'28-10-2026',titulo:'Se retira el XML IECV',items:[
    {tipo:'cambio',txt:'Se elimina el generador del XML de compras y ventas (IECV), que ya no se usa. Los Libros mensuales de Compra y Venta siguen igual.'},
  ]},
  {version:'V2.21.97',fecha:'28-10-2026',titulo:'F29 de enero: remanentes iniciales separados',items:[
    {tipo:'nuevo',txt:'En el F29 de enero, si no está el F29 de diciembre en el sistema, hay un campo propio para el remanente de anticipo cambio de sujeto (cód. 573 de diciembre), separado del remanente de crédito fiscal (cód. 77). Se reajusta por UTM y pasa como cód. 557.'},
    {tipo:'arreglo',txt:'El IVA de boletas (111) y de comprobantes de pago electrónico (759) ingresado a mano ahora suma su neto a la base del PPM (563). La base del PPM también se puede ingresar a mano.'},
    {tipo:'arreglo',txt:'La línea "Cálculo SII" del reajuste del remanente se muestra en su lugar, bajo el código 504.'},
  ]},
  {version:'V2.21.96',fecha:'28-10-2026',titulo:'F29: reajuste UTM del anticipo cambio de sujeto',items:[
    {tipo:'arreglo',txt:'El remanente de anticipo cambio de sujeto (cód. 573) pasa al mes siguiente como cód. 557 reajustado por UTM, igual que el remanente de IVA y como lo calcula el SII (monto ÷ UTM del mes de origen, redondeado a 2 decimales, × UTM del mes de imputación). Cotejado con dic-2025 → ene-2026: 3.703 → 3.481.'},
  ]},
  {version:'V2.21.95',fecha:'28-10-2026',titulo:'F29: arrastre de diciembre a enero',items:[
    {tipo:'arreglo',txt:'El remanente de anticipo cambio de sujeto (cód. 573) del F29 de diciembre del año anterior se toma como cód. 557 de enero aunque ese F29 esté en borrador: se usa el valor a mano o se reconstruye con sus datos de anticipo.'},
    {tipo:'cambio',txt:'En enero, el campo del cód. 557 indica si viene del F29 de diciembre o si hay que ingresarlo. Cotejado con los F29 reales de diciembre 2025 y enero 2026: el reajuste del remanente (504) calza exacto.'},
  ]},
  {version:'V2.21.94',fecha:'28-10-2026',titulo:'F29: códigos editables a mano',items:[
    {tipo:'nuevo',txt:'En el F29 del mes los códigos 110, 111 (boletas), 758, 759 (comprobantes de pago electrónico), 543 (total anticipo) y 573 (remanente de anticipo) se pueden escribir a mano. El débito, el IVA a pagar o remanente, el anticipo imputado y el total se recalculan con esos valores.'},
    {tipo:'cambio',txt:'Los valores ingresados a mano se marcan con ✎ y se guardan con el F29 del mes. Al borrar el campo se vuelve al cálculo desde los documentos. El 573 ingresado a mano pasa como 557 al mes siguiente.'},
  ]},
  {version:'V2.21.93',fecha:'28-10-2026',titulo:'F29: anticipo cambio de sujeto y códigos de totales',items:[
    {tipo:'nuevo',txt:'Anticipo cambio de sujeto calculado: 556 IVA anticipado del período (se ingresa), 557 remanente del mes anterior (se toma del 573 del mes anterior o se ingresa), 558 devolución, 543 total de anticipo, 598 anticipo a imputar (con tope del IVA a pagar) y 573 remanente para el mes siguiente.'},
    {tipo:'nuevo',txt:'Nuevos códigos 511 (crédito IVA por documentos electrónicos), 115 (tasa PPM), 595 (sub total impuesto determinado anverso) y 547 (total determinado).'},
    {tipo:'cambio',txt:'El total a pagar (91) descuenta el anticipo imputado (598), y el pago del F29 propone el IVA neto de ese anticipo. Cotejado con un F29 real de enero 2026.'},
  ]},
  {version:'V2.21.92',fecha:'28-10-2026',titulo:'F29: nuevos códigos',items:[
    {tipo:'nuevo',txt:'El F29 muestra siempre los códigos 503/502 (facturas emitidas), 110/111 (cantidad y débito de boletas), 758/759 (comprobantes o recibos de pago con medios electrónicos), 519/520 (facturas recibidas del giro) y 584/562 (compras exentas o no gravadas), aunque estén en cero.'},
    {tipo:'nuevo',txt:'Nuevo tipo de documento de venta 48 "Comprobante de Pago Electrónico" para registrar los vouchers; alimenta los códigos 758 y 759.'},
    {tipo:'nuevo',txt:'Sección "Anticipo cambio de sujeto" con los códigos 543 (total de anticipo) y 573 (remanente para el período siguiente), que se ingresan en la declaración.'},
    {tipo:'cambio',txt:'La tabla Calculado/Declarado incluye todos esos códigos. Los F29 presentados antes de esta versión no muestran diferencias por los códigos nuevos.'},
  ]},
  {version:'V2.21.91',fecha:'28-10-2026',titulo:'Tasa PPM por empresa y por mes',items:[
    {tipo:'nuevo',txt:'La tasa PPM de Empresa → Configuración tributaria es la que usan por defecto los F29 de cada mes, y ahora se puede ajustar a mano en el F29 de un mes puntual (campo "Tasa PPM" junto a la UTM).'},
    {tipo:'cambio',txt:'Al guardar un F29 (borrador o presentado) la tasa PPM queda grabada en ese mes: si después cambias la tasa de la empresa, los PPM de los meses ya guardados no cambian. Los F29 guardados antes de esta versión quedan con la tasa que se deduce de lo declarado (cód. 62 ÷ cód. 563) o, si no se puede, con la tasa actual de la empresa.'},
    {tipo:'cambio',txt:'El resumen PPM muestra la tasa de cada mes, marcando las ajustadas a mano (✎) y las grabadas (🔒).'},
  ]},
  {version:'V2.21.90',fecha:'27-10-2026',titulo:'La cuenta 1104001 se llama Clientes',items:[
    {tipo:'cambio',txt:'La cuenta 1104001 "Facturas por Cobrar" pasa a llamarse "CLIENTES" en el plan de cuentas, en las plantillas de empresas nuevas y en Auxiliares. Las empresas existentes se actualizan solas al abrirlas, salvo que el nombre se haya cambiado a mano.'},
    {tipo:'cambio',txt:'Los asientos antiguos que tenían copiado el nombre anterior se muestran con el nombre nuevo en Comprobantes, Libro Diario, Mayor y Balance.'},
  ]},
  {version:'V2.21.89',fecha:'25-10-2026',titulo:'Inicio obligatorio y cierre por inactividad',items:[
    {tipo:'cambio',txt:'Al iniciar sesión siempre se parte en Inicio, donde se elige la empresa. Al hacer clic en una empresa se abre directamente Comprobantes (si el usuario tiene acceso a ese módulo).'},
    {tipo:'nuevo',txt:'La sesión se cierra sola tras 30 minutos sin actividad. Un minuto antes aparece un aviso con cuenta regresiva y el botón "Seguir trabajando". Antes de cerrar se intenta guardar lo pendiente, y al volver el login explica por qué se cerró.'},
  ]},
  {version:'V2.21.88',fecha:'25-10-2026',titulo:'Usuarios: Administrador, Senior y Contador, con perfiles',items:[
    {tipo:'nuevo',txt:'Nuevo tipo de usuario Senior: crea sus propias empresas y autoriza a usuarios Contador a trabajar en ellas (Empresas → 👥). Ve sólo sus empresas y las que le asignen.'},
    {tipo:'cambio',txt:'El Contador trabaja sólo en las empresas que le asignen y ya no puede crear empresas. Si entra sin empresas asignadas, se le indica que las pida.'},
    {tipo:'nuevo',txt:'Nuevo módulo 🛡️ Perfiles (sólo administrador): define para Senior y Contador el acceso a cada módulo (Sin acceso, Lectura o Edición). Los permisos personalizados de un usuario siguen mandando sobre su perfil.'},
    {tipo:'cambio',txt:'El administrador tiene acceso total a todas las empresas, propias o de otros usuarios, y desde 👥 asigna el dueño (Senior) y los usuarios de cada empresa. Las empresas sin dueño sólo las ve el administrador.'},
    {tipo:'arreglo',txt:'Aprobar una cuenta pendiente ahora pide elegir su tipo de usuario; antes quedaba activa con el rol de sólo consulta con que se registró.'},
    {tipo:'cambio',txt:'Reglas de Firestore actualizadas: sólo Administrador y Senior crean empresas, el Senior puede listar a los Contadores y sólo el administrador guarda los perfiles. Hay que publicar el nuevo firestore.rules.'},
  ]},
  {version:'V2.21.87',fecha:'20-10-2026',titulo:'Plan de cuentas: encabezado fijo',items:[
    {tipo:'cambio',txt:'En el Plan de Cuentas, el encabezado, el formulario "Nueva Cuenta" y los títulos de la tabla quedan fijos al desplazarse, para crear cuentas mirando el listado sin perder el formulario.'},
  ]},
  {version:'V2.21.86',fecha:'20-10-2026',titulo:'Indicadores desde una copia diaria propia',items:[
    {tipo:'arreglo',txt:'mindicador.cl bloquea las consultas desde el navegador y la pasarela corsproxy ahora exige registro. Los indicadores (UF, UTM, dólar y euro) se leen ahora de una copia diaria que una acción de GitHub guarda en la rama "datos" del repositorio; si no está disponible, se intenta mindicador.cl directo y luego una pasarela pública, cada uno con tiempo límite.'},
    {tipo:'nuevo',txt:'En la tabla "UF al último día de cada mes" el botón "📥 Completar meses vacíos" rellena sólo los meses sin valor (y sin libro cerrado) con la UF del último día de cada mes. Lo ingresado a mano no se modifica.'}]},
  {version:'V2.21.85',fecha:'20-10-2026',titulo:'Indicadores: la consulta al Banco Central ya no se queda pegada',items:[
    {tipo:'arreglo',txt:'"Traer valores del Banco Central" quedaba en "Consultando…" porque mindicador.cl dejó de autorizar la lectura desde el navegador (CORS). Ahora cada consulta tiene un tiempo límite y, si la lectura directa se bloquea, se reintenta por pasarelas públicas. Si todo falla, el botón vuelve a quedar disponible y se indica dónde obtener los valores para ingresarlos a mano.'},
    {tipo:'arreglo',txt:'Lo mismo aplica a "Buscar meses nuevos" del histórico UTM.'}]},
  {version:'V2.21.84',fecha:'20-10-2026',titulo:'UF del último día del mes para remuneraciones',items:[
    {tipo:'nuevo',txt:'Indicadores tiene una tabla "UF al último día de cada mes" (meses por año) que se completa a mano, con el valor del último día de cada mes.'},
    {tipo:'mejora',txt:'Las liquidaciones y el libro de remuneraciones de un mes usan esa UF. Mientras falte, se usa la casilla "Valor UF" de Remuneraciones como valor provisorio; cuando existe, la casilla la muestra fija.'},
    {tipo:'mejora',txt:'Para cerrar el libro de remuneraciones de un mes es obligatorio tener su UF en la tabla; al cerrar, el libro se recalcula con ese valor. Un mes con libro cerrado no permite cambiar su UF hasta reabrirlo.'}]},
  {version:'V2.21.83',fecha:'20-10-2026',titulo:'Remuneraciones: un mes cerrado no admite cambios',items:[
    {tipo:'mejora',txt:'Cuando el libro de remuneraciones de un mes está cerrado, no se pueden agregar, editar ni eliminar eventos de asistencia (licencias, permisos, ausencias) que toquen ese mes, ni cambiar sus horas trabajadas. Al intentarlo aparece una alerta que indica el mes y cómo reabrirlo.'},
    {tipo:'mejora',txt:'La misma regla aplica a vacaciones con fechas en un mes cerrado, a anticipos descontados o eliminados en ese mes, al término de contrato que un finiquito lleva a la ficha y a los cambios de fecha de inicio o término en la ficha del trabajador.'},
    {tipo:'mejora',txt:'Para hacer cualquiera de esos cambios hay que reabrir el libro del mes en la pestaña "Libro" de Remuneraciones.'}]},
  {version:'V2.21.82',fecha:'19-10-2026',titulo:'RCV paso 2: glosa por defecto',items:[
    {tipo:'mejora',txt:'La descripción general del documento (glosa) parte con el mismo texto de la línea de proveedor o cliente: nombre del auxiliar · tipo de documento N° folio (por ejemplo "FERNANDO DRAKE SPA · Factura Electrónica N°1508"). Se puede cambiar antes de contabilizar.'},
    {tipo:'mejora',txt:'En los documentos contabilizados desde el paso 2 la glosa del asiento ya no repite el tipo y número de documento al final.'}]},
  {version:'V2.21.81',fecha:'19-10-2026',titulo:'Importador RCV: meses cargados y pendientes',items:[
    {tipo:'nuevo',txt:'Cada archivo RCV que se carga queda guardado por mes. Al entrar al Importador RCV se ve una tabla por Compras y por Ventas con los meses cargados del ejercicio: archivo, fecha de carga, documentos, cuántos están en el libro y cuántos faltan por contabilizar.'},
    {tipo:'nuevo',txt:'Tocar un mes abre directamente su paso 2 para continuar la contabilización donde quedó. Lo pendiente se calcula siempre contra el libro.'},
    {tipo:'mejora',txt:'Volver a cargar el archivo de un mes reemplaza la carga anterior de ese mes.'}]},
  {version:'V2.21.80',fecha:'19-10-2026',titulo:'Libros clicables e Importador RCV como módulo',items:[
    {tipo:'mejora',txt:'En el Libro de Compras y en el de Ventas, cada mes del Resumen Mensual se puede tocar y abre el libro de ese mes.'},
    {tipo:'mejora',txt:'En el cuadro "Por Cuenta de Gasto" del Libro de Compras cada cuenta se puede tocar y muestra los documentos que la tienen en su distribución; el filtro aparece como etiqueta junto al buscador y se quita con ✕ o con "Limpiar".'},
    {tipo:'nuevo',txt:'El importador del RCV es un módulo propio, "📥 Importador RCV", en el menú Registros bajo Libro de Compras: carga el archivo de compras o ventas, muestra cuántos documentos quedan por contabilizar y permite continuar el paso 2. El botón "Importar SII" de los libros lleva a este módulo.'}]},
  {version:'V2.21.79',fecha:'19-10-2026',titulo:'RCV paso 2: centro de costo en todas las líneas y casillas en blanco',items:[
    {tipo:'mejora',txt:'Las líneas de otros impuestos de costo permiten elegir su centro de costo. Por defecto siguen al de la línea de gasto hasta que se cambie a mano.'},
    {tipo:'mejora',txt:'Todas las casillas que se pueden editar (cuenta, descripción, centro de costo, tipo, montos, IVA, glosa y vencimiento) tienen fondo blanco; lo que se completa solo queda en gris.'}]},
  {version:'V2.21.78',fecha:'19-10-2026',titulo:'RCV paso 2: el asiento completo en una sola tabla',items:[
    {tipo:'mejora',txt:'El detalle del documento muestra en una sola tabla todo el asiento, con columnas Debe y Haber: las líneas de gasto, activo o ingreso (editables), los otros impuestos, el IVA, las retenciones y el proveedor o cliente, con los totales. Se quitó la tabla aparte "Asiento que se generará".'},
    {tipo:'mejora',txt:'Sólo se editan las líneas que lo requieren (cuenta, descripción y centro de costo del gasto, activo o ingreso) y el monto del IVA; el resto se completa solo.'},
    {tipo:'arreglo',txt:'La descripción de las líneas ya no muestra el código interno del centro de costo (por ejemplo "CC: cc_mu187…"); el centro de costo se ve en su columna con su nombre.'}]},
  {version:'V2.21.77',fecha:'19-10-2026',titulo:'RCV paso 2: líneas de impuestos automáticas',items:[
    {tipo:'mejora',txt:'Las líneas de impuestos y retenciones del asiento (IVA crédito y débito, IVA retenido, crédito de activo fijo, otros impuestos recuperables y retención de honorarios) se completan solas con el nombre de su cuenta como descripción. Los otros impuestos conservan la suya ("Otro impuesto cód. 28").'},
    {tipo:'mejora',txt:'En el detalle sólo se editan la descripción, la cuenta y el centro de costo de las líneas de gasto o activo (compras) y de ingreso (ventas). Las líneas de otros impuestos quedan fijas: su cuenta sigue a la primera línea de gasto, o va a 1108006 si se marcan como recuperables.'}]},
  {version:'V2.21.76',fecha:'19-10-2026',titulo:'RCV: nuevo paso 2 con lista del registro y editor del asiento',items:[
    {tipo:'nuevo',txt:'Al cargar el RCV de compras o ventas se abre el paso 2: a la izquierda todo el registro leído del SII (proveedor o cliente, folio, fecha y monto), con filtros "Por contabilizar", "En el libro" y "Todos" y un buscador.'},
    {tipo:'nuevo',txt:'Al elegir un documento se activa "⬇ Importar" (arriba a la derecha), que abre a la derecha el editor del asiento: glosa, líneas con cuenta y centro de costo, IVA y la vista del asiento completo. "📒 Contabilizar documento" genera el asiento sólo de ese documento y lo lleva al libro.'},
    {tipo:'nuevo',txt:'Si el proveedor o cliente no tiene ficha, primero se crea (razón social, datos de contacto, cuenta y centro de costo por defecto) y recién después se edita el asiento.'},
    {tipo:'mejora',txt:'La cuenta y el centro de costo del documento parten de la ficha del auxiliar, y los que se usen al contabilizar quedan como los nuevos por defecto de esa ficha.'},
    {tipo:'mejora',txt:'La vista tabla con asignación masiva sigue disponible con el botón "▦ Vista tabla".'}]},
  {version:'V2.21.75',fecha:'19-10-2026',titulo:'RCV paso 2: se ve el asiento completo y el IVA se puede corregir',items:[
    {tipo:'mejora',txt:'En el paso 2 de compras y ventas aparece el "Asiento que se generará" con todas sus líneas: gasto o ingreso, otros impuestos, IVA crédito o débito y proveedor o cliente, con totales.'},
    {tipo:'mejora',txt:'El monto del IVA se edita en su propia línea del asiento. Por defecto toma el IVA del RCV, así una diferencia de $1 por redondeo del emisor cuadra sin marcar la casilla. Se acepta hasta $1 de diferencia con el 19% de las líneas afectas.'},
    {tipo:'mejora',txt:'Si el IVA corregido es distinto del RCV, se avisa y el documento queda con el IVA corregido (es el que toma el F29); "Volver a la distribución por defecto" restaura el del RCV.'}]},
  {version:'V2.21.74',fecha:'19-10-2026',titulo:'Balance de apertura: documentos por cuenta con auxiliar',items:[
    {tipo:'nuevo',txt:'En el ingreso manual del Balance de Apertura, las cuentas de clientes, proveedores y honorarios por pagar permiten detallar el saldo por documento: auxiliar (con buscador por RUT o nombre), tipo de documento según el auxiliar, N°, emisión, vencimiento y monto, con "+ Agregar documento" para varios por cuenta.'},
    {tipo:'mejora',txt:'Con documentos, el saldo de la línea es la suma de ellos (las notas de crédito restan) y al guardar se registra un movimiento por auxiliar. Los documentos quedan en el Detalle de auxiliares de la apertura, así el auxiliar y el aging arrancan con cada factura pendiente.'},
    {tipo:'arreglo',txt:'Editar el Balance de Apertura ya no borra el detalle de auxiliares capturado ni el folio del comprobante.'},
    {tipo:'arreglo',txt:'La lista "Documento" del Detalle de auxiliares venía vacía: ahora muestra los tipos de documento.'},
    {tipo:'mejora',txt:'Las columnas Debe y Haber del formulario de apertura quedan alineadas con su encabezado y muestran separador de miles.'}]},
  {version:'V2.21.73',fecha:'19-10-2026',titulo:'Formulario 29: resumen anual y detalle por mes',items:[
    {tipo:'mejora',txt:'Tributario SII → Formulario 29 abre ahora el resumen del año: débito, crédito, remanentes, IVA a pagar, PPM, retenciones, impuesto único, total y estado de cada mes, con totales.'},
    {tipo:'mejora',txt:'Al hacer clic en el nombre de un mes se abre su detalle de siempre (códigos, declaración, conciliación, compensación de IVA y pago), con "← Formulario 29" para volver y accesos a los demás meses. Los cálculos no cambian.'},
    {tipo:'mejora',txt:'Las casillas de montos del F29 (declarado, UTM, remanente inicial, compensación y pago) muestran separador de miles y no aceptan decimales.'}]},
  {version:'V2.21.72',fecha:'18-10-2026',titulo:'Exportar Excel funciona con asientos muy grandes',items:[
    {tipo:'arreglo',txt:'"Exportar Excel" fallaba con "Text length must not exceed 32767 characters" cuando un asiento o documento tenía demasiadas líneas para una sola celda de Excel. Ahora ese contenido se reparte en columnas extra y se vuelve a unir al importar. Los respaldos anteriores se siguen importando igual.'}]},
  {version:'V2.21.71',fecha:'16-10-2026',titulo:'Acceso directo al contrato desde la lista de trabajadores',items:[
    {tipo:'mejora',txt:'Cada trabajador de la lista de Remuneraciones tiene el botón "📑 Contrato", que abre su contrato de trabajo (ver, ✏️ Editar contrato, imprimir, PDF, Word). Antes sólo se llegaba desde la pestaña Contratos.'}]},
  {version:'V2.21.70',fecha:'16-10-2026',titulo:'Editor visual del contrato',items:[
    {tipo:'nuevo',txt:'"✏️ Editar contrato" abre el contrato editable directo en el sistema: se escribe sobre el documento y cada dato automático (nombre, RUT, sueldo, jornada, etc.) se ve con su valor real, destacado en azul y bloqueado; no se puede borrar ni editar (se cambia en la ficha o en los datos del contrato). Los datos que faltan se ven en amarillo. "➕ Insertar dato automático" agrega cualquier dato donde está el cursor.'},
    {tipo:'nuevo',txt:'Dos formas de guardar: "💾 Guardar este contrato" (sólo para ese trabajador) o "💾 Guardar y dejar como plantilla del cargo": actualiza la plantilla asociada a su cargo o crea "Contrato · <cargo>", que se usará para los próximos trabajadores con ese cargo.'}]},
  {version:'V2.21.69',fecha:'16-10-2026',titulo:'Representante legal en los datos del contrato',items:[
    {tipo:'mejora',txt:'La ventana de datos del contrato pide el representante legal del empleador y su RUT (con validación del dígito verificador). Son datos de la empresa: se prellenan desde Configuración → Empresa y, si se cambian aquí, se actualizan allá y en todos los contratos y finiquitos.'}]},
  {version:'V2.21.68',fecha:'16-10-2026',titulo:'Plantillas de contrato: editar en Word y volver a subir',items:[
    {tipo:'nuevo',txt:'Cada plantilla de contrato tiene "⬇️ Word" (descarga un .docx con los {{marcadores}} resaltados en amarillo) y "📤 Subir Word" (carga el Word editado sobre esa plantilla). El texto queda en el editor para revisarlo y guardarlo.'},
    {tipo:'nuevo',txt:'Validación de marcadores al subir y al guardar: bloquea marcadores mal escritos (con sugerencia, por ejemplo {{afps}} → {{afp}}) y llaves sueltas o incompletas; avisa si faltan los marcadores de datos esenciales del contrato (Art. 10 del Código del Trabajo) o si se quitaron marcadores que tenía la plantilla. Botón "✔ Validar marcadores" en el editor.'},
    {tipo:'mejora',txt:'El contrato de cada trabajador se descarga en Word como .docx real (antes .doc), con las firmas en tabla y los datos faltantes resaltados.'}]},
  {version:'V2.21.67',fecha:'16-10-2026',titulo:'Contrato de trabajo con plantillas por cargo',items:[
    {tipo:'nuevo',txt:'Remuneraciones → Contratos: botón "📄 Contrato" en cada trabajador. Genera el contrato de trabajo con la plantilla de su cargo (o la de su tipo de contrato), llenando los datos de la ficha y del registro DT: partes, nacionalidad, domicilio, funciones, lugar, jornada y horario, sueldo en palabras, gratificación, colación y movilización, día y forma de pago, AFP y salud, plazo. Se puede imprimir, descargar en PDF o en Word (para seguir editando) y ajustar el texto sólo para ese trabajador. Los datos vacíos se marcan en el documento.'},
    {tipo:'nuevo',txt:'Plantillas de contrato (📄 Plantillas de contrato): cuatro plantillas tipo editables (indefinido, plazo fijo, obra o faena y trabajador agrícola de temporada) y plantillas propias que cada contador crea escribiéndolas, duplicando una tipo o subiendo un .docx/.txt. Cada plantilla se asocia a los cargos que la usan y a un tipo de contrato; los marcadores {{campo}} se insertan con un clic.'},
    {tipo:'mejora',txt:'La ventana de datos del contrato DT tiene el botón "📄 Guardar y ver contrato". La pestaña "Contratos DT" pasa a llamarse "Contratos".'}]},
  {version:'V2.21.66',fecha:'16-10-2026',titulo:'CSV de contrato DT desde la ficha del trabajador',items:[
    {tipo:'nuevo',txt:'La ficha del trabajador tiene el botón "📑 Guardar y generar CSV contrato DT": guarda la ficha y abre los datos del contrato. En esa ventana, "⬇️ Guardar y descargar CSV DT" descarga el archivo de ese trabajador para subirlo a Mi DT.'},
    {tipo:'correccion',txt:'Al editar la ficha de un trabajador ya no se pierden sus anticipos ni los datos del contrato DT (el formulario reemplazaba la ficha completa).'}]},
  {version:'V2.21.65',fecha:'16-10-2026',titulo:'Registro de contratos en la DT (CSV masivo o uno a uno)',items:[
    {tipo:'nuevo',txt:'Remuneraciones → pestaña "📑 Contratos DT": genera el CSV del Registro Masivo de Contratos de Trabajo de Mi DT (plantilla del instructivo DT: 100 columnas, separador punto y coma, fechas DD/MM/AAAA, RUT con guion, códigos DT de comuna, nacionalidad, AFP, salud, jornada, gratificación y haberes). Se puede descargar por trabajador o en forma masiva; si hay cargos distintos se genera un archivo por cargo, como exige la DT.'},
    {tipo:'nuevo',txt:'Cada trabajador muestra la fecha de firma, el plazo de registro (15 días hábiles, aproximado) y su estado: faltan datos (con el detalle), listo para informar o informado. Al descargar se ofrece marcar los contratos como informados.'},
    {tipo:'nuevo',txt:'Datos del contrato por trabajador (fecha de suscripción, nacimiento, nacionalidad, domicilio, funciones, jornada, horario propio, pago) y valores por defecto de la empresa (comuna de celebración y de prestación de servicios, jornada, horario semanal, colación, día y forma de pago). Sueldo, AFP, salud, sexo, inicio y tipo de contrato se toman de la ficha.'}]},
  {version:'V2.21.64',fecha:'16-10-2026',titulo:'Libro de Compras y Ventas: observaciones clicables',items:[
    {tipo:'nuevo',txt:'Las observaciones y errores del Libro de Compras y Ventas que apuntan a un documento son clicables: abren el documento en su formulario de edición, con un botón para volver al libro. Si el documento está dentro de un comprobante, se abre ese comprobante.'},
    {tipo:'nuevo',txt:'Notas de crédito o débito sin documento referenciado: la observación y la columna Referencia del detalle tienen el botón "🔗 Referenciar", que abre la nota con la lista de documentos del mismo proveedor o cliente lista para elegir.'},
    {tipo:'correccion',txt:'Se corrige el texto "observaciónes" por "observaciones".'}]},
  {version:'V2.21.63',fecha:'16-10-2026',titulo:'Anticipos de sueldo y ajustes a la liquidación',items:[
    {tipo:'nuevo',txt:'Anticipos de sueldo por trabajador (botón 💵 en la lista de Remuneraciones): fecha, monto, motivo y mes en que se descuenta. Opcionalmente contabiliza el pago (Debe 1106001 Anticipo de sueldo / Haber caja o banco). Al eliminar un anticipo su asiento de pago queda anulado. Los meses con libro cerrado no admiten cambios.'},
    {tipo:'nuevo',txt:'Los anticipos se descuentan en la liquidación bajo "Otros Descuentos" (con fecha y motivo), en el libro de remuneraciones, en el LRE (códigos 3188 y 5302) y en el asiento de remuneraciones, que abona 1106001 por lo descontado.'},
    {tipo:'mejora',txt:'Liquidación: se quita el salario mínimo, los días trabajados pasan al recuadro del trabajador (bajo la fecha de incorporación) y el líquido en palabras termina en punto.'}]},
  {version:'V2.21.62',fecha:'16-10-2026',titulo:'Paso 2 del RCV: cruce de otros impuestos',items:[
    {tipo:'nuevo',txt:'En el paso 2 de compras, cada otro impuesto del RCV (por ejemplo, impuesto específico cód. 28) aparece como una línea propia de tipo "Otro impuesto", con su cuenta, descripción y centro de costo. Si se asigna a 1108006 queda como recuperable; en cualquier otra cuenta, como costo o gasto en esa cuenta.'},
    {tipo:'mejora',txt:'El control del paso 2 agrega la fila "Otros impuestos": las líneas de otro impuesto deben sumar lo informado por el RCV, y el total se valida con ese monto. No se puede guardar si falta la línea o si el monto no coincide.'},
    {tipo:'mejora',txt:'La línea de otro impuesto no obliga a escribir descripción en la línea de base; la descripción sigue siendo obligatoria cuando hay varias líneas de base.'}]},
  {version:'V2.21.61',fecha:'16-10-2026',titulo:'La lista de cuentas ya no queda oculta',items:[
    {tipo:'correccion',txt:'Al escribir en un campo de cuenta, la lista de sugerencias quedaba cortada bajo el cuadro siguiente (por ejemplo, en el Paso 2 del importador RCV). Ahora se muestra siempre encima de todo y, si abajo no hay espacio, se abre hacia arriba. Aplica a todos los buscadores de cuenta.'}]},
  {version:'V2.21.60',fecha:'16-10-2026',titulo:'Estado y Detalle en la primera columna del importador',items:[
    {tipo:'mejora',txt:'En los importadores del RCV de compras y de ventas, la columna de estado (NUEVO, SIN CUENTA, etc.) con el botón ✏️ Detalle pasa a ser la primera columna, para verla sin desplazarse a la derecha.'}]},
  {version:'V2.21.59',fecha:'16-10-2026',titulo:'Compras de meses anteriores se contabilizan el día 1',items:[
    {tipo:'mejora',txt:'Los documentos del RCV emitidos en un mes anterior al del libro (por ejemplo, una factura del 31 de mayo que va en el libro de junio) se contabilizan el día 1 del mes del libro, en vez del último día. La fecha de emisión del documento no cambia.'},
    {tipo:'nuevo',txt:'En el Libro de Compras aparece un aviso con los documentos ya contabilizados con la regla anterior y un botón para mover sus asientos al día 1 (sólo en períodos abiertos; cada asiento conserva su número).'}]},
  {version:'V2.21.58',fecha:'16-10-2026',titulo:'Ventanas dentro de la pantalla',items:[
    {tipo:'correccion',txt:'Las ventanas emergentes ya no crecen más que la pantalla: los botones (Aplicar, Paso 2, Cancelar) quedaban bajo la barra de tareas de Windows. Ahora la barra de botones queda fija abajo y, en los importadores RCV de compras, ventas y balance, sólo se desplaza la lista de documentos.'}]},
  {version:'V2.21.57',fecha:'16-10-2026',titulo:'Importador RCV: paso 2 documento por documento',items:[
    {tipo:'nuevo',txt:'Los importadores del RCV de compras y de ventas tienen un paso 2 ("📝 Paso 2: revisar documento por documento" o "✏️ Detalle" en cada fila). Cada documento se abre con los datos del RCV (tipo, folio, fecha de emisión y vencimiento, RUT, auxiliar, exento, neto, IVA, otros impuestos y total) y se distribuye en líneas con cuenta, descripción, monto neto, centro de costo y la marca afecto o exento, para casos como las facturas de seguros con prima afecta y exenta.'},
    {tipo:'nuevo',txt:'Validador que no permite guardar con diferencias: las líneas afectas deben sumar el neto, las exentas el exento, el IVA calculado (19% de las afectas) debe ser igual al IVA del RCV y líneas + IVA + otros impuestos deben dar el total. La descripción es obligatoria cuando hay más de una línea y el centro de costo cuando la cuenta lo exige. Una diferencia de $1 por redondeo del emisor sólo se acepta marcándola.'},
    {tipo:'mejora',txt:'El asiento lleva una línea por cada línea del documento, con su descripción y centro de costo. Las ventas ahora también pueden repartirse en varias cuentas de ingreso y centros de costo. Los documentos que no pasan por el paso 2 se contabilizan como antes, y las asignaciones rápidas del paso 1 no modifican los documentos ya revisados.'}]},
  {version:'V2.21.56',fecha:'15-10-2026',titulo:'Indicadores y Previsional más compactos',items:[
    {tipo:'mejora',txt:'Las pantallas de Indicadores y Previsional usan campos de ancho acotado en varias columnas y tablas al ancho de su contenido (histórico UTM, impuesto único, comisiones AFP, mutual, seguro de cesantía y reforma), sin tanto espacio en blanco. En pantallas angostas vuelven a dos columnas.'}]},
  {version:'V2.21.55',fecha:'15-10-2026',titulo:'Impresora del Libro de Remuneraciones',items:[
    {tipo:'correccion',txt:'El botón de impresora que está dentro del Libro de Remuneraciones (junto a "Validar LRE") también imprime en hoja carta horizontal ajustada al ancho, sin los parámetros del mes. Antes usaba la impresión común y la tabla se cortaba.'}]},
  {version:'V2.21.54',fecha:'15-10-2026',titulo:'Corrección urgente: inicio de sesión',items:[
    {tipo:'correccion',txt:'La versión V2.21.53 no terminaba de cargar (faltaba una referencia interna de la impresión de Remuneraciones) y el botón de iniciar sesión no respondía. Corregido.'}]},
  {version:'V2.21.53',fecha:'15-10-2026',titulo:'Impresión de Remuneraciones en horizontal',items:[
    {tipo:'mejora',txt:'El botón Imprimir de Remuneraciones imprime en hoja carta horizontal y ajusta el contenido al ancho de la hoja, así las tablas (por ejemplo, el Libro de Remuneraciones) salen completas. Sólo imprime la pestaña abierta, sin los parámetros del mes ni los botones, y no corta filas ni recuadros entre hojas. Una liquidación o un finiquito abiertos se imprimen con su propio formato vertical.'}]},
  {version:'V2.21.52',fecha:'15-10-2026',titulo:'Reajuste del remanente de crédito fiscal como el SII',items:[
    {tipo:'correccion',txt:'El remanente de crédito fiscal se reajusta como lo calcula el SII (art. 27 DL 825): se convierte a UTM con la UTM del mes en que se declaró el período anterior, se redondea a 2 decimales y se reconvierte con la UTM del mes en que se declara el período actual. Ejemplo: remanente diciembre 2024 de $176.181 ÷ UTM enero 2025 ($67.429) = 2,61 UTM × UTM febrero 2025 ($67.294) = $175.637 en el código 504 del F29 de enero 2025. Antes se usaban las UTM del mes de cada período y sin redondeo.'},
    {tipo:'mejora',txt:'El F29 y el asiento de compensación de IVA muestran el cálculo paso a paso (pesos ÷ UTM = UTM con 2 decimales × UTM = pesos).'}]},
  {version:'V2.21.51',fecha:'15-10-2026',titulo:'Ajustes de revisión normativa',items:[
    {tipo:'mejora',txt:'Finiquito: el texto de ayuda del descuento AFC aclara que el monto legal es el del certificado de AFC Chile, que incluye la rentabilidad de la cuenta; el estimado es referencial.'},
    {tipo:'mejora',txt:'Renta: las cuentas de mermas, pérdidas o destrucción de inventario se sugieren para revisión como posible gasto rechazado (Art. 21), salvo que tengan respaldo según la Circular N° 32 de 2020.'},
    {tipo:'correccion',txt:'La pantalla de inicio de sesión muestra la versión vigente desde el primer momento.'}]},
  {version:'V2.21.50',fecha:'15-10-2026',titulo:'Pago por institución en el libro en PDF',items:[
    {tipo:'nuevo',txt:'El PDF del Libro de Remuneraciones suma una hoja con el detalle a pagar por cada institución, como el resumen de Previred: un cuadro con cargo trabajador, cargo empleador, asignación familiar descontada y total por institución, y el detalle de conceptos de cada una (AFP, Seguro Social Previsional, salud, caja, AFC, mutual o ISL). Usa el mismo cálculo del archivo Previred y del detalle de imposiciones.'}]},
  {version:'V2.21.49',fecha:'15-10-2026',titulo:'Salud en la liquidación',items:[
    {tipo:'mejora',txt:'La liquidación muestra la salud con su porcentaje: "Salud Fonasa (7%)" o "Salud Isapre (7%)". En Isapre, la diferencia entre el valor del plan en UF y ese 7% aparece como "Adicional Isapre (plan UF x)".'}]},
  {version:'V2.21.48',fecha:'15-10-2026',titulo:'Liquidación simplificada y PDF de liquidaciones y libro',items:[
    {tipo:'mejora',txt:'Liquidación de sueldo: membrete con los datos de la empresa a la izquierda, AFP con el porcentaje que se descuenta al trabajador (sin el cuadro de aportaciones), días trabajados en vez de días no trabajados y el líquido a pagar en palabras. Se quitan los topes imponibles, la UF, la UTM, el SIS y el adicional AFP del empleador.'},
    {tipo:'nuevo',txt:'Botón "PDF liquidaciones (masivo)" en Remuneraciones: descarga un PDF con la liquidación de cada trabajador del mes, una por hoja carta. Cada liquidación también tiene su botón PDF individual.'},
    {tipo:'nuevo',txt:'Botón "PDF" en el Libro de Remuneraciones: hoja carta horizontal con membrete, tabla por trabajador (el encabezado se repite en cada hoja), totales, resumen del mes, aportes del empleador y firma del representante legal.'}]},
  {version:'V2.21.47',fecha:'15-10-2026',titulo:'Asignación familiar, trabajo pesado y rentas mínimas',items:[
    {tipo:'nuevo',txt:'Asignación familiar: en la ficha del trabajador se registran cargas simples, maternales e inválidas (valen el doble). El tramo se calcula con el ingreso promedio del semestre anterior (libros cerrados) o, sin ellos, con la renta del mes; también se puede fijar a mano. Con menos de 25 días trabajados se paga proporcional (Art. 12 DFL 150). Aparece en la liquidación como haber no imponible, en el libro, en el LRE (códigos 1111 a 1114 y 2311) y en Previred (campos 18 a 22).'},
    {tipo:'nuevo',txt:'Trabajo pesado y menos pesado (Ley 19.404): 2% + 2% o 1% + 1% sobre la renta imponible. La parte del trabajador se descuenta en la liquidación y rebaja la base tributable; la del empleador suma al aporte patronal. Se informa en el LRE (3154 y 4154) y en Previred (campos 37 a 39, con 04,00 o 02,00).'},
    {tipo:'nuevo',txt:'Rentas mínimas: cada trabajador indica si le aplica la general, la de menores de 18 y mayores de 65 o la de casa particular. La lista de trabajadores avisa cuando el sueldo base queda bajo su renta mínima.'},
    {tipo:'mejora',txt:'En Indicadores se configuran los tramos y valores de la asignación familiar, las rentas mínimas especiales y las tasas de trabajo pesado (valores de Previred octubre 2026). El asiento de remuneraciones registra la asignación familiar rebajando las instituciones previsionales por pagar, y el detalle de imposiciones la descuenta de lo que se paga a la caja o al IPS.'}]},
  {version:'V2.21.46',fecha:'15-10-2026',titulo:'Indicadores revisados contra Previred (octubre 2026)',items:[
    {tipo:'correccion',txt:'Trabajadores en Fonasa con empresa afiliada a caja de compensación: el 7% de salud ahora se reparte 4,2% a la caja y 2,8% a Fonasa, como informa Previred (antes 6,45% y 0,55%). Aplica al archivo Previred y al detalle de imposiciones, y las tasas quedan editables en Previsional.'},
    {tipo:'mejora',txt:'Valores de referencia actualizados para empresas nuevas o sin indicadores guardados: UF al 31 de octubre de 2026 $41.247,63, UTM de octubre $72.151, UTA $865.812 e ingreso mínimo $553.553.'}]},
  {version:'V2.21.45',fecha:'14-10-2026',titulo:'Asiento contable del finiquito',items:[
    {tipo:'nuevo',txt:'Desde el documento del finiquito se genera su asiento: feriado a Vacaciones, indemnizaciones (sustitutiva y años de servicio) a Indemnizaciones, otros haberes a Finiquitos, descuento AFC rebajando el gasto en indemnizaciones, anticipos contra Anticipo de sueldo y el total a Remuneraciones por pagar. La remuneración del mes de término rebaja las remuneraciones por pagar del asiento mensual.'},
    {tipo:'nuevo',txt:'Si hay saldo en Provisión vacaciones o Provisión indemnización años de servicio, se propone usarla hasta su saldo y el resto va a gasto. Antes de contabilizar se ve el asiento completo y se puede cambiar la cuenta de cada concepto, la fecha y el centro de costo.'},
    {tipo:'mejora',txt:'Un solo asiento activo por finiquito: al regenerarlo, el anterior queda anulado con su número. Si el finiquito cambia después de contabilizarlo, se avisa. Un finiquito contabilizado no se puede eliminar hasta eliminar o anular su asiento en Comprobantes.'}]},
  {version:'V2.21.44',fecha:'14-10-2026',titulo:'Finiquitos con plantillas editables',items:[
    {tipo:'nuevo',txt:'Nueva pestaña Finiquitos en Remuneraciones. Calcula el feriado pendiente y proporcional (días hábiles convertidos a corridos, Art. 73), la indemnización sustitutiva del aviso previo y la indemnización por años de servicio (Arts. 161 a 163, tope 90 UF y 11 años), y descuenta el aporte del empleador al seguro de cesantía (Art. 13 Ley 19.728). Permite agregar la remuneración del mes de término, otros haberes y descuentos como anticipos o préstamos.'},
    {tipo:'nuevo',txt:'Plantillas tipo por causal (renuncia, mutuo acuerdo, vencimiento del plazo, conclusión de la obra, necesidades de la empresa, desahucio y genérica), todas editables y restaurables. Se pueden crear plantillas propias escribiéndolas o subiendo el texto en Word (.docx), .txt, .md o .html, con marcadores como {{trabajador}} o {{total}}. Cada finiquito también puede llevar su propio texto.'},
    {tipo:'nuevo',txt:'El documento incluye el total en palabras, la tabla de montos y las firmas del trabajador, del empleador y del ministro de fe. Al guardar, la fecha y causal de término quedan en la ficha del trabajador para el LRE y Previred.'}]},
  {version:'V2.21.43',fecha:'14-10-2026',titulo:'Nuevo formato de liquidación de sueldo',items:[
    {tipo:'mejora',txt:'La liquidación de remuneraciones usa el formato tradicional: encabezado con empleador, trabajador, ISAPRE y plan, topes imponibles, UF, UTM y cargas; cuadro de cotización AFP (trabajador, empresa y total); haberes imponibles y no imponibles junto a los descuentos legales; total a pagar.'},
    {tipo:'nuevo',txt:'Incluye la fecha, el texto de certificación "Certifico que he recibido…" y las líneas de firma "Recibí conforme" del trabajador y de la empresa. Se imprime en una hoja carta.'}]},
  {version:'V2.21.42',fecha:'14-10-2026',titulo:'Eliminar asientos automáticos y control de vacaciones',items:[
    {tipo:'nuevo',txt:'En Comprobantes, los asientos generados automáticamente (compensación y pago del F29, remuneraciones, depreciación, provisiones, cierres de costos y capitalizaciones) se pueden eliminar o anular a mano. El sistema revierte lo vinculado: un cierre de costos reabre el mes de los centros y una capitalización elimina el activo fijo creado y deja el centro otra vez como inversión en curso. Antes de confirmar se muestra qué se revertirá y las advertencias (por ejemplo, pagos F29 del mismo período).'},
    {tipo:'cambio',txt:'El cierre del ejercicio se sigue reabriendo desde Cierre de ejercicio (queda el motivo en la auditoría), y una capitalización con depreciación posterior pide eliminar primero esa depreciación. Los períodos contables cerrados siguen protegidos.'},
    {tipo:'nuevo',txt:'Remuneraciones → Vacaciones: saldo de feriado legal por trabajador en días hábiles (15 al año, 20 en zona extrema, devengados a 1,25 día por mes), días progresivos según el Art. 68 (hasta 10 años con empleadores anteriores y 1 día por cada 3 años nuevos con el empleador actual), saldo inicial a una fecha, aviso al superar 2 períodos acumulados y Excel de saldos.'},
    {tipo:'nuevo',txt:'Al registrar vacaciones se calculan los días hábiles descontando sábados, domingos y festivos (feriados nacionales calculados para cada año, más los que agregues, como elecciones). Las vacaciones quedan también en la Asistencia y se pagan normalmente.'},
  ]},
  {version:'V2.21.41',fecha:'13-10-2026',titulo:'Nombres como el formulario del Seguro Social Previsional',items:[
    {tipo:'cambio',txt:'La compensación por expectativa de vida se llama ahora "Seguro Social Previsional (expectativa de vida)", igual que en el formulario de cotizaciones de Previred, en la configuración, la liquidación interna, el Libro, su Excel y el detalle de imposiciones. En el detalle de imposiciones el Seguro Social Previsional se ordena como el formulario: expectativa de vida, rentabilidad protegida y SIS.'},
  ]},
  {version:'V2.21.40',fecha:'13-10-2026',titulo:'Seguro Social Previsional en el Libro de Remuneraciones',items:[
    {tipo:'nuevo',txt:'El Libro de Remuneraciones muestra por trabajador el grupo Seguro Social Previsional: SIS, expectativa de vida, rentabilidad protegida y total SSP, más un indicador con el total del mes. Antes de agosto 2026 el SIS se muestra pero no suma al SSP, porque se pagaba a la AFP.'},
    {tipo:'nuevo',txt:'El Excel del Libro agrega las columnas de la reforma (capitalización individual, expectativa de vida, rentabilidad protegida) y el total del Seguro Social Previsional. Los libros cerrados anteriores calculan el total SSP al abrirlos.'},
  ]},
  {version:'V2.21.39',fecha:'13-10-2026',titulo:'Reforma de pensiones (Ley 21.735)',items:[
    {tipo:'nuevo',txt:'Aporte del empleador de la reforma de pensiones: capitalización individual, compensación por expectativa de vida (CEV) y cotización con rentabilidad protegida (CRP), por tramos de vigencia editables en Indicadores. Desde agosto 2026: 0,1% + 0,72% + 0,9%; la CEV es automática (2,5% menos el SIS) salvo que se ingrese a mano.'},
    {tipo:'cambio',txt:'Sólo aplica a trabajadores activos afiliados a AFP; pensionados y mayores de 65 quedan sin SIS ni aportes de la reforma. Con licencia médica, la CEV y el SIS se calculan también sobre los días de licencia; capitalización y rentabilidad protegida, sólo sobre los días pagados.'},
    {tipo:'cambio',txt:'Archivo Previred: el 0,1% de capitalización se suma al campo 28 y se informan los campos 92 (renta de los días de licencia), 93 (tipo de jornada), 94 (CEV) y 95 (CRP). Detalle de imposiciones: desde agosto 2026 el SIS, la CEV y la CRP se pagan al Seguro Social Previsional.'},
    {tipo:'cambio',txt:'SIS por defecto actualizado a 1,78% (trimestre agosto-octubre 2026). Si la empresa tiene la configuración previsional guardada, el SIS se actualiza a mano en Indicadores.'},
  ]},
  {version:'V2.21.38',fecha:'13-10-2026',titulo:'Detalle del pago de imposiciones en Excel',items:[
    {tipo:'nuevo',txt:'En el Libro de Remuneraciones, el botón "Imposiciones" descarga un Excel con el detalle del pago del mes: resumen por institución (cada AFP, Fonasa o Isapre, caja de compensación, AFC y mutual o ISL) con sus conceptos, si son de cargo del trabajador o del empleador y cuántos trabajadores incluye, y una hoja con el detalle por trabajador. Los totales son fórmulas y cuadran con el archivo Previred.'},
  ]},
  {version:'V2.21.37',fecha:'13-10-2026',titulo:'Tasas editables de ISL, mutualidad y seguro de cesantía',items:[
    {tipo:'nuevo',txt:'Indicadores → Aporte del empleador: el seguro de accidentes del trabajo tiene tasas separadas para mutualidad e ISL (básica, adicional diferenciada, Ley SANNA y extraordinaria), todas editables. Se aplica la columna de la institución elegida.'},
    {tipo:'nuevo',txt:'Seguro de cesantía editable por tipo de contrato, con aporte del trabajador y del empleador: indefinido (0,6% + 2,4%), plazo fijo u obra o faena (0% + 3%) e indefinido con más de 11 años (0% + 0,8%). En la ficha del trabajador se agregó este último tipo de contrato.'},
    {tipo:'cambio',txt:'La Ley SANNA (0,03%) ahora se incluye por defecto en la cotización de accidentes del trabajo. Las configuraciones guardadas mantienen sus tasas; si la empresa usaba ISL, sus tasas pasan a la columna ISL.'},
  ]},
  {version:'V2.21.36',fecha:'13-10-2026',titulo:'Asiento de remuneraciones: sin duplicados aunque haya otro equipo',items:[
    {tipo:'correccion',txt:'Antes de generar el asiento de remuneraciones se lee el libro de asientos vigente desde la nube. Así se detectan los asientos que grabó otro equipo o una sesión anterior y el número asignado es el real de la secuencia.'},
    {tipo:'cambio',txt:'Regla central: no se acepta un segundo asiento de remuneraciones activo para el mismo mes, venga de donde venga. Los duplicados que ya existan no bloquean el resto de la contabilidad; se regularizan al volver a generar el mes.'},
    {tipo:'correccion',txt:'Cuando un asiento no se puede grabar por una regla contable, el mensaje muestra la regla que falló.'},
  ]},
  {version:'V2.21.35',fecha:'13-10-2026',titulo:'Asiento de remuneraciones: número correcto y uno por mes',items:[
    {tipo:'correccion',txt:'El aviso al generar el asiento de remuneraciones mostraba un número calculado en el equipo que podía coincidir con el de otro asiento (por ejemplo, una factura). Ahora muestra el número contable definitivo con que quedó grabado.'},
    {tipo:'cambio',txt:'Solo puede haber un asiento de remuneraciones activo por mes. Si ya existe, el sistema pregunta si reemplazarlo: el anterior queda anulado (conserva su número, sin efecto contable). Además se evita el doble clic.'},
    {tipo:'correccion',txt:'Si el asiento no se puede guardar, el mensaje ahora indica el motivo.'},
  ]},
  {version:'V2.21.34',fecha:'13-10-2026',titulo:'Liquidación solo con datos del trabajador',items:[
    {tipo:'cambio',txt:'La liquidación de sueldo (en pantalla e impresa) muestra solo haberes, descuentos y líquido del trabajador. El aporte del empleador y el costo total empresa ya no aparecen en ella: siguen disponibles en el resumen de Trabajadores, el Libro de Remuneraciones, el asiento contable y el archivo Previred.'},
  ]},
  {version:'V2.21.33',fecha:'13-10-2026',titulo:'Vista de la liquidación de sueldo',items:[
    {tipo:'correccion',txt:'La tabla de aporte del empleador ya no se sale de la tarjeta: ambas tablas ocupan el mismo ancho, los montos quedan alineados en una columna fija y los textos largos (nombres de instituciones) pasan a la línea siguiente, también en celular.'},
    {tipo:'correccion',txt:'El plan de Isapre se muestra con coma decimal (3,559 UF en vez de 3.559 UF).'},
  ]},
  {version:'V2.21.32',fecha:'13-10-2026',titulo:'Archivo de carga Previred',items:[
    {tipo:'nuevo',txt:'En el Libro de Remuneraciones, el botón "Archivo Previred" genera el archivo de carga masiva en el formato estándar de Previred (105 campos separados por punto y coma, ANSI, una línea por trabajador más líneas adicionales por cada movimiento de personal). Antes de generarlo valida RUT, nombres, sexo, códigos de AFP, salud, caja y mutual, y no descarga nada si hay errores.'},
    {tipo:'nuevo',txt:'Los movimientos de personal salen solos de la Asistencia y de las fechas de contrato: licencias (código 3, o 6 si es accidente del trabajo o enfermedad profesional, con la entidad que paga el subsidio), permisos sin goce (4), ausencias (11), contrataciones (1 o 7) y retiros (2).'},
    {tipo:'nuevo',txt:'La ficha del trabajador agrega apellido paterno, apellido materno, nombres, sexo, nacionalidad, tipo de trabajador y N° de FUN de Isapre, que Previred exige por separado.'},
    {tipo:'cambio',txt:'Durante una licencia médica, el SIS y el aporte del empleador al seguro de cesantía se calculan sobre la renta del mes completo, como exige Previred. Esto cambia el aporte patronal de la liquidación y del asiento en los meses con licencias.'},
  ]},
  {version:'V2.21.31',fecha:'13-10-2026',titulo:'Liquidación de sueldo en una hoja carta',items:[
    {tipo:'cambio',txt:'Al imprimir una liquidación se imprime solo la liquidación, en hoja carta vertical, y siempre cabe en una página: si el contenido es largo se reduce automáticamente.'},
    {tipo:'nuevo',txt:'La liquidación impresa incluye los datos de la empresa y líneas de firma del empleador y del trabajador (recibí conforme).'},
    {tipo:'correccion',txt:'El descuento de AFP ya no muestra el nombre duplicado ("AFP AFP Capital").'},
  ]},
  {version:'V2.21.30',fecha:'13-10-2026',titulo:'Asistencia, permisos y licencias en Remuneraciones',items:[
    {tipo:'nuevo',txt:'Nueva pestaña Asistencia: se registran licencias médicas (con su tipo y folio), permisos con y sin goce de sueldo, ausencias injustificadas y vacaciones, con fecha desde/hasta. Sin eventos, el trabajador tiene los 30 días pagados.'},
    {tipo:'nuevo',txt:'Las liquidaciones pagan solo los días pagados del mes (mes comercial de 30 días): sueldo base, gratificación, otros haberes, colación y movilización quedan proporcionales, igual que los topes imponibles. También se descuentan los días fuera de contrato si el trabajador ingresa o termina a mitad de mes.'},
    {tipo:'nuevo',txt:'Trabajadores por hora (jornada parcial): en la ficha se define el valor hora y las horas habituales; cada mes se pueden ajustar las horas en Asistencia.'},
    {tipo:'cambio',txt:'Los días trabajados, de licencia y de vacaciones del Libro de Remuneraciones y del CSV Mi DT ahora salen de la asistencia del mes, ya no de la ficha del trabajador.'},
  ]},
  {version:'V2.21.29',fecha:'05-10-2026',titulo:'Ajustes visuales del encabezado',items:[
    {tipo:'cambio',txt:'El estado de guardado, el botón Guardar y el usuario quedan alineados al borde derecho del encabezado.'},
    {tipo:'cambio',txt:'Se quitó el ícono que aparecía en la esquina superior derecha de la pantalla de Inicio.'},
  ]},
  {version:'V2.21.28',fecha:'02-10-2026',titulo:'Histórico UTM y remanente de crédito fiscal entre años',items:[
    {tipo:'nuevo',txt:'Indicadores incluye el histórico mensual de la UTM desde 2023, con los valores oficiales del SII. Los meses nuevos se traen solos desde mindicador.cl (que publica la serie del SII) y cualquier mes se puede corregir a mano.'},
    {tipo:'cambio',txt:'El F29 reajusta el remanente de crédito fiscal con la UTM real de cada mes (origen e imputación), también al rehacer un año anterior. Si en un F29 ingresas la UTM a mano, esa manda.'},
    {tipo:'nuevo',txt:'Enero recibe el remanente de diciembre del año anterior: se toma el código 77 del F29 de diciembre y, si no existe, se puede ingresar a mano en el F29 de enero.'},
    {tipo:'correccion',txt:'El asiento de compensación de IVA ahora propone la UTM del mes de origen y la del mes de imputación. Antes usaba la misma UTM para ambos y el reajuste quedaba en cero.'},
  ]},
  {version:'V2.21.27',fecha:'02-10-2026',titulo:'Planes de cuentas tipo por rubro',items:[
    {tipo:'nuevo',txt:'Al crear una empresa se puede elegir un plan de cuentas tipo según su rubro: General (agrícola y forestal), Comercio minorista, Banquetería y gastronomía, Contratistas, Transporte de carga o Inmobiliaria y arriendos.'},
    {tipo:'cambio',txt:'Todas las plantillas comparten las cuentas de bancos, clientes, proveedores, IVA, honorarios, remuneraciones, patrimonio e impuestos, así que ventas, compras y los asientos automáticos funcionan igual en cualquier rubro. Lo que cambia son las existencias, los costos y los ingresos propios de cada actividad.'},
    {tipo:'cambio',txt:'La plantilla se aplica una sola vez, al activar la empresa por primera vez. Las empresas que ya existen no cambian, y después de creado el plan se puede editar como siempre.'},
  ]},
  {version:'V2.21.26',fecha:'02-10-2026',titulo:'Inicio de sesión más liviano',items:[
    {tipo:'correccion',txt:'La sincronización al entrar a veces mostraba más registros de lo normal (por ejemplo 63 en vez de 30), con nombres "recovery-snap". Eran los puntos de recuperación automáticos, que se estaban releyendo en cada inicio de sesión. Ahora el cruce revisa solo los datos de la empresa.'},
    {tipo:'cambio',txt:'Los puntos de recuperación se guardan solo en la nube y ya no ocupan espacio en este equipo. Al abrir esta versión se liberan las copias que habían quedado guardadas. Verificar y restaurar funcionan igual que antes (requieren conexión, como siempre).'},
  ]},
  {version:'V2.21.25',fecha:'29-09-2026',titulo:'Barra superior más limpia',items:[
    {tipo:'cambio',txt:'Se quitó el distintivo verde "PRODUCCIÓN" que veían solo los administradores. El sistema opera siempre en producción, así que no aportaba información.'},
  ]},
  {version:'V2.21.24',fecha:'29-09-2026',titulo:'Tema Claro por defecto',items:[
    {tipo:'cambio',txt:'El tema predeterminado ahora es Claro. Al abrir esta versión, quien tenía el tema Oscuro pasa una sola vez a Claro; después se respeta la elección de cada equipo.'},
    {tipo:'cambio',txt:'Los temas se llaman Claro, Oscuro y Noche. Quien usaba los temas anteriores con otro nombre conserva el mismo aspecto.'},
  ]},
  {version:'V2.21.23',fecha:'29-09-2026',titulo:'Empresas eliminadas que volvían a aparecer',items:[
    {tipo:'correccion',txt:'Una empresa eliminada por su dueño podía volver a aparecer al entrar de nuevo, si había quedado una copia en el catálogo principal. Ahora el catálogo del dueño guarda una marca de eliminación que manda sobre cualquier copia, y cuando el administrador entra, esa copia se limpia sola.'},
    {tipo:'correccion',txt:'Si la nube rechaza el cambio del catálogo, la app ahora lo avisa y deja la empresa en el listado. Antes la borraba solo en este equipo, como si se hubiera guardado, y reaparecía al volver a entrar.'},
    {tipo:'cambio',txt:'Recuperar una empresa eliminada con su mismo identificador sigue funcionando: la marca de eliminación se retira.'},
  ]},
  {version:'V2.21.22',fecha:'29-09-2026',titulo:'Administrador: al entrar, solo sus empresas',items:[
    {tipo:'cambio',txt:'Al iniciar sesión, el administrador ve solo sus empresas, las compartidas con él y las heredadas, igual que cualquier usuario.'},
    {tipo:'nuevo',txt:'El botón "👁 Ver empresas de otros usuarios", en Inicio y en Empresas, muestra el resto del catálogo cuando hace falta. Vale solo para la sesión en curso.'},
    {tipo:'cambio',txt:'Si la última empresa abierta por el administrador era de otro usuario, al volver a entrar la app abre una propia.'},
  ]},
  {version:'V2.21.21',fecha:'29-09-2026',titulo:'Eliminar empresas y datos que no se usan',items:[
    {tipo:'nuevo',txt:'El dueño de una empresa (no solo el administrador) puede eliminarla con el botón 🗑 del listado, siempre que le quede al menos otra.'},
    {tipo:'cambio',txt:'Al eliminar una empresa eligiendo borrar también sus datos, ahora se borran en este navegador y en la nube. Antes la nube no se tocaba y los datos quedaban guardados sin uso.'},
    {tipo:'nuevo',txt:'En Empresas recuperables, el botón 🗑 Descartar borra definitivamente los datos de una empresa que ya no está en el listado y no se va a usar.'},
  ]},
  {version:'V2.21.20',fecha:'29-09-2026',titulo:'Empresas creadas por usuarios no administradores',items:[
    {tipo:'correccion',txt:'Un usuario Contador que creaba su empresa la veía solo en su equipo: nunca llegaba a la nube, al volver a entrar se le creaba otra vacía y lo trabajado no aparecía. Ahora cada usuario guarda sus empresas en su propio catálogo en la nube, y el administrador sigue viéndolas todas.'},
    {tipo:'correccion',txt:'Al crear una empresa nueva, la app espera que su ficha de acceso quede en la nube antes de leer los datos. Antes la lectura se adelantaba, la nube la rechazaba y el guardado quedaba bloqueado toda la sesión.'},
    {tipo:'cambio',txt:'Un usuario de solo Consulta sin empresas compartidas ya no recibe una empresa vacía: se le avisa que pida que le compartan una.'},
    {tipo:'cambio',txt:'Si el guardado se bloquea por falta de permisos, el aviso lo dice y explica qué hacer.'},
    {tipo:'correccion',txt:'Al abrir la app, la carga se cortaba a medio camino por un error interno del respaldo en Excel: no se activaban el respaldo automático, la guardia de prueba/producción, los permisos del menú ni los grupos de navegación. Corregido.'},
  ]},
  {version:'V2.21.19',fecha:'28-09-2026',titulo:'Inventario: folios correlativos',items:[
    {tipo:'cambio',txt:'Los folios de inventario ahora son correlativos por tipo: ENT-000001 (entrada), SAL-000001 (salida), TRA-000001 (traspaso), AJE-000001 y AJS-000001 (ajustes), TOMA-000001, OC-000001 y REC-000001.'},
    {tipo:'cambio',txt:'El folio de un movimiento nuevo se asigna al guardar, contra la lista más reciente de la nube, para que dos equipos no tomen el mismo número. El formulario muestra el próximo correlativo como referencia.'},
    {tipo:'cambio',txt:'Los movimientos ya registrados conservan su folio anterior (formato fecha y letras), porque está citado en documentos, observaciones y bitácora. La numeración nueva parte en 000001.'},
  ]},
  {version:'V2.21.18',fecha:'28-09-2026',titulo:'Importar Balance de Apertura: saldos con guion',items:[
    {tipo:'correccion',txt:'Cuando una cuenta de Activo tenía el saldo como guion ("-", formato contable para cero), el importador se saltaba el guion y tomaba como monto el código de la cuenta de Pasivo de la misma fila. Ahora el saldo es solo la celda que sigue al nombre: un guion o una celda vacía cuentan como cero y la cuenta no se importa.'},
    {tipo:'cambio',txt:'El importador acepta montos escritos como texto: con puntos de miles, con signo $ o negativos entre paréntesis, como (5.335.946).'},
  ]},
  {version:'V2.21.17',fecha:'28-09-2026',titulo:'Importar Balance de Apertura: pasivos al Haber',items:[
    {tipo:'correccion',txt:'Al importar el balance desde Excel, las cuentas de Pasivo y Patrimonio podían quedar todas al Debe. Pasaba cuando la hoja tenía formato o notas en columnas lejanas: el lado del balance se calculaba por "mitad de la fila" y esa mitad se corría. Ahora el lado se toma del encabezado PASIVO, o de la posición de las columnas de códigos, o del primer dígito del código si el balance viene en una sola columna.'},
    {tipo:'nuevo',txt:'La vista previa avisa si alguna cuenta quedó en un lado que no calza con su código (un 1xxxxxx como Pasivo o un 2xxxxxx como Activo).'},
  ]},
  {version:'V2.21.16',fecha:'28-09-2026',titulo:'Contador de consumo de Firestore y monitor de tamaño',items:[
    {tipo:'nuevo',txt:'Configuración → Sistema tiene una tarjeta "Consumo de Firestore": lecturas y escrituras a la nube desde que abriste la app, lecturas servidas desde caché (no se cobran), los registros más consultados y un historial de los últimos 14 días de este equipo.'},
    {tipo:'nuevo',txt:'Monitor de tamaño: muestra cuánto pesa cada registro contra el máximo de 1 MB por documento de Firestore. Al pasar el 70% aparece un aviso, rojo desde el 90%, para partirlo en bloques antes de que la nube rechace el guardado.'},
    {tipo:'cambio',txt:'El contador mide todo lo que habla con Firestore (contabilidad, inventario, usuarios) sin cambiar cómo se guarda. El historial vive solo en este equipo y no se sube a la nube.'},
  ]},
  {version:'V2.21.15',fecha:'28-09-2026',titulo:'Mayor por cuentas, Diario a pedido y Comprobantes en modo registro',items:[
    {tipo:'cambio',txt:'Libro Mayor: al entrar se ve una fila por cuenta (código, nombre, Debe, Haber y Saldo) con totales al pie. Haz clic en la cuenta para ver su detalle, que se arma en ese momento. Las cuentas abiertas se mantienen al cambiar el filtro y "Limpiar" las cierra.'},
    {tipo:'cambio',txt:'Libro Diario: sin filtros ya no muestra asientos, solo la barra de filtros y un aviso. Elige mes, rango de fechas o busca para verlos.'},
    {tipo:'cambio',txt:'Comprobantes abre directo con el formulario de asiento nuevo, fijo en la pantalla (deja de ser ventana flotante). Cancelar y Limpiar lo dejan en blanco en vez de cerrarlo.'},
    {tipo:'nuevo',txt:'Buscador de comprobantes en el encabezado: por N°, glosa o monto (con o sin puntos). Un asiento manual se carga en el formulario para editarlo; los automáticos, los vinculados a un documento y la apertura se abren en su comprobante.'},
    {tipo:'seguridad',txt:'El botón "atrás" del teléfono ya no esconde el formulario de asiento: como ahora está siempre abierto, "atrás" navega a la pantalla anterior.'},
  ]},
  {version:'V2.21.14',fecha:'21-09-2026',titulo:'Causa real del botón Guardar roto en móvil',items:[
    {tipo:'seguridad',txt:'`actualizarBotonGuardar()` reescribía el botón con texto plano en cada cambio de estado (bloqueado/pendiente/al día), borrando el <span> del que dependía el CSS para ocultar el texto en móvil. Por más que se ajustara el CSS, esa función lo pisaba segundos después de cargar la página. Corregido para que siempre conserve esa estructura.'},
    {tipo:'seguridad',txt:'Al ocultar el indicador "Guardado" en móvil (V2.21.12) se perdió el margen que empujaba el botón Guardar hacia la derecha, así que quedaba pegado al logo. Corregido: el botón Guardar siempre queda en la esquina derecha de la barra superior.'},
  ]},
  {version:'V2.21.13',fecha:'21-09-2026',titulo:'Corrección de fondo: la hoja de estilos quedaba pegada en caché',items:[
    {tipo:'seguridad',txt:'Se encontró la causa real de que los últimos ajustes visuales no llegaran a los teléfonos: css/styles.css se cargaba siempre con la misma URL, sin el sello de versión que sí tienen los módulos JS, así que el navegador seguía sirviendo la hoja de estilos vieja aunque el resto de la app se actualizara. Ahora _release.py también le agrega su propio sello de versión en cada publicación, igual que al resto.'},
  ]},
  {version:'V2.21.12',fecha:'21-09-2026',titulo:'Barra superior y menú lateral sin recortes en móvil',items:[
    {tipo:'cambio',txt:'En móvil, el botón "Guardar" de la barra superior queda solo como ícono y se ocultó el indicador de texto "Guardado", que competía por espacio y se cortaba contra el borde de la pantalla.'},
    {tipo:'seguridad',txt:'La barra superior recorta cualquier contenido que aún así exceda su ancho, en vez de dejarlo sobresalir de la pantalla.'},
    {tipo:'cambio',txt:'El bloque de "Cerrar sesión" al final del menú lateral respeta el área segura inferior del dispositivo (gestos o barra de navegación del teléfono), para que no quede tapado por los botones del sistema.'},
  ]},
  {version:'V2.21.11',fecha:'21-09-2026',titulo:'Acceso directo al Balance de 8 columnas en la barra superior',items:[
    {tipo:'nuevo',txt:'Nuevo ícono 📋 en los accesos rápidos de la barra superior (junto a Comprobantes, Diario, Mayor, Balance y Resultados) para ir directo al Balance de 8 columnas. Respeta el mismo permiso que el Balance General.'},
  ]},
  {version:'V2.21.10',fecha:'21-09-2026',titulo:'Cerrar sesión vuelve a quedar siempre visible en el menú móvil',items:[
    {tipo:'cambio',txt:'El bloque de usuario y "Cerrar sesión" al final del menú lateral en móvil queda fijo (sticky) dentro del menú: ya no se pierde por falta de espacio tras acortar el menú para dejar visible la barra superior.'},
  ]},
  {version:'V2.21.9',fecha:'17-09-2026',titulo:'Ajustes visuales: logo, marca de agua y menú lateral en móvil',items:[
    {tipo:'cambio',txt:'El logo de la pantalla de login y la marca de agua de la pantalla de inicio se ven más pequeños, en escritorio y en móvil.'},
    {tipo:'cambio',txt:'En móvil, el menú lateral ahora empieza justo debajo de la barra superior en vez de taparla, así el nombre de la empresa activa queda siempre visible mientras el menú está abierto.'},
  ]},
  {version:'V2.21.8',fecha:'17-09-2026',titulo:'Buscador dinámico de proveedor y producto en Órdenes de Compra',items:[
    {tipo:'cambio',txt:'Al emitir una orden de compra, Proveedor y Producto dejan de ser listas largas y pasan a ser buscadores dinámicos: filtran por código, RUT o nombre a medida que se escribe.'},
    {tipo:'nuevo',txt:'Nuevo buscador de productos de inventario (mismo criterio que el de cuentas y auxiliares), reutilizable en cualquier formulario del módulo.'},
  ]},
  {version:'V2.21.7',fecha:'17-09-2026',titulo:'Buscador dinámico de proveedor y saldo pendiente visible en Movimientos',items:[
    {tipo:'cambio',txt:'El campo Proveedor en el formulario de movimientos deja de ser una lista larga y pasa a ser un buscador dinámico: filtra por RUT o nombre a medida que se escribe, igual que en Asientos.'},
    {tipo:'nuevo',txt:'Al elegir una orden de compra en el movimiento, se muestra debajo el detalle de lo pendiente por recibir de esa orden (producto y cantidad).'},
  ]},
  {version:'V2.21.6',fecha:'17-09-2026',titulo:'Proveedor y orden de compra en entradas por factura o guía',items:[
    {tipo:'nuevo',txt:'Al registrar una entrada con Factura afecta/exenta o Guía de despacho, el formulario exige asociar el proveedor y ofrece una lista con sus órdenes de compra emitidas o parcialmente recibidas.'},
    {tipo:'seguridad',txt:'La orden de compra puede dejarse en blanco sólo si ninguno de los productos de la línea tiene una orden emitida pendiente con ese proveedor; si la tiene, hay que seleccionarla o recibirla desde Órdenes de compra.'},
  ]},
  {version:'V2.21.5',fecha:'17-09-2026',titulo:'Edición de movimientos de inventario ya guardados',items:[
    {tipo:'nuevo',txt:'Los movimientos de Entrada, Salida y Traspaso vigentes se pueden editar después de guardados (fecha, motivo, bodegas, documento, centro de costo, tercero, observaciones y líneas), a diferencia del resto del sistema, que sigue usando exclusivamente anular y volver a registrar.'},
    {tipo:'nuevo',txt:'El folio interno y el tipo de movimiento no cambian al editar: el tipo queda bloqueado y el folio se conserva desde el primer guardado, para no perder la trazabilidad.'},
    {tipo:'seguridad',txt:'Antes de guardar una edición se recalcula todo el libro de movimientos con el cambio aplicado: si dejaría stock negativo en algún movimiento posterior (por ejemplo, reducir una entrada cuya mercadería ya salió), se bloquea con el detalle del conflicto.'},
    {tipo:'cambio',txt:'Los movimientos que provienen de una recepción de compra o de una toma física siguen protegidos: no se editan directamente, se administran desde su origen.'},
  ]},
  {version:'V2.21.4',fecha:'17-09-2026',titulo:'Documento, folio interno y total por línea en movimientos de inventario',items:[
    {tipo:'nuevo',txt:'El formulario de movimientos separa el documento en un tipo seleccionable (guía, factura afecta/exenta, boleta, orden de compra, orden de trabajo, solicitud interna, acta de toma física u otro) y un N° independiente, que se exige sólo cuando corresponde.'},
    {tipo:'nuevo',txt:'Cada movimiento recibe su folio interno al abrir el formulario y lo conserva hasta guardar, visible desde el inicio para trazabilidad y referencia en futuras correcciones.'},
    {tipo:'cambio',txt:'El costo unitario neto de las entradas usa el mismo formato entero con separador de miles del resto del sistema, y cada línea muestra su total neto (cantidad × costo) apenas se completan ambos datos.'},
  ]},
  {version:'V2.21.3',fecha:'17-09-2026',titulo:'Cuentas contables obligatorias y restringidas en productos',items:[
    {tipo:'cambio',txt:'La cuenta de inventario de todo producto queda fija en 1109007: ya no es editable ni se puede elegir otra, tanto en el formulario como en la carga masiva desde Excel.'},
    {tipo:'nuevo',txt:'La cuenta de gasto/consumo pasa a ser un selector limitado a las cuentas de tipo Gasto del plan de cuentas, y su selección es obligatoria para guardar el producto.'},
    {tipo:'seguridad',txt:'La importación masiva rechaza filas sin cuenta de gasto o con una cuenta que no sea de tipo Gasto, e ignora cualquier valor que la planilla traiga en la columna de cuenta de inventario.'},
  ]},
  {version:'V2.21.2',fecha:'17-09-2026',titulo:'Conciliación automática entre recepciones y facturas del Libro de Compras',items:[
    {tipo:'nuevo',txt:'Al registrar una factura afecta o exenta ya sea de forma manual o al importar el RCV, el sistema la vincula automáticamente con la recepción física de inventario que comparte proveedor, tipo de DTE y N° de documento.'},
    {tipo:'nuevo',txt:'Las recepciones registradas con GUÍA (o cualquier recepción que el vínculo automático no resuelva) pueden conciliarse manualmente eligiendo la factura correspondiente ya registrada en Compras; una misma factura puede consolidar varias guías.'},
    {tipo:'seguridad',txt:'Si dos recepciones distintas apuntan al mismo N° de documento y proveedor (incluso con el tipo de documento mal tipeado), se muestra una advertencia de posible duplicado sin bloquear el guardado.'},
    {tipo:'cambio',txt:'Al anular la factura o la recepción vinculada, el vínculo se retira automáticamente de ambos lados conservando la trazabilidad.'},
  ]},
  {version:'V2.21.1',fecha:'16-09-2026',titulo:'Logotipo RABF corregido para temas claros y oscuros',items:[
    {tipo:'cambio',txt:'El nuevo archivo RABF indicado reemplaza el logotipo del login, cabecera, inicio, favicon e iconos de la aplicación instalable.'},
    {tipo:'arreglo',txt:'Los espacios interiores de las letras R, A y B respetan el fondo del tema y dejan de mostrar rellenos blancos sobre fondos oscuros.'},
    {tipo:'cambio',txt:'Los iconos maskable incorporan una zona segura sobre fondo oscuro para evitar recortes en Android y accesos instalables.'},
  ]},
  {version:'V2.21.0',fecha:'16-09-2026',titulo:'Órdenes de compra y recepciones integradas al inventario',items:[
    {tipo:'nuevo',txt:'Nuevo flujo de órdenes de compra por proveedor, bodega y centro de costo, con borrador, emisión, anulación y cierre de saldos pendientes.'},
    {tipo:'nuevo',txt:'Las recepciones parciales controlan cantidades pedidas, recibidas y pendientes, y admiten guía, factura afecta, factura exenta u otro documento.'},
    {tipo:'nuevo',txt:'Cada recepción genera atómicamente una entrada valorizada al inventario; los productos con lote exigen lote y vencimiento antes de guardar.'},
    {tipo:'seguridad',txt:'Se impiden sobre-recepciones, documentos duplicados por proveedor, edición concurrente y anulación de mercadería que ya fue consumida o trasladada.'},
    {tipo:'cambio',txt:'Las facturas recibidas quedan marcadas para conciliación con el DTE contable, evitando contabilizar dos veces la misma compra.'},
  ]},
  {version:'V2.20.2',fecha:'16-09-2026',titulo:'Carga masiva de productos desde Excel',items:[
    {tipo:'nuevo',txt:'El catálogo de productos permite descargar una plantilla Excel con instrucciones, valores admitidos y los grupos/subgrupos actuales de la empresa.'},
    {tipo:'nuevo',txt:'La carga masiva muestra una vista previa y clasifica cada fila como producto nuevo, actualización, omisión o error antes de guardar.'},
    {tipo:'seguridad',txt:'Se validan códigos y EAN duplicados, cuentas contables, tipos, unidades, stock mínimo, campos Sí/No y cambios incompatibles en productos que ya tienen movimientos.'},
    {tipo:'cambio',txt:'Los grupos y subgrupos indicados en la plantilla se crean automáticamente y la importación no altera existencias ni costos, que continúan registrándose mediante movimientos.'},
  ]},
  {version:'V2.20.1',fecha:'16-09-2026',titulo:'Tomas físicas de inventario con autorización y ajustes',items:[
    {tipo:'nuevo',txt:'Las tomas físicas operan por bodega, permiten alcance total o sólo productos con stock, filtro por grupo y conteo detallado por producto y lote.'},
    {tipo:'nuevo',txt:'El flujo incorpora conteo, cierre, revisión, devolución, rechazo y autorización; las diferencias autorizadas generan automáticamente ajustes de entrada o salida trazables.'},
    {tipo:'seguridad',txt:'Los movimientos ocurridos después de contar cada línea se rebajan automáticamente antes de calcular la diferencia, evitando ajustes falsos mientras la bodega continúa operando.'},
    {tipo:'seguridad',txt:'Cada toma usa control de versión para impedir sobrescrituras silenciosas entre equipos y la aplicación de ajustes persiste junto con el cierre de la toma.'},
  ]},
  {version:'V2.20.0',fecha:'16-09-2026',titulo:'Primera etapa del inventario multiempresa',items:[
    {tipo:'nuevo',txt:'Nuevo Control de Inventario separado por empresa, con catálogos de bodegas, grupos, subgrupos y productos.'},
    {tipo:'nuevo',txt:'Entradas, salidas y traspasos multibodega admiten varias líneas, lotes, fechas de vencimiento, documentos y centros de costo.'},
    {tipo:'nuevo',txt:'Las existencias y su valorización se reconstruyen desde los movimientos vigentes mediante costo promedio ponderado (PPP), sin permitir que una edición directa altere el saldo.'},
    {tipo:'seguridad',txt:'Se bloquean salidas superiores al saldo total o al lote disponible, se valida la fecha de un lote existente y las anulaciones reconstruyen automáticamente el stock.'},
    {tipo:'cambio',txt:'El respaldo Excel, los snapshots, la sincronización y el control de concurrencia incluyen todas las colecciones del nuevo auxiliar.'},
  ]},
  {version:'V2.19.9',fecha:'16-09-2026',titulo:'Logotipo RABF unificado y adaptado al tema',items:[
    {tipo:'cambio',txt:'La imagen RABF indicada se utiliza en el login, la cabecera, los accesos instalables, el favicon y la pantalla de selección de empresas.'},
    {tipo:'cambio',txt:'El fondo propio de la imagen se eliminó para que el logotipo se integre con el color del tema claro u oscuro en uso.'},
    {tipo:'arreglo',txt:'La marca de agua permanece centrada en Inicio y ajusta su opacidad según el tema para conservar legibilidad sin tapar el contenido.'},
  ]},
  {version:'V2.19.8',fecha:'15-09-2026',titulo:'Pro Pyme Transparente conserva correctamente la tasa IDPC de 0%',items:[
    {tipo:'arreglo',txt:'Al guardar la ficha Empresa, una tasa de 0% deja de convertirse en 25% por evaluación falsy de JavaScript.'},
    {tipo:'seguridad',txt:'El régimen 14 D N°8 fuerza su tasa legal de IDPC a 0%, incluso si un registro antiguo quedó almacenado erróneamente con 25%.'},
    {tipo:'arreglo',txt:'Estado de Resultados ya no estima ni descuenta impuesto de Primera Categoría para empresas Pro Pyme Transparente.'},
  ]},
  {version:'V2.19.7',fecha:'15-09-2026',titulo:'Nueva identidad visual RABF en iconos y pantalla de Inicio',items:[
    {tipo:'cambio',txt:'El icono de la aplicación, favicon, acceso de iPhone/iPad e iconos PWA fueron reemplazados por el logotipo cuadrado RABF Contabilidad.'},
    {tipo:'cambio',txt:'La cabecera y la portada de empresas muestran el nuevo icono RABF en lugar del pictograma genérico.'},
    {tipo:'arreglo',txt:'La marca de agua RABF queda centrada respecto del área visible de Inicio en escritorio y móvil, con baja opacidad para no interferir con las empresas.'},
  ]},
  {version:'V2.19.6',fecha:'15-09-2026',titulo:'Correcciones tributarias críticas: IUSC, remanente UTM, depreciación y RLI',items:[
    {tipo:'arreglo',txt:'El Formulario 29 incorpora el IUSC de trabajadores en el código 48 y lo suma al total a pagar del código 91, tomando el importe desde el asiento de remuneraciones del período.'},
    {tipo:'arreglo',txt:'El remanente de crédito fiscal del código 504 se reajusta con la UTM del mes de origen y la del mes de imputación. Si falta una UTM, el F29 muestra una advertencia y permite registrarla por período.'},
    {tipo:'arreglo',txt:'Los asientos de remuneraciones se fechan el último día real del mes; febrero ya no puede generar una fecha 30 inexistente.'},
    {tipo:'arreglo',txt:'La depreciación acelerada general usa un tercio de la vida normal con piso de un año. El régimen especial del Art. 31 N°5 bis queda expresamente separado y no se aplica automáticamente.'},
    {tipo:'arreglo',txt:'En Pro Pyme, la reversa de corrección monetaria deudora se trata como agregado y la acreedora como deducción de la RLI.'},
    {tipo:'cambio',txt:'Los selectores de documentos referenciados incorporan el DTE 61 y la jornada LRE 101 se rotula como Ordinaria general (Art. 21 / 22 inc. 1°).'},
  ]},
  {version:'V2.19.5',fecha:'15-09-2026',titulo:'Marca RABF: logo como marca de agua en la pantalla de inicio',items:[
    {tipo:'nuevo',txt:'Se incorporó el logo RABF Contabilidad como marca de agua sutil detrás de la pantalla de inicio, donde se seleccionan las empresas.'},
  ]},
  {version:'V2.19.4',fecha:'15-09-2026',titulo:'Arreglo: versión del login desactualizada',items:[
    {tipo:'arreglo',txt:'El texto de versión en el pie del login mostraba un número viejo fijo. Ahora se toma de la versión real de la app y el proceso de publicación lo actualiza solo en cada versión, así no vuelve a quedar desincronizado.'},
  ]},
  {version:'V2.19.3',fecha:'15-09-2026',titulo:'Ajustes normativos: referencias, jornada LRE, corrección monetaria y RCV',items:[
    {tipo:'nuevo',txt:'En el importador RCV de compras, la referencia de una NC/ND ahora ofrece todos los tipos válidos, incluida la Nota de Crédito (61) y la factura de compra (45), además de 30/32/33/34/43/46/56.'},
    {tipo:'cambio',txt:'Se precisaron las etiquetas de tipo de jornada del LRE: 101 Ordinaria (Art. 22 inc. 1° · Ley 40 Horas) y 701 Exenta de límite de jornada (Art. 22 inc. 2°), entre otras.'},
    {tipo:'cambio',txt:'La Corrección Monetaria ahora advierte según el régimen real de la empresa: si es Pro-Pyme (14 D N°3 o 14 D N°8) o renta presunta, indica claramente que NO aplica el Art. 41 LIR y que no se deben generar asientos.'},
    {tipo:'nuevo',txt:'El importador de compras recuerda el plazo de 8 días para acusar recibo/reclamar una factura antes de que opere la aceptación tácita y se consolide el crédito fiscal IVA.'},
  ]},
  {version:'V2.19.2',fecha:'15-09-2026',titulo:'Arreglo: la referencia de la nota capturada en el importador ahora se refleja en el auxiliar',items:[
    {tipo:'arreglo',txt:'Cuando asociabas una NC/ND a su factura en el importador del RCV, el auxiliar y "Pagos y Cobros" seguían mostrando "SIN REFERENCIA" porque leían un campo distinto al que guarda el importador. Ahora reconocen ambas: la asociación manual (folioRef) y la referencia del importador (referencia.folio).'},
    {tipo:'cambio',txt:'La nota queda colgando bajo su factura, con el saldo neteado, tanto en el detalle del auxiliar como en el estado de cuenta y en Pagos y Cobros. Si asocias a mano, esa asociación tiene prioridad.'},
  ]},
  {version:'V2.19.1',fecha:'15-09-2026',titulo:'Importador RCV: casilla de descripción (glosa) que aparece en el asiento',items:[
    {tipo:'nuevo',txt:'En la carga del RCV del SII (Compras y Ventas), cada documento tiene una casilla "Descripción (glosa)" bajo la razón social. Lo que escribas ahí se usa como glosa del asiento y como descripción de las líneas de gasto/ingreso (antes salían con "—").'},
    {tipo:'cambio',txt:'Si no ingresas descripción, la glosa mantiene el formato automático de antes (Documento N° — Razón social).'},
  ]},
  {version:'V2.19.0',fecha:'15-09-2026',titulo:'Accesos directos en la barra superior y Balance de 8 columnas',items:[
    {tipo:'nuevo',txt:'En la barra superior (escritorio) hay botones tipo icono de acceso rápido a los módulos más usados: Comprobantes, Libro Diario, Libro Mayor, Balance General y Estado de Resultados.'},
    {tipo:'nuevo',txt:'Nuevo reporte "Balance de 8 columnas" (hoja de trabajo tipo IFRS): por cada cuenta muestra Sumas (Debe/Haber), Saldos (Deudor/Acreedor), Balance (Activo/Pasivo) y Resultado (Pérdida/Ganancia), con el resultado del ejercicio cuadrando ambos pares. Se puede imprimir y exportar a Excel.'},
  ]},
  {version:'V2.18.0',fecha:'15-09-2026',titulo:'Comprobantes de pago editables',items:[
    {tipo:'nuevo',txt:'Los comprobantes de pago y cobro ahora se pueden editar desde Comprobantes con un editor dedicado: cambiar la fecha, la cuenta de banco/caja y la glosa.'},
    {tipo:'nuevo',txt:'Se puede agregar (o quitar) documentos al comprobante, buscándolos por razón social, RUT o folio; cada documento queda referenciado y se refleja en su estado de cuenta.'},
    {tipo:'nuevo',txt:'Cada línea define su tipo de movimiento: Abono (reduce el saldo, ej. un pago) o Cargo (lo aumenta, ej. un ajuste). La línea de banco/caja se recalcula sola como el neto que cuadra el asiento.'},
  ]},
  {version:'V2.17.4',fecha:'15-09-2026',titulo:'Arreglo: el editor de ficha ahora aparece sobre el formulario de honorario',items:[
    {tipo:'arreglo',txt:'Al pulsar "Crear ficha de auxiliar", el editor de ficha quedaba por debajo del formulario de honorario y solo se veía al cerrar este. Ahora se muestra por encima, como corresponde.'},
  ]},
  {version:'V2.17.3',fecha:'15-09-2026',titulo:'Nuevo honorario: botón para crear el auxiliar si no existe',items:[
    {tipo:'nuevo',txt:'Si el prestador no está registrado, un botón "➕ Crear ficha de auxiliar" abre el editor de ficha (proveedor) con el RUT y la razón social ya precargados. Al guardar, vuelve al honorario con el prestador seleccionado y listo para usar.'},
  ]},
  {version:'V2.17.2',fecha:'15-09-2026',titulo:'Nuevo honorario: buscadores dinámicos de prestador y de cuentas',items:[
    {tipo:'nuevo',txt:'El prestador ahora se elige con un buscador dinámico: escribe parte de la razón social, el RUT o el código del auxiliar y se filtran los prestadores registrados. Se navega con flechas y Enter. Si es nuevo, se ingresa el RUT abajo.'},
    {tipo:'nuevo',txt:'Cada cuenta de gasto de la distribución usa el mismo buscador de cuentas del resto del sistema (filtra por código o nombre mientras escribes), en vez de una lista larga.'},
  ]},
  {version:'V2.17.1',fecha:'15-09-2026',titulo:'Honorarios: el gasto se puede repartir en varias cuentas',items:[
    {tipo:'nuevo',txt:'En "Nuevo honorario" el gasto ya no va a una sola cuenta: se puede distribuir en varias (asesorías, gastos notariales, servicios personales, etc.), igual que en una compra. Cada línea tiene su cuenta, monto y centro de costo, y el total debe igualar el bruto (con verificación en tiempo real).'},
    {tipo:'cambio',txt:'La retención se sigue calculando sobre el bruto total y el líquido a Honorarios por Pagar es lo que se paga al prestador, sin importar cómo se reparta el gasto. Cada cuenta lleva el auxiliar del prestador solo si lo requiere.'},
  ]},
  {version:'V2.17.0',fecha:'15-09-2026',titulo:'Honorarios como documento de proveedor (pagables y con estado de cuenta)',items:[
    {tipo:'nuevo',txt:'Los honorarios ahora se tratan como un documento del proveedor. Se ingresan desde Comprobantes con el botón "📝 Nuevo honorario", eligiendo el prestador (misma ficha de proveedor), el monto bruto y si lleva retención. Se contabilizan a Honorarios por Pagar (2102006), con la retención (2103002) y el gasto (3202019).'},
    {tipo:'nuevo',txt:'Dos tipos de documento nuevos: Boleta de Honorarios con retención (70) y sin retención (71). La retención se calcula automática con la tasa del año (15,25% en 2026).'},
    {tipo:'nuevo',txt:'Cada honorario queda pagable desde "Pagos y Cobros" junto a los demás proveedores (el saldo por pagar es el líquido) y aparece en el estado de cuenta y aging del prestador, compartiendo su ficha.'},
    {tipo:'cambio',txt:'Los honorarios no llevan IVA: no entran al Libro de Compras ni al F29 de compras. Se retiró el botón de "nueva boleta" del módulo Honorarios anterior; el ingreso ahora es desde Comprobantes.'},
  ]},
  {version:'V2.16.45',fecha:'15-09-2026',titulo:'Estado de cuenta: los pagos se muestran junto a su factura y el saldo cuadra',items:[
    {tipo:'arreglo',txt:'En el estado de cuenta y en el detalle del auxiliar, cada pago/cobro ahora cuelga de la factura que abona (usando el documento que referencia el asiento de pago), en lugar de aparecer como una línea suelta. Así la factura muestra su saldo neto y las facturas totalmente pagadas dejan de aparecer en "Sólo con saldo".'},
    {tipo:'arreglo',txt:'Se corrige el descuadre donde el "total pendiente" no coincidía con el saldo contable del auxiliar: los pagos ya no se contaban dos veces (una dentro del saldo del documento y otra como movimiento suelto). Aplica a clientes y proveedores.'},
  ]},
  {version:'V2.16.44',fecha:'15-09-2026',titulo:'Pagos: el error de guardado ahora dice la causa y qué hacer',items:[
    {tipo:'arreglo',txt:'Cuando falla el guardado de un pago/cobro, el mensaje ya no es genérico: indica la causa concreta (sin conexión, otro dispositivo guardó primero, datos aún sincronizando, ejercicio cerrado o validación contable) y qué hacer en cada caso. El detalle técnico queda entre paréntesis para diagnóstico.'},
  ]},
  {version:'V2.16.43',fecha:'15-09-2026',titulo:'Pagos: "seleccionar todos" respeta el filtro y los pagos se pueden anular/eliminar',items:[
    {tipo:'arreglo',txt:'"Seleccionar todos" ahora marca SOLO los documentos del mes/búsqueda filtrados, no todos los pendientes. Antes, si filtrabas enero y marcabas todos, se seleccionaban también los demás meses y se pagaban por error.'},
    {tipo:'arreglo',txt:'Al cambiar el mes en el filtro se limpia la selección, para que no queden marcados documentos de un mes que ya no estás viendo.'},
    {tipo:'nuevo',txt:'El comprobante de un pago/cobro ya se puede Anular o Eliminar desde Comprobantes. Al hacerlo, los documentos incluidos vuelven a quedar pendientes automáticamente. Anular conserva el N° correlativo; Eliminar lo borra por completo.'},
  ]},
  {version:'V2.16.42',fecha:'14-09-2026',titulo:'Pagos: bandera roja para documentos vencidos sin pagar',items:[
    {tipo:'nuevo',txt:'En Pagos y Cobros, los documentos con saldo pendiente cuya fecha de vencimiento ya pasó se marcan con una bandera roja "🔴 VENCIDA" que indica los días de atraso. La fila queda con un fondo rojo tenue y la fecha de vencimiento se resalta en rojo para que salten a la vista.'},
  ]},
  {version:'V2.16.41',fecha:'14-09-2026',titulo:'Auxiliares: se corrige el saldo duplicado por falsos "Pago"',items:[
    {tipo:'arreglo',txt:'En el sub-libro de clientes y proveedores, cada factura y nota aparecía dos veces: una como el documento y otra como un falso "Pago — Asiento N°" con el mismo monto, lo que duplicaba el saldo por pagar/cobrar. Ahora cada documento se cuenta una sola vez.'},
    {tipo:'arreglo',txt:'Los pagos y cobros reales (registrados en Pagos y Cobros) siguen apareciendo y descuentan el saldo como corresponde. El arreglo también corrige el Aging y el Estado de cuenta, que usaban el mismo cálculo.'},
  ]},
  {version:'V2.16.40',fecha:'14-09-2026',titulo:'El importador recuerda la cuenta y centro de costo por proveedor',items:[
    {tipo:'arreglo',txt:'Al presionar "Aplicar", la cuenta y el centro de costo que asignaste a cada proveedor se guardan en su ficha ANTES de grabar los documentos. Así, si el guardado falla o reimportas el período, cada proveedor ya viene con su cuenta y centro de costo pre-cargados y no hay que reasignarlos de nuevo.'},
    {tipo:'nuevo',txt:'La próxima vez que importes documentos de un proveedor ya clasificado (de cualquier mes), su cuenta y centro de costo se completan solos. Solo completa lo que falte; nunca pisa lo que ya tenías configurado.'},
  ]},
  {version:'V2.16.39',fecha:'14-09-2026',titulo:'Se corrige el límite de 1 MB de la nube (importaciones grandes ya no fallan)',items:[
    {tipo:'arreglo',txt:'Al acumular varios meses de documentos, el guardado en la nube fallaba con "The value of property value is longer than 1048487 bytes" y revertía toda la importación (le pasaba a abril). Ahora los datos se comprimen antes de subir a la nube, quedando muy por debajo del tope de 1 MB por documento de Firestore.'},
    {tipo:'arreglo',txt:'La compresión es transparente y compatible: los datos ya guardados se siguen leyendo sin cambios y, al primer guardado, quedan comprimidos automáticamente. Un año de asientos que pesaba ~860 KB pasa a ~180 KB, dejando holgura para varios años.'},
  ]},
  {version:'V2.16.38',fecha:'14-09-2026',titulo:'Importador RCV: se corrige la alineación y la razón social oculta',items:[
    {tipo:'arreglo',txt:'En la tabla del importador de Compras, la razón social vuelve a verse (antes se comprimía y quedaba en blanco al agregar la columna Referencia). Las columnas tienen ancho fijo y la tabla hace scroll horizontal, de modo que cada encabezado queda alineado con sus valores.'},
  ]},
  {version:'V2.16.37',fecha:'14-09-2026',titulo:'Importador RCV: columna Referencia para notas de crédito/débito',items:[
    {tipo:'nuevo',txt:'El importador de Compras desde SII tiene una nueva columna "Referencia". En las notas de crédito y débito (DTE 61 y 56) permite asociar la nota a una factura del mismo proveedor, ya sea que esté en el mismo RCV que se está cargando o registrada de períodos anteriores. Cada opción muestra tipo, folio, fecha y monto, e indica si el documento viene en este RCV.'},
    {tipo:'nuevo',txt:'Si la factura referenciada no está disponible en el sistema, se puede ingresar el folio manualmente con la opción "Otro folio". La referencia elegida queda guardada con la nota y se conserva al reimportar el período.'},
    {tipo:'arreglo',txt:'Al asociar la referencia, la observación "nota sin folio de documento referenciado" del Libro de Compras desaparece para esa nota.'},
  ]},
  {version:'V2.16.36',fecha:'14-09-2026',titulo:'Libro de Compras: combustibles con específico ya no figuran como error',items:[
    {tipo:'arreglo',txt:'En el reporte del Libro de Compras, las facturas de combustible con impuesto específico o recuperación de diésel dejaron de marcarse como "errores que deben corregirse". El RCV no informa toda esa partida por columnas, así que Neto+Exento+IVA+Otros no da el Total, pero el asiento lo reconoce en el costo y cuadra contra el Total. Ahora aparecen como una única observación informativa, no como error.'},
  ]},
  {version:'V2.16.35',fecha:'14-09-2026',titulo:'Impresión de Libros de Compras/Ventas en hoja horizontal',items:[
    {tipo:'arreglo',txt:'Al imprimir o exportar a PDF los Libros de Compras y Ventas, la hoja sale en formato carta horizontal y todas las columnas se ajustan al ancho de la página. Antes el detalle se desbordaba y no se alcanzaba a imprimir completo.'},
    {tipo:'cambio',txt:'El detalle usa una fuente compacta validada para que hasta los montos de 9 dígitos se impriman completos sin recortarse, y la impresión sale siempre en blanco y negro aunque la pantalla esté en modo oscuro.'},
  ]},
  {version:'V2.16.34',fecha:'14-09-2026',titulo:'Nuevo asiento en ventana flotante y 3 líneas por defecto',items:[
    {tipo:'cambio',txt:'En Comprobantes, "+ Nuevo Asiento" ahora abre el formulario en una ventana flotante centrada sobre la lista, en vez de mostrarse dentro de la misma pantalla de los últimos comprobantes. Se cierra con la ✕, con Cancelar o haciendo clic fuera.'},
    {tipo:'cambio',txt:'El formulario de asiento manual parte con 3 líneas de cuenta en blanco en lugar de 2, para el ingreso más habitual.'},
  ]},
  {version:'V2.16.33',fecha:'14-09-2026',titulo:'Combustibles: cuadre definitivo contra el Total del RCV (recuperación de específico)',items:[
    {tipo:'arreglo',txt:'Las compras de combustible cuyo Total del RCV es menor que Neto + IVA (recuperación o descuento de impuesto específico diésel, típico de estaciones de servicio y distribuidoras como NAZAL) ya cuadran: esa diferencia rebaja el costo del combustible y el crédito fiscal de IVA se mantiene íntegro. Ejemplos: DTE 33 N° 164619, 164750, 164803.'},
    {tipo:'arreglo',txt:'El asiento automático de compras se reconcilia siempre contra el Total informado por el SII, en ambos sentidos: si el Total supera a Neto + IVA + otros, el excedente es impuesto que integra el costo; si es menor, es una recuperación que lo rebaja. La línea de costo muestra la etiqueta "Ajuste a Total RCV" para trazabilidad.'},
    {tipo:'arreglo',txt:'También quedan cuadrados los documentos donde el impuesto específico venía informado por partida doble en el RCV y superaba al Total (ej. DTE 33 N° 173421 y su nota de crédito).'},
  ]},
  {version:'V2.16.32',fecha:'14-09-2026',titulo:'Importación RCV: impuesto específico, sin crédito y NC de factura de compra',items:[
    {tipo:'arreglo',txt:'Las compras cuyo Total del RCV supera a Neto + IVA por impuesto específico (diésel/petróleo) o "Impto. sin derecho a crédito" ya cuadran: ese excedente se incorpora al costo, no bloquea la importación. Ejemplos: DTE 33 N° 169590 y N° 171426.'},
    {tipo:'arreglo',txt:'Las notas de crédito sobre facturas de compra (DTE 61 con IVA retenido) conservan la retención al guardarse desde el importador; antes el asiento descuadraba justo por el monto retenido (ej. DTE 61 N° 249).'},
    {tipo:'arreglo',txt:'Al asignar un centro de costo de forma masiva en el importador, las cuentas que no admiten centro de costo (por ejemplo cuentas de existencias como 1210002) simplemente lo ignoran en el asiento, en lugar de quedar como error pendiente.'},
  ]},
  {version:'V2.16.31',fecha:'14-09-2026',titulo:'Montos enteros con separador de miles',items:[
    {tipo:'cambio',txt:'Las casillas monetarias muestran los importes como enteros con separador de miles chileno mientras se escriben, por ejemplo 31.681.'},
    {tipo:'arreglo',txt:'Compras, Ventas y Comprobantes interpretan el valor visible completo al calcular y guardar; el punto ya no puede confundirse con una fracción decimal.'},
    {tipo:'cambio',txt:'El formato uniforme se extiende a distribuciones, apertura, pagos, honorarios, remuneraciones, activo fijo, conciliación, F29, Renta e indicadores monetarios enteros.'},
    {tipo:'seguridad',txt:'Folios, RUT, códigos, años, días, porcentajes, tasas, UF y tipos de cambio conservan su formato y precisión propios.'}
  ]},
  {version:'V2.16.30',fecha:'14-09-2026',titulo:'Importación RCV resistente a errores por documento',items:[
    {tipo:'seguridad',txt:'Compras y Ventas validan cada asiento contra el Plan de Cuentas dentro de la vista previa, incluyendo cuentas inexistentes, inactivas, agrupadoras y exigencias de auxiliar o centro de costo.'},
    {tipo:'arreglo',txt:'Un error al crear el asiento de un documento ya no interrumpe todo el lote: la fila defectuosa se revierte de forma individual y las demás continúan.'},
    {tipo:'nuevo',txt:'Los documentos que fallen al guardar quedan visibles como pendientes con error, muestran la causa exacta y pueden volver a validarse para reintentar.'},
    {tipo:'seguridad',txt:'Los resúmenes, fichas auxiliares y auditoría del lote contabilizan solamente los documentos aplicados correctamente.'}
  ]},
  {version:'V2.16.29',fecha:'14-09-2026',titulo:'Libros mensuales de Compras y Ventas',items:[
    {tipo:'nuevo',txt:'Reportes incorpora libros mensuales de Compras y Ventas con selector de período y vista independiente por cada tipo de DTE.'},
    {tipo:'nuevo',txt:'El resumen reproduce las columnas tributarias del RCV: documentos, exento, neto, IVA recuperable/uso común/no recuperable y total; Ventas presenta IVA débito y otros impuestos.'},
    {tipo:'nuevo',txt:'Cada detalle incluye correlativo interno mensual, folio, fecha, RUT, razón social, montos y documento referenciado.'},
    {tipo:'nuevo',txt:'La exportación Excel genera Datos, Resumen por DTE, Detalle consolidado y una hoja separada por tipo de documento.'},
    {tipo:'nuevo',txt:'La descarga CSV sigue el orden de columnas de detalle SII e incorpora Número Interno para facilitar conciliación con el RCV/RVE.'},
    {tipo:'nuevo',txt:'Imprimir / PDF produce portada del contribuyente, período, resumen y secciones separadas por DTE.'},
    {tipo:'seguridad',txt:'Antes de exportar se validan duplicados, correlativos repetidos, campos esenciales, cuadratura tributaria, códigos de IVA no recuperable y referencias de notas.'}
  ]},
  {version:'V2.16.28',fecha:'13-09-2026',titulo:'Edición segura y redondeo exacto del RCV',items:[
    {tipo:'seguridad',txt:'Editar un comprobante de Compras o Ventas abre siempre su documento de origen y actualiza el mismo asiento; ya no crea un asiento manual adicional.'},
    {tipo:'arreglo',txt:'Neto, IVA y Total conservan exactamente los valores informados por el SII; una diferencia tributaria de $1 se absorbe en la línea base del asiento sin alterar el libro.'},
    {tipo:'arreglo',txt:'Las Notas de Crédito/Débito referidas a DTE 45/46 mantienen el IVA retenido al editarse y cuadran contra el total pagadero correcto.'},
    {tipo:'seguridad',txt:'Documento y asiento se guardan en una sola transacción, se bloquea el doble clic y se rechazan IDs o vínculos documentales duplicados.'},
    {tipo:'arreglo',txt:'Los documentos convertidos por versiones anteriores pueden recuperar su vínculo contable; la conversión antigua queda anulada con trazabilidad.'},
    {tipo:'arreglo',txt:'La alerta, el detalle y la validación usan ahora la misma regla: Debe y Haber deben ser exactamente iguales.'}
  ]},
  {version:'V2.16.27',fecha:'13-09-2026',titulo:'Corrección directa de comprobantes descuadrados',items:[
    {tipo:'arreglo',txt:'Los botones de la alerta abren el asiento descuadrado exacto mediante su identidad interna, incluso si existen números visibles duplicados en datos heredados.'},
    {tipo:'arreglo',txt:'El buscador por número conserva cada coincidencia y ya no abre silenciosamente el primer comprobante que comparte el mismo correlativo.'},
    {tipo:'arreglo',txt:'Al editar o convertir un comprobante se conservan centro de costo, vínculo documental, datos auxiliares y clasificación tributaria de cada línea.'},
    {tipo:'seguridad',txt:'El editor exige Debe igual a Haber antes de habilitar Guardar, en concordancia con la validación contable central.'},
    {tipo:'arreglo',txt:'Los asientos manuales se localizan por su ID interno antes que por números históricos y se guardan mediante la misma puerta de validación central.'},
    {tipo:'cambio',txt:'Si una conversión no puede guardarse, el mensaje informa la causa específica y conserva el comprobante original sin cambios.'}
  ]},
  {version:'V2.16.26',fecha:'13-09-2026',titulo:'Selección asistida de documentos referenciados',items:[
    {tipo:'nuevo',txt:'Al registrar o editar una Nota de Crédito/Débito en Compras, el sistema muestra los documentos activos ya capturados para el RUT del proveedor.'},
    {tipo:'nuevo',txt:'Ventas ofrece la misma selección filtrada por el RUT del cliente.'},
    {tipo:'cambio',txt:'Seleccionar el documento completa automáticamente tipo DTE, folio y fecha de la referencia, conservando la razón editable.'},
    {tipo:'seguridad',txt:'La referencia guarda además el vínculo interno y el total original cuando el documento seleccionado existe en el sistema; los anulados y la propia nota quedan excluidos.'},
    {tipo:'cambio',txt:'Si el documento original aún no está capturado, los campos manuales de referencia continúan disponibles.'}
  ]},
  {version:'V2.16.25',fecha:'13-09-2026',titulo:'Captura RCV cuadrada y clasificación pendiente',items:[
    {tipo:'arreglo',txt:'Compras ya no presenta como descuadre contable un documento que sólo está pendiente de asignar a una cuenta de gasto o activo.'},
    {tipo:'arreglo',txt:'El lector distingue Código Otro Impuesto de Valor Otro Impuesto y acumula correctamente documentos del SII que distribuyen varios impuestos en filas continuadas.'},
    {tipo:'arreglo',txt:'Facturas de compra DTE 45/46 y sus notas de crédito contabilizan el IVA retenido sin duplicarlo como costo u otro impuesto.'},
    {tipo:'seguridad',txt:'Los documentos sin cuenta permanecen visibles en el importador después de aplicar el resto del lote y sólo se guardan cuando su clasificación está completa.'},
    {tipo:'cambio',txt:'La captura conserva por separado IVA recuperable, no recuperable, de uso común y de activo fijo para Compras, tanto desde CSV como desde Excel.'}
  ]},
  {version:'V2.16.24',fecha:'13-09-2026',titulo:'Fecha de vencimiento automática en capturadores SII',items:[
    {tipo:'nuevo',txt:'Los capturadores de Compras y Ventas leen la fecha de vencimiento cuando viene informada en el archivo RCV/Excel/CSV del SII.'},
    {tipo:'cambio',txt:'Si el archivo no informa vencimiento, el sistema asigna automáticamente emisión + 30 días y guarda la fecha en el documento para auxiliares, pagos, aging y flujo de caja.'},
    {tipo:'seguridad',txt:'Una reimportación sin vencimiento no reemplaza una fecha real o manual ya registrada; un vencimiento real del archivo sí puede reemplazar una estimación previa de 30 días.'},
    {tipo:'cambio',txt:'La vista previa de los importadores muestra la fecha de vencimiento y distingue visualmente cuando fue estimada a 30 días.'}
  ]},
  {version:'V2.16.23',fecha:'13-09-2026',titulo:'Cierres mensuales operativos para contadores',items:[
    {tipo:'nuevo',txt:'Cierres Mensuales se separa de Auditoría de Integridad y aparece como módulo propio dentro de Cierre de Ejercicio.'},
    {tipo:'cambio',txt:'Administradores y contadores con acceso de edición a la empresa activa pueden cerrar y reabrir períodos mensuales; la reapertura exige motivo y queda auditada.'},
    {tipo:'cambio',txt:'El cierre anual y su reapertura quedan disponibles para contadores autorizados en sus empresas asignadas, manteniendo motivo obligatorio, trazabilidad y validaciones contables.'},
    {tipo:'seguridad',txt:'Auditoría de Integridad continúa siendo exclusiva del administrador; un cierre bloqueado por hallazgos críticos informa al contador sin exponer el panel técnico.'}
  ]},
  {version:'V2.16.22',fecha:'13-09-2026',titulo:'Buscador de Comprobantes estable en móvil',items:[
    {tipo:'arreglo',txt:'El buscador por glosa o cuenta ya no destruye el campo de texto con cada pulsación en Android, evitando que el teclado se cierre después del primer carácter.'},
    {tipo:'cambio',txt:'La búsqueda aplica un debounce breve de 220 ms, conserva foco, cursor y posición de desplazamiento mientras actualiza los resultados.'},
    {tipo:'arreglo',txt:'Cambiar otros filtros o pulsar Limpiar cancela cualquier búsqueda pendiente para evitar reenfoques inesperados.'}
  ]},
  {version:'V2.16.21',fecha:'13-09-2026',titulo:'Borradores efímeros y Cancelar obligatorio',items:[
    {tipo:'cambio',txt:'Los formularios incompletos viven sólo durante la sesión actual y se eliminan al cerrar la app; ya no se restauran en una ejecución posterior.'},
    {tipo:'cambio',txt:'Se elimina el estado Borrador de la barra superior y del botón Guardar Todo; sólo los cambios ya confirmados muestran estado de sincronización.'},
    {tipo:'nuevo',txt:'Todo formulario de ingreso debe disponer de Cancelar al final; si un módulo no lo incluía, la aplicación agrega una acción de cancelación automáticamente.'},
    {tipo:'arreglo',txt:'Cancelar, cerrar con X o usar Atrás sobre un formulario descarta su borrador de sesión sin persistirlo.'},
    {tipo:'cambio',txt:'Configuración muestra Borradores de esta sesión, disponibles únicamente mientras la app permanezca abierta.'}
  ]},
  {version:'V2.16.20',fecha:'13-09-2026',titulo:'Comprobantes dentro de Registros',items:[
    {tipo:'cambio',txt:'El módulo Comprobantes se mueve desde Reportes a la categoría Registros, junto a Ventas, Compras, Honorarios, Remuneraciones, Pagos y Auxiliares.'},
    {tipo:'arreglo',txt:'La navegación lateral mantiene una sola entrada para Comprobantes y conserva intacta su lógica, permisos y funcionamiento.'}
  ]},
  {version:'V2.16.19',fecha:'13-09-2026',titulo:'Guardar Todo robusto y menú móvil sin duplicados',items:[
    {tipo:'arreglo',txt:'Guardar Todo recupera de forma segura una revisión Firestore perdida en memoria cuando la copia local coincide exactamente con la nube, evitando el error clave-no-sincronizada después de reanudaciones en Android.'},
    {tipo:'seguridad',txt:'Si la copia local y Firestore difieren, el sistema mantiene el bloqueo y no adopta la revisión remota, por lo que no se debilita la protección contra sobrescrituras entre equipos.'},
    {tipo:'arreglo',txt:'La misma protección se aplica a guardados individuales y eliminaciones versionadas.'},
    {tipo:'cambio',txt:'Guardar Todo informa además la clave concreta si persiste un problema de sincronización.'},
    {tipo:'arreglo',txt:'Se elimina el acceso rápido duplicado a Sistema y Respaldos del bloque Acciones del menú móvil; queda únicamente dentro de Configuración.'}
  ]},
  {version:'V2.16.18',fecha:'13-09-2026',titulo:'Gestor de borradores y menú lateral por categorías',items:[
    {tipo:'nuevo',txt:'Configuración > Sistema y Respaldos incorpora un apartado Borradores locales con fecha, módulo y campos pendientes.'},
    {tipo:'nuevo',txt:'Cada borrador puede retomarse con Editar para continuar en su módulo y guardarse con las validaciones normales, o descartarse individualmente.'},
    {tipo:'cambio',txt:'Los borradores se mantienen separados por empresa y ejercicio y siguen siendo exclusivamente locales hasta confirmar Guardar/Registrar.'},
    {tipo:'cambio',txt:'El menú lateral ahora muestra categorías plegables; al tocar una categoría se despliegan sus módulos y se conserva abierta la categoría activa.'},
    {tipo:'arreglo',txt:'Inicio queda correctamente identificado como la sección activa inicial del menú.'}
  ]},
  {version:'V2.16.17',fecha:'13-09-2026',titulo:'Versión y autor visibles en login',items:[
    {tipo:'cambio',txt:'La pantalla de inicio de sesión muestra en su parte inferior la versión funcional de la aplicación y la leyenda Desarrollado por R.A.B.F. · 2026.'},
    {tipo:'arreglo',txt:'La versión del pie de login se obtiene desde la metadata de la publicación para evitar que quede desactualizada en futuras versiones.'}
  ]},
  {version:'V2.16.16',fecha:'12-09-2026',titulo:'Base Neto/Exento automática al asociar DTE',items:[
    {tipo:'arreglo',txt:'Al abrir DTE desde un asiento de Venta o Compra, el sistema completa inmediatamente la base además del IVA y Total, sin esperar a seleccionar el tipo de documento.'},
    {tipo:'cambio',txt:'Si existe IVA, la base afecta se reconstruye automáticamente y se muestra en Neto; si no existe IVA, la base se presenta provisionalmente en Exento hasta elegir el tipo SII.'},
    {tipo:'arreglo',txt:'Al seleccionar un DTE afecto o exento, una base inferida automáticamente se reclasifica en Neto o Exento según corresponda, sin conservar una clasificación provisional incorrecta.'},
    {tipo:'cambio',txt:'En documentos mixtos, una diferencia material entre la base total y la base explicada por el IVA puede conservarse como monto exento; diferencias de 1–2 pesos por redondeo no generan exento ficticio.'}
  ]},
  {version:'V2.16.15',fecha:'12-09-2026',titulo:'DTE autocompletado desde el asiento',items:[
    {tipo:'nuevo',txt:'Al asociar un DTE desde la edición de un comprobante, el sistema reconstruye automáticamente RUT, razón social, N° de documento, total, IVA, exento, otros impuestos y descripción a partir de las líneas contables disponibles.'},
    {tipo:'cambio',txt:'Al elegir el tipo de documento SII, la base se asigna automáticamente a Neto o Exento según corresponda, por lo que en el flujo normal sólo resta elegir el DTE y la fecha de vencimiento.'},
    {tipo:'arreglo',txt:'El autocompletado funciona tanto en el editor unificado de Comprobantes como en el formulario de Asientos Manuales.'},
    {tipo:'seguridad',txt:'Los valores explícitos del documento original o del RCV siempre tienen prioridad; la inferencia sólo completa campos vacíos para no reemplazar datos tributarios reales.'},
    {tipo:'cambio',txt:'Facturas de compra 45/46 reconstruyen el total documental considerando el IVA retenido cuando la cuenta 2103005 está presente.'}
  ]},
  {version:'V2.16.14',fecha:'12-09-2026',titulo:'Centros de costo normales y sin capitalización',items:[
    {tipo:'nuevo',txt:'Los subcentros nuevos parten como tipo Normal, pensado para empresas comerciales y áreas que sólo necesitan acumular costos.'},
    {tipo:'nuevo',txt:'La configuración incorpora la opción explícita Sin Capitalización.'},
    {tipo:'cambio',txt:'Al seleccionar Normal desaparecen fecha de inicio, curva, porcentajes y cuenta vinculados a capitalización.'},
    {tipo:'arreglo',txt:'La lógica central fuerza 0% de capitalización para centros normales u operativos, evitando activaciones accidentales.'},
    {tipo:'cambio',txt:'Los centros Operativos históricos siguen siendo compatibles y los respaldos conservan la configuración completa de capitalización.'}
  ]},
  {version:'V2.16.13',fecha:'12-09-2026',titulo:'Comprobantes móvil y descuadres RCV pendientes',items:[
    {tipo:'arreglo',txt:'Comprobantes usa fichas móviles con Debe/Haber legibles, evitando la tabla horizontal que partía los montos.'},
    {tipo:'arreglo',txt:'Los números de la alerta de descuadre son clicables y abren directamente el documento o asiento que debe corregirse.'},
    {tipo:'cambio',txt:'La alerta de descuadre se calcula sobre todo el diario y desaparece automáticamente sólo cuando el comprobante vuelve a cuadrar.'},
    {tipo:'seguridad',txt:'Compras y Ventas separan los DTE descuadrados antes de aplicar el RCV: los cuadrados se guardan y los problemáticos quedan pendientes en el importador.'},
    {tipo:'nuevo',txt:'Las alertas preventivas del RCV permiten tocar cada DTE pendiente para localizarlo inmediatamente dentro del importador.'}
  ]},
  {version:'V2.16.12',fecha:'12-09-2026',titulo:'Control preventivo de cuadratura en importadores SII',items:[
    {tipo:'nuevo',txt:'Compras y Ventas simulan el asiento de cada DTE seleccionado antes de guardar.'},
    {tipo:'seguridad',txt:'Si un documento produciría un comprobante descuadrado, el importador muestra tipo, folio y diferencia y bloquea Aplicar.'},
    {tipo:'arreglo',txt:'La cuadratura se valida nuevamente al confirmar, evitando guardar datos modificados después de la previsualización.'},
    {tipo:'cambio',txt:'El usuario puede corregir la clasificación o excluir el documento problemático sin cerrar el importador.'}
  ]},
  {version:'V2.16.11',fecha:'12-09-2026',titulo:'Identificación de comprobantes descuadrados',items:[
    {tipo:'arreglo',txt:'La alerta de Comprobantes muestra directamente el número de cada comprobante descuadrado.'},
    {tipo:'cambio',txt:'Cuando existen varios descuadres, los primeros números aparecen como etiquetas legibles y adaptadas a móvil.'},
    {tipo:'arreglo',txt:'La alerta del Libro Diario también identifica los números antes del detalle contable.'}
  ]},
  {version:'V2.16.10',fecha:'12-09-2026',titulo:'Boletas de honorarios con y sin retención',items:[
    {tipo:'nuevo',txt:'El comprobante de honorarios permite elegir Con retención o Sin retención (no afecta/exenta).'},
    {tipo:'cambio',txt:'Las boletas sin retención llevan el monto bruto íntegro a Honorarios por pagar y no generan movimiento en Retenciones por pagar.'},
    {tipo:'arreglo',txt:'El auxiliar, los totales, el pago y los reportes respetan el tratamiento tributario seleccionado en cada boleta.'},
    {tipo:'cambio',txt:'Las boletas históricas mantienen el tratamiento Con retención para conservar compatibilidad contable.'}
  ]},
  {version:'V2.16.9',fecha:'12-09-2026',titulo:'Honorarios integrados en Comprobantes y Ventas móvil',items:[
    {tipo:'nuevo',txt:'Comprobantes incorpora Nueva boleta de honorarios con prestador, folio, bruto, cuenta de gasto, centro de costo y cálculo automático de retención.'},
    {tipo:'nuevo',txt:'Registrar pago ahora crea un comprobante de egreso separado y vinculado; las boletas pendientes pueden pagarse posteriormente desde el auxiliar.'},
    {tipo:'cambio',txt:'Honorarios pasa a ser un libro auxiliar de consulta con estados Pendiente/Pagada y acciones Editar, Pagar y Anular.'},
    {tipo:'arreglo',txt:'El importador SII de Ventas muestra sus documentos como fichas desplazables en móvil, evitando que el listado desaparezca.'}
  ]},
  {version:'V2.16.8',fecha:'12-09-2026',titulo:'Listado móvil del importador SII Compras',items:[
    {tipo:'arreglo',txt:'El listado de documentos ya no se comprime hasta desaparecer cuando el archivo RCV contiene muchas compras.'},
    {tipo:'cambio',txt:'En teléfonos, cada DTE se muestra como una ficha legible con proveedor, documento, montos, cuenta y centro de costo.'},
    {tipo:'cambio',txt:'El listado dispone de desplazamiento vertical táctil independiente, manteniendo visibles los controles y botones del importador.'}
  ]},
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
