import {
  InsumoPresentation,
  PendingConsumptionReconciliation,
  PerishableItem,
  PerishableLot,
  Product,
  RecipeIngredient,
  UnitEquivalence
} from '../types';
import {
  addQuantities,
  multiplyScaledByRatio,
  normalizeNonNegativeQuantity,
  scaledToNumber,
  toScaledQuantity
} from './quantityPrecision';
import { getEffectiveBaseUnit } from './perishableUtils';

/**
 * Unidades y factores de conversión para recetas, escandallos y presentaciones.
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

export interface UnitConversionRatio {
  num: bigint;
  den: bigint;
}

export interface UnitConversionResolution {
  compatible: boolean;
  ratio: UnitConversionRatio;
  factor: number;
  source: 'identity' | 'standard' | 'custom_equivalence' | 'presentation' | 'incompatible';
  reason?: string;
}

const CANONICAL_UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  lb: 'libra',
  libra: 'libra',
  libras: 'libra',
  ml: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  l: 'litros',
  lt: 'litros',
  litro: 'litros',
  litros: 'litros',
  und: 'unidades',
  ud: 'unidades',
  uds: 'unidades',
  unidad: 'unidades',
  unidades: 'unidades',
  tajada: 'tajada',
  tajadas: 'tajada',
  loncha: 'tajada',
  lonchas: 'tajada',
  porcion: 'porcion',
  porción: 'porcion',
  porciones: 'porcion',
  paq: 'paquete',
  paquete: 'paquete',
  paquetes: 'paquete',
  caja: 'caja',
  cajas: 'caja',
  bolsa: 'bolsa',
  bolsas: 'bolsa',
  bloque: 'bloque',
  bloques: 'bloque',
  bandeja: 'bandeja',
  bandejas: 'bandeja',
  atado: 'atado',
  atados: 'atado',
  manojo: 'atado',
  manojos: 'atado',
  canasta: 'canasta',
  canastas: 'canasta',
  botella: 'botella',
  botellas: 'botella',
  galon: 'galon',
  galón: 'galon',
  galones: 'galon',
  saco: 'saco',
  sacos: 'saco',
  bulto: 'bulto',
  bultos: 'bulto',
  cda: 'cucharada',
  cdas: 'cucharada',
  cucharada: 'cucharada',
  cucharadas: 'cucharada',
  cdta: 'cucharadita',
  cdtas: 'cucharadita',
  cucharadita: 'cucharadita',
  cucharaditas: 'cucharadita',
  taza: 'taza',
  tazas: 'taza',
  oz: 'onza',
  onza: 'onza',
  onzas: 'onza'
};

export function normalizeCanonicalUnit(unit?: string | null): string {
  if (!unit) return '';
  const clean = unit.toLowerCase().trim();
  return CANONICAL_UNIT_ALIASES[clean] || clean;
}

/**
 * Normaliza una unidad dada para asignar el valor por defecto en el selector de receta
 */
export function normalizeToRecipeUnit(unit?: string): string {
  if (!unit) return 'und';
  const canon = normalizeCanonicalUnit(unit);
  if (canon === 'g') return 'gramos';
  if (canon === 'kg') return 'kilo';
  if (canon === 'libra') return 'libra';
  if (canon === 'tajada') return 'tajada';
  if (canon === 'ml') return 'ml';
  if (canon === 'litros') return 'litros';
  if (canon === 'unidades') return 'und';
  return unit.trim().toLowerCase();
}

const MASS_GRAMS: Record<string, bigint> = {
  g: 1n,
  libra: 500n,
  kg: 1000n
};

const VOLUME_ML: Record<string, bigint> = {
  ml: 1n,
  litros: 1000n
};

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0n ? 1n : x;
}

function reduceRatio(num: bigint, den: bigint): UnitConversionRatio {
  if (den === 0n) return { num: 0n, den: 1n };
  if (num === 0n) return { num: 0n, den: 1n };
  const g = gcdBigInt(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Conversión estándar entre magnitudes físicas exactas (masa: g/libra/kg, volumen: ml/litros, o identidad).
 * Retorna null si las unidades pertenecen a dimensiones distintas o no tienen equivalencia estándar.
 */
export function getStandardConversionRatio(fromUnit?: string, toUnit?: string): UnitConversionRatio | null {
  const fromCanon = normalizeCanonicalUnit(fromUnit);
  const toCanon = normalizeCanonicalUnit(toUnit);
  if (!fromCanon || !toCanon) return null;
  if (fromCanon === toCanon) return { num: 1n, den: 1n };

  if (MASS_GRAMS[fromCanon] && MASS_GRAMS[toCanon]) {
    return reduceRatio(MASS_GRAMS[fromCanon], MASS_GRAMS[toCanon]);
  }

  if (VOLUME_ML[fromCanon] && VOLUME_ML[toCanon]) {
    return reduceRatio(VOLUME_ML[fromCanon], VOLUME_ML[toCanon]);
  }

  return null;
}

/**
 * Resuelve de manera explícita la conversión entre cualquier unidad de origen (receta o presentación)
 * y la unidad destino (unidad base de inventario o unidad secundaria), considerando:
 * 1) Identidad exacta
 * 2) Conversiones estándar (kg/g/libra, litros/ml)
 * 3) Equivalencias personalizadas del ingrediente (ej. 1 tajada = 25 g, 1 porción = 30 ml)
 * 4) Presentaciones del ingrediente (solo si no existe ambigüedad entre múltiples empaques distintos)
 *
 * Nunca realiza conversiones 1:1 silenciosas para unidades incompatibles.
 */
export function resolveUnitConversion(params: {
  fromUnit?: string;
  toUnit?: string;
  pantryItem?: Pick<PerishableItem, 'unit' | 'baseUnit' | 'equivalences' | 'presentations'> | null;
  equivalences?: UnitEquivalence[];
  presentations?: InsumoPresentation[];
}): UnitConversionResolution {
  const { fromUnit, toUnit, pantryItem } = params;
  const fromCanon = normalizeCanonicalUnit(fromUnit);
  const toCanon = normalizeCanonicalUnit(toUnit);

  if (!fromCanon || !toCanon) {
    return {
      compatible: false,
      ratio: { num: 0n, den: 1n },
      factor: 0,
      source: 'incompatible',
      reason: 'Falta unidad de origen o unidad base de inventario.'
    };
  }

  if (fromCanon === toCanon) {
    return {
      compatible: true,
      ratio: { num: 1n, den: 1n },
      factor: 1,
      source: 'identity'
    };
  }

  const std = getStandardConversionRatio(fromCanon, toCanon);
  if (std) {
    return {
      compatible: true,
      ratio: std,
      factor: Number(std.num) / Number(std.den),
      source: 'standard'
    };
  }

  const equivalences = params.equivalences ?? pantryItem?.equivalences ?? [];
  const baseUnitFallback = getEffectiveBaseUnit(pantryItem) || toUnit || 'unidades';

  // Equivalencia directa: 1 [eq.unit] = qty [eq.baseUnitLabel || baseUnit]
  for (const eq of equivalences) {
    const eqUnitCanon = normalizeCanonicalUnit(eq.unit);
    const qtyScaled = toScaledQuantity(eq.quantityInBaseUnit);
    if (!eqUnitCanon || qtyScaled <= 0n) continue;

    const eqTargetUnit = eq.baseUnitLabel || baseUnitFallback;
    const eqTargetCanon = normalizeCanonicalUnit(eqTargetUnit);

    // Forward: fromUnit === eq.unit, convertir eqTarget -> toUnit
    if (eqUnitCanon === fromCanon) {
      const tailRatio = getStandardConversionRatio(eqTargetCanon, toCanon);
      if (tailRatio) {
        const combined = reduceRatio(qtyScaled * tailRatio.num, 1_000_000n * tailRatio.den);
        return {
          compatible: true,
          ratio: combined,
          factor: Number(combined.num) / Number(combined.den),
          source: 'custom_equivalence'
        };
      }
    }

    // Reverse: toUnit === eq.unit, convertir fromUnit -> eqTarget y dividir por qty
    if (eqUnitCanon === toCanon) {
      const headRatio = getStandardConversionRatio(fromCanon, eqTargetCanon);
      if (headRatio) {
        const combined = reduceRatio(1_000_000n * headRatio.num, qtyScaled * headRatio.den);
        return {
          compatible: true,
          ratio: combined,
          factor: Number(combined.num) / Number(combined.den),
          source: 'custom_equivalence'
        };
      }
    }
  }

  // Equivalencia en dos pasos usando una equivalencia intermedia sobre una base común
  // Ej: baseUnit='kg', eq1: '1 bloque = 2.5 kg', eq2: '1 tajada = 25 g' => convertir 'tajada' -> 'bloque'
  for (const eqFrom of equivalences) {
    if (normalizeCanonicalUnit(eqFrom.unit) !== fromCanon) continue;
    const fromQtyScaled = toScaledQuantity(eqFrom.quantityInBaseUnit);
    if (fromQtyScaled <= 0n) continue;
    const fromTarget = normalizeCanonicalUnit(eqFrom.baseUnitLabel || baseUnitFallback);

    for (const eqTo of equivalences) {
      if (normalizeCanonicalUnit(eqTo.unit) !== toCanon) continue;
      const toQtyScaled = toScaledQuantity(eqTo.quantityInBaseUnit);
      if (toQtyScaled <= 0n) continue;
      const toTarget = normalizeCanonicalUnit(eqTo.baseUnitLabel || baseUnitFallback);

      const bridgeRatio = getStandardConversionRatio(fromTarget, toTarget);
      if (bridgeRatio) {
        const combined = reduceRatio(fromQtyScaled * bridgeRatio.num, toQtyScaled * bridgeRatio.den);
        return {
          compatible: true,
          ratio: combined,
          factor: Number(combined.num) / Number(combined.den),
          source: 'custom_equivalence'
        };
      }
    }
  }

  // Presentaciones del insumo (solo si no existe ambigüedad entre múltiples presentaciones)
  const presentations = (params.presentations ?? pantryItem?.presentations ?? []).filter(
    (p) => p.active !== false
  );
  if (presentations.length > 0) {
    const rawFromLower = (fromUnit || '').trim().toLowerCase();
    const matchingPres = presentations.filter((p) => {
      const packCanon = normalizeCanonicalUnit(p.packagingType);
      const nameLower = (p.name || '').trim().toLowerCase();
      return packCanon === fromCanon || (nameLower && nameLower === rawFromLower);
    });

    if (matchingPres.length > 0) {
      const resolvedRatios: UnitConversionRatio[] = [];
      let allCompatible = true;

      for (const pres of matchingPres) {
        const contentScaled = toScaledQuantity(pres.contentQty);
        if (contentScaled <= 0n) {
          allCompatible = false;
          break;
        }
        const tail = getStandardConversionRatio(pres.contentUnit, toCanon);
        if (!tail) {
          allCompatible = false;
          break;
        }
        resolvedRatios.push(reduceRatio(contentScaled * tail.num, 1_000_000n * tail.den));
      }

      if (allCompatible && resolvedRatios.length > 0) {
        const first = resolvedRatios[0];
        const allIdentical = resolvedRatios.every((r) => r.num === first.num && r.den === first.den);
        if (allIdentical) {
          return {
            compatible: true,
            ratio: first,
            factor: Number(first.num) / Number(first.den),
            source: 'presentation'
          };
        }
        return {
          compatible: false,
          ratio: { num: 0n, den: 1n },
          factor: 0,
          source: 'incompatible',
          reason: `Hay múltiples presentaciones de "${fromUnit}" con distinto contenido; especifica la presentación exacta o configura una equivalencia.`
        };
      }
    }
  }

  return {
    compatible: false,
    ratio: { num: 0n, den: 1n },
    factor: 0,
    source: 'incompatible',
    reason: `No hay conversión definida de "${fromUnit}" a "${toUnit}". Configura una equivalencia en Despensa.`
  };
}

/**
 * Wrapper para obtener la razón racional entre unidad de receta y unidad base de inventario.
 * Si no existe conversión válida ni equivalencia configurada, retorna { num: 0n, den: 1n } en vez de 1:1 silencioso.
 */
export function getUnitConversionRatio(
  recipeUnit?: string,
  pantryUnitOrItem?: string | Pick<PerishableItem, 'unit' | 'baseUnit' | 'equivalences' | 'presentations'>
): UnitConversionRatio {
  const pantryItem = typeof pantryUnitOrItem === 'object' ? pantryUnitOrItem : undefined;
  const toUnit = typeof pantryUnitOrItem === 'string' ? pantryUnitOrItem : getEffectiveBaseUnit(pantryItem);
  const res = resolveUnitConversion({
    fromUnit: recipeUnit,
    toUnit,
    pantryItem
  });
  return res.compatible ? res.ratio : { num: 0n, den: 1n };
}

export function getUnitConversionFactor(
  recipeUnit?: string,
  pantryUnitOrItem?: string | Pick<PerishableItem, 'unit' | 'baseUnit' | 'equivalences' | 'presentations'>
): number {
  const pantryItem = typeof pantryUnitOrItem === 'object' ? pantryUnitOrItem : undefined;
  const toUnit = typeof pantryUnitOrItem === 'string' ? pantryUnitOrItem : getEffectiveBaseUnit(pantryItem);
  const res = resolveUnitConversion({
    fromUnit: recipeUnit,
    toUnit,
    pantryItem
  });
  return res.compatible ? res.factor : 0;
}

/**
 * Convierte una cantidad expresada en una presentación comercial a la unidad base del insumo.
 */
export function convertPresentationQtyToBaseScaled(params: {
  presentationQty: number | string;
  contentQty: number | string;
  contentUnit: string;
  baseUnit: string;
  equivalences?: UnitEquivalence[];
}): {
  compatible: boolean;
  baseQtyScaled: bigint;
  baseQty: number;
  reason?: string;
} {
  const presQtyScaled = toScaledQuantity(params.presentationQty);
  const contentScaled = toScaledQuantity(params.contentQty);
  if (presQtyScaled <= 0n || contentScaled <= 0n) {
    return { compatible: true, baseQtyScaled: 0n, baseQty: 0 };
  }

  const res = resolveUnitConversion({
    fromUnit: params.contentUnit,
    toUnit: params.baseUnit,
    equivalences: params.equivalences
  });

  if (!res.compatible) {
    return {
      compatible: false,
      baseQtyScaled: 0n,
      baseQty: 0,
      reason: res.reason
    };
  }

  // (presQtyScaled * contentScaled / 10^6) * (num / den)
  const totalScaled = multiplyScaledByRatio(
    presQtyScaled * contentScaled,
    res.ratio.num,
    res.ratio.den * 1_000_000n
  );

  return {
    compatible: true,
    baseQtyScaled: totalScaled,
    baseQty: scaledToNumber(totalScaled)
  };
}

/**
 * Devuelve las unidades seleccionables en recetas para un insumo específico,
 * incluyendo las unidades estándar más las equivalencias configuradas del insumo.
 */
export function getAvailableUnitsForPerishable(
  item?: Pick<PerishableItem, 'unit' | 'baseUnit' | 'equivalences'> | null
): Array<{ value: string; label: string; isCustomEquivalence?: boolean }> {
  const baseList: Array<{ value: string; label: string; isCustomEquivalence?: boolean }> =
    RECIPE_UNIT_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label
    }));

  if (!item?.equivalences?.length) return baseList;

  const seenCanon = new Set(baseList.map((o) => normalizeCanonicalUnit(o.value)));
  for (const eq of item.equivalences) {
    const raw = (eq.unit || '').trim();
    const canon = normalizeCanonicalUnit(raw);
    if (!raw) continue;
    const eqLabel = `1 ${raw} = ${eq.quantityInBaseUnit} ${eq.baseUnitLabel || getEffectiveBaseUnit(item)}`;
    if (seenCanon.has(canon)) {
      const idx = baseList.findIndex((o) => normalizeCanonicalUnit(o.value) === canon);
      if (idx >= 0) {
        baseList[idx] = {
          ...baseList[idx],
          label: `${baseList[idx].value} (${eqLabel})`,
          isCustomEquivalence: true
        };
      }
    } else {
      seenCanon.add(canon);
      baseList.push({
        value: raw.toLowerCase(),
        label: `${raw} (${eqLabel})`,
        isCustomEquivalence: true
      });
    }
  }

  return baseList;
}

/**
 * Convierte una cantidad de receta (opcionalmente multiplicada por cantidad vendida)
 * a micro-unidades enteras escaladas en la unidad base de Despensa.
 * Si la conversión es incompatible, retorna 0n para evitar descuentos 1:1 erróneos.
 */
export function convertRecipeQtyToPantryScaled(
  recipeQty: number | string | null | undefined,
  recipeUnit?: string,
  pantryUnitOrItem?: string | PerishableItem,
  soldQty: number | string = 1
): bigint {
  const baseScaled = toScaledQuantity(recipeQty);
  const multScaled = toScaledQuantity(soldQty);
  if (baseScaled <= 0n || multScaled <= 0n) return 0n;

  const pantryItem = typeof pantryUnitOrItem === 'object' ? pantryUnitOrItem : undefined;
  const toUnit = typeof pantryUnitOrItem === 'string' ? pantryUnitOrItem : getEffectiveBaseUnit(pantryItem);

  const res = resolveUnitConversion({
    fromUnit: recipeUnit,
    toUnit,
    pantryItem
  });

  if (!res.compatible) return 0n;

  const totalProductScaled = multiplyScaledByRatio(
    baseScaled * multScaled,
    res.ratio.num,
    res.ratio.den * 1_000_000n
  );
  return totalProductScaled > 0n ? totalProductScaled : 0n;
}

/**
 * Convierte una cantidad de receta a la unidad base de despensa usando aritmética BigInt exacta.
 */
export function convertRecipeQtyToPantry(
  recipeQty: number | string | null | undefined,
  recipeUnit?: string,
  pantryUnitOrItem?: string | PerishableItem,
  soldQty: number | string = 1
): number {
  return scaledToNumber(convertRecipeQtyToPantryScaled(recipeQty, recipeUnit, pantryUnitOrItem, soldQty));
}

/**
 * Calcula las porciones disponibles enteras para un ingrediente en despensa.
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
 * Calcula porciones estimadas totales de una receta completa y detecta unidades sin equivalencia.
 */
export function calculateRecipeAvailability(
  receta: RecipeIngredient[] | undefined,
  perishables: PerishableItem[]
): {
  estimatedPortions: number;
  limitingInsumoName: string;
  hasIncompatibleUnits: boolean;
  incompatibleInsumos: string[];
} {
  if (!Array.isArray(receta) || receta.length === 0) {
    return {
      estimatedPortions: 0,
      limitingInsumoName: '',
      hasIncompatibleUnits: false,
      incompatibleInsumos: []
    };
  }

  let minPortions = Infinity;
  let limitingInsumoName = '';
  const incompatibleInsumos: string[] = [];

  for (const ing of receta) {
    const found = perishables.find((p) => p.id === ing.insumoId);
    if (!found) {
      minPortions = 0;
      limitingInsumoName = ing.nombre || '';
      continue;
    }

    const res = resolveUnitConversion({
      fromUnit: ing.unidad,
      toUnit: getEffectiveBaseUnit(found),
      pantryItem: found
    });

    if (!res.compatible) {
      incompatibleInsumos.push(found.name || ing.nombre);
      continue;
    }

    const availScaled = toScaledQuantity(found.quantity ?? found.cantidadActual ?? 0);
    const reqScaled = convertRecipeQtyToPantryScaled(ing.cantidad, ing.unidad, found, 1);
    const portions = availScaled > 0n && reqScaled > 0n ? Number(availScaled / reqScaled) : 0;
    if (portions < minPortions) {
      minPortions = portions;
      limitingInsumoName = found.name || ing.nombre || '';
    }
  }

  return {
    estimatedPortions: minPortions === Infinity ? 0 : minPortions,
    limitingInsumoName,
    hasIncompatibleUnits: incompatibleInsumos.length > 0,
    incompatibleInsumos
  };
}

export function sortLotsFEFO(lots: PerishableLot[]): PerishableLot[] {
  return [...lots].sort((a, b) => {
    const expCmp = (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31');
    if (expCmp !== 0) return expCmp;
    const entryCmp = (a.entryDate || '').localeCompare(b.entryDate || '');
    if (entryCmp !== 0) return entryCmp;
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Consume una cantidad en unidad base aplicando lógica FEFO (primero en vencer, primero en salir)
 * sobre los lotes de un insumo, manteniendo quantity === suma(lots.quantity).
 */
export function deductFromLotsFEFO(
  item: PerishableItem,
  deductQty: number
): {
  remainingQuantity: number;
  updatedLots: PerishableLot[] | undefined;
  nextExpiryDate: string;
} {
  const cleanDeductScaled = toScaledQuantity(deductQty);
  const currentTotalScaled = toScaledQuantity(item.quantity ?? item.cantidadActual ?? 0);

  if (!Array.isArray(item.lots) || item.lots.length === 0) {
    const remScaled = currentTotalScaled > cleanDeductScaled ? currentTotalScaled - cleanDeductScaled : 0n;
    return {
      remainingQuantity: scaledToNumber(remScaled),
      updatedLots: item.lots,
      nextExpiryDate: item.expiryDate
    };
  }

  let remainingToDeduct = cleanDeductScaled;
  const sorted = sortLotsFEFO(item.lots);
  const nextLots: PerishableLot[] = [];

  for (const lot of sorted) {
    const lotScaled = toScaledQuantity(lot.quantity);
    if (lotScaled <= 0n) continue;

    if (remainingToDeduct <= 0n) {
      nextLots.push({ ...lot, quantity: scaledToNumber(lotScaled) });
      continue;
    }

    if (lotScaled <= remainingToDeduct) {
      remainingToDeduct -= lotScaled;
      // Lote consumido por completo (se omite de lotes activos para evitar crecimiento ilimitado)
    } else {
      const remLot = lotScaled - remainingToDeduct;
      remainingToDeduct = 0n;
      nextLots.push({ ...lot, quantity: scaledToNumber(remLot) });
    }
  }

  let sumScaled = 0n;
  for (const l of nextLots) {
    sumScaled += toScaledQuantity(l.quantity);
  }

  const nextExpiry = nextLots.length > 0 ? sortLotsFEFO(nextLots)[0].expiryDate : item.expiryDate;

  return {
    remainingQuantity: scaledToNumber(sumScaled),
    updatedLots: nextLots,
    nextExpiryDate: nextExpiry
  };
}

/**
 * Agrega un nuevo lote a un insumo manteniendo invariante: quantity === suma(lots.quantity).
 */
export function addLotToPerishable(
  item: PerishableItem,
  newLot: PerishableLot
): {
  totalQuantity: number;
  updatedLots: PerishableLot[];
  nextExpiryDate: string;
} {
  const cleanNewQty = normalizeNonNegativeQuantity(newLot.quantity);
  const prevTotal = normalizeNonNegativeQuantity(item.quantity ?? item.cantidadActual ?? 0);

  let baseLots: PerishableLot[] = Array.isArray(item.lots) ? [...item.lots] : [];
  if (baseLots.length === 0 && prevTotal > 0) {
    baseLots = [
      {
        id: `lot-init-${item.id}`,
        batchNumber: item.batchNumber || 'INICIAL',
        quantity: prevTotal,
        entryDate: item.entryDate,
        expiryDate: item.expiryDate,
        supplierId: item.supplierId,
        unitCost: item.costPerUnit
      }
    ];
  }

  if (cleanNewQty > 0) {
    baseLots.push({
      ...newLot,
      quantity: cleanNewQty
    });
  }

  const sorted = sortLotsFEFO(baseLots.filter((l) => toScaledQuantity(l.quantity) > 0n));
  let sumScaled = 0n;
  for (const l of sorted) {
    sumScaled += toScaledQuantity(l.quantity);
  }

  return {
    totalQuantity: scaledToNumber(sumScaled),
    updatedLots: sorted,
    nextExpiryDate: sorted.length > 0 ? sorted[0].expiryDate : (newLot.expiryDate || item.expiryDate)
  };
}

/**
 * Normaliza de forma segura un registro de despensa leído/escrito desde Firestore o memoria,
 * preservando coherencia entre unit/baseUnit y lots.
 */
export function normalizePerishableRecord(item: PerishableItem): PerishableItem {
  const rawQty = item.quantity ?? item.cantidadActual ?? 0;
  const rawMin = item.minStock ?? item.alertaStockMinimo ?? 0;
  const cleanMin = normalizeNonNegativeQuantity(rawMin);
  const resolvedBaseUnit = item.baseUnit || item.unit;

  let cleanQty = normalizeNonNegativeQuantity(rawQty);
  let normalizedLots = item.lots;

  if (Array.isArray(item.lots) && item.lots.length > 0) {
    const activeLots = sortLotsFEFO(
      item.lots
        .map((l) => ({ ...l, quantity: normalizeNonNegativeQuantity(l.quantity) }))
        .filter((l) => toScaledQuantity(l.quantity) > 0n)
    );
    if (activeLots.length > 0) {
      let sumScaled = 0n;
      for (const l of activeLots) sumScaled += toScaledQuantity(l.quantity);
      cleanQty = scaledToNumber(sumScaled);
      normalizedLots = activeLots;
    } else {
      normalizedLots = [];
      cleanQty = normalizeNonNegativeQuantity(rawQty);
    }
  }

  return {
    ...item,
    unit: resolvedBaseUnit,
    baseUnit: resolvedBaseUnit,
    quantity: cleanQty,
    minStock: cleanMin,
    ...(normalizedLots !== undefined ? { lots: normalizedLots } : {}),
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
  pendingReconciliations: PendingConsumptionReconciliation[];
  reconciledPerishableIds: string[];
  orderItemInventoryStatuses: Record<string, 'deducted' | 'pending_reconciliation' | 'partial' | 'not_applicable'>;
  lowStockAlerts: Array<{
    insumoId: string;
    nombre: string;
    remaining: number;
    minStock: number;
    isOut: boolean;
  }>;
}

/**
 * Calcula de forma determinista y exacta (sin derivas binarias, sin descuento 1:1 silencioso,
 * y con consumo FEFO por lotes) el nuevo estado de despensa, conciliaciones pendientes y catálogo.
 */
export function computeSaleInventoryUpdates(params: {
  orderItems: Array<{ id?: string; productId?: string; name?: string; quantity?: number; cantidad?: number }>;
  productsCatalog: Product[];
  perishablesList: PerishableItem[];
  saleId?: string;
  paymentId?: string;
  nowIso?: string;
}): SaleInventoryComputation {
  const {
    orderItems,
    productsCatalog,
    perishablesList,
    saleId = `sale-${Date.now()}`,
    paymentId,
    nowIso = new Date().toISOString()
  } = params;

  const directDeductionsScaled: Record<string, bigint> = {};
  const insumoDeductionsScaled: Record<string, bigint> = {};
  const pendingReconciliations: PendingConsumptionReconciliation[] = [];
  const pendingByInsumoId: Record<string, PendingConsumptionReconciliation[]> = {};
  const orderItemInventoryStatuses: SaleInventoryComputation['orderItemInventoryStatuses'] = {};

  (orderItems || []).forEach((item, idx) => {
    const itemKey = item.id || `line-${idx}`;
    const rawQty = item.quantity ?? item.cantidad ?? 0;
    const qtyScaled = toScaledQuantity(rawQty);
    if (qtyScaled <= 0n) {
      orderItemInventoryStatuses[itemKey] = 'not_applicable';
      return;
    }
    const qtyNum = scaledToNumber(qtyScaled);

    const prod = productsCatalog.find(
      (p) => (item.productId && p.id === item.productId) || (item.name && p.name === item.name)
    );
    if (!prod) {
      orderItemInventoryStatuses[itemKey] = 'not_applicable';
      return;
    }

    if (prod.tipoInventario === 'receta' && Array.isArray(prod.receta) && prod.receta.length > 0) {
      let deductedCount = 0;
      let pendingCount = 0;

      prod.receta.forEach((ing) => {
        if (!ing.insumoId) return;
        const pantryItem = perishablesList.find((p) => p.id === ing.insumoId);
        if (!pantryItem) {
          pendingCount++;
          const rec: PendingConsumptionReconciliation = {
            id: `rec-${saleId}-${itemKey}-${ing.insumoId}`,
            saleId,
            ...(paymentId ? { paymentId } : {}),
            ...(item.id ? { orderItemId: item.id } : {}),
            productId: prod.id,
            productName: prod.name,
            soldQty: qtyNum,
            recipeQty: ing.cantidad,
            recipeUnit: ing.unidad,
            insumoId: ing.insumoId,
            insumoName: ing.nombre,
            createdAt: nowIso,
            status: 'pending',
            note: 'Insumo eliminado o no encontrado en Despensa al momento de la venta.'
          };
          pendingReconciliations.push(rec);
          return;
        }

        const conv = resolveUnitConversion({
          fromUnit: ing.unidad,
          toUnit: getEffectiveBaseUnit(pantryItem),
          pantryItem
        });

        if (!conv.compatible) {
          pendingCount++;
          const rec: PendingConsumptionReconciliation = {
            id: `rec-${saleId}-${itemKey}-${ing.insumoId}`,
            saleId,
            ...(paymentId ? { paymentId } : {}),
            ...(item.id ? { orderItemId: item.id } : {}),
            productId: prod.id,
            productName: prod.name,
            soldQty: qtyNum,
            recipeQty: ing.cantidad,
            recipeUnit: ing.unidad,
            insumoId: ing.insumoId,
            insumoName: pantryItem.name || ing.nombre,
            createdAt: nowIso,
            status: 'pending',
            note: conv.reason || `Falta equivalencia de ${ing.unidad} a ${getEffectiveBaseUnit(pantryItem)}.`
          };
          pendingReconciliations.push(rec);
          pendingByInsumoId[ing.insumoId] = pendingByInsumoId[ing.insumoId] || [];
          pendingByInsumoId[ing.insumoId].push(rec);
          return;
        }

        const reqScaled = convertRecipeQtyToPantryScaled(ing.cantidad, ing.unidad, pantryItem, qtyNum);
        if (reqScaled > 0n) {
          deductedCount++;
          insumoDeductionsScaled[ing.insumoId] =
            (insumoDeductionsScaled[ing.insumoId] || 0n) + reqScaled;
        }
      });

      orderItemInventoryStatuses[itemKey] =
        pendingCount === 0
          ? 'deducted'
          : deductedCount === 0
          ? 'pending_reconciliation'
          : 'partial';
    } else {
      directDeductionsScaled[prod.id] = (directDeductionsScaled[prod.id] || 0n) + qtyScaled;
      orderItemInventoryStatuses[itemKey] = 'deducted';
    }
  });

  const deductedPerishableIds: string[] = [];
  const reconciledPerishableIds: string[] = [];
  const lowStockAlerts: SaleInventoryComputation['lowStockAlerts'] = [];

  const updatedPerishables = perishablesList.map((rawItem) => {
    const item = normalizePerishableRecord(rawItem);
    const deductScaled = insumoDeductionsScaled[item.id];
    const newPendingForItem = pendingByInsumoId[item.id];

    let workingItem = item;

    if (newPendingForItem && newPendingForItem.length > 0) {
      reconciledPerishableIds.push(item.id);
      const existingPending = Array.isArray(item.pendingReconciliations) ? item.pendingReconciliations : [];
      const existingIds = new Set(existingPending.map((r) => r.id));
      const mergedPending = [
        ...existingPending,
        ...newPendingForItem.filter((r) => !existingIds.has(r.id))
      ].slice(-50); // acotado para no inflar el doc
      workingItem = {
        ...workingItem,
        pendingReconciliations: mergedPending
      };
    }

    if (deductScaled !== undefined && deductScaled > 0n) {
      deductedPerishableIds.push(item.id);
      const deductQty = scaledToNumber(deductScaled);
      const fefo = deductFromLotsFEFO(workingItem, deductQty);
      const remaining = fefo.remainingQuantity;
      const minStock = normalizeNonNegativeQuantity(item.minStock ?? item.alertaStockMinimo ?? 0);
      const remainingScaled = toScaledQuantity(remaining);
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
        ...workingItem,
        quantity: remaining,
        cantidadActual: remaining,
        alertaStockMinimo: minStock,
        expiryDate: fefo.nextExpiryDate,
        ...(fefo.updatedLots !== undefined ? { lots: fefo.updatedLots } : {})
      };
    }

    return workingItem;
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
    pendingReconciliations,
    reconciledPerishableIds,
    orderItemInventoryStatuses,
    lowStockAlerts
  };
}

export function resolveSinglePendingReconciliation(params: {
  item: PerishableItem;
  reconciliationId: string;
  nowIso?: string;
}): {
  resolved: boolean;
  updatedItem: PerishableItem;
  deductedBaseQty: number;
  error?: string;
} {
  const { item, reconciliationId, nowIso = new Date().toISOString() } = params;
  const list = Array.isArray(item.pendingReconciliations) ? item.pendingReconciliations : [];
  const target = list.find((r) => r.id === reconciliationId);
  if (!target) {
    return { resolved: false, updatedItem: item, deductedBaseQty: 0, error: 'Conciliación no encontrada.' };
  }
  if (target.status === 'resolved') {
    return { resolved: true, updatedItem: item, deductedBaseQty: target.deductedBaseQty || 0 };
  }

  const baseUnit = getEffectiveBaseUnit(item);
  const conv = resolveUnitConversion({
    fromUnit: target.recipeUnit,
    toUnit: baseUnit,
    pantryItem: item
  });
  if (!conv.compatible) {
    return {
      resolved: false,
      updatedItem: item,
      deductedBaseQty: 0,
      error: conv.reason || `Todavía falta equivalencia de ${target.recipeUnit} a ${baseUnit}.`
    };
  }

  const deductScaled = convertRecipeQtyToPantryScaled(
    target.recipeQty,
    target.recipeUnit,
    item,
    target.soldQty
  );
  const deductQty = scaledToNumber(deductScaled);
  const fefo = deductFromLotsFEFO(item, deductQty);

  const nextReconciliations = list.map((r) =>
    r.id === reconciliationId
      ? {
          ...r,
          status: 'resolved' as const,
          resolvedAt: nowIso,
          deductedBaseQty: deductQty
        }
      : r
  );

  const updatedItem = normalizePerishableRecord({
    ...item,
    quantity: fefo.remainingQuantity,
    cantidadActual: fefo.remainingQuantity,
    expiryDate: fefo.nextExpiryDate,
    ...(fefo.updatedLots !== undefined ? { lots: fefo.updatedLots } : {}),
    pendingReconciliations: nextReconciliations
  });

  return {
    resolved: true,
    updatedItem,
    deductedBaseQty: deductQty
  };
}
