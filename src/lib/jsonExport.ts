import type { ApiCollection, ApiRequestDocument, ApiWorkspace } from '../store/apiStore';

export interface ExportedCollection extends ApiCollection {
  requests: ApiRequestDocument[];
  collections: ExportedCollection[];
}

const sensitiveHeader = /^(authorization|proxy-authorization|cookie|set-cookie|.*api[-_]?key.*|.*token.*|.*secret.*)$/i;

export const buildCollectionExport = (
  workspace: ApiWorkspace,
  eid: string,
  includeCredentials = false,
) => {
  const nodes = new Map<string, ExportedCollection>();
  for (const collection of workspace.collections) {
    nodes.set(collection._id, { ...collection, requests: [], collections: [] });
  }
  for (const request of workspace.requests) {
    const node = request.coleccion_id ? nodes.get(request.coleccion_id) : undefined;
    if (!node) continue;
    node.requests.push(includeCredentials ? { ...request } : {
      ...request,
      auth: null,
      headers: request.headers
        ? Object.fromEntries(Object.entries(request.headers).filter(([key]) => !sensitiveHeader.test(key)))
        : null,
    });
  }
  const roots: ExportedCollection[] = [];
  for (const node of nodes.values()) {
    const seen = new Set([node._id]);
    let ancestor = node.parent_id ? nodes.get(node.parent_id) : undefined;
    let cyclic = false;
    while (ancestor) {
      if (seen.has(ancestor._id)) { cyclic = true; break; }
      seen.add(ancestor._id);
      ancestor = ancestor.parent_id ? nodes.get(ancestor.parent_id) : undefined;
    }
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent && !cyclic) parent.collections.push(node);
    else { node.parent_id = null; roots.push(node); }
  }
  const sort = (items: ExportedCollection[]) => {
    items.sort((a, b) => a.orden - b.orden);
    for (const item of items) {
      item.requests.sort((a, b) => a.orden - b.orden);
      sort(item.collections);
    }
  };
  sort(roots);
  return {
    format: 'rubripost',
    format_version: 1,
    exported_at: new Date().toISOString(),
    project: eid,
    credentials_included: includeCredentials,
    collections: roots,
  };
};

/** Devuelve false si el usuario cancela Guardar como; propaga errores de escritura. */
export const downloadJson = async (value: unknown, filename: string): Promise<boolean> => {
  const contents = JSON.stringify(value, null, 2);
  if (contents === undefined) throw new Error('No hay datos JSON para exportar');
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('save_export_json', { filename: safeFilename, contents });
    return path !== null;
  }
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};
