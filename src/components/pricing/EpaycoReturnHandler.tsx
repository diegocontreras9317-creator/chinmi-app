import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { verifySubscriptionWithBackend } from '../../services/epaycoService';
import { CheckCircle2, Clock, AlertCircle, X, FlaskConical } from 'lucide-react';

export const EpaycoReturnHandler: React.FC = () => {
  const { user, isLoading, upgradePlan } = useAuth();
  const [notification, setNotification] = useState<{
    type: 'success' | 'pending' | 'error';
    message: string;
    refPayco?: string;
    isTest?: boolean;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Extraer la referencia de ePayco de los parámetros URL (redirección PSE / ePayco)
    const params = new URLSearchParams(window.location.search);
    const urlRef = params.get('ref_payco') || params.get('x_ref_payco') || params.get('refPayco');

    if (urlRef && urlRef.trim()) {
      const cleanUrlRef = urlRef.trim();
      try {
        sessionStorage.setItem('chinmi_pending_epayco_ref', cleanUrlRef);
      } catch {}

      // Limpiar parámetros de la URL inmediatamente para evitar ejecuciones o recargas erróneas
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    // 2. Esperar a que la autenticación de Firebase haya finalizado la carga inicial y el usuario esté listo
    if (isLoading) return;

    let pendingRef = '';
    try {
      pendingRef = sessionStorage.getItem('chinmi_pending_epayco_ref') || '';
    } catch {}

    if (!pendingRef || !pendingRef.trim()) return;

    const cleanRef = pendingRef.trim();

    // Comprobar si esta referencia ya fue procesada en esta sesión
    const processedKey = `chinmi_processed_epayco_${cleanRef}`;
    if (sessionStorage.getItem(processedKey) === 'true') {
      return;
    }

    // 3. Procesar la verificación en el servidor con los datos del usuario activo
    const processReturn = async () => {
      try {
        const result = await verifySubscriptionWithBackend({
          refPayco: cleanRef,
          planId: 'monthly',
          userEmail: user?.email,
          userId: user?.id
        });

        sessionStorage.setItem(processedKey, 'true');
        try {
          sessionStorage.removeItem('chinmi_pending_epayco_ref');
        } catch {}

        if (result.verified && result.status === 'approved') {
          if (upgradePlan) {
            upgradePlan('pro', (result.planId as any) || 'monthly', undefined, Boolean(result.isTest));
          }
          setNotification({
            type: 'success',
            message: result.isTest
              ? '¡Pago de Prueba ePayco Confirmado! Tu suscripción PRO ha sido activada en Modo Pruebas.'
              : '¡Pago Aprobado en ePayco! Tu suscripción PRO ha sido activada correctamente.',
            refPayco: cleanRef,
            isTest: Boolean(result.isTest)
          });
        } else if (result.status === 'pending') {
          setNotification({
            type: 'pending',
            message: 'Tu pago por PSE se encuentra en proceso de autorización bancaria. Tu suscripción se activará tan pronto como el banco confirme la aprobación.',
            refPayco: cleanRef,
            isTest: Boolean(result.isTest)
          });
        } else {
          setNotification({
            type: 'error',
            message: result.message || 'La transacción ePayco no fue aprobada por la entidad financiera.',
            refPayco: cleanRef,
            isTest: Boolean(result.isTest)
          });
        }
      } catch {
        setNotification({
          type: 'error',
          message: 'No se pudo verificar el estado de la transacción con ePayco.',
          refPayco: cleanRef
        });
      }
    };

    processReturn();
  }, [user, isLoading, upgradePlan]);

  if (!notification) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] max-w-md w-full animate-in slide-in-from-bottom-5 duration-300 p-4 rounded-2xl shadow-2xl border backdrop-blur-md bg-white/95 dark:bg-slate-900/95">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {notification.type === 'success' && (
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          )}
          {notification.type === 'pending' && (
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          )}
          {notification.type === 'error' && (
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
          )}

          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                {notification.type === 'success'
                  ? 'Suscripción PRO Activada'
                  : notification.type === 'pending'
                  ? 'Pago PSE en Verificación'
                  : 'Respuesta de ePayco'}
              </h4>
              {notification.isTest && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <FlaskConical className="w-2.5 h-2.5" />
                  <span>Modo Pruebas</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              {notification.message}
            </p>
            {notification.refPayco && (
              <p className="text-[10px] font-mono font-bold text-slate-400">
                Ref. ePayco: {notification.refPayco}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNotification(null)}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
