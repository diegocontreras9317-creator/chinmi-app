import React from 'react';
import { ChinmiLogo } from './ChinmiLogo';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Cargando y verificando sesión en Chinmi...'
}) => {
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-pink-200 dark:border-pink-950 border-t-[#681841] dark:border-t-pink-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <ChinmiLogo size="sm" variant="icon" />
        </div>
      </div>
      <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
        Chinmi GastroBar POS
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs animate-pulse">
        {message}
      </p>
    </div>
  );
};
