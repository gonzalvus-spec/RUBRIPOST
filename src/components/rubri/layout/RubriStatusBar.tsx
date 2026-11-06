import clsx from 'clsx';

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
          {collections.length} colecciones · {savedRequests.length} requests
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
                : 'Sincronización automática con MongoDB'
          }
        >
          <span className="sync-dot" />
          {lastError ? 'Sin conexión' : 'Conectado'}
        </span>
        <span className="statusbar-sep" />
        <span>v2.4</span>
      </div>
    </footer>
  );
};

export default RubriStatusBar;
