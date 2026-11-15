import {
  CostStatus,
  PerishableItem,
  PerishableLot,
  SupplierOrder,
  SupplierOrderItem,
  SupplierReceptionEvent,
  SupplierReceptionEventItem
} from '../types';
import {
  addQuantities,
  normalizeNonNegativeQuantity,
  scaledToNumber
} from './quantityPrecision';
import {
  addLotToPerishable,
  convertPresentationQtyToBaseScaled,
  normalizePerishableRecord,
  resolveUnitConversion
} from './recipeUnits';
import {
  applyDelayedValuationAdjustment,
  calculateWeightedMovingAverageCost,
  roundCOPAmount
} from './inventoryCosting';
import { getEffectiveBaseUnit } from './perishableUtils';

export interface ReceptionLineInput extends SupplierOrderItem {
  receivedNowQty?: number;
  overrideInsumoId?: string;
  overridePresentationId?: string;
  overrideContentQty?: number;
  overrideContentUnit?: string;
  expiryDate?: string;
  batchNumber?: string;
  skipPrice?: boolean;
}

export interface PantryTargetResolution {
  status: 'matched' | 'not_found' | 'ambiguous';
  item?: PerishableItem;
  candidates?: PerishableItem[];
}

/**
 * Resuelve de forma segura el insumo destino en Despensa para una línea de pedido.
 * Evita actualizar múltiples registros si existen nombres duplicados sin insumoId.
 */
export function resolveTargetPantryForOrderLine(
  line: Pick<SupplierOrderItem, 'insumoId' | 'name'> & { overrideInsumoId?: string },
  perishablesList: PerishableItem[]
): PantryTargetResolution {
  const explicitId = line.overrideInsumoId || line.insumoId;
  if (explicitId) {
    const byId = perishablesList.find((p) => p.id === explicitId);
    if (byId) return { status: 'matched', item: byId };
  }

  const cleanName = (line.name || '').trim().toLowerCase();
  if (!cleanName) return { status: 'not_found' };

  const matches = perishablesList.filter(
    (p) => (p.name || '').trim().toLowerCase() === cleanName
  );
  if (matches.length === 1) return { status: 'matched', item: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches };
  return { status: 'not_found' };
}

export interface ProcessReceptionParams {
  order: SupplierOrder;
  perishablesList: PerishableItem[];
  receptionEventId: string;
  payload: {
    arrivedComplete: boolean;
    confirmedAt?: string;
    confirmedBy?: string;
    receptionNotes?: string;
    restockPantry?: boolean;
    items: ReceptionLineInput[];
  };
}

export interface ProcessReceptionResult {
  idempotentDuplicate: boolean;
  updatedOrder: SupplierOrder;
  modifiedPerishables: PerishableItem[];
  allPerishables: PerishableItem[];
  receptionEvent?: SupplierReceptionEvent;
}

/**
 * Ejecuta determinísticamente una recepción (parcial, total o progresiva) de un pedido de proveedor:
 * - Idempotente por receptionEventId (soporta reintentos sin duplicar stock).
 * - Acumula múltiples líneas del mismo insumo secuencialmente sin pisar stock ni costo promedio.
 * - Convierte presentaciones comerciales a la unidad base del insumo sin 1:1 silencioso.
 * - Calcula costo promedio ponderado móvil o marca valoración pendiente si entra sin precio.
 * - Registra lotes independientes con su fecha de ingreso y caducidad.
 */
export function processSupplierOrderReception(
  params: ProcessReceptionParams
): ProcessReceptionResult {
  const { order, perishablesList, receptionEventId, payload } = params;
  const existingEvents = Array.isArray(order.receptionEvents) ? order.receptionEvents : [];

  const duplicateEvent = existingEvents.find((ev) => ev.id === receptionEventId);
  if (duplicateEvent) {
    return {
      idempotentDuplicate: true,
      updatedOrder: order,
      modifiedPerishables: [],
      allPerishables: perishablesList,
      receptionEvent: duplicateEvent
    };
  }

  const confirmedIso = payload.confirmedAt || new Date().toISOString();
  const entryDateStr = confirmedIso.split('T')[0];
  const confirmedBy = payload.confirmedBy?.trim() || 'Encargado';
  const restockPantry = Boolean(payload.restockPantry);

  // Mapa mutable de trabajo para acumular múltiples líneas sobre el mismo insumo
  const workingMap = new Map<string, PerishableItem>();
  perishablesList.forEach((p) => {
    workingMap.set(p.id, normalizePerishableRecord(p));
  });
  const modifiedIds = new Set<string>();

  const eventItems: SupplierReceptionEventItem[] = [];
  const nextOrderItems: SupplierOrderItem[] = [];

  for (let idx = 0; idx < payload.items.length; idx++) {
    const line = payload.items[idx];
    const prevOrderLine = order.items.find((it) => it.id === line.id) || line;

    // Determinar cuánto se recibe EN ESTE EVENTO DE RECEPCIÓN
    let receivedNowQty = 0;
    if (line.receivedNowQty !== undefined) {
      receivedNowQty = normalizeNonNegativeQuantity(line.receivedNowQty);
    } else if (existingEvents.length === 0) {
      // Primera confirmación sobre el pedido
      receivedNowQty =
        line.received !== false
          ? normalizeNonNegativeQuantity(line.receivedQuantity ?? line.quantity)
          : 0;
    } else if (line.received !== false && line.receivedQuantity !== undefined) {
      const prevCum = prevOrderLine.cumulativeReceivedQty ?? prevOrderLine.receivedQuantity ?? 0;
      receivedNowQty = normalizeNonNegativeQuantity(
        Math.max(0, Number(line.receivedQuantity) - Number(prevCum))
      );
    }

    const prevCumulative =
      existingEvents.length > 0
        ? prevOrderLine.cumulativeReceivedQty ??
          (prevOrderLine.received ? prevOrderLine.receivedQuantity ?? 0 : 0)
        : 0;
    const newCumulative = addQuantities(prevCumulative, receivedNowQty);

    const effectiveContentQty =
      line.overrideContentQty !== undefined ? line.overrideContentQty : line.contentQty;
    const effectiveContentUnit = line.overrideContentUnit || line.contentUnit;
    const effectivePresentationId = line.overridePresentationId || line.presentationId;

    const cleanUnitPrice =
      !line.skipPrice && line.unitPrice !== undefined && Number(line.unitPrice) > 0
        ? Number(line.unitPrice)
        : undefined;
    const cleanTotalPrice =
      !line.skipPrice && line.totalPrice !== undefined && Number(line.totalPrice) > 0
        ? Number(line.totalPrice)
        : cleanUnitPrice && receivedNowQty > 0
        ? roundCOPAmount(cleanUnitPrice * receivedNowQty)
        : undefined;

    if (receivedNowQty > 0 && restockPantry) {
      const candidateList = Array.from(workingMap.values());
      const resolution = resolveTargetPantryForOrderLine(line, candidateList);

      if (resolution.status === 'ambiguous') {
        throw new Error(
          `Existen varios insumos llamados "${line.name}" en Despensa. Selecciona manualmente cuál corresponde antes de sumar stock.`
        );
      }

      if (resolution.status === 'matched' && resolution.item) {
        const target = workingMap.get(resolution.item.id)!;
        const baseUnit = getEffectiveBaseUnit(target);

        // Resolver presentación desde catálogo del insumo si aplica
        const presObj = effectivePresentationId
          ? (target.presentations || []).find((p) => p.id === effectivePresentationId)
          : undefined;

        const finalContentQty =
          line.overrideContentQty ?? presObj?.contentQty ?? effectiveContentQty;
        const finalContentUnit =
          line.overrideContentUnit || presObj?.contentUnit || effectiveContentUnit;
        const finalPresName = presObj?.name || line.presentationName;
        const finalPackType = presObj?.packagingType || line.packagingType;

        let convertedBaseQty = 0;

        if (finalContentQty && finalContentQty > 0 && finalContentUnit) {
          const conv = convertPresentationQtyToBaseScaled({
            presentationQty: receivedNowQty,
            contentQty: finalContentQty,
            contentUnit: finalContentUnit,
            baseUnit,
            equivalences: target.equivalences
          });
          if (!conv.compatible) {
            throw new Error(
              conv.reason ||
                `No se puede convertir la presentación "${finalContentQty} ${finalContentUnit}" a la unidad base "${baseUnit}" de ${target.name}.`
            );
          }
          convertedBaseQty = conv.baseQty;
        } else {
          const conv = resolveUnitConversion({
            fromUnit: line.unit,
            toUnit: baseUnit,
            pantryItem: target
          });
          if (!conv.compatible) {
            throw new Error(
              conv.reason ||
                `La unidad "${line.unit}" de "${line.name}" no tiene conversión a "${baseUnit}". Configura la presentación o equivalencia.`
            );
          }
          convertedBaseQty = scaledToNumber(
            BigInt(Math.round(receivedNowQty * 1_000_000)) * conv.ratio.num / conv.ratio.den
          );
        }

        const prevQty = normalizeNonNegativeQuantity(target.quantity ?? target.cantidadActual ?? 0);
        const prevCost = target.costPerUnit || 0;
        const prevCostStatus: CostStatus = target.costStatus || (prevCost > 0 ? 'exact' : 'pending_valuation');

        const costResult = calculateWeightedMovingAverageCost({
          prevQty,
          prevCostPerUnit: prevCost,
          prevCostStatus: target.costStatus,
          prevPendingValuationCount: target.pendingValuationCount,
          receivedBaseQty: convertedBaseQty,
          unitPriceInPurchaseUnit: cleanUnitPrice,
          purchasePresentationQty: receivedNowQty,
          totalPurchaseCost: cleanTotalPrice
        });

        const lotId = `lot-${receptionEventId}-${idx}`;
        const lotExpiry = line.expiryDate || target.expiryDate;
        const lot: PerishableLot = {
          id: lotId,
          batchNumber: line.batchNumber?.trim() || `REC-${entryDateStr}`,
          quantity: convertedBaseQty,
          entryDate: entryDateStr || target.entryDate,
          expiryDate: lotExpiry,
          supplierId: order.supplierId || target.supplierId,
          unitCost: costResult.batchUnitCostInBase,
          receptionEventId,
          createdAt: confirmedIso
        };

        const lotResult = addLotToPerishable(target, lot);

        const updatedItem = normalizePerishableRecord({
          ...target,
          quantity: lotResult.totalQuantity,
          cantidadActual: lotResult.totalQuantity,
          entryDate: entryDateStr || target.entryDate,
          expiryDate: lotResult.nextExpiryDate,
          lots: lotResult.updatedLots,
          costPerUnit: costResult.nextCostPerUnit,
          costStatus: costResult.costStatus,
          pendingValuationCount: costResult.pendingValuationCount,
          lastCostUpdatedAt: confirmedIso
        });

        workingMap.set(updatedItem.id, updatedItem);
        modifiedIds.add(updatedItem.id);

        eventItems.push({
          orderItemId: line.id,
          insumoId: updatedItem.id,
          insumoName: updatedItem.name,
          ...(effectivePresentationId ? { presentationId: effectivePresentationId } : {}),
          ...(finalPresName ? { presentationName: finalPresName } : {}),
          ...(finalPackType ? { packagingType: finalPackType } : {}),
          ...(finalContentQty ? { contentQty: finalContentQty } : {}),
          ...(finalContentUnit ? { contentUnit: finalContentUnit } : {}),
          receivedPresentationQty: receivedNowQty,
          convertedBaseQty,
          baseUnit,
          ...(cleanUnitPrice !== undefined ? { unitPrice: cleanUnitPrice } : {}),
          ...(costResult.totalPurchaseCost !== undefined
            ? { totalPrice: costResult.totalPurchaseCost }
            : {}),
          valuationStatus: costResult.valuationStatus,
          previousStockQty: prevQty,
          previousAvgCost: prevCost,
          previousCostStatus: prevCostStatus,
          newAvgCostAfterEvent: costResult.nextCostPerUnit,
          lotId,
          expiryDate: lotExpiry
        });

        nextOrderItems.push({
          ...prevOrderLine,
          ...line,
          insumoId: updatedItem.id,
          ...(effectivePresentationId ? { presentationId: effectivePresentationId } : {}),
          ...(finalPresName ? { presentationName: finalPresName } : {}),
          ...(finalPackType ? { packagingType: finalPackType } : {}),
          ...(finalContentQty ? { contentQty: finalContentQty } : {}),
          ...(finalContentUnit ? { contentUnit: finalContentUnit } : {}),
          received: newCumulative > 0,
          receivedQuantity: newCumulative,
          cumulativeReceivedQty: newCumulative,
          receivedBaseQuantity: addQuantities(prevOrderLine.receivedBaseQuantity ?? 0, convertedBaseQty),
          valuationStatus: costResult.valuationStatus,
          ...(cleanUnitPrice !== undefined ? { unitPrice: cleanUnitPrice } : {}),
          ...(costResult.totalPurchaseCost !== undefined ? { totalPrice: costResult.totalPurchaseCost } : {})
        });
        continue;
      }
    }

    // Línea recibida sin stock match (o solo confirmación documental) o con 0 recibida
    const valStatus: 'valued' | 'pending_valuation' =
      receivedNowQty > 0 && !(cleanTotalPrice && cleanTotalPrice > 0) && !(cleanUnitPrice && cleanUnitPrice > 0)
        ? 'pending_valuation'
        : 'valued';

    if (receivedNowQty > 0) {
      eventItems.push({
        orderItemId: line.id,
        ...(line.overrideInsumoId || line.insumoId
          ? { insumoId: line.overrideInsumoId || line.insumoId }
          : {}),
        insumoName: line.name,
        ...(effectivePresentationId ? { presentationId: effectivePresentationId } : {}),
        ...(line.presentationName ? { presentationName: line.presentationName } : {}),
        ...(line.packagingType ? { packagingType: line.packagingType } : {}),
        ...(effectiveContentQty ? { contentQty: effectiveContentQty } : {}),
        ...(effectiveContentUnit ? { contentUnit: effectiveContentUnit } : {}),
        receivedPresentationQty: receivedNowQty,
        convertedBaseQty: 0,
        baseUnit: line.unit,
        ...(cleanUnitPrice !== undefined ? { unitPrice: cleanUnitPrice } : {}),
        ...(cleanTotalPrice !== undefined ? { totalPrice: cleanTotalPrice } : {}),
        valuationStatus: valStatus
      });
    }

    nextOrderItems.push({
      ...prevOrderLine,
      ...line,
      ...(line.overrideInsumoId ? { insumoId: line.overrideInsumoId } : {}),
      received: newCumulative > 0,
      receivedQuantity: newCumulative,
      cumulativeReceivedQty: newCumulative,
      ...(receivedNowQty > 0 ? { valuationStatus: valStatus } : {})
    });
  }

  const allLinesComplete = nextOrderItems.every(
    (it) => (it.cumulativeReceivedQty ?? 0) >= Number(it.quantity)
  );
  const resolvedComplete = payload.arrivedComplete || allLinesComplete;

  const eventPendingValuation = eventItems.some((it) => it.valuationStatus === 'pending_valuation');
  const eventTotal = eventItems.reduce((acc, it) => acc + (it.totalPrice || 0), 0);

  const receptionEvent: SupplierReceptionEvent = {
    id: receptionEventId,
    orderId: order.id,
    receivedAt: confirmedIso,
    receivedBy: confirmedBy,
    arrivedComplete: resolvedComplete,
    ...(payload.receptionNotes?.trim() ? { notes: payload.receptionNotes.trim() } : {}),
    restockPantry: restockPantry && modifiedIds.size > 0,
    items: eventItems,
    hasPendingValuation: eventPendingValuation,
    ...(eventTotal > 0 ? { totalAmount: roundCOPAmount(eventTotal) } : {})
  };

  const nextEvents = [...existingEvents, receptionEvent].slice(-50);
  const anyOrderPendingValuation = nextEvents.some((ev) =>
    ev.items.some((it) => it.valuationStatus === 'pending_valuation')
  );
  const orderTotalAmount = nextEvents.reduce(
    (sum, ev) => sum + ev.items.reduce((s2, it) => s2 + (it.totalPrice || 0), 0),
    0
  );

  const updatedOrder: SupplierOrder = {
    ...order,
    items: nextOrderItems,
    status: resolvedComplete ? 'recibido_completo' : 'recibido_incompleto',
    arrived: true,
    arrivedComplete: resolvedComplete,
    confirmedAt: confirmedIso,
    confirmedBy,
    ...(payload.receptionNotes?.trim()
      ? { receptionNotes: payload.receptionNotes.trim() }
      : { receptionNotes: order.receptionNotes }),
    stockUpdated: Boolean(order.stockUpdated) || modifiedIds.size > 0,
    receptionEvents: nextEvents,
    hasPendingValuation: anyOrderPendingValuation,
    ...(orderTotalAmount > 0 ? { totalAmount: roundCOPAmount(orderTotalAmount) } : {})
  };

  const allPerishables = Array.from(workingMap.values());
  const modifiedPerishables = allPerishables.filter((p) => modifiedIds.has(p.id));

  return {
    idempotentDuplicate: false,
    updatedOrder,
    modifiedPerishables,
    allPerishables,
    receptionEvent
  };
}

/**
 * Completa posteriormente la valoración económica (precio) de una recepción que entró sin precio.
 * Idempotente: si el ítem del evento ya fue valorado, no aplica doble ajuste ni modifica stock ni ventas pasadas.
 */
export function processDelayedValuationForOrderEvent(params: {
  order: SupplierOrder;
  perishablesList: PerishableItem[];
  receptionEventId: string;
  orderItemId: string;
  unitPrice?: number;
  totalPrice?: number;
  valuedBy?: string;
  nowIso?: string;
}): {
  idempotentDuplicate: boolean;
  updatedOrder: SupplierOrder;
  updatedPerishable?: PerishableItem;
} {
  const {
    order,
    perishablesList,
    receptionEventId,
    orderItemId,
    unitPrice,
    totalPrice,
    valuedBy = 'Encargado',
    nowIso = new Date().toISOString()
  } = params;

  const events = Array.isArray(order.receptionEvents) ? order.receptionEvents : [];
  const targetEvent = events.find((e) => e.id === receptionEventId);
  if (!targetEvent) {
    throw new Error('Evento de recepción no encontrado.');
  }

  const targetItem = targetEvent.items.find((it) => it.orderItemId === orderItemId);
  if (!targetItem) {
    throw new Error('Línea de recepción no encontrada en el evento.');
  }

  if (targetItem.valuationStatus === 'valued') {
    return {
      idempotentDuplicate: true,
      updatedOrder: order
    };
  }

  const pantryItem = targetItem.insumoId
    ? perishablesList.find((p) => p.id === targetItem.insumoId)
    : undefined;

  let updatedPerishable: PerishableItem | undefined;
  let resolvedTotal = totalPrice && totalPrice > 0 ? totalPrice : 0;
  if (!resolvedTotal && unitPrice && unitPrice > 0) {
    resolvedTotal = unitPrice * (targetItem.receivedPresentationQty || targetItem.convertedBaseQty || 1);
  }
  if (!(resolvedTotal > 0)) {
    throw new Error('Debes ingresar un precio válido mayor a 0.');
  }

  let batchUnitCostInBase =
    targetItem.convertedBaseQty > 0 ? resolvedTotal / targetItem.convertedBaseQty : 0;

  if (pantryItem && targetItem.convertedBaseQty > 0) {
    const adj = applyDelayedValuationAdjustment({
      currentQty: pantryItem.quantity ?? pantryItem.cantidadActual ?? 0,
      currentCostPerUnit: pantryItem.costPerUnit || 0,
      pendingValuationCount: pantryItem.pendingValuationCount,
      addedBaseQty: targetItem.convertedBaseQty,
      totalPurchaseCost: resolvedTotal,
      unitPriceInPurchaseUnit: unitPrice,
      purchasePresentationQty: targetItem.receivedPresentationQty
    });

    resolvedTotal = adj.totalPurchaseCost;
    batchUnitCostInBase = adj.batchUnitCostInBase;

    const updatedLots = Array.isArray(pantryItem.lots)
      ? pantryItem.lots.map((l) =>
          l.id === targetItem.lotId || l.receptionEventId === receptionEventId
            ? { ...l, unitCost: batchUnitCostInBase }
            : l
        )
      : undefined;

    updatedPerishable = normalizePerishableRecord({
      ...pantryItem,
      costPerUnit: adj.nextCostPerUnit,
      costStatus: adj.costStatus,
      pendingValuationCount: adj.pendingValuationCount,
      lastCostUpdatedAt: nowIso,
      ...(updatedLots !== undefined ? { lots: updatedLots } : {})
    });
  }

  const computedUnitPrice =
    unitPrice && unitPrice > 0
      ? unitPrice
      : targetItem.receivedPresentationQty > 0
      ? roundCOPAmount(resolvedTotal / targetItem.receivedPresentationQty)
      : undefined;

  const nextEvents: SupplierReceptionEvent[] = events.map((ev) => {
    if (ev.id !== receptionEventId) return ev;
    const nextItems = ev.items.map((it) => {
      if (it.orderItemId !== orderItemId) return it;
      return {
        ...it,
        ...(computedUnitPrice !== undefined ? { unitPrice: computedUnitPrice } : {}),
        totalPrice: roundCOPAmount(resolvedTotal),
        valuationStatus: 'valued' as const,
        valuedAt: nowIso,
        valuedBy,
        ...(updatedPerishable ? { newAvgCostAfterEvent: updatedPerishable.costPerUnit } : {})
      };
    });
    const evTotal = nextItems.reduce((s, it) => s + (it.totalPrice || 0), 0);
    return {
      ...ev,
      items: nextItems,
      hasPendingValuation: nextItems.some((it) => it.valuationStatus === 'pending_valuation'),
      totalAmount: roundCOPAmount(evTotal)
    };
  });

  const anyPending = nextEvents.some((ev) =>
    ev.items.some((it) => it.valuationStatus === 'pending_valuation')
  );
  const nextOrderTotal = nextEvents.reduce((s, ev) => s + (ev.totalAmount || 0), 0);

  const nextOrderItems = order.items.map((it) => {
    if (it.id !== orderItemId) return it;
    return {
      ...it,
      ...(computedUnitPrice !== undefined ? { unitPrice: computedUnitPrice } : {}),
      totalPrice: roundCOPAmount(resolvedTotal),
      valuationStatus: 'valued' as const
    };
  });

  const updatedOrder: SupplierOrder = {
    ...order,
    items: nextOrderItems,
    receptionEvents: nextEvents,
    hasPendingValuation: anyPending,
    totalAmount: roundCOPAmount(nextOrderTotal)
  };

  return {
    idempotentDuplicate: false,
    updatedOrder,
    updatedPerishable
  };
}
