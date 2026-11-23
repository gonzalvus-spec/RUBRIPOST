import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const transpile = (relativePath) => ts.transpileModule(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const queryUrl = dataUrl(transpile('../src/lib/queryParams.ts'));
const orderUrl = dataUrl(transpile('../src/lib/requestOrder.ts'));
const importerSource = transpile('../src/lib/jsonImport.ts')
  .replace("'./queryParams'", `'${queryUrl}'`)
  .replace("'./requestOrder'", `'${orderUrl}'`);
const { parseCollectionImport } = await import(dataUrl(importerSource));

const fixture = {
  schemaVersion: '1.0',
  name: 'Rubri Cut',
  description: 'Colección de ejemplo',
  baseUrl: '{{baseUrl}}/api/v1/b/{{slug}}/',
  defaultHeaders: { Accept: 'application/json', 'X-Source': 'default' },
  requests: [{
    name: 'Health', method: 'GET', path: '/health', query: { verbose: true, search: 'a b' },
  }],
  folders: [{
    name: '03 - Catalog',
    folders: [{
      name: 'Services',
      requests: [
        {
          name: 'Crear servicio', method: 'POST', path: '/services',
          headers: { 'X-Source': 'request' },
          auth: { type: 'bearer', token: 'secret-token' },
          body: { mode: 'json', json: { name: 'Demo', enabled: true } },
        },
        {
          name: 'Registrar desde archivo', method: 'POST', path: '/register',
          body: { mode: 'file', file: 'payloads/01-auth-register.json' },
        },
      ],
    }],
  }],
};

test('crea la raíz y conserva carpetas anidadas con referencias temporales', () => {
  const result = parseCollectionImport(JSON.stringify(fixture));
  assert.deepEqual(result.collections.map((item) => item.nombre), ['Rubri Cut', '03 - Catalog', 'Services']);
  assert.equal(result.collections[1].parent_client_id, result.collections[0].client_id);
  assert.equal(result.collections[2].parent_client_id, result.collections[1].client_id);
  assert.equal(result.requests[1].collection_client_id, result.collections[2].client_id);
});

test('combina baseUrl, path y query sin duplicar barras', () => {
  const result = parseCollectionImport(JSON.stringify(fixture));
  assert.equal(
    result.requests[0].url,
    '{{baseUrl}}/api/v1/b/{{slug}}/health?verbose=true&search=a%20b',
  );
});

test('hereda headers y da prioridad a los de la request', () => {
  const request = parseCollectionImport(JSON.stringify(fixture)).requests[1];
  assert.deepEqual(request.headers, { Accept: 'application/json', 'X-Source': 'request' });
});

test('mapea bearer y serializa el body JSON', () => {
  const request = parseCollectionImport(JSON.stringify(fixture)).requests[1];
  assert.deepEqual(request.auth, { kind: 'bearer', token: 'secret-token' });
  assert.equal(request.body, '{\n  "name": "Demo",\n  "enabled": true\n}');
});

test('convierte body file en un placeholder JSON válido', () => {
  const request = parseCollectionImport(JSON.stringify(fixture)).requests[2];
  assert.deepEqual(JSON.parse(request.body), { _payloadFile: 'payloads/01-auth-register.json' });
});

test('mantiene compatibilidad con el formato nativo de exportación', () => {
  const result = parseCollectionImport(JSON.stringify({
    format: 'rubripost', format_version: 1, collections: [{
      _id: 'old', nombre: 'Native', color: '#123456', orden: 4,
      requests: [{ nombre: 'Listar', contexto: 'api.test', metodo: 'GET', url: 'https://api.test/items', orden: 0 }],
      collections: [],
    }],
  }));
  assert.equal(result.collections[0].nombre, 'Native');
  assert.equal(result.requests[0].url, 'https://api.test/items');
});
