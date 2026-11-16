import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, ArrowRight, CheckCircle2, ChefHat } from 'lucide-react';
import { PerishableItem, Product } from '../../types';
import {
  BASE_MEASUREMENT_UNITS,
  formatPresentationSummary,
  formatSpanishNumber,
  getEffectiveBaseUnit
} from '../../utils/perishableUtils';
import {
  UnitIncompatibilityIssue,
  getSuspectPresentationWarning,
  previewUnitCorrection
} from '../../utils/recipeUnits';
import { formatCOP } from '../../utils/currency';
import { parseQuantityInput } from '../../utils/quantityPrecision';

interface UnitCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue: UnitIncompatibilityIssue | null;
  products: Product[];
  onApplyItemUpdate: (itemId: string, updatedItem: PerishableItem) => void;
}

export const UnitCorrectionModal: React.FC<UnitCorrectionModalProps> = ({
  isOpen,
  onClose,
  issue,
  products,
  onApplyItemUpdate
}) => {
  const [targetBaseUnit, setTargetBaseUnit] = useState<string>('kg');
  const [manualFactorRaw, setManualFactorRaw] = useState<string>('');
  const [keepNumbersWithoutFactor, setKeepNumbersWithoutFactor] = useState<boolean>(false);

  // Para presentaciones sospechosas (ej. 500 libra -> 500 g)
  const [fixPresQtyRaw, setFixPresQtyRaw] = useState<string>('');
  const [fixPresUnit, setFixPresUnit] = useState<string>('g');

  useEffect(() => {
    if (!isOpen || !issue) return;
    const defaultTarget = issue.suggestedBaseUnits[0] || 'kg';
    setTargetBaseUnit(defaultTarget);
    setManualFactorRaw('');
    setKeepNumbersWithoutFactor(false);

    if (issue.kind === 'suspect_presentation' && issue.suspectPresentation) {
      const warn = getSuspectPresentationWarning(
        issue.suspectPresentation.contentQty,
        issue.suspectPresentation.contentUnit
      );
      setFixPresQtyRaw(String(issue.suspectPresentation.contentQty));
      setFixPresUnit(warn?.suggestedUnit || 'g');
    }
  }, [isOpen, issue?.item.id, issue?.kind]);

  const parsedFactor = useMemo(() => {
    const val = parseQuantityInput(manualFactorRaw, 0);
    return val > 0 ? val : undefined;
  }, [manualFactorRaw]);

  const preview = useMemo(() => {
    if (!issue) return null;
    return previewUnitCorrection({
      item: issue.item,
      targetBaseUnit,
      productsCatalog: products,
      manualFactorPerCurrentUnit: parsedFactor,
      keepNumbersWithoutFactor
    });
  }, [issue, targetBaseUnit, products, parsedFactor, keepNumbersWithoutFactor]);

  if (!isOpen || !issue || !preview) return null;

  const { item } = issue;
  const currentBase = getEffectiveBaseUnit(item);

  const handleConfirmUnitCorrection = () => {
    if (!preview.canApply) return;
    onApplyItemUpdate(item.id, preview.nextItem);
    onClose();
  };

  const handleConfirmPresentationFix = () => {
    if (!issue.suspectPresentation) return;
    const nextQty = parseQuantityInput(fixPresQtyRaw, 0);
    if (!(nextQty > 0)) return;
    const updatedPresentations = (item.presentations || []).map((pr) =>
      pr.id === issue.suspectPresentation!.id
        ? {
            ...pr,
            contentQty: nextQty,
            contentUnit: fixPresUnit
          }
        : pr
    );
    onApplyItemUpdate(item.id, {
      ...item,
      presentations: updatedPresentations
    });
    onClose();
  };

  const isSuspectMode = issue.kind === 'suspect_presentation' && Boolean(issue.suspectPresentation);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/25 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                Ajustar unidad · {item.name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Revisa cómo quedará tu despensa antes de confirmar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Pregunta clara en lenguaje natural */}
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
            {issue.questionText}
          </p>

          {isSuspectMode && issue.suspectPresentation ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-slate-500 dark:text-slate-400">
                  Presentación actual:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatPresentationSummary(issue.suspectPresentation)}
                  </strong>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Cantidad por empaque
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={fixPresQtyRaw}
                      onChange={(e) => setFixPresQtyRaw(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Unidad real
                    </label>
                    <select
                      value={fixPresUnit}
                      onChange={(e) => setFixPresUnit(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-900 dark:text-white"
                    >
                      {BASE_MEASUREMENT_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPresentationFix}
                  disabled={!(parseQuantityInput(fixPresQtyRaw, 0) > 0)}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold cursor-pointer"
                >
                  Guardar corrección
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Elegir unidad destino */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  ¿En qué unidad quieres llevar este inventario?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {BASE_MEASUREMENT_UNITS.map((u) => {
                    const isSelected = targetBaseUnit === u.value;
                    const isSuggested = issue.suggestedBaseUnits.includes(u.value);
                    return (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => {
                          setTargetBaseUnit(u.value);
                          setManualFactorRaw('');
                          setKeepNumbersWithoutFactor(false);
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white font-extrabold'
                            : isSuggested
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-200 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold'
                        }`}
                      >
                        <span className="block">{u.value}</span>
                        {isSuggested && !isSelected && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block">
                            Sugerida
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Si no hay conversión estándar automática, pedir dato o confirmación explícita */}
              {!preview.compatibleStandard && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div>
                    <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                      ¿A cuánto equivale 1 {currentBase} de lo que tienes ahora en {targetBaseUnit}?
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-semibold shrink-0">
                        1 {currentBase} =
                      </span>
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        disabled={keepNumbersWithoutFactor}
                        value={manualFactorRaw}
                        onChange={(e) => setManualFactorRaw(e.target.value)}
                        placeholder="Ej. 2.5"
                        className="w-28 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white disabled:opacity-50"
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {targetBaseUnit}
                      </span>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepNumbersWithoutFactor}
                      onChange={(e) => setKeepNumbersWithoutFactor(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-950 focus:ring-rose-900"
                    />
                    <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                      Cambiar solo la unidad sin multiplicar las cantidades actuales (confirmo pasar{' '}
                      <strong>{formatSpanishNumber(preview.prevQty)} {currentBase}</strong> a{' '}
                      <strong>{formatSpanishNumber(preview.prevQty)} {targetBaseUnit}</strong>).
                    </span>
                  </label>
                </div>
              )}

              {/* 3. Vista previa antes de aplicar */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <span className="font-extrabold text-slate-900 dark:text-white block">
                  Vista previa del cambio
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">Stock actual</span>
                    <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5 tabular-nums">
                      <span>{formatSpanishNumber(preview.prevQty)} {currentBase}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {formatSpanishNumber(preview.nextQty)} {targetBaseUnit}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">Stock mínimo</span>
                    <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5 tabular-nums">
                      <span>{formatSpanishNumber(preview.prevMinStock)} {currentBase}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {formatSpanishNumber(preview.nextMinStock)} {targetBaseUnit}
                      </span>
                    </div>
                  </div>
                </div>

                {preview.prevCostPerUnit > 0 && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    Costo unitario: {formatCOP(preview.prevCostPerUnit)}/{currentBase} →{' '}
                    <strong>{formatCOP(preview.nextCostPerUnit)}/{targetBaseUnit}</strong>
                  </div>
                )}

                {preview.affectedRecipes.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <ChefHat className="w-3.5 h-3.5 text-slate-400" />
                      <span>Recetas vinculadas ({preview.affectedRecipes.length})</span>
                    </span>
                    <div className="space-y-1">
                      {preview.affectedRecipes.map((r) => (
                        <div
                          key={`${r.productId}-${r.recipeUnit}`}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="text-slate-700 dark:text-slate-200 truncate">
                            {r.productName} ({formatSpanishNumber(r.recipeQty)} {r.recipeUnit})
                          </span>
                          <span
                            className={`font-bold shrink-0 ${
                              r.compatibleAfter
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {r.compatibleAfter ? 'Compatible' : 'Falta equivalencia'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnitCorrection}
                  disabled={!preview.canApply}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicar corrección</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
