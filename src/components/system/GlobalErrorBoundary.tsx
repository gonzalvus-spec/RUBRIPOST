import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

import { clearLocalSession } from '../../store/authStore';
import './GlobalErrorBoundary.css';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error crítico de React', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  private resetSession = (): void => {
    clearLocalSession();
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="recovery-screen">
        <section className="recovery-card" role="alert">
          <span className="recovery-icon"><AlertTriangle size={25} /></span>
          <h1>RubriPost no pudo mostrar esta pantalla</h1>
          <p>La aplicación encontró un error inesperado. Puedes reintentar sin perder tu sesión o restablecer únicamente la sesión guardada en este equipo.</p>
          <small>{this.state.error.message || 'Error de renderizado desconocido'}</small>
          <div className="recovery-actions">
            <button type="button" className="btn btn-primary" onClick={this.retry}>
              <RefreshCw size={15} /> Reintentar
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.resetSession}>
              <Trash2 size={15} /> Restablecer sesión local
            </button>
          </div>
        </section>
      </main>
    );
  }
}
