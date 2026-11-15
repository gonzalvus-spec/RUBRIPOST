import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/requestOrder.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { requestDropOrder, sortRequestsByOrder, shouldHighlightCollectionDrop } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('mueve una petición hacia arriba, antes de otra', () => {
  assert.deepEqual(requestDropOrder(['a', 'b', 'c'], 'c', 'a', false), ['c', 'a', 'b']);
});

test('mueve una petición hacia abajo, después de otra', () => {
  assert.deepEqual(requestDropOrder(['a', 'b', 'c'], 'a', 'c', true), ['b', 'c', 'a']);
});

test('inserta entre peticiones de otra colección o subcolección', () => {
  assert.deepEqual(requestDropOrder(['a', 'b'], 'c', 'b', false), ['a', 'c', 'b']);
});

test('admite colecciones vacías y soltar sobre la carpeta', () => {
  assert.deepEqual(requestDropOrder([], 'a', null, false), ['a']);
  assert.deepEqual(requestDropOrder(['a', 'b'], 'c', null, false), ['a', 'b', 'c']);
});

test('soltar sobre sí misma no cambia el orden', () => {
  assert.deepEqual(requestDropOrder(['a', 'b'], 'a', 'a', true), ['a', 'b']);
});

test('respeta peticiones ocultas por el buscador sin mutar la lista original', () => {
  const original = ['a', 'oculta', 'b', 'c'];
  assert.deepEqual(requestDropOrder(original, 'c', 'b', false), ['a', 'oculta', 'c', 'b']);
  assert.deepEqual(original, ['a', 'oculta', 'b', 'c']);
});

test('el orden guardado se refleja inmediatamente y tras recargar', () => {
  const requests = [{ id: 'a', orden: 2 }, { id: 'b', orden: 0 }, { id: 'c', orden: 1 }];
  assert.deepEqual(sortRequestsByOrder(requests).map((r) => r.id), ['b', 'c', 'a']);
  assert.equal(requests[0].id, 'a');
});

test('admite peticiones antiguas sin orden y mantiene empates estables', () => {
  assert.deepEqual(sortRequestsByOrder([{ id: 'a' }, { id: 'b', orden: 0 }]).map((r) => r.id), ['a', 'b']);
});

test('no sombrea la colección de origen ni sus padres al arrastrar desde una subcolección', () => {
  assert.equal(shouldHighlightCollectionDrop('sub', 'sub', ['raiz', 'padre']), false);
  assert.equal(shouldHighlightCollectionDrop('sub', 'padre', ['raiz', 'padre']), false);
  assert.equal(shouldHighlightCollectionDrop('sub', 'raiz', ['raiz', 'padre']), false);
  assert.equal(shouldHighlightCollectionDrop('sub', 'otra', ['raiz', 'padre']), true);
});
