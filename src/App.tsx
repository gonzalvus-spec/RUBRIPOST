import { useEffect, useRef, useState } from 'react';

import RubriApiView from './components/rubri/RubriApiView';
import LoginView from './components/auth/LoginView';
import { SplashScreen, useSplashGate } from './components/splash/SplashScreen';
import { useAuthStore } from './store/authStore';

/**
 * Shell de la aplicación: sin sesión se muestra el login y, al ingresar,
 * la vista del cliente HTTP (`RubriApiView`).
 */
function App() {
  const sesion = useAuthStore((state) => state.sesion);
  const comprobarUsuarios = useAuthStore((state) => state.comprobarUsuarios);
  const [authReady, setAuthReady] = useState(Boolean(sesion));
  const authCheckStarted = useRef(false);
  const authSplash = useSplashGate(authReady, 1300);

  useEffect(() => {
    if (sesion || authCheckStarted.current) return;
    authCheckStarted.current = true;
    void comprobarUsuarios().finally(() => setAuthReady(true));
  }, [comprobarUsuarios, sesion]);

  if (!sesion && authSplash.visible) {
    return (
      <SplashScreen
        status={authReady ? 'Preparando acceso seguro...' : 'Conectando con la base de datos...'}
        progress={authReady ? 100 : 24}
        indeterminate={!authReady}
        leaving={authSplash.leaving}
      />
    );
  }

  return sesion ? <RubriApiView /> : <LoginView />;
}

export default App;
