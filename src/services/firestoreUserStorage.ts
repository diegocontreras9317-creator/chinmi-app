import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Table, Product, PerishableItem, SaleReceipt, AppStateData } from '../types';

/**
 * Verifica si hay un usuario activo autenticado en Firebase
 */
export function getActiveUserId(targetUid?: string): string | null {
  if (targetUid) return targetUid;
  if (auth.currentUser) return auth.currentUser.uid;
  return null;
}

/**
 * Obtiene todas las mesas del usuario autenticado en users/${uid}/mesas
 */
export async function getUserTables(targetUid?: string): Promise<Table[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  try {
    const colRef = collection(db, 'users', uid, 'mesas');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Table));
  } catch (err) {
    console.warn('Error al obtener mesas del usuario:', err);
    return [];
  }
}

/**
 * Obtiene todos los productos del menú en users/${uid}/productos
 */
export async function getUserProducts(targetUid?: string): Promise<Product[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  try {
    const colRef = collection(db, 'users', uid, 'productos');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch (err) {
    console.warn('Error al obtener productos del usuario:', err);
    return [];
  }
}

/**
 * Obtiene todo el inventario/insumos en users/${uid}/inventario
 */
export async function getUserInventory(targetUid?: string): Promise<PerishableItem[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  try {
    const colRef = collection(db, 'users', uid, 'inventario');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PerishableItem));
  } catch (err) {
    console.warn('Error al obtener inventario del usuario:', err);
    return [];
  }
}

/**
 * Obtiene las ventas en users/${uid}/ventas
 */
export async function getUserSales(targetUid?: string): Promise<SaleReceipt[]> {
  const uid = getActiveUserId(targetUid);
  if (!uid) return [];

  try {
    const colRef = collection(db, 'users', uid, 'ventas');
    const snap = await getDocs(colRef);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleReceipt));
  } catch (err) {
    console.warn('Error al obtener ventas del usuario:', err);
    return [];
  }
}

/**
 * Carga completa del estado desde las subcolecciones del usuario en Firestore.
 * Si no hay sesión activa o es usuario nuevo, retorna listas vacías [] (pantalla limpia).
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

    // Sincronizar Productos
    for (const prod of data.products || []) {
      if (prod.id) {
        await setDoc(doc(db, 'users', uid, 'productos', prod.id), { ...prod, userId: uid }, { merge: true });
      }
    }

    // Sincronizar Inventario / Insumos
    for (const per of data.perishables || []) {
      if (per.id) {
        await setDoc(doc(db, 'users', uid, 'inventario', per.id), { ...per, userId: uid }, { merge: true });
      }
    }

    // Sincronizar Ventas
    for (const sale of data.sales || []) {
      if (sale.id) {
        await setDoc(doc(db, 'users', uid, 'ventas', sale.id), { ...sale, userId: uid }, { merge: true });
      }
    }
  } catch (err) {
    console.warn('Error al guardar datos en subcolecciones de Firestore:', err);
  }
}

/**
 * Operaciones individuales CRUD en Firestore
 */
export async function saveTableToFirestore(table: Table, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !table.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'mesas', table.id), { ...table, userId: uid }, { merge: true });
  } catch (err) {
    console.warn('Error al guardar mesa en Firestore:', err);
  }
}

export async function deleteTableFromFirestore(tableId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !tableId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'mesas', tableId));
  } catch (err) {
    console.warn('Error al eliminar mesa de Firestore:', err);
  }
}

export async function saveProductToFirestore(product: Product, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !product.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'productos', product.id), { ...product, userId: uid }, { merge: true });
  } catch (err) {
    console.warn('Error al guardar producto en Firestore:', err);
  }
}

export async function deleteProductFromFirestore(productId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !productId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'productos', productId));
  } catch (err) {
    console.warn('Error al eliminar producto de Firestore:', err);
  }
}

export async function saveInventoryItemToFirestore(item: PerishableItem, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !item.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'inventario', item.id), { ...item, userId: uid }, { merge: true });
  } catch (err) {
    console.warn('Error al guardar insumo en Firestore:', err);
  }
}

export async function deleteInventoryItemFromFirestore(itemId: string, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !itemId) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'inventario', itemId));
  } catch (err) {
    console.warn('Error al eliminar insumo de Firestore:', err);
  }
}

export async function saveSaleToFirestore(sale: SaleReceipt, targetUid?: string): Promise<void> {
  const uid = getActiveUserId(targetUid);
  if (!uid || !sale.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'ventas', sale.id), { ...sale, userId: uid }, { merge: true });
  } catch (err) {
    console.warn('Error al guardar venta en Firestore:', err);
  }
}
