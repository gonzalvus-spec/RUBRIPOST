/** Calcula la inserción sin modificar la lista, incluso entre colecciones. */
export const requestDropOrder = (
  currentIds: string[],
  sourceId: string,
  targetId: string | null,
  after: boolean,
): string[] => {
  if (sourceId === targetId) return [...currentIds];
  const next = currentIds.filter((id) => id !== sourceId);
  const targetIndex = targetId ? next.indexOf(targetId) : -1;
  const insertAt = targetIndex < 0 ? next.length : targetIndex + (after ? 1 : 0);
  next.splice(insertAt, 0, sourceId);
  return next;
};

/** Copia ordenada; los documentos antiguos sin `orden` conservan su posición relativa. */
export const sortRequestsByOrder = <T extends { orden?: number }>(requests: T[]): T[] =>
  [...requests].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

/** No resalta la carpeta de origen ni sus carpetas padre al mover una petición. */
export const shouldHighlightCollectionDrop = (
  sourceId: string,
  targetId: string,
  sourceAncestors: string[],
): boolean => sourceId !== targetId && !sourceAncestors.includes(targetId);
