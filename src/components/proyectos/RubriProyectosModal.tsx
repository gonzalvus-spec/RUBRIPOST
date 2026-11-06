import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  FolderKanban,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { useApiStore, type ApiProyecto } from '../../store/apiStore';
import './RubriProyectosModal.css';

/** Paleta de colores disponible para los proyectos. */
const COLORES = [
  '#C5A059',
  '#0A8F4E',
  '#1F9E9E',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#E53E3E',
  '#64748B',
];

const COLOR_POR_DEFECTO = COLORES[0];
const PATRON_CODIGO = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;

interface FormularioProyecto {
  id: string | null;
  codigo: string;
  nombre: string;
  descripcion: string;
  color: string;
}

const formularioVacio = (): FormularioProyecto => ({
  id: null,
  codigo: '',
  nombre: '',
  descripcion: '',
  color: COLOR_POR_DEFECTO,
});

const desdeProyecto = (proyecto: ApiProyecto): FormularioProyecto => ({
  id: proyecto._id,
  codigo: proyecto.codigo,
  nombre: proyecto.nombre,
  descripcion: proyecto.descripcion,
  color: proyecto.color || COLOR_POR_DEFECTO,
});

interface RubriProyectosModalProps {
  /** `crear` abre directamente el formulario de alta. */
  modoInicial?: 'lista' | 'crear';
  onClose: () => void;
  /** Abre un proyecto recién creado (la vista confirma cambios sin guardar). */
  onAbrirProyecto: (codigo: string) => void;
}

/**
 * Gestión de proyectos: alta, edición y borrado, todo desde el mismo panel.
 * Cada proyecto es un espacio de trabajo aislado (requests, colecciones y
 * cookies por `eid`).
 */
export const RubriProyectosModal = ({
  modoInicial = 'lista',
  onClose,
  onAbrirProyecto,
}: RubriProyectosModalProps) => {
  const proyectos = useApiStore((state) => state.proyectos);
  const eidActivo = useApiStore((state) => state.eid);
  const crearProyecto = useApiStore((state) => state.crearProyecto);
  const actualizarProyecto = useApiStore((state) => state.actualizarProyecto);
  const eliminarProyecto = useApiStore((state) => state.eliminarProyecto);

  const [formulario, setFormulario] = useState<FormularioProyecto | null>(
    modoInicial === 'crear' ? formularioVacio() : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (formulario) {
          setFormulario(null);
          setError(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [formulario, onClose]);

  const codigosExistentes = useMemo(
    () => new Set(proyectos.map((proyecto) => proyecto.codigo.toLowerCase())),
    [proyectos],
  );

  const editar = (proyecto: ApiProyecto) => {
    setError(null);
    setConfirmando(null);
    setFormulario(desdeProyecto(proyecto));
  };

  const validar = (datos: FormularioProyecto): string | null => {
    if (!datos.nombre.trim()) return 'El nombre del proyecto es obligatorio';
    const codigo = datos.codigo.trim();
    if (!PATRON_CODIGO.test(codigo)) {
      return 'El código debe tener 2-40 caracteres: letras, números, guion, guion bajo o punto';
    }
    const original = proyectos.find((proyecto) => proyecto._id === datos.id);
    const codigoNormalizado = codigo.toLowerCase();
    if (
      codigosExistentes.has(codigoNormalizado) &&
      (!original || original.codigo.toLowerCase() !== codigoNormalizado)
    ) {
      return `El código ${codigo.toUpperCase()} ya está en uso`;
    }
    return null;
  };

  const guardar = async () => {
    if (!formulario || guardando) return;

    const problema = validar(formulario);
    if (problema) {
      setError(problema);
      return;
    }

    setGuardando(true);
    setError(null);

    const entrada = {
      codigo: formulario.codigo.trim(),
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim(),
      color: formulario.color,
    };

    if (formulario.id) {
      const actualizado = await actualizarProyecto(formulario.id, entrada);
      setGuardando(false);
      if (actualizado) setFormulario(null);
      return;
    }

    const codigo = await crearProyecto(entrada);
    setGuardando(false);

    if (codigo) {
      setFormulario(null);
      // Un proyecto recién creado se abre de inmediato: es lo esperado.
      onAbrirProyecto(codigo);
      onClose();
    }
  };

  const borrar = async (proyecto: ApiProyecto, cascada: boolean) => {
    setConfirmando(null);
    const ok = await eliminarProyecto(proyecto._id, cascada);
    if (ok && formulario?.id === proyecto._id) setFormulario(null);
  };

  return (
    <div className="proyectos-overlay" role="dialog" aria-modal="true" aria-label="Proyectos">
      <div className="proyectos-panel">
        <header className="proyectos-head">
          <div className="proyectos-title">
            <FolderKanban size={16} />
            <div>
              <h2>Proyectos</h2>
              <p>
                Cada proyecto guarda sus propias requests, colecciones y cookies. El
                proyecto activo es <b>{eidActivo}</b>.
              </p>
            </div>
          </div>
          <div className="proyectos-head-actions">
            <button
              type="button"
              className="proyectos-btn primary"
              onClick={() => {
                setError(null);
                setFormulario(formularioVacio());
              }}
            >
              <Plus size={13} />
              Nuevo
            </button>
            <button
              type="button"
              className="proyectos-close"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="proyectos-body">
          <div className="proyectos-lista">
            {proyectos.length === 0 && (
              <p className="proyectos-vacio">
                Todavía no hay proyectos. Crea el primero para empezar a guardar
                requests.
              </p>
            )}

            {proyectos.map((proyecto) => {
              const activo = proyecto.codigo === eidActivo;
              const enEdicion = formulario?.id === proyecto._id;

              return (
                <div
                  key={proyecto._id}
                  className={clsx('proyecto-card', { active: activo, editing: enEdicion })}
                >
                  <span
                    className="proyecto-card-color"
                    style={{ background: proyecto.color }}
                  />

                  <button
                    type="button"
                    className="proyecto-card-main"
                    onClick={() => editar(proyecto)}
                    title="Editar proyecto"
                  >
                    <span className="proyecto-card-nombre">
                      {proyecto.nombre}
                      {activo && (
                        <span className="proyecto-badge">
                          <Check size={10} />
                          Activo
                        </span>
                      )}
                    </span>
                    <span className="proyecto-card-codigo">{proyecto.codigo}</span>
                    {proyecto.descripcion && (
                      <span className="proyecto-card-desc">{proyecto.descripcion}</span>
                    )}
                    <span className="proyecto-card-meta">
                      {proyecto.total_requests} request(s) · {proyecto.total_colecciones}{' '}
                      colección(es)
                    </span>
                  </button>

                  <div className="proyecto-card-actions">
                    {confirmando === proyecto._id ? (
                      <div className="proyecto-confirm">
                        <span>¿Eliminar «{proyecto.nombre}»?</span>
                        <div className="proyecto-confirm-actions">
                          <button
                            type="button"
                            className="proyectos-btn danger"
                            onClick={() => void borrar(proyecto, true)}
                            title="Elimina el proyecto y todo su contenido"
                          >
                            Con contenido
                          </button>
                          <button
                            type="button"
                            className="proyectos-btn"
                            onClick={() => void borrar(proyecto, false)}
                            title="Elimina solo la ficha del proyecto"
                          >
                            Solo proyecto
                          </button>
                          <button
                            type="button"
                            className="proyectos-btn ghost"
                            onClick={() => setConfirmando(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="proyectos-icon"
                          onClick={() => editar(proyecto)}
                          aria-label={`Editar ${proyecto.nombre}`}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="proyectos-icon danger"
                          onClick={() => setConfirmando(proyecto._id)}
                          aria-label={`Eliminar ${proyecto.nombre}`}
                          title={
                            proyectos.length <= 1
                              ? 'Debe existir al menos un proyecto'
                              : 'Eliminar'
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <section className="proyecto-form">
            {formulario ? (
              <>
                <h3>{formulario.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>

                <label className="proyecto-field">
                  <span>Nombre *</span>
                  <input
                    type="text"
                    value={formulario.nombre}
                    placeholder="Ej. Facturación SUNAT"
                    autoFocus
                    onChange={(event) =>
                      setFormulario({ ...formulario, nombre: event.target.value })
                    }
                  />
                </label>

                <label className="proyecto-field">
                  <span>Código (EID) *</span>
                  <input
                    type="text"
                    value={formulario.codigo}
                    placeholder="Ej. EMP-0042"
                    spellCheck={false}
                    onChange={(event) =>
                      setFormulario({ ...formulario, codigo: event.target.value })
                    }
                  />
                  <small>
                    Identifica el proyecto en MongoDB. Cambiarlo migra sus requests y
                    cookies al nuevo código.
                  </small>
                </label>

                <label className="proyecto-field">
                  <span>Descripción</span>
                  <textarea
                    rows={2}
                    value={formulario.descripcion}
                    placeholder="Para qué se usa este proyecto (opcional)"
                    onChange={(event) =>
                      setFormulario({ ...formulario, descripcion: event.target.value })
                    }
                  />
                </label>

                <div className="proyecto-field">
                  <span>Color</span>
                  <div className="proyecto-colores">
                    {COLORES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={clsx('proyecto-color', {
                          selected: formulario.color === color,
                        })}
                        style={{ background: color }}
                        onClick={() => setFormulario({ ...formulario, color })}
                        aria-label={`Color ${color}`}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                {error && <p className="proyecto-error">{error}</p>}

                <div className="proyecto-form-actions">
                  <button
                    type="button"
                    className="proyectos-btn primary"
                    onClick={() => void guardar()}
                    disabled={guardando}
                  >
                    {guardando ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    {formulario.id ? 'Guardar cambios' : 'Crear y abrir'}
                  </button>
                  <button
                    type="button"
                    className="proyectos-btn"
                    onClick={() => {
                      setFormulario(null);
                      setError(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="proyecto-form-vacio">
                <FolderKanban size={22} />
                <p>Selecciona un proyecto para editarlo o crea uno nuevo.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default RubriProyectosModal;
