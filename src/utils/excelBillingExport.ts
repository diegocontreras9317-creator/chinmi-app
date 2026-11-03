import * as XLSX from 'xlsx';
import { CustomerBillingInfo, OrderItem, Product, ProductTaxType, SaleReceipt } from '../types';
import { getSaleCustomerEmail, isElectronicInvoiceSale } from './billing';
import { resolveOrderItemTax } from './taxes';

export type ExportGroupingMode = 'daily_global' | 'by_customer' | 'specific_order';
export type ExportBillingProvider = 'siigo' | 'alegra' | 'chinmi';

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
  /** Required when mode === 'specific_order': ID of the exact SaleReceipt order to invoice */
  selectedSaleId?: string;
  /** Optional customer NIT/Cédula/Razón Social/Email override for mode === 'specific_order' */
  customerOverride?: Partial<CustomerBillingInfo> | null;
}

export interface NormalizedInvoiceLine {
  productId: string;
  sku: string;
  productName: string;
  codeAndName: string;
  quantity: number;
  unitPricePVP: number;
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
  documentType: string;
  identification: string; // Explicit string preserving leading zeros (no DV suffix)
  verificationDigit: string;
  email: string;
  ticketsCount: number;
  ticketIds: string[];
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
  totalGrossProducts: number;
  previewHeaders: string[];
  previewRows: Array<Array<string | number>>;
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
 * Convierte YYYY-MM-DD a DD/MM/AAAA para Siigo Cloud.
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
 * Etiqueta estándar del impuesto para plantillas de Siigo Cloud y Alegra:
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

/**
 * Normaliza Cédula / NIT como String explícito conservando todos los ceros a la izquierda.
 * Si es NIT con dígito de verificación separado por guion (ej. "0900123456-7"),
 * separa la identificación base ("0900123456") y el DV ("7") sin convertir a Number.
 */
export function normalizeCustomerIdentification(
  rawNumber?: string | null,
  docType?: string | null
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

  // Eliminamos espacios y puntos de miles, conservando intactos los ceros iniciales
  const compact = raw.replace(/[\s.]/g, '');

  if (compact.includes('-')) {
    const [basePart, dvPart = ''] = compact.split('-');
    const safeBase = basePart.trim() || '222222222222';
    return {
      identification: String(safeBase),
      verificationDigit: String(dvPart.trim()),
      cleanDocType: cleanDocType === 'CONSUMIDOR_FINAL' ? 'NIT' : cleanDocType
    };
  }

  return {
    identification: String(compact),
    verificationDigit: '',
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
    const netPVP = (sale.subtotal - sale.discountAmount) > 0 ? sale.subtotal - sale.discountAmount : sale.total;
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
    const sku = (catalogProduct?.sku || '').trim();
    const cleanName = (item.name || catalogProduct?.name || 'Producto').trim();
    const codeAndName = sku ? `${sku} - ${cleanName}` : cleanName;

    const resolvedTax = resolveOrderItemTax(
      item as unknown as Partial<OrderItem> & Record<string, unknown>,
      productsCatalog,
      sale.taxPercent
    );

    const effectiveUnitPVP = rawUnitPVP * discountFactor;
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
 * sumando cantidades para empaquetar comprobantes limpios en Siigo / Alegra.
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

      packages.push({
        packageKey: `GLOBAL_${effectiveDay}`,
        invoiceDateKey: effectiveDay,
        customerName: 'Consumidor Final',
        documentType: 'CONSUMIDOR_FINAL',
        identification: '222222222222',
        verificationDigit: '',
        email: '',
        ticketsCount: filteredTickets.length,
        ticketIds: filteredTickets.map((t) => t.id),
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
    // mode === 'by_customer': Solo clientes que solicitaron Factura Electrónica, agrupados por Cédula/NIT
    filteredTickets = sales.filter((s) => {
      if (!isElectronicInvoiceSale(s)) return false;
      if (targetDate && saleTimestampToDateKey(s.timestamp) !== targetDate) return false;
      return true;
    });

    const groupedByCustomer = new Map<
      string,
      {
        salesList: SaleReceipt[];
        customerName: string;
        documentType: string;
        identification: string;
        verificationDigit: string;
        email: string;
        latestDateKey: string;
      }
    >();

    for (const sale of filteredTickets) {
      const rawDocType = sale.customerDocumentType || sale.billingInfo?.documentType || 'CC';
      const rawDocNumber = sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '';
      const normId = normalizeCustomerIdentification(rawDocNumber, rawDocType);
      const email = getSaleCustomerEmail(sale);
      const custName =
        (sale.customerName || sale.billingInfo?.customerName || '').trim() || 'Cliente Factura Electrónica';
      const saleDateKey = saleTimestampToDateKey(sale.timestamp) || effectiveDay;

      // Clave de agrupación por Cédula/NIT individual (o correo si excepcionalmente no digitó documento)
      const buyerKey =
        normId.identification !== '222222222222'
          ? `ID_${normId.identification}`
          : email
          ? `EMAIL_${email.toLowerCase()}`
          : `TICKET_${sale.id}`;

      const existing = groupedByCustomer.get(buyerKey);
      if (existing) {
        existing.salesList.push(sale);
        if (!existing.email && email) existing.email = email;
        if (
          existing.customerName === 'Consumidor Final' &&
          custName &&
          custName !== 'Consumidor Final'
        ) {
          existing.customerName = custName;
        }
        if (saleDateKey > existing.latestDateKey) {
          existing.latestDateKey = saleDateKey;
        }
      } else {
        groupedByCustomer.set(buyerKey, {
          salesList: [sale],
          customerName: custName,
          documentType: normId.cleanDocType,
          identification: normId.identification,
          verificationDigit: normId.verificationDigit,
          email,
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

      packages.push({
        packageKey: buyerKey,
        invoiceDateKey: targetDate || group.latestDateKey || effectiveDay,
        customerName: group.customerName,
        documentType: group.documentType,
        identification: group.identification,
        verificationDigit: group.verificationDigit,
        email: group.email,
        ticketsCount: group.salesList.length,
        ticketIds: group.salesList.map((s) => s.id),
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
    // mode === 'specific_order': Un cliente en específico (NIT / Cédula) con el pedido exacto que se tomó
    const targetSale = selectedSaleId ? sales.find((s) => s.id === selectedSaleId) : undefined;
    if (targetSale) {
      const overrideDocNum = (customerOverride?.documentNumber ?? '').trim();
      const overrideDocType = customerOverride?.documentType;
      const overrideName = (customerOverride?.customerName ?? '').trim();
      const overrideEmail = (customerOverride?.email ?? '').trim().toLowerCase();

      const rawDocNumber =
        overrideDocNum ||
        targetSale.customerDocumentNumber ||
        targetSale.billingInfo?.documentNumber ||
        '';
      const rawDocType =
        (overrideDocType && overrideDocType !== 'CONSUMIDOR_FINAL'
          ? overrideDocType
          : undefined) ||
        targetSale.customerDocumentType ||
        targetSale.billingInfo?.documentType ||
        (rawDocNumber ? 'CC' : 'CONSUMIDOR_FINAL');

      const normId = normalizeCustomerIdentification(rawDocNumber, rawDocType);
      const resolvedEmail = overrideEmail || getSaleCustomerEmail(targetSale);
      const storedName = (
        targetSale.customerName ||
        targetSale.billingInfo?.customerName ||
        ''
      ).trim();
      const resolvedCustomerName =
        (overrideName && overrideName.toLowerCase() !== 'consumidor final'
          ? overrideName
          : '') ||
        (storedName && storedName.toLowerCase() !== 'consumidor final'
          ? storedName
          : '') ||
        'Cliente Factura Electrónica';

      const saleDateKey = saleTimestampToDateKey(targetSale.timestamp) || effectiveDay;

      // Enriquecer el ticket en la hoja de auditoría con los datos del cliente asignado
      const enrichedSaleForAudit: SaleReceipt = {
        ...targetSale,
        customerName: resolvedCustomerName,
        customerDocumentType: normId.cleanDocType as SaleReceipt['customerDocumentType'],
        customerDocumentNumber: normId.verificationDigit
          ? `${normId.identification}-${normId.verificationDigit}`
          : normId.identification,
        customerEmail: resolvedEmail,
        requiresElectronicInvoice: true,
        billingInfo: {
          customerName: resolvedCustomerName,
          documentType: normId.cleanDocType as CustomerBillingInfo['documentType'],
          documentNumber: normId.verificationDigit
            ? `${normId.identification}-${normId.verificationDigit}`
            : normId.identification,
          ...(resolvedEmail ? { email: resolvedEmail } : {}),
          requiresElectronicInvoice: true
        }
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

      packages.push({
        packageKey: `ORDER_${targetSale.id}_${normId.identification}`,
        invoiceDateKey: saleDateKey,
        customerName: resolvedCustomerName,
        documentType: normId.cleanDocType,
        identification: normId.identification,
        verificationDigit: normId.verificationDigit,
        email: resolvedEmail,
        ticketsCount: 1,
        ticketIds: [targetSale.id],
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
  const totalGrossProducts = round2(packages.reduce((acc, p) => acc + p.totalGrossProducts, 0));

  const { headers: previewHeaders, rows: allMainRows } = buildPrimarySheetRows(packages, provider);

  const safeApp = (appName || 'Chinmi').replace(/[^a-zA-Z0-9_-]/g, '_');
  const providerSlug =
    provider === 'siigo' ? 'SiigoCloud' : provider === 'alegra' ? 'Alegra' : 'ChinmiGeneral';

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
        : 'PorClienteFE';
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
    totalGrossProducts,
    previewHeaders,
    previewRows: allMainRows.slice(0, 5),
    suggestedFilename
  };
}

/**
 * Genera los encabezados y filas principales de la Hoja 1 según el proveedor elegido.
 */
function buildPrimarySheetRows(
  packages: ConsolidatedInvoicePackage[],
  provider: ExportBillingProvider
): { headers: string[]; rows: Array<Array<string | number>>; textColumnIndices: number[]; currencyColumnIndices: number[] } {
  if (provider === 'siigo') {
    const headers = [
      'Código Comprobante',
      'Fecha',
      'Identificación Tercero',
      'Sucursal',
      'Código/Nombre Producto',
      'Cantidad',
      'Valor Unitario sin impuesto',
      'Impuesto'
    ];
    const rows: Array<Array<string | number>> = [];
    for (const pkg of packages) {
      const siigoDate = formatDateDDMMYYYY(pkg.invoiceDateKey);
      for (const line of pkg.lines) {
        rows.push([
          'FV-1',
          siigoDate,
          String(pkg.identification),
          '0',
          line.codeAndName,
          line.quantity,
          line.unitBaseWithoutTax,
          line.providerTaxLabel
        ]);
      }
    }
    return {
      headers,
      rows,
      textColumnIndices: [0, 1, 2, 3, 4, 7],
      currencyColumnIndices: [6]
    };
  }

  if (provider === 'alegra') {
    const headers = [
      'Cliente',
      'Identificación',
      'Fecha',
      'Vencimiento',
      'Item',
      'Precio Unitario sin impuesto',
      'Cantidad',
      'Impuesto'
    ];
    const rows: Array<Array<string | number>> = [];
    for (const pkg of packages) {
      const isoDate = pkg.invoiceDateKey; // AAAA-MM-DD
      for (const line of pkg.lines) {
        rows.push([
          pkg.customerName,
          String(pkg.identification),
          isoDate,
          isoDate,
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
      textColumnIndices: [0, 1, 2, 3, 4, 7],
      currencyColumnIndices: [5]
    };
  }

  // provider === 'chinmi' (Excel General Chinmi App)
  const headers = [
    'Fecha',
    'Tipo Documento',
    'Identificación Cliente',
    'Cliente / Razón Social',
    'Correo Electrónico',
    'Código/Nombre Producto',
    'Cantidad',
    'PVP Unitario',
    'Valor Unitario sin impuesto',
    'Impuesto',
    'Base Gravable Línea',
    'Valor Impuesto Línea',
    'Total Línea PVP'
  ];
  const rows: Array<Array<string | number>> = [];
  for (const pkg of packages) {
    for (const line of pkg.lines) {
      rows.push([
        pkg.invoiceDateKey,
        pkg.documentType,
        String(pkg.identification),
        pkg.customerName,
        pkg.email || 'Sin correo',
        line.codeAndName,
        line.quantity,
        line.unitPricePVP,
        line.unitBaseWithoutTax,
        line.providerTaxLabel,
        line.lineBaseTotal,
        line.lineTaxTotal,
        line.lineGrossTotal
      ]);
    }
  }
  return {
    headers,
    rows,
    textColumnIndices: [0, 1, 2, 3, 4, 5, 9],
    currencyColumnIndices: [7, 8, 10, 11, 12]
  };
}

/**
 * Crea una hoja de Excel desde una matriz AOA forzando formato Texto explícito ('@')
 * en las columnas de NIT/Cédula, Sucursal, Fechas y Códigos para preservar ceros iniciales.
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

  // Ajuste automático de ancho de columnas para lectura cómoda en Excel
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
 * Genera y descarga el archivo nativo .xlsx según los parámetros seleccionados.
 */
export function downloadBillingExcelFile(params: BillingExportParams): {
  success: boolean;
  filename: string;
  invoicesExported: number;
} {
  const preview = buildBillingExportPreview(params);
  if (preview.packages.length === 0) {
    return {
      success: false,
      filename: preview.suggestedFilename,
      invoicesExported: 0
    };
  }

  const wb = XLSX.utils.book_new();
  const primary = buildPrimarySheetRows(preview.packages, params.provider);
  const primaryWs = createFormattedWorksheet(
    primary.headers,
    primary.rows,
    primary.textColumnIndices,
    primary.currencyColumnIndices
  );

  const primarySheetName =
    params.provider === 'siigo'
      ? 'Siigo_Cloud'
      : params.provider === 'alegra'
      ? 'Alegra_Facturas'
      : 'Detalle_Productos';

  XLSX.utils.book_append_sheet(wb, primaryWs, primarySheetName);

  // Hoja 2: Directorio / Resumen de Terceros y Comprobantes (con NIT/Cédula como String '@')
  const summaryHeaders = [
    'Fecha Factura',
    'Tipo Documento',
    'Identificación Tercero',
    'DV',
    'Cliente / Razón Social',
    'Correo Electrónico FE',
    'Tickets Agrupados',
    'Base Gravable',
    'INC (Impoconsumo)',
    'IVA',
    'Descuentos',
    'Propina',
    'Total Productos PVP',
    'Total Cobrado en Caja'
  ];

  const summaryRows: Array<Array<string | number>> = preview.packages.map((pkg) => [
    params.provider === 'siigo' ? formatDateDDMMYYYY(pkg.invoiceDateKey) : pkg.invoiceDateKey,
    pkg.documentType,
    String(pkg.identification),
    String(pkg.verificationDigit || ''),
    pkg.customerName,
    pkg.email || 'Sin correo',
    pkg.ticketsCount,
    pkg.totalBase,
    pkg.totalInc,
    pkg.totalIva,
    pkg.totalDiscount,
    pkg.totalTip,
    pkg.totalGrossProducts,
    pkg.totalChargedWithTip
  ]);

  const summaryWs = createFormattedWorksheet(
    summaryHeaders,
    summaryRows,
    [0, 1, 2, 3, 4, 5],
    [7, 8, 9, 10, 11, 12, 13]
  );

  const summarySheetName =
    params.provider === 'chinmi' ? 'Resumen_Facturacion' : 'Terceros_y_Totales';
  XLSX.utils.book_append_sheet(wb, summaryWs, summarySheetName);

  // Hoja 3 exclusiva para Excel General Chinmi App: Auditoría completa ticket por ticket de caja
  if (params.provider === 'chinmi') {
    const ticketHeaders = [
      'ID Ticket',
      'Fecha',
      'Hora',
      'Mesa',
      'Cajero',
      'Método de Pago',
      'Tipo Documento',
      'Identificación Cliente',
      'Cliente / Razón Social',
      'Correo Electrónico',
      'Solicitó FE',
      'Estado FE',
      'Subtotal',
      'Descuento',
      'Base Gravable',
      'Impoconsumo',
      'IVA',
      'Propina',
      'Total Cobrado'
    ];

    const ticketRows: Array<Array<string | number>> = preview.filteredTickets.map((sale) => {
      const rawDocType = sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL';
      const rawDocNum = sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '';
      const normId = normalizeCustomerIdentification(rawDocNum, rawDocType);
      const custName =
        (sale.customerName || sale.billingInfo?.customerName || '').trim() || 'Consumidor Final';
      const email = getSaleCustomerEmail(sale) || '';
      const needsFE = isElectronicInvoiceSale(sale);
      const feStatus = needsFE
        ? sale.electronicInvoiceStatus === 'emitida'
          ? 'Emitida'
          : 'Pendiente'
        : 'POS Estándar';

      const dateObj = new Date(sale.timestamp);
      const dateStr = saleTimestampToDateKey(sale.timestamp);
      const timeStr = Number.isNaN(dateObj.getTime())
        ? ''
        : dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

      const saleLines = extractNormalizedSaleLines(sale, params.productsCatalog);
      const baseSum = round2(saleLines.reduce((acc, l) => acc + l.lineBaseTotal, 0));
      const incSum = round2(
        saleLines
          .filter((l) => l.taxType === 'impoconsumo')
          .reduce((acc, l) => acc + l.lineTaxTotal, 0)
      );
      const ivaSum = round2(
        saleLines.filter((l) => l.taxType === 'iva').reduce((acc, l) => acc + l.lineTaxTotal, 0)
      );
      const paymentLabel =
        sale.paymentMethod === 'bizum'
          ? 'Transferencia / QR'
          : sale.paymentMethod === 'tarjeta'
          ? 'Tarjeta'
          : 'Efectivo';

      return [
        String(sale.id),
        dateStr,
        timeStr,
        sale.tableName,
        sale.cashierName,
        paymentLabel,
        normId.cleanDocType,
        String(normId.identification),
        custName,
        email || 'Sin correo',
        needsFE ? 'Sí' : 'No',
        feStatus,
        round2(sale.subtotal),
        round2(sale.discountAmount),
        baseSum,
        incSum,
        ivaSum,
        round2(sale.tipAmount),
        round2(sale.total)
      ];
    });

    const ticketsWs = createFormattedWorksheet(
      ticketHeaders,
      ticketRows,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [12, 13, 14, 15, 16, 17, 18]
    );
    XLSX.utils.book_append_sheet(wb, ticketsWs, 'Tickets_Caja');
  }

  XLSX.writeFile(wb, preview.suggestedFilename, { bookType: 'xlsx' });

  return {
    success: true,
    filename: preview.suggestedFilename,
    invoicesExported: preview.totalInvoicesCount
  };
}
