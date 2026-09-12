# Contabilidad

Sistema web contable, tributario y de control para empresas chilenas, diseñado para operar con múltiples empresas y ejercicios, integración con Firebase/Firestore, control de acceso por usuarios, importación del Registro de Compras y Ventas (RCV), generación de asientos maestros, libros contables, auxiliares, F29, remuneraciones, activos fijos, cierres y herramientas de preparación productiva.

> **Estado actual:** V2.15.9.3 · aplicación preparada para piloto y puesta en marcha controlada. La activación a PRODUCCIÓN requiere que los controles internos, pruebas operacionales y certificación de piloto estén aprobados dentro de la propia aplicación.

---


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
- **Persistencia local:** almacenamiento local para caché, estado operativo y borradores no confirmados.
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
- cálculo de saldo pendiente;
- validación contra documentos existentes;
- conciliación mediante auxiliares.

---

## 14. Honorarios

Los honorarios se reconocen contablemente separando devengamiento y pago.

Reconocimiento típico:

- gasto por honorario bruto;
- retención de segunda categoría;
- honorarios por pagar.

El pago se registra posteriormente contra banco/caja.

El módulo admite modalidad pendiente o contado, anulación lógica, retención guardada y conciliación con F29.

---

## 15. Auxiliares

El sistema dispone de auxiliares para clientes, proveedores y otros terceros vinculados a documentos y asientos.

Los auxiliares pueden mostrar:

- documentos asociados;
- pagos y abonos;
- saldos pendientes;
- movimientos contables;
- conciliación entre documento y asiento.

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

## 27. Autoguardado seguro y borradores

El autoguardado distingue entre **borrador** y **dato confirmado**.

Mientras el usuario está escribiendo un formulario:

- el contenido se guarda localmente como borrador;
- no se contabiliza;
- no se envía automáticamente a Firebase como dato definitivo;
- puede recuperarse tras un cierre inesperado.

Sólo una acción explícita de Guardar, Registrar o Contabilizar confirma el dato.

El sistema no intenta completar escrituras Firestore asíncronas durante `pagehide`, porque el navegador no garantiza su finalización.

Indicadores operativos distinguen:

- borrador sin confirmar;
- cambios confirmados pendientes;
- guardado/sincronizado;
- error de persistencia.

Los borradores se separan por empresa y ejercicio.

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

En cada publicación `_release.py`:

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

Para preparar una publicación se utiliza:

```bash
python3 _release.py vAAAA.MM.DD-HHMM
```

Esto actualiza versiones de módulos y cachés.

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
js/honorarios.js           Honorarios
js/auxiliares.js           Auxiliares
js/activofijo.js           Activo fijo
js/remuneraciones.js       Remuneraciones
js/tributario.js           F29 y cálculo tributario
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

**V2.15.9.3**  
Documentación reconstruida desde cero para describir exclusivamente el funcionamiento vigente de la aplicación.
