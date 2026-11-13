import type {
  ItemAllocation,
  Order,
  OrderItem,
  PaymentBreakdownEntry,
  PaymentMethod,
  ProductTaxType,
  TableSubaccount,
} from '../types';

export const UNASSIGNED_SUBACCOUNT_ID = '__general__';

export function generateTableSessionId(tableId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const cleanTable = (tableId || 'mesa').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
  return `sess-${cleanTable}-${Date.now().toString(36)}-${rand}`;
}

export function generateSubaccountId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `sub-${Date.now().toString(36)}-${rand}`;
}

export function generatePaymentOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pay-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `pay-${Date.now().toString(36)}-${rand}`;
}

export function normalizeBaseSubaccountName(name: string): string {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*#\d+$/i, '')
    .slice(0, 36);
}

/**
 * Evita colisiones entre homónimos en la misma sesión de mesa:
 * Si ya existe "Juan", el segundo recibe "Juan #2", el tercero "Juan #3", etc.
 */
export function resolveUniqueSubaccountName(
  desiredName: string,
  existingSubaccounts: Pick<TableSubaccount, 'id' | 'displayName' | 'baseName'>[] = [],
  excludeSubaccountId?: string
): { displayName: string; baseName: string } {
  const baseName = normalizeBaseSubaccountName(desiredName) || 'Invitado';
  const takenNames = new Set(
    existingSubaccounts
      .filter((s) => s.id !== excludeSubaccountId)
      .map((s) => s.displayName.trim().toLowerCase())
  );

  if (!takenNames.has(baseName.toLowerCase())) {
    return { displayName: baseName, baseName };
  }

  let index = 2;
  while (takenNames.has(`${baseName} #${index}`.toLowerCase())) {
    index += 1;
  }
  return { displayName: `${baseName} #${index}`, baseName };
}

export function createTableSubaccount(params: {
  id?: string;
  tableId: string;
  tableSessionId: string;
  desiredName: string;
  existingSubaccounts?: TableSubaccount[];
  nowIso?: string;
}): TableSubaccount {
  const now = params.nowIso || new Date().toISOString();
  const { displayName, baseName } = resolveUniqueSubaccountName(
    params.desiredName,
    params.existingSubaccounts || []
  );
  return {
    id: params.id || generateSubaccountId(),
    tableId: params.tableId,
    tableSessionId: params.tableSessionId,
    displayName,
    baseName,
    status: 'activa',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Reparte un monto entero COP exactamente entre N participantes usando el método Hamilton-Hare
 * de resto mayor, garantizando sum(shares) === Math.round(totalAmount) sin pérdida ni exceso de pesos.
 */
export function allocateIntegerShares(totalAmount: number, count: number): number[] {
  const safeCount = Math.max(1, Math.floor(count));
  const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal - base * safeCount;
  return Array.from({ length: safeCount }, (_, idx) => (idx < remainder ? base + 1 : base));
}

/**
 * Reparte un monto entero COP proporcionalmente según pesos positivos,
 * garantizando sum(shares) === Math.round(totalAmount).
 */
export function allocateWeightedShares(totalAmount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safeTotal = Math.max(0, Math.round(Number(totalAmount || 0)));
  const cleanWeights = weights.map((w) => Math.max(0, Number(w || 0)));
  const weightSum = cleanWeights.reduce((acc, w) => acc + w, 0);
  if (weightSum <= 0) {
    return allocateIntegerShares(safeTotal, weights.length);
  }

  const exact = cleanWeights.map((w) => (safeTotal * w) / weightSum);
  const floors = exact.map((val) => Math.floor(val));
  let remainder = safeTotal - floors.reduce((acc, v) => acc + v, 0);

  const remainders = exact
    .map((val, idx) => ({ idx, frac: val - floors[idx] }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);

  let cursor = 0;
  while (remainder > 0 && remainders.length > 0) {
    floors[remainders[cursor % remainders.length].idx] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return floors;
}

export function computeItemTotal(item: Pick<OrderItem, 'unitPrice' | 'quantity'>): number {
  return Math.max(0, Math.round(Number(item.unitPrice || 0) * Number(item.quantity || 0)));
}

export function computeItemPaidAmount(item: OrderItem): number {
  const gross = computeItemTotal(item);
  if (gross <= 0) return 0;

  if (item.isShared && Array.isArray(item.allocations) && item.allocations.length > 0) {
    const paidFromAllocations = item.allocations
      .filter((a) => Boolean(a.paid))
      .reduce((acc, a) => acc + Math.max(0, Math.round(Number(a.shareAmount || 0))), 0);
    return Math.min(gross, paidFromAllocations);
  }

  const paidDirect = Math.max(0, Math.round(Number(item.paidAmount || 0)));
  if (paidDirect > 0) {
    return Math.min(gross, paidDirect);
  }
  if (Number(item.paidQuantity || 0) > 0) {
    return Math.min(gross, Math.round(Number(item.paidQuantity || 0) * Number(item.unitPrice || 0)));
  }
  return 0;
}

export function computeItemPendingAmount(item: OrderItem): number {
  return Math.max(0, computeItemTotal(item) - computeItemPaidAmount(item));
}

export function isItemFullyPaid(item: OrderItem): boolean {
  return computeItemPendingAmount(item) <= 0;
}

export function computeTaxSplitFromGross(
  grossAmount: number,
  discountPercent = 0,
  taxType?: ProductTaxType,
  taxRate?: number,
  fallbackTaxRate = 8
): {
  gross: number;
  discountAmount: number;
  netAfterDiscount: number;
  baseAmount: number;
  ivaAmount: number;
  impoconsumoAmount: number;
  taxAmount: number;
} {
  const safeGross = Math.max(0, Math.round(Number(grossAmount || 0)));
  const safeDiscountPct = Math.max(0, Math.min(100, Number(discountPercent || 0)));
  const discountAmount = Math.round((safeGross * safeDiscountPct) / 100);
  const netAfterDiscount = Math.max(0, safeGross - discountAmount);

  const resolvedType: ProductTaxType = taxType || 'impoconsumo';
  const resolvedRate =
    resolvedType === 'exento'
      ? 0
      : typeof taxRate === 'number'
        ? Math.max(0, taxRate)
        : Math.max(0, fallbackTaxRate);

  if (resolvedType === 'exento' || resolvedRate <= 0) {
    return {
      gross: safeGross,
      discountAmount,
      netAfterDiscount,
      baseAmount: netAfterDiscount,
      ivaAmount: 0,
      impoconsumoAmount: 0,
      taxAmount: 0,
    };
  }

  const baseAmount = Math.round(netAfterDiscount / (1 + resolvedRate / 100));
  const taxAmount = Math.max(0, netAfterDiscount - baseAmount);
  return {
    gross: safeGross,
    discountAmount,
    netAfterDiscount,
    baseAmount,
    ivaAmount: resolvedType === 'iva' ? taxAmount : 0,
    impoconsumoAmount: resolvedType === 'impoconsumo' ? taxAmount : 0,
    taxAmount,
  };
}

export interface SubaccountBalanceSummary {
  subaccountId: string;
  displayName: string;
  status: TableSubaccount['status'];
  mergedIntoSubaccountId?: string;
  mergedGroupName?: string;
  grossTotal: number;
  paidGross: number;
  pendingGross: number;
  pendingBase: number;
  pendingDiscount: number;
  pendingIva: number;
  pendingImpoconsumo: number;
  pendingTax: number;
  pendingNetWithTax: number;
  itemCount: number;
  sharedItemCount: number;
  requiresElectronicInvoice?: boolean;
  requestedTipAmount?: number;
}

export interface OrderSubaccountsOverview {
  tableTotalGross: number;
  tablePaidGross: number;
  tablePendingGross: number;
  tablePendingNetWithTax: number;
  unassignedPendingGross: number;
  unassignedPaidGross: number;
  unassignedItemCount: number;
  subaccounts: SubaccountBalanceSummary[];
}

export function getEffectiveSubaccountId(
  subaccountId: string | undefined,
  subaccounts: TableSubaccount[] = []
): string {
  if (!subaccountId) return UNASSIGNED_SUBACCOUNT_ID;
  const sub = subaccounts.find((s) => s.id === subaccountId);
  if (sub?.mergedIntoSubaccountId) {
    return sub.mergedIntoSubaccountId;
  }
  return subaccountId;
}

export function computeOrderSubaccountsSummary(
  order: Order | null | undefined,
  defaultTaxRate = 8,
  externalSubaccounts?: TableSubaccount[]
): OrderSubaccountsOverview {
  if (!order) {
    return {
      tableTotalGross: 0,
      tablePaidGross: 0,
      tablePendingGross: 0,
      tablePendingNetWithTax: 0,
      unassignedPendingGross: 0,
      unassignedPaidGross: 0,
      unassignedItemCount: 0,
      subaccounts: [],
    };
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const subaccounts =
    Array.isArray(externalSubaccounts) && externalSubaccounts.length > 0
      ? externalSubaccounts
      : Array.isArray(order.subaccounts)
        ? order.subaccounts
        : [];
  const discountPct = Number(order.discountPercent || 0);
  const orderTaxPct = typeof order.taxPercent === 'number' ? order.taxPercent : defaultTaxRate;

  const summaryMap = new Map<string, SubaccountBalanceSummary>();
  for (const sub of subaccounts) {
    summaryMap.set(sub.id, {
      subaccountId: sub.id,
      displayName: sub.mergedGroupName || sub.displayName,
      status: sub.status,
      mergedIntoSubaccountId: sub.mergedIntoSubaccountId,
      mergedGroupName: sub.mergedGroupName,
      grossTotal: 0,
      paidGross: 0,
      pendingGross: 0,
      pendingBase: 0,
      pendingDiscount: 0,
      pendingIva: 0,
      pendingImpoconsumo: 0,
      pendingTax: 0,
      pendingNetWithTax: 0,
      itemCount: 0,
      sharedItemCount: 0,
      requiresElectronicInvoice: sub.requiresElectronicInvoice,
      requestedTipAmount: sub.requestedTipAmount,
    });
  }

  let tableTotalGross = 0;
  let tablePaidGross = 0;
  let tablePendingGross = 0;
  let tablePendingNetWithTax = 0;
  let unassignedPendingGross = 0;
  let unassignedPaidGross = 0;
  let unassignedItemCount = 0;

  for (const item of items) {
    const itemGross = computeItemTotal(item);
    const itemPaid = computeItemPaidAmount(item);
    const itemPending = Math.max(0, itemGross - itemPaid);

    tableTotalGross += itemGross;
    tablePaidGross += itemPaid;
    tablePendingGross += itemPending;

    const pendingTaxInfo = computeTaxSplitFromGross(
      itemPending,
      discountPct,
      item.taxType,
      item.taxRate,
      orderTaxPct
    );
    tablePendingNetWithTax += pendingTaxInfo.netAfterDiscount;

    if (item.isShared && Array.isArray(item.allocations) && item.allocations.length > 0) {
      for (const alloc of item.allocations) {
        const shareGross = Math.max(0, Math.round(Number(alloc.shareAmount || 0)));
        const sharePaid = alloc.paid ? shareGross : 0;
        const sharePending = alloc.paid ? 0 : shareGross;
        const shareTax = computeTaxSplitFromGross(
          sharePending,
          discountPct,
          item.taxType,
          item.taxRate,
          orderTaxPct
        );

        let entry = summaryMap.get(alloc.subaccountId);
        if (!entry) {
          entry = {
            subaccountId: alloc.subaccountId,
            displayName: alloc.subaccountName || 'Invitado',
            status: 'activa',
            grossTotal: 0,
            paidGross: 0,
            pendingGross: 0,
            pendingBase: 0,
            pendingDiscount: 0,
            pendingIva: 0,
            pendingImpoconsumo: 0,
            pendingTax: 0,
            pendingNetWithTax: 0,
            itemCount: 0,
            sharedItemCount: 0,
          };
          summaryMap.set(alloc.subaccountId, entry);
        }

        entry.grossTotal += shareGross;
        entry.paidGross += sharePaid;
        entry.pendingGross += sharePending;
        entry.pendingBase += shareTax.baseAmount;
        entry.pendingDiscount += shareTax.discountAmount;
        entry.pendingIva += shareTax.ivaAmount;
        entry.pendingImpoconsumo += shareTax.impoconsumoAmount;
        entry.pendingTax += shareTax.taxAmount;
        entry.pendingNetWithTax += shareTax.netAfterDiscount;
        entry.sharedItemCount += 1;
      }
      continue;
    }

    if (item.subaccountId) {
      let entry = summaryMap.get(item.subaccountId);
      if (!entry) {
        entry = {
          subaccountId: item.subaccountId,
          displayName: item.subaccountName || item.customerName || 'Invitado',
          status: 'activa',
          grossTotal: 0,
          paidGross: 0,
          pendingGross: 0,
          pendingBase: 0,
          pendingDiscount: 0,
          pendingIva: 0,
          pendingImpoconsumo: 0,
          pendingTax: 0,
          pendingNetWithTax: 0,
          itemCount: 0,
          sharedItemCount: 0,
        };
        summaryMap.set(item.subaccountId, entry);
      }

      entry.grossTotal += itemGross;
      entry.paidGross += itemPaid;
      entry.pendingGross += itemPending;
      entry.pendingBase += pendingTaxInfo.baseAmount;
      entry.pendingDiscount += pendingTaxInfo.discountAmount;
      entry.pendingIva += pendingTaxInfo.ivaAmount;
      entry.pendingImpoconsumo += pendingTaxInfo.impoconsumoAmount;
      entry.pendingTax += pendingTaxInfo.taxAmount;
      entry.pendingNetWithTax += pendingTaxInfo.netAfterDiscount;
      entry.itemCount += 1;
    } else {
      unassignedPendingGross += itemPending;
      unassignedPaidGross += itemPaid;
      unassignedItemCount += 1;
    }
  }

  return {
    tableTotalGross,
    tablePaidGross,
    tablePendingGross,
    tablePendingNetWithTax,
    unassignedPendingGross,
    unassignedPaidGross,
    unassignedItemCount,
    subaccounts: Array.from(summaryMap.values()),
  };
}

/**
 * Reasigna o mueve un producto no pagado a otra subcuenta (o a cuenta general si targetSubaccountId es undefined).
 */
export function moveOrderItemToSubaccount(
  items: OrderItem[],
  itemId: string,
  targetSubaccountId?: string,
  targetSubaccountName?: string
): OrderItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    if (computeItemPaidAmount(item) > 0) {
      throw new Error('No se puede mover un producto que ya tiene pagos registrados.');
    }
    const next: OrderItem = {
      ...item,
      isShared: false,
      allocations: undefined,
      subaccountId: targetSubaccountId || undefined,
      subaccountName: targetSubaccountId ? targetSubaccountName || 'Invitado' : undefined,
      customerName: targetSubaccountId ? targetSubaccountName || item.customerName : item.customerName,
    };
    return next;
  });
}

/**
 * Divide un producto compartido en partes iguales entre varias subcuentas (con redondeo exacto COP).
 */
export function splitOrderItemEqually(
  items: OrderItem[],
  itemId: string,
  participants: Array<{ id: string; displayName: string }>
): OrderItem[] {
  if (participants.length < 2) {
    throw new Error('Selecciona al menos 2 subcuentas para dividir el producto.');
  }

  return items.map((item) => {
    if (item.id !== itemId) return item;
    if (computeItemPaidAmount(item) > 0) {
      throw new Error('No se puede dividir un producto que ya tiene pagos registrados.');
    }
    const gross = computeItemTotal(item);
    const shares = allocateIntegerShares(gross, participants.length);
    const ratio = Number((1 / participants.length).toFixed(6));

    const allocations: ItemAllocation[] = participants.map((p, idx) => ({
      subaccountId: p.id,
      subaccountName: p.displayName,
      shareAmount: shares[idx],
      shareRatio: ratio,
      paid: false,
    }));

    return {
      ...item,
      isShared: true,
      subaccountId: undefined,
      subaccountName: `Compartido (${participants.map((p) => p.displayName).join(', ')})`,
      allocations,
    };
  });
}

/**
 * Divide un producto compartido usando montos personalizados exactos (COP) por subcuenta.
 */
export function splitOrderItemCustomAmounts(
  items: OrderItem[],
  itemId: string,
  shares: Array<{ subaccountId: string; subaccountName: string; shareAmount: number }>
): OrderItem[] {
  if (shares.length < 2) {
    throw new Error('Selecciona al menos 2 subcuentas para dividir el producto.');
  }
  return items.map((item) => {
    if (item.id !== itemId) return item;
    if (computeItemPaidAmount(item) > 0) {
      throw new Error('No se puede dividir un producto que ya tiene pagos registrados.');
    }
    const gross = computeItemTotal(item);
    const cleanShares = shares.map((s) => ({
      ...s,
      shareAmount: Math.max(0, Math.round(Number(s.shareAmount || 0))),
    }));
    const sum = cleanShares.reduce((acc, s) => acc + s.shareAmount, 0);
    if (sum !== gross) {
      throw new Error(
        `La suma de los montos divididos (${sum}) debe ser igual al total del producto (${gross}).`
      );
    }

    const allocations: ItemAllocation[] = cleanShares.map((s) => ({
      subaccountId: s.subaccountId,
      subaccountName: s.subaccountName,
      shareAmount: s.shareAmount,
      shareRatio: gross > 0 ? Number((s.shareAmount / gross).toFixed(6)) : 0,
      paid: false,
    }));

    return {
      ...item,
      isShared: true,
      subaccountId: undefined,
      subaccountName: `Compartido (${cleanShares.map((s) => s.subaccountName).join(', ')})`,
      allocations,
    };
  });
}

/**
 * Une dos o más subcuentas dentro de una cuenta principal para cobro conjunto,
 * conservando la procedencia individual de cada ítem/asignación.
 */
export function mergeSubaccountsGroup(
  subaccounts: TableSubaccount[],
  sourceSubaccountIds: string[],
  targetSubaccountId: string,
  customGroupName?: string
): TableSubaccount[] {
  const uniqueSources = Array.from(new Set(sourceSubaccountIds)).filter((id) => id !== targetSubaccountId);
  if (uniqueSources.length === 0) {
    return subaccounts;
  }
  const now = new Date().toISOString();
  const target = subaccounts.find((s) => s.id === targetSubaccountId);
  if (!target) {
    throw new Error('No se encontró la subcuenta principal destino.');
  }
  const involvedNames = [
    target.displayName,
    ...subaccounts.filter((s) => uniqueSources.includes(s.id)).map((s) => s.displayName),
  ];
  const groupName = (customGroupName || '').trim() || `Grupo (${involvedNames.join(' + ')})`;

  return subaccounts.map((sub) => {
    if (sub.id === targetSubaccountId) {
      return {
        ...sub,
        mergedIntoSubaccountId: undefined,
        mergedGroupName: groupName,
        updatedAt: now,
      };
    }
    if (uniqueSources.includes(sub.id)) {
      return {
        ...sub,
        mergedIntoSubaccountId: targetSubaccountId,
        mergedGroupName: groupName,
        updatedAt: now,
      };
    }
    return sub;
  });
}

/**
 * Separa subcuentas previamente unidas sin alterar sus ítems ni pagos registrados.
 */
export function unmergeSubaccountsGroup(
  subaccounts: TableSubaccount[],
  groupTargetSubaccountId: string
): TableSubaccount[] {
  const now = new Date().toISOString();
  return subaccounts.map((sub) => {
    if (sub.id === groupTargetSubaccountId || sub.mergedIntoSubaccountId === groupTargetSubaccountId) {
      return {
        ...sub,
        mergedIntoSubaccountId: undefined,
        mergedGroupName: undefined,
        updatedAt: now,
      };
    }
    return sub;
  });
}

export interface PartialItemSelection {
  itemId: string;
  /** Cuando el ítem es compartido, indica cuáles subcuentas se cobran de sus allocations */
  subaccountIds?: string[];
  /** Cuando se cobra un abono parcial directo por monto en un ítem no compartido */
  amount?: number;
}

export interface SubaccountCheckoutPlan {
  orderId: string;
  tableSessionId: string;
  affectedSubaccountIds: string[];
  affectedSubaccountNames: string[];
  includesUnassigned: boolean;
  receiptItems: OrderItem[];
  itemsRequiringInventoryDeduction: OrderItem[];
  updatedOrderItems: OrderItem[];
  updatedSubaccounts: TableSubaccount[];
  grossConsumption: number;
  discountAmount: number;
  discountPercent: number;
  subtotal: number;
  ivaAmount: number;
  impoconsumoAmount: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  remainingPendingBalance: number;
  shouldReleaseTable: boolean;
  isPartialTableCheckout: boolean;
  primaryPaymentMethod: PaymentMethod;
  normalizedBreakdown: PaymentBreakdownEntry[];
  cashTendered?: number;
  change?: number;
}

export interface BuildCheckoutPlanInput {
  order: Order;
  /** Lista de subcuentas seleccionadas para cobrar (vacío + sin selectedItems = toda la mesa pendiente) */
  targetSubaccountIds?: string[];
  /** Incluir explícitamente ítems sin subcuenta asignada (__general__) */
  includeUnassigned?: boolean;
  /** Selección granular opcional por ítem */
  selectedItems?: PartialItemSelection[];
  /** Propina voluntaria explícita en COP (0% impuesto, Ley 1935/2018) */
  tipAmount?: number;
  /** Medios de pago (simple o mixto). Si se omite, asume paymentMethod único por el total */
  paymentMethod?: PaymentMethod;
  paymentBreakdown?: PaymentBreakdownEntry[];
  cashTendered?: number;
  defaultTaxRate?: number;
  paymentId?: string;
}

/**
 * Construye un plan de cobro atómico, determinista y compatible con exportación contable
 * (Siigo / Loggro / Excel / CSV) para cobro total, parcial, por subcuenta, unido o mixto.
 */
export function buildSubaccountCheckoutPlan(input: BuildCheckoutPlanInput): SubaccountCheckoutPlan {
  const { order } = input;
  const now = new Date().toISOString();
  const tableSessionId = order.tableSessionId || order.id || generateTableSessionId(order.tableId);
  const subaccounts = Array.isArray(order.subaccounts) ? order.subaccounts : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const discountPercent = Math.max(0, Math.min(100, Number(order.discountPercent || 0)));
  const fallbackTaxRate = typeof order.taxPercent === 'number' ? order.taxPercent : input.defaultTaxRate ?? 8;

  // Expandir grupos unidos si el caller selecciona la cuenta principal de un grupo unido
  const explicitTargetSet = new Set(input.targetSubaccountIds || []);
  const expandedTargetSet = new Set<string>(explicitTargetSet);
  for (const sub of subaccounts) {
    if (sub.mergedIntoSubaccountId && explicitTargetSet.has(sub.mergedIntoSubaccountId)) {
      expandedTargetSet.add(sub.id);
    }
    if (sub.mergedIntoSubaccountId && explicitTargetSet.has(sub.id)) {
      expandedTargetSet.add(sub.mergedIntoSubaccountId);
    }
  }

  const isWholeRemainingTable =
    expandedTargetSet.size === 0 &&
    !input.includeUnassigned &&
    (!input.selectedItems || input.selectedItems.length === 0);

  const selectedItemsMap = new Map<string, PartialItemSelection>();
  for (const sel of input.selectedItems || []) {
    selectedItemsMap.set(sel.itemId, sel);
  }

  const receiptItems: OrderItem[] = [];
  const itemsRequiringInventoryDeduction: OrderItem[] = [];
  const affectedSubIdsSet = new Set<string>();
  const affectedSubNamesMap = new Map<string, string>();
  let includesUnassigned = false;

  let grossConsumption = 0;
  let totalDiscountAmount = 0;
  let totalBaseAmount = 0;
  let totalIvaAmount = 0;
  let totalImpoconsumoAmount = 0;
  let totalTaxAmount = 0;

  const updatedOrderItems: OrderItem[] = items.map((item) => {
    const itemGross = computeItemTotal(item);
    const pendingBefore = computeItemPendingAmount(item);
    if (pendingBefore <= 0 || itemGross <= 0) {
      return item;
    }

    const granularSel = selectedItemsMap.get(item.id);
    let chargeGrossThisTurn = 0;
    let nextItem: OrderItem = { ...item };

    if (item.isShared && Array.isArray(item.allocations) && item.allocations.length > 0) {
      const targetSubSetForItem = granularSel?.subaccountIds
        ? new Set(granularSel.subaccountIds)
        : expandedTargetSet;

      const updatedAllocs = item.allocations.map((alloc) => {
        if (alloc.paid) return alloc;
        const shouldChargeAlloc =
          isWholeRemainingTable ||
          Boolean(granularSel && !granularSel.subaccountIds) ||
          targetSubSetForItem.has(alloc.subaccountId);

        if (!shouldChargeAlloc) return alloc;

        const shareAmt = Math.max(0, Math.round(Number(alloc.shareAmount || 0)));
        chargeGrossThisTurn += shareAmt;
        affectedSubIdsSet.add(alloc.subaccountId);
        affectedSubNamesMap.set(alloc.subaccountId, alloc.subaccountName);

        return {
          ...alloc,
          paid: true,
          paidAt: now,
          paymentId: input.paymentId || 'pending',
        };
      });

      if (chargeGrossThisTurn <= 0) {
        return item;
      }

      const paidAfter = updatedAllocs
        .filter((a) => Boolean(a.paid))
        .reduce((acc, a) => acc + Math.max(0, Math.round(Number(a.shareAmount || 0))), 0);

      nextItem = {
        ...item,
        allocations: updatedAllocs,
        paidAmount: Math.min(itemGross, paidAfter),
        inventoryDeducted: true,
      };

      // Emitir línea con entero exacto COP (qty=1, unitPrice=chargeGrossThisTurn) para mantener sum(qty*unitPrice)===netTotal
      receiptItems.push({
        ...item,
        id: `${item.id}-share-${receiptItems.length + 1}`,
        name:
          chargeGrossThisTurn < itemGross
            ? `${item.name} (Parte compartida)`
            : item.name,
        quantity: 1,
        unitPrice: chargeGrossThisTurn,
        subaccountId:
          updatedAllocs.filter((a) => a.paymentId === (input.paymentId || 'pending')).length === 1
            ? updatedAllocs.find((a) => a.paymentId === (input.paymentId || 'pending'))?.subaccountId
            : undefined,
        subaccountName: updatedAllocs
          .filter((a) => a.paymentId === (input.paymentId || 'pending'))
          .map((a) => a.subaccountName)
          .join(', '),
      });
    } else {
      // Ítem individual o sin asignar
      const belongsToTargetSub = Boolean(item.subaccountId && expandedTargetSet.has(item.subaccountId));
      const isUnassigned = !item.subaccountId;
      const shouldChargeItem =
        isWholeRemainingTable ||
        belongsToTargetSub ||
        (Boolean(input.includeUnassigned) && isUnassigned) ||
        Boolean(granularSel);

      if (!shouldChargeItem) {
        return item;
      }

      if (granularSel?.amount !== undefined) {
        chargeGrossThisTurn = Math.max(0, Math.min(pendingBefore, Math.round(granularSel.amount)));
      } else {
        chargeGrossThisTurn = pendingBefore;
      }

      if (chargeGrossThisTurn <= 0) {
        return item;
      }

      if (item.subaccountId) {
        affectedSubIdsSet.add(item.subaccountId);
        affectedSubNamesMap.set(item.subaccountId, item.subaccountName || item.customerName || 'Invitado');
      } else {
        includesUnassigned = true;
      }

      const prevPaid = computeItemPaidAmount(item);
      const nextPaid = Math.min(itemGross, prevPaid + chargeGrossThisTurn);
      const isPayingFullLineOriginal = prevPaid === 0 && chargeGrossThisTurn === itemGross;

      nextItem = {
        ...item,
        paidAmount: nextPaid,
        paidQuantity: nextPaid >= itemGross ? item.quantity : item.paidQuantity,
        inventoryDeducted: true,
      };

      receiptItems.push(
        isPayingFullLineOriginal
          ? { ...item }
          : {
              ...item,
              id: `${item.id}-part-${receiptItems.length + 1}`,
              name: `${item.name} (Abono parcial)`,
              quantity: 1,
              unitPrice: chargeGrossThisTurn,
            }
      );
    }

    if (!item.inventoryDeducted) {
      itemsRequiringInventoryDeduction.push(item);
    }

    const taxSplit = computeTaxSplitFromGross(
      chargeGrossThisTurn,
      discountPercent,
      item.taxType,
      item.taxRate,
      fallbackTaxRate
    );
    grossConsumption += taxSplit.gross;
    totalDiscountAmount += taxSplit.discountAmount;
    totalBaseAmount += taxSplit.baseAmount;
    totalIvaAmount += taxSplit.ivaAmount;
    totalImpoconsumoAmount += taxSplit.impoconsumoAmount;
    totalTaxAmount += taxSplit.taxAmount;

    return nextItem;
  });

  if (receiptItems.length === 0 || grossConsumption <= 0) {
    throw new Error('No hay consumos pendientes seleccionados para cobrar.');
  }

  const consumptionTotalWithTax = totalBaseAmount + totalTaxAmount;
  const safeTipAmount = Math.max(0, Math.round(Number(input.tipAmount || 0)));
  const finalTotal = consumptionTotalWithTax + safeTipAmount;

  let normalizedBreakdown: PaymentBreakdownEntry[];
  if (Array.isArray(input.paymentBreakdown) && input.paymentBreakdown.length > 0) {
    normalizedBreakdown = input.paymentBreakdown
      .map((entry) => ({
        ...entry,
        amount: Math.max(0, Math.round(Number(entry.amount || 0))),
        cashTendered:
          entry.method === 'efectivo' && entry.cashTendered !== undefined
            ? Math.max(0, Math.round(Number(entry.cashTendered)))
            : undefined,
        change:
          entry.method === 'efectivo' && entry.cashTendered !== undefined
            ? Math.max(0, Math.round(Number(entry.cashTendered)) - Math.max(0, Math.round(Number(entry.amount || 0))))
            : entry.change,
      }))
      .filter((entry) => entry.amount > 0);

    const breakdownSum = normalizedBreakdown.reduce((acc, e) => acc + e.amount, 0);
    if (breakdownSum !== finalTotal) {
      throw new Error(
        `La suma de los medios de pago (${breakdownSum}) debe coincidir exactamente con el total a cobrar (${finalTotal}).`
      );
    }
  } else {
    const method: PaymentMethod = input.paymentMethod || 'efectivo';
    const tendered =
      method === 'efectivo' && input.cashTendered !== undefined
        ? Math.max(0, Math.round(Number(input.cashTendered)))
        : method === 'efectivo'
          ? finalTotal
          : undefined;
    const change =
      method === 'efectivo' && tendered !== undefined
        ? Math.max(0, tendered - finalTotal)
        : undefined;
    normalizedBreakdown = [
      {
        method,
        amount: finalTotal,
        cashTendered: tendered,
        change,
      },
    ];
  }

  const sortedByAmount = [...normalizedBreakdown].sort((a, b) => b.amount - a.amount);
  const primaryPaymentMethod: PaymentMethod = sortedByAmount[0]?.method || input.paymentMethod || 'efectivo';
  const cashEntry = normalizedBreakdown.find((e) => e.method === 'efectivo');

  const remainingPendingBalance = updatedOrderItems.reduce(
    (acc, item) => acc + computeItemPendingAmount(item),
    0
  );
  const shouldReleaseTable = remainingPendingBalance <= 0;

  // Actualizar estado de cada subcuenta según su saldo restante
  const updatedSubaccounts: TableSubaccount[] = subaccounts.map((sub) => {
    let pendingForSub = 0;
    let paidForSub = 0;
    for (const item of updatedOrderItems) {
      if (item.isShared && Array.isArray(item.allocations)) {
        for (const a of item.allocations) {
          if (a.subaccountId === sub.id) {
            if (a.paid) paidForSub += Math.round(Number(a.shareAmount || 0));
            else pendingForSub += Math.round(Number(a.shareAmount || 0));
          }
        }
      } else if (item.subaccountId === sub.id) {
        pendingForSub += computeItemPendingAmount(item);
        paidForSub += computeItemPaidAmount(item);
      }
    }

    let nextStatus = sub.status;
    if (shouldReleaseTable) {
      nextStatus = 'cerrada';
    } else if (pendingForSub <= 0 && paidForSub > 0) {
      nextStatus = 'pagada';
    } else if (paidForSub > 0 && pendingForSub > 0) {
      nextStatus = 'pagada_parcial';
    } else if (sub.status === 'pidiendo_cuenta' && affectedSubIdsSet.has(sub.id) && pendingForSub <= 0) {
      nextStatus = 'pagada';
    }

    return {
      ...sub,
      status: nextStatus,
      updatedAt: now,
    };
  });

  const affectedSubaccountIds = Array.from(affectedSubIdsSet);
  const affectedSubaccountNames = affectedSubaccountIds.map(
    (id) => affectedSubNamesMap.get(id) || subaccounts.find((s) => s.id === id)?.displayName || 'Invitado'
  );
  if (includesUnassigned) {
    affectedSubaccountNames.push('Cuenta General');
  }

  return {
    orderId: order.id,
    tableSessionId,
    affectedSubaccountIds,
    affectedSubaccountNames,
    includesUnassigned,
    receiptItems,
    itemsRequiringInventoryDeduction,
    updatedOrderItems,
    updatedSubaccounts,
    grossConsumption,
    discountAmount: totalDiscountAmount,
    discountPercent,
    subtotal: totalBaseAmount,
    ivaAmount: totalIvaAmount,
    impoconsumoAmount: totalImpoconsumoAmount,
    taxAmount: totalTaxAmount,
    tipAmount: safeTipAmount,
    total: finalTotal,
    remainingPendingBalance,
    shouldReleaseTable,
    isPartialTableCheckout: !shouldReleaseTable,
    primaryPaymentMethod,
    normalizedBreakdown,
    cashTendered: cashEntry?.cashTendered,
    change: cashEntry?.change,
  };
}
