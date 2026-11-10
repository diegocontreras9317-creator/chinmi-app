import React, { useState, useEffect } from 'react';
import { CustomerBillingInfo, CustomerDocumentType, CustomerTaxRegime } from '../../../types';
import { NormalizedExportSale } from '../adapters/types';
import {
  calculateColombiaNitDV,
  COLOMBIAN_CITIES_DANE,
  DOCUMENT_TYPE_OPTIONS,
  isValidEmailFormat,
  TAX_REGIME_OPTIONS
} from '../../../utils/billing';
import { updateSaleBillingMetadata } from '../billingStorageService';
import { X, Save, AlertCircle, CheckCircle2, User, Building2 } from 'lucide-react';

interface CustomerFiscalEditModalProps {
  sale: NormalizedExportSale | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedSaleId: string, updatedInfo: CustomerBillingInfo) => void;
}

export const CustomerFiscalEditModal: React.FC<CustomerFiscalEditModalProps> = ({
  sale,
  isOpen,
  onClose,
  onSuccess
}) => {
  if (!isOpen || !sale) return null;

  const [customerName, setCustomerName] = useState(sale.customerName || '');
  const [docType, setDocType] = useState<CustomerDocumentType>(
    (sale.documentType as CustomerDocumentType) || 'CONSUMIDOR_FINAL'
  );
  const [docNumber, setDocNumber] = useState(sale.documentNumber || '');
  const [dv, setDv] = useState(sale.dv || '');
  const [email, setEmail] = useState(sale.email || '');
  const [phone, setPhone] = useState(sale.phone || '');
  const [address, setAddress] = useState(sale.address || '');
  const [city, setCity] = useState(sale.city || 'Bogotá D.C.');
  const [department, setDepartment] = useState(sale.department || 'Bogotá D.C.');
  const [taxRegime, setTaxRegime] = useState<CustomerTaxRegime>('no_responsable_iva');
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Recalcular DV automáticamente si el documento es NIT
  useEffect(() => {
    if (docType === 'NIT') {
      const computed = calculateColombiaNitDV(docNumber);
      setDv(computed);
    } else {
      setDv('');
    }
  }, [docNumber, docType]);

  const handleCityChange = (cityName: string) => {
    setCity(cityName);
    const found = COLOMBIAN_CITIES_DANE.find((c) => c.city === cityName);
    if (found) {
      setDepartment(found.department);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      setErrorMsg('Por favor ingresa un correo electrónico válido (ej: cliente@correo.com).');
      return;
    }

    if (docType !== 'CONSUMIDOR_FINAL' && !docNumber.trim()) {
      setErrorMsg('Debes ingresar el número de identificación del cliente.');
      return;
    }

    setIsSaving(true);
    try {
      const billingPayload: CustomerBillingInfo = {
        customerName: customerName.trim() || 'Consumidor Final',
        documentType: docType,
        documentNumber: docNumber.trim() || '222222222222',
        dv: docType === 'NIT' ? dv : undefined,
        email: cleanEmail || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city || undefined,
        department: department || undefined,
        taxRegime,
        requiresElectronicInvoice: true
      };

      // Guardar en metadatos desacoplados sin alterar el documento de venta histórico
      await updateSaleBillingMetadata(sale.saleId, {
        customerFiscalOverride: billingPayload,
        requestStatus: 'solicitada'
      });

      onSuccess(sale.saleId, billingPayload);
      onClose();
    } catch (err: any) {
      console.error('Error guardando metadatos fiscales:', err);
      setErrorMsg(err?.message || 'No se pudo guardar la información fiscal.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-rose-900 dark:text-rose-400" />
              Completar Ficha Fiscal del Cliente
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ticket #{sale.ticketNumber} · Los valores de la venta permanecen inmutables
            </p>
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
        <form onSubmit={handleSave} className="p-4 overflow-y-auto space-y-3.5 flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nombre o Razón Social
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej. Juan Pérez o Distribuciones SAS"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-1">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tipo Doc.
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as CustomerDocumentType)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Número de Identificación
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="Número sin puntos"
                  className="flex-1 px-3 py-2 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
                />
                {docType === 'NIT' && (
                  <div className="w-12 shrink-0">
                    <input
                      type="text"
                      readOnly
                      value={dv ? `-${dv}` : '-'}
                      title="Dígito de Verificación calculado"
                      className="w-full px-1.5 py-2 text-center font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Correo Factura Electrónica
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="factura@correo.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 3101234567"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ciudad / Municipio (DANE)
              </label>
              <select
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
              >
                {COLOMBIAN_CITIES_DANE.map((c) => (
                  <option key={c.cityCode} value={c.city}>
                    {c.city} ({c.department})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dirección Física
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej. Calle 100 # 15-20"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Régimen Tributario
            </label>
            <select
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value as CustomerTaxRegime)}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 outline-hidden"
            >
              {TAX_REGIME_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
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
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Datos Fiscales'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
