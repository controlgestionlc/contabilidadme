# Contabilidad

Sistema web contable, tributario y de control para empresas chilenas, diseñado para operar con múltiples empresas y ejercicios, integración con Firebase/Firestore, control de acceso por usuarios, importación del Registro de Compras y Ventas (RCV), generación de asientos maestros, libros contables, auxiliares, F29, remuneraciones, activos fijos, cierres y herramientas de preparación productiva.

> **Estado actual:** V2.19.7 · compilación `v2026.09.15-2054`, publicada el 15-09-2026. Sistema operativo en producción con validación contable central, control de acceso por empresa, actualización PWA obligatoria, operación móvil, importadores RCV preventivos, pagos y cobros editables, honorarios integrados como documentos de proveedor, auditoría, recuperación ante desastre, LRE Dirección del Trabajo e impresión de libros en hojas foliadas SII.

La fuente funcional de la versión es `js/changelog.js`. `version.json`, las etiquetas visibles de `index.html`, el import map y la caché de `sw.js` deben conservar la misma revisión en cada publicación.

---


## Control de descuadres y operación móvil de Comprobantes

En teléfonos, **Comprobantes** utiliza fichas verticales en vez de obligar a navegar una tabla horizontal ancha. Cada ficha mantiene visibles el número, fecha, origen, glosa y los totales **Debe / Haber** en dos columnas iguales. La tabla completa se conserva en escritorio.

El campo **Buscar por glosa o cuenta** está optimizado para Android/PWA: la lista se filtra con una espera breve mientras se escribe y, al actualizarse, recupera automáticamente el foco y la posición del cursor. Esto evita que el teclado virtual se cierre tras ingresar el primer carácter.

Los descuadres se detectan sobre el Diario completo. Cuando existe uno, la alerta muestra el **N° de comprobante como acción clicable**: al tocarlo, la aplicación abre el documento de Compras/Ventas, el asiento manual, la apertura o el honorario correspondiente. La alerta no se almacena manualmente; se recalcula desde los movimientos, por lo que desaparece automáticamente cuando Debe y Haber vuelven a cuadrar.

En los importadores **RCV Compras** y **RCV Ventas**, cada DTE seleccionado se simula contablemente antes de persistir. Si un DTE produciría un asiento descuadrado, se informa antes de guardar y queda marcado como **pendiente por cuadratura**. Los documentos cuadrados del mismo lote pueden procesarse normalmente; los problemáticos no se incorporan a los libros ni al F29 y permanecen en la ventana del importador para revisión. Tocar el DTE de la alerta lleva directamente a su fila/ficha.


## Actualizaciones obligatorias de la aplicación

Desde **V2.15.9.4** toda instalación PWA verifica `version.json` contra la versión que está ejecutando. La comprobación se realiza al iniciar la aplicación, al recuperar conexión, al volver desde segundo plano y periódicamente mientras permanece abierta.

Cuando el servidor anuncia una versión distinta, la aplicación entra en estado **Actualización obligatoria**: bloquea la interfaz, impide nuevas escrituras en `storage.set`, `storage.setMany` y `storage.delete`, solicita la actualización del service worker, elimina las cachés PWA antiguas y recarga con una URL versionada. El usuario no puede continuar contabilizando con la versión anterior.

Si el equipo está sin conexión, la PWA puede seguir abriendo con su respaldo offline; la verificación se repite automáticamente al recuperar internet. El archivo `version.json` nunca se responde desde la caché del service worker.

> La obligatoriedad automática aplica a partir de la primera instalación de V2.15.9.4 o posterior. Una instalación anterior debe actualizarse una vez a esta versión para incorporar el verificador.


## 1. Arquitectura general

La aplicación es un frontend web estático publicado en GitHub Pages y utiliza Firebase para autenticación, control de usuarios y persistencia remota. Mantiene lógica contable y tributaria en módulos JavaScript separados, con un motor contable central y validaciones previas a toda persistencia crítica.

Componentes principales:

- **Frontend:** HTML, CSS y JavaScript ES Modules.
- **Hosting:** GitHub Pages.
- **Autenticación:** Firebase Authentication con correo y contraseña.
- **Base de datos:** Cloud Firestore.
- **Persistencia local:** almacenamiento local para caché y estado operativo. Los formularios incompletos permanecen sólo en memoria durante la sesión y se descartan al cerrar.
- **PWA:** manifest y service worker con cache-busting por versión.
- **Backups:** respaldo Excel + snapshots de recuperación en Firebase.
- **Auditoría:** registro de acciones críticas y trazabilidad de cambios.

La configuración Firebase se encuentra en `js/firebase-config.js`. Las reglas de seguridad se encuentran en `firestore.rules`.

---

## 2. Inicio de sesión y seguridad de acceso

La aplicación exige autenticación mediante correo y contraseña.

Comportamiento actual:

- Al cerrar la app o el navegador, al volver a abrir se solicita login nuevamente.
- Un refresco de la página dentro de la misma sesión puede conservar la sesión activa.
- La persistencia de autenticación está configurada para no mantener sesiones permanentes entre cierres completos.
- El sistema no utiliza un perfil local como sustituto de la autenticación Firebase.
- Se dispone de recuperación de contraseña.
- El registro de nuevos usuarios queda sujeto al control administrativo definido por la aplicación.

El login fue simplificado en V2.15.9.3 para mostrar únicamente los controles de acceso, registro y recuperación de contraseña.

---

## 3. Usuarios, roles y permisos

El sistema trabaja con usuarios autenticados y control de permisos.

Roles operativos soportados por la arquitectura actual:

- **Administrador:** configuración, usuarios, cierres, reaperturas, modo PRUEBA/PRODUCCIÓN, recuperación y operaciones críticas.
- **Contador:** operación contable y tributaria según permisos habilitados.
- **Consulta / perfiles restringidos:** acceso de lectura o capacidades limitadas según ACL.

Firestore aplica reglas de seguridad para impedir escrituras no autorizadas. Las ACL de empresas y los documentos de usuario son parte del control server-side.

Las ACL se mantienen automáticamente desde el catálogo de empresas. Las antiguas herramientas visibles **“Verificar / Preparar aislamiento / Reparar accesos”** eran utilidades de migración y fueron retiradas en V2.16.1; no forman parte de la operación normal ni son necesarias en una instalación productiva ya migrada.

Las acciones críticas pueden dejar registro de:

- usuario;
- fecha y hora;
- empresa y ejercicio;
- entidad e ID afectado;
- estado anterior y nuevo;
- campos modificados;
- motivo de reapertura o corrección;
- hash de estados cuando corresponde.

---

## 4. Empresas y ejercicios contables

La aplicación permite trabajar con múltiples empresas y ejercicios contables.

Cada empresa puede almacenar, entre otros:

- razón social;
- RUT;
- domicilio;
- comuna/ciudad;
- giro comercial;
- código de actividad SII;
- ejercicio contable;
- configuración tributaria y operacional.

El sistema mantiene una empresa activa por usuario y contexto de trabajo. Los datos de cada ejercicio se separan mediante claves específicas por año.

---

## 5. Modo PRUEBA y PRODUCCIÓN

Cada empresa/ejercicio dispone de un modo operacional explícito.

### PRUEBA

- Es el estado inicial.
- Las escrituras de negocio pueden quedar bloqueadas al iniciar una nueva sesión.
- Un administrador puede habilitar temporalmente las escrituras de prueba para esa sesión.
- El permiso temporal desaparece al cerrar la app/navegador.

### PRODUCCIÓN

La activación exige:

- panel de Preparación Productiva sin bloqueantes;
- checklist manual completo;
- prueba de concurrencia aprobada;
- respaldo y recuperación validados;
- regresión contable aprobada;
- período piloto certificado;
- confirmación explícita de administrador.

Al activar PRODUCCIÓN se genera un **Acta de Habilitación** con empresa, ejercicio, versión, administrador, período piloto, checklist, controles técnicos y huella SHA-256.

---

## 6. Plan de cuentas

El Plan de Cuentas es configurable y soporta:

- cuentas activas e inactivas;
- cuentas agrupadoras y de movimiento;
- clasificación contable;
- reglas de auxiliares;
- reglas de centros de costo;
- obligatoriedad de centro de costo por cuenta;
- cuentas tributarias especiales utilizadas por el motor contable.

La validación central impide contabilizar en cuentas inexistentes, inactivas o agrupadoras cuando no corresponde.

---

## 7. Motor contable central

`js/motor-contable.js` concentra la generación contable de documentos relevantes.

La aplicación trabaja con **asientos maestros persistidos**. Reportes, auxiliares y procesos tributarios privilegian esos asientos por sobre reconstrucciones ad hoc.

El motor incluye lógica para:

- ventas;
- compras;
- documentos exentos;
- Notas de Crédito y Débito;
- DTE 45/46;
- IVA retenido;
- IVA recuperable y no recuperable;
- IVA proporcional o de uso común;
- IVA crédito fiscal de activo fijo;
- otros impuestos recuperables o incorporados al costo;
- gastos rechazados;
- honorarios;
- pagos;
- F29;
- depreciación;
- remuneraciones;
- apertura y cierre.

Todo asiento nuevo o modificado pasa por una validación central antes de persistirse.

---

## 8. Validación contable central

`js/asiento-validacion.js` funciona como puerta obligatoria de integridad.

Bloquea, entre otros:

- asientos descuadrados;
- cuentas inexistentes;
- cuentas inactivas;
- cuentas agrupadoras usadas incorrectamente;
- movimientos con Debe y Haber simultáneos;
- importes negativos o líneas inválidas;
- auxiliares obligatorios faltantes;
- centros de costo obligatorios faltantes o inexistentes;
- documentos asociados inexistentes o anulados;
- referencias DTE inconsistentes;
- pagos asociados a documentos inexistentes;
- modificaciones en períodos cerrados;
- intentos de mover un asiento desde un período cerrado a otro abierto.

La misma validación se aplica durante fusiones o escrituras críticas en Firestore.

---

## 9. Correlativo contable definitivo

Los asientos disponen de `numeroContable` definitivo, separado del ID técnico y de correlativos históricos.

Características:

- numeración por empresa y ejercicio;
- reserva mediante transacción Firebase;
- evita duplicaciones entre equipos;
- los números reservados no se reutilizan;
- auditoría detecta asientos sin número o números duplicados;
- Libro Diario y comprobantes privilegian el número contable definitivo.

Los asientos históricos pueden migrarse para recibir correlativo definitivo.

---

## 10. Compras

El módulo de Compras permite ingreso manual e importación desde RCV.

Tratamientos soportados:

- documentos afectos y exentos;
- DTE 45 y 46;
- NC y ND con referencia;
- IVA recuperable;
- IVA no recuperable;
- IVA proporcional;
- IVA de activo fijo;
- otros impuestos;
- gastos aceptados o rechazados;
- distribución por cuentas y centros de costo.

### Fecha documental vs período contable RCV

La fecha original del DTE **no se modifica**.

Ejemplo:

- Fecha DTE: 15-08-2026
- Período RCV: 2026-09
- Fecha de contabilización: 30-09-2026

El documento conserva 15-08-2026, pero se contabiliza y participa en F29 del período 2026-09.

Las compras importadas guardan, cuando corresponde:

- `fecha`;
- `periodoContable`;
- `fechaContabilizacion`;
- `origenRegistro`;
- historial y fingerprint RCV.

---

## 11. Ventas

El módulo de Ventas permite ingreso manual e importación desde RCV.

Incluye:

- facturas;
- boletas;
- documentos exentos;
- Notas de Crédito;
- Notas de Débito;
- referencia obligatoria para NC/ND;
- generación y actualización de asiento maestro;
- anulación lógica coordinada con contabilidad.

La importación conserva la fecha documental original y controla períodos contables cerrados.

---

## 12. Importación RCV idempotente y control de cambios

`js/rcv-control.js` agrega control de idempotencia y trazabilidad.

Reimportar el mismo archivo o los mismos documentos no debe producir cambios innecesarios.

Cada DTE puede clasificarse como:

- **Nuevo**;
- **Sin cambios**;
- **Cambio SII**;
- **Ya contabilizado en asiento manual**.

Si el SII presenta una variación material, el sistema detecta los campos modificados antes de reemplazar información sensible. El documento puede conservar historial de versiones RCV anteriores.

El modo de conciliación de período completo puede anular lógicamente documentos que desaparecen del RCV sin borrar físicamente su historial.

---

## 13. Pagos y cobranzas

Los pagos se registran mediante asientos contables y constituyen la fuente maestra para el saldo de documentos.

El sistema evita depender de una segunda lista paralela de pagos en cada documento, salvo compatibilidad histórica.

Se soportan:

- pagos/cobros de documentos;
- pagos parciales;
- asociación del asiento con uno o más documentos;
- edición posterior de fecha, glosa y cuenta de banco/caja;
- incorporación o retiro de documentos desde el comprobante de pago;
- movimientos tipo Abono o Cargo, con contrapartida de banco/caja recalculada automáticamente;
- anulación o eliminación controlada del comprobante, restituyendo el saldo de los documentos;
- selección masiva limitada a los documentos que cumplen el filtro visible;
- identificación de documentos vencidos y días de atraso;
- cálculo de saldo pendiente;
- validación contra documentos existentes;
- conciliación mediante auxiliares.

---

## 14. Honorarios

Desde V2.17, los honorarios se registran desde **Comprobantes → Nuevo honorario** y se tratan como documentos pagables del proveedor, sin incorporarlos al Libro de Compras ni al IVA del F29.

Reconocimiento típico:

- gasto por honorario bruto;
- retención de segunda categoría;
- honorarios por pagar.

El gasto puede distribuirse entre varias cuentas y centros de costo. El prestador se selecciona mediante búsqueda por nombre, RUT o código de auxiliar; si no existe, su ficha de proveedor puede crearse desde el mismo formulario.

Se admiten boletas con retención (tipo interno 70) y sin retención (tipo interno 71). La tasa se determina según el año; el líquido queda en Honorarios por Pagar y posteriormente puede pagarse desde **Pagos y Cobros**. La retención participa en el control correspondiente del F29.

---

## 15. Auxiliares

El sistema dispone de auxiliares para clientes, proveedores y otros terceros vinculados a documentos y asientos.

Los auxiliares pueden mostrar:

- documentos asociados;
- pagos y abonos;
- saldos pendientes;
- movimientos contables;
- conciliación entre documento y asiento.
- notas de crédito/débito agrupadas bajo el documento referenciado;
- pagos/cobros agrupados bajo la factura u honorario que abonan;
- estado de cuenta y antigüedad de saldos sin duplicar documentos ni pagos.

El motor privilegia información derivada de asientos maestros.

---

## 16. Centros de costo

La aplicación incluye centros de costo configurables y asignables a movimientos contables.

Funciones principales:

- creación y administración;
- asignación por línea de asiento;
- obligatoriedad por cuenta;
- control de existencia;
- reportes y análisis por centro de costo.

---

## 17. Libro Diario, Mayor y reportes

El sistema genera información contable desde los asientos maestros.

Incluye:

- Libro Diario;
- Libro Mayor;
- Balance de Comprobación;
- Balance de 8 columnas;
- Balance General;
- Estado de Resultados;
- comprobantes;
- reportes contables;
- saldos por cuenta;
- reportes auxiliares;
- reportes por centro de costo.

La suite de regresión verifica que Diario, Mayor y Balance mantengan coherencia matemática.

---

## 18. F29 y control tributario mensual

El módulo tributario calcula y concilia información relevante del Formulario 29.

Actualmente contempla códigos y componentes como:

- débito fiscal;
- crédito fiscal;
- NC y ND;
- compras exentas;
- ventas exentas;
- IVA crédito activo fijo;
- IVA retenido por factura de compra;
- remanente anterior;
- remanente siguiente;
- IVA a pagar;
- PPM;
- retenciones de honorarios;
- total núcleo F29.

La aplicación distingue:

- **F29 calculado por el sistema**;
- **F29 efectivamente declarado**.

Una declaración presentada conserva snapshot histórico. Cambios posteriores en documentos no reescriben silenciosamente el F29 presentado.

El remanente del período siguiente utiliza el valor declarado del período anterior cuando existe una declaración presentada.

---

## 19. Conciliación F29, provisión, pago y Mayor

El sistema compara por período:

- calculado;
- declarado;
- contabilidad de origen;
- asiento de provisión/compensación;
- pagos acumulados;
- saldo pendiente;
- sobrepago;
- Mayor.

Los pagos F29 pueden ser parciales y múltiples. El sistema propone el saldo restante y evita sobrepagar un componente sin corrección previa.

Estados posibles incluyen:

- borrador;
- pendiente de pago;
- pago parcial;
- conciliado;
- revisar.

El tratamiento del PPM evita duplicar el activo cuando éste ya fue provisionado antes del pago.

---

## 20. Activo fijo

El módulo de activo fijo separa tratamiento financiero y tributario.

Puede almacenar:

- valor contable;
- valor tributario;
- valor residual;
- vida útil financiera;
- vida útil tributaria;
- método de depreciación;
- fecha de inicio de depreciación;
- vínculo con compra de origen.

La depreciación contable genera asientos maestros y la conciliación de Renta puede comparar depreciación financiera con depreciación tributaria.

---

## 21. Remuneraciones

El sistema incluye módulo de remuneraciones y libro de remuneraciones.

Puede trabajar con:

- haberes y descuentos;
- cotizaciones;
- provisiones;
- asientos contables;
- reportes del período;
- parámetros previsionales configurables.

---

## 22. Renta y gastos rechazados

El módulo de Renta puede utilizar información contable y ajustes tributarios.

Incluye tratamiento de:

- gastos rechazados identificados en compras/asientos;
- depreciación contable vs tributaria;
- depreciación instantánea cuando corresponda a la configuración;
- conciliaciones para determinación de resultado tributario.

---

## 23. Apertura y cierre de ejercicio

La aplicación permite:

- asiento de apertura;
- cierre anual;
- bloqueo de ejercicio cerrado;
- reapertura administrativa con motivo obligatorio;
- conservación del asiento de cierre y trazabilidad del estado.

Antes del cierre anual pueden ejecutarse validaciones de integridad.

---

## 24. Cierre contable mensual

Además del cierre anual, cada período mensual puede cerrarse.

Un período cerrado bloquea:

- altas;
- modificaciones;
- anulaciones;
- eliminación lógica/física no permitida;
- movimientos cuya fecha contable pertenezca al mes cerrado.

La reapertura mensual requiere administrador y motivo, dejando auditoría.

Para compras importadas, el bloqueo se evalúa según la **fecha/período de contabilización**, no según la fecha documental original.

---

## 25. Auditoría de Integridad

`js/integridad.js` revisa consistencia contable, documental y tributaria.

Controles relevantes:

- asientos balanceados;
- documento ↔ asiento;
- asientos huérfanos;
- duplicaciones;
- auxiliares requeridos;
- IVA documento vs asiento;
- IVA mensual;
- pagos y referencias;
- F29 duplicado o inconsistente;
- cierres duplicados;
- movimientos posteriores al cierre;
- reglas del PDC;
- activos fijos;
- numeración contable definitiva;
- coherencia RCV;
- períodos cerrados.

Los hallazgos se clasifican por severidad y algunos son bloqueantes para cierre o producción.

---

## 26. Regresión contable automática

La aplicación incluye una suite de regresión ejecutada en memoria.

La batería actual cubre escenarios como:

- venta afecta;
- venta exenta;
- NC/ND;
- compra neta/exenta;
- IVA recuperable;
- IVA no recuperable;
- IVA proporcional;
- activo fijo;
- DTE 45/46;
- fecha documental vs período RCV;
- honorarios;
- pagos parciales;
- auxiliares;
- F29 y remanente declarado;
- depreciación;
- remuneraciones;
- cierre mensual;
- validación central;
- Diario = Mayor = Balance.

La regresión es un criterio de Preparación Productiva.

---

## 27. Autoguardado seguro y formularios incompletos

El autoguardado sincroniza únicamente **datos ya confirmados**. Un formulario que el usuario todavía está completando no se contabiliza ni se envía a Firebase.

Desde V2.16.21, los campos incompletos permanecen sólo en memoria durante la sesión actual:

- no se persisten en `localStorage`;
- no reaparecen después de cerrar y volver a abrir la app;
- se pueden retomar desde **Configuración → Sistema y Respaldos → Borradores de esta sesión** mientras la app siga abierta;
- se eliminan al pulsar **Cancelar**, cerrar el formulario con `X`, usar Atrás sobre ese formulario o cerrar la aplicación.

Sólo una acción explícita de Guardar, Registrar o Contabilizar confirma el dato. El encabezado no muestra un estado global de borrador; sólo informa cambios confirmados pendientes de sincronización y el último guardado.

---

## 28. Persistencia y concurrencia

La capa `storage.js` controla persistencia local/remota, revisiones y operaciones multi-clave.

Características:

- escrituras versionadas;
- revisión de conflictos;
- `setMany()` transaccional para cambios relacionados;
- protección de persistencia crítica;
- rollback de estado en operaciones coordinadas cuando corresponde;
- guardia PRUEBA/PRODUCCIÓN;
- validación contable previa a asientos;
- fusión y control de revisiones.

La aplicación incluye una prueba operacional de concurrencia para ejecutarse realmente desde dos equipos.

---

## 29. Backups Excel

El módulo de backup permite exportar información relevante a Excel.

El respaldo preserva documentos, asientos y metadata extendida necesaria para reconstrucción, incluyendo campos incorporados en versiones recientes como:

- número contable;
- tipo/fuente;
- IDs documentales;
- referencias;
- período contable;
- fecha de contabilización;
- clasificación IVA;
- historial RCV;
- detalle F29;
- datos de activo fijo;
- cierres mensuales.

La restauración incluye validaciones y puede ejecutarse en modo de simulación antes de aplicar cambios reales.

---

## 30. Recuperación ante desastre

Además del Excel, el sistema mantiene snapshots de recuperación en Firebase.

Características:

- hasta 6 snapshots por empresa/ejercicio;
- snapshots manuales y automáticos;
- snapshot previo a operaciones riesgosas;
- manifiesto de contenidos;
- SHA-256 por clave;
- verificación de integridad;
- restauración sólo por administrador;
- creación de snapshot `pre-restauracion` antes de aplicar una recuperación;
- confirmación explícita `RESTAURAR`.

Los snapshots incluyen configuración PRUEBA/PRODUCCIÓN y certificación piloto.

---

## 31. Preparación Productiva

La aplicación dispone de un panel que muestra si el sistema está preparado para producción.

Entre sus controles se consideran:

- integridad contable;
- regresión contable;
- numeración definitiva;
- persistencia;
- concurrencia real;
- auditoría;
- cierre mensual;
- respaldo y restauración;
- snapshot vigente;
- certificación piloto;
- checklist de puesta en marcha.

Los elementos que requieren una prueba real no se marcan automáticamente como aprobados sólo porque el código exista.

---

## 32. Certificación de piloto mensual

Antes de PRODUCCIÓN puede certificarse un mes piloto comparando el sistema con referencias externas.

Se pueden contrastar, entre otros:

### RCV Ventas

- número de documentos;
- neto;
- exento;
- IVA;
- total.

### RCV Compras

- número de documentos;
- neto;
- exento;
- IVA;
- total.

### F29

- código 538;
- código 537;
- código 77;
- código 89;
- código 91.

La certificación queda asociada a usuario, fecha, período, referencias externas y valores calculados por la aplicación.

---

## 33. Puesta en marcha asistida

El panel de puesta en marcha reúne todos los requisitos necesarios para activar PRODUCCIÓN.

Incluye:

- empresa y ejercicio;
- versión desplegada;
- período piloto certificado;
- checklist manual;
- controles técnicos;
- requisitos pendientes;
- botón de activación productiva cuando todo está aprobado;
- generación del Acta de Habilitación.

El acta se conserva en historial y puede descargarse como HTML para archivo o impresión.

---

## 34. Service Worker y actualización de versiones

La aplicación usa un service worker para funcionamiento PWA y caché de respaldo.

En cada publicación, el proceso de liberación debe:

- genera un nuevo cache-busting para todos los módulos JS;
- actualiza la URL de `app.js`;
- cambia el nombre de caché del service worker;
- evita que distintos equipos trabajen con combinaciones de módulos de versiones antiguas y nuevas.

Al publicar una versión nueva conviene reemplazar todos los archivos del repositorio, no sólo `index.html`.

---

## 35. Publicación

Flujo recomendado:

1. Probar la versión en modo PRUEBA.
2. Ejecutar regresión contable.
3. Revisar Auditoría de Integridad.
4. Confirmar prueba de concurrencia desde dos equipos.
5. Crear y verificar snapshot.
6. Descargar respaldo externo.
7. Certificar un período piloto.
8. Revisar Preparación Productiva.
9. Generar Acta de Habilitación y activar PRODUCCIÓN.

El paquete V2.19.7 no incluye el auxiliar `_release.py`. Por ello, antes de publicar una versión posterior se debe actualizar de forma coordinada:

- `APP_VERSION` y la primera entrada de `CHANGELOG` en `js/changelog.js`;
- `meta[name="app-version"]`, `meta[name="app-release"]`, versión del login e import map en `index.html`;
- `version`, `release`, `revision` y `publicadoEn` en `version.json`;
- nombre de caché en `sw.js`.

No se debe cambiar uno de estos identificadores de forma aislada, porque una PWA instalada podría mezclar archivos de distintas publicaciones.

---

## 36. Archivos principales

```text
index.html                 Interfaz principal
firestore.rules            Reglas de seguridad Firestore
manifest.webmanifest       Configuración PWA
sw.js                      Service Worker
css/                       Estilos
icons/                     Iconos
js/app.js                  Arranque y exposición de acciones UI
js/state.js                Estado de aplicación
js/storage.js              Persistencia local/Firestore
js/firebase.js             Integración Firebase
js/auth.js                 Login y autenticación
js/empresa.js              Datos de empresa
js/empresas.js             Empresas y selección
js/pdc.js                  Plan de Cuentas
js/motor-contable.js       Motor contable
js/asiento-validacion.js   Validación contable central
js/asientos.js             Asientos manuales/gestión
js/compras.js              Compras y RCV
js/ventas.js               Ventas y RCV
js/rcv-control.js          Idempotencia/control de cambios RCV
js/pagos.js                Pagos y cobranzas
js/pagoeditor.js           Edición de comprobantes de pago/cobro
js/honorarios.js           Honorarios
js/honorariodoc.js         Honorarios como documento pagable
js/auxiliares.js           Auxiliares
js/activofijo.js           Activo fijo
js/remuneraciones.js       Remuneraciones
js/tributario.js           F29 y cálculo tributario
js/libroscv.js             Libros mensuales de Compras y Ventas
js/lre-dt.js               Exportación Libro de Remuneraciones DT
js/cierres-mensuales.js    Cierres y reaperturas mensuales
js/renta.js                Renta/ajustes tributarios
js/cierre.js               Cierre de ejercicio
js/integridad.js           Auditoría de Integridad
js/hardening.js            Preparación Productiva
js/regresion-contable.js   Suite de regresión
js/recovery.js             Snapshots y recuperación
js/preproduccion.js        PRUEBA/PRODUCCIÓN y acta
js/piloto.js               Certificación de piloto
js/autoguardado.js         Borradores y autoguardado seguro
js/correlativo-contable.js Numeración definitiva
js/audit.js                Auditoría de acciones
js/backup.js               Backup/restauración Excel
```

---

## 37. Límites y criterios de operación

La aplicación incorpora controles fuertes, pero la preparación productiva no debe basarse sólo en que el código compile.

Antes de operar con información definitiva se deben realizar pruebas reales de:

- autenticación y permisos;
- dos usuarios/equipos concurrentes;
- importación repetida del mismo RCV;
- cierre y reapertura mensual;
- F29 declarado y pagos parciales;
- backup y restauración;
- pérdida temporal de conexión;
- piloto mensual contra datos conocidos.

El sistema está diseñado para bloquear o advertir cuando alguno de estos controles no ha sido certificado.

---

## 38. Versión documentada

**V2.19.7 · `v2026.09.15-2054`**  
Documentación actualizada el 15-09-2026 a partir de los módulos, metadatos de publicación y changelog incluidos en este ZIP.

Cambios funcionales recientes incorporados a esta documentación:

- conciliación exacta de los importadores RCV contra el Total informado por el SII;
- tolerancia por documento en importaciones masivas y corrección individual de pendientes;
- referencia de NC/ND contra documentos del mismo proveedor, incluida factura de compra;
- glosa editable por documento en la importación RCV;
- montos enteros con separador de miles en campos monetarios;
- asiento manual en ventana emergente con tres líneas iniciales;
- pagos/cobros editables, anulables y asociados a uno o varios documentos;
- honorarios integrados como documentos de proveedor y distribuibles entre varias cuentas;
- Balance de 8 columnas y accesos rápidos a reportes;
- ajustes del LRE, corrección monetaria por régimen y advertencia de aceptación tácita RCV;
- identificación de versión sincronizada en el login y marca RABF en Inicio.

### V2.19.6 — Correcciones tributarias críticas

- El IUSC contabilizado en remuneraciones se muestra en el código 48 del F29 y se suma al código 91.
- El código 504 usa el remanente reajustado por la variación de la UTM entre períodos; la UTM se conserva por mes y la falta de datos genera una advertencia.
- Los asientos de remuneraciones usan el último día calendario real del mes.
- La depreciación acelerada general del Art. 31 N°5 usa un tercio de la vida normal con piso de un año. El régimen del N°5 bis no se presume ni se aplica automáticamente.
- La corrección monetaria deudora se reversa como agregado y la acreedora como deducción para regímenes que no la aplican.
- Los selectores de referencia admiten el DTE 61 y se actualizó la etiqueta de jornada ordinaria LRE.

### V2.19.7 — Identidad visual RABF

- Nuevo icono RABF Contabilidad para la aplicación instalada, favicon, Apple Touch y variantes PWA normal y maskable.
- La cabecera y la portada de selección de empresas utilizan el nuevo logotipo.
- La marca de agua RABF se centra en el área visible de Inicio y adapta su tamaño a escritorio y móvil.


## Navegación móvil y botón Atrás

En Android/PWA, el botón Atrás se maneja como navegación interna. Si existe un modal, formulario o una sección anterior, se vuelve a esa capa. Desde Inicio, el primer Atrás sólo muestra el aviso **“Presiona Atrás nuevamente para salir”** y la aplicación permanece abierta con la sesión activa. Únicamente un segundo Atrás dentro de 2,2 segundos inicia la salida. Este flujo no ejecuta `signOut()`; si el sistema operativo realmente cierra la PWA y luego se inicia una nueva ejecución, vuelve a aplicarse el login obligatorio.

## Libro de Remuneraciones Electrónico — Dirección del Trabajo

El módulo **Remuneraciones → Libro de Remuneraciones** puede generar el archivo de carga masiva para el Libro de Remuneraciones Electrónico (LRE) de Mi DT.

La exportación **CSV Mi DT** utiliza la estructura oficial de conceptos del LRE, separador punto y coma (`;`), encabezados del tipo `Nombre concepto(código)`, fechas en formato `dd/mm/aaaa`, montos enteros y codificación ANSI/Windows-1252. El archivo se nombra `rutempleador_aaaamm.csv`.

La ficha de cada trabajador contiene un bloque **Datos Libro de Remuneraciones Electrónico (Dirección del Trabajo)** con los antecedentes que no forman parte de la liquidación normal pero sí son exigidos por el LRE: fecha de inicio/término y causal, región/comuna de prestación, tipo de impuesto, tipo de jornada, días trabajados/licencia/vacaciones, discapacidad o pensión de invalidez, pensión de vejez, técnico extranjero, APV/APVC e indemnización a todo evento. AFP, FONASA/ISAPRE, AFC, CCAF y organismo administrador de la Ley 16.744 se relacionan con la configuración previsional del sistema.

Antes de generar el archivo, **Validar LRE** revisa campos obligatorios y consistencia básica. Si existen errores, el CSV no se descarga. Se recomienda cerrar el mes de remuneraciones antes de generar el archivo definitivo, de modo que la declaración se base en la fotografía mensual ya pagada y no en datos provisionales.

El archivo generado es una ayuda para la carga masiva. La aceptación definitiva depende de las validaciones de forma y fondo de la Dirección del Trabajo en Mi DT, por lo que debe revisarse el informe de procesamiento emitido por esa plataforma.

---

## Experiencia móvil

Desde V2.16.2 la aplicación está diseñada para poder operar desde teléfonos como dispositivo de trabajo y no sólo como visor.

En pantallas de hasta 768 px se aplica una interfaz específica:

- una barra de contexto muestra siempre el módulo actual y ofrece accesos directos a **Volver** e **Inicio**;
- el menú principal funciona como drawer lateral y muestra empresa activa, ejercicio, módulos y cierre de sesión;
- el encabezado se compacta para priorizar navegación y guardado;
- formularios, filtros, tarjetas y KPIs reducen espaciado y tipografía sin quitar campos;
- los formularios de compras, ventas y asientos reorganizan sus campos para evitar cifras cortadas;
- tablas con muchas columnas usan desplazamiento horizontal **dentro de la tabla**, evitando desplazar toda la aplicación;
- los modales usan la pantalla completa del teléfono, con encabezado y acciones persistentes;
- filtros y grupos de botones se envuelven automáticamente;
- textos técnicos y nombres largos se ajustan dentro de sus contenedores;
- se respetan las áreas seguras (`safe-area`) de Android/iOS/PWA;
- el botón Atrás de Android cierra primero modales/formularios o vuelve al módulo anterior antes de ofrecer salir de la aplicación.

### Criterio responsive

La interfaz utiliza tres niveles principales:

- **Escritorio:** más de 768 px, navegación lateral permanente y mayor densidad de información.
- **Móvil/Tablet pequeña:** 341–768 px, drawer, barra de contexto y diseño compacto.
- **Teléfono angosto:** hasta 340 px, KPIs y grids críticos bajan a una columna y se ocultan indicadores secundarios del header.

En móvil se prioriza que los montos, fechas, cuentas y acciones sean utilizables. Cuando una tabla contable contiene demasiadas columnas para representarse sin perder significado, se conserva su estructura y se habilita scroll horizontal táctil dentro de ella en vez de reducir los datos hasta volverlos ilegibles.

## Ajuste de columnas monetarias en móvil — V2.16.4

Las vistas tributarias y contables críticas reservan espacio fijo para cifras monetarias largas. En teléfonos, las columnas de importes no se dimensionan según valores pequeños como `$ 0`; se diseñan para soportar montos de aproximadamente 12 caracteres visibles incluyendo signo monetario, separadores de miles y eventual signo negativo.

Ejemplos de referencia:

```text
$999.999.999
-$99.999.999
```

Se aplican estas reglas:

- montos alineados a la derecha;
- números tabulares (`font-variant-numeric: tabular-nums`);
- el importe nunca se parte en dos líneas;
- en F29 y Renta se reduce primero el ancho del código y luego la tipografía descriptiva antes de sacrificar la columna monetaria;
- en PPM se compacta la columna Mes y se priorizan Base y PPM;
- en Comprobantes tipo, Debe y Haber tienen exactamente el mismo ancho en móvil.

### Ajustes monetarios en móvil (V2.16.4)
En Formulario 29, Estado de Resultados y Balance General las columnas monetarias tienen un ancho reservado para importes grandes (por ejemplo `$999.999.999` o `-$99.999.999`). La descripción utiliza el espacio restante y puede envolver texto sin superponerse al monto. En F29 la columna de código queda limitada al espacio necesario para códigos de hasta cinco caracteres.

## Impresión en hojas foliadas SII
El sistema incluye un módulo para contribuyentes autorizados a llevar contabilidad computacional en hojas sueltas. Permite registrar rangos de folios físicos previamente autorizados/timbrados, preparar Libro Diario, Mayor, Caja e Inventarios y Balances, calibrar márgenes con una prueba en hoja blanca y reservar folios antes de imprimir. Los folios reservados deben posteriormente confirmarse como usados o inutilizados y nunca se reutilizan automáticamente. El módulo es un control operativo de impresión: no reemplaza la solicitud de autorización de contabilidad computacional ni el timbraje/autorización del SII.

### Centros de costo normales y capitalizables
Los subcentros pueden utilizarse en empresas comerciales sin ninguna lógica de activación: el tipo **Normal** es el valor por defecto y equivale a **Sin Capitalización**. En ese modo solo se acumulan y analizan costos por centro. Las opciones de fecha de inicio, curva, porcentajes y cuenta de costo para cierre/capitalización se muestran únicamente cuando el tipo es **Inversión en curso**. Se conserva compatibilidad con centros históricos de tipo `operativo` y `capitalizado`.

## Asociación automática de DTE desde asientos

Al editar un comprobante de venta o compra, el botón **DTE** no obliga a volver a digitar información que ya está contenida en el asiento. El sistema intenta reconstruir automáticamente el documento desde las líneas contables: fecha de emisión, RUT, razón social, número, descripción, Neto, Exento, IVA, otros impuestos y Total.

En una venta, el Total se obtiene desde la cuenta auxiliar del cliente, el IVA desde **IVA Débito Fiscal (2103003)** y otros impuestos identificables desde **Otros Impuestos por Pagar (2103004)**. En una compra, el Total se toma desde Proveedores, el IVA identificable desde las cuentas de crédito fiscal y otros impuestos recuperables desde **1108006**. En facturas de compra DTE 45/46 se incorpora además el IVA retenido registrado en **2103005** para reconstruir el total documental.

Los valores existentes en el documento origen o RCV siempre tienen prioridad. La inferencia contable sólo rellena campos que están vacíos, por lo que no reemplaza información tributaria real. Una vez seleccionado el tipo de DTE, el sistema determina si la base corresponde a Neto o Exento. En el caso habitual, el usuario sólo debe seleccionar el tipo de documento e indicar la fecha de vencimiento antes de asociarlo.

## V2.16.16 — Base Neto/Exento automática al asociar DTE
- Al abrir el modal DTE desde un asiento de Venta o Compra, el sistema completa **Neto/Exento, IVA, Otros impuestos y Total** desde las líneas contables disponibles.
- Si existe IVA identificable, se reconstruye la base afecta y se muestra inmediatamente en **Neto**, incluso antes de elegir el tipo SII.
- Si no existe IVA y todavía no se ha elegido el tipo de documento, la base se muestra provisionalmente en **Exento**; al seleccionar el DTE se reclasifica automáticamente si corresponde a un documento afecto.
- La reclasificación automática sólo opera mientras la base no haya sido editada manualmente por el usuario.
- Se toleran diferencias de hasta 2 pesos producidas por redondeo del IVA, evitando crear montos exentos ficticios por reversión matemática de la tasa 19%.
- En un caso como Total `$531.243.316` e IVA `$84.820.361`, el sistema completa Neto `$446.422.955` al abrir el documento.



## Identificación de versión en el login

La pantalla de inicio de sesión muestra en su parte inferior la **versión funcional vigente** de la aplicación y la leyenda **“Desarrollado por R.A.B.F. · 2026”**. La versión visible se sincroniza con la primera entrada del changelog durante el proceso de publicación, evitando mantener textos de versión duplicados.


## Borradores de sesión y navegación lateral

Los formularios en edición no se guardan automáticamente como operaciones contables. Mientras la app permanece abierta, **Configuración → Sistema y Respaldos → Borradores de esta sesión** permite ver y retomar un formulario incompleto. Estos datos no se almacenan entre ejecuciones: al cerrar la app se eliminan.

Cada formulario dispone de **Cancelar** al final. Cancelar cierra el formulario y descarta sus campos incompletos sin tocar documentos ya contabilizados. Cerrar con `X` o usar Atrás sobre el formulario aplica el mismo criterio.

El menú lateral utiliza categorías plegables para reducir desplazamiento y evitar perderse, especialmente en móvil. Las categorías actuales son **Registros, Reportes, Tributario SII, Activo Fijo, Cierre de Ejercicio y Configuración**. Al tocar una categoría se despliegan sus módulos; al entrar en un módulo, su categoría queda recordada como la activa. **Comprobantes forma parte de Registros**, junto a los demás módulos de captura y operación diaria.

## Guardado total y reanudación móvil

La aplicación protege cada clave de Firestore mediante una revisión (`rev`) para evitar que dos equipos se sobrescriban. En Android/PWA el sistema operativo puede recrear el contexto JavaScript al volver desde segundo plano; cuando eso ocurre, la memoria temporal de revisiones puede perderse aunque `localStorage` conserve la última copia correctamente sincronizada.

Desde V2.16.19, **Guardar Todo** puede reconstruir esa revisión únicamente si la copia local persistida coincide exactamente con el contenido actual de Firestore. Si no coincide, el guardado se bloquea y exige sincronización/revisión, manteniendo intacta la protección de concurrencia. Los errores de Guardar Todo muestran además la clave afectada.

En el menú móvil, **Sistema y Respaldos** aparece una sola vez dentro de **Configuración**. El bloque de acciones conserva únicamente **Guardar Todo**.

## V2.16.21 — Borradores sólo de sesión y cancelación explícita
- Los campos de formularios incompletos ya **no se persisten en localStorage** ni se restauran al volver a abrir la aplicación.
- Al iniciar V2.16.21 se purgan automáticamente borradores persistentes creados por versiones anteriores.
- El gestor de Configuración pasa a mostrar **Borradores de esta sesión**: sirven únicamente para retomar un formulario mientras la app sigue abierta.
- El encabezado deja de mostrar `Borrador sin confirmar`; sólo informa cambios ya confirmados pendientes de sincronización o el último guardado.
- **Guardar Todo** no convierte ni respalda formularios incompletos: el usuario debe usar el Guardar/Registrar del formulario o Cancelar.
- Todo formulario de ingreso debe tener un botón **Cancelar** al final. Si un módulo no lo incorpora explícitamente, la capa común agrega uno.
- Cancelar, cerrar con `X` o usar Atrás sobre un formulario elimina sus campos incompletos de la sesión y no escribe en Firebase.
- Al cerrar la PWA/app, cualquier formulario incompleto restante se descarta automáticamente.




## V2.16.24 — Vencimiento automático en Compras y Ventas

Los capturadores SII de Compras y Ventas normalizan la fecha de vencimiento de cada DTE. Si el archivo CSV/Excel trae una columna de vencimiento, la fecha se conserva exactamente; si no existe o viene vacía, el sistema calcula **30 días corridos desde la fecha de emisión**.

La fecha queda guardada en `fechaVencimiento` y se utiliza en auxiliares de clientes/proveedores, pagos y cobros, antigüedad de saldos y proyección de flujo de caja. El origen se conserva internamente como `archivo`, `estimado30d` o `manual`.

En una reimportación se aplica una prioridad segura: una fecha manual o histórica existente no se reemplaza por una estimación; una fecha real ya registrada tampoco se pierde si un archivo posterior no trae vencimiento; y una fecha real informada por el SII puede reemplazar una estimación previa de 30 días.

La previsualización del importador muestra `Vence AAAA-MM-DD`; cuando la fecha fue calculada se identifica como `30d`.

## V2.16.23 — Cierres mensuales y anuales para contadores

- `Cierres Mensuales` es un módulo propio dentro de `Cierre de Ejercicio`; ya no depende de `Auditoría de Integridad`.
- Administradores y contadores con permiso de edición pueden cerrar/reabrir meses de las empresas que tienen asignadas o compartidas.
- La reapertura mensual exige un motivo de al menos 10 caracteres y queda registrada en auditoría.
- El cierre anual y su reapertura también pueden ser ejecutados por contadores autorizados en la empresa activa, manteniendo las validaciones y trazabilidad existentes.
- `Auditoría de Integridad` sigue siendo exclusiva de administración. Los cierres continúan ejecutando sus validaciones internas; si existen hallazgos críticos, el contador recibe un bloqueo y debe solicitar revisión al administrador.
