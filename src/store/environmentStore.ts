import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { confirmAction, notify } from '../lib/alerts';
import { activeVariableMap } from '../lib/environmentVariables';
import { useAuthStore } from './authStore';

export type EnvironmentVariableType = 'default' | 'secret';

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  type: EnvironmentVariableType;
  enabled: boolean;
  description: string;
}

export interface ApiEnvironment {
  _id: string;
  eid: string;
  nombre: string;
  variables: EnvironmentVariable[];
  timestamp: string;
  updated_at: string;
}

interface EnvironmentState {
  eid: string;
  environments: ApiEnvironment[];
  activeEnvironmentId: string | null;
  editorEnvironmentId: string | null;
  loading: boolean;
  saving: boolean;
  sync: (eid: string, options?: { silent?: boolean }) => Promise<void>;
  selectActive: (id: string | null) => void;
  openEditor: (id: string | null) => void;
  createEnvironment: () => Promise<ApiEnvironment | null>;
  saveEnvironment: (environment: ApiEnvironment, quiet?: boolean) => Promise<ApiEnvironment | null>;
  duplicateEnvironment: (id: string) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setVariablesFromScript: (values: Record<string, string>) => Promise<void>;
  activeVariables: () => Record<string, string>;
  reset: () => void;
}

const selectionKey = (eid: string) => `rubri.environment.active.${eid}`;
const currentUser = () => useAuthStore.getState().sesion?.usuario ?? '';
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export const createEnvironmentVariable = (): EnvironmentVariable => ({
  id: `variable-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  key: '', value: '', type: 'default', enabled: true, description: '',
});

let syncSequence = 0;

export const useEnvironmentStore = create<EnvironmentState>()((set, get) => ({
  eid: '', environments: [], activeEnvironmentId: null, editorEnvironmentId: null,
  loading: false, saving: false,

  sync: async (eid, options = {}) => {
    const requestId = ++syncSequence;
    const sameProject = get().eid === eid;
    set({
      eid,
      loading: options.silent && sameProject ? get().loading : true,
      environments: sameProject ? get().environments : [],
      activeEnvironmentId: sameProject ? get().activeEnvironmentId : null,
      editorEnvironmentId: sameProject ? get().editorEnvironmentId : null,
      saving: sameProject ? get().saving : false,
    });
    if (!eid.trim()) {
      set({ loading: false });
      return;
    }
    try {
      const incoming = await invoke<ApiEnvironment[]>('get_environments', { eid });
      if (requestId !== syncSequence || get().eid !== eid) return;
      const environments = incoming.filter((environment) => environment.eid === eid);
      const remembered = localStorage.getItem(selectionKey(eid));
      const activeEnvironmentId = remembered && environments.some((item) => item._id === remembered) ? remembered : null;
      set({ eid, environments, activeEnvironmentId, loading: false });
    } catch (error) {
      if (requestId !== syncSequence || get().eid !== eid) return;
      set({ loading: false });
      if (!options.silent) notify.error('No se pudieron cargar los entornos', errorText(error));
    }
  },

  selectActive: (id) => {
    const { eid, environments } = get();
    if (id && !environments.some((environment) => environment._id === id && environment.eid === eid)) return;
    if (id) localStorage.setItem(selectionKey(eid), id); else localStorage.removeItem(selectionKey(eid));
    set({ activeEnvironmentId: id });
  },
  openEditor: (id) => set((state) => ({
    editorEnvironmentId: id && state.environments.some((environment) => environment._id === id && environment.eid === state.eid) ? id : null,
  })),

  createEnvironment: async () => {
    const { eid } = get();
    if (!eid) return null;
    try {
      const saved = await invoke<ApiEnvironment>('save_environment', { payload: {
        id: null, eid, nombre: 'Nuevo entorno', variables: [createEnvironmentVariable()], usuario: currentUser(),
      }});
      if (get().eid !== eid) return null;
      if (saved.eid !== eid) {
        notify.error('MongoDB devolvió un entorno de otro proyecto');
        return null;
      }
      set((state) => ({ environments: [...state.environments, saved], editorEnvironmentId: saved._id }));
      notify.success('Entorno creado');
      return saved;
    } catch (error) { notify.error('No se pudo crear el entorno', errorText(error)); return null; }
  },

  saveEnvironment: async (environment, quiet = false) => {
    const eid = get().eid;
    if (!eid || environment.eid !== eid || !get().environments.some((item) => item._id === environment._id && item.eid === eid)) {
      if (!quiet) notify.error('El entorno no pertenece al proyecto activo');
      return null;
    }
    set({ saving: true });
    try {
      const saved = await invoke<ApiEnvironment>('save_environment', { payload: {
        id: environment._id, eid, nombre: environment.nombre,
        variables: environment.variables, usuario: currentUser(),
      }});
      if (get().eid !== eid) return null;
      if (saved.eid !== eid) {
        set({ saving: false });
        if (!quiet) notify.error('MongoDB devolvió un entorno de otro proyecto');
        return null;
      }
      set((state) => ({ saving: false, environments: state.environments.map((item) => item._id === saved._id ? saved : item) }));
      if (!quiet) notify.success('Entorno guardado');
      return saved;
    } catch (error) { if (get().eid === eid) set({ saving: false }); notify.error('No se pudo guardar el entorno', errorText(error)); return null; }
  },

  duplicateEnvironment: async (id) => {
    const eid = get().eid;
    if (!get().environments.some((item) => item._id === id && item.eid === eid)) return;
    try {
      const copy = await invoke<ApiEnvironment>('duplicate_environment', { payload: { id, eid, usuario: currentUser() } });
      if (get().eid !== eid || copy.eid !== eid) return;
      set((state) => ({ environments: [...state.environments, copy], editorEnvironmentId: copy._id }));
      notify.success('Entorno duplicado');
    } catch (error) { notify.error('No se pudo duplicar el entorno', errorText(error)); }
  },

  deleteEnvironment: async (id) => {
    const environment = get().environments.find((item) => item._id === id);
    const eid = get().eid;
    if (!environment || environment.eid !== eid) return;
    const confirmed = await confirmAction({ title: `¿Eliminar "${environment.nombre}"?`, text: 'Se eliminarán todas sus variables.', confirmText: 'Eliminar', danger: true });
    if (!confirmed) return;
    try {
      await invoke('delete_environment', { payload: { id, eid, usuario: currentUser() } });
      if (get().eid !== eid) return;
      if (get().activeEnvironmentId === id) get().selectActive(null);
      set((state) => ({ environments: state.environments.filter((item) => item._id !== id), editorEnvironmentId: state.editorEnvironmentId === id ? null : state.editorEnvironmentId }));
      notify.success('Entorno eliminado');
    } catch (error) { notify.error('No se pudo eliminar el entorno', errorText(error)); }
  },

  setVariablesFromScript: async (values) => {
    if (Object.keys(values).length === 0) return;
    const { eid, activeEnvironmentId, environments } = get();
    const environment = environments.find((item) => item._id === activeEnvironmentId && item.eid === eid);
    if (!environment) throw new Error('bru.setEnvVar / pm.environment.set requiere un Environment activo');
    const variables = [...environment.variables];
    for (const [key, value] of Object.entries(values)) {
      const index = variables.findIndex((item) => item.key === key);
      if (index >= 0) variables[index] = { ...variables[index], value, enabled: true };
      else variables.push({ ...createEnvironmentVariable(), key, value });
    }
    const next = { ...environment, variables };
    set((state) => ({ environments: state.environments.map((item) => item._id === next._id ? next : item) }));
    const saved = await get().saveEnvironment(next, true);
    if (!saved) throw new Error('No se pudieron persistir las variables modificadas por el script');
  },

  activeVariables: () => {
    const state = get();
    return activeVariableMap(state.environments.find((item) => item._id === state.activeEnvironmentId && item.eid === state.eid)?.variables ?? []);
  },
  reset: () => { ++syncSequence; set({ eid: '', environments: [], activeEnvironmentId: null, editorEnvironmentId: null, loading: false, saving: false }); },
}));
