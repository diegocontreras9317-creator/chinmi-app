import React, { useState, useEffect } from 'react';
import { X, Truck, Phone, PackageCheck, Plus, AlertTriangle, FileText, MessageCircle } from 'lucide-react';
import { Supplier } from '../../types';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => void;
  editingSupplier?: Supplier | null;
  existingPantryItemNames?: string[];
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingSupplier,
  existingPantryItemNames = []
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasWhatsapp, setHasWhatsapp] = useState<boolean>(true);
  const [supplyTags, setSupplyTags] = useState<string[]>([]);
  const [supplyInput, setSupplyInput] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingSupplier) {
      setName(editingSupplier.name || '');
      setPhone(editingSupplier.phone || '');
      setHasWhatsapp(editingSupplier.hasWhatsapp ?? true);
      const parsed = (editingSupplier.suppliesProvided || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      setSupplyTags(parsed);
      setSupplyInput('');
      setNotes(editingSupplier.notes || '');
    } else {
      setName('');
      setPhone('');
      setHasWhatsapp(true);
      setSupplyTags([]);
      setSupplyInput('');
      setNotes('');
    }
    setError(null);
  }, [editingSupplier, isOpen]);

  if (!isOpen) return null;

  const addSupplyItemsFromText = (raw: string) => {
    const parts = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    setSupplyTags(prev => {
      const next = [...prev];
      parts.forEach(part => {
        const exists = next.some(existing => existing.toLowerCase() === part.toLowerCase());
        if (!exists) next.push(part);
      });
      return next;
    });
    setSupplyInput('');
  };

  const handleSupplyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (supplyInput.trim()) {
        addSupplyItemsFromText(supplyInput);
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setSupplyTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const toggleSuggestedItem = (itemName: string) => {
    const trimmed = itemName.trim();
    if (!trimmed) return;
    const exists = supplyTags.some(t => t.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setSupplyTags(prev => prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase()));
    } else {
      setSupplyTags(prev => [...prev, trimmed]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Ingresa el nombre del proveedor.');
      return;
    }

    if (!phone.trim()) {
      setError('Ingresa el número telefónico del proveedor.');
      return;
    }

    // Include any pending text typed in supplyInput even if the user didn't press Enter/"Agregar"
    const pendingParts = supplyInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const combinedSupplies = [...supplyTags];
    pendingParts.forEach(part => {
      if (!combinedSupplies.some(s => s.toLowerCase() === part.toLowerCase())) {
        combinedSupplies.push(part);
      }
    });

    if (combinedSupplies.length === 0) {
      setError('Indica al menos qué insumos o productos se consiguen con este proveedor.');
      return;
    }

    onSave({
      name: name.trim(),
      phone: phone.trim(),
      hasWhatsapp,
      suppliesProvided: combinedSupplies.join(', '),
      notes: notes.trim() || undefined
    });

    onClose();
  };

  const uniqueSuggestions = Array.from(
    new Set(existingPantryItemNames.map(n => n.trim()).filter(Boolean))
  ).slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-stone-50/60 dark:bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-950 text-white flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {editingSupplier ? 'Editar Proveedor' : 'Agregar Proveedor'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registra contacto directo y qué insumos te suministra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nombre y Teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>Nombre del Proveedor *</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Fruver La Sabana, Distribuidora Norte..."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-900/50 focus:border-rose-900 outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Número Telefónico *</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 300 123 4567"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-rose-900/50 focus:border-rose-900 outline-hidden"
              />
            </div>
          </div>

          {/* Indicador de WhatsApp */}
          <label className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer select-none ${
            hasWhatsapp
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/70'
              : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                hasWhatsapp
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}>
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-slate-900 dark:text-white block">
                  Este proveedor tiene WhatsApp
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Permite armar el listado de productos y enviarlo en 1 clic con el nombre y dirección del local
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={hasWhatsapp}
              onChange={(e) => setHasWhatsapp(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 shrink-0 cursor-pointer"
            />
          </label>

          {/* Qué se consigue con este proveedor */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>¿Qué se consigue con este proveedor? *</span>
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Escribe los insumos separados por coma o presiona Agregar (ej. Limón Tahití, Aguacate, Hierbabuena).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={supplyInput}
                onChange={(e) => setSupplyInput(e.target.value)}
                onKeyDown={handleSupplyKeyDown}
                placeholder="Ej. Limón Tahití, Naranja, Hielo, Vasos..."
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-rose-900/50 focus:border-rose-900"
              />
              <button
                type="button"
                onClick={() => addSupplyItemsFromText(supplyInput)}
                className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>

            {/* Lista de insumos agregados */}
            {supplyTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {supplyTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px]"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                      title="Quitar insumo"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Sugerencias rápidas desde la despensa actual */}
            {uniqueSuggestions.length > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Seleccionar de tu despensa actual:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueSuggestions.map((itemName) => {
                    const selected = supplyTags.some(
                      t => t.toLowerCase() === itemName.toLowerCase()
                    );
                    return (
                      <button
                        key={itemName}
                        type="button"
                        onClick={() => toggleSuggestedItem(itemName)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {selected ? `✓ ${itemName}` : `+ ${itemName}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Notas opcionales */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Condiciones o Días de Entrega (Opcional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Entregas martes y viernes antes de las 11am, pedido mínimo $80.000..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-rose-900/50"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-white font-extrabold shadow-xs transition cursor-pointer"
            >
              {editingSupplier ? 'Guardar Cambios' : 'Guardar Proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
