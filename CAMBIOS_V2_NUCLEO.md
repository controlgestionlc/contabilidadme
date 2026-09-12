# Núcleo contable V2 — cambios aplicados

## Implementado en esta entrega

- Nuevo `js/motor-contable.js` como punto único para traducir ventas y compras a movimientos contables.
- `reportes.js` deja de contener reglas de ventas/compras y consume el motor.
- Corrección de compras exentas: la distribución V2 exige `Neto + Exento`; documentos históricos que distribuían sólo Neto se compatibilizan en el motor.
- Tratamiento específico DTE 45/46 mediante `tributacionCompra()`, incluyendo IVA retenido y detección de si el total informado incluye o no la retención.
- Los pagos nuevos usan el asiento como registro maestro. El asiento guarda referencias `documentos[]`; `doc.pagos[]` se conserva sólo como fallback histórico.
- Auxiliares y saldos de pagos leen primero desde asientos.
- Anulación lógica de ventas/compras individuales y masivas en vez de borrado físico.
- Cierre: ya no se puede generar un segundo asiento de cierre; queda tipado como `tipo:'cierre'`.
- `syncAllToRemote()` ahora usa escritura versionada y reporta fallos.
- `storage.delete()` pasa por control transaccional de revisión antes de borrar.
- `storage.set()` informa `ok:false` ante bloqueo/conflicto/fallo remoto para que los módulos críticos puedan detener la operación.
- Firestore: `_empresas` y metadatos globales administrativos sólo pueden ser escritos/eliminados por admin; `_empresaActiva:<email>` sigue siendo propiedad del usuario.
- Firestore: lectura de `empresas_acl` limitada a admin, dueño o miembro de esa empresa.

## Compatibilidad

Esta versión no obliga a migrar de inmediato los datos históricos. Los documentos antiguos siguen funcionando; las nuevas operaciones adoptan gradualmente el modelo V2.

## Pendiente para una V2 completa

- Persistir el asiento de reconocimiento de cada venta/compra como registro maestro y migrar históricos (hoy el motor central todavía los materializa al generar el Diario).
- Migrar honorarios al esquema Reconocimiento → Cuenta por pagar → Retención → Pago.
- Bloqueo transversal de todo el ejercicio cerrado y flujo formal de reapertura con permiso/motivo/auditoría.
- Eliminar los `catch(()=>{})` restantes en módulos no críticos y homologar todos los guardados al contrato `{ok,error}`.
- Sustituir el catálogo global `_empresas` por documentos de empresa consultables por ACL, evitando exponer metadatos del catálogo completo.
- Auditoría de integridad visible en UI (Diario/Mayor/Auxiliares/IVA/F29/Activos/Remuneraciones).
- Separación contable/tributaria completa en activos fijos y enriquecimiento de reglas del PDC.

# Etapa 2 — Asiento maestro, cierre e integridad

## Implementado
- Nuevo `js/contabilidad-v2.js` como capa de orquestación del núcleo V2.
- Ventas y compras nuevas/editadas crean o actualizan un asiento persistido `tipo:'documento'` con relación `fuente + docId`.
- `genDiario()` usa el asiento persistido como maestro y sólo genera asientos en memoria para documentos históricos aún no migrados.
- Guardado coordinado documento/asiento con reversión lógica ante fallo de persistencia.
- Anulación lógica coordinada de documento + asiento automático.
- Migración explícita de documentos históricos a asientos maestros.
- Bloqueo de ventas, compras, pagos/cobros y asientos manuales cuando existe cierre activo del ejercicio.
- El cierre sólo se considera realizado después de persistirse correctamente; si falla, se revierte en memoria.
- Nuevo `js/integridad.js` y sección “Auditoría de Integridad”.
- Controles iniciales de integridad:
  - asiento descuadrado;
  - documento activo sin asiento persistido;
  - asiento automático sin documento activo;
  - más de un cierre activo;
  - movimientos posteriores al cierre;
  - más de un asiento automático activo para el mismo documento.

## Compatibilidad
- Los documentos históricos que aún no se migran siguen apareciendo en Diario mediante `origen:'legado-auto'`.
- Una vez migrados, `genDiario()` deja de regenerarlos y consume el asiento almacenado en `S.asientos`.
- `pagos[]` históricos siguen siendo fallback, mientras los pagos nuevos mantienen el asiento como registro maestro.

## Pendientes siguientes
- Sustituir los restantes `catch(()=>{})` de operaciones críticas (34 ocurrencias detectadas; varias son de configuración/autenticación y otras contables).
- Reapertura formal de ejercicio con autorización, motivo y auditoría.
- Bloqueo transversal de importaciones, remuneraciones, activos, provisiones, centros de costo y comprobantes cuando el ejercicio está cerrado.
- Llevar honorarios al modelo reconocimiento → obligación → pago.
- Reglas enriquecidas del Plan de Cuentas.
- Auditoría auxiliar vs mayor, IVA/F29, bancos, activos/depreciación y remuneraciones.
- Operación multi-documento verdaderamente atómica en Firestore (batch/transaction de varias claves) como etapa posterior al rollback lógico actual.

## V2.3 — Cierre productivo, persistencia crítica y auditoría ampliada

### Cierre / reapertura
- Se incorporó `reabrirEjercicio()` con autorización exclusiva de administrador.
- La reapertura exige motivo obligatorio (mínimo 10 caracteres) y confirmación explícita.
- El asiento de cierre no se elimina: queda `anulado`, `estado:'reabierto'` y conserva fecha, usuario y motivo de reapertura.
- Cierre y reapertura se incorporan al `audit_log`.
- Después de reabrir se pueden efectuar correcciones y generar un nuevo cierre; el cierre anterior permanece trazable.

### Persistencia crítica de asientos
- Nueva puerta común `persistirAsientosCritico(mutacion)` en `contabilidad-v2.js`.
- Mantiene snapshot de `S.asientos`, guarda mediante `storage.set()` y restaura memoria si la persistencia falla.
- Se integró inicialmente en:
  - provisión de incobrables;
  - provisión de feriado;
  - depreciación de activos fijos;
  - remuneraciones;
  - compensación mensual de IVA;
  - pago de F29;
  - anulación/reactivación de asientos manuales;
  - eliminación de asientos manuales.
- Si la persistencia falla, la interfaz ya no debe considerar contabilizada la operación.

### Protección de asientos controlados
- `eliminarAsiento()` ya no permite eliminar físicamente asientos `documento`, `pago` o `cierre` desde el editor general.
- Esos asientos deben anularse/revertirse desde su flujo de origen, conservando trazabilidad.

### Auditoría de Integridad V2 ampliada
Además de los controles de V2.2, ahora verifica:
- movimientos de Clientes (1104001) sin RUT;
- movimientos de Proveedores (2102001) sin RUT;
- diferencia potencial Auxiliar vs Mayor causada por líneas sin identificación;
- IVA de cada venta contra el IVA de su asiento maestro;
- IVA de cada compra contra el IVA de su asiento maestro;
- pagos que apuntan a documentos inexistentes o anulados;
- duplicados de compensación IVA por período;
- duplicados de pago F29 por período;
- resumen por severidad crítica/alta en la pantalla de Auditoría de Integridad.

### Bloqueo de ejercicio ampliado
Con ejercicio cerrado se bloqueó también la generación de:
- provisiones de cierre;
- depreciación;
- asientos de remuneraciones;
- compensación IVA;
- pago F29.

### Auditoría de actividad
La política de `audit_log` ahora incluye:
- cierre de ejercicio;
- reapertura de ejercicio;
- compensación IVA;
- pago F29.

### Pendiente posterior a V2.3
Todavía existen rutas antiguas de persistencia silenciosa, principalmente en centros de costo, comprobantes, configuración, conciliación y algunos flujos auxiliares. Deben migrarse progresivamente a la misma política `{ok:true|false}` + rollback. También queda pendiente separar contabilidad financiera/tributaria de activos y parametrizar reglas de comportamiento del Plan de Cuentas.

## V2.4 — PDC inteligente, activo contable/tributario y preparación de migración

### Infraestructura preparada para nueva cuenta
- La configuración web de Firebase se movió a `js/firebase-config.js`.
- El resto de la aplicación deja de depender directamente del `projectId` actual.
- Para migrar a otro proyecto será necesario reemplazar la configuración de ese archivo, publicar `firestore.rules`, habilitar Authentication y crear/autorizar el primer administrador.
- Se agregó `MIGRACION_FIREBASE_GITHUB.md` con el procedimiento de migración previsto.

### Plan de Cuentas como fuente de reglas
- Nuevo `js/pdc-reglas.js`.
- Cada cuenta puede resolver/registra: `id`, `codigo`, `nombre`, `tipo`, `naturaleza`, `nivel`, `aceptaMovimientos`, `requiereAuxiliar`, `tipoAuxiliar`, `aceptaCentroCosto`, `tipoIVA`, `esCuentaTributaria`, `permiteAsientoManual`, `permiteCierre`, `permiteApertura` y `activa`.
- Para planes históricos estas reglas se infieren automáticamente, por lo que no se exige recrear el PDC.
- PDC sube a versión 3 y normaliza las cuentas al cargar/guardar.
- Los asientos manuales validan PDC antes de persistir.
- Los asientos automáticos de ventas/compras también validan PDC antes de convertirse en asiento maestro.
- La vista del PDC muestra reglas relevantes por cuenta.

### Activo fijo: separación financiera / tributaria
- El modelo incorpora `valorContable`, `residualContable`, `vidaContable`, `metodoContable`.
- Incorpora además `valorTributario`, `residualTributario`, `vidaTributaria`, `metodoTributario`.
- Los activos históricos siguen siendo legibles mediante fallback de `valor`, `residual`, `vida`, `metodo`.
- El asiento anual de depreciación usa exclusivamente depreciación contable.
- La interfaz muestra depreciación contable, tributaria y diferencia temporaria acumulada.
- Las capitalizaciones desde Centros de Costo crean el activo con ambas bases separadas.

### Auditoría ampliada
- Detecta movimientos en cuentas inexistentes, inactivas o agrupadoras.
- Detecta cuentas que exigen auxiliar y no tienen RUT.
- Detecta centros de costo usados en cuentas que no los admiten.
- Compara IVA mensual de documentos contra IVA de asientos maestros.
- Marca activos aún no migrados al modelo contable/tributario separado.

### Persistencia / trazabilidad
- La ruta de eliminación desde Comprobantes dejó de borrar físicamente ventas/compras y ahora usa anulación lógica coordinada con su asiento.
- Asociación y desasociación de notas de crédito/débito usa rollback ante fallo de persistencia.
- Cierre mensual de centros de costo, reversa y capitalización usan persistencia crítica.
- Los `catch(()=>{})` silenciosos bajaron de 24 a 15 en esta etapa.

### Pendiente posterior a V2.4
- Terminar de eliminar persistencias silenciosas en editor legado de Comprobantes, configuración, fichas auxiliares y preferencias.
- Migrar Honorarios al flujo reconocimiento → obligación → retención → pago.
- Incorporar diferencias temporarias/permanentes de activo fijo a Renta.
- Completar conciliación F29 contra códigos tributarios/retenciones para todos los DTE especiales.
- Ejecutar la migración al nuevo GitHub/Firebase una vez disponibles los identificadores del nuevo proyecto.

### Corrección adicional de importadores SII en V2.4
- La importación masiva de Ventas ahora crea el asiento maestro de cada documento y persiste ventas + asientos de forma coordinada.
- La importación/sobrescritura de Compras deja de borrar físicamente documentos del período.
- En modo sobrescribir, los documentos ausentes del nuevo RCV se anulan y sus asientos se anulan; los documentos que continúan conservan su `id`, correlativo y folio.
- Los documentos reemplazados guardan una instantánea `versionAnterior` con sus valores principales.
- Si falla la persistencia de documentos o asientos durante una importación, se restaura el estado anterior en memoria y se intenta restaurar storage.

## V2.5 — Honorarios y motor contable
- Honorarios dejan de contabilizarse mensualmente contra Banco.
- Cada boleta genera un asiento maestro individual: Honorarios profesionales / Retención 2ª categoría / Honorarios por pagar.
- Pago al contado genera un segundo asiento independiente: Honorarios por pagar / Banco-Caja.
- Registros históricos sin asiento maestro se muestran como pendientes, sin presumir pago.
- Anulación lógica de honorarios y sus asientos; no se eliminan físicamente.
- F29 excluye honorarios anulados al calcular retención código 151.
- Auditoría valida honorarios sin asiento, pagos faltantes y retenciones inconsistentes.
- Pagos/cobros validan reglas del Plan de Cuentas antes de persistirse.


## V2.6 — DTE 45/46 + IVA retenido + F29

- Se creó una semántica canónica para facturas de compra DTE 45/46.
- El motor ya no depende de la interpretación del campo `total` del RCV.
- `totalDocumento = neto + exento + otros impuestos económicos + IVA`.
- `totalProveedor = totalDocumento - ivaRetenido`.
- La retención se guarda explícitamente en `ivaRetenido`; el total original del RCV puede conservarse como `totalSII`.
- DTE 45 y DTE 46 reciben el mismo tratamiento tributario en el motor y F29.
- El IVA retenido se separó de IVA Débito Fiscal: se contabiliza en `2103005` con `tributo:'iva_retenido'`.
- La compensación F29 salda por separado IVA débito de ventas (`2103003`) e IVA retenido de facturas de compra (`2103005`).
- La importación SII evita interpretar la retención como "otros impuestos" en DTE 45/46.
- Compras manuales DTE 45/46 aceptan como `total` tanto el total bruto del documento como el monto pagadero al proveedor, validando ambos contra la normalización del motor.
- Auditoría de Integridad valida retención, saldo proveedor y totales ambiguos de DTE 45/46.

- Se añadió automáticamente la cuenta de sistema `2103005 IVA RETENIDO FACTURAS DE COMPRA` sin reemplazar el plan de cuentas existente.

## V2.7 — IVA recuperable, no recuperable, proporcional y activo fijo

- Se agregó una clasificación única de IVA de compras en `motor-contable.js` mediante `clasificacionIVACompra()`.
- `iva` continúa representando el IVA total del documento; el motor deriva por separado `ivaRecuperable`, `ivaNoRecuperable` e `ivaActivoFijo`.
- En compras manuales se agregó el selector `Tratamiento IVA`: 100% recuperable, no recuperable, proporcional o activo fijo.
- En tratamiento proporcional se informa el porcentaje efectivamente recuperable; el saldo se incorpora al costo/gasto.
- El IVA no recuperable se distribuye proporcionalmente sobre las mismas cuentas y centros de costo de la base económica, evitando llevarlo erróneamente a Crédito Fiscal.
- Se agregó la cuenta de sistema `1108008 IVA CRÉDITO FISCAL ACTIVO FIJO`; se mantiene `1108007` exclusivamente para REMANENTE CRÉDITO FISCAL del F29.
- Las importaciones RCV leen por separado `IVA recuperable` e `IVA no recuperable` cuando esas columnas existen y conservan `IVA uso común` / `IVA activo fijo` cuando vienen informados.
- El F29 utiliza sólo IVA recuperable como crédito fiscal. El IVA no recuperable se muestra como importe incorporado al costo y no reduce el débito fiscal.
- La compensación mensual salda separadamente `1108002 IVA CRÉDITO FISCAL` y `1108008 IVA CRÉDITO FISCAL ACTIVO FIJO`.
- Auditoría de Integridad valida crédito fiscal general, crédito de activo fijo, clasificación total de IVA e incorporación del IVA no recuperable al costo.
- Compatibilidad histórica: documentos sin clasificación explícita siguen interpretándose como 100% recuperables, conservando el comportamiento anterior hasta que sean editados o importados nuevamente con detalle tributario.

## V2.8 — Impuestos adicionales y gasto rechazado por documento

- `otrosImpuestos` deja de ser un monto contable opaco. Se agregó `clasificacionOtrosImpuestosCompra()` en el motor.
- Compatibilidad histórica: si un documento antiguo sólo tiene `otrosImpuestos`, se interpreta por defecto como impuesto no recuperable incorporado al costo.
- Compras manuales permiten elegir para Otros Impuestos: `Costo / gasto` o `Impuesto recuperable`.
- Los impuestos adicionales recuperables se contabilizan en `1108006 OTROS IMPUESTOS POR RECUPERAR`, con la marca `tributo:'impuesto_adicional_recuperable'`.
- Los impuestos no recuperables continúan incorporándose a las mismas cuentas de costo/gasto/activo distribuidas por el documento.
- Se incorporó `otrosImpuestosDetalle[]` para permitir ampliar en versiones posteriores a múltiples impuestos y códigos F29 sin volver a cambiar la arquitectura.
- Cada línea de distribución de compras puede marcarse tributariamente como `aceptado` o `rechazado`.
- El asiento financiero no cambia por marcar un gasto rechazado: el movimiento conserva `tributario:'gasto_rechazado'` para la conciliación tributaria.
- Renta agrega automáticamente a la RLI los movimientos marcados como gasto rechazado, sin obligar a marcar la cuenta completa. Si la cuenta ya está marcada manualmente como rechazada, evita duplicar el agregado.
- Auditoría de Integridad valida la clasificación de otros impuestos, la cuenta `1108006` y la conservación de marcas de gasto rechazado.
- Backup Excel conserva `tratamientoOtrosImpuestos`, `otrosImpuestosDetalleJSON` y el tratamiento tributario dentro de `distJSON`.


## V2.9 — Activo fijo financiero / tributario y conciliación de Renta

- La ficha de activo fijo puede vincularse opcionalmente a una compra de origen registrada como inversión, conservando trazabilidad sin duplicar el asiento de adquisición.
- Se separan explícitamente valor, residual, vida útil, método y fecha de inicio para la base contable y la base tributaria.
- Las fichas V2.9 prorratean depreciación por meses desde la fecha de inicio configurada en cada ámbito; los activos históricos sin esas fechas mantienen el algoritmo legado para no alterar ejercicios cerrados.
- El asiento financiero anual usa exclusivamente depreciación contable y pasa a ser único por ejercicio (`dep_<año>`).
- El asiento de depreciación conserva `detalleActivos[]` con activo, monto y cuentas involucradas para auditoría.
- Renta concilia siempre depreciación financiera vs. tributaria cuando difieren. En regímenes con depreciación instantánea utiliza el valor tributario de las adquisiciones del ejercicio; en los demás utiliza la cuota tributaria configurada por ficha.
- La pestaña RLI muestra un resumen de depreciación financiera, tributaria y diferencia temporaria del ejercicio.
- Auditoría detecta compras de origen inexistentes, asientos de depreciación duplicados, depreciaciones sin detalle V2.9, activos inexistentes referenciados y diferencias entre el detalle y el gasto contabilizado.
- Backup Excel conserva las bases contable/tributaria, fechas de inicio y vínculo con la compra de origen.


## V2.10 — Persistencia atómica, bloqueos y cierre operacional

- `storage.set()` ya no adelanta el nuevo valor a `localStorage` cuando Firestore está activo: primero confirma la escritura remota y sólo entonces actualiza la copia local.
- Se agregó `storage.setMany()` para guardar varias claves de una empresa dentro de una única transacción de Firestore, con control de revisión por documento. Se usa para hechos económicos que afectan simultáneamente libro y asientos.
- `guardarDocumentoContabilizado()` y `anularDocumentoContabilizado()` usan persistencia multi-clave atómica.
- Importaciones SII de compras y ventas y el módulo de Honorarios guardan documento + asiento como una sola unidad.
- `saveAll()` usa la misma transacción para el conjunto principal del ejercicio y verifica el resultado antes de informar éxito.
- Anulación masiva de compras/ventas anula también el asiento maestro asociado y revierte memoria si falla la persistencia.
- Cambio masivo de forma de pago en Ventas actualiza el asiento maestro y queda bloqueado si el ejercicio está cerrado.
- La conversión de comprobante automático a manual anula el asiento automático persistido para impedir doble contabilización.
- Ediciones desde Comprobantes verifican el resultado de persistencia y hacen rollback en memoria ante falla.
- El cierre anual ejecuta Auditoría de Integridad y se niega a cerrar si existen hallazgos críticos.
- Auditoría de Integridad incluye claves bloqueadas por fallas de lectura remota.
- Persistencias de conciliación, previsional, indicadores y parámetros de remuneraciones dejan de fallar silenciosamente.

## V2.11 — F29 conciliable, NC/ND y arrastre de crédito

- Se corrigió la presentación del F29 para respetar la estructura real de códigos del formulario: facturas emitidas 503/502, boletas 110/111, notas de débito 512/513, notas de crédito 509/510 y total débitos 538.
- Compras separa facturas del giro 519/520, activo fijo 524/525, notas de crédito 527/528, notas de débito 531/532, compras afectas sin derecho a crédito 564/521 y total créditos 537.
- El código 504 arrastra el remanente del período anterior y el 77 deja el remanente para el período siguiente.
- La determinación mantiene separada la retención por cambio de sujeto (código 39) respecto del IVA débito ordinario.
- `calcularF29Anual()` conserva un mapa `codigos` y detalle por tipo de DTE, permitiendo explicar el total en lugar de mostrar sólo agregados netos.
- Notas de Crédito y Débito creadas manualmente exigen folio del documento referenciado y pueden conservar tipo DTE, fecha y razón de referencia.
- Auditoría detecta notas históricas sin referencia y referencias con fecha posterior a la nota.
- Se corrigió el control mensual IVA documento↔asiento: ya no usa valores absolutos; respeta el signo de NC/ND para evitar falsos descuadres.
- Retenciones de honorarios en F29 usan la retención guardada en cada boleta cuando existe, evitando recalcular documentos históricos con una tasa distinta.
- Backup Excel conserva referencias de NC/ND y los campos de clasificación de IVA de compras incorporados en V2.7.

## V2.11.1 — Fecha documental vs período contable RCV

- El importador de Compras SII nunca modifica la fecha de emisión del DTE.
- Se agregan `periodoContable`, `fechaContabilizacion` y `origenRegistro:'RCV'` a compras importadas.
- Si la fecha del DTE pertenece al mismo mes del RCV, el asiento usa la fecha original.
- Si la fecha del DTE pertenece a otro mes, el asiento se fecha al último día del período RCV seleccionado.
- El F29 de compras usa `periodoContable`, no el mes de la fecha documental.
- La sobrescritura del RCV concilia documentos por período contable; no por fecha de emisión.
- Los correlativos mensuales del Libro de Compras usan el período contable/RCV.
- El resumen mensual y el selector mensual del Libro de Compras usan el período contable; Desde/Hasta siguen filtrando la fecha documental.
- La exportación tributaria mensual de compras usa el período contable.
- La auditoría verifica que el asiento maestro de una compra RCV esté dentro de su período contable.
- Al reimportar un documento que antes había sido normalizado al cierre de mes, la fecha original del RCV vuelve a quedar almacenada en `fecha`.
- Backup Excel incorpora los nuevos campos de período/fecha contable.

## V2.12 — F29 histórico: calculado vs declarado

- Se agrega persistencia anual `f29-declaraciones-AAAA` por empresa.
- Cada período conserva por separado el cálculo dinámico y los valores efectivamente declarados al SII.
- Estados `borrador` y `presentado`; al presentar, los valores declarados quedan bloqueados.
- Reapertura formal con motivo mínimo de 10 caracteres y registro en audit log.
- Conciliación visual código a código entre calculado y declarado para 538, 39, 504, 537, 77, 89, 62, 151 y 91.
- El remanente del período siguiente usa el código 77 de la declaración presentada, no un recálculo posterior de documentos históricos.
- El asiento de pago F29 propone códigos 89, 62, 151 y 39 desde la declaración presentada cuando existe.
- La retención IVA DTE 45/46 del pago F29 usa `periodoContable` del RCV, no el mes de la fecha documental.
- Las declaraciones F29 forman parte de las claves sincronizadas al iniciar y del disparador de respaldo.
- La fecha original del DTE de compras sigue intacta; `periodoContable` gobierna Libro de Compras/F29 y `fechaContabilizacion` gobierna el asiento.

## V2.13 — Conciliación F29 ↔ asientos ↔ pago ↔ Mayor

- Nueva conciliación visible por período entre F29 calculado/declarado y los asientos activos asociados al mismo `periodoIVA`.
- Control específico de IVA a pagar (cód. 89), PPM (cód. 62), retención de honorarios (cód. 151) y total núcleo (cód. 91).
- Los asientos nuevos de compensación y pago F29 guardan metadata `f29Detalle` con componentes, cuentas, período y snapshot declarado/calculado.
- Los asientos históricos siguen siendo conciliables mediante fallback por descripciones y códigos F29.
- La conciliación avisa por múltiples asientos activos del mismo período y por diferencias entre declaración, provisión y pago.
- La retención de honorarios se contrasta además contra los asientos maestros de reconocimiento de honorarios.
- Corrección del PPM: si fue provisionado en el asiento de compensación, el pago cancela automáticamente la provisión; si no fue provisionado, el pago reconoce directamente el activo PPM. Se evita duplicar el activo por una segunda contabilización.
- Se mantiene la separación V2.11.1 entre fecha original del DTE y `periodoContable` para compras importadas desde RCV.


## V2.13.1 — Login obligatorio al reiniciar la app

- Firebase Auth queda forzado a `Persistence.SESSION`; ya no se permite persistencia `LOCAL` desde la interfaz.
- Una marca en `sessionStorage` distingue un reload de una nueva ejecución.
- Al iniciar una nueva ejecución se cierra cualquier credencial Firebase que pudiera haberse restaurado desde configuraciones antiguas.
- Cerrar la app/navegador y volver a abrir obliga a autenticarse nuevamente.
- Un simple refresco dentro de la misma ejecución conserva la sesión para no interrumpir el trabajo.
- Se eliminó de Sistema el selector «Mantener sesión / Pedir contraseña» y se reemplazó por un indicador de política obligatoria.
- Se mantienen `sesionPersistente()` y `setSesionPersistente()` sólo como compatibilidad; ya no pueden activar persistencia local.

## V2.14 — Pagos parciales F29 y saldo pendiente

- Los pagos F29 dejan de considerarse duplicados por existir más de uno en el mismo período: múltiples asientos activos representan pagos parciales válidos.
- Cada nuevo pago propone sólo el saldo aún no pagado por concepto (IVA cód. 89, PPM cód. 62, retención honorarios cód. 151 y demás líneas configuradas).
- Se bloquea un nuevo pago cuando el monto ingresado excede el saldo pendiente del concepto.
- La conciliación mensual incorpora estados `BORRADOR`, `PENDIENTE PAGO`, `PAGO PARCIAL`, `CONCILIADO` y `REVISAR`.
- La conciliación muestra declarado/base, contabilidad de origen, provisión, pago acumulado, saldo pendiente y eventual sobrepago.
- Se agrega historial de pagos del período con asiento, fecha y desglose por IVA, PPM, honorarios y total.
- Los nuevos asientos de pago guardan `f29Detalle.version=14`, `pagoNro`, componentes, `totalTributos` y `totalPagado`.
- La Auditoría de Integridad ya no marca como duplicado un período por tener varios pagos F29; mantiene el control de compensación única y advierte pagos legacy sin detalle estructurado.
- Al registrar un pago se limpian los importes temporales para que el siguiente abono vuelva a proponer el saldo real restante.


### V2.15 — Hardening Productivo
Se incorpora cierre contable mensual separado del cierre anual. El bloqueo se aplica por fecha de contabilización: en compras RCV se usa `periodoContable/fechaContabilizacion` y se conserva la fecha documental real. La Auditoría de Integridad incorpora un panel de preparación productiva y una suite automática mínima. El respaldo Excel conserva desde esta versión el objeto completo de los asientos y los cierres mensuales. El semáforo permanece amarillo hasta ejecutar pruebas operacionales reales de concurrencia Firebase en dos equipos y un simulacro de restauración.


### V2.15.1 — Certificación operacional
Se incorpora un protocolo guiado para probar concurrencia real con dos dispositivos contra Firebase sin tocar libros contables. La prueba crea un registro diagnóstico aislado, hace que ambos equipos escriban desde la misma revisión y sólo certifica éxito si las dos marcas sobreviven. También se incorpora un simulacro de restauración que genera y relee el respaldo Excel en memoria, validando hojas, conteos y metadata de asientos sin modificar los datos activos. Los resultados aprobados se guardan por empresa/año y alimentan el semáforo de preparación productiva.


## V2.15.2 — RCV idempotente y control de cambios

- Reimportar un archivo RCV idéntico no modifica libros, asientos ni marcas de tiempo.
- Compras y ventas clasifican cada DTE como **Nuevo**, **Sin cambios**, **Cambio SII** o **Ya en asiento manual**.
- Los cambios del SII requieren confirmación explícita y conservan un historial RCV con snapshot anterior y campos modificados.
- La conciliación completa de Compras sólo anula documentos activos ausentes del archivo; repetir la misma conciliación es un no-op.
- Ventas conserva siempre la fecha documental del DTE y valida cierres mensuales por esa fecha.
- El respaldo Excel conserva el objeto completo de Compras y Ventas, incluida la metadata RCV.
- El panel de Preparación Productiva prueba la idempotencia y la detección de cambios económicos.

## V2.15.3 — Correlativo contable definitivo + auditoría estructurada

### Numeración contable
- Cada registro maestro de `S.asientos` recibe `numeroContable`, único por empresa y ejercicio.
- La asignación usa una secuencia reservada dentro de una transacción Firestore (`reservarCorrelativos`), por lo que dos equipos no pueden recibir el mismo número.
- Los números no se reutilizan: si una persistencia falla después de reservar un número, puede quedar un salto, pero jamás se reasigna ese correlativo.
- Los registros históricos sin `numeroContable` se numeran al iniciar la versión, en orden fecha/creación/id.
- Si no hay conexión Firebase y existen asientos sin número definitivo, no se inventan correlativos locales; la operación queda bloqueada hasta recuperar conexión.
- `Auditoría de Integridad` y `Preparación Productiva` marcan como crítico cualquier asiento sin número definitivo o con número duplicado.

### Auditoría de cambios
- Nuevo `logCambio()` estructurado e inmutable en `audit_log`.
- Conserva entidad, id, número contable, usuario, fecha/hora, campos modificados, hash del estado anterior/nuevo y snapshots antes/después cuando su tamaño es seguro.
- Se incorporó en altas/ediciones/anulaciones/eliminaciones de asientos manuales, documentos contabilizados, cierres mensuales, cierre/reapertura anual y cambios RCV sobre documentos existentes.
- Las importaciones RCV guardan además una traza de lote con período, archivo y conteos de nuevos/cambiados/sin cambios.
- La vista de Auditoría muestra entidad, número contable y campos modificados.
- Reglas Firestore endurecidas: un usuario no puede crear una auditoría atribuyéndola a otro correo ni a una empresa ajena; `audit_log` continúa siendo create-only.

## V2.15.4 — Snapshots productivos y recuperación ante desastre

- Nuevo módulo `recovery.js` con puntos de recuperación independientes del respaldo Excel.
- Se conservan hasta 6 snapshots por empresa/año. Cada snapshot guarda las claves reales como documentos separados para no concentrar toda la base en un único documento Firestore.
- Cada clave queda registrada en un manifiesto con tamaño y SHA-256; una restauración no comienza si falta un fragmento o si el hash no coincide.
- Snapshot automático como máximo cada 6 horas de actividad, con debounce posterior a guardados normales.
- Compras RCV, Ventas RCV y la restauración Excel intentan crear un snapshot previo a la operación masiva.
- La restauración de emergencia exige rol administrador, doble confirmación y Firebase disponible.
- Antes de cualquier rollback se crea automáticamente otro snapshot del estado actual, por lo que también existe un camino para deshacer la propia restauración.
- La restauración refresca las revisiones de destino y utiliza `storage.setMany()` para persistir todas las claves recuperadas de forma coordinada.
- El panel Preparación Productiva incorpora un control de snapshot vigente y una sección para crear, verificar y restaurar puntos de recuperación.
- Los snapshots de recuperación no se incluyen dentro de otros snapshots, evitando crecimiento recursivo.
- La certificación Excel de V2.15.1 se mantiene: snapshot Firestore y backup Excel son capas distintas y complementarias.

## V2.15.5 — Puerta central obligatoria de validación contable

- Nuevo `asiento-validacion.js`: toda mutación de asientos valida estructura, cuadratura, reglas PDC, centros de costo y referencias documentales antes de persistir.
- `storage.set()` y `storage.setMany()` ejecutan una guardia adicional sobre `asientos-AAAA`, por lo que las rutas antiguas que escribían directamente ya no pueden saltarse la validación del núcleo.
- La transacción Firebase vuelve a validar el valor definitivo después de una posible fusión por concurrencia y antes del `commit`.
- Se bloquea crear, editar, anular, eliminar o trasladar un asiento cuya fecha anterior o nueva pertenezca a un período mensual cerrado. El asiento anual de cierre mantiene su ruta formal de cierre/reapertura.
- Reglas mínimas obligatorias: fecha válida, al menos dos líneas, ningún monto negativo o línea cero, una sola columna Debe/Haber por línea, cuadratura, cuenta existente/activa/no agrupadora, auxiliares requeridos y referencias documentales coherentes.
- El Plan de Cuentas incorpora `requiereCentroCosto`. Cuando una cuenta se marca como **CC obligatorio**, ninguna contabilización puede persistir sin un centro existente.
- Pagos validan que cada `docId` exista y no esté anulado. Asientos maestros y referencias manuales validan fuente, documento, DTE y folio cuando corresponda.
- Recuperación ante desastre conserva un bypass explícito y acotado sólo durante la restauración administrativa de un snapshot ya verificado por hash y con punto de retorno creado.
- Preparación Productiva incluye una prueba de la puerta central para comprobar aceptación de un asiento válido y rechazo de un asiento inválido.

## V2.15.6 — Regresión contable integral

Se agregó `js/regresion-contable.js`, una batería de pruebas aisladas en memoria para certificar los principales circuitos antes del piloto. Cubre ventas afectas/exentas, NC y ND, compras mixtas, IVA no recuperable/proporcional/activo fijo, DTE 45/46, fecha documental vs período RCV, honorarios, pagos parciales y auxiliares, F29 con remanente declarado, depreciación financiera/tributaria, remuneraciones y controles de cierre.

La suite incluye una prueba transversal que agrega los movimientos de un escenario sintético y exige **Diario = Mayor = Balance**. También prueba la puerta central de asientos y el bloqueo de un período mensual cerrado. Los datos productivos se fotografían antes de ejecutar la suite y se restauran en un bloque `finally`, por lo que la prueba no crea documentos ni asientos reales.

El panel de Preparación Productiva muestra cada escenario por área y la regresión completa pasa a ser un criterio bloqueante: si una prueba falla, el sistema no se declara listo para productivo.

## V2.15.7 — Piloto controlado / Preproducción

- Nuevo módulo `preproduccion.js` con estado operacional por empresa y ejercicio: `prueba` o `produccion`.
- El encabezado muestra permanentemente el entorno activo: `PRUEBA · BLOQUEADA`, `PRUEBA · ESCRITURA` o `PRODUCCIÓN`.
- En modo PRUEBA las escrituras de negocio quedan bloqueadas por defecto en cada nueva sesión. Un administrador puede habilitarlas sólo para esa sesión mediante confirmación `HABILITAR PRUEBAS`.
- El cierre de la app/navegador elimina esa autorización porque se almacena únicamente en `sessionStorage`.
- Activar PRODUCCIÓN exige: Preparación Productiva completamente verde, checklist manual completo y confirmación exacta `ACTIVAR PRODUCCION`.
- Checklist de puesta en marcha: ficha tributaria, PDC, saldos de apertura, RCV piloto, usuarios/roles y respaldo externo.
- El paso a PRODUCCIÓN y el retorno a PRUEBA quedan auditados. Volver a PRUEBA exige motivo administrativo de al menos 10 caracteres.
- `storage.set`, `storage.setMany` y `storage.delete` consultan una guardia central de entorno antes de modificar datos.
- Claves técnicas de hardening, recuperación y configuración del propio entorno permanecen disponibles para poder completar la certificación aun con las escrituras de negocio bloqueadas.
- Las migraciones técnicas de inicio se completan antes de activar la guardia para evitar que el modo PRUEBA deje una migración estructural a medias.


## V2.15.8 — Certificación mensual del piloto
- Compara un período completo contra referencias externas de RCV Ventas, RCV Compras y F29.
- Requiere como mínimo N° y total de ventas, N° y total de compras, y códigos F29 538/537.
- Un período sólo puede certificarse si no existen diferencias. La certificación puede invalidarse con motivo y queda auditada.
- Preparación Productiva exige al menos un período piloto certificado antes de activar PRODUCCIÓN.


## V2.15.9.1 — Puesta en marcha asistida
- Nuevo panel final de habilitación que consolida controles técnicos, checklist manual, empresa, ejercicio y período piloto certificado.
- Muestra exactamente qué requisitos siguen pendientes y bloquea la activación mientras exista alguno.
- Al activar PRODUCCIÓN se genera un acta inmutable de referencia con versión desplegada, usuario administrador, snapshot de criterios/checklist y huella SHA-256.
- Se mantiene historial de actas si un ejercicio vuelve a PRUEBA y posteriormente se habilita otra vez.
- El acta vigente puede descargarse en HTML para archivo interno, impresión o conversión posterior a PDF.
- Los snapshots de recuperación incluyen explícitamente las claves de preproducción y certificación piloto.

## V2.15.9.1 — Corrección guardado multi-clave
- Corrige `ReferenceError: ref is not defined` en `storage.setMany()` al guardar dentro de la transacción Firestore.
- La escritura usa ahora explícitamente la referencia correspondiente `refs[i]`.

## V2.15.9.2 — Autoguardado seguro
- Se separa **borrador de formulario** de **dato confirmado**.
- Escribir en INPUT/SELECT/TEXTAREA crea un borrador local por empresa/ejercicio; el temporizador nunca lo contabiliza ni lo manda a Firestore.
- Los borradores sobreviven cierres inesperados y se restauran en los campos cuando vuelven a existir en pantalla.
- `pagehide` ya no ejecuta `saveAll()`/Firestore: sólo persiste el borrador local de forma síncrona.
- El botón superior distingue `📝 Borrador` de cambios confirmados pendientes de sincronización.
- Datos de Empresa limpia su borrador únicamente después de una escritura Firestore/local confirmada y ahora comprueba explícitamente `r.ok`.


## V2.15.9.4 — Verificador obligatorio de actualizaciones

- Nuevo `version.json` generado en cada release.
- Verificación al arranque, al recuperar conexión, al volver al primer plano y cada 2 minutos.
- Si la versión publicada difiere, se muestra un overlay bloqueante y se fuerza la actualización antes de continuar.
- `storage.set`, `storage.setMany` y `storage.delete` rechazan escrituras mientras existe una actualización pendiente.
- `version.json` queda fuera de la caché del service worker.
- La actualización limpia las cachés `contabilidad-*`, solicita `skipWaiting` al nuevo service worker y recarga con query versionada.
- En modo offline no se bloquea el arranque; la verificación vuelve a ejecutarse al recuperar conexión.


## V2.15.9.5 — Navegación móvil / botón Atrás

- En la pantalla Inicio, el primer botón Atrás en Android/PWA ya no cierra la app.
- Se exige un segundo Atrás dentro de 2,2 segundos para confirmar intención de salida.
- Modales, formularios y navegación interna se resuelven antes de cualquier salida.
- El flujo de navegación no ejecuta `signOut()`.
- La política de login obligatorio al volver a abrir una app realmente cerrada se mantiene.

## V2.16.0 — Libro de Remuneraciones Electrónico (LRE) CSV Mi DT

- Se incorpora generación directa del archivo CSV para carga masiva del Libro de Remuneraciones Electrónico de la Dirección del Trabajo.
- El archivo usa delimitador `;`, headers con nomenclatura oficial `Nombre concepto(código)`, fechas `dd/mm/aaaa`, montos enteros positivos y salida ANSI/Windows-1252.
- Nombre de archivo conforme al esquema `rutempleador_aaaamm.csv`.
- Se incorporan todos los conceptos del Anexo N°1 de la plantilla LRE en el orden oficial; conceptos opcionales sin uso se dejan vacíos y obligatorios numéricos no aplicables se informan en `0`.
- Los trabajadores incorporan ficha LRE: fecha inicio/término, causal, región, comuna, tipo de impuesto, jornada, días trabajados/licencia/vacaciones, discapacidad/invalidez, pensionado, técnico extranjero, APV/APVC e indemnización Art. 164.
- AFP, salud, AFC, CCAF y organismo Ley 16.744 se vinculan con la configuración previsional existente y códigos DT conocidos.
- Se agrega validador previo al CSV. La exportación se bloquea ante RUT inválido, fecha inicial faltante, región/comuna faltante, códigos previsionales indeterminados o inconsistencia fecha/causal de término.
- El cierre mensual del libro conserva también la metadata LRE del trabajador para que el archivo histórico no dependa de cambios posteriores en la ficha.


## V2.16.1 — Limpieza de herramientas de migración

- Se eliminó de **Configuración → Sistema** la tarjeta histórica **Aislamiento por empresa**.
- Se retiraron los botones manuales `Verificar`, `Preparar aislamiento`, `Reparar accesos` y `Reparar documentos`.
- Se eliminó `js/seguridad.js` y los helpers de `storage.js` utilizados exclusivamente por la migración inicial.
- Se retiraron del orquestador `app.js` las funciones globales de migración que ya no se usan.
- Se mantiene intacto el aislamiento real: `firestore.rules`, `empresas_acl` y la sincronización automática de ACL al crear, compartir, reclamar, modificar o eliminar empresas.
- La ayuda de Empresas fue actualizada para no dirigir al usuario a una pantalla eliminada.
- Los comentarios de `firestore.rules` ahora describen el modelo productivo actual y no un procedimiento histórico de preparación.
