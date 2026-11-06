import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash,
  X,
} from 'lucide-react';

import rubriLogo from '../../../assets/rubrifact-logo.png';
import {
  formatTimestamp,
  groupRequestsByCollection,
  useApiStore,
  type ApiCollection,
  type ApiRequestDocument,
} from '../../../store/apiStore';
import { methodClass } from '../constants';
import type { CollectionDropTarget, DraggingRequest, RequestDropTarget } from '../types';
import './RubriSidebar.css';

interface RubriSidebarProps {
  collapsed: boolean;
  width: number;
  resizing: boolean;
  lastSavedId: string | null;
  isDirty: boolean;
  onNewRequestIn: (collectionId: string) => void;
  onLoadRequest: (request: ApiRequestDocument) => void;
  onRenameRequest: (request: ApiRequestDocument) => void;
  onDuplicateRequest: (request: ApiRequestDocument) => void;
  onDeleteRequest: (request: ApiRequestDocument) => void;
  onCreateCollection: () => void;
  onRenameCollection: (collection: ApiCollection) => void;
  onDuplicateCollection: (collectionId: string) => void;
  onDeleteCollection: (collection: ApiCollection) => void;
}

export const RubriSidebar = ({
  collapsed,
  width,
  resizing,
  lastSavedId,
  isDirty,
  onNewRequestIn,
  onLoadRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  onCreateCollection,
  onRenameCollection,
  onDuplicateCollection,
  onDeleteCollection,
}: RubriSidebarProps) => {
  const collections = useApiStore((state) => state.collections);
  const savedRequests = useApiStore((state) => state.savedRequests);
  const activeCollectionId = useApiStore((state) => state.activeCollectionId);
  const busyCollectionId = useApiStore((state) => state.busyCollectionId);
  const isRefreshing = useApiStore((state) => state.isRefreshing);
  const deletingId = useApiStore((state) => state.deletingId);
  const setActiveCollection = useApiStore((state) => state.setActiveCollection);
  const refreshFromMongo = useApiStore((state) => state.refreshFromMongo);
  const reorderCollections = useApiStore((state) => state.reorderCollections);
  const reorderRequests = useApiStore((state) => state.reorderRequests);

  const [search, setSearch] = useState('');
  const [collapsedCollections, setCollapsedCollections] = useState<string[]>([]);
  /** Colección que se está arrastrando y punto de inserción resaltado. */
  const [draggingCollectionId, setDraggingCollectionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CollectionDropTarget | null>(null);
  /** Request que se está arrastrando (para feedback visual). */
  const [draggingRequest, setDraggingRequest] = useState<DraggingRequest | null>(null);
  /** Colección y posición donde caerá la request arrastrada. */
  const [requestDropTarget, setRequestDropTarget] = useState<RequestDropTarget | null>(null);

  const matchesSearch = (request: ApiRequestDocument): boolean => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      request.nombre.toLowerCase().includes(term) ||
      request.url.toLowerCase().includes(term) ||
      request.metodo.toLowerCase().includes(term) ||
      request.contexto.toLowerCase().includes(term)
    );
  };

  const groups = useMemo(
    () => groupRequestsByCollection(collections, savedRequests),
    [collections, savedRequests],
  );
  const totalVisible = savedRequests.filter(matchesSearch).length;

  const toggleCollection = (collectionId: string) =>
    setCollapsedCollections((current) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId],
    );

  // --- Drag & drop para reordenar colecciones (estilo Postman) -------------

  const handleCollectionDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    collection: ApiCollection,
  ) => {
    setDraggingCollectionId(collection._id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', collection._id);
  };

  const handleCollectionDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    collection: ApiCollection,
  ) => {
    if (!draggingCollectionId || draggingCollectionId === collection._id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropTarget((current) =>
      current?.id === collection._id && current.after === after
        ? current
        : { id: collection._id, after },
    );
  };

  const handleCollectionDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    event.preventDefault();
    const sourceId = draggingCollectionId;
    const after = dropTarget?.after ?? false;
    setDraggingCollectionId(null);
    setDropTarget(null);
    if (!sourceId || sourceId === targetId) return;

    const ids = collections.map((collection) => collection._id);
    if (!ids.includes(sourceId) || !ids.includes(targetId)) return;

    const next = ids.filter((id) => id !== sourceId);
    const insertAt = next.indexOf(targetId) + (after ? 1 : 0);
    next.splice(insertAt, 0, sourceId);

    if (next.every((id, index) => id === ids[index])) return;
    void reorderCollections(next);
  };

  const endCollectionDrag = () => {
    setDraggingCollectionId(null);
    setDropTarget(null);
  };

  // --- Drag & drop de requests entre colecciones (estilo Postman) ----------

  const handleRequestDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    request: ApiRequestDocument,
    collectionId: string,
  ) => {
    event.stopPropagation();
    setDraggingRequest({
      id: request._id,
      nombre: request.nombre,
      metodo: request.metodo,
      fromCollectionId: collectionId,
    });
    setRequestDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', request._id);

    // Tarjeta flotante para saber qué request se está moviendo.
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    const method = document.createElement('span');
    method.className = `drag-ghost-method ${methodClass(request.metodo)}`;
    method.textContent = request.metodo;
    const name = document.createElement('span');
    name.className = 'drag-ghost-name';
    name.textContent = request.nombre;
    ghost.append(method, name);
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 18, 18);
    window.setTimeout(() => ghost.remove(), 0);
  };

  const handleRequestDragOverRow = (
    event: React.DragEvent<HTMLDivElement>,
    collectionId: string,
    requestId: string,
  ) => {
    if (!draggingRequest || draggingRequest.id === requestId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setRequestDropTarget((current) =>
      current?.collectionId === collectionId &&
      current.requestId === requestId &&
      current.after === after
        ? current
        : { collectionId, requestId, after },
    );
  };

  const handleRequestDragOverCollection = (
    event: React.DragEvent<HTMLDivElement>,
    collectionId: string,
  ) => {
    if (!draggingRequest) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setRequestDropTarget((current) =>
      current?.collectionId === collectionId && current.requestId === null
        ? current
        : { collectionId, requestId: null, after: false },
    );
    // Al pasar por una colección contraída, se abre para mostrar el destino.
    if (collectionId) {
      setCollapsedCollections((current) =>
        current.includes(collectionId)
          ? current.filter((id) => id !== collectionId)
          : current,
      );
    }
  };

  const handleRequestDrop = (
    event: React.DragEvent<HTMLDivElement>,
    collectionId: string,
    requestId: string | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const source = draggingRequest;
    const target = requestDropTarget;
    const after =
      target?.collectionId === collectionId && target.requestId === requestId
        ? target.after
        : false;

    setDraggingRequest(null);
    setRequestDropTarget(null);
    if (!source || source.id === requestId) return;

    const group = groups.find((entry) => entry.collection._id === collectionId);
    const currentIds = (group?.requests ?? []).map((request) => request._id);
    const nextIds = currentIds.filter((id) => id !== source.id);

    let insertAt = nextIds.length;
    if (requestId) {
      const index = nextIds.indexOf(requestId);
      if (index >= 0) insertAt = index + (after ? 1 : 0);
    }
    nextIds.splice(insertAt, 0, source.id);

    if (nextIds.join('|') === currentIds.join('|')) return;

    void reorderRequests(collectionId === '' ? null : collectionId, nextIds);
  };

  const endRequestDrag = () => {
    setDraggingRequest(null);
    setRequestDropTarget(null);
  };

  return (
    <aside
      className={clsx('rubri-sidebar', { collapsed, resizing })}
      style={{ width: collapsed ? 62 : width }}
    >
      <div className="sidebar-toolbar">
        {!collapsed ? (
          <div className="sidebar-search">
            <Search size={13} />
            <input
              type="search"
              value={search}
              placeholder="Buscar request..."
              aria-label="Buscar request"
              title="Filtrar por nombre, método, contexto o URL"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="icon-btn tiny"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="icon-btn"
            onClick={onCreateCollection}
            aria-label="Nueva colección"
            title="Nueva colección"
          >
            <FolderPlus size={15} />
          </button>
        )}
      </div>

      <div className="sidebar-scroll">
        {/* Colecciones */}
        <section className="sidebar-section grow">
          <div className="side-title">
            <span>COLECCIONES</span>

            {!collapsed && (
              <div className="side-title-actions">
                <button
                  type="button"
                  className="icon-btn tiny"
                  onClick={() => void refreshFromMongo()}
                  aria-label="Refrescar workspace"
                  title="Refrescar (Ctrl+R)"
                >
                  {isRefreshing ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn tiny"
                  onClick={onCreateCollection}
                  aria-label="Nueva colección"
                  title="Nueva colección"
                >
                  <FolderPlus size={12} />
                </button>
              </div>
            )}
          </div>

          {collapsed ? (
            <div className="collapsed-collections">
              {collections.map((collection) => (
                <button
                  type="button"
                  key={collection._id}
                  className={clsx('collapsed-dot', {
                    active: activeCollectionId === collection._id,
                  })}
                  style={{ background: collection.color }}
                  onClick={() => setActiveCollection(collection._id)}
                  aria-label={`Seleccionar colección ${collection.nombre}`}
                  title={collection.nombre}
                />
              ))}
            </div>
          ) : (
            <div className="collection-tree">
              {groups.length === 0 ? (
                <div className="sidebar-empty">
                  <FolderPlus size={20} />
                  <p>
                    {isRefreshing ? 'Cargando workspace...' : 'Aún no hay colecciones'}
                  </p>
                  {!isRefreshing && (
                    <button
                      type="button"
                      className="btn btn-secondary compact"
                      onClick={onCreateCollection}
                      aria-label="Crear primera colección"
                      title="Crear primera colección"
                    >
                      <Plus size={13} />
                      Crear colección
                    </button>
                  )}
                </div>
              ) : (
                groups
                  .filter(
                    ({ requests }) => !search.trim() || requests.some(matchesSearch),
                  )
                  .map(({ collection, requests }) => {
                    const isOrphan = collection._id === '';
                    const isCollapsed = collapsedCollections.includes(collection._id);
                    const isActive = activeCollectionId === collection._id && !isOrphan;
                    const visible = requests.filter(matchesSearch);
                    const busy = busyCollectionId === collection._id;

                    return (
                      <div key={collection._id || 'orphans'} className={clsx('coll-group', { busy })}>
                        <div
                          className={clsx('coll-row', {
                            active: isActive,
                            dragging: draggingCollectionId === collection._id,
                            'request-drop-target':
                              !!draggingRequest &&
                              requestDropTarget?.collectionId === collection._id &&
                              requestDropTarget.requestId === null,
                            'drop-before':
                              dropTarget?.id === collection._id && !dropTarget.after,
                            'drop-after':
                              dropTarget?.id === collection._id && dropTarget.after,
                          })}
                          draggable={!isOrphan}
                          onDragStart={(event) => handleCollectionDragStart(event, collection)}
                          onDragOver={(event) => {
                            handleCollectionDragOver(event, collection);
                            handleRequestDragOverCollection(event, collection._id);
                          }}
                          onDrop={(event) => {
                            if (draggingRequest) {
                              handleRequestDrop(event, collection._id, null);
                            } else {
                              handleCollectionDrop(event, collection._id);
                            }
                          }}
                          onDragEnd={endCollectionDrag}
                          title={
                            isOrphan ? undefined : 'Arrastra para reordenar la colección'
                          }
                        >
                          <button
                            type="button"
                            className="coll-toggle"
                            onClick={() => {
                              toggleCollection(collection._id);
                              if (!isOrphan) setActiveCollection(collection._id);
                            }}
                            aria-expanded={!isCollapsed}
                            aria-label={`Mostrar u ocultar ${collection.nombre}`}
                            title={`${collection.nombre} · ${requests.length} request(s)`}
                          >
                            {isCollapsed ? (
                              <ChevronRight size={11} />
                            ) : (
                              <ChevronDown size={11} />
                            )}
                            <Folder
                              size={13}
                              className="coll-icon"
                              style={{ color: collection.color }}
                            />
                            <span className="coll-name">
                              {collection.nombre}{' '}
                              <span className="coll-count">({requests.length})</span>
                            </span>
                          </button>

                          {!isOrphan && (
                            <div className="coll-actions">
                              <button
                                type="button"
                                className="icon-btn tiny"
                                onClick={() => onNewRequestIn(collection._id)}
                                aria-label={`Nueva request en ${collection.nombre}`}
                                title="Nueva request en esta colección"
                              >
                                <Plus size={12} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn tiny"
                                onClick={() => onRenameCollection(collection)}
                                aria-label={`Renombrar colección ${collection.nombre}`}
                                title="Renombrar colección"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn tiny"
                                onClick={() => onDuplicateCollection(collection._id)}
                                aria-label={`Duplicar colección ${collection.nombre}`}
                                title="Duplicar colección"
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn tiny danger"
                                onClick={() => onDeleteCollection(collection)}
                                aria-label={`Eliminar colección ${collection.nombre}`}
                                title="Eliminar colección"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          )}

                          {draggingRequest &&
                            requestDropTarget?.collectionId === collection._id &&
                            requestDropTarget.requestId === null && (
                              <span className="drop-hint">
                                {isOrphan
                                  ? 'Quitar de la colección'
                                  : `Mover a ${collection.nombre}`}
                              </span>
                            )}
                        </div>

                        {!isCollapsed && (
                          <div
                            className="req-list"
                            onDragOver={(event) => {
                              if (!draggingRequest) return;
                              event.preventDefault();
                              setRequestDropTarget((current) =>
                                current?.collectionId === collection._id &&
                                current.requestId === null
                                  ? current
                                  : { collectionId: collection._id, requestId: null, after: false },
                              );
                            }}
                            onDrop={(event) => handleRequestDrop(event, collection._id, null)}
                          >
                            {visible.length === 0 ? (
                              <p className="empty-state small">
                                {search ? 'Sin coincidencias' : 'Colección vacía'}
                              </p>
                            ) : (
                              visible.map((request) => {
                                const isCurrent = lastSavedId === request._id;
                                return (
                                  <div
                                    key={request._id}
                                    className={clsx('req-row', {
                                      active: isCurrent,
                                      deleting: deletingId === request._id,
                                      dragging: draggingRequest?.id === request._id,
                                      'drop-before':
                                        requestDropTarget?.collectionId === collection._id &&
                                        requestDropTarget.requestId === request._id &&
                                        !requestDropTarget.after,
                                      'drop-after':
                                        requestDropTarget?.collectionId === collection._id &&
                                        requestDropTarget.requestId === request._id &&
                                        requestDropTarget.after,
                                    })}
                                    draggable
                                    onDragStart={(event) =>
                                      handleRequestDragStart(event, request, collection._id)
                                    }
                                    onDragOver={(event) =>
                                      handleRequestDragOverRow(event, collection._id, request._id)
                                    }
                                    onDrop={(event) =>
                                      handleRequestDrop(event, collection._id, request._id)
                                    }
                                    onDragEnd={endRequestDrag}
                                  >
                                    <button
                                      type="button"
                                      className="req-main"
                                      onClick={() => onLoadRequest(request)}
                                      title={`${request.url}\nActualizada: ${formatTimestamp(request.updated_at)}`}
                                      aria-label={`Abrir ${request.nombre}`}
                                    >
                                      <span
                                        className={clsx('req-method', methodClass(request.metodo))}
                                      >
                                        {request.metodo}
                                      </span>
                                      <span className="req-name">{request.nombre}</span>
                                      {isCurrent && isDirty && (
                                        <span
                                          className="dirty-dot"
                                          title="Cambios sin guardar"
                                          aria-label="Cambios sin guardar"
                                        />
                                      )}
                                    </button>

                                    <div className="req-actions">
                                      <button
                                        type="button"
                                        className="icon-btn tiny"
                                        onClick={() => onRenameRequest(request)}
                                        aria-label={`Renombrar ${request.nombre}`}
                                        title="Renombrar"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-btn tiny"
                                        onClick={() => onDuplicateRequest(request)}
                                        aria-label={`Duplicar ${request.nombre}`}
                                        title="Duplicar"
                                      >
                                        <Copy size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-btn tiny danger"
                                        onClick={() => onDeleteRequest(request)}
                                        aria-label={`Eliminar ${request.nombre}`}
                                        title="Eliminar"
                                      >
                                        <Trash size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {!collapsed && search.trim() !== '' && (
            <p className="search-summary">
              {totalVisible} de {savedRequests.length} requests
            </p>
          )}
        </section>
      </div>

      {/* Tarjeta de marca Rubrifact: fija al pie, fuera del área con scroll */}
      {!collapsed && (
        <div className="rubri-brand-card">
          <div className="rubri-brand-logo-wrapper">
            <img
              src={rubriLogo}
              alt="Rubrifact Logo"
              className="rubri-brand-logo-img"
              draggable={false}
            />
          </div>
          <p className="rubri-brand-text">
            © Rubrifact Soluciones Tecnológicas S.A.C.
            <br />
            Todos los Derechos Reservados.
          </p>
        </div>
      )}
    </aside>
  );
};

export default RubriSidebar;
