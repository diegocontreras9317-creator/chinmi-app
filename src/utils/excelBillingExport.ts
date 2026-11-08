import * as XLSX from 'xlsx';
import {
  CustomerBillingInfo,
  CustomerPersonType,
  CustomerTaxRegime,
  OrderItem,
  PaymentMethod,
  Product,
  ProductTaxType,
  SaleReceipt
} from '../types';
import {
  calculateColombiaNitDV,
  getDianDocumentTypeCode,
  getSaleCustomerEmail,
  hasIdentifiedCustomer,
  isElectronicInvoiceSale,
  isValidEmailFormat,
  resolveColombianCity,
  resolveSaleBillingInfo,
  splitNaturalPersonName,
  TAX_REGIME_OPTIONS
} from './billing';
import { resolveOrderItemTax } from './taxes';

export type ExportGroupingMode = 'daily_global' | 'by_customer' | 'specific_order';
export type ExportBillingProvider =
  | 'chinmi'
  | 'siigo'
  | 'alegra'
  | 'loggro'
  | 'dian_support'
  | 'world_office';

export interface BillingExportParams {
  sales: SaleReceipt[];
  productsCatalog?: Product[];
  mode: ExportGroupingMode;
  provider: ExportBillingProvider;
  /** YYYY-MM-DD local date; start date or single date */
  targetDate: string;
  /** Optional end date for date ranges YYYY-MM-DD */
  endDate?: string;
  appName: string;
  /** Optional establishment NIT */
  businessNit?: string;
  /** Optional establishment Legal Name */
  businessName?: string;
  /** Optional: omit tickets that already requested individual FE when building the daily global invoice */
  excludeIndividualFeFromGlobal?: boolean;
  /** Optional for mode === 'by_customer': export only pending FE sales so the accountant doesn't re-upload issued ones */
  onlyPendingElectronicInvoices?: boolean;
  /** Required when mode === 'specific_order': ID of the exact SaleReceipt order to invoice */
  selectedSaleId?: string;
  /** Optional customer NIT/Cédula/Razón Social/Email/Dirección/Ciudad override for mode === 'specific_order' */
  customerOverride?: Partial<CustomerBillingInfo> | null;
  /** Optional custom .xlsx template buffer uploaded by the user */
  customTemplateBuffer?: ArrayBuffer | null;
  /** If true, places the raw row-1 provider import template as Sheet 1 (for automated robot uploaders) */
  rawImportOnly?: boolean;
}

export interface NormalizedInvoiceLine {
  productId: string;
  sku: string;
  productName: string;
  codeAndName: string;
  quantity: number;
  unitPricePVP: number;
  rawUnitPricePVP: number;
  rawUnitBaseWithoutTax: number;
  discountPercent: number;
  unitBaseWithoutTax: number;
  taxType: ProductTaxType;
  taxRate: number;
  providerTaxLabel: string;
  lineBaseTotal: number;
  lineTaxTotal: number;
  lineGrossTotal: number;
}

export interface ConsolidatedInvoicePackage {
  packageKey: string;
  invoiceDateKey: string; // YYYY-MM-DD
  consecutiveNumber: string; // FV-XXXX
  customerName: string;
  firstName: string;
  lastName: string;
  personType: CustomerPersonType;
  documentType: string;
  dianDocCode: string;
  identification: string; // Explicit string preserving leading zeros (no DV suffix)
  verificationDigit: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  department: string;
  cityCode: string;
  departmentCode: string;
  taxRegime: CustomerTaxRegime;
  fiscalResponsibility: string;
  paymentMethodLabel: string;
  siigoPaymentCode: string;
  tableNames: string;
  cashierNames: string;
  ticketsCount: number;
  ticketIds: string[];
  shortTicketRefs: string;
  documentStatus: 'Emitida' | 'Pendiente';
  lines: NormalizedInvoiceLine[];
  totalBase: number;
  totalBase0: number;
  totalBase8: number;
  totalInc: number;
  totalBase19: number;
  totalIva: number;
  totalDiscount: number;
  totalTip: number;
  totalGrossProducts: number;
  totalChargedWithTip: number;
}

export interface BillingExportPreview {
  packages: ConsolidatedInvoicePackage[];
  filteredTickets: SaleReceipt[];
  totalInvoicesCount: number;
  totalTicketsCount: number;
  totalLinesCount: number;
  totalTaxableBase: number;
  totalBase0: number;
  totalBase8: number;
  totalIncAmount: number;
  totalBase19: number;
  totalIvaAmount: number;
  totalDiscountAmount: number;
  totalTipsAmount: number;
  totalGrossProducts: number;
  totalChargedAmount: number;
  previewHeaders: string[];
  previewRows: Array<Array<string | number>>;
  includedSheets: string[];
  suggestedFilename: string;
}

export interface BillingValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  invoiceRef?: string;
}

export interface BillingValidationReport {
  isValid: boolean;
  canExport: boolean;
  totalInvoicesChecked: number;
  totalLinesChecked: number;
  mathMismatchesCount: number;
  missingCustomerIdsCount: number;
  missingCustomerEmailsCount: number;
  missingSkusCount: number;
  zeroTotalInvoicesCount: number;
  issues: BillingValidationIssue[];
  statusSummary: 'perfect' | 'warnings' | 'errors';
}

/**
 * Convierte cualquier timestamp de venta a clave de fecha local YYYY-MM-DD.
 */
export function saleTimestampToDateKey(rawTimestamp: unknown): string {
  if (!rawTimestamp) return '';
  let dateObj: Date;
  if (typeof rawTimestamp === 'object' && rawTimestamp !== null) {
    if (
      'toDate' in rawTimestamp &&
      typeof (rawTimestamp as { toDate: () => Date }).toDate === 'function'
    ) {
      dateObj = (rawTimestamp as { toDate: () => Date }).toDate();
    } else if (
      'seconds' in rawTimestamp &&
      typeof (rawTimestamp as { seconds: number }).seconds === 'number'
    ) {
      dateObj = new Date((rawTimestamp as { seconds: number }).seconds * 1000);
    } else if (rawTimestamp instanceof Date) {
      dateObj = rawTimestamp;
    } else {
      return '';
    }
  } else {
    dateObj = new Date(rawTimestamp as string | number);
  }

  if (Number.isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convierte YYYY-MM-DD a DD/MM/AAAA para Siigo Cloud / Loggro.
 */
export function formatDateDDMMYYYY(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Redondeo contable a 2 decimales evitando ruido de coma flotante.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Desglosa el precio final PVP a la base gravable unitaria sin impuesto:
 * - INC 8% -> PVP / 1.08
 * - IVA 19% -> PVP / 1.19
 * - Exento (0%) -> PVP
 */
export function calculateUnitBaseFromPVP(
  pvpUnitPrice: number,
  taxType: ProductTaxType,
  taxRate: number
): number {
  const cleanPrice = Math.max(0, Number(pvpUnitPrice) || 0);
  if (taxType === 'exento' || taxRate <= 0) {
    return round2(cleanPrice);
  }
  if (taxType === 'impoconsumo' && taxRate === 8) {
    return round2(cleanPrice / 1.08);
  }
  if (taxType === 'iva' && taxRate === 19) {
    return round2(cleanPrice / 1.19);
  }
  const divisor = 1 + taxRate / 100;
  return round2(cleanPrice / divisor);
}

/**
 * Etiqueta estándar del impuesto para plantillas de Siigo Cloud, Alegra, Loggro:
 * "INC 8%", "IVA 19%", "IVA 5%" o "Exento 0%".
 */
export function getProviderTaxLabel(taxType: ProductTaxType, taxRate: number): string {
  const rate = Math.max(0, Number(taxRate) || 0);
  if (taxType === 'exento' || rate === 0) {
    return 'Exento 0%';
  }
  if (taxType === 'iva') {
    return `IVA ${rate}%`;
  }
  return `INC ${rate}%`;
}

export function getPaymentMethodAccountingMeta(method?: PaymentMethod | string): {
  label: string;
  siigoLabel: string;
  alegraLabel: string;
  dianCode: string;
} {
  if (method === 'tarjeta') {
    return {
      label: 'Tarjeta Débito / Crédito',
      siigoLabel: 'Tarjeta',
      alegraLabel: 'Tarjeta de crédito',
      dianCode: '48'
    };
  }
  if (method === 'bizum') {
    return {
      label: 'Transferencia / QR (Nequi - Daviplata)',
      siigoLabel: 'Transferencia Bancaria',
      alegraLabel: 'Transferencia',
      dianCode: '47'
    };
  }
  return {
    label: 'Efectivo',
    siigoLabel: 'Efectivo',
    alegraLabel: 'Efectivo',
    dianCode: '10'
  };
}

/**
 * Formatea el consecutivo de factura para cada venta.
 */
export function formatSaleInvoiceConsecutive(sale: SaleReceipt, index?: number): string {
  if (sale.orderId && sale.orderId.trim()) {
    const clean = sale.orderId.trim();
    if (clean.toUpperCase().startsWith('FV-') || clean.toUpperCase().startsWith('SETT-')) {
      return clean;
    }
    return `FV-${clean}`;
  }
  const suffix = (sale.id || String(index ?? 1)).slice(-6).toUpperCase();
  return `FV-${suffix}`;
}

/**
 * Normaliza Cédula / NIT como String explícito conservando todos los ceros a la izquierda.
 */
export function normalizeCustomerIdentification(
  rawNumber?: string | null,
  docType?: string | null,
  explicitDv?: string | null
): { identification: string; verificationDigit: string; cleanDocType: string } {
  const cleanDocType =
    docType && docType !== 'CONSUMIDOR_FINAL' ? String(docType).trim().toUpperCase() : 'CC';
  const raw = String(rawNumber ?? '').trim();

  if (!raw || raw === '222222222222' || docType === 'CONSUMIDOR_FINAL') {
    return {
      identification: '222222222222',
      verificationDigit: '',
      cleanDocType: 'CC'
    };
  }

  const parts = raw.split('-');
  const baseNumber = parts[0].replace(/\D/g, '');
  const naturalDv = parts.length > 1 ? parts[1].replace(/\D/g, '') : '';
  const finalDv =
    explicitDv?.trim() || naturalDv || (cleanDocType === 'NIT' ? calculateColombiaNitDV(baseNumber) : '');

  return {
    identification: baseNumber || '222222222222',
    verificationDigit: finalDv,
    cleanDocType
  };
}

/**
 * Desglosa los ítems de una venta a líneas normalizadas con base gravable, tarifas de impuesto y SKU.
 */
export function extractNormalizedSaleLines(
  sale: SaleReceipt,
  productsCatalog?: Product[]
): NormalizedInvoiceLine[] {
  const rawItems = sale.items || [];
  const discountFactor =
    sale.subtotal > 0 && sale.discountAmount > 0
      ? Math.max(0, 1 - sale.discountAmount / sale.subtotal)
      : 1;
  const discountPercent =
    sale.discountPercent > 0
      ? sale.discountPercent
      : sale.subtotal > 0 && sale.discountAmount > 0
      ? round2((sale.discountAmount / sale.subtotal) * 100)
      : 0;

  if (rawItems.length === 0) {
    const netPVP = sale.total - (sale.tipAmount || 0);
    const fallbackType: ProductTaxType =
      sale.ivaAmount && sale.ivaAmount > 0 && (!sale.impoconsumoAmount || sale.impoconsumoAmount === 0)
        ? 'iva'
        : sale.taxPercent === 0
        ? 'exento'
        : 'impoconsumo';
    const fallbackRate =
      fallbackType === 'exento'
        ? 0
        : sale.taxPercent > 0
        ? sale.taxPercent
        : fallbackType === 'iva'
        ? 19
        : 8;
    const unitBase = calculateUnitBaseFromPVP(netPVP, fallbackType, fallbackRate);
    return [
      {
        productId: 'VENTA-GENERAL',
        sku: 'POS-GEN',
        productName: 'Consumo Restaurante / Caja',
        codeAndName: 'POS-GEN - Consumo Restaurante / Caja',
        quantity: 1,
        unitPricePVP: round2(netPVP),
        rawUnitPricePVP: round2(sale.subtotal),
        rawUnitBaseWithoutTax: calculateUnitBaseFromPVP(sale.subtotal, fallbackType, fallbackRate),
        discountPercent,
        unitBaseWithoutTax: unitBase,
        taxType: fallbackType,
        taxRate: fallbackRate,
        providerTaxLabel: getProviderTaxLabel(fallbackType, fallbackRate),
        lineBaseTotal: unitBase,
        lineTaxTotal: round2(netPVP - unitBase),
        lineGrossTotal: round2(netPVP)
      }
    ];
  }

  const result: NormalizedInvoiceLine[] = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const item = rawItems[idx];
    const qty = Number(item.quantity) || 0;
    const rawUnitPVP = Number(item.unitPrice) || 0;
    if (qty <= 0 || rawUnitPVP < 0) continue;

    const catalogProduct = productsCatalog?.find((p) => p.id === item.productId);
    const sku =
      (catalogProduct?.sku || '').trim() ||
      `PROD-${String(item.productId || idx + 1).slice(-4).toUpperCase()}`;
    const cleanName = (item.name || catalogProduct?.name || 'Producto').trim();
    const codeAndName = catalogProduct?.sku?.trim()
      ? `${catalogProduct.sku.trim()} - ${cleanName}`
      : cleanName;

    const resolvedTax = resolveOrderItemTax(
      item as unknown as Partial<OrderItem> & Record<string, unknown>,
      productsCatalog,
      sale.taxPercent
    );

    const effectiveUnitPVP = rawUnitPVP * discountFactor;
    const rawUnitBase = calculateUnitBaseFromPVP(
      rawUnitPVP,
      resolvedTax.taxType,
      resolvedTax.taxRate
    );
    const unitBase = calculateUnitBaseFromPVP(
      effectiveUnitPVP,
      resolvedTax.taxType,
      resolvedTax.taxRate
    );
    const lineGrossTotal = round2(effectiveUnitPVP * qty);
    const lineBaseTotal = round2(unitBase * qty);
    const lineTaxTotal = round2(Math.max(0, lineGrossTotal - lineBaseTotal));

    result.push({
      productId: item.productId || cleanName,
      sku,
      productName: cleanName,
      codeAndName,
      quantity: qty,
      unitPricePVP: round2(effectiveUnitPVP),
      rawUnitPricePVP: round2(rawUnitPVP),
      rawUnitBaseWithoutTax: rawUnitBase,
      discountPercent,
      unitBaseWithoutTax: unitBase,
      taxType: resolvedTax.taxType,
      taxRate: resolvedTax.taxRate,
      providerTaxLabel: getProviderTaxLabel(resolvedTax.taxType, resolvedTax.taxRate),
      lineBaseTotal,
      lineTaxTotal,
      lineGrossTotal
    });
  }

  return result;
}

/**
 * Agrupa líneas idénticas sumando cantidades si es necesario.
 */
function mergeInvoiceLines(lines: NormalizedInvoiceLine[]): NormalizedInvoiceLine[] {
  const map = new Map<string, NormalizedInvoiceLine>();

  for (const line of lines) {
    const mergeKey = `${line.sku}__${line.productName}__${line.providerTaxLabel}__${line.unitBaseWithoutTax.toFixed(2)}`;
    const existing = map.get(mergeKey);
    if (existing) {
      const nextQty = existing.quantity + line.quantity;
      const nextGross = round2(existing.lineGrossTotal + line.lineGrossTotal);
      const nextBase = round2(existing.unitBaseWithoutTax * nextQty);
      const nextTax = round2(Math.max(0, nextGross - nextBase));
      map.set(mergeKey, {
        ...existing,
        quantity: nextQty,
        lineBaseTotal: nextBase,
        lineTaxTotal: nextTax,
        lineGrossTotal: nextGross
      });
    } else {
      map.set(mergeKey, { ...line });
    }
  }

  return Array.from(map.values());
}

function summarizeDominantPaymentMethod(salesList: SaleReceipt[]): {
  paymentMethodLabel: string;
  siigoPaymentCode: string;
} {
  if (salesList.length === 0) {
    return { paymentMethodLabel: 'Efectivo', siigoPaymentCode: 'Efectivo' };
  }
  const uniqueMethods = Array.from(new Set(salesList.map((s) => s.paymentMethod)));
  if (uniqueMethods.length === 1) {
    const meta = getPaymentMethodAccountingMeta(uniqueMethods[0]);
    return { paymentMethodLabel: meta.label, siigoPaymentCode: meta.siigoLabel };
  }
  const metaFirst = getPaymentMethodAccountingMeta(salesList[0].paymentMethod);
  return {
    paymentMethodLabel: 'Mixto (Efectivo / Tarjeta / Transferencia)',
    siigoPaymentCode: metaFirst.siigoLabel
  };
}

/**
 * Empaqueta ventas en comprobantes individuales o agrupados con cálculo de bases 0%, 8% y 19%.
 */
function buildPackageFromSales(
  packageKey: string,
  consecutiveNumber: string,
  salesList: SaleReceipt[],
  customBilling: CustomerBillingInfo | null,
  effectiveDate: string,
  productsCatalog?: Product[]
): ConsolidatedInvoicePackage {
  const rawLines = salesList.flatMap((s) => extractNormalizedSaleLines(s, productsCatalog));
  const mergedLines = mergeInvoiceLines(rawLines);

  let totalBase = 0;
  let totalBase0 = 0;
  let totalBase8 = 0;
  let totalBase19 = 0;
  let totalInc = 0;
  let totalIva = 0;
  let totalGrossProducts = 0;

  for (const l of mergedLines) {
    totalBase += l.lineBaseTotal;
    totalGrossProducts += l.lineGrossTotal;
    if (l.taxType === 'exento' || l.taxRate === 0) {
      totalBase0 += l.lineBaseTotal;
    } else if (l.taxType === 'impoconsumo') {
      totalBase8 += l.lineBaseTotal;
      totalInc += l.lineTaxTotal;
    } else if (l.taxType === 'iva') {
      totalBase19 += l.lineBaseTotal;
      totalIva += l.lineTaxTotal;
    }
  }

  const totalDiscount = round2(
    salesList.reduce((acc, s) => acc + (Number(s.discountAmount) || 0), 0)
  );
  const totalTip = round2(
    salesList.reduce((acc, s) => acc + (Number(s.tipAmount) || 0), 0)
  );
  const totalChargedWithTip = round2(
    salesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
  );

  const primarySale = salesList[0];
  const b = customBilling || resolveSaleBillingInfo(primarySale);
  const normId = normalizeCustomerIdentification(
    b.documentNumber,
    b.documentType,
    b.dv
  );
  const personType: CustomerPersonType =
    b.personType || (normId.cleanDocType === 'NIT' ? 'juridica' : 'natural');
  const splitName = splitNaturalPersonName(b.customerName);
  const cityMeta = resolveColombianCity(b.cityCode || b.city);
  const paySummary = summarizeDominantPaymentMethod(salesList);
  const uniqueTables = Array.from(new Set(salesList.map((s) => s.tableName).filter(Boolean)));
  const uniqueCashiers = Array.from(new Set(salesList.map((s) => s.cashierName).filter(Boolean)));

  const isIssued = salesList.every((s) => s.electronicInvoiceStatus === 'emitida');

  return {
    packageKey,
    invoiceDateKey: effectiveDate,
    consecutiveNumber,
    customerName: b.customerName,
    firstName: personType === 'natural' ? b.firstName || splitName.firstName : '',
    lastName: personType === 'natural' ? b.lastName || splitName.lastName : '',
    personType,
    documentType: normId.cleanDocType,
    dianDocCode: getDianDocumentTypeCode(normId.cleanDocType),
    identification: normId.identification,
    verificationDigit: normId.verificationDigit,
    email: b.email || '',
    phone: b.phone || '',
    address: b.address || '',
    city: b.city || cityMeta?.city || '',
    department: b.department || cityMeta?.department || '',
    cityCode: b.cityCode || cityMeta?.cityCode || '',
    departmentCode: b.departmentCode || cityMeta?.departmentCode || '',
    taxRegime:
      b.taxRegime || (personType === 'juridica' ? 'responsable_iva' : 'no_responsable_iva'),
    fiscalResponsibility: b.fiscalResponsibility || 'R-99-PN',
    paymentMethodLabel: paySummary.paymentMethodLabel,
    siigoPaymentCode: paySummary.siigoPaymentCode,
    tableNames: uniqueTables.join(', ') || 'Caja',
    cashierNames: uniqueCashiers.join(', ') || 'Cajero',
    ticketsCount: salesList.length,
    ticketIds: salesList.map((s) => s.id),
    shortTicketRefs: salesList.map((s) => `#${s.id.slice(-6)}`).join(', '),
    documentStatus: isIssued ? 'Emitida' : 'Pendiente',
    lines: mergedLines,
    totalBase: round2(totalBase),
    totalBase0: round2(totalBase0),
    totalBase8: round2(totalBase8),
    totalInc: round2(totalInc),
    totalBase19: round2(totalBase19),
    totalIva: round2(totalIva),
    totalDiscount,
    totalTip,
    totalGrossProducts: round2(totalGrossProducts),
    totalChargedWithTip
  };
}

/**
 * Construye la vista previa y paquetes consolidados según Modo, Fechas y Filtros.
 */
export function buildBillingExportPreview(params: BillingExportParams): BillingExportPreview {
  const {
    sales,
    productsCatalog,
    mode,
    provider,
    targetDate,
    endDate,
    appName,
    excludeIndividualFeFromGlobal = false,
    onlyPendingElectronicInvoices = false,
    selectedSaleId,
    customerOverride
  } = params;

  const todayFallback = saleTimestampToDateKey(new Date());
  const effectiveDay = targetDate || todayFallback;
  const effectiveEndDay = endDate || effectiveDay;

  let filteredTickets: SaleReceipt[] = [];
  const packages: ConsolidatedInvoicePackage[] = [];

  const isInDateWindow = (dateKey: string) => {
    if (!dateKey) return false;
    if (effectiveDay && effectiveEndDay && effectiveDay !== effectiveEndDay) {
      return dateKey >= effectiveDay && dateKey <= effectiveEndDay;
    }
    return dateKey === effectiveDay;
  };

  if (mode === 'daily_global') {
    filteredTickets = sales.filter((s) => {
      const d = saleTimestampToDateKey(s.timestamp);
      if (!isInDateWindow(d)) return false;
      if (excludeIndividualFeFromGlobal && isElectronicInvoiceSale(s)) return false;
      return true;
    });

    // Mantener cada ticket con su cliente respectivo o un consolidado global
    // Para contabilidad exacta se genera 1 comprobante por cada ticket de venta
    filteredTickets.forEach((sale, idx) => {
      const saleDate = saleTimestampToDateKey(sale.timestamp) || effectiveDay;
      const consecutive = formatSaleInvoiceConsecutive(sale, idx + 1);
      packages.push(
        buildPackageFromSales(
          `ticket_${sale.id}`,
          consecutive,
          [sale],
          null,
          saleDate,
          productsCatalog
        )
      );
    });
  } else if (mode === 'specific_order') {
    const targetSale = sales.find((s) => s.id === selectedSaleId) || sales[0];
    if (targetSale) {
      filteredTickets = [targetSale];
      const saleDate = saleTimestampToDateKey(targetSale.timestamp) || effectiveDay;
      let overrideBilling: CustomerBillingInfo | null = null;
      if (customerOverride) {
        const base = resolveSaleBillingInfo(targetSale);
        overrideBilling = {
          ...base,
          ...customerOverride
        } as CustomerBillingInfo;
      }
      packages.push(
        buildPackageFromSales(
          `order_${targetSale.id}`,
          formatSaleInvoiceConsecutive(targetSale, 1),
          [targetSale],
          overrideBilling,
          saleDate,
          productsCatalog
        )
      );
    }
  } else {
    // mode === 'by_customer'
    filteredTickets = sales.filter((s) => {
      const isFe = isElectronicInvoiceSale(s);
      if (!isFe) return false;
      if (targetDate) {
        const d = saleTimestampToDateKey(s.timestamp);
        if (!isInDateWindow(d)) return false;
      }
      if (onlyPendingElectronicInvoices && s.electronicInvoiceStatus === 'emitida') {
        return false;
      }
      return true;
    });

    filteredTickets.forEach((sale, idx) => {
      const saleDate = saleTimestampToDateKey(sale.timestamp) || effectiveDay;
      const consecutive = formatSaleInvoiceConsecutive(sale, idx + 1);
      packages.push(
        buildPackageFromSales(
          `client_ticket_${sale.id}`,
          consecutive,
          [sale],
          null,
          saleDate,
          productsCatalog
        )
      );
    });
  }

  // Totales
  let totalTaxableBase = 0;
  let totalBase0 = 0;
  let totalBase8 = 0;
  let totalIncAmount = 0;
  let totalBase19 = 0;
  let totalIvaAmount = 0;
  let totalDiscountAmount = 0;
  let totalTipsAmount = 0;
  let totalGrossProducts = 0;
  let totalChargedAmount = 0;
  let totalLinesCount = 0;

  for (const p of packages) {
    totalTaxableBase += p.totalBase;
    totalBase0 += p.totalBase0;
    totalBase8 += p.totalBase8;
    totalIncAmount += p.totalInc;
    totalBase19 += p.totalBase19;
    totalIvaAmount += p.totalIva;
    totalDiscountAmount += p.totalDiscount;
    totalTipsAmount += p.totalTip;
    totalGrossProducts += p.totalGrossProducts;
    totalChargedAmount += p.totalChargedWithTip;
    totalLinesCount += p.lines.length;
  }

  // Vista previa tabular para UI
  const previewHeaders = [
    'Factura / Consecutivo',
    'Fecha',
    'Cliente / Razón Social',
    'Doc. Identificación',
    'Subtotal',
    'Impuestos',
    'Total Facturado',
    'Medio Pago'
  ];

  const previewRows: Array<Array<string | number>> = packages.slice(0, 15).map((p) => [
    p.consecutiveNumber,
    p.invoiceDateKey,
    p.customerName,
    p.verificationDigit ? `${p.identification}-${p.verificationDigit}` : p.identification,
    p.totalBase,
    round2(p.totalInc + p.totalIva),
    p.totalChargedWithTip,
    p.paymentMethodLabel
  ]);

  let includedSheets: string[] = [];
  if (provider === 'chinmi') {
    includedSheets = ['1_Resumen', '2_Facturas', '3_Detalle_Productos'];
  } else if (provider === 'siigo') {
    includedSheets = ['1_Facturas_Siigo', '2_Terceros_Siigo'];
  } else if (provider === 'alegra') {
    includedSheets = ['1_Facturas_Alegra', '2_Contactos_Alegra'];
  } else if (provider === 'loggro') {
    includedSheets = ['1_Encabezado', '2_Detalles', '3_Terceros_Loggro'];
  } else if (provider === 'dian_support') {
    includedSheets = [
      '1_Resumen_Tributario',
      '2_Libro_Ventas_y_Terceros',
      '3_Detalle_Gravamen_Productos'
    ];
  } else {
    includedSheets = ['1_WorldOffice_Facturas', '2_Terceros_DIAN'];
  }

  const cleanAppName = appName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'chinmi';
  const dateSuffix =
    effectiveDay !== effectiveEndDay
      ? `${effectiveDay}_al_${effectiveEndDay}`
      : effectiveDay;
  const suggestedFilename = `${cleanAppName}_facturacion_${provider}_${dateSuffix}.xlsx`;

  return {
    packages,
    filteredTickets,
    totalInvoicesCount: packages.length,
    totalTicketsCount: filteredTickets.length,
    totalLinesCount,
    totalTaxableBase: round2(totalTaxableBase),
    totalBase0: round2(totalBase0),
    totalBase8: round2(totalBase8),
    totalIncAmount: round2(totalIncAmount),
    totalBase19: round2(totalBase19),
    totalIvaAmount: round2(totalIvaAmount),
    totalDiscountAmount: round2(totalDiscountAmount),
    totalTipsAmount: round2(totalTipsAmount),
    totalGrossProducts: round2(totalGrossProducts),
    totalChargedAmount: round2(totalChargedAmount),
    previewHeaders,
    previewRows,
    includedSheets,
    suggestedFilename
  };
}

/**
 * Auditoría automática antes de la descarga para garantizar consistencia contable.
 */
export function validateBillingExport(
  params: BillingExportParams,
  preview: BillingExportPreview
): BillingValidationReport {
  const issues: BillingValidationIssue[] = [];
  let mathMismatchesCount = 0;
  let missingCustomerIdsCount = 0;
  let missingCustomerEmailsCount = 0;
  let missingSkusCount = 0;
  let zeroTotalInvoicesCount = 0;

  if (preview.packages.length === 0) {
    issues.push({
      type: 'warning',
      message: 'No hay facturas o ventas en el rango de fechas y filtros seleccionados.'
    });
  }

  for (const pkg of preview.packages) {
    // 1. Consistencia matemática
    const expectedTotal = round2(
      pkg.totalBase - pkg.totalDiscount + pkg.totalInc + pkg.totalIva + pkg.totalTip
    );
    const diff = Math.abs(expectedTotal - pkg.totalChargedWithTip);
    if (diff > 3) {
      mathMismatchesCount++;
      issues.push({
        type: 'warning',
        message: `Diferencia de cuadre ($${diff.toFixed(2)}) en factura ${pkg.consecutiveNumber}.`,
        invoiceRef: pkg.consecutiveNumber
      });
    }

    // 2. Factura sin valor o sin ítems
    if (pkg.totalChargedWithTip <= 0 || pkg.lines.length === 0) {
      zeroTotalInvoicesCount++;
      issues.push({
        type: 'warning',
        message: `Factura ${pkg.consecutiveNumber} no tiene ítems o su valor total es $0.`,
        invoiceRef: pkg.consecutiveNumber
      });
    }

    // 3. Identificación del cliente para Factura Electrónica
    const isGenericId = !pkg.identification || pkg.identification === '222222222222';
    if (params.mode === 'by_customer' || params.mode === 'specific_order') {
      if (isGenericId) {
        missingCustomerIdsCount++;
        issues.push({
          type: 'warning',
          message: `Factura ${pkg.consecutiveNumber}: Cliente "${pkg.customerName}" no tiene NIT/Cédula asignado (usa Consumidor Final).`,
          invoiceRef: pkg.consecutiveNumber
        });
      }

      // 4. Correo electrónico válido para emisión DIAN
      if (!pkg.email || !isValidEmailFormat(pkg.email)) {
        missingCustomerEmailsCount++;
        issues.push({
          type: 'warning',
          message: `Factura ${pkg.consecutiveNumber}: Sin correo electrónico válido para recepción de Factura Electrónica.`,
          invoiceRef: pkg.consecutiveNumber
        });
      }
    }

    // 5. SKU de productos
    for (const line of pkg.lines) {
      if (!line.sku || line.sku.startsWith('PROD-')) {
        missingSkusCount++;
      }
    }
  }

  const hasErrors = preview.packages.length === 0;
  const hasWarnings =
    mathMismatchesCount > 0 ||
    missingCustomerIdsCount > 0 ||
    missingCustomerEmailsCount > 0 ||
    zeroTotalInvoicesCount > 0;

  const statusSummary: 'perfect' | 'warnings' | 'errors' = hasErrors
    ? 'errors'
    : hasWarnings
    ? 'warnings'
    : 'perfect';

  return {
    isValid: !hasErrors,
    canExport: preview.packages.length > 0,
    totalInvoicesChecked: preview.packages.length,
    totalLinesChecked: preview.totalLinesCount,
    mathMismatchesCount,
    missingCustomerIdsCount,
    missingCustomerEmailsCount,
    missingSkusCount,
    zeroTotalInvoicesCount,
    issues,
    statusSummary
  };
}

/**
 * Crea una hoja de Excel asegurando formato texto '@' en documentos, NITs, fechas y códigos DANE,
 * y formato número '#,##0.00' en columnas monetarias.
 */
function createStyledSheet(
  headers: string[],
  rows: Array<Array<string | number>>,
  textColumnIndices: number[],
  currencyColumnIndices: number[],
  qtyColumnIndices: number[] = []
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const textColSet = new Set(textColumnIndices);
  const currColSet = new Set(currencyColumnIndices);
  const qtyColSet = new Set(qtyColumnIndices);

  for (let r = 1; r <= rows.length; r++) {
    const row = rows[r - 1];
    for (let c = 0; c < row.length; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellAddress];
      if (!cell) continue;

      if (textColSet.has(c)) {
        cell.t = 's';
        cell.v = String(row[c] ?? '');
        cell.z = '@';
      } else if (currColSet.has(c) && typeof row[c] === 'number') {
        cell.t = 'n';
        cell.v = Number(row[c]);
        cell.z = '#,##0.00';
      } else if (qtyColSet.has(c) && typeof row[c] === 'number') {
        cell.t = 'n';
        cell.v = Number(row[c]);
        cell.z = '#,##0.##';
      }
    }
  }

  // Habilitar autofiltro en la primera fila de datos
  if (rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: headers.length - 1 }
      })
    };
  }

  ws['!cols'] = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const valStr = rows[r][colIdx] !== undefined && rows[r][colIdx] !== null ? String(rows[r][colIdx]) : '';
      if (valStr.length > maxLen) {
        maxLen = valStr.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 48) };
  });

  return ws;
}

/**
 * 1. CONSTRUCTOR FORMATO CHINMI GENERAL (Exactamente 3 Hojas)
 */
function buildChinmiWorkbook(
  params: BillingExportParams,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const establishmentName = params.businessName || params.appName || 'CHINMI RESTAURANTE';
  const establishmentNit = params.businessNit || '900.000.000-1';
  const period =
    params.targetDate === (params.endDate || params.targetDate)
      ? params.targetDate
      : `${params.targetDate} al ${params.endDate || params.targetDate}`;

  // HOJA 1: 1_Resumen
  const resumenAoa: Array<Array<string | number>> = [
    ['RESUMEN GENERAL DE FACTURACIÓN Y VENTAS - CHINMI APP'],
    ['Establecimiento:', establishmentName],
    ['NIT / RUT:', establishmentNit],
    ['Período Analizado:', period],
    ['Fecha de Generación:', new Date().toLocaleString('es-CO')],
    ['Moneda:', 'COP ($)'],
    [''],
    ['CONCEPTO TRIBUTARIO / OPERACIONAL', 'VALOR / TOTAL'],
    ['Total Facturas / Comprobantes Emitidos', preview.totalInvoicesCount],
    ['Total Ítems / Productos Vendidos', preview.totalLinesCount],
    ['Ventas Brutas Totales (PVP)', preview.totalGrossProducts],
    ['Descuentos Comerciales Otorgados', preview.totalDiscountAmount],
    ['Ventas Netas Totales', round2(preview.totalGrossProducts - preview.totalDiscountAmount)],
    ['Base Gravable Exenta (Tarifa 0%)', preview.totalBase0],
    ['Base Gravable Impoconsumo (Tarifa 8%)', preview.totalBase8],
    ['Impuesto Nacional al Consumo Recaudado (INC 8%)', preview.totalIncAmount],
    ['Base Gravable IVA (Tarifa 19%)', preview.totalBase19],
    ['Impuesto al Valor Agregado Recaudado (IVA 19%)', preview.totalIvaAmount],
    ['Total Impuestos Liquidados (INC + IVA)', round2(preview.totalIncAmount + preview.totalIvaAmount)],
    ['Total Propinas Voluntarias Recaudadas', preview.totalTipsAmount],
    ['TOTAL FACTURADO / RECAUDADO GENERAL', preview.totalChargedAmount],
    [''],
    ['DESGLOSE POR MÉTODO DE PAGO', 'CANTIDAD COMPROBANTES', 'TOTAL RECAUDADO ($)', 'PARTICIPACIÓN (%)']
  ];

  // Métodos de pago acumulados
  const paymentStats = new Map<string, { count: number; total: number }>();
  for (const pkg of preview.packages) {
    const method = pkg.paymentMethodLabel;
    const cur = paymentStats.get(method) || { count: 0, total: 0 };
    paymentStats.set(method, {
      count: cur.count + 1,
      total: round2(cur.total + pkg.totalChargedWithTip)
    });
  }

  for (const [method, stats] of paymentStats.entries()) {
    const pct = preview.totalChargedAmount > 0 ? round2((stats.total / preview.totalChargedAmount) * 100) : 0;
    resumenAoa.push([method, stats.count, stats.total, `${pct}%`]);
  }

  const resumenWs = XLSX.utils.aoa_to_sheet(resumenAoa);
  resumenWs['!cols'] = [{ wch: 44 }, { wch: 24 }, { wch: 22 }, { wch: 18 }];
  // Forzar números en resumen
  for (let r = 8; r <= 20; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    if (resumenWs[addr] && typeof resumenAoa[r][1] === 'number') {
      resumenWs[addr].t = 'n';
      resumenWs[addr].z = r === 8 || r === 9 ? '#,##0' : '#,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(wb, resumenWs, '1_Resumen');

  // HOJA 2: 2_Facturas (1 fila por factura)
  const facturasHeaders = [
    'ID Interno',
    'Número Factura',
    'Fecha Emisión',
    'Nombre del Cliente',
    'Tipo Documento',
    'Número Identificación',
    'DV',
    'Subtotal',
    'Descuento',
    'Base 0%',
    'Base INC 8%',
    'Valor INC 8%',
    'Base IVA 19%',
    'Valor IVA 19%',
    'Total Impuestos',
    'Propina',
    'Total Pagado',
    'Método de Pago',
    'Estado Documento'
  ];

  const facturasRows = preview.packages.map((pkg) => [
    pkg.ticketIds.join(','),
    pkg.consecutiveNumber,
    pkg.invoiceDateKey,
    pkg.customerName,
    pkg.documentType,
    String(pkg.identification),
    String(pkg.verificationDigit || ''),
    pkg.totalBase,
    pkg.totalDiscount,
    pkg.totalBase0,
    pkg.totalBase8,
    pkg.totalInc,
    pkg.totalBase19,
    pkg.totalIva,
    round2(pkg.totalInc + pkg.totalIva),
    pkg.totalTip,
    pkg.totalChargedWithTip,
    pkg.paymentMethodLabel,
    pkg.documentStatus
  ]);

  const facturasWs = createStyledSheet(
    facturasHeaders,
    facturasRows,
    [0, 1, 2, 3, 4, 5, 6, 17, 18], // text
    [7, 8, 9, 10, 11, 12, 13, 14, 15, 16] // currency
  );
  XLSX.utils.book_append_sheet(wb, facturasWs, '2_Facturas');

  // HOJA 3: 3_Detalle_Productos (1 fila por producto vendido)
  const detalleHeaders = [
    'ID Interno Factura',
    'Número Factura',
    'Fecha Factura',
    'Código SKU',
    'Nombre del Producto',
    'Cantidad',
    'Precio Unitario PVP',
    'Descuento Línea',
    'Base Gravable Unitaria',
    'Base Gravable Total',
    'Tarifa Impuesto',
    'Porcentaje Impuesto (%)',
    'Valor Impuesto Total',
    'Total Línea (PVP)'
  ];

  const detalleRows: Array<Array<string | number>> = [];
  for (const pkg of preview.packages) {
    for (const line of pkg.lines) {
      detalleRows.push([
        pkg.ticketIds[0] || pkg.packageKey,
        pkg.consecutiveNumber,
        pkg.invoiceDateKey,
        String(line.sku),
        line.productName,
        line.quantity,
        line.unitPricePVP,
        round2(line.rawUnitPricePVP - line.unitPricePVP),
        line.unitBaseWithoutTax,
        line.lineBaseTotal,
        line.providerTaxLabel,
        line.taxRate,
        line.lineTaxTotal,
        line.lineGrossTotal
      ]);
    }
  }

  const detalleWs = createStyledSheet(
    detalleHeaders,
    detalleRows,
    [0, 1, 2, 3, 4, 10], // text
    [6, 7, 8, 9, 12, 13], // currency
    [5, 11] // qty
  );
  XLSX.utils.book_append_sheet(wb, detalleWs, '3_Detalle_Productos');

  return wb;
}

/**
 * 2. CONSTRUCTOR FORMATO SIIGO CLOUD (Comprobantes FV-1 + Terceros Siigo)
 */
function buildSiigoWorkbook(
  params: BillingExportParams,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // HOJA 1: 1_Facturas_Siigo (Plantilla estándar de comprobantes de ventas FV-1 Siigo Nube)
  const siigoHeaders = [
    'Tipo de Comprobante',
    'Consecutivo',
    'Fecha de elaboración',
    'Sigla Moneda',
    'Tasa de Cambio',
    'Identificación Tercero',
    'Sucursal',
    'Código Producto',
    'Nombre Producto',
    'Cantidad',
    'Valor Unitario',
    'Porcentaje Descuento',
    'Valor Descuento',
    'Impuesto Cargo',
    'Valor Impuesto',
    'Valor Total',
    'Forma de Pago',
    'Observaciones'
  ];

  const siigoRows: Array<Array<string | number>> = [];
  for (const pkg of preview.packages) {
    for (const line of pkg.lines) {
      siigoRows.push([
        'FV-1',
        pkg.consecutiveNumber,
        formatDateDDMMYYYY(pkg.invoiceDateKey),
        'COP',
        1,
        String(pkg.identification),
        0,
        String(line.sku),
        line.productName,
        line.quantity,
        line.unitBaseWithoutTax,
        line.discountPercent,
        round2((line.rawUnitBaseWithoutTax - line.unitBaseWithoutTax) * line.quantity),
        line.providerTaxLabel,
        line.lineTaxTotal,
        line.lineGrossTotal,
        pkg.siigoPaymentCode,
        `Mesa: ${pkg.tableNames} · Chinmi App`
      ]);
    }
  }

  const siigoWs = createStyledSheet(
    siigoHeaders,
    siigoRows,
    [0, 1, 2, 3, 5, 6, 7, 8, 13, 16, 17], // text
    [10, 12, 14, 15], // currency
    [4, 9, 11] // qty / rate
  );
  XLSX.utils.book_append_sheet(wb, siigoWs, '1_Facturas_Siigo');

  // HOJA 2: 2_Terceros_Siigo
  const tercerosHeaders = [
    'Tipo Tercero',
    'Código Tipo Doc DIAN',
    'Tipo Identificación',
    'Número Identificación',
    'Dígito Verificación',
    'Tipo Persona',
    'Razón Social / Nombre Completo',
    'Primer Nombre',
    'Apellidos',
    'Nombre Comercial',
    'Ciudad',
    'Código Ciudad DANE',
    'Dirección',
    'Teléfono',
    'Correo Electrónico (FE)',
    'Régimen Tributario',
    'Responsabilidad Fiscal'
  ];

  const uniqueClients = extractUniqueCustomersFromPackages(preview.packages);
  const tercerosRows = uniqueClients.map((c) => {
    const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
    const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
    return [
      'Cliente',
      String(c.dianDocCode),
      c.documentType,
      String(c.identification),
      String(c.verificationDigit || ''),
      isCompany ? 'Persona Jurídica' : 'Persona Natural',
      c.customerName,
      isCompany ? '' : c.firstName,
      isCompany ? '' : c.lastName,
      c.customerName,
      c.city || 'Bogotá',
      String(c.cityCode || '11001'),
      c.address || 'Calle 1 # 1-1',
      String(c.phone || ''),
      c.email || '',
      regimeOpt?.label || 'No responsable de IVA',
      c.fiscalResponsibility || 'R-99-PN'
    ];
  });

  const tercerosWs = createStyledSheet(
    tercerosHeaders,
    tercerosRows,
    tercerosHeaders.map((_, i) => i),
    []
  );
  XLSX.utils.book_append_sheet(wb, tercerosWs, '2_Terceros_Siigo');

  return wb;
}

/**
 * 3. CONSTRUCTOR FORMATO ALEGRA (Facturas Alegra + Contactos Alegra)
 */
function buildAlegraWorkbook(
  params: BillingExportParams,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // HOJA 1: 1_Facturas_Alegra
  const alegraHeaders = [
    'Número de Factura',
    'Fecha',
    'Vencimiento',
    'Identificación Cliente',
    'Nombre Cliente',
    'Correo Cliente',
    'Teléfono Cliente',
    'Método de Pago',
    'Ítem / Referencia',
    'Descripción Ítem',
    'Precio Unitario',
    'Cantidad',
    'Descuento (%)',
    'Impuesto',
    'Valor Total',
    'Observaciones'
  ];

  const alegraRows: Array<Array<string | number>> = [];
  for (const pkg of preview.packages) {
    for (const line of pkg.lines) {
      const alegraTax =
        line.taxType === 'impoconsumo'
          ? 'Impoconsumo (8%)'
          : line.taxType === 'iva'
          ? `IVA (${line.taxRate}%)`
          : 'Ninguno (0%)';

      alegraRows.push([
        pkg.consecutiveNumber,
        pkg.invoiceDateKey,
        pkg.invoiceDateKey,
        String(pkg.identification),
        pkg.customerName,
        pkg.email || '',
        String(pkg.phone || ''),
        getPaymentMethodAccountingMeta(pkg.paymentMethodLabel).alegraLabel,
        String(line.sku),
        line.productName,
        line.unitBaseWithoutTax,
        line.quantity,
        line.discountPercent,
        alegraTax,
        line.lineGrossTotal,
        `Mesa: ${pkg.tableNames} · Venta Chinmi`
      ]);
    }
  }

  const alegraWs = createStyledSheet(
    alegraHeaders,
    alegraRows,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 15], // text
    [10, 14], // currency
    [11, 12] // qty / disc
  );
  XLSX.utils.book_append_sheet(wb, alegraWs, '1_Facturas_Alegra');

  // HOJA 2: 2_Contactos_Alegra
  const contactosHeaders = [
    'Nombre / Razón Social',
    'Tipo Identificación',
    'Identificación',
    'Dígito Verificación',
    'Tipo Persona',
    'Primer Nombre',
    'Apellidos',
    'Correo Electrónico (FE)',
    'Teléfono Principal',
    'Dirección',
    'Ciudad',
    'Régimen'
  ];

  const uniqueClients = extractUniqueCustomersFromPackages(preview.packages);
  const contactosRows = uniqueClients.map((c) => {
    const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
    const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
    return [
      c.customerName,
      c.documentType,
      String(c.identification),
      String(c.verificationDigit || ''),
      isCompany ? 'Persona Jurídica' : 'Persona Natural',
      isCompany ? '' : c.firstName,
      isCompany ? '' : c.lastName,
      c.email || '',
      String(c.phone || ''),
      c.address || '',
      c.city || 'Bogotá',
      regimeOpt?.label || 'No responsable de IVA'
    ];
  });

  const contactosWs = createStyledSheet(
    contactosHeaders,
    contactosRows,
    contactosHeaders.map((_, i) => i),
    []
  );
  XLSX.utils.book_append_sheet(wb, contactosWs, '2_Contactos_Alegra');

  return wb;
}

/**
 * 4. CONSTRUCTOR FORMATO LOGGRO (1_Encabezado y 2_Detalles vinculadas por Consecutivo Factura + 3_Terceros_Loggro)
 */
function buildLoggroWorkbook(
  params: BillingExportParams,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // HOJA 1: 1_Encabezado
  const encabezadoHeaders = [
    'Consecutivo Factura',
    'Tipo de Comprobante',
    'Fecha de Factura',
    'Fecha de Vencimiento',
    'Identificación Cliente',
    'Nombre / Razón Social Cliente',
    'Tipo Documento Cliente',
    'Medio de Pago',
    'Subtotal Factura',
    'Descuento Factura',
    'Total Impuestos',
    'Total Propina',
    'Total Factura',
    'Estado Factura',
    'Observaciones'
  ];

  const encabezadoRows = preview.packages.map((pkg) => [
    pkg.consecutiveNumber,
    'Factura de Venta (FV)',
    formatDateDDMMYYYY(pkg.invoiceDateKey),
    formatDateDDMMYYYY(pkg.invoiceDateKey),
    String(pkg.identification),
    pkg.customerName,
    pkg.documentType,
    pkg.paymentMethodLabel,
    pkg.totalBase,
    pkg.totalDiscount,
    round2(pkg.totalInc + pkg.totalIva),
    pkg.totalTip,
    pkg.totalChargedWithTip,
    pkg.documentStatus,
    `Mesa: ${pkg.tableNames} · Chinmi App`
  ]);

  const encabezadoWs = createStyledSheet(
    encabezadoHeaders,
    encabezadoRows,
    [0, 1, 2, 3, 4, 5, 6, 7, 13, 14], // text
    [8, 9, 10, 11, 12] // currency
  );
  XLSX.utils.book_append_sheet(wb, encabezadoWs, '1_Encabezado');

  // HOJA 2: 2_Detalles (Vinculadas por Consecutivo Factura)
  const detallesHeaders = [
    'Consecutivo Factura',
    'Línea',
    'Código Ítem / SKU',
    'Descripción Ítem',
    'Cantidad',
    'Unidad de Medida',
    'Precio Unitario Base',
    'Porcentaje Descuento',
    'Tipo Impuesto',
    'Tarifa Impuesto (%)',
    'Valor Impuesto',
    'Total Línea'
  ];

  const detallesRows: Array<Array<string | number>> = [];
  for (const pkg of preview.packages) {
    pkg.lines.forEach((line, idx) => {
      const taxTypeCode =
        line.taxType === 'impoconsumo' ? 'INC' : line.taxType === 'iva' ? 'IVA' : 'Exento';

      detallesRows.push([
        pkg.consecutiveNumber,
        idx + 1,
        String(line.sku),
        line.productName,
        line.quantity,
        'UND',
        line.unitBaseWithoutTax,
        line.discountPercent,
        taxTypeCode,
        line.taxRate,
        line.lineTaxTotal,
        line.lineGrossTotal
      ]);
    });
  }

  const detallesWs = createStyledSheet(
    detallesHeaders,
    detallesRows,
    [0, 2, 3, 5, 8], // text
    [6, 10, 11], // currency
    [1, 4, 7, 9] // qty / line numbers
  );
  XLSX.utils.book_append_sheet(wb, detallesWs, '2_Detalles');

  // HOJA 3: 3_Terceros_Loggro
  const tercerosLoggroHeaders = [
    'Tipo Documento',
    'Identificación',
    'DV',
    'Tipo Persona',
    'Razón Social / Nombre Completo',
    'Primer Nombre',
    'Apellidos',
    'Dirección',
    'Código DANE Ciudad',
    'Ciudad / Municipio',
    'Departamento',
    'Teléfono',
    'Correo Electrónico (FE)',
    'Régimen Fiscal'
  ];

  const uniqueClients = extractUniqueCustomersFromPackages(preview.packages);
  const tercerosLoggroRows = uniqueClients.map((c) => {
    const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
    const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
    return [
      c.documentType,
      String(c.identification),
      String(c.verificationDigit || ''),
      isCompany ? 'Persona Jurídica' : 'Persona Natural',
      c.customerName,
      isCompany ? '' : c.firstName,
      isCompany ? '' : c.lastName,
      c.address || 'Calle 1 # 1-1',
      String(c.cityCode || '11001'),
      c.city || 'Bogotá',
      c.department || 'Bogotá D.C.',
      String(c.phone || ''),
      c.email || '',
      regimeOpt?.label || 'No responsable de IVA'
    ];
  });

  const tercerosLoggroWs = createStyledSheet(
    tercerosLoggroHeaders,
    tercerosLoggroRows,
    tercerosLoggroHeaders.map((_, i) => i),
    []
  );
  XLSX.utils.book_append_sheet(wb, tercerosLoggroWs, '3_Terceros_Loggro');

  return wb;
}

/**
 * 5. CONSTRUCTOR REPORTE DE SOPORTE PARA DIAN / CONTADOR
 */
function buildDianSupportWorkbook(
  params: BillingExportParams,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const establishmentName = params.businessName || params.appName || 'CHINMI RESTAURANTE';
  const establishmentNit = params.businessNit || '900.000.000-1';
  const period =
    params.targetDate === (params.endDate || params.targetDate)
      ? params.targetDate
      : `${params.targetDate} al ${params.endDate || params.targetDate}`;

  // HOJA 1: 1_Resumen_Tributario (con advertencia legal explícita)
  const resumenTributarioAoa: Array<Array<string | number>> = [
    ['INFORME DE SOPORTE CONTABLE Y CONCILIACIÓN TRIBUTARIA - CHINMI APP'],
    [
      'AVISO LEGAL / FISCAL: Este archivo es un reporte estructurado de soporte contable y conciliación fiscal para el contador o revisor fiscal. No sustituye la emisión electrónica formal ante la DIAN (XML con firma digital y código CUFE), la cual requiere habilitación directa mediante software propio o proveedor tecnológico autorizado.'
    ],
    [''],
    ['Establecimiento:', establishmentName],
    ['NIT / RUT:', establishmentNit],
    ['Período Auditado:', period],
    ['Fecha de Emisión del Reporte:', new Date().toLocaleString('es-CO')],
    [''],
    ['CONCEPTO FISCAL / CONTABLE', 'VALOR ($) / CANTIDAD', 'NOTAS TRIBUTARIAS DIAN'],
    ['Total Facturas / Comprobantes POS Auditados', preview.totalInvoicesCount, 'Registros de venta generados en el sistema'],
    ['Total Ítems / Productos Facturados', preview.totalLinesCount, 'Líneas detalladas de comanda'],
    ['Ventas Brutas Totales (PVP)', preview.totalGrossProducts, 'Ingreso bruto antes de descuentos'],
    ['Descuentos Comerciales Concedidos', preview.totalDiscountAmount, 'Menor valor del ingreso (Art. 26 E.T.)'],
    ['Ventas Netas Totales', round2(preview.totalGrossProducts - preview.totalDiscountAmount), 'Ingreso operacional neto'],
    ['Base Gravable Exenta (Tarifa 0%)', preview.totalBase0, 'Art. 477 y concordantes del Estatuto Tributario'],
    ['Base Gravable Impoconsumo (Tarifa 8%)', preview.totalBase8, 'Servicio de expendio de comidas y bebidas (Art. 512-1 E.T.)'],
    ['Impuesto Nacional al Consumo Recaudado (INC 8%)', preview.totalIncAmount, 'Valor a declarar en Formulario 310 DIAN'],
    ['Base Gravable IVA (Tarifa 19%)', preview.totalBase19, 'Venta de productos gravados con tarifa general'],
    ['Impuesto al Valor Agregado Recaudado (IVA 19%)', preview.totalIvaAmount, 'Valor a declarar en Formulario 300 DIAN'],
    ['Total Impuestos Recaudados (INC + IVA)', round2(preview.totalIncAmount + preview.totalIvaAmount), 'Total pasivo por impuestos recaudados'],
    [
      'Propinas Voluntarias Recaudadas',
      preview.totalTipsAmount,
      'Recaudo a favor de terceros (meseros). NO constituye ingreso propio ni base de IVA/INC (Ley 1935/2018)'
    ],
    ['TOTAL RECAUDADO / FACTURADO GENERAL', preview.totalChargedAmount, 'Flujo total percibido en caja'],
    [''],
    ['CONCILIACIÓN DE MEDIOS DE PAGO', 'OPERACIONES', 'VALOR TOTAL ($)', 'PARTICIPACIÓN (%)']
  ];

  const paymentStats = new Map<string, { count: number; total: number }>();
  for (const pkg of preview.packages) {
    const cur = paymentStats.get(pkg.paymentMethodLabel) || { count: 0, total: 0 };
    paymentStats.set(pkg.paymentMethodLabel, {
      count: cur.count + 1,
      total: round2(cur.total + pkg.totalChargedWithTip)
    });
  }

  for (const [m, st] of paymentStats.entries()) {
    const pct = preview.totalChargedAmount > 0 ? round2((st.total / preview.totalChargedAmount) * 100) : 0;
    resumenTributarioAoa.push([m, st.count, st.total, `${pct}%`]);
  }

  const resumenWs = XLSX.utils.aoa_to_sheet(resumenTributarioAoa);
  resumenWs['!cols'] = [{ wch: 48 }, { wch: 26 }, { wch: 54 }, { wch: 18 }];
  for (let r = 9; r <= 22; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    if (resumenWs[addr] && typeof resumenTributarioAoa[r][1] === 'number') {
      resumenWs[addr].t = 'n';
      resumenWs[addr].z = r === 9 || r === 10 ? '#,##0' : '#,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(wb, resumenWs, '1_Resumen_Tributario');

  // HOJA 2: 2_Libro_Ventas_y_Terceros (Alineado a Formato de Medios Magnéticos Exógena DIAN)
  const libroHeaders = [
    'Fecha Factura',
    'Número Factura',
    'Tipo Doc DIAN',
    'Tipo Identificación',
    'Identificación Tercero',
    'DV',
    'Razón Social / Nombre Completo',
    'Tipo Persona',
    'Correo Electrónico (FE)',
    'Dirección',
    'Código DANE Ciudad',
    'Ciudad / Municipio',
    'Base Gravable Exenta',
    'Base Gravable INC 8%',
    'Valor INC 8%',
    'Base Gravable IVA 19%',
    'Valor IVA 19%',
    'Subtotal',
    'Descuento',
    'Total Impuestos',
    'Propina',
    'Total Facturado',
    'Medio de Pago'
  ];

  const libroRows = preview.packages.map((pkg) => [
    pkg.invoiceDateKey,
    pkg.consecutiveNumber,
    String(pkg.dianDocCode),
    pkg.documentType,
    String(pkg.identification),
    String(pkg.verificationDigit || ''),
    pkg.customerName,
    pkg.personType === 'juridica' ? 'Persona Jurídica' : 'Persona Natural',
    pkg.email || '',
    pkg.address || '',
    String(pkg.cityCode || ''),
    pkg.city || '',
    pkg.totalBase0,
    pkg.totalBase8,
    pkg.totalInc,
    pkg.totalBase19,
    pkg.totalIva,
    pkg.totalBase,
    pkg.totalDiscount,
    round2(pkg.totalInc + pkg.totalIva),
    pkg.totalTip,
    pkg.totalChargedWithTip,
    pkg.paymentMethodLabel
  ]);

  const libroWs = createStyledSheet(
    libroHeaders,
    libroRows,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22], // text
    [12, 13, 14, 15, 16, 17, 18, 19, 20, 21] // currency
  );
  XLSX.utils.book_append_sheet(wb, libroWs, '2_Libro_Ventas_y_Terceros');

  // HOJA 3: 3_Detalle_Gravamen_Productos
  const gravamenHeaders = [
    'Régimen / Tarifa Fiscal',
    'Código SKU',
    'Nombre del Producto',
    'Unidades Vendidas',
    'Precio Unitario Promedio',
    'Base Gravable Acumulada',
    'Total Impuesto Recaudado',
    'Total Recaudado (PVP)'
  ];

  // Agrupar por producto y tarifa
  const productTaxMap = new Map<
    string,
    {
      regime: string;
      sku: string;
      name: string;
      qty: number;
      base: number;
      tax: number;
      gross: number;
    }
  >();

  for (const pkg of preview.packages) {
    for (const l of pkg.lines) {
      const key = `${l.providerTaxLabel}__${l.sku}__${l.productName}`;
      const cur = productTaxMap.get(key) || {
        regime: l.providerTaxLabel,
        sku: l.sku,
        name: l.productName,
        qty: 0,
        base: 0,
        tax: 0,
        gross: 0
      };
      productTaxMap.set(key, {
        ...cur,
        qty: cur.qty + l.quantity,
        base: round2(cur.base + l.lineBaseTotal),
        tax: round2(cur.tax + l.lineTaxTotal),
        gross: round2(cur.gross + l.lineGrossTotal)
      });
    }
  }

  const gravamenRows = Array.from(productTaxMap.values()).map((it) => [
    it.regime,
    String(it.sku),
    it.name,
    it.qty,
    it.qty > 0 ? round2(it.gross / it.qty) : 0,
    it.base,
    it.tax,
    it.gross
  ]);

  const gravamenWs = createStyledSheet(
    gravamenHeaders,
    gravamenRows,
    [0, 1, 2], // text
    [4, 5, 6, 7], // currency
    [3] // qty
  );
  XLSX.utils.book_append_sheet(wb, gravamenWs, '3_Detalle_Gravamen_Productos');

  return wb;
}

/**
 * 6. RELLENO DE PLANTILLA .XLSX PERSONALIZADA DEL USUARIO (p. ej. Siigo)
 */
function fillCustomTemplate(
  buffer: ArrayBuffer,
  preview: BillingExportPreview
): XLSX.WorkBook {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) return wb;

  // Tomar la primera hoja o una llamada "Facturas" / "FV"
  const targetSheetName =
    sheetNames.find((s) => /factura|fv|comprobante/i.test(s)) || sheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  if (!ws) return wb;

  // Convertir a matriz para inspeccionar encabezados
  const data: Array<Array<unknown>> = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headerRowIdx = data.findIndex(
    (row) => Array.isArray(row) && row.some((c) => typeof c === 'string' && /comprobante|consecutivo|fecha|producto|tercero|nit|cliente/i.test(c))
  );

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 1;

  // Insertar filas mapeadas
  const appendRows: Array<Array<string | number>> = [];
  for (const pkg of preview.packages) {
    for (const line of pkg.lines) {
      appendRows.push([
        'FV-1',
        pkg.consecutiveNumber,
        formatDateDDMMYYYY(pkg.invoiceDateKey),
        'COP',
        1,
        String(pkg.identification),
        0,
        String(line.sku),
        line.productName,
        line.quantity,
        line.unitBaseWithoutTax,
        line.discountPercent,
        round2((line.rawUnitBaseWithoutTax - line.unitBaseWithoutTax) * line.quantity),
        line.providerTaxLabel,
        line.lineTaxTotal,
        line.lineGrossTotal,
        pkg.siigoPaymentCode,
        `Mesa: ${pkg.tableNames} · Chinmi App`
      ]);
    }
  }

  // Escribir en la hoja existente a partir de startRow
  appendRows.forEach((row, rIdx) => {
    const curR = startRow + rIdx;
    row.forEach((val, cIdx) => {
      const cellAddr = XLSX.utils.encode_cell({ r: curR, c: cIdx });
      ws[cellAddr] = {
        t: typeof val === 'number' ? 'n' : 's',
        v: val,
        z: typeof val === 'number' ? '#,##0.00' : '@'
      };
    });
  });

  // Ajustar rango
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  range.e.r = Math.max(range.e.r, startRow + appendRows.length - 1);
  range.e.c = Math.max(range.e.c, 17);
  ws['!ref'] = XLSX.utils.encode_range(range);

  return wb;
}

function extractUniqueCustomersFromPackages(
  packages: ConsolidatedInvoicePackage[]
): ConsolidatedInvoicePackage[] {
  const map = new Map<string, ConsolidatedInvoicePackage>();
  for (const p of packages) {
    const key = `${p.documentType}__${p.identification}`;
    if (!map.has(key)) {
      map.set(key, p);
    }
  }
  return Array.from(map.values());
}

/**
 * Función principal para generar y descargar el archivo Excel según el proveedor y requisitos.
 */
export function downloadBillingExcelFile(params: BillingExportParams): {
  success: boolean;
  filename: string;
  invoicesExported: number;
  exportedTicketIds: string[];
} {
  const preview = buildBillingExportPreview(params);
  if (preview.packages.length === 0) {
    return {
      success: false,
      filename: preview.suggestedFilename,
      invoicesExported: 0,
      exportedTicketIds: []
    };
  }

  let wb: XLSX.WorkBook;

  if (params.customTemplateBuffer) {
    wb = fillCustomTemplate(params.customTemplateBuffer, preview);
  } else {
    switch (params.provider) {
      case 'chinmi':
        wb = buildChinmiWorkbook(params, preview);
        break;
      case 'siigo':
        wb = buildSiigoWorkbook(params, preview);
        break;
      case 'alegra':
        wb = buildAlegraWorkbook(params, preview);
        break;
      case 'loggro':
        wb = buildLoggroWorkbook(params, preview);
        break;
      case 'dian_support':
        wb = buildDianSupportWorkbook(params, preview);
        break;
      case 'world_office':
      default:
        wb = buildSiigoWorkbook(params, preview);
        break;
    }
  }

  XLSX.writeFile(wb, preview.suggestedFilename, { bookType: 'xlsx' });

  return {
    success: true,
    filename: preview.suggestedFilename,
    invoicesExported: preview.totalInvoicesCount,
    exportedTicketIds: preview.filteredTickets.map((t) => t.id)
  };
}
