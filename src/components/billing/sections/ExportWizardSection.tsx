import React, { useState, useMemo } from 'react';
import {
  NormalizedExportSale,
  RestaurantFiscalProfile,
  AccountingExportProvider
} from '../adapters/types';
import { generalExcelExportAdapter } from '../adapters/GeneralExcelExportAdapter';
import { generalCsvExportAdapter } from '../adapters/GeneralCsvExportAdapter';
import { bulkMarkSalesAsExported } from '../billingStorageService';
import { formatCOP } from '../../../utils/currency';
import { isValidEmailFormat } from '../../../utils/billing';
import {
  ArrowRight,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface ExportWizardSectionProps {
  allSales: NormalizedExportSale[];
  restaurantProfile: RestaurantFiscalProfile;
  preSelectedSales?: NormalizedExportSale[];
  onExportSuccess?: (exportedCount: number, provider: AccountingExportProvider, wasMarkedAsExported: boolean) => void;
}

export const ExportWizardSection: React.FC<ExportWizardSectionProps> = ({
  allSales,
  restaurantProfile,
  preSelectedSales,
  onExportSuccess
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Paso 1: Filtros de selección
  const [scopeType, setScopeType] = useState<'all' | 'fe_only'>(
    preSelectedSales && preSelectedSales.length > 0 ? 'fe_only' : 'all'
  );
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Paso 2: Formato seleccionado
  const [selectedProvider, setSelectedProvider] = useState<AccountingExportProvider>('chinmi_excel');

  // Paso 3: Opciones y estado de descarga
  const [markAsExported, setMarkAsExported] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // Fechas de referencia
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const weekStartKey = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  }, []);
  const monthStartKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  // Lista de ventas elegibles para la exportación (Aplica estrictamente todos los filtros activos)
  const candidateSales = useMemo(() => {
    let list = preSelectedSales && preSelectedSales.length > 0 ? preSelectedSales : allSales;

    if (scopeType === 'fe_only') {
      list = list.filter((s) => s.requestStatus === 'solicitada');
    }

    if (datePreset === 'today') {
      list = list.filter((s) => s.dateKey === todayKey);
    } else if (datePreset === 'yesterday') {
      list = list.filter((s) => s.dateKey === yesterdayKey);
    } else if (datePreset === 'week') {
      list = list.filter((s) => s.dateKey >= weekStartKey && s.dateKey <= todayKey);
    } else if (datePreset === 'month') {
      list = list.filter((s) => s.dateKey >= monthStartKey && s.dateKey <= todayKey);
    } else if (datePreset === 'custom') {
      if (customStart) list = list.filter((s) => s.dateKey >= customStart);
      if (customEnd) list = list.filter((s) => s.dateKey <= customEnd);
    }

    return list;
  }, [
    allSales,
    preSelectedSales,
    scopeType,
    datePreset,
    customStart,
    customEnd,
    todayKey,
    yesterdayKey,
    weekStartKey,
    monthStartKey
  ]);

  // Totales y validaciones del lote
  const validationSummary = useMemo(() => {
    let monetaryTotal = 0;
    let totalBase = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let totalTip = 0;
    let totalItems = 0;
    const warnings: Array<{ ticketNumber: string; message: string }> = [];
    const incompatibleList: Array<{ ticketNumber: string; reason: string }> = [];

    for (const s of candidateSales) {
      monetaryTotal += s.total;
      totalBase += s.taxableBase;
      totalTax += s.taxAmount;
      totalDiscount += s.discountAmount;
      totalTip += s.tipAmount;
      totalItems += s.lines.length;

      // Incompatibilidad fiscal bloqueante
      if (s.isIncompatible) {
        incompatibleList.push({
          ticketNumber: s.ticketNumber,
          reason: s.incompatibilityReason || 'Clasificación tributaria incierta o inconsistencia en desglose'
        });
      }

      // Alertas fiscales informativas
      if (s.requestStatus === 'solicitada') {
        if (!s.documentNumber || s.documentNumber === '222222222222') {
          warnings.push({
            ticketNumber: s.ticketNumber,
            message: 'Requiere Factura Electrónica pero tiene identificación por defecto (Consumidor Final).'
          });
        }
        if (!s.email || !isValidEmailFormat(s.email)) {
          warnings.push({
            ticketNumber: s.ticketNumber,
            message: 'Falta correo electrónico válido para envío de la factura electrónica.'
          });
        }
      }
    }

    return {
      totalSales: candidateSales.length,
      totalItems,
      monetaryTotal,
      totalBase,
      totalTax,
      totalDiscount,
      totalTip,
      warnings,
      incompatibleList,
      hasIncompatible: incompatibleList.length > 0
    };
  }, [candidateSales]);

  // Generación y descarga del archivo
  const handleExecuteExport = async () => {
    if (candidateSales.length === 0) return;
    setIsExporting(true);
    setDownloadSuccessMessage(null);

    try {
      let adapter = selectedProvider === 'chinmi_csv' ? generalCsvExportAdapter : generalExcelExportAdapter;

      const dateRangeLabel =
        datePreset === 'today'
          ? `Hoy_${todayKey}`
          : datePreset === 'month'
          ? `Mes_${monthStartKey.slice(0, 7)}`
          : 'Periodo';

      const result = await adapter.generate(candidateSales, {
        restaurant: restaurantProfile,
        dateRangeLabel,
        includeCustomerFicha: true
      });

      // Crear Blob y disparar descarga en el navegador
      let blob: Blob;
      if (typeof result.data === 'string') {
        blob = new Blob([result.data], { type: adapter.mimeType });
      } else {
        blob = new Blob([result.data as BlobPart], { type: adapter.mimeType });
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Si el usuario marcó actualizar estado, guardar en ventas_metadatos
      if (markAsExported) {
        const saleIds = candidateSales.map((s) => s.saleId);
        await bulkMarkSalesAsExported(saleIds, selectedProvider);
      }

      setDownloadSuccessMessage(`Archivo generado y descargado exitosamente: ${result.filename}`);
      if (onExportSuccess) {
        onExportSuccess(candidateSales.length, selectedProvider, markAsExported);
      }

    } catch (err: any) {
      console.error('Error durante la exportación contable:', err);
      alert(`Error al generar la exportación: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Indicador de Pasos del Asistente */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          {/* Paso 1 */}
          <div
            onClick={() => setCurrentStep(1)}
            role="button"
            className="flex items-center gap-2 cursor-pointer"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                currentStep === 1
                  ? 'bg-rose-900 text-white shadow-xs'
                  : currentStep > 1
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
              }`}
            >
              {currentStep > 1 ? '✓' : '1'}
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 1 ? 'text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              Selección
            </span>
          </div>

          <div className="w-12 h-0.5 bg-slate-200 dark:bg-slate-800" />

          {/* Paso 2 */}
          <div
            onClick={() => candidateSales.length > 0 && setCurrentStep(2)}
            role="button"
            className={`flex items-center gap-2 ${candidateSales.length > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                currentStep === 2
                  ? 'bg-rose-900 text-white shadow-xs'
                  : currentStep > 2
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
              }`}
            >
              {currentStep > 2 ? '✓' : '2'}
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 2 ? 'text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              Formato
            </span>
          </div>

          <div className="w-12 h-0.5 bg-slate-200 dark:bg-slate-800" />

          {/* Paso 3 */}
          <div
            onClick={() => candidateSales.length > 0 && setCurrentStep(3)}
            role="button"
            className={`flex items-center gap-2 ${candidateSales.length > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                currentStep === 3
                  ? 'bg-rose-900 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
              }`}
            >
              3
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 3 ? 'text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              Validar y Descargar
            </span>
          </div>
        </div>
      </div>

      {/* CONTENIDO DEL PASO 1: SELECCIÓN */}
      {currentStep === 1 && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Paso 1: Definir el alcance de ventas a exportar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona si deseas exportar el Libro Diario completo de ventas o únicamente las que requieren Factura Electrónica.
            </p>
          </div>

          {/* Tipo de alcance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setScopeType('all')}
              role="button"
              className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                scopeType === 'all'
                  ? 'border-rose-900 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-900 dark:text-white">
                  Todas las ventas del periodo
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600">
                  Libro Diario
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Ideal para el contador general: incluye todos los tickets POS, formas de pago, propinas e impuestos.
              </p>
            </div>

            <div
              onClick={() => setScopeType('fe_only')}
              role="button"
              className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                scopeType === 'fe_only'
                  ? 'border-rose-900 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-900 dark:text-white">
                  Solo Facturas Electrónicas Solicitadas
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 font-semibold">
                  DIAN / Comensales
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Filtra exclusivamente los comensales que solicitaron factura nominativa con NIT, correo y razón social.
              </p>
            </div>
          </div>

          {/* Rango de Fechas */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <label className="block font-semibold text-slate-700 dark:text-slate-300">
              Periodo de Ventas
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'today', 'yesterday', 'week', 'month', 'custom'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDatePreset(preset)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    datePreset === preset
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {preset === 'all'
                    ? 'Todo el Historial'
                    : preset === 'today'
                    ? 'Hoy'
                    : preset === 'yesterday'
                    ? 'Ayer'
                    : preset === 'week'
                    ? 'Esta Semana'
                    : preset === 'month'
                    ? 'Este Mes'
                    : 'Personalizado'}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <span className="text-slate-400">hasta</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
            )}
          </div>

          {/* Resumen del Lote Seleccionado */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Ventas en el Lote:</span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {validationSummary.totalSales}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Líneas de Productos:</span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {validationSummary.totalItems}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Base Gravable:</span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {formatCOP(validationSummary.totalBase)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Total Facturado:</span>
              <span className="font-mono text-base font-bold text-rose-900 dark:text-rose-400">
                {formatCOP(validationSummary.monetaryTotal)}
              </span>
            </div>
          </div>

          {/* Botón Siguiente */}
          <div className="flex justify-end pt-3">
            <button
              type="button"
              disabled={candidateSales.length === 0}
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40"
            >
              <span>Continuar al Paso 2: Formato</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO DEL PASO 2: ELEGIR FORMATO */}
      {currentStep === 2 && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Paso 2: Elegir Formato y Destino Contable
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona el formato compatible con tu software contable o proceso de auditoría.
            </p>
          </div>

          {/* Formatos Disponibles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Excel General Chinmi */}
            <div
              onClick={() => setSelectedProvider('chinmi_excel')}
              role="button"
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedProvider === 'chinmi_excel'
                  ? 'border-rose-900 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  Excel General Chinmi (.xlsx)
                </span>
                <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  Recomendado
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Estructurado en 3 hojas: Resumen de Ventas, Ventas y Detalle de Productos. Preserva ceros a la izquierda en NITs y códigos postales como texto.
              </p>
            </div>

            {/* CSV General */}
            <div
              onClick={() => setSelectedProvider('chinmi_csv')}
              role="button"
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedProvider === 'chinmi_csv'
                  ? 'border-rose-900 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  CSV Universal (.csv)
                </span>
                <span className="ml-auto text-[10px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded-full">
                  Estándar
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Delimitado por punto y coma (;) con UTF-8 BOM para apertura nativa en Excel en español sin mezclar columnas ni alterar caracteres especiales.
              </p>
            </div>

            {/* Siigo Nube - Deshabilitado con tag informativo */}
            <div className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-800/30 opacity-75">
              <div className="flex items-center gap-2 mb-1.5">
                <Layers className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  Siigo Nube (.xlsx)
                </span>
                <span className="ml-auto text-[10px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  Fase 3: En Desarrollo
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Adaptador específico para plantilla de importación masiva de facturación de Siigo Nube. Se habilitará en la siguiente fase con la plantilla oficial.
              </p>
            </div>

            {/* Alegra - Deshabilitado con tag informativo */}
            <div className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-800/30 opacity-75">
              <div className="flex items-center gap-2 mb-1.5">
                <Layers className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  Alegra (.xlsx)
                </span>
                <span className="ml-auto text-[10px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  Fase 3: En Desarrollo
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Plantilla para importación directa de facturas y contactos en Alegra Colombia.
              </p>
            </div>

            {/* Loggro - Deshabilitado con tag informativo */}
            <div className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-800/30 opacity-75">
              <div className="flex items-center gap-2 mb-1.5">
                <Layers className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  Loggro (.xlsx)
                </span>
                <span className="ml-auto text-[10px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  Fase 3: En Desarrollo
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Estructura de importación contable y fiscal para Loggro ERP.
              </p>
            </div>
          </div>

          {/* Botones de navegación */}
          <div className="flex justify-between pt-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Paso 1</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Continuar al Paso 3: Validar y Descargar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO DEL PASO 3: VALIDAR Y DESCARGAR */}
      {currentStep === 3 && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Paso 3: Validación Contable y Generación de Archivo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Revisa la coherencia de cifras y advertencias antes de iniciar la descarga.
            </p>
          </div>

          {/* Banner de Aviso Legal y No Representación DIAN */}
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-start gap-2.5 text-xs">
            <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 dark:text-white block">
                Aviso Legal y Alcance Contable
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Los archivos exportados son comprobantes auxiliares de auditoría y conciliación interna para importación contable. <strong>No constituyen facturas electrónicas oficiales ni documentos validados directamente ante la DIAN</strong>.
              </p>
            </div>
          </div>

          {/* Feedback de Descarga Exitosa */}
          {downloadSuccessMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-medium">{downloadSuccessMessage}</span>
            </div>
          )}

          {/* Alerta Bloqueante si existen ventas incompatibles */}
          {validationSummary.hasIncompatible && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>
                  Bloqueo de Exportación: {validationSummary.incompatibleList.length} venta(s) tienen clasificación tributaria incierta o inconsistente
                </span>
              </div>
              <ul className="space-y-1 text-rose-700 dark:text-rose-300 text-[11px] max-h-32 overflow-y-auto pl-5 list-disc">
                {validationSummary.incompatibleList.map((inc, idx) => (
                  <li key={idx}>
                    <span className="font-mono font-bold">Ticket #{inc.ticketNumber}:</span> {inc.reason}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                Por seguridad contable, la exportación está bloqueada mientras existan comprobantes sin desglose matemático certero.
              </p>
            </div>
          )}

          {/* Lista de Advertencias Informativas */}
          {validationSummary.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  Observaciones informativas ({validationSummary.warnings.length})
                </span>
              </div>
              <ul className="space-y-1 text-amber-700 dark:text-amber-300 text-[11px] max-h-32 overflow-y-auto pl-5 list-disc">
                {validationSummary.warnings.map((w, idx) => (
                  <li key={idx}>
                    <span className="font-mono font-bold">Ticket #{w.ticketNumber}:</span> {w.message}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Estas observaciones no bloquean la exportación, pero tu contador necesitará revisar los datos para radicar la factura nominativa.
              </p>
            </div>
          )}

          {/* Tabla de Conciliación Numérica */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200 block">
              Conciliación del Lote ({candidateSales.length} comprobantes)
            </span>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              <div className="py-1.5 flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Base Gravable Neta:</span>
                <span className="font-mono font-medium">{formatCOP(validationSummary.totalBase)}</span>
              </div>
              <div className="py-1.5 flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Impuestos Liquidados (IVA + Impoconsumo):</span>
                <span className="font-mono font-medium">{formatCOP(validationSummary.totalTax)}</span>
              </div>
              {validationSummary.totalTip > 0 && (
                <div className="py-1.5 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Propinas / Servicio:</span>
                  <span className="font-mono font-medium">{formatCOP(validationSummary.totalTip)}</span>
                </div>
              )}
              {validationSummary.totalDiscount > 0 && (
                <div className="py-1.5 flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Descuentos Aplicados:</span>
                  <span className="font-mono font-medium">-{formatCOP(validationSummary.totalDiscount)}</span>
                </div>
              )}
              <div className="pt-2 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                <span>TOTAL RECAUDADO EN CAJA:</span>
                <span className="text-rose-900 dark:text-rose-400 font-mono">
                  {formatCOP(validationSummary.monetaryTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Opción de marcar como exportado */}
          <div className="flex items-center gap-2 pt-2 text-xs">
            <input
              type="checkbox"
              id="markAsExportedCheckbox"
              checked={markAsExported}
              onChange={(e) => setMarkAsExported(e.target.checked)}
              className="w-4 h-4 rounded text-rose-900 border-slate-300 focus:ring-rose-500 cursor-pointer"
            />
            <label htmlFor="markAsExportedCheckbox" className="text-slate-700 dark:text-slate-300 cursor-pointer">
              Marcar estas ventas como <strong>Exportadas</strong> en el sistema (conserva inmutable la venta original).
            </label>
          </div>

          {/* Botones de acción */}
          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Formatos</span>
            </button>

            <button
              type="button"
              disabled={isExporting || candidateSales.length === 0 || validationSummary.hasIncompatible}
              onClick={handleExecuteExport}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isExporting ? 'Generando archivo contable...' : 'Descargar Archivo Contable'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
