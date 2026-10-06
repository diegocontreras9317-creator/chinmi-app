import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole, ROLE_PERMISSIONS } from '../../types';
import {
  X,
  Settings,
  Store,
  Coins,
  Receipt,
  Cloud,
  RotateCcw,
  Check,
  Smartphone,
  Users,
  ShieldCheck,
  UserPlus,
  Trash2,
  CreditCard,
  UtensilsCrossed,
  Sparkles,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldAlert,
  AlertCircle,
  QrCode,
  Sliders,
  BellRing,
  Upload,
  Image as ImageIcon
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { config, updateConfig, resetToDemoData } = useApp();
  const {
    user,
    teamMembers,
    updateMemberRole,
    addTeamMember,
    removeTeamMember,
    managerPin,
    isPinProtectionEnabled,
    updateManagerPin,
    togglePinProtection,
    resetManagerPinToDefault,
    verifyManagerPin
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'general' | 'qr' | 'team' | 'security'>('general');

  // General Settings State
  const [appName, setAppName] = useState(config.appName);
  const [businessName, setBusinessName] = useState(config.businessName);
  const [businessAddress, setBusinessAddress] = useState(config.businessAddress);
  const [businessTaxId, setBusinessTaxId] = useState(config.businessTaxId);
  const [businessPhone, setBusinessPhone] = useState(config.businessPhone);
  const [currency, setCurrency] = useState(config.currency);
  const [defaultTaxRate, setDefaultTaxRate] = useState(String(config.defaultTaxRate));
  const [logoUrl, setLogoUrl] = useState(config.logoUrl || '/src/assets/images/restaurant_logo_1790194934242.jpg');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // QR Code & Digital Menu Settings State
  const [allowOrdering, setAllowOrdering] = useState(config.qrSettings?.allowOrdering ?? true);
  const [allowCallWaiter, setAllowCallWaiter] = useState(config.qrSettings?.allowCallWaiter ?? true);
  const [allowRequestBill, setAllowRequestBill] = useState(config.qrSettings?.allowRequestBill ?? true);
  const [menuOnlyMode, setMenuOnlyMode] = useState(config.qrSettings?.menuOnlyMode ?? false);

  // New Team Member State
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('camarero');
  const [teamActionSuccess, setTeamActionSuccess] = useState<string | null>(null);

  // Manager PIN / Security State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [testPinInput, setTestPinInput] = useState('');
  const [testPinResult, setTestPinResult] = useState<'correct' | 'incorrect' | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig({
      appName: appName.trim() || 'AppGenerica',
      businessName: businessName.trim() || 'Mi Negocio',
      businessAddress: businessAddress.trim(),
      businessTaxId: businessTaxId.trim(),
      businessPhone: businessPhone.trim(),
      currency: currency.trim() || '€',
      defaultTaxRate: Number(defaultTaxRate) || 10,
      logoUrl: logoUrl.trim(),
      qrSettings: {
        allowOrdering: menuOnlyMode ? false : allowOrdering,
        allowCallWaiter,
        allowRequestBill,
        menuOnlyMode
      }
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    if (confirm('¿Restablecer todas las mesas, productos y ventas a los datos iniciales de demostración?')) {
      resetToDemoData();
      onClose();
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    addTeamMember(newMemberName.trim(), newMemberEmail.trim(), newMemberRole);
    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberRole('camarero');
    setTeamActionSuccess('Nuevo colaborador añadido al equipo correctamente.');
    setTimeout(() => setTeamActionSuccess(null), 3000);
  };

  const handleRoleChange = (memberId: string, role: UserRole) => {
    updateMemberRole(memberId, role);
    setTeamActionSuccess('Rol y permisos actualizados correctamente.');
    setTimeout(() => setTeamActionSuccess(null), 2500);
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (memberId === user?.id) {
      alert('No puedes eliminar tu propio usuario activo.');
      return;
    }
    if (confirm(`¿Eliminar a ${memberName} del equipo? Ya no tendrá acceso al sistema.`)) {
      removeTeamMember(memberId);
      setTeamActionSuccess(`Se eliminó a ${memberName} del equipo.`);
      setTimeout(() => setTeamActionSuccess(null), 2500);
    }
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(null);

    const cleanPin = newPin.trim();
    if (!cleanPin) {
      setSecurityError('La nueva clave de acceso no puede estar vacía.');
      return;
    }

    if (cleanPin.length < 4) {
      setSecurityError('La clave debe tener al menos 4 caracteres o dígitos (ej. 1234, 5555, admin).');
      return;
    }

    if (cleanPin !== confirmPin.trim()) {
      setSecurityError('Las dos claves introducidas no coinciden. Por favor verifica.');
      return;
    }

    updateManagerPin(cleanPin);
    setNewPin('');
    setConfirmPin('');
    setSecuritySuccess('¡Clave de acceso de Gerente actualizada con éxito!');
    setTimeout(() => setSecuritySuccess(null), 3500);
  };

  const handleResetPin = () => {
    if (confirm('¿Restablecer la clave de acceso de Gerente a la de fábrica (1234)?')) {
      resetManagerPinToDefault();
      setSecuritySuccess('Clave restablecida a la de fábrica: 1234');
      setTimeout(() => setSecuritySuccess(null), 3000);
    }
  };

  const handleTestPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPinInput.trim()) return;
    if (verifyManagerPin(testPinInput.trim())) {
      setTestPinResult('correct');
    } else {
      setTestPinResult('incorrect');
    }
    setTimeout(() => {
      setTestPinResult(null);
      setTestPinInput('');
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-rose-950 dark:text-rose-300 border border-stone-200 dark:border-stone-700">
              <Settings className="w-4 h-4 text-stone-700 dark:text-stone-300" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                Administración y Configuración
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Personaliza tu negocio, datos de tickets y gestiona los roles del equipo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 pt-3 pb-0 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'general'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Datos del Negocio & Tickets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'qr'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Opciones Códigos QR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'team'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Personal & Permisos (Roles)</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-[10px] font-extrabold border border-stone-200 dark:border-stone-700">
              {teamMembers.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'security'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Clave de Acceso Gerente</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold border ${
              isPinProtectionEnabled
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
            }`}>
              {isPinProtectionEnabled ? 'Protegido' : 'Libre'}
            </span>
          </button>
        </div>

        {/* Body Content */}
        {activeTab === 'general' ? (
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
            
            {savedSuccess && (
              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-900">
                <Check className="w-4 h-4" />
                <span>Configuración actualizada correctamente.</span>
              </div>
            )}

            {/* Provisional App Name */}
            <div className="p-4 rounded-md bg-stone-50/50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Nombre de la Aplicación (Variable de Marca)
              </label>
              <input
                type="text"
                required
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="AppGenerica"
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-900/50 focus:border-rose-900"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Personaliza el nombre de software que verán tus empleados y clientes.
              </p>
            </div>

            {/* Logo and Brand Image */}
            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Logo Oficial del Bar / Restaurante
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Se muestra en la cabecera superior, en las cartas QR móviles de los clientes y en los tickets.
                  </p>
                </div>
                {logoUrl !== '/src/assets/images/regenerated_image_1790196085462.png' && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('/src/assets/images/regenerated_image_1790196085462.png')}
                    className="text-[10px] text-rose-900 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                  >
                    Restablecer original
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-md overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs bg-white dark:bg-slate-900 shrink-0 flex items-center justify-center p-0.5">
                  <img
                    src={logoUrl || '/src/assets/images/regenerated_image_1790196085462.png'}
                    alt="Logo actual"
                    className="w-full h-full object-cover rounded-md"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 hover:bg-stone-200 dark:hover:bg-stone-800 font-bold text-xs cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                      <span>Subir archivo de logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              if (reader.result) {
                                setLogoUrl(reader.result as string);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    <span className="text-[10px] text-slate-400">PNG, JPG, SVG o WebP</span>
                  </div>

                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="O introduce una URL de imagen (https://...)"
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                  />
                </div>
              </div>
            </div>

            {/* Business Name & Tax Id */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Nombre Comercial del Bar / Restaurante
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej. Chinmi Terraza Bar"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  NIT / Identificación Fiscal
                </label>
                <input
                  type="text"
                  value={businessTaxId}
                  onChange={(e) => setBusinessTaxId(e.target.value)}
                  placeholder="901.234.567-8"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Dirección para Tickets
                </label>
                <input
                  type="text"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  placeholder="Cra. 43A # 1-50, El Poblado"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
              </div>
            </div>

            {/* Currency & Tax Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Símbolo de Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                >
                  <option value="COP$">Peso Colombiano (COP$)</option>
                  <option value="$">Dólar ($)</option>
                  <option value="€">Euro (€)</option>
                  <option value="MXN$">Peso Mexicano (MXN$)</option>
                  <option value="S/">Sol Peruano (S/)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Impoconsumo / IVA por Defecto (%)
                </label>
                <select
                  value={defaultTaxRate}
                  onChange={(e) => setDefaultTaxRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                >
                  <option value="8">8% (Impoconsumo Restaurantes/Bares Colombia)</option>
                  <option value="19">19% (IVA General Colombia)</option>
                  <option value="10">10% (Hostelería España)</option>
                  <option value="16">16% (IVA México)</option>
                  <option value="0">0% (Exento / Sin impuesto)</option>
                </select>
              </div>
            </div>

            {/* Cloud Sync Information Box */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <Cloud className="w-4 h-4 text-emerald-500" />
                <span>Sincronización Cloud y Multi-Dispositivo</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                La aplicación sincroniza en tiempo real cualquier cambio en mesas, comandas y ventas entre computadores, tablets y celulares conectados a la misma cuenta.
              </p>
            </div>

            {/* Reset Demo Data Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 text-slate-500 hover:text-rose-600 text-xs font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restablecer mesas y productos a valores demo iniciales</span>
              </button>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Guardar Configuración
              </button>
            </div>

          </form>
        ) : activeTab === 'qr' ? (
          /* === TAB: OPCIONES CÓDIGOS QR & CARTA DIGITAL === */
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
            {/* Header info */}
            <div className="p-4 rounded-md bg-stone-50 dark:bg-slate-850 border border-stone-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <QrCode className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                <span>Control de la Carta QR para los Clientes</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs">
                Configura qué acciones pueden realizar los comensales cuando escanean el código QR en su mesa desde su teléfono celular:
              </p>
            </div>

            {/* Presets rápidos */}
            <div>
              <label className="font-extrabold text-xs text-slate-700 dark:text-slate-300 block mb-2">
                Modos Rápidos Preconfigurados:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOnlyMode(false);
                    setAllowOrdering(true);
                    setAllowCallWaiter(true);
                    setAllowRequestBill(true);
                  }}
                  className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col justify-between ${
                    !menuOnlyMode && allowOrdering && allowCallWaiter && allowRequestBill
                      ? 'border-rose-900 bg-rose-950/10 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <span className="font-black text-xs text-rose-950 dark:text-rose-300">
                    🚀 Pedidos + Mesero
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    El cliente pide directo a cocina, llama al mesero y pide la cuenta.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOnlyMode(true);
                    setAllowOrdering(false);
                    setAllowCallWaiter(true);
                    setAllowRequestBill(true);
                  }}
                  className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col justify-between ${
                    menuOnlyMode && allowCallWaiter && allowRequestBill
                      ? 'border-rose-900 bg-rose-950/10 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <span className="font-black text-xs text-rose-950 dark:text-rose-300">
                    📖 Solo Menú + Mesero
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Solo ve la carta de platos/precios, y llama al mesero para ordenar.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOnlyMode(true);
                    setAllowOrdering(false);
                    setAllowCallWaiter(false);
                    setAllowRequestBill(false);
                  }}
                  className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col justify-between ${
                    menuOnlyMode && !allowCallWaiter && !allowRequestBill
                      ? 'border-rose-900 bg-rose-950/10 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <span className="font-black text-xs text-rose-950 dark:text-rose-300">
                    🔒 Solo Ver Menú
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Catálogo 100% informativo sin interactividad ni botones en mesa.
                  </span>
                </button>
              </div>
            </div>

            {/* Configuración Detallada Interruptores */}
            <div className="space-y-3 pt-2">
              <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                Opciones Individuales
              </h4>

              {/* 1. Solo Menú */}
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Modo Solo Ver Menú (Informativo)</span>
                    {menuOnlyMode && (
                      <span className="px-2 py-0.2 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-[10px] font-black border border-stone-200 dark:border-stone-700">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Oculta los botones de añadir al carrito y envío de pedidos automáticos a cocina.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={menuOnlyMode}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setMenuOnlyMode(val);
                      if (val) setAllowOrdering(false);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-950"></div>
                </label>
              </div>

              {/* 2. Permitir hacer pedidos */}
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Hacer Pedidos Directo a Cocina</span>
                    {allowOrdering && !menuOnlyMode && (
                      <span className="px-2 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                        Habilitado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    El cliente arma su orden en el celular y la envía a la comanda de la mesa en tiempo real.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    disabled={menuOnlyMode}
                    checked={allowOrdering && !menuOnlyMode}
                    onChange={(e) => setAllowOrdering(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-950 peer-disabled:opacity-40"></div>
                </label>
              </div>

              {/* 3. Llamar al mesero */}
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-amber-500" />
                    <span>Botón "Llamar al Mesero"</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Permite al cliente pulsar para pedir asistencia o para que el mesero se acerque a tomar comanda a la mesa.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={allowCallWaiter}
                    onChange={(e) => setAllowCallWaiter(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-950"></div>
                </label>
              </div>

              {/* 4. Pedir cuenta */}
              <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                    <span>Botón "Pedir la Cuenta"</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Permite al cliente solicitar la adición con opción de indicar si pagará con tarjeta, efectivo o transferencia.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={allowRequestBill}
                    onChange={(e) => setAllowRequestBill(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-950"></div>
                </label>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSave}
                className="px-5 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Guardar Configuración QR
              </button>
            </div>
          </div>
        ) : activeTab === 'team' ? (
          /* === TAB 2: PERSONAL & ROLES (RBAC) === */
          <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
            
            {teamActionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-900 animate-in fade-in">
                <Check className="w-4 h-4" />
                <span>{teamActionSuccess}</span>
              </div>
            )}

            {/* Guía Clara de Control de Acceso según la solicitud */}
            <div className="p-4 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <ShieldCheck className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                <span>Esquema de Permisos y Roles de Personal</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-rose-950 dark:text-rose-300">
                    <span>👑</span>
                    <span>Gerente</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Control Total</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Mesas, comandas, precios, inventario, ventas y gestión de usuarios.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                    <span>💳</span>
                    <span>Cajero</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Solo Mesas y Cobro</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Vista de mesas, órdenes y facturación. Sin inventario ni reportes.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                    <span>👩‍🍳</span>
                    <span>Camarero</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Solo Mesas y Pedidos</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Apertura de mesas y toma de comandas. Sin inventario ni finanzas.
                  </p>
                </div>
              </div>
            </div>

            {/* Formulario para Agregar Nuevo Colaborador */}
            <form onSubmit={handleAddMember} className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                  Agregar nuevo miembro del personal
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Asigna su función</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nombre (ej. Mariana López)"
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />

                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="Email de acceso"
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />

                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                >
                  <option value="cajero">💳 Cajero (Mesas y Cobro)</option>
                  <option value="camarero">👩‍🍳 Camarero (Mesas y Pedidos)</option>
                  <option value="barman">🍸 Barman (Barra y Bebidas)</option>
                  <option value="gerente">👑 Gerente (Control Total)</option>
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Agregar al Equipo</span>
                </button>
              </div>
            </form>

            {/* Lista del Personal Actual */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Miembros del Equipo ({teamMembers.length})
              </h3>
              
              <div className="space-y-2">
                {teamMembers.map((member) => {
                  const roleConfig = ROLE_PERMISSIONS[member.role];
                  const isCurrentLogged = member.id === user?.id;

                  return (
                    <div
                      key={member.id}
                      className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={member.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                          alt={member.name}
                          className="w-9 h-9 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-xs">
                              {member.name}
                            </span>
                            {isCurrentLogged && (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                Tú
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {member.email}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                          className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                        >
                          <option value="gerente">👑 Gerente (Control Total)</option>
                          <option value="cajero">💳 Cajero (Mesas y Cobro)</option>
                          <option value="camarero">👩‍🍳 Camarero (Mesas y Pedidos)</option>
                          <option value="barman">🍸 Barman (Barra)</option>
                        </select>

                        {!isCurrentLogged && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id, member.name)}
                            title="Eliminar usuario del equipo"
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-md bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Listo
              </button>
            </div>

          </div>
        ) : (
          /* === TAB 3: CLAVE DE ACCESO GERENTE (SEGURIDAD) === */
          <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
            
            {securitySuccess && (
              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-900 animate-in fade-in">
                <Check className="w-4 h-4 shrink-0" />
                <span>{securitySuccess}</span>
              </div>
            )}

            {securityError && (
              <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2 border border-rose-200 dark:border-rose-900 animate-in fade-in">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{securityError}</span>
              </div>
            )}

            {/* Banner Informativo */}
            <div className="p-4 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <Lock className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                <span>Protección de Acceso y Control Administrativo</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Como <strong>Gerente</strong>, puedes definir una clave o PIN de acceso secreta. Al activar esta protección, nadie podrá cambiar al rol de Gerente ni acceder a la gestión de inventario, precios, ventas o ajustes sin introducir esta clave.
              </p>
            </div>

            {/* Tarjeta de Clave Actual */}
            <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs block">
                  Clave de Acceso Configurada
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Esta es la clave que desbloquea los permisos totales del sistema.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-sm tracking-widest text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span>{showCurrentPin ? managerPin : '••••'}</span>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPin(!showCurrentPin)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showCurrentPin ? 'Ocultar clave' : 'Mostrar clave'}
                  >
                    {showCurrentPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                  isPinProtectionEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                }`}>
                  {isPinProtectionEnabled ? 'Solicitud Activa' : 'Desactivada'}
                </span>
              </div>
            </div>

            {/* Formulario: Establecer / Cambiar Clave */}
            <form onSubmit={handleSavePin} className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                  Poner / Cambiar Clave de Acceso
                </span>
                <span className="text-[10px] text-slate-400">Mínimo 4 caracteres o dígitos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Nueva Clave / PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      required
                      value={newPin}
                      onChange={(e) => {
                        setSecurityError(null);
                        setNewPin(e.target.value);
                      }}
                      placeholder="Ej. 1234 o miClave2026"
                      className="w-full px-3 py-2 pr-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Confirmar Nueva Clave
                  </label>
                  <input
                    type={showNewPin ? 'text' : 'password'}
                    required
                    value={confirmPin}
                    onChange={(e) => {
                      setSecurityError(null);
                      setConfirmPin(e.target.value);
                    }}
                    placeholder="Repite la clave exactamente igual"
                    className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleResetPin}
                  className="text-slate-500 hover:text-rose-600 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restablecer a clave de fábrica (1234)</span>
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Clave de Acceso</span>
                </button>
              </div>
            </form>

            {/* Opciones de Seguridad y Exigencia de Clave */}
            <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="font-bold text-slate-900 dark:text-white text-xs block">
                Comportamiento de Seguridad
              </span>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPinProtectionEnabled}
                  onChange={(e) => {
                    togglePinProtection(e.target.checked);
                    setSecuritySuccess(
                      e.target.checked
                        ? 'Protección por clave de acceso ACTIVADA.'
                        : 'Protección por clave de acceso DESACTIVADA.'
                    );
                    setTimeout(() => setSecuritySuccess(null), 2500);
                  }}
                  className="w-4 h-4 mt-0.5 rounded-sm text-rose-900 focus:ring-rose-900 accent-rose-900 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                    Exigir clave de acceso para entrar o cambiar al rol de Gerente
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Recomendado. Si está marcado, el sistema solicitará la clave cada vez que un cajero o camarero intente cambiar al rol de Gerente o entrar a áreas administrativas.
                  </p>
                </div>
              </label>
            </div>

            {/* Probador Rápido de Clave */}
            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <span className="font-bold text-slate-900 dark:text-white text-xs block">
                Comprobador de Clave
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Escribe tu clave aquí para verificar que la recuerdas correctamente:
              </p>

              <form onSubmit={handleTestPin} className="flex items-center gap-2">
                <input
                  type="password"
                  value={testPinInput}
                  onChange={(e) => setTestPinInput(e.target.value)}
                  placeholder="Introduce la clave para probar..."
                  className="flex-1 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs transition cursor-pointer"
                >
                  Probar
                </button>
              </form>

              {testPinResult === 'correct' && (
                <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>¡Clave correcta! Acceso autorizado.</span>
                </div>
              )}

              {testPinResult === 'incorrect' && (
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Clave incorrecta. Verifica la clave guardada arriba.</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Listo
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
