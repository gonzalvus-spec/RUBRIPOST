// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod auth;
mod config;
mod fechas;
mod http;
mod mongo;
mod proyectos;

use auth::{
    cerrar_sesion, crear_usuario, hay_usuarios, listar_historial, login, registrar_historial,
};
use http::{
    eliminar_cookie, enviar_request, guardar_cookie, limpiar_cookies, listar_cookies,
};
use mongo::{
    delete_api_collection, delete_api_request, duplicate_api_collection, duplicate_api_request,
    get_api_requests_full, get_api_workspace, move_api_request, reorder_api_collections,
    reorder_api_requests, save_api_collection, save_api_request_full,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    load_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            // El historial se conserva 30 días: al arrancar se borran las
            // entradas más antiguas para que la colección no crezca sin límite.
            tauri::async_runtime::spawn(async {
                match auth::purgar_historial_antiguo().await {
                    Ok(0) => {}
                    Ok(total) => log::info!(
                        "Historial: {total} entrada(s) con más de 30 días eliminadas"
                    ),
                    Err(error) => log::warn!("No se pudo purgar el historial: {error}"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_api_request_full,
            get_api_requests_full,
            get_api_workspace,
            save_api_collection,
            reorder_api_collections,
            reorder_api_requests,
            delete_api_collection,
            duplicate_api_collection,
            move_api_request,
            delete_api_request,
            duplicate_api_request,
            login,
            crear_usuario,
            cerrar_sesion,
            hay_usuarios,
            registrar_historial,
            listar_historial,
            enviar_request,
            listar_cookies,
            guardar_cookie,
            eliminar_cookie,
            limpiar_cookies,
            listar_proyectos,
            guardar_proyecto,
            eliminar_proyecto
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
