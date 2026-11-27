import '../../../lib/monacoSetup';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import clsx from 'clsx';
import { ChevronDown, Trash2 } from 'lucide-react';

import { useApiStore } from '../../../store/apiStore';
import './RubriPanel.css';
import './RubriScriptsPanel.css';

type ScriptPhase = 'before' | 'after';

interface ScriptSnippet {
  label: string;
  description: string;
  code: string;
}

const SCRIPT_SNIPPETS: readonly ScriptSnippet[] = [
  {
    label: 'Guardar variable de entorno',
    description: 'bru.setEnvVar',
    code: "bru.setEnvVar('variable', 'valor');",
  },
  {
    label: 'Obtener header de respuesta',
    description: 'res.getHeader',
    code: "const requestId = res.getHeader('x-request-id');",
  },
  {
    label: 'Extraer token del body JSON',
    description: 'res.getBody',
    code: "const body = res.getBody();\nbru.setEnvVar('token', body.token);",
  },
  {
    label: 'Compatibilidad Postman',
    description: 'pm.environment.set',
    code: "pm.environment.set('variable', 'valor');",
  },
];

export const RubriScriptsPanel = () => {
  const [phase, setPhase] = useState<ScriptPhase>('before');
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const before = useApiStore((state) => state.preRequestScript);
  const after = useApiStore((state) => state.postResponseScript);
  const setBefore = useApiStore((state) => state.setPreRequestScript);
  const setAfter = useApiStore((state) => state.setPostResponseScript);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const snippetsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const snippetsMenuRef = useRef<HTMLDivElement | null>(null);

  const activeCode = phase === 'before' ? before : after;
  const activeTitle = phase === 'before' ? 'Pre Request' : 'Post Response';
  const updateActiveCode = phase === 'before' ? setBefore : setAfter;

  useEffect(() => {
    if (!snippetsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!snippetsTriggerRef.current?.contains(target) && !snippetsMenuRef.current?.contains(target)) setSnippetsOpen(false);
    };
    const closeMenu = () => setSnippetsOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [snippetsOpen]);

  const selectPhase = (nextPhase: ScriptPhase) => {
    setPhase(nextPhase);
    setSnippetsOpen(false);
  };

  const toggleSnippets = () => {
    if (snippetsOpen) {
      setSnippetsOpen(false);
      return;
    }
    const rect = snippetsTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 300;
    const height = 250;
    setMenuPosition({
      top: rect.bottom + height <= window.innerHeight - 8 ? rect.bottom + 5 : Math.max(8, rect.top - height - 5),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
    setSnippetsOpen(true);
  };

  const insertSnippet = (snippet: string) => {
    const instance = editorRef.current;
    const selection = instance?.getSelection();
    const model = instance?.getModel();
    if (instance && selection && model) {
      const offset = model.getOffsetAt(selection.getStartPosition());
      const contentBefore = model.getValue().slice(0, offset);
      const prefix = contentBefore && !contentBefore.endsWith('\n') ? '\n\n' : '';
      instance.executeEdits('rubripost-snippet', [{ range: selection, text: `${prefix}${snippet}`, forceMoveMarkers: true }]);
      instance.pushUndoStop();
      instance.focus();
    } else {
      updateActiveCode(`${activeCode}${activeCode && !activeCode.endsWith('\n') ? '\n\n' : ''}${snippet}`);
    }
    setSnippetsOpen(false);
  };

  const clearScript = () => {
    updateActiveCode('');
    editorRef.current?.focus();
  };

  return (
    <div className="panel request-panel scripts-panel">
      <aside className="scripts-nav" role="tablist" aria-label="Fase del script">
        <span className="scripts-nav-title">SCRIPTS</span>
        <button type="button" role="tab" aria-selected={phase === 'before'} className={clsx({ active: phase === 'before' })} onClick={() => selectPhase('before')}>
          <span>Pre Request</span>
          {before.trim() && <span className="script-code-dot" aria-label="Contiene código" />}
        </button>
        <button type="button" role="tab" aria-selected={phase === 'after'} className={clsx({ active: phase === 'after' })} onClick={() => selectPhase('after')}>
          <span>Post Response</span>
          {after.trim() && <span className="script-code-dot" aria-label="Contiene código" />}
        </button>
      </aside>

      <section className="scripts-editor" aria-label={`Editor ${activeTitle}`}>
        <header className="scripts-toolbar">
          <div className="scripts-toolbar-title">
            <strong>{activeTitle}</strong>
            <span>JavaScript</span>
          </div>
          <div className="scripts-toolbar-actions">
            <button ref={snippetsTriggerRef} type="button" className={clsx('scripts-snippets-trigger', { active: snippetsOpen })} onClick={toggleSnippets} aria-haspopup="menu" aria-expanded={snippetsOpen}>
              Snippets <ChevronDown size={13} />
            </button>
            {activeCode.trim() && (
              <button type="button" className="scripts-clear" onClick={clearScript} aria-label={`Limpiar ${activeTitle}`} title="Limpiar script">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </header>

        <div className="scripts-monaco">
          <Editor
            height="100%"
            language="javascript"
            theme="rubrifact-dark"
            value={activeCode}
            onMount={(instance) => { editorRef.current = instance; }}
            onChange={(value) => updateActiveCode(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 10, bottom: 10 },
              tabSize: 2,
            }}
          />
        </div>
      </section>

      {snippetsOpen && createPortal(
        <div ref={snippetsMenuRef} className="scripts-snippets-menu" style={menuPosition} role="menu">
          <span className="scripts-snippets-heading">INSERTAR SNIPPET</span>
          {SCRIPT_SNIPPETS.map((snippet) => (
            <button type="button" role="menuitem" key={snippet.label} onClick={() => insertSnippet(snippet.code)}>
              <span>{snippet.label}</span>
              <small>{snippet.description}</small>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};
