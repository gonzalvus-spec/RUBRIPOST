import { useState } from 'react';
import { Eye, EyeOff, Info, KeyRound, Shield } from 'lucide-react';

import { useApiStore, type AuthKind } from '../../../store/apiStore';
import { ENV_TOKEN } from '../constants';
import './RubriPanel.css';
import './RubriAuthPanel.css';

/** Pestaña Auth: credenciales que se envían con la request. */
export const RubriAuthPanel = () => {
  const auth = useApiStore((state) => state.auth);
  const setAuth = useApiStore((state) => state.setAuth);
  const [showToken, setShowToken] = useState(false);

  const changeAuthKind = (kind: AuthKind) => setAuth({ kind });

  return (
    <div className="panel request-panel">
      <div className="panel-toolbar">
        <span className="panel-caption">
          Authorization ·{' '}
          {auth.kind === 'none'
            ? 'sin credenciales'
            : auth.kind === 'bearer'
              ? 'Bearer Token'
              : 'API Key'}
        </span>
      </div>

      <div className="auth-panel">
        <div className="form-row">
          <label htmlFor="auth-kind">Tipo de autenticación</label>
          <select
            id="auth-kind"
            className="input"
            value={auth.kind}
            onChange={(event) => changeAuthKind(event.target.value as AuthKind)}
          >
            <option value="none">Sin autenticación</option>
            <option value="bearer">Bearer Token</option>
            <option value="api-key">API Key</option>
          </select>
        </div>

        {auth.kind === 'bearer' && (
          <>
            <div className="form-row">
              <label htmlFor="auth-token">Token</label>
              <div className="input-group">
                <input
                  id="auth-token"
                  type={showToken ? 'text' : 'password'}
                  className="input mono"
                  value={auth.token ?? ''}
                  placeholder="eyJ0eXAiOiJKV1Qi..."
                  spellCheck={false}
                  onChange={(event) => setAuth({ token: event.target.value })}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowToken((value) => !value)}
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                  title={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {ENV_TOKEN && (
                  <button
                    type="button"
                    className="btn btn-secondary compact"
                    onClick={() => setAuth({ kind: 'bearer', token: ENV_TOKEN })}
                    aria-label="Cargar token desde .env"
                    title="Cargar VITE_RUBRI_TOKEN desde .env"
                  >
                    <KeyRound size={14} />
                    .env
                  </button>
                )}
              </div>
            </div>

            <div className="hint">
              <Info size={13} />
              <span>
                Se enviará como <code>Authorization: Bearer &lt;token&gt;</code>. En
                MongoDB se guarda de forma segura.
              </span>
            </div>
          </>
        )}

        {auth.kind === 'api-key' && (
          <>
            <div className="form-row">
              <label htmlFor="api-key-name">Nombre del header</label>
              <input
                id="api-key-name"
                type="text"
                className="input mono"
                value={auth.api_key_name ?? ''}
                placeholder="X-API-Key"
                spellCheck={false}
                onChange={(event) => setAuth({ api_key_name: event.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="api-key-value">Valor</label>
              <div className="input-group">
                <input
                  id="api-key-value"
                  type={showToken ? 'text' : 'password'}
                  className="input mono"
                  value={auth.api_key_value ?? ''}
                  placeholder="Valor de la API Key"
                  spellCheck={false}
                  onChange={(event) => setAuth({ api_key_value: event.target.value })}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowToken((value) => !value)}
                  aria-label={showToken ? 'Ocultar API key' : 'Mostrar API key'}
                  title={showToken ? 'Ocultar API key' : 'Mostrar API key'}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="hint">
              <Info size={13} />
              <span>
                El valor se almacena de forma segura y se restaura al cargar la request.
              </span>
            </div>
          </>
        )}

        {auth.kind === 'none' && (
          <div className="hint">
            <Shield size={13} />
            <span>Esta request se enviará sin credenciales.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RubriAuthPanel;
