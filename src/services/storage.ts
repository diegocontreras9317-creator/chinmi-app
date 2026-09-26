import { AppStateData, Product, Table, SaleReceipt, PerishableItem } from '../types';

const getRelativeIsoDate = (offsetDays: number = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

export const INITIAL_PERISHABLES: PerishableItem[] = [
  {
    id: 'perish-1',
    name: 'Limón Tahití Verde (Coctelería & Barra)',
    category: 'Insumos de Bar & Coctelería',
    quantity: 4.5,
    unit: 'kg',
    minStock: 5.0,
    entryDate: getRelativeIsoDate(-4),
    expiryDate: getRelativeIsoDate(4),
    location: 'Barra Principal - Nevera Cócteles',
    supplier: 'Fruver Central Abastos',
    batchNumber: 'LOT-LMN-982',
    costPerUnit: 4200,
    imageUrl: 'https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=400&q=80',
    notes: 'Insumo diario para margaritas, micheladas y garnish de gin tonic.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-2',
    name: 'Menta & Hierbabuena Fresca',
    category: 'Insumos de Bar & Coctelería',
    quantity: 0.4,
    unit: 'kg',
    minStock: 0.8,
    entryDate: getRelativeIsoDate(-3),
    expiryDate: getRelativeIsoDate(1), // Vence MAÑANA -> ALERTA AMARILLA
    location: 'Barra - Estación de Mojitos',
    supplier: 'Huerto Orgánico San Jerónimo',
    batchNumber: 'LOT-MNT-104',
    costPerUnit: 12000,
    imageUrl: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=400&q=80',
    notes: 'Mantener tallos sumergidos en agua fría con hielo para preservar frescura.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-3',
    name: 'Tomate Chonto Maduro',
    category: 'Verduras & Hortalizas',
    quantity: 9.0,
    unit: 'kg',
    minStock: 4.0,
    entryDate: getRelativeIsoDate(-4),
    expiryDate: getRelativeIsoDate(2), // Vence en 2 días -> ALERTA
    location: 'Nevera 1 - Cocina Caliente',
    supplier: 'Fruver Central Abastos',
    batchNumber: 'LOT-TOM-772',
    costPerUnit: 3500,
    imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
    notes: 'Priorizar para la elaboración de la salsa brava y ahogados.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-4',
    name: 'Aguacate Hass Maduración Óptima',
    category: 'Verduras & Hortalizas',
    quantity: 5.5,
    unit: 'kg',
    minStock: 3.0,
    entryDate: getRelativeIsoDate(-2),
    expiryDate: getRelativeIsoDate(3),
    location: 'Cajón Fresco - Cocina Fría',
    supplier: 'Fruver Campesino',
    batchNumber: 'LOT-AVC-302',
    costPerUnit: 7800,
    imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=400&q=80',
    notes: 'Ideal para guacamole artesanal y hamburguesas.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-5',
    name: 'Lechuga Crespa / Romana Orgánica',
    category: 'Verduras & Hortalizas',
    quantity: 1.2,
    unit: 'kg',
    minStock: 2.5,
    entryDate: getRelativeIsoDate(-6),
    expiryDate: getRelativeIsoDate(-1), // VENCIDO AYER -> ALERTA ROJA CADUCADO
    location: 'Nevera Ensaladas',
    supplier: 'Huerto Orgánico',
    batchNumber: 'LOT-LCH-409',
    costPerUnit: 4500,
    imageUrl: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=400&q=80',
    notes: 'Revisar inmediatamente y dar de baja merma si ha perdido crocancia.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-6',
    name: 'Fresas Frescas Seleccionadas',
    category: 'Frutas & Cítricos',
    quantity: 2.8,
    unit: 'kg',
    minStock: 1.5,
    entryDate: getRelativeIsoDate(-2),
    expiryDate: getRelativeIsoDate(2),
    location: 'Nevera Bar & Repostería',
    supplier: 'Fruver del Valle',
    batchNumber: 'LOT-FRS-551',
    costPerUnit: 8500,
    imageUrl: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=400&q=80',
    notes: 'Para cócteles de autor de frutos rojos, batidos y postres.',
    alarmDaysBeforeExpiry: 2
  },
  {
    id: 'perish-7',
    name: 'Naranjas Valencia (Jugos & Desayunos)',
    category: 'Frutas & Cítricos',
    quantity: 22.0,
    unit: 'kg',
    minStock: 10.0,
    entryDate: getRelativeIsoDate(-1),
    expiryDate: getRelativeIsoDate(9),
    location: 'Despensa Fría Barra',
    supplier: 'Cítricos del Oriente',
    batchNumber: 'LOT-NRJ-112',
    costPerUnit: 2800,
    imageUrl: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=400&q=80',
    notes: 'Para zumo natural exprimido y slices deshidratados de coctelería.',
    alarmDaysBeforeExpiry: 3
  },
  {
    id: 'perish-8',
    name: 'Queso Mozzarella en Bloque',
    category: 'Lácteos & Quesos',
    quantity: 7.0,
    unit: 'kg',
    minStock: 4.0,
    entryDate: getRelativeIsoDate(-3),
    expiryDate: getRelativeIsoDate(14),
    location: 'Cuarto Frío Lácteos (2°C)',
    supplier: 'Lácteos del Norte',
    batchNumber: 'LOT-MOZ-889',
    costPerUnit: 18000,
    imageUrl: 'https://images.unsplash.com/photo-1589881133595-a3c085cb731d?auto=format&fit=crop&w=400&q=80',
    notes: 'Para fundir en tapas, hamburguesas y tablas ibéricas.',
    alarmDaysBeforeExpiry: 4
  },
  {
    id: 'perish-9',
    name: 'Pechuga de Pollo Fresca',
    category: 'Carnes, Pollo & Pescados',
    quantity: 11.0,
    unit: 'kg',
    minStock: 5.0,
    entryDate: getRelativeIsoDate(-1),
    expiryDate: getRelativeIsoDate(4),
    location: 'Cámara Carnes Cocina',
    supplier: 'Avícola Santa Rita',
    batchNumber: 'LOT-POL-220',
    costPerUnit: 14500,
    imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80',
    notes: 'Corte limpio listo para marinar.',
    alarmDaysBeforeExpiry: 2
  },
  {
    id: 'perish-10',
    name: 'Cilantro Criollo Fresco',
    category: 'Hierbas & Aromáticas',
    quantity: 0.25,
    unit: 'kg',
    minStock: 0.6, // Stock bajo
    entryDate: getRelativeIsoDate(-2),
    expiryDate: getRelativeIsoDate(1), // Vence MAÑANA
    location: 'Refrigerador Hortalizas',
    supplier: 'Huerto Orgánico',
    batchNumber: 'LOT-CIL-910',
    costPerUnit: 6000,
    imageUrl: 'https://images.unsplash.com/photo-1599818815124-7cb691060933?auto=format&fit=crop&w=400&q=80',
    notes: 'Usar para ají casero y condimentos de sopas y empanadas.',
    alarmDaysBeforeExpiry: 2
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Cerveza Club Colombia Dorada (330ml)',
    category: 'Cervezas & Vinos',
    price: 8500,
    cost: 3200,
    stock: 84,
    minStock: 25,
    imageUrl: 'https://images.unsplash.com/photo-1608270199581-998cb3d21175?auto=format&fit=crop&w=400&q=80',
    sku: 'CERV-001',
    description: 'Cerveza premium tipo lager bien fría con vaso escarchado.'
  },
  {
    id: 'prod-2',
    name: 'Vino Tinto Reserva Malbec (Copa)',
    category: 'Cervezas & Vinos',
    price: 18000,
    cost: 6500,
    stock: 32,
    minStock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=400&q=80',
    sku: 'VINO-002',
    description: 'Crianza con 12 meses en barrica de roble francés.'
  },
  {
    id: 'prod-3',
    name: 'Papas Bravas Criollas Rústicas',
    category: 'Tapas & Entrantes',
    price: 16000,
    cost: 4500,
    stock: 45,
    minStock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=400&q=80',
    sku: 'TAPA-001',
    description: 'Papa criolla dorada crocante con salsa brava artesanal de la casa.'
  },
  {
    id: 'prod-4',
    name: 'Tabla Ibérica de Jamón Serrano y Quesos',
    category: 'Tapas & Entrantes',
    price: 42000,
    cost: 17000,
    stock: 14,
    minStock: 8,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
    sku: 'TAPA-002',
    description: 'Corte artesanal con tostadas de pan rústico y tomate confitado.'
  },
  {
    id: 'prod-5',
    name: 'Empanaditas Criollas de Carne (6 uds)',
    category: 'Tapas & Entrantes',
    price: 22000,
    cost: 7000,
    stock: 28,
    minStock: 12,
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80',
    sku: 'TAPA-003',
    description: 'Masa crocante de maíz rellena de carne desmechada con ají casero.'
  },
  {
    id: 'prod-6',
    name: 'Hamburguesa Angus Artesanal con Queso',
    category: 'Platos Principales',
    price: 34000,
    cost: 12000,
    stock: 22,
    minStock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    sku: 'PLAT-001',
    description: 'Carne Angus 180g, queso colby jack fundido, tocineta ahumada y papas.'
  },
  {
    id: 'prod-7',
    name: 'Pulpo a la Brasa con Papas Criollas',
    category: 'Platos Principales',
    price: 48000,
    cost: 19000,
    stock: 7,
    minStock: 10, // Stock bajo a propósito para probar alerta visual
    imageUrl: 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=400&q=80',
    sku: 'PLAT-002',
    description: 'Pata de pulpo caramelizada al carbón con aceite de pimentón.'
  },
  {
    id: 'prod-8',
    name: 'Agua Mineral Manantial Natural (500ml)',
    category: 'Bebidas & Refrescos',
    price: 5000,
    cost: 1500,
    stock: 95,
    minStock: 30,
    imageUrl: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=400&q=80',
    sku: 'BEB-001',
    description: 'Agua pura de manantial en botella de vidrio fría.'
  },
  {
    id: 'prod-9',
    name: 'Gaseosa Postobón Manzana / Cola (350ml)',
    category: 'Bebidas & Refrescos',
    price: 6500,
    cost: 2000,
    stock: 60,
    minStock: 20,
    imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80',
    sku: 'BEB-002',
    description: 'Gaseosa fría servida con hielo y rodaja de limón.'
  },
  {
    id: 'prod-10',
    name: 'Cóctel Mojito Clásico Caña',
    category: 'Licores & Cócteles',
    price: 28000,
    cost: 9000,
    stock: 35,
    minStock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80',
    sku: 'COCK-001',
    description: 'Ron añejo, hierbabuena fresca macerada, limón criollo y soda.'
  },
  {
    id: 'prod-11',
    name: 'Postre Tres Leches Artesanal',
    category: 'Cafés & Postres',
    price: 15000,
    cost: 4500,
    stock: 16,
    minStock: 8,
    imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=80',
    sku: 'POST-001',
    description: 'Bizcochuelo bañado en salsa de tres leches con merengue flameado.'
  },
  {
    id: 'prod-12',
    name: 'Café Espresso Arábica Colombiano',
    category: 'Cafés & Postres',
    price: 6000,
    cost: 1800,
    stock: 120,
    minStock: 40,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80',
    sku: 'POST-002',
    description: 'Café de origen Huila 100% arábica recién molido.'
  }
];

export const INITIAL_TABLES: Table[] = [
  {
    id: 'tbl-1',
    number: '1',
    name: 'Mesa 1',
    zone: 'Terraza Exterior',
    seats: 4,
    status: 'ocupada',
    order: {
      id: 'ord-101',
      tableId: 'tbl-1',
      tableName: 'Mesa 1',
      items: [
        { id: 'item-1', productId: 'prod-1', name: 'Cerveza Club Colombia Dorada (330ml)', unitPrice: 8500, quantity: 2, notes: 'Bien frías', addedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
        { id: 'item-2', productId: 'prod-3', name: 'Papas Bravas Criollas Rústicas', unitPrice: 16000, quantity: 1, notes: 'Salsa aparte', addedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
        { id: 'item-3', productId: 'prod-5', name: 'Empanaditas Criollas de Carne (6 uds)', unitPrice: 22000, quantity: 1, addedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString() }
      ],
      discountPercent: 0,
      taxPercent: 8,
      tipAmount: 0,
      openedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      lastUpdatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString()
    }
  },
  {
    id: 'tbl-2',
    number: '2',
    name: 'Mesa 2',
    zone: 'Terraza Exterior',
    seats: 4,
    status: 'cuenta',
    order: {
      id: 'ord-102',
      tableId: 'tbl-2',
      tableName: 'Mesa 2',
      items: [
        { id: 'item-4', productId: 'prod-2', name: 'Vino Tinto Reserva Malbec (Copa)', unitPrice: 18000, quantity: 2, addedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString() },
        { id: 'item-5', productId: 'prod-4', name: 'Tabla Ibérica de Jamón Serrano y Quesos', unitPrice: 42000, quantity: 1, addedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
        { id: 'item-6', productId: 'prod-11', name: 'Postre Tres Leches Artesanal', unitPrice: 15000, quantity: 2, addedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }
      ],
      discountPercent: 5,
      taxPercent: 8,
      tipAmount: 10000,
      openedAt: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
      lastUpdatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    }
  },
  {
    id: 'tbl-3',
    number: '3',
    name: 'Mesa 3',
    zone: 'Terraza Exterior',
    seats: 2,
    status: 'libre'
  },
  {
    id: 'tbl-4',
    number: '4',
    name: 'Mesa 4',
    zone: 'Salón Principal',
    seats: 6,
    status: 'ocupada',
    order: {
      id: 'ord-103',
      tableId: 'tbl-4',
      tableName: 'Mesa 4',
      items: [
        { id: 'item-7', productId: 'prod-6', name: 'Hamburguesa Angus Artesanal con Queso', unitPrice: 34000, quantity: 2, notes: 'Sin cebolla', addedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
        { id: 'item-8', productId: 'prod-9', name: 'Gaseosa Postobón Manzana / Cola (350ml)', unitPrice: 6500, quantity: 2, addedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }
      ],
      discountPercent: 0,
      taxPercent: 8,
      tipAmount: 0,
      openedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      lastUpdatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  },
  {
    id: 'tbl-5',
    number: '5',
    name: 'Mesa 5',
    zone: 'Salón Principal',
    seats: 4,
    status: 'libre'
  },
  {
    id: 'tbl-6',
    number: 'B1',
    name: 'Barra 1',
    zone: 'Barra Alta',
    seats: 2,
    status: 'libre'
  }
];

const STORAGE_KEY = 'appgenerica_data_v2_cop';
const SYNC_CHANNEL_NAME = 'appgenerica_sync_bus';

// BroadcastChannel for cross-tab and cross-window real-time synchronization
let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported or restricted in environment:', e);
}

export function loadStoredData(): AppStateData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tables) && Array.isArray(parsed.products)) {
        if (!parsed.perishables || !Array.isArray(parsed.perishables)) {
          parsed.perishables = INITIAL_PERISHABLES;
          saveStoredData(parsed, false);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading localStorage:', err);
  }

  // Initial seed state in Colombian Pesos (COP)
  const initialData: AppStateData = {
    tables: INITIAL_TABLES,
    products: INITIAL_PRODUCTS,
    perishables: INITIAL_PERISHABLES,
    sales: [
      {
        id: 'tick-2026-001',
        orderId: 'ord-099',
        tableName: 'Mesa 1',
        items: [
          { id: 'it-prev1', productId: 'prod-1', name: 'Cerveza Club Colombia Dorada (330ml)', unitPrice: 8500, quantity: 2, addedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString() },
          { id: 'it-prev2', productId: 'prod-3', name: 'Papas Bravas Criollas Rústicas', unitPrice: 16000, quantity: 1, addedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString() }
        ],
        subtotal: 33000,
        taxAmount: 2640,
        taxPercent: 8,
        discountAmount: 0,
        discountPercent: 0,
        tipAmount: 3500,
        total: 39140,
        paymentMethod: 'tarjeta',
        timestamp: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
        cashierName: 'Carlos Mendoza'
      }
    ],
    version: 2,
    lastModified: new Date().toISOString()
  };

  saveStoredData(initialData, false);
  return initialData;
}

export function saveStoredData(data: AppStateData, broadcast = true): void {
  try {
    const updated = {
      ...data,
      lastModified: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    if (broadcast && syncChannel) {
      syncChannel.postMessage({ type: 'DATA_UPDATED', payload: updated });
    }

    // Async push to cloud for cross-device real-time synchronization (Customer QR scan <-> Staff POS)
    if (broadcast) {
      pushCloudState(updated).catch(() => {});
    }
  } catch (err) {
    console.error('Error saving to localStorage:', err);
  }
}

export function subscribeToSyncChannel(onUpdate: (data: AppStateData) => void): () => void {
  if (!syncChannel) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'DATA_UPDATED' && event.data?.payload) {
      onUpdate(event.data.payload);
    }
  };

  syncChannel.addEventListener('message', handler);
  return () => {
    syncChannel?.removeEventListener('message', handler);
  };
}

// =========================================================================
// CLOUD STATE SYNC ENGINE (MULTIDEVICE / VERCEL / SCAN QR)
// =========================================================================
const CLOUD_SYNC_ENDPOINT = '/api/sync/state';
const KV_FALLBACK_ENDPOINT = 'https://kvdb.io/A9z3x7L9m2K8Q4V1/gastrobar_pos_cop_sync_v2';

export function mergeAppState(local: AppStateData, remote: AppStateData): AppStateData {
  if (!remote || !Array.isArray(remote.tables)) return local;
  if (!local || !Array.isArray(local.tables)) return remote;

  const mergedTablesMap = new Map<string, Table>();

  local.tables.forEach(tbl => {
    mergedTablesMap.set(tbl.id, { ...tbl });
  });

  remote.tables.forEach(remoteTbl => {
    const localTbl = mergedTablesMap.get(remoteTbl.id);
    if (!localTbl) {
      mergedTablesMap.set(remoteTbl.id, { ...remoteTbl });
      return;
    }

    const localTime = new Date(localTbl.updatedAt || localTbl.order?.lastUpdatedAt || 0).getTime();
    const remoteTime = new Date(remoteTbl.updatedAt || remoteTbl.order?.lastUpdatedAt || 0).getTime();

    // If remote state for this table is strictly newer than local state
    if (remoteTime > localTime) {
      mergedTablesMap.set(remoteTbl.id, { ...remoteTbl });
      return;
    }

    // If local state for this table is strictly newer than remote state
    if (localTime > remoteTime) {
      mergedTablesMap.set(localTbl.id, { ...localTbl });
      return;
    }

    // Timestamps are equal or both missing: Merge fields intelligently
    // Order merging
    let mergedOrder = localTbl.order;
    if (localTbl.order && remoteTbl.order) {
      const mergedItemsMap = new Map<string, any>();
      (localTbl.order.items || []).forEach(it => mergedItemsMap.set(it.id, it));
      (remoteTbl.order.items || []).forEach(it => {
        if (!mergedItemsMap.has(it.id)) {
          mergedItemsMap.set(it.id, it);
        }
      });

      mergedOrder = {
        ...localTbl.order,
        ...remoteTbl.order,
        items: Array.from(mergedItemsMap.values()),
        lastUpdatedAt: new Date().toISOString()
      };
    } else if (remoteTbl.order) {
      // If local is free and remote has order
      mergedOrder = localTbl.status === 'libre' ? undefined : remoteTbl.order;
    } else if (localTbl.order) {
      // If remote is free and local has order
      mergedOrder = remoteTbl.status === 'libre' ? undefined : localTbl.order;
    }

    // Waiter call merging
    let mergedWaiterCall = localTbl.waiterCall;
    if (localTbl.waiterCall && remoteTbl.waiterCall) {
      const localCallTime = new Date(localTbl.waiterCall.requestedAt).getTime() || 0;
      const remoteCallTime = new Date(remoteTbl.waiterCall.requestedAt).getTime() || 0;
      mergedWaiterCall = remoteCallTime >= localCallTime ? remoteTbl.waiterCall : localTbl.waiterCall;
    } else if (remoteTbl.waiterCall) {
      mergedWaiterCall = remoteTbl.waiterCall;
    } else if (localTbl.waiterCall) {
      mergedWaiterCall = localTbl.waiterCall;
    } else {
      mergedWaiterCall = null;
    }

    // Determine status
    let status = localTbl.status;
    if (mergedOrder && mergedOrder.items && mergedOrder.items.length > 0) {
      status = (remoteTbl.status === 'cuenta' || localTbl.status === 'cuenta') ? 'cuenta' : 'ocupada';
    } else {
      status = 'libre';
    }

    mergedTablesMap.set(remoteTbl.id, {
      ...localTbl,
      ...remoteTbl,
      waiterCall: mergedWaiterCall,
      order: mergedOrder,
      status,
      updatedAt: localTbl.updatedAt || remoteTbl.updatedAt || new Date().toISOString()
    });
  });

  // Merge products
  const productsMap = new Map<string, Product>();
  (local.products || []).forEach(p => productsMap.set(p.id, p));
  (remote.products || []).forEach(p => {
    if (!productsMap.has(p.id)) productsMap.set(p.id, p);
  });

  // Merge sales
  const salesMap = new Map<string, SaleReceipt>();
  (local.sales || []).forEach(s => salesMap.set(s.id, s));
  (remote.sales || []).forEach(s => salesMap.set(s.id, s));

  // Merge perishables
  const perishablesMap = new Map<string, PerishableItem>();
  (local.perishables || []).forEach(p => perishablesMap.set(p.id, p));
  (remote.perishables || []).forEach(p => {
    if (!perishablesMap.has(p.id)) perishablesMap.set(p.id, p);
  });

  return {
    version: 2,
    lastModified: new Date().toISOString(),
    tables: Array.from(mergedTablesMap.values()),
    products: Array.from(productsMap.values()),
    sales: Array.from(salesMap.values()),
    perishables: Array.from(perishablesMap.values())
  };
}

export async function fetchCloudState(): Promise<AppStateData | null> {
  // 1. Backend Serverless / Express
  try {
    const res = await fetch(CLOUD_SYNC_ENDPOINT, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.tables)) return data;
    }
  } catch (err) {
    // ignore
  }

  // 2. Fallback KVDB
  try {
    const res = await fetch(KV_FALLBACK_ENDPOINT, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.tables)) {
        return json as AppStateData;
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}

export async function pushCloudState(data: AppStateData): Promise<boolean> {
  let success = false;

  // 1. Post a Backend Express / Serverless
  try {
    const res = await fetch(CLOUD_SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) success = true;
  } catch (err) {
    // ignore
  }

  // 2. Post a KVDB Store
  try {
    const res = await fetch(KV_FALLBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) success = true;
  } catch (err) {
    // ignore
  }

  return success;
}
