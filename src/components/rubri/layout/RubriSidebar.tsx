import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Folder,
  FolderPlus,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash,
  X,
} from 'lucide-react';

import rubriLogo from '../../../assets/rubrifact-logo.png';
import { autoScrollIntent } from '../../../lib/autoScroll';
import { requestDropOrder, shouldHighlightCollectionDrop } from '../../../lib/requestOrder';
import {
  collectionDropPosition,
  collectionHasChildren,
  planCollectionDrop,
  type CollectionDropPosition,
} from '../../../lib/collectionHierarchy';
import { collectionPreferenceKey, readClosedCollections, writeClosedCollections } from '../../../lib/collectionPreferences';
import { useAuthStore } from '../../../store/authStore';
import {
  formatTimestamp,
  groupRequestsByCollection,
  useApiStore,
  type ApiCollection,
  type ApiRequestDocument,
} from '../../../store/apiStore';
import { methodClass } from '../constants';
import type { CollectionDropTarget, DraggingRequest, RequestDropTarget } from '../types';
import { RubriCollectionActionsMenu } from './RubriCollectionActionsMenu';
import { RubriExportModal } from '../modal/RubriExportModal';
import './RubriSidebar.css';

const ROOT_DROP_ID = 'root-collections';

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
  onCreateCollection: (parentId?: string) => void;
  onEditCollection: (collection: ApiCollection) => void;
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
  onEditCollection,
  onDuplicateCollection,
  onDeleteCollection,
}: RubriSidebarProps) => {
  const collections = useApiStore((state) => state.collections);
  const eid = useApiStore((state) => state.eid);
  const user = useAuthStore((state) => state.sesion?.usuario ?? '');
  const savedRequests = useApiStore((state) => state.savedRequests);
  const activeCollectionId = useApiStore((state) => state.activeCollectionId);
  const busyCollectionId = useApiStore((state) => state.busyCollectionId);
  const isRefreshing = useApiStore((state) => state.isRefreshing);
  const isWorkspaceCached = useApiStore((state) => state.isWorkspaceCached);
  const deletingId = useApiStore((state) => state.deletingId);
  const setActiveCollection = useApiStore((state) => state.setActiveCollection);
  const refreshFromMongo = useApiStore((state) => state.refreshFromMongo);
  const reorderRequests = useApiStore((state) => state.reorderRequests);
  const moveCollection = useApiStore((state) => state.moveCollection);

  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const preferenceScope = collectionPreferenceKey(user, eid);
  const [closedPreference, setClosedPreference] = useState(() => ({ scope: preferenceScope, ids: readClosedCollections(user, eid) }));
  const collapsedCollections = closedPreference.scope === preferenceScope ? closedPreference.ids : readClosedCollections(user, eid);
  /** Colección que se está arrastrando y punto de inserción resaltado. */
  const [draggingCollectionId, setDraggingCollectionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CollectionDropTarget | null>(null);
  /** Request que se está arrastrando (para feedback visual). */
  const [draggingRequest, setDraggingRequest] = useState<DraggingRequest | null>(null);
  /** Colección y posición donde caerá la request arrastrada. */
  const [requestDropTarget, setRequestDropTarget] = useState<RequestDropTarget | null>(null);
  /** Menú de tres puntos abierto: su fila mantiene visible el botón. */
  const [openMenuCollectionId, setOpenMenuCollectionId] = useState<string | null>(null);

  // Auto-scroll del sidebar mientras se arrastra una request o una carpeta.
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollIntentRef = useRef<{ direction: -1 | 0 | 1; speed: number }>({
    direction: 0,
    speed: 0,
  });

  const stopAutoScroll = () => {
    autoScrollIntentRef.current = { direction: 0, speed: 0 };
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const runAutoScroll = () => {
    const node = sidebarScrollRef.current;
    const intent = autoScrollIntentRef.current;
    if (!node || intent.direction === 0) {
      autoScrollFrameRef.current = null;
      return;
    }
    const before = node.scrollTop;
    node.scrollTop = before + intent.direction * intent.speed;
    if (node.scrollTop === before) {
      autoScrollFrameRef.current = null;
      return;
    }
    autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
  };

  const updateAutoScroll = (event: React.DragEvent<HTMLElement>) => {
    if (!draggingRequest && !draggingCollectionId) {
      stopAutoScroll();
      return;
    }
    const node = sidebarScrollRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const intent = autoScrollIntent(event.clientY, rect.top, rect.bottom);
    autoScrollIntentRef.current = intent;

    if (intent.direction === 0) {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      return;
    }
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    }
  };

  useEffect(() => () => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

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
  const draggingRequestAncestors = groups.find(
    (group) => group.collection._id === draggingRequest?.fromCollectionId,
  )?.ancestors ?? [];

  const toggleCollection = (collectionId: string) => {
    const next = collapsedCollections.includes(collectionId)
      ? collapsedCollections.filter((id) => id !== collectionId) : [...collapsedCollections, collectionId];
    writeClosedCollections(user, eid, next);
    setClosedPreference({ scope: preferenceScope, ids: next });
  };

  // --- Drag & drop para reordenar colecciones (estilo Postman) -------------

  const handleCollectionDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    collection: ApiCollection,
  ) => {
    event.stopPropagation();
    setDraggingCollectionId(collection._id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', collection._id);
  };

  const handleCollectionDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    collection: ApiCollection,
    forcedPosition?: CollectionDropPosition,
  ) => {
    if (!draggingCollectionId) return;
    if (draggingCollectionId === collection._id) { setDropTarget(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const position = forcedPosition ?? collectionDropPosition(event.clientY, rect.top, rect.height);
    if (!planCollectionDrop(collections, draggingCollectionId, collection._id, position)) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget((current) =>
      current?.id === collection._id && current.position === position
        ? current
        : { id: collection._id, position },
    );
  };

  const handleCollectionDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetId: string | null,
    forcedPosition?: CollectionDropPosition,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingCollectionId;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = forcedPosition ?? collectionDropPosition(event.clientY, rect.top, rect.height);
    setDraggingCollectionId(null);
    setDropTarget(null);
    if (!sourceId) return;
    const plan = planCollectionDrop(collections, sourceId, targetId, position);
    if (!plan) return;
    // Sin await y con el plan completo: el store normaliza jerarquía y orden
    // antes de pintar, así el elemento no salta al final de la lista.
    void moveCollection(sourceId, plan.parentId, plan.orderedIds);
  };

  const endCollectionDrag = () => {
    stopAutoScroll();
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
    const after = requestId
      ? event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2
      : target?.collectionId === collectionId && target.requestId === requestId
        ? target.after
        : false;

    setDraggingRequest(null);
    setRequestDropTarget(null);
    if (!source || source.id === requestId) return;

    const group = groups.find((entry) => entry.collection._id === collectionId);
    const currentIds = (group?.requests ?? []).map((request) => request._id);
    const nextIds = requestDropOrder(currentIds, source.id, requestId, after);

    if (nextIds.join('|') === currentIds.join('|')) return;

    void reorderRequests(collectionId === '' ? null : collectionId, nextIds);
  };

  const endRequestDrag = () => {
    stopAutoScroll();
    setDraggingRequest(null);
    setRequestDropTarget(null);
  };

  return (
    <aside
      className={clsx('rubri-sidebar', { collapsed, resizing, 'request-dragging': !!draggingRequest })}
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
             onClick={() => onCreateCollection()}
            aria-label="Nueva colección"
            title="Nueva colección"
          >
            <FolderPlus size={15} />
          </button>
        )}
      </div>

      <div
        className="sidebar-scroll"
        ref={sidebarScrollRef}
        onDragOverCapture={updateAutoScroll}
        onDropCapture={stopAutoScroll}
        onDragEndCapture={stopAutoScroll}
      >
        {/* Colecciones */}
        <section className="sidebar-section grow">
          <div
            className={clsx('side-title', { 'collection-root-target': !!draggingCollectionId, 'is-over': dropTarget?.id === ROOT_DROP_ID })}
            onDragOver={(event) => {
              if (!draggingCollectionId) return;
              event.preventDefault(); event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget({ id: ROOT_DROP_ID, position: 'inside' });
            }}
            onDragLeave={(event) => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDropTarget((current) => current?.id === ROOT_DROP_ID ? null : current);
            }}
            onDrop={(event) => { if (draggingCollectionId) void handleCollectionDrop(event, null, 'inside'); }}
          >
            <span>{draggingCollectionId ? 'SOLTAR EN NIVEL PRINCIPAL' : 'COLECCIONES'}</span>

            {!collapsed && (
              <div className="side-title-actions">
                <button type="button" className="icon-btn tiny" onClick={() => setExportOpen(true)} aria-label="Exportar colecciones a JSON" title="Exportar colecciones a JSON">
                  <Download size={12} />
                </button>
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
                   onClick={() => onCreateCollection()}
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
                       onClick={() => onCreateCollection()}
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
                     ({ collection, requests, ancestors }) => !ancestors.some((id) => collapsedCollections.includes(id)) &&
                       (!search.trim() || requests.some(matchesSearch) || groups.some((group) => group.ancestors.includes(collection._id) && group.requests.some(matchesSearch))),
                  )
                  .map(({ collection, requests, depth }) => {
                    const isOrphan = collection._id === '';
                    const isCollapsed = collapsedCollections.includes(collection._id);
                    const isActive = activeCollectionId === collection._id && !isOrphan;
                    const visible = requests.filter(matchesSearch);
                    const busy = busyCollectionId === collection._id;
                    // Con subcolecciones dentro, la carpeta no está vacía aunque
                    // todavía no tenga requests directas.
                    const hasChildren = collectionHasChildren(collections, collection._id);
                    const isEmpty = !hasChildren && requests.length === 0;
                    const showEmptyDropzone = isEmpty && !!draggingRequest &&
                      requestDropTarget?.collectionId === collection._id;
                    const highlightRequestDestination = !!draggingRequest && shouldHighlightCollectionDrop(
                      draggingRequest.fromCollectionId,
                      collection._id,
                      draggingRequestAncestors,
                    );

                    return (
                      <div key={collection._id || 'orphans'} className={clsx('coll-group', { busy })} style={{ marginLeft: depth * 16 }}>
                        <div
                          className={clsx('coll-row', {
                            active: isActive,
                            'suppress-request-highlight': !!draggingRequest && !highlightRequestDestination,
                            dragging: draggingCollectionId === collection._id,
                             'request-drop-target':
                               highlightRequestDestination &&
                              requestDropTarget?.collectionId === collection._id &&
                              requestDropTarget.requestId === null,
                            'drop-before':
                              dropTarget?.id === collection._id && dropTarget.position === 'before',
                            'drop-after':
                              dropTarget?.id === collection._id && dropTarget.position === 'after',
                            'drop-inside': dropTarget?.id === collection._id && dropTarget.position === 'inside',
                          })}
                          draggable={!isOrphan}
                          onDragStart={(event) => handleCollectionDragStart(event, collection)}
                          onDragOver={(event) => {
                            handleCollectionDragOver(event, collection);
                            handleRequestDragOverCollection(event, collection._id);
                          }}
                          onDragLeave={(event) => {
                            if (event.relatedTarget instanceof Node && event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                            setRequestDropTarget((current) => current?.collectionId === collection._id ? null : current);
                            setDropTarget((current) => current?.id === collection._id ? null : current);
                          }}
                          onDrop={(event) => {
                            if (draggingRequest) {
                              handleRequestDrop(event, collection._id, null);
                            } else {
                              void handleCollectionDrop(event, collection._id);
                            }
                          }}
                          onDragEnd={endCollectionDrag}
                          title={
                            isOrphan ? undefined : 'Arrastra al centro de otra carpeta para anidar; a sus bordes para ordenar'
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
                            title={isWorkspaceCached ? `${collection.nombre} · Pendiente de sincronizar peticiones` : `${collection.nombre} · ${requests.length} request(s)`}
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
                              <span className="coll-count">({isWorkspaceCached ? '…' : requests.length})</span>
                            </span>
                          </button>

                          {!isOrphan && (
                            <div
                              className={clsx('coll-actions', {
                                'menu-open': openMenuCollectionId === collection._id,
                              })}
                              onDragStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <RubriCollectionActionsMenu
                                nombre={collection.nombre}
                                onNewSubcollection={() => onCreateCollection(collection._id)}
                                onNewRequest={() => onNewRequestIn(collection._id)}
                                onEdit={() => onEditCollection(collection)}
                                onDuplicate={() => onDuplicateCollection(collection._id)}
                                onDelete={() => onDeleteCollection(collection)}
                                onOpenChange={(open) =>
                                  setOpenMenuCollectionId((current) =>
                                    open ? collection._id : current === collection._id ? null : current,
                                  )
                                }
                              />
                            </div>
                          )}

                        </div>

                        {!isCollapsed && (
                          <div
                            className="req-list"
                            onDragOver={(event) => {
                               if (draggingCollectionId) {
                                 handleCollectionDragOver(event, collection, 'inside');
                                 return;
                               }
                               if (!draggingRequest) return;
                               event.preventDefault();
                               event.stopPropagation();
                              setRequestDropTarget((current) =>
                                current?.collectionId === collection._id &&
                                current.requestId === null
                                  ? current
                                  : { collectionId: collection._id, requestId: null, after: false },
                              );
                            }}
                             onDrop={(event) => {
                               if (draggingCollectionId) void handleCollectionDrop(event, collection._id, 'inside');
                               else handleRequestDrop(event, collection._id, null);
                             }}
                             onDragLeave={(event) => {
                               if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                                setRequestDropTarget((current) => current?.collectionId === collection._id ? null : current);
                                setDropTarget((current) => current?.id === collection._id ? null : current);
                             }}
                          >
                            <div
                              className={clsx('empty-dropzone-reveal', { visible: showEmptyDropzone })}
                              aria-hidden={!showEmptyDropzone}
                            >
                              <div className="empty-dropzone-clip">
                                <div className="empty-request-dropzone is-over">
                                  <Plus size={18} aria-hidden="true" />
                                  <span>Suelta aquí la petición</span>
                                </div>
                              </div>
                            </div>
                            {visible.length === 0 ? (
                              !hasChildren && (
                                <p className={clsx('empty-state small empty-collection-label', { hidden: showEmptyDropzone })} aria-hidden={showEmptyDropzone}>
                                  {isWorkspaceCached ? 'Las peticiones se cargarán al sincronizar' : search ? 'Sin coincidencias' : 'Colección vacía'}
                                </p>
                              )
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
                                     title="Arrastra para colocar antes o después de otra petición"
                                    onDragStart={(event) =>
                                      handleRequestDragStart(event, request, collection._id)
                                    }
                                    onDragOver={(event) =>
                                      handleRequestDragOverRow(event, collection._id, request._id)
                                    }
                                    onDrop={(event) => {
                                      if (draggingCollectionId) void handleCollectionDrop(event, collection._id, 'inside');
                                      else handleRequestDrop(event, collection._id, request._id);
                                    }}
                                    onDragEnd={endRequestDrag}
                                   >
                                     <span className="req-drag-handle" aria-hidden="true">
                                       <GripVertical size={12} />
                                     </span>
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
      {exportOpen && <RubriExportModal onClose={() => setExportOpen(false)} />}
    </aside>
  );
};

export default RubriSidebar;
