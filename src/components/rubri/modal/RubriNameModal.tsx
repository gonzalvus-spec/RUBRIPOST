import clsx from 'clsx';
import { Check, LoaderCircle, X } from 'lucide-react';

import { COLLECTION_COLORS } from '../../../store/apiStore';
import { modalCopy } from '../constants';
import type { NameModalState } from '../types';
import './RubriNameModal.css';

interface RubriNameModalProps {
  modal: NameModalState;
  isSaving: boolean;
  onChange: (modal: NameModalState) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/** Modal para nombrar/renombrar requests y colecciones. */
export const RubriNameModal = ({
  modal,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: RubriNameModalProps) => {
  const copy = modalCopy(modal.mode);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-modal-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="modal-header">
          <h2 id="name-modal-title">{copy.title}</h2>
          <button
            type="button"
            className="icon-btn small"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <label className="modal-label" htmlFor="request-name-modal">
          {copy.label}
        </label>
        <input
          id="request-name-modal"
          type="text"
          className="input"
          autoFocus
          value={modal.value}
          placeholder={copy.placeholder}
          onChange={(event) => onChange({ ...modal, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
        />

        {modal.mode === 'collectionCreate' && (
          <div className="color-picker">
            <span className="modal-label">Color</span>
            <div className="color-swatches">
              {COLLECTION_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={clsx('color-swatch', { selected: modal.color === color })}
                  style={{ background: color }}
                  onClick={() => onChange({ ...modal, color })}
                  aria-label={`Elegir color ${color}`}
                  title={color}
                  aria-pressed={modal.color === color}
                />
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            aria-label="Cancelar"
            title="Cancelar"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!modal.value.trim() || isSaving}
            aria-label="Confirmar nombre"
            title="Confirmar"
          >
            {isSaving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
};

export default RubriNameModal;
