import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  getDoc
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
    const tables = snap.docs.map(d => ({ id: d.id, ...d.data() } as Table));
    onUpdate(tables);
  }, (err) => {
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
 * Escucha en tiempo real los pedidos de users/${uid}/pedidos
 */
export function subscribeUserOrders(uid: string, onUpdate: (orders: Order[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/pedidos`;
  const colRef = collection(db, 'users', uid, 'pedidos');

  return onSnapshot(colRef, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
    onUpdate(orders);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, path);
    onUpdate([]);
  });
}

/**
 * Escucha en tiempo real los pedidos/ventas de users/${uid}/pedidos y users/${uid}/ventas
 */
export function subscribeUserSales(uid: string, onUpdate: (sales: SaleReceipt[]) => void): Unsubscribe {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }
  const path = `users/${uid}/pedidos`;
  const colRef = collection(db, 'users', uid, 'pedidos');

  return onSnapshot(colRef, (snap) => {
    if (!snap.empty) {
      const sales = snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
      onUpdate(sales);
    } else {
      const colRefVentas = collection(db, 'users', uid, 'ventas');
      getDocs(colRefVentas).then(vSnap => {
        const sales = vSnap.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
        onUpdate(sales);
      }).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/ventas`);
        onUpdate([]);
      });
    }
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Table));
  } catch (err) {
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
 * Obtiene las ventas/pedidos desde users/${uid}/pedidos y users/${uid}/ventas
 */
export async function getUserSales(targetUid?: string): Promise<SaleReceipt[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  const path = `users/${uid}/pedidos`;
  try {
    const colRefPedidos = collection(db, 'users', uid, 'pedidos');
    const snapPedidos = await getDocs(colRefPedidos);
    if (!snapPedidos.empty) {
      return snapPedidos.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
    }

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
        await setDoc(doc(db, 'users', uid, 'mesas', tbl.id), sanitizeForFirestore({ ...tbl, userId: uid }), { merge: true });
        if (tbl.order && tbl.order.id) {
          await setDoc(doc(db, 'users', uid, 'pedidos', tbl.order.id), sanitizeForFirestore({ ...tbl.order, userId: uid }), { merge: true });
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

    // Sincronizar Pedidos / Ventas
    for (const sale of data.sales || []) {
      if (sale.id) {
        const cleanSale = sanitizeForFirestore({ ...sale, userId: uid });
        await setDoc(doc(db, 'users', uid, 'pedidos', sale.id), cleanSale, { merge: true });
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
 * Operaciones individuales CRUD en Firestore con Optimistic Updates
 */
export async function saveOrderToFirestore(order: Order, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !order.id) return;
  const path = `users/${uid}/pedidos/${order.id}`;
  try {
    const cleanOrder = sanitizeForFirestore({ ...order, userId: uid });
    await setDoc(doc(db, 'users', uid, 'pedidos', order.id), cleanOrder, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function saveTableToFirestore(table: Table, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !table.id) return;
  const path = `users/${uid}/mesas/${table.id}`;
  try {
    const cleanTable = sanitizeForFirestore({ ...table, userId: uid });
    await setDoc(doc(db, 'users', uid, 'mesas', table.id), cleanTable, { merge: true });
    if (table.order && table.order.id) {
      await saveOrderToFirestore(table.order, uid);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
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
  const uid = getActiveUserId(targetUid);
  if (!uid || !sale.id) return;
  const path = `users/${uid}/pedidos/${sale.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'pedidos', sale.id), { ...sale, userId: uid }, { merge: true });
    await setDoc(doc(db, 'users', uid, 'ventas', sale.id), { ...sale, userId: uid }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
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
