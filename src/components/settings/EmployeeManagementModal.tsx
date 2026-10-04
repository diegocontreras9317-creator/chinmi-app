import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Empleado, EmpleadoRol } from '../../types';
import {
  Users,
  Plus,
  X,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  ShieldCheck,
  CreditCard,
  UtensilsCrossed,
  Wine,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface EmployeeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  purple: { bg: 'from-purple-600 to-indigo-700', text: 'text-purple-200' },
  pink: { bg: 'from-[#681841] to-[#e64980]', text: 'text-pink-200' },
  emerald: { bg: 'from-emerald-600 to-teal-700', text: 'text-emerald-200' },
  blue: { bg: 'from-blue-600 to-cyan-700', text: 'text-blue-200' },
  amber: { bg: 'from-amber-600 to-orange-700', text: 'text-amber-200' },
  rose: { bg: 'from-rose-600 to-red-700', text: 'text-rose-200' }
};

const ROLE_ICONS: Record<EmpleadoRol, React.ReactNode> = {
  Admin: <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
  Cajero: <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
  Mesero: <UtensilsCrossed className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
  Barman: <Wine className="w-4 h-4 text-amber-600 dark:text-amber-400" />
};

export const EmployeeManagementModal: React.FC<EmployeeManagementModalProps> = ({
  isOpen,
  onClose
}) => {
  const { empleados, empleadoActivo, crearEmpleado, actualizarEmpleado, eliminarEmpleado } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<EmpleadoRol>('Mesero');
  const [pin, setPin] = useState('');
  const [avatarColor, setAvatarColor] = useState('purple');
  const [showPin, setShowPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Open form for creating new employee
  const handleOpenCreate = () => {
    setIsEditing(true);
    setEditingId(null);
    setNombre('');
    setRol('Mesero');
    setPin('');
    setAvatarColor('emerald');
    setShowPin(false);
    setErrorMsg(null);
  };

  // Open form for editing existing employee
  const handleOpenEdit = (emp: Empleado) => {
    setIsEditing(true);
    setEditingId(emp.id);
    setNombre(emp.nombre);
    setRol(emp.rol);
    setPin(emp.pin || '');
    setAvatarColor(emp.avatarColor || 'purple');
    setShowPin(false);
    setErrorMsg(null);
  };

  const handleCancelForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nombre.trim()) {
      setErrorMsg('El nombre del empleado es obligatorio.');
      return;
    }

    if (pin.trim() && (pin.trim().length < 4 || pin.trim().length > 6)) {
      setErrorMsg('El PIN debe tener entre 4 y 6 dígitos numéricos (o déjalo vacío).');
      return;
    }

    setIsSubmitting(true);

    if (editingId) {
      // Update
      const res = await actualizarEmpleado(editingId, {
        nombre: nombre.trim(),
        rol,
        pin: pin.trim(),
        avatarColor
      });
      setIsSubmitting(false);

      if (res.success) {
        setSuccessMsg('Empleado actualizado correctamente.');
        setTimeout(() => setSuccessMsg(null), 3000);
        setIsEditing(false);
        setEditingId(null);
      } else {
        setErrorMsg(res.error || 'Error al actualizar empleado.');
      }
    } else {
      // Create
      const res = await crearEmpleado({
        nombre: nombre.trim(),
        rol,
        pin: pin.trim(),
        avatarColor
      });
      setIsSubmitting(false);

      if (res.success) {
        setSuccessMsg('Nuevo empleado creado en Firestore.');
        setTimeout(() => setSuccessMsg(null), 3000);
        setIsEditing(false);
      } else {
        setErrorMsg(res.error || 'Error al crear empleado.');
      }
    }
  };

  const handleDelete = async (id: string, empName: string) => {
    if (!confirm(`¿Estás seguro de eliminar el perfil de "${empName}"?`)) return;

    const res = await eliminarEmpleado(id);
    if (res.success) {
      setSuccessMsg('Empleado eliminado.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      alert(res.error || 'Error al eliminar empleado.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Gestión de Empleados y Roles
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configura los perfiles con PIN que usarán tus meseros, cajeros y barman.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMsg && (
          <div className="px-5 py-2.5 bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* If form is open */}
          {isEditing ? (
            <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-pink-500" />
                  <span>{editingId ? 'Editar Empleado' : 'Crear Nuevo Empleado'}</span>
                </h3>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold"
                >
                  Volver a la lista
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      placeholder="Ej. Andrés Ramírez"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Rol y Permisos *
                    </label>
                    <select
                      value={rol}
                      onChange={e => setRol(e.target.value as EmpleadoRol)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                    >
                      <option value="Mesero">Mesero (Mesas, comandas y platos)</option>
                      <option value="Cajero">Cajero (Mesas, comandas y cobro)</option>
                      <option value="Barman">Barman (Barra y pedidos de bebidas)</option>
                      <option value="Admin">Admin (Control total, reportes e inventario)</option>
                    </select>
                  </div>
                </div>

                {/* PIN Setting */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                      <span>PIN Numérico de Acceso (4 a 6 dígitos)</span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-500">
                      Opcional
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={6}
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej. 1234 (Déjalo vacío para acceso directo sin clave)"
                      className="w-full pl-3.5 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-widest text-sm focus:outline-hidden focus:ring-2 focus:ring-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Este PIN se solicitará en la pantalla de bloqueo estilo Netflix al hacer clic en este perfil.
                  </p>
                </div>

                {/* Color Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Color del Perfil
                  </label>
                  <div className="flex items-center gap-2">
                    {Object.keys(AVATAR_COLOR_MAP).map(col => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setAvatarColor(col)}
                        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${AVATAR_COLOR_MAP[col].bg} transition cursor-pointer ${
                          avatarColor === col ? 'ring-2 ring-pink-500 scale-110 shadow-sm' : 'opacity-70 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !nombre.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs font-black shadow-md shadow-pink-500/20 transition cursor-pointer disabled:opacity-40"
                  >
                    {isSubmitting ? 'Guardando...' : editingId ? 'Actualizar Empleado' : 'Guardar Empleado'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {empleados.length} empleados registrados
                </p>
                <p className="text-[11px] text-slate-500">
                  Todos los cambios se sincronizan en tiempo real con Firestore en la nube.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] text-white text-xs font-black shadow-md shadow-pink-500/20 hover:opacity-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Empleado</span>
              </button>
            </div>
          )}

          {/* Employees List */}
          <div className="space-y-2 pt-1">
            {empleados.map((emp) => {
              const colorInfo = AVATAR_COLOR_MAP[emp.avatarColor || 'purple'] || AVATAR_COLOR_MAP.purple;
              const hasPin = Boolean(emp.pin && emp.pin.trim().length > 0);
              const isActive = empleadoActivo?.id === emp.id;

              return (
                <div
                  key={emp.id}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                    isActive
                      ? 'border-pink-300 dark:border-pink-900/80 bg-pink-50/50 dark:bg-pink-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorInfo.bg} flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm`}>
                      {emp.nombre.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {emp.nombre}
                        </p>
                        {isActive && (
                          <span className="text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-sm bg-pink-600 text-white">
                            Tú
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          {ROLE_ICONS[emp.rol]}
                          <span>{emp.rol}</span>
                        </span>
                        <span>·</span>
                        {hasPin ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <Lock className="w-3 h-3" />
                            <span>PIN activado</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Unlock className="w-3 h-3" />
                            <span>Sin PIN (Directo)</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(emp)}
                      className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Editar empleado"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp.id, emp.nombre)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="Eliminar empleado"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs text-slate-500">
          <p>
            Rol activo: <strong className="text-slate-700 dark:text-slate-300">{empleadoActivo?.nombre} ({empleadoActivo?.rol})</strong>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
