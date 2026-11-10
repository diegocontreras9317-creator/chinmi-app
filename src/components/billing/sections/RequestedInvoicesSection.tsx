import React, { useState, useMemo } from 'react';
import { NormalizedExportSale } from '../adapters/types';
import { formatCOP } from '../../../utils/currency';
import { isValidEmailFormat } from '../../../utils/billing';
import {
  FileText,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Search,
  Filter,
  CheckSquare,
  Square,
  AlertTriangle
} from 'lucide-react';

interface RequestedInvoicesSectionProps {
  sales: NormalizedExportSale[];
  isLoading: boolean;
  onViewDetails: (sale: NormalizedExportSale) => void;
  onOpenFiscalEdit: (sale: NormalizedExportSale) => void;
  onOpenExternalFiling: (sale: NormalizedExportSale) => void;
  onOpenWizardWithSales: (sales: NormalizedExportSale[]) => void;
}

type RequestedSubTab = 'all' | 'pending' | 'ready' | 'exported' | 'issued' | 'needs_review';

export const RequestedInvoicesSection: React.FC<RequestedInvoicesSectionProps> = ({
  sales,
  isLoading,
  onViewDetails,
  onOpenFiscalEdit,
  onOpenExternalFiling,
  onOpenWizardWithSales
}) => {
  const [activeTab, setActiveTab] = useState<RequestedSubTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filtrar exclusivamente comprobantes con solicitud de Factura Electrónica
  const requestedSales = useMemo(() => {
    return sales.filter((s) => s.requestStatus === 'solicitada');
  }, [sales]);

  // Clasificación de integridad fiscal del cliente
  const isCustomerDataComplete = (sale: NormalizedExportSale) => {
    const hasName = Boolean(sale.customerName && sale.customerName !== 'Consumidor Final');
    const hasDoc = Boolean(sale.documentNumber && sale.documentNumber !== '222222222222');
    const hasEmail = Boolean(sale.email && isValidEmailFormat(sale.email));
    return hasName && hasDoc && hasEmail;
  };

  // Conteo por sub-pestañas
  const counts = useMemo(() => {
    let pending = 0;
    let ready = 0;
    let exported = 0;
    let issued = 0;
    let needsReview = 0;

    for (const s of requestedSales) {
      const complete = isCustomerDataComplete(s);

      if (s.filingStatus === 'emitida') {
        issued++;
      } else if (s.filingStatus === 'requiere_revision' || !complete) {
        needsReview++;
      } else {
        pending++;
      }

      if (complete && s.filingStatus !== 'emitida') {
        ready++;
      }

      if (s.exportStatus === 'exportado') {
        exported++;
      }
    }

    return {
      all: requestedSales.length,
      pending,
      ready,
      exported,
      issued,
      needsReview
    };
  }, [requestedSales]);

  // Filtrar por pestaña activa y término de búsqueda
  const filteredSales = useMemo(() => {
    let list = requestedSales;

    if (activeTab === 'pending') {
      list = list.filter((s) => s.filingStatus === 'pendiente' && isCustomerDataComplete(s));
    } else if (activeTab === 'ready') {
      list = list.filter((s) => isCustomerDataComplete(s) && s.filingStatus !== 'emitida');
    } else if (activeTab === 'exported') {
      list = list.filter((s) => s.exportStatus === 'exportado');
    } else if (activeTab === 'issued') {
      list = list.filter((s) => s.filingStatus === 'emitida');
    } else if (activeTab === 'needs_review') {
      list = list.filter((s) => s.filingStatus === 'requiere_revision' || !isCustomerDataComplete(s));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.ticketNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.documentNumber.toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q))
      );
    }

    return list;
  }, [requestedSales, activeTab, searchTerm]);

  // Selección múltiple
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSales.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSales.map((s) => s.saleId)));
    }
  };

  const toggleSelectOne = (saleId: string) => {
    const next = new Set(selectedIds);
    if (next.has(saleId)) {
      next.delete(saleId);
    } else {
      next.add(saleId);
    }
    setSelectedIds(next);
  };

  const selectedSalesList = useMemo(() => {
    return filteredSales.filter((s) => selectedIds.has(s.saleId));
  }, [filteredSales, selectedIds]);

  return (
    <div className="space-y-4">
      {/* Barra de Sub-pestañas Segmentadas */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Todas</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600">
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'pending'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Pendientes</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
            {counts.pending}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ready')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'ready'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Listas p/ Exportar</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
            {counts.ready}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('exported')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'exported'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Exportadas</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600">
            {counts.exported}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('issued')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'issued'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Emitidas DIAN</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
            {counts.issued}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('needs_review')}
          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
            activeTab === 'needs_review'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <span>Requieren Revisión</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
            {counts.needsReview}
          </span>
        </button>
      </div>

      {/* Barra de Filtro y Acciones Masivas */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Ticket #, cliente, cédula/NIT o correo..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-600 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => onOpenWizardWithSales(selectedSalesList)}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Seleccionadas ({selectedIds.size})</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={filteredSales.length === 0}
              onClick={() => onOpenWizardWithSales(filteredSales)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Vista ({filteredSales.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Lista de Facturas Solicitadas */}
      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-rose-900 border-t-transparent rounded-full mb-2" />
          <p className="text-xs text-slate-500">Cargando solicitudes de factura electrónica...</p>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No hay solicitudes en esta sección
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Los comensales que soliciten factura electrónica desde el menú QR o al cobrar en caja aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 w-8">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {selectedIds.size === filteredSales.length && filteredSales.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-semibold">Ticket</th>
                  <th className="py-2.5 px-3 font-semibold">Fecha</th>
                  <th className="py-2.5 px-3 font-semibold">Cliente / Razón Social</th>
                  <th className="py-2.5 px-3 font-semibold">Identificación</th>
                  <th className="py-2.5 px-3 font-semibold">Correo Facturación</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Monto Total</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Ficha Fiscal</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Estado Emisión</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSales.map((sale) => {
                  const complete = isCustomerDataComplete(sale);
                  const isSelected = selectedIds.has(sale.saleId);

                  return (
                    <tr
                      key={sale.saleId}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(sale.saleId)}
                          className="cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-rose-900 dark:text-rose-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        #{sale.ticketNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono whitespace-nowrap">
                        {sale.dateKey}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white max-w-[170px] truncate" title={sale.customerName}>
                        {sale.customerName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {sale.documentType} {sale.documentNumber}{sale.dv ? `-${sale.dv}` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-[160px] truncate" title={sale.email || 'Sin correo'}>
                        {sale.email || <span className="text-amber-600 italic">Falta correo</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatCOP(sale.total)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {complete ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Completa</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Incompleta</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {sale.filingStatus === 'emitida' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Emitida #{sale.externalInvoiceNumber || ''}</span>
                          </span>
                        ) : sale.filingStatus === 'requiere_revision' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Revisión</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                            <span>Pendiente</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onViewDetails(sale)}
                            title="Ver detalle del comprobante"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFiscalEdit(sale)}
                            title="Completar datos fiscales del cliente"
                            className="p-1 rounded-md text-slate-400 hover:text-rose-900 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenExternalFiling(sale)}
                            title="Registrar número de factura electrónica emitida"
                            className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
