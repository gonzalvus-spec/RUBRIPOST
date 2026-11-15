import type { ApiCollection, ApiRequestDocument } from '../store/apiStore';

export interface OverviewCollectionRow {
  collection: ApiCollection;
  depth: number;
  /** Requests guardadas directamente en esta carpeta. */
  directRequests: number;
  /** Requests de la carpeta y de todas sus subcolecciones. */
  totalRequests: number;
  /** Subcolecciones directas. */
  childCount: number;
}

export interface WorkspaceOverviewStats {
  collections: number;
  rootCollections: number;
  subcollections: number;
  requests: number;
  environments: number;
}

const byOrder = (a: ApiCollection, b: ApiCollection): number =>
  a.orden - b.orden || a.nombre.localeCompare(b.nombre);

/**
 * Filas del listado de colecciones del Overview, respetando la jerarquía y el
 * orden guardado. Nunca repite una carpeta aunque los datos traigan un ciclo.
 */
export const overviewCollectionRows = (
  collections: ApiCollection[],
  requests: ApiRequestDocument[],
): OverviewCollectionRow[] => {
  const present = new Set(collections.map((collection) => collection._id));
  const direct = new Map<string, number>();
  for (const request of requests) {
    if (request.coleccion_id) {
      direct.set(request.coleccion_id, (direct.get(request.coleccion_id) ?? 0) + 1);
    }
  }

  const children = new Map<string, ApiCollection[]>();
  for (const collection of collections) {
    const parent = collection.parent_id && present.has(collection.parent_id)
      ? collection.parent_id
      : '';
    const siblings = children.get(parent);
    if (siblings) siblings.push(collection);
    else children.set(parent, [collection]);
  }
  for (const siblings of children.values()) siblings.sort(byOrder);

  const subtreeRequestTotal = (id: string): number => {
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
    return requests.filter((request) => !!request.coleccion_id && ids.has(request.coleccion_id)).length;
  };

  const rows: OverviewCollectionRow[] = [];
  const added = new Set<string>();

  const walk = (parent: string, depth: number) => {
    for (const collection of children.get(parent) ?? []) {
      if (added.has(collection._id)) continue;
      added.add(collection._id);
      rows.push({
        collection,
        depth,
        directRequests: direct.get(collection._id) ?? 0,
        totalRequests: subtreeRequestTotal(collection._id),
        childCount: (children.get(collection._id) ?? []).length,
      });
      walk(collection._id, depth + 1);
    }
  };

  walk('', 0);

  // Carpetas con un padre inexistente o ciclos: se muestran igualmente, una sola vez.
  for (const collection of [...collections].sort(byOrder)) {
    if (added.has(collection._id)) continue;
    added.add(collection._id);
    rows.push({
      collection,
      depth: 0,
      directRequests: direct.get(collection._id) ?? 0,
      totalRequests: subtreeRequestTotal(collection._id),
      childCount: (children.get(collection._id) ?? []).length,
    });
    walk(collection._id, 1);
  }

  return rows;
};

export const workspaceOverviewStats = (
  collections: ApiCollection[],
  requests: ApiRequestDocument[],
): WorkspaceOverviewStats => {
  const rows = overviewCollectionRows(collections, requests);
  const rootCollections = rows.filter((row) => row.depth === 0).length;
  return {
    collections: collections.length,
    rootCollections,
    subcollections: Math.max(0, collections.length - rootCollections),
    requests: requests.length,
    environments: 0,
  };
};
