/**
 * Tipos y contratos para el módulo de Facturación y Exportaciones de Chinmi App.
 * Diseñado bajo el principio de inmutabilidad de ventas y separación estricta de metadatos.
 */

import { CustomerBillingInfo, ProductTaxType, SaleReceipt } from '../../../types';

/**
 * Estados del ciclo de solicitud de Factura Electrónica por parte del comensal / cliente.
 */
export type InvoiceRequestStatus = 'no_solicitada' | 'solicitada';

/**
 * Estados del ciclo de exportación contable hacia archivos (.xlsx, .csv).
 */
export type InvoiceExportStatus = 'no_exportado' | 'exportado';

/**
 * Estados del ciclo de facturación externa (cuando el contador o restaurante emite el documento en su software contable).
 * Chinmi no emite directamente ante la DIAN, por lo que este estado refleja el registro manual o estado administrativo.
 */
export type ExternalFilingStatus = 'pendiente' | 'emitida' | 'requiere_revision';

/**
 * Identificadores de formato / software contable admitidos por el sistema.
 */
export type AccountingExportProvider =
  | 'chinmi_excel'
  | 'chinmi_csv'
  | 'siigo'
  | 'alegra'
  | 'loggro';

/**
 * Metadatos de facturación externa y exportación desacoplados de la venta original.
 * Se guardan en una colección separada vinculada al saleId: users/{uid}/ventas_metadatos/{saleId}
 * Garantiza que la venta histórica permanezca 100% inmutable.
 */
export interface SaleBillingMetadata {
  saleId: string;
  userId: string;
  requestStatus: InvoiceRequestStatus;
  exportStatus: InvoiceExportStatus;
  lastExportedAt?: string | null;
  lastExportProvider?: AccountingExportProvider | null;
  filingStatus: ExternalFilingStatus;
  externalInvoiceNumber?: string;
  externalProviderUsed?: string;
  filingDate?: string | null;
  filedBy?: string;
  filingNotes?: string;
  customerFiscalOverride?: CustomerBillingInfo | null;
  updatedAt: string;
}

/**
 * Parámetros de configuración fiscal propia del establecimiento (restaurante).
 * Aislada estrictamente por cada restaurante en users/{uid}/config_fiscal/general
 */
export interface RestaurantFiscalProfile {
  businessName: string;
  tradeName?: string;
  nit: string;
  dv: string;
  address: string;
  city: string;
  department: string;
  daneCode?: string;
  email: string;
  phone: string;
  taxRegime: 'no_responsable_iva' | 'responsable_iva' | 'gran_contribuyente' | 'regimen_simple';
  fiscalResponsibilities: string[]; // Ej: ['R-99-PN', 'O-13', 'O-15', 'O-23', 'O-47']
  defaultTaxType: ProductTaxType;   // 'impoconsumo' | 'iva' | 'exento'
  defaultTaxRate: number;           // Ej: 8 para impoconsumo, 19 para IVA, 0 para exento
  economicActivityCode?: string;    // Código CIIU principal (ej: 5611 para restaurantes)
  notes?: string;
  // Equivalencias y códigos para software contables (Fase 3)
  siigoVoucherType?: string;        // Tipo de comprobante en Siigo (ej: 'FV-1')
  siigoPaymentMethodCash?: string;  // Nombre/Código de pago efectivo en Siigo
  siigoPaymentMethodCard?: string;  // Nombre/Código de pago tarjeta en Siigo
  siigoPaymentMethodTransfer?: string; // Nombre/Código de pago transferencia en Siigo
  loggroVoucherType?: string;       // Tipo de comprobante en Loggro (ej: 'FV')
  loggroPaymentMethodCash?: string; // Nombre/Código de pago efectivo en Loggro
  loggroPaymentMethodCard?: string; // Nombre/Código de pago tarjeta en Loggro
  loggroPaymentMethodTransfer?: string; // Nombre/Código de pago transferencia en Loggro
}

/**
 * Línea de producto normalizada para la exportación contable.
 * Extraída de los datos inmutables de la comanda de la venta con prorrateo exacto de descuentos.
 */
export interface NormalizedExportLine {
  saleId: string;
  ticketNumber: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  grossTotal?: number;      // Cantidad * Precio Unitario PVP antes de descuento
  discount: number;         // Descuento individual o prorrateado imputado a la línea
  netTotal?: number;         // Total neto de la línea (grossTotal - discount)
  taxableBase: number;       // Base gravable neta (netTotal / (1 + taxRate/100) si gravado, o netTotal si exento)
  taxType: ProductTaxType;   // 'impoconsumo' | 'iva' | 'exento'
  taxRate: number;           // Tarifa aplicada (ej: 8, 19, 5, 0)
  taxAmount: number;         // Impuesto liquidado de la línea (netTotal - taxableBase)
  total: number;             // Alias de netTotal para retrocompatibilidad
}

/**
 * Diferenciación conceptual tributaria colombiana (Estatuto Tributario):
 * - EXENTO (Art. 477 E.T.): Bien o servicio gravado a tarifa 0% con derecho a compensación/devolución bimestral de IVA en insumos (productores).
 * - EXCLUIDO (Art. 424 y 512-13 E.T.): No causa el impuesto sobre las ventas ni da derecho a devolución/descuento de IVA pagado.
 * - NO GRAVADO: Hecho económico fuera del hecho generador del tributo (ej. propina voluntaria en restaurantes).
 */
export type FiscalClassification = 'gravado_iva' | 'gravado_inc' | 'exento' | 'excluido' | 'no_gravado';

/**
 * Venta normalizada lista para ser procesada por los adaptadores de exportación.
 * Garantiza conciliación al centavo entre cabecera y suma de líneas.
 */
export interface NormalizedExportSale {
  saleId: string;
  ticketNumber: string;
  timestamp: string;
  dateKey: string; // YYYY-MM-DD
  tableName: string;
  cashierName: string;
  paymentMethod: string;
  customerName: string;
  documentType: string;
  documentNumber: string;
  dv?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  department?: string;
  subtotal: number;           // Suma de líneas brutas (PVP)
  discountAmount: number;     // Descuento comercial total aplicado
  discountPercent: number;    // Porcentaje de descuento (si aplica)
  netProductsTotal?: number;  // Subtotal - Descuento (total productos neto)
  taxableBase: number;        // Base gravable gravada total (INC e IVA)
  exemptBase?: number;        // Base total de productos exentos o tarifa 0%
  taxAmount: number;          // Total impuestos liquidados (IVA + INC)
  ivaAmount: number;          // Total consolidado de IVA
  iva19Amount?: number;       // IVA al 19%
  iva19Base?: number;         // Base gravable de productos al 19%
  iva5Amount?: number;        // IVA al 5%
  iva5Base?: number;          // Base gravable de productos al 5%
  ivaOtherAmount?: number;    // IVA a otras tarifas
  ivaOtherBase?: number;      // Base gravable de IVA a otras tarifas
  impoconsumoAmount: number;  // Total consolidado de Impoconsumo
  inc8Amount?: number;        // INC al 8%
  inc8Base?: number;          // Base gravable de productos al 8%
  incOtherAmount?: number;    // INC a otras tarifas
  incOtherBase?: number;      // Base gravable de INC a otras tarifas
  tipAmount: number;          // Propina voluntaria no gravada
  total: number;              // Total pagado en caja (netProductsTotal + tipAmount)
  requestStatus: InvoiceRequestStatus;
  exportStatus: InvoiceExportStatus;
  filingStatus: ExternalFilingStatus;
  externalInvoiceNumber?: string;
  externalProviderUsed?: string;
  filingDate?: string | null;
  filingNotes?: string;
  isIncompatible?: boolean;
  incompatibilityReason?: string;
  lines: NormalizedExportLine[];
  originalReceipt: SaleReceipt;
}

/**
 * Resultado de validación contable previa a la generación de archivos.
 */
export interface ExportValidationSummary {
  isValid: boolean;
  totalSales: number;
  totalItems: number;
  monetaryTotal: number;
  totalTax: number;
  totalBase: number;
  totalDiscount: number;
  totalTip: number;
  warnings: Array<{
    saleId: string;
    ticketNumber: string;
    message: string;
    field?: string;
  }>;
  missingDataCount: number;
}

/**
 * Opciones pasadas al generador de exportación.
 */
export interface ExportGeneratorOptions {
  restaurant: RestaurantFiscalProfile;
  dateRangeLabel?: string;
  includeCustomerFicha?: boolean;
}

/**
 * Interfaz estándar para adaptadores de exportación contable.
 */
export interface IAccountingExportAdapter {
  readonly providerId: AccountingExportProvider;
  readonly displayName: string;
  readonly fileExtension: 'xlsx' | 'csv';
  readonly mimeType: string;
  generate(
    sales: NormalizedExportSale[],
    options: ExportGeneratorOptions
  ): Promise<{ data: Uint8Array | string; filename: string }>;
}
