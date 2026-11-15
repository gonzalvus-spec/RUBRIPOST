import { invoke } from '@tauri-apps/api/core';

import { useAuthStore } from '../store/authStore';
import { useApiStore } from '../store/apiStore';

/** Entidad afectada por un cambio registrado en la bitácora. */
export type EntidadAuditada =
  | 'request'
  | 'collection'
  | 'proyecto'
  | 'usuario'
  | 'sesion';

export interface CambioAuditado {
  /** Proyecto capturado al iniciar una operación asíncrona. */
  eid?: string;
  /** Acción en pasado: "Creó request", "Eliminó colección"... */
  accion: string;
  entidad: EntidadAuditada;
  entidadId?: string | null;
  /** Nombre legible del elemento afectado. */
  nombre?: string | null;
  detalle?: string | null;
}

/**
 * Registra el cambio en la colección `historial` de MongoDB con el usuario
 * autenticado. La fecha y hora las pone el backend. No bloquea la UI: si el
 * registro falla solo se avisa por consola.
 */
export const registrarCambio = (cambio: CambioAuditado): void => {
  // La organización de carpetas/colecciones es estado de navegación, no una
  // actividad relevante del workspace. Este filtro central también cubre
  // futuras operaciones sobre subcolecciones.
  if (cambio.entidad === 'collection') return;

  const usuario = useAuthStore.getState().sesion?.usuario;
  if (!usuario) return;

  void invoke('registrar_historial', {
    payload: {
      usuario,
      eid: cambio.eid ?? useApiStore.getState().eid,
      accion: cambio.accion,
      entidad: cambio.entidad,
      entidad_id: cambio.entidadId ?? null,
      nombre: cambio.nombre ?? null,
      detalle: cambio.detalle ?? null,
    },
  }).catch((error) => {
    console.warn('No se pudo registrar el cambio en el historial', error);
  });
};
