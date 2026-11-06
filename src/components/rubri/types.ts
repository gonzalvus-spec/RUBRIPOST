import type { ResponseLanguage } from '../common/ResponseViewer';

export type TabId = 'params' | 'body' | 'auth' | 'headers';

export type ModalMode = 'save' | 'rename' | 'collectionCreate' | 'collectionRename';

export interface NameModalState {
  open: boolean;
  mode: ModalMode;
  value: string;
  targetId: string | null;
  color: string;
}

export interface ResponseStatus {
  code: number;
  text: string;
}

/** Respuesta guardada para una combinación request + método. */
export interface ResponseEntry {
  body: string;
  status: ResponseStatus | null;
}

export type ResponseViewState = 'collapsed' | 'normal' | 'maximized';

export interface DraggingRequest {
  id: string;
  nombre: string;
  metodo: string;
  fromCollectionId: string;
}

export interface CollectionDropTarget {
  id: string;
  after: boolean;
}

export interface RequestDropTarget {
  collectionId: string;
  requestId: string | null;
  after: boolean;
}

export type { ResponseLanguage };
