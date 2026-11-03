import { OrderItem, Product, ProductTaxType, SaleReceipt } from '../types';

export const DEFAULT_IMPOCONSUMO_RATE = 8;
export const DEFAULT_IVA_RATE = 19;

export interface ResolvedTaxConfig {
  taxType: ProductTaxType;
  taxRate: number;
  nameLabel: string;
  shortLabel: string;
  inclusiveLabel: string;
}

export interface TaxBucket {
  key: string;
  taxType: ProductTaxType;
  taxRate: number;
  nameLabel: string;
  shortLabel: string;
  inclusiveLabel: string;
  grossAmount: number;
  baseAmount: number;
  taxAmount: number;
}

export interface OrderTaxSummary {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  productsTotal: number;
  taxableBase: number;
  totalTaxAmount: number;
  ivaAmount: number;
  impoconsumoAmount: number;
  effectiveTaxPercent: number;
  buckets: TaxBucket[];
  summaryLabel: string;
}

function normalizeTaxType(rawType?: string | null, rawRate?: number | null): ProductTaxType {
  const clean = (rawType || '').toString().trim().toLowerCase();
  if (clean === 'iva') return 'iva';
  if (clean === 'exento' || clean === 'sin_impuesto' || clean === 'none') return 'exento';
  if (clean === 'impoconsumo' || clean === 'ipoconsumo' || clean === 'inc') return 'impoconsumo';
  if (rawRate === 0) return 'exento';
  return 'impoconsumo';
}

export function buildTaxLabels(taxType: ProductTaxType, taxRate: number): Omit<ResolvedTaxConfig, 'taxType' | 'taxRate'> {
  const cleanRate = Math.max(0, Number.isFinite(taxRate) ? Number(taxRate) : 0);
  if (taxType === 'exento' || cleanRate === 0) {
    return {
      nameLabel: 'Exento',
      shortLabel: 'Exento 0%',
      inclusiveLabel: 'Exento (0%)'
    };
  }
  if (taxType === 'iva') {
    return {
      nameLabel: 'IVA',
      shortLabel: `IVA ${cleanRate}%`,
      inclusiveLabel: `IVA (${cleanRate}% inc.)`
    };
  }
  return {
    nameLabel: 'Impoconsumo',
    shortLabel: `Impoconsumo ${cleanRate}%`,
    inclusiveLabel: `Impoconsumo (${cleanRate}% inc.)`
  };
}

/**
 * Resuelve el tipo y porcentaje de impuesto de un producto del catálogo.
 * Por compatibilidad con productos existentes, si no tiene `taxType` definido se asume Impoconsumo (8%).
 */
export function resolveProductTax(
  product?: Partial<Product> | null,
  fallbackDefaultRate = DEFAULT_IMPOCONSUMO_RATE
): ResolvedTaxConfig {
  const hasExplicitRate =
    product?.taxRate !== undefined &&
    product?.taxRate !== null &&
    !Number.isNaN(Number(product.taxRate));

  const taxType = normalizeTaxType(
    product?.taxType,
    hasExplicitRate ? Number(product?.taxRate) : undefined
  );

  let taxRate: number;
  if (taxType === 'exento') {
    taxRate = 0;
  } else if (hasExplicitRate) {
    taxRate = Math.max(0, Number(product?.taxRate));
  } else if (taxType === 'iva') {
    taxRate = DEFAULT_IVA_RATE;
  } else {
    taxRate = fallbackDefaultRate > 0 ? fallbackDefaultRate : DEFAULT_IMPOCONSUMO_RATE;
  }

  if (taxRate === 0) {
    return {
      taxType: 'exento',
      taxRate: 0,
      ...buildTaxLabels('exento', 0)
    };
  }

  return {
    taxType,
    taxRate,
    ...buildTaxLabels(taxType, taxRate)
  };
}

/**
 * Resuelve el impuesto aplicable a una línea de pedido/comanda.
 * Prioriza el snapshot guardado en el item; si es un item antiguo sin snapshot, consulta el catálogo.
 */
export function resolveOrderItemTax(
  item?: (Partial<OrderItem> & Record<string, unknown>) | null,
  productsCatalog?: Product[],
  fallbackOrderTaxRate = DEFAULT_IMPOCONSUMO_RATE
): ResolvedTaxConfig {
  const rawItemType = item?.taxType as string | undefined;
  const rawItemRate = item?.taxRate;
  const hasItemTaxType = Boolean(rawItemType && String(rawItemType).trim());
  const hasItemTaxRate =
    rawItemRate !== undefined &&
    rawItemRate !== null &&
    String(rawItemRate).trim() !== '' &&
    !Number.isNaN(Number(rawItemRate));

  if (hasItemTaxType || hasItemTaxRate) {
    const resolvedType = normalizeTaxType(
      rawItemType,
      hasItemTaxRate ? Number(rawItemRate) : undefined
    );
    const resolvedRate =
      resolvedType === 'exento'
        ? 0
        : hasItemTaxRate
        ? Math.max(0, Number(rawItemRate))
        : resolvedType === 'iva'
        ? DEFAULT_IVA_RATE
        : fallbackOrderTaxRate > 0
        ? fallbackOrderTaxRate
        : DEFAULT_IMPOCONSUMO_RATE;

    const finalType: ProductTaxType = resolvedRate === 0 ? 'exento' : resolvedType;
    return {
      taxType: finalType,
      taxRate: resolvedRate,
      ...buildTaxLabels(finalType, resolvedRate)
    };
  }

  if (productsCatalog && productsCatalog.length > 0 && item?.productId) {
    const matchedProduct = productsCatalog.find((p) => p.id === item.productId);
    if (matchedProduct) {
      return resolveProductTax(matchedProduct, fallbackOrderTaxRate);
    }
  }

  const rate = fallbackOrderTaxRate >= 0 ? fallbackOrderTaxRate : DEFAULT_IMPOCONSUMO_RATE;
  const fallbackType: ProductTaxType = rate === 0 ? 'exento' : 'impoconsumo';
  return {
    taxType: fallbackType,
    taxRate: rate,
    ...buildTaxLabels(fallbackType, rate)
  };
}

/**
 * Calcula el desglose exacto de impuestos incluidos (IVA e Impoconsumo) sobre una lista de ítems
 * aplicando cualquier porcentaje de descuento comercial proporcionalmente a cada línea.
 */
export function calculateOrderTaxBreakdown(
  items: Array<Partial<OrderItem> & Record<string, unknown>>,
  options?: {
    discountPercent?: number;
    fallbackTaxRate?: number;
    productsCatalog?: Product[];
  }
): OrderTaxSummary {
  const discountPercent = Math.min(100, Math.max(0, Number(options?.discountPercent) || 0));
  const discountFactor = 1 - discountPercent / 100;
  const fallbackTaxRate =
    options?.fallbackTaxRate !== undefined && !Number.isNaN(Number(options.fallbackTaxRate))
      ? Number(options.fallbackTaxRate)
      : DEFAULT_IMPOCONSUMO_RATE;

  let subtotal = 0;
  let taxableBase = 0;
  let totalTaxAmount = 0;
  let ivaAmount = 0;
  let impoconsumoAmount = 0;

  const bucketMap = new Map<string, TaxBucket>();

  for (const item of items || []) {
    const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.precio ?? 0) || 0;
    const quantity = Number(item?.quantity ?? item?.cantidad ?? 0) || 0;
    const lineSubtotal = unitPrice * quantity;
    if (lineSubtotal <= 0) continue;

    subtotal += lineSubtotal;
    const netLineGross = lineSubtotal * discountFactor;

    const resolved = resolveOrderItemTax(item, options?.productsCatalog, fallbackTaxRate);
    const rate = resolved.taxRate;
    const lineTax = rate > 0 ? netLineGross - netLineGross / (1 + rate / 100) : 0;
    const lineBase = netLineGross - lineTax;

    taxableBase += lineBase;
    totalTaxAmount += lineTax;

    if (resolved.taxType === 'iva') {
      ivaAmount += lineTax;
    } else if (resolved.taxType === 'impoconsumo') {
      impoconsumoAmount += lineTax;
    }

    if (rate > 0) {
      const bucketKey = `${resolved.taxType}_${rate}`;
      const existing = bucketMap.get(bucketKey);
      if (existing) {
        existing.grossAmount += netLineGross;
        existing.baseAmount += lineBase;
        existing.taxAmount += lineTax;
      } else {
        bucketMap.set(bucketKey, {
          key: bucketKey,
          taxType: resolved.taxType,
          taxRate: rate,
          nameLabel: resolved.nameLabel,
          shortLabel: resolved.shortLabel,
          inclusiveLabel: resolved.inclusiveLabel,
          grossAmount: netLineGross,
          baseAmount: lineBase,
          taxAmount: lineTax
        });
      }
    }
  }

  const discountAmount = subtotal * (discountPercent / 100);
  const productsTotal = subtotal - discountAmount;

  const buckets = Array.from(bucketMap.values()).sort((a, b) => {
    if (a.taxType !== b.taxType) {
      return a.taxType === 'impoconsumo' ? -1 : 1;
    }
    return a.taxRate - b.taxRate;
  });

  let effectiveTaxPercent = fallbackTaxRate;
  let summaryLabel = `Impoconsumo (${fallbackTaxRate}% inc.)`;

  if (buckets.length === 1) {
    effectiveTaxPercent = buckets[0].taxRate;
    summaryLabel = buckets[0].inclusiveLabel;
  } else if (buckets.length > 1) {
    effectiveTaxPercent =
      taxableBase > 0 ? Math.round((totalTaxAmount / taxableBase) * 1000) / 10 : fallbackTaxRate;
    const hasIva = buckets.some((b) => b.taxType === 'iva');
    const hasImpo = buckets.some((b) => b.taxType === 'impoconsumo');
    summaryLabel =
      hasIva && hasImpo
        ? 'Impoconsumo + IVA (inc.)'
        : buckets.map((b) => b.shortLabel).join(' + ');
  } else if (subtotal > 0) {
    effectiveTaxPercent = 0;
    summaryLabel = 'Exento de impuesto (0%)';
  }

  return {
    subtotal,
    discountPercent,
    discountAmount,
    productsTotal,
    taxableBase,
    totalTaxAmount,
    ivaAmount,
    impoconsumoAmount,
    effectiveTaxPercent,
    buckets,
    summaryLabel
  };
}

/**
 * Obtiene las líneas discriminadas de impuestos para mostrar o imprimir un recibo emitido,
 * manteniendo compatibilidad exacta con recibos históricos previos.
 */
export function getReceiptTaxLines(receipt: SaleReceipt): Array<{ label: string; amount: number }> {
  const items = receipt.items || [];
  const hasExplicitItemTaxes = items.some(
    (it) =>
      (it.taxType !== undefined && String(it.taxType).trim() !== '') ||
      (it.taxRate !== undefined && String(it.taxRate).trim() !== '')
  );

  if (hasExplicitItemTaxes) {
    const summary = calculateOrderTaxBreakdown(
      items as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
      {
        discountPercent: receipt.discountPercent,
        fallbackTaxRate: receipt.taxPercent
      }
    );
    if (summary.buckets.length === 0) {
      return [{ label: 'Exento de impuesto (0%):', amount: 0 }];
    }
    return summary.buckets.map((b) => ({
      label: `${b.inclusiveLabel}:`,
      amount: Math.round(b.taxAmount)
    }));
  }

  const hasSavedSplit =
    (typeof receipt.ivaAmount === 'number' && receipt.ivaAmount > 0) ||
    (typeof receipt.impoconsumoAmount === 'number' && receipt.impoconsumoAmount > 0);

  if (hasSavedSplit) {
    const lines: Array<{ label: string; amount: number }> = [];
    if (receipt.impoconsumoAmount && receipt.impoconsumoAmount > 0) {
      lines.push({
        label: 'Impoconsumo (inc.):',
        amount: Math.round(receipt.impoconsumoAmount)
      });
    }
    if (receipt.ivaAmount && receipt.ivaAmount > 0) {
      lines.push({
        label: 'IVA (inc.):',
        amount: Math.round(receipt.ivaAmount)
      });
    }
    return lines;
  }

  return [
    {
      label: `Impoconsumo / IVA (${receipt.taxPercent}% inc.):`,
      amount: Math.round(receipt.taxAmount)
    }
  ];
}
