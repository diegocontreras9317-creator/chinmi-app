/**
 * Motor de aritmética decimal exacta basado en micro-unidades enteras escaladas (escala 10^6)
 * para eliminar errores de punto flotante binario (IEEE 754) en inventarios, despensa y recetas.
 *
 * Ejemplos resueltos:
 * - 4 kg - 0.150 kg = 3.85 kg (exacto)
 * - 3.85 kg - 0.150 kg = 3.7 kg (exacto, sin 3.6999999999999997)
 * - 4.88 kg - 0.020 kg = 4.86 kg (exacto, sin 4.860000000000001)
 * - 4 kg - 0.075 kg = 3.925 kg (preserva 75 g sin truncar a .toFixed(2))
 * - 0.005 kg (5 g) preservado íntegramente tanto en cálculo como en visualización
 */

export const QUANTITY_DECIMALS = 6;
export const QUANTITY_SCALE = 1_000_000;
const QUANTITY_SCALE_BIG = 1_000_000n;

/**
 * Convierte cualquier valor numérico o string decimal a entero escalado en micro-unidades (1 = 1_000_000n).
 * Limpia el ruido binario IEEE 754 (e.g. 3.9499999999999997 -> 3_950_000n) redondeando a 9 decimales previos
 * al escalado half-up de 6 decimales.
 */
export function toScaledQuantity(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;

  let decimalStr: string;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return 0n;
    if (Math.abs(value) >= 1e12) {
      // Fallback seguro para números extremadamente grandes fuera de rango estándar de inventario
      return BigInt(Math.round(value)) * QUANTITY_SCALE_BIG;
    }
    // Redondear a 9 decimales elimina el ruido binario (~1e-13..1e-16) preservando hasta 1e-9
    decimalStr = value.toFixed(9);
  } else {
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return 0n;

    // Si trae notación científica (e.g., "5e-3"), convertir de forma segura vía Number
    if (/[eE]/.test(cleaned)) {
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? toScaledQuantity(parsed) : 0n;
    }

    const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(cleaned);
    if (!match) {
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? toScaledQuantity(parsed) : 0n;
    }

    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2] || '0';
    const fracPart = match[3] || '';
    decimalStr = `${sign}${intPart}.${fracPart}`;
  }

  const normalizedMatch = /^(-)?(\d+)(?:\.(\d*))?$/.exec(decimalStr);
  if (!normalizedMatch) return 0n;

  const isNegative = Boolean(normalizedMatch[1]);
  const wholeDigits = normalizedMatch[2];
  const fracDigits = normalizedMatch[3] || '';

  const paddedFrac = fracDigits.padEnd(QUANTITY_DECIMALS + 1, '0');
  const significantFrac = paddedFrac.slice(0, QUANTITY_DECIMALS);
  const roundingDigit = Number(paddedFrac[QUANTITY_DECIMALS] || '0');

  let scaled = BigInt(wholeDigits) * QUANTITY_SCALE_BIG + BigInt(significantFrac);
  if (roundingDigit >= 5) {
    scaled += 1n;
  }

  return isNegative && scaled !== 0n ? -scaled : scaled;
}

/**
 * Convierte un entero escalado en micro-unidades a su representación de cadena decimal limpia,
 * sin ceros decimales innecesarios ni notación científica.
 */
export function scaledToDecimalString(scaled: bigint): string {
  if (scaled === 0n) return '0';

  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const whole = abs / QUANTITY_SCALE_BIG;
  const frac = abs % QUANTITY_SCALE_BIG;

  if (frac === 0n) {
    return `${isNegative ? '-' : ''}${whole.toString()}`;
  }

  const fracStr = frac.toString().padStart(QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  return `${isNegative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

/**
 * Convierte un entero escalado en micro-unidades al número JavaScript exacto más cercano.
 */
export function scaledToNumber(scaled: bigint): number {
  if (scaled === 0n) return 0;
  return Number(scaledToDecimalString(scaled));
}

/**
 * Normaliza un número de cantidad eliminando artefactos de punto flotante binario
 * sin truncar decimales legítimos (como 0.075 o 0.005).
 */
export function normalizeQuantity(value: number | string | null | undefined): number {
  return scaledToNumber(toScaledQuantity(value));
}

/**
 * Normaliza una cantidad asegurando que no sea negativa (para stocks y existencias).
 */
export function normalizeNonNegativeQuantity(value: number | string | null | undefined): number {
  const scaled = toScaledQuantity(value);
  return scaled > 0n ? scaledToNumber(scaled) : 0;
}

/**
 * Parsea texto de un input numérico (soporta coma o punto) devolviendo número limpio o fallback.
 */
export function parseQuantityInput(raw: string | number | null | undefined, fallback = 0): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? normalizeQuantity(raw) : fallback;
  }
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return fallback;
  return normalizeQuantity(trimmed);
}

/**
 * Formatea una cantidad numérica para visualización limpia al usuario:
 * - 3.9499999999999997 -> "3.95"
 * - 3.8500000000000001 -> "3.85"
 * - 4.000000 -> "4"
 * - 0.150 -> "0.15"
 * - 0.005 -> "0.005"
 */
export function formatQuantity(value: number | string | null | undefined): string {
  return scaledToDecimalString(toScaledQuantity(value));
}

/**
 * Formatea una cantidad junto con su unidad de medida (ej. "3.85 kg").
 */
export function formatQuantityWithUnit(
  value: number | string | null | undefined,
  unit?: string
): string {
  const qtyText = formatQuantity(value);
  const cleanUnit = unit?.trim();
  return cleanUnit ? `${qtyText} ${cleanUnit}` : qtyText;
}

/**
 * Suma exacta de dos cantidades.
 */
export function addQuantities(
  a: number | string | null | undefined,
  b: number | string | null | undefined
): number {
  return scaledToNumber(toScaledQuantity(a) + toScaledQuantity(b));
}

/**
 * Resta exacta de cantidades (a - b), acotada a >= 0 por defecto.
 */
export function subtractQuantities(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  allowNegative = false
): number {
  const diff = toScaledQuantity(a) - toScaledQuantity(b);
  if (!allowNegative && diff <= 0n) return 0;
  return scaledToNumber(diff);
}

/**
 * Multiplicación exacta de dos cantidades (e.g., consumo por plato * cantidad vendida).
 */
export function multiplyQuantities(
  a: number | string | null | undefined,
  b: number | string | null | undefined
): number {
  const scaledA = toScaledQuantity(a);
  const scaledB = toScaledQuantity(b);
  const product = scaledA * scaledB;
  const half = QUANTITY_SCALE_BIG / 2n;
  const isNeg = product < 0n;
  const absProd = isNeg ? -product : product;
  const rounded = (absProd + half) / QUANTITY_SCALE_BIG;
  return scaledToNumber(isNeg ? -rounded : rounded);
}

/**
 * Multiplica una cantidad entera escalada por una razón racional exacta (num / den),
 * aplicando redondeo half-up al micro-unidad más cercana.
 */
export function multiplyScaledByRatio(scaled: bigint, num: bigint, den: bigint): bigint {
  if (scaled === 0n || num === 0n || den === 0n) return 0n;
  const raw = scaled * num;
  const isNeg = (raw < 0n) !== (den < 0n);
  const absRaw = raw < 0n ? -raw : raw;
  const absDen = den < 0n ? -den : den;
  const quotient = (absRaw + absDen / 2n) / absDen;
  return isNeg ? -quotient : quotient;
}

/**
 * Compara dos cantidades tras normalizarlas a micro-unidades exactas (-1, 0, 1).
 */
export function compareQuantities(
  a: number | string | null | undefined,
  b: number | string | null | undefined
): -1 | 0 | 1 {
  const sa = toScaledQuantity(a);
  const sb = toScaledQuantity(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}
