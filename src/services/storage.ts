import { AppStateData, Product, Table, SaleReceipt, PerishableItem } from '../types';
import { saveUserFirestoreData, fetchUserFirestoreData } from './firestoreUserStorage';

export const INITIAL_PERISHABLES: PerishableItem[] = [];
export const INITIAL_PRODUCTS: Product[] = [];
export const INITIAL_TABLES: Table[] = [];

const STORAGE_KEY = 'appgenerica_data_v2_cop';

export function loadStoredData(_storeId?: string): AppStateData {
  return {
    tables: [],
    products: [],
    perishables: [],
    sales: [],
    version: 2,
    lastModified: new Date().toISOString()
  };
}

export function saveStoredData(data: AppStateData, _broadcast = true, storeId?: string): void {
  try {
    const updated = {
      ...data,
      lastModified: new Date().toISOString()
    };
    
    if (storeId && storeId !== 'default' && storeId !== 'demo') {
      saveUserFirestoreData(storeId, updated).catch(() => {});
    }
  } catch (err) {
    console.error('Error saving data to Firestore:', err);
  }
}

export function subscribeToSyncChannel(_onUpdate: (data: AppStateData) => void): () => void {
  return () => {};
}

export function mergeAppState(local: AppStateData, remote: AppStateData): AppStateData {
  if (!remote || !Array.isArray(remote.tables)) return local;
  if (!local || !Array.isArray(local.tables)) return remote;

  return {
    version: 2,
    lastModified: new Date().toISOString(),
    tables: remote.tables || [],
    products: remote.products || [],
    sales: remote.sales || [],
    perishables: remote.perishables || []
  };
}

export async function fetchCloudState(storeId = 'default'): Promise<AppStateData | null> {
  if (storeId && storeId !== 'default' && storeId !== 'demo') {
    try {
      const fsData = await fetchUserFirestoreData(storeId);
      if (fsData) return fsData;
    } catch (err) {
      console.warn('Firestore fetch notice:', err);
    }
  }
  return null;
}

export async function pushCloudState(_data: AppStateData, _storeId = 'default'): Promise<boolean> {
  return true;
}
