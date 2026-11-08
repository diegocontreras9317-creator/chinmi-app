import React, { useState, useEffect } from 'react';
import { PaidPlanOption } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import {
  openEpaycoCheckout,
  loadEpaycoCheckoutScript,
  getEpaycoPublicKey,
  setRuntimeEpaycoPublicKey,
  getEpaycoTestMode,
  verifySubscriptionWithBackend,
  EpaycoValidationData
} from '../../services/epaycoService';
import {
  CreditCard,
  ShieldCheck,
  Check,
  AlertCircle,
  ArrowRight,
  Loader2,
  Building2,
  Lock,
  Wallet,
  Key,
  Clock
} from 'lucide-react';

interface EpaycoPaymentWidgetProps {
  planData: PaidPlanOption;
  businessName?: string;
  userEmail?: string;
  userName?: string;
  userId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EpaycoPaymentWidget: React.FC<EpaycoPaymentWidgetProps> = ({
  planData,
  businessName = 'Restaurante',
  userEmail = '',
  userName = '',
  userId = '',
  onSuccess,
  onCancel
}) => {
  const [reference] = useState(
    () => `SUB-PRO-${planData.id.toUpperCase()}-${Date.now()}`
  );
  const [isOpening, setIsOpening] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'approved' | 'rejected' | 'pending'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [refPayco, setRefPayco] = useState('');
  const [inputPublicKey, setInputPublicKey] = useState('');
  const [currentPublicKey, setCurrentPublicKey] = useState(() => getEpaycoPublicKey());

  useEffect(() => {
    loadEpaycoCheckoutScript();
  }, []);

  const isTestMode = getEpaycoTestMode();

  const handleSaveRuntimeKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPublicKey.trim()) return;
    setRuntimeEpaycoPublicKey(inputPublicKey.trim());
    setCurrentPublicKey(inputPublicKey.trim());
  };

  const processServerVerification = async (txData: EpaycoValidationData) => {
    setIsVerifying(true);
    setStatusMessage('');

    const candidateRef = txData.x_ref_payco || reference;
    setRefPayco(candidateRef);

    const verification = await verifySubscriptionWithBackend({
      refPayco: candidateRef,
      planId: planData.id,
      userEmail,
      userId
    });

    setIsVerifying(false);

    if (verification.verified && verification.status === 'approved') {
      setPaymentStatus('approved');
      setTimeout(() => {
        onSuccess();
      }, 1200);
      return;
    }

    if (verification.status === 'pending') {
      setPaymentStatus('pending');
      setStatusMessage(
        verification.message ||
          'Tu transacción por PSE está siendo verificada por la entidad bancaria. La suscripción se activará tan pronto como tu banco la confirme.'
      );
      return;
    }

    setPaymentStatus('rejected');
    setStatusMessage(
      verification.message ||
        verification.error ||
        'La transacción no pudo ser verificada o fue rechazada por la entidad bancaria.'
    );
  };

  const handlePayWithEpayco = async () => {
    setIsOpening(true);
    setStatusMessage('');

    await openEpaycoCheckout(
      {
        restaurantName: businessName,
        description: `Suscripción ${planData.name} (${planData.frequencyLabel})`,
        invoice: reference,
        amount: planData.billedAmount,
        taxBase: planData.billedAmount,
        tax: 0,
        taxIco: 0,
        extra1: reference,
        extra2: planData.id,
        extra3: userId || userEmail,
        nameBilling: userName,
        emailBilling: userEmail
      },
      {
        onApproved: async (txData) => {
          setIsOpening(false);
          await processServerVerification(txData);
        },
        onRejected: (txData) => {
          setIsOpening(false);
          setPaymentStatus('rejected');
          setStatusMessage(
            txData.x_response_reason_text ||
              'La transacción fue rechazada por la entidad financiera.'
          );
        },
        onPending: (txData) => {
          setIsOpening(false);
          setPaymentStatus('pending');
          setRefPayco(txData.x_ref_payco || '');
          setStatusMessage(
            `Pago por PSE en proceso de autorización por tu banco (Ref: ${txData.x_ref_payco || reference}). Tu suscripción se activará tan pronto como el banco envíe la confirmación.`
          );
        },
        onModalClosed: () => {
          setIsOpening(false);
        },
        onError: (msg) => {
          setIsOpening(false);
          setPaymentStatus('rejected');
          setStatusMessage(msg);
        }
      }
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-2xl space-y-6 animate-in fade-in">
      {/* Encabezado e Resumen del Cobro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-xs uppercase px-2.5 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
              ePayco Colombia
            </span>
            {isTestMode && (
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Modo Pruebas
              </span>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5">
            Cobro Seguro de Suscripción PRO
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            Referencia: {reference}
          </p>
        </div>

        <div className="text-left sm:text-right bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shrink-0">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Total a Pagar ({planData.frequencyLabel})
          </p>
          <p className="text-2xl font-black text-orange-600 dark:text-orange-400 font-mono">
            {formatCOP(planData.billedAmount)}
          </p>
        </div>
      </div>

      {paymentStatus === 'approved' ? (
        <div className="p-7 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-3 animate-in fade-in">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
            <Check className="w-7 h-7" />
          </div>
          <h4 className="text-lg font-extrabold text-emerald-900 dark:text-emerald-100">
            ¡Pago Aprobado y Suscripción Activada!
          </h4>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
            ePayco y el servidor han verificado con éxito tu pago. Tu restaurante ahora cuenta con mesas y productos ilimitados.
          </p>
          {refPayco && (
            <p className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 pt-1">
              Ref. Aprobada ePayco: {refPayco}
            </p>
          )}
        </div>
      ) : paymentStatus === 'pending' ? (
        <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                Pago por PSE / Transferencia en Proceso
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {statusMessage}
              </p>
              {refPayco && (
                <p className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 pt-1">
                  Referencia de seguimiento: {refPayco}
                </p>
              )}
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Métodos de Pago Habilitados por ePayco */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Medios de Pago Habilitados mediante ePayco Colombia:</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
                  <CreditCard className="w-4 h-4 text-orange-500 shrink-0" />
                  <span>Tarjetas de Crédito</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Visa, Mastercard, American Express, Diners Club.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
                  <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>PSE (Débito Bancario)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Debita directo desde Bancolombia, Nequi, Davivienda, etc.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
                  <Wallet className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Billeteras / Efectivo</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Daviplata, Nequi QR, Efecty y SuRed.
                </p>
              </div>
            </div>
          </div>

          {/* Formulario de prueba / Input manual de VITE_EPAYCO_PUBLIC_KEY en desarrollo */}
          {!currentPublicKey && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 space-y-3">
              <div className="flex items-start gap-2.5">
                <Key className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-bold">Llave Pública ePayco pendiente en entorno de desarrollo</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Si aún no has configurado <code className="font-mono font-bold">VITE_EPAYCO_PUBLIC_KEY</code> en Vercel o tu archivo <code className="font-mono">.env</code>, pega tu Llave Pública de ePayco a continuación para probar la pasarela inmediatamente:
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveRuntimeKey} className="flex gap-2">
                <input
                  type="text"
                  value={inputPublicKey}
                  onChange={(e) => setInputPublicKey(e.target.value)}
                  placeholder="Pega aquí tu VITE_EPAYCO_PUBLIC_KEY..."
                  className="flex-1 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={!inputPublicKey.trim()}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  Usar Llave
                </button>
              </form>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{statusMessage}</span>
            </div>
          )}

          {isVerifying && (
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center gap-3 text-xs text-blue-800 dark:text-blue-200 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Verificando transacción de forma segura con el servidor de ePayco...</span>
            </div>
          )}

          {/* Garantía de Seguridad de Datos */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              Tus datos de tarjeta y cuenta bancaria son procesados 100% por la pasarela cifrada de ePayco. Ningún dato bancario se almacena en Chinmi App.
            </span>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Volver
            </button>

            <button
              type="button"
              disabled={isOpening || isVerifying || !currentPublicKey}
              onClick={handlePayWithEpayco}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {isOpening ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cargando ePayco...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Pagar con ePayco ({formatCOP(planData.billedAmount)})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
