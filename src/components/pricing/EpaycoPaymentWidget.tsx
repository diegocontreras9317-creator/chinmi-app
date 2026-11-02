import React, { useState, useEffect } from 'react';
import { PaidPlanOption } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import {
  openEpaycoCheckout,
  loadEpaycoCheckoutScript,
  getEpaycoPublicKey,
  getEpaycoTestMode
} from '../../services/epaycoService';
import {
  CreditCard,
  ShieldCheck,
  Check,
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface EpaycoPaymentWidgetProps {
  planData: PaidPlanOption;
  businessName?: string;
  userEmail?: string;
  userName?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EpaycoPaymentWidget: React.FC<EpaycoPaymentWidgetProps> = ({
  planData,
  businessName = 'Restaurante',
  userEmail = '',
  userName = '',
  onSuccess,
  onCancel
}) => {
  const [reference] = useState(
    () => `SUB-PRO-${planData.id.toUpperCase()}-${Date.now()}`
  );
  const [isOpening, setIsOpening] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'approved' | 'rejected' | 'pending'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [refPayco, setRefPayco] = useState('');

  useEffect(() => {
    loadEpaycoCheckoutScript();
  }, []);

  const publicKey = getEpaycoPublicKey();
  const isTestMode = getEpaycoTestMode();

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
        extra3: 'pro_subscription',
        nameBilling: userName,
        emailBilling: userEmail
      },
      {
        onApproved: (txData) => {
          setIsOpening(false);
          setRefPayco(txData.x_ref_payco || '');
          setPaymentStatus('approved');
          setTimeout(() => {
            onSuccess();
          }, 1200);
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
          setStatusMessage(
            `Pago pendiente de confirmación (Ref: ${txData.x_ref_payco}).`
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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase px-2.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
              Pasarela ePayco Colombia
            </span>
            {isTestMode && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                Modo Pruebas
              </span>
            )}
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1.5">
            Cobro Seguro de Suscripción PRO
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            Referencia: {reference}
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total en COP ({planData.frequencyLabel})
          </p>
          <p className="text-xl font-black text-orange-600 dark:text-orange-400 font-mono">
            {formatCOP(planData.billedAmount)}
          </p>
        </div>
      </div>

      {paymentStatus === 'approved' ? (
        <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-2 animate-in fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
            ¡Pago Aprobado en ePayco!
          </h4>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Tu suscripción PRO ha sido activada correctamente.
          </p>
          {refPayco && (
            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              Ref. ePayco: {refPayco}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Medios de pago habilitados por ePayco Checkout:</span>
            </div>
            <p className="leading-relaxed">
              Tarjetas de Crédito y Débito (Visa, Mastercard, Amex, Diners), PSE (todos los bancos en Colombia), Nequi, Daviplata y Efecty.
            </p>
          </div>

          {!publicKey && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Llave pública pendiente de configuración</p>
                <p className="mt-0.5">
                  Agrega <code className="font-mono font-bold">VITE_EPAYCO_PUBLIC_KEY</code> en tu archivo <code className="font-mono">.env</code> para habilitar el Checkout de ePayco.
                </p>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{statusMessage}</span>
            </div>
          )}

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
              disabled={isOpening}
              onClick={handlePayWithEpayco}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition cursor-pointer"
            >
              {isOpening ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Abriendo ePayco...</span>
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
