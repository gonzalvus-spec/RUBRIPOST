import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  Clock,
  Cookie,
  Download,
  Check,
  LoaderCircle,
  LogOut,
  LayoutDashboard,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
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
import { useEnvironmentStore } from '../../../store/environmentStore';
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
  onOpenProfile: () => void;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseDraft: () => void;
  onNewRequest: () => void;
  onRefresh: () => void;
  environmentOpen: boolean;
  environmentName: string;
  onCloseEnvironment: () => void;
  onConfigureEnvironments: () => void;
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
  onOpenProfile,
  onActivateTab,
  onCloseTab,
  onCloseDraft,
  onNewRequest,
  onRefresh,
  environmentOpen,
  environmentName,
  onCloseEnvironment,
  onConfigureEnvironments,
}: RubriTopbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [environmentMenuOpen, setEnvironmentMenuOpen] = useState(false);
  const [environmentSearch, setEnvironmentSearch] = useState('');
  const environments = useEnvironmentStore((state) => state.environments);
  const activeEnvironmentId = useEnvironmentStore((state) => state.activeEnvironmentId);
  const selectActiveEnvironment = useEnvironmentStore((state) => state.selectActive);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const environmentMenuRef = useRef<HTMLDivElement | null>(null);
  const activeEnvironment = environments.find((item) => item._id === activeEnvironmentId);
  const visibleEnvironments = environments.filter((item) => item.nombre.toLowerCase().includes(environmentSearch.trim().toLowerCase()));

  const updateBusy = updater.status === 'downloading' || updater.status === 'installing';
  const showMainUpdate = updater.updateAvailable;
  const updateVersion = updater.version?.startsWith('v')
    ? updater.version
    : `v${updater.version}`;

  const handleUpdateClick = async () => {
    if (updateBusy) return;
    if (updater.status !== 'available') return;
    if (isDirty) {
      notify.warning(
        'Hay cambios sin guardar',
        'Guarda o descarta la request actual antes de instalar la actualización.',
      );
      return;
    }

    const confirmed = await confirmAction({
      title: `Actualizar a ${updateVersion}`,
      text: updater.notes
        ? `${updater.notes}\n\nLa aplicación se reiniciará al finalizar.`
        : 'La aplicación se reiniciará al finalizar.',
      confirmText: 'Actualizar ahora',
      cancelText: 'Más tarde',
    });
    if (confirmed) await updater.downloadAndInstall();
  };

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

  useEffect(() => {
    if (!environmentMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (environmentMenuRef.current && !environmentMenuRef.current.contains(event.target as Node)) setEnvironmentMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setEnvironmentMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [environmentMenuOpen]);

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

          {environmentOpen && (
            <div className="topbar-tab active environment-tab">
              <span className="topbar-tab-main is-draft"><span className="tab-overview-icon"><Layers3 size={13} /></span><span className="topbar-tab-name">{environmentName}</span></span>
              <button type="button" className="topbar-tab-close" onClick={onCloseEnvironment} title="Cerrar entorno"><X size={11} /></button>
            </div>
          )}

          {openTabs.map((item) => {
            const isActive = !overviewOpen && !environmentOpen && item._id === lastSavedId;
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

          {draftOpen && !lastSavedId && !overviewOpen && !environmentOpen && (
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
                  const isActive = !overviewOpen && !environmentOpen && item._id === lastSavedId;
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
        <div className="environment-selector" ref={environmentMenuRef}>
          <button type="button" className={clsx('environment-selector-trigger', { active: environmentMenuOpen })} onClick={() => setEnvironmentMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={environmentMenuOpen}>
            <span>{activeEnvironment?.nombre ?? 'No Environment'}</span><ChevronDown size={13} />
          </button>
          {environmentMenuOpen && <div className="environment-selector-popover" role="menu">
            <label className="environment-selector-search"><Search size={13} /><input value={environmentSearch} onChange={(event) => setEnvironmentSearch(event.target.value)} placeholder="Search environments..." autoFocus /></label>
            <div className="environment-selector-list">
              <button type="button" className={clsx({ selected: activeEnvironmentId === null })} onClick={() => { selectActiveEnvironment(null); setEnvironmentMenuOpen(false); }}><span className="environment-selector-check">{activeEnvironmentId === null && <Check size={14} />}</span><span>No Environment</span></button>
              {visibleEnvironments.map((environment) => <button type="button" className={clsx({ selected: activeEnvironmentId === environment._id })} key={environment._id} onClick={() => { selectActiveEnvironment(environment._id); setEnvironmentMenuOpen(false); }}><span className="environment-selector-check">{activeEnvironmentId === environment._id && <Check size={14} />}</span><span>{environment.nombre}</span></button>)}
              {visibleEnvironments.length === 0 && <p>No environments found</p>}
            </div>
            <button type="button" className="environment-configure" onClick={() => { setEnvironmentMenuOpen(false); onConfigureEnvironments(); }}><Settings size={14} /><span>Configure</span></button>
          </div>}
        </div>
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

        {showMainUpdate && (
          <button
            type="button"
            className={clsx('icon-btn', 'topbar-update', {
              available: updater.status === 'available',
              progress: updateBusy,
            })}
            onClick={() => void handleUpdateClick()}
            disabled={updateBusy}
            aria-label={updater.status === 'available'
              ? `Actualizar RubriPost a ${updateVersion}`
              : 'Actualización de RubriPost en progreso'}
            title={updater.status === 'available' ? `Actualizar a ${updateVersion}` : 'Actualización en progreso'}
            aria-busy={updateBusy}
          >
            {updateBusy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
            {updater.status === 'available' && <span>Actualizar a {updateVersion}</span>}
            {updater.status === 'downloading' && (
              <span>{updater.progress === null ? 'Descargando...' : `Descargando ${updater.progress}%...`}</span>
            )}
            {updater.status === 'installing' && <span>Instalando...</span>}
          </button>
        )}

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
          <button
            type="button"
            className="topbar-user"
            onClick={onOpenProfile}
            title={`${sesion.nombre} · ${sesion.usuario} (${sesion.rol})`}
            aria-label="Abrir mi perfil"
          >
            <span className="topbar-user-avatar">
              {(sesion.nombre || sesion.usuario).charAt(0).toUpperCase()}
            </span>
            <span className="topbar-user-name">{sesion.nombre || sesion.usuario}</span>
          </button>
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
