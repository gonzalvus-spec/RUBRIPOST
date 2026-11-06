import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  Clock,
  Cookie,
  LoaderCircle,
  LogOut,
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
import { methodClass } from '../constants';
import { RubriProyectoSwitcher } from './RubriProyectoSwitcher';
import { RubrifactLogo } from './RubrifactLogo';
import './RubriTopbar.css';

interface RubriTopbarProps {
  sidebarCollapsed: boolean;
  openTabs: ApiRequestDocument[];
  lastSavedId: string | null;
  nombre: string;
  metodo: HttpMethod;
  isDirty: boolean;
  isRefreshing: boolean;
  sesion: SesionUsuario | null;
  proyectos: ApiProyecto[];
  proyectoActivo: string;
  onSelectProyecto: (codigo: string) => void;
  onNuevoProyecto: () => void;
  onGestionarProyectos: () => void;
  onToggleSidebar: () => void;
  onOpenHistorial: () => void;
  onOpenCookies: () => void;
  onLogout: () => void;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewRequest: () => void;
  onRefresh: () => void;
}

export const RubriTopbar = ({
  sidebarCollapsed,
  openTabs,
  lastSavedId,
  nombre,
  metodo,
  isDirty,
  isRefreshing,
  sesion,
  proyectos,
  proyectoActivo,
  onSelectProyecto,
  onNuevoProyecto,
  onGestionarProyectos,
  onToggleSidebar,
  onOpenHistorial,
  onOpenCookies,
  onLogout,
  onActivateTab,
  onCloseTab,
  onNewRequest,
  onRefresh,
}: RubriTopbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    if (id === lastSavedId) setMenuOpen(false);
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
          {openTabs.map((item) => {
            const isActive = item._id === lastSavedId;
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

          {!lastSavedId && (
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
                onClick={onNewRequest}
                aria-label="Descartar request nueva"
                title="Descartar"
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
                  const isActive = item._id === lastSavedId;
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
