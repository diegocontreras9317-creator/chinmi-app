import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PAID_PLANS, BillingFrequency } from '../../config/pricingPlans';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { PublicNavbar, PublicSectionTarget } from '../layout/PublicNavbar';
import { PlanComparisonTable } from '../pricing/PlanComparisonTable';
import { GoogleIcon } from '../common/GoogleIcon';
import { FacebookIcon } from '../common/FacebookIcon';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { GoogleAuthModal } from './GoogleAuthModal';
import {
  Lock,
  Mail,
  User,
  Store,
  ArrowRight,
  Sun,
  Moon,
  Check,
  AlertCircle,
  Loader2,
  QrCode,
  Receipt,
  LayoutGrid,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Users,
  ChefHat,
  SlidersHorizontal
} from 'lucide-react';

import heroHospitalityImg from '../../assets/images/hero_pos_hospitality_1793657118583.jpg';
import bentoQrImg from '../../assets/images/bento_qr_table_ordering_1793657120970.jpg';
import bentoKitchenImg from '../../assets/images/bento_kitchen_inventory_1793657121593.jpg';

export const LandingPage: React.FC = () => {
  const {
    loginWithEmail,
    loginWithGoogle,
    loginWithFacebook,
    register,
    isLoading
  } = useAuth();
  const { theme, toggleTheme, updateConfig } = useApp();

  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [wantPro, setWantPro] = useState<boolean>(true);
  const [selectedCycle, setSelectedCycle] = useState<BillingFrequency>('annual');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [heroImgError, setHeroImgError] = useState(false);
  const [qrImgError, setQrImgError] = useState(false);
  const [kitchenImgError, setKitchenImgError] = useState(false);

  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalMode, setGoogleModalMode] = useState<'login' | 'register'>('register');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const plataformaRef = useRef<HTMLElement>(null);
  const comoFuncionaRef = useRef<HTMLElement>(null);
  const rolesRef = useRef<HTMLElement>(null);
  const planesRef = useRef<HTMLElement>(null);
  const accesoRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailLoginRef = useRef<HTMLInputElement>(null);

  const selectedPaidPlan = PAID_PLANS[selectedCycle];

  const handleNavigate = (target: PublicSectionTarget) => {
    setFormError(null);
    setFormSuccess(null);

    if (target === 'plataforma') {
      plataformaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target === 'como-funciona') {
      comoFuncionaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target === 'roles') {
      rolesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target === 'planes') {
      planesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target === 'login') {
      setAuthMode('login');
      accesoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => emailLoginRef.current?.focus(), 450);
      return;
    }
    if (target === 'register') {
      setAuthMode('register');
      accesoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => nameInputRef.current?.focus(), 450);
    }
  };

  const handleSelectPlanAndRegister = (proSelected: boolean) => {
    setWantPro(proSelected);
    setAuthMode('register');
    setFormError(null);
    setFormSuccess(null);
    accesoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => nameInputRef.current?.focus(), 450);
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
    if (!email.trim() || !email.includes('@')) {
      setFormError('Ingresa un correo electrónico válido.');
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
      wantPro ? selectedCycle : undefined
    );

    if (!res.success) {
      setFormError(res.error || 'No fue posible crear la cuenta.');
    } else {
      updateConfig({ businessName: businessName.trim() });
      setFormSuccess(
        res.message ||
          'Cuenta creada. Revisa tu correo para confirmar el acceso.'
      );
    }
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

  const handleOpenGoogle = (mode: 'login' | 'register') => {
    setFormError(null);
    setGoogleModalMode(mode);
    setIsGoogleModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-rose-900 selection:text-white">
      <PublicNavbar onNavigate={handleNavigate} />

      <main className="flex-1">
        {/* =========================================================
            1. HERO PRINCIPAL (EQUILIBRADO, SERIO Y SIN HUECOS)
        ========================================================= */}
        <section className="border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-400">
                    Software POS Gastronómico · Colombia
                  </p>

                  <h1 className="text-[clamp(2rem,3.4vw,3.1rem)] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] [text-wrap:balance]">
                    Controla mesas, comandas, inventario y caja desde un solo sistema.
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    Chinmi App conecta en tiempo real el salón, la barra, la cocina y la facturación de tu restaurante, gastrobar o café, operando en cualquier computador, tablet o celular sin instalar servidores locales.
                  </p>

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Comandas en vivo con alerta visual y sonora</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Carta QR por mesa sincronizada al instante</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>P.V.P. con Impoconsumo (8%) desglosado</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Cierre en efectivo, datáfono o transferencia y arqueo diario</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-slate-200/80 dark:border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleNavigate('register')}
                      className="px-6 py-3 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Registrar Negocio</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNavigate('planes')}
                      className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Ver Planes y Precios
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 sm:ml-auto">
                    ¿Ya tienes cuenta?{' '}
                    <button
                      type="button"
                      onClick={() => handleNavigate('login')}
                      className="font-semibold text-rose-900 dark:text-rose-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
                    >
                      Iniciar sesión →
                    </button>
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5 flex">
                <div className="relative w-full min-h-[280px] sm:min-h-[340px] lg:h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 flex flex-col justify-end">
                  {!heroImgError ? (
                    <img
                      src={heroHospitalityImg}
                      alt="Operación de restaurante con punto de venta Chinmi App"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgError(true)}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-stone-900 to-rose-950 flex items-center justify-center p-8">
                      <ChinmiLogo
                        variant="stacked"
                        size="lg"
                        lightText={true}
                        logoUrl="/pug_cocktail_logo.png"
                        isPublicBranding={true}
                      />
                    </div>
                  )}

                  <div className="relative z-10 p-5 bg-gradient-to-t from-slate-950/95 via-slate-950/65 to-transparent text-white space-y-1">
                    <p className="text-xs font-mono text-stone-300 tabular-nums">
                      Salón · Barra · Cocina · Caja
                    </p>
                    <p className="text-sm font-semibold text-white">
                      Todas las estaciones sincronizadas sobre la misma cuenta en vivo.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Franja de pilares operativos en celdas estructuradas */}
            <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Sincronización en Nube
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Cada pedido tomado en mesa o por QR aparece al instante en preparación y caja.
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  Impoconsumo 8% Incluido
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Respeta el precio final de tu carta y extrae la base gravable en el recibo legal.
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Caja y Arqueo Diario
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Registra efectivo con cálculo de cambio, datáfono o transferencias QR y filtra ventas por día.
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  4 Perfiles con PIN
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Accesos separados para Gerencia, Cajero, Mesero y Barra/Cocina en cada turno.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            2. MÓDULOS DE LA PLATAFORMA (BENTO COMPACTO SIN ESPACIOS MUERTOS)
        ========================================================= */}
        <section
          id="plataforma"
          ref={plataformaRef}
          className="py-11 lg:py-14 bg-stone-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-400">
                  Módulos Integrados
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Qué incluye Chinmi App en tu operación diaria.
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md">
                Cuatro áreas conectadas para eliminar comandas en papel, errores de cobro y faltantes de inventario.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
              {/* 01: Salón y Comandas (Col-span-2 con vista previa operativa interna) */}
              <div className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      01 · Salón, Zonas y Comandas
                    </span>
                    <LayoutGrid className="w-5 h-5 text-rose-900 dark:text-rose-400 shrink-0" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    Mapa de mesas interactivo y toma de pedidos al instante
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Divide tu establecimiento en Salón Principal, Terraza, Barra o VIP. Agrega productos con notas de preparación específicas y visualiza en tiempo real el consumo acumulado de cada mesa.
                  </p>
                </div>

                {/* Vista estructural de estados de mesa para llenar el espacio con contexto útil */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50/80 dark:bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Vista rápida de estados en salón
                    </span>
                    <span className="font-mono tabular-nums">Salón · Terraza · Barra</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-slate-900 dark:text-white">Mesa 04</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Libre</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">
                        Disponible para apertura inmediata por mesero o QR.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between font-mono tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">Mesa 08</span>
                        <span className="text-rose-900 dark:text-rose-400 font-semibold">$124.000</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">
                        Consumo activo con comandas enviadas a barra y cocina.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between font-mono tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">Terraza 02</span>
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">Cuenta</span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">
                        Solicitud de cobro notificada en pantalla de caja.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 02: Menú QR */}
              <div className="lg:col-span-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
                <div className="aspect-[16/9] w-full bg-slate-900 relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
                  {!qrImgError ? (
                    <img
                      src={bentoQrImg}
                      alt="Código QR en mesa para carta digital"
                      referrerPolicy="no-referrer"
                      onError={() => setQrImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-stone-900 text-stone-300">
                      <QrCode className="w-10 h-10" />
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums block">
                      02 · Autoatención QR
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Carta digital QR exclusiva por mesa
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Genera códigos QR listos para imprimir. El comensal consulta precios actualizados, envía su pedido directo o solicita la cuenta sin descargar aplicaciones.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Precios finales sin recargos</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Llamado a mesero</span>
                  </div>
                </div>
              </div>

              {/* 03: Inventario y Despensa */}
              <div className="lg:col-span-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
                <div className="aspect-[16/9] w-full bg-slate-900 relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
                  {!kitchenImgError ? (
                    <img
                      src={bentoKitchenImg}
                      alt="Control de inventario y despensa gastronómica"
                      referrerPolicy="no-referrer"
                      onError={() => setKitchenImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-stone-900 text-stone-300">
                      <PackageCheck className="w-10 h-10" />
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums block">
                      03 · Stock y Despensa
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Kardex comercial e insumos perecederos
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Descuenta unidades automáticamente en cada venta cerrada, calcula utilidad bruta frente al costo y alerta fechas de vencimiento en cocina.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Alertas de stock crítico</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Control de mermas</span>
                  </div>
                </div>
              </div>

              {/* 04: Caja, Impuestos y Facturación (Col-span-2 con desglose contable y métodos) */}
              <div className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      04 · Caja, Facturación y Arqueo
                    </span>
                    <Receipt className="w-5 h-5 text-rose-900 dark:text-rose-400 shrink-0" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    Liquidación ágil, ticket POS y búsqueda diaria por calendario
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Cierra cuentas registrando pagos en efectivo (con cálculo exacto de vueltas), datáfono o transferencias digitales. Emite tickets térmicos de 58mm/80mm y audita facturas por fecha en el calendario.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50/80 dark:bg-slate-950/60 p-3.5 space-y-1.5 font-mono tabular-nums">
                    <p className="font-sans font-semibold text-slate-800 dark:text-slate-200">
                      Matemática legal (P.V.P. final)
                    </p>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Base gravable:</span>
                      <span>$100.000</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Impoconsumo (8% incl.):</span>
                      <span>$8.000</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span>Total cobrado al cliente:</span>
                      <span>$108.000</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50/80 dark:bg-slate-950/60 p-3.5 flex flex-col justify-between space-y-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Control de caja y auditoría
                    </p>
                    <ul className="space-y-1.5 text-slate-600 dark:text-slate-400">
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Registro de efectivo, datáfono y QR / Nequi</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Filtro de facturas por fecha exacta</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Exportación contable a Excel / CSV</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            3. CÓMO FUNCIONA (FLUJO OPERATIVO DE 4 PASOS EN TARJETAS)
        ========================================================= */}
        <section
          id="como-funciona"
          ref={comoFuncionaRef}
          className="py-11 lg:py-14 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-400">
                  Cómo Funciona
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  De la apertura del turno al cierre contable en 4 pasos.
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md">
                Implementación directa desde el navegador web sin cableados ni licencias por equipo adicional.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-900 dark:text-rose-400 tabular-nums">
                      PASO 01
                    </span>
                    <SlidersHorizontal className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Configura salón y carta
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Define tus zonas de servicio, número de mesas, categorías, precios finales P.V.P. y existencias iniciales.
                  </p>
                </div>
                <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Configuración inicial en minutos
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-900 dark:text-rose-400 tabular-nums">
                      PASO 02
                    </span>
                    <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Ingresa al turno por PIN
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Cada colaborador accede con su código personal desde el computador de caja, tablet de barra o su propio celular.
                  </p>
                </div>
                <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Sin límite de pantallas activas
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-900 dark:text-rose-400 tabular-nums">
                      PASO 03
                    </span>
                    <ChefHat className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Comanda en salón o QR
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    El mesero o el cliente desde el QR envían el pedido; cocina y barra reciben notificación visual y alerta sonora inmediata.
                  </p>
                </div>
                <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Cero comandas extraviadas
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-900 dark:text-rose-400 tabular-nums">
                      PASO 04
                    </span>
                    <CreditCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cobra, imprime y audita
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Registra el cobro en efectivo, datáfono o transferencia, imprime el ticket legal, libera la mesa y audita el cierre diario.
                  </p>
                </div>
                <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Cierre cuadrado en COP
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            4. ROLES DEL PERSONAL (SIN COMENTARIOS NI TESTIMONIOS)
        ========================================================= */}
        <section
          id="roles"
          ref={rolesRef}
          className="py-11 lg:py-14 bg-stone-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-400">
                  Control Interno por Rol
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Cada integrante accede solo a lo que le corresponde.
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md">
                Protege tus precios, anulaciones y cierres de caja asignando permisos específicos mediante PIN de seguridad.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-rose-900 dark:text-rose-400 font-semibold">
                      01 · Administración
                    </p>
                    <ShieldCheck className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Gerencia
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Supervisión integral del negocio, rentabilidad y configuración maestra del establecimiento.
                  </p>
                </div>

                <ul className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Edición de carta, costos y stock</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Reportes por fecha y Excel</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">
                      02 · Punto de Pago
                    </p>
                    <Receipt className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cajero
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Enfocado en liquidar cuentas solicitadas y registrar pagos sin modificar el catálogo ni el inventario.
                  </p>
                </div>

                <ul className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Registro en efectivo, datáfono y QR</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Emisión de recibos POS</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">
                      03 · Atención en Salón
                    </p>
                    <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Mesero
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Vista ágil desde el celular para abrir mesas, cargar adiciones y atender llamados de clientes desde QR.
                  </p>
                </div>

                <ul className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Toma de pedidos móvil</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Solicitud de cuenta a caja</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">
                      04 · Preparación
                    </p>
                    <ChefHat className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Barra y Cocina
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Monitor exclusivo de órdenes entrantes en orden de llegada con cantidades y observaciones por mesa.
                  </p>
                </div>

                <ul className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Alertas de nuevas comandas</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Notas de preparación claras</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            5. PLANES Y TARIFAS EN COP (COMPLETOS Y TRANSPARENTES)
        ========================================================= */}
        <section
          id="planes"
          ref={planesRef}
          className="py-11 lg:py-14 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-400">
                  Planes Comerciales en COP
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Tarifas claras sin cláusulas de permanencia.
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Inicia sin costo para validar tu flujo o activa la Licencia PRO para operar sin límites de mesas ni catálogo.
                </p>
              </div>

              <div
                role="group"
                aria-label="Frecuencia de facturación Plan PRO"
                className="inline-flex items-center p-1 rounded-lg bg-stone-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCycle('monthly')}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCycle === 'monthly'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCycle('quarterly')}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCycle === 'quarterly'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Trimestral (-10%)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCycle('annual')}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCycle === 'annual'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Anual (-20%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* Plan Inicial */}
              <div className="p-6 sm:p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-900/50 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Cafés, barras pequeñas o etapa inicial
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      Plan Inicial
                    </h3>
                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                        $0 COP
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        / mes · sin tarjeta requerida
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Incluye las herramientas esenciales de salón y caja para puntos de venta compactos.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Hasta <strong>6 mesas operativas</strong> en 1 zona de atención</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Catálogo de hasta <strong>15 productos</strong> con control de stock</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Comandas, liquidación de caja y ticket con Impoconsumo 8%</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Carta digital QR en modo lectura y acceso de personal por PIN</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Consulta de ventas en pantalla con filtro por fecha</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectPlanAndRegister(false)}
                  className="w-full py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Crear Cuenta con Plan Inicial
                </button>
              </div>

              {/* Licencia Hostelería PRO */}
              <div className="p-6 sm:p-7 rounded-xl border border-rose-900/70 dark:border-rose-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-6 shadow-sm">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="text-rose-900 dark:text-rose-400">
                        Restaurantes, gastrobares y operación multi-zona
                      </span>
                      {selectedPaidPlan.discountPercent > 0 && (
                        <span className="text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                          Ahorra {selectedPaidPlan.discountPercent}%
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      Licencia Hostelería PRO
                    </h3>

                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-bold text-rose-900 dark:text-rose-400 font-mono tabular-nums">
                        {formatCOP(selectedPaidPlan.monthlyEquivalent)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        / mes equivalente
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      {selectedCycle === 'monthly'
                        ? 'Suscripción mensual sin permanencia · Pago de licencia vía ePayco.'
                        : `Facturado ${selectedPaidPlan.billingPeriodText}: ${formatCOP(
                            selectedPaidPlan.billedAmount
                          )} · Pago de licencia vía ePayco.`}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Mesas, zonas y productos ilimitados</strong> en tu establecimiento</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Menú QR interactivo</strong> con pedidos desde mesa y alerta al mesero</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Módulo de Despensa</strong> para perecederos, vencimientos y mermas</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Sincronización multi-dispositivo</strong> en tiempo real para todo el equipo</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span><strong>Exportación contable Excel/CSV</strong> e historial completo por calendario</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectPlanAndRegister(true)}
                  className="w-full py-3 px-4 rounded-lg bg-rose-900 hover:bg-rose-800 text-white font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span>Adquirir Licencia PRO</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pt-2">
              <PlanComparisonTable compact={true} />
            </div>
          </div>
        </section>

        {/* =========================================================
            6. REGISTRO Y ACCESO (#acceso — COLUMNAS DE ALTURA SIMÉTRICA)
        ========================================================= */}
        <section
          id="acceso"
          ref={accesoRef}
          className="py-11 lg:py-14 bg-stone-50/70 dark:bg-slate-900/40 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
              {/* Panel informativo ejecutivo de altura completa para evitar espacio vacío izquierdo */}
              <div className="lg:col-span-5 rounded-xl p-6 sm:p-7 bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                    Activación Inmediata
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                    Empieza a operar tu restaurante hoy mismo.
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Al registrar tu establecimiento se habilita tu entorno privado en la nube con perfil de Gerencia para configurar mesas, productos y usuarios de inmediato.
                  </p>
                </div>

                <div className="space-y-4 py-4 border-y border-slate-800 text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Datos aislados y respaldados</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tu catálogo, comandas y cierres contables se sincronizan de forma segura en tiempo real.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Compatible con tus equipos actuales</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Úsalo en portátiles o PC de caja, tablets en barra y celulares de tus meseros.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CreditCard className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Adaptado a la operación en Colombia</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Valores en pesos colombianos (COP), Impoconsumo del 8% incluido y pago seguro de tu suscripción PRO mediante ePayco.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span>
                    {authMode === 'register'
                      ? '¿Tu negocio ya está registrado?'
                      : '¿Aún no tienes cuenta para tu local?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setFormSuccess(null);
                      setAuthMode(authMode === 'register' ? 'login' : 'register');
                    }}
                    className="font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-4 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {authMode === 'register' ? 'Iniciar sesión →' : 'Registrar negocio →'}
                  </button>
                </div>
              </div>

              {/* Formulario de Registro / Inicio de Sesión */}
              <div className="lg:col-span-7 flex">
                <div className="w-full bg-white dark:bg-slate-900 rounded-xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-5">
                  <div className="space-y-5">
                    <div className="flex p-1 rounded-lg bg-stone-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        id="tab-btn-register"
                        onClick={() => {
                          setFormError(null);
                          setFormSuccess(null);
                          setAuthMode('register');
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          authMode === 'register'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Registrar Negocio
                      </button>

                      <button
                        type="button"
                        id="tab-btn-login"
                        onClick={() => {
                          setFormError(null);
                          setFormSuccess(null);
                          setAuthMode('login');
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          authMode === 'login'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Iniciar Sesión
                      </button>
                    </div>

                    {formError && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{formError}</span>
                      </div>
                    )}

                    {formSuccess && (
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-start gap-2">
                        <Check className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{formSuccess}</span>
                      </div>
                    )}

                    {authMode === 'register' ? (
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-stone-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <span>
                            Plan seleccionado:{' '}
                            <strong className="text-slate-900 dark:text-white tabular-nums">
                              {wantPro
                                ? `Licencia PRO (${selectedPaidPlan.frequencyLabel} · ${formatCOP(
                                    selectedPaidPlan.monthlyEquivalent
                                  )}/mes)`
                                : 'Plan Inicial ($0 COP)'}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setWantPro(!wantPro)}
                            className="text-rose-900 dark:text-rose-400 font-semibold hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Cambiar a {wantPro ? 'Plan Inicial' : 'Licencia PRO'}
                          </button>
                        </div>

                        <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Nombre del responsable
                              </label>
                              <div className="relative">
                                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                  ref={nameInputRef}
                                  type="text"
                                  required
                                  value={name}
                                  onChange={(e) => setName(e.target.value)}
                                  placeholder="Carlos Mendoza"
                                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Nombre del restaurante o bar
                              </label>
                              <div className="relative">
                                <Store className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                  type="text"
                                  required
                                  value={businessName}
                                  onChange={(e) => setBusinessName(e.target.value)}
                                  placeholder="Terraza Central"
                                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Correo electrónico corporativo o personal
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="gerencia@turestaurante.com"
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Contraseña de acceso (mínimo 6 caracteres)
                            </label>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-lg bg-rose-900 hover:bg-rose-800 disabled:bg-slate-400 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Creando cuenta...</span>
                              </>
                            ) : (
                              <>
                                <span>Crear Cuenta de Restaurante</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-stone-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                          Ingresa las credenciales de tu establecimiento para acceder al panel operativo y seleccionar tu perfil de turno.
                        </div>

                        <form onSubmit={handleLoginSubmit} className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Correo electrónico registrado
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                ref={emailLoginRef}
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="gerencia@turestaurante.com"
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-900/40 focus:border-rose-900"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-lg bg-rose-900 hover:bg-rose-800 disabled:bg-slate-400 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Ingresando...</span>
                              </>
                            ) : (
                              <>
                                <span>Ingresar al Sistema</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Acceso rápido social al pie del contenedor */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                      {authMode === 'register'
                        ? 'O vincula tu cuenta rápidamente con'
                        : 'O continúa directamente con'}
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
                        className="py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <GoogleIcon className="w-4 h-4" />
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
                        className="py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FacebookIcon className="w-4 h-4" />
                        <span>Facebook</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <ChinmiLogo
              variant="horizontal"
              size="sm"
              showSubtitle={false}
              logoUrl="/pug_cocktail_logo.png"
              isPublicBranding={true}
            />
            <span aria-hidden="true">·</span>
            <span>Software POS Gastronómico · Colombia</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => handleNavigate('plataforma')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Módulos
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => handleNavigate('como-funciona')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cómo Funciona
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => handleNavigate('planes')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Planes
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => handleNavigate('login')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Acceso
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Alternar tema claro u oscuro"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Oscuro</span>
                </>
              )}
            </button>
            <span aria-hidden="true">·</span>
            <span>© {new Date().getFullYear()} Chinmi App</span>
          </div>
        </div>
      </footer>

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
