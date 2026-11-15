import {
  PerishableItem,
  PerishableCategory,
  ExpiryStatus,
  PackagingType,
  InsumoPresentation
} from '../types';
import { formatQuantity } from './quantityPrecision';

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

export const BASE_MEASUREMENT_UNITS = [
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'libra', label: 'Libras (lb - 500 g)' },
  { value: 'g', label: 'Gramos (g)' },
  { value: 'litros', label: 'Litros (L)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidades', label: 'Unidades (uds)' }
];

export const MEASUREMENT_UNITS = [
  ...BASE_MEASUREMENT_UNITS,
  { value: 'atados', label: 'Atados / Manojos (legacy)' },
  { value: 'cajas', label: 'Cajas (legacy)' },
  { value: 'paquetes', label: 'Paquetes (legacy)' }
];

export const PACKAGING_TYPES: Array<{
  value: PackagingType;
  label: string;
  pluralLabel: string;
}> = [
  { value: 'paquete', label: 'Paquete', pluralLabel: 'paquetes' },
  { value: 'caja', label: 'Caja', pluralLabel: 'cajas' },
  { value: 'bolsa', label: 'Bolsa', pluralLabel: 'bolsas' },
  { value: 'bloque', label: 'Bloque', pluralLabel: 'bloques' },
  { value: 'bandeja', label: 'Bandeja', pluralLabel: 'bandejas' },
  { value: 'atado', label: 'Atado / Manojo', pluralLabel: 'atados' },
  { value: 'canasta', label: 'Canasta', pluralLabel: 'canastas' },
  { value: 'botella', label: 'Botella', pluralLabel: 'botellas' },
  { value: 'galon', label: 'Galón', pluralLabel: 'galones' },
  { value: 'saco', label: 'Saco', pluralLabel: 'sacos' },
  { value: 'bulto', label: 'Bulto', pluralLabel: 'bultos' },
  { value: 'unidad', label: 'Unidad', pluralLabel: 'unidades' },
  { value: 'personalizada', label: 'Presentación personalizada', pluralLabel: 'presentaciones' }
];

export const AMBIGUOUS_PACKAGING_UNITS = new Set([
  'paquete',
  'paquetes',
  'caja',
  'cajas',
  'bolsa',
  'bolsas',
  'bloque',
  'bloques',
  'bandeja',
  'bandejas',
  'atado',
  'atados',
  'manojo',
  'manojos',
  'canasta',
  'canastas',
  'botella',
  'botellas',
  'galon',
  'galones',
  'saco',
  'sacos',
  'bulto',
  'bultos'
]);

export function getEffectiveBaseUnit(item?: Pick<PerishableItem, 'baseUnit' | 'unit'> | null): string {
  if (!item) return 'unidades';
  return (item.baseUnit || item.unit || 'unidades').trim();
}

export function isAmbiguousLegacyUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return AMBIGUOUS_PACKAGING_UNITS.has(unit.trim().toLowerCase());
}

export function needsLegacyMigrationNotice(item?: PerishableItem | null): boolean {
  if (!item) return false;
  const baseUnit = getEffectiveBaseUnit(item);
  if (!isAmbiguousLegacyUnit(baseUnit)) return false;
  const hasPresentations = Array.isArray(item.presentations) && item.presentations.length > 0;
  const hasEquivalences = Array.isArray(item.equivalences) && item.equivalences.length > 0;
  return !hasPresentations && !hasEquivalences;
}

export function formatPackagingLabel(packagingType?: PackagingType | string, plural = false): string {
  const found = PACKAGING_TYPES.find((p) => p.value === packagingType);
  if (!found) return packagingType || (plural ? 'empaques' : 'empaque');
  return plural ? found.pluralLabel : found.label.toLowerCase();
}

export function formatPresentationSummary(pres: Pick<InsumoPresentation, 'name' | 'packagingType' | 'contentQty' | 'contentUnit' | 'brand'>): string {
  const contentText = `${formatQuantity(pres.contentQty)} ${pres.contentUnit}`;
  const brandSuffix = pres.brand ? ` · ${pres.brand}` : '';
  if (pres.name && pres.name.trim()) {
    return `${pres.name.trim()} (${contentText})${brandSuffix}`;
  }
  return `${formatPackagingLabel(pres.packagingType)} x ${contentText}${brandSuffix}`;
}

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

export function normalizeWhatsappPhone(rawPhone: string): string {
  let digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

/**
 * Formatea el mensaje de pedido para enviar al proveedor por WhatsApp.
 * Incluye presentaciones comerciales claras y NUNCA inventa precios ni expone costos internos.
 */
export function buildSupplierWhatsappMessage(params: {
  supplierName: string;
  localName: string;
  localAddress: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    presentationName?: string;
    packagingType?: PackagingType | string;
    contentQty?: number;
    contentUnit?: string;
  }>;
  notes?: string;
}): string {
  const lines: string[] = [
    `Hola *${params.supplierName}*, te compartimos el pedido de insumos:`,
    '',
    `*Local:* ${params.localName}`,
    `*Dirección de entrega:* ${params.localAddress || 'Por confirmar'}`
  ];

  lines.push('', '*Listado de productos:*');
  if (params.items.length === 0) {
    lines.push('• (Agrega productos al listado)');
  } else {
    params.items.forEach((it) => {
      if (it.contentQty && it.contentUnit) {
        const packLabel = it.packagingType
          ? formatPackagingLabel(it.packagingType, it.quantity !== 1)
          : it.unit;
        const presDetail = it.presentationName
          ? `${it.presentationName} (${formatQuantity(it.contentQty)} ${it.contentUnit})`
          : `x ${formatQuantity(it.contentQty)} ${it.contentUnit}`;
        lines.push(`• ${formatQuantity(it.quantity)} ${packLabel} de ${it.name} [${presDetail}]`);
      } else {
        lines.push(`• ${formatQuantity(it.quantity)} ${it.unit} - ${it.name}`);
      }
    });
  }

  if (params.notes?.trim()) {
    lines.push('', `*Observaciones:* ${params.notes.trim()}`);
  }

  lines.push('', 'Quedamos atentos a confirmación. ¡Gracias!');
  return lines.join('\n');
}
