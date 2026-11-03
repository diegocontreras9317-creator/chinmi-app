import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SaleReceipt } from '../../types';
import { useApp } from '../../context/AppContext';
import { formatCustomerDocument, getSaleCustomerEmail, isElectronicInvoiceSale } from '../../utils/billing';
import { getReceiptTaxLines } from '../../utils/taxes';
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
  const isReadyToPrint = Boolean(isOpen && receipt);

  useEffect(() => {
    if (!isReadyToPrint || typeof document === 'undefined') return;
    document.body.classList.add('chinmi-receipt-open');
    return () => {
      requestAnimationFrame(() => {
        if (!document.querySelector('.chinmi-print-portal')) {
          document.body.classList.remove('chinmi-receipt-open');
        }
      });
    };
  }, [isReadyToPrint]);

  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('chinmi-receipt-open');
    }
    window.focus();
    window.print();
  };

  const formattedDate = new Date(receipt.timestamp).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const [datePart, timePart] = formattedDate.includes(',')
    ? formattedDate.split(',').map((part) => part.trim())
    : [formattedDate, ''];

  const resolvedCustomerName =
    receipt.customerName?.trim() ||
    receipt.billingInfo?.customerName?.trim() ||
    'Consumidor Final';

  const resolvedDocLabel = formatCustomerDocument(
    receipt.customerDocumentType || receipt.billingInfo?.documentType,
    receipt.customerDocumentNumber || receipt.billingInfo?.documentNumber
  );

  const resolvedEmail = getSaleCustomerEmail(receipt);
  const needsElectronicInvoice = isElectronicInvoiceSale(receipt);
  const discriminatedTaxLines = getReceiptTaxLines(receipt);

  const businessTaxDisplay = config.businessTaxId
    ? config.businessTaxId.toUpperCase().startsWith('NIT')
      ? config.businessTaxId
      : `NIT: ${config.businessTaxId}`
    : '';

  const receiptContent = (
    <>
      <div className="text-center pb-4 border-b border-dashed border-slate-300 space-y-0.5">
        <h1 className="text-base font-extrabold tracking-wider uppercase text-slate-950">
          {config.businessName}
        </h1>
        {config.businessAddress && (
          <p className="text-[11px] text-slate-600">{config.businessAddress}</p>
        )}
        {(businessTaxDisplay || config.businessPhone) && (
          <p className="text-[11px] text-slate-600">
            {businessTaxDisplay}
            {businessTaxDisplay && config.businessPhone ? ' · ' : ''}
            {config.businessPhone ? `Tel: ${config.businessPhone}` : ''}
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">
          Comprobante de Venta #{receipt.id.slice(-6)}
        </p>
      </div>

      <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px] text-slate-700">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p>
              <span className="font-bold">Mesa:</span> {receipt.tableName}
            </p>
            <p>
              <span className="font-bold">Cobrado por:</span> {receipt.cashierName}
              {receipt.cashierRole ? ` (${receipt.cashierRole})` : ''}
            </p>
          </div>
          <div className="text-right shrink-0 text-slate-600">
            <p>{datePart}</p>
            {timePart && <p>{timePart}</p>}
          </div>
        </div>

        <div className="pt-1.5 mt-1 border-t border-dotted border-slate-200 space-y-0.5">
          <p>
            <span className="font-bold">Cliente:</span> {resolvedCustomerName}
          </p>
          {resolvedDocLabel && (
            <p>
              <span className="font-bold">Identificación:</span> {resolvedDocLabel}
            </p>
          )}
          {resolvedEmail && (
            <p className="break-all">
              <span className="font-bold">Correo:</span> {resolvedEmail}
            </p>
          )}
          {needsElectronicInvoice && (
            <p>
              <span className="font-bold">Facturación:</span> Electrónica solicitada
            </p>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5">
        <div className="flex justify-between font-bold text-[11px] pb-1 border-b border-slate-200">
          <span>Cant. Concepto</span>
          <span>Total</span>
        </div>
        {(receipt.items || []).map((item, idx) => {
          const qty = Number(item.quantity ?? (item as any).cantidad ?? 0) || 0;
          const unitPrice =
            Number(item.unitPrice ?? (item as any).price ?? (item as any).precio ?? 0) || 0;
          const itemName = item.name || (item as any).nombre || 'Producto';
          return (
            <div
              key={item.id || idx}
              className="flex justify-between gap-2 text-[11px] break-inside-avoid"
            >
              <div className="pr-2">
                <span>{qty}x </span>
                <span>{itemName}</span>
                {item.notes && (
                  <span className="block text-[10px] text-slate-500 italic pl-3">
                    ({item.notes})
                  </span>
                )}
              </div>
              <span className="font-semibold shrink-0">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(qty * unitPrice))} COP
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals & Breakdown */}
      <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px] break-inside-avoid">
        <div className="flex justify-between gap-2">
          <span>Subtotal:</span>
          <span className="shrink-0">
            $ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.subtotal))} COP
          </span>
        </div>

        {receipt.discountAmount > 0 && (
          <div className="flex justify-between gap-2 text-rose-600">
            <span>Descuento ({receipt.discountPercent}%):</span>
            <span className="shrink-0">
              -$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.discountAmount))} COP
            </span>
          </div>
        )}

        {discriminatedTaxLines.map((taxLine, idx) => (
          <div key={idx} className="flex justify-between gap-2 text-slate-600">
            <span>{taxLine.label}</span>
            <span className="shrink-0">
              $ {new Intl.NumberFormat('es-CO').format(Math.round(taxLine.amount))} COP
            </span>
          </div>
        ))}

        <div className="flex justify-between gap-2 text-slate-500 text-[10px]">
          <span>Base gravable estimada:</span>
          <span className="shrink-0">
            ${' '}
            {new Intl.NumberFormat('es-CO').format(
              Math.round(receipt.subtotal - receipt.discountAmount - receipt.taxAmount)
            )}{' '}
            COP
          </span>
        </div>

        {receipt.tipAmount > 0 && (
          <div className="flex justify-between gap-2 text-emerald-700">
            <span>Propina voluntaria:</span>
            <span className="shrink-0">
              +$ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.tipAmount))} COP
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-400 flex justify-between gap-2 text-base font-extrabold text-slate-950">
          <span>TOTAL A COBRAR:</span>
          <span className="shrink-0">
            $ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.total))} COP
          </span>
        </div>
      </div>

      {/* Payment info */}
      <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-[11px] break-inside-avoid">
        <div className="flex justify-between gap-2">
          <span className="capitalize">
            Forma de pago:{' '}
            {receipt.paymentMethod === 'bizum' ? 'Transferencia / QR' : receipt.paymentMethod}
          </span>
          <span className="font-bold shrink-0">
            $ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.total))} COP
          </span>
        </div>
        {receipt.paymentMethod === 'efectivo' && receipt.cashTendered && (
          <>
            <div className="flex justify-between gap-2 text-slate-600">
              <span>Entregado:</span>
              <span className="shrink-0">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.cashTendered))} COP
              </span>
            </div>
            <div className="flex justify-between gap-2 font-bold text-slate-900">
              <span>Cambio devuelto:</span>
              <span className="shrink-0">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(receipt.change || 0))} COP
              </span>
            </div>
          </>
        )}
      </div>

      <div className="text-center pt-3 text-[10px] text-slate-500 space-y-1 break-inside-avoid">
        <p className="font-semibold">¡Muchas gracias por su visita!</p>
        <p>Conserve este ticket como comprobante de pago.</p>
        <p className="text-[9px] text-slate-400">Software SaaS {config.appName}</p>
      </div>
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in print:hidden">
        <div
          className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Top Actions */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Ticket de Venta Emitido</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrint}
                title="Imprimir ticket"
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* On-Screen Ticket Receipt Area */}
          <div
            className="p-6 overflow-y-auto font-mono tabular-nums text-xs bg-white text-slate-900 leading-relaxed"
            id="printable-receipt"
          >
            {receiptContent}
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated Print Portal mounted directly on document.body to avoid modal clipping, scrollbars, and extra blank pages */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="chinmi-print-portal font-mono tabular-nums text-xs bg-white text-slate-900 leading-relaxed"
            aria-hidden="true"
          >
            {receiptContent}
          </div>,
          document.body
        )}
    </>
  );
};
