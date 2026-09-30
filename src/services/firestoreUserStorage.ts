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
import { Table, Product, PerishableItem, SaleReceipt, AppStateData } from '../types';

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
    // Sincronizar Mesas
    for (const tbl of data.tables || []) {
      if (tbl.id) {
        await setDoc(doc(db, 'users', uid, 'mesas', tbl.id), { ...tbl, userId: uid }, { merge: true });
      }
    }

    // Sincronizar Menú / Productos
    for (const prod of data.products || []) {
      if (prod.id) {
        await setDoc(doc(db, 'users', uid, 'menu', prod.id), { ...prod, userId: uid }, { merge: true });
        await setDoc(doc(db, 'users', uid, 'productos', prod.id), { ...prod, userId: uid }, { merge: true });
      }
    }

    // Sincronizar Inventario / Insumos
    for (const per of data.perishables || []) {
      if (per.id) {
        await setDoc(doc(db, 'users', uid, 'inventario', per.id), { ...per, userId: uid }, { merge: true });
      }
    }

    // Sincronizar Pedidos / Ventas
    for (const sale of data.sales || []) {
      if (sale.id) {
        await setDoc(doc(db, 'users', uid, 'pedidos', sale.id), { ...sale, userId: uid }, { merge: true });
        await setDoc(doc(db, 'users', uid, 'ventas', sale.id), { ...sale, userId: uid }, { merge: true });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

/**
 * Operaciones individuales CRUD en Firestore con Optimistic Updates
 */
export async function saveTableToFirestore(table: Table, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !table.id) return;
  const path = `users/${uid}/mesas/${table.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'mesas', table.id), { ...table, userId: uid }, { merge: true });
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
