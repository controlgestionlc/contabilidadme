# SCI · Sistema de Control de Inventario y Cuaderno de Campo

Aplicación web interna de **Sociedad Agrícola y Forestal La Cabaña Ltda.** (Angol, Región de La Araucanía, Chile). Reúne en una sola herramienta el control de inventario de bodega, el cuaderno de campo del huerto de cerezos, el inventario de plantas en terreno, el control de heladas y el seguimiento de presupuesto por temporada.

Es una **PWA (Progressive Web App) offline-first**: funciona sin conexión sobre datos locales y sincroniza a la nube cuando hay red. No usa framework ni build: es HTML + CSS + JavaScript puro servido como sitio estático.

- **Repo:** `rodrigobrionesfriz-ux/Scimodula` · **Hosting:** GitHub Pages · **Rama:** `main`
- **Versión actual:** v138 · **DB_VERSION (IndexedDB):** 14

---

## Qué resuelve

La empresa maneja huerto de cerezos, operaciones forestales/madereras y entidades relacionadas (Inmobiliaria Valle Verde, Transportes La Cabaña, Sociedad Constructora Valle Verde). El SCI centraliza la operación agrícola diaria y entrega la información que alimenta los informes de costos y el análisis de variaciones para la gerencia:

- **Inventario y costeo** de insumos, repuestos, combustibles y productos, con costo promedio ponderado (PPP) y centros de costo.
- **Cuaderno de campo**: fertirriego, estimación de cosecha, órdenes de aplicación y su confirmación, gestión de paños.
- **Terreno**: conteo de árboles, inventario de plantas por hilera con mapa satelital, y actualización de estado de plantas con flujo de aprobación.
- **Presupuesto** por temporada (Mayo a Abril) con carga de Excel, gráficos y desviaciones.
- **Combustible y flota**: registro de consumo por equipo con rendimiento (km/L y L/hora).
- **Heladas**: control de eventos por torre y noche, con consumo de diésel.

---

## Stack técnico

Sin framework, sin bundler, sin dependencias de servidor. Todo corre en el navegador.

| Capa | Tecnología |
|---|---|
| UI | HTML + CSS (`css/styles.css`) + JavaScript vanilla |
| Datos locales | **IndexedDB** (24 stores, ver más abajo) |
| Nube / sync | **Firebase Firestore** (SDK 10.12.2 compat), 3 proyectos independientes |
| Planillas | **SheetJS / XLSX** 0.18.5 (importación y exportación) |
| Gráficos | **Chart.js** 4.4.1 (módulo de presupuesto) |
| Mapas | **Leaflet** 1.9.4 + imagen satelital Esri (sin API key) |
| Tipografía | IBM Plex Sans / IBM Plex Mono (Google Fonts) |
| Offline | Service Worker con precache versionado + `manifest.json` (instalable) |

Las librerías se cargan desde CDN (cdnjs, gstatic, unpkg) con respaldo desde jsDelivr para Firebase.

---

## Estructura de archivos

| Archivo | Rol |
|---|---|
| `index.html` | Login, contenedores HTML de todas las pestañas, CSS del módulo Presupuesto, normalizador global de mayúsculas, registro del Service Worker |
| `css/styles.css` | Estilos globales de la app |
| `js/core.js` | IndexedDB, sync Firebase (proyecto SCI), sesión y permisos, navegación, sidebar, sistemas externos, temas |
| `js/inventario.js` | Productos, movimientos, stock, tomas de inventario, combustible, equipos, mantenciones, respaldos, indicadores, configuración, usuarios, empresa |
| `js/cuaderno.js` | Fertirriego, estimación, órdenes y confirmaciones, registro, paños, vínculos Cuaderno↔SCI, sync propio |
| `js/huerto.js` | Conteo en terreno (`cte*`) e Inventario de plantas (`ip*`), mapas Leaflet, orientación de hileras |
| `js/presupuesto.js` | Dashboard de presupuesto, carga de Excel, gráficos, temporadas, formato GTT, criterios, sync propio (`pz*`) |
| `js/helada.js` | Control de Heladas (`hel*`): eventos por torre/noche, catálogo de torres, diésel |
| `js/ordencompra.js` | Órdenes de compra (`oc*`) |
| `js/actualizacion.js` | Actualización de estado de plantas (`aih*`): terreno propone, admin aprueba, con respaldo por versión |
| `data/presupuesto-data.js` | Datos semilla de presupuesto |
| `service-worker.js` | Precache versionado (constante `VERSION` como único punto de cambio por release) |
| `manifest.json` | Metadatos de la PWA (nombre, iconos, colores) |
| `icons/` | Iconos de la aplicación (192 y 512 px) |

---

## Módulos y funciones

El menú lateral se organiza en secciones. Cada ítem se muestra según los permisos del usuario.

### Principal
- **Dashboard**: resumen general de la operación.
- **Gestionar enlaces** (solo admin): accesos a sistemas externos configurables por rol.

### Inventario
- **Productos**: catálogo con tipo, grupo/sub-grupo, unidad, stock mínimo, flags de impuesto (específico a combustibles, ILA), e importación masiva desde Excel.
- **Bodegas**, **Proveedores**, **Clientes**, **Centros de Costo**: catálogos base.
- **Stock por Bodega**: saldos por producto y bodega, con informe filtrable.

### Operación
- **Movimientos**: historial de entradas y salidas.
- **Nueva Entrada**: Compra, Cosecha a stock, Devolución de centro de costo, Toma de inventario, Muestra gratis.
- **Nueva Salida**: Venta, Consumo de centro de costo, Traspaso entre bodegas, Merma, Devolución a proveedor, y **salida de combustible** (formulario propio con equipo, horómetro/kilometraje y operador).
- **Órdenes de Compra**: emisión con folio.
- **Tomas de Inventario**: captura de conteo, informe de ajustes y autorización.
- **Rendimiento combustible** (solo admin): consumo y rendimiento por equipo entre cargas (km/L para vehículos, L/hora para torres y generadores).
- **Control de Heladas**: eventos por torre y por noche, catálogo de torres y control de diésel (compras y consumos).

### Cuaderno de Campo
- **Fertirriego**: sectores, objetivos y productos.
- **Estimación** de cosecha con conteo de árboles y versiones históricas.
- **Órdenes** de aplicación (mezcla, emisión) y **confirmaciones** con reportes.
- **Paños**: gestión y seguimiento de aplicaciones por paño.
- Vínculos e integración con el inventario del SCI (migración y baja de productos).

### Mantenciones
- **Servicio y Mantención**: órdenes de trabajo y registro de facturas de servicio.

### Terreno
- **Conteos en terreno**: sesión de conteo por árbol, cuaja y exportación.
- **Inventario de Huerto**: conteo de plantas por hilera, GPS, resumen por paños, y **mapa general** del cuartel con imagen satelital, orientación de hileras (norte/sur, este/oeste) y desfase.
- **Actualización Inventario**: propuestas de cambio de estado desde terreno que el administrador aprueba o rechaza, con respaldo por versión de cada hilera.

### Control de Presupuesto
- Dashboard por temporada (Mayo a Abril) alimentado por un Excel.
- Vista estándar y **formato GTT Nahuelbuta**, criterios, KPIs (kg, tipo de cambio, hectáreas), gráficos por línea/tipo/sub-grupo, desviaciones y resumen ejecutivo.
- Soporte multi-huerto (2018 / 2024) y conversión CLP/USD con tipo de cambio del último mes cargado.

### Administración
- **Usuarios**: alta, roles y permisos.
- **Configuración**: datos de empresa, apariencia (tema), tipos de producto, grupos/sub-grupos, **equipos** (catálogo para combustible), indicadores diarios (USD, UTM, UF por temporada) y respaldos.
- **Auditoría** (solo admin): registro de acciones.

---

## Modelo de datos (IndexedDB)

Base local `SCI` con **DB_VERSION 14**. Stores (clave entre paréntesis):

`users` (id) · `products` (codigoInterno) · `warehouses` (id) · `groups` (nombre) · `productTypes` (nombre) · `providers` (codigo) · `customers` (codigo) · `costCenters` (codigo) · `inventoryCounts` (id) · `movements` (numero) · `ordenescompra` (id) · `mantenciones` (id) · `conteos` (id) · `estimaciones` (id) · `invplantas` (id) · `stock` (key) · `lots` (id) · `audit` (id) · `combustible` (id) · `config` (key) · `aihprop` (id) · `aihver` (id, solo local) · `heladas` (id) · `clima` (fecha).

El store `config` guarda documentos por clave (`counters`, `productCounter`, `empresa`, `equipos`, `helTorres`, `indicadoresDiarios`, `sistemasExternos`, etc.).

---

## Arquitectura de sincronización

Offline-first: la app opera siempre contra IndexedDB local; Firestore es la capa de respaldo y de sincronización entre dispositivos. Hay **tres sincronizaciones independientes**, cada una con su propio proyecto Firebase:

| Dominio | Colección/Documento | Proyecto |
|---|---|---|
| SCI (inventario, config, etc.) | `sci/main` | proyecto SCI |
| Cuaderno de Campo | `cuaderno/main` | `cuaderno-de-campo-d2922` |
| Presupuesto | `presupuesto/main` y `presupuesto/huerto2024` | proyecto SCI |

Notas clave:

- **El stock es derivado y NO se sincroniza.** Se recalcula desde los movimientos vigentes (excluye anulados). Tras aplicar un cambio remoto, si la firma de movimientos cambió, se ejecuta el recálculo de stock y luego un refresco seguro que solo redibuja vistas de consulta y nunca con un modal abierto (para no destruir un formulario en curso).
- Los stores de catálogo/configuración se fusionan por reemplazo directo; los acumulativos (movimientos, conteos, estimaciones, etc.) se sellan con marca de modificación para resolver ediciones concurrentes.
- Cada movimiento y salida de combustible lleva su propio correlativo por tipo.

---

## Roles y permisos

Modelo basado en permisos individuales (lista `PERMISSIONS`) agrupados en roles predefinidos (`ROLE_PERMS`):

| Rol | Alcance |
|---|---|
| **admin** | Acceso total, incluida auditoría y configuración. |
| **gerente** | Visualización de todos los módulos (solo lectura). |
| **agronomo** | Gestión completa del Cuaderno de Campo, terreno y heladas; ve inventario y presupuesto. |
| **operador** | Crea productos, movimientos, tomas y registra combustible y heladas. |
| **consulta** | Solo lectura de inventario y operación. |
| **opconteos** | Solo conteos en terreno, inventario de huerto y propuestas de estado. |
| **opcombustible** | Solo el formulario de salida de combustible. |

El administrador puede ajustar permisos por usuario más allá del rol base. El usuario inicial por defecto es `admin` (contraseña sembrada en la primera ejecución, cambiar de inmediato). Las contraseñas se guardan como hash SHA-256.

---

## Costeo e impuestos

- **Costo Promedio Ponderado (PPP)** por producto y bodega: las entradas recalculan el promedio; las salidas descuentan al costo vigente.
- Productos con **impuesto específico a combustibles** o **ILA**: solo se marcan los flags; los montos se ingresan al registrar la factura de compra.
- Tipos de documento tributario admitidos: Factura, Factura exenta, Guía de despacho, Boleta, Nota de crédito, Nota de débito.

---

## PWA, caché y versionado

- La app es instalable y funciona offline gracias al Service Worker (`service-worker.js`) con estrategia cache-first sobre un precache versionado; la red actualiza la caché en segundo plano.
- **Único punto de versión:** la constante `VERSION` en `service-worker.js`. Al cambiar cualquier módulo hay que subir `VERSION` **y** alinear las 10 referencias `?v=NN` de `index.html` (deben coincidir con el nombre de caché `sci-vNN`). Si no coinciden, el navegador puede servir una versión mezclada.
- Un normalizador global convierte a mayúsculas los campos de texto, salvo los marcados con `data-nouppercase`.

### Apariencia
Dos temas seleccionables en Configuración, recordados por dispositivo: **Azul corporativo** (estilo SAP, por defecto) y **Verde forestal**.

---

## Desarrollo y despliegue

No requiere instalación ni build. Para trabajar en local basta con servir la carpeta con cualquier servidor estático y abrir `index.html`.

Flujo de release:

1. Editar el módulo correspondiente en `js/`.
2. Verificar sintaxis de todos los módulos: `for f in js/*.js; do node --check "$f"; done`.
3. Subir `VERSION` en `service-worker.js` y actualizar las referencias `?v=NN` de `index.html`.
4. Publicar en `main` (GitHub Pages). La app tomará la nueva versión al recargar.

---

## Empresa

Sociedad Agrícola y Forestal La Cabaña Ltda. · Angol, Región de La Araucanía, Chile. Herramienta de uso interno; no está pensada para distribución pública.
