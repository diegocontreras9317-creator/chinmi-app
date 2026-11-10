import React, { useState, useEffect } from 'react';
import { NormalizedExportSale, ExternalFilingStatus } from '../adapters/types';
import { updateSaleBillingMetadata } from '../billingStorageService';
import { X, Save, AlertCircle, CheckCircle2, FileCheck2, ExternalLink } from 'lucide-react';

interface ExternalInvoiceStatusModalProps {
  sale: NormalizedExportSale | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (
    updatedSaleId: string,
    filingStatus: ExternalFilingStatus,
    invoiceNumber?: string,
    providerUsed?: string,
    filingDate?: string,
    filingNotes?: string
  ) => void;
}

const COMMON_PROVIDERS = [
  { value: 'siigo', label: 'Siigo Nube' },
  { value: 'alegra', label: 'Alegra' },
  { value: 'loggro', label: 'Loggro' },
  { value: 'dian_gratuita', label: 'Facturación Gratuita DIAN' },
  { value: 'facturatech', label: 'Facturatech' },
  { value: 'otro', label: 'Otro Software / Proveedor Tecnológico' }
];

export const ExternalInvoiceStatusModal: React.FC<ExternalInvoiceStatusModalProps> = ({
  sale,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [filingStatus, setFilingStatus] = useState<ExternalFilingStatus>('pendiente');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [providerUsed, setProviderUsed] = useState('siigo');
  const [filingDate, setFilingDate] = useState('');
  const [filingNotes, setFilingNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preservar y restaurar fidedignamente proveedor, fecha e información guardada previamente al reabrir el formulario
  useEffect(() => {
    if (sale && isOpen) {
      setFilingStatus(sale.filingStatus || 'pendiente');
      setInvoiceNumber(sale.externalInvoiceNumber || '');
      setProviderUsed(sale.externalProviderUsed || 'siigo');
      setFilingDate(sale.filingDate || new Date().toISOString().slice(0, 10));
      setFilingNotes(sale.filingNotes || '');
      setErrorMsg(null);
    }
  }, [sale, isOpen]);

  if (!isOpen || !sale) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (filingStatus === 'emitida' && !invoiceNumber.trim()) {
      setErrorMsg('Si marcas la factura como emitida, debes indicar el número de factura electrónica externo (ej. FE-1045).');
      return;
    }

    setIsSaving(true);
    try {
      await updateSaleBillingMetadata(sale.saleId, {
        filingStatus,
        externalInvoiceNumber: invoiceNumber.trim() || undefined,
        externalProviderUsed: providerUsed,
        filingDate: filingStatus === 'emitida' ? filingDate : null,
        filingNotes: filingNotes.trim() || undefined
      });

      onSuccess(
        sale.saleId,
        filingStatus,
        invoiceNumber.trim(),
        providerUsed,
        filingDate,
        filingNotes.trim()
      );
      onClose();
    } catch (err: any) {
      console.error('Error guardando estado de emisión externa:', err);
      setErrorMsg(err?.message || 'No se pudo guardar el estado de emisión externa.');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 shrink-0">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                Registro de Emisión Externa
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ticket #{sale.ticketNumber} · {sale.customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSave} className="p-4 space-y-3.5 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Estado de la Factura en su Software Contable
            </label>
            <select
              value={filingStatus}
              onChange={(e) => setFilingStatus(e.target.value as ExternalFilingStatus)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden font-medium"
            >
              <option value="pendiente">Pendiente por emitir en software contable</option>
              <option value="emitida">Emitida exitosamente ante la DIAN</option>
              <option value="requiere_revision">Requiere revisión / Rechazada por el contador</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Software o Proveedor Utilizado
            </label>
            <select
              value={providerUsed}
              onChange={(e) => setProviderUsed(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
            >
              {COMMON_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Número de Factura Electrónica (ej. FE-1052, SETT-94)
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ej. FE-00142"
              className="w-full px-3 py-2 font-mono uppercase rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Fecha de Emisión / Radicación
            </label>
            <input
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notas u Observaciones del Contador (Opcional)
            </label>
            <textarea
              rows={2}
              value={filingNotes}
              onChange={(e) => setFilingNotes(e.target.value)}
              placeholder="Ej. CUFE verificado, enviada al correo del cliente."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden resize-none"
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Estado'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
