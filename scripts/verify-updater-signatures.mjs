import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('src-tauri/tauri.conf.json', root), 'utf8'));
const publicKeyFile = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8');
const publicKeyLine = publicKeyFile.split(/\r?\n/).find((line) => line.startsWith('RW'));

if (!publicKeyLine) throw new Error('La pubkey del updater no tiene formato Minisign válido');

const keyId = (encoded) => Buffer.from(encoded, 'base64').subarray(2, 10).toString('hex');
const expectedKeyId = keyId(publicKeyLine);
const bundleDir = fileURLToPath(new URL('src-tauri/target/release/bundle', root));

const findSignatures = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory()
    ? findSignatures(path)
    : path.endsWith('.sig') ? [path] : [];
});

const signatures = findSignatures(bundleDir);
if (signatures.length === 0) throw new Error('El build no generó archivos .sig del updater');

for (const path of signatures) {
  const stored = readFileSync(path, 'utf8').trim();
  const minisign = stored.startsWith('untrusted comment:')
    ? stored
    : Buffer.from(stored, 'base64').toString('utf8');
  const signatureLine = minisign.split(/\r?\n/).find((line) => line.startsWith('RU'));
  if (!signatureLine || keyId(signatureLine) !== expectedKeyId) {
    throw new Error(`La firma ${path} no corresponde a la pubkey configurada`);
  }
}

console.log(`${signatures.length} firma(s) del updater corresponden a la pubkey configurada.`);
