import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ROLE_PERMISSIONS } from '../../types';
import { getExpiryStatus } from '../../utils/perishableUtils';
import { compressImageFile } from '../../utils/imageUtils';
import {
  UtensilsCrossed,
  Package,
  Receipt,
  Settings,
  Sun,
  Moon,
  RefreshCw,
  Sparkles,
  CreditCard,
  BellRing,
  Apple,
  Users,
  Camera,
  Trash2,
  Upload,
  Lock,
  X
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'tables' | 'inventory' | 'perishables' | 'sales';
  setActiveTab: (tab: 'tables' | 'inventory' | 'perishables' | 'sales') => void;
  onOpenSubscription: () => void;
  onOpenSettings: () => void;
  onOpenEmployees?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSubscription,
  onOpenSettings,
  onOpenEmployees,
}) => {
  const {
    user,
    isGerente,
    empleadoActivo,
    bloquearPantalla,
    updateUserAvatar,
    removeUserAvatar
  } = useAuth();
  const { config, theme, toggleTheme, cloudStatus, syncNow, tables, perishables, dismissWaiterCall, setSelectedTableId } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await compressImageFile(file, 300, 300, 0.85);
      await updateUserAvatar(dataUrl);
    } catch (err) {
      console.error('Error procesando foto de perfil:', err);
      alert('No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsUploadingAvatar(false);
      if (e.target) e.target.value = '';
    }
  };

  const callingTables = tables.filter(t => t.waiterCall !== null && t.waiterCall !== undefined);

  const perishableAlarmCount = (perishables || []).filter(item => {
    const status = getExpiryStatus(item.expiryDate, item.alarmDaysBeforeExpiry);
    return status === 'expired' || status === 'expires_today' || status === 'expiring_soon' || item.quantity <= item.minStock;
  }).length;

  const currentRoleConfig = user?.role ? ROLE_PERMISSIONS[user.role] : null;

  return (
    <>
      {/* HEADER PRINCIPAL (Top Header Bar) */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors w-full shadow-xs">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 w-full divide-y divide-slate-100 dark:divide-slate-800/80">
          
          {/* FILA SUPERIOR: Logo, Actualizar, Subir a PRO, Tuerca, Campana, Modo Noche, Usuario */}
          <div className="flex items-center justify-between h-14 sm:h-16 py-1 sm:py-2 gap-1.5 sm:gap-2 md:gap-3 w-full">
            
            {/* 1. Logo del local (Optimizado para móvil y desktop) */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-max">
              <button
                type="button"
                onClick={isGerente ? onOpenSettings : undefined}
                className={`flex items-center text-left transition-transform active:scale-95 group shrink-0 ${
                  isGerente ? 'cursor-pointer hover:opacity-95' : 'cursor-default'
                }`}
                title={isGerente ? 'Haga clic para cambiar el logo o configuración del local' : config.businessName}
              >
                <ChinmiLogo variant="horizontal" size="sm" showSubtitle={false} logoUrl={config.logoUrl} />
              </button>
              <span className="hidden 2xl:inline-block text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shrink-0">
                {config.businessName}
              </span>
            </div>

            {/* 3. Contenedor de Botones y Acciones Superiores */}
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 overflow-visible whitespace-nowrap w-full justify-end flex-1 min-w-0 py-1">
              
              {/* 1. Actualizar (Cloud Sync) */}
              <button
                id="cloud-sync-status-btn"
                onClick={syncNow}
                title={cloudStatus === 'syncing' ? 'Sincronizando con la nube...' : 'Actualizar y sincronizar datos'}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-xs opacity-75 ${
                    cloudStatus === 'syncing' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <span className={`relative inline-flex rounded-xs h-2 w-2 ${
                    cloudStatus === 'syncing' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                </span>
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${cloudStatus === 'syncing' ? 'animate-spin text-rose-900 dark:text-rose-400' : 'text-slate-500'}`} />
                <span className="hidden md:inline text-[11px] font-bold">
                  {cloudStatus === 'syncing' ? 'Actualizando...' : 'Actualizar'}
                </span>
              </button>

              {/* 2. Subir a PRO */}
              {isGerente && (
                user?.plan === 'pro' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-rose-900 text-white shadow-xs shrink-0">
                    <Sparkles className="w-3 h-3 fill-white" />
                    <span className="hidden md:inline">PRO ⭐</span>
                    <span className="md:hidden">PRO</span>
                  </span>
                ) : (
                  <button
                    id="btn-upgrade-pro-nav"
                    onClick={onOpenSubscription}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white border border-rose-950 transition cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3 text-rose-200" />
                    <span className="hidden md:inline">Subir a PRO</span>
                    <span className="md:hidden">PRO</span>
                  </button>
                )
              )}

              {/* 3. La Tuerca (Configuración con icono w-5 h-5 adecuado para móviles) */}
              {isGerente && (
                <button
                  id="btn-open-settings"
                  onClick={onOpenSettings}
                  title="Configuración de negocio y equipo (Tuerca)"
                  className="p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}

              {/* 4. La Campana (Notificaciones con icono w-5 h-5) */}
              <div className="relative shrink-0">
                <button
                  id="btn-notifications-bell"
                  onClick={() => setShowNotifications(!showNotifications)}
                  title={
                    callingTables.length > 0
                      ? `${callingTables.length} llamadas pendientes`
                      : 'Notificaciones de comensales (Campana)'
                  }
                  className={`relative p-1.5 sm:p-2 rounded-xl border transition cursor-pointer ${
                    callingTables.length > 0
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-400 ring-2 ring-amber-400'
                      : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <BellRing className={`w-5 h-5 ${callingTables.length > 0 ? 'animate-bounce text-amber-600 dark:text-amber-400' : ''}`} />
                  {callingTables.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 sm:min-w-5 h-4 sm:h-5 px-1 bg-red-600 text-white font-black text-[9px] sm:text-[10px] rounded-full shadow-md animate-pulse">
                      {callingTables.length}
                    </span>
                  )}
                </button>

                {/* Popup de Notificaciones */}
                {showNotifications && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/10"
                      onClick={() => setShowNotifications(false)}
                    />
                    <div
                      className="fixed top-14 sm:top-16 right-2 sm:right-28 w-72 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3.5 px-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 px-1">
                        <div className="flex items-center gap-2">
                          <BellRing className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            Llamadas de Clientes
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-slate-800 text-rose-900 dark:text-rose-300 border border-stone-200 dark:border-slate-700">
                          {callingTables.length} activas
                        </span>
                      </div>

                      {callingTables.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 dark:text-slate-500">
                          <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="font-semibold text-xs text-slate-600 dark:text-slate-400">Sin llamadas pendientes</p>
                          <p className="text-[11px] mt-0.5">Cuando un comensal llame al mesero o pida la cuenta desde el QR, aparecerá aquí.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {callingTables.map((tbl) => {
                            const call = tbl.waiterCall!;
                            const isBill = call.type === 'bill';

                            return (
                              <div
                                key={tbl.id}
                                className={`p-2.5 rounded-md border flex flex-col gap-1.5 ${
                                  isBill
                                    ? 'bg-stone-50 dark:bg-slate-800/80 border-stone-200 dark:border-slate-700'
                                    : 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                                      Mesa {tbl.number} ({tbl.zone})
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                      isBill
                                        ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200'
                                        : 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                                    }`}>
                                      {isBill ? '💳 Pide Cuenta' : '🛎️ Llama Mesero'}
                                    </span>
                                  </div>
                                </div>

                                {call.message && (
                                  <p className="text-[11px] text-slate-700 dark:text-slate-300 italic">
                                    "{call.message}"
                                  </p>
                                )}

                                <div className="flex items-center justify-end gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => dismissWaiterCall(tbl.id)}
                                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                                  >
                                    Marcar Atendido
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTableId(tbl.id);
                                      setActiveTab('tables');
                                      setShowNotifications(false);
                                    }}
                                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold text-white transition cursor-pointer ${
                                      isBill ? 'bg-rose-900 hover:bg-rose-800' : 'bg-amber-600 hover:bg-amber-700'
                                    }`}
                                  >
                                    Ir a Mesa
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 5. El Modo Noche (Theme Toggle con icono w-5 h-5) */}
              <button
                id="btn-theme-toggle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo noche (oscuro)'}
                className="p-1.5 sm:p-2 rounded-md text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </button>

              {/* Botón Gestión de Empleados (Visible solo si Admin / Gerente en pantallas desktop) */}
              {isGerente && onOpenEmployees && (
                <button
                  type="button"
                  id="btn-open-employees"
                  onClick={onOpenEmployees}
                  title="Configuración de Empleados y Roles"
                  className="hidden lg:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition cursor-pointer shrink-0 shadow-xs"
                >
                  <Users className="w-4 h-4 text-rose-900 dark:text-rose-400 shrink-0" />
                  <span>Empleados</span>
                </button>
              )}

              {/* 6. Avatar Interactivo con Carga de Imagen Personalizada y Menú de Perfil */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  id="btn-user-avatar-action"
                  onClick={() => setAvatarMenuOpen(prev => !prev)}
                  title={`Opciones de cuenta personal (${user?.name || 'Usuario'})`}
                  className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-stone-100 dark:hover:bg-stone-800/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all active:scale-95 shrink-0 shadow-xs group"
                >
                  <div className="relative shrink-0 group/avatar">
                    {user?.avatar && user.avatar.trim() !== '' && !user.avatar.includes('api.dicebear.com') ? (
                      <img
                        src={user.avatar}
                        alt={user?.name || 'Usuario'}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-cover border border-slate-300 dark:border-slate-700 group-hover:border-rose-900 transition-colors shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-rose-950 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs shrink-0 select-none">
                        {(empleadoActivo?.nombre || user?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                  </div>

                  <div className="hidden lg:block text-left text-xs pr-1">
                    <p className="font-semibold text-slate-900 dark:text-white leading-tight group-hover:text-rose-900 dark:group-hover:text-rose-300 transition-colors">
                      {empleadoActivo ? empleadoActivo.nombre : user?.name}
                    </p>
                    <p className="text-[10px] text-rose-900 dark:text-rose-400 font-bold capitalize">
                      {empleadoActivo ? `${empleadoActivo.rol} (Activo)` : (currentRoleConfig?.label || user?.role)}
                    </p>
                  </div>
                </button>

                {/* Backdrop para cerrar al hacer clic afuera */}
                {avatarMenuOpen && (
                  <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs"
                    onClick={() => setAvatarMenuOpen(false)}
                  />
                )}

                {/* Popover desplegable flotante garantizado visible */}
                {avatarMenuOpen && (
                  <div
                    className="fixed top-14 sm:top-16 right-2 sm:right-6 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        {user?.avatar && user.avatar.trim() !== '' && !user.avatar.includes('api.dicebear.com') ? (
                          <img
                            src={user.avatar}
                            alt={user?.name || 'Usuario'}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-rose-950 text-white flex items-center justify-center font-extrabold text-lg shadow-xs select-none shrink-0">
                            {(user?.name || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 dark:text-white truncate text-sm">
                            {user?.name || 'Usuario'}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {user?.email}
                          </p>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-stone-100 dark:bg-slate-800 text-rose-950 dark:text-rose-300 font-bold text-[10px] border border-stone-200 dark:border-slate-700">
                            {empleadoActivo ? `${empleadoActivo.nombre} · ${empleadoActivo.rol}` : (currentRoleConfig?.label || user?.role)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAvatarMenuOpen(false)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Cerrar ventana"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      {/* Botón Principal: Bloquear pantalla / Cambiar de empleado (acción original del botón) */}
                      <button
                        type="button"
                        id="btn-menu-bloquear-pantalla"
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          bloquearPantalla();
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-rose-300" />
                          <span>Cambiar de perfil / Bloquear</span>
                        </div>
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md font-semibold">🔒 POS</span>
                      </button>

                      {/* Botón: Subir o cambiar foto de perfil */}
                      <button
                        type="button"
                        id="btn-menu-upload-photo"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                          <span>{isUploadingAvatar ? 'Guardando foto...' : 'Subir o cambiar foto'}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">JPG/PNG</span>
                      </button>

                      {/* Botón: Quitar foto si existe */}
                      {user?.avatar && user.avatar.trim() !== '' && !user.avatar.includes('api.dicebear.com') && (
                        <button
                          type="button"
                          id="btn-menu-remove-photo"
                          onClick={async () => {
                            await removeUserAvatar();
                            setAvatarMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Quitar foto (usar inicial)</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* File Input oculto para cargar la imagen personal */}
                <input
                  type="file"
                  ref={avatarInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileSelect}
                />
              </div>

            </div>
          </div>

          {/* FILA INFERIOR: Control de Mesas, Carta, Despensa e Historial (Visible en MÓVIL, TABLET y DESKTOP) */}
          <div className="py-1.5 sm:py-2 flex items-center justify-center w-full">
            {isGerente ? (
              <nav className="grid grid-cols-4 w-full md:w-auto md:flex md:items-center gap-1 md:gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-md border border-zinc-200 dark:border-zinc-800">
                
                {/* 1. Control de Mesas */}
                <button
                  id="nav-tab-tables"
                  onClick={() => setActiveTab('tables')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 px-2 md:px-5 py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold transition-all cursor-pointer w-full md:w-auto ${
                    activeTab === 'tables'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden md:inline">Control de Mesas</span>
                  <span className="md:hidden truncate">Mesas</span>
                </button>

                {/* 2. Carta / Menú */}
                <button
                  id="nav-tab-inventory"
                  onClick={() => setActiveTab('inventory')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 px-2 md:px-5 py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold transition-all cursor-pointer w-full md:w-auto ${
                    activeTab === 'inventory'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden md:inline">Carta & Menú</span>
                  <span className="md:hidden truncate">Carta</span>
                </button>

                {/* 3. Despensa */}
                <button
                  id="nav-tab-perishables"
                  onClick={() => setActiveTab('perishables')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 px-2 md:px-5 py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold transition-all cursor-pointer w-full md:w-auto relative ${
                    activeTab === 'perishables'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Apple className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    {perishableAlarmCount > 0 && (
                      <span className="md:hidden absolute -top-1.5 -right-2 px-1 py-0.2 rounded-md text-[8px] font-bold bg-amber-600 text-white">
                        {perishableAlarmCount}
                      </span>
                    )}
                  </div>
                  <span className="hidden md:inline">Despensa & Insumos</span>
                  <span className="md:hidden truncate">Despensa</span>
                  {perishableAlarmCount > 0 && (
                    <span className="hidden md:inline px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-amber-600 text-white">
                      {perishableAlarmCount}
                    </span>
                  )}
                </button>

                {/* 4. Historial */}
                <button
                  id="nav-tab-sales"
                  onClick={() => setActiveTab('sales')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 px-2 md:px-5 py-2 rounded-md text-[10px] sm:text-xs md:text-sm font-bold transition-all cursor-pointer w-full md:w-auto ${
                    activeTab === 'sales'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden md:inline">Historial Ventas</span>
                  <span className="md:hidden truncate">Ventas</span>
                </button>
              </nav>
            ) : (
              <div className="flex items-center justify-between w-full md:w-auto md:justify-start gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                  <UtensilsCrossed className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    Control de Mesas
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold bg-stone-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {user?.role === 'cajero' && <CreditCard className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />}
                  {user?.role === 'camarero' && <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600" />}
                  {user?.role === 'barman' && <Sparkles className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />}
                  <span>{currentRoleConfig?.label}</span>
                </span>
              </div>
            )}
          </div>

        </div>
      </header>
    </>
  );
};
