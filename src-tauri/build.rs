use std::env;
use std::fs;
use std::path::PathBuf;

/// Genera además un respaldo embebido del `.env` para que el ejecutable
/// empaquetado encuentre la configuración aunque no haya ningún archivo junto
/// a él (ver `src/config.rs`).
fn generar_env_embebido() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let candidatos = [manifest_dir.join("../.env"), manifest_dir.join(".env")];

    let mut contenido = String::new();
    for ruta in candidatos.iter() {
        println!("cargo:rerun-if-changed={}", ruta.display());
        if let Ok(leido) = fs::read_to_string(ruta) {
            contenido = leido;
            break;
        }
    }

    let destino = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("env_embebido.rs");
    let codigo = format!(
        "// Generado por build.rs: contenido del .env al compilar.\npub const ENV_EMBEBIDO: &str = {contenido:?};\n"
    );

    fs::write(&destino, codigo).expect("no se pudo escribir el respaldo del .env");
}

fn main() {
    generar_env_embebido();
    tauri_build::build()
}
