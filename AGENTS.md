# AGENTS.md — Mapa de contexto RUBRIPOST

Cliente HTTP de escritorio (estilo Postman/Bruno) de **Rubrifact / Rubri Systems**: crea, ejecuta y
organiza requests API con proyectos, colecciones, cookies, historial y actualizaciones automáticas.

## Stack y herramientas

- **Frontend:** React 19 + TypeScript 6 + Vite 8; Monaco Editor (`@monaco-editor/react`), Lucide, `clsx`.
- **Estado:** Zustand (stores por dominio, sin Context ni Redux).
- **Escritorio:** Tauri 2 (Rust 2024) + plugins `opener`, `dialog`, `updater`, `process`.
- **Backend nativo:** Rust con `tokio`, `reqwest` (HTTP real, cookies, sin CORS), `serde`.
- **Base de datos:** MongoDB (`rubripost_db`, driver `mongodb` 3.x; local o Atlas).
- **Seguridad:** contraseñas Argon2id; tokens/API Keys cifrados con AES-256-GCM en reposo.
- **UI auxiliar:** SweetAlert2 centralizado en `src/lib/alerts.ts`; notificaciones y diálogos propios.
- **Pruebas:** `node --test` (frontend/utilidades) y `cargo test` (Rust).

## Mapa de arquitectura

```text
package.json / vite.config.ts     # scripts npm, puerto fijo 1420, build relativo a ./dist
src/
├── main.tsx / App.tsx            # arranque (splash, tema) y shell: login o RubriApiView
├── store/
│   ├── apiStore.ts               # núcleo: workspace, colecciones, requests, draft, sync 5 s
│   ├── authStore.ts              # sesión persistida en localStorage, login/registro, perfil
│   ├── chatStore.ts              # estado efímero de lectura del chat por request
│   └── networkStore.ts           # online/offline y clasificación de fallos de red
├── components/
│   ├── auth/                     # LoginView (primer admin) y ProfileModal
│   ├── rubri/RubriApiView.tsx    # pantalla principal del cliente HTTP (orquesta todo)
│   ├── rubri/layout/             # sidebar (árbol drag&drop), topbar, switcher de proyecto, status bar
│   ├── rubri/request/            # barra URL+método, pestañas, menú de colección, chat de notas
│   ├── rubri/panels/             # Params, Body, Auth, Headers y Response (Monaco)
│   ├── rubri/overview/           # vista general del proyecto (estadísticas y carpetas)
│   ├── rubri/modal/              # modales de nombre/renombrar y exportación JSON
│   ├── cookies/                  # RubriCookiesModal: tarro de cookies por dominio
│   ├── historial/                # HistorialModal: bitácora filtrable
│   ├── proyectos/                # RubriProyectosModal: CRUD de proyectos
│   ├── common/                   # ResponseViewer: resaltado y formato de respuestas
│   ├── splash/ y system/         # SplashScreen, GlobalErrorBoundary, OfflineBanner
│   └── rubri/constants.ts|types.ts  # opciones de método, intervalos, tipos compartidos
├── hooks/useAppUpdater.ts        # ciclo del updater de Tauri (check, descarga, instalación)
└── lib/
    ├── httpClient.ts             # invoke a Rust (`enviar_request`, cookies) con fallback fetch
    ├── alerts.ts / audit.ts      # SweetAlert2 unificado / registro de cambios en `historial`
    ├── queryParams.ts            # la URL es la fuente de verdad de los query params
    ├── collectionHierarchy.ts / requestOrder.ts  # drag&drop: jerarquía, ciclos y orden
    ├── chat.ts / chatNotes.ts    # chat persistido en MongoDB y notas locales del draft
    ├── jsonExport.ts / workspaceOverview.ts       # exportación JSON / filas del overview
    ├── *Preferences.ts, collectionCache.ts        # preferencias y caché en localStorage
    ├── monacoSetup.ts            # Monaco empaquetado local (offline, sin CDN)
    └── history.ts / async.ts / autoScroll.ts      # filtros de bitácora y utilidades
src-tauri/src/
├── lib.rs                        # registra plugins y TODOS los comandos `invoke`
├── main.rs                       # entrada del binario
├── config.rs                     # resuelve `MONGODB_URI` (.env, junto al .exe, %APPDATA%, embebido)
├── mongo.rs                      # cliente perezoso + requests/colecciones (`api_requests`) + cifrado
├── proyectos.rs                  # CRUD de `proyectos` (código = `eid`, cascada al renombrar)
├── auth.rs                       # `usuarios` (Argon2id) e `historial` (bitácora)
├── chat.rs                       # mensajes del chat (workspace/request)
├── http.rs                       # `enviar_request` con reqwest y tarro de `cookies`
├── export.rs                     # guardado JSON con diálogo nativo
└── fechas.rs                     # serialización BSON DateTime tolerante a texto RFC 3339
tests/                            # exportHistory.test.mjs y requestOrder.test.mjs (node --test)
scripts/                          # verificación de versión y firmas del updater
.github/workflows/release.yml     # build y release firmado (tag vX.Y.Z)
```

## Flujo de datos / comunicación

- **UI → estado:** los componentes leen y mutan los stores de Zustand (`useApiStore`, `useAuthStore`, etc.);
  no hay HTTP directo desde componentes.
- **UI → Rust:** `src/lib/*` llama comandos Tauri con `invoke` (`get_api_workspace`, `save_api_request_full`,
  `enviar_request`, `login`, …); `lib.rs` los registra y cada módulo los implementa.
- **Rust → MongoDB:** `mongo.rs` mantiene un `Client` perezoso compartido. Requests y colecciones conviven en
  `api_requests` y se distinguen por `tipo` (`request` | `collection`); todo se filtra por `eid` (proyecto).
- **Sincronización:** `apiStore` consulta (`get_api_workspace`) cada **5 s** y al recuperar el foco; conserva
  el draft local sin guardar y descarta respuestas de sondeo desordenadas.
- **HTTP exterior:** `enviar_request` ejecuta la petición con `reqwest`, guarda `Set-Cookie` en `cookies` y
  reenvía las del dominio; en modo web (Vite) cae a `fetch` y sí sufre CORS.
- **Secretos:** tokens/API Keys se cifran (AES-256-GCM) antes de escribir y las fechas se guardan como BSON.

## Comandos

```bash
npm install                     # instalar dependencias
npm run tauri dev               # desarrollo completo (Vite 1420 + Rust)
npm run dev                     # solo frontend web (fallback fetch, sin cookies reales)
npm run build                   # tsc + vite build → dist/
npm run tauri build             # ejecutable instalable (Rust release)
npm run test                    # pruebas Node (tests/*.test.mjs)
cd src-tauri && cargo test --lib                    # pruebas Rust
cd src-tauri && cargo test --lib -- --ignored       # integración con MongoDB local
npm run verify:release          # versión coherente en package.json/Cargo.toml/tauri.conf.json
```

Variables de entorno: copiar `.env.example` a `.env` y definir `MONGODB_URI` (Atlas o MongoDB compartido
para multi-PC; `127.0.0.1` solo local). En el `.exe` se puede usar `rubripost.env` o `RUBRIPOST_ENV`.

## Reglas para el agente

- **Ir directo** a los archivos indicados en el prompt; no escanear todo el repositorio innecesariamente
  (usar este mapa y `grep` acotado).
- **Respetar el tipado estricto** (`tsc`, sin `any` implícitos) y las convenciones existentes: stores Zustand,
  componentes por carpeta con su `.css`, comandos Rust que devuelven `Result<T, String>`, comentarios en español.
- **UI:** mantener modo oscuro minimalista y consistente, scrollbars neutras, y usar `alerts.ts` (SweetAlert2)
  para todas las confirmaciones y errores.
- **Actualizar este `AGENTS.md`** únicamente al agregar módulos, rutas o carpetas principales nuevas.
- Si creas archivos o scripts temporales para verificar un cambio, elimínalos automáticamente antes de dar por terminada la tarea.
