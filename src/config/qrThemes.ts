export type QrThemeId = 'default_normal' | 'modern_slate' | 'warm_gastrobar' | 'luxury_dark' | 'fresh_emerald' | 'vibrant_neon';

export interface QrThemeDefinition {
  id: QrThemeId;
  name: string;
  tagline: string;
  previewColors: {
    bg: string;
    card: string;
    accent: string;
    text: string;
  };
  bgClass: string;
  textClass: string;
  headerBg: string;
  headerBorder: string;
  cardBg: string;
  cardBorder: string;
  cardHoverBorder: string;
  accentBg: string;
  accentText: string;
  accentHoverBg: string;
  badgeBg: string;
  badgeText: string;
  priceText: string;
  floatingBarBg: string;
  floatingBarText: string;
  categoryActiveBg: string;
  categoryActiveText: string;
}

export const QR_THEMES: Record<QrThemeId, QrThemeDefinition> = {
  default_normal: {
    id: 'default_normal',
    name: 'Tema Normal (Original Chinmi)',
    tagline: 'El diseño limpio, estándar y oficial de Chinmi App con fondo neutro y acentos vinotinto.',
    previewColors: {
      bg: '#f8fafc',
      card: '#ffffff',
      accent: '#881337',
      text: '#0f172a',
    },
    bgClass: 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100',
    textClass: 'text-slate-900 dark:text-white',
    headerBg: 'bg-white/95 dark:bg-slate-900/95',
    headerBorder: 'border-slate-200 dark:border-slate-800',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-slate-200 dark:border-slate-800',
    cardHoverBorder: 'hover:border-slate-400 dark:hover:border-slate-600',
    accentBg: 'bg-rose-950 hover:bg-rose-900 text-white',
    accentText: 'text-rose-950 dark:text-rose-400',
    accentHoverBg: 'hover:bg-rose-900',
    badgeBg: 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-700',
    badgeText: 'text-rose-950 dark:text-rose-400',
    priceText: 'text-slate-900 dark:text-slate-100',
    floatingBarBg: 'bg-rose-950 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-rose-950 text-white shadow-xs',
    categoryActiveText: 'text-rose-950 dark:text-rose-300'
  },
  modern_slate: {
    id: 'modern_slate',
    name: 'Gastrobar Urbano (Slate & Rose)',
    tagline: 'Estilo clásico elegante con bordes definidos y tonos piedra.',
    previewColors: {
      bg: '#0f172a',
      card: '#1e293b',
      accent: '#881337',
      text: '#f8fafc',
    },
    bgClass: 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100',
    textClass: 'text-slate-900 dark:text-white',
    headerBg: 'bg-white/95 dark:bg-slate-900/95',
    headerBorder: 'border-slate-200 dark:border-slate-800',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-slate-200 dark:border-slate-800',
    cardHoverBorder: 'hover:border-rose-800 dark:hover:border-rose-700',
    accentBg: 'bg-rose-950 hover:bg-rose-900 text-white',
    accentText: 'text-rose-950 dark:text-rose-400',
    accentHoverBg: 'hover:bg-rose-900',
    badgeBg: 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-700',
    badgeText: 'text-rose-950 dark:text-rose-400',
    priceText: 'text-slate-900 dark:text-slate-100',
    floatingBarBg: 'bg-rose-950 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-rose-950 text-white shadow-xs',
    categoryActiveText: 'text-rose-950 dark:text-rose-300'
  },
  warm_gastrobar: {
    id: 'warm_gastrobar',
    name: 'Cálido & Madera (Warm Espresso)',
    tagline: 'Tonos café artesanal, ámbar y madera cálida para bistro y cafés.',
    previewColors: {
      bg: '#1c1917',
      card: '#292524',
      accent: '#d97706',
      text: '#fafaf9',
    },
    bgClass: 'bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100',
    textClass: 'text-stone-900 dark:text-stone-50',
    headerBg: 'bg-amber-50/95 dark:bg-stone-900/95',
    headerBorder: 'border-amber-200 dark:border-stone-800',
    cardBg: 'bg-white dark:bg-stone-900',
    cardBorder: 'border-amber-200/80 dark:border-stone-800',
    cardHoverBorder: 'hover:border-amber-600 dark:hover:border-amber-500',
    accentBg: 'bg-amber-700 hover:bg-amber-800 text-white',
    accentText: 'text-amber-800 dark:text-amber-400',
    accentHoverBg: 'hover:bg-amber-800',
    badgeBg: 'bg-amber-100 dark:bg-stone-800 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-stone-700',
    badgeText: 'text-amber-800 dark:text-amber-300',
    priceText: 'text-amber-900 dark:text-amber-300',
    floatingBarBg: 'bg-amber-800 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-amber-800 text-white shadow-xs',
    categoryActiveText: 'text-amber-800 dark:text-amber-300'
  },
  luxury_dark: {
    id: 'luxury_dark',
    name: 'Lux & Noche (Black Velvet & Gold)',
    tagline: 'Fondo negro profundo con destellos dorados premium para restobar VIP.',
    previewColors: {
      bg: '#09090b',
      card: '#18181b',
      accent: '#eab308',
      text: '#f4f4f5',
    },
    bgClass: 'bg-zinc-950 text-zinc-100 dark:bg-zinc-950 dark:text-zinc-100',
    textClass: 'text-zinc-100',
    headerBg: 'bg-zinc-900/95',
    headerBorder: 'border-amber-500/30',
    cardBg: 'bg-zinc-900',
    cardBorder: 'border-zinc-800',
    cardHoverBorder: 'hover:border-amber-500',
    accentBg: 'bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black',
    accentText: 'text-amber-400',
    accentHoverBg: 'hover:bg-amber-600',
    badgeBg: 'bg-zinc-800 text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-400',
    priceText: 'text-amber-400',
    floatingBarBg: 'bg-zinc-900 border border-amber-500/40 text-amber-300',
    floatingBarText: 'text-amber-300',
    categoryActiveBg: 'bg-amber-500 text-zinc-950 font-bold shadow-xs',
    categoryActiveText: 'text-amber-400'
  },
  fresh_emerald: {
    id: 'fresh_emerald',
    name: 'Verde Fresco (Fresh Botanical)',
    tagline: 'Tonos esmeralda y menta para comida saludable, poke, ensaladas y terrazas.',
    previewColors: {
      bg: '#064e3b',
      card: '#065f46',
      accent: '#10b981',
      text: '#ecfdf5',
    },
    bgClass: 'bg-emerald-50/50 dark:bg-zinc-950 text-slate-900 dark:text-emerald-100',
    textClass: 'text-slate-900 dark:text-emerald-50',
    headerBg: 'bg-white/95 dark:bg-emerald-950/95',
    headerBorder: 'border-emerald-200 dark:border-emerald-900',
    cardBg: 'bg-white dark:bg-emerald-950/60',
    cardBorder: 'border-emerald-200 dark:border-emerald-900',
    cardHoverBorder: 'hover:border-emerald-600 dark:hover:border-emerald-500',
    accentBg: 'bg-emerald-700 hover:bg-emerald-800 text-white',
    accentText: 'text-emerald-700 dark:text-emerald-400',
    accentHoverBg: 'hover:bg-emerald-800',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    priceText: 'text-emerald-800 dark:text-emerald-300',
    floatingBarBg: 'bg-emerald-800 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-emerald-700 text-white shadow-xs',
    categoryActiveText: 'text-emerald-700 dark:text-emerald-400'
  },
  vibrant_neon: {
    id: 'vibrant_neon',
    name: 'Sunset Neon & Cócteles (Nightlife)',
    tagline: 'Púrpura y violeta vibrante para discotecas, bares de cócteles y gastro-lounges.',
    previewColors: {
      bg: '#2e1065',
      card: '#3b0764',
      accent: '#d946ef',
      text: '#fae8ff',
    },
    bgClass: 'bg-purple-950 text-purple-100 dark:bg-slate-950 dark:text-purple-100',
    textClass: 'text-purple-100',
    headerBg: 'bg-purple-900/90 dark:bg-slate-900/90',
    headerBorder: 'border-fuchsia-500/30',
    cardBg: 'bg-purple-900/50 dark:bg-slate-900',
    cardBorder: 'border-purple-800 dark:border-purple-900 hover:border-fuchsia-500',
    cardHoverBorder: 'hover:border-fuchsia-400',
    accentBg: 'bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-bold',
    accentText: 'text-fuchsia-400',
    accentHoverBg: 'hover:bg-fuchsia-500',
    badgeBg: 'bg-purple-800/80 text-fuchsia-200 border-fuchsia-500/30',
    badgeText: 'text-fuchsia-300',
    priceText: 'text-fuchsia-300',
    floatingBarBg: 'bg-gradient-to-r from-purple-900 via-fuchsia-900 to-pink-900 border border-fuchsia-500/40 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-fuchsia-600 text-white shadow-xs font-bold',
    categoryActiveText: 'text-fuchsia-400'
  }
};
