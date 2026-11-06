//! Envío de requests HTTP con soporte de cookies (estilo Bruno).
//!
//! - La request se ejecuta de forma nativa (reqwest), no con el `fetch` del
//!   webview. Eso permite enviar y recibir cabeceras `Cookie`/`Set-Cookie`,
//!   que el navegador bloquea, y evita los problemas de CORS.
//! - Las cookies recibidas se guardan en la colección `cookies` de MongoDB y
//!   se reenvían automáticamente en las siguientes requests al mismo dominio.
//! - La UI también puede crear, editar y eliminar cookies a mano.

use std::collections::HashMap;
use std::time::Instant;

use chrono::{DateTime, Duration, Utc};
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::{Collection, IndexModel};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, COOKIE, SET_COOKIE};
use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::fechas::{fecha_bson_o_texto, fecha_opcional_bson_o_texto};
use crate::mongo::get_client;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const COOKIES_COLLECTION: &str = "cookies";
const DEFAULT_DB: &str = "rubripost_db";
const MAX_BODY_CHARS: usize = 4 * 1024 * 1024; // 4 MB de respuesta

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct EnviarRequestPayload {
    #[serde(default)]
    pub eid: String,
    pub metodo: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    /// Permite desactivar el envío automático de cookies guardadas.
    #[serde(default)]
    pub enviar_cookies: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HeaderPar {
    pub nombre: String,
    pub valor: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RespuestaHttp {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: i64,
    pub content_type: String,
    pub body: String,
    pub headers: Vec<HeaderPar>,
    /// Cookies vigentes del dominio después de la respuesta.
    pub cookies: Vec<CookieRegistro>,
}

/// Cookie tal como se guarda en MongoDB.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CookieDocumento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub eid: String,
    pub dominio: String,
    pub nombre: String,
    pub valor: String,
    pub ruta: String,
    #[serde(default, with = "fecha_opcional_bson_o_texto")]
    pub expira: Option<DateTime<Utc>>,
    pub seguro: bool,
    pub http_only: bool,
    #[serde(default = "Utc::now", with = "fecha_bson_o_texto")]
    pub creado_en: DateTime<Utc>,
    #[serde(default = "Utc::now", with = "fecha_bson_o_texto")]
    pub actualizado_en: DateTime<Utc>,
}

/// Cookie lista para la UI.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CookieRegistro {
    pub id: String,
    pub dominio: String,
    pub nombre: String,
    pub valor: String,
    pub ruta: String,
    pub expira: Option<String>,
    pub seguro: bool,
    pub http_only: bool,
    pub actualizado_en: String,
}

impl CookieDocumento {
    fn a_registro(&self) -> CookieRegistro {
        CookieRegistro {
            id: self.id.map(|id| id.to_hex()).unwrap_or_default(),
            dominio: self.dominio.clone(),
            nombre: self.nombre.clone(),
            valor: self.valor.clone(),
            ruta: self.ruta.clone(),
            expira: self.expira.map(|valor| valor.to_rfc3339()),
            seguro: self.seguro,
            http_only: self.http_only,
            actualizado_en: self.actualizado_en.to_rfc3339(),
        }
    }

    fn vigente(&self) -> bool {
        match self.expira {
            Some(fecha) => fecha > Utc::now(),
            None => true,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ListarCookiesPayload {
    #[serde(default)]
    pub eid: String,
    /// URL opcional: si falta, se listan TODAS las cookies del proyecto.
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GuardarCookiePayload {
    #[serde(default)]
    pub eid: String,
    /// Identificador de una cookie existente, para editarla.
    #[serde(default)]
    pub id: Option<String>,
    /// Dominio explícito; si falta se deduce de `url`.
    #[serde(default)]
    pub dominio: Option<String>,
    pub url: String,
    pub nombre: String,
    pub valor: String,
    #[serde(default)]
    pub ruta: Option<String>,
    /// Fecha de expiración opcional en ISO 8601.
    #[serde(default)]
    pub expira: Option<String>,
    #[serde(default)]
    pub seguro: Option<bool>,
    #[serde(default)]
    pub http_only: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EliminarCookiePayload {
    pub id: String,
}

/// Payload para limpiar el tarro de cookies de un proyecto.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LimpiarCookiesPayload {
    #[serde(default)]
    pub eid: String,
    /// Si se indica, solo se borran las cookies de ese dominio.
    #[serde(default)]
    pub dominio: Option<String>,
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

async fn get_cookies() -> Result<Collection<CookieDocumento>, String> {
    let client = get_client().await?;
    let db_name = std::env::var("MONGODB_DB").unwrap_or_else(|_| DEFAULT_DB.to_string());
    Ok(client.database(&db_name).collection(COOKIES_COLLECTION))
}

async fn ensure_cookie_indexes() -> Result<(), String> {
    let cookies = get_cookies().await?;
    cookies
        .create_indexes(vec![
            IndexModel::builder()
                .keys(doc! { "eid": 1, "dominio": 1, "nombre": 1, "ruta": 1 })
                .build(),
            IndexModel::builder()
                .keys(doc! { "eid": 1, "dominio": 1 })
                .build(),
        ])
        .await
        .map_err(|error| format!("No se pudieron crear los índices de cookies: {error}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Interpreta la URL indicada. Acepta URLs completas y también dominios sin
/// esquema (por ejemplo `api.ejemplo.com/v1`), que es lo que suele escribir el
/// usuario al probar un endpoint.
fn parsear_url(url: &str) -> Result<reqwest::Url, String> {
    let texto = url.trim();
    if texto.is_empty() {
        return Err(
            "Escribe una URL válida para administrar sus cookies.".to_string(),
        );
    }

    if let Ok(parsed) = reqwest::Url::parse(texto) {
        if parsed.host_str().is_some() {
            return Ok(parsed);
        }
    }

    // Sin esquema: se asume HTTPS solo si parece un dominio real, para no
    // confundir una ruta relativa (`/api/v1`) con un host.
    let primer_segmento = texto.split('/').next().unwrap_or_default();
    let parece_dominio = primer_segmento.contains('.')
        || primer_segmento.contains(':')
        || primer_segmento.eq_ignore_ascii_case("localhost");

    if parece_dominio {
        if let Ok(parsed) = reqwest::Url::parse(&format!("https://{texto}")) {
            if parsed.host_str().is_some() {
                return Ok(parsed);
            }
        }
    }

    Err(
        "URL inválida: escribe una URL completa, por ejemplo https://api.ejemplo.com/ruta"
            .to_string(),
    )
}

/// Host del URL (sin puerto ni www) o error si no es válido.
fn dominio_de(url: &str) -> Result<String, String> {
    let parsed = parsear_url(url)?;
    parsed
        .host_str()
        .map(|host| host.trim_start_matches("www.").to_lowercase())
        .ok_or_else(|| "La URL no tiene dominio: escribe https://dominio/...".to_string())
}

fn ruta_de(url: &str) -> String {
    parsear_url(url)
        .ok()
        .map(|parsed| {
            let ruta = parsed.path().to_string();
            if ruta.is_empty() {
                "/".to_string()
            } else {
                ruta
            }
        })
        .unwrap_or_else(|| "/".to_string())
}

/// Una cookie aplica si el dominio coincide exactamente o es padre del host.
fn dominio_coincide(cookie: &str, host: &str) -> bool {
    let cookie = cookie.trim_start_matches('.').to_lowercase();
    host == cookie || host.ends_with(&format!(".{cookie}"))
}

fn ruta_coincide(cookie_ruta: &str, ruta: &str) -> bool {
    if cookie_ruta == "/" || cookie_ruta.is_empty() {
        return true;
    }
    ruta == cookie_ruta || ruta.starts_with(&format!("{cookie_ruta}/"))
}

/// Lee todas las cookies del tarro de un EID, borrando antes las caducadas.
///
/// Se usa tanto para enviar (filtrando después por dominio y ruta) como para
/// el panel de cookies, que las muestra todas las del dominio, igual que Bruno.
async fn cookies_del_tarro(eid: &str) -> Result<Vec<CookieDocumento>, String> {
    let cookies = get_cookies().await?;

    // Las cookies caducadas se eliminan de la base para que el tarro no crezca.
    // `$type: "date"` evita borrar las cookies de sesión (expira = null).
    let ahora = mongodb::bson::DateTime::from_chrono(Utc::now());
    let _ = cookies
        .delete_many(doc! {
            "eid": eid,
            "expira": { "$type": "date", "$lt": ahora },
        })
        .await;

    let mut cursor = cookies
        .find(doc! { "eid": eid })
        .await
        .map_err(|error| format!("No se pudieron leer las cookies: {error}"))?;

    let mut tarro = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("No se pudieron leer las cookies: {error}"))?
    {
        let cookie: CookieDocumento = cursor
            .deserialize_current()
            .map_err(|error| format!("Cookie inválida en MongoDB: {error}"))?;
        tarro.push(cookie);
    }

    Ok(tarro)
}

/// Cookies que deben enviarse en una petición a `url`.
async fn cookies_aplicables(
    eid: &str,
    url: &str,
) -> Result<Vec<CookieDocumento>, String> {
    let parsed = parsear_url(url)?;
    let host = dominio_de(url)?;
    let ruta = ruta_de(url);
    let es_https = parsed.scheme() == "https";

    Ok(cookies_del_tarro(eid)
        .await?
        .into_iter()
        .filter(|cookie| {
            cookie.vigente()
                && (!cookie.seguro || es_https)
                && dominio_coincide(&cookie.dominio, &host)
                && ruta_coincide(&cookie.ruta, &ruta)
        })
        .collect())
}

/// Guarda (o reemplaza) una cookie recibida en `Set-Cookie`.
async fn guardar_cookie_recibida(
    eid: &str,
    host: &str,
    ruta_defecto: &str,
    cabecera: &str,
) -> Result<(), String> {
    let mut partes = cabecera.split(';');
    let Some(par_principal) = partes.next() else {
        return Ok(());
    };

    let (nombre, valor) = match par_principal.split_once('=') {
        Some((nombre, valor)) => (nombre.trim().to_string(), valor.trim().to_string()),
        None => return Ok(()),
    };
    if nombre.is_empty() {
        return Ok(());
    }

    let mut dominio = host.to_string();
    let mut ruta = ruta_defecto.to_string();
    let mut expira: Option<DateTime<Utc>> = None;
    let mut seguro = false;
    let mut http_only = false;
    let mut expirada = false;

    for atributo in partes {
        let (clave, valor) = match atributo.split_once('=') {
            Some((clave, valor)) => (clave.trim().to_lowercase(), valor.trim().to_string()),
            None => (atributo.trim().to_lowercase(), String::new()),
        };

        match clave.as_str() {
            "domain" if !valor.is_empty() => {
                dominio = valor.trim_start_matches('.').to_lowercase();
            }
            "path" if !valor.is_empty() => ruta = valor,
            "expires" => {
                if let Ok(fecha) = DateTime::parse_from_rfc2822(&valor) {
                    expira = Some(fecha.with_timezone(&Utc));
                }
            }
            "max-age" => {
                if let Ok(segundos) = valor.parse::<i64>() {
                    expira = Some(Utc::now() + Duration::seconds(segundos));
                    if segundos <= 0 {
                        expirada = true;
                    }
                }
            }
            "secure" => seguro = true,
            "httponly" => http_only = true,
            _ => {}
        }
    }

    let cookies = get_cookies().await?;
    let ahora = Utc::now();

    if expirada || expira.map(|fecha| fecha <= ahora).unwrap_or(false) {
        cookies
            .delete_one(doc! {
                "eid": eid,
                "dominio": &dominio,
                "nombre": &nombre,
                "ruta": &ruta,
            })
            .await
            .map_err(|error| format!("No se pudo borrar la cookie: {error}"))?;
        return Ok(());
    }

    let filtro = doc! {
        "eid": eid,
        "dominio": &dominio,
        "nombre": &nombre,
        "ruta": &ruta,
    };

    let actualizacion = doc! {
        "$set": {
            "valor": &valor,
            "expira": expira.map(mongodb::bson::DateTime::from_chrono),
            "seguro": seguro,
            "http_only": http_only,
            "actualizado_en": mongodb::bson::DateTime::from_chrono(ahora),
        },
        "$setOnInsert": {
            "eid": eid,
            "dominio": &dominio,
            "nombre": &nombre,
            "ruta": &ruta,
            "creado_en": mongodb::bson::DateTime::from_chrono(ahora),
        },
    };

    cookies
        .update_one(filtro, actualizacion)
        .upsert(true)
        .await
        .map_err(|error| format!("No se pudo guardar la cookie: {error}"))?;

    Ok(())
}

fn texto_estado(status: u16) -> String {
    reqwest::StatusCode::from_u16(status)
        .ok()
        .and_then(|codigo| codigo.canonical_reason())
        .unwrap_or("OK")
        .to_string()
}

// ---------------------------------------------------------------------------
// Comandos Tauri
// ---------------------------------------------------------------------------

/// Ejecuta la request de forma nativa (sin CORS) y administra las cookies.
#[tauri::command]
pub async fn enviar_request(payload: EnviarRequestPayload) -> Result<RespuestaHttp, String> {
    let url = payload.url.trim().to_string();
    if url.is_empty() {
        return Err("La URL es obligatoria".to_string());
    }

    ensure_cookie_indexes().await?;

    let eid = if payload.eid.trim().is_empty() {
        "EMP-0042".to_string()
    } else {
        payload.eid.trim().to_string()
    };

    let metodo = Method::from_bytes(payload.metodo.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("Método HTTP inválido: {}", payload.metodo))?;

    let host = dominio_de(&url)?;
    let ruta = ruta_de(&url);

    let mut cabeceras = HeaderMap::new();
    for (nombre, valor) in &payload.headers {
        if nombre.eq_ignore_ascii_case("cookie") || nombre.eq_ignore_ascii_case("host") {
            continue; // el header Cookie se arma con las cookies guardadas
        }
        if let (Ok(clave), Ok(valor)) = (
            HeaderName::from_bytes(nombre.as_bytes()),
            HeaderValue::from_str(valor),
        ) {
            cabeceras.insert(clave, valor);
        }
    }

    if payload.enviar_cookies.unwrap_or(true) {
        let aplicables = cookies_aplicables(&eid, &url).await?;
        if !aplicables.is_empty() {
            let unidas = aplicables
                .iter()
                .map(|cookie| format!("{}={}", cookie.nombre, cookie.valor))
                .collect::<Vec<_>>()
                .join("; ");
            let valor = HeaderValue::from_str(&unidas)
                .map_err(|error| format!("Cookies inválidas: {error}"))?;
            cabeceras.insert(COOKIE, valor);
        }
    }

    let cliente = reqwest::Client::builder()
        .user_agent("rubrifact-api-client/0.1")
        .build()
        .map_err(|error| format!("No se pudo crear el cliente HTTP: {error}"))?;

    let mut solicitud = cliente.request(metodo.clone(), &url).headers(cabeceras);
    if metodo != Method::GET {
        if let Some(cuerpo) = payload.body.clone() {
            if !cuerpo.trim().is_empty() {
                solicitud = solicitud.body(cuerpo);
            }
        }
    }

    let inicio = Instant::now();
    let respuesta = solicitud
        .send()
        .await
        .map_err(|error| format!("No se pudo conectar: {error}"))?;

    let status = respuesta.status().as_u16();
    let contenido_tipo = respuesta
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|valor| valor.to_str().ok())
        .unwrap_or_default()
        .to_string();

    let cabeceras_respuesta: Vec<HeaderPar> = respuesta
        .headers()
        .iter()
        .map(|(nombre, valor)| HeaderPar {
            nombre: nombre.as_str().to_string(),
            valor: valor.to_str().unwrap_or_default().to_string(),
        })
        .collect();

    // Las cookies se procesan antes de consumir el cuerpo.
    let set_cookies: Vec<String> = respuesta
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|valor| valor.to_str().ok().map(|texto| texto.to_string()))
        .collect();

    let cuerpo = respuesta
        .text()
        .await
        .map_err(|error| format!("No se pudo leer la respuesta: {error}"))?;

    let duracion = inicio.elapsed().as_millis() as i64;

    for cabecera in &set_cookies {
        if let Err(error) = guardar_cookie_recibida(&eid, &host, &ruta, cabecera).await {
            log::warn!("No se pudo guardar la cookie: {error}");
        }
    }

    let cookies = cookies_aplicables(&eid, &url)
        .await?
        .into_iter()
        .map(|cookie| cookie.a_registro())
        .collect();

    let recortado = if cuerpo.chars().count() > MAX_BODY_CHARS {
        cuerpo.chars().take(MAX_BODY_CHARS).collect::<String>()
    } else {
        cuerpo
    };

    Ok(RespuestaHttp {
        status,
        status_text: texto_estado(status),
        duration_ms: duracion,
        content_type: contenido_tipo,
        body: recortado,
        headers: cabeceras_respuesta,
        cookies,
    })
}

/// Cookies guardadas para el dominio de la URL indicada.
///
/// Como en el gestor de cookies de Bruno, se listan todas las del dominio sin
/// filtrar por ruta, para poder verlas y editarlas aunque la URL actual esté en
/// otra ruta. Al enviar la petición sí se filtran por ruta.
#[tauri::command]
pub async fn listar_cookies(payload: ListarCookiesPayload) -> Result<Vec<CookieRegistro>, String> {
    ensure_cookie_indexes().await?;
    let eid = if payload.eid.trim().is_empty() {
        "EMP-0042".to_string()
    } else {
        payload.eid.trim().to_string()
    };

    // Sin URL se devuelve el tarro completo del proyecto: las cookies son del
    // proyecto, no de la request ni de la colección donde está guardada.
    let host = match payload.url.as_deref().map(str::trim).filter(|url| !url.is_empty()) {
        Some(url) => Some(dominio_de(url)?),
        None => None,
    };

    let mut cookies: Vec<CookieRegistro> = cookies_del_tarro(&eid)
        .await?
        .into_iter()
        .filter(|cookie| match &host {
            Some(host) => cookie.vigente() && dominio_coincide(&cookie.dominio, host),
            None => true,
        })
        .map(|cookie| cookie.a_registro())
        .collect();

    cookies.sort_by(|a, b| {
        a.dominio
            .cmp(&b.dominio)
            .then_with(|| a.nombre.cmp(&b.nombre))
    });

    Ok(cookies)
}

/// Crea o actualiza una cookie manualmente.
#[tauri::command]
pub async fn guardar_cookie(payload: GuardarCookiePayload) -> Result<CookieRegistro, String> {
    ensure_cookie_indexes().await?;

    let nombre = payload.nombre.trim().to_string();
    if nombre.is_empty() {
        return Err("La cookie necesita un nombre".to_string());
    }

    let eid = if payload.eid.trim().is_empty() {
        "EMP-0042".to_string()
    } else {
        payload.eid.trim().to_string()
    };

    let dominio = match payload
        .dominio
        .as_deref()
        .map(str::trim)
        .filter(|valor| !valor.is_empty())
    {
        Some(valor) => valor.trim_start_matches('.').to_lowercase(),
        None => dominio_de(&payload.url)?,
    };
    let ruta = payload
        .ruta
        .as_deref()
        .map(str::trim)
        .filter(|valor| !valor.is_empty())
        .unwrap_or("/")
        .to_string();

    let expira = match payload.expira.as_deref().map(str::trim) {
        Some(texto) if !texto.is_empty() => Some(
            DateTime::parse_from_rfc3339(texto)
                .map(|fecha| fecha.with_timezone(&Utc))
                .map_err(|error| format!("Fecha de expiración inválida: {error}"))?,
        ),
        _ => None,
    };

    let cookies = get_cookies().await?;
    let ahora = Utc::now();

    // Si llega un id se edita esa cookie; si no, se crea o reemplaza la que
    // coincida en dominio, nombre y ruta (igual que el tarro de Bruno).
    let filtro = match payload
        .id
        .as_deref()
        .map(str::trim)
        .filter(|valor| !valor.is_empty())
    {
        Some(id) => {
            let oid = ObjectId::parse_str(id)
                .map_err(|_| "Identificador de cookie inválido".to_string())?;
            doc! { "_id": oid }
        }
        None => doc! { "eid": &eid, "dominio": &dominio, "nombre": &nombre, "ruta": &ruta },
    };

    cookies
        .update_one(
            filtro.clone(),
            doc! {
                "$set": {
                    "eid": &eid,
                    "dominio": &dominio,
                    "nombre": &nombre,
                    "ruta": &ruta,
                    "valor": payload.valor,
                    "expira": expira.map(mongodb::bson::DateTime::from_chrono),
                    "seguro": payload.seguro.unwrap_or(false),
                    "http_only": payload.http_only.unwrap_or(false),
                    "actualizado_en": mongodb::bson::DateTime::from_chrono(ahora),
                },
                "$setOnInsert": {
                    "creado_en": mongodb::bson::DateTime::from_chrono(ahora),
                },
            },
        )
        .upsert(true)
        .await
        .map_err(|error| format!("No se pudo guardar la cookie: {error}"))?;

    let guardada = cookies
        .find_one(filtro)
        .await
        .map_err(|error| format!("No se pudo leer la cookie guardada: {error}"))?
        .ok_or_else(|| "No se pudo leer la cookie guardada".to_string())?;

    Ok(guardada.a_registro())
}

/// Elimina una cookie por su id.
#[tauri::command]
pub async fn eliminar_cookie(payload: EliminarCookiePayload) -> Result<(), String> {
    let object_id = ObjectId::parse_str(&payload.id)
        .map_err(|_| "Identificador de cookie inválido".to_string())?;

    let cookies = get_cookies().await?;
    cookies
        .delete_one(doc! { "_id": object_id })
        .await
        .map_err(|error| format!("No se pudo eliminar la cookie: {error}"))?;

    Ok(())
}

/// Vacía el tarro de cookies del proyecto (o solo el de un dominio).
///
/// Devuelve cuántas cookies se eliminaron.
#[tauri::command]
pub async fn limpiar_cookies(payload: LimpiarCookiesPayload) -> Result<u64, String> {
    let eid = if payload.eid.trim().is_empty() {
        "EMP-0042".to_string()
    } else {
        payload.eid.trim().to_string()
    };

    let mut filtro = doc! { "eid": &eid };
    if let Some(dominio) = payload
        .dominio
        .as_deref()
        .map(str::trim)
        .map(|valor| valor.trim_start_matches('.').to_lowercase())
        .filter(|valor| !valor.is_empty())
    {
        // Un dominio puede tener cookies guardadas como `ejemplo.com` o
        // `api.ejemplo.com`: se borran todas las de ese dominio y sus hijos.
        filtro.insert(
            "dominio",
            doc! { "$regex": format!("(^|[.]){}$", regex_escape(&dominio)) },
        );
    }

    let cookies = get_cookies().await?;
    let resultado = cookies
        .delete_many(filtro)
        .await
        .map_err(|error| format!("No se pudieron limpiar las cookies: {error}"))?;

    Ok(resultado.deleted_count)
}

/// Escapa los caracteres especiales de una expresión regular.
fn regex_escape(texto: &str) -> String {
    texto
        .chars()
        .map(|caracter| {
            if matches!(
                caracter,
                '.' | '+' | '*' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '^' | '$' | '|' | '\\'
            ) {
                format!("\\{caracter}")
            } else {
                caracter.to_string()
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obtiene_el_dominio_sin_www() {
        assert_eq!(
            dominio_de("https://www.ejemplo.com/a/b").unwrap(),
            "ejemplo.com"
        );
        assert_eq!(dominio_de("https://api.ejemplo.com").unwrap(), "api.ejemplo.com");
        assert_eq!(
            dominio_de("api.ejemplo.com/v1").unwrap(),
            "api.ejemplo.com"
        );
        assert_eq!(dominio_de("localhost:3000/api").unwrap(), "localhost");
        assert!(dominio_de("/api/v1").is_err());
        assert!(dominio_de("no-es-url").is_err());
    }

    #[test]
    fn escapa_el_dominio_para_el_filtro_de_mongo() {
        // El filtro de `limpiar_cookies` usa una regex: los puntos del dominio
        // deben escaparse para no borrar dominios parecidos (apiXejemplo).
        assert_eq!(regex_escape("api.ejemplo.com"), r"api\.ejemplo\.com");
        assert_eq!(regex_escape("ejemplo"), "ejemplo");
    }

    #[test]
    fn calcula_la_ruta_por_defecto() {
        assert_eq!(ruta_de("https://ejemplo.com"), "/");
        assert_eq!(ruta_de("https://ejemplo.com/api/v1/x"), "/api/v1/x");
    }

    #[test]
    fn valida_coincidencia_de_dominio_y_ruta() {
        assert!(dominio_coincide("ejemplo.com", "ejemplo.com"));
        assert!(dominio_coincide("ejemplo.com", "api.ejemplo.com"));
        assert!(!dominio_coincide("ejemplo.com", "otro.com"));
        assert!(ruta_coincide("/", "/api/v1"));
        assert!(ruta_coincide("/api", "/api/v1"));
        assert!(!ruta_coincide("/otra", "/api/v1"));
    }
}
