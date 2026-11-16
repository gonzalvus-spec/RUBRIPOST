![RubriPost — Cliente HTTP de escritorio](src/assets/rubripost-banner.svg)

# RubriPost · API Client

Cliente HTTP de escritorio de **Rubrifact (Rubri Systems)** para crear, ejecutar y organizar peticiones API. Desarrollado con **Tauri 2, React 19, TypeScript, Monaco Editor y Zustand**, con datos persistidos en **MongoDB**.

## Funcionalidades

- **Peticiones HTTP:** editor JSON, parámetros, headers, autenticación y visualización de respuestas.
- **Proyectos y colecciones:** espacios independientes, subcolecciones, búsqueda, duplicación y organización mediante arrastrar y soltar.
- **Persistencia y sincronización:** requests y colecciones en MongoDB; actualización entre equipos cada **5 segundos** y al recuperar el foco.
- **Cookies por proyecto:** gestión por dominio y envío automático a través del cliente nativo de Rust (`reqwest`).
- **Seguridad:** inicio de sesión con contraseñas **Argon2id** y cifrado **AES-256-GCM** para tokens y API Keys almacenados.
- **Historial:** registro de acciones por usuario y proyecto, con filtros.
- **Exportación JSON:** colecciones y subcolecciones, excluyendo credenciales sensibles de forma predeterminada.
- **Interfaz:** pestañas de requests, vista general del proyecto, panel de notas por petición y avisos de cambios sin guardar.
- **Actualizaciones:** comprobación e instalación de versiones publicadas mediante GitHub Releases.

## Requisitos

- **Node.js 20+**
- **Rust 1.85+**
- **MongoDB 6+** o **MongoDB Atlas**

## Instalación y ejecución

```bash
npm install
```

Copia `.env.example` como `.env` y configura la conexión:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
```

Inicia la aplicación en desarrollo:

```bash
npm run tauri dev
```

Genera el ejecutable:

```bash
npm run tauri build
```

> **Primer acceso:** si la base de datos aún no tiene usuarios, la pantalla de inicio de sesión permite crear el primer administrador.

## Uso en varios equipos

Para compartir proyectos y peticiones, todas las instalaciones deben conectarse a **la misma base de datos MongoDB** (por ejemplo, MongoDB Atlas). `127.0.0.1` apunta a la base local de cada equipo y **no** permite compartir datos entre distintas PCs.

La aplicación sincroniza los datos cada **5 segundos** y conserva los cambios locales que aún no se han guardado.

## Configuración del ejecutable

La variable principal es `MONGODB_URI`. En la versión compilada, puedes cambiar la conexión sin recompilar colocando un archivo `rubripost.env` junto al `.exe`:

```env
MONGODB_URI=mongodb+srv://USUARIO:CONTRASENA@CLUSTER.mongodb.net/
```

También se admite `RUBRIPOST_ENV` para indicar una ruta de configuración. El build puede incluir una configuración de respaldo; **evita incorporar credenciales de producción en el binario**.

## Arquitectura

| Capa | Tecnologías / componentes |
| --- | --- |
| Interfaz | React 19, TypeScript, Monaco Editor |
| Estado | Zustand |
| Escritorio y HTTP | Tauri 2, Rust, `reqwest` |
| Base de datos | MongoDB (`rubripost_db`) |
| Seguridad | Argon2id, AES-256-GCM |

La colección `api_requests` almacena tanto peticiones como carpetas (diferenciadas por `tipo`). Las colecciones `proyectos`, `usuarios`, `historial` y `cookies` gestionan el resto de la información.

## Atajos

| Acción | Atajo |
| --- | --- |
| Guardar | `Ctrl + S` |
| Enviar petición | `Ctrl + Enter` |
| Actualizar | `Ctrl + R` |

## Pruebas

```bash
cd src-tauri
cargo test --lib
```

Para ejecutar las pruebas de integración que requieren MongoDB local:

```bash
cargo test --lib -- --ignored --nocapture
```

## Publicación de actualizaciones

Actualiza la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`; crea y publica un tag `vX.Y.Z`. El workflow `.github/workflows/release.yml` genera el release firmado si están configurados los secretos `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

> **Nota:** en la app de escritorio las peticiones usan Rust (`reqwest`) y no están sujetas al CORS del navegador. El modo web de desarrollo usa `fetch` y sí mantiene esas restricciones.
