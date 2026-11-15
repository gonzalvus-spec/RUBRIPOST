import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, ChevronDown, Clock, Folder, Globe, LoaderCircle, LogIn, Pencil, Plus, RefreshCw, Search, Trash2, Users, UserPlus, X } from 'lucide-react';

import { useAuthStore } from '../../store/authStore';
import { useApiStore } from '../../store/apiStore';
import { registrarCambio } from '../../lib/audit';
import { filterHistory, historyTime, historyTone, type HistorialEntrada } from '../../lib/history';
import './HistorialModal.css';

/** Entrada de la bitácora devuelta por el backend. */

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
    hour12: true,
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
  const eid = useApiStore((state) => state.eid);

  const [entradas, setEntradas] = useState<HistorialEntrada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [usuario, setUsuario] = useState('');
  const [entidad, setEntidad] = useState('');
  const [dias, setDias] = useState(0);

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaClave, setNuevaClave] = useState('');
  const [mensajeAlta, setMensajeAlta] = useState<string | null>(null);

  const esAdmin = sesion?.rol === 'admin';

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await invoke<HistorialEntrada[]>('listar_historial', {
        filtro: { eid, usuario: null, limit: 300 },
      });
      setEntradas(datos);
    } catch (problema) {
      setError(typeof problema === 'string' ? problema : String(problema));
    } finally {
      setCargando(false);
    }
  }, [eid]);

  useEffect(() => {
    void cargar();
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

  const visibles = useMemo(() => filterHistory(entradas, {
    search: filtro, user: usuario, entity: entidad, days: dias,
  }), [entradas, filtro, usuario, entidad, dias]);
  const diasAgrupados = useMemo(() => {
    const grupos = new Map<string, HistorialEntrada[]>();
    for (const entrada of visibles) {
      const fecha = new Date(entrada.fecha);
      const dia = Number.isNaN(fecha.getTime()) ? 'Sin fecha' : fecha.toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      grupos.set(dia, [...(grupos.get(dia) ?? []), entrada]);
    }
    return [...grupos.entries()];
  }, [visibles]);

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
      registrarCambio({ eid, accion: 'Creó usuario', entidad: 'usuario', nombre: nuevoUsuario.trim().toLowerCase() });
      setNuevoUsuario('');
      setNuevoNombre('');
      setNuevaClave('');
      setMostrarAlta(false);
      await cargar();
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
              <p>Proyecto <b>{eid}</b> · Historial exclusivo de este proyecto · 30 días</p>
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

        <div className="historial-stats">
          <div><Activity size={18} /><span><b>{entradas.length}</b><small>Cambios cargados</small></span></div>
          <div><Users size={18} /><span><b>{totalPorUsuario.length}</b><small>Usuarios con actividad</small></span></div>
          <div><Clock size={18} /><span><b>{visibles.length}</b><small>Coinciden con los filtros</small></span></div>
        </div>

        <div className="historial-toolbar">
          <label className="historial-search">
            <Search size={13} />
            <input
              type="search"
              value={filtro}
              onChange={(event) => setFiltro(event.target.value)}
              aria-label="Buscar en el historial"
              placeholder="Buscar acción, nombre, usuario…"
            />
          </label>
          <select aria-label="Filtrar por usuario" value={usuario} onChange={(event) => setUsuario(event.target.value)}>
            <option value="">Todos los usuarios</option>
            {totalPorUsuario.map(([nombre]) => <option key={nombre} value={nombre}>{nombre}</option>)}
          </select>
          <select aria-label="Filtrar por tipo de elemento" value={entidad} onChange={(event) => setEntidad(event.target.value)}>
            <option value="">Todos los elementos</option>
            {Object.entries(iconoEntidad).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filtrar por período" value={dias} onChange={(event) => setDias(Number(event.target.value))}>
            <option value={0}>Todo el período</option><option value={1}>Últimas 24 horas</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option>
          </select>
          <button
            type="button"
            className="historial-btn"
            onClick={() => void cargar()}
            disabled={cargando}
          >
            {cargando ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
            Actualizar
          </button>
          {(filtro || usuario || entidad || dias > 0) && <button type="button" className="historial-btn" onClick={() => { setFiltro(''); setUsuario(''); setEntidad(''); setDias(0); }}>Limpiar filtros</button>}
        </div>

        <div className="historial-lista" aria-busy={cargando}>
          {cargando && entradas.length === 0 && (
            <p className="historial-vacio">Cargando historial...</p>
          )}
          {!cargando && !error && entradas.length === 0 && (
            <p className="historial-vacio">Todavía no hay cambios registrados.</p>
          )}
          {!cargando && entradas.length > 0 && visibles.length === 0 && <p className="historial-vacio">No hay cambios que coincidan con estos filtros.</p>}

          {diasAgrupados.map(([dia, cambios]) => (
            <section className="historial-day" key={dia} aria-label={dia}>
              <h3>{dia}<span>{cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'}</span></h3>
              {cambios.map((entrada, indice) => {
                const tone = historyTone(entrada.accion);
                const Icon = entrada.entidad === 'collection' ? Folder : entrada.entidad === 'sesion' ? LogIn
                  : entrada.entidad === 'usuario' ? Users : entrada.entidad === 'proyecto' ? Globe
                    : tone === 'deleted' ? Trash2 : tone === 'created' ? Plus : Pencil;
                return (
                  <details className={`historial-event compact ${tone}`} key={`${entrada.fecha}-${entrada.usuario}-${indice}`}>
                    <summary title={`${entrada.accion} ${entrada.nombre ?? ''} · ${formatearFecha(entrada.fecha)} · Ver detalles`}>
                      <time dateTime={entrada.fecha}>{historyTime(entrada.fecha)}</time>
                      <span className="historial-event-icon"><Icon size={13} /></span>
                      <span className="historial-event-main"><span>{entrada.accion}</span>{entrada.nombre && <b>{entrada.nombre}</b>}</span>
                      <span className="historial-entidad">{iconoEntidad[entrada.entidad] ?? entrada.entidad}</span>
                      <span className="historial-usuario" title={entrada.usuario}>{entrada.usuario}</span>
                      <ChevronDown size={12} className="historial-expand" />
                    </summary>
                    <div className="historial-event-expanded">
                      {entrada.nombre && <h4>{entrada.nombre}</h4>}
                      <p className="historial-event-detail">{entrada.detalle || 'Sin detalles adicionales.'}</p>
                      <small>{entrada.usuario} · {formatearFecha(entrada.fecha)}</small>
                    </div>
                  </details>
                );
              })}
            </section>
          ))}
        </div>
        <footer className="historial-footer"><span>{visibles.length} de {entradas.length} cambios cargados · Proyecto {eid}</span><span>Pulsa un cambio para ver detalles · Hasta 300 recientes</span></footer>
      </div>
    </div>
  );
};

export default HistorialModal;
