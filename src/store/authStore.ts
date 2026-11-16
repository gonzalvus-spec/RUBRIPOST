import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

import { withTimeout } from '../lib/async';
import { browserIsOnline, isNetworkFailure, networkStatus } from './networkStore';

/** Usuario autenticado (datos públicos devueltos por el backend). */
export interface SesionUsuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
}

export interface ActualizarPerfilPayload {
  usuario: string;
  nombre: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface NuevoUsuarioPayload {
  usuario: string;
  nombre: string;
  password: string;
  rol?: string;
  adminUsuario?: string;
  adminPassword?: string;
}

const mensaje = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Error inesperado';
};

/**
 * La sesión se guarda en el almacenamiento local del equipo para que siga
 * abierta aunque se cierre el programa. Solo se borra cuando el usuario pulsa
 * "Cerrar sesión".
 */
const SESION_KEY = 'rubripost.sesion';

export const clearLocalSession = (): void => {
  try {
    window.localStorage.removeItem(SESION_KEY);
  } catch (error) {
    console.warn('No se pudo eliminar la sesión local', error);
  }
  try {
    window.sessionStorage.clear();
  } catch (error) {
    console.warn('No se pudo limpiar el almacenamiento temporal', error);
  }
};

const esSesionValida = (valor: unknown): valor is SesionUsuario => {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.usuario === 'string' &&
    typeof registro.id === 'string' &&
    registro.id.length > 0 &&
    registro.usuario.length > 0 &&
    typeof registro.nombre === 'string' &&
    typeof registro.rol === 'string'
  );
};

const leerSesionGuardada = (): SesionUsuario | null => {
  try {
    const crudo = window.localStorage.getItem(SESION_KEY);
    if (!crudo) return null;
    const datos: unknown = JSON.parse(crudo);
    if (esSesionValida(datos)) return datos;
    clearLocalSession();
    return null;
  } catch {
    clearLocalSession();
    return null;
  }
};

const guardarSesion = (sesion: SesionUsuario | null): void => {
  try {
    if (sesion) {
      window.localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
    } else {
      clearLocalSession();
    }
  } catch (error) {
    console.warn('No se pudo guardar la sesión en el equipo', error);
  }
};

interface AuthState {
  sesion: SesionUsuario | null;
  /** `null` mientras se consulta; `false` si todavía no existe ningún usuario. */
  hayUsuarios: boolean | null;
  cargando: boolean;
  error: string | null;
  comprobarUsuarios: () => Promise<void>;
  login: (usuario: string, password: string) => Promise<boolean>;
  crearUsuario: (payload: NuevoUsuarioPayload) => Promise<boolean>;
  actualizarPerfil: (payload: ActualizarPerfilPayload) => Promise<boolean>;
  cerrarSesion: () => Promise<void>;
  limpiarError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  sesion: leerSesionGuardada(),
  hayUsuarios: null,
  cargando: false,
  error: null,

  comprobarUsuarios: async () => {
    if (!browserIsOnline()) {
      set({ hayUsuarios: true, error: null });
      return;
    }
    try {
      const hay = await withTimeout(invoke<boolean>('hay_usuarios'), 8_000);
      networkStatus().reportSuccess();
      set({ hayUsuarios: hay });
    } catch (error) {
      networkStatus().reportFailure(error);
      set({
        hayUsuarios: true,
        error: isNetworkFailure(error) ? null : mensaje(error),
      });
    }
  },

  login: async (usuario, password) => {
    set({ cargando: true, error: null });
    if (!browserIsOnline()) {
      set({ cargando: false, error: 'No hay conexión a internet' });
      return false;
    }
    try {
      const sesion = await withTimeout(invoke<SesionUsuario>('login', {
        payload: { usuario, password },
      }), 10_000);
      networkStatus().reportSuccess();
      guardarSesion(sesion);
      set({ sesion, hayUsuarios: true, cargando: false, error: null });
      return true;
    } catch (error) {
      networkStatus().reportFailure(error);
      set({
        cargando: false,
        error: isNetworkFailure(error) ? 'No hay conexión a internet' : mensaje(error),
      });
      return false;
    }
  },

  crearUsuario: async (payload) => {
    set({ cargando: true, error: null });
    if (!browserIsOnline()) {
      set({ cargando: false, error: 'No hay conexión a internet' });
      return false;
    }
    try {
      const sesion = await withTimeout(invoke<SesionUsuario>('crear_usuario', {
        payload: {
          usuario: payload.usuario,
          nombre: payload.nombre,
          password: payload.password,
          rol: payload.rol ?? null,
          admin_usuario: payload.adminUsuario ?? null,
          admin_password: payload.adminPassword ?? null,
        },
      }), 10_000);
      networkStatus().reportSuccess();
      set({ cargando: false, error: null });
      // El primer administrador queda autenticado directamente.
      if (get().hayUsuarios === false) {
        guardarSesion(sesion);
        set({ sesion, hayUsuarios: true });
      }
      return true;
    } catch (error) {
      networkStatus().reportFailure(error);
      set({
        cargando: false,
        error: isNetworkFailure(error) ? 'No hay conexión a internet' : mensaje(error),
      });
      return false;
    }
  },

  actualizarPerfil: async (payload) => {
    const actual = get().sesion;
    if (!actual) return false;
    set({ cargando: true, error: null });
    if (!browserIsOnline()) {
      set({ cargando: false, error: 'No hay conexión a internet' });
      return false;
    }
    try {
      const sesion = await withTimeout(invoke<SesionUsuario>('update_user_profile', {
        payload: {
          user_id: actual.id,
          usuario: payload.usuario,
          nombre: payload.nombre,
          current_password: payload.currentPassword ?? null,
          new_password: payload.newPassword ?? null,
        },
      }), 10_000);
      networkStatus().reportSuccess();
      guardarSesion(sesion);
      set({ sesion, cargando: false, error: null });
      return true;
    } catch (error) {
      networkStatus().reportFailure(error);
      set({
        cargando: false,
        error: isNetworkFailure(error) ? 'No hay conexión a internet' : mensaje(error),
      });
      return false;
    }
  },

  cerrarSesion: async () => {
    const usuario = get().sesion?.usuario;
    try {
      // La interfaz y el almacenamiento se limpian de inmediato. El registro
      // remoto es secundario y nunca puede bloquear el logout local.
      guardarSesion(null);
      set({ sesion: null, hayUsuarios: true, cargando: false, error: null });
      if (!usuario || !networkStatus().isOnline) return;
      await withTimeout(invoke('cerrar_sesion', { usuario }), 2_500);
      networkStatus().reportSuccess();
    } catch (error) {
      networkStatus().reportFailure(error);
      console.warn('No se pudo registrar el cierre de sesión', error);
    } finally {
      // Es intencionadamente idempotente: garantiza una sesión limpia incluso
      // si localStorage o la llamada remota fallan a mitad del proceso.
      guardarSesion(null);
      set({ sesion: null, hayUsuarios: true, cargando: false, error: null });
    }
  },

  limpiarError: () => set({ error: null }),
}));

export default useAuthStore;
