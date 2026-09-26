import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BellRing, CreditCard, ArrowRight, Check, X, AlertCircle } from 'lucide-react';
import { playServiceBell } from '../../utils/audioAlert';

interface WaiterCallToastProps {
  onNavigateToTable?: (tableId: string) => void;
}

export const WaiterCallToast: React.FC<WaiterCallToastProps> = ({ onNavigateToTable }) => {
  const { tables, dismissWaiterCall, setSelectedTableId } = useApp();

  // Find tables with active waiter calls or bill requests
  const callingTables = tables.filter(t => t.waiterCall !== null && t.waiterCall !== undefined);

  // Keep track of timestamps we already notified for to avoid repeating sound on every re-render
  const notifiedTimestampsRef = useRef<Set<string>>(new Set());
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    // Detect newly arrived calls
    callingTables.forEach(table => {
      if (table.waiterCall?.requestedAt) {
        const key = `${table.id}-${table.waiterCall.requestedAt}`;
        if (!notifiedTimestampsRef.current.has(key)) {
          notifiedTimestampsRef.current.add(key);
          // Play service bell chime!
          playServiceBell(table.waiterCall.type);
          setMinimized(false);
        }
      }
    });
  }, [callingTables]);

  if (callingTables.length === 0) {
    return null;
  }

  const handleGoToTable = (tableId: string) => {
    setSelectedTableId(tableId);
    if (onNavigateToTable) {
      onNavigateToTable(tableId);
    }
  };

  if (minimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-bounce">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-2xl border-2 border-white dark:border-slate-800 cursor-pointer"
        >
          <BellRing className="w-5 h-5 animate-pulse" />
          <span>{callingTables.length} llamada{callingTables.length > 1 ? 's' : ''} pendiente{callingTables.length > 1 ? 's' : ''}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-50 max-w-sm w-full space-y-2 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
      {callingTables.map((table) => {
        const call = table.waiterCall;
        if (!call) return null;
        const isBill = call.type === 'bill';

        return (
          <div
            key={`${table.id}-${call.requestedAt}`}
            className={`p-4 rounded-2xl shadow-2xl border-2 flex flex-col gap-2.5 transition-all ${
              isBill
                ? 'bg-purple-950/95 text-white border-purple-400 shadow-purple-900/40 backdrop-blur-md'
                : 'bg-amber-950/95 text-white border-amber-400 shadow-amber-900/40 backdrop-blur-md'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                  isBill ? 'bg-purple-500/30 text-purple-200' : 'bg-amber-500/30 text-amber-200'
                }`}>
                  {isBill ? (
                    <CreditCard className="w-5 h-5 animate-pulse text-purple-200" />
                  ) : (
                    <BellRing className="w-5 h-5 animate-bounce text-amber-200" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-white">
                      Mesa {table.number}
                    </span>
                    <span className="text-[10px] opacity-75 font-medium px-2 py-0.5 rounded-md bg-white/15">
                      {table.zone}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-amber-200 dark:text-amber-300">
                    {isBill ? '💳 Solicitud de Cuenta' : '🛎️ Llamada de Mesero'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMinimized(true)}
                title="Minimizar aviso"
                className="text-white/60 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message */}
            {call.message && (
              <p className="text-xs bg-white/10 rounded-xl px-3 py-2 font-medium text-slate-100 border border-white/10">
                "{call.message}"
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => dismissWaiterCall(table.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Atendido</span>
              </button>

              <button
                type="button"
                onClick={() => handleGoToTable(table.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black shadow-md transition cursor-pointer ${
                  isBill
                    ? 'bg-purple-500 hover:bg-purple-400 text-white'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                }`}
              >
                <span>Ir a Mesa</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
