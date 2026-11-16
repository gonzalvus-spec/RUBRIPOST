import { useCallback, useEffect, useRef, useState } from 'react';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

export type AppUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error';

export interface AppUpdaterState {
  status: AppUpdaterStatus;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
  overlay: boolean;
}

export type UpdateCheckResult = 'available' | 'current' | 'error' | 'unavailable';

const INITIAL_STATE: AppUpdaterState = {
  status: 'idle',
  version: null,
  notes: null,
  progress: 0,
  error: null,
  overlay: false,
};

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Gestiona el ciclo completo del updater de Tauri.
 *
 * Comprueba automáticamente al montar la aplicación y expone acciones para
 * volver a comprobar o descargar e instalar la versión encontrada.
 */
export const useAppUpdater = () => {
  const [state, setState] = useState<AppUpdaterState>(INITIAL_STATE);
  const updateRef = useRef<Update | null>(null);
  const automaticCheckStarted = useRef(false);

  const checkForUpdates = useCallback(async (
    options: { visual?: boolean } = {},
  ): Promise<UpdateCheckResult> => {
    if (!isTauri()) return 'unavailable';

    const visual = options.visual ?? true;
    setState((current) => ({
      ...current,
      status: 'checking',
      error: null,
      overlay: visual,
    }));
    try {
      const update = await check();
      updateRef.current = update;

      if (!update) {
        setState(INITIAL_STATE);
        return 'current';
      }

      setState({
        status: 'available',
        version: update.version,
        notes: update.body ?? null,
        progress: 0,
        error: null,
        overlay: false,
      });
      return 'available';
    } catch (error) {
      console.warn('No se pudo buscar actualizaciones', error);
      setState({
        ...INITIAL_STATE,
        status: 'error',
        error: errorMessage(error),
        overlay: false,
      });
      return 'error';
    }
  }, []);

  const downloadAndInstall = useCallback(async (): Promise<void> => {
    const update = updateRef.current;
    if (!update || state.status !== 'available') return;

    let downloaded = 0;
    let total = 0;
    setState((current) => ({
      ...current,
      status: 'downloading',
      progress: 0,
      error: null,
      overlay: true,
    }));

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          return;
        }

        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const progress = total > 0
            ? Math.min(100, Math.round((downloaded / total) * 100))
            : 0;
          setState((current) => ({ ...current, status: 'downloading', progress }));
          return;
        }

        setState((current) => ({ ...current, status: 'installing', progress: 100 }));
      });

      // En Windows el instalador puede cerrar la app antes de llegar aquí. En
      // macOS/Linux este relanzamiento aplica la versión recién instalada.
      await relaunch();
    } catch (error) {
      console.error('No se pudo instalar la actualización', error);
      setState((current) => ({
        ...current,
        status: 'error',
        error: errorMessage(error),
        overlay: false,
      }));
    }
  }, [state.status]);

  useEffect(() => {
    if (automaticCheckStarted.current) return;
    automaticCheckStarted.current = true;
    void checkForUpdates({ visual: false });
  }, [checkForUpdates]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
  };
};

export type AppUpdater = ReturnType<typeof useAppUpdater>;
