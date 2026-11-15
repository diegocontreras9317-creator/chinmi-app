import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  FREE_MAX_PRODUCTS,
  FREE_MAX_TABLES,
  getProtectedProductIds,
  isTableProtected
} from '../../utils/subscription';
import { AlertCircle, Check, Lock, Sparkles, X, Loader2 } from 'lucide-react';

interface OverLimitSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgrade: () => void;
}

export const OverLimitSelectionModal: React.FC<OverLimitSelectionModalProps> = ({
  isOpen,
  onClose,
  onOpenUpgrade
}) => {
  const { saveSubscriptionSelection } = useAuth();
  const { tables, products } = useApp();

  const protectedTableIds = useMemo(
    () => new Set(tables.filter(isTableProtected).map((t) => t.id)),
    [tables]
  );
  const protectedProductIds = useMemo(() => getProtectedProductIds(tables), [tables]);

  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (tables.length <= FREE_MAX_TABLES) {
      setSelectedTableIds(tables.map((t) => t.id));
    } else {
      const currentActive = tables.filter((t) => t.active !== false).map((t) => t.id);
      if (currentActive.length <= FREE_MAX_TABLES && currentActive.length > 0) {
        setSelectedTableIds(currentActive);
      } else {
        const prioritized = Array.from(
          new Set([
            ...Array.from(protectedTableIds),
            ...tables.map((t) => t.id)
          ])
        ).slice(0, FREE_MAX_TABLES);
        setSelectedTableIds(prioritized);
      }
    }

    if (products.length <= FREE_MAX_PRODUCTS) {
      setSelectedProductIds(products.map((p) => p.id));
    } else {
      const currentActiveProds = products.filter((p) => p.active !== false).map((p) => p.id);
      if (currentActiveProds.length <= FREE_MAX_PRODUCTS && currentActiveProds.length > 0) {
        setSelectedProductIds(currentActiveProds);
      } else {
        const prioritizedProds = Array.from(
          new Set([
            ...Array.from(protectedProductIds),
            ...products.map((p) => p.id)
          ])
        ).slice(0, FREE_MAX_PRODUCTS);
        setSelectedProductIds(prioritizedProds);
      }
    }
  }, [isOpen, tables, products, protectedTableIds, protectedProductIds]);

  if (!isOpen) return null;

  const tablesNeedPick = tables.length > FREE_MAX_TABLES;
  const productsNeedPick = products.length > FREE_MAX_PRODUCTS;

  const toggleTable = (id: string) => {
    if (protectedTableIds.has(id) && selectedTableIds.includes(id)) return;
    setError(null);
    setSelectedTableIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= FREE_MAX_TABLES) {
        setError(`En Plan Gratuito puedes mantener hasta ${FREE_MAX_TABLES} mesas activas.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleProduct = (id: string) => {
    if (protectedProductIds.has(id) && selectedProductIds.includes(id)) return;
    setError(null);
    setSelectedProductIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= FREE_MAX_PRODUCTS) {
        setError(`En Plan Gratuito puedes mantener hasta ${FREE_MAX_PRODUCTS} productos activos.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await saveSubscriptionSelection({
      activeTableIds: tablesNeedPick ? selectedTableIds : tables.map((t) => t.id),
      activeProductIds: productsNeedPick ? selectedProductIds : products.map((p) => p.id)
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'No se pudo guardar tu selección.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Elige tus mesas y productos activos en Plan Gratuito
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Todos tus datos se conservan intactos. Los ítems no seleccionados quedarán pausados hasta que renueves PRO.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {tablesNeedPick && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Mesas activas ({selectedTableIds.length}/{FREE_MAX_TABLES})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Total registradas: {tables.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                {tables.map((t) => {
                  const selected = selectedTableIds.includes(t.id);
                  const isProtected = protectedTableIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTable(t.id)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{t.name || `Mesa ${t.number}`}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {isProtected ? 'Pedido abierto' : t.zone || 'Salón'}
                        </p>
                      </div>
                      {isProtected ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : selected ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {productsNeedPick && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Productos activos en carta ({selectedProductIds.length}/{FREE_MAX_PRODUCTS})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Total registrados: {products.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {products.map((p) => {
                  const selected = selectedProductIds.includes(p.id);
                  const isProtected = protectedProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduct(p.id)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {isProtected ? 'En comanda abierta' : p.category}
                        </p>
                      </div>
                      {isProtected ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : selected ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenUpgrade();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Reactivar todo con Plan PRO</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Guardar selección activa</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
