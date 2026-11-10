import React, { useState, useMemo } from 'react';
import { NormalizedExportSale } from '../adapters/types';
import { formatCOP } from '../../../utils/currency';
import { SaleCardMobile } from '../components/SaleCardMobile';
import {
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  ExternalLink,
  FileText,
  FileCheck2,
  AlertCircle,
  Receipt,
  Download,
  CreditCard,
  Banknote,
  Smartphone
} from 'lucide-react';

interface SalesHistorySectionProps {
  sales: NormalizedExportSale[];
  isLoading: boolean;
  onViewDetails: (sale: NormalizedExportSale) => void;
  onOpenFiscalEdit: (sale: NormalizedExportSale) => void;
  onOpenExternalFiling: (sale: NormalizedExportSale) => void;
  onOpenWizardWithSales?: (sales: NormalizedExportSale[]) => void;
}

export const SalesHistorySection: React.FC<SalesHistorySectionProps> = ({
  sales,
  isLoading,
  onViewDetails,
  onOpenFiscalEdit,
  onOpenExternalFiling,
  onOpenWizardWithSales
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterPreset, setDateFilterPreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [requestFilter, setRequestFilter] = useState<'all' | 'solicitada' | 'no_solicitada'>('all');
  const [filingFilter, setFilingFilter] = useState<'all' | 'pendiente' | 'emitida' | 'requiere_revision'>('all');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Fechas de referencia
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const weekStartKey = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunes
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  }, []);
  const monthStartKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  // Filtrado de ventas
  const filteredSales = useMemo(() => {
    let result = sales;

    // Filtro de texto (ticket, cliente, documento)
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.ticketNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.documentNumber.toLowerCase().includes(q) ||
          s.tableName.toLowerCase().includes(q)
      );
    }

    // Filtro de fechas
    if (dateFilterPreset === 'today') {
      result = result.filter((s) => s.dateKey === todayKey);
    } else if (dateFilterPreset === 'yesterday') {
      result = result.filter((s) => s.dateKey === yesterdayKey);
    } else if (dateFilterPreset === 'week') {
      result = result.filter((s) => s.dateKey >= weekStartKey && s.dateKey <= todayKey);
    } else if (dateFilterPreset === 'month') {
      result = result.filter((s) => s.dateKey >= monthStartKey && s.dateKey <= todayKey);
    } else if (dateFilterPreset === 'custom') {
      if (customStartDate) {
        result = result.filter((s) => s.dateKey >= customStartDate);
      }
      if (customEndDate) {
        result = result.filter((s) => s.dateKey <= customEndDate);
      }
    }

    // Filtro por solicitud de factura electrónica
    if (requestFilter !== 'all') {
      result = result.filter((s) => s.requestStatus === requestFilter);
    }

    // Filtro por radicación externa
    if (filingFilter !== 'all') {
      result = result.filter((s) => s.filingStatus === filingFilter);
    }

    return result;
  }, [
    sales,
    searchTerm,
    dateFilterPreset,
    customStartDate,
    customEndDate,
    requestFilter,
    filingFilter,
    todayKey,
    yesterdayKey,
    weekStartKey,
    monthStartKey
  ]);

  // Cálculos agregados de las ventas filtradas
  const stats = useMemo(() => {
    let totalMonetary = 0;
    let totalTaxableBase = 0;
    let totalIva = 0;
    let totalImpoconsumo = 0;
    let requestedCount = 0;

    for (const s of filteredSales) {
      totalMonetary += s.total;
      totalTaxableBase += s.taxableBase;
      totalIva += s.ivaAmount;
      totalImpoconsumo += s.impoconsumoAmount;
      if (s.requestStatus === 'solicitada') requestedCount++;
    }

    return {
      count: filteredSales.length,
      totalMonetary,
      totalTaxableBase,
      totalIva,
      totalImpoconsumo,
      requestedCount
    };
  }, [filteredSales]);

  // Paginación calculada
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  // Reset a página 1 cuando cambia algún filtro
  const handleFilterChange = (setter: () => void) => {
    setter();
    setCurrentPage(1);
  };

  const getPaymentIcon = (method: string) => {
    const m = (method || '').toLowerCase();
    if (m === 'efectivo') return <Banknote className="w-3.5 h-3.5 text-emerald-600 inline mr-1" />;
    if (m === 'tarjeta') return <CreditCard className="w-3.5 h-3.5 text-blue-600 inline mr-1" />;
    return <Smartphone className="w-3.5 h-3.5 text-purple-600 inline mr-1" />;
  };

  return (
    <div className="space-y-4">
      {/* Barra de Estadísticas Clave */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Ventas Filtradas</span>
          <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {stats.count.toLocaleString('es-CO')}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {stats.requestedCount} con FE solicitada
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Total Recaudado</span>
          <span className="text-xl font-bold font-mono tabular-nums text-rose-900 dark:text-rose-400">
            {formatCOP(stats.totalMonetary)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Base: {formatCOP(stats.totalTaxableBase)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Impoconsumo (8%)</span>
          <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCOP(stats.totalImpoconsumo)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Servicio restaurante
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">IVA Liquidado (19%)</span>
          <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCOP(stats.totalIva)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Bebidas / otros gravados
          </span>
        </div>
      </div>

      {/* Controles y Filtros */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Barra de Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleFilterChange(() => setSearchTerm(e.target.value))}
              placeholder="Buscar por Ticket #, cliente, cédula/NIT o mesa..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-600 focus:bg-white dark:focus:bg-slate-900 transition"
            />
          </div>

          {/* Botón rápido para abrir asistente de exportación con la selección */}
          {onOpenWizardWithSales && filteredSales.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenWizardWithSales(filteredSales)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Selección ({filteredSales.length})</span>
            </button>
          )}
        </div>

        {/* Fila de Filtros Segmentados */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Preset Fechas */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('all'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('today'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'today'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('yesterday'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'yesterday'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('week'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'week'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('month'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'month'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(() => setDateFilterPreset('custom'))}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                dateFilterPreset === 'custom'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Rango Personalizado */}
          {dateFilterPreset === 'custom' && (
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400">Desde:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => handleFilterChange(() => setCustomStartDate(e.target.value))}
                className="bg-transparent text-slate-900 dark:text-white text-xs outline-hidden"
              />
              <span className="text-[10px] text-slate-400">Hasta:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => handleFilterChange(() => setCustomEndDate(e.target.value))}
                className="bg-transparent text-slate-900 dark:text-white text-xs outline-hidden"
              />
            </div>
          )}

          {/* Filtro Solicitud FE */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-slate-400 text-xs hidden sm:inline">Tipo:</span>
            <select
              value={requestFilter}
              onChange={(e) => handleFilterChange(() => setRequestFilter(e.target.value as any))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs outline-hidden"
            >
              <option value="all">Todos los comprobantes</option>
              <option value="solicitada">Solo Factura Electrónica</option>
              <option value="no_solicitada">Solo Ticket POS estándar</option>
            </select>

            {/* Filtro Estado Radicación */}
            <select
              value={filingFilter}
              onChange={(e) => handleFilterChange(() => setFilingFilter(e.target.value as any))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs outline-hidden"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendientes de emisión</option>
              <option value="emitida">Emitidas ante DIAN</option>
              <option value="requiere_revision">Requieren revisión</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Ventas: Vista Móvil (Cards) y Vista Desktop (Tabla de Alta Densidad) */}
      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-rose-900 border-t-transparent rounded-full mb-2" />
          <p className="text-xs text-slate-500">Cargando ventas y metadatos fiscales...</p>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No se encontraron ventas</p>
          <p className="text-xs text-slate-400 mt-1">Prueba ajustando los filtros de fecha o los términos de búsqueda.</p>
        </div>
      ) : (
        <>
          {/* Vista Móvil */}
          <div className="block lg:hidden space-y-2.5">
            {paginatedSales.map((sale) => (
              <SaleCardMobile
                key={sale.saleId}
                sale={sale}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>

          {/* Vista Desktop */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">Ticket</th>
                    <th className="py-2.5 px-3 font-semibold">Fecha / Hora</th>
                    <th className="py-2.5 px-3 font-semibold">Mesa</th>
                    <th className="py-2.5 px-3 font-semibold">Cliente / Razón Social</th>
                    <th className="py-2.5 px-3 font-semibold">Doc. / NIT</th>
                    <th className="py-2.5 px-3 font-semibold">Pago</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Base Gravable</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Impuestos</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Estado</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedSales.map((sale) => {
                    const isFE = sale.requestStatus === 'solicitada';
                    return (
                      <tr
                        key={sale.saleId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          #{sale.ticketNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap font-mono">
                          {sale.dateKey}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                          {sale.tableName}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white max-w-[180px] truncate" title={sale.customerName}>
                          {sale.customerName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {sale.documentNumber}
                          {sale.dv ? `-${sale.dv}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {getPaymentIcon(sale.paymentMethod)}
                          <span className="capitalize">{sale.paymentMethod}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatCOP(sale.taxableBase)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatCOP(sale.taxAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {formatCOP(sale.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {sale.filingStatus === 'emitida' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Emitida {sale.externalInvoiceNumber ? `#${sale.externalInvoiceNumber}` : ''}</span>
                            </span>
                          ) : sale.filingStatus === 'requiere_revision' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Revisión</span>
                            </span>
                          ) : isFE ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                              <FileText className="w-3.5 h-3.5" />
                              <span>FE Solicitada</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Ticket POS
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onViewDetails(sale)}
                              title="Ver detalle del comprobante"
                              className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenFiscalEdit(sale)}
                              title="Completar datos fiscales del cliente"
                              className="p-1 rounded-md text-slate-400 hover:text-rose-900 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenExternalFiling(sale)}
                              title="Registrar número de factura externa"
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>Mostrando</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
              >
                <option value={25}>25 filas</option>
                <option value={50}>50 filas</option>
                <option value={100}>100 filas</option>
              </select>
              <span>de {filteredSales.length} ventas</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono px-2 text-slate-700 dark:text-slate-300">
                Pág. {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
