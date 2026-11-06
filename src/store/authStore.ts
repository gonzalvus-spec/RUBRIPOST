import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

/** Usuario autenticado (datos públicos devueltos por el backend). */
export interface SesionUsuario {
  usuario: string;
  nombre: string;
  rol: string;
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

const esSesionValida = (valor: unknown): valor is SesionUsuario => {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro.usuario === 'string' &&
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
    return esSesionValida(datos) ? datos : null;
  } catch {
    return null;
  }
};

const guardarSesion = (sesion: SesionUsuario | null): void => {
  try {
    if (sesion) {
      window.localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
    } else {
      window.localStorage.removeItem(SESION_KEY);
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
  cerrarSesion: () => Promise<void>;
  limpiarError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  sesion: leerSesionGuardada(),
  hayUsuarios: null,
  cargando: false,
  error: null,

  comprobarUsuarios: async () => {
    try {
      const hay = await invoke<boolean>('hay_usuarios');
      set({ hayUsuarios: hay });
    } catch (error) {
      // Si MongoDB no responde, el login mostrará el error al intentar entrar.
      set({ hayUsuarios: true, error: mensaje(error) });
    }
  },

  login: async (usuario, password) => {
    set({ cargando: true, error: null });
    try {
      const sesion = await invoke<SesionUsuario>('login', {
        payload: { usuario, password },
      });
      guardarSesion(sesion);
      set({ sesion, hayUsuarios: true, cargando: false, error: null });
      return true;
    } catch (error) {
      set({ cargando: false, error: mensaje(error) });
      return false;
    }
  },

  crearUsuario: async (payload) => {
    set({ cargando: true, error: null });
    try {
      const sesion = await invoke<SesionUsuario>('crear_usuario', {
        payload: {
          usuario: payload.usuario,
          nombre: payload.nombre,
          password: payload.password,
          rol: payload.rol ?? null,
          admin_usuario: payload.adminUsuario ?? null,
          admin_password: payload.adminPassword ?? null,
        },
      });
      set({ cargando: false, error: null });
      // El primer administrador queda autenticado directamente.
      if (get().hayUsuarios === false) {
        guardarSesion(sesion);
        set({ sesion, hayUsuarios: true });
      }
      return true;
    } catch (error) {
      set({ cargando: false, error: mensaje(error) });
      return false;
    }
  },

  cerrarSesion: async () => {
    const usuario = get().sesion?.usuario;
    guardarSesion(null);
    set({ sesion: null, error: null });
    if (!usuario) return;
    try {
      await invoke('cerrar_sesion', { usuario });
    } catch (error) {
      console.warn('No se pudo registrar el cierre de sesión', error);
    }
  },

  limpiarError: () => set({ error: null }),
}));

export default useAuthStore;
