import React, { useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Table, Product, TableStatus, OrderItem, ROLE_PERMISSIONS } from '../../types';
import { formatCOP } from '../../utils/currency';
import { extractTableBillingInfo, formatCustomerDocument, hasCustomBillingData } from '../../utils/billing';
import { calculateOrderTaxBreakdown, resolveOrderItemTax, resolveProductTax } from '../../utils/taxes';
import {
  ComandaTicketData,
  buildComandaTicketData,
  getComandaItemsSignature,
  getComandaOrderKey,
  getComandaPrintState,
  registerComandaPrint,
  triggerComandaBrowserPrint
} from '../../utils/comandaPrint';
import { auth, db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { sanitizeForFirestore } from '../../services/firestoreUserStorage';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Receipt,
  Clock,
  UserCheck,
  CreditCard,
  FileEdit,
  Sparkles,
  Percent,
  Coins,
  QrCode,
  ArrowRight,
  Save,
  RefreshCw,
  CheckCircle2,
  Printer,
  Users,
  UserPlus,
  Split,
  Merge
} from 'lucide-react';
import {
  computeOrderSubaccountsSummary,
  computeItemPaidAmount,
  computeItemPendingAmount,
  computeItemTotal,
  allocateIntegerShares,
  UNASSIGNED_SUBACCOUNT_ID,
} from '../../utils/subaccounts';
import { CategoryScrollBar } from '../common/CategoryScrollBar';
import { TableQrModal } from './TableQrModal';
import { ComandaPrintPortal } from './ComandaTicketView';

interface TableDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  onOpenCheckout: (subaccountIds?: string[]) => void;
}

export const TableDetailModal: React.FC<TableDetailModalProps> = ({
  isOpen,
  onClose,
  table,
  onOpenCheckout
}) => {
  const { user, empleadoActivo, activeRole } = useAuth();
  const {
    config,
    products,
    addItemToOrder,
    updateOrderItemQuantity,
    removeOrderItem,
    updateOrderModifiers,
    setTableStatus,
    setCustomerViewTableId,
    dismissWaiterCall,
    createPosTableSubaccount,
    assignItemSubaccount,
    splitOrderItemBetweenSubaccounts,
    mergeTableSubaccounts,
    unmergeTableSubaccounts,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [activeItemNoteId, setActiveItemNoteId] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'order'>('catalog');
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [lastAddedToast, setLastAddedToast] = useState<string | null>(null);
  const [comandaToPrint, setComandaToPrint] = useState<ComandaTicketData | null>(null);
  const [printCountTick, setPrintCountTick] = useState(0);

  // Estado local para gestión de subcuentas, unión y división de ítems en POS
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('all');
  const [newSubaccountName, setNewSubaccountName] = useState<string>('');
  const [isAddSubOpen, setIsAddSubOpen] = useState<boolean>(false);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [splittingItemId, setSplittingItemId] = useState<string | null>(null);
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitCustomAmounts, setSplitCustomAmounts] = useState<Record<string, string>>({});
  const [isMergeMode, setIsMergeMode] = useState<boolean>(false);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);

  const order = table?.order;
  const items: OrderItem[] = order?.items || (order as any)?.productos || [];
  const extractedCustomerBilling = extractTableBillingInfo(table);
  const tableSubaccounts = useMemo(
    () => (order?.subaccounts || table?.subaccounts || []).filter((s) => s.status !== 'cerrada'),
    [order?.subaccounts, table?.subaccounts]
  );
  const subaccountsOverview = useMemo(
    () => computeOrderSubaccountsSummary(order, Number(order?.taxPercent ?? config.defaultTaxRate ?? 8) || 8, table?.subaccounts),
    [order, config.defaultTaxRate, table?.subaccounts]
  );

  const isComandaPrintEnabled = config.comandaPrintSettings?.enabled !== false;
  const comandaPaperWidth = config.comandaPrintSettings?.paperWidth === '58mm' ? '58mm' : '80mm';
  const canPrintComanda = Boolean(
    isComandaPrintEnabled &&
    user &&
    ROLE_PERMISSIONS[activeRole]?.canAccessTablesAndOrders
  );
  const activePrintUid = auth.currentUser?.uid || user?.id || 'default';
  const currentOrderKey = getComandaOrderKey(table, order);
  const printStatus = useMemo(
    () => getComandaPrintState(activePrintUid, currentOrderKey),
    [activePrintUid, currentOrderKey, printCountTick]
  );

  // Filter products for catalog with useMemo for smooth performance
  const filteredProducts = useMemo(() => {
    return products.filter(prod => {
      const matchesCategory = selectedCategory === 'Todas las categorías' || prod.category === selectedCategory;
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Real-time calculations with useMemo to prevent unneeded recomputations
  const { subtotal, discountPercent, discountAmount, taxableBase, taxPercent, taxAmount, taxBuckets, tipAmount, total } = useMemo(() => {
    const discPct = Number(order?.discountPercent) || 0;
    const fallbackRate = Number(order?.taxPercent ?? config.defaultTaxRate ?? 8) || 8;
    const summary = calculateOrderTaxBreakdown(
      items as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
      {
        discountPercent: discPct,
        fallbackTaxRate: fallbackRate,
        productsCatalog: products
      }
    );
    const tip = Number(order?.tipAmount) || 0;
    const tot = summary.productsTotal + tip;

    return {
      subtotal: summary.subtotal,
      discountPercent: summary.discountPercent,
      discountAmount: summary.discountAmount,
      taxableBase: summary.taxableBase,
      taxPercent: summary.effectiveTaxPercent,
      taxAmount: summary.totalTaxAmount,
      taxBuckets: summary.buckets,
      tipAmount: tip,
      total: tot
    };
  }, [items, products, order?.discountPercent, order?.taxPercent, order?.tipAmount, config.defaultTaxRate]);

  // Guardar y sincronizar comanda
  const handleSaveAndUpdateComanda = async () => {
    const activeUid = auth.currentUser?.uid || user?.id;
    const nowIso = new Date().toISOString();
    const isOrderActive = Boolean(
      order &&
      order.id &&
      !order.closed &&
      (order as any).estado === 'activa' &&
      (order as any).status !== 'pagada' &&
      (order as any).status !== 'cobrado'
    );
    const pedidoId = isOrderActive && order?.id
      ? order.id
      : `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const fallbackRate = Number(order?.taxPercent ?? config.defaultTaxRate ?? 8) || 8;

    const cleanItems = (items || []).map((it: OrderItem) => {
      const resolvedTax = resolveOrderItemTax(
        it as unknown as Partial<OrderItem> & Record<string, unknown>,
        products,
        fallbackRate
      );
      return {
        id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: it.productId || '',
        name: it.name || 'Producto',
        unitPrice: Number(it.unitPrice) || 0,
        quantity: Number(it.quantity) || 1,
        notes: it.notes?.trim() || '',
        addedAt: it.addedAt || nowIso,
        customerName: it.customerName?.trim() || '',
        orderedBy: it.orderedBy || (empleadoActivo ? `${empleadoActivo.nombre} (${empleadoActivo.rol})` : 'mesero'),
        taxType: resolvedTax.taxType,
        taxRate: resolvedTax.taxRate,
        ...(it.subaccountId ? { subaccountId: it.subaccountId } : {}),
        ...(it.subaccountName ? { subaccountName: it.subaccountName } : {}),
        ...(it.isShared !== undefined ? { isShared: Boolean(it.isShared) } : {}),
        ...(Array.isArray(it.allocations) && it.allocations.length > 0 ? { allocations: it.allocations } : {}),
        ...(it.inventoryDeducted !== undefined ? { inventoryDeducted: Boolean(it.inventoryDeducted) } : {}),
        ...(it.paidAmount !== undefined ? { paidAmount: Number(it.paidAmount) } : {}),
        ...(it.paidQuantity !== undefined ? { paidQuantity: Number(it.paidQuantity) } : {}),
      };
    });

    const datosDelPedido = {
      id: pedidoId,
      tableId: table?.id || '',
      tableName: table?.name || 'Mesa',
      ...(order?.tableSessionId || table?.tableSessionId
        ? { tableSessionId: order?.tableSessionId || table?.tableSessionId }
        : {}),
      ...(tableSubaccounts.length > 0 ? { subaccounts: tableSubaccounts } : {}),
      ...(order?.paymentsTotal !== undefined ? { paymentsTotal: order.paymentsTotal } : {}),
      ...(order?.pendingBalance !== undefined ? { pendingBalance: order.pendingBalance } : {}),
      items: cleanItems,
      productos: cleanItems,
      subtotal: Math.round(subtotal),
      taxPercent: Number(taxPercent) || 0,
      taxAmount: Math.round(taxAmount),
      discountPercent: Number(discountPercent) || 0,
      discountAmount: Math.round(discountAmount),
      tipAmount: Number(tipAmount) || 0,
      total: Math.round(total),
      status: 'activa',
      estado: 'activa',
      closed: false,
      openedAt: order?.openedAt || nowIso,
      lastUpdatedAt: nowIso,
      userId: activeUid || '',
      customerName: order?.customerName || (order as any)?.nombreCliente || '',
      nombreCliente: (order as any)?.customerName || (order as any)?.nombreCliente || '',
      billingInfo: order?.billingInfo || table?.waiterCall?.billingInfo || null,
      comentario: (order as any)?.notes || (order as any)?.comentario || '',
      mesa: table?.name || 'Mesa',
      empleado: empleadoActivo ? `${empleadoActivo.nombre} (${empleadoActivo.rol})` : (user?.name || 'Caja'),
      atendidoPor: empleadoActivo?.nombre || user?.name || 'Mesero'
    };

    setIsLoading(true);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    try {
      if (!activeUid) {
        throw new Error('No hay sesión activa de usuario en Firebase.');
      }
      if (!table) {
        throw new Error('No se encontró la información de la mesa.');
      }
      if (cleanItems.length === 0) {
        throw new Error('No hay productos en la comanda para guardar.');
      }

      const sanitizedOrderPayload = sanitizeForFirestore(datosDelPedido);
      const pedidoRef = doc(db, 'users', activeUid, 'pedidos', pedidoId);
      await setDoc(pedidoRef, sanitizedOrderPayload);

      const rawTablePayload = {
        id: table.id || '',
        number: Number(table.number) || 1,
        name: table.name || 'Mesa',
        seats: Number(table.seats) || 2,
        zone: table.zone || 'Salón Principal',
        status: (table.status === 'libre' && cleanItems.length > 0 ? 'ocupada' : table.status) as TableStatus,
        order: sanitizedOrderPayload,
        updatedAt: nowIso,
        userId: activeUid,
        waiterCall: table.waiterCall ? {
          type: table.waiterCall.type || 'waiter',
          requestedAt: table.waiterCall.requestedAt || nowIso,
          message: table.waiterCall.message || '',
          ...(table.waiterCall.preferredPaymentMethod
            ? { preferredPaymentMethod: table.waiterCall.preferredPaymentMethod }
            : {}),
          ...(table.waiterCall.billingInfo ? { billingInfo: table.waiterCall.billingInfo } : {})
        } : null
      };

      const sanitizedTablePayload = sanitizeForFirestore(rawTablePayload);
      await setDoc(doc(db, 'users', activeUid, 'mesas', table.id), sanitizedTablePayload);

      setSaveSuccessMsg('Comanda guardada');
      setTimeout(() => {
        setSaveSuccessMsg(null);
        onClose();
      }, 700);
    } catch (error: any) {
      console.error("Error al actualizar:", error);
      setSaveErrorMsg(error?.message || String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Eliminación estricta de producto con control de errores extremo y persistencia inmediata en Firebase
  const eliminarProducto = async (idEliminar: string) => {
    if (!idEliminar || typeof idEliminar !== 'string') {
      setSaveErrorMsg('El ID del producto a eliminar no es válido.');
      return;
    }

    if (!table?.id || typeof table.id !== 'string') {
      setSaveErrorMsg('El ID de la mesa no es válido.');
      return;
    }

    const activeUid = auth.currentUser?.uid || user?.id;
    if (!activeUid) {
      setSaveErrorMsg('No hay sesión de usuario autenticada en Firebase.');
      return;
    }

    const targetToRemove = (items || []).find((it) => it.id === idEliminar);
    if (targetToRemove && computeItemPaidAmount(targetToRemove) > 0) {
      setSaveErrorMsg('No se puede eliminar un producto que ya tiene pagos parciales o totales registrados.');
      return;
    }

    const nowIso = new Date().toISOString();
    const remainingItems = (items || []).filter(item => item.id !== idEliminar);
    const pedidoId = order?.id || `ord-${table.id}`;

    if (!pedidoId) {
      setSaveErrorMsg('El ID de la comanda no es válido.');
      return;
    }

    // 1. Actualización optimista local en React Context
    removeOrderItem(table.id, idEliminar);

    if (remainingItems.length > 0) {
      const fallbackRate = Number(order?.taxPercent ?? config.defaultTaxRate ?? 8) || 8;
      const cleanRemaining = remainingItems.map(it => {
        const resolvedTax = resolveOrderItemTax(
          it as unknown as Partial<OrderItem> & Record<string, unknown>,
          products,
          fallbackRate
        );
        return {
          id: it.id || `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: it.productId || '',
          name: it.name || 'Producto',
          unitPrice: Number(it.unitPrice) || 0,
          quantity: Number(it.quantity) || 1,
          notes: it.notes?.trim() || '',
          addedAt: it.addedAt || nowIso,
          customerName: it.customerName?.trim() || '',
          orderedBy: it.orderedBy || 'mesero',
          taxType: resolvedTax.taxType,
          taxRate: resolvedTax.taxRate,
          ...(it.subaccountId ? { subaccountId: it.subaccountId } : {}),
          ...(it.subaccountName ? { subaccountName: it.subaccountName } : {}),
          ...(it.isShared !== undefined ? { isShared: Boolean(it.isShared) } : {}),
          ...(Array.isArray(it.allocations) && it.allocations.length > 0 ? { allocations: it.allocations } : {}),
          ...(it.inventoryDeducted !== undefined ? { inventoryDeducted: Boolean(it.inventoryDeducted) } : {}),
          ...(it.paidAmount !== undefined ? { paidAmount: Number(it.paidAmount) } : {}),
          ...(it.paidQuantity !== undefined ? { paidQuantity: Number(it.paidQuantity) } : {}),
        };
      });

      const remSummary = calculateOrderTaxBreakdown(
        cleanRemaining as unknown as Array<Partial<OrderItem> & Record<string, unknown>>,
        {
          discountPercent: Number(order?.discountPercent) || 0,
          fallbackTaxRate: fallbackRate,
          productsCatalog: products
        }
      );
      const newSubtotal = remSummary.subtotal;
      const newDiscount = remSummary.discountAmount;
      const newTax = remSummary.totalTaxAmount;
      const newTip = Number(order?.tipAmount) || 0;
      const newTotal = remSummary.productsTotal + newTip;

      const orderPayload = sanitizeForFirestore({
        id: pedidoId,
        tableId: table.id,
        tableName: table.name || 'Mesa',
        ...(order?.tableSessionId || table?.tableSessionId
          ? { tableSessionId: order?.tableSessionId || table?.tableSessionId }
          : {}),
        ...(tableSubaccounts.length > 0 ? { subaccounts: tableSubaccounts } : {}),
        ...(order?.paymentsTotal !== undefined ? { paymentsTotal: order.paymentsTotal } : {}),
        items: cleanRemaining,
        productos: cleanRemaining,
        subtotal: Math.round(newSubtotal),
        taxPercent: Number(order?.taxPercent ?? config.defaultTaxRate) || 0,
        taxAmount: Math.round(newTax),
        discountPercent: Number(order?.discountPercent) || 0,
        discountAmount: Math.round(newDiscount),
        tipAmount: Math.round(newTip),
        total: Math.round(newTotal),
        customerName: order?.customerName || (order as any)?.nombreCliente || '',
        nombreCliente: order?.customerName || (order as any)?.nombreCliente || '',
        billingInfo: order?.billingInfo || table?.waiterCall?.billingInfo || null,
        status: 'activa',
        estado: 'activa',
        closed: false,
        lastUpdatedAt: nowIso,
        userId: activeUid
      });

      try {
        const pedidoRef = doc(db, 'users', activeUid, 'pedidos', pedidoId);
        await setDoc(pedidoRef, orderPayload);
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE:", error);
        setSaveErrorMsg("Error al actualizar comanda: " + (error instanceof Error ? error.message : String(error)));
      }

      const tablePayload = sanitizeForFirestore({
        id: table.id,
        status: 'ocupada',
        estado: 'ocupada',
        order: orderPayload,
        currentOrder: orderPayload,
        pedidoActual: orderPayload,
        updatedAt: nowIso,
        userId: activeUid
      });

      try {
        const mesaRef = doc(db, 'users', activeUid, 'mesas', table.id);
        await setDoc(mesaRef, tablePayload, { merge: true });
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE:", error);
        setSaveErrorMsg("Error al actualizar mesa: " + (error instanceof Error ? error.message : String(error)));
      }
    } else {
      const tableFreePayload = sanitizeForFirestore({
        id: table.id,
        status: 'libre',
        estado: 'libre',
        order: null,
        currentOrder: null,
        pedidoActual: null,
        updatedAt: nowIso,
        userId: activeUid
      });

      try {
        const mesaRef = doc(db, 'users', activeUid, 'mesas', table.id);
        await setDoc(mesaRef, tableFreePayload, { merge: true });
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE:", error);
        setSaveErrorMsg("Error al liberar mesa: " + (error instanceof Error ? error.message : String(error)));
      }

      const orderCancelPayload = sanitizeForFirestore({
        id: pedidoId,
        status: 'cancelado',
        estado: 'cerrado',
        closed: true,
        closedAt: nowIso,
        items: [],
        productos: []
      });

      try {
        const pedidoRef = doc(db, 'users', activeUid, 'pedidos', pedidoId);
        await setDoc(pedidoRef, orderCancelPayload, { merge: true });
      } catch (error) {
        console.error("ERROR CRÍTICO EN FIREBASE:", error);
        setSaveErrorMsg("Error al cancelar comanda vacía: " + (error instanceof Error ? error.message : String(error)));
      }
    }
  };

  if (!isOpen) return null;

  const handleProductTap = (product: Product) => {
    addItemToOrder(table.id, product, 1);
    setLastAddedToast(`+1 ${product.name}`);
    setTimeout(() => {
      setLastAddedToast(null);
    }, 2200);
  };

  const handleStatusChange = (newStatus: TableStatus) => {
    setTableStatus(table.id, newStatus);
  };

  const handleSaveNote = (itemId: string) => {
    // Note is saved directly by updating the item
    // In our order model, notes can be edited
    setActiveItemNoteId(null);
    setItemNoteText('');
  };

  // Impresión manual de comanda (operación estrictamente de lectura: no altera pedido, mesa ni inventario)
  const handlePrintComanda = () => {
    if (!canPrintComanda || items.length === 0) return;

    const signature = getComandaItemsSignature(
      items as unknown as Array<Partial<OrderItem> & Record<string, unknown>>
    );
    const { isReprint, printNumber } = registerComandaPrint(
      activePrintUid,
      currentOrderKey,
      signature
    );

    const fallbackEmployee = empleadoActivo
      ? `${empleadoActivo.nombre} (${empleadoActivo.rol})`
      : (user?.name || '');

    const ticket = buildComandaTicketData({
      table,
      order,
      restaurantName: config.businessName,
      fallbackEmployeeName: fallbackEmployee,
      isReprint,
      printNumber,
      printedAt: new Date(),
    });

    flushSync(() => {
      setComandaToPrint(ticket);
      setPrintCountTick((prev) => prev + 1);
    });

    triggerComandaBrowserPrint(comandaPaperWidth);
  };

  const formattedOpenedTime = order?.openedAt
    ? new Date(order.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div 
        className="relative w-full max-w-6xl max-h-[96vh] h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close X Button - ALWAYS visible on vertical mobile & desktop */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar comanda"
          title="Cerrar ventana"
          className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-50 p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Top Header Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between shrink-0 pr-14 sm:pr-20">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-black text-base sm:text-lg shadow-sm shrink-0 ${
              table.status === 'ocupada'
                ? 'bg-red-600 text-white'
                : table.status === 'cuenta'
                ? 'bg-purple-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}>
              {table.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                  {table.name}
                </h2>
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                  {table.zone}
                </span>
                <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  table.status === 'ocupada'
                    ? 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                    : table.status === 'cuenta'
                    ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/60'
                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                }`}>
                  {table.status === 'ocupada' ? '● Ocupada' : table.status === 'cuenta' ? '● Pidiendo Cuenta' : '● Libre'}
                </span>
                <span className="hidden sm:inline-flex text-xs text-slate-500 items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  {table.seats} plazas
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formattedOpenedTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-stone-500" />
                    Abierta a las {formattedOpenedTime}
                  </span>
                )}
                <span>·</span>
                <span>{items.reduce((sum, it) => sum + it.quantity, 0)} items</span>
              </div>
            </div>
          </div>

          {/* Quick status pill buttons & QR */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden sm:flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-md text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleStatusChange('libre')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  table.status === 'libre'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Libre
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('ocupada')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  table.status === 'ocupada'
                    ? 'bg-rose-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Ocupada
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('cuenta')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  table.status === 'cuenta'
                    ? 'bg-purple-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Cuenta
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              title="Ver código QR de la mesa para clientes"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition cursor-pointer shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden md:inline">QR Carta</span>
            </button>
          </div>
        </div>

        {/* Waiter / Bill Call Alert Banner in Comanda */}
        {table.waiterCall && (
          <div className={`px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between text-xs border-b ${
            table.waiterCall.type === 'bill'
              ? 'bg-purple-100 text-purple-950 dark:bg-purple-950/80 dark:text-purple-200 border-purple-200 dark:border-purple-800'
              : 'bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-200 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              <span className="text-base">{table.waiterCall.type === 'bill' ? '💳' : '🛎️'}</span>
              <span>
                {table.waiterCall.type === 'bill'
                  ? '¡El cliente solicitó la cuenta para esta mesa!'
                  : '¡El cliente solicitó atención del mesero en esta mesa!'}
              </span>
              {table.waiterCall.message && (
                <span className="font-normal opacity-85 hidden sm:inline">
                  — {table.waiterCall.message}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissWaiterCall(table.id)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-[11px] font-extrabold shadow-xs hover:bg-slate-50 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              Atendido
            </button>
          </div>
        )}

        {/* Mobile Navigation Tabs (visible only on phones & small screens < lg) */}
        <div className="lg:hidden flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              mobileTab === 'catalog'
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>1. Catálogo ({filteredProducts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('order')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              mobileTab === 'order'
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-orange-500" />
            <span>2. Comanda ({items.reduce((sum, it) => sum + it.quantity, 0)})</span>
            {items.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-orange-600 text-white">
                {formatCOP(total)}
              </span>
            )}
          </button>
        </div>

        {/* Main 2-Column POS Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left / Top (Mobile): Product Catalog Picker */}
          <div className={`lg:col-span-7 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden ${
            mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
          }`}>
            
            {/* Search and Category Filters */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar producto por nombre o código (ej. Bravas, Cerveza)..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/50"
                />
              </div>

              {/* Category pills with full smooth scroll, wheel, mouse-drag and chevron buttons */}
              <CategoryScrollBar
                categories={config.categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                accentColor="orange"
              />
            </div>

            {/* Products Grid */}
            <div className="flex-1 p-4 overflow-y-auto relative">
              {/* Added Toast Notification on Mobile/Desktop */}
              {lastAddedToast && (
                <div className="sticky top-2 z-30 mx-auto max-w-xs px-3 py-1.5 rounded-full bg-slate-900/90 text-white dark:bg-white/90 dark:text-slate-900 text-xs font-black shadow-lg flex items-center justify-center gap-1.5 animate-in fade-in zoom-in">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400 dark:text-orange-600" />
                  <span>{lastAddedToast}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map((product) => {
                  const isLowStock = product.stock <= product.minStock;
                  const isOutOfStock = product.stock <= 0;
                  const inOrderQty = items.reduce((sum, it) => it.productId === product.id ? sum + it.quantity : sum, 0);

                  return (
                    <button
                      key={product.id}
                      id={`prod-card-${product.id}`}
                      onClick={() => handleProductTap(product)}
                      disabled={isOutOfStock}
                      className={`group flex flex-col text-left p-2.5 rounded-2xl border transition-all duration-150 cursor-pointer ${
                        isOutOfStock
                          ? 'opacity-40 bg-slate-100 dark:bg-slate-800/40 border-dashed border-slate-300 dark:border-slate-700 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-orange-500 dark:hover:border-orange-500 hover:shadow-md active:scale-[0.98]'
                      }`}
                    >
                      <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden mb-2 bg-slate-100 dark:bg-slate-700">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        {inOrderQty > 0 && (
                          <span className="absolute bottom-1 left-1 bg-orange-600 text-white font-mono font-black text-[10px] px-2 py-0.5 rounded-full shadow-md">
                            {inOrderQty} en comanda
                          </span>
                        )}
                        {isLowStock && !isOutOfStock && (
                          <span className="absolute top-1 right-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-amber-500 text-white shadow-xs">
                            ¡Stock {product.stock}!
                          </span>
                        )}
                        {isOutOfStock && (
                          <span className="absolute top-1 right-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-rose-600 text-white shadow-xs">
                            Agotado
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">
                            {product.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {product.category} · {resolveProductTax(product, config.defaultTaxRate).shortLabel}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-orange-600 dark:text-orange-400">
                            {formatCOP(product.price, false)}
                          </span>
                          <span className="w-6 h-6 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-bold group-hover:bg-orange-600 group-hover:text-white transition">
                            <Plus className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Bottom Floating Order Bar */}
            {items.length > 0 && (
              <div className="lg:hidden p-3 bg-slate-900 text-white border-t border-slate-800 flex items-center justify-between gap-2 shadow-xl shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Comanda actual</p>
                  <p className="text-xs font-extrabold text-white truncate">
                    {items.reduce((sum, it) => sum + it.quantity, 0)} ítems · <span className="text-orange-400">{formatCOP(total)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileTab('order')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-md cursor-pointer shrink-0"
                >
                  <span>Ver Comanda</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>

          {/* Right / Live Bill Ticket Pane */}
          <div className="lg:col-span-5 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
            
            {/* Bill Ticket Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-orange-500" />
                  <span>Cuenta en Vivo</span>
                </span>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                  {items.length} líneas · Atiende: {empleadoActivo?.nombre || user?.name || 'Caja'}
                </span>
              </div>
              {hasCustomBillingData(extractedCustomerBilling.billing) && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                  <span className="truncate">
                    Cobrar a: <strong className="text-slate-900 dark:text-white">{extractedCustomerBilling.billing.customerName || 'Consumidor Final'}</strong>
                    {extractedCustomerBilling.billing.documentNumber
                      ? ` · ${formatCustomerDocument(extractedCustomerBilling.billing.documentType, extractedCustomerBilling.billing.documentNumber)}`
                      : ''}
                    {extractedCustomerBilling.billing.email
                      ? ` · ${extractedCustomerBilling.billing.email}`
                      : ''}
                  </span>
                  {extractedCustomerBilling.billing.requiresElectronicInvoice && (
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 shrink-0">
                      Factura Electrónica
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Subcuentas y División de Cuenta (POS) */}
            {items.length > 0 && (
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                    <span>Subcuentas ({tableSubaccounts.length})</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {tableSubaccounts.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMergeMode((v) => !v);
                          setMergeSelectedIds([]);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                          isMergeMode
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <Merge className="w-3 h-3" />
                        <span>{isMergeMode ? 'Cancelar unión' : 'Unir cuentas'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAddSubOpen((v) => !v)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ Subcuenta</span>
                    </button>
                  </div>
                </div>

                {isAddSubOpen && (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newSubaccountName}
                      onChange={(e) => setNewSubaccountName(e.target.value)}
                      placeholder="Nombre del comensal..."
                      className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const created = createPosTableSubaccount(table.id, newSubaccountName);
                        if (created) {
                          setSelectedSubFilter(created.id);
                          setNewSubaccountName('');
                          setIsAddSubOpen(false);
                        }
                      }}
                      disabled={!newSubaccountName.trim()}
                      className="px-2.5 py-1 rounded bg-stone-900 text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Crear
                    </button>
                  </div>
                )}

                {isMergeMode && (
                  <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-1.5 text-[11px]">
                    <p className="font-semibold text-purple-900 dark:text-purple-200">
                      Selecciona 2 o más subcuentas para unirlas en un mismo cobro:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tableSubaccounts.map((sub) => {
                        const checked = mergeSelectedIds.includes(sub.id);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() =>
                              setMergeSelectedIds((prev) =>
                                prev.includes(sub.id)
                                  ? prev.filter((id) => id !== sub.id)
                                  : [...prev, sub.id]
                              )
                            }
                            className={`px-2 py-0.5 rounded font-bold border cursor-pointer ${
                              checked
                                ? 'bg-purple-700 text-white border-purple-700'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-purple-200 dark:border-purple-700'
                            }`}
                          >
                            {sub.displayName}
                          </button>
                        );
                      })}
                    </div>
                    {mergeSelectedIds.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          mergeTableSubaccounts(table.id, mergeSelectedIds.slice(1), mergeSelectedIds[0]);
                          setIsMergeMode(false);
                          setMergeSelectedIds([]);
                        }}
                        className="px-3 py-1 rounded bg-purple-700 text-white font-bold cursor-pointer"
                      >
                        Confirmar Unión ({mergeSelectedIds.length})
                      </button>
                    )}
                  </div>
                )}

                {(tableSubaccounts.length > 0 || subaccountsOverview.unassignedItemCount > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedSubFilter('all')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                        selectedSubFilter === 'all'
                          ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Todos ({formatCOP(subaccountsOverview.tablePendingNetWithTax, false)})
                    </button>

                    {subaccountsOverview.unassignedItemCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSubFilter(UNASSIGNED_SUBACCOUNT_ID)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                          selectedSubFilter === UNASSIGNED_SUBACCOUNT_ID
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        General ({formatCOP(subaccountsOverview.unassignedPendingGross, false)})
                      </button>
                    )}

                    {subaccountsOverview.subaccounts.map((sub) => (
                      <div key={sub.subaccountId} className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedSubFilter(sub.subaccountId)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer flex items-center gap-1 ${
                            selectedSubFilter === sub.subaccountId
                              ? 'bg-rose-900 text-white border-rose-900'
                              : sub.status === 'pidiendo_cuenta'
                                ? 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span>{sub.displayName}</span>
                          <span className="font-mono">
                            {sub.pendingNetWithTax <= 0 ? 'Pagada' : formatCOP(sub.pendingNetWithTax, false)}
                          </span>
                        </button>
                        {sub.mergedGroupName && !sub.mergedIntoSubaccountId && (
                          <button
                            type="button"
                            onClick={() => unmergeTableSubaccounts(table.id, sub.subaccountId)}
                            title="Separar subcuentas unidas"
                            className="px-1 py-0.5 text-[9px] font-bold text-purple-700 dark:text-purple-300 hover:underline cursor-pointer"
                          >
                            Separar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Items List in Order */}
            <div className={`flex-1 overflow-y-auto space-y-2 ${items.length === 0 ? 'p-0 md:p-4' : 'p-4'}`}>
              {items.length === 0 ? (
                <div className="hidden md:flex h-full flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                    No hay consumos añadidos
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Selecciona cualquier producto del catálogo de la izquierda para sumar a la cuenta de {table.name}.
                  </p>
                </div>
              ) : (
                items
                  .filter((item) => {
                    if (selectedSubFilter === 'all') return true;
                    if (selectedSubFilter === UNASSIGNED_SUBACCOUNT_ID) {
                      return !item.subaccountId && !item.isShared;
                    }
                    if (item.subaccountId === selectedSubFilter) return true;
                    if (item.isShared && item.allocations?.some((a) => a.subaccountId === selectedSubFilter)) {
                      return true;
                    }
                    return false;
                  })
                  .map((item) => {
                    const itemPaid = computeItemPaidAmount(item);
                    const itemPending = computeItemPendingAmount(item);
                    const itemTotal = computeItemTotal(item);
                    const isMovingThis = movingItemId === item.id;
                    const isSplittingThis = splittingItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border transition space-y-2 ${
                          itemPending <= 0
                            ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {item.name}
                              </p>
                              {item.subaccountName && !item.isShared && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-300 text-[10px] font-bold">
                                  {item.subaccountName}
                                </span>
                              )}
                              {item.isShared && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                  Compartido
                                </span>
                              )}
                              {itemPending <= 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px] font-bold">
                                  Pagado
                                </span>
                              )}
                              {itemPaid > 0 && itemPending > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                  Abonado {formatCOP(itemPaid, false)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono tabular-nums text-slate-500">
                              {formatCOP(item.unitPrice, false)} / ud ·{' '}
                              {
                                resolveOrderItemTax(
                                  item as unknown as Partial<OrderItem> & Record<string, unknown>,
                                  products,
                                  config.defaultTaxRate
                                ).shortLabel
                              }
                            </p>
                            {item.isShared && Array.isArray(item.allocations) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.allocations.map((alloc) => (
                                  <span
                                    key={alloc.subaccountId}
                                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                      alloc.paid
                                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 line-through'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {alloc.subaccountName}: {formatCOP(alloc.shareAmount, false)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Quantity Stepper & Price */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {itemPaid <= 0 && (
                              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => updateOrderItemQuantity(table.id, item.id, -1)}
                                  className="p-1 text-slate-500 hover:text-orange-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-2 text-xs font-bold font-mono text-slate-900 dark:text-white">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateOrderItemQuantity(table.id, item.id, 1)}
                                  className="p-1 text-slate-500 hover:text-orange-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            <span className="w-16 text-right font-mono font-bold text-xs text-slate-900 dark:text-white">
                              {formatCOP(itemTotal, false)}
                            </span>

                            {itemPaid <= 0 && tableSubaccounts.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSplittingItemId(null);
                                    setMovingItemId(isMovingThis ? null : item.id);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-700 text-[10px] font-bold"
                                  title="Mover a subcuenta"
                                >
                                  Mover
                                </button>
                                {tableSubaccounts.length >= 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMovingItemId(null);
                                      if (isSplittingThis) {
                                        setSplittingItemId(null);
                                      } else {
                                        setSplittingItemId(item.id);
                                        setSplitMode('equal');
                                        const initIds = tableSubaccounts.slice(0, 2).map((s) => s.id);
                                        setSplitParticipantIds(initIds);
                                        const shares = allocateIntegerShares(itemTotal, initIds.length);
                                        const map: Record<string, string> = {};
                                        initIds.forEach((sid, idx) => {
                                          map[sid] = String(shares[idx]);
                                        });
                                        setSplitCustomAmounts(map);
                                      }
                                    }}
                                    className="p-1 text-slate-500 hover:text-amber-600"
                                    title="Dividir producto compartido"
                                  >
                                    <Split className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}

                            {itemPaid <= 0 && (
                              <button
                                type="button"
                                onClick={() => eliminarProducto(item.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition"
                                title="Eliminar producto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isMovingThis && (
                          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-slate-500 font-semibold">Mover a:</span>
                            <button
                              type="button"
                              onClick={() => {
                                assignItemSubaccount(table.id, item.id, undefined, undefined);
                                setMovingItemId(null);
                              }}
                              className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-bold cursor-pointer"
                            >
                              Cuenta General
                            </button>
                            {tableSubaccounts.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  assignItemSubaccount(table.id, item.id, sub.id, sub.displayName);
                                  setMovingItemId(null);
                                }}
                                className="px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 font-bold cursor-pointer"
                              >
                                {sub.displayName}
                              </button>
                            ))}
                          </div>
                        )}

                        {isSplittingThis && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                Dividir {formatCOP(itemTotal)} entre:
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSplitMode('equal')}
                                  className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                                    splitMode === 'equal' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200'
                                  }`}
                                >
                                  Partes iguales
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSplitMode('custom')}
                                  className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                                    splitMode === 'custom' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200'
                                  }`}
                                >
                                  Montos exactos
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {tableSubaccounts.map((sub) => {
                                const selected = splitParticipantIds.includes(sub.id);
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    onClick={() => {
                                      const nextIds = selected
                                        ? splitParticipantIds.filter((id) => id !== sub.id)
                                        : [...splitParticipantIds, sub.id];
                                      setSplitParticipantIds(nextIds);
                                      if (nextIds.length > 0) {
                                        const shares = allocateIntegerShares(itemTotal, nextIds.length);
                                        const map: Record<string, string> = {};
                                        nextIds.forEach((sid, idx) => {
                                          map[sid] = String(shares[idx]);
                                        });
                                        setSplitCustomAmounts(map);
                                      }
                                    }}
                                    className={`px-2 py-0.5 rounded font-bold border cursor-pointer ${
                                      selected
                                        ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {sub.displayName}
                                  </button>
                                );
                              })}
                            </div>

                            {splitMode === 'custom' && splitParticipantIds.length >= 2 && (
                              <div className="grid grid-cols-2 gap-1.5">
                                {splitParticipantIds.map((sid) => {
                                  const sObj = tableSubaccounts.find((s) => s.id === sid);
                                  return (
                                    <div key={sid} className="flex items-center gap-1">
                                      <span className="truncate text-[10px] font-semibold w-16">
                                        {sObj?.displayName}:
                                      </span>
                                      <input
                                        type="number"
                                        value={splitCustomAmounts[sid] || ''}
                                        onChange={(e) =>
                                          setSplitCustomAmounts((prev) => ({
                                            ...prev,
                                            [sid]: e.target.value,
                                          }))
                                        }
                                        className="flex-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-[11px]"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSplittingItemId(null)}
                                className="px-2 py-0.5 rounded border border-slate-200 text-slate-600 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                disabled={splitParticipantIds.length < 2}
                                onClick={() => {
                                  try {
                                    const participants = tableSubaccounts.filter((s) =>
                                      splitParticipantIds.includes(s.id)
                                    );
                                    if (splitMode === 'equal') {
                                      splitOrderItemBetweenSubaccounts(
                                        table.id,
                                        item.id,
                                        'equal',
                                        participants.map((p) => ({ id: p.id, displayName: p.displayName }))
                                      );
                                    } else {
                                      const customShares = participants.map((p) => ({
                                        subaccountId: p.id,
                                        subaccountName: p.displayName,
                                        shareAmount: Number(splitCustomAmounts[p.id] || 0),
                                      }));
                                      splitOrderItemBetweenSubaccounts(table.id, item.id, 'custom', customShares);
                                    }
                                    setSplittingItemId(null);
                                    setSaveErrorMsg(null);
                                  } catch (err: any) {
                                    setSaveErrorMsg(err?.message || 'Error al dividir producto');
                                  }
                                }}
                                className="px-2.5 py-0.5 rounded bg-amber-600 text-white font-bold disabled:opacity-40 cursor-pointer"
                              >
                                Aplicar división
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>

            {/* Calculations & Order Adjustments Panel */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-3">
              
              {/* Discount & Tax Selectors */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Percent className="w-3 h-3 text-orange-500" />
                    Descuento comensal
                  </label>
                  <select
                    value={discountPercent}
                    onChange={(e) => updateOrderModifiers(table.id, { discountPercent: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value={0}>Sin descuento (0%)</option>
                    <option value={5}>Cortesía 5%</option>
                    <option value={10}>Amigo/Familiar 10%</option>
                    <option value={15}>Promoción 15%</option>
                    <option value={20}>Especial 20%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-500" />
                    Propina sugerida
                  </label>
                  <select
                    value={tipAmount}
                    onChange={(e) => updateOrderModifiers(table.id, { tipAmount: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value={0}>$ 0 COP</option>
                    <option value={2000}>$ 2.000 COP</option>
                    <option value={5000}>$ 5.000 COP</option>
                    <option value={10000}>$ 10.000 COP</option>
                    <option value={20000}>$ 20.000 COP</option>
                  </select>
                </div>
              </div>

              {/* Subtotals breakdown */}
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 pt-1">
                <div className="flex justify-between">
                  <span>Subtotal consumido:</span>
                  <span className="font-mono">{new Intl.NumberFormat('es-CO').format(Math.round(subtotal))} {config.currency}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600 font-medium">
                    <span>Descuento ({discountPercent}%):</span>
                    <span className="font-mono">-{new Intl.NumberFormat('es-CO').format(Math.round(discountAmount))} {config.currency}</span>
                  </div>
                )}
                {taxBuckets.length > 0 ? (
                  taxBuckets.map((bucket) => (
                    <div key={bucket.key} className="flex justify-between text-[11px]">
                      <span>{bucket.inclusiveLabel}:</span>
                      <span className="font-mono tabular-nums">
                        {new Intl.NumberFormat('es-CO').format(Math.round(bucket.taxAmount))} {config.currency}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-[11px]">
                    <span>Exento de impuesto (0%):</span>
                    <span className="font-mono tabular-nums">0 {config.currency}</span>
                  </div>
                )}
                {taxBuckets.length > 0 && (
                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Base gravable:</span>
                    <span className="font-mono tabular-nums">
                      {new Intl.NumberFormat('es-CO').format(Math.round(taxableBase))} {config.currency}
                    </span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Propina voluntaria:</span>
                    <span className="font-mono tabular-nums">+{new Intl.NumberFormat('es-CO').format(Math.round(tipAmount))} {config.currency}</span>
                  </div>
                )}
              </div>

              {/* Error Notification Banner */}
              {saveErrorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-semibold text-xs flex items-center justify-between gap-2">
                  <span>{saveErrorMsg}</span>
                  <button
                    type="button"
                    onClick={() => setSaveErrorMsg(null)}
                    className="p-1 text-rose-500 hover:text-rose-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Success Notification Banner */}
              {saveSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-between shadow-md animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                  <span className="text-[10px] bg-emerald-700/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                    Sincronizado
                  </span>
                </div>
              )}

              {/* High-Impact Total & Action Bar */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center justify-between sm:block">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                    Total Cuenta
                  </span>
                  <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    {formatCOP(total)}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                  {/* Botón Funcional de Guardar y Actualizar Comanda en Firebase */}
                  <button
                    type="button"
                    onClick={handleSaveAndUpdateComanda}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5 rounded-md bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40 w-full sm:w-auto"
                    title="Guardar comanda y sincronizar inmediatamente con Firebase"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
                        <span>Guardando...</span>
                      </>
                    ) : saveSuccessMsg ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>{saveSuccessMsg}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-white shrink-0" />
                        <span>Guardar y Actualizar Comanda</span>
                      </>
                    )}
                  </button>

                  {canPrintComanda && (
                    <button
                      type="button"
                      onClick={handlePrintComanda}
                      disabled={items.length === 0}
                      title={
                        printStatus.hasBeenPrinted
                          ? `Reimprimir comanda completa (${comandaPaperWidth})`
                          : `Imprimir comanda manual (${comandaPaperWidth})`
                      }
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40 w-full sm:w-auto"
                    >
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>Imprimir comanda</span>
                      {printStatus.hasBeenPrinted && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          Reimpresión
                        </span>
                      )}
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        handleStatusChange('cuenta');
                        onClose();
                      }}
                      disabled={items.length === 0}
                      className="px-3 py-2.5 rounded-xl border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs font-bold transition disabled:opacity-40 text-center"
                    >
                      Pide Cuenta
                    </button>

                    <button
                      type="button"
                      id="btn-open-checkout-pos"
                      onClick={() =>
                        onOpenCheckout(
                          selectedSubFilter !== 'all' && selectedSubFilter !== UNASSIGNED_SUBACCOUNT_ID
                            ? [selectedSubFilter]
                            : undefined
                        )
                      }
                      disabled={items.length === 0}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>
                        {selectedSubFilter !== 'all' && selectedSubFilter !== UNASSIGNED_SUBACCOUNT_ID
                          ? 'Cobrar Subcuenta'
                          : 'Cobrar'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* Modal: Table QR Code & Digital Menu */}
      <TableQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        table={table}
        onOpenCustomerMenu={(tId) => {
          setIsQrModalOpen(false);
          onClose();
          setCustomerViewTableId(tId);
        }}
      />

      {/* Portal oculto en pantalla para impresión térmica manual de comanda */}
      <ComandaPrintPortal
        data={comandaToPrint}
        paperWidth={comandaPaperWidth}
      />
    </div>
  );
};
