import { useMemo } from 'react';
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Maximize2,
  Minimize2,
  Send,
} from 'lucide-react';

import ResponseViewer from '../../common/ResponseViewer';
import { useApiStore } from '../../../store/apiStore';
import { getResponseLanguage } from '../constants';
import type { ResponseStatus, ResponseViewState } from '../types';
import './RubriPanel.css';
import './RubriResponsePanel.css';

interface RubriResponsePanelProps {
  response: string;
  status: ResponseStatus | null;
  sending: boolean;
  copied: boolean;
  responseState: ResponseViewState;
  responseHeight: number;
  isResizing: boolean;
  setResponseState: React.Dispatch<React.SetStateAction<ResponseViewState>>;
  setResponseHeight: React.Dispatch<React.SetStateAction<number>>;
  onCopy: () => void;
  onResizeMouseDown: (event: React.MouseEvent) => void;
}

/** Panel de respuesta + divisor redimensionable (estilo Postman). */
export const RubriResponsePanel = ({
  response,
  status,
  sending,
  copied,
  responseState,
  responseHeight,
  isResizing,
  setResponseState,
  setResponseHeight,
  onCopy,
  onResizeMouseDown,
}: RubriResponsePanelProps) => {
  const httpInfo = useApiStore((state) => state.httpInfo);

  const responseBytes = useMemo(
    () => new TextEncoder().encode(response).length,
    [response],
  );
  const responseLanguage = useMemo(() => getResponseLanguage(response), [response]);

  return (
    <>
      <div
        className={clsx('split-handle', {
          active: isResizing,
          collapsed: responseState === 'collapsed',
        })}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar el panel de respuesta"
        aria-valuenow={responseHeight}
        tabIndex={0}
        title="Arrastra para redimensionar · doble clic para maximizar o restaurar"
        onMouseDown={onResizeMouseDown}
        onDoubleClick={() =>
          setResponseState((current) => (current === 'maximized' ? 'normal' : 'maximized'))
        }
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          setResponseState('normal');
          setResponseHeight((current) =>
            Math.max(
              120,
              Math.min(900, current + (event.key === 'ArrowUp' ? 24 : -24)),
            ),
          );
        }}
      >
        <span className="split-grip" />
      </div>

      <div
        className={clsx('panel', 'response-panel', {
          collapsed: responseState === 'collapsed',
        })}
        style={
          responseState === 'maximized'
            ? { flex: '1 1 auto', height: 'auto' }
            : responseState === 'collapsed'
              ? { flex: '0 0 auto', height: 38 }
              : { flex: '0 0 auto', height: responseHeight }
        }
      >
        <div className="panel-toolbar">
          <div className="body-types">
            <span className="body-type active">
              <span className="body-type-dot" />
              response
            </span>
            {response.trim() !== '' && (
              <span className="body-type-chip">
                {responseLanguage === 'json'
                  ? 'JSON'
                  : responseLanguage === 'xml'
                    ? 'XML'
                    : 'TEXT'}
              </span>
            )}
          </div>

          <div className="panel-toolbar-right">
            {status && (
              <span
                className={clsx('status-badge', {
                  success: status.code >= 200 && status.code < 400,
                  error: status.code === 0 || status.code >= 400,
                })}
              >
                {status.code === 0 ? 'ERR' : status.code} {status.text}
              </span>
            )}
            {httpInfo && httpInfo.duration_ms > 0 && (
              <span className="duration">
                <Clock size={11} />
                {httpInfo.duration_ms} ms
              </span>
            )}
            {response.trim() !== '' && (
              <span className="content-type">
                {(responseBytes / 1024).toFixed(1)} KB
              </span>
            )}
            <button
              type="button"
              className="icon-btn small"
              onClick={() =>
                setResponseState((current) =>
                  current === 'collapsed' ? 'normal' : 'collapsed',
                )
              }
              aria-label={
                responseState === 'collapsed'
                  ? 'Expandir la respuesta'
                  : 'Contraer la respuesta'
              }
              title={
                responseState === 'collapsed' ? 'Expandir respuesta' : 'Contraer respuesta'
              }
            >
              {responseState === 'collapsed' ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronUp size={14} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn small"
              onClick={() =>
                setResponseState((current) =>
                  current === 'maximized' ? 'normal' : 'maximized',
                )
              }
              aria-label={
                responseState === 'maximized'
                  ? 'Restaurar el tamaño de la respuesta'
                  : 'Maximizar la respuesta'
              }
              title={
                responseState === 'maximized' ? 'Restaurar tamaño' : 'Maximizar respuesta'
              }
            >
              {responseState === 'maximized' ? (
                <Minimize2 size={14} />
              ) : (
                <Maximize2 size={14} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn small"
              onClick={onCopy}
              aria-label="Copiar respuesta"
              title="Copiar respuesta"
            >
              {copied ? <Check size={14} className="success-icon" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {responseState !== 'collapsed' &&
          (!status && !sending ? (
            <div className="response-empty">
              <Send size={18} />
              <p>Envía la request para ver la respuesta</p>
              <span>Ctrl + Enter</span>
            </div>
          ) : (
            <ResponseViewer content={response} language={responseLanguage} />
          ))}
      </div>
    </>
  );
};

export default RubriResponsePanel;
