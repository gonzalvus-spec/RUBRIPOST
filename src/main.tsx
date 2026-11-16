import React, { Suspense, lazy, type CSSProperties } from 'react';
import ReactDOM from 'react-dom/client';

import './App.css';
import { GlobalErrorBoundary, RecoveryScreen } from './components/system/GlobalErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<main style="padding:32px;color:#fff;background:#121212;min-height:100vh;font-family:Segoe UI,sans-serif"><h1>RubriPost no pudo iniciar</h1><p>No se encontró el contenedor principal #root.</p></main>';
  throw new Error('No se encontró el elemento #root');
}

const root = ReactDOM.createRoot(rootElement);
const App = lazy(() => import('./App'));

const bootStyles: Record<string, CSSProperties> = {
  screen: {
    display: 'grid',
    minHeight: '100vh',
    placeItems: 'center',
    background: '#121212',
    color: '#fff',
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
  },
  card: {
    display: 'grid',
    justifyItems: 'center',
    gap: 12,
    width: 'min(420px, calc(100vw - 32px))',
    padding: 28,
    border: '1px solid #333',
    borderRadius: 12,
    background: '#1e1e1e',
    boxShadow: '0 20px 55px rgba(0,0,0,.35)',
  },
  mark: {
    display: 'grid',
    width: 46,
    height: 46,
    placeItems: 'center',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #0a8f4e, #024d28)',
    boxShadow: '0 0 24px rgba(10,143,78,.3)',
    fontSize: 22,
    fontWeight: 800,
  },
  title: { margin: 0, fontSize: 20, letterSpacing: 1.2 },
  text: { margin: 0, color: '#a0a0a0', fontSize: 13 },
  track: { width: '100%', height: 4, overflow: 'hidden', borderRadius: 99, background: '#2a2a2a' },
  bar: { width: '45%', height: '100%', borderRadius: 99, background: '#c5a059' },
};

const BootstrapScreen = () => (
  <main style={bootStyles.screen} role="status" aria-live="polite">
    <section style={bootStyles.card}>
      <span style={bootStyles.mark}>R</span>
      <h1 style={bootStyles.title}>RUBRIPOST</h1>
      <p style={bootStyles.text}>Iniciando aplicación…</p>
      <span style={bootStyles.track}><span style={{ ...bootStyles.bar, display: 'block' }} /></span>
    </section>
  </main>
);

const errorFrom = (value: unknown): Error => {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  return new Error('Error crítico desconocido durante el arranque');
};

/**
 * React vacía `#root` en su primer commit, así que el fallback `.html-boot`
 * sigue presente únicamente si la aplicación nunca llegó a montarse. Ese es
 * el único caso en el que tomamos el control global: las promesas de red
 * pueden fallar con la interfaz ya renderizada y no deben reemplazarla.
 */
const reactHasMounted = (): boolean => !rootElement.querySelector('.html-boot');

const showFatalErrorIfEmpty = (error: Error): void => {
  console.error('Error global de RubriPost', error);
  if (!reactHasMounted() || rootElement.childElementCount === 0) {
    root.render(<RecoveryScreen error={error} />);
  }
};

window.addEventListener('error', (event) => {
  showFatalErrorIfEmpty(event.error instanceof Error ? event.error : new Error(event.message));
});
window.addEventListener('unhandledrejection', (event) => {
  showFatalErrorIfEmpty(errorFrom(event.reason));
});

root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <Suspense fallback={<BootstrapScreen />}>
        <App />
      </Suspense>
    </GlobalErrorBoundary>
  </React.StrictMode>,
);
