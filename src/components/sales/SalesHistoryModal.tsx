import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SaleReceipt } from '../../types';
import { formatCOP } from '../../utils/currency';
import { formatCustomerDocument } from '../../utils/billing';
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
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ReceiptModal } from '../tables/ReceiptModal';

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
  const { config, sales } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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
    const map = new Map<string, { count: number; total: number }>();
    for (const sale of sales) {
      const key = toLocalDateKey(sale.timestamp);
      if (!key) continue;
      const prev = map.get(key) || { count: 0, total: 0 };
      map.set(key, { count: prev.count + 1, total: prev.total + sale.total });
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

  const filteredSales = sales.filter((s) => {
    if (selectedDate) {
      const saleDayKey = toLocalDateKey(s.timestamp);
      if (saleDayKey !== selectedDate) return false;
    }
    const term = searchQuery.trim().toLowerCase();
    if (!term) return true;
    const custName = (s.customerName || s.billingInfo?.customerName || 'consumidor final').toLowerCase();
    const custDoc = (s.customerDocumentNumber || s.billingInfo?.documentNumber || '').toLowerCase();
    return (
      s.tableName.toLowerCase().includes(term) ||
      s.cashierName.toLowerCase().includes(term) ||
      custName.includes(term) ||
      custDoc.includes(term) ||
      s.id.toLowerCase().includes(term)
    );
  });

  const filteredDayTotal = filteredSales.reduce((sum, s) => sum + s.total, 0);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const cardRevenue = sales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0);
  const cashRevenue = sales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0);
  const averageTicket = sales.length > 0 ? (totalRevenue / sales.length) : 0;

  const handleExportCSV = () => {
    const headers = 'ID Ticket,Fecha,Mesa,Cliente,Tipo Documento,Numero Documento,Cobrado Por,Metodo Pago,Subtotal,IVA,Descuento,Propina,Total\n';
    const rows = filteredSales.map(s => {
      const custName = s.customerName || s.billingInfo?.customerName || 'Consumidor Final';
      const docType = s.customerDocumentType || s.billingInfo?.documentType || 'CONSUMIDOR_FINAL';
      const docNum = s.customerDocumentNumber || s.billingInfo?.documentNumber || '';
      return `"${s.id}","${s.timestamp}","${s.tableName}","${custName}","${docType}","${docNum}","${s.cashierName}","${s.paymentMethod}",${s.subtotal},${s.taxAmount},${s.discountAmount},${s.tipAmount},${s.total}`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const exportSuffix = selectedDate || new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Ventas_${config.appName}_${exportSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div 
        className={`w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[94vh] flex flex-col ${isCalendarOpen ? 'min-h-[560px]' : ''}`}
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

        {/* Search & Calendar Filter Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por mesa, cliente, NIT/cédula, cajero o ticket..."
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
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
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
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  title="Ver todas las fechas"
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectDay(todayKey)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-600 dark:hover:text-orange-400 transition"
              >
                Hoy
              </button>
            )}

            {/* Interactive Calendar Popover */}
            {isCalendarOpen && (
              <div className="absolute right-0 top-full mt-2 z-30 w-72 sm:w-80 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                {/* Month / Year Navigation */}
                <div className="flex items-center justify-between mb-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMonthDate(new Date(viewMonthDate.getFullYear(), viewMonthDate.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Mes anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {MONTH_NAMES_ES[viewMonthDate.getMonth()]} {viewMonthDate.getFullYear()}
                  </span>

                  <button
                    type="button"
                    onClick={() => setViewMonthDate(new Date(viewMonthDate.getFullYear(), viewMonthDate.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Mes siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                  {WEEKDAYS_ES.map((dayLabel) => (
                    <span key={dayLabel} className="text-[10px] font-bold uppercase text-slate-400 py-1">
                      {dayLabel}
                    </span>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell) => {
                    const isSelected = cell.dateKey === selectedDate;
                    const isToday = cell.dateKey === todayKey;
                    const dayStats = salesByDayMap.get(cell.dateKey);

                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => handleSelectDay(cell.dateKey)}
                        title={
                          dayStats
                            ? `${dayStats.count} factura(s) · ${formatCOP(dayStats.total)}`
                            : undefined
                        }
                        className={`relative h-8 rounded-lg text-xs flex flex-col items-center justify-center transition ${
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
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                              isSelected ? 'bg-white' : 'bg-emerald-500'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend & Quick Actions */}
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Día con facturas
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectDay(todayKey)}
                      className="px-2 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold hover:bg-orange-100 dark:hover:bg-orange-950/70 transition"
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
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        Ver todas
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Day Summary Strip */}
          {selectedDate && (
            <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/70 text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 capitalize">
                <strong className="font-semibold text-slate-900 dark:text-white">{filteredSales.length}</strong>{' '}
                {filteredSales.length === 1 ? 'factura emitida' : 'facturas emitidas'} · {formatFullDateLabel(selectedDate)}
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                Total del día: <span className="text-orange-600 dark:text-orange-400">{formatCOP(filteredDayTotal)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Sales Table */}
        <div className="flex-1 overflow-y-auto p-6 pt-2">
          {filteredSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              {sales.length === 0 ? (
                <span>No hay tickets registrados todavía. Al cerrar una cuenta en el módulo de mesas aparecerá aquí.</span>
              ) : (
                <>
                  <span>
                    No se encontraron facturas para {selectedDate ? `el día ${formatButtonDate(selectedDate)}` : 'la búsqueda actual'}.
                  </span>
                  {(selectedDate || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate('');
                        setSearchQuery('');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold hover:bg-orange-100 dark:hover:bg-orange-950/70 transition"
                    >
                      Mostrar todas las facturas
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Ticket / Fecha</th>
                    <th className="px-4 py-3">Mesa</th>
                    <th className="px-4 py-3">Cliente / Identificación</th>
                    <th className="px-4 py-3">Cobrado por</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-center">Líneas</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSales.map((sale) => {
                    const custName = sale.customerName?.trim() || sale.billingInfo?.customerName?.trim() || 'Consumidor Final';
                    const docFormatted = formatCustomerDocument(
                      sale.customerDocumentType || sale.billingInfo?.documentType,
                      sale.customerDocumentNumber || sale.billingInfo?.documentNumber
                    );
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3">
                          <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            #{sale.id.slice(-6)}
                          </span>
                          <span className="block text-[10px] font-mono tabular-nums text-slate-400">
                            {new Date(sale.timestamp).toLocaleString('es-CO', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {sale.tableName}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                            {custName}
                          </span>
                          {docFormatted ? (
                            <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 block">
                              {docFormatted}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block">Sin documento</span>
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
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium capitalize text-slate-700 dark:text-slate-300">
                            {sale.paymentMethod === 'tarjeta' && <CreditCard className="w-3 h-3 text-orange-500" />}
                            {sale.paymentMethod === 'efectivo' && <Banknote className="w-3 h-3 text-emerald-500" />}
                            {sale.paymentMethod === 'bizum' && <Smartphone className="w-3 h-3 text-blue-500" />}
                            {sale.paymentMethod === 'bizum' ? 'Transferencia / QR' : sale.paymentMethod}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center font-mono tabular-nums text-slate-500">
                          {sale.items.reduce((acc, it) => acc + it.quantity, 0)} uds
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
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
    </div>
  );
};
