import { PerishableItem, Product, RecipeIngredient } from '../types';
import {
  multiplyScaledByRatio,
  normalizeNonNegativeQuantity,
  scaledToNumber,
  toScaledQuantity
} from './quantityPrecision';

/**
 * Unidades y factores de conversión para recetas y escandallos
 * Permite seleccionar und, libra, kilo, tajada, gramos, ml, litros
 */

export const RECIPE_UNIT_OPTIONS = [
  { value: 'und', label: 'und (unidad)', short: 'und' },
  { value: 'libra', label: 'libra (lb - 500g)', short: 'libra' },
  { value: 'kilo', label: 'kilo (kg - 1000g)', short: 'kilo' },
  { value: 'tajada', label: 'tajada (porción/loncha)', short: 'tajada' },
  { value: 'gramos', label: 'gramos (g)', short: 'gramos' },
  { value: 'ml', label: 'ml (mililitros)', short: 'ml' },
  { value: 'litros', label: 'litros (L)', short: 'litros' }
] as const;

export type RecipeUnitValue = (typeof RECIPE_UNIT_OPTIONS)[number]['value'];

/**
 * Normaliza una unidad dada para asignar el valor por defecto en el selector
 */
export function normalizeToRecipeUnit(unit?: string): RecipeUnitValue {
  if (!unit) return 'und';
  const u = unit.toLowerCase().trim();
  if (u === 'g' || u === 'gramos' || u === 'gramo') return 'gramos';
  if (u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramos') return 'kilo';
  if (u === 'libra' || u === 'libras' || u === 'lb') return 'libra';
  if (u === 'tajada' || u === 'tajadas' || u === 'loncha' || u === 'lonchas' || u === 'porcion') return 'tajada';
  if (u === 'ml' || u === 'mililitros') return 'ml';
  if (u === 'l' || u === 'litros' || u === 'litro') return 'litros';
  return 'und';
}

export interface UnitConversionRatio {
  num: bigint;
  den: bigint;
}

/**
 * Razón racional exacta entre la unidad usada en la receta y la unidad base en Despensa.
 * Permite multiplicar y dividir en enteros escalados sin introducir error binario de 0.001 o 0.002.
 */
export function getUnitConversionRatio(recipeUnit?: string, pantryUnit?: string): UnitConversionRatio {
  if (!recipeUnit || !pantryUnit) return { num: 1n, den: 1n };
  const ru = recipeUnit.toLowerCase().trim();
  const pu = pantryUnit.toLowerCase().trim();

  if (ru === pu) return { num: 1n, den: 1n };

  const isRecipeGram = ru === 'g' || ru === 'gramos' || ru === 'gramo';
  const isRecipeKilo = ru === 'kg' || ru === 'kilo' || ru === 'kilos' || ru === 'kilogramos';
  const isRecipeLibra = ru === 'libra' || ru === 'libras' || ru === 'lb';
  const isRecipeMl = ru === 'ml' || ru === 'mililitros';
  const isRecipeLitro = ru === 'l' || ru === 'litros' || ru === 'litro';
  const isRecipeUnd = ru === 'und' || ru === 'unidad' || ru === 'unidades';
  const isRecipeTajada = ru === 'tajada' || ru === 'tajadas' || ru === 'loncha' || ru === 'lonchas';

  const isPantryGram = pu === 'g' || pu === 'gramos' || pu === 'gramo';
  const isPantryKilo = pu === 'kg' || pu === 'kilo' || pu === 'kilos' || pu === 'kilogramos';
  const isPantryLibra = pu === 'libra' || pu === 'libras' || pu === 'lb';
  const isPantryMl = pu === 'ml' || pu === 'mililitros';
  const isPantryLitro = pu === 'l' || pu === 'litros' || pu === 'litro';
  const isPantryUnd = pu === 'und' || pu === 'unidad' || pu === 'unidades';
  const isPantryTajada = pu === 'tajada' || pu === 'tajadas' || pu === 'loncha' || pu === 'lonchas';

  // Despensa en Kilos
  if (isPantryKilo) {
    if (isRecipeGram) return { num: 1n, den: 1000n };
    if (isRecipeLibra) return { num: 1n, den: 2n };
    if (isRecipeKilo) return { num: 1n, den: 1n };
  }

  // Despensa en Gramos
  if (isPantryGram) {
    if (isRecipeKilo) return { num: 1000n, den: 1n };
    if (isRecipeLibra) return { num: 500n, den: 1n };
    if (isRecipeGram) return { num: 1n, den: 1n };
  }

  // Despensa en Libras (500 g)
  if (isPantryLibra) {
    if (isRecipeGram) return { num: 1n, den: 500n };
    if (isRecipeKilo) return { num: 2n, den: 1n };
    if (isRecipeLibra) return { num: 1n, den: 1n };
  }

  // Despensa en Litros
  if (isPantryLitro) {
    if (isRecipeMl) return { num: 1n, den: 1000n };
    if (isRecipeLitro) return { num: 1n, den: 1n };
  }

  // Despensa en ML
  if (isPantryMl) {
    if (isRecipeLitro) return { num: 1000n, den: 1n };
    if (isRecipeMl) return { num: 1n, den: 1n };
  }

  // Unidades y Tajadas equivalentes 1:1
  if ((isPantryUnd && isRecipeTajada) || (isPantryTajada && isRecipeUnd)) {
    return { num: 1n, den: 1n };
  }

  return { num: 1n, den: 1n };
}

/**
 * Calcula el factor de conversión multiplicador entre la unidad usada en la receta
 * y la unidad base almacenada en la Despensa.
 * Multiplicando: `cantidadEnReceta * factor = cantidadEnUnidadDeDespensa`
 */
export function getUnitConversionFactor(recipeUnit?: string, pantryUnit?: string): number {
  const { num, den } = getUnitConversionRatio(recipeUnit, pantryUnit);
  if (num === den) return 1;
  return Number(num) / Number(den);
}

/**
 * Convierte una cantidad de receta (opcionalmente multiplicada por cantidad vendida)
 * a micro-unidades enteras escaladas en la unidad base de Despensa.
 */
export function convertRecipeQtyToPantryScaled(
  recipeQty: number | string | null | undefined,
  recipeUnit?: string,
  pantryUnit?: string,
  soldQty: number | string = 1
): bigint {
  const baseScaled = toScaledQuantity(recipeQty);
  const multScaled = toScaledQuantity(soldQty);
  if (baseScaled <= 0n || multScaled <= 0n) return 0n;

  const { num, den } = getUnitConversionRatio(recipeUnit, pantryUnit);
  const totalProductScaled = multiplyScaledByRatio(baseScaled * multScaled, num, den * 1_000_000n);
  return totalProductScaled > 0n ? totalProductScaled : 0n;
}

/**
 * Convierte una cantidad de receta (opcionalmente multiplicada por cantidad vendida)
 * a la unidad de despensa usando aritmética entera escalada exacta (sin errores de punto flotante).
 */
export function convertRecipeQtyToPantry(
  recipeQty: number | string | null | undefined,
  recipeUnit?: string,
  pantryUnit?: string,
  soldQty: number | string = 1
): number {
  return scaledToNumber(convertRecipeQtyToPantryScaled(recipeQty, recipeUnit, pantryUnit, soldQty));
}

/**
 * Calcula las porciones disponibles enteras para un ingrediente en despensa
 * utilizando división entera BigInt (evita subestimaciones como Math.floor(0.3 / 0.1) === 2).
 */
export function calculateExactPortions(
  availableInPantry: number | string | null | undefined,
  requiredInPantryUnit: number | string | null | undefined
): number {
  const availScaled = toScaledQuantity(availableInPantry);
  const reqScaled = toScaledQuantity(requiredInPantryUnit);
  if (availScaled <= 0n || reqScaled <= 0n) return 0;
  return Number(availScaled / reqScaled);
}

/**
 * Calcula porciones estimadas totales de una receta completa y su insumo limitante.
 */
export function calculateRecipeAvailability(
  receta: RecipeIngredient[] | undefined,
  perishables: PerishableItem[]
): { estimatedPortions: number; limitingInsumoName: string } {
  if (!Array.isArray(receta) || receta.length === 0) {
    return { estimatedPortions: 0, limitingInsumoName: '' };
  }

  let minPortions = Infinity;
  let limitingInsumoName = '';

  for (const ing of receta) {
    const found = perishables.find((p) => p.id === ing.insumoId);
    const availScaled = found ? toScaledQuantity(found.quantity ?? found.cantidadActual ?? 0) : 0n;
    const reqScaled = convertRecipeQtyToPantryScaled(ing.cantidad, ing.unidad, found?.unit, 1);
    const portions = availScaled > 0n && reqScaled > 0n ? Number(availScaled / reqScaled) : 0;
    if (portions < minPortions) {
      minPortions = portions;
      limitingInsumoName = found?.name || ing.nombre || '';
    }
  }

  return {
    estimatedPortions: minPortions === Infinity ? 0 : minPortions,
    limitingInsumoName
  };
}

/**
 * Normaliza de forma segura un registro de despensa leído/escrito desde Firestore o memoria,
 * eliminando únicamente ruido de punto flotante binario sin redondear decimales legítimos.
 */
export function normalizePerishableRecord(item: PerishableItem): PerishableItem {
  const rawQty = item.quantity ?? item.cantidadActual ?? 0;
  const rawMin = item.minStock ?? item.alertaStockMinimo ?? 0;
  const cleanQty = normalizeNonNegativeQuantity(rawQty);
  const cleanMin = normalizeNonNegativeQuantity(rawMin);

  return {
    ...item,
    quantity: cleanQty,
    minStock: cleanMin,
    ...(item.cantidadActual !== undefined ? { cantidadActual: cleanQty } : {}),
    ...(item.alertaStockMinimo !== undefined ? { alertaStockMinimo: cleanMin } : {})
  };
}

export interface SaleInventoryComputation {
  updatedPerishables: PerishableItem[];
  updatedProducts: Product[];
  deductedPerishableIds: string[];
  deductedDirectProductIds: string[];
  recipeProductIds: string[];
  lowStockAlerts: Array<{
    insumoId: string;
    nombre: string;
    remaining: number;
    minStock: number;
    isOut: boolean;
  }>;
}

/**
 * Calcula de forma determinista y exacta (sin derivas binarias ni doble descuento)
 * el nuevo estado de despensa y catálogo de productos tras vender una lista de ítems.
 */
export function computeSaleInventoryUpdates(params: {
  orderItems: Array<{ productId?: string; name?: string; quantity?: number; cantidad?: number }>;
  productsCatalog: Product[];
  perishablesList: PerishableItem[];
}): SaleInventoryComputation {
  const { orderItems, productsCatalog, perishablesList } = params;

  const directDeductionsScaled: Record<string, bigint> = {};
  const insumoDeductionsScaled: Record<string, bigint> = {};

  (orderItems || []).forEach((item) => {
    const rawQty = item.quantity ?? item.cantidad ?? 0;
    const qtyScaled = toScaledQuantity(rawQty);
    if (qtyScaled <= 0n) return;
    const qtyNum = scaledToNumber(qtyScaled);

    const prod = productsCatalog.find(
      (p) => (item.productId && p.id === item.productId) || (item.name && p.name === item.name)
    );
    if (!prod) return;

    if (prod.tipoInventario === 'receta' && Array.isArray(prod.receta) && prod.receta.length > 0) {
      prod.receta.forEach((ing) => {
        if (!ing.insumoId) return;
        const pantryItem = perishablesList.find((p) => p.id === ing.insumoId);
        const reqScaled = convertRecipeQtyToPantryScaled(
          ing.cantidad,
          ing.unidad,
          pantryItem?.unit,
          qtyNum
        );
        if (reqScaled > 0n) {
          insumoDeductionsScaled[ing.insumoId] =
            (insumoDeductionsScaled[ing.insumoId] || 0n) + reqScaled;
        }
      });
    } else {
      directDeductionsScaled[prod.id] = (directDeductionsScaled[prod.id] || 0n) + qtyScaled;
    }
  });

  const deductedPerishableIds: string[] = [];
  const lowStockAlerts: SaleInventoryComputation['lowStockAlerts'] = [];

  const updatedPerishables = perishablesList.map((rawItem) => {
    const item = normalizePerishableRecord(rawItem);
    const deductScaled = insumoDeductionsScaled[item.id];
    if (deductScaled !== undefined && deductScaled > 0n) {
      deductedPerishableIds.push(item.id);
      const currentScaled = toScaledQuantity(item.quantity);
      const remainingScaled = currentScaled > deductScaled ? currentScaled - deductScaled : 0n;
      const remaining = scaledToNumber(remainingScaled);
      const minStock = normalizeNonNegativeQuantity(item.minStock ?? item.alertaStockMinimo ?? 0);
      const minScaled = toScaledQuantity(minStock);
      const isLow = remainingScaled <= minScaled;
      const isOut = remainingScaled <= 0n;

      if (isLow || isOut) {
        lowStockAlerts.push({
          insumoId: item.id,
          nombre: item.name,
          remaining,
          minStock,
          isOut
        });
      }

      return {
        ...item,
        quantity: remaining,
        cantidadActual: remaining,
        alertaStockMinimo: minStock
      };
    }
    return item;
  });

  const deductedDirectProductIds: string[] = [];
  const recipeProductIds: string[] = [];

  const updatedProducts = productsCatalog.map((prod) => {
    if (prod.tipoInventario === 'receta' && Array.isArray(prod.receta) && prod.receta.length > 0) {
      recipeProductIds.push(prod.id);
      const { estimatedPortions } = calculateRecipeAvailability(prod.receta, updatedPerishables);
      return {
        ...prod,
        stock: estimatedPortions
      };
    }

    const deductScaled = directDeductionsScaled[prod.id];
    if (deductScaled !== undefined && deductScaled > 0n) {
      deductedDirectProductIds.push(prod.id);
      const stockScaled = toScaledQuantity(prod.stock);
      const remainingScaled = stockScaled > deductScaled ? stockScaled - deductScaled : 0n;
      return {
        ...prod,
        stock: scaledToNumber(remainingScaled)
      };
    }

    return prod;
  });

  return {
    updatedPerishables,
    updatedProducts,
    deductedPerishableIds,
    deductedDirectProductIds,
    recipeProductIds,
    lowStockAlerts
  };
}


