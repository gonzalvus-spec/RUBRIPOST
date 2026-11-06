import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, LoaderCircle, RefreshCw, Search, UserPlus, X } from 'lucide-react';

import { useAuthStore } from '../../store/authStore';
import './HistorialModal.css';

/** Entrada de la bitácora devuelta por el backend. */
interface HistorialEntrada {
  usuario: string;
  accion: string;
  entidad: string;
  entidad_id?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  fecha: string;
}

interface HistorialModalProps {
  onClose: () => void;
}

const formatearFecha = (fecha: string): string => {
  if (!fecha) return '—';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return fecha;
  return valor.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const iconoEntidad: Record<string, string> = {
  request: 'Request',
  collection: 'Colección',
  proyecto: 'Proyecto',
  usuario: 'Usuario',
  sesion: 'Sesión',
};

/**
 * Bitácora de cambios: qué hizo cada usuario, sobre qué entidad, con fecha y
 * hora, más el alta de nuevos usuarios (solo administradores).
 */
export const HistorialModal = ({ onClose }: HistorialModalProps) => {
  const sesion = useAuthStore((state) => state.sesion);

  const [entradas, setEntradas] = useState<HistorialEntrada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaClave, setNuevaClave] = useState('');
  const [mensajeAlta, setMensajeAlta] = useState<string | null>(null);

  const esAdmin = sesion?.rol === 'admin';

  const cargar = useCallback(async (usuarioFiltro: string) => {
    setCargando(true);
    setError(null);
    try {
      const datos = await invoke<HistorialEntrada[]>('listar_historial', {
        filtro: { usuario: usuarioFiltro.trim() || null, limit: 300 },
      });
      setEntradas(datos);
    } catch (problema) {
      setError(typeof problema === 'string' ? problema : String(problema));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar('');
  }, [cargar]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const totalPorUsuario = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const entrada of entradas) {
      conteo.set(entrada.usuario, (conteo.get(entrada.usuario) ?? 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  }, [entradas]);

  const crearUsuario = async (event: React.FormEvent) => {
    event.preventDefault();
    setMensajeAlta(null);
    try {
      await invoke('crear_usuario', {
        payload: {
          usuario: nuevoUsuario,
          nombre: nuevoNombre,
          password: nuevaClave,
          rol: 'usuario',
          // La sesión abierta ya es de administrador: el backend valida que
          // el usuario exista, esté activo y tenga ese rol.
          admin_usuario: sesion?.usuario ?? null,
          admin_password: null,
        },
      });
      setMensajeAlta(`Usuario "${nuevoUsuario.trim().toLowerCase()}" creado`);
      setNuevoUsuario('');
      setNuevoNombre('');
      setNuevaClave('');
      setMostrarAlta(false);
      await cargar(filtro);
    } catch (problema) {
      setMensajeAlta(typeof problema === 'string' ? problema : String(problema));
    }
  };

  return (
    <div className="historial-overlay" role="dialog" aria-modal="true" aria-label="Historial de cambios">
      <div className="historial-panel">
        <header className="historial-head">
          <div className="historial-title">
            <Clock size={16} />
            <div>
              <h2>Historial de cambios</h2>
              <p>Todo lo que cada usuario guardó, editó o eliminó, con fecha y hora. Se conserva 30 días.</p>
            </div>
          </div>
          <div className="historial-head-actions">
            {esAdmin && (
              <button
                type="button"
                className="historial-btn"
                onClick={() => {
                  setMostrarAlta((valor) => !valor);
                  setMensajeAlta(null);
                }}
                title="Crear un usuario nuevo"
              >
                <UserPlus size={13} />
                Nuevo usuario
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Cerrar historial"
              title="Cerrar"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {mostrarAlta && (
          <form className="historial-alta" onSubmit={crearUsuario}>
            <input
              type="text"
              value={nuevoUsuario}
              onChange={(event) => setNuevoUsuario(event.target.value)}
              placeholder="Usuario (sin espacios)"
              aria-label="Usuario nuevo"
              required
            />
            <input
              type="text"
              value={nuevoNombre}
              onChange={(event) => setNuevoNombre(event.target.value)}
              placeholder="Nombre completo"
              aria-label="Nombre completo del usuario nuevo"
            />
            <input
              type="password"
              value={nuevaClave}
              onChange={(event) => setNuevaClave(event.target.value)}
              placeholder="Contraseña nueva (mín. 6)"
              aria-label="Contraseña del usuario nuevo"
              required
            />
            <span className="historial-alta-nota">
              Se autoriza con tu sesión de administrador:{' '}
              <b>{sesion?.nombre || sesion?.usuario}</b>
            </span>
            <button type="submit" className="historial-btn primary">
              Crear
            </button>
          </form>
        )}

        {(mensajeAlta || error) && (
          <p className={error ? 'historial-error' : 'historial-ok'}>{error ?? mensajeAlta}</p>
        )}

        <div className="historial-toolbar">
          <label className="historial-search">
            <Search size={13} />
            <input
              type="search"
              value={filtro}
              onChange={(event) => setFiltro(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void cargar(filtro);
              }}
              placeholder="Filtrar por usuario..."
            />
          </label>
          <button
            type="button"
            className="historial-btn"
            onClick={() => void cargar(filtro)}
            disabled={cargando}
          >
            {cargando ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
            Actualizar
          </button>
          {totalPorUsuario.length > 0 && (
            <span className="historial-resumen">
              {entradas.length} cambios ·{' '}
              {totalPorUsuario.map(([usuario, total]) => `${usuario} (${total})`).join(' · ')}
            </span>
          )}
        </div>

        <div className="historial-lista">
          {cargando && entradas.length === 0 && (
            <p className="historial-vacio">Cargando historial...</p>
          )}
          {!cargando && !error && entradas.length === 0 && (
            <p className="historial-vacio">Todavía no hay cambios registrados.</p>
          )}

          {entradas.map((entrada, indice) => (
            <div
              className="historial-row"
              key={`${entrada.fecha}-${entrada.usuario}-${indice}`}
            >
              <span className="historial-fecha">{formatearFecha(entrada.fecha)}</span>
              <span className="historial-usuario">{entrada.usuario}</span>
              <span className="historial-accion">
                {entrada.accion}
                {entrada.nombre ? <b> {entrada.nombre}</b> : null}
              </span>
              <span className="historial-entidad">
                {iconoEntidad[entrada.entidad] ?? entrada.entidad}
              </span>
              <span className="historial-detalle">{entrada.detalle ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HistorialModal;
