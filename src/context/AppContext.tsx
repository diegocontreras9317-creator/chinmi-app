import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Table, Product, SaleReceipt, TableStatus, Order, OrderItem, PaymentMethod, CloudSyncStatus, PerishableItem } from '../types';
import { defaultAppConfig, AppConfig } from '../config/appConfig';
import { loadStoredData, saveStoredData, subscribeToSyncChannel, fetchCloudState, pushCloudState, mergeAppState } from '../services/storage';
import {
  fetchUserFirestoreData,
  saveUserFirestoreData,
  subscribeUserTables,
  subscribeUserOrders,
  subscribeUserMenu,
  subscribeUserInventory,
  subscribeUserSales,
  saveTableToFirestore,
  saveOrderToFirestore,
  syncTableOrderToFirestore,
  deleteTableFromFirestore,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveInventoryItemToFirestore,
  deleteInventoryItemFromFirestore,
  saveSaleToFirestore,
  releaseTableInFirestore
} from '../services/firestoreUserStorage';
import { useAuth } from './AuthContext';
import { auth } from '../firebase';
import { playServiceBell } from '../utils/audioAlert';

interface AppContextType {
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  tables: Table[];
  products: Product[];
  perishables: PerishableItem[];
  sales: SaleReceipt[];
  cloudStatus: CloudSyncStatus;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  
  // Table operations
  addTable: (table: Omit<Table, 'id' | 'status'>) => { success: boolean; error?: string };
  updateTable: (id: string, partial: Partial<Table>) => void;
  deleteTable: (id: string) => void;
  setTableStatus: (tableId: string, status: TableStatus) => void;
  callWaiter: (tableId: string, type: 'waiter' | 'bill', message?: string) => void;
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
  checkoutTable: (tableId: string, paymentMethod: PaymentMethod, cashTendered?: number) => { success: boolean; receipt?: SaleReceipt };
  
  // Product & Inventory operations
  addProduct: (product: Omit<Product, 'id'> & { id?: string }) => { success: boolean; error?: string };
  updateProduct: (id: string, partial: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustProductStock: (id: string, delta: number) => void;

  // Perishables & Fresh Produce operations (Verduras, Frutas, Insumos Bar & Cocina)
  addPerishable: (item: Omit<PerishableItem, 'id'>) => { success: boolean; error?: string };
  updatePerishable: (id: string, partial: Partial<PerishableItem>) => void;
  deletePerishable: (id: string) => void;
  adjustPerishableQuantity: (id: string, newQuantity: number) => void;
  recordPerishableWaste: (id: string, amount: number, reason: string) => void;
  recordPerishableRestock: (id: string, addedAmount: number, newEntryDate?: string, newExpiryDate?: string) => void;

  // Receipt inspection
  latestReceipt: SaleReceipt | null;
  setLatestReceipt: (receipt: SaleReceipt | null) => void;

  // Limits
  canAddTable: () => boolean;
  canAddProduct: () => boolean;

  // Manual Cloud Sync Trigger
  syncNow: () => void;
  resetToDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
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
      const saved = localStorage.getItem('appgenerica_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [tables, setTables] = useState<Table[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [perishables, setPerishables] = useState<PerishableItem[]>([]);
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

  useEffect(() => { tablesRef.current = tables; }, [tables]);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { salesRef.current = sales; }, [sales]);
  useEffect(() => { perishablesRef.current = perishables; }, [perishables]);

  // Active UID from Firebase auth
  const activeUid = auth.currentUser?.uid || user?.id;
  const storeId = activeUid || 'default';

  // Ref to track active waiter calls across real-time snapshots to play chime alert for staff
  const prevWaiterCallsRef = React.useRef<Record<string, string>>({});
  // Ref para tracking de mutaciones locales optimistas recientes y evitar rebotes de onSnapshot
  const lastLocalTableMutations = React.useRef<Record<string, number>>({});

  // Real-time Firestore Subscriptions for authenticated UID
  useEffect(() => {
    if (!activeUid || activeUid === 'default') {
      setTables([]);
      setProducts([]);
      setPerishables([]);
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
      const mergedTables = currentTables.map(tbl => {
        const lastMutationTime = lastLocalTableMutations.current[tbl.id];
        if (lastMutationTime && now - lastMutationTime < 1500) {
          return tbl;
        }

        const matchingOrder = (activeOrders || []).find(o => o.tableId === tbl.id || o.tableName === tbl.name);
        if (matchingOrder && matchingOrder.items && matchingOrder.items.length > 0) {
          if (!tbl.order || (matchingOrder.lastUpdatedAt && (!tbl.order.lastUpdatedAt || matchingOrder.lastUpdatedAt > tbl.order.lastUpdatedAt))) {
            hasChanges = true;
            return {
              ...tbl,
              status: (tbl.status === 'libre' ? 'ocupada' : tbl.status) as TableStatus,
              order: matchingOrder
            };
          }
        } else if (!matchingOrder && tbl.order) {
          // Si la comanda ya no está activa en Firestore (fue cobrada/cancelada en otro dispositivo)
          hasChanges = true;
          return {
            ...tbl,
            status: 'libre' as TableStatus,
            order: undefined
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
      productsRef.current = newProducts;
      setProducts(newProducts);
      setCloudStatus('synced');
    });

    const unsubInventory = subscribeUserInventory(activeUid, (newPerishables) => {
      perishablesRef.current = newPerishables;
      setPerishables(newPerishables);
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
      unsubSales();
    };
  }, [activeUid]);

  // Helper to persist to Firestore
  const persistChanges = useCallback((
    newTables: Table[],
    newProducts: Product[],
    newSales: SaleReceipt[],
    newPerishables?: PerishableItem[]
  ) => {
    if (!activeUid || activeUid === 'default') return;
    setCloudStatus('syncing');
    saveUserFirestoreData(activeUid, {
      tables: newTables,
      products: newProducts,
      perishables: newPerishables ?? perishables,
      sales: newSales,
      version: 2,
      lastModified: new Date().toISOString()
    }).catch(() => {});
    setTimeout(() => { setCloudStatus('synced'); }, 300);
  }, [activeUid, perishables]);

  const updateConfig = (partial: Partial<AppConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...partial };
      localStorage.setItem('appgenerica_custom_config', JSON.stringify(updated));
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
    persistChanges(nextTables, products, sales);
    return { success: true };
  };

  const updateTable = (id: string, partial: Partial<Table>) => {
    const nextTables = tablesRef.current.map(tbl => tbl.id === id ? { ...tbl, ...partial } : tbl);
    tablesRef.current = nextTables;
    setTables(nextTables);
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
    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      return {
        ...tbl,
        status,
        updatedAt: new Date().toISOString()
      };
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    persistChanges(nextTables, products, sales);
  };

  const callWaiter = (tableId: string, type: 'waiter' | 'bill', message?: string) => {
    // Play audible service bell in the app
    playServiceBell(type);

    const nowIso = new Date().toISOString();
    const callKey = `${tableId}_${type}_${nowIso}`;
    prevWaiterCallsRef.current[tableId] = callKey;

    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      return {
        ...tbl,
        status: type === 'bill' ? ('cuenta' as TableStatus) : tbl.status,
        updatedAt: nowIso,
        waiterCall: {
          type,
          requestedAt: nowIso,
          message: message || (type === 'bill' ? 'Cliente solicita la cuenta' : 'Cliente solicita atención en mesa')
        }
      };
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
    persistChanges(nextTables, products, sales);
  };

  const dismissWaiterCall = (tableId: string) => {
    delete prevWaiterCallsRef.current[tableId];

    const nextTables = tablesRef.current.map(tbl => {
      if (tbl.id !== tableId) return tbl;
      return {
        ...tbl,
        waiterCall: null,
        updatedAt: new Date().toISOString()
      };
    });
    tablesRef.current = nextTables;
    setTables(nextTables);
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

      let updatedItems: OrderItem[];
      if (existingItemIndex > -1) {
        updatedItems = existingOrder.items.map((item, idx) => {
          if (idx === existingItemIndex) {
            return {
              ...item,
              quantity: item.quantity + quantity
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
          addedAt: new Date().toISOString()
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
        const existingIndex = currentItems.findIndex(
          it => it.productId === toAdd.product.id && (it.notes || '') === (toAdd.notes || '')
        );

        if (existingIndex > -1) {
          currentItems[existingIndex] = {
            ...currentItems[existingIndex],
            quantity: currentItems[existingIndex].quantity + toAdd.quantity,
            customerName: toAdd.customerName || currentItems[existingIndex].customerName,
            orderedBy: toAdd.orderedBy || currentItems[existingIndex].orderedBy
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
            customerName: toAdd.customerName?.trim() || undefined
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

  const checkoutTable = (
    tableId: string,
    paymentMethod: PaymentMethod,
    cashTendered?: number
  ): { success: boolean; receipt?: SaleReceipt } => {
    const table = tablesRef.current.find(t => t.id === tableId);
    const order = table?.order;
    const items = order?.items || (order as any)?.productos || [];
    if (!table || !order || items.length === 0) {
      return { success: false };
    }

    const subtotal = (items || []).reduce((acc: number, item: any) => {
      const price = Number(item?.unitPrice ?? item?.price ?? 0) || 0;
      const qty = Number(item?.quantity ?? item?.cantidad ?? 0) || 0;
      return acc + price * qty;
    }, 0);
    const discountPercent = Number(order.discountPercent) || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const taxableBase = subtotal - discountAmount;
    const taxPercent = Number(order.taxPercent ?? config.defaultTaxRate) || 0;
    const taxAmount = taxableBase * (taxPercent / 100);
    const tipAmount = Number(order.tipAmount) || 0;
    const total = taxableBase + taxAmount + tipAmount;

    let change: number | undefined = undefined;
    if (paymentMethod === 'efectivo' && cashTendered !== undefined) {
      change = Math.max(0, cashTendered - total);
    }

    const receipt: SaleReceipt = {
      id: `tick-${Date.now()}`,
      orderId: order.id,
      tableName: table.name,
      items: [...order.items],
      subtotal: Math.round(subtotal),
      taxAmount: Math.round(taxAmount),
      taxPercent: order.taxPercent,
      discountAmount: Math.round(discountAmount),
      discountPercent: order.discountPercent,
      tipAmount: Math.round(order.tipAmount),
      total: Math.round(total),
      paymentMethod,
      cashTendered: cashTendered ? Math.round(cashTendered) : undefined,
      change: change !== undefined ? Math.round(change) : undefined,
      timestamp: new Date().toISOString(),
      cashierName: user?.name || 'Cajero'
    };

    // 1. Decrement inventory stock automatically
    const nextProducts = products.map(prod => {
      const soldItem = order.items.find(item => item.productId === prod.id);
      if (soldItem) {
        return {
          ...prod,
          stock: Math.max(0, prod.stock - soldItem.quantity)
        };
      }
      return prod;
    });

    // 2. Free the table and reset active order & waiter calls
    const nowIso = new Date().toISOString();
    delete prevWaiterCallsRef.current[tableId];

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

    // 3. Record sales receipt & persist immediately
    const nextSales = [receipt, ...sales];

    tablesRef.current = nextTables;
    setTables(nextTables);
    setProducts(nextProducts);
    setSales(nextSales);
    setLatestReceipt(receipt);
    persistChanges(nextTables, nextProducts, nextSales);

    // 4. Actualización directa e inmediata en Firestore para liberar la mesa sin desfases
    if (activeUid && activeUid !== 'default') {
      releaseTableInFirestore(tableId, order.id, activeUid).catch(err => {
        console.error('Error liberando mesa en Firestore:', err);
      });
      saveSaleToFirestore(receipt, activeUid).catch(err => {
        console.error('Error guardando venta en Firestore:', err);
      });
    }

    return { success: true, receipt };
  };

  // Product & Inventory operations
  const addProduct = (prodData: Omit<Product, 'id'> & { id?: string }): { success: boolean; error?: string } => {
    if (!canAddProduct()) {
      return {
        success: false,
        error: `Has alcanzado el límite de ${config.freemiumLimits.freeMaxProducts} productos del plan Gratuito. Suscríbete a Pro para catálogo ilimitado.`
      };
    }

    const newProd: Product = {
      ...prodData,
      id: prodData.id || `prod-${Date.now()}`
    };

    const nextProducts = [newProd, ...products];
    setProducts(nextProducts);
    persistChanges(tables, nextProducts, sales);
    return { success: true };
  };

  const updateProduct = (id: string, partial: Partial<Product>) => {
    const nextProducts = products.map(p => p.id === id ? { ...p, ...partial } : p);
    setProducts(nextProducts);
    persistChanges(tables, nextProducts, sales);
  };

  const deleteProduct = (id: string) => {
    const nextProducts = products.filter(p => p.id !== id);
    setProducts(nextProducts);
    deleteProductFromFirestore(id, storeId).catch(() => {});
    persistChanges(tables, nextProducts, sales);
  };

  const adjustProductStock = (id: string, delta: number) => {
    const nextProducts = products.map(p => {
      if (p.id === id) {
        return { ...p, stock: Math.max(0, p.stock + delta) };
      }
      return p;
    });
    setProducts(nextProducts);
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
    persistChanges(tables, products, sales, nextPerishables);
    return { success: true };
  };

  const updatePerishable = (id: string, partial: Partial<PerishableItem>) => {
    const nextPerishables = perishables.map(p => p.id === id ? { ...p, ...partial } : p);
    setPerishables(nextPerishables);
    persistChanges(tables, products, sales, nextPerishables);
  };

  const deletePerishable = (id: string) => {
    const nextPerishables = perishables.filter(p => p.id !== id);
    setPerishables(nextPerishables);
    deleteInventoryItemFromFirestore(id, storeId).catch(() => {});
    persistChanges(tables, products, sales, nextPerishables);
  };

  const adjustPerishableQuantity = (id: string, newQuantity: number) => {
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        return { ...p, quantity: Math.max(0, Number(newQuantity.toFixed(2))) };
      }
      return p;
    });
    setPerishables(nextPerishables);
    persistChanges(tables, products, sales, nextPerishables);
  };

  const recordPerishableWaste = (id: string, amount: number, reason: string) => {
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        const nextQty = Math.max(0, Number((p.quantity - amount).toFixed(2)));
        const noteAddition = ` [Merma: -${amount} ${p.unit} (${reason})]`;
        return {
          ...p,
          quantity: nextQty,
          notes: (p.notes ? p.notes + noteAddition : noteAddition)
        };
      }
      return p;
    });
    setPerishables(nextPerishables);
    persistChanges(tables, products, sales, nextPerishables);
  };

  const recordPerishableRestock = (id: string, addedAmount: number, newEntryDate?: string, newExpiryDate?: string) => {
    const nextPerishables = perishables.map(p => {
      if (p.id === id) {
        return {
          ...p,
          quantity: Number((p.quantity + addedAmount).toFixed(2)),
          entryDate: newEntryDate || p.entryDate,
          expiryDate: newExpiryDate || p.expiryDate
        };
      }
      return p;
    });
    setPerishables(nextPerishables);
    persistChanges(tables, products, sales, nextPerishables);
  };

  const syncNow = () => {
    setCloudStatus('syncing');
    persistChanges(tablesRef.current, productsRef.current, salesRef.current, perishablesRef.current);
    setTimeout(() => setCloudStatus('synced'), 400);
  };

  const resetToDemoData = () => {
    localStorage.removeItem('appgenerica_data_v1');
    const fresh = loadStoredData(storeId);
    setTables(fresh.tables);
    setProducts(fresh.products);
    setSales(fresh.sales);
    setPerishables(fresh.perishables || []);
  };

  return (
    <AppContext.Provider
      value={{
        config,
        updateConfig,
        tables,
        products,
        perishables,
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
        checkoutTable,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustProductStock,
        addPerishable,
        updatePerishable,
        deletePerishable,
        adjustPerishableQuantity,
        recordPerishableWaste,
        recordPerishableRestock,
        latestReceipt,
        setLatestReceipt,
        canAddTable,
        canAddProduct,
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
