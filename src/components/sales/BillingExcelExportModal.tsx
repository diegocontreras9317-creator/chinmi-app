import React, { useEffect, useMemo, useState } from 'react';
import { Product, SaleReceipt } from '../../types';
import { formatCOP } from '../../utils/currency';
import { isElectronicInvoiceSale } from '../../utils/billing';
import {
  buildBillingExportPreview,
  downloadBillingExcelFile,
  ExportBillingProvider,
  ExportGroupingMode,
  saleTimestampToDateKey
} from '../../utils/excelBillingExport';
import {
  X,
  FileSpreadsheet,
  Download,
  Calendar,
  Users,
  Layers,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface BillingExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleReceipt[];
  productsCatalog: Product[];
  appName: string;
  initialSelectedDate: string;
  initialInvoiceFilter: 'all' | 'electronic';
}

const GROUPING_OPTIONS: Array<{
  id: ExportGroupingMode;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'daily_global',
    title: 'Masivo por Día (Venta Global)',
    subtitle:
      'Consolida todas las ventas o tickets del día seleccionado en un único bloque de facturación para facturar el cierre completo en lote.'
  },
  {
    id: 'by_customer',
    title: 'Por Cliente (Individual / Clientes con FE)',
    subtitle:
      'Filtra únicamente los clientes que solicitaron Factura Electrónica en caja, agrupando consumos por cada Cédula/NIT individual.'
  }
];

const PROVIDER_OPTIONS: Array<{
  id: ExportBillingProvider;
  title: string;
  columnsSummary: string;
}> = [
  {
    id: 'siigo',
    title: 'Plantilla Siigo Cloud (.xlsx)',
    columnsSummary:
      'FV-1 · Fecha DD/MM/AAAA · Identificación Tercero (Texto) · Sucursal 0 · Producto · Cantidad · Base sin impuesto · INC 8% / IVA 19%'
  },
  {
    id: 'alegra',
    title: 'Plantilla Alegra (.xlsx)',
    columnsSummary:
      'Cliente · Identificación (Texto) · Fecha AAAA-MM-DD · Vencimiento · Item · Precio sin impuesto · Cantidad · Impuesto'
  },
  {
    id: 'chinmi',
    title: 'Excel General Chinmi App (.xlsx)',
    columnsSummary:
      'Control interno de caja en 3 hojas: Detalle desglosado de productos, Resumen por tercero y Auditoría completa de tickets'
  }
];

export const BillingExcelExportModal: React.FC<BillingExcelExportModalProps> = ({
  isOpen,
  onClose,
  sales,
  productsCatalog,
  appName,
  initialSelectedDate,
  initialInvoiceFilter
}) => {
  const todayKey = useMemo(() => saleTimestampToDateKey(new Date()), []);

  // Último día con ventas registradas como respaldo inteligente si hoy aún no hay tickets
  const latestSaleDateKey = useMemo(() => {
    let latest = '';
    for (const s of sales) {
      const k = saleTimestampToDateKey(s.timestamp);
      if (k && k > latest) latest = k;
    }
    return latest || todayKey;
  }, [sales, todayKey]);

  const [mode, setMode] = useState<ExportGroupingMode>('daily_global');
  const [provider, setProvider] = useState<ExportBillingProvider>('siigo');
  const [exportDate, setExportDate] = useState<string>(todayKey);
  const [filterCustomerByDate, setFilterCustomerByDate] = useState<boolean>(true);
  const [excludeIndividualFeFromGlobal, setExcludeIndividualFeFromGlobal] = useState<boolean>(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDownloadedFile(null);
    const defaultMode: ExportGroupingMode =
      initialInvoiceFilter === 'electronic' ? 'by_customer' : 'daily_global';
    setMode(defaultMode);

    if (initialSelectedDate) {
      setExportDate(initialSelectedDate);
      setFilterCustomerByDate(true);
    } else {
      const hasSalesToday = sales.some((s) => saleTimestampToDateKey(s.timestamp) === todayKey);
      setExportDate(hasSalesToday ? todayKey : latestSaleDateKey);
      setFilterCustomerByDate(false);
    }
  }, [isOpen, initialSelectedDate, initialInvoiceFilter, sales, todayKey, latestSaleDateKey]);

  const effectiveTargetDate = useMemo(() => {
    if (mode === 'daily_global') {
      return exportDate || todayKey;
    }
    return filterCustomerByDate ? exportDate : '';
  }, [mode, exportDate, filterCustomerByDate, todayKey]);

  const dayIndividualFeCount = useMemo(() => {
    if (mode !== 'daily_global') return 0;
    const target = exportDate || todayKey;
    return sales.filter(
      (s) => saleTimestampToDateKey(s.timestamp) === target && isElectronicInvoiceSale(s)
    ).length;
  }, [mode, exportDate, todayKey, sales]);

  const preview = useMemo(
    () =>
      buildBillingExportPreview({
        sales,
        productsCatalog,
        mode,
        provider,
        targetDate: effectiveTargetDate,
        appName,
        excludeIndividualFeFromGlobal
      }),
    [
      sales,
      productsCatalog,
      mode,
      provider,
      effectiveTargetDate,
      appName,
      excludeIndividualFeFromGlobal
    ]
  );

  if (!isOpen) return null;

  const handleDownload = () => {
    const result = downloadBillingExcelFile({
      sales,
      productsCatalog,
      mode,
      provider,
      targetDate: effectiveTargetDate,
      appName,
      excludeIndividualFeFromGlobal
    });
    if (result.success) {
      setDownloadedFile(result.filename);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                Exportar Facturación Electrónica en Excel (.xlsx)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Desglose automático PVP a base sin impuesto (÷ 1.08 INC · ÷ 1.19 IVA) · NIT/Cédula en formato texto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Step 1: Tipo de Exportación */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                1. Tipo de Exportación (Modo de Agrupación)
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecciona cómo empaquetar las facturas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GROUPING_OPTIONS.map((opt) => {
                const isSelected = mode === opt.id;
                const IconComp = opt.id === 'daily_global' ? Layers : Users;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setMode(opt.id);
                      setDownloadedFile(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-500 dark:border-orange-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconComp
                          className={`w-4 h-4 shrink-0 ${
                            isSelected
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {opt.title}
                        </span>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'border-orange-600 bg-orange-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                      {opt.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Contextual Date & Consolidation Scope Bar */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {mode === 'daily_global' ? 'Día de caja a consolidar:' : 'Alcance de fecha FE:'}
                </span>

                {mode === 'by_customer' && (
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCustomerByDate(false);
                        setDownloadedFile(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        !filterCustomerByDate
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Todas las fechas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCustomerByDate(true);
                        if (!exportDate) setExportDate(todayKey);
                        setDownloadedFile(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        filterCustomerByDate
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Día específico
                    </button>
                  </div>
                )}

                {(mode === 'daily_global' || filterCustomerByDate) && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={exportDate}
                      onChange={(e) => {
                        setExportDate(e.target.value);
                        setDownloadedFile(null);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                    />
                    {exportDate !== todayKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setExportDate(todayKey);
                          setDownloadedFile(null);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition cursor-pointer whitespace-nowrap"
                      >
                        Hoy
                      </button>
                    )}
                  </div>
                )}
              </div>

              {mode === 'daily_global' && dayIndividualFeCount > 0 && (
                <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeIndividualFeFromGlobal}
                    onChange={(e) => {
                      setExcludeIndividualFeFromGlobal(e.target.checked);
                      setDownloadedFile(null);
                    }}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span>
                    Omitir {dayIndividualFeCount} ticket(s) con FE individual para evitar doble cobro
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Step 2: Proveedor de Facturación */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                2. Proveedor de Facturación (Formato del archivo)
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Archivo nativo Excel (.xlsx)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {PROVIDER_OPTIONS.map((prov) => {
                const isSelected = provider === prov.id;
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => {
                      setProvider(prov.id);
                      setDownloadedFile(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        {prov.title}
                      </span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                        {prov.columnsSummary}
                      </p>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Fiscal Breakdown & Preview */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Resumen Contable y Vista Previa del Archivo
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[300px]">
                {preview.suggestedFilename}
              </span>
            </div>

            {/* 4-Column Tabular Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  {mode === 'daily_global' ? 'Bloque / Tickets' : 'Facturas (Cédula/NIT)'}
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {mode === 'daily_global'
                    ? `${preview.totalInvoicesCount} bloque · ${preview.totalTicketsCount} tkt`
                    : `${preview.totalInvoicesCount} fact. · ${preview.totalTicketsCount} tkt`}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Base Gravable Total
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalTaxableBase))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  INC · IVA Desglosado
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalIncAmount))} ·{' '}
                  {formatCOP(Math.round(preview.totalIvaAmount))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Total Productos PVP
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCOP(Math.round(preview.totalGrossProducts))}
                </p>
              </div>
            </div>

            {/* Preview Table or Empty State */}
            {preview.packages.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {mode === 'daily_global'
                    ? `No se encontraron ventas registradas para la fecha ${effectiveTargetDate}. Selecciona otro día con movimiento de caja.`
                    : effectiveTargetDate
                    ? `No hay clientes que hayan solicitado Factura Electrónica el día ${effectiveTargetDate}. Prueba cambiando a "Todas las fechas".`
                    : 'Aún no hay ventas marcadas con solicitud de Factura Electrónica en el historial.'}
                </span>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[640px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold">
                    <tr>
                      {preview.previewHeaders.map((header) => (
                        <th key={header} className="px-3 py-2 whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {preview.previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="bg-white dark:bg-slate-900">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {typeof cell === 'number'
                              ? cell.toLocaleString('es-CO', {
                                  minimumFractionDigits: Number.isInteger(cell) ? 0 : 2,
                                  maximumFractionDigits: 2
                                })
                              : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.totalLinesCount > preview.previewRows.length && (
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                    Mostrando primeras {preview.previewRows.length} de {preview.totalLinesCount}{' '}
                    líneas que se incluirán en el archivo .xlsx
                  </div>
                )}
              </div>
            )}

            {downloadedFile && (
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Archivo generado correctamente: <strong className="font-mono">{downloadedFile}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
            Formato nativo SheetJS (.xlsx) sin errores de comas ni pérdida de ceros
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={preview.packages.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Descargar Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
