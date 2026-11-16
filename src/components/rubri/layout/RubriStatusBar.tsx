import clsx from 'clsx';

import packageInfo from '../../../../package.json';
import { useApiStore } from '../../../store/apiStore';
import type { ResponseStatus } from '../types';
import './RubriStatusBar.css';

interface RubriStatusBarProps {
  sending: boolean;
  status: ResponseStatus | null;
}

export const RubriStatusBar = ({ sending, status }: RubriStatusBarProps) => {
  const collections = useApiStore((state) => state.collections);
  const savedRequests = useApiStore((state) => state.savedRequests);
  const lastSyncAt = useApiStore((state) => state.lastSyncAt);
  const lastError = useApiStore((state) => state.lastError);
  const isWorkspaceCached = useApiStore((state) => state.isWorkspaceCached);

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span
          className={clsx('status-dot', {
            busy: sending,
            error: status?.code === 0,
          })}
        />
        <span>
          {sending
            ? 'Enviando request…'
            : status
              ? `${status.code === 0 ? 'ERR' : status.code} ${status.text}`
              : 'Listo'}
        </span>
      </div>

      <div className="statusbar-right">
        <span>
          {collections.length} colecciones · {isWorkspaceCached ? '…' : savedRequests.length} requests
        </span>
        <span className="statusbar-sep" />
        <span>Ctrl+S guardar · Ctrl+Enter enviar</span>
        <span className="statusbar-sep" />
        <span
          className={clsx('statusbar-sync', { offline: Boolean(lastError) })}
          title={
            lastError
              ? lastError
              : lastSyncAt
                ? `Última sincronización: ${new Date(lastSyncAt).toLocaleTimeString()}`
                : isWorkspaceCached ? 'Lista local de colecciones; las peticiones se actualizarán desde MongoDB' : 'Conectando con MongoDB'
          }
        >
          <span className="sync-dot" />
          {lastError ? isWorkspaceCached ? 'Caché local · sin conexión' : 'Sin conexión'
            : isWorkspaceCached ? 'Caché local · sincronizando' : lastSyncAt ? 'Conectado' : 'Conectando…'}
        </span>
        <span className="statusbar-sep" />
        <span>v{packageInfo.version}</span>
      </div>
    </footer>
  );
};

export default RubriStatusBar;
