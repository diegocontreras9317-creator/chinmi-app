import React, { useState } from 'react';
import { X, Trash2, Plus, Calendar, AlertTriangle } from 'lucide-react';
import { PerishableItem } from '../../types';

interface PerishableWasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PerishableItem | null;
  mode: 'waste' | 'restock';
  onConfirmWaste: (id: string, amount: number, reason: string) => void;
  onConfirmRestock: (id: string, amount: number, newEntryDate?: string, newExpiryDate?: string) => void;
}

const getTodayIso = () => new Date().toISOString().split('T')[0];
const getDefaultExpiryIso = (days = 5) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export const PerishableWasteModal: React.FC<PerishableWasteModalProps> = ({
  isOpen,
  onClose,
  item,
  mode,
  onConfirmWaste,
  onConfirmRestock
}) => {
  const [amount, setAmount] = useState<number>(1);
  const [reason, setReason] = useState<string>('Vencimiento / Descomposición');
  const [newEntryDate, setNewEntryDate] = useState<string>(getTodayIso());
  const [newExpiryDate, setNewExpiryDate] = useState<string>(getDefaultExpiryIso(5));

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    if (mode === 'waste') {
      onConfirmWaste(item.id, amount, reason);
    } else {
      onConfirmRestock(item.id, amount, newEntryDate, newExpiryDate);
    }
    onClose();
  };

  const isWaste = mode === 'waste';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className={`px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between ${
          isWaste ? 'bg-rose-50/60 dark:bg-rose-950/30' : 'bg-emerald-50/60 dark:bg-emerald-950/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold ${
              isWaste
                ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300'
                : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300'
            }`}>
              {isWaste ? <Trash2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="font-black text-sm text-slate-900 dark:text-white">
                {isWaste ? 'Registrar Merma / Desecho' : 'Entrada de Lote / Reabastecer'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                {item.name} · Actual: <span className="font-bold font-mono">{item.quantity} {item.unit}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {isWaste ? `Cantidad a Desechar / Descontar (${item.unit})` : `Cantidad que Ingresa (${item.unit})`}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={isWaste ? item.quantity : undefined}
                required
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base"
              />
              <span className="font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                {item.unit}
              </span>
            </div>
            {isWaste && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                Quedarán <strong className="text-slate-800 dark:text-slate-200">{Math.max(0, item.quantity - amount).toFixed(2)} {item.unit}</strong> en inventario.
              </span>
            )}
          </div>

          {isWaste ? (
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Motivo de la Merma / Baja
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Caducidad / Alimento Vencido">Caducidad / Alimento Vencido</option>
                <option value="Deterioro / Pérdida de frescura">Deterioro / Pérdida de frescura</option>
                <option value="Consumo / Elaboración en Cocina">Consumo / Elaboración en Cocina</option>
                <option value="Consumo / Cócteles en Barra">Consumo / Cócteles en Barra</option>
                <option value="Ajuste físico de inventario">Ajuste físico de inventario</option>
              </select>
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Nueva Fecha de Ingreso</span>
                </label>
                <input
                  type="date"
                  value={newEntryDate}
                  onChange={(e) => setNewEntryDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Nueva Fecha de Vencimiento</span>
                </label>
                <input
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl text-white font-extrabold shadow-md transition cursor-pointer ${
                isWaste
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
              }`}
            >
              {isWaste ? 'Confirmar Merma' : 'Registrar Ingreso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
