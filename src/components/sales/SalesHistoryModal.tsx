import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SaleReceipt } from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  X,
  Receipt,
  TrendingUp,
  CreditCard,
  Banknote,
  Smartphone,
  Download,
  Printer,
  Calendar,
  Search
} from 'lucide-react';
import { ReceiptModal } from '../tables/ReceiptModal';

interface SalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SalesHistoryModal: React.FC<SalesHistoryModalProps> = ({
  isOpen,
  onClose
}) => {
  const { config, sales } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<SaleReceipt | null>(null);

  if (!isOpen) return null;

  const filteredSales = sales.filter((s) => {
    const term = searchQuery.toLowerCase();
    return s.tableName.toLowerCase().includes(term) ||
           s.cashierName.toLowerCase().includes(term) ||
           s.id.toLowerCase().includes(term);
  });

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const cardRevenue = sales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0);
  const cashRevenue = sales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0);
  const bizumRevenue = sales.filter(s => s.paymentMethod === 'bizum').reduce((sum, s) => sum + s.total, 0);
  const averageTicket = sales.length > 0 ? (totalRevenue / sales.length) : 0;

  const handleExportCSV = () => {
    const headers = 'ID Ticket,Fecha,Mesa,Camarero,Metodo Pago,Subtotal,IVA,Descuento,Propina,Total\n';
    const rows = sales.map(s => 
      `"${s.id}","${s.timestamp}","${s.tableName}","${s.cashierName}","${s.paymentMethod}",${s.subtotal},${s.taxAmount},${s.discountAmount},${s.tipAmount},${s.total}`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ventas_${config.appName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                Historial de Ventas y Tickets Cerrados
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Auditoría de caja, cobros y facturación simplificada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-orange-500" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="p-3 sm:p-6 pb-2 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold block">Total Facturado</span>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCOP(totalRevenue)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sales.length} tickets emitidos</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold block flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-orange-500" />
              Tarjeta (TPV)
            </span>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCOP(cardRevenue)}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold block flex items-center gap-1">
              <Banknote className="w-3 h-3 text-emerald-500" />
              Efectivo en Caja
            </span>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCOP(cashRevenue)}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold block flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-blue-500" />
              Ticket Medio
            </span>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCOP(averageTicket)}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por mesa, camarero o número de ticket..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        </div>

        {/* Sales Table */}
        <div className="flex-1 overflow-y-auto p-6 pt-2">
          {filteredSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No hay tickets registrados todavía. Al cerrar una cuenta en el módulo de mesas aparecerá aquí.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Ticket / Fecha</th>
                    <th className="px-4 py-3">Mesa</th>
                    <th className="px-4 py-3">Cobrado por</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-center">Líneas</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          #{sale.id.slice(-6)}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {new Date(sale.timestamp).toLocaleString('es-ES', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {sale.tableName}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {sale.cashierName}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium capitalize text-slate-700 dark:text-slate-300">
                          {sale.paymentMethod === 'tarjeta' && <CreditCard className="w-3 h-3 text-orange-500" />}
                          {sale.paymentMethod === 'efectivo' && <Banknote className="w-3 h-3 text-emerald-500" />}
                          {sale.paymentMethod === 'bizum' && <Smartphone className="w-3 h-3 text-blue-500" />}
                          {sale.paymentMethod}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-slate-500">
                        {sale.items.reduce((acc, it) => acc + it.quantity, 0)} uds
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {formatCOP(sale.total)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedReceipt(sale)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold"
                        >
                          <Printer className="w-3 h-3 text-orange-500" />
                          <span>Ver Ticket</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sub-modal: Selected Receipt preview */}
      <ReceiptModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        receipt={selectedReceipt}
      />
    </div>
  );
};
