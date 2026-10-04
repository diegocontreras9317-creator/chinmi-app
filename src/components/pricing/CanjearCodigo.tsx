import React, { useState } from 'react';
import { doc, getDoc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Gift, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface CanjearCodigoProps {
  onSuccess?: (dias: number) => void;
  className?: string;
}

/**
 * CanjearCodigo
 * Componente para canjear códigos promocionales de regalo y activar el plan PRO.
 * Consulta la colección `codigos_promocionales/{CODIGO}` y actualiza `users/{uid}`.
 */
export const CanjearCodigo: React.FC<CanjearCodigoProps> = ({ onSuccess, className = '' }) => {
  const { user, upgradePlan } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const handleCanjear = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpio = codigo.trim().toUpperCase();

    // 1. Validación de campo no vacío
    if (!codigoLimpio) {
      setError('Por favor, ingresa un código promocional.');
      return;
    }

    setLoading(true);
    setError(null);
    setMensajeExito(null);

    try {
      // 2. Consulta del documento en la colección 'codigos_promocionales' por su ID
      const codigoRef = doc(db, 'codigos_promocionales', codigoLimpio);
      const codigoSnap = await getDoc(codigoRef);

      // 3. Validaciones de Seguridad y Existencia
      if (!codigoSnap.exists()) {
        throw new Error('El código ingresado no existe');
      }

      const data = codigoSnap.data();

      if (data?.activo === false) {
        throw new Error('Este código ya expiró o fue desactivado');
      }

      // 4. Extracción de días (soporta 'dias_premiun' y 'dias_premium')
      const dias = Number(data?.dias_premiun ?? data?.dias_premium ?? 30);

      // 5. Cálculo de la fecha de expiración
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + dias);
      const timestampExpira = Timestamp.fromDate(fechaExpiracion);

      // 6. Actualización en Firestore del usuario logueado
      const currentUid = auth.currentUser?.uid || user?.id;

      if (!currentUid) {
        throw new Error('Debes iniciar sesión para canjear un código');
      }

      const userDocRef = doc(db, 'users', currentUid);
      
      // Se utiliza setDoc con merge para garantizar la actualización segura
      await setDoc(
        userDocRef,
        {
          plan: 'pro',
          plan_expira: timestampExpira,
          codigo_canjeado: codigoLimpio,
          fecha_canje: Timestamp.now()
        },
        { merge: true }
      );

      // 7. Sincronización del estado reactivo en la aplicación
      if (upgradePlan) {
        upgradePlan('pro');
      }

      // 8. Feedback de éxito y reseteo del formulario
      setMensajeExito(`¡Código canjeado con éxito! Tienes ${dias} días PRO activados`);
      setCodigo('');

      if (onSuccess) {
        onSuccess(dias);
      }
    } catch (err: any) {
      console.error('Error al canjear código:', err);
      setError(err?.message || 'Ocurrió un error al procesar el código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-pink-200 dark:border-pink-900/60 bg-gradient-to-br from-pink-50/70 via-white to-pink-50/30 dark:from-pink-950/20 dark:via-slate-900 dark:to-slate-900/60 p-4 sm:p-5 shadow-xs ${className}`}>
      
      {/* Título y descripción */}
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#681841] to-[#e64980] flex items-center justify-center text-white shadow-xs shrink-0">
          <Gift className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>¿Tienes un código de regalo?</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ingresa tu cupón para activar días de plan PRO de forma inmediata.
          </p>
        </div>
      </div>

      {/* Formulario */}
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm font-mono font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#e64980] focus:border-transparent transition disabled:opacity-50 shadow-2xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !codigo.trim()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs sm:text-sm font-black shadow-md shadow-pink-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shrink-0"
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

        {/* Alerta de Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Alerta de Éxito */}
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
