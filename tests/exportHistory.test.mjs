import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const load = async (name) => {
  let source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  // Sustituir solo el límite nativo para probar Guardar como sin abrir ventanas.
  if (name === 'jsonExport') source = source.replace("import('@tauri-apps/api/core')", 'Promise.resolve({ invoke: globalThis.__nativeJsonTestInvoke })');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { buildCollectionExport, downloadJson } = await load('jsonExport');
const { filterHistory, historyTone, historyTime } = await load('history');
const { collectionSubtreeIds, canMoveCollection, collectionDropPosition, planCollectionDrop, collectionHasChildren, isCollectionEmpty, applyCollectionLayout, collectionOrderChanged } = await load('collectionHierarchy');
const { overviewCollectionRows, workspaceOverviewStats } = await load('workspaceOverview');
const { readSendCookies, writeSendCookies } = await load('cookiePreferences');
const { autoScrollIntent } = await load('autoScroll');
const { chatCollapsedKey, readChatCollapsed, writeChatCollapsed } = await load('chatPreferences');
const { collectionPreferenceKey, readClosedCollections, writeClosedCollections } = await load('collectionPreferences');
const { readCollectionCache, writeCollectionCache } = await load('collectionCache');
const {
  CHAT_NOTES_LIMIT,
  appendChatMessage,
  chatNotesKey,
  createChatMessage,
  deleteChatMessage,
  deleteChatNote,
  isChatAuthor,
  moveChatNotes,
  readChatNotes,
  updateChatMessage,
  updateChatNote,
  writeChatNotes,
} = await load('chatNotes');

const withStorage = (run) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } });
  try { run(storage); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
};
const collection = (_id, parent_id = null, orden = 0) => ({ _id, parent_id, orden, nombre: _id });
const request = (_id, coleccion_id, orden = 0) => ({ _id, coleccion_id, orden, auth: { kind: 'bearer', token: 'secret' }, headers: { Authorization: 'secret', Cookie: 'session', 'X-Api-Key': 'key', 'Content-Type': 'application/json' }, body: '{"value":1}' });

test('exporta jerarquía, peticiones y orden sin incluir colecciones ajenas', () => {
  const result = buildCollectionExport({ collections: [collection('padre'), collection('sub', 'padre')], requests: [request('b', 'sub', 1), request('a', 'sub', 0), request('ajena', 'otra')] }, 'TEST');
  assert.equal(result.collections.length, 1);
  assert.equal(result.collections[0].collections[0]._id, 'sub');
  assert.deepEqual(result.collections[0].collections[0].requests.map((r) => r._id), ['a', 'b']);
  assert.equal(result.project, 'TEST');
});

test('una subcolección seleccionada sin su padre se exporta como raíz', () => {
  const result = buildCollectionExport({ collections: [collection('sub', 'no-seleccionado')], requests: [] }, 'TEST');
  assert.equal(result.collections[0].parent_id, null);
});

test('conserva carpetas vacías y no modifica los datos originales', () => {
  const original = { collections: [collection('sub', 'no-seleccionado')], requests: [] };
  const before = JSON.stringify(original);
  const result = buildCollectionExport(original, 'TEST');
  assert.deepEqual(result.collections[0].requests, []);
  assert.equal(JSON.stringify(original), before);
});

test('omite autenticación y headers sensibles por defecto', () => {
  const original = request('a', 'padre');
  const result = buildCollectionExport({ collections: [collection('padre')], requests: [original] }, 'TEST');
  const exported = result.collections[0].requests[0];
  assert.equal(exported.auth, null);
  assert.deepEqual(exported.headers, { 'Content-Type': 'application/json' });
  assert.equal(original.auth.token, 'secret');
  assert.equal(exported.body, original.body);
});

test('solo incluye credenciales al elegirlo explícitamente', () => {
  const original = request('a', 'padre');
  const result = buildCollectionExport({ collections: [collection('padre')], requests: [original] }, 'TEST', true);
  assert.equal(result.credentials_included, true);
  assert.deepEqual(result.collections[0].requests[0].auth, original.auth);
});

test('un ciclo inválido en las carpetas no impide serializar el JSON', () => {
  const result = buildCollectionExport({ collections: [collection('a', 'b'), collection('b', 'a')], requests: [] }, 'TEST');
  assert.doesNotThrow(() => JSON.stringify(result));
});

const entries = [
  { usuario: 'ana', entidad: 'request', accion: 'Creó request', nombre: 'Factura', detalle: 'POST /factura', fecha: '2026-11-15T10:00:00Z' },
  { usuario: 'juan', entidad: 'collection', accion: 'Renombró colección', nombre: 'Ventas', fecha: '2026-11-14T10:00:00Z' },
  { usuario: 'ana', entidad: 'request', accion: 'Eliminó request', nombre: 'Antigua', fecha: '2026-10-01T10:00:00Z' },
];
const filters = { search: '', user: '', entity: '', days: 0 };

test('combina búsqueda, usuario, entidad y período', () => {
  const result = filterHistory(entries, { search: 'FACTURA', user: 'ana', entity: 'request', days: 7 }, Date.parse('2026-11-16T10:00:00Z'));
  assert.equal(result.length, 1);
  assert.equal(result[0].nombre, 'Factura');
});

test('el historial ordena de más reciente a más antiguo sin mutar entradas', () => {
  const reversed = [...entries].reverse();
  assert.deepEqual(filterHistory(reversed, filters).map((entry) => entry.nombre), ['Factura', 'Ventas', 'Antigua']);
  assert.equal(reversed[0].nombre, 'Antigua');
});

test('la búsqueda encuentra detalles y muestra resultados vacíos correctamente', () => {
  assert.equal(filterHistory(entries, { ...filters, search: 'POST /factura' }).length, 1);
  assert.equal(filterHistory(entries, { ...filters, user: 'inexistente' }).length, 0);
});

test('distingue visualmente creación, modificación y eliminación', () => {
  assert.equal(historyTone('Creó request'), 'created');
  assert.equal(historyTone('Duplicó colección'), 'created');
  assert.equal(historyTone('Eliminó request'), 'deleted');
  assert.equal(historyTone('Renombró colección'), 'updated');
});

test('permite convertir colecciones en subcolecciones y devolverlas al nivel principal', () => {
  const collections = [
    { ...collection('a'), eid: 'A' }, { ...collection('b'), eid: 'A' },
    { ...collection('hija', 'a'), eid: 'A' },
  ];
  assert.equal(canMoveCollection(collections, 'a', 'b'), true);
  const moved = collections.map((item) => item._id === 'a' ? { ...item, parent_id: 'b' } : item);
  assert.deepEqual([...collectionSubtreeIds(moved, 'b')].sort(), ['a', 'b', 'hija']);
  assert.equal(canMoveCollection(moved, 'a', null), true);
  assert.equal(moved.find((item) => item._id === 'hija').parent_id, 'a');
});

test('impide ciclos y movimientos a otro proyecto o a carpetas inexistentes', () => {
  const collections = [
    { ...collection('a'), eid: 'A' }, { ...collection('b', 'a'), eid: 'A' },
    { ...collection('c', 'b'), eid: 'A' }, { ...collection('externa'), eid: 'B' },
  ];
  assert.equal(canMoveCollection(collections, 'a', 'a'), false);
  assert.equal(canMoveCollection(collections, 'a', 'c'), false);
  assert.equal(canMoveCollection(collections, 'a', 'externa'), false);
  assert.equal(canMoveCollection(collections, 'a', 'inexistente'), false);
});

test('Enviar cookies se recuerda por proyecto sin heredar el ajuste global antiguo', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([['rubri.cookies.enviar', 'false']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } });
  try {
    assert.equal(readSendCookies('A'), true);
    writeSendCookies('A', false);
    assert.equal(readSendCookies('A'), false);
    assert.equal(readSendCookies('B'), true);
    writeSendCookies('B', false);
    writeSendCookies('A', true);
    assert.equal(readSendCookies('A'), true);
    assert.equal(readSendCookies('B'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('arrastrar al centro anida la carpeta con sus descendientes y la coloca al final', () => {
  const items = [
    { ...collection('a', null, 0), eid: 'P' }, { ...collection('hija', 'a', 1), eid: 'P' },
    { ...collection('b', null, 2), eid: 'P' }, { ...collection('otra', 'b', 3), eid: 'P' },
  ];
  const plan = planCollectionDrop(items, 'a', 'b', 'inside');
  assert.equal(plan.parentId, 'b');
  assert.deepEqual(plan.orderedIds, ['hija', 'b', 'otra', 'a']);
  assert.equal(items[1].parent_id, 'a');
  assert.equal(items[0].parent_id, null);
});

test('arrastrar al borde de una raíz o a nivel principal independiza una subcolección', () => {
  const items = [
    { ...collection('a', null, 0), eid: 'P' }, { ...collection('sub', 'a', 1), eid: 'P' },
    { ...collection('b', null, 2), eid: 'P' },
  ];
  assert.deepEqual(planCollectionDrop(items, 'sub', 'b', 'before'), { parentId: null, orderedIds: ['a', 'sub', 'b'] });
  assert.deepEqual(planCollectionDrop(items, 'sub', null, 'inside'), { parentId: null, orderedIds: ['a', 'b', 'sub'] });
});

test('los bordes reordenan carpetas hermanas sin anidarlas', () => {
  const items = [
    { ...collection('a', null, 0), eid: 'P' }, { ...collection('x', 'a', 1), eid: 'P' },
    { ...collection('y', 'a', 2), eid: 'P' },
  ];
  assert.deepEqual(planCollectionDrop(items, 'y', 'x', 'before'), { parentId: 'a', orderedIds: ['a', 'y', 'x'] });
  assert.deepEqual(planCollectionDrop(items, 'x', 'y', 'after'), { parentId: 'a', orderedIds: ['a', 'y', 'x'] });
});

test('el arrastre rechaza ciclos, origen igual a destino y otros proyectos', () => {
  const items = [{ ...collection('a'), eid: 'P' }, { ...collection('sub', 'a'), eid: 'P' }, { ...collection('externa'), eid: 'Q' }];
  assert.equal(planCollectionDrop(items, 'a', 'sub', 'inside'), null);
  assert.equal(planCollectionDrop(items, 'a', 'sub', 'before'), null);
  assert.equal(planCollectionDrop(items, 'a', 'a', 'inside'), null);
  assert.equal(planCollectionDrop(items, 'a', 'externa', 'before'), null);
  assert.equal(collectionDropPosition(101, 100, 32), 'before');
  assert.equal(collectionDropPosition(116, 100, 32), 'inside');
  assert.equal(collectionDropPosition(131, 100, 32), 'after');
});

test('el historial muestra medianoche, mediodía y tarde en formato de 12 horas', () => {
  assert.equal(historyTime(new Date(2026, 10, 15, 0, 5).toISOString()), '12:05 a. m.');
  assert.equal(historyTime(new Date(2026, 10, 15, 12, 30).toISOString()), '12:30 p. m.');
  assert.equal(historyTime(new Date(2026, 10, 15, 23, 59).toISOString()), '11:59 p. m.');
  assert.equal(historyTime('fecha inválida'), '—');
});

test('la exportación nativa espera el guardado y distingue cancelar de un error', async () => {
  const originalWindow = globalThis.window;
  const originalInvoke = globalThis.__nativeJsonTestInvoke;
  globalThis.window = { __TAURI_INTERNALS__: {} };
  try {
    let received;
    globalThis.__nativeJsonTestInvoke = async (command, args) => { received = { command, args }; return 'C:/export.json'; };
    assert.equal(await downloadJson({ nombre: 'Facturación' }, 'prueba.json'), true);
    assert.equal(received.command, 'save_export_json');
    assert.deepEqual(JSON.parse(received.args.contents), { nombre: 'Facturación' });
    globalThis.__nativeJsonTestInvoke = async () => null;
    assert.equal(await downloadJson({}, 'prueba.json'), false);
    globalThis.__nativeJsonTestInvoke = async () => { throw new Error('Sin permiso de escritura'); };
    await assert.rejects(downloadJson({}, 'prueba.json'), /Sin permiso/);
    await assert.rejects(downloadJson(undefined, 'prueba.json'), /No hay datos/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalInvoke === undefined) delete globalThis.__nativeJsonTestInvoke;
    else globalThis.__nativeJsonTestInvoke = originalInvoke;
  }
});

test('las carpetas cerradas se recuerdan por usuario y por proyecto', () => withStorage(() => {
  writeClosedCollections('Ana', 'P1', ['padre', 'sub']);
  assert.deepEqual(readClosedCollections('ana', 'P1'), ['padre', 'sub']);
  assert.deepEqual(readClosedCollections('juan', 'P1'), []);
  assert.deepEqual(readClosedCollections('ana', 'P2'), []);
  writeClosedCollections('juan', 'P1', ['otra']);
  assert.deepEqual(readClosedCollections('ana', 'P1'), ['padre', 'sub']);
  assert.deepEqual(readClosedCollections('juan', 'P1'), ['otra']);
}));

test('abrir manualmente una carpeta también persiste y no confunde claves', () => withStorage(() => {
  writeClosedCollections('ana', 'P1', ['padre']);
  writeClosedCollections('ana', 'P1', []);
  assert.deepEqual(readClosedCollections('ana', 'P1'), []);
  assert.notEqual(collectionPreferenceKey('a/b', 'c'), collectionPreferenceKey('a', 'b/c'));
}));

test('las preferencias dañadas se ignoran sin bloquear el arranque', () => withStorage((storage) => {
  storage.set(collectionPreferenceKey('ana', 'P1'), 'inválido');
  assert.deepEqual(readClosedCollections('ana', 'P1'), []);
  storage.set(collectionPreferenceKey('ana', 'P1'), JSON.stringify(['a', 'a', null, 1]));
  assert.deepEqual(readClosedCollections('ana', 'P1'), ['a']);
}));

test('la caché devuelve las colecciones de inmediato sin guardar requests ni secretos', () => withStorage((storage) => {
  const item = { ...collection('padre'), eid: 'P1', color: '#046A38', timestamp: '', updated_at: '',
    auth: { token: 'SECRETO' }, requests: [request('r', 'padre')], body: 'BODY PRIVADO' };
  writeCollectionCache('ana', 'P1', [item]);
  const cached = readCollectionCache('ana', 'P1');
  assert.equal(cached[0]._id, 'padre');
  assert.equal(cached[0].auth, undefined);
  assert.equal(cached[0].requests, undefined);
  assert.ok(![...storage.values()][0].includes('SECRETO'));
  assert.ok(![...storage.values()][0].includes('BODY PRIVADO'));
}));

test('la caché de colecciones está aislada por usuario y proyecto', () => withStorage(() => {
  const item = { ...collection('padre'), eid: 'P1', color: '#046A38', timestamp: '', updated_at: '' };
  writeCollectionCache('ana', 'P1', [item]);
  assert.deepEqual(readCollectionCache('juan', 'P1'), []);
  assert.deepEqual(readCollectionCache('ana', 'P2'), []);
  writeCollectionCache('ana', 'P2', [item]);
  assert.deepEqual(readCollectionCache('ana', 'P2'), []);
  writeCollectionCache('ana', 'P1', []);
  assert.deepEqual(readCollectionCache('ana', 'P1'), []);
}));

test('la caché dañada o de otra versión no impide cargar desde MongoDB', () => withStorage((storage) => {
  const item = { ...collection('padre'), eid: 'P1', color: '#046A38', timestamp: '', updated_at: '' };
  writeCollectionCache('ana', 'P1', [item]);
  const key = [...storage.keys()][0];
  storage.set(key, JSON.stringify({ version: 2, collections: [item] }));
  assert.deepEqual(readCollectionCache('ana', 'P1'), []);
  storage.set(key, JSON.stringify({ version: 1, collections: [{ ...item, eid: 'OTRO' }] }));
  assert.deepEqual(readCollectionCache('ana', 'P1'), []);
  storage.set(key, 'JSON inválido');
  assert.deepEqual(readCollectionCache('ana', 'P1'), []);
}));

test('una colección con subcolecciones no se considera vacía', () => {
  const collections = [collection('padre'), collection('sub', 'padre')];
  const requests = [request('r', 'sub')];
  assert.equal(collectionHasChildren(collections, 'padre'), true);
  assert.equal(collectionHasChildren(collections, 'sub'), false);
  assert.equal(isCollectionEmpty(collections, requests, 'padre'), false);
  assert.equal(isCollectionEmpty(collections, requests, 'sub'), false);
  assert.equal(isCollectionEmpty(collections, [], 'sub'), true);
  assert.equal(isCollectionEmpty(collections, [], 'padre'), false);
});

test('el overview respeta la jerarquía y suma las peticiones del subárbol', () => {
  const collections = [collection('padre', null, 1), collection('sub', 'padre', 0), collection('otra', null, 0)];
  const requests = [request('a', 'sub', 0), request('b', 'sub', 1), request('c', 'padre', 0), request('suelta', null, 0)];
  const rows = overviewCollectionRows(collections, requests);
  assert.deepEqual(
    rows.map((row) => [row.collection._id, row.depth, row.directRequests, row.totalRequests, row.childCount]),
    [['otra', 0, 0, 0, 0], ['padre', 0, 1, 3, 1], ['sub', 1, 2, 2, 0]],
  );
  assert.deepEqual(workspaceOverviewStats(collections, requests), {
    collections: 3,
    rootCollections: 2,
    subcollections: 1,
    requests: 4,
    environments: 0,
  });
});

test('el overview muestra huérfanas y ciclos una sola vez', () => {
  const collections = [collection('a', 'b'), collection('b', 'a'), collection('huerfana', 'no-existe')];
  const rows = overviewCollectionRows(collections, []);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row.collection._id)).size, 3);
  assert.deepEqual(rows.map((row) => row.collection._id), ['huerfana', 'a', 'b']);
  assert.equal(rows[0].depth, 0);
  assert.equal(rows[1].depth, 0);
  assert.equal(rows[2].depth, 1);
});

test('el chat ignora notas vacías y recorta espacios', () => {
  assert.equal(createChatMessage('ana', '   '), null);
  const message = createChatMessage(
    ' ana ',
    '  revisar token  ',
    new Date('2026-01-02T03:04:05Z'),
    'm1',
    ' ANA ',
  );
  assert.deepEqual(message, {
    id: 'm1',
    author: 'ana',
    userId: 'ana',
    text: 'revisar token',
    createdAt: '2026-01-02T03:04:05.000Z',
  });
});

test('las notas se guardan por usuario, proyecto y request', () => {
  withStorage(() => {
    const message = createChatMessage('ana', 'hola', new Date('2026-01-01T00:00:00Z'), 'm1');
    writeChatNotes('ana', 'PRJ', 'r1', [message]);
    assert.equal(readChatNotes('ana', 'PRJ', 'r1').length, 1);
    assert.equal(readChatNotes('ana', 'PRJ', 'r2').length, 0);
    assert.equal(readChatNotes('luis', 'PRJ', 'r1').length, 0);
    assert.equal(readChatNotes('ana', 'OTRO', 'r1').length, 0);
    assert.match(chatNotesKey('ana', 'PRJ', 'r1'), /^rubri\.chat\./);
  });
});

test('las notas inválidas o corruptas no rompen la lectura', () => {
  withStorage((storage) => {
    storage.set(chatNotesKey('ana', 'PRJ', 'r1'), '{no-json');
    assert.deepEqual(readChatNotes('ana', 'PRJ', 'r1'), []);

    storage.set(chatNotesKey('ana', 'PRJ', 'r1'), JSON.stringify([
      { id: 'x', text: '  ' },
      { id: 'ok', text: 'vale' },
      null,
    ]));
    assert.deepEqual(readChatNotes('ana', 'PRJ', 'r1').map((message) => message.text), ['vale']);
  });
});

test('el chat conserva como máximo el límite de notas', () => {
  let messages = [];
  for (let index = 0; index < CHAT_NOTES_LIMIT + 5; index += 1) {
    messages = appendChatMessage(
      messages,
      createChatMessage('ana', `nota ${index}`, new Date(), `m-${index}`),
    );
  }
  assert.equal(messages.length, CHAT_NOTES_LIMIT);
  assert.equal(messages[messages.length - 1].text, `nota ${CHAT_NOTES_LIMIT + 4}`);
});

test('al guardar el borrador sus notas pasan a la request definitiva', () => {
  withStorage(() => {
    writeChatNotes('ana', 'PRJ', '__draft__', [
      createChatMessage('ana', 'borrador', new Date(), 'm1'),
    ]);
    moveChatNotes('ana', 'PRJ', '__draft__', 'req-1');
    assert.deepEqual(readChatNotes('ana', 'PRJ', '__draft__'), []);
    assert.deepEqual(
      readChatNotes('ana', 'PRJ', 'req-1').map((message) => message.text),
      ['borrador'],
    );
  });
});

test('solo el autor puede editar o eliminar su propio comentario', () => {
  const own = createChatMessage('Ana', 'hola', new Date('2026-01-01T00:00:00Z'), 'm1', 'ANA');
  const foreign = createChatMessage('Luis', 'hola', new Date('2026-01-01T00:10:00Z'), 'm2', 'luis');
  const legacy = { id: 'old', author: 'Ana', text: 'nota antigua', createdAt: '2026-01-01T00:20:00Z' };
  const messages = [own, foreign, legacy];

  assert.equal(isChatAuthor(own, 'ana'), true);
  assert.equal(isChatAuthor(own, 'luis'), false);
  assert.equal(isChatAuthor(legacy, 'ana'), false);

  assert.equal(updateChatMessage(messages, 'm1', 'intruso', 'luis'), null);
  assert.equal(deleteChatMessage(messages, 'm1', 'luis'), null);
  assert.equal(updateChatMessage(messages, 'old', 'intruso', 'ana'), null);
  assert.equal(deleteChatMessage(messages, 'old', 'ana'), null);

  const edited = updateChatMessage(
    messages,
    'm1',
    '  texto corregido  ',
    'ana',
    new Date('2026-02-01T10:00:00Z'),
  );
  assert.equal(edited.find((message) => message.id === 'm1').text, 'texto corregido');
  assert.equal(edited.find((message) => message.id === 'm1').editedAt, '2026-02-01T10:00:00.000Z');
  assert.equal(edited.find((message) => message.id === 'm1').createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(updateChatMessage(messages, 'm1', '   ', 'ana'), null);

  assert.deepEqual(
    deleteChatMessage(messages, 'm1', 'ana').map((message) => message.id),
    ['m2', 'old'],
  );
});

test('editar y borrar en almacenamiento valida la autoría del usuario actual', () => {
  withStorage(() => {
    writeChatNotes('ana', 'PRJ', 'r1', [
      createChatMessage('Ana', 'hola', new Date('2026-01-01T00:00:00Z'), 'm1', 'ana'),
    ]);

    assert.equal(updateChatNote('luis', 'PRJ', 'r1', 'm1', 'intruso'), null);
    assert.equal(deleteChatNote('luis', 'PRJ', 'r1', 'm1'), null);
    assert.equal(readChatNotes('ana', 'PRJ', 'r1')[0].text, 'hola');

    const edited = updateChatNote(
      'ana',
      'PRJ',
      'r1',
      'm1',
      'nota editada',
      new Date('2026-02-01T10:00:00Z'),
    );
    assert.equal(edited[0].text, 'nota editada');
    assert.equal(readChatNotes('ana', 'PRJ', 'r1')[0].text, 'nota editada');
    assert.ok(readChatNotes('ana', 'PRJ', 'r1')[0].editedAt);

    assert.deepEqual(deleteChatNote('ana', 'PRJ', 'r1', 'm1'), []);
    assert.deepEqual(readChatNotes('ana', 'PRJ', 'r1'), []);
  });
});

test('el estado contraído del chat se recuerda por usuario', () => {
  withStorage(() => {
    assert.equal(readChatCollapsed('ana'), false);
    writeChatCollapsed('ana', true);
    assert.equal(readChatCollapsed('ana'), true);
    assert.equal(readChatCollapsed('luis'), false);
    assert.match(chatCollapsedKey(' ANA '), /ana$/);

    writeChatCollapsed('ana', false);
    assert.equal(readChatCollapsed('ana'), false);
  });
});

test('promover una subcolección actualiza jerarquía y orden en una sola pasada', () => {
  const collections = [
    { _id: 'a', eid: 'PRJ', nombre: 'A', orden: 0, parent_id: null },
    { _id: 'b', eid: 'PRJ', nombre: 'B', orden: 1, parent_id: null },
    { _id: 'c', eid: 'PRJ', nombre: 'C', orden: 2, parent_id: 'b' },
  ];
  const orderedIds = ['a', 'c', 'b'];

  assert.equal(collectionOrderChanged(collections, ['a', 'b', 'c']), false);
  assert.equal(collectionOrderChanged(collections, orderedIds), true);

  const next = applyCollectionLayout(collections, 'c', null, orderedIds);
  assert.deepEqual(next.map((collection) => collection._id), orderedIds);
  assert.deepEqual(next.map((collection) => collection.orden), [0, 1, 2]);
  assert.equal(next.find((collection) => collection._id === 'c').parent_id, null);
  // No muta el estado anterior: React puede comparar y revertir sin sorpresas.
  assert.equal(collections.find((collection) => collection._id === 'c').parent_id, 'b');

  const onlyParent = applyCollectionLayout(collections, 'c', null, ['desconocida']);
  assert.equal(onlyParent.find((collection) => collection._id === 'c').parent_id, null);
  assert.deepEqual(onlyParent.map((collection) => collection._id), ['a', 'b', 'c']);
});

test('promover una subcolección la deja en su posición definitiva sin saltos', () => {
  const collections = [
    { _id: 'a', eid: 'PRJ', nombre: 'A', orden: 0, parent_id: null },
    { _id: 'b', eid: 'PRJ', nombre: 'B', orden: 1, parent_id: null },
    { _id: 'c', eid: 'PRJ', nombre: 'C', orden: 2, parent_id: 'b' },
    { _id: 'd', eid: 'PRJ', nombre: 'D', orden: 3, parent_id: 'c' },
    { _id: 'e', eid: 'PRJ', nombre: 'E', orden: 4, parent_id: null },
  ];

  // Se promueve 'c' (con su hija 'd') antes de 'b'.
  const next = applyCollectionLayout(collections, 'c', null, ['a', 'c', 'b', 'd', 'e']);

  // La salida ya es el orden visual definitivo: padre antes que sus hijas.
  assert.deepEqual(next.map((collection) => collection._id), ['a', 'c', 'd', 'b', 'e']);
  assert.deepEqual(next.map((collection) => collection.orden), [0, 1, 2, 3, 4]);
  assert.equal(next.find((collection) => collection._id === 'c').parent_id, null);
  assert.equal(next.find((collection) => collection._id === 'd').parent_id, 'c');
  // El estado anterior no se muta.
  assert.equal(collections.find((collection) => collection._id === 'c').parent_id, 'b');
});

test('el auto-scroll acelera cerca de los bordes y se detiene en el centro', () => {
  assert.equal(autoScrollIntent(300, 100, 500).direction, 0);
  assert.equal(autoScrollIntent(300, 100, 500).speed, 0);

  const top = autoScrollIntent(102, 100, 500);
  assert.equal(top.direction, -1);
  assert.ok(top.speed > 3);

  const bottom = autoScrollIntent(498, 100, 500);
  assert.equal(bottom.direction, 1);
  assert.ok(bottom.speed > 3);

  assert.equal(autoScrollIntent(150, 100, 500, 0).direction, 0);
  assert.equal(autoScrollIntent(150, 500, 500).direction, 0);
});
