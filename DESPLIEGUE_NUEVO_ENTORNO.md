# Despliegue — contabilidadmeapp + GitHub Pages

## Entorno configurado

- **Firebase projectId:** `contabilidadmeapp`
- **Firebase Auth domain:** `contabilidadmeapp.firebaseapp.com`
- **Sitio GitHub Pages:** `https://controlgestionlc.github.io/contabilidadme/`
- **Esquema de datos de la app:** `4`

La configuración Web ya quedó cargada en `js/firebase-config.js`.

## 1. Firebase Authentication

En Firebase Console → **Authentication → Sign-in method**:

1. Habilitar **Correo electrónico/Contraseña**.
2. En **Settings → Authorized domains**, agregar:
   - `controlgestionlc.github.io`
   - `localhost` puede mantenerse para pruebas locales.

> No agregar `/contabilidadme/` al dominio autorizado: Firebase pide sólo el dominio.

## 2. Firestore

Crear Firestore en **modo Native** si aún no está creado.

Luego publicar exactamente el contenido de `firestore.rules` en:

**Firestore Database → Rules → Publish**.

Las reglas incluidas en esta versión aplican separación por empresa y roles:

- `admin`: administración global y datos contables.
- `contador`: datos de empresas autorizadas.
- `consulta`: lectura solamente.

## 3. Crear el primer administrador

Por seguridad, una instalación nueva no permite que el primer usuario se auto-promueva a administrador.

### A. Authentication
Crear primero al usuario en **Authentication → Users → Add user**.

### B. Firestore
Crear manualmente:

`usuarios/<correo-en-minusculas>`

con campos equivalentes a:

```text
email       = "correo@dominio.cl"
nombre      = "Administrador"
rol         = "admin"
activo      = true
pendiente   = false
```

Después de ese primer administrador, la gestión de usuarios se realiza desde la aplicación.

## 4. GitHub Pages

El contenido del directorio raíz del paquete debe quedar en la raíz del repositorio `contabilidadme`.

En GitHub:

**Settings → Pages → Build and deployment**

Configurar la rama que se publicará (normalmente `main`) y carpeta `/ (root)`.

La aplicación usa rutas relativas (`./`), por lo que funciona bajo el subdirectorio `/contabilidadme/`. El Service Worker y el manifest también quedan limitados a ese scope.

## 5. Primera prueba recomendada

Después de publicar:

1. Abrir `https://controlgestionlc.github.io/contabilidadme/`.
2. Iniciar sesión con el administrador creado.
3. Crear una empresa de prueba.
4. Crear una venta simple y una compra con neto + exento + IVA.
5. Confirmar que ambas crean asiento maestro.
6. Revisar **Auditoría de Integridad**.
7. Cerrar sesión y probar un usuario `consulta` para confirmar que no puede escribir.

## 6. Datos de una instalación anterior

No copiar directamente toda la colección `contabilidad_data` desde otra cuenta sin validar la empresa y los ACL.

Si se decide migrar información histórica, el orden recomendado es:

1. usuarios,
2. catálogo de empresas,
3. `empresas_acl`,
4. datos contables por empresa,
5. auditoría final de integridad,
6. recién después habilitar trabajo productivo.

La nueva base también puede partir vacía, que es la opción más limpia si se busca separar completamente esta versión del sistema anterior.

## 7. Seguridad

No subir a GitHub:

- archivos de Service Account,
- claves privadas,
- contraseñas,
- exports con datos contables reales.

La configuración Web de Firebase incluida en `firebase-config.js` puede estar en el cliente; el control de acceso se realiza mediante Authentication y las reglas de Firestore.
