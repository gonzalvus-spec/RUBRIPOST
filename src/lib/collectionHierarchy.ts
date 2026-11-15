import type { ApiCollection } from '../store/apiStore';

/** Una carpeta con subcolecciones nunca se considera vacía. */
export const collectionHasChildren = (collections: ApiCollection[], id: string): boolean =>
  collections.some((collection) => collection.parent_id === id);

/** Vacía = sin requests directas y sin subcolecciones. */
export const isCollectionEmpty = (
  collections: ApiCollection[],
  requests: { coleccion_id: string | null }[],
  id: string,
): boolean =>
  !collectionHasChildren(collections, id) &&
  !requests.some((request) => request.coleccion_id === id);

export const collectionSubtreeIds = (collections: ApiCollection[], id: string): Set<string> => {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const collection of collections) {
      if (collection.parent_id && ids.has(collection.parent_id) && !ids.has(collection._id)) {
        ids.add(collection._id);
        changed = true;
      }
    }
  }
  return ids;
};

export const canMoveCollection = (collections: ApiCollection[], id: string, parentId: string | null): boolean => {
  const source = collections.find((item) => item._id === id);
  if (!source) return false;
  if (!parentId) return true;
  const parent = collections.find((item) => item._id === parentId);
  return !!parent && parent.eid === source.eid && !collectionSubtreeIds(collections, id).has(parentId);
};

export type CollectionDropPosition = 'before' | 'inside' | 'after';

export const collectionDropPosition = (y: number, top: number, height: number): CollectionDropPosition => {
  if (y < top + height * 0.25) return 'before';
  if (y > top + height * 0.75) return 'after';
  return 'inside';
};

/** Planea jerarquía y orden juntos, sin mutar el árbol ni permitir ciclos. */
export const planCollectionDrop = (
  collections: ApiCollection[], sourceId: string, targetId: string | null, position: CollectionDropPosition,
): { parentId: string | null; orderedIds: string[] } | null => {
  const source = collections.find((item) => item._id === sourceId);
  const target = targetId ? collections.find((item) => item._id === targetId) : undefined;
  if (!source || sourceId === targetId || (targetId !== null && !target) || (target && target.eid !== source.eid)) return null;
  const parentId = target ? position === 'inside' ? target._id : target.parent_id ?? null : null;
  if (!canMoveCollection(collections, sourceId, parentId)) return null;
  const ordered = [...collections].sort((a, b) => a.orden - b.orden);
  const next = ordered.filter((item) => item._id !== sourceId).map((item) => item._id);
  let insertAt: number;
  if (target && position !== 'inside') {
    insertAt = next.indexOf(target._id) + (position === 'after' ? 1 : 0);
  } else {
    const siblings = ordered.filter((item) => item._id !== sourceId && (item.parent_id ?? null) === parentId);
    const last = siblings[siblings.length - 1];
    insertAt = last ? next.indexOf(last._id) + 1 : next.length;
  }
  next.splice(insertAt, 0, sourceId);
  return { parentId, orderedIds: next };
};

/** True cuando el orden planeado difiere del que ya muestra el sidebar. */
export const collectionOrderChanged = (
  collections: ApiCollection[],
  orderedIds: string[],
): boolean => orderedIds.some((id, index) => id !== collections[index]?._id);

/**
 * Aplica en una sola pasada el nuevo padre y el nuevo orden. Devuelve el árbol
 * ya normalizado en profundidad (padre antes que sus hijos) y con `orden`
 * secuencial, de modo que la UI optimista y MongoDB coincidan desde el primer
 * render y no haya saltos posteriores al refrescar.
 */
export const applyCollectionLayout = (
  collections: ApiCollection[],
  id: string,
  parentId: string | null,
  orderedIds?: string[],
): ApiCollection[] => {
  const byId = new Map(collections.map((collection) => [collection._id, collection]));
  const hasValidOrder =
    !!orderedIds &&
    orderedIds.length === collections.length &&
    orderedIds.every((collectionId) => byId.has(collectionId));

  const rank = new Map<string, number>();
  if (hasValidOrder) {
    orderedIds!.forEach((collectionId, index) => rank.set(collectionId, index));
  }

  const updated = collections.map((collection) =>
    collection._id === id ? { ...collection, parent_id: parentId } : collection,
  );

  const sorted = [...updated].sort((a, b) => {
    const rankA = rank.get(a._id);
    const rankB = rank.get(b._id);
    if (rankA !== undefined || rankB !== undefined) {
      if (rankA === undefined) return 1;
      if (rankB === undefined) return -1;
      if (rankA !== rankB) return rankA - rankB;
    }
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a._id.localeCompare(b._id);
  });

  const existing = new Set(updated.map((collection) => collection._id));
  const children = new Map<string | null, ApiCollection[]>();
  for (const collection of sorted) {
    const parent =
      collection.parent_id && existing.has(collection.parent_id)
        ? collection.parent_id
        : null;
    const bucket = children.get(parent);
    if (bucket) bucket.push(collection);
    else children.set(parent, [collection]);
  }

  const ordered: ApiCollection[] = [];
  const visited = new Set<string>();
  const visit = (collection: ApiCollection) => {
    if (visited.has(collection._id)) return;
    visited.add(collection._id);
    ordered.push({ ...collection, orden: ordered.length });
    for (const child of children.get(collection._id) ?? []) visit(child);
  };

  for (const root of children.get(null) ?? []) visit(root);
  // Ciclos u otros casos corruptos: se conservan una sola vez.
  for (const collection of sorted) visit(collection);

  return ordered;
};
