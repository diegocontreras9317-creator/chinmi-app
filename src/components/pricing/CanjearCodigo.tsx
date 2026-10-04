import React, { useState } from 'react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Gift, Sparkles, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

interface CanjearCodigoProps {
  onSuccess?: (dias: number) => void;
  className?: string;
}

/**
 * CanjearCodigo
 * Componente para canjear códigos de regalo/promocionales y activar el plan PRO en Chinmi App.
 * Valida la existencia y estado activo en la colección `codigos_promocionales/{CODIGO}`
 * y actualiza la colección `users/{uid}` con `plan: 'pro'` y `plan_expira: Timestamp`.
 */
export const CanjearCodigo: React.FC<CanjearCodigoProps> = ({ onSuccess, className = '' }) => {
  const { user, upgradePlan } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCanjear = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoNormalizado = codigo.trim().toUpperCase();

    if (!codigoNormalizado) {
      setError('Por favor, ingresa un código promocional válido.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Consulta a Firestore en la colección 'codigos_promocionales' buscando el ID del documento
      const codigoDocRef = doc(db, 'codigos_promocionales', codigoNormalizado);
      const codigoSnap = await getDoc(codigoDocRef);

      // 2. Validación de existencia y estado activo
      if (!codigoSnap.exists() || codigoSnap.data()?.activo === false) {
        throw new Error('Código inválido o expirado');
      }

      const promoData = codigoSnap.data();
      const diasPremium = Number(promoData?.dias_premium) || 30;

      // 3. Cálculo de la fecha de expiración sumando los días premium a la fecha actual
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + diasPremium);
      const timestampExpira = Timestamp.fromDate(fechaExpiracion);

      // 4. Actualización del documento del usuario logueado en la colección `users/${uid}`
      const targetUid = auth.currentUser?.uid || user?.id;

      if (targetUid) {
        const userDocRef = doc(db, 'users', targetUid);
        await setDoc(
          userDocRef,
          {
            plan: 'pro',
            plan_expira: timestampExpira,
            codigo_canjeado: codigoNormalizado,
            fecha_canje: Timestamp.now()
          },
          { merge: true }
        );
      }

      // 5. Actualización inmediata del estado en el contexto de la aplicación
      if (upgradePlan) {
        upgradePlan('pro');
      }

      // 6. Feedback de éxito y reseteo del formulario
      const msgExito = `¡Felicidades! Tienes ${diasPremium} días de PRO activados en tu cuenta.`;
      setSuccessMessage(msgExito);
      setCodigo('');

      if (onSuccess) {
        onSuccess(diasPremium);
      }
    } catch (err: any) {
      console.error('Error al canjear código promocional:', err);
      setError(err?.message || 'Código inválido o expirado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-pink-200 dark:border-pink-900/60 bg-gradient-to-br from-pink-50/70 via-white to-pink-50/30 dark:from-pink-950/20 dark:via-slate-900 dark:to-slate-900/60 p-4 sm:p-5 shadow-xs ${className}`}>
      
      {/* Encabezado del módulo */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#681841] to-[#e64980] flex items-center justify-center text-white shadow-xs shrink-0">
          <Gift className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>¿Tienes un código de regalo o promo?</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ingresa tu cupón para canjear días gratis del plan PRO.
          </p>
        </div>
      </div>

      {/* Formulario de Canje */}
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
              placeholder="EJ: CHINMI30, PROMO2026..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm font-mono font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#e64980] focus:border-transparent transition disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !codigo.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs sm:text-sm font-black shadow-md shadow-pink-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validando...</span>
              </>
            ) : (
              <>
                <span>Canjear</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Mensaje de Éxito */}
        {successMessage && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default CanjearCodigo;
