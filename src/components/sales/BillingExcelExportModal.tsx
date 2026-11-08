import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CustomerBillingInfo,
  CustomerDocumentType,
  CustomerPersonType,
  CustomerTaxRegime,
  ElectronicInvoiceStatus,
  OrderItem,
  Product,
  SaleReceipt
} from '../../types';
import { formatCOP } from '../../utils/currency';
import {
  calculateColombiaNitDV,
  COLOMBIAN_CITIES_DANE,
  DOCUMENT_TYPE_OPTIONS,
  extractKnownCustomersFromSales,
  FISCAL_RESPONSIBILITY_OPTIONS,
  formatAccountantFichaText,
  formatCustomerDocument,
  getDianDocumentTypeCode,
  hasIdentifiedCustomer,
  isElectronicInvoiceSale,
  isValidEmailFormat,
  KnownCustomerProfile,
  matchesDocumentNumberQuery,
  normalizeBillingInfo,
  normalizeDocumentSearchKey,
  resolveColombianCity,
  resolveSaleBillingInfo,
  searchKnownCustomers,
  TAX_REGIME_OPTIONS
} from '../../utils/billing';
import { resolveOrderItemTax } from '../../utils/taxes';
import {
  buildBillingExportPreview,
  downloadBillingExcelFile,
  ExportBillingProvider,
  ExportGroupingMode,
  saleTimestampToDateKey,
  validateBillingExport
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
  AlertTriangle,
  Search,
  Receipt,
  UserCheck,
  Mail,
  Save,
  Copy,
  Check,
  MapPin,
  Phone,
  Building2,
  Upload,
  Info,
  ShieldCheck
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
  onBulkMarkIssued?: (saleIds: string[], status: ElectronicInvoiceStatus) => void;
}

const GROUPING_OPTIONS: Array<{
  id: ExportGroupingMode;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'by_customer',
    title: 'Clientes con Factura Electrónica (Cliente + Pedido)',
    subtitle:
      'Genera por cada cliente su Ficha Fiscal DIAN completa (NIT/CC, DV, Correo, Teléfono, Dirección, Ciudad DANE) + su pedido.'
  },
  {
    id: 'specific_order',
    title: 'Cliente y Pedido Específico (NIT / Cédula)',
    subtitle:
      'Busca o completa los datos de un cliente y descarga en la Hoja 1 todos sus datos fiscales junto a la lista de su pedido.'
  },
  {
    id: 'daily_global',
    title: 'Ventas del Día / Período Completo (Clientes + POS)',
    subtitle:
      'Conserva los datos completos de cada cliente identificado del período y consolida aparte los tickets de Consumidor Final.'
  }
];

const PROVIDER_OPTIONS: Array<{
  id: ExportBillingProvider;
  title: string;
  badge: string;
  columnsSummary: string;
}> = [
  {
    id: 'chinmi',
    title: 'Excel General Chinmi App (.xlsx)',
    badge: '3 Hojas Oficiales',
    columnsSummary:
      'Hoja 1: Resumen con desglose de impuestos (0%, 8%, 19%) y métodos de pago · Hoja 2: Facturas (1 fila x factura con NITs como texto @) · Hoja 3: Detalle Productos'
  },
  {
    id: 'siigo',
    title: 'Plantilla Siigo Nube (.xlsx)',
    badge: 'Comprobantes FV-1',
    columnsSummary:
      'Hoja 1: Comprobantes de ventas FV-1 con identificación en texto (@) sin perder ceros · Hoja 2: Terceros Siigo. Soporta adjuntar plantilla oficial'
  },
  {
    id: 'alegra',
    title: 'Plantilla Alegra (.xlsx)',
    badge: 'Alegra Cloud',
    columnsSummary:
      'Hoja 1: Facturas Alegra · Hoja 2: Contactos Alegra con correo FE. Registro masivo de facturas con posterior timbrado y emisión en Alegra'
  },
  {
    id: 'loggro',
    title: 'Plantilla Loggro (.xlsx)',
    badge: 'ERP Restaurantes',
    columnsSummary:
      'Estructura oficial de 2 hojas vinculadas: 1_Encabezado y 2_Detalles vinculadas por Consecutivo Factura + 3_Terceros_Loggro'
  },
  {
    id: 'dian_support',
    title: 'Reporte de Soporte para DIAN / Contador (.xlsx)',
    badge: 'Conciliación Fiscal',
    columnsSummary:
      'Hoja 1: Resumen Tributario (con advertencia legal) · Hoja 2: Libro Ventas y Terceros (Exógena) · Hoja 3: Detalle Gravamen Productos por tarifa'
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
  onSaveSaleBilling,
  onBulkMarkIssued
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

  const [mode, setMode] = useState<ExportGroupingMode>('by_customer');
  const [provider, setProvider] = useState<ExportBillingProvider>('chinmi');
  const [dateSelectionType, setDateSelectionType] = useState<'single' | 'range' | 'all'>('single');
  const [exportDate, setExportDate] = useState<string>(todayKey);
  const [exportEndDate, setExportEndDate] = useState<string>(todayKey);
  const [filterCustomerByDate, setFilterCustomerByDate] = useState<boolean>(false);
  const [onlyPendingFeInBatch, setOnlyPendingFeInBatch] = useState<boolean>(false);
  const [markBatchIssuedOnDownload, setMarkBatchIssuedOnDownload] = useState<boolean>(false);
  const [excludeIndividualFeFromGlobal, setExcludeIndividualFeFromGlobal] = useState<boolean>(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);
  const [fichaCopied, setFichaCopied] = useState<boolean>(false);

  // Soporte de plantilla personalizada Siigo
  const [customTemplateFile, setCustomTemplateFile] = useState<{
    name: string;
    buffer: ArrayBuffer;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado exclusivo para "Cliente y Pedido Específico (NIT / Cédula)"
  const [specificSearchQuery, setSpecificSearchQuery] = useState<string>('');
  const [specificFilterByDate, setSpecificFilterByDate] = useState<boolean>(false);
  const [includeUnassignedOrdersInSearch, setIncludeUnassignedOrdersInSearch] = useState<boolean>(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  // Formulario fiscal completo del cliente para el pedido elegido
  const [custDocType, setCustDocType] = useState<CustomerDocumentType>('CC');
  const [custDocNumber, setCustDocNumber] = useState<string>('');
  const [custDv, setCustDv] = useState<string>('');
  const [custPersonType, setCustPersonType] = useState<CustomerPersonType>('natural');
  const [custName, setCustName] = useState<string>('');
  const [custEmail, setCustEmail] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custCity, setCustCity] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custTaxRegime, setCustTaxRegime] = useState<CustomerTaxRegime>('no_responsable_iva');
  const [custFiscalResp, setCustFiscalResp] = useState<string>('R-99-PN');
  const [markIssuedOnDownload, setMarkIssuedOnDownload] = useState<boolean>(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState<boolean>(false);

  const hydrateCustomerFormFromProfile = (prof: KnownCustomerProfile) => {
    const cleanType = prof.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : prof.documentType;
    const normDoc = normalizeDocumentSearchKey(prof.documentNumber);
    const computedDv =
      prof.dv || (cleanType === 'NIT' ? calculateColombiaNitDV(normDoc.baseWithoutDv) : '');
    const pType: CustomerPersonType =
      prof.personType || (cleanType === 'NIT' ? 'juridica' : 'natural');
    const reg: CustomerTaxRegime =
      prof.taxRegime || (pType === 'juridica' ? 'responsable_iva' : 'no_responsable_iva');

    setCustDocType(cleanType);
    setCustDocNumber(normDoc.baseWithoutDv || prof.documentNumber);
    setCustDv(computedDv);
    setCustPersonType(pType);
    setCustName(prof.customerName);
    setCustEmail(prof.email || '');
    setCustPhone(prof.phone || '');
    setCustCity(prof.city || '');
    setCustAddress(prof.address || '');
    setCustTaxRegime(reg);
    setCustFiscalResp(prof.fiscalResponsibility || 'R-99-PN');
  };

  const hydrateCustomerFormFromSale = (
    sale: SaleReceipt | undefined,
    fallbackQuery?: string
  ) => {
    if (!sale) return;
    const resolved = resolveSaleBillingInfo(sale);
    const normDoc = normalizeDocumentSearchKey(resolved.documentNumber);
    const hasRealDoc =
      Boolean(normDoc.baseWithoutDv && normDoc.baseWithoutDv !== '222222222222') &&
      resolved.documentType !== 'CONSUMIDOR_FINAL';
    const hasRealCustomCustomer =
      hasRealDoc ||
      Boolean(
        (resolved.customerName && resolved.customerName.toLowerCase() !== 'consumidor final') ||
          resolved.email ||
          resolved.phone ||
          resolved.address ||
          resolved.city
      );

    if (hasRealCustomCustomer) {
      const cleanType =
        resolved.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : resolved.documentType;
      const cleanBase =
        normDoc.baseWithoutDv && normDoc.baseWithoutDv !== '222222222222'
          ? normDoc.baseWithoutDv
          : '';
      const computedDv =
        resolved.dv ||
        (cleanType === 'NIT' && cleanBase ? calculateColombiaNitDV(cleanBase) : '');
      const pType: CustomerPersonType =
        resolved.personType || (cleanType === 'NIT' ? 'juridica' : 'natural');
      setCustDocType(cleanType);
      setCustDocNumber(cleanBase);
      setCustDv(computedDv);
      setCustPersonType(pType);
      setCustName(
        resolved.customerName && resolved.customerName.toLowerCase() !== 'consumidor final'
          ? resolved.customerName
          : ''
      );
      setCustEmail(resolved.email || '');
      setCustPhone(resolved.phone || '');
      setCustCity(resolved.city || '');
      setCustAddress(resolved.address || '');
      setCustTaxRegime(
        resolved.taxRegime || (pType === 'juridica' ? 'responsable_iva' : 'no_responsable_iva')
      );
      setCustFiscalResp(resolved.fiscalResponsibility || 'R-99-PN');
      return;
    }

    const q = (fallbackQuery ?? specificSearchQuery).trim();
    if (q) {
      const matched = searchKnownCustomers(knownCustomers, q, 1)[0];
      if (matched && matchesDocumentNumberQuery(matched.documentNumber, q)) {
        hydrateCustomerFormFromProfile(matched);
        return;
      }
      const normQ = normalizeDocumentSearchKey(q);
      if (/^\d{5,15}$/.test(normQ.baseWithoutDv)) {
        const inferredType: CustomerDocumentType = q.includes('-') ? 'NIT' : 'CC';
        setCustDocType(inferredType);
        setCustDocNumber(normQ.baseWithoutDv);
        setCustDv(inferredType === 'NIT' ? calculateColombiaNitDV(normQ.baseWithoutDv) : '');
        setCustPersonType(inferredType === 'NIT' ? 'juridica' : 'natural');
        setCustName(
          resolved.customerName && resolved.customerName.toLowerCase() !== 'consumidor final'
            ? resolved.customerName
            : ''
        );
        setCustEmail(resolved.email || '');
        setCustPhone(resolved.phone || '');
        setCustCity(resolved.city || '');
        setCustAddress(resolved.address || '');
        setCustTaxRegime(inferredType === 'NIT' ? 'responsable_iva' : 'no_responsable_iva');
        setCustFiscalResp('R-99-PN');
        return;
      }
    }

    setCustDocType('CC');
    setCustDocNumber('');
    setCustDv('');
    setCustPersonType('natural');
    setCustName(
      resolved.customerName && resolved.customerName.toLowerCase() !== 'consumidor final'
        ? resolved.customerName
        : ''
    );
    setCustEmail(resolved.email || '');
    setCustPhone(resolved.phone || '');
    setCustCity(resolved.city || '');
    setCustAddress(resolved.address || '');
    setCustTaxRegime('no_responsable_iva');
    setCustFiscalResp('R-99-PN');
  };

  useEffect(() => {
    if (!isOpen) return;
    setDownloadedFile(null);
    setSavedNotice(null);
    setValidationError(null);
    setFichaCopied(false);
    setCustomTemplateFile(null);

    const hasPendingFe = sales.some(
      (s) => hasIdentifiedCustomer(s) && s.electronicInvoiceStatus !== 'emitida'
    );
    const hasAnyCustomerSale = sales.some((s) => hasIdentifiedCustomer(s));

    const resolvedMode: ExportGroupingMode =
      initialMode ||
      (initialSaleId
        ? 'specific_order'
        : initialInvoiceFilter === 'electronic' || hasAnyCustomerSale
        ? 'by_customer'
        : 'daily_global');

    setMode(resolvedMode);
    setOnlyPendingFeInBatch(hasPendingFe);
    setMarkBatchIssuedOnDownload(false);
    setExcludeIndividualFeFromGlobal(false);

    if (initialSelectedDate) {
      setExportDate(initialSelectedDate);
      setExportEndDate(initialSelectedDate);
      setDateSelectionType('single');
      setFilterCustomerByDate(true);
      setSpecificFilterByDate(false);
    } else {
      const hasSalesToday = sales.some((s) => saleTimestampToDateKey(s.timestamp) === todayKey);
      const defDate = hasSalesToday ? todayKey : latestSaleDateKey;
      setExportDate(defDate);
      setExportEndDate(defDate);
      setDateSelectionType('single');
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
      setCustDv('');
      setCustPersonType('natural');
      setCustName('');
      setCustEmail('');
      setCustPhone('');
      setCustCity('');
      setCustAddress('');
      setCustTaxRegime('no_responsable_iva');
      setCustFiscalResp('R-99-PN');
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

  const matchedCustomerProfiles = useMemo(() => {
    if (!specificSearchQuery.trim()) {
      return knownCustomers.slice(0, 4);
    }
    return searchKnownCustomers(knownCustomers, specificSearchQuery, 5);
  }, [knownCustomers, specificSearchQuery]);

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

      if (matchesDocumentNumberQuery(storedDoc, q)) return true;
      if (!includeUnassignedOrdersInSearch && storedDocType === 'CONSUMIDOR_FINAL') {
        const normQ = normalizeDocumentSearchKey(q);
        if (normQ.baseWithoutDv.length >= 6) return false;
      }

      const name = (
        sale.customerName ||
        sale.billingInfo?.customerName ||
        'consumidor final'
      ).toLowerCase();
      const email = (sale.customerEmail || sale.billingInfo?.email || '').toLowerCase();
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
    if (mode === 'specific_order') {
      return selectedSale ? saleTimestampToDateKey(selectedSale.timestamp) : '';
    }
    if (mode === 'daily_global') {
      if (dateSelectionType === 'all') return '';
      return exportDate || todayKey;
    }
    // mode === 'by_customer'
    return filterCustomerByDate ? exportDate : '';
  }, [mode, dateSelectionType, exportDate, filterCustomerByDate, todayKey, selectedSale]);

  const effectiveEndDate = useMemo(() => {
    if (mode === 'daily_global' && dateSelectionType === 'range') {
      return exportEndDate || exportDate;
    }
    return effectiveTargetDate;
  }, [mode, dateSelectionType, exportEndDate, exportDate, effectiveTargetDate]);

  const dayIndividualFeCount = useMemo(() => {
    if (mode !== 'daily_global') return 0;
    const target = exportDate || todayKey;
    return sales.filter(
      (s) => saleTimestampToDateKey(s.timestamp) === target && isElectronicInvoiceSale(s)
    ).length;
  }, [mode, exportDate, todayKey, sales]);

  const resolvedCityDane = useMemo(() => resolveColombianCity(custCity), [custCity]);

  const buildCurrentSpecificBillingInfo = (): CustomerBillingInfo => {
    const cleanBaseDoc = normalizeDocumentSearchKey(custDocNumber).baseWithoutDv || custDocNumber.trim();
    const effectiveType = custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType;
    const effectiveDv =
      effectiveType === 'NIT'
        ? (custDv.trim() || calculateColombiaNitDV(cleanBaseDoc))
        : '';
    const fullDoc =
      effectiveType === 'NIT' && effectiveDv ? `${cleanBaseDoc}-${effectiveDv}` : cleanBaseDoc;

    return normalizeBillingInfo({
      customerName: custName.trim() || 'Cliente Factura Electrónica',
      documentType: effectiveType,
      documentNumber: fullDoc,
      dv: effectiveDv,
      personType: custPersonType,
      email: custEmail.trim(),
      phone: custPhone.trim(),
      city: custCity.trim(),
      address: custAddress.trim(),
      cityCode: resolvedCityDane?.cityCode || '',
      department: resolvedCityDane?.department || '',
      departmentCode: resolvedCityDane?.departmentCode || '',
      taxRegime: custTaxRegime,
      fiscalResponsibility: custFiscalResp || 'R-99-PN',
      requiresElectronicInvoice: true
    });
  };

  const customerOverride = useMemo(() => {
    if (mode !== 'specific_order') return null;
    return buildCurrentSpecificBillingInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    custDocType,
    custDocNumber,
    custDv,
    custPersonType,
    custName,
    custEmail,
    custPhone,
    custCity,
    custAddress,
    custTaxRegime,
    custFiscalResp
  ]);

  const preview = useMemo(
    () =>
      buildBillingExportPreview({
        sales,
        productsCatalog,
        mode,
        provider,
        targetDate: effectiveTargetDate,
        endDate: effectiveEndDate,
        appName,
        excludeIndividualFeFromGlobal,
        onlyPendingElectronicInvoices: mode === 'by_customer' ? onlyPendingFeInBatch : false,
        selectedSaleId,
        customerOverride
      }),
    [
      sales,
      productsCatalog,
      mode,
      provider,
      effectiveTargetDate,
      effectiveEndDate,
      appName,
      excludeIndividualFeFromGlobal,
      onlyPendingFeInBatch,
      selectedSaleId,
      customerOverride
    ]
  );

  const validationReport = useMemo(
    () =>
      validateBillingExport(
        {
          sales,
          productsCatalog,
          mode,
          provider,
          targetDate: effectiveTargetDate,
          endDate: effectiveEndDate,
          appName,
          excludeIndividualFeFromGlobal,
          onlyPendingElectronicInvoices: mode === 'by_customer' ? onlyPendingFeInBatch : false,
          selectedSaleId,
          customerOverride
        },
        preview
      ),
    [
      sales,
      productsCatalog,
      mode,
      provider,
      effectiveTargetDate,
      effectiveEndDate,
      appName,
      excludeIndividualFeFromGlobal,
      onlyPendingFeInBatch,
      selectedSaleId,
      customerOverride,
      preview
    ]
  );

  if (!isOpen) return null;

  const handleSelectProfile = (profile: KnownCustomerProfile) => {
    setValidationError(null);
    setSavedNotice(null);
    setDownloadedFile(null);
    setSpecificSearchQuery(profile.documentNumber);
    hydrateCustomerFormFromProfile(profile);

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
    setFichaCopied(false);

    const rawDocNum = (sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '').trim();
    const rawDocType =
      (sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL') as CustomerDocumentType;

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
    const fullBilling = buildCurrentSpecificBillingInfo();
    onSaveSaleBilling(
      selectedSale.id,
      fullBilling,
      selectedSale.electronicInvoiceStatus === 'emitida' ? 'emitida' : 'pendiente'
    );
    setSavedNotice(
      `Datos completos de ${fullBilling.customerName} (${formatCustomerDocument(
        fullBilling.documentType,
        fullBilling.documentNumber,
        fullBilling.dv
      )}) guardados en el pedido #${selectedSale.id.slice(-6)}.`
    );
  };

  const handleCopyAccountantFicha = () => {
    if (!selectedSale) return;
    const fullBilling = buildCurrentSpecificBillingInfo();
    const tempSale: SaleReceipt = {
      ...selectedSale,
      customerName: fullBilling.customerName,
      customerDocumentType: fullBilling.documentType,
      customerDocumentNumber: fullBilling.documentNumber,
      customerEmail: fullBilling.email || '',
      requiresElectronicInvoice: true,
      billingInfo: fullBilling
    };
    const fichaText = formatAccountantFichaText(tempSale, productsCatalog);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fichaText).catch(() => {});
      setFichaCopied(true);
      setTimeout(() => setFichaCopied(false), 2600);
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const buffer = evt.target?.result as ArrayBuffer;
      setCustomTemplateFile({ name: file.name, buffer });
      setDownloadedFile(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownload = () => {
    let effectiveSales = sales;
    let effectiveOverride = customerOverride;

    if (mode === 'specific_order') {
      if (!validateSpecificCustomerFields()) return;
      if (selectedSale) {
        const fullBilling = buildCurrentSpecificBillingInfo();
        effectiveOverride = fullBilling;
        if (onSaveSaleBilling) {
          onSaveSaleBilling(
            selectedSale.id,
            fullBilling,
            markIssuedOnDownload ? 'emitida' : undefined
          );
        }
        effectiveSales = sales.map((s) =>
          s.id === selectedSale.id
            ? {
                ...s,
                customerName: fullBilling.customerName,
                customerDocumentType: fullBilling.documentType,
                customerDocumentNumber: fullBilling.documentNumber,
                customerEmail: fullBilling.email || s.customerEmail || '',
                requiresElectronicInvoice: true,
                billingInfo: fullBilling
              }
            : s
        );
      }
    }

    const result = downloadBillingExcelFile({
      sales: effectiveSales,
      productsCatalog,
      mode,
      provider,
      targetDate: effectiveTargetDate,
      endDate: effectiveEndDate,
      appName,
      excludeIndividualFeFromGlobal,
      onlyPendingElectronicInvoices: mode === 'by_customer' ? onlyPendingFeInBatch : false,
      selectedSaleId,
      customerOverride: effectiveOverride,
      customTemplateBuffer: customTemplateFile?.buffer || null
    });

    if (result.success) {
      setDownloadedFile(result.filename);
      if (mode === 'specific_order' && selectedSale) {
        setSavedNotice(
          markIssuedOnDownload
            ? `Datos del cliente y pedido #${selectedSale.id.slice(-6)} descargados y marcados como FE Emitida.`
            : `Datos completos del cliente y pedido #${selectedSale.id.slice(-6)} descargados en Excel.`
        );
      } else if (
        mode === 'by_customer' &&
        markBatchIssuedOnDownload &&
        onBulkMarkIssued &&
        result.exportedTicketIds.length > 0
      ) {
        onBulkMarkIssued(result.exportedTicketIds, 'emitida');
        setSavedNotice(
          `${result.exportedTicketIds.length} venta(s) con datos del cliente exportadas y marcadas como FE Emitida.`
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
        className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[95vh] flex flex-col"
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
                Exportación Profesional de Facturas (.xlsx)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Formatos oficiales para Siigo, Alegra, Loggro, DIAN y Excel general de Chinmi
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
          {/* Step 1: Alcance y Tipo de Exportación */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                1. ¿Qué comprobantes deseas exportar?
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                Facturas con datos completos de clientes e impuestos (0%, 8%, 19%)
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
                      setSavedNotice(null);
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

            {/* Contextual Date Controls */}
            {mode !== 'specific_order' && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Filtro de Fechas:
                  </span>

                  {/* Selector de tipo de fecha */}
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setDateSelectionType('single');
                        setFilterCustomerByDate(true);
                        setDownloadedFile(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        dateSelectionType === 'single'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Día único
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateSelectionType('range');
                        setFilterCustomerByDate(true);
                        setDownloadedFile(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        dateSelectionType === 'range'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Rango de fechas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateSelectionType('all');
                        setFilterCustomerByDate(false);
                        setDownloadedFile(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        dateSelectionType === 'all'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Todo el historial
                    </button>
                  </div>

                  {dateSelectionType === 'single' && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={exportDate}
                        onChange={(e) => {
                          setExportDate(e.target.value);
                          setExportEndDate(e.target.value);
                          setDownloadedFile(null);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                      />
                      {exportDate !== todayKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setExportDate(todayKey);
                            setExportEndDate(todayKey);
                            setDownloadedFile(null);
                          }}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition cursor-pointer whitespace-nowrap"
                        >
                          Hoy
                        </button>
                      )}
                    </div>
                  )}

                  {dateSelectionType === 'range' && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={exportDate}
                        onChange={(e) => {
                          setExportDate(e.target.value);
                          setDownloadedFile(null);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                        title="Fecha inicio"
                      />
                      <span className="text-slate-400 text-xs">hasta</span>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => {
                          setExportEndDate(e.target.value);
                          setDownloadedFile(null);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                        title="Fecha fin"
                      />
                    </div>
                  )}
                </div>

                {mode === 'by_customer' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyPendingFeInBatch}
                        onChange={(e) => {
                          setOnlyPendingFeInBatch(e.target.checked);
                          setDownloadedFile(null);
                        }}
                        className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span>Solo pendientes por subir</span>
                    </label>

                    {onBulkMarkIssued && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={markBatchIssuedOnDownload}
                          onChange={(e) => setMarkBatchIssuedOnDownload(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Marcar como Emitidas al descargar</span>
                      </label>
                    )}
                  </div>
                )}

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
                      Excluir {dayIndividualFeCount} ticket(s) con FE individual
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* Panel para Modo Pedido Específico */}
            {mode === 'specific_order' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span>Buscar cliente por NIT o Cédula y elegir el pedido de la compra</span>
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

                  {matchedCustomerProfiles.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {specificSearchQuery.trim()
                            ? 'Clientes encontrados (clic para cargar datos fiscales):'
                            : 'Clientes recientes con NIT / Cédula:'}
                        </span>
                        {specificSearchQuery.trim() && (
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includeUnassignedOrdersInSearch}
                              onChange={(e) => setIncludeUnassignedOrdersInSearch(e.target.checked)}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>Mostrar también tickets de Consumidor Final</span>
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
                                  {formatCustomerDocument(
                                    prof.documentType,
                                    prof.documentNumber,
                                    prof.dv
                                  )}
                                </span>
                                <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate">
                                  {prof.customerName}
                                  {prof.email ? ` · ${prof.email}` : ''}
                                  {prof.city ? ` · ${prof.city}` : ''}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono tabular-nums font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                                {prof.ordersCount} {prof.ordersCount === 1 ? 'compra' : 'compras'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de pedidos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Selecciona la compra / pedido ({matchingOrdersForSpecificMode.length}{' '}
                      {matchingOrdersForSpecificMode.length === 1 ? 'ticket' : 'tickets'})
                    </span>
                    {selectedSale && (
                      <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                        Activo: #{selectedSale.id.slice(-6)} · {selectedSale.tableName}
                      </span>
                    )}
                  </div>

                  {matchingOrdersForSpecificMode.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                      <span>No se encontraron pedidos con el criterio buscado.</span>
                      <button
                        type="button"
                        onClick={() => setIncludeUnassignedOrdersInSearch(true)}
                        className="px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        Ver tickets Consumidor Final
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                      {matchingOrdersForSpecificMode.slice(0, 40).map((sale) => {
                        const isChosen = sale.id === selectedSaleId;
                        const docLabel = formatCustomerDocument(
                          sale.customerDocumentType || sale.billingInfo?.documentType,
                          sale.customerDocumentNumber || sale.billingInfo?.documentNumber,
                          sale.billingInfo?.dv
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
                            className={`w-full px-3.5 py-2 text-left transition cursor-pointer flex items-center justify-between gap-3 ${
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

                {/* Formulario de cliente para el pedido */}
                {selectedSale && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                    <div className="lg:col-span-5 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span>Datos de la Compra · #{selectedSale.id.slice(-6)}</span>
                          </span>
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {new Date(selectedSale.timestamp).toLocaleDateString('es-CO')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Mesa / Cajero</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                              {selectedSale.tableName} · {selectedSale.cashierName}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Forma de Pago</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize block">
                              {selectedSale.paymentMethod === 'bizum'
                                ? 'Transferencia / QR'
                                : selectedSale.paymentMethod}
                            </span>
                          </div>
                        </div>

                        <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                          {(selectedSale.items || []).map((item, idx) => {
                            const prod = productsCatalog.find((p) => p.id === item.productId);
                            const itemTax = resolveOrderItemTax(
                              item as unknown as Partial<OrderItem> & Record<string, unknown>,
                              productsCatalog,
                              Number(selectedSale.taxPercent) || 8
                            );
                            const lineGross =
                              (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
                            return (
                              <div
                                key={item.id || idx}
                                className="py-1.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono tabular-nums font-bold text-orange-600 dark:text-orange-400 mr-1">
                                    {item.quantity}x
                                  </span>
                                  {prod?.sku && (
                                    <span className="font-mono text-[10px] text-slate-400 mr-1">
                                      [{prod.sku}]
                                    </span>
                                  )}
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

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs font-mono tabular-nums">
                        {selectedSale.discountAmount > 0 && (
                          <div className="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400">
                            <span>Descuento ({selectedSale.discountPercent}%):</span>
                            <span>-{formatCOP(selectedSale.discountAmount)}</span>
                          </div>
                        )}
                        {selectedSale.tipAmount > 0 && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Propina:</span>
                            <span>+{formatCOP(selectedSale.tipAmount)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="font-sans text-slate-600 dark:text-slate-300 font-semibold">
                            Total:
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {formatCOP(selectedSale.total)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Datos Fiscales del Cliente</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleCopyAccountantFicha}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                            title="Copiar datos al portapapeles"
                          >
                            {fichaCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>¡Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span>Copiar Ficha</span>
                              </>
                            )}
                          </button>

                          {onSaveSaleBilling && (
                            <button
                              type="button"
                              onClick={handleSaveCustomerToOrderOnly}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Guardar en Ticket</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Campos del formulario de cliente */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Tipo de Documento
                          </label>
                          <select
                            value={custDocType}
                            onChange={(e) => {
                              const nextType = e.target.value as CustomerDocumentType;
                              setCustDocType(nextType);
                              if (nextType === 'NIT') {
                                setCustPersonType('juridica');
                                setCustTaxRegime('responsable_iva');
                                setCustFiscalResp('O-13');
                                if (custDocNumber) setCustDv(calculateColombiaNitDV(custDocNumber));
                              } else {
                                setCustPersonType('natural');
                                setCustDv('');
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          >
                            {DOCUMENT_TYPE_OPTIONS.filter((d) => d.value !== 'CONSUMIDOR_FINAL').map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.shortLabel} - {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={custDocType === 'NIT' ? 'sm:col-span-6' : 'sm:col-span-8'}>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Número de Documento <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={custDocNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustDocNumber(val);
                              if (custDocType === 'NIT') {
                                setCustDv(calculateColombiaNitDV(val));
                              }
                            }}
                            placeholder="Ej. 900123456"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>

                        {custDocType === 'NIT' && (
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              DV
                            </label>
                            <input
                              type="text"
                              value={custDv}
                              onChange={(e) => setCustDv(e.target.value.replace(/\D/g, '').slice(0, 1))}
                              maxLength={1}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-center font-bold text-slate-900 dark:text-white"
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Nombre Completo o Razón Social <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={custName}
                            onChange={(e) => setCustName(e.target.value)}
                            placeholder="Nombre del cliente o razón social"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Tipo de Persona
                          </label>
                          <select
                            value={custPersonType}
                            onChange={(e) => setCustPersonType(e.target.value as CustomerPersonType)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          >
                            <option value="natural">Persona Natural</option>
                            <option value="juridica">Persona Jurídica (Empresa)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Correo Electrónico (FE) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="email"
                            value={custEmail}
                            onChange={(e) => setCustEmail(e.target.value)}
                            placeholder="facturacion@empresa.com"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Teléfono / WhatsApp
                          </label>
                          <input
                            type="tel"
                            value={custPhone}
                            onChange={(e) => setCustPhone(e.target.value)}
                            placeholder="300 123 4567"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Ciudad / Municipio (DANE)
                          </label>
                          <input
                            type="text"
                            list="modal-colombia-cities"
                            value={custCity}
                            onChange={(e) => setCustCity(e.target.value)}
                            placeholder="Bogotá D.C., Medellín..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          />
                          <datalist id="modal-colombia-cities">
                            {COLOMBIAN_CITIES_DANE.map((c) => (
                              <option key={c.cityCode} value={c.city}>
                                {c.department} ({c.cityCode})
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Dirección Fiscal
                          </label>
                          <input
                            type="text"
                            value={custAddress}
                            onChange={(e) => setCustAddress(e.target.value)}
                            placeholder="Cra 15 # 85-30"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Régimen Tributario
                          </label>
                          <select
                            value={custTaxRegime}
                            onChange={(e) => setCustTaxRegime(e.target.value as CustomerTaxRegime)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          >
                            {TAX_REGIME_OPTIONS.map((reg) => (
                              <option key={reg.value} value={reg.value}>
                                {reg.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Responsabilidad Fiscal DIAN
                          </label>
                          <select
                            value={custFiscalResp}
                            onChange={(e) => setCustFiscalResp(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden"
                          >
                            {FISCAL_RESPONSIBILITY_OPTIONS.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
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
                          Guardar datos del cliente en el ticket y marcar como FE Emitida al descargar
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Formato de Exportación Contable */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                2. Selecciona el Formato de Exportación Contable
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Estructura nativa optimizada por software
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {prov.title}
                        </span>
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                        {prov.badge}
                      </span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug pt-1">
                        {prov.columnsSummary}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Avisos específicos según el proveedor seleccionado */}
            {provider === 'alegra' && (
              <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/80 dark:bg-sky-950/40 flex items-start gap-2.5 text-xs text-sky-900 dark:text-sky-200">
                <Info className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Aviso sobre emisión electrónica en Alegra:</p>
                  <p className="text-[11px] text-sky-800 dark:text-sky-300 leading-relaxed">
                    Al importar este archivo en Alegra, las facturas y contactos quedarán registrados directamente en tu cuenta. La emisión electrónica y timbrado ante la DIAN se efectúa dentro de Alegra con un solo clic tras verificar los comprobantes importados.
                  </p>
                </div>
              </div>
            )}

            {provider === 'dian_support' && (
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Aviso Fiscal / Contador:</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Este documento es un reporte de soporte contable y conciliación tributaria generado por Chinmi App para el contador o revisor fiscal. No sustituye la expedición directa de Factura Electrónica validada con XML y código CUFE ante la DIAN, la cual requiere software tecnológico habilitado por la DIAN.
                  </p>
                </div>
              </div>
            )}

            {provider === 'siigo' && (
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/40 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      Identificaciones formateadas como Texto (@) para nunca perder ceros iniciales.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".xlsx,.xls"
                      onChange={handleTemplateUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {customTemplateFile ? 'Cambiar Plantilla Siigo' : 'Cargar Plantilla Siigo (.xlsx)'}
                      </span>
                    </button>
                    {customTemplateFile && (
                      <button
                        type="button"
                        onClick={() => setCustomTemplateFile(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        title="Quitar plantilla y usar la nativa de Chinmi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {customTemplateFile && (
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-mono">
                    Plantilla personalizada activa: <strong>{customTemplateFile.name}</strong>. Se insertarán los comprobantes directamente en sus columnas.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Auditoría Previa a la Descarga */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Auditoría y Validación Contable Pre-Descarga
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  validationReport.statusSummary === 'perfect'
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : validationReport.statusSummary === 'warnings'
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                }`}
              >
                {validationReport.statusSummary === 'perfect'
                  ? 'Consistencia 100% Verificada'
                  : validationReport.statusSummary === 'warnings'
                  ? `${validationReport.issues.length} Observaciones`
                  : 'Requiere Revisión'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Facturas Auditadas
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {validationReport.totalInvoicesChecked}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Cuadre Matemático
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {validationReport.mathMismatchesCount === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Exacto
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {validationReport.mathMismatchesCount} diferencias
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  NITs / Cédulas FE
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {validationReport.missingCustomerIdsCount === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Completos
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {validationReport.missingCustomerIdsCount} genéricos
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Correos para FE
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {validationReport.missingCustomerEmailsCount === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Válidos
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {validationReport.missingCustomerEmailsCount} pendientes
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Lista de advertencias si existen */}
            {validationReport.issues.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 space-y-1.5 text-xs text-amber-800 dark:text-amber-300">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Observaciones para revisión contable:</span>
                  </span>
                  {validationReport.issues.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowAllIssues(!showAllIssues)}
                      className="text-[11px] font-bold text-amber-700 dark:text-amber-400 underline cursor-pointer"
                    >
                      {showAllIssues ? 'Ver menos' : `Ver todas (${validationReport.issues.length})`}
                    </button>
                  )}
                </div>

                <ul className="space-y-1 text-[11px] list-disc list-inside">
                  {(showAllIssues
                    ? validationReport.issues
                    : validationReport.issues.slice(0, 2)
                  ).map((iss, i) => (
                    <li key={i}>{iss.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Live Fiscal Breakdown & Preview */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Vista Previa del Archivo Generado
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Hojas: {preview.includedSheets.join(' · ')}
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[340px]">
                {preview.suggestedFilename}
              </span>
            </div>

            {/* Métricas Contables */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Base Gravable 0% (Exenta)
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalBase0))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  INC 8% (Base {formatCOP(Math.round(preview.totalBase8))})
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalIncAmount))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  IVA 19% (Base {formatCOP(Math.round(preview.totalBase19))})
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalIvaAmount))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Total Facturado General
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCOP(Math.round(preview.totalChargedAmount))}
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

            {/* Preview Table */}
            {preview.packages.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-300 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    No se encontraron facturas registradas para los filtros seleccionados.
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[680px]">
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
                {preview.totalInvoicesCount > preview.previewRows.length && (
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                    Mostrando primeras {preview.previewRows.length} de {preview.totalInvoicesCount}{' '}
                    facturas totales incluidas en el archivo .xlsx
                  </div>
                )}
              </div>
            )}

            {downloadedFile && (
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Archivo generado con éxito: <strong className="font-mono">{downloadedFile}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden md:inline">
            Formato: <strong>{PROVIDER_OPTIONS.find((p) => p.id === provider)?.title}</strong> · {preview.totalInvoicesCount} facturas
          </span>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
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
                {provider === 'chinmi'
                  ? 'Descargar Excel Chinmi (3 Hojas .xlsx)'
                  : provider === 'siigo'
                  ? 'Descargar Plantilla Siigo Cloud (.xlsx)'
                  : provider === 'alegra'
                  ? 'Descargar Plantilla Alegra (.xlsx)'
                  : provider === 'loggro'
                  ? 'Descargar Plantilla Loggro (.xlsx)'
                  : 'Descargar Reporte Soporte DIAN (.xlsx)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
