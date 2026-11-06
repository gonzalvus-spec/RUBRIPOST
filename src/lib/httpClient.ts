import { invoke } from '@tauri-apps/api/core';

/** Cookie guardada en MongoDB (colección `cookies`). */
export interface CookieRegistro {
  id: string;
  dominio: string;
  nombre: string;
  valor: string;
  ruta: string;
  expira: string | null;
  seguro: boolean;
  http_only: boolean;
  actualizado_en: string;
}

export interface ParCabecera {
  nombre: string;
  valor: string;
}

export interface RespuestaHttp {
  status: number;
  status_text: string;
  duration_ms: number;
  content_type: string;
  body: string;
  headers: ParCabecera[];
  cookies: CookieRegistro[];
}

export interface EnviarRequestInput {
  eid: string;
  metodo: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  enviarCookies: boolean;
}

/** Detecta si la app corre dentro de Tauri (comandos nativos disponibles). */
export const estaEnTauri = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

/**
 * Envía la request con el cliente nativo (reqwest) para poder usar cookies y
 * evitar CORS. En el navegador (desarrollo web) cae a `fetch`.
 */
export const enviarRequest = async (entrada: EnviarRequestInput): Promise<RespuestaHttp> => {
  if (estaEnTauri()) {
    return invoke<RespuestaHttp>('enviar_request', {
      payload: {
        eid: entrada.eid,
        metodo: entrada.metodo,
        url: entrada.url,
        headers: entrada.headers,
        body: entrada.body,
        enviar_cookies: entrada.enviarCookies,
      },
    });
  }

  // --- Fallback para el navegador (sin cookies reales) ---------------------
  const inicio = performance.now();
  const respuesta = await fetch(entrada.url, {
    method: entrada.metodo,
    headers: entrada.headers,
    body: entrada.metodo === 'GET' || !entrada.body ? undefined : entrada.body,
  });

  const cuerpo = await respuesta.text();
  return {
    status: respuesta.status,
    status_text: respuesta.statusText || 'OK',
    duration_ms: Math.round(performance.now() - inicio),
    content_type: respuesta.headers.get('content-type') ?? '',
    body: cuerpo,
    headers: [...respuesta.headers.entries()].map(([nombre, valor]) => ({ nombre, valor })),
    cookies: [],
  };
};

/**
 * Cookies guardadas del proyecto (todas, sin importar la request ni la
 * colección) o, si se pasa `url`, solo las que aplican a ese dominio.
 */
export const listarCookies = async (
  eid: string,
  url?: string | null,
): Promise<CookieRegistro[]> =>
  invoke<CookieRegistro[]>('listar_cookies', {
    payload: { eid, url: url && url.trim() !== '' ? url : null },
  });

/** Tarro completo del proyecto: es el listado que usa el administrador. */
export const listarCookiesProyecto = async (eid: string): Promise<CookieRegistro[]> =>
  listarCookies(eid);

export const guardarCookie = async (entrada: {
  eid: string;
  url: string;
  nombre: string;
  valor: string;
  ruta?: string | null;
  expira?: string | null;
  seguro?: boolean;
  http_only?: boolean;
  /** Si se indica, edita esa cookie en lugar de crear una nueva. */
  id?: string | null;
  /** Dominio explícito (para editar cookies de un dominio padre). */
  dominio?: string | null;
}): Promise<CookieRegistro> => invoke<CookieRegistro>('guardar_cookie', { payload: entrada });

export const eliminarCookie = async (id: string): Promise<void> =>
  invoke('eliminar_cookie', { payload: { id } });

/**
 * Vacía el tarro de cookies del proyecto; con `dominio` borra solo las de ese
 * dominio (y sus subdominios). Devuelve cuántas se eliminaron.
 */
export const limpiarCookies = async (
  eid: string,
  dominio?: string | null,
): Promise<number> =>
  invoke<number>('limpiar_cookies', {
    payload: { eid, dominio: dominio && dominio.trim() !== '' ? dominio : null },
  });
