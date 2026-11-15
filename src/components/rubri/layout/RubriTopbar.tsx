import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  Clock,
  Cookie,
  Download,
  LoaderCircle,
  LogOut,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';

import {
  formatTimestamp,
  type ApiProyecto,
  type ApiRequestDocument,
  type HttpMethod,
} from '../../../store/apiStore';
import type { SesionUsuario } from '../../../store/authStore';
import type { AppUpdater } from '../../../hooks/useAppUpdater';
import { confirmAction, notify } from '../../../lib/alerts';
import { methodClass } from '../constants';
import { RubriProyectoSwitcher } from './RubriProyectoSwitcher';
import { RubrifactLogo } from './RubrifactLogo';
import './RubriTopbar.css';

interface RubriTopbarProps {
  updater: AppUpdater;
  sidebarCollapsed: boolean;
  openTabs: ApiRequestDocument[];
  lastSavedId: string | null;
  nombre: string;
  metodo: HttpMethod;
  isDirty: boolean;
  isRefreshing: boolean;
  overviewOpen: boolean;
  draftOpen: boolean;
  sesion: SesionUsuario | null;
  proyectos: ApiProyecto[];
  proyectoActivo: string;
  onSelectProyecto: (codigo: string) => void;
  onNuevoProyecto: () => void;
  onGestionarProyectos: () => void;
  onToggleSidebar: () => void;
  onOpenOverview: () => void;
  onOpenHistorial: () => void;
  onOpenCookies: () => void;
  onLogout: () => void;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseDraft: () => void;
  onNewRequest: () => void;
  onRefresh: () => void;
}

export const RubriTopbar = ({
  updater,
  sidebarCollapsed,
  openTabs,
  lastSavedId,
  nombre,
  metodo,
  isDirty,
  isRefreshing,
  overviewOpen,
  draftOpen,
  sesion,
  proyectos,
  proyectoActivo,
  onSelectProyecto,
  onNuevoProyecto,
  onGestionarProyectos,
  onToggleSidebar,
  onOpenOverview,
  onOpenHistorial,
  onOpenCookies,
  onLogout,
  onActivateTab,
  onCloseTab,
  onCloseDraft,
  onNewRequest,
  onRefresh,
}: RubriTopbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleUpdateClick = async () => {
    if (updater.status === 'available') {
      const version = updater.version?.startsWith('v')
        ? updater.version
        : `v${updater.version}`;
      const confirmed = await confirmAction({
        title: `Actualizar a ${version}`,
        text: updater.notes
          ? `${updater.notes}\n\nLa aplicación se reiniciará al finalizar.`
          : 'La aplicación se reiniciará al finalizar.',
        confirmText: 'Actualizar ahora',
        cancelText: 'Más tarde',
      });
      if (confirmed) await updater.downloadAndInstall();
      return;
    }

    const result = await updater.checkForUpdates();
    if (result === 'current') {
      notify.success('RubriPost está actualizado', 'Ya tienes la última versión.');
    } else if (result === 'error') {
      notify.error('No se pudo buscar actualizaciones', 'Revisa tu conexión e inténtalo de nuevo.');
    } else if (result === 'unavailable') {
      notify.info('Actualizaciones solo en la app de escritorio');
    }
  };

  const updateBusy = ['checking', 'downloading', 'installing'].includes(updater.status);
  const updateVersion = updater.version?.startsWith('v')
    ? updater.version
    : `v${updater.version}`;

  // Menú de todas las pestañas: se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleSelectTab = (id: string) => {
    setMenuOpen(false);
    onActivateTab(id);
  };

  const handleCloseTab = (id: string) => {
    if (!overviewOpen && id === lastSavedId) setMenuOpen(false);
    onCloseTab(id);
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn topbar-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>

      <div className="topbar-brand">
        <RubrifactLogo />
        <span className="topbar-title">
          RUBRIFACT <b>API CLIENT</b>
        </span>
      </div>

      <RubriProyectoSwitcher
        proyectos={proyectos}
        activo={proyectoActivo}
        onSelect={onSelectProyecto}
        onNuevo={onNuevoProyecto}
        onGestionar={onGestionarProyectos}
      />

      <div className="topbar-tabs-area">
        <div className="topbar-tabs" role="tablist" aria-label="Requests abiertas">
          {/* El Overview solo existe como pestaña cuando es la vista activa. */}
          {overviewOpen && (
            <div className="topbar-tab overview-tab active">
              <button
                type="button"
                role="tab"
                aria-selected
                className="topbar-tab-main"
                onClick={onOpenOverview}
                title="Overview del workspace activo"
              >
                <span className="tab-overview-icon" aria-hidden="true">
                  <LayoutDashboard size={13} />
                </span>
                <span className="topbar-tab-name">Overview</span>
              </button>
            </div>
          )}

          {openTabs.map((item) => {
            const isActive = !overviewOpen && item._id === lastSavedId;
            const label = isActive ? nombre || item.nombre : item.nombre;
            const method = isActive ? metodo : item.metodo;

            return (
              <div key={item._id} className={clsx('topbar-tab', { active: isActive })}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="topbar-tab-main"
                  onClick={() => onActivateTab(item._id)}
                  title={`${item.url}\nActualizada: ${formatTimestamp(item.updated_at)}`}
                >
                  <span className={clsx('tab-method', methodClass(method))}>
                    {method}
                  </span>
                  <span className="topbar-tab-name">{label}</span>
                  {isActive && isDirty && (
                    <span
                      className="dirty-dot"
                      title="Cambios sin guardar"
                      aria-label="Cambios sin guardar"
                    />
                  )}
                </button>
                <button
                  type="button"
                  className="topbar-tab-close"
                  onClick={() => onCloseTab(item._id)}
                  aria-label={`Cerrar ${label}`}
                  title="Cerrar pestaña"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          {draftOpen && !lastSavedId && !overviewOpen && (
            <div className="topbar-tab active">
              <span className="topbar-tab-main is-draft">
                <span className={clsx('tab-method', methodClass(metodo))}>
                  {metodo}
                </span>
                <span className="topbar-tab-name">{nombre || 'Sin título'}</span>
                {isDirty && (
                  <span
                    className="dirty-dot"
                    title="Cambios sin guardar"
                    aria-label="Cambios sin guardar"
                  />
                )}
              </span>
              <button
                type="button"
                className="topbar-tab-close"
                onClick={onCloseDraft}
                aria-label="Cerrar request nueva"
                title="Cerrar request nueva"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="topbar-new"
          onClick={onNewRequest}
          aria-label="Nueva request"
          title="Nueva request"
        >
          <Plus size={14} />
        </button>

        {/* Menú con todas las pestañas abiertas (estilo Postman). */}
        <div className="topbar-tabs-all" ref={menuRef}>
          <button
            type="button"
            className={clsx('topbar-tabs-toggle', { active: menuOpen })}
            onClick={() => setMenuOpen((value) => !value)}
            disabled={openTabs.length === 0}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Todas las pestañas abiertas"
            title={`Todas las pestañas abiertas (${openTabs.length})`}
          >
            <ChevronDown size={14} />
            {openTabs.length > 1 && (
              <span className="topbar-tabs-count">{openTabs.length}</span>
            )}
          </button>

          {menuOpen && (
            <div className="tabs-menu" role="menu" aria-label="Pestañas abiertas">
              <div className="tabs-menu-head">Pestañas abiertas ({openTabs.length})</div>
              <div className="tabs-menu-list">
                {openTabs.map((item) => {
                  const isActive = !overviewOpen && item._id === lastSavedId;
                  const label = isActive ? nombre || item.nombre : item.nombre;
                  const method = isActive ? metodo : item.metodo;

                  return (
                    <div
                      key={item._id}
                      className={clsx('tabs-menu-row', { active: isActive })}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="tabs-menu-item"
                        onClick={() => handleSelectTab(item._id)}
                        title={`${item.url}\nActualizada: ${formatTimestamp(item.updated_at)}`}
                      >
                        <span className={clsx('tab-method', methodClass(method))}>
                          {method}
                        </span>
                        <span className="tabs-menu-name">{label}</span>
                        {isActive && isDirty && (
                          <span
                            className="dirty-dot"
                            title="Cambios sin guardar"
                            aria-label="Cambios sin guardar"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        className="tabs-menu-close"
                        onClick={() => handleCloseTab(item._id)}
                        aria-label={`Cerrar ${label}`}
                        title="Cerrar pestaña"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenHistorial}
          aria-label="Historial de cambios"
          title="Historial de cambios"
        >
          <Clock size={15} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenCookies}
          aria-label="Cookies del proyecto"
          title="Cookies del proyecto"
        >
          <Cookie size={15} />
        </button>

        <button
          type="button"
          className={clsx('icon-btn', 'topbar-update', {
            available: updater.status === 'available',
            progress: updater.status === 'downloading' || updater.status === 'installing',
          })}
          onClick={() => void handleUpdateClick()}
          disabled={updateBusy}
          aria-label="Buscar actualizaciones"
          title={updater.error ?? 'Buscar actualizaciones'}
          aria-busy={updateBusy}
        >
          {updateBusy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
          {updater.status === 'available' && <span>Actualizar a {updateVersion}</span>}
          {updater.status === 'downloading' && <span>Descargando {updater.progress}%...</span>}
          {updater.status === 'installing' && <span>Instalando...</span>}
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refrescar workspace"
          title="Refrescar (Ctrl+R)"
          aria-busy={isRefreshing}
        >
          {isRefreshing ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
        </button>

        {sesion && (
          <div
            className="topbar-user"
            title={`${sesion.nombre} · ${sesion.usuario} (${sesion.rol})`}
          >
            <span className="topbar-user-avatar">
              {(sesion.nombre || sesion.usuario).charAt(0).toUpperCase()}
            </span>
            <span className="topbar-user-name">{sesion.nombre || sesion.usuario}</span>
          </div>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={onLogout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
};

export default RubriTopbar;
