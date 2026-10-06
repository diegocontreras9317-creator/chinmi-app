import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Table } from '../../types';
import { useApp } from '../../context/AppContext';
import { auth } from '../../firebase';
import {
  X,
  QrCode,
  Printer,
  Download,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Smartphone,
  Eye,
  ShoppingBag,
  BellRing,
  CreditCard,
  Sliders,
  Utensils
} from 'lucide-react';

interface TableQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table | null;
  onOpenCustomerMenu?: (tableId: string) => void;
}

export const TableQrModal: React.FC<TableQrModalProps> = ({
  isOpen,
  onClose,
  table,
  onOpenCustomerMenu
}) => {
  const { config, updateConfig, tables, setCustomerViewTableId } = useApp();
  const [selectedTableId, setSelectedTableId] = useState<string>(table?.id || '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'options'>('options');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (table) {
      setSelectedTableId(table.id);
    }
  }, [table]);

  const activeTable = tables.find(t => t.id === selectedTableId) || table;

  const qrSettings = config.qrSettings || {
    allowOrdering: true,
    allowCallWaiter: true,
    allowRequestBill: true,
    menuOnlyMode: false
  };

  const cleanBizName = (config.businessName && !config.businessName.toLowerCase().includes('perfume'))
    ? config.businessName
    : 'Chinmi GastroBar & Terraza';

  const getTableUrl = (t: Table) => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const uid = auth.currentUser?.uid || '';
    return `${origin}/menu?restId=${encodeURIComponent(uid)}&mesa=${encodeURIComponent(t.id)}`;
  };

  const tableUrl = activeTable ? getTableUrl(activeTable) : '';

  useEffect(() => {
    if (!activeTable) return;
    const url = getTableUrl(activeTable);

    QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(urlData => setQrDataUrl(urlData))
      .catch(err => console.error('Error generating QR:', err));
  }, [activeTable, config.qrSettings]);

  if (!isOpen || !activeTable) return null;

  const handleCopyLink = () => {
    if (!tableUrl) return;
    navigator.clipboard.writeText(tableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `QR_Mesa_${activeTable.number}_${activeTable.name.replace(/\s+/g, '_')}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handleUpdateQrSetting = (key: keyof typeof qrSettings, value: boolean) => {
    let nextSettings = { ...qrSettings, [key]: value };

    // If activating menuOnlyMode, automatically set allowOrdering to false
    if (key === 'menuOnlyMode' && value === true) {
      nextSettings.allowOrdering = false;
    }
    // If activating allowOrdering, menuOnlyMode cannot be true
    if (key === 'allowOrdering' && value === true) {
      nextSettings.menuOnlyMode = false;
    }

    updateConfig({
      qrSettings: nextSettings
    });
  };

  // Preset Configurations
  const applyPreset = (preset: 'full' | 'menuOnly' | 'assistance') => {
    if (preset === 'full') {
      updateConfig({
        qrSettings: {
          menuOnlyMode: false,
          allowOrdering: true,
          allowCallWaiter: true,
          allowRequestBill: true
        }
      });
    } else if (preset === 'menuOnly') {
      updateConfig({
        qrSettings: {
          menuOnlyMode: true,
          allowOrdering: false,
          allowCallWaiter: true,
          allowRequestBill: true
        }
      });
    } else if (preset === 'assistance') {
      updateConfig({
        qrSettings: {
          menuOnlyMode: true,
          allowOrdering: false,
          allowCallWaiter: true,
          allowRequestBill: false
        }
      });
    }
  };

  const isMenuOnly = qrSettings.menuOnlyMode || !qrSettings.allowOrdering;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const instructionsHtml = isMenuOnly
      ? `
        <li>Abre la cámara de tu teléfono y escanea el código QR.</li>
        <li>Consulta todos nuestros platos, bebidas, alérgenos y precios.</li>
        <li>Presiona <strong>"Llamar al Mesero"</strong> o <strong>"Pedir la Cuenta"</strong> para que te atendamos en tu mesa.</li>
      `
      : `
        <li>Abre la cámara de tu teléfono y escanea el código QR.</li>
        <li>Elige tus platos y bebidas favoritas desde la carta digital.</li>
        <li>Envía tu pedido directo a cocina y barra con un solo toque.</li>
      `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Mesa ${activeTable.number} - ${cleanBizName}</title>
          <style>
            @page { size: auto; margin: 15mm; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              margin: 0;
              padding: 20px;
              color: #0f172a;
              background: #ffffff;
            }
            .card {
              border: 2px solid #881337;
              border-radius: 12px;
              padding: 32px 24px;
              max-width: 380px;
              margin: 0 auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            }
            .biz-name {
              font-size: 22px;
              font-weight: 800;
              color: #881337;
              margin: 0 0 4px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .table-badge {
              display: inline-block;
              background: #fff1f2;
              color: #881337;
              font-size: 24px;
              font-weight: 800;
              padding: 6px 20px;
              border-radius: 8px;
              border: 1px solid #fecdd3;
              margin: 12px 0;
            }
            .zone {
              font-size: 13px;
              font-weight: 600;
              color: #64748b;
              margin: 0 0 16px 0;
            }
            .qr-img {
              width: 240px;
              height: 240px;
              display: block;
              margin: 0 auto 16px auto;
              border-radius: 16px;
            }
            .tagline {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 12px 0;
            }
            .steps {
              background: #f8fafc;
              border-radius: 14px;
              padding: 12px;
              font-size: 12px;
              font-weight: 600;
              color: #334155;
              text-align: left;
              line-height: 1.6;
              margin-top: 14px;
            }
            .steps ol {
              margin: 0;
              padding-left: 20px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="biz-name">${cleanBizName}</h1>
            <div class="table-badge">MESA ${activeTable.number}</div>
            <div class="zone">${activeTable.name} · ${activeTable.zone}</div>
            <img class="qr-img" src="${qrDataUrl}" alt="QR Mesa ${activeTable.number}" />
            <p class="tagline">${isMenuOnly ? '¡Escanea para ver la carta y solicitar atención!' : '¡Escanea para ver la carta y hacer tu pedido!'}</p>
            <div class="steps">
              <ol>
                ${instructionsHtml}
              </ol>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleOpenClientMenu = () => {
    onClose();
    if (onOpenCustomerMenu) {
      onOpenCustomerMenu(activeTable.id);
    } else {
      setCustomerViewTableId(activeTable.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-stone-50 dark:bg-slate-800/50 pr-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-rose-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                Códigos QR & Carta Digital
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Configuración de opciones de menú, pedidos y mesero
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal QR"
            className="absolute top-3.5 right-3.5 z-50 p-2 rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer shadow-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-850">
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className={`pb-2.5 px-4 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'options'
                ? 'border-rose-900 text-rose-900 dark:border-rose-400 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Opciones de la Carta QR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`pb-2.5 px-4 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'preview'
                ? 'border-rose-900 text-rose-900 dark:border-rose-400 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Vista Previa & Imprimir</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Table Selector Switcher */}
          <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Mesa seleccionada:
              </span>
              <span className="font-bold text-xs text-rose-900 dark:text-rose-300">
                Mesa {activeTable.number} ({activeTable.zone})
              </span>
            </div>

            {tables.length > 1 && (
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden"
              >
                {tables.map(t => (
                  <option key={t.id} value={t.id}>
                    Mesa {t.number} - {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* TAB 1: QR CODE OPTIONS */}
          {activeTab === 'options' && (
            <div className="space-y-4">
              
              {/* Preset Mode Pills */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
                  Modo Rápido de Funcionamiento:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('full')}
                    className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col gap-1 ${
                      !qrSettings.menuOnlyMode && qrSettings.allowOrdering
                        ? 'border-rose-900 bg-stone-100 dark:bg-slate-800 text-rose-900 dark:text-rose-300 ring-1 ring-rose-900'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">🌟 Pedidos + Mesero</span>
                      <ShoppingBag className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Ver carta, hacer pedidos directo a cocina y pedir la cuenta.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('menuOnly')}
                    className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col gap-1 ${
                      qrSettings.menuOnlyMode
                        ? 'border-rose-900 bg-stone-100 dark:bg-slate-800 text-rose-900 dark:text-rose-300 ring-1 ring-rose-900'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">👁️ Solo Ver Menú</span>
                      <Utensils className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Consulta de platos sin pedidos móviles. Con botón de mesero y cuenta.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('assistance')}
                    className={`p-3 rounded-md border text-left transition cursor-pointer flex flex-col gap-1 ${
                      qrSettings.menuOnlyMode && !qrSettings.allowRequestBill
                        ? 'border-rose-900 bg-stone-100 dark:bg-slate-800 text-rose-900 dark:text-rose-300 ring-1 ring-rose-900'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">🔔 Solo Llamar</span>
                      <BellRing className="w-3.5 h-3.5 text-rose-900 dark:text-rose-400" />
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      Ver carta informativa y botón para que acuda el mesero.
                    </span>
                  </button>
                </div>
              </div>

              {/* Specific Options Switches */}
              <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Permisos y Funcionalidades del QR:
                </span>

                {/* Option 1: Solo Ver Menú */}
                <div className="flex items-center justify-between p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-stone-100 dark:bg-slate-700 text-rose-900 dark:text-rose-400">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">
                        Solo ver el menú (Informativo)
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Los comensales exploran la carta pero no pueden enviar pedidos desde el celular.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.menuOnlyMode}
                    onChange={(e) => handleUpdateQrSetting('menuOnlyMode', e.target.checked)}
                    className="w-4 h-4 rounded-sm text-rose-900 focus:ring-rose-900 accent-rose-900 cursor-pointer"
                  />
                </div>

                {/* Option 2: Hacer Pedido */}
                <div className="flex items-center justify-between p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">
                        Opción de hacer pedido (Comanda digital)
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Permite agregar platos a la cesta y enviarlos a la comanda de la mesa en el POS.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowOrdering && !qrSettings.menuOnlyMode}
                    onChange={(e) => handleUpdateQrSetting('allowOrdering', e.target.checked)}
                    className="w-4 h-4 rounded-sm text-rose-900 focus:ring-rose-900 accent-rose-900 cursor-pointer"
                  />
                </div>

                {/* Option 3: Pedir Cuenta */}
                <div className="flex items-center justify-between p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-stone-100 dark:bg-slate-700 text-stone-800 dark:text-stone-200">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">
                        Opción de pedir la cuenta
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Avisa al camarero para que acuda con la cuenta a la mesa correspondiente.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowRequestBill}
                    onChange={(e) => handleUpdateQrSetting('allowRequestBill', e.target.checked)}
                    className="w-4 h-4 rounded-sm text-rose-900 focus:ring-rose-900 accent-rose-900 cursor-pointer"
                  />
                </div>

                {/* Option 4: Llamar Mesero */}
                <div className="flex items-center justify-between p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                      <BellRing className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 dark:text-white">
                        Opción de llamar al mesero a la mesa
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Alerta al personal para acudir a la mesa para tomar orden, asistencia o preguntas.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={qrSettings.allowCallWaiter}
                    onChange={(e) => handleUpdateQrSetting('allowCallWaiter', e.target.checked)}
                    className="w-4 h-4 rounded-sm text-rose-900 focus:ring-rose-900 accent-rose-900 cursor-pointer"
                  />
                </div>

              </div>

              {/* Status Indicator Summary */}
              <div className="p-3.5 rounded-md bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                <Sparkles className="w-4 h-4 text-rose-900 dark:text-rose-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Estado actual del QR:</strong> {isMenuOnly ? 'Modo Solo Ver Menú (los clientes consultan la carta sin realizar pedidos directos).' : 'Modo Completo (los clientes pueden pedir desde la mesa y solicitar atención).'}
                </span>
              </div>

            </div>
          )}

          {/* TAB 2: PREVIEW & PRINT FLYER */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              
              <div
                ref={printRef}
                className="p-5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-xs flex flex-col items-center"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                  {cleanBizName}
                </span>

                <div className="my-2 px-4 py-1 rounded-md bg-rose-900 text-white font-bold text-base shadow-xs flex items-center gap-2">
                  <span>Mesa {activeTable.number}</span>
                  <span className="text-xs font-normal text-rose-200">({activeTable.zone})</span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {isMenuOnly ? 'Escanea para ver la carta y llamar al mesero' : 'Escanea para ver la carta y pedir desde la mesa'}
                </p>

                {/* QR Image */}
                <div className="p-3 bg-white rounded-md border border-slate-200 shadow-xs relative group">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR Mesa ${activeTable.number}`}
                      className="w-44 h-44 sm:w-52 sm:h-52 object-contain"
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">
                      Generando QR...
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <Smartphone className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                  <span>Apunta con la cámara de tu celular</span>
                </div>
              </div>

              {/* URL Bar */}
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                  {tableUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title="Copiar enlace"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition shrink-0 cursor-pointer shadow-xs flex items-center gap-1 text-[11px] font-semibold"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {/* Test Link Button: Live interactive customer view */}
          <button
            type="button"
            onClick={handleOpenClientMenu}
            className="w-full py-2.5 px-4 rounded-md bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 text-rose-900 dark:text-rose-300 font-bold text-xs border border-stone-200 dark:border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Abrir Vista de Cliente en Pantalla (Mesa {activeTable.number})</span>
          </button>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDownloadQr}
            className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar PNG</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 rounded-md bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir QR Mesa {activeTable.number}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
