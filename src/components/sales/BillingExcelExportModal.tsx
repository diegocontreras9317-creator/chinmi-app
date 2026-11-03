import React, { useEffect, useMemo, useState } from 'react';
import {
  CustomerBillingInfo,
  CustomerDocumentType,
  ElectronicInvoiceStatus,
  OrderItem,
  Product,
  SaleReceipt
} from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  DOCUMENT_TYPE_OPTIONS,
  extractKnownCustomersFromSales,
  formatCustomerDocument,
  getSaleCustomerEmail,
  isElectronicInvoiceSale,
  isValidEmailFormat,
  KnownCustomerProfile,
  matchesDocumentNumberQuery,
  normalizeDocumentSearchKey,
  searchKnownCustomers
} from '../../utils/billing';
import { resolveOrderItemTax } from '../../utils/taxes';
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
  AlertCircle,
  Search,
  Receipt,
  UserCheck,
  Mail,
  Save
} from 'lucide-react';

interface BillingExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleReceipt[];
  productsCatalog: Product[];
  appName: string;
  initialSelectedDate: string;
  initialInvoiceFilter: 'all' | 'electronic';
  initialMode?: ExportGroupingMode;
  initialSaleId?: string | null;
  initialSearchQuery?: string;
  onSaveSaleBilling?: (
    saleId: string,
    billingInfo: CustomerBillingInfo,
    markStatus?: ElectronicInvoiceStatus
  ) => SaleReceipt | undefined;
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
      'Consolida todas las ventas del día seleccionado en un único bloque para facturar el cierre completo en lote.'
  },
  {
    id: 'by_customer',
    title: 'Por Cliente (Consolidado FE)',
    subtitle:
      'Filtra los clientes que solicitaron Factura Electrónica y agrupa sus consumos por cada Cédula/NIT.'
  },
  {
    id: 'specific_order',
    title: 'Cliente y Pedido Específico (NIT / Cédula)',
    subtitle:
      'Busca por NIT o Cédula, elige el pedido exacto tomado en mesa y genera la Factura Electrónica de esa comanda.'
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

function summarizeSaleItems(sale: SaleReceipt): string {
  const items = sale.items || [];
  if (items.length === 0) return 'Sin productos detallados';
  const head = items
    .slice(0, 3)
    .map((it) => `${it.quantity}x ${it.name}`)
    .join(' · ');
  return items.length > 3 ? `${head} (+${items.length - 3} más)` : head;
}

export const BillingExcelExportModal: React.FC<BillingExcelExportModalProps> = ({
  isOpen,
  onClose,
  sales,
  productsCatalog,
  appName,
  initialSelectedDate,
  initialInvoiceFilter,
  initialMode,
  initialSaleId,
  initialSearchQuery = '',
  onSaveSaleBilling
}) => {
  const todayKey = useMemo(() => saleTimestampToDateKey(new Date()), []);

  const latestSaleDateKey = useMemo(() => {
    let latest = '';
    for (const s of sales) {
      const k = saleTimestampToDateKey(s.timestamp);
      if (k && k > latest) latest = k;
    }
    return latest || todayKey;
  }, [sales, todayKey]);

  const knownCustomers = useMemo(() => extractKnownCustomersFromSales(sales), [sales]);

  const [mode, setMode] = useState<ExportGroupingMode>('daily_global');
  const [provider, setProvider] = useState<ExportBillingProvider>('siigo');
  const [exportDate, setExportDate] = useState<string>(todayKey);
  const [filterCustomerByDate, setFilterCustomerByDate] = useState<boolean>(true);
  const [excludeIndividualFeFromGlobal, setExcludeIndividualFeFromGlobal] = useState<boolean>(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  // Estado exclusivo para "Cliente y Pedido Específico (NIT / Cédula)"
  const [specificSearchQuery, setSpecificSearchQuery] = useState<string>('');
  const [specificFilterByDate, setSpecificFilterByDate] = useState<boolean>(false);
  const [includeUnassignedOrdersInSearch, setIncludeUnassignedOrdersInSearch] = useState<boolean>(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  // Formulario fiscal del cliente específico para el pedido elegido
  const [custDocType, setCustDocType] = useState<CustomerDocumentType>('CC');
  const [custDocNumber, setCustDocNumber] = useState<string>('');
  const [custName, setCustName] = useState<string>('');
  const [custEmail, setCustEmail] = useState<string>('');
  const [markIssuedOnDownload, setMarkIssuedOnDownload] = useState<boolean>(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Hidrata el formulario fiscal a partir de un pedido seleccionado (conservando datos si el pedido era Consumidor Final y el cajero ya había buscado un NIT/Cédula)
  const hydrateCustomerFormFromSale = (
    sale: SaleReceipt | undefined,
    fallbackQuery?: string
  ) => {
    if (!sale) return;
    const rawDocType =
      (sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL') as CustomerDocumentType;
    const rawDocNum = (sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '').trim();
    const rawName = (sale.customerName || sale.billingInfo?.customerName || '').trim();
    const rawEmail = getSaleCustomerEmail(sale);

    const hasRealSaleCustomer =
      Boolean(rawDocNum && rawDocNum !== '222222222222') && rawDocType !== 'CONSUMIDOR_FINAL';

    if (hasRealSaleCustomer) {
      setCustDocType(rawDocType);
      setCustDocNumber(rawDocNum);
      setCustName(rawName && rawName.toLowerCase() !== 'consumidor final' ? rawName : '');
      setCustEmail(rawEmail);
      return;
    }

    // Si el pedido fue cobrado como Consumidor Final, intentamos prellenar con el NIT/Cédula buscado si coincide con un cliente conocido
    const q = (fallbackQuery ?? specificSearchQuery).trim();
    if (q) {
      const matched = searchKnownCustomers(knownCustomers, q, 1)[0];
      if (matched && matchesDocumentNumberQuery(matched.documentNumber, q)) {
        setCustDocType(matched.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : matched.documentType);
        setCustDocNumber(matched.documentNumber);
        setCustName(matched.customerName);
        setCustEmail(matched.email || '');
        return;
      }
      const normQ = normalizeDocumentSearchKey(q);
      if (/^\d{5,15}$/.test(normQ.baseWithoutDv)) {
        setCustDocType(q.includes('-') ? 'NIT' : 'CC');
        setCustDocNumber(q);
        setCustName(rawName && rawName.toLowerCase() !== 'consumidor final' ? rawName : '');
        setCustEmail(rawEmail);
        return;
      }
    }

    // Si no había búsqueda por NIT/Cédula pero el formulario tampoco tenía un NIT previo, limpiar para que el cajero ingrese NIT/Cédula
    setCustDocType('CC');
    setCustDocNumber('');
    setCustName(rawName && rawName.toLowerCase() !== 'consumidor final' ? rawName : '');
    setCustEmail(rawEmail);
  };

  useEffect(() => {
    if (!isOpen) return;
    setDownloadedFile(null);
    setSavedNotice(null);
    setValidationError(null);

    const resolvedMode: ExportGroupingMode =
      initialMode ||
      (initialSaleId
        ? 'specific_order'
        : initialInvoiceFilter === 'electronic'
        ? 'by_customer'
        : 'daily_global');

    setMode(resolvedMode);

    if (initialSelectedDate) {
      setExportDate(initialSelectedDate);
      setFilterCustomerByDate(true);
      setSpecificFilterByDate(false);
    } else {
      const hasSalesToday = sales.some((s) => saleTimestampToDateKey(s.timestamp) === todayKey);
      setExportDate(hasSalesToday ? todayKey : latestSaleDateKey);
      setFilterCustomerByDate(false);
      setSpecificFilterByDate(false);
    }

    const cleanInitSearch = initialSearchQuery.trim();
    setSpecificSearchQuery(cleanInitSearch);
    setIncludeUnassignedOrdersInSearch(false);

    const sortedSales = [...sales].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    const targetInitialSale = initialSaleId
      ? sortedSales.find((s) => s.id === initialSaleId) || sortedSales[0]
      : cleanInitSearch
      ? sortedSales.find((s) =>
          matchesDocumentNumberQuery(
            s.customerDocumentNumber || s.billingInfo?.documentNumber || '',
            cleanInitSearch
          )
        ) || sortedSales[0]
      : sortedSales[0];

    if (targetInitialSale) {
      setSelectedSaleId(targetInitialSale.id);
      hydrateCustomerFormFromSale(targetInitialSale, cleanInitSearch);
    } else {
      setSelectedSaleId('');
      setCustDocType('CC');
      setCustDocNumber('');
      setCustName('');
      setCustEmail('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    initialMode,
    initialSaleId,
    initialSearchQuery,
    initialSelectedDate,
    initialInvoiceFilter,
    todayKey,
    latestSaleDateKey
  ]);

  // Clientes conocidos que coinciden con la búsqueda actual por NIT / Cédula / Nombre
  const matchedCustomerProfiles = useMemo(() => {
    if (!specificSearchQuery.trim()) {
      return knownCustomers.slice(0, 4);
    }
    return searchKnownCustomers(knownCustomers, specificSearchQuery, 5);
  }, [knownCustomers, specificSearchQuery]);

  // Coincidencia instantánea cuando el usuario digita un NIT o Cédula en el campo de documento del formulario
  const inlineDocProfileSuggestion = useMemo((): KnownCustomerProfile | null => {
    const cleanNum = custDocNumber.trim();
    if (cleanNum.length < 5) return null;
    const found = knownCustomers.find((p) => {
      const pKey = normalizeDocumentSearchKey(p.documentNumber);
      const cKey = normalizeDocumentSearchKey(cleanNum);
      return pKey.baseWithoutDv === cKey.baseWithoutDv || pKey.compact === cKey.compact;
    });
    if (!found) return null;
    const sameName = custName.trim().toLowerCase() === found.customerName.trim().toLowerCase();
    const sameEmail = !found.email || custEmail.trim().toLowerCase() === found.email.toLowerCase();
    if (sameName && sameEmail) return null;
    return found;
  }, [custDocNumber, custName, custEmail, knownCustomers]);

  // Pedidos filtrados para el modo "Cliente y Pedido Específico"
  const matchingOrdersForSpecificMode = useMemo(() => {
    const sorted = [...sales].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return sorted.filter((sale) => {
      if (specificFilterByDate && exportDate) {
        if (saleTimestampToDateKey(sale.timestamp) !== exportDate) return false;
      }

      const q = specificSearchQuery.trim();
      if (!q) return true;

      const lower = q.toLowerCase();
      const storedDoc = sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '';
      const storedDocType =
        sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL';
      const isUnassigned = !storedDoc.trim() || storedDocType === 'CONSUMIDOR_FINAL';

      if (includeUnassignedOrdersInSearch && isUnassigned) {
        return true;
      }

      if (matchesDocumentNumberQuery(storedDoc, q)) return true;

      const name = (sale.customerName || sale.billingInfo?.customerName || 'consumidor final').toLowerCase();
      const email = getSaleCustomerEmail(sale).toLowerCase();
      const itemsText = (sale.items || [])
        .map((it) => `${it.quantity}x ${it.name}`)
        .join(' ')
        .toLowerCase();

      return (
        name.includes(lower) ||
        email.includes(lower) ||
        sale.tableName.toLowerCase().includes(lower) ||
        sale.id.toLowerCase().includes(lower) ||
        sale.orderId?.toLowerCase().includes(lower) ||
        itemsText.includes(lower)
      );
    });
  }, [sales, specificFilterByDate, exportDate, specificSearchQuery, includeUnassignedOrdersInSearch]);

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedSaleId) || null,
    [sales, selectedSaleId]
  );

  const effectiveTargetDate = useMemo(() => {
    if (mode === 'daily_global') {
      return exportDate || todayKey;
    }
    if (mode === 'specific_order') {
      return selectedSale ? saleTimestampToDateKey(selectedSale.timestamp) : '';
    }
    return filterCustomerByDate ? exportDate : '';
  }, [mode, exportDate, filterCustomerByDate, todayKey, selectedSale]);

  const dayIndividualFeCount = useMemo(() => {
    if (mode !== 'daily_global') return 0;
    const target = exportDate || todayKey;
    return sales.filter(
      (s) => saleTimestampToDateKey(s.timestamp) === target && isElectronicInvoiceSale(s)
    ).length;
  }, [mode, exportDate, todayKey, sales]);

  const customerOverride = useMemo<Partial<CustomerBillingInfo> | null>(() => {
    if (mode !== 'specific_order') return null;
    return {
      customerName: custName.trim() || 'Cliente Factura Electrónica',
      documentType: custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType,
      documentNumber: custDocNumber.trim(),
      email: custEmail.trim().toLowerCase(),
      requiresElectronicInvoice: true
    };
  }, [mode, custName, custDocType, custDocNumber, custEmail]);

  const preview = useMemo(
    () =>
      buildBillingExportPreview({
        sales,
        productsCatalog,
        mode,
        provider,
        targetDate: effectiveTargetDate,
        appName,
        excludeIndividualFeFromGlobal,
        selectedSaleId,
        customerOverride
      }),
    [
      sales,
      productsCatalog,
      mode,
      provider,
      effectiveTargetDate,
      appName,
      excludeIndividualFeFromGlobal,
      selectedSaleId,
      customerOverride
    ]
  );

  if (!isOpen) return null;

  const handleSelectProfile = (profile: KnownCustomerProfile) => {
    setValidationError(null);
    setSavedNotice(null);
    setDownloadedFile(null);
    setSpecificSearchQuery(profile.documentNumber);
    setCustDocType(profile.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : profile.documentType);
    setCustDocNumber(profile.documentNumber);
    setCustName(profile.customerName);
    setCustEmail(profile.email || '');

    // Seleccionar automáticamente el pedido más reciente de este NIT/Cédula si el pedido actual no pertenece a él
    const customerOrders = [...sales]
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .filter((s) =>
        matchesDocumentNumberQuery(
          s.customerDocumentNumber || s.billingInfo?.documentNumber || '',
          profile.documentNumber
        )
      );

    if (customerOrders.length > 0) {
      const alreadySelectedBelongs = customerOrders.some((o) => o.id === selectedSaleId);
      if (!alreadySelectedBelongs) {
        setSelectedSaleId(customerOrders[0].id);
      }
    }
  };

  const handleSelectOrderRow = (sale: SaleReceipt) => {
    setSelectedSaleId(sale.id);
    setValidationError(null);
    setSavedNotice(null);
    setDownloadedFile(null);

    const rawDocNum = (sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '').trim();
    const rawDocType =
      (sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL') as CustomerDocumentType;

    // Si este pedido ya tiene NIT/Cédula propio, cargarlo; si es Consumidor Final y el cajero ya digitó un NIT/Cédula en el formulario, conservar el NIT/Cédula para facturarle este pedido
    if (rawDocNum && rawDocNum !== '222222222222' && rawDocType !== 'CONSUMIDOR_FINAL') {
      hydrateCustomerFormFromSale(sale);
    } else if (!custDocNumber.trim()) {
      hydrateCustomerFormFromSale(sale, specificSearchQuery);
    }
  };

  const validateSpecificCustomerFields = (): boolean => {
    if (!selectedSale) {
      setValidationError('Selecciona el pedido específico que deseas facturar.');
      return false;
    }
    const cleanDoc = custDocNumber.trim();
    if (!cleanDoc) {
      setValidationError('Ingresa el número de NIT o Cédula del cliente para generar la Factura Electrónica.');
      return false;
    }
    const cleanEmail = custEmail.trim();
    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      setValidationError('El correo electrónico ingresado no tiene un formato válido (ejemplo: cliente@empresa.com).');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSaveCustomerToOrderOnly = () => {
    if (!validateSpecificCustomerFields() || !selectedSale || !onSaveSaleBilling) return;
    onSaveSaleBilling(
      selectedSale.id,
      {
        customerName: custName.trim() || 'Cliente Factura Electrónica',
        documentType: custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType,
        documentNumber: custDocNumber.trim(),
        email: custEmail.trim().toLowerCase(),
        requiresElectronicInvoice: true
      },
      selectedSale.electronicInvoiceStatus === 'emitida' ? 'emitida' : 'pendiente'
    );
    setSavedNotice(
      `Cliente (${custDocType} ${custDocNumber.trim()}) vinculado al pedido #${selectedSale.id.slice(-6)}.`
    );
  };

  const handleDownload = () => {
    if (mode === 'specific_order') {
      if (!validateSpecificCustomerFields()) return;
      if (selectedSale && onSaveSaleBilling) {
        onSaveSaleBilling(
          selectedSale.id,
          {
            customerName: custName.trim() || 'Cliente Factura Electrónica',
            documentType: custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType,
            documentNumber: custDocNumber.trim(),
            email: custEmail.trim().toLowerCase(),
            requiresElectronicInvoice: true
          },
          markIssuedOnDownload ? 'emitida' : undefined
        );
      }
    }

    const result = downloadBillingExcelFile({
      sales,
      productsCatalog,
      mode,
      provider,
      targetDate: effectiveTargetDate,
      appName,
      excludeIndividualFeFromGlobal,
      selectedSaleId,
      customerOverride
    });
    if (result.success) {
      setDownloadedFile(result.filename);
      if (mode === 'specific_order' && selectedSale) {
        setSavedNotice(
          markIssuedOnDownload
            ? `Datos guardados y pedido #${selectedSale.id.slice(-6)} marcado como FE Emitida.`
            : `Datos fiscales guardados en el pedido #${selectedSale.id.slice(-6)}.`
        );
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[94vh] flex flex-col"
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
                Facturación Electrónica y Exportación Excel (.xlsx)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Búsqueda por NIT o Cédula por pedido específico · Desglose PVP (÷ 1.08 INC · ÷ 1.19 IVA)
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
                1. Modalidad de Facturación Electrónica
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Global del día, consolidado o pedido específico por NIT/Cédula
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {GROUPING_OPTIONS.map((opt) => {
                const isSelected = mode === opt.id;
                const IconComp =
                  opt.id === 'daily_global'
                    ? Layers
                    : opt.id === 'by_customer'
                    ? Users
                    : UserCheck;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setMode(opt.id);
                      setDownloadedFile(null);
                      setValidationError(null);
                      if (opt.id === 'specific_order' && !selectedSaleId && sales.length > 0) {
                        const newest = [...sales].sort((a, b) =>
                          (b.timestamp || '').localeCompare(a.timestamp || '')
                        )[0];
                        if (newest) {
                          setSelectedSaleId(newest.id);
                          hydrateCustomerFormFromSale(newest, specificSearchQuery);
                        }
                      }
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-500 dark:border-orange-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <IconComp
                          className={`w-4 h-4 shrink-0 ${
                            isSelected
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
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

            {/* Contextual Date Bar for daily_global and by_customer */}
            {mode !== 'specific_order' && (
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
            )}

            {/* Panel dedicado cuando mode === 'specific_order': Buscar por NIT / Cédula + Elegir Pedido Específico */}
            {mode === 'specific_order' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                {/* Barra de búsqueda por NIT / Cédula y filtro de fecha */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span>Buscar cliente por NIT o Cédula y seleccionar el pedido tomado</span>
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setSpecificFilterByDate(false)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                            !specificFilterByDate
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Todas las fechas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSpecificFilterByDate(true);
                            if (!exportDate) setExportDate(todayKey);
                          }}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                            specificFilterByDate
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Por fecha
                        </button>
                      </div>

                      {specificFilterByDate && (
                        <input
                          type="date"
                          value={exportDate}
                          onChange={(e) => setExportDate(e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                        />
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={specificSearchQuery}
                      onChange={(e) => {
                        setSpecificSearchQuery(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Escribe NIT o Cédula (ej. 900123456-7 o 1020304050), nombre, mesa, producto o #ticket..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                    />
                    {specificSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setSpecificSearchQuery('')}
                        className="absolute right-2.5 top-2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Directorio rápido de clientes registrados por NIT / Cédula */}
                  {matchedCustomerProfiles.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {specificSearchQuery.trim()
                            ? 'Clientes encontrados por NIT / Cédula (clic para cargar sus datos y ver sus pedidos):'
                            : 'Clientes frecuentes con NIT / Cédula:'}
                        </span>
                        {specificSearchQuery.trim() && (
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includeUnassignedOrdersInSearch}
                              onChange={(e) => setIncludeUnassignedOrdersInSearch(e.target.checked)}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>Incluir pedidos cobrados como Consumidor Final</span>
                          </label>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {matchedCustomerProfiles.map((prof) => {
                          const isCurrentDoc =
                            normalizeDocumentSearchKey(custDocNumber).baseWithoutDv === prof.key;
                          return (
                            <button
                              key={prof.key}
                              type="button"
                              onClick={() => handleSelectProfile(prof)}
                              className={`px-3 py-2 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                                isCurrentDoc
                                  ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-400 dark:border-orange-600'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-700'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white block truncate">
                                  {formatCustomerDocument(prof.documentType, prof.documentNumber)}
                                </span>
                                <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                                  {prof.customerName}
                                  {prof.email ? ` · ${prof.email}` : ''}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono tabular-nums font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                                {prof.ordersCount} {prof.ordersCount === 1 ? 'pedido' : 'pedidos'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de pedidos específicos para seleccionar el que se tomó */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Selecciona el pedido específico tomado ({matchingOrdersForSpecificMode.length}{' '}
                      {matchingOrdersForSpecificMode.length === 1 ? 'resultado' : 'resultados'})
                    </span>
                    {selectedSale && (
                      <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                        Seleccionado: #{selectedSale.id.slice(-6)} · {selectedSale.tableName}
                      </span>
                    )}
                  </div>

                  {matchingOrdersForSpecificMode.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        No se encontraron pedidos con el NIT/Cédula o criterio buscado. Si el pedido fue cobrado como Consumidor Final, activa ver todos los pedidos para asignarle este NIT/Cédula.
                      </span>
                      <button
                        type="button"
                        onClick={() => setIncludeUnassignedOrdersInSearch(true)}
                        className="px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        Mostrar pedidos de Consumidor Final
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                      {matchingOrdersForSpecificMode.slice(0, 40).map((sale) => {
                        const isChosen = sale.id === selectedSaleId;
                        const docLabel = formatCustomerDocument(
                          sale.customerDocumentType || sale.billingInfo?.documentType,
                          sale.customerDocumentNumber || sale.billingInfo?.documentNumber
                        );
                        const saleCustName =
                          sale.customerName?.trim() ||
                          sale.billingInfo?.customerName?.trim() ||
                          'Consumidor Final';
                        const isIssued = sale.electronicInvoiceStatus === 'emitida';

                        return (
                          <button
                            key={sale.id}
                            type="button"
                            onClick={() => handleSelectOrderRow(sale)}
                            className={`w-full px-3.5 py-2.5 text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                              isChosen
                                ? 'bg-orange-50/80 dark:bg-orange-950/35'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isChosen
                                    ? 'border-orange-600 bg-orange-600 text-white'
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                              >
                                {isChosen && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </span>

                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                                    #{sale.id.slice(-6)}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {sale.tableName}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                                    {new Date(sale.timestamp).toLocaleString('es-CO', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>

                                <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                                  {summarizeSaleItems(sale)}
                                </p>

                                <p className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                                  {docLabel ? `${docLabel} · ${saleCustName}` : saleCustName}
                                  {isIssued ? ' · FE Emitida' : ''}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono tabular-nums font-bold text-xs text-slate-900 dark:text-white block">
                                {formatCOP(sale.total)}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {(sale.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)}{' '}
                                ítems
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Detalle del Pedido Tomado + Datos Fiscales del Cliente (NIT / Cédula) */}
                {selectedSale && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                    {/* Detalle de los productos tomados en ese pedido */}
                    <div className="lg:col-span-5 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2.5">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span>Pedido #{selectedSale.id.slice(-6)} · {selectedSale.tableName}</span>
                          </span>
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {new Date(selectedSale.timestamp).toLocaleDateString('es-CO')}
                          </span>
                        </div>

                        <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                          {(selectedSale.items || []).map((item, idx) => {
                            const itemTax = resolveOrderItemTax(
                              item as unknown as Partial<OrderItem> & Record<string, unknown>,
                              productsCatalog,
                              Number(selectedSale.taxPercent) || 8
                            );
                            const lineGross = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
                            return (
                              <div
                                key={item.id || idx}
                                className="py-1.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono tabular-nums font-bold text-orange-600 dark:text-orange-400 mr-1">
                                    {item.quantity}x
                                  </span>
                                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                                    {item.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    · {itemTax.shortLabel}
                                  </span>
                                </div>
                                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white shrink-0">
                                  {formatCOP(lineGross)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          Total de este pedido:
                        </span>
                        <span className="font-mono tabular-nums font-extrabold text-slate-900 dark:text-white">
                          {formatCOP(selectedSale.total)}
                        </span>
                      </div>
                    </div>

                    {/* Formulario Fiscal del Cliente (NIT / Cédula) */}
                    <div className="lg:col-span-7 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Cliente receptor de la Factura Electrónica</span>
                        </span>

                        {onSaveSaleBilling && (
                          <button
                            type="button"
                            onClick={handleSaveCustomerToOrderOnly}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                            title="Guardar NIT/Cédula y datos en este pedido"
                          >
                            <Save className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Guardar en pedido</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Tipo de documento *
                          </label>
                          <select
                            value={custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType}
                            onChange={(e) => {
                              setCustDocType(e.target.value as CustomerDocumentType);
                              setValidationError(null);
                              setDownloadedFile(null);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          >
                            {DOCUMENT_TYPE_OPTIONS.filter((o) => o.value !== 'CONSUMIDOR_FINAL').map(
                              (opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.shortLabel} · {opt.value === 'NIT' ? 'Empresa' : opt.label.split('(')[0].trim()}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            {custDocType === 'NIT' ? 'Número de NIT (ej. 900123456-7) *' : 'Número de Cédula / ID *'}
                          </label>
                          <input
                            type="text"
                            value={custDocNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustDocNumber(val);
                              if (val.includes('-') && custDocType === 'CC') {
                                setCustDocType('NIT');
                              }
                              setValidationError(null);
                              setSavedNotice(null);
                              setDownloadedFile(null);
                            }}
                            placeholder={custDocType === 'NIT' ? '900123456-7' : '1020304050'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>
                      </div>

                      {inlineDocProfileSuggestion && (
                        <button
                          type="button"
                          onClick={() => handleSelectProfile(inlineDocProfileSuggestion)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-left text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="truncate">
                            Cliente registrado encontrado:{' '}
                            <strong>{inlineDocProfileSuggestion.customerName}</strong>
                            {inlineDocProfileSuggestion.email
                              ? ` · ${inlineDocProfileSuggestion.email}`
                              : ''}
                          </span>
                          <span className="font-bold shrink-0 underline">Autocompletar</span>
                        </button>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Nombre completo o Razón Social *
                          </label>
                          <input
                            type="text"
                            value={custName}
                            onChange={(e) => {
                              setCustName(e.target.value);
                              setSavedNotice(null);
                              setDownloadedFile(null);
                            }}
                            placeholder="Nombre o Razón Social de la empresa"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-orange-500 shrink-0" />
                            <span>Correo electrónico FE</span>
                          </label>
                          <input
                            type="email"
                            value={custEmail}
                            onChange={(e) => {
                              setCustEmail(e.target.value);
                              setValidationError(null);
                              setSavedNotice(null);
                              setDownloadedFile(null);
                            }}
                            placeholder="facturacion@empresa.com"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none pt-0.5">
                        <input
                          type="checkbox"
                          checked={markIssuedOnDownload}
                          onChange={(e) => setMarkIssuedOnDownload(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          Guardar estos datos en el pedido y marcar Factura Electrónica como Emitida al descargar
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
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
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[320px]">
                {preview.suggestedFilename}
              </span>
            </div>

            {/* 4-Column Tabular Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  {mode === 'daily_global'
                    ? 'Bloque / Tickets'
                    : mode === 'specific_order'
                    ? 'Cliente / Pedido'
                    : 'Facturas (Cédula/NIT)'}
                </span>
                <p className="text-xs sm:text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 truncate">
                  {mode === 'daily_global'
                    ? `${preview.totalInvoicesCount} bloque · ${preview.totalTicketsCount} tkt`
                    : mode === 'specific_order'
                    ? custDocNumber.trim()
                      ? `${custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType} ${custDocNumber.trim()}`
                      : 'Sin NIT/Cédula aún'
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

            {validationError && (
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/80 dark:bg-rose-950/40 flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{validationError}</span>
              </div>
            )}

            {savedNotice && (
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{savedNotice}</span>
              </div>
            )}

            {/* Preview Table or Empty State */}
            {preview.packages.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {mode === 'daily_global'
                    ? `No se encontraron ventas registradas para la fecha ${effectiveTargetDate}. Selecciona otro día con movimiento de caja.`
                    : mode === 'specific_order'
                    ? 'Selecciona un pedido en el listado superior para previsualizar y generar su Factura Electrónica.'
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
            Formato nativo SheetJS (.xlsx) · NIT/Cédula en texto explícito sin pérdida de ceros
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
              <span>
                {mode === 'specific_order'
                  ? 'Generar FE de este Pedido (.xlsx)'
                  : 'Descargar Excel (.xlsx)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
