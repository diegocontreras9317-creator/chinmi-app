import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ROLE_PERMISSIONS } from '../../types';
import { getExpiryStatus } from '../../utils/perishableUtils';
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
  Users
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
    bloquearPantalla
  } = useAuth();
  const { config, theme, toggleTheme, cloudStatus, syncNow, tables, perishables, dismissWaiterCall, setSelectedTableId } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);

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
              <span className="hidden 2xl:inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-pink-50 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 border border-pink-200 dark:border-pink-900/60 shrink-0">
                {config.businessName}
              </span>
            </div>

            {/* 3. Contenedor con Scroll Horizontal (Fallback) y espaciados responsivos (gap-1.5 md:gap-4) */}
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 overflow-x-auto whitespace-nowrap scrollbar-hide w-full justify-end flex-1 min-w-0 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              
              {/* Botón de Instalación PWA (Icono en móviles, texto en md+) */}
              <PWAInstallButton className="inline-flex" />

              {/* 1. Actualizar (Cloud Sync) */}
              <button
                id="cloud-sync-status-btn"
                onClick={syncNow}
                title={cloudStatus === 'syncing' ? 'Sincronizando con la nube...' : 'Actualizar y sincronizar datos'}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    cloudStatus === 'syncing' ? 'bg-pink-400' : 'bg-emerald-400'
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    cloudStatus === 'syncing' ? 'bg-[#e64980]' : 'bg-emerald-500'
                  }`} />
                </span>
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${cloudStatus === 'syncing' ? 'animate-spin text-[#e64980]' : 'text-slate-500'}`} />
                <span className="hidden md:inline text-[11px] font-bold">
                  {cloudStatus === 'syncing' ? 'Actualizando...' : 'Actualizar'}
                </span>
              </button>

              {/* 2. Subir a PRO */}
              {isGerente && (
                user?.plan === 'pro' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-gradient-to-r from-[#681841] to-[#e64980] text-white shadow-xs shrink-0">
                    <Sparkles className="w-3 h-3 fill-white" />
                    <span className="hidden md:inline">PRO ⭐</span>
                    <span className="md:hidden">PRO</span>
                  </span>
                ) : (
                  <button
                    id="btn-upgrade-pro-nav"
                    onClick={onOpenSubscription}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-pink-50 dark:bg-pink-950/40 text-[#681841] dark:text-pink-300 border border-pink-200 dark:border-pink-900/80 hover:bg-pink-100 dark:hover:bg-pink-950 transition cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3 text-[#e64980]" />
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
                  <div
                    className="absolute right-0 mt-2 w-72 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3 px-3 z-50 animate-in fade-in slide-in-from-top-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 px-1">
                      <div className="flex items-center gap-2">
                        <BellRing className="w-4 h-4 text-[#e64980]" />
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          Llamadas de Clientes
                        </span>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-[#681841] dark:text-pink-300">
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
                              className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                                isBill
                                  ? 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900'
                                  : 'bg-amber-50/60 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-xs text-slate-900 dark:text-white">
                                    Mesa {tbl.number} ({tbl.zone})
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                    isBill
                                      ? 'bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
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
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
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
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white transition cursor-pointer ${
                                    isBill ? 'bg-purple-600 hover:bg-purple-700' : 'bg-amber-600 hover:bg-amber-700'
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
                )}
              </div>

              {/* 5. El Modo Noche (Theme Toggle con icono w-5 h-5) */}
              <button
                id="btn-theme-toggle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo noche (oscuro)'}
                className="p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
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
                  className="hidden lg:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-800 dark:text-purple-300 text-xs font-black transition cursor-pointer shrink-0 shadow-xs"
                >
                  <Users className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Empleados</span>
                </button>
              )}

              {/* 6. Avatar Interactivo (Botón para Bloquear pantalla / Cambiar de usuario) */}
              <button
                type="button"
                id="btn-user-avatar-action"
                onClick={bloquearPantalla}
                title={`Bloquear pantalla / Cambiar de usuario (${empleadoActivo ? empleadoActivo.nombre : user?.name || 'Usuario'})`}
                className="flex items-center gap-1.5 sm:gap-2 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-pink-50/60 dark:hover:bg-pink-950/40 hover:border-pink-300 dark:hover:border-pink-800/80 cursor-pointer hover:opacity-80 transition-all hover:ring-2 hover:ring-[#e64980] active:scale-95 shrink-0 shadow-xs group"
              >
                <div className="relative shrink-0">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user?.name || 'Usuario'}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover border border-slate-300 dark:border-slate-700 group-hover:border-[#e64980] transition-colors shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-[#681841] to-[#e64980] text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-xs shrink-0 select-none">
                      {(empleadoActivo?.nombre || user?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                </div>

                <div className="hidden lg:block text-left text-xs pr-1">
                  <p className="font-semibold text-slate-900 dark:text-white leading-tight group-hover:text-[#681841] dark:group-hover:text-pink-300 transition-colors">
                    {empleadoActivo ? empleadoActivo.nombre : user?.name}
                  </p>
                  <p className="text-[10px] text-[#681841] dark:text-pink-400 font-bold capitalize">
                    {empleadoActivo ? `${empleadoActivo.rol} (Activo)` : (currentRoleConfig?.label || user?.role)}
                  </p>
                </div>
              </button>

            </div>
          </div>

          {/* FILA INFERIOR: Control de Mesas, Carta, Despensa e Historial (Visible en MÓVIL, TABLET y DESKTOP) */}
          <div className="py-1.5 sm:py-2 flex items-center justify-center w-full">
            {isGerente ? (
              <nav className="w-full sm:w-auto grid grid-cols-4 sm:flex sm:items-center gap-1 sm:gap-2 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                
                {/* 1. Control de Mesas */}
                <button
                  id="nav-tab-tables"
                  onClick={() => setActiveTab('tables')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-sm font-extrabold transition-all cursor-pointer ${
                    activeTab === 'tables'
                      ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-md border-b-2 border-[#e64980]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <UtensilsCrossed className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'tables' ? 'text-[#e64980]' : ''}`} />
                  <span className="hidden sm:inline">Control de Mesas</span>
                  <span className="sm:hidden truncate">Mesas</span>
                </button>

                {/* 2. Carta / Menú */}
                <button
                  id="nav-tab-inventory"
                  onClick={() => setActiveTab('inventory')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-sm font-extrabold transition-all cursor-pointer ${
                    activeTab === 'inventory'
                      ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-md border-b-2 border-[#e64980]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Package className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'inventory' ? 'text-[#e64980]' : ''}`} />
                  <span className="hidden sm:inline">Carta & Menú</span>
                  <span className="sm:hidden truncate">Carta</span>
                </button>

                {/* 3. Despensa */}
                <button
                  id="nav-tab-perishables"
                  onClick={() => setActiveTab('perishables')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-sm font-extrabold transition-all cursor-pointer relative ${
                    activeTab === 'perishables'
                      ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-md border-b-2 border-[#e64980]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Apple className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'perishables' ? 'text-[#e64980]' : ''}`} />
                    {perishableAlarmCount > 0 && (
                      <span className="sm:hidden absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full text-[8px] font-black bg-rose-500 text-white animate-pulse">
                        {perishableAlarmCount}
                      </span>
                    )}
                  </div>
                  <span className="hidden sm:inline">Despensa & Insumos</span>
                  <span className="sm:hidden truncate">Despensa</span>
                  {perishableAlarmCount > 0 && (
                    <span className="hidden sm:inline px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                      {perishableAlarmCount}
                    </span>
                  )}
                </button>

                {/* 4. Historial */}
                <button
                  id="nav-tab-sales"
                  onClick={() => setActiveTab('sales')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1.5 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-sm font-extrabold transition-all cursor-pointer ${
                    activeTab === 'sales'
                      ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-md border-b-2 border-[#e64980]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Receipt className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'sales' ? 'text-[#e64980]' : ''}`} />
                  <span className="hidden sm:inline">Historial de Ventas</span>
                  <span className="sm:hidden truncate">Historial</span>
                </button>
              </nav>
            ) : (
              <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                  <UtensilsCrossed className="w-4 h-4 text-[#e64980]" />
                  <span className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200">
                    Control de Mesas
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold bg-pink-100/80 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 border border-pink-200 dark:border-pink-900/60">
                  {user?.role === 'cajero' && <CreditCard className="w-3.5 h-3.5 text-[#e64980]" />}
                  {user?.role === 'camarero' && <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600" />}
                  {user?.role === 'barman' && <Sparkles className="w-3.5 h-3.5 text-[#e64980]" />}
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
