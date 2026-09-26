import { PerishableItem, PerishableCategory, ExpiryStatus } from '../types';

/**
 * Calcula los días restantes para la fecha de caducidad.
 * Retorna número entero de días (positivo: futuro, 0: hoy, negativo: vencido).
 */
export function calculateDaysRemaining(expiryDateStr: string): number {
  if (!expiryDateStr) return 999;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse YYYY-MM-DD safely
  const parts = expiryDateStr.split('-');
  if (parts.length !== 3) return 999;

  const expiry = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Obtiene el estado de caducidad del alimento
 */
export function getExpiryStatus(expiryDateStr: string, alarmDaysBeforeExpiry = 3): ExpiryStatus {
  const days = calculateDaysRemaining(expiryDateStr);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires_today';
  if (days <= alarmDaysBeforeExpiry) return 'expiring_soon';
  return 'fresh';
}

/**
 * Metadatos para visualización de badges y alarmas
 */
export function getExpiryBadgeConfig(status: ExpiryStatus, daysRemaining: number) {
  switch (status) {
    case 'expired':
      return {
        label: `Caducado (${Math.abs(daysRemaining)} d atrás)`,
        shortLabel: 'Caducado',
        severity: 'critical' as const,
        bgClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900',
        badgeColor: 'bg-rose-600 text-white',
        pulse: true,
        emoji: '🚨'
      };
    case 'expires_today':
      return {
        label: '¡Vence Hoy!',
        shortLabel: 'Vence Hoy',
        severity: 'critical' as const,
        bgClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-800',
        badgeColor: 'bg-orange-600 text-white',
        pulse: true,
        emoji: '⚠️'
      };
    case 'expiring_soon':
      return {
        label: `Vence en ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`,
        shortLabel: `${daysRemaining}d restantes`,
        severity: 'warning' as const,
        bgClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800',
        badgeColor: 'bg-amber-500 text-slate-950 font-bold',
        pulse: false,
        emoji: '⏳'
      };
    case 'fresh':
    default:
      return {
        label: `Óptimo (${daysRemaining} días)`,
        shortLabel: 'Fresco',
        severity: 'normal' as const,
        bgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
        badgeColor: 'bg-emerald-600 text-white',
        pulse: false,
        emoji: '🌿'
      };
  }
}

export const PERISHABLE_CATEGORIES: PerishableCategory[] = [
  'Verduras & Hortalizas',
  'Frutas & Cítricos',
  'Insumos de Bar & Coctelería',
  'Hierbas & Aromáticas',
  'Lácteos & Quesos',
  'Carnes, Pollo & Pescados',
  'Salsas & Preparaciones',
  'Otros Insumos'
];

export const MEASUREMENT_UNITS = [
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'g', label: 'Gramos (g)' },
  { value: 'litros', label: 'Litros (L)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidades', label: 'Unidades (uds)' },
  { value: 'atados', label: 'Atados / Manojos' },
  { value: 'cajas', label: 'Cajas' },
  { value: 'paquetes', label: 'Paquetes' }
];

export const STORAGE_LOCATIONS = [
  'Barra Principal - Nevera Cócteles',
  'Barra - Estación de Mojitos',
  'Cuarto Frío Cocina (2°C - 4°C)',
  'Nevera 1 - Cocina Caliente',
  'Nevera 2 - Ensaladas & Cocina Fría',
  'Congelador Carnes (-18°C)',
  'Despensa Seca & Frutas',
  'Cava de Vinos & Licores',
  'Bodega General'
];
