import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Check,
  PackageCheck,
  UserCheck
} from 'lucide-react';
import { SupplierOrder, SupplierOrderItem, PerishableItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatQuantity, normalizeNonNegativeQuantity } from '../../utils/quantityPrecision';

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
      items: SupplierOrderItem[];
      restockPantry: boolean;
    }
  ) => void;
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

  const [checkedItems, setCheckedItems] = useState<SupplierOrderItem[]>([]);
  const [arrivedComplete, setArrivedComplete] = useState<boolean>(true);
  const [arrivalDate, setArrivalDate] = useState<string>(() => getLocalDateString());
  const [arrivalTime, setArrivalTime] = useState<string>(() => getLocalTimeString());
  const [confirmedBy, setConfirmedBy] = useState<string>('');
  const [receptionNotes, setReceptionNotes] = useState<string>('');
  const [restockPantry, setRestockPantry] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !order) return;

    const baseDate = order.confirmedAt ? new Date(order.confirmedAt) : new Date();
    const validDate = isNaN(baseDate.getTime()) ? new Date() : baseDate;

    setArrivalDate(getLocalDateString(validDate));
    setArrivalTime(getLocalTimeString(validDate));
    setConfirmedBy(order.confirmedBy || user?.name || 'Encargado');
    setReceptionNotes(order.receptionNotes || '');

    const initialLines: SupplierOrderItem[] = (order.items || []).map(it => ({
      ...it,
      received: order.status === 'recibido_incompleto' ? (it.received ?? true) : true,
      receivedQuantity:
        order.status === 'recibido_incompleto' && it.receivedQuantity !== undefined
          ? it.receivedQuantity
          : it.quantity
    }));

    setCheckedItems(initialLines);
    setArrivedComplete(order.status === 'recibido_incompleto' ? false : true);
    setRestockPantry(!order.stockUpdated);
  }, [isOpen, order, user?.name]);

  const matchingPantryCount = useMemo(() => {
    if (!order) return 0;
    return checkedItems.filter(line =>
      line.received !== false &&
      (line.receivedQuantity ?? line.quantity) > 0 &&
      perishables.some(p => p.name.trim().toLowerCase() === line.name.trim().toLowerCase())
    ).length;
  }, [order, checkedItems, perishables]);

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

  const toggleItemReceived = (itemId: string) => {
    setCheckedItems(prev => {
      const next = prev.map(it => {
        if (it.id !== itemId) return it;
        const nextReceived = !it.received;
        return {
          ...it,
          received: nextReceived,
          receivedQuantity: nextReceived ? it.quantity : 0
        };
      });
      const allFull = next.every(
        it => it.received && (it.receivedQuantity ?? it.quantity) >= it.quantity
      );
      setArrivedComplete(allFull);
      return next;
    });
  };

  const updateReceivedQty = (itemId: string, nextQty: number) => {
    const cleanQty = normalizeNonNegativeQuantity(nextQty);
    setCheckedItems(prev => {
      const next = prev.map(it => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          received: cleanQty > 0,
          receivedQuantity: cleanQty
        };
      });
      const allFull = next.every(
        it => it.received && (it.receivedQuantity ?? it.quantity) >= it.quantity
      );
      setArrivedComplete(allFull);
      return next;
    });
  };

  const handleSelectCompleteMode = (complete: boolean) => {
    setArrivedComplete(complete);
    if (complete) {
      setCheckedItems(prev =>
        prev.map(it => ({
          ...it,
          received: true,
          receivedQuantity: it.quantity
        }))
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedArrival = new Date(`${arrivalDate}T${arrivalTime}:00`);
    const confirmedAtIso = isNaN(parsedArrival.getTime())
      ? new Date().toISOString()
      : parsedArrival.toISOString();

    onConfirm(order.id, {
      arrivedComplete,
      confirmedAt: confirmedAtIso,
      confirmedBy: confirmedBy.trim() || user?.name || 'Encargado',
      receptionNotes: receptionNotes.trim() || undefined,
      items: checkedItems,
      restockPantry: matchingPantryCount > 0 && !order.stockUpdated ? restockPantry : false
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
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
                Confirmar Llegada del Pedido · {order.supplierName}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                Pedido registrado: {formattedOrderTimestamp}
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
                  <span className="font-extrabold block">Todo llegó y llegó completo</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Se recibieron todos los productos y cantidades solicitadas.
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
                  <span className="font-extrabold block">Llegó incompleto / con novedad</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Faltó algún producto o llegó menor cantidad.
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
                <span>Verificación de productos ({checkedItems.length})</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Marca o ajusta lo recibido
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 overflow-hidden">
              {checkedItems.map(item => (
                <div
                  key={item.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
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
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Pedido: {formatQuantity(item.quantity)} {item.unit}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-400">Recibido:</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.receivedQuantity ?? item.quantity}
                      onChange={e =>
                        updateReceivedQty(item.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono tabular-nums font-bold text-slate-900 dark:text-white"
                    />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-14 truncate">
                      {item.unit}
                    </span>
                  </div>
                </div>
              ))}
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

          {/* 4. Observaciones de recepción */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {arrivedComplete
                ? 'Observaciones de recepción (opcional)'
                : 'Detalle de faltantes o novedad *'}
            </label>
            <input
              type="text"
              value={receptionNotes}
              onChange={e => setReceptionNotes(e.target.value)}
              placeholder={
                arrivedComplete
                  ? 'Ej. Producto fresco, factura #1084 entregada completa'
                  : 'Ej. Faltaron 2 kg de limón, el distribuidor los repone mañana'
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>

          {/* 5. Sumar al stock automáticamente si coincide con insumos de Despensa */}
          {matchingPantryCount > 0 && !order.stockUpdated && (
            <label className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={restockPantry}
                onChange={e => setRestockPantry(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Sumar cantidades recibidas a Insumos en Despensa ({matchingPantryCount}{' '}
                  coincidencia{matchingPantryCount === 1 ? '' : 's'})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Actualiza automáticamente las existencias actuales en tu inventario fresco.
                </span>
              </div>
            </label>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-xs transition inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                arrivedComplete
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {arrivedComplete
                  ? 'Confirmar: Todo Llegó Completo'
                  : 'Guardar Recepción con Faltantes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
