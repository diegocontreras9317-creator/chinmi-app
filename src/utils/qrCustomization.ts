import React from 'react';

/**
 * Convierte un color HEX (#RRGGBB) y un porcentaje de opacidad (0..100) en una cadena rgba().
 */
export function hexToRgba(
  hex: string | undefined,
  opacity: number | undefined,
  defaultHex = '#ffffff',
  defaultOpacity = 100
): string {
  let cleanHex = hex && typeof hex === 'string' && hex.startsWith('#') ? hex : defaultHex;
  if (!cleanHex || !cleanHex.startsWith('#')) cleanHex = '#ffffff';
  
  const rawOpacity = opacity !== undefined && opacity !== null && !isNaN(opacity) ? opacity : defaultOpacity;
  const alpha = Math.max(0, Math.min(100, rawOpacity)) / 100;
  
  const pureHex = cleanHex.replace('#', '');
  const r = parseInt(pureHex.substring(0, 2) || 'ff', 16);
  const g = parseInt(pureHex.substring(2, 4) || 'ff', 16);
  const b = parseInt(pureHex.substring(4, 6) || 'ff', 16);
  
  return `rgba(${isNaN(r) ? 255 : r}, ${isNaN(g) ? 255 : g}, ${isNaN(b) ? 255 : b}, ${alpha})`;
}

/**
 * Calcula de manera automática un color de texto con alto contraste en función de los colores de fondo y superposición.
 */
export function getAutoContrastTextColor(
  bgColor?: string,
  bgOpacity = 100,
  overlayColor?: string,
  overlayOpacity = 0,
  isDarkTheme = false
): string {
  // Si hay una superposición con opacidad considerable (> 35%), usaremos el color de la superposición
  if (overlayOpacity >= 35 && overlayColor && overlayColor.startsWith('#')) {
    const pure = overlayColor.replace('#', '');
    const r = parseInt(pure.substring(0, 2) || '00', 16);
    const g = parseInt(pure.substring(2, 4) || '00', 16);
    const b = parseInt(pure.substring(4, 6) || '00', 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#0f172a' : '#ffffff';
  }

  // Si el fondo es opaco y tiene color HEX
  if (bgColor && bgColor.startsWith('#') && bgOpacity > 20) {
    const pure = bgColor.replace('#', '');
    const r = parseInt(pure.substring(0, 2) || 'ff', 16);
    const g = parseInt(pure.substring(2, 4) || 'ff', 16);
    const b = parseInt(pure.substring(4, 6) || 'ff', 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#0f172a' : '#ffffff';
  }

  // Por defecto según el tema
  return isDarkTheme ? '#f8fafc' : '#0f172a';
}

export interface ContainerStyleConfig {
  bgColor?: string;
  bgOpacity?: number;
  bgImageUrl?: string;
  bgFit?: 'cover' | 'contain' | 'center';
  overlayColor?: string;
  overlayOpacity?: number;
  textColor?: string;
  autoContrast?: boolean;
}

export interface ComputedCustomStyles {
  containerStyle: React.CSSProperties;
  overlayStyle: React.CSSProperties | null;
  computedTextColor: string;
  hasCustomStyle: boolean;
}

/**
 * Genera de forma limpia y determinista las propiedades de estilo y superposición para contenedores o tarjetas.
 */
export function computeCustomContainerStyle(
  config: ContainerStyleConfig,
  isDarkTheme = false
): ComputedCustomStyles {
  const {
    bgColor,
    bgOpacity = 100,
    bgImageUrl,
    bgFit = 'cover',
    overlayColor = '#000000',
    overlayOpacity = 0,
    textColor,
    autoContrast = true
  } = config;

  const hasImage = Boolean(bgImageUrl && bgImageUrl.trim() !== '');
  const hasCustomStyle = Boolean(
    (bgColor && bgColor !== '#ffffff' && bgColor !== '#0f172a') ||
    (bgOpacity !== undefined && bgOpacity < 100) ||
    hasImage ||
    (overlayOpacity !== undefined && overlayOpacity > 0) ||
    (textColor && textColor.trim() !== '')
  );

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden'
  };

  if (hasImage) {
    containerStyle.backgroundImage = `url("${bgImageUrl}")`;
    containerStyle.backgroundPosition = 'center';
    containerStyle.backgroundRepeat = 'no-repeat';
    if (bgFit === 'cover') {
      containerStyle.backgroundSize = 'cover';
    } else if (bgFit === 'contain') {
      containerStyle.backgroundSize = 'contain';
    } else if (bgFit === 'center') {
      containerStyle.backgroundSize = 'auto';
    }
  }

  if (bgColor) {
    containerStyle.backgroundColor = hexToRgba(bgColor, bgOpacity, '#ffffff', 100);
  }

  let overlayStyle: React.CSSProperties | null = null;
  if (overlayOpacity && overlayOpacity > 0 && overlayColor) {
    overlayStyle = {
      position: 'absolute',
      inset: 0,
      backgroundColor: hexToRgba(overlayColor, overlayOpacity, '#000000', 0),
      pointerEvents: 'none',
      zIndex: 0
    };
  }

  let computedTextColor = '';
  if (textColor && textColor.trim() !== '') {
    computedTextColor = textColor;
  } else if (autoContrast) {
    computedTextColor = getAutoContrastTextColor(bgColor, bgOpacity, overlayColor, overlayOpacity, isDarkTheme);
  }

  if (computedTextColor) {
    containerStyle.color = computedTextColor;
  }

  return {
    containerStyle,
    overlayStyle,
    computedTextColor,
    hasCustomStyle
  };
}
