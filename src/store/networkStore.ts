import { create } from 'zustand';

const currentBrowserStatus = (): boolean =>
  typeof navigator === 'undefined' ? true : navigator.onLine;

export const browserIsOnline = currentBrowserStatus;

const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error ?? '');
};

const NETWORK_ERROR_MARKERS = [
  'no hay conexión',
  'no internet',
  'network error',
  'networkerror',
  'failed to fetch',
  'connection refused',
  'connection reset',
  'connection closed',
  'server selection',
  'timed out',
  'timeout',
  'tiempo de espera',
  'tardó demasiado',
  'agotó el tiempo',
  'comprueba tu conexión',
  'dns',
  'tcp',
  'failed to lookup',
  'no se pudo conectar a mongodb',
];

export const isNetworkFailure = (error: unknown): boolean => {
  if (!currentBrowserStatus()) return true;
  const text = errorText(error).toLowerCase();
  return NETWORK_ERROR_MARKERS.some((marker) => text.includes(marker));
};

interface NetworkState {
  isOnline: boolean;
  lastFailure: string | null;
  setBrowserStatus: (online: boolean) => void;
  reportFailure: (error: unknown) => void;
  reportSuccess: () => void;
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  isOnline: currentBrowserStatus(),
  lastFailure: null,
  setBrowserStatus: (online) => set({
    isOnline: online,
    lastFailure: online ? null : 'El dispositivo está sin conexión',
  }),
  reportFailure: (error) => {
    if (!isNetworkFailure(error)) return;
    set({ isOnline: false, lastFailure: errorText(error) || 'Error de conexión' });
  },
  reportSuccess: () => {
    if (currentBrowserStatus()) set({ isOnline: true, lastFailure: null });
  },
}));

export const networkStatus = () => useNetworkStore.getState();
