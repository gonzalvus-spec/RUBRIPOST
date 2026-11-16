//! Chat compartido por workspace y request, persistido en MongoDB.

use chrono::{DateTime, Utc};
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::{Collection, IndexModel};
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

use crate::fechas::{fecha_bson_o_texto, fecha_opcional_bson_o_texto};
use crate::mongo::get_client;

const DEFAULT_DB: &str = "rubripost_db";
const CHAT_COLLECTION: &str = "chat_mensajes";
const CHAT_LIMIT: i64 = 200;
static CHAT_INDEX_READY: OnceCell<()> = OnceCell::const_new();

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatMessageDocument {
    #[serde(rename = "_id")]
    id: ObjectId,
    user_id: String,
    user_name: String,
    contenido: String,
    eid: String,
    request_key: String,
    request_name: String,
    #[serde(with = "fecha_bson_o_texto")]
    created_at: DateTime<Utc>,
    #[serde(default, with = "fecha_opcional_bson_o_texto")]
    updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    edited: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct ChatMessage {
    id: String,
    user_id: String,
    user_name: String,
    contenido: String,
    eid: String,
    request_key: String,
    request_name: String,
    created_at: String,
    updated_at: Option<String>,
    edited: bool,
}

impl ChatMessageDocument {
    fn into_public(self) -> ChatMessage {
        ChatMessage {
            id: self.id.to_hex(),
            user_id: self.user_id,
            user_name: self.user_name,
            contenido: self.contenido,
            eid: self.eid,
            request_key: self.request_key,
            request_name: self.request_name,
            created_at: self.created_at.to_rfc3339(),
            updated_at: self.updated_at.map(|date| date.to_rfc3339()),
            edited: self.edited,
        }
    }
}

#[derive(Deserialize, Debug)]
pub struct GetChatMessagesPayload {
    eid: String,
    request_key: String,
}

#[derive(Deserialize, Debug)]
pub struct SendChatMessagePayload {
    user_id: String,
    eid: String,
    request_key: String,
    request_name: String,
    contenido: String,
}

#[derive(Deserialize, Debug)]
pub struct UpdateChatMessagePayload {
    message_id: String,
    user_id: String,
    eid: String,
    request_key: String,
    contenido: String,
}

#[derive(Deserialize, Debug)]
pub struct DeleteChatMessagePayload {
    message_id: String,
    user_id: String,
    eid: String,
    request_key: String,
}

#[derive(Deserialize)]
struct ChatUserDocument {
    #[serde(rename = "_id")]
    id: ObjectId,
    nombre: String,
}

async fn chat_collection() -> Result<Collection<ChatMessageDocument>, String> {
    let client = get_client().await?;
    Ok(client.database(DEFAULT_DB).collection(CHAT_COLLECTION))
}

async fn ensure_chat_index(collection: &Collection<ChatMessageDocument>) -> Result<(), String> {
    CHAT_INDEX_READY
        .get_or_try_init(|| async {
            collection
                .create_index(
                    IndexModel::builder()
                        .keys(doc! { "eid": 1, "request_key": 1, "created_at": -1 })
                        .build(),
                )
                .await
                .map_err(|error| format!("No se pudo preparar el chat: {error}"))?;
            Ok::<(), String>(())
        })
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_chat_messages(
    payload: GetChatMessagesPayload,
) -> Result<Vec<ChatMessage>, String> {
    let eid = payload.eid.trim();
    let request_key = payload.request_key.trim();
    if eid.is_empty() || request_key.is_empty() {
        return Err("El chat requiere workspace y request".to_string());
    }

    let collection = chat_collection().await?;
    ensure_chat_index(&collection).await?;
    let mut cursor = collection
        .find(doc! { "eid": eid, "request_key": request_key })
        .sort(doc! { "created_at": -1 })
        .limit(CHAT_LIMIT)
        .await
        .map_err(|error| format!("No se pudo cargar el chat: {error}"))?;

    let mut messages = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|error| format!("No se pudo leer el chat: {error}"))?
    {
        let message = cursor
            .deserialize_current()
            .map_err(|error| format!("Mensaje de chat inválido: {error}"))?;
        messages.push(message.into_public());
    }
    messages.reverse();
    Ok(messages)
}

#[tauri::command]
pub async fn send_chat_message(payload: SendChatMessagePayload) -> Result<ChatMessage, String> {
    let user_oid = ObjectId::parse_str(payload.user_id.trim())
        .map_err(|_| "La sesión del usuario no es válida".to_string())?;
    let contenido = payload.contenido.trim();
    let eid = payload.eid.trim();
    let request_key = payload.request_key.trim();
    if contenido.is_empty() || eid.is_empty() || request_key.is_empty() {
        return Err("El mensaje, workspace y request son obligatorios".to_string());
    }
    if contenido.chars().count() > 4000 {
        return Err("El mensaje no puede superar 4000 caracteres".to_string());
    }

    let client = get_client().await?;
    let user = client
        .database(DEFAULT_DB)
        .collection::<ChatUserDocument>("usuarios")
        .find_one(doc! { "_id": user_oid, "activo": true })
        .await
        .map_err(|error| format!("No se pudo validar la sesión: {error}"))?
        .ok_or_else(|| "La sesión del usuario ya no es válida".to_string())?;

    let document = ChatMessageDocument {
        id: ObjectId::new(),
        user_id: user.id.to_hex(),
        user_name: user.nombre,
        contenido: contenido.to_string(),
        eid: eid.to_string(),
        request_key: request_key.to_string(),
        request_name: payload.request_name.trim().to_string(),
        created_at: Utc::now(),
        updated_at: None,
        edited: false,
    };
    let collection = chat_collection().await?;
    ensure_chat_index(&collection).await?;
    collection
        .insert_one(&document)
        .await
        .map_err(|error| format!("No se pudo enviar el mensaje: {error}"))?;
    Ok(document.into_public())
}

#[tauri::command]
pub async fn update_chat_message(
    payload: UpdateChatMessagePayload,
) -> Result<ChatMessage, String> {
    let message_id = ObjectId::parse_str(payload.message_id.trim())
        .map_err(|_| "El mensaje no es válido".to_string())?;
    let user_id = ObjectId::parse_str(payload.user_id.trim())
        .map_err(|_| "La sesión del usuario no es válida".to_string())?
        .to_hex();
    let contenido = payload.contenido.trim();
    if contenido.is_empty() {
        return Err("El mensaje no puede estar vacío".to_string());
    }
    if contenido.chars().count() > 4000 {
        return Err("El mensaje no puede superar 4000 caracteres".to_string());
    }

    let collection = chat_collection().await?;
    let filtro = doc! {
        "_id": message_id,
        "user_id": &user_id,
        "eid": payload.eid.trim(),
        "request_key": payload.request_key.trim(),
    };
    let now = Utc::now();
    let result = collection
        .update_one(
            filtro.clone(),
            doc! { "$set": {
                "contenido": contenido,
                "updated_at": mongodb::bson::DateTime::from_chrono(now),
                "edited": true,
            } },
        )
        .await
        .map_err(|error| format!("No se pudo editar el mensaje: {error}"))?;
    if result.matched_count == 0 {
        return Err("Solo el autor puede editar este mensaje".to_string());
    }

    collection
        .find_one(filtro)
        .await
        .map_err(|error| format!("No se pudo recargar el mensaje: {error}"))?
        .map(ChatMessageDocument::into_public)
        .ok_or_else(|| "No se encontró el mensaje actualizado".to_string())
}

#[tauri::command]
pub async fn delete_chat_message(payload: DeleteChatMessagePayload) -> Result<(), String> {
    let message_id = ObjectId::parse_str(payload.message_id.trim())
        .map_err(|_| "El mensaje no es válido".to_string())?;
    let user_id = ObjectId::parse_str(payload.user_id.trim())
        .map_err(|_| "La sesión del usuario no es válida".to_string())?
        .to_hex();

    let collection = chat_collection().await?;
    let result = collection
        .delete_one(doc! {
            "_id": message_id,
            "user_id": user_id,
            "eid": payload.eid.trim(),
            "request_key": payload.request_key.trim(),
        })
        .await
        .map_err(|error| format!("No se pudo eliminar el mensaje: {error}"))?;
    if result.deleted_count == 0 {
        return Err("Solo el autor puede eliminar este mensaje".to_string());
    }
    Ok(())
}
