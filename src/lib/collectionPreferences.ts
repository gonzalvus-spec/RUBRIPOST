export const collectionPreferenceKey = (user: string, eid: string): string =>
  `rubri.collections.closed.${encodeURIComponent(JSON.stringify([user.trim().toLowerCase(), eid]))}`;

export const readClosedCollections = (user: string, eid: string): string[] => {
  if (!user || !eid) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(collectionPreferenceKey(user, eid)) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id))] : [];
  } catch { return []; }
};

export const writeClosedCollections = (user: string, eid: string, ids: string[]): void => {
  if (!user || !eid) return;
  try { localStorage.setItem(collectionPreferenceKey(user, eid), JSON.stringify([...new Set(ids)])); }
  catch { /* Se mantiene el estado en memoria si no hay almacenamiento local. */ }
};
