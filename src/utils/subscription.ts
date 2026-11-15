import { BillingFrequency, FREE_PLAN_DETAILS } from '../config/pricingPlans';
import { Product, SubscriptionStatus, Table, User } from '../types';

export const MASTER_ADMIN_EMAIL = 'diego.contreras9317@gmail.com';
export const FREE_MAX_TABLES = FREE_PLAN_DETAILS.maxTables; // 6
export const FREE_MAX_PRODUCTS = FREE_PLAN_DETAILS.maxProducts; // 15
export const GRACE_PERIOD_HOURS = 72;
export const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;
export const WARNING_MILESTONE_DAYS = [7, 3, 1] as const;

export type SubscriptionWarningMilestone = '7d' | '3d' | '1d' | 'grace' | 'over_limit' | null;

export interface DerivedSubscriptionState {
  status: SubscriptionStatus;
  effectivePlan: 'free' | 'pro';
  hasProAccess: boolean;
  isMasterAdmin: boolean;
  isInGracePeriod: boolean;
  isOverLimit: boolean;
  cancelAtPeriodEnd: boolean;
  planExpiresAtMs: number | null;
  graceEndsAtMs: number | null;
  msUntilExpiry: number | null;
  daysUntilExpiry: number | null;
  msRemainingInGrace: number | null;
  hoursRemainingInGrace: number | null;
  warningMilestone: SubscriptionWarningMilestone;
  totalTablesCount: number;
  activeTablesCount: number;
  inactiveTablesCount: number;
  tablesOverLimitCount: number;
  totalProductsCount: number;
  activeProductsCount: number;
  inactiveProductsCount: number;
  productsOverLimitCount: number;
  needsTableSelection: boolean;
  needsProductSelection: boolean;
  needsOverLimitSelection: boolean;
  canCreateTable: boolean;
  canCreateProduct: boolean;
  degradationEnabled: boolean;
}

export function isSubscriptionDegradationEnabled(override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  try {
    const viteFlag = (import.meta as any)?.env?.VITE_SUBSCRIPTION_DEGRADATION_ENABLED;
    if (viteFlag !== undefined && viteFlag !== '') {
      return String(viteFlag).toLowerCase() !== 'false';
    }
  } catch {
    // ignore in non-vite runtimes
  }
  if (typeof process !== 'undefined' && process.env?.SUBSCRIPTION_DEGRADATION_ENABLED !== undefined) {
    return String(process.env.SUBSCRIPTION_DEGRADATION_ENABLED).toLowerCase() !== 'false';
  }
  return true;
}

export function isMasterAdminEmail(email?: string | null): boolean {
  return String(email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

export function parseTimestampMs(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      const d = raw.toDate();
      const t = d instanceof Date ? d.getTime() : NaN;
      return Number.isFinite(t) ? t : null;
    }
    const sec = raw.seconds ?? raw._seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      return sec * 1000;
    }
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Adds exact calendar months in UTC, clamping end-of-month days cleanly
 * (e.g. Jan 31 + 1 month -> Feb 28 or Feb 29 on leap years).
 */
export function addCalendarMonths(baseDate: Date, months: number): Date {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const hours = baseDate.getUTCHours();
  const minutes = baseDate.getUTCMinutes();
  const seconds = baseDate.getUTCSeconds();
  const ms = baseDate.getUTCMilliseconds();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  return new Date(Date.UTC(targetYear, normalizedMonth, clampedDay, hours, minutes, seconds, ms));
}

export function getMonthsForFrequency(frequency?: BillingFrequency | string | null): number {
  if (frequency === 'annual') return 12;
  if (frequency === 'quarterly') return 3;
  return 1;
}

/**
 * Calculates the next expiration date using real calendar months (1, 3, or 12)
 * or custom promotional days, stacking on top of max(now, currentExpiry) when active/grace.
 */
export function calculateNextBillingExpiry(params: {
  nowMs?: number;
  currentExpiryMs?: number | null;
  frequency?: BillingFrequency | string | null;
  customDays?: number | null;
}): Date {
  const nowMs = typeof params.nowMs === 'number' && Number.isFinite(params.nowMs) ? params.nowMs : Date.now();
  const currentExpiryMs =
    typeof params.currentExpiryMs === 'number' && Number.isFinite(params.currentExpiryMs)
      ? params.currentExpiryMs
      : 0;
  const anchorMs = Math.max(nowMs, currentExpiryMs);
  const anchorDate = new Date(anchorMs);

  if (typeof params.customDays === 'number' && Number.isFinite(params.customDays) && params.customDays > 0) {
    return new Date(anchorMs + Math.round(params.customDays) * 24 * 60 * 60 * 1000);
  }

  const months = getMonthsForFrequency(params.frequency);
  return addCalendarMonths(anchorDate, months);
}

/**
 * Protected table: has an active, unpaid/unclosed order with at least 1 item.
 */
export function isTableProtected(table?: Table | null): boolean {
  if (!table || !table.order) return false;
  const order = table.order as any;
  if (order.closed === true) return false;
  if (
    order.estado === 'pagada' ||
    order.status === 'pagada' ||
    order.estado === 'cobrado' ||
    order.status === 'cobrado' ||
    order.estado === 'cancelada' ||
    order.status === 'cancelada'
  ) {
    return false;
  }
  return Array.isArray(order.items) && order.items.length > 0;
}

export function getProtectedProductIds(tables: Table[] = []): Set<string> {
  const ids = new Set<string>();
  for (const table of tables) {
    if (!isTableProtected(table) || !table.order) continue;
    for (const item of table.order.items || []) {
      if (item.productId) ids.add(item.productId);
    }
  }
  return ids;
}

export function isTableOperationalForNewOrders(
  table: Table,
  subState: Pick<DerivedSubscriptionState, 'hasProAccess' | 'degradationEnabled' | 'status'>
): boolean {
  if (subState.hasProAccess || !subState.degradationEnabled || subState.status === 'free') {
    return true;
  }
  if (isTableProtected(table)) return true;
  return table.active !== false;
}

export function isProductOperationalForNewOrders(
  product: Product,
  subState: Pick<DerivedSubscriptionState, 'hasProAccess' | 'degradationEnabled' | 'status'>,
  protectedProductIds?: Set<string>
): boolean {
  if (subState.hasProAccess || !subState.degradationEnabled || subState.status === 'free') {
    return true;
  }
  if (protectedProductIds?.has(product.id)) return true;
  return product.active !== false;
}

export function getWarningMilestoneForState(params: {
  status: SubscriptionStatus;
  msUntilExpiry: number | null;
}): SubscriptionWarningMilestone {
  if (params.status === 'free_over_limit') return 'over_limit';
  if (params.status === 'pro_grace') return 'grace';
  if (params.status === 'pro_active' && params.msUntilExpiry !== null && params.msUntilExpiry > 0) {
    const daysRemaining = Math.ceil(params.msUntilExpiry / (24 * 60 * 60 * 1000));
    if (daysRemaining <= 1) return '1d';
    if (daysRemaining <= 3) return '3d';
    if (daysRemaining <= 7) return '7d';
  }
  return null;
}

export function deriveSubscriptionState(params: {
  user?: Partial<User> | null;
  serverNowMs?: number | null;
  tables?: Table[];
  products?: Product[];
  degradationEnabled?: boolean;
}): DerivedSubscriptionState {
  const user = params.user;
  const nowMs =
    typeof params.serverNowMs === 'number' && Number.isFinite(params.serverNowMs)
      ? params.serverNowMs
      : Date.now();
  const tables = Array.isArray(params.tables) ? params.tables : [];
  const products = Array.isArray(params.products) ? params.products : [];
  const degradationEnabled = isSubscriptionDegradationEnabled(params.degradationEnabled);
  const isMasterAdmin = isMasterAdminEmail(user?.email);

  const totalTablesCount = tables.length;
  const totalProductsCount = products.length;
  const tablesOverLimitCount = Math.max(0, totalTablesCount - FREE_MAX_TABLES);
  const productsOverLimitCount = Math.max(0, totalProductsCount - FREE_MAX_PRODUCTS);
  const hasItemsOverFreeLimit = totalTablesCount > FREE_MAX_TABLES || totalProductsCount > FREE_MAX_PRODUCTS;

  const planExpiresAtMs = parseTimestampMs(user?.planExpiresAt);
  const explicitGraceEndsAtMs = parseTimestampMs(user?.graceEndsAt);
  const graceEndsAtMs =
    explicitGraceEndsAtMs ?? (planExpiresAtMs !== null ? planExpiresAtMs + GRACE_PERIOD_MS : null);

  let status: SubscriptionStatus = 'free';
  let msUntilExpiry: number | null = null;
  let daysUntilExpiry: number | null = null;
  let msRemainingInGrace: number | null = null;
  let hoursRemainingInGrace: number | null = null;

  if (isMasterAdmin) {
    status = 'pro_active';
  } else if (user?.plan === 'pro') {
    if (planExpiresAtMs === null) {
      // Only treat null expiry as active if explicitly marked permanent/admin; otherwise check status
      status = user?.subscriptionStatus === 'pro_grace' ? 'pro_grace' : 'pro_active';
    } else if (planExpiresAtMs > nowMs) {
      status = 'pro_active';
      msUntilExpiry = planExpiresAtMs - nowMs;
      daysUntilExpiry = Math.max(1, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)));
    } else if (graceEndsAtMs !== null && graceEndsAtMs > nowMs) {
      status = 'pro_grace';
      msRemainingInGrace = Math.max(0, graceEndsAtMs - nowMs);
      hoursRemainingInGrace = Math.max(1, Math.ceil(msRemainingInGrace / (60 * 60 * 1000)));
    } else {
      status = hasItemsOverFreeLimit && degradationEnabled ? 'free_over_limit' : 'free';
    }
  } else {
    status = hasItemsOverFreeLimit && degradationEnabled ? 'free_over_limit' : 'free';
  }

  const hasProAccess = status === 'pro_active' || status === 'pro_grace';
  const effectivePlan: 'free' | 'pro' = hasProAccess ? 'pro' : 'free';
  const isInGracePeriod = status === 'pro_grace';
  const isOverLimit = status === 'free_over_limit';

  const activeTablesCount = hasProAccess
    ? totalTablesCount
    : tables.filter((t) => t.active !== false).length;
  const inactiveTablesCount = Math.max(0, totalTablesCount - activeTablesCount);

  const activeProductsCount = hasProAccess
    ? totalProductsCount
    : products.filter((p) => p.active !== false).length;
  const inactiveProductsCount = Math.max(0, totalProductsCount - activeProductsCount);

  // Never auto-deactivate silently: if total exceeds free limit and user hasn't explicitly restricted
  // active count down to <= Free max, require explicit user selection.
  const needsTableSelection =
    isOverLimit && totalTablesCount > FREE_MAX_TABLES && activeTablesCount > FREE_MAX_TABLES;
  const needsProductSelection =
    isOverLimit && totalProductsCount > FREE_MAX_PRODUCTS && activeProductsCount > FREE_MAX_PRODUCTS;
  const needsOverLimitSelection = needsTableSelection || needsProductSelection;

  const canCreateTable = hasProAccess || !degradationEnabled || totalTablesCount < FREE_MAX_TABLES;
  const canCreateProduct = hasProAccess || !degradationEnabled || totalProductsCount < FREE_MAX_PRODUCTS;

  const warningMilestone = getWarningMilestoneForState({
    status,
    msUntilExpiry,
  });

  return {
    status,
    effectivePlan,
    hasProAccess,
    isMasterAdmin,
    isInGracePeriod,
    isOverLimit,
    cancelAtPeriodEnd: Boolean(user?.cancelAtPeriodEnd),
    planExpiresAtMs,
    graceEndsAtMs,
    msUntilExpiry,
    daysUntilExpiry,
    msRemainingInGrace,
    hoursRemainingInGrace,
    warningMilestone,
    totalTablesCount,
    activeTablesCount,
    inactiveTablesCount,
    tablesOverLimitCount,
    totalProductsCount,
    activeProductsCount,
    inactiveProductsCount,
    productsOverLimitCount,
    needsTableSelection,
    needsProductSelection,
    needsOverLimitSelection,
    canCreateTable,
    canCreateProduct,
    degradationEnabled,
  };
}

export interface SelectionValidationResult {
  valid: boolean;
  error?: string;
  normalizedIds: string[];
}

export function validateActiveSelection<T extends { id: string }>(params: {
  selectedIds: string[];
  items: T[];
  maxAllowed: number;
  protectedIds?: Set<string>;
  entityLabel: string;
}): SelectionValidationResult {
  const { selectedIds, items, maxAllowed, protectedIds, entityLabel } = params;
  const validIdsSet = new Set(items.map((item) => item.id));
  const uniqueSelected = Array.from(new Set((selectedIds || []).filter((id) => typeof id === 'string')));

  for (const id of uniqueSelected) {
    if (!validIdsSet.has(id)) {
      return {
        valid: false,
        error: `Uno o más ${entityLabel} seleccionados no existen.`,
        normalizedIds: [],
      };
    }
  }

  if (items.length <= maxAllowed) {
    return {
      valid: true,
      normalizedIds: items.map((item) => item.id),
    };
  }

  if (uniqueSelected.length === 0 || uniqueSelected.length > maxAllowed) {
    return {
      valid: false,
      error: `Debes elegir entre 1 y ${maxAllowed} ${entityLabel} activos para operar en el Plan Gratis.`,
      normalizedIds: [],
    };
  }

  if (protectedIds && protectedIds.size > 0 && protectedIds.size <= maxAllowed) {
    for (const protId of protectedIds) {
      if (validIdsSet.has(protId) && !uniqueSelected.includes(protId)) {
        return {
          valid: false,
          error: `No puedes desactivar ${entityLabel} que tienen pedidos abiertos o comandas activas.`,
          normalizedIds: [],
        };
      }
    }
  }

  return {
    valid: true,
    normalizedIds: uniqueSelected,
  };
}
