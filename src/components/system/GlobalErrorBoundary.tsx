import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

import './GlobalErrorBoundary.css';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

const clearSessionWithoutStores = (): void => {
  try { window.localStorage.removeItem('rubripost.sesion'); } catch (error) {
    console.warn('No se pudo eliminar la sesión local', error);
  }
  try { window.sessionStorage.clear(); } catch (error) {
    console.warn('No se pudo limpiar el almacenamiento temporal', error);
  }
};

export const RecoveryScreen = ({ error }: { error: Error }) => (
  <main className="recovery-screen">
    <section className="recovery-card" role="alert">
      <span className="recovery-icon"><AlertTriangle size={25} /></span>
      <h1>RubriPost no pudo iniciar correctamente</h1>
      <p>La aplicación encontró un error inesperado. Puedes reintentar sin perder tu sesión o restablecer únicamente la sesión guardada en este equipo.</p>
      <small>{error.message || 'Error de inicialización desconocido'}</small>
      <div className="recovery-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          <RefreshCw size={15} /> Reintentar
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { clearSessionWithoutStores(); window.location.reload(); }}>
          <Trash2 size={15} /> Restablecer sesión local
        </button>
      </div>
    </section>
  </main>
);

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error crítico de React', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return <RecoveryScreen error={this.state.error} />;
  }
}
