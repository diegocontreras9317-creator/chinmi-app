import {
  CostStatus,
  PerishableItem,
  Product,
  RecipeIngredient
} from '../types';
import {
  formatQuantity,
  normalizeNonNegativeQuantity,
  scaledToNumber,
  toScaledQuantity
} from './quantityPrecision';
import {
  calculateExactPortions,
  convertRecipeQtyToPantryScaled,
  resolveUnitConversion
} from './recipeUnits';
import {
  formatPackagingLabel,
  formatPresentationSummary,
  formatSpanishNumber,
  getEffectiveBaseUnit
} from './perishableUtils';

/**
 * Redondea el costo unitario en base manteniendo hasta 4 decimales para unidades pequeñas (ej. $/gramo o $/ml)
 * y evitando truncamientos bruscos.
 */
export function roundUnitCost(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10000) / 10000;
}

/**
 * Redondea totales monetarios COP a entero o 2 decimales según magnitud.
 */
export function roundCOPAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

export interface WeightedAverageCostInput {
  prevQty: number;
  prevCostPerUnit: number;
  prevCostStatus?: CostStatus;
  prevPendingValuationCount?: number;
  receivedBaseQty: number;
  unitPriceInPurchaseUnit?: number;
  purchasePresentationQty?: number;
  totalPurchaseCost?: number;
}

export interface WeightedAverageCostResult {
  nextQty: number;
  nextCostPerUnit: number;
  costStatus: CostStatus;
  pendingValuationCount: number;
  valuationStatus: 'valued' | 'pending_valuation';
  totalPurchaseCost?: number;
  batchUnitCostInBase?: number;
}

/**
 * Calcula el Costo Promedio Ponderado Móvil al recibir mercancía.
 * - Si ingresa con precio válido (> 0): actualiza el costo promedio ponderado sobre la unidad base.
 * - Si ingresa sin precio: conserva el costo provisional vigente sin promediar $0 y marca valoración pendiente.
 */
export function calculateWeightedMovingAverageCost(
  input: WeightedAverageCostInput
): WeightedAverageCostResult {
  const prevQty = normalizeNonNegativeQuantity(input.prevQty);
  const prevCost = Number.isFinite(input.prevCostPerUnit) && input.prevCostPerUnit > 0
    ? input.prevCostPerUnit
    : 0;
  const receivedBaseQty = normalizeNonNegativeQuantity(input.receivedBaseQty);
  const nextQty = normalizeNonNegativeQuantity(prevQty + receivedBaseQty);
  const prevPending = Math.max(0, Number(input.prevPendingValuationCount) || 0);

  let resolvedTotal = 0;
  if (input.totalPurchaseCost !== undefined && Number.isFinite(input.totalPurchaseCost) && input.totalPurchaseCost > 0) {
    resolvedTotal = input.totalPurchaseCost;
  } else if (
    input.unitPriceInPurchaseUnit !== undefined &&
    Number.isFinite(input.unitPriceInPurchaseUnit) &&
    input.unitPriceInPurchaseUnit > 0
  ) {
    const mult =
      input.purchasePresentationQty !== undefined && input.purchasePresentationQty > 0
        ? input.purchasePresentationQty
        : receivedBaseQty;
    resolvedTotal = input.unitPriceInPurchaseUnit * mult;
  }

  // Caso 1: Ingreso SIN precio -> no contaminar con $0
  if (!(resolvedTotal > 0) || !(receivedBaseQty > 0)) {
    const nextPending = prevPending + 1;
    return {
      nextQty,
      nextCostPerUnit: roundUnitCost(prevCost),
      costStatus: prevCost > 0 ? 'provisional' : 'pending_valuation',
      pendingValuationCount: nextPending,
      valuationStatus: 'pending_valuation'
    };
  }

  // Caso 2: Ingreso CON precio válido
  const batchUnitCostInBase = resolvedTotal / receivedBaseQty;

  if (prevQty <= 0 || prevCost <= 0 || input.prevCostStatus === 'pending_valuation') {
    return {
      nextQty,
      nextCostPerUnit: roundUnitCost(batchUnitCostInBase),
      costStatus: prevPending > 0 ? 'provisional' : 'exact',
      pendingValuationCount: prevPending,
      valuationStatus: 'valued',
      totalPurchaseCost: roundCOPAmount(resolvedTotal),
      batchUnitCostInBase: roundUnitCost(batchUnitCostInBase)
    };
  }

  const totalInventoryValue = prevQty * prevCost + resolvedTotal;
  const weightedAvg = totalInventoryValue / (prevQty + receivedBaseQty);

  return {
    nextQty,
    nextCostPerUnit: roundUnitCost(weightedAvg),
    costStatus: prevPending > 0 ? 'provisional' : 'exact',
    pendingValuationCount: prevPending,
    valuationStatus: 'valued',
    totalPurchaseCost: roundCOPAmount(resolvedTotal),
    batchUnitCostInBase: roundUnitCost(batchUnitCostInBase)
  };
}

/**
 * Completa posteriormente la valoración económica de un ingreso que entró sin precio.
 * No re-agrega inventario ni altera ventas históricas ya registradas.
 */
export function applyDelayedValuationAdjustment(params: {
  currentQty: number;
  currentCostPerUnit: number;
  pendingValuationCount?: number;
  addedBaseQty: number;
  totalPurchaseCost?: number;
  unitPriceInPurchaseUnit?: number;
  purchasePresentationQty?: number;
}): {
  nextCostPerUnit: number;
  costStatus: CostStatus;
  pendingValuationCount: number;
  totalPurchaseCost: number;
  batchUnitCostInBase: number;
} {
  const currentQty = normalizeNonNegativeQuantity(params.currentQty);
  const currentAvg = Number.isFinite(params.currentCostPerUnit) && params.currentCostPerUnit > 0
    ? params.currentCostPerUnit
    : 0;
  const addedBaseQty = normalizeNonNegativeQuantity(params.addedBaseQty);
  const nextPending = Math.max(0, (Number(params.pendingValuationCount) || 1) - 1);

  let resolvedTotal = 0;
  if (params.totalPurchaseCost !== undefined && Number.isFinite(params.totalPurchaseCost) && params.totalPurchaseCost > 0) {
    resolvedTotal = params.totalPurchaseCost;
  } else if (
    params.unitPriceInPurchaseUnit !== undefined &&
    Number.isFinite(params.unitPriceInPurchaseUnit) &&
    params.unitPriceInPurchaseUnit > 0
  ) {
    const mult =
      params.purchasePresentationQty !== undefined && params.purchasePresentationQty > 0
        ? params.purchasePresentationQty
        : addedBaseQty;
    resolvedTotal = params.unitPriceInPurchaseUnit * mult;
  }

  if (!(resolvedTotal > 0) || !(addedBaseQty > 0)) {
    throw new Error('Debes ingresar un precio válido mayor a 0 para completar la valoración.');
  }

  const batchUnitCostInBase = resolvedTotal / addedBaseQty;

  let nextAvg = batchUnitCostInBase;
  if (currentQty > 0 && currentAvg > 0) {
    const remainingFromEvent = Math.min(currentQty, addedBaseQty);
    const otherRemaining = Math.max(0, currentQty - remainingFromEvent);
    nextAvg = (otherRemaining * currentAvg + remainingFromEvent * batchUnitCostInBase) / currentQty;
  }

  return {
    nextCostPerUnit: roundUnitCost(nextAvg),
    costStatus: nextPending > 0 ? 'provisional' : 'exact',
    pendingValuationCount: nextPending,
    totalPurchaseCost: roundCOPAmount(resolvedTotal),
    batchUnitCostInBase: roundUnitCost(batchUnitCostInBase)
  };
}

export interface SecondaryDisplayInfo {
  text: string;
  quantity: number;
  unitLabel: string;
  exact: boolean;
  isApproximate: boolean;
}

/**
 * Calcula la visualización secundaria orientativa/exacta de un insumo sin modificar su unidad base.
 * Ejemplos:
 * - "24 unidades" + presentación de 6 -> "= 4 paquetes (x 6 unidades)"
 * - "2.5 kg" + "1 tajada = 25 g" -> "= 100 tajadas"
 */
export function computeSecondaryDisplay(item: PerishableItem): SecondaryDisplayInfo | null {
  const baseUnit = getEffectiveBaseUnit(item);
  const qty = normalizeNonNegativeQuantity(item.quantity ?? item.cantidadActual ?? 0);
  const activePresentations = (item.presentations || []).filter((p) => p.active !== false);

  // 1. Si eligió una presentación específica como visualización secundaria
  if (item.secondaryPresentationId) {
    const pres = activePresentations.find((p) => p.id === item.secondaryPresentationId);
    if (pres && pres.contentQty > 0) {
      const onePresInBase = convertRecipeQtyToPantryScaled(
        pres.contentQty,
        pres.contentUnit,
        item,
        1
      );
      if (onePresInBase > 0n) {
        const qtyScaled = toScaledQuantity(qty);
        const packsNum = Number(qtyScaled) / Number(onePresInBase);
        const cleanPacks = Math.round(packsNum * 100) / 100;
        const packLabel = formatPackagingLabel(pres.packagingType, cleanPacks !== 1);
        const isMixed = activePresentations.length > 1;
        return {
          text: `${isMixed ? '≈' : '='} ${formatQuantity(cleanPacks)} ${packLabel} (${formatPresentationSummary(pres)})`,
          quantity: cleanPacks,
          unitLabel: packLabel,
          exact: !isMixed,
          isApproximate: isMixed
        };
      }
    }
  }

  // 2. Si eligió una unidad secundaria explícita (ej. "tajada" o "porcion" o "gramos")
  if (item.secondaryDisplayUnit && item.secondaryDisplayUnit.trim()) {
    const targetUnit = item.secondaryDisplayUnit.trim();
    const conv = resolveUnitConversion({
      fromUnit: baseUnit,
      toUnit: targetUnit,
      pantryItem: item
    });
    if (conv.compatible && conv.factor > 0) {
      const converted = Math.round(qty * conv.factor * 1000) / 1000;
      const isMixed = conv.source === 'presentation' && activePresentations.length > 1;
      return {
        text: `${isMixed ? '≈' : '='} ${formatQuantity(converted)} ${targetUnit}`,
        quantity: converted,
        unitLabel: targetUnit,
        exact: !isMixed,
        isApproximate: isMixed
      };
    }
  }

  // 3. Sugerencia automática: si tiene exactamente 1 equivalencia personalizada (ej. tajada/porcion)
  const firstEquiv = (item.equivalences || [])[0];
  if (firstEquiv) {
    const conv = resolveUnitConversion({
      fromUnit: baseUnit,
      toUnit: firstEquiv.unit,
      pantryItem: item
    });
    if (conv.compatible && conv.factor > 0) {
      const converted = Math.round(qty * conv.factor * 1000) / 1000;
      return {
        text: `= ${formatQuantity(converted)} ${firstEquiv.unit}`,
        quantity: converted,
        unitLabel: firstEquiv.unit,
        exact: true,
        isApproximate: false
      };
    }
  }

  // 4. Sugerencia automática: si tiene exactamente 1 presentación activa (ej. Paquete de 6 unidades)
  if (activePresentations.length === 1) {
    const pres = activePresentations[0];
    const onePresInBase = convertRecipeQtyToPantryScaled(pres.contentQty, pres.contentUnit, item, 1);
    if (onePresInBase > 0n) {
      const qtyScaled = toScaledQuantity(qty);
      const packsNum = Number(qtyScaled) / Number(onePresInBase);
      const cleanPacks = Math.round(packsNum * 100) / 100;
      const packLabel = formatPackagingLabel(pres.packagingType, cleanPacks !== 1);
      return {
        text: `= ${formatQuantity(cleanPacks)} ${packLabel} de ${formatSpanishNumber(pres.contentQty)} ${pres.contentUnit}`,
        quantity: cleanPacks,
        unitLabel: packLabel,
        exact: true,
        isApproximate: false
      };
    }
  }

  return null;
}

export interface RecipeIngredientCostLine extends RecipeIngredient {
  pantryItem?: PerishableItem;
  compatible: boolean;
  conversionSource: string;
  incompatibleReason?: string;
  conversionFactor: number;
  requiredInPantryUnit: number;
  unitCost: number;
  costStatus: CostStatus;
  subtotal: number;
  available: number;
  portions: number;
}

export interface RecipeCostBreakdown {
  items: RecipeIngredientCostLine[];
  totalCost: number;
  estimatedPortions: number;
  limitingInsumo: { name: string; available: number; unit: string; maxPortions: number } | null;
  hasIncompatibleUnits: boolean;
  hasProvisionalCost: boolean;
}

/**
 * Calcula en tiempo real el costo de una receta y sus porciones disponibles usando el
 * Costo Promedio Ponderado actual de los insumos en Despensa, sin necesidad de reescribir
 * masivamente los documentos de productos en Firestore en cada recepción.
 */
export function calculateRecipeCostBreakdown(
  receta: RecipeIngredient[] | undefined,
  perishables: PerishableItem[]
): RecipeCostBreakdown {
  if (!Array.isArray(receta) || receta.length === 0) {
    return {
      items: [],
      totalCost: 0,
      estimatedPortions: 0,
      limitingInsumo: null,
      hasIncompatibleUnits: false,
      hasProvisionalCost: false
    };
  }

  let totalCost = 0;
  let minPortions = Infinity;
  let limitingInsumo: RecipeCostBreakdown['limitingInsumo'] = null;
  let hasIncompatibleUnits = false;
  let hasProvisionalCost = false;

  const items: RecipeIngredientCostLine[] = receta.map((ing) => {
    const pantryItem = perishables.find((p) => p.id === ing.insumoId);
    const baseUnit = getEffectiveBaseUnit(pantryItem);

    const conv = pantryItem
      ? resolveUnitConversion({
          fromUnit: ing.unidad,
          toUnit: baseUnit,
          pantryItem
        })
      : {
          compatible: false,
          ratio: { num: 0n, den: 1n },
          factor: 0,
          source: 'incompatible' as const,
          reason: 'Insumo no encontrado en Despensa.'
        };

    if (!conv.compatible) {
      hasIncompatibleUnits = true;
    }

    const requiredScaled = conv.compatible && pantryItem
      ? convertRecipeQtyToPantryScaled(ing.cantidad, ing.unidad, pantryItem, 1)
      : 0n;
    const requiredInPantryUnit = scaledToNumber(requiredScaled);

    const unitCost = pantryItem?.costPerUnit ?? ing.costoUnitario ?? 0;
    const costStatus: CostStatus = pantryItem?.costStatus || (unitCost > 0 ? 'exact' : 'pending_valuation');
    if (costStatus !== 'exact') {
      hasProvisionalCost = true;
    }

    const subtotal = conv.compatible ? requiredInPantryUnit * unitCost : 0;
    totalCost += subtotal;

    const available = pantryItem
      ? normalizeNonNegativeQuantity(pantryItem.quantity ?? pantryItem.cantidadActual ?? 0)
      : 0;
    const portions = conv.compatible ? calculateExactPortions(available, requiredInPantryUnit) : 0;

    if (conv.compatible && portions < minPortions) {
      minPortions = portions;
      limitingInsumo = {
        name: pantryItem?.name || ing.nombre,
        available,
        unit: baseUnit || ing.unidad,
        maxPortions: portions
      };
    }

    return {
      ...ing,
      pantryItem,
      compatible: conv.compatible,
      conversionSource: conv.source,
      incompatibleReason: conv.reason,
      conversionFactor: conv.factor,
      requiredInPantryUnit,
      unitCost,
      costStatus,
      subtotal,
      available,
      portions
    };
  });

  const estimatedPortions = minPortions === Infinity ? 0 : minPortions;

  return {
    items,
    totalCost: roundCOPAmount(totalCost),
    estimatedPortions,
    limitingInsumo,
    hasIncompatibleUnits,
    hasProvisionalCost
  };
}

/**
 * Obtiene el costo live de un producto (si es de receta usa el costo promedio ponderado actual
 * de sus insumos; si no tiene receta o es directo, devuelve prod.cost).
 */
export function getLiveProductCost(product: Product, perishables: PerishableItem[]): {
  cost: number;
  hasProvisionalCost: boolean;
  hasIncompatibleUnits: boolean;
} {
  if (product.tipoInventario === 'receta' && Array.isArray(product.receta) && product.receta.length > 0) {
    const breakdown = calculateRecipeCostBreakdown(product.receta, perishables);
    return {
      cost: breakdown.totalCost > 0 ? breakdown.totalCost : (product.cost || 0),
      hasProvisionalCost: breakdown.hasProvisionalCost,
      hasIncompatibleUnits: breakdown.hasIncompatibleUnits
    };
  }
  return {
    cost: product.cost || 0,
    hasProvisionalCost: false,
    hasIncompatibleUnits: false
  };
}

/**
 * Convierte de manera asistida y explícita un insumo existente (ej. legacy en "paquetes" o "cajas")
 * a una nueva unidad base (ej. "unidades" o "kg") multiplicando stock actual, stock mínimo y lotes por `factor`,
 * y ajustando `costPerUnit` inversamente (`costPerUnit / factor`) para mantener el valor total del inventario.
 */
export function convertPerishableBaseUnit(params: {
  item: PerishableItem;
  newBaseUnit: string;
  unitsPerOldUnit: number;
}): PerishableItem {
  const { item, newBaseUnit, unitsPerOldUnit } = params;
  if (!(unitsPerOldUnit > 0) || !Number.isFinite(unitsPerOldUnit)) {
    throw new Error('El factor de conversión debe ser mayor que 0.');
  }

  const nextQty = normalizeNonNegativeQuantity((item.quantity ?? item.cantidadActual ?? 0) * unitsPerOldUnit);
  const nextMin = normalizeNonNegativeQuantity((item.minStock ?? item.alertaStockMinimo ?? 0) * unitsPerOldUnit);
  const nextCost =
    item.costPerUnit && item.costPerUnit > 0
      ? roundUnitCost(item.costPerUnit / unitsPerOldUnit)
      : item.costPerUnit;

  const nextLots = Array.isArray(item.lots)
    ? item.lots.map((l) => ({
        ...l,
        quantity: normalizeNonNegativeQuantity(l.quantity * unitsPerOldUnit),
        ...(l.unitCost && l.unitCost > 0 ? { unitCost: roundUnitCost(l.unitCost / unitsPerOldUnit) } : {})
      }))
    : undefined;

  return {
    ...item,
    unit: newBaseUnit,
    baseUnit: newBaseUnit,
    quantity: nextQty,
    cantidadActual: nextQty,
    minStock: nextMin,
    alertaStockMinimo: nextMin,
    ...(nextCost !== undefined ? { costPerUnit: nextCost } : {}),
    ...(nextLots !== undefined ? { lots: nextLots } : {})
  };
}
