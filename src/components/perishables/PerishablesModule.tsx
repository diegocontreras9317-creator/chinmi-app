import React, { useState, useMemo, useEffect } from 'react';
import {
  Apple,
  Search,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  BellOff,
  Volume2,
  Trash2,
  Edit2,
  Filter,
  LayoutGrid,
  List,
  Calendar,
  MapPin,
  Truck,
  Hash,
  ArrowDownUp,
  Download,
  Flame,
  Sparkles,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PerishableItem, PerishableCategory } from '../../types';
import {
  PERISHABLE_CATEGORIES,
  calculateDaysRemaining,
  getExpiryStatus,
  getExpiryBadgeConfig
} from '../../utils/perishableUtils';
import { playExpiryAlarm } from '../../utils/audioAlert';
import { formatCOP } from '../../utils/currency';
import { NewPerishableModal } from './NewPerishableModal';
import { PerishableWasteModal } from './PerishableWasteModal';

interface PerishablesModuleProps {
  onOpenSubscription?: () => void;
}

type FilterStatus = 'all' | 'expired' | 'expiring_soon' | 'low_stock' | 'fresh';

export const PerishablesModule: React.FC<PerishablesModuleProps> = () => {
  const {
    perishables,
    addPerishable,
    updatePerishable,
    deletePerishable,
    adjustPerishableQuantity,
    recordPerishableWaste,
    recordPerishableRestock
  } = useApp();

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  // Card size state: 'sm' (Pequeño), 'md' (Mediano), 'lg' (Grande)
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      return (localStorage.getItem('chinmi_despensa_card_size') as 'sm' | 'md' | 'lg') || 'md';
    } catch {
      return 'md';
    }
  });

  const allCategories = useMemo(() => {
    const set = new Set<string>(PERISHABLE_CATEGORIES);
    perishables.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [perishables]);

  useEffect(() => {
    try {
      localStorage.setItem('chinmi_despensa_card_size', cardSize);
    } catch {
      // ignore
    }
  }, [cardSize]);

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PerishableItem | null>(null);
  const [wasteModalItem, setWasteModalItem] = useState<PerishableItem | null>(null);
  const [wasteModalMode, setWasteModalMode] = useState<'waste' | 'restock'>('waste');

  // Compute metrics and alarms
  const metrics = useMemo(() => {
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let lowStockCount = 0;
    let freshCount = 0;

    perishables.forEach((item) => {
      const days = calculateDaysRemaining(item.expiryDate);
      const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
      
      if (status === 'expired' || status === 'expires_today') {
        expiredCount++;
      } else if (status === 'expiring_soon') {
        expiringSoonCount++;
      } else {
        freshCount++;
      }

      if (item.quantity <= item.minStock) {
        lowStockCount++;
      }
    });

    return {
      total: perishables.length,
      expired: expiredCount,
      expiringSoon: expiringSoonCount,
      lowStock: lowStockCount,
      fresh: freshCount,
      hasAlarms: expiredCount > 0 || expiringSoonCount > 0
    };
  }, [perishables]);

  // Alarma sonora al ingresar si hay alimentos críticos
  useEffect(() => {
    if (!soundEnabled) return;
    if (metrics.expired > 0) {
      playExpiryAlarm('critical');
    } else if (metrics.expiringSoon > 0) {
      playExpiryAlarm('warning');
    }
  }, []); // Run once on mount

  // Filter items
  const filteredItems = useMemo(() => {
    return perishables.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.supplier && item.supplier.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.location && item.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.batchNumber && item.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
      const isLowStock = item.quantity <= item.minStock;

      let matchesStatus = true;
      if (statusFilter === 'expired') {
        matchesStatus = status === 'expired' || status === 'expires_today';
      } else if (statusFilter === 'expiring_soon') {
        matchesStatus = status === 'expiring_soon';
      } else if (statusFilter === 'low_stock') {
        matchesStatus = isLowStock;
      } else if (statusFilter === 'fresh') {
        matchesStatus = status === 'fresh';
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [perishables, searchTerm, selectedCategory, statusFilter]);

  const handleTestAlarm = (type: 'critical' | 'warning' = 'critical') => {
    playExpiryAlarm(type);
  };

  const handleExportCSV = () => {
    if (perishables.length === 0) return;

    const headers = [
      'ID',
      'Nombre Alimento',
      'Categoria',
      'Cantidad',
      'Unidad',
      'Stock Minimo',
      'Fecha Ingreso',
      'Fecha Caducidad',
      'Dias Restantes',
      'Estado',
      'Ubicacion',
      'Proveedor',
      'Lote',
      'Costo COP'
    ];

    const rows = perishables.map((item) => {
      const days = calculateDaysRemaining(item.expiryDate);
      const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
      return [
        `"${item.id}"`,
        `"${item.name}"`,
        `"${item.category}"`,
        item.quantity,
        `"${item.unit}"`,
        item.minStock,
        item.entryDate,
        item.expiryDate,
        days,
        `"${status}"`,
        `"${item.location}"`,
        `"${item.supplier || ''}"`,
        `"${item.batchNumber || ''}"`,
        item.costPerUnit || 0
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventario_perecederos_chinmi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      
      {/* HEADER WITH TITLE & MAIN ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-md bg-rose-950 text-white flex items-center justify-center shadow-xs shrink-0">
              <Apple className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Despensa & Insumos Frescos
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control de ingreso, fecha de caducidad y alarma para verduras, frutas e insumos de bar y cocina
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full sm:w-auto">
          {/* Sound Alarm Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextState = !soundEnabled;
              setSoundEnabled(nextState);
              if (nextState) {
                playExpiryAlarm('warning');
              }
            }}
            title={soundEnabled ? 'Alarma sonora activa (Toca para silenciar)' : 'Alarma sonora silenciada (Toca para activar)'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
              soundEnabled
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-600 animate-pulse" /> : <BellOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Alarma Sonora ON' : 'Silenciada'}</span>
          </button>

          {/* Test Alarm Button */}
          <button
            type="button"
            onClick={() => handleTestAlarm('critical')}
            title="Probar sonido de alarma de caducidad"
            className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1.5"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Probar Alarma</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            title="Exportar inventario de perecederos a Excel/CSV"
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Exportar CSV</span>
          </button>

          {/* Add Perishable Button */}
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setIsNewModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-md bg-rose-950 hover:bg-rose-900 text-white text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nuevo Insumo</span>
          </button>
        </div>
      </div>

      {/* ALARM BANNER (When critical items exist) */}
      {metrics.hasAlarms && (
        <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-transparent border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black shrink-0 animate-bounce">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>Alarma de Insumos Críticos</span>
                {metrics.expired > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider">
                    {metrics.expired} Caducado{metrics.expired === 1 ? '' : 's'}
                  </span>
                )}
                {metrics.expiringSoon > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-slate-950 uppercase tracking-wider">
                    {metrics.expiringSoon} Próximo{metrics.expiringSoon === 1 ? '' : 's'} a vencer
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Revisa los insumos marcados para retirar alimentos vencidos o dar prioridad de uso en cocina y barra.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Ver Caducados
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expiring_soon')}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition cursor-pointer"
            >
              Ver Próximos
            </button>
          </div>
        </div>
      )}

      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Total Insumos */}
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider block opacity-70">
            Total Insumos
          </span>
          <span className="text-2xl font-black font-mono mt-1 block">
            {metrics.total}
          </span>
          <span className="text-[10px] opacity-75 mt-0.5 block">
            En cocina y barra
          </span>
        </button>

        {/* Caducados (Alarma Crítica) */}
        <button
          type="button"
          onClick={() => setStatusFilter('expired')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer relative overflow-hidden ${
            statusFilter === 'expired'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/30'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 hover:border-rose-300'
          }`}
        >
          {metrics.expired > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider block flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-3 h-3" />
            <span>Caducados</span>
          </span>
          <span className="text-2xl font-black font-mono mt-1 block">
            {metrics.expired}
          </span>
          <span className="text-[10px] opacity-80 mt-0.5 block">
            Retirar o desechar
          </span>
        </button>

        {/* Por Vencer Pronto (1-3 días) */}
        <button
          type="button"
          onClick={() => setStatusFilter('expiring_soon')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'expiring_soon'
              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 hover:border-amber-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider block flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            <span>Por Vencer</span>
          </span>
          <span className="text-2xl font-black font-mono mt-1 block">
            {metrics.expiringSoon}
          </span>
          <span className="text-[10px] opacity-80 mt-0.5 block">
            Próximos 1-3 días
          </span>
        </button>

        {/* Stock Bajo */}
        <button
          type="button"
          onClick={() => setStatusFilter('low_stock')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'low_stock'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 hover:border-blue-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider block flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <ArrowDownUp className="w-3 h-3" />
            <span>Stock Bajo</span>
          </span>
          <span className="text-2xl font-black font-mono mt-1 block">
            {metrics.lowStock}
          </span>
          <span className="text-[10px] opacity-80 mt-0.5 block">
            Bajo el mínimo
          </span>
        </button>

        {/* Óptimos & Frescos */}
        <button
          type="button"
          onClick={() => setStatusFilter('fresh')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer col-span-2 sm:col-span-1 ${
            statusFilter === 'fresh'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 hover:border-emerald-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider block flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span>Frescos</span>
          </span>
          <span className="text-2xl font-black font-mono mt-1 block">
            {metrics.fresh}
          </span>
          <span className="text-[10px] opacity-80 mt-0.5 block">
            Consumo óptimo
          </span>
        </button>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-md border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por verdura, fruta, licor/bar, lote, ubicación o proveedor..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-900 dark:text-white placeholder:text-slate-400 outline-hidden focus:ring-2 focus:ring-rose-900"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Dropdown & View Mode Controls */}
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 sm:flex-initial px-3 py-2 text-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-200 font-medium min-w-[130px]"
            >
              <option value="all">Todas las Categorías</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-md border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Vista en tarjetas"
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 font-bold shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Vista en tabla"
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 font-bold shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Tamaño: Grande, Mediano, Pequeño */}
            {viewMode === 'grid' && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setCardSize('sm')}
                  title="Ver despensa en tamaño pequeño (compacta)"
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    cardSize === 'sm'
                      ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Pequeño
                </button>
                <button
                  type="button"
                  onClick={() => setCardSize('md')}
                  title="Ver despensa en tamaño mediano (estándar)"
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    cardSize === 'md'
                      ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Mediano
                </button>
                <button
                  type="button"
                  onClick={() => setCardSize('lg')}
                  title="Ver despensa en tamaño grande (amplia)"
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    cardSize === 'lg'
                      ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Grande
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter Badges Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs w-full max-w-full touch-pan-x overscroll-x-contain scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Filtrar:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md font-bold transition cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-rose-950 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            Todos ({metrics.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1 rounded-xl font-bold transition cursor-pointer shrink-0 flex items-center gap-1 ${
              statusFilter === 'expired'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
            }`}
          >
            <span>🚨 Caducados ({metrics.expired})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expiring_soon')}
            className={`px-3 py-1 rounded-xl font-bold transition cursor-pointer shrink-0 flex items-center gap-1 ${
              statusFilter === 'expiring_soon'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
            }`}
          >
            <span>⏳ Por Vencer ({metrics.expiringSoon})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('low_stock')}
            className={`px-3 py-1 rounded-xl font-bold transition cursor-pointer shrink-0 flex items-center gap-1 ${
              statusFilter === 'low_stock'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
            }`}
          >
            <span>⚠️ Stock Bajo ({metrics.lowStock})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('fresh')}
            className={`px-3 py-1 rounded-xl font-bold transition cursor-pointer shrink-0 flex items-center gap-1 ${
              statusFilter === 'fresh'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
            }`}
          >
            <span>🌿 Óptimos ({metrics.fresh})</span>
          </button>
        </div>
      </div>

      {/* ITEMS DISPLAY */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="w-14 h-14 mx-auto rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 flex items-center justify-center">
            <Apple className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No se encontraron insumos perecederos
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm || selectedCategory !== 'all' || statusFilter !== 'all'
              ? 'Prueba cambiando los filtros de búsqueda o categoría.'
              : 'Comienza agregando verduras, frutas, hierbas de coctelería u otros alimentos para monitorear su vencimiento.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setIsNewModalOpen(true);
            }}
            className="px-4 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
          >
            + Registrar Primer Alimento
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div
          className={
            cardSize === 'sm'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
              : cardSize === 'lg'
              ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          }
        >
          {filteredItems.map((item) => {
            const daysRemaining = calculateDaysRemaining(item.expiryDate);
            const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
            const badge = getExpiryBadgeConfig(status, daysRemaining);
            const isLowStock = item.quantity <= item.minStock;

            {/* === DESPENSA TAMAÑO PEQUEÑO (COMPACTA) === */}
            if (cardSize === 'sm') {
              return (
                <div
                  key={item.id}
                  id={`perishable-card-${item.id}`}
                  className={`rounded-2xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md p-2.5 ${
                    status === 'expired'
                      ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/20'
                      : status === 'expires_today'
                      ? 'border-orange-300 dark:border-orange-900/80 bg-orange-50/20'
                      : status === 'expiring_soon'
                      ? 'border-amber-300 dark:border-amber-900/80 bg-amber-50/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {/* Banner Compacto */}
                    <div className="relative h-20 w-full bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden mb-2">
                      <img
                        src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                      <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-0.5">
                        <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider shadow-xs flex items-center gap-0.5 ${badge.badgeColor}`}>
                          <span>{badge.emoji}</span>
                          <span>{daysRemaining < 0 ? 'Vencido' : `${daysRemaining}d`}</span>
                        </span>
                      </div>

                      <div className="absolute bottom-1 left-1.5">
                        <span className="text-[8px] font-bold text-white px-1.5 py-0.2 rounded bg-black/60">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {/* Info Compacta */}
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate" title={item.name}>
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 text-stone-500 shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </p>
                    </div>

                    {/* Stock & Expiry */}
                    <div className="mt-2 p-1.5 rounded-md bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs">
                      <span className="font-mono font-black text-xs text-stone-900 dark:text-stone-100">
                        {item.quantity} <span className="text-[10px] font-normal">{item.unit}</span>
                      </span>
                      <span className={`text-[10px] font-bold ${
                        daysRemaining < 0 ? 'text-rose-600' : daysRemaining <= 3 ? 'text-amber-600' : 'text-slate-500'
                      }`}>
                        Vence: {item.expiryDate.split('-').slice(1).join('/')}
                      </span>
                    </div>
                  </div>

                  {/* Acciones Compactas */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setWasteModalItem(item);
                          setWasteModalMode('waste');
                        }}
                        title="Registrar merma o desecho"
                        className="px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold text-[10px] border border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                      >
                        Baja
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWasteModalItem(item);
                          setWasteModalMode('restock');
                        }}
                        title="Registrar entrada"
                        className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                      >
                        + Entrada
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setIsNewModalOpen(true);
                      }}
                      title="Editar"
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }

            {/* === DESPENSA TAMAÑO GRANDE (AMPLIA Y DETALLADA) === */}
            if (cardSize === 'lg') {
              return (
                <div
                  key={item.id}
                  id={`perishable-card-${item.id}`}
                  className={`rounded-3xl bg-white dark:bg-slate-900 border-2 transition-all flex flex-col justify-between overflow-hidden shadow-md hover:shadow-xl ${
                    status === 'expired'
                      ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/20'
                      : status === 'expires_today'
                      ? 'border-orange-300 dark:border-orange-900/80 bg-orange-50/20'
                      : status === 'expiring_soon'
                      ? 'border-amber-300 dark:border-amber-900/80 bg-amber-50/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {/* Top Image Banner Grande */}
                    <div className="relative h-48 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

                      {/* Expiry Alarm Badge Grande */}
                      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                        <span className={`px-3 py-1.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-1.5 ${badge.badgeColor}`}>
                          <span className="text-sm">{badge.emoji}</span>
                          <span>{badge.label}</span>
                        </span>

                        {isLowStock && (
                          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-blue-600 text-white shadow-xs">
                            ⚠️ Stock Bajo
                          </span>
                        )}
                      </div>

                      {/* Category Pill */}
                      <div className="absolute bottom-3 left-3">
                        <span className="text-xs font-bold text-white px-3 py-1 rounded-xl bg-black/60 backdrop-blur-xs">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {/* Body Content Grande */}
                    <div className="p-5 space-y-4">
                      <div>
                        <h4 className="font-black text-xl text-slate-900 dark:text-white leading-snug">
                          {item.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                          <span className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2.5 py-0.5 rounded-md font-medium border border-stone-200 dark:border-stone-700">
                            <MapPin className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                            <span>{item.location}</span>
                          </span>
                          {item.supplier && (
                            <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg font-medium">
                              Proveedor: {item.supplier}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stock Grande */}
                      <div className="flex items-center justify-between p-3.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            Existencias en Despensa
                          </span>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-3xl font-black font-mono text-stone-900 dark:text-stone-100">
                              {item.quantity}
                            </span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                              {item.unit}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-400 block">
                            Mínimo de seguridad: {item.minStock} {item.unit}
                          </span>
                          {item.costPerUnit ? (
                            <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 block mt-0.5">
                              {formatCOP(item.costPerUnit)} / {item.unit}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Fechas Grande */}
                      <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-slate-400 font-medium block flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                            Ingreso:
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                            {item.entryDate}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 font-medium block flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            Fecha de Vencimiento:
                          </span>
                          <span className={`font-black mt-1 block ${
                            daysRemaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            {item.expiryDate}
                          </span>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-2xl border border-amber-200/50">
                          📝 {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Grande */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setWasteModalItem(item);
                          setWasteModalMode('waste');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-extrabold text-xs border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Baja / Merma</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setWasteModalItem(item);
                          setWasteModalMode('restock');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Entrada de Insumo</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(item);
                          setIsNewModalOpen(true);
                        }}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                        title="Editar insumo"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar "${item.name}" del inventario de insumos?`)) {
                            deletePerishable(item.id);
                          }
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="Eliminar insumo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            {/* === DESPENSA TAMAÑO MEDIANO (ESTÁNDAR) === */}
            return (
              <div
                key={item.id}
                id={`perishable-card-${item.id}`}
                className={`rounded-3xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                  status === 'expired'
                    ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/20'
                    : status === 'expires_today'
                    ? 'border-orange-300 dark:border-orange-900/80 bg-orange-50/20'
                    : status === 'expiring_soon'
                    ? 'border-amber-300 dark:border-amber-900/80 bg-amber-50/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  {/* Top Image Banner & Badges */}
                  <div className="relative h-36 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <img
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                    {/* Expiry Alarm Badge */}
                    <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1 ${badge.badgeColor}`}>
                        <span>{badge.emoji}</span>
                        <span>{badge.label}</span>
                      </span>

                      {isLowStock && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-600 text-white shadow-xs">
                          ⚠️ Stock Bajo
                        </span>
                      )}
                    </div>

                    {/* Category Pill */}
                    <div className="absolute bottom-2.5 left-3">
                      <span className="text-[10px] font-bold text-white/95 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-xs">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug line-clamp-1">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-stone-500" />
                          <span className="truncate max-w-[170px]">{item.location}</span>
                        </span>
                      </div>
                    </div>

                    {/* Inventory Level & Units */}
                    <div className="flex items-baseline justify-between p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Stock Disponible
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-xl font-black font-mono text-stone-900 dark:text-stone-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {item.unit}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 block">
                          Mínimo: {item.minStock} {item.unit}
                        </span>
                        {item.costPerUnit ? (
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {formatCOP(item.costPerUnit)}/{item.unit}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Dates Timeline */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-emerald-600" />
                          Ingreso:
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {item.entryDate}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Vence / Caduca:
                        </span>
                        <span className={`font-bold mt-0.5 block ${
                          daysRemaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                        }`}>
                          {item.expiryDate}
                        </span>
                      </div>
                    </div>

                    {/* Batch & Supplier info if available */}
                    {(item.batchNumber || item.supplier) && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {item.batchNumber && (
                          <span className="font-mono">Lote: {item.batchNumber}</span>
                        )}
                        {item.supplier && (
                          <span className="truncate max-w-[140px]">Prov: {item.supplier}</span>
                        )}
                      </div>
                    )}

                    {item.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200/50 line-clamp-2">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="p-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWasteModalItem(item);
                        setWasteModalMode('waste');
                      }}
                      title="Registrar merma o desecho de producto"
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold text-[11px] border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Baja / Merma</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setWasteModalItem(item);
                        setWasteModalMode('restock');
                      }}
                      title="Registrar entrada de lote y sumar stock"
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Entrada</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setIsNewModalOpen(true);
                      }}
                      title="Editar insumo"
                      className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar "${item.name}" del inventario de insumos?`)) {
                          deletePerishable(item.id);
                        }
                      }}
                      title="Eliminar insumo"
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold">
                  <th className="py-3 px-4">Alimento / Insumo</th>
                  <th className="py-3 px-3">Categoría</th>
                  <th className="py-3 px-3">Ubicación</th>
                  <th className="py-3 px-3">Fecha Ingreso</th>
                  <th className="py-3 px-3">Fecha Caducidad</th>
                  <th className="py-3 px-3">Alarma / Estado</th>
                  <th className="py-3 px-3 text-right">Stock Actual</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.map((item) => {
                  const daysRemaining = calculateDaysRemaining(item.expiryDate);
                  const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
                  const badge = getExpiryBadgeConfig(status, daysRemaining);
                  const isLowStock = item.quantity <= item.minStock;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-850/60 transition ${
                        status === 'expired' ? 'bg-rose-50/30 dark:bg-rose-950/15' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'}
                            alt={item.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {item.name}
                            </span>
                            {item.batchNumber && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                Lote: {item.batchNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {item.category}
                      </td>

                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-stone-500" />
                          <span>{item.location}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {item.entryDate}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {item.expiryDate}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black ${badge.badgeColor}`}>
                          <span>{badge.emoji}</span>
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-black text-sm text-stone-900 dark:text-stone-100">
                          {item.quantity} {item.unit}
                        </span>
                        {isLowStock && (
                          <span className="block text-[10px] text-blue-600 font-bold">
                            Min: {item.minStock}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setWasteModalItem(item);
                              setWasteModalMode('waste');
                            }}
                            title="Dar de baja / merma"
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWasteModalItem(item);
                              setWasteModalMode('restock');
                            }}
                            title="Entrada de lote"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setIsNewModalOpen(true);
                            }}
                            title="Editar"
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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
      )}

      {/* MODALS */}
      <NewPerishableModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setEditingItem(null);
        }}
        onSave={(itemData) => {
          if (editingItem) {
            updatePerishable(editingItem.id, itemData);
          } else {
            addPerishable(itemData);
          }
        }}
        editingItem={editingItem}
      />

      <PerishableWasteModal
        isOpen={!!wasteModalItem}
        onClose={() => setWasteModalItem(null)}
        item={wasteModalItem}
        mode={wasteModalMode}
        onConfirmWaste={(id, amount, reason) => {
          recordPerishableWaste(id, amount, reason);
        }}
        onConfirmRestock={(id, amount, newEntryDate, newExpiryDate) => {
          recordPerishableRestock(id, amount, newEntryDate, newExpiryDate);
        }}
      />

    </div>
  );
};
