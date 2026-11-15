export type PlanType = 'free' | 'pro';
export type BillingFrequency = 'monthly' | 'quarterly' | 'annual';

export type UserRole = 'gerente' | 'cajero' | 'camarero' | 'barman' | 'contabilidad';

export interface RolePermissionConfig {
  label: string;
  badgeLabel: string;
  description: string;
  canManageBusiness: boolean;
  canManageInventory: boolean;
  canViewSalesReports: boolean;
  canManageTableLayout: boolean;
  canAccessTablesAndOrders: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissionConfig> = {
  gerente: {
    label: 'Gerente',
    badgeLabel: 'Control Total',
    description: 'Acceso total: Control de mesas, pedidos, carta e inventario, reportes de ventas y configuración.',
    canManageBusiness: true,
    canManageInventory: true,
    canViewSalesReports: true,
    canManageTableLayout: true,
    canAccessTablesAndOrders: true,
  },
  cajero: {
    label: 'Caja',
    badgeLabel: 'Solo Mesas y Cobro',
    description: 'Solo vista de mesas y pedidos: tomar comandas y cobrar cuentas de mesas.',
    canManageBusiness: false,
    canManageInventory: false,
    canViewSalesReports: false,
    canManageTableLayout: false,
    canAccessTablesAndOrders: true,
  },
  camarero: {
    label: 'Camarero',
    badgeLabel: 'Solo Mesas y Pedidos',
    description: 'Solo vista de mesas y pedidos: abrir mesas, tomar comandas y pedir la cuenta.',
    canManageBusiness: false,
    canManageInventory: false,
    canViewSalesReports: false,
    canManageTableLayout: false,
    canAccessTablesAndOrders: true,
  },
  barman: {
    label: 'Barman',
    badgeLabel: 'Solo Barra y Pedidos',
    description: 'Solo vista de mesas y pedidos de bebidas en barra de despacho.',
    canManageBusiness: false,
    canManageInventory: false,
    canViewSalesReports: false,
    canManageTableLayout: false,
    canAccessTablesAndOrders: true,
  },
  contabilidad: {
    label: 'Contabilidad',
    badgeLabel: 'Solo Informes y Facturación',
    description: 'Acceso exclusivo a informes de historial de ventas y facturación contable.',
    canManageBusiness: false,
    canManageInventory: false,
    canViewSalesReports: true,
    canManageTableLayout: false,
    canAccessTablesAndOrders: false,
  },
};

export type SubscriptionStatus = 'free' | 'pro_active' | 'pro_grace' | 'free_over_limit';
export type PlanMode = 'test' | 'live' | 'promo' | 'admin';

export interface SubscriptionSelection {
  activeTableIds: string[];
  activeProductIds: string[];
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  plan: PlanType;
  subscriptionStatus?: SubscriptionStatus;
  billingFrequency?: BillingFrequency;
  planExpiresAt?: string | null;
  graceEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string | null;
  subscriptionId?: string | null;
  lastPaymentRef?: string | null;
  planMode?: PlanMode;
  isTestSubscription?: boolean;
  subscriptionSelection?: SubscriptionSelection | null;
  lastQuotaReconciliationAt?: string | null;
  businessName: string;
  businessAddress?: string;
  createdAt: string;
}

export type EmpleadoRol = 'Admin' | 'Mesero' | 'Cajero' | 'Barman' | 'Contabilidad';

export interface Empleado {
  id: string;
  nombre: string;
  rol: EmpleadoRol;
  email?: string; // Correo opcional para vinculación o referencia administrativa
  activo?: boolean; // true por defecto; false bloquea operación sin borrar historial
  pin?: string; // 4 a 6 dígitos numéricos (opcional)
  avatarColor?: string; // 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'orange'
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  authUid?: string;
}

export type TableStatus = 'libre' | 'ocupada' | 'cuenta';

export type ProductTaxType = 'impoconsumo' | 'iva' | 'exento';

export type QrSubaccountsMode = 'disabled' | 'optional' | 'required';

export type SubaccountStatus =
  | 'activa'
  | 'pidiendo_cuenta'
  | 'pagada_parcial'
  | 'pagada'
  | 'cerrada';

export interface TableSubaccount {
  id: string;
  tableId: string;
  tableSessionId: string;
  displayName: string;
  baseName?: string;
  status: SubaccountStatus;
  createdAt: string;
  updatedAt?: string;
  mergedIntoSubaccountId?: string;
  mergedGroupName?: string;
  preferredPaymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia';
  requiresElectronicInvoice?: boolean;
  privateQrBillingId?: string;
  requestedBillAt?: string;
  requestedTipAmount?: number;
}

export interface ItemAllocation {
  subaccountId: string;
  subaccountName: string;
  shareAmount: number;
  shareRatio?: number;
  paid?: boolean;
  paidAt?: string;
  paymentId?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  addedAt: string;
  orderedBy?: 'cliente' | 'camarero' | 'cajero';
  customerName?: string;
  taxType?: ProductTaxType;
  taxRate?: number;
  subaccountId?: string;
  subaccountName?: string;
  isShared?: boolean;
  allocations?: ItemAllocation[];
  inventoryDeducted?: boolean;
  inventoryStatus?: 'deducted' | 'pending_reconciliation' | 'partial' | 'not_applicable';
  pendingReconciliationIds?: string[];
  paidAmount?: number;
  paidQuantity?: number;
}

export type CustomerDocumentType =
  | 'CONSUMIDOR_FINAL'
  | 'CC'
  | 'NIT'
  | 'CE'
  | 'PAS'
  | 'TI'
  | 'PEP';

export type CustomerPersonType = 'natural' | 'juridica';

export type CustomerTaxRegime =
  | 'no_responsable_iva'
  | 'responsable_iva'
  | 'gran_contribuyente'
  | 'autorretenedor'
  | 'regimen_simple';

export interface CustomerBillingInfo {
  customerName: string;
  documentType: CustomerDocumentType;
  documentNumber: string;
  dv?: string;
  personType?: CustomerPersonType;
  firstName?: string;
  lastName?: string;
  commercialName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  department?: string;
  cityCode?: string;
  departmentCode?: string;
  taxRegime?: CustomerTaxRegime;
  fiscalResponsibility?: string;
  requiresElectronicInvoice?: boolean;
}

export interface Order {
  id: string;
  tableId: string;
  tableName: string;
  tableSessionId?: string;
  items: OrderItem[];
  productos?: OrderItem[];
  subaccounts?: TableSubaccount[];
  discountPercent: number;
  taxPercent: number;
  tipAmount: number;
  paymentsTotal?: number;
  pendingBalance?: number;
  openedAt: string;
  lastUpdatedAt: string;
  settledAt?: string;
  status?: string;
  estado?: string;
  closed?: boolean;
  closedAt?: string;
  subtotal?: number;
  total?: number;
  userId?: string;
  customerName?: string;
  nombreCliente?: string;
  billingInfo?: CustomerBillingInfo | null;
}

export interface WaiterCallNotification {
  type: 'waiter' | 'bill';
  requestedAt: string;
  message?: string;
  preferredPaymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia';
  billingInfo?: CustomerBillingInfo | null;
  subaccountId?: string;
  subaccountName?: string;
}

export interface Table {
  id: string;
  number: string;
  name: string;
  zone: string;
  seats: number;
  status: TableStatus;
  estado?: TableStatus;
  tableSessionId?: string | null;
  subaccounts?: TableSubaccount[];
  order?: Order | null;
  currentOrder?: Order | null;
  pedidoActual?: Order | null;
  waiterCall?: WaiterCallNotification | null;
  updatedAt?: string;
  userId?: string;
  active?: boolean;
  inactivatedReason?: 'free_over_limit' | 'manual' | null;
}

export interface RecipeIngredient {
  insumoId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costoUnitario?: number;
  equivalenceMissing?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  imageUrl: string;
  sku: string;
  description?: string;
  taxType?: ProductTaxType;
  taxRate?: number;
  tipoInventario?: 'directo' | 'receta';
  receta?: RecipeIngredient[];
  displayOrder?: number;      // Orden personalizado para mostrar platos en el menú
  active?: boolean;
  inactivatedReason?: 'free_over_limit' | 'manual' | null;
}

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';

export type ElectronicInvoiceStatus = 'pendiente' | 'emitida';

export interface PaymentBreakdownEntry {
  method: PaymentMethod;
  amount: number;
  cashTendered?: number;
  change?: number;
  reference?: string;
}

export interface PrivateQrBillingRecord {
  id: string;
  tableId: string;
  tableSessionId: string;
  subaccountId: string;
  subaccountName: string;
  requiresElectronicInvoice: boolean;
  billingInfo: CustomerBillingInfo;
  requestedTipAmount?: number;
  preferredPaymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia';
  createdAt: string;
  updatedAt: string;
}

export interface TablePaymentRecord {
  id: string;
  orderId: string;
  tableId: string;
  tableName: string;
  tableSessionId: string;
  receiptId: string;
  subaccountIds: string[];
  subaccountNames: string[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  ivaAmount?: number;
  impoconsumoAmount?: number;
  tipAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentBreakdown: PaymentBreakdownEntry[];
  requiresElectronicInvoice?: boolean;
  privateQrBillingId?: string;
  cashierName: string;
  cashierRole?: string;
  cashierId?: string;
  createdAt: string;
}

export interface SaleReceipt {
  id: string;
  orderId: string;
  tableName: string;
  tableSessionId?: string;
  subaccountIds?: string[];
  subaccountNames?: string[];
  isPartialTableCheckout?: boolean;
  closedTableAtPayment?: boolean;
  paymentId?: string;
  paymentBreakdown?: PaymentBreakdownEntry[];
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  taxPercent: number;
  ivaAmount?: number;
  impoconsumoAmount?: number;
  discountAmount: number;
  discountPercent: number;
  tipAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashTendered?: number;
  change?: number;
  timestamp: string;
  cashierName: string;
  cashierRole?: string;
  cashierId?: string;
  customerName?: string;
  customerDocumentType?: CustomerDocumentType;
  customerDocumentNumber?: string;
  customerEmail?: string;
  requiresElectronicInvoice?: boolean;
  electronicInvoiceStatus?: ElectronicInvoiceStatus;
  electronicInvoiceIssuedAt?: string;
  privateQrBillingId?: string;
  billingInfo?: CustomerBillingInfo;
}

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline';

export type PerishableCategory =
  | 'Verduras & Hortalizas'
  | 'Frutas & Cítricos'
  | 'Insumos de Bar & Coctelería'
  | 'Hierbas & Aromáticas'
  | 'Lácteos & Quesos'
  | 'Carnes, Pollo & Pescados'
  | 'Salsas & Preparaciones'
  | 'Otros Insumos'
  | (string & {});

export type MeasurementUnit = 'kg' | 'g' | 'litros' | 'ml' | 'unidades' | 'atados' | 'cajas' | 'paquetes' | 'libra' | (string & {});

export type ExpiryStatus = 'expired' | 'expires_today' | 'expiring_soon' | 'fresh';

export type PackagingType =
  | 'unidad'
  | 'paquete'
  | 'caja'
  | 'bolsa'
  | 'bloque'
  | 'bandeja'
  | 'atado'
  | 'canasta'
  | 'botella'
  | 'galon'
  | 'saco'
  | 'bulto'
  | 'personalizada';

export type CostStatus = 'exact' | 'provisional' | 'pending_valuation';

export interface InsumoPresentation {
  id: string;
  name: string;
  packagingType: PackagingType;
  contentQty: number;
  contentUnit: string;
  supplierId?: string;
  supplierName?: string;
  brand?: string;
  referencePrice?: number;
  isDefault?: boolean;
  active?: boolean;
}

export interface UnitEquivalence {
  id: string;
  unit: string;
  quantityInBaseUnit: number;
  baseUnitLabel?: string;
  note?: string;
}

export interface PerishableLot {
  id: string;
  batchNumber?: string;
  quantity: number;
  entryDate: string;
  expiryDate: string;
  supplierId?: string;
  unitCost?: number;
  receptionEventId?: string;
  createdAt?: string;
}

export interface PendingConsumptionReconciliation {
  id: string;
  saleId: string;
  paymentId?: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  soldQty: number;
  recipeQty: number;
  recipeUnit: string;
  insumoId: string;
  insumoName: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string;
  deductedBaseQty?: number;
  note?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  hasWhatsapp?: boolean;
  suppliesProvided: string; // Qué se consigue con ese proveedor
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type SupplierOrderStatus = 'pendiente' | 'recibido_completo' | 'recibido_incompleto';
export type SupplierOrderChannel = 'whatsapp' | 'llamada' | 'manual';

export interface SupplierOrderItem {
  id: string;
  insumoId?: string;
  name: string;
  quantity: number;
  unit: string;
  presentationId?: string;
  presentationName?: string;
  packagingType?: PackagingType;
  contentQty?: number;
  contentUnit?: string;
  brand?: string;
  unitPrice?: number;
  totalPrice?: number;
  received?: boolean;
  receivedQuantity?: number;
  cumulativeReceivedQty?: number;
  receivedBaseQuantity?: number;
  valuationStatus?: 'valued' | 'pending_valuation';
}

export interface SupplierReceptionEventItem {
  orderItemId: string;
  insumoId?: string;
  insumoName: string;
  presentationId?: string;
  presentationName?: string;
  packagingType?: PackagingType;
  contentQty?: number;
  contentUnit?: string;
  receivedPresentationQty: number;
  convertedBaseQty: number;
  baseUnit: string;
  unitPrice?: number;
  totalPrice?: number;
  valuationStatus: 'valued' | 'pending_valuation';
  previousStockQty?: number;
  previousAvgCost?: number;
  previousCostStatus?: CostStatus;
  newAvgCostAfterEvent?: number;
  lotId?: string;
  expiryDate?: string;
  valuedAt?: string;
  valuedBy?: string;
}

export interface SupplierReceptionEvent {
  id: string;
  orderId: string;
  receivedAt: string;
  receivedBy: string;
  arrivedComplete: boolean;
  notes?: string;
  restockPantry: boolean;
  items: SupplierReceptionEventItem[];
  hasPendingValuation?: boolean;
  totalAmount?: number;
}

export interface SupplierOrder {
  id: string;
  supplierId?: string;
  supplierName: string;
  supplierPhone?: string;
  channel: SupplierOrderChannel;
  businessName?: string;
  businessAddress?: string;
  items: SupplierOrderItem[];
  notes?: string;
  orderedAt: string; // Fecha y hora del pedido (ISO)
  status: SupplierOrderStatus;
  arrived: boolean; // Confirmación de que llegó
  arrivedComplete: boolean; // Confirmación de que llegó completo
  confirmedAt?: string; // Fecha y hora de confirmación de llegada (ISO)
  confirmedBy?: string; // Persona que confirmó la recepción
  receptionNotes?: string; // Notas de recepción o faltantes
  stockUpdated?: boolean; // Si ya se sumó al inventario de despensa
  receptionEvents?: SupplierReceptionEvent[];
  hasPendingValuation?: boolean;
  totalAmount?: number;
}

export interface PerishableItem {
  id: string;
  name: string;
  category: PerishableCategory;
  quantity: number;
  unit: MeasurementUnit;
  baseUnit?: MeasurementUnit;
  minStock: number;
  entryDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  location: string; // 'Nevera Bar', 'Cuarto Frío Cocina', 'Despensa Seca', etc.
  supplierId?: string;
  supplier?: string;
  supplierPhone?: string;
  batchNumber?: string;
  costPerUnit?: number;
  costStatus?: CostStatus;
  pendingValuationCount?: number;
  lastCostUpdatedAt?: string;
  presentations?: InsumoPresentation[];
  equivalences?: UnitEquivalence[];
  secondaryDisplayUnit?: string;
  secondaryPresentationId?: string;
  lots?: PerishableLot[];
  pendingReconciliations?: PendingConsumptionReconciliation[];
  imageUrl?: string;
  notes?: string;
  alarmDaysBeforeExpiry: number; // e.g. 3 days before
  cantidadActual?: number; // Equivalente a quantity para sincronización de despensa
  alertaStockMinimo?: number; // Equivalente a minStock para alertas
}

export interface AppStateData {
  tables: Table[];
  products: Product[];
  perishables?: PerishableItem[];
  suppliers?: Supplier[];
  supplierOrders?: SupplierOrder[];
  sales: SaleReceipt[];
  version: number;
  lastModified: string;
}
