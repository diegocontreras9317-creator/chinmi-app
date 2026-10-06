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
 * 
 * REGLAS DE DISEÑO RESPONSIVO (MOBILE-FIRST):
 * 1. Textos colapsados en móviles para evitar cualquier desbordamiento horizontal.
 * 2. Flexbox fluido con `flex justify-between items-center w-full`.
 * 3. Contenedor de acciones derecho con `flex items-center gap-2 md:gap-4`.
 */
export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  activeTab,
  onNavigateTab
}) => {
  const { theme, toggleTheme } = useApp();

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors shadow-xs">
      {/* 2. Contenedor principal con flex justify-between items-center w-full */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex justify-between items-center w-full">
        
        {/* 1. Logo Oficial Estático del SaaS Chinmi App (w-auto y shrink-0) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab?.('demo')}
            className="flex items-center text-left transition-transform active:scale-95 cursor-pointer"
            title="Chinmi App - Software para Restaurantes y Bares"
          >
            <ChinmiLogo
              variant="horizontal"
              size="sm"
              showSubtitle={false}
              logoUrl="/pug_cocktail_logo.png"
              isPublicBranding={true}
            />
          </button>
          <span className="hidden lg:inline-flex text-[11px] font-bold px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-900 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-800 shrink-0">
            🇨🇴 Precios en COP$
          </span>
        </div>

        {/* 2. Contenedor del lado derecho: permite desplazamiento horizontal (scroll) de izquierda a derecha en mobile/tablet */}
        <div className="flex items-center gap-2 md:gap-4 overflow-x-auto max-w-full whitespace-nowrap scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden shrink-0">
          
          {/* Enlace a Planes y Precios (visible en pantallas medianas y grandes) */}
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('pricing')}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                activeTab === 'pricing'
                  ? 'bg-rose-950 text-white border border-rose-900'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-300" />
              <span>Planes y Precios</span>
            </button>
          )}

          {/* Theme Toggle (Modo noche / día) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 md:p-2.5 rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-xs transition cursor-pointer shrink-0"
            aria-label="Cambiar tema claro u oscuro"
            title="Cambiar tema"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-stone-600" />
            )}
          </button>

          {/* Botón Iniciar Sesión / Registro */}
          {onNavigateTab && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* Botón Acceder: ícono representativo visible en móviles, texto colapsado con hidden md:inline */}
              <button
                type="button"
                onClick={() => onNavigateTab('login')}
                title="Acceder / Iniciar Sesión"
                className={`flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                  activeTab === 'login'
                    ? 'bg-rose-900 text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800'
                }`}
              >
                <User className="w-4 h-4 text-rose-800 dark:text-rose-300 shrink-0" />
                <span className="hidden md:inline">Acceder</span>
              </button>

              {/* Botón Probar Gratis (Oculto en móviles muy pequeños para máxima limpieza, visible en sm+) */}
              <button
                type="button"
                onClick={() => onNavigateTab('register')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
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

export default PublicNavbar;
