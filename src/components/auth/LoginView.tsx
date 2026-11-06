import { useEffect, useState } from 'react';
import { LoaderCircle, Lock, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';

import rubriLogo from '../../assets/rubrifact-logo.png';
import { useAuthStore } from '../../store/authStore';
import './LoginView.css';

/**
 * Pantalla de acceso: valida las credenciales contra la colección `usuarios`
 * de MongoDB. Si todavía no existe ningún usuario, permite crear el primer
 * administrador.
 */
export const LoginView = () => {
  const sesion = useAuthStore((state) => state.sesion);
  const hayUsuarios = useAuthStore((state) => state.hayUsuarios);
  const cargando = useAuthStore((state) => state.cargando);
  const error = useAuthStore((state) => state.error);
  const comprobarUsuarios = useAuthStore((state) => state.comprobarUsuarios);
  const login = useAuthStore((state) => state.login);
  const crearUsuario = useAuthStore((state) => state.crearUsuario);
  const limpiarError = useAuthStore((state) => state.limpiarError);

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const esArranque = hayUsuarios === false;

  useEffect(() => {
    void comprobarUsuarios();
  }, [comprobarUsuarios]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAviso(null);

    if (!esArranque) {
      await login(usuario, password);
      return;
    }

    if (password.length < 6) {
      setAviso('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmar) {
      setAviso('Las contraseñas no coinciden');
      return;
    }

    await crearUsuario({ usuario, nombre, password, rol: 'admin' });
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img src={rubriLogo} alt="Rubrifact" className="login-logo" draggable={false} />
          <h1 className="login-title">
            RUBRIFACT <b>API CLIENT</b>
          </h1>
          <p className="login-subtitle">
            {esArranque
              ? 'Crea el primer administrador para empezar'
              : 'Inicia sesión con tu usuario de MongoDB'}
          </p>
        </div>

        {esArranque && (
          <div className="login-hint">
            <ShieldCheck size={14} />
            <span>Todavía no hay usuarios registrados en la base de datos.</span>
          </div>
        )}

        <label className="login-field">
          <span className="login-label">Usuario</span>
          <span className="login-input">
            <User size={14} />
            <input
              type="text"
              value={usuario}
              onChange={(event) => {
                setUsuario(event.target.value);
                if (error) limpiarError();
              }}
              placeholder="ej. jperez"
              autoComplete="username"
              autoFocus
              required
            />
          </span>
        </label>

        {esArranque && (
          <label className="login-field">
            <span className="login-label">Nombre completo</span>
            <span className="login-input">
              <UserPlus size={14} />
              <input
                type="text"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="ej. Juan Pérez"
                autoComplete="name"
              />
            </span>
          </label>
        )}

        <label className="login-field">
          <span className="login-label">Contraseña</span>
          <span className="login-input">
            <Lock size={14} />
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) limpiarError();
              }}
              placeholder="••••••••"
              autoComplete={esArranque ? 'new-password' : 'current-password'}
              required
            />
          </span>
        </label>

        {esArranque && (
          <label className="login-field">
            <span className="login-label">Repetir contraseña</span>
            <span className="login-input">
              <Lock size={14} />
              <input
                type="password"
                value={confirmar}
                onChange={(event) => setConfirmar(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </span>
          </label>
        )}

        {(error || aviso) && <p className="login-error">{aviso ?? error}</p>}

        <button type="submit" className="login-submit" disabled={cargando || Boolean(sesion)}>
          {cargando ? (
            <LoaderCircle size={15} className="spin" />
          ) : esArranque ? (
            <UserPlus size={15} />
          ) : (
            <LogIn size={15} />
          )}
          {esArranque ? 'Crear administrador' : 'Ingresar'}
        </button>

        <p className="login-foot">
          © Rubrifact Soluciones Tecnológicas S.A.C.
          <br />
          Todos los Derechos Reservados.
        </p>
      </form>
    </div>
  );
};

export default LoginView;
