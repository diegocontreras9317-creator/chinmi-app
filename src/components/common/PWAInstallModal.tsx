import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Tablet, Download, X, Check, Share2, MoreVertical, ShieldCheck, Sparkles } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    }
  };

  const renderModalContent = () => {
    if (installSuccess) {
      return (
        <div className="p-6 text-center space-y-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
            <Check className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-200">
            ¡Aplicación Instalada con Éxito!
          </h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Ahora puedes abrir Chinmi App desde el icono de tu pantalla de inicio en tu celular o tablet.
          </p>
        </div>
      );
    }

    if (isInstalled) {
      return (
        <div className="p-4 text-center space-y-2 bg-pink-50 dark:bg-pink-950/40 rounded-2xl border border-pink-200 dark:border-pink-800">
          <Sparkles className="w-6 h-6 text-[#e64980] mx-auto" />
          <h3 className="text-base font-bold text-[#681841] dark:text-pink-200">
            ¡Ya estás usando la App Instalada!
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Esta aplicación ya se encuentra ejecutándose en modo nativo independiente.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Botón de Instalación Automática Directa */}
        {isInstallable && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30 border border-pink-200 dark:border-pink-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#681841] dark:text-pink-300">
                <Sparkles className="w-4 h-4 text-[#e64980]" />
                <span>Instalación Automática En 1-Clic</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                Listo
              </span>
            </div>
            <button
              onClick={handleInstallClick}
              className="w-full py-3 px-4 rounded-xl bg-[#e64980] hover:bg-[#d6336c] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>Instalar Aplicación en Este Dispositivo</span>
            </button>
          </div>
        )}

        {/* Guía Paso a Paso para Android y Tablets */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <Tablet className="w-5 h-5 text-[#e64980]" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Instrucciones para Android y Tablet (Chrome / Edge / Samsung)
            </h3>
          </div>

          <div className="grid gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-6 h-6 shrink-0 rounded-full bg-[#681841] text-white font-bold flex items-center justify-center text-xs">
                1
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                  Abre el Menú del Navegador
                  <MoreVertical className="w-4 h-4 inline text-slate-500" />
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  En la esquina superior derecha del navegador Chrome o Edge en tu Android o Tablet, toca los 3 puntos del menú.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-6 h-6 shrink-0 rounded-full bg-[#681841] text-white font-bold flex items-center justify-center text-xs">
                2
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                  Toca &quot;Instalar Aplicación&quot; o &quot;Agregar a Pantalla Principal&quot;
                  <Download className="w-4 h-4 inline text-[#e64980]" />
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Selecciona la opción de instalar aplicación o añadir a la pantalla de inicio.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
              <div className="w-6 h-6 shrink-0 rounded-full bg-[#681841] text-white font-bold flex items-center justify-center text-xs">
                3
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                  Confirma e Inicia la App
                  <ShieldCheck className="w-4 h-4 inline text-emerald-500" />
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Aparecerá el icono oficial de Chinmi App en tu pantalla de inicio como una aplicación nativa.
                </p>
              </div>
            </div>
          </div>

          {/* Sección para iPhone / iPad */}
          {isIOS && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                <Share2 className="w-4 h-4 text-amber-600" />
                <span>Instrucciones para iPhone / iPad (Safari)</span>
              </div>
              <p className="text-amber-800 dark:text-amber-300">
                En Safari, presiona el botón Compartir y luego selecciona &quot;Agregar a inicio&quot;.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl shadow-pink-500/10">
        
        {/* Header con Degradado Chinmi */}
        <div className="p-6 bg-gradient-to-r from-[#681841] via-[#d6336c] to-[#e64980] text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur border border-white/20">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-pink-100">
                PWA Nativa App
              </span>
              <h2 className="text-xl font-black text-white leading-tight">
                Instalar Chinmi App en Celular o Tablet
              </h2>
            </div>
          </div>
          <p className="text-xs text-pink-100/90 leading-relaxed">
            Obtén acceso directo desde la pantalla de inicio con rendimiento ultrarrápido sin ocupar espacio de tienda.
          </p>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {renderModalContent()}

          {/* Ventajas PWA */}
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/40 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-200">✨ Beneficios de la App PWA Nativa:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Funciona a pantalla completa sin barra del navegador.</li>
              <li>Sincronización en tiempo real para meseros y barra.</li>
              <li>No requiere tienda Play Store ni actualizaciones manuales.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
