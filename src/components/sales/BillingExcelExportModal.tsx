import React, { useEffect, useMemo, useState } from 'react';
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
  Save,
  Copy,
  Check,
  MapPin,
  Phone,
  Building2
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
    title: 'Clientes con Factura Electrónica (Lote Contadora)',
    subtitle:
      'Agrupa todos los clientes que pidieron Factura Electrónica con sus datos DIAN completos y sus compras listas para subir.'
  },
  {
    id: 'specific_order',
    title: 'Cliente y Pedido Específico (NIT / Cédula)',
    subtitle:
      'Busca o completa todos los datos fiscales de un cliente y genera la factura exacta de un pedido tomado en mesa.'
  },
  {
    id: 'daily_global',
    title: 'Masivo por Día (Venta Global POS)',
    subtitle:
      'Consolida todas las ventas del día seleccionado a Consumidor Final (222222222222) para cierre global en lote.'
  }
];

const PROVIDER_OPTIONS: Array<{
  id: ExportBillingProvider;
  title: string;
  badge: string;
  columnsSummary: string;
}> = [
  {
    id: 'siigo',
    title: 'Paquete Siigo Nube (.xlsx · Facturas + Terceros)',
    badge: 'Recomendado Siigo',
    columnsSummary:
      'Hoja 1: Comprobantes FV-1 (Base ÷1.08 INC / ÷1.19 IVA) · Hoja 2: Importación de Terceros/Clientes (Cód. DIAN, DV, Ciudad DANE, Correo FE) · Hoja 3: Cuadre de Caja'
  },
  {
    id: 'alegra',
    title: 'Paquete Alegra (.xlsx · Facturas + Contactos)',
    badge: 'Alegra Cloud',
    columnsSummary:
      'Hoja 1: Facturas de Venta (AAAA-MM-DD, Precio base sin impuesto, Impuesto) · Hoja 2: Contactos con Correo para envío directo al cliente · Hoja 3: Totales'
  },
  {
    id: 'world_office',
    title: 'Plantilla World Office / Loggro / Siigo Pyme (.xlsx)',
    badge: 'Contable ERP',
    columnsSummary:
      'Estructura contable colombiana con NIT, DV separado, Dirección, Código DANE, % y Valor IVA 19%, % y Valor Impoconsumo 8% y Forma de Pago'
  },
  {
    id: 'chinmi',
    title: 'Sabana Maestra Contadora · Otros Proveedores DIAN (.xlsx)',
    badge: 'Universal DIAN',
    columnsSummary:
      'Une en una sola tabla 100% de los datos fiscales del cliente + 100% de la compra para Facturatech, MisFacturas, Gosocket, Cadena o Portal DIAN'
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
  const [provider, setProvider] = useState<ExportBillingProvider>('siigo');
  const [exportDate, setExportDate] = useState<string>(todayKey);
  const [filterCustomerByDate, setFilterCustomerByDate] = useState<boolean>(false);
  const [onlyPendingFeInBatch, setOnlyPendingFeInBatch] = useState<boolean>(true);
  const [markBatchIssuedOnDownload, setMarkBatchIssuedOnDownload] = useState<boolean>(false);
  const [excludeIndividualFeFromGlobal, setExcludeIndividualFeFromGlobal] = useState<boolean>(true);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);
  const [fichaCopied, setFichaCopied] = useState<boolean>(false);

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
    const hasRealSaleCustomer =
      Boolean(normDoc.baseWithoutDv && normDoc.baseWithoutDv !== '222222222222') &&
      resolved.documentType !== 'CONSUMIDOR_FINAL';

    if (hasRealSaleCustomer) {
      const cleanType = resolved.documentType;
      const computedDv =
        resolved.dv || (cleanType === 'NIT' ? calculateColombiaNitDV(normDoc.baseWithoutDv) : '');
      const pType: CustomerPersonType =
        resolved.personType || (cleanType === 'NIT' ? 'juridica' : 'natural');
      setCustDocType(cleanType);
      setCustDocNumber(normDoc.baseWithoutDv);
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

    const hasPendingFe = sales.some(
      (s) => isElectronicInvoiceSale(s) && s.electronicInvoiceStatus !== 'emitida'
    );
    const hasAnyFe = sales.some((s) => isElectronicInvoiceSale(s));

    const resolvedMode: ExportGroupingMode =
      initialMode ||
      (initialSaleId
        ? 'specific_order'
        : initialInvoiceFilter === 'electronic' || hasAnyFe
        ? 'by_customer'
        : 'daily_global');

    setMode(resolvedMode);
    setOnlyPendingFeInBatch(hasPendingFe);
    setMarkBatchIssuedOnDownload(false);

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
    const sameAddress =
      !found.address || custAddress.trim().toLowerCase() === found.address.toLowerCase();
    if (sameName && sameEmail && sameAddress) return null;
    return found;
  }, [custDocNumber, custName, custEmail, custAddress, knownCustomers]);

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
      email: custEmail.trim().toLowerCase(),
      phone: custPhone.trim(),
      city: custCity.trim(),
      department: resolvedCityDane?.department,
      cityCode: resolvedCityDane?.cityCode,
      departmentCode: resolvedCityDane?.departmentCode,
      address: custAddress.trim(),
      taxRegime: custTaxRegime,
      fiscalResponsibility: custFiscalResp,
      requiresElectronicInvoice: true
    });
  };

  const customerOverride = useMemo<Partial<CustomerBillingInfo> | null>(() => {
    if (mode !== 'specific_order') return null;
    return buildCurrentSpecificBillingInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    custName,
    custDocType,
    custDocNumber,
    custDv,
    custPersonType,
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
      appName,
      excludeIndividualFeFromGlobal,
      onlyPendingFeInBatch,
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

  const handleDownload = () => {
    if (mode === 'specific_order') {
      if (!validateSpecificCustomerFields()) return;
      if (selectedSale && onSaveSaleBilling) {
        const fullBilling = buildCurrentSpecificBillingInfo();
        onSaveSaleBilling(
          selectedSale.id,
          fullBilling,
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
      onlyPendingElectronicInvoices: mode === 'by_customer' ? onlyPendingFeInBatch : false,
      selectedSaleId,
      customerOverride
    });

    if (result.success) {
      setDownloadedFile(result.filename);
      if (mode === 'specific_order' && selectedSale) {
        setSavedNotice(
          markIssuedOnDownload
            ? `Datos guardados y pedido #${selectedSale.id.slice(-6)} marcado como FE Emitida.`
            : `Datos fiscales completos guardados en el pedido #${selectedSale.id.slice(-6)}.`
        );
      } else if (
        mode === 'by_customer' &&
        markBatchIssuedOnDownload &&
        onBulkMarkIssued &&
        result.exportedTicketIds.length > 0
      ) {
        onBulkMarkIssued(result.exportedTicketIds, 'emitida');
        setSavedNotice(
          `${result.exportedTicketIds.length} venta(s) exportadas y marcadas como FE Emitida.`
        );
      }
    }
  };

  const readinessChecks = useMemo(() => {
    const hasDoc = Boolean(custDocNumber.trim());
    const hasName = Boolean(custName.trim());
    const hasEmail = isValidEmailFormat(custEmail);
    const hasLocation = Boolean(custCity.trim() || custAddress.trim());
    return { hasDoc, hasName, hasEmail, hasLocation };
  }, [custDocNumber, custName, custEmail, custCity, custAddress]);

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
                Centro Contable y Facturación Electrónica (.xlsx)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Datos completos del cliente (DIAN / Terceros) + Detalle de compra listo para subir a Siigo, Alegra, World Office y otros
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
                1. ¿Qué deseas preparar para subir al proveedor de facturación?
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                Incluye Terceros + Productos + Impuestos desglosados
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

            {/* Contextual Controls for daily_global and by_customer */}
            {mode !== 'specific_order' && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {mode === 'daily_global' ? 'Día de caja a consolidar:' : 'Periodo de ventas FE:'}
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
                      Excluir {dayIndividualFeCount} ticket(s) con FE individual para no facturar doble
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* Panel dedicado cuando mode === 'specific_order': Buscar por NIT / Cédula + Ficha Completa del Cliente y Compra */}
            {mode === 'specific_order' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                {/* Barra de búsqueda por NIT / Cédula y filtro de fecha */}
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
                            ? 'Directorio de clientes encontrados (clic para cargar todos sus datos DIAN):'
                            : 'Directorio reciente de clientes con NIT / Cédula:'}
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

                {/* Lista de pedidos específicos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Selecciona la compra / pedido tomado ({matchingOrdersForSpecificMode.length}{' '}
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
                      <span>
                        No se encontraron pedidos con el NIT/Cédula buscado. Activa ver tickets de Consumidor Final para asignarle la compra a este cliente.
                      </span>
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

                {/* Detalle Completo de la Compra + Datos Fiscales DIAN del Cliente */}
                {selectedSale && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                    {/* Columna Compra: Productos, SKUs, Impuestos y Medio de Pago */}
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
                            <span>Propina (no gravada):</span>
                            <span>+{formatCOP(selectedSale.tipAmount)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="font-sans text-slate-600 dark:text-slate-300 font-semibold">
                            Total Cobrado:
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {formatCOP(selectedSale.total)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Columna Cliente: Ficha Fiscal DIAN Completa para Siigo / Proveedores */}
                    <div className="lg:col-span-7 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Datos Fiscales del Cliente (Para Siigo / DIAN)</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleCopyAccountantFicha}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer whitespace-nowrap"
                            title="Copiar ficha completa del cliente y su compra para WhatsApp o contabilidad"
                          >
                            {fichaCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">Ficha copiada</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-orange-500" />
                                <span>Copiar Ficha Contadora</span>
                              </>
                            )}
                          </button>

                          {onSaveSaleBilling && (
                            <button
                              type="button"
                              onClick={handleSaveCustomerToOrderOnly}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition cursor-pointer whitespace-nowrap"
                              title="Guardar todos estos datos del cliente en el pedido"
                            >
                              <Save className="w-3 h-3" />
                              <span>Guardar datos</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Checklist visual rápido de completitud para la Contadora */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            readinessChecks.hasDoc
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>NIT/Cédula</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            readinessChecks.hasName
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Razón Social</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            readinessChecks.hasEmail
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Correo envío cliente</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            readinessChecks.hasLocation
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Dirección / Ciudad DANE</span>
                        </span>
                      </div>

                      {/* Fila 1: Tipo Doc + Número + DV + Tipo Persona */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Tipo Doc. (Cód. DIAN {getDianDocumentTypeCode(custDocType)}) *
                          </label>
                          <select
                            value={custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType}
                            onChange={(e) => {
                              const nextType = e.target.value as CustomerDocumentType;
                              setCustDocType(nextType);
                              if (nextType === 'NIT') {
                                setCustPersonType('juridica');
                                setCustTaxRegime('responsable_iva');
                                setCustDv(calculateColombiaNitDV(custDocNumber));
                              } else {
                                setCustPersonType('natural');
                                setCustDv('');
                              }
                              setValidationError(null);
                              setDownloadedFile(null);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          >
                            {DOCUMENT_TYPE_OPTIONS.filter((o) => o.value !== 'CONSUMIDOR_FINAL').map(
                              (opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.shortLabel} ({opt.dianCode})
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className={custDocType === 'NIT' ? 'sm:col-span-4' : 'sm:col-span-5'}>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            {custDocType === 'NIT' ? 'NIT (Sin DV) *' : 'Número Identificación *'}
                          </label>
                          <input
                            type="text"
                            value={custDocNumber}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              if (rawVal.includes('-')) {
                                const [base, dvPart = ''] = rawVal.split('-');
                                setCustDocNumber(base.trim());
                                setCustDocType('NIT');
                                setCustPersonType('juridica');
                                setCustTaxRegime('responsable_iva');
                                setCustDv(dvPart.trim() || calculateColombiaNitDV(base));
                              } else {
                                setCustDocNumber(rawVal);
                                if (custDocType === 'NIT') {
                                  setCustDv(calculateColombiaNitDV(rawVal));
                                }
                              }
                              setValidationError(null);
                              setSavedNotice(null);
                              setDownloadedFile(null);
                            }}
                            placeholder={custDocType === 'NIT' ? '900123456' : '1020304050'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>

                        {custDocType === 'NIT' && (
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              DV
                            </label>
                            <input
                              type="text"
                              maxLength={1}
                              value={custDv}
                              onChange={(e) => setCustDv(e.target.value.replace(/\D/g, ''))}
                              placeholder="0"
                              title="Dígito de Verificación DIAN (calculado automáticamente por Módulo 11)"
                              className="w-full px-1.5 py-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 focus:outline-hidden"
                            />
                          </div>
                        )}

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Tipo Persona
                          </label>
                          <select
                            value={custPersonType}
                            onChange={(e) =>
                              setCustPersonType(e.target.value as CustomerPersonType)
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                          >
                            <option value="natural">Natural</option>
                            <option value="juridica">Jurídica</option>
                          </select>
                        </div>
                      </div>

                      {inlineDocProfileSuggestion && (
                        <button
                          type="button"
                          onClick={() => handleSelectProfile(inlineDocProfileSuggestion)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-left text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="truncate">
                            Cliente encontrado en historial:{' '}
                            <strong>{inlineDocProfileSuggestion.customerName}</strong>
                            {inlineDocProfileSuggestion.email
                              ? ` · ${inlineDocProfileSuggestion.email}`
                              : ''}
                          </span>
                          <span className="font-bold shrink-0 underline">Cargar ficha completa</span>
                        </button>
                      )}

                      {/* Fila 2: Nombre / Razón Social + Correo Envío Cliente */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            {custPersonType === 'juridica'
                              ? 'Razón Social de la Empresa *'
                              : 'Nombres y Apellidos completos *'}
                          </label>
                          <input
                            type="text"
                            value={custName}
                            onChange={(e) => {
                              setCustName(e.target.value);
                              setSavedNotice(null);
                              setDownloadedFile(null);
                            }}
                            placeholder={
                              custPersonType === 'juridica'
                                ? 'Ej. Inversiones Gastronómicas S.A.S.'
                                : 'Ej. Carolina Gómez Restrepo'
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-orange-500 shrink-0" />
                            <span>Correo del cliente (Para envío de la FE) *</span>
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
                            placeholder="facturacion@cliente.com"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                          />
                        </div>
                      </div>

                      {/* Fila 3: Teléfono + Ciudad DANE + Dirección Fiscal */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Teléfono / Celular</span>
                          </label>
                          <input
                            type="tel"
                            value={custPhone}
                            onChange={(e) => setCustPhone(e.target.value)}
                            placeholder="3001234567"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Ciudad</span>
                            </label>
                            {resolvedCityDane && (
                              <span className="text-[9px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                                DANE {resolvedCityDane.cityCode}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            list="modal-colombia-cities"
                            value={custCity}
                            onChange={(e) => setCustCity(e.target.value)}
                            placeholder="Bogotá D.C., Medellín..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                          <datalist id="modal-colombia-cities">
                            {COLOMBIAN_CITIES_DANE.map((c) => (
                              <option key={c.cityCode} value={c.city}>
                                {c.department} ({c.cityCode})
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Dirección Fiscal
                          </label>
                          <input
                            type="text"
                            value={custAddress}
                            onChange={(e) => setCustAddress(e.target.value)}
                            placeholder="Cra 15 # 85-30"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Fila 4: Régimen Tributario + Responsabilidad Fiscal DIAN */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Régimen Tributario
                          </label>
                          <select
                            value={custTaxRegime}
                            onChange={(e) => {
                              const nextReg = e.target.value as CustomerTaxRegime;
                              setCustTaxRegime(nextReg);
                              const regMeta = TAX_REGIME_OPTIONS.find((r) => r.value === nextReg);
                              if (regMeta) setCustFiscalResp(regMeta.defaultFiscalCode);
                            }}
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
                          Guardar todos estos datos del cliente en la compra y marcar como FE Emitida al descargar
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
                2. Elige el Proveedor de Facturación Electrónica de tu Contadora
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Incluye hoja de Clientes/Terceros + hoja de Facturas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {prov.title}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          · {prov.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                        {prov.columnsSummary}
                      </p>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Vista Previa del Paquete Contable
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Hojas: {preview.includedSheets.join(' · ')}
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[340px]">
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
                    ? 'Tercero Receptor'
                    : 'Facturas a Subir'}
                </span>
                <p className="text-xs sm:text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 truncate">
                  {mode === 'daily_global'
                    ? `${preview.totalInvoicesCount} lote · ${preview.totalTicketsCount} tkt`
                    : mode === 'specific_order'
                    ? custDocNumber.trim()
                      ? `${custDocType === 'CONSUMIDOR_FINAL' ? 'CC' : custDocType} ${custDocNumber.trim()}${
                          custDocType === 'NIT' && custDv ? `-${custDv}` : ''
                        }`
                      : 'Sin NIT/Cédula aún'
                    : `${preview.totalInvoicesCount} cliente(s) · ${preview.totalTicketsCount} tkt`}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Base Gravable Sin Impuesto
                </span>
                <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalTaxableBase))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  INC 8% · IVA 19%
                </span>
                <p className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatCOP(Math.round(preview.totalIncAmount))} ·{' '}
                  {formatCOP(Math.round(preview.totalIvaAmount))}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Total Factura DIAN
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
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-300 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {mode === 'daily_global'
                      ? `No se encontraron ventas registradas para la fecha ${effectiveTargetDate}.`
                      : mode === 'specific_order'
                      ? 'Selecciona un pedido en el listado superior para previsualizar su Factura Electrónica.'
                      : onlyPendingFeInBatch
                      ? 'No hay Facturas Electrónicas pendientes por subir en este filtro. Desmarca "Solo pendientes por subir" si deseas volver a descargar las ya emitidas.'
                      : effectiveTargetDate
                      ? `No hay clientes con solicitud de Factura Electrónica el día ${effectiveTargetDate}.`
                      : 'Aún no hay ventas marcadas con solicitud de Factura Electrónica.'}
                  </span>
                </div>
                {mode === 'by_customer' && onlyPendingFeInBatch && (
                  <button
                    type="button"
                    onClick={() => setOnlyPendingFeInBatch(false)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[11px] font-bold text-amber-800 dark:text-amber-300 cursor-pointer whitespace-nowrap"
                  >
                    Incluir ya emitidas
                  </button>
                )}
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
                {preview.totalLinesCount > preview.previewRows.length && (
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                    Mostrando primeras {preview.previewRows.length} de {preview.totalLinesCount}{' '}
                    líneas totales incluidas en el paquete .xlsx
                  </div>
                )}
              </div>
            )}

            {downloadedFile && (
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Paquete listo para la contadora: <strong className="font-mono">{downloadedFile}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
            Incluye Terceros DIAN (NIT, DV, Ciudad DANE, Correo FE) + Compra desglosada en texto explícito
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
                  ? 'Descargar Paquete de este Cliente (.xlsx)'
                  : 'Descargar Paquete Contable (.xlsx)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
