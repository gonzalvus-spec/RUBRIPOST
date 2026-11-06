import clsx from 'clsx';
import { LoaderCircle, Save, Send } from 'lucide-react';

import { useApiStore, type HttpMethod } from '../../../store/apiStore';
import { METHOD_OPTIONS, methodClass } from '../constants';
import './RubriRequestBar.css';

interface RubriRequestBarProps {
  isSaving: boolean;
  sending: boolean;
  jsonErrors: number;
  onSave: () => void;
  onSend: () => void;
}

export const RubriRequestBar = ({
  isSaving,
  sending,
  jsonErrors,
  onSave,
  onSend,
}: RubriRequestBarProps) => {
  const metodo = useApiStore((state) => state.metodo);
  const url = useApiStore((state) => state.url);
  const body = useApiStore((state) => state.body);
  const setMethod = useApiStore((state) => state.setMethod);
  const setUrl = useApiStore((state) => state.setUrl);

  return (
    <div className="request-bar">
      <select
        className={clsx('method-select', methodClass(metodo))}
        value={metodo}
        onChange={(event) => setMethod(event.target.value as HttpMethod)}
        aria-label="Método HTTP"
        title="Método HTTP"
      >
        {METHOD_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <input
        type="text"
        className="url-input"
        value={url}
        spellCheck={false}
        placeholder="https://api.example.com/endpoint"
        aria-label="URL de la request"
        title="URL de la request"
        onChange={(event) => setUrl(event.target.value)}
      />

      <button
        type="button"
        className="btn-save-bar"
        onClick={onSave}
        disabled={isSaving}
        aria-label="Guardar request en MongoDB"
        title="Guardar en MongoDB (Ctrl+S)"
        aria-busy={isSaving}
      >
        {isSaving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
        <span>{isSaving ? '' : ''}</span>
      </button>

      <button
        type="button"
        className="btn btn-send"
        onClick={onSend}
        disabled={sending || (body.trim() !== '' && jsonErrors > 0)}
        aria-label="Enviar request"
        title="Enviar request (Ctrl+Enter)"
        aria-busy={sending}
      >
        {sending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
        {sending ? 'Enviando...' : 'Enviar'}
      </button>
    </div>
  );
};

export default RubriRequestBar;
