import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { UtensilsCrossed, ArrowRight, X, Clock, User } from 'lucide-react';

interface NewOrderToastProps {
  onNavigateToTable?: (tableId: string) => void;
}

export const NewOrderToast: React.FC<NewOrderToastProps> = ({ onNavigateToTable }) => {
  const { newOrderNotification, dismissNewOrderNotification, setSelectedTableId } = useApp();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss after 7 seconds
  useEffect(() => {
    if (newOrderNotification) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        dismissNewOrderNotification();
      }, 7000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [newOrderNotification, dismissNewOrderNotification]);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    if (newOrderNotification) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        dismissNewOrderNotification();
      }, 4000);
    }
  };

  if (!newOrderNotification) return null;

  const handleGoToOrder = () => {
    if (newOrderNotification.tableId) {
      setSelectedTableId(newOrderNotification.tableId);
      if (onNavigateToTable) {
        onNavigateToTable(newOrderNotification.tableId);
      }
    }
    dismissNewOrderNotification();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="p-4 rounded-2xl shadow-2xl border-2 border-emerald-500/80 bg-slate-950/95 text-white backdrop-blur-md shadow-emerald-950/50 flex flex-col gap-3">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold uppercase tracking-wider">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>¡Nuevo Pedido!</span>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissNewOrderNotification}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-base font-black text-white tracking-tight">
              {newOrderNotification.tableName}
            </h4>
            <span className="font-mono text-base font-extrabold text-emerald-400">
              $ {new Intl.NumberFormat('es-CO').format(newOrderNotification.total)} COP
            </span>
          </div>

          {newOrderNotification.customerName && (
            <div className="flex items-center gap-1.5 text-xs text-amber-200 font-semibold">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>Cliente: {newOrderNotification.customerName}</span>
            </div>
          )}

          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed bg-white/5 p-2 rounded-xl border border-white/10">
            {newOrderNotification.itemsSummary}
          </p>
        </div>

        {/* Action Button & Timestamp */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10 gap-2">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(newOrderNotification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          <button
            type="button"
            onClick={handleGoToOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <span>Ver Comanda</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
