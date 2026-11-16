import { useEffect, useState } from 'react';

import packageInfo from '../../../package.json';
import './SplashScreen.css';

interface SplashScreenProps {
  status: string;
  progress?: number;
  indeterminate?: boolean;
  leaving?: boolean;
  mode?: 'startup' | 'update';
}

export interface SplashGate {
  visible: boolean;
  leaving: boolean;
}

/** Mantiene el splash un mínimo y permite que la salida termine su animación. */
export const useSplashGate = (ready: boolean, minimumMs = 1400): SplashGate => {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMinimumElapsed(true), minimumMs);
    return () => window.clearTimeout(timeout);
  }, [minimumMs]);

  // Ojo: este efecto NO debe contener el temporizador de salida. Si lo hace,
  // `setLeaving(true)` lo vuelve a ejecutar, React limpia el temporizador
  // pendiente y el splash queda invisible pero montado para siempre.
  useEffect(() => {
    if (!ready || !minimumElapsed || leaving) return;
    setLeaving(true);
  }, [ready, minimumElapsed, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(() => setVisible(false), 420);
    return () => window.clearTimeout(timeout);
  }, [leaving]);

  // Válvula de seguridad: nunca dejamos el inicio cubierto por el splash.
  useEffect(() => {
    if (!visible) return;
    const hardStop = window.setTimeout(() => setVisible(false), minimumMs + 6000);
    return () => window.clearTimeout(hardStop);
  }, [minimumMs, visible]);

  return { visible, leaving };
};

export const SplashScreen = ({
  status,
  progress = 0,
  indeterminate = false,
  leaving = false,
  mode = 'startup',
}: SplashScreenProps) => {
  const boundedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      className={`rubri-splash ${leaving ? 'is-leaving' : ''} ${mode === 'update' ? 'is-update' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={status}
    >
      <div className="rubri-splash-shell">
        <svg
          className="rubri-splash-banner"
          viewBox="0 0 850 230"
          role="img"
          aria-labelledby="rubri-splash-title rubri-splash-description"
        >
          <title id="rubri-splash-title">RubriPost</title>
          <desc id="rubri-splash-description">Cliente API y workspace colaborativo de Rubrifact</desc>
          <defs>
            <radialGradient id="rubriSplashGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(120 115) rotate(90) scale(115)">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.5" />
              <stop offset="40%" stopColor="#0b4a32" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#062a1c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="rubriSplashCube" x1="72" y1="56" x2="168" y2="174" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#0b4a32" />
            </linearGradient>
          </defs>

          <rect className="rubri-splash-surface" x="1" y="1" width="848" height="228" rx="14" strokeWidth="1.5" />
          <circle className="rubri-splash-halo" cx="120" cy="115" r="115" fill="url(#rubriSplashGlow)" />
          <g className="rubri-splash-cube">
            <polygon points="120,56 168,84 168,146 120,174 72,146 72,84" fill="url(#rubriSplashCube)" />
            <g stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round">
              <polygon points="120,66 156,87 120,108 84,87" fill="none" />
              <polygon points="81,94 115,114 115,158 81,138" fill="none" />
              <polygon points="159,94 125,114 125,158 159,138" fill="none" />
            </g>
          </g>

          <text x="220" y="55" className="rubri-splash-company">RUBRIFACT SOLUCIONES TECNOLÓGICAS S.A.C.</text>
          <text x="218" y="105" className="rubri-splash-wordmark">RUBRIPOST</text>
          <text x="220" y="132" className="rubri-splash-copy">Cliente API · Colecciones compartidas · Historial por proyecto</text>
          <text x="220" y="151" className="rubri-splash-copy">Sincronización en tiempo real</text>
          <g className="rubri-splash-pill">
            <rect x="220" y="174" width="137" height="27" rx="13.5" />
            <text x="288.5" y="192" textAnchor="middle">REST · HTTP · JSON</text>
          </g>
          <g className="rubri-splash-pill version">
            <rect x="367" y="174" width="73" height="27" rx="13.5" />
            <text x="403.5" y="192" textAnchor="middle">v{packageInfo.version}</text>
          </g>
        </svg>

        <div className="rubri-splash-progress" aria-hidden="true">
          <span
            className={indeterminate ? 'is-indeterminate' : ''}
            style={indeterminate ? undefined : { width: `${boundedProgress}%` }}
          />
        </div>
        <div className="rubri-splash-status">
          <span className="rubri-splash-status-dot" />
          <p>{status}</p>
          {!indeterminate && <strong>{Math.round(boundedProgress)}%</strong>}
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
