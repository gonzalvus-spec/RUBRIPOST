import type { ApiCollection } from '../store/apiStore';

const key = (user: string, eid: string): string =>
  `rubri.collections.cache.v1.${encodeURIComponent(JSON.stringify([user.trim().toLowerCase(), eid]))}`;

/** Solo metadatos de carpetas: nunca bodies, tokens, cookies o headers. */
const metadata = (collection: ApiCollection): ApiCollection => ({
  _id: collection._id, eid: collection.eid, nombre: collection.nombre,
  parent_id: collection.parent_id ?? null, color: collection.color, orden: collection.orden,
  timestamp: collection.timestamp, updated_at: collection.updated_at,
});

export const readCollectionCache = (user: string, eid: string): ApiCollection[] => {
  if (!user || !eid) return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(user, eid)) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return [];
    const cache = raw as { version?: unknown; collections?: unknown };
    if (cache.version !== 1 || !Array.isArray(cache.collections)) return [];
    const valid = cache.collections.every((item) => item && typeof item === 'object' &&
      typeof item._id === 'string' && !!item._id && item.eid === eid && typeof item.nombre === 'string' &&
      typeof item.color === 'string' && typeof item.orden === 'number' && Number.isFinite(item.orden) &&
      typeof item.timestamp === 'string' && typeof item.updated_at === 'string' &&
      (item.parent_id == null || typeof item.parent_id === 'string'));
    return valid ? cache.collections.map((item: ApiCollection) => metadata(item)) : [];
  } catch { return []; }
};

export const writeCollectionCache = (user: string, eid: string, collections: ApiCollection[]): void => {
  if (!user || !eid || collections.some((item) => item.eid !== eid)) return;
  try {
    const value = JSON.stringify({ version: 1, collections: collections.map(metadata) });
    if (localStorage.getItem(key(user, eid)) !== value) localStorage.setItem(key(user, eid), value);
  } catch { /* Sin caché se sigue cargando normalmente desde MongoDB. */ }
};
