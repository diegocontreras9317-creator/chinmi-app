import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LandingPage } from './LandingPage';
import { ManagerPinModal } from './ManagerPinModal';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner message="Verificando credenciales de Firebase Auth..." />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <LandingPage />
        <ManagerPinModal />
      </>
    );
  }

  return <>{children}</>;
};
