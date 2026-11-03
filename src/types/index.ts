export type PlanType = 'free' | 'pro';
export type BillingFrequency = 'monthly' | 'quarterly' | 'annual';

export type UserRole = 'gerente' | 'cajero' | 'camarero' | 'barman';

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
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  plan: PlanType;
  billingFrequency?: BillingFrequency;
  planExpiresAt?: string | null;
  businessName: string;
  businessAddress?: string;
  createdAt: string;
}

export type EmpleadoRol = 'Admin' | 'Mesero' | 'Cajero' | 'Barman';

export interface Empleado {
  id: string;
  nombre: string;
  rol: EmpleadoRol;
  pin?: string; // 4 a 6 dígitos numéricos (opcional)
  avatarColor?: string; // 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'orange'
  createdAt?: string;
}

export type TableStatus = 'libre' | 'ocupada' | 'cuenta';

export type ProductTaxType = 'impoconsumo' | 'iva' | 'exento';

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
  items: OrderItem[];
  productos?: OrderItem[];
  discountPercent: number;
  taxPercent: number;
  tipAmount: number;
  openedAt: string;
  lastUpdatedAt: string;
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
}

export interface Table {
  id: string;
  number: string;
  name: string;
  zone: string;
  seats: number;
  status: TableStatus;
  estado?: TableStatus;
  order?: Order | null;
  currentOrder?: Order | null;
  pedidoActual?: Order | null;
  waiterCall?: WaiterCallNotification | null;
  updatedAt?: string;
  userId?: string;
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
}

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';

export type ElectronicInvoiceStatus = 'pendiente' | 'emitida';

export interface SaleReceipt {
  id: string;
  orderId: string;
  tableName: string;
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

export type MeasurementUnit = 'kg' | 'g' | 'litros' | 'ml' | 'unidades' | 'atados' | 'cajas' | 'paquetes';

export type ExpiryStatus = 'expired' | 'expires_today' | 'expiring_soon' | 'fresh';

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
  name: string;
  quantity: number;
  unit: string;
  received?: boolean;
  receivedQuantity?: number;
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
}

export interface PerishableItem {
  id: string;
  name: string;
  category: PerishableCategory;
  quantity: number;
  unit: MeasurementUnit;
  minStock: number;
  entryDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  location: string; // 'Nevera Bar', 'Cuarto Frío Cocina', 'Despensa Seca', etc.
  supplierId?: string;
  supplier?: string;
  supplierPhone?: string;
  batchNumber?: string;
  costPerUnit?: number;
  imageUrl?: string;
  notes?: string;
  alarmDaysBeforeExpiry: number; // e.g. 3 days before
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
