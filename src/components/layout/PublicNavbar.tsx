import React from 'react';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { useApp } from '../../context/AppContext';
import { Sun, Moon, Sparkles, ArrowRight, User } from 'lucide-react';

interface PublicNavbarProps {
  activeTab?: 'demo' | 'register' | 'login' | 'pricing';
  onNavigateTab?: (tab: 'demo' | 'register' | 'login' | 'pricing') => void;
}

/**
 * PublicNavbar
 * Barra de navegación superior EXCLUSIVA para rutas públicas (Landing Page, Login, Registro, Precios).
 * REGLA ESTRICTA DE BRANDING:
 * El logo mostrado es ESTÁTICO y pertenece únicamente a la marca del SaaS "Chinmi App".
 * BAJO NINGUNA CIRCUNSTANCIA consume el logo de un restaurante particular ni variables de estado de usuario.
 */
export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  activeTab,
  onNavigateTab
}) => {
  const { theme, toggleTheme } = useApp();

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        
        {/* 1. Logo Oficial Estático del SaaS Chinmi App */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab?.('demo')}
            className="flex items-center text-left transition-transform active:scale-95 cursor-pointer"
            title="Chinmi App - Software para Restaurantes y Bares"
          >
            <ChinmiLogo
              variant="horizontal"
              size="md"
              showSubtitle={true}
              logoUrl="/pug_cocktail_logo.png"
              isPublicBranding={true}
            />
          </button>
          <span className="hidden sm:inline-flex text-[11px] font-bold px-2.5 py-1 rounded-full bg-pink-100/70 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 border border-pink-200/80 dark:border-pink-900/60">
            🇨🇴 Precios en COP$
          </span>
        </div>

        {/* 2. Navegación y Acciones Públicas */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          
          {/* Enlace rápido a Precios */}
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('pricing')}
              className={`hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'pricing'
                  ? 'bg-pink-50 dark:bg-pink-950/50 text-[#681841] dark:text-pink-300 border border-pink-200 dark:border-pink-900/60'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#e64980]" />
              <span>Planes y Precios</span>
            </button>
          )}

          {/* Botón PWA */}
          <PWAInstallButton className="inline-flex" />

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs transition cursor-pointer"
            aria-label="Cambiar tema claro u oscuro"
            title="Cambiar tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />}
          </button>

          {/* Botón Iniciar Sesión / Registro si se proporciona navegación */}
          {onNavigateTab && (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('login')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  activeTab === 'login'
                    ? 'bg-[#681841] text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>Acceder</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('register')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs font-extrabold shadow-sm shadow-pink-500/20 transition cursor-pointer"
              >
                <span>Probar Gratis</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
