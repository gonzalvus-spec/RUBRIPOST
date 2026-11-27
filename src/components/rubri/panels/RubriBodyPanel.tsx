import '../../../lib/monacoSetup';
import clsx from 'clsx';
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { MarkerSeverity } from 'monaco-editor';

import { useApiStore } from '../../../store/apiStore';
import './RubriPanel.css';
import './RubriBodyPanel.css';
import { VariableBadges } from '../environments/VariableBadges';
import { useEnvironmentStore } from '../../../store/environmentStore';

interface RubriBodyPanelProps {
  jsonErrors: number;
  bodyBytes: number;
  onJsonErrorsChange: (errors: number) => void;
  onSave: () => void;
}

/** Pestaña Body: editor JSON con validación en vivo. */
export const RubriBodyPanel = ({
  jsonErrors,
  bodyBytes,
  onJsonErrorsChange,
  onSave,
}: RubriBodyPanelProps) => {
  const body = useApiStore((state) => state.body);
  const setBody = useApiStore((state) => state.setBody);
  const environments = useEnvironmentStore((state) => state.environments);
  const activeEnvironmentId = useEnvironmentStore((state) => state.activeEnvironmentId);
  const onSaveRef = useRef(onSave);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decorationsRef = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  onSaveRef.current = onSave;

  const refreshVariableDecorations = () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const environment = environments.find((item) => item._id === activeEnvironmentId);
    const decorations = [...body.matchAll(/{{\s*([A-Za-z_][\w.-]*)\s*}}/g)].map((match) => {
      const name = match[1].trim();
      const variable = environment?.variables.find((item) => item.enabled && item.key === name);
      const start = model.getPositionAt(match.index);
      const end = model.getPositionAt(match.index + match[0].length);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        options: {
          inlineClassName: variable ? (variable.type === 'secret' ? 'environment-variable-secret' : 'environment-variable-known') : 'environment-variable-missing',
          hoverMessage: { value: variable ? `**${name}** = \`${variable.value}\`` : `**${name}** no está definida en el Environment activo` },
        },
      };
    });
    if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection();
    decorationsRef.current.set(decorations);
  };

  useEffect(refreshVariableDecorations, [body, environments, activeEnvironmentId]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addAction({
      id: 'rubripost.save-request',
      label: 'Guardar request en MongoDB',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSaveRef.current(),
    });
    refreshVariableDecorations();
  };

  return (
    <div className="panel request-panel">
      <div className="panel-toolbar">
        <div className="body-types">
          <span className="body-type active">
            <span className="body-type-dot" />
            raw
          </span>
          <span className="body-type-chip">JSON</span>
          <VariableBadges values={[body]} />
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
          onMount={handleMount}
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
