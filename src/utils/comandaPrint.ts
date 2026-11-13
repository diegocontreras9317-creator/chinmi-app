import { ComandaPaperWidth } from '../config/appConfig';
import { Order, OrderItem, Table } from '../types';
import { formatQuantity } from './quantityPrecision';

export interface ComandaTicketItem {
  id: string;
  quantityText: string;
  name: string;
  modifiers: string[];
  notes: string;
}

export interface ComandaTicketData {
  restaurantName: string;
  title: 'COMANDA DE PREPARACIÓN';
  tableNumber: string;
  tableName: string;
  tableZone: string;
  orderNumber: string;
  orderKey: string;
  printedAt: string;
  dateLabel: string;
  timeLabel: string;
  employeeName: string;
  items: ComandaTicketItem[];
  specialNotes: string;
  isReprint: boolean;
  printNumber: number;
  isTestTicket?: boolean;
}

interface LocalPrintRecord {
  printCount: number;
  lastPrintedAt: string;
  lastSignature: string;
}

const PRINT_LOG_PREFIX = 'chinmi_comanda_print_log_';
const MAX_STORED_LOG_ENTRIES = 120;

function readStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) out.push(trimmed);
      } else if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const label = String(
          rec.name ?? rec.nombre ?? rec.label ?? rec.title ?? rec.value ?? ''
        ).trim();
        const detail = String(rec.option ?? rec.opcion ?? rec.selected ?? '').trim();
        if (label && detail) {
          out.push(`${label}: ${detail}`);
        } else if (label) {
          out.push(label);
        } else if (detail) {
          out.push(detail);
        }
      }
    }
    return out;
  }
  return [];
}

/**
 * Extrae modificadores, variantes y notas del producto sin alterar ni mutar los datos originales.
 */
export function extractComandaItemDetails(
  rawItem: Partial<OrderItem> & Record<string, unknown>
): { modifiers: string[]; notes: string } {
  const modifierSources = [
    rawItem.modifiers,
    rawItem.modificadores,
    rawItem.variants,
    rawItem.variantes,
    rawItem.selectedVariants,
    rawItem.options,
    rawItem.opciones,
    rawItem.extras,
    rawItem.variantName,
    rawItem.variante,
  ];

  const seen = new Set<string>();
  const modifiers: string[] = [];

  for (const src of modifierSources) {
    for (const label of readStringList(src)) {
      if (!seen.has(label.toLowerCase())) {
        seen.add(label.toLowerCase());
        modifiers.push(label);
      }
    }
  }

  const subaccountLabel = String(rawItem.subaccountName ?? '').trim();
  if (subaccountLabel && !seen.has(`sub:${subaccountLabel.toLowerCase()}`)) {
    modifiers.push(`Subcuenta: ${subaccountLabel}`);
  }

  const rawNotes = String(
    rawItem.notes ?? rawItem.observaciones ?? rawItem.note ?? ''
  ).trim();

  return {
    modifiers,
    notes: rawNotes,
  };
}

export function getComandaOrderKey(
  table?: Partial<Table> | null,
  order?: Partial<Order> | null
): string {
  const orderId = String(order?.id || '').trim();
  if (orderId) return orderId;
  const tableId = String(table?.id || table?.number || 'mesa').trim();
  const openedAt = String(order?.openedAt || 'activa').trim();
  return `${tableId}__${openedAt}`;
}

export function getComandaItemsSignature(
  items: Array<Partial<OrderItem> & Record<string, unknown>>
): string {
  return (items || [])
    .map((it) => {
      const qty = Number(it.quantity ?? it.cantidad ?? 1) || 1;
      const name = String(it.name ?? it.nombre ?? '').trim();
      const notes = String(it.notes ?? it.observaciones ?? '').trim();
      return `${it.productId || name}:${qty}:${notes}`;
    })
    .join('|');
}

function getStorageKey(uid?: string | null): string {
  const cleanUid = (uid || 'default').trim() || 'default';
  return `${PRINT_LOG_PREFIX}${cleanUid}`;
}

function readPrintLogMap(uid?: string | null): Record<string, LocalPrintRecord> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(getStorageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalPrintRecord>) : {};
  } catch {
    return {};
  }
}

function writePrintLogMap(uid: string | null | undefined, map: Record<string, LocalPrintRecord>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const entries = Object.entries(map);
    const trimmedEntries =
      entries.length > MAX_STORED_LOG_ENTRIES
        ? entries
            .sort((a, b) => (b[1]?.lastPrintedAt || '').localeCompare(a[1]?.lastPrintedAt || ''))
            .slice(0, MAX_STORED_LOG_ENTRIES)
        : entries;
    window.localStorage.setItem(getStorageKey(uid), JSON.stringify(Object.fromEntries(trimmedEntries)));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Consulta el historial local de impresiones de esta comanda sin modificar Firebase ni el pedido.
 */
export function getComandaPrintState(
  uid: string | null | undefined,
  orderKey: string
): { hasBeenPrinted: boolean; printCount: number; lastPrintedAt?: string } {
  if (!orderKey) return { hasBeenPrinted: false, printCount: 0 };
  const map = readPrintLogMap(uid);
  const entry = map[orderKey];
  if (!entry || entry.printCount <= 0) {
    return { hasBeenPrinted: false, printCount: 0 };
  }
  return {
    hasBeenPrinted: true,
    printCount: entry.printCount,
    lastPrintedAt: entry.lastPrintedAt,
  };
}

/**
 * Registra localmente una impresión manual para identificar futuras REIMPRESIONES.
 * Operación estrictamente local: NO crea comandas, NO descuenta stock y NO escribe en Firestore.
 */
export function registerComandaPrint(
  uid: string | null | undefined,
  orderKey: string,
  itemsSignature: string
): { isReprint: boolean; printNumber: number } {
  if (!orderKey) {
    return { isReprint: false, printNumber: 1 };
  }
  const map = readPrintLogMap(uid);
  const existing = map[orderKey];
  const prevCount = existing?.printCount || 0;
  const printNumber = prevCount + 1;
  const isReprint = prevCount >= 1;

  map[orderKey] = {
    printCount: printNumber,
    lastPrintedAt: new Date().toISOString(),
    lastSignature: itemsSignature,
  };

  writePrintLogMap(uid, map);
  return { isReprint, printNumber };
}

function formatOrderDisplayId(order?: Partial<Order> | null, table?: Partial<Table> | null): string {
  const rawId = String(order?.id || '').trim();
  if (!rawId) {
    return `M-${table?.number || '0'}`;
  }
  const clean = rawId.replace(/^ord-/i, '');
  if (clean.length <= 8) return clean.toUpperCase();
  return clean.slice(-6).toUpperCase();
}

function resolveEmployeeName(
  order?: (Partial<Order> & Record<string, unknown>) | null,
  items?: Array<Partial<OrderItem> & Record<string, unknown>>,
  fallbackEmployeeName?: string
): string {
  const fromOrder = String(
    order?.atendidoPor ?? order?.empleado ?? order?.waiterName ?? ''
  ).trim();
  if (fromOrder) return fromOrder;

  if (Array.isArray(items)) {
    for (const it of items) {
      const ob = String(it.orderedBy || '').trim();
      if (ob && ob.toLowerCase() !== 'cliente') {
        if (ob.toLowerCase() === 'camarero') return 'Mesero';
        if (ob.toLowerCase() === 'cajero') return 'Caja';
        return ob;
      }
    }
    if (items.some((it) => String(it.orderedBy || '').toLowerCase() === 'cliente')) {
      return 'Pedido QR (Cliente)';
    }
  }

  return (fallbackEmployeeName || '').trim();
}

function resolveSpecialNotes(
  table?: Partial<Table> | null,
  order?: (Partial<Order> & Record<string, unknown>) | null
): string {
  const parts: string[] = [];
  const orderComment = String(order?.comentario ?? order?.notes ?? order?.observaciones ?? '').trim();
  if (orderComment) parts.push(orderComment);

  const waiterMsg = String(table?.waiterCall?.message || '').trim();
  if (waiterMsg && !parts.includes(waiterMsg)) {
    parts.push(waiterMsg);
  }

  return parts.join(' · ');
}

/**
 * Construye los datos de la comanda térmica a partir de la información ya guardada.
 * Excluye explícitamente precios, impuestos, propinas y totales.
 */
export function buildComandaTicketData(params: {
  table: Table;
  order?: Order | null;
  restaurantName: string;
  fallbackEmployeeName?: string;
  isReprint?: boolean;
  printNumber?: number;
  printedAt?: Date;
}): ComandaTicketData {
  const {
    table,
    order,
    restaurantName,
    fallbackEmployeeName,
    isReprint = false,
    printNumber = 1,
    printedAt = new Date(),
  } = params;

  const orderRec = (order || null) as (Partial<Order> & Record<string, unknown>) | null;
  const rawItems = (
    order?.items ||
    (orderRec?.productos as Array<Partial<OrderItem> & Record<string, unknown>> | undefined) ||
    []
  ) as Array<Partial<OrderItem> & Record<string, unknown>>;

  const items: ComandaTicketItem[] = rawItems.map((it, index) => {
    const qtyNum = Number(it.quantity ?? it.cantidad ?? 1) || 1;
    const { modifiers, notes } = extractComandaItemDetails(it);
    return {
      id: String(it.id || `item-${index}`),
      quantityText: formatQuantity(qtyNum),
      name: String(it.name ?? it.nombre ?? 'Producto').trim() || 'Producto',
      modifiers,
      notes,
    };
  });

  const dateLabel = printedAt.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = printedAt.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const orderKey = getComandaOrderKey(table, order);

  return {
    restaurantName: (restaurantName || 'Mi Restaurante').trim(),
    title: 'COMANDA DE PREPARACIÓN',
    tableNumber: String(table.number || '').trim() || '1',
    tableName: String(table.name || '').trim(),
    tableZone: String(table.zone || '').trim(),
    orderNumber: formatOrderDisplayId(order, table),
    orderKey,
    printedAt: printedAt.toISOString(),
    dateLabel,
    timeLabel,
    employeeName: resolveEmployeeName(orderRec, rawItems, fallbackEmployeeName),
    items,
    specialNotes: resolveSpecialNotes(table, orderRec),
    isReprint,
    printNumber,
  };
}

/**
 * Ticket de muestra para vista previa e impresión de prueba en Administración y Configuración.
 */
export function buildSampleComandaTicketData(
  restaurantName: string,
  options?: { isReprint?: boolean }
): ComandaTicketData {
  const now = new Date();
  return {
    restaurantName: (restaurantName || 'Chinmi GastroBar & Terraza').trim(),
    title: 'COMANDA DE PREPARACIÓN',
    tableNumber: '4',
    tableName: 'Mesa 4',
    tableZone: 'Terraza Exterior',
    orderNumber: 'PRUEBA',
    orderKey: 'sample-test-comanda',
    printedAt: now.toISOString(),
    dateLabel: now.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    timeLabel: now.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    employeeName: 'Carlos (Mesero)',
    items: [
      {
        id: 'sample-1',
        quantityText: '2',
        name: 'Hamburguesa Artesanal',
        modifiers: ['Término 3/4', 'Queso Cheddar'],
        notes: 'Sin cebolla, salsa aparte',
      },
      {
        id: 'sample-2',
        quantityText: '1',
        name: 'Papas Rústicas',
        modifiers: ['Porción grande'],
        notes: '',
      },
      {
        id: 'sample-3',
        quantityText: '2',
        name: 'Limonada de Coco',
        modifiers: ['Poco hielo'],
        notes: 'Servir junto con los platos',
      },
    ],
    specialNotes: 'Alergia al maní en mesa · Ticket de prueba térmica',
    isReprint: Boolean(options?.isReprint),
    printNumber: options?.isReprint ? 2 : 1,
    isTestTicket: true,
  };
}

const DYNAMIC_PAGE_STYLE_ID = 'chinmi-comanda-page-style';

/**
 * Ejecuta la impresión manual usando las capacidades nativas del navegador y CSS @media print.
 * Debe llamarse de forma síncrona dentro del evento onClick del usuario para compatibilidad con iOS/Android.
 */
export function triggerComandaBrowserPrint(paperWidth: ComandaPaperWidth): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const widthCss = paperWidth === '58mm' ? '58mm' : '80mm';

  let styleEl = document.getElementById(DYNAMIC_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = DYNAMIC_PAGE_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: ${widthCss} auto; margin: 0mm; } }`;

  document.body.classList.add('chinmi-comanda-printing');
  document.body.setAttribute('data-comanda-paper', paperWidth);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('chinmi-comanda-printing');
    document.body.removeAttribute('data-comanda-paper');
    const el = document.getElementById(DYNAMIC_PAGE_STYLE_ID);
    if (el) el.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup, { once: true });

  window.focus();
  window.print();

  // Respaldo seguro para navegadores móviles que no disparan afterprint de forma confiable
  window.setTimeout(cleanup, 2500);
}
