//! Autenticación de usuarios y bitácora de cambios en MongoDB.
//!
//! - Colección `usuarios`: credenciales con hash Argon2id (PHC string).
//! - Colección `historial`: una entrada por acción realizada, con usuario,
//!   acción, entidad afectada y fecha/hora (UTC) generada en el servidor.
//!
//! Los comandos se exponen a la UI mediante Tauri.

use chrono::{DateTime, Utc};
use mongodb::bson::{Document, doc, oid::ObjectId};
use mongodb::{Collection, IndexModel};
use serde::{Deserialize, Serialize};

use argon2::password_hash::{PasswordHash, PasswordHasher, SaltString, rand_core::OsRng};
use argon2::{Argon2, PasswordVerifier};

use crate::fechas::{fecha_bson_o_texto, fecha_opcional_bson_o_texto};
use crate::mongo::get_client;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const USUARIOS_COLLECTION: &str = "usuarios";
const HISTORIAL_COLLECTION: &str = "historial";
const DEFAULT_DB: &str = "rubripost_db";
const GLOBAL_PROJECT_ID: &str = "GLOBAL";
const ROL_ADMIN: &str = "admin";
const ROL_USUARIO: &str = "usuario";

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

/// Usuario tal como se guarda en MongoDB.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsuarioDocumento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// Nombre de usuario en minúsculas (clave única).
    pub usuario: String,
    /// Nombre visible.
    pub nombre: String,
    /// Hash Argon2id de la contraseña (nunca se devuelve a la UI).
    pub password_hash: String,
    pub rol: String,
    pub activo: bool,
    #[serde(with = "fecha_bson_o_texto")]
    pub creado_en: DateTime<Utc>,
    #[serde(default, with = "fecha_opcional_bson_o_texto")]
    pub ultimo_acceso: Option<DateTime<Utc>>,
}

/// Datos públicos del usuario que la UI puede ver.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SesionUsuario {
    pub id: String,
    pub usuario: String,
    pub nombre: String,
    pub rol: String,
}

impl UsuarioDocumento {
    fn a_sesion(&self) -> SesionUsuario {
        SesionUsuario {
            id: self.id.as_ref().map(|id| id.to_hex()).unwrap_or_default(),
            usuario: self.usuario.clone(),
            nombre: self.nombre.clone(),
            rol: self.rol.clone(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LoginPayload {
    pub usuario: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NuevoUsuarioPayload {
    pub usuario: String,
    pub nombre: String,
    pub password: String,
    #[serde(default)]
    pub rol: Option<String>,
    /// Credenciales de un administrador. Solo son necesarias cuando ya existe
    /// al menos un usuario (el primero se crea sin credenciales).
    #[serde(default)]
    pub admin_usuario: Option<String>,
    #[serde(default)]
    pub admin_password: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ActualizarPerfilPayload {
    pub user_id: String,
    pub usuario: String,
    pub nombre: String,
    #[serde(default)]
    pub current_password: Option<String>,
    #[serde(default)]
    pub new_password: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistrarHistorialPayload {
    #[serde(default, alias = "eid")]
    pub project_id: Option<String>,
    pub usuario: String,
    /// Acción realizada: "Creó request", "Eliminó colección", "Ingresó", etc.
    pub accion: String,
    /// Entidad afectada: "request", "collection", "sesion", "usuario".
    pub entidad: String,
    #[serde(default)]
    pub entidad_id: Option<String>,
    #[serde(default)]
    pub nombre: Option<String>,
    #[serde(default)]
    pub detalle: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HistorialEntrada {
    pub project_id: Option<String>,
    pub usuario: String,
    pub accion: String,
    pub entidad: String,
    #[serde(default)]
    pub entidad_id: Option<String>,
    #[serde(default)]
    pub nombre: Option<String>,
    #[serde(default)]
    pub detalle: Option<String>,
    /// Fecha y hora en ISO 8601 (UTC), generada por el servidor.
    pub fecha: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HistorialFiltro {
    #[serde(alias = "eid")]
    pub project_id: String,
}

// ---------------------------------------------------------------------------
// Handles de colecciones
// ---------------------------------------------------------------------------

async fn get_usuarios() -> Result<Collection<UsuarioDocumento>, String> {
    let client = get_client().await?;
    Ok(client.database(DEFAULT_DB).collection(USUARIOS_COLLECTION))
}

async fn get_historial() -> Result<Collection<Document>, String> {
    let client = get_client().await?;
    Ok(client.database(DEFAULT_DB).collection(HISTORIAL_COLLECTION))
}

/// Índices de `usuarios` e `historial` (se pueden crear varias veces sin daño).
async fn ensure_auth_indexes() -> Result<(), String> {
    let usuarios = get_usuarios().await?;
    usuarios
        .create_index(
            IndexModel::builder()
                .keys(doc! { "usuario": 1 })
                .options(
                    mongodb::options::IndexOptions::builder()
                        .unique(true)
                        .build(),
                )
                .build(),
        )
        .await
        .map_err(|error| format!("No se pudo crear el índice de usuarios: {error}"))?;

    let historial = get_historial().await?;
    historial
        .create_indexes(vec![
            IndexModel::builder().keys(doc! { "fecha": -1 }).build(),
            IndexModel::builder()
                .keys(doc! { "project_id": 1, "fecha": -1 })
                .build(),
            IndexModel::builder()
                .keys(doc! { "usuario": 1, "fecha": -1 })
                .build(),
        ])
        .await
        .map_err(|error| format!("No se pudo crear el índice del historial: {error}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn normalizar_usuario(usuario: &str) -> String {
    usuario.trim().to_lowercase()
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| format!("No se pudo proteger la contraseña: {error}"))
}

fn verificar_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

async fn insertar_historial(entrada: RegistrarHistorialPayload) -> Result<(), String> {
    let usuario = entrada.usuario.trim();
    if usuario.is_empty() {
        return Err("El historial requiere un usuario".to_string());
    }

    let historial = get_historial().await?;
    let project_id = entrada
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|project_id| !project_id.is_empty())
        .unwrap_or(GLOBAL_PROJECT_ID);
    let documento = doc! {
        "project_id": project_id,
        "usuario": usuario,
        "accion": entrada.accion.trim(),
        "entidad": entrada.entidad.trim(),
        "entidad_id": entrada.entidad_id,
        "nombre": entrada.nombre,
        "detalle": entrada.detalle,
        "fecha": mongodb::bson::DateTime::from_chrono(Utc::now()),
    };

    historial
        .insert_one(documento)
        .await
        .map_err(|error| format!("No se pudo registrar el cambio en el historial: {error}"))?;

    Ok(())
}

async fn contar_usuarios() -> Result<u64, String> {
    let usuarios = get_usuarios().await?;
    usuarios
        .count_documents(doc! {})
        .await
        .map_err(|error| format!("No se pudieron contar los usuarios: {error}"))
}

/// Comprueba que el usuario exista, esté activo y tenga rol de administrador.
async fn exigir_admin_activo(usuario: &str) -> Result<(), String> {
    let usuarios = get_usuarios().await?;
    let clave = normalizar_usuario(usuario);

    let encontrado = usuarios
        .find_one(doc! { "usuario": &clave, "activo": true })
        .await
        .map_err(|error| format!("No se pudo consultar el usuario: {error}"))?;

    let Some(documento) = encontrado else {
        return Err(
            "La sesión de administrador no es válida. Vuelve a iniciar sesión.".to_string(),
        );
    };

    if documento.rol != ROL_ADMIN {
        return Err("Solo un administrador puede crear usuarios.".to_string());
    }

    Ok(())
}

/// Verifica las credenciales de un administrador activo.
async fn exigir_admin(usuario: &str, password: &str) -> Result<(), String> {
    let usuarios = get_usuarios().await?;
    let clave = normalizar_usuario(usuario);

    let encontrado = usuarios
        .find_one(doc! { "usuario": &clave, "activo": true })
        .await
        .map_err(|error| format!("No se pudo consultar el usuario: {error}"))?;

    let Some(documento) = encontrado else {
        return Err(
            "La sesión de administrador no es válida. Vuelve a iniciar sesión.".to_string(),
        );
    };

    if documento.rol != ROL_ADMIN {
        return Err("Solo un administrador puede crear usuarios.".to_string());
    }

    if !verificar_password(password, &documento.password_hash) {
        return Err("La contraseña de administrador no es correcta.".to_string());
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Comandos Tauri
// ---------------------------------------------------------------------------

/// Valida usuario y contraseña contra MongoDB y registra el ingreso.
#[tauri::command]
pub async fn login(payload: LoginPayload) -> Result<SesionUsuario, String> {
    ensure_auth_indexes().await?;

    let clave = normalizar_usuario(&payload.usuario);
    if clave.is_empty() || payload.password.is_empty() {
        return Err("Usuario y contraseña son obligatorios".to_string());
    }

    let usuarios = get_usuarios().await?;
    let encontrado = usuarios
        .find_one(doc! { "usuario": &clave })
        .await
        .map_err(|error| format!("No se pudo consultar el usuario: {error}"))?;

    let Some(documento) = encontrado else {
        return Err("Usuario o contraseña incorrectos".to_string());
    };

    if !documento.activo {
        return Err("El usuario está desactivado".to_string());
    }

    if !verificar_password(&payload.password, &documento.password_hash) {
        return Err("Usuario o contraseña incorrectos".to_string());
    }

    let Some(usuario_id) = documento.id else {
        return Err("El usuario no tiene identificador en MongoDB".to_string());
    };

    usuarios
        .update_one(
            doc! { "_id": usuario_id },
            doc! { "$set": { "ultimo_acceso": mongodb::bson::DateTime::from_chrono(Utc::now()) } },
        )
        .await
        .map_err(|error| format!("No se pudo actualizar el último acceso: {error}"))?;

    let sesion = documento.a_sesion();

    let _ = insertar_historial(RegistrarHistorialPayload {
        project_id: None,
        usuario: sesion.usuario.clone(),
        accion: "Ingresó".to_string(),
        entidad: "sesion".to_string(),
        entidad_id: None,
        nombre: Some(sesion.nombre.clone()),
        detalle: Some("Inicio de sesión en el cliente".to_string()),
    })
    .await;

    Ok(sesion)
}

/// Crea un usuario.
///
/// - Si todavía no existe ninguno, cualquier persona puede crear el primer
///   administrador (arranque inicial del equipo).
/// - Si ya existen usuarios, se exigen credenciales de un administrador.
#[tauri::command]
pub async fn crear_usuario(payload: NuevoUsuarioPayload) -> Result<SesionUsuario, String> {
    ensure_auth_indexes().await?;

    let clave = normalizar_usuario(&payload.usuario);
    let nombre = payload.nombre.trim().to_string();

    if clave.is_empty() {
        return Err("El usuario es obligatorio".to_string());
    }
    if payload.password.len() < 6 {
        return Err("La contraseña debe tener al menos 6 caracteres".to_string());
    }

    let total = contar_usuarios().await?;
    let es_arranque = total == 0;

    if !es_arranque {
        let admin_usuario = payload.admin_usuario.clone().unwrap_or_default();
        if admin_usuario.trim().is_empty() {
            return Err("Solo un administrador puede crear nuevos usuarios".to_string());
        }
        // La sesión ya está abierta como administrador; si además se envía la
        // contraseña se vuelve a comprobar, pero no es obligatorio teclearla
        // otra vez para crear un usuario.
        match payload.admin_password.as_deref() {
            Some(clave) if !clave.is_empty() => {
                exigir_admin(&admin_usuario, clave).await?;
            }
            _ => exigir_admin_activo(&admin_usuario).await?,
        }
    }

    let rol = match payload.rol.as_deref() {
        Some(valor) if !valor.trim().is_empty() => valor.trim().to_lowercase(),
        _ => {
            if es_arranque {
                ROL_ADMIN.to_string()
            } else {
                ROL_USUARIO.to_string()
            }
        }
    };

    let usuarios = get_usuarios().await?;
    let existente = usuarios
        .find_one(doc! { "usuario": &clave })
        .await
        .map_err(|error| format!("No se pudo consultar el usuario: {error}"))?;
    if existente.is_some() {
        return Err("Ese usuario ya existe".to_string());
    }

    let documento = UsuarioDocumento {
        id: Some(ObjectId::new()),
        usuario: clave.clone(),
        nombre: if nombre.is_empty() {
            clave.clone()
        } else {
            nombre
        },
        password_hash: hash_password(&payload.password)?,
        rol: rol.clone(),
        activo: true,
        creado_en: Utc::now(),
        ultimo_acceso: None,
    };

    usuarios
        .insert_one(&documento)
        .await
        .map_err(|error| format!("No se pudo crear el usuario: {error}"))?;

    let autor = if es_arranque {
        documento.usuario.clone()
    } else {
        normalizar_usuario(&payload.admin_usuario.unwrap_or_default())
    };

    let _ = insertar_historial(RegistrarHistorialPayload {
        project_id: None,
        usuario: autor,
        accion: "Creó usuario".to_string(),
        entidad: "usuario".to_string(),
        entidad_id: documento.id.as_ref().map(|id| id.to_hex()),
        nombre: Some(documento.usuario.clone()),
        detalle: Some(format!("Rol: {rol}")),
    })
    .await;

    log::info!("Usuario creado: {} ({rol})", documento.usuario);
    Ok(documento.a_sesion())
}

/// Actualiza los datos editables del usuario autenticado. El rol y el estado
/// activo nunca se aceptan desde este comando para impedir autoelevaciones.
#[tauri::command]
pub async fn update_user_profile(
    payload: ActualizarPerfilPayload,
) -> Result<SesionUsuario, String> {
    ensure_auth_indexes().await?;

    let user_id = ObjectId::parse_str(payload.user_id.trim())
        .map_err(|_| "El identificador de usuario no es válido".to_string())?;
    let usuario = normalizar_usuario(&payload.usuario);
    let nombre = payload.nombre.trim().to_string();
    if usuario.is_empty() || nombre.is_empty() {
        return Err("Usuario y nombre son obligatorios".to_string());
    }

    let usuarios = get_usuarios().await?;
    let actual = usuarios
        .find_one(doc! { "_id": user_id, "activo": true })
        .await
        .map_err(|error| format!("No se pudo consultar el usuario: {error}"))?
        .ok_or_else(|| "La sesión ya no es válida. Vuelve a iniciar sesión.".to_string())?;

    let duplicado = usuarios
        .find_one(doc! { "usuario": &usuario, "_id": { "$ne": user_id } })
        .await
        .map_err(|error| format!("No se pudo validar el nombre de usuario: {error}"))?;
    if duplicado.is_some() {
        return Err("Ese nombre de usuario ya está registrado".to_string());
    }

    let mut cambios = doc! { "usuario": &usuario, "nombre": &nombre };
    let nueva_clave = payload.new_password.as_deref().unwrap_or_default();
    if !nueva_clave.is_empty() {
        if nueva_clave.len() < 6 {
            return Err("La nueva contraseña debe tener al menos 6 caracteres".to_string());
        }
        let clave_actual = payload.current_password.as_deref().unwrap_or_default();
        if !verificar_password(clave_actual, &actual.password_hash) {
            return Err("La contraseña actual no es correcta".to_string());
        }
        cambios.insert("password_hash", hash_password(nueva_clave)?);
    }

    usuarios
        .update_one(doc! { "_id": user_id }, doc! { "$set": cambios })
        .await
        .map_err(|error| {
            if error.to_string().contains("E11000") {
                "Ese nombre de usuario ya está registrado".to_string()
            } else {
                format!("No se pudo actualizar el perfil: {error}")
            }
        })?;

    let actualizado = usuarios
        .find_one(doc! { "_id": user_id })
        .await
        .map_err(|error| format!("No se pudo recargar el perfil: {error}"))?
        .ok_or_else(|| "No se encontró el usuario actualizado".to_string())?;

    let _ = insertar_historial(RegistrarHistorialPayload {
        project_id: None,
        usuario: actualizado.usuario.clone(),
        accion: "Actualizó su perfil".to_string(),
        entidad: "usuario".to_string(),
        entidad_id: Some(user_id.to_hex()),
        nombre: Some(actualizado.nombre.clone()),
        detalle: (actual.usuario != actualizado.usuario)
            .then(|| format!("Usuario anterior: {}", actual.usuario)),
    })
    .await;

    Ok(actualizado.a_sesion())
}

/// Deja constancia del cierre de sesión en la bitácora.
#[tauri::command]
pub async fn cerrar_sesion(usuario: String) -> Result<(), String> {
    insertar_historial(RegistrarHistorialPayload {
        project_id: None,
        usuario,
        accion: "Cerró sesión".to_string(),
        entidad: "sesion".to_string(),
        entidad_id: None,
        nombre: None,
        detalle: None,
    })
    .await
}

/// Registra una acción en la bitácora (la fecha la pone el servidor).
#[tauri::command]
pub async fn registrar_historial(payload: RegistrarHistorialPayload) -> Result<(), String> {
    if payload
        .project_id
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        return Err("Indica el proyecto del cambio".to_string());
    }
    insertar_historial(payload).await
}

fn consulta_historial(filtro: &HistorialFiltro) -> Result<Document, String> {
    let project_id = filtro.project_id.trim();
    if project_id.is_empty() {
        return Err("Indica el proyecto del historial".to_string());
    }
    Ok(doc! { "project_id": project_id })
}

/// Devuelve toda la bitácora del proyecto, sin filtros por usuario o acción.
#[tauri::command]
pub async fn listar_historial(filtro: HistorialFiltro) -> Result<Vec<HistorialEntrada>, String> {
    let query = consulta_historial(&filtro)?;
    let historial = get_historial().await?;

    // Compatibilidad con entradas creadas antes de adoptar `project_id`.
    historial
        .update_many(
            doc! {
                "project_id": { "$exists": false },
                "eid": filtro.project_id.trim(),
            },
            doc! { "$set": { "project_id": filtro.project_id.trim() } },
        )
        .await
        .map_err(|error| format!("No se pudo migrar el historial del proyecto: {error}"))?;

    let mut cursor = historial
        .find(query)
        .sort(doc! { "fecha": -1 })
        .await
        .map_err(|error| format!("No se pudo leer el historial: {error}"))?;

    let mut documentos: Vec<Document> = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("No se pudo leer el historial: {error}"))?
    {
        documentos.push(
            cursor
                .deserialize_current()
                .map_err(|error| format!("Entrada de historial inválida: {error}"))?,
        );
    }

    let entradas = documentos
        .into_iter()
        .map(|documento| {
            let fecha = documento
                .get_datetime("fecha")
                .map(|valor| valor.to_chrono().to_rfc3339())
                .unwrap_or_default();

            HistorialEntrada {
                project_id: documento
                    .get_str("project_id")
                    .ok()
                    .map(str::to_string),
                usuario: documento.get_str("usuario").unwrap_or_default().to_string(),
                accion: documento.get_str("accion").unwrap_or_default().to_string(),
                entidad: documento.get_str("entidad").unwrap_or_default().to_string(),
                entidad_id: documento
                    .get_str("entidad_id")
                    .ok()
                    .map(|valor| valor.to_string()),
                nombre: documento
                    .get_str("nombre")
                    .ok()
                    .map(|valor| valor.to_string()),
                detalle: documento
                    .get_str("detalle")
                    .ok()
                    .map(|valor| valor.to_string()),
                fecha,
            }
        })
        .collect();

    Ok(entradas)
}

/// Indica si todavía no existe ningún usuario (para mostrar el arranque).
#[tauri::command]
pub async fn hay_usuarios() -> Result<bool, String> {
    Ok(contar_usuarios().await? > 0)
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn historial_filtra_solo_por_proyecto() {
        let filtro = HistorialFiltro {
            project_id: "PROYECTO-A".into(),
        };
        assert_eq!(
            consulta_historial(&filtro).unwrap(),
            doc! { "project_id": "PROYECTO-A" }
        );
    }

    #[test]
    fn normaliza_el_usuario() {
        assert_eq!(normalizar_usuario("  JPerez "), "jperez");
        assert_eq!(normalizar_usuario("admin"), "admin");
    }

    #[test]
    fn el_hash_valida_la_contrasena_correcta() {
        let hash = hash_password("secreto123").expect("hash");
        assert!(verificar_password("secreto123", &hash));
        assert!(!verificar_password("secreto124", &hash));
    }

    #[test]
    fn dos_hashes_de_la_misma_clave_son_distintos() {
        let uno = hash_password("secreto123").expect("hash 1");
        let dos = hash_password("secreto123").expect("hash 2");
        assert_ne!(uno, dos);
        assert!(verificar_password("secreto123", &uno));
        assert!(verificar_password("secreto123", &dos));
    }

    #[test]
    fn un_hash_invalido_no_autentica() {
        assert!(!verificar_password("secreto123", "texto-plano"));
        assert!(!verificar_password("secreto123", ""));
    }
}
