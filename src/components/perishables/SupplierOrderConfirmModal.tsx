import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Check,
  PackageCheck,
  UserCheck,
  DollarSign,
  Layers
} from 'lucide-react';
import { SupplierOrder, PerishableItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatQuantity, normalizeNonNegativeQuantity } from '../../utils/quantityPrecision';
import {
  ReceptionLineInput,
  resolveTargetPantryForOrderLine
} from '../../utils/supplierReception';
import { convertPresentationQtyToBaseScaled, resolveUnitConversion } from '../../utils/recipeUnits';
import { formatPackagingLabel, getEffectiveBaseUnit } from '../../utils/perishableUtils';

interface SupplierOrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SupplierOrder | null;
  perishables: PerishableItem[];
  onConfirm: (
    orderId: string,
    payload: {
      arrivedComplete: boolean;
      confirmedAt: string;
      confirmedBy: string;
      receptionNotes?: string;
      items: ReceptionLineInput[];
      restockPantry: boolean;
      receptionEventId: string;
    }
  ) => Promise<{ success: boolean; error?: string } | void> | void;
}

interface EditableReceptionLine extends ReceptionLineInput {
  alreadyReceived: number;
  remainingQty: number;
  priceInputMode: 'unit' | 'total';
  priceRaw: string;
  showOverridePack: boolean;
}

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeString(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const SupplierOrderConfirmModal: React.FC<SupplierOrderConfirmModalProps> = ({
  isOpen,
  onClose,
  order,
  perishables,
  onConfirm
}) => {
  const { user } = useAuth();

  const [lines, setLines] = useState<EditableReceptionLine[]>([]);
  const [arrivedComplete, setArrivedComplete] = useState<boolean>(true);
  const [arrivalDate, setArrivalDate] = useState<string>(() => getLocalDateString());
  const [arrivalTime, setArrivalTime] = useState<string>(() => getLocalTimeString());
  const [confirmedBy, setConfirmedBy] = useState<string>('');
  const [receptionNotes, setReceptionNotes] = useState<string>('');
  const [restockPantry, setRestockPantry] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sessionEventIdRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen || !order) return;

    sessionEventIdRef.current = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSubmitError(null);
    setIsSubmitting(false);

    const now = new Date();
    setArrivalDate(getLocalDateString(now));
    setArrivalTime(getLocalTimeString(now));
    setConfirmedBy(order.confirmedBy || user?.name || 'Encargado');
    setReceptionNotes('');

    const hasPreviousEvents = Array.isArray(order.receptionEvents) && order.receptionEvents.length > 0;

    const initialLines: EditableReceptionLine[] = (order.items || []).map(it => {
      const alreadyReceived = hasPreviousEvents
        ? normalizeNonNegativeQuantity(it.cumulativeReceivedQty ?? (it.received ? it.receivedQuantity ?? 0 : 0))
        : 0;
      const remaining = Math.max(0, normalizeNonNegativeQuantity(Number(it.quantity) - alreadyReceived));
      const initialNow = remaining > 0 ? remaining : 0;

      return {
        ...it,
        alreadyReceived,
        remainingQty: remaining,
        receivedNowQty: initialNow,
        received: initialNow > 0,
        receivedQuantity: initialNow,
        priceInputMode: 'unit',
        priceRaw: !hasPreviousEvents && it.unitPrice && it.unitPrice > 0 ? String(it.unitPrice) : '',
        showOverridePack: false
      };
    });

    setLines(initialLines);
    const anyRemaining = initialLines.some(l => l.remainingQty > 0);
    setArrivedComplete(anyRemaining);
    setRestockPantry(true);
  }, [isOpen, order?.id, user?.name]);

  const resolvedMatches = useMemo(() => {
    return lines.map(line => ({
      lineId: line.id,
      resolution: resolveTargetPantryForOrderLine(line, perishables)
    }));
  }, [lines, perishables]);

  const matchingPantryCount = useMemo(() => {
    return lines.filter((line, idx) => {
      const qtyNow = line.receivedNowQty ?? 0;
      if (!line.received || qtyNow <= 0) return false;
      return resolvedMatches[idx]?.resolution.status === 'matched';
    }).length;
  }, [lines, resolvedMatches]);

  const hasAmbiguousSelected = useMemo(() => {
    if (!restockPantry) return false;
    return lines.some((line, idx) => {
      const qtyNow = line.receivedNowQty ?? 0;
      return line.received && qtyNow > 0 && resolvedMatches[idx]?.resolution.status === 'ambiguous';
    });
  }, [lines, resolvedMatches, restockPantry]);

  const formattedOrderTimestamp = useMemo(() => {
    if (!order?.orderedAt) return '';
    const d = new Date(order.orderedAt);
    if (isNaN(d.getTime())) return order.orderedAt;
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [order?.orderedAt]);

  if (!isOpen || !order) return null;

  const recomputeCompleteFlag = (nextLines: EditableReceptionLine[]) => {
    const allCovered = nextLines.every(
      l => l.alreadyReceived + (l.received ? l.receivedNowQty ?? 0 : 0) >= Number(l.quantity)
    );
    setArrivedComplete(allCovered);
  };

  const toggleItemReceived = (itemId: string) => {
    setLines(prev => {
      const next = prev.map(it => {
        if (it.id !== itemId) return it;
        const nextReceived = !it.received;
        const nextNow = nextReceived ? (it.remainingQty > 0 ? it.remainingQty : Number(it.quantity)) : 0;
        return {
          ...it,
          received: nextReceived,
          receivedNowQty: nextNow,
          receivedQuantity: nextNow
        };
      });
      recomputeCompleteFlag(next);
      return next;
    });
  };

  const updateReceivedNowQty = (itemId: string, val: number) => {
    const cleanQty = normalizeNonNegativeQuantity(val);
    setLines(prev => {
      const next = prev.map(it => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          received: cleanQty > 0,
          receivedNowQty: cleanQty,
          receivedQuantity: cleanQty
        };
      });
      recomputeCompleteFlag(next);
      return next;
    });
  };

  const updateLineField = (itemId: string, patch: Partial<EditableReceptionLine>) => {
    setLines(prev => prev.map(it => (it.id === itemId ? { ...it, ...patch } : it)));
  };

  const handleSelectCompleteMode = (complete: boolean) => {
    setArrivedComplete(complete);
    if (complete) {
      setLines(prev =>
        prev.map(it => {
          const fill = it.remainingQty > 0 ? it.remainingQty : it.receivedNowQty ?? 0;
          return {
            ...it,
            received: fill > 0,
            receivedNowQty: fill,
            receivedQuantity: fill
          };
        })
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (hasAmbiguousSelected) {
      setSubmitError('Selecciona manualmente el insumo exacto en los ítems marcados como duplicados.');
      return;
    }

    const parsedArrival = new Date(`${arrivalDate}T${arrivalTime}:00`);
    const confirmedAtIso = isNaN(parsedArrival.getTime())
      ? new Date().toISOString()
      : parsedArrival.toISOString();

    const preparedItems: ReceptionLineInput[] = lines.map(l => {
      const qtyNow = l.received ? normalizeNonNegativeQuantity(l.receivedNowQty ?? 0) : 0;
      const numericPrice = parseFloat(l.priceRaw);
      const validPrice = !isNaN(numericPrice) && numericPrice > 0 ? numericPrice : undefined;

      const {
        alreadyReceived: _ar,
        remainingQty: _rq,
        priceInputMode: _pm,
        priceRaw: _pr,
        showOverridePack: _sp,
        unitPrice: _oldUp,
        totalPrice: _oldTp,
        ...baseLine
      } = l;

      return {
        ...baseLine,
        received: qtyNow > 0,
        receivedNowQty: qtyNow,
        receivedQuantity: qtyNow,
        skipPrice: validPrice === undefined,
        ...(validPrice !== undefined
          ? l.priceInputMode === 'total'
            ? { totalPrice: validPrice }
            : { unitPrice: validPrice }
          : {})
      };
    });

    setIsSubmitting(true);
    try {
      const result = await onConfirm(order.id, {
        arrivedComplete,
        confirmedAt: confirmedAtIso,
        confirmedBy: confirmedBy.trim() || user?.name || 'Encargado',
        receptionNotes: receptionNotes.trim() || undefined,
        items: preparedItems,
        restockPantry: matchingPantryCount > 0 ? restockPantry : false,
        receptionEventId: sessionEventIdRef.current
      });

      if (result && result.success === false) {
        setSubmitError(result.error || 'No se pudo completar la recepción.');
        setIsSubmitting(false);
        return;
      }

      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Ocurrió un error al guardar la recepción.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                Recepción de Mercancía · {order.supplierName}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                Pedido: {formattedOrderTimestamp}
                {order.receptionEvents && order.receptionEvents.length > 0
                  ? ` · Entregas previas: ${order.receptionEvents.length}`
                  : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {submitError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* 1. Estado de Confirmación Principal */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 dark:text-slate-200 block">
              Confirmación de entrega *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectCompleteMode(true)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                  arrivedComplete
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 text-emerald-950 dark:text-emerald-100'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    arrivedComplete ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <span className="font-extrabold block">Entrega completa</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Cubre toda la cantidad restante del pedido.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectCompleteMode(false)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                  !arrivedComplete
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-600 text-amber-950 dark:text-amber-100'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    !arrivedComplete ? 'text-amber-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <span className="font-extrabold block">Entrega parcial / con novedad</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Queda saldo pendiente para futuras entregas.
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Verificación línea por línea de productos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verificación de productos ({lines.length})</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Precio y lote son opcionales ("Valorar luego" si queda vacío)
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 overflow-hidden">
              {lines.map((item, idx) => {
                const res = resolvedMatches[idx]?.resolution;
                const matchedPantry = res?.item;
                const presentations = (matchedPantry?.presentations || []).filter(
                  pr => pr.active !== false
                );
                const qtyNow = item.received ? item.receivedNowQty ?? 0 : 0;

                const effPresId = item.overridePresentationId || item.presentationId;
                const presObj = effPresId
                  ? presentations.find(pr => pr.id === effPresId)
                  : undefined;
                const effContentQty =
                  item.overrideContentQty ?? presObj?.contentQty ?? item.contentQty;
                const effContentUnit =
                  item.overrideContentUnit || presObj?.contentUnit || item.contentUnit;

                let basePreviewText = '';
                let conversionWarning = '';

                if (matchedPantry && qtyNow > 0 && restockPantry) {
                  const baseUnit = getEffectiveBaseUnit(matchedPantry);
                  if (effContentQty && effContentQty > 0 && effContentUnit) {
                    const conv = convertPresentationQtyToBaseScaled({
                      presentationQty: qtyNow,
                      contentQty: effContentQty,
                      contentUnit: effContentUnit,
                      baseUnit,
                      equivalences: matchedPantry.equivalences
                    });
                    if (conv.compatible) {
                      basePreviewText = `→ Ingresa +${formatQuantity(conv.baseQty)} ${baseUnit}`;
                    } else {
                      conversionWarning = conv.reason || 'Presentación incompatible';
                    }
                  } else {
                    const conv = resolveUnitConversion({
                      fromUnit: item.unit,
                      toUnit: baseUnit,
                      pantryItem: matchedPantry
                    });
                    if (conv.compatible) {
                      const baseQty = Math.round(qtyNow * conv.factor * 10000) / 10000;
                      basePreviewText = `→ Ingresa +${formatQuantity(baseQty)} ${baseUnit}`;
                    } else {
                      conversionWarning = conv.reason || `No se puede convertir ${item.unit} a ${baseUnit}`;
                    }
                  }
                }

                return (
                  <div key={item.id} className="p-3.5 space-y-2.5">
                    {/* Fila principal: checkbox, nombre, cantidad recibida hoy */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleItemReceived(item.id)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition ${
                            item.received
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <span
                            className={`font-bold block truncate ${
                              item.received
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-400 line-through'
                            }`}
                          >
                            {item.name}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums block">
                            Pedido: {formatQuantity(item.quantity)} {item.unit}
                            {item.alreadyReceived > 0
                              ? ` · Prev: ${formatQuantity(item.alreadyReceived)} · Rest: ${formatQuantity(item.remainingQty)}`
                              : ''}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-500">Recibido hoy:</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.receivedNowQty ?? 0}
                          onChange={e =>
                            updateReceivedNowQty(item.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                        />
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[75px]">
                          {presObj
                            ? formatPackagingLabel(presObj.packagingType, qtyNow !== 1)
                            : item.unit}
                        </span>
                      </div>
                    </div>

                    {/* Desambiguación explícita si hay insumos con mismo nombre */}
                    {res?.status === 'ambiguous' && res.candidates && restockPantry && item.received && qtyNow > 0 && (
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-1">
                        <span className="text-[11px] font-bold text-amber-800 dark:text-amber-200 block">
                          Hay {res.candidates.length} insumos llamados "{item.name}". Elige cuál actualizar:
                        </span>
                        <select
                          value={item.overrideInsumoId || ''}
                          onChange={e =>
                            updateLineField(item.id, { overrideInsumoId: e.target.value })
                          }
                          className="w-full px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value="">-- Seleccionar insumo exacto --</option>
                          {res.candidates.map(cand => (
                            <option key={cand.id} value={cand.id}>
                              {cand.name} · {cand.location} ({formatQuantity(cand.quantity)}{' '}
                              {getEffectiveBaseUnit(cand)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Controles de presentación / cambio de empaque + precio opcional + lote/caducidad */}
                    {item.received && qtyNow > 0 && (
                      <div className="pl-7 space-y-2">
                        {/* Selección de presentación o cambio de contenido entregado */}
                        {matchedPantry && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            {presentations.length > 0 && (
                              <select
                                value={effPresId || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  const pr = presentations.find(x => x.id === val);
                                  updateLineField(item.id, {
                                    overridePresentationId: val || undefined,
                                    overrideContentQty: pr?.contentQty,
                                    overrideContentUnit: pr?.contentUnit
                                  });
                                }}
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200"
                              >
                                <option value="">
                                  Unidad directa ({item.unit})
                                </option>
                                {presentations.map(pr => (
                                  <option key={pr.id} value={pr.id}>
                                    {pr.name || formatPackagingLabel(pr.packagingType)} (x{formatQuantity(pr.contentQty)} {pr.contentUnit})
                                  </option>
                                ))}
                              </select>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                updateLineField(item.id, {
                                  showOverridePack: !item.showOverridePack
                                })
                              }
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                            >
                              <Layers className="w-3 h-3" />
                              <span>
                                {item.showOverridePack ? 'Ocultar ajuste empaque' : 'Ajustar contenido por empaque'}
                              </span>
                            </button>

                            {basePreviewText && (
                              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                {basePreviewText}
                              </span>
                            )}
                          </div>
                        )}

                        {conversionWarning && (
                          <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            ⚠️ {conversionWarning}. Usa "Ajustar contenido por empaque" arriba.
                          </div>
                        )}

                        {item.showOverridePack && (
                          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                            <span className="text-slate-500 font-semibold">1 {item.unit} trae:</span>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              value={effContentQty ?? ''}
                              onChange={e =>
                                updateLineField(item.id, {
                                  overrideContentQty: parseFloat(e.target.value) || undefined
                                })
                              }
                              placeholder="Ej. 10"
                              className="w-16 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono font-bold"
                            />
                            <input
                              type="text"
                              value={effContentUnit || ''}
                              onChange={e =>
                                updateLineField(item.id, {
                                  overrideContentUnit: e.target.value
                                })
                              }
                              placeholder={matchedPantry ? getEffectiveBaseUnit(matchedPantry) : 'unidades'}
                              className="w-24 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-semibold"
                            />
                          </div>
                        )}

                        {/* Precio opcional + Lote/Caducidad */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center">
                          <div className="sm:col-span-6 flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-slate-400 shrink-0" />
                            <select
                              value={item.priceInputMode}
                              onChange={e =>
                                updateLineField(item.id, {
                                  priceInputMode: e.target.value as 'unit' | 'total'
                                })
                              }
                              className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold"
                            >
                              <option value="unit">Unit. COP</option>
                              <option value="total">Total COP</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.priceRaw}
                              onChange={e => updateLineField(item.id, { priceRaw: e.target.value })}
                              placeholder="Valorar luego"
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={item.batchNumber || ''}
                              onChange={e => updateLineField(item.id, { batchNumber: e.target.value })}
                              placeholder="Lote (opc.)"
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-mono"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <input
                              type="date"
                              value={item.expiryDate || ''}
                              onChange={e => updateLineField(item.id, { expiryDate: e.target.value })}
                              title="Fecha de caducidad de este lote (opcional)"
                              className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Fecha, Hora de recepción y Responsable */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Fecha llegada *</span>
              </label>
              <input
                type="date"
                value={arrivalDate}
                onChange={e => setArrivalDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-semibold outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Hora llegada *</span>
              </label>
              <input
                type="time"
                value={arrivalTime}
                onChange={e => setArrivalTime(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-semibold outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Recibido por</span>
              </label>
              <input
                type="text"
                value={confirmedBy}
                onChange={e => setConfirmedBy(e.target.value)}
                placeholder="Ej. Diego / Cocina"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold outline-hidden"
              />
            </div>
          </div>

          {/* 4. Observaciones */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {arrivedComplete
                ? 'Observaciones de recepción (opcional)'
                : 'Detalle de faltantes o novedad'}
            </label>
            <input
              type="text"
              value={receptionNotes}
              onChange={e => setReceptionNotes(e.target.value)}
              placeholder={
                arrivedComplete
                  ? 'Ej. Producto fresco, remisión #1084 entregada completa'
                  : 'Ej. Llegó entrega parcial; restante llega mañana'
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>

          {/* 5. Sumar al stock */}
          {(matchingPantryCount > 0 || hasAmbiguousSelected) && (
            <label className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={restockPantry}
                onChange={e => setRestockPantry(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Sumar esta recepción al inventario en Despensa ({matchingPantryCount} coincidencia
                  {matchingPantryCount === 1 ? '' : 's'})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Convierte presentaciones a la unidad base, registra lote FEFO y actualiza costo promedio ponderado si ingresaste precio.
                </span>
              </div>
            </label>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-xs transition inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                arrivedComplete
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Registrando...'
                  : arrivedComplete
                  ? 'Confirmar Recepción Completa'
                  : 'Guardar Recepción Parcial'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
