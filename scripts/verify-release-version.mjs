import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const packageVersion = JSON.parse(read('package.json')).version;
const packageLockVersion = JSON.parse(read('package-lock.json')).version;
const tauriVersion = JSON.parse(read('src-tauri/tauri.conf.json')).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1];
const lockVersion = /\[\[package\]\]\s*name\s*=\s*"RubriPost"\s*version\s*=\s*"([^"]+)"/m
  .exec(read('src-tauri/Cargo.lock'))?.[1];
const expected = process.argv[2]?.replace(/^refs\/tags\//, '').replace(/^v/, '') || packageVersion;

const versions = {
  'package.json': packageVersion,
  'package-lock.json': packageLockVersion,
  'src-tauri/tauri.conf.json': tauriVersion,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock': lockVersion,
};

const invalid = Object.entries(versions).filter(([, version]) => version !== expected);
if (invalid.length > 0) {
  console.error(`El tag/release esperado es v${expected}, pero las versiones no coinciden:`);
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version ?? 'no encontrada'}`);
  }
  process.exit(1);
}

console.log(`Versiones de release verificadas: v${expected}`);
