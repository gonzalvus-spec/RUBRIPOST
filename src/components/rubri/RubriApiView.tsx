import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';

import '../../App.css';
import './RubriApiView.css';

import { alertError, confirmAction, notify } from '../../lib/alerts';
import { withTimeout } from '../../lib/async';
import { useAppUpdater } from '../../hooks/useAppUpdater';
import { browserIsOnline, networkStatus, useNetworkStore } from '../../store/networkStore';
import {
  MAX_BODY_BYTES,
  collectionSubtreeIds,
  errorMessage,
  useApiStore,
  type ApiCollection,
  type ApiRequestDocument,
} from '../../store/apiStore';
import { RubriTopbar } from './layout/RubriTopbar';
import { RubriSidebar } from './layout/RubriSidebar';
import { RubriRequestHeader } from './request/RubriRequestHeader';
import { RubriRequestBar } from './request/RubriRequestBar';
import { RubriRequestTabs } from './request/RubriRequestTabs';
import { RubriAuthPanel } from './panels/RubriAuthPanel';
import { RubriHeadersPanel } from './panels/RubriHeadersPanel';
import { RubriQueryPanel } from './panels/RubriQueryPanel';
import { enviarRequest } from '../../lib/httpClient';
import { readSendCookies, writeSendCookies } from '../../lib/cookiePreferences';
import { RubriResponsePanel } from './panels/RubriResponsePanel';
import { RequestChatPanel } from './request/RequestChatPanel';
import { readChatCollapsed, writeChatCollapsed } from '../../lib/chatPreferences';
import { RubriWorkspaceOverview } from './overview/RubriWorkspaceOverview';
import { RubriStatusBar } from './layout/RubriStatusBar';
import { RubriNameModal } from './modal/RubriNameModal';
import { RubriCookiesModal } from '../cookies/RubriCookiesModal';
import { RubriProyectosModal } from '../proyectos/RubriProyectosModal';
import { HistorialModal } from '../historial/HistorialModal';
import { ProfileModal } from '../auth/ProfileModal';
import { SplashScreen, useSplashGate } from '../splash/SplashScreen';
import { useAuthStore } from '../../store/authStore';
import {
  CLOSED_MODAL,
  DRAFT_RESPONSE_KEY,
  SYNC_INTERVAL_MS,
  suggestName,
} from './constants';
import type {
  ModalMode,
  NameModalState,
  ResponseEntry,
  ResponseViewState,
  TabId,
} from './types';

const RubriBodyPanel = lazy(() => import('./panels/RubriBodyPanel').then((module) => ({ default: module.RubriBodyPanel })));

/**
 * Vista principal del cliente de API: orquesta el estado compartido y
 * compone los módulos de la interfaz (topbar, sidebar, paneles, modal).
 */
export const RubriApiView = () => {
  const updater = useAppUpdater();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const [initialDataReady, setInitialDataReady] = useState(false);
  const [initialStage, setInitialStage] = useState<'connecting' | 'projects' | 'workspace' | 'ready'>('connecting');
  const initialSplash = useSplashGate(initialDataReady, 1400);

  // Draft + persistencia (Zustand)
  const eid = useApiStore((state) => state.eid);
  const nombre = useApiStore((state) => state.nombre);
  const metodo = useApiStore((state) => state.metodo);
  const url = useApiStore((state) => state.url);
  const body = useApiStore((state) => state.body);
  const headerRows = useApiStore((state) => state.headerRows);
  const auth = useApiStore((state) => state.auth);
  const savedRequests = useApiStore((state) => state.savedRequests);
  const collections = useApiStore((state) => state.collections);
  const isDirty = useApiStore((state) => state.isDirty);
  const isSaving = useApiStore((state) => state.isSaving);
  const isRefreshing = useApiStore((state) => state.isRefreshing);
  const lastSavedId = useApiStore((state) => state.lastSavedId);
  const lastSaveAt = useApiStore((state) => state.lastSaveAt);

  const proyectos = useApiStore((state) => state.proyectos);
  const refreshProyectos = useApiStore((state) => state.refreshProyectos);
  const cambiarProyecto = useApiStore((state) => state.cambiarProyecto);

  const setHttpInfo = useApiStore((state) => state.setHttpInfo);
  const setActiveCollection = useApiStore((state) => state.setActiveCollection);
  const setDraftCollection = useApiStore((state) => state.setDraftCollection);

  const saveToMongo = useApiStore((state) => state.saveToMongo);
  const refreshFromMongo = useApiStore((state) => state.refreshFromMongo);
  const hydrateCollections = useApiStore((state) => state.hydrateCollections);
  const loadRequest = useApiStore((state) => state.loadRequest);
  const newRequest = useApiStore((state) => state.newRequest);
  const duplicateRequest = useApiStore((state) => state.duplicateRequest);
  const deleteRequest = useApiStore((state) => state.deleteRequest);
  const renameRequest = useApiStore((state) => state.renameRequest);
  const moveRequest = useApiStore((state) => state.moveRequest);
  const createCollection = useApiStore((state) => state.createCollection);
  const renameCollection = useApiStore((state) => state.renameCollection);
  const deleteCollection = useApiStore((state) => state.deleteCollection);
  const duplicateCollection = useApiStore((state) => state.duplicateCollection);

  // UI local
  const [activeTab, setActiveTab] = useState<TabId>('body');
  /** La aplicación abre en el Overview del workspace, no en una request vacía. */
  const [overviewOpen, setOverviewOpen] = useState(true);
  /**
   * Respuestas por request + método: cada combinación conserva la suya, así que
   * al cambiar de pestaña o de método el panel arranca vacío y al volver
   * reaparece la última respuesta de esa combinación.
   */
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({});
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jsonErrors, setJsonErrors] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modal, setModal] = useState<NameModalState>(CLOSED_MODAL);
  /** Pestañas abiertas (ids de requests). La request nueva se representa aparte. */
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  /** Solo es true cuando el usuario abrió explícitamente una request nueva. */
  const [draftTabOpen, setDraftTabOpen] = useState(false);
  /** Chat de la request activa: contraído deja solo un riel lateral. */
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  /**
   * Cookies del PROYECTO: el tarro es único por proyecto (EID) y el envío
   * automático se recuerda entre sesiones, sin depender de la request, el
   * método ni la colección seleccionada.
   */
  const [cookiePreferences, setCookiePreferences] = useState<Record<string, boolean>>({});
  const enviarCookies = cookiePreferences[eid] ?? readSendCookies(eid);
  const [cookiesAbierto, setCookiesAbierto] = useState(false);
  const [cookiesRevision, setCookiesRevision] = useState(0);

  /** Gestión de proyectos: `lista` muestra el panel, `crear` abre el alta. */
  const [proyectosAbierto, setProyectosAbierto] = useState(false);
  const [proyectosModo, setProyectosModo] = useState<'lista' | 'crear'>('lista');

  const sesion = useAuthStore((state) => state.sesion);
  const cerrarSesion = useAuthStore((state) => state.cerrarSesion);
  const usuarioActual = sesion?.usuario ?? '';

  // Cada usuario conserva su preferencia de chat contraído entre recargas.
  useEffect(() => {
    setChatCollapsed(readChatCollapsed(usuarioActual));
  }, [usuarioActual]);

  const toggleChat = () => {
    const next = !chatCollapsed;
    setChatCollapsed(next);
    writeChatCollapsed(usuarioActual, next);
  };

  // Redimensionamiento y paneles expandibles/contraíbles estilo Postman
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const [responseState, setResponseState] = useState<ResponseViewState>('normal');
  const [responseHeight, setResponseHeight] = useState(280);
  const [isResizingResponse, setIsResizingResponse] = useState(false);
  const responseHeightRef = useRef(responseHeight);
  responseHeightRef.current = responseHeight;
  const mainRef = useRef<HTMLElement | null>(null);
  const requestViewRef = useRef<HTMLDivElement | null>(null);

  // Clave del response que se muestra ahora (request guardada o borrador + método).
  const responseKey = `${lastSavedId ?? DRAFT_RESPONSE_KEY}::${metodo}`;
  const response = responses[responseKey]?.body ?? '';
  const status = responses[responseKey]?.status ?? null;

  const patchResponse = (key: string, entry: Partial<ResponseEntry>) =>
    setResponses((previous) => {
      const base: ResponseEntry = previous[key] ?? { body: '', status: null };
      return { ...previous, [key]: { ...base, ...entry } };
    });

  const clearDraftResponses = () =>
    setResponses((previous) => {
      const next: Record<string, ResponseEntry> = {};
      for (const [key, value] of Object.entries(previous)) {
        if (!key.startsWith(`${DRAFT_RESPONSE_KEY}::`)) next[key] = value;
      }
      return next;
    });

  // -------------------------------------------------------------------------
  // Redimensionamiento de paneles
  // -------------------------------------------------------------------------

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    document.body.classList.add('resizing-col');
    const startX = e.clientX;
    const startWidth = sidebarCollapsed ? 62 : sidebarWidthRef.current;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = startWidth + delta;
      if (nextWidth < 120) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
        setSidebarWidth(Math.min(650, Math.max(220, nextWidth)));
      }
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.classList.remove('resizing-col');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResponseMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingResponse(true);
    document.body.classList.add('resizing-row');
    const startY = e.clientY;
    const startHeight = responseState === 'collapsed' ? 38 : responseHeightRef.current;
    const mainEl = requestViewRef.current ?? mainRef.current;
    const maxAvailable = mainEl ? mainEl.clientHeight - 140 : 650;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = startHeight + delta;
      if (nextHeight < 65) {
        setResponseState('collapsed');
      } else if (nextHeight >= maxAvailable) {
        setResponseState('maximized');
      } else {
        setResponseState('normal');
        setResponseHeight(Math.max(120, Math.min(maxAvailable, nextHeight)));
      }
    };

    const onMouseUp = () => {
      setIsResizingResponse(false);
      document.body.classList.remove('resizing-row');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const confirmDiscard = async (): Promise<boolean> => {
    if (!isDirty) return true;
    return confirmAction({
      title: '¿Descartar cambios?',
      text: 'Tienes cambios sin guardar en esta request.',
      confirmText: 'Descartar',
      cancelText: 'Seguir editando',
      danger: true,
    });
  };

  const openNameModal = (
    mode: ModalMode,
    value: string,
    targetId: string | null = null,
  ) => setModal({ ...CLOSED_MODAL, open: true, mode, value, targetId });

  const openCollectionModal = (parentId: string | null = null) =>
    setModal({ ...CLOSED_MODAL, open: true, mode: 'collectionCreate', targetId: parentId });

  const submitModal = () => {
    const value = modal.value.trim();
    if (!value) {
      notify.error('El nombre no puede estar vacío');
      return;
    }

    if (modal.mode === 'rename' && modal.targetId) {
      void renameRequest(modal.targetId, value);
    } else if (modal.mode === 'collectionRename' && modal.targetId) {
      void renameCollection(modal.targetId, value, modal.color);
    } else if (modal.mode === 'collectionCreate') {
      void createCollection(value, modal.color, modal.targetId);
    } else {
      void saveToMongo({ nombre: value });
    }
    setModal(CLOSED_MODAL);
  };

  const handleLogout = async () => {
    // Cerrar sesión es una acción explícita: si hay cambios sin guardar se
    // avisa con un diálogo propio (no el de "descartar") para que quede claro
    // que se sale de la cuenta.
    if (isDirty) {
      const confirmed = await confirmAction({
        title: '¿Cerrar sesión?',
        text: 'Se perderán los cambios sin guardar de esta request.',
        confirmText: 'Cerrar sesión',
        cancelText: 'Seguir editando',
        danger: true,
      });
      if (!confirmed) return;
    }
    setHistorialAbierto(false);
    if (!isOnline) {
      notify.warning(
        'No hay conexión a internet',
        'La sesión se cerrará únicamente en este equipo.',
      );
    }
    useApiStore.getState().resetForLogout();
    await cerrarSesion();
    notify.success(
      'Sesión cerrada',
      isOnline ? 'Has salido de tu cuenta.' : 'La sesión local se cerró correctamente.',
    );
  };

  const handleSave = () => {
    if (isSaving) return;
    if (!isOnline) {
      notify.warning(
        'No hay conexión a internet',
        'No es posible guardar en MongoDB mientras trabajas en modo local.',
      );
      return;
    }
    if (!lastSavedId && !nombre.trim()) {
      openNameModal('save', suggestName(nombre, url));
      return;
    }
    void saveToMongo();
  };

  const handleRefresh = () => {
    if (!browserIsOnline()) {
      notify.warning(
        'No hay conexión a internet',
        'Trabajando en modo local. No se puede sincronizar con MongoDB.',
      );
      return;
    }
    void refreshFromMongo();
  };

  const buildRequestHeaders = (): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const row of headerRows) {
      const key = row.key.trim();
      if (row.enabled && key) {
        result[key] = row.value;
      }
    }
    if (auth.kind === 'bearer' && auth.token?.trim()) {
      result.Authorization = `Bearer ${auth.token.trim()}`;
    }
    if (auth.kind === 'api-key' && auth.api_key_name?.trim() && auth.api_key_value?.trim()) {
      result[auth.api_key_name.trim()] = auth.api_key_value.trim();
    }
    const hasContentType = Object.keys(result).some(
      (key) => key.toLowerCase() === 'content-type',
    );
    if (!hasContentType && metodo !== 'GET') {
      result['Content-Type'] = 'application/json';
    }
    return result;
  };

  const handleSend = async () => {
    if (sending) return;
    if (body.trim() !== '' && jsonErrors > 0) {
      notify.error('Corrige los errores de JSON antes de enviar');
      return;
    }
    if (metodo !== 'GET' && new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      notify.error('El body supera el límite de 1 MB');
      return;
    }

    // Se captura la clave al enviar: si el usuario cambia de pestaña mientras
    // la request viaja, la respuesta se guarda en la combinación correcta.
    const requestKey = responseKey;
    const requestMetodo = metodo;

    const startedAt = performance.now();

    setSending(true);
    patchResponse(requestKey, { body: '// Enviando request...', status: null });

    try {
      // Cliente nativo: envía y recibe cookies y evita CORS.
      const respuesta = await enviarRequest({
        eid,
        metodo: requestMetodo,
        url,
        headers: buildRequestHeaders(),
        body: requestMetodo === 'GET' || !body.trim() ? null : body,
        enviarCookies,
      });

      let responseBody = respuesta.body;
      if (respuesta.content_type.includes('application/json')) {
        try {
          responseBody = JSON.stringify(JSON.parse(respuesta.body), null, 2);
        } catch {
          // El servidor dijo JSON pero no lo es: se muestra tal cual.
        }
      } else if (!respuesta.body.trim()) {
        responseBody = '// Respuesta vacía';
      }

      patchResponse(requestKey, {
        body: responseBody,
        status: {
          code: respuesta.status,
          text: respuesta.status_text || 'OK',
        },
      });
      setHttpInfo({
        status_code: respuesta.status,
        duration_ms: respuesta.duration_ms,
      });
      setCookiesRevision((valor) => valor + 1);
    } catch (error) {
      const duration = Math.round(performance.now() - startedAt);
      patchResponse(requestKey, {
        body: `// Error de conexión:\n${errorMessage(error)}`,
        status: { code: 0, text: 'Network Error' },
      });
      setHttpInfo({ status_code: 0, duration_ms: duration });
      notify.error('Error de conexión', errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const handleToggleEnviarCookies = (valor: boolean) => {
    setCookiePreferences((current) => ({ ...current, [eid]: valor }));
    writeSendCookies(eid, valor);
  };

  const handleCopyResponse = () => {
    void navigator.clipboard.writeText(response);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleLoadSaved = async (request: ApiRequestDocument) => {
    if (!(await confirmDiscard())) return;
    loadRequest(request);
    setDraftTabOpen(false);
    setOverviewOpen(false);
    setActiveTab('body');
  };

  const handleDelete = async (request: ApiRequestDocument) => {
    const confirmed = await confirmAction({
      title: `¿Eliminar "${request.nombre}"?`,
      text: 'Se borrará de MongoDB. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;

    const wasActive = !overviewOpen && request._id === lastSavedId;
    const index = openTabs.indexOf(request._id);
    const remaining = openTabs.filter((id) => id !== request._id);
    const removed = await deleteRequest(request._id);
    if (!removed) return;

    setOpenTabs(remaining);
    if (!wasActive) return;

    const fallbackId = remaining[Math.min(index, remaining.length - 1)];
    const fallback = savedRequests.find((item) => item._id === fallbackId);
    if (fallback) {
      loadRequest(fallback);
      setDraftTabOpen(false);
      setOverviewOpen(false);
    } else {
      setDraftTabOpen(false);
      setOverviewOpen(true);
      newRequest();
    }
    setActiveTab('body');
  };

  const handleDuplicate = async (request: ApiRequestDocument) => {
    await duplicateRequest(request._id);
  };

  const handleRenameRequest = (request: ApiRequestDocument) =>
    openNameModal('rename', request.nombre, request._id);

  const handleEditCollection = (collection: ApiCollection) =>
    setModal({
      ...CLOSED_MODAL,
      open: true,
      mode: 'collectionRename',
      value: collection.nombre,
      targetId: collection._id,
      color: collection.color,
    });

  const handleDeleteCollection = async (collection: ApiCollection) => {
    const subtreeIds = collectionSubtreeIds(collections, collection._id);
    const total = savedRequests.filter(
      (request) => !!request.coleccion_id && subtreeIds.has(request.coleccion_id),
    ).length;
    const confirmed = await confirmAction({
      title: `¿Eliminar "${collection.nombre}"?`,
      text: `Se eliminarán también ${subtreeIds.size - 1} subcolección(es) y ${total} request(s) que contiene. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar todo',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;
    await deleteCollection(collection._id);
  };

  const abrirProyectos = (modo: 'lista' | 'crear') => {
    setProyectosModo(modo);
    setProyectosAbierto(true);
  };

  /** Cambia de proyecto descartando (con confirmación) el borrador actual. */
  const handleCambiarProyecto = async (codigo: string) => {
    if (codigo === eid) return;
    if (!(await confirmDiscard())) return;
    await cambiarProyecto(codigo);
    setResponses({});
    setOpenTabs([]);
    setDraftTabOpen(false);
    setOverviewOpen(true);
    setActiveTab('body');
  };

  const handleNewRequest = async () => {
    if (!(await confirmDiscard())) return;
    newRequest();
    setDraftTabOpen(true);
    setOverviewOpen(false);
    setActiveTab('body');
    clearDraftResponses();
  };

  const handleNewRequestIn = async (collectionId: string) => {
    if (!(await confirmDiscard())) return;
    setActiveCollection(collectionId);
    newRequest({ coleccionId: collectionId });
    setDraftTabOpen(true);
    setOverviewOpen(false);
    setActiveTab('body');
    clearDraftResponses();
  };

  // Pestañas visibles: solo requests que siguen existiendo en MongoDB.
  const openTabsView = openTabs
    .map((id) => savedRequests.find((request) => request._id === id))
    .filter((request): request is ApiRequestDocument => Boolean(request));

  const activateTab = async (id: string) => {
    if (id === lastSavedId) {
      // La pestaña ya está cargada: solo hay que traerla de vuelta del Overview.
      setDraftTabOpen(false);
      setOverviewOpen(false);
      setActiveTab('body');
      return;
    }
    const request = savedRequests.find((item) => item._id === id);
    if (!request) return;
    if (!(await confirmDiscard())) return;
    loadRequest(request);
    setDraftTabOpen(false);
    setOverviewOpen(false);
    setActiveTab('body');
  };

  /** Cierra una request concreta; si era la última, vuelve al Overview. */
  const closeTab = async (id: string) => {
    const isActive = !overviewOpen && id === lastSavedId;
    if (isActive && !(await confirmDiscard())) return;

    const index = openTabs.indexOf(id);
    const remaining = openTabs.filter((tabId) => tabId !== id);
    setOpenTabs(remaining);

    if (!isActive) return;

    const fallbackId = remaining[Math.min(index, remaining.length - 1)];
    const fallback = savedRequests.find((item) => item._id === fallbackId);

    if (fallback) {
      loadRequest(fallback);
      setDraftTabOpen(false);
      setOverviewOpen(false);
    } else {
      // No quedan ventanas de request: el Overview vuelve a ocupar el área.
      setDraftTabOpen(false);
      setOverviewOpen(true);
      newRequest();
    }
    setActiveTab('body');
  };

  /**
   * Descarta el borrador (vacío o no). Si hay pestañas guardadas abiertas
   * activa la más cercana; si no queda ninguna, vuelve al Overview.
   */
  const closeDraft = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    setDraftTabOpen(false);

    if (openTabs.length === 0) {
      setOverviewOpen(true);
      newRequest();
      setActiveTab('body');
      return;
    }

    const fallbackId = openTabs[openTabs.length - 1];
    const fallback = savedRequests.find((item) => item._id === fallbackId);
    if (fallback) {
      loadRequest(fallback);
      setOverviewOpen(false);
    } else {
      setOverviewOpen(true);
      newRequest();
    }
    setActiveTab('body');
  };

  const handleChangeDraftCollection = (value: string) => {
    if (!value) return;
    if (lastSavedId) {
      void moveRequest(lastSavedId, value);
      return;
    }
    setDraftCollection(value);
  };

  // -------------------------------------------------------------------------
  // Efectos
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    hydrateCollections();
  }, [hydrateCollections, sesion?.usuario, eid]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const initialEid = useApiStore.getState().eid;
        setInitialStage('projects');
        // Proyectos, workspace e historial se inicializan en paralelo.
        const [lista] = await Promise.all([
          refreshProyectos(),
          refreshFromMongo({ silent: true, readOnly: true }),
          withTimeout(
            invoke('listar_historial', { filtro: { project_id: initialEid } }),
            9_000,
          ).catch((error) => {
            networkStatus().reportFailure(error);
            console.warn('No se pudo precargar el historial inicial', error);
          }),
        ]);
        const activo = useApiStore.getState().eid;
        if (!active || activo !== initialEid) return;

        setInitialStage('workspace');
        if (lista.length > 0 && !lista.some((proyecto) => proyecto.codigo === activo)) {
          // El proyecto recordado ya no existe (se borró en otra PC): se abre otro.
          await cambiarProyecto(lista[0].codigo);
        } else if (lista.some((proyecto) => proyecto.codigo === activo) && useApiStore.getState().collections.length === 0 && !useApiStore.getState().lastError) {
          await refreshFromMongo({ silent: true });
        }

        const error = useApiStore.getState().lastError;
        if (active && error) {
          if (!networkStatus().isOnline) {
            console.warn('Inicio en modo local: MongoDB no está disponible', error);
          } else if (useApiStore.getState().collections.length > 0) {
            notify.warning('Mostrando colecciones guardadas en este equipo', 'No se pudo sincronizar con MongoDB. Puedes volver a intentar con Refrescar.');
          } else {
            void alertError('No se pudo conectar a MongoDB', error);
          }
        }
      } finally {
        if (active) {
          setInitialStage('ready');
          setInitialDataReady(true);
        }
      }
    })();

    // Sincronización automática: otra PC que guarde en la misma MongoDB se
    // refleja aquí en segundos sin pisar ediciones locales sin guardar.
    const syncNow = () => {
      if (!browserIsOnline() || document.visibilityState !== 'visible') return;
      void refreshFromMongo({ silent: true, background: true, sync: true });
    };

    const interval = window.setInterval(syncNow, SYNC_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncNow();
    };

    window.addEventListener('focus', syncNow);
    window.addEventListener('online', syncNow);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', syncNow);
      window.removeEventListener('online', syncNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshFromMongo, refreshProyectos, sesion?.usuario]);

  // Cada request guardada o cargada mantiene su pestaña abierta.
  useEffect(() => {
    if (!lastSavedId) return;
    setOpenTabs((current) =>
      current.includes(lastSavedId) ? current : [...current, lastSavedId],
    );
  }, [lastSavedId]);

  // Al guardar el borrador su pestaña pasa a ser una pestaña guardada.
  useEffect(() => {
    if (lastSavedId && draftTabOpen) setDraftTabOpen(false);
  }, [lastSavedId, draftTabOpen]);

  // Si la request activa desaparece (por ejemplo, otra PC la eliminó) y el
  // usuario no abrió un borrador, el Overview vuelve a ocupar el área.
  const previousActiveIdRef = useRef(lastSavedId);
  useEffect(() => {
    const previousId = previousActiveIdRef.current;
    previousActiveIdRef.current = lastSavedId;
    if (previousId && !lastSavedId && !draftTabOpen) {
      setOverviewOpen(true);
      setActiveTab('body');
    }
  }, [lastSavedId, draftTabOpen]);

  // Al guardar una request nueva, su respuesta pasa del borrador
  // al id real. Se exige un guardado reciente para no confundirlo con abrir
  // una request existente desde un borrador.
  const previousSavedIdRef = useRef(lastSavedId);
  const previousSaveAtRef = useRef(lastSaveAt);
  useEffect(() => {
    const previousId = previousSavedIdRef.current;
    const previousSaveAt = previousSaveAtRef.current;
    previousSavedIdRef.current = lastSavedId;
    previousSaveAtRef.current = lastSaveAt;

    if (previousId || !lastSavedId || lastSaveAt === previousSaveAt) return;

    setResponses((current) => {
      const draftEntries = Object.entries(current).filter(([key]) =>
        key.startsWith(`${DRAFT_RESPONSE_KEY}::`),
      );
      if (draftEntries.length === 0) return current;

      const next: Record<string, ResponseEntry> = { ...current };
      for (const [key, entry] of draftEntries) {
        const suffix = key.slice(DRAFT_RESPONSE_KEY.length);
        delete next[key];
        next[`${lastSavedId}${suffix}`] = entry;
      }
      return next;
    });
  }, [lastSavedId, lastSaveAt, eid, sesion?.usuario]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();
        if (!modal.open) handleSave();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!modal.open) void handleSend();
      } else if (key === 'r') {
        event.preventDefault();
        if (!modal.open) handleRefresh();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const bodyBytes = new TextEncoder().encode(body).length;
  const initialStatus = initialStage === 'connecting'
    ? 'Conectando con la base de datos...'
    : initialStage === 'projects'
      ? 'Cargando proyectos, colecciones e historial...'
      : initialStage === 'workspace'
        ? 'Preparando entorno de trabajo...'
        : 'Entorno preparado';
  const initialProgress = initialStage === 'connecting' ? 14 : initialStage === 'projects' ? 46 : initialStage === 'workspace' ? 82 : 100;
  const updateVisible = updater.overlay && ['checking', 'downloading', 'installing'].includes(updater.status);
  const updateStatus = updater.status === 'checking'
    ? 'Buscando actualizaciones...'
    : updater.status === 'downloading'
      ? `Descargando actualización (${updater.progress}%)...`
      : 'Instalando nueva versión y reiniciando...';

  return (
    <div className="rubri-app">
      {initialSplash.visible && (
        <SplashScreen
          status={initialStatus}
          progress={initialProgress}
          indeterminate={!initialDataReady && initialStage === 'connecting'}
          leaving={initialSplash.leaving}
        />
      )}
      {updateVisible && (
        <SplashScreen
          mode="update"
          status={updateStatus}
          progress={updater.status === 'checking' ? 12 : updater.progress}
          indeterminate={updater.status === 'checking'}
        />
      )}
      <RubriTopbar
        updater={updater}
        onOpenProfile={() => setPerfilAbierto(true)}
        sesion={sesion}
        proyectos={proyectos}
        proyectoActivo={eid}
        onSelectProyecto={(codigo) => void handleCambiarProyecto(codigo)}
        onNuevoProyecto={() => abrirProyectos('crear')}
        onGestionarProyectos={() => abrirProyectos('lista')}
        onOpenHistorial={() => setHistorialAbierto(true)}
        onOpenCookies={() => setCookiesAbierto(true)}
        onLogout={() => void handleLogout()}
        sidebarCollapsed={sidebarCollapsed}
        openTabs={openTabsView}
        lastSavedId={lastSavedId}
        nombre={nombre}
        metodo={metodo}
        isDirty={isDirty}
        isRefreshing={isRefreshing}
        overviewOpen={overviewOpen}
        draftOpen={draftTabOpen}
        onOpenOverview={() => setOverviewOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        onActivateTab={(id) => void activateTab(id)}
        onCloseTab={(id) => void closeTab(id)}
        onCloseDraft={() => void closeDraft()}
        onNewRequest={() => void handleNewRequest()}
        onRefresh={handleRefresh}
      />

      <div className="rubri-layout">
        <RubriSidebar
          key={JSON.stringify([sesion?.usuario, eid])}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          resizing={isResizingSidebar}
          lastSavedId={lastSavedId}
          isDirty={isDirty}
          onNewRequestIn={(collectionId) => void handleNewRequestIn(collectionId)}
          onLoadRequest={(request) => void handleLoadSaved(request)}
          onRenameRequest={handleRenameRequest}
          onDuplicateRequest={(request) => void handleDuplicate(request)}
          onDeleteRequest={(request) => void handleDelete(request)}
          onCreateCollection={openCollectionModal}
          onEditCollection={handleEditCollection}
          onDuplicateCollection={(id) => void duplicateCollection(id)}
          onDeleteCollection={(collection) => void handleDeleteCollection(collection)}
        />

        {/* Divisor del sidebar (estilo Postman) */}
        <div
          className={clsx('sidebar-resizer', { active: isResizingSidebar })}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar la barra lateral"
          title="Arrastra para cambiar el ancho · doble clic para restablecer"
          onMouseDown={handleSidebarMouseDown}
          onDoubleClick={() => {
            setSidebarCollapsed(false);
            setSidebarWidth(340);
          }}
        />

        <main
          className={clsx('rubri-main', {
            'response-maximized': responseState === 'maximized',
          })}
          ref={mainRef}
        >
          {overviewOpen ? (
            <RubriWorkspaceOverview
              onNewRequest={() => void handleNewRequest()}
              onNewCollection={openCollectionModal}
              onOpenCollection={(collectionId) => void handleNewRequestIn(collectionId)}
              onOpenRequest={(request) => void handleLoadSaved(request)}
              onCreateProject={() => abrirProyectos('crear')}
              onOpenHistory={() => setHistorialAbierto(true)}
              onOpenCookies={() => setCookiesAbierto(true)}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="request-view">
              <div className="request-view-main" ref={requestViewRef}>
                <RubriRequestHeader
                  collections={collections}
                  lastSavedId={lastSavedId}
                  isDirty={isDirty}
                  onChangeCollection={handleChangeDraftCollection}
                  onNewCollection={openCollectionModal}
                />

                <RubriRequestBar
                  isSaving={isSaving}
                  sending={sending}
                  jsonErrors={jsonErrors}
                  onSave={handleSave}
                  onSend={() => void handleSend()}
                />

                <RubriRequestTabs
                  activeTab={activeTab}
                  jsonErrors={jsonErrors}
                  onChange={setActiveTab}
                />

                {activeTab === 'params' && <RubriQueryPanel />}
                {activeTab === 'body' && (
                  <Suspense fallback={<div className="panel request-panel"><p className="empty-state small">Cargando editor JSON…</p></div>}>
                    <RubriBodyPanel
                      jsonErrors={jsonErrors}
                      bodyBytes={bodyBytes}
                      onJsonErrorsChange={setJsonErrors}
                    />
                  </Suspense>
                )}
                {activeTab === 'auth' && <RubriAuthPanel />}
                {activeTab === 'headers' && <RubriHeadersPanel />}
                <RubriResponsePanel
                  response={response}
                  status={status}
                  sending={sending}
                  copied={copied}
                  responseState={responseState}
                  responseHeight={responseHeight}
                  isResizing={isResizingResponse}
                  setResponseState={setResponseState}
                  setResponseHeight={setResponseHeight}
                  onCopy={handleCopyResponse}
                  onResizeMouseDown={handleResponseMouseDown}
                />
              </div>

              <RequestChatPanel
                collapsed={chatCollapsed}
                onToggle={toggleChat}
                userId={sesion?.id ?? ''}
                eid={eid}
                requestKey={lastSavedId ?? ''}
                requestName={nombre || suggestName(nombre, url)}
              />
            </div>
          )}
        </main>
      </div>

      <RubriStatusBar sending={sending} status={status} />

      {proyectosAbierto && (
        <RubriProyectosModal
          modoInicial={proyectosModo}
          onClose={() => setProyectosAbierto(false)}
          onAbrirProyecto={(codigo) => void handleCambiarProyecto(codigo)}
        />
      )}

      {cookiesAbierto && (
        <RubriCookiesModal
          key={eid}
          enviarCookies={enviarCookies}
          onToggleEnviarCookies={handleToggleEnviarCookies}
          refreshKey={cookiesRevision}
          onClose={() => setCookiesAbierto(false)}
        />
      )}

      {historialAbierto && (
        <HistorialModal key={eid} onClose={() => setHistorialAbierto(false)} />
      )}

      {perfilAbierto && <ProfileModal onClose={() => setPerfilAbierto(false)} />}

      {modal.open && (
        <RubriNameModal
          modal={modal}
          isSaving={isSaving}
          onChange={setModal}
          onClose={() => setModal(CLOSED_MODAL)}
          onSubmit={submitModal}
        />
      )}
    </div>
  );
};

export default RubriApiView;
