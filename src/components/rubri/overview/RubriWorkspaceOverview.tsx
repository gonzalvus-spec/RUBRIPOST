import { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock3,
  Cookie,
  Folder,
  FolderPlus,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';

import { useAuthStore } from '../../../store/authStore';
import { useApiStore, type ApiRequestDocument } from '../../../store/apiStore';
import { workspaceOverviewStats, overviewCollectionRows } from '../../../lib/workspaceOverview';
import './RubriWorkspaceOverview.css';

interface RubriWorkspaceOverviewProps {
  onNewRequest: () => void;
  onNewCollection: (parentId?: string) => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenRequest: (request: ApiRequestDocument) => void;
  onCreateProject: () => void;
  onOpenHistory: () => void;
  onOpenCookies: () => void;
  onRefresh: () => void;
}

const relativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

/** Dashboard del proyecto activo. Toda la información proviene del store existente. */
export const RubriWorkspaceOverview = ({
  onNewRequest,
  onNewCollection,
  onOpenCollection,
  onOpenRequest,
  onCreateProject,
  onOpenHistory,
  onOpenCookies,
  onRefresh,
}: RubriWorkspaceOverviewProps) => {
  const sesion = useAuthStore((state) => state.sesion);
  const eid = useApiStore((state) => state.eid);
  const proyectos = useApiStore((state) => state.proyectos);
  const collections = useApiStore((state) => state.collections);
  const savedRequests = useApiStore((state) => state.savedRequests);
  const isWorkspaceCached = useApiStore((state) => state.isWorkspaceCached);
  const isRefreshing = useApiStore((state) => state.isRefreshing);

  const stats = useMemo(
    () => workspaceOverviewStats(collections, savedRequests),
    [collections, savedRequests],
  );
  const rows = useMemo(
    () => overviewCollectionRows(collections, savedRequests),
    [collections, savedRequests],
  );
  const recentRequests = useMemo(
    () => [...savedRequests]
      .sort((a, b) => Date.parse(b.updated_at || b.timestamp) - Date.parse(a.updated_at || a.timestamp))
      .slice(0, 6),
    [savedRequests],
  );
  const project = proyectos.find((item) => item.codigo === eid);
  const projectName = project?.nombre || eid || 'Workspace';
  const isInitialLoading = isRefreshing && collections.length === 0 && savedRequests.length === 0;
  return (
    <section className="workspace-overview" aria-label="Vista general del proyecto">
      <header className="overview-hero">
        <div className="overview-hero-glow" aria-hidden="true" />
        <div className="overview-hero-copy">
          <span className="overview-eyebrow"><LayoutDashboard size={13} /> Overview</span>
          <h1>{greeting()}, <span>{sesion?.nombre || sesion?.usuario || 'equipo'}</span></h1>
          <p>Estás trabajando en{' '}<strong>{projectName}</strong></p>
          {project?.descripcion && <small className="overview-project-description">{project.descripcion}</small>}
        </div>

        <div className="overview-user-pill" title={`${sesion?.nombre || sesion?.usuario || 'Usuario'} · ${sesion?.rol || 'usuario'}`}>
          <span><UserRound size={14} /></span>
          <div>
            <strong>{sesion?.nombre || sesion?.usuario || 'Usuario activo'}</strong>
            <small>{sesion?.rol || 'usuario'} · @{sesion?.usuario || 'sesión'}</small>
          </div>
        </div>

        <div className="overview-hero-actions">
          <button type="button" className="btn btn-secondary compact" onClick={onCreateProject}>
            <FolderPlus size={14} /> Crear proyecto
          </button>
          <button type="button" className="btn btn-primary compact" onClick={onNewRequest}>
            <Plus size={14} /> Nueva petición
          </button>
          <button
            type="button"
            className="overview-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Sincronizar con MongoDB"
            title="Sincronizar con MongoDB"
          >
            <RefreshCw size={15} className={isRefreshing ? 'spin' : undefined} />
          </button>
        </div>
      </header>

      <div className="overview-kpis" aria-label="Métricas del proyecto">
        <button type="button" className="overview-kpi gold" onClick={() => onNewCollection()}>
          <span className="overview-kpi-icon"><Boxes size={19} /></span>
          <span className="overview-kpi-value">{stats.collections}</span>
          <span className="overview-kpi-label">Colecciones</span>
          <small>{stats.rootCollections} principales · {stats.subcollections} anidadas</small>
          <ArrowRight size={14} className="overview-kpi-arrow" />
        </button>
        <button type="button" className="overview-kpi green" onClick={onNewRequest}>
          <span className="overview-kpi-icon"><Send size={19} /></span>
          {isWorkspaceCached ? <span className="overview-skeleton metric" /> : <span className="overview-kpi-value">{stats.requests}</span>}
          <span className="overview-kpi-label">Peticiones guardadas</span>
          <small>{isWorkspaceCached ? 'Recuperando desde MongoDB…' : 'Disponibles en el proyecto'}</small>
          <ArrowRight size={14} className="overview-kpi-arrow" />
        </button>
        <button type="button" className="overview-kpi blue" onClick={onOpenHistory}>
          <span className="overview-kpi-icon"><Activity size={19} /></span>
          <span className="overview-kpi-value">{stats.requests + stats.collections}</span>
          <span className="overview-kpi-label">Recursos organizados</span>
          <small>Consulta la actividad completa</small>
          <ArrowRight size={14} className="overview-kpi-arrow" />
        </button>
        <article className="overview-kpi gold" title={recentRequests[0]?.nombre}>
          <span className="overview-kpi-icon"><Clock3 size={19} /></span>
          <span className="overview-kpi-value status-text">
            {recentRequests[0]?.nombre || 'Sin actividad'}
          </span>
          <span className="overview-kpi-label">Última petición actualizada</span>
          <small>
            {recentRequests[0]
              ? `${recentRequests[0].metodo} · ${relativeTime(recentRequests[0].updated_at || recentRequests[0].timestamp)}`
              : 'Crea la primera petición del proyecto'}
          </small>
        </article>
      </div>

      <div className="overview-dashboard-grid">
        <section className="overview-panel" aria-labelledby="overview-recent-title">
          <div className="overview-panel-head">
            <div>
              <span className="overview-panel-kicker"><Clock3 size={12} /> Actividad reciente</span>
              <h2 id="overview-recent-title">Peticiones actualizadas</h2>
            </div>
            <span className="overview-count-badge">{savedRequests.length} total</span>
          </div>

          {isInitialLoading || isWorkspaceCached ? (
            <div className="overview-request-list" aria-label="Cargando peticiones">
              {[0, 1, 2, 3].map((item) => (
                <div className="overview-request-skeleton" key={item}>
                  <span className="overview-skeleton method" /><span className="overview-skeleton line" /><span className="overview-skeleton time" />
                </div>
              ))}
            </div>
          ) : recentRequests.length === 0 ? (
            <div className="overview-empty">
              <span className="overview-empty-illustration"><Send size={23} /><Sparkles size={13} /></span>
              <h3>Tu proyecto está listo</h3>
              <p>Crea la primera petición para comenzar a construir y documentar tu API.</p>
              <button type="button" className="btn btn-primary compact" onClick={onNewRequest}><Plus size={13} /> Crear petición</button>
            </div>
          ) : (
            <div className="overview-request-list">
              {recentRequests.map((request) => (
                <button
                  type="button"
                  className="overview-request-row"
                  key={request._id}
                  onClick={() => onOpenRequest(request)}
                  title={`Abrir ${request.nombre}`}
                >
                  <span className={`overview-method method-${request.metodo.toLowerCase()}`}>{request.metodo}</span>
                  <span className="overview-request-copy">
                    <strong>{request.nombre || 'Petición sin nombre'}</strong>
                    <small>{request.url || 'URL pendiente'}</small>
                  </span>
                  <time dateTime={request.updated_at || request.timestamp}>{relativeTime(request.updated_at || request.timestamp)}</time>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="overview-side-stack">
          <section className="overview-panel" aria-labelledby="overview-actions-title">
            <div className="overview-panel-head compact"><div><span className="overview-panel-kicker">Accesos directos</span><h2 id="overview-actions-title">¿Qué deseas hacer?</h2></div></div>
            <div className="overview-quick-grid">
              <button type="button" className="overview-quick" onClick={onNewRequest}><span><Plus size={15} /></span><div><strong>Nueva petición</strong><small>Abrir borrador</small></div></button>
              <button type="button" className="overview-quick" onClick={() => onNewCollection()}><span><FolderPlus size={15} /></span><div><strong>Colección</strong><small>Organizar API</small></div></button>
              <button type="button" className="overview-quick" onClick={onOpenHistory}><span><History size={15} /></span><div><strong>Historial</strong><small>Ver actividad</small></div></button>
              <button type="button" className="overview-quick" onClick={onOpenCookies}><span><Cookie size={15} /></span><div><strong>Cookies</strong><small>Gestionar datos</small></div></button>
            </div>
          </section>
        </aside>
      </div>

      <section className="overview-panel" aria-labelledby="overview-collections-title">
        <div className="overview-panel-head">
          <div><span className="overview-panel-kicker"><Folder size={12} /> Estructura del proyecto</span><h2 id="overview-collections-title">Colecciones y endpoints</h2><p>Explora la jerarquía o crea una petición directamente en una colección.</p></div>
          <button type="button" className="btn btn-secondary compact" onClick={() => onNewCollection()}><FolderPlus size={13} /> Nueva colección</button>
        </div>

        {isInitialLoading && rows.length === 0 ? (
          <div className="overview-collection-grid">
            {[0, 1, 2].map((item) => <div className="overview-collection-card skeleton-card" key={item}><span className="overview-skeleton icon" /><span className="overview-skeleton line" /></div>)}
          </div>
        ) : rows.length === 0 ? (
          <div className="overview-empty collection-empty">
            <span className="overview-empty-illustration"><FolderPlus size={25} /><Sparkles size={13} /></span>
            <h3>Aún no hay colecciones</h3>
            <p>Agrupa tus endpoints para mantener el proyecto ordenado y fácil de compartir.</p>
            <button type="button" className="btn btn-secondary compact" onClick={() => onNewCollection()}><Plus size={13} /> Crear colección</button>
          </div>
        ) : (
          <div className="overview-collection-grid">
            {rows.map((row) => {
              const empty = row.childCount === 0 && row.totalRequests === 0;
              return (
                <button
                  key={row.collection._id}
                  type="button"
                  className="overview-collection-card"
                  onClick={() => onOpenCollection(row.collection._id)}
                  title={`Crear una petición en ${row.collection.nombre}`}
                >
                  <span className="overview-folder-mark" style={{ color: row.collection.color }}><Folder size={18} /></span>
                  <span className="overview-collection-copy">
                    <strong>{row.collection.nombre}</strong>
                    <small>{empty ? 'Colección vacía' : `${row.totalRequests} petición(es) · ${row.childCount} subcolección(es)`}</small>
                  </span>
                  {row.depth > 0 && <span className="overview-depth-badge">Nivel {row.depth + 1}</span>}
                  <ArrowRight size={14} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
};

export default RubriWorkspaceOverview;
