import { CustomerBillingInfo, CustomerDocumentType, Table } from '../types';

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

export function normalizeBillingInfo(input?: Partial<CustomerBillingInfo> | null): CustomerBillingInfo {
  const cleanName = (input?.customerName || '').trim();
  const cleanNumber = (input?.documentNumber || '').trim();
  let resolvedType: CustomerDocumentType = (input?.documentType as CustomerDocumentType) || 'CONSUMIDOR_FINAL';

  if (cleanNumber && resolvedType === 'CONSUMIDOR_FINAL') {
    resolvedType = 'CC';
  }
  if (!cleanNumber && resolvedType !== 'CONSUMIDOR_FINAL' && !cleanName) {
    resolvedType = 'CONSUMIDOR_FINAL';
  }

  return {
    customerName: cleanName || 'Consumidor Final',
    documentType: resolvedType,
    documentNumber: cleanNumber,
    ...(input?.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input?.phone?.trim() ? { phone: input.phone.trim() } : {})
  };
}

export function hasCustomBillingData(info?: Partial<CustomerBillingInfo> | null): boolean {
  if (!info) return false;
  const cleanName = (info.customerName || '').trim();
  const cleanNum = (info.documentNumber || '').trim();
  const hasRealName = Boolean(cleanName && cleanName.toLowerCase() !== 'consumidor final');
  return hasRealName || Boolean(cleanNum);
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
    return {
      billing: {
        customerName: callBilling.customerName?.trim() || '',
        documentType: callBilling.documentType || (callBilling.documentNumber ? 'CC' : 'CONSUMIDOR_FINAL'),
        documentNumber: callBilling.documentNumber?.trim() || '',
        ...(callBilling.email?.trim() ? { email: callBilling.email.trim() } : {}),
        ...(callBilling.phone?.trim() ? { phone: callBilling.phone.trim() } : {})
      },
      fromQrCustomer: true
    };
  }

  if (orderBilling && hasCustomBillingData(orderBilling)) {
    return {
      billing: {
        customerName: orderBilling.customerName?.trim() || '',
        documentType: orderBilling.documentType || (orderBilling.documentNumber ? 'CC' : 'CONSUMIDOR_FINAL'),
        documentNumber: orderBilling.documentNumber?.trim() || '',
        ...(orderBilling.email?.trim() ? { email: orderBilling.email.trim() } : {}),
        ...(orderBilling.phone?.trim() ? { phone: orderBilling.phone.trim() } : {})
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
