import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { deriveSubscriptionState, FREE_MAX_PRODUCTS, FREE_MAX_TABLES } from '../../utils/subscription';
import { AlertTriangle, Clock, Sparkles, SlidersHorizontal, X } from 'lucide-react';

interface SubscriptionWarningBannerProps {
  onOpenUpgrade: () => void;
  onOpenSelectionModal: () => void;
}

export const SubscriptionWarningBanner: React.FC<SubscriptionWarningBannerProps> = ({
  onOpenUpgrade,
  onOpenSelectionModal
}) => {
  const { user, serverNowMs, isGerente, backendCapabilities } = useAuth();
  const { tables, products } = useApp();
  const [dismissedMilestone, setDismissedMilestone] = useState<string | null>(null);

  const subState = useMemo(
    () =>
      deriveSubscriptionState({
        user,
        serverNowMs,
        tables,
        products,
        degradationEnabled: backendCapabilities.degradationEnabled
      }),
    [user, serverNowMs, tables, products, backendCapabilities.degradationEnabled]
  );

  if (!user || !isGerente) return null;
  const milestone = subState.warningMilestone;
  if (!milestone) return null;
  if ((milestone === '7d' || milestone === '3d' || milestone === '1d') && dismissedMilestone === milestone) {
    return null;
  }

  if (milestone === 'grace') {
    const hours = subState.hoursRemainingInGrace ?? 1;
    return (
      <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-start sm:items-center gap-2.5 text-amber-900 dark:text-amber-200">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Período de gracia PRO ({hours}h restantes de 72h):</strong> tu suscripción venció pero sigues operando normalmente. Renueva ahora para mantener activas todas tus mesas y productos.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Renovar PRO ahora</span>
          </button>
        </div>
      </div>
    );
  }

  if (milestone === 'over_limit') {
    return (
      <div className="bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-start sm:items-center gap-2.5 text-rose-900 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              {subState.needsOverLimitSelection ? (
                <>
                  <strong>Plan Gratuito sobre límite ({subState.totalTablesCount} mesas · {subState.totalProductsCount} productos guardados):</strong> ningún dato fue eliminado. Elige hasta <strong>{FREE_MAX_TABLES} mesas</strong> y <strong>{FREE_MAX_PRODUCTS} productos</strong> activos o reactiva PRO para operar sin límites.
                </>
              ) : (
                <>
                  <strong>Plan Gratuito activo ({subState.activeTablesCount}/{FREE_MAX_TABLES} mesas · {subState.activeProductsCount}/{FREE_MAX_PRODUCTS} productos activos):</strong> tus {subState.inactiveTablesCount} mesas y {subState.inactiveProductsCount} productos restantes se conservan intactos.
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSelectionModal}
              className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 font-bold text-xs whitespace-nowrap cursor-pointer flex items-center gap-1.5 hover:bg-rose-100/50"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{subState.needsOverLimitSelection ? 'Elegir activos' : 'Cambiar selección'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs whitespace-nowrap cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Reactivar todo con PRO</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Preventive alerts at 7d, 3d, 1d before expiration
  const days = subState.daysUntilExpiry ?? 1;
  return (
    <div className="bg-orange-50 dark:bg-orange-950/40 border-b border-orange-200 dark:border-orange-800 px-4 sm:px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs text-orange-900 dark:text-orange-200">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
          <span>
            Tu Plan PRO vence en <strong>{days === 1 ? '1 día' : `${days} días`}</strong>. Renueva con anticipación para mantener todas tus mesas y productos sin interrupciones.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs whitespace-nowrap cursor-pointer"
          >
            Renovar PRO
          </button>
          <button
            type="button"
            onClick={() => setDismissedMilestone(milestone)}
            aria-label="Cerrar aviso"
            className="p-1 text-orange-500 hover:text-orange-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
