// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod auth;
mod chat;
mod config;
mod environments;
mod export;
mod fechas;
mod http;
mod mongo;
mod proyectos;

use auth::{
    cerrar_sesion, crear_usuario, hay_usuarios, listar_historial, login, registrar_historial,
    update_user_profile,
};
use chat::{
    delete_chat_message, get_chat_messages, send_chat_message, update_chat_message,
};
use environments::{
    delete_environment, duplicate_environment, get_environments, list_environments,
    save_environment,
};
use export::save_export_json;
use http::{eliminar_cookie, enviar_request, guardar_cookie, limpiar_cookies, listar_cookies};
use mongo::{
    delete_api_collection, delete_api_request, duplicate_api_collection, duplicate_api_request,
    export_api_collections, get_api_requests_full, get_api_workspace, get_api_workspace_snapshot,
    import_api_collection,
    move_api_collection, move_api_request, reorder_api_collections, reorder_api_requests,
    save_api_collection, save_api_request_full,
};
use proyectos::{eliminar_proyecto, guardar_proyecto, listar_proyectos};

/// Carga la configuración antes de abrir el pool de MongoDB.
///
/// Ver `config.rs`: en el `.exe` empaquetado el `.env` del proyecto no existe,
/// así que se busca junto al ejecutable, en la carpeta de configuración del
/// usuario y, como último recurso, en el respaldo embebido al compilar.
fn load_environment() {
    let origen = config::cargar();
    match origen {
        Some(ruta) => log::info!("Configuración activa: {ruta}"),
        None => log::warn!("Se arranca sin archivo de configuración externo"),
    }
}

/// Evita frames transparentes por el renderer DMABUF de WebKitGTK en Linux.
/// Respeta cualquier elección explícita realizada por el usuario.
#[cfg(target_os = "linux")]
fn stabilize_linux_webview() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: se ejecuta al comienzo de `run`, antes de crear Tauri/WebKit
        // o cualquier hilo de la aplicación que pueda leer el entorno.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    // No se fuerza WEBKIT_DISABLE_COMPOSITING_MODE: desactivar por completo
    // la composición degrada scroll y vídeo. El workaround de DMABUF es el
    // ajuste específico y menos invasivo para WebKitGTK/Mesa en Arch Linux.
}

#[cfg(not(target_os = "linux"))]
fn stabilize_linux_webview() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    stabilize_linux_webview();

    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    load_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_export_json,
            save_api_request_full,
            get_api_requests_full,
            get_api_workspace,
            get_api_workspace_snapshot,
            export_api_collections,
            import_api_collection,
            move_api_collection,
            save_api_collection,
            reorder_api_collections,
            reorder_api_requests,
            delete_api_collection,
            duplicate_api_collection,
            move_api_request,
            delete_api_request,
            duplicate_api_request,
            login,
            update_user_profile,
            crear_usuario,
            cerrar_sesion,
            hay_usuarios,
            registrar_historial,
            listar_historial,
            get_chat_messages,
            send_chat_message,
            update_chat_message,
            delete_chat_message,
            enviar_request,
            listar_cookies,
            guardar_cookie,
            eliminar_cookie,
            limpiar_cookies,
            listar_proyectos,
            guardar_proyecto,
            eliminar_proyecto,
            list_environments,
            get_environments,
            save_environment,
            delete_environment,
            duplicate_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
