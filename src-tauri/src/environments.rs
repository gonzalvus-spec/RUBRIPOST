//! Entornos y variables de proyecto, compatibles con la resolución `{{clave}}`.

use chrono::{DateTime, Utc};
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::{Collection, IndexModel};
use serde::{Deserialize, Serialize};

use crate::auth::{RegistrarHistorialPayload, insertar_historial};
use crate::mongo::{decrypt_secret, encrypt_secret, get_client};

const DEFAULT_DB: &str = "rubripost_db";
const COLLECTION_NAME: &str = "environments";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EnvironmentVariable {
    #[serde(default)]
    pub id: String,
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_variable_type", rename = "type")]
    pub variable_type: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub description: String,
}

fn default_variable_type() -> String {
    "default".to_string()
}
fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct EnvironmentDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    id: Option<ObjectId>,
    eid: String,
    nombre: String,
    #[serde(default)]
    variables: Vec<EnvironmentVariable>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    timestamp: DateTime<Utc>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    updated_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EnvironmentRecord {
    #[serde(rename = "_id")]
    id: String,
    eid: String,
    nombre: String,
    variables: Vec<EnvironmentVariable>,
    timestamp: String,
    updated_at: String,
}

#[derive(Deserialize, Debug)]
pub struct SaveEnvironmentPayload {
    #[serde(default)]
    id: Option<String>,
    eid: String,
    nombre: String,
    #[serde(default)]
    variables: Vec<EnvironmentVariable>,
    #[serde(default)]
    usuario: String,
}

#[derive(Deserialize, Debug)]
pub struct EnvironmentIdPayload {
    id: String,
    eid: String,
    #[serde(default)]
    usuario: String,
}

async fn collection() -> Result<Collection<EnvironmentDocument>, String> {
    let client = get_client().await?;
    let handle = client.database(DEFAULT_DB).collection(COLLECTION_NAME);
    handle
        .create_indexes(vec![
            IndexModel::builder()
                .keys(doc! { "eid": 1, "updated_at": -1 })
                .build(),
            IndexModel::builder()
                .keys(doc! { "eid": 1, "nombre": 1 })
                .build(),
        ])
        .await
        .map_err(|error| format!("No se pudieron crear los índices de entornos: {error}"))?;
    Ok(handle)
}

fn parse_id(value: &str) -> Result<ObjectId, String> {
    ObjectId::parse_str(value.trim())
        .map_err(|_| "El identificador del entorno no es válido".to_string())
}

fn encrypt_variables(
    mut variables: Vec<EnvironmentVariable>,
) -> Result<Vec<EnvironmentVariable>, String> {
    for variable in &mut variables {
        variable.key = variable.key.trim().to_string();
        if variable.id.trim().is_empty() {
            variable.id = ObjectId::new().to_hex();
        }
        variable.variable_type = if variable.variable_type == "secret" {
            "secret"
        } else {
            "default"
        }
        .to_string();
        if variable.variable_type == "secret" {
            variable.value = encrypt_secret(&variable.value)?;
        }
    }
    Ok(variables)
}

fn into_record(mut document: EnvironmentDocument) -> Result<EnvironmentRecord, String> {
    let id = document
        .id
        .ok_or_else(|| "El entorno no tiene _id".to_string())?;
    for variable in &mut document.variables {
        if variable.variable_type == "secret" {
            variable.value = decrypt_secret(&variable.value)?;
        }
    }
    Ok(EnvironmentRecord {
        id: id.to_hex(),
        eid: document.eid,
        nombre: document.nombre,
        variables: document.variables,
        timestamp: document.timestamp.to_rfc3339(),
        updated_at: document.updated_at.to_rfc3339(),
    })
}

async fn audit(eid: &str, usuario: &str, accion: &str, id: &str, nombre: &str) {
    if usuario.trim().is_empty() {
        return;
    }
    let _ = insertar_historial(RegistrarHistorialPayload {
        project_id: Some(eid.to_string()),
        usuario: usuario.to_string(),
        accion: accion.to_string(),
        entidad: "environment".to_string(),
        entidad_id: Some(id.to_string()),
        nombre: Some(nombre.to_string()),
        detalle: None,
    })
    .await;
}

#[tauri::command]
pub async fn list_environments(eid: String) -> Result<Vec<EnvironmentRecord>, String> {
    if eid.trim().is_empty() {
        return Err("El EID es obligatorio".to_string());
    }
    let mut cursor = collection()
        .await?
        .find(doc! { "eid": eid.trim() })
        .sort(doc! { "nombre": 1 })
        .await
        .map_err(|error| format!("No se pudieron consultar los entornos: {error}"))?;
    let mut records = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("No se pudieron leer los entornos: {error}"))?
    {
        let document = cursor
            .deserialize_current()
            .map_err(|error| format!("Entorno inválido: {error}"))?;
        records.push(into_record(document)?);
    }
    Ok(records)
}

/// Nombre estable usado por el store de Zustand al entrar a un proyecto.
#[tauri::command]
pub async fn get_environments(eid: String) -> Result<Vec<EnvironmentRecord>, String> {
    list_environments(eid).await
}

#[tauri::command]
pub async fn save_environment(
    payload: SaveEnvironmentPayload,
) -> Result<EnvironmentRecord, String> {
    let eid = payload.eid.trim().to_string();
    let nombre = payload.nombre.trim().to_string();
    if eid.is_empty() || nombre.is_empty() {
        return Err("El EID y el nombre son obligatorios".to_string());
    }
    let variables = encrypt_variables(payload.variables)?;
    let handle = collection().await?;
    let now = Utc::now();
    let (id, created) = match payload
        .id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        Some(raw) => {
            let id = parse_id(raw)?;
            let result = handle.update_one(doc! { "_id": id, "eid": &eid }, doc! { "$set": {
                "nombre": &nombre, "variables": mongodb::bson::to_bson(&variables).map_err(|error| error.to_string())?,
                "updated_at": mongodb::bson::DateTime::from_chrono(now),
            }}).await.map_err(|error| format!("No se pudo actualizar el entorno: {error}"))?;
            if result.matched_count == 0 {
                return Err("El entorno ya no existe en este proyecto".to_string());
            }
            (id, false)
        }
        None => {
            let id = ObjectId::new();
            handle
                .insert_one(EnvironmentDocument {
                    id: Some(id),
                    eid: eid.clone(),
                    nombre: nombre.clone(),
                    variables,
                    timestamp: now,
                    updated_at: now,
                })
                .await
                .map_err(|error| format!("No se pudo crear el entorno: {error}"))?;
            (id, true)
        }
    };
    audit(
        &eid,
        &payload.usuario,
        if created {
            "Creó entorno"
        } else {
            "Actualizó entorno"
        },
        &id.to_hex(),
        &nombre,
    )
    .await;
    let saved = handle
        .find_one(doc! { "_id": id, "eid": &eid })
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No se pudo recargar el entorno".to_string())?;
    into_record(saved)
}

#[tauri::command]
pub async fn delete_environment(payload: EnvironmentIdPayload) -> Result<(), String> {
    let handle = collection().await?;
    let id = parse_id(&payload.id)?;
    let source = handle
        .find_one(doc! { "_id": id, "eid": payload.eid.trim() })
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "El entorno ya no existe".to_string())?;
    handle
        .delete_one(doc! { "_id": id, "eid": payload.eid.trim() })
        .await
        .map_err(|error| format!("No se pudo eliminar el entorno: {error}"))?;
    audit(
        &payload.eid,
        &payload.usuario,
        "Eliminó entorno",
        &payload.id,
        &source.nombre,
    )
    .await;
    Ok(())
}

#[tauri::command]
pub async fn duplicate_environment(
    payload: EnvironmentIdPayload,
) -> Result<EnvironmentRecord, String> {
    let handle = collection().await?;
    let source = handle
        .find_one(doc! { "_id": parse_id(&payload.id)?, "eid": payload.eid.trim() })
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "El entorno ya no existe".to_string())?;
    let id = ObjectId::new();
    let now = Utc::now();
    let nombre = format!("{} (copia)", source.nombre);
    handle
        .insert_one(EnvironmentDocument {
            id: Some(id),
            eid: source.eid.clone(),
            nombre: nombre.clone(),
            variables: source.variables,
            timestamp: now,
            updated_at: now,
        })
        .await
        .map_err(|error| format!("No se pudo duplicar el entorno: {error}"))?;
    audit(
        &payload.eid,
        &payload.usuario,
        "Duplicó entorno",
        &id.to_hex(),
        &nombre,
    )
    .await;
    let copy = handle
        .find_one(doc! { "_id": id, "eid": payload.eid.trim() })
        .await
        .map_err(|error| error.to_string())?
        .ok_or("No se pudo recargar la copia")?;
    into_record(copy)
}
