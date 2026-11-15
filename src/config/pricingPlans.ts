/**
 * Definición central de planes de suscripción en Pesos Colombianos (COP)
 *
 * Estructura configurada:
 * - Plan Gratuito: $0 COP para siempre con limitaciones (hasta 6 mesas y 15 productos).
 * - Plan Mensual: $89.000 COP al mes (sin permanencia, pago mes a mes. Equivale a $1.068.000 COP al año).
 * - Plan Trimestral: 10% de descuento sobre la tarifa base mensual ($240.300 COP cada 3 meses = $80.100 COP/mes, ahorro de $26.700 COP).
 * - Plan Anual de una: 20% de descuento sobre los 12 meses ($854.400 COP al año = $71.200 COP/mes, ahorro de $213.600 COP de una).
 */

export type BillingFrequency = 'monthly' | 'quarterly' | 'annual';

export interface PaidPlanOption {
  id: BillingFrequency;
  name: string;
  badge?: string;
  badgeColor?: string;
  monthlyEquivalent: number;
  billedAmount: number;
  monthsCount: number;
  originalAmount: number;
  discountPercent: number;
  savingsAmount: number;
  savingsText: string;
  billingPeriodText: string;
  frequencyLabel: string;
  description: string;
}

export const BASE_MONTHLY_COP = 89000;
export const BASE_ANNUAL_COP = 1068000; // 89.000 * 12

export const PAID_PLANS: Record<BillingFrequency, PaidPlanOption> = {
  monthly: {
    id: 'monthly',
    name: 'Plan Mensual',
    frequencyLabel: 'Mensual',
    monthlyEquivalent: 89000,
    billedAmount: 89000,
    monthsCount: 1,
    originalAmount: 89000,
    discountPercent: 0,
    savingsAmount: 0,
    savingsText: 'Sin permanencia',
    billingPeriodText: 'al mes',
    description: 'Sin permanencia. Paga mes a mes (equivalente a $ 1.068.000 COP al año).'
  },
  quarterly: {
    id: 'quarterly',
    name: 'Plan Trimestral',
    badge: '10% DESCUENTO',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    frequencyLabel: 'Trimestral',
    monthlyEquivalent: 80100, // (267.000 - 26.700) / 3 = 80.100
    billedAmount: 240300, // 89.000 * 3 = 267.000 * 0.90 = 240.300
    monthsCount: 3,
    originalAmount: 267000,
    discountPercent: 10,
    savingsAmount: 26700, // 10% de ahorro
    savingsText: '10% de ahorro ($ 26.700 COP)',
    billingPeriodText: 'cada 3 meses',
    description: 'Pago cada 3 meses con 10% de descuento. Ahorras $ 26.700 COP frente al mes a mes.'
  },
  annual: {
    id: 'annual',
    name: 'Plan Anual de Una',
    badge: '20% DESCUENTO (MEJOR OPCIÓN)',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    frequencyLabel: 'Anual (De una)',
    monthlyEquivalent: 71200, // (1.068.000 - 213.600) / 12 = 71.200
    billedAmount: 854400, // 1.068.000 * 0.80 = 854.400
    monthsCount: 12,
    originalAmount: 1068000,
    discountPercent: 20,
    savingsAmount: 213600, // 20% de ahorro directo de una
    savingsText: '20% de ahorro de una ($ 213.600 COP)',
    billingPeriodText: 'al año en 1 pago',
    description: 'Pagas el año completo de una vez con 20% de descuento. ¡Ahorras $ 213.600 COP directos!'
  }
};

export const FREE_PLAN_DETAILS = {
  name: 'Plan Gratuito (Con Limitaciones)',
  price: 0,
  billingPeriodText: 'para siempre',
  maxTables: 6,
  maxProducts: 15,
  description: 'Plan básico con limitaciones para locales pequeños (hasta 6 mesas y 15 productos).'
};

export interface PlanDifferenceItem {
  feature: string;
  category: string;
  freeText: string;
  proText: string;
  isDifferent: boolean;
  highlight?: boolean;
}

export const PLAN_DIFFERENCES: PlanDifferenceItem[] = [
  {
    category: 'Capacidad y Aforo',
    feature: 'Límite de Mesas Activas',
    freeText: 'Hasta 6 mesas activas',
    proText: 'Mesas activas sin límite comercial',
    isDifferent: true,
    highlight: true
  },
  {
    category: 'Menú e Inventario',
    feature: 'Catálogo de Productos Activos',
    freeText: 'Hasta 15 productos en carta',
    proText: 'Productos y categorías sin límite comercial',
    isDifferent: true,
    highlight: true
  },
  {
    category: 'Distribución del Local',
    feature: 'Zonas y Ambientes',
    freeText: 'Incluido (hasta 6 mesas activas)',
    proText: 'Incluido con mesas sin límite (Terraza, Salón, Barra, VIP...)',
    isDifferent: false
  },
  {
    category: 'Cocina & Materia Prima',
    feature: 'Despensa de Perecederos e Insumos',
    freeText: 'Incluido (recetas, caducidades y mermas)',
    proText: 'Incluido sin límite de productos asociados',
    isDifferent: false
  },
  {
    category: 'Experiencia del Cliente',
    feature: 'Cartas QR en Mesas y Subcuentas',
    freeText: 'Incluido en tus mesas activas (hasta 6)',
    proText: 'Incluido en todas tus mesas sin límite',
    isDifferent: true
  },
  {
    category: 'Reportes y Administración',
    feature: 'Historial y Exportación de Ventas',
    freeText: 'Incluido (Excel, CSV y formatos contables)',
    proText: 'Incluido sin límite de crecimiento de carta',
    isDifferent: false
  },
  {
    category: 'Operación en Sala',
    feature: 'Sincronización Multi-pantalla',
    freeText: 'Incluido en la nube en tiempo real',
    proText: 'Tiempo real en todas las pantallas y operación ilimitada',
    isDifferent: false
  },
  {
    category: 'Continuidad y Respaldo',
    feature: 'Período de Gracia y Soporte',
    freeText: 'Datos siempre conservados',
    proText: '72 horas de gracia ante vencimiento + soporte prioritario',
    isDifferent: true,
    highlight: true
  }
];
