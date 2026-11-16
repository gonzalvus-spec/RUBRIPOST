import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Save, UserRound, X } from 'lucide-react';

import { notify } from '../../lib/alerts';
import { useAuthStore } from '../../store/authStore';
import '../rubri/modal/RubriNameModal.css';
import './ProfileModal.css';

interface ProfileModalProps {
  onClose: () => void;
}

export const ProfileModal = ({ onClose }: ProfileModalProps) => {
  const sesion = useAuthStore((state) => state.sesion);
  const cargando = useAuthStore((state) => state.cargando);
  const error = useAuthStore((state) => state.error);
  const actualizarPerfil = useAuthStore((state) => state.actualizarPerfil);
  const limpiarError = useAuthStore((state) => state.limpiarError);
  const [usuario, setUsuario] = useState(sesion?.usuario ?? '');
  const [nombre, setNombre] = useState(sesion?.nombre ?? '');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => () => limpiarError(), [limpiarError]);

  if (!sesion) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    const trimmedUser = usuario.trim();
    const trimmedName = nombre.trim();
    if (!trimmedUser || !trimmedName) {
      setLocalError('Nombre y usuario son obligatorios.');
      return;
    }
    if (passwordOpen && newPassword) {
      if (newPassword.length < 6) {
        setLocalError('La nueva contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (!currentPassword) {
        setLocalError('Escribe tu contraseña actual.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setLocalError('Las contraseñas nuevas no coinciden.');
        return;
      }
    }

    const ok = await actualizarPerfil({
      usuario: trimmedUser,
      nombre: trimmedName,
      currentPassword: passwordOpen ? currentPassword : undefined,
      newPassword: passwordOpen ? newPassword : undefined,
    });
    if (!ok) return;
    notify.success('Perfil actualizado');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <div className="modal-header">
          <h2 id="profile-title"><UserRound size={18} /> Mi perfil</h2>
          <button type="button" className="icon-btn small" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="profile-grid">
          <label>
            <span>Nombre visible</span>
            <input className="input" value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus />
          </label>
          <label>
            <span>Usuario</span>
            <input className="input" value={usuario} onChange={(event) => setUsuario(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Rol</span>
            <input className="input" value={sesion.rol} readOnly disabled />
          </label>
        </div>

        <button
          type="button"
          className="profile-password-toggle"
          onClick={() => setPasswordOpen((value) => !value)}
          aria-expanded={passwordOpen}
        >
          Cambiar contraseña
          {passwordOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {passwordOpen && (
          <div className="profile-password-fields">
            <label><span>Contraseña actual</span><input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
            <label><span>Nueva contraseña</span><input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
            <label><span>Confirmar nueva contraseña</span><input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
          </div>
        )}

        {(localError || error) && <p className="profile-error">{localError || error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileModal;
