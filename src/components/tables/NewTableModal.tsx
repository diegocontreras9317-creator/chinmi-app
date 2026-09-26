import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Table } from '../../types';
import { X, Plus, AlertCircle, Sparkles } from 'lucide-react';

interface NewTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableToEdit?: Table | null;
  onOpenSubscription: () => void;
}

export const NewTableModal: React.FC<NewTableModalProps> = ({
  isOpen,
  onClose,
  tableToEdit,
  onOpenSubscription
}) => {
  const { config, addTable, updateTable, canAddTable, tables } = useApp();

  const [name, setName] = useState(tableToEdit ? tableToEdit.name : `Mesa ${tables.length + 1}`);
  const [zone, setZone] = useState(tableToEdit ? tableToEdit.zone : config.zones[0]);
  const [seats, setSeats] = useState(tableToEdit ? tableToEdit.seats : 4);
  const [customZone, setCustomZone] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEditing = !!tableToEdit;
  const reachedLimit = !isEditing && !canAddTable();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const finalZone = customZone.trim() ? customZone.trim() : zone;

    if (!name.trim()) {
      setErrorMsg('El nombre o número de mesa es obligatorio.');
      return;
    }

    if (isEditing && tableToEdit) {
      updateTable(tableToEdit.id, {
        name: name.trim(),
        zone: finalZone,
        seats: Number(seats) || 2
      });
      onClose();
    } else {
      const res = addTable({
        number: name.replace(/\D/g, '') || String(tables.length + 1),
        name: name.trim(),
        zone: finalZone,
        seats: Number(seats) || 4
      });

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo crear la mesa.');
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {isEditing ? 'Editar Mesa' : 'Nueva Mesa o Espacio'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Plan limit warning */}
        {reachedLimit && (
          <div className="p-4 mx-6 mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-300">
                  Límite del Plan Gratuito alcanzado ({config.freemiumLimits.freeMaxTables} mesas)
                </p>
                <p className="text-amber-800 dark:text-amber-400 mt-1">
                  Actualiza a la versión PRO para gestionar mesas ilimitadas, terrazas múltiples y zonas exclusivas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscription();
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Desbloquear Versión PRO</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Identificador / Nombre de Mesa
            </label>
            <input
              type="text"
              required
              disabled={reachedLimit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Terraza 1, VIP 4, Barra 2"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Zona o Ambiente
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {config.zones.map((z) => (
                <button
                  key={z}
                  type="button"
                  disabled={reachedLimit}
                  onClick={() => {
                    setZone(z);
                    setCustomZone('');
                  }}
                  className={`p-2.5 rounded-xl text-xs font-medium border text-left transition ${
                    zone === z && !customZone
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-bold'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  } disabled:opacity-50`}
                >
                  {z}
                </button>
              ))}
            </div>

            <input
              type="text"
              disabled={reachedLimit}
              value={customZone}
              onChange={(e) => setCustomZone(e.target.value)}
              placeholder="O escribe una zona personalizada..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Capacidad (Comensales / Asientos)
            </label>
            <div className="flex items-center gap-2">
              {[2, 4, 6, 8, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={reachedLimit}
                  onClick={() => setSeats(num)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${
                    seats === num
                      ? 'border-orange-500 bg-orange-500 text-white shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  } disabled:opacity-50`}
                >
                  {num}p
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reachedLimit}
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-400 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition"
            >
              {isEditing ? 'Guardar Cambios' : 'Crear Mesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
