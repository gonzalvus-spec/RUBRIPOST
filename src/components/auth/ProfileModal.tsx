import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

import { notify } from '../../lib/alerts';
import { useAuthStore } from '../../store/authStore';
import '../rubri/modal/RubriNameModal.css';
import './ProfileModal.css';

interface ProfileModalProps {
  onClose: () => void;
}

type PasswordField = 'current' | 'new' | 'confirm';

export const ProfileModal = ({ onClose }: ProfileModalProps) => {
  const sesion = useAuthStore((state) => state.sesion);
  const cargando = useAuthStore((state) => state.cargando);
  const error = useAuthStore((state) => state.error);
  const actualizarPerfil = useAuthStore((state) => state.actualizarPerfil);
  const limpiarError = useAuthStore((state) => state.limpiarError);
  const [usuario, setUsuario] = useState(sesion?.usuario ?? '');
  const [nombre, setNombre] = useState(sesion?.nombre ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [localError, setLocalError] = useState('');

  useEffect(() => () => limpiarError(), [limpiarError]);

  if (!sesion) return null;

  const trimmedUser = usuario.trim();
  const trimmedName = nombre.trim();
  const passwordTouched = Boolean(currentPassword || newPassword || confirmPassword);
  const generalError = !trimmedName
    ? 'El nombre es obligatorio.'
    : !trimmedUser
      ? 'El usuario es obligatorio.'
      : '';
  const passwordError = !passwordTouched
    ? ''
    : !currentPassword
      ? 'Escribe tu contraseña actual.'
      : !newPassword
        ? 'Escribe una contraseña nueva.'
        : newPassword.length < 6
          ? 'La nueva contraseña debe tener al menos 6 caracteres.'
          : !confirmPassword
            ? 'Confirma la nueva contraseña.'
            : newPassword !== confirmPassword
              ? 'Las contraseñas nuevas no coinciden.'
              : '';
  const hasChanges = trimmedName !== sesion.nombre
    || trimmedUser !== sesion.usuario
    || passwordTouched;
  const canSave = hasChanges && !generalError && !passwordError && !cargando;
  const passwordsMatch = Boolean(confirmPassword) && newPassword === confirmPassword;
  const strength = newPassword.length >= 12 ? 3 : newPassword.length >= 8 ? 2 : newPassword.length >= 6 ? 1 : 0;
  const strengthLabel = strength === 3 ? 'Fuerte' : strength === 2 ? 'Media' : strength === 1 ? 'Básica' : 'Mínimo 6 caracteres';
  const initials = (sesion.nombre || sesion.usuario)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'RP';

  const clearMessages = () => {
    setLocalError('');
    limpiarError();
  };

  const toggleVisibility = (field: PasswordField) => {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    if (generalError || passwordError) {
      setLocalError(generalError || passwordError);
      return;
    }
    if (!hasChanges) return;

    const ok = await actualizarPerfil({
      usuario: trimmedUser,
      nombre: trimmedName,
      currentPassword: passwordTouched ? currentPassword : undefined,
      newPassword: passwordTouched ? newPassword : undefined,
    });
    if (!ok) return;
    notify.success('Perfil actualizado', 'Tus datos se guardaron correctamente.');
    onClose();
  };

  return (
    <div className="modal-backdrop profile-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <header className="profile-hero">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div className="profile-identity">
            <span className="profile-eyebrow">Configuración de cuenta</span>
            <h2 id="profile-title">{sesion.nombre || sesion.usuario}</h2>
            <p>@{sesion.usuario}</p>
          </div>
          <span className="profile-role"><ShieldCheck size={13} /> {sesion.rol}</span>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Cerrar perfil">
            <X size={17} />
          </button>
        </header>

        <div className="profile-content">
          <section className="profile-card" aria-labelledby="profile-general-title">
            <div className="profile-card-head">
              <span className="profile-card-icon"><UserRound size={17} /></span>
              <div>
                <h3 id="profile-general-title">Información personal</h3>
                <p>Actualiza cómo te identifican los demás usuarios.</p>
              </div>
            </div>
            <div className="profile-fields two-columns">
              <label className="profile-field">
                <span>Nombre visible</span>
                <div className="profile-control">
                  <UserRound size={15} />
                  <input
                    value={nombre}
                    onChange={(event) => { setNombre(event.target.value); clearMessages(); }}
                    autoFocus
                    autoComplete="name"
                    placeholder="Tu nombre completo"
                  />
                </div>
              </label>
              <label className="profile-field">
                <span>Usuario de acceso</span>
                <div className="profile-control">
                  <AtSign size={15} />
                  <input
                    value={usuario}
                    onChange={(event) => { setUsuario(event.target.value); clearMessages(); }}
                    autoComplete="username"
                    placeholder="nombre.usuario"
                  />
                </div>
              </label>
            </div>
            {generalError && <p className="profile-inline-status error"><AlertCircle size={13} /> {generalError}</p>}
          </section>

          <section className="profile-card security" aria-labelledby="profile-security-title">
            <div className="profile-card-head">
              <span className="profile-card-icon"><LockKeyhole size={17} /></span>
              <div>
                <h3 id="profile-security-title">Seguridad</h3>
                <p>Déjalo vacío si no deseas cambiar tu contraseña.</p>
              </div>
            </div>
            <div className="profile-fields">
              <label className="profile-field">
                <span>Contraseña actual</span>
                <div className="profile-control">
                  <KeyRound size={15} />
                  <input
                    type={visible.current ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(event) => { setCurrentPassword(event.target.value); clearMessages(); }}
                    autoComplete="current-password"
                    placeholder="Necesaria para confirmar el cambio"
                  />
                  <button type="button" onClick={() => toggleVisibility('current')} aria-label={visible.current ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}>
                    {visible.current ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>
              <div className="profile-password-row">
                <label className="profile-field">
                  <span>Nueva contraseña</span>
                  <div className="profile-control">
                    <LockKeyhole size={15} />
                    <input
                      type={visible.new ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => { setNewPassword(event.target.value); clearMessages(); }}
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button type="button" onClick={() => toggleVisibility('new')} aria-label={visible.new ? 'Ocultar contraseña nueva' : 'Mostrar contraseña nueva'}>
                      {visible.new ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className={`profile-strength strength-${strength}`}>
                    <span><i /><i /><i /></span><small>{strengthLabel}</small>
                  </div>
                </label>
                <label className="profile-field">
                  <span>Confirmar contraseña</span>
                  <div className={`profile-control ${passwordsMatch ? 'valid' : ''}`}>
                    <CheckCircle2 size={15} />
                    <input
                      type={visible.confirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => { setConfirmPassword(event.target.value); clearMessages(); }}
                      autoComplete="new-password"
                      placeholder="Repite la nueva contraseña"
                    />
                    <button type="button" onClick={() => toggleVisibility('confirm')} aria-label={visible.confirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}>
                      {visible.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <small className={passwordsMatch ? 'profile-match valid' : 'profile-match error'}>
                      {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                    </small>
                  )}
                </label>
              </div>
            </div>
            {passwordError && passwordTouched && <p className="profile-inline-status error"><AlertCircle size={13} /> {passwordError}</p>}
          </section>

          {(localError || error) && (
            <p className="profile-alert" role="alert"><AlertCircle size={15} /> {localError || error}</p>
          )}
        </div>

        <footer className="profile-actions">
          <span>{hasChanges ? 'Tienes cambios pendientes' : 'Todos los cambios están guardados'}</span>
          <div>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              {cargando ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
              {cargando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};

export default ProfileModal;
