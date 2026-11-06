//! Resolución de la configuración de la aplicación.
//!
//! En desarrollo, Tauri arranca con el directorio del proyecto como `cwd`, así
//! que `dotenvy::from_filename(".env")` funcionaba. En el `.exe` empaquetado el
//! `cwd` es el que tenga el acceso directo y el `.env` del proyecto ya no
//! existe: el proceso arrancaba sin `MONGODB_URI` y por eso la app "no
//! conectaba" con MongoDB.
//!
//! Este módulo busca la configuración en este orden (el primero que exista
//! gana, sin sobrescribir variables ya definidas por el sistema):
//!
//! 1. La ruta indicada en `RUBRIPOST_ENV`.
//! 2. `rubripost.env` / `.env` junto al ejecutable.
//! 3. `resources/rubripost.env` junto al ejecutable (macOS/instaladores que
//!    copian los recursos en una subcarpeta).
//! 4. `%APPDATA%\com.gonza.rubripost\rubripost.env` (o el equivalente en
//!    Linux/macOS), para poder cambiar la conexión sin recompilar.
//! 5. `.env` del directorio actual y de sus padres (desarrollo).
//! 6. Respaldo embebido en el binario al compilar (`build.rs` copia el `.env`
//!    de la raíz del proyecto), de modo que el `.exe` funciona incluso si el
//!    instalador no copió ningún archivo de entorno.

use std::path::{Path, PathBuf};

use once_cell::sync::OnceCell;

// Archivo generado por `build.rs` con el contenido del `.env` al compilar.
include!(concat!(env!("OUT_DIR"), "/env_embebido.rs"));

/// Origen desde el que se cargó la configuración (para logs y diagnósticos).
static ORIGEN: OnceCell<Option<String>> = OnceCell::new();

/// Nombre del archivo de configuración que se puede dejar junto al ejecutable.
const ENV_NAME: &str = "rubripost.env";
const IDENTIFIER: &str = "com.gonza.rubripost";

fn directorio_ejecutable() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|ruta| ruta.parent().map(Path::to_path_buf))
}

fn directorio_configuracion() -> Option<PathBuf> {
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return Some(PathBuf::from(appdata).join(IDENTIFIER));
    }
    if let Some(home) = std::env::var_os("HOME") {
        return Some(
            PathBuf::from(home)
                .join(".config")
                .join(IDENTIFIER),
        );
    }
    None
}

/// Rutas candidatas, en orden de prioridad.
fn candidatos() -> Vec<PathBuf> {
    let mut rutas: Vec<PathBuf> = Vec::new();

    if let Some(ruta) = std::env::var_os("RUBRIPOST_ENV") {
        rutas.push(PathBuf::from(ruta));
    }

    if let Some(dir) = directorio_ejecutable() {
        rutas.push(dir.join(ENV_NAME));
        rutas.push(dir.join(".env"));
        rutas.push(dir.join("resources").join(ENV_NAME));
        rutas.push(dir.join("resources").join(".env"));
    }

    if let Some(dir) = directorio_configuracion() {
        rutas.push(dir.join(ENV_NAME));
        rutas.push(dir.join(".env"));
    }

    if let Ok(actual) = std::env::current_dir() {
        let mut dir = Some(actual.as_path());
        // El `.env` vive en la raíz del proyecto, un nivel arriba de src-tauri.
        for _ in 0..3 {
            if let Some(ruta) = dir {
                rutas.push(ruta.join(".env"));
                rutas.push(ruta.join(ENV_NAME));
                dir = ruta.parent();
            }
        }
    }

    rutas
}

/// Carga las variables de entorno una única vez por proceso.
///
/// Devuelve el archivo usado, o `None` si se usó el respaldo embebido.
pub fn cargar() -> Option<String> {
    ORIGEN
        .get_or_init(|| {
            for ruta in candidatos() {
                if !ruta.is_file() {
                    continue;
                }

                match dotenvy::from_path(&ruta) {
                    Ok(_) => {
                        log::info!("Configuración cargada desde {}", ruta.display());
                        return Some(ruta.display().to_string());
                    }
                    Err(error) => {
                        log::warn!(
                            "No se pudo leer la configuración {}: {}",
                            ruta.display(),
                            error
                        );
                    }
                }
            }

            cargar_embebido()
        })
        .clone()
}

/// Aplica el `.env` embebido al compilar (respaldo para el ejecutable).
fn cargar_embebido() -> Option<String> {
    if ENV_EMBEBIDO.trim().is_empty() {
        log::warn!(
            "No se encontró ningún archivo de configuración. Deja '{}' junto al ejecutable \
             o define MONGODB_URI en las variables de entorno.",
            ENV_NAME
        );
        return None;
    }

    match dotenvy::from_read(ENV_EMBEBIDO.as_bytes()) {
        Ok(_) => {
            log::info!("Configuración cargada desde el respaldo embebido en el binario");
            Some("(embebido en el binario)".to_string())
        }
        Err(error) => {
            log::warn!("No se pudo aplicar el respaldo embebido: {}", error);
            None
        }
    }
}

/// Mensaje de error explicativo con las rutas donde se buscó la configuración.
pub fn mensaje_sin_mongo() -> String {
    let mut rutas: Vec<String> = candidatos()
        .into_iter()
        .map(|ruta| format!("  · {}", ruta.display()))
        .collect();
    rutas.dedup();

    format!(
        "MONGODB_URI no está definida: la app no puede conectarse a MongoDB.\n\
         Crea un archivo '{ENV_NAME}' junto al ejecutable (o en la carpeta de \
         configuración del usuario) con las mismas variables que .env.\n\
         Rutas revisadas:\n{}",
        rutas.join("\n")
    )
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_respaldo_embebido_define_la_uri_de_mongo() {
        // En un clon sin `.env` el respaldo está vacío: no hay nada que validar.
        if ENV_EMBEBIDO.trim().is_empty() {
            return;
        }

        let claves: Vec<String> = dotenvy::from_read_iter(ENV_EMBEBIDO.as_bytes())
            .filter_map(Result::ok)
            .map(|(clave, _)| clave)
            .collect();

        assert!(
            claves.iter().any(|clave| clave == "MONGODB_URI"),
            "el respaldo embebido debe incluir MONGODB_URI (claves: {claves:?})"
        );
    }

    #[test]
    fn busca_la_configuracion_junto_al_ejecutable() {
        let rutas = candidatos().iter().map(|r| r.display().to_string()).collect::<Vec<_>>();

        // El ejecutable empaquetado no comparte cwd con el proyecto: la
        // carpeta del .exe debe estar entre las rutas revisadas.
        let exe_dir = directorio_ejecutable().expect("carpeta del ejecutable");
        assert!(
            rutas.iter().any(|ruta| ruta == &exe_dir.join(ENV_NAME).display().to_string()),
            "faltó {ENV_NAME} junto al ejecutable: {rutas:?}"
        );
    }
}
