import { CustomerBillingInfo, CustomerDocumentType, SaleReceipt, Table } from '../types';

export interface DocumentTypeOption {
  value: CustomerDocumentType;
  label: string;
  shortLabel: string;
  placeholder: string;
}

export const DOCUMENT_TYPE_OPTIONS: DocumentTypeOption[] = [
  {
    value: 'CONSUMIDOR_FINAL',
    label: 'Consumidor Final (Sin documento)',
    shortLabel: 'Consumidor Final',
    placeholder: 'Opcional'
  },
  {
    value: 'CC',
    label: 'Cédula de Ciudadanía (C.C.)',
    shortLabel: 'C.C.',
    placeholder: 'Ej. 1020304050'
  },
  {
    value: 'NIT',
    label: 'NIT / RUT Empresarial',
    shortLabel: 'NIT',
    placeholder: 'Ej. 900123456-7'
  },
  {
    value: 'CE',
    label: 'Cédula de Extranjería (C.E.)',
    shortLabel: 'C.E.',
    placeholder: 'Ej. 400500600'
  },
  {
    value: 'PAS',
    label: 'Pasaporte',
    shortLabel: 'Pasaporte',
    placeholder: 'Ej. AB1234567'
  },
  {
    value: 'TI',
    label: 'Tarjeta de Identidad (T.I.)',
    shortLabel: 'T.I.',
    placeholder: 'Ej. 1002003004'
  },
  {
    value: 'PEP',
    label: 'PPT / Permiso Especial',
    shortLabel: 'PPT',
    placeholder: 'Ej. 7654321'
  }
];

export function getDocumentShortLabel(type?: CustomerDocumentType | string): string {
  if (!type || type === 'CONSUMIDOR_FINAL') return '';
  const found = DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === type);
  return found ? found.shortLabel : String(type);
}

export function formatCustomerDocument(
  type?: CustomerDocumentType | string,
  documentNumber?: string
): string {
  const cleanNum = (documentNumber || '').trim();
  if (!cleanNum) return '';
  const shortLabel = getDocumentShortLabel(type) || 'Doc.';
  return `${shortLabel} ${cleanNum}`;
}

export function isValidEmailFormat(email?: string): boolean {
  const clean = (email || '').trim();
  if (!clean) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function normalizeBillingInfo(input?: Partial<CustomerBillingInfo> | null): CustomerBillingInfo {
  const cleanName = (input?.customerName || '').trim();
  const cleanNumber = (input?.documentNumber || '').trim();
  const cleanEmail = (input?.email || '').trim().toLowerCase();
  const cleanPhone = (input?.phone || '').trim();
  const wantsElectronic = Boolean(input?.requiresElectronicInvoice || cleanEmail);

  let resolvedType: CustomerDocumentType = (input?.documentType as CustomerDocumentType) || 'CONSUMIDOR_FINAL';

  if (cleanNumber && resolvedType === 'CONSUMIDOR_FINAL') {
    resolvedType = 'CC';
  }
  if (!cleanNumber && resolvedType !== 'CONSUMIDOR_FINAL' && !cleanName && !wantsElectronic) {
    resolvedType = 'CONSUMIDOR_FINAL';
  }

  return {
    customerName: cleanName || 'Consumidor Final',
    documentType: resolvedType,
    documentNumber: cleanNumber,
    ...(cleanEmail ? { email: cleanEmail } : {}),
    ...(cleanPhone ? { phone: cleanPhone } : {}),
    ...(wantsElectronic ? { requiresElectronicInvoice: true } : {})
  };
}

export function hasCustomBillingData(info?: Partial<CustomerBillingInfo> | null): boolean {
  if (!info) return false;
  const cleanName = (info.customerName || '').trim();
  const cleanNum = (info.documentNumber || '').trim();
  const cleanEmail = (info.email || '').trim();
  const hasRealName = Boolean(cleanName && cleanName.toLowerCase() !== 'consumidor final');
  return hasRealName || Boolean(cleanNum) || Boolean(cleanEmail) || Boolean(info.requiresElectronicInvoice);
}

export function isElectronicInvoiceSale(sale?: SaleReceipt | null): boolean {
  if (!sale) return false;
  const email = (sale.customerEmail || sale.billingInfo?.email || '').trim();
  return Boolean(
    sale.requiresElectronicInvoice ||
      sale.billingInfo?.requiresElectronicInvoice ||
      email
  );
}

export function getSaleCustomerEmail(sale?: SaleReceipt | null): string {
  if (!sale) return '';
  return (sale.customerEmail || sale.billingInfo?.email || '').trim();
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
    const cleanEmail = (callBilling.email || '').trim().toLowerCase();
    const wantsElectronic = Boolean(callBilling.requiresElectronicInvoice || cleanEmail);
    return {
      billing: {
        customerName: callBilling.customerName?.trim() || '',
        documentType: callBilling.documentType || (callBilling.documentNumber ? 'CC' : 'CONSUMIDOR_FINAL'),
        documentNumber: callBilling.documentNumber?.trim() || '',
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(callBilling.phone?.trim() ? { phone: callBilling.phone.trim() } : {}),
        ...(wantsElectronic ? { requiresElectronicInvoice: true } : {})
      },
      fromQrCustomer: true
    };
  }

  if (orderBilling && hasCustomBillingData(orderBilling)) {
    const cleanEmail = (orderBilling.email || '').trim().toLowerCase();
    const wantsElectronic = Boolean(orderBilling.requiresElectronicInvoice || cleanEmail);
    return {
      billing: {
        customerName: orderBilling.customerName?.trim() || '',
        documentType: orderBilling.documentType || (orderBilling.documentNumber ? 'CC' : 'CONSUMIDOR_FINAL'),
        documentNumber: orderBilling.documentNumber?.trim() || '',
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(orderBilling.phone?.trim() ? { phone: orderBilling.phone.trim() } : {}),
        ...(wantsElectronic ? { requiresElectronicInvoice: true } : {})
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
  email: string;
  phone?: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
}

/**
 * Construye un directorio deduplicado de clientes registrados con NIT o Cédula a partir del historial de ventas.
 */
export function extractKnownCustomersFromSales(sales: SaleReceipt[]): KnownCustomerProfile[] {
  const sortedSales = [...sales].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const map = new Map<string, KnownCustomerProfile>();

  for (const sale of sortedSales) {
    const rawDocNum = (sale.customerDocumentNumber || sale.billingInfo?.documentNumber || '').trim();
    const rawDocType =
      (sale.customerDocumentType || sale.billingInfo?.documentType || 'CONSUMIDOR_FINAL') as CustomerDocumentType;
    const norm = normalizeDocumentSearchKey(rawDocNum);

    if (
      !norm.baseWithoutDv ||
      norm.baseWithoutDv === '222222222222' ||
      rawDocType === 'CONSUMIDOR_FINAL'
    ) {
      continue;
    }

    const rawName = (sale.customerName || sale.billingInfo?.customerName || '').trim();
    const cleanName =
      rawName && rawName.toLowerCase() !== 'consumidor final' ? rawName : '';
    const cleanEmail = getSaleCustomerEmail(sale).toLowerCase();
    const cleanPhone = (sale.billingInfo?.phone || '').trim();

    const existing = map.get(norm.baseWithoutDv);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalSpent += Number(sale.total) || 0;
      if (!existing.customerName && cleanName) {
        existing.customerName = cleanName;
      }
      if (!existing.email && cleanEmail) {
        existing.email = cleanEmail;
      }
      if (!existing.phone && cleanPhone) {
        existing.phone = cleanPhone;
      }
      if (!existing.documentNumber.includes('-') && rawDocNum.includes('-')) {
        existing.documentNumber = rawDocNum;
      }
    } else {
      map.set(norm.baseWithoutDv, {
        key: norm.baseWithoutDv,
        customerName: cleanName || 'Cliente Registrado',
        documentType: rawDocType,
        documentNumber: rawDocNum,
        email: cleanEmail,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
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

    if (docKey.compact && (pKey.baseWithoutDv === docKey.baseWithoutDv || pKey.compact === docKey.compact)) {
      score = 100;
    } else if (docKey.compact && (pKey.baseWithoutDv.startsWith(docKey.compact) || pKey.compact.startsWith(docKey.compact))) {
      score = 85;
    } else if (matchesDocumentNumberQuery(profile.documentNumber, trimmed)) {
      score = 70;
    } else if (profile.customerName.toLowerCase().includes(lower)) {
      score = 50;
    } else if (profile.email && profile.email.toLowerCase().includes(lower)) {
      score = 40;
    }

    if (score > 0) {
      scored.push({ profile, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.profile.ordersCount - a.profile.ordersCount);
  return scored.slice(0, limit).map((item) => item.profile);
}

