import { DEFAULT_COLLECTION_COLOR, type HttpMethod } from '../../store/apiStore';
import type { ModalMode, NameModalState, ResponseLanguage } from './types';

/** Token opcional que se puede precargar desde el .env. */
export const ENV_TOKEN = import.meta.env.VITE_RUBRI_TOKEN?.trim() ?? '';

export const CLOSED_MODAL: NameModalState = {
  open: false,
  mode: 'save',
  value: '',
  targetId: null,
  color: DEFAULT_COLLECTION_COLOR,
};

/** Clase de color del design system según el método HTTP. */
export const methodClass = (method: string): string => `method-${method.toLowerCase()}`;

export const METHOD_OPTIONS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

/**
 * Clave de la request aún no guardada. Junto al método forma la clave con la
 * que se guarda su respuesta en el panel de response.
 */
export const DRAFT_RESPONSE_KEY = '__draft__';

/** Cada cuánto se consulta MongoDB para reflejar cambios de otras PCs. */
export const SYNC_INTERVAL_MS = 5000;

export const getResponseLanguage = (content: string): ResponseLanguage => {
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('//')) return 'plaintext';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (
    trimmed.startsWith('<?xml') ||
    (trimmed.startsWith('<') && trimmed.endsWith('>'))
  )
    return 'xml';
  return 'plaintext';
};

export const suggestName = (nombre: string, url: string): string => {
  if (nombre.trim()) return nombre.trim();
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last ? last.replace(/[-_]/g, ' ') : parsed.hostname;
  } catch {
    return 'Nueva request';
  }
};

/** Textos del modal según el modo activo. */
export const modalCopy = (mode: ModalMode) => {
  const isCollection = mode === 'collectionCreate' || mode === 'collectionRename';

  return {
    isCollectionModal: isCollection,
    title:
      mode === 'rename'
        ? 'Renombrar request'
        : mode === 'collectionCreate'
          ? 'Nueva colección'
          : mode === 'collectionRename'
            ? 'Renombrar colección'
            : 'Guardar request',
    label: isCollection ? 'Nombre de la colección' : 'Nombre de la request',
    placeholder: isCollection
      ? 'Ej. Facturación SUNAT'
      : 'Ej. Buscar XML Factura 1300',
  };
};
