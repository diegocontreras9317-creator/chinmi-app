import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Table, TableStatus } from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  Plus,
  Users,
  Clock,
  Receipt,
  Edit2,
  Trash2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Smile,
  QrCode,
  BellRing,
  ArrowRight,
  CreditCard
} from 'lucide-react';
import { NewTableModal } from './NewTableModal';
import { TableDetailModal } from './TableDetailModal';
import { CheckoutModal } from './CheckoutModal';
import { ReceiptModal } from './ReceiptModal';
import { TableQrModal } from './TableQrModal';
import { useAuth } from '../../context/AuthContext';

interface TablesModuleProps {
  onOpenSubscription: () => void;
}

export const TablesModule: React.FC<TablesModuleProps> = ({ onOpenSubscription }) => {
  const { user, isGerente } = useAuth();
  const {
    config,
    tables,
    deleteTable,
    selectedTableId,
    setSelectedTableId,
    latestReceipt,
    setLatestReceipt,
    canAddTable,
    setCustomerViewTableId,
    dismissWaiterCall
  } = useApp();

  const [selectedZone, setSelectedZone] = useState<string>('Todas las Zonas');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isNewTableOpen, setIsNewTableOpen] = useState(false);
  const [tableToEdit, setTableToEdit] = useState<Table | null>(null);
  const [tableForQr, setTableForQr] = useState<Table | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Card size state: 'sm' (Pequeño), 'md' (Mediano), 'lg' (Grande)
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      return (localStorage.getItem('chinmi_tables_card_size') as 'sm' | 'md' | 'lg') || 'md';
    } catch {
      return 'md';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('chinmi_tables_card_size', cardSize);
    } catch {
      // ignore
    }
  }, [cardSize]);

  // References for horizontal touch / mouse drag-to-scroll
  const zonesScrollRef = useRef<HTMLDivElement>(null);
  const statusScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const enableDragToScroll = (el: HTMLDivElement | null) => {
      if (!el) return () => {};
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      const handleMouseDown = (e: MouseEvent) => {
        isDown = true;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
      };

      const handleMouseLeave = () => {
        isDown = false;
      };

      const handleMouseUp = () => {
        isDown = false;
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.5;
        el.scrollLeft = scrollLeft - walk;
      };

      el.addEventListener('mousedown', handleMouseDown);
      el.addEventListener('mouseleave', handleMouseLeave);
      el.addEventListener('mouseup', handleMouseUp);
      el.addEventListener('mousemove', handleMouseMove);

      return () => {
        el.removeEventListener('mousedown', handleMouseDown);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeEventListener('mouseup', handleMouseUp);
        el.removeEventListener('mousemove', handleMouseMove);
      };
    };

    const cleanupZones = enableDragToScroll(zonesScrollRef.current);
    const cleanupStatus = enableDragToScroll(statusScrollRef.current);

    return () => {
      cleanupZones();
      cleanupStatus();
    };
  }, []);

  const tablesCalling = tables.filter(t => t.waiterCall || t.status === 'cuenta');

  // Active selected table
  const currentSelectedTable = tables.find(t => t.id === selectedTableId) || null;

  // Filters
  const filteredTables = tables.filter(tbl => {
    const matchesZone = selectedZone === 'Todas las Zonas' || tbl.zone === selectedZone;
    const matchesStatus = selectedStatus === 'all' || tbl.status === selectedStatus;
    return matchesZone && matchesStatus;
  });

  // Analytics / Counters
  const totalTables = tables.length;
  const occupiedCount = tables.filter(t => t.status === 'ocupada').length;
  const billingCount = tables.filter(t => t.status === 'cuenta').length;
  const freeCount = tables.filter(t => t.status === 'libre').length;
  const activeOrdersAmount = tables.reduce((acc, t) => {
    if (!t.order) return acc;
    const sub = t.order.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const disc = sub * (t.order.discountPercent / 100);
    const tax = (sub - disc) * (t.order.taxPercent / 100);
    return acc + (sub - disc + tax + t.order.tipAmount);
  }, 0);

  const occupancyRate = totalTables > 0 ? Math.round(((occupiedCount + billingCount) / totalTables) * 100) : 0;

  const handleEditTable = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation();
    setTableToEdit(table);
    setIsNewTableOpen(true);
  };

  const handleDeleteTable = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de eliminar esta mesa?')) {
      deleteTable(tableId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-3 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      
      {/* Friendly Guide Banner with Role Context */}
      <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-pink-50/70 dark:bg-slate-900 border border-pink-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 shadow-xs">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-pink-100 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 flex items-center justify-center shrink-0">
            <Smile className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#e64980]" />
          </div>
          <div>
            <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 font-medium">
              {isGerente && (
                <><strong>Modo Gerente (Control Total):</strong> Administra mesas, modifica precios de carta, revisa ventas y gestiona permisos de usuario.</>
              )}
              {user?.role === 'cajero' && (
                <><strong>Modo Caja (Solo Mesas y Cobro):</strong> Toca una mesa para ver pedidos en curso, aplicar medios de pago y emitir facturas/tickets.</>
              )}
              {user?.role === 'camarero' && (
                <><strong>Modo Camarero (Solo Mesas y Comandas):</strong> Toca una mesa para abrirla, añadir platos y bebidas o solicitar la cuenta.</>
              )}
              {user?.role === 'barman' && (
                <><strong>Modo Barman (Solo Barra y Bebidas):</strong> Revisa comandas de bebidas y actualiza el despacho de barra.</>
              )}
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              🟢 Verde = Libre · 🔴 Rojo = Ocupada · 🟣 Morado = Pidiendo cuenta
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 self-end sm:self-auto">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500" /> Libre</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500" /> Ocupada</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-purple-500" /> Cuenta</span>
        </div>
      </div>

      {/* Top Metrics Row with Red Ocupadas Card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Ocupación Actual</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{occupancyRate}%</span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {occupiedCount + billingCount} <span className="text-[10px] sm:text-xs font-normal text-slate-400">/ {totalTables}</span>
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 sm:h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div
              className="bg-[#e64980] h-full rounded-full transition-all duration-500"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Mesas Libres</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 sm:mt-2">
            {freeCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 sm:mt-1">Disponibles</p>
        </div>

        {/* Mesas Ocupadas en Rojo */}
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-red-50/60 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-900/60 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-red-700 dark:text-red-300">
            <span className="font-bold">Mesas Ocupadas</span>
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-red-500 shadow-xs" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-red-600 dark:text-red-400 mt-1.5 sm:mt-2">
            {occupiedCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-red-500/90 dark:text-red-400/80 mt-0.5 sm:mt-1 font-medium">Consumiendo ahora</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Pidiendo Cuenta</span>
            <span className="w-2 h-2 rounded-full bg-purple-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 mt-1.5 sm:mt-2">
            {billingCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 sm:mt-1">Listas para cobrar</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Comanda Activa</span>
            <Receipt className="w-3.5 h-3.5 text-[#e64980]" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-[#681841] dark:text-pink-400 mt-1.5 sm:mt-2 font-mono truncate">
            {formatCOP(activeOrdersAmount)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 sm:mt-1">Pendiente de cobro</p>
        </div>
      </div>

      {/* Action Header & Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5 sm:space-y-3 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-4 w-full max-w-full">
        
        {/* Zone Selector */}
        <div 
          ref={zonesScrollRef}
          className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing select-none w-full lg:w-auto"
        >
          <button
            onClick={() => setSelectedZone('Todas las Zonas')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              selectedZone === 'Todas las Zonas'
                ? 'bg-[#681841] text-white shadow-xs font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>Todas las Zonas</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              selectedZone === 'Todas las Zonas' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {totalTables}
            </span>
          </button>
          {config.zones.map((zone) => {
            const countInZone = tables.filter(t => t.zone === zone).length;
            const isSel = selectedZone === zone;
            return (
              <button
                key={zone}
                onClick={() => setSelectedZone(zone)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSel
                    ? 'bg-[#681841] text-white shadow-xs font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{zone}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSel ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {countInZone}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status Pills & Add Table Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-2.5 pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800/80 lg:pt-0 lg:border-t-0 w-full lg:w-auto min-w-0">
          
          <div 
            ref={statusScrollRef}
            className="w-full sm:w-auto max-w-full overflow-x-auto touch-pan-x overscroll-x-contain scrollbar-none flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-medium cursor-grab active:cursor-grabbing select-none"
          >
            <button
              onClick={() => setSelectedStatus('all')}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 text-center text-[11px] sm:text-xs ${
                selectedStatus === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todas ({totalTables})
            </button>
            <button
              onClick={() => setSelectedStatus('libre')}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shrink-0 text-[11px] sm:text-xs ${
                selectedStatus === 'libre'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Libres</span>
              <span className="text-[10px] opacity-75">({freeCount})</span>
            </button>
            <button
              onClick={() => setSelectedStatus('ocupada')}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shrink-0 text-[11px] sm:text-xs ${
                selectedStatus === 'ocupada'
                  ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span>Ocupadas</span>
              <span className="text-[10px] opacity-75">({occupiedCount})</span>
            </button>
            <button
              onClick={() => setSelectedStatus('cuenta')}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shrink-0 text-[11px] sm:text-xs ${
                selectedStatus === 'cuenta'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
              <span>Cuenta</span>
              <span className="text-[10px] opacity-75">({billingCount})</span>
            </button>
          </div>

          {/* Action Buttons: Size Selector, QR & Nueva Mesa */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap w-full sm:w-auto">
            {/* Selector de Tamaño: Grande, Mediano, Pequeño */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 sm:p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => setCardSize('sm')}
                title="Vista pequeña (compacta)"
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer ${
                  cardSize === 'sm'
                    ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Pequeño
              </button>
              <button
                type="button"
                onClick={() => setCardSize('md')}
                title="Vista mediana (estándar)"
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer ${
                  cardSize === 'md'
                    ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mediano
              </button>
              <button
                type="button"
                onClick={() => setCardSize('lg')}
                title="Vista grande (táctil)"
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer ${
                  cardSize === 'lg'
                    ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Grande
              </button>
            </div>

            {tables.length > 0 && (
              <button
                type="button"
                onClick={() => setTableForQr(tables[0])}
                className="flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-pink-200 dark:border-pink-900/60 bg-pink-50/70 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/50 text-[#681841] dark:text-pink-300 text-[11px] sm:text-xs font-bold transition cursor-pointer shadow-2xs"
                title="Ver códigos QR y cartas digitales de mesas"
              >
                <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Códigos QR</span>
                <span className="sm:hidden">QR</span>
              </button>
            )}

            {isGerente && (
              <button
                id="btn-add-table"
                onClick={() => {
                  if (!canAddTable()) {
                    onOpenSubscription();
                    return;
                  }
                  setTableToEdit(null);
                  setIsNewTableOpen(true);
                }}
                className="flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-[11px] sm:text-xs font-bold shadow-md shadow-pink-500/20 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="whitespace-nowrap">Nueva Mesa</span>
              </button>
            )}
          </div>

        </div>

      </div>

      {/* Active Waiter / Bill Calls Notification Banner for Staff */}
      {tablesCalling.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/25 flex items-center justify-center font-bold text-xl shadow-inner">
              <BellRing className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <p className="font-black text-sm leading-tight">
                {tablesCalling.length} {tablesCalling.length === 1 ? 'Mesa solicita atención' : 'Mesas solicitan atención'}
              </p>
              <p className="text-xs text-amber-100 font-medium">
                {tablesCalling.map(t => `Mesa ${t.number} (${t.waiterCall?.type === 'bill' || t.status === 'cuenta' ? 'Pide Cuenta' : 'Llamada Mesero'})`).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tablesCalling.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTableId(t.id)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-amber-950 font-black text-xs shadow-md hover:bg-amber-50 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Ir a Mesa {t.number}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tables Grid */}
      {filteredTables.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">
            No se encontraron mesas con estos filtros
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Prueba a cambiar de zona o crea una nueva mesa para este espacio.
          </p>
        </div>
      ) : (
        <div
          className={
            cardSize === 'sm'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
              : cardSize === 'lg'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6'
              : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          }
        >
          {filteredTables.map((table) => {
            const hasOrder = !!table.order && table.order.items.length > 0;
            const itemsCount = table.order?.items.reduce((sum, it) => sum + it.quantity, 0) || 0;
            
            // Calculate active total
            const sub = table.order?.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0) || 0;
            const disc = sub * ((table.order?.discountPercent || 0) / 100);
            const tax = (sub - disc) * ((table.order?.taxPercent || config.defaultTaxRate) / 100);
            const tableTotal = sub - disc + tax + (table.order?.tipAmount || 0);

            // Styling per status
            const statusConfig = {
              libre: {
                border: 'border-emerald-300 dark:border-emerald-800/80 hover:border-emerald-500 bg-white dark:bg-slate-900',
                numberBg: 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700',
                badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60',
                label: 'Libre',
                dot: 'bg-emerald-500'
              },
              ocupada: {
                border: 'border-red-500 dark:border-red-600 hover:border-red-600 bg-red-50/70 dark:bg-red-950/40 shadow-sm ring-2 ring-red-400/40 dark:ring-red-900/50',
                numberBg: 'bg-red-600 text-white border-red-700 shadow-xs font-black',
                badgeBg: 'bg-red-600 text-white font-extrabold shadow-xs',
                label: 'Ocupada',
                dot: 'bg-white'
              },
              cuenta: {
                border: 'border-purple-400 dark:border-purple-700/80 hover:border-purple-500 shadow-md ring-1 ring-purple-400 bg-purple-50/30 dark:bg-purple-950/20',
                numberBg: 'bg-purple-600 text-white border-purple-700 shadow-xs font-black',
                badgeBg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60',
                label: 'Pidiendo Cuenta',
                dot: 'bg-purple-500 animate-pulse'
              }
            }[table.status];

            {/* === TAMAÑO PEQUEÑO (COMPACTO) === */}
            if (cardSize === 'sm') {
              return (
                <div
                  key={table.id}
                  id={`table-card-${table.id}`}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`group relative p-3 rounded-xl border-2 ${statusConfig.border} transition-all duration-150 cursor-pointer flex flex-col justify-between hover:shadow-md active:scale-[0.99]`}
                >
                  <div>
                    {/* Header Compacto */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs border shrink-0 ${statusConfig.numberBg}`}>
                          {table.number}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate leading-tight">
                            {table.name}
                          </h3>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {table.zone}
                          </p>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${statusConfig.badgeBg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                        <span className="hidden sm:inline">{statusConfig.label}</span>
                      </span>
                    </div>

                    {/* Body Compacto */}
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px]">
                      {hasOrder ? (
                        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 truncate">
                            {itemsCount} ítems
                          </span>
                          <span className="font-mono font-black text-xs text-orange-600 dark:text-orange-400">
                            {formatCOP(tableTotal)}
                          </span>
                        </div>
                      ) : (
                        <div className="py-1 text-center text-[10px] text-slate-400 italic">
                          Libre · {table.seats}p
                        </div>
                      )}

                      {table.waiterCall && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/70 border border-purple-300 text-purple-950 dark:text-purple-200 text-[10px] font-bold flex items-center justify-between gap-1 animate-pulse"
                        >
                          <span className="truncate">🔔 {table.waiterCall.type === 'bill' ? 'Cuenta' : 'Mesero'}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissWaiterCall(table.id);
                            }}
                            className="px-1 py-0.2 bg-white dark:bg-slate-800 rounded font-bold text-[9px]"
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Compacto */}
                  <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-[10px] text-slate-400">
                      {table.seats} pl.
                    </span>
                    <span className="font-bold text-[11px] text-orange-600 dark:text-orange-400 group-hover:underline">
                      {hasOrder ? 'Ver →' : 'Abrir →'}
                    </span>
                  </div>
                </div>
              );
            }

            {/* === TAMAÑO GRANDE (AMPLIO Y TÁCTIL) === */}
            if (cardSize === 'lg') {
              return (
                <div
                  key={table.id}
                  id={`table-card-${table.id}`}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`group relative p-5 sm:p-6 rounded-3xl border-2 ${statusConfig.border} transition-all duration-150 cursor-pointer flex flex-col justify-between hover:shadow-xl active:scale-[0.99]`}
                >
                  <div>
                    {/* Header Grande */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl border-2 shadow-sm shrink-0 ${statusConfig.numberBg}`}>
                          {table.number}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white leading-tight">
                            {table.name}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                            Zona: {table.zone}
                          </p>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black shadow-xs ${statusConfig.badgeBg}`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot}`} />
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Body Grande */}
                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-slate-400" />
                          Capacidad para <strong>{table.seats} comensales</strong>
                        </span>
                        {table.order?.openedAt && (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-orange-600 dark:text-orange-400 font-bold bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-lg">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(table.order.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {hasOrder ? (
                        <div className="space-y-2">
                          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block">
                                Cuenta en Curso ({itemsCount} productos)
                              </span>
                              <span className="font-mono font-black text-2xl text-orange-600 dark:text-orange-400 mt-0.5 block">
                                {formatCOP(tableTotal)}
                              </span>
                            </div>
                            <span className="text-xs px-3 py-1 rounded-xl bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-black">
                              Comanda Activa
                            </span>
                          </div>

                          {table.order?.items && table.order.items.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {table.order.items.slice(0, 3).map((it, idx) => (
                                <span key={idx} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {it.quantity}x {it.name}
                                </span>
                              ))}
                              {table.order.items.length > 3 && (
                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  +{table.order.items.length - 3} más
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 text-center text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                          ✨ Mesa libre y lista para tomar comanda
                        </div>
                      )}

                      {table.waiterCall && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 shadow-md animate-pulse ${
                            table.waiterCall.type === 'bill'
                              ? 'bg-purple-100 dark:bg-purple-950/70 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-200'
                              : 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xl shrink-0">
                              {table.waiterCall.type === 'bill' ? '💳' : '🛎️'}
                            </span>
                            <div className="min-w-0">
                              <p className="font-black text-xs leading-tight truncate">
                                {table.waiterCall.type === 'bill' ? '¡Piden la Cuenta de la Mesa!' : '¡Llaman al Mesero!'}
                              </p>
                              {table.waiterCall.message && (
                                <p className="text-[11px] opacity-85 truncate">
                                  {table.waiterCall.message}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissWaiterCall(table.id);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 font-black text-xs shadow-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition shrink-0 cursor-pointer text-slate-800 dark:text-slate-200"
                          >
                            Atender
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Grande */}
                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {isGerente && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleEditTable(e, table)}
                            title="Editar configuración de mesa"
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTable(e, table.id)}
                            title="Eliminar mesa"
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTableForQr(table);
                        }}
                        title="Ver código QR de la mesa para pedidos"
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#681841] dark:text-pink-300 bg-pink-50 dark:bg-pink-950/50 hover:bg-pink-100 dark:hover:bg-pink-900/60 border border-pink-200/80 dark:border-pink-900/60 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Carta QR</span>
                      </button>
                    </div>

                    <span className="font-black text-sm text-orange-600 dark:text-orange-400 group-hover:underline flex items-center gap-1.5">
                      <span>
                        {hasOrder
                          ? user?.role === 'cajero'
                            ? 'Cobrar / Ver Cuenta'
                            : 'Ver Comanda'
                          : 'Abrir Mesa'}
                      </span>
                      <span className="text-base">→</span>
                    </span>
                  </div>
                </div>
              );
            }

            {/* === TAMAÑO MEDIANO (ESTÁNDAR) === */}
            return (
              <div
                key={table.id}
                id={`table-card-${table.id}`}
                onClick={() => setSelectedTableId(table.id)}
                className={`group relative p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 ${statusConfig.border} transition-all duration-150 cursor-pointer flex flex-col justify-between hover:shadow-lg active:scale-[0.99]`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 sm:gap-2.5">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center font-black text-sm sm:text-base border shrink-0 ${statusConfig.numberBg}`}>
                        {table.number}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight truncate">
                          {table.name}
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {table.zone}
                        </p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shrink-0 ${statusConfig.badgeBg}`}>
                      <span className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${statusConfig.dot}`} />
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Body Info */}
                  <div className="mt-2.5 sm:mt-4 pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 sm:space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        Capacidad: {table.seats} plazas
                      </span>
                      {table.order?.openedAt && (
                        <span className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px]">
                          <Clock className="w-3 h-3 text-orange-500" />
                          {new Date(table.order.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {/* Current consumption / items */}
                    {hasOrder ? (
                      <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">
                            Cuenta en curso
                          </span>
                          <span className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {itemsCount} productos
                          </span>
                        </div>
                        <span className="font-mono font-extrabold text-sm sm:text-base text-orange-600 dark:text-orange-400">
                          {formatCOP(tableTotal)}
                        </span>
                      </div>
                    ) : (
                      <div className="py-1.5 sm:py-2 text-center text-[10px] sm:text-[11px] text-slate-400 italic">
                        Mesa lista para tomar comanda
                      </div>
                    )}

                    {/* Active Waiter Call or Bill Requested Alert Badge on Card */}
                    {table.waiterCall && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl border flex items-center justify-between gap-2 shadow-sm animate-pulse ${
                          table.waiterCall.type === 'bill'
                            ? 'bg-purple-100 dark:bg-purple-950/70 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-200'
                            : 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-sm sm:text-base shrink-0">
                            {table.waiterCall.type === 'bill' ? '💳' : '🛎️'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-extrabold text-[10px] sm:text-[11px] leading-tight truncate">
                              {table.waiterCall.type === 'bill' ? '¡Piden la Cuenta!' : '¡Llaman al Mesero!'}
                            </p>
                            {table.waiterCall.message && (
                              <p className="text-[9px] sm:text-[10px] opacity-75 truncate">
                                {table.waiterCall.message}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissWaiterCall(table.id);
                          }}
                          className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-white dark:bg-slate-800 font-extrabold text-[9px] sm:text-[10px] shadow-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition shrink-0 cursor-pointer text-slate-800 dark:text-slate-200"
                          title="Marcar como atendido para que el aviso desaparezca"
                        >
                          Atender
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Quick Controls */}
                <div className="mt-2.5 sm:mt-4 pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    {isGerente && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleEditTable(e, table)}
                          title="Editar configuración de mesa"
                          className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTable(e, table.id)}
                          title="Eliminar mesa"
                          className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTableForQr(table);
                      }}
                      title="Ver código QR de la mesa para pedidos"
                      className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-xs font-bold text-[#681841] dark:text-pink-300 bg-pink-50 dark:bg-pink-950/50 hover:bg-pink-100 dark:hover:bg-pink-900/60 border border-pink-200/80 dark:border-pink-900/60 transition flex items-center gap-1 cursor-pointer"
                    >
                      <QrCode className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                      <span className="text-[9px] sm:text-[10px]">QR</span>
                    </button>
                  </div>

                  <span className="font-semibold text-orange-600 dark:text-orange-400 group-hover:underline flex items-center gap-1 text-[11px] sm:text-xs">
                    <span>
                      {hasOrder
                        ? user?.role === 'cajero'
                          ? 'Cobrar'
                          : 'Ver Comanda'
                        : 'Abrir Mesa'}
                    </span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Free Plan Limit Notice Card (Solo para Gerente) */}
      {isGerente && !canAddTable() && (
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                Has alcanzado el límite de {config.freemiumLimits.freeMaxTables} mesas del plan gratuito
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Pasa al plan PRO para crear tantas mesas, barras y terrazas como requiera tu local.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSubscription}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition whitespace-nowrap cursor-pointer"
          >
            Actualizar a PRO
          </button>
        </div>
      )}

      {/* Modal: New / Edit Table */}
      <NewTableModal
        isOpen={isNewTableOpen}
        onClose={() => setIsNewTableOpen(false)}
        tableToEdit={tableToEdit}
        onOpenSubscription={onOpenSubscription}
      />

      {/* Modal: Table Detail & POS Live Bill */}
      {currentSelectedTable && (
        <TableDetailModal
          isOpen={!!currentSelectedTable && !isCheckoutOpen}
          onClose={() => setSelectedTableId(null)}
          table={currentSelectedTable}
          onOpenCheckout={() => setIsCheckoutOpen(true)}
        />
      )}

      {/* Modal: Checkout & Payment */}
      {currentSelectedTable && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          table={currentSelectedTable}
          onSuccessCheckout={(receipt) => {
            setSelectedTableId(null);
            setLatestReceipt(receipt);
            setIsReceiptOpen(true);
          }}
        />
      )}

      {/* Modal: Receipt View & Print */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        receipt={latestReceipt}
      />

      {/* Modal: Table QR & Customer Digital Menu */}
      <TableQrModal
        isOpen={!!tableForQr}
        onClose={() => setTableForQr(null)}
        table={tableForQr}
        onOpenCustomerMenu={(tId) => setCustomerViewTableId(tId)}
      />

    </div>
  );
};
