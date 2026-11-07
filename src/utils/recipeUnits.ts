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

/**
 * Calcula el factor de conversión multiplicador entre la unidad usada en la receta
 * y la unidad base almacenada en la Despensa.
 * Multiplicando: `cantidadEnReceta * factor = cantidadEnUnidadDeDespensa`
 */
export function getUnitConversionFactor(recipeUnit?: string, pantryUnit?: string): number {
  if (!recipeUnit || !pantryUnit) return 1;
  const ru = recipeUnit.toLowerCase().trim();
  const pu = pantryUnit.toLowerCase().trim();

  if (ru === pu) return 1;

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
    if (isRecipeGram) return 0.001; // 1 gramo = 0.001 kg
    if (isRecipeLibra) return 0.5;   // 1 libra = 0.5 kg (500g)
    if (isRecipeKilo) return 1;
  }

  // Despensa en Gramos
  if (isPantryGram) {
    if (isRecipeKilo) return 1000;  // 1 kilo = 1000 g
    if (isRecipeLibra) return 500;  // 1 libra = 500 g
    if (isRecipeGram) return 1;
  }

  // Despensa en Libras
  if (isPantryLibra) {
    if (isRecipeGram) return 0.002; // 1g = 1/500 libra
    if (isRecipeKilo) return 2;     // 1kg = 2 libras
    if (isRecipeLibra) return 1;
  }

  // Despensa en Litros
  if (isPantryLitro) {
    if (isRecipeMl) return 0.001;
    if (isRecipeLitro) return 1;
  }

  // Despensa en ML
  if (isPantryMl) {
    if (isRecipeLitro) return 1000;
    if (isRecipeMl) return 1;
  }

  // Unidades y Tajadas equivalentes 1:1
  if ((isPantryUnd && isRecipeTajada) || (isPantryTajada && isRecipeUnd)) {
    return 1;
  }

  return 1;
}
