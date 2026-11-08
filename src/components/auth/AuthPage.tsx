import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PAID_PLANS, BillingFrequency } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { GoogleIcon } from '../common/GoogleIcon';
import { FacebookIcon } from '../common/FacebookIcon';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { GoogleAuthModal } from './GoogleAuthModal';
import {
  ArrowLeft,
  ArrowRight,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  Store,
  MapPin,
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Smartphone,
  Receipt,
  Sun,
  Moon
} from 'lucide-react';

import { isValidRealEmail } from '../../utils/emailValidation';

export interface AuthPageProps {
  initialMode?: 'login' | 'register';
  initialWantPro?: boolean;
  initialBillingCycle?: BillingFrequency;
  onBackToHome: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'login',
  initialWantPro = false,
  initialBillingCycle = 'annual',
  onBackToHome
}) => {
  const {
    loginWithEmail,
    loginWithGoogle,
    loginWithFacebook,
    register,
    isLoading
  } = useAuth();
  const { theme, toggleTheme, updateConfig } = useApp();

  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);
  const [wantPro, setWantPro] = useState<boolean>(initialWantPro);
  const [selectedCycle, setSelectedCycle] = useState<BillingFrequency>(initialBillingCycle);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalMode, setGoogleModalMode] = useState<'login' | 'register'>('login');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const emailLoginRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAuthMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setWantPro(initialWantPro);
  }, [initialWantPro]);

  useEffect(() => {
    setSelectedCycle(initialBillingCycle);
  }, [initialBillingCycle]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (authMode === 'login') {
        emailLoginRef.current?.focus();
      } else {
        nameInputRef.current?.focus();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [authMode]);

  const selectedPaidPlan = PAID_PLANS[selectedCycle];

  const handleSwitchMode = (nextMode: 'login' | 'register') => {
    setFormError(null);
    setFormSuccess(null);
    setAuthMode(nextMode);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!email.trim() || !email.includes('@')) {
      setFormError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!password) {
      setFormError('Ingresa tu contraseña.');
      return;
    }

    const res = await loginWithEmail(email.trim(), password);
    if (!res.success) {
      setFormError(res.error || 'Credenciales incorrectas.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!name.trim()) {
      setFormError('Ingresa tu nombre.');
      return;
    }
    if (!businessName.trim()) {
      setFormError('Ingresa el nombre de tu negocio.');
      return;
    }
    if (!businessAddress.trim()) {
      setFormError('Ingresa la dirección de tu local.');
      return;
    }
    const emailCheck = isValidRealEmail(email.trim());
    if (!emailCheck.valid) {
      setFormError(emailCheck.reason || 'Ingresa un correo electrónico real y válido.');
      return;
    }
    if (password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const res = await register(
      name.trim(),
      email.trim(),
      password,
      'gerente',
      businessName.trim(),
      wantPro ? 'pro' : 'free',
      wantPro ? selectedCycle : undefined,
      businessAddress.trim()
    );

    if (!res.success) {
      setFormError(res.error || 'No fue posible crear la cuenta.');
    } else {
      updateConfig({
        businessName: businessName.trim(),
        businessAddress: businessAddress.trim()
      });
      setFormSuccess(
        res.message || 'Cuenta creada con éxito. Ya puedes ingresar a tu panel.'
      );
    }
  };

  const handleOpenGoogle = (mode: 'login' | 'register') => {
    setFormError(null);
    setGoogleModalMode(mode);
    setIsGoogleModalOpen(true);
  };

  return (
    <div className={`min-h-screen bg-stone-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-rose-900 selection:text-white ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Barra superior limpia de la página de acceso */}
      <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={onBackToHome}
            className="flex items-center text-left cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-900 rounded-md"
            title="Volver a la página principal de Chinmi App"
          >
            <ChinmiLogo
              variant="horizontal"
              size="sm"
              showSubtitle={false}
              logoUrl="/pug_cocktail_logo.png"
              isPublicBranding={true}
            />
          </button>

          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label="Alternar tema visual"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al inicio</span>
            </button>
          </div>
        </div>
      </header>

      {/* Cuerpo principal de Acceso y Creación de Cuenta */}
      <main className="flex-1 flex items-center py-8 sm:py-12">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Columna Principal: Iniciar Sesión y Crear Cuenta (Foco Dominante) */}
            <div className="lg:col-span-7 flex">
              <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-6">
                <div className="space-y-6">
                  {/* Selector principal muy visible entre Iniciar Sesión y Crear Cuenta */}
                  <div
                    role="tablist"
                    aria-label="Opciones de acceso"
                    className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-stone-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'login'}
                      onClick={() => handleSwitchMode('login')}
                      className={`py-3 px-4 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                        authMode === 'login'
                          ? 'bg-rose-900 text-white shadow-sm'
                          : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      <LogIn className="w-4 h-4 shrink-0" />
                      <span>Iniciar Sesión</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'register'}
                      onClick={() => handleSwitchMode('register')}
                      className={`py-3 px-4 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                        authMode === 'register'
                          ? 'bg-rose-900 text-white shadow-sm'
                          : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      <UserPlus className="w-4 h-4 shrink-0" />
                      <span>Crear Cuenta</span>
                    </button>
                  </div>

                  {/* Encabezado contextual directo */}
                  <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {authMode === 'login'
                        ? 'Ingresa a tu restaurante'
                        : 'Crea la cuenta de tu negocio'}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      {authMode === 'login'
                        ? 'Accede con tu correo registrado para entrar al salón, caja, inventario y comandas.'
                        : 'Registra los datos principales de tu establecimiento para empezar a operar de inmediato.'}
                    </p>
                  </div>

                  {/* Mensajes de error o éxito */}
                  {formError && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {formSuccess && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-start gap-2.5">
                      <Check className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  {/* Formulario según pestaña activa */}
                  {authMode === 'login' ? (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="auth-login-email"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                        >
                          Correo electrónico
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                          <input
                            ref={emailLoginRef}
                            id="auth-login-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="gerencia@turestaurante.com"
                            className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label
                            htmlFor="auth-login-password"
                            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                          >
                            Contraseña
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsForgotPasswordOpen(true)}
                            className="text-xs font-semibold text-rose-900 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            ¿Olvidaste tu contraseña?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                          <input
                            id="auth-login-password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3.5 px-5 rounded-xl bg-rose-900 hover:bg-rose-800 disabled:bg-slate-400 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Ingresando...</span>
                          </>
                        ) : (
                          <>
                            <span>Iniciar Sesión Ahora</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      {/* Selector compacto de plan al registrarse */}
                      <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span>
                          Modalidad inicial:{' '}
                          <strong className="text-slate-900 dark:text-white tabular-nums">
                            {wantPro
                              ? `Licencia PRO (${selectedPaidPlan.frequencyLabel} · ${formatCOP(
                                  selectedPaidPlan.monthlyEquivalent
                                )}/mes)`
                              : 'Plan Inicial Gratuito ($0 COP)'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setWantPro(!wantPro)}
                          className="text-rose-900 dark:text-rose-400 font-semibold hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Cambiar a {wantPro ? 'Plan Gratuito' : 'Licencia PRO'}
                        </button>
                      </div>

                      <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label
                              htmlFor="auth-reg-name"
                              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                            >
                              Tu nombre
                            </label>
                            <div className="relative">
                              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                ref={nameInputRef}
                                id="auth-reg-name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Carlos Mendoza"
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor="auth-reg-business"
                              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                            >
                              Nombre del restaurante o bar
                            </label>
                            <div className="relative">
                              <Store className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                id="auth-reg-business"
                                type="text"
                                required
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="Terraza Central"
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="auth-reg-address"
                            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                          >
                            Dirección del local
                          </label>
                          <div className="relative">
                            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input
                              id="auth-reg-address"
                              type="text"
                              required
                              value={businessAddress}
                              onChange={(e) => setBusinessAddress(e.target.value)}
                              placeholder="Cra. 43A # 1-50, El Poblado, Medellín"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="auth-reg-email"
                            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                          >
                            Correo electrónico
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input
                              id="auth-reg-email"
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="gerencia@turestaurante.com"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="auth-reg-password"
                            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                          >
                            Contraseña (mínimo 6 caracteres)
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input
                              id="auth-reg-password"
                              type="password"
                              required
                              minLength={6}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="w-full py-3.5 px-5 rounded-xl bg-rose-900 hover:bg-rose-800 disabled:bg-slate-400 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Creando cuenta...</span>
                            </>
                          ) : (
                            <>
                              <span>Crear Cuenta Ahora</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Proveedores rápidos + enlace directo de cambio */}
                <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="space-y-2.5">
                    <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                      {authMode === 'login'
                        ? 'O ingresa rápidamente con tu cuenta de'
                        : 'O registra tu cuenta rápidamente con'}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          setFormError(null);
                          if (authMode === 'register') {
                            handleOpenGoogle('register');
                            return;
                          }
                          const res = await loginWithGoogle();
                          if (!res.success) {
                            if (
                              res.error?.includes('API Key') ||
                              res.error?.includes('api-key-not-valid')
                            ) {
                              handleOpenGoogle('login');
                            } else if (res.error) {
                              setFormError(res.error);
                            }
                          }
                        }}
                        className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <GoogleIcon className="w-4 h-4 shrink-0" />
                        <span>Google</span>
                      </button>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          setFormError(null);
                          const res = await loginWithFacebook();
                          if (!res.success && res.error) setFormError(res.error);
                        }}
                        className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FacebookIcon className="w-4 h-4 shrink-0" />
                        <span>Facebook</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-stone-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 dark:text-slate-400">
                      {authMode === 'login'
                        ? '¿Primera vez en Chinmi App?'
                        : '¿Ya tienes una cuenta creada?'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSwitchMode(authMode === 'login' ? 'register' : 'login')
                      }
                      className="font-bold text-rose-900 dark:text-rose-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {authMode === 'login' ? 'Crear cuenta aquí →' : 'Iniciar sesión aquí →'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Complementaria: Contexto Operativo del Sistema */}
            <div className="lg:col-span-5 flex">
              <div className="w-full rounded-2xl p-6 sm:p-8 bg-slate-900 border border-slate-800 text-white flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-rose-400">
                    Chinmi App · Acceso Centralizado
                  </p>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug [text-wrap:balance]">
                    Todo el control de tu local desde una misma cuenta.
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Al iniciar sesión entras directamente al selector de perfiles de tu equipo para abrir turno en Gerencia, Caja, Salón o Barra/Cocina.
                  </p>
                </div>

                <div className="space-y-4 py-5 border-y border-slate-800 text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Perfiles protegidos con PIN</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cada empleado trabaja únicamente con los permisos asignados a su cargo.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Sincronización en vivo</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Comandas de salón, pedidos QR e inventario conectados al instante en cualquier pantalla.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Receipt className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Caja y despensa al día</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Arqueos por fecha, Impoconsumo del 8% desglosado y control de pedidos a proveedores.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-400">
                  <p className="font-medium text-slate-300">
                    ¿Quieres revisar primero las funciones o tarifas?
                  </p>
                  <button
                    type="button"
                    onClick={onBackToHome}
                    className="inline-flex items-center gap-1.5 font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-4 cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Ver información del sistema y planes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        defaultMode={googleModalMode}
      />

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        defaultEmail={email}
      />
    </div>
  );
};
