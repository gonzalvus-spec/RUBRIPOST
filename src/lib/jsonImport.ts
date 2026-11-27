import { splitQuery, urlWithQuery } from './queryParams';
import { sortRequestsByOrder } from './requestOrder';

export interface ImportedCollection {
  client_id: string;
  nombre: string;
  parent_client_id: string | null;
  color: string | null;
  orden: number;
}

export interface ImportedRequest {
  nombre: string;
  contexto: string;
  metodo: string;
  url: string;
  body: string | null;
  headers: Record<string, string> | null;
  query_descripciones: Record<string, string> | null;
  auth: {
    kind: 'bearer' | 'api-key';
    token?: string | null;
    api_key_name?: string | null;
    api_key_value?: string | null;
  } | null;
  pre_request_script: string;
  post_response_script: string;
  collection_client_id: string;
  orden: number;
}

export interface JsonImportBatch {
  collections: ImportedCollection[];
  requests: ImportedRequest[];
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objectAt = (value: unknown, path: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${path} debe ser un objeto`);
  return value;
};

const arrayAt = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} debe ser un array`);
  return value;
};

const requiredString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} debe ser un texto no vacío`);
  }
  return value.trim();
};

const optionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${path} debe ser texto`);
  return value;
};

const stringRecord = (value: unknown, path: string): Record<string, string> => {
  if (value === undefined || value === null) return {};
  const input = objectAt(value, path);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item !== 'string') throw new Error(`${path}.${key} debe ser texto`);
    result[key] = item;
  }
  return result;
};

const queryRecord = (value: unknown, path: string): Record<string, string> => {
  if (value === undefined || value === null) return {};
  const input = objectAt(value, path);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new Error(`${path}.${key} debe ser texto, número, booleano o null`);
    }
    result[key] = item === null ? '' : String(item);
  }
  return result;
};

/** Une plantillas y rutas sin alterar las dos barras del protocolo. */
export const joinImportUrl = (baseUrl: string, path: string): string =>
  `${baseUrl}${path}`.replace(/([^:]\/)\/+/g, '$1');

const appendQuery = (url: string, query: Record<string, string>): string => {
  const rows = [
    ...splitQuery(url).pairs,
    ...Object.entries(query).map(([key, value]) => ({ key, value })),
  ].map((row, index) => ({ id: `import-query-${index}`, description: '', ...row }));
  return urlWithQuery(url, rows);
};

const methodAt = (value: unknown, path: string): string => {
  const method = requiredString(value, path).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error(`${path} no es un método HTTP válido`);
  return method;
};

const nativeAuth = (value: unknown, path: string): ImportedRequest['auth'] => {
  if (value === undefined || value === null) return null;
  const auth = objectAt(value, path);
  const kind = auth.kind ?? auth.type;
  if (kind === 'none' || kind === undefined || kind === null) return null;
  if (kind === 'bearer') {
    return { kind: 'bearer', token: optionalString(auth.token, `${path}.token`) ?? '' };
  }
  if (kind === 'api-key') {
    return {
      kind: 'api-key',
      api_key_name: optionalString(auth.api_key_name, `${path}.api_key_name`) ?? '',
      api_key_value: optionalString(auth.api_key_value, `${path}.api_key_value`) ?? '',
    };
  }
  throw new Error(`${path}.type debe ser "bearer", "api-key" o "none"`);
};

const rubriCutBody = (value: unknown, path: string): string | null => {
  if (value === undefined || value === null) return null;
  const body = objectAt(value, path);
  if (body.mode === 'json') {
    if (!Object.prototype.hasOwnProperty.call(body, 'json')) {
      throw new Error(`${path}.json es obligatorio cuando mode es "json"`);
    }
    return JSON.stringify(body.json, null, 2);
  }
  if (body.mode === 'file') {
    const payloadFile = requiredString(body.file ?? body.path, `${path}.file`);
    return JSON.stringify({ _payloadFile: payloadFile }, null, 2);
  }
  throw new Error(`${path}.mode debe ser "json" o "file"`);
};

/** Parsea Rubri-Cut 1.0 o el JSON producido por jsonExport.ts. */
export const parseCollectionImport = (rawJson: string): JsonImportBatch => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    throw new Error(`JSON inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = objectAt(parsed, 'La raíz');
  const batch: JsonImportBatch = { collections: [], requests: [] };
  let sequence = 0;
  const nextId = (): string => `import-${sequence++}`;

  const addRubriCutRequest = (
    value: unknown,
    path: string,
    collectionId: string,
    order: number,
    baseUrl: string,
    defaults: Record<string, string>,
  ) => {
    const request = objectAt(value, path);
    const query = queryRecord(request.query, `${path}.query`);
    const requestPath = optionalString(request.path, `${path}.path`)
      ?? optionalString(request.url, `${path}.url`)
      ?? '';
    if (!requestPath && !baseUrl) throw new Error(`${path}.path es obligatorio`);
    const url = appendQuery(joinImportUrl(baseUrl, requestPath), query);
    const headers = { ...defaults, ...stringRecord(request.headers, `${path}.headers`) };
    batch.requests.push({
      nombre: requiredString(request.name, `${path}.name`),
      contexto: '',
      metodo: methodAt(request.method, `${path}.method`),
      url,
      body: rubriCutBody(request.body, `${path}.body`),
      headers: Object.keys(headers).length ? headers : null,
      query_descripciones: null,
      auth: nativeAuth(request.auth, `${path}.auth`),
      pre_request_script: '',
      post_response_script: '',
      collection_client_id: collectionId,
      orden: order,
    });
  };

  const addRubriCutFolder = (
    value: unknown,
    path: string,
    parentId: string | null,
    order: number,
    baseUrl: string,
    defaults: Record<string, string>,
  ) => {
    const folder = objectAt(value, path);
    const id = nextId();
    batch.collections.push({
      client_id: id,
      nombre: requiredString(folder.name, `${path}.name`),
      parent_client_id: parentId,
      color: null,
      orden: order,
    });
    const requests = folder.requests === undefined ? [] : arrayAt(folder.requests, `${path}.requests`);
    requests.forEach((request, index) => addRubriCutRequest(request, `${path}.requests[${index}]`, id, index, baseUrl, defaults));
    const folders = folder.folders === undefined ? [] : arrayAt(folder.folders, `${path}.folders`);
    folders.forEach((child, index) => addRubriCutFolder(child, `${path}.folders[${index}]`, id, index, baseUrl, defaults));
  };

  const addNativeCollection = (value: unknown, path: string, parentId: string | null, order: number) => {
    const collection = objectAt(value, path);
    const id = nextId();
    batch.collections.push({
      client_id: id,
      nombre: requiredString(collection.nombre ?? collection.name, `${path}.nombre`),
      parent_client_id: parentId,
      color: optionalString(collection.color, `${path}.color`) ?? null,
      orden: typeof collection.orden === 'number' ? collection.orden : order,
    });
    const requests = collection.requests === undefined ? [] : arrayAt(collection.requests, `${path}.requests`);
    sortRequestsByOrder(requests.map((item, index) => ({ item, index, orden: isObject(item) && typeof item.orden === 'number' ? item.orden : index })))
      .forEach(({ item }, requestOrder) => {
        const request = objectAt(item, `${path}.requests[${requestOrder}]`);
        const headers = stringRecord(request.headers, `${path}.requests[${requestOrder}].headers`);
        const rawBody = request.body;
        if (rawBody !== undefined && rawBody !== null && typeof rawBody !== 'string') {
          throw new Error(`${path}.requests[${requestOrder}].body debe ser texto o null`);
        }
        batch.requests.push({
          nombre: requiredString(request.nombre ?? request.name, `${path}.requests[${requestOrder}].nombre`),
          contexto: optionalString(request.contexto, `${path}.requests[${requestOrder}].contexto`) ?? '',
          metodo: methodAt(request.metodo ?? request.method, `${path}.requests[${requestOrder}].metodo`),
          url: requiredString(request.url, `${path}.requests[${requestOrder}].url`),
          body: rawBody ?? null,
          headers: Object.keys(headers).length ? headers : null,
          query_descripciones: Object.keys(stringRecord(request.query_descripciones, `${path}.requests[${requestOrder}].query_descripciones`)).length
            ? stringRecord(request.query_descripciones, `${path}.requests[${requestOrder}].query_descripciones`) : null,
          auth: nativeAuth(request.auth, `${path}.requests[${requestOrder}].auth`),
          pre_request_script: optionalString(request.pre_request_script, `${path}.requests[${requestOrder}].pre_request_script`) ?? '',
          post_response_script: optionalString(request.post_response_script, `${path}.requests[${requestOrder}].post_response_script`) ?? '',
          collection_client_id: id,
          orden: requestOrder,
        });
      });
    const children = arrayAt(collection.collections ?? collection.folders ?? [], `${path}.collections`);
    sortRequestsByOrder(children.map((item, index) => ({
      item,
      index,
      orden: isObject(item) && typeof item.orden === 'number' ? item.orden : index,
    }))).forEach(({ item, index }, childOrder) =>
      addNativeCollection(item, `${path}.collections[${index}]`, id, childOrder));
  };

  if (root.format === 'rubripost') {
    if (root.format_version !== 1) throw new Error('Solo se admite format_version 1 de RubriPost');
    const roots = arrayAt(root.collections, 'collections');
    sortRequestsByOrder(roots.map((item, index) => ({
      item,
      index,
      orden: isObject(item) && typeof item.orden === 'number' ? item.orden : index,
    }))).forEach(({ item, index }, rootOrder) =>
      addNativeCollection(item, `collections[${index}]`, null, rootOrder));
  } else {
    if (root.schemaVersion !== '1.0') throw new Error('Solo se admite schemaVersion "1.0" de Rubri-Cut');
    // La descripción se valida aunque el modelo actual de colección no tenga ese campo.
    optionalString(root.description, 'description');
    const baseUrl = optionalString(root.baseUrl, 'baseUrl') ?? '';
    const defaults = stringRecord(root.defaultHeaders, 'defaultHeaders');
    const rootId = nextId();
    batch.collections.push({ client_id: rootId, nombre: requiredString(root.name, 'name'), parent_client_id: null, color: null, orden: 0 });
    const requests = root.requests === undefined ? [] : arrayAt(root.requests, 'requests');
    requests.forEach((request, index) => addRubriCutRequest(request, `requests[${index}]`, rootId, index, baseUrl, defaults));
    const folders = root.folders === undefined ? [] : arrayAt(root.folders, 'folders');
    folders.forEach((folder, index) => addRubriCutFolder(folder, `folders[${index}]`, rootId, index, baseUrl, defaults));
  }

  if (batch.collections.length === 0) throw new Error('El archivo no contiene colecciones');
  // MongoDB ordena el árbol con un único campo global. La visita preorden
  // produce posiciones únicas y conserva el orden de cada grupo de hermanas.
  batch.collections.forEach((collection, index) => { collection.orden = index; });
  return batch;
};
