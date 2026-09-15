// changelog.js — Historial de versiones de la aplicación
//
// Este módulo es la FUENTE ÚNICA de la versión: el badge del encabezado se
// rellena desde aquí al arrancar, así que al publicar una versión nueva solo
// hay que tocar este archivo (y el `?v=` del importmap en index.html, que es
// cache-busting del navegador y no puede leerse desde JS).
//
// Módulo puro: sin imports, para que cualquiera pueda leer APP_VERSION sin
// arrastrar dependencias ni arriesgar ciclos.

const APP_VERSION='v2026.09.15-1200';

// Historial, de la más reciente a la más antigua.
//   tipo: 'nuevo' | 'arreglo' | 'cambio'
// Cada entrada describe QUÉ cambia para quien usa el sistema, no qué función se
// tocó: esto lo lee un contador, no quien programa.
const CHANGELOG=[
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
