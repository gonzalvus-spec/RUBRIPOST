import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, Folder, FolderPlus, Search } from 'lucide-react';

import type { ApiCollection } from '../../../store/apiStore';
import './RubriCollectionMenu.css';

interface RubriCollectionMenuProps {
  collections: ApiCollection[];
  activeId: string | null;
  /** Requests guardadas por colección (se muestra como contador). */
  counts: Record<string, number>;
  onSelect: (collectionId: string) => void;
  onNewCollection: () => void;
}

/**
 * Selector de colección de la request.
 *
 * Reemplaza al `<select>` nativo, cuyo desplegable lo dibuja el sistema
 * operativo (fondo claro, fuera de tema y encima de la barra de URL). Aquí el
 * menú es propio: tema Rubrifact, buscador, contador de requests y acceso
 * directo a crear una colección.
 */
export const RubriCollectionMenu = ({
  collections,
  activeId,
  counts,
  onSelect,
  onNewCollection,
}: RubriCollectionMenuProps) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const buscadorRef = useRef<HTMLInputElement | null>(null);

  const activa = collections.find((collection) => collection._id === activeId) ?? null;

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return collections;
    return collections.filter((collection) =>
      collection.nombre.toLowerCase().includes(termino),
    );
  }, [busqueda, collections]);

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!contenedorRef.current?.contains(event.target as Node)) {
        setAbierto(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setBusqueda('');
    setResaltado(
      Math.max(
        0,
        collections.findIndex((collection) => collection._id === activeId),
      ),
    );
    // El buscador solo aparece con muchas colecciones: se enfoca si existe.
    window.setTimeout(() => buscadorRef.current?.focus(), 0);
  }, [abierto, activeId, collections]);

  const elegir = (id: string) => {
    onSelect(id);
    setAbierto(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setAbierto(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setResaltado((valor) => Math.min(valor + 1, visibles.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setResaltado((valor) => Math.max(valor - 1, 0));
      return;
    }
    if (event.key === 'Enter' && abierto && visibles[resaltado]) {
      event.preventDefault();
      elegir(visibles[resaltado]._id);
    }
  };

  return (
    <div className="collection-menu" ref={contenedorRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={clsx('crumb-collection', { open: abierto })}
        onClick={() => setAbierto((valor) => !valor)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Colección de la request"
        title={activa ? `Colección: ${activa.nombre}` : 'Elegir colección'}
      >
        <Folder
          size={14}
          className="crumb-folder-icon"
          style={{
            color: activa?.color ?? '#0A8F4E',
            filter: `drop-shadow(0 0 6px ${activa?.color ?? '#0A8F4E'}55)`,
          }}
        />
        <span className="crumb-collection-name">{activa?.nombre ?? 'Sin colección'}</span>
        <ChevronDown size={12} className="crumb-select-arrow" />
      </button>

      {abierto && (
        <div className="collection-pop" role="dialog" aria-label="Colecciones">
          {collections.length > 5 && (
            <label className="collection-search">
              <Search size={12} />
              <input
                ref={buscadorRef}
                type="text"
                value={busqueda}
                placeholder="Buscar colección…"
                onChange={(event) => {
                  setBusqueda(event.target.value);
                  setResaltado(0);
                }}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
          )}

          <div className="collection-list" role="listbox" aria-label="Colecciones">
            {visibles.length === 0 && (
              <p className="collection-empty">No hay colecciones con ese nombre.</p>
            )}

            {visibles.map((collection, index) => {
              const esActiva = collection._id === activeId;
              return (
                <button
                  key={collection._id}
                  type="button"
                  role="option"
                  aria-selected={esActiva}
                  className={clsx('collection-option', {
                    active: esActiva,
                    highlighted: index === resaltado,
                  })}
                  onMouseEnter={() => setResaltado(index)}
                  onClick={() => elegir(collection._id)}
                >
                  <span
                    className="collection-dot"
                    style={{ background: collection.color, boxShadow: `0 0 6px ${collection.color}66` }}
                  />
                  <span className="collection-option-name">{collection.nombre}</span>
                  <span className="collection-count">{counts[collection._id] ?? 0}</span>
                  {esActiva && <Check size={12} className="collection-check" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="collection-new"
            onClick={() => {
              setAbierto(false);
              onNewCollection();
            }}
          >
            <FolderPlus size={13} />
            Nueva colección
          </button>
        </div>
      )}
    </div>
  );
};

export default RubriCollectionMenu;
