import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SaleReceipt } from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  formatCustomerDocument,
  getSaleCustomerEmail,
  isElectronicInvoiceSale
} from '../../utils/billing';
import { getReceiptTaxLines } from '../../utils/taxes';
import {
  X,
  Receipt,
  TrendingUp,
  CreditCard,
  Banknote,
  Smartphone,
  Download,
  FileSpreadsheet,
  Printer,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  Copy,
  Check,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { ReceiptModal } from '../tables/ReceiptModal';
import { BillingExcelExportModal } from './BillingExcelExportModal';

interface SalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function toLocalDateKey(rawTimestamp: unknown): string {
  if (!rawTimestamp) return '';
  let dateObj: Date;
  if (typeof rawTimestamp === 'object' && rawTimestamp !== null) {
    if ('toDate' in rawTimestamp && typeof (rawTimestamp as { toDate: () => Date }).toDate === 'function') {
      dateObj = (rawTimestamp as { toDate: () => Date }).toDate();
    } else if ('seconds' in rawTimestamp && typeof (rawTimestamp as { seconds: number }).seconds === 'number') {
      dateObj = new Date((rawTimestamp as { seconds: number }).seconds * 1000);
    } else if (rawTimestamp instanceof Date) {
      dateObj = rawTimestamp;
    } else {
      return '';
    }
  } else {
    dateObj = new Date(rawTimestamp as string | number);
  }
  if (Number.isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKeyLocal(dateKey: string): Date | null {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const base = parseDateKeyLocal(dateKey);
  if (!base) return dateKey;
  const shifted = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return toLocalDateKey(shifted);
}

export const SalesHistoryModal: React.FC<SalesHistoryModalProps> = ({
  isOpen,
  onClose
}) => {
  const { config, sales, products, updateElectronicInvoiceStatus } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'electronic'>('all');
  const [feStatusFilter, setFeStatusFilter] = useState<'all' | 'pendiente' | 'emitida'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedReceipt, setSelectedReceipt] = useState<SaleReceipt | null>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (calendarContainerRef.current && !calendarContainerRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCalendarOpen]);

  const salesByDayMap = useMemo(() => {
    const map = new Map<
      string,
      { count: number; total: number; electronicCount: number; electronicPending: number }
    >();
    for (const sale of sales) {
      const key = toLocalDateKey(sale.timestamp);
      if (!key) continue;
      const isFE = isElectronicInvoiceSale(sale);
      const isPendingFE = isFE && sale.electronicInvoiceStatus !== 'emitida';
      const prev = map.get(key) || {
        count: 0,
        total: 0,
        electronicCount: 0,
        electronicPending: 0
      };
      map.set(key, {
        count: prev.count + 1,
        total: prev.total + sale.total,
        electronicCount: prev.electronicCount + (isFE ? 1 : 0),
        electronicPending: prev.electronicPending + (isPendingFE ? 1 : 0)
      });
    }
    return map;
  }, [sales]);

  const calendarCells = useMemo(() => {
    const year = viewMonthDate.getFullYear();
    const month = viewMonthDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Lunes = 0 ... Domingo = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: Array<{ dateKey: string; dayNumber: number; isCurrentMonth: boolean }> = [];
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(year, month, 1 - startOffset + i);
      cells.push({
        dateKey: toLocalDateKey(cellDate),
        dayNumber: cellDate.getDate(),
        isCurrentMonth: cellDate.getMonth() === month
      });
    }
    return cells;
  }, [viewMonthDate]);

  if (!isOpen) return null;

  const todayKey = toLocalDateKey(new Date());

  const formatButtonDate = (dateKey: string) => {
    const parsed = parseDateKeyLocal(dateKey);
    if (!parsed) return 'Buscar por día';
    const shortFormatted = parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    return dateKey === todayKey ? `Hoy · ${shortFormatted}` : shortFormatted;
  };

  const formatFullDateLabel = (dateKey: string) => {
    const parsed = parseDateKeyLocal(dateKey);
    if (!parsed) return '';
    return parsed.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const handleSelectDay = (dateKey: string) => {
    setSelectedDate(dateKey);
    const parsed = parseDateKeyLocal(dateKey);
    if (parsed) {
      setViewMonthDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    setIsCalendarOpen(false);
  };

  // Ventas filtradas primero por día (para contadores precisos en las pestañas)
  const dayScopedSales = sales.filter((s) => {
    if (!selectedDate) return true;
    return toLocalDateKey(s.timestamp) === selectedDate;
  });

  const dayElectronicSales = dayScopedSales.filter((s) => isElectronicInvoiceSale(s));
  const dayElectronicPendingCount = dayElectronicSales.filter(
    (s) => s.electronicInvoiceStatus !== 'emitida'
  ).length;
  const dayElectronicIssuedCount = dayElectronicSales.length - dayElectronicPendingCount;

  const filteredSales = dayScopedSales.filter((s) => {
    const needsFE = isElectronicInvoiceSale(s);
    if (invoiceFilter === 'electronic') {
      if (!needsFE) return false;
      const currentStatus = s.electronicInvoiceStatus === 'emitida' ? 'emitida' : 'pendiente';
      if (feStatusFilter !== 'all' && currentStatus !== feStatusFilter) return false;
    }

    const term = searchQuery.trim().toLowerCase();
    if (!term) return true;
    const custName = (s.customerName || s.billingInfo?.customerName || 'consumidor final').toLowerCase();
    const custDoc = (s.customerDocumentNumber || s.billingInfo?.documentNumber || '').toLowerCase();
    const custEmail = getSaleCustomerEmail(s).toLowerCase();
    return (
      s.tableName.toLowerCase().includes(term) ||
      s.cashierName.toLowerCase().includes(term) ||
      custName.includes(term) ||
      custDoc.includes(term) ||
      custEmail.includes(term) ||
      s.id.toLowerCase().includes(term)
    );
  });

  const filteredDayTotal = filteredSales.reduce((sum, s) => sum + s.total, 0);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const cardRevenue = sales.filter((s) => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0);
  const cashRevenue = sales.filter((s) => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0);
  const totalElectronicCount = sales.filter((s) => isElectronicInvoiceSale(s)).length;
  const totalElectronicPending = sales.filter(
    (s) => isElectronicInvoiceSale(s) && s.electronicInvoiceStatus !== 'emitida'
  ).length;

  const handleCopyBillingData = (sale: SaleReceipt) => {
    const custName = sale.customerName?.trim() || sale.billingInfo?.customerName?.trim() || 'Consumidor Final';
    const docFormatted =
      formatCustomerDocument(
        sale.customerDocumentType || sale.billingInfo?.documentType,
        sale.customerDocumentNumber || sale.billingInfo?.documentNumber
      ) || 'Sin documento';
    const email = getSaleCustomerEmail(sale) || 'Sin correo';
    const baseAmount = Math.round(sale.subtotal - sale.discountAmount - sale.taxAmount);
    const taxLines = getReceiptTaxLines(sale)
      .map((line) => `${line.label.replace(/:$/, '')}: ${Math.round(line.amount)}`)
      .join(' | ');
    const textToCopy = `Cliente: ${custName} | Documento: ${docFormatted} | Correo: ${email} | Base: ${baseAmount} | ${taxLines} | Total: ${Math.round(sale.total)} COP`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
      setCopiedId(sale.id);
      setTimeout(() => setCopiedId((prev) => (prev === sale.id ? null : prev)), 2200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className={`w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[94vh] flex flex-col ${isCalendarOpen ? 'min-h-[580px]' : ''}`}
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
                Historial de Ventas y Facturación Electrónica
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Auditoría por día, cobros de caja y clientes que solicitaron Factura Electrónica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Exportar Facturación Electrónica o Venta Global en Excel (.xlsx) para Siigo, Alegra o Control Interno"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Exportar Excel FE (.xlsx)</span>
              <span className="sm:hidden">Excel FE</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="p-3 sm:p-5 pb-3 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold block">Total Facturado</span>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {formatCOP(totalRevenue)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">{sales.length} tickets emitidos</p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-orange-500 shrink-0" />
              <span>Tarjeta (TPV)</span>
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {formatCOP(cardRevenue)}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <Banknote className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Efectivo en Caja</span>
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {formatCOP(cashRevenue)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setInvoiceFilter((prev) => (prev === 'electronic' ? 'all' : 'electronic'));
              if (!selectedDate && invoiceFilter === 'all') {
                setSelectedDate(todayKey);
              }
            }}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
              invoiceFilter === 'electronic'
                ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-400 dark:border-orange-600'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-orange-300 dark:hover:border-orange-700'
            }`}
          >
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
              <Mail className="w-3 h-3 text-orange-500 shrink-0" />
              <span>Facturación Electrónica</span>
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {totalElectronicCount} {totalElectronicCount === 1 ? 'cliente' : 'clientes'}
            </p>
            <p className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold mt-0.5 tabular-nums">
              {totalElectronicPending > 0
                ? `${totalElectronicPending} pendiente(s) por emitir`
                : 'Al día · Toca para filtrar'}
            </p>
          </button>
        </div>

        {/* Search, Electronic Invoice Mode Toggle & Calendar Day Filter Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Mode Filter: All Tickets vs Electronic Invoice Customers */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setInvoiceFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  invoiceFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todos ({dayScopedSales.length})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceFilter('electronic')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  invoiceFilter === 'electronic'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400'
                }`}
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>Facturación Electrónica ({dayElectronicSales.length})</span>
              </button>
            </div>

            {/* Text Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente, NIT/cédula, correo electrónico, mesa o cajero..."
                className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            {/* Calendar Day Selector */}
            <div ref={calendarContainerRef} className="relative flex items-center gap-1.5 shrink-0">
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => handleSelectDay(shiftDateKey(selectedDate, -1))}
                  title="Día anterior"
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (selectedDate) {
                    const parsed = parseDateKeyLocal(selectedDate);
                    if (parsed) {
                      setViewMonthDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
                    }
                  }
                  setIsCalendarOpen((prev) => !prev);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedDate
                    ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>{selectedDate ? formatButtonDate(selectedDate) : 'Buscar por día'}</span>
              </button>

              {selectedDate ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectDay(shiftDateKey(selectedDate, 1))}
                    title="Día siguiente"
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate('')}
                    title="Ver todas las fechas"
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelectDay(todayKey)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-600 dark:hover:text-orange-400 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  Hoy
                </button>
              )}

              {/* Interactive Calendar Popover */}
              {isCalendarOpen && (
                <div className="absolute right-0 top-full mt-2 z-30 w-72 sm:w-80 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                  <div className="flex items-center justify-between mb-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setViewMonthDate(new Date(viewMonthDate.getFullYear(), viewMonthDate.getMonth() - 1, 1))
                      }
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Mes anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {MONTH_NAMES_ES[viewMonthDate.getMonth()]} {viewMonthDate.getFullYear()}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setViewMonthDate(new Date(viewMonthDate.getFullYear(), viewMonthDate.getMonth() + 1, 1))
                      }
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Mes siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                    {WEEKDAYS_ES.map((dayLabel) => (
                      <span key={dayLabel} className="text-[10px] font-bold uppercase text-slate-400 py-1">
                        {dayLabel}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell) => {
                      const isSelected = cell.dateKey === selectedDate;
                      const isToday = cell.dateKey === todayKey;
                      const dayStats = salesByDayMap.get(cell.dateKey);
                      const hasFE = (dayStats?.electronicCount || 0) > 0;

                      return (
                        <button
                          key={cell.dateKey}
                          type="button"
                          onClick={() => handleSelectDay(cell.dateKey)}
                          title={
                            dayStats
                              ? `${dayStats.count} factura(s)${
                                  dayStats.electronicCount > 0
                                    ? ` · ${dayStats.electronicCount} Fact. Electrónica`
                                    : ''
                                } · ${formatCOP(dayStats.total)}`
                              : undefined
                          }
                          className={`relative h-8 rounded-lg text-xs flex flex-col items-center justify-center transition cursor-pointer tabular-nums ${
                            isSelected
                              ? 'bg-orange-500 text-white font-bold shadow-xs'
                              : isToday
                              ? 'ring-1 ring-orange-400 text-orange-600 dark:text-orange-400 font-bold bg-orange-50/60 dark:bg-orange-950/30'
                              : cell.isCurrentMonth
                              ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              : 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <span className="leading-none">{cell.dayNumber}</span>
                          {dayStats && (
                            <span className="flex items-center gap-0.5 mt-0.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSelected ? 'bg-white' : 'bg-emerald-500'
                                }`}
                              />
                              {hasFE && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isSelected ? 'bg-amber-200' : 'bg-orange-500'
                                  }`}
                                />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Ventas
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        Fact. Electrónica
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectDay(todayKey)}
                        className="px-2 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold hover:bg-orange-100 dark:hover:bg-orange-950/70 transition cursor-pointer"
                      >
                        Hoy
                      </button>
                      {selectedDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate('');
                            setIsCalendarOpen(false);
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          Ver todas
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Electronic Invoicing Status Sub-Filter + Day Context Strip */}
          {(invoiceFilter === 'electronic' || selectedDate) && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                {invoiceFilter === 'electronic' && (
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setFeStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        feStatusFilter === 'all'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      Todas ({dayElectronicSales.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeStatusFilter('pendiente')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        feStatusFilter === 'pendiente'
                          ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      Pendientes ({dayElectronicPendingCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeStatusFilter('emitida')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        feStatusFilter === 'emitida'
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      Emitidas ({dayElectronicIssuedCount})
                    </button>
                  </div>
                )}

                <span className="text-slate-600 dark:text-slate-300">
                  {selectedDate ? (
                    <>
                      <strong className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        {filteredSales.length}
                      </strong>{' '}
                      {invoiceFilter === 'electronic'
                        ? filteredSales.length === 1
                          ? 'cliente para Facturación Electrónica'
                          : 'clientes para Facturación Electrónica'
                        : filteredSales.length === 1
                        ? 'factura emitida'
                        : 'facturas emitidas'}{' '}
                      · <span className="capitalize">{formatFullDateLabel(selectedDate)}</span>
                    </>
                  ) : (
                    <>
                      Mostrando{' '}
                      <strong className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        {filteredSales.length}
                      </strong>{' '}
                      clientes con solicitud de Facturación Electrónica (todas las fechas) ·{' '}
                      <button
                        type="button"
                        onClick={() => handleSelectDay(todayKey)}
                        className="font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                      >
                        Filtrar solo Hoy
                      </button>
                    </>
                  )}
                </span>
              </div>

              <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                Total listado:{' '}
                <span className="text-orange-600 dark:text-orange-400">{formatCOP(filteredDayTotal)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Sales Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-3">
          {filteredSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2.5">
              {sales.length === 0 ? (
                <span>
                  No hay tickets registrados todavía. Al cerrar una cuenta en el módulo de mesas aparecerá aquí.
                </span>
              ) : (
                <>
                  <span>
                    {invoiceFilter === 'electronic'
                      ? `No hay clientes con solicitud de Facturación Electrónica para ${
                          selectedDate ? `el día ${formatButtonDate(selectedDate)}` : 'el filtro actual'
                        }.`
                      : `No se encontraron facturas para ${
                          selectedDate ? `el día ${formatButtonDate(selectedDate)}` : 'la búsqueda actual'
                        }.`}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {selectedDate && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate('')}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        Ver todas las fechas
                      </button>
                    )}
                    {(invoiceFilter === 'electronic' || feStatusFilter !== 'all' || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceFilter('all');
                          setFeStatusFilter('all');
                          setSearchQuery('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold hover:bg-orange-100 dark:hover:bg-orange-950/70 transition cursor-pointer"
                      >
                        Mostrar todos los tickets
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[780px]">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Ticket / Fecha</th>
                    <th className="px-4 py-3">Mesa</th>
                    <th className="px-4 py-3">Cliente / Identificación / Correo</th>
                    <th className="px-4 py-3">Factura Electrónica</th>
                    <th className="px-4 py-3">Cobrado por</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSales.map((sale) => {
                    const custName =
                      sale.customerName?.trim() ||
                      sale.billingInfo?.customerName?.trim() ||
                      'Consumidor Final';
                    const docFormatted = formatCustomerDocument(
                      sale.customerDocumentType || sale.billingInfo?.documentType,
                      sale.customerDocumentNumber || sale.billingInfo?.documentNumber
                    );
                    const custEmail = getSaleCustomerEmail(sale);
                    const needsFE = isElectronicInvoiceSale(sale);
                    const isIssuedFE = sale.electronicInvoiceStatus === 'emitida';
                    const isCopied = copiedId === sale.id;

                    return (
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3">
                          <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            #{sale.id.slice(-6)}
                          </span>
                          <span className="block text-[10px] font-mono tabular-nums text-slate-400">
                            {new Date(sale.timestamp).toLocaleString('es-CO', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {sale.tableName}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                            {custName}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 block">
                            {docFormatted || 'Sin documento'}
                          </span>
                          {custEmail && (
                            <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-0.5 break-all">
                              <Mail className="w-3 h-3 shrink-0" />
                              <span>{custEmail}</span>
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {needsFE ? (
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateElectronicInvoiceStatus(
                                    sale.id,
                                    isIssuedFE ? 'pendiente' : 'emitida'
                                  )
                                }
                                title="Clic para cambiar estado de Factura Electrónica (Pendiente / Emitida)"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                                  isIssuedFE
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {isIssuedFE ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span>FE Emitida</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>Pendiente FE</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyBillingData(sale)}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition cursor-pointer whitespace-nowrap"
                                title="Copiar nombre, documento, correo y valores para facturador electrónico"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span className="text-emerald-600 dark:text-emerald-400">Datos copiados</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar datos FE</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">POS estándar</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-700 dark:text-slate-300 block">
                            {sale.cashierName}
                          </span>
                          {sale.cashierRole && (
                            <span className="text-[10px] text-slate-400 block">
                              {sale.cashierRole}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium capitalize text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {sale.paymentMethod === 'tarjeta' && (
                              <CreditCard className="w-3 h-3 text-orange-500 shrink-0" />
                            )}
                            {sale.paymentMethod === 'efectivo' && (
                              <Banknote className="w-3 h-3 text-emerald-500 shrink-0" />
                            )}
                            {sale.paymentMethod === 'bizum' && (
                              <Smartphone className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                            {sale.paymentMethod === 'bizum' ? 'Transferencia / QR' : sale.paymentMethod}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                          {formatCOP(sale.total)}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3 text-orange-500" />
                            <span>Ver Ticket</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* Sub-modal: Excel (.xlsx) Electronic Invoicing Export */}
      <BillingExcelExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        sales={sales}
        productsCatalog={products}
        appName={config.appName}
        initialSelectedDate={selectedDate}
        initialInvoiceFilter={invoiceFilter}
      />
    </div>
  );
};
