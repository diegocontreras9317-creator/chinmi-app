import {
  CustomerBillingInfo,
  CustomerDocumentType,
  CustomerPersonType,
  CustomerTaxRegime,
  OrderItem,
  Product,
  SaleReceipt,
  Table
} from '../types';
import { calculateOrderTaxBreakdown, resolveOrderItemTax } from './taxes';

export interface DocumentTypeOption {
  value: CustomerDocumentType;
  label: string;
  shortLabel: string;
  dianCode: string;
  siigoLabel: string;
  placeholder: string;
}

export const DOCUMENT_TYPE_OPTIONS: DocumentTypeOption[] = [
  {
    value: 'CONSUMIDOR_FINAL',
    label: 'Consumidor Final (222222222222)',
    shortLabel: 'Consumidor Final',
    dianCode: '13',
    siigoLabel: 'CC',
    placeholder: 'Opcional'
  },
  {
    value: 'CC',
    label: 'Cédula de Ciudadanía (C.C.)',
    shortLabel: 'C.C.',
    dianCode: '13',
    siigoLabel: 'CC',
    placeholder: 'Ej. 1020304050'
  },
  {
    value: 'NIT',
    label: 'NIT / RUT Empresarial',
    shortLabel: 'NIT',
    dianCode: '31',
    siigoLabel: 'NIT',
    placeholder: 'Ej. 900123456-7'
  },
  {
    value: 'CE',
    label: 'Cédula de Extranjería (C.E.)',
    shortLabel: 'C.E.',
    dianCode: '22',
    siigoLabel: 'CE',
    placeholder: 'Ej. 400500600'
  },
  {
    value: 'PAS',
    label: 'Pasaporte',
    shortLabel: 'Pasaporte',
    dianCode: '41',
    siigoLabel: 'PP',
    placeholder: 'Ej. AB1234567'
  },
  {
    value: 'TI',
    label: 'Tarjeta de Identidad (T.I.)',
    shortLabel: 'T.I.',
    dianCode: '12',
    siigoLabel: 'TI',
    placeholder: 'Ej. 1002003004'
  },
  {
    value: 'PEP',
    label: 'PPT / Permiso Especial',
    shortLabel: 'PPT',
    dianCode: '47',
    siigoLabel: 'PEP',
    placeholder: 'Ej. 7654321'
  }
];

export interface TaxRegimeOption {
  value: CustomerTaxRegime;
  label: string;
  shortLabel: string;
  siigoIvaResponsible: 'Sí' | 'No';
  defaultFiscalCode: string;
}

export const TAX_REGIME_OPTIONS: TaxRegimeOption[] = [
  {
    value: 'no_responsable_iva',
    label: 'No responsable de IVA (Persona Natural / Simplificado)',
    shortLabel: 'No resp. IVA',
    siigoIvaResponsible: 'No',
    defaultFiscalCode: 'R-99-PN'
  },
  {
    value: 'responsable_iva',
    label: 'Responsable de IVA (Régimen Común / Ordinario)',
    shortLabel: 'Responsable IVA',
    siigoIvaResponsible: 'Sí',
    defaultFiscalCode: 'R-99-PN'
  },
  {
    value: 'regimen_simple',
    label: 'Régimen Simple de Tributación (RST - O-47)',
    shortLabel: 'Régimen Simple',
    siigoIvaResponsible: 'Sí',
    defaultFiscalCode: 'O-47'
  },
  {
    value: 'gran_contribuyente',
    label: 'Gran Contribuyente (O-13)',
    shortLabel: 'Gran Contribuyente',
    siigoIvaResponsible: 'Sí',
    defaultFiscalCode: 'O-13'
  },
  {
    value: 'autorretenedor',
    label: 'Autorretenedor (O-15)',
    shortLabel: 'Autorretenedor',
    siigoIvaResponsible: 'Sí',
    defaultFiscalCode: 'O-15'
  }
];

export const FISCAL_RESPONSIBILITY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'R-99-PN', label: 'R-99-PN · No aplica - Otros (Estándar DIAN)' },
  { code: 'O-47', label: 'O-47 · Régimen Simple de Tributación (RST)' },
  { code: 'O-13', label: 'O-13 · Gran contribuyente' },
  { code: 'O-15', label: 'O-15 · Autorretenedor' },
  { code: 'O-23', label: 'O-23 · Agente de retención IVA' }
];

export interface ColombianCityDane {
  city: string;
  department: string;
  cityCode: string;
  departmentCode: string;
}

export const COLOMBIAN_CITIES_DANE: ColombianCityDane[] = [
  { city: 'Bogotá D.C.', department: 'Bogotá D.C.', cityCode: '11001', departmentCode: '11' },
  { city: 'Medellín', department: 'Antioquia', cityCode: '05001', departmentCode: '05' },
  { city: 'Cali', department: 'Valle del Cauca', cityCode: '76001', departmentCode: '76' },
  { city: 'Barranquilla', department: 'Atlántico', cityCode: '08001', departmentCode: '08' },
  { city: 'Cartagena', department: 'Bolívar', cityCode: '13001', departmentCode: '13' },
  { city: 'Bucaramanga', department: 'Santander', cityCode: '68001', departmentCode: '68' },
  { city: 'Pereira', department: 'Risaralda', cityCode: '66001', departmentCode: '66' },
  { city: 'Manizales', department: 'Caldas', cityCode: '17001', departmentCode: '17' },
  { city: 'Santa Marta', department: 'Magdalena', cityCode: '47001', departmentCode: '47' },
  { city: 'Cúcuta', department: 'Norte de Santander', cityCode: '54001', departmentCode: '54' },
  { city: 'Ibagué', department: 'Tolima', cityCode: '73001', departmentCode: '73' },
  { city: 'Villavicencio', department: 'Meta', cityCode: '50001', departmentCode: '50' },
  { city: 'Pasto', department: 'Nariño', cityCode: '52001', departmentCode: '52' },
  { city: 'Montería', department: 'Córdoba', cityCode: '23001', departmentCode: '23' },
  { city: 'Armenia', department: 'Quindío', cityCode: '63001', departmentCode: '63' },
  { city: 'Neiva', department: 'Huila', cityCode: '41001', departmentCode: '41' },
  { city: 'Popayán', department: 'Cauca', cityCode: '19001', departmentCode: '19' },
  { city: 'Tunja', department: 'Boyacá', cityCode: '15001', departmentCode: '15' },
  { city: 'Valledupar', department: 'Cesar', cityCode: '20001', departmentCode: '20' },
  { city: 'Sincelejo', department: 'Sucre', cityCode: '70001', departmentCode: '70' },
  { city: 'Riohacha', department: 'La Guajira', cityCode: '44001', departmentCode: '44' },
  { city: 'Yopal', department: 'Casanare', cityCode: '85001', departmentCode: '85' },
  { city: 'Envigado', department: 'Antioquia', cityCode: '05266', departmentCode: '05' },
  { city: 'Sabaneta', department: 'Antioquia', cityCode: '05631', departmentCode: '05' },
  { city: 'Itagüí', department: 'Antioquia', cityCode: '05360', departmentCode: '05' },
  { city: 'Bello', department: 'Antioquia', cityCode: '05088', departmentCode: '05' },
  { city: 'Rionegro', department: 'Antioquia', cityCode: '05615', departmentCode: '05' },
  { city: 'Chía', department: 'Cundinamarca', cityCode: '25175', departmentCode: '25' },
  { city: 'Cajicá', department: 'Cundinamarca', cityCode: '25126', departmentCode: '25' },
  { city: 'Soacha', department: 'Cundinamarca', cityCode: '25754', departmentCode: '25' },
  { city: 'Floridablanca', department: 'Santander', cityCode: '68276', departmentCode: '68' },
  { city: 'Palmira', department: 'Valle del Cauca', cityCode: '76520', departmentCode: '76' },
  { city: 'Dosquebradas', department: 'Risaralda', cityCode: '66170', departmentCode: '66' }
];

function stripDiacritics(val: string): string {
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveColombianCity(cityOrCode?: string | null): ColombianCityDane | null {
  const clean = String(cityOrCode ?? '').trim();
  if (!clean) return null;

  const byCode = COLOMBIAN_CITIES_DANE.find((c) => c.cityCode === clean);
  if (byCode) return byCode;

  const norm = stripDiacritics(clean);
  if (norm === 'bogota' || norm === 'bogota d.c.' || norm === 'bogota dc') {
    return COLOMBIAN_CITIES_DANE[0];
  }

  return (
    COLOMBIAN_CITIES_DANE.find((c) => stripDiacritics(c.city) === norm) ||
    COLOMBIAN_CITIES_DANE.find((c) => stripDiacritics(c.city).startsWith(norm)) ||
    null
  );
}

/**
 * Calcula oficialmente el Dígito de Verificación (DV) de un NIT en Colombia según el algoritmo Módulo 11 de la DIAN.
 * Recibe el NIT base sin DV (solo dígitos).
 */
export function calculateColombiaNitDV(rawNit?: string | null): string {
  const clean = String(rawNit ?? '')
    .trim()
    .split('-')[0]
    .replace(/\D/g, '');
  if (!clean || clean.length < 5 || clean.length > 15) return '';

  const primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  const len = clean.length;

  for (let i = 0; i < len; i++) {
    const digit = Number(clean[len - 1 - i]);
    if (Number.isNaN(digit)) return '';
    sum += digit * primes[i];
  }

  const remainder = sum % 11;
  return remainder > 1 ? String(11 - remainder) : String(remainder);
}

/**
 * Separa un nombre completo de Persona Natural en Nombres y Apellidos para plantillas Siigo / Alegra / World Office.
 */
export function splitNaturalPersonName(fullName?: string | null): {
  firstName: string;
  lastName: string;
} {
  const clean = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!clean || clean.toLowerCase() === 'consumidor final') {
    return { firstName: 'Consumidor', lastName: 'Final' };
  }
  const parts = clean.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Cliente' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  if (parts.length === 3) {
    return { firstName: parts[0], lastName: `${parts[1]} ${parts[2]}` };
  }
  return {
    firstName: parts.slice(0, parts.length - 2).join(' '),
    lastName: parts.slice(parts.length - 2).join(' ')
  };
}

export function getDianDocumentTypeCode(type?: CustomerDocumentType | string): string {
  const found = DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === type);
  return found ? found.dianCode : '13';
}

export function getDocumentShortLabel(type?: CustomerDocumentType | string): string {
  if (!type || type === 'CONSUMIDOR_FINAL') return '';
  const found = DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === type);
  return found ? found.shortLabel : String(type);
}

export function formatCustomerDocument(
  type?: CustomerDocumentType | string,
  documentNumber?: string,
  explicitDv?: string
): string {
  const cleanNum = (documentNumber || '').trim();
  if (!cleanNum) return '';
  const shortLabel = getDocumentShortLabel(type) || 'Doc.';
  if (type === 'NIT' && !cleanNum.includes('-')) {
    const dv = (explicitDv || calculateColombiaNitDV(cleanNum)).trim();
    if (dv) {
      return `${shortLabel} ${cleanNum}-${dv}`;
    }
  }
  return `${shortLabel} ${cleanNum}`;
}

export function isValidEmailFormat(email?: string): boolean {
  const clean = (email || '').trim();
  if (!clean) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function normalizeBillingInfo(input?: Partial<CustomerBillingInfo> | null): CustomerBillingInfo {
  const cleanName = (input?.customerName || '').trim();
  const rawNumber = (input?.documentNumber || '').trim();
  const cleanEmail = (input?.email || '').trim().toLowerCase();
  const cleanPhone = (input?.phone || '').trim();
  const cleanAddress = (input?.address || '').trim();
  const rawCity = (input?.city || '').trim();
  const matchedCity = resolveColombianCity(input?.cityCode || rawCity);
  const cleanCity = matchedCity?.city || rawCity;
  const cleanDepartment = (input?.department || matchedCity?.department || '').trim();
  const cleanCityCode = (input?.cityCode || matchedCity?.cityCode || '').trim();
  const cleanDepartmentCode = (input?.departmentCode || matchedCity?.departmentCode || '').trim();

  const wantsElectronic = Boolean(input?.requiresElectronicInvoice || cleanEmail);

  let resolvedType: CustomerDocumentType =
    (input?.documentType as CustomerDocumentType) || 'CONSUMIDOR_FINAL';

  if (rawNumber && resolvedType === 'CONSUMIDOR_FINAL') {
    resolvedType = rawNumber.includes('-') ? 'NIT' : 'CC';
  }
  if (!rawNumber && resolvedType !== 'CONSUMIDOR_FINAL' && !cleanName && !wantsElectronic) {
    resolvedType = 'CONSUMIDOR_FINAL';
  }

  // Extraer base y DV si es NIT o si incluye guion
  let cleanDocNumber = rawNumber;
  let resolvedDv = (input?.dv || '').trim();
  if (rawNumber.includes('-')) {
    const [base, dvPart = ''] = rawNumber.replace(/[\s.]/g, '').split('-');
    if (resolvedType === 'NIT' || /^\d+$/.test(dvPart)) {
      resolvedDv = resolvedDv || dvPart.trim();
      cleanDocNumber = resolvedDv ? `${base.trim()}-${resolvedDv}` : base.trim();
    }
  } else if (resolvedType === 'NIT' && rawNumber) {
    const cleanDigits = rawNumber.replace(/[\s.]/g, '');
    resolvedDv = resolvedDv || calculateColombiaNitDV(cleanDigits);
    cleanDocNumber = resolvedDv ? `${cleanDigits}-${resolvedDv}` : cleanDigits;
  }

  const resolvedPersonType: CustomerPersonType =
    input?.personType || (resolvedType === 'NIT' ? 'juridica' : 'natural');

  const resolvedRegime: CustomerTaxRegime =
    input?.taxRegime ||
    (resolvedPersonType === 'juridica' ? 'responsable_iva' : 'no_responsable_iva');

  const regimeMeta = TAX_REGIME_OPTIONS.find((r) => r.value === resolvedRegime);
  const resolvedFiscalResp =
    (input?.fiscalResponsibility || '').trim() || regimeMeta?.defaultFiscalCode || 'R-99-PN';

  let firstName = (input?.firstName || '').trim();
  let lastName = (input?.lastName || '').trim();
  if (resolvedPersonType === 'natural' && cleanName && (!firstName || !lastName)) {
    const split = splitNaturalPersonName(cleanName);
    firstName = firstName || split.firstName;
    lastName = lastName || split.lastName;
  }

  return {
    customerName: cleanName || 'Consumidor Final',
    documentType: resolvedType,
    documentNumber: cleanDocNumber,
    ...(resolvedDv ? { dv: resolvedDv } : {}),
    ...(resolvedType !== 'CONSUMIDOR_FINAL' ? { personType: resolvedPersonType } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(input?.commercialName?.trim() ? { commercialName: input.commercialName.trim() } : {}),
    ...(cleanEmail ? { email: cleanEmail } : {}),
    ...(cleanPhone ? { phone: cleanPhone } : {}),
    ...(cleanAddress ? { address: cleanAddress } : {}),
    ...(cleanCity ? { city: cleanCity } : {}),
    ...(cleanDepartment ? { department: cleanDepartment } : {}),
    ...(cleanCityCode ? { cityCode: cleanCityCode } : {}),
    ...(cleanDepartmentCode ? { departmentCode: cleanDepartmentCode } : {}),
    ...(resolvedType !== 'CONSUMIDOR_FINAL' ? { taxRegime: resolvedRegime } : {}),
    ...(resolvedType !== 'CONSUMIDOR_FINAL' ? { fiscalResponsibility: resolvedFiscalResp } : {}),
    ...(wantsElectronic ? { requiresElectronicInvoice: true } : {})
  };
}

export function hasCustomBillingData(info?: Partial<CustomerBillingInfo> | null): boolean {
  if (!info) return false;
  const cleanName = (info.customerName || '').trim();
  const cleanNum = (info.documentNumber || '').trim();
  const cleanEmail = (info.email || '').trim();
  const cleanPhone = (info.phone || '').trim();
  const cleanAddress = (info.address || '').trim();
  const hasRealName = Boolean(cleanName && cleanName.toLowerCase() !== 'consumidor final');
  return (
    hasRealName ||
    Boolean(cleanNum) ||
    Boolean(cleanEmail) ||
    Boolean(cleanPhone) ||
    Boolean(cleanAddress) ||
    Boolean(info.requiresElectronicInvoice)
  );
}

export function isElectronicInvoiceSale(sale?: SaleReceipt | null): boolean {
  if (!sale) return false;
  const email = (sale.customerEmail || sale.billingInfo?.email || '').trim();
  return Boolean(
    sale.requiresElectronicInvoice || sale.billingInfo?.requiresElectronicInvoice || email
  );
}

export function getSaleCustomerEmail(sale?: SaleReceipt | null): string {
  if (!sale) return '';
  return (sale.customerEmail || sale.billingInfo?.email || '').trim();
}

/**
 * Reconstruye el perfil fiscal completo de una venta combinando los campos raíz y `sale.billingInfo`.
 */
export function resolveSaleBillingInfo(sale?: SaleReceipt | null): CustomerBillingInfo {
  if (!sale) {
    return normalizeBillingInfo(null);
  }
  const baseInfo = sale.billingInfo || ({} as Partial<CustomerBillingInfo>);
  return normalizeBillingInfo({
    ...baseInfo,
    customerName: sale.customerName || baseInfo.customerName || 'Consumidor Final',
    documentType:
      sale.customerDocumentType || baseInfo.documentType || 'CONSUMIDOR_FINAL',
    documentNumber: sale.customerDocumentNumber || baseInfo.documentNumber || '',
    email: sale.customerEmail || baseInfo.email || '',
    requiresElectronicInvoice: isElectronicInvoiceSale(sale)
  });
}

export interface SaleAccountantReadiness {
  /** Lista con absolutamente todos los datos DIAN + Tercero (Doc, Nombre, Correo, Teléfono, Dirección, Ciudad) */
  isCompleteForProvider: boolean;
  /** Tiene los 3 datos mínimos obligatorios (NIT/Cédula real, Nombre/Razón Social y Correo válido para envío FE) */
  hasEssentialFields: boolean;
  missingCoreFields: string[];
  missingFiscalFields: string[];
  allMissingFields: string[];
  billing: CustomerBillingInfo;
}

/**
 * Evalúa si una venta tiene todos los datos del cliente listos para que la contadora la suba
 * sin errores a Siigo, Alegra, World Office o cualquier proveedor DIAN y le llegue al correo del cliente.
 */
export function evaluateSaleAccountantReadiness(sale: SaleReceipt): SaleAccountantReadiness {
  const billing = resolveSaleBillingInfo(sale);
  const normDoc = normalizeDocumentSearchKey(billing.documentNumber);

  const hasValidDoc =
    Boolean(normDoc.baseWithoutDv) &&
    normDoc.baseWithoutDv !== '222222222222' &&
    billing.documentType !== 'CONSUMIDOR_FINAL';

  const hasValidName =
    Boolean(billing.customerName.trim()) &&
    billing.customerName.trim().toLowerCase() !== 'consumidor final';

  const hasValidEmail = isValidEmailFormat(billing.email);
  const hasAddress = Boolean(billing.address?.trim());
  const hasCity = Boolean(billing.city?.trim());
  const hasPhone = Boolean(billing.phone?.trim());

  const missingCoreFields: string[] = [];
  if (!hasValidDoc) missingCoreFields.push('NIT / Cédula');
  if (!hasValidName) missingCoreFields.push('Nombre / Razón Social');
  if (!hasValidEmail) missingCoreFields.push('Correo FE');

  const missingFiscalFields: string[] = [];
  if (!hasAddress) missingFiscalFields.push('Dirección');
  if (!hasCity) missingFiscalFields.push('Ciudad');
  if (!hasPhone) missingFiscalFields.push('Teléfono');

  const allMissingFields = [...missingCoreFields, ...missingFiscalFields];

  return {
    isCompleteForProvider: allMissingFields.length === 0,
    hasEssentialFields: missingCoreFields.length === 0,
    missingCoreFields,
    missingFiscalFields,
    allMissingFields,
    billing
  };
}

/**
 * Genera una ficha estructurada y lista para copiar/enviar a la Contadora (WhatsApp, Correo o Portapapeles)
 * con 100% de los datos fiscales del cliente y 100% del detalle de la compra e impuestos.
 */
export function formatAccountantFichaText(
  sale: SaleReceipt,
  productsCatalog?: Product[]
): string {
  const readiness = evaluateSaleAccountantReadiness(sale);
  const b = readiness.billing;
  const normDoc = normalizeDocumentSearchKey(b.documentNumber);
  const dv =
    b.dv || (b.documentType === 'NIT' ? calculateColombiaNitDV(normDoc.baseWithoutDv) : '');
  const dianDocCode = getDianDocumentTypeCode(b.documentType);

  const personLabel =
    b.personType === 'juridica' || b.documentType === 'NIT'
      ? 'Persona Jurídica (Empresa)'
      : 'Persona Natural';

  const regimeLabel =
    TAX_REGIME_OPTIONS.find((r) => r.value === b.taxRegime)?.label ||
    'No responsable de IVA';

  const paymentLabel =
    sale.paymentMethod === 'bizum'
      ? 'Transferencia / QR (Nequi - Daviplata)'
      : sale.paymentMethod === 'tarjeta'
      ? 'Tarjeta Débito / Crédito (Datáfono)'
      : 'Efectivo';

  const dateFormatted = new Date(sale.timestamp).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const taxSummary = calculateOrderTaxBreakdown(
    (sale.items || []) as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
    {
      discountPercent: Number(sale.discountPercent) || 0,
      fallbackTaxRate: Number(sale.taxPercent) || 8,
      productsCatalog
    }
  );

  const itemLines = (sale.items || []).map((it) => {
    const qty = Number(it.quantity) || 1;
    const pvp = Number(it.unitPrice) || 0;
    const prod = productsCatalog?.find((p) => p.id === it.productId);
    const sku = prod?.sku ? `[${prod.sku}] ` : '';
    const resolvedTax = resolveOrderItemTax(
      it as unknown as Partial<OrderItem> & Record<string, unknown>,
      productsCatalog,
      Number(sale.taxPercent) || 8
    );
    const discFactor = 1 - (Number(sale.discountPercent) || 0) / 100;
    const netUnitPvp = pvp * discFactor;
    const unitBase =
      resolvedTax.taxRate > 0 ? netUnitPvp / (1 + resolvedTax.taxRate / 100) : netUnitPvp;
    return `• ${qty}x ${sku}${it.name} | Base unit: $${Math.round(unitBase).toLocaleString('es-CO')} | ${resolvedTax.shortLabel} | Subtotal PVP: $${Math.round(netUnitPvp * qty).toLocaleString('es-CO')}`;
  });

  const lines: string[] = [
    `FICHA FACTURACIÓN ELECTRÓNICA · TICKET #${sale.id.slice(-6)}`,
    `Fecha compra: ${dateFormatted} | Mesa: ${sale.tableName} | Cajero: ${sale.cashierName}`,
    ``,
    `1. DATOS FISCALES DEL CLIENTE (TERCERO DIAN)`,
    `- Tipo de persona: ${personLabel}`,
    `- Tipo documento: ${b.documentType} (Cód. DIAN ${dianDocCode})`,
    `- Identificación (sin DV): ${normDoc.baseWithoutDv || '222222222222'}${dv ? ` | DV: ${dv}` : ''}`,
    `- Nombre / Razón Social: ${b.customerName}`,
    `- Correo envío Factura Electrónica: ${b.email || 'PENDIENTE'}`,
    `- Teléfono / Celular: ${b.phone || 'No registrado'}`,
    `- Dirección fiscal: ${b.address || 'No registrada'}`,
    `- Ciudad / Municipio: ${b.city || 'No registrada'}${b.department ? ` (${b.department})` : ''}${b.cityCode ? ` · Cód. DANE: ${b.cityCode}` : ''}`,
    `- Régimen / Responsabilidad: ${regimeLabel} · ${b.fiscalResponsibility || 'R-99-PN'}`,
    ``,
    `2. DETALLE DE LA COMPRA Y DESGLOSE DE IMPUESTOS`,
    ...(itemLines.length > 0 ? itemLines : [`• Consumo general restaurante: $${Math.round(sale.subtotal).toLocaleString('es-CO')}`]),
    ``,
    `- Subtotal productos PVP: $${Math.round(sale.subtotal).toLocaleString('es-CO')} COP`,
    ...(sale.discountAmount > 0
      ? [`- Descuento (${sale.discountPercent}%): -$${Math.round(sale.discountAmount).toLocaleString('es-CO')} COP`]
      : []),
    `- Base gravable sin impuestos: $${Math.round(taxSummary.taxableBase).toLocaleString('es-CO')} COP`,
    ...(taxSummary.impoconsumoAmount > 0
      ? [`- Impoconsumo (INC 8%): $${Math.round(taxSummary.impoconsumoAmount).toLocaleString('es-CO')} COP`]
      : []),
    ...(taxSummary.ivaAmount > 0
      ? [`- IVA (19%): $${Math.round(taxSummary.ivaAmount).toLocaleString('es-CO')} COP`]
      : []),
    ...(sale.tipAmount > 0
      ? [`- Propina voluntaria (no gravada): $${Math.round(sale.tipAmount).toLocaleString('es-CO')} COP`]
      : []),
    `- TOTAL COBRADO: $${Math.round(sale.total).toLocaleString('es-CO')} COP`,
    `- Medio de pago: ${paymentLabel}`
  ];

  return lines.join('\n');
}

/**
 * Extrae los datos de facturación/cobro del cliente desde la mesa activa
 * (ya sea enviados al pedir la cuenta por QR, al enviar el pedido o guardados en comanda).
 */
export function extractTableBillingInfo(table?: Table | null): {
  billing: CustomerBillingInfo;
  fromQrCustomer: boolean;
} {
  const callBilling = table?.waiterCall?.billingInfo;
  const orderBilling = table?.order?.billingInfo;
  const legacyOrderName =
    table?.order?.customerName ||
    table?.order?.nombreCliente ||
    (table?.order as Record<string, unknown> | undefined)?.cliente?.toString() ||
    table?.order?.items?.find((it) => it.customerName?.trim())?.customerName ||
    '';

  if (callBilling && hasCustomBillingData(callBilling)) {
    const normalized = normalizeBillingInfo(callBilling);
    return {
      billing: {
        ...normalized,
        customerName:
          callBilling.customerName?.trim() &&
          callBilling.customerName.trim() !== 'Consumidor Final'
            ? callBilling.customerName.trim()
            : ''
      },
      fromQrCustomer: true
    };
  }

  if (orderBilling && hasCustomBillingData(orderBilling)) {
    const normalized = normalizeBillingInfo(orderBilling);
    return {
      billing: {
        ...normalized,
        customerName:
          orderBilling.customerName?.trim() &&
          orderBilling.customerName.trim() !== 'Consumidor Final'
            ? orderBilling.customerName.trim()
            : ''
      },
      fromQrCustomer: true
    };
  }

  if (legacyOrderName.trim()) {
    return {
      billing: {
        customerName: legacyOrderName.trim(),
        documentType: 'CONSUMIDOR_FINAL',
        documentNumber: ''
      },
      fromQrCustomer: true
    };
  }

  return {
    billing: {
      customerName: '',
      documentType: 'CONSUMIDOR_FINAL',
      documentNumber: ''
    },
    fromQrCustomer: false
  };
}

export interface NormalizedDocumentSearchKey {
  /** Documento limpio sin puntos, comas, espacios ni guiones (preservando ceros a la izquierda) */
  compact: string;
  /** Base del NIT/documento antes del guion de dígito de verificación (preservando ceros a la izquierda) */
  baseWithoutDv: string;
}

/**
 * Normaliza un NIT o Cédula como texto explícito para búsquedas exactas o parciales,
 * eliminando puntos, espacios y separadores sin convertir a Number() para nunca perder ceros iniciales.
 */
export function normalizeDocumentSearchKey(raw?: string | null): NormalizedDocumentSearchKey {
  const trimmed = String(raw ?? '').trim().toUpperCase();
  if (!trimmed) {
    return { compact: '', baseWithoutDv: '' };
  }
  const noDotsOrSpaces = trimmed.replace(/[\s.,]/g, '');
  const parts = noDotsOrSpaces.split('-').filter(Boolean);
  const baseWithoutDv = (parts[0] || '').replace(/[^0-9A-Z]/g, '');
  const compact = noDotsOrSpaces.replace(/[^0-9A-Z]/g, '');
  return {
    compact,
    baseWithoutDv: baseWithoutDv || compact
  };
}

/**
 * Compara de forma flexible un número de NIT/Cédula almacenado frente a un texto buscado
 * (por ejemplo "900.123.456-7" coincide con "900123456", "9001234567" o "900.123.456").
 */
export function matchesDocumentNumberQuery(
  storedDoc?: string | null,
  query?: string | null
): boolean {
  const q = normalizeDocumentSearchKey(query);
  if (!q.compact) return false;
  const s = normalizeDocumentSearchKey(storedDoc);
  if (!s.compact) return false;

  return (
    s.compact.includes(q.compact) ||
    s.baseWithoutDv.includes(q.compact) ||
    (q.baseWithoutDv.length >= 4 && s.baseWithoutDv.includes(q.baseWithoutDv)) ||
    (q.compact.length >= 5 && q.compact.includes(s.baseWithoutDv) && s.baseWithoutDv.length >= 5)
  );
}

export interface KnownCustomerProfile {
  /** Clave única basada en identificación sin DV (preservando ceros iniciales) */
  key: string;
  customerName: string;
  documentType: CustomerDocumentType;
  documentNumber: string;
  dv?: string;
  personType?: CustomerPersonType;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  department?: string;
  cityCode?: string;
  taxRegime?: CustomerTaxRegime;
  fiscalResponsibility?: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
}

/**
 * Construye un directorio deduplicado de clientes registrados con NIT o Cédula a partir del historial de ventas,
 * consolidando todos sus datos fiscales (correo, teléfono, dirección, ciudad DANE, régimen) para autocompletar en 1 clic.
 */
export function extractKnownCustomersFromSales(sales: SaleReceipt[]): KnownCustomerProfile[] {
  const sortedSales = [...sales].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const map = new Map<string, KnownCustomerProfile>();

  for (const sale of sortedSales) {
    const resolved = resolveSaleBillingInfo(sale);
    const norm = normalizeDocumentSearchKey(resolved.documentNumber);

    if (
      !norm.baseWithoutDv ||
      norm.baseWithoutDv === '222222222222' ||
      resolved.documentType === 'CONSUMIDOR_FINAL'
    ) {
      continue;
    }

    const cleanName =
      resolved.customerName && resolved.customerName.toLowerCase() !== 'consumidor final'
        ? resolved.customerName
        : '';
    const cleanEmail = (resolved.email || '').toLowerCase();

    const existing = map.get(norm.baseWithoutDv);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalSpent += Number(sale.total) || 0;
      if ((!existing.customerName || existing.customerName === 'Cliente Registrado') && cleanName) {
        existing.customerName = cleanName;
      }
      if (!existing.email && cleanEmail) existing.email = cleanEmail;
      if (!existing.phone && resolved.phone) existing.phone = resolved.phone;
      if (!existing.address && resolved.address) existing.address = resolved.address;
      if (!existing.city && resolved.city) existing.city = resolved.city;
      if (!existing.department && resolved.department) existing.department = resolved.department;
      if (!existing.cityCode && resolved.cityCode) existing.cityCode = resolved.cityCode;
      if (!existing.dv && resolved.dv) existing.dv = resolved.dv;
      if (!existing.personType && resolved.personType) existing.personType = resolved.personType;
      if (!existing.taxRegime && resolved.taxRegime) existing.taxRegime = resolved.taxRegime;
      if (!existing.fiscalResponsibility && resolved.fiscalResponsibility) {
        existing.fiscalResponsibility = resolved.fiscalResponsibility;
      }
      if (!existing.documentNumber.includes('-') && resolved.documentNumber.includes('-')) {
        existing.documentNumber = resolved.documentNumber;
      }
    } else {
      map.set(norm.baseWithoutDv, {
        key: norm.baseWithoutDv,
        customerName: cleanName || 'Cliente Registrado',
        documentType: resolved.documentType,
        documentNumber: resolved.documentNumber,
        ...(resolved.dv ? { dv: resolved.dv } : {}),
        ...(resolved.personType ? { personType: resolved.personType } : {}),
        email: cleanEmail,
        ...(resolved.phone ? { phone: resolved.phone } : {}),
        ...(resolved.address ? { address: resolved.address } : {}),
        ...(resolved.city ? { city: resolved.city } : {}),
        ...(resolved.department ? { department: resolved.department } : {}),
        ...(resolved.cityCode ? { cityCode: resolved.cityCode } : {}),
        ...(resolved.taxRegime ? { taxRegime: resolved.taxRegime } : {}),
        ...(resolved.fiscalResponsibility
          ? { fiscalResponsibility: resolved.fiscalResponsibility }
          : {}),
        ordersCount: 1,
        totalSpent: Number(sale.total) || 0,
        lastOrderAt: sale.timestamp || ''
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Busca clientes conocidos priorizando coincidencia por NIT / Cédula y luego por Nombre / Razón Social o Correo.
 */
export function searchKnownCustomers(
  profiles: KnownCustomerProfile[],
  rawQuery: string,
  limit = 6
): KnownCustomerProfile[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return profiles.slice(0, limit);

  const lower = trimmed.toLowerCase();
  const docKey = normalizeDocumentSearchKey(trimmed);

  const scored: Array<{ profile: KnownCustomerProfile; score: number }> = [];

  for (const profile of profiles) {
    const pKey = normalizeDocumentSearchKey(profile.documentNumber);
    let score = 0;

    if (
      docKey.compact &&
      (pKey.baseWithoutDv === docKey.baseWithoutDv || pKey.compact === docKey.compact)
    ) {
      score = 100;
    } else if (
      docKey.compact &&
      (pKey.baseWithoutDv.startsWith(docKey.compact) || pKey.compact.startsWith(docKey.compact))
    ) {
      score = 85;
    } else if (matchesDocumentNumberQuery(profile.documentNumber, trimmed)) {
      score = 70;
    } else if (profile.customerName.toLowerCase().includes(lower)) {
      score = 50;
    } else if (profile.email && profile.email.toLowerCase().includes(lower)) {
      score = 40;
    } else if (profile.phone && profile.phone.includes(trimmed)) {
      score = 35;
    }

    if (score > 0) {
      scored.push({ profile, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.profile.ordersCount - a.profile.ordersCount);
  return scored.slice(0, limit).map((item) => item.profile);
}
