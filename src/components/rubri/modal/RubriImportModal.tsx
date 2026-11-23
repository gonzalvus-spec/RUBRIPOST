import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileJson, FolderUp, LoaderCircle, X } from 'lucide-react';

import { alertError, notify } from '../../../lib/alerts';
import { errorMessage, useApiStore } from '../../../store/apiStore';
import './RubriImportModal.css';

export const RubriImportModal = ({ onClose }: { onClose: () => void }) => {
  const importCollectionFromJson = useApiStore((state) => state.importCollectionFromJson);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [busy, onClose]);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      await alertError('Archivo no compatible', 'Selecciona un archivo con extensión .json.');
      return;
    }
    try {
      setRawJson(await file.text());
      setFilename(file.name);
    } catch (error) {
      await alertError('No se pudo leer el archivo', errorMessage(error));
    }
  };

  const importar = async () => {
    if (!rawJson.trim()) {
      await alertError('JSON vacío', 'Selecciona un archivo o pega el contenido JSON.');
      return;
    }
    setBusy(true);
    try {
      const result = await importCollectionFromJson(rawJson);
      notify.success(
        'Colección importada',
        `${result.collections} carpeta(s) y ${result.requests} request(s) agregadas.`,
      );
      onClose();
    } catch (error) {
      await alertError('No se pudo importar el JSON', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="import-overlay" onClick={() => { if (!busy) onClose(); }}>
      <section className="import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(event) => event.stopPropagation()}>
        <header className="import-header">
          <FileJson size={23} />
          <div>
            <h2 id="import-title">Importar colecciones</h2>
            <p>Admite Rubri-Cut 1.0 y exportaciones nativas de RubriPost.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Cerrar importación" onClick={onClose} disabled={busy}><X size={17} /></button>
        </header>

        <div className="import-content">
          <input
            ref={inputRef}
            className="import-file-input"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <button type="button" className="import-file-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FolderUp size={20} />
            <span>{filename ?? 'Seleccionar archivo .json'}</span>
            <small>Se abrirá el selector de archivos del sistema</small>
          </button>
          <label className="import-editor-label" htmlFor="import-json">O pega el JSON directamente</label>
          <textarea
            id="import-json"
            className="import-editor"
            value={rawJson}
            onChange={(event) => { setRawJson(event.target.value); setFilename(null); }}
            placeholder={'{\n  "schemaVersion": "1.0",\n  "name": "Mi colección"\n}'}
            spellCheck={false}
            disabled={busy}
          />
        </div>

        <footer className="import-footer">
          <span>La importación se agregará al proyecto activo.</span>
          <button type="button" className="btn btn-secondary compact" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-primary compact" onClick={() => void importar()} disabled={busy || !rawJson.trim()}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <FolderUp size={14} />}
            {busy ? 'Importando…' : 'Importar JSON'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
