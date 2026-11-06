# RUBRIFACT API CLIENT (RUBRIPOST)

Cliente HTTP de escritorio de **RUBRIFACT** (Rubri Systems),
construido con **Tauri 2 + React 19 + TypeScript + Monaco Editor + Zustand** y
persistencia total de requests en **MongoDB**.

## Características

- **Cookies estilo Bruno, por proyecto**: las requests se envían con el cliente
  nativo (reqwest), así que se leen y reenvían las cookies reales. Lo recibido
  por `Set-Cookie` se guarda en la colección `cookies` de MongoDB asociado al
  proyecto (`eid`) y al dominio —no a la request, ni al método, ni a la
  colección—. El botón de cookies de la barra superior abre el tarro del
  proyecto completo: crear, editar, borrar, vaciar por dominio o todo, y
  desactivar el envío automático (se recuerda entre sesiones).
- **Multi-proyecto con CRUD**: cada proyecto es un espacio de trabajo
  aislado (su código es el `eid` de requests, colecciones y cookies). Se crean,
  editan y eliminan desde el selector de la barra superior: nombre, código,
  descripción y color. Cambiar el código migra todo el contenido del proyecto y
  el borrado puede arrastrar sus requests y cookies (o conservarlas). El
  proyecto activo se recuerda entre sesiones.
- **Acceso con usuarios de MongoDB**: al abrir la app hay que iniciar sesión.
  Las contraseñas se guardan con **Argon2id** en la colección `usuarios`. Si la
  base no tiene usuarios todavía, la misma pantalla crea el primer
  administrador.
- **Bitácora de cambios**: cada acción (crear, editar, renombrar, duplicar,
  mover o eliminar requests y colecciones, además de ingresos y salidas) queda
  registrada en `historial` con usuario, entidad, detalle y fecha/hora. Se
  consulta desde el botón de reloj de la barra superior.
- **Persistencia total**: se guardan `eid`, `nombre`, `contexto`, `metodo`, `url`,
  `body`, `headers`, `query_descripciones`, `auth`, `http_info`, `timestamp`,
  `updated_at` y `version`.
- **Query params**: la pestaña Params es una tabla `Key` / `Value` / `Description`
  sincronizada con la URL: cada edición reescribe la query (`?clave=valor`), así
  que lo que se ve es exactamente lo que se envía y se guarda. Las filas sin
  `Key` quedan pendientes y no viajan; las descripciones se guardan aparte en
  `query_descripciones` porque no forman parte de la URL.
- **Colecciones estilo Postman**: crea, renombra, duplica y elimina colecciones;
  cada request vive dentro de una colección. Todo se guarda en la **misma**
  colección de MongoDB (`api_requests`), sin historial aparte.
- **Upsert idempotente**: "Guardar" actualiza el documento si ya existe
  (`lastSavedId`); si es nueva, pide el nombre y la inserta.
- **Sincronización en vivo entre PCs**: la app consulta MongoDB cada 5 s (y al
  recuperar el foco) y refleja al instante las colecciones y requests que otra
  PC haya creado, editado o eliminado. Nunca pisa cambios locales sin guardar.
- **Secrets cifrados**: tokens Bearer y API Keys se cifran con **AES-256-GCM**
  antes de escribirse en MongoDB y se descifran al recuperarlos.
- **Editor Monaco** con validación JSON en tiempo real, tema Rubrifact y
  empaquetado local (sin CDN, funciona offline).
- **Interfaz estilo Postman**: barra superior con pestañas de requests abiertas,
  sidebar plano con métodos coloreados, breadcrumb colección › request, barra de
  URL con los botones Guardar y Enviar integrados, tabs horizontales
  (Params/Body/Auth/Headers) y barra de estado inferior. Paleta Rubrifact (verde
  esmeralda + dorado).
- **Sidebar** con árbol de colecciones, buscador, contador por colección,
  nombre de request, método, duplicar, renombrar (lápiz) y eliminar con
  confirmación.
- **Dirty state**: punto dorado y badge "Sin guardar" cuando hay cambios.
- **Alertas SweetAlert2** con el diseño de la empresa para confirmaciones,
  éxitos y errores.
- **Atajos**: `Ctrl+S` guardar · `Ctrl+Enter` enviar · `Ctrl+R` refrescar.
- **Límite de 1 MB** para el body (validado en frontend y backend).
- **GET** nunca persiste body.
- **Índices MongoDB** `{ eid, tipo, timestamp }` y
  `{ eid, tipo, coleccion_id, timestamp }` creados automáticamente.

## Requisitos

- Node.js 20+
- Rust 1.85+ (edición 2024)
- MongoDB 6+ local o MongoDB Atlas

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env` y completa los valores:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=rubripost_db
   RUBRIPOST_AUTH_KEY=una-clave-larga-y-aleatoria
   VITE_RUBRI_EID=EMP-0042
   # VITE_RUBRI_TOKEN=...   (opcional)
   ```

   > `RUBRIPOST_AUTH_KEY` es la clave maestra de cifrado. Si la cambias, los
   > tokens ya guardados no podrán descifrarse.

3. Ejecuta en desarrollo:

   ```bash
   npm run tauri dev
   ```

4. Build de producción:

   ```bash
   npm run tauri build
   ```

### Cómo encuentra la configuración el .exe

Variables: `MONGODB_URI`, `MONGODB_DB`, `VITE_RUBRI_EID` y `RUBRIPOST_AUTH_KEY`
(ver `.env.example`). La app las busca en este orden, sin pisar las que ya estén
definidas en el sistema:

1. La ruta indicada en la variable `RUBRIPOST_ENV`.
2. `rubripost.env` o `.env` **junto al ejecutable** (la carpeta del `.exe`).
3. `resources/rubripost.env` junto al ejecutable (instaladores/macOS).
4. `%APPDATA%\com.gonza.rubripost\rubripost.env` (Linux/macOS:
   `~/.config/com.gonza.rubripost/rubripost.env`).
5. `.env` del directorio actual o de sus padres (desarrollo).
6. Respaldo **embebido en el binario**: `build.rs` copia el `.env` de la raíz al
   compilar, así el `.exe` conecta a MongoDB aunque el instalador no copie
   ningún archivo.

Por eso, para que la build empaquetada se conecte, compila con el `.env`
presente (`npm run tauri build`). Si más adelante cambias de base de datos sin
recompilar, deja un `rubripost.env` junto al `.exe` (o en la carpeta de
configuración del usuario) con las nuevas variables: tiene prioridad sobre el
respaldo embebido. El registro de la app (`RUST_LOG=info`) indica de qué archivo
se cargó la configuración.

## Uso simultáneo en 2 PCs

La app **siempre escribe en MongoDB**; para que dos PCs vean los mismos cambios
ambas deben apuntar a la **misma base de datos compartida**. Con
`MONGODB_URI=mongodb://127.0.0.1:27017` cada PC guarda en su propio MongoDB
local y nunca se verán entre sí.

1. Elige un MongoDB compartido:
   - **MongoDB Atlas** (recomendado): `mongodb+srv://...` accesible desde
     cualquier red.
   - **Servidor LAN**: en la PC servidor arranca `mongod --bind_ip 0.0.0.0` y
     usa `mongodb://192.168.x.x:27017` desde ambas PCs (abre el puerto 27017).
2. Copia el **mismo** `.env` en las dos PCs:

   ```env
   MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/
   MONGODB_DB=rubripost_db
   RUBRIPOST_AUTH_KEY=la-misma-clave-en-las-dos-pcs
   VITE_RUBRI_EID=EMP-0042
   ```

   > `RUBRIPOST_AUTH_KEY` debe ser idéntica en ambas PCs; si no, los tokens
   > cifrados en una no se podrán descifrar en la otra.
3. Abre la app en ambas. El indicador **En vivo** de la barra superior confirma
   la conexión; si falla muestra **Sin conexión** en rojo.

La sincronización consulta MongoDB cada **5 segundos** y al recuperar el foco de
la ventana. Si una request abierta cambió en la otra PC y aquí no hay cambios sin
guardar, se recarga automáticamente. Si hay ediciones locales, se conservan y
gana el último guardado (control de versión por `version`).

## Acceso y bitácora

La app pide usuario y contraseña contra MongoDB antes de mostrar el cliente:

1. **Primer arranque** (colección `usuarios` vacía): la pantalla de login pide
   usuario, nombre y contraseña para crear el **primer administrador**.
2. **A partir de ahí**: quien tenga rol `admin` puede crear más usuarios desde
   el botón **Nuevo usuario** del historial (se pide su propia contraseña como
   confirmación).
3. El nombre del usuario activo y el botón para cerrar sesión están en la
   esquina superior derecha.

### Colecciones de MongoDB

| Colección | Contenido |
| --- | --- |
| `usuarios` | `usuario` (único, minúsculas), `nombre`, `password_hash` (Argon2id), `rol`, `activo`, `creado_en`, `ultimo_acceso`. |
| `historial` | `usuario`, `accion`, `entidad` (`request`/`collection`/`proyecto`/`usuario`/`sesion`), `entidad_id`, `nombre`, `detalle`, `fecha`. |
| `proyectos` | `codigo` (único, es el `eid`), `nombre`, `descripcion`, `color`, `timestamp`, `updated_at`. |
| `cookies` | Tarro por proyecto y dominio: `eid`, `dominio`, `nombre`, `valor`, `ruta`, `expira`, `seguro`, `http_only`. |

La fecha y hora de cada entrada del historial las genera el backend (UTC), no el
navegador.

## Proyectos

La app trabaja con varios **proyectos** dentro de la misma base de datos. Cada
proyecto guarda su propio tarro de cookies, sus colecciones y sus requests: todo
se filtra por el `eid`, que es el código del proyecto.

- El **selector de la barra superior** muestra el proyecto activo (nombre,
  código y color) y permite cambiar con un clic, buscar entre proyectos, ver
  cuántas requests y colecciones tiene cada uno, crear uno nuevo o abrir la
  gestión.
- **Gestión de proyectos** (botón *Gestionar*): alta y edición de nombre,
  código, descripción y color, y borrado con dos modos — *Solo proyecto* (deja
  el contenido en MongoDB) o *Con contenido* (elimina además requests y
  cookies). Nunca se puede quedar sin proyectos: el último no se puede borrar.
- **Cambiar el código** de un proyecto migra en el acto sus requests y cookies
  al nuevo `eid`, así que renombrar `EMP-0042` a `EMP-2026` no pierde datos.
- En el primer arranque (cuando todavía no hay ningún proyecto), los `eid` que
  ya existan en `api_requests` o `cookies` se adoptan como proyectos, de forma
  que los datos anteriores aparecen sin migración manual. El proyecto activo se
  guarda en el equipo y se restaura al abrir la app.
- Cada cambio de proyecto queda en la bitácora (`historial`) con la entidad
  `proyecto`.

### Colecciones

Además del CRUD desde el sidebar, el selector de colección de la request es un
menú propio (no el `<select>` del sistema): muestra el color y el contador de
requests de cada colección, permite buscar cuando hay muchas y ofrece **Nueva
colección** sin salir de la request. Se cierra con Escape o al hacer clic fuera.

## Cookies

Igual que en Bruno, la app mantiene un tarro de cookies, pero **a nivel de
proyecto**: no depende de la request abierta, del método HTTP ni de la colección.

- Las requests se ejecutan **de forma nativa** (`reqwest`), no con el `fetch`
  del webview. Eso permite enviar la cabecera `Cookie` y leer `Set-Cookie`,
  cosas que el navegador bloquea, y de paso elimina los problemas de CORS.
- Cada cookie se guarda en la colección `cookies` de MongoDB con
  `eid`, `dominio`, `nombre`, `valor`, `ruta`, `expira`, `seguro` y `http_only`.
  La clave lógica es `proyecto + dominio + nombre + ruta`, así que dos requests
  del mismo dominio comparten la misma sesión, y una cookie `Domain=.ejemplo.com`
  se envía también a sus subdominios.
- El envío automático filtra por el **dominio y la ruta de la URL** de cada
  request (comportamiento de navegador): cualquier request del proyecto que
  apunte a ese dominio manda sus cookies, sin que importe en qué colección esté
  guardada ni qué método use.
- El botón **Cookies** de la barra superior abre el tarro del proyecto. Ahí se
  ven todas las cookies agrupadas por dominio, se buscan por dominio, nombre o
  valor, se crean a mano (dominio, nombre, valor, ruta y expiración), se editan,
  se borran una por una, se vacía un dominio (y sus subdominios) o el tarro
  completo. El interruptor **Enviar cookies** desactiva el envío automático sin
  borrar nada y se recuerda en la siguiente apertura.
- Cuando el servidor devuelve `Set-Cookie`, la cookie se guarda y el tarro se
  refresca automáticamente después de cada envío. Las cookies con
  `Max-Age`/`Expires` vencidas se eliminan.

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| `src-tauri/src/http.rs` | Envío nativo de requests (reqwest) con tarro de cookies en MongoDB: `enviar_request`, `listar_cookies`, `guardar_cookie`, `eliminar_cookie`, `limpiar_cookies`. |
| `src-tauri/src/proyectos.rs` | CRUD de proyectos (colección `proyectos`): listado con adopción de `eid`, alta/edición con migración de código y borrado opcional en cascada. |
| `src-tauri/src/auth.rs` | Login con Argon2id, alta de usuarios y bitácora de cambios (`usuarios` e `historial`). |
| `src-tauri/src/mongo.rs` | Conexión lazy (pool reutilizable), índices, migración, cifrado AES-256-GCM y comandos Tauri de requests y colecciones. |
| `src-tauri/src/config.rs` | Resolución de la configuración (`.env`, `rubripost.env` junto al `.exe`, carpeta de usuario y respaldo embebido). |
| `src-tauri/src/lib.rs` | Carga de la configuración, logging y registro de comandos en `tauri::Builder`. |
| `src-tauri/src/main.rs` | Punto de entrada del binario (`rubripost_lib::run()`). |
| `src/store/authStore.ts` | Sesión activa (usuario, rol), login, alta de usuarios y cierre de sesión. |
| `src/lib/httpClient.ts` | Cliente HTTP de la UI: usa los comandos nativos y cae a `fetch` cuando corre en el navegador. |
| `src/components/cookies/RubriCookiesModal.tsx` | Tarro de cookies del proyecto: listado por dominio, alta/edición, borrado, vaciado y envío automático. |
| `src/lib/audit.ts` | Envía a MongoDB el registro de cada cambio junto al usuario autenticado. |
| `src/components/auth/` | Pantalla de acceso y creación del primer administrador. |
| `src/components/proyectos/RubriProyectosModal.tsx` | Gestión de proyectos: listado, alta, edición, borrado con o sin contenido. |
| `src/components/historial/` | Modal con la bitácora (filtro por usuario, alta de usuarios para admin). |
| `src/store/apiStore.ts` | Estado global Zustand, dirty state, CRUD contra MongoDB y sincronización en vivo (sondeo cada 5 s). |
| `src/App.tsx` | Shell de la aplicación: monta la vista del cliente HTTP. |
| `src/components/rubri/RubriApiView.tsx` | Orquestador de la vista: estado compartido, handlers, atajos y composición de módulos. |
| `src/components/rubri/layout/` | `RubriTopbar`, `RubriProyectoSwitcher` (selector de proyecto), `RubriSidebar` (árbol, búsqueda y drag & drop), `RubriStatusBar` y `RubrifactLogo`, cada uno con su `.css`. |
| `src/components/rubri/request/` | `RubriRequestHeader` (breadcrumb), `RubriCollectionMenu` (selector de colección propio), `RubriRequestBar` (método + URL + acciones) y `RubriRequestTabs` (Params / Body / Auth / Headers). |
| `src/components/rubri/panels/` | `RubriQueryPanel` (query params), `RubriBodyPanel` (Monaco), `RubriAuthPanel`, `RubriHeadersPanel`, `RubriResponsePanel` y `RubriPanel.css` (estructura común de panel). |
| `src/lib/queryParams.ts` | Lectura y reescritura de la query de la URL (`splitQuery`, `urlWithQuery`), fuente de verdad de la pestaña Params. |
| `src/components/rubri/modal/` | `RubriNameModal`: guardar y renombrar requests y colecciones. |
| `src/components/rubri/constants.ts` · `types.ts` | Constantes (tokens, métodos, textos del modal) y tipos compartidos de la vista. |
| `src/components/common/ResponseViewer.tsx` | Visor de respuesta con resaltado raw / JSON / XML. |
| `src/lib/alerts.ts` | Capa de alertas SweetAlert2 con el tema Rubrifact (toasts y confirmaciones). |
| `src/lib/monacoSetup.ts` | Workers locales de Monaco + tema `rubrifact-dark`. |
| `src/App.css` | Design system Rubrifact (tokens, base, botones e iconos, colores por método HTTP). |

### Comandos Tauri

| Comando | Descripción |
| --- | --- |
| `get_api_workspace(filter)` | Devuelve colecciones + requests del `eid` en una sola instantánea. |
| `save_api_request_full(payload)` | Inserta o actualiza (upsert por `_id`). Devuelve el `_id`. |
| `get_api_requests_full(filter)` | Lista documentos completos por `eid` (máx. 500). |
| `delete_api_request(id)` | Elimina por `_id`. |
| `duplicate_api_request(id)` | Duplica añadiendo `" (copia)"`. Devuelve el nuevo `_id`. |
| `save_api_collection(payload)` | Crea o renombra una colección. Devuelve el `_id`. |
| `delete_api_collection(payload)` | Elimina la colección y, por defecto, sus requests (`delete_requests`). |
| `duplicate_api_collection(id)` | Copia la colección con todas sus requests. |
| `move_api_request(payload)` | Mueve una request a otra colección (`id`, `coleccion_id`). |
| `listar_proyectos()` | Proyectos con sus conteos; adopta los `eid` que ya existen en los datos. |
| `guardar_proyecto(payload)` | Crea o edita un proyecto (`id`, `codigo`, `nombre`, `descripcion`, `color`); al cambiar `codigo` migra el contenido. |
| `eliminar_proyecto(payload)` | Elimina un proyecto y, con `cascada`, sus requests y cookies. |
| `enviar_request(payload)` | Ejecuta la request en Rust (sin CORS) enviando las cookies del dominio y guardando las de `Set-Cookie`. |
| `listar_cookies(payload)` | Cookies del proyecto; con `url` solo las que aplican a ese dominio. |
| `guardar_cookie(payload)` | Crea o edita una cookie del proyecto (dominio, nombre, valor, ruta, expiración). |
| `eliminar_cookie(payload)` | Elimina una cookie por `id`. |
| `limpiar_cookies(payload)` | Vacía el tarro del proyecto, o solo el de un dominio con `dominio`. |

### Colección MongoDB

Base de datos: `MONGODB_DB` (por defecto `rubripost_db`).
Colección: `api_requests` — **una sola colección** para todo. El campo `tipo`
distingue los dos tipos de documento.

**Request** (`tipo: "request"`):

```json
{
  "_id": "ObjectId",
  "tipo": "request",
  "eid": "EMP-0042",
  "nombre": "Buscar XML Factura 1300",
  "contexto": "Extracción XML",
  "metodo": "POST",
  "url": "",
  "body": "{ \"numero\": \"1300\" }",
  "headers": { "Content-Type": "application/json" },
  "query_descripciones": { "numero": "Número de factura" },
  "auth": { "kind": "bearer", "token": "enc:v1:..." },
  "http_info": { "status_code": 200, "duration_ms": 321 },
  "coleccion_id": "6ae7b3dcf0338c09dabaddc7",
  "timestamp": "ISODate",
  "updated_at": "ISODate",
  "version": 3
}
```

**Colección** (`tipo: "collection"`):

```json
{
  "_id": "ObjectId",
  "tipo": "collection",
  "eid": "EMP-0042",
  "nombre": "Facturación SUNAT",
  "color": "#C5A059",
  "orden": 0,
  "timestamp": "ISODate",
  "updated_at": "ISODate"
}
```

> **Migración automática**: los documentos antiguos sin `tipo` se marcan como
> `request` y las requests sin `coleccion_id` se adoptan en la primera colección
> del EID (se crea `General` si no existe). Así nunca queda un "historial"
> separado de las colecciones.

### Colección `proyectos`

```json
{
  "_id": "ObjectId",
  "codigo": "EMP-0042",
  "nombre": "RUBRIFACT Producción",
  "descripcion": "API de facturación",
  "color": "#0A8F4E",
  "timestamp": "ISODate",
  "updated_at": "ISODate"
}
```

`codigo` es único (índice `codigo_unico`) y es el `eid` que usan `api_requests`
y `cookies`.

## Pruebas

```bash
# Unitarias (cifrado y límites) + integración con MongoDB local
cd src-tauri
cargo test --lib
cargo test --lib -- --ignored --nocapture
```

## Nota sobre CORS

Las peticiones se ejecutan en Rust con `reqwest`, por lo que **no** aplican las
restricciones CORS del webview: cualquier API responde igual que desde `curl`.
En el navegador (solo desarrollo web) se usa `fetch` como respaldo, con las
limitaciones normales de CORS y sin cookies reales.
