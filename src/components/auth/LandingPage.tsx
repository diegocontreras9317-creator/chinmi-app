import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PAID_PLANS, BillingFrequency } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { GoogleAuthModal } from './GoogleAuthModal';
import {
  Lock,
  Mail,
  User,
  Store,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  Check,
  Smile,
  ShieldCheck,
  Smartphone,
  Zap,
  HelpCircle,
  PlayCircle,
  X,
  AlertCircle
} from 'lucide-react';
import { PlanComparisonTable } from '../pricing/PlanComparisonTable';

export const LandingPage: React.FC = () => {
  const {
    loginWithEmail,
    loginWithGoogle,
    register,
    loginAsDemoRole,
    isLoading,
    promptManagerPin,
    isPinProtectionEnabled
  } = useAuth();
  const { theme, toggleTheme, config, updateConfig } = useApp();

  // Active view tab: 'demo' | 'register' | 'login' | 'pricing'
  const [activeTab, setActiveTab] = useState<'demo' | 'register' | 'login' | 'pricing'>('demo');
  
  // Registration plan settings
  const [wantPro, setWantPro] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<BillingFrequency>('annual');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Form error & success states
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Google Modal
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalMode, setGoogleModalMode] = useState<'login' | 'register'>('register');

  const selectedPaidPlan = PAID_PLANS[selectedCycle];

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!name.trim()) {
      setFormError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Por favor ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 3) {
      setFormError('La contraseña debe tener al menos 3 caracteres.');
      return;
    }

    const res = await register(
      name.trim(),
      email.trim(),
      password,
      'gerente',
      businessName.trim() || 'Mi Negocio Gastro',
      wantPro ? 'pro' : 'free',
      wantPro ? selectedCycle : undefined
    );

    if (!res.success) {
      setFormError(res.error || 'Error al registrar la cuenta.');
    } else {
      if (businessName.trim()) {
        updateConfig({ businessName: businessName.trim() });
      }
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!email.trim()) {
      setFormError('Por favor ingresa tu correo.');
      return;
    }

    const res = await loginWithEmail(email.trim(), password);
    if (!res.success) {
      setFormError(res.error || 'Error al iniciar sesión.');
    }
  };

  const handleOpenGoogle = (mode: 'login' | 'register') => {
    setFormError(null);
    setGoogleModalMode(mode);
    setIsGoogleModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdf2f6] via-white to-slate-50 dark:from-[#191116] dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-[#e64980] selection:text-white">
      
      {/* 1. Header con Logo Oficial de Chinmi */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChinmiLogo variant="horizontal" size="md" showSubtitle={true} logoUrl={config?.logoUrl} />
          <span className="hidden sm:inline-flex text-[11px] font-bold px-2.5 py-1 rounded-full bg-pink-100/70 dark:bg-pink-950/60 text-[#681841] dark:text-pink-300 border border-pink-200/80 dark:border-pink-900/60">
            🇨🇴 Precios en COP$
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />

          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 shadow-xs transition cursor-pointer"
            aria-label="Cambiar tema claro u oscuro"
            title="Cambiar tema"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* 2. Hero Amigable y Despejado */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8 flex-1 flex flex-col items-center">
        
        {/* LOGO EN GRANDE EN LA PÁGINA PRINCIPAL */}
        <div className="mb-6 flex flex-col items-center justify-center animate-fade-in group">
          <div className="p-3 sm:p-4 rounded-3xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-pink-200/80 dark:border-pink-900/50 shadow-2xl shadow-pink-500/10 ring-4 ring-pink-100/50 dark:ring-pink-950/30 transition-all duration-300 group-hover:scale-105 group-hover:shadow-pink-500/20">
            <ChinmiLogo variant="stacked" size="xl" showSubtitle={true} logoUrl={config?.logoUrl} />
          </div>
        </div>

        <div className="text-center space-y-3 mb-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-pink-100 dark:bg-pink-950/60 border border-pink-300/60 dark:border-pink-800/60 text-[#681841] dark:text-pink-300 text-xs font-bold shadow-xs">
            <Smile className="w-4 h-4 text-[#e64980]" />
            <span>Fácil, rápido y sin complicaciones para tu equipo</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Control de mesas y comandas, <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#681841] via-[#d6336c] to-[#e64980]">sin enredos</span>.
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-normal max-w-xl mx-auto leading-relaxed">
            Organiza tu salón en tiempo real, toma pedidos desde el celular y cobra en segundos. Diseñado para bares, gastrobares y terrazas en Colombia.
          </p>
        </div>

        {/* 3. Selector de Pestañas Amigable (Menú Principal Claro) */}
        <div className="w-full max-w-xl mb-6">
          <div className="flex p-1.5 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 backdrop-blur border border-slate-300/50 dark:border-slate-700/60 shadow-xs">
            <button
              type="button"
              id="tab-btn-demo"
              onClick={() => setActiveTab('demo')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'demo'
                  ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <PlayCircle className="w-4 h-4 text-[#e64980]" />
              <span>Probar Demo</span>
            </button>

            <button
              type="button"
              id="tab-btn-register"
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#e64980]" />
              <span>Crear Cuenta</span>
            </button>

            <button
              type="button"
              id="tab-btn-login"
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Lock className="w-4 h-4 text-[#e64980]" />
              <span>Iniciar Sesión</span>
            </button>

            <button
              type="button"
              id="tab-btn-pricing"
              onClick={() => setActiveTab('pricing')}
              className={`hidden sm:flex py-2.5 px-3 rounded-xl text-xs font-bold transition-all items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'pricing'
                  ? 'bg-white dark:bg-slate-900 text-[#681841] dark:text-pink-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Precios</span>
            </button>
          </div>
        </div>

        {/* 4. Contenido de las Pestañas (Limpio y Espacioso) */}
        <div className="w-full max-w-xl">

          {/* === PESTAÑA 1: DEMO EN 1 CLIC === */}
          {activeTab === 'demo' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-pink-500/5 space-y-6">
              
              <div className="text-center space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  ¡Prueba el sistema ahora mismo!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Haz clic en cualquiera de estos 3 roles para entrar al salón con mesas de ejemplo:
                </p>
              </div>

              {/* 3 Tarjetas de Roles con Clic Inmediato */}
              <div className="space-y-3">
                {/* Gerente */}
                <button
                  type="button"
                  onClick={() => {
                    if (isPinProtectionEnabled) {
                      promptManagerPin(
                        () => loginAsDemoRole('gerente'),
                        'Acceso de Gerencia Protegido',
                        'Introduce la clave de acceso de Gerente para acceder al salón con permisos de control total.'
                      );
                    } else {
                      loginAsDemoRole('gerente');
                    }
                  }}
                  className="w-full p-4 rounded-2xl bg-pink-50/60 dark:bg-slate-800/80 hover:bg-pink-100/70 dark:hover:bg-slate-800 border-2 border-pink-200/80 dark:border-pink-900/50 hover:border-[#681841] transition cursor-pointer flex items-center justify-between text-left group gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="text-3xl p-2 rounded-xl bg-white dark:bg-slate-900 shadow-xs shrink-0">👨‍💼</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          Carlos (Gerente)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#681841] text-white shrink-0">
                          Control Total
                        </span>
                        {isPinProtectionEnabled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-[#681841] dark:text-pink-300 flex items-center gap-1 border border-pink-200 dark:border-pink-900 shrink-0">
                            <Lock className="w-2.5 h-2.5" /> Clave Requerida
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
                        Control total: gestión de mesas, precios, inventario, reportes de ventas y personal.
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#681841] dark:text-pink-400 group-hover:translate-x-1 transition shrink-0" />
                </button>

                {/* Cajero / Caja */}
                <button
                  type="button"
                  onClick={() => loginAsDemoRole('cajero')}
                  className="w-full p-4 rounded-2xl bg-blue-50/60 dark:bg-slate-800/80 hover:bg-blue-100/70 dark:hover:bg-slate-800 border-2 border-blue-200/80 dark:border-blue-900/50 hover:border-blue-500 transition cursor-pointer flex items-center justify-between text-left group gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="text-3xl p-2 rounded-xl bg-white dark:bg-slate-900 shadow-xs shrink-0">💳</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          Sofía (Caja)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
                          Solo Mesas y Cobro
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
                        Vista de mesas y cobro de pedidos (sin acceso a inventario ni reportes confidenciales).
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition shrink-0" />
                </button>

                {/* Camarera */}
                <button
                  type="button"
                  onClick={() => loginAsDemoRole('camarero')}
                  className="w-full p-4 rounded-2xl bg-emerald-50/60 dark:bg-slate-800/80 hover:bg-emerald-100/70 dark:hover:bg-slate-800 border-2 border-emerald-200/80 dark:border-emerald-900/50 hover:border-emerald-500 transition cursor-pointer flex items-center justify-between text-left group gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="text-3xl p-2 rounded-xl bg-white dark:bg-slate-900 shadow-xs shrink-0">👩‍🍳</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          Elena (Camarera)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shrink-0">
                          Solo Mesas y Pedidos
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
                        Abrir mesas, tomar comandas y pedir cuentas (sin acceso a inventario ni finanzas).
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition shrink-0" />
                </button>

                {/* Barman */}
                <button
                  type="button"
                  onClick={() => loginAsDemoRole('barman')}
                  className="w-full p-4 rounded-2xl bg-rose-50/60 dark:bg-slate-800/80 hover:bg-rose-100/70 dark:hover:bg-slate-800 border-2 border-rose-200/80 dark:border-rose-950/60 hover:border-[#e64980] transition cursor-pointer flex items-center justify-between text-left group gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="text-3xl p-2 rounded-xl bg-white dark:bg-slate-900 shadow-xs shrink-0">🍸</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          Mateo (Barman)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e64980] text-white shrink-0">
                          Barra & Coctelería
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
                        Ver pedidos de bebidas de la terraza y barra de despacho.
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#e64980] group-hover:translate-x-1 transition shrink-0" />
                </button>
              </div>

              {/* Guía Visual Rápida de Estados de Mesas */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  ¿Cómo reconocerás las mesas en el salón?
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mb-1" />
                    <p className="font-bold text-emerald-800 dark:text-emerald-300 text-[11px]">Libre</p>
                    <p className="text-[10px] text-slate-500">Lista para sentar</p>
                  </div>
                  <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mb-1" />
                    <p className="font-bold text-red-800 dark:text-red-300 text-[11px]">Ocupada</p>
                    <p className="text-[10px] text-slate-500">Consumiendo</p>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-500 mb-1" />
                    <p className="font-bold text-purple-800 dark:text-purple-300 text-[11px]">Cuenta</p>
                    <p className="text-[10px] text-slate-500">Pidiendo cobro</p>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="text-xs text-[#681841] dark:text-pink-400 font-semibold hover:underline cursor-pointer"
                >
                  ¿Quieres crear tu cuenta propia? Haz clic aquí gratis →
                </button>
              </div>

            </div>
          )}

          {/* === PESTAÑA 2: CREAR CUENTA GRATIS === */}
          {activeTab === 'register' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-pink-500/5 space-y-5">
              
              <div className="text-center space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold">
                  <Check className="w-3.5 h-3.5" />
                  Plan Gratuito Permanente · $0 COP
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white pt-1">
                  Crea la cuenta de tu local en 1 minuto
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sin tarjeta de crédito. Incluye mesas, comandas e inventario.
                </p>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tu nombre
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Carmen Rodríguez"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre de tu bar o terraza
                  </label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Ej. Chinmi Terraza Bar"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@tunegocio.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Crea una contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                {/* Beneficios del Plan Gratuito */}
                <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2 font-bold">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Tu cuenta incluye Plan Gratuito ($0 COP para siempre)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-6">
                    Hasta 6 mesas activas, 15 productos y toma de comandas. Si tu local crece, puedes actualizar a PRO en cualquier momento.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs sm:text-sm font-bold shadow-md shadow-pink-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <span className="inline-block animate-spin">⏳</span>
                  ) : (
                    <>
                      <span>Crear Mi Cuenta Gratis ($0 COP)</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Botón de Google */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => handleOpenGoogle('register')}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z" />
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                    <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1s.7 5.4 1.9 7.8l3.7-2.9z" />
                    <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z" />
                  </svg>
                  <span>Registrarme con mi Cuenta de Google</span>
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setFormSuccess(null);
                    setActiveTab('login');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                >
                  ¿Ya tienes una cuenta? <strong className="text-[#681841] dark:text-pink-400">Inicia sesión aquí</strong>
                </button>
              </div>

            </div>
          )}

          {/* === PESTAÑA 3: INICIAR SESIÓN === */}
          {activeTab === 'login' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-pink-500/5 space-y-5">
              
              <div className="text-center space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Bienvenido de vuelta
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ingresa tus datos para acceder a tu bar o terraza:
                </p>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Contraseña
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-[#e64980]/50 focus:border-[#e64980]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs sm:text-sm font-bold shadow-md shadow-pink-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <span className="inline-block animate-spin">⏳</span>
                  ) : (
                    <>
                      <span>Ingresar a Mi Negocio</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => handleOpenGoogle('login')}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z" />
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                    <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1s.7 5.4 1.9 7.8l3.7-2.9z" />
                    <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z" />
                  </svg>
                  <span>Ingresar con mi Cuenta de Google</span>
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setFormSuccess(null);
                    setActiveTab('register');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                >
                  ¿No tienes cuenta todavía? <strong className="text-[#681841] dark:text-pink-400">Regístrate gratis aquí</strong>
                </button>
              </div>

            </div>
          )}

          {/* === PESTAÑA 4: PRECIOS TRANSPARENTES === */}
          {activeTab === 'pricing' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-pink-500/5 space-y-6">
              
              <div className="text-center space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Planes en Pesos Colombianos (COP$)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Transparencia total. Puedes cambiar de plan o cancelar en cualquier momento.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Gratis */}
                <div className="p-5 sm:p-6 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        Básico Limitado
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        Para empezar
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                      Plan Gratuito
                    </h3>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                        $0 COP
                      </span>
                      <span className="text-xs text-slate-400">/ para siempre</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Ideal para probar el software o para cafeterías y bares muy pequeños.
                    </p>

                    {/* Features list with inclusions & limitations */}
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Hasta <strong>6 mesas activas</strong> simultáneas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Hasta <strong>15 productos</strong> en carta</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>1 zona estándar del local</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Comandas, tickets y cobros TPV</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin módulo de despensa de perecederos</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin pedidos directos desde el móvil del cliente</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                        <X className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-through">Sin exportación histórica a Excel/CSV</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
                  >
                    Comenzar con Plan Gratis
                  </button>
                </div>

                {/* Pro */}
                <div className="p-5 sm:p-6 rounded-2xl border-2 border-[#681841] bg-pink-50/50 dark:bg-pink-950/30 flex flex-col justify-between shadow-md relative">
                  <span className="absolute -top-3 right-5 text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full bg-gradient-to-r from-[#681841] to-[#e64980] text-white shadow-xs">
                    Recomendado ⭐ Todo Ilimitado
                  </span>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#681841] text-white">
                        Hostelería PRO
                      </span>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Ahorro hasta 20% anual
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mt-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#e64980]" />
                      Plan PRO
                    </h3>
                    <div className="mt-1 flex items-baseline gap-1">
                      <p className="text-3xl font-black text-[#681841] dark:text-pink-400 font-mono">
                        $89.000 COP
                      </p>
                      <span className="text-xs text-slate-500">/ mes</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Descuentos: 10% trimestral ($240.300 COP) · 20% anual ($854.400 COP)
                    </p>

                    {/* Pro features list */}
                    <div className="mt-4 pt-3 border-t border-pink-200 dark:border-pink-900/60 space-y-2 text-xs text-slate-800 dark:text-slate-200 font-medium">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Mesas ilimitadas</strong> (sin ningún tope de aforo)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Productos y categorías ilimitadas</strong> con fotos y costos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Zonas ilimitadas</strong> (Terraza, Salón, Barra, VIP...)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Módulo Despensa</strong>: Control de perecederos y mermas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Cartas QR Interactivas</strong>: Pedidos del cliente y llamada a mesero</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Multi-pantalla en vivo</strong> (Barra, Cocina, Meseros sincronizados)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span><strong>Historial completo & Exportación</strong> a Excel / CSV</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setWantPro(true);
                      setActiveTab('register');
                    }}
                    className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Activar Plan PRO</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabla Comparativa Detallada de Diferencias */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <PlanComparisonTable />
              </div>

            </div>
          )}

        </div>

      </main>

      {/* 5. Pie de Página Amigable y Confiable */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Datos respaldados en la nube y sincronizados en tiempo real</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('pricing')} 
            className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            Planes y Precios
          </button>
          <span>·</span>
          <span>Chinmi App © 2026</span>
        </div>
      </footer>

      {/* Modal de Autenticación con Google */}
      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        defaultMode={googleModalMode}
      />

    </div>
  );
};
