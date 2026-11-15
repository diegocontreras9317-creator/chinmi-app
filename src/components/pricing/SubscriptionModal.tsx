import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PAID_PLANS, BillingFrequency, FREE_PLAN_DETAILS, BASE_ANNUAL_COP } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import { deriveSubscriptionState, isMasterAdminEmail } from '../../utils/subscription';
import {
  X,
  Check,
  Sparkles,
  ArrowRight,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { PlanComparisonTable } from './PlanComparisonTable';
import { EpaycoPaymentWidget } from './EpaycoPaymentWidget';
import { CanjearCodigo } from './CanjearCodigo';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSelectionModal?: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  onOpenSelectionModal
}) => {
  const { user, serverNowMs, refreshSubscriptionStatus, cancelSubscription, backendCapabilities } = useAuth();
  const { config, tables, products } = useApp();

  const [selectedCycle, setSelectedCycle] = useState<BillingFrequency>('annual');
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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

  if (!isOpen) return null;

  const isPro = subState.hasProAccess;
  const isMaster = isMasterAdminEmail(user?.email);
  const planData = PAID_PLANS[selectedCycle];

  const handleConfirmCancelRenewal = async () => {
    setCancelLoading(true);
    setCancelFeedback(null);
    const res = await cancelSubscription();
    setCancelLoading(false);
    setConfirmingCancel(false);
    if (res.success) {
      setCancelFeedback(
        'Renovación automática cancelada. Conservarás todas las funciones PRO hasta la fecha de vencimiento de tu período pagado.'
      );
    } else {
      setCancelFeedback(res.error || 'No fue posible cancelar la renovación.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-white">
                Planes y Precios en Pesos Colombianos (COP)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Elige el plan que se adapte al tamaño y crecimiento de tu local
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Estado de Gracia o Over-limit */}
          {subState.isInGracePeriod && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-extrabold text-amber-900 dark:text-amber-200">
                  Período de Gracia Activo ({subState.hoursRemainingInGrace}h restantes de 72h)
                </p>
                <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                  Tu suscripción PRO venció recientemente, pero sigues operando sin interrupciones durante las 72 horas de gracia. Renueva ahora para evitar el paso a Plan Gratuito con límite de 6 mesas y 15 productos.
                </p>
              </div>
            </div>
          )}

          {subState.isOverLimit && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 text-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-extrabold text-rose-900 dark:text-rose-200">
                    Cuenta en Plan Gratuito sobre límite ({subState.totalTablesCount} mesas · {subState.totalProductsCount} productos guardados)
                  </p>
                  <p className="text-rose-700 dark:text-rose-300">
                    Ningún dato se ha eliminado. Al renovar PRO reactivarás automáticamente todo tu catálogo y mesas al instante.
                  </p>
                </div>
              </div>
              {onOpenSelectionModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSelectionModal();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs whitespace-nowrap cursor-pointer shrink-0"
                >
                  Elegir 6 mesas y 15 productos
                </button>
              )}
            </div>
          )}

          {/* Banner Master Admin */}
          {isMaster && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-purple-950 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg border border-purple-500/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                </div>
                <div>
                  <p className="text-xs font-bold text-purple-100">
                    CUENTA MASTER ADMIN ({user?.email})
                  </p>
                  <p className="text-[11px] text-purple-200/80">
                    Acceso ilimitado PRO administrado por el servidor para tu cuenta principal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refreshSubscriptionStatus()}
                className="px-3.5 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-xs shadow-md transition whitespace-nowrap cursor-pointer shrink-0"
              >
                Sincronizar estado
              </button>
            </div>
          )}

          {upgradeSuccess ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                ¡Plan PRO Activado con Éxito!
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Tu restaurante ahora cuenta con mesas ilimitadas, catálogo sin topes y sincronización prioritaria en la nube.
              </p>
            </div>
          ) : showCheckoutForm ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <EpaycoPaymentWidget
                planData={planData}
                businessName={config?.businessName || user?.businessName}
                userEmail={user?.email}
                userName={user?.name}
                userId={user?.id}
                onSuccess={async () => {
                  await refreshSubscriptionStatus();
                  setUpgradeSuccess(true);
                  setTimeout(() => {
                    setUpgradeSuccess(false);
                    setShowCheckoutForm(false);
                    onClose();
                  }, 1500);
                }}
                onCancel={() => setShowCheckoutForm(false)}
              />
            </div>
          ) : (
            <>
              {/* Billing Cycle Selector - 3 Options */}
              <div className="space-y-2">
                <p className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Selecciona la frecuencia de pago para el Plan PRO:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-2xl mx-auto">
                  {(Object.keys(PAID_PLANS) as BillingFrequency[]).map((cycleKey) => {
                    const cycle = PAID_PLANS[cycleKey];
                    const isSelected = selectedCycle === cycleKey;
                    return (
                      <button
                        key={cycleKey}
                        type="button"
                        onClick={() => setSelectedCycle(cycleKey)}
                        className={`relative p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/40 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:border-slate-300'
                        }`}
                      >
                        {cycle.badge && (
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md mb-1.5 inline-block w-fit border ${cycle.badgeColor}`}>
                            {cycle.badge}
                          </span>
                        )}
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {cycle.frequencyLabel}
                          </p>
                          <p className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">
                            {formatCOP(cycle.monthlyEquivalent)} <span className="text-[10px] font-normal text-slate-500">/ mes</span>
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          {cycle.frequencyLabel === 'Mensual'
                            ? `Equivale a ${formatCOP(BASE_ANNUAL_COP)} al año`
                            : `Facturado: ${formatCOP(cycle.billedAmount)} ${cycle.billingPeriodText}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cards Comparison: Free vs Pro */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Free Plan Card */}
                <div className={`p-6 rounded-3xl border ${!isPro ? 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {FREE_PLAN_DETAILS.name}
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        GRATIS
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {FREE_PLAN_DETAILS.description}
                    </p>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">
                        $ 0 COP
                      </span>
                      <span className="text-xs text-slate-400">/ para siempre</span>
                    </div>

                    <div className="mt-6 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Hasta <strong>{FREE_PLAN_DETAILS.maxTables} mesas activas</strong> simultáneas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Hasta <strong>{FREE_PLAN_DETAILS.maxProducts} productos activos</strong> en carta</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Zonas, despensa de perecederos y recetas incluidas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Menú QR, subcuentas y cobros en POS incluidos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Exportación contable a Excel y CSV incluida</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Conserva tus datos históricos si vienes de PRO</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
                    {!isPro ? (
                      <div className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold text-center">
                        Plan Actual Activo
                      </div>
                    ) : isMaster ? (
                      <div className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-semibold text-center">
                        Cuenta Master Admin
                      </div>
                    ) : subState.cancelAtPeriodEnd ? (
                      <div className="w-full py-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-semibold text-center">
                        Cancelación programada · Mantienes PRO hasta el fin del período
                      </div>
                    ) : confirmingCancel ? (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
                        <p className="text-[11px] text-rose-800 dark:text-rose-200 font-semibold">
                          Conservarás PRO hasta que termine tu período actual y luego pasarás a Plan Gratis sin perder datos. ¿Confirmar?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={cancelLoading}
                            onClick={handleConfirmCancelRenewal}
                            className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {cancelLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Confirmar cancelación</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingCancel(false)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold cursor-pointer"
                          >
                            Volver
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(true)}
                        className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
                      >
                        Cancelar renovación al final del período
                      </button>
                    )}

                    {cancelFeedback && (
                      <p className="text-[11px] text-center font-medium text-emerald-700 dark:text-emerald-400">
                        {cancelFeedback}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pro Plan Card */}
                <div className="p-6 rounded-3xl border-2 border-orange-500 bg-orange-50/30 dark:bg-orange-950/20 relative shadow-xl shadow-orange-500/10 flex flex-col justify-between">
                  {planData.badge && (
                    <span className="absolute -top-3 right-6 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm">
                      {planData.badge}
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-orange-500" />
                        Plan PRO Hostelería
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-500 text-white">
                        PRO
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {planData.description}
                    </p>

                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white font-mono">
                          {formatCOP(planData.monthlyEquivalent)}
                        </span>
                        <span className="text-xs text-slate-500">/ mes</span>
                      </div>
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                        {planData.frequencyLabel === 'Mensual'
                          ? `Pagando mes a mes · Equivale a ${formatCOP(BASE_ANNUAL_COP)} al año`
                          : `Facturado hoy: ${formatCOP(planData.billedAmount)} (${planData.savingsText})`}
                      </p>
                    </div>

                    <div className="mt-6 space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Mesas y Zonas sin límite comercial</strong></span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Catálogo de productos sin límite</strong> con fotos y costos</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Período de gracia de 72 horas</strong> ante vencimiento</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Cartas QR interactivas en todas tus mesas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Sincronización multi-pantalla en tiempo real</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Soporte prioritario y copias continuas en la nube</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-orange-200 dark:border-orange-900/60 space-y-2">
                    {isPro && !subState.isInGracePeriod && !subState.cancelAtPeriodEnd ? (
                      <>
                        <div className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold text-center flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          <span>
                            Plan PRO Activo ({user?.billingFrequency ? PAID_PLANS[user.billingFrequency]?.name : 'Activo'})
                          </span>
                        </div>
                        {!isMaster && (
                          <button
                            type="button"
                            onClick={() => setShowCheckoutForm(true)}
                            className="w-full py-2 rounded-xl border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100/60 dark:hover:bg-orange-950/40 text-xs font-bold transition cursor-pointer"
                          >
                            Extender / Renovar con {planData.name}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCheckoutForm(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition cursor-pointer"
                      >
                        <span>
                          {subState.isInGracePeriod || subState.cancelAtPeriodEnd
                            ? `Renovar ${planData.name} (${formatCOP(planData.billedAmount)})`
                            : `Contratar ${planData.name} (${formatCOP(planData.billedAmount)})`}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Canjear Código de Regalo / Promocional */}
              <div className="pt-2">
                <CanjearCodigo
                  onSuccess={() => {
                    setTimeout(() => {
                      setUpgradeSuccess(true);
                      setTimeout(() => {
                        setUpgradeSuccess(false);
                        onClose();
                      }, 1800);
                    }, 500);
                  }}
                />
              </div>

              {/* Tabla Comparativa Detallada de Diferencias */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <PlanComparisonTable />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
