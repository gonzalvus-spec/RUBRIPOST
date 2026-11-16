import { WifiOff } from 'lucide-react';

import { useNetworkStore } from '../../store/networkStore';
import './OfflineBanner.css';

export const OfflineBanner = () => {
  const isOnline = useNetworkStore((state) => state.isOnline);
  if (isOnline) return null;

  return (
    <aside className="offline-banner" role="alert" aria-live="assertive">
      <WifiOff size={17} aria-hidden="true" />
      <span>
        <strong>No hay conexión a internet</strong>
        <small>Trabajando en modo local. Algunas funciones de sincronización no están disponibles.</small>
      </span>
    </aside>
  );
};
