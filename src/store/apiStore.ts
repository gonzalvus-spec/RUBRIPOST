import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { notify } from '../lib/alerts';
import { registrarCambio } from '../lib/audit';
import { sortRequestsByOrder } from '../lib/requestOrder';
import {
  applyCollectionLayout,
  canMoveCollection,
  collectionSubtreeIds,
} from '../lib/collectionHierarchy';
import { readCollectionCache, writeCollectionCache } from '../lib/collectionCache';
import { useAuthStore } from './authStore';
export { collectionSubtreeIds } from '../lib/collectionHierarchy';

// ---------------------------------------------------------------------------
// Tipos (TypeScript estricto, sin `any`)
// ---------------------------------------------------------------------------

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthKind = 'none' | 'bearer' | 'api-key';

export interface AuthConfig {
  kind: AuthKind;
  token?: string | null;
  api_key_name?: string | null;
  api_key_value?: string | null;
}

export interface HttpInfo {
  status_code: number;
  duration_ms: number;
}

/** Colección (carpeta estilo Postman). Vive en la misma colección de MongoDB. */
export interface ApiCollection {
  _id: string;
  eid: string;
  nombre: string;
  parent_id?: string | null;
  color: string;
  orden: number;
  timestamp: string;
  updated_at: string;
}

/**
 * Proyecto (espacio de trabajo). Su `codigo` es el `eid` con el que se
 * guardan requests, colecciones y cookies, así que cambiar de proyecto cambia
 * todo el contenido visible sin mezclar datos.
 */
export interface ApiProyecto {
  _id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  color: string;
  total_requests: number;
  total_colecciones: number;
  timestamp: string;
  updated_at: string;
}

export interface ProyectoInput {
  codigo: string;
  nombre: string;
  descripcion?: string;
  color?: string;
}

/** Documento devuelto por el backend (comando `get_api_workspace`). */
export interface ApiRequestDocument {
  _id: string;
  eid: string;
  nombre: string;
  contexto: string;
  metodo: string;
  url: string;
  body: string | null;
  headers: Record<string, string> | null;
  /** Descripciones de los query params, indexadas por nombre. */
  query_descripciones?: Record<string, string> | null;
  auth: AuthConfig | null;
  http_info: HttpInfo;
  coleccion_id: string | null;
  orden: number;
  timestamp: string;
  updated_at: string;
  version: number;
}

/** Instantánea devuelta por `get_api_workspace`. */
export interface ApiWorkspace {
  collections: ApiCollection[];
  requests: ApiRequestDocument[];
}

/** Payload enviado al backend (comando `save_api_request_full`). */
export interface ApiRequestPayload {
  id?: string | null;
  eid: string;
  nombre: string;
  contexto: string;
  metodo: string;
  url: string;
  body: string | null;
  headers: Record<string, string> | null;
  /** Descripciones de los query params, indexadas por nombre. */
  query_descripciones?: Record<string, string> | null;
  auth: AuthConfig | null;
  http_info: HttpInfo;
  coleccion_id: string | null;
  version?: number;
}

/** Fila editable de la tabla de headers. */
export interface HeaderRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface SaveOptions {
  asNew?: boolean;
  nombre?: string;
  coleccionId?: string | null;
}

export interface RefreshOptions {
  /** Lectura inicial sin crear carpetas antes de validar el proyecto activo. */
  readOnly?: boolean;
  /** No muestra toasts (usado por el sondeo automático). */
  silent?: boolean;
  /** No enciende los spinners de la UI. */
  background?: boolean;
  /**
   * Adopta en el draft los cambios que otra PC haya guardado en MongoDB.
   * Nunca pisa ediciones locales sin guardar.
   */
  sync?: boolean;
}

export interface DraftInput {
  nombre: string;
  contexto: string;
  metodo: HttpMethod;
  url: string;
  body: string;
  coleccionId?: string | null;
}

/** Paleta disponible para las colecciones. */
export const COLLECTION_COLORS: readonly string[] = [
  '#046A38',
  '#0A8F4E',
  '#C5A059',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#E53E3E',
  '#10B981',
];

export const DEFAULT_COLLECTION_COLOR = COLLECTION_COLORS[0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let headerSequence = 0;

export const createHeaderRow = (
  key = '',
  value = '',
  enabled = true,
): HeaderRow => ({
  id: `header-${Date.now()}-${headerSequence++}`,
  key,
  value,
  enabled,
});

/** Convierte las filas de la UI en el mapa que espera MongoDB. */
export const rowsToRecord = (
  rows: HeaderRow[],
): Record<string, string> | null => {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (row.enabled && key) {
      record[key] = row.value;
    }
  }
  return Object.keys(record).length > 0 ? record : null;
};

/** Convierte el mapa almacenado en filas editables. */
export const recordToRows = (
  headers: Record<string, string> | null | undefined,
): HeaderRow[] => {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) =>
    createHeaderRow(key, value),
  );
};

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

export const errorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Error desconocido';
  }
};

export const getContextFromUrl = (url: string): string => {
  if (url.includes('/search-xml')) return 'Extracción XML';
  if (url.includes('/search-cdr') || url.includes('/cdr')) return 'Extracción CDR';
  if (url.includes('/validate-document')) return 'Validación Documento';
  if (url.includes('/status')) return 'Estado Servicio';
  if (url.includes('/download')) return 'Descarga Documento';
  if (url.includes('/upload')) return 'Subida Documento';
  return 'API Request';
};

export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
};

const defaultAuth = (): AuthConfig => ({
  kind: 'none',
  token: '',
  api_key_name: 'X-API-Key',
  api_key_value: '',
});

const normalizeAuthKind = (kind: string | undefined | null): AuthKind => {
  if (kind === 'bearer' || kind === 'api-key') return kind;
  return 'none';
};

const normalizeAuth = (auth: AuthConfig | null | undefined): AuthConfig => {
  if (!auth) return defaultAuth();
  return {
    kind: normalizeAuthKind(auth.kind),
    token: auth.token ?? '',
    api_key_name: auth.api_key_name ?? 'X-API-Key',
    api_key_value: auth.api_key_value ?? '',
  };
};

/** Nunca persiste secretos vacíos ni el modo `none`. */
const toPayloadAuth = (auth: AuthConfig): AuthConfig | null => {
  if (auth.kind === 'none') return null;
  if (auth.kind === 'bearer') {
    const token = auth.token?.trim();
    return { kind: 'bearer', token: token ? token : null };
  }
  return {
    kind: 'api-key',
    api_key_name: auth.api_key_name?.trim() || null,
    api_key_value: auth.api_key_value?.trim() || null,
  };
};

/** Agrupa requests por colección respetando el orden de las colecciones. */
export interface CollectionGroup {
  collection: ApiCollection;
  requests: ApiRequestDocument[];
  depth: number;
  ancestors: string[];
}

export const groupRequestsByCollection = (
  collections: ApiCollection[],
  requests: ApiRequestDocument[],
): CollectionGroup[] => {
  const buckets = new Map<string, ApiRequestDocument[]>();
  for (const collection of collections) {
    buckets.set(collection._id, []);
  }
  const orphans: ApiRequestDocument[] = [];

  for (const request of sortRequestsByOrder(requests)) {
    const bucket = request.coleccion_id
      ? buckets.get(request.coleccion_id)
      : undefined;
    if (bucket) {
      bucket.push(request);
    } else {
      orphans.push(request);
    }
  }

  const groups: CollectionGroup[] = [];
  const visited = new Set<string>();
  const append = (collection: ApiCollection, ancestors: string[]) => {
    if (visited.has(collection._id)) return;
    visited.add(collection._id);
    groups.push({ collection, requests: buckets.get(collection._id) ?? [], depth: ancestors.length, ancestors });
    for (const child of collections.filter((item) => item.parent_id === collection._id)) {
      append(child, [...ancestors, collection._id]);
    }
  };
  for (const collection of collections.filter((item) => !item.parent_id || !buckets.has(item.parent_id))) append(collection, []);
  for (const collection of collections) if (!visited.has(collection._id)) append(collection, []);

  if (orphans.length > 0) {
    groups.push({
      collection: {
        _id: '',
        eid: collections[0]?.eid ?? '',
        nombre: 'Sin colección',
        color: '#A0A0A0',
        orden: Number.MAX_SAFE_INTEGER,
        timestamp: '',
        updated_at: '',
      },
      requests: orphans,
      depth: 0,
      ancestors: [],
    });
  }

  return groups;
};

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

const DEFAULT_EID =
  (import.meta.env.VITE_RUBRI_EID as string | undefined)?.trim() ||
  'EMP-0042';

/** Proyecto activo recordado entre sesiones (queda en este equipo). */
export const PROYECTO_STORAGE_KEY = 'rubri.proyecto.codigo';

const leerProyectoCodigo = (): string => {
  try {
    return localStorage.getItem(PROYECTO_STORAGE_KEY)?.trim() || DEFAULT_EID;
  } catch {
    return DEFAULT_EID;
  }
};

const guardarProyectoCodigo = (codigo: string): void => {
  try {
    localStorage.setItem(PROYECTO_STORAGE_KEY, codigo);
  } catch {
    // Sin almacenamiento local: el proyecto activo vale para esta sesión.
  }
};
const DEFAULT_METHOD: HttpMethod = 'POST';
const DEFAULT_URL = '';
const DEFAULT_BODY = '';
const DEFAULT_HEADERS: HeaderRow[] = [
  createHeaderRow('Content-Type', 'application/json'),
  createHeaderRow('Accept', 'application/json'),
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ApiState {
  // Draft editable
  eid: string;
  nombre: string;
  contexto: string;
  metodo: HttpMethod;
  url: string;
  body: string;
  headerRows: HeaderRow[];
  /** Descripciones de los query params del draft, indexadas por nombre. */
  queryDescripciones: Record<string, string>;
  auth: AuthConfig;
  httpInfo: HttpInfo;
  version: number;
  /** Colección del draft actual. */
  coleccionId: string | null;

  // Snapshot / persistencia
  currentRequest: ApiRequestPayload | null;
  collections: ApiCollection[];
  isWorkspaceCached: boolean;
  /** Proyectos disponibles (se recargan al abrir la app y al crear/editar). */
  proyectos: ApiProyecto[];
  savedRequests: ApiRequestDocument[];
  activeCollectionId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isRefreshing: boolean;
  deletingId: string | null;
  busyCollectionId: string | null;
  lastSavedId: string | null;
  lastError: string | null;
  /** Marca de tiempo de la última lectura correcta de MongoDB (sincronización automática). */
  lastSyncAt: number | null;
  /** Marca de tiempo del último guardado local (protege contra respuestas obsoletas). */
  lastSaveAt: number;
  /** Se incrementa con cada cambio del draft para detectar ediciones durante un guardado. */
  revision: number;

  // Acciones de edición
  setEid: (eid: string) => void;
  setMethod: (metodo: HttpMethod) => void;
  setUrl: (url: string) => void;
  setBody: (body: string) => void;
  setNombre: (nombre: string) => void;
  setContexto: (contexto: string) => void;
  setHeaders: (headers: Record<string, string> | null) => void;
  setHeaderRows: (rows: HeaderRow[]) => void;
  /** Guarda la descripción de un query param (clave = nombre del parámetro). */
  setQueryDescripcion: (clave: string, descripcion: string) => void;
  setAuth: (patch: Partial<AuthConfig>) => void;
  setHttpInfo: (info: HttpInfo) => void;
  setActiveCollection: (id: string | null) => void;
  setDraftCollection: (id: string | null) => void;

  // Acciones de persistencia
  saveToMongo: (options?: SaveOptions) => Promise<string | null>;
  refreshFromMongo: (options?: RefreshOptions) => Promise<ApiRequestDocument[]>;
  hydrateCollections: () => void;
  loadRequest: (request: ApiRequestDocument) => void;
  newRequest: (draft?: Partial<DraftInput>) => void;
  duplicateRequest: (id: string) => Promise<string | null>;
  deleteRequest: (id: string) => Promise<boolean>;
  renameRequest: (id: string, nombre: string) => Promise<boolean>;
  moveRequest: (id: string, coleccionId: string) => Promise<boolean>;
  /** Mueve/reordena requests y persiste `coleccion_id` + `orden`. */
  reorderRequests: (
    coleccionId: string | null,
    orderedIds: string[],
  ) => Promise<boolean>;

  // Colecciones
  createCollection: (nombre: string, color?: string, parentId?: string | null) => Promise<string | null>;
  renameCollection: (id: string, nombre: string, color?: string) => Promise<boolean>;
  /**
   * Mueve una colección y, opcionalmente, reordena todo el árbol en una sola
   * operación optimista. El sidebar se actualiza al instante.
   */
  moveCollection: (
    id: string,
    parentId: string | null,
    orderedIds?: string[],
  ) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  duplicateCollection: (id: string) => Promise<string | null>;
  /** Reordena las colecciones del sidebar (drag & drop) y persiste `orden`. */
  reorderCollections: (orderedIds: string[]) => Promise<void>;

  // Proyectos (espacios de trabajo aislados por `eid`)
  refreshProyectos: () => Promise<ApiProyecto[]>;
  /** Crea un proyecto y devuelve su código (`eid`). */
  crearProyecto: (input: ProyectoInput) => Promise<string | null>;
  actualizarProyecto: (id: string, input: ProyectoInput) => Promise<boolean>;
  eliminarProyecto: (id: string, cascada: boolean) => Promise<boolean>;
  /** Cambia el proyecto activo: descarta el borrador y recarga el workspace. */
  cambiarProyecto: (codigo: string) => Promise<void>;

  // Utilidades
  markDirty: () => void;
  resetDirty: () => void;
  clearSavedId: () => void;
}

interface DraftSource {
  eid: string;
  nombre: string;
  contexto: string;
  metodo: HttpMethod;
  url: string;
  body: string;
  headerRows: HeaderRow[];
  queryDescripciones: Record<string, string>;
  auth: AuthConfig;
  httpInfo: HttpInfo;
  version: number;
  coleccionId: string | null;
  lastSavedId: string | null;
}

const buildPayload = (state: DraftSource): ApiRequestPayload => ({
  id: state.lastSavedId,
  eid: state.eid,
  nombre: state.nombre.trim(),
  contexto: state.contexto,
  metodo: state.metodo,
  url: state.url.trim(),
  body:
    state.metodo === 'GET'
      ? null
      : state.body.trim()
        ? state.body
        : null,
  headers: rowsToRecord(state.headerRows),
  query_descripciones:
    Object.keys(state.queryDescripciones).length > 0
      ? state.queryDescripciones
      : null,
  auth: toPayloadAuth(state.auth),
  http_info: state.httpInfo,
  coleccion_id: state.coleccionId,
  version: state.version,
});

export const useApiStore = create<ApiState>()((set, get) => {
  const initialEid = leerProyectoCodigo();
  const initialUser = useAuthStore.getState().sesion?.usuario ?? '';
  const initialCollections = readCollectionCache(initialUser, initialEid);
  let workspaceOwner = JSON.stringify([initialUser, initialEid]);
  let workspaceRefresh: { user: string; eid: string; promise: Promise<ApiRequestDocument[]> } | null = null;
  /** Descarta respuestas de sondeo que lleguen fuera de orden. */
  let syncSequence = 0;
  /** Movimientos de colección en vuelo: evitan que un sondeo revierta el orden. */
  let collectionMovePending = 0;

  const applyDraft = (
    state: ApiState,
    patch: Partial<ApiState>,
    dirty = true,
  ): Partial<ApiState> => {
    const next: DraftSource = { ...state, ...patch };
    return {
      ...patch,
      isDirty: dirty ? true : state.isDirty,
      revision: state.revision + 1,
      currentRequest: buildPayload(next),
    };
  };

  return {
    eid: initialEid,
    nombre: '',
    contexto: getContextFromUrl(DEFAULT_URL),
    metodo: DEFAULT_METHOD,
    url: DEFAULT_URL,
    body: DEFAULT_BODY,
    headerRows: DEFAULT_HEADERS,
    queryDescripciones: {},
    auth: defaultAuth(),
    httpInfo: { status_code: 0, duration_ms: 0 },
    version: 1,
    coleccionId: initialCollections[0]?._id ?? null,

    currentRequest: null,
    collections: initialCollections,
    isWorkspaceCached: initialCollections.length > 0,
    proyectos: [],
    savedRequests: [],
    activeCollectionId: initialCollections[0]?._id ?? null,
    isDirty: false,
    isSaving: false,
    isRefreshing: false,
    deletingId: null,
    busyCollectionId: null,
    lastSavedId: null,
    lastError: null,
    lastSyncAt: null,
    lastSaveAt: 0,
    revision: 0,

    // -----------------------------------------------------------------------
    // Edición
    // -----------------------------------------------------------------------

    setEid: (eid) => {
      guardarProyectoCodigo(eid);
      set({ eid });
    },

    setMethod: (metodo) => set((state) => applyDraft(state, { metodo })),

    setUrl: (url) =>
      set((state) => {
        // El contexto se autodetecta mientras el usuario no lo personalice.
        const derivedBefore = getContextFromUrl(state.url);
        const contexto =
          !state.contexto || state.contexto === derivedBefore
            ? getContextFromUrl(url)
            : state.contexto;
        return applyDraft(state, { url, contexto });
      }),

    setBody: (body) => set((state) => applyDraft(state, { body })),

    setNombre: (nombre) => set((state) => applyDraft(state, { nombre })),

    setContexto: (contexto) =>
      set((state) => applyDraft(state, { contexto })),

    setHeaders: (headers) =>
      set((state) =>
        applyDraft(state, {
          headerRows: recordToRows(headers),
        }),
      ),

    setHeaderRows: (rows) =>
      set((state) => applyDraft(state, { headerRows: rows })),

    setQueryDescripcion: (clave, descripcion) =>
      set((state) => {
        const nombre = clave.trim();
        if (!nombre) return {};

        const queryDescripciones = { ...state.queryDescripciones };
        if (descripcion.trim()) {
          queryDescripciones[nombre] = descripcion;
        } else {
          delete queryDescripciones[nombre];
        }

        return applyDraft(state, { queryDescripciones });
      }),

    setAuth: (patch) =>
      set((state) =>
        applyDraft(state, { auth: { ...state.auth, ...patch } }),
      ),

    // La información HTTP no ensucia el draft: se actualiza al enviar.
    setHttpInfo: (info) =>
      set((state) => {
        const next: DraftSource = { ...state, httpInfo: info };
        return { httpInfo: info, currentRequest: buildPayload(next) };
      }),

    setActiveCollection: (id) =>
      set((state) => {
        // Al elegir colección en el sidebar, la nueva request va ahí.
        if (state.lastSavedId) {
          return { activeCollectionId: id };
        }
        const next: DraftSource = { ...state, coleccionId: id };
        return {
          activeCollectionId: id,
          coleccionId: id,
          currentRequest: buildPayload(next),
        };
      }),

    setDraftCollection: (id) =>
      set((state) => {
        const next: DraftSource = { ...state, coleccionId: id };
        return {
          ...applyDraft(state, { coleccionId: id }),
          activeCollectionId: id ?? state.activeCollectionId,
          currentRequest: buildPayload(next),
        };
      }),

    // -----------------------------------------------------------------------
    // Persistencia
    // -----------------------------------------------------------------------

    saveToMongo: async (options = {}) => {
      const state = get();
      if (state.isSaving) return null;

      const nombre = (options.nombre ?? state.nombre).trim();
      if (!nombre) {
        notify.error('La request necesita un nombre');
        return null;
      }
      if (state.metodo !== 'GET' && byteLength(state.body) > MAX_BODY_BYTES) {
        notify.error('El body supera el límite de 1 MB');
        return null;
      }
      if (!state.url.trim()) {
        notify.error('La URL es obligatoria');
        return null;
      }

      const coleccionId =
        options.coleccionId ?? state.coleccionId ?? state.activeCollectionId;
      if (!coleccionId) {
        notify.error('Crea o selecciona una colección primero');
        return null;
      }

      const payload: ApiRequestPayload = {
        ...buildPayload(state),
        nombre,
        coleccion_id: coleccionId,
        id: options.asNew ? null : state.lastSavedId,
      };

      set({ isSaving: true, lastError: null });

      const revisionAtSave = state.revision;

      try {
        const savedId = await invoke<string>('save_api_request_full', {
          payload,
        });

        const nextVersion = options.asNew ? 1 : state.version + 1;
        set((current) => {
          // Si el usuario editó mientras se guardaba, el draft sigue sucio.
          const editedDuringSave = current.revision !== revisionAtSave;
          const finalNombre = editedDuringSave ? current.nombre : nombre;
          const next: DraftSource = {
            ...current,
            nombre: finalNombre,
            coleccionId,
            lastSavedId: savedId,
            version: nextVersion,
          };
          return {
            isSaving: false,
            isDirty: editedDuringSave,
            lastSavedId: savedId,
            lastSaveAt: Date.now(),
            nombre: finalNombre,
            coleccionId,
            activeCollectionId: coleccionId,
            version: nextVersion,
            currentRequest: buildPayload(next),
          };
        });

        registrarCambio({
          eid: payload.eid,
          accion: options.asNew ? 'Creó request' : 'Actualizó request',
          entidad: 'request',
          entidadId: savedId,
          nombre,
          detalle: `${payload.metodo} ${payload.url}`,
        });

        notify.success(
          options.asNew
            ? 'Request guardada como nueva en la colección'
            : 'Request guardada en la colección',
        );

        await get().refreshFromMongo({ silent: true });
        return savedId;
      } catch (error) {
        const message = errorMessage(error);
        set({ isSaving: false, lastError: message });
        notify.error(`Error al guardar: ${message}`);
        return null;
      }
    },

    hydrateCollections: () => {
      const state = get();
      const user = useAuthStore.getState().sesion?.usuario ?? '';
      const scope = JSON.stringify([user, state.eid]);
      if (workspaceOwner === scope) return;
      workspaceOwner = scope;
      ++syncSequence;
      const cached = readCollectionCache(user, state.eid);
      const firstId = cached[0]?._id ?? null;
      set({ collections: cached, savedRequests: [], isWorkspaceCached: cached.length > 0,
        activeCollectionId: firstId, coleccionId: firstId, lastSavedId: null,
        isRefreshing: false, lastSyncAt: null, lastError: null, lastSaveAt: 0 });
      get().newRequest({ coleccionId: firstId });
    },

    refreshFromMongo: async (options = {}) => {
      const state = get();
      const user = useAuthStore.getState().sesion?.usuario ?? '';
      // Esperar la lectura compartida evita un resultado vacío en montajes simultáneos.
      if (workspaceRefresh?.user === user && workspaceRefresh.eid === state.eid) return workspaceRefresh.promise;
      // Nunca competir con un guardado o un movimiento de colección en curso.
      if (options.background && (state.isSaving || collectionMovePending > 0)) {
        return state.savedRequests;
      }

      if (!options.background) set({ isRefreshing: true, lastError: null });
      const requestId = ++syncSequence;
      let completeRefresh: (requests: ApiRequestDocument[]) => void = () => {};
      const pending = new Promise<ApiRequestDocument[]>((resolve) => { completeRefresh = resolve; });
      workspaceRefresh = { user, eid: state.eid, promise: pending };

      try {
        const workspace = await invoke<ApiWorkspace>(options.readOnly ? 'get_api_workspace_snapshot' : 'get_api_workspace', {
          filter: { eid: state.eid, limit: 200 },
        });
        if (requestId !== syncSequence || get().eid !== state.eid || (useAuthStore.getState().sesion?.usuario ?? '') !== user) return get().savedRequests;

        let remoteDeleted = false;

        set((current) => {
          if (requestId !== syncSequence || current.eid !== state.eid) {
            // Ya hay una lectura más reciente aplicada; esta quedó obsoleta.
            return {};
          }

          const collectionIds = new Set(
            workspace.collections.map((collection) => collection._id),
          );

          const activeCollectionId =
            current.activeCollectionId &&
            collectionIds.has(current.activeCollectionId)
              ? current.activeCollectionId
              : (workspace.collections[0]?._id ?? null);

          const coleccionId =
            current.coleccionId && collectionIds.has(current.coleccionId)
              ? current.coleccionId
              : activeCollectionId;

          let draft: DraftSource = { ...current, coleccionId };
          let lastSavedId = current.lastSavedId;
          let version = current.version;
          let isDirty = current.isDirty;
          let adopted = false;

          if (options.sync && current.lastSavedId) {
            const remote = workspace.requests.find(
              (request) => request._id === current.lastSavedId,
            );

            const recentlySaved = Date.now() - current.lastSaveAt < 10_000;

            if (!remote) {
              // Otra PC la eliminó: el contenido local queda como borrador.
              // Se ignora justo después de guardar para no chocar con una
              // respuesta de sondeo que salió antes de la escritura.
              if (!recentlySaved) {
                remoteDeleted = true;
                lastSavedId = null;
                version = 1;
                isDirty = true;
              }
            } else if (
              !current.isDirty &&
              remote.version > current.version
            ) {
              // Otra PC la guardó y aquí no hay cambios: adoptamos su versión.
              const metodo = (remote.metodo || 'GET').toUpperCase() as HttpMethod;
              draft = {
                ...current,
                nombre: remote.nombre,
                contexto: remote.contexto,
                metodo,
                url: remote.url,
                body: remote.body ?? '',
                headerRows: recordToRows(remote.headers),
                queryDescripciones: remote.query_descripciones ?? {},
                auth: normalizeAuth(remote.auth),
                httpInfo: remote.http_info,
                version: remote.version,
                coleccionId: remote.coleccion_id ?? coleccionId,
                lastSavedId: remote._id,
              };
              lastSavedId = remote._id;
              version = remote.version;
              adopted = true;
            }
          }

          return {
            collections: workspace.collections,
            isWorkspaceCached: false,
            savedRequests: workspace.requests,
            activeCollectionId,
            coleccionId: draft.coleccionId,
            isRefreshing: false,
            lastSyncAt: Date.now(),
            lastError: null,
            ...(options.sync
              ? {
                  lastSavedId,
                  version,
                  isDirty,
                  ...(adopted
                    ? {
                        nombre: draft.nombre,
                        contexto: draft.contexto,
                        metodo: draft.metodo,
                        url: draft.url,
                        body: draft.body,
                        headerRows: draft.headerRows,
                        queryDescripciones: draft.queryDescripciones,
                        auth: draft.auth,
                        httpInfo: draft.httpInfo,
                        revision: current.revision + 1,
                      }
                    : {}),
                }
              : {}),
            currentRequest: buildPayload(draft),
          };
        });

        if (remoteDeleted) {
          notify.warning(
            'La request se eliminó desde otra PC',
            'El contenido quedó como borrador sin guardar.',
          );
        }

        if (!options.silent) {
          notify.success(
            `Workspace actualizado (${workspace.requests.length} requests · ${workspace.collections.length} colecciones)`,
          );
        }
        return workspace.requests;
      } catch (error) {
        if (requestId !== syncSequence || get().eid !== state.eid || (useAuthStore.getState().sesion?.usuario ?? '') !== user) return get().savedRequests;
        const message = errorMessage(error);
        set({ isRefreshing: false, lastError: message });
        if (!options.silent) {
          notify.error('No se pudo sincronizar con MongoDB', message);
        }
        return [];
      } finally {
        completeRefresh(get().savedRequests);
        if (workspaceRefresh?.promise === pending) workspaceRefresh = null;
      }
    },

    loadRequest: (request) => {
      const auth = normalizeAuth(request.auth);
      const headerRows = recordToRows(request.headers);
      const metodo = (request.metodo || 'GET').toUpperCase() as HttpMethod;

      const draft: DraftSource = {
        eid: request.eid,
        nombre: request.nombre,
        contexto: request.contexto,
        metodo,
        url: request.url,
        body: request.body ?? '',
        headerRows,
        queryDescripciones: request.query_descripciones ?? {},
        auth,
        httpInfo: request.http_info,
        version: request.version,
        coleccionId: request.coleccion_id,
        lastSavedId: request._id,
      };

      set({
        ...draft,
        currentRequest: buildPayload(draft),
        lastSavedId: request._id,
        activeCollectionId: request.coleccion_id,
        isDirty: false,
        lastError: null,
        revision: get().revision + 1,
      });
    },

    newRequest: (draft = {}) => {
      const metodo = draft.metodo ?? DEFAULT_METHOD;
      const url = draft.url ?? DEFAULT_URL;
      const coleccionId = draft.coleccionId ?? get().activeCollectionId;
      const next: DraftSource = {
        eid: get().eid,
        nombre: draft.nombre ?? '',
        contexto: draft.contexto ?? getContextFromUrl(url),
        metodo,
        url,
        body: draft.body ?? (metodo === 'GET' ? '' : DEFAULT_BODY),
        headerRows: DEFAULT_HEADERS.map((row) => ({ ...row })),
        queryDescripciones: {},
        auth: defaultAuth(),
        httpInfo: { status_code: 0, duration_ms: 0 },
        version: 1,
        coleccionId,
        lastSavedId: null,
      };

      set({
        ...next,
        currentRequest: buildPayload(next),
        lastSavedId: null,
        coleccionId,
        isDirty: false,
        lastError: null,
        revision: get().revision + 1,
      });
    },

    duplicateRequest: async (id) => {
      const projectEid = get().eid;
      try {
        const origen = get().savedRequests.find((item) => item._id === id);
        const newId = await invoke<string>('duplicate_api_request', { id });
        registrarCambio({
          eid: origen?.eid ?? projectEid,
          accion: 'Duplicó request',
          entidad: 'request',
          entidadId: newId,
          nombre: origen?.nombre ?? null,
          detalle: 'Copia de la request',
        });
        notify.success('Request duplicada');
        await get().refreshFromMongo({ silent: true });
        return newId;
      } catch (error) {
        notify.error(`Error al duplicar: ${errorMessage(error)}`);
        return null;
      }
    },

    deleteRequest: async (id) => {
      const projectEid = get().eid;
      const eliminada = get().savedRequests.find((item) => item._id === id);
      set({ deletingId: id });
      try {
        await invoke<void>('delete_api_request', { id });
        registrarCambio({
          eid: eliminada?.eid ?? projectEid,
          accion: 'Eliminó request',
          entidad: 'request',
          entidadId: id,
          nombre: eliminada?.nombre ?? null,
          detalle: eliminada ? `${eliminada.metodo} ${eliminada.url}` : null,
        });
        set((state) => {
          const wasCurrent = state.lastSavedId === id;
          if (!wasCurrent) {
            return { deletingId: null };
          }
          const next: DraftSource = {
            ...state,
            lastSavedId: null,
            version: 1,
          };
          return {
            deletingId: null,
            lastSavedId: null,
            version: 1,
            isDirty: true,
            revision: state.revision + 1,
            currentRequest: buildPayload(next),
          };
        });
        notify.success('Request eliminada');
        await get().refreshFromMongo({ silent: true });
        return true;
      } catch (error) {
        set({ deletingId: null });
        notify.error(`Error al eliminar: ${errorMessage(error)}`);
        return false;
      }
    },

    renameRequest: async (id, nombre) => {
      const trimmed = nombre.trim();
      if (!trimmed) {
        notify.error('El nombre no puede estar vacío');
        return false;
      }

      const source = get().savedRequests.find((item) => item._id === id);
      if (!source) {
        notify.error('No se encontró la request en la lista');
        return false;
      }

      const payload: ApiRequestPayload = {
        id: source._id,
        eid: source.eid,
        nombre: trimmed,
        contexto: source.contexto,
        metodo: source.metodo,
        url: source.url,
        body: source.body,
        headers: source.headers,
        auth: source.auth,
        http_info: source.http_info,
        coleccion_id: source.coleccion_id,
        version: source.version,
      };

      try {
        await invoke<string>('save_api_request_full', { payload });
        set((state) => {
          if (state.lastSavedId !== id) {
            return { nombre: state.nombre };
          }
          const next: DraftSource = { ...state, nombre: trimmed };
          return {
            nombre: trimmed,
            revision: state.revision + 1,
            currentRequest: buildPayload(next),
          };
        });
        registrarCambio({
          eid: source.eid,
          accion: 'Renombró request',
          entidad: 'request',
          entidadId: id,
          nombre: trimmed,
          detalle: `Antes: ${source.nombre}`,
        });
        notify.success('Request renombrada');
        await get().refreshFromMongo({ silent: true });
        return true;
      } catch (error) {
        notify.error(`Error al renombrar: ${errorMessage(error)}`);
        return false;
      }
    },

    moveRequest: async (id, coleccionId) => {
      const projectEid = get().eid;
      try {
        await invoke<void>('move_api_request', {
          payload: { id, coleccion_id: coleccionId },
        });
        set((state) => {
          if (state.lastSavedId !== id) return {};
          const next: DraftSource = { ...state, coleccionId };
          return {
            coleccionId,
            activeCollectionId: coleccionId,
            revision: state.revision + 1,
            currentRequest: buildPayload(next),
          };
        });
        const movida = get().savedRequests.find((item) => item._id === id);
        const destino = get().collections.find((item) => item._id === coleccionId);
        registrarCambio({
          eid: projectEid,
          accion: 'Movió request',
          entidad: 'request',
          entidadId: id,
          nombre: movida?.nombre ?? null,
          detalle: `A la colección "${destino?.nombre ?? coleccionId}"`,
        });
        notify.success('Request movida de colección');
        await get().refreshFromMongo({ silent: true });
        return true;
      } catch (error) {
        notify.error(`Error al mover: ${errorMessage(error)}`);
        return false;
      }
    },

    reorderRequests: async (coleccionId, orderedIds) => {
      if (orderedIds.length === 0) return true;

      const state = get();
      const orderById = new Map(
        orderedIds.map((id, index) => [id, index] as const),
      );
      const previous = state.savedRequests;

      // Optimista: el sidebar refleja el movimiento antes de ir a MongoDB.
      set({
        savedRequests: state.savedRequests.map((request) => {
          const index = orderById.get(request._id);
          if (index === undefined) return request;
          return { ...request, coleccion_id: coleccionId, orden: index };
        }),
      });

      try {
        await invoke<void>('reorder_api_requests', {
          payload: {
            eid: state.eid,
            coleccion_id: coleccionId,
            ids: orderedIds,
          },
        });
        // Actualizar el borrador solo al confirmar la escritura; si falla,
        // no queda apuntando a otra colección ni pierde ediciones recientes.
        set((current) => {
          if (current.eid !== state.eid || !current.lastSavedId || !orderById.has(current.lastSavedId)) return {};
          const next: DraftSource = { ...current, coleccionId };
          return {
            coleccionId,
            activeCollectionId: coleccionId,
            revision: current.revision + 1,
            currentRequest: buildPayload(next),
          };
        });
        await get().refreshFromMongo({ silent: true, background: true });
        return true;
      } catch (error) {
        set({ savedRequests: previous });
        notify.error('No se pudo mover la request', errorMessage(error));
        return false;
      }
    },

    // -----------------------------------------------------------------------
    // Colecciones
    // -----------------------------------------------------------------------

    createCollection: async (nombre, color, parentId = null) => {
      const trimmed = nombre.trim();
      if (!trimmed) {
        notify.error('El nombre de la colección no puede estar vacío');
        return null;
      }

      const eid = get().eid;
      set({ busyCollectionId: 'new' });
      try {
        const newId = await invoke<string>('save_api_collection', {
          payload: {
            eid,
            nombre: trimmed,
            color: color ?? DEFAULT_COLLECTION_COLOR,
            parent_id: parentId,
          },
        });
        set((state) => {
          if (state.lastSavedId) {
            return { busyCollectionId: null, activeCollectionId: newId };
          }
          const next: DraftSource = { ...state, coleccionId: newId };
          return {
            busyCollectionId: null,
            activeCollectionId: newId,
            coleccionId: newId,
            currentRequest: buildPayload(next),
          };
        });
        registrarCambio({
          eid,
          accion: 'Creó colección',
          entidad: 'collection',
          entidadId: newId,
          nombre: trimmed,
        });
        notify.success(`Colección "${trimmed}" creada`);
        await get().refreshFromMongo({ silent: true });
        return newId;
      } catch (error) {
        set({ busyCollectionId: null });
        notify.error(`Error al crear la colección: ${errorMessage(error)}`);
        return null;
      }
    },

    moveCollection: async (id, parentId, orderedIds) => {
      const state = get();
      const source = state.collections.find((item) => item._id === id);
      if (!source || !canMoveCollection(state.collections, id, parentId)) {
        notify.error('No se puede mover una colección dentro de sí misma o de sus subcolecciones');
        return false;
      }

      const parentChanged = (source.parent_id ?? null) !== parentId;
      const previous = state.collections;
      // Se normaliza el árbol completo antes de tocar la UI: el elemento queda
      // directamente en su posición definitiva (padre + orden), sin saltos.
      const nextCollections = applyCollectionLayout(
        state.collections,
        id,
        parentId,
        orderedIds,
      );
      const orderChanged = nextCollections.some((collection, index) => {
        const before = previous[index];
        return (
          !before ||
          collection._id !== before._id ||
          collection.orden !== before.orden
        );
      });
      if (!parentChanged && !orderChanged) return true;

      const nextOrderIds = nextCollections.map((collection) => collection._id);

      // Optimista: la jerarquía y el orden cambian en un único render. Se
      // invalidan las lecturas en vuelo para que ninguna revierta el orden.
      collectionMovePending += 1;
      ++syncSequence;
      set({ collections: nextCollections });

      try {
        if (parentChanged) {
          await invoke<void>('move_api_collection', {
            payload: { id, eid: state.eid, parent_id: parentId },
          });
        }
        if (orderChanged) {
          await invoke<void>('reorder_api_collections', {
            payload: { eid: state.eid, ids: nextOrderIds },
          });
        }
        if (parentChanged) {
          registrarCambio({
            eid: source.eid,
            accion: 'Movió colección', entidad: 'collection', entidadId: id, nombre: source.nombre,
            detalle: parentId ? `Dentro de "${state.collections.find((item) => item._id === parentId)?.nombre ?? parentId}"`
              : 'Convertida en colección principal',
          });
          notify.success(parentId ? 'Colección convertida en subcolección' : 'Ahora es una colección principal');
        }
        // Sin refresco inmediato: el estado local ya es el definitivo y el
        // siguiente sondeo sincroniza sin reordenar ni repintar el árbol.
        return true;
      } catch (error) {
        set((current) => current.eid === state.eid ? { collections: previous } : {});
        notify.error('No se pudo mover la colección', errorMessage(error));
        return false;
      } finally {
        collectionMovePending = Math.max(0, collectionMovePending - 1);
      }
    },

    renameCollection: async (id, nombre, color) => {
      const trimmed = nombre.trim();
      if (!trimmed) {
        notify.error('El nombre de la colección no puede estar vacío');
        return false;
      }

      const source = get().collections.find((item) => item._id === id);
      if (!source) {
        notify.error('No se encontró la colección');
        return false;
      }
      const nextColor = color?.trim() || source.color;
      const colorChanged = nextColor !== source.color;
      const nameChanged = trimmed !== source.nombre;
      if (!colorChanged && !nameChanged) return true;

      set({ busyCollectionId: id });
      try {
        await invoke<string>('save_api_collection', {
          payload: {
            id: source._id,
            eid: source.eid,
            nombre: trimmed,
            color: nextColor,
            orden: source.orden,
            parent_id: source.parent_id ?? null,
          },
        });
        // Refleja el cambio de inmediato, aunque la siguiente sincronización falle.
        set((current) => ({
          busyCollectionId: null,
          collections: current.collections.map((item) =>
            item._id === id ? { ...item, nombre: trimmed, color: nextColor } : item,
          ),
        }));
        registrarCambio({
          eid: source.eid,
          accion: 'Editó colección',
          entidad: 'collection',
          entidadId: id,
          nombre: trimmed,
          detalle: [
            nameChanged ? `Antes: ${source.nombre}` : null,
            colorChanged ? `Color: ${source.color} → ${nextColor}` : null,
          ].filter(Boolean).join(' · ') || undefined,
        });
        notify.success('Colección actualizada');
        await get().refreshFromMongo({ silent: true });
        return true;
      } catch (error) {
        set({ busyCollectionId: null });
        notify.error(`Error al editar la colección: ${errorMessage(error)}`);
        return false;
      }
    },

    deleteCollection: async (id) => {
      const subtreeIds = collectionSubtreeIds(get().collections, id);
      const target = get().collections.find((item) => item._id === id);
      if (!target) {
        notify.error('No se encontró la colección');
        return false;
      }

      set({ busyCollectionId: id });
      try {
        await invoke<void>('delete_api_collection', {
          payload: { id, delete_requests: true },
        });
        set((state) => {
          const wasDraftCollection = !!state.coleccionId && subtreeIds.has(state.coleccionId);
          const next: DraftSource = wasDraftCollection
            ? { ...state, coleccionId: null, lastSavedId: null, version: 1 }
            : { ...state, coleccionId: state.coleccionId };

          return {
            busyCollectionId: null,
            activeCollectionId:
              state.activeCollectionId && subtreeIds.has(state.activeCollectionId) ? null : state.activeCollectionId,
            ...(wasDraftCollection
              ? {
                  coleccionId: null,
                  lastSavedId: null,
                  version: 1,
                  isDirty: true,
                  revision: state.revision + 1,
                  currentRequest: buildPayload(next),
                }
              : {}),
          };
        });
        registrarCambio({
          eid: target.eid,
          accion: 'Eliminó colección',
          entidad: 'collection',
          entidadId: id,
          nombre: target.nombre,
          detalle: 'Con todas sus requests',
        });
        notify.success(`Colección "${target.nombre}" eliminada`);
        await get().refreshFromMongo({ silent: true });
        return true;
      } catch (error) {
        set({ busyCollectionId: null });
        notify.error(`Error al eliminar la colección: ${errorMessage(error)}`);
        return false;
      }
    },

    duplicateCollection: async (id) => {
      const target = get().collections.find((item) => item._id === id);
      if (!target) {
        notify.error('No se encontró la colección');
        return null;
      }

      set({ busyCollectionId: id });
      try {
        const newId = await invoke<string>('duplicate_api_collection', { id });
        set({ busyCollectionId: null });
        registrarCambio({
          eid: target.eid,
          accion: 'Duplicó colección',
          entidad: 'collection',
          entidadId: newId,
          nombre: target.nombre,
        });
        notify.success(`Colección "${target.nombre}" duplicada`);
        await get().refreshFromMongo({ silent: true });
        return newId;
      } catch (error) {
        set({ busyCollectionId: null });
        notify.error(`Error al duplicar la colección: ${errorMessage(error)}`);
        return null;
      }
    },

    reorderCollections: async (orderedIds) => {
      const state = get();
      const byId = new Map(
        state.collections.map((collection) => [collection._id, collection]),
      );

      // Solo aceptamos un orden que contenga exactamente las colecciones actuales.
      if (
        orderedIds.length !== state.collections.length ||
        orderedIds.some((id) => !byId.has(id))
      ) {
        return;
      }

      const previous = state.collections;
      const ordered = orderedIds.flatMap((id, index) => {
        const collection = byId.get(id);
        return collection ? [{ ...collection, orden: index }] : [];
      });

      // Optimista: el sidebar se reordena al soltar, sin esperar a MongoDB.
      set({ collections: ordered });

      try {
        await invoke<void>('reorder_api_collections', {
          payload: { eid: state.eid, ids: orderedIds },
        });
        await get().refreshFromMongo({ silent: true, background: true });
      } catch (error) {
        set({ collections: previous });
        notify.error(
          'No se pudo reordenar las colecciones',
          errorMessage(error),
        );
      }
    },

    // -----------------------------------------------------------------------
    // Proyectos
    // -----------------------------------------------------------------------

    refreshProyectos: async () => {
      try {
        let lista = await invoke<ApiProyecto[]>('listar_proyectos');

        // Primer arranque: el proyecto activo (VITE_RUBRI_EID) necesita su
        // ficha para aparecer en el selector. Solo se crea cuando no hay
        // ninguno: si un proyecto se borra, no debe resucitar aquí.
        if (lista.length === 0) {
          await invoke<string>('guardar_proyecto', {
            payload: {
              codigo: get().eid,
              nombre: 'Proyecto principal',
              descripcion: null,
              color: null,
            },
          });
          lista = await invoke<ApiProyecto[]>('listar_proyectos');
        }

        set({ proyectos: lista });
        return lista;
      } catch (error) {
        // Sin Tauri (vista web) o sin MongoDB: el selector queda vacío y la
        // app sigue funcionando con el proyecto por defecto.
        console.warn('No se pudieron cargar los proyectos', error);
        return [];
      }
    },

    crearProyecto: async (input) => {
      try {
        await invoke<string>('guardar_proyecto', {
          payload: {
            codigo: input.codigo,
            nombre: input.nombre,
            descripcion: input.descripcion ?? null,
            color: input.color ?? null,
          },
        });
        const codigo = input.codigo.trim().toUpperCase();
        registrarCambio({
          eid: input.codigo.trim().toUpperCase(),
          accion: 'Creó proyecto',
          entidad: 'proyecto',
          nombre: input.nombre,
          detalle: `Código ${codigo}`,
        });
        notify.success('Proyecto creado', `Código ${codigo}`);
        await get().refreshProyectos();
        return codigo;
      } catch (error) {
        notify.error('No se pudo crear el proyecto', errorMessage(error));
        return null;
      }
    },

    actualizarProyecto: async (id, input) => {
      try {
        const anterior = get().proyectos.find((proyecto) => proyecto._id === id);
        await invoke<string>('guardar_proyecto', {
          payload: {
            id,
            codigo: input.codigo,
            nombre: input.nombre,
            descripcion: input.descripcion ?? null,
            color: input.color ?? null,
          },
        });
        registrarCambio({
          eid: input.codigo.trim().toUpperCase(),
          accion: 'Actualizó proyecto',
          entidad: 'proyecto',
          entidadId: id,
          nombre: input.nombre,
          detalle: anterior
            ? `${anterior.codigo} → ${input.codigo.trim().toUpperCase()}`
            : null,
        });
        notify.success('Proyecto actualizado');

        // Si se editó el proyecto activo, el `eid` del borrador debe seguirlo.
        const codigoNuevo = input.codigo.trim().toUpperCase();
        if (
          anterior &&
          anterior.codigo === get().eid &&
          codigoNuevo !== anterior.codigo
        ) {
          guardarProyectoCodigo(codigoNuevo);
          set({ eid: codigoNuevo });
          get().newRequest();
        }

        await get().refreshProyectos();
        if (codigoNuevo === get().eid) {
          await get().refreshFromMongo({ silent: true });
        }
        return true;
      } catch (error) {
        notify.error('No se pudo actualizar el proyecto', errorMessage(error));
        return false;
      }
    },

    eliminarProyecto: async (id, cascada) => {
      try {
        const eliminado = get().proyectos.find((proyecto) => proyecto._id === id);
        await invoke<void>('eliminar_proyecto', {
          payload: { id, cascada },
        });
        registrarCambio({
          eid: eliminado?.codigo,
          accion: 'Eliminó proyecto',
          entidad: 'proyecto',
          entidadId: id,
          nombre: eliminado?.nombre ?? null,
          detalle: cascada ? 'Con todo su contenido' : 'Contenido conservado',
        });
        notify.success('Proyecto eliminado');

        const lista = await get().refreshProyectos();
        if (eliminado && eliminado.codigo === get().eid) {
          const siguiente = lista.find(
            (proyecto) => proyecto.codigo !== eliminado.codigo,
          );
          if (siguiente) await get().cambiarProyecto(siguiente.codigo);
        }
        return true;
      } catch (error) {
        notify.error('No se pudo eliminar el proyecto', errorMessage(error));
        return false;
      }
    },

    cambiarProyecto: async (codigo) => {
      if (!codigo || codigo === get().eid) return;

      guardarProyectoCodigo(codigo);
      ++syncSequence;
      const user = useAuthStore.getState().sesion?.usuario ?? '';
      workspaceOwner = JSON.stringify([user, codigo]);
      const cached = readCollectionCache(user, codigo);
      const firstId = cached[0]?._id ?? null;
      // Se limpia el workspace anterior para no mostrar datos mezclados
      // mientras llega la instantánea del proyecto nuevo.
      set({
        eid: codigo,
        collections: cached,
        isWorkspaceCached: cached.length > 0,
        savedRequests: [],
        coleccionId: firstId,
        activeCollectionId: firstId,
        isRefreshing: false,
        lastSyncAt: null,
        lastError: null,
        lastSavedId: null,
      });
      get().newRequest({ coleccionId: firstId });
      await get().refreshFromMongo({ silent: true });
    },

    // -----------------------------------------------------------------------
    // Utilidades
    // -----------------------------------------------------------------------

    markDirty: () => set({ isDirty: true }),
    resetDirty: () => set({ isDirty: false }),
    clearSavedId: () => set({ lastSavedId: null, version: 1 }),
  };
});

// Estado inicial coherente para consumidores que lean `currentRequest`.
useApiStore.setState((state) => ({
  currentRequest: buildPayload({
    ...state,
    lastSavedId: null,
  }),
}));

const unsubscribeCollectionCache = useApiStore.subscribe((state, previous) => {
  if (state.collections !== previous.collections && !state.isWorkspaceCached && state.lastSyncAt !== null) {
    writeCollectionCache(useAuthStore.getState().sesion?.usuario ?? '', state.eid, state.collections);
  }
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribeCollectionCache);

export default useApiStore;
