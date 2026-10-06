import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, Eye, EyeOff, X, KeyRound, AlertCircle, Check } from 'lucide-react';

export const ManagerPinModal: React.FC = () => {
  const {
    isPinModalOpen,
    pinModalConfig,
    closePinModal,
    verifyManagerPin,
    managerPin
  } = useAuth();

  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPinModalOpen) {
      setPin('');
      setError(null);
      setSuccess(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isPinModalOpen]);

  if (!isPinModalOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin.trim()) {
      setError('Por favor ingresa la clave de acceso');
      return;
    }

    if (verifyManagerPin(pin.trim())) {
      setError(null);
      setSuccess(true);
      setTimeout(() => {
        const callback = pinModalConfig?.onSuccess;
        closePinModal();
        if (callback) callback();
      }, 250);
    } else {
      setError('Clave de acceso incorrecta. Inténtalo nuevamente.');
      setPin('');
      inputRef.current?.focus();
    }
  };

  const handleKeypadPress = (digit: string) => {
    setError(null);
    if (digit === 'clear') {
      setPin('');
    } else if (digit === 'backspace') {
      setPin(prev => prev.slice(0, -1));
    } else {
      if (pin.length < 10) {
        setPin(prev => prev + digit);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-stone-50 dark:bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-stone-100 dark:bg-slate-800 text-rose-900 dark:text-rose-300 border border-stone-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-rose-900 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{pinModalConfig?.title || 'Clave de Acceso de Gerencia'}</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Seguridad de Control Total
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePinModal}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {pinModalConfig?.description || 
              'Esta acción requiere autorización de Gerente. Por favor ingresa tu clave o PIN de acceso para continuar.'}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Clave de Acceso / PIN
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  ref={inputRef}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => {
                    setError(null);
                    setPin(e.target.value);
                  }}
                  placeholder="••••"
                  autoComplete="off"
                  className={`w-full pl-9 pr-10 py-3 rounded-md border text-center text-xl font-mono tracking-widest font-black focus:outline-hidden transition ${
                    error
                      ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500'
                      : success
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Feedback */}
            {success && (
              <div className="p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 shrink-0" />
                <span>¡Clave verificada! Accediendo...</span>
              </div>
            )}

            {/* On-Screen Touch Keypad (ideal para tablets/pantallas táctiles de bar y restaurante) */}
            <div className="pt-1">
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="py-2.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-base transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('clear')}
                  className="py-2.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-semibold text-xs transition active:scale-95 cursor-pointer"
                >
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-2.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-base transition active:scale-95 cursor-pointer shadow-2xs"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('backspace')}
                  className="py-2.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-semibold text-xs transition active:scale-95 cursor-pointer"
                >
                  ⌫
                </button>
              </div>
            </div>

            {/* Helpful Demo Hint */}
            <div className="p-2.5 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>
                💡 Clave de fábrica por defecto: <strong className="font-mono text-rose-900 dark:text-rose-300 font-bold">{managerPin}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPin(managerPin)}
                className="text-[10px] font-bold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer ml-1 shrink-0"
              >
                Autocompletar
              </button>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={closePinModal}
                className="w-1/2 py-2.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 py-2.5 rounded-md bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Verificar Clave</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
