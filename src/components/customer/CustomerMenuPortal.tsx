import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, Table, OrderItem, Order } from '../../types';
import { auth, db } from '../../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import {
  subscribeUserMenu,
  subscribeUserTables,
  saveTableToFirestore,
  saveOrderToFirestore,
  saveSaleToFirestore
} from '../../services/firestoreUserStorage';
import { formatCOP } from '../../utils/currency';
import { ChinmiLogo } from '../common/ChinmiLogo';
import { CategoryScrollBar } from '../common/CategoryScrollBar';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Send,
  CheckCircle2,
  Clock,
  Receipt,
  UtensilsCrossed,
  Sparkles,
  ArrowLeft,
  X,
  User,
  MessageSquare,
  AlertCircle,
  BellRing,
  CreditCard,
  Banknote,
  Smartphone,
  Eye,
  Check
} from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

interface CustomerMenuPortalProps {
  tableId: string;
  onExit?: () => void;
}

export const CustomerMenuPortal: React.FC<CustomerMenuPortalProps> = ({
  tableId,
  onExit
}) => {
  const {
    config,
    tables,
    products,
    addItemsToOrder,
    setTableStatus,
    callWaiter,
    dismissWaiterCall,
    setCustomerViewTableId,
    syncNow
  } = useApp();

  // Parse URL parameters for QR scan (restId / uid & mesa / mesaId)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlUid = searchParams.get('restId') || searchParams.get('uid') || searchParams.get('restaurante') || '';
  const urlMesa = searchParams.get('mesa') || searchParams.get('mesaId') || tableId;

  const [qrMenuProducts, setQrMenuProducts] = useState<Product[]>([]);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [isQrLoading, setIsQrLoading] = useState<boolean>(!!urlUid);

  useEffect(() => {
    if (urlUid) {
      setIsQrLoading(true);
      const unsubMenu = subscribeUserMenu(urlUid, (prods) => {
        setQrMenuProducts(prods);
        setIsQrLoading(false);
      });
      const unsubTables = subscribeUserTables(urlUid, (tbls) => {
        const found = tbls.find(t => t.id === urlMesa) || null;
        setQrTable(found);
      });
      return () => {
        unsubMenu();
        unsubTables();
      };
    } else {
      setIsQrLoading(false);
    }
  }, [urlUid, urlMesa]);

  const activeTable = qrTable || tables.find(t => t.id === urlMesa || t.id === tableId) || null;
  const activeProducts = qrMenuProducts.length > 0 ? qrMenuProducts : products;

  const table = activeTable;

  const qrSettings = config.qrSettings || {
    allowOrdering: true,
    allowCallWaiter: true,
    allowRequestBill: true,
    menuOnlyMode: false
  };

  const isMenuOnly = qrSettings.menuOnlyMode || !qrSettings.allowOrdering;
  const canOrder = qrSettings.allowOrdering && !qrSettings.menuOnlyMode;
  const canCallWaiter = qrSettings.allowCallWaiter !== false;
  const canRequestBill = qrSettings.allowRequestBill !== false;

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [activeItemForNote, setActiveItemForNote] = useState<Product | null>(null);
  const [itemNoteText, setItemNoteText] = useState('');
  const [orderSentSuccess, setOrderSentSuccess] = useState(false);

  // Modals for Waiter & Bill
  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);
  const [waiterCallReason, setWaiterCallReason] = useState<string>('Tomar pedido en la mesa');
  const [waiterCallSuccess, setWaiterCallSuccess] = useState<string | null>(null);

  const [isRequestBillModalOpen, setIsRequestBillModalOpen] = useState(false);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('tarjeta');
  const [cashAmountNote, setCashAmountNote] = useState('');
  const [billRequestSuccess, setBillRequestSuccess] = useState<string | null>(null);

  // Detail Modal for Product Image & Ingredients
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState<number>(1);
  const [detailNotes, setDetailNotes] = useState<string>('');

  const openProductDetail = (prod: Product) => {
    setSelectedProductForDetail(prod);
    setDetailQuantity(1);
    setDetailNotes('');
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      const matchesCat = selectedCategory === 'Todas las categorías' || p.category === selectedCategory;
      const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [activeProducts, selectedCategory, searchQuery]);

  // Cart totals
  const cartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  // Existing table order totals (items already ordered and cooking)
  const existingOrder = table?.order;
  const existingItemsCount = existingOrder?.items.reduce((acc, it) => acc + it.quantity, 0) || 0;
  const existingSubtotal = existingOrder?.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0) || 0;

  // Add product to cart
  const handleAddToCart = (product: Product, notes?: string) => {
    if (!canOrder) return;
    if (product.stock <= 0) return;

    setCart(prev => {
      const existingIdx = prev.findIndex(
        i => i.product.id === product.id && (i.notes || '') === (notes || '')
      );

      if (existingIdx > -1) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prev, { product, quantity: 1, notes: notes?.trim() || undefined }];
      }
    });
  };

  const handleUpdateCartQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const next = prev.map((item, idx) => {
        if (idx === index) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter((it): it is CartItem => it !== null);
      return next;
    });
  };

  const handleRemoveCartItem = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  // Submit cart order directly to kitchen/POS
  const handleSendOrder = async () => {
    if (!table || cart.length === 0 || !canOrder) return;

    // 1. Obtener restId desde URL o fallback a usuario autenticado
    const targetUid = urlUid || auth.currentUser?.uid;
    if (!targetUid) {
      alert('Error crítico de Firebase: No se encontró el restId del restaurante en la URL ni sesión activa.');
      return;
    }

    const newOrderItems: OrderItem[] = cart.map(c => ({
      id: `it-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: c.product.id,
      name: c.product.name,
      unitPrice: c.product.price,
      quantity: c.quantity,
      notes: c.notes?.trim() || undefined,
      addedAt: new Date().toISOString(),
      customerName: customerName.trim() || undefined,
      orderedBy: 'cliente'
    }));

    const nowIso = new Date().toISOString();
    const existingOrder = table.order;
    const orderId = existingOrder?.id || `ord-${Date.now()}`;
    const updatedOrder: Order = existingOrder
      ? {
          ...existingOrder,
          id: orderId,
          items: [...existingOrder.items, ...newOrderItems],
          lastUpdatedAt: nowIso
        }
      : {
          id: orderId,
          tableId: table.id,
          tableName: table.name,
          items: newOrderItems,
          discountPercent: 0,
          taxPercent: 8,
          tipAmount: 0,
          openedAt: nowIso,
          lastUpdatedAt: nowIso
        };

    const updatedTable: Table = {
      ...table,
      status: 'ocupada',
      order: updatedOrder,
      updatedAt: nowIso
    };

    try {
      // 1. Guardado explícito en la nube:
      // collection(db, 'users', targetUid, 'pedidos')
      await setDoc(doc(db, 'users', targetUid, 'pedidos', updatedOrder.id), {
        ...updatedOrder,
        userId: targetUid
      }, { merge: true });

      // Actualizar también la mesa en Firestore para que la caja la vea ocupada y con los platos
      await setDoc(doc(db, 'users', targetUid, 'mesas', table.id), {
        ...updatedTable,
        userId: targetUid
      }, { merge: true });

      // 2. Alertas visuales para depuración (Muy Importante):
      alert('Pedido enviado correctamente a la caja');
      setOrderSentSuccess(true);
      setTimeout(() => setOrderSentSuccess(false), 6000);

      // 3. Eliminación de estado fantasma:
      // NO usamos localStorage ni mutamos manualmente el estado de React con addItemsToOrder.
      // El estado en pantalla se actualiza automáticamente gracias a onSnapshot (subscribeUserTables).
      setCart([]);
      setIsCartOpen(false);
    } catch (error: any) {
      console.error('Error al guardar pedido en Firestore:', error);
      alert('Error crítico de Firebase: ' + (error?.message || String(error)));
    }
  };

  // Action: Call Waiter
  const handleConfirmCallWaiter = async () => {
    if (!table) return;
    const nowIso = new Date().toISOString();
    const msg = `Mesa ${table.number} solicita atención: ${waiterCallReason}`;

    const updatedTable: Table = {
      ...table,
      updatedAt: nowIso,
      waiterCall: {
        type: 'waiter',
        requestedAt: nowIso,
        message: msg
      }
    };

    const targetUid = urlUid || auth.currentUser?.uid;
    if (targetUid) {
      try {
        await saveTableToFirestore(updatedTable, targetUid);
      } catch (err) {
        console.error("Error guardando llamada a mesero en Firestore:", err);
      }
    }

    callWaiter(table.id, 'waiter', msg);

    setIsCallWaiterModalOpen(false);
    setWaiterCallSuccess(`¡Mesero avisado! Acudirá a tu mesa para "${waiterCallReason}".`);
    setTimeout(() => setWaiterCallSuccess(null), 8000);
  };

  // Action: Request Bill
  const handleConfirmRequestBill = async () => {
    if (!table) return;
    const methodText = paymentMethodChoice === 'efectivo'
      ? `Efectivo${cashAmountNote ? ` (paga con: ${cashAmountNote})` : ''}`
      : paymentMethodChoice === 'tarjeta'
      ? 'Tarjeta / Datáfono'
      : 'Transferencia / Nequi / Daviplata';

    const nowIso = new Date().toISOString();
    const msg = `Mesa ${table.number} solicita la cuenta. Método: ${methodText}`;

    const updatedTable: Table = {
      ...table,
      status: 'cuenta',
      updatedAt: nowIso,
      waiterCall: {
        type: 'bill',
        requestedAt: nowIso,
        message: msg
      }
    };

    const targetUid = urlUid || auth.currentUser?.uid;
    if (targetUid) {
      try {
        await saveTableToFirestore(updatedTable, targetUid);
      } catch (err) {
        console.error("Error guardando solicitud de cuenta en Firestore:", err);
      }
    }

    callWaiter(table.id, 'bill', msg);

    setIsRequestBillModalOpen(false);
    setBillRequestSuccess(`¡Cuenta solicitada! El mesero se dirige con la cuenta (${methodText}).`);
    setTimeout(() => setBillRequestSuccess(null), 8000);
  };

  const handleExitPortal = () => {
    if (onExit) {
      onExit();
    } else {
      setCustomerViewTableId(null);
      if (typeof window !== 'undefined' && window.history) {
        const url = new URL(window.location.href);
        url.searchParams.delete('mesa');
        url.searchParams.delete('qr');
        window.history.replaceState({}, '', url.pathname);
      }
    }
  };

  if (isQrLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-pink-200 dark:border-pink-950 border-t-[#681841] dark:border-t-pink-500 animate-spin mb-4" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Cargando menú de la mesa...</p>
      </div>
    );
  }

  if (!urlUid || !urlMesa || !table) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-24 rounded-3xl bg-pink-100 dark:bg-pink-950/80 text-[#681841] dark:text-pink-300 flex items-center justify-center text-4xl mb-5 shadow-lg border border-pink-200 dark:border-pink-900/60">
          📱
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white max-w-sm">
          Escanea el código QR de tu mesa para ver el menú
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 mb-8 leading-relaxed">
          Para consultar la carta digital, pedir platos o llamar al mesero, apunta la cámara de tu celular al código QR ubicado sobre tu mesa.
        </p>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-left max-w-xs w-full space-y-2.5 mb-6">
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-full bg-[#681841] text-white flex items-center justify-center font-bold text-[10px]">1</span>
            <span>Abre la cámara de tu celular</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-full bg-[#681841] text-white flex items-center justify-center font-bold text-[10px]">2</span>
            <span>Apunta al código QR de la mesa</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
            <span className="w-5 h-5 rounded-full bg-[#681841] text-white flex items-center justify-center font-bold text-[10px]">3</span>
            <span>Accede al menú interactivo</span>
          </div>
        </div>
      </div>
    );
  }

  const isWaiterCurrentlyCalled = table.waiterCall?.type === 'waiter';
  const isBillCurrentlyRequested = table.status === 'cuenta' || table.waiterCall?.type === 'bill';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col pb-36">
      
      {/* Brand & Table Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ChinmiLogo size="md" variant="icon" logoUrl={config.logoUrl} />
            <div>
              <h1 className="font-extrabold text-sm sm:text-base leading-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{config.businessName}</span>
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold text-[#681841] dark:text-pink-400">
                  📍 Mesa {table.number}
                </span>
                <span>·</span>
                <span>{table.zone}</span>
              </div>
            </div>
          </div>

          {/* Quick Top Actions: Call Waiter & Request Bill */}
          <div className="flex items-center gap-1.5">
            {canCallWaiter && (
              <button
                type="button"
                onClick={() => setIsCallWaiterModalOpen(true)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  isWaiterCurrentlyCalled
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 animate-pulse'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                }`}
                title="Llamar al mesero a la mesa"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Llamar Mesero</span>
              </button>
            )}

            {canRequestBill && (
              <button
                type="button"
                onClick={() => setIsRequestBillModalOpen(true)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  isBillCurrentlyRequested
                    ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 animate-pulse'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60 hover:bg-purple-100'
                }`}
                title="Pedir la cuenta"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pedir Cuenta</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-4 w-full space-y-4">
        
        {/* Active Waiter Call Banner */}
        {isWaiterCurrentlyCalled && (
          <div className="p-3.5 rounded-2xl bg-amber-500 text-white shadow-md flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-5 h-5 animate-bounce shrink-0" />
              <div>
                <p className="font-bold text-xs sm:text-sm">¡Mesero llamado a tu mesa!</p>
                <p className="text-[11px] text-amber-100">
                  Un camarero está en camino para atender la Mesa {table.number}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissWaiterCall(table.id)}
              className="px-2.5 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-700 text-[10px] font-bold text-white transition cursor-pointer"
            >
              Cancelar llamada
            </button>
          </div>
        )}

        {/* Active Bill Requested Banner */}
        {isBillCurrentlyRequested && (
          <div className="p-3.5 rounded-2xl bg-purple-600 text-white shadow-md flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CreditCard className="w-5 h-5 animate-pulse shrink-0" />
              <div>
                <p className="font-bold text-xs sm:text-sm">¡Cuenta solicitada!</p>
                <p className="text-[11px] text-purple-100">
                  El personal llevará el total a tu mesa. Total actual: {formatCOP(existingSubtotal)}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Success Alert Banner when order is submitted */}
        {orderSentSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-sm">¡Tu pedido fue recibido en cocina!</p>
              <p className="text-xs text-emerald-100">
                El equipo de cocina y barra ya comenzó a prepararlo para tu Mesa {table.number}.
              </p>
            </div>
          </div>
        )}

        {/* Temporary Waiter Call Notification */}
        {waiterCallSuccess && !isWaiterCurrentlyCalled && (
          <div className="p-3.5 rounded-2xl bg-amber-500 text-white shadow-md flex items-center gap-2.5 animate-in fade-in">
            <Check className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold">{waiterCallSuccess}</span>
          </div>
        )}

        {/* Temporary Bill Request Notification */}
        {billRequestSuccess && (
          <div className="p-3.5 rounded-2xl bg-purple-600 text-white shadow-md flex items-center gap-2.5 animate-in fade-in">
            <Check className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold">{billRequestSuccess}</span>
          </div>
        )}

        {/* Informative Banner for "Solo Ver Menú" mode */}
        {isMenuOnly && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/40 dark:to-rose-950/30 border border-pink-200 dark:border-pink-900/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#681841] text-white">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-slate-900 dark:text-white">
                  Carta Digital Informativa
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Explora nuestros platos y bebidas. Puedes llamar a tu mesero con el botón para tomar tu orden.
                </p>
              </div>
            </div>
            {canCallWaiter && (
              <button
                type="button"
                onClick={() => setIsCallWaiterModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#681841] hover:bg-[#571436] text-white font-bold text-xs shadow-xs shrink-0 cursor-pointer"
              >
                Llamar Mesero
              </button>
            )}
          </div>
        )}

        {/* Search & Category Filter Navigation */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar platos, bebidas, cócteles o ingredientes..."
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#681841]/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Smooth Scrollable Categories */}
          <CategoryScrollBar
            categories={config.categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>

        {/* Products List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{selectedCategory}</span>
              <span className="text-xs text-slate-400 font-normal">
                ({filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'})
              </span>
            </h3>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <UtensilsCrossed className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="font-bold text-xs text-slate-700 dark:text-slate-300">
                No encontramos productos con este criterio
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Prueba buscando otro término o seleccionando otra categoría.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredProducts.map((product) => {
                const isOutOfStock = product.stock <= 0;
                const inCartItem = cart.find(c => c.product.id === product.id);

                return (
                  <div
                    key={product.id}
                    className={`p-3 sm:p-3.5 rounded-3xl bg-white dark:bg-slate-900 border transition flex flex-col justify-between overflow-hidden relative group ${
                      isOutOfStock
                        ? 'opacity-65 border-slate-200 dark:border-slate-800'
                        : 'border-slate-200 dark:border-slate-800 shadow-xs hover:border-pink-300 dark:hover:border-pink-900 hover:shadow-md'
                    }`}
                  >
                    <div className="flex gap-3 items-start">
                      {/* Product Image Thumbnail */}
                      <div
                        onClick={() => openProductDetail(product)}
                        title="Toca para ver foto ampliada y detalles"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 relative cursor-pointer group/img border border-slate-200/60 dark:border-slate-700/60"
                      >
                        <img
                          src={product.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
                          }}
                        />
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-1 text-center">
                            <span className="text-[10px] font-black text-rose-300 uppercase tracking-wider">Agotado</span>
                          </div>
                        )}
                        <div className="absolute bottom-1 right-1 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 rounded-md p-1 text-white">
                          <Eye className="w-3 h-3" />
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider block truncate">
                              {product.category}
                            </span>
                          </div>
                          <h4
                            onClick={() => openProductDetail(product)}
                            className="font-bold text-sm text-slate-900 dark:text-white leading-snug cursor-pointer hover:text-[#681841] dark:hover:text-pink-300 transition-colors line-clamp-2 mt-0.5"
                          >
                            {product.name}
                          </h4>
                          {product.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {product.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-2">
                          <span className="font-mono font-black text-sm text-[#681841] dark:text-pink-300">
                            {formatCOP(product.price)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar for Product */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-slate-400">
                        {isOutOfStock ? (
                          <span className="text-rose-500 font-bold">Agotado hoy</span>
                        ) : (
                          'Disponible'
                        )}
                      </span>

                      {/* If canOrder is active, allow adding to cart */}
                      {canOrder ? (
                        <div className="flex items-center gap-1.5">
                          {inCartItem ? (
                            <div className="flex items-center gap-1 bg-pink-50 dark:bg-pink-950/60 p-1 rounded-xl border border-pink-200 dark:border-pink-900">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = cart.findIndex(c => c.product.id === product.id);
                                  if (idx > -1) handleUpdateCartQuantity(idx, -1);
                                }}
                                className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-100"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center font-bold text-xs text-[#681841] dark:text-pink-300">
                                {inCartItem.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className="w-6 h-6 rounded-lg bg-[#681841] text-white flex items-center justify-center shadow-xs hover:bg-[#571436]"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemForNote(product);
                                  setItemNoteText('');
                                }}
                                disabled={isOutOfStock}
                                title="Añadir nota especial (ej. sin cebolla)"
                                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                disabled={isOutOfStock}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#681841] hover:bg-[#571436] disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Añadir</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* In Menu Only Mode, show clean badge */
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          className="text-[11px] font-semibold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-900 px-2.5 py-1 rounded-lg hover:bg-pink-100 transition cursor-pointer"
                        >
                          Ver detalle
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Existing Consumption Summary on this Table */}
        {existingItemsCount > 0 && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#681841] dark:text-pink-400" />
                <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Consumo Acumulado en Mesa {table.number}
                </h4>
              </div>
              <span className="font-mono font-black text-sm text-[#681841] dark:text-pink-300">
                {formatCOP(existingSubtotal)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {existingOrder?.items.map((it) => (
                <div key={it.id} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-5 text-center">
                      {it.quantity}x
                    </span>
                    <div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {it.name}
                      </span>
                      {it.notes && (
                        <p className="text-[10px] text-pink-600 dark:text-pink-400 italic">
                          Nota: {it.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {formatCOP(it.unitPrice * it.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Request Bill Button in summary */}
            {canRequestBill && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsRequestBillModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pedir la Cuenta a la Mesa</span>
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Floating Bottom Sticky Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 p-3 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          
          {/* If ordering is enabled and there are items in cart */}
          {canOrder && cartItemsCount > 0 ? (
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#681841] hover:bg-[#571436] text-white font-extrabold text-sm shadow-md shadow-[#681841]/25 flex items-center justify-between transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xs">
                  {cartItemsCount}
                </div>
                <span>Ver Mi Pedido ({cartItemsCount})</span>
              </div>
              <span className="font-mono font-black">{formatCOP(cartSubtotal)}</span>
            </button>
          ) : (
            /* If no items in cart or in menuOnly mode: Provide prominent Waiter & Bill buttons */
            <div className="flex-1 grid grid-cols-2 gap-2">
              {canCallWaiter && (
                <button
                  type="button"
                  onClick={() => setIsCallWaiterModalOpen(true)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer shadow-xs ${
                    isWaiterCurrentlyCalled
                      ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/70 hover:bg-amber-100'
                  }`}
                >
                  <BellRing className="w-4 h-4" />
                  <span>Llamar al Mesero</span>
                </button>
              )}

              {canRequestBill && (
                <button
                  type="button"
                  onClick={() => setIsRequestBillModalOpen(true)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer shadow-xs ${
                    isBillCurrentlyRequested
                      ? 'bg-purple-100 text-purple-900 border-purple-300 animate-pulse'
                      : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900/70 hover:bg-purple-100'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pedir la Cuenta</span>
                </button>
              )}
            </div>
          )}

          {/* If ordering is active with cart, keep quick icon for calling waiter as well */}
          {canOrder && cartItemsCount > 0 && canCallWaiter && (
            <button
              type="button"
              onClick={() => setIsCallWaiterModalOpen(true)}
              title="Llamar al mesero"
              className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 transition cursor-pointer shrink-0"
            >
              <BellRing className="w-5 h-5" />
            </button>
          )}

        </div>
      </div>

      {/* MODAL 1: CALL WAITER */}
      {isCallWaiterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <BellRing className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Llamar al Mesero
                </h4>
              </div>
              <button
                onClick={() => setIsCallWaiterModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              ¿En qué podemos ayudarte en tu <strong>Mesa {table.number}</strong>?
            </p>

            <div className="space-y-2">
              {[
                'Tomar pedido en la mesa',
                'Cubiertos, servilletas o sal',
                'Pregunta sobre la carta o alérgenos',
                'Limpiar o acondicionar la mesa',
                'Otra consulta'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setWaiterCallReason(reason)}
                  className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold border transition cursor-pointer flex items-center justify-between ${
                    waiterCallReason === reason
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{reason}</span>
                  {waiterCallReason === reason && (
                    <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCallWaiterModalOpen(false)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCallWaiter}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Confirmar y Llamar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST BILL */}
      {isRequestBillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Pedir la Cuenta · Mesa {table.number}
                </h4>
              </div>
              <button
                onClick={() => setIsRequestBillModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {existingItemsCount > 0 ? (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                  Total de tu consumo:
                </span>
                <span className="font-mono font-black text-base text-[#681841] dark:text-pink-300">
                  {formatCOP(existingSubtotal)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Avisaremos al mesero para que lleve la cuenta a tu mesa.
              </p>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                ¿Cómo prefieres pagar?
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('tarjeta')}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'tarjeta'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-[10px]">Tarjeta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('efectivo')}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'efectivo'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span className="text-[10px]">Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodChoice('transferencia')}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethodChoice === 'transferencia'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span className="text-[10px]">Transferencia</span>
                </button>
              </div>
            </div>

            {paymentMethodChoice === 'efectivo' && (
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  ¿Con cuánto billete pagarás? (Opcional, para el cambio)
                </label>
                <input
                  type="text"
                  value={cashAmountNote}
                  onChange={(e) => setCashAmountNote(e.target.value)}
                  placeholder="Ej. $50.000 o $100.000"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsRequestBillModalOpen(false)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRequestBill}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Solicitar la Cuenta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && canOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#681841] dark:text-pink-400" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Mi Pedido · Mesa {table.number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Name Input (optional) */}
            <div className="px-4 pt-3 pb-1 border-b border-slate-100 dark:border-slate-800">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                <User className="w-3.5 h-3.5" />
                <span>Tu nombre o comensal (Opcional):</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan, María, Carlos..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
              />
            </div>

            {/* Items in Cart */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {cart.map((item, idx) => (
                  <div key={`${item.product.id}-${idx}`} className="py-2.5 flex items-center justify-between gap-3">
                    {/* Item Image Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
                      <img
                        src={item.product.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {item.product.name}
                      </h5>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {formatCOP(item.product.price)} c/u
                      </span>
                      {item.notes && (
                        <p className="text-[10px] text-pink-600 dark:text-pink-400 italic truncate">
                          Nota: {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQuantity(idx, -1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQuantity(idx, 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 ml-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* Drawer Footer & Send Button */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-500">Total a pedir:</span>
                <span className="font-mono font-black text-lg text-slate-900 dark:text-white">
                  {formatCOP(cartSubtotal)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSendOrder}
                className="w-full py-3 px-4 rounded-2xl bg-[#681841] hover:bg-[#571436] text-white font-extrabold text-sm shadow-md shadow-[#681841]/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Pedido Directo a Cocina</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Item Custom Note Modal */}
      {activeItemForNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Nota para {activeItemForNote.name}
              </h4>
              <button
                onClick={() => setActiveItemForNote(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={3}
              value={itemNoteText}
              onChange={(e) => setItemNoteText(e.target.value)}
              placeholder="Ej. Sin cebolla, término medio, hielo aparte..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#681841]/50"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveItemForNote(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAddToCart(activeItemForNote, itemNoteText);
                  setActiveItemForNote(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-[#681841] text-white font-bold text-xs shadow-xs"
              >
                Añadir al Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISH PHOTO & DETAIL MODAL */}
      {selectedProductForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Dish Image Banner */}
            <div className="relative h-56 sm:h-64 w-full bg-slate-100 dark:bg-slate-800">
              <img
                src={selectedProductForDetail.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80'}
                alt={selectedProductForDetail.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
              
              <button
                type="button"
                onClick={() => setSelectedProductForDetail(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute bottom-3 left-4 right-4 text-white">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-pink-600/90 backdrop-blur-xs inline-block mb-1">
                  {selectedProductForDetail.category}
                </span>
                <h3 className="text-xl font-black leading-tight drop-shadow-sm">
                  {selectedProductForDetail.name}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Precio unitario
                </span>
                <span className="font-mono font-black text-xl text-[#681841] dark:text-pink-300">
                  {formatCOP(selectedProductForDetail.price)}
                </span>
              </div>

              {selectedProductForDetail.description ? (
                <div>
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Descripción e Ingredientes
                  </h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    {selectedProductForDetail.description}
                  </p>
                </div>
              ) : null}

              {selectedProductForDetail.stock <= 0 ? (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold border border-rose-200 dark:border-rose-900 text-center">
                  Este producto se encuentra temporalmente agotado.
                </div>
              ) : canOrder ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Instrucciones o nota especial (Opcional):
                    </label>
                    <input
                      type="text"
                      value={detailNotes}
                      onChange={(e) => setDetailNotes(e.target.value)}
                      placeholder="Ej. Sin picante, término 3/4, salsa aparte..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cantidad:
                    </span>
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold shadow-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold text-xs text-slate-900 dark:text-white">
                        {detailQuantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailQuantity(detailQuantity + 1)}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold shadow-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900/60 text-center">
                  <p className="text-xs font-bold text-[#681841] dark:text-pink-300">
                    Modo Carta y Menú Digital
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Para ordenar este plato, indícaselo a tu mesero cuando tome tu comanda.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedProductForDetail(null)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cerrar
              </button>

              {canOrder && selectedProductForDetail.stock > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    for (let i = 0; i < detailQuantity; i++) {
                      handleAddToCart(selectedProductForDetail, detailNotes);
                    }
                    setSelectedProductForDetail(null);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-2xl bg-[#681841] hover:bg-[#571436] text-white font-extrabold text-xs shadow-md shadow-[#681841]/20 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    Añadir al pedido · {formatCOP(selectedProductForDetail.price * detailQuantity)}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
