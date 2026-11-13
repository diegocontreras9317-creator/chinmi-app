import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  getDoc,
  query,
  where,
  writeBatch,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  Table,
  Product,
  PerishableItem,
  SaleReceipt,
  AppStateData,
  Order,
  OrderItem,
  Empleado,
  Supplier,
  SupplierOrder,
  TableSubaccount,
  TablePaymentRecord,
  PrivateQrBillingRecord,
} from '../types';
import { AppConfig } from '../config/appConfig';
import {
  computeSaleInventoryUpdates,
  normalizePerishableRecord
} from '../utils/recipeUnits';
import { toScaledQuantity } from '../utils/quantityPrecision';
import {
  normalizeEmpleadoRecord,
  normalizeEmpleadoRol,
  normalizeEmployeeEmail,
  sortEmpleados,
} from '../utils/employeeRoles';
import {
  SubaccountCheckoutPlan,
  createTableSubaccount,
  generateTableSessionId,
  computeItemPendingAmount,
  computeItemTotal,
} from '../utils/subaccounts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota')) {
    console.warn(`[Firestore Quota Exceeded] Operación ${operationType} en ${path || 'desconocido'}: Límite de cuota diaria gratuita alcanzado. Los datos continúan guardándose localmente.`);
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

/**
 * Obtiene el UID del dueño del restaurante. Si no hay sesión ni targetUid, retorna null.
 */
export function getActiveUserId(targetUid?: string): string | null {
  if (targetUid && targetUid.trim()) return targetUid.trim();
  if (auth.currentUser) return auth.currentUser.uid;
  return null;
}

/**
 * Escucha en tiempo real las mesas de users/${uid}/mesas
 */
export function subscribeUserTables(uid: string, onUpdate: (tables: Table[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/mesas`;
  const colRef = collection(db, 'users', uid, 'mesas');
  
  return onSnapshot(colRef, (snap) => {
    const tables = snap.docs.map(d => {
      const data = d.data() as Table;
      const order = data.order;
      // Validamos estrictamente que la comanda esté activa para evitar revivir comandas cobradas
      const isOrderActive = Boolean(
        order &&
        (order as any).estado === 'activa' &&
        !(order as any).closed &&
        (order as any).status !== 'pagada' &&
        (order as any).status !== 'cobrado' &&
        Array.isArray(order.items) &&
        order.items.length > 0
      );

      return {
        ...data,
        id: d.id,
        order: isOrderActive ? order : undefined,
        status: isOrderActive ? (data.status === 'libre' ? 'ocupada' : data.status) : (data.status === 'ocupada' ? 'libre' : data.status)
      } as Table;
    });
    onUpdate(tables);
  }, (err) => {
    console.error("ERROR CRÍTICO EN FIREBASE al escuchar mesas (onSnapshot):", err);
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real una sola mesa específica en users/${uid}/mesas/${tableId}
 * Optimización de QR: El cliente escanea su código QR y solo escucha los cambios de su mesa.
 */
export function subscribeSingleTable(uid: string, tableId: string, onUpdate: (table: Table | null) => void): Unsubscribe {
  if (!uid || !tableId) {
    onUpdate(null);
    return () => {};
  }
  const path = `users/${uid}/mesas/${tableId}`;
  const tableRef = doc(db, 'users', uid, 'mesas', tableId);

  return onSnapshot(tableRef, (docSnap) => {
    if (!docSnap.exists()) {
      onUpdate(null);
      return;
    }
    const data = docSnap.data() as Table;
    const order = data.order;
    const isOrderActive = Boolean(
      order &&
      (order as any).estado === 'activa' &&
      !(order as any).closed &&
      (order as any).status !== 'pagada' &&
      (order as any).status !== 'cobrado' &&
      Array.isArray(order.items) &&
      order.items.length > 0
    );

    onUpdate({
      ...data,
      id: docSnap.id,
      order: isOrderActive ? order : undefined,
      status: isOrderActive ? (data.status === 'libre' ? 'ocupada' : data.status) : (data.status === 'ocupada' ? 'libre' : data.status)
    } as Table);
  }, (err) => {
    console.error("ERROR CRÍTICO EN FIREBASE al escuchar mesa individual (onSnapshot):", err);
    handleFirestoreError(err, OperationType.GET, path);
    onUpdate(null);
  });
}

/**
 * Escucha en tiempo real el menú/productos de users/${uid}/menu
 */
export function subscribeUserMenu(uid: string, onUpdate: (products: Product[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/menu`;
  const colRefMenu = collection(db, 'users', uid, 'menu');

  return onSnapshot(colRefMenu, (snap) => {
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
    onUpdate(products);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real el inventario/insumos de users/${uid}/inventario
 */
export function subscribeUserInventory(uid: string, onUpdate: (items: PerishableItem[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/inventario`;
  const colRef = collection(db, 'users', uid, 'inventario');

  return onSnapshot(colRef, (snap) => {
    const items = snap.docs.map(d => normalizePerishableRecord({ id: d.id, ...d.data() } as PerishableItem));
    onUpdate(items);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real los proveedores de despensa de users/${uid}/proveedores
 */
export function subscribeUserSuppliers(uid: string, onUpdate: (suppliers: Supplier[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/proveedores`;
  const colRef = collection(db, 'users', uid, 'proveedores');

  return onSnapshot(colRef, (snap) => {
    const suppliers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
    onUpdate(suppliers);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real el registro de pedidos a distribuidores de users/${uid}/ordenes_proveedores
 */
export function subscribeUserSupplierOrders(uid: string, onUpdate: (orders: SupplierOrder[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/ordenes_proveedores`;
  const colRef = collection(db, 'users', uid, 'ordenes_proveedores');

  return onSnapshot(colRef, (snap) => {
    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as SupplierOrder))
      .sort((a, b) => (b.orderedAt || '').localeCompare(a.orderedAt || ''));
    onUpdate(orders);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real los pedidos activos de users/${uid}/pedidos.
 * Utiliza estrictamente query(..., where("estado", "==", "activa")) para que cuando una comanda
 * sea cobrada (updateDoc con estado: "pagada"), Firestore la retire automáticamente del snapshot
 * en tiempo real y no reviva en la pantalla.
 */
export function subscribeUserOrders(uid: string, onUpdate: (orders: Order[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/pedidos`;
  const colRef = collection(db, 'users', uid, 'pedidos');
  const q = query(colRef, where("estado", "==", "activa"));

  return onSnapshot(q, (snap) => {
    const orders: Order[] = [];
    snap.docs.forEach(d => {
      const data = d.data();
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.productos) ? data.productos : []);
      
      // Validación estricta: solo órdenes con estado activa, no cerradas y con productos
      if (data.estado === 'activa' && !data.closed && items.length > 0) {
        orders.push({
          id: d.id,
          ...data,
          items,
          status: 'activa',
          estado: 'activa'
        } as unknown as Order);
      }
    });
    console.log(`[Firestore onSnapshot] Comandas activas recibidas (${orders.length}):`, orders.map(o => o.id));
    onUpdate(orders);
  }, (err) => {
    console.error("ERROR CRÍTICO EN FIREBASE al escuchar comandas activas (onSnapshot):", err);
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real el historial de ventas recientes de users/${uid}/ventas.
 * Limita el listener en tiempo real a las 100 ventas más recientes para evitar lecturas masivas.
 */
export function subscribeUserSales(uid: string, onUpdate: (sales: SaleReceipt[]) => void, limitCount = 100): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/ventas`;
  const colRef = collection(db, 'users', uid, 'ventas');
  const q = query(colRef, orderBy('timestamp', 'desc'), limit(limitCount));

  return onSnapshot(q, (snap) => {
    const sales = snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
    onUpdate(sales);
  }, (err) => {
    console.warn('[subscribeUserSales] Fallback listener por falta de índice u ordenamiento:', err);
    const qFallback = query(colRef, limit(limitCount));
    return onSnapshot(qFallback, (snap) => {
      const sales = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SaleReceipt))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      onUpdate(sales);
    }, (err2) => {
      handleFirestoreError(err2, OperationType.LIST, path);
      onUpdate([]);
    });
  });
}

/**
 * Obtiene las mesas de forma síncrona/única desde users/${uid}/mesas
 */
export async function getUserTables(targetUid?: string): Promise<Table[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/mesas`;
  try {
    const colRef = collection(db, 'users', uid, 'mesas');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => {
      const data = d.data() as Table;
      const order = data.order;
      const isOrderActive = Boolean(
        order &&
        (order as any).estado === 'activa' &&
        !(order as any).closed &&
        (order as any).status !== 'pagada' &&
        (order as any).status !== 'cobrado' &&
        Array.isArray(order.items) &&
        order.items.length > 0
      );

      return {
        ...data,
        id: d.id,
        order: isOrderActive ? order : undefined,
        status: isOrderActive ? (data.status === 'libre' ? 'ocupada' : data.status) : (data.status === 'ocupada' ? 'libre' : data.status)
      } as Table;
    });
  } catch (err) {
    console.error("ERROR CRÍTICO EN FIREBASE en getUserTables:", err);
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Obtiene el menú/productos desde users/${uid}/menu y users/${uid}/productos
 */
export async function getUserProducts(targetUid?: string): Promise<Product[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/menu`;
  try {
    const colRefMenu = collection(db, 'users', uid, 'menu');
    const snapMenu = await getDocs(colRefMenu);
    if (!snapMenu.empty) {
      return snapMenu.docs.map(d => ({ id: d.id, ...d.data() } as Product));
    }

    const colRefProds = collection(db, 'users', uid, 'productos');
    const snapProds = await getDocs(colRefProds);
    if (!snapProds.empty) {
      return snapProds.docs.map(d => ({ id: d.id, ...d.data() } as Product));
    }
    return [];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Obtiene el inventario/insumos desde users/${uid}/inventario
 */
export async function getUserInventory(targetUid?: string): Promise<PerishableItem[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/inventario`;
  try {
    const colRef = collection(db, 'users', uid, 'inventario');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => normalizePerishableRecord({ id: d.id, ...d.data() } as PerishableItem));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Obtiene el historial de ventas desde users/${uid}/ventas
 */
export async function getUserSales(targetUid?: string): Promise<SaleReceipt[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/ventas`;
  try {
    const colRefVentas = collection(db, 'users', uid, 'ventas');
    const snapVentas = await getDocs(colRefVentas);
    if (!snapVentas.empty) {
      return snapVentas.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
    }
    return [];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function getUserSuppliers(targetUid?: string): Promise<Supplier[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/proveedores`;
  try {
    const colRef = collection(db, 'users', uid, 'proveedores');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function getUserSupplierOrders(targetUid?: string): Promise<SupplierOrder[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/ordenes_proveedores`;
  try {
    const colRef = collection(db, 'users', uid, 'ordenes_proveedores');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as SupplierOrder))
      .sort((a, b) => (b.orderedAt || '').localeCompare(a.orderedAt || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Carga completa del estado desde las subcolecciones del usuario en Firestore.
 * Si no hay sesión activa o es un restaurante nuevo, retorna arreglos vacíos [].
 */
export async function fetchUserFirestoreData(targetUid?: string): Promise<AppStateData> {
  const uid = getActiveUserId(targetUid);
  if (!uid) {
    return {
      tables: [],
      products: [],
      perishables: [],
      suppliers: [],
      sales: [],
      version: 2,
      lastModified: new Date().toISOString()
    };
  }

  const [tables, products, perishables, suppliers, sales] = await Promise.all([
    getUserTables(uid),
    getUserProducts(uid),
    getUserInventory(uid),
    getUserSuppliers(uid),
    getUserSales(uid)
  ]);

  return {
    tables,
    products,
    perishables,
    suppliers,
    sales,
    version: 2,
    lastModified: new Date().toISOString()
  };
}

/**
 * Sincronización completa de datos en las subcolecciones aisladas del usuario
 */
export async function saveUserFirestoreData(targetUid: string | undefined, data: AppStateData): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return;

  try {
    // Sincronizar Mesas y sus Pedidos
    for (const tbl of data.tables || []) {
      if (tbl.id) {
        const hasActiveOrder = Boolean(tbl.order && Array.isArray(tbl.order.items) && tbl.order.items.length > 0);
        const cleanOrder = (hasActiveOrder && tbl.order) ? sanitizeForFirestore({
          ...tbl.order,
          userId: uid,
          status: 'activa',
          estado: 'activa',
          closed: false,
          productos: tbl.order.items
        }) : null;

        const cleanTable = {
          ...tbl,
          userId: uid,
          status: tbl.status || (hasActiveOrder ? 'ocupada' : 'libre'),
          estado: tbl.status || (hasActiveOrder ? 'ocupada' : 'libre'),
          order: cleanOrder,
          currentOrder: cleanOrder,
          pedidoActual: cleanOrder,
          waiterCall: tbl.waiterCall ? sanitizeForFirestore(tbl.waiterCall) : null
        };
        await setDoc(doc(db, 'users', uid, 'mesas', tbl.id), cleanTable);
        if (cleanOrder && cleanOrder.id) {
          await setDoc(doc(db, 'users', uid, 'pedidos', cleanOrder.id), cleanOrder);
        }
      }
    }

    // Sincronizar Menú / Productos
    for (const prod of data.products || []) {
      if (prod.id) {
        const cleanProd = sanitizeForFirestore({ ...prod, userId: uid });
        await setDoc(doc(db, 'users', uid, 'menu', prod.id), cleanProd, { merge: true });
        await setDoc(doc(db, 'users', uid, 'productos', prod.id), cleanProd, { merge: true });
      }
    }

    // Sincronizar Inventario / Insumos
    for (const per of data.perishables || []) {
      if (per.id) {
        const cleanPer = normalizePerishableRecord(per);
        await setDoc(doc(db, 'users', uid, 'inventario', per.id), sanitizeForFirestore({ ...cleanPer, userId: uid }), { merge: true });
      }
    }

    // Sincronizar Proveedores de Despensa
    for (const sup of data.suppliers || []) {
      if (sup.id) {
        await setDoc(doc(db, 'users', uid, 'proveedores', sup.id), sanitizeForFirestore({ ...sup, userId: uid }), { merge: true });
      }
    }

    // Sincronizar Ventas exclusivamente en users/${uid}/ventas
    for (const sale of data.sales || []) {
      if (sale.id) {
        const cleanSale = sanitizeForFirestore({ ...sale, userId: uid });
        await setDoc(doc(db, 'users', uid, 'ventas', sale.id), cleanSale, { merge: true });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

/**
 * Sanitiza recursivamente cualquier objeto antes de enviarlo a Firestore.
 * Convierte valores 'undefined' a '' o elimina campos undefined para evitar:
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return (null as unknown) as T;
  }
  return JSON.parse(JSON.stringify(data, (_, value) => {
    return value === undefined ? '' : value;
  }));
}

const cleanOrderItemForFirestore = (it: OrderItem, nowIso: string): Record<string, any> => ({
  id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  productId: it.productId || '',
  name: it.name || 'Producto',
  unitPrice: Number(it.unitPrice) || 0,
  quantity: Number(it.quantity) || 1,
  notes: it.notes?.trim() || '',
  addedAt: it.addedAt || nowIso,
  customerName: it.customerName?.trim() || '',
  orderedBy: it.orderedBy || 'camarero',
  ...(it.taxType ? { taxType: it.taxType } : {}),
  ...(it.taxRate !== undefined && !Number.isNaN(Number(it.taxRate)) ? { taxRate: Number(it.taxRate) } : {}),
  ...(it.subaccountId ? { subaccountId: it.subaccountId } : {}),
  ...(it.subaccountName ? { subaccountName: it.subaccountName } : {}),
  ...(it.isShared !== undefined ? { isShared: Boolean(it.isShared) } : {}),
  ...(Array.isArray(it.allocations) && it.allocations.length > 0 ? { allocations: it.allocations } : {}),
  ...(it.inventoryDeducted !== undefined ? { inventoryDeducted: Boolean(it.inventoryDeducted) } : {}),
  ...(it.paidAmount !== undefined && !Number.isNaN(Number(it.paidAmount)) ? { paidAmount: Number(it.paidAmount) } : {}),
  ...(it.paidQuantity !== undefined && !Number.isNaN(Number(it.paidQuantity)) ? { paidQuantity: Number(it.paidQuantity) } : {}),
});

/**
 * Guarda o actualiza una comanda en Firestore.
 * Reemplaza completamente el documento en pedidos para evitar que queden items viejos o campos sucios.
 */
export async function saveOrderToFirestore(order: Order, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !order.id) return;
  const path = `users/${uid}/pedidos/${order.id}`;
  const nowIso = new Date().toISOString();
  try {
    const isClosed = Boolean(
      order.closed ||
      order.estado === 'pagada' ||
      order.status === 'pagada' ||
      order.estado === 'cancelada' ||
      order.status === 'cancelada'
    );

    const cleanItems = (order.items || []).map(it => cleanOrderItemForFirestore(it, nowIso));

    const cleanOrder = sanitizeForFirestore({
      ...order,
      userId: uid,
      items: isClosed ? [] : cleanItems,
      productos: isClosed ? [] : cleanItems,
      status: isClosed ? (order.status || 'pagada') : 'activa',
      estado: isClosed ? (order.estado || 'pagada') : 'activa',
      closed: isClosed,
      lastUpdatedAt: nowIso
    });
    await setDoc(doc(db, 'users', uid, 'pedidos', order.id), cleanOrder, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Sincroniza atómicamente el estado de comanda de una mesa tanto en 'mesas' como en 'pedidos'.
 * Si la comanda queda sin productos, libera la mesa y marca el pedido como cerrado/cancelado.
 */
export async function syncTableOrderToFirestore(
  tableId: string,
  order: Order | null | undefined,
  targetUid?: string
): Promise<void> {
  if (!tableId || typeof tableId !== 'string') {
    console.error("ERROR CRÍTICO: tableId es undefined o inválido en syncTableOrderToFirestore:", tableId);
    throw new Error("syncTableOrderToFirestore abortado: ID de la mesa es undefined");
  }

  const uid = getActiveUserId(targetUid);
  if (!uid) {
    console.error("ERROR CRÍTICO: No se pudo resolver el UID de usuario para Firestore");
    throw new Error("syncTableOrderToFirestore abortado: UID de usuario no autenticado");
  }
  const nowIso = new Date().toISOString();

  const isOrderActive = Boolean(
    order &&
    !order.closed &&
    order.estado !== 'pagada' &&
    order.status !== 'pagada' &&
    order.estado !== 'cancelada' &&
    order.status !== 'cancelada' &&
    Array.isArray(order.items) &&
    order.items.length > 0
  );

  if (isOrderActive && order) {
    if (!order.id) {
      console.error("ERROR CRÍTICO: order.id es undefined en syncTableOrderToFirestore");
      throw new Error("syncTableOrderToFirestore abortado: ID del pedido es undefined");
    }

    const cleanItems = order.items.map(it => cleanOrderItemForFirestore(it, nowIso));

    const cleanOrder = sanitizeForFirestore({
      ...order,
      userId: uid,
      tableSessionId: order.tableSessionId || order.id,
      items: cleanItems,
      productos: cleanItems,
      status: 'activa',
      estado: 'activa',
      closed: false,
      lastUpdatedAt: nowIso
    });

    // 1. Guardar en pedidos sobreescribiendo limpiamente
    console.log("Intentando actualizar doc con ID:", order.id, "Datos:", cleanOrder);
    try {
      const pedidoDocRef = doc(db, 'users', uid, 'pedidos', order.id);
      await setDoc(pedidoDocRef, cleanOrder);
      console.log("Éxito al guardar comanda activa en Firebase con ID:", order.id);
    } catch (error) {
      console.error("ERROR CRÍTICO EN FIREBASE:", error);
      throw error;
    }

    // 2. Actualizar la mesa en mesas
    const tableUpdateData = sanitizeForFirestore({
      id: tableId,
      status: 'ocupada',
      estado: 'ocupada',
      tableSessionId: cleanOrder.tableSessionId,
      ...(Array.isArray(order.subaccounts) ? { subaccounts: order.subaccounts } : {}),
      order: cleanOrder,
      currentOrder: cleanOrder,
      pedidoActual: cleanOrder,
      updatedAt: nowIso,
      userId: uid
    });
    console.log("Intentando actualizar doc con ID:", tableId, "Datos:", tableUpdateData);
    try {
      const mesaDocRef = doc(db, 'users', uid, 'mesas', tableId);
      await setDoc(mesaDocRef, tableUpdateData, { merge: true });
      console.log("Éxito al actualizar mesa en Firebase con ID:", tableId);
    } catch (error) {
      console.error("ERROR CRÍTICO EN FIREBASE:", error);
      throw error;
    }
  } else {
    // No hay ítems en la comanda (o fue vaciada / eliminada por completo o ya está pagada)
    const tableFreeData = sanitizeForFirestore({
      id: tableId,
      status: 'libre',
      estado: 'libre',
      order: null,
      currentOrder: null,
      pedidoActual: null,
      updatedAt: nowIso,
      userId: uid
    });
    console.log("Intentando actualizar doc con ID:", tableId, "Datos:", tableFreeData);
    try {
      const mesaDocRef = doc(db, 'users', uid, 'mesas', tableId);
      await setDoc(mesaDocRef, tableFreeData, { merge: true });
      console.log("Éxito al liberar mesa en Firebase con ID:", tableId);
    } catch (error) {
      console.error("ERROR CRÍTICO EN FIREBASE:", error);
      throw error;
    }

    if (order?.id) {
      const isAlreadyPaid = order.closed || order.estado === 'pagada' || order.status === 'pagada';
      const orderClosedData = sanitizeForFirestore({
        status: isAlreadyPaid ? 'pagada' : 'cancelada',
        estado: isAlreadyPaid ? 'pagada' : 'cancelada',
        closed: true,
        closedAt: nowIso,
        items: [],
        productos: []
      });
      console.log("Intentando actualizar doc con ID:", order.id, "Datos:", orderClosedData);
      try {
        const orderDocRef = doc(db, 'users', uid, 'pedidos', order.id);
        await updateDoc(orderDocRef, orderClosedData);
        console.log("Éxito al cambiar estado comanda en Firebase con ID:", order.id);
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE al hacer updateDoc:", error);
        try {
          const orderDocRef = doc(db, 'users', uid, 'pedidos', order.id);
          await setDoc(orderDocRef, orderClosedData, { merge: true });
        } catch (setErr) {
          console.error("ERROR CRÍTICO EN FIREBASE (fallback setDoc):", setErr);
          throw setErr;
        }
      }
    }
  }
}

export async function saveTableToFirestore(table: Table, targetUid?: string): Promise<void> {
  if (!table || !table.id) {
    console.error("ERROR CRÍTICO: table o table.id es undefined en saveTableToFirestore:", table);
    throw new Error("saveTableToFirestore abortado: ID de la mesa es undefined");
  }

  const uid = getActiveUserId(targetUid);
  if (!uid) {
    console.error("ERROR CRÍTICO: No se pudo resolver UID en saveTableToFirestore");
    throw new Error("saveTableToFirestore abortado: UID no autenticado");
  }

  const isOrderActive = Boolean(
    table.order &&
    !table.order.closed &&
    table.order.estado !== 'pagada' &&
    table.order.status !== 'pagada' &&
    table.order.estado !== 'cancelada' &&
    table.order.status !== 'cancelada' &&
    Array.isArray(table.order.items) &&
    table.order.items.length > 0
  );

  const cleanTable = sanitizeForFirestore({
    ...table,
    userId: uid,
    status: table.status || (isOrderActive ? 'ocupada' : 'libre'),
    estado: table.status || (isOrderActive ? 'ocupada' : 'libre'),
    order: isOrderActive ? table.order : null,
    currentOrder: isOrderActive ? table.order : null,
    pedidoActual: isOrderActive ? table.order : null,
    waiterCall: table.waiterCall || null
  });

  console.log("Intentando actualizar doc con ID:", table.id, "Datos:", cleanTable);
  try {
    const tableRef = doc(db, 'users', uid, 'mesas', table.id);
    await setDoc(tableRef, cleanTable, { merge: true });
    console.log("Éxito al guardar mesa con ID:", table.id);
  } catch (error) {
    console.error("ERROR CRÍTICO EN FIREBASE:", error);
    throw error;
  }

  if (isOrderActive && table.order) {
    await saveOrderToFirestore(table.order, uid);
  }
}

/**
 * Libera una mesa tras el cobro o pago exitoso en Firestore.
 * Actualiza el estado de la mesa a 'libre', establece el pedidoActual/order a null,
 * limpia las alertas de mesero y marca la comanda activa como cerrada/cobrada.
 */
export async function releaseTableInFirestore(
  tableId: string,
  orderId?: string,
  targetUid?: string
): Promise<void> {
  if (!tableId || typeof tableId !== 'string') {
    console.error("ERROR CRÍTICO: tableId es undefined en releaseTableInFirestore:", tableId);
    throw new Error("releaseTableInFirestore abortado: ID de la mesa es undefined");
  }

  const uid = getActiveUserId(targetUid);
  if (!uid) {
    console.error("ERROR CRÍTICO: No se pudo resolver UID en releaseTableInFirestore");
    throw new Error("releaseTableInFirestore abortado: UID no autenticado");
  }

  const nowIso = new Date().toISOString();

  // 1. Actualización inmediata del documento de la mesa
  const tableFreeData = sanitizeForFirestore({
    id: tableId,
    status: 'libre',
    estado: 'libre',
    order: null,
    currentOrder: null,
    pedidoActual: null,
    waiterCall: null,
    updatedAt: nowIso,
    userId: uid
  });

  console.log("Intentando actualizar doc con ID:", tableId, "Datos:", tableFreeData);
  try {
    const tableRef = doc(db, 'users', uid, 'mesas', tableId);
    await setDoc(tableRef, tableFreeData, { merge: true });
    console.log("Éxito al liberar mesa en Firebase con ID:", tableId);
  } catch (error) {
    console.error("ERROR CRÍTICO EN FIREBASE:", error);
    throw error;
  }

  // 2. Marcar la comanda/pedido como cerrada para que no reviva
  if (orderId) {
    if (!orderId || typeof orderId !== 'string') {
      console.error("ERROR CRÍTICO: orderId es undefined en releaseTableInFirestore");
      throw new Error("releaseTableInFirestore abortado: orderId es undefined");
    }

    const orderClosedData = sanitizeForFirestore({
      estado: 'pagada',
      status: 'pagada',
      closed: true,
      closedAt: nowIso,
      items: [],
      productos: [],
      subaccounts: []
    });

    console.log("Intentando actualizar doc con ID:", orderId, "Datos:", orderClosedData);
    try {
      const orderRef = doc(db, 'users', uid, 'pedidos', orderId);
      await updateDoc(orderRef, orderClosedData);
      console.log("Éxito al cambiar estado a 'pagada' con updateDoc en comanda doc con ID:", orderId);
    } catch (error) {
      console.error("ERROR CRÍTICO EN FIREBASE al hacer updateDoc en pedido:", error);
      try {
        const orderRef = doc(db, 'users', uid, 'pedidos', orderId);
        await setDoc(orderRef, orderClosedData, { merge: true });
        console.log("Éxito al cambiar estado a 'pagada' con setDoc en comanda doc con ID:", orderId);
      } catch (setErr) {
        console.error("ERROR CRÍTICO EN FIREBASE (fallback setDoc):", setErr);
        throw setErr;
      }
    }
  }
}

export async function deleteTableFromFirestore(tableId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !tableId) return;
  const path = `users/${uid}/mesas/${tableId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'mesas', tableId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveProductToFirestore(product: Product, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !product.id) return;
  const path = `users/${uid}/menu/${product.id}`;
  try {
    const cleanProd = sanitizeForFirestore({ ...product, userId: uid });
    await setDoc(doc(db, 'users', uid, 'menu', product.id), cleanProd, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, path);
    // Don't crash if quota is exceeded; data is already stored in local storage
    if (err?.code !== 'resource-exhausted' && !String(err?.message || '').includes('Quota')) {
      throw err;
    }
  }
}

export async function deleteProductFromFirestore(productId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !productId) return;
  const path = `users/${uid}/menu/${productId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'menu', productId));
  } catch (err: any) {
    handleFirestoreError(err, OperationType.DELETE, path);
    if (err?.code !== 'resource-exhausted' && !String(err?.message || '').includes('Quota')) {
      throw err;
    }
  }
}

export async function saveInventoryItemToFirestore(item: PerishableItem, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !item.id) return;
  const path = `users/${uid}/inventario/${item.id}`;
  try {
    const cleanItem = normalizePerishableRecord(item);
    await setDoc(
      doc(db, 'users', uid, 'inventario', item.id),
      sanitizeForFirestore({
        ...cleanItem,
        cantidadActual: cleanItem.quantity,
        alertaStockMinimo: cleanItem.minStock,
        userId: uid
      }),
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteInventoryItemFromFirestore(itemId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !itemId) return;
  const path = `users/${uid}/inventario/${itemId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'inventario', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveSupplierToFirestore(supplier: Supplier, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !supplier.id) return;
  const path = `users/${uid}/proveedores/${supplier.id}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'proveedores', supplier.id),
      sanitizeForFirestore({ ...supplier, userId: uid }),
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteSupplierFromFirestore(supplierId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !supplierId) return;
  const path = `users/${uid}/proveedores/${supplierId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'proveedores', supplierId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveSupplierOrderToFirestore(supplierOrder: SupplierOrder, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !supplierOrder.id) return;
  const path = `users/${uid}/ordenes_proveedores/${supplierOrder.id}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'ordenes_proveedores', supplierOrder.id),
      sanitizeForFirestore({ ...supplierOrder, userId: uid }),
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteSupplierOrderFromFirestore(orderId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !orderId) return;
  const path = `users/${uid}/ordenes_proveedores/${orderId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'ordenes_proveedores', orderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveSaleToFirestore(sale: SaleReceipt, targetUid?: string): Promise<void> {
  if (!sale || !sale.id) {
    console.error("ERROR CRÍTICO: sale o sale.id es undefined en saveSaleToFirestore:", sale);
    throw new Error("saveSaleToFirestore abortado: ID de la venta es undefined");
  }

  const uid = getActiveUserId(targetUid);
  if (!uid) {
    console.error("ERROR CRÍTICO: No se pudo resolver UID en saveSaleToFirestore");
    throw new Error("saveSaleToFirestore abortado: UID no autenticado");
  }

  const cleanSale = sanitizeForFirestore({ ...sale, userId: uid });
  console.log("Intentando actualizar doc con ID:", sale.id, "Datos:", cleanSale);
  try {
    const saleRef = doc(db, 'users', uid, 'ventas', sale.id);
    await setDoc(saleRef, cleanSale, { merge: true });
    console.log("Éxito al guardar venta en Firebase con ID:", sale.id);
  } catch (error) {
    console.error("ERROR CRÍTICO EN FIREBASE:", error);
    throw error;
  }
}

export interface SaleBatchResult {
  updatedProducts: Product[];
  updatedPerishables: PerishableItem[];
  lowStockAlerts: Array<{
    insumoId: string;
    nombre: string;
    remaining: number;
    minStock: number;
    isOut: boolean;
  }>;
}

/**
 * Procesa la venta y el descuento de inventario mediante Firestore writeBatch:
 * - Para productos 'directo': descuenta stock de menu/{id} y productos/{id}.
 * - Para productos 'receta': por cada ingrediente en receta, descuenta (insumo.cantidad * soldQty)
 *   del campo cantidadActual y quantity en users/{uid}/inventario/{insumoId} y despensa/{insumoId}.
 * - Si un insumo llega a 0 o por debajo de alertaStockMinimo, se marca hasLowStockAlert en Firestore.
 * - Registra la venta en users/{uid}/ventas/{sale.id}.
 * - Libera la mesa en users/{uid}/mesas/{tableId}.
 * - Cierra la comanda en users/{uid}/pedidos/{orderId}.
 */
export async function executeSaleCheckoutBatch(params: {
  uid: string;
  tableId: string;
  orderId?: string;
  receipt: SaleReceipt;
  orderItems: OrderItem[];
  productsCatalog: Product[];
  perishablesList: PerishableItem[];
}): Promise<SaleBatchResult> {
  const { uid, tableId, orderId, receipt, orderItems, productsCatalog, perishablesList } = params;
  if (!uid) {
    console.error('ERROR CRÍTICO: No se pudo resolver UID en executeSaleCheckoutBatch');
    throw new Error('executeSaleCheckoutBatch abortado: UID no autenticado');
  }

  const batch = writeBatch(db);
  const nowIso = new Date().toISOString();

  // 1-3. Calcular deducciones exactas de insumos, productos directos y porciones de recetas
  const {
    updatedPerishables,
    updatedProducts,
    deductedPerishableIds,
    deductedDirectProductIds,
    recipeProductIds,
    lowStockAlerts
  } = computeSaleInventoryUpdates({
    orderItems,
    productsCatalog,
    perishablesList
  });

  const deductedPerishableSet = new Set(deductedPerishableIds);
  const productIdsToPersist = new Set([...deductedDirectProductIds, ...recipeProductIds]);

  updatedPerishables.forEach((item) => {
    if (!deductedPerishableSet.has(item.id)) return;
    const remaining = item.quantity;
    const minStock = item.minStock;
    const remainingScaled = toScaledQuantity(remaining);
    const minScaled = toScaledQuantity(minStock);
    const isLow = remainingScaled <= minScaled;
    const isOut = remainingScaled <= 0n;

    const invData = sanitizeForFirestore({
      quantity: remaining,
      cantidadActual: remaining,
      alertaStockMinimo: minStock,
      hasLowStockAlert: isLow,
      isOutOfStock: isOut,
      lastUpdated: nowIso
    });

    // Actualizar en users/{uid}/inventario
    const invRef = doc(db, 'users', uid, 'inventario', item.id);
    batch.set(invRef, invData, { merge: true });

    // Actualizar en users/{uid}/despensa para compatibilidad total
    const despensaRef = doc(db, 'users', uid, 'despensa', item.id);
    batch.set(despensaRef, { id: item.id, ...invData }, { merge: true });
  });

  updatedProducts.forEach((prod) => {
    if (!productIdsToPersist.has(prod.id)) return;
    const menuRef = doc(db, 'users', uid, 'menu', prod.id);
    const prodRef = doc(db, 'users', uid, 'productos', prod.id);
    batch.set(menuRef, { stock: prod.stock, lastUpdated: nowIso }, { merge: true });
    batch.set(prodRef, { stock: prod.stock, lastUpdated: nowIso }, { merge: true });
  });

  // 4. Guardar Venta
  const saleRef = doc(db, 'users', uid, 'ventas', receipt.id);
  batch.set(saleRef, sanitizeForFirestore({ ...receipt, userId: uid }), { merge: true });

  // 5. Liberar Mesa
  const tableRef = doc(db, 'users', uid, 'mesas', tableId);
  batch.set(
    tableRef,
    sanitizeForFirestore({
      id: tableId,
      status: 'libre',
      estado: 'libre',
      order: null,
      currentOrder: null,
      pedidoActual: null,
      waiterCall: null,
      updatedAt: nowIso,
      userId: uid
    }),
    { merge: true }
  );

  // 6. Cerrar Comanda
  if (orderId) {
    const orderRef = doc(db, 'users', uid, 'pedidos', orderId);
    batch.set(
      orderRef,
      sanitizeForFirestore({
        id: orderId,
        estado: 'pagada',
        status: 'pagada',
        closed: true,
        closedAt: nowIso,
        items: [],
        productos: []
      }),
      { merge: true }
    );
  }

  // 7. Ejecutar transacción / Batch Write atómico
  try {
    await batch.commit();
    console.log('Éxito al ejecutar executeSaleCheckoutBatch en Firebase para venta:', receipt.id);
  } catch (error) {
    console.error('ERROR CRÍTICO EN FIREBASE al ejecutar batch write de venta:', error);
    throw error;
  }

  return {
    updatedProducts,
    updatedPerishables,
    lowStockAlerts
  };
}

/**
 * Escucha en tiempo real la subcolección de empleados: users/${uid}/empleados
 */
export function subscribeUserEmpleados(uid: string, onUpdate: (empleados: Empleado[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/empleados`;
  const colRef = collection(db, 'users', uid, 'empleados');

  return onSnapshot(colRef, (snap) => {
    const normalized = snap.docs.map(d =>
      normalizeEmpleadoRecord({ userId: uid, ...d.data() }, d.id)
    );
    onUpdate(sortEmpleados(normalized));
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Obtiene los empleados de users/${uid}/empleados una sola vez
 */
export async function getUserEmpleados(targetUid?: string): Promise<Empleado[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];
  const path = `users/${uid}/empleados`;
  try {
    const colRef = collection(db, 'users', uid, 'empleados');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    const normalized = snap.docs.map(d =>
      normalizeEmpleadoRecord({ userId: uid, ...d.data() }, d.id)
    );
    return sortEmpleados(normalized);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Guarda o actualiza un empleado en users/${uid}/empleados/${empleado.id}
 */
export async function saveEmpleadoToFirestore(uid: string, empleado: Empleado): Promise<void> {
  if (!uid || !empleado.id) return;
  const path = `users/${uid}/empleados/${empleado.id}`;
  try {
    const nowIso = new Date().toISOString();
    const cleanEmail = normalizeEmployeeEmail(empleado.email);
    const normalizedRol = normalizeEmpleadoRol(empleado.rol);
    const cleanPayload = sanitizeForFirestore({
      id: empleado.id,
      nombre: empleado.nombre?.trim() || '',
      rol: normalizedRol,
      email: cleanEmail,
      activo: empleado.activo !== false,
      pin: empleado.pin?.trim() || '',
      avatarColor: empleado.avatarColor || 'purple',
      createdAt: empleado.createdAt || nowIso,
      updatedAt: empleado.updatedAt || nowIso,
      userId: uid,
      ...(empleado.authUid ? { authUid: empleado.authUid } : {})
    });
    await setDoc(doc(db, 'users', uid, 'empleados', empleado.id), cleanPayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Elimina un empleado de users/${uid}/empleados/${empleadoId}
 */
export async function deleteEmpleadoFromFirestore(uid: string, empleadoId: string): Promise<void> {
  if (!uid || !empleadoId) return;
  const path = `users/${uid}/empleados/${empleadoId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'empleados', empleadoId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

/**
 * Guarda la configuración de la carta QR (incluyendo tema visual y permisos) en Firestore.
 * Esto permite que cualquier comensal que escanee el código QR desde su celular
 * reciba instantáneamente el tema y opciones configuradas por el administrador.
 */
export async function saveUserQrConfig(uid: string, qrSettings: any): Promise<void> {
  if (!uid) return;
  try {
    const cleanSettings = sanitizeForFirestore({
      ...qrSettings,
      updatedAt: new Date().toISOString()
    });
    // Guardamos en subcolección config/qrSettings
    const configDocRef = doc(db, 'users', uid, 'config', 'qrSettings');
    await setDoc(configDocRef, cleanSettings, { merge: true });

    // También guardamos en users/${uid} para redundancia y consultas directas
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      qrSettings: cleanSettings,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/config/qrSettings`);
  }
}

/**
 * Escucha en tiempo real la configuración de la carta QR del restaurante (para el portal cliente).
 */
export function subscribeUserQrConfig(uid: string, onUpdate: (settings: any) => void): Unsubscribe {
  if (!uid) {
    onUpdate(null);
    return () => {};
  }
  const configDocRef = doc(db, 'users', uid, 'config', 'qrSettings');
  return onSnapshot(configDocRef, (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data());
    } else {
      // Fallback a users/${uid}
      const userDocRef = doc(db, 'users', uid);
      getDoc(userDocRef).then(uSnap => {
        if (uSnap.exists() && uSnap.data().qrSettings) {
          onUpdate(uSnap.data().qrSettings);
        } else {
          onUpdate(null);
        }
      }).catch(() => onUpdate(null));
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/config/qrSettings`);
  });
}

/**
 * Guarda la configuración general y visual del restaurante (logo, banner, wallpaper, categorías, etc.)
 * en la subcolección users/${uid}/config/appConfig y en users/${uid} para aislamiento multi-empresa estricto.
 */
export async function saveUserAppConfig(uid: string, config: Partial<AppConfig>): Promise<void> {
  if (!uid) return;
  const path = `users/${uid}/config/appConfig`;
  try {
    const cleanConfig = sanitizeForFirestore({
      ...config,
      updatedAt: new Date().toISOString()
    });

    // Guardar en subcolección config/appConfig
    const configDocRef = doc(db, 'users', uid, 'config', 'appConfig');
    await setDoc(configDocRef, cleanConfig, { merge: true });

    // Si viene qrSettings, actualizar también config/qrSettings
    if (config.qrSettings) {
      const qrDocRef = doc(db, 'users', uid, 'config', 'qrSettings');
      await setDoc(qrDocRef, sanitizeForFirestore({ ...config.qrSettings, updatedAt: new Date().toISOString() }), { merge: true });
    }

    // Guardar en documento raíz users/${uid} para redundancia y consultas directas
    const userDocRef = doc(db, 'users', uid);
    const userPayload: any = {
      updatedAt: new Date().toISOString()
    };
    if (config.businessName) userPayload.businessName = config.businessName;
    if (config.businessAddress !== undefined) userPayload.businessAddress = config.businessAddress;
    if (config.businessPhone !== undefined) userPayload.businessPhone = config.businessPhone;
    if (config.businessTaxId !== undefined) userPayload.businessTaxId = config.businessTaxId;
    if (config.logoUrl !== undefined) userPayload.logoUrl = config.logoUrl;
    if (config.categories !== undefined) userPayload.categories = config.categories;
    if (config.qrSettings !== undefined) userPayload.qrSettings = config.qrSettings;

    await setDoc(userDocRef, userPayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Escucha en tiempo real la configuración completa del restaurante desde users/${uid}/config/appConfig.
 */
export function subscribeUserAppConfig(uid: string, onUpdate: (config: Partial<AppConfig> | null) => void): Unsubscribe {
  if (!uid) {
    onUpdate(null);
    return () => {};
  }
  const path = `users/${uid}/config/appConfig`;
  const configDocRef = doc(db, 'users', uid, 'config', 'appConfig');

  return onSnapshot(configDocRef, async (snap) => {
    if (snap.exists()) {
      onUpdate(snap.data() as Partial<AppConfig>);
    } else {
      // Fallback a users/${uid} o subcolección qrSettings si aún no existe appConfig
      try {
        const userDocRef = doc(db, 'users', uid);
        const uSnap = await getDoc(userDocRef);
        if (uSnap.exists()) {
          const uData = uSnap.data();
          const fallbackConfig: Partial<AppConfig> = {};
          if (uData.businessName) fallbackConfig.businessName = uData.businessName;
          if (uData.businessAddress !== undefined) fallbackConfig.businessAddress = uData.businessAddress;
          if (uData.businessPhone !== undefined) fallbackConfig.businessPhone = uData.businessPhone;
          if (uData.businessTaxId !== undefined) fallbackConfig.businessTaxId = uData.businessTaxId;
          if (uData.logoUrl !== undefined) fallbackConfig.logoUrl = uData.logoUrl;
          if (uData.categories !== undefined) fallbackConfig.categories = uData.categories;
          if (uData.qrSettings !== undefined) fallbackConfig.qrSettings = uData.qrSettings;
          onUpdate(Object.keys(fallbackConfig).length > 0 ? fallbackConfig : null);
        } else {
          onUpdate(null);
        }
      } catch {
        onUpdate(null);
      }
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
    onUpdate(null);
  });
}

/**
 * Obtiene la configuración del restaurante una sola vez.
 */
export async function getUserAppConfig(uid: string): Promise<Partial<AppConfig> | null> {
  if (!uid) return null;
  const path = `users/${uid}/config/appConfig`;
  try {
    const configDocRef = doc(db, 'users', uid, 'config', 'appConfig');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      return snap.data() as Partial<AppConfig>;
    }
    const userDocRef = doc(db, 'users', uid);
    const uSnap = await getDoc(userDocRef);
    if (uSnap.exists()) {
      const uData = uSnap.data();
      const fallbackConfig: Partial<AppConfig> = {};
      if (uData.businessName) fallbackConfig.businessName = uData.businessName;
      if (uData.businessAddress !== undefined) fallbackConfig.businessAddress = uData.businessAddress;
      if (uData.logoUrl !== undefined) fallbackConfig.logoUrl = uData.logoUrl;
      if (uData.categories !== undefined) fallbackConfig.categories = uData.categories;
      if (uData.qrSettings !== undefined) fallbackConfig.qrSettings = uData.qrSettings;
      return Object.keys(fallbackConfig).length > 0 ? fallbackConfig : null;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Envía un pedido QR usando runTransaction para fusionar concurrentemente pedidos de múltiples celulares
 * en la misma mesa sin sobrescribir ni perder ítems de otros comensales o del mesero.
 */
export async function submitQrOrderTransaction(params: {
  uid: string;
  tableId: string;
  tableName: string;
  incomingItems: OrderItem[];
  defaultTaxRate: number;
  subaccountInput?: {
    id?: string;
    desiredName: string;
  } | null;
  legacyCustomerName?: string;
}): Promise<{
  order: Order;
  tableSessionId: string;
  resolvedSubaccount: TableSubaccount | null;
}> {
  const { uid, tableId, tableName, incomingItems, defaultTaxRate, subaccountInput, legacyCustomerName } = params;
  if (!uid || !tableId) {
    throw new Error('submitQrOrderTransaction requiere uid y tableId válidos.');
  }
  if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
    throw new Error('No hay productos para enviar.');
  }

  const tableRef = doc(db, 'users', uid, 'mesas', tableId);

  return runTransaction(db, async (tx) => {
    const nowIso = new Date().toISOString();
    const tableSnap = await tx.get(tableRef);
    const tableData = (tableSnap.exists() ? tableSnap.data() : {}) as Partial<Table>;

    const tableOrder = tableData.order || null;
    const hasCandidateActiveOrder = Boolean(
      tableOrder &&
      tableOrder.id &&
      !tableOrder.closed &&
      tableOrder.estado !== 'pagada' &&
      tableOrder.status !== 'pagada' &&
      tableOrder.estado !== 'cancelada' &&
      tableOrder.status !== 'cancelada' &&
      Array.isArray(tableOrder.items) &&
      tableOrder.items.length > 0
    );

    let activeOrder: Order | null = null;
    if (hasCandidateActiveOrder && tableOrder?.id) {
      const pedidoRef = doc(db, 'users', uid, 'pedidos', tableOrder.id);
      const pedidoSnap = await tx.get(pedidoRef);
      const pedidoData = pedidoSnap.exists() ? (pedidoSnap.data() as Partial<Order>) : null;
      const pedidoClosed = Boolean(
        pedidoData &&
        (pedidoData.closed ||
          pedidoData.estado === 'pagada' ||
          pedidoData.status === 'pagada' ||
          pedidoData.estado === 'cancelada' ||
          pedidoData.status === 'cancelada')
      );
      if (!pedidoClosed) {
        const mergedPedidoItems = Array.isArray(pedidoData?.items) && pedidoData.items.length > 0
          ? pedidoData.items
          : tableOrder.items;
        activeOrder = {
          ...(tableOrder as Order),
          ...(pedidoData as Partial<Order>),
          items: mergedPedidoItems,
        };
      }
    }

    const tableSessionId =
      activeOrder?.tableSessionId ||
      tableData.tableSessionId ||
      generateTableSessionId(tableId);

    const existingSubaccounts: TableSubaccount[] = Array.isArray(activeOrder?.subaccounts)
      ? activeOrder!.subaccounts!
      : Array.isArray(tableData.subaccounts)
        ? tableData.subaccounts!
        : [];

    let resolvedSubaccount: TableSubaccount | null = null;
    let nextSubaccounts = [...existingSubaccounts];

    if (subaccountInput && subaccountInput.desiredName.trim()) {
      const existingById = subaccountInput.id
        ? existingSubaccounts.find((s) => s.id === subaccountInput.id)
        : undefined;
      if (existingById) {
        resolvedSubaccount = {
          ...existingById,
          status: existingById.status === 'pagada' || existingById.status === 'cerrada' ? 'activa' : existingById.status,
          updatedAt: nowIso,
        };
        nextSubaccounts = existingSubaccounts.map((s) =>
          s.id === existingById.id ? resolvedSubaccount! : s
        );
      } else {
        resolvedSubaccount = createTableSubaccount({
          id: subaccountInput.id,
          tableId,
          tableSessionId,
          desiredName: subaccountInput.desiredName,
          existingSubaccounts,
          nowIso,
        });
        nextSubaccounts = [...existingSubaccounts, resolvedSubaccount];
      }
    }

    const stampedIncoming: OrderItem[] = incomingItems.map((it, idx) => {
      const rand = Math.random().toString(36).slice(2, 6);
      return {
        ...it,
        id: it.id || `it-qr-${Date.now()}-${idx}-${rand}`,
        addedAt: it.addedAt || nowIso,
        orderedBy: 'cliente',
        customerName: resolvedSubaccount?.displayName || legacyCustomerName?.trim() || it.customerName || 'Cliente QR',
        ...(resolvedSubaccount
          ? {
              subaccountId: resolvedSubaccount.id,
              subaccountName: resolvedSubaccount.displayName,
            }
          : {}),
      };
    });

    const baseItems = activeOrder ? [...activeOrder.items] : [];
    const combinedItems = [...baseItems, ...stampedIncoming];
    const cleanItems = combinedItems.map((it) => cleanOrderItemForFirestore(it, nowIso));

    const orderId = activeOrder?.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const subtotalVal = combinedItems.reduce((acc, it) => acc + computeItemTotal(it), 0);
    const pendingVal = combinedItems.reduce((acc, it) => acc + computeItemPendingAmount(it), 0);
    const discountPct = activeOrder?.discountPercent ?? 0;
    const taxPct = activeOrder?.taxPercent ?? defaultTaxRate;
    const totalVal = Math.max(0, Math.round(subtotalVal * (1 - discountPct / 100)));

    const mergedOrder: Order = sanitizeForFirestore({
      ...(activeOrder || {}),
      id: orderId,
      userId: uid,
      tableId,
      tableName: tableName || tableData.name || `Mesa ${tableId}`,
      tableSessionId,
      items: cleanItems as unknown as OrderItem[],
      productos: cleanItems as unknown as OrderItem[],
      subaccounts: nextSubaccounts,
      discountPercent: discountPct,
      taxPercent: taxPct,
      tipAmount: activeOrder?.tipAmount ?? 0,
      paymentsTotal: activeOrder?.paymentsTotal ?? 0,
      pendingBalance: pendingVal,
      openedAt: activeOrder?.openedAt || nowIso,
      lastUpdatedAt: nowIso,
      status: 'activa',
      estado: 'activa',
      closed: false,
      subtotal: subtotalVal,
      total: totalVal,
      customerName:
        activeOrder?.customerName ||
        resolvedSubaccount?.displayName ||
        legacyCustomerName?.trim() ||
        undefined,
    });

    const pedidoDocRef = doc(db, 'users', uid, 'pedidos', orderId);
    tx.set(pedidoDocRef, mergedOrder, { merge: true });

    const nextTableStatus = tableData.status === 'cuenta' ? 'cuenta' : 'ocupada';
    tx.set(
      tableRef,
      sanitizeForFirestore({
        id: tableId,
        status: nextTableStatus,
        estado: nextTableStatus,
        tableSessionId,
        subaccounts: nextSubaccounts,
        order: mergedOrder,
        currentOrder: mergedOrder,
        pedidoActual: mergedOrder,
        updatedAt: nowIso,
        userId: uid,
      }),
      { merge: true }
    );

    return {
      order: mergedOrder,
      tableSessionId,
      resolvedSubaccount,
    };
  });
}

/**
 * Solicita la cuenta desde QR de forma atómica sin sobrescribir solicitudes ni filtrar PII fiscal entre subcuentas.
 */
export async function requestQrBillTransaction(params: {
  uid: string;
  tableId: string;
  preferredPaymentMethod: 'efectivo' | 'tarjeta' | 'transferencia';
  subaccountId?: string;
  subaccountName?: string;
  requestedTipAmount?: number;
  requiresElectronicInvoice?: boolean;
  privateQrBillingId?: string;
  legacyBillingInfo?: any;
}): Promise<void> {
  const {
    uid,
    tableId,
    preferredPaymentMethod,
    subaccountId,
    subaccountName,
    requestedTipAmount,
    requiresElectronicInvoice,
    privateQrBillingId,
    legacyBillingInfo,
  } = params;
  if (!uid || !tableId) return;

  const tableRef = doc(db, 'users', uid, 'mesas', tableId);

  await runTransaction(db, async (tx) => {
    const nowIso = new Date().toISOString();
    const tableSnap = await tx.get(tableRef);
    const tableData = (tableSnap.exists() ? tableSnap.data() : {}) as Partial<Table>;
    const order = tableData.order || null;
    if (!order || order.closed || order.estado === 'pagada') {
      throw new Error('La mesa ya fue cerrada o no tiene una comanda activa.');
    }

    let orderRef: ReturnType<typeof doc> | null = null;
    let pedidoSubaccounts: TableSubaccount[] | undefined;
    if (order.id) {
      orderRef = doc(db, 'users', uid, 'pedidos', order.id);
      const pedidoSnap = await tx.get(orderRef);
      if (pedidoSnap.exists()) {
        const pData = pedidoSnap.data() as Partial<Order>;
        if (pData.closed || pData.estado === 'pagada') {
          throw new Error('La comanda ya fue cobrada.');
        }
        if (Array.isArray(pData.subaccounts)) {
          pedidoSubaccounts = pData.subaccounts;
        }
      }
    }

    const baseSubaccounts = pedidoSubaccounts || order.subaccounts || tableData.subaccounts || [];
    const nextSubaccounts = baseSubaccounts.map((sub) => {
      if (!subaccountId || sub.id !== subaccountId) return sub;
      return {
        ...sub,
        status: 'pidiendo_cuenta' as const,
        preferredPaymentMethod,
        ...(requestedTipAmount !== undefined ? { requestedTipAmount: Math.max(0, Math.round(requestedTipAmount)) } : {}),
        ...(requiresElectronicInvoice !== undefined ? { requiresElectronicInvoice } : {}),
        ...(privateQrBillingId ? { privateQrBillingId } : {}),
        requestedBillAt: nowIso,
        updatedAt: nowIso,
      };
    });

    const methodLabels: Record<'efectivo' | 'tarjeta' | 'transferencia', string> = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta / Datáfono',
      transferencia: 'Transferencia / QR',
    };
    const subLabel = subaccountName ? ` · Subcuenta: ${subaccountName}` : '';
    const tipNote = requestedTipAmount && requestedTipAmount > 0
      ? ` · Propina voluntaria: $${Math.round(requestedTipAmount).toLocaleString('es-CO')}`
      : '';
    const feNote = requiresElectronicInvoice ? ' · Requiere Factura Electrónica' : '';

    const waiterCallPayload = sanitizeForFirestore({
      type: 'bill',
      requestedAt: nowIso,
      preferredPaymentMethod,
      ...(subaccountId ? { subaccountId } : {}),
      ...(subaccountName ? { subaccountName } : {}),
      ...(legacyBillingInfo ? { billingInfo: legacyBillingInfo } : {}),
      message: `El cliente solicita la cuenta${subLabel} (${methodLabels[preferredPaymentMethod]}${tipNote}${feNote})`,
    });

    const nextOrder = sanitizeForFirestore({
      ...order,
      subaccounts: nextSubaccounts,
      ...(legacyBillingInfo ? { billingInfo: legacyBillingInfo } : {}),
      lastUpdatedAt: nowIso,
    });

    if (orderRef) {
      tx.set(orderRef, {
        subaccounts: sanitizeForFirestore(nextSubaccounts),
        ...(legacyBillingInfo ? { billingInfo: sanitizeForFirestore(legacyBillingInfo) } : {}),
        lastUpdatedAt: nowIso,
      }, { merge: true });
    }

    tx.set(tableRef, sanitizeForFirestore({
      status: 'cuenta',
      estado: 'cuenta',
      waiterCall: waiterCallPayload,
      subaccounts: nextSubaccounts,
      order: nextOrder,
      currentOrder: nextOrder,
      pedidoActual: nextOrder,
      updatedAt: nowIso,
    }), { merge: true });
  });
}

/**
 * Buzón privado aislado para datos fiscales QR (PII).
 * Los comensales pueden escribir su solicitud aquí sin que otros clientes de la misma mesa puedan leerla.
 */
export async function savePrivateQrBillingRecord(
  uid: string,
  record: PrivateQrBillingRecord
): Promise<void> {
  if (!uid || !record?.id) return;
  const path = `users/${uid}/facturacion_privada_qr/${record.id}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'facturacion_privada_qr', record.id),
      sanitizeForFirestore({ ...record, userId: uid }),
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Obtiene los registros fiscales privados de una sesión de mesa (uso exclusivo de POS/Caja autenticado).
 */
export async function getPrivateQrBillingForSession(
  uid: string,
  tableSessionId: string
): Promise<PrivateQrBillingRecord[]> {
  if (!uid || !tableSessionId) return [];
  const path = `users/${uid}/facturacion_privada_qr`;
  try {
    const q = query(collection(db, 'users', uid, 'facturacion_privada_qr'), where('tableSessionId', '==', tableSessionId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PrivateQrBillingRecord));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Obtiene los pagos parciales/totales registrados en users/{uid}/pagos_mesa para una comanda.
 */
export async function getTablePaymentsForOrder(
  uid: string,
  orderId: string
): Promise<TablePaymentRecord[]> {
  if (!uid || !orderId) return [];
  const path = `users/${uid}/pagos_mesa`;
  try {
    const q = query(collection(db, 'users', uid, 'pagos_mesa'), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TablePaymentRecord));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Ejecuta de forma transaccional un cobro parcial o total de mesa/subcuentas con:
 * - Idempotencia por paymentId en users/{uid}/pagos_mesa/{paymentId}
 * - Descuento único de inventario por ítem (solo ítems en plan.itemsRequiringInventoryDeduction)
 * - Registro inmutable en users/{uid}/ventas/{receipt.id}
 * - Liberación de mesa únicamente cuando plan.shouldReleaseTable === true (saldo pendiente === 0)
 */
export async function executePartialOrFullCheckoutTransaction(params: {
  uid: string;
  tableId: string;
  order: Order;
  plan: SubaccountCheckoutPlan;
  receipt: SaleReceipt;
  paymentRecord: TablePaymentRecord;
  productsCatalog: Product[];
  perishablesList: PerishableItem[];
}): Promise<SaleBatchResult & { idempotentDuplicate?: boolean }> {
  const {
    uid,
    tableId,
    order,
    plan,
    receipt,
    paymentRecord,
    productsCatalog,
    perishablesList,
  } = params;

  if (!uid) {
    throw new Error('executePartialOrFullCheckoutTransaction abortado: UID no autenticado');
  }

  // Calcular deducciones únicamente para los ítems que todavía no han descontado inventario
  const inventoryResult =
    plan.itemsRequiringInventoryDeduction.length > 0
      ? computeSaleInventoryUpdates({
          orderItems: plan.itemsRequiringInventoryDeduction,
          productsCatalog,
          perishablesList,
        })
      : {
          updatedPerishables: perishablesList,
          updatedProducts: productsCatalog,
          deductedPerishableIds: [],
          deductedDirectProductIds: [],
          recipeProductIds: [],
          lowStockAlerts: [],
        };

  const deductedPerishableSet = new Set(inventoryResult.deductedPerishableIds);
  const productIdsToPersist = new Set([
    ...inventoryResult.deductedDirectProductIds,
    ...inventoryResult.recipeProductIds,
  ]);

  const paymentRef = doc(db, 'users', uid, 'pagos_mesa', paymentRecord.id);
  const saleRef = doc(db, 'users', uid, 'ventas', receipt.id);
  const tableRef = doc(db, 'users', uid, 'mesas', tableId);
  const orderRef = order.id ? doc(db, 'users', uid, 'pedidos', order.id) : null;

  const txResult = await runTransaction(db, async (tx) => {
    const nowIso = new Date().toISOString();

    const paymentSnap = await tx.get(paymentRef);
    if (paymentSnap.exists()) {
      return { idempotentDuplicate: true };
    }

    const tableSnap = await tx.get(tableRef);
    const currentOrderSnap = orderRef ? await tx.get(orderRef) : null;

    if (currentOrderSnap?.exists()) {
      const pData = currentOrderSnap.data() as Partial<Order>;
      if (pData.closed || pData.estado === 'pagada' || pData.status === 'pagada') {
        throw new Error('Esta comanda ya fue pagada y cerrada.');
      }
    }

    // 1. Guardar pago idempotente
    tx.set(
      paymentRef,
      sanitizeForFirestore({
        ...paymentRecord,
        userId: uid,
      })
    );

    // 2. Guardar venta contable inmutable
    tx.set(
      saleRef,
      sanitizeForFirestore({
        ...receipt,
        userId: uid,
      })
    );

    // 3. Persistir inventario/despensa/productos descontados en este turno
    inventoryResult.updatedPerishables.forEach((item) => {
      if (!deductedPerishableSet.has(item.id)) return;
      const remaining = item.quantity;
      const minStock = item.minStock;
      const remainingScaled = toScaledQuantity(remaining);
      const minScaled = toScaledQuantity(minStock);
      const invData = sanitizeForFirestore({
        quantity: remaining,
        cantidadActual: remaining,
        alertaStockMinimo: minStock,
        hasLowStockAlert: remainingScaled <= minScaled,
        isOutOfStock: remainingScaled <= 0n,
        lastUpdated: nowIso,
      });
      tx.set(doc(db, 'users', uid, 'inventario', item.id), invData, { merge: true });
      tx.set(doc(db, 'users', uid, 'despensa', item.id), { id: item.id, ...invData }, { merge: true });
    });

    inventoryResult.updatedProducts.forEach((prod) => {
      if (!productIdsToPersist.has(prod.id)) return;
      tx.set(doc(db, 'users', uid, 'menu', prod.id), { stock: prod.stock, lastUpdated: nowIso }, { merge: true });
      tx.set(doc(db, 'users', uid, 'productos', prod.id), { stock: prod.stock, lastUpdated: nowIso }, { merge: true });
    });

    // 4. Actualizar mesa y comanda según saldo restante
    const tableData = (tableSnap.exists() ? tableSnap.data() : {}) as Partial<Table>;
    if (plan.shouldReleaseTable) {
      tx.set(
        tableRef,
        sanitizeForFirestore({
          id: tableId,
          status: 'libre',
          estado: 'libre',
          order: null,
          currentOrder: null,
          pedidoActual: null,
          waiterCall: null,
          tableSessionId: null,
          subaccounts: [],
          updatedAt: nowIso,
          userId: uid,
        }),
        { merge: true }
      );
      if (orderRef) {
        tx.set(
          orderRef,
          sanitizeForFirestore({
            id: order.id,
            estado: 'pagada',
            status: 'pagada',
            closed: true,
            closedAt: nowIso,
            settledAt: nowIso,
            pendingBalance: 0,
            paymentsTotal: (order.paymentsTotal || 0) + plan.total,
            subaccounts: [],
            items: [],
            productos: [],
          }),
          { merge: true }
        );
      }
    } else {
      const cleanUpdatedItems = plan.updatedOrderItems.map((it) => cleanOrderItemForFirestore(it, nowIso));
      const updatedOrder = sanitizeForFirestore({
        ...order,
        tableSessionId: plan.tableSessionId,
        items: cleanUpdatedItems,
        productos: cleanUpdatedItems,
        subaccounts: plan.updatedSubaccounts,
        pendingBalance: plan.remainingPendingBalance,
        paymentsTotal: (order.paymentsTotal || 0) + plan.total,
        lastUpdatedAt: nowIso,
        status: 'activa',
        estado: 'activa',
        closed: false,
      });

      const currentWaiterCall = tableData.waiterCall || null;
      const clearWaiterCall =
        !currentWaiterCall ||
        (currentWaiterCall.subaccountId && plan.affectedSubaccountIds.includes(currentWaiterCall.subaccountId)) ||
        plan.updatedSubaccounts.every((s) => s.status !== 'pidiendo_cuenta');

      const nextStatus = clearWaiterCall ? 'ocupada' : tableData.status === 'cuenta' ? 'cuenta' : 'ocupada';

      tx.set(
        tableRef,
        sanitizeForFirestore({
          id: tableId,
          status: nextStatus,
          estado: nextStatus,
          tableSessionId: plan.tableSessionId,
          subaccounts: plan.updatedSubaccounts,
          order: updatedOrder,
          currentOrder: updatedOrder,
          pedidoActual: updatedOrder,
          ...(clearWaiterCall ? { waiterCall: null } : {}),
          updatedAt: nowIso,
          userId: uid,
        }),
        { merge: true }
      );
      if (orderRef) {
        tx.set(orderRef, updatedOrder, { merge: true });
      }
    }

    return { idempotentDuplicate: false };
  });

  return {
    updatedProducts: inventoryResult.updatedProducts,
    updatedPerishables: inventoryResult.updatedPerishables,
    lowStockAlerts: inventoryResult.lowStockAlerts,
    idempotentDuplicate: txResult.idempotentDuplicate,
  };
}

