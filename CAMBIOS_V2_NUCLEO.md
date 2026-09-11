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
