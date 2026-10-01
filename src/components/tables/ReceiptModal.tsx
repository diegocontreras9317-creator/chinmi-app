import React from 'react';
import { SaleReceipt } from '../../types';
import { useApp } from '../../context/AppContext';
import { X, Printer, CheckCircle2 } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: SaleReceipt | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  receipt
}) => {
  const { config } = useApp();

  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(receipt.timestamp).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div 
        className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 pr-12">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Ticket de Venta Emitido</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrint}
              title="Imprimir ticket"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Receipt Area */}
        <div className="p-6 overflow-y-auto font-mono text-xs bg-white text-slate-900 leading-relaxed" id="printable-receipt">
          <div className="text-center pb-4 border-b border-dashed border-slate-300 space-y-0.5">
            <h1 className="text-base font-extrabold tracking-wider uppercase text-slate-950">
              {config.businessName}
            </h1>
            <p className="text-[11px] text-slate-600">{config.businessAddress}</p>
            <p className="text-[11px] text-slate-600">NIF/CIF: {config.businessTaxId} · Tel: {config.businessPhone}</p>
            <p className="text-[10px] text-slate-400 mt-1">Factura Simplificada #{receipt.id.slice(-6)}</p>
          </div>

          <div className="py-2.5 border-b border-dashed border-slate-300 flex items-center justify-between text-[11px] text-slate-600">
            <div>
              <p><span className="font-bold">Mesa:</span> {receipt.tableName}</p>
              <p><span className="font-bold">Atendido por:</span> {receipt.cashierName}</p>
            </div>
            <div className="text-right">
              <p>{formattedDate.split(',')[0]}</p>
              <p>{formattedDate.split(',')[1]}</p>
            </div>
          </div>

          {/* Items list */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5">
            <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-slate-200">
              <span>Cant. Concepto</span>
              <span>Total</span>
            </div>
            {receipt.items.map((item) => (
              <div key={item.id} className="flex justify-between text-[11px]">
                <div className="pr-2">
                  <span>{item.quantity}x </span>
                  <span>{item.name}</span>
                  {item.notes && <span className="block text-[10px] text-slate-500 italic pl-3">({item.notes})</span>}
                </div>
                <span className="font-semibold shrink-0">
                  $ {new Intl.NumberFormat('es-CO').format(Math.round(item.quantity * item.unitPrice))} COP
                </span>
              </div>
            ))}
          </div>

          {/* Totals & Breakdown */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.subtotal))} COP</span>
            </div>

            {receipt.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Descuento ({receipt.discountPercent}%):</span>
                <span>-$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.discountAmount))} COP</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Impoconsumo / IVA ({receipt.taxPercent}%):</span>
              <span>$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.taxAmount))} COP</span>
            </div>

            {receipt.tipAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Propina voluntaria:</span>
                <span>+$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.tipAmount))} COP</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-400 flex justify-between text-base font-extrabold text-slate-950">
              <span>TOTAL:</span>
              <span>$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.total))} COP</span>
            </div>
          </div>

          {/* Payment info */}
          <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className="capitalize">Forma de pago: {receipt.paymentMethod}</span>
              <span className="font-bold">$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.total))} COP</span>
            </div>
            {receipt.paymentMethod === 'efectivo' && receipt.cashTendered && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Entregado:</span>
                  <span>$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.cashTendered))} COP</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Cambio devuelto:</span>
                  <span>$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.change || 0))} COP</span>
                </div>
              </>
            )}
          </div>

          <div className="text-center pt-3 text-[10px] text-slate-500 space-y-1">
            <p className="font-semibold">¡Muchas gracias por su visita!</p>
            <p>Conserve este ticket como justificante de pago.</p>
            <p className="text-[9px] text-slate-400">Software SaaS {config.appName}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Ticket</span>
          </button>
        </div>

      </div>
    </div>
  );
};
