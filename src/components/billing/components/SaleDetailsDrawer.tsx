import React from 'react';
import { NormalizedExportSale } from '../adapters/types';
import { formatCOP } from '../../../utils/currency';
import {
  X,
  Receipt,
  User,
  MapPin,
  Mail,
  Phone,
  CreditCard,
  Banknote,
  Smartphone,
  Calendar,
  Clock,
  FileText,
  FileCheck2,
  AlertCircle,
  Edit3,
  ExternalLink
} from 'lucide-react';

interface SaleDetailsDrawerProps {
  sale: NormalizedExportSale | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFiscalEdit?: (sale: NormalizedExportSale) => void;
  onOpenExternalFiling?: (sale: NormalizedExportSale) => void;
}

export const SaleDetailsDrawer: React.FC<SaleDetailsDrawerProps> = ({
  sale,
  isOpen,
  onClose,
  onOpenFiscalEdit,
  onOpenExternalFiling
}) => {
  if (!isOpen || !sale) return null;

  const isFE = sale.requestStatus === 'solicitada';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-900 text-white shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                Comprobante Ticket #{sale.ticketNumber}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ID Interno: {sale.saleId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Tarjeta de Resumen General */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Mesa / Salón</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{sale.tableName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Cajero / Operador</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{sale.cashierName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Método de Pago</span>
              <span className="font-bold capitalize text-slate-800 dark:text-slate-200">{sale.paymentMethod}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Fecha de Emisión</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{sale.dateKey}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Estado Exportación</span>
              <span className={`font-bold ${sale.exportStatus === 'exportado' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
                {sale.exportStatus === 'exportado' ? 'Exportado' : 'Sin Exportar'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-semibold">Estado Facturación Externa</span>
              <span className={`font-bold ${
                sale.filingStatus === 'emitida'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : sale.filingStatus === 'requiere_revision'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-purple-600 dark:text-purple-400'
              }`}>
                {sale.filingStatus === 'emitida' ? 'Emitida' : sale.filingStatus === 'requiere_revision' ? 'Revisión' : 'Pendiente'}
              </span>
            </div>
          </div>

          {/* Información Fiscal del Cliente */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                Datos Fiscales del Cliente
              </span>
              {onOpenFiscalEdit && (
                <button
                  type="button"
                  onClick={() => onOpenFiscalEdit(sale)}
                  className="text-xs font-semibold text-rose-900 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar / Completar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Nombre o Razón Social:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{sale.customerName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Documento / NIT:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {sale.documentType} {sale.documentNumber}{sale.dv ? `-${sale.dv}` : ''}
                </span>
              </div>
              {sale.email && (
                <div>
                  <span className="text-slate-400 text-[10px] block">Correo Facturación:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-400" /> {sale.email}
                  </span>
                </div>
              )}
              {sale.phone && (
                <div>
                  <span className="text-slate-400 text-[10px] block">Teléfono:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" /> {sale.phone}
                  </span>
                </div>
              )}
              {sale.address && (
                <div className="sm:col-span-2">
                  <span className="text-slate-400 text-[10px] block">Dirección & Ciudad:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    {sale.address} {sale.city ? `· ${sale.city}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Desglose de Productos */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white block">
              Productos Vendidos ({sale.lines.length})
            </span>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {sale.lines.map((line, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {line.quantity}x {line.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      SKU: {line.sku} · Tarifa: {line.taxType.toUpperCase()} {line.taxRate}%
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCOP(line.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Liquidación Monetaria */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal:</span>
              <span className="font-medium">{formatCOP(sale.subtotal)}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Descuento aplicado:</span>
                <span className="font-medium">-{formatCOP(sale.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Base gravable:</span>
              <span className="font-medium">{formatCOP(sale.taxableBase)}</span>
            </div>
            {sale.ivaAmount > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>IVA (19%):</span>
                <span className="font-medium">{formatCOP(sale.ivaAmount)}</span>
              </div>
            )}
            {sale.impoconsumoAmount > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Impuesto al Consumo (8%):</span>
                <span className="font-medium">{formatCOP(sale.impoconsumoAmount)}</span>
              </div>
            )}
            {sale.tipAmount > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Propina / Servicio Voluntario:</span>
                <span className="font-medium">{formatCOP(sale.tipAmount)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-extrabold text-slate-900 dark:text-white">
              <span>TOTAL PAGADO:</span>
              <span className="text-rose-900 dark:text-rose-400">{formatCOP(sale.total)}</span>
            </div>
          </div>

        </div>

        {/* Pie de Acciones */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2.5">
          {onOpenExternalFiling ? (
            <button
              type="button"
              onClick={() => onOpenExternalFiling(sale)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Registrar Emisión Externa</span>
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
