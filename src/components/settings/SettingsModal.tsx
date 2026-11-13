import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole, Empleado, EmpleadoRol } from '../../types';
import { ComandaPaperWidth } from '../../config/appConfig';
import {
  ComandaTicketData,
  buildSampleComandaTicketData,
  triggerComandaBrowserPrint,
} from '../../utils/comandaPrint';
import { ComandaPrintPortal, ComandaTicketView } from '../tables/ComandaTicketView';
import {
  mapEmpleadoRolToUserRole,
  mapUserRoleToEmpleadoRol,
  getDefaultAvatarColorForRole,
} from '../../utils/employeeRoles';
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
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldAlert,
  AlertCircle,
  QrCode,
  Sliders,
  BellRing,
  Upload,
  Image as ImageIcon,
  Palette,
  Utensils,
  Edit2,
  Power,
  Mail,
  Wine,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { QR_THEMES, QrThemeId } from '../../config/qrThemes';
import { compressImageFile } from '../../utils/imageCompressor';
import { computeCustomContainerStyle } from '../../utils/qrCustomization';

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
    empleados,
    empleadoActivo,
    crearEmpleado,
    actualizarEmpleado,
    toggleEmpleadoActivo,
    eliminarEmpleado,
    managerPin,
    isPinProtectionEnabled,
    updateManagerPin,
    togglePinProtection,
    resetManagerPinToDefault,
    verifyManagerPin
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'general' | 'qr' | 'print' | 'team' | 'security'>('general');

  // General Settings State
  const [appName, setAppName] = useState(config.appName);
  const [businessName, setBusinessName] = useState(config.businessName);
  const [businessAddress, setBusinessAddress] = useState(config.businessAddress);
  const [businessTaxId, setBusinessTaxId] = useState(config.businessTaxId);
  const [businessPhone, setBusinessPhone] = useState(config.businessPhone);
  const [currency, setCurrency] = useState(config.currency);
  const [defaultTaxRate, setDefaultTaxRate] = useState(String(config.defaultTaxRate));
  const [logoUrl, setLogoUrl] = useState(config.logoUrl || config.qrSettings?.logoUrl || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Comanda Manual Print Settings State
  const [comandaPrintEnabled, setComandaPrintEnabled] = useState<boolean>(
    config.comandaPrintSettings?.enabled ?? true
  );
  const [comandaPaperWidth, setComandaPaperWidth] = useState<ComandaPaperWidth>(
    config.comandaPrintSettings?.paperWidth === '58mm' ? '58mm' : '80mm'
  );
  const [previewSampleReprint, setPreviewSampleReprint] = useState(false);
  const [testPrintTicket, setTestPrintTicket] = useState<ComandaTicketData | null>(null);
  const [printConfigSavedMsg, setPrintConfigSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAppName(config.appName);
      setBusinessName(config.businessName);
      setBusinessAddress(config.businessAddress);
      setBusinessTaxId(config.businessTaxId);
      setBusinessPhone(config.businessPhone);
      setCurrency(config.currency);
      setDefaultTaxRate(String(config.defaultTaxRate));
      setLogoUrl(config.logoUrl || config.qrSettings?.logoUrl || '');
      setComandaPrintEnabled(config.comandaPrintSettings?.enabled ?? true);
      setComandaPaperWidth(config.comandaPrintSettings?.paperWidth === '58mm' ? '58mm' : '80mm');
    }
  }, [isOpen, config]);

  // QR Code & Digital Menu Settings State
  const [allowOrdering, setAllowOrdering] = useState(config.qrSettings?.allowOrdering ?? true);
  const [allowCallWaiter, setAllowCallWaiter] = useState(config.qrSettings?.allowCallWaiter ?? true);
  const [allowRequestBill, setAllowRequestBill] = useState(config.qrSettings?.allowRequestBill ?? true);
  const [menuOnlyMode, setMenuOnlyMode] = useState(config.qrSettings?.menuOnlyMode ?? false);
  const [qrTheme, setQrTheme] = useState<QrThemeId>(config.qrSettings?.qrTheme || 'default_normal');
  const [menuViewMode, setMenuViewMode] = useState<'list' | 'medium'>(config.qrSettings?.menuViewMode || 'medium');
  const [categories, setCategories] = useState<string[]>(config.categories || []);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState(config.qrSettings?.bgImageUrl || '');
  const [textColor, setTextColor] = useState(config.qrSettings?.textColor || '#0f172a');
  const [accentColor, setAccentColor] = useState(config.qrSettings?.accentColor || '#e11d48');
  const [qrLogoUrl, setQrLogoUrl] = useState(config.qrSettings?.logoUrl || config.logoUrl || '');
  const [qrBannerUrl, setQrBannerUrl] = useState(config.qrSettings?.bannerUrl || '');

  // Personalización avanzada de Tarjetas de Productos
  const [cardBgColor, setCardBgColor] = useState(config.qrSettings?.cardBgColor || '#ffffff');
  const [cardBgOpacity, setCardBgOpacity] = useState<number>(config.qrSettings?.cardBgOpacity ?? 100);
  const [cardBgImageUrl, setCardBgImageUrl] = useState(config.qrSettings?.cardBgImageUrl || '');
  const [cardBgFit, setCardBgFit] = useState<'cover' | 'contain' | 'center'>(config.qrSettings?.cardBgFit || 'cover');
  const [cardOverlayColor, setCardOverlayColor] = useState(config.qrSettings?.cardOverlayColor || '#000000');
  const [cardOverlayOpacity, setCardOverlayOpacity] = useState<number>(config.qrSettings?.cardOverlayOpacity ?? 0);
  const [cardTextColor, setCardTextColor] = useState(config.qrSettings?.cardTextColor || '');
  const [cardAutoContrast, setCardAutoContrast] = useState<boolean>(config.qrSettings?.cardAutoContrast ?? true);

  // Personalización avanzada del Contenedor de Categorías
  const [catBgColor, setCatBgColor] = useState(config.qrSettings?.catBgColor || '#ffffff');
  const [catBgOpacity, setCatBgOpacity] = useState<number>(config.qrSettings?.catBgOpacity ?? 100);
  const [catBgImageUrl, setCatBgImageUrl] = useState(config.qrSettings?.catBgImageUrl || '');
  const [catBgFit, setCatBgFit] = useState<'cover' | 'contain' | 'center'>(config.qrSettings?.catBgFit || 'cover');
  const [catOverlayColor, setCatOverlayColor] = useState(config.qrSettings?.catOverlayColor || '#000000');
  const [catOverlayOpacity, setCatOverlayOpacity] = useState<number>(config.qrSettings?.catOverlayOpacity ?? 0);
  const [catTextColor, setCatTextColor] = useState(config.qrSettings?.catTextColor || '');
  const [catAutoContrast, setCatAutoContrast] = useState<boolean>(config.qrSettings?.catAutoContrast ?? true);

  useEffect(() => {
    if (isOpen) {
      setAppName(config.appName);
      setBusinessName(config.businessName);
      setBusinessAddress(config.businessAddress);
      setBusinessTaxId(config.businessTaxId);
      setBusinessPhone(config.businessPhone);
      setCurrency(config.currency);
      setDefaultTaxRate(String(config.defaultTaxRate));
      const currentLogo = config.logoUrl || config.qrSettings?.logoUrl || '';
      setLogoUrl(currentLogo);
      setAllowOrdering(config.qrSettings?.allowOrdering ?? true);
      setAllowCallWaiter(config.qrSettings?.allowCallWaiter ?? true);
      setAllowRequestBill(config.qrSettings?.allowRequestBill ?? true);
      setMenuOnlyMode(config.qrSettings?.menuOnlyMode ?? false);
      setMenuViewMode(config.qrSettings?.menuViewMode || 'medium');
      setCategories(config.categories || []);
      setBgImageUrl(config.qrSettings?.bgImageUrl || '');
      setTextColor(config.qrSettings?.textColor || '#0f172a');
      setAccentColor(config.qrSettings?.accentColor || '#e11d48');
      setQrLogoUrl(config.qrSettings?.logoUrl || currentLogo);
      setQrBannerUrl(config.qrSettings?.bannerUrl || '');

      setCardBgColor(config.qrSettings?.cardBgColor || '#ffffff');
      setCardBgOpacity(config.qrSettings?.cardBgOpacity ?? 100);
      setCardBgImageUrl(config.qrSettings?.cardBgImageUrl || '');
      setCardBgFit(config.qrSettings?.cardBgFit || 'cover');
      setCardOverlayColor(config.qrSettings?.cardOverlayColor || '#000000');
      setCardOverlayOpacity(config.qrSettings?.cardOverlayOpacity ?? 0);
      setCardTextColor(config.qrSettings?.cardTextColor || '');
      setCardAutoContrast(config.qrSettings?.cardAutoContrast ?? true);

      setCatBgColor(config.qrSettings?.catBgColor || '#ffffff');
      setCatBgOpacity(config.qrSettings?.catBgOpacity ?? 100);
      setCatBgImageUrl(config.qrSettings?.catBgImageUrl || '');
      setCatBgFit(config.qrSettings?.catBgFit || 'cover');
      setCatOverlayColor(config.qrSettings?.catOverlayColor || '#000000');
      setCatOverlayOpacity(config.qrSettings?.catOverlayOpacity ?? 0);
      setCatTextColor(config.qrSettings?.catTextColor || '');
      setCatAutoContrast(config.qrSettings?.catAutoContrast ?? true);
    }
  }, [isOpen, config]);

  const [isCompressingLogo, setIsCompressingLogo] = useState(false);
  const [isCompressingBanner, setIsCompressingBanner] = useState(false);
  const [isCompressingBg, setIsCompressingBg] = useState(false);
  const [isCompressingCardBg, setIsCompressingCardBg] = useState(false);
  const [isCompressingCatBg, setIsCompressingCatBg] = useState(false);

  const handleUploadLogo = async (file: File) => {
    try {
      setIsCompressingLogo(true);
      const compressed = await compressImageFile(file, 512, 512, 0.85, true);
      setQrLogoUrl(compressed);
      setLogoUrl(compressed);
    } catch (err) {
      console.error('Error al comprimir logo:', err);
    } finally {
      setIsCompressingLogo(false);
    }
  };

  const handleUploadBanner = async (file: File) => {
    try {
      setIsCompressingBanner(true);
      const compressed = await compressImageFile(file, 1200, 500, 0.82, false);
      setQrBannerUrl(compressed);
    } catch (err) {
      console.error('Error al comprimir banner:', err);
    } finally {
      setIsCompressingBanner(false);
    }
  };

  const handleUploadBg = async (file: File) => {
    try {
      setIsCompressingBg(true);
      const compressed = await compressImageFile(file, 1080, 1920, 0.78, false);
      setBgImageUrl(compressed);
    } catch (err) {
      console.error('Error al comprimir fondo:', err);
    } finally {
      setIsCompressingBg(false);
    }
  };

  const handleUploadCardBg = async (file: File) => {
    try {
      setIsCompressingCardBg(true);
      const compressed = await compressImageFile(file, 1080, 1080, 0.8, false);
      setCardBgImageUrl(compressed);
    } catch (err) {
      console.error('Error al comprimir fondo de tarjeta:', err);
    } finally {
      setIsCompressingCardBg(false);
    }
  };

  const handleUploadCatBg = async (file: File) => {
    try {
      setIsCompressingCatBg(true);
      const compressed = await compressImageFile(file, 1080, 500, 0.8, false);
      setCatBgImageUrl(compressed);
    } catch (err) {
      console.error('Error al comprimir fondo de categoría:', err);
    } finally {
      setIsCompressingCatBg(false);
    }
  };

  const handleResetCardStyle = () => {
    setCardBgColor('#ffffff');
    setCardBgOpacity(100);
    setCardBgImageUrl('');
    setCardBgFit('cover');
    setCardOverlayColor('#000000');
    setCardOverlayOpacity(0);
    setCardTextColor('');
    setCardAutoContrast(true);
  };

  const handleResetCatStyle = () => {
    setCatBgColor('#ffffff');
    setCatBgOpacity(100);
    setCatBgImageUrl('');
    setCatBgFit('cover');
    setCatOverlayColor('#000000');
    setCatOverlayOpacity(0);
    setCatTextColor('');
    setCatAutoContrast(true);
  };

  // Unified Team / Employee Management State
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('camarero');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [teamActionSuccess, setTeamActionSuccess] = useState<string | null>(null);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberEmail, setEditMemberEmail] = useState('');
  const [editMemberPin, setEditMemberPin] = useState('');
  const [editMemberRole, setEditMemberRole] = useState<EmpleadoRol>('Mesero');

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
    const effectiveLogo = qrLogoUrl.trim() || logoUrl.trim();
    updateConfig({
      appName: appName.trim() || 'AppGenerica',
      businessName: businessName.trim() || 'Mi Negocio',
      businessAddress: businessAddress.trim(),
      businessTaxId: businessTaxId.trim(),
      businessPhone: businessPhone.trim(),
      currency: currency.trim() || '€',
      defaultTaxRate: Number(defaultTaxRate) || 10,
      logoUrl: effectiveLogo,
      categories: categories.filter(Boolean),
      qrSettings: {
        allowOrdering: menuOnlyMode ? false : allowOrdering,
        allowCallWaiter,
        allowRequestBill,
        menuOnlyMode,
        menuViewMode,
        logoUrl: effectiveLogo,
        bannerUrl: qrBannerUrl.trim(),
        bgImageUrl: bgImageUrl.trim(),
        textColor: textColor.trim(),
        accentColor: accentColor.trim(),
        categories: categories.filter(Boolean),
        cardBgColor,
        cardBgOpacity,
        cardBgImageUrl: cardBgImageUrl.trim(),
        cardBgFit,
        cardOverlayColor,
        cardOverlayOpacity,
        cardTextColor: cardTextColor.trim(),
        cardAutoContrast,
        catBgColor,
        catBgOpacity,
        catBgImageUrl: catBgImageUrl.trim(),
        catBgFit,
        catOverlayColor,
        catOverlayOpacity,
        catTextColor: catTextColor.trim(),
        catAutoContrast
      },
      comandaPrintSettings: {
        enabled: comandaPrintEnabled,
        paperWidth: comandaPaperWidth
      }
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleUpdateComandaPrintSettings = (
    nextEnabled: boolean,
    nextPaperWidth: ComandaPaperWidth
  ) => {
    setComandaPrintEnabled(nextEnabled);
    setComandaPaperWidth(nextPaperWidth);
    updateConfig({
      comandaPrintSettings: {
        enabled: nextEnabled,
        paperWidth: nextPaperWidth,
      },
    });
    setPrintConfigSavedMsg('Configuración de impresión guardada para este restaurante.');
    setTimeout(() => setPrintConfigSavedMsg(null), 2400);
  };

  const handlePrintTestComanda = () => {
    const sample = buildSampleComandaTicketData(businessName || config.businessName, {
      isReprint: previewSampleReprint,
    });
    flushSync(() => {
      setTestPrintTicket(sample);
    });
    triggerComandaBrowserPrint(comandaPaperWidth);
  };

  const handleReset = () => {
    if (confirm('¿Restablecer todas las mesas, productos y ventas a los datos iniciales de demostración?')) {
      resetToDemoData();
      onClose();
    }
  };

  const showTeamSuccess = (msg: string) => {
    setTeamActionError(null);
    setTeamActionSuccess(msg);
    setTimeout(() => setTeamActionSuccess(null), 3200);
  };

  const showTeamError = (msg: string) => {
    setTeamActionSuccess(null);
    setTeamActionError(msg);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingTeam) return;
    if (!newMemberName.trim()) {
      showTeamError('El nombre del empleado es obligatorio.');
      return;
    }

    const mappedRol = mapUserRoleToEmpleadoRol(newMemberRole);
    setIsSubmittingTeam(true);
    setTeamActionError(null);
    const res = await crearEmpleado({
      nombre: newMemberName.trim(),
      email: newMemberEmail.trim(),
      rol: mappedRol,
      activo: true,
      pin: newMemberPin.trim(),
      avatarColor: getDefaultAvatarColorForRole(mappedRol),
    });
    setIsSubmittingTeam(false);

    if (res.success) {
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPin('');
      setNewMemberRole('camarero');
      showTeamSuccess('Empleado creado y sincronizado con Firebase y el selector de perfiles.');
    } else {
      showTeamError(res.error || 'No se pudo agregar el empleado.');
    }
  };

  const handleRoleChange = async (memberId: string, role: UserRole) => {
    const mappedRol = mapUserRoleToEmpleadoRol(role);
    const res = await actualizarEmpleado(memberId, { rol: mappedRol });
    if (res.success) {
      showTeamSuccess('Rol y permisos actualizados en tiempo real.');
    } else {
      showTeamError(res.error || 'No se pudo actualizar el rol.');
    }
  };

  const handleToggleMemberActivo = async (emp: Empleado) => {
    const nextActivo = emp.activo === false;
    if (!nextActivo && !confirm(`¿Desactivar a "${emp.nombre}"? No podrá iniciar sesión ni operar hasta que lo reactives.`)) {
      return;
    }
    const res = await toggleEmpleadoActivo(emp.id, nextActivo);
    if (res.success) {
      showTeamSuccess(
        nextActivo
          ? `"${emp.nombre}" fue reactivado correctamente.`
          : `"${emp.nombre}" fue desactivado y bloqueado de la operación.`
      );
    } else {
      showTeamError(res.error || 'No se pudo cambiar el estado del empleado.');
    }
  };

  const handleStartEditMember = (emp: Empleado) => {
    setEditingMemberId(emp.id);
    setEditMemberName(emp.nombre);
    setEditMemberEmail(emp.email || '');
    setEditMemberPin(emp.pin || '');
    setEditMemberRole(emp.rol);
    setTeamActionError(null);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemberId || isSubmittingTeam) return;
    setIsSubmittingTeam(true);
    const res = await actualizarEmpleado(editingMemberId, {
      nombre: editMemberName.trim(),
      email: editMemberEmail.trim(),
      pin: editMemberPin.trim(),
      rol: editMemberRole,
    });
    setIsSubmittingTeam(false);
    if (res.success) {
      setEditingMemberId(null);
      showTeamSuccess('Datos del empleado actualizados correctamente.');
    } else {
      showTeamError(res.error || 'Error al guardar los cambios del empleado.');
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (memberId === empleadoActivo?.id) {
      showTeamError('No puedes eliminar el perfil de empleado que tienes activo en este momento.');
      return;
    }
    if (confirm(`¿Eliminar a ${memberName} del equipo? Ya no tendrá acceso al sistema.`)) {
      const res = await eliminarEmpleado(memberId);
      if (res.success) {
        if (editingMemberId === memberId) setEditingMemberId(null);
        showTeamSuccess(`Se eliminó a ${memberName} del equipo.`);
      } else {
        showTeamError(res.error || 'No se pudo eliminar el empleado.');
      }
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
        <div className="px-6 pt-3 pb-0 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
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
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'qr'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Carta QR & Temas Visuales</span>
            <span className="px-1.5 py-0.2 rounded-md bg-stone-100 dark:bg-stone-800 text-rose-900 dark:text-rose-300 text-[10px] font-extrabold border border-stone-200 dark:border-stone-700">
              Temas
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('print')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'print'
                ? 'border-rose-900 text-rose-950 dark:text-rose-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Impresión de comandas</span>
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
              {empleados.length}
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
                {logoUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl('');
                      setQrLogoUrl('');
                    }}
                    className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                  >
                    Quitar logo
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-md overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs bg-white dark:bg-slate-900 shrink-0 flex items-center justify-center p-0.5">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo actual"
                      className="w-full h-full object-contain rounded-md"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 text-center">
                      <Store className="w-6 h-6 stroke-[1.5]" />
                      <span className="text-[9px] mt-0.5 font-medium">Sin logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 hover:bg-stone-200 dark:hover:bg-stone-800 font-bold text-xs cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                      <span>{isCompressingLogo ? 'Optimizando...' : 'Subir archivo de logo'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        disabled={isCompressingLogo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadLogo(file);
                        }}
                      />
                    </label>
                    <span className="text-[10px] text-slate-400">PNG, JPG o WebP (auto-comprimido)</span>
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
                  Dirección del Local (Tickets y Pedidos a Proveedores)
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

            {/* === SECCIÓN REQUERIDA: Personalización del Menú QR === */}
            <div className="space-y-5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-300 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Personalización del Menú QR
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Configura la identidad visual propia de tu restaurante para la carta digital que verán tus comensales al escanear el QR.
                    </p>
                  </div>
                </div>
              </div>

              {/* A. Logo del restaurante */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>A. Logo del restaurante</span>
                    </h4>
                    <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <p className="font-bold text-slate-700 dark:text-slate-300">
                        Dimensiones recomendadas: 512 × 512 píxeles (1:1 Cuadrada).
                      </p>
                      <p>
                        • Formatos PNG (transparente), JPG o WebP • Compresión inteligente automática para carga instantánea en móviles.
                      </p>
                    </div>
                  </div>
                  {qrLogoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setQrLogoUrl('');
                        setLogoUrl('');
                      }}
                      className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer shrink-0"
                    >
                      Eliminar logo
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3.5 pt-1">
                  {/* Vista Previa Logo 1:1 */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0 flex items-center justify-center p-1 relative shadow-inner">
                    {qrLogoUrl ? (
                      <img
                        src={qrLogoUrl}
                        alt="Vista previa logo"
                        className="w-full h-full object-contain rounded-lg"
                        onError={() => {
                          setQrLogoUrl('');
                        }}
                      />
                    ) : (
                      <div className="text-center p-1">
                        <Store className="w-6 h-6 text-slate-400 mx-auto mb-0.5" />
                        <span className="text-[9px] text-slate-400 font-bold block leading-tight">Sin logo</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700 font-bold text-xs cursor-pointer transition shadow-xs">
                        <Upload className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                        <span>{isCompressingLogo ? 'Optimizando...' : qrLogoUrl ? 'Reemplazar logo' : 'Subir logo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          disabled={isCompressingLogo}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadLogo(file);
                          }}
                        />
                      </label>
                      <span className="text-[10px] text-slate-400 hidden sm:inline">512 × 512 px</span>
                    </div>

                    <input
                      type="text"
                      value={qrLogoUrl}
                      onChange={(e) => {
                        setQrLogoUrl(e.target.value);
                        setLogoUrl(e.target.value);
                      }}
                      placeholder="O introduce una URL de logo (https://...)"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                    />
                  </div>
                </div>
              </div>

              {/* B. Banner del restaurante */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>B. Banner del restaurante (Cabecera panorámica)</span>
                    </h4>
                    <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <p className="font-bold text-slate-700 dark:text-slate-300">
                        Dimensiones recomendadas: 1200 × 500 píxeles (~2.4:1 Panorámica).
                      </p>
                      <p>
                        • Formatos JPG, PNG o WebP • Ajuste visual armónico para pantallas móviles sin deformar tu fotografía • Auto-optimizado en la nube.
                      </p>
                    </div>
                  </div>
                  {qrBannerUrl && (
                    <button
                      type="button"
                      onClick={() => setQrBannerUrl('')}
                      className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer shrink-0"
                    >
                      Eliminar banner
                    </button>
                  )}
                </div>

                {/* Vista Previa Banner Panorámica */}
                <div className="space-y-2">
                  <div className="w-full h-24 sm:h-28 rounded-xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 relative flex items-center justify-center shadow-inner">
                    {qrBannerUrl ? (
                      <div className="w-full h-full relative group">
                        <img
                          src={qrBannerUrl}
                          alt="Vista previa banner"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-bold px-3 py-1 rounded-md bg-black/60">
                            Vista previa cabecera
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-3 text-slate-400">
                        <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-70" />
                        <span className="text-[11px] font-semibold block">Sin banner horizontal configurado</span>
                        <span className="text-[10px] opacity-75">Se mostrará una cabecera minimalista y elegante sin espacios vacíos</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <label className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700 font-bold text-xs cursor-pointer transition shadow-xs">
                      <Upload className="w-3.5 h-3.5 text-stone-700 dark:text-stone-300" />
                      <span>{isCompressingBanner ? 'Optimizando...' : qrBannerUrl ? 'Reemplazar banner' : 'Subir imagen de banner'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isCompressingBanner}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadBanner(file);
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      value={qrBannerUrl}
                      onChange={(e) => setQrBannerUrl(e.target.value)}
                      placeholder="O introduce URL del banner (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                    />
                  </div>
                </div>
              </div>

              {/* C. Colores del restaurante */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                    <span>C. Colores del restaurante</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Personaliza el color principal de tu marca. Se aplica directamente a los botones de acción, categorías seleccionadas, precios e indicadores.
                  </p>
                </div>

                {/* Paleta rápida de colores gastronómicos */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Paleta de estilos gastronómicos recomendados:
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { name: 'Vino Tinto', color: '#881337' },
                      { name: 'Rubí Pasión', color: '#e11d48' },
                      { name: 'Ámbar Cálido', color: '#d97706' },
                      { name: 'Esmeralda', color: '#059669' },
                      { name: 'Índigo Bar', color: '#4f46e5' },
                      { name: 'Carbón Luxe', color: '#18181b' }
                    ].map((palette) => (
                      <button
                        key={palette.color}
                        type="button"
                        onClick={() => setAccentColor(palette.color)}
                        className={`p-2 rounded-lg border text-left transition flex items-center gap-2 cursor-pointer ${
                          accentColor.toLowerCase() === palette.color.toLowerCase()
                            ? 'border-slate-900 dark:border-white ring-2 ring-slate-900/30 font-bold bg-slate-50 dark:bg-slate-800'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0 shadow-xs border border-black/10"
                          style={{ backgroundColor: palette.color }}
                        />
                        <span className="text-[10px] truncate text-slate-800 dark:text-slate-200">
                          {palette.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector fino de color de acento y texto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color Principal / Acento (Botones, Selección y Precios)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor || '#e11d48'}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={accentColor || '#e11d48'}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="#e11d48"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs text-center bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color de Texto de la Carta
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={textColor || '#0f172a'}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={textColor || '#0f172a'}
                        onChange={(e) => setTextColor(e.target.value)}
                        placeholder="#0f172a"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs text-center bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Fondo opcional de la carta */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Imagen de Fondo Opcional para la Pantalla (Wallpaper móvil)
                    </label>
                    {bgImageUrl && (
                      <button
                        type="button"
                        onClick={() => setBgImageUrl('')}
                        className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Quitar fondo
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 text-xs font-bold cursor-pointer hover:bg-stone-200 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isCompressingBg ? 'Optimizando...' : 'Subir fondo'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isCompressingBg}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadBg(file);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={bgImageUrl}
                      onChange={(e) => setBgImageUrl(e.target.value)}
                      placeholder="O URL de fondo (1080 × 1920 px)..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>

              </div>

              {/* === SECCIÓN A: APARIENCIA DE TARJETAS DE PRODUCTOS === */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                      <span>Sección A: Apariencia de Tarjetas de Productos</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Personaliza el fondo, transparencia, imágenes y texto de los cuadros de productos en el menú QR.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCardStyle}
                    className="text-[10px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-bold underline cursor-pointer shrink-0"
                  >
                    Restablecer tarjetas
                  </button>
                </div>

                {/* Color de fondo & Opacidad */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color de Fondo (HEX)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={cardBgColor || '#ffffff'}
                        onChange={(e) => setCardBgColor(e.target.value)}
                        className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={cardBgColor}
                        onChange={(e) => setCardBgColor(e.target.value)}
                        placeholder="#ffffff"
                        className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Transparencia del Fondo
                      </label>
                      <span className="text-[11px] font-mono font-bold text-rose-950 dark:text-rose-300">
                        {cardBgOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={cardBgOpacity}
                      onChange={(e) => setCardBgOpacity(Number(e.target.value))}
                      className="w-full accent-rose-900 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Imagen de Fondo de Tarjeta */}
                <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      Imagen de Fondo de las Tarjetas
                    </label>
                    {cardBgImageUrl && (
                      <button
                        type="button"
                        onClick={() => setCardBgImageUrl('')}
                        className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 font-bold text-xs cursor-pointer hover:bg-stone-200 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isCompressingCardBg ? 'Optimizando...' : 'Subir imagen'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isCompressingCardBg}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadCardBg(file);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={cardBgImageUrl}
                      onChange={(e) => setCardBgImageUrl(e.target.value)}
                      placeholder="O URL de imagen (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  {cardBgImageUrl && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Ajuste de Imagen:
                      </span>
                      <div className="flex gap-1">
                        {(['cover', 'contain', 'center'] as const).map((fit) => (
                          <button
                            key={fit}
                            type="button"
                            onClick={() => setCardBgFit(fit)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold capitalize transition cursor-pointer ${
                              cardBgFit === fit
                                ? 'bg-rose-950 text-white'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {fit === 'cover' ? 'Cubrir' : fit === 'contain' ? 'Contener' : 'Centrar'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Superposición (Overlay) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color de Superposición
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={cardOverlayColor || '#000000'}
                        onChange={(e) => setCardOverlayColor(e.target.value)}
                        className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={cardOverlayColor}
                        onChange={(e) => setCardOverlayColor(e.target.value)}
                        placeholder="#000000"
                        className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Opacidad de Superposición
                      </label>
                      <span className="text-[11px] font-mono font-bold text-rose-950 dark:text-rose-300">
                        {cardOverlayOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={cardOverlayOpacity}
                      onChange={(e) => setCardOverlayOpacity(Number(e.target.value))}
                      className="w-full accent-rose-900 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Color de Texto y Auto-contraste */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      Auto-contraste inteligente de texto (Recomendado)
                    </label>
                    <input
                      type="checkbox"
                      checked={cardAutoContrast}
                      onChange={(e) => {
                        setCardAutoContrast(e.target.checked);
                        if (e.target.checked) setCardTextColor('');
                      }}
                      className="w-4 h-4 accent-rose-900 cursor-pointer"
                    />
                  </div>

                  {!cardAutoContrast && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                        Color Manual de Texto de la Tarjeta
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={cardTextColor || '#0f172a'}
                          onChange={(e) => setCardTextColor(e.target.value)}
                          className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                        />
                        <input
                          type="text"
                          value={cardTextColor}
                          onChange={(e) => setCardTextColor(e.target.value)}
                          placeholder="#0f172a"
                          className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Interactive Preview Box para Tarjetas */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 block">
                    Vista Previa Interactiva en Tiempo Real (Tarjeta de producto):
                  </span>
                  {(() => {
                    const sampleStyle = computeCustomContainerStyle({
                      bgColor: cardBgColor,
                      bgOpacity: cardBgOpacity,
                      bgImageUrl: cardBgImageUrl,
                      bgFit: cardBgFit,
                      overlayColor: cardOverlayColor,
                      overlayOpacity: cardOverlayOpacity,
                      textColor: cardTextColor,
                      autoContrast: cardAutoContrast
                    });
                    return (
                      <div
                        style={sampleStyle.containerStyle}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex items-center justify-between gap-3 min-h-[90px]"
                      >
                        {sampleStyle.overlayStyle && <div style={sampleStyle.overlayStyle} />}
                        <div className="relative z-10 flex items-center gap-3 min-w-0">
                          <div className="w-14 h-14 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0 overflow-hidden border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                            <Utensils className="w-6 h-6 text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-xs truncate" style={{ color: sampleStyle.computedTextColor }}>
                              Hamburguesa Gourmet Doble
                            </h5>
                            <p className="text-[10px] opacity-80 line-clamp-1 mt-0.5" style={{ color: sampleStyle.computedTextColor }}>
                              Carne angus, queso cheddar derretido y tocineta crujiente.
                            </p>
                            <span className="font-mono font-black text-xs block mt-1" style={{ color: accentColor }}>
                              $32.000 COP
                            </span>
                          </div>
                        </div>
                        <div className="relative z-10 shrink-0">
                          <span
                            className="px-3 py-1 rounded-xl text-white font-extrabold text-[11px] shadow-xs"
                            style={{ backgroundColor: accentColor }}
                          >
                            Añadir
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* === SECCIÓN B: APARIENCIA DEL CONTENEDOR DE CATEGORÍAS === */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                      <span>Sección B: Apariencia del Contenedor de Categorías</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Personaliza el contenedor donde aparecen el título de la categoría activa, el conteo de productos y los botones de vista.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCatStyle}
                    className="text-[10px] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-bold underline cursor-pointer shrink-0"
                  >
                    Restablecer contenedor
                  </button>
                </div>

                {/* Color de fondo & Opacidad */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color de Fondo del Contenedor
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={catBgColor || '#ffffff'}
                        onChange={(e) => setCatBgColor(e.target.value)}
                        className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={catBgColor}
                        onChange={(e) => setCatBgColor(e.target.value)}
                        placeholder="#ffffff"
                        className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Transparencia del Contenedor
                      </label>
                      <span className="text-[11px] font-mono font-bold text-rose-950 dark:text-rose-300">
                        {catBgOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={catBgOpacity}
                      onChange={(e) => setCatBgOpacity(Number(e.target.value))}
                      className="w-full accent-rose-900 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Imagen de Fondo de Contenedor */}
                <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      Imagen de Fondo del Contenedor
                    </label>
                    {catBgImageUrl && (
                      <button
                        type="button"
                        onClick={() => setCatBgImageUrl('')}
                        className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 font-bold text-xs cursor-pointer hover:bg-stone-200 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isCompressingCatBg ? 'Optimizando...' : 'Subir imagen'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isCompressingCatBg}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadCatBg(file);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={catBgImageUrl}
                      onChange={(e) => setCatBgImageUrl(e.target.value)}
                      placeholder="O URL de imagen (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  {catBgImageUrl && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Ajuste de Imagen:
                      </span>
                      <div className="flex gap-1">
                        {(['cover', 'contain', 'center'] as const).map((fit) => (
                          <button
                            key={fit}
                            type="button"
                            onClick={() => setCatBgFit(fit)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold capitalize transition cursor-pointer ${
                              catBgFit === fit
                                ? 'bg-rose-950 text-white'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {fit === 'cover' ? 'Cubrir' : fit === 'contain' ? 'Contener' : 'Centrar'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Superposición (Overlay) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Color de Superposición
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={catOverlayColor || '#000000'}
                        onChange={(e) => setCatOverlayColor(e.target.value)}
                        className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={catOverlayColor}
                        onChange={(e) => setCatOverlayColor(e.target.value)}
                        placeholder="#000000"
                        className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Opacidad de Superposición
                      </label>
                      <span className="text-[11px] font-mono font-bold text-rose-950 dark:text-rose-300">
                        {catOverlayOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={catOverlayOpacity}
                      onChange={(e) => setCatOverlayOpacity(Number(e.target.value))}
                      className="w-full accent-rose-900 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Color de Texto y Auto-contraste */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      Auto-contraste inteligente de texto (Recomendado)
                    </label>
                    <input
                      type="checkbox"
                      checked={catAutoContrast}
                      onChange={(e) => {
                        setCatAutoContrast(e.target.checked);
                        if (e.target.checked) setCatTextColor('');
                      }}
                      className="w-4 h-4 accent-rose-900 cursor-pointer"
                    />
                  </div>

                  {!catAutoContrast && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-1">
                        Color Manual de Texto del Contenedor
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={catTextColor || '#0f172a'}
                          onChange={(e) => setCatTextColor(e.target.value)}
                          className="w-8 h-8 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer p-0 bg-transparent shrink-0"
                        />
                        <input
                          type="text"
                          value={catTextColor}
                          onChange={(e) => setCatTextColor(e.target.value)}
                          placeholder="#0f172a"
                          className="w-full px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Interactive Preview Box para Contenedor de Categorías */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 block">
                    Vista Previa Interactiva en Tiempo Real (Contenedor de Categorías):
                  </span>
                  {(() => {
                    const sampleCatStyle = computeCustomContainerStyle({
                      bgColor: catBgColor,
                      bgOpacity: catBgOpacity,
                      bgImageUrl: catBgImageUrl,
                      bgFit: catBgFit,
                      overlayColor: catOverlayColor,
                      overlayOpacity: catOverlayOpacity,
                      textColor: catTextColor,
                      autoContrast: catAutoContrast
                    });
                    return (
                      <div
                        style={sampleCatStyle.containerStyle}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex items-center justify-between flex-wrap gap-2"
                      >
                        {sampleCatStyle.overlayStyle && <div style={sampleCatStyle.overlayStyle} />}
                        <h4
                          className="font-extrabold text-xs sm:text-sm flex items-center gap-2 relative z-10"
                          style={{ color: sampleCatStyle.computedTextColor }}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                          <span>Platos Principales</span>
                          <span className="text-[10px] font-medium bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full">
                            12 productos
                          </span>
                        </h4>
                        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-xl relative z-10 text-[10px]">
                          <span className="px-2 py-1 rounded-lg font-bold text-white shadow-xs" style={{ backgroundColor: accentColor }}>
                            Mediano
                          </span>
                          <span className="px-2 py-1 rounded-lg opacity-70">
                            Lista
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Formato de Visualización Inicial (Modo de Vista) */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                  Formato de Visualización Inicial para el Cliente
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Elige cómo se verán los productos al abrir la carta QR (el cliente también podrá cambiarlo en su pantalla):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'list', name: 'Lista', desc: 'Compacto en filas ordenadas' },
                  { id: 'medium', name: 'Mediano', desc: 'Tarjetas estándar con fotos' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setMenuViewMode(mode.id as any)}
                    className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
                      menuViewMode === mode.id
                        ? 'border-rose-900 ring-2 ring-rose-900/40 bg-rose-50/20 dark:bg-slate-800 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{mode.name}</span>
                    <span className="text-[10px] text-slate-500 mt-1">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gestión y Eliminación de Categorías */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                  Categorías de la Carta Digital (Añadir / Eliminar no utilizadas)
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Organiza las categorías que aparecen en la carta QR. Puedes eliminar las que no utilices y crear nuevas:
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nueva categoría (ej. Coctelería Artesanal)..."
                  className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newCategoryName.trim();
                    if (!trimmed) return;
                    if (categories.includes(trimmed)) {
                      alert('Esta categoría ya existe.');
                      return;
                    }
                    setCategories([...categories, trimmed]);
                    setNewCategoryName('');
                  }}
                  className="px-4 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs cursor-pointer whitespace-nowrap"
                >
                  Añadir
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800">
                {categories.map((cat) => (
                  <div
                    key={cat}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs"
                  >
                    <span>{cat}</span>
                    {cat !== 'Todas las categorías' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar la categoría "${cat}"?`)) {
                            setCategories(categories.filter(c => c !== cat));
                          }
                        }}
                        title="Eliminar categoría"
                        className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
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
        ) : activeTab === 'print' ? (
          /* === TAB: IMPRESIÓN MANUAL DE COMANDAS === */
          <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
            {printConfigSavedMsg && (
              <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-900">
                <Check className="w-4 h-4 shrink-0" />
                <span>{printConfigSavedMsg}</span>
              </div>
            )}

            {/* Encabezado informativo */}
            <div className="p-4 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Printer className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                <span>Impresión de comandas</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Permite a los empleados autorizados imprimir manualmente tickets de preparación desde computadores o celulares usando el cuadro de impresión del navegador. No altera inventario, ventas ni el estado de la mesa.
              </p>
            </div>

            {/* 1. Activar o desactivar la función */}
            <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="font-bold text-slate-900 dark:text-white text-xs">
                  Activar botón "Imprimir comanda" en mesas
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Muestra el botón de impresión manual dentro del detalle de comanda para roles con acceso a mesas y pedidos.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={comandaPrintEnabled}
                  onChange={(e) => handleUpdateComandaPrintSettings(e.target.checked, comandaPaperWidth)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-950"></div>
              </label>
            </div>

            {/* 2. Selector de ancho de papel térmico */}
            <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-xs">
                  Ancho de papel térmico
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Selecciona el formato que utiliza tu impresora térmica de cocina o barra.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {([
                  {
                    width: '58mm' as ComandaPaperWidth,
                    title: 'Papel 58 mm',
                    desc: 'Impresoras térmicas portátiles o mini (Bluetooth / USB / Wi-Fi compatibles con el sistema).'
                  },
                  {
                    width: '80mm' as ComandaPaperWidth,
                    title: 'Papel 80 mm',
                    desc: 'Impresoras térmicas estándar de mostrador y cocina.'
                  }
                ]).map((opt) => {
                  const isSelected = comandaPaperWidth === opt.width;
                  return (
                    <button
                      key={opt.width}
                      type="button"
                      onClick={() => handleUpdateComandaPrintSettings(comandaPrintEnabled, opt.width)}
                      className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'border-rose-900 ring-2 ring-rose-900/30 bg-rose-50/30 dark:bg-slate-800'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-slate-50/50 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                          {opt.title}
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-950 text-white text-[10px] font-bold">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Vista previa del ticket + Imprimir ticket de prueba */}
            <div className="p-4 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">
                    Vista previa del ticket ({comandaPaperWidth})
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Alto contraste negro sobre blanco, sin precios ni impuestos.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={previewSampleReprint}
                      onChange={(e) => setPreviewSampleReprint(e.target.checked)}
                      className="w-3.5 h-3.5 accent-rose-900 cursor-pointer"
                    />
                    <span>Ver etiqueta REIMPRESIÓN</span>
                  </label>

                  <button
                    type="button"
                    onClick={handlePrintTestComanda}
                    className="px-3.5 py-1.5 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir ticket de prueba</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-md bg-slate-200/80 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 overflow-x-auto flex justify-center">
                <div className="shadow-md border border-slate-300">
                  <ComandaTicketView
                    data={buildSampleComandaTicketData(businessName || config.businessName, {
                      isReprint: previewSampleReprint,
                    })}
                    paperWidth={comandaPaperWidth}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Compatibilidad: utiliza la función de impresión del navegador en Windows, macOS, Android e iOS según las impresoras instaladas o vinculadas en el dispositivo. En el cuadro del sistema, desactiva encabezados/pies de página del navegador y ajusta los márgenes a "Ninguno" para un corte térmico limpio.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-md bg-rose-950 hover:bg-rose-900 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        ) : activeTab === 'team' ? (
          /* === TAB 2: PERSONAL & ROLES (RBAC UNIFICADO CON FIRESTORE) === */
          <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">

            {teamActionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 border border-emerald-200 dark:border-emerald-900 animate-in fade-in">
                <Check className="w-4 h-4 shrink-0" />
                <span>{teamActionSuccess}</span>
              </div>
            )}

            {teamActionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2 border border-rose-200 dark:border-rose-900 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{teamActionError}</span>
              </div>
            )}

            {/* Guía Clara de Control de Acceso unificada */}
            <div className="p-4 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                  <ShieldCheck className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  <span>Esquema Unificado de Permisos y Perfiles POS</span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sincronizado con el selector de perfiles en tiempo real</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-rose-950 dark:text-rose-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin / Gerente</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Control Total</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Mesas, carta, despensa, ventas, facturación y personal.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Cajero</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Mesas y Cobro</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Vista de mesas, comandas y cobro de cuentas.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    <span>Mesero / Camarero</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Mesas y Pedidos</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Abrir mesas y tomar comandas en salón.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                    <Wine className="w-3.5 h-3.5" />
                    <span>Barman</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Barra y Pedidos</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Pedidos de bebidas y despacho de barra.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Contabilidad</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Solo Informes</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    Historial de ventas y facturación contable.
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
                <span className="text-[10px] text-slate-400 font-medium">Se guarda en Firebase y aparece en Perfiles</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nombre * (ej. Mariana López)"
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />

                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="Email (opcional)"
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />

                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                >
                  <option value="cajero">Cajero (Mesas y Cobro)</option>
                  <option value="camarero">Mesero / Camarero (Mesas y Pedidos)</option>
                  <option value="barman">Barman (Barra y Bebidas)</option>
                  <option value="contabilidad">Contabilidad (Historial y Facturación)</option>
                  <option value="gerente">Admin / Gerente (Control Total)</option>
                </select>

                <input
                  type="password"
                  maxLength={6}
                  value={newMemberPin}
                  onChange={(e) => setNewMemberPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN 4-6 dígitos (opcional)"
                  className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono tracking-wider focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingTeam || !newMemberName.trim()}
                  className="px-4 py-2 rounded-md bg-rose-900 hover:bg-rose-800 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isSubmittingTeam ? 'Guardando...' : 'Agregar al Equipo'}</span>
                </button>
              </div>
            </form>

            {/* Lista del Personal Actual (Sincronizada con Firestore) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                  Miembros del Equipo ({empleados.length})
                </h3>
                <span className="text-[11px] text-slate-500">
                  {empleados.filter(e => e.activo !== false).length} activos · {empleados.filter(e => e.activo === false).length} desactivados
                </span>
              </div>

              <div className="space-y-2">
                {empleados.map((emp) => {
                  const mappedUserRole = mapEmpleadoRolToUserRole(emp.rol);
                  const isCurrentLogged = emp.id === empleadoActivo?.id;
                  const isActivo = emp.activo !== false;
                  const hasPin = Boolean(emp.pin && emp.pin.trim().length > 0);
                  const isRowEditing = editingMemberId === emp.id;

                  return (
                    <div
                      key={emp.id}
                      className={`p-3 rounded-md border shadow-xs space-y-2.5 ${
                        !isActivo
                          ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
                          : isCurrentLogged
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-900/40 dark:border-rose-900/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-rose-950 text-white flex items-center justify-center font-black text-xs border border-stone-700 shrink-0">
                            {emp.nombre.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                                {emp.nombre}
                              </span>
                              {isCurrentLogged && (
                                <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-rose-950 text-rose-100">
                                  Tú (Activo)
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md border ${
                                  isActivo
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                                }`}
                              >
                                {isActivo ? 'Activo' : 'Desactivado'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span>{emp.email || 'Perfil POS (sin correo)'}</span>
                              </span>
                              <span>·</span>
                              {hasPin ? (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                  <Lock className="w-3 h-3" />
                                  <span>PIN configurado</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <Unlock className="w-3 h-3" />
                                  <span>Acceso directo</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap">
                          <select
                            value={mappedUserRole}
                            onChange={(e) => handleRoleChange(emp.id, e.target.value as UserRole)}
                            className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-rose-900"
                          >
                            <option value="gerente">Admin / Gerente (Control Total)</option>
                            <option value="cajero">Cajero (Mesas y Cobro)</option>
                            <option value="camarero">Mesero / Camarero (Mesas y Pedidos)</option>
                            <option value="barman">Barman (Barra)</option>
                            <option value="contabilidad">Contabilidad (Informes)</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => isRowEditing ? setEditingMemberId(null) : handleStartEditMember(emp)}
                            title="Editar nombre, correo y PIN"
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleMemberActivo(emp)}
                            title={isActivo ? 'Desactivar empleado (bloquear acceso)' : 'Reactivar empleado'}
                            className={`p-1.5 rounded-md transition cursor-pointer ${
                              isActivo
                                ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>

                          {!isCurrentLogged && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(emp.id, emp.nombre)}
                              title="Eliminar empleado"
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isRowEditing && (
                        <form
                          onSubmit={handleSaveEditMember}
                          className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
                        >
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Nombre *</label>
                            <input
                              type="text"
                              required
                              value={editMemberName}
                              onChange={(e) => setEditMemberName(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Correo (opcional)</label>
                            <input
                              type="email"
                              value={editMemberEmail}
                              onChange={(e) => setEditMemberEmail(e.target.value)}
                              placeholder="correo@ejemplo.com"
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">PIN (4-6 dígitos, vacío = sin PIN)</label>
                            <input
                              type="password"
                              maxLength={6}
                              value={editMemberPin}
                              onChange={(e) => setEditMemberPin(e.target.value.replace(/\D/g, ''))}
                              placeholder="Sin PIN"
                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingMemberId(null)}
                              className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingTeam}
                              className="px-3 py-1.5 rounded-md bg-rose-950 hover:bg-rose-900 text-white text-xs font-bold cursor-pointer disabled:opacity-40"
                            >
                              Guardar
                            </button>
                          </div>
                        </form>
                      )}
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

      {/* Portal de impresión térmica para ticket de prueba */}
      <ComandaPrintPortal
        data={testPrintTicket}
        paperWidth={comandaPaperWidth}
      />
    </div>
  );
};
