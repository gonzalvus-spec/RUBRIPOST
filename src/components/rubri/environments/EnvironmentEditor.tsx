import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Check, Ellipsis, Pencil, Plus, Search, Trash2 } from 'lucide-react';

import {
  createEnvironmentVariable,
  useEnvironmentStore,
  type ApiEnvironment,
  type EnvironmentVariable,
  type EnvironmentVariableType,
} from '../../../store/environmentStore';
import './EnvironmentEditor.css';

interface EnvironmentEditorProps {
  environmentId: string | null;
}

const cloneEnvironment = (environment: ApiEnvironment): ApiEnvironment => ({
  ...environment,
  variables: environment.variables.map((variable) => ({ ...variable })),
});

export const EnvironmentEditor = ({ environmentId }: EnvironmentEditorProps) => {
  const environmentEid = useEnvironmentStore((state) => state.eid);
  const environments = useEnvironmentStore((state) => state.environments);
  const openEditor = useEnvironmentStore((state) => state.openEditor);
  const selectActive = useEnvironmentStore((state) => state.selectActive);
  const createEnvironment = useEnvironmentStore((state) => state.createEnvironment);
  const saveEnvironment = useEnvironmentStore((state) => state.saveEnvironment);
  const deleteEnvironment = useEnvironmentStore((state) => state.deleteEnvironment);
  const saving = useEnvironmentStore((state) => state.saving);
  const source = environments.find((item) => item._id === environmentId) ?? null;

  const [search, setSearch] = useState('');
  const [variableType, setVariableType] = useState<EnvironmentVariableType>('default');
  const [draft, setDraft] = useState<ApiEnvironment | null>(() => source ? cloneEnvironment(source) : null);
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newVariable, setNewVariable] = useState({ key: '', value: '', description: '' });
  const nameRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Solo cambia el borrador al seleccionar otro entorno. Una sincronización de
  // MongoDB nunca pisa lo que el usuario todavía no guardó en este editor.
  useEffect(() => {
    const selected = useEnvironmentStore.getState().environments.find((item) => item._id === environmentId);
    setDraft(selected ? cloneEnvironment(selected) : null);
    setVariableType('default');
    setEditingName(false);
    setNewVariable({ key: '', value: '', description: '' });
  }, [environmentId, environmentEid]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuTriggerRef.current?.contains(target)) setOpenMenu(null);
    };
    const closeMenu = () => setOpenMenu(null);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [openMenu]);

  const visibleEnvironments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? environments.filter((item) => item.nombre.toLowerCase().includes(term)) : environments;
  }, [environments, search]);

  const rows = draft?.variables.filter((variable) => variable.type === variableType) ?? [];

  const updateVariable = (id: string, patch: Partial<EnvironmentVariable>) => {
    setDraft((current) => current ? {
      ...current,
      variables: current.variables.map((variable) => variable.id === id ? { ...variable, ...patch } : variable),
    } : null);
  };

  const commitNewVariable = () => {
    if (!draft || !newVariable.key.trim()) return;
    setDraft({
      ...draft,
      variables: [...draft.variables, { ...createEnvironmentVariable(), ...newVariable, key: newVariable.key.trim(), type: variableType }],
    });
    setNewVariable({ key: '', value: '', description: '' });
  };

  const resetDraft = () => {
    const current = useEnvironmentStore.getState().environments.find((item) => item._id === environmentId);
    setDraft(current ? cloneEnvironment(current) : null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const normalized = {
      ...draft,
      nombre: draft.nombre.trim(),
      variables: draft.variables.filter((variable) => variable.key.trim()).map((variable) => ({
        ...variable,
        key: variable.key.trim(),
        enabled: true,
      })),
    };
    const saved = await saveEnvironment(normalized);
    if (saved) setDraft(cloneEnvironment(saved));
  };

  const handleCreate = async () => {
    const created = await createEnvironment();
    if (created) {
      openEditor(created._id);
      selectActive(created._id);
      window.setTimeout(() => setEditingName(true), 0);
    }
  };

  const selectEnvironment = (id: string) => {
    openEditor(id);
    selectActive(id);
    setOpenMenu(null);
  };

  const toggleMenu = (id: string, trigger: HTMLButtonElement) => {
    if (openMenu?.id === id) {
      setOpenMenu(null);
      return;
    }
    menuTriggerRef.current = trigger;
    const rect = trigger.getBoundingClientRect();
    const width = 140;
    const height = 70;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const top = rect.bottom + height <= window.innerHeight - 8
      ? rect.bottom + 4
      : Math.max(8, rect.top - height - 4);
    setOpenMenu({ id, top, left });
  };

  return (
    <section className="environment-manager">
      <aside className="environment-list-pane">
        <div className="environment-list-title">
          <span>ENVIRONMENTS</span>
          <button type="button" onClick={() => void handleCreate()} aria-label="Crear entorno" title="Crear entorno"><Plus size={15} /></button>
        </div>
        <label className="environment-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search environments..." aria-label="Search environments" />
        </label>
        <div className="environment-list">
          {visibleEnvironments.map((environment) => (
            <div className={clsx('environment-list-row', { selected: environment._id === environmentId })} key={environment._id}>
              <button type="button" className="environment-list-main" onClick={() => selectEnvironment(environment._id)}>
                <span className="environment-list-check">{environment._id === environmentId && <Check size={13} />}</span>
                <span>{environment.nombre}</span>
              </button>
              <button type="button" className="environment-menu-trigger" onClick={(event) => toggleMenu(environment._id, event.currentTarget)} aria-label={`Opciones de ${environment.nombre}`} aria-expanded={openMenu?.id === environment._id}><Ellipsis size={15} /></button>
            </div>
          ))}
          {visibleEnvironments.length === 0 && <p className="environment-list-empty">No environments found</p>}
        </div>
      </aside>

      <div className="environment-detail-pane">
        {!draft ? <div className="environment-detail-empty">
          <p>Select an environment to edit its variables.</p>
          <button type="button" onClick={() => void handleCreate()}><Plus size={14} />Create environment</button>
        </div> : <>
          <header className="environment-detail-header">
            <div className="environment-name-wrap">
              <input ref={nameRef} readOnly={!editingName} value={draft.nombre} onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} onBlur={() => setEditingName(false)} aria-label="Environment name" />
              <button type="button" onClick={() => setEditingName(true)} aria-label="Rename environment"><Pencil size={14} /></button>
            </div>
          </header>

          <div className="environment-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={variableType === 'default'} className={clsx({ active: variableType === 'default' })} onClick={() => { setVariableType('default'); setNewVariable({ key: '', value: '', description: '' }); }}>Variables</button>
            <button type="button" role="tab" aria-selected={variableType === 'secret'} className={clsx({ active: variableType === 'secret' })} onClick={() => { setVariableType('secret'); setNewVariable({ key: '', value: '', description: '' }); }}>Secrets</button>
          </div>

          <div className="environment-table-scroll">
            <div className="environment-table-head"><span>Name</span><span>Value</span><span>Description</span></div>
            {rows.map((variable) => <div className="environment-table-row" key={variable.id}>
              <input value={variable.key} onChange={(event) => updateVariable(variable.id, { key: event.target.value })} spellCheck={false} />
              <input type={variableType === 'secret' ? 'password' : 'text'} value={variable.value} onChange={(event) => updateVariable(variable.id, { value: event.target.value })} spellCheck={false} />
              <input value={variable.description} onChange={(event) => updateVariable(variable.id, { description: event.target.value })} />
            </div>)}
            <div className="environment-table-row empty-row" onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) commitNewVariable(); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitNewVariable(); } }}>
              <input value={newVariable.key} placeholder="Add a variable" onChange={(event) => setNewVariable({ ...newVariable, key: event.target.value })} spellCheck={false} />
              <input type={variableType === 'secret' ? 'password' : 'text'} value={newVariable.value} placeholder={variableType === 'secret' ? 'Secret value' : 'Value'} onChange={(event) => setNewVariable({ ...newVariable, value: event.target.value })} spellCheck={false} />
              <input value={newVariable.description} placeholder="Description" onChange={(event) => setNewVariable({ ...newVariable, description: event.target.value })} />
            </div>
          </div>

          <footer className="environment-editor-footer">
            <button type="button" className="environment-save" disabled={saving || !draft.nombre.trim()} onClick={() => void saveDraft()}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="environment-reset" disabled={saving} onClick={resetDraft}>Reset</button>
          </footer>
        </>}
      </div>
      {openMenu && createPortal(
        <div ref={menuRef} className="environment-context-menu environment-context-menu-portal" style={{ top: openMenu.top, left: openMenu.left }} role="menu">
          <button type="button" role="menuitem" onClick={() => { selectEnvironment(openMenu.id); window.setTimeout(() => setEditingName(true), 0); }}><Pencil size={13} />Rename</button>
          <button type="button" role="menuitem" className="danger" onClick={() => { const id = openMenu.id; setOpenMenu(null); void deleteEnvironment(id); }}><Trash2 size={13} />Delete</button>
        </div>,
        document.body,
      )}
    </section>
  );
};
