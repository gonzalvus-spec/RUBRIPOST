import { Info, Plus, X } from 'lucide-react';

import { createHeaderRow, useApiStore, type HeaderRow } from '../../../store/apiStore';
import './RubriPanel.css';
import './RubriHeadersPanel.css';

/** Pestaña Headers: filas de cabeceras manuales. */
export const RubriHeadersPanel = () => {
  const headerRows = useApiStore((state) => state.headerRows);
  const setHeaderRows = useApiStore((state) => state.setHeaderRows);

  const activeHeaders = headerRows.filter((row) => row.enabled && row.key.trim()).length;

  const updateRow = (id: string, patch: Partial<HeaderRow>) => {
    setHeaderRows(
      headerRows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => setHeaderRows([...headerRows, createHeaderRow()]);

  const removeRow = (id: string) =>
    setHeaderRows(headerRows.filter((row) => row.id !== id));

  return (
    <div className="panel request-panel">
      <div className="panel-toolbar">
        <span className="panel-caption">Headers · {activeHeaders} activos</span>
      </div>

      <div className="headers-panel">
        <div className="headers-grid">
          <div className="headers-row header-row">
            <span />
            <span>Header</span>
            <span>Value</span>
            <span />
          </div>

          {headerRows.map((row, index) => (
            <div className="headers-row" key={row.id}>
              <input
                type="checkbox"
                className="header-check"
                checked={row.enabled}
                onChange={(event) => updateRow(row.id, { enabled: event.target.checked })}
                aria-label={`Activar header ${index + 1}`}
                title="Activar/desactivar header"
              />
              <input
                type="text"
                className="input mono"
                value={row.key}
                placeholder="Header"
                spellCheck={false}
                onChange={(event) => updateRow(row.id, { key: event.target.value })}
                aria-label={`Nombre del header ${index + 1}`}
              />
              <input
                type="text"
                className="input mono"
                value={row.value}
                placeholder="Value"
                spellCheck={false}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                aria-label={`Valor del header ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn small danger"
                onClick={() => removeRow(row.id)}
                aria-label={`Eliminar header ${index + 1}`}
                title="Eliminar header"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-secondary add-header"
          onClick={addRow}
          aria-label="Agregar header"
          title="Agregar header"
        >
          <Plus size={14} />
          Agregar header
        </button>

        <div className="hint">
          <Info size={13} />
          <span>
            El header <code>Authorization</code> se genera automáticamente desde la
            pestaña Auth y prevalece sobre uno manual.
          </span>
        </div>
      </div>
    </div>
  );
};

export default RubriHeadersPanel;
