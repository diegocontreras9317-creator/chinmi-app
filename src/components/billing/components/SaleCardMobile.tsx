import React from 'react';
import { NormalizedExportSale } from '../adapters/types';
import { formatCOP } from '../../../utils/currency';
import {
  CreditCard,
  Banknote,
  Smartphone,
  Calendar,
  Clock,
  User,
  ChevronRight,
  FileCheck2,
  AlertCircle,
  FileText
} from 'lucide-react';

interface SaleCardMobileProps {
  sale: NormalizedExportSale;
  isSelected?: boolean;
  onSelect?: (saleId: string) => void;
  onViewDetails: (sale: NormalizedExportSale) => void;
}

export const SaleCardMobile: React.FC<SaleCardMobileProps> = ({
  sale,
  isSelected,
  onSelect,
  onViewDetails
}) => {
  const isFE = sale.requestStatus === 'solicitada';

  // Badge para estado de facturación externa
  const getFilingBadge = () => {
    if (sale.filingStatus === 'emitida') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <FileCheck2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Emitida {sale.externalInvoiceNumber ? `#${sale.externalInvoiceNumber}` : ''}</span>
        </span>
      );
    }
    if (sale.filingStatus === 'requiere_revision') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Revisión</span>
        </span>
      );
    }
    if (isFE) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
          <FileText className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          <span>FE Solicitada</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        Ticket POS
      </span>
    );
  };

  const getPaymentIcon = () => {
    const method = (sale.paymentMethod || '').toLowerCase();
    if (method === 'efectivo') return <Banknote className="w-3.5 h-3.5 text-emerald-600" />;
    if (method === 'tarjeta') return <CreditCard className="w-3.5 h-3.5 text-blue-600" />;
    return <Smartphone className="w-3.5 h-3.5 text-purple-600" />;
  };

  const formattedTime = (() => {
    try {
      const d = new Date(sale.timestamp);
      return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  return (
    <div
      className={`rounded-xl p-3.5 border transition-all shadow-xs ${
        isSelected
          ? 'bg-rose-50/70 border-rose-300 dark:bg-rose-950/30 dark:border-rose-700/60'
          : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        {onSelect && (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onSelect(sale.saleId)}
            className="w-4 h-4 rounded text-rose-900 border-slate-300 focus:ring-rose-500 mt-1 cursor-pointer shrink-0"
            aria-label={`Seleccionar venta ${sale.ticketNumber}`}
          />
        )}

        <div className="flex-1 min-w-0" onClick={() => onViewDetails(sale)} role="button" tabIndex={0}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
              Ticket #{sale.ticketNumber}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {getFilingBadge()}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              {sale.dateKey}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {formattedTime}
            </span>
            <span>·</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
              {sale.tableName}
              {sale.subaccountNames && sale.subaccountNames.length > 0
                ? ` · ${sale.subaccountNames.join(', ')}`
                : ''}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                {sale.customerName}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                {formatCOP(sale.total)}
              </p>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              {Array.isArray(sale.paymentBreakdown) && sale.paymentBreakdown.length > 1 ? (
                <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                  Mixto ({sale.paymentBreakdown.length})
                </span>
              ) : (
                <>
                  {getPaymentIcon()}
                  <span className="capitalize">
                    {sale.paymentMethod === 'bizum' ? 'Transferencia' : sale.paymentMethod}
                  </span>
                </>
              )}
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span>{sale.lines.length} {sale.lines.length === 1 ? 'ítem' : 'ítems'}</span>
            </div>
            <span className="inline-flex items-center gap-0.5 text-rose-900 dark:text-rose-400 font-semibold text-xs">
              Detalle <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
