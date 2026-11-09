import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Table, Product, SaleReceipt, TableStatus, Order, OrderItem, PaymentMethod, CloudSyncStatus, PerishableItem, Supplier, SupplierOrder, SupplierOrderItem, CustomerBillingInfo, ElectronicInvoiceStatus, AppStateData } from '../types';
import { extractTableBillingInfo, normalizeBillingInfo, hasCustomBillingData } from '../utils/billing';
import { resolveProductTax, resolveOrderItemTax, calculateOrderTaxBreakdown } from '../utils/taxes';
import { defaultAppConfig, AppConfig } from '../config/appConfig';
import { loadStoredData, saveStoredData, subscribeToSyncChannel, fetchCloudState, pushCloudState, mergeAppState } from '../services/storage';
import {
  fetchUserFirestoreData,
  saveUserFirestoreData,
  subscribeUserTables,
  subscribeUserOrders,
  subscribeUserMenu,
  subscribeUserInventory,
  subscribeUserSuppliers,
  subscribeUserSupplierOrders,
  subscribeUserSales,
  getUserSales,
  saveTableToFirestore,
  saveOrderToFirestore,
  syncTableOrderToFirestore,
  deleteTableFromFirestore,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveInventoryItemToFirestore,
  deleteInventoryItemFromFirestore,
  saveSupplierToFirestore,
  deleteSupplierFromFirestore,
  saveSupplierOrderToFirestore,
  deleteSupplierOrderFromFirestore,
  saveSaleToFirestore,
  releaseTableInFirestore,
  executeSaleCheckoutBatch,
  saveUserQrConfig,
  getActiveUserId
} from '../services/firestoreUserStorage';
import { useAuth } from './AuthContext';
import { auth } from '../firebase';
import { playServiceBell, playNewOrderAlert } from '../utils/audioAlert';
import { getUnitConversionFactor } from '../utils/recipeUnits';

export interface NewOrderNotification {
  id: string;
  orderId: string;
  tableId: string;
  tableName: string;
  itemsCount: number;
  total: number;
  customerName?: string;
  itemsSummary: string;
  timestamp: string;
}

interface AppContextType {
  newOrderNotification: NewOrderNotification | null;
  dismissNewOrderNotification: () => void;
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  tables: Table[];
  products: Product[];
  perishables: PerishableItem[];
  suppliers: Supplier[];
  supplierOrders: SupplierOrder[];
  sales: SaleReceipt[];
  cloudStatus: CloudSyncStatus;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  
  // Table operations
  addTable: (table: Omit<Table, 'id' | 'status'>) => { success: boolean; error?: string };
  updateTable: (id: string, partial: Partial<Table>) => void;
  deleteTable: (id: string) => void;
  setTableStatus: (tableId: string, status: TableStatus) => void;
  callWaiter: (
    tableId: string,
    type: 'waiter' | 'bill',
    message?: string,
    extra?: {
      billingInfo?: CustomerBillingInfo;
      preferredPaymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia';
    }
  ) => void;
  dismissWaiterCall: (tableId: string) => void;
  
  // Order & POS operations
  selectedTableId: string | null;
  setSelectedTableId: (id: string | null) => void;
  customerViewTableId: string | null;
  setCustomerViewTableId: (id: string | null) => void;
  addItemToOrder: (tableId: string, product: Product, quantity?: number, notes?: string) => void;
  addItemsToOrder: (
    tableId: string,
    itemsToAdd: Array<{ product: Product; quantity: number; notes?: string; customerName?: string; orderedBy?: 'cliente' | 'camarero' | 'cajero' }>
  ) => void;
  updateOrderItemQuantity: (tableId: string, itemId: string, delta: number) => void;
  removeOrderItem: (tableId: string, itemId: string) => void;
  updateOrderModifiers: (tableId: string, modifiers: { taxPercent?: number; discountPercent?: number; tipAmount?: number }) => void;
  updateOrderBillingInfo: (tableId: string, billingInfo: CustomerBillingInfo) => void;
  checkoutTable: (
    tableId: string,
    paymentMethod: PaymentMethod,
    cashTendered?: number,
    options?: {
      receiptId?: string;
      cashierName?: string;
      cashierRole?: string;
      cashierId?: string;
      billingInfo?: CustomerBillingInfo;
      skipFirestore?: boolean;
    }
  ) => { success: boolean; receipt?: SaleReceipt };
  cobrarMesa: (
    tableId: string,
    paymentMethod: PaymentMethod,
    cashTendered?: number,
    options?: {
      receiptId?: string;
      cashierName?: string;
      cashierRole?: string;
      cashierId?: string;
      billingInfo?: CustomerBillingInfo;
    }
  ) => Promise<{ success: boolean; receipt?: SaleReceipt }>;
  eliminarProducto: (tableId: string, itemId: string) => Promise<void>;
  updateElectronicInvoiceStatus: (saleId: string, status: ElectronicInvoiceStatus) => void;
  bulkUpdateElectronicInvoiceStatus: (saleIds: string[], status: ElectronicInvoiceStatus) => void;
  updateSaleBillingInfo: (
    saleId: string,
    billingInfo: CustomerBillingInfo,
    markStatus?: ElectronicInvoiceStatus
  ) => SaleReceipt | undefined;
  
  // Product & Inventory operations
  addProduct: (product: Omit<Product, 'id'> & { id?: string }) => { success: boolean; error?: string };
  updateProduct: (id: string, partial: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  reorderProducts: (products: Product[]) => void;
  adjustProductStock: (id: string, delta: number) => void;

  // Perishables & Fresh Produce operations (Verduras, Frutas, Insumos Bar & Cocina)
  addPerishable: (item: Omit<PerishableItem, 'id'>) => { success: boolean; error?: string };
  updatePerishable: (id: string, partial: Partial<PerishableItem>) => void;
  deletePerishable: (id: string) => void;
  adjustPerishableQuantity: (id: string, newQuantity: number) => void;
  recordPerishableWaste: (id: string, amount: number, reason: string) => void;
  recordPerishableRestock: (id: string, addedAmount: number, newEntryDate?: string, newExpiryDate?: string) => void;

  // Suppliers (Proveedores de Despensa e Insumos)
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => Supplier;
  updateSupplier: (id: string, partial: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;

  // Supplier Orders (Registro de Pedidos a Distribuidores y Confirmación de Recepción)
  addSupplierOrder: (
    orderData: Omit<SupplierOrder, 'id' | 'status' | 'arrived' | 'arrivedComplete'> & {
      id?: string;
      status?: SupplierOrder['status'];
      arrived?: boolean;
      arrivedComplete?: boolean;
    }
  ) => SupplierOrder;
  updateSupplierOrder: (id: string, partial: Partial<SupplierOrder>) => void;
  confirmSupplierOrderDelivery: (
    orderId: string,
    payload: {
      arrivedComplete: boolean;
      confirmedAt?: string;
      confirmedBy?: string;
      receptionNotes?: string;
      items?: SupplierOrderItem[];
      restockPantry?: boolean;
    }
  ) => void;
  deleteSupplierOrder: (id: string) => void;

  // Receipt inspection
  latestReceipt: SaleReceipt | null;
  setLatestReceipt: (receipt: SaleReceipt | null) => void;

  // Limits
  canAddTable: () => boolean;
  canAddProduct: () => boolean;

  // Manual Cloud Sync Trigger
  loadFullSalesHistory: () => Promise<void>;
  syncNow: () => void;
  resetToDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, empleadoActivo, updateUserBusinessInfo } = useAuth();
  const activeOperatorName =
    empleadoActivo?.nombre?.trim() ||
    user?.name?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'Usuario';
  const activeOperatorRole = empleadoActivo?.rol || user?.role || '';
  const activeOperatorId = empleadoActivo?.id || user?.id || '';
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const savedConfig = localStorage.getItem('appgenerica_custom_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        return {
          ...defaultAppConfig,
          ...parsed,
          qrSettings: { ...defaultAppConfig.qrSettings, ...(parsed.qrSettings || {}) }
        };
      }
    } catch (e) {
      console.error(e);
    }
    return defaultAppConfig;
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('appgenerica_theme');
        if (saved === 'dark' || saved === 'light') return saved;
        if (typeof window.matchMedia === 'function') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
      } catch {
        // Ignorar bloqueos de localStorage en navegadores estrictos o iframes
      }
    }
    return 'light';
  });

  const [tables, setTables] = useState<Table[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [perishables, setPerishables] = useState<PerishableItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [sales, setSales] = useState<SaleReceipt[]>([]);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('synced');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [customerViewTableId, setCustomerViewTableId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mesa') || params.get('qr') || null;
    }
    return null;
  });
  const [latestReceipt, setLatestReceipt] = useState<SaleReceipt | null>(null);
  const [newOrderNotification, setNewOrderNotification] = useState<NewOrderNotification | null>(null);
  const dismissNewOrderNotification = useCallback(() => {
    setNewOrderNotification(null);
  }, []);

  // Sync Theme with HTML element and body
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      body?.classList.add('dark');
    } else {
      root.classList.remove('dark');
      body?.classList.remove('dark');
    }
    try {
      localStorage.setItem('appgenerica_theme', theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Refs to track state for background sync merging
  const tablesRef = React.useRef(tables);
  const productsRef = React.useRef(products);
  const salesRef = React.useRef(sales);
  const perishablesRef = React.useRef(perishables);
  const suppliersRef = React.useRef(suppliers);
  const supplierOrdersRef = React.useRef(supplierOrders);

  useEffect(() => { tablesRef.current = tables; }, [tables]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { salesRef.current = sales; }, [sales]);
  useEffect(() => { perishablesRef.current = perishables; }, [perishables]);
  useEffect(() => { suppliersRef.current = suppliers; }, [suppliers]);
  useEffect(() => { supplierOrdersRef.current = supplierOrders; }, [supplierOrders]);

  // Active UID from Firebase auth
  const activeUid = auth.currentUser?.uid || user?.id;
  const storeId = activeUid || 'default';

  // Ref to track active waiter calls across real-time snapshots to play chime alert for staff
  const prevWaiterCallsRef = React.useRef<Record<string, string>>({});
  // Ref para tracking de mutaciones locales optimistas recientes y evitar rebotes de onSnapshot
  const lastLocalTableMutations = React.useRef<Record<string, number>>({});
  // Tracking de órdenes conocidas para detectar pedidos entrantes de clientes en tiempo real
  const knownOrdersMapRef = React.useRef<Map<string, { itemsCount: number; lastUpdated?: string }>>(new Map());
  const isInitialOrdersLoadRef = React.useRef(true);

  // Real-time Firestore Subscriptions for authenticated UID
  useEffect(() => {
    if (!activeUid || activeUid === 'default') {
      setTables([]);
      setProducts([]);
      setPerishables([]);
      setSuppliers([]);
      setSupplierOrders([]);
      setSales([]);
      return;
    }

    setCloudStatus('syncing');

    const unsubTables = subscribeUserTables(activeUid, (newTables) => {
      // Audio chime check for new waiter/bill calls
      newTables.forEach(t => {
        if (t && t.waiterCall) {
          const callKey = `${t.id}_${t.waiterCall.type}_${t.waiterCall.requestedAt || ''}`;
          if (!prevWaiterCallsRef.current[t.id] || prevWaiterCallsRef.current[t.id] !== callKey) {
            playServiceBell(t.waiterCall.type === 'bill' ? 'bill' : 'waiter');
            prevWaiterCallsRef.current[t.id] = callKey;
          }
        } else if (t && t.id) {
          delete prevWaiterCallsRef.current[t.id];
        }
      });

      // Estabilización optimista: Si una mesa fue modificada localmente hace menos de 1500ms,
      // preservamos el estado local para evitar parpadeos mientras Firestore termina de propagar.
      const now = Date.now();
      const current = tablesRef.current;
      const stabilizedTables = newTables.map(remoteTable => {
        const lastMutationTime = lastLocalTableMutations.current[remoteTable.id];
        if (lastMutationTime && now - lastMutationTime < 1500) {
          const localTable = current.find(t => t.id === remoteTable.id);
          if (localTable) {
            return {
              ...remoteTable,
              order: localTable.order,
              status: localTable.status,
              updatedAt: localTable.updatedAt || remoteTable.updatedAt
            };
          }
        }
        return remoteTable;
      });

      tablesRef.current = stabilizedTables;
      setTables(stabilizedTables);
      setCloudStatus('synced');
    });

    const unsubOrders = subscribeUserOrders(activeUid, (activeOrders) => {
      // Sincronización en tiempo real de la colección pedidos
      const now = Date.now();
      const currentTables = tablesRef.current;
      let hasChanges = false;

      // Detección de nuevos pedidos/comandas entrantes (desde QR de clientes u otros terminales)
      if (isInitialOrdersLoadRef.current) {
        (activeOrders || []).forEach(o => {
          if (o && o.id) {
            knownOrdersMapRef.current.set(o.id, {
              itemsCount: Array.isArray(o.items) ? o.items.length : 0,
              lastUpdated: o.lastUpdatedAt
            });
          }
        });
        isInitialOrdersLoadRef.current = false;
      } else {
        for (const o of activeOrders || []) {
          if (!o || !o.id) continue;
          const prev = knownOrdersMapRef.current.get(o.id);
          const currentCount = Array.isArray(o.items) ? o.items.length : 0;
          const isBrandNew = !prev;
          const hasMoreItems = prev && currentCount > prev.itemsCount;

          if ((isBrandNew || hasMoreItems) && currentCount > 0) {
            // Verificar si fue una mutación realizada localmente en este mismo terminal hace menos de 2000ms
            const isLocal = lastLocalTableMutations.current[o.tableId] && (now - lastLocalTableMutations.current[o.tableId] < 2000);
            if (!isLocal) {
              // Calcular total del pedido con precios P.V.P (impuesto incluido)
              const orderTotal = (o.items || []).reduce((acc: number, it: any) => {
                const p = Number(it?.unitPrice ?? it?.price ?? 0) || 0;
                const q = Number(it?.quantity ?? it?.cantidad ?? 0) || 0;
                return acc + p * q;
              }, 0);

              const summary = (o.items || []).slice(0, 3).map((it: any) => `${it.quantity || 1}x ${it.name || 'Producto'}`).join(', ');

              const notification: NewOrderNotification = {
                id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                orderId: o.id,
                tableId: o.tableId,
                tableName: o.tableName || 'Mesa',
                itemsCount: currentCount,
                total: Math.round(orderTotal),
                customerName: (o as any).nombreCliente || (o as any).customerName || undefined,
                itemsSummary: summary + (currentCount > 3 ? ` (+${currentCount - 3} más)` : ''),
                timestamp: new Date().toISOString()
              };

              setNewOrderNotification(notification);
              playNewOrderAlert();
              break;
            }
          }
        }

        // Actualizar el mapa de órdenes conocidas
        knownOrdersMapRef.current.clear();
        (activeOrders || []).forEach(o => {
          if (o && o.id) {
            knownOrdersMapRef.current.set(o.id, {
              itemsCount: Array.isArray(o.items) ? o.items.length : 0,
              lastUpdated: o.lastUpdatedAt
            });
          }
        });
      }

      const mergedTables = currentTables.map(tbl => {
        const lastMutationTime = lastLocalTableMutations.current[tbl.id];
        if (lastMutationTime && now - lastMutationTime < 1500) {
          return tbl;
        }

        const matchingOrder = (activeOrders || []).find(o =>
          o &&
          !o.closed &&
          o.estado === 'activa' &&
          o.status !== 'pagada' &&
          o.status !== 'cobrado' &&
          (o.tableId === tbl.id || o.tableName === tbl.name)
        );

        if (matchingOrder && matchingOrder.items && matchingOrder.items.length > 0) {
          const isDifferentOrder = !tbl.order || tbl.order.id !== matchingOrder.id;
          const isItemCountDifferent = tbl.order && (tbl.order.items?.length !== matchingOrder.items.length);
          const isTimestampNewer = Boolean(matchingOrder.lastUpdatedAt && (!tbl.order?.lastUpdatedAt || matchingOrder.lastUpdatedAt >= tbl.order.lastUpdatedAt));

          if (isDifferentOrder || isItemCountDifferent || isTimestampNewer) {
            hasChanges = true;
            return {
              ...tbl,
              status: (tbl.status === 'libre' ? 'ocupada' : tbl.status) as TableStatus,
              order: matchingOrder
            };
          }
        } else if (!matchingOrder && tbl.order) {
          // Si la comanda ya no está activa en Firestore (fue cobrada/cancelada)
          hasChanges = true;
          return {
            ...tbl,
            status: 'libre' as TableStatus,
            order: undefined,
            waiterCall: null
          };
        }
        return tbl;
      });

      if (hasChanges) {
        tablesRef.current = mergedTables;
        setTables(mergedTables);
      }
      setCloudStatus('synced');
    });

    const unsubMenu = subscribeUserMenu(activeUid, (newProducts) => {
      // Deduplicate by ID and sort by displayOrder ascending
      const seen = new Set<string>();
      const deduped = (newProducts || []).filter(p => {
        if (!p || !p.id || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      deduped.sort((a, b) => {
        const orderA = a.displayOrder ?? 9999;
        const orderB = b.displayOrder ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      productsRef.current = deduped;
      setProducts(deduped);
      setCloudStatus('synced');
    });

    const unsubInventory = subscribeUserInventory(activeUid, (newPerishables) => {
      perishablesRef.current = newPerishables;
      setPerishables(newPerishables);
      setCloudStatus('synced');
    });

    const unsubSuppliers = subscribeUserSuppliers(activeUid, (newSuppliers) => {
      suppliersRef.current = newSuppliers;
      setSuppliers(newSuppliers);
      setCloudStatus('synced');
    });

    const unsubSupplierOrders = subscribeUserSupplierOrders(activeUid, (newSupplierOrders) => {
      supplierOrdersRef.current = newSupplierOrders;
      setSupplierOrders(newSupplierOrders);
      setCloudStatus('synced');
    });

    const unsubSales = subscribeUserSales(activeUid, (newSales) => {
      salesRef.current = newSales;
      setSales(newSales);
      setCloudStatus('synced');
    });

    return () => {
      unsubTables();
      unsubOrders();
      unsubMenu();
      unsubInventory();
      unsubSuppliers();
      unsubSupplierOrders();
      unsubSales();
    };
  }, [activeUid]);

  /**
   * Carga on-demand el historial completo de ventas desde Firestore cuando se abre el módulo
   * de ventas, informes o exportación a Excel, evitando mantener listeners en tiempo real sobre miles de documentos.
   */
  const loadFullSalesHistory = useCallback(async () => {
    if (!activeUid || activeUid === 'default') return;
    try {
      const fullSales = await getUserSales(activeUid);
      if (fullSales && fullSales.length > 0) {
        setSales(prev => {
          const salesMap = new Map<string, SaleReceipt>();
          prev.forEach(s => salesMap.set(s.id, s));
          fullSales.forEach(s => salesMap.set(s.id, s));
          const merged = Array.from(salesMap.values()).sort((a, b) =>
            (b.timestamp || '').localeCompare(a.timestamp || '')
          );
          salesRef.current = merged;
          return merged;
        });
      }
    } catch (err) {
      console.error("Error al cargar historial completo de ventas en demanda:", err);
    }
  }, [activeUid]);

  // Helper to persist local cache and update status without bulk loop rewrites
  const persistChanges = useCallback((
    newTables: Table[],
    newProducts: Product[],
    newSales: SaleReceipt[],
    newPerishables?: PerishableItem[],
    newSuppliers?: Supplier[]
  ) => {
    if (!activeUid || activeUid === 'default') return;
    try {
      const stateToStore: AppStateData = {
        tables: newTables,
        products: newProducts,
        perishables: newPerishables ?? perishablesRef.current,
        suppliers: newSuppliers ?? suppliersRef.current,
        sales: newSales,
        version: 2,
        lastModified: new Date().toISOString()
      };
      localStorage.setItem(`appgenerica_data_${activeUid}`, JSON.stringify(stateToStore));
    } catch {
      // ignore local storage quota limit
    }
    setCloudStatus('synced');
  }, [activeUid]);

  // Sync registered businessName & businessAddress from authenticated user into config
  useEffect(() => {
    if (!user) return;
    setConfig(prev => {
      let nextName = prev.businessName;
      let nextAddr = prev.businessAddress;

      // Prefer user-specific saved config if available
      try {
        const userSaved = localStorage.getItem(`appgenerica_custom_config_${user.id}`);
        if (userSaved) {
          const parsed = JSON.parse(userSaved);
          const merged = {
            ...defaultAppConfig,
            ...parsed,
            businessName: user.businessName || parsed.businessName || defaultAppConfig.businessName,
            businessAddress:
              user.businessAddress !== undefined
                ? user.businessAddress
                : (parsed.businessAddress ?? ''),
            qrSettings: { ...defaultAppConfig.qrSettings, ...(parsed.qrSettings || {}) }
          };
          return merged;
        }
      } catch {
        // ignore
      }

      if (user.businessName && (prev.businessName === defaultAppConfig.businessName || !prev.businessName)) {
        nextName = user.businessName;
      } else if (user.businessName && user.businessName !== 'Mi GastroBar') {
        nextName = user.businessName;
      }

      if (user.businessAddress !== undefined) {
        nextAddr = user.businessAddress;
      } else if (prev.businessAddress === defaultAppConfig.businessAddress) {
        nextAddr = '';
      }

      if (nextName === prev.businessName && nextAddr === prev.businessAddress) {
        return prev;
      }
      return {
        ...prev,
        businessName: nextName,
        businessAddress: nextAddr
      };
    });
  }, [user?.id, user?.businessName, user?.businessAddress]);

  const updateConfig = (partial: Partial<AppConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem('appgenerica_custom_config', JSON.stringify(updated));
        if (user?.id) {
          localStorage.setItem(`appgenerica_custom_config_${user.id}`, JSON.stringify(updated));
        }
      } catch {
        // ignore
      }
      if (partial.businessName !== undefined || partial.businessAddress !== undefined) {
        updateUserBusinessInfo(updated.businessName, updated.businessAddress);
      }
      if (partial.qrSettings !== undefined) {
        const activeUid = getActiveUserId(user?.id);
        if (activeUid) {
          saveUserQrConfig(activeUid, updated.qrSettings);
        }
      }
      return updated;
    });
  };

  // Freemium limit verification: ONLY diego.contreras9317@gmail.com has free lifetime PRO
  const isPro = user?.email?.toLowerCase() === 'diego.contreras9317@gmail.com' || user?.plan === 'pro';

  const canAddTable = useCallback(() => {
    if (isPro) return true;
    return tables.length < config.freemiumLimits.freeMaxTables;
  }, [isPro, tables.length, config.freemiumLimits.freeMaxTables]);

  const canAddProduct = useCallback(() => {
    if (isPro) return true;
    return products.length < config.freemiumLimits.freeMaxProducts;
  }, [isPro, products.length, config.freemiumLimits.freeMaxProducts]);

  // Table operations
  const addTable = (tableData: Omit<Table, 'id' | 'status'>): { success: boolean; error?: string } => {
    if (!canAddTable()) {
      return {
        success: false,
        error: `Has alcanzado el límite de ${config.freemiumLimits.freeMaxTables} mesas de la versión Gratuita. Actualiza a Pro para mesas ilimitadas.`
      };
    }

    const newTable: Table = {
      ...tableData,
      id: `tbl-${Date.now()}`,
      status: 'libre'
    };

    const nextTables = [...tablesRef.current, newTable];
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (activeUid && activeUid !== 'default') {
      saveTableToFirestore(newTable, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
    return { success: true };
  };

  const updateTable = (id: string, partial: Partial<Table>) => {
    let updatedTarget: Table | undefined;
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id === id) {
        updatedTarget = { ...tbl, ...partial };
        return updatedTarget;
      }
      return tbl;
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveTableToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const deleteTable = (id: string) => {
    const nextTables = tablesRef.current.filter(tbl => tbl.id !== id);
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (selectedTableId === id) setSelectedTableId(null);
    deleteTableFromFirestore(id, storeId).catch(() => {});
    persistChanges(nextTables, products, sales);
  };

  const setTableStatus = (tableId: string, status: TableStatus) => {
    let updatedTarget: Table | undefined;
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      updatedTarget = {
        ...tbl,
        status,
        updatedAt: new Date().toISOString()
      };
      return updatedTarget;
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveTableToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const callWaiter = (
    tableId: string,
    type: 'waiter' | 'bill',
    message?: string,
    extra?: {
      billingInfo?: CustomerBillingInfo;
      preferredPaymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia';
    }
  ) => {
    // Play audible service bell in the app
    playServiceBell(type);

    const nowIso = new Date().toISOString();
    const callKey = `${tableId}_${type}_${nowIso}`;
    prevWaiterCallsRef.current[tableId] = callKey;

    const normalizedBilling =
      extra?.billingInfo && hasCustomBillingData(extra.billingInfo)
        ? normalizeBillingInfo(extra.billingInfo)
        : undefined;

    let updatedTarget: Table | undefined;
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      const nextOrder =
        tbl.order && normalizedBilling
          ? {
              ...tbl.order,
              customerName: normalizedBilling.customerName,
              nombreCliente: normalizedBilling.customerName,
              billingInfo: normalizedBilling,
              lastUpdatedAt: nowIso
            }
          : tbl.order;

      updatedTarget = {
        ...tbl,
        status: type === 'bill' ? ('cuenta' as TableStatus) : tbl.status,
        updatedAt: nowIso,
        order: nextOrder,
        waiterCall: {
          type,
          requestedAt: nowIso,
          message: message || (type === 'bill' ? 'Cliente solicita la cuenta' : 'Cliente solicita atención en mesa'),
          ...(extra?.preferredPaymentMethod ? { preferredPaymentMethod: extra.preferredPaymentMethod } : {}),
          ...(normalizedBilling ? { billingInfo: normalizedBilling } : {})
        }
      };
      return updatedTarget;
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveTableToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const dismissWaiterCall = (tableId: string) => {
    delete prevWaiterCallsRef.current[tableId];

    let updatedTarget: Table | undefined;
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      updatedTarget = {
        ...tbl,
        waiterCall: null,
        updatedAt: new Date().toISOString()
      };
      return updatedTarget;
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveTableToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  // Order & POS operations
  const addItemToOrder = (tableId: string, product: Product, quantity = 1, notes?: string) => {
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;

      const existingOrder: Order = tbl.order || {
        id: `ord-${Date.now()}`,
        tableId: tbl.id,
        tableName: tbl.name,
        items: [],
        discountPercent: 0,
        taxPercent: config.defaultTaxRate,
        tipAmount: 0,
        openedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString()
      };

      // Check if item with same productId and exact notes exists
      const existingItemIndex = existingOrder.items.findIndex(
        it => it.productId === product.id && (it.notes || '') === (notes || '')
      );

      const resolvedProdTax = resolveProductTax(product, config.defaultTaxRate);

      let updatedItems: OrderItem[];
      if (existingItemIndex > -1) {
        updatedItems = existingOrder.items.map((item, idx) => {
          if (idx === existingItemIndex) {
            return {
              ...item,
              quantity: item.quantity + quantity,
              taxType: resolvedProdTax.taxType,
              taxRate: resolvedProdTax.taxRate
            };
          }
          return item;
        });
      } else {
        const newItem: OrderItem = {
          id: `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: quantity,
          notes: notes?.trim() || undefined,
          addedAt: new Date().toISOString(),
          taxType: resolvedProdTax.taxType,
          taxRate: resolvedProdTax.taxRate
        };
        updatedItems = [...existingOrder.items, newItem];
      }

      const nowIso = new Date().toISOString();
      return {
        ...tbl,
        status: (tbl.status === 'libre' ? 'ocupada' : tbl.status) as TableStatus,
        updatedAt: nowIso,
        order: {
          ...existingOrder,
          items: updatedItems,
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const addItemsToOrder = (
    tableId: string,
    itemsToAdd: Array<{ product: Product; quantity: number; notes?: string; customerName?: string; orderedBy?: 'cliente' | 'camarero' | 'cajero' }>
  ) => {
    if (!itemsToAdd || itemsToAdd.length === 0) return;

    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;

      const existingOrder: Order = tbl.order || {
        id: `ord-${Date.now()}`,
        tableId: tbl.id,
        tableName: tbl.name,
        items: [],
        discountPercent: 0,
        taxPercent: config.defaultTaxRate,
        tipAmount: 0,
        openedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString()
      };

      let currentItems = [...existingOrder.items];

      itemsToAdd.forEach(toAdd => {
        const resolvedProdTax = resolveProductTax(toAdd.product, config.defaultTaxRate);
        const existingIndex = currentItems.findIndex(
          it => it.productId === toAdd.product.id && (it.notes || '') === (toAdd.notes || '')
        );

        if (existingIndex > -1) {
          currentItems[existingIndex] = {
            ...currentItems[existingIndex],
            quantity: currentItems[existingIndex].quantity + toAdd.quantity,
            customerName: toAdd.customerName || currentItems[existingIndex].customerName,
            orderedBy: toAdd.orderedBy || currentItems[existingIndex].orderedBy,
            taxType: resolvedProdTax.taxType,
            taxRate: resolvedProdTax.taxRate
          };
        } else {
          currentItems.push({
            id: `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            productId: toAdd.product.id,
            name: toAdd.product.name,
            unitPrice: toAdd.product.price,
            quantity: toAdd.quantity,
            notes: toAdd.notes?.trim() || undefined,
            addedAt: new Date().toISOString(),
            orderedBy: toAdd.orderedBy || 'cliente',
            customerName: toAdd.customerName?.trim() || undefined,
            taxType: resolvedProdTax.taxType,
            taxRate: resolvedProdTax.taxRate
          });
        }
      });

      const nowIso = new Date().toISOString();
      return {
        ...tbl,
        status: (tbl.status === 'libre' ? 'ocupada' : tbl.status) as TableStatus,
        updatedAt: nowIso,
        order: {
          ...existingOrder,
          items: currentItems,
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const updateOrderItemQuantity = (tableId: string, itemId: string, delta: number) => {
    const nowIso = new Date().toISOString();
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId || !tbl.order) return tbl;

      const updatedItems = tbl.order.items
        .map(item => {
          if (item.id === itemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is OrderItem => item !== null);

      if (updatedItems.length === 0) {
        return {
          ...tbl,
          status: 'libre' as TableStatus,
          order: undefined,
          updatedAt: nowIso
        };
      }

      return {
        ...tbl,
        updatedAt: nowIso,
        order: {
          ...tbl.order,
          items: updatedItems,
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const removeOrderItem = (tableId: string, itemId: string) => {
    const nowIso = new Date().toISOString();
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId || !tbl.order) return tbl;

      const updatedItems = tbl.order.items.filter(item => item.id !== itemId);
      if (updatedItems.length === 0) {
        return {
          ...tbl,
          status: 'libre' as TableStatus,
          order: undefined,
          updatedAt: nowIso
        };
      }

      return {
        ...tbl,
        updatedAt: nowIso,
        order: {
          ...tbl.order,
          items: updatedItems,
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const updateOrderModifiers = (
    tableId: string,
    modifiers: { taxPercent?: number; discountPercent?: number; tipAmount?: number }
  ) => {
    const nowIso = new Date().toISOString();
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId || !tbl.order) return tbl;

      return {
        ...tbl,
        updatedAt: nowIso,
        order: {
          ...tbl.order,
          ...(modifiers.taxPercent !== undefined && { taxPercent: modifiers.taxPercent }),
          ...(modifiers.discountPercent !== undefined && { discountPercent: modifiers.discountPercent }),
          ...(modifiers.tipAmount !== undefined && { tipAmount: modifiers.tipAmount }),
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const updateOrderBillingInfo = (tableId: string, billingInfo: CustomerBillingInfo) => {
    const nowIso = new Date().toISOString();
    const normalized = normalizeBillingInfo(billingInfo);

    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId || !tbl.order) return tbl;
      return {
        ...tbl,
        updatedAt: nowIso,
        order: {
          ...tbl.order,
          customerName: normalized.customerName,
          nombreCliente: normalized.customerName,
          billingInfo: normalized,
          lastUpdatedAt: nowIso
        }
      };
    });

    tablesRef.current = nextTables;
    lastLocalTableMutations.current[tableId] = Date.now();
    setTables(nextTables);
    const updatedTable = nextTables.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid).catch(console.error);
    }
    persistChanges(nextTables, products, sales);
  };

  const checkoutTable = (
    tableId: string,
    paymentMethod: PaymentMethod,
    cashTendered?: number,
    options?: {
      receiptId?: string;
      cashierName?: string;
      cashierRole?: string;
      cashierId?: string;
      billingInfo?: CustomerBillingInfo;
      skipFirestore?: boolean;
    }
  ): { success: boolean; receipt?: SaleReceipt } => {
    const table = tablesRef.current.find(t => t.id === tableId);
    const order = table?.order;
    const items = order?.items || (order as any)?.productos || [];
    if (!table || !order || items.length === 0) {
      return { success: false };
    }

    const fallbackTaxRate = Number(order.taxPercent ?? config.defaultTaxRate ?? 8) || 8;
    const discountPercent = Number(order.discountPercent) || 0;
    const enrichedItems: OrderItem[] = (items || []).map((item: any) => {
      const resolvedItemTax = resolveOrderItemTax(item, products, fallbackTaxRate);
      return {
        ...item,
        taxType: resolvedItemTax.taxType,
        taxRate: resolvedItemTax.taxRate
      };
    });

    const taxSummary = calculateOrderTaxBreakdown(
      enrichedItems as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
      {
        discountPercent,
        fallbackTaxRate,
        productsCatalog: products
      }
    );

    const subtotal = taxSummary.subtotal;
    const discountAmount = taxSummary.discountAmount;
    const productsTotal = taxSummary.productsTotal;
    const taxAmount = taxSummary.totalTaxAmount;
    const taxPercent = taxSummary.effectiveTaxPercent;
    const tipAmount = Number(order.tipAmount) || 0;
    // Total a cobrar: exactamente igual a la suma de los productos (Subtotal) menos descuento más propina
    const total = productsTotal + tipAmount;

    let change: number | undefined = undefined;
    if (paymentMethod === 'efectivo' && cashTendered !== undefined) {
      change = Math.max(0, cashTendered - total);
    }

    const resolvedCashierName = options?.cashierName?.trim() || activeOperatorName;
    const resolvedCashierRole = options?.cashierRole?.trim() || activeOperatorRole || undefined;
    const resolvedCashierId = options?.cashierId?.trim() || activeOperatorId || undefined;

    const extracted = extractTableBillingInfo(table);
    const resolvedBilling = normalizeBillingInfo(options?.billingInfo || extracted.billing);

    const isElectronic = Boolean(resolvedBilling.requiresElectronicInvoice || resolvedBilling.email);

    const receipt: SaleReceipt = {
      id: options?.receiptId || `tick-${Date.now()}`,
      orderId: order.id,
      tableName: table.name,
      items: enrichedItems,
      subtotal: Math.round(subtotal),
      taxAmount: Math.round(taxAmount),
      taxPercent: taxPercent,
      ivaAmount: Math.round(taxSummary.ivaAmount),
      impoconsumoAmount: Math.round(taxSummary.impoconsumoAmount),
      discountAmount: Math.round(discountAmount),
      discountPercent: discountPercent,
      tipAmount: Math.round(tipAmount),
      total: Math.round(total),
      paymentMethod,
      cashTendered: cashTendered ? Math.round(cashTendered) : undefined,
      change: change !== undefined ? Math.round(change) : undefined,
      timestamp: new Date().toISOString(),
      cashierName: resolvedCashierName,
      ...(resolvedCashierRole ? { cashierRole: resolvedCashierRole } : {}),
      ...(resolvedCashierId ? { cashierId: resolvedCashierId } : {}),
      customerName: resolvedBilling.customerName,
      customerDocumentType: resolvedBilling.documentType,
      customerDocumentNumber: resolvedBilling.documentNumber,
      ...(resolvedBilling.email ? { customerEmail: resolvedBilling.email } : {}),
      ...(isElectronic
        ? {
            requiresElectronicInvoice: true,
            electronicInvoiceStatus: 'pendiente' as const
          }
        : {}),
      billingInfo: resolvedBilling
    };

    // 1. Decrement inventory stock automatically (both direct products and recipe ingredients)
    const directDeductions: Record<string, number> = {};
    const insumoDeductions: Record<string, number> = {};

    items.forEach((item: any) => {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;
      const prod = products.find(p => p.id === item.productId || p.name === item.name);
      if (!prod) return;

      if (prod.tipoInventario === 'receta' && Array.isArray(prod.receta) && prod.receta.length > 0) {
        prod.receta.forEach(ing => {
          const pantryItem = perishablesRef.current.find(p => p.id === ing.insumoId);
          const factor = getUnitConversionFactor(ing.unidad, pantryItem?.unit);
          const req = (Number(ing.cantidad) || 0) * factor * qty;
          if (req > 0 && ing.insumoId) {
            insumoDeductions[ing.insumoId] = (insumoDeductions[ing.insumoId] || 0) + req;
          }
        });
      } else {
        directDeductions[prod.id] = (directDeductions[prod.id] || 0) + qty;
      }
    });

    const nextPerishables = perishablesRef.current.map(item => {
      const deduct = insumoDeductions[item.id];
      if (deduct !== undefined && deduct > 0) {
        const remaining = Math.max(0, (Number(item.quantity) || 0) - deduct);
        return {
          ...item,
          quantity: remaining,
          cantidadActual: remaining
        };
      }
      return item;
    });

    const nextProducts = products.map(prod => {
      if (prod.tipoInventario === 'receta' && Array.isArray(prod.receta) && prod.receta.length > 0) {
        let minPortions = Infinity;
        prod.receta.forEach(ing => {
          const found = nextPerishables.find(p => p.id === ing.insumoId);
          const avail = found ? found.quantity : 0;
          const factor = getUnitConversionFactor(ing.unidad, found?.unit);
          const reqInPantryUnit = (Number(ing.cantidad) || 0) * factor;
          const portions = reqInPantryUnit > 0 ? Math.floor(avail / reqInPantryUnit) : 0;
          if (portions < minPortions) minPortions = portions;
        });
        return {
          ...prod,
          stock: minPortions === Infinity ? 0 : minPortions
        };
      }

      const deduct = directDeductions[prod.id];
      if (deduct !== undefined && deduct > 0) {
        return {
          ...prod,
          stock: Math.max(0, (Number(prod.stock) || 0) - deduct)
        };
      }
      return prod;
    });

    // 2. Free the table and reset active order & waiter calls
    const nowIso = new Date().toISOString();
    delete prevWaiterCallsRef.current[tableId];
    lastLocalTableMutations.current[tableId] = Date.now();

    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      return {
        ...tbl,
        status: 'libre' as TableStatus,
        order: undefined,
        waiterCall: null,
        updatedAt: nowIso
      };
    });

    // 3. Record sales receipt (deduplicating by ID) & persist immediately
    const nextSales = [receipt, ...sales.filter(s => s.id !== receipt.id)];

    tablesRef.current = nextTables;
    setTables(nextTables);
    productsRef.current = nextProducts;
    setProducts(nextProducts);
    perishablesRef.current = nextPerishables;
    setPerishables(nextPerishables);
    setSales(nextSales);
    setLatestReceipt(receipt);
    persistChanges(nextTables, nextProducts, nextSales, nextPerishables);

    // 4. Actualización directa e inmediata en Firestore con writeBatch
    if (!options?.skipFirestore && activeUid && activeUid !== 'default') {
      executeSaleCheckoutBatch({
        uid: activeUid,
        tableId,
        orderId: order.id,
        receipt,
        orderItems: enrichedItems,
        productsCatalog: products,
        perishablesList: perishablesRef.current
      }).catch(err => {
        console.error('ERROR CRÍTICO EN FIREBASE al ejecutar batch write en checkoutTable:', err);
      });
    }

    return { success: true, receipt };
  };

  // Función asíncrona de cobro con control de errores extremo
  const cobrarMesa = async (
    tableId: string,
    paymentMethod: PaymentMethod,
    cashTendered?: number,
    options?: {
      receiptId?: string;
      cashierName?: string;
      cashierRole?: string;
      cashierId?: string;
      billingInfo?: CustomerBillingInfo;
    }
  ): Promise<{ success: boolean; receipt?: SaleReceipt }> => {
    if (!tableId || typeof tableId !== 'string') {
      console.error("ERROR CRÍTICO: tableId es undefined en cobrarMesa:", tableId);
      throw new Error("cobrarMesa abortado: ID de la mesa es undefined");
    }

    const table = tablesRef.current.find(t => t.id === tableId);
    const order = table?.order;
    if (!table || !order || !order.id) {
      console.error("ERROR CRÍTICO: No hay orden activa o order.id es undefined para mesa:", tableId);
      throw new Error("cobrarMesa abortado: No se encontró orden activa o su ID es undefined");
    }

    const items = order.items || (order as any)?.productos || [];

    const res = checkoutTable(tableId, paymentMethod, cashTendered, {
      ...options,
      skipFirestore: true
    });
    if (res.receipt && activeUid && activeUid !== 'default') {
      try {
        await executeSaleCheckoutBatch({
          uid: activeUid,
          tableId,
          orderId: order.id,
          receipt: res.receipt,
          orderItems: items,
          productsCatalog: productsRef.current,
          perishablesList: perishablesRef.current
        });
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE al ejecutar batch write en cobrarMesa:", error);
        throw error;
      }
    }
    return res;
  };

  // Función asíncrona de eliminación de producto con control de errores extremo
  const eliminarProducto = async (tableId: string, itemId: string): Promise<void> => {
    if (!tableId || typeof tableId !== 'string') {
      console.error("ERROR CRÍTICO: tableId es undefined en eliminarProducto:", tableId);
      throw new Error("eliminarProducto abortado: ID de la mesa es undefined");
    }
    if (!itemId || typeof itemId !== 'string') {
      console.error("ERROR CRÍTICO: itemId es undefined en eliminarProducto:", itemId);
      throw new Error("eliminarProducto abortado: ID del producto es undefined");
    }

    removeOrderItem(tableId, itemId);
    const updatedTable = tablesRef.current.find(t => t.id === tableId);
    if (activeUid && activeUid !== 'default') {
      try {
        console.log("Intentando actualizar doc con ID:", tableId, "Datos tras eliminar producto:", updatedTable?.order);
        await syncTableOrderToFirestore(tableId, updatedTable?.order, activeUid);
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE al eliminar producto:", error);
        throw error;
      }
    }
  };

  // Product & Inventory operations
  const addProduct = (prodData: Omit<Product, 'id'> & { id?: string }): { success: boolean; error?: string } => {
    // If product already exists with this ID, delegate to updateProduct to prevent duplicates
    if (prodData.id) {
      const existingProduct = products.find(p => p.id === prodData.id);
      if (existingProduct) {
        updateProduct(prodData.id, prodData);
        return { success: true };
      }
    }

    if (!canAddProduct()) {
      return {
        success: false,
        error: `Has alcanzado el límite de ${config.freemiumLimits.freeMaxProducts} productos del plan Gratuito. Suscríbete a Pro para catálogo ilimitado.`
      };
    }

    const resolvedProdTax = resolveProductTax(prodData, config.defaultTaxRate);
    const newProd: Product = {
      ...prodData,
      taxType: resolvedProdTax.taxType,
      taxRate: resolvedProdTax.taxRate,
      id: prodData.id || `prod-${Date.now()}`
    };

    // Remove any duplicate if present, then prepend
    const nextProducts = [newProd, ...products.filter(p => p.id !== newProd.id)];
    setProducts(nextProducts);
    if (activeUid && activeUid !== 'default') {
      saveProductToFirestore(newProd, activeUid).catch(console.error);
    }
    persistChanges(tables, nextProducts, sales);
    return { success: true };
  };

  const updateProduct = (id: string, partial: Partial<Product>) => {
    let updatedTarget: Product | undefined;
    const nextProducts = products.map(p => {
      if (p.id === id) {
        const merged = { ...p, ...partial };
        const resolvedProdTax = resolveProductTax(merged, config.defaultTaxRate);
        updatedTarget = {
          ...merged,
          taxType: resolvedProdTax.taxType,
          taxRate: resolvedProdTax.taxRate
        };
        return updatedTarget;
      }
      return p;
    });
    setProducts(nextProducts);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveProductToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, nextProducts, sales);
  };

  const reorderProducts = (newOrderedProducts: Product[]) => {
    const seen = new Set<string>();
    const deduped: Product[] = [];

    // Assign sequential displayOrder
    newOrderedProducts.forEach((p, idx) => {
      if (p && p.id && !seen.has(p.id)) {
        seen.add(p.id);
        deduped.push({ ...p, displayOrder: idx });
      }
    });

    // Ensure any product from current state not in newOrderedProducts is appended
    products.forEach(p => {
      if (p && p.id && !seen.has(p.id)) {
        seen.add(p.id);
        deduped.push({ ...p, displayOrder: deduped.length });
      }
    });

    setProducts(deduped);
    persistChanges(tables, deduped, sales);

    if (activeUid && activeUid !== 'default') {
      // Only persist products whose displayOrder actually changed to conserve daily write units
      deduped.forEach(prod => {
        const oldProd = products.find(p => p.id === prod.id);
        if (!oldProd || oldProd.displayOrder !== prod.displayOrder) {
          saveProductToFirestore(prod, activeUid).catch(() => {});
        }
      });
    }
  };

  const deleteProduct = (id: string) => {
    const nextProducts = products.filter(p => p.id !== id);
    setProducts(nextProducts);
    deleteProductFromFirestore(id, storeId).catch(() => {});
    persistChanges(tables, nextProducts, sales);
  };

  const adjustProductStock = (id: string, delta: number) => {
    let updatedTarget: Product | undefined;
    const nextProducts = products.map(p => {
      if (p.id === id) {
        updatedTarget = { ...p, stock: Math.max(0, p.stock + delta) };
        return updatedTarget;
      }
      return p;
    });
    setProducts(nextProducts);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveProductToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, nextProducts, sales);
  };

  // --- Perishables (Verduras, Frutas, Insumos Bar & Cocina) Operations ---
  const addPerishable = (item: Omit<PerishableItem, 'id'>) => {
    const newPerishable: PerishableItem = {
      ...item,
      id: `perish-${Date.now()}`
    };
    const nextPerishables = [newPerishable, ...perishables];
    setPerishables(nextPerishables);
    if (activeUid && activeUid !== 'default') {
      saveInventoryItemToFirestore(newPerishable, activeUid).catch(console.error);
    }
    persistChanges(tables, products, sales, nextPerishables);
    return { success: true };
  };

  const updatePerishable = (id: string, partial: Partial<PerishableItem>) => {
    let updatedTarget: PerishableItem | undefined;
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        updatedTarget = { ...p, ...partial };
        return updatedTarget;
      }
      return p;
    });
    setPerishables(nextPerishables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveInventoryItemToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, products, sales, nextPerishables);
  };

  const deletePerishable = (id: string) => {
    const nextPerishables = perishables.filter(p => p.id !== id);
    setPerishables(nextPerishables);
    deleteInventoryItemFromFirestore(id, storeId).catch(() => {});
    persistChanges(tables, products, sales, nextPerishables);
  };

  const adjustPerishableQuantity = (id: string, newQuantity: number) => {
    let updatedTarget: PerishableItem | undefined;
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        updatedTarget = { ...p, quantity: Math.max(0, Number(newQuantity.toFixed(2))) };
        return updatedTarget;
      }
      return p;
    });
    setPerishables(nextPerishables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveInventoryItemToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, products, sales, nextPerishables);
  };

  const recordPerishableWaste = (id: string, amount: number, reason: string) => {
    let updatedTarget: PerishableItem | undefined;
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        const nextQty = Math.max(0, Number((p.quantity - amount).toFixed(2)));
        const noteAddition = ` [Merma: -${amount} ${p.unit} (${reason})]`;
        updatedTarget = {
          ...p,
          quantity: nextQty,
          notes: (p.notes ? p.notes + noteAddition : noteAddition)
        };
        return updatedTarget;
      }
      return p;
    });
    setPerishables(nextPerishables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveInventoryItemToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, products, sales, nextPerishables);
  };

  const recordPerishableRestock = (id: string, addedAmount: number, newEntryDate?: string, newExpiryDate?: string) => {
    let updatedTarget: PerishableItem | undefined;
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        updatedTarget = {
          ...p,
          quantity: Number((p.quantity + addedAmount).toFixed(2)),
          entryDate: newEntryDate || p.entryDate,
          expiryDate: newExpiryDate || p.expiryDate
        };
        return updatedTarget;
      }
      return p;
    });
    setPerishables(nextPerishables);
    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveInventoryItemToFirestore(updatedTarget, activeUid).catch(console.error);
    }
    persistChanges(tables, products, sales, nextPerishables);
  };

  // --- Suppliers (Proveedores de Despensa e Insumos) Operations ---
  const addSupplier = (supplierData: Omit<Supplier, 'id' | 'createdAt'>): Supplier => {
    const nowIso = new Date().toISOString();
    const newSupplier: Supplier = {
      ...supplierData,
      id: `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: supplierData.name.trim(),
      phone: supplierData.phone.trim(),
      hasWhatsapp: supplierData.hasWhatsapp ?? true,
      suppliesProvided: supplierData.suppliesProvided.trim(),
      notes: supplierData.notes?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const nextSuppliers = [newSupplier, ...suppliersRef.current];
    suppliersRef.current = nextSuppliers;
    setSuppliers(nextSuppliers);
    if (activeUid && activeUid !== 'default') {
      saveSupplierToFirestore(newSupplier, activeUid).catch(console.error);
    }
    return newSupplier;
  };

  const updateSupplier = (id: string, partial: Partial<Supplier>) => {
    const nowIso = new Date().toISOString();
    let updatedTarget: Supplier | undefined;
    const prevSupplier = suppliersRef.current.find(s => s.id === id);

    const nextSuppliers = suppliersRef.current.map(s => {
      if (s.id === id) {
        updatedTarget = {
          ...s,
          ...partial,
          name: partial.name !== undefined ? partial.name.trim() : s.name,
          phone: partial.phone !== undefined ? partial.phone.trim() : s.phone,
          hasWhatsapp: partial.hasWhatsapp !== undefined ? partial.hasWhatsapp : (s.hasWhatsapp ?? true),
          suppliesProvided: partial.suppliesProvided !== undefined ? partial.suppliesProvided.trim() : s.suppliesProvided,
          updatedAt: nowIso
        };
        return updatedTarget;
      }
      return s;
    });

    suppliersRef.current = nextSuppliers;
    setSuppliers(nextSuppliers);

    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveSupplierToFirestore(updatedTarget, activeUid).catch(console.error);
    }

    // Keep linked perishables in sync if supplier name or phone changed
    if (updatedTarget && (partial.name !== undefined || partial.phone !== undefined)) {
      let perishablesChanged = false;
      const nextPerishables = perishablesRef.current.map(p => {
        const matchesId = p.supplierId === id;
        const matchesLegacyName = !p.supplierId && prevSupplier && p.supplier?.trim().toLowerCase() === prevSupplier.name.trim().toLowerCase();
        if (matchesId || matchesLegacyName) {
          perishablesChanged = true;
          const updatedItem: PerishableItem = {
            ...p,
            supplierId: id,
            supplier: updatedTarget!.name,
            supplierPhone: updatedTarget!.phone
          };
          if (activeUid && activeUid !== 'default') {
            saveInventoryItemToFirestore(updatedItem, activeUid).catch(console.error);
          }
          return updatedItem;
        }
        return p;
      });
      if (perishablesChanged) {
        perishablesRef.current = nextPerishables;
        setPerishables(nextPerishables);
      }
    }
  };

  const deleteSupplier = (id: string) => {
    const nextSuppliers = suppliersRef.current.filter(s => s.id !== id);
    suppliersRef.current = nextSuppliers;
    setSuppliers(nextSuppliers);
    if (activeUid && activeUid !== 'default') {
      deleteSupplierFromFirestore(id, activeUid).catch(console.error);
    }
  };

  // --- Supplier Orders (Registro de Pedidos a Distribuidores) ---
  const addSupplierOrder = (
    orderData: Omit<SupplierOrder, 'id' | 'status' | 'arrived' | 'arrivedComplete'> & {
      id?: string;
      status?: SupplierOrder['status'];
      arrived?: boolean;
      arrivedComplete?: boolean;
    }
  ): SupplierOrder => {
    const nowIso = new Date().toISOString();
    const cleanItems: SupplierOrderItem[] = (orderData.items || []).map((it, idx) => ({
      id: it.id || `soi-${Date.now()}-${idx}`,
      name: it.name.trim(),
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'unidades',
      received: it.received ?? false,
      receivedQuantity: it.receivedQuantity ?? (Number(it.quantity) || 1)
    }));

    const newOrder: SupplierOrder = {
      id: orderData.id || `sord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      supplierId: orderData.supplierId || undefined,
      supplierName: orderData.supplierName.trim(),
      supplierPhone: orderData.supplierPhone?.trim() || undefined,
      channel: orderData.channel || 'manual',
      businessName: orderData.businessName?.trim() || config.businessName,
      businessAddress: orderData.businessAddress?.trim() || config.businessAddress || undefined,
      items: cleanItems,
      notes: orderData.notes?.trim() || undefined,
      orderedAt: orderData.orderedAt || nowIso,
      status: orderData.status || 'pendiente',
      arrived: orderData.arrived ?? false,
      arrivedComplete: orderData.arrivedComplete ?? false,
      confirmedAt: orderData.confirmedAt,
      confirmedBy: orderData.confirmedBy,
      receptionNotes: orderData.receptionNotes,
      stockUpdated: orderData.stockUpdated ?? false
    };

    const existingIdx = supplierOrdersRef.current.findIndex(o => o.id === newOrder.id);
    const nextOrders =
      existingIdx > -1
        ? supplierOrdersRef.current.map((o, i) => (i === existingIdx ? newOrder : o))
        : [newOrder, ...supplierOrdersRef.current];

    nextOrders.sort((a, b) => (b.orderedAt || '').localeCompare(a.orderedAt || ''));
    supplierOrdersRef.current = nextOrders;
    setSupplierOrders(nextOrders);

    if (activeUid && activeUid !== 'default') {
      saveSupplierOrderToFirestore(newOrder, activeUid).catch(console.error);
    }

    return newOrder;
  };

  const updateSupplierOrder = (id: string, partial: Partial<SupplierOrder>) => {
    let updatedTarget: SupplierOrder | undefined;
    const nextOrders = supplierOrdersRef.current.map(ord => {
      if (ord.id === id) {
        updatedTarget = { ...ord, ...partial };
        return updatedTarget;
      }
      return ord;
    });
    nextOrders.sort((a, b) => (b.orderedAt || '').localeCompare(a.orderedAt || ''));
    supplierOrdersRef.current = nextOrders;
    setSupplierOrders(nextOrders);

    if (updatedTarget && activeUid && activeUid !== 'default') {
      saveSupplierOrderToFirestore(updatedTarget, activeUid).catch(console.error);
    }
  };

  const confirmSupplierOrderDelivery = (
    orderId: string,
    payload: {
      arrivedComplete: boolean;
      confirmedAt?: string;
      confirmedBy?: string;
      receptionNotes?: string;
      items?: SupplierOrderItem[];
      restockPantry?: boolean;
    }
  ) => {
    const targetOrder = supplierOrdersRef.current.find(o => o.id === orderId);
    if (!targetOrder) return;

    const confirmedIso = payload.confirmedAt || new Date().toISOString();
    const resolvedItems: SupplierOrderItem[] = (payload.items || targetOrder.items).map(it => ({
      ...it,
      received: payload.items ? Boolean(it.received) : true,
      receivedQuantity: it.receivedQuantity !== undefined ? Number(it.receivedQuantity) : Number(it.quantity)
    }));

    const shouldRestock = Boolean(payload.restockPantry) && !targetOrder.stockUpdated;
    let didUpdateStock = Boolean(targetOrder.stockUpdated);

    if (shouldRestock) {
      const entryDateStr = confirmedIso.split('T')[0];
      let anyPerishableChanged = false;
      const nextPerishables = perishablesRef.current.map(p => {
        const matchedLine = resolvedItems.find(
          line =>
            line.received !== false &&
            (line.receivedQuantity ?? line.quantity) > 0 &&
            line.name.trim().toLowerCase() === p.name.trim().toLowerCase()
        );
        if (!matchedLine) return p;

        anyPerishableChanged = true;
        const addedQty = Number(matchedLine.receivedQuantity ?? matchedLine.quantity) || 0;
        const updatedItem: PerishableItem = {
          ...p,
          quantity: Number((p.quantity + addedQty).toFixed(2)),
          entryDate: entryDateStr || p.entryDate
        };
        if (activeUid && activeUid !== 'default') {
          saveInventoryItemToFirestore(updatedItem, activeUid).catch(console.error);
        }
        return updatedItem;
      });

      if (anyPerishableChanged) {
        didUpdateStock = true;
        perishablesRef.current = nextPerishables;
        setPerishables(nextPerishables);
      }
    }

    const updatedOrder: SupplierOrder = {
      ...targetOrder,
      items: resolvedItems,
      status: payload.arrivedComplete ? 'recibido_completo' : 'recibido_incompleto',
      arrived: true,
      arrivedComplete: payload.arrivedComplete,
      confirmedAt: confirmedIso,
      confirmedBy: payload.confirmedBy?.trim() || activeOperatorName,
      receptionNotes: payload.receptionNotes?.trim() || undefined,
      stockUpdated: didUpdateStock
    };

    const nextOrders = supplierOrdersRef.current.map(o => (o.id === orderId ? updatedOrder : o));
    supplierOrdersRef.current = nextOrders;
    setSupplierOrders(nextOrders);

    if (activeUid && activeUid !== 'default') {
      saveSupplierOrderToFirestore(updatedOrder, activeUid).catch(console.error);
    }
  };

  const deleteSupplierOrder = (id: string) => {
    const nextOrders = supplierOrdersRef.current.filter(o => o.id !== id);
    supplierOrdersRef.current = nextOrders;
    setSupplierOrders(nextOrders);
    if (activeUid && activeUid !== 'default') {
      deleteSupplierOrderFromFirestore(id, activeUid).catch(console.error);
    }
  };

  const updateElectronicInvoiceStatus = (saleId: string, status: ElectronicInvoiceStatus) => {
    const nowIso = new Date().toISOString();
    let updatedReceipt: SaleReceipt | undefined;
    const nextSales = salesRef.current.map((s) => {
      if (s.id !== saleId) return s;
      updatedReceipt = {
        ...s,
        requiresElectronicInvoice: true,
        electronicInvoiceStatus: status,
        electronicInvoiceIssuedAt: status === 'emitida' ? nowIso : ''
      };
      return updatedReceipt;
    });
    salesRef.current = nextSales;
    setSales(nextSales);
    persistChanges(tablesRef.current, productsRef.current, nextSales, perishablesRef.current, suppliersRef.current);
    if (updatedReceipt && activeUid && activeUid !== 'default') {
      saveSaleToFirestore(updatedReceipt, activeUid).catch(console.error);
    }
  };

  const bulkUpdateElectronicInvoiceStatus = (saleIds: string[], status: ElectronicInvoiceStatus) => {
    if (!saleIds || saleIds.length === 0) return;
    const idSet = new Set(saleIds);
    const nowIso = new Date().toISOString();
    const updatedReceipts: SaleReceipt[] = [];

    const nextSales = salesRef.current.map((s) => {
      if (!idSet.has(s.id)) return s;
      const updated: SaleReceipt = {
        ...s,
        requiresElectronicInvoice: true,
        electronicInvoiceStatus: status,
        electronicInvoiceIssuedAt: status === 'emitida' ? s.electronicInvoiceIssuedAt || nowIso : ''
      };
      updatedReceipts.push(updated);
      return updated;
    });

    if (updatedReceipts.length === 0) return;
    salesRef.current = nextSales;
    setSales(nextSales);
    persistChanges(
      tablesRef.current,
      productsRef.current,
      nextSales,
      perishablesRef.current,
      suppliersRef.current
    );
    if (activeUid && activeUid !== 'default') {
      for (const rec of updatedReceipts) {
        saveSaleToFirestore(rec, activeUid).catch(console.error);
      }
    }
  };

  const updateSaleBillingInfo = (
    saleId: string,
    billingInfo: CustomerBillingInfo,
    markStatus?: ElectronicInvoiceStatus
  ): SaleReceipt | undefined => {
    const nowIso = new Date().toISOString();
    const normalized = normalizeBillingInfo({
      ...billingInfo,
      requiresElectronicInvoice: true
    });
    let updatedReceipt: SaleReceipt | undefined;

    const nextSales = salesRef.current.map((s) => {
      if (s.id !== saleId) return s;
      const nextStatus: ElectronicInvoiceStatus =
        markStatus || (s.electronicInvoiceStatus === 'emitida' ? 'emitida' : 'pendiente');
      updatedReceipt = {
        ...s,
        customerName: normalized.customerName,
        customerDocumentType: normalized.documentType,
        customerDocumentNumber: normalized.documentNumber,
        customerEmail: normalized.email || s.customerEmail || '',
        requiresElectronicInvoice: true,
        electronicInvoiceStatus: nextStatus,
        electronicInvoiceIssuedAt:
          nextStatus === 'emitida'
            ? s.electronicInvoiceIssuedAt || nowIso
            : '',
        billingInfo: normalized
      };
      return updatedReceipt;
    });

    if (!updatedReceipt) return undefined;

    salesRef.current = nextSales;
    setSales(nextSales);
    setLatestReceipt((prev) => (prev && prev.id === saleId ? updatedReceipt! : prev));
    persistChanges(
      tablesRef.current,
      productsRef.current,
      nextSales,
      perishablesRef.current,
      suppliersRef.current
    );
    if (activeUid && activeUid !== 'default') {
      saveSaleToFirestore(updatedReceipt, activeUid).catch(console.error);
    }
    return updatedReceipt;
  };

  const syncNow = () => {
    setCloudStatus('syncing');
    persistChanges(tablesRef.current, productsRef.current, salesRef.current, perishablesRef.current, suppliersRef.current);
    setTimeout(() => setCloudStatus('synced'), 400);
  };

  const resetToDemoData = () => {
    localStorage.removeItem('appgenerica_data_v1');
    const fresh = loadStoredData(storeId);
    setTables(fresh.tables);
    setProducts(fresh.products);
    setSales(fresh.sales);
    setPerishables(fresh.perishables || []);
    setSuppliers(fresh.suppliers || []);
    setSupplierOrders(fresh.supplierOrders || []);
  };

  return (
    <AppContext.Provider
      value={{
        config,
        updateConfig,
        tables,
        products,
        perishables,
        suppliers,
        supplierOrders,
        sales,
        cloudStatus,
        theme,
        toggleTheme,
        addTable,
        updateTable,
        deleteTable,
        setTableStatus,
        callWaiter,
        dismissWaiterCall,
        selectedTableId,
        setSelectedTableId,
        customerViewTableId,
        setCustomerViewTableId,
        addItemToOrder,
        addItemsToOrder,
        updateOrderItemQuantity,
        removeOrderItem,
        updateOrderModifiers,
        updateOrderBillingInfo,
        checkoutTable,
        cobrarMesa,
        eliminarProducto,
        updateElectronicInvoiceStatus,
        bulkUpdateElectronicInvoiceStatus,
        updateSaleBillingInfo,
        addProduct,
        updateProduct,
        deleteProduct,
        reorderProducts,
        adjustProductStock,
        addPerishable,
        updatePerishable,
        deletePerishable,
        adjustPerishableQuantity,
        recordPerishableWaste,
        recordPerishableRestock,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        addSupplierOrder,
        updateSupplierOrder,
        confirmSupplierOrderDelivery,
        deleteSupplierOrder,
        latestReceipt,
        setLatestReceipt,
        newOrderNotification,
        dismissNewOrderNotification,
        canAddTable,
        canAddProduct,
        loadFullSalesHistory,
        syncNow,
        resetToDemoData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
