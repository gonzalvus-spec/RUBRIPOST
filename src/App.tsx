import { useEffect, useRef, useState } from 'react';

import RubriApiView from './components/rubri/RubriApiView';
import LoginView from './components/auth/LoginView';
import { SplashScreen, useSplashGate } from './components/splash/SplashScreen';
import { OfflineBanner } from './components/system/OfflineBanner';
import { useAuthStore } from './store/authStore';
import { useNetworkStore } from './store/networkStore';

/**
 * Shell de la aplicación: sin sesión se muestra el login y, al ingresar,
 * la vista del cliente HTTP (`RubriApiView`).
 */
function App() {
  const sesion = useAuthStore((state) => state.sesion);
  const comprobarUsuarios = useAuthStore((state) => state.comprobarUsuarios);
  const setBrowserStatus = useNetworkStore((state) => state.setBrowserStatus);
  const [authReady, setAuthReady] = useState(Boolean(sesion));
  const authCheckStarted = useRef(false);
  const authSplash = useSplashGate(authReady, 1300);

  useEffect(() => {
    if (sesion || authCheckStarted.current) return;
    authCheckStarted.current = true;
    void comprobarUsuarios().finally(() => setAuthReady(true));
  }, [comprobarUsuarios, sesion]);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserStatus(true);
      if (!useAuthStore.getState().sesion) void comprobarUsuarios();
    };
    const handleOffline = () => setBrowserStatus(false);
    setBrowserStatus(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [comprobarUsuarios, setBrowserStatus]);

  if (!sesion && authSplash.visible) {
    return (
      <>
        <OfflineBanner />
        <SplashScreen
          status={authReady ? 'Preparando acceso seguro...' : 'Conectando con la base de datos...'}
          progress={authReady ? 100 : 24}
          indeterminate={!authReady}
          leaving={authSplash.leaving}
        />
      </>
    );
  }

  return (
    <>
      <OfflineBanner />
      {sesion ? <RubriApiView /> : <LoginView />}
    </>
  );
}

export default App;
