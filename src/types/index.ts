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
  businessName: string;
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
}

export interface Order {
  id: string;
  tableId: string;
  tableName: string;
  items: OrderItem[];
  discountPercent: number;
  taxPercent: number;
  tipAmount: number;
  openedAt: string;
  lastUpdatedAt: string;
}

export interface WaiterCallNotification {
  type: 'waiter' | 'bill';
  requestedAt: string;
  message?: string;
}

export interface Table {
  id: string;
  number: string;
  name: string;
  zone: string;
  seats: number;
  status: TableStatus;
  order?: Order;
  waiterCall?: WaiterCallNotification | null;
  updatedAt?: string;
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
}

export type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';

export interface SaleReceipt {
  id: string;
  orderId: string;
  tableName: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  taxPercent: number;
  discountAmount: number;
  discountPercent: number;
  tipAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashTendered?: number;
  change?: number;
  timestamp: string;
  cashierName: string;
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
  supplier?: string;
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
  sales: SaleReceipt[];
  version: number;
  lastModified: string;
}
