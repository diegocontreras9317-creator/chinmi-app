import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Empleado, EmpleadoRol } from '../../types';
import {
  Lock,
  Plus,
  LogOut,
  X,
  AlertCircle,
  Delete,
  ShieldCheck,
  CreditCard,
  UtensilsCrossed,
  Wine,
  Sparkles,
  KeyRound,
  Check
} from 'lucide-react';
import { ChinmiLogo } from '../common/ChinmiLogo';

interface ProfileSelectionScreenProps {
  onOpenEmployeeManagement?: () => void;
}

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  purple: {
    bg: 'from-purple-600 to-indigo-700',
    text: 'text-purple-200',
    border: 'border-purple-400/40',
    glow: 'shadow-purple-500/30'
  },
  pink: {
    bg: 'from-[#681841] to-[#e64980]',
    text: 'text-pink-200',
    border: 'border-pink-400/40',
    glow: 'shadow-pink-500/30'
  },
  emerald: {
    bg: 'from-emerald-600 to-teal-700',
    text: 'text-emerald-200',
    border: 'border-emerald-400/40',
    glow: 'shadow-emerald-500/30'
  },
  blue: {
    bg: 'from-blue-600 to-cyan-700',
    text: 'text-blue-200',
    border: 'border-blue-400/40',
    glow: 'shadow-blue-500/30'
  },
  amber: {
    bg: 'from-amber-600 to-orange-700',
    text: 'text-amber-200',
    border: 'border-amber-400/40',
    glow: 'shadow-amber-500/30'
  },
  rose: {
    bg: 'from-rose-600 to-red-700',
    text: 'text-rose-200',
    border: 'border-rose-400/40',
    glow: 'shadow-rose-500/30'
  }
};

const ROLE_BADGES: Record<EmpleadoRol, { label: string; badge: string; icon: React.ReactNode }> = {
  Admin: {
    label: 'Administrador',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    icon: <ShieldCheck className="w-3.5 h-3.5" />
  },
  Cajero: {
    label: 'Cajero / Cobro',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: <CreditCard className="w-3.5 h-3.5" />
  },
  Mesero: {
    label: 'Mesero / Salón',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: <UtensilsCrossed className="w-3.5 h-3.5" />
  },
  Barman: {
    label: 'Barman / Barra',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: <Wine className="w-3.5 h-3.5" />
  }
};

export const ProfileSelectionScreen: React.FC<ProfileSelectionScreenProps> = ({
  onOpenEmployeeManagement
}) => {
  const { user, empleados, seleccionarEmpleado, logout, crearEmpleado } = useAuth();
  const { config } = useApp();

  const [selectedEmpForPin, setSelectedEmpForPin] = useState<Empleado | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickRole, setQuickRole] = useState<EmpleadoRol>('Mesero');
  const [quickPin, setQuickPin] = useState('');
  const [quickColor, setQuickColor] = useState('emerald');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  // Handle profile click
  const handleProfileClick = (emp: Empleado) => {
    // If employee has a configured PIN (non-empty)
    if (emp.pin && emp.pin.trim().length > 0) {
      setSelectedEmpForPin(emp);
      setPinInput('');
      setPinError(null);
    } else {
      // Direct access without PIN
      seleccionarEmpleado(emp);
    }
  };

  // Handle keypad number press
  const handleKeyPress = (num: string) => {
    if (pinInput.length >= 6) return;
    const nextPin = pinInput + num;
    setPinInput(nextPin);
    setPinError(null);

    // If matches target PIN length, verify automatically
    if (selectedEmpForPin && selectedEmpForPin.pin && nextPin.length === selectedEmpForPin.pin.length) {
      if (nextPin === selectedEmpForPin.pin) {
        seleccionarEmpleado(selectedEmpForPin);
        setSelectedEmpForPin(null);
      } else {
        setPinError('PIN incorrecto. Inténtalo de nuevo.');
        setTimeout(() => setPinInput(''), 600);
      }
    }
  };

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(null);
  };

  const handleClear = () => {
    setPinInput('');
    setPinError(null);
  };

  const handleManualSubmitPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmpForPin) return;

    if (pinInput.trim() === selectedEmpForPin.pin?.trim()) {
      seleccionarEmpleado(selectedEmpForPin);
      setSelectedEmpForPin(null);
    } else {
      setPinError('PIN incorrecto. Inténtalo de nuevo.');
      setPinInput('');
    }
  };

  // Keyboard listener for physical numbers on desktop
  useEffect(() => {
    if (!selectedEmpForPin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleManualSubmitPin();
      } else if (e.key === 'Escape') {
        setSelectedEmpForPin(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmpForPin, pinInput]);

  // Quick add first employee if empty
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    setIsSubmittingQuick(true);
    const res = await crearEmpleado({
      nombre: quickName.trim(),
      rol: quickRole,
      pin: quickPin.trim(),
      avatarColor: quickColor
    });
    setIsSubmittingQuick(false);

    if (res.success) {
      setIsQuickAddOpen(false);
      setQuickName('');
      setQuickPin('');
    } else {
      alert(res.error || 'Error al crear perfil');
    }
  };

  return (
    <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col justify-between p-4 sm:p-8 animate-in fade-in select-none">
      
      {/* Top Header Bar */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between py-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <ChinmiLogo size="md" logoUrl={config.logoUrl || (user as any)?.logoUrl} />
          <div className="hidden sm:block">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
              Terminal POS
            </span>
            <span className="text-sm font-black text-white">
              {config.businessName || user?.businessName || 'Chinmi GastroBar'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
          title="Cerrar sesión de la cuenta principal de Firebase"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>

      {/* Center Profiles Presentation (Netflix Style) */}
      <div className="my-auto py-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full text-center">
        
        <div className="mb-8 sm:mb-12 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-950/60 border border-pink-800/50 text-pink-300 text-xs font-bold shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Control de Acceso Multitenant</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            ¿Quién está atendiendo?
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-md mx-auto">
            Selecciona tu perfil de empleado para sincronizar tus comandas y ventas en tiempo real con la caja.
          </p>
        </div>

        {/* Profiles Grid */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 max-w-3xl">
          {empleados.map((emp) => {
            const colorScheme = AVATAR_COLOR_MAP[emp.avatarColor || 'purple'] || AVATAR_COLOR_MAP.purple;
            const roleInfo = ROLE_BADGES[emp.rol] || ROLE_BADGES.Mesero;
            const hasPin = Boolean(emp.pin && emp.pin.trim().length > 0);
            const initials = emp.nombre
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleProfileClick(emp)}
                className="group flex flex-col items-center gap-3 transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer focus:outline-hidden"
              >
                {/* Netflix-style Rounded Square Avatar */}
                <div className={`relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-gradient-to-br ${colorScheme.bg} border-2 ${colorScheme.border} flex items-center justify-center shadow-xl ${colorScheme.glow} group-hover:border-white transition-all overflow-hidden`}>
                  <span className="text-3xl sm:text-5xl font-black text-white tracking-wider">
                    {initials}
                  </span>

                  {/* Lock Indicator Icon */}
                  {hasPin ? (
                    <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-amber-300 backdrop-blur-xs">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-emerald-300 backdrop-blur-xs">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Bottom subtle role tag inside avatar on hover */}
                  <div className="absolute inset-x-0 bottom-0 bg-black/40 py-1 text-[10px] font-bold text-slate-200 uppercase tracking-wider backdrop-blur-xs">
                    {emp.rol}
                  </div>
                </div>

                {/* Name & Role Badge */}
                <div className="text-center space-y-1">
                  <p className="text-base sm:text-lg font-black text-slate-200 group-hover:text-white transition">
                    {emp.nombre}
                  </p>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${roleInfo.badge}`}>
                    {roleInfo.icon}
                    <span>{roleInfo.label}</span>
                  </span>
                </div>
              </button>
            );
          })}

          {/* Add Profile Card */}
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="group flex flex-col items-center gap-3 transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer focus:outline-hidden"
          >
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl border-2 border-dashed border-slate-700 group-hover:border-pink-500 bg-slate-900/60 flex flex-col items-center justify-center text-slate-400 group-hover:text-pink-400 transition-all">
              <Plus className="w-8 h-8 sm:w-10 sm:h-10 mb-1" />
              <span className="text-[11px] font-extrabold">Nuevo Perfil</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-400 group-hover:text-slate-200">
                Agregar Empleado
              </p>
            </div>
          </button>
        </div>

      </div>

      {/* Bottom Footer Note */}
      <div className="w-full max-w-6xl mx-auto py-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <p>
          Sesión de restaurante: <strong className="text-slate-300">{user?.email}</strong>
        </p>
        <p className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Sincronización multi-dispositivo activa vía Firestore</span>
        </p>
      </div>

      {/* PIN Keypad Modal */}
      {selectedEmpForPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div
            className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedEmpForPin(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Profile Avatar & Title */}
            <div className="space-y-2">
              <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${AVATAR_COLOR_MAP[selectedEmpForPin.avatarColor || 'purple']?.bg} border border-white/20 flex items-center justify-center text-white text-2xl font-black shadow-lg`}>
                {selectedEmpForPin.nombre.slice(0, 2).toUpperCase()}
              </div>
              <h3 className="text-xl font-black text-white">
                {selectedEmpForPin.nombre}
              </h3>
              <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-pink-400" />
                <span>Introduce tu PIN numérico de acceso</span>
              </p>
            </div>

            {/* PIN Dots Display */}
            <div className="flex items-center justify-center gap-3 py-2">
              {Array.from({ length: selectedEmpForPin.pin?.length || 4 }).map((_, idx) => {
                const isFilled = idx < pinInput.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                      isFilled
                        ? 'bg-pink-500 border-pink-400 scale-110 shadow-sm shadow-pink-500/50'
                        : 'bg-slate-800 border-slate-600'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error Message */}
            {pinError && (
              <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {/* Interactive On-Screen Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-2 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-xl font-black text-white transition cursor-pointer border border-slate-700/60 shadow-sm"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                className="h-14 rounded-2xl bg-slate-850 hover:bg-slate-800 active:scale-95 text-xs font-extrabold text-slate-400 hover:text-white transition cursor-pointer border border-slate-800"
              >
                Limpiar
              </button>

              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-xl font-black text-white transition cursor-pointer border border-slate-700/60 shadow-sm"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 rounded-2xl bg-slate-850 hover:bg-slate-800 active:scale-95 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer border border-slate-800"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleManualSubmitPin()}
              disabled={pinInput.length === 0}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] disabled:opacity-40 text-white font-black text-sm shadow-lg shadow-pink-500/20 transition cursor-pointer"
            >
              Ingresar al POS
            </button>
          </div>
        </div>
      )}

      {/* Quick Add Employee Modal */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div
            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-pink-400" />
                <h3 className="text-lg font-black text-white">Nuevo Perfil de Empleado</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre del empleado *
                </label>
                <input
                  type="text"
                  required
                  value={quickName}
                  onChange={e => setQuickName(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Rol en el Restaurante *
                </label>
                <select
                  value={quickRole}
                  onChange={e => setQuickRole(e.target.value as EmpleadoRol)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                >
                  <option value="Mesero">Mesero (Solo mesas y comandas)</option>
                  <option value="Cajero">Cajero (Mesas, comandas y cobro)</option>
                  <option value="Barman">Barman (Barra y pedidos)</option>
                  <option value="Admin">Admin (Control total y reportes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  PIN numérico de acceso (Opcional, 4 a 6 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={quickPin}
                  onChange={e => setQuickPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 1234 (Déjalo vacío si no requiere clave)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono tracking-widest focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Si dejas el PIN vacío, el empleado podrá ingresar tocando su perfil directamente.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Color de Avatar
                </label>
                <div className="flex items-center gap-2">
                  {Object.keys(AVATAR_COLOR_MAP).map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setQuickColor(color)}
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_COLOR_MAP[color].bg} transition cursor-pointer ${
                        quickColor === color ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuick || !quickName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] text-white text-xs font-black shadow-md disabled:opacity-40"
                >
                  {isSubmittingQuick ? 'Guardando...' : 'Crear Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
