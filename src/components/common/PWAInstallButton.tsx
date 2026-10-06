import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Smartphone, Download, X, Share } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as installed app, hide
  if (isInstalled) {
    return null;
  }

  // Android / Chromium / Desktop PWA install
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 sm:gap-2 p-1.5 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs sm:text-sm font-semibold border border-rose-950 shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${className}`}
        title="Instalar Chinmi App en tu teléfono o computadora"
      >
        <Download className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
        <span className="hidden md:inline">Instalar App Móvil</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 md:px-3 md:py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${className}`}
          title="Instalar Chinmi App en iPhone"
        >
          <Smartphone className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0 text-slate-600 dark:text-slate-400" />
          <span className="hidden md:inline">Instalar en iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative text-slate-900 dark:text-white">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-md transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-md bg-stone-100 dark:bg-slate-800 flex items-center justify-center text-rose-900 dark:text-rose-400 border border-stone-200 dark:border-slate-700">
                  <Share className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Instalar en tu iPhone / iPad</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sigue estos sencillos pasos en Safari:</p>
                </div>
              </div>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-rose-900 dark:text-rose-400">1.</span>
                  <span>Toca el botón <strong className="text-slate-900 dark:text-white">Compartir</strong> (icono de cuadrado con flecha hacia arriba) en la barra inferior de Safari.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-rose-900 dark:text-rose-400">2.</span>
                  <span>Desplázate hacia abajo y selecciona <strong className="text-slate-900 dark:text-white">"Agregar a inicio"</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-rose-900 dark:text-rose-400">3.</span>
                  <span>Toca <strong className="text-slate-900 dark:text-white">"Agregar"</strong> arriba a la derecha. ¡Listo!</span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full py-2.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback button for ambient browsers
  return (
    <button
      type="button"
      onClick={() => {
        alert('Para instalar la app en tu teléfono, abre el menú de tu navegador (3 puntos) y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
      }}
      className={`inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 md:px-3 md:py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${className}`}
      title="Instalar App Móvil"
    >
      <Smartphone className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-slate-600 dark:text-slate-400 shrink-0" />
      <span className="hidden md:inline">Instalar App Móvil</span>
    </button>
  );
};
