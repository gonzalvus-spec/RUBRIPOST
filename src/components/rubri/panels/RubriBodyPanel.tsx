import clsx from 'clsx';
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import { MarkerSeverity } from 'monaco-editor';

import { useApiStore } from '../../../store/apiStore';
import './RubriPanel.css';
import './RubriBodyPanel.css';

interface RubriBodyPanelProps {
  jsonErrors: number;
  bodyBytes: number;
  onJsonErrorsChange: (errors: number) => void;
}

/** Pestaña Body: editor JSON con validación en vivo. */
export const RubriBodyPanel = ({
  jsonErrors,
  bodyBytes,
  onJsonErrorsChange,
}: RubriBodyPanelProps) => {
  const body = useApiStore((state) => state.body);
  const setBody = useApiStore((state) => state.setBody);

  return (
    <div className="panel request-panel">
      <div className="panel-toolbar">
        <div className="body-types">
          <span className="body-type active">
            <span className="body-type-dot" />
            raw
          </span>
          <span className="body-type-chip">JSON</span>
        </div>

        <div className="panel-toolbar-right">
          {!body.trim() ? (
            <span className="panel-caption">Vacío</span>
          ) : jsonErrors > 0 ? (
            <span className="json-status error">
              <TriangleAlert size={11} />
              JSON inválido
            </span>
          ) : (
            <span className="json-status ok">
              <Check size={11} />
              JSON válido
            </span>
          )}
          <span className="content-type">{(bodyBytes / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      <div
        className={clsx('editor-shell', {
          'has-errors': body.trim() !== '' && jsonErrors > 0,
        })}
      >
        <Editor
          height="100%"
          language="json"
          theme="rubrifact-dark"
          value={body}
          onChange={(value) => {
            const nextVal = value ?? '';
            setBody(nextVal);
            if (!nextVal.trim()) {
              onJsonErrorsChange(0);
            }
          }}
          onValidate={(markers) => {
            const currentBody = useApiStore.getState().body;
            if (!currentBody || currentBody.trim() === '') {
              onJsonErrorsChange(0);
              return;
            }
            onJsonErrorsChange(
              markers.filter((marker) => marker.severity === MarkerSeverity.Error).length,
            );
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 15,
            fontFamily: "'JetBrains Mono', monospace",
            automaticLayout: true,
            formatOnPaste: true,
            formatOnType: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            placeholder: 'Escribe aquí el cuerpo del mensaje (JSON)...',
          }}
          loading={
            <div className="editor-loading">
              <LoaderCircle size={16} className="spin" />
              Cargando Monaco Editor...
            </div>
          }
        />
      </div>
    </div>
  );
};

export default RubriBodyPanel;
