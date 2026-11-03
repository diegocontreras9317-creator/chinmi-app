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
  isElectronicInvoiceSale,
  resolveColombianCity,
  resolveSaleBillingInfo,
  splitNaturalPersonName,
  TAX_REGIME_OPTIONS
} from './billing';
import { resolveOrderItemTax } from './taxes';

export type ExportGroupingMode = 'daily_global' | 'by_customer' | 'specific_order';
export type ExportBillingProvider = 'siigo' | 'alegra' | 'world_office' | 'chinmi';

export interface BillingExportParams {
  sales: SaleReceipt[];
  productsCatalog?: Product[];
  mode: ExportGroupingMode;
  provider: ExportBillingProvider;
  /** YYYY-MM-DD local date; required for 'daily_global', optional for 'by_customer' (empty = all dates) */
  targetDate: string;
  appName: string;
  /** Optional: omit tickets that already requested individual FE when building the daily global invoice */
  excludeIndividualFeFromGlobal?: boolean;
  /** Optional for mode === 'by_customer': export only pending FE sales so the accountant doesn't re-upload issued ones */
  onlyPendingElectronicInvoices?: boolean;
  /** Required when mode === 'specific_order': ID of the exact SaleReceipt order to invoice */
  selectedSaleId?: string;
  /** Optional customer NIT/Cédula/Razón Social/Email/Dirección/Ciudad override for mode === 'specific_order' */
  customerOverride?: Partial<CustomerBillingInfo> | null;
}

export interface NormalizedInvoiceLine {
  productId: string;
  sku: string;
  productName: string;
  codeAndName: string;
  quantity: number;
  unitPricePVP: number;
  /** Precio unitario original antes de descuento comercial */
  rawUnitPricePVP: number;
  /** Precio base unitario antes de descuento */
  rawUnitBaseWithoutTax: number;
  /** Porcentaje de descuento aplicado en caja */
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
  ticketsCount: number;
  ticketIds: string[];
  shortTicketRefs: string;
  lines: NormalizedInvoiceLine[];
  totalBase: number;
  totalInc: number;
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
  totalIncAmount: number;
  totalIvaAmount: number;
  totalTipsAmount: number;
  totalGrossProducts: number;
  previewHeaders: string[];
  previewRows: Array<Array<string | number>>;
  includedSheets: string[];
  suggestedFilename: string;
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
 * Convierte YYYY-MM-DD a DD/MM/AAAA para Siigo Cloud / World Office.
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
 * - Cualquier otra tarifa > 0 -> PVP / (1 + tarifa / 100)
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
 * Etiqueta estándar del impuesto para plantillas de Siigo Cloud, Alegra y World Office:
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
  dianCode: string;
} {
  if (method === 'tarjeta') {
    return {
      label: 'Tarjeta Débito / Crédito',
      siigoLabel: 'Tarjeta',
      dianCode: '48'
    };
  }
  if (method === 'bizum') {
    return {
      label: 'Transferencia / QR (Nequi - Daviplata)',
      siigoLabel: 'Transferencia Bancaria',
      dianCode: '47'
    };
  }
  return {
    label: 'Efectivo',
    siigoLabel: 'Efectivo',
    dianCode: '10'
  };
}

/**
 * Normaliza Cédula / NIT como String explícito conservando todos los ceros a la izquierda.
 * Si es NIT y no trae DV en el texto, calcula automáticamente el DV Módulo 11 de la DIAN.
 */
export function normalizeCustomerIdentification(
  rawNumber?: string | null,
  docType?: string | null,
  explicitDv?: string | null
): { identification: string; verificationDigit: string; cleanDocType: string } {
  const cleanDocType =
    docType && docType !== 'CONSUMIDOR_FINAL' ? String(docType).trim().toUpperCase() : 'CC';
  const raw = String(rawNumber ?? '').trim();

  if (!raw || docType === 'CONSUMIDOR_FINAL') {
    return {
      identification: '222222222222',
      verificationDigit: '',
      cleanDocType: 'CONSUMIDOR_FINAL'
    };
  }

  const compact = raw.replace(/[\s.]/g, '');

  if (compact.includes('-')) {
    const [basePart, dvPart = ''] = compact.split('-');
    const safeBase = basePart.trim() || '222222222222';
    const finalType = cleanDocType === 'CONSUMIDOR_FINAL' ? 'NIT' : cleanDocType;
    const resolvedDv =
      String(explicitDv || dvPart || '').trim() ||
      (finalType === 'NIT' ? calculateColombiaNitDV(safeBase) : '');
    return {
      identification: String(safeBase),
      verificationDigit: resolvedDv,
      cleanDocType: finalType
    };
  }

  const autoDv =
    String(explicitDv || '').trim() ||
    (cleanDocType === 'NIT' ? calculateColombiaNitDV(compact) : '');

  return {
    identification: String(compact),
    verificationDigit: autoDv,
    cleanDocType
  };
}

/**
 * Construye las líneas normalizadas de un ticket aplicando descuento proporcional si existe.
 */
function extractNormalizedSaleLines(
  sale: SaleReceipt,
  productsCatalog?: Product[]
): NormalizedInvoiceLine[] {
  const discountPercent = Math.min(100, Math.max(0, Number(sale.discountPercent) || 0));
  const discountFactor = 1 - discountPercent / 100;
  const rawItems = Array.isArray(sale.items) ? sale.items : [];

  if (rawItems.length === 0 && sale.subtotal > 0) {
    const netPVP =
      sale.subtotal - sale.discountAmount > 0 ? sale.subtotal - sale.discountAmount : sale.total;
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

  for (const item of rawItems) {
    const qty = Number(item.quantity) || 0;
    const rawUnitPVP = Number(item.unitPrice) || 0;
    if (qty <= 0 || rawUnitPVP < 0) continue;

    const catalogProduct = productsCatalog?.find((p) => p.id === item.productId);
    const sku = (catalogProduct?.sku || '').trim() || `PROD-${String(item.productId || '01').slice(-4).toUpperCase()}`;
    const cleanName = (item.name || catalogProduct?.name || 'Producto').trim();
    const codeAndName = catalogProduct?.sku?.trim() ? `${catalogProduct.sku.trim()} - ${cleanName}` : cleanName;

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
 * Agrupa líneas idénticas (mismo producto, mismo precio base sin impuesto y mismo impuesto)
 * sumando cantidades para empaquetar comprobantes limpios en Siigo / Alegra / World Office.
 */
function mergeInvoiceLines(lines: NormalizedInvoiceLine[]): NormalizedInvoiceLine[] {
  const map = new Map<string, NormalizedInvoiceLine>();

  for (const line of lines) {
    const mergeKey = `${line.codeAndName}__${line.providerTaxLabel}__${line.unitBaseWithoutTax.toFixed(2)}`;
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
 * Construye los paquetes consolidados y la vista previa según el Modo de Agrupación y Proveedor.
 */
export function buildBillingExportPreview(params: BillingExportParams): BillingExportPreview {
  const {
    sales,
    productsCatalog,
    mode,
    provider,
    targetDate,
    appName,
    excludeIndividualFeFromGlobal = false,
    onlyPendingElectronicInvoices = false,
    selectedSaleId,
    customerOverride
  } = params;

  const todayFallback = saleTimestampToDateKey(new Date());
  const effectiveDay = targetDate || todayFallback;

  let filteredTickets: SaleReceipt[] = [];
  const packages: ConsolidatedInvoicePackage[] = [];

  if (mode === 'daily_global') {
    filteredTickets = sales.filter((s) => {
      if (saleTimestampToDateKey(s.timestamp) !== effectiveDay) return false;
      if (excludeIndividualFeFromGlobal && isElectronicInvoiceSale(s)) return false;
      return true;
    });

    if (filteredTickets.length > 0) {
      const rawLines = filteredTickets.flatMap((sale) =>
        extractNormalizedSaleLines(sale, productsCatalog)
      );
      const mergedLines = mergeInvoiceLines(rawLines);

      let totalBase = 0;
      let totalInc = 0;
      let totalIva = 0;
      let totalGrossProducts = 0;

      for (const l of mergedLines) {
        totalBase += l.lineBaseTotal;
        totalGrossProducts += l.lineGrossTotal;
        if (l.taxType === 'impoconsumo') totalInc += l.lineTaxTotal;
        if (l.taxType === 'iva') totalIva += l.lineTaxTotal;
      }

      const totalDiscount = round2(
        filteredTickets.reduce((acc, s) => acc + (Number(s.discountAmount) || 0), 0)
      );
      const totalTip = round2(
        filteredTickets.reduce((acc, s) => acc + (Number(s.tipAmount) || 0), 0)
      );
      const totalChargedWithTip = round2(
        filteredTickets.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
      );
      const paySummary = summarizeDominantPaymentMethod(filteredTickets);

      packages.push({
        packageKey: `GLOBAL_${effectiveDay}`,
        invoiceDateKey: effectiveDay,
        customerName: 'Consumidor Final',
        firstName: 'Consumidor',
        lastName: 'Final',
        personType: 'natural',
        documentType: 'CONSUMIDOR_FINAL',
        dianDocCode: '13',
        identification: '222222222222',
        verificationDigit: '',
        email: '',
        phone: '',
        address: 'Venta en punto de venta',
        city: 'Bogotá D.C.',
        department: 'Bogotá D.C.',
        cityCode: '11001',
        departmentCode: '11',
        taxRegime: 'no_responsable_iva',
        fiscalResponsibility: 'R-99-PN',
        paymentMethodLabel: paySummary.paymentMethodLabel,
        siigoPaymentCode: paySummary.siigoPaymentCode,
        ticketsCount: filteredTickets.length,
        ticketIds: filteredTickets.map((t) => t.id),
        shortTicketRefs: `Lote ${filteredTickets.length} tkt (${effectiveDay})`,
        lines: mergedLines,
        totalBase: round2(totalBase),
        totalInc: round2(totalInc),
        totalIva: round2(totalIva),
        totalDiscount,
        totalTip,
        totalGrossProducts: round2(totalGrossProducts),
        totalChargedWithTip
      });
    }
  } else if (mode === 'by_customer') {
    filteredTickets = sales.filter((s) => {
      if (!isElectronicInvoiceSale(s)) return false;
      if (onlyPendingElectronicInvoices && s.electronicInvoiceStatus === 'emitida') return false;
      if (targetDate && saleTimestampToDateKey(s.timestamp) !== targetDate) return false;
      return true;
    });

    const groupedByCustomer = new Map<
      string,
      {
        salesList: SaleReceipt[];
        billing: CustomerBillingInfo;
        identification: string;
        verificationDigit: string;
        cleanDocType: string;
        latestDateKey: string;
      }
    >();

    for (const sale of filteredTickets) {
      const resolvedBilling = resolveSaleBillingInfo(sale);
      const normId = normalizeCustomerIdentification(
        resolvedBilling.documentNumber,
        resolvedBilling.documentType,
        resolvedBilling.dv
      );
      const email = getSaleCustomerEmail(sale) || resolvedBilling.email || '';
      const custName =
        resolvedBilling.customerName && resolvedBilling.customerName !== 'Consumidor Final'
          ? resolvedBilling.customerName
          : 'Cliente Factura Electrónica';
      const saleDateKey = saleTimestampToDateKey(sale.timestamp) || effectiveDay;

      const buyerKey =
        normId.identification !== '222222222222'
          ? `ID_${normId.identification}`
          : email
          ? `EMAIL_${email.toLowerCase()}`
          : `TICKET_${sale.id}`;

      const existing = groupedByCustomer.get(buyerKey);
      if (existing) {
        existing.salesList.push(sale);
        if (!existing.billing.email && email) existing.billing.email = email;
        if (!existing.billing.phone && resolvedBilling.phone) existing.billing.phone = resolvedBilling.phone;
        if (!existing.billing.address && resolvedBilling.address) existing.billing.address = resolvedBilling.address;
        if (!existing.billing.city && resolvedBilling.city) existing.billing.city = resolvedBilling.city;
        if (!existing.billing.department && resolvedBilling.department) {
          existing.billing.department = resolvedBilling.department;
        }
        if (!existing.billing.cityCode && resolvedBilling.cityCode) {
          existing.billing.cityCode = resolvedBilling.cityCode;
        }
        if (
          existing.billing.customerName === 'Consumidor Final' &&
          custName !== 'Consumidor Final'
        ) {
          existing.billing.customerName = custName;
        }
        if (saleDateKey > existing.latestDateKey) {
          existing.latestDateKey = saleDateKey;
        }
      } else {
        groupedByCustomer.set(buyerKey, {
          salesList: [sale],
          billing: {
            ...resolvedBilling,
            customerName: custName,
            email
          },
          identification: normId.identification,
          verificationDigit: normId.verificationDigit,
          cleanDocType: normId.cleanDocType,
          latestDateKey: saleDateKey
        });
      }
    }

    for (const [buyerKey, group] of groupedByCustomer.entries()) {
      const rawLines = group.salesList.flatMap((s) =>
        extractNormalizedSaleLines(s, productsCatalog)
      );
      const mergedLines = mergeInvoiceLines(rawLines);

      let totalBase = 0;
      let totalInc = 0;
      let totalIva = 0;
      let totalGrossProducts = 0;

      for (const l of mergedLines) {
        totalBase += l.lineBaseTotal;
        totalGrossProducts += l.lineGrossTotal;
        if (l.taxType === 'impoconsumo') totalInc += l.lineTaxTotal;
        if (l.taxType === 'iva') totalIva += l.lineTaxTotal;
      }

      const totalDiscount = round2(
        group.salesList.reduce((acc, s) => acc + (Number(s.discountAmount) || 0), 0)
      );
      const totalTip = round2(
        group.salesList.reduce((acc, s) => acc + (Number(s.tipAmount) || 0), 0)
      );
      const totalChargedWithTip = round2(
        group.salesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
      );

      const b = group.billing;
      const personType: CustomerPersonType =
        b.personType || (group.cleanDocType === 'NIT' ? 'juridica' : 'natural');
      const splitName = splitNaturalPersonName(b.customerName);
      const cityMeta = resolveColombianCity(b.cityCode || b.city);
      const paySummary = summarizeDominantPaymentMethod(group.salesList);

      packages.push({
        packageKey: buyerKey,
        invoiceDateKey: targetDate || group.latestDateKey || effectiveDay,
        customerName: b.customerName,
        firstName: personType === 'natural' ? b.firstName || splitName.firstName : '',
        lastName: personType === 'natural' ? b.lastName || splitName.lastName : '',
        personType,
        documentType: group.cleanDocType,
        dianDocCode: getDianDocumentTypeCode(group.cleanDocType),
        identification: group.identification,
        verificationDigit: group.verificationDigit,
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
        ticketsCount: group.salesList.length,
        ticketIds: group.salesList.map((s) => s.id),
        shortTicketRefs: group.salesList.map((s) => `#${s.id.slice(-6)}`).join(', '),
        lines: mergedLines,
        totalBase: round2(totalBase),
        totalInc: round2(totalInc),
        totalIva: round2(totalIva),
        totalDiscount,
        totalTip,
        totalGrossProducts: round2(totalGrossProducts),
        totalChargedWithTip
      });
    }
  } else if (mode === 'specific_order') {
    const targetSale = selectedSaleId ? sales.find((s) => s.id === selectedSaleId) : undefined;
    if (targetSale) {
      const baseBilling = resolveSaleBillingInfo(targetSale);
      const overrideDocNum = (customerOverride?.documentNumber ?? '').trim();
      const overrideDocType = customerOverride?.documentType;
      const overrideName = (customerOverride?.customerName ?? '').trim();
      const overrideEmail = (customerOverride?.email ?? '').trim().toLowerCase();

      const rawDocNumber = overrideDocNum || baseBilling.documentNumber || '';
      const rawDocType =
        (overrideDocType && overrideDocType !== 'CONSUMIDOR_FINAL'
          ? overrideDocType
          : undefined) ||
        (baseBilling.documentType !== 'CONSUMIDOR_FINAL' ? baseBilling.documentType : undefined) ||
        (rawDocNumber ? (rawDocNumber.includes('-') ? 'NIT' : 'CC') : 'CONSUMIDOR_FINAL');

      const normId = normalizeCustomerIdentification(
        rawDocNumber,
        rawDocType,
        customerOverride?.dv || baseBilling.dv
      );
      const resolvedEmail = overrideEmail || baseBilling.email || '';
      const resolvedCustomerName =
        (overrideName && overrideName.toLowerCase() !== 'consumidor final' ? overrideName : '') ||
        (baseBilling.customerName && baseBilling.customerName.toLowerCase() !== 'consumidor final'
          ? baseBilling.customerName
          : '') ||
        'Cliente Factura Electrónica';

      const personType: CustomerPersonType =
        customerOverride?.personType ||
        baseBilling.personType ||
        (normId.cleanDocType === 'NIT' ? 'juridica' : 'natural');

      const splitName = splitNaturalPersonName(resolvedCustomerName);
      const resolvedPhone = (customerOverride?.phone ?? baseBilling.phone ?? '').trim();
      const resolvedAddress = (customerOverride?.address ?? baseBilling.address ?? '').trim();
      const rawCity = (customerOverride?.city ?? baseBilling.city ?? '').trim();
      const rawCityCode = (customerOverride?.cityCode ?? baseBilling.cityCode ?? '').trim();
      const cityMeta = resolveColombianCity(rawCityCode || rawCity);
      const resolvedCity = cityMeta?.city || rawCity;
      const resolvedDept =
        (customerOverride?.department ?? baseBilling.department ?? cityMeta?.department ?? '').trim();
      const resolvedCityCode = rawCityCode || cityMeta?.cityCode || '';
      const resolvedDeptCode =
        (customerOverride?.departmentCode ?? baseBilling.departmentCode ?? cityMeta?.departmentCode ?? '').trim();
      const resolvedRegime: CustomerTaxRegime =
        customerOverride?.taxRegime ||
        baseBilling.taxRegime ||
        (personType === 'juridica' ? 'responsable_iva' : 'no_responsable_iva');
      const resolvedFiscalResp =
        (customerOverride?.fiscalResponsibility ?? baseBilling.fiscalResponsibility ?? 'R-99-PN').trim();

      const saleDateKey = saleTimestampToDateKey(targetSale.timestamp) || effectiveDay;
      const fullDocDisplay = normId.verificationDigit
        ? `${normId.identification}-${normId.verificationDigit}`
        : normId.identification;

      const enrichedBilling: CustomerBillingInfo = {
        customerName: resolvedCustomerName,
        documentType: normId.cleanDocType as CustomerBillingInfo['documentType'],
        documentNumber: fullDocDisplay,
        ...(normId.verificationDigit ? { dv: normId.verificationDigit } : {}),
        personType,
        ...(personType === 'natural' ? { firstName: splitName.firstName, lastName: splitName.lastName } : {}),
        ...(resolvedEmail ? { email: resolvedEmail } : {}),
        ...(resolvedPhone ? { phone: resolvedPhone } : {}),
        ...(resolvedAddress ? { address: resolvedAddress } : {}),
        ...(resolvedCity ? { city: resolvedCity } : {}),
        ...(resolvedDept ? { department: resolvedDept } : {}),
        ...(resolvedCityCode ? { cityCode: resolvedCityCode } : {}),
        ...(resolvedDeptCode ? { departmentCode: resolvedDeptCode } : {}),
        taxRegime: resolvedRegime,
        fiscalResponsibility: resolvedFiscalResp,
        requiresElectronicInvoice: true
      };

      const enrichedSaleForAudit: SaleReceipt = {
        ...targetSale,
        customerName: resolvedCustomerName,
        customerDocumentType: normId.cleanDocType as SaleReceipt['customerDocumentType'],
        customerDocumentNumber: fullDocDisplay,
        customerEmail: resolvedEmail,
        requiresElectronicInvoice: true,
        billingInfo: enrichedBilling
      };

      filteredTickets = [enrichedSaleForAudit];

      const rawLines = extractNormalizedSaleLines(targetSale, productsCatalog);
      const mergedLines = mergeInvoiceLines(rawLines);

      let totalBase = 0;
      let totalInc = 0;
      let totalIva = 0;
      let totalGrossProducts = 0;

      for (const l of mergedLines) {
        totalBase += l.lineBaseTotal;
        totalGrossProducts += l.lineGrossTotal;
        if (l.taxType === 'impoconsumo') totalInc += l.lineTaxTotal;
        if (l.taxType === 'iva') totalIva += l.lineTaxTotal;
      }

      const totalDiscount = round2(Number(targetSale.discountAmount) || 0);
      const totalTip = round2(Number(targetSale.tipAmount) || 0);
      const totalChargedWithTip = round2(Number(targetSale.total) || 0);
      const paySummary = summarizeDominantPaymentMethod([targetSale]);

      packages.push({
        packageKey: `ORDER_${targetSale.id}_${normId.identification}`,
        invoiceDateKey: saleDateKey,
        customerName: resolvedCustomerName,
        firstName: personType === 'natural' ? splitName.firstName : '',
        lastName: personType === 'natural' ? splitName.lastName : '',
        personType,
        documentType: normId.cleanDocType,
        dianDocCode: getDianDocumentTypeCode(normId.cleanDocType),
        identification: normId.identification,
        verificationDigit: normId.verificationDigit,
        email: resolvedEmail,
        phone: resolvedPhone,
        address: resolvedAddress,
        city: resolvedCity,
        department: resolvedDept,
        cityCode: resolvedCityCode,
        departmentCode: resolvedDeptCode,
        taxRegime: resolvedRegime,
        fiscalResponsibility: resolvedFiscalResp,
        paymentMethodLabel: paySummary.paymentMethodLabel,
        siigoPaymentCode: paySummary.siigoPaymentCode,
        ticketsCount: 1,
        ticketIds: [targetSale.id],
        shortTicketRefs: `#${targetSale.id.slice(-6)}`,
        lines: mergedLines,
        totalBase: round2(totalBase),
        totalInc: round2(totalInc),
        totalIva: round2(totalIva),
        totalDiscount,
        totalTip,
        totalGrossProducts: round2(totalGrossProducts),
        totalChargedWithTip
      });
    }
  }

  const totalInvoicesCount = packages.length;
  const totalTicketsCount = filteredTickets.length;
  const totalLinesCount = packages.reduce((acc, p) => acc + p.lines.length, 0);
  const totalTaxableBase = round2(packages.reduce((acc, p) => acc + p.totalBase, 0));
  const totalIncAmount = round2(packages.reduce((acc, p) => acc + p.totalInc, 0));
  const totalIvaAmount = round2(packages.reduce((acc, p) => acc + p.totalIva, 0));
  const totalTipsAmount = round2(packages.reduce((acc, p) => acc + p.totalTip, 0));
  const totalGrossProducts = round2(packages.reduce((acc, p) => acc + p.totalGrossProducts, 0));

  const { headers: previewHeaders, rows: allMainRows } = buildPrimarySheetRows(packages, provider);

  const includedSheets =
    provider === 'siigo'
      ? ['1_Facturas_Siigo_Cloud', '2_Terceros_Clientes_Siigo', '3_Resumen_Compra_Contadora']
      : provider === 'alegra'
      ? ['1_Facturas_Alegra', '2_Contactos_Clientes_Alegra', '3_Resumen_Compra_Contadora']
      : provider === 'world_office'
      ? ['1_WorldOffice_Loggro', '2_Terceros_DIAN', '3_Resumen_Compra_Contadora']
      : ['1_Sabana_Clientes_y_Compras', '2_Directorio_Terceros_DIAN', '3_Tickets_y_Cuadre_Caja'];

  const safeApp = (appName || 'Chinmi').replace(/[^a-zA-Z0-9_-]/g, '_');
  const providerSlug =
    provider === 'siigo'
      ? 'SiigoCloud'
      : provider === 'alegra'
      ? 'Alegra'
      : provider === 'world_office'
      ? 'WorldOffice_Loggro'
      : 'Contadora_Completo';

  let suggestedFilename: string;
  if (mode === 'specific_order' && packages.length === 1) {
    const pkg = packages[0];
    const shortTicket = (pkg.ticketIds[0] || 'pedido').slice(-6).replace(/[^a-zA-Z0-9]/g, '');
    const idSlug = String(pkg.identification || 'Cliente').replace(/[^a-zA-Z0-9]/g, '');
    suggestedFilename = `FE_${providerSlug}_Doc_${idSlug}_Pedido_${shortTicket}_${pkg.invoiceDateKey}.xlsx`;
  } else {
    const modeSlug =
      mode === 'daily_global'
        ? 'MasivoDia'
        : mode === 'specific_order'
        ? 'PedidoEspecifico'
        : onlyPendingElectronicInvoices
        ? 'PendientesContadora'
        : 'ClientesFE';
    const dateSlug = targetDate || (mode === 'daily_global' ? effectiveDay : 'Consolidado');
    suggestedFilename = `FE_${providerSlug}_${modeSlug}_${safeApp}_${dateSlug}.xlsx`;
  }

  return {
    packages,
    filteredTickets,
    totalInvoicesCount,
    totalTicketsCount,
    totalLinesCount,
    totalTaxableBase,
    totalIncAmount,
    totalIvaAmount,
    totalTipsAmount,
    totalGrossProducts,
    previewHeaders,
    previewRows: allMainRows.slice(0, 5),
    includedSheets,
    suggestedFilename
  };
}

/**
 * Genera los encabezados y filas principales de la Hoja 1 según el proveedor elegido.
 */
function buildPrimarySheetRows(
  packages: ConsolidatedInvoicePackage[],
  provider: ExportBillingProvider
): {
  headers: string[];
  rows: Array<Array<string | number>>;
  textColumnIndices: number[];
  currencyColumnIndices: number[];
} {
  if (provider === 'siigo') {
    const headers = [
      'Código Comprobante',
      'Fecha Elaboración',
      'Identificación Tercero',
      'DV',
      'Sucursal',
      'Nombre / Razón Social',
      'Correo Envío FE',
      'Código Producto',
      'Código/Nombre Producto',
      'Cantidad',
      'Valor Unitario sin impuesto',
      '% Descuento',
      'Impuesto Cargo',
      'Forma de Pago',
      'Ref Ticket Caja'
    ];
    const rows: Array<Array<string | number>> = [];
    for (const pkg of packages) {
      const siigoDate = formatDateDDMMYYYY(pkg.invoiceDateKey);
      for (const line of pkg.lines) {
        rows.push([
          'FV-1',
          siigoDate,
          String(pkg.identification),
          String(pkg.verificationDigit || ''),
          '0',
          pkg.customerName,
          pkg.email || '',
          line.sku,
          line.codeAndName,
          line.quantity,
          line.unitBaseWithoutTax,
          0,
          line.providerTaxLabel,
          pkg.siigoPaymentCode,
          pkg.shortTicketRefs
        ]);
      }
    }
    return {
      headers,
      rows,
      textColumnIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14],
      currencyColumnIndices: [10]
    };
  }

  if (provider === 'alegra') {
    const headers = [
      'Referencia Ticket',
      'Cliente',
      'Tipo Identificación',
      'Identificación',
      'DV',
      'Correo Electrónico FE',
      'Fecha',
      'Vencimiento',
      'Forma de Pago',
      'Código Item',
      'Item',
      'Precio Unitario sin impuesto',
      'Cantidad',
      'Impuesto'
    ];
    const rows: Array<Array<string | number>> = [];
    for (const pkg of packages) {
      const isoDate = pkg.invoiceDateKey;
      for (const line of pkg.lines) {
        rows.push([
          pkg.shortTicketRefs,
          pkg.customerName,
          pkg.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : pkg.documentType,
          String(pkg.identification),
          String(pkg.verificationDigit || ''),
          pkg.email || '',
          isoDate,
          isoDate,
          pkg.paymentMethodLabel,
          line.sku,
          line.codeAndName,
          line.unitBaseWithoutTax,
          line.quantity,
          line.providerTaxLabel
        ]);
      }
    }
    return {
      headers,
      rows,
      textColumnIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13],
      currencyColumnIndices: [11]
    };
  }

  if (provider === 'world_office') {
    const headers = [
      'Fecha (DD/MM/AAAA)',
      'Tipo Comprobante',
      'Referencia Ticket',
      'Tipo Doc DIAN',
      'Tipo Documento',
      'NIT / Cédula Tercero',
      'DV',
      'Nombre / Razón Social',
      'Dirección Tercero',
      'Ciudad',
      'Código Ciudad DANE',
      'Teléfono',
      'Correo Facturación Electrónica',
      'Código Producto',
      'Descripción Producto',
      'Cantidad',
      'Valor Unitario Base',
      '% IVA',
      'Valor IVA Línea',
      '% Impoconsumo',
      'Valor INC Línea',
      'Total Línea PVP',
      'Forma de Pago'
    ];
    const rows: Array<Array<string | number>> = [];
    for (const pkg of packages) {
      const woDate = formatDateDDMMYYYY(pkg.invoiceDateKey);
      for (const line of pkg.lines) {
        const ivaRate = line.taxType === 'iva' ? line.taxRate : 0;
        const ivaVal = line.taxType === 'iva' ? line.lineTaxTotal : 0;
        const incRate = line.taxType === 'impoconsumo' ? line.taxRate : 0;
        const incVal = line.taxType === 'impoconsumo' ? line.lineTaxTotal : 0;

        rows.push([
          woDate,
          'FV',
          pkg.shortTicketRefs,
          pkg.dianDocCode,
          pkg.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : pkg.documentType,
          String(pkg.identification),
          String(pkg.verificationDigit || ''),
          pkg.customerName,
          pkg.address || 'Ciudad',
          pkg.city || 'Bogotá D.C.',
          String(pkg.cityCode || '11001'),
          String(pkg.phone || ''),
          pkg.email || '',
          line.sku,
          line.productName,
          line.quantity,
          line.unitBaseWithoutTax,
          ivaRate,
          ivaVal,
          incRate,
          incVal,
          line.lineGrossTotal,
          pkg.paymentMethodLabel
        ]);
      }
    }
    return {
      headers,
      rows,
      textColumnIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 22],
      currencyColumnIndices: [16, 18, 20, 21]
    };
  }

  // provider === 'chinmi' (Sabana Maestra Completa para Contadora / Cualquier Proveedor DIAN)
  const headers = [
    'Fecha Compra',
    'Ref Ticket',
    'Tipo Persona',
    'Cód DIAN',
    'Tipo Documento',
    'Identificación (Sin DV)',
    'DV',
    'Cliente / Razón Social',
    'Correo Envío FE',
    'Teléfono Cliente',
    'Dirección Fiscal',
    'Ciudad',
    'Departamento',
    'Código DANE',
    'Responsabilidad Fiscal',
    'SKU Producto',
    'Producto Consumido',
    'Cantidad',
    'PVP Unitario',
    'Base Unitaria sin Impuesto',
    'Impuesto Aplicado',
    'Base Gravable Línea',
    'Valor Impuesto Línea',
    'Total Línea PVP',
    'Medio de Pago'
  ];
  const rows: Array<Array<string | number>> = [];
  for (const pkg of packages) {
    for (const line of pkg.lines) {
      rows.push([
        pkg.invoiceDateKey,
        pkg.shortTicketRefs,
        pkg.personType === 'juridica' ? 'Persona Jurídica' : 'Persona Natural',
        pkg.dianDocCode,
        pkg.documentType,
        String(pkg.identification),
        String(pkg.verificationDigit || ''),
        pkg.customerName,
        pkg.email || 'Pendiente correo',
        String(pkg.phone || ''),
        pkg.address || '',
        pkg.city || '',
        pkg.department || '',
        String(pkg.cityCode || ''),
        pkg.fiscalResponsibility || 'R-99-PN',
        line.sku,
        line.productName,
        line.quantity,
        line.unitPricePVP,
        line.unitBaseWithoutTax,
        line.providerTaxLabel,
        line.lineBaseTotal,
        line.lineTaxTotal,
        line.lineGrossTotal,
        pkg.paymentMethodLabel
      ]);
    }
  }
  return {
    headers,
    rows,
    textColumnIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 24],
    currencyColumnIndices: [18, 19, 21, 22, 23]
  };
}

/**
 * Construye la Hoja 2: Plantilla de Creación/Actualización de Terceros (Clientes) adaptada al proveedor,
 * para que la contadora importe clientes nuevos sin rechazos en Siigo / Alegra / World Office.
 */
function buildThirdPartiesSheet(
  packages: ConsolidatedInvoicePackage[],
  provider: ExportBillingProvider
): {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  textColumnIndices: number[];
} {
  // Deduplicar terceros por identificación
  const uniqueMap = new Map<string, ConsolidatedInvoicePackage>();
  for (const pkg of packages) {
    const key = `${pkg.documentType}_${pkg.identification}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, pkg);
    }
  }
  const uniqueClients = Array.from(uniqueMap.values());

  if (provider === 'siigo') {
    const headers = [
      'Tipo de Persona',
      'Código Tipo Documento DIAN',
      'Tipo Documento',
      'Identificación (sin DV)',
      'Dígito Verificación',
      'Sucursal',
      'Razón Social (Empresa)',
      'Nombres (Persona Natural)',
      'Apellidos (Persona Natural)',
      'Nombre Comercial',
      'Dirección',
      'Código País',
      'Código Departamento DANE',
      'Departamento',
      'Código Ciudad DANE',
      'Ciudad',
      'Teléfono',
      'Correo Recepción Factura Electrónica',
      'Responsable de IVA',
      'Código Responsabilidad Fiscal'
    ];
    const rows = uniqueClients.map((c) => {
      const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
      const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
      return [
        isCompany ? 'Empresa' : 'Persona Natural',
        String(c.dianDocCode),
        c.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : c.documentType,
        String(c.identification),
        String(c.verificationDigit || ''),
        '0',
        isCompany ? c.customerName : '',
        isCompany ? '' : c.firstName || c.customerName,
        isCompany ? '' : c.lastName || 'Cliente',
        c.customerName,
        c.address || 'Dirección pendiente',
        'Co',
        String(c.departmentCode || '11'),
        c.department || 'Bogotá D.C.',
        String(c.cityCode || '11001'),
        c.city || 'Bogotá D.C.',
        String(c.phone || ''),
        c.email || '',
        regimeOpt?.siigoIvaResponsible || (isCompany ? 'Sí' : 'No'),
        c.fiscalResponsibility || 'R-99-PN'
      ];
    });
    return {
      sheetName: '2_Terceros_Clientes_Siigo',
      headers,
      rows,
      textColumnIndices: headers.map((_, idx) => idx)
    };
  }

  if (provider === 'alegra') {
    const headers = [
      'Nombre / Razón Social',
      'Primer Nombre',
      'Apellidos',
      'Tipo de Persona',
      'Tipo de Identificación',
      'Identificación',
      'DV',
      'Correo Electrónico (Envío FE)',
      'Teléfono / Celular',
      'Dirección',
      'Ciudad / Municipio',
      'Departamento',
      'Código Municipio DANE',
      'Régimen Tributario',
      'Responsabilidad Fiscal DIAN'
    ];
    const rows = uniqueClients.map((c) => {
      const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
      const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
      return [
        c.customerName,
        isCompany ? '' : c.firstName,
        isCompany ? '' : c.lastName,
        isCompany ? 'Persona Jurídica' : 'Persona Natural',
        c.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : c.documentType,
        String(c.identification),
        String(c.verificationDigit || ''),
        c.email || '',
        String(c.phone || ''),
        c.address || '',
        c.city || '',
        c.department || '',
        String(c.cityCode || ''),
        regimeOpt?.shortLabel || 'No resp. IVA',
        c.fiscalResponsibility || 'R-99-PN'
      ];
    });
    return {
      sheetName: '2_Contactos_Clientes_Alegra',
      headers,
      rows,
      textColumnIndices: headers.map((_, idx) => idx)
    };
  }

  const headers = [
    'Código Tipo Doc DIAN',
    'Tipo Documento',
    'Identificación (sin DV)',
    'DV',
    'Tipo Persona',
    'Razón Social / Nombre Completo',
    'Nombres',
    'Apellidos',
    'Correo Envío Factura Electrónica',
    'Teléfono / WhatsApp',
    'Dirección Fiscal',
    'Ciudad / Municipio',
    'Departamento',
    'Código DANE Municipio',
    'Régimen Tributario',
    'Responsabilidad Fiscal DIAN'
  ];
  const rows = uniqueClients.map((c) => {
    const isCompany = c.personType === 'juridica' || c.documentType === 'NIT';
    const regimeOpt = TAX_REGIME_OPTIONS.find((r) => r.value === c.taxRegime);
    return [
      String(c.dianDocCode),
      c.documentType,
      String(c.identification),
      String(c.verificationDigit || ''),
      isCompany ? 'Persona Jurídica' : 'Persona Natural',
      c.customerName,
      isCompany ? '' : c.firstName,
      isCompany ? '' : c.lastName,
      c.email || '',
      String(c.phone || ''),
      c.address || '',
      c.city || '',
      c.department || '',
      String(c.cityCode || ''),
      regimeOpt?.label || 'No responsable de IVA',
      c.fiscalResponsibility || 'R-99-PN'
    ];
  });

  return {
    sheetName: provider === 'world_office' ? '2_Terceros_DIAN' : '2_Directorio_Terceros_DIAN',
    headers,
    rows,
    textColumnIndices: headers.map((_, idx) => idx)
  };
}

/**
 * Crea una hoja de Excel desde una matriz AOA forzando formato Texto explícito ('@')
 * en las columnas de NIT/Cédula, DV, Códigos DANE, Sucursal y Fechas para nunca perder ceros iniciales.
 */
function createFormattedWorksheet(
  headers: string[],
  rows: Array<Array<string | number>>,
  textColumnIndices: number[],
  currencyColumnIndices: number[]
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const textColSet = new Set(textColumnIndices);
  const currencyColSet = new Set(currencyColumnIndices);

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
      } else if (currencyColSet.has(c) && typeof row[c] === 'number') {
        cell.t = 'n';
        cell.v = Number(row[c]);
        cell.z = '#,##0.00';
      }
    }
  }

  ws['!cols'] = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (const row of rows) {
      const valStr = row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : '';
      if (valStr.length > maxLen) {
        maxLen = valStr.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 4, 14), 44) };
  });

  return ws;
}

/**
 * Genera y descarga el paquete contable .xlsx listo para subir al proveedor seleccionado.
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

  const wb = XLSX.utils.book_new();

  // Hoja 1: Comprobantes / Facturas de Venta en el formato exacto del proveedor
  const primary = buildPrimarySheetRows(preview.packages, params.provider);
  const primaryWs = createFormattedWorksheet(
    primary.headers,
    primary.rows,
    primary.textColumnIndices,
    primary.currencyColumnIndices
  );

  const primarySheetName =
    params.provider === 'siigo'
      ? '1_Facturas_Siigo_Cloud'
      : params.provider === 'alegra'
      ? '1_Facturas_Alegra'
      : params.provider === 'world_office'
      ? '1_WorldOffice_Loggro'
      : '1_Sabana_Clientes_y_Compras';

  XLSX.utils.book_append_sheet(wb, primaryWs, primarySheetName);

  // Hoja 2: Terceros / Clientes con todos los campos DIAN (DV, DANE, Dirección, Correo FE, Régimen)
  const thirdParties = buildThirdPartiesSheet(preview.packages, params.provider);
  const thirdPartiesWs = createFormattedWorksheet(
    thirdParties.headers,
    thirdParties.rows,
    thirdParties.textColumnIndices,
    []
  );
  XLSX.utils.book_append_sheet(wb, thirdPartiesWs, thirdParties.sheetName);

  // Hoja 3: Resumen Contable y Cuadre de Caja (incluye propinas voluntarias no gravadas y medios de pago)
  const summaryHeaders = [
    'Fecha Factura',
    'Ref Ticket(s)',
    'Tipo Documento',
    'Identificación Tercero',
    'DV',
    'Cliente / Razón Social',
    'Correo Envío FE',
    'Teléfono',
    'Ciudad (DANE)',
    'Dirección',
    'Medio de Pago',
    'Tickets Agrupados',
    'Base Gravable',
    'INC 8% (Impoconsumo)',
    'IVA 19%',
    'Descuentos',
    'Total Factura DIAN (Productos)',
    'Propina Voluntaria (No gravada)',
    'Total Recaudado en Caja'
  ];

  const summaryRows: Array<Array<string | number>> = preview.packages.map((pkg) => [
    params.provider === 'siigo' || params.provider === 'world_office'
      ? formatDateDDMMYYYY(pkg.invoiceDateKey)
      : pkg.invoiceDateKey,
    pkg.shortTicketRefs,
    pkg.documentType,
    String(pkg.identification),
    String(pkg.verificationDigit || ''),
    pkg.customerName,
    pkg.email || 'Sin correo',
    String(pkg.phone || ''),
    pkg.city ? `${pkg.city}${pkg.cityCode ? ` (${pkg.cityCode})` : ''}` : '',
    pkg.address || '',
    pkg.paymentMethodLabel,
    pkg.ticketsCount,
    pkg.totalBase,
    pkg.totalInc,
    pkg.totalIva,
    pkg.totalDiscount,
    pkg.totalGrossProducts,
    pkg.totalTip,
    pkg.totalChargedWithTip
  ]);

  const summaryWs = createFormattedWorksheet(
    summaryHeaders,
    summaryRows,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [12, 13, 14, 15, 16, 17, 18]
  );

  const summarySheetName =
    params.provider === 'chinmi' ? '3_Tickets_y_Cuadre_Caja' : '3_Resumen_Compra_Contadora';
  XLSX.utils.book_append_sheet(wb, summaryWs, summarySheetName);

  XLSX.writeFile(wb, preview.suggestedFilename, { bookType: 'xlsx' });

  return {
    success: true,
    filename: preview.suggestedFilename,
    invoicesExported: preview.totalInvoicesCount,
    exportedTicketIds: preview.filteredTickets.map((t) => t.id)
  };
}
