import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Gift, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface CanjearCodigoProps {
  onSuccess?: (dias: number) => void;
  className?: string;
}

/**
 * CanjearCodigo
 * Valida y canjea códigos promocionales exclusivamente mediante el backend autoritativo.
 */
export const CanjearCodigo: React.FC<CanjearCodigoProps> = ({ onSuccess, className = '' }) => {
  const { redeemPromoCode } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const handleCanjear = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoNormalizado = codigo.trim().toUpperCase();

    if (!codigoNormalizado) {
      setError('Por favor, ingresa un código promocional.');
      return;
    }

    setLoading(true);
    setError(null);
    setMensajeExito(null);

    try {
      const result = await redeemPromoCode(codigoNormalizado);
      if (!result.success) {
        setError(result.error || 'No fue posible canjear el código ingresado.');
        return;
      }

      const dias = result.dias || 30;
      setMensajeExito(`¡Código canjeado con éxito! Tienes ${dias} días PRO activados.`);
      setCodigo('');

      if (onSuccess) {
        onSuccess(dias);
      }
    } catch (err: any) {
      setError(err?.message || 'Error inesperado al validar el código promocional.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-md border border-slate-200 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-900/60 p-4 sm:p-5 shadow-xs ${className}`}>
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="w-8 h-8 rounded-md bg-rose-900 flex items-center justify-center text-white shadow-xs shrink-0">
          <Gift className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>¿Tienes un código de regalo?</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ingresa tu cupón para activar días de plan PRO validados en el servidor.
          </p>
        </div>
      </div>

      <form onSubmit={handleCanjear} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="Ingresa tu código PRO..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm font-mono font-bold uppercase tracking-wider focus:outline-hidden focus:ring-2 focus:ring-rose-900 focus:border-rose-900 transition disabled:opacity-50 shadow-2xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !codigo.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs sm:text-sm font-bold shadow-xs active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Canjeando...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Canjear código</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {mensajeExito && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{mensajeExito}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default CanjearCodigo;
