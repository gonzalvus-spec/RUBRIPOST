import type { RespuestaHttp } from './httpClient';

export interface ScriptRequestContext {
  url: string;
  headers: Record<string, string>;
}

export interface ScriptRunInput {
  script: string;
  environment: Record<string, string>;
  request: ScriptRequestContext;
  response?: RespuestaHttp;
  timeoutMs?: number;
}

export interface ScriptRunResult {
  environment: Record<string, string>;
  changed: Record<string, string>;
}

interface WorkerReply {
  ok: boolean;
  environment?: Record<string, string>;
  changed?: Record<string, string>;
  error?: string;
}

// El worker no recibe referencias a window/Tauri y termina siempre tras el script.
const WORKER_SOURCE = String.raw`
self.onmessage = async (event) => {
  const input = event.data;
  const send = self.postMessage.bind(self);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  // Retira capacidades del worker antes de ejecutar código del usuario.
  for (const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','Worker','SharedWorker','indexedDB','caches','navigator','location','postMessage']) {
    try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
  }
  try { Object.defineProperty(Function.prototype, 'constructor', { value: undefined, configurable: false }); } catch (_) {}
  try { Object.defineProperty(self, 'eval', { value: undefined, configurable: false }); } catch (_) {}
  const environment = { ...input.environment };
  const changed = {};
  const safeKey = (key) => {
    const value = String(key);
    if (value === '__proto__' || value === 'prototype' || value === 'constructor') throw new Error('Nombre de variable no permitido');
    return value;
  };
  const responseHeaders = new Map((input.response?.headers || []).map((item) => [String(item.nombre).toLowerCase(), String(item.valor)]));
  const requestHeaders = Object.freeze({ ...input.request.headers });
  const getEnvVar = (key) => environment[safeKey(key)];
  const setEnvVar = (key, value) => { const name = safeKey(key); const text = String(value ?? ''); environment[name] = text; changed[name] = text; };
  const responseBody = () => {
    if (!input.response) return undefined;
    try { return JSON.parse(input.response.body); } catch (_) { return input.response.body; }
  };
  const responseHeader = (name) => responseHeaders.get(String(name).toLowerCase()) ?? null;
  const bru = Object.freeze({ getEnvVar, setEnvVar });
  const res = input.response ? Object.freeze({
    status: input.response.status,
    getBody: responseBody,
    getHeader: responseHeader,
  }) : undefined;
  const pm = Object.freeze({
    environment: Object.freeze({
      get: getEnvVar,
      set: setEnvVar,
    }),
    request: Object.freeze({ url: input.request.url, headers: requestHeaders }),
    response: input.response ? Object.freeze({
      code: input.response.status,
      text() { return input.response.body; },
      json() { return JSON.parse(input.response.body); },
      headers: Object.freeze({ get: responseHeader }),
    }) : undefined,
  });
  try {
    const execute = new AsyncFunction('pm', 'bru', 'res', '"use strict";\n' + input.script);
    await execute(pm, bru, res);
    send({ ok: true, environment, changed });
  } catch (error) {
    send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};`;

export const runRequestScript = (input: ScriptRunInput): Promise<ScriptRunResult> => {
  if (!input.script.trim()) return Promise.resolve({ environment: { ...input.environment }, changed: {} });
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(blobUrl);
    const finish = () => { worker.terminate(); URL.revokeObjectURL(blobUrl); };
    const timer = window.setTimeout(() => {
      finish();
      reject(new Error('El script superó el tiempo máximo de ejecución'));
    }, input.timeoutMs ?? 3_000);
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      window.clearTimeout(timer);
      finish();
      if (!event.data.ok) { reject(new Error(event.data.error || 'Error al ejecutar el script')); return; }
      resolve({ environment: event.data.environment ?? {}, changed: event.data.changed ?? {} });
    };
    worker.onerror = (event) => {
      window.clearTimeout(timer);
      finish();
      reject(new Error(event.message || 'El sandbox no pudo ejecutar el script'));
    };
    worker.postMessage({ ...input, response: input.response ?? null });
  });
};
