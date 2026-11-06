//! Proyectos (multi-proyecto) del cliente.
//!
//! Un **proyecto** es un espacio de trabajo aislado dentro de la misma base de
//! datos. Su `codigo` es el `eid` que ya usan requests, colecciones y cookies,
//! así que separar proyectos no obliga a migrar nada: cada documento sigue
//! filtrándose por `eid`.
//!
//! Este módulo expone el CRUD completo (listar, crear, editar, eliminar) sobre
//! la colección `proyectos`, incluyendo el cambio de código con cascada y el
//! borrado opcional de todo el contenido del proyecto.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use mongodb::{
    bson::{doc, oid::ObjectId},
    Client, Collection,
};
use serde::{Deserialize, Serialize};

use crate::mongo::get_client;

/// Colección de requests y colecciones (ver `mongo.rs`).
const API_COLLECTION_NAME: &str = "api_requests";

/// Colección donde viven los proyectos.
const PROYECTOS_COLLECTION: &str = "proyectos";
/// Colección de cookies (definida en `http.rs`).
const COOKIES_COLLECTION: &str = "cookies";
/// Color por defecto de un proyecto nuevo (dorado Rubrifact).
pub const DEFAULT_PROYECTO_COLOR: &str = "#C5A059";

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

/// Documento tal y como se guarda en MongoDB.
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ProyectoDocumento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    id: Option<ObjectId>,
    codigo: String,
    nombre: String,
    descripcion: String,
    color: String,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    timestamp: DateTime<Utc>,
    #[serde(with = "bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    updated_at: DateTime<Utc>,
}

/// Proyecto tal y como lo consume el frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProyectoRegistro {
    #[serde(rename = "_id")]
    pub id: String,
    /// Identificador usado como `eid` en requests, colecciones y cookies.
    pub codigo: String,
    pub nombre: String,
    pub descripcion: String,
    pub color: String,
    pub timestamp: String,
    pub updated_at: String,
    /// Requests guardadas del proyecto (se calcula al listar).
    pub total_requests: i64,
    /// Colecciones del proyecto (se calcula al listar).
    pub total_colecciones: i64,
}

/// Payload de alta/edición recibido desde el frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProyectoPayload {
    /// `_id` del proyecto a editar. `None` crea uno nuevo.
    #[serde(default)]
    pub id: Option<String>,
    /// Código (`eid`). Solo se puede cambiar en proyectos existentes por
    /// actualización explícita; la cascada se encarga del contenido.
    pub codigo: String,
    pub nombre: String,
    #[serde(default)]
    pub descripcion: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

/// Payload para eliminar un proyecto.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeleteProyectoPayload {
    pub id: String,
    /// Por defecto `false`: borrar el proyecto NO borra sus requests y cookies.
    #[serde(default)]
    pub cascada: bool,
}

impl ProyectoDocumento {
    fn into_registro(self, total_requests: i64, total_colecciones: i64) -> Result<ProyectoRegistro, String> {
        let id = self
            .id
            .ok_or_else(|| "El proyecto de MongoDB no tiene _id".to_string())?;

        Ok(ProyectoRegistro {
            id: id.to_hex(),
            codigo: self.codigo,
            nombre: self.nombre,
            descripcion: self.descripcion,
            color: if self.color.is_empty() {
                DEFAULT_PROYECTO_COLOR.to_string()
            } else {
                self.color
            },
            timestamp: self.timestamp.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
            total_requests,
            total_colecciones,
        })
    }
}

// ---------------------------------------------------------------------------
// Acceso a MongoDB
// ---------------------------------------------------------------------------

fn base_de_datos(client: &Client) -> mongodb::Database {
    let nombre = std::env::var("MONGODB_DB").unwrap_or_else(|_| "rubripost_db".to_string());
    client.database(&nombre)
}

async fn handle_proyectos() -> Result<Collection<ProyectoDocumento>, String> {
    let client = get_client().await?;
    Ok(base_de_datos(client).collection(PROYECTOS_COLLECTION))
}

/// Índice único por código: dos proyectos no pueden compartir el mismo `eid`.
async fn ensure_indices(proyectos: &Collection<ProyectoDocumento>) -> Result<(), String> {
    let indice = mongodb::IndexModel::builder()
        .keys(doc! { "codigo": 1 })
        .options(
            mongodb::options::IndexOptions::builder()
                .unique(true)
                .name("codigo_unico".to_string())
                .build(),
        )
        .build();

    // Si ya existen duplicados el índice falla: se avisa y se sigue (la
    // validación de la capa de aplicación sigue impidiendo repetir códigos).
    // Versiones anteriores guardaban el identificador en un campo `id` (sin
    // `_id`), lo que rompía editar/eliminar. Se limpia ese campo sobrante.
    if let Ok(resultado) = proyectos
        .update_many(doc! { "id": { "$exists": true } }, doc! { "$unset": { "id": "" } })
        .await
    {
        if resultado.modified_count > 0 {
            log::info!(
                "Proyectos: {} documento(s) migrados a `_id`",
                resultado.modified_count
            );
        }
    }

    match proyectos.create_index(indice).await {
        Ok(_) => Ok(()),
        Err(error) => {
            log::warn!("No se pudo crear el índice único de proyectos: {error}");
            Ok(())
        }
    }
}

fn normalizar_codigo(codigo: &str) -> Result<String, String> {
    let limpio = codigo.trim().to_uppercase();

    if limpio.len() < 2 || limpio.len() > 40 {
        return Err("El código debe tener entre 2 y 40 caracteres".to_string());
    }
    if !limpio
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(
            "El código solo admite letras, números, guion, guion bajo y punto".to_string(),
        );
    }
    if !limpio.chars().next().is_some_and(|c| c.is_ascii_alphanumeric()) {
        return Err("El código debe empezar por una letra o un número".to_string());
    }

    Ok(limpio)
}

fn parse_id(valor: &str) -> Result<ObjectId, String> {
    ObjectId::parse_str(valor.trim()).map_err(|_| "Identificador de proyecto inválido".to_string())
}

/// Cuenta requests y colecciones guardadas de un código.
async fn contar_contenido(codigo: &str) -> (i64, i64) {
    let client = match get_client().await {
        Ok(client) => client,
        Err(_) => return (0, 0),
    };
    let datos = base_de_datos(client).collection::<mongodb::bson::Document>(API_COLLECTION_NAME);

    let requests = datos
        .count_documents(doc! { "eid": codigo, "tipo": "request" })
        .await
        .unwrap_or(0) as i64;
    let colecciones = datos
        .count_documents(doc! { "eid": codigo, "tipo": "collection" })
        .await
        .unwrap_or(0) as i64;

    (requests, colecciones)
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/// Lista los proyectos y **adopta** los `eid` que ya existen en los datos
/// (requests, colecciones o cookies) para que nunca queden proyectos huérfanos
/// ni haya que migrar a mano.
#[tauri::command]
pub async fn listar_proyectos() -> Result<Vec<ProyectoRegistro>, String> {
    let handle = handle_proyectos().await?;
    ensure_indices(&handle).await?;

    let client = get_client().await?;
    let datos = base_de_datos(client);

    let mut existentes: HashSet<String> = HashSet::new();
    {
        let mut cursor = handle
            .find(mongodb::bson::Document::new())
            .await
            .map_err(|error| format!("No se pudieron leer los proyectos: {error}"))?;
        while cursor
            .advance()
            .await
            .map_err(|error| format!("No se pudieron leer los proyectos: {error}"))?
        {
            let proyecto: ProyectoDocumento = cursor
                .deserialize_current()
                .map_err(|error| format!("Proyecto inválido en MongoDB: {error}"))?;
            existentes.insert(proyecto.codigo);
        }
    }

    // Códigos presentes en los datos pero sin ficha de proyecto.
    let mut codigos_datos: Vec<String> = Vec::new();
    for coleccion in [API_COLLECTION_NAME, COOKIES_COLLECTION] {
        let mut cursor = datos
            .collection::<mongodb::bson::Document>(coleccion)
            .find(doc! {})
            .projection(doc! { "eid": 1 })
            .await
            .map_err(|error| format!("No se pudieron listar los EID: {error}"))?;

        while cursor
            .advance()
            .await
            .map_err(|error| format!("No se pudieron listar los EID: {error}"))?
        {
            let documento = cursor
                .deserialize_current()
                .map_err(|error| format!("Documento inválido en MongoDB: {error}"))?;
            if let Ok(codigo) = documento.get_str("eid") {
                let codigo = codigo.trim().to_string();
                if !codigo.is_empty() {
                    codigos_datos.push(codigo);
                }
            }
        }
    }

    codigos_datos.sort();
    codigos_datos.dedup();

    // La adopción solo ocurre la primera vez (cuando todavía no hay
    // proyectos): así los datos antiguos aparecen solos y, en cambio, borrar
    // un proyecto no lo resucita adoptando su contenido huérfano.
    let codigos_datos = if existentes.is_empty() {
        codigos_datos
    } else {
        Vec::new()
    };

    for codigo in codigos_datos {
        if existentes.contains(&codigo) {
            continue;
        }
        let now = Utc::now();
        let documento = ProyectoDocumento {
            id: Some(ObjectId::new()),
            nombre: codigo.clone(),
            codigo: codigo.clone(),
            descripcion: "Proyecto adoptado desde los datos existentes".to_string(),
            color: DEFAULT_PROYECTO_COLOR.to_string(),
            timestamp: now,
            updated_at: now,
        };
        if handle.insert_one(&documento).await.is_ok() {
            log::info!("Proyecto adoptado: {codigo}");
            existentes.insert(codigo);
        }
    }

    let mut proyectos = Vec::new();
    let mut cursor = handle
        .find(mongodb::bson::Document::new())
        .await
        .map_err(|error| format!("No se pudieron leer los proyectos: {error}"))?;
    while cursor
        .advance()
        .await
        .map_err(|error| format!("No se pudieron leer los proyectos: {error}"))?
    {
        proyectos.push(
            cursor
                .deserialize_current()
                .map_err(|error| format!("Proyecto inválido en MongoDB: {error}"))?,
        );
    }

    proyectos.sort_by(|a, b| {
        a.nombre
            .to_lowercase()
            .cmp(&b.nombre.to_lowercase())
            .then_with(|| a.codigo.cmp(&b.codigo))
    });

    let mut resultado = Vec::with_capacity(proyectos.len());
    for proyecto in proyectos {
        let (requests, colecciones) = contar_contenido(&proyecto.codigo).await;
        resultado.push(proyecto.into_registro(requests, colecciones)?);
    }

    Ok(resultado)
}

/// Crea o actualiza un proyecto. Al cambiar el código se migra todo su
/// contenido (requests y cookies) al nuevo `eid`.
#[tauri::command]
pub async fn guardar_proyecto(payload: ProyectoPayload) -> Result<String, String> {
    let codigo = normalizar_codigo(&payload.codigo)?;
    let nombre = payload.nombre.trim().to_string();
    if nombre.is_empty() {
        return Err("El nombre del proyecto es obligatorio".to_string());
    }

    let handle = handle_proyectos().await?;
    ensure_indices(&handle).await?;

    let color = payload
        .color
        .map(|valor| valor.trim().to_string())
        .filter(|valor| !valor.is_empty())
        .unwrap_or_else(|| DEFAULT_PROYECTO_COLOR.to_string());
    let descripcion = payload
        .descripcion
        .map(|valor| valor.trim().to_string())
        .unwrap_or_default();
    let now = Utc::now();

    match payload.id.as_deref().map(parse_id).transpose()? {
        Some(object_id) => {
            let actual = handle
                .find_one(doc! { "_id": object_id })
                .await
                .map_err(|error| format!("No se pudo leer el proyecto: {error}"))?
                .ok_or_else(|| "El proyecto no existe o ya fue eliminado".to_string())?;

            // Otro proyecto no puede usar el mismo código.
            if let Some(otro) = handle
                .find_one(doc! { "codigo": &codigo, "_id": { "$ne": object_id } })
                .await
                .map_err(|error| format!("No se pudo validar el código: {error}"))?
            {
                return Err(format!(
                    "El código {} ya lo usa el proyecto \"{}\"",
                    codigo, otro.nombre
                ));
            }

            if actual.codigo != codigo {
                migrar_eid(&actual.codigo, &codigo).await?;
            }

            handle
                .update_one(
                    doc! { "_id": object_id },
                    doc! {
                        "$set": {
                            "codigo": &codigo,
                            "nombre": &nombre,
                            "descripcion": &descripcion,
                            "color": &color,
                            "updated_at": mongodb::bson::DateTime::from_chrono(now),
                        }
                    },
                )
                .await
                .map_err(|error| format!("No se pudo actualizar el proyecto: {error}"))?;

            log::info!("Proyecto actualizado: {} ({})", object_id.to_hex(), codigo);
            Ok(object_id.to_hex())
        }
        None => {
            if handle
                .find_one(doc! { "codigo": &codigo })
                .await
                .map_err(|error| format!("No se pudo validar el código: {error}"))?
                .is_some()
            {
                return Err(format!("Ya existe un proyecto con el código {codigo}"));
            }

            let object_id = ObjectId::new();
            let documento = ProyectoDocumento {
                id: Some(object_id),
                codigo: codigo.clone(),
                nombre: nombre.clone(),
                descripcion,
                color,
                timestamp: now,
                updated_at: now,
            };

            handle
                .insert_one(&documento)
                .await
                .map_err(|error| format!("No se pudo crear el proyecto: {error}"))?;

            log::info!("Proyecto creado: {} ({})", object_id.to_hex(), codigo);
            Ok(object_id.to_hex())
        }
    }
}

/// Elimina un proyecto. Con `cascada` borra también sus requests y cookies.
#[tauri::command]
pub async fn eliminar_proyecto(payload: DeleteProyectoPayload) -> Result<(), String> {
    let object_id = parse_id(&payload.id)?;
    let handle = handle_proyectos().await?;

    let total = handle
        .count_documents(mongodb::bson::Document::new())
        .await
        .map_err(|error| format!("No se pudieron contar los proyectos: {error}"))?;
    if total <= 1 {
        return Err("Debe existir al menos un proyecto".to_string());
    }

    let proyecto = handle
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|error| format!("No se pudo leer el proyecto: {error}"))?
        .ok_or_else(|| "El proyecto no existe o ya fue eliminado".to_string())?;

    handle
        .delete_one(doc! { "_id": object_id })
        .await
        .map_err(|error| format!("No se pudo eliminar el proyecto: {error}"))?;

    if payload.cascada {
        let client = get_client().await?;
        let datos = base_de_datos(client);

        let requests = datos
            .collection::<mongodb::bson::Document>(API_COLLECTION_NAME)
            .delete_many(doc! { "eid": &proyecto.codigo })
            .await
            .map_err(|error| format!("No se pudo borrar el contenido del proyecto: {error}"))?
            .deleted_count;

        let cookies = datos
            .collection::<mongodb::bson::Document>(COOKIES_COLLECTION)
            .delete_many(doc! { "eid": &proyecto.codigo })
            .await
            .map_err(|error| format!("No se pudieron borrar las cookies: {error}"))?
            .deleted_count;

        log::info!(
            "Proyecto {} eliminado con su contenido ({requests} documentos, {cookies} cookies)",
            proyecto.codigo
        );
    } else {
        log::info!("Proyecto {} eliminado (contenido conservado)", proyecto.codigo);
    }

    Ok(())
}

/// Renombra el `eid` de todo el contenido del proyecto.
async fn migrar_eid(origen: &str, destino: &str) -> Result<(), String> {
    if origen == destino {
        return Ok(());
    }

    let client = get_client().await?;
    let datos = base_de_datos(client);

    let requests = datos
        .collection::<mongodb::bson::Document>(API_COLLECTION_NAME)
        .update_many(doc! { "eid": origen }, doc! { "$set": { "eid": destino } })
        .await
        .map_err(|error| format!("No se pudo migrar el contenido: {error}"))?;

    let cookies = datos
        .collection::<mongodb::bson::Document>(COOKIES_COLLECTION)
        .update_many(doc! { "eid": origen }, doc! { "$set": { "eid": destino } })
        .await
        .map_err(|error| format!("No se pudieron migrar las cookies: {error}"))?;

    log::info!(
        "EID migrado {} → {} ({} documentos, {} cookies)",
        origen,
        destino,
        requests.modified_count,
        cookies.modified_count
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normaliza_y_valida_el_codigo() {
        assert_eq!(normalizar_codigo("  emp-0042  ").unwrap(), "EMP-0042");
        assert!(normalizar_codigo("A").is_err());
        assert!(normalizar_codigo("proyecto con espacios").is_err());
        assert!(normalizar_codigo("-EMP").is_err());
    }

    #[test]
    fn rechaza_identificadores_invalidos() {
        assert!(parse_id("no-es-un-objectid").is_err());
        assert!(parse_id("6ae7b3dcf0338c09dabaddc7").is_ok());
    }
}

/// Prueba de integración real contra la MongoDB configurada.
///
/// Usa EID de prueba (`TST-PROY-*`) y limpia lo que crea, así que puede
/// convivir con los datos reales.
/// Ejecutar con: cargo test --lib -- --ignored --nocapture proyectos
#[tokio::test]
#[ignore = "requiere una instancia de MongoDB accesible"]
async fn flujo_crud_proyectos() {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::from_filename(".env");

    let eids = ["TST-PROY-1", "TST-PROY-2", "TST-PROY-3", "TST-PROY-4"];
    let client = get_client().await.expect("conexión");
    let datos = base_de_datos(client);
    let requests = datos.collection::<mongodb::bson::Document>(API_COLLECTION_NAME);
    let cookies = datos.collection::<mongodb::bson::Document>(COOKIES_COLLECTION);
    let fichas = datos.collection::<mongodb::bson::Document>(PROYECTOS_COLLECTION);

    // Limpieza de ejecuciones anteriores.
    for eid in eids {
        requests.delete_many(doc! { "eid": eid }).await.expect("limpiar requests");
        cookies.delete_many(doc! { "eid": eid }).await.expect("limpiar cookies");
        fichas.delete_many(doc! { "codigo": eid }).await.expect("limpiar fichas");
    }

    let proyectos_antes = listar_proyectos().await.expect("listar inicial").len();

    let payload_de = |id: Option<String>, codigo: &str, nombre: &str| ProyectoPayload {
        id,
        codigo: codigo.to_string(),
        nombre: nombre.to_string(),
        descripcion: Some("prueba".to_string()),
        color: None,
    };

    // Crear + listar.
    let id = guardar_proyecto(payload_de(None, "TST-PROY-1", "Proyecto uno"))
        .await
        .expect("crear");
    let lista = listar_proyectos().await.expect("listar");
    assert!(
        lista.iter().any(|p| p.codigo == "TST-PROY-1" && p.id == id),
        "el proyecto creado debe aparecer con su _id: {lista:?}"
    );

    // Editar sin cambiar el código.
    guardar_proyecto(payload_de(Some(id.clone()), "TST-PROY-1", "Proyecto uno editado"))
        .await
        .expect("editar");
    let lista = listar_proyectos().await.expect("listar 2");
    assert!(
        lista.iter().any(|p| p.nombre == "Proyecto uno editado"),
        "{lista:?}"
    );

    // Cambiar el código migra el contenido.
    requests
        .insert_one(doc! { "eid": "TST-PROY-1", "tipo": "request", "nombre": "demo" })
        .await
        .expect("insertar request");
    guardar_proyecto(payload_de(Some(id.clone()), "TST-PROY-2", "Proyecto uno editado"))
        .await
        .expect("editar código");
    let migradas = requests
        .count_documents(doc! { "eid": "TST-PROY-2" })
        .await
        .expect("contar migradas");
    assert_eq!(migradas, 1, "el contenido debe migrar al nuevo código");

    // Segundo proyecto: el borrado exige que quede al menos uno.
    let id_tres = guardar_proyecto(payload_de(None, "TST-PROY-3", "Proyecto dos"))
        .await
        .expect("crear segundo");

    // Borrado conservando el contenido.
    eliminar_proyecto(DeleteProyectoPayload {
        id: id.clone(),
        cascada: false,
    })
    .await
    .expect("eliminar");
    assert!(
        !listar_proyectos()
            .await
            .expect("listar 3")
            .iter()
            .any(|p| p.codigo == "TST-PROY-2"),
        "el proyecto borrado no debe reaparecer"
    );
    let conservadas = requests
        .count_documents(doc! { "eid": "TST-PROY-2" })
        .await
        .expect("contar conservadas");
    assert_eq!(conservadas, 1, "el contenido debe conservarse");

    // Borrado en cascada: se lleva requests y cookies del proyecto.
    let id_cascada = guardar_proyecto(payload_de(None, "TST-PROY-4", "Proyecto cascada"))
        .await
        .expect("crear cascada");
    requests
        .insert_one(doc! { "eid": "TST-PROY-4", "tipo": "request", "nombre": "demo" })
        .await
        .expect("insertar request cascada");
    cookies
        .insert_one(doc! { "eid": "TST-PROY-4", "nombre": "sesion", "valor": "x" })
        .await
        .expect("insertar cookie");

    eliminar_proyecto(DeleteProyectoPayload {
        id: id_cascada,
        cascada: true,
    })
    .await
    .expect("eliminar en cascada");

    assert_eq!(
        requests
            .count_documents(doc! { "eid": "TST-PROY-4" })
            .await
            .expect("contar requests cascada"),
        0,
        "la cascada debe borrar las requests"
    );
    assert_eq!(
        cookies
            .count_documents(doc! { "eid": "TST-PROY-4" })
            .await
            .expect("contar cookies cascada"),
        0,
        "la cascada debe borrar las cookies"
    );

    // El último proyecto no se puede borrar (solo si de verdad queda uno).
    let total = listar_proyectos().await.expect("listar 4").len();
    if total == 1 {
        let ultimo = listar_proyectos().await.expect("listar último");
        let error = eliminar_proyecto(DeleteProyectoPayload {
            id: ultimo[0].id.clone(),
            cascada: false,
        })
        .await;
        assert!(error.is_err(), "el último proyecto no debe poder borrarse");
    } else {
        eliminar_proyecto(DeleteProyectoPayload {
            id: id_tres,
            cascada: false,
        })
        .await
        .expect("eliminar segundo");
    }

    // Limpieza de lo que dejó la prueba.
    for eid in eids {
        requests.delete_many(doc! { "eid": eid }).await.expect("limpiar requests");
        cookies.delete_many(doc! { "eid": eid }).await.expect("limpiar cookies");
        fichas.delete_many(doc! { "codigo": eid }).await.expect("limpiar fichas");
    }

    assert_eq!(
        listar_proyectos().await.expect("listar final").len(),
        proyectos_antes,
        "la prueba no debe dejar proyectos"
    );

    println!("CRUD de proyectos OK");
}
