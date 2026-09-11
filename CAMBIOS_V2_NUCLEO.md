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
