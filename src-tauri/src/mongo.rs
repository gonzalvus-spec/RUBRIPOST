//! Persistencia total de requests HTTP en MongoDB.
//!
//! Este módulo expone los comandos Tauri que permiten guardar, listar,
//! duplicar y eliminar requests completas (body, headers, auth, url, etc.)
//! y organizarlas en colecciones al estilo Postman.
//!
//! Características principales:
//! - Cliente MongoDB perezoso y reutilizable (pool gestionado por el driver).
//! - Colecciones y requests conviven en la MISMA colección de MongoDB
//!   (`api_requests`) y se distinguen por el campo `tipo`
//!   (`"collection"` | `"request"`). No existe una colección de historial
//!   aparte: cada request pertenece a una colección vía `coleccion_id`.
//! - Índices compuestos creados una sola vez.
//! - Cifrado AES-256-GCM de los secretos (token / API key) antes de escribir.
//! - Upsert idempotente cuando el payload trae `id`.
//! - Validación de tamaño de body (máximo 1 MB).

use std::collections::HashMap;
use std::env;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use chrono::{DateTime, Utc};
use mongodb::bson::{doc, oid::ObjectId, Document};
use mongodb::{Client, Collection, IndexModel};
use once_cell::sync::OnceCell as SyncOnceCell;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::OnceCell;

// ---------------------------------------------------------------------------
// Constantes y estado global
// ---------------------------------------------------------------------------

const COLLECTION_NAME: &str = "api_requests";
const DEFAULT_DB: &str = "rubripost_db";
const DEFAULT_LIMIT: u32 = 100;
const MAX_LIMIT: u32 = 500;
const MAX_BODY_BYTES: usize = 1024 * 1024; // 1 MB
const ENC_PREFIX: &str = "enc:v1:";
const DEFAULT_DEV_KEY: &str = "rubrifact-dev-key-change-me";

/// Discriminador de documentos dentro de `api_requests`.
const TIPO_REQUEST: &str = "request";
const TIPO_COLLECTION: &str = "collection";

/// Colección creada automáticamente la primera vez que un EID no tiene ninguna.
const DEFAULT_COLLECTION_NAME: &str = "General";
const DEFAULT_COLLECTION_COLOR: &str = "#046A38";

/// Cliente MongoDB compartido. `tokio::sync::OnceCell` garantiza una única
/// inicialización incluso con comandos concurrentes.
static MONGO_CLIENT: OnceCell<Client> = OnceCell::const_new();

/// Los índices se crean una única vez por proceso.
static INDEXES_READY: OnceCell<()> = OnceCell::const_new();

/// Clave AES-256 derivada de la variable de entorno (cacheada).
static ENCRYPTION_KEY: SyncOnceCell<[u8; 32]> = SyncOnceCell::new();

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

/// Información HTTP resultante de la última ejecución.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct HttpInfo {
    #[serde(default)]
    pub status_code: i32,
    #[serde(default)]
    pub duration_ms: i64,
}

/// Configuración de autenticación de la request.
///
/// Los campos `token` y `api_key_value` se cifran antes de persistirse y se
/// descifran al leerlos, de modo que el frontend siempre recibe el valor
/// original.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AuthConfig {
    /// `none` | `bearer` | `api-key`
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_value: Option<String>,
}

/// Documento tal y como se almacena en MongoDB.
///
/// El campo `tipo` distingue una request (`"request"`) de una colección
/// (`"collection"`) dentro de la misma colección de MongoDB.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiRequestDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    #[serde(default = "default_tipo_request")]
    pub tipo: String,
    pub eid: String,
    pub nombre: String,
    pub contexto: String,
    pub metodo: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    /// Descripciones de los query params (solo UI), indexadas por nombre.
    /// Los valores viajan en la `url`; esto es una anotación de apoyo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query_descripciones: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub http_info: HttpInfo,
    /// Colección (documento `tipo: "collection"`) a la que pertenece.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coleccion_id: Option<String>,
    /// Posición dentro de su colección (drag & drop estilo Postman).
    #[serde(default)]
    pub orden: i32,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub timestamp: DateTime<Utc>,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub updated_at: DateTime<Utc>,
    #[serde(default = "default_version")]
    pub version: u32,
}

fn default_tipo_request() -> String {
    TIPO_REQUEST.to_string()
}

fn default_tipo_collection() -> String {
    TIPO_COLLECTION.to_string()
}

fn default_version() -> u32 {
    1
}

/// Documento de colección (carpeta al estilo Postman).
///
/// Vive en la MISMA colección de MongoDB que las requests, marcado con
/// `tipo: "collection"`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiCollectionDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    #[serde(default = "default_tipo_collection")]
    pub tipo: String,
    pub eid: String,
    pub nombre: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub orden: i32,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub timestamp: DateTime<Utc>,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub updated_at: DateTime<Utc>,
}

/// Payload de colección recibido desde el frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiCollectionPayload {
    /// `_id` de la colección a actualizar. `None` fuerza la creación.
    #[serde(default)]
    pub id: Option<String>,
    pub eid: String,
    pub nombre: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub orden: Option<i32>,
}

/// Colección tal y como la consume el frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiCollectionRecord {
    #[serde(rename = "_id")]
    pub id: String,
    pub eid: String,
    pub nombre: String,
    pub color: String,
    pub orden: i32,
    pub timestamp: String,
    pub updated_at: String,
}

impl ApiCollectionDocument {
    fn into_record(self) -> Result<ApiCollectionRecord, String> {
        let id = self
            .id
            .ok_or_else(|| "La colección de MongoDB no tiene _id".to_string())?;

        Ok(ApiCollectionRecord {
            id: id.to_hex(),
            eid: self.eid,
            nombre: self.nombre,
            color: if self.color.is_empty() {
                DEFAULT_COLLECTION_COLOR.to_string()
            } else {
                self.color
            },
            orden: self.orden,
            timestamp: self.timestamp.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
        })
    }
}

/// Instantánea completa del workspace de un EID: colecciones + requests.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiWorkspace {
    pub collections: Vec<ApiCollectionRecord>,
    pub requests: Vec<ApiRequestRecord>,
}

/// Payload para eliminar una colección.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeleteCollectionPayload {
    pub id: String,
    /// Por defecto `true`: eliminar la colección elimina también sus requests.
    #[serde(default = "default_true")]
    pub delete_requests: bool,
}

fn default_true() -> bool {
    true
}

/// Payload para mover una request entre colecciones.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveRequestPayload {
    pub id: String,
    #[serde(default)]
    pub coleccion_id: Option<String>,
}

/// Payload recibido desde el frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiRequestPayload {
    /// `_id` del documento a actualizar. `None` fuerza la creación.
    #[serde(default)]
    pub id: Option<String>,
    pub eid: String,
    pub nombre: String,
    #[serde(default)]
    pub contexto: String,
    pub metodo: String,
    pub url: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    /// Descripciones de los query params, indexadas por nombre.
    #[serde(default)]
    pub query_descripciones: Option<HashMap<String, String>>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub http_info: HttpInfo,
    /// Colección destino. `None` deja la request sin colección.
    #[serde(default)]
    pub coleccion_id: Option<String>,
    #[serde(default)]
    pub version: Option<u32>,
}

/// Filtro de listado.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiRequestFilter {
    pub eid: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    DEFAULT_LIMIT
}

/// Representación que consume el frontend (`_id` como string hexadecimal y
/// fechas en RFC 3339, fáciles de parsear con `new Date(...)`).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApiRequestRecord {
    #[serde(rename = "_id")]
    pub id: String,
    pub eid: String,
    pub nombre: String,
    pub contexto: String,
    pub metodo: String,
    pub url: String,
    pub body: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    /// Descripciones de los query params, indexadas por nombre.
    #[serde(default)]
    pub query_descripciones: HashMap<String, String>,
    pub auth: Option<AuthConfig>,
    pub http_info: HttpInfo,
    pub coleccion_id: Option<String>,
    pub orden: i32,
    pub timestamp: String,
    pub updated_at: String,
    pub version: u32,
}

impl ApiRequestDocument {
    /// Convierte el documento almacenado en la representación pública,
    /// descifrando los secretos de autenticación.
    fn into_record(self) -> Result<ApiRequestRecord, String> {
        let ApiRequestDocument {
            id,
            tipo: _tipo,
            eid,
            nombre,
            contexto,
            metodo,
            url,
            body,
            headers,
            query_descripciones,
            auth,
            http_info,
            coleccion_id,
            orden,
            timestamp,
            updated_at,
            version,
        } = self;

        let id = id.ok_or_else(|| "El documento de MongoDB no tiene _id".to_string())?;
        let auth = match auth {
            Some(auth) => Some(decrypt_auth(auth)?),
            None => None,
        };

        Ok(ApiRequestRecord {
            id: id.to_hex(),
            eid,
            nombre,
            contexto,
            metodo,
            url,
            body,
            headers,
            query_descripciones: query_descripciones.unwrap_or_default(),
            auth,
            http_info,
            coleccion_id,
            orden,
            timestamp: timestamp.to_rfc3339(),
            updated_at: updated_at.to_rfc3339(),
            version,
        })
    }
}

// ---------------------------------------------------------------------------
// Conexión (lazy + pool reutilizable)
// ---------------------------------------------------------------------------

/// Devuelve el cliente MongoDB, conectándose la primera vez que se invoca.
pub async fn get_client() -> Result<&'static Client, String> {
    MONGO_CLIENT
        .get_or_try_init(|| async {
            // La configuración se carga al arrancar (ver `config.rs`); se
            // reintenta aquí por si el pool se abre antes del setup.
            let _ = crate::config::cargar();

            let uri = env::var("MONGODB_URI")
                .map(|valor| valor.trim().to_string())
                .ok()
                .filter(|valor| !valor.is_empty())
                .ok_or_else(crate::config::mensaje_sin_mongo)?;

            log::info!("Conectando a MongoDB (inicialización única del pool)...");

            let mut options = mongodb::options::ClientOptions::parse(&uri)
                .await
                .map_err(|error| format!("URI de MongoDB inválida: {error}"))?;
            options.app_name = Some("rubrifact-api-client".to_string());

            let client = Client::with_options(options)
                .map_err(|error| format!("No se pudo crear el cliente MongoDB: {error}"))?;

            client
                .database("admin")
                .run_command(doc! { "ping": 1 })
                .await
                .map_err(|error| format!("No se pudo conectar a MongoDB: {error}"))?;

            log::info!("Conexión MongoDB establecida. Pool reutilizable listo.");
            Ok(client)
        })
        .await
}

async fn get_collection() -> Result<Collection<ApiRequestDocument>, String> {
    let client = get_client().await?;
    let db_name = env::var("MONGODB_DB").unwrap_or_else(|_| DEFAULT_DB.to_string());
    Ok(client.database(&db_name).collection(COLLECTION_NAME))
}

/// Handle tipado para los documentos de colección. Apunta a la MISMA
/// colección física de MongoDB que las requests.
async fn get_collections_handle() -> Result<Collection<ApiCollectionDocument>, String> {
    let client = get_client().await?;
    let db_name = env::var("MONGODB_DB").unwrap_or_else(|_| DEFAULT_DB.to_string());
    Ok(client.database(&db_name).collection(COLLECTION_NAME))
}

/// Migración + índices. Se ejecuta una única vez por proceso.
///
/// 1. Los documentos antiguos (sin `tipo`) se marcan como `request`.
/// 2. Se crean los índices compuestos usados por el sidebar.
async fn ensure_indexes(collection: &Collection<ApiRequestDocument>) -> Result<(), String> {
    INDEXES_READY
        .get_or_try_init(|| async {
            let migrated = collection
                .update_many(
                    doc! { "tipo": { "$exists": false } },
                    doc! { "$set": { "tipo": TIPO_REQUEST } },
                )
                .await
                .map_err(|error| format!("No se pudo migrar documentos antiguos: {error}"))?;

            if migrated.modified_count > 0 {
                log::info!(
                    "Migración: {} documento(s) antiguos marcados como request.",
                    migrated.modified_count
                );
            }

            let indexes = vec![
                IndexModel::builder()
                    .keys(doc! { "eid": 1, "tipo": 1, "timestamp": -1 })
                    .build(),
                IndexModel::builder()
                    .keys(doc! { "eid": 1, "tipo": 1, "coleccion_id": 1, "timestamp": -1 })
                    .build(),
            ];

            collection
                .create_indexes(indexes)
                .await
                .map_err(|error| format!("No se pudieron crear los índices de MongoDB: {error}"))?;

            log::info!("Índices {{ eid, tipo, [coleccion_id], timestamp }} verificados.");
            Ok::<(), String>(())
        })
        .await?;

    Ok(())
}

/// Garantiza que el EID tenga al menos una colección y que ninguna request
/// quede huérfana: todas viven dentro de una colección (sin historial aparte).
async fn ensure_default_collection(eid: &str) -> Result<Vec<ApiCollectionRecord>, String> {
    let handle = get_collections_handle().await?;

    let existing = handle
        .count_documents(doc! { "eid": eid, "tipo": TIPO_COLLECTION })
        .await
        .map_err(|error| format!("No se pudieron contar las colecciones: {error}"))?;

    if existing == 0 {
        let now = Utc::now();
        let document = ApiCollectionDocument {
            id: Some(ObjectId::new()),
            tipo: TIPO_COLLECTION.to_string(),
            eid: eid.to_string(),
            nombre: DEFAULT_COLLECTION_NAME.to_string(),
            color: DEFAULT_COLLECTION_COLOR.to_string(),
            orden: 0,
            timestamp: now,
            updated_at: now,
        };

        handle
            .insert_one(&document)
            .await
            .map_err(|error| format!("No se pudo crear la colección por defecto: {error}"))?;

        log::info!(
            "Colección por defecto '{}' creada para el EID {}",
            DEFAULT_COLLECTION_NAME,
            eid
        );
    }

    let collections = list_collections(eid).await?;
    let Some(first) = collections.first() else {
        return Ok(collections);
    };

    // Adopta requests huérfanas (sin coleccion_id) para que nunca exista un
    // "historial" separado de las colecciones.
    let requests = get_collection().await?;
    let adopted = requests
        .update_many(
            doc! {
                "eid": eid,
                "tipo": TIPO_REQUEST,
                "$or": [
                    { "coleccion_id": { "$exists": false } },
                    { "coleccion_id": null },
                    { "coleccion_id": "" },
                ],
            },
            doc! { "$set": { "coleccion_id": first.id.clone() } },
        )
        .await
        .map_err(|error| format!("No se pudieron adoptar requests huérfanas: {error}"))?;

    if adopted.modified_count > 0 {
        log::info!(
            "{} request(s) sin colección movidas a '{}'",
            adopted.modified_count,
            first.nombre
        );
    }

    Ok(collections)
}

async fn list_collections(eid: &str) -> Result<Vec<ApiCollectionRecord>, String> {
    let handle = get_collections_handle().await?;

    let mut cursor = handle
        .find(doc! { "eid": eid, "tipo": TIPO_COLLECTION })
        .sort(doc! { "orden": 1, "timestamp": 1 })
        .await
        .map_err(|error| format!("Error al consultar las colecciones: {error}"))?;

    let mut collections = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("Error al leer las colecciones: {error}"))?
    {
        let document: ApiCollectionDocument = cursor
            .deserialize_current()
            .map_err(|error| format!("Colección inválida en MongoDB: {error}"))?;
        collections.push(document.into_record()?);
    }

    Ok(collections)
}

// ---------------------------------------------------------------------------
// Cifrado de secretos (AES-256-GCM)
// ---------------------------------------------------------------------------

fn encryption_key() -> &'static [u8; 32] {
    ENCRYPTION_KEY.get_or_init(|| {
        let secret = env::var("RUBRIPOST_AUTH_KEY")
            .or_else(|_| env::var("AUTH_ENCRYPTION_KEY"))
            .unwrap_or_else(|_| {
                log::warn!(
                    "RUBRIPOST_AUTH_KEY no está definida: usando clave de desarrollo. \
                     Define una clave propia en .env para producción."
                );
                DEFAULT_DEV_KEY.to_string()
            });

        let mut hasher = Sha256::new();
        hasher.update(secret.as_bytes());
        hasher.finalize().into()
    })
}

fn encrypt_secret(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    // Evita cifrar dos veces un valor ya cifrado.
    if plain.starts_with(ENC_PREFIX) {
        return Ok(plain.to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(encryption_key())
        .map_err(|error| format!("Clave de cifrado inválida: {error}"))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plain.as_bytes())
        .map_err(|error| format!("No se pudo cifrar el secreto: {error}"))?;

    let mut payload = nonce.to_vec();
    payload.extend_from_slice(&ciphertext);

    Ok(format!("{ENC_PREFIX}{}", BASE64.encode(payload)))
}

fn decrypt_secret(value: &str) -> Result<String, String> {
    if value.is_empty() {
        return Ok(String::new());
    }

    // Compatibilidad con documentos antiguos guardados en texto plano.
    let Some(encoded) = value.strip_prefix(ENC_PREFIX) else {
        return Ok(value.to_string());
    };

    let raw = BASE64
        .decode(encoded)
        .map_err(|error| format!("Secreto cifrado corrupto (base64): {error}"))?;

    if raw.len() < 12 {
        return Err("Secreto cifrado corrupto: longitud insuficiente".to_string());
    }

    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(encryption_key())
        .map_err(|error| format!("Clave de cifrado inválida: {error}"))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|_| {
        "No se pudo descifrar el secreto: ¿cambió RUBRIPOST_AUTH_KEY?".to_string()
    })?;

    String::from_utf8(plaintext)
        .map_err(|error| format!("Secreto descifrado no es UTF-8 válido: {error}"))
}

fn encrypt_auth(auth: AuthConfig) -> Result<AuthConfig, String> {
    Ok(AuthConfig {
        kind: auth.kind,
        token: auth.token.as_deref().map(encrypt_secret).transpose()?,
        api_key_name: auth.api_key_name,
        api_key_value: auth.api_key_value.as_deref().map(encrypt_secret).transpose()?,
    })
}

fn decrypt_auth(auth: AuthConfig) -> Result<AuthConfig, String> {
    Ok(AuthConfig {
        kind: auth.kind,
        token: auth.token.as_deref().map(decrypt_secret).transpose()?,
        api_key_name: auth.api_key_name,
        api_key_value: auth.api_key_value.as_deref().map(decrypt_secret).transpose()?,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_id(raw: &str) -> Result<ObjectId, String> {
    ObjectId::parse_str(raw.trim()).map_err(|_| format!("_id inválido: {raw}"))
}

fn parse_optional_id(raw: Option<&str>) -> Result<Option<ObjectId>, String> {
    match raw {
        Some(value) if !value.trim().is_empty() => Ok(Some(parse_id(value)?)),
        _ => Ok(None),
    }
}

/// Los GET nunca persisten body. Además se rechazan bodies mayores a 1 MB.
fn normalize_body(metodo: &str, body: Option<String>) -> Result<Option<String>, String> {
    if metodo.eq_ignore_ascii_case("GET") || metodo.eq_ignore_ascii_case("HEAD") {
        return Ok(None);
    }

    if let Some(content) = body {
        if content.len() > MAX_BODY_BYTES {
            return Err(format!(
                "El body supera el límite de 1 MB ({} bytes recibidos).",
                content.len()
            ));
        }
        if content.trim().is_empty() {
            return Ok(None);
        }
        return Ok(Some(content));
    }

    Ok(None)
}

fn build_document(
    payload: ApiRequestPayload,
    id: Option<ObjectId>,
    timestamp: DateTime<Utc>,
    version: u32,
) -> Result<ApiRequestDocument, String> {
    let body = normalize_body(&payload.metodo, payload.body)?;
    let auth = match payload.auth {
        Some(auth) if !auth.kind.is_empty() && auth.kind != "none" => Some(encrypt_auth(auth)?),
        _ => None,
    };
    let headers = payload.headers.filter(|values| !values.is_empty());
    let query_descripciones = payload
        .query_descripciones
        .filter(|values| !values.is_empty());
    let coleccion_id = payload
        .coleccion_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    Ok(ApiRequestDocument {
        id,
        tipo: TIPO_REQUEST.to_string(),
        eid: payload.eid,
        nombre: payload.nombre.trim().to_string(),
        contexto: payload.contexto,
        metodo: payload.metodo.trim().to_uppercase(),
        url: payload.url.trim().to_string(),
        body,
        headers,
        query_descripciones,
        auth,
        http_info: payload.http_info,
        coleccion_id,
        orden: 0,
        timestamp,
        updated_at: Utc::now(),
        version,
    })
}

// ---------------------------------------------------------------------------
// Comandos Tauri
// ---------------------------------------------------------------------------

/// Inserta o actualiza (upsert por `_id`) una request completa.
///
/// Devuelve el `_id` hexadecimal del documento afectado.
#[tauri::command]
pub async fn save_api_request_full(payload: ApiRequestPayload) -> Result<String, String> {
    if payload.eid.trim().is_empty() {
        return Err("El EID es obligatorio".to_string());
    }
    if payload.nombre.trim().is_empty() {
        return Err("El nombre de la request es obligatorio".to_string());
    }
    if payload.url.trim().is_empty() {
        return Err("La URL es obligatoria".to_string());
    }

    let collection = get_collection().await?;
    ensure_indexes(&collection).await?;

    let now = Utc::now();
    let existing_id = parse_optional_id(payload.id.as_deref())?;

    match existing_id {
        Some(object_id) => {
            let document = build_document(payload, Some(object_id), now, 1)?;

            let mut set_fields = mongodb::bson::to_document(&document)
                .map_err(|error| format!("No se pudo serializar el documento: {error}"))?;

            // `_id` es inmutable, `timestamp` solo se escribe al insertar y
            // `version` se incrementa de forma atómica. `orden` se conserva
            // para no perder el reordenamiento hecho con drag & drop.
            set_fields.remove("_id");
            set_fields.remove("timestamp");
            set_fields.remove("version");
            set_fields.remove("orden");

            let update: Document = doc! {
                "$set": set_fields,
                "$inc": { "version": 1_i32 },
                "$setOnInsert": { "timestamp": bson::DateTime::from_chrono(now) },
            };

            collection
                .update_one(doc! { "_id": object_id }, update)
                .upsert(true)
                .await
                .map_err(|error| format!("Error al actualizar la request en MongoDB: {error}"))?;

            log::info!(
                "Request actualizada en MongoDB: {} ({})",
                object_id.to_hex(),
                document.nombre
            );

            Ok(object_id.to_hex())
        }
        None => {
            let object_id = ObjectId::new();
            let mut document = build_document(payload, Some(object_id), now, 1)?;

            // Las requests nuevas se agregan al final de su colección.
            let filter = match &document.coleccion_id {
                Some(coleccion_id) => doc! {
                    "eid": &document.eid,
                    "tipo": TIPO_REQUEST,
                    "coleccion_id": coleccion_id,
                },
                None => doc! {
                    "eid": &document.eid,
                    "tipo": TIPO_REQUEST,
                    "coleccion_id": { "$exists": false },
                },
            };
            let total = collection
                .count_documents(filter)
                .await
                .map_err(|error| format!("Error al contar requests: {error}"))?;
            document.orden = total.min(i32::MAX as u64) as i32;

            collection
                .insert_one(&document)
                .await
                .map_err(|error| format!("Error al insertar la request en MongoDB: {error}"))?;

            log::info!(
                "Request creada en MongoDB: {} ({})",
                object_id.to_hex(),
                document.nombre
            );

            Ok(object_id.to_hex())
        }
    }
}

/// Devuelve los documentos completos de un EID, ordenados por fecha descendente.
#[tauri::command]
pub async fn get_api_requests_full(
    filter: ApiRequestFilter,
) -> Result<Vec<ApiRequestRecord>, String> {
    let collection = get_collection().await?;
    ensure_indexes(&collection).await?;

    let limit = match filter.limit {
        0 => DEFAULT_LIMIT,
        value => value.min(MAX_LIMIT),
    } as i64;

    let records = fetch_requests(&collection, &filter.eid, limit).await?;

    log::info!(
        "Se recuperaron {} requests para el EID {}",
        records.len(),
        filter.eid
    );

    Ok(records)
}

async fn fetch_requests(
    collection: &Collection<ApiRequestDocument>,
    eid: &str,
    limit: i64,
) -> Result<Vec<ApiRequestRecord>, String> {
    let mut cursor = collection
        .find(doc! { "eid": eid, "tipo": TIPO_REQUEST })
        .sort(doc! { "orden": 1, "timestamp": -1 })
        .limit(limit)
        .await
        .map_err(|error| format!("Error al consultar MongoDB: {error}"))?;

    let mut records = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("Error al leer resultados de MongoDB: {error}"))?
    {
        let document: ApiRequestDocument = cursor
            .deserialize_current()
            .map_err(|error| format!("Documento inválido en MongoDB: {error}"))?;
        records.push(document.into_record()?);
    }

    Ok(records)
}

/// Instantánea completa del workspace: colecciones + requests del EID.
///
/// Es la única lectura que necesita el sidebar, de modo que ambas listas
/// siempre son coherentes entre sí.
#[tauri::command]
pub async fn get_api_workspace(filter: ApiRequestFilter) -> Result<ApiWorkspace, String> {
    let collection = get_collection().await?;
    ensure_indexes(&collection).await?;

    let collections = ensure_default_collection(&filter.eid).await?;

    let limit = match filter.limit {
        0 => DEFAULT_LIMIT,
        value => value.min(MAX_LIMIT),
    } as i64;

    let requests = fetch_requests(&collection, &filter.eid, limit).await?;

    // Se llama cada pocos segundos desde la sincronización automática: `debug`
    // evita llenar la consola sin aportar nada en el uso normal.
    log::debug!(
        "Workspace EID {}: {} colecciones, {} requests",
        filter.eid,
        collections.len(),
        requests.len()
    );

    Ok(ApiWorkspace {
        collections,
        requests,
    })
}

/// Crea o actualiza una colección. Devuelve su `_id` hexadecimal.
#[tauri::command]
pub async fn save_api_collection(payload: ApiCollectionPayload) -> Result<String, String> {
    if payload.eid.trim().is_empty() {
        return Err("El EID es obligatorio".to_string());
    }
    if payload.nombre.trim().is_empty() {
        return Err("El nombre de la colección es obligatorio".to_string());
    }

    let collection = get_collection().await?;
    ensure_indexes(&collection).await?;

    let handle = get_collections_handle().await?;
    let now = Utc::now();
    let eid = payload.eid.trim().to_string();
    let nombre = payload.nombre.trim().to_string();
    let color = payload
        .color
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match parse_optional_id(payload.id.as_deref())? {
        Some(object_id) => {
            let mut set_fields: Document = doc! {
                "nombre": &nombre,
                "updated_at": bson::DateTime::from_chrono(now),
            };
            if let Some(color) = &color {
                set_fields.insert("color", color.clone());
            }
            if let Some(orden) = payload.orden {
                set_fields.insert("orden", orden);
            }

            let result = handle
                .update_one(
                    doc! { "_id": object_id, "tipo": TIPO_COLLECTION },
                    doc! { "$set": set_fields },
                )
                .await
                .map_err(|error| format!("Error al actualizar la colección: {error}"))?;

            if result.matched_count == 0 {
                return Err("La colección no existe o ya fue eliminada".to_string());
            }

            log::info!("Colección actualizada: {} ({})", object_id.to_hex(), nombre);
            Ok(object_id.to_hex())
        }
        None => {
            let orden = match payload.orden {
                Some(value) => value,
                None => handle
                    .count_documents(doc! { "eid": &eid, "tipo": TIPO_COLLECTION })
                    .await
                    .map_err(|error| format!("No se pudieron contar las colecciones: {error}"))?
                    as i32,
            };

            let object_id = ObjectId::new();
            let document = ApiCollectionDocument {
                id: Some(object_id),
                tipo: TIPO_COLLECTION.to_string(),
                eid,
                nombre: nombre.clone(),
                color: color.unwrap_or_else(|| DEFAULT_COLLECTION_COLOR.to_string()),
                orden,
                timestamp: now,
                updated_at: now,
            };

            handle
                .insert_one(&document)
                .await
                .map_err(|error| format!("Error al crear la colección: {error}"))?;

            log::info!("Colección creada: {} ({})", object_id.to_hex(), nombre);
            Ok(object_id.to_hex())
        }
    }
}

/// Payload para reordenar colecciones con drag & drop en el sidebar.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReorderCollectionsPayload {
    pub eid: String,
    /// `_id` de las colecciones en el orden final (el primero queda arriba).
    pub ids: Vec<String>,
}

/// Reasigna el campo `orden` de las colecciones del EID según el orden recibido.
#[tauri::command]
pub async fn reorder_api_collections(payload: ReorderCollectionsPayload) -> Result<(), String> {
    if payload.ids.is_empty() {
        return Ok(());
    }

    let handle = get_collections_handle().await?;
    let now = bson::DateTime::from_chrono(Utc::now());

    for (index, raw) in payload.ids.iter().enumerate() {
        let object_id = parse_id(raw)?;
        handle
            .update_one(
                doc! { "_id": object_id, "eid": &payload.eid, "tipo": TIPO_COLLECTION },
                doc! { "$set": { "orden": index as i32, "updated_at": now } },
            )
            .await
            .map_err(|error| format!("No se pudo reordenar la colección: {error}"))?;
    }

    log::info!(
        "Colecciones reordenadas para EID {} ({} colecciones)",
        payload.eid,
        payload.ids.len()
    );

    Ok(())
}

/// Elimina una colección. Por defecto elimina también sus requests.
#[tauri::command]
pub async fn delete_api_collection(payload: DeleteCollectionPayload) -> Result<(), String> {
    let object_id = parse_id(&payload.id)?;
    let hex = object_id.to_hex();

    let handle = get_collections_handle().await?;
    let result = handle
        .delete_one(doc! { "_id": object_id, "tipo": TIPO_COLLECTION })
        .await
        .map_err(|error| format!("Error al eliminar la colección: {error}"))?;

    if result.deleted_count == 0 {
        return Err("La colección no existe o ya fue eliminada".to_string());
    }

    let requests = get_collection().await?;
    let affected = if payload.delete_requests {
        requests
            .delete_many(doc! { "tipo": TIPO_REQUEST, "coleccion_id": &hex })
            .await
            .map_err(|error| format!("Error al eliminar las requests de la colección: {error}"))?
            .deleted_count
    } else {
        requests
            .update_many(
                doc! { "tipo": TIPO_REQUEST, "coleccion_id": &hex },
                doc! { "$unset": { "coleccion_id": "" } },
            )
            .await
            .map_err(|error| format!("Error al desvincular las requests: {error}"))?
            .modified_count
    };

    log::info!(
        "Colección {} eliminada ({} requests afectadas)",
        hex,
        affected
    );

    Ok(())
}

/// Duplica una colección junto con todas sus requests.
#[tauri::command]
pub async fn duplicate_api_collection(id: String) -> Result<String, String> {
    let object_id = parse_id(&id)?;
    let handle = get_collections_handle().await?;

    let source = handle
        .find_one(doc! { "_id": object_id, "tipo": TIPO_COLLECTION })
        .await
        .map_err(|error| format!("Error al buscar la colección a duplicar: {error}"))?
        .ok_or_else(|| "No se encontró la colección a duplicar".to_string())?;

    let new_id = ObjectId::new();
    let now = Utc::now();
    let new_hex = new_id.to_hex();

    let copy = ApiCollectionDocument {
        id: Some(new_id),
        nombre: format!("{} (copia)", source.nombre),
        orden: source.orden + 1,
        timestamp: now,
        updated_at: now,
        ..source
    };

    handle
        .insert_one(&copy)
        .await
        .map_err(|error| format!("Error al duplicar la colección: {error}"))?;

    let requests = get_collection().await?;
    let mut cursor = requests
        .find(doc! { "tipo": TIPO_REQUEST, "coleccion_id": object_id.to_hex() })
        .await
        .map_err(|error| format!("Error al leer las requests de la colección: {error}"))?;

    let mut copies = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("Error al leer las requests de la colección: {error}"))?
    {
        let mut document: ApiRequestDocument = cursor
            .deserialize_current()
            .map_err(|error| format!("Request inválida en MongoDB: {error}"))?;
        document.id = Some(ObjectId::new());
        document.coleccion_id = Some(new_hex.clone());
        document.timestamp = now;
        document.updated_at = now;
        document.version = 1;
        copies.push(document);
    }

    if !copies.is_empty() {
        requests
            .insert_many(&copies)
            .await
            .map_err(|error| format!("Error al copiar las requests: {error}"))?;
    }

    log::info!(
        "Colección duplicada: {} -> {} ({} requests)",
        object_id.to_hex(),
        new_hex,
        copies.len()
    );

    Ok(new_hex)
}

/// Mueve una request a otra colección (o la deja sin colección con `null`).
#[tauri::command]
pub async fn move_api_request(payload: MoveRequestPayload) -> Result<(), String> {
    let object_id = parse_id(&payload.id)?;
    let requests = get_collection().await?;

    let target = payload
        .coleccion_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let result = match target {
        Some(value) => {
            parse_id(&value)?;
            requests
                .update_one(
                    doc! { "_id": object_id, "tipo": TIPO_REQUEST },
                    doc! {
                        "$set": {
                            "coleccion_id": value,
                            "updated_at": bson::DateTime::from_chrono(Utc::now()),
                        },
                    },
                )
                .await
        }
        None => {
            requests
                .update_one(
                    doc! { "_id": object_id, "tipo": TIPO_REQUEST },
                    doc! {
                        "$unset": { "coleccion_id": "" },
                        "$set": { "updated_at": bson::DateTime::from_chrono(Utc::now()) },
                    },
                )
                .await
        }
    }
    .map_err(|error| format!("Error al mover la request: {error}"))?;

    if result.matched_count == 0 {
        return Err("La request no existe o ya fue eliminada".to_string());
    }

    log::info!("Request {} movida de colección", object_id.to_hex());
    Ok(())
}

/// Payload para reordenar/mover requests dentro del sidebar.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReorderRequestsPayload {
    pub eid: String,
    /// Colección destino. `None` mueve a la agrupación "Sin colección".
    #[serde(default)]
    pub coleccion_id: Option<String>,
    /// `_id` de las requests en el orden final (el primero queda arriba).
    pub ids: Vec<String>,
}

/// Reasigna `orden` y `coleccion_id` a las requests indicadas.
///
/// Se usa tanto para mover una request entre colecciones como para
/// reordenarla dentro de la misma (drag & drop estilo Postman).
#[tauri::command]
pub async fn reorder_api_requests(payload: ReorderRequestsPayload) -> Result<(), String> {
    if payload.ids.is_empty() {
        return Ok(());
    }

    let handle = get_collection().await?;
    let target = payload
        .coleccion_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let Some(coleccion_id) = &target {
        parse_id(coleccion_id)?;
    }

    for (index, raw) in payload.ids.iter().enumerate() {
        let object_id = parse_id(raw)?;
        let orden = index as i32;

        let update = match &target {
            Some(coleccion_id) => doc! {
                "$set": {
                    "orden": orden,
                    "coleccion_id": coleccion_id,
                },
            },
            None => doc! {
                "$set": { "orden": orden },
                "$unset": { "coleccion_id": "" },
            },
        };

        handle
            .update_one(
                doc! { "_id": object_id, "eid": &payload.eid, "tipo": TIPO_REQUEST },
                update,
            )
            .await
            .map_err(|error| format!("No se pudo mover la request: {error}"))?;
    }

    log::info!(
        "Requests reordenadas para EID {} ({} requests, colección {:?})",
        payload.eid,
        payload.ids.len(),
        target
    );

    Ok(())
}

/// Elimina una request por `_id`.
#[tauri::command]
pub async fn delete_api_request(id: String) -> Result<(), String> {
    let object_id = parse_id(&id)?;
    let collection = get_collection().await?;

    let result = collection
        .delete_one(doc! { "_id": object_id })
        .await
        .map_err(|error| format!("Error al eliminar la request: {error}"))?;

    if result.deleted_count == 0 {
        return Err("La request no existe o ya fue eliminada".to_string());
    }

    log::info!("Request eliminada de MongoDB: {}", object_id.to_hex());
    Ok(())
}

/// Duplica una request existente añadiendo el sufijo "(copia)".
#[tauri::command]
pub async fn duplicate_api_request(id: String) -> Result<String, String> {
    let object_id = parse_id(&id)?;
    let collection = get_collection().await?;

    let source = collection
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|error| format!("Error al buscar la request a duplicar: {error}"))?
        .ok_or_else(|| "No se encontró la request a duplicar".to_string())?;

    let new_id = ObjectId::new();
    let now = Utc::now();

    let copy = ApiRequestDocument {
        id: Some(new_id),
        nombre: format!("{} (copia)", source.nombre),
        timestamp: now,
        updated_at: now,
        version: 1,
        ..source
    };

    collection
        .insert_one(&copy)
        .await
        .map_err(|error| format!("Error al duplicar la request: {error}"))?;

    log::info!(
        "Request duplicada: {} -> {}",
        object_id.to_hex(),
        new_id.to_hex()
    );

    Ok(new_id.to_hex())
}

// ---------------------------------------------------------------------------
// Tests unitarios (sin conexión a MongoDB)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cifrado_es_reversible() {
        let plain = "Bearer super-secret-token";
        let encrypted = encrypt_secret(plain).expect("cifrar");
        assert!(encrypted.starts_with(ENC_PREFIX));
        assert_ne!(encrypted, plain);
        assert_eq!(decrypt_secret(&encrypted).expect("descifrar"), plain);
    }

    #[test]
    fn get_no_persiste_body() {
        let body = Some("{\"a\":1}".to_string());
        assert_eq!(normalize_body("GET", body).expect("normalizar"), None);
    }

    #[test]
    fn body_mayor_a_1mb_falla() {
        let big = Some("x".repeat(MAX_BODY_BYTES + 1));
        assert!(normalize_body("POST", big).is_err());
    }

    /// Prueba de integración real contra MongoDB local.
    /// Ejecutar con: cargo test --lib -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "requiere una instancia de MongoDB accesible"]
    async fn flujo_completo_mongodb() {
        let _ = dotenvy::from_filename("../.env");
        let _ = dotenvy::from_filename(".env");

        let eid = "TEST-RUBRIPOST-EID";
        let collection = get_collection().await.expect("colección");

        // Limpieza previa.
        collection
            .delete_many(doc! { "eid": eid })
            .await
            .expect("limpieza");

        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        headers.insert("X-Test".to_string(), "rubrifact".to_string());

        let payload = ApiRequestPayload {
            id: None,
            eid: eid.to_string(),
            nombre: "Buscar XML Factura 1300".to_string(),
            contexto: "Extracción XML".to_string(),
            metodo: "POST".to_string(),
            url: "https://api.ejemplo.com/factura?numero=1300".to_string(),
            body: Some("{\"numero\":\"1300\"}".to_string()),
            headers: Some(headers),
            query_descripciones: Some(HashMap::from([(
                "numero".to_string(),
                "Número de factura a buscar".to_string(),
            )])),
            auth: Some(AuthConfig {
                kind: "bearer".to_string(),
                token: Some("token-secreto-123".to_string()),
                api_key_name: None,
                api_key_value: None,
            }),
            http_info: HttpInfo {
                status_code: 200,
                duration_ms: 321,
            },
            coleccion_id: None,
            version: None,
        };

        // Crear.
        let id = save_api_request_full(payload.clone()).await.expect("guardar");

        let saved = get_api_requests_full(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 10,
        })
        .await
        .expect("listar");

        assert_eq!(saved.len(), 1);
        let record = &saved[0];
        assert_eq!(record.id, id);
        assert_eq!(record.nombre, "Buscar XML Factura 1300");
        assert_eq!(record.body.as_deref(), Some("{\"numero\":\"1300\"}"));
        assert_eq!(
            record.headers.as_ref().and_then(|h| h.get("X-Test")),
            Some(&"rubrifact".to_string())
        );
        // Los query params viajan en la URL y sus descripciones se guardan.
        assert_eq!(record.url, "https://api.ejemplo.com/factura?numero=1300");
        assert_eq!(
            record.query_descripciones.get("numero").map(String::as_str),
            Some("Número de factura a buscar")
        );
        // El token se descifra al leerlo.
        assert_eq!(
            record.auth.as_ref().and_then(|a| a.token.as_deref()),
            Some("token-secreto-123")
        );
        assert_eq!(record.http_info.status_code, 200);
        assert_eq!(record.version, 1);

        // Verificar que en MongoDB quedó cifrado.
        let raw = collection
            .find_one(doc! { "_id": ObjectId::parse_str(&id).expect("oid") })
            .await
            .expect("buscar raw")
            .expect("existe");
        let raw_token = raw
            .auth
            .as_ref()
            .and_then(|a| a.token.as_deref())
            .expect("token crudo");
        assert!(raw_token.starts_with(ENC_PREFIX));
        assert!(!raw_token.contains("token-secreto-123"));

        // Actualizar (upsert idempotente).
        let mut update = payload.clone();
        update.id = Some(id.clone());
        update.body = Some("{\"numero\":\"1301\"}".to_string());
        update.nombre = "Buscar XML Factura 1301".to_string();
        let updated_id = save_api_request_full(update).await.expect("actualizar");
        assert_eq!(updated_id, id);

        let saved = get_api_requests_full(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 10,
        })
        .await
        .expect("listar tras update");
        assert_eq!(saved.len(), 1, "el upsert no debe duplicar");
        assert_eq!(saved[0].body.as_deref(), Some("{\"numero\":\"1301\"}"));
        assert_eq!(saved[0].version, 2);

        // Duplicar.
        let copy_id = duplicate_api_request(id.clone()).await.expect("duplicar");
        let saved = get_api_requests_full(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 10,
        })
        .await
        .expect("listar tras duplicar");
        assert_eq!(saved.len(), 2);
        assert!(saved
            .iter()
            .any(|item| item.id == copy_id && item.nombre.ends_with("(copia)")));

        // Eliminar.
        delete_api_request(copy_id).await.expect("eliminar copia");
        delete_api_request(id).await.expect("eliminar original");

        let saved = get_api_requests_full(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 10,
        })
        .await
        .expect("listar final");
        assert!(saved.is_empty());

        // ------------------------------------------------------------------
        // Colecciones (misma colección física de MongoDB, sin historial)
        // ------------------------------------------------------------------

        // El workspace siembra la colección 'General'.
        let workspace = get_api_workspace(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 50,
        })
        .await
        .expect("workspace inicial");
        assert_eq!(workspace.collections.len(), 1);
        assert_eq!(workspace.collections[0].nombre, DEFAULT_COLLECTION_NAME);
        let general_id = workspace.collections[0].id.clone();

        // Crear una colección nueva.
        let nueva = save_api_collection(ApiCollectionPayload {
            id: None,
            eid: eid.to_string(),
            nombre: "Facturación".to_string(),
            color: Some("#C5A059".to_string()),
            orden: None,
        })
        .await
        .expect("crear colección");
        assert_ne!(nueva, general_id);

        // Guardar una request directamente en esa colección.
        let mut con_coleccion = payload.clone();
        con_coleccion.nombre = "Request en Facturación".to_string();
        con_coleccion.coleccion_id = Some(nueva.clone());
        let request_id = save_api_request_full(con_coleccion)
            .await
            .expect("guardar en colección");

        let workspace = get_api_workspace(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 50,
        })
        .await
        .expect("workspace con colecciones");
        assert_eq!(workspace.collections.len(), 2);
        assert_eq!(workspace.requests.len(), 1);
        assert_eq!(
            workspace.requests[0].coleccion_id.as_deref(),
            Some(nueva.as_str())
        );

        // Mover la request a otra colección.
        move_api_request(MoveRequestPayload {
            id: request_id.clone(),
            coleccion_id: Some(general_id.clone()),
        })
        .await
        .expect("mover request");
        let workspace = get_api_workspace(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 50,
        })
        .await
        .expect("workspace tras mover");
        assert_eq!(
            workspace.requests[0].coleccion_id.as_deref(),
            Some(general_id.as_str())
        );

        // Duplicar una colección copia también sus requests.
        let mut en_nueva = payload.clone();
        en_nueva.nombre = "Otra en Facturación".to_string();
        en_nueva.coleccion_id = Some(nueva.clone());
        save_api_request_full(en_nueva)
            .await
            .expect("segunda request en colección");

        let copia = duplicate_api_collection(nueva.clone())
            .await
            .expect("duplicar colección");
        let workspace = get_api_workspace(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 50,
        })
        .await
        .expect("workspace tras duplicar");
        assert_eq!(workspace.collections.len(), 3);
        assert_eq!(workspace.requests.len(), 3);
        assert!(workspace
            .collections
            .iter()
            .any(|item| item.id == copia && item.nombre.ends_with("(copia)")));

        // Eliminar la colección duplicada elimina sus requests.
        delete_api_collection(DeleteCollectionPayload {
            id: copia,
            delete_requests: true,
        })
        .await
        .expect("eliminar colección");
        let workspace = get_api_workspace(ApiRequestFilter {
            eid: eid.to_string(),
            limit: 50,
        })
        .await
        .expect("workspace tras eliminar");
        assert_eq!(workspace.collections.len(), 2);
        assert_eq!(workspace.requests.len(), 2);

        // Limpieza final.
        collection
            .delete_many(doc! { "eid": eid })
            .await
            .expect("limpieza final");
    }
}
