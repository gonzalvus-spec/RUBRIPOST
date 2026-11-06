import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';

/**
 * Monaco se empaqueta localmente (sin CDN) para que el cliente funcione
 * offline dentro de Tauri.
 */
const environment: monaco.Environment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment =
  environment;

monaco.editor.defineTheme('rubrifact-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '0A8F4E', fontStyle: 'italic' },
    // JSON Keys en dorado elegante
    { token: 'string.key.json', foreground: 'C5A059', fontStyle: 'bold' },
    // Valores de texto en verde esmeralda menta
    { token: 'string.value.json', foreground: '6EE7B7' },
    { token: 'string', foreground: '6EE7B7' },
    // Números en azul cielo nítido
    { token: 'number', foreground: '60A5FA' },
    { token: 'number.json', foreground: '60A5FA' },
    // Booleanos (true, false) y null en ámbar/naranja cálido
    { token: 'keyword.json', foreground: 'F59E0B', fontStyle: 'bold' },
    { token: 'keyword', foreground: 'F59E0B' },
    // Corchetes, llaves y delimitadores
    { token: 'delimiter.bracket.json', foreground: 'E2E8F0' },
    { token: 'delimiter.array.json', foreground: 'E2E8F0' },
    { token: 'delimiter', foreground: 'CBD5E1' },
    // XML
    { token: 'tag.xml', foreground: 'C5A059' },
    { token: 'tag.id.xml', foreground: 'C5A059' },
    { token: 'attribute.name.xml', foreground: '60A5FA' },
    { token: 'attribute.value.xml', foreground: '6EE7B7' },
    { token: 'delimiter.xml', foreground: 'E0E0E0' },
  ],
  colors: {
    'editor.background': '#181A1D',
    'editor.foreground': '#E6E6E6',
    'editorPlaceholder.foreground': '#7A7A7A',
    'editorLineNumber.foreground': '#525B66',
    'editorLineNumber.activeForeground': '#C5A059',
    'editor.lineHighlightBackground': '#22272E',
    'editor.selectionBackground': '#046A3866',
    'editorCursor.foreground': '#C5A059',
    'editorIndentGuide.background1': '#262D35',
    'editorWidget.background': '#181A1D',
    'editorWidget.border': '#333A44',
    'scrollbarSlider.background': '#046A3855',
    'scrollbarSlider.hoverBackground': '#0A8F4E88',
    'scrollbarSlider.activeBackground': '#0A8F4EAA',
  },
});

loader.config({ monaco });

export { monaco };
