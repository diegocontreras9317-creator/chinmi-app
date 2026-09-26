/**
 * Utilidades para formateo de moneda y precios en Pesos Colombianos (COP).
 */

export function formatCOP(amount: number, withSuffix = true): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return withSuffix ? '$ 0 COP' : '$ 0';
  }
  
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(rounded);

  return withSuffix ? `$ ${formatted} COP` : `$ ${formatted}`;
}

export function formatNumberCOP(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '0';
  }
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(Math.round(amount));
}
