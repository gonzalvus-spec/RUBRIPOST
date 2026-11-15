export interface HistorialEntrada {
  eid?: string | null;
  usuario: string;
  accion: string;
  entidad: string;
  entidad_id?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  fecha: string;
}

export interface HistoryFilters { search: string; user: string; entity: string; days: number; }

export const historyTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  const hours = date.getHours();
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'a. m.' : 'p. m.'}`;
};

export const filterHistory = (entries: HistorialEntrada[], filters: HistoryFilters, now = Date.now()): HistorialEntrada[] => {
  const term = filters.search.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filters.user && entry.usuario !== filters.user) return false;
    if (filters.entity && entry.entidad !== filters.entity) return false;
    if (filters.days && !(new Date(entry.fecha).getTime() >= now - filters.days * 86_400_000)) return false;
    return !term || [entry.usuario, entry.accion, entry.nombre, entry.detalle, entry.entidad]
      .some((value) => value?.toLocaleLowerCase().includes(term));
  }).sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
};

export const historyTone = (action: string): 'created' | 'deleted' | 'updated' => {
  const value = action.toLocaleLowerCase();
  if (value.includes('elimin') || value.includes('cerró')) return 'deleted';
  if (value.includes('creó') || value.includes('duplic') || value.includes('inició')) return 'created';
  return 'updated';
};
