import React from 'react';
import { ChinmiLogo } from '../common/ChinmiLogo';

export type PublicSectionTarget =
  | 'plataforma'
  | 'como-funciona'
  | 'roles'
  | 'planes'
  | 'login'
  | 'register';

interface PublicNavbarProps {
  onNavigate?: (target: PublicSectionTarget) => void;
}

/**
 * PublicNavbar
 * Barra de navegación superior corporativa para rutas públicas de Chinmi App.
 * Sigue estrictamente el contrato de 3 zonas: Marca estática · Enlaces limpios · Acción principal.
 */
export const PublicNavbar: React.FC<PublicNavbarProps> = ({ onNavigate }) => {
  const handleScrollTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zona 1: Marca Oficial Estática de Chinmi App */}
        <button
          type="button"
          onClick={handleScrollTop}
          className="flex items-center text-left cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-900 rounded-md"
          title="Chinmi App — Sistema POS para Restaurantes y Bares"
        >
          <ChinmiLogo
            variant="horizontal"
            size="sm"
            showSubtitle={false}
            logoUrl="/pug_cocktail_logo.png"
            isPublicBranding={true}
          />
        </button>

        {/* Zona 2: Enlaces de navegación tipográficos en una sola línea */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <button
            type="button"
            onClick={() => onNavigate?.('plataforma')}
            className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Módulos
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('como-funciona')}
            className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cómo Funciona
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('roles')}
            className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Roles
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('planes')}
            className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Planes
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('login')}
            className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Iniciar Sesión
          </button>
        </nav>

        {/* Zona 3: Acción primaria única (con acceso rápido en móvil) */}
        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate?.('login')}
            className="md:hidden text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Acceder
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('register')}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-900 hover:bg-rose-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-900"
          >
            Adquirir Sistema
          </button>
        </div>
      </div>
    </header>
  );
};

export default PublicNavbar;
