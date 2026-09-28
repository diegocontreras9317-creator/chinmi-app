import React, { useState } from 'react';

interface ChinmiLogoProps {
  variant?: 'horizontal' | 'icon' | 'stacked';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showSubtitle?: boolean;
  className?: string;
  lightText?: boolean;
  logoUrl?: string;
}

export const ChinmiLogo: React.FC<ChinmiLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  showSubtitle = true,
  className = '',
  lightText = false,
  logoUrl
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  // Default to our official pug mascot cocktail logo
  const effectiveLogoUrl = logoUrl || '/pug_cocktail_logo.png';

  // Dimensions according to size - generously sized, clear and impactful
  const iconDimensions = {
    sm: 'w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11',
    md: 'w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 lg:w-14 lg:h-14',
    lg: 'w-20 h-20 sm:w-24 sm:h-24',
    xl: 'w-28 h-28 sm:w-36 sm:h-36',
    hero: 'w-40 h-40 sm:w-52 sm:h-52 md:w-60 md:h-60'
  }[size];

  const titleSizes = {
    sm: 'text-xs sm:text-sm md:text-base font-black tracking-tight',
    md: 'text-sm sm:text-base md:text-lg lg:text-2xl font-black tracking-tight',
    lg: 'text-2xl sm:text-3xl font-black tracking-tight',
    xl: 'text-3xl sm:text-4xl font-black tracking-tight',
    hero: 'text-4xl sm:text-5xl md:text-6xl font-black tracking-tight'
  }[size];

  const subtitleSizes = {
    sm: 'text-[7px] sm:text-[8px] md:text-[9px] font-bold tracking-widest',
    md: 'text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-bold tracking-widest',
    lg: 'text-xs sm:text-sm font-bold tracking-widest',
    xl: 'text-sm sm:text-base font-bold tracking-widest',
    hero: 'text-base sm:text-lg font-extrabold tracking-widest'
  }[size];

  const renderEmblem = () => (
    <div className={`relative shrink-0 flex items-center justify-center rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-md shadow-pink-900/15 border-2 border-[#e64980] dark:border-pink-500 ring-2 ring-pink-200/70 dark:ring-pink-950/60 transition-transform duration-200 p-0.5 ${iconDimensions}`}>
      {!imgFailed && effectiveLogoUrl ? (
        <img
          src={effectiveLogoUrl}
          alt="Logo GastroBar"
          className="w-full h-full object-cover rounded-xl select-none"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full drop-shadow-xs"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Cocktail Liquid Gradient */}
            <linearGradient id="cocktailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f06595" />
              <stop offset="50%" stopColor="#e64980" />
              <stop offset="100%" stopColor="#d6336c" />
            </linearGradient>

            {/* Deep Wine Burgundy Gradient */}
            <linearGradient id="wineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7a1c49" />
              <stop offset="100%" stopColor="#4f1131" />
            </linearGradient>

            {/* Double Circle Frame Stroke */}
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4b5059" />
              <stop offset="100%" stopColor="#2c2f35" />
            </linearGradient>
          </defs>

          {/* Double Outer Rings */}
          <circle cx="200" cy="200" r="172" stroke="url(#ringGrad)" strokeWidth="8" />
          <circle cx="200" cy="200" r="154" stroke="url(#ringGrad)" strokeWidth="5" opacity="0.85" />

          {/* Atomic / Intelligence Nodes Base */}
          <g transform="translate(200, 275)">
            <ellipse cx="0" cy="0" rx="58" ry="24" stroke="#681841" strokeWidth="4.5" transform="rotate(-22)" />
            <ellipse cx="0" cy="0" rx="58" ry="24" stroke="#681841" strokeWidth="4.5" transform="rotate(25)" />
            
            <circle cx="-50" cy="-18" r="8" fill="#681841" />
            <circle cx="50" cy="18" r="8" fill="#681841" />
            <circle cx="-47" cy="22" r="8" fill="#681841" />
            <circle cx="47" cy="-22" r="8" fill="#681841" />

            {/* Core Central Node */}
            <circle cx="0" cy="0" r="15" fill="url(#wineGrad)" stroke="#ffffff" strokeWidth="2" />
          </g>

          {/* Glass Stem */}
          <path d="M 195, 175 L 195, 265 C 195, 268 205, 268 205, 265 L 205, 175 Z" fill="url(#wineGrad)" />

          {/* Martini Triangle Outline */}
          <path
            d="M 125, 110 L 275, 110 L 205, 185 C 202, 188 198, 188 195, 185 Z"
            stroke="#681841"
            strokeWidth="7"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Cocktail Pink Drink Liquid */}
          <path d="M 143, 124 Q 200, 140 257, 124 L 200, 182 Z" fill="url(#cocktailGrad)" />

          {/* Spiral Peel Twist Garnish */}
          <path
            d="M 262, 110 C 266, 96 280, 94 286, 102 C 291, 110 274, 118 266, 114"
            stroke="#681841"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center ${className}`}>{renderEmblem()}</div>;
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center gap-2 ${className}`}>
        {renderEmblem()}
        <div>
          <div
            className={`font-sans tracking-normal uppercase ${titleSizes} ${
              lightText ? 'text-white' : 'text-slate-800 dark:text-white'
            }`}
          >
            CHINMI <span className="text-[#e64980]">APP</span>
          </div>
          {showSubtitle && (
            <p
              className={`uppercase mt-0.5 font-medium ${subtitleSizes} ${
                lightText ? 'text-pink-200/80' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              GESTIÓN INTELIGENTE PARA RESTAURANTES Y BARES
            </p>
          )}
        </div>
      </div>
    );
  }

  // Default: Horizontal
  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 md:gap-3 shrink min-w-0 ${className}`}>
      {renderEmblem()}
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-1 sm:gap-1.5 leading-none">
          <span
            className={`uppercase tracking-tight font-extrabold truncate ${titleSizes} ${
              lightText ? 'text-white' : 'text-slate-900 dark:text-white'
            }`}
          >
            CHINMI
          </span>
          <span className={`uppercase font-extrabold text-[#e64980] shrink-0 ${titleSizes}`}>
            APP
          </span>
        </div>
        {showSubtitle && (
          <p
            className={`uppercase mt-0.5 sm:mt-1 font-semibold tracking-wider truncate ${subtitleSizes} ${
              lightText ? 'text-pink-200/80' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="hidden xl:inline">GESTIÓN INTELIGENTE PARA RESTAURANTES Y BARES</span>
            <span className="hidden sm:inline xl:hidden">SISTEMA GASTROBAR</span>
            <span className="sm:hidden">GASTROBAR</span>
          </p>
        )}
      </div>
    </div>
  );
};
