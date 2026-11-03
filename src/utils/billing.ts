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
