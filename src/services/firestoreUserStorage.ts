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
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Table, Product, PerishableItem, SaleReceipt, AppStateData, Order, Empleado } from '../types';

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
    if (!snap.empty) {
      const products = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      onUpdate(products);
    } else {
      const colRefProds = collection(db, 'users', uid, 'productos');
      getDocs(colRefProds).then(prodSnap => {
        const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        onUpdate(products);
      }).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/productos`);
        onUpdate([]);
      });
    }
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
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerishableItem));
    onUpdate(items);
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
 * Escucha en tiempo real el historial de ventas de users/${uid}/ventas
 */
export function subscribeUserSales(uid: string, onUpdate: (sales: SaleReceipt[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/ventas`;
  const colRef = collection(db, 'users', uid, 'ventas');

  return onSnapshot(colRef, (snap) => {
    const sales = snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
    onUpdate(sales);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PerishableItem));
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
      sales: [],
      version: 2,
      lastModified: new Date().toISOString()
    };
  }

  const [tables, products, perishables, sales] = await Promise.all([
    getUserTables(uid),
    getUserProducts(uid),
    getUserInventory(uid),
    getUserSales(uid)
  ]);

  return {
    tables,
    products,
    perishables,
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
        await setDoc(doc(db, 'users', uid, 'inventario', per.id), sanitizeForFirestore({ ...per, userId: uid }), { merge: true });
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

/**
 * Guarda o actualiza una comanda en Firestore.
 * Reemplaza completamente el documento en pedidos para evitar que queden items viejos o campos sucios.
 */
export async function saveOrderToFirestore(order: Order, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !order.id) return;
  const path = `users/${uid}/pedidos/${order.id}`;
  try {
    const cleanItems = (order.items || []).map(it => ({
      id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: it.productId || '',
      name: it.name || 'Producto',
      unitPrice: Number(it.unitPrice) || 0,
      quantity: Number(it.quantity) || 1,
      notes: it.notes?.trim() || '',
      addedAt: it.addedAt || new Date().toISOString(),
      customerName: it.customerName?.trim() || '',
      orderedBy: it.orderedBy || 'mesero'
    }));

    const cleanOrder = sanitizeForFirestore({
      ...order,
      userId: uid,
      items: cleanItems,
      productos: cleanItems,
      status: 'activa',
      estado: 'activa',
      closed: false,
      lastUpdatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, 'users', uid, 'pedidos', order.id), cleanOrder);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Sincroniza atómicamente el estado de comanda de una mesa tanto en 'mesas' como en 'pedidos'.
 * Si la comanda queda sin productos, libera la mesa y marca el pedido como cerrado/cancelado.
 */
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

  const hasItems = order && Array.isArray(order.items) && order.items.length > 0;

  if (hasItems && order) {
    if (!order.id) {
      console.error("ERROR CRÍTICO: order.id es undefined en syncTableOrderToFirestore");
      throw new Error("syncTableOrderToFirestore abortado: ID del pedido es undefined");
    }

    const cleanItems = order.items.map(it => ({
      id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: it.productId || '',
      name: it.name || 'Producto',
      unitPrice: Number(it.unitPrice) || 0,
      quantity: Number(it.quantity) || 1,
      notes: it.notes?.trim() || '',
      addedAt: it.addedAt || nowIso,
      customerName: it.customerName?.trim() || '',
      orderedBy: it.orderedBy || 'mesero'
    }));

    const cleanOrder = sanitizeForFirestore({
      ...order,
      userId: uid,
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
    // No hay ítems en la comanda (o fue vaciada / eliminada por completo)
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
      const orderCancelData = sanitizeForFirestore({
        status: 'cancelada',
        estado: 'cancelada',
        closed: true,
        closedAt: nowIso,
        items: [],
        productos: []
      });
      console.log("Intentando actualizar doc con ID:", order.id, "Datos:", orderCancelData);
      try {
        const orderDocRef = doc(db, 'users', uid, 'pedidos', order.id);
        await updateDoc(orderDocRef, orderCancelData);
        console.log("Éxito al cancelar comanda vacía con updateDoc en Firebase con ID:", order.id);
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE al hacer updateDoc:", error);
        try {
          const orderDocRef = doc(db, 'users', uid, 'pedidos', order.id);
          await setDoc(orderDocRef, orderCancelData, { merge: true });
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

  const hasOrder = table.order && Array.isArray(table.order.items) && table.order.items.length > 0;
  const cleanTable = sanitizeForFirestore({
    ...table,
    userId: uid,
    status: table.status || (hasOrder ? 'ocupada' : 'libre'),
    estado: table.status || (hasOrder ? 'ocupada' : 'libre'),
    order: hasOrder ? table.order : null,
    currentOrder: hasOrder ? table.order : null,
    pedidoActual: hasOrder ? table.order : null,
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

  if (hasOrder && table.order) {
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
      productos: []
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
    await setDoc(doc(db, 'users', uid, 'menu', product.id), { ...product, userId: uid }, { merge: true });
    await setDoc(doc(db, 'users', uid, 'productos', product.id), { ...product, userId: uid }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteProductFromFirestore(productId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !productId) return;
  const path = `users/${uid}/menu/${productId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'menu', productId));
    await deleteDoc(doc(db, 'users', uid, 'productos', productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveInventoryItemToFirestore(item: PerishableItem, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !item.id) return;
  const path = `users/${uid}/inventario/${item.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'inventario', item.id), { ...item, userId: uid }, { merge: true });
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
    const empleados = snap.docs.map(d => ({ id: d.id, ...d.data() } as Empleado));
    onUpdate(empleados);
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Empleado));
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
    const cleanPayload = sanitizeForFirestore({
      id: empleado.id,
      nombre: empleado.nombre || '',
      rol: empleado.rol || 'Mesero',
      pin: empleado.pin || '',
      avatarColor: empleado.avatarColor || 'purple',
      createdAt: empleado.createdAt || new Date().toISOString()
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
