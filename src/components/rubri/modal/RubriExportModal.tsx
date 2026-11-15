import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Download, FileJson, Folder, LoaderCircle, Search, ShieldAlert, X } from 'lucide-react';
import { collectionSubtreeIds, errorMessage, groupRequestsByCollection, useApiStore, type ApiWorkspace } from '../../../store/apiStore';
import { buildCollectionExport, downloadJson } from '../../../lib/jsonExport';
import { notify } from '../../../lib/alerts';
import './RubriExportModal.css';

export const RubriExportModal = ({ onClose }: { onClose: () => void }) => {
  const collections = useApiStore((state) => state.collections);
  const eid = useApiStore((state) => state.eid);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupRequestsByCollection(collections, []), [collections]);
  const visibleGroups = groups.filter(({ collection, ancestors }) =>
    [collection.nombre, ...ancestors.map((id) => collections.find((item) => item._id === id)?.nombre ?? '')]
      .join(' ').toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selectedIds = collections.filter((item) => selected.has(item._id)).map((item) => item._id);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, busy]);

  const toggle = (id: string) => {
    const subtree = collectionSubtreeIds(collections, id);
    setSelected((current) => {
      const next = new Set(current);
      const remove = [...subtree].every((item) => current.has(item));
      for (const item of subtree) { if (remove) next.delete(item); else next.add(item); }
      return next;
    });
  };

  const exportar = async () => {
    setBusy(true);
    setError(null);
    try {
      const workspace = await invoke<ApiWorkspace>('export_api_collections', {
        payload: { eid, ids: selectedIds },
      });
      const saved = await downloadJson(buildCollectionExport(workspace, eid, includeCredentials),
        `rubripost-${eid}-${new Date().toISOString().slice(0, 10)}.json`);
      if (saved) { notify.success('Colecciones exportadas a JSON'); onClose(); }
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="export-overlay" onClick={() => { if (!busy) onClose(); }}>
      <section className="export-panel" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}>
        <header className="export-header">
          <FileJson size={23} />
          <div><h2 id="export-title">Exportar colecciones</h2><p>Selecciona las carpetas y luego elige dónde guardar el JSON.</p></div>
          <button type="button" className="icon-btn" aria-label="Cerrar exportación" onClick={onClose} disabled={busy}><X size={17} /></button>
        </header>
        <div className="export-toolbar">
          <label className="export-search"><Search size={14} /><input autoFocus type="search" placeholder="Buscar colección…" aria-label="Buscar colección para exportar" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button type="button" className="btn btn-secondary compact" disabled={busy || collections.length === 0} onClick={() => setSelected(selectedIds.length === collections.length ? new Set() : new Set(collections.map((item) => item._id)))}>
            {selectedIds.length === collections.length && collections.length > 0 ? 'Desmarcar todas' : 'Seleccionar todas'}
          </button>
        </div>
        <p className="export-help">Al marcar una carpeta se incluyen sus subcolecciones. Puedes desmarcarlas individualmente.</p>
        <div className="export-list">
          {visibleGroups.map(({ collection, depth }) => {
            const subtree = [...collectionSubtreeIds(collections, collection._id)];
            const all = subtree.every((id) => selected.has(id));
            const some = subtree.some((id) => selected.has(id));
            return (
              <label className="export-collection" key={collection._id} style={{ paddingLeft: 14 + depth * 18 }}>
                <input type="checkbox" checked={all} ref={(element) => { if (element) element.indeterminate = some && !all; }} onChange={() => toggle(collection._id)} disabled={busy} />
                <Folder size={16} style={{ color: collection.color }} />
                <span>{collection.nombre}</span>
                {depth > 0 && <small>Subcolección</small>}
              </label>
            );
          })}
          {collections.length === 0 && <p className="export-help">No hay colecciones en este proyecto.</p>}
          {collections.length > 0 && visibleGroups.length === 0 && <p className="export-help">No hay colecciones que coincidan con la búsqueda.</p>}
        </div>
        <div className="export-options">
          <label><input type="checkbox" checked={includeCredentials} onChange={(event) => setIncludeCredentials(event.target.checked)} disabled={busy} /> Incluir autenticación y headers sensibles</label>
          <p><ShieldAlert size={14} />{includeCredentials ? 'Las credenciales se exportarán en texto legible. Comparte el archivo con cuidado.' : 'Se omiten autenticación y headers sensibles. Revisa también los datos de las URLs y bodies antes de compartir.'}</p>
          <small>Solo se exportan cambios guardados. Se conserva la jerarquía y el orden de las peticiones.</small>
        </div>
        {error && <p className="export-error" role="alert">{error}</p>}
        <footer className="export-footer">
          <span aria-live="polite">{selectedIds.length} de {collections.length} colecciones seleccionadas</span>
          <button type="button" className="btn btn-secondary compact" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-primary compact" onClick={() => void exportar()} disabled={busy || selectedIds.length === 0}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} {busy ? 'Exportando…' : 'Exportar JSON'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
