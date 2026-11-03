import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LandingPage } from './LandingPage';
import { AuthPage } from './AuthPage';
import { ManagerPinModal } from './ManagerPinModal';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { BillingFrequency } from '../../config/pricingPlans';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function getInitialPublicRoute(): {
  view: 'landing' | 'auth';
  mode: 'login' | 'register';
} {
  if (typeof window === 'undefined') {
    return { view: 'landing', mode: 'login' };
  }
  const path = window.location.pathname.toLowerCase();
  if (path === '/registro' || path === '/crear-cuenta') {
    return { view: 'auth', mode: 'register' };
  }
  if (path === '/acceso' || path === '/login' || path === '/iniciar-sesion') {
    return { view: 'auth', mode: 'login' };
  }
  return { view: 'landing', mode: 'login' };
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  const initialRoute = getInitialPublicRoute();
  const [publicView, setPublicView] = useState<'landing' | 'auth'>(initialRoute.view);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialRoute.mode);
  const [authWantPro, setAuthWantPro] = useState<boolean>(false);
  const [authCycle, setAuthCycle] = useState<BillingFrequency>('annual');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const next = getInitialPublicRoute();
      setPublicView(next.view);
      setAuthMode(next.mode);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cuando el usuario inicia sesión o se registra, limpiar la ruta pública de acceso
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (
        path === '/acceso' ||
        path === '/login' ||
        path === '/iniciar-sesion' ||
        path === '/registro' ||
        path === '/crear-cuenta'
      ) {
        try {
          window.history.replaceState({}, '', '/');
        } catch {
          // Ignorar en entornos restringidos
        }
      }
      setPublicView('landing');
    }
  }, [isAuthenticated]);

  const handleOpenAuthPage = useCallback(
    (options?: {
      mode?: 'login' | 'register';
      wantPro?: boolean;
      cycle?: BillingFrequency;
    }) => {
      const targetMode = options?.mode || 'login';
      setAuthMode(targetMode);
      if (typeof options?.wantPro === 'boolean') {
        setAuthWantPro(options.wantPro);
      }
      if (options?.cycle) {
        setAuthCycle(options.cycle);
      }
      setPublicView('auth');

      if (typeof window !== 'undefined') {
        const targetPath = targetMode === 'register' ? '/registro' : '/iniciar-sesion';
        try {
          if (window.location.pathname !== targetPath) {
            window.history.pushState({ view: 'auth', mode: targetMode }, '', targetPath);
          }
        } catch {
          // Ignorar si pushState falla en iframe restringido
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    []
  );

  const handleBackToHome = useCallback(() => {
    setPublicView('landing');
    if (typeof window !== 'undefined') {
      try {
        if (window.location.pathname !== '/') {
          window.history.pushState({ view: 'landing' }, '', '/');
        }
      } catch {
        // Ignorar si pushState falla en iframe restringido
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  if (isLoading) {
    return <LoadingSpinner message="Verificando credenciales..." />;
  }

  if (!isAuthenticated) {
    return (
      <>
        {publicView === 'auth' ? (
          <AuthPage
            initialMode={authMode}
            initialWantPro={authWantPro}
            initialBillingCycle={authCycle}
            onBackToHome={handleBackToHome}
          />
        ) : (
          <LandingPage onOpenAuthPage={handleOpenAuthPage} />
        )}
        <ManagerPinModal />
      </>
    );
  }

  return <>{children}</>;
};
