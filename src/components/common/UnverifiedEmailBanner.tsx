import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';

export const UnverifiedEmailBanner: React.FC = () => {
  const { user, isEmailVerified, sendVerificationEmail, reloadEmailVerification } = useAuth();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  if (!user || isEmailVerified) return null;

  const handleResend = async () => {
    setIsSending(true);
    setStatusMsg(null);
    const res = await sendVerificationEmail();
    setIsSending(false);
    if (res.success) {
      setStatusMsg(res.message || 'Correo de verificación reenviado. Revisa tu bandeja de entrada o spam.');
    } else {
      setStatusMsg(res.error || 'No se pudo enviar el correo de verificación.');
    }
  };

  const handleCheckReload = async () => {
    setIsReloading(true);
    setStatusMsg(null);
    const verified = await reloadEmailVerification();
    setIsReloading(false);
    if (verified) {
      setStatusMsg('¡Excelente! Tu correo electrónico ha sido verificado correctamente.');
    } else {
      setStatusMsg('Tu correo aún no aparece como verificado. Asegúrate de hacer clic en el enlace enviado a tu correo.');
    }
  };

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
            <Mail className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-bold leading-tight">
              Verifica tu correo electrónico ({user.email})
            </p>
            <p className="text-[11px] opacity-90 truncate">
              {statusMsg || 'Hemos enviado un enlace de confirmación a tu bandeja de entrada o spam.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResend}
            disabled={isSending}
            className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-500/30 font-semibold transition cursor-pointer flex items-center gap-1"
          >
            {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            <span>{isSending ? 'Enviando...' : 'Reenviar enlace'}</span>
          </button>

          <button
            type="button"
            onClick={handleCheckReload}
            disabled={isReloading}
            className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            {isReloading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            <span>{isReloading ? 'Comprobando...' : 'Ya lo verifiqué'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
