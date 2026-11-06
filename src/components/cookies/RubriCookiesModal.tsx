import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cookie,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { confirmAction, notify } from '../../lib/alerts';
import {
  eliminarCookie,
  estaEnTauri,
  guardarCookie,
  limpiarCookies,
  listarCookiesProyecto,
  type CookieRegistro,
} from '../../lib/httpClient';
import { useApiStore } from '../../store/apiStore';
import './RubriCookiesModal.css';

interface RubriCookiesModalProps {
  /** Se reenvían solas salvo que el usuario lo desactive. */
  enviarCookies: boolean;
  onToggleEnviarCookies: (valor: boolean) => void;
  /** Cambia después de cada envío para refrescar el tarro. */
  refreshKey: number;
  onClose: () => void;
}

/** Fecha ISO → valor para `<input type="datetime-local">`. */
const aInputFecha = (fecha: string | null): string => {
  if (!fecha) return '';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return '';
  const pad = (numero: number) => String(numero).padStart(2, '0');
  return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}T${pad(
    valor.getHours(),
  )}:${pad(valor.getMinutes())}`;
};

const formatoFecha = (fecha: string | null): string => {
  if (!fecha) return 'Sesión';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return fecha;
  return valor.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const textoError = (problema: unknown): string =>
  typeof problema === 'string' ? problema : String(problema);

/**
 * Tarro de cookies del PROYECTO.
 *
 * Las cookies pertenecen al proyecto (EID) y a un dominio, no a una request ni
 * a una colección: se guardan al recibir `Set-Cookie` y se envían solas cuando
 * la URL de la request pertenece a su dominio, sin importar qué método o
 * carpeta se esté usando.
 */
export const RubriCookiesModal = ({
  enviarCookies,
  onToggleEnviarCookies,
  refreshKey,
  onClose,
}: RubriCookiesModalProps) => {
  const eid = useApiStore((state) => state.eid);
  const nativo = estaEnTauri();

  const [cookies, setCookies] = useState<CookieRegistro[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [dominio, setDominio] = useState('');
  const [nombre, setNombre] = useState('');
  const [valor, setValor] = useState('');
  const [ruta, setRuta] = useState('');
  const [expira, setExpira] = useState('');
  const [editando, setEditando] = useState<CookieRegistro | null>(null);

  const cargar = useCallback(async () => {
    if (!nativo) return;
    setCargando(true);
    setError(null);
    try {
      setCookies(await listarCookiesProyecto(eid));
    } catch (problema) {
      setError(textoError(problema));
    } finally {
      setCargando(false);
    }
  }, [eid, nativo]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const limpiarFormulario = () => {
    setDominio('');
    setNombre('');
    setValor('');
    setRuta('');
    setExpira('');
    setEditando(null);
  };

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    if (!texto) return cookies;
    return cookies.filter(
      (cookie) =>
        cookie.dominio.toLowerCase().includes(texto) ||
        cookie.nombre.toLowerCase().includes(texto) ||
        cookie.valor.toLowerCase().includes(texto),
    );
  }, [cookies, filtro]);

  /** Cookies agrupadas por dominio, en orden alfabético. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, CookieRegistro[]>();
    for (const cookie of visibles) {
      const lista = mapa.get(cookie.dominio) ?? [];
      lista.push(cookie);
      mapa.set(cookie.dominio, lista);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles]);

  const dominios = useMemo(
    () => [...new Set(cookies.map((cookie) => cookie.dominio))].sort(),
    [cookies],
  );

  const agregar = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const dominioFinal = (editando ? editando.dominio : dominio).trim();
    if (!dominioFinal) {
      setError('Indica el dominio de la cookie (por ejemplo api.ejemplo.com)');
      return;
    }
    if (!nombre.trim()) {
      setError('La cookie necesita un nombre');
      return;
    }

    try {
      await guardarCookie({
        eid,
        id: editando?.id ?? null,
        dominio: dominioFinal,
        url: `https://${dominioFinal}`,
        nombre: nombre.trim(),
        valor,
        ruta: ruta.trim() || null,
        expira: expira ? new Date(expira).toISOString() : null,
      });
      limpiarFormulario();
      setMostrarFormulario(false);
      await cargar();
      notify.success('Cookie guardada');
    } catch (problema) {
      setError(textoError(problema));
    }
  };

  const editar = (cookie: CookieRegistro) => {
    setError(null);
    setEditando(cookie);
    setDominio(cookie.dominio);
    setNombre(cookie.nombre);
    setValor(cookie.valor);
    setRuta(cookie.ruta === '/' ? '' : cookie.ruta);
    setExpira(aInputFecha(cookie.expira));
    setMostrarFormulario(true);
  };

  const borrar = async (cookie: CookieRegistro) => {
    setError(null);
    try {
      await eliminarCookie(cookie.id);
      await cargar();
    } catch (problema) {
      setError(textoError(problema));
    }
  };

  const limpiarProyecto = async () => {
    setError(null);
    if (cookies.length === 0) return;
    const confirmado = await confirmAction({
      title: '¿Vaciar el tarro de cookies?',
      text: `Se eliminarán las ${cookies.length} cookie(s) del proyecto ${eid} (${dominios.length} dominio(s)).`,
      confirmText: 'Vaciar',
      danger: true,
    });
    if (!confirmado) return;

    try {
      const eliminadas = await limpiarCookies(eid);
      await cargar();
      notify.success(`${eliminadas} cookie(s) eliminadas`);
    } catch (problema) {
      setError(textoError(problema));
    }
  };

  const limpiarDominio = async (dominioObjetivo: string) => {
    const confirmado = await confirmAction({
      title: `¿Borrar las cookies de ${dominioObjetivo}?`,
      text: 'Las cookies de este dominio (y sus subdominios) se eliminarán del proyecto.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!confirmado) return;

    try {
      await limpiarCookies(eid, dominioObjetivo);
      await cargar();
    } catch (problema) {
      setError(textoError(problema));
    }
  };

  return (
    <div className="cookies-overlay" role="dialog" aria-modal="true" aria-label="Cookies del proyecto">
      <div className="cookies-panel">
        <header className="cookies-head">
          <div className="cookies-title">
            <Cookie size={18} />
            <div>
              <h2>Cookies del proyecto</h2>
              <p>
                Proyecto <b>{eid}</b> · {cookies.length} cookie(s) en {dominios.length}{' '}
                dominio(s). Se envían solas según el dominio de la request.
              </p>
            </div>
          </div>

          <div className="cookies-head-actions">
            <label className="cookies-toggle" title="Enviar las cookies guardadas con cada request">
              <input
                type="checkbox"
                checked={enviarCookies}
                onChange={(event) => onToggleEnviarCookies(event.target.checked)}
              />
              Enviar cookies
            </label>
            <button
              type="button"
              className="icon-btn"
              onClick={() => void cargar()}
              disabled={cargando || !nativo}
              title="Recargar"
              aria-label="Recargar cookies"
            >
              {cargando ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
            </button>
            <button
              type="button"
              className="cookies-close"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="cookies-toolbar">
          <div className="cookies-search">
            <Search size={14} />
            <input
              type="search"
              placeholder="Buscar por dominio, nombre o valor"
              value={filtro}
              onChange={(event) => setFiltro(event.target.value)}
            />
          </div>

          <div className="cookies-toolbar-actions">
            <button
              type="button"
              className="cookies-btn"
              onClick={() => {
                setError(null);
                limpiarFormulario();
                setMostrarFormulario((valorActual) => !valorActual);
              }}
            >
              <Plus size={14} />
              Nueva cookie
            </button>
            <button
              type="button"
              className="cookies-btn danger"
              onClick={() => void limpiarProyecto()}
              disabled={cookies.length === 0}
            >
              <Trash2 size={14} />
              Vaciar tarro
            </button>
          </div>
        </div>

        {!nativo && (
          <p className="cookies-hint">
            Las cookies se guardan en MongoDB y solo funcionan dentro de la app de
            escritorio (Tauri); en el navegador no hay acceso a ellas.
          </p>
        )}

        {error && (
          <p className="cookies-error" role="alert">
            {error}
          </p>
        )}

        {mostrarFormulario && (
          <form className="cookies-form" onSubmit={agregar}>
            {editando && (
              <span className="cookies-edit-chip" title={`Editando ${editando.nombre}`}>
                Editando <b>{editando.nombre}</b>
              </span>
            )}
            <label>
              Dominio *
              <input
                type="text"
                placeholder="api.ejemplo.com"
                value={editando ? editando.dominio : dominio}
                onChange={(event) => setDominio(event.target.value)}
                disabled={Boolean(editando)}
                required
              />
            </label>
            <label>
              Nombre *
              <input
                type="text"
                placeholder="sessionid"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                required
              />
            </label>
            <label>
              Valor
              <input
                type="text"
                placeholder="abc123"
                value={valor}
                onChange={(event) => setValor(event.target.value)}
              />
            </label>
            <label>
              Ruta
              <input
                type="text"
                placeholder="/"
                value={ruta}
                onChange={(event) => setRuta(event.target.value)}
              />
            </label>
            <label>
              Expira
              <input
                type="datetime-local"
                value={expira}
                onChange={(event) => setExpira(event.target.value)}
              />
            </label>
            <div className="cookies-form-actions">
              <button type="submit" className="cookies-btn primary">
                {editando ? 'Actualizar' : 'Agregar'}
              </button>
              <button
                type="button"
                className="cookies-btn"
                onClick={() => {
                  limpiarFormulario();
                  setMostrarFormulario(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="cookies-body">
          {cargando && cookies.length === 0 && (
            <p className="cookies-hint">
              <LoaderCircle size={13} className="spin" /> Cargando cookies…
            </p>
          )}

          {!cargando && grupos.length === 0 && (
            <p className="cookies-hint">
              {cookies.length === 0
                ? 'El proyecto todavía no tiene cookies. Se guardan solas cuando el servidor responde con Set-Cookie.'
                : 'Ninguna cookie coincide con la búsqueda.'}
            </p>
          )}

          {grupos.map(([dominioGrupo, lista]) => (
            <section key={dominioGrupo} className="cookies-group">
              <div className="cookies-group-head">
                <span className="cookies-domain">{dominioGrupo}</span>
                <span className="cookies-count">{lista.length}</span>
                <button
                  type="button"
                  className="cookies-domain-clear"
                  onClick={() => void limpiarDominio(dominioGrupo)}
                  title={`Borrar las cookies de ${dominioGrupo}`}
                >
                  <Trash2 size={12} /> Limpiar dominio
                </button>
              </div>

              <table className="cookies-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Valor</th>
                    <th>Ruta</th>
                    <th>Expira</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((cookie) => (
                    <tr key={cookie.id}>
                      <td className="cookies-name">
                        {cookie.nombre}
                        {cookie.http_only && <span className="cookies-tag">HttpOnly</span>}
                        {cookie.seguro && <span className="cookies-tag">Secure</span>}
                      </td>
                      <td className="cookies-value" title={cookie.valor}>
                        {cookie.valor || '—'}
                      </td>
                      <td>{cookie.ruta}</td>
                      <td>{formatoFecha(cookie.expira)}</td>
                      <td className="cookies-actions">
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => editar(cookie)}
                          title="Editar"
                          aria-label={`Editar ${cookie.nombre}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => void borrar(cookie)}
                          title="Eliminar"
                          aria-label={`Eliminar ${cookie.nombre}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RubriCookiesModal;
