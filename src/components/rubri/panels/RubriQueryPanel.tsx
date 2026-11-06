import { useEffect, useRef, useState } from 'react';
import { Info, Plus, X } from 'lucide-react';

import {
  createQueryRow,
  rowsFromUrl,
  urlWithQuery,
  type QueryRow,
} from '../../../lib/queryParams';
import { useApiStore } from '../../../store/apiStore';
import './RubriPanel.css';
import './RubriQueryPanel.css';

/**
 * Pestaña Params: tabla de query params.
 *
 * La URL manda: las filas se derivan de ella y cada edición la reescribe, así
 * que el parámetro se envía con la request y se guarda en MongoDB junto al
 * resto del contenido. Las descripciones se guardan aparte (`queryDescripciones`)
 * porque no forman parte de la URL.
 */
export const RubriQueryPanel = () => {
  const url = useApiStore((state) => state.url);
  const setUrl = useApiStore((state) => state.setUrl);
  const descripciones = useApiStore((state) => state.queryDescripciones);
  const setQueryDescripcion = useApiStore((state) => state.setQueryDescripcion);

  const [rows, setRows] = useState<QueryRow[]>(() =>
    rowsFromUrl(url, useApiStore.getState().queryDescripciones),
  );
  // Última URL escrita por este panel: evita re-sincronizar mientras el
  // usuario escribe (las filas mandan) pero sí al cambiar de request.
  const escritaRef = useRef(url);

  useEffect(() => {
    if (url === escritaRef.current) return;
    escritaRef.current = url;
    setRows(rowsFromUrl(url, useApiStore.getState().queryDescripciones));
  }, [url]);

  const activos = rows.filter((row) => row.key.trim() !== '').length;

  /** Aplica las filas y reescribe la URL (ignora las filas sin nombre). */
  const commit = (next: QueryRow[]) => {
    setRows(next);
    const actual = useApiStore.getState().url;
    const siguiente = urlWithQuery(actual, next);
    if (siguiente === actual) return;
    escritaRef.current = siguiente;
    setUrl(siguiente);
  };

  const updateRow = (id: string, patch: Partial<QueryRow>) => {
    const next = rows.map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    );

    // La descripción no viaja en la URL: se persiste por nombre de parámetro.
    if (patch.description !== undefined) {
      const fila = next.find((row) => row.id === id);
      if (fila && fila.key.trim()) {
        setQueryDescripcion(fila.key.trim(), patch.description);
      }
      setRows(next);
      return;
    }

    commit(next);
  };

  const addRow = () => setRows([...rows, createQueryRow()]);

  const removeRow = (id: string) => {
    const eliminada = rows.find((row) => row.id === id);
    const clave = eliminada?.key.trim() ?? '';

    commit(rows.filter((row) => row.id !== id));

    // Al borrar el parámetro su descripción deja de tener sentido.
    const sigueEnUso = rows.some(
      (row) => row.id !== id && row.key.trim() === clave,
    );
    if (clave && !sigueEnUso && descripciones[clave]) {
      setQueryDescripcion(clave, '');
    }
  };

  return (
    <div className="panel request-panel">
      <div className="panel-toolbar">
        <span className="panel-caption">
          Query Params · {activos} activo{activos === 1 ? '' : 's'}
        </span>
      </div>

      <div className="query-panel">
        <div className="query-grid">
          <div className="query-row query-head">
            <span>Key</span>
            <span>Value</span>
            <span>Description</span>
            <span />
          </div>

          {rows.map((row, index) => (
            <div className="query-row" key={row.id}>
              <input
                type="text"
                className="input mono"
                value={row.key}
                placeholder="Key"
                spellCheck={false}
                onChange={(event) =>
                  updateRow(row.id, { key: event.target.value })
                }
                aria-label={`Nombre del parámetro ${index + 1}`}
              />
              <input
                type="text"
                className="input mono"
                value={row.value}
                placeholder="Value"
                spellCheck={false}
                onChange={(event) =>
                  updateRow(row.id, { value: event.target.value })
                }
                aria-label={`Valor del parámetro ${index + 1}`}
              />
              <input
                type="text"
                className="input"
                value={row.description}
                placeholder="Description"
                onChange={(event) =>
                  updateRow(row.id, { description: event.target.value })
                }
                aria-label={`Descripción del parámetro ${index + 1}`}
              />
              <button
                type="button"
                className="icon-btn small danger"
                onClick={() => removeRow(row.id)}
                aria-label={`Eliminar parámetro ${index + 1}`}
                title="Eliminar parámetro"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-secondary add-query"
          onClick={addRow}
          aria-label="Agregar parámetro"
          title="Agregar parámetro"
        >
          <Plus size={14} />
          Agregar parámetro
        </button>

        <div className="hint">
          <Info size={13} />
          <span>
            Los parámetros se agregan a la URL (<code>?clave=valor</code>) y se
            envían con la request. Las filas sin <code>Key</code> no se envían.
          </span>
        </div>
      </div>
    </div>
  );
};

export default RubriQueryPanel;
