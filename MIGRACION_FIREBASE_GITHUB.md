# Migración a nuevo GitHub + Firebase — preparación V2.4

La V2.4 está preparada para cambiar de infraestructura sin modificar el núcleo contable.

## Información que se necesitará del nuevo Firebase

Para configurar la aplicación basta con la **configuración Web App** de Firebase:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Estos valores se reemplazan únicamente en `js/firebase-config.js`.

**No es necesario compartir** contraseñas, claves privadas, archivos de service account ni secretos de administrador.

## Preparación de Firebase

1. Crear el proyecto Firebase.
2. Crear Firestore Database.
3. Habilitar Firebase Authentication con el/los proveedores que utilizará la aplicación.
4. Crear una Web App y copiar su configuración.
5. Publicar el archivo `firestore.rules` de este repositorio.
6. Crear el primer usuario administrador siguiendo la nota incluida en las reglas, o mediante el flujo administrativo que se defina para la migración.
7. Crear/validar `_meta/ping` si se desea usar la prueba de conectividad administrativa.
8. Cargar el catálogo de empresas y ACL antes de incorporar usuarios no administradores.

## Información que se necesitará del nuevo GitHub

- URL o nombre del repositorio nuevo.
- Rama de publicación que se utilizará (`main` recomendada).
- Si se usará GitHub Pages, confirmar si publicará desde raíz o desde `/docs`.
- Dominio personalizado, sólo si se utilizará uno.

## Orden recomendado para la migración

1. Configurar Firebase nuevo.
2. Sustituir `js/firebase-config.js`.
3. Probar login y reglas con una empresa de prueba.
4. Ejecutar Auditoría de Integridad con datos de prueba.
5. Importar/migrar datos reales.
6. Ejecutar migración de documentos históricos a asiento maestro.
7. Ejecutar nuevamente Auditoría de Integridad.
8. Publicar el repositorio nuevo / GitHub Pages.
9. Mantener el sistema anterior sólo como respaldo de lectura durante la validación inicial.

## Criterio de aceptación antes de producción

La migración no debería darse por terminada hasta que:

- no existan asientos descuadrados;
- no existan documentos activos sin asiento maestro;
- auxiliares de clientes/proveedores cuadren con Mayor;
- IVA documentos cuadre con IVA contable por período;
- no existan duplicados F29;
- no existan movimientos posteriores al cierre;
- las reglas Firestore impidan acceso a empresas no autorizadas;
- una falla de persistencia no sea presentada al usuario como operación contabilizada.

---

## Entorno nuevo asignado — 11-09-2026

Esta copia ya fue configurada para:

- Firebase: `contabilidadmeapp`
- GitHub Pages: `https://controlgestionlc.github.io/contabilidadme/`

Consultar `DESPLIEGUE_NUEVO_ENTORNO.md` para los pasos de Authentication, primer administrador, reglas y prueba inicial.
