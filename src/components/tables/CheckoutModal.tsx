import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Table, PaymentMethod, SaleReceipt } from '../../types';
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Receipt,
  ArrowRight,
  Calculator
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  onSuccessCheckout: (receipt: SaleReceipt) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  table,
  onSuccessCheckout
}) => {
  const { config, checkoutTable } = useApp();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('tarjeta');
  const [cashTendered, setCashTendered] = useState<string>('');

  if (!isOpen || !table.order) return null;

  const order = table.order;
  const subtotal = order.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const discountAmount = subtotal * (order.discountPercent / 100);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = taxableBase * (order.taxPercent / 100);
  const total = taxableBase + taxAmount + order.tipAmount;

  const cashNumber = parseFloat(cashTendered) || 0;
  const change = Math.max(0, cashNumber - total);
  const isCashSufficient = paymentMethod !== 'efectivo' || cashNumber >= total;

  const handleQuickCash = (amount: number) => {
    setCashTendered(Math.round(amount).toString());
  };

  const handleConfirm = () => {
    const res = checkoutTable(
      table.id,
      paymentMethod,
      paymentMethod === 'efectivo' ? cashNumber : undefined
    );

    if (res.success && res.receipt) {
      onSuccessCheckout(res.receipt);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div 
        className="relative w-full max-w-lg max-h-[95vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar cobro"
          className="absolute top-3.5 right-3.5 z-50 p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer shadow-sm border border-slate-200 dark:border-slate-700"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 pr-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                Cobrar y Cerrar {table.name}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {table.zone} · {order.items.length} productos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          
          {/* Total Highlight Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total a Cobrar</span>
              <p className="text-3xl font-extrabold tracking-tight text-white mt-0.5">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(total))} COP
              </p>
            </div>
            <div className="text-right text-xs text-slate-300 space-y-0.5">
              <p>Base: $ {new Intl.NumberFormat('es-CO').format(Math.round(taxableBase))}</p>
              <p>Impoconsumo ({order.taxPercent}%): $ {new Intl.NumberFormat('es-CO').format(Math.round(taxAmount))}</p>
              {order.tipAmount > 0 && <p className="text-emerald-400 font-medium">Propina: +$ {new Intl.NumberFormat('es-CO').format(Math.round(order.tipAmount))}</p>}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                id="pay-method-card"
                onClick={() => setPaymentMethod('tarjeta')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  paymentMethod === 'tarjeta'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Tarjeta / Datafono</span>
              </button>

              <button
                type="button"
                id="pay-method-cash"
                onClick={() => {
                  setPaymentMethod('efectivo');
                  if (!cashTendered) setCashTendered(Math.round(total).toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  paymentMethod === 'efectivo'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Efectivo</span>
              </button>

              <button
                type="button"
                id="pay-method-bizum"
                onClick={() => setPaymentMethod('bizum')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  paymentMethod === 'bizum'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Nequi / Daviplata</span>
              </button>
            </div>
          </div>

          {/* Cash Tendered & Change Calculator (Only for Cash) */}
          {paymentMethod === 'efectivo' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-orange-500" />
                  Efectivo entregado por el cliente:
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500">$</span>
                  <input
                    type="number"
                    step="50"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-32 px-2 py-1 text-right rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-sm text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-bold text-slate-500">COP</span>
                </div>
              </div>

              {/* Quick Cash Buttons in Colombian Pesos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleQuickCash(total)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100"
                >
                  Exacto (${new Intl.NumberFormat('es-CO').format(Math.round(total))})
                </button>
                {[20000, 50000, 100000].filter(val => val >= total).map((billete) => (
                  <button
                    key={billete}
                    type="button"
                    onClick={() => handleQuickCash(billete)}
                    className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100"
                  >
                    ${new Intl.NumberFormat('es-CO').format(billete)}
                  </button>
                ))}
              </div>

              {/* Change Output */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Cambio a devolver:
                </span>
                <span className={`text-base font-extrabold font-mono ${
                  change >= 0 && isCashSufficient ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                }`}>
                  {isCashSufficient ? `$ ${new Intl.NumberFormat('es-CO').format(Math.round(change))} COP` : 'Efectivo insuficiente'}
                </span>
              </div>
            </div>
          )}

          {/* Automatic Inventory Notice */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 p-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Al confirmar el cobro, el stock del inventario se actualizará automáticamente y la mesa quedará Libre.</span>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Volver a la Mesa
            </button>

            <button
              type="button"
              id="btn-confirm-checkout"
              disabled={!isCashSufficient}
              onClick={handleConfirm}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <span>Cobrar y Liberar Mesa</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
