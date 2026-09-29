import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { AppStateData, Table, Product, PerishableItem, SaleReceipt } from '../types';

export async function fetchUserFirestoreData(userId: string): Promise<AppStateData | null> {
  if (!userId) return null;

  const activeUid = auth.currentUser?.uid || userId;
  const userDocId = activeUid || userId;

  try {
    // 1. Consult document in users/{userId}/data/appData
    const appDataRef = doc(db, 'users', userDocId, 'data', 'appData');
    const snap = await getDoc(appDataRef);

    if (snap.exists()) {
      const data = snap.data() as AppStateData;
      return {
        tables: Array.isArray(data.tables) ? data.tables : [],
        products: Array.isArray(data.products) ? data.products : [],
        perishables: Array.isArray(data.perishables) ? data.perishables : [],
        sales: Array.isArray(data.sales) ? data.sales : [],
        version: 2,
        lastModified: data.lastModified || new Date().toISOString()
      };
    }

    // 2. Check subcollections users/{userId}/tables, products, perishables, sales
    const tablesSnap = await getDocs(collection(db, 'users', userDocId, 'tables'));
    const productsSnap = await getDocs(collection(db, 'users', userDocId, 'products'));
    const perishablesSnap = await getDocs(collection(db, 'users', userDocId, 'perishables'));
    const salesSnap = await getDocs(collection(db, 'users', userDocId, 'sales'));

    if (!tablesSnap.empty || !productsSnap.empty || !perishablesSnap.empty || !salesSnap.empty) {
      const tables = tablesSnap.docs.map(d => d.data() as Table);
      const products = productsSnap.docs.map(d => d.data() as Product);
      const perishables = perishablesSnap.docs.map(d => d.data() as PerishableItem);
      const sales = salesSnap.docs.map(d => d.data() as SaleReceipt);

      return {
        tables,
        products,
        perishables,
        sales,
        version: 2,
        lastModified: new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn('Firestore user data fetch notice:', err);
  }

  return null;
}

export async function saveUserFirestoreData(userId: string, data: AppStateData): Promise<void> {
  if (!userId) return;

  const activeUid = auth.currentUser?.uid || userId;
  const userDocId = activeUid || userId;

  try {
    const payload = {
      tables: data.tables || [],
      products: data.products || [],
      perishables: data.perishables || [],
      sales: data.sales || [],
      version: 2,
      lastModified: new Date().toISOString(),
      updatedByUid: activeUid
    };

    // Save main document state at users/{userId}/data/appData
    const appDataRef = doc(db, 'users', userDocId, 'data', 'appData');
    await setDoc(appDataRef, payload, { merge: true });

    // Sync individual documents in subcollections for queries
    for (const tbl of data.tables || []) {
      await setDoc(doc(db, 'users', userDocId, 'tables', tbl.id), { ...tbl, userId: userDocId }, { merge: true });
    }
    for (const prod of data.products || []) {
      await setDoc(doc(db, 'users', userDocId, 'products', prod.id), { ...prod, userId: userDocId }, { merge: true });
    }
    for (const per of data.perishables || []) {
      await setDoc(doc(db, 'users', userDocId, 'perishables', per.id), { ...per, userId: userDocId }, { merge: true });
    }
    for (const sale of data.sales || []) {
      await setDoc(doc(db, 'users', userDocId, 'sales', sale.id), { ...sale, userId: userDocId }, { merge: true });
    }
  } catch (err) {
    console.warn('Firestore user data save notice:', err);
  }
}
