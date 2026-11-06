import RubriApiView from './components/rubri/RubriApiView';
import LoginView from './components/auth/LoginView';
import { useAuthStore } from './store/authStore';

/**
 * Shell de la aplicación: sin sesión se muestra el login y, al ingresar,
 * la vista del cliente HTTP (`RubriApiView`).
 */
function App() {
  const sesion = useAuthStore((state) => state.sesion);
  return sesion ? <RubriApiView /> : <LoginView />;
}

export default App;
