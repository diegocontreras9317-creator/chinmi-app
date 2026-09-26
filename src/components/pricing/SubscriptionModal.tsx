import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PAID_PLANS, BillingFrequency, FREE_PLAN_DETAILS, BASE_ANNUAL_COP } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import {
  X,
  Check,
  Sparkles,
  CreditCard,
  ShieldCheck,
  Zap,
  Lock,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { PlanComparisonTable } from './PlanComparisonTable';
import { WompiPaymentWidget } from './WompiPaymentWidget';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose
}) => {
  const { user, upgradePlan, enableDeveloperMode } = useAuth();
  const { config } = useApp();

  const [selectedCycle, setSelectedCycle] = useState<BillingFrequency>('annual');
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [isProcessing, setIsProcessing] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  if (!isOpen) return null;

  const isPro = user?.plan === 'pro';
  const planData = PAID_PLANS[selectedCycle];

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    await new Promise((res) => setTimeout(res, 850));
    setIsProcessing(false);
    upgradePlan('pro', selectedCycle);
    setUpgradeSuccess(true);
    setTimeout(() => {
      setUpgradeSuccess(false);
      setShowCheckoutForm(false);
      onClose();
    }, 1500);
  };

  const handleDowngrade = () => {
    if (confirm('¿Deseas volver al plan Gratuito para probar los límites?')) {
      upgradePlan('free');
      onClose();
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

          {/* Banner Acceso Desarrollador / Admin (Visible ÚNICAMENTE para diego.contreras9317@gmail.com) */}
          {user?.email?.toLowerCase() === 'diego.contreras9317@gmail.com' && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-purple-950 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg border border-purple-500/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                </div>
                <div>
                  <p className="text-xs font-bold text-purple-100">
                    👑 CUENTA MASTER ADMIN (Diego Contreras)
                  </p>
                  <p className="text-[11px] text-purple-200/80">
                    Acceso vitalicio ilimitado PRO activado para tu cuenta de creador / desarrollador.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  enableDeveloperMode();
                  setUpgradeSuccess(true);
                  setTimeout(() => {
                    setUpgradeSuccess(false);
                    setShowCheckoutForm(false);
                    onClose();
                  }, 1200);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-xs shadow-md transition whitespace-nowrap cursor-pointer shrink-0"
              >
                Reactivar Master PRO
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
            /* Wompi Integration Payment Form */
            <div className="max-w-2xl mx-auto space-y-4">
              <WompiPaymentWidget
                planData={planData}
                userEmail={user?.email}
                userName={user?.name}
                onSuccess={() => {
                  upgradePlan('pro', selectedCycle);
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
            /* Comparison & Plan Selector */
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
                        <span>Hasta <strong>{config.freemiumLimits.freeMaxTables} mesas</strong> simultáneas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Hasta <strong>{config.freemiumLimits.freeMaxProducts} productos</strong> en inventario</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>1 zona estándar del local</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Cobros en caja TPV y tickets simplificados</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin módulo de despensa de perecederos</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin pedidos directos del comensal por QR</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin exportación histórica a Excel/CSV</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                    {!isPro ? (
                      <div className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold text-center">
                        Plan Actual Activo
                      </div>
                    ) : (
                      <button
                        onClick={handleDowngrade}
                        className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition"
                      >
                        Cambiar a Plan Gratuito
                      </button>
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
                        PRO ⭐
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
                        <span><strong>Mesas y Zonas Ilimitadas</strong> (Terraza, Salón, Barra, VIP)</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Catálogo de productos Ilimitado</strong> con fotos y costos</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Módulo Despensa</strong>: Control de mermas y alertas de caducidad</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span><strong>Cartas QR Interactivas</strong>: Pedidos y llamada a mesero</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Sincronización multi-pantalla en tiempo real instantánea</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Historial y exportación CSV de tickets y ventas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span>Soporte prioritario y copias de seguridad en la nube</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-orange-200 dark:border-orange-900/60">
                    {isPro ? (
                      <div className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold text-center flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" />
                        <span>Plan PRO Activo ({user?.billingFrequency ? PAID_PLANS[user.billingFrequency]?.name : 'Ilimitado'})</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCheckoutForm(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition cursor-pointer"
                      >
                        <span>Contratar {planData.name} ({formatCOP(planData.billedAmount)})</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

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
