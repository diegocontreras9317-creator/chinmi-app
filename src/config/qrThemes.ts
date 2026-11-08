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
    bgClass: 'bg-slate-50 text-slate-900',
    textClass: 'text-slate-900',
    headerBg: 'bg-white/95 text-slate-900',
    headerBorder: 'border-slate-200',
    cardBg: 'bg-white text-slate-900',
    cardBorder: 'border-slate-200',
    cardHoverBorder: 'hover:border-slate-400',
    accentBg: 'bg-rose-950 hover:bg-rose-900 text-white',
    accentText: 'text-rose-950',
    accentHoverBg: 'hover:bg-rose-900',
    badgeBg: 'bg-stone-100 text-stone-900 border-stone-200',
    badgeText: 'text-rose-950',
    priceText: 'text-slate-900',
    floatingBarBg: 'bg-rose-950 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-rose-950 text-white shadow-xs',
    categoryActiveText: 'text-rose-950'
  },
  modern_slate: {
    id: 'modern_slate',
    name: 'Gastrobar Urbano (Slate & Rose)',
    tagline: 'Estilo nocturno pizarra oscuro con bordes definidos y acentos carmesí.',
    previewColors: {
      bg: '#0f172a',
      card: '#1e293b',
      accent: '#e11d48',
      text: '#f8fafc',
    },
    bgClass: 'bg-slate-900 text-slate-100',
    textClass: 'text-slate-100',
    headerBg: 'bg-slate-900/95 text-slate-100',
    headerBorder: 'border-slate-800',
    cardBg: 'bg-slate-800 text-slate-100',
    cardBorder: 'border-slate-700',
    cardHoverBorder: 'hover:border-rose-500',
    accentBg: 'bg-rose-600 hover:bg-rose-500 text-white font-bold',
    accentText: 'text-rose-400',
    accentHoverBg: 'hover:bg-rose-500',
    badgeBg: 'bg-slate-700 text-rose-300 border-slate-600',
    badgeText: 'text-rose-300',
    priceText: 'text-rose-400',
    floatingBarBg: 'bg-rose-700 text-white shadow-rose-900/30',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-rose-600 text-white shadow-xs font-bold',
    categoryActiveText: 'text-rose-300'
  },
  warm_gastrobar: {
    id: 'warm_gastrobar',
    name: 'Cálido & Madera (Warm Espresso)',
    tagline: 'Tonos café artesanal, crema y madera cálida para bistro y cafés.',
    previewColors: {
      bg: '#fdf8f0',
      card: '#ffffff',
      accent: '#b45309',
      text: '#292524',
    },
    bgClass: 'bg-[#fdf8f0] text-stone-900',
    textClass: 'text-stone-900',
    headerBg: 'bg-[#fffdfa]/95 text-stone-900',
    headerBorder: 'border-amber-200',
    cardBg: 'bg-white text-stone-900',
    cardBorder: 'border-amber-200/90',
    cardHoverBorder: 'hover:border-amber-500',
    accentBg: 'bg-amber-700 hover:bg-amber-800 text-white font-bold',
    accentText: 'text-amber-800',
    accentHoverBg: 'hover:bg-amber-800',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeText: 'text-amber-800',
    priceText: 'text-amber-900',
    floatingBarBg: 'bg-amber-800 text-white shadow-amber-900/30',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-amber-700 text-white shadow-xs font-bold',
    categoryActiveText: 'text-amber-800'
  },
  luxury_dark: {
    id: 'luxury_dark',
    name: 'Lux & Noche (Black Velvet & Gold)',
    tagline: 'Fondo negro profundo con destellos dorados premium para restobar VIP.',
    previewColors: {
      bg: '#09090b',
      card: '#18181b',
      accent: '#facc15',
      text: '#f4f4f5',
    },
    bgClass: 'bg-zinc-950 text-zinc-100',
    textClass: 'text-zinc-100',
    headerBg: 'bg-zinc-950/95 text-zinc-100',
    headerBorder: 'border-amber-500/30',
    cardBg: 'bg-zinc-900 text-zinc-100',
    cardBorder: 'border-zinc-800',
    cardHoverBorder: 'hover:border-amber-400',
    accentBg: 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black',
    accentText: 'text-amber-400',
    accentHoverBg: 'hover:bg-amber-300',
    badgeBg: 'bg-zinc-800 text-amber-300 border-amber-500/40',
    badgeText: 'text-amber-400',
    priceText: 'text-amber-300',
    floatingBarBg: 'bg-zinc-900 border border-amber-500/50 text-amber-300 shadow-amber-950/50',
    floatingBarText: 'text-amber-300',
    categoryActiveBg: 'bg-amber-400 text-zinc-950 font-black shadow-xs',
    categoryActiveText: 'text-amber-400'
  },
  fresh_emerald: {
    id: 'fresh_emerald',
    name: 'Verde Fresco (Fresh Botanical)',
    tagline: 'Tonos esmeralda y menta para comida saludable, poke, ensaladas y terrazas.',
    previewColors: {
      bg: '#f0fdf4',
      card: '#ffffff',
      accent: '#047857',
      text: '#064e3b',
    },
    bgClass: 'bg-[#f0fdf4] text-emerald-950',
    textClass: 'text-emerald-950',
    headerBg: 'bg-white/95 text-emerald-950',
    headerBorder: 'border-emerald-200',
    cardBg: 'bg-white text-emerald-950',
    cardBorder: 'border-emerald-200',
    cardHoverBorder: 'hover:border-emerald-500',
    accentBg: 'bg-emerald-700 hover:bg-emerald-800 text-white font-bold',
    accentText: 'text-emerald-700',
    accentHoverBg: 'hover:bg-emerald-800',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    badgeText: 'text-emerald-800',
    priceText: 'text-emerald-900',
    floatingBarBg: 'bg-emerald-800 text-white shadow-emerald-900/30',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-emerald-700 text-white shadow-xs font-bold',
    categoryActiveText: 'text-emerald-700'
  },
  vibrant_neon: {
    id: 'vibrant_neon',
    name: 'Sunset Neon & Cócteles (Nightlife)',
    tagline: 'Púrpura y violeta vibrante para discotecas, bares de cócteles y gastro-lounges.',
    previewColors: {
      bg: '#180a29',
      card: '#291242',
      accent: '#d946ef',
      text: '#fae8ff',
    },
    bgClass: 'bg-[#180a29] text-purple-100',
    textClass: 'text-purple-100',
    headerBg: 'bg-[#180a29]/95 text-purple-100',
    headerBorder: 'border-fuchsia-500/30',
    cardBg: 'bg-[#291242] text-purple-100',
    cardBorder: 'border-purple-800/80',
    cardHoverBorder: 'hover:border-fuchsia-400',
    accentBg: 'bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 text-white font-extrabold',
    accentText: 'text-fuchsia-400',
    accentHoverBg: 'hover:bg-fuchsia-500',
    badgeBg: 'bg-purple-900/90 text-fuchsia-200 border-fuchsia-500/40',
    badgeText: 'text-fuchsia-300',
    priceText: 'text-pink-400',
    floatingBarBg: 'bg-gradient-to-r from-purple-900 via-fuchsia-900 to-pink-900 border border-fuchsia-500/50 text-white',
    floatingBarText: 'text-white',
    categoryActiveBg: 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-xs font-black',
    categoryActiveText: 'text-fuchsia-400'
  }
};
