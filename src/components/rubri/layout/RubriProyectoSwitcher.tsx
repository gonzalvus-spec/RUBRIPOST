import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, FolderKanban, Plus, Search, Settings2 } from 'lucide-react';

import type { ApiProyecto } from '../../../store/apiStore';
import './RubriProyectoSwitcher.css';

interface RubriProyectoSwitcherProps {
  proyectos: ApiProyecto[];
  /** Código (`eid`) del proyecto activo. */
  activo: string;
  onSelect: (codigo: string) => void;
  onNuevo: () => void;
  onGestionar: () => void;
}

/**
 * Selector de proyecto de la barra superior. Cambiar de proyecto cambia el
 * `eid` de todo el cliente (requests, colecciones y cookies), así que cada
 * espacio de trabajo queda aislado.
 */
export const RubriProyectoSwitcher = ({
  proyectos,
  activo,
  onSelect,
  onNuevo,
  onGestionar,
}: RubriProyectoSwitcherProps) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  const actual = proyectos.find((proyecto) => proyecto.codigo === activo) ?? null;

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return proyectos;
    return proyectos.filter(
      (proyecto) =>
        proyecto.nombre.toLowerCase().includes(termino) ||
        proyecto.codigo.toLowerCase().includes(termino),
    );
  }, [busqueda, proyectos]);

  useEffect(() => {
    if (!abierto) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!contenedorRef.current?.contains(event.target as Node)) {
        setAbierto(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto) setBusqueda('');
  }, [abierto]);

  return (
    <div className="project-switcher" ref={contenedorRef}>
      <button
        type="button"
        className={clsx('project-chip', { open: abierto })}
        onClick={() => setAbierto((valor) => !valor)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={`Proyecto activo: ${actual?.nombre ?? activo} (${activo})`}
      >
        <span
          className="project-chip-dot"
          style={{ background: actual?.color ?? '#C5A059' }}
        />
        <span className="project-chip-body">
          <span className="project-chip-name">{actual?.nombre ?? activo}</span>
          <span className="project-chip-code">{activo}</span>
        </span>
        <ChevronDown size={13} className="project-chip-arrow" />
      </button>

      {abierto && (
        <div className="project-pop" role="dialog" aria-label="Proyectos">
          <div className="project-pop-head">
            <FolderKanban size={13} />
            Proyectos
            <span className="project-pop-count">{proyectos.length}</span>
          </div>

          {proyectos.length > 5 && (
            <label className="project-search">
              <Search size={12} />
              <input
                autoFocus
                type="text"
                value={busqueda}
                placeholder="Buscar proyecto…"
                onChange={(event) => setBusqueda(event.target.value)}
              />
            </label>
          )}

          <div className="project-list" role="listbox">
            {visibles.length === 0 && (
              <p className="project-empty">
                {proyectos.length === 0
                  ? 'Aún no hay proyectos: crea el primero.'
                  : 'Ningún proyecto coincide.'}
              </p>
            )}

            {visibles.map((proyecto) => {
              const esActivo = proyecto.codigo === activo;
              return (
                <button
                  key={proyecto._id}
                  type="button"
                  role="option"
                  aria-selected={esActivo}
                  className={clsx('project-option', { active: esActivo })}
                  onClick={() => {
                    setAbierto(false);
                    onSelect(proyecto.codigo);
                  }}
                >
                  <span
                    className="project-dot"
                    style={{
                      background: proyecto.color,
                      boxShadow: `0 0 6px ${proyecto.color}66`,
                    }}
                  />
                  <span className="project-option-body">
                    <span className="project-option-name">{proyecto.nombre}</span>
                    <span className="project-option-meta">
                      {proyecto.codigo} · {proyecto.total_requests} request(s) ·{' '}
                      {proyecto.total_colecciones} colección(es)
                    </span>
                  </span>
                  {esActivo && <Check size={13} className="project-check" />}
                </button>
              );
            })}
          </div>

          <div className="project-pop-foot">
            <button
              type="button"
              className="project-action"
              onClick={() => {
                setAbierto(false);
                onNuevo();
              }}
            >
              <Plus size={13} />
              Nuevo proyecto
            </button>
            <button
              type="button"
              className="project-action ghost"
              onClick={() => {
                setAbierto(false);
                onGestionar();
              }}
            >
              <Settings2 size={13} />
              Gestionar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RubriProyectoSwitcher;
