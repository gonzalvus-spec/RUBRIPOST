import { useMemo } from 'react';
import {
  ArrowRight,
  Clock,
  Cookie,
  Folder,
  FolderPlus,
  Globe,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react';

import { useApiStore } from '../../../store/apiStore';
import { workspaceOverviewStats, overviewCollectionRows } from '../../../lib/workspaceOverview';
import './RubriWorkspaceOverview.css';

interface RubriWorkspaceOverviewProps {
  onNewRequest: () => void;
  onNewCollection: (parentId?: string) => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenHistory: () => void;
  onOpenCookies: () => void;
  onRefresh: () => void;
}

/** Overview del workspace activo, inspirado en la vista inicial de Postman. */
export const RubriWorkspaceOverview = ({
  onNewRequest,
  onNewCollection,
  onOpenCollection,
  onOpenHistory,
  onOpenCookies,
  onRefresh,
}: RubriWorkspaceOverviewProps) => {
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
  const project = proyectos.find((item) => item.codigo === eid);
  const projectName = project?.nombre || eid || 'Workspace';

  return (
    <section className="workspace-overview" aria-label="Overview del workspace">
      <header className="overview-header">
        <div className="overview-heading">
          <span className="overview-eyebrow">
            <LayoutDashboard size={13} />
            Workspace overview
          </span>
          <h1>{projectName}</h1>
          <p>
            Resumen del proyecto <code>{eid || 'sin código'}</code>. Desde aquí puedes crear
            requests y organizar colecciones para el workspace activo.
          </p>
        </div>
        <div className="overview-header-actions">
          <button
            type="button"
            className="btn btn-secondary compact"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Volver a sincronizar con MongoDB"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : undefined} />
            {isRefreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="btn btn-primary compact"
            onClick={onNewRequest}
            title="Crear una request nueva"
          >
            <Plus size={14} />
            Nueva request
          </button>
        </div>
      </header>

      <div className="overview-stats">
        <article className="overview-stat">
          <span className="overview-stat-icon collections">
            <Folder size={17} />
          </span>
          <div>
            <strong>{stats.collections}</strong>
            <span>Collections</span>
            <small>
              {stats.rootCollections} principal(es) · {stats.subcollections} subcolección(es)
            </small>
          </div>
        </article>

        <article className="overview-stat">
          <span className="overview-stat-icon requests">
            <Send size={17} />
          </span>
          <div>
            <strong>{isWorkspaceCached ? '…' : stats.requests}</strong>
            <span>Requests guardadas</span>
            <small>{isWorkspaceCached ? 'Sincronizando peticiones…' : 'Disponibles en este proyecto'}</small>
          </div>
        </article>

        <article className="overview-stat">
          <span className="overview-stat-icon environments">
            <Globe size={17} />
          </span>
          <div>
            <strong>{stats.environments}</strong>
            <span>Environments</span>
            <small>Sin entornos configurados</small>
          </div>
        </article>
      </div>

      <section className="overview-card" aria-labelledby="overview-quick-title">
            <div className="overview-card-head">
              <h2 id="overview-quick-title">Quick Actions</h2>
            </div>
            <div className="overview-quick-grid">
              <button type="button" className="overview-quick" onClick={onNewRequest}>
                <span className="overview-quick-icon"><Plus size={15} /></span>
                <span>
                  <strong>Nueva request</strong>
                  <small>Abrir un borrador vacío</small>
                </span>
              </button>
              <button type="button" className="overview-quick" onClick={() => onNewCollection()}>
                <span className="overview-quick-icon"><FolderPlus size={15} /></span>
                <span>
                  <strong>Nueva colección</strong>
                  <small>Organizar las peticiones</small>
                </span>
              </button>
              <button type="button" className="overview-quick" onClick={onOpenHistory}>
                <span className="overview-quick-icon"><Clock size={15} /></span>
                <span>
                  <strong>Historial</strong>
                  <small>Revisar los cambios del proyecto</small>
                </span>
              </button>
              <button type="button" className="overview-quick" onClick={onOpenCookies}>
                <span className="overview-quick-icon"><Cookie size={15} /></span>
                <span>
                  <strong>Cookies</strong>
                  <small>Gestionar el tarro del proyecto</small>
                </span>
              </button>
            </div>
          </section>

          <section className="overview-card" aria-labelledby="overview-collections-title">
            <div className="overview-card-head">
              <div>
                <h2 id="overview-collections-title">Collections</h2>
                <p>Selecciona una carpeta para empezar una request dentro de ella.</p>
              </div>
              <button
                type="button"
                className="icon-btn tiny"
                onClick={() => onNewCollection()}
                aria-label="Nueva colección"
                title="Nueva colección"
              >
                <FolderPlus size={14} />
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="overview-collections-empty">
                <FolderPlus size={22} />
                <p>
                  {isRefreshing
                    ? 'Cargando colecciones…'
                    : 'Este proyecto todavía no tiene colecciones.'}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary compact"
                  onClick={() => onNewCollection()}
                >
                  <Plus size={13} />
                  Crear colección
                </button>
              </div>
            ) : (
              <div className="overview-collection-list">
                {rows.map((row) => {
                  const empty = row.childCount === 0 && row.totalRequests === 0;
                  const meta = isWorkspaceCached
                    ? 'Sincronizando peticiones…'
                    : [
                      row.childCount > 0 ? `${row.childCount} subcolección(es)` : null,
                      row.totalRequests > 0
                        ? `${row.totalRequests} request(s)${row.childCount > 0 ? ' en total' : ''}`
                        : null,
                      empty ? 'Vacía' : null,
                    ].filter(Boolean).join(' · ');

                  return (
                    <button
                      key={row.collection._id}
                      type="button"
                      className="overview-collection"
                      style={{ paddingLeft: 12 + row.depth * 20 }}
                      onClick={() => onOpenCollection(row.collection._id)}
                      title={`Abrir "${row.collection.nombre}"`}
                    >
                      <span className="overview-collection-icon" style={{ color: row.collection.color }}>
                        <Folder size={15} />
                      </span>
                      <span className="overview-collection-body">
                        <span className="overview-collection-name">{row.collection.nombre}</span>
                        <span className="overview-collection-meta">{meta}</span>
                      </span>
                      <span className="overview-collection-open">
                        Abrir <ArrowRight size={13} />
                      </span>
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
