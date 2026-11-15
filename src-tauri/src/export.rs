//! Exportación con un diálogo nativo: las descargas Blob del WebView no son fiables.
use std::path::Path;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn write_json(path: &Path, contents: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|error| format!("El contenido no es JSON válido: {error}"))?;
    std::fs::write(path, contents.as_bytes())
        .map_err(|error| format!("No se pudo guardar el archivo JSON: {error}"))
}

#[tauri::command]
pub async fn save_export_json(
    app: tauri::AppHandle,
    filename: String,
    contents: String,
) -> Result<Option<String>, String> {
    // Validar antes de abrir el diálogo, sin escribir en una ruta elegida por código JS.
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|error| format!("El contenido no es JSON válido: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file()
            .set_title("Exportar JSON de RubriPost")
            .add_filter("Archivo JSON", &["json"])
            .set_file_name(&filename);
        #[cfg(desktop)]
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let Some(file) = dialog.blocking_save_file() else { return Ok(None); };
        let path = file.into_path().map_err(|error| format!("Ruta de exportación inválida: {error}"))?;
        write_json(&path, &contents)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|error| format!("No se pudo abrir el diálogo de exportación: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarda_json_utf8_y_rechaza_contenido_invalido() {
        let path = std::env::temp_dir().join("opencode").join(format!("rubripost-export-{}.json", bson::oid::ObjectId::new().to_hex()));
        let contents = "{\"nombre\":\"Facturación electrónica\",\"collections\":[]}";
        write_json(&path, contents).expect("guardar JSON");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        assert!(write_json(&path, "JSON inválido").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        std::fs::remove_file(path).expect("limpiar archivo de prueba");
    }
}
