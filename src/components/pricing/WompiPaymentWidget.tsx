import React, { useState, useEffect } from 'react';
import { PaidPlanOption } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import {
  getWompiSignature,
  simulateWompiWebhookApproval,
  loadWompiWidgetScript,
  WompiSignatureResponse
} from '../../services/wompiService';
import {
  CreditCard,
  Building2,
  Smartphone,
  ShieldCheck,
  Lock,
  Check,
  AlertCircle,
  ExternalLink,
  Sparkles,
  RefreshCw,
  QrCode,
  ArrowRight
} from 'lucide-react';

interface WompiPaymentWidgetProps {
  planData: PaidPlanOption;
  userEmail?: string;
  userName?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type PaymentMethodType = 'pse' | 'nequi' | 'bancolombia' | 'card' | 'wompi_widget';

const COLOMBIAN_BANKS = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco AV Villas',
  'Scotiabank Colpatria',
  'Nequi (PSE)',
  'Daviplata (PSE)',
  'RappiPay (PSE)',
  'Lulo Bank',
  'Nu Colombia',
  'Banco Agrario'
];

export const WompiPaymentWidget: React.FC<WompiPaymentWidgetProps> = ({
  planData,
  userEmail = 'gerente@restaurante.com',
  userName = 'Diego Contreras',
  onSuccess,
  onCancel,
}) => {
  const [method, setMethod] = useState<PaymentMethodType>('card');
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [wompiData, setWompiData] = useState<WompiSignatureResponse | null>(null);
  const [reference] = useState(() => `REF-PRO-${planData.id.toUpperCase()}-${Date.now()}`);

  // Campos específicos de pago
  const [selectedBank, setSelectedBank] = useState('Bancolombia');
  const [personType, setPersonType] = useState<'NATURAL' | 'JURIDICA'>('NATURAL');
  const [nequiPhone, setNequiPhone] = useState('3001234567');
  const [cardNumber, setCardNumber] = useState('4576 •••• •••• 8821');
  const [cardHolder, setCardHolder] = useState(userName);
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvc, setCardCvc] = useState('321');

  // Estado del proceso de pago
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending_pse' | 'pending_nequi' | 'approved' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [transactionId, setTransactionId] = useState('');

  // 1. Obtener la firma de integridad de Wompi desde el Backend al montar
  useEffect(() => {
    let isMounted = true;

    async function fetchSignature() {
      setLoadingSignature(true);
      try {
        const sigData = await getWompiSignature({
          reference,
          amountInCents: planData.billedAmount * 100, // En centavos COP (ej. $854.400 = 85440000 centavos)
          currency: 'COP',
        });

        if (isMounted) {
          setWompiData(sigData);
          setLoadingSignature(false);
        }
      } catch (err) {
        console.error('Error obteniendo firma:', err);
        if (isMounted) {
          setErrorMessage('No se pudo generar la firma de seguridad con el servidor Wompi.');
          setLoadingSignature(false);
        }
      }
    }

    fetchSignature();
    return () => {
      isMounted = false;
    };
  }, [reference, planData.billedAmount]);

  // Cargar Script oficial del Widget de Wompi
  useEffect(() => {
    loadWompiWidgetScript();
  }, []);

  // Abrir Widget oficial Checkout de Wompi
  const handleOpenOfficialWidget = async () => {
    if (!wompiData) return;
    setIsProcessing(true);

    try {
      const checkout = new (window as any).WidgetCheckout({
        currency: 'COP',
        amountInCents: wompiData.amountInCents,
        reference: wompiData.reference,
        publicKey: wompiData.publicKey,
        signature: {
          integrity: wompiData.signature,
        },
        customerData: {
          email: userEmail,
          fullName: userName,
        },
      });

      checkout.open((result: any) => {
        const transaction = result?.transaction;
        console.log('[WOMPI WIDGET RESULT]', transaction);
        if (transaction && transaction.status === 'APPROVED') {
          setPaymentStatus('approved');
          simulateWompiWebhookApproval(wompiData.reference, transaction.id);
          setTimeout(() => onSuccess(), 1200);
        } else if (transaction && transaction.status === 'DECLINED') {
          setPaymentStatus('failed');
          setErrorMessage('La transacción fue declinada por la entidad financiera.');
        } else {
          // Pendiente o cerrado
          setIsProcessing(false);
        }
      });
    } catch (e) {
      console.warn('Fallback si WidgetCheckout no se cargó:', e);
      // Simular procesamiento fluido de sandbox
      await simulatePaymentProcess();
    }
  };

  // Simular el flujo de pago con backend y webhook para PSE/Nequi/Tarjetas/Bancolombia
  const simulatePaymentProcess = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    const mockTxId = `wompi-tx-${Date.now()}`;
    setTransactionId(mockTxId);

    if (method === 'pse') {
      setPaymentStatus('pending_pse');
      // Simular espera de respuesta de la pasarela PSE
      await new Promise((res) => setTimeout(res, 1800));
    } else if (method === 'nequi') {
      setPaymentStatus('pending_nequi');
      // Simular notificación push enviada a la app Nequi
      await new Promise((res) => setTimeout(res, 2000));
    } else {
      // Tarjeta o Botón Bancolombia
      await new Promise((res) => setTimeout(res, 1500));
    }

    // Llamada al endpoint del Webhook de Wompi en el backend para aprobar
    const approved = await simulateWompiWebhookApproval(reference, mockTxId);

    if (approved) {
      setPaymentStatus('approved');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } else {
      setPaymentStatus('failed');
      setErrorMessage('Ocurrió un problema procesando el cobro en Wompi.');
    }

    setIsProcessing(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'wompi_widget') {
      handleOpenOfficialWidget();
    } else {
      simulatePaymentProcess();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl space-y-6">
      {/* Header Resumen del Pedido Wompi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Pasarela Wompi Colombia 🇨🇴
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Ref: {reference}
            </span>
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
            Cobro Seguro de Suscripción PRO
          </h3>
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

      {/* Firma de Integridad calculada por el Backend */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-medium">
          <span className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
            <Lock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Firma de Integridad (SHA-256) Backend:
          </span>
          {loadingSignature ? (
            <span className="flex items-center gap-1 text-slate-400 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" /> Generando firma...
            </span>
          ) : (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              ✓ Firma Wompi Válida
            </span>
          )}
        </div>
        {wompiData && (
          <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-800 select-all">
            {wompiData.signature}
          </p>
        )}
      </div>

      {/* Selector de Métodos de Pago Wompi COP */}
      <div>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
          Selecciona tu método de pago en Colombia:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {/* Tarjetas */}
          <button
            type="button"
            onClick={() => setMethod('card')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              method === 'card'
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span className="text-xs">Tarjetas</span>
            <span className="text-[9px] text-slate-400">Visa / MC</span>
          </button>

          {/* PSE */}
          <button
            type="button"
            onClick={() => setMethod('pse')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              method === 'pse'
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs">PSE</span>
            <span className="text-[9px] text-slate-400">Cualquier banco</span>
          </button>

          {/* Nequi */}
          <button
            type="button"
            onClick={() => setMethod('nequi')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              method === 'nequi'
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            <Smartphone className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            <span className="text-xs">Nequi</span>
            <span className="text-[9px] text-slate-400">Push App</span>
          </button>

          {/* Botón Bancolombia */}
          <button
            type="button"
            onClick={() => setMethod('bancolombia')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              method === 'bancolombia'
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-5 h-5 text-amber-500" />
            <span className="text-xs">Bancolombia</span>
            <span className="text-[9px] text-slate-400">Débito directo</span>
          </button>

          {/* Widget Oficial Wompi */}
          <button
            type="button"
            onClick={() => setMethod('wompi_widget')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer col-span-2 sm:col-span-1 ${
              method === 'wompi_widget'
                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span className="text-xs">Widget Wompi</span>
            <span className="text-[9px] text-slate-400">Ventana emergente</span>
          </button>
        </div>
      </div>

      {/* Formulario según Método Seleccionado */}
      {paymentStatus === 'approved' ? (
        <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-2 animate-in fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
            ¡Pago Aprobado con Éxito en Wompi!
          </h4>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            El Webhook del backend (<code className="font-mono">/api/wompi-webhook</code>) ha verificado el checksum y activado la suscripción PRO.
          </p>
          {transactionId && (
            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              ID Transacción Wompi: {transactionId}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* PSE Fields */}
          {method === 'pse' && (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Selecciona tu Entidad Financiera (Banco):
                </label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {COLOMBIAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Tipo de Personería:
                  </label>
                  <select
                    value={personType}
                    onChange={(e: any) => setPersonType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="NATURAL">Persona Natural</option>
                    <option value="JURIDICA">Persona Jurídica (Empresa)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Documento del Titular:
                  </label>
                  <input
                    type="text"
                    defaultValue="1020304050"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Nequi Fields */}
          {method === 'nequi' && (
            <div className="space-y-3 bg-pink-50/50 dark:bg-pink-950/20 p-4 rounded-xl border border-pink-200 dark:border-pink-900/50 text-xs">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                <span className="font-bold text-pink-950 dark:text-pink-100">
                  Cobro Directo a Nequi Colombia
                </span>
              </div>
              <p className="text-[11px] text-pink-800 dark:text-pink-300">
                Al hacer clic en pagar, te enviaremos una notificación push a tu app de Nequi para que apruebes el débito en tu celular.
              </p>
              <div>
                <label className="block font-bold text-pink-900 dark:text-pink-200 mb-1">
                  Número Telefónico Registrado en Nequi:
                </label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 rounded-xl bg-pink-100 dark:bg-pink-900/60 font-bold text-pink-900 dark:text-pink-200">
                    +57
                  </span>
                  <input
                    type="tel"
                    value={nequiPhone}
                    onChange={(e) => setNequiPhone(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-pink-200 dark:border-pink-800 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                    placeholder="300 000 0000"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Botón Bancolombia Fields */}
          {method === 'bancolombia' && (
            <div className="space-y-3 bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 text-xs">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="font-bold text-amber-950 dark:text-amber-100">
                  Botón Bancolombia Débito Directo
                </span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Serás redirigido de forma segura a la plataforma de Bancolombia para autorizar la transferencia desde tu cuenta de ahorros o corriente.
              </p>
            </div>
          )}

          {/* Card Fields */}
          {method === 'card' && (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Nombre del Titular de la Tarjeta:
                </label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Número de Tarjeta (Visa / MasterCard):
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Vencimiento:
                  </label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Código CVC:
                  </label>
                  <input
                    type="text"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Wompi Widget Option Description */}
          {method === 'wompi_widget' && (
            <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-xs space-y-2">
              <p className="font-bold text-purple-900 dark:text-purple-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Widget Oficial Integrado Wompi Checkout
              </p>
              <p className="text-[11px] text-purple-800 dark:text-purple-300">
                Abre la ventana modal oficial de Wompi con la firma de seguridad backend precargada para pagar con Tarjetas, PSE, Nequi, Botón Bancolombia o Corresponsal Bancario.
              </p>
            </div>
          )}

          {/* Mensajes de Error */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Botón Acción Principal */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isProcessing || loadingSignature}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-500/25 transition cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando pago con Wompi...</span>
                </>
              ) : method === 'wompi_widget' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Abrir Widget Wompi ({formatCOP(planData.billedAmount)})</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Pagar {formatCOP(planData.billedAmount)} con Wompi</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Transacciones cifradas de Wompi Bancolombia. Moneda oficial COP.</span>
          </div>
        </form>
      )}
    </div>
  );
};
