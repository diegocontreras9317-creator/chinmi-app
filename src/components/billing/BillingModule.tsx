import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  NormalizedExportSale,
  RestaurantFiscalProfile,
  AccountingExportProvider,
  ExternalFilingStatus
} from './adapters/types';
import {
  fetchAllUserSalesPaginated,
  getSalesBillingMetadataMap,
  normalizeSalesForExport,
  getRestaurantFiscalProfile
} from './billingStorageService';
import { CustomerBillingInfo } from '../../types';
import { SalesHistorySection } from './sections/SalesHistorySection';
import { RequestedInvoicesSection } from './sections/RequestedInvoicesSection';
import { ExportWizardSection } from './sections/ExportWizardSection';
import { FiscalSettingsSection } from './sections/FiscalSettingsSection';
import { SaleDetailsDrawer } from './components/SaleDetailsDrawer';
import { CustomerFiscalEditModal } from './components/CustomerFiscalEditModal';
import { ExternalInvoiceStatusModal } from './components/ExternalInvoiceStatusModal';
import {
  FileSpreadsheet,
  FileText,
  Clock,
  Building2,
  RefreshCw,
  Receipt,
  Download,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';

export type BillingActiveTab = 'history' | 'requested' | 'wizard' | 'settings';

export interface BillingModuleProps {
  onBackToTables?: () => void;
}

export const BillingModule: React.FC<BillingModuleProps> = ({ onBackToTables }) => {
  const [activeTab, setActiveTab] = useState<BillingActiveTab>('history');
  const [sales, setSales] = useState<NormalizedExportSale[]>([]);
  const [restaurantProfile, setRestaurantProfile] = useState<RestaurantFiscalProfile>({
    businessName: 'Mi Restaurante',
    nit: '222222222222',
    dv: '0',
    address: 'Calle Principal',
    city: 'Bogotá, D.C.',
    department: 'Bogotá D.C.',
    daneCode: '11001',
    email: 'contabilidad@mirestaurante.com',
    phone: '3000000000',
    taxRegime: 'no_responsable_iva',
    fiscalResponsibilities: ['R-99-PN'],
    defaultTaxType: 'impoconsumo',
    defaultTaxRate: 8,
    economicActivityCode: '5611'
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de modales auxiliares
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<NormalizedExportSale | null>(null);
  const [selectedSaleForFiscalEdit, setSelectedSaleForFiscalEdit] = useState<NormalizedExportSale | null>(null);
  const [selectedSaleForExternalFiling, setSelectedSaleForExternalFiling] = useState<NormalizedExportSale | null>(null);
  const [preSelectedSalesForWizard, setPreSelectedSalesForWizard] = useState<NormalizedExportSale[]>([]);

  // Carga de datos inicial
  const loadData = useCallback(async () => {
    setErrorMsg(null);
    try {
      // 1. Obtener perfil fiscal
      const profilePromise = getRestaurantFiscalProfile().catch((e) => {
        console.warn('Usando perfil fiscal base:', e);
        return null;
      });

      // 2. Obtener todas las ventas paginadas y sus metadatos desacoplados en paralelo
      const [rawSales, metadataMap, loadedProfile] = await Promise.all([
        fetchAllUserSalesPaginated(),
        getSalesBillingMetadataMap(),
        profilePromise
      ]);

      if (loadedProfile) {
        setRestaurantProfile(loadedProfile);
      }

      // 3. Normalizar preservando inmutabilidad
      const normalized = normalizeSalesForExport(rawSales, metadataMap);
      setSales(normalized);
    } catch (err: any) {
      console.error('Error cargando datos de facturación:', err);
      setErrorMsg(err?.message || 'Error al conectar con Firestore. Verifica tu conexión.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  // Callback cuando se actualiza la ficha fiscal del cliente
  const handleFiscalEditSuccess = (updatedSaleId: string, updatedInfo: CustomerBillingInfo) => {
    setSales((prev) =>
      prev.map((s) => {
        if (s.saleId === updatedSaleId) {
          return {
            ...s,
            customerName: updatedInfo.customerName,
            documentType: updatedInfo.documentType,
            documentNumber: updatedInfo.documentNumber,
            dv: updatedInfo.dv,
            email: updatedInfo.email,
            phone: updatedInfo.phone,
            address: updatedInfo.address,
            city: updatedInfo.city,
            department: updatedInfo.department
            // Conserva el requestStatus original sin forzar 'solicitada' automáticamente
          };
        }
        return s;
      })
    );
  };

  // Callback cuando se actualiza el estado de radicación externa
  const handleExternalFilingSuccess = (
    updatedSaleId: string,
    filingStatus: ExternalFilingStatus,
    invoiceNumber?: string,
    providerUsed?: string,
    filingDate?: string,
    filingNotes?: string
  ) => {
    setSales((prev) =>
      prev.map((s) => {
        if (s.saleId === updatedSaleId) {
          return {
            ...s,
            filingStatus,
            externalInvoiceNumber: invoiceNumber || s.externalInvoiceNumber,
            externalProviderUsed: providerUsed || s.externalProviderUsed,
            filingDate: filingDate || s.filingDate,
            filingNotes: filingNotes || s.filingNotes
          };
        }
        return s;
      })
    );
  };

  // Abrir asistente de exportación con un grupo específico de ventas
  const handleOpenWizardWithSales = (batchSales: NormalizedExportSale[]) => {
    setPreSelectedSalesForWizard(batchSales);
    setActiveTab('wizard');
  };

  // Conteo de facturas solicitadas pendientes
  const pendingRequestsCount = useMemo(() => {
    return sales.filter((s) => s.requestStatus === 'solicitada' && s.filingStatus !== 'emitida').length;
  }, [sales]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-900 text-white shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                Facturación & Exportaciones Contables
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gestión inmutable de comprobantes, solicitudes de clientes y exportaciones contables
              </p>
            </div>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2">
          {onBackToTables && (
            <button
              type="button"
              onClick={onBackToTables}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Mesas</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-750 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-rose-900' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Pestañas Principales del Módulo */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4 text-slate-500" />
          <span>Historial de Ventas</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600">
            {sales.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requested')}
          className={`px-3.5 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'requested'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4 text-purple-600" />
          <span>Facturas Solicitadas</span>
          {pendingRequestsCount > 0 && (
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 font-bold">
              {pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('wizard')}
          className={`px-3.5 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'wizard'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Asistente de Exportación</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`px-3.5 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4 text-slate-500" />
          <span>Configuración Fiscal</span>
        </button>
      </div>

      {/* Contenido de la Sección Activa */}
      {activeTab === 'history' && (
        <SalesHistorySection
          sales={sales}
          isLoading={isLoading}
          onViewDetails={(s) => setSelectedSaleForDetails(s)}
          onOpenFiscalEdit={(s) => setSelectedSaleForFiscalEdit(s)}
          onOpenExternalFiling={(s) => setSelectedSaleForExternalFiling(s)}
          onOpenWizardWithSales={handleOpenWizardWithSales}
        />
      )}

      {activeTab === 'requested' && (
        <RequestedInvoicesSection
          sales={sales}
          isLoading={isLoading}
          onViewDetails={(s) => setSelectedSaleForDetails(s)}
          onOpenFiscalEdit={(s) => setSelectedSaleForFiscalEdit(s)}
          onOpenExternalFiling={(s) => setSelectedSaleForExternalFiling(s)}
          onOpenWizardWithSales={handleOpenWizardWithSales}
        />
      )}

      {activeTab === 'wizard' && (
        <ExportWizardSection
          allSales={sales}
          restaurantProfile={restaurantProfile}
          preSelectedSales={preSelectedSalesForWizard}
          onExportSuccess={(count, provider, wasMarkedAsExported) => {
            if (wasMarkedAsExported) {
              setSales((prev) =>
                prev.map((s) => {
                  if (preSelectedSalesForWizard.some((p) => p.saleId === s.saleId)) {
                    return {
                      ...s,
                      exportStatus: 'exportado'
                    };
                  }
                  return s;
                })
              );
            }
          }}
        />
      )}


      {activeTab === 'settings' && (
        <FiscalSettingsSection
          onProfileUpdated={(updated) => setRestaurantProfile(updated)}
        />
      )}

      {/* Modales y Drawers Auxiliares */}
      <SaleDetailsDrawer
        sale={selectedSaleForDetails}
        isOpen={Boolean(selectedSaleForDetails)}
        onClose={() => setSelectedSaleForDetails(null)}
        onOpenFiscalEdit={(s) => {
          setSelectedSaleForDetails(null);
          setSelectedSaleForFiscalEdit(s);
        }}
        onOpenExternalFiling={(s) => {
          setSelectedSaleForDetails(null);
          setSelectedSaleForExternalFiling(s);
        }}
      />

      <CustomerFiscalEditModal
        sale={selectedSaleForFiscalEdit}
        isOpen={Boolean(selectedSaleForFiscalEdit)}
        onClose={() => setSelectedSaleForFiscalEdit(null)}
        onSuccess={handleFiscalEditSuccess}
      />

      <ExternalInvoiceStatusModal
        sale={selectedSaleForExternalFiling}
        isOpen={Boolean(selectedSaleForExternalFiling)}
        onClose={() => setSelectedSaleForExternalFiling(null)}
        onSuccess={handleExternalFilingSuccess}
      />
    </div>
  );
};
export default BillingModule;
