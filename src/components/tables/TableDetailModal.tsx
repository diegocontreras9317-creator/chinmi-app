import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Table, Product, TableStatus } from '../../types';
import { formatCOP } from '../../utils/currency';
import { auth, db } from '../../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import {
  saveTableToFirestore,
  saveOrderToFirestore
} from '../../services/firestoreUserStorage';
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
  CheckCircle2
} from 'lucide-react';
import { CategoryScrollBar } from '../common/CategoryScrollBar';
import { TableQrModal } from './TableQrModal';

interface TableDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  onOpenCheckout: () => void;
}

export const TableDetailModal: React.FC<TableDetailModalProps> = ({
  isOpen,
  onClose,
  table,
  onOpenCheckout
}) => {
  const { user } = useAuth();
  const {
    config,
    products,
    addItemToOrder,
    updateOrderItemQuantity,
    removeOrderItem,
    updateOrderModifiers,
    setTableStatus,
    setCustomerViewTableId,
    dismissWaiterCall
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas las categorías');
  const [activeItemNoteId, setActiveItemNoteId] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'order'>('catalog');
  const [isSavingFirebase, setIsSavingFirebase] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [lastAddedToast, setLastAddedToast] = useState<string | null>(null);

  const handleSaveAndUpdateComanda = async () => {
    setIsSavingFirebase(true);
    setSaveSuccessMsg(null);

    const activeUid = auth.currentUser?.uid || user?.id;
    if (!activeUid) {
      alert('Error crítico de Firebase: No hay sesión activa de usuario.');
      setIsSavingFirebase(false);
      return;
    }

    if (!table) {
      alert('Error crítico de Firebase: No se encontró la mesa.');
      setIsSavingFirebase(false);
      return;
    }

    const currentOrder = table.order;
    if (!currentOrder || !currentOrder.id) {
      alert('Error crítico de Firebase: No hay consumos en la comanda para guardar.');
      setIsSavingFirebase(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const orderToSave = {
      ...currentOrder,
      userId: activeUid,
      lastUpdatedAt: nowIso
    };

    const tableToSave = {
      ...table,
      status: (table.status === 'libre' && currentOrder.items.length > 0 ? 'ocupada' : table.status) as TableStatus,
      order: orderToSave,
      updatedAt: nowIso,
      userId: activeUid
    };

    try {
      // 1. Guardado explícito en la nube:
      // collection(db, 'users', auth.currentUser.uid, 'pedidos')
      await setDoc(doc(db, 'users', activeUid, 'pedidos', currentOrder.id), orderToSave, { merge: true });

      // Actualizar también la mesa en Firestore
      await setDoc(doc(db, 'users', activeUid, 'mesas', table.id), tableToSave, { merge: true });

      // 2. Alertas visuales para depuración (Muy Importante):
      alert('Pedido enviado correctamente a la caja');
      setSaveSuccessMsg('¡Comanda guardada y actualizada en Firebase!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);

      // 3. Eliminación de estado fantasma:
      // No se guarda nada en localStorage.
      // La lista de pedidos en pantalla se actualiza automáticamente con onSnapshot.
    } catch (error: any) {
      console.error('Error al guardar comanda en Firebase:', error);
      alert('Error crítico de Firebase: ' + (error?.message || String(error)));
    } finally {
      setIsSavingFirebase(false);
    }
  };

  if (!isOpen) return null;

  const order = table.order;
  const items = order?.items || [];

  // Filter products for catalog
  const filteredProducts = products.filter(prod => {
    const matchesCategory = selectedCategory === 'Todas las categorías' || prod.category === selectedCategory;
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          prod.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculation in real time
  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const discountPercent = order?.discountPercent || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableBase = subtotal - discountAmount;
  const taxPercent = order?.taxPercent ?? config.defaultTaxRate;
  const taxAmount = taxableBase * (taxPercent / 100);
  const tipAmount = order?.tipAmount || 0;
  const total = taxableBase + taxAmount + tipAmount;

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
                    <Clock className="w-3 h-3 text-[#e64980]" />
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
            <div className="hidden sm:flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleStatusChange('libre')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  table.status === 'libre'
                    ? 'bg-emerald-500 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Libre
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('ocupada')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  table.status === 'ocupada'
                    ? 'bg-red-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Ocupada
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('cuenta')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  table.status === 'cuenta'
                    ? 'bg-purple-600 text-white shadow-xs font-bold'
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
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-pink-200 dark:border-pink-900/60 bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-[#681841] dark:text-pink-300 text-xs font-bold transition cursor-pointer shrink-0"
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
                            {product.category}
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
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-orange-500" />
                <span>Cuenta en Vivo</span>
              </span>
              <span className="text-xs font-mono font-semibold text-slate-500">
                {items.length} líneas
              </span>
            </div>

            {/* Items List in Order */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
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
                items.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {formatCOP(item.unitPrice, false)} / ud
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                            Nota: {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Quantity Stepper & Price */}
                      <div className="flex items-center gap-2 shrink-0">
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

                        <span className="w-20 text-right font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {formatCOP(item.quantity * item.unitPrice, false)}
                        </span>

                        <button
                          type="button"
                          onClick={() => removeOrderItem(table.id, item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Eliminar línea"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
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
                <div className="flex justify-between text-[11px]">
                  <span>Impuesto ({taxPercent}%):</span>
                  <span className="font-mono">{new Intl.NumberFormat('es-CO').format(Math.round(taxAmount))} {config.currency}</span>
                </div>
                {tipAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Propina voluntaria:</span>
                    <span className="font-mono">+{new Intl.NumberFormat('es-CO').format(Math.round(tipAmount))} {config.currency}</span>
                  </div>
                )}
              </div>

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
                    disabled={isSavingFirebase || items.length === 0}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#681841] to-[#e64980] hover:from-[#571436] hover:to-[#d6336c] text-white text-xs font-extrabold shadow-md shadow-pink-500/20 transition cursor-pointer disabled:opacity-40 w-full sm:w-auto"
                    title="Guardar comanda y sincronizar inmediatamente con Firebase"
                  >
                    {isSavingFirebase ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-white shrink-0" />
                        <span>Guardar y Actualizar Comanda</span>
                      </>
                    )}
                  </button>

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
                      onClick={onOpenCheckout}
                      disabled={items.length === 0}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cobrar</span>
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
    </div>
  );
};
