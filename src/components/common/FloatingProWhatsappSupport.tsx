import React, { useState, useMemo, useEffect } from 'react';
import {
  MessageCircle,
  X,
  Wrench,
  HelpCircle,
  CreditCard,
  Lightbulb,
  MessageSquarePlus,
  Send,
  Copy,
  Check
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { defaultAppConfig } from '../../config/appConfig';

const SUPPORT_PHONE_LOCAL = '3178256651';
const SUPPORT_PHONE_WA = '573178256651';

interface SupportTopicOption {
  id: string;
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
}

const SUPPORT_TOPICS: SupportTopicOption[] = [
  {
    id: 'problema_tecnico',
    label: 'Resolver un problema o falla técnica',
    hint: 'Error en mesas, cobros, pedidos QR o sincronización',
    icon: Wrench
  },
  {
    id: 'duda_uso',
    label: 'Duda sobre cómo usar una función',
    hint: 'Mesas, inventario, despensa, proveedores o perfiles',
    icon: HelpCircle
  },
  {
    id: 'suscripcion_pagos',
    label: 'Consulta sobre mi suscripción o pago',
    hint: 'Renovación, facturación o cambio de ciclo PRO',
    icon: CreditCard
  },
  {
    id: 'peticion_mejora',
    label: 'Hacer una petición o sugerir mejora',
    hint: 'Solicitar una herramienta o ajuste para tu negocio',
    icon: Lightbulb
  },
  {
    id: 'otro_tema',
    label: 'Otro tema o consulta directa',
    hint: 'Hablar directamente con soporte prioritario',
    icon: MessageSquarePlus
  }
];

export const FloatingProWhatsappSupport: React.FC = () => {
  const { user, hasActivePaidSubscription, empleadoActivo } = useAuth();
  const { config, tables, selectedTableId } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>(SUPPORT_TOPICS[0].id);
  const [extraDetails, setExtraDetails] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Cerrar el panel inmediatamente si la suscripción expira o pasa a gratuita
  useEffect(() => {
    if (!hasActivePaidSubscription && isOpen) {
      setIsOpen(false);
    }
  }, [hasActivePaidSubscription, isOpen]);

  const businessName = useMemo(() => {
    if (user?.businessName && user.businessName.trim()) {
      return user.businessName.trim();
    }
    if (config.businessName && config.businessName !== defaultAppConfig.businessName) {
      return config.businessName.trim();
    }
    return config.businessName || 'Mi Local';
  }, [user?.businessName, config.businessName]);

  const businessAddress = useMemo(() => {
    if (user?.businessAddress && user.businessAddress.trim()) {
      return user.businessAddress.trim();
    }
    if (config.businessAddress && config.businessAddress !== defaultAppConfig.businessAddress) {
      return config.businessAddress.trim();
    }
    return '';
  }, [user?.businessAddress, config.businessAddress]);

  const selectedTopic = useMemo(() => {
    return SUPPORT_TOPICS.find((t) => t.id === selectedTopicId) || SUPPORT_TOPICS[0];
  }, [selectedTopicId]);

  const formattedMessage = useMemo(() => {
    const lines: string[] = [
      'Hola soporte PRO, necesito ayuda con mi cuenta activa:',
      '',
      `*Motivo:* ${selectedTopic.label}`,
      `*Local:* ${businessName}`
    ];

    if (businessAddress) {
      lines.push(`*Dirección:* ${businessAddress}`);
    }

    if (user?.email) {
      const contactDisplay = empleadoActivo?.nombre
        ? `${empleadoActivo.nombre} (${user.email})`
        : `${user.name || 'Administrador'} (${user.email})`;
      lines.push(`*Cuenta PRO:* ${contactDisplay}`);
    }

    const cleanDetails = extraDetails.trim();
    if (cleanDetails) {
      lines.push('', '*Detalles adicionales:*', cleanDetails);
    }

    return lines.join('\n');
  }, [selectedTopic, businessName, businessAddress, user?.email, user?.name, empleadoActivo?.nombre, extraDetails]);

  const whatsappHref = useMemo(() => {
    return `https://wa.me/${SUPPORT_PHONE_WA}?text=${encodeURIComponent(formattedMessage)}`;
  }, [formattedMessage]);

  const hasActiveWaiterAlert = useMemo(() => {
    return tables.some((t) => t.waiterCall !== null && t.waiterCall !== undefined);
  }, [tables]);

  // Exclusivo para suscripción paga activa: las cuentas gratis o vencidas no ven el botón
  if (!hasActivePaidSubscription) {
    return null;
  }

  // Evitar superposición cuando está abierto el panel de cobro/comanda de una mesa en móvil
  if (selectedTableId && !isOpen) {
    return null;
  }

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(formattedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignorar si el portapapeles no está disponible
    }
  };

  const bottomOffsetClass = hasActiveWaiterAlert ? 'bottom-20' : 'bottom-5';

  return (
    <div className={`fixed ${bottomOffsetClass} right-5 ${isOpen ? 'z-50' : 'z-40'} flex flex-col items-end`}>
      {/* Panel desplegable de opciones y detalles */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Soporte prioritario por WhatsApp"
          className="mb-3 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {/* Encabezado */}
          <div className="px-4 py-3.5 bg-emerald-700 dark:bg-emerald-800 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">
                  Soporte Directo PRO
                </h3>
                <p className="text-[11px] text-emerald-100 font-mono tabular-nums truncate">
                  WhatsApp · +57 {SUPPORT_PHONE_LOCAL.slice(0, 3)} {SUPPORT_PHONE_LOCAL.slice(3, 6)} {SUPPORT_PHONE_LOCAL.slice(6)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar soporte de WhatsApp"
              className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-white/15 transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cuerpo: Selector de motivo + Caja para decir más */}
          <div className="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                ¿Qué necesitas resolver hoy?
              </label>

              <div className="space-y-1.5">
                {SUPPORT_TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  const isSelected = topic.id === selectedTopicId;

                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 dark:border-emerald-500 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-snug">
                          {topic.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          {topic.hint}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Caja para decir más */}
            <div>
              <label
                htmlFor="pro-whatsapp-extra-details"
                className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Cuéntanos más detalles
              </label>
              <textarea
                id="pro-whatsapp-extra-details"
                rows={3}
                value={extraDetails}
                onChange={(e) => setExtraDetails(e.target.value)}
                placeholder="Escribe aquí tu duda, el problema que presentas o tu petición..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-none transition"
              />
            </div>

            {/* Acciones */}
            <div className="pt-1 flex items-center gap-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setTimeout(() => setIsOpen(false), 300);
                }}
                className="flex-1 h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-900/20 transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>Enviar a WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={handleCopyMessage}
                title="Copiar mensaje"
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón Flotante Principal (Solo visible para suscriptores PRO activos) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Soporte prioritario por WhatsApp"
        className="h-12 px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-xl shadow-emerald-950/25 border border-emerald-500/40 transition flex items-center gap-2.5 whitespace-nowrap cursor-pointer"
      >
        {isOpen ? (
          <>
            <X className="w-5 h-5 shrink-0" />
            <span>Cerrar soporte</span>
          </>
        ) : (
          <>
            <MessageCircle className="w-5 h-5 shrink-0" />
            <span>Soporte WhatsApp</span>
          </>
        )}
      </button>
    </div>
  );
};
